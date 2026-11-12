/**
 * #219 (live, Froughtful Fen): the Crystalmalizing Chamber's Plain Crystal took 7 Barnacle Talc and
 * 7 Firefly Jars, full or empty, and used the jars up. That was catalog_recipes.js recipe 304, whose
 * verb (crystallizer.js crystalize) Glitch switched off (conditions return state null, 349-351).
 * The live verb was crystalmalize (274-327): one full Firefly Jar (num_flies 7) and 7 Barnacle Talc,
 * "You need a full Firefly Jar." otherwise; onCrystalizeComplete (389-401) empties the jar, keeps it,
 * destroys the talc and makes one crystal; the crystallizing skill package costs 10 energy.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  FULL_JAR_LINE,
  RECIPE_CATALOG,
  canCraft,
  craftRecipe,
  ensureMakingItems,
  loadRecipeCatalogFromFile,
  recipeBlockedLine,
  recipeInputHave,
} from '../public/js/making.js?v=5338cc7e';
import { bindToolInventory, createToolConditionState, setToolRemaining, toolCopies } from '../public/js/tools.js?v=62b37c51';
import { economyTransforms } from '../tools/build-economy.mjs';

const root = join(import.meta.dirname, '..');
const recipesPath = join(root, 'public/assets/content/recipes.json');

function rig(jars) {
  const inv = { crystallizer: 1, barnacle_talc: 14, firefly_jar: jars.length };
  const toolState = bindToolInventory(createToolConditionState(), inv);
  jars.forEach((flies, copy) => setToolRemaining(toolState, 'firefly_jar', flies, { copy }));
  return { inv, toolState, pc: { energy: 200, xp: 0, imagination: 0 } };
}

const opts = (toolState) => ({ learned: ['crystalography_1'], requireSkill: true, requireTool: true, toolState, upgrades: [] });

describe('#219 a crystal takes a full Firefly Jar, kept, and 7 Barnacle Talc', () => {
  before(async () => {
    await loadRecipeCatalogFromFile(recipesPath);
    ensureMakingItems();
  });

  it('the recipe is the live verb\'s', () => {
    const r = RECIPE_CATALOG.plain_crystal;
    assert.deepEqual(r.inputs, [{ classTsid: 'barnacle_talc', qty: 7 }, { classTsid: 'firefly_jar', qty: 1, full: 7 }]);
    assert.equal(r.energyCost, 10);
    assert.equal(r.toolWear, 25);
    assert.match(r.source, /crystalmalize 274-327/);
  });

  it('empty or part-full jars are refused with the original line', () => {
    const { inv, toolState } = rig([0, 6]);
    assert.equal(toolCopies(toolState, 'firefly_jar').length, 2);
    assert.equal(recipeInputHave(inv, RECIPE_CATALOG.plain_crystal.inputs[1], toolState), 0);
    const check = canCraft(inv, RECIPE_CATALOG.plain_crystal, opts(toolState));
    assert.equal(check.ok, false);
    assert.equal(check.reason, 'ingredients');
    assert.equal(recipeBlockedLine(RECIPE_CATALOG.plain_crystal, check, { inv }), FULL_JAR_LINE);
  });

  it('a full jar makes one crystal: talc used, the jar kept and emptied', () => {
    const { inv, toolState, pc } = rig([3, 7]);
    const r = craftRecipe(inv, pc, 'plain_crystal', opts(toolState));
    assert.equal(r.ok, true, r.msgs?.join(' '));
    assert.equal(inv.plain_crystal, 1);
    assert.equal(inv.barnacle_talc, 7);
    assert.equal(inv.firefly_jar, 2, 'the jars stay');
    assert.deepEqual(toolCopies(toolState, 'firefly_jar').map((c) => c.remaining), [3, 0], 'the full one is emptied');
    assert.equal(pc.energy, 190);
    const again = craftRecipe(inv, pc, 'plain_crystal', opts(toolState));
    assert.equal(again.ok, false);
    assert.deepEqual(again.msgs, [FULL_JAR_LINE]);
  });

  it('the ledger explains a crystal by the talc alone (tools/build-economy.mjs)', () => {
    const t = economyTransforms(new Set(['barnacle_talc', 'firefly_jar', 'plain_crystal'])).find((x) => x.s === 'recipe:plain_crystal');
    assert.deepEqual(t, { s: 'recipe:plain_crystal', i: { barnacle_talc: 7 }, o: { plain_crystal: 1 } });
  });

  it('the Make panel counts and names the full jar', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /if \(input\.full > 0\) return `full \$\{label\}`;/);
    assert.match(game, /const have = recipeInputHave\(inv, i, opts\.toolState\);/);
  });
});
