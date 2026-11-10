/**
 * Shared street Patches online (register G564): the street plots the realtime
 * server keeps (groddle-afternoon-server patches.go), and the rule numbers it
 * runs them by.
 *
 * For every street it lays the soil out exactly as game.js enterStreet does:
 * the same planner pass the page makes (tools/build-realtime-objects.mjs
 * creatureRequests, the core groups then the feature groups in
 * js/features/index.js order, soil included), then the patches feature's own
 * soilSpawnPlan, so every plot key is the page's own key (`patch:0`,
 * `patch_dark:1`, `trant_spice_dead:0`) and the server knows each plot's class
 * and place. Each street carries its planting hub (js/patches.js plantingHub
 * over the street index's hubId, the hub the page plants by: register G184).
 *
 * The rules come from js/patches.js, so the two never drift: SOIL_TIMERS
 * (patch.js setClean / setDug, patch_seedling.js setTimers, trants.js
 * recalcCycles, wood_tree.js onDie), SEEDLING_GROW_UPGRADES (the planter's
 * cards: earliest grow and grow level), GROWN_TRANT_START (initTrant),
 * maturityGrowChance (onMaturityCycle) as a table by maturity and health,
 * CAN_PLANT_MAPPINGS and PLANT_HUB_ALIASES, SEASONED_BEANS (bean -> tree),
 * SOIL_SKILL_PACKAGES dig_patch bonus_amount by rank and dead_trant_clearing's
 * Planks, and WOOD_TREE_MATURITY_MAP. From js/trants.js the Arborology daily
 * harvest limits (ARBOROLOGY_HARVEST intervalLimit), and from js/trant-care.js
 * the Wood Tree's pet and water success rates (wood_pet / wood_water). The
 * trant tables (capacity, fruit, care rates, harvest amounts) are already in
 * data/objects.json's rules, which patches.go reads.
 *
 * PATCH_PILOT is the one data value that says which streets are shared:
 * null = every street laid out here (slice 3, Austin 2026-11-08: "all 100
 * streets", "no pilot: every street at once"). Slice 1 had ['GM4103L52ID23']
 * (Old Main Street, Ix: the plan's section 13); putting a list back narrows the
 * server to those streets again, nothing else changes.
 *
 * It also writes the site's data/patch-streets.json for the one-time payout of
 * players' own street Patches (site src/PatchPayout.php, plan section 10): every
 * shared street's name and plot keys, each tree's Seasoned Bean, each trant's
 * fruit and a Wood Tree's Planks by maturity.
 *
 * Run from the game repo root:
 *   node tools/build-realtime-patches.mjs
 *   node tools/build-realtime-patches.mjs --check  (fail when stale, writes nothing)
 * Writes data/patches.json in the realtime server repo (go:embed in patches.go)
 * and data/patch-streets.json in the site repo.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireServer, requireSite, serverPath, sitePath } from './repos.mjs';

import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=18b181ad';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';
import { ecologyForStreet, planStreetPlacements, populationForStreet, setStreetEcologyCatalog, streetReservedSpots } from '../public/js/street-ecology.js?v=08076876';
import {
  CAN_PLANT_MAPPINGS,
  DEAD_TRANT_CLASSES,
  GROWN_TREE_LABELS,
  GROWN_TRANT_START,
  PLANT_HUB_ALIASES,
  SEASONED_BEANS,
  SEEDLING_GROW_UPGRADES,
  SOIL_SKILL_PACKAGES,
  SOIL_TIMERS,
  WOOD_TREE_MATURITY_MAP,
  maturityGrowChance,
  plantingHub,
} from '../public/js/patches.js?v=3103cc6a';
import { ARBOROLOGY_HARVEST, TRANT_META } from '../public/js/trants.js?v=1b3c8ae3';
import { TRANT_CARE_PACKAGES } from '../public/js/trant-care.js?v=9527ff03';
import { WOOD_TREE_HARVEST } from '../public/js/woodcutting.js?v=9a2039d1';
import { soilCountsForStreet, soilSpawnPlan } from '../public/js/features/patches-feature.js?v=68438dca';
import { isZoneTsid } from '../public/js/zone-streets.js?v=b40010d5';
import { creatureRequests, setCreatureEcology } from './build-realtime-objects.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');
const outPath = serverPath('data', 'patches.json');
export const SITE_OUT = sitePath('data', 'patch-streets.json');

/** The streets whose Patches are shared: null = every street laid out (slice 3); a list = only those. */
export const PATCH_PILOT = null;

/** The streets a layout shares under PATCH_PILOT. */
export const sharedPatchStreets = (streets, pilot = PATCH_PILOT) => Object.keys(streets).filter((t) => pilot === null || pilot.includes(t)).sort();

/** The soil classes a shared street may hold (an archived patch_seedling is never shared: none is placed). */
export const SHARED_SOIL_CLASSES = Object.freeze(['patch', 'patch_dark', ...DEAD_TRANT_CLASSES]);

const r1 = (n) => Math.round(n * 10) / 10;

/**
 * One street's plots as the page plans them: [key, class, x, y] (soilSpawnPlan over the full planner
 * pass, js/features/patches-feature.js onStreetEnter), and its planting hub.
 */
export function streetPatchLayout(data, ecologyCatalog = null) {
  const counts = soilCountsForStreet(data.tsid);
  if (!Object.values(counts).some((n) => n > 0)) return null;
  const population = populationForStreet(data.tsid, ecologyForStreet(data.tsid), { starter: data.tsid === STREET_INDEX.default });
  const plan = planStreetPlacements(platformsScreen(data), creatureRequests(population, data, ecologyCatalog), {
    worldW: streetWidth(data),
    seed: data.tsid,
    reserved: streetReservedSpots(data),
  });
  const plots = soilSpawnPlan(counts, (key) => plan.groups[key] || []).map((row) => {
    if (!SHARED_SOIL_CLASSES.includes(row.classTsid)) throw new Error(`${data.tsid}: ${row.classTsid} cannot be shared`);
    return [row.key, row.classTsid, r1(row.x), r1(row.y)];
  });
  if (!plots.length) return null;
  const meta = STREET_INDEX.streets?.[data.tsid] || {};
  const hub = plantingHub(data.hubId ?? meta.hubId);
  return { hub: Number.isFinite(hub) ? hub : 0, plots };
}

/** The rule numbers patches.go runs by, from the game's own tables. */
export function patchRules() {
  const grow = {};
  for (const row of Object.values(SEEDLING_GROW_UPGRADES)) grow[row.growLevel] = row.minMinutes * 60000;
  // trants.js onMaturityCycle as a table: chance[maturity][health], maturity and health 0..10.
  const chance = [];
  for (let m = 0; m <= 10; m += 1) {
    const row = [];
    for (let h = 0; h <= 10; h += 1) row.push(maturityGrowChance(m, h));
    chance.push(row);
  }
  const beans = {};
  for (const [id, b] of Object.entries(SEASONED_BEANS)) beans[id] = b.trantClass;
  const dig = {};
  for (const [id, row] of Object.entries(SOIL_SKILL_PACKAGES.dig_patch)) dig[id] = row.bonus_amount;
  const harvestLimit = {};
  for (const [id, row] of Object.entries(ARBOROLOGY_HARVEST)) harvestLimit[id] = row.intervalLimit;
  const woodCare = { pet: {}, water: {} };
  for (const [id, row] of Object.entries(TRANT_CARE_PACKAGES.wood_pet)) woodCare.pet[id] = row.successRate;
  for (const [id, row] of Object.entries(TRANT_CARE_PACKAGES.wood_water)) woodCare.water[id] = row.successRate;
  const aliases = {};
  for (const [from, to] of Object.entries(PLANT_HUB_ALIASES)) aliases[from] = to;
  return {
    timers: {
      clean: SOIL_TIMERS.cleanRegrowMs,
      dug: SOIL_TIMERS.dugFillMs,
      min: SOIL_TIMERS.seedlingMinMs,
      max: SOIL_TIMERS.seedlingMaxMs,
      cycle1: 10 * SOIL_TIMERS.maturityIntervalMs,
      cycle: 20 * SOIL_TIMERS.maturityIntervalMs,
      wood: SOIL_TIMERS.woodToPatchMs,
      pets: SOIL_TIMERS.seedlingPets,
      catchUp: SOIL_TIMERS.maxCatchUpCycles,
    },
    grow,
    start: { maturity: GROWN_TRANT_START.maturity, health: GROWN_TRANT_START.health },
    chance,
    plant: Object.fromEntries(Object.entries(CAN_PLANT_MAPPINGS).map(([k, v]) => [k, [...v]])),
    aliases,
    beans,
    dig,
    clear: SOIL_SKILL_PACKAGES.dead_trant_clearing.no_skill.bonus_amount,
    woodMap: [...WOOD_TREE_MATURITY_MAP],
    harvestLimit,
    woodCare,
  };
}

/**
 * The site's payout data (src/PatchPayout.php): the shared streets (name, plot keys and classes), the
 * Seasoned Bean each tree grows from, each trant's fruit and a Wood Tree's Planks by maturity 1..6.
 */
export function patchPayoutData(streets, index, pilot = PATCH_PILOT) {
  const out = {};
  for (const tsid of sharedPatchStreets(streets, pilot)) {
    const meta = index.streets?.[tsid] || {};
    out[tsid] = { name: String(meta.label || meta.name || tsid), plots: streets[tsid].plots.map(([key, cls]) => [key, cls]) };
  }
  const beans = {};
  for (const [bean, b] of Object.entries(SEASONED_BEANS)) beans[b.trantClass] = bean;
  const fruit = {};
  for (const [cls, m] of Object.entries(TRANT_META)) fruit[cls] = m.fruitClass;
  return {
    about: 'Shared street Patches for the one-time payout (src/PatchPayout.php). Generated by the game\'s tools/build-realtime-patches.mjs; do not edit by hand.',
    format: 'streets[tsid] = { name, plots: [[key, class]] }; beans: tree class -> Seasoned Bean; labels: tree class -> its name; fruit: trant -> fruit class; planks: a Wood Tree\'s Planks at maturity 1..6',
    streets: out,
    beans,
    labels: { ...GROWN_TREE_LABELS },
    fruit,
    planks: [...WOOD_TREE_HARVEST.plankYieldByMaturity],
  };
}

async function main() {
  requireServer();
  requireSite();
  // As a multiplayer page loads streets: no published zone, no arm into one (js/street-loader.js).
  setZoneStreetsShown(false);
  const index = JSON.parse(await readFile(join(streetsDir, 'index.json'), 'utf8'));
  applyStreetIndex(index);
  const ecology = JSON.parse(await readFile(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
  setStreetEcologyCatalog(ecology);
  setCreatureEcology(ecology);
  const streets = {};
  const totals = {};
  // A published zone's streets (GZ) are solo only: never shared.
  for (const tsid of Object.keys(index.streets).filter((t) => !isZoneTsid(t)).sort()) {
    let data;
    try {
      data = await loadStreetDataFromFs(tsid, streetsDir);
    } catch (err) {
      console.warn(`skip ${tsid}: ${err.message}`);
      continue;
    }
    const row = streetPatchLayout(data, ecology);
    if (!row) continue;
    streets[data.tsid] = row;
    for (const [, cls] of row.plots) totals[cls] = (totals[cls] || 0) + 1;
  }
  for (const tsid of PATCH_PILOT || []) if (!streets[tsid]) throw new Error(`pilot street ${tsid} has no Patches`);
  const out = {
    about: 'Shared street Patches for patches.go in groddle-afternoon-server. Generated by tools/build-realtime-patches.mjs from public/assets/streets, street-ecology.json and js/patches.js; do not edit by hand.',
    format: 'streets[tsid] = { hub: planting hub, plots: [[key, class, x, y]] }; pilot: the streets shared now (null: every street here); rules: js/patches.js numbers',
    pilot: PATCH_PILOT === null ? null : [...PATCH_PILOT],
    rules: patchRules(),
    streets,
  };
  const text = `${JSON.stringify(out)}\n`;
  const siteText = `${JSON.stringify(patchPayoutData(streets, index))}\n`;
  if (process.argv.includes('--check')) {
    let stale = false;
    for (const [path, want] of [[outPath, text], [SITE_OUT, siteText]]) {
      const now = await readFile(path, 'utf8').catch(() => '');
      if (now !== want) {
        console.error(`${path} is stale: run node tools/build-realtime-patches.mjs`);
        stale = true;
      }
    }
    if (stale) process.exit(1);
    console.log(`${outPath} and ${SITE_OUT} are current (${Object.keys(streets).length} streets)`);
    return;
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, text);
  await writeFile(SITE_OUT, siteText);
  const n = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log(`${Object.keys(streets).length} streets, ${n} plots ${JSON.stringify(totals)} -> ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
