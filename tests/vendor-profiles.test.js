/**
 * Official street vendor profiles and their live UI wiring.
 * Run: node --test tests/vendor-profiles.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInventory, countItem } from '../public/js/inventory.js?v=catalog-unified-3';
import { SEED_CATALOG } from '../public/js/garden.js';
import {
  VENDOR_PROFILES,
  selectVendorProfile,
  vendorBuy,
} from '../public/js/vendor.js?v=vendor-profiles-1';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '../public');

describe('official street vendor profiles', () => {
  it('ships every ordinary street-spirit store from catalog_stores.js', () => {
    const labels = Object.values(VENDOR_PROFILES).map((vendor) => vendor.label);
    assert.equal(labels.length, 15);
    for (const label of [
      'Groceries Vendor', 'Gardening Goods Vendor', 'Produce Vendor', 'Toy Vendor',
      'Kitchen Tools Vendor', 'Alchemical Goods Vendor', 'Mining Vendor', "Helga's Liquor Store",
    ]) {
      assert.ok(labels.includes(label), label);
    }
    assert.equal(VENDOR_PROFILES.groceries.offers.length, 12);
    assert.equal(VENDOR_PROFILES.gardening.offers.length, 18);
    assert.equal(VENDOR_PROFILES.produce.offers.length, 15);
    assert.equal(VENDOR_PROFILES.toys.offers.length, 9);
    for (const vendor of Object.values(VENDOR_PROFILES)) {
      assert.match(vendor.id, /^street_spirit_/, vendor.label);
      for (const offer of vendor.offers) {
        assert.equal(existsSync(join(publicDir, `assets/sprites/icons/${offer.classTsid}.png`)), true, offer.classTsid);
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
      assert.equal(existsSync(join(publicDir, `assets/sprites/icons/${id}.png`)), true, id);
    }
    assert.equal(existsSync(join(publicDir, 'assets/decos/groddle/vendor.png')), true);
  });
});

describe('profile-aware vendor UI wiring', () => {
  it('uses active stock throughout and opens buy details instead of sell details', () => {
    const game = readFileSync(join(publicDir, 'game.js'), 'utf8');
    assert.match(game, /activeVendor = selectVendorProfile/);
    assert.match(game, /listBuyOffers\(activeVendor\.offers\)/);
    assert.match(game, /vendorBuy\(pc, inv, activeVendor\.offers/);
    assert.match(game, /tile\.addEventListener\('click', \(\) => \{\s*vendorSelected = row\.classTsid;\s*vendorQty = 1;/);
    assert.doesNotMatch(game, /listBuyOffers\([^)]*\)[\s\S]{0,800}stageVendorSell\(row\.classTsid\)/);
    assert.match(game, /assets\/decos\/groddle\/vendor\.png/);
  });

  it('generalizes browse and talk verbs to every street spirit profile', () => {
    const content = readFileSync(join(publicDir, 'content.js'), 'utf8');
    assert.ok((content.match(/classId\.startsWith\('street_spirit_'\)/g) || []).length >= 3);
    const html = readFileSync(join(publicDir, 'index.html'), 'utf8');
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
