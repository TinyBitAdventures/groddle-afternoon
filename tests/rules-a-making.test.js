/**
 * rules-a making (2026-11-12): each recipe's iMG is capped per game day, as
 * glitch-GameServerJS players/inc_making.js 1534-1546 and 1554-1574, inc_stats.js
 * 748-768, config_prod.js 1327 (recipe_xp_caps) and player.js 1049 (new day) did it.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAKING_XP_CAP_LINE,
  RECIPE_CATALOG,
  capRecipeXp,
  craftRecipeBatch,
  ensureMakingItems,
  loadRecipeCatalogFromFile,
  makingXpCeiling,
} from '../public/js/making.js?v=ba3677f0';
import { createInventory } from '../public/js/inventory.js?v=f49c8998';
import { GAME_DAY_MS } from '../public/js/game-day.js?v=cf9afac0';
import { XP_FOR_LEVEL } from '../public/js/progression.js?v=72b2b22a';
import { normalizePlayerSnapshot } from '../public/js/player-save.js?v=69395d5b';

before(async () => {
  await loadRecipeCatalogFromFile(join(fileURLToPath(new URL('../public/assets/content', import.meta.url)), 'recipes.json'));
  ensureMakingItems();
});

describe('the ceiling by level (making_get_xp_ceiling 1554-1574)', () => {
  it('250 to level 5, 500 to 10, then a share of the level', () => {
    assert.equal(makingXpCeiling(0), 250);
    assert.equal(makingXpCeiling(XP_FOR_LEVEL[3]), 250, 'level 5');
    assert.equal(makingXpCeiling(XP_FOR_LEVEL[4]), 500, 'level 6');
    assert.equal(makingXpCeiling(XP_FOR_LEVEL[8]), 500, 'level 10');
    const l11 = XP_FOR_LEVEL[9];
    assert.equal(makingXpCeiling(l11), 0.10 * (XP_FOR_LEVEL[10] - XP_FOR_LEVEL[9]), 'level 11: 10%');
    const l31 = XP_FOR_LEVEL[29];
    assert.equal(makingXpCeiling(l31), 0.05 * (XP_FOR_LEVEL[30] - XP_FOR_LEVEL[29]), 'level 31: 5%');
    assert.equal(makingXpCeiling(XP_FOR_LEVEL[58]), 85447.4, 'level 60');
  });
});

describe('a recipe\'s iMG is capped per game day (inc_stats.js 748-768)', () => {
  it('gives what fits, then nothing, per recipe; a new game day starts over', () => {
    const pc = { xp: 0 };
    const t = 1_700_000_000_000;
    assert.deepEqual(capRecipeXp(pc, '7', 240, t), { actual: 240, capped: false });
    assert.deepEqual(capRecipeXp(pc, '7', 20, t), { actual: 10, capped: true });
    assert.deepEqual(capRecipeXp(pc, '7', 20, t), { actual: 0, capped: true });
    assert.deepEqual(capRecipeXp(pc, '8', 20, t), { actual: 20, capped: false }, 'another recipe has its own');
    assert.deepEqual(capRecipeXp(pc, '7', 20, t + GAME_DAY_MS), { actual: 20, capped: false });
  });

  it('a batch past the cap says the source line and gives no more iMG', () => {
    const recipe = RECIPE_CATALOG.change_orange;
    const pc = { energy: 100, mood: 50, moodMax: 100, imagination: 0, xp: 0 };
    capRecipeXp(pc, recipe.id, 250);
    const inv = createInventory({ cherry: 3, fruit_changing_machine: 1 });
    const r = craftRecipeBatch(inv, pc, 'change_orange', 1);
    assert.equal(r.ok, true, r.msgs?.join(' '));
    assert.equal(pc.imagination, 0);
    assert.equal(r.result.xp, 0);
    assert.ok(r.result.activityLine.includes(MAKING_XP_CAP_LINE));
  });

  it('the day\'s counts survive a reload', () => {
    const p = normalizePlayerSnapshot({ recipeXpToday: { day: 'd1', recipes: { 7: 120 } } });
    assert.deepEqual(p.recipeXpToday, { day: 'd1', recipes: { 7: 120 } });
    assert.equal(normalizePlayerSnapshot({}).recipeXpToday, undefined);
  });
});
