/**
 * Quest-taught recipes (G437): holds the one stamp js/recipe-memory.js decides at first load, and
 * says "You learned how to make X!" when a quest teaches one (players/inc_making.js 1476).
 * game.js calls stampOnce after the save loads; making.js recipeKnown reads the kept list through
 * query('keptRecipes'). Canvas: recipesKept (the ids, or "none"), recipesStamped.
 */
import { RECIPE_CATALOG } from '../making.js?v=86fd3231';
import { normalizeKeptRecipes, stampKeptRecipes } from '../recipe-memory.js?v=3c72d749';

export const RECIPE_MEMORY_FEATURE_ID = 'recipe-memory';

let stamped = false;
let kept = [];
/** Completed quests seen: null until the first tick, so a loaded save's old quests say nothing. */
let seenQuests = null;

function publish(engine) {
  engine?.setData?.('recipesStamped', stamped ? '1' : '0');
  engine?.setData?.('recipesKept', kept.length ? kept.join(',') : 'none');
}

/** PURE: what a just-finished quest teaches and the player didn't already keep (making_try_learn_recipe). */
export function recipesLearnedFrom(questId, catalog, keptIds = []) {
  return Object.values(catalog || {}).filter((r) => r?.taughtBy === questId && !keptIds.includes(String(r.id)));
}

export const recipeMemoryFeature = {
  id: RECIPE_MEMORY_FEATURE_ID,

  save() {
    return { stamped, kept: [...kept] };
  },

  restore(slice) {
    stamped = slice?.stamped === true;
    kept = stamped ? normalizeKeptRecipes(slice.kept) : [];
    seenQuests = null;
  },

  /** Once per save, ever: a stamp already in the save stands. */
  stampOnce(rawSave, engine) {
    if (!stamped) {
      kept = stampKeptRecipes(rawSave);
      stamped = true;
    }
    publish(engine);
  },

  keptRecipes() {
    return kept;
  },

  onTick(_dtMs, _now, engine) {
    const done = engine.questState?.completed;
    if (!Array.isArray(done)) return;
    if (!seenQuests) {
      seenQuests = new Set(done);
      return;
    }
    if (done.length === seenQuests.size) return;
    for (const questId of done) {
      if (seenQuests.has(questId)) continue;
      seenQuests.add(questId);
      for (const recipe of recipesLearnedFrom(questId, RECIPE_CATALOG, kept)) {
        engine.pushActivity(`You learned how to make ${recipe.name}!`);
      }
    }
  },
};
