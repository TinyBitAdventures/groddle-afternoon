/**
 * Crop gardens — simplified from GSJS items/include/garden.js + seed_*.js.
 *
 * Plot states (original): clean → seeds → shoots → crop → dirty → (clear) clean
 * Growth only advances while wet. Watering keeps a plot wet for 12 hours
 * (timings.water); a plot that dries pauses its growth until watered again.
 * Wetness carries over through picking, hoeing and replanting.
 *
 * Grow timings are demo-scaled seconds (original used hours × garden_grow_multiplier).
 * Produce counts are the GSJS seed classProps produces_count.
 */

import { addItem, removeItem, countItem, ensureItem, itemIcon } from './inventory.js?v=catalog-unified-3';
import { HOE_TOOLS, canUseTool, firstWorkingTool, useToolCondition } from './tools.js?v=tools-4';
import { skillPackageDetails } from './skill-packages.js';
import { gardenGrowModifier } from './imagination-effects.js';
import { moodMax } from './metabolics.js';
import { grantMoodXp } from './mood-xp.js';

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
/** include/garden.js timings.water: hours a watering lasts (not grow-scaled). */
export const GARDEN_WATER_MS = 12 * 60 * 60 * 1000;

/** Growth so far in the plot's current stage, paused while dry. */
export function stageElapsedMs(plot, now = Date.now()) {
  const banked = Math.max(0, Number(plot?.growthMs) || 0);
  if (!plot?.wet) return banked;
  // stageStartedAt may be 0 in tests — do not treat as missing
  const started = typeof plot.stageStartedAt === 'number' ? plot.stageStartedAt : now;
  return banked + Math.max(0, now - started);
}

/** Water a plot: restart a paused stage clock and the 12-hour dry timer. */
export function wetPlot(plot, now = Date.now()) {
  if (!plot.wet) plot.stageStartedAt = now;
  plot.wet = true;
  plot.wetAt = now;
}

/** stateChanged('dry'): bank the stage's growth and stop the clock. */
function dryPlot(plot, at) {
  if (plot.state === 'seeds' || plot.state === 'shoots') {
    const started = typeof plot.stageStartedAt === 'number' ? plot.stageStartedAt : at;
    plot.growthMs = Math.max(0, Number(plot.growthMs) || 0) + Math.max(0, at - started);
  }
  plot.stageStartedAt = at;
  plot.wet = false;
  plot.wetAt = null;
}

/** Enter a new stage (or plant/clear): its clock starts now. */
function startStage(plot, now) {
  plot.stageStartedAt = now;
  plot.growthMs = 0;
}

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
    produces: 12,
    grow1H: 0.5,
    grow2H: 0.25,
    gardenType: 'default',
  }),
  seed_onion: seedDef({
    seedId: 'seed_onion',
    label: 'Onion Seed',
    cropId: 'onion',
    cropLabel: 'Onion',
    produces: 12,
    grow1H: 1,
    grow2H: 0.5,
    gardenType: 'default',
  }),
  seed_tomato: seedDef({
    seedId: 'seed_tomato',
    label: 'Tomato Seed',
    cropId: 'tomato',
    cropLabel: 'Tomato',
    produces: 14,
    grow1H: 2.5,
    grow2H: 2.5,
    gardenType: 'default',
  }),
  seed_carrot: seedDef({
    seedId: 'seed_carrot',
    label: 'Carrot Seed',
    cropId: 'carrot',
    cropLabel: 'Carrot',
    produces: 14,
    grow1H: 3.5,
    grow2H: 3.5,
    gardenType: 'default',
  }),
  seed_corn: seedDef({
    seedId: 'seed_corn',
    label: 'Corn Seed',
    cropId: 'corn',
    cropLabel: 'Corn',
    produces: 12,
    grow1H: 3,
    grow2H: 3,
    gardenType: 'default',
  }),
  seed_potato: seedDef({
    seedId: 'seed_potato',
    label: 'Potato Seed',
    cropId: 'potato',
    cropLabel: 'Potato',
    produces: 18,
    grow1H: 6,
    grow2H: 5.5,
    gardenType: 'default',
  }),
  seed_rice: seedDef({
    seedId: 'seed_rice',
    label: 'Rice Seed',
    cropId: 'rice',
    cropLabel: 'Rice',
    produces: 12,
    grow1H: 0.75,
    grow2H: 0.5,
    gardenType: 'default',
  }),
  seed_cucumber: seedDef({
    seedId: 'seed_cucumber',
    label: 'Cucumber Seed',
    cropId: 'cucumber',
    cropLabel: 'Cucumber',
    produces: 17,
    grow1H: 1.5,
    grow2H: 1.5,
    gardenType: 'default',
  }),
  seed_parsnip: seedDef({
    seedId: 'seed_parsnip',
    label: 'Parsnip Seed',
    cropId: 'parsnip',
    cropLabel: 'Parsnip',
    produces: 12,
    grow1H: 2.5,
    grow2H: 2.5,
    gardenType: 'default',
  }),
  seed_broccoli: seedDef({
    seedId: 'seed_broccoli',
    label: 'Broccoli Seed',
    cropId: 'broccoli',
    cropLabel: 'Broccoli',
    produces: 16,
    grow1H: 3.5,
    grow2H: 3.5,
    gardenType: 'default',
  }),
  seed_zucchini: seedDef({
    seedId: 'seed_zucchini',
    label: 'Zucchini Seed',
    cropId: 'zucchini',
    cropLabel: 'Zucchini',
    produces: 23,
    grow1H: 4,
    grow2H: 4,
    gardenType: 'default',
  }),
  seed_cabbage: seedDef({
    seedId: 'seed_cabbage',
    label: 'Cabbage Seed',
    cropId: 'cabbage',
    cropLabel: 'Cabbage',
    produces: 14,
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

/**
 * garden_new.js `responses` (406-633): every plot talkback pool, verbatim.
 * item.js chooseResponse picks one line at random (choose_one); sendResponse
 * shows it in a 3,500 ms bubble over the plot with the action's slugs.
 */
export const GARDEN_TALKBACKS = Object.freeze({
  broken_hoe: Object.freeze([
    "That's one broken down hoe.",
    "Woah! You've cracked your hoe.",
    "Hoe no.",
  ]),
  broken_watering_can: Object.freeze([
    "I think you've cracked your can.",
    "Hey, your spout is futzed.",
    "Watering can? Watering can't, more like.",
  ]),
  crop_clear: Object.freeze([
    "Yeeaaah...",
    "Always feels better when a friend does it.",
    "Good scritchings.",
    "Mmmm. Scratchy.",
    "All clean!",
    "Better.",
    "Nice. And clean.",
    "Feels nicererer.",
  ]),
  crop_clear_drop_large: Object.freeze([
    "It's dangerous to go alone! Take this.",
    "Hey, look what I found in my soil.",
    "Hoe-ly gift unearthing, Glitchling!",
    "Because you unurthed it.",
  ]),
  crop_clear_drop_small: Object.freeze([
    "Hoe hoe hoe! You hoed up a thing!",
    "You look like you could use this. What is it?",
    "Ta dah! It is a THING! For YOU!",
    "Little thing for you. For thanks.",
  ]),
  crop_fertilize: Object.freeze([
    "Nutrientized!",
    "Woo! Batstuff!",
    "Smelly.",
    "NNNNNGGGG! I am growing Very Hard!",
    "Look at me! I'm GROWING!",
    "Wheeeeee!",
  ]),
  crop_harvest: Object.freeze([
    "Here! Fruits... no, um, cropses of your labour.",
    "Those'll make your hair curly.",
    "I made these! Just for you.",
    "I made you eaty stuff.",
    "Look! Foodstuffs!",
    "Happy Cropday!",
    "Look, seeds turned all into these!",
    "These will put hair on your chest. Maybe. Maybe just upper arms.",
    "Oh croppy day!",
    "Noms.",
  ]),
  crop_harvest_2x: Object.freeze([
    "A little extra…",
    "You got lucky!",
    "Oooh, big cropsies!",
    "Dedicated crop-planters deserve happy croppy rewards.",
  ]),
  crop_harvest_3x: Object.freeze([
    "I didn't think I had it in me!",
    "Bumper cropsies!",
    "Maxi-sized croppables!",
    "Croppabanzai!",
  ]),
  crop_harvest_4x: Object.freeze([
    "You gonna eat all those?",
    "Super-ooper-doooper cropsies!",
    "Supersized croppsicle joy!",
    "Croppabonanza!",
  ]),
  crop_harvest_drop: Object.freeze([
    "You'll never get me lucky charms.",
    "Mmmm, tasty rainbows!",
    "Pyew!  Rainbow!  Pyew pyew!",
  ]),
  crop_harvest_na_failed: Object.freeze([
    "No. I like these. You can't have them.",
    "Say please.",
    "You mis-picked. You picked nothin'. Try harder, picky-picker.",
  ]),
  crop_plant: Object.freeze([
    "Consider me seeded.",
    "Good planting!",
    "That tickles!",
    "I am super-seedy!",
    "Yay!",
    "Nom nom nom nom nom.",
    "Mmm. Seedy.",
    "Ohhhhh. I will GROW this!",
    "Hee! Tickly in my seed-tumkin!",
    "Ah. Planting the seeds of tomorrow, today.",
  ]),
  crop_plant_drop_large: Object.freeze([
    "I don't have room for this too. You take this.",
    "Hey, look what I found in my soil! Crazy!",
    "Seeds need room to grow. This too big. You take.",
    "You have this.",
  ]),
  crop_plant_drop_small: Object.freeze([
    "I don't want this anymore. You have!",
    "You look like Glitchling that could make use of this.",
    "I found a thing!",
    "Oooh, goodies. For you!",
  ]),
  crop_water: Object.freeze([
    "Wet!",
    "I'm Wet!",
    "You wet me.",
    "Oh I'm all wet.",
    "Splosh.",
    "Wetted.",
    "Oh!",
    "I am wet!",
    "Ooh! Wet!",
    "Jeepers, that's moist.",
  ]),
  crop_water_drop_large: Object.freeze([
    "Oooh, have that special card, do you? Here, have this too.",
    "Pizzazzy watering! I give you treat.",
    "This washed to surface. Want it?",
    "Water dislodged thing. Don't want it.",
  ]),
  crop_water_drop_small: Object.freeze([
    "Good things come to those who water.",
    "For your trouble, little cloud.",
    "Look! I found you this!",
    "Found thing for you! It is a bit damp.",
  ]),
  crop_water_na_failed: Object.freeze([
    "Oh. Water everywhere. Everywhere but on me. Try again.",
    "You missed.",
    "Aim better! I am not wet!",
  ]),
  herb_clear: Object.freeze([
    "Smooth.",
    "Fresh.",
    "I feel like a new plot!",
    "Plant me up!",
    "I'm ready.",
    "Left a bit? Ahhh.",
    "Nice work, hoe-meister.",
    "Ahhh, all hoed up.",
  ]),
  herb_clear_drop: Object.freeze([
    "Take this for your trouble. And get shucking.",
    "You de-soiled this with your red hot hoeing!",
    "*COUGH*. Woah! You dislodged this!",
    "What the…?!? Oh, just take it.",
  ]),
  herb_fertilize: Object.freeze([
    "Mmm, smells like nutrients.",
    "Heady. Strong. POWER FILLED.",
    "Stand back, I'm growing.",
    "AlakaZAM.",
    "I feel… mighty.",
    "Guano? Oooh, I'm getting angry. You'll like me when I'm angry.",
  ]),
  herb_harvest: Object.freeze([
    "Herbs!",
    "Erbs!",
    "Bitter to the tongue, sweet to the mind.",
    "Be wise.",
    "Be happy.",
    "Just say yes.",
    "Here's your herbs.",
    "'Ere's your 'erbs.",
    "That *ahem* stuff you wanted.",
    "It's herb o'clock. Woo.",
  ]),
  herb_harvest_2x: Object.freeze([
    "Herbal bonus.",
    "More! More herbs!",
    "POW! Herb it up!",
    "Herb THIS.",
  ]),
  herb_harvest_3x: Object.freeze([
    "DAYAM!",
    "Are you ready? It's the Motherlode of herbs. The motherbalode!",
    "Herbs! All the herbs!",
    "High time for heavy herbal bonus? HELL YEAH.",
  ]),
  herb_harvest_na_failed: Object.freeze([
    "Nooooo. My precious! Cannot take my precious herbs. Mineses.",
    "Hoe no. Hoe no no no.",
    "The roots run deep on this one.",
  ]),
  herb_plant: Object.freeze([
    "Wahey!",
    "Wow. Planty.",
    "Hot seed action.",
    "Ahhh.",
    "*Gulp*",
    "Yowzers.",
    "Seedy.",
    "I like it seedy.",
    "Munch munch munch.",
    "That's one big seed.",
  ]),
  herb_plant_drop: Object.freeze([
    "Hey, look what I found in my soil.",
    "Yowza! How'd THAT get there?",
    "Take this. Might want to wipe it off first.",
    "Shhh. Take this. Say nothing.",
  ]),
  herb_water: Object.freeze([
    "Mmm... electrolytes.",
    "Niiiiiiice.",
    "Ahh.",
    "Cool.",
    "Good. Mmmm.",
    "Spoosh.",
    "Ahhhhhh.",
    "I like it wet.",
    "Blublublub.",
    "Right on.",
  ]),
  herb_water_drop: Object.freeze([
    "This bubbled up. Have it.",
    "*Burrrrrrp*",
    "*Cough* Oh! Will you look at that?",
    "I don't want to get this wet. Take it.",
  ]),
  herb_water_na_failed: Object.freeze([
    "Dry as a bone.",
    "Dry, friend. Try again.",
    "Somehow, you missed. I'm as mystified as you.",
  ]),
});

/** garden_new.js `*_harvest_na_failed` talkbacks (75% no-skill success roll). */
export const GARDEN_HARVEST_FAILED_LINES = Object.freeze({
  default: GARDEN_TALKBACKS.crop_harvest_na_failed,
  herb: GARDEN_TALKBACKS.herb_harvest_na_failed,
});

/** item.js sendResponse: sendBubble(choice, 3500, pc, slugs). */
export const GARDEN_TALKBACK_MS = 3500;

/**
 * include/garden.js talkback_key for a finished (or failed) plot action.
 * The prefix is crop_/herb_ only with Croppery I / Herbalism I for water and
 * plant; hoeing (args.action 'hoe', never 'clear') and picking always talk.
 * Fertilizing sets talkback_key = null, so it never talks. The harvest suffix
 * follows the player's upgrades and Croppery III, not the roll itself.
 * @param {'default'|'herb'|string} gardenType
 * @param {'plant'|'water'|'harvest'|'clear'|'fertilize'} action
 * @param {{ learned?: string[], upgrades?: string[], gotDrop?: boolean, failed?: boolean }} [opts]
 * @returns {string|null}
 */
export function gardenTalkbackKey(gardenType, action, opts = {}) {
  const herb = gardenType === 'herb';
  const learned = Array.isArray(opts.learned) ? opts.learned : [];
  const upgrades = Array.isArray(opts.upgrades) ? opts.upgrades : [];
  const has = (id) => upgrades.includes(id);
  if (action === 'fertilize') return null;
  const skilled = learned.includes(herb ? 'herbalism_1' : 'croppery_1');
  if (!skilled && (action === 'water' || action === 'plant')) return null;
  let key = `${herb ? 'herb' : 'crop'}_${action}`;
  if (opts.failed) return action === 'water' || action === 'harvest' ? `${key}_na_failed` : null;
  if (action === 'water' || action === 'clear') {
    if (opts.gotDrop) {
      if (herb) key += '_drop';
      else if (has('croppery_growing_drop_1')) key += '_drop_small';
      else if (has('croppery_growing_drop_2')) key += '_drop_large';
    }
  } else if (action === 'plant') {
    if (opts.gotDrop) key += herb ? '_drop' : '_drop_small';
  } else if (action === 'harvest') {
    if (opts.gotDrop && !herb) key += '_drop';
    else if (herb) {
      if (has('herbalism_super_harvest_2')) key += '_3x';
      else if (has('herbalism_super_harvest_1')) key += '_2x';
    } else if (has('croppery_super_harvest_2')) key += '_4x';
    else if (has('croppery_super_harvest_1')) key += '_3x';
    else if (learned.includes('croppery_3')) key += '_2x';
  }
  return GARDEN_TALKBACKS[key] ? key : null;
}

/**
 * The plot's speech for one action: a random line from the pool plus the
 * skill package slugs (energy spent, mood and iMG gained). Failures carry no
 * slugs (runSkillPackage returns before costs on a success-rate miss).
 * @returns {{ key: string, text: string, durationMs: number, slugs: { xp?: number, mood?: number, energy?: number }|null, failed?: boolean }|null}
 */
export function gardenTalkback(key, { rng, slugs = null, failed = false } = {}) {
  const pool = key ? GARDEN_TALKBACKS[key] : null;
  if (!pool?.length) return null;
  const text = pool[Math.floor((rng || Math.random)() * pool.length) % pool.length];
  let clean = null;
  if (slugs) {
    clean = {};
    for (const k of ['xp', 'mood', 'energy']) {
      const n = Math.round(Math.abs(Number(slugs[k]) || 0));
      if (n) clean[k] = n;
    }
    if (!Object.keys(clean).length) clean = null;
  }
  return { key, text, durationMs: GARDEN_TALKBACK_MS, slugs: clean, ...(failed ? { failed: true } : {}) };
}

function actionTalkback(garden, action, opts, slugs, extra = {}) {
  const key = gardenTalkbackKey(garden?.gardenType, action, {
    learned: opts.learned,
    upgrades: opts.upgrades,
    ...extra,
  });
  const talk = gardenTalkback(key, { rng: opts.talkRng, slugs, failed: !!extra.failed });
  if (talk) talk.speaker = garden?.gardenType === 'herb' ? 'Herb Garden plot' : 'Crop Garden plot';
  return talk;
}

/** include/garden.js water failure: package energy plus a flat 3 mood. */
export const GARDEN_WATER_FAIL_MOOD = 3;
export const GARDEN_WATER_FAILED_LINE = 'Oops. Somehow you failed at watering that. Try again?';

export const GARDEN_HOEING_UPGRADE = 'hoeing_more_img_more_wear';
export const GARDEN_HOEING_TABLE = Object.freeze([
  Object.freeze({ skill: 'croppery_3', xp: 8, wear: 5 }),
  Object.freeze({ skill: 'croppery_2', xp: 6, wear: 4 }),
  Object.freeze({ skill: 'croppery_1', xp: 4, wear: 3 }),
  Object.freeze({ skill: null, xp: 3, wear: 1.5 }),
]);

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
  let xp = Number(details.xp_bonus) || 0;
  let toolWear = Number(details.tool_wear) || 1;
  // include/garden.js clear: Aggressive Hoeing overrides xp_bonus and
  // multiplies Hoe wear by the player's Croppery rank (herb gardens too).
  if (action === 'clear' && Array.isArray(upgrades) && upgrades.includes(GARDEN_HOEING_UPGRADE)) {
    const row = GARDEN_HOEING_TABLE.find((r) => r.skill === null || learned.includes(r.skill));
    xp = row.xp;
    toolWear *= row.wear;
  }
  return {
    legacy: false,
    gardenType: type,
    action,
    package: packages[action],
    skill: details.skill === 'no_skill' ? null : details.skill || null,
    rank: Number.isFinite(details.rank) ? Math.max(0, details.rank) : 0,
    energy: Number(details.energy_cost) || 0,
    mood: Number(details.mood_bonus) || 0,
    xp,
    toolWear,
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

/** Applies the package's mood and iMG; returns what was actually added (the slugs). */
function applyGardenRewards(pc, profile) {
  const got = { mood: 0, xp: 0 };
  if (profile.legacy) return got;
  if (profile.mood && pc.mood != null) {
    const before = pc.mood || 0;
    pc.mood = Math.min(moodMax(pc), before + profile.mood);
    got.mood = Math.max(0, pc.mood - before);
  }
  // inc_skill_packages.js 532: xp_bonus takes the mood bonus (after the mood gain).
  if (profile.xp) got.xp = grantMoodXp(pc, profile.xp);
  return got;
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
  return HOE_TOOLS.some((id) => countItem(inv, id) >= 1);
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
    wetAt: null,
    stageStartedAt: now,
    growthMs: 0,
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
    if (typeof plot.wetAt !== 'number') plot.wetAt = now;
    const dryAt = plot.wetAt + GARDEN_WATER_MS;
    const at = Math.min(now, dryAt);
    const seed = SEED_CATALOG[plot.seed];
    if (seed && (plot.state === 'seeds' || plot.state === 'shoots')) {
      const need =
        plot.state === 'seeds'
          ? seed.grow1Ms * (plot.growModifier || 1)
          : seed.grow2Ms * (plot.growModifier || 1);
      if (stageElapsedMs(plot, at) >= need) {
        plot.state = plot.state === 'seeds' ? 'shoots' : 'crop';
        startStage(plot, at);
        changed.push(key);
      }
    }
    if (now >= dryAt) {
      dryPlot(plot, dryAt);
      if (!changed.includes(key)) changed.push(key);
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
  const got = applyGardenRewards(pc, profile);
  const now = opts.now ?? Date.now();
  plot.state = 'seeds';
  plot.seed = seed.seedId;
  startStage(plot, now);
  // Growth Spurt / Speedy Herbs cards: crop or herb plots grow 10/20% faster
  // (include/garden.js plot grow_modifier, set at planting).
  plot.growModifier = 1 - gardenGrowModifier(
    seed.gardenType === 'herb' ? 'herb' : 'default',
    opts.upgrades || pc?.imaginationUpgrades || []
  );
  // A plot still wet from before starts growing at once (include/garden.js plant).
  return {
    ok: true,
    reason: 'planted',
    plotKey: key,
    seedId: seed.seedId,
    cropId: seed.cropId,
    profile,
    msgs: [`You planted ${seed.label} in plot ${key}.`],
    speech: actionTalkback(garden, 'plant', opts, { energy: cost, ...got }),
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
      speech: gardenTalkback('broken_watering_can', { rng: opts.talkRng, failed: true }),
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
      const speech = gardenTalkback(HOE_TOOLS.includes(toolId) ? 'broken_hoe' : 'broken_watering_can', { rng: opts.talkRng, failed: true });
      return { ok: false, reason: 'broken_tool', msgs: [toolCheck.msg], toolCheck, speech };
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
      speech: actionTalkback(garden, 'water', opts, null, { failed: true }),
      effects: { energy: -cost, mood: -moodLost },
    };
  }
  const got = applyGardenRewards(pc, profile);
  const now = opts.now ?? Date.now();
  wetPlot(plot, now);
  const toolUse = requireTool && toolId && opts.toolState
    ? useToolCondition(opts.toolState, toolId, profile.toolWear)
    : null;
  return {
    ok: true,
    reason: 'watered',
    plotKey: key,
    profile,
    msgs: ['You watered a plot.', ...(toolUse?.broke ? [toolUse.msg] : [])],
    speech: actionTalkback(garden, 'water', opts, { energy: cost, ...got }),
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
    const line = lines[Math.floor(rng() * lines.length) % lines.length];
    return {
      ok: false,
      reason: 'failed',
      plotKey: key,
      profile,
      msgs: [line],
      // The pick always talks (talkback_key is set for 'pick' at every rank).
      speech: {
        key: `${profile.gardenType === 'herb' ? 'herb' : 'crop'}_harvest_na_failed`,
        speaker: profile.gardenType === 'herb' ? 'Herb Garden plot' : 'Crop Garden plot',
        text: line,
        durationMs: GARDEN_TALKBACK_MS,
        slugs: null,
        failed: true,
      },
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
  let got = { mood: 2, xp: 2 };
  if (profile.legacy) {
    if (pc.mood != null) pc.mood = Math.min(moodMax(pc), (pc.mood || 0) + 2);
    got.xp = grantMoodXp(pc, 2);
  } else {
    got = applyGardenRewards(pc, profile);
  }
  const now = opts.now ?? Date.now();
  plot.state = 'dirty';
  plot.seed = null;
  startStage(plot, now);
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
    speech: actionTalkback(garden, 'harvest', opts, { energy: cost, ...got }),
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
      speech: gardenTalkback('broken_hoe', { rng: opts.talkRng, failed: true }),
    };
  }
  const profile = gardenActionProfile(garden.gardenType, 'clear', opts.learned, opts.upgrades);
  // include/garden.js:233-238: a working High-Class Hoe first, then a Hoe.
  const hoe = opts.inv ? firstWorkingTool(opts.toolState, opts.inv, HOE_TOOLS, profile.toolWear) : null;
  const toolId = hoe ? hoe.tool || hoe.fallback : null;
  if (requireTool && toolId && opts.toolState) {
    const toolCheck = canUseTool(opts.toolState, toolId, profile.toolWear);
    if (!toolCheck.ok) {
      const speech = gardenTalkback(HOE_TOOLS.includes(toolId) ? 'broken_hoe' : 'broken_watering_can', { rng: opts.talkRng, failed: true });
      return { ok: false, reason: 'broken_tool', msgs: [toolCheck.msg], toolCheck, speech };
    }
  }
  const cost = profile.energy;
  const er = spendEnergy(pc, cost);
  if (!er.ok) return er;
  const got = applyGardenRewards(pc, profile);
  const now = opts.now ?? Date.now();
  plot.state = 'clean';
  plot.seed = null;
  startStage(plot, now);
  const toolUse = requireTool && toolId && opts.toolState
    ? useToolCondition(opts.toolState, toolId, profile.toolWear)
    : null;
  return {
    ok: true,
    reason: 'cleared',
    plotKey: key,
    profile,
    msgs: ['You cleared a plot. Ready to plant.', ...(toolUse?.broke ? [toolUse.msg] : [])],
    speech: actionTalkback(garden, 'clear', opts, { energy: cost, ...got }),
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
  const seed = SEED_CATALOG[plot.seed];
  if (!seed) return 0;
  const need =
    plot.state === 'seeds'
      ? seed.grow1Ms * (plot.growModifier || 1)
      : seed.grow2Ms * (plot.growModifier || 1);
  if (need <= 0) return 1;
  return Math.min(1, Math.max(0, stageElapsedMs(plot, now) / need));
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
