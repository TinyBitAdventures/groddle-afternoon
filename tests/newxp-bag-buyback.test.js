/**
 * The cheap bag vendor's buyback loop (Gentle Island, Progress Way): she sold a Generic Bag for 500
 * during Enlarge Yer Slots and bought it back for 594, so buying and selling made currants. The
 * sell-back price is the store's buy multiplier times the item's base cost (inc_stores.js storeSell
 * 301-307, js/vendor.js vendorSellValue): round(900 x 0.66) = 594. Glitch's Bag Vendor, the one
 * store with Generic Bags at the rock's 500 (items/catalog_stores.js 1573-1580, store 24), had
 * buy_multiplier 0: she bought nothing back. The remake's vendor follows it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CHEAP_BAG_PRICE, cheapBagPrice } from '../public/js/newxp.js?v=91b8f176';
import { __newxpTest } from '../public/js/features/newxp-feature.js?v=dd5ea70d';
import { vendorBuy, vendorSell, vendorSellValue } from '../public/js/vendor.js?v=e76ac383';
import { createInventory, countItem } from '../public/js/inventory.js?v=f49c8998';

const GSJS = join(import.meta.dirname, '..', '..', 'glitch-GameServerJS');

const questEngine = (currants) => ({
  pc: { currants, imaginationUpgrades: [] },
  questState: { active: { buy_two_bags: { progress: { generic_bag_purchased: 0 } } }, completed: [] },
});

describe('the cheap bag vendor never pays more for a bag than she charged', () => {
  it('buys nothing back (Glitch\'s Bag Vendor, buy_multiplier 0)', () => {
    const profile = __newxpTest.bagShopProfile(questEngine(978));
    assert.equal(profile.buyMultiplier, 0);
    assert.equal(vendorSellValue('bag_generic', 1, { buyMultiplier: profile.buyMultiplier }).total, 0);
    // Before: the shared rate paid round(900 x 0.66) = 594 for a bag she sold for 500.
    assert.equal(vendorSellValue('bag_generic', 1, { buyMultiplier: 0.66 }).total, 594);
  });

  it('buy then sell cannot make currants, at any price she asks', () => {
    for (const purse of [978, 600, 493, 300, 1]) {
      const engine = questEngine(purse);
      const profile = __newxpTest.bagShopProfile(engine);
      const price = cheapBagPrice(purse, 0);
      const inv = createInventory();
      const bought = vendorBuy(engine.pc, inv, profile.offers, 'bag_generic', 1);
      assert.equal(bought.ok, true, `${purse}: ${bought.msgs?.[0]}`);
      assert.equal(engine.pc.currants, purse - price);
      const sold = vendorSell(engine.pc, inv, profile.offers, 'bag_generic', 1, { buyMultiplier: profile.buyMultiplier, emptyBags: () => 1 });
      assert.equal(sold.ok, false, `${purse}: she does not buy it back`);
      assert.equal(sold.msgs[0], "You can't sell that item.", 'inc_stores.js storeSell 305-306');
      assert.equal(countItem(inv, 'bag_generic'), 1);
      assert.ok(engine.pc.currants <= purse, `${purse}: never richer`);
    }
  });

  it('the price outside the quest stays the rock\'s 500', () => {
    const profile = __newxpTest.bagShopProfile({ pc: { currants: 5000 }, questState: { active: {}, completed: ['buy_two_bags'] } });
    assert.equal(profile.offers[0].buyPrice, CHEAP_BAG_PRICE);
  });

  it('cites the source store', { skip: existsSync(GSJS) ? false : 'no GSJS' }, () => {
    const lines = readFileSync(join(GSJS, 'items/catalog_stores.js'), 'utf8').split('\n');
    assert.match(lines[1572], /^\t24 : \{/);
    assert.match(lines[1573], /name : "Bag Vendor"/);
    assert.match(lines[1574], /buy_multiplier : 0,/);
    assert.match(lines[1577], /class_tsid: "bag_generic"/);
    assert.match(lines[1578], /cost: 500,/);
    const stores = readFileSync(join(GSJS, 'players/inc_stores.js'), 'utf8');
    assert.match(stores, /var cost = Math\.round\(base_cost \* store_info\.buy_multiplier\) \* msg\.count;/);
  });
});
