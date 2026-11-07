/**
 * The sixteen recipes the original's quests teach (G437; each `learnt: 2` with an empty skills
 * list in items/catalog_recipes.js, so nothing else teaches them): each quest's onComplete calls
 * making_try_learn_recipe (players/inc_making.js 1456-1477), and until then the client won't
 * make them (making_recipe_request 1682-1696, MakingComponentUI.as 264).
 *
 * The remake showed them from the start, so saves from before the gate may hold players who made
 * them. Austin's ruling (2026-11-07): anyone who already made one keeps it, and no one loses a
 * recipe to a gap in the records. A save has no list of recipes made, so one stamp at first load
 * decides, and is kept in the save (features/recipe-memory-feature.js):
 *   - foods: what systems.achievements.groups.making_food lists (cooking tools by hand or in a room);
 *   - powders: all eight for anyone who has ever used a Beaker (nothing records them one by one);
 *   - all sixteen for a Craftybot's owner (the bot records nothing);
 *   - all sixteen for a save with no achievement data to read (fails open).
 * A new player, with no save at all, keeps none. This over-keeps on purpose: it takes nothing.
 * The stamp never runs twice, so buying a Beaker or a bot later unlocks nothing.
 */

/** Recipe id -> { key: recipes.json key and output class, quest: the quest that teaches it }. */
export const TAUGHT_FOODS = Object.freeze({
  98: Object.freeze({ key: 'berry_bowl', quest: 'ezcooking_make_level1_recipes' }), // ezcooking_make_level1_recipes.js 55
  101: Object.freeze({ key: 'lotsa_lox', quest: 'ezcooking_make_level1_recipes' }), // :56
  19: Object.freeze({ key: 'best_bean_dip', quest: 'cheffery_make_level1_recipes' }), // cheffery_make_level1_recipes.js 55
  20: Object.freeze({ key: 'gammas_pancakes', quest: 'cheffery_make_level1_recipes' }), // :56
  5: Object.freeze({ key: 'hash', quest: 'cheffery_make_level1_recipes' }), // :57
  56: Object.freeze({ key: 'cloud_11_smoothie', quest: 'blending_make_level1_recipes' }), // blending_make_level1_recipes.js 55
  66: Object.freeze({ key: 'carrot_margarita', quest: 'cocktailcrafting_make_level1_recipes' }), // cocktailcrafting_make_level1_recipes.js 49
  25: Object.freeze({ key: 'papl_upside_down_pizza', quest: 'grilling_make_level1_recipes' }), // grilling_make_level1_recipes.js 49
});

export const TAUGHT_POWDERS = Object.freeze({
  167: Object.freeze({ key: 'fairly_hallowed_shrine_powder', quest: 'intermediateadmixing_make_powder' }), // intermediateadmixing_make_powder.js 43
  164: Object.freeze({ key: 'powder_of_mild_fecundity', quest: 'intermediateadmixing_make_powder' }), // :44
  171: Object.freeze({ key: 'sneezing_powder', quest: 'intermediateadmixing_make_powder' }), // :45
  162: Object.freeze({ key: 'fertilidust', quest: 'intermediateadmixing_make_more_powders' }), // intermediateadmixing_make_more_powders.js 49
  163: Object.freeze({ key: 'extremely_hallowed_shrine_powder', quest: 'intermediateadmixing_make_more_powders' }), // :50
  166: Object.freeze({ key: 'powder_of_startling_fecundity', quest: 'intermediateadmixing_make_more_powders' }), // :51
  168: Object.freeze({ key: 'no_no_powder', quest: 'intermediateadmixing_make_more_powders' }), // :52
  169: Object.freeze({ key: 'sparkle_powder', quest: 'intermediateadmixing_make_more_powders' }), // :53
});

/** The badges counting making_tool:beaker: progress in one, or having one, means a Beaker was used. */
export const BEAKER_BADGES = Object.freeze(['entrylevel_admixificator', 'midlevel_admixificator', 'senior_admixificator']);

const FOOD_IDS = Object.keys(TAUGHT_FOODS);
const POWDER_IDS = Object.keys(TAUGHT_POWDERS);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * PURE: the recipe ids a save keeps, from the save as it was stored (before normalizing, which
 * would make missing achievement data look empty).
 * @param {string|object|null} raw
 * @returns {string[]}
 */
export function stampKeptRecipes(raw) {
  if (!raw) return [];
  let save = raw;
  if (typeof raw === 'string') {
    try {
      save = JSON.parse(raw);
    } catch {
      return [...FOOD_IDS, ...POWDER_IDS];
    }
  }
  const achievements = save?.systems?.achievements;
  if (!isRecord(achievements) || !isRecord(achievements.groups)) return [...FOOD_IDS, ...POWDER_IDS];
  if (save.systems.features?.craftybot?.owned === true) return [...FOOD_IDS, ...POWDER_IDS];
  const foods = new Set(Array.isArray(achievements.groups.making_food) ? achievements.groups.making_food : []);
  const kept = FOOD_IDS.filter((id) => foods.has(TAUGHT_FOODS[id].key));
  const unlocked = Array.isArray(achievements.unlocked) ? achievements.unlocked : [];
  const usedBeaker = BEAKER_BADGES.some((id) => unlocked.includes(id) || Number(achievements.progress?.[id]?.progress?.beaker) > 0);
  return usedBeaker ? [...kept, ...POWDER_IDS] : kept;
}

/** PURE: a stored slice's recipe ids (the taught ones only). */
export function normalizeKeptRecipes(list) {
  const known = new Set([...FOOD_IDS, ...POWDER_IDS]);
  return Array.isArray(list) ? [...new Set(list.map(String))].filter((id) => known.has(id)) : [];
}
