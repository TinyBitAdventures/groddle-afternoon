/**
 * Multiplayer phase 4: the shared street objects the realtime server owns
 * (the realtime server's objects.go): mineable rocks, the "N uses, then regrows" resource
 * nodes (Mortar Barnacles, Ice Nubbins, Jellisacs, Dirt Piles, Peat Bogs,
 * Paper Trees) and the living trees (trants).
 *
 * For every street in public/assets/streets/index.json it lays the objects
 * out exactly as game.js enterStreet does (the street's source population,
 * then planStreetPlacements over the street's own platforms with the same
 * group order and the same keep-clear spots, street-ecology.js
 * streetReservedSpots: signposts, doors, ladder feet), so the server knows each object's
 * class and place and can check a player stands near it. It also copies the
 * rule numbers the server applies from the game's own modules, so the two
 * never drift:
 *   - js/mining.js ROCK_CATALOG (rock type, chunks per swing, 50 chunks) and
 *     js/imagination-effects.js MEGA_ROCK_CHANCE / MEGA_ROCK_CHUNKS
 *     (items/include/mining.js 143-170, 293-305);
 *   - js/resource-nodes.js RESOURCE_NODE_CATALOG stock / regrow / tend rows
 *     (mortar_barnacle.js 199-207, ice_knob.js 198-205, jellisac.js 126-131,
 *     dirt_pile.js 176 + 467, peat_1.js 224-229, paper_tree.js);
 *   - js/trants.js ARBOROLOGY_HARVEST bonus amounts (catalog_skill_packages.js
 *     gardening_harvest) and assets/content/trants.json fruitCapMap
 *     (include/trants.js 1026-1041 updateFruitCap) and fruitProdMap (rules.prod:
 *     onFruitCycle 1043-1054, the fruit a tended tree's health rise brings back);
 *   - js/trant-care.js TRANT_CARE_PACKAGES living_pet / living_water success
 *     rates (catalog_skill_packages.js light_green_thumb_pet / _water);
 *   - js/resource-nodes.js RESOURCE_SKILL_PACKAGES dig_dirt_pile drop_chance and
 *     bonus_amount by skill (Dirt Pile help crews, dirt_pile.js onDigComplete);
 *   - js/animal-kinship.js ANIMAL_KINSHIP_PACKAGES npc_piggy pet / nibble success
 *     rates by Animal Kinship rank (catalog_skill_packages.js ak_piggy_pet / _nibble).
 * Street Piggies (pigs: game.js spawnPiggies, index i) are laid out too, and a
 * street where a Piggy is sad (js/animal-mood.js locationIsDepressing) says so.
 * So are its Chickens (game.js spawnChickens, index i), Butterflies (game.js
 * spawnButterflies: the resting ones 0..n-1, then the flying ones n..; a
 * flyer's row ends in 1) and Batterflies (animal-husbandry-feature
 * spawnStreet, `batterfly:<i>`, whose planner group comes after the feature
 * groups listed in creatureRequests), for the server's street animals
 * (the server's objects_creatures.go), with the rule numbers it applies:
 *   - js/animal-kinship.js ANIMAL_KINSHIP_PACKAGES interval_limit, success
 *     rate and bonus_amount by rank for the Chicken's squeeze, the Butterfly's
 *     massage and milk and the Piggy's nibble (catalog_skill_packages.js
 *     ak_chicken_squeeze 222-334, ak_butterfly_massage 2-113, ak_butterfly_milk
 *     114-221, ak_piggy_nibble);
 *   - js/animal-husbandry.js INCUBATION (npc_chicken.js incubate 547-675:
 *     the eggs and what hatches from each, 60 s). Each food's base cost (a
 *     Batterfly's food counter, npc_batterfly.js feed 789-824) is
 *     data/trade.json's "cost" (tools/build-realtime-trade.mjs).
 *
 * What differs from a solo layout, on purpose (as tools/build-realtime-quoins.mjs):
 * no saved-arrival reservation (that one is per player; in multiplayer game.js
 * leaves it out so everyone's street matches) and no feature ecology overrides
 * (those streets are private instances, never shared).
 *
 * Run from the game repo root:
 *   node tools/build-realtime-objects.mjs
 * Writes data/objects.json in the realtime server repo (go:embed in its objects.go;
 * found by tools/repos.mjs: GRODDLE_SERVER_DIR, else ../groddle-afternoon-server).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireServer, serverPath } from './repos.mjs';

import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=390e4702';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=23b926e5';
import {
  ecologyForStreet,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=8574d30d';
import { ROCK_CATALOG } from '../public/js/mining.js?v=fb4c7898';
import { MEGA_ROCK_CHANCE, MEGA_ROCK_CHUNKS } from '../public/js/imagination-effects.js?v=70169933';
import { RESOURCE_NODE_CATALOG, RESOURCE_SKILL_PACKAGES } from '../public/js/resource-nodes.js?v=3b824ce9';
import { ARBOROLOGY_HARVEST, TRANT_META } from '../public/js/trants.js?v=9c2e8c0f';
import { TRANT_CARE_PACKAGES } from '../public/js/trant-care.js?v=1eff5718';
import { ANIMAL_KINSHIP_PACKAGES } from '../public/js/animal-kinship.js?v=91490913';
import { locationIsDepressing } from '../public/js/animal-mood.js?v=a49495fc';
import { resourcePlacementGroups, resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=fc882105';
import { soilCountsForStreet, soilPlacementGroups } from '../public/js/features/patches-feature.js?v=d1241e26';
import { kittyPlacementGroups } from '../public/js/features/heli-kitties-feature.js?v=a56dce4d';
import { BATTERFLY_GROUP, batterflyPlacementGroups } from '../public/js/features/animal-husbandry-feature.js?v=0ce88605';
import { hasRaceDispenser } from '../public/js/races.js?v=df0576ad';
import { setWildlifeCatalog, wildlifeFor } from '../public/js/wildlife.js?v=670c3a7f';
import { boardSpotRow, furnitureFor, furniturePlacementGroups } from '../public/js/street-furniture.js?v=37094759';
import { INCUBATION } from '../public/js/animal-husbandry.js?v=808076d1';
import { SHARED_NODE_CLASSES, freshTreePlan } from '../public/js/street-objects.js?v=5d00c847';
import { isZoneTsid } from '../public/js/zone-streets.js?v=b40010d5';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');
const outPath = serverPath('data', 'objects.json');

/**
 * game.js enterStreet's planner groups in its order: the core groups, then
 * features.collect('placementGroups'), where resource-nodes-feature is the
 * first feature that adds any (js/features/index.js: quest-flags and hell
 * come before it and add none). tests/street-objects.test.js checks this
 * list against game.js.
 */
export function placementRequests(population) {
  return [
    { key: 'player', count: 1, clearance: 190 },
    { key: 'trees', count: population.treeClasses.length, clearance: 135 },
    { key: 'gardens', count: population.gardens, clearance: 165 },
    { key: 'vendor', count: population.vendor ? 1 : 0, clearance: 120 },
    { key: 'shrine', count: population.shrine ? 1 : 0, clearance: 135 },
    { key: 'rocks', count: population.rockClasses.length, clearance: 74 },
    { key: 'piggies', count: population.piggies, clearance: 92 },
    { key: 'chickens', count: population.chickens, clearance: 86 },
    { key: 'butterflies', count: population.butterflies, clearance: 62 },
    { key: 'flyingButterflies', count: population.flyingButterflies, clearance: 58 },
    { key: 'apples', count: population.apples, clearance: 30 },
    { key: 'musicblocks', count: population.musicblocks, clearance: 45 },
    { key: 'quoins', count: population.quoins, clearance: 28 },
    ...resourcePlacementGroups(population),
  ];
}

/**
 * The feature groups game.js asks the planner for after the core groups, up to
 * and including the Batterflies' (js/features/index.js order: resource-nodes,
 * races' Race Dispenser, patches' soil, heli-kitties, street-furniture, then
 * street-jobs and animal-husbandry). street-jobs' board and flora come from
 * each player's own projects, so they are left out: a Batterfly's place is
 * the server's (the snapshot's "spots"), the same for everyone, and on most
 * streets the same as in solo. tests/street-creatures.test.js checks this
 * list against FEATURES.
 */
export function creatureRequests(population, street, ecology) {
  const groups = [...placementRequests(population)];
  if (hasRaceDispenser(street.tsid)) groups.push({ key: 'raceDispenser', count: 1, clearance: 70 });
  groups.push(...soilPlacementGroups(soilCountsForStreet(street.tsid)));
  groups.push(...kittyPlacementGroups(wildlifeFor(ecology, street.tsid)));
  groups.push(...furniturePlacementGroups(boardSpotRow(furnitureFor(ecology, street.tsid), street)));
  groups.push(...batterflyPlacementGroups(street));
  return groups;
}

let ecologyCatalog = null;
/** The street-ecology catalog the heli-kitties feature reads its Heli Kitty counts from. */
export function setCreatureEcology(json) {
  ecologyCatalog = json;
  setWildlifeCatalog(json);
}

const r1 = (n) => Math.round(n * 10) / 10;

/** game.js enterStreet: GROUND_Y is the 75th-percentile platform midpoint. */
function groundY(platforms) {
  const ys = platforms.map((p) => (p.y1 + p.y2) / 2).sort((a, b) => a - b);
  return ys[Math.floor(ys.length * 0.75)] || platforms[0]?.y1 || 800;
}

/**
 * One street's shared objects, in the client's own ids:
 *   rocks [i, class, x, y]                 game.js spawnMineRocks / spawnMineRock (index i in rockClasses)
 *   trees [i, class, x, y, maturity, health] game.js spawnTrees (the trants, and the Wood Tree at
 *                                          maturity 6, health 0: ensureWoodTreeState's fresh tree)
 *   nodes [key, class, x, y]               resource-nodes-feature resourceSpawnPlan (`<class>:<n>`)
 *   pigs  [i, x, y]                        game.js spawnPiggies (index i in placement('piggies'); y + 2)
 *   sad   true                             locationIsDepressing for the street (its Piggies are sad)
 *   chickens    [i, x, y]                  game.js spawnChickens (index i in placement('chickens'); y + 2)
 *   butterflies [i, x, y, fly]             game.js spawnButterflies: resting i < n (fly 0), then the
 *                                          flyers at n + j (fly 1, the planner point's y)
 *   batterflies [i, x, y]                  animal-husbandry-feature spawnStreet (batterfly:<i>)
 */
export function streetObjectLayout(data, { starter = false, ecology = ecologyForStreet(data.tsid) } = {}) {
  const population = populationForStreet(data.tsid, ecology, { starter });
  const platforms = platformsScreen(data);
  const reserved = streetReservedSpots(data);
  const plan = planStreetPlacements(platforms, placementRequests(population), {
    worldW: streetWidth(data),
    seed: data.tsid,
    reserved,
  });
  const placement = (key) => plan.groups[key] || [];
  const ground = groundY(platforms);

  const rocks = [];
  const rockPts = placement('rocks');
  population.rockClasses.forEach((classTsid, i) => {
    if (!ROCK_CATALOG[classTsid]) return;
    const p = rockPts[i] || { x: 200 + i * 160, y: ground };
    rocks.push([i, classTsid, r1(p.x || 200), r1(p.y || ground)]);
  });

  const trees = [];
  placement('trees').forEach((p, i) => {
    const classTsid = population.treeClasses[i];
    if (classTsid === 'wood_tree') {
      trees.push([i, classTsid, r1(p.x), r1((p.y ?? ground) + 2), 6, 0]);
      return;
    }
    if (!TRANT_META[classTsid]) return;
    const fresh = freshTreePlan(i);
    trees.push([i, classTsid, r1(p.x), r1((p.y ?? ground) + 2), fresh.maturity, fresh.health]);
  });

  const nodes = resourceSpawnPlan(population, placement)
    .filter((row) => SHARED_NODE_CLASSES.includes(row.classTsid))
    .map((row) => [row.key, row.classTsid, r1(row.x), r1(row.y + 2)]);

  const pigs = placement('piggies').map((p, i) => [i, r1(p.x), r1((p.y ?? ground) + 2)]);
  const meta = STREET_INDEX.streets?.[data.tsid] || {};
  // features/animal-mood-feature.js describeAnimalPlace on an ordinary street (no race, game or instance).
  const sad = pigs.length > 0 && locationIsDepressing({
    tsid: data.tsid,
    hubId: data.hubId ?? meta.hubId ?? '',
    hubName: data.hubName || meta.hubName || meta.hub || '',
    label: data.label || meta.label || '',
  });

  const chickens = placement('chickens').map((p, i) => [i, r1(p.x), r1((p.y ?? ground) + 2)]);
  const rest = placement('butterflies').map((p, i) => [i, r1(p.x), r1((p.y ?? ground) + 2), 0]);
  const butterflies = [...rest, ...placement('flyingButterflies').map((p, j) => [rest.length + j, r1(p.x), r1(p.y ?? ground), 1])];
  // The Batterflies' group comes after the feature groups (creatureRequests): its own planner pass.
  let batterflies = [];
  if (batterflyPlacementGroups(data).length) {
    const full = planStreetPlacements(platforms, creatureRequests(population, data, ecologyCatalog), {
      worldW: streetWidth(data),
      seed: data.tsid,
      reserved,
    });
    batterflies = (full.groups[BATTERFLY_GROUP] || []).map((p, i) => [i, r1(p.x), r1(p.y ?? ground)]);
  }

  return { rocks, trees, nodes, pigs, sad, chickens, butterflies, batterflies };
}

/** The rule numbers the server applies, from the game's own tables. */
export function ruleTables(trantTables) {
  const rocks = {};
  for (const [id, def] of Object.entries(ROCK_CATALOG)) {
    rocks[id] = { type: def.rockType, min: def.minChunks, max: def.maxChunks, chunks: def.chunksMax };
  }
  const nodes = {};
  for (const id of SHARED_NODE_CLASSES) {
    const def = RESOURCE_NODE_CATALOG[id];
    const row = {
      model: def.stock.model,
      min: def.stock.min,
      max: def.stock.max,
      initial: def.stock.initial,
      ready: def.stock.harvestableAt,
      verbs: def.verbs.map((v) => v.id),
    };
    if (def.stock.afterHarvest != null) row.after = def.stock.afterHarvest;
    if (def.stock.consume != null) row.consume = def.stock.consume;
    if (def.regrow) row.regrow = [def.regrow.minMs, def.regrow.maxMs, def.regrow.stepMs];
    if (def.tend) row.tend = { refill: def.tend.refill, resetMs: def.tend.resetMs };
    nodes[id] = row;
  }
  const harvest = {};
  for (const [id, row] of Object.entries(ARBOROLOGY_HARVEST)) harvest[id] = row.bonusAmount;
  const care = { pet: {}, water: {} };
  for (const [id, row] of Object.entries(TRANT_CARE_PACKAGES.living_pet)) care.pet[id] = row.successRate;
  for (const [id, row] of Object.entries(TRANT_CARE_PACKAGES.living_water)) care.water[id] = row.successRate;
  const trants = {};
  for (const id of Object.keys(TRANT_META)) trants[id] = trantTables[id].fruitCapMap;
  // G361: fruitProdMap, what one health rise pushes back on (include/trants.js onFruitCycle 1043-1054).
  const prod = {};
  for (const id of Object.keys(TRANT_META)) prod[id] = trantTables[id].fruitProdMap;
  const mega = { chunks: MEGA_ROCK_CHUNKS, chance: { ...MEGA_ROCK_CHANCE } };
  const dig = {};
  for (const [id, row] of Object.entries(RESOURCE_SKILL_PACKAGES.dig_dirt_pile.skills)) {
    dig[id] = { drop: Number(row.drop_chance) || 0, bonus: Number(row.bonus_amount) || 0 };
  }
  const pig = { pet: {}, nibble: {} };
  for (const verb of ['pet', 'nibble']) {
    ANIMAL_KINSHIP_PACKAGES[`npc_piggy:${verb}`].forEach((row, rank) => {
      pig[verb][rank === 0 ? 'no_skill' : `animalkinship_${rank}`] = row.successRate;
    });
  }
  // Animal Kinship by rank: [interval_limit, success_rate, bonus_amount] (the street animals' daily
  // limits per player and animal, and the item each verb gives).
  const ak = {};
  for (const key of ['npc_chicken:squeeze', 'npc_butterfly:massage', 'npc_butterfly:milk', 'npc_piggy:nibble']) {
    ak[key] = ANIMAL_KINSHIP_PACKAGES[key].map((row) => [row.intervalLimit, row.successRate, row.bonusAmount]);
  }
  const incubate = { hatches: { ...INCUBATION.hatches }, ms: INCUBATION.completeMs };
  return { rocks, mega, nodes, harvest, care, trants, prod, dig, pig, ak, incubate };
}

async function main() {
  requireServer();
  // As a multiplayer page loads streets: no published zone, no arm into one (js/street-loader.js).
  setZoneStreetsShown(false);
  const index = JSON.parse(await readFile(join(streetsDir, 'index.json'), 'utf8'));
  applyStreetIndex(index);
  const ecology = JSON.parse(await readFile(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
  setStreetEcologyCatalog(ecology);
  setCreatureEcology(ecology);
  const trantTables = JSON.parse(await readFile(join(root, 'public/assets/content/trants.json'), 'utf8'));
  const streets = {};
  const totals = { rocks: 0, trees: 0, nodes: 0, pigs: 0, chickens: 0, butterflies: 0, batterflies: 0 };
  // A published zone's streets (GZ) are solo only (docs/level-builder/spec.md 15, Q6): never shared.
  for (const tsid of Object.keys(index.streets).filter((t) => !isZoneTsid(t)).sort()) {
    let data;
    try {
      data = await loadStreetDataFromFs(tsid, streetsDir);
    } catch (err) {
      console.warn(`skip ${tsid}: ${err.message}`);
      continue;
    }
    const layout = streetObjectLayout(data, { starter: data.tsid === STREET_INDEX.default });
    const keys = ['rocks', 'trees', 'nodes', 'pigs', 'chickens', 'butterflies', 'batterflies'];
    if (!keys.some((key) => layout[key].length)) continue;
    const row = {};
    for (const key of keys) {
      if (layout[key].length) row[key] = layout[key];
      totals[key] += layout[key].length;
    }
    if (layout.sad) row.sad = true;
    streets[data.tsid] = row;
  }
  const out = {
    about: 'Shared street objects for objects.go in groddle-afternoon-server. Generated by tools/build-realtime-objects.mjs from public/assets/streets, street-ecology.json, trants.json and the game modules; do not edit by hand.',
    format: 'streets[tsid] = { rocks: [[i, class, x, y]], trees: [[i, class, x, y, maturity, health]], nodes: [[key, class, x, y]], pigs: [[i, x, y]], chickens: [[i, x, y]], butterflies: [[i, x, y, fly]], batterflies: [[i, x, y]], sad?: true }',
    rules: ruleTables(trantTables),
    streets,
  };
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(out)}\n`);
  console.log(`${Object.keys(streets).length} streets, ${totals.rocks} rocks, ${totals.trees} trees, ${totals.nodes} nodes, ${totals.pigs} pigs, ${totals.chickens} chickens, ${totals.butterflies} butterflies, ${totals.batterflies} batterflies -> ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
