/**
 * Making / crafting — tool-driven recipes from GSJS catalog_recipes.js.
 *
 * Tools: knife_and_board, frying_pan, blender, gassifier, bubble_tuner,
 * spice_mill, fruit_changing_machine, and the mining/metal tool chain.
 * Data: assets/content/recipes.json (+ embedded fallback for flour/bun/sammich)
 */

import { addItem, removeItem, countItem, ITEM_CATALOG, itemIcon, ensureItem } from './inventory.js?v=catalog-unified-2';
import { canUseTool, useToolCondition } from './tools.js?v=tool-condition-1';

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   tool: string,
 *   energyCost: number,
 *   xpReward: number,
 *   waitMs?: number,
 *   inputs: { classTsid: string, qty: number }[],
 *   outputs: { classTsid: string, qty: number }[],
 *   skill?: string|null,
 *   skills?: string[],
 *   source: string,
 * }} Recipe
 */

/** GSJS tool class_tsids used by the remake catalog. */
export const TOOL_CATALOG = {
  knife_and_board: {
    classTsid: 'knife_and_board',
    label: 'Knife & Board',
    desc: 'Chop, slice, grind grain. (GSJS tool)',
    icon: itemIcon('knife_and_board'),
    isTool: true,
  },
  frying_pan: {
    classTsid: 'frying_pan',
    label: 'Frying Pan',
    desc: 'Hot iron for buns, eggs, and more.',
    icon: itemIcon('frying_pan'),
    isTool: true,
  },
  blender: {
    classTsid: 'blender',
    label: 'Blender',
    desc: 'Whirling juices and bubble tea.',
    icon: itemIcon('blender'),
    isTool: true,
  },
  gassifier: {
    classTsid: 'gassifier',
    label: 'Gassifier',
    desc: 'Refine general vapour into named gases.',
    icon: itemIcon('gassifier'),
    isTool: true,
  },
  bubble_tuner: {
    classTsid: 'bubble_tuner',
    label: 'Bubble Tuner',
    desc: 'Tune plain bubbles into blue, tiny, or hard.',
    icon: itemIcon('bubble_tuner'),
    isTool: true,
  },
  fruit_changing_machine: {
    classTsid: 'fruit_changing_machine',
    label: 'Fruit Changing Machine',
    desc: 'A triple-carbine machine that transmogrifies cherries into other fruit.',
    icon: itemIcon('fruit_changing_machine'),
    isTool: true,
    action: 'convert',
  },
  spice_mill: {
    classTsid: 'spice_mill',
    label: 'Spice Mill',
    desc: 'Mill allspice into named spices.',
    icon: itemIcon('spice_mill'),
    isTool: true,
  },
  smelter: {
    classTsid: 'smelter',
    label: 'Smelter',
    desc: 'Smelt metal rock into Plain Metal Ingots.',
    icon: itemIcon('smelter'),
    isTool: true,
  },
  ore_grinder: {
    classTsid: 'ore_grinder',
    label: 'Grinder',
    desc: 'Crush dullite, beryl, sparkly into elements.',
    icon: itemIcon('ore_grinder'),
    isTool: true,
  },
  alchemical_tongs: {
    classTsid: 'alchemical_tongs',
    label: 'Alchemical Tongs',
    desc: 'Alchemy II: plain metal → tin, copper, molybdenum.',
    icon: itemIcon('alchemical_tongs'),
    isTool: true,
  },
  metalmaker: {
    classTsid: 'metalmaker',
    label: 'Metal Machine',
    desc: 'Metalworking: rods and bars.',
    icon: itemIcon('metalmaker'),
    isTool: true,
  },
  pick: {
    classTsid: 'pick',
    label: 'Pick',
    desc: 'Mine metal, dullite, beryl, sparkly rocks.',
    icon: itemIcon('pick'),
    isTool: true,
  },
  fancy_pick: {
    classTsid: 'fancy_pick',
    label: 'Fancy Pick',
    desc: 'Deluxe pick with more durability.',
    icon: itemIcon('fancy_pick'),
    isTool: true,
  },
  tinkertool: {
    classTsid: 'tinkertool',
    label: 'Tinkertool',
    desc: 'Repairs worn and broken tools. Requires Tinkering. (GSJS tinkertool)',
    icon: itemIcon('tinkertool'),
    isTool: true,
    action: 'repair',
  },
};

/** Fallback if recipes.json not loaded (classic knife/pan chain). */
const EMBEDDED_RECIPES = {
  flour: {
    id: '138',
    name: 'Flour',
    tool: 'knife_and_board',
    energyCost: 1,
    xpReward: 2,
    inputs: [{ classTsid: 'grain', qty: 5 }],
    outputs: [{ classTsid: 'flour', qty: 1 }],
    skill: 'ezcooking_1',
    source: 'catalog_recipes.js recipes["138"]',
  },
  bun: {
    id: '139',
    name: 'Bun',
    tool: 'frying_pan',
    energyCost: 2,
    xpReward: 2,
    inputs: [
      { classTsid: 'flour', qty: 1 },
      { classTsid: 'pinch_of_salt', qty: 1 },
    ],
    outputs: [{ classTsid: 'bun', qty: 1 }],
    skill: 'cheffery_1',
    source: 'catalog_recipes.js recipes["139"]',
  },
  sammich: {
    id: '12',
    name: 'Sammich',
    tool: 'knife_and_board',
    energyCost: 3,
    xpReward: 2,
    inputs: [
      { classTsid: 'bun', qty: 1 },
      { classTsid: 'meat', qty: 1 },
    ],
    outputs: [{ classTsid: 'sammich', qty: 1 }],
    skill: 'ezcooking_1',
    source: 'catalog_recipes.js recipes["12"]',
  },
};

/** @type {Record<string, Recipe>} */
export let RECIPE_CATALOG = { ...EMBEDDED_RECIPES };

let recipesReady = false;

/**
 * Replace catalog with GSJS-extracted table (or merge).
 * @param {Record<string, Recipe>} data
 */
export function setRecipeCatalog(data) {
  if (!data || typeof data !== 'object') return;
  RECIPE_CATALOG = { ...data };
  recipesReady = true;
  ensureMakingItems();
}

export function isRecipeCatalogReady() {
  return recipesReady || Object.keys(RECIPE_CATALOG).length > 3;
}

/**
 * Browser: fetch assets/content/recipes.json
 * @param {typeof fetch} [fetchImpl]
 */
export async function loadRecipeCatalog(fetchImpl = globalThis.fetch) {
  if (!fetchImpl) {
    ensureMakingItems();
    return RECIPE_CATALOG;
  }
  try {
    const res = await fetchImpl('assets/content/recipes.json?v=fruit-machine-2');
    if (res.ok) {
      const data = await res.json();
      setRecipeCatalog(data);
      return RECIPE_CATALOG;
    }
  } catch {
    /* keep embedded */
  }
  ensureMakingItems();
  return RECIPE_CATALOG;
}

/**
 * Node/tests: load from absolute path to recipes.json
 * @param {string} filePath
 */
export async function loadRecipeCatalogFromFile(filePath) {
  const { readFile } = await import('node:fs/promises');
  const data = JSON.parse(await readFile(filePath, 'utf8'));
  setRecipeCatalog(data);
  return RECIPE_CATALOG;
}

/** Craft products + demo ingredients (icons from OGA iconic pack). */
const MAKING_ITEM_EXTRAS = {
  flour: { label: 'Flour', desc: 'Ground grain. (GSJS recipe 138)' },
  pinch_of_salt: { label: 'Pinch of Salt', desc: 'A little salt for buns.' },
  bun: { label: 'Bun', desc: 'Soft bread. (GSJS recipe 139)' },
  sammich: { label: 'Sammich', desc: 'Bun + meat. (GSJS recipe 12)' },
  meat: { label: 'Meat', desc: 'From a careful nibble.' },
  orange: { label: 'Orange', desc: 'Citrus for juices.' },
  lemon: { label: 'Lemon', desc: 'Tart citrus.' },
  plum: { label: 'Plum', desc: 'Stone fruit for Fruity Juice.' },
  bunch_of_grapes: { label: 'Bunch of Grapes', desc: 'A friendly bunch, changed from cherries.' },
  pineapple: { label: 'Pineapple', desc: 'Spiky fruit, transmogrified from cherries.' },
  banana: { label: 'Banana', desc: 'Curved fruit from the Fruit Changing Machine.' },
  whortleberry: { label: 'Whortleberry', desc: 'A tiny blue fruit with an excellent name.' },
  cloudberry: { label: 'Cloudberry', desc: 'A softly strange fruit changed from a cherry.' },
  strawberry: { label: 'Strawberry', desc: 'A sweet red fruit changed from cherries.' },
  mangosteen: { label: 'Mangosteen', desc: 'A prized purple fruit changed from seven cherries.' },
  orange_juice: { label: 'Orange Juice', desc: 'Blended oranges. (GSJS 54)' },
  lemon_juice: { label: 'Lemon Juice', desc: 'Blended lemons. (GSJS 53)' },
  fruity_juice: { label: 'Fruity Juice', desc: 'Cherry, plum, orange. (GSJS 52)' },
  bubble_tea: { label: 'Bubble Tea', desc: 'Tuned bubbles, blended. (GSJS 61)' },
  blue_bubble: { label: 'Blue Bubble', desc: 'Tuned from plain bubble. (GSJS 105)' },
  tiny_bubble: { label: 'Tiny Bubble', desc: 'Three plain bubbles. (GSJS 106)' },
  hard_bubble: { label: 'Hard Bubble', desc: 'Five plain bubbles. (GSJS 107)' },
  heavy_gas: { label: 'Heavy Gas', desc: 'From general vapour. (GSJS 133)' },
  helium: { label: 'Helium', desc: 'From general vapour. (GSJS 134)' },
  laughing_gas: { label: 'Laughing Gas', desc: 'From general vapour. (GSJS 135)' },
  white_gas: { label: 'White Gas', desc: 'From general vapour. (GSJS 136)' },
  crying_gas: { label: 'Crying Gas', desc: 'From general vapour. (GSJS 137)' },
  ginger: { label: 'Ginger', desc: 'Milled allspice. (GSJS 120)' },
  black_pepper: { label: 'Black Pepper', desc: 'Milled allspice. (GSJS 121)' },
  mustard: { label: 'Mustard', desc: 'Milled allspice. (GSJS 122)' },
  cumin: { label: 'Cumin', desc: 'Milled allspice. (GSJS 123)' },
  fried_egg: { label: 'Fried Egg', desc: 'Salt + egg in a pan. (GSJS 17)' },
  green_eggs: { label: 'Green Eggs', desc: 'Spinach + egg. (GSJS 89)' },
  spinach: { label: 'Spinach', desc: 'Leafy green for Green Eggs.' },
  plain_bubble: { label: 'Bubble', desc: 'Harvested from a Bubble Tree.' },
  all_spice: { label: 'Allspice', desc: 'Harvested from a Spice Plant.' },
  general_vapour: { label: 'Vapour', desc: 'Harvested from a Gas Plant.' },
  egg_plain: { label: 'Egg', desc: 'Harvested from an Egg Plant.' },
  bean_plain: { label: 'Bean', desc: 'Harvested from a Bean Tree.' },
  cherry: { label: 'Cherry', desc: 'Fruit tree harvest.' },
};

/**
 * Ensure making items + tools exist on ITEM_CATALOG (mutates shared catalog).
 * Always refreshes icon paths to OGA iconic pack.
 */
export function ensureMakingItems() {
  for (const [id, meta] of Object.entries(MAKING_ITEM_EXTRAS)) {
    ensureItem(id, meta);
  }
  for (const [id, meta] of Object.entries(TOOL_CATALOG)) {
    ensureItem(id, {
      label: meta.label,
      desc: meta.desc,
      isTool: true,
    });
    // keep TOOL_CATALOG.icon in sync
    meta.icon = itemIcon(id);
  }
  // Register any recipe I/O not yet catalogued
  for (const recipe of Object.values(RECIPE_CATALOG)) {
    for (const io of [...(recipe.inputs || []), ...(recipe.outputs || [])]) {
      ensureItem(io.classTsid);
    }
  }
}

export function listTools() {
  return Object.values(TOOL_CATALOG);
}

export function listRecipes() {
  ensureMakingItems();
  return Object.entries(RECIPE_CATALOG).map(([key, recipe]) => ({
    key,
    ...recipe,
  }));
}

/**
 * @param {string} toolId
 */
export function listRecipesForTool(toolId) {
  return listRecipes().filter((r) => r.tool === toolId);
}

/**
 * @param {import('./inventory.js').Inventory} inv
 * @param {string} toolId
 */
export function hasTool(inv, toolId) {
  if (!toolId) return true;
  return countItem(inv, toolId) >= 1;
}

/**
 * @param {import('./inventory.js').Inventory} inv
 * @param {Recipe} recipe
 * @param {{ learned?: string[], requireSkill?: boolean, requireTool?: boolean }} [opts]
 */
export function canCraft(inv, recipe, opts = {}) {
  if (!recipe) return { ok: false, reason: 'unknown' };

  const requireTool = opts.requireTool !== false;
  if (requireTool && recipe.tool && !hasTool(inv, recipe.tool)) {
    const label = TOOL_CATALOG[recipe.tool]?.label || recipe.tool;
    return { ok: false, reason: 'tool', tool: recipe.tool, need: label };
  }
  if (requireTool && recipe.tool && opts.toolState) {
    const condition = canUseTool(opts.toolState, recipe.tool, opts.toolWear || 1);
    if (!condition.ok) {
      return {
        ok: false,
        reason: 'broken_tool',
        tool: recipe.tool,
        need: TOOL_CATALOG[recipe.tool]?.label || recipe.tool,
        msg: condition.msg,
      };
    }
  }

  const skillId = recipe.skill || recipe.skills?.[0];
  // Enforce skill only when a learned list is provided (game path)
  if (skillId && Array.isArray(opts.learned) && opts.requireSkill !== false) {
    if (!opts.learned.includes(skillId)) {
      return { ok: false, reason: 'skill', skill: skillId };
    }
  }

  for (const inp of recipe.inputs || []) {
    if (countItem(inv, inp.classTsid) < inp.qty) {
      return {
        ok: false,
        reason: 'ingredients',
        missing: inp.classTsid,
        need: inp.qty,
        have: countItem(inv, inp.classTsid),
      };
    }
  }
  return { ok: true, reason: 'ok' };
}

/**
 * Craft one recipe. Mutates inv and pc on success only.
 * @param {import('./inventory.js').Inventory} inv
 * @param {object} pc  { energy, mood, imagination, xp }
 * @param {string} recipeKey  key in RECIPE_CATALOG
 * @param {{ learned?: string[], requireSkill?: boolean, requireTool?: boolean }} [opts]
 */
export function craftRecipe(inv, pc, recipeKey, opts = {}) {
  ensureMakingItems();
  const recipe = RECIPE_CATALOG[recipeKey];
  if (!recipe) {
    return { ok: false, reason: 'unknown', msgs: ['Unknown recipe.'] };
  }

  const check = canCraft(inv, recipe, opts);
  if (!check.ok) {
    if (check.reason === 'tool') {
      return {
        ok: false,
        reason: 'tool',
        msgs: [`You need a ${check.need} to make that.`],
      };
    }
    if (check.reason === 'skill') {
      return {
        ok: false,
        reason: 'skill',
        msgs: [`You need the skill ${check.skill} first.`],
      };
    }
    if (check.reason === 'broken_tool') {
      return {
        ok: false,
        reason: 'broken_tool',
        msgs: [check.msg || `Your ${check.need} needs repairing.`],
      };
    }
    if (check.reason === 'ingredients') {
      const label = ITEM_CATALOG[check.missing]?.label || check.missing;
      return {
        ok: false,
        reason: 'ingredients',
        msgs: [`Need ${check.need}× ${label} (have ${check.have}).`],
      };
    }
    return { ok: false, reason: check.reason, msgs: ['Cannot craft.'] };
  }

  const cost = recipe.energyCost || 0;
  if ((pc.energy || 0) < cost) {
    return {
      ok: false,
      reason: 'energy',
      msgs: [`Need ${cost} energy (you have ${Math.floor(pc.energy || 0)}).`],
    };
  }

  // Snapshot for atomicity
  const beforeInv = { ...inv };
  const beforeE = pc.energy;
  const beforeImg = pc.imagination;
  const beforeXp = pc.xp;

  for (const inp of recipe.inputs || []) {
    if (!removeItem(inv, inp.classTsid, inp.qty)) {
      Object.assign(inv, beforeInv);
      return { ok: false, reason: 'ingredients', msgs: ['Not enough ingredients.'] };
    }
  }

  pc.energy = Math.max(0, (pc.energy || 0) - cost);
  if (recipe.xpReward) {
    pc.imagination = (pc.imagination || 0) + recipe.xpReward;
    pc.xp = (pc.xp || 0) + recipe.xpReward;
  }
  for (const out of recipe.outputs || []) {
    addItem(inv, out.classTsid, out.qty);
  }

  const toolUse = recipe.tool && opts.toolState
    ? useToolCondition(opts.toolState, recipe.tool, opts.toolWear || 1)
    : null;

  const toolLabel = TOOL_CATALOG[recipe.tool]?.label || recipe.tool || 'hands';
  const outLabels = (recipe.outputs || [])
    .map((o) => `${o.qty}× ${ITEM_CATALOG[o.classTsid]?.label || o.classTsid}`)
    .join(', ');
  return {
    ok: true,
    reason: 'crafted',
    recipe,
    recipeKey,
    msgs: [
      `You made ${recipe.name} with ${toolLabel} (${outLabels}). −${cost} energy, +${recipe.xpReward || 0} iMG.`,
      ...(toolUse?.broke ? [toolUse.msg] : []),
    ],
    toolUse,
    // for tests / rollback inspection
    _before: { energy: beforeE, imagination: beforeImg, xp: beforeXp },
  };
}

/**
 * Progress line while crafting quantity N (original: “Making i of N”).
 * @param {number} i  1-based index of the unit currently finishing
 * @param {number} of total requested
 * @param {string} [recipeName]
 */
export function formatCraftProgress(i, of, recipeName = '') {
  const name = recipeName ? ` — ${recipeName}` : '';
  return `Making ${i} of ${of}${name}`;
}

const TOOL_CRAFT_DURATION_MS = {
  knife_and_board: 1600,
  frying_pan: 1900,
  blender: 1700,
  gassifier: 2100,
  bubble_tuner: 1800,
  fruit_changing_machine: 2000,
  spice_mill: 1600,
  smelter: 2600,
  ore_grinder: 2200,
  alchemical_tongs: 2400,
  metalmaker: 2600,
};

/**
 * Duration for one visible making cycle. Prefer the GSJS-derived recipe wait,
 * with a tool-specific fallback for embedded and future recipes.
 * @param {Recipe|string|null} recipeOrTool
 */
export function craftDurationFor(recipeOrTool) {
  const recipe = typeof recipeOrTool === 'object' ? recipeOrTool : null;
  const tool = typeof recipeOrTool === 'string' ? recipeOrTool : recipe?.tool;
  const sourceWait = Number(recipe?.waitMs);
  if (Number.isFinite(sourceWait) && sourceWait > 0) {
    return Math.max(700, Math.min(6000, sourceWait));
  }
  return TOOL_CRAFT_DURATION_MS[tool] || 1800;
}

/**
 * Pure timer state for an animated, per-unit making session.
 * Inventory mutation deliberately happens outside this helper when unitsReady > 0.
 */
export function createCraftSession({ recipeKey, recipeName = '', tool = '', qty = 1, durationMs } = {}) {
  const total = Math.max(1, Math.floor(Number(qty) || 1));
  const duration = Math.max(1, Number(durationMs) || craftDurationFor(tool));
  return {
    recipeKey: recipeKey || '',
    recipeName,
    tool,
    qty: total,
    durationMs: duration,
    completed: 0,
    unitElapsedMs: 0,
    unitProgress: 0,
    totalProgress: 0,
    status: 'running',
  };
}

/** Advance a making timer without touching inventory or player stats. */
export function advanceCraftSession(session, deltaMs) {
  const next = { ...session };
  let unitsReady = 0;
  if (next.status !== 'running') return { session: next, unitsReady };

  let remaining = Math.max(0, Number(deltaMs) || 0);
  while (remaining > 0 && next.status === 'running') {
    const needed = Math.max(0, next.durationMs - next.unitElapsedMs);
    if (remaining < needed) {
      next.unitElapsedMs += remaining;
      remaining = 0;
    } else {
      remaining -= needed;
      next.completed += 1;
      unitsReady += 1;
      next.unitElapsedMs = 0;
      if (next.completed >= next.qty) next.status = 'complete';
    }
  }

  next.unitProgress = next.status === 'complete'
    ? 1
    : Math.max(0, Math.min(1, next.unitElapsedMs / next.durationMs));
  next.totalProgress = Math.max(
    0,
    Math.min(1, (next.completed + (next.status === 'running' ? next.unitProgress : 0)) / next.qty)
  );
  return { session: next, unitsReady };
}

/** Cancel only the unfinished portion; completed units remain completed. */
export function cancelCraftSession(session) {
  if (!session || session.status !== 'running') return session ? { ...session } : null;
  return { ...session, status: 'cancelled' };
}

/**
 * @param {{
 *   made: number,
 *   recipeName: string,
 *   energy: number,
 *   xp: number,
 * }} result
 */
export function formatCraftResultLine(result) {
  if (!result || !result.made) return '';
  const n = result.made;
  const name = result.recipeName || 'item';
  const qtyBit = n > 1 ? ` (x${n})` : '';
  const e = result.energy || 0;
  const xp = result.xp || 0;
  const bits = [`You made ${name}${qtyBit}`];
  const meta = [];
  if (e) meta.push(`${e < 0 ? e : `+${e}`} energy`);
  if (xp) meta.push(`${xp > 0 ? `+${xp}` : xp} iMG`);
  if (meta.length) bits.push(meta.join(', '));
  return bits.join(' — ') + '.';
}

/** Build the shared result payload after one or more units have been crafted. */
export function buildCraftBatchResult(inv, pc, recipeKey, made, qtyRequested = made, opts = {}) {
  ensureMakingItems();
  const recipe = RECIPE_CATALOG[recipeKey];
  const count = Math.max(0, Math.floor(Number(made) || 0));
  if (!recipe || count < 1) return null;

  const energy = -(recipe.energyCost || 0) * count;
  const xp = (recipe.xpReward || 0) * count;
  const used = (recipe.inputs || []).map((input) => ({
    classTsid: input.classTsid,
    qty: input.qty * count,
    remain: countItem(inv, input.classTsid),
    label: ITEM_CATALOG[input.classTsid]?.label || input.classTsid,
  }));
  const outputs = (recipe.outputs || []).map((output) => ({
    classTsid: output.classTsid,
    qty: output.qty * count,
    label: ITEM_CATALOG[output.classTsid]?.label || output.classTsid,
  }));
  const canMakeMore = canCraft(inv, recipe, opts).ok
    && (pc.energy || 0) >= (recipe.energyCost || 0);
  const activityLine = formatCraftResultLine({
    made: count,
    recipeName: recipe.name,
    energy,
    xp,
  });

  return {
    made: count,
    qtyRequested: Math.max(count, Math.floor(Number(qtyRequested) || count)),
    recipeKey,
    recipeName: recipe.name,
    energy,
    xp,
    outputs,
    used,
    canMakeMore,
    activityLine,
    headline: count === 1
      ? `You made ${recipe.name}!`
      : `You made ${count} ${recipe.name}${recipe.name.endsWith('s') ? '' : 's'}!`,
  };
}

/**
 * Craft up to `qty` units of a recipe, recording per-unit progress and a final result
 * payload the Make UI can show (progress “i of N” → result with energy/xp + make-more).
 *
 * Mutates inv/pc only for successful units (same as repeated craftRecipe).
 *
 * @param {import('./inventory.js').Inventory} inv
 * @param {object} pc
 * @param {string} recipeKey
 * @param {number} qty
 * @param {{ learned?: string[], requireSkill?: boolean, requireTool?: boolean }} [opts]
 * @returns {{
 *   ok: boolean,
 *   made: number,
 *   qtyRequested: number,
 *   recipeKey: string,
 *   recipe: Recipe|null,
 *   progress: { i: number, of: number, label: string, energy: number, xp: number }[],
 *   result: null | {
 *     made: number,
 *     recipeKey: string,
 *     recipeName: string,
 *     energy: number,
 *     xp: number,
 *     outputs: { classTsid: string, qty: number, label: string }[],
 *     used: { classTsid: string, qty: number, remain: number, label: string }[],
 *     canMakeMore: boolean,
 *     activityLine: string,
 *     headline: string,
 *   },
 *   msgs: string[],
 *   reason?: string,
 * }}
 */
export function craftRecipeBatch(inv, pc, recipeKey, qty = 1, opts = {}) {
  ensureMakingItems();
  const recipe = RECIPE_CATALOG[recipeKey];
  const n = Math.max(1, Math.floor(Number(qty) || 1));
  if (!recipe) {
    return {
      ok: false,
      made: 0,
      qtyRequested: n,
      recipeKey,
      recipe: null,
      progress: [],
      result: null,
      msgs: ['Unknown recipe.'],
      reason: 'unknown',
    };
  }

  const progress = [];
  let made = 0;
  let lastFail = null;

  for (let i = 1; i <= n; i++) {
    const r = craftRecipe(inv, pc, recipeKey, opts);
    if (!r.ok) {
      lastFail = r;
      break;
    }
    made += 1;
    const eCost = recipe.energyCost || 0;
    const xpGain = recipe.xpReward || 0;
    progress.push({
      i,
      of: n,
      label: formatCraftProgress(i, n, recipe.name),
      energy: -eCost,
      xp: xpGain,
    });
  }

  if (made === 0) {
    return {
      ok: false,
      made: 0,
      qtyRequested: n,
      recipeKey,
      recipe,
      progress: [],
      result: null,
      msgs: lastFail?.msgs || ['Cannot craft.'],
      reason: lastFail?.reason || 'fail',
    };
  }

  const result = buildCraftBatchResult(inv, pc, recipeKey, made, n, opts);

  return {
    ok: true,
    made,
    qtyRequested: n,
    recipeKey,
    recipe,
    progress,
    result,
    msgs: [result.activityLine],
  };
}

/**
 * Whether another unit of this recipe can be made now (make-more button).
 * @param {import('./inventory.js').Inventory} inv
 * @param {object} pc
 * @param {string} recipeKey
 * @param {{ learned?: string[], requireSkill?: boolean, requireTool?: boolean }} [opts]
 */
export function canCraftAgain(inv, pc, recipeKey, opts = {}) {
  const recipe = RECIPE_CATALOG[recipeKey];
  if (!recipe) return false;
  const check = canCraft(inv, recipe, opts);
  if (!check.ok) return false;
  return (pc.energy || 0) >= (recipe.energyCost || 0);
}

/**
 * Starter tools for demo (all six making tools).
 * @returns {Record<string, number>}
 */
export function starterToolsInventory() {
  const out = {};
  for (const id of Object.keys(TOOL_CATALOG)) out[id] = 1;
  return out;
}

/**
 * Demo ingredients so blender/gas/bubble chains are tryable at start.
 * @returns {Record<string, number>}
 */
export function starterCraftIngredients() {
  return {
    grain: 15,
    pinch_of_salt: 5,
    meat: 2,
    orange: 8,
    lemon: 6,
    plum: 4,
    spinach: 3,
    // harvestables also granted lightly so gassifier/bubble paths work offline
    plain_bubble: 20,
    general_vapour: 20,
    all_spice: 8,
    cherry: 20,
  };
}
