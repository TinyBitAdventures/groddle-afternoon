/**
 * G1190 (Austin 2026-11-23: "make house floors shared as in Glitch", reversing
 * his 2026-11-10 ruling that kept the house, back yard and Tower private): a
 * stack dropped in a player's house (with its back yard) or on a floor of their
 * Tower online is everyone's there, as on their home street (report #173,
 * tests/home-street-drops.test.js). In the original the house and Tower were
 * locations like the street: takeable_drop and takeable_pickup (GameServerJS
 * items/include/takeable.js 5-51, 157-213) ran there, the dropper's 100 px
 * guard and the first pickup, owner, key-holder or visitor alike. The one home
 * rule, house_lock (33-36, 179-198; main.js doModifyItem 4870-4891), locked
 * to the owner what the owner set on a furniture plat in their house or Tower.
 *
 * Ours: what the owner sets down in Decoration Mode stays in the owner's save,
 * locked to them, and visitors see it (the site's Neighbours::stackRows) with
 * Pick up greyed, as they see the owner's stacks dropped there before G1190
 * (kept, never moved). In the house x is kept from the house's left end; a
 * Tower floor keeps its own x. An upper floor of the house stays private.
 * The server's side is drops_test.go (TestAHousesAndATowerFloorsDropsAreShared).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homePlaceOf, isSharedStreet, shareReason } from '../public/js/drops-mp.js?v=6a16d73d';
import { dropsMpFeature } from '../public/js/features/drops-mp-feature.js?fresh=housedrops';
import { homeStreetMpFeature } from '../public/js/features/home-street-mp-feature.js?v=7e88d35f';
import { neighboursMpFeature } from '../public/js/features/neighbours-mp-feature.js?v=b1fbcb5a';
import { OWNER_STACK_TEXT, isOwnerStackId, normalizeHomeView, normalizeOwnerStacks, ownerStacksFor, sharedHomeStreet } from '../public/js/neighbours-mp.js?v=e912be37';
import { GAME_DIR, HAS_SERVER, HAS_SITE, SITE_DIR, serverPath } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const OP = 'drop-00000000000000c1';
const OP2 = 'drop-00000000000000c2';
const TABLE = { items: { cherry: { food: true }, musicblock_d_green_01: {}, note: {} }, untradeable: {} };
const MB = 'musicblock_d_green_01';

describe('where a drop is everyone\'s at a home', () => {
  it('the house and each Tower floor are shared places, beside the home street', () => {
    assert.deepEqual(homePlaceOf('HOME_7'), { owner: 7, room: 'street', floor: 0 });
    assert.deepEqual(homePlaceOf('HOUSE_7'), { owner: 7, room: 'interior', floor: 0 });
    assert.deepEqual(homePlaceOf('TOWER_7_3'), { owner: 7, room: 'tower', floor: 3 });
    for (const s of ['', 'HOUSE_07', 'HOUSE_', 'TOWER_7', 'TOWER_7_10', 'TOWER_0_1', 'PARTY_7', 'MPH_7_IN', 'RH_HOME_INT']) assert.equal(homePlaceOf(s), null, s);
    for (const s of ['HOUSE_7', 'TOWER_7_0', 'TOWER_7_9']) assert.equal(isSharedStreet(s), true, s);
    assert.equal(shareReason(MB, TABLE, { street: 'HOUSE_7' }), '', 'a visitor in the house');
    assert.equal(shareReason(MB, TABLE, { street: 'TOWER_7_2', ownHome: true }), '', 'the owner on a Tower floor');
    assert.equal(shareReason('cherry', TABLE, { street: 'HOUSE_7', ownHome: true, herdFood: true }), '', 'the owner\'s food in the house is shared: no herd lives there');
    assert.equal(shareReason('note', TABLE, { street: 'HOUSE_7' }), 'note');
  });

  it('the realtime street of the house is HOUSE_<owner> and of a Tower floor TOWER_<owner>_<floor>, for the owner and a visitor', () => {
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior' }), 'HOUSE_7');
    assert.equal(sharedHomeStreet({ visit: { owner: 7, room: 'interior' }, me: 9 }), 'HOUSE_7');
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', ownTowerFloor: 2 }), 'TOWER_7_2');
    assert.equal(sharedHomeStreet({ visit: { owner: 7, room: 'tower', floor: 2 }, me: 9 }), 'TOWER_7_2');
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', towerFloor: true }), '', 'an upper floor of the house has no street');
  });
});

/** A realtime client as the feature sees it (js/realtime-client.js on/send). */
function fakeClient() {
  const handlers = {};
  return {
    state: 'online',
    street: 'HOUSE_7',
    sent: [],
    on(ev, fn) { (handlers[ev] ||= []).push(fn); return () => {}; },
    send(kind, payload) { this.sent.push([kind, payload]); return true; },
    emit(ev, msg) { for (const fn of handlers[ev] || []) fn(msg); },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 30));

describe('the feature in the house and on a Tower floor', () => {
  const client = fakeClient();
  const applied = new Set();
  /** What home-street-mp-feature answers: the home place stood in. */
  let origin = { owner: 7, room: 'interior', floor: 0, houseX: 750, own: true };
  const own = [];
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'RH_HOME_INT',
    dropTsid: 'RH_HOME_INT',
    inv: { [MB]: 2, cherry: 5 },
    player: { x: 900, y: 620 },
    query(hook, op) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'homeDropOrigin') return origin;
      if (hook === 'ledgerReceipt') {
        if (applied.has(op)) return false;
        applied.add(op);
        return true;
      }
      return null;
    },
    dropWorldStack: (c, n, x, y) => { own.push({ c, n, x, y }); return { ok: true }; },
    redrawDroppedStacks: () => {},
    setData: () => {},
    toast: () => {},
    pushActivity: () => {},
    playSound: () => {},
    floatText: () => {},
    refreshPack: () => {},
    save: () => {},
  };

  before(async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/' };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.fetch = async (url) => {
      const body = String(url).includes('trade-items.json') ? TABLE : { drops: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
    };
    dropsMpFeature.init(engine);
    dropsMpFeature.onTick(16, 0, engine);
    await tick();
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.GRODDLE_MP_BOOT;
    delete globalThis.fetch;
    delete globalThis.groddleDrops;
  });

  it('the owner\'s Drop in their house goes to the server with the house\'s left end, and leaves the pack on its answer', async () => {
    assert.equal(dropsMpFeature.sharedDropPrompt(MB, engine), 'Drop it on the ground.');
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: MB, count: 1, x: 920, y: 620 }, engine), true);
    await tick();
    const [kind, sent] = client.sent.at(-1);
    assert.equal(kind, 'ground_drop');
    assert.deepEqual([sent.x, sent.y, sent.ox], [920, 620, 750]);
    assert.equal(engine.inv[MB], 2, 'still in the pack');
    client.emit('msg:ground_dropped', { op: OP, ref: sent.ref, status: 'settled', stack: { id: OP, c: MB, n: 1, x: 170, y: 620, by: { id: 7, name: 'Ada' }, at: 1 } });
    assert.equal(engine.inv[MB], 1, 'gone from the pack once');
    assert.equal(own.length, 0, 'not kept as the owner\'s own');
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [{ id: OP, c: MB, n: 1, x: 170, y: 620, by: { id: 7, name: 'Ada' }, at: 1 }] });
    const list = dropsMpFeature.sharedDroppedStacks('RH_HOME_INT', engine);
    assert.equal(list.length, 1);
    assert.equal(list[0].x, 920, 'drawn where it was dropped');
    // The owner's food is shared indoors: no herd eats there.
    assert.equal(dropsMpFeature.sharedDropPrompt('cherry', engine), 'Drop it on the ground.');
  });

  it('a visitor in the house sees the owner\'s stack beside the house as their game draws it, and picks it up through the server', () => {
    engine.streetTsid = 'MPH_7_IN';
    engine.dropTsid = 'MPH_7_IN';
    origin = { owner: 7, room: 'interior', floor: 0, houseX: 1050, own: false };
    const list = dropsMpFeature.sharedDroppedStacks('MPH_7_IN', engine);
    assert.equal(list[0].x, 1220, 'x from the house at 1050');
    assert.equal(dropsMpFeature.sharedDroppedStacks('RH_HOME_INT', engine), null, 'not under another place\'s name');
    assert.equal(dropsMpFeature.sharedPickup({ state: list[0] }, engine, 1), true);
    assert.deepEqual(client.sent.at(-1), ['ground_pickup', { id: OP, ox: 1050 }]);
    client.emit('msg:ground_taken', { op: `${OP}-t`, id: OP, status: 'settled', item: { c: MB, n: 1 } });
    assert.equal(engine.inv[MB], 2);
  });

  it('a Tower floor is shared with its own x, and only the floor the scene shows', async () => {
    client.street = 'TOWER_7_2';
    engine.streetTsid = 'RH_HOME_INT';
    engine.dropTsid = 'RH_HOME_TOWER_2';
    origin = { owner: 7, room: 'tower', floor: 2, houseX: 0, own: true };
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: MB, count: 1, x: 500, y: 620 }, engine), true);
    await tick();
    const sent = client.sent.at(-1)[1];
    assert.equal(client.sent.at(-1)[0], 'ground_drop');
    assert.equal(sent.ox, undefined, 'a Tower floor sends no origin');
    client.emit('msg:ground_dropped', { op: OP2, ref: sent.ref, status: 'settled', stack: { id: OP2, c: MB, n: 1, x: 500, y: 620, by: { id: 7, name: 'Ada' }, at: 2 } });
    client.emit('msg:ground_state', { street: 'TOWER_7_2', stacks: [{ id: OP2, c: MB, n: 1, x: 500, y: 620, by: { id: 7, name: 'Ada' }, at: 2 }] });
    assert.equal(dropsMpFeature.sharedDroppedStacks('RH_HOME_TOWER_2', engine)[0].x, 500);
    assert.equal(dropsMpFeature.sharedDroppedStacks('RH_HOME_INT', engine), null, 'not drawn in the house');
    origin = { owner: 7, room: 'tower', floor: 3, houseX: 0, own: true };
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: MB, count: 1, x: 500, y: 620 }, engine), null, 'the server\'s floor and the scene\'s must agree');
  });

  it('an upper floor of the house, or a home scene that is not this one, keeps drops the player\'s own', () => {
    client.street = 'HOUSE_7';
    engine.dropTsid = 'RH_HOME_FLOOR_1';
    origin = null; // homeDropOrigin: an upper floor of the house is no home place
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: MB, count: 1, x: 0, y: 0 }, engine), null);
    origin = { owner: 8, room: 'interior', floor: 0, houseX: 750, own: false };
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: MB, count: 1, x: 0, y: 0 }, engine), null, 'someone else\'s house');
    origin = { owner: 7, room: 'street', floor: 0, houseX: 750, own: true };
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: MB, count: 1, x: 0, y: 0 }, engine), null, 'the street scene in the house\'s street');
  });
});

describe('what the owner keeps in their own save, seen by a visitor', () => {
  const view = normalizeHomeView({
    owner: { id: 7, name: 'Ada' },
    home: { owned: true, style: 'meadow' },
    stacks: [
      { id: 'world-item-4', place: 'house', c: MB, n: 2, x: 150, y: 620 },
      { id: 'world-item-5', place: 'house', c: 'cherry', n: 1, x: -300, y: 500, on: 3 },
      { id: 'world-item-6', place: 'tower:2', c: 'cherry', n: 4, x: 500, y: 620 },
      { id: 'bad id', place: 'house', c: 'cherry', n: 1, x: 1, y: 1 },
      { id: 'w7', place: 'street', c: 'cherry', n: 1, x: 1, y: 1 },
      { id: 'w8', place: 'house', c: 'cherry', n: 0, x: 1, y: 1 },
    ],
  });

  it('the site\'s rows are checked', () => {
    assert.deepEqual(view.stacks.map((r) => r.id), ['world-item-4', 'world-item-5', 'world-item-6']);
    assert.equal(view.stacks[1].on, 3);
    assert.deepEqual(normalizeOwnerStacks(null), []);
  });

  it('in the house they lie from the house\'s left end as the visitor\'s game draws it; on a Tower floor at its own x', () => {
    const house = ownerStacksFor(view, 'interior', { roomX: 1050, tsid: 'MPH_7_IN' });
    assert.deepEqual(house.map((s) => [s.classTsid, s.count, s.x, s.y]), [[MB, 2, 1200, 620], ['cherry', 1, 750, 500]]);
    assert.ok(house.every((s) => isOwnerStackId(s.id) && s.streetTsid === 'MPH_7_IN'));
    assert.equal(house[0].subtitle, 'Dropped by Ada · 2 in this pile');
    const floor = ownerStacksFor(view, 'tower', { floor: 2, roomX: 1050 });
    assert.deepEqual(floor.map((s) => [s.classTsid, s.x]), [['cherry', 500]]);
    assert.deepEqual(ownerStacksFor(view, 'tower', { floor: 1 }), []);
    assert.deepEqual(ownerStacksFor(view, 'street'), [], 'the home street is not this list\'s');
  });

  it('Pick up is greyed with the source\'s line, and no other way takes it', () => {
    const [stack] = ownerStacksFor(view, 'interior', { roomX: 1050 });
    const target = { classId: 'dropped_item', state: { id: stack.id, classTsid: stack.classTsid, count: stack.count }, worldItemId: stack.id };
    const verbs = [{ id: 'pickup', label: 'pick up', enabled: true }, { id: 'examine', label: 'examine', enabled: true }];
    const out = neighboursMpFeature.decorateVerbs(target, verbs);
    assert.deepEqual(out[0], { id: 'pickup', label: 'pick up', enabled: false, reason: 'You are not allowed to pick this up.' });
    assert.deepEqual(out[1], verbs[1]);
    assert.equal(neighboursMpFeature.groundPickupRefused(target), OWNER_STACK_TEXT.locked);
    // A shared stack or a player's own is left alone.
    const shared = { classId: 'dropped_item', state: { id: OP, classTsid: MB, count: 1 } };
    assert.equal(neighboursMpFeature.decorateVerbs(shared, verbs), null);
    assert.equal(neighboursMpFeature.groundPickupRefused(shared), null);
  });

  it('the line is takeable.js\'s own', () => {
    const src = readFileSync(join(GAME_DIR, '..', 'glitch-GameServerJS', 'items', 'include', 'takeable.js'), 'utf8').split('\n');
    assert.match(src[32], /this\.house_lock && pc\.location\.pols_is_pol\(\) && !pc\.location\.pols_is_owner\(pc\)/);
    assert.ok(src[33].includes(`"${OWNER_STACK_TEXT.locked}"`));
  });
});

describe('solo', () => {
  it('home-street-mp-feature answers no home place in solo', () => {
    assert.equal(homeStreetMpFeature.homeDropOrigin({ mode: 'solo' }), null);
  });
});

describe('the server and the site', () => {
  it('drops.go shares the house and the Tower floors and names them for the site', { skip: HAS_SERVER ? false : 'no server checkout' }, () => {
    const go = readFileSync(serverPath('drops.go'), 'utf8');
    assert.match(go, /dropTowerSiteRe = regexp\.MustCompile\(`\^TOWER-\(\[1-9\]\[0-9\]\{0,17\}\)-\(\[0-9\]\)\$`\)/);
    assert.match(go, /func dropHomeOwner\(street string\) int64 \{\n\tif id, _ := homeOwner\(street\); id > 0 \{\n\t\treturn id\n\t\}\n\treturn towerOwner\(street\)\n\}/);
    assert.doesNotMatch(go, /The house, its back yard and the Tower's floors stay each player's own/);
  });

  const hasPhp = HAS_PHP;
  const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;
  it('the site takes HOUSE-<owner> and TOWER-<owner>-<floor> as drop streets', { skip: skipSite }, () => {
    const code = `require ${JSON.stringify(SITE_DIR)} . "/src/LedgerDrop.php"; use Groddle\\Minn\\LedgerDrop; echo json_encode([
      LedgerDrop::call(['op' => '${OP}', 'id' => 9, 'street' => 'HOUSE-7', 'x' => -300, 'y' => 620, 'item' => ['c' => 'cherry', 'n' => 1]])['street'] ?? null,
      LedgerDrop::call(['op' => '${OP}', 'id' => 9, 'street' => 'TOWER-123456789012345678-9', 'x' => 0, 'y' => 620, 'item' => ['c' => 'cherry', 'n' => 1]])['street'] ?? null,
    ]);`;
    assert.deepEqual(JSON.parse(execFileSync(PHP, ['-r', code]).toString()), ['HOUSE-7', 'TOWER-123456789012345678-9']);
  });

  it('the visit sends the owner\'s house and Tower stacks, x from the house', { skip: skipSite }, () => {
    const dropped = { streets: {
      RH_HOME_INT: [{ id: 'world-item-1', classTsid: MB, count: 2, x: 900, y: 620 }, { id: 'world-item-2', classTsid: 'cherry', count: 1, x: 800.4, y: 500, on: 3, contents: [{ classTsid: 'apple', count: 1 }] }, { id: 'bad id', classTsid: 'cherry', count: 1, x: 1, y: 1 }],
      RH_HOME_TOWER_2: [{ id: 'world-item-3', classTsid: 'cherry', count: 4, x: 500, y: 620 }],
      RH_HOME_EXT: [{ id: 'world-item-9', classTsid: 'cherry', count: 1, x: 1, y: 1 }],
      RH_HOME_FLOOR_1: [{ id: 'world-item-8', classTsid: 'cherry', count: 1, x: 1, y: 1 }],
    } };
    const code = `foreach (["WordFilter", "Neighbours"] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; echo json_encode(Groddle\\Minn\\Neighbours::stackRows(json_decode(${JSON.stringify(JSON.stringify(dropped))}), json_decode('{"houseX":750}')));`;
    const rows = JSON.parse(execFileSync(PHP, ['-r', code]).toString());
    assert.deepEqual(rows, [
      { id: 'world-item-1', place: 'house', c: MB, n: 2, x: 150, y: 620 },
      { id: 'world-item-2', place: 'house', c: 'cherry', n: 1, x: 50, y: 500, on: 3 },
      { id: 'world-item-3', place: 'tower:2', c: 'cherry', n: 4, x: 500, y: 620 },
    ]);
    assert.match(readFileSync(join(SITE_DIR, 'src', 'Neighbours.php'), 'utf8'), /'stacks' => self::stackRows\(self::savedEntry\(\$db, \$owner, 'droppedItems'\), self::feature\(\$theirs, 'homes'\)\)/);
  });
});

describe('G1190: a visitor sees the owner\'s stacks where the owner set them', () => {
  it('house and Tower visit scenes keep a stack\'s height instead of dropping it to the floor', () => {
    const game = readFileSync(join(GAME_DIR, 'public', 'game.js'), 'utf8');
    const fn = game.slice(game.indexOf('function restingStackY('), game.indexOf('function droppedStacksTsid('));
    const visit = /\/(\^MPH_[^/]+)\/\.test/.exec(fn);
    assert.ok(visit, 'restingStackY checks the visit scene tsid');
    const re = new RegExp(visit[1]);
    for (const t of ['MPH_42_IN', 'MPH_42_T0', 'MPH_42_T3']) assert.ok(re.test(t), t);
    for (const t of ['MPH_42', 'RH_HOME_EXT', 'LIF101']) assert.ok(!re.test(t), t);
    assert.ok(fn.indexOf(visit[0]) < fn.indexOf('stackRestY('), 'kept before the floor search');
  });
});
