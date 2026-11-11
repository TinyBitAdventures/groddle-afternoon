/**
 * Report #173 (Austin 2026-11-10: "Share drops on home streets: visitors' and
 * owners' drops are seen by everyone there, as on public streets"): a stack
 * dropped on a player's home street online is everyone's there, through the
 * same ledger calls as on a public street (register G332). In the original a
 * home street was a location like any other: takeable_drop and
 * takeable_pickup (GameServerJS items/include/takeable.js 5-51, 157-213) ran
 * there unchanged; the one home rule, house_lock (34-36, 179-198), is for
 * what the owner sets on furniture inside the house or Tower.
 *
 * Ours: the stack's x is kept from the house (the remake's home street grows
 * to the left and moves the house), the site keeps the street as HOME-<owner>
 * (its street names take no "_"), food the owner drops on their own home
 * street stays their own (their animals there eat from their own stacks), and
 * the house, its back yard and the Tower's floors stay each player's own.
 * The server's side is drops_test.go.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homeStreetOwner, isPublicStreet, isSharedStreet, normalizeGroundStack, shareReason, stackAt } from '../public/js/drops-mp.js?v=ec6a135d';
import { dropsMpFeature } from '../public/js/features/drops-mp-feature.js?fresh=homedrops';
import { homeStreetMpFeature } from '../public/js/features/home-street-mp-feature.js?v=afe2829e';
import { sharedHomeStreet } from '../public/js/neighbours-mp.js?v=fc5f0670';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath } from '../tools/repos.mjs';

const OP = 'drop-00000000000000a1';
const OP2 = 'drop-00000000000000a2';
const TABLE = { items: { cherry: { food: true }, musicblock_d_green_01: {}, note: {} }, untradeable: {} };

describe('where a drop is everyone\'s', () => {
  it('a home street is, beside public streets; a house, a Tower floor and the rest are not', () => {
    assert.equal(homeStreetOwner('HOME_7'), 7);
    for (const s of ['', 'LA5101HF7F429V', 'HOUSE_7', 'TOWER_7_0', 'HOME_0', 'HOME_7_x', 'XHOME_7', 'HOME_', 'PARTY_12', 'RACE_ab', 'CROWNS_1', 'MPH_7']) assert.equal(homeStreetOwner(s), 0, s);
    assert.equal(isSharedStreet('HOME_7'), true);
    assert.equal(isSharedStreet('LA5101HF7F429V'), true);
    assert.equal(isPublicStreet('HOME_7'), false, 'a home street is still no public street to anything else');
    for (const s of ['', 'HOUSE_7', 'TOWER_7_0', 'PARTY_12', 'RACE_ab']) assert.equal(isSharedStreet(s), false, s);
  });

  it('the realtime street of a home street is HOME_<owner> for the owner and a visitor alike', () => {
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'street' }), 'HOME_7');
    assert.equal(sharedHomeStreet({ visit: { owner: 7, room: 'street' }, me: 9 }), 'HOME_7');
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior' }), 'HOUSE_7');
  });

  it('shares a stack there under the game\'s own name for the place', () => {
    assert.equal(shareReason('musicblock_d_green_01', TABLE, { street: 'HOME_7', sceneKey: 'MPH_7', dropKey: 'MPH_7' }), '', 'a visitor');
    assert.equal(shareReason('musicblock_d_green_01', TABLE, { street: 'HOME_7', sceneKey: 'RH_HOME_EXT', dropKey: 'RH_HOME_EXT', ownHome: true }), '', 'the owner');
    assert.equal(shareReason('musicblock_d_green_01', TABLE, { street: 'HOUSE_7', sceneKey: 'MPH_7_IN', dropKey: 'MPH_7_IN' }), 'private', 'the house');
    assert.equal(shareReason('musicblock_d_green_01', TABLE, { street: 'TOWER_7_0', sceneKey: 'RH_HOME_INT', dropKey: 'RH_HOME_TOWER_0' }), 'private', 'a Tower floor');
    assert.equal(shareReason('note', TABLE, { street: 'HOME_7', sceneKey: 'MPH_7', dropKey: 'MPH_7' }), 'note');
    assert.equal(shareReason('trophy_egg_hunt', TABLE, { street: 'HOME_7', sceneKey: 'RH_HOME_EXT', dropKey: 'RH_HOME_EXT', ownHome: true }), 'type', 'a trophy set out at home stays the owner\'s own');
  });

  it('keeps the owner\'s own food on their own home street for their animals', () => {
    const own = { street: 'HOME_7', sceneKey: 'RH_HOME_EXT', dropKey: 'RH_HOME_EXT', ownHome: true };
    assert.equal(shareReason('cherry', TABLE, { ...own, herdFood: true }), 'herd');
    assert.equal(shareReason('cherry', TABLE, { ...own, herdFood: false }), '');
    assert.equal(shareReason('cherry', TABLE, { street: 'HOME_7', sceneKey: 'MPH_7', dropKey: 'MPH_7', herdFood: true }), '', 'a visitor\'s food is shared');
    assert.equal(shareReason('cherry', TABLE, { street: 'LA5101HF7F429V', ownHome: true, herdFood: true }), '', 'a public street is as it was');
  });

  it('draws a stack from the house\'s x', () => {
    const s = normalizeGroundStack({ id: OP, c: 'cherry', n: 3, x: -300, y: 850, by: { id: 9, name: 'Bo' } }, 'HOME_7');
    assert.equal(stackAt(s, 640).x, 340);
    assert.equal(stackAt(s, 640).y, 850);
    assert.equal(stackAt(s, 0), s);
    assert.equal(s.x, -300, 'the kept stack is not changed');
    assert.equal(stackAt(null, 640), null);
  });
});

/** A realtime client as the feature sees it (js/realtime-client.js on/send). */
function fakeClient() {
  const handlers = {};
  return {
    state: 'online',
    street: 'HOME_7',
    sent: [],
    on(ev, fn) { (handlers[ev] ||= []).push(fn); return () => {}; },
    send(kind, payload) { this.sent.push([kind, payload]); return true; },
    emit(ev, msg) { for (const fn of handlers[ev] || []) fn(msg); },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 30));

describe('the feature on a home street', () => {
  const client = fakeClient();
  const applied = new Set();
  /** What home-street-mp-feature answers: the home street stood on. */
  let origin = { owner: 7, houseX: 640, own: false };
  const own = [];
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'MPH_7',
    dropTsid: 'MPH_7',
    inv: { musicblock_d_green_01: 1, cherry: 5 },
    player: { x: 700, y: 870 },
    query(hook, op) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'homeStreetOrigin') return origin;
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

  it('a visitor sees the stacks lying on the home street, set from the house', () => {
    client.emit('msg:ground_state', { street: 'HOME_7', stacks: [{ id: OP, c: 'cherry', n: 3, x: -300, y: 850, by: { id: 7, name: 'Ada' }, at: 1 }] });
    const list = dropsMpFeature.sharedDroppedStacks('MPH_7', engine);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, OP);
    assert.equal(list[0].x, 340, 'x from the house at 640');
    assert.equal(list[0].shared, true);
    assert.equal(dropsMpFeature.sharedDroppedStacks('RH_HOME_EXT', engine), null, 'not under another place\'s name');
    // The house moved (the street grew): the same stack is drawn beside it still.
    origin = { owner: 7, houseX: 840, own: false };
    assert.equal(dropsMpFeature.sharedDroppedStacks('MPH_7', engine)[0].x, 540);
    origin = { owner: 7, houseX: 640, own: false };
  });

  it('a visitor\'s drop goes to the server with the house\'s x, and leaves the pack only on its answer', async () => {
    assert.equal(dropsMpFeature.sharedDropPrompt('musicblock_d_green_01', engine), 'Drop it on the ground.');
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'musicblock_d_green_01', count: 1, x: 772, y: 850 }, engine), true);
    await tick();
    const [kind, sent] = client.sent.at(-1);
    assert.equal(kind, 'ground_drop');
    assert.deepEqual(sent.item, { c: 'musicblock_d_green_01', n: 1 });
    assert.deepEqual([sent.x, sent.y, sent.ox], [772, 850, 640]);
    assert.equal(engine.inv.musicblock_d_green_01, 1, 'still in the pack');
    assert.equal(own.length, 0, 'not dropped as the player\'s own');
    client.emit('msg:ground_dropped', { op: OP2, ref: sent.ref, status: 'settled', stack: { id: OP2, c: 'musicblock_d_green_01', n: 1, x: 132, y: 850, by: { id: 9, name: 'Bo' }, at: 2 } });
    assert.equal(engine.inv.musicblock_d_green_01 || 0, 0, 'gone from the pack once');
    client.emit('msg:ground_added', { stack: { id: OP2, c: 'musicblock_d_green_01', n: 1, x: 132, y: 850, by: { id: 9, name: 'Bo' }, at: 2 } });
    const mine = dropsMpFeature.sharedDroppedStacks('MPH_7', engine).find((s) => s.id === OP2);
    assert.equal(mine.x, 772, 'drawn where it was dropped');
  });

  it('a pickup names the house\'s x too, and the stack enters the pack once', () => {
    const list = dropsMpFeature.sharedDroppedStacks('MPH_7', engine);
    const target = { state: list.find((s) => s.id === OP) };
    assert.equal(dropsMpFeature.sharedPickup(target, engine, 3), true);
    assert.deepEqual(client.sent.at(-1), ['ground_pickup', { id: OP, ox: 640 }]);
    assert.equal(engine.inv.cherry, 5, 'nothing until the server answers');
    client.emit('msg:ground_taken', { op: `${OP}-t`, id: OP, status: 'settled', item: { c: 'cherry', n: 3 } });
    client.emit('msg:ground_taken', { op: `${OP}-t`, id: OP, status: 'settled', item: { c: 'cherry', n: 3 } });
    assert.equal(engine.inv.cherry, 8, 'applied once');
    client.emit('msg:ground_gone', { id: OP, by: { id: 9, name: 'Bo' }, why: 'picked' });
    assert.equal(dropsMpFeature.sharedDroppedStacks('MPH_7', engine).some((s) => s.id === OP), false);
  });

  it('a server from before this answers "private": the drop is the player\'s own, as it was', async () => {
    engine.inv.musicblock_d_green_01 = 1;
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'musicblock_d_green_01', count: 1, x: 800, y: 850 }, engine), true);
    await tick();
    const sent = client.sent.at(-1)[1];
    client.emit('msg:ground_dropped', { ref: sent.ref, status: 'refused', why: 'private', text: 'Only a drop on a public street is shared.', stack: null });
    assert.equal(engine.inv.musicblock_d_green_01 || 0, 0);
    assert.deepEqual(own.at(-1), { c: 'musicblock_d_green_01', n: 1, x: 800, y: 850 });
  });

  it('the owner\'s drops are shared on their own home street, but their own food stays for their animals', async () => {
    engine.streetTsid = 'RH_HOME_EXT';
    engine.dropTsid = 'RH_HOME_EXT';
    origin = { owner: 7, houseX: 640, own: true };
    engine.inv.musicblock_d_green_01 = 1;
    const before = client.sent.length;
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'cherry', count: 2, x: 700, y: 850 }, engine), null, 'game.js drops it as the owner\'s own');
    assert.equal(dropsMpFeature.sharedDropPrompt('cherry', engine), null);
    assert.equal(client.sent.length, before);
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'musicblock_d_green_01', count: 1, x: 700, y: 850 }, engine), true);
    await tick();
    assert.equal(client.sent.at(-1)[0], 'ground_drop');
    assert.equal(client.sent.at(-1)[1].ox, 640);
    assert.equal(dropsMpFeature.sharedDroppedStacks('RH_HOME_EXT', engine).some((s) => s.id === OP2), true, 'the owner sees the visitor\'s stack');
  });

  it('nothing is shared in the house, on a Tower floor, or on someone else\'s home by mistake', () => {
    client.street = 'HOUSE_7';
    engine.streetTsid = 'RH_HOME_INT';
    engine.dropTsid = 'RH_HOME_INT';
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'musicblock_d_green_01', count: 1, x: 0, y: 0 }, engine), null);
    assert.equal(dropsMpFeature.sharedDroppedStacks('RH_HOME_INT', engine), null);
    client.street = 'TOWER_7_0';
    engine.dropTsid = 'RH_HOME_TOWER_0';
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'musicblock_d_green_01', count: 1, x: 0, y: 0 }, engine), null);
    // The server's street and the scene must be the same home.
    client.street = 'HOME_8';
    engine.streetTsid = 'MPH_7';
    engine.dropTsid = 'MPH_7';
    origin = { owner: 7, houseX: 640, own: false };
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'musicblock_d_green_01', count: 1, x: 0, y: 0 }, engine), null);
    origin = null;
    client.street = 'HOME_7';
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'musicblock_d_green_01', count: 1, x: 0, y: 0 }, engine), null, 'no home scene, no shared drop');
  });
});

describe('solo', () => {
  it('home-street-mp-feature answers no origin in solo', () => {
    assert.equal(homeStreetMpFeature.homeStreetOrigin({ mode: 'solo' }), null);
  });
});

describe('the server and the site', () => {
  it('drops.go shares HOME_<owner> and keeps the rest private', { skip: HAS_SERVER ? false : 'no server checkout' }, () => {
    const go = readFileSync(serverPath('drops.go'), 'utf8');
    assert.match(go, /dropHomeRe\s+= regexp\.MustCompile\(`\^HOME_\(\[1-9\]\[0-9\]\{0,17\}\)\$`\)/);
    assert.match(go, /func dropShared\(street string\) bool \{ return !followPrivate\(street\) \|\| dropHomeOwner\(street\) > 0 \}/);
    assert.match(go, /dropHomeOwner\(s\.Street\) != s\.By/, 'the owner\'s own stacks stay on their home street');
  });

  const hasPhp = spawnSync('php', ['-v']).status === 0;
  it('the site takes a home street as HOME-<owner>', { skip: !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false }, () => {
    const code = `require ${JSON.stringify(SITE_DIR)} . "/src/LedgerDrop.php"; use Groddle\\Minn\\LedgerDrop; echo json_encode([
      LedgerDrop::call(['op' => '${OP}', 'id' => 9, 'street' => 'HOME-7', 'x' => -300, 'y' => 850, 'item' => ['c' => 'cherry', 'n' => 1]]),
      LedgerDrop::call(['op' => '${OP}', 'id' => 9, 'street' => 'HOME_7', 'x' => -300, 'y' => 850, 'item' => ['c' => 'cherry', 'n' => 1]]),
    ]);`;
    const [ok, bad] = JSON.parse(execFileSync('php', ['-r', code]).toString());
    assert.deepEqual(ok, { op: OP, id: 9, street: 'HOME-7', x: -300, y: 850, c: 'cherry', n: 1, r: null });
    assert.equal(bad, null);
  });
});
