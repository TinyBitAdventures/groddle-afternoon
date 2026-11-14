/**
 * Report #79 (Austin 2026-11-11, "Refuse: empty it first"): selling a bag that still held
 * things sent them to the magic rock (the bag left the pack, layoutPack found its contents
 * no longer fit and the rock held them). Every vendor now refuses a bag with stuff in it,
 * with words after the trade window's tip (TradeDialog.as:1052-1054, "There is still stuff
 * in this!"); an empty bag still sells, and of a class's bags the empty ones are the ones
 * that go (pack-slots.js saleBags, bags-feature packSaleBags, vendor.js opts.emptyBags).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { layoutPack, saleBags } from '../public/js/pack-slots.js?v=4d446d78';
import { VENDOR_BAG_HOLDS, createVendorSellQuote, vendorSell } from '../public/js/vendor.js?v=dc7d6463';

const root = join(import.meta.dirname, '..');

/** Two Blue Bags: b1 empty, b2 holding planks and apples; a cherry stack in the pack. */
function twoBags() {
  const inv = { bag_generic_blue: 2, plank: 30, apple: 5, cherry: 3 };
  const prefs = {
    bags: [{ key: 'b1', cls: 'bag_generic_blue' }, { key: 'b2', cls: 'bag_generic_blue' }],
    place: { pack: ['@b1', '@b2', 'cherry'], b1: [], b2: ['plank', 'apple'] },
    n: { pack: [0, 0, 3], b1: [], b2: [30, 5] },
  };
  return { inv, prefs };
}

/** What the game's vendorSellOpts().emptyBags does through bags-feature packSaleBags. */
function bagsOpts(state, chosen = '') {
  return {
    emptyBags: (cls) => {
      const res = saleBags(state.inv, state.prefs, cls, {}, chosen);
      if (!res) return null;
      state.prefs = res.prefs;
      return res.empty;
    },
  };
}

describe('saleBags: only empty bags go to a vendor', () => {
  it('is null for a class that is not a bag', () => {
    const { inv, prefs } = twoBags();
    assert.equal(saleBags(inv, prefs, 'plank'), null);
  });

  it('counts the empty bags and puts them last, so an empty one is the one that leaves', () => {
    const { inv, prefs } = twoBags();
    prefs.bags.reverse(); // b2 (full) would leave first otherwise
    const res = saleBags(inv, prefs, 'bag_generic_blue');
    assert.equal(res.empty, 1);
    assert.deepEqual(res.prefs.bags.map((b) => b.key), ['b2', 'b1']);
    const after = layoutPack({ ...inv, bag_generic_blue: 1 }, res.prefs);
    assert.deepEqual(after.bags.b2.slots.map((s) => [s.cls, s.count]), [['plank', 30], ['apple', 5]]);
    assert.deepEqual(after.rock, {});
  });

  it('a chosen bag with stuff in it counts none, even with an empty one beside it', () => {
    const { inv, prefs } = twoBags();
    assert.equal(saleBags(inv, prefs, 'bag_generic_blue', {}, 'b2').empty, 0);
    const res = saleBags(inv, prefs, 'bag_generic_blue', {}, 'b1');
    assert.equal(res.empty, 1);
    assert.equal(res.prefs.bags.at(-1).key, 'b1');
  });
});

describe('vendorSell and the sell quote refuse a bag with stuff in it', () => {
  it('refuses with the vendor words and changes nothing', () => {
    const state = twoBags();
    const pc = { currants: 10 };
    const r = vendorSell(pc, state.inv, [], 'bag_generic_blue', 1, bagsOpts(state, 'b2'));
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'bag_not_empty');
    assert.deepEqual(r.msgs, [VENDOR_BAG_HOLDS]);
    assert.equal(state.inv.bag_generic_blue, 2);
    assert.equal(pc.currants, 10);
    assert.doesNotMatch(VENDOR_BAG_HOLDS, /—/);
  });

  it('sells an empty bag and leaves the full one and its contents in the pack, nothing in the rock', () => {
    const state = twoBags();
    state.prefs.bags.reverse();
    const pc = { currants: 0 };
    const r = vendorSell(pc, state.inv, [], 'bag_generic_blue', 1, bagsOpts(state));
    assert.equal(r.ok, true);
    assert.ok(pc.currants > 0);
    assert.equal(state.inv.bag_generic_blue, 1);
    const after = layoutPack(state.inv, state.prefs);
    assert.deepEqual(Object.keys(after.bags), ['b2']);
    assert.deepEqual(after.rock, {});
  });

  it('a sale of more bags than are empty is refused (Sell max)', () => {
    const state = twoBags();
    const r = vendorSell({ currants: 0 }, state.inv, [], 'bag_generic_blue', 2, bagsOpts(state));
    assert.equal(r.reason, 'bag_not_empty');
    assert.equal(state.inv.bag_generic_blue, 2);
  });

  it('the quote caps the count at the empty bags and refuses when none is empty', () => {
    const state = twoBags();
    const q = createVendorSellQuote(state.inv, [], 'bag_generic_blue', 5, [], bagsOpts(state));
    assert.equal(q.ok, true);
    assert.equal(q.maxQty, 1);
    assert.equal(q.qty, 1);
    const no = createVendorSellQuote(state.inv, [], 'bag_generic_blue', 1, [], bagsOpts(state, 'b2'));
    assert.equal(no.ok, false);
    assert.equal(no.reason, 'bag_not_empty');
    assert.deepEqual(no.msgs, [VENDOR_BAG_HOLDS]);
    assert.ok(no.unitPrice > 0, 'the tile menu greys its rows with the price shown');
  });

  it('anything that is not a bag sells as before', () => {
    const state = twoBags();
    const pc = { currants: 0 };
    const r = vendorSell(pc, state.inv, [], 'plank', 5, bagsOpts(state));
    assert.equal(r.ok, true);
    assert.equal(state.inv.plank, 25);
  });
});

describe('game.js: every sell path asks', () => {
  const src = readFileSync(join(root, 'public/game.js'), 'utf8');
  it('vendorSellOpts passes emptyBags through bags-feature packSaleBags with the chosen bag', () => {
    assert.match(src, /emptyBags: \(classTsid\) => \(isBagClass\(classTsid\) \? features\.query\('packSaleBags', classTsid, engine, vendorSellBag\)/);
  });
  it('the pack menu and a drag stage the bag they are about; tiles and the tile menu choose none', () => {
    assert.match(src, /stageVendorSell\(classTsid, copy, place, bag\);\n  \}\);\n  pop\.querySelector\('\[data-pack-drop\]'\)/);
    assert.match(src, /vendorDragBag = s\.bag\?\.key \|\| '';/);
    assert.ok((src.match(/vendorSellBag = '';/g) || []).length >= 4);
  });
  it("the pack menu's Sell row is greyed with the words while the bag holds anything", () => {
    assert.match(src, /packSaleBags', classTsid, engine, packSelectedBag \|\| ''\) === 0 \? VENDOR_BAG_HOLDS : ''/);
  });
});
