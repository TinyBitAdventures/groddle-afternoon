/**
 * A bag that arrives never moves what the other bags hold (player report on
 * v0.7.0: buying a bag tipped every bag's contents out into random bags).
 *
 * Cause: layoutPack gave a new bag the first key no bag of an EARLIER class
 * had taken yet, so it could take the key of a bag held already (a Generic
 * Bag took the Red Toolbox's key b1); the new, empty bag then replaced that
 * bag's box and its stacks were laid out again into whatever had room. Bags
 * come in catalog order (vendor.js ensureVendorItems adds them in store
 * order), then inventory order, so most buys hit it, solo and online alike.
 *
 * Where the new bag goes (Austin 2026-10-31): in place of the leftmost pack
 * slot that is not a bag, as the row shows it (bags, items, tools, empty
 * slots); a stack in that slot moves into the new bag, so nothing leaves the
 * pack. Bags held, and everything in them, never move. A bag that can't hold
 * that stack takes the leftmost one it can, else an empty slot; with neither
 * the magic rock holds it and a vendor won't sell it (pack-slots.js arrivalSlot).
 *
 * The source (glitch-GameServerJS, CC0), for comparison: a vendor buy is
 * inc_stores.js:169 createItemFromSource, which is inc_items.js:521-562
 * addItemStack on the pack; bag.js:89-238 only adds the stack (the pack itself
 * is the only candidate for a bag, :120, since bag_generic.js:588-590 refuses
 * a bag in a bag) to the first free pack slot, and refuses a full pack
 * (inc_stores.js:170-173); nothing held moves.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ITEM_CATALOG, addItem, isToolItem } from '../public/js/inventory.js?v=5be47371';
import { BAG_DEFS, PACK_CAPACITY, PACK_COPY, arrangeIntoBags, bagAccepts, layoutPack, moveStack, roomFor } from '../public/js/pack-slots.js?v=4a36968a';
import { TOOL_CLASSES } from '../public/js/pack-slots-data.js?v=800f664c';
import { vendorBuy } from '../public/js/vendor.js?v=5207195b';
import { applyStarter, bagsFeature } from '../public/js/features/bags-feature.js?v=9ea775b6';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const OPTS = { capacity: PACK_CAPACITY, catalog: ITEM_CATALOG, isTool: isToolItem, order: Object.keys(ITEM_CATALOG) };
const TOOLS = [...TOOL_CLASSES].filter((c) => isToolItem(c)).slice(0, BAG_DEFS.bag_toolbox_red.capacity);

/** n distinct one-stack classes. */
const singles = (n, prefix = 'zz_bagbuy_') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** What each held bag holds, by key: class and the stacks in slot order. */
function contents(layout) {
  return Object.fromEntries(Object.values(layout.bags).map((b) => [b.key, { cls: b.cls, slots: b.slots.map((s) => `${s.cls}:${s.count}`) }]));
}
/** The pack row as the page draws it (game.js renderPack): the bags, then items, then tools. */
const bagRow = (layout) => layout.pack.slots.filter((s) => s.kind === 'bag').map((s) => `@${s.key}:${s.cls}`);
function stackRow(layout) {
  const stacks = layout.pack.slots.filter((s) => s.kind === 'stack');
  return [...stacks.filter((s) => !isToolItem(s.cls)), ...stacks.filter((s) => isToolItem(s.cls))].map((s) => `${s.cls}:${s.count}`);
}

/**
 * A pack laid out by hand (as drags leave it): a Bigger Bag, a Red Toolbox and
 * a Generic Bag, each holding its own stacks, and stacks loose: a tool saved
 * first in the pack (the row still shows it after the items), then items.
 * full: the Bigger Bag and the toolbox are full to the last slot.
 */
function fixture(full) {
  const boxTools = full ? TOOLS.slice(0, BAG_DEFS.bag_toolbox_red.capacity) : TOOLS.slice(0, 3);
  const bigger = full ? singles(BAG_DEFS.bag_bigger.capacity, 'zz_big_') : ['cherry', 'apple', 'zz_big_0'];
  const generic = ['grain', 'meat'];
  const inv = {};
  // Bigger Bag listed first, the toolbox after it: an order the key bug needed.
  addItem(inv, 'bag_bigger', 1);
  addItem(inv, 'bag_toolbox_red', 1);
  addItem(inv, 'bag_generic', 1);
  for (const c of boxTools) addItem(inv, c, 1);
  for (const c of [...bigger, ...generic, 'orange', 'zz_loose_0', 'all_spice']) addItem(inv, c, c === 'cherry' ? 12 : 1);
  const looseTool = full ? null : TOOLS[3];
  if (looseTool) addItem(inv, looseTool, 1);
  const prefs = {
    bags: [{ key: 'b1', cls: 'bag_bigger' }, { key: 'b2', cls: 'bag_toolbox_red' }, { key: 'b3', cls: 'bag_generic' }],
    place: { pack: ['@b1', ...(looseTool ? [looseTool] : []), '@b2', 'orange', '@b3', 'zz_loose_0', 'all_spice'], b1: bigger, b2: boxTools, b3: generic },
  };
  const layout = layoutPack(inv, prefs, OPTS);
  assert.equal(layout.rockStacks, 0, 'the fixture fits');
  assert.deepEqual(contents(layout).b2.slots, boxTools.map((c) => `${c}:1`), 'the fixture lays out as saved');
  return { inv, prefs: layout.prefs, layout, looseTool };
}

/** The stack (row text) a new bag of this class takes in: the leftmost it can hold, or null for an empty slot. */
function expectedSwallow(before, cls) {
  const def = BAG_DEFS[cls];
  return stackRow(before).find((e) => bagAccepts(def, e.split(':')[0], OPTS)) || null;
}

/** Austin 2026-10-31: the new bag after the bags held, the stack it took inside it, the rest unmoved. */
function assertArrived(before, after, cls) {
  const was = contents(before);
  const now = contents(after);
  for (const [key, bag] of Object.entries(was)) assert.deepEqual(now[key], bag, `${key} (${bag.cls}) keeps its stacks in their slots`);
  const bags = bagRow(after);
  assert.deepEqual(bags.slice(0, -1), bagRow(before), 'the bags held keep their places, the new one comes after them');
  const [key, landedCls] = bags.at(-1).slice(1).split(':');
  assert.equal(landedCls, cls);
  assert.ok(!was[key], 'with a key of its own');
  const took = expectedSwallow(before, cls);
  if (took) {
    assert.deepEqual(now[key].slots, [took], `the leftmost stack it can hold (${took}) moves into it`);
    const rest = [...stackRow(before)];
    rest.splice(rest.indexOf(took), 1);
    assert.deepEqual(stackRow(after), rest, 'every other stack stays in the pack, in order');
    assert.equal(after.used, before.used, 'it takes that stack\'s slot');
  } else {
    assert.deepEqual(now[key].slots, [], 'nothing it can hold: it takes an empty slot');
    assert.deepEqual(stackRow(after), stackRow(before));
    assert.equal(after.used, before.used + 1);
  }
  assert.equal(after.rockStacks, before.rockStacks, 'nothing goes to the magic rock');
}

describe('buying a bag keeps every bag\'s contents', () => {
  for (const full of [true, false]) {
    for (const cls of Object.keys(BAG_DEFS)) {
      it(`${full ? 'full' : 'partly full'} bags, buying a ${cls}`, () => {
        const { inv, prefs, layout } = fixture(full);
        const pc = { currants: 10000 };
        assert.equal(roomFor(inv, prefs, cls, 1, OPTS), 1);
        const r = vendorBuy(pc, inv, [{ classTsid: cls, label: cls, buyPrice: 10 }], cls, 1);
        assert.equal(r.ok, true);
        const after = layoutPack(inv, prefs, OPTS);
        assertArrived(layout, after, cls);
        // And the next look (the saved arrangement) is the same again.
        const again = layoutPack(inv, after.prefs, OPTS);
        assert.deepEqual(contents(again), contents(after));
        assert.deepEqual(again.pack.slots, after.pack.slots);
      });
    }
  }

  it('an item leftmost: it ends up inside the new bag', () => {
    const { inv, prefs, layout } = fixture(false);
    assert.equal(stackRow(layout)[0], 'orange:1');
    addItem(inv, 'bag_generic_blue', 1);
    const after = layoutPack(inv, prefs, OPTS);
    const fresh = Object.values(after.bags).find((b) => b.cls === 'bag_generic_blue');
    assert.deepEqual(fresh.slots.map((s) => s.cls), ['orange']);
    assert.ok(!after.pack.slots.some((s) => s.cls === 'orange'));
    assertArrived(layout, after, 'bag_generic_blue');
  });

  it('a tool saved first in the pack is not the leftmost: the row shows items before tools', () => {
    const { inv, prefs, layout, looseTool } = fixture(false);
    assert.equal(layout.pack.slots[1].cls, looseTool);
    addItem(inv, 'bag_bigger', 1);
    const after = layoutPack(inv, prefs, OPTS);
    assert.ok(after.pack.slots.some((s) => s.cls === looseTool), 'the tool stays in the pack');
    assertArrived(layout, after, 'bag_bigger');
  });

  it('a toolbox takes the leftmost tool, past the items it can\'t hold', () => {
    const { inv, prefs, layout, looseTool } = fixture(false);
    addItem(inv, 'bag_toolbox_green', 1);
    const after = layoutPack(inv, prefs, OPTS);
    const fresh = Object.values(after.bags).find((b) => b.cls === 'bag_toolbox_green');
    assert.deepEqual(fresh.slots.map((s) => s.cls), [looseTool]);
    assertArrived(layout, after, 'bag_toolbox_green');
  });

  it('an empty slot leftmost (no stack loose): the bag takes it and arrives empty', () => {
    const inv = { bag_bigger: 1, cherry: 3 };
    const prefs = { bags: [{ key: 'b1', cls: 'bag_bigger' }], place: { pack: ['@b1'], b1: ['cherry'] } };
    const before = layoutPack(inv, prefs, OPTS);
    assert.equal(before.used, 1);
    addItem(inv, 'bag_generic', 1);
    const after = layoutPack(inv, before.prefs, OPTS);
    assertArrived(before, after, 'bag_generic');
    assert.deepEqual(bagRow(after).map((e) => e.split(':')[1]), ['bag_bigger', 'bag_generic']);
  });

  it('bags first, then items: the new bag joins the bags, ahead of every item', () => {
    const { inv, prefs, layout } = fixture(false);
    addItem(inv, 'bag_bigger_pink', 1);
    const after = layoutPack(inv, prefs, OPTS);
    assert.deepEqual(bagRow(after).map((e) => e.split(':')[1]), ['bag_bigger', 'bag_toolbox_red', 'bag_generic', 'bag_bigger_pink']);
    const lastBag = after.pack.slots.findLastIndex((x) => x.kind === 'bag');
    assert.ok(after.pack.slots.slice(lastBag + 1).every((x) => x.kind === 'stack') && after.pack.slots[lastBag].cls === 'bag_bigger_pink', 'saved right after the last bag');
    assertArrived(layout, after, 'bag_bigger_pink');
  });

  it('a full pack of stacks still takes a bag: the leftmost stack goes into it, nothing leaves', () => {
    const inv = {};
    for (const c of singles(16, 'zz_fill_')) addItem(inv, c, 1);
    const before = layoutPack(inv, null, OPTS);
    assert.equal(before.free, 0);
    assert.equal(roomFor(inv, before.prefs, 'bag_generic', 1, OPTS), 1);
    addItem(inv, 'bag_generic', 1);
    const after = layoutPack(inv, before.prefs, OPTS);
    assertArrived(before, after, 'bag_generic');
    assert.deepEqual(Object.values(after.bags)[0].slots.map((s) => s.cls), ['zz_fill_0']);
  });

  it('no non-bag slot it can take: the magic rock holds it, and a vendor refuses the sale', () => {
    // Sixteen bags: no slot that is not a bag.
    const bags = {};
    for (let i = 0; i < PACK_CAPACITY; i += 1) addItem(bags, i % 2 ? 'bag_generic' : 'bag_bigger', 1);
    const allBags = layoutPack(bags, null, OPTS);
    assert.equal(allBags.free, 0);
    assert.equal(roomFor(bags, allBags.prefs, 'bag_bigger', 1, OPTS), 0, 'the shop says there is no room (inc_stores.js:170-173)');
    addItem(bags, 'bag_bigger', 1);
    const rocked = layoutPack(bags, allBags.prefs, OPTS);
    assert.equal(rocked.rockBags.length, 1, 'a reward or gift bag waits in the magic rock');
    for (const [key, bag] of Object.entries(contents(allBags))) assert.deepEqual(contents(rocked)[key], bag);
    // A full pack of food and a toolbox: nothing it can hold, no empty slot.
    const food = {};
    for (const c of singles(16, 'zz_food_')) addItem(food, c, 1);
    const foodPack = layoutPack(food, null, OPTS);
    assert.equal(roomFor(food, foodPack.prefs, 'bag_toolbox_red', 1, OPTS), 0);
    assert.equal(PACK_COPY.buyNone, "You can't buy that -- there's no more room in your inventory!");
  });

  it('whatever order the inventory lists its bags in', () => {
    const { inv, prefs, layout } = fixture(true);
    const bagKeys = ['bag_bigger', 'bag_toolbox_red', 'bag_generic'];
    const rest = Object.keys(inv).filter((c) => !bagKeys.includes(c));
    const orders = [bagKeys, [...bagKeys].reverse(), ['bag_generic', 'bag_bigger', 'bag_toolbox_red'], [...bagKeys].sort()];
    for (const buy of ['bag_bigger', 'bag_toolbox_red', 'bag_generic', 'bag_bigger_green', 'bag_elemental_pouch']) {
      for (const order of orders) {
        const held = { ...inv, [buy]: (inv[buy] || 0) + 1 };
        const listed = Object.fromEntries([...order, buy, ...rest].map((c) => [c, held[c]]));
        assertArrived(layout, layoutPack(listed, prefs, OPTS), buy);
      }
    }
  });

  it('two bags at once, then a third: each takes the next leftmost slot', () => {
    const { inv, prefs, layout } = fixture(false);
    addItem(inv, 'bag_bigger', 2);
    const two = layoutPack(inv, prefs, OPTS);
    for (const [key, bag] of Object.entries(contents(layout))) assert.deepEqual(contents(two)[key], bag);
    const fresh = Object.values(two.bags).filter((b) => !contents(layout)[b.key]);
    assert.deepEqual(fresh.map((b) => b.slots.map((s) => s.cls)), [['orange'], ['zz_loose_0']]);
    addItem(inv, 'bag_toolbox_red', 1);
    const three = layoutPack(inv, two.prefs, OPTS);
    assertArrived(two, three, 'bag_toolbox_red');
  });

  it('a stack moved by hand stays put when a bag arrives after it', () => {
    const { inv, prefs } = fixture(false);
    const at = layoutPack(inv, prefs, OPTS).pack.slots.findIndex((s) => s.cls === 'orange');
    const moved = moveStack(inv, prefs, { container: 'pack', index: at }, { bag: 'b1' }, OPTS);
    assert.equal(moved.ok, true);
    const before = layoutPack(inv, moved.prefs, OPTS);
    assert.ok(contents(before).b1.slots.includes('orange:1'));
    addItem(inv, 'bag_generic', 1);
    assertArrived(before, layoutPack(inv, moved.prefs, OPTS), 'bag_generic');
  });

  it('a bag that leaves frees its key for nothing held: the others keep theirs', () => {
    const { inv, prefs, layout } = fixture(false);
    inv.bag_toolbox_red = 0;
    const gone = layoutPack(inv, prefs, OPTS);
    assert.deepEqual(contents(gone).b1, contents(layout).b1);
    assert.deepEqual(contents(gone).b3, contents(layout).b3);
    addItem(inv, 'bag_bigger', 1);
    const back = layoutPack(inv, gone.prefs, OPTS);
    assert.deepEqual(contents(back).b1, contents(layout).b1);
    assert.deepEqual(contents(back).b3, contents(layout).b3);
  });
});

/** The page's own path: the bags feature's layout before and after, solo and online. */
describe('through the bags feature (every way a bag arrives adds it to the pack)', () => {
  const engineFor = (mode, inv) => ({
    mode, inv, started: true, data: {}, said: [], applied: new Set(),
    setData(k, v) { this.data[k] = v; }, pushActivity(t) { this.said.push(t); }, toast() {}, param: () => null, save() {}, updateHud() {}, refreshPack() {},
    query(name, id) { if (name !== 'ledgerReceipt') return null; if (this.applied.has(id)) return false; this.applied.add(id); return true; },
  });

  for (const mode of ['solo', 'multiplayer']) {
    for (const how of ['vendor', 'quest reward', 'gift', 'mail', 'pick up', 'made']) {
      it(`${mode}: a Bigger Bag by ${how}`, () => {
        const { inv, prefs } = fixture(true);
        // Online the save comes back through the site; its inventory may list classes in any order.
        const listed = mode === 'multiplayer' ? Object.fromEntries(Object.keys(inv).sort().map((c) => [c, inv[c]])) : inv;
        const e = engineFor(mode, listed);
        bagsFeature.restore(JSON.parse(JSON.stringify({ v: 1, prefs, rock: {}, open: 'b2', migrated: true, starter: 'none' })), e);
        const before = bagsFeature.packLayout(e);
        if (how === 'vendor') assert.equal(vendorBuy({ currants: 500 }, e.inv, [{ classTsid: 'bag_bigger', label: 'Bigger Bag', buyPrice: 100 }], 'bag_bigger', 1).ok, true);
        else addItem(e.inv, 'bag_bigger', 1);
        const after = bagsFeature.packLayout(e);
        assertArrived(before, after, 'bag_bigger');
        assert.equal(bagsFeature.packOpenBag(), 'b2', 'the open bag stays open on the same bag');
        // Saved and loaded again: still the same.
        const saved = JSON.parse(JSON.stringify(bagsFeature.save()));
        bagsFeature.restore(saved, e);
        assert.deepEqual(contents(bagsFeature.packLayout(e)), contents(after));
        assert.ok(!e.said.some((t) => /magic rock/.test(t)), 'nothing goes to the magic rock');
      });
    }
  }

  it('starter bags for a character who already had a bag keep that bag\'s contents', () => {
    const inv = {};
    addItem(inv, 'bag_generic', 1);
    for (const c of singles(30, 'zz_start_')) addItem(inv, c, 1);
    const e = engineFor('multiplayer', inv);
    const held = singles(10, 'zz_start_').slice(5).concat(['zz_start_29']);
    bagsFeature.restore({ v: 1, migrated: true, prefs: { bags: [{ key: 'b1', cls: 'bag_generic' }], place: { pack: ['@b1'], b1: held } } }, e);
    const before = bagsFeature.packLayout(e);
    assert.deepEqual(contents(before).b1.slots.slice(0, held.length), held.map((c) => `${c}:1`));
    assert.equal(applyStarter(e, { status: 'granted', trade: 'starter-bags-7', got: { items: [{ c: 'bag_bigger', n: 2 }], currants: 0 } }), true);
    const after = bagsFeature.packLayout(e);
    assert.deepEqual(contents(after).b1, contents(before).b1, 'the Generic Bag keeps what it held');
    assert.equal(after.pack.slots[0].key, 'b1', 'and its pack slot');
    assert.equal(after.rockStacks, 0);
    const fresh = Object.values(after.bags).filter((b) => b.key !== 'b1');
    assert.deepEqual(fresh.map((b) => b.cls), ['bag_bigger', 'bag_bigger']);
    const inFresh = fresh.flatMap((b) => b.slots.map((s) => s.cls));
    const inB1 = contents(before).b1.slots.map((s) => s.split(':')[0]);
    assert.ok(!inFresh.some((c) => inB1.includes(c)), 'the new bags take only what was outside a bag');
  });

  it('starter bags with no bag held lay out as before (b1, b2 in mint order)', () => {
    const inv = {};
    for (const c of ['pick', 'hoe', 'watering_can', 'hatchet']) addItem(inv, c, 1);
    for (const c of singles(20)) addItem(inv, c, 1);
    addItem(inv, 'bag_toolbox_red', 1);
    addItem(inv, 'bag_bigger', 1);
    const plain = arrangeIntoBags(inv, ['bag_toolbox_red', 'bag_bigger'], OPTS);
    assert.deepEqual(arrangeIntoBags(inv, ['bag_toolbox_red', 'bag_bigger'], OPTS, { bags: [], place: { pack: ['zz_bagbuy_0'] } }), plain);
    assert.deepEqual(plain.bags, [{ key: 'b1', cls: 'bag_toolbox_red' }, { key: 'b2', cls: 'bag_bigger' }]);
  });
});

describe('the source', () => {
  it('a vendor buy only adds the bag to a free pack slot (inc_stores.js:169, bag.js:89-238)', (t) => {
    if (!existsSync(join(GSJS, 'items/bag.js'))) return t.skip('no glitch-GameServerJS');
    const stores = readFileSync(join(GSJS, 'players/inc_stores.js'), 'utf8');
    assert.match(stores, /var remainder = this\.createItemFromSource\(msg\.class_tsid, count, item, true\);/);
    const items = readFileSync(join(GSJS, 'players/inc_items.js'), 'utf8');
    assert.match(items, /function createItemFromSource\(class_id, num, sourceItem, destroy_remainder, props\)\{[\s\S]*?var remaining = this\.addItemStack\(s\);/);
    const bag = readFileSync(join(GSJS, 'items/bag.js'), 'utf8');
    assert.match(bag, /items\[this\.path\] = this; \/\/ Don't forget us!/);
    const generic = readFileSync(join(GSJS, 'items/bag_generic.js'), 'utf8');
    assert.match(generic, /function canContain\(stack\)\{[^\n]*\n\treturn stack\.getProp\('is_bag'\)[^\n]*\? 0/);
  });
});
