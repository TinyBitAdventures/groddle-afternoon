/**
 * rules-a gardens (2026-11-12): garden potion energy, re-watering a plot that has lost an
 * hour, plot lines, crop quest counts and Pumpkin Seeds in herb beds. Sources:
 * glitch-GameServerJS items/potion_garden_*.js, items/include/garden.js,
 * items/include/master_garden.js, glitch-client GardenView.as.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GARDEN_HOUR_MS,
  GARDEN_WATER_MS,
  LEGACY_GARDEN,
  clearPlot,
  createGarden,
  gardenNeedsWater,
  harvestPlot,
  listPlantableSeeds,
  pickedLine,
  plantPlot,
  plotNeedsWater,
  SEED_CATALOG,
  seedFitsGarden,
  waterPlot,
  wetPlot,
} from '../public/js/garden.js?v=1420a6d6';
import { canPour, mgDetails, plotsFor } from '../public/js/master-garden.js?v=ff6ca66a';
import { gardenPlotEvents } from '../public/js/quest-offers.js?v=d18bee8b';

const MG = ['croppery_1', 'mastergardener_1'];

function bed(states, type = 'default') {
  const g = createGarden({ cols: states.length, rows: 1, gardenType: type, now: 0 });
  Object.values(g.plots).forEach((p, i) => {
    p.state = states[i];
    if (states[i] === 'crop') p.seed = type === 'herb' ? 'herb_seed_gandlevery' : 'seed_carrot';
  });
  return g;
}

describe('garden potions price only the plots they work (potion_garden_*.js)', () => {
  it('Super-Hoe counts the dirty plots (clear.js 543-553)', () => {
    const g = bed(['dirty', 'dirty', 'clean', 'clean', 'clean', 'clean', 'clean', 'clean']);
    const cost = Number(mgDetails('default', 'hoe', MG).energy_cost);
    assert.equal(canPour('potion_garden_clear', g, { learned: MG, energy: cost * 2 }).ok, false);
    assert.equal(canPour('potion_garden_clear', g, { learned: MG, energy: cost * 2 + 1 }).ok, true);
  });

  it('Manyharvest counts the ripe plots at the plant package (harvest.js 540-557)', () => {
    const g = bed(['crop', 'crop', 'dirty', 'dirty', 'dirty', 'dirty', 'dirty', 'dirty', 'dirty', 'dirty', 'dirty', 'dirty', 'dirty', 'dirty', 'dirty']);
    const plant = Number(mgDetails('default', 'plant', MG).energy_cost);
    assert.equal(canPour('potion_garden_harvest', g, { learned: MG, energy: plant * 2 }).ok, false);
    assert.equal(canPour('potion_garden_harvest', g, { learned: MG, energy: plant * 2 + 1 }).ok, true);
  });

  it('Seed-Dibber counts the clean plots, and with no seed says the source line (plant.js 446-451, 600-609)', () => {
    const g = bed(['clean', 'dirty', 'dirty', 'dirty']);
    const plant = Number(mgDetails('default', 'plant', MG).energy_cost);
    const inv = { seed_carrot: 5 };
    assert.equal(canPour('potion_garden_plant', g, { learned: MG, energy: plant + 1, seedId: 'seed_carrot', inv }).ok, true);
    assert.equal(canPour('potion_garden_plant', g, { learned: MG, energy: 100, seedId: 'seed_carrot', inv: {} }).msg, "You don't have anything to plant!");
  });
});

describe('a plot takes water again once it has lost an hour (GardenView.as 540-543, master_garden.js 1185-1196)', () => {
  it('wet for under an hour: refused; past an hour: watered, its dry clock starts over', () => {
    const g = createGarden({ cols: 1, rows: 1, now: 0 });
    const plot = g.plots['1-1'];
    wetPlot(plot, 1000);
    assert.equal(plotNeedsWater(plot, 1000 + GARDEN_HOUR_MS - 1), false);
    const early = waterPlot(g, '1-1', { energy: 100, mood: 50 }, { now: 1000 + GARDEN_HOUR_MS - 1, requireTool: false, rng: () => 0 });
    assert.equal(early.reason, 'wet');
    const t = 1000 + GARDEN_HOUR_MS + 1;
    assert.equal(plotNeedsWater(plot, t), true);
    assert.equal(gardenNeedsWater(g, t), true);
    assert.equal(plotsFor(g, 'water', t).length, 1, 'the Soak-All takes it too');
    const r = waterPlot(g, '1-1', { energy: 100, mood: 50 }, { now: t, requireTool: false, rng: () => 0 });
    assert.equal(r.ok, true);
    assert.equal(plot.wetAt, t);
  });

  it('a shared bed and a neighbour\'s bed water dry plots only (the server and the site decide)', () => {
    const g = createGarden({ cols: 1, rows: 1, now: 0 });
    wetPlot(g.plots['1-1'], 0);
    const later = GARDEN_WATER_MS - 1;
    assert.equal(plotNeedsWater(g.plots['1-1'], later, g), true);
    assert.equal(plotNeedsWater(g.plots['1-1'], later, { ...g, shared: true }), false);
    assert.equal(plotNeedsWater(g.plots['1-1'], later, { ...g, dryOnly: true }), false);
  });

  it('a watering on the old 12-hour clock is never cut short', () => {
    const plot = { state: 'seeds', seed: 'seed_carrot', wet: true, wetAt: 0, stageStartedAt: 0 };
    assert.equal(plotNeedsWater(plot, LEGACY_GARDEN.waterMs - GARDEN_WATER_MS), false);
    wetPlot(plot, 5000);
    assert.equal(plot.wetAt, 0);
    assert.equal(plot.wetPace, undefined);
  });
});

describe('solo plot lines are the source\'s (include/garden.js)', () => {
  it('refusals and successes', () => {
    const g = bed(['dirty', 'clean', 'crop', 'clean']);
    const pc = () => ({ energy: 100, mood: 50 });
    assert.equal(plantPlot(g, '1-1', { seed_carrot: 1 }, pc(), 'seed_carrot').msgs[0], 'Oops. You need to clean that plot first.');
    assert.equal(clearPlot(g, '2-1', pc(), { requireTool: false }).msgs[0], "Oops. Don't need no hoeing.");
    assert.equal(harvestPlot(g, '2-1', {}, pc()).msgs[0], 'Oops. There is nothing there to pick.');
    assert.equal(harvestPlot(g, '3-1', {}, { energy: 1, mood: 50 }).msgs[0], "You're too tired to do that.");
    assert.equal(plantPlot(g, '4-1', { seed_carrot: 1 }, pc(), 'seed_carrot', { rng: () => 0 }).msgs[0], 'You planted some Carrot Seeds.');
    assert.equal(clearPlot(g, '1-1', pc(), { requireTool: false, rng: () => 0 }).msgs[0], 'You cleaned a plot.');
  });

  it('a pick names the crop\'s plural, or one with its article (518-522)', () => {
    assert.equal(pickedLine(SEED_CATALOG.seed_potato, 6), 'You picked some Potatoes.');
    assert.equal(pickedLine(SEED_CATALOG.seed_spinach, 6), 'You picked some Spinach.');
    assert.equal(pickedLine(SEED_CATALOG.herb_seed_gandlevery, 3), 'You picked some Sprigs of Gandlevery.');
    assert.equal(pickedLine(SEED_CATALOG.seed_onion, 1), 'You picked an Onion.');
  });
});

describe('crop quests count the base crop (include/garden.js 514, 532)', () => {
  it('garden_harvest takes no Super Harvest bonus; onions_harvested does', () => {
    const rows = gardenPlotEvents({ verb: 'harvest', cropId: 'onion', count: 12, baseCount: 6, superHarvest: true });
    assert.deepEqual(rows.filter((r) => /harvest/.test(r.event)), [
      { event: 'garden_harvest:onion', amount: 6 },
      { event: 'onions_harvested', amount: 12 },
    ]);
    const tater = gardenPlotEvents({ verb: 'harvest', cropId: 'potato', count: 8, baseCount: 4 });
    assert.equal(tater.find((r) => r.event === 'garden_harvest:potato').amount, 4);
  });
});

describe('Pumpkin Seeds plant in either bed (seed_pumpkin.js 134-140)', () => {
  it('fits a crop and an herb bed; other crop seeds stay out of herb beds', () => {
    assert.equal(seedFitsGarden(SEED_CATALOG.seed_pumpkin, 'herb'), true);
    assert.equal(seedFitsGarden(SEED_CATALOG.seed_pumpkin, 'default'), true);
    assert.equal(seedFitsGarden(SEED_CATALOG.seed_carrot, 'herb'), false);
    assert.ok(listPlantableSeeds({ seed_pumpkin: 2 }, 'herb').some((s) => s.seedId === 'seed_pumpkin'));
  });
});
