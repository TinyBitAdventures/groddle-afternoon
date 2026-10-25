/**
 * G125, items nobody could get: the sources wired by the items triage
 * (~/Documents/glitch-audit/research/coverage/items-triage.md).
 * Run: node --test tests/items-triage.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEM_CATALOG, createInventory, countItem } from '../public/js/inventory.js?v=catalog-unified-5';
import { listTransformVerbs, runTransform, transformEdges } from '../public/js/item-transforms.js';
import { obtainableItems } from '../tools/job-obtainable.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const gsjs = (rel) => readFileSync(join(GSJS, rel), 'utf8');

describe('Bushel of Grain (grain.js bundle, grain_bushel.js unbundle)', () => {
  it('matches the source numbers', () => {
    const grain = gsjs('items/grain.js');
    assert.match(grain, /countItemClass\('grain'\) < 250/);
    assert.match(grain, /metabolics_lose_energy\(20\)/);
    const bushel = gsjs('items/grain_bushel.js');
    assert.match(bushel, /metabolics_lose_energy\(5 \* msg\.count\)/);
    assert.match(bushel, /metabolics_add_mood\(10 \* msg\.count\)/);
    assert.match(bushel, /createItemFromSource\('grain', 250 \* msg\.count/);
    assert.match(bushel, /var stackmax = 5;/);
    assert.equal(ITEM_CATALOG.grain_bushel.label, 'Bushel of Grain');
    assert.equal(ITEM_CATALOG.grain_bushel.stackMax, 5);
    assert.ok(existsSync(join(ROOT, 'public/assets/sprites/icons/grain_bushel.png')));
  });

  it('hides Bundle below 250 Grain and refuses at 20 energy', () => {
    assert.deepEqual(listTransformVerbs('grain', createInventory({ grain: 249 }), { energy: 100 }), []);
    const verbs = listTransformVerbs('grain', createInventory({ grain: 600 }), { energy: 100 });
    assert.deepEqual(verbs.map((v) => v.id), ['bundle:1'], 'one bushel per bundle, no "all"');
    const tired = runTransform('grain', 'bundle', 1, createInventory({ grain: 250 }), { energy: 20 });
    assert.equal(tired.ok, false);
    assert.equal(tired.msg, "You're far too tired to bundle grain.");
  });

  it('bundles 250 Grain into one bushel and unbundles it back', () => {
    const inv = createInventory({ grain: 600 });
    const pc = { energy: 100, mood: 50 };
    const b = runTransform('grain', 'bundle', 1, inv, pc);
    assert.equal(b.ok, true);
    assert.equal(countItem(inv, 'grain'), 350);
    assert.equal(countItem(inv, 'grain_bushel'), 1);
    assert.equal(pc.energy, 80);
    const u = runTransform('grain_bushel', 'unbundle', 1, inv, pc);
    assert.equal(u.ok, true);
    assert.equal(countItem(inv, 'grain'), 600);
    assert.equal(countItem(inv, 'grain_bushel'), 0);
    assert.equal(pc.energy, 75);
    assert.equal(pc.mood, 60);
    assert.equal(u.msg, 'You unbundled a Bushel of Grain. (-5 energy, +10 mood)');
    const low = runTransform('grain_bushel', 'unbundle', 1, createInventory({ grain_bushel: 1 }), { energy: 5, mood: 0 });
    assert.equal(low.msg, 'You are too tired to unbundle things!');
  });

  it('makes the bushel obtainable for the supply report and the inventory', async () => {
    assert.ok(transformEdges().some((e) => e.from === 'grain' && e.to === 'grain_bushel'));
    const ob = await obtainableItems();
    assert.ok(ob.items.has('grain_bushel'), ob.sources.grain_bushel);
  });
});

describe('Extremely Rare Items Vendor (store 25) in the Penalty Box', () => {
  it('sells store 25 at the source prices, minus the sold-out trophy', async () => {
    const { RARE_STORE, RARE_ITEMS, RARE_ICONS, rareStoreProfile, ensureRareItems, room } = await import('../public/js/quest-rooms/penalty.js');
    const src = gsjs('items/catalog_stores.js');
    const block = src.slice(src.indexOf('Extremely Rare Items Vendor'), src.indexOf('// generated ok'));
    const rows = [...block.matchAll(/class_tsid: "([a-z0-9_]+)",\s*cost: (\d+),\s*total_quantity: (\d+)/g)].map((m) => ({ classTsid: m[1], cost: Number(m[2]), stock: Number(m[3]) }));
    assert.equal(rows.length, 5);
    assert.deepEqual(RARE_STORE.offers.map((o) => ({ ...o })), rows.filter((r) => r.stock > 0));
    assert.match(gsjs('items/npc_rare_item_vendor.js'), /"store_id"\s*: 25/);
    for (const id of Object.keys(RARE_ITEMS)) {
      const label = gsjs(`items/${id}.js`).match(/^var label = "((?:[^"\\]|\\.)*)";/m)[1].replace(/\\"/g, '"');
      assert.equal(RARE_ITEMS[id].label, label, id);
      assert.ok(existsSync(join(ROOT, 'public', RARE_ICONS[id] || `assets/sprites/icons/${id}.png`)), id);
    }
    ensureRareItems();
    assert.equal(ITEM_CATALOG.antique_spigot.stackMax, 1);
    assert.equal(ITEM_CATALOG.npc_cubimal_factorydefect_chick.icon, RARE_ICONS.npc_cubimal_factorydefect_chick);
    const profile = rareStoreProfile();
    assert.equal(profile.buyMultiplier, 0);
    assert.deepEqual(profile.offers.map((o) => o.buyPrice), [250000, 500000, 1500000, 3000000]);
    // The Smuggler's menu carries Buy next to Talk to, and Buy opens the shop.
    let opened = null;
    const vendorTarget = {};
    const ctx = { data: { vendorTarget, talking: false, crawling: false }, engine: { questState: {}, openShop: (p) => { opened = p; }, setData() {} }, quest: () => ({ active: () => false }) };
    assert.ok(room.verbs(ctx, vendorTarget).some((v) => v.id === 'buy' && v.enabled));
    assert.equal(room.runVerb(ctx, vendorTarget, 'buy'), true);
    assert.equal(opened.storeId, 25);
  });
});
