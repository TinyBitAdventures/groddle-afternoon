/**
 * The garden seeds the site checks a key-holder's tending against (register
 * G328 slice 2: groddle-afternoon-site data/garden-seeds.json, read by
 * src/HomeTending.php): for every seed of js/garden.js SEED_CATALOG its
 * garden type and the two stage times the game grows it in (grow1Ms seeds to
 * shoots, grow2Ms shoots to a crop; seedDef: the source's time_grow1 /
 * time_grow2 hours from seed_*.js / herb_seed_*.js classProps at
 * GARDEN_SPEEDUP times Glitch's speed, "pace"), and the watering
 * (include/garden.js timings.water's 12 hours at the same speed,
 * GARDEN_WATER_MS), so the site ticks an owner's stored plots as the game
 * does. l1/l2 and legacyWaterMs are the clock from before the speed changed
 * (js/garden.js LEGACY_GARDEN): a stored plot with no pace finishes on it
 * (tickGarden), before the site lets a visitor water, plant, clear or harvest.
 * Each seed also names its crop and produces_count (c, n), and "shared" lists
 * js/shared-gardens.js SHARED_GARDEN_STREETS, for the one-time payout of a
 * player's own plots on the public gardens (register G368, src/GardenSettle.php).
 *
 *   node tools/build-garden-seeds.mjs           writes the site repo's data/garden-seeds.json
 *   node tools/build-garden-seeds.mjs --check   exits 1 when it is stale
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireSite, sitePath } from './repos.mjs';

export const OUT = sitePath('data', 'garden-seeds.json');

export async function gardenSeedsJson() {
  const { SEED_CATALOG, GARDEN_WATER_MS, GARDEN_SPEEDUP, LEGACY_GARDEN, legacyGrowMs } = await import('../public/js/garden.js?v=37209241');
  const { SHARED_GARDEN_STREETS } = await import('../public/js/shared-gardens.js?v=c1f90bc0');
  const seeds = Object.keys(SEED_CATALOG).sort().map((id) => {
    const s = SEED_CATALOG[id];
    return `${JSON.stringify(id)}:{"t":${JSON.stringify(s.gardenType === 'herb' ? 'herb' : 'default')},"g1":${s.grow1Ms},"g2":${s.grow2Ms},"l1":${legacyGrowMs(s.grow1H)},"l2":${legacyGrowMs(s.grow2H)},"c":${JSON.stringify(s.cropId)},"n":${s.produces}}`;
  });
  const doc = 'Written by groddle-afternoon game tools/build-garden-seeds.mjs from js/garden.js SEED_CATALOG: t the garden type, g1/g2 the stage times in ms at pace (how many times faster than Glitch a garden runs), l1/l2 the same on the clock before it, c the crop, n produces_count; waterMs how long a watering lasts at pace, legacyWaterMs before it; shared the public gardens shared online (js/shared-gardens.js).';
  return `{"_doc":${JSON.stringify(doc)},"pace":${GARDEN_SPEEDUP},"waterMs":${GARDEN_WATER_MS},"legacyWaterMs":${LEGACY_GARDEN.waterMs},"shared":${JSON.stringify([...SHARED_GARDEN_STREETS])},"seeds":{\n${seeds.join(',\n')}}}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  requireSite();
  const text = await gardenSeedsJson();
  if (process.argv.includes('--check')) {
    let have = '';
    try { have = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
    if (have !== text) {
      console.error(`${OUT} is stale: run node tools/build-garden-seeds.mjs`);
      process.exit(1);
    }
    process.exit(0);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`garden seeds: ${text.split('\n').length - 2} seeds -> ${OUT}`);
}
