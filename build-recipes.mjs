/**
 * Build the making catalog from Tiny Speck's GameServerJS sources.
 *
 * Reads:
 *   items/catalog_recipes.js        every recipe (name, tool, wear, costs, I/O, skills, achievements)
 *   items/<class_tsid>.js           label, plural, description, base_cost, stackmax, tags,
 *                                   food energy_factor / drink_mood / drink_energy / drink_xp
 *
 * Writes:
 *   public/assets/content/recipes.json        keyed recipe catalog (making.js schema)
 *   public/assets/content/making-items.json   item + tool metadata and eat/drink use
 *   public/assets/content/recipes-skipped.json recipes intentionally left out, with reasons
 *
 * Food energy follows items/include/food.js food_eat:
 *   energy = Math.round(base_cost * classProps.energy_factor)
 * Drinks follow items/include/drink.js drink_effects:
 *   mood = intval(drink_mood), energy = intval(drink_energy), xp = intval(drink_xp)
 *
 * Both files are evaluated in a node:vm sandbox with stubbed globals; nothing
 * from the Rhino host runs.
 *
 * Run from spike root:
 *   node build-recipes.mjs
 */

import vm from 'node:vm';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const GSJS =
  process.env.GLITCH_GSJS ||
  join(process.env.HOME || '', 'Documents/glitch-audit/glitch-GameServerJS');
const ITEMS = join(GSJS, 'items');
const CONTENT = join(root, 'public/assets/content');

/** Making tools a player can own in the remake, mapped to their recipe catalogs. */
export const INCLUDED_TOOLS = [
  'knife_and_board',
  'frying_pan',
  'saucepan',
  'mike_tyson_grill',
  'blender',
  'cocktail_shaker',
  'awesome_pot',
  'spice_mill',
  'gassifier',
  'bubble_tuner',
  'fruit_changing_machine',
  'egg_seasoner',
  'bean_seasoner',
  'alchemical_tongs',
  'metalmaker',
  'woodworker',
  'fuelmaker',
  'cauldron',
  'tincturing_kit',
  'test_tube',
  'beaker',
  'loomer',
  'crystallizer',
  'tinkertool',
  'construction_tool',
  'blockmaker',
  'spindle',
  'splendid_spindle',
];

/** Tools whose recipes are all left out (none since the Blockmaker arrived). */
const SKIPPED_TOOLS = {};

/**
 * making_type "machine" tools: players/inc_making.js burns a recipe's
 * fuel_cell input from the machine's fuel tank (tool_uses = fuel qty) instead
 * of taking Fuel Cells from the pack. js/machines.js owns the tank.
 */
export const MACHINE_TOOLS = new Set(['woodworker', 'fuelmaker', 'metalmaker', 'blockmaker']);

/**
 * Tinkertool recipes that make tools with a working gameplay loop in the
 * remake (making tools above plus the garden, woodcutting and mining tools).
 */
const PLAYABLE_TOOL_OUTPUTS = new Set([
  ...INCLUDED_TOOLS,
  'hoe',
  'hatchet',
  // Class Axe (recipe 301): hatchet's child class; woodcutting.js and
  // patches.js take either (wood_tree.js / trant_*_dead.js is_hatchet).
  'class_axe',
  'watering_can',
  'irrigator_9000',
  'pick',
  'fancy_pick',
  'smelter',
  'ore_grinder',
  // Scraping/digging tools: tools.js tracks their condition for the
  // resource-nodes lane (barnacles, peat/dirt piles).
  'scraper',
  'super_scraper',
  'shovel',
  'ace_of_spades',
  // Remote Herdkeeping machines: placed in the back yard by
  // features/animal-husbandry-feature.js (js/animal-husbandry.js REMOTE_MACHINES).
  'butterfly_milker',
  'meat_collector',
  'piggy_feeder',
]);

const UNPLAYABLE_TOOL_REASONS = {
  grand_ol_grinder: "Grand Ol' Grinder is an upgraded Grinder; mining.js only recognizes ore_grinder.",
  high_class_hoe: 'High-Class Hoe is an upgraded Hoe; garden.js only recognizes hoe.',
};

/** Furniture classes with recovered art (build-homes.mjs FURNITURE_CLASSES). */
const PLACEABLE_FURNITURE = new Set(
  [...readFileSync(join(root, 'public/js/homes-catalog.js'), 'utf8').matchAll(/^  "((?:bag_)?furniture_[a-z_]+)": \{/gm)].map((m) => m[1])
);

/** Existing remake keys (kept so saves, tests, QA links and game.js stay stable). */
const LEGACY_KEYS = {
  12: 'sammich',
  17: 'fried_eggs',
  52: 'fruity_juice',
  53: 'lemon_juice',
  54: 'orange_juice',
  61: 'bubble_tea',
  89: 'green_eggs',
  105: 'blue_bubble',
  106: 'tiny_bubble',
  107: 'hard_bubble',
  108: 'change_plum',
  109: 'change_grapes',
  111: 'change_orange',
  112: 'change_apple',
  113: 'change_lemon',
  114: 'change_pineapple',
  115: 'change_banana',
  120: 'ginger',
  121: 'black_pepper',
  122: 'mustard',
  123: 'cumin',
  133: 'heavy_gas',
  134: 'helium',
  135: 'laughing_gas',
  136: 'white_gas',
  137: 'crying_gas',
  138: 'flour',
  139: 'bun',
  142: 'change_whortleberry',
  144: 'change_cloudberry',
  172: 'change_strawberry',
  173: 'change_mangosteen',
  174: 'tin',
  175: 'copper',
  176: 'molybdenum',
  279: 'metal_rod',
  280: 'metal_post',
};

/**
 * Non-catalog recipes the remake already ships for the mining chain. The
 * smelter and grinder are verb-driven in GSJS (smelter.js / ore_grinder.js),
 * not catalog_recipes entries, so they are carried over verbatim.
 */
const VERB_RECIPES = {
  plain_metal: {
    id: 'smelt_metal',
    name: 'Plain Metal Ingot',
    tool: 'smelter',
    energyCost: 5,
    xpReward: 2,
    waitMs: 1500,
    inputs: [{ classTsid: 'metal_rock', qty: 5 }],
    outputs: [{ classTsid: 'plain_metal', qty: 1 }],
    skill: 'smelting_1',
    skills: ['smelting_1'],
    source: 'smelter.js smelt — 5 metal_rock → plain_metal',
  },
  crush_dullite: {
    id: 'crush_dullite',
    name: 'Crush Dullite',
    tool: 'ore_grinder',
    energyCost: 4,
    xpReward: 1,
    waitMs: 1200,
    inputs: [{ classTsid: 'dullite', qty: 1 }],
    outputs: [
      { classTsid: 'element_red', qty: 5 },
      { classTsid: 'element_green', qty: 8 },
    ],
    skill: 'refining_1',
    skills: ['refining_1'],
    source: 'ore_grinder.js onCrushComplete dullite',
  },
  crush_beryl: {
    id: 'crush_beryl',
    name: 'Crush Beryl',
    tool: 'ore_grinder',
    energyCost: 4,
    xpReward: 1,
    waitMs: 1200,
    inputs: [{ classTsid: 'beryl', qty: 1 }],
    outputs: [
      { classTsid: 'element_red', qty: 20 },
      { classTsid: 'element_green', qty: 2 },
      { classTsid: 'element_blue', qty: 4 },
    ],
    skill: 'refining_1',
    skills: ['refining_1'],
    source: 'ore_grinder.js onCrushComplete beryl',
  },
  crush_sparkly: {
    id: 'crush_sparkly',
    name: 'Crush Sparkly',
    tool: 'ore_grinder',
    energyCost: 4,
    xpReward: 1,
    waitMs: 1200,
    inputs: [{ classTsid: 'sparkly', qty: 1 }],
    outputs: [
      { classTsid: 'element_red', qty: 5 },
      { classTsid: 'element_green', qty: 1 },
      { classTsid: 'element_blue', qty: 4 },
      { classTsid: 'element_shiny', qty: 6 },
    ],
    skill: 'refining_1',
    skills: ['refining_1'],
    source: 'ore_grinder.js onCrushComplete sparkly',
  },
  crush_barnacle: {
    id: 'crush_barnacle',
    name: 'Grind Barnacles',
    tool: 'ore_grinder',
    energyCost: 3,
    xpReward: 1,
    waitMs: 4000,
    inputs: [{ classTsid: 'barnacle', qty: 1 }],
    outputs: [{ classTsid: 'barnacle_talc', qty: 1 }],
    skill: null,
    skills: [],
    toolWear: 2,
    // ore_grinder.js: barnacles need no Refining ("grinding ore requires ...").
    toolSkillFree: true,
    source: 'ore_grinder.js onCrushComplete barnacle + catalog_skill_packages.js barnacle_refining no_skill',
  },
  spin_thread: {
    id: 'spin_thread',
    name: 'Thread',
    tool: 'spindle',
    energyCost: 1,
    xpReward: 0,
    waitMs: 2000,
    inputs: [{ classTsid: 'fiber', qty: 7 }],
    outputs: [{ classTsid: 'thread', qty: 1 }],
    skill: 'fiber_arts_1',
    skills: ['fiber_arts_1'],
    toolWear: 1,
    source: 'spindle.js spin (7 Fiber per Thread) + catalog_skill_packages.js spinning fiber_arts_1',
  },
  spin_thread_splendid: {
    id: 'spin_thread_splendid',
    name: 'Thread',
    tool: 'splendid_spindle',
    energyCost: 1,
    xpReward: 0,
    waitMs: 2000,
    inputs: [{ classTsid: 'fiber', qty: 7 }],
    outputs: [{ classTsid: 'thread', qty: 1 }],
    skill: 'fiber_arts_1',
    skills: ['fiber_arts_1'],
    toolWear: 1,
    source: 'splendid_spindle.js spin (7 Fiber per Thread) + catalog_skill_packages.js spinning fiber_arts_1',
  },
};

/** Gameplay tools referenced by recipes (outputs or inputs) that should sit in the tools row. */
const EXTRA_TOOL_ITEMS = new Set([
  'hoe',
  'hatchet',
  'class_axe',
  'watering_can',
  'irrigator_9000',
  'pick',
  'fancy_pick',
  'smelter',
  'ore_grinder',
  'scraper',
  'super_scraper',
  'shovel',
  'ace_of_spades',
]);

function sandbox() {
  const noop = () => {};
  const ctx = {
    log: { info: noop, error: noop, debug: noop, warn: noop, printStackTrace: noop },
    config: {},
    utils: {},
  };
  vm.createContext(ctx);
  return ctx;
}

export function loadRecipes(gsjs = GSJS) {
  const ctx = sandbox();
  vm.runInContext(readFileSync(join(gsjs, 'items/catalog_recipes.js'), 'utf8'), ctx, {
    filename: 'catalog_recipes.js',
    timeout: 5000,
  });
  return ctx.recipes;
}

const itemCache = new Map();

export function loadItem(classTsid, gsjs = GSJS) {
  if (itemCache.has(classTsid)) return itemCache.get(classTsid);
  const file = join(gsjs, 'items', `${classTsid}.js`);
  if (!existsSync(file)) {
    itemCache.set(classTsid, null);
    return null;
  }
  const ctx = sandbox();
  vm.runInContext(readFileSync(file, 'utf8'), ctx, { filename: `${classTsid}.js`, timeout: 2000 });
  let thumb = null;
  try {
    thumb = typeof ctx.getAssetInfo === 'function' ? ctx.getAssetInfo()?.thumb || null : null;
  } catch {
    thumb = null;
  }
  const row = {
    classTsid,
    label: ctx.label,
    namePlural: ctx.name_plural,
    description: ctx.description,
    baseCost: Number(ctx.base_cost),
    stackMax: Number(ctx.stackmax),
    isHidden: ctx.is_hidden === true,
    parentClasses: Array.isArray(ctx.parent_classes) ? [...ctx.parent_classes] : [],
    classProps: { ...(ctx.classProps || {}) },
    tags: Array.isArray(ctx.tags) ? [...ctx.tags] : [],
    verbs: Object.keys(ctx.verbs || {}),
    hasOnEat: typeof ctx.onEat === 'function',
    hasOnDrink: typeof ctx.onDrink === 'function',
    thumb,
  };
  itemCache.set(classTsid, row);
  return row;
}

function intval(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Pack use derived from the GSJS food/drink includes. */
export function itemUse(row) {
  if (!row) return null;
  const parents = row.parentClasses;
  // Herbs (herb_base is_herb) suppress the plain eat verb in include/food.js.
  // Sno cones: sno_cone_base overrides eat (iMG, a level gate, brain freeze; js/sno-cones.js), no energy.
  if (parents.includes('food') && row.verbs.includes('eat') && !intval(row.classProps.is_herb) && !parents.includes('sno_cone_base')) {
    const factor = parseFloat(row.classProps.energy_factor ?? '1');
    const energy = Math.round(row.baseCost * (Number.isFinite(factor) ? factor : 1));
    return {
      kind: 'food',
      verb: 'Eat',
      energy,
      source: `items/${row.classTsid}.js base_cost ${row.baseCost} × energy_factor ${row.classProps.energy_factor ?? '1'} (include/food.js food_eat)`,
      ...(row.hasOnEat ? { extraEffects: 'onEat' } : {}),
    };
  }
  if (parents.includes('drink') && row.verbs.includes('drink')) {
    const out = {
      kind: 'drink',
      verb: 'Drink',
      source: `items/${row.classTsid}.js classProps drink_mood/drink_energy/drink_xp (include/drink.js drink_effects)`,
    };
    const mood = intval(row.classProps.drink_mood);
    const energy = intval(row.classProps.drink_energy);
    const xp = intval(row.classProps.drink_xp);
    if (mood) out.mood = mood;
    if (energy) out.energy = energy;
    if (xp) out.xp = xp;
    if (row.hasOnDrink) out.extraEffects = 'onDrink';
    return out;
  }
  return null;
}

// learnt 3 recipes stay out of the client catalog (main.js) but a quest can
// still teach one with making_try_learn_recipe: id -> teaching quest.
const QUEST_TAUGHT = {
  305: 'batterfly_bounty', // quests/batterfly_bounty.js onComplete; Batterfly Bounty Booster makes it
};

function skipReason(id, r) {
  if (SKIPPED_TOOLS[r.tool]) return SKIPPED_TOOLS[r.tool];
  if (!INCLUDED_TOOLS.includes(r.tool)) return `Tool ${r.tool} is not a player-ownable making tool in the remake.`;
  if (r.learnt === 3 && !QUEST_TAUGHT[id]) {
    return 'learnt 3: hidden/retired in production (main.js skips learnt == 3 when building the client recipe catalog).';
  }
  const outIds = r.outputs.map((o) => o[0]);
  // Furniture the house can place (homes-catalog.js) and the Wall Segment that
  // widens it are playable; doors between floors and Note Poles are not.
  const unplaceable = outIds.find((o) => /^(furniture_|bag_furniture_)/.test(o) && !PLACEABLE_FURNITURE.has(o));
  if (unplaceable) {
    return unplaceable === 'furniture_door'
      ? 'Doors connect extra floors; the remake house has one floor.'
      : `Output ${unplaceable} has no recovered art for the house.`;
  }
  if (outIds.includes('note_pole')) return 'Note Poles hold public notes; there is no note system.';
  if (r.tool === 'tinkertool') {
    const bad = outIds.find((o) => !PLAYABLE_TOOL_OUTPUTS.has(o));
    if (bad) return UNPLAYABLE_TOOL_REASONS[bad] || `Output tool ${bad} has no gameplay loop in the remake.`;
  }
  return null;
}

function io(list) {
  return list.map(([classTsid, qty]) => ({ classTsid, qty: Number(qty) }));
}

export function buildCatalog(gsjs = GSJS) {
  const recipes = loadRecipes(gsjs);
  const out = {};
  const skipped = [];
  const usedKeys = new Set(Object.keys(VERB_RECIPES));
  const ids = Object.keys(recipes).sort((a, b) => Number(a) - Number(b));

  for (const id of ids) {
    const r = recipes[id];
    const reason = skipReason(id, r);
    if (reason) {
      skipped.push({
        id,
        name: r.name,
        tool: r.tool,
        outputs: r.outputs.map((o) => o[0]),
        reason,
        source: `catalog_recipes.js recipes["${id}"]`,
      });
      continue;
    }
    let key = LEGACY_KEYS[id];
    if (!key) {
      key = r.outputs[0][0];
      if (usedKeys.has(key) || LEGACY_KEY_VALUES.has(key)) key = `${key}_r${id}`;
    }
    usedKeys.add(key);
    const entry = {
      id,
      name: r.name,
      tool: r.tool,
      energyCost: Number(r.energy_cost),
      xpReward: Number(r.xp_reward),
      waitMs: Number(r.wait_ms),
      inputs: io(r.inputs),
      outputs: io(r.outputs),
      skill: r.skill || null,
      skills: [...(r.skills || [])],
      achievements: [...(r.achievements || [])],
      toolWear: Number(r.tool_wear ?? 1),
      taskLimit: Number(r.task_limit ?? 0),
      learnt: Number(r.learnt),
      source: `catalog_recipes.js recipes["${id}"]`,
    };
    if (r.learnt === 0) entry.discoverable = true;
    if (QUEST_TAUGHT[id]) entry.taughtBy = QUEST_TAUGHT[id];
    if (MACHINE_TOOLS.has(r.tool)) {
      const fuel = entry.inputs.filter((i) => i.classTsid === 'fuel_cell').reduce((n, i) => n + i.qty, 0);
      if (fuel) {
        entry.fuel = fuel;
        entry.toolWear = fuel;
        entry.inputs = entry.inputs.filter((i) => i.classTsid !== 'fuel_cell');
      }
    }
    out[key] = entry;
  }

  // Splice in the verb-driven mining recipes after the catalog rows.
  const catalog = { ...out };
  for (const [key, row] of Object.entries(VERB_RECIPES)) catalog[key] = row;

  // Items: every recipe input/output + every included tool.
  const itemIds = new Set(INCLUDED_TOOLS);
  for (const row of Object.values(catalog)) {
    for (const x of [...row.inputs, ...row.outputs]) itemIds.add(x.classTsid);
  }
  const items = {};
  const missingSource = [];
  for (const classTsid of [...itemIds].sort()) {
    const row = loadItem(classTsid, gsjs);
    if (!row) {
      missingSource.push(classTsid);
      continue;
    }
    const isTool =
      INCLUDED_TOOLS.includes(classTsid) ||
      EXTRA_TOOL_ITEMS.has(classTsid) ||
      (row.parentClasses.includes('tool_base') && !row.parentClasses.includes('potion_base')) ||
      row.parentClasses.includes('machine_base');
    const entry = {
      label: row.label,
      namePlural: row.namePlural,
      desc: row.description,
      baseCost: row.baseCost,
      stackMax: row.stackMax,
      tags: row.tags,
      isTool,
      source: `items/${classTsid}.js`,
    };
    if (isTool) {
      const capacity = row.classProps.points_capacity;
      if (capacity !== undefined) entry.pointsCapacity = intval(capacity);
      if (row.classProps.making_type !== undefined) entry.makingType = row.classProps.making_type;
    }
    const use = isTool ? null : itemUse(row);
    if (use) entry.use = use;
    items[classTsid] = entry;
  }

  return { catalog, items, skipped, missingSource, raw: recipes };
}

const LEGACY_KEY_VALUES = new Set(Object.values(LEGACY_KEYS));

/** Write the GSJS 40×40 thumb for items without an OGA iconic (optional helper). */
export function gsjsThumb(classTsid, gsjs = GSJS) {
  return loadItem(classTsid, gsjs)?.thumb || null;
}

function main() {
  const { catalog, items, skipped, missingSource, raw } = buildCatalog();
  writeFileSync(join(CONTENT, 'recipes.json'), JSON.stringify(catalog, null, 2) + '\n');
  writeFileSync(
    join(CONTENT, 'making-items.json'),
    JSON.stringify(
      {
        _meta: {
          generator: 'build-recipes.mjs',
          source: 'glitch-GameServerJS items/*.js, include/food.js, include/drink.js',
          foodFormula: 'energy = Math.round(base_cost * energy_factor)',
          drinkFormula: 'mood = drink_mood, energy = drink_energy, xp = drink_xp',
          missingSource,
        },
        items,
      },
      null,
      2
    ) + '\n'
  );
  const tools = {};
  for (const row of Object.values(catalog)) tools[row.tool] = (tools[row.tool] || 0) + 1;
  writeFileSync(
    join(CONTENT, 'recipes-skipped.json'),
    JSON.stringify(
      {
        _meta: {
          generator: 'build-recipes.mjs',
          sourceRecipes: Object.keys(raw).length,
          imported: Object.values(catalog).filter((r) => /catalog_recipes/.test(r.source)).length,
          skipped: skipped.length,
          verbRecipes: Object.keys(VERB_RECIPES).length,
        },
        skipped,
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    `recipes: ${Object.keys(catalog).length} (${Object.keys(raw).length} in source, ${skipped.length} skipped)`
  );
  console.log('per tool:', tools);
  console.log(`items: ${Object.keys(items).length}; missing GSJS file: ${missingSource.join(', ') || 'none'}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
