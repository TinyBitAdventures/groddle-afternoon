/**
 * Official street vendor profiles and their live UI wiring.
 * Run: node --test tests/vendor-profiles.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInventory, countItem } from '../public/js/inventory.js?v=6414dbdc';
import { SEED_CATALOG } from '../public/js/garden.js?v=a7c6f521';
import {
  HASHED_VENDOR_KEYS,
  VENDOR_PROFILES,
  selectVendorProfile,
  vendorBuy,
  vendorSell,
  vendorSellValue,
} from '../public/js/vendor.js?v=474a80fd';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '../public');

describe('official street vendor profiles', () => {
  it('ships every ordinary street-spirit store from catalog_stores.js', () => {
    const labels = Object.values(VENDOR_PROFILES).map((vendor) => vendor.label);
    assert.equal(labels.length, 16); // with Progress Way's Bag Vendor (store 24, #485)
    for (const label of [
      'Groceries Vendor', 'Gardening Goods Vendor', 'Produce Vendor', 'Toy Vendor',
      'Kitchen Tools Vendor', 'Alchemical Goods Vendor', 'Mining Vendor', "Helga's Liquor Store",
    ]) {
      assert.ok(labels.includes(label), label);
    }
    assert.equal(VENDOR_PROFILES.groceries.offers.length, 12);
    assert.equal(VENDOR_PROFILES.gardening.offers.length, 19); // Pumpkin Seed joined with its recovered icon
    assert.equal(VENDOR_PROFILES.produce.offers.length, 15);
    assert.equal(VENDOR_PROFILES.toys.offers.length, 24); // 14 Party Packs joined with their icons; the Cubimal Case (G152)
    for (const vendor of Object.values(VENDOR_PROFILES)) {
      assert.match(vendor.id, /^street_spirit_/, vendor.label);
      for (const offer of vendor.offers) {
        assert.equal(existsSync(join(publicDir, `assets/sprites/icons/${offer.classTsid}.webp`)), true, offer.classTsid);
      }
    }
  });

  it('stocks the source kitchen tools at their catalog prices', () => {
    const kitchen = VENDOR_PROFILES.kitchen.offers;
    const cost = (id) => kitchen.find((offer) => offer.classTsid === id)?.buyPrice;
    assert.equal(cost('knife_and_board'), 83);
    assert.equal(cost('saucepan'), 220);
    assert.equal(cost('mike_tyson_grill'), 193);
    assert.equal(cost('awesome_pot'), 330);
  });

  it('uses canonical GSJS catalog prices and the 0.66 buy-back rate', () => {
    const price = (profile, id) =>
      VENDOR_PROFILES[profile].offers.find((offer) => offer.classTsid === id);
    assert.deepEqual(price('groceries', 'coffee'), {
      classTsid: 'coffee', label: 'Coffee', buyPrice: 6, sellPrice: 3,
    });
    assert.equal(price('gardening', 'watering_can').buyPrice, 81);
    assert.equal(price('produce', 'spinach').buyPrice, 3);
    assert.equal(price('produce', 'bubble_tuner').buyPrice, 167);
    assert.equal(price('toys', 'dice_12sided').buyPrice, 1210);
    assert.equal(price('toys', 'lips').sellPrice, 7);
  });

  it('keeps Hechey groceries, rotates other streets, and honors QA overrides', () => {
    assert.equal(selectVendorProfile('GLI2V0UN7RD1T2J').key, 'groceries');
    assert.equal(selectVendorProfile('anything', 'toys').key, 'toys');
    assert.equal(selectVendorProfile('anything', 'PRODUCE').key, 'produce');
    assert.equal(selectVendorProfile('repeatable-street').key, selectVendorProfile('repeatable-street').key);
    const seen = new Set();
    for (let i = 0; i < 100; i++) seen.add(selectVendorProfile(`street-${i}`).key);
    assert.ok(seen.size >= 10, `only ${seen.size} vendor types across 100 streets`);
    const rocky = selectVendorProfile('rocky-street', '', { rocks: 4 }).key;
    assert.ok(['mining', 'hardware', 'tools'].includes(rocky), rocky);
  });

  it('Progress Way is the Bag Vendor, as the bag quest says (#485, buy_two_bags.js 2)', () => {
    const index = JSON.parse(readFileSync(join(publicDir, 'assets/streets/index.json'), 'utf8'));
    const row = index.streets.GA94UK1BH3D3FJL;
    assert.equal(row.label, 'Progress Way');
    assert.equal(row.store, 'bags');
    const vendor = selectVendorProfile('GA94UK1BH3D3FJL', '', { store: row.store });
    assert.equal(vendor.label, 'Bag Vendor');
    assert.equal(vendor.storeId, 24);
    assert.equal(vendor.offers.find((o) => o.classTsid === 'bag_generic')?.buyPrice, 500);
    assert.equal(vendor.offers.find((o) => o.classTsid === 'bag_bigger')?.buyPrice, 1800);
    // catalog_stores.js 1573-1601 buy_multiplier 0: it buys nothing back.
    assert.equal(vendor.buyMultiplier, 0);
    assert.equal(vendorSellValue('coffee', 1, { buyMultiplier: vendor.buyMultiplier }).unit, 0);
    assert.equal(Object.values(index.streets).filter((s) => s.store === 'bags').length, 1);
  });

  it('every other street keeps the store the hash gave it before the Bag Vendor joined (G995)', () => {
    // Austin 2026-11-18: Progress Way changes and nothing else. The hash reads the same 15 stores.
    assert.equal(HASHED_VENDOR_KEYS.length, 15);
    assert.equal(HASHED_VENDOR_KEYS.includes('bags'), false);
    const pinned = {
      GA5101HF7F429V5: 'animal',
      GA510IHD1F426DS: 'tools',
      GA512CSG4H42RKG: 'mining',
      GA512SK50J52F8M: 'meals',
      GA512T760J52JMS: 'gardening_tools',
      GA512V480J52NMN: 'emporium',
      GA5134PC0J52VC3: 'toys',
      GA5137QE0J52UB8: 'kitchen',
      GA5138OK0J526HB: 'sno_cone',
      GA513A7M0J521F2: 'produce',
      GA513JAO0J5220P: 'gardening',
      GA513KEP0J52N21: 'liquor',
      GA5147561J525G7: 'alchemical',
      GA5148N71J5237C: 'hardware',
      GA54AT4AK613NBL: 'groceries',
    };
    const index = JSON.parse(readFileSync(join(publicDir, 'assets/streets/index.json'), 'utf8'));
    for (const [tsid, key] of Object.entries(pinned)) {
      assert.equal(index.streets[tsid].store, undefined, tsid);
      assert.equal(selectVendorProfile(tsid, '', { store: index.streets[tsid].store }).key, key, tsid);
    }
    const rocky = { GA5101HF7F429V5: 'hardware', GA510IHD1F426DS: 'tools', GA512SK50J52F8M: 'mining' };
    for (const [tsid, key] of Object.entries(rocky)) assert.equal(selectVendorProfile(tsid, '', { rocks: 4 }).key, key, tsid);
  });

  it('restricts purchases to the active shop stock', () => {
    const inv = createInventory({ butterfly_lotion: 0 });
    const pc = { currants: 100 };
    const bought = vendorBuy(pc, inv, VENDOR_PROFILES.groceries.offers, 'coffee', 2);
    assert.equal(bought.ok, true);
    assert.equal(countItem(inv, 'coffee'), 2);
    assert.equal(pc.currants, 88);
    const wrongShop = vendorBuy(pc, inv, VENDOR_PROFILES.toys.offers, 'coffee', 1);
    assert.equal(wrongShop.reason, 'not_sold');
  });

  it('makes every stocked gardening seed plantable', () => {
    const stockedSeeds = VENDOR_PROFILES.gardening.offers
      .map((offer) => offer.classTsid)
      .filter((id) => id.startsWith('seed_'));
    assert.ok(stockedSeeds.length >= 10);
    for (const id of stockedSeeds) assert.ok(SEED_CATALOG[id], `${id} should be plantable`);
  });

  it('ships recovered official icons and the full vendor character art', () => {
    for (const id of ['coffee', 'broccoli', 'seed_broccoli', 'dice', 'lips', 'moon', 'npc_garden_gnome']) {
      assert.equal(existsSync(join(publicDir, `assets/sprites/icons/${id}.webp`)), true, id);
    }
    assert.equal(existsSync(join(publicDir, 'assets/decos/groddle/vendor.webp')), true);
  });
});

describe('profile-aware vendor UI wiring', () => {
  it('uses active stock throughout and opens buy details instead of sell details', () => {
    const game = readFileSync(join(publicDir, 'game.js'), 'utf8');
    assert.match(game, /activeVendor = selectVendorProfile/);
    assert.match(game, /listBuyOffers\(activeVendor\.offers[,)]/);
    assert.match(game, /vendorBuy\(pc, inv, activeVendor\.offers/);
    assert.match(game, /tile\.addEventListener\('click', \(\) => \{\s*vendorSelected = row\.classTsid;\s*vendorQty = 1;/);
    assert.doesNotMatch(game, /listBuyOffers\([^)]*\)[\s\S]{0,800}stageVendorSell\(row\.classTsid\)/);
    assert.match(game, /assets\/decos\/groddle\/vendor\.png/);
  });

  it('a good buy closes the item card back to the shelf; a refused one keeps it open (ticket 29)', () => {
    // StoreDialog.as:596-608: buySuccess -> buyOver -> onBackClick (back to the product list).
    const game = readFileSync(join(publicDir, 'game.js'), 'utf8');
    const go = game.slice(game.indexOf("detail.querySelector('[data-v-go]')?.addEventListener('click'"));
    const okBuy = go.match(/if \(r\.ok && isBuy\) \{([\s\S]*?)\n {6}\}/);
    assert.ok(okBuy, 'a branch for a good buy');
    assert.match(okBuy[1], /vendorSelected = null;/);
    assert.match(okBuy[1], /vendorQty = 1;/);
    assert.match(okBuy[1], /renderVendorList\(\);/);
    assert.match(okBuy[1], /return;/);
    // The refused buy only toasts its reason; nothing else clears the selection for it.
    assert.match(go, /toast\(r\.msgs\[0\]\);/);
    const before = go.slice(0, go.indexOf('if (r.ok && isBuy) {'));
    assert.doesNotMatch(before, /vendorSelected = null/);
  });

  it('generalizes browse and talk verbs to every street spirit profile', () => {
    const content = readFileSync(join(publicDir, 'content.js'), 'utf8');
    assert.ok((content.match(/classId\.startsWith\('street_spirit_'\)/g) || []).length >= 3);
    const html = readFileSync(join(publicDir, 'play/index.html'), 'utf8');
    const css = readFileSync(join(publicDir, 'style.css'), 'utf8');
    assert.match(html, /id="vendor-desc"/);
    assert.match(css, /data-vendor="gardening"/);
    assert.match(css, /data-vendor="produce"/);
    assert.match(css, /data-vendor="toys"/);
  });
});

describe('official street stores (map_stores)', () => {
  it('uses the street’s production store when the map data names one', () => {
    assert.equal(selectVendorProfile('GA9TIJ7S4JA2CNF', '', { store: 'produce' }).key, 'produce');
    assert.equal(selectVendorProfile('anything', '', { store: 'alchemical' }).key, 'alchemical');
    assert.equal(selectVendorProfile('GLI2V0UN7RD1T2J', '', { store: 'produce' }).key, 'groceries');
  });
});

describe('store sell prices (inc_stores.js storeSell)', () => {
  it('pays round(base_cost * buy_multiplier) per unit at each store', () => {
    assert.equal(VENDOR_PROFILES.tools.buyMultiplier, 0.75);
    assert.equal(vendorSellValue('meat', 3, { buyMultiplier: VENDOR_PROFILES.groceries.buyMultiplier }).total, 21);
    assert.equal(vendorSellValue('meat', 3, { buyMultiplier: VENDOR_PROFILES.tools.buyMultiplier }).total, 24);
  });

  it('the Sno Cone vendor and no_vendor items refuse to buy', () => {
    const inv = createInventory({ meat: 2, element_red: 5 });
    const pc = { currants: 0 };
    const sno = vendorSell(pc, inv, VENDOR_PROFILES.sno_cone.offers, 'meat', 1, { buyMultiplier: VENDOR_PROFILES.sno_cone.buyMultiplier });
    assert.equal(sno.ok, false);
    assert.equal(sno.reason, 'no_value');
    assert.equal(vendorSell(pc, inv, [], 'element_red', 1).reason, 'not_sellable');
    assert.equal(pc.currants, 0);
    assert.equal(countItem(inv, 'meat'), 2);
  });
});
