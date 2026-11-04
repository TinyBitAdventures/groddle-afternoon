/**
 * The rule numbers the site runs a machine set down on a home street by
 * (lane MACHINES: groddle-afternoon-site data/home-machines.json, read by
 * src/HomeMachines.php). From the game's own modules, so the site and the
 * game never disagree:
 *
 * - machines: per machine (machine_base) its label, the skill its use needs
 *   (js/machine-rooms.js MACHINE_SKILLS, inc_making.js making_required_skill)
 *   and its recipes from assets/content/recipes.json (catalog_recipes.js):
 *   wait in ms, the tank's fuel a unit burns (the recipe's fuel_cell input,
 *   build-recipes.mjs MACHINE_TOOLS), the task limit, inputs and outputs.
 * - pool, maxFuel, perCell, fresh, extraMs, dayMs, storeDays, spacing, edge,
 *   max, saveFuel, taskCards: js/home-machines.js and js/machines.js (their
 *   sources are named there).
 * - rooms: the house's and a Tower floor's inner walls (js/home-decor.js
 *   interiorBounds, SEGMENT_W, INTERIOR.endCapW, TOWER_ROOM; homes-catalog
 *   HOME_LIMITS wall segments), for a machine set down in a room (HOMES2).
 *
 *   node tools/build-home-machines.mjs           writes the site repo's data/home-machines.json
 *   node tools/build-home-machines.mjs --check   exits 1 when it is stale
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireSite, sitePath } from './repos.mjs';

export const OUT = sitePath('data', 'home-machines.json');

export async function homeMachinesJson() {
  const hm = await import('../public/js/home-machines.js?v=573dd4d3');
  const { MACHINE_SKILLS } = await import('../public/js/machine-rooms.js?v=7abcd5bc');
  const { FRESH_FUEL, MACHINE_IDS } = await import('../public/js/machines.js?v=01be0285');
  const decor = await import('../public/js/home-decor.js?v=6dc41dcc');
  const { HOME_LIMITS } = await import('../public/js/homes-catalog.js?v=7aa9beb0');
  const tower = decor.interiorBounds({ layout: 'tower' });
  const rooms = { segmentW: decor.SEGMENT_W, minSegments: HOME_LIMITS.MIN_WALL_SEGMENTS, startSegments: HOME_LIMITS.START_WALL_SEGMENTS, maxSegments: HOME_LIMITS.MAX_WALL_SEGMENTS, endCap: decor.INTERIOR.endCapW, towerLeft: tower.left, towerRight: tower.right };
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const all = JSON.parse(readFileSync(join(root, 'public/assets/content/recipes.json'), 'utf8'));
  const recipes = all.recipes || all;
  const counts = (rows) => `{${rows.map((r) => `${JSON.stringify(r.classTsid)}:${r.qty}`).join(',')}}`;
  const machines = [...MACHINE_IDS].sort().map((cls) => {
    const rows = Object.keys(recipes).sort().filter((key) => recipes[key].tool === cls).map((key) => {
      const r = recipes[key];
      return `${JSON.stringify(key)}:{"id":${JSON.stringify(String(r.id))},"name":${JSON.stringify(r.name)},"waitMs":${Number(r.waitMs) || 0},"fuel":${Number(r.toolWear) || 0},"limit":${Number(r.taskLimit) || 1},"in":${counts(r.inputs)},"out":${counts(r.outputs)}}`;
    });
    return `${JSON.stringify(cls)}:{"label":${JSON.stringify(hm.machineLabel(cls))},"skill":${JSON.stringify(MACHINE_SKILLS[cls])},"recipes":{\n${rows.join(',\n')}}}`;
  });
  const doc = 'Written by groddle-afternoon game tools/build-home-machines.mjs from js/home-machines.js, js/machines.js, js/machine-rooms.js and assets/content/recipes.json: machines each machine\'s label, the skill its use needs and its recipes (waitMs a unit, fuel the tank a unit burns, limit the task limit, in and out per unit); pool the Magic Rock iMG a finished job by someone not the owner adds (inc_making.js:836); maxFuel, perCell and fresh the tank; extraMs a job\'s added time; dayMs a game day; storeDays how long output waits for anyone but the owner; spacing and edge where one may stand; max machines one place in a home keeps; saveFuel and taskCards the cards that change fuel and the task limit; rooms the house\'s wall segments (width segmentW each, minSegments to maxSegments, startSegments when unset) and side walls endCap inside each end, and a Tower floor\'s inner walls towerLeft to towerRight (js/home-decor.js interiorBounds).';
  return `{"_doc":${JSON.stringify(doc)},\n"pool":${hm.HOME_MACHINE_POOL},"maxFuel":${hm.MAX_FUEL},"perCell":${hm.FUEL_PER_CELL},"fresh":${FRESH_FUEL},"extraMs":${hm.MACHINE_EXTRA_WAIT_MS},"dayMs":${hm.GAME_DAY_MS},"storeDays":${hm.DAYS_TO_STORE_CONTENTS},"spacing":${hm.MACHINE_SPACING},"edge":${hm.MACHINE_EDGE},"max":${hm.HOME_MACHINES_MAX},\n"saveFuel":${JSON.stringify(hm.SAVE_FUEL)},"taskCards":${JSON.stringify(hm.TASK_LIMIT_CARDS)},\n"rooms":${JSON.stringify(rooms)},\n"machines":{\n${machines.join(',\n')}}}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  requireSite();
  const text = await homeMachinesJson();
  if (process.argv.includes('--check')) {
    let have = '';
    try { have = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
    if (have !== text) {
      console.error(`${OUT} is stale: run node tools/build-home-machines.mjs`);
      process.exit(1);
    }
    process.exit(0);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`home machines -> ${OUT}`);
}
