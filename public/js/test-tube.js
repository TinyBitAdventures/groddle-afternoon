/**
 * Experimenting with a Test Tube: how the sixteen compounds are found (audit rules-a #15).
 *
 * In Glitch the compounds were `learnt: 0` (items/catalog_recipes.js 146-161) and the Test Tube's
 * default verb was Experiment (items/test_tube.js 274-305: slots 4, try_wait 5, recipes 146-161,
 * can_discover, specify_quantities). The Make window's first button was "Try to make something new"
 * (glitch-client MakingRecipeUI.as 59-77), which opened four slots for the four elements
 * (MakingTryUI.as 24, 'element_red', 'element_green', 'element_blue', 'element_shiny'), each with a
 * count, and "Try it!" (MakingTryUI.as 48-52, 270-287) sent them as make_unknown.
 *
 * The server (players/inc_making.js) waited try_wait seconds (tryToMake 562-660), then
 * finishMakingUnknown (1102-1345) looked for the best recipe the mix fits (makingFindBestMatch
 * 1347-1405, makingInputsMatch 1410-1444):
 *   - only recipes not yet known (learnt 0, not in pc.recipes), with their skills;
 *   - every recipe ingredient given, at least its count (specify_quantities); at most one other
 *     ingredient kind on top; the score is everything given beyond the recipe, lowest wins;
 *   - no fit: "That recipe didn't make anything!" and half the time the ingredients come back,
 *     otherwise they are destroyed for 75% of their base cost as iMG (1153-1185);
 *   - a fit: the recipe is made once (making_execute_recipe 1484-1552), what was given beyond it is
 *     destroyed ("Your extra ... was destroyed in the process.", 1243-1268), the recipe becomes
 *     known (1274) and a 50 iMG bonus lands (stats_add_xp(50, false), 1296); the activity says
 *     "You discovered how to make recipe X! 0 energy, +50iMG" (1294-1306).
 * The Test Tube has no wear (points_capacity 0, test_tube.js 25; tool_base use 574-580).
 *
 * Where the remake departs: the source printed the failed mix's iMG but never called stats_add_xp
 * for it (1170-1182); Austin's go (2026-11-12) gives it, through the same mood scaling, and the line
 * shows what landed.
 *
 * Saves from before this rule knew all sixteen (the remake listed them from the start). Austin's rule:
 * never take away what a save already has. js/features/compound-discovery-feature.js stamps once per
 * save: a save that existed before the stamp keeps all sixteen; a new character starts with none.
 */
import { addItem, countItem, ITEM_CATALOG, removeItem } from './inventory.js?v=f49c8998';
import { makingRequiredSkill, pluralizeItem, RECIPE_CATALOG } from './making.js?v=9bbf2186';
import { grantMoodXp } from './mood-xp.js?v=22648ec0';
import { loseEnergy } from './metabolics.js?v=1383e6fd';

export const EXPERIMENT_TOOL = 'test_tube';
/** test_tube.js 284 (slots). */
export const EXPERIMENT_SLOTS = 4;
/** test_tube.js 285 try_wait 5; inc_making.js 619 (* 1000). */
export const EXPERIMENT_WAIT_MS = 5000;
/** MakingTryUI.as 24: what the slots take. */
export const EXPERIMENT_ELEMENTS = Object.freeze(['element_red', 'element_green', 'element_blue', 'element_shiny']);
/** test_tube.js 286. */
export const COMPOUND_RECIPE_IDS = Object.freeze(['146', '147', '148', '149', '150', '151', '152', '153', '154', '155', '156', '157', '158', '159', '160', '161']);
/** inc_making.js 1296: stats_add_xp(50, false) on a discovery. */
export const DISCOVERY_BONUS_XP = 50;
/** inc_making.js 1161: half the time the ingredients come back. */
export const RETURN_CHANCE = 0.5;
/** inc_making.js 1182. */
export const FAILED_XP_SHARE = 0.75;

export const NOTHING_LINE = "That recipe didn't make anything!";
export const RETURNED_LINE = 'But, you got all your ingredients back at least.';
export const DESTROYED_LINE = 'And wow, all of your ingredients were destroyed in the process.';
/** MakingDialog.as 525 subtitle, said for buttons instead of dragging. */
export const EXPERIMENT_SUBTITLE = 'Add elements from your pouch to make something new!';
/** MakingToolAnimator.as 69. */
export const EXPERIMENT_PROGRESS_LINE = 'Trying something new';

/** test_tube.js 283: the verb's tooltip. */
export function experimentTooltip(knownCount) {
  return `Make compounds. You have discovered ${knownCount} compounds`;
}

/** PURE: the compound recipes (key + recipe) the catalog holds, in recipe order. */
export function compoundRecipes(catalog = RECIPE_CATALOG) {
  return Object.entries(catalog || {})
    .filter(([, r]) => r?.tool === EXPERIMENT_TOOL && r.discoverable)
    .sort((a, b) => Number(a[1].id) - Number(b[1].id))
    .map(([key, recipe]) => ({ key, recipe }));
}

/**
 * Why the player can't experiment now, or '' (making_check_allowed 80-110: the tool's skill;
 * the verb needs a Test Tube in the pack).
 */
export function experimentBlockedLine(inv, learned = null) {
  if (countItem(inv, EXPERIMENT_TOOL) < 1) return 'You need a Test Tube to make this';
  const skill = makingRequiredSkill(EXPERIMENT_TOOL);
  if (skill && Array.isArray(learned) && !learned.includes(skill)) return 'You need to know Alchemy I to use this.';
  return '';
}

// ---- The four slots (MakingTryUI.as) --------------------------------------------------------

/** How many of an element one slot may hold: the pack's count less what other slots hold, capped at a stack (afterSlotChange 236-244). */
export function slotMax(slots, index, inv) {
  const slot = slots[index];
  if (!slot) return 0;
  const others = slots.reduce((n, s, i) => n + (i !== index && s.cls === slot.cls ? s.n : 0), 0);
  const stack = Number(ITEM_CATALOG[slot.cls]?.stackMax) || Infinity;
  return Math.max(0, Math.min(stack, countItem(inv, slot.cls) - others));
}

/**
 * PURE (but for reading inv): add one of an element: to its own slot, else the first empty one
 * (findEmptySlotOrSlotWithThisItem 179-200, addItemToSlot 159-177). Returns the new slots, or the
 * same array when it can't (not an element, none left, four kinds already).
 */
export function addToSlots(slots, cls, inv) {
  if (!EXPERIMENT_ELEMENTS.includes(cls)) return slots;
  const next = slots.map((s) => ({ ...s }));
  let index = next.findIndex((s) => s.cls === cls);
  if (index < 0) {
    if (next.length >= EXPERIMENT_SLOTS) return slots;
    next.push({ cls, n: 0 });
    index = next.length - 1;
  }
  if (next[index].n + 1 > slotMax(next, index, inv)) return slots;
  next[index].n += 1;
  return next;
}

/** PURE: set one slot's count (its - and + buttons); 0 or less empties it (the slot's close). */
export function setSlotCount(slots, index, n, inv) {
  if (!slots[index]) return slots;
  const want = Math.floor(Number(n) || 0);
  if (want <= 0) return slots.filter((_, i) => i !== index);
  const next = slots.map((s) => ({ ...s }));
  next[index].n = Math.max(1, Math.min(want, slotMax(next, index, inv)));
  return next;
}

/** PURE: the slots as make_unknown's inputs, [[class, count], ...] (onTryClick 270-287). */
export function slotsToInputs(slots) {
  return slots.filter((s) => s.cls && s.n > 0).map((s) => [s.cls, s.n]);
}

// ---- Matching (inc_making.js) ---------------------------------------------------------------

/**
 * makingInputsMatch(a, b, exact): how far a mix is over a recipe, or null when it doesn't fit.
 * @param {{ classTsid: string, qty: number }[]} recipeInputs
 * @param {[string, number][]} given
 */
export function inputsMatch(recipeInputs, given, exact = true) {
  const actual = {};
  const gave = {};
  for (const i of recipeInputs || []) actual[i.classTsid] = exact ? i.qty : 1;
  for (const [cls, n] of given || []) gave[cls] = exact ? n : 1;
  let difference = 0;
  for (const cls of Object.keys(actual)) {
    if (!gave[cls]) return null;
    if (actual[cls] > gave[cls]) return null;
    difference += gave[cls] - actual[cls];
    delete gave[cls];
  }
  if (Object.keys(gave).length > 1) return null;
  for (const n of Object.values(gave)) difference += n;
  return difference;
}

/**
 * makingFindBestMatch: the recipe key the mix discovers, or null. Only compounds not yet known; a
 * recipe's skills must be known (none of the sixteen has any); lowest score, first in order on a tie.
 * @param {[string, number][]} given
 * @param {{ known?: string[], learned?: string[]|null, catalog?: object }} [opts]
 */
export function findBestMatch(given, { known = [], learned = null, catalog = RECIPE_CATALOG } = {}) {
  let best = null;
  for (const { key, recipe } of compoundRecipes(catalog)) {
    if (recipe.learnt !== 0) continue;
    if (known.includes(String(recipe.id))) continue;
    const score = inputsMatch(recipe.inputs, given, true);
    if (score == null) continue;
    const skills = [...(recipe.skill ? [recipe.skill] : []), ...(recipe.skills || [])];
    if (Array.isArray(learned) && skills.some((s) => !learned.includes(s))) continue;
    if (!best || score < best.score) best = { key, score };
  }
  return best ? best.key : null;
}

// ---- The experiment -------------------------------------------------------------------------

/** common.js pretty_list(list, ' and '). */
function andList(list) {
  if (list.length < 2) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/**
 * Whether the pack still holds the mix (checkIngredients, tryToMake 584-588: "Not enough ingredients?").
 * @param {object} inv
 * @param {[string, number][]} given
 */
export function hasInputs(inv, given) {
  return given.length > 0 && given.every(([cls, n]) => EXPERIMENT_ELEMENTS.includes(cls) && n > 0 && countItem(inv, cls) >= n);
}

/**
 * finishMakingUnknown, once the wait is over. Mutates inv and pc.
 * @param {object} inv
 * @param {object} pc
 * @param {[string, number][]} given
 * @param {{ known?: string[], learned?: string[]|null, rng?: () => number, catalog?: object }} [opts]
 * @returns {{ ok: false, reason: 'ingredients'|'energy', lines: string[] }
 *   | { ok: false, reason: 'nothing', returned: boolean, xp: number, destroyed: [string, number][], lines: string[] }
 *   | { ok: true, key: string, recipe: object, energy: number, xp: number, used: { classTsid: string, qty: number }[],
 *       outputs: { classTsid: string, qty: number }[], destroyed: [string, number][], extraLine: string, activityLine: string }}
 */
export function runExperiment(inv, pc, given, opts = {}) {
  const catalog = opts.catalog || RECIPE_CATALOG;
  if (!hasInputs(inv, given)) return { ok: false, reason: 'ingredients', lines: ['Not enough ingredients?'] };
  const key = findBestMatch(given, { known: opts.known || [], learned: opts.learned ?? null, catalog });
  if (!key) {
    const rng = opts.rng || Math.random;
    if (rng() < RETURN_CHANCE) {
      return { ok: false, reason: 'nothing', returned: true, xp: 0, destroyed: [], lines: [NOTHING_LINE, RETURNED_LINE] };
    }
    let worth = 0;
    for (const [cls, n] of given) {
      worth += (Number(ITEM_CATALOG[cls]?.baseCost) || 0) * n;
      removeItem(inv, cls, n);
    }
    const xp = grantMoodXp(pc, Math.round(worth * FAILED_XP_SHARE));
    const lines = [NOTHING_LINE, DESTROYED_LINE];
    if (xp) lines.push(`That was a learning experience: +${xp} iMG.`);
    return { ok: false, reason: 'nothing', returned: false, xp, destroyed: given.map(([c, n]) => [c, n]), lines };
  }

  const recipe = catalog[key];
  const cost = Number(recipe.energyCost) || 0;
  // inc_making.js 1194-1198.
  if (cost && cost >= (Number(pc.energy) || 0)) return { ok: false, reason: 'energy', lines: ["You don't have enough energy."] };

  // making_execute_recipe: take the recipe's ingredients, give its outputs, energy, its iMG.
  for (const i of recipe.inputs || []) removeItem(inv, i.classTsid, i.qty);
  for (const o of recipe.outputs || []) addItem(inv, o.classTsid, o.qty);
  const energyLost = cost ? loseEnergy(pc, cost) : 0;
  const recipeXp = recipe.xpReward ? grantMoodXp(pc, recipe.xpReward) : 0;

  // 1243-1268: whatever was given beyond the recipe is destroyed.
  const required = Object.fromEntries((recipe.inputs || []).map((i) => [i.classTsid, i.qty]));
  const destroyed = [];
  for (const [cls, n] of given) {
    const extra = required[cls] ? n - required[cls] : n;
    if (extra > 0) {
      removeItem(inv, cls, extra);
      destroyed.push([cls, extra]);
    }
  }
  const extras = destroyed.map(([cls, n]) => pluralizeItem(n, cls));
  const extraLine = extras.length === 1
    ? `Your extra ${extras[0]} was destroyed in the process.`
    : extras.length ? `Your extra ${andList(extras)} were destroyed in the process.` : '';

  const bonus = grantMoodXp(pc, DISCOVERY_BONUS_XP);
  const xp = recipeXp + bonus;
  const energy = -Math.abs(energyLost);
  // 1294-1306: "-0" prints as "0".
  const activityLine = `You discovered how to make recipe ${recipe.name}! ${energy || 0} energy${xp ? `, +${xp}iMG` : ''}`;
  return {
    ok: true,
    key,
    recipe,
    energy,
    xp,
    used: (recipe.inputs || []).map((i) => ({ classTsid: i.classTsid, qty: i.qty, remain: countItem(inv, i.classTsid) })),
    outputs: (recipe.outputs || []).map((o) => ({ classTsid: o.classTsid, qty: o.qty })),
    destroyed,
    extraLine,
    activityLine,
  };
}

// ---- Saves ----------------------------------------------------------------------------------

/**
 * PURE: the compounds a save knows when the stamp first runs. A save from before the rule knew all
 * sixteen (any stored save at all); a new character, with no save, knows none.
 * @param {string|object|null} rawSave the save as stored, or null for a new character
 */
export function stampKnownCompounds(rawSave) {
  return rawSave ? [...COMPOUND_RECIPE_IDS] : [];
}

/** PURE: a stored list, compounds only, in recipe order. */
export function normalizeKnownCompounds(list) {
  if (!Array.isArray(list)) return [];
  const have = new Set(list.map(String));
  return COMPOUND_RECIPE_IDS.filter((id) => have.has(id));
}
