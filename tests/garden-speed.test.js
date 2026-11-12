/**
 * The garden's speed (Austin 2026-11-10): gardens run about 10 times faster than Glitch's, not
 * 450 times. One number, js/garden.js GARDEN_SPEEDUP, sets every garden time: each seed's two
 * stages (the source's hours, seed_*.js and herb_seed_*.js classProps time_grow1 / time_grow2,
 * times config.garden_grow_multiplier, 1.0 on prod) and the watering (include/garden.js 3-4,
 * timings.water 12 hours). Growth cards and Guano keep the source's proportions, and nothing in
 * the ground when the speed changed is lost, reset or made to wait: a crop planted before
 * finishes on the old clock, in a solo save, in a home's stored plots (site HomeTending.php) and
 * in the realtime server's state file (gardens.go, its own tests).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GARDEN_HOUR_MS,
  GARDEN_SPEEDUP,
  GARDEN_WATER_HOURS,
  GARDEN_WATER_MS,
  LEGACY_GARDEN,
  SEED_CATALOG,
  applyFertilizer,
  createGarden,
  fertilizeCheck,
  gardenWaitLabel,
  getPlot,
  growHoursToMs,
  harvestPlot,
  clearPlot,
  legacyGrowMs,
  plantPlot,
  plotOnPace,
  plotRipeInMs,
  plotStageMs,
  plotStatusLabel,
  plotWaterLeftMs,
  plotWaterMs,
  sowPlot,
  tickGarden,
  waterPlot,
  wetPlot,
} from '../public/js/garden.js?v=37209241';
import { normalizeGardenSnapshot } from '../public/js/player-save.js?v=ad26356b';
import { normalizeFeatureSlices } from '../public/js/feature-host.js?v=06bb8b74';
import { applyPlot, localPlot, GARDEN_LOCK_MS } from '../public/js/shared-gardens.js?v=c1f90bc0';
import { applyTendAct } from '../public/js/neighbours-mp.js?v=1abe37a1';
import { potionTendGarden } from '../public/js/master-garden.js?v=e699ce82';
import { HAS_SITE, SITE_DIR } from '../tools/repos.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GSJS_ITEMS = join(__dirname, '../../glitch-GameServerJS/items');
const MIN = 60_000;
const T0 = 1_800_000_000_000;
const pc = () => ({ energy: 5000, mood: 50, imagination: 0, xp: 0 });
const seedsInv = () => Object.fromEntries(Object.keys(SEED_CATALOG).map((id) => [id, 20]));

describe('one number sets the garden\'s speed', () => {
  it('10 times Glitch: a source hour is 6 minutes, a watering 72', () => {
    assert.equal(GARDEN_SPEEDUP, 10);
    assert.equal(GARDEN_HOUR_MS, 3_600_000 / GARDEN_SPEEDUP);
    assert.equal(GARDEN_HOUR_MS, 6 * MIN);
    assert.equal(GARDEN_WATER_HOURS, 12);
    assert.equal(GARDEN_WATER_MS, GARDEN_WATER_HOURS * GARDEN_HOUR_MS);
    assert.equal(GARDEN_WATER_MS, 72 * MIN);
  });

  it('every seed keeps the source\'s hours and grows them at that speed, with no floor', () => {
    for (const [id, s] of Object.entries(SEED_CATALOG)) {
      assert.equal(s.grow1Ms, s.grow1H * GARDEN_HOUR_MS, id);
      assert.equal(s.grow2Ms, s.grow2H * GARDEN_HOUR_MS, id);
      assert.equal(s.grow1Ms, growHoursToMs(s.grow1H), id);
    }
    const total = (id) => (SEED_CATALOG[id].grow1Ms + SEED_CATALOG[id].grow2Ms) / MIN;
    assert.equal(total('seed_spinach'), 4.5);
    assert.equal(total('seed_onion'), 9);
    assert.equal(total('seed_rice'), 7.5);
    assert.equal(total('seed_potato'), 69);
    assert.equal(total('herb_seed_purple_flower'), 6);
    assert.equal(total('herb_seed_yellow_crumb_flower'), 54);
    // The shortest stage anywhere is spinach's quarter hour: 90 s, where the old clock's 4 s floor
    // stretched five stages (spinach 0.5 and 0.25 h, onion and rice 0.5 h, purple flower 0.5 h).
    const shortest = Math.min(...Object.values(SEED_CATALOG).flatMap((s) => [s.grow1Ms, s.grow2Ms]));
    assert.equal(shortest, 90_000);
    assert.equal(growHoursToMs(0.01), 3600, 'no floor');
    // One watering covers the longest crop, as 12 hours covered potato's 11.5 in Glitch.
    const longest = Math.max(...Object.values(SEED_CATALOG).map((s) => s.grow1Ms + s.grow2Ms));
    assert.equal(longest, 69 * MIN);
    assert.ok(longest < GARDEN_WATER_MS);
  });

  it('the hours are the original\'s (items/seed_*.js, herb_seed_*.js classProps)', { skip: !existsSync(GSJS_ITEMS) && 'needs glitch-GameServerJS beside the game' }, () => {
    const files = readdirSync(GSJS_ITEMS).filter((f) => /^(herb_)?seed_[a-z_]+\.js$/.test(f));
    let checked = 0;
    for (const f of files) {
      const id = f.replace(/\.js$/, '');
      const src = readFileSync(join(GSJS_ITEMS, f), 'utf8');
      const g1 = src.match(/"time_grow1"\s*:\s*"?([\d.]+)"?/);
      const g2 = src.match(/"time_grow2"\s*:\s*"?([\d.]+)"?/);
      if (!g1 || !g2 || !SEED_CATALOG[id]) continue;
      assert.equal(SEED_CATALOG[id].grow1H, Number(g1[1]), `${id} time_grow1`);
      assert.equal(SEED_CATALOG[id].grow2H, Number(g2[1]), `${id} time_grow2`);
      checked += 1;
    }
    assert.equal(checked, Object.keys(SEED_CATALOG).length, 'every catalogue seed was checked against its source file');
    const garden = readFileSync(join(GSJS_ITEMS, 'include/garden.js'), 'utf8');
    assert.match(garden, /water : 12,/);
    assert.match(garden, /pushEvent\(plot, 0\.0167, 'unlock'\)/);
    assert.match(readFileSync(join(GSJS_ITEMS, '../config_prod.js'), 'utf8'), /garden_grow_multiplier = 1\.0;/);
  });

  it('the planter\'s lock stays the source\'s own real 60 seconds (0.0167 h), not scaled', () => {
    assert.equal(GARDEN_LOCK_MS, 60_000);
  });
});

describe('a crop at the new speed', () => {
  it('spinach: seeds 3 minutes, shoots 90 seconds, only while wet', () => {
    const garden = createGarden({ cols: 1, rows: 1, now: T0 });
    const plot = getPlot(garden, '1-1');
    assert.equal(waterPlot(garden, '1-1', pc(), { now: T0, requireTool: false }).ok, true);
    assert.equal(plantPlot(garden, '1-1', seedsInv(), pc(), 'seed_spinach', { now: T0 }).ok, true);
    assert.equal(plot.pace, GARDEN_SPEEDUP);
    assert.equal(plot.wetPace, GARDEN_SPEEDUP);
    assert.deepEqual(tickGarden(garden, T0 + 3 * MIN - 1), []);
    assert.deepEqual(tickGarden(garden, T0 + 3 * MIN), ['1-1']);
    assert.equal(plot.state, 'shoots');
    assert.deepEqual(tickGarden(garden, T0 + 4.5 * MIN - 1), []);
    assert.deepEqual(tickGarden(garden, T0 + 4.5 * MIN), ['1-1']);
    assert.equal(plot.state, 'crop');
  });

  it('potato ripens in 69 minutes inside one watering; planted late it dries, keeps its growth, and goes on when watered', () => {
    const garden = createGarden({ cols: 2, rows: 1, now: T0 });
    const inv = seedsInv();
    for (const key of ['1-1', '2-1']) waterPlot(garden, key, pc(), { now: T0, requireTool: false });
    plantPlot(garden, '1-1', inv, pc(), 'seed_potato', { now: T0 });
    plantPlot(garden, '2-1', inv, pc(), 'seed_potato', { now: T0 + 10 * MIN });
    tickGarden(garden, T0 + 69 * MIN);
    assert.equal(getPlot(garden, '1-1').state, 'crop');
    assert.equal(getPlot(garden, '1-1').wet, true);
    tickGarden(garden, T0 + 72 * MIN);
    const late = getPlot(garden, '2-1');
    assert.deepEqual([late.state, late.wet, late.growthMs], ['shoots', false, 26 * MIN]);
    assert.equal(getPlot(garden, '1-1').wet, false, 'the watering ran out at 72 minutes');
    // Dry for a day: nothing grows, nothing is lost.
    assert.deepEqual(tickGarden(garden, T0 + 24 * 60 * MIN), []);
    assert.equal(late.growthMs, 26 * MIN);
    assert.equal(plotRipeInMs(late, T0 + 24 * 60 * MIN), 7 * MIN);
    waterPlot(garden, '2-1', pc(), { now: T0 + 24 * 60 * MIN, requireTool: false });
    tickGarden(garden, T0 + 24 * 60 * MIN + 7 * MIN - 1);
    assert.equal(late.state, 'shoots');
    tickGarden(garden, T0 + 24 * 60 * MIN + 7 * MIN);
    assert.equal(late.state, 'crop');
  });

  it('the growth cards cut 10% or 20%, as the source\'s grow_modifier (include/garden.js 361-378)', () => {
    const grow = (seedId, type, upgrades) => {
      const garden = createGarden({ cols: 1, rows: 1, gardenType: type, now: T0 });
      plantPlot(garden, '1-1', seedsInv(), pc(), seedId, { now: T0, upgrades });
      const plot = getPlot(garden, '1-1');
      return [plot.growModifier, plotStageMs(plot, 'seeds'), plotStageMs(plot, 'shoots')];
    };
    assert.deepEqual(grow('seed_spinach', 'default', []), [1, 180_000, 90_000]);
    assert.deepEqual(grow('seed_spinach', 'default', ['croppery_time_1']), [0.9, 162_000, 81_000]);
    assert.deepEqual(grow('seed_spinach', 'default', ['croppery_time_1', 'croppery_time_2']), [0.8, 144_000, 72_000]);
    assert.deepEqual(grow('seed_potato', 'default', ['croppery_time_2']), [0.8, 1_728_000, 1_584_000]);
    assert.deepEqual(grow('herb_seed_rubeweed', 'herb', ['herbalism_time_1']), [0.9, 648_000, 648_000]);
    assert.deepEqual(grow('herb_seed_rubeweed', 'herb', ['herbalism_time_2']), [0.8, 576_000, 576_000]);
    // A crop card does nothing for an herb, nor an herb card for a crop.
    assert.deepEqual(grow('herb_seed_rubeweed', 'herb', ['croppery_time_2'])[0], 1);
    assert.deepEqual(grow('seed_spinach', 'default', ['herbalism_time_2'])[0], 1);
  });

  it('Guano skips the rest of the seeds stage, or leaves a tenth of what is left of the shoots (625-639)', () => {
    const seed = SEED_CATALOG.seed_potato;
    const plot = { ...createGarden({ cols: 1, rows: 1, now: T0 }).plots['1-1'] };
    wetPlot(plot, T0);
    sowPlot(plot, 'seed_potato', T0);
    applyFertilizer(plot, seed, T0 + 5 * MIN);
    assert.deepEqual([plot.state, plot.stageStartedAt, plot.fertilized], ['shoots', T0 + 5 * MIN, false]);
    // 3 minutes into the 33 of shoots: 30 are left, Guano leaves 3.
    applyFertilizer(plot, seed, T0 + 8 * MIN);
    assert.equal(plot.fertilized, true);
    assert.equal(plotRipeInMs(plot, T0 + 8 * MIN), 3 * MIN);
    const garden = { plots: { '1-1': plot } };
    assert.deepEqual(tickGarden(garden, T0 + 11 * MIN - 1), []);
    assert.deepEqual(tickGarden(garden, T0 + 11 * MIN), ['1-1']);
    assert.equal(plot.state, 'crop');
    // Guano still wants 80% of the watering left: within the first 14.4 of the 72 minutes.
    const wet = { state: 'seeds', seed: 'seed_potato', wet: true, wetAt: T0, wetPace: GARDEN_SPEEDUP, pace: GARDEN_SPEEDUP, stageStartedAt: T0, growthMs: 0, growModifier: 1 };
    assert.equal(fertilizeCheck(wet, T0 + 14.4 * MIN).ok, true);
    assert.equal(fertilizeCheck(wet, T0 + 14.4 * MIN + 1).ok, false);
  });

  it('a Seed-Dibber pour and a key-holder\'s seed go in on the same clock', () => {
    const garden = createGarden({ cols: 4, rows: 2, now: T0 });
    const inv = { seed_spinach: 8 };
    const res = potionTendGarden(garden, 'plant', inv, { energy: 500 }, { learned: ['croppery_1', 'mastergardener_1'], seedId: 'seed_spinach', now: T0, rng: () => 0.99 });
    assert.ok(res.count > 0, JSON.stringify(res));
    const sown = Object.values(garden.plots).filter((p) => p.state === 'seeds');
    assert.equal(sown.length, res.count);
    for (const p of sown) assert.equal(p.pace, GARDEN_SPEEDUP);
    const home = createGarden({ cols: 1, rows: 1, now: T0 });
    applyTendAct(home, { plot: '1-1', act: 'water', at: T0 }, tickGarden);
    applyTendAct(home, { plot: '1-1', act: 'plant', seed: 'seed_potato', at: T0 }, tickGarden);
    assert.deepEqual([home.plots['1-1'].pace, home.plots['1-1'].wetPace, plotStageMs(home.plots['1-1'])], [GARDEN_SPEEDUP, GARDEN_SPEEDUP, 36 * MIN]);
  });

  it('no code makes a plot seeds except through sowPlot (a plot with no pace counts as planted before the change)', () => {
    const root = join(__dirname, '../public');
    const files = ['game.js', 'content.js', ...readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
      ...readdirSync(join(root, 'js/features')).filter((f) => f.endsWith('.js')).map((f) => `js/features/${f}`)];
    const hits = [];
    for (const f of files) {
      const text = readFileSync(join(root, f), 'utf8');
      text.split('\n').forEach((line, i) => {
        if (/\.state\s*=\s*'seeds'/.test(line) || /\.state\s*=[^=;]*\?\s*'seeds'/.test(line)) hits.push(`${f}:${i + 1}`);
      });
    }
    assert.equal(hits.length, 1, hits.join(', '));
    assert.match(hits[0], /^js\/garden\.js:/);
  });
});

describe('what a plot says while it grows', () => {
  it('waits read in minutes and hours, rounded up', () => {
    assert.equal(gardenWaitLabel(0), 'under a minute');
    assert.equal(gardenWaitLabel(59_999), 'under a minute');
    assert.equal(gardenWaitLabel(60_000), '1 min');
    assert.equal(gardenWaitLabel(60_001), '2 min');
    assert.equal(gardenWaitLabel(4.5 * MIN), '5 min');
    assert.equal(gardenWaitLabel(59 * MIN + 1), '1 h');
    assert.equal(gardenWaitLabel(60 * MIN), '1 h');
    assert.equal(gardenWaitLabel(69 * MIN), '1 h 9 min');
    assert.equal(gardenWaitLabel(11.5 * 60 * MIN), '11 h 30 min');
  });

  it('a wet plot says when it is ready, a dry one how much growing is left, and when the water runs out first', () => {
    const plot = { ...createGarden({ cols: 1, rows: 1, now: T0 }).plots['1-1'] };
    wetPlot(plot, T0);
    sowPlot(plot, 'seed_potato', T0);
    assert.equal(plotStatusLabel(plot, T0), 'Potato seeds · wet · ready in 1 h 9 min');
    assert.equal(plotStatusLabel(plot, T0 + 30 * MIN), 'Potato seeds · wet · ready in 39 min');
    tickGarden({ plots: { a: plot } }, T0 + 40 * MIN);
    assert.equal(plotStatusLabel(plot, T0 + 40 * MIN), 'Potato shoots · wet · ready in 29 min');
    assert.equal(plotStatusLabel(plot, T0 + 68.5 * MIN), 'Potato shoots · wet · ready in under a minute');
    // Planted 10 minutes into the watering: the water runs out 7 minutes before the crop.
    const late = { ...createGarden({ cols: 1, rows: 1, now: T0 }).plots['1-1'] };
    wetPlot(late, T0);
    sowPlot(late, 'seed_potato', T0 + 10 * MIN);
    assert.equal(plotWaterLeftMs(late, T0 + 10 * MIN), 62 * MIN);
    assert.equal(plotStatusLabel(late, T0 + 10 * MIN), 'Potato seeds · wet · ready in 1 h 9 min · dries in 1 h 2 min');
    tickGarden({ plots: { a: late } }, T0 + 80 * MIN);
    assert.equal(plotStatusLabel(late, T0 + 80 * MIN), 'Potato shoots · needs water · 7 min of growing left');
    assert.equal(plotStatusLabel({ state: 'crop', seed: 'seed_potato' }, T0), 'Potato ready to harvest!');
    assert.equal(plotStatusLabel({ state: 'clean' }, T0), 'Clean · ready to plant');
  });
});

describe('crops in the ground when the speed changed', () => {
  // A street garden as a save from before held it (js/player-save.js normalizePlotSnapshot's fields).
  const oldSave = (now) => ({
    gardenType: 'default',
    cols: 4,
    rows: 1,
    plots: {
      // Potato planted 15 s ago in a plot watered 3 hours ago: on the old clock 48 s of seeds, 44 s of shoots.
      '1-1': { state: 'seeds', seed: 'seed_potato', wet: true, wetAt: now - 3 * 3_600_000, stageStartedAt: now - 15_000, growthMs: 0, growModifier: 1, fertilized: false },
      // Spinach shoots left dry with 1 s of their old 4 s kept.
      '2-1': { state: 'shoots', seed: 'seed_spinach', wet: false, wetAt: null, stageStartedAt: now - 60_000, growthMs: 1000, growModifier: 1, fertilized: false },
      // A ripe crop, and an empty plot watered 11 hours ago.
      '3-1': { state: 'crop', seed: 'seed_spinach', wet: true, wetAt: now - 3 * 3_600_000, stageStartedAt: now - 600_000, growthMs: 0, growModifier: 1, fertilized: false },
      '4-1': { state: 'clean', seed: null, wet: true, wetAt: now - 11 * 3_600_000, stageStartedAt: now - 11 * 3_600_000, growthMs: 0, growModifier: 1, fertilized: false },
    },
  });

  it('the old clock: 8 s a source hour, 4 s at least, a watering 12 real hours', () => {
    assert.deepEqual(LEGACY_GARDEN, { hourMs: 8000, floorMs: 4000, waterMs: 43_200_000 });
    assert.equal(legacyGrowMs(0.25), 4000);
    assert.equal(legacyGrowMs(0.5), 4000);
    assert.equal(legacyGrowMs(0.75), 6000);
    assert.equal(legacyGrowMs(6), 48_000);
    const longest = Math.max(...Object.values(SEED_CATALOG).map((s) => legacyGrowMs(s.grow1H) + legacyGrowMs(s.grow2H)));
    assert.equal(longest, 92_000, 'an old crop is at most 92 s from ripe');
  });

  it('a solo save: loading keeps every stored time as it was and adds no pace', () => {
    const before = oldSave(T0);
    const loaded = normalizeGardenSnapshot(JSON.parse(JSON.stringify(before)));
    for (const key of Object.keys(before.plots)) {
      assert.deepEqual(loaded.plots[key], before.plots[key], key);
      assert.equal('pace' in loaded.plots[key], false, key);
      assert.equal('wetPace' in loaded.plots[key], false, key);
      assert.equal(plotOnPace(loaded.plots[key]), false, key);
    }
  });

  it('an old crop finishes on its old schedule, an old watering lasts its 12 hours, and nothing is lost', () => {
    const garden = normalizeGardenSnapshot(oldSave(T0));
    const [potato, spinach, crop, empty] = ['1-1', '2-1', '3-1', '4-1'].map((k) => garden.plots[k]);
    assert.deepEqual(tickGarden(garden, T0), []);
    assert.deepEqual([potato.state, potato.wet, spinach.state, spinach.growthMs, crop.state, empty.wet], ['seeds', true, 'shoots', 1000, 'crop', true]);
    assert.equal(plotStageMs(potato, 'seeds'), 48_000);
    assert.equal(plotWaterMs(potato), 43_200_000);
    assert.equal(plotStatusLabel(potato, T0), 'Potato seeds · wet · ready in 2 min');
    // 33 s on its seeds stage ends (15 s were done), 44 s later it is a crop: 77 s, not 69 minutes.
    tickGarden(garden, T0 + 32_999);
    assert.equal(potato.state, 'seeds');
    tickGarden(garden, T0 + 33_000);
    assert.equal(potato.state, 'shoots');
    tickGarden(garden, T0 + 77_000);
    assert.deepEqual([potato.state, potato.wet], ['crop', true]);
    // The dry old spinach, watered now, needs the 3 s it had left; its water is today's 72 minutes.
    waterPlot(garden, '2-1', pc(), { now: T0 + 80_000, requireTool: false });
    assert.equal(spinach.wetPace, GARDEN_SPEEDUP);
    assert.equal('pace' in spinach, false);
    tickGarden(garden, T0 + 82_999);
    assert.equal(spinach.state, 'shoots');
    tickGarden(garden, T0 + 83_000);
    assert.equal(spinach.state, 'crop');
    // The empty plot watered 11 hours ago is still wet for its last hour, then dries.
    tickGarden(garden, T0 + 3_599_999);
    assert.equal(empty.wet, true);
    tickGarden(garden, T0 + 3_600_000);
    assert.equal(empty.wet, false);
  });

  it('whatever is planted next is on the new clock, also in a plot still wet from before', () => {
    const garden = normalizeGardenSnapshot(oldSave(T0));
    const inv = seedsInv();
    // Spinach in the plot watered 11 hours ago: new speed, under the old water's last hour.
    assert.equal(plantPlot(garden, '4-1', inv, pc(), 'seed_spinach', { now: T0 }).ok, true);
    const fresh = garden.plots['4-1'];
    assert.equal(fresh.pace, GARDEN_SPEEDUP);
    assert.equal(plotWaterMs(fresh), 43_200_000);
    tickGarden(garden, T0 + 92_000);
    assert.equal(fresh.state, 'seeds', 'a new seed does not ride the old clock');
    tickGarden(garden, T0 + 4.5 * MIN);
    assert.deepEqual([fresh.state, fresh.wet], ['crop', true]);
    // The old potato, picked and hoed: the next potato in that plot takes its 69 minutes.
    tickGarden(garden, T0 + 5 * MIN);
    const p = pc();
    assert.equal(harvestPlot(garden, '1-1', inv, p, { now: T0 + 5 * MIN, rng: () => 0.5 }).ok, true);
    assert.equal(clearPlot(garden, '1-1', p, { now: T0 + 5 * MIN, requireTool: false }).ok, true);
    assert.equal(plantPlot(garden, '1-1', inv, p, 'seed_potato', { now: T0 + 5 * MIN }).ok, true);
    assert.equal(plotStageMs(garden.plots['1-1']), 36 * MIN);
    assert.equal(plotRipeInMs(garden.plots['1-1'], T0 + 5 * MIN), 69 * MIN);
  });

  it('the marks survive a save and a load, a home\'s stored gardens and the server\'s word', () => {
    const garden = createGarden({ cols: 1, rows: 1, now: T0 });
    waterPlot(garden, '1-1', pc(), { now: T0, requireTool: false });
    plantPlot(garden, '1-1', seedsInv(), pc(), 'seed_potato', { now: T0 });
    const loaded = normalizeGardenSnapshot(JSON.parse(JSON.stringify(garden)));
    assert.deepEqual([loaded.plots['1-1'].pace, loaded.plots['1-1'].wetPace], [GARDEN_SPEEDUP, GARDEN_SPEEDUP]);
    // A dry plot carries no water mark.
    tickGarden(garden, T0 + 73 * MIN);
    assert.equal('wetPace' in normalizeGardenSnapshot(JSON.parse(JSON.stringify(garden))).plots['1-1'], false);
    // A home's gardens are a feature slice, kept as written (js/feature-host.js).
    const slice = normalizeFeatureSlices({ homes: { cult: { gardens: { g1: garden } } } });
    assert.equal(slice.homes.cult.gardens.g1.plots['1-1'].pace, GARDEN_SPEEDUP);
    // The realtime server's plot (gardens.go view): its pace and wetPace, or neither from before.
    const now = Date.now();
    const server = { state: 'seeds', seed: 'seed_potato', wet: true, wetAt: now, stageAt: now, mod: 1 };
    assert.equal(plotStageMs(localPlot(server, 0, now)), 48_000);
    assert.equal(plotStageMs(localPlot({ ...server, pace: 10, wetPace: 10 }, 0, now)), 36 * MIN);
    assert.equal(plotWaterMs(localPlot({ ...server, pace: 10, wetPace: 10 }, 0, now)), 72 * MIN);
    // A server from before the change sends no marks: the page's own planted plot drops them, and both agree.
    const mine = localPlot({ ...server, pace: 10, wetPace: 10 }, 0, now);
    applyPlot(mine, server, 0, now);
    assert.equal('pace' in mine, false);
    assert.equal(plotStageMs(mine), 48_000);
  });

  const hasPhp = spawnSync('php', ['-v']).status === 0;
  it('a home\'s stored plots on the site: old ones finish on the old clock, a visitor\'s act is on the new (src/HomeTending.php)', { skip: !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false }, () => {
    const code = `require ${JSON.stringify(SITE_DIR)} . '/src/HomeTending.php'; use Groddle\\Minn\\HomeTending as H; $seeds = H::seeds();
      $in = json_decode($argv[1]); $t0 = (int) $in->t0; $out = ['pace' => $seeds['pace'], 'waterMs' => $seeds['waterMs'], 'legacyWaterMs' => $seeds['legacyWaterMs']];
      $p = $in->plots;
      // The old potato: 33 s to shoots, 77 s to a crop.
      $a = clone $p->{'1-1'}; H::tickPlot($a, $t0 + 32999, $seeds); $out['potato33'] = $a->state;
      H::tickPlot($a, $t0 + 33000, $seeds); $out['potato33b'] = $a->state;
      H::tickPlot($a, $t0 + 77000, $seeds); $out['potato77'] = [$a->state, $a->wet];
      // The old dry spinach: a visitor waters it (the new water), 3 s later it is a crop.
      $b = clone $p->{'2-1'}; H::applyAct($b, 'water', '', $t0, $seeds); $out['spinachWetPace'] = $b->wetPace ?? null; $out['spinachPace'] = $b->pace ?? null;
      H::tickPlot($b, $t0 + 3000, $seeds); $out['spinach3'] = $b->state;
      // The empty plot watered 11 hours ago: still wet; a visitor plants spinach, on the new clock.
      $c = clone $p->{'4-1'}; H::tickPlot($c, $t0, $seeds); $out['emptyWet'] = $c->wet;
      H::applyAct($c, 'plant', 'seed_spinach', $t0, $seeds); $out['newPace'] = $c->pace;
      H::tickPlot($c, $t0 + 92000, $seeds); $out['new92'] = $c->state;
      H::tickPlot($c, $t0 + 270000, $seeds); $out['new270'] = [$c->state, $c->wet];
      $out['stage'] = [H::stageMs($p->{'1-1'}, 'seeds', $seeds), H::stageMs($c, 'seeds', $seeds), H::waterMs($p->{'1-1'}, $seeds), H::waterMs($b, $seeds)];
      // Guano on new shoots 3 minutes in: a tenth of the 30 left (potato).
      $d = (object) ['state' => 'shoots', 'seed' => 'seed_potato', 'wet' => true, 'wetAt' => $t0, 'wetPace' => 10, 'pace' => 10, 'stageStartedAt' => $t0, 'growthMs' => 0, 'growModifier' => 1];
      $out['guanoOk'] = H::refuse($d, ['act' => 'guano', 'seed' => ''], 'default', $t0 + 180000, $seeds);
      H::applyAct($d, 'guano', '', $t0 + 180000, $seeds); H::tickPlot($d, $t0 + 360000 - 1, $seeds); $out['guano6'] = $d->state;
      H::tickPlot($d, $t0 + 360000, $seeds); $out['guano6b'] = $d->state;
      echo json_encode($out);`;
    const plots = oldSave(T0).plots;
    const out = JSON.parse(execFileSync('php', ['-r', code, '--', JSON.stringify({ t0: T0, plots })], { encoding: 'utf8' }));
    assert.deepEqual(out, {
      pace: 10,
      waterMs: GARDEN_WATER_MS,
      legacyWaterMs: LEGACY_GARDEN.waterMs,
      potato33: 'seeds',
      potato33b: 'shoots',
      potato77: ['crop', true],
      spinachWetPace: 10,
      spinachPace: null,
      spinach3: 'crop',
      emptyWet: true,
      newPace: 10,
      new92: 'seeds',
      new270: ['crop', true],
      stage: [48_000, 180_000, 43_200_000, GARDEN_WATER_MS],
      guanoOk: null,
      guano6: 'shoots',
      guano6b: 'crop',
    });
  });
});
