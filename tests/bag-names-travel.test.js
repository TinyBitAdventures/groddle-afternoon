/**
 * Ticket 241: a bag goes by its own label everywhere (items/bag_bigger.js getLabel 592-598: its
 * user_name, which a sort sets when the bag had none, bag.js doSpecialize 796-799): the
 * decoration tray's caption, a cabinet's slot, the ground. A dropped or stored bag takes its
 * name and its specialization with it and comes back with both.
 * Run: node --test tests/bag-names-travel.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bagKeep, giveBag, layoutPack, ownBagLabel, takeBag } from '../public/js/pack-slots.js?v=4a36968a';
import { createDroppedItemState, parseDroppedItemState, placeDroppedBag, serializeDroppedItemState, takeDroppedRecord } from '../public/js/world-items.js?v=5e592293';
import { cabinetPut, cabinetTake, normalizeContents, slotHoldsBag } from '../public/js/home-storage.js?v=b0225465';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** A Blue Bag sorted for crops with the sort's name, and a Gray Bag the player named. */
function bags() {
  const inv = { bag_generic_blue: 1, bag_generic_gray: 1, cherry: 3 };
  const prefs = {
    bags: [{ key: 'b1', cls: 'bag_generic_blue', sort: 'sort_crops', sortNamed: true }, { key: 'b2', cls: 'bag_generic_gray', name: 'Rocks', sort: 'sort_mining' }],
    place: { pack: ['@b1', '@b2', 'cherry'], b1: [], b2: [] },
    n: { pack: [0, 0, 3], b1: [], b2: [] },
  };
  return { inv, prefs };
}

describe('a bag\'s own label', () => {
  it('is its name, else its sort\'s name when the sort gave it, else its class', () => {
    assert.equal(ownBagLabel('bag_generic_gray', { name: 'Rocks', sort: 'sort_mining' }, 'Gray Bag'), 'Rocks');
    assert.equal(ownBagLabel('bag_generic_blue', { sort: 'sort_crops', sortNamed: true }, 'Blue Bag'), 'Crops, etc.');
    assert.equal(ownBagLabel('bag_generic_blue', { sort: 'sort_crops' }, 'Blue Bag'), 'Blue Bag');
    assert.equal(ownBagLabel('bag_generic_blue', {}, 'Blue Bag'), 'Blue Bag');
    assert.deepEqual(bagKeep('bag_generic_blue', { sort: 'nope', sortNamed: true }), {});
  });

  it('the pack layout and the tray caption use it', () => {
    const { inv, prefs } = bags();
    const layout = layoutPack(inv, prefs);
    assert.equal(layout.bags.b1.label, 'Crops, etc.');
    assert.equal(layout.bags.b2.label, 'Rocks');
    assert.match(read('public/game.js'), /slot\.dataset\.packName = s\.bag\?\.label \|\| shownLabel;/);
  });
});

describe('the name and the sort travel with the bag', () => {
  it('takeBag gives them and giveBag puts them back on the bag\'s row', () => {
    const { inv, prefs } = bags();
    const out = takeBag(inv, prefs, 'b1');
    assert.equal(out.ok, true);
    assert.equal(out.sort, 'sort_crops');
    assert.equal(out.sortNamed, true);
    assert.equal(out.name, undefined);
    const left = { ...inv, bag_generic_blue: 0 };
    const back = giveBag(left, out.prefs, 'bag_generic_blue', out.contents, {}, out.name || '', out);
    assert.equal(back.ok, true);
    const row = back.prefs.bags.find((b) => b.key === back.key);
    assert.deepEqual({ sort: row.sort, sortNamed: row.sortNamed }, { sort: 'sort_crops', sortNamed: true });
    assert.equal(layoutPack({ ...left, bag_generic_blue: 1 }, back.prefs).bags[back.key].label, 'Crops, etc.');

    const named = takeBag(inv, prefs, 'b2');
    assert.equal(named.name, 'Rocks');
    assert.equal(named.sort, 'sort_mining');
    assert.equal(named.sortNamed, undefined);
  });

  it('on the ground: kept through a save and a pick up, and never merged', () => {
    const state = createDroppedItemState();
    placeDroppedBag(state, 'LA1', 'bag_generic_blue', [], { x: 10, y: 20 }, { sort: 'sort_crops', sortNamed: true });
    placeDroppedBag(state, 'LA1', 'bag_generic_blue', [], { x: 12, y: 20 }, {});
    const again = parseDroppedItemState(serializeDroppedItemState(state));
    const [sorted, plain] = again.streets.LA1;
    assert.equal(sorted.sort, 'sort_crops');
    assert.equal(sorted.sortNamed, true);
    assert.equal(plain.sort, undefined);
    const record = takeDroppedRecord(again, 'LA1', sorted.id);
    assert.equal(ownBagLabel(record.classTsid, record, 'Blue Bag'), 'Crops, etc.');
    const src = read('public/game.js');
    assert.match(src, /packGiveBag', record\.classTsid, record\.contents \|\| \[\], engine, record\.name \|\| '', \{ sort: record\.sort, sortNamed: record\.sortNamed \}/);
    assert.match(src, /!box\.slots\.length && !box\.name && !box\.sort/);
  });

  it('in a cabinet: its own slot keeps them, and they come back out', () => {
    const slots = normalizeContents('bag_furniture_cabinet', [], () => 1);
    assert.equal(cabinetPut(slots, 'bag_generic_blue', 1, { sort: 'sort_crops', sortNamed: true }), 1);
    const saved = normalizeContents('bag_furniture_cabinet', JSON.parse(JSON.stringify(slots)), () => 1);
    assert.deepEqual(saved[0], { classTsid: 'bag_generic_blue', count: 1, sort: 'sort_crops', sortNamed: true });
    assert.equal(slotHoldsBag(saved[0]), true);
    const out = cabinetTake(saved, 'bag_generic_blue', 1, { slot: 0 });
    assert.equal(out.taken, 1);
    assert.equal(out.sort, 'sort_crops');
    assert.equal(out.sortNamed, true);
    const feature = read('public/js/features/home-storage-feature.js');
    assert.match(feature, /isBagClass\(cls\) && slot \? ownBagLabel\(cls, slot, labelOf\(cls\)\)/);
    assert.match(feature, /packGiveBag', cls, contents, engine, out\.name \|\| '', \{ sort: out\.sort, sortNamed: out\.sortNamed \}/);
  });
});
