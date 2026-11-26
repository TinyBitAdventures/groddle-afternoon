/**
 * Austin 2026-11-24 (live test of v0.63.1): "Dropping items in the house now lags. Make it feel instant."
 *
 * Cause: a drop on a shared floor (a house, a Tower floor, a street) changed nothing until the server's
 * answer: the save was written and waited for (features/drops-mp-feature.js persist), the realtime server
 * asked the site's ledger (drops.go dropFrame, about 0.2 to 0.5 s from the VPS to the site), and only the
 * answer (ground_dropped) took the stack out of the pack and drew it. Quick drops queued behind each other
 * (G1192: one weighed at a time, and the rate bucket), each waiting for the last.
 *
 * Now each drop shows at once (an optimistic drop): its count leaves the pack's view (packHeld, drawn by
 * game.js renderPackBar through js/pack-slots.js layoutHeld) and its stack shows where it lands, on the
 * like stack it will join or on its own (list). The pack, the save and the ledger still change only on
 * the answer. Settled, the real stack takes its place; joined, the stack's count is the server's; refused,
 * timed out or disconnected, the count is back in the pack's view and the stack is gone. Never lost, never
 * twice: what the floor shows plus what the pack shows is what the player had, at every step.
 *
 * The server here is a stub that answers after a delay (SLOW_MS), as the live one does.
 *
 * Run: node --test tests/drop-instant.test.js
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { layoutHeld, layoutPack } from '../public/js/pack-slots.js?v=38e4aea5';
import { createDroppedItemState, setDownStack } from '../public/js/world-items.js?v=93313aad';
import { ITEM_CATALOG } from '../public/js/inventory.js?v=3be7988a';
import { GAME_DIR } from '../tools/repos.mjs';

const SLOW_MS = 400;
const TABLE = { items: { apple: { max: 100, food: true }, gem_moonstone: { max: 3 }, emblem_mab: { max: 1 }, teleportation_script: { max: 1, tag: 'script' }, plank: { max: 100 } }, untradeable: {} };
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const hex = (n) => `drop-${String(n).padStart(16, '0')}`;

function fakeClient(street) {
  const handlers = {};
  return {
    state: 'online',
    street,
    me: { id: 7, name: 'Ada' },
    sent: [],
    on(ev, fn) { (handlers[ev] ||= []).push(fn); return () => {}; },
    send(kind, payload) { this.sent.push([kind, payload]); return true; },
    emit(ev, msg) { for (const fn of handlers[ev] || []) fn(msg); },
  };
}

/** A session on a fresh copy of the feature (it keeps one session per page). */
async function rig({ street = 'HOUSE_7', inv, origin = { owner: 7, room: 'interior', floor: 0, houseX: 750, own: true }, tag }) {
  const { dropsMpFeature: feature } = await import(`../public/js/features/drops-mp-feature.js?fresh=dropinstant-${tag}`);
  const client = fakeClient(street);
  const applied = new Set();
  const toasts = [];
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: street.startsWith('HOUSE') ? 'RH_HOME_INT' : street,
    dropTsid: street.startsWith('HOUSE') ? 'RH_HOME_INT' : street,
    inv,
    player: { x: 1000, y: 620 },
    query(hook, op) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'homeDropOrigin') return street.startsWith('HOUSE') ? origin : null;
      if (hook === 'ledgerReceipt') {
        if (applied.has(op)) return false;
        applied.add(op);
        return true;
      }
      return null;
    },
    dropWorldStack: () => ({ ok: true }),
    redrawDroppedStacks: () => {},
    setData: () => {},
    toast: (t) => toasts.push(t),
    pushActivity: () => {},
    playSound: () => {},
    floatText: () => {},
    refreshPack: () => {},
    save: () => {},
  };
  feature.init(engine);
  feature.onTick(16, 0, engine);
  await wait();
  const s = globalThis.groddleDrops;
  const key = engine.dropTsid;
  /** The floor as drawn: id -> count of a class. */
  const floor = (c) => s.list(key).filter((x) => x.classTsid === c);
  const onFloor = (c) => floor(c).reduce((n, x) => n + x.count, 0);
  /** What the pack shows of a class. */
  const inPack = (c) => (engine.inv[c] || 0) - (s.held()?.[c] || 0);
  const drops = () => client.sent.filter(([k]) => k === 'ground_drop').map(([, p]) => p);
  return { feature, client, engine, s, key, floor, onFloor, inPack, drops, toasts };
}

const stack = (id, c, n, x, by = 7) => ({ id, c, n, x, y: 620, by: { id: by, name: by === 7 ? 'Ada' : 'Bo' }, at: 1 });

describe('a drop on your house floor shows at once and settles to the server\'s word', () => {
  let r;
  before(async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/' };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.fetch = async (url) => {
      const body = String(url).includes('trade-items.json') ? TABLE : { drops: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
    };
    r = await rig({ inv: { apple: 10, gem_moonstone: 3, emblem_mab: 4, teleportation_script: 2 }, tag: 'house' });
    r.client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [stack(hex(1), 'gem_moonstone', 2, 300), stack(hex(2), 'emblem_mab', 1, 900), stack(hex(3), 'apple', 1, 100, 9)] });
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.GRODDLE_MP_BOOT;
    delete globalThis.fetch;
    delete globalThis.groddleDrops;
  });

  it('settled: shown the moment it is dropped, the real stack swapped in on the answer; the stubbed slow server takes 400 ms', async () => {
    const t0 = performance.now();
    assert.equal(r.feature.sharedDrop({ classTsid: 'apple', count: 3, x: 2000, y: 620 }, r.engine), true);
    const shownMs = performance.now() - t0;
    // The visible change, before any answer: out of the pack's view, on the floor where it lands.
    assert.equal(r.inPack('apple'), 7, 'out of the pack view at once');
    assert.equal(r.engine.inv.apple, 10, 'the pack itself (and the save) unchanged until the answer');
    const ph = r.floor('apple').find((x) => x.pending);
    assert.deepEqual([ph.count, ph.x, ph.y], [3, 2000, 620], 'drawn where it lands');
    assert.ok(shownMs < 50, `shown in ${shownMs.toFixed(1)} ms`);
    await wait();
    const d = r.drops().at(-1);
    assert.equal(d.x, 2000);
    await wait(SLOW_MS);
    const real = stack(hex(10), 'apple', 3, 2000 - 750);
    r.client.emit('msg:ground_dropped', { op: real.id, ref: d.ref, status: 'settled', stack: real });
    r.client.emit('msg:ground_added', { stack: real });
    assert.equal(r.engine.inv.apple, 7, 'taken from the pack on the answer');
    assert.equal(r.inPack('apple'), 7, 'the pack view does not move again');
    assert.equal(r.s.held(), null);
    assert.deepEqual(r.floor('apple').filter((x) => x.by.id === 7).map((x) => [x.id, x.count, x.x]), [[real.id, 3, 2000]], 'the real stack, where the placeholder was');
  });

  it('joined: drawn on the like stack at once; the count is the server\'s once it answers, never counted twice', async () => {
    r.feature.sharedDrop({ classTsid: 'gem_moonstone', count: 1, x: 1050, y: 620, into: hex(1) }, r.engine);
    assert.equal(r.floor('gem_moonstone').length, 1, 'no stack of its own');
    assert.equal(r.floor('gem_moonstone')[0].count, 3, 'the stack of 2 shows 3 at once');
    assert.equal(r.inPack('gem_moonstone'), 2);
    await wait();
    const d = r.drops().at(-1);
    assert.equal(d.into, hex(1));
    // The server grows the stack first (ground_added), then answers the dropper (drops.go dropMerged).
    r.client.emit('msg:ground_added', { stack: stack(hex(1), 'gem_moonstone', 3, 300) });
    assert.equal(r.floor('gem_moonstone')[0].count, 3, 'between the two messages: 3, not 4');
    r.client.emit('msg:ground_dropped', { op: hex(11), ref: d.ref, status: 'settled', stack: null, item: { c: 'gem_moonstone', n: 1 }, into: hex(1) });
    assert.deepEqual([r.floor('gem_moonstone')[0].count, r.engine.inv.gem_moonstone, r.inPack('gem_moonstone')], [3, 2, 2]);
  });

  it('an emblem joins your pile, and a Moonstone your stack of 3 (Austin 2026-11-24: no pile limits at home), shown so at once', async () => {
    r.feature.sharedDrop({ classTsid: 'emblem_mab', count: 1, x: 1650, y: 620 }, r.engine);
    assert.deepEqual(r.floor('emblem_mab').map((x) => x.count), [2], 'the emblem shows on the pile of 1');
    await wait();
    const d = r.drops().at(-1);
    r.client.emit('msg:ground_added', { stack: stack(hex(2), 'emblem_mab', 2, 900) });
    r.client.emit('msg:ground_dropped', { op: hex(12), ref: d.ref, status: 'settled', stack: null, item: { c: 'emblem_mab', n: 1 }, into: hex(2) });
    r.feature.sharedDrop({ classTsid: 'gem_moonstone', count: 1, x: 1050, y: 620 }, r.engine);
    assert.deepEqual(r.floor('gem_moonstone').map((x) => x.count), [4], 'shown on the stack of 3, past the stackmax');
    await wait();
    const m = r.drops().at(-1);
    r.client.emit('msg:ground_added', { stack: stack(hex(1), 'gem_moonstone', 4, 300) });
    r.client.emit('msg:ground_dropped', { op: hex(13), ref: m.ref, status: 'settled', stack: null, item: { c: 'gem_moonstone', n: 1 }, into: hex(1) });
    assert.deepEqual([r.floor('gem_moonstone').map((x) => x.count), r.engine.inv.gem_moonstone], [[4], 1], 'one pile of 4, counted once');
  });

  it('a Teleportation Script keeps its own stack, shown on its own', async () => {
    r.client.emit('msg:ground_added', { stack: stack(hex(4), 'teleportation_script', 1, 1200) });
    r.feature.sharedDrop({ classTsid: 'teleportation_script', count: 1, x: 1950, y: 620 }, r.engine);
    assert.deepEqual(r.floor('teleportation_script').map((x) => x.count), [1, 1]);
    await wait();
    const d = r.drops().at(-1);
    r.client.emit('msg:ground_dropped', { ref: d.ref, status: 'refused', why: 'busy', text: 'Wait a moment, you are still dropping something.' });
  });

  it('refused: back in the pack\'s view and off the floor; nothing taken, nothing made', async () => {
    const before = r.onFloor('apple');
    r.feature.sharedDrop({ classTsid: 'apple', count: 2, x: 2600, y: 620 }, r.engine);
    assert.deepEqual([r.inPack('apple'), r.onFloor('apple')], [5, before + 2]);
    await wait();
    const d = r.drops().at(-1);
    r.client.emit('msg:ground_dropped', { ref: d.ref, status: 'refused', why: 'short', text: "You don't have enough of that item." });
    assert.deepEqual([r.inPack('apple'), r.engine.inv.apple, r.onFloor('apple'), r.s.held()], [7, 7, before, null]);
  });

  it('timed out: back in the pack\'s view; a late answer still applies once', async () => {
    await wait(1100); // the rate bucket: the drop goes to the server at once
    const before = r.onFloor('apple');
    r.feature.sharedDrop({ classTsid: 'apple', count: 1, x: 2700, y: 620 }, r.engine);
    await wait();
    const d = r.drops().at(-1);
    assert.equal(d.x, 2700, 'sent');
    r.s.tick(Date.now() + 16000);
    assert.deepEqual([r.inPack('apple'), r.onFloor('apple'), r.s.pending.length], [7, before, 0], 'given up: in the pack again');
    const late = stack(hex(14), 'apple', 1, 2700 - 750);
    r.client.emit('msg:ground_dropped', { op: late.id, ref: d.ref, status: 'settled', stack: late });
    r.client.emit('msg:ground_dropped', { op: late.id, ref: d.ref, status: 'settled', stack: late });
    assert.deepEqual([r.engine.inv.apple, r.inPack('apple'), r.onFloor('apple')], [6, 6, before + 1], 'once: out of the pack, on the floor');
  });

  it('a quick burst: each shows at once while the ones before wait their turn, and floor plus pack never change', async () => {
    await wait(1100); // the rate bucket: the first goes at once
    const total = r.inPack('apple') + r.onFloor('apple');
    for (let i = 0; i < 5; i += 1) {
      r.feature.sharedDrop({ classTsid: 'apple', count: 1, x: 3000 + i, y: 620 }, r.engine);
      assert.equal(r.inPack('apple'), 5 - i, `drop ${i + 1} out of the pack view at once`);
      assert.equal(r.inPack('apple') + r.onFloor('apple'), total, 'never lost, never twice');
    }
    // The four after the first are drawn joining the first's pile (the server joins the nearest within 100 px).
    assert.deepEqual(r.floor('apple').filter((x) => x.pending).map((x) => x.count), [5]);
    assert.equal(r.s.queued.length, 4, 'one weighed at a time, four waiting');
    let pile = null;
    for (let i = 0; i < 5; i += 1) {
      await wait();
      const d = r.drops().at(-1);
      assert.equal(d.x, 3000 + i, 'in order');
      if (!pile) {
        pile = stack(hex(20), 'apple', 1, d.x - 750);
        r.client.emit('msg:ground_dropped', { op: pile.id, ref: d.ref, status: 'settled', stack: pile });
        r.client.emit('msg:ground_added', { stack: pile });
      } else {
        pile = { ...pile, n: pile.n + 1 };
        r.client.emit('msg:ground_added', { stack: pile });
        assert.equal(r.inPack('apple') + r.onFloor('apple'), total, 'between the grow and the answer');
        r.client.emit('msg:ground_dropped', { op: hex(20 + i), ref: d.ref, status: 'settled', stack: null, item: { c: 'apple', n: 1 }, into: pile.id });
      }
      assert.equal(r.inPack('apple') + r.onFloor('apple'), total, `after answer ${i + 1}`);
      await wait(1100); // the rate bucket
    }
    assert.deepEqual([r.engine.inv.apple, r.s.held(), r.floor('apple').find((x) => x.id === pile.id).count], [1, null, 5]);
  });

  it('a lost connection puts every drop shown back in the pack\'s view', async () => {
    r.feature.sharedDrop({ classTsid: 'apple', count: 1, x: 3500, y: 620 }, r.engine);
    assert.equal(r.inPack('apple'), 0);
    r.client.state = 'offline';
    r.client.emit('state', { state: 'offline' });
    const after = [r.inPack('apple'), r.s.held(), r.s.pending.length];
    r.client.state = 'online';
    assert.deepEqual(after, [1, null, 0]);
    r.client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [stack(hex(1), 'gem_moonstone', 3, 300), stack(hex(5), 'apple', 4, 600)] });
  });

  it('the owner\'s floor move shows at its new spot at once; refused, it is back where it was', async () => {
    await wait(1100);
    assert.deepEqual(r.feature.moveSharedStack(hex(5), { x: 1700, y: 620 }, r.engine), { ok: true });
    assert.equal(r.floor('apple').find((x) => x.id === hex(5)).x, 1700, 'moved at once');
    r.client.emit('msg:ground_moved', { id: hex(5), status: 'refused', why: 'busy', text: 'Someone is already picking that up.' });
    assert.equal(r.floor('apple').find((x) => x.id === hex(5)).x, 600 + 750, 'back');
    await wait(1100);
    r.feature.moveSharedStack(hex(5), { x: 1700, y: 620 }, r.engine);
    r.client.emit('msg:ground_moved', { id: hex(5), status: 'settled' });
    assert.equal(r.floor('apple').find((x) => x.id === hex(5)).x, 1700, 'settled: still there until the server\'s word on it');
    r.client.emit('msg:ground_added', { stack: stack(hex(5), 'apple', 4, 950) });
    assert.deepEqual([r.floor('apple').find((x) => x.id === hex(5)).x, r.s.moving], [1700, null]);
  });

  it('a drop still shown cannot be picked up yet', () => {
    r.feature.sharedDrop({ classTsid: 'gem_moonstone', count: 1, x: 2400, y: 620 }, r.engine);
    const ph = r.floor('gem_moonstone').find((x) => x.pending);
    assert.equal(r.feature.sharedPickup({ worldItemId: ph.id, state: { id: ph.id } }, r.engine, 1), false);
  });
});

describe('a public street: each drop shown on its own, never merged', () => {
  let r;
  before(async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/' };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.fetch = async (url) => {
      const body = String(url).includes('trade-items.json') ? TABLE : { drops: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
    };
    r = await rig({ street: 'LA5101HF7F429V', inv: { plank: 5 }, tag: 'street' });
    r.client.emit('msg:ground_state', { street: 'LA5101HF7F429V', stacks: [stack(hex(1), 'plank', 2, 1000)] });
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.GRODDLE_MP_BOOT;
    delete globalThis.fetch;
    delete globalThis.groddleDrops;
  });

  it('two drops by the like stack: shown at once, each its own', () => {
    r.feature.sharedDrop({ classTsid: 'plank', count: 1, x: 1000, y: 620 }, r.engine);
    r.feature.sharedDrop({ classTsid: 'plank', count: 1, x: 1001, y: 620 }, r.engine);
    assert.deepEqual(r.floor('plank').map((x) => x.count), [2, 1, 1]);
    assert.equal(r.inPack('plank'), 3);
  });
});

describe('the pack view: the stack the drop came from shows the fewer, an emptied one is drawn free', () => {
  it('layoutHeld takes from the marked stack first, keeps every slot\'s place, never changes the layout', () => {
    const layout = layoutPack({ apple: 150, emblem_mab: 3 }, null, { capacity: 16, catalog: ITEM_CATALOG });
    const before = JSON.stringify(layout);
    const appleAt = layout.pack.slots.map((s, i) => [s, i]).filter(([s]) => s.cls === 'apple');
    const marks = [{ cls: 'apple', container: 'pack', index: appleAt[1][1], n: 50 }];
    const shown = layoutHeld(layout, { apple: 50, emblem_mab: 1 }, marks);
    assert.equal(JSON.stringify(layout), before, 'pure');
    assert.equal(shown.pack.slots.length, layout.pack.slots.length, 'every slot keeps its place');
    assert.deepEqual(appleAt.map(([, i]) => [shown.pack.slots[i].count, Boolean(shown.pack.slots[i].held)]), [[100, false], [0, true]], 'the marked stack of 50 is out of view');
    assert.equal(shown.pack.slots.filter((s) => s.cls === 'emblem_mab' && !s.held).length, 2);
    assert.equal(layoutHeld(layout, null), layout);
  });

  it('game.js draws the pack through it, an emptied slot as a free one', () => {
    const game = readFileSync(join(GAME_DIR, 'public/game.js'), 'utf8');
    const bar = game.slice(game.indexOf('function renderPackBar() {'), game.indexOf('/** G255: the quest log markup'));
    assert.match(bar, /layoutHeld\(features\.query\('packLayout', engine\), features\.query\('packHeld', engine\), features\.query\('packTakes', engine\)\)/);
    assert.match(bar, /if \(slot\.held\) \{\s+heldSlots \+= 1;\s+return;\s+\}/);
  });
});

/**
 * Austin 2026-11-24 (yes to the follow-up): Decoration Mode's move of a shared floor stack onto a shelf or
 * table (claimSharedStack: the server's whole pickup, then the site's answer sets it down in the save,
 * locked) is instant too: off the floor and on the shelf at once, locked, on the like stack of yours it
 * joins or on its own. Refused or timed out, it is back on the floor where it was; a late answer still
 * sets it on the shelf, once. The save changes only on the answer, as before.
 */
describe('a shared stack set on a shelf or table shows there at once and settles to the site\'s word', () => {
  const ROOM = 'RH_HOME_INT';
  let r;
  let state;
  before(async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/' };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.fetch = async (url) => {
      const body = String(url).includes('trade-items.json') ? TABLE : { drops: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
    };
    r = await rig({ inv: { apple: 1 }, tag: 'claim' });
    state = createDroppedItemState({ streets: { [ROOM]: [{ id: 'world-item-1', classTsid: 'apple', count: 3, x: 1000, y: 400, on: 4, decor: true }] } });
    r.engine.droppedItems = state;
    r.engine.placeOwnStack = (tsid, c, n, opts) => setDownStack(state, tsid, c, n, { x: opts.x, y: opts.y }, opts);
    r.client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [stack(hex(1), 'apple', 30, 300), stack(hex(2), 'emblem_mab', 12, 500), stack(hex(3), 'plank', 2, 600), stack(hex(4), 'plank', 5, 700), stack(hex(5), 'gem_moonstone', 3, 800)] });
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.GRODDLE_MP_BOOT;
    delete globalThis.fetch;
    delete globalThis.groddleDrops;
  });
  /** What this player sees of a class: { floor (shared), shelf (the save's rows, as drawn), pack }. */
  const seen = (c) => {
    const grown = r.s.ownGrowth(ROOM) || {};
    const rows = (state.streets[ROOM] || []).filter((x) => x.classTsid === c);
    const list = r.s.list(ROOM).filter((x) => x.classTsid === c);
    return {
      floor: list.filter((x) => !x.pendingDecor).reduce((n, x) => n + x.count, 0),
      shelf: rows.reduce((n, x) => n + x.count + (grown[x.id] || 0), 0) + list.filter((x) => x.pendingDecor).reduce((n, x) => n + x.count, 0),
      pack: r.engine.inv[c] || 0,
    };
  };
  const total = (c) => Object.values(seen(c)).reduce((a, b) => a + b, 0);
  const pickups = () => r.client.sent.filter(([k]) => k === 'ground_pickup').map(([, p]) => p);

  it('settled: onto your shelf\'s apples at once (the stubbed slow server takes 400 ms), the save\'s stack swapped in on the answer', async () => {
    const all = total('apple');
    const t0 = performance.now();
    assert.deepEqual(r.feature.claimSharedStack(hex(1), { tsid: ROOM, x: 1004, y: 400, on: 4, into: 'world-item-1' }, r.engine), { ok: true });
    const shownMs = performance.now() - t0;
    assert.deepEqual(seen('apple'), { floor: 0, shelf: 33, pack: 1 }, 'off the floor, on the shelf stack at once');
    assert.equal(state.streets[ROOM][0].count, 3, 'the save itself unchanged until the answer');
    assert.ok(shownMs < 50, `shown in ${shownMs.toFixed(1)} ms`);
    assert.deepEqual(pickups().at(-1), { id: hex(1), ox: 750 });
    await wait(SLOW_MS);
    r.client.emit('msg:ground_gone', { id: hex(1), by: { id: 7, name: 'Ada' }, why: 'picked' });
    assert.equal(total('apple'), all, 'between the two messages');
    r.client.emit('msg:ground_taken', { op: `${hex(1)}-t`, id: hex(1), status: 'settled', item: { c: 'apple', n: 30 } });
    assert.deepEqual(seen('apple'), { floor: 0, shelf: 33, pack: 1 });
    assert.deepEqual([state.streets[ROOM][0].count, r.s.ownGrowth(ROOM), r.s.claims.length], [33, null, 0]);
  });

  it('alone on a table: drawn there at once, locked (decor), a pile of 12 emblems', async () => {
    await wait(1100);
    r.feature.claimSharedStack(hex(2), { tsid: ROOM, x: 820, y: 500, on: 3, into: null }, r.engine);
    const ph = r.s.list(ROOM).find((x) => x.pendingDecor);
    assert.deepEqual([ph.classTsid, ph.count, ph.x, ph.y, ph.on, ph.decor], ['emblem_mab', 12, 820, 500, 3, true]);
    assert.equal(r.s.list(ROOM).some((x) => x.id === hex(2)), false, 'off the floor');
    r.client.emit('msg:ground_taken', { op: `${hex(2)}-t`, id: hex(2), status: 'settled', item: { c: 'emblem_mab', n: 12 } });
    const row = state.streets[ROOM].find((x) => x.classTsid === 'emblem_mab');
    assert.deepEqual([row.count, row.on, row.decor, r.s.list(ROOM).some((x) => x.pendingDecor)], [12, 3, true, false]);
  });

  it('refused: back on the floor where it was; the save unchanged', async () => {
    await wait(1100);
    const before = JSON.stringify(state);
    r.feature.claimSharedStack(hex(3), { tsid: ROOM, x: 820, y: 400, on: 4 }, r.engine);
    assert.deepEqual(seen('plank').floor, 5, 'only the other planks on the floor');
    r.client.emit('msg:ground_taken', { op: `${hex(3)}-t`, id: hex(3), status: 'refused', why: 'gone', text: 'Someone is already picking that up.' });
    const back = r.s.list(ROOM).find((x) => x.id === hex(3));
    assert.deepEqual([back.count, back.x, JSON.stringify(state)], [2, 600 + 750, before]);
  });

  it('timed out: back on the floor; a late answer sets it on the shelf, once, never in the pack', async () => {
    await wait(1100);
    r.feature.claimSharedStack(hex(3), { tsid: ROOM, x: 900, y: 400, on: 4 }, r.engine);
    r.s.tick(Date.now() + 16000);
    assert.equal(r.s.list(ROOM).find((x) => x.id === hex(3))?.x, 600 + 750, 'back where it was');
    assert.equal(r.s.claims.length, 0);
    r.client.emit('msg:ground_gone', { id: hex(3), by: { id: 7, name: 'Ada' }, why: 'picked' });
    r.client.emit('msg:ground_taken', { op: `${hex(3)}-t`, id: hex(3), status: 'settled', item: { c: 'plank', n: 2 } });
    r.client.emit('msg:ground_taken', { op: `${hex(3)}-t`, id: hex(3), status: 'settled', item: { c: 'plank', n: 2 } });
    const rows = state.streets[ROOM].filter((x) => x.classTsid === 'plank');
    assert.deepEqual([rows.map((x) => [x.count, x.x, x.on]), r.engine.inv.plank], [[[2, 900, 4]], undefined]);
  });

  it('a quick burst: each off the floor and on the shelf at once, sent one at a time; nothing lost or twice', async () => {
    await wait(1100);
    r.client.emit('msg:ground_added', { stack: stack(hex(6), 'gem_moonstone', 2, 900) });
    const all = { plank: total('plank'), gem_moonstone: total('gem_moonstone') };
    const sentBefore = pickups().length;
    r.feature.claimSharedStack(hex(4), { tsid: ROOM, x: 300, y: 400, on: 4 }, r.engine);
    r.feature.claimSharedStack(hex(5), { tsid: ROOM, x: 400, y: 400, on: 4 }, r.engine);
    r.feature.claimSharedStack(hex(6), { tsid: ROOM, x: 1400, y: 400, on: 5 }, r.engine);
    assert.deepEqual([seen('plank').floor, seen('gem_moonstone').floor], [0, 0], 'all three off the floor at once');
    assert.deepEqual([seen('plank').shelf, seen('gem_moonstone').shelf], [7, 5], 'and on the shelves');
    assert.equal(pickups().length - sentBefore, 1, 'one weighed at a time');
    for (const [id, c, n] of [[hex(4), 'plank', 5], [hex(5), 'gem_moonstone', 3], [hex(6), 'gem_moonstone', 2]]) {
      assert.equal(pickups().at(-1).id, id, 'in order');
      r.client.emit('msg:ground_gone', { id, by: { id: 7, name: 'Ada' }, why: 'picked' });
      r.client.emit('msg:ground_taken', { op: `${id}-t`, id, status: 'settled', item: { c, n } });
      assert.deepEqual([total('plank'), total('gem_moonstone')], [all.plank, all.gem_moonstone], `after ${id}`);
      await wait(20);
    }
    assert.deepEqual([r.s.claims.length, r.s.ownGrowth(ROOM), state.streets[ROOM].filter((x) => x.classTsid === 'gem_moonstone').length], [0, null, 2]);
  });
});
