/**
 * Live report 218 (2026-11-12, Dustin, a new player on Progress Way): "I bought a bag at the vendor
 * and it won't let me go past. Says I really need to buy a bag." His picture: Enlarge Yer Slots at
 * "Purchase a Generic Bag (1/2)", 493 currants. The gate (newbie_island.js street4_check) wants
 * buy_two_bags done, which counts two Generic Bags bought; the rock gives 978 (22 short of two at
 * the vendor's 500, on purpose: "rustle up a few more currants"), and nothing on Gentle Island pays
 * currants in the remake, so a player short of 500 after the first bag could never pass.
 *
 * 1. cheapBagPrice: 500 while you have it; short of it, what you have shared by the bags still
 *    wanted; never more than you hold.
 * 2. The vendor's profile prices the bag that way while the quest runs, read live (the shelf and
 *    vendorBuy read it after each purchase), so a save already stuck at 493 buys its second bag.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BAGS_NEEDED, CHEAP_BAG_PRICE, ISLAND_CURRANTS, cheapBagPrice } from '../public/js/newxp.js?v=b89001c1';
import { __newxpTest } from '../public/js/features/newxp-feature.js?v=983d0080';
import { vendorBuy } from '../public/js/vendor.js?v=542d30c9';
import { createInventory, countItem } from '../public/js/inventory.js?v=f49c8998';

describe('1. cheapBagPrice never strands a new player', () => {
  it('the first bag costs the rock\'s 500 when you hold the gift', () => {
    assert.equal(cheapBagPrice(ISLAND_CURRANTS, 0), CHEAP_BAG_PRICE);
  });
  it('report 218: one bag bought, 493 left, the second costs 493', () => {
    assert.equal(cheapBagPrice(493, 1), 493);
  });
  it('short of 500 with both bags still wanted, the purse is shared between them', () => {
    assert.equal(cheapBagPrice(300, 0), 150);
    assert.equal(cheapBagPrice(0, 0), 0);
  });
  it('for every purse and count, a player can always afford every bag still wanted', () => {
    for (let have = 0; have <= 1200; have += 7) {
      let purse = have;
      for (let bought = 0; bought < BAGS_NEEDED; bought += 1) {
        const p = cheapBagPrice(purse, bought);
        assert.ok(p >= 0 && p <= purse && p <= CHEAP_BAG_PRICE, `${have}: bag ${bought + 1} at ${p} with ${purse}`);
        purse -= p;
      }
    }
  });
});

describe('2. the vendor sells at that price while Enlarge Yer Slots runs', () => {
  const stuckEngine = () => ({
    pc: { currants: 493, imaginationUpgrades: [] },
    questState: { active: { buy_two_bags: { progress: { generic_bag_purchased: 1 } } }, completed: [] },
  });

  it('a save stuck at 1/2 with 493 currants buys the second bag', () => {
    const engine = stuckEngine();
    const profile = __newxpTest.bagShopProfile(engine);
    const offer = profile.offers[0];
    assert.equal(offer.classTsid, 'bag_generic');
    assert.equal(offer.buyPrice, 493);
    const inv = createInventory();
    const r = vendorBuy(engine.pc, inv, profile.offers, 'bag_generic', 1);
    assert.equal(r.ok, true, r.msgs?.[0]);
    assert.equal(engine.pc.currants, 0);
    assert.equal(countItem(inv, 'bag_generic'), 1);
  });

  it('the price follows the purse and the count between purchases', () => {
    const engine = stuckEngine();
    engine.pc.currants = ISLAND_CURRANTS;
    engine.questState.active.buy_two_bags.progress.generic_bag_purchased = 0;
    const offer = __newxpTest.bagShopProfile(engine).offers[0];
    assert.equal(offer.buyPrice, 500);
    engine.pc.currants = 478;
    engine.questState.active.buy_two_bags.progress.generic_bag_purchased = 1;
    assert.equal(offer.buyPrice, 478);
    assert.equal(offer.cost, 478);
  });

  it('once the quest is done (or with no engine), the bag is back at 500', () => {
    const engine = stuckEngine();
    delete engine.questState.active.buy_two_bags;
    assert.equal(__newxpTest.bagShopProfile(engine).offers[0].buyPrice, CHEAP_BAG_PRICE);
    assert.equal(__newxpTest.bagShopProfile().offers[0].buyPrice, CHEAP_BAG_PRICE);
  });
});
