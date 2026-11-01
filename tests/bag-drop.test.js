/**
 * Dropping a bag (player report 2026-11-01, ticket 13 follow-up): the game
 * dropped the newest bag of a colour whichever one was chosen, and tipped what
 * the bag held out into the pack and the other bags first. In the source a bag
 * goes down whole with what it holds (items/include/takeable.js takeable_drop
 * 157-213 moves the bag itemstack; takeable_drop_conditions 104-135 lets it go
 * unless something in it is locked to you, 122-130) and comes back up with it
 * all inside (takeable_pickup; a bag only sits in the pack's own row,
 * bag_generic.js canContain 588-590).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bagLeavesLast, giveBag, layoutPack, takeBag, unitPlaces } from '../public/js/pack-slots.js?v=44e00ce9';
import {
  createDroppedItemState,
  dropInventoryStack,
  parseDroppedItemState,
  placeDroppedBag,
  serializeDroppedItemState,
  takeDroppedRecord,
} from '../public/js/world-items.js?v=908b061e';
import { bindToolInventory, createToolConditionState, pickToolCopies, placeToolCopies, toolCopies } from '../public/js/tools.js?v=3d109172';

const root = join(import.meta.dirname, '..');

/** Two Blue Bags: b1 empty-ish, b2 holding planks and apples; a cherry stack in the pack. */
function twoBags() {
  const inv = { bag_generic_blue: 2, plank: 30, apple: 5, cherry: 3, grain: 2 };
  const prefs = {
    bags: [{ key: 'b1', cls: 'bag_generic_blue' }, { key: 'b2', cls: 'bag_generic_blue' }],
    place: { pack: ['@b1', '@b2', 'cherry'], b1: ['grain'], b2: ['plank', 'apple'] },
    n: { pack: [0, 0, 3], b1: [2], b2: [30, 5] },
  };
  return { inv, prefs };
}

describe('takeBag: the chosen bag leaves with what it holds', () => {
  it('takes the bag the player chose, not the newest of its colour, and moves nothing else', () => {
    const { inv, prefs } = twoBags();
    const first = takeBag(inv, prefs, 'b1');
    assert.equal(first.ok, true);
    assert.deepEqual(first.contents, [{ cls: 'grain', count: 2 }]);
    const after = { ...inv, bag_generic_blue: 1, grain: 0 };
    const layout = layoutPack(after, first.prefs);
    assert.deepEqual(Object.keys(layout.bags), ['b2']);
    assert.deepEqual(layout.bags.b2.slots.map((s) => [s.cls, s.count]), [['plank', 30], ['apple', 5]]);
    assert.deepEqual(layout.pack.slots.map((s) => s.cls || s.key), ['bag_generic_blue', 'cherry']);
    assert.equal(layout.rockStacks, 0);
  });

  it('nothing it held slips into the pack or another bag, even with free slots', () => {
    const { inv, prefs } = twoBags();
    const res = takeBag(inv, prefs, 'b2');
    assert.deepEqual(res.contents, [{ cls: 'plank', count: 30 }, { cls: 'apple', count: 5 }]);
    const after = { ...inv, bag_generic_blue: 1, plank: 0, apple: 0 };
    const layout = layoutPack(after, res.prefs);
    assert.deepEqual(layout.bags.b1.slots.map((s) => s.cls), ['grain']);
    assert.ok(!layout.pack.slots.some((s) => s.cls === 'plank' || s.cls === 'apple'));
  });

  it('an empty bag drop (shared or not) takes the chosen bag: it goes last among its colour', () => {
    const { inv, prefs } = twoBags();
    const next = bagLeavesLast(prefs, 'b1');
    assert.deepEqual(next.bags.map((b) => b.key), ['b2', 'b1']);
    // One Blue Bag fewer: b1 is the one gone, b2 keeps its things.
    const layout = layoutPack({ ...inv, bag_generic_blue: 1, grain: 0 }, next);
    assert.deepEqual(Object.keys(layout.bags), ['b2']);
  });
});

describe('giveBag: it comes back with everything inside', () => {
  it('into a free pack slot beside the other bags, its stacks in their order and counts', () => {
    const { inv, prefs } = twoBags();
    const res = takeBag(inv, prefs, 'b2');
    const left = { ...inv, bag_generic_blue: 1, plank: 0, apple: 0 };
    const back = giveBag(left, res.prefs, 'bag_generic_blue', res.contents);
    assert.equal(back.ok, true);
    const layout = layoutPack({ ...left, bag_generic_blue: 2, plank: 30, apple: 5 }, back.prefs);
    assert.deepEqual(layout.bags[back.key].slots.map((s) => [s.cls, s.count]), [['plank', 30], ['apple', 5]]);
    assert.deepEqual(layout.pack.slots.slice(0, 2).map((s) => s.kind), ['bag', 'bag']);
    assert.equal(layout.rockStacks, 0);
  });

  it('a full pack takes it in place of the leftmost stack it can hold, which goes in with it; a full bag in a full pack is refused', () => {
    const inv = { bag_generic: 1 };
    const fill = ['apple', 'cherry', 'grain', 'meat', 'orange', 'lemon', 'spinach', 'plain_bubble', 'general_vapour', 'all_spice', 'seed_spinach', 'seed_onion', 'seed_carrot', 'fuel_cell', 'pinch_of_salt'];
    for (const c of fill) inv[c] = 1;
    const prefs = layoutPack(inv, null).prefs;
    assert.equal(layoutPack(inv, prefs).free, 0);
    const some = giveBag(inv, prefs, 'bag_generic_blue', [{ cls: 'plank', count: 4 }]);
    assert.equal(some.ok, true);
    const out = layoutPack({ ...inv, bag_generic_blue: 1, plank: 4 }, some.prefs);
    assert.deepEqual(out.bags[some.key].slots.map((s) => s.cls), ['plank', 'apple']);
    assert.equal(out.rockStacks, 0);
    const full = Array.from({ length: 10 }, (_, i) => ({ cls: ['flour', 'bun', 'sammich', 'egg_plain', 'bean_plain', 'milk_butterfly', 'seed_tomato', 'seed_corn', 'seed_potato', 'herb_seed_purple_flower'][i], count: 1 }));
    assert.deepEqual(giveBag(inv, prefs, 'bag_generic_blue', full), { ok: false, reason: 'full' });
  });
});

describe('the dropped bag on the ground (js/world-items.js)', () => {
  it('keeps what it holds through a save and never merges', () => {
    const state = createDroppedItemState();
    const a = placeDroppedBag(state, 'POL_home', 'bag_generic_blue', [{ cls: 'plank', count: 30 }, { cls: 'pick', count: 1, points: [42] }], { x: 100, y: 200 }, { now: 1 });
    const b = placeDroppedBag(state, 'POL_home', 'bag_generic_blue', [], { x: 104, y: 200 }, { now: 2 });
    assert.notEqual(a.stack.id, b.stack.id);
    const inv = { bag_generic_blue: 1 };
    const merged = dropInventoryStack(state, inv, 'POL_home', 'bag_generic_blue', 1, { x: 100, y: 200 }, { now: 3 });
    assert.equal(merged.merged, true, 'an empty bag still stacks on an empty one');
    const back = parseDroppedItemState(serializeDroppedItemState(state));
    const full = back.streets.POL_home.find((r) => r.id === a.stack.id);
    assert.deepEqual(full.contents, [{ classTsid: 'plank', count: 30 }, { classTsid: 'pick', count: 1, points: [42] }]);
    assert.equal(full.count, 1);
    const taken = takeDroppedRecord(back, 'POL_home', a.stack.id);
    assert.equal(taken.contents.length, 2);
    assert.equal(back.streets.POL_home.some((r) => r.id === a.stack.id), false);
  });
});

describe("a dropped toolbox's tools keep their wear", () => {
  it('pickToolCopies takes the bag\'s copies out in order; placeToolCopies puts them back where they sit', () => {
    const inv = { pick: 3 };
    const tools = bindToolInventory(createToolConditionState(), inv);
    toolCopies(tools, 'pick');
    tools.condition.pick.copies = [10, 20, 30];
    assert.deepEqual(pickToolCopies(tools, 'pick', [1]), [20]);
    assert.deepEqual(tools.condition.pick.copies, [10, 30, 20]);
    inv.pick = 2;
    assert.deepEqual(toolCopies(tools, 'pick').map((c) => c.remaining), [10, 30]);
    inv.pick = 3;
    placeToolCopies(tools, 'pick', [1], [20]);
    assert.deepEqual(tools.condition.pick.copies, [10, 20, 30]);
  });

  it('unitPlaces lists a bag\'s tools where the bag sits', () => {
    const inv = { bag_toolbox_red: 1, pick: 2, hoe: 1 };
    const prefs = { bags: [{ key: 'b1', cls: 'bag_toolbox_red' }], place: { pack: ['pick', '@b1'], b1: ['pick', 'hoe'] }, n: { pack: [1, 0], b1: [1, 1] } };
    const layout = layoutPack(inv, prefs);
    assert.deepEqual(unitPlaces(layout, 'pick'), [{ container: 'pack', index: 0 }, { container: 'b1', index: 0 }]);
  });
});

describe('game.js and the bags feature', () => {
  const game = readFileSync(join(root, 'public/game.js'), 'utf8');
  const bags = readFileSync(join(root, 'public/js/features/bags-feature.js'), 'utf8');

  it("a bag's Drop drops the bag its menu is about, with no count chooser", () => {
    assert.match(game, /if \(isBagClass\(classTsid\)\) \{\s*dropPackBag\(classTsid, packSelectedBag/);
    assert.match(game, /if \(anchor\?\.dataset\?\.packBag\) packSelectedBag = anchor\.dataset\.packBag;/);
    assert.match(game, /findPackSlotElement\(classTsid, packSelectedCopy, packSelectedBag(, packSelectedPlace)?\)/);
  });

  it("refuses a bag holding something locked to you, with the source's words (takeable.js:128)", () => {
    assert.match(game, /This contains items locked to you and can't be dropped\./);
  });

  it('a bag with things in it stays the player\'s own; an empty one drops as any stack (shared online)', () => {
    const fn = game.slice(game.indexOf('function dropPackBag('), game.indexOf('function pickupDroppedBag('));
    assert.match(fn, /packBagLeaves[\s\S]*dropPackItem\(classTsid, 1\)/);
    assert.match(fn, /packTakeBag[\s\S]*placeDroppedBag/);
    assert.doesNotMatch(fn, /sharedDrop/);
  });

  it('picking it up asks for room for the bag with its contents', () => {
    assert.match(game, /if \(target\?\.state\?\.contents\?\.length\) return pickupDroppedBag\(target\);/);
    assert.match(bags, /packBagRoom\(cls, contents, engine\)/);
  });
});
