/**
 * A stack never moves when its count changes (player report on v0.7.0: a
 * stack of planks in a bag filled up while harvesting and the full stack
 * jumped to the pack row; the new planks took its place in the bag).
 *
 * Cause: the inventory keeps one count per class and pack-slots.js layoutPack
 * split that count again on every look, full stacks first, handing them out
 * in the order the saved places were read: the pack's places before the
 * bags'. Once a class had a stack in the pack and one in a bag, the pack's
 * place always got the full stack and the bag got the rest, so the stacks
 * swapped the moment the count changed (more or fewer).
 *
 * Fix: each saved stack keeps its own count (prefs.n). The source
 * (glitch-GameServerJS, CC0), items/bag.js addItemStack: limited bags first
 * (:157-188), then top up the stacks held, the pack's before the bags' (the
 * pack is the first candidate, :120-122; :191-206 skips a full stack), then
 * what is left goes in the first free slot, the pack before its bags
 * (:208-232). Taking away, removeItemStackClass (:316-334) and
 * removeItemStackClassExact (:337-404) take from the first matching slot,
 * going into a bag where it sits. Nothing held moves either way.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ITEM_CATALOG, addItem, isToolItem, removeItem } from '../public/js/inventory.js?v=91ee49cd';
import { PACK_CAPACITY, layoutPack, moveStack, normalizePrefs, roomFor, stackMaxOf } from '../public/js/pack-slots.js?v=44e00ce9';
import { vendorBuy } from '../public/js/vendor.js?v=01acb225';
import { bagsFeature } from '../public/js/features/bags-feature.js?v=49d1e351';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const OPTS = { capacity: PACK_CAPACITY, catalog: ITEM_CATALOG, isTool: isToolItem, order: Object.keys(ITEM_CATALOG) };
const MAX = stackMaxOf('plank', ITEM_CATALOG);

/** Every slot as text: the pack (bags as @key) and each bag, in slot order. */
function picture(layout) {
  const out = { pack: layout.pack.slots.map((s) => (s.kind === 'bag' ? `@${s.key}` : `${s.cls}:${s.count}`)) };
  for (const box of Object.values(layout.bags)) out[box.key] = box.slots.map((s) => `${s.cls}:${s.count}`);
  return out;
}

/** A Bigger Bag first in the pack with planks near full in its second slot, a few things loose. */
function fixture(planks = MAX - 2) {
  const inv = {};
  addItem(inv, 'bag_bigger', 1);
  addItem(inv, 'cherry', 5);
  addItem(inv, 'plank', planks);
  addItem(inv, 'apple', 3);
  addItem(inv, 'grain', 2);
  const prefs = {
    bags: [{ key: 'b1', cls: 'bag_bigger' }],
    place: { pack: ['@b1', 'apple', 'grain'], b1: ['cherry', 'plank'] },
    n: { pack: [0, 3, 2], b1: [5, planks] },
  };
  return { inv, prefs: layoutPack(inv, prefs, OPTS).prefs };
}

describe('a stack that fills in a bag stays put', () => {
  it('the full stack stays in its bag slot and only the rest opens a stack, in the pack first (bag.js:191-232)', () => {
    const { inv, prefs } = fixture();
    const before = picture(layoutPack(inv, prefs, OPTS));
    assert.deepEqual(before, { pack: ['@b1', 'apple:3', 'grain:2'], b1: ['cherry:5', `plank:${MAX - 2}`] });
    addItem(inv, 'plank', 5);
    const l1 = layoutPack(inv, prefs, OPTS);
    assert.deepEqual(picture(l1), { pack: ['@b1', 'apple:3', 'grain:2', 'plank:3'], b1: ['cherry:5', `plank:${MAX}`] });
    // The report: one more harvest moved the full stack out to the pack row. Not any more.
    let p = l1.prefs;
    for (let i = 1; i <= 3; i += 1) {
      addItem(inv, 'plank', 1);
      const l = layoutPack(inv, p, OPTS);
      assert.deepEqual(picture(l), { pack: ['@b1', 'apple:3', 'grain:2', `plank:${3 + i}`], b1: ['cherry:5', `plank:${MAX}`] }, `harvest ${i}`);
      p = l.prefs;
    }
    // A whole stack more: the pack's partial stack fills first (it comes first), then one new stack.
    addItem(inv, 'plank', MAX);
    const big = layoutPack(inv, p, OPTS);
    assert.deepEqual(picture(big), { pack: ['@b1', 'apple:3', 'grain:2', `plank:${MAX}`, 'plank:6'], b1: ['cherry:5', `plank:${MAX}`] });
  });

  it('a partial stack in a bag tops up before a new stack opens anywhere', () => {
    const { inv, prefs } = fixture(10);
    addItem(inv, 'plank', 7);
    assert.deepEqual(picture(layoutPack(inv, prefs, OPTS)), { pack: ['@b1', 'apple:3', 'grain:2'], b1: ['cherry:5', 'plank:17'] });
  });

  it('the pack\'s partial stack tops up before a bag\'s (the pack is the first candidate, bag.js:120-122)', () => {
    const { inv } = fixture(10);
    addItem(inv, 'plank', 4);
    const prefs = { bags: [{ key: 'b1', cls: 'bag_bigger' }], place: { pack: ['@b1', 'apple', 'grain', 'plank'], b1: ['cherry', 'plank'] }, n: { pack: [0, 3, 2, 4], b1: [5, 10] } };
    addItem(inv, 'plank', MAX);
    assert.deepEqual(picture(layoutPack(inv, prefs, OPTS)), { pack: ['@b1', 'apple:3', 'grain:2', `plank:${MAX}`], b1: ['cherry:5', `plank:${MAX - 236}`] });
  });

  it('with the pack full, the rest opens a stack in the first bag with room', () => {
    const { inv } = fixture();
    const loose = Array.from({ length: 13 }, (_, i) => `zz_full_${i}`);
    for (const c of loose) addItem(inv, c, 1);
    const prefs = layoutPack(inv, { bags: [{ key: 'b1', cls: 'bag_bigger' }], place: { pack: ['@b1', 'apple', 'grain', ...loose], b1: ['cherry', 'plank'] }, n: { pack: [0, 3, 2, ...loose.map(() => 1)], b1: [5, MAX - 2] } }, OPTS).prefs;
    addItem(inv, 'plank', 5);
    const l = layoutPack(inv, prefs, OPTS);
    assert.equal(l.free, 0);
    assert.deepEqual(picture(l).b1, ['cherry:5', `plank:${MAX}`, 'plank:3']);
    assert.equal(l.rockStacks, 0);
  });

  it('a limited bag tops up first (bag.js:157-188): spice in a Spice Rack before the pack\'s', () => {
    const inv = {};
    addItem(inv, 'bag_spicerack', 1);
    addItem(inv, 'all_spice', 30);
    const prefs = { bags: [{ key: 'b1', cls: 'bag_spicerack' }], place: { pack: ['@b1', 'all_spice'], b1: ['all_spice'] }, n: { pack: [0, 10], b1: [20] } };
    addItem(inv, 'all_spice', 5);
    assert.deepEqual(picture(layoutPack(inv, prefs, OPTS)), { pack: ['@b1', 'all_spice:10'], b1: ['all_spice:25'] });
  });

  it('using some takes from the first stack in slot order and nothing moves (bag.js:316-404)', () => {
    const { inv, prefs } = fixture();
    addItem(inv, 'plank', 5);
    const full = layoutPack(inv, prefs, OPTS);
    removeItem(inv, 'plank', 4);
    const l = layoutPack(inv, full.prefs, OPTS);
    assert.deepEqual(picture(l), { pack: ['@b1', 'apple:3', 'grain:2', 'plank:3'], b1: ['cherry:5', `plank:${MAX - 4}`] });
    // Eat an apple; the apple stack keeps its slot; eat them all and only that slot frees.
    removeItem(inv, 'apple', 1);
    let m = layoutPack(inv, l.prefs, OPTS);
    assert.deepEqual(picture(m).pack, ['@b1', 'apple:2', 'grain:2', 'plank:3']);
    removeItem(inv, 'apple', 2);
    m = layoutPack(inv, m.prefs, OPTS);
    assert.deepEqual(picture(m), { pack: ['@b1', 'grain:2', 'plank:3'], b1: ['cherry:5', `plank:${MAX - 4}`] });
  });

  it('a save from before stack counts lays out as it did, once, then holds', () => {
    const inv = {};
    addItem(inv, 'bag_bigger', 1);
    addItem(inv, 'plank', MAX + 3);
    const old = { bags: [{ key: 'b1', cls: 'bag_bigger' }], place: { pack: ['@b1', 'plank'], b1: ['plank'] } };
    const first = layoutPack(inv, old, OPTS);
    assert.deepEqual(picture(first), { pack: ['@b1', `plank:${MAX}`], b1: ['plank:3'] }, 'as before: full stacks first, in saved order');
    assert.deepEqual(first.prefs.n, { pack: [0, MAX], b1: [3] });
    addItem(inv, 'plank', 1);
    const second = layoutPack(inv, first.prefs, OPTS);
    assert.deepEqual(picture(second), { pack: ['@b1', `plank:${MAX}`], b1: ['plank:4'] });
    // The bag is in the first slot, so its planks are the first used (removeItemStackClass goes into it).
    removeItem(inv, 'plank', 2);
    assert.deepEqual(picture(layoutPack(inv, second.prefs, OPTS)), { pack: ['@b1', `plank:${MAX}`], b1: ['plank:2'] });
  });

  it('dragging a stack carries its own count, and onto a bag it tops up that bag\'s stack first', () => {
    const { inv, prefs } = fixture();
    addItem(inv, 'plank', 5);
    let l = layoutPack(inv, prefs, OPTS);
    const at = l.pack.slots.findIndex((s) => s.cls === 'plank');
    // The bag's stack is full: the 3 go into a new slot of the bag.
    let r = moveStack(inv, l.prefs, { container: 'pack', index: at }, { bag: 'b1' }, OPTS);
    assert.equal(r.ok, true);
    l = layoutPack(inv, r.prefs, OPTS);
    assert.deepEqual(picture(l), { pack: ['@b1', 'apple:3', 'grain:2'], b1: ['cherry:5', `plank:${MAX}`, 'plank:3'] });
    // Take the full one out: it moves whole, the 3 stay.
    r = moveStack(inv, l.prefs, { container: 'b1', index: 1 }, { container: 'pack' }, OPTS);
    assert.equal(r.ok, true);
    l = layoutPack(inv, r.prefs, OPTS);
    assert.deepEqual(picture(l), { pack: ['@b1', 'apple:3', 'grain:2', `plank:${MAX}`], b1: ['cherry:5', 'plank:3'] });
    // Put it back: it tops up the 3 to a full stack, and the rest takes a slot.
    r = moveStack(inv, l.prefs, { container: 'pack', index: 3 }, { bag: 'b1' }, OPTS);
    l = layoutPack(inv, r.prefs, OPTS);
    assert.deepEqual(picture(l), { pack: ['@b1', 'apple:3', 'grain:2'], b1: ['cherry:5', `plank:${MAX}`, 'plank:3'] });
  });

  it('room counts the space left in the stacks held (bag.js:516-546 canFitHowMany)', () => {
    const inv = {};
    addItem(inv, 'bag_generic', 1);
    for (let i = 0; i < 15; i += 1) addItem(inv, `zz_room_${i}`, 1);
    addItem(inv, 'plank', MAX - 2);
    for (let i = 0; i < 9; i += 1) addItem(inv, `zz_inbag_${i}`, 1);
    const prefs = layoutPack(inv, {
      bags: [{ key: 'b1', cls: 'bag_generic' }],
      place: { pack: ['@b1', ...Array.from({ length: 15 }, (_, i) => `zz_room_${i}`)], b1: ['plank', ...Array.from({ length: 9 }, (_, i) => `zz_inbag_${i}`)] },
    }, OPTS).prefs;
    assert.equal(roomFor(inv, prefs, 'plank', 10, OPTS), 2, 'pack and bag full: only the 2 the stack can take');
  });

  it('a saved count is cleaned on load', () => {
    const p = normalizePrefs({ bags: [{ key: 'b1', cls: 'bag_generic' }], place: { pack: ['@b1', 'plank', 'apple'], b1: ['cherry'] }, n: { pack: [5, -3, 'x'], b1: [2.7] } });
    assert.deepEqual(p.n, { pack: [0, 0, 0], b1: [2] });
  });
});

/** The page's own path (bags-feature.js packLayout), solo and online, then saved and loaded again. */
describe('every way more arrives keeps the stacks held where they are', () => {
  const engineFor = (mode, inv) => ({
    mode, inv, started: true, data: {}, said: [],
    setData(k, v) { this.data[k] = v; }, pushActivity(t) { this.said.push(t); }, toast() {}, param: () => null, save() {}, updateHud() {}, refreshPack() {},
    query: () => null,
  });
  const gain = {
    // A wood tree's harvest, a gift, a mail parcel and a pick up all land as addItem on the pack (inventory.js).
    harvest: (e, n) => addItem(e.inv, 'plank', n),
    gift: (e, n) => addItem(e.inv, 'plank', n),
    mail: (e, n) => addItem(e.inv, 'plank', n),
    'pick up': (e, n) => addItem(e.inv, 'plank', n),
    buy: (e, n) => assert.equal(vendorBuy({ currants: 100000 }, e.inv, [{ classTsid: 'plank', label: 'Plank', buyPrice: 2 }], 'plank', n).ok, true),
  };
  for (const mode of ['solo', 'multiplayer']) {
    for (const [how, add] of Object.entries(gain)) {
      it(`${mode}: planks by ${how} fill the bag's stack in place`, () => {
        const { inv, prefs } = fixture();
        // Online the save comes back through the site; its inventory may list classes in any order.
        const listed = mode === 'multiplayer' ? Object.fromEntries(Object.keys(inv).sort().map((c) => [c, inv[c]])) : inv;
        const e = engineFor(mode, listed);
        bagsFeature.restore(JSON.parse(JSON.stringify({ v: 1, prefs, rock: {}, open: 'b1', migrated: true, starter: 'none' })), e);
        bagsFeature.packLayout(e);
        add(e, 3);
        const filled = picture(bagsFeature.packLayout(e));
        assert.deepEqual(filled, { pack: ['@b1', 'apple:3', 'grain:2', 'plank:1'], b1: ['cherry:5', `plank:${MAX}`] });
        add(e, 2);
        const more = picture(bagsFeature.packLayout(e));
        assert.deepEqual(more, { pack: ['@b1', 'apple:3', 'grain:2', 'plank:3'], b1: ['cherry:5', `plank:${MAX}`] });
        const saved = JSON.parse(JSON.stringify(bagsFeature.save()));
        assert.deepEqual(saved.prefs.n.b1, [5, MAX], 'the save carries each stack\'s count');
        bagsFeature.restore(saved, e);
        assert.deepEqual(picture(bagsFeature.packLayout(e)), more, 'loaded again: the same slots');
        add(e, 1);
        assert.deepEqual(picture(bagsFeature.packLayout(e)), { pack: ['@b1', 'apple:3', 'grain:2', 'plank:4'], b1: ['cherry:5', `plank:${MAX}`] });
        assert.ok(!e.said.some((t) => /magic rock/.test(t)));
      });
    }
  }
});

describe('the source', () => {
  it('addItemStack tops up stacks held before a free slot, the pack first; removal takes the first slot', (t) => {
    if (!existsSync(join(GSJS, 'items/bag.js'))) return t.skip('no glitch-GameServerJS');
    const bag = readFileSync(join(GSJS, 'items/bag.js'), 'utf8');
    assert.match(bag, /items\[this\.path\] = this; \/\/ Don't forget us!/);
    assert.match(bag, /\/\/ Look for existing stacks[\s\S]*?tmp\.class_id == stack\.class_id && tmp\.stackmax != tmp\.count[\s\S]*?\/\/ Alright, we've exhausted our priorities\. Store what we can/);
    assert.match(bag, /\/\/ Removes up to count of items of type class_tsid from the bag, using the first slot that matches/);
  });
});
