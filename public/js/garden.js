/**
 * Crop gardens — simplified from GSJS items/include/garden.js + seed_*.js.
 *
 * Plot states (original): clean → seeds → shoots → crop → dirty → (clear) clean
 * Growth only advances while wet. Watering sets wet; growth stages use grow1/grow2.
 *
 * Timings are demo-scaled seconds (original used hours × garden_grow_multiplier).
 * Produce counts come from GSJS seed classProps (capped for pack balance).
 */

import { addItem, removeItem, countItem, ensureItem, itemIcon } from './inventory.js?v=catalog-unified-3';
import { canUseTool, useToolCondition } from './tools.js?v=tools-2';
import { skillPackageDetails } from './skill-packages.js';
import { gardenGrowModifier } from './imagination-effects.js';
import { moodMax } from './metabolics.js';

/** @typedef {'clean'|'seeds'|'shoots'|'crop'|'dirty'} PlotState */

/**
 * @typedef {{
 *   seedId: string,
 *   label: string,
 *   cropId: string,
 *   cropLabel: string,
 *   produces: number,
 *   grow1Ms: number,
 *   grow2Ms: number,
 *   gardenType: 'default'|'herb',
 *   source?: string,
 * }} SeedDef
 */

/**
 * GSJS seed_base classProps (time_grow in hours) → demo ms.
 * Scale: hours × 8s so spinach is quick, potato still a wait.
 * @param {number} hours
 */
function growHoursToMs(hours) {
  return Math.max(4000, Math.round(Number(hours) * 8000));
}

/** @param {Omit<SeedDef,'grow1Ms'|'grow2Ms'> & { grow1H: number, grow2H: number }} def */
function seedDef(def) {
  return {
    seedId: def.seedId,
    label: def.label,
    cropId: def.cropId,
    cropLabel: def.cropLabel,
    produces: def.produces,
    grow1Ms: growHoursToMs(def.grow1H),
    grow2Ms: growHoursToMs(def.grow2H),
    gardenType: def.gardenType || 'default',
    source: def.source || `${def.seedId}.js classProps`,
  };
}

/** Crop + herb seeds mined from GSJS seed_*.js / herb_seed_*.js classProps. */
export const SEED_CATALOG = {
  seed_spinach: seedDef({
    seedId: 'seed_spinach',
    label: 'Spinach Seed',
    cropId: 'spinach',
    cropLabel: 'Spinach',
    produces: 6,
    grow1H: 0.5,
    grow2H: 0.25,
    gardenType: 'default',
  }),
  seed_onion: seedDef({
    seedId: 'seed_onion',
    label: 'Onion Seed',
    cropId: 'onion',
    cropLabel: 'Onion',
    produces: 6,
    grow1H: 1,
    grow2H: 0.5,
    gardenType: 'default',
  }),
  seed_tomato: seedDef({
    seedId: 'seed_tomato',
    label: 'Tomato Seed',
    cropId: 'tomato',
    cropLabel: 'Tomato',
    produces: 7,
    grow1H: 2.5,
    grow2H: 2.5,
    gardenType: 'default',
  }),
  seed_carrot: seedDef({
    seedId: 'seed_carrot',
    label: 'Carrot Seed',
    cropId: 'carrot',
    cropLabel: 'Carrot',
    produces: 7,
    grow1H: 3.5,
    grow2H: 3.5,
    gardenType: 'default',
  }),
  seed_corn: seedDef({
    seedId: 'seed_corn',
    label: 'Corn Seed',
    cropId: 'corn',
    cropLabel: 'Corn',
    produces: 6,
    grow1H: 3,
    grow2H: 3,
    gardenType: 'default',
  }),
  seed_potato: seedDef({
    seedId: 'seed_potato',
    label: 'Potato Seed',
    cropId: 'potato',
    cropLabel: 'Potato',
    produces: 9,
    grow1H: 6,
    grow2H: 5.5,
    gardenType: 'default',
  }),
  seed_rice: seedDef({
    seedId: 'seed_rice',
    label: 'Rice Seed',
    cropId: 'rice',
    cropLabel: 'Rice',
    produces: 9,
    grow1H: 0.75,
    grow2H: 0.5,
    gardenType: 'default',
  }),
  seed_cucumber: seedDef({
    seedId: 'seed_cucumber',
    label: 'Cucumber Seed',
    cropId: 'cucumber',
    cropLabel: 'Cucumber',
    produces: 9,
    grow1H: 1.5,
    grow2H: 1.5,
    gardenType: 'default',
  }),
  seed_parsnip: seedDef({
    seedId: 'seed_parsnip',
    label: 'Parsnip Seed',
    cropId: 'parsnip',
    cropLabel: 'Parsnip',
    produces: 9,
    grow1H: 2.5,
    grow2H: 2.5,
    gardenType: 'default',
  }),
  seed_broccoli: seedDef({
    seedId: 'seed_broccoli',
    label: 'Broccoli Seed',
    cropId: 'broccoli',
    cropLabel: 'Broccoli',
    produces: 9,
    grow1H: 3.5,
    grow2H: 3.5,
    gardenType: 'default',
  }),
  seed_zucchini: seedDef({
    seedId: 'seed_zucchini',
    label: 'Zucchini Seed',
    cropId: 'zucchini',
    cropLabel: 'Zucchini',
    produces: 9,
    grow1H: 4,
    grow2H: 4,
    gardenType: 'default',
  }),
  seed_cabbage: seedDef({
    seedId: 'seed_cabbage',
    label: 'Cabbage Seed',
    cropId: 'cabbage',
    cropLabel: 'Cabbage',
    produces: 9,
    grow1H: 4.5,
    grow2H: 4.5,
    gardenType: 'default',
  }),
  // Herbs (herbalism gardens — GSJS herb_seed_*)
  herb_seed_purple_flower: seedDef({
    seedId: 'herb_seed_purple_flower',
    label: 'Purple Flower Seed',
    cropId: 'purple_flower',
    cropLabel: 'Purple Flower',
    produces: 3,
    grow1H: 0.5,
    grow2H: 0.5,
    gardenType: 'herb',
  }),
  herb_seed_rubeweed: seedDef({
    seedId: 'herb_seed_rubeweed',
    label: 'Rubeweed Seed',
    cropId: 'rubeweed',
    cropLabel: 'Rubeweed',
    produces: 1,
    grow1H: 2,
    grow2H: 2,
    gardenType: 'herb',
  }),
  herb_seed_rookswort: seedDef({
    seedId: 'herb_seed_rookswort',
    label: 'Rookswort Seed',
    cropId: 'rookswort',
    cropLabel: 'Rookswort',
    produces: 1,
    grow1H: 2.5,
    grow2H: 2.5,
    gardenType: 'herb',
  }),
  herb_seed_hairball_flower: seedDef({
    seedId: 'herb_seed_hairball_flower',
    label: 'Hairball Flower Seed',
    cropId: 'hairball_flower',
    cropLabel: 'Hairball Flower',
    produces: 1,
    grow1H: 2.25,
    grow2H: 2.25,
    gardenType: 'herb',
  }),
  herb_seed_silvertongue: seedDef({
    seedId: 'herb_seed_silvertongue',
    label: 'Silvertongue Seed',
    cropId: 'silvertongue',
    cropLabel: 'Silvertongue',
    produces: 3,
    grow1H: 3.5,
    grow2H: 3.5,
    gardenType: 'herb',
  }),
  // Dust Trap drop-table herbs (item-transforms.js shucks them back into seeds).
  herb_seed_gandlevery: seedDef({
    seedId: 'herb_seed_gandlevery',
    label: 'Gandlevery Seed',
    cropId: 'gandlevery',
    cropLabel: 'Gandlevery',
    produces: 1,
    grow1H: 0.75,
    grow2H: 0.75,
    gardenType: 'herb',
  }),
  herb_seed_yellow_crumb_flower: seedDef({
    seedId: 'herb_seed_yellow_crumb_flower',
    label: 'Yellow Crumb Flower Seed',
    cropId: 'yellow_crumb_flower',
    cropLabel: 'Yellow Crumb Flower',
    produces: 3,
    grow1H: 4.5,
    grow2H: 4.5,
    gardenType: 'herb',
  }),
  // Gardening Goods / Gardening Tools vendors (catalog_stores.js stores 6, 12).
  seed_pumpkin: seedDef({
    seedId: 'seed_pumpkin',
    label: 'Pumpkin Seed',
    cropId: 'pumpkin',
    cropLabel: 'Pumpkin',
    produces: 1,
    grow1H: 3,
    grow2H: 3,
    gardenType: 'default',
  }),
};

/** Tools used by original garden_action (watering_can / hoe). */
export const GARDEN_TOOLS = {
  watering_can: {
    classTsid: 'watering_can',
    label: 'Watering Can',
    desc: 'Water garden plots so seeds can grow. (GSJS watering_can)',
    isTool: true,
  },
  hoe: {
    classTsid: 'hoe',
    label: 'Hoe',
    desc: 'Clear dirty plots after harvest. (GSJS hoe)',
    isTool: true,
  },
};

/**
 * Legacy flat costs, used only when a caller passes no learned-skill list
 * (older tests and helpers). Game paths pass `learned` and get the exact
 * Croppery / Herbalism skill packages below.
 */
export const GARDEN_COSTS = {
  water: 2,
  plant: 2,
  harvest: 3,
  clear: 2,
};

/** include/garden.js: which skill package each garden type runs. */
export const GARDEN_SKILL_PACKAGES = Object.freeze({
  default: Object.freeze({
    skill: 'croppery_1',
    plant: 'croppery_plant',
    water: 'croppery_water',
    harvest: 'croppery_harvest',
    clear: 'croppery_clear',
  }),
  herb: Object.freeze({
    skill: 'herbalism_1',
    plant: 'herbalism_plant',
    water: 'herbalism_water',
    harvest: 'herbalism_harvest',
    clear: 'herbalism_clear',
  }),
});

/** garden_new.js `*_harvest_na_failed` talkbacks (75% no-skill success roll). */
export const GARDEN_HARVEST_FAILED_LINES = Object.freeze({
  default: Object.freeze([
    "No. I like these. You can't have them.",
    'Say please.',
    "You mis-picked. You picked nothin'. Try harder, picky-picker.",
  ]),
  herb: Object.freeze([
    'Nooooo. My precious! Cannot take my precious herbs. Mineses.',
    'Hoe no. Hoe no no no.',
    'The roots run deep on this one.',
  ]),
});

/** include/garden.js water failure: package energy plus a flat 3 mood. */
export const GARDEN_WATER_FAIL_MOOD = 3;
export const GARDEN_WATER_FAILED_LINE = 'Oops. Somehow you failed at watering that. Try again?';

/**
 * Costs and rewards for one garden action. With a `learned` array this is the
 * exact source package row (no_skill or Croppery/Herbalism 1–3): energy,
 * mood, xp, tool wear, success rate, super-harvest multiplier/chance, and the
 * source rule that harvesting without Croppery I / Herbalism I yields half
 * (rounded). Without `learned` it returns the legacy flat profile.
 * @param {'default'|'herb'|string} gardenType
 * @param {'plant'|'water'|'harvest'|'clear'} action
 * @param {string[]} [learned]
 * @param {string[]} [upgrades]
 */
export function gardenActionProfile(gardenType, action, learned, upgrades = []) {
  const type = gardenType === 'herb' ? 'herb' : 'default';
  if (!Array.isArray(learned)) {
    return {
      legacy: true,
      gardenType: type,
      action,
      skill: null,
      rank: null,
      energy: GARDEN_COSTS[action] || 0,
      mood: action === 'harvest' ? 2 : action === 'water' ? 1 : 0,
      xp: action === 'harvest' ? 2 : 0,
      toolWear: 1,
      successRate: 100,
      bonusMultiplier: 0,
      bonusChance: 0,
      halfHarvest: false,
    };
  }
  const packages = GARDEN_SKILL_PACKAGES[type];
  const details = skillPackageDetails(packages[action], learned, upgrades) || {};
  return {
    legacy: false,
    gardenType: type,
    action,
    package: packages[action],
    skill: details.skill === 'no_skill' ? null : details.skill || null,
    rank: Number.isFinite(details.rank) ? Math.max(0, details.rank) : 0,
    energy: Number(details.energy_cost) || 0,
    mood: Number(details.mood_bonus) || 0,
    xp: Number(details.xp_bonus) || 0,
    toolWear: Number(details.tool_wear) || 1,
    successRate: details.success_rate ?? 100,
    bonusMultiplier: Number(details.bonus_multiplier) || 0,
    bonusChance: Number(details.bonus_chance) || 0,
    halfHarvest: action === 'harvest' && !learned.includes(packages.skill),
  };
}

function rollSucceeds(profile, opts) {
  if (opts.maxLuck) return true;
  const rate = Number(profile.successRate);
  if (!Number.isFinite(rate) || rate >= 100) return true;
  return (opts.rng || Math.random)() < rate / 100;
}

function applyGardenRewards(pc, profile) {
  if (profile.legacy) return;
  if (profile.mood && pc.mood != null) pc.mood = Math.min(moodMax(pc), (pc.mood || 0) + profile.mood);
  if (profile.xp) {
    if (pc.imagination != null) pc.imagination = (pc.imagination || 0) + profile.xp;
    if (pc.xp != null) pc.xp = (pc.xp || 0) + profile.xp;
  }
}

/**
 * Register seed + crop/herb items + garden tools on ITEM_CATALOG.
 */
export function ensureGardenItems() {
  for (const seed of Object.values(SEED_CATALOG)) {
    const bed = seed.gardenType === 'herb' ? 'herb garden' : 'crop garden';
    ensureItem(seed.seedId, {
      label: seed.label,
      desc: `Plant in a ${bed} to grow ${seed.cropLabel}. (GSJS ${seed.source})`,
    });
    ensureItem(seed.cropId, {
      label: seed.cropLabel,
      desc: `Harvested from a ${bed}. (GSJS ${seed.cropId})`,
    });
  }
  for (const tool of Object.values(GARDEN_TOOLS)) {
    ensureItem(tool.classTsid, {
      label: tool.label,
      desc: tool.desc,
      isTool: true,
    });
  }
}

/**
 * Starter crop seeds for demo.
 * @returns {Record<string, number>}
 */
export function starterGardenSeeds() {
  return {
    seed_spinach: 6,
    seed_onion: 4,
    seed_carrot: 4,
    seed_tomato: 3,
    seed_corn: 2,
    seed_potato: 2,
  };
}

/**
 * Starter herb seeds for herb garden demo.
 * @returns {Record<string, number>}
 */
export function starterHerbSeeds() {
  return {
    herb_seed_purple_flower: 5,
    herb_seed_rubeweed: 3,
    herb_seed_rookswort: 3,
    herb_seed_hairball_flower: 2,
    herb_seed_silvertongue: 2,
  };
}

/**
 * Watering can + hoe (original tool gates).
 * @returns {Record<string, number>}
 */
export function starterGardenTools() {
  return {
    watering_can: 1,
    hoe: 1,
  };
}

/** @param {import('./inventory.js').Inventory} inv */
export function hasWateringCan(inv) {
  return countItem(inv, 'watering_can') >= 1 || countItem(inv, 'irrigator_9000') >= 1;
}

/** @param {import('./inventory.js').Inventory} inv */
export function hasHoe(inv) {
  return countItem(inv, 'hoe') >= 1 || countItem(inv, 'hoe_highclass') >= 1;
}

/**
 * Vendor offers for gardening goods (currants).
 * @returns {{ classTsid: string, label: string, buyPrice: number, sellPrice: number }[]}
 */
export function gardenVendorOffers() {
  ensureGardenItems();
  const offers = [];
  for (const seed of Object.values(SEED_CATALOG)) {
    const herb = seed.gardenType === 'herb';
    offers.push({
      classTsid: seed.seedId,
      label: seed.label,
      buyPrice: herb ? 18 : 12,
      sellPrice: herb ? 6 : 4,
    });
  }
  offers.push(
    { classTsid: 'watering_can', label: 'Watering Can', buyPrice: 80, sellPrice: 25 },
    { classTsid: 'hoe', label: 'Hoe', buyPrice: 70, sellPrice: 20 }
  );
  // Sell harvested produce
  for (const seed of Object.values(SEED_CATALOG)) {
    offers.push({
      classTsid: seed.cropId,
      label: seed.cropLabel,
      buyPrice: seed.gardenType === 'herb' ? 35 : 14,
      sellPrice: seed.gardenType === 'herb' ? 12 : 5,
    });
  }
  return offers;
}

/**
 * Plot key "c-r" (1-based) matching GSJS plotIDToKey style.
 * @param {number} col 1-based
 * @param {number} row 1-based
 */
export function plotKey(col, row) {
  return `${col}-${row}`;
}

/**
 * @param {string} key
 * @returns {{ col: number, row: number }|null}
 */
export function parsePlotKey(key) {
  const m = String(key).match(/^(\d+)-(\d+)$/);
  if (!m) return null;
  return { col: Number(m[1]), row: Number(m[2]) };
}

/**
 * @returns {{
 *   state: PlotState,
 *   seed: string|null,
 *   wet: boolean,
 *   stageStartedAt: number,
 *   growModifier: number,
 * }}
 */
export function createEmptyPlot(now = Date.now()) {
  return {
    state: 'clean',
    seed: null,
    wet: false,
    stageStartedAt: now,
    growModifier: 1,
  };
}

/**
 * @param {{ cols?: number, rows?: number, gardenType?: string, now?: number }} [opts]
 */
export function createGarden(opts = {}) {
  ensureGardenItems();
  const cols = Math.max(1, opts.cols || 4);
  const rows = Math.max(1, opts.rows || 2);
  const now = opts.now ?? Date.now();
  /** @type {Record<string, ReturnType<typeof createEmptyPlot>>} */
  const plots = {};
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      plots[plotKey(c, r)] = createEmptyPlot(now);
    }
  }
  const gardenType = opts.gardenType === 'herb' ? 'herb' : 'default';
  return {
    classId: 'garden_new',
    label: gardenType === 'herb' ? 'Herb Garden' : 'Crop Garden',
    gardenType,
    cols,
    rows,
    plots,
    source: 'GSJS garden_new + include/garden.js (simplified)',
  };
}

/**
 * @param {ReturnType<typeof createGarden>} garden
 * @param {string} key
 */
export function getPlot(garden, key) {
  return garden?.plots?.[key] || null;
}

/**
 * Advance growth timers for wet planted plots.
 * @param {ReturnType<typeof createGarden>} garden
 * @param {number} [now]
 * @returns {string[]} plot keys that changed stage
 */
export function tickGarden(garden, now = Date.now()) {
  if (!garden?.plots) return [];
  const changed = [];
  for (const [key, plot] of Object.entries(garden.plots)) {
    if (!plot.wet) continue;
    if (plot.state !== 'seeds' && plot.state !== 'shoots') continue;
    const seed = SEED_CATALOG[plot.seed];
    if (!seed) continue;
    const need =
      plot.state === 'seeds'
        ? seed.grow1Ms * (plot.growModifier || 1)
        : seed.grow2Ms * (plot.growModifier || 1);
    const started =
      typeof plot.stageStartedAt === 'number' ? plot.stageStartedAt : now;
    const elapsed = now - started;
    if (elapsed < need) continue;
    if (plot.state === 'seeds') {
      plot.state = 'shoots';
      plot.stageStartedAt = now;
      changed.push(key);
    } else if (plot.state === 'shoots') {
      plot.state = 'crop';
      plot.stageStartedAt = now;
      changed.push(key);
    }
  }
  return changed;
}

/**
 * Seasonal seeds (seed_base getDescExtras: "This item is seasonal. It can
 * only be grown during the appropriate holidays."): Pumpkin Seeds plant only
 * during Zilloween. js/features/seasons-feature.js installs the season test;
 * until it does every seed is in season.
 */
export const SEASONAL_SEEDS = Object.freeze({ seed_pumpkin: 'zilloween' });
let seasonalSeedCheck = () => true;

/** @param {(seedId: string, season: string) => boolean} fn */
export function setSeasonalSeedCheck(fn) {
  seasonalSeedCheck = typeof fn === 'function' ? fn : () => true;
}

/** Whether a seed may be planted today. */
export function seedInSeason(seedId) {
  const season = SEASONAL_SEEDS[seedId];
  return !season || seasonalSeedCheck(seedId, season) !== false;
}

/**
 * Seeds in pack that match this garden type (crop vs herb).
 * @param {import('./inventory.js').Inventory} inv
 * @param {'default'|'herb'|string} [gardenType='default']
 * @returns {SeedDef[]}
 */
export function listPlantableSeeds(inv, gardenType = 'default') {
  ensureGardenItems();
  const want = gardenType === 'herb' ? 'herb' : 'default';
  return Object.values(SEED_CATALOG).filter(
    (s) => s.gardenType === want && countItem(inv, s.seedId) > 0 && seedInSeason(s.seedId)
  );
}

/**
 * First seed the player has that can be planted in this garden type.
 * @param {import('./inventory.js').Inventory} inv
 * @param {string} [preferSeedId]
 * @param {'default'|'herb'|string} [gardenType]
 */
export function pickSeedToPlant(inv, preferSeedId, gardenType = 'default') {
  const want = gardenType === 'herb' ? 'herb' : 'default';
  if (
    preferSeedId &&
    SEED_CATALOG[preferSeedId] &&
    SEED_CATALOG[preferSeedId].gardenType === want &&
    countItem(inv, preferSeedId) > 0 &&
    seedInSeason(preferSeedId)
  ) {
    return SEED_CATALOG[preferSeedId];
  }
  return listPlantableSeeds(inv, want)[0] || null;
}

/**
 * @param {SeedDef} seed
 * @param {'default'|'herb'|string} gardenType
 */
export function seedFitsGarden(seed, gardenType) {
  if (!seed) return false;
  const want = gardenType === 'herb' ? 'herb' : 'default';
  return seed.gardenType === want;
}

function spendEnergy(pc, cost) {
  if ((pc.energy || 0) <= cost) {
    return { ok: false, reason: 'energy', msgs: [`Need ${cost} energy (have ${Math.floor(pc.energy || 0)}).`] };
  }
  pc.energy = Math.max(0, (pc.energy || 0) - cost);
  return { ok: true, energy: -cost };
}

/**
 * Plant a seed in a clean plot.
 * @param {ReturnType<typeof createGarden>} garden
 * @param {string} key
 * @param {import('./inventory.js').Inventory} inv
 * @param {object} pc
 * @param {string} [seedId]
 * @param {{ now?: number }} [opts]
 */
export function plantPlot(garden, key, inv, pc, seedId, opts = {}) {
  ensureGardenItems();
  const plot = getPlot(garden, key);
  if (!plot) return { ok: false, reason: 'plot', msgs: ['No such plot.'] };
  if (plot.state !== 'clean') {
    return { ok: false, reason: 'state', msgs: ['That plot is not ready to plant.'] };
  }
  const gType = garden.gardenType || 'default';
  const seed = pickSeedToPlant(inv, seedId, gType);
  if (!seed && Object.keys(SEASONAL_SEEDS).some((id) => countItem(inv, id) > 0 && !seedInSeason(id))) {
    return {
      ok: false,
      reason: 'season',
      msgs: ['Pumpkin Seeds are seasonal. They can only be grown during Zilloween.'],
    };
  }
  if (!seed) {
    return {
      ok: false,
      reason: 'seed',
      msgs: [
        gType === 'herb'
          ? 'You need herb seeds for this garden.'
          : 'You need crop seeds in your pack.',
      ],
    };
  }
  if (!seedFitsGarden(seed, gType)) {
    return {
      ok: false,
      reason: 'wrong_garden',
      msgs: [
        gType === 'herb'
          ? 'Only herb seeds go in an herb garden.'
          : 'Only crop seeds go in a crop garden.',
      ],
    };
  }
  const profile = gardenActionProfile(gType, 'plant', opts.learned, opts.upgrades);
  const cost = profile.energy;
  const er = spendEnergy(pc, cost);
  if (!er.ok) return er;
  if (!removeItem(inv, seed.seedId, 1)) {
    pc.energy = (pc.energy || 0) + cost;
    return { ok: false, reason: 'seed', msgs: ['Not enough seeds.'] };
  }
  applyGardenRewards(pc, profile);
  const now = opts.now ?? Date.now();
  plot.state = 'seeds';
  plot.seed = seed.seedId;
  plot.stageStartedAt = now;
  // Growth Spurt / Speedy Herbs cards: crop or herb plots grow 10/20% faster
  // (include/garden.js plot grow_modifier, set at planting).
  plot.growModifier = 1 - gardenGrowModifier(
    seed.gardenType === 'herb' ? 'herb' : 'default',
    opts.upgrades || pc?.imaginationUpgrades || []
  );
  // Fresh plant starts dry — water to grow (matches original wet check)
  plot.wet = false;
  return {
    ok: true,
    reason: 'planted',
    plotKey: key,
    seedId: seed.seedId,
    cropId: seed.cropId,
    profile,
    msgs: [`You planted ${seed.label} in plot ${key}.`],
    effects: profile.legacy
      ? { energy: -cost }
      : { energy: -cost, mood: profile.mood, xp: profile.xp },
  };
}

/**
 * Water a plot (sets wet so growth can advance).
 * Requires watering_can unless opts.requireTool === false.
 * @param {ReturnType<typeof createGarden>} garden
 * @param {string} key
 * @param {object} pc
 * @param {{ now?: number, inv?: import('./inventory.js').Inventory, requireTool?: boolean }} [opts]
 */
export function waterPlot(garden, key, pc, opts = {}) {
  const plot = getPlot(garden, key);
  if (!plot) return { ok: false, reason: 'plot', msgs: ['No such plot.'] };
  if (plot.state === 'clean' || plot.state === 'dirty') {
    return { ok: false, reason: 'state', msgs: ['Nothing growing there to water.'] };
  }
  if (plot.wet) {
    return { ok: false, reason: 'wet', msgs: ['That plot is already wet.'] };
  }
  const requireTool = opts.requireTool !== false;
  if (requireTool && opts.inv && !hasWateringCan(opts.inv)) {
    return {
      ok: false,
      reason: 'tool',
      msgs: ['You need a Watering Can to water plots.'],
    };
  }
  const toolId = opts.inv
    ? countItem(opts.inv, 'watering_can') >= 1
      ? 'watering_can'
      : countItem(opts.inv, 'irrigator_9000') >= 1
        ? 'irrigator_9000'
        : null
    : null;
  const profile = gardenActionProfile(garden.gardenType, 'water', opts.learned, opts.upgrades);
  if (requireTool && toolId && opts.toolState) {
    const toolCheck = canUseTool(opts.toolState, toolId, profile.toolWear);
    if (!toolCheck.ok) {
      return { ok: false, reason: 'broken_tool', msgs: [toolCheck.msg], toolCheck };
    }
  }
  const cost = profile.energy;
  const er = spendEnergy(pc, cost);
  if (!er.ok) return er;
  if (!rollSucceeds(profile, opts)) {
    // Source: a failed water still costs the package energy plus 3 mood.
    const moodLost = Math.min(GARDEN_WATER_FAIL_MOOD, Math.max(0, pc.mood || 0));
    if (pc.mood != null) pc.mood = (pc.mood || 0) - moodLost;
    return {
      ok: false,
      reason: 'failed',
      plotKey: key,
      profile,
      msgs: [`${GARDEN_WATER_FAILED_LINE} (−${cost} energy, −${moodLost} mood)`],
      effects: { energy: -cost, mood: -moodLost },
    };
  }
  applyGardenRewards(pc, profile);
  const now = opts.now ?? Date.now();
  plot.wet = true;
  // Restart stage timer when re-wetting (GSJS restarts grow on water)
  plot.stageStartedAt = now;
  const toolUse = requireTool && toolId && opts.toolState
    ? useToolCondition(opts.toolState, toolId, profile.toolWear)
    : null;
  return {
    ok: true,
    reason: 'watered',
    plotKey: key,
    profile,
    msgs: ['You watered a plot.', ...(toolUse?.broke ? [toolUse.msg] : [])],
    effects: profile.legacy
      ? { energy: -cost, mood: 1 }
      : { energy: -cost, mood: profile.mood, xp: profile.xp },
    toolUse,
  };
}

/**
 * Harvest a ripe crop plot → dirty + add produce to pack.
 */
export function harvestPlot(garden, key, inv, pc, opts = {}) {
  ensureGardenItems();
  const plot = getPlot(garden, key);
  if (!plot) return { ok: false, reason: 'plot', msgs: ['No such plot.'] };
  if (plot.state !== 'crop' || !plot.seed) {
    return { ok: false, reason: 'state', msgs: ['Nothing ready to harvest.'] };
  }
  const seed = SEED_CATALOG[plot.seed];
  if (!seed) {
    return { ok: false, reason: 'seed', msgs: ['Unknown crop.'] };
  }
  const profile = gardenActionProfile(garden.gardenType, 'harvest', opts.learned, opts.upgrades);
  const cost = profile.energy;
  if ((pc.energy || 0) <= cost) {
    return { ok: false, reason: 'energy', msgs: [`Need ${cost} energy (have ${Math.floor(pc.energy || 0)}).`] };
  }
  const rng = opts.rng || Math.random;
  if (!rollSucceeds(profile, opts)) {
    // Source: a failed pick costs nothing and leaves the crop in the ground.
    const lines = GARDEN_HARVEST_FAILED_LINES[profile.gardenType];
    return {
      ok: false,
      reason: 'failed',
      plotKey: key,
      profile,
      msgs: [lines[Math.floor(rng() * lines.length) % lines.length]],
    };
  }
  pc.energy = Math.max(0, (pc.energy || 0) - cost);
  // Players without Croppery I / Herbalism I receive half (rounded).
  const n = profile.halfHarvest ? Math.round(seed.produces / 2) : seed.produces;
  let bonus = 0;
  if (
    profile.bonusMultiplier &&
    profile.bonusChance &&
    (opts.maxLuck || rng() < profile.bonusChance)
  ) {
    bonus = n * (profile.bonusMultiplier - 1);
  }
  addItem(inv, seed.cropId, n + bonus);
  if (profile.legacy) {
    if (pc.mood != null) pc.mood = Math.min(moodMax(pc), (pc.mood || 0) + 2);
    if (pc.imagination != null) pc.imagination = (pc.imagination || 0) + 2;
    if (pc.xp != null) pc.xp = (pc.xp || 0) + 2;
  } else {
    applyGardenRewards(pc, profile);
  }
  const now = opts.now ?? Date.now();
  plot.state = 'dirty';
  plot.seed = null;
  plot.wet = false;
  plot.stageStartedAt = now;
  return {
    ok: true,
    reason: 'harvested',
    plotKey: key,
    cropId: seed.cropId,
    count: n + bonus,
    baseCount: n,
    bonusCount: bonus,
    superHarvest: bonus > 0,
    profile,
    msgs: [
      `You harvested ${n}× ${seed.cropLabel}.`,
      ...(bonus ? [`Super Harvest! +${bonus}× ${seed.cropLabel}.`] : []),
    ],
    effects: {
      energy: -cost,
      mood: profile.legacy ? 2 : profile.mood,
      xp: profile.legacy ? 2 : profile.xp,
      items: { [seed.cropId]: n + bonus },
    },
  };
}

/**
 * Clear a dirty plot → clean (hoe).
 * Requires hoe unless opts.requireTool === false.
 * @param {ReturnType<typeof createGarden>} garden
 * @param {string} key
 * @param {object} pc
 * @param {{ now?: number, inv?: import('./inventory.js').Inventory, requireTool?: boolean }} [opts]
 */
export function clearPlot(garden, key, pc, opts = {}) {
  const plot = getPlot(garden, key);
  if (!plot) return { ok: false, reason: 'plot', msgs: ['No such plot.'] };
  if (plot.state !== 'dirty') {
    return { ok: false, reason: 'state', msgs: ['That plot does not need clearing.'] };
  }
  const requireTool = opts.requireTool !== false;
  if (requireTool && opts.inv && !hasHoe(opts.inv)) {
    return {
      ok: false,
      reason: 'tool',
      msgs: ['You need a Hoe to clear dirty plots.'],
    };
  }
  const toolId = opts.inv
    ? countItem(opts.inv, 'hoe') >= 1
      ? 'hoe'
      : countItem(opts.inv, 'hoe_highclass') >= 1
        ? 'hoe_highclass'
        : null
    : null;
  const profile = gardenActionProfile(garden.gardenType, 'clear', opts.learned, opts.upgrades);
  if (requireTool && toolId && opts.toolState) {
    const toolCheck = canUseTool(opts.toolState, toolId, profile.toolWear);
    if (!toolCheck.ok) {
      return { ok: false, reason: 'broken_tool', msgs: [toolCheck.msg], toolCheck };
    }
  }
  const cost = profile.energy;
  const er = spendEnergy(pc, cost);
  if (!er.ok) return er;
  applyGardenRewards(pc, profile);
  const now = opts.now ?? Date.now();
  plot.state = 'clean';
  plot.seed = null;
  plot.wet = false;
  plot.stageStartedAt = now;
  const toolUse = requireTool && toolId && opts.toolState
    ? useToolCondition(opts.toolState, toolId, profile.toolWear)
    : null;
  return {
    ok: true,
    reason: 'cleared',
    plotKey: key,
    profile,
    msgs: ['You cleared a plot. Ready to plant.', ...(toolUse?.broke ? [toolUse.msg] : [])],
    effects: profile.legacy
      ? { energy: -cost }
      : { energy: -cost, mood: profile.mood, xp: profile.xp },
    toolUse,
  };
}

/**
 * Best default action for a plot (for one-click tend helpers).
 * @param {ReturnType<typeof createEmptyPlot>} plot
 * @param {import('./inventory.js').Inventory} inv
 * @param {'default'|'herb'|string} [gardenType]
 */
export function suggestedPlotAction(plot, inv, gardenType = 'default') {
  if (!plot) return null;
  if (plot.state === 'dirty') return 'clear';
  if (plot.state === 'clean') {
    return listPlantableSeeds(inv, gardenType).length ? 'plant' : null;
  }
  if (plot.state === 'crop') return 'harvest';
  if ((plot.state === 'seeds' || plot.state === 'shoots') && !plot.wet) return 'water';
  return null;
}

/**
 * Run suggested action on a plot.
 * Passes inv into water/clear for tool checks.
 */
export function tendPlot(garden, key, inv, pc, opts = {}) {
  const plot = getPlot(garden, key);
  const gType = garden?.gardenType || 'default';
  const action = suggestedPlotAction(plot, inv, gType);
  if (!action) {
    return { ok: false, reason: 'noop', msgs: ['Nothing to do on that plot right now.'] };
  }
  const toolOpts = { ...opts, inv };
  if (action === 'plant') return plantPlot(garden, key, inv, pc, opts.seedId, toolOpts);
  if (action === 'water') return waterPlot(garden, key, pc, toolOpts);
  if (action === 'harvest') return harvestPlot(garden, key, inv, pc, toolOpts);
  if (action === 'clear') return clearPlot(garden, key, pc, toolOpts);
  return { ok: false, reason: 'unknown', msgs: ['Unknown garden action.'] };
}

/**
 * Water every dry growing plot (potion_garden_water style, simplified).
 * @param {ReturnType<typeof createGarden>} garden
 * @param {object} pc
 * @param {{ now?: number, inv?: import('./inventory.js').Inventory, requireTool?: boolean }} [opts]
 */
export function waterAllPlots(garden, pc, opts = {}) {
  const requireTool = opts.requireTool !== false;
  if (requireTool && opts.inv && !hasWateringCan(opts.inv)) {
    return {
      ok: false,
      watered: 0,
      reason: 'tool',
      msgs: ['You need a Watering Can to water plots.'],
    };
  }
  let n = 0;
  let spent = 0;
  let failed = 0;
  const msgs = [];
  for (const key of Object.keys(garden.plots || {})) {
    const r = waterPlot(garden, key, pc, opts);
    if (r.ok) {
      n += 1;
      spent += -(r.effects?.energy || 0);
      if (r.msgs?.[0]) msgs.push(r.msgs[0]);
    } else if (r.reason === 'failed') {
      failed += 1;
      spent += -(r.effects?.energy || 0);
    } else if (r.reason === 'energy') {
      return {
        ok: n > 0,
        watered: n,
        reason: n > 0 ? 'partial' : 'energy',
        msgs: n > 0 ? [`Watered ${n} plot(s) before running out of energy.`] : r.msgs,
      };
    } else if (r.reason === 'tool' || r.reason === 'broken_tool') {
      return {
        ok: n > 0,
        watered: n,
        reason: n > 0 ? 'partial' : r.reason,
        msgs: n > 0 ? [`Watered ${n} plot(s) before the Watering Can gave out.`, ...(r.msgs || [])] : r.msgs,
      };
    }
  }
  if (!n && failed) {
    return { ok: false, watered: 0, failed, reason: 'failed', msgs: [GARDEN_WATER_FAILED_LINE] };
  }
  if (!n) return { ok: false, watered: 0, reason: 'none', msgs: ['No dry plots need water.'] };
  return {
    ok: true,
    watered: n,
    failed,
    msgs: [
      `You watered ${n} plot(s).`,
      ...(failed ? [`${failed} plot(s) stayed dry. ${GARDEN_WATER_FAILED_LINE}`] : []),
    ],
    effects: { energy: -spent },
  };
}

/**
 * Human-readable plot status for UI.
 * @param {ReturnType<typeof createEmptyPlot>} plot
 */
export function plotStatusLabel(plot) {
  if (!plot) return '—';
  const seed = plot.seed ? SEED_CATALOG[plot.seed] : null;
  const crop = seed?.cropLabel || '';
  switch (plot.state) {
    case 'clean':
      return 'Clean · ready to plant';
    case 'seeds':
      return `${crop} seeds${plot.wet ? ' · wet' : ' · needs water'}`;
    case 'shoots':
      return `${crop} shoots${plot.wet ? ' · wet' : ' · needs water'}`;
    case 'crop':
      return `${crop} ready to harvest!`;
    case 'dirty':
      return 'Dirty · clear to plant';
    default:
      return plot.state;
  }
}

/**
 * Progress 0–1 for current grow stage (UI bar).
 */
export function plotGrowProgress(plot, now = Date.now()) {
  if (!plot || (plot.state !== 'seeds' && plot.state !== 'shoots')) return 0;
  if (!plot.wet) return 0;
  const seed = SEED_CATALOG[plot.seed];
  if (!seed) return 0;
  const need =
    plot.state === 'seeds'
      ? seed.grow1Ms * (plot.growModifier || 1)
      : seed.grow2Ms * (plot.growModifier || 1);
  if (need <= 0) return 1;
  // stageStartedAt may be 0 in tests — do not treat as missing
  const started =
    typeof plot.stageStartedAt === 'number' ? plot.stageStartedAt : now;
  return Math.min(1, Math.max(0, (now - started) / need));
}

/**
 * Ordered plot keys row-major.
 * @param {ReturnType<typeof createGarden>} garden
 */
export function listPlotKeys(garden) {
  const keys = [];
  for (let r = 1; r <= garden.rows; r++) {
    for (let c = 1; c <= garden.cols; c++) {
      keys.push(plotKey(c, r));
    }
  }
  return keys;
}

export function seedIcon(seedId) {
  return itemIcon(seedId);
}

export function cropIcon(cropId) {
  return itemIcon(cropId);
}
