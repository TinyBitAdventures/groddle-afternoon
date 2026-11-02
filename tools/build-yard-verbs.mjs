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
 * - rocks, nodes, cult, life (MPVISIT, js/yard-stock-mp.js): each rock's
 *   chunks and roll (js/mining.js ROCK_CATALOG) and its reform time; each
 *   node's stock, regrow steps, a visitor's verb, the yield the site credits
 *   and its daily limit (js/resource-nodes.js RESOURCE_NODE_CATALOG); which
 *   cultivations are rocks and nodes, their max wear and the nodes each
 *   carries (js/homes-catalog.js CULTIVATION_CLASSES); the lifespan step a
 *   restore adds (js/home-cultivation.js). The pool gains the rock-clear and
 *   node amounts (include/mining.js 388-401, peat_1.js:301, dirt_pile.js:470,
 *   mortar_barnacle.js:304, jellisac.js:234).
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
  const { YARD_POOL, YARD_AK_ITEMS } = await import('../public/js/yard-verbs-mp.js?v=2264ed76');
  const { ANIMAL_KINSHIP_PACKAGES } = await import('../public/js/animal-kinship.js?v=3a50bfb2');
  const { ARBOROLOGY_HARVEST, TRANT_META } = await import('../public/js/trants.js?v=9c2e8c0f');
  const { SEASONED_BEANS, SEEDLING_GROW_UPGRADES, SOIL_SKILL_PACKAGES, SOIL_TIMERS } = await import('../public/js/patches.js?v=1bf0dd8e');
  const { WOOD_TREE_HARVEST } = await import('../public/js/woodcutting.js?v=38730935');
  const { ENCHANTED_WOOD_TREE } = await import('../public/js/enchanted-forests.js?v=d986bff5');
  const beans = Object.keys(SEASONED_BEANS).sort().map((id) => `${JSON.stringify(id)}:${JSON.stringify(SEASONED_BEANS[id].trantClass)}`);
  const grow = Object.keys(SEEDLING_GROW_UPGRADES).map((id) => `${JSON.stringify(id)}:{"minMs":${SEEDLING_GROW_UPGRADES[id].minMinutes * 60000},"level":${SEEDLING_GROW_UPGRADES[id].growLevel}}`);
  const ak = Object.keys(ANIMAL_KINSHIP_PACKAGES).sort().map((key) => `${JSON.stringify(key)}:[${ANIMAL_KINSHIP_PACKAGES[key].map((r) => `{"l":${r.intervalLimit},"b":${r.bonusAmount}}`).join(',')}]`);
  const arbor = Object.values(ARBOROLOGY_HARVEST).map((r) => `{"skill":${JSON.stringify(r.skillId)},"l":${r.intervalLimit},"b":${r.bonusAmount}}`);
  const dig = Object.entries(SOIL_SKILL_PACKAGES.dig_patch).map(([id, r]) => `{"skill":${JSON.stringify(id === 'no_skill' ? null : id)},"b":${r.bonus_amount}}`);
  const fruit = Object.keys(TRANT_META).sort().map((id) => `${JSON.stringify(id)}:${JSON.stringify(TRANT_META[id].fruitClass)}`);
  const { STOCK_POOL, STOCK_NODE_CLASSES, STOCK_NODE_VERBS, STOCK_NODE_YIELD, ROCK_RESPAWN_MS } = await import('../public/js/yard-stock-mp.js?v=bbf9355b');
  const { ROCK_CATALOG } = await import('../public/js/mining.js?v=4806e3e8');
  const { RESOURCE_NODE_CATALOG } = await import('../public/js/resource-nodes.js?v=4f48fd75');
  const { CULTIVATION_CLASSES } = await import('../public/js/homes-catalog.js?v=7aa9beb0');
  const { LIFESPAN_STEP, MAX_LIFE_STEPS } = await import('../public/js/home-cultivation.js?v=e04c3e7b');
  const allPool = { ...YARD_POOL, ...STOCK_POOL };
  const pool = Object.keys(allPool).sort().map((key) => `${JSON.stringify(key)}:${allPool[key]}`);
  const rocks = Object.keys(ROCK_CATALOG).sort().map((id) => {
    const d = ROCK_CATALOG[id];
    return `${JSON.stringify(id)}:{"type":${JSON.stringify(d.rockType)},"chunk":${JSON.stringify(d.chunkId)},"min":${d.minChunks},"max":${d.maxChunks},"chunks":${d.chunksMax}}`;
  });
  const nodes = [...STOCK_NODE_CLASSES].sort().map((id) => {
    const d = RESOURCE_NODE_CATALOG[id];
    const st = d.stock;
    const lim = d.dailyLimit && d.dailyLimit.verb === STOCK_NODE_VERBS[id] ? `{"base":${d.dailyLimit.base},"upgrades":${JSON.stringify(d.dailyLimit.upgrades)}}` : 'null';
    // A Firefly comes back respawnMs after it is caught (the 'respawn' stock): one step of that.
    const regrow = d.regrow ? [d.regrow.minMs, d.regrow.maxMs, d.regrow.stepMs || 1000] : [d.respawnMs, d.respawnMs, 1000];
    return `${JSON.stringify(id)}:{"verb":${JSON.stringify(STOCK_NODE_VERBS[id])},"min":${st.min},"max":${st.max},"initial":${st.initial},"ready":${st.harvestableAt},"after":${st.afterHarvest ?? 'null'},"consume":${st.consume ?? 1},"regrow":[${regrow.join(',')}],"yield":${JSON.stringify(STOCK_NODE_YIELD[id])},"daily":${lim}}`;
  });
  const { FIREFLY_HIVE } = await import('../public/js/home-cultivation.js?v=e04c3e7b');
  const { FIREFLY_JAR_FULL } = await import('../public/js/yard-stock-mp.js?v=bbf9355b');
  const cult = Object.keys(CULTIVATION_CLASSES).sort().filter((id) => ['rock', 'node', 'hive'].includes(CULTIVATION_CLASSES[id].kind)).map((id) => {
    const d = CULTIVATION_CLASSES[id];
    const ns = (d.nodes || []).map((n) => [String(n.classTsid).startsWith('peat_') ? 'peat_1' : n.classTsid, n.dx, n.dy]);
    // HOMES2: a hive's Fireflies (home-cultivation hiveFireflySpots): one each intervalMs since it was placed, up to max, radius apart.
    const hive = d.kind === 'hive' ? `,"hive":[${FIREFLY_HIVE.intervalMs},${FIREFLY_HIVE.maxCount},${FIREFLY_HIVE.radius}]` : '';
    return `${JSON.stringify(id)}:{"kind":${JSON.stringify(d.kind)},"maxWear":${d.maxWear},"nodes":${JSON.stringify(ns)}${hive}}`;
  });
  const items = Object.keys(YARD_AK_ITEMS).sort().map((key) => `${JSON.stringify(key)}:${JSON.stringify(YARD_AK_ITEMS[key])}`);
  const doc = 'Written by groddle-afternoon game tools/build-yard-verbs.mjs from js/yard-verbs-mp.js, js/animal-kinship.js, js/trants.js and js/patches.js: pool the Magic Rock iMG a visitor act adds, ak the Animal Kinship daily limit l and items b per rank 0..7, akItems what those items are, arbor and dig the harvest and dig rows by skill, soil the Patch timers in ms, fruit each tree\'s fruit; rocks, nodes and cult the home street\'s rocks and resource nodes (js/yard-stock-mp.js, js/mining.js, js/resource-nodes.js, js/homes-catalog.js), life the lifespan step a restore adds; wood the Planks a Wood Tree gives by maturity 1..6 (enchanted ones apart), seedling the pets a Seedling takes, its timers and the planter\'s grow cards (the better first), beans each Seasoned Bean\'s tree, jarFull the Fireflies a visitor catches at a home in a game day that count as a full jar (HOMES2).';
  return `{"_doc":${JSON.stringify(doc)},\n"pool":{${pool.join(',')}},\n"ak":{\n${ak.join(',\n')}},\n"akItems":{${items.join(',')}},\n"arbor":[${arbor.join(',')}],\n"dig":[${dig.join(',')}],\n"soil":{"cleanRegrowMs":${SOIL_TIMERS.cleanRegrowMs},"dugFillMs":${SOIL_TIMERS.dugFillMs}},\n"fruit":{${fruit.join(',')}},\n"rocks":{${rocks.join(',')}},"respawnMs":${ROCK_RESPAWN_MS},\n"nodes":{\n${nodes.join(',\n')}},\n"cult":{${cult.join(',')}},\n"life":{"step":${LIFESPAN_STEP},"max":${MAX_LIFE_STEPS}},\n"wood":{"planks":${JSON.stringify(WOOD_TREE_HARVEST.plankYieldByMaturity)},"enchanted":${JSON.stringify(ENCHANTED_WOOD_TREE.plankYieldByMaturity)}},\n"seedling":{"pets":${SOIL_TIMERS.seedlingPets},"minMs":${SOIL_TIMERS.seedlingMinMs},"maxMs":${SOIL_TIMERS.seedlingMaxMs},"grow":{${grow.join(',')}}},\n"beans":{${beans.join(',')}},"jarFull":${FIREFLY_JAR_FULL}}\n`;
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
