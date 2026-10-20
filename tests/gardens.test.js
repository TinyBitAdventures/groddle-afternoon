/**
 * Crop garden plot state machine (GSJS-inspired).
 * Run: node --test tests/gardens.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEED_CATALOG,
  GARDEN_COSTS,
  createGarden,
  createEmptyPlot,
  plotKey,
  getPlot,
  tickGarden,
  plantPlot,
  waterPlot,
  harvestPlot,
  clearPlot,
  tendPlot,
  waterAllPlots,
  listPlantableSeeds,
  pickSeedToPlant,
  plotStatusLabel,
  plotGrowProgress,
  listPlotKeys,
  ensureGardenItems,
  starterGardenSeeds,
  starterHerbSeeds,
  starterGardenTools,
  hasWateringCan,
  hasHoe,
  gardenVendorOffers,
  suggestedPlotAction,
} from '../public/js/garden.js';
import {
  createInventory,
  countItem,
  listPackItemSlots,
  listPackToolSlots,
  isToolItem,
} from '../public/js/inventory.js?v=catalog-unified-3';
import { DEFAULT_VENDOR, vendorBuy } from '../public/js/vendor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('garden catalog (GSJS seeds)', () => {
  it('has crop + herb seeds with produce + grow stages', () => {
    ensureGardenItems();
    const ids = Object.keys(SEED_CATALOG);
    assert.ok(ids.length >= 10);
    for (const id of ['seed_carrot', 'seed_tomato', 'seed_spinach', 'seed_potato']) {
      const s = SEED_CATALOG[id];
      assert.ok(s, id);
      assert.equal(s.gardenType, 'default');
      assert.ok(s.cropId);
      assert.ok(s.produces >= 1);
      assert.ok(s.grow1Ms >= 1000);
    }
    for (const id of ['herb_seed_rookswort', 'herb_seed_rubeweed', 'herb_seed_purple_flower']) {
      const s = SEED_CATALOG[id];
      assert.ok(s, id);
      assert.equal(s.gardenType, 'herb');
    }
  });

  it('starter seeds put plantable packs in inventory listing', () => {
    const inv = createInventory({
      ...starterGardenSeeds(),
      ...starterHerbSeeds(),
      butterfly_lotion: 0,
    });
    const crop = listPlantableSeeds(inv, 'default');
    const herb = listPlantableSeeds(inv, 'herb');
    assert.ok(crop.length >= 4);
    assert.ok(herb.length >= 3);
    assert.ok(crop.every((s) => s.gardenType === 'default'));
    assert.ok(herb.every((s) => s.gardenType === 'herb'));
    const slots = listPackItemSlots(inv);
    assert.ok(slots.some((s) => s.classTsid.startsWith('seed_')));
    assert.ok(slots.some((s) => s.classTsid.startsWith('herb_seed_')));
  });

  it('watering can and hoe are tools in starter kit', () => {
    ensureGardenItems();
    const inv = createInventory({ ...starterGardenTools(), butterfly_lotion: 0 });
    assert.equal(hasWateringCan(inv), true);
    assert.equal(hasHoe(inv), true);
    assert.ok(isToolItem('watering_can'));
    assert.ok(isToolItem('hoe'));
    const tools = listPackToolSlots(inv);
    assert.ok(tools.some((t) => t.classTsid === 'watering_can'));
    assert.ok(tools.some((t) => t.classTsid === 'hoe'));
  });
});

describe('plot lifecycle clean → plant → water → grow → harvest → clear', () => {
  it('full cycle mutates only on success and yields crops', () => {
    const t0 = 1_000_000;
    const garden = createGarden({ cols: 2, rows: 2, now: t0 });
    const key = plotKey(1, 1);
    const inv = createInventory({
      seed_spinach: 2,
      spinach: 0,
      butterfly_lotion: 0,
    });
    const pc = { energy: 50, mood: 40, imagination: 0, xp: 0 };

    assert.equal(getPlot(garden, key).state, 'clean');
    assert.equal(suggestedPlotAction(getPlot(garden, key), inv), 'plant');

    // plant without energy fails
    const broke = plantPlot(garden, key, inv, { energy: 0 }, 'seed_spinach', { now: t0 });
    assert.equal(broke.ok, false);
    assert.equal(broke.reason, 'energy');
    assert.equal(getPlot(garden, key).state, 'clean');
    assert.equal(countItem(inv, 'seed_spinach'), 2);

    const planted = plantPlot(garden, key, inv, pc, 'seed_spinach', { now: t0 });
    assert.equal(planted.ok, true, planted.msgs?.join(' '));
    assert.equal(getPlot(garden, key).state, 'seeds');
    assert.equal(getPlot(garden, key).wet, false);
    assert.equal(countItem(inv, 'seed_spinach'), 1);
    assert.ok(pc.energy < 50);

    // cannot grow while dry
    const dryTick = tickGarden(garden, t0 + SEED_CATALOG.seed_spinach.grow1Ms + 1000);
    assert.equal(dryTick.length, 0);
    assert.equal(getPlot(garden, key).state, 'seeds');

    const watered = waterPlot(garden, key, pc, { now: t0 + 100 });
    assert.equal(watered.ok, true);
    assert.equal(getPlot(garden, key).wet, true);
    assert.equal(suggestedPlotAction(getPlot(garden, key), inv), null); // growing wet

    // grow seeds → shoots
    const g1 = SEED_CATALOG.seed_spinach.grow1Ms;
    const t1 = t0 + 100 + g1 + 50;
    let ch = tickGarden(garden, t1);
    assert.ok(ch.includes(key));
    assert.equal(getPlot(garden, key).state, 'shoots');

    // grow shoots → crop
    const g2 = SEED_CATALOG.seed_spinach.grow2Ms;
    const t2 = t1 + g2 + 50;
    ch = tickGarden(garden, t2);
    assert.ok(ch.includes(key));
    assert.equal(getPlot(garden, key).state, 'crop');
    assert.equal(suggestedPlotAction(getPlot(garden, key), inv), 'harvest');

    const beforeSpinach = countItem(inv, 'spinach');
    const harv = harvestPlot(garden, key, inv, pc, { now: t2 });
    assert.equal(harv.ok, true, harv.msgs?.join(' '));
    assert.equal(harv.count, SEED_CATALOG.seed_spinach.produces);
    assert.equal(countItem(inv, 'spinach'), beforeSpinach + harv.count);
    assert.equal(getPlot(garden, key).state, 'dirty');
    assert.ok(harv.effects?.items?.spinach);

    const cleared = clearPlot(garden, key, pc, { now: t2 + 10 });
    assert.equal(cleared.ok, true);
    assert.equal(getPlot(garden, key).state, 'clean');
  });

  it('tendPlot uses suggested action', () => {
    const garden = createGarden({ cols: 1, rows: 1, now: 0 });
    const key = plotKey(1, 1);
    const inv = createInventory({ seed_onion: 1, butterfly_lotion: 0 });
    const pc = { energy: 40, mood: 40, imagination: 0, xp: 0 };
    const r = tendPlot(garden, key, inv, pc, { now: 0 });
    assert.equal(r.ok, true);
    assert.equal(getPlot(garden, key).state, 'seeds');
  });

  it('waterAllPlots waters multiple dry growing plots', () => {
    const garden = createGarden({ cols: 2, rows: 1, now: 0 });
    const inv = createInventory({
      seed_carrot: 5,
      watering_can: 1,
      butterfly_lotion: 0,
    });
    const pc = { energy: 80, mood: 40 };
    plantPlot(garden, '1-1', inv, pc, 'seed_carrot', { now: 0 });
    plantPlot(garden, '2-1', inv, pc, 'seed_carrot', { now: 0 });
    const r = waterAllPlots(garden, pc, { now: 10, inv });
    assert.equal(r.ok, true);
    assert.equal(r.watered, 2);
    assert.equal(getPlot(garden, '1-1').wet, true);
    assert.equal(getPlot(garden, '2-1').wet, true);
  });

  it('water requires watering can when inv is provided', () => {
    const garden = createGarden({ cols: 1, rows: 1, now: 0 });
    const inv = createInventory({ seed_spinach: 2, butterfly_lotion: 0 });
    const pc = { energy: 40, mood: 40 };
    plantPlot(garden, '1-1', inv, pc, 'seed_spinach', { now: 0 });
    const noCan = waterPlot(garden, '1-1', pc, { inv, now: 1 });
    assert.equal(noCan.ok, false);
    assert.equal(noCan.reason, 'tool');
    inv.watering_can = 1;
    const ok = waterPlot(garden, '1-1', pc, { inv, now: 2 });
    assert.equal(ok.ok, true);
  });

  it('clear requires hoe when inv is provided', () => {
    const garden = createGarden({ cols: 1, rows: 1, now: 0 });
    const inv = createInventory({ butterfly_lotion: 0 });
    const pc = { energy: 40 };
    const plot = getPlot(garden, '1-1');
    plot.state = 'dirty';
    const noHoe = clearPlot(garden, '1-1', pc, { inv });
    assert.equal(noHoe.ok, false);
    assert.equal(noHoe.reason, 'tool');
    inv.hoe = 1;
    assert.equal(clearPlot(garden, '1-1', pc, { inv }).ok, true);
    assert.equal(getPlot(garden, '1-1').state, 'clean');
  });

  it('herb garden rejects crop-only packs and accepts herb seeds', () => {
    const herb = createGarden({ cols: 1, rows: 1, gardenType: 'herb', now: 0 });
    const cropOnly = createInventory({ seed_carrot: 2, butterfly_lotion: 0 });
    const pc = { energy: 40 };
    const cropInHerb = plantPlot(herb, '1-1', cropOnly, pc, 'seed_carrot', { now: 0 });
    assert.equal(cropInHerb.ok, false);
    assert.ok(cropInHerb.reason === 'seed' || cropInHerb.reason === 'wrong_garden');

    const inv = createInventory({
      seed_carrot: 2,
      herb_seed_rookswort: 2,
      butterfly_lotion: 0,
    });
    // Preferring a crop seed on an herb bed falls back to a valid herb seed
    const herbOk = plantPlot(herb, '1-1', inv, pc, 'seed_carrot', { now: 0 });
    assert.equal(herbOk.ok, true, herbOk.msgs?.join(' '));
    assert.equal(getPlot(herb, '1-1').seed, 'herb_seed_rookswort');
  });

  it('plotGrowProgress is 0 when dry and advances when wet', () => {
    const plot = createEmptyPlot(0);
    plot.state = 'seeds';
    plot.seed = 'seed_spinach';
    plot.wet = false;
    plot.stageStartedAt = 0;
    assert.equal(plotGrowProgress(plot, 99999), 0);
    plot.wet = true;
    const mid = SEED_CATALOG.seed_spinach.grow1Ms / 2;
    const p = plotGrowProgress(plot, mid);
    assert.ok(p > 0.4 && p < 0.6, `progress ${p}`);
  });

  it('listPlotKeys is row-major for cols×rows', () => {
    const g = createGarden({ cols: 3, rows: 2 });
    assert.deepEqual(listPlotKeys(g), ['1-1', '2-1', '3-1', '1-2', '2-2', '3-2']);
    assert.match(plotStatusLabel(getPlot(g, '1-1')), /Clean/i);
  });

  it('pickSeedToPlant prefers requested id when available', () => {
    const inv = createInventory({
      seed_carrot: 1,
      seed_spinach: 2,
      butterfly_lotion: 0,
    });
    assert.equal(pickSeedToPlant(inv, 'seed_carrot').seedId, 'seed_carrot');
    assert.equal(pickSeedToPlant(inv, 'seed_missing')?.seedId || pickSeedToPlant(inv).seedId, 'seed_spinach');
  });
});

describe('UI wiring for garden', () => {
  it('game/content expose on-map garden_plot interaction + assets', () => {
    const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');
    assert.ok(html.includes('id="garden-panel"') || html.includes('garden-panel'));
    const game = readFileSync(join(__dirname, '../public/game.js'), 'utf8');
    assert.ok(game.includes('spawnGarden') || game.includes('garden_new'));
    assert.ok(game.includes('garden_plot'));
    assert.ok(game.includes('plot_seedling') || game.includes('plot_dry'));
    assert.ok(
      game.includes("gardenType: 'herb'") ||
      game.includes('gardenType: "herb"') ||
      /gardenType:\s*index\s*===\s*0\s*\?\s*['"]default['"]\s*:\s*['"]herb['"]/.test(game)
    );
    assert.ok(game.includes('starterGardenTools') || game.includes('watering_can'));
    const content = readFileSync(join(__dirname, '../public/content.js'), 'utf8');
    assert.ok(content.includes('garden_plot'));
    assert.ok(content.includes("verbId === 'plant'") || content.includes("verbId === \"plant\""));
    assert.ok(content.includes('hasWateringCan'));
    // No tend→dialog path (original is on-map plots only)
    assert.ok(!content.includes('openGarden: true'));
    assert.ok(game.includes('_gardenHitW') || game.includes('garden_plot'));
    // World plot dirt + seedling assets
    for (const f of [
      'plot_dry.png',
      'plot_wet.png',
      'plot_dirty.png',
      'plot_seedling.png',
      'garden_new__x1_1_png_1354833270.png',
    ]) {
      const p = join(__dirname, '../public/assets/sprites/garden', f);
      assert.ok(readFileSync(p).length > 50, f);
    }
    for (const f of [
      'seed_carrot.png',
      'watering_can.png',
      'hoe.png',
      'herb_seed_rookswort.png',
      'corn.png',
    ]) {
      const p = join(__dirname, '../public/assets/sprites/icons', f);
      assert.ok(readFileSync(p).length > 50, f);
    }
  });

  it('vendor sells garden seeds and tools; buy spends currants', () => {
    ensureGardenItems();
    const offers = gardenVendorOffers();
    assert.ok(offers.some((o) => o.classTsid === 'seed_carrot'));
    assert.ok(offers.some((o) => o.classTsid === 'herb_seed_rookswort'));
    assert.ok(offers.some((o) => o.classTsid === 'watering_can'));
    assert.ok(DEFAULT_VENDOR.offers.some((o) => o.classTsid === 'seed_spinach'));
    const inv = createInventory({ butterfly_lotion: 0 });
    const pc = { currants: 100, energy: 50, mood: 50 };
    const r = vendorBuy(pc, inv, DEFAULT_VENDOR.offers, 'seed_carrot', 2);
    assert.equal(r.ok, true, r.msgs?.join(' '));
    assert.equal(countItem(inv, 'seed_carrot'), 2);
    assert.ok(pc.currants < 100);
  });
});
