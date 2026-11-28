/**
 * #655: on a house or Tower floor a drop joins a like stack there, and the owner's
 * Decoration Mode move of a shared floor stack keeps it shared (Austin's ruling: "the house floor is
 * shared, as Glitch").
 *
 * Glitch: takeable_drop put a stack in with apiPutItemIntoPosition, which merged it into a like stack
 * there while count < stackmax (items/include/takeable.js 202-207; Eleven's rebuild, Location.addItem
 * 475-503, within 100 px); Decoration Mode's move (main.js doModifyItem 4852-4890) moved any stack in the
 * house and merged it into a like one it was set on (HandOfDecorator.as shouldMerge 1656-1670 sent
 * no_merge otherwise). A Moonstone's stackmax is 3 (gem_moonstone.js:15): 3 then 1 more stayed two stacks.
 * Ours (Austin 2026-11-24, "Let's remove the pile limits"): a pile at home has no stack limit for any
 * class, only the most a stack holds anywhere (9999), the rest lying beside it; tools and things with
 * words never join.
 *
 * - The site (groddle-afternoon-site src/LedgerDrop.php): the merge in the drop's own transaction, the
 *   pile (no stack limit, 9999), who may join whom, the owner's floor move, and a part taken from a stack a merge grew gets a
 *   new id (<op>-t<from>-g<gen>): an id recorded before the rise is never answered "as recorded" for a new
 *   take. tests/fixtures/drops/ledger-drop-merge.php runs it on a throwaway MariaDB database.
 * - The game (features/drops-mp-feature.js) names the like stack it set a drop on, applies what left the
 *   pack when a drop joined one, and sends the owner's floor move.
 * - The realtime server's side: groddle-afternoon-server drops_merge_test.go.
 *
 * Run: node --test tests/floor-merge.test.js (GRODDLE_SITE_DIR for a site worktree; MariaDB as
 * tests/g560-shared-pickup.test.js finds it).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createFeatureHost } from '../public/js/feature-host.js?v=100f3193';
import { dropsMpFeature } from '../public/js/features/drops-mp-feature.js?fresh=floormerge';
import { isTakeOp, normalizeMine } from '../public/js/drops-mp.js?v=351593a6';
import { packToSharedFloor } from '../public/js/home-floor-share.js?v=41dfa718';
import { GAME_DIR, SITE_DIR } from '../tools/repos.mjs';
import { HAS_PHP, PHP, phpSkip } from './php.js';

const OP = 'drop-00000000000000a1';
const OP2 = 'drop-00000000000000a2';
const TABLE = { items: { gem_moonstone: { max: 3 }, apple: { max: 100, food: true } }, untradeable: {} };

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
const settle = () => new Promise((r) => setTimeout(r, 30));
const stack = (id, c, n, x) => ({ id, c, n, x, y: 620, by: { id: 7, name: 'Ada' }, at: 1 });

describe('the game on its own house floor: drops name the like stack, moves stay shared', () => {
  const client = fakeClient();
  const applied = new Set();
  let host;
  const toasts = [];
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'RH_HOME_INT',
    dropTsid: 'RH_HOME_INT',
    inv: { gem_moonstone: 3, apple: 5 },
    player: { x: 1000, y: 620 },
    droppedItems: { version: 1, nextId: 1, streets: {} },
    query(hook, ...args) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'homeDropOrigin') return { owner: 7, room: 'interior', floor: 0, houseX: 750, own: true };
      if (hook === 'ledgerReceipt') {
        if (applied.has(args[0])) return false;
        applied.add(args[0]);
        return true;
      }
      return host.query(hook, ...args);
    },
    collect: () => [],
    redrawDroppedStacks: () => {},
    setData: () => {},
    toast: (t) => toasts.push(t),
    pushActivity: () => {},
    playSound: () => {},
    floatText: () => {},
    refreshPack: () => {},
    save: () => {},
  };
  const last = (kind) => client.sent.filter(([k]) => k === kind).at(-1)?.[1];

  before(async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/' };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.fetch = async (url) => {
      const body = String(url).includes('trade-items.json') ? TABLE : { drops: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
    };
    host = createFeatureHost([dropsMpFeature]);
    dropsMpFeature.init(engine);
    dropsMpFeature.onTick(16, 0, engine);
    await settle();
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [stack(OP, 'gem_moonstone', 2, 300), stack(OP2, 'apple', 4, 600)] });
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.GRODDLE_MP_BOOT;
    delete globalThis.fetch;
    delete globalThis.groddleDrops;
  });

  it('a Moonstone set on the stack of 2 names it; set beside it, merge false', async () => {
    assert.equal(packToSharedFloor(host, engine, { classTsid: 'gem_moonstone', count: 1, x: 1050, y: 620, floor: true, into: OP }), true);
    await settle();
    assert.deepEqual(last('ground_drop'), { ref: last('ground_drop').ref, item: { c: 'gem_moonstone', n: 1 }, x: 1050, y: 620, ox: 750, into: OP });
    // The server says it joined: what left the pack is the drop's 1, not the stack's 3.
    client.emit('msg:ground_dropped', { op: 'drop-00000000000000b1', status: 'settled', stack: null, item: { c: 'gem_moonstone', n: 1 }, into: OP });
    client.emit('msg:ground_added', { stack: stack(OP, 'gem_moonstone', 3, 300) });
    assert.equal(engine.inv.gem_moonstone, 2);
    assert.equal(globalThis.groddleDrops.stacks.find((s) => s.id === OP).count, 3, 'one stack of 3');
    packToSharedFloor(host, engine, { classTsid: 'gem_moonstone', count: 1, x: 1400, y: 620, floor: true, merge: false });
    await settle();
    assert.equal(last('ground_drop').merge, false);
    assert.equal(last('ground_drop').into, undefined);
  });

  it('a plain Drop (no stack named) leaves the server to join the nearest like stack', async () => {
    client.emit('msg:ground_dropped', { op: 'drop-00000000000000b2', status: 'settled', stack: stack('drop-00000000000000b2', 'gem_moonstone', 1, 650), item: { c: 'gem_moonstone', n: 1 } });
    assert.equal(engine.inv.gem_moonstone, 1);
    host.query('sharedDrop', { classTsid: 'apple', count: 1, x: 1340, y: 620 }, engine);
    await settle();
    const d = last('ground_drop');
    assert.equal(d.into, undefined);
    assert.equal(d.merge, undefined);
  });

  it('the owner moves a shared floor stack along the floor: the server moves it, onto a like stack too', () => {
    assert.deepEqual(dropsMpFeature.moveSharedStack(OP2, { x: 1500, y: 620, into: null }, engine), { ok: true });
    assert.deepEqual(last('ground_move'), { id: OP2, x: 1500, y: 620, ox: 750 });
    assert.equal(dropsMpFeature.moveSharedStack(OP2, { x: 1, y: 620 }, engine).reason, 'busy', 'one move at a time');
    client.emit('msg:ground_moved', { id: OP2, status: 'settled' });
    client.emit('msg:ground_added', { stack: { ...stack(OP2, 'apple', 4, 750) } });
    assert.equal(globalThis.groddleDrops.stacks.find((s) => s.id === OP2).x, 750, 'still shared, where it went');
    dropsMpFeature.moveSharedStack(OP2, { x: 1050, y: 620, into: OP }, engine);
    assert.equal(last('ground_move').into, OP);
    client.emit('msg:ground_moved', { id: OP2, status: 'refused', why: 'gone', text: 'That stack has already been picked up.' });
    assert.equal(toasts.at(-1), 'That stack has already been picked up.');
    assert.equal(globalThis.groddleDrops.moving, null);
  });

  it('only at the owner\'s own house or Tower floor', () => {
    const was = engine.query;
    engine.query = (hook, ...args) => (hook === 'homeDropOrigin' ? { owner: 7, room: 'interior', floor: 0, houseX: 750, own: false } : was(hook, ...args));
    assert.equal(dropsMpFeature.moveSharedStack(OP2, { x: 1, y: 620 }, engine).reason, 'place');
    engine.query = was;
  });

  it('homes-feature: a shared stack moved on the floor goes to the server; a drop names the like stack it lands on', () => {
    const homes = readFileSync(join(GAME_DIR, 'public/js/features/homes-feature.js'), 'utf8');
    assert.match(homes, /if \(target\.on == null\) return moveSharedOnFloor\(engine, row, target\);/);
    assert.match(homes, /engine\.query\?\.\('moveSharedStack', row\.id, \{ x: target\.x \+ roomX0\(\), y: target\.y, into \}, engine\)/);
    assert.match(homes, /function packDropOpts\(engine, was, target\) \{\s+const into = sharedLikeAt\(/);
    assert.match(homes, /\.\.\.\(into \? \{ into \} : \{ merge: false \}\)/);
  });

  it('a part of a grown stack (-t<from>-g<gen>) applies from the site\'s list', () => {
    assert.equal(isTakeOp(`${OP}-t5-g1`, OP), true);
    assert.equal(isTakeOp(`${OP}-t5-g0`, OP), false);
    assert.equal(isTakeOp(`${OP}-t-g1`, OP), false);
    assert.deepEqual(normalizeMine({ op: `${OP}-t5-g1`, id: OP, side: 'took', item: { c: 'apple', n: 2 }, why: 'pickup' }), { op: `${OP}-t5-g1`, id: OP, side: 'took', item: { c: 'apple', n: 2 } });
  });
});

/** The database to make the throwaway one on (as tests/g560-shared-pickup.test.js). */
function mysql() {
  const env = String(process.env.GRODDLE_TEST_MYSQL || '').trim();
  if (env) {
    const [host, user, ...pass] = env.split(/\s+/);
    return { host, user, pass: pass.join(' ') };
  }
  const cfg = join(homedir(), 'Cove/Sites/groddle.localhost/public/wp-config.php');
  if (!existsSync(cfg)) return null;
  const text = readFileSync(cfg, 'utf8');
  const def = (k) => text.match(new RegExp(`define\\(\\s*'${k}',\\s*'([^']*)'`))?.[1];
  const host = def('DB_HOST');
  const user = def('DB_USER');
  return host && user ? { host, user, pass: def('DB_PASSWORD') || '' } : null;
}
const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const hasPhp = HAS_PHP;
const db = mysql();
const reachable = db && hasPhp && spawnSync(PHP, ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = (!existsSync(join(SITE_DIR, 'src/LedgerDrop.php')) && 'no site repo')
  || phpSkip('mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('the site merges on a house floor, once and atomically (LedgerDrop)', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP, [join(GAME_DIR, 'tests/fixtures/drops/ledger-drop-merge.php'), engineDir, SITE_DIR, 'run', db.host, db.user, db.pass], { timeout: 90000 }).toString());
  });
  const OWNER = '7';
  const ADA = '9';

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.dropped, true);
  });

  it('a drop onto a like stack joins it in its own transaction: one stack, the ledger moved once', () => {
    assert.deepEqual(r.call.into, r.a);
    assert.deepEqual(r.merge, { status: 'settled', into: r.a, joined: 2, in: 5, n: 0 });
    assert.deepEqual([r.afterMerge.a.count, r.afterMerge.a.gen, r.afterMerge.a.dropper_id], [5, 1, 7], 'the stack keeps its own dropper');
    assert.deepEqual([r.afterMerge.b.status, r.afterMerge.b.count, r.afterMerge.b.merged_into], ['merged', 0, r.a], 'the drop keeps its own row');
    assert.equal(r.afterMerge.ledger[OWNER], 53);
    assert.deepEqual(r.mergeRetry, r.merge, 'asked again: as recorded');
    assert.equal(r.afterMergeRetry.newTrades, 0);
    assert.deepEqual(r.afterMergeRetry.ledger, r.afterMerge.ledger);
  });

  it('the same part (2 of 5) after the merge is a new take with a new id, never the old one replayed', () => {
    assert.equal(r.firstPart.op, `${r.a}-t5`);
    assert.equal(r.secondPart.op, `${r.a}-t5-g1`);
    assert.deepEqual(r.secondPart.item, { n: 2, c: 'cherry' });
    assert.equal(r.afterSecond.ledger[ADA], 4, 'Ada got the 2 more');
    assert.equal(r.afterSecond.a.count, 3);
    assert.deepEqual(r.secondRetry, r.secondPart, 'its own retry answers as recorded');
    assert.equal(r.afterSecondRetry.newTrades, 0);
    assert.equal(r.afterSecondRetry.ledger[ADA], 4);
  });

  it('no stack limit at home (Austin 2026-11-24): 9 onto 3 all join, whatever max a server from before tells', () => {
    assert.deepEqual(r.cap, { status: 'settled', into: r.a, joined: 9, in: 12, n: 0 });
    assert.deepEqual([r.afterCap.a.count, r.afterCap.c9.count, r.afterCap.c9.status], [12, 0, 'merged']);
    assert.deepEqual(r.full, { status: 'settled' });
    assert.deepEqual([r.afterFull.a.count, r.afterFull.c.count, r.afterFull.d.count], [12, 2, 1]);
  });

  it('3 Moonstones (stackmax 3) and 1 more make one pile of 4; past 9999 the rest lies beside the pile', () => {
    const m = r.moon;
    assert.deepEqual([m.join.joined, m.join.in, m.join.n, m.row.count], [1, 4, 0, 4], 'one pile of 4');
    assert.deepEqual(m.over, { status: 'settled', into: m.over.into, joined: 1, in: 9999, n: 2 });
    assert.deepEqual([m.big.count, m.rest.count, m.rest.status], [9999, 2, 'ground'], 'filled to 9999, 2 beside it');
    assert.deepEqual(m.full, { status: 'settled' }, 'a full pile takes none');
    assert.equal(m.ownerLeft, 0, 'every Moonstone left the ledger once');
  });

  it('only one player\'s own stacks join (Austin 2026-11-24): not a visitor\'s onto the owner\'s, nor the owner\'s onto a visitor\'s; a street never merges', () => {
    assert.deepEqual(r.visitorOnOwner, { status: 'settled' });
    assert.deepEqual([r.afterWho.boOnOwner.count, r.afterWho.boOnOwner.status], [1, 'ground']);
    assert.deepEqual(r.ownerOnVisitor, { status: 'settled' });
    assert.deepEqual([r.afterWho.bo.count, r.afterWho.ownerOnBo.count], [2, 1]);
    assert.deepEqual(r.publicStreet, { status: 'settled' });
    assert.deepEqual([r.afterPublic.pub.count, r.afterPublic.pub2.count], [1, 1]);
  });

  it('the owner\'s floor move: once per move op, onto a like stack too; a visitor moves nothing', () => {
    assert.deepEqual(r.move, { status: 'settled', n: 2, x: 640, y: 620 });
    assert.deepEqual([r.afterMove.x, r.afterMove.count, r.afterMove.status], [640, 2, 'ground']);
    assert.deepEqual(r.moveRetry, r.move);
    assert.equal(r.moveMerge.joined, 2);
    assert.deepEqual([r.afterMoveMerge.c.status, r.afterMoveMerge.d.count, r.afterMoveMerge.d.gen], ['merged', 3, 1]);
    assert.equal(r.moveMergeRetry.in, 3, 'asked again: nothing joins twice');
    assert.deepEqual(r.visitorMove, { status: 'refused', why: 'place' });
    assert.deepEqual(r.moveCalls, [null, null, true], 'a street, or a drop op as a move op, is no move');
  });

  it('emblems pile up on a house or Tower floor with no cap (Austin 2026-11-24), never tools, things with words or on a street', () => {
    const p = r.pile;
    assert.deepEqual([p.join0.joined, p.join1.joined, p.join2.joined, p.join2.in, p.join2.n], [1, 1, 3, 6, 0], 'emblems (told max 1 by a server from before) join one pile, three at once too');
    assert.deepEqual([p.row.count, p.row.status, p.row.dropper_id], [6, 'ground', 7]);
    assert.deepEqual([/^drop-/.test(p.call.into), p.call.max], [true, undefined], 'the stack is named; the site reads the pile from its own table');
    assert.deepEqual(p.script, { status: 'settled' }, 'a Teleportation Script keeps its own stack');
    assert.deepEqual(p.pick, { status: 'settled' }, 'a tool keeps its own stack');
    assert.deepEqual(p.street, { status: 'settled' }, 'a street never merges');
    assert.deepEqual(p.caps, [9999, 9999, 9999, 1, 1, 1], 'emblem, Moonstone, honey; a script, a Still and a Pick never join');
    assert.deepEqual([p.part.op.endsWith('-t6-g3'), p.part.item, p.part.n], [true, { n: 2, c: 'emblem_mab' }, 4], 'part of the pile');
    assert.deepEqual(p.whole.item, { c: 'emblem_mab', n: 4 }, 'the rest of the pile, whole');
    assert.deepEqual([p.adaEmblems, p.ownerEmblems], [6, 0], 'nothing made or lost');
  });

  it('nothing made or lost: what lies on the floor and in the ledgers adds up; saves catch up', () => {
    const onFloor = r.trays.reduce((n, t) => n + Number(t.count), 0);
    assert.equal(onFloor + 2 /* the street */ + r.ledger[OWNER] + r.ledger[ADA] + r.ledger['11'], 60 + 5);
    assert.ok(r.unappliedOwner.some((e) => e.op === r.b && e.side === 'dropped' && e.item.n === 2), 'a merged drop still applies from the list');
    for (const e of [...r.unappliedOwner, ...r.unappliedAda]) assert.ok(normalizeMine(e), e.op);
    assert.equal(r.caughtUp.cherry, 4);
    assert.deepEqual(r.caughtUp.applied.sort(), [`${r.a}-t5`, `${r.a}-t5-g1`].sort());
  });
});
