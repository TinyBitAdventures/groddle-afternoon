/**
 * The rule numbers the site checks a visitor's verbs on another player's home
 * street against (registers G328 and G201: groddle-afternoon-site
 * data/yard-verbs.json, read by src/HomeYard.php). In the original anyone on
 * a home's public street could pet and nibble its Piggies, massage and milk
 * its Butterflies, squeeze its Chickens, dig and tend its Patches and pet,
 * water and harvest its trees, and each of those acts by someone who was not
 * the owner added to the owner's Magic Rock pool
 * (locations/inc_cultivation.js cultivation_add_img_rewards 168-178). The
 * amounts and limits come from the game's own modules, so the site and the
 * game never disagree:
 *
 * - pool: the fixed amount each act's handler passes (npc_piggy.js 1664,
 *   1764; npc_butterfly.js 1187, 1356; npc_chicken.js 1560; patch.js 615,
 *   714; include/trants.js 90, 196, 420; wood_tree.js 1018).
 * - ak: Animal Kinship per rank 0..7 (js/animal-kinship.js, from
 *   catalog_skill_packages.js): l the per-player daily limit (interval_limit,
 *   checkSkillPackageOverLimit), b the items a use gives (bonus_amount).
 * - arbor: the Arborology (gardening_harvest) row by skill: l harvests per
 *   tree per player a game day, b the fruit a harvest takes (js/trants.js).
 * - dig: dig_patch's earth (bonus_amount) by Soil Appreciation rank
 *   (js/patches.js SOIL_SKILL_PACKAGES).
 * - soil: how long a tended Patch stays clean and a dug one stays dug
 *   (patch.js setClean / setDug, js/patches.js SOIL_TIMERS).
 * - fruit: each tree's fruit class (items/trant_*.js fruit_class).
 *
 *   node tools/build-yard-verbs.mjs           writes the site repo's data/yard-verbs.json
 *   node tools/build-yard-verbs.mjs --check   exits 1 when it is stale
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireSite, sitePath } from './repos.mjs';

export const OUT = sitePath('data', 'yard-verbs.json');

export async function yardVerbsJson() {
  const { YARD_POOL, YARD_AK_ITEMS } = await import('../public/js/yard-verbs-mp.js?v=40912008');
  const { ANIMAL_KINSHIP_PACKAGES } = await import('../public/js/animal-kinship.js?v=23f74bb3');
  const { ARBOROLOGY_HARVEST, TRANT_META } = await import('../public/js/trants.js?v=9c2e8c0f');
  const { SOIL_SKILL_PACKAGES, SOIL_TIMERS } = await import('../public/js/patches.js?v=3996c344');
  const ak = Object.keys(ANIMAL_KINSHIP_PACKAGES).sort().map((key) => `${JSON.stringify(key)}:[${ANIMAL_KINSHIP_PACKAGES[key].map((r) => `{"l":${r.intervalLimit},"b":${r.bonusAmount}}`).join(',')}]`);
  const arbor = Object.values(ARBOROLOGY_HARVEST).map((r) => `{"skill":${JSON.stringify(r.skillId)},"l":${r.intervalLimit},"b":${r.bonusAmount}}`);
  const dig = Object.entries(SOIL_SKILL_PACKAGES.dig_patch).map(([id, r]) => `{"skill":${JSON.stringify(id === 'no_skill' ? null : id)},"b":${r.bonus_amount}}`);
  const fruit = Object.keys(TRANT_META).sort().map((id) => `${JSON.stringify(id)}:${JSON.stringify(TRANT_META[id].fruitClass)}`);
  const pool = Object.keys(YARD_POOL).sort().map((key) => `${JSON.stringify(key)}:${YARD_POOL[key]}`);
  const items = Object.keys(YARD_AK_ITEMS).sort().map((key) => `${JSON.stringify(key)}:${JSON.stringify(YARD_AK_ITEMS[key])}`);
  const doc = 'Written by groddle-afternoon game tools/build-yard-verbs.mjs from js/yard-verbs-mp.js, js/animal-kinship.js, js/trants.js and js/patches.js: pool the Magic Rock iMG a visitor act adds, ak the Animal Kinship daily limit l and items b per rank 0..7, akItems what those items are, arbor and dig the harvest and dig rows by skill, soil the Patch timers in ms, fruit each tree\'s fruit.';
  return `{"_doc":${JSON.stringify(doc)},\n"pool":{${pool.join(',')}},\n"ak":{\n${ak.join(',\n')}},\n"akItems":{${items.join(',')}},\n"arbor":[${arbor.join(',')}],\n"dig":[${dig.join(',')}],\n"soil":{"cleanRegrowMs":${SOIL_TIMERS.cleanRegrowMs},"dugFillMs":${SOIL_TIMERS.dugFillMs}},\n"fruit":{${fruit.join(',')}}}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  requireSite();
  const text = await yardVerbsJson();
  if (process.argv.includes('--check')) {
    let have = '';
    try { have = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
    if (have !== text) {
      console.error(`${OUT} is stale: run node tools/build-yard-verbs.mjs`);
      process.exit(1);
    }
    process.exit(0);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`yard verbs -> ${OUT}`);
}
