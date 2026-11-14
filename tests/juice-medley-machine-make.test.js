/**
 * Juice Medley Melee (blending_make_level1_recipes) counts a juice the moment it is made, by
 * recipe (GSJS players/inc_making.js 888 quests_made_recipe; quests/quest.js made_recipe 559-572),
 * whatever happens to the juice after: a full pack's Magic Rock takes it and it still counted.
 *
 * What lost one: the Make window opened on a machine (a home or machine-room Fuelmaker) leads Back
 * to every tool, and a Blender recipe picked there was handed to the Fuelmaker as its job. The job
 * took the fruit, and at its end game.js makeStationJob crafted it on the machine's hold, which
 * holds no Blender: nothing made, no making_recipe event, the quest never counted it (the juice
 * still waited in the machine). Glitch only made a machine's own recipes on it
 * (inc_making.js making_make_known 280-291). Now only the machine's own tool's recipes go to it;
 * any other is made with the pack's tool and counts (js/make-tools.js stationForRecipe).
 *
 * Run: node --test tests/juice-medley-machine-make.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=40c71a37';
import { acceptOffer, routeQuestEvent } from '../public/js/quest-offers.js?v=89511e1e';
import { RECIPE_CATALOG, craftRecipe, loadRecipeCatalogFromFile } from '../public/js/making.js?v=96a16677';
import { stationForRecipe } from '../public/js/make-tools.js?v=86877c3e';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'public/assets/content');
const QUEST = 'blending_make_level1_recipes';
const FUELMAKER = Object.freeze({ tool: 'fuelmaker', startJob: () => true });

before(async () => {
  await loadContentCatalogsFromDir(CONTENT);
  await loadRecipeCatalogFromFile(join(CONTENT, 'recipes.json'));
});

const pc = () => ({ energy: 500, mood: 100, imagination: 0, xp: 0, level: 10 });
const opts = { learned: ['blending_1'], requireSkill: true, requireTool: true };

/** What game.js noteMadeUnit routes for one made unit: making_recipe:<key>. */
function makeAndRoute(state, inv, key, craftOptions) {
  const result = craftRecipe(inv, pc(), key, craftOptions);
  if (result.ok) routeQuestEvent(state, `making_recipe:${key}`, 1);
  return result;
}

describe('Juice Medley Melee: a juice made from a machine window counts', () => {
  it('a machine takes only its own tool\'s recipes (stationForRecipe)', () => {
    assert.equal(stationForRecipe(FUELMAKER, RECIPE_CATALOG.fruity_juice), null);
    assert.equal(stationForRecipe(FUELMAKER, RECIPE_CATALOG.fuel_cell), FUELMAKER);
    assert.equal(stationForRecipe(null, RECIPE_CATALOG.fruity_juice), null);
    assert.equal(stationForRecipe(FUELMAKER, null), null);
  });

  it('the old hand-off made nothing on the machine, so the quest never counted', () => {
    const state = createQuestState();
    assert.equal(acceptOffer(state, QUEST, {}).ok, true);
    // The Fuelmaker's job hold: the fruit went in, no Blender (game.js makeStationJob).
    const hold = { cherry: 4, plum: 2, orange: 1 };
    const res = makeAndRoute(state, hold, 'fruity_juice', { ...opts, stationTool: 'fuelmaker' });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'tool');
    assert.equal(state.active[QUEST].progress.r30, 0);
  });

  it('made with the pack\'s Blender instead, it counts like any other make', () => {
    const state = createQuestState();
    acceptOffer(state, QUEST, {});
    const inv = { blender: 1, cherry: 4, plum: 2, orange: 6, lemon: 5 };
    const station = stationForRecipe(FUELMAKER, RECIPE_CATALOG.fruity_juice);
    const craftOptions = { ...opts, ...(station ? { stationTool: station.tool, station } : {}) };
    assert.equal(makeAndRoute(state, inv, 'fruity_juice', craftOptions).ok, true);
    assert.equal(state.active[QUEST].progress.r30, 1);
    assert.equal(inv.fruity_juice, 1);
    makeAndRoute(state, inv, 'lemon_juice', craftOptions);
    const last = craftRecipe(inv, pc(), 'orange_juice', craftOptions);
    assert.equal(last.ok, true);
    const r = routeQuestEvent(state, 'making_recipe:orange_juice', 1);
    assert.deepEqual(r.completable.map((row) => row.classTsid), [QUEST]);
  });

  it('game.js hands a job to the machine only for its own tool\'s recipe', () => {
    const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
    const run = game.slice(game.indexOf('function runMakeCraft('), game.indexOf('function showMakeResult('));
    assert.match(run, /const opts = craftOpts\(recipe\);/);
    assert.match(run, /if \(typeof opts\.station\?\.startJob === 'function'\)/);
    assert.doesNotMatch(run, /makeStation\.startJob/);
    const opt = game.slice(game.indexOf('function craftOpts('), game.indexOf('function itemIconUrl('));
    assert.match(opt, /const station = recipe \? stationForRecipe\(makeStation, recipe\) : makeStation;/);
    assert.match(opt, /toolState: station\?\.toolState \|\| toolState,/);
  });
});
