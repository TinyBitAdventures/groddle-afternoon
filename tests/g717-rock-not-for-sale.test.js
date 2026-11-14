/**
 * #317 (G717, The Catface): a vendor sold from an item's whole count, so the units the magic
 * rock held for a full pack went with the stack, silently. The source's rock was a bag of its
 * own a store never looked in (inc_stores.js storeSell 261 counts the pack: countItemClass), so
 * a vendor lists, quotes and buys only the units in pack and bag slots (vendor.js opts.slotted,
 * bags-feature packSlotted). When a sale frees the slot, the rock's units move in and the
 * "given back" line says so (bags-feature rockChanges, inc_rewards.js 140-155 rewards_return).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { layoutPack, stackMaxOf } from '../public/js/pack-slots.js?v=4d446d78';
import { createVendorSellQuote, listSellOffers, vendorSell } from '../public/js/vendor.js?v=dc7d6463';
import { bagsFeature, rockChanges } from '../public/js/features/bags-feature.js?v=cd309adc';

const root = join(import.meta.dirname, '..');
const singles = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`zz_single_${i}`, 1]));

/** A full pack: 15 one-unit stacks and one full cherry stack, the rock holding 7 more cherries. */
function fullPack() {
  const max = stackMaxOf('cherry');
  const inv = { ...singles(15), cherry: max + 7 };
  const layout = layoutPack(inv);
  return { inv, layout, max, opts: { slotted: (cls) => layout.slotted[cls] || 0 } };
}

describe('#317: the magic rock is not for sale', () => {
  it('the layout: one full slot of cherries, the rock holding 7', () => {
    const { layout, max } = fullPack();
    assert.equal(layout.free, 0);
    assert.equal(layout.slotted.cherry, max);
    assert.deepEqual(layout.rock, { cherry: 7 });
  });

  it('the sell list, its have and max count only the slotted units', () => {
    const { inv, opts, max } = fullPack();
    const row = listSellOffers(inv, [], [], opts).find((r) => r.classTsid === 'cherry');
    assert.equal(row.have, max);
    assert.equal(row.maxQty, max);
    const quote = createVendorSellQuote(inv, [], 'cherry', max + 7, [], opts);
    assert.equal(quote.ok, true);
    assert.equal(quote.have, max);
    assert.equal(quote.qty, max, 'asking for more quotes what the slots hold');
    // Without the callback (older callers) the whole count still lists.
    assert.equal(listSellOffers(inv, [], []).find((r) => r.classTsid === 'cherry').have, max + 7);
  });

  it('a sale of more than the slots hold is refused; a class only the rock holds is not listed', () => {
    const { inv, opts, max } = fullPack();
    const pc = { currants: 0 };
    const r = vendorSell(pc, inv, [], 'cherry', max + 1, opts);
    assert.equal(r.ok, false);
    assert.equal(inv.cherry, max + 7);
    assert.equal(pc.currants, 0);
    const rockOnly = { ...singles(16), plum: 4 };
    const layout = layoutPack(rockOnly);
    assert.deepEqual(layout.rock, { plum: 4 });
    const o = { slotted: (cls) => layout.slotted[cls] || 0 };
    assert.equal(listSellOffers(rockOnly, [], [], o).some((row) => row.classTsid === 'plum'), false);
    assert.equal(createVendorSellQuote(rockOnly, [], 'plum', 1, [], o).ok, false);
    assert.equal(vendorSell(pc, rockOnly, [], 'plum', 1, o).ok, false);
  });

  it('selling the slot gives the rock\'s units back into it, and the line says so', () => {
    const { inv, layout, opts, max } = fullPack();
    const pc = { currants: 0 };
    const r = vendorSell(pc, inv, [], 'cherry', max, opts);
    assert.equal(r.ok, true);
    assert.equal(inv.cherry, 7, 'the rock\'s 7 stay');
    const after = layoutPack(inv, layout.prefs);
    assert.deepEqual(after.rock, {});
    assert.equal(after.slotted.cherry, 7);
    // Before, the slot count fell (max to 7), so the old rule said nothing came back.
    assert.deepEqual(rockChanges(layout.rock, after.rock, layout.slotted, after.slotted).given, [{ cls: 'cherry', n: 7 }]);
  });

  it('given back still counts another class freeing a slot, and never a loss from the rock alone', () => {
    // A slot of something else freed: the rock's cherries fill it (the old rule's case).
    assert.deepEqual(rockChanges({ cherry: 3 }, {}, { cherry: 0 }, { cherry: 3 }).given, [{ cls: 'cherry', n: 3 }]);
    // More gone than the slots held: only what moved into slots is given back.
    assert.deepEqual(rockChanges({ cherry: 10 }, {}, { cherry: 5 }, { cherry: 3 }).given, [{ cls: 'cherry', n: 3 }]);
    // Something new held, nothing back.
    assert.deepEqual(rockChanges({}, { cherry: 2 }, { cherry: 5 }, { cherry: 5 }), { holding: [{ cls: 'cherry', n: 2 }], given: [] });
    // Nothing moved.
    assert.deepEqual(rockChanges({ cherry: 2 }, { cherry: 2 }, { cherry: 5 }, { cherry: 5 }).given, []);
  });

  it('bags-feature packSlotted answers for the game\'s vendorSellOpts', () => {
    bagsFeature.restore({});
    // The feature lays out with the item catalog (its own opts): whatever it slots, it counts.
    const inv = { cherry: 3, apple: 2 };
    assert.equal(bagsFeature.packSlotted('cherry', { inv }), 3);
    assert.equal(bagsFeature.packSlotted('plum', { inv }), 0);
    assert.equal(bagsFeature.packSlotted('', { inv }), null);
    // Furniture takes no slot (pack-slots.js takesNoSlot): no limit.
    assert.equal(bagsFeature.packSlotted('furniture_chair', { inv: { furniture_chair: 1 } }), null);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /slotted: \(classTsid\) => features\.query\('packSlotted', classTsid, engine\) \?\? null,/);
  });

  it('the rock chip stays in the pack row while a search has text', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    const search = game.slice(game.indexOf('const hits = packSearchEntries(found, query, labelOf);'), game.indexOf('if (!hits.length) packRow.markNoMatches'));
    assert.match(search, /renderPackRow\(itemsBox, hits, \{[^}]*rock: packLayout\.rockStacks \? packLayout\.rock : null/);
  });
});
