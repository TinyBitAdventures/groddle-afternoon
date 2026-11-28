/**
 * #507 (G1026): Spin Doctor (2,051 Fiber in one spin) was impossible: the spin, smelt and crush recipes
 * had no task limit, so the remake's flat 99 capped a spin at 693 Fiber. The source's verbs (spindle.js
 * / splendid_spindle.js spin, smelter.js smelt, ore_grinder.js crush) had none: the count chooser went
 * to what the pack held, with the energy check; the run's duration was the package's plus add_duration,
 * and the tool took the whole run's wear at once.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_TASK_LIMIT,
  RECIPE_CATALOG,
  VERB_WORN_LINES,
  craftDurationFor,
  craftRecipeBatch,
  craftUnitDurations,
  isVerbBatchRecipe,
  recipeTaskLimit,
  setRecipeCatalog,
  verbBatchWornLine,
} from '../public/js/making.js?v=4d75f062';
import { getToolCondition, createToolConditionState } from '../public/js/tools.js?v=4156bba8';
import { makingOutputAchievementCounters } from '../public/js/achievements.js?v=ee438ab0';

const root = join(import.meta.dirname, '..');
const recipes = JSON.parse(readFileSync(join(root, 'public/assets/content/recipes.json'), 'utf8'));
setRecipeCatalog(recipes);

const VERB_RECIPES = ['plain_metal', 'crush_dullite', 'crush_beryl', 'crush_sparkly', 'crush_barnacle', 'spin_thread', 'spin_thread_splendid'];

describe('#507 the verb recipes take no task limit', () => {
  it('exactly the seven verb recipes are uncapped; a recipe without a limit elsewhere keeps 99', () => {
    const uncapped = Object.keys(RECIPE_CATALOG).filter((k) => recipeTaskLimit(RECIPE_CATALOG[k]) === Infinity).sort();
    assert.deepEqual(uncapped, [...VERB_RECIPES].sort());
    for (const k of VERB_RECIPES) assert.ok(isVerbBatchRecipe(RECIPE_CATALOG[k]), k);
    const other = Object.values(RECIPE_CATALOG).find((r) => !r.taskLimit && !isVerbBatchRecipe(r));
    assert.equal(recipeTaskLimit(other), DEFAULT_TASK_LIMIT);
  });

  it('the count chooser goes to what the pack holds and the energy allows (game.js maxMake)', () => {
    const src = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(src, /let m = recipeTaskLimit\(recipe, pc\.imaginationUpgrades\);\s*for \(const inp of recipe\.inputs \|\| \[\]\) \{\s*m = Math\.min\(m, Math\.floor\(recipeInputHave/);
    // The same sum for 2,051 Fiber and 1,000 energy: 293 Thread.
    let m = recipeTaskLimit(RECIPE_CATALOG.spin_thread_splendid);
    m = Math.min(m, Math.floor(2051 / 7));
    m = Math.min(m, Math.ceil(1000 / 1) - 1);
    assert.equal(m, 293);
  });

  it('a run lasts the package\'s duration plus the source\'s add_duration, laid over the units', () => {
    const spin = craftUnitDurations(RECIPE_CATALOG.spin_thread, 293, ['fiber_arts_1']);
    assert.equal(spin.length, 293);
    const base = craftDurationFor(RECIPE_CATALOG.spin_thread, ['fiber_arts_1']);
    // spindle.js 389-391: min(t, 10) * 200 + (t - 10) * 100.
    assert.equal(spin.reduce((a, b) => a + b, 0), base + 10 * 200 + 283 * 100);
    const smelt = craftUnitDurations(RECIPE_CATALOG.plain_metal, 10, ['smelting_1']);
    // smelter.js 524-530: 2 + 1.6 + 1.2 + 0.8 + 0.4 s, then 0.4 s an ingot.
    assert.equal(smelt.reduce((a, b) => a + b, 0), craftDurationFor(RECIPE_CATALOG.plain_metal, ['smelting_1']) + 6000 + 5 * 400);
    const crush = craftUnitDurations(RECIPE_CATALOG.crush_beryl, 20, ['refining_1'], ['refining_time_2']);
    // ore_grinder.js 506-515: 0.2 s a chunk to 10, then 0.1 s; Refined Speed II takes 40% off.
    assert.equal(Math.round(crush.reduce((a, b) => a + b, 0)), craftDurationFor(RECIPE_CATALOG.crush_beryl, ['refining_1'], ['refining_time_2']) + Math.round((10 * 200 + 10 * 100) * 0.6));
  });

  it('a 293 Thread spin on a Splendid Spindle runs end to end, fast: Fiber, Thread, energy, wear and Spin Doctor', () => {
    const inv = { fiber: 2051, splendid_spindle: 1 };
    const pc = { energy: 1000, maxEnergy: 1000, mood: 100, maxMood: 100, imagination: 0, xp: 0, level: 10, imaginationUpgrades: [] };
    const toolState = createToolConditionState();
    const opts = { learned: ['fiber_arts_1'], upgrades: [], toolState, rng: () => 0.99 };
    assert.equal(verbBatchWornLine(inv, RECIPE_CATALOG.spin_thread_splendid, 293, opts), null, '500 uses take 293');
    const t0 = performance.now();
    const out = craftRecipeBatch(inv, pc, 'spin_thread_splendid', 293, opts);
    const ms = performance.now() - t0;
    assert.equal(out.ok, true, String(out.msgs));
    assert.equal(out.made, 293);
    assert.equal(inv.fiber || 0, 0);
    assert.equal(inv.thread, 293);
    assert.equal(pc.energy, 1000 - 293);
    assert.equal(getToolCondition(toolState, 'splendid_spindle').remaining, 500 - 293);
    assert.ok(ms < 2000, `the batch took ${ms} ms`);
    assert.deepEqual(makingOutputAchievementCounters('splendid_spindle', RECIPE_CATALOG.spin_thread_splendid.outputs, { unitIndex: 293, batchQty: 293 }), [{ counter: 'spun:two_thousand_fiber', amount: 1 }]);
  });

  it('a Spindle with too few uses refuses the whole run with the source\'s line (spindle.js 397)', () => {
    const inv = { fiber: 2051, spindle: 1 };
    const toolState = createToolConditionState();
    const opts = { learned: ['fiber_arts_1'], upgrades: [], toolState };
    assert.equal(verbBatchWornLine(inv, RECIPE_CATALOG.spin_thread, 293, opts), VERB_WORN_LINES.spindle);
    assert.equal(verbBatchWornLine(inv, RECIPE_CATALOG.spin_thread, 100, opts), null, 'a full Spindle has 100 uses');
    assert.match(readFileSync(join(root, 'public/game.js'), 'utf8'), /const worn = verbBatchWornLine\(inv, recipe, n, opts\);/);
  });
});
