/**
 * Crop garden plot state machine (GSJS-inspired).
 * Run: node --test tests/gardens.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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
  GARDEN_WATER_MS,
  GARDEN_SPEEDUP,
  GARDEN_HOUR_MS,
  LEGACY_GARDEN,
  legacyGrowMs,
  plotStageMs,
  plotWaterMs,
  plotRipeInMs,
  gardenWaitLabel,
  sowPlot,
  wetPlot as pourWater,
  gardenActionProfile,
  GARDEN_TALKBACKS,
  GARDEN_TALKBACK_MS,
  gardenTalkbackKey,
  gardenTalkback,
  plotNeedsWater,
  gardenNeedsWater,
  GARDEN_NO_DRY_PLOTS_LINE,
} from '../public/js/garden.js?v=1420a6d6';
import { getVerbsFor, runVerb } from '../public/content.js?v=a5d648fd';
import { plotPieces } from '../public/js/garden-view.js?v=04fe8467';
import { plotsFor } from '../public/js/master-garden.js?v=ff6ca66a';
import {
  createInventory,
  countItem,
  listPackItemSlots,
  listPackToolSlots,
  isToolItem,
} from '../public/js/inventory.js?v=f49c8998';
import { DEFAULT_VENDOR, vendorBuy } from '../public/js/vendor.js?v=dc7d6463';
import { HAS_SITE, SITE_DIR } from '../tools/repos.mjs';

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

  it('crop yields are the source produces_count, halved once without Croppery', () => {
    assert.equal(SEED_CATALOG.seed_spinach.produces, 12);
    assert.equal(SEED_CATALOG.seed_zucchini.produces, 23);
    assert.equal(SEED_CATALOG.seed_potato.produces, 18);
    const garden = createGarden({ cols: 1, rows: 1, now: 0 });
    const plot = getPlot(garden, '1-1');
    Object.assign(plot, { state: 'crop', seed: 'seed_zucchini' });
    const inv = createInventory({});
    const r = harvestPlot(garden, '1-1', inv, { energy: 100, mood: 0, imagination: 0, xp: 0 }, { learned: [], rng: () => 0 });
    assert.equal(r.baseCount, 12); // round(23 / 2)
  });

  it('wetness lasts 12 garden hours, pauses growth when dry, and carries over', () => {
    const garden = createGarden({ cols: 1, rows: 1, now: 0 });
    const key = '1-1';
    const inv = createInventory({ seed_potato: 2 });
    const pc = { energy: 1000, mood: 0, imagination: 0, xp: 0 };
    plantPlot(garden, key, inv, pc, 'seed_potato', { now: 0 });
    const plot = getPlot(garden, key);
    const H = GARDEN_WATER_MS / 12;
    plot.growModifier = (H * 20) / SEED_CATALOG.seed_potato.grow1Ms; // a 20-hour stage
    waterPlot(garden, key, pc, { now: 0, requireTool: false });
    tickGarden(garden, GARDEN_WATER_MS + 5000);
    assert.equal(plot.wet, false);
    assert.equal(plot.state, 'seeds');
    assert.equal(plot.growthMs, GARDEN_WATER_MS);
    assert.equal(plotGrowProgress(plot, GARDEN_WATER_MS * 3), 0.6);
    // Re-watering resumes from the banked 12 garden hours.
    waterPlot(garden, key, pc, { now: GARDEN_WATER_MS * 3, requireTool: false });
    assert.deepEqual(tickGarden(garden, GARDEN_WATER_MS * 3 + H * 7), []);
    assert.deepEqual(tickGarden(garden, GARDEN_WATER_MS * 3 + H * 8), [key]);
    assert.equal(plot.state, 'shoots');
    assert.equal(plot.wet, true);
    // Picking and hoeing keep the plot wet, so a new seed grows at once.
    Object.assign(plot, { state: 'crop' });
    const later = GARDEN_WATER_MS * 3 + H * 9;
    assert.equal(harvestPlot(garden, key, inv, pc, { now: later, rng: () => 0 }).ok, true);
    assert.equal(clearPlot(garden, key, pc, { now: later, requireTool: false }).ok, true);
    assert.equal(plantPlot(garden, key, inv, pc, 'seed_potato', { now: later }).ok, true);
    assert.equal(plot.wet, true);
    assert.equal(plot.state, 'seeds');
  });

  it('Aggressive Hoeing sets clear xp and multiplies Hoe wear by Croppery rank', () => {
    const base = gardenActionProfile('default', 'clear', ['croppery_2'], []);
    const card = gardenActionProfile('default', 'clear', ['croppery_1', 'croppery_2'], ['hoeing_more_img_more_wear']);
    assert.equal(card.xp, 6);
    assert.equal(card.toolWear, base.toolWear * 4);
    assert.equal(gardenActionProfile('herb', 'clear', [], ['hoeing_more_img_more_wear']).xp, 3);
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
    sowPlot(plot, 'seed_spinach', 0);
    plot.wet = false;
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
    const html = readFileSync(join(__dirname, '../public/play/index.html'), 'utf8');
    assert.ok(html.includes('id="garden-panel"') || html.includes('garden-panel'));
    const game = readFileSync(join(__dirname, '../public/game.js'), 'utf8');
    assert.ok(game.includes('spawnGarden') || game.includes('garden_new'));
    assert.ok(game.includes('garden_plot'));
    // Tiny Speck's garden_new.swf pieces (js/garden-view.js), not drawn stand-ins.
    assert.ok(game.includes('plotPieces(plot') && game.includes('gardenLayout('));
    assert.ok(
      game.includes("gardenType: 'herb'") ||
      game.includes('gardenType: "herb"') ||
      // Report 188: the beds come from garden.js streetGardenBed (crop then herb, or two herb beds).
      /gardenType:\s*bed\.gardenType/.test(game)
    );
    assert.ok(game.includes('starterGardenTools') || game.includes('watering_can'));
    const content = readFileSync(join(__dirname, '../public/content.js'), 'utf8');
    assert.ok(content.includes('garden_plot'));
    // #197: plant or plant:<seed> (the seed chosen in the menu or dropped on the plot).
    assert.ok(content.includes("verbBase === 'plant'"));
    assert.ok(content.includes('hasWateringCan'));
    // No tend→dialog path (original is on-map plots only)
    assert.ok(!content.includes('openGarden: true'));
    assert.ok(game.includes('_gardenHitW') || game.includes('garden_plot'));
    // World plot, plant and bed art (tools/garden-art from garden_new.swf)
    for (const f of [
      'garden_plots.webp',
      'garden_crops.webp',
      'garden_bed_strip_2_1.webp',
      'garden_bed_shimla_2_1.webp',
      'garden_new__x1_1_png_1354833270.webp',
    ]) {
      const p = join(__dirname, '../public/assets/sprites/garden', f);
      assert.ok(readFileSync(p).length > 50, f);
    }
    for (const f of [
      'seed_carrot.webp',
      'watering_can.webp',
      'hoe.webp',
      'herb_seed_rookswort.webp',
      'corn.webp',
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

describe('garden talkbacks (garden_new.js responses, include/garden.js talkback_key)', () => {
  it('carries all 31 source pools verbatim', () => {
    assert.equal(Object.keys(GARDEN_TALKBACKS).length, 31);
    assert.ok(GARDEN_TALKBACKS.herb_plant.includes('Hot seed action.'));
    assert.ok(GARDEN_TALKBACKS.herb_plant.includes('I like it seedy.'));
    assert.ok(GARDEN_TALKBACKS.herb_clear.includes('I feel like a new plot!'));
    assert.ok(GARDEN_TALKBACKS.herb_harvest_3x.includes('High time for heavy herbal bonus? HELL YEAH.'));
    assert.equal(GARDEN_TALKBACKS.crop_water.length, 10);
    assert.equal(GARDEN_TALKBACK_MS, 3500);
  });

  it('keys follow the source rules', () => {
    const herb = { learned: ['herbalism_1'] };
    assert.equal(gardenTalkbackKey('herb', 'plant', herb), 'herb_plant');
    assert.equal(gardenTalkbackKey('herb', 'water', herb), 'herb_water');
    assert.equal(gardenTalkbackKey('herb', 'clear', {}), 'herb_clear');
    assert.equal(gardenTalkbackKey('herb', 'harvest', {}), 'herb_harvest');
    // Without Herbalism I / Croppery I, water and plant are silent; hoeing and picking still talk.
    assert.equal(gardenTalkbackKey('herb', 'plant', {}), null);
    assert.equal(gardenTalkbackKey('default', 'water', {}), null);
    assert.equal(gardenTalkbackKey('default', 'clear', {}), 'crop_clear');
    // Fertilizing nulls talkback_key.
    assert.equal(gardenTalkbackKey('herb', 'fertilize', herb), null);
    // Harvest suffix comes from upgrades / Croppery III, not the roll.
    assert.equal(gardenTalkbackKey('herb', 'harvest', { upgrades: ['herbalism_super_harvest_2'] }), 'herb_harvest_3x');
    assert.equal(gardenTalkbackKey('herb', 'harvest', { upgrades: ['herbalism_super_harvest_1'] }), 'herb_harvest_2x');
    assert.equal(gardenTalkbackKey('default', 'harvest', { upgrades: ['croppery_super_harvest_2'] }), 'crop_harvest_4x');
    assert.equal(gardenTalkbackKey('default', 'harvest', { upgrades: ['croppery_super_harvest_1'] }), 'crop_harvest_3x');
    assert.equal(gardenTalkbackKey('default', 'harvest', { learned: ['croppery_1', 'croppery_3'] }), 'crop_harvest_2x');
    assert.equal(gardenTalkbackKey('default', 'harvest', { gotDrop: true }), 'crop_harvest_drop');
    assert.equal(gardenTalkbackKey('default', 'plant', { learned: ['croppery_1'], gotDrop: true }), 'crop_plant_drop_small');
    assert.equal(gardenTalkbackKey('herb', 'water', { learned: ['herbalism_1'], gotDrop: true }), 'herb_water_drop');
    assert.equal(gardenTalkbackKey('default', 'water', { learned: ['croppery_1'], failed: true }), 'crop_water_na_failed');
    assert.equal(gardenTalkbackKey('herb', 'clear', { failed: true }), null);
  });

  it('picks one line at random and keeps iMG, mood and energy slugs', () => {
    const t = gardenTalkback('herb_plant', { rng: () => 0.25, slugs: { energy: 2, mood: 3, xp: 0 } });
    assert.equal(t.text, GARDEN_TALKBACKS.herb_plant[2]);
    assert.deepEqual(t.slugs, { mood: 3, energy: 2 });
    assert.equal(t.durationMs, 3500);
    assert.equal(gardenTalkback(null), null);
  });

  it('every plot action answers with a bubble and its deltas', () => {
    ensureGardenItems();
    const t0 = 2_000_000;
    const garden = createGarden({ cols: 1, rows: 1, now: t0, gardenType: 'herb' });
    const key = plotKey(1, 1);
    const inv = createInventory({ herb_seed_rookswort: 2, hoe: 1, watering_can: 1, butterfly_lotion: 0 });
    const pc = { energy: 500, mood: 10, imagination: 0, xp: 0, moodMax: 100 };
    const opts = { now: t0, inv, learned: ['herbalism_1'], upgrades: ['herbalism_super_harvest_2'], talkRng: () => 0 };
    const plant = plantPlot(garden, key, inv, pc, 'herb_seed_rookswort', opts);
    assert.equal(plant.ok, true, plant.msgs?.join(' '));
    assert.equal(plant.speech.key, 'herb_plant');
    assert.equal(plant.speech.text, 'Wahey!');
    assert.ok(plant.speech.slugs.energy > 0);
    const water = waterPlot(garden, key, pc, { ...opts, maxLuck: true });
    assert.equal(water.speech.key, 'herb_water');
    assert.equal(water.speech.text, 'Mmm... electrolytes.');
    const plot = getPlot(garden, key);
    plot.state = 'crop';
    const pick = harvestPlot(garden, key, inv, pc, { ...opts, maxLuck: true });
    assert.equal(pick.ok, true, pick.msgs?.join(' '));
    assert.equal(pick.speech.key, 'herb_harvest_3x');
    assert.equal(pick.speech.text, 'DAYAM!');
    assert.ok(pick.speech.slugs.energy > 0);
    const clear = clearPlot(garden, key, pc, opts);
    assert.equal(clear.ok, true, clear.msgs?.join(' '));
    assert.equal(clear.speech.key, 'herb_clear');
    assert.equal(clear.speech.text, 'Smooth.');
  });

  it('a missed pick talks with the na_failed line and no slugs', () => {
    const garden = createGarden({ cols: 1, rows: 1, gardenType: 'herb' });
    const key = plotKey(1, 1);
    const plot = getPlot(garden, key);
    plot.state = 'crop';
    plot.seed = 'herb_seed_rookswort';
    const pc = { energy: 500, mood: 10 };
    const r = harvestPlot(garden, key, createInventory({}), pc, { learned: [], rng: () => 0.999 });
    assert.equal(r.ok, false);
    assert.equal(r.speech.failed, true);
    assert.ok(GARDEN_TALKBACKS.herb_harvest_na_failed.includes(r.speech.text));
    assert.equal(r.speech.slugs, null);
  });
});

describe('G537: Water all waters every dry plot, an empty one too', () => {
  const learned = ['croppery_1'];
  const ctxFor = (pc, inv) => ({ pc, inv, learned, skills: { learned } });
  const bed = (garden) => ({ classId: 'garden_new', state: { garden } });

  it('waters a bed of empty plots, which then draw the wet soil', () => {
    // Austin 2026-11-05: Water all on a freshly hoed bed played the can, then every plot stayed dry.
    const garden = createGarden({ cols: 4, rows: 2, now: 0 });
    const inv = createInventory({ watering_can: 1 });
    const pc = { energy: 80, mood: 40, imagination: 0, xp: 0 };
    const verb = getVerbsFor(bed(garden), ctxFor(pc, inv)).find((v) => v.id === 'water_all');
    assert.equal(verb.enabled, true);
    assert.equal(verb.tooltip, 'Water every dry plot');
    const r = runVerb(bed(garden), 'water_all', ctxFor(pc, inv));
    assert.equal(r.ok, true, r.msgs?.join(' '));
    assert.equal(r.gardenChanged, true);
    for (const key of listPlotKeys(garden)) {
      assert.equal(getPlot(garden, key).wet, true, key);
      assert.equal(plotPieces(getPlot(garden, key)).base, 'wet', key);
    }
    assert.ok(pc.energy < 80, 'each plot watered costs its energy');
  });

  it('waters growing, empty and picked plots alike, and leaves wet ones be', () => {
    const garden = createGarden({ cols: 4, rows: 1, now: 0 });
    Object.assign(getPlot(garden, '1-1'), { state: 'seeds', seed: 'seed_spinach' });
    Object.assign(getPlot(garden, '2-1'), { state: 'clean' });
    Object.assign(getPlot(garden, '3-1'), { state: 'dirty' });
    Object.assign(getPlot(garden, '4-1'), { state: 'shoots', seed: 'seed_spinach', wet: true, wetAt: 0 });
    const pc = { energy: 100, mood: 40, imagination: 0, xp: 0 };
    const r = waterAllPlots(garden, pc, { now: 10, inv: createInventory({ watering_can: 1 }), rng: () => 0 });
    assert.equal(r.ok, true, r.msgs?.join(' '));
    assert.equal(r.watered, 3);
    assert.deepEqual(listPlotKeys(garden).map((k) => getPlot(garden, k).wet), [true, true, true, true]);
    assert.equal(getPlot(garden, '4-1').wetAt, 0, 'the wet plot was not watered again');
  });

  it('a bed with no dry plot greys the verb with the reason and spends nothing', () => {
    const garden = createGarden({ cols: 2, rows: 1, now: 0 });
    // Freshly watered: a plot takes water again only once it has lost an hour (GardenView.as 540-543).
    for (const key of listPlotKeys(garden)) Object.assign(getPlot(garden, key), { wet: true, wetAt: Date.now() });
    assert.equal(gardenNeedsWater(garden), false);
    const inv = createInventory({ watering_can: 1 });
    const pc = { energy: 80, mood: 40, imagination: 0, xp: 0 };
    const verb = getVerbsFor(bed(garden), ctxFor(pc, inv)).find((v) => v.id === 'water_all');
    assert.equal(verb.enabled, false);
    assert.equal(verb.reason, GARDEN_NO_DRY_PLOTS_LINE);
    assert.equal(GARDEN_NO_DRY_PLOTS_LINE, "Oops, there aren't any dry plots here.");
    const r = waterAllPlots(garden, pc, { now: 1, inv });
    assert.equal(r.ok, false);
    assert.deepEqual(r.msgs, [GARDEN_NO_DRY_PLOTS_LINE]);
    assert.equal(pc.energy, 80);
  });

  it('one dry empty plot takes water too, and a seed planted there grows at once', () => {
    const garden = createGarden({ cols: 1, rows: 1, now: 0 });
    const plot = getPlot(garden, '1-1');
    assert.equal(plotNeedsWater(plot), true);
    const inv = createInventory({ watering_can: 1, seed_spinach: 1 });
    const pc = { energy: 80, mood: 40, imagination: 0, xp: 0 };
    const target = { classId: 'garden_plot', state: { garden, plot, plotKey: '1-1' } };
    const verbs = getVerbsFor(target, ctxFor(pc, inv)).map((v) => v.id);
    assert.deepEqual(verbs, ['plant', 'water']);
    assert.equal(waterPlot(garden, '1-1', pc, { now: Date.now(), inv, rng: () => 0 }).ok, true);
    assert.equal(plot.wet, true);
    assert.deepEqual(getVerbsFor(target, ctxFor(pc, inv)).map((v) => v.id), ['plant']);
    assert.equal(plantPlot(garden, '1-1', inv, pc, 'seed_spinach', { now: 0 }).ok, true);
    assert.deepEqual(tickGarden(garden, SEED_CATALOG.seed_spinach.grow1Ms + 1), ['1-1']);
  });

  it('a Soak-All pours on a garden of dry empty plots (doesPlotNeedWater)', () => {
    const garden = createGarden({ cols: 2, rows: 1, now: 0 });
    assert.equal(plotsFor(garden, 'water').length, 2);
    for (const key of listPlotKeys(garden)) getPlot(garden, key).wet = true;
    assert.equal(plotsFor(garden, 'water').length, 0);
  });
});

// G561: a plot comes back as far as the time away carried it, as the site grows it.
describe('the tick catches up across every stage the time covers (G561)', () => {
  const T0 = 1_700_000_000_000;
  const H = GARDEN_WATER_MS / 12;
  const DRY = T0 + GARDEN_WATER_MS;
  const wetPlot = (seed, state, o = {}) => ({ state, seed, wet: true, wetAt: T0, stageStartedAt: T0, growthMs: 0, growModifier: 1, pace: GARDEN_SPEEDUP, wetPace: GARDEN_SPEEDUP, ...o });
  const tickOne = (plot, now) => {
    const garden = { plots: { '1-1': structuredClone(plot) } };
    const changed = tickGarden(garden, now);
    return { plot: garden.plots['1-1'], changed };
  };

  // Every seed, planted into fresh water at T0, looked at once at each boundary and at 13 hours;
  // plus the dry and banked cases. The same rows go through the site's HomeTending::tickPlot.
  const cases = [];
  for (const [id, s] of Object.entries(SEED_CATALOG)) {
    for (const dt of [0, s.grow1Ms - 1, s.grow1Ms, s.grow1Ms + s.grow2Ms - 1, s.grow1Ms + s.grow2Ms, GARDEN_WATER_MS - 1, GARDEN_WATER_MS, 13 * H, 40 * H]) {
      cases.push({ name: `${id} +${dt}`, plot: wetPlot(id, 'seeds'), now: T0 + dt });
    }
    cases.push({ name: `${id} Growth Spurt 13h`, plot: wetPlot(id, 'seeds', { growModifier: 0.9 }), now: T0 + 13 * H });
    cases.push({ name: `${id} Speedy 0.8 one stage`, plot: wetPlot(id, 'seeds', { growModifier: 0.8 }), now: T0 + Math.ceil(s.grow1Ms * 0.8) });
    cases.push({ name: `${id} planted just before it dried`, plot: wetPlot(id, 'seeds', { stageStartedAt: DRY - Math.floor(s.grow1Ms / 2) }), now: T0 + 13 * H });
    cases.push({ name: `${id} shoots when it dried`, plot: wetPlot(id, 'seeds', { stageStartedAt: DRY - s.grow1Ms - Math.floor(s.grow2Ms / 2) }), now: T0 + 13 * H });
    cases.push({ name: `${id} banked shoots rewatered`, plot: wetPlot(id, 'shoots', { growthMs: s.grow2Ms - 1000 }), now: T0 + 999 });
    cases.push({ name: `${id} banked shoots rewatered, done`, plot: wetPlot(id, 'shoots', { growthMs: s.grow2Ms - 1000 }), now: T0 + 13 * H });
    cases.push({ name: `${id} dry with banked growth`, plot: { ...wetPlot(id, 'seeds', { growthMs: 1000 }), wet: false, wetAt: null }, now: T0 + 13 * H });
  }
  cases.push({ name: 'crop dries', plot: wetPlot('seed_spinach', 'crop'), now: T0 + 13 * H });
  cases.push({ name: 'clean dries', plot: wetPlot(null, 'clean'), now: T0 + 13 * H });
  cases.push({ name: 'dirty stays wet', plot: wetPlot(null, 'dirty'), now: T0 + H });
  // The same looks at plots stored before the garden's speed changed (no pace, no wetPace): the
  // old stage times and the old 12 real hours of water, on both sides.
  const OLD_H = LEGACY_GARDEN.waterMs / 12;
  const OLD_DRY = T0 + LEGACY_GARDEN.waterMs;
  const oldPlot = (seed, state, o = {}) => ({ state, seed, wet: true, wetAt: T0, stageStartedAt: T0, growthMs: 0, growModifier: 1, ...o });
  for (const [id, s] of Object.entries(SEED_CATALOG)) {
    const l1 = legacyGrowMs(s.grow1H);
    const l2 = legacyGrowMs(s.grow2H);
    for (const dt of [0, l1 - 1, l1, l1 + l2 - 1, l1 + l2, s.grow1Ms, GARDEN_WATER_MS, LEGACY_GARDEN.waterMs - 1, LEGACY_GARDEN.waterMs, 13 * OLD_H]) {
      cases.push({ name: `old ${id} +${dt}`, plot: oldPlot(id, 'seeds'), now: T0 + dt });
    }
    cases.push({ name: `old ${id} Growth Spurt`, plot: oldPlot(id, 'seeds', { growModifier: 0.9 }), now: T0 + Math.ceil(l1 * 0.9) });
    cases.push({ name: `old ${id} planted just before it dried`, plot: oldPlot(id, 'seeds', { stageStartedAt: OLD_DRY - Math.floor(l1 / 2) }), now: T0 + 13 * OLD_H });
    cases.push({ name: `old ${id} planted 3 hours after the water`, plot: oldPlot(id, 'seeds', { stageStartedAt: T0 + 3 * OLD_H }), now: T0 + 3 * OLD_H + l1 + l2 });
    cases.push({ name: `old ${id} dry with banked growth`, plot: { ...oldPlot(id, 'seeds', { growthMs: 1000 }), wet: false, wetAt: null }, now: T0 + 13 * OLD_H });
    // Mixed: an old crop under new water, a new crop under old water.
    cases.push({ name: `old ${id} under new water`, plot: oldPlot(id, 'seeds', { wetPace: GARDEN_SPEEDUP }), now: T0 + l1 + l2 });
    cases.push({ name: `new ${id} under old water, 3 hours in`, plot: oldPlot(id, 'seeds', { pace: GARDEN_SPEEDUP, stageStartedAt: T0 + 3 * OLD_H }), now: T0 + 3 * OLD_H + l1 + l2 });
    cases.push({ name: `new ${id} under old water, ripe`, plot: oldPlot(id, 'seeds', { pace: GARDEN_SPEEDUP, stageStartedAt: T0 + 3 * OLD_H }), now: T0 + 3 * OLD_H + s.grow1Ms + s.grow2Ms });
  }
  cases.push({ name: 'old crop keeps its 12 hours', plot: oldPlot('seed_spinach', 'crop'), now: T0 + GARDEN_WATER_MS * 2 });
  cases.push({ name: 'old clean dries at 12 hours', plot: oldPlot(null, 'clean'), now: T0 + 13 * OLD_H });

  it('a plot watered and planted 13 hours ago is a crop, dry, its stages ended at their own times', () => {
    const s = SEED_CATALOG.seed_spinach;
    const { plot, changed } = tickOne(wetPlot('seed_spinach', 'seeds'), T0 + 13 * H);
    assert.deepEqual(changed, ['1-1']);
    assert.equal(plot.state, 'crop');
    assert.equal(plot.wet, false);
    assert.equal(plot.wetAt, null);
    assert.equal(plot.stageStartedAt, DRY);
    assert.equal(plot.growthMs, 0);
    // Watered an hour of garden time ago but planted later: the crop came its own grow time after planting.
    const late = tickOne(wetPlot('seed_spinach', 'seeds', { stageStartedAt: T0 + H }), T0 + H + s.grow1Ms + s.grow2Ms);
    assert.equal(late.plot.state, 'crop');
    assert.equal(late.plot.wet, true);
    assert.equal(late.plot.stageStartedAt, T0 + H + s.grow1Ms + s.grow2Ms);
  });

  it('a short gap still moves one stage, and the next stage starts when the last one ended', () => {
    const s = SEED_CATALOG.seed_potato;
    assert.equal(tickOne(wetPlot('seed_potato', 'seeds'), T0 + s.grow1Ms - 1).plot.state, 'seeds');
    const { plot } = tickOne(wetPlot('seed_potato', 'seeds'), T0 + s.grow1Ms + 250);
    assert.equal(plot.state, 'shoots');
    assert.equal(plot.stageStartedAt, T0 + s.grow1Ms);
    assert.equal(plot.wet, true);
    // Frame by frame and in one look land on the same plot.
    const garden = { plots: { '1-1': wetPlot('seed_potato', 'seeds') } };
    for (let t = T0; t <= T0 + s.grow1Ms + s.grow2Ms + 5000; t += 333) tickGarden(garden, t);
    assert.deepEqual(garden.plots['1-1'], tickOne(wetPlot('seed_potato', 'seeds'), T0 + s.grow1Ms + s.grow2Ms + 5000 - ((s.grow1Ms + s.grow2Ms + 5000) % 333)).plot);
  });

  it('a plot that dries stops where the watering ran out, with that stage\'s growth banked', () => {
    const s = SEED_CATALOG.seed_spinach;
    const seeds = tickOne(wetPlot('seed_spinach', 'seeds', { stageStartedAt: DRY - 2000 }), T0 + 13 * H).plot;
    assert.deepEqual([seeds.state, seeds.wet, seeds.growthMs, seeds.stageStartedAt], ['seeds', false, 2000, DRY]);
    const shoots = tickOne(wetPlot('seed_spinach', 'seeds', { stageStartedAt: DRY - s.grow1Ms - 1500 }), T0 + 13 * H).plot;
    assert.deepEqual([shoots.state, shoots.wet, shoots.growthMs], ['shoots', false, 1500]);
    // A dry plot never moves, however long it waits; watered again, it takes only what was left.
    const dry = { ...seeds };
    assert.deepEqual(tickOne(dry, T0 + 100 * H).changed, []);
    const rewet = { ...seeds, wet: true, wetAt: T0 + 20 * H, stageStartedAt: T0 + 20 * H };
    assert.equal(tickOne(rewet, T0 + 20 * H + s.grow1Ms - 2001).plot.state, 'seeds');
    assert.equal(tickOne(rewet, T0 + 20 * H + s.grow1Ms - 2000).plot.state, 'shoots');
  });

  const hasPhp = spawnSync('php', ['-v']).status === 0;
  it('lands on the same plot as the site\'s tick (src/HomeTending.php tickPlot)', { skip: !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false }, () => {
    const code = `require ${JSON.stringify(SITE_DIR)} . '/src/HomeTending.php'; $seeds = Groddle\\Minn\\HomeTending::seeds(); $out = [];
      foreach (json_decode($argv[1]) as $c) { $p = $c->plot; Groddle\\Minn\\HomeTending::tickPlot($p, (int) $c->now, $seeds); $out[] = $p; }
      echo json_encode($out);`;
    const site = JSON.parse(execFileSync('php', ['-r', code, '--', JSON.stringify(cases)], { encoding: 'utf8' }));
    assert.equal(site.length, cases.length);
    const pick = (p) => ({ state: p.state, wet: p.wet, wetAt: p.wetAt ?? null, stageStartedAt: p.stageStartedAt, growthMs: p.growthMs, pace: p.pace ?? null, wetPace: p.wet ? p.wetPace ?? null : null });
    cases.forEach((c, i) => assert.deepEqual(pick(tickOne(c.plot, c.now).plot), pick(site[i]), c.name));
    // The fixture reaches every stage both ways.
    const states = new Set(site.map((p) => `${p.state}/${p.wet}`));
    for (const s of ['seeds/true', 'shoots/true', 'crop/true', 'seeds/false', 'shoots/false', 'crop/false']) assert.ok(states.has(s), s);
  });
});
