/**
 * The floor at your own home is everyone's (live v0.63.0 regression after #655; G1190; Austin's
 * ruling: "the house floor is shared, as Glitch").
 *
 * v0.63.0 put every Decoration Mode pack drop, and every move, into the owner's save as locked decor
 * (game.js dropPackStackAt `decor: true`, homes-feature moveStack `row.decor = true`), the floor too:
 * stacks set on the floor showed the owner's lock, no visitor could take them, and nothing unlocked
 * them again.
 *
 * Glitch: takeable_drop set house_lock only when the plat under the stack belonged to furniture
 * (items/include/takeable.js 179-198, `plats[i].source`); doModifyItem, the Decoration Mode move,
 * deleted house_lock first and set it again only on a furniture plat (main.js 4852-4890). And a like
 * stack took no more than its class's stackmax (Eleven's Location.addItem 475-503, it.count < it.stackmax;
 * a Moonstone's stackmax is 3, gem_moonstone.js:15).
 *
 * These run the real drops-mp feature through the real feature host (js/feature-host.js) with a
 * realtime client that records what it sends.
 *
 * Run: node --test tests/home-floor-share.test.js
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFeatureHost } from '../public/js/feature-host.js?v=b87e2cbc';
import { dropsMpFeature } from '../public/js/features/drops-mp-feature.js?fresh=floorshare';
import { ownRowToSharedFloor, packToSharedFloor } from '../public/js/home-floor-share.js?v=41dfa718';
import { FLOOR_PILE_MAX, createDroppedItemState, dropInventoryStack, likeStackAt, mergeDroppedStacks, pickupDroppedStack, pileMaxOf, setDownStack } from '../public/js/world-items.js?v=93313aad';
import { ITEM_CATALOG } from '../public/js/inventory.js?v=3be7988a';
import { layoutPack } from '../public/js/pack-slots.js?v=38e4aea5';
import { TOOL_CONDITION_CATALOG, keepsOwnStack } from '../public/js/tools.js?v=4156bba8';
import { GAME_DIR } from '../tools/repos.mjs';

const TABLE = { items: { honey: { max: 40 }, emblem_mab: { max: 1 }, gem_moonstone: { max: 3 } }, untradeable: {} };
const OP = 'drop-00000000000000f1';

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

describe('Decoration Mode at your own house online: the floor is shared, furniture is yours', () => {
  const client = fakeClient();
  const applied = new Set();
  const state = createDroppedItemState({ streets: { RH_HOME_INT: [
    // v0.63.0's locked floor stack: in the save, `decor`, nothing under it.
    { id: 'world-item-1', classTsid: 'honey', count: 5, x: 1000, y: 620, decor: true },
    { id: 'world-item-2', classTsid: 'gem_moonstone', count: 3, x: 1200, y: 400, on: 4, decor: true },
  ] } });
  let host;
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'RH_HOME_INT',
    dropTsid: 'RH_HOME_INT',
    inv: { honey: 6, emblem_mab: 1 },
    player: { x: 1000, y: 620 },
    droppedItems: state,
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
    toast: () => {},
    pushActivity: () => {},
    playSound: () => {},
    floatText: () => {},
    refreshPack: () => {},
    save: () => {},
    dropWorldStack: () => ({ ok: true }),
  };
  const drops = () => client.sent.filter(([k]) => k === 'ground_drop');

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
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [] });
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.GRODDLE_MP_BOOT;
    delete globalThis.fetch;
    delete globalThis.groddleDrops;
  });

  it('(a) a pack stack set on the floor goes to the server as a shared drop, not into the save', async () => {
    const rows = state.streets.RH_HOME_INT.length;
    assert.equal(packToSharedFloor(host, engine, { classTsid: 'honey', count: 4, x: 1300, y: 620, floor: true }), true);
    await settle();
    assert.deepEqual(drops().at(-1)[1].item, { c: 'honey', n: 4 });
    assert.deepEqual([drops().at(-1)[1].x, drops().at(-1)[1].y, drops().at(-1)[1].ox], [1300, 620, 750], 'where it was set down, from the house');
    assert.equal(state.streets.RH_HOME_INT.length, rows, 'no save row');
    assert.equal(engine.inv.honey, 6, 'the pack gives it up on the answer');
    client.emit('msg:ground_dropped', { op: OP, status: 'settled', stack: { id: OP, c: 'honey', n: 4, x: 550, y: 620, by: { id: 7, name: 'Ada' }, at: 1 } });
    assert.equal(engine.inv.honey, 2);
  });

  it('(b) on a shelf or table (not the floor) it is not shared: game.js keeps it in the save, locked', async () => {
    const sent = client.sent.length;
    assert.equal(packToSharedFloor(host, engine, { classTsid: 'honey', count: 1, x: 1300, y: 400, floor: false }), false);
    await settle();
    assert.equal(client.sent.length, sent, 'nothing sent');
    const row = dropInventoryStack(state, { honey: 1 }, 'RH_HOME_INT', 'honey', 1, { x: 1500, y: 400 }, { mergeRadius: 12, decor: true });
    assert.equal(row.stack.decor, true, 'the owner\'s decor (the lock pip: only you can pick this up)');
    // Homes-feature says which: the floor is a target on no piece (packDropTarget's `on`).
    const homes = readFileSync(join(GAME_DIR, 'public/js/features/homes-feature.js'), 'utf8');
    assert.match(homes, /function packDropOpts\(engine, was, target\) \{[\s\S]{0,200}floor: target\?\.on == null,/);
    const game = readFileSync(join(GAME_DIR, 'public/game.js'), 'utf8');
    const at = game.slice(game.indexOf('  dropPackStackAt(classTsid, count, x, y,'), game.indexOf('  takeDroppedStack(id) {'));
    assert.ok(at.indexOf('packToSharedFloor(features, engine, { classTsid, count: n, x, y, floor, into, merge })') > 0, 'game.js asks first');
    assert.ok(at.indexOf('packToSharedFloor(') < at.indexOf('beforeRemove?.(n);'), 'before the pack changes');
  });

  it('a class the server does not take stays the owner\'s own; a pile goes down whole (Austin 2026-11-24)', () => {
    assert.equal(packToSharedFloor(host, engine, { classTsid: 'note', count: 1, x: 1300, y: 620, floor: true }), false);
    // "Let's remove the pile limits": in a house a pile of any class goes to the shared floor as one pile.
    assert.equal(dropsMpFeature.sharedDropFits('emblem_mab', 2, engine), true);
    assert.equal(dropsMpFeature.sharedDropFits('emblem_mab', 1, engine), true);
    assert.equal(dropsMpFeature.sharedDropFits('gem_moonstone', 4, engine), true, 'four Moonstones, past the stackmax of 3');
    assert.equal(dropsMpFeature.sharedDropFits('gem_moonstone', FLOOR_PILE_MAX + 1, engine), null, 'no more than 9999 in one drop');
  });

  it('(c) a locked floor stack moved to the floor comes off the save and goes down shared', async () => {
    const res = ownRowToSharedFloor(host, engine, { state, key: 'RH_HOME_INT', inv: engine.inv, id: 'world-item-1', x: 1100, y: 620 });
    assert.deepEqual(res, { ok: true, shared: true, count: 5 });
    assert.equal(state.streets.RH_HOME_INT.find((r) => r.id === 'world-item-1'), undefined, 'out of the save');
    assert.equal(engine.inv.honey, 7, 'in the pack until the server answers');
    await settle();
    assert.deepEqual(drops().at(-1)[1].item, { c: 'honey', n: 5 });
    assert.equal(drops().at(-1)[1].x, 1100);
    const shared = { id: 'drop-00000000000000f2', c: 'honey', n: 5, x: 350, y: 620, by: { id: 7, name: 'Ada' }, at: 1 };
    client.emit('msg:ground_dropped', { op: shared.id, status: 'settled', stack: shared });
    client.emit('msg:ground_added', { stack: shared });
    assert.equal(engine.inv.honey, 2, 'given up once the server says it is down');
    assert.ok(globalThis.groddleDrops.stacks.some((s) => s.id === 'drop-00000000000000f2'), 'on the shared floor');
  });

  it('a refused share leaves it in the pack: nothing vanishes', async () => {
    state.streets.RH_HOME_INT.push({ id: 'world-item-9', classTsid: 'honey', count: 2, x: 900, y: 620, decor: true });
    const before = engine.inv.honey;
    assert.equal(ownRowToSharedFloor(host, engine, { state, key: 'RH_HOME_INT', inv: engine.inv, id: 'world-item-9', x: 950, y: 620 }).ok, true);
    await settle();
    client.emit('msg:ground_dropped', { ref: drops().at(-1)[1].ref, status: 'refused', why: 'busy', text: 'Wait a moment, you are still dropping something.' });
    assert.equal(engine.inv.honey, before + 2, 'in the pack');
  });

  it('offline it stays the owner\'s own, where it was (the caller moves it in the save)', () => {
    client.state = 'offline';
    const res = ownRowToSharedFloor(host, engine, { state, key: 'RH_HOME_INT', inv: engine.inv, id: 'world-item-2', x: 1, y: 620 });
    client.state = 'online';
    assert.equal(res.reason, 'own');
    assert.equal(state.streets.RH_HOME_INT.find((r) => r.id === 'world-item-2').count, 3);
  });

  it('homes-feature: a move to the floor shares the save\'s stack and takes the lock off; a shelf keeps it', () => {
    const homes = readFileSync(join(GAME_DIR, 'public/js/features/homes-feature.js'), 'utf8');
    const mv = homes.slice(homes.indexOf('function moveStack('), homes.indexOf('function claimShared('));
    assert.match(mv, /if \(target\.on == null\) \{\s+const shared = shareOwnStack\(engine, row, target, sharedLikeAt\(engine, row, target\)\);\s+if \(shared\) return shared;\s+\}/);
    assert.match(mv, /if \(target\.on != null\) row\.decor = true;\s+else delete row\.decor;/);
    assert.doesNotMatch(mv, /^\s+row\.decor = true;$/m, 'never locked on the floor');
  });
});

describe('away from home (no `pile`) a like stack takes no more than its stackmax (Eleven Location.addItem 475-503)', () => {
  const ROOM = 'RH_HOME_INT';
  it('a full Moonstone stack (3) takes no fourth: the drop lies as its own stack', () => {
    const s = createDroppedItemState({ streets: { [ROOM]: [{ id: 'a', classTsid: 'gem_moonstone', count: 3, x: 100, y: 620 }] } });
    const res = dropInventoryStack(s, { gem_moonstone: 1 }, ROOM, 'gem_moonstone', 1, { x: 100, y: 620 }, {});
    assert.equal(res.merged, false);
    assert.deepEqual(s.streets[ROOM].map((r) => r.count), [3, 1]);
  });

  it('two Moonstones dropped on one fill it to 3; the rest lies beside it', () => {
    const s = createDroppedItemState({ streets: { [ROOM]: [{ id: 'a', classTsid: 'gem_moonstone', count: 2, x: 100, y: 620 }] } });
    const res = dropInventoryStack(s, { gem_moonstone: 2 }, ROOM, 'gem_moonstone', 2, { x: 100, y: 620 }, {});
    assert.equal(res.merged, true);
    assert.equal(res.joined, 1);
    assert.deepEqual(s.streets[ROOM].map((r) => r.count), [3, 1]);
  });

  it('at home a Decoration Mode move joins past the stackmax; a pile at 9999 is full and the rest stays moved', () => {
    const s = createDroppedItemState({ streets: { [ROOM]: [
      { id: 'a', classTsid: 'gem_moonstone', count: 3, x: 100, y: 620 },
      { id: 'b', classTsid: 'gem_moonstone', count: FLOOR_PILE_MAX - 1, x: 400, y: 620 },
      { id: 'c', classTsid: 'gem_moonstone', count: 2, x: 700, y: 620 },
    ] } });
    const rows = s.streets[ROOM];
    assert.equal(likeStackAt(rows, rows[2], 100, null)?.id, 'a', 'a Moonstone stack of 3 is not full at home');
    const res = mergeDroppedStacks(s, ROOM, 'c', 'b');
    assert.deepEqual([res.ok, res.count, res.left], [true, 1, 1], 'fills to 9999, one stays moved');
    assert.equal(likeStackAt(rows, rows[2], 400, null), null, 'full at 9999');
    assert.equal(mergeDroppedStacks(s, ROOM, 'c', 'b').reason, 'full');
    assert.deepEqual(mergeDroppedStacks(s, ROOM, 'c', 'a').count, 1);
    assert.deepEqual(rows.map((r) => [r.id, r.count]), [['a', 4], ['b', FLOOR_PILE_MAX]], 'nothing made or lost');
  });

  it('an emblem dropped on a street (no pile) never joins another; on a shelf honey piles past its 40', () => {
    const s = createDroppedItemState({ streets: { [ROOM]: [{ id: 'a', classTsid: 'emblem_mab', count: 1, x: 100, y: 620 }] } });
    assert.equal(dropInventoryStack(s, { emblem_mab: 1 }, ROOM, 'emblem_mab', 1, { x: 100, y: 620 }, {}).merged, false);
    const h = createDroppedItemState({ streets: { [ROOM]: [{ id: 'a', classTsid: 'honey', count: 30, x: 100, y: 620, on: 2 }] } });
    assert.deepEqual(setDownStack(h, ROOM, 'honey', 20, { x: 100, y: 400 }, { on: 2, into: 'a' }).merged, true);
    assert.deepEqual(h.streets[ROOM].map((r) => r.count), [50], 'one pile of 50 (Austin 2026-11-24: no pile limits at home)');
  });
});

/**
 * Austin 2026-11-24: "Let's remove the pile limits." A pile of any class in a house or on a Tower floor,
 * on the floor, a shelf or a table, has no stack limit (only the most a stack holds, 9999); Glitch's
 * stackmax capped every pile, emblems 1, Moonstones 3 (a difference on purpose, tools/inventions
 * ours-floor-piles). Never a tool (its wear), a class with words, or one that keeps its own stack
 * (js/tools.js keepsOwnStack). The pack keeps the stackmax. The save's side.
 */
describe('piles at home have no stack limit: shelves, tables and the floor (the save)', () => {
  const ROOM = 'RH_HOME_INT';
  it('the pile: 9999 for an emblem, a Moonstone and honey; a tool, a script, a Still never join', () => {
    assert.equal(pileMaxOf('emblem_mab'), FLOOR_PILE_MAX);
    assert.equal(pileMaxOf('gem_moonstone'), FLOOR_PILE_MAX);
    assert.equal(pileMaxOf('honey'), FLOOR_PILE_MAX);
    assert.equal(pileMaxOf('pick'), 1, 'a tool keeps its wear');
    assert.equal(pileMaxOf('teleportation_script'), 1, 'keepsOwnStack');
    assert.equal(pileMaxOf('still'), 1, 'keepsOwnStack');
    assert.equal(pileMaxOf('npc_cubimal_chick'), 1, 'words of its own (a name)');
  });

  it('an emblem set on a shelf pile of 5 joins it; a pile moved onto another joins it whole', () => {
    const s = createDroppedItemState({ streets: { [ROOM]: [
      { id: 'a', classTsid: 'emblem_mab', count: 5, x: 100, y: 400, on: 2, decor: true },
      { id: 'b', classTsid: 'emblem_mab', count: 3, x: 600, y: 400, on: 2, decor: true },
    ] } });
    const rows = s.streets[ROOM];
    assert.equal(likeStackAt(rows, { id: 'new', classTsid: 'emblem_mab', count: 1 }, 104, 2)?.id, 'a', 'the shelf pile takes it');
    assert.deepEqual(setDownStack(s, ROOM, 'emblem_mab', 1, { x: 104, y: 400 }, { on: 2, into: 'a' }).merged, true);
    assert.equal(rows.find((r) => r.id === 'a').count, 6);
    const res = mergeDroppedStacks(s, ROOM, 'b', 'a');
    assert.deepEqual([res.ok, res.count, res.left], [true, 3, undefined]);
    assert.deepEqual(rows.map((r) => [r.id, r.count]), [['a', 9]], 'one pile, nothing made or lost');
  });

  it('a Decoration Mode drop (pile) joins a floor pile; a multi-count drop lies as one pile; a street drop never piles', () => {
    const s = createDroppedItemState({ streets: { [ROOM]: [{ id: 'a', classTsid: 'emblem_mab', count: 2, x: 100, y: 620 }] } });
    const inv = { emblem_mab: 5 };
    const on = dropInventoryStack(s, inv, ROOM, 'emblem_mab', 1, { x: 104, y: 620 }, { mergeRadius: 12, pile: true });
    assert.deepEqual([on.merged, s.streets[ROOM][0].count], [true, 3]);
    const three = dropInventoryStack(s, inv, ROOM, 'emblem_mab', 3, { x: 900, y: 620 }, { mergeRadius: 12, pile: true });
    assert.deepEqual([three.merged, three.stack.count], [false, 3], 'three at once, one pile');
    assert.equal(inv.emblem_mab, 1);
    const street = createDroppedItemState({ streets: { LA5101HF7F429V: [{ id: 'a', classTsid: 'emblem_mab', count: 1, x: 100, y: 620 }] } });
    assert.equal(dropInventoryStack(street, { emblem_mab: 1 }, 'LA5101HF7F429V', 'emblem_mab', 1, { x: 100, y: 620 }, {}).merged, false);
  });

  it('never a Teleportation Script, a Still or a worn tool, even with pile', () => {
    for (const cls of ['teleportation_script', 'still', 'pick']) {
      const s = createDroppedItemState({ streets: { [ROOM]: [{ id: 'a', classTsid: cls, count: 1, x: 100, y: 400, on: 2 }, { id: 'b', classTsid: cls, count: 1, x: 300, y: 400, on: 2 }] } });
      const rows = s.streets[ROOM];
      assert.equal(likeStackAt(rows, rows[1], 100, 2), null, cls);
      assert.equal(mergeDroppedStacks(s, ROOM, 'b', 'a').reason, 'full', cls);
      assert.equal(dropInventoryStack(s, { [cls]: 1 }, ROOM, cls, 1, { x: 100, y: 400 }, { mergeRadius: 12, pile: true }).merged, false, cls);
    }
  });

  it('the save, the shared floor, the server and the site read one rule: every keepsOwnStack class is tagged in the trade table', () => {
    // drops.go pileMax and LedgerDrop::pileCap see only the trade table's pts and tag: a class the game keeps
    // one to a stack must carry a tag there (tools/build-realtime-trade.mjs writes it from js/tools.js), or the
    // server would pile it up.
    const table = JSON.parse(readFileSync(join(GAME_DIR, 'public/assets/content/trade-items.json'), 'utf8'));
    const own = Object.keys(TOOL_CONDITION_CATALOG).filter((c) => keepsOwnStack(c));
    assert.deepEqual(own.sort(), ['still', 'teleportation_script']);
    for (const c of own) assert.ok(table.items[c]?.tag, `${c} is tagged`);
    for (const [c, row] of Object.entries(table.items)) {
      assert.equal(pileMaxOf(c), row.pts > 0 || row.tag ? 1 : FLOOR_PILE_MAX, c);
    }
    // One helper: the shared floor's drop and move read pileMaxOf, and the stackmax-1 case is gone.
    const dropsMp = readFileSync(join(GAME_DIR, 'public/js/drops-mp.js'), 'utf8');
    assert.doesNotMatch(dropsMp, /floorPileMax|FLOOR_PILE_MAX/);
    assert.doesNotMatch(readFileSync(join(GAME_DIR, 'public/js/world-items.js'), 'utf8'), /max !== 1/);
  });

  it('3 Moonstones (stackmax 3) and 1 more make one pile of 4 on a shelf, set down or dropped from the pack', () => {
    const s = createDroppedItemState({ streets: { [ROOM]: [{ id: 'a', classTsid: 'gem_moonstone', count: 3, x: 100, y: 400, on: 2, decor: true }] } });
    const rows = s.streets[ROOM];
    assert.equal(likeStackAt(rows, { id: 'new', classTsid: 'gem_moonstone', count: 1 }, 104, 2)?.id, 'a', 'the shelf pile of 3 takes it');
    assert.equal(setDownStack(s, ROOM, 'gem_moonstone', 1, { x: 104, y: 400 }, { on: 2, into: 'a' }).merged, true);
    assert.deepEqual(rows.map((r) => [r.id, r.count]), [['a', 4]], 'one pile of 4');
    const inv = { gem_moonstone: 3 };
    const res = dropInventoryStack(s, inv, ROOM, 'gem_moonstone', 3, { x: 102, y: 400 }, { mergeRadius: 12, pile: true });
    assert.deepEqual([res.merged, rows[0].count, inv.gem_moonstone ?? 0], [true, 7, 0], 'a pack drop joins it too');
  });

  it('a pile at 9999 takes up to 9999 and the rest lies beside it', () => {
    const s = createDroppedItemState({ streets: { [ROOM]: [{ id: 'a', classTsid: 'emblem_mab', count: FLOOR_PILE_MAX - 1, x: 100, y: 620 }] } });
    const res = dropInventoryStack(s, { emblem_mab: 3 }, ROOM, 'emblem_mab', 3, { x: 100, y: 620 }, { mergeRadius: 12, pile: true });
    assert.deepEqual([res.merged, res.joined], [true, 1]);
    assert.deepEqual(s.streets[ROOM].map((r) => r.count), [FLOOR_PILE_MAX, 2]);
  });

  it('a pile of 4 Moonstones picked up goes into the pack as 3 + 1 (the pack keeps the stackmax)', () => {
    const s = createDroppedItemState({ streets: { [ROOM]: [{ id: 'a', classTsid: 'gem_moonstone', count: 4, x: 100, y: 400, on: 2 }] } });
    const inv = {};
    const res = pickupDroppedStack(s, inv, ROOM, 'a');
    assert.deepEqual([res.count, res.removed, inv.gem_moonstone], [4, true, 4]);
    const layout = layoutPack(inv, null, { capacity: 16, catalog: ITEM_CATALOG });
    assert.deepEqual(layout.pack.slots.filter((sl) => sl.cls === 'gem_moonstone').map((sl) => sl.count), [3, 1]);
  });

  it('a pile picked up whole puts each emblem in its own pack slot; part of it leaves the rest', () => {
    const s = createDroppedItemState({ streets: { [ROOM]: [{ id: 'a', classTsid: 'emblem_mab', count: 6, x: 100, y: 400, on: 2 }] } });
    const inv = {};
    const part = pickupDroppedStack(s, inv, ROOM, 'a', 2);
    assert.deepEqual([part.count, part.remaining, inv.emblem_mab], [2, 4, 2]);
    const whole = pickupDroppedStack(s, inv, ROOM, 'a');
    assert.deepEqual([whole.count, whole.removed, inv.emblem_mab], [4, true, 6]);
    const layout = layoutPack(inv, null, { capacity: 16, catalog: ITEM_CATALOG });
    assert.deepEqual(layout.pack.slots.filter((sl) => sl.cls === 'emblem_mab').map((sl) => sl.count), [1, 1, 1, 1, 1, 1], 'six slots of one');
  });
});
