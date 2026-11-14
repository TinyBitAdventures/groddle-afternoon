/**
 * Shared public gardens online (register G368): the street beds the realtime
 * server keeps (groddle-afternoon-server gardens.go), and the rule numbers it
 * grows them by.
 *
 * For each street of js/shared-gardens.js SHARED_GARDEN_STREETS it lays the
 * beds out exactly as game.js enterStreet does (placement('gardens') from the
 * same planner groups tools/build-realtime-objects.mjs uses; spawnGarden:
 * the first point is the crop bed, 4 by 2, the second the herb bed, 3 by 2, both herb beds
 * on the Herb Gardens streets (js/garden.js streetGardenBed: the first keyed herb2; since report #252
 * one bed in each planter box there instead, street-ecology.js streetGardenBoxBeds),
 * each standing at y + 2), so the server knows each bed and can check a
 * player stands near it. The rules come from js/garden.js: each seed's garden
 * type, its two stage times (seedDef: the source's hours at GARDEN_SPEEDUP times
 * Glitch's speed, Austin 2026-11-10: about 10; "pace" is that number), its crop
 * and produces_count, the watering (GARDEN_WATER_MS: the source's 12 hours at
 * the same speed) and Guano's 80% (GARDEN_FERTILIZE_PERC); "legacy" is the clock
 * from before the speed changed (LEGACY_GARDEN, legacyGrowMs), which a plot
 * stored without a pace still finishes on; the planter's 60 seconds from
 * js/shared-gardens.js GARDEN_LOCK_MS; and each Master Gardener potion's bed-wide act and its
 * no-target line from js/master-garden.js GARDEN_POTIONS.
 *
 * Run from the game repo root:
 *   node tools/build-realtime-gardens.mjs
 *   node tools/build-realtime-gardens.mjs --check  (fail when stale, writes nothing)
 * Writes data/gardens.json in the realtime server repo (go:embed in gardens.go).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireServer, serverPath } from './repos.mjs';

import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=18b181ad';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';
import { ecologyForStreet, planStreetPlacements, populationForStreet, setStreetEcologyCatalog, streetGardenBoxBeds, streetReservedSpots } from '../public/js/street-ecology.js?v=acbadab3';
import { GARDEN_FERTILIZE_PERC, GARDEN_SPEEDUP, GARDEN_WATER_MS, LEGACY_GARDEN, SEED_CATALOG, legacyGrowMs, streetGardenBed } from '../public/js/garden.js?v=1420a6d6';
import { GARDEN_LOCK_MS, SHARED_GARDEN_STREETS } from '../public/js/shared-gardens.js?v=c1f90bc0';
import { GARDEN_POTIONS, POTION_USES } from '../public/js/master-garden.js?v=ff6ca66a';
import { placementRequests } from './build-realtime-objects.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');
const outPath = serverPath('data', 'gardens.json');

const r1 = (n) => Math.round(n * 10) / 10;

/** One street's beds: [bed, cols, rows, x, y] as game.js spawnGarden places them. */
export function streetGardenLayout(data) {
  const population = populationForStreet(data.tsid, ecologyForStreet(data.tsid), { starter: data.tsid === STREET_INDEX.default });
  const plan = planStreetPlacements(platformsScreen(data), placementRequests(population), {
    worldW: streetWidth(data),
    seed: data.tsid,
    reserved: streetReservedSpots(data),
  });
  // streetGardenBed: crop then herb, or two herb beds (herb2, herb) on the Herb Gardens streets.
  const planned = (plan.groups.gardens || []).map((p, index) => {
    const bed = streetGardenBed(data.tsid, index);
    return [bed.bed, bed.cols, 2, r1(p.x), r1(p.y + 2)];
  });
  // Report #252: a Herb Gardens street's beds are in its planter boxes (game.js enterStreet, style none).
  const boxed = streetGardenBoxBeds(data, population).map((b) => [b.bed, b.cols, b.rows, r1(b.x), r1(b.y)]);
  return [...planned, ...boxed];
}

export function gardenRules() {
  const seeds = {};
  const legacySeeds = {};
  for (const id of Object.keys(SEED_CATALOG).sort()) {
    const s = SEED_CATALOG[id];
    seeds[id] = [s.gardenType === 'herb' ? 'herb' : 'default', s.grow1Ms, s.grow2Ms, s.cropId, s.produces];
    legacySeeds[id] = [legacyGrowMs(s.grow1H), legacyGrowMs(s.grow2H)];
  }
  // The five Master Gardener potions (js/master-garden.js, items/potion_garden_*.js): the bed-wide
  // act each runs (include/master_garden.js potionTendGarden) and its no-target line.
  const potions = {};
  for (const id of Object.keys(GARDEN_POTIONS).sort()) potions[id] = [GARDEN_POTIONS[id].action, GARDEN_POTIONS[id].noTarget];
  return { pace: GARDEN_SPEEDUP, waterMs: GARDEN_WATER_MS, lockMs: GARDEN_LOCK_MS, fertilize: GARDEN_FERTILIZE_PERC, seeds, legacy: { waterMs: LEGACY_GARDEN.waterMs, seeds: legacySeeds }, potions, potionUses: POTION_USES };
}

async function main() {
  requireServer();
  setZoneStreetsShown(false);
  const index = JSON.parse(await readFile(join(streetsDir, 'index.json'), 'utf8'));
  applyStreetIndex(index);
  setStreetEcologyCatalog(JSON.parse(await readFile(join(root, 'public/assets/content/street-ecology.json'), 'utf8')));
  const streets = {};
  let beds = 0;
  let plots = 0;
  for (const tsid of [...SHARED_GARDEN_STREETS].sort()) {
    const data = await loadStreetDataFromFs(tsid, streetsDir);
    const row = streetGardenLayout(data);
    if (!row.length) throw new Error(`${tsid} has no garden bed`);
    streets[tsid] = row;
    beds += row.length;
    plots += row.reduce((n, b) => n + b[1] * b[2], 0);
  }
  const out = {
    about: 'Shared public gardens for gardens.go in groddle-afternoon-server. Generated by tools/build-realtime-gardens.mjs from js/shared-gardens.js, js/garden.js and the street placement planner; do not edit by hand.',
    format: 'streets[tsid] = [[bed, cols, rows, x, y]]; rules.pace = how many times faster than Glitch a garden runs; rules.seeds[seed] = [bed, grow1Ms, grow2Ms, crop, produces] and rules.waterMs at that pace; rules.legacy = the clock before it (waterMs, seeds[seed] = [grow1Ms, grow2Ms]) for plots stored without a pace; rules.potions[class] = [action, noTarget]',
    rules: gardenRules(),
    streets,
  };
  const text = `${JSON.stringify(out)}\n`;
  if (process.argv.includes('--check')) {
    const now = await readFile(outPath, 'utf8').catch(() => '');
    if (now !== text) {
      console.error(`${outPath} is stale: run node tools/build-realtime-gardens.mjs`);
      process.exit(1);
    }
    console.log(`${outPath} is current (${Object.keys(streets).length} streets)`);
    return;
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, text);
  console.log(`${Object.keys(streets).length} streets, ${beds} beds, ${plots} plots -> ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
