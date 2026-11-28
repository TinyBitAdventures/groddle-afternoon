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
 *     (items/include/mining.js 143-170, 293-305), and js/pace.js ROCK_RESPAWN_MS
 *     (rules.rockRespawnMs: a mined-out rock's wait, Glitch's 8 min at the remake's pace) and
 *     ROCK_RESPAWN_EXTRA_MS / ROCK_RESPAWN_EXTRA_AFTER (rules.rockRespawnExtra: up to that much
 *     more once more than `after` chunks were taken, Glitch's 0-16 min at the same pace);
 *   - js/resource-nodes.js RESOURCE_NODE_CATALOG stock / regrow / tend rows
 *     (mortar_barnacle.js 199-207, ice_knob.js 198-205, jellisac.js 126-131,
 *     dirt_pile.js 176 + 467, peat_1.js 224-229, paper_tree.js) and the Dust
 *     Trap's reset row (dust_trap.js doPlayerResponse 121-150, G946);
 *   - js/trants.js ARBOROLOGY_HARVEST bonus amounts (catalog_skill_packages.js
 *     gardening_harvest) and assets/content/trants.json fruitCapMap
 *     (include/trants.js 1026-1041 updateFruitCap) and fruitProdMap (rules.prod:
 *     onFruitCycle 1043-1054, the fruit a tended tree's health rise brings back);
 *   - js/trant-care.js TRANT_CARE_PACKAGES living_pet / living_water success
 *     rates (catalog_skill_packages.js light_green_thumb_pet / _water), and
 *     wood_pet / wood_water (wood_tree_pet / _water) with js/woodcutting.js
 *     WOOD_TREE_MATURITY_MAP (wood_tree.js maturityMap) for a street Wood Tree's
 *     care (the server's trees.go woodTend);
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
 * no feature ecology overrides
 * (those streets are private instances, never shared), except a street
 * upgrade's: the street-jobs feature answers ecologyOverride with
 * js/street-jobs.js upgradeEcologyEntry once the street's upgrade project is
 * built (the shared world's, the server's projects.go), which adds animals
 * and rocks and can give the street a shrine, so every planned spot after them
 * moves. Each upgrade option whose layout differs is written beside the
 * street's own as upgrades[option id], and the server lays the street out
 * from it once that upgrade is built (player report #222/#232: Nightshade
 * Woods' Chickens and Piggies stood elsewhere on the server).
 *
 * Run from the game repo root:
 *   node tools/build-realtime-objects.mjs
 *   node tools/build-realtime-objects.mjs --check  (fail when stale, writes nothing)
 * Writes data/objects.json in the realtime server repo (go:embed in its objects.go;
 * found by tools/repos.mjs: GRODDLE_SERVER_DIR, else ../groddle-afternoon-server).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireServer, serverPath } from './repos.mjs';

import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=23555e53';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import {
  animalPatrolRange,
  ecologyForStreet,
  planStreetPlacements,
  populationForStreet,
  rockPlacementRequest,
  shrinePlacementRequest,
  treePlacementRequest,
  gardenPlacementRequest,
  rockSpawnPlan,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=1c840641';
import { ROCK_CATALOG } from '../public/js/mining.js?v=7ecaa572';
import { MEGA_ROCK_CHANCE, MEGA_ROCK_CHUNKS } from '../public/js/imagination-effects.js?v=70169933';
import { ROCK_RESPAWN_EXTRA_AFTER, ROCK_RESPAWN_EXTRA_MS, ROCK_RESPAWN_MS } from '../public/js/pace.js?v=c07dfbd8';
import { RESOURCE_NODE_CATALOG, RESOURCE_SKILL_PACKAGES } from '../public/js/resource-nodes.js?v=c2eb46b1';
import { ARBOROLOGY_HARVEST, TRANT_META } from '../public/js/trants.js?v=cf0fe1a3';
import { TRANT_CARE_PACKAGES } from '../public/js/trant-care.js?v=63846e5e';
import { WOOD_TREE_MATURITY_MAP } from '../public/js/woodcutting.js?v=9e9af511';
import { ANIMAL_KINSHIP_PACKAGES } from '../public/js/animal-kinship.js?v=eaa3a6f2';
import { locationIsDepressing } from '../public/js/animal-mood.js?v=c8cc8797';
import { resourcePlacementGroups, resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=6ec0d8c0';
import { soilCountsForStreet, soilPlacementGroups } from '../public/js/features/patches-feature.js?v=b8149171';
import { KITTY_GROUP, kittyPlacementGroups } from '../public/js/features/heli-kitties-feature.js?v=4e3b2d5f';
import { BATTERFLY_GROUP, batterflyPlacementGroups } from '../public/js/features/animal-husbandry-feature.js?v=6cb78b44';
import { hasRaceDispenser } from '../public/js/races.js?v=ab22a079';
import { setWildlifeCatalog, wildlifeFor } from '../public/js/wildlife.js?v=7224f78a';
import { boardSpotRow, furnitureFor, furniturePlacementGroups, stoneSpotRow } from '../public/js/street-furniture.js?v=071203fc';
import { INCUBATION } from '../public/js/animal-husbandry.js?v=b79a1eab';
import { SHARED_NODE_CLASSES, freshTreePlan } from '../public/js/street-objects.js?v=7f174327';
import { PIGGY_TRIP } from '../public/js/street-creatures.js?v=997a2517';
import { CRAB_PLACEMENT_KEY, CRAB_WALK, crabPlacementGroups } from '../public/js/crabs.js?v=eb0bdc39';
import { KITTY_PET } from '../public/js/heli-kitties.js?v=e4af4096';
import { FIRE_DRAGON_PLACEMENT_KEY, FIRE_DRAGON_WALK, fireDragonPlacementGroups } from '../public/js/fire-dragon.js?v=b7f3d751';
import { isZoneTsid } from '../public/js/zone-streets.js?v=b40010d5';
import { upgradeEcologyEntry } from '../public/js/street-jobs.js?v=17f103d0';
import { partyEcologyEntry, partyExitSignpost, partySpaceForStreet } from '../public/js/party-spaces.js?v=91ce15c5';

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
    // Trees the snaps show stand where they show them, at their own index (fixed points), the rest are planned.
    treePlacementRequest(population),
    gardenPlacementRequest(population),
    { key: 'vendor', count: population.vendor ? 1 : 0, clearance: 120 },
    // The shrine where its street's picture shows it (fixed), else planned.
    shrinePlacementRequest(population),
    rockPlacementRequest(population),
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
  groups.push(...furniturePlacementGroups(stoneSpotRow(boardSpotRow(furnitureFor(ecology, street.tsid), street), street), street.tsid, street));
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
 *   rocks [i, class, x, y]                 game.js spawnMineRocks / spawnMineRock (index i in rockClasses;
 *                                          street-ecology.js rockSpawnPlan: measured or planned)
 *   trees [i, class, x, y, maturity, health] game.js spawnTrees (the trants, and the Wood Tree at
 *                                          maturity 6, health 0: ensureWoodTreeState's fresh tree)
 *   nodes [key, class, x, y]               resource-nodes-feature resourceSpawnPlan (`<class>:<n>`)
 *   pigs  [i, x, y, range]                 game.js spawnPiggies (index i in placement('piggies'); y on the line;
 *                                          range: its walk each way, animalPatrolRange)
 *   trunks [x]                             every planned tree's x (a Piggy never roots by a trunk)
 *   sad   true                             locationIsDepressing for the street (its Piggies are sad)
 *   chickens    [i, x, y]                  game.js spawnChickens (index i in placement('chickens'); y on the line)
 *   butterflies [i, x, y, fly]             game.js spawnButterflies: resting i < n (fly 0), then the
 *                                          flyers at n + j (fly 1, the planner point's y)
 *   batterflies [i, x, y]                  animal-husbandry-feature spawnStreet (batterfly:<i>)
 *   w     px                               the street's width, with Batterflies (their flight, js/street-creatures.js flierAt)
 *   kitties     [i, x, y]                  heli-kitties-feature (kitty:<i>, the planner's kitty group)
 *   crabs       [i, x, y]                  crabs-feature (crab:<i>, its crabs group after the others)
 *   dragons     [i, x, y]                  fire-dragon-feature (dragon:<i>, after the Crabs; none yet)
 */
export function streetObjectLayout(data, { starter = false, ecology = ecologyForStreet(data.tsid) } = {}) {
  const population = populationForStreet(data.tsid, ecology, { starter });
  const platforms = platformsScreen(data);
  const reserved = streetReservedSpots(data);
  // R43 (#680): one plan, with the groups a page plans (game.js enterStreet: the core groups, then every
  // feature's up to the Batterflies', creatureRequests, then the Crabs' and the Fire Dragons'), street
  // furniture included. A group's spots depend only on the groups before it (planStreetPlacements
  // moves a node the front art covers before the next group), so the groups a page plans after these
  // from its player's own projects and the season never move them: every page has each shared thing
  // here, and its mailbox, Visiting Stone and Notice Board planned clear of them
  // (tests/client-server-placement.test.js, tests/g1236-click-fixtures-clear.test.js).
  const kittyGroups = kittyPlacementGroups(wildlifeFor(ecologyCatalog, data.tsid));
  const crabGroups = crabPlacementGroups(data.tsid);
  // Fire Dragons (fire-dragon-feature, after the Crabs; slice 3): from the street's population, which
  // no shared street has yet (the made animal lives in a draft zone, and zones are solo only).
  const dragonGroups = fireDragonPlacementGroups(population);
  const plan = planStreetPlacements(platforms, [...creatureRequests(population, data, ecologyCatalog), ...crabGroups, ...dragonGroups], {
    worldW: streetWidth(data),
    seed: data.tsid,
    reserved,
  });
  const placement = (key) => plan.groups[key] || [];
  const ground = groundY(platforms);

  const rocks = [];
  rockSpawnPlan(population, placement('rocks'), data.tsid).forEach((p) => {
    const { index: i, classTsid } = p;
    if (!ROCK_CATALOG[classTsid]) return;
    // game.js spawnMineRocks: a rock the planner could not seat stands at its fallback.
    const x = p.x ?? 200 + i * 160;
    const y = p.y ?? ground;
    rocks.push([i, classTsid, r1(x || 200), r1(y || ground)]);
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

  // Each Piggy's walk (game.js enterStreet: animalPatrolRange at its spot's room), so the server knows
  // where its shared path has it (groddle-afternoon-server pigpath.go) and every page walks it from
  // the same numbers (the snapshot's "homes").
  // G975: on the line, as game.js enterStreet now stands them (R12 sprite feet removed the + 2 that made up for blank rows).
  const pigs = placement('piggies').map((p, i) => [i, r1(p.x), r1(p.y ?? ground), animalPatrolRange('piggies', p.room)]);
  // The trunks a Piggy never roots by (features/street-objects-feature.js: every planned tree).
  const trunks = pigs.length ? placement('trees').map((p) => r1(p.x)).filter(Number.isFinite) : [];
  const meta = STREET_INDEX.streets?.[data.tsid] || {};
  // features/animal-mood-feature.js describeAnimalPlace on an ordinary street (no race, game or instance).
  const sad = pigs.length > 0 && locationIsDepressing({
    tsid: data.tsid,
    hubId: data.hubId ?? meta.hubId ?? '',
    hubName: data.hubName || meta.hubName || meta.hub || '',
    label: data.label || meta.label || '',
  });

  const chickens = placement('chickens').map((p, i) => [i, r1(p.x), r1(p.y ?? ground)]);
  const rest = placement('butterflies').map((p, i) => [i, r1(p.x), r1(p.y ?? ground), 0]);
  const butterflies = [...rest, ...placement('flyingButterflies').map((p, j) => [rest.length + j, r1(p.x), r1(p.y ?? ground), 1])];
  // Batterflies (animal-husbandry-feature), Heli Kitties (heli-kitties-feature) and Crabs (crabs-feature):
  // a page draws them from the server's spots (the snapshot's "spots"), the same for everyone, since
  // groups from each player's own projects and the seasons come before the Crabs' (slice 2 of
  // research/plans/street-animals-shared.md).
  const batterflies = placement(BATTERFLY_GROUP).map((p, i) => [i, r1(p.x), r1(p.y ?? ground)]);
  const kitties = placement(KITTY_GROUP).slice(0, kittyGroups[0]?.count || 0)
    .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)).map((p, i) => [i, r1(p.x), r1(p.y)]);
  const crabs = placement(CRAB_PLACEMENT_KEY).map((p, i) => [i, r1(p.x), r1(p.y ?? ground)]);
  const dragons = placement(FIRE_DRAGON_PLACEMENT_KEY).map((p, i) => [i, r1(p.x), r1(p.y ?? ground)]);

  // The street's width, for a Batterfly's flight over it (js/street-creatures.js flierAt; the server's
  // flierpath.go drops its Guano where it flies).
  const w = batterflies.length ? r1(streetWidth(data)) : 0;
  return { rocks, trees, nodes, pigs, trunks, sad, chickens, butterflies, batterflies, kitties, crabs, dragons, w };
}

const LAYOUT_KEYS = ['rocks', 'trees', 'nodes', 'pigs', 'chickens', 'butterflies', 'batterflies', 'kitties', 'crabs', 'dragons'];

/** A layout as its data row: the non-empty lists, trunks and sad. */
function layoutRow(layout) {
  const row = {};
  for (const key of LAYOUT_KEYS) if (layout[key].length) row[key] = layout[key];
  if (layout.trunks.length) row.trunks = layout.trunks;
  if (layout.sad) row.sad = true;
  if (layout.w) row.w = layout.w;
  return row;
}

/**
 * Each upgrade option of a street (street-jobs.json upgrades[tsid].options) whose layout differs
 * from the street's own, by option id: the street-jobs feature's ecologyOverride once the upgrade
 * is built (upgradeEcologyEntry over the street's ecology row, as game.js enterStreet plans it).
 */
export function upgradeLayouts(data, options, { starter = false } = {}) {
  const base = JSON.stringify(layoutRow(streetObjectLayout(data, { starter })));
  const out = {};
  for (const option of options || []) {
    if (!option?.id) continue;
    const row = layoutRow(streetObjectLayout(data, { starter, ecology: upgradeEcologyEntry(ecologyForStreet(data.tsid), option) }));
    if (JSON.stringify(row) !== base) out[option.id] = row;
  }
  return out;
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
    // A Salmon comes back one at a time, respawnMs after it was pocketed (spawner.js spawn_interval).
    else if (def.stock.model === 'respawn' && def.respawnMs) row.regrow = [def.respawnMs, def.respawnMs, def.respawnMs];
    if (def.tend) row.tend = { refill: def.tend.refill, resetMs: def.tend.resetMs };
    // G946: a Dust Trap stays down 2 x the time it stood ready, clamped (dust_trap.js doPlayerResponse).
    if (def.reset) row.reset = [def.reset.minMs, def.reset.maxMs, def.reset.fullResetMs];
    nodes[id] = row;
  }
  const harvest = {};
  for (const [id, row] of Object.entries(ARBOROLOGY_HARVEST)) harvest[id] = row.bonusAmount;
  const care = { pet: {}, water: {} };
  for (const [id, row] of Object.entries(TRANT_CARE_PACKAGES.living_pet)) care.pet[id] = row.successRate;
  for (const [id, row] of Object.entries(TRANT_CARE_PACKAGES.living_water)) care.water[id] = row.successRate;
  const woodCare = { pet: {}, water: {} };
  for (const [id, row] of Object.entries(TRANT_CARE_PACKAGES.wood_pet)) woodCare.pet[id] = row.successRate;
  for (const [id, row] of Object.entries(TRANT_CARE_PACKAGES.wood_water)) woodCare.water[id] = row.successRate;
  const woodMap = [...WOOD_TREE_MATURITY_MAP];
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
  // A street Piggy's walk to food and home (js/street-creatures.js PIGGY_TRIP, the server's startTrip).
  const pigtrip = { ...PIGGY_TRIP };
  // How long a landed verb holds a Heli Kitty (its sleep) or a Crab (its menu wait) for everyone.
  const holds = { kittyPet: KITTY_PET.totalMs, crabVerb: CRAB_WALK.menuWaitMs, dragonPet: FIRE_DRAGON_WALK.menuWaitMs };
  return { rocks, mega, rockRespawnMs: ROCK_RESPAWN_MS, rockRespawnExtra: { ms: ROCK_RESPAWN_EXTRA_MS, after: ROCK_RESPAWN_EXTRA_AFTER }, nodes, harvest, care, woodCare, woodMap, trants, prod, dig, pig, ak, incubate, pigtrip, holds };
}

/**
 * The ecology row a street is planned from in multiplayer. A Party Space's template street is only
 * ever played as a space, whose feature answers ecologyOverride with js/party-spaces.js
 * partyEcologyEntry (its exact rocks, trees and nodes): the server lays a space's instance
 * (PARTY_<id>) out from its template's row (objects_upgrades.go layoutOf, #576), so that row is
 * planned the way the space is (Nylon Phool's salmon stands elsewhere on the street's own row).
 */
export function streetEcology(tsid) {
  const space = partySpaceForStreet(tsid);
  return space ? partyEcologyEntry(space.id) : ecologyForStreet(tsid);
}

/**
 * A street as a page plans it in multiplayer. A Party Space's template street is played inside a
 * party, where party-spaces-feature prepareStreet leaves it only its exit signpost (at the space's
 * own exit, js/party-spaces.js partyExitSignpost) before game.js enterStreet plans it, and a
 * signpost is a keep-clear spot (streetReservedSpots). Toxic Moon and Nylon Phool have no signpost
 * of their own, so planned from the archived street their rocks and Nylon Phool's salmon stood
 * elsewhere on the server (R43). Where the way back leads does not move the post: any will do.
 */
export function plannedStreet(data) {
  const space = partySpaceForStreet(data?.tsid);
  if (!space) return data;
  const exit = partyExitSignpost(space.id, { tsid: STREET_INDEX.default, x: 0, y: 0 });
  return { ...data, signposts: exit ? [exit] : [] };
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
  const jobs = JSON.parse(await readFile(join(root, 'public/assets/content/street-jobs.json'), 'utf8'));
  const streets = {};
  const totals = { rocks: 0, trees: 0, nodes: 0, pigs: 0, chickens: 0, butterflies: 0, batterflies: 0, kitties: 0, crabs: 0, dragons: 0, upgrades: 0 };
  // A published zone's streets (GZ) are solo only (docs/level-builder/spec.md 15, Q6): never shared.
  for (const tsid of Object.keys(index.streets).filter((t) => !isZoneTsid(t)).sort()) {
    let data;
    try {
      data = await loadStreetDataFromFs(tsid, streetsDir);
    } catch (err) {
      console.warn(`skip ${tsid}: ${err.message}`);
      continue;
    }
    data = plannedStreet(data);
    const starter = data.tsid === STREET_INDEX.default;
    const layout = streetObjectLayout(data, { starter, ecology: streetEcology(data.tsid) });
    const upgrades = upgradeLayouts(data, jobs.upgrades?.[data.tsid]?.options, { starter });
    if (!LAYOUT_KEYS.some((key) => layout[key].length) && !Object.keys(upgrades).length) continue;
    for (const key of LAYOUT_KEYS) totals[key] += layout[key].length;
    const row = layoutRow(layout);
    if (Object.keys(upgrades).length) {
      row.upgrades = upgrades;
      totals.upgrades += Object.keys(upgrades).length;
    }
    streets[data.tsid] = row;
  }
  const out = {
    about: 'Shared street objects for objects.go in groddle-afternoon-server. Generated by tools/build-realtime-objects.mjs from public/assets/streets, street-ecology.json, street-jobs.json (upgrades), trants.json and the game modules; do not edit by hand.',
    format: 'streets[tsid] = { rocks: [[i, class, x, y]], trees: [[i, class, x, y, maturity, health]], nodes: [[key, class, x, y]], pigs: [[i, x, y, range]], trunks?: [x], chickens: [[i, x, y]], butterflies: [[i, x, y, fly]], batterflies: [[i, x, y]], w?: street width (with Batterflies), kitties: [[i, x, y]], crabs: [[i, x, y]], dragons: [[i, x, y]], sad?: true, upgrades?: { [option id]: the same row without upgrades, the layout once that street upgrade is built } }',
    rules: ruleTables(trantTables),
    streets,
  };
  const text = `${JSON.stringify(out)}\n`;
  if (process.argv.includes('--check')) {
    const now = await readFile(outPath, 'utf8').catch(() => '');
    if (now !== text) {
      console.error(`${outPath} is stale: run node tools/build-realtime-objects.mjs`);
      process.exit(1);
    }
    console.log(`${outPath} is current (${Object.keys(streets).length} streets)`);
    return;
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, text);
  console.log(`${Object.keys(streets).length} streets, ${totals.rocks} rocks, ${totals.trees} trees, ${totals.nodes} nodes, ${totals.pigs} pigs, ${totals.chickens} chickens, ${totals.butterflies} butterflies, ${totals.batterflies} batterflies, ${totals.kitties} kitties, ${totals.crabs} crabs, ${totals.dragons} dragons, ${totals.upgrades} street upgrade layouts -> ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
