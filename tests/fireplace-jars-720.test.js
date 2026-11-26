import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { join } from 'node:path';
import { RECIPE_CATALOG, craftRecipe, craftRecipeBatch, ensureMakingItems, loadRecipeCatalogFromFile, recipeInputHave } from '../public/js/making.js?v=96afba25';
import { TOOL_CONDITION_CATALOG, bindToolInventory, createToolConditionState, setToolRemaining, toolCopies } from '../public/js/tools.js?v=4156bba8';

const root = join(import.meta.dirname, '..');
const OPTS = { learned: ['furnituremaking_1', 'furnituremaking_2'], requireSkill: true, requireTool: true, upgrades: [] };

/** A pack with jars holding `flies` (in pack order) and enough for `n` Fireplaces. */
function pack(flies, n = 1) {
  const inv = { construction_tool: 1, board: 16 * n, dullite: 120 * n, barnacle_talc: 16 * n, firefly_jar: flies.length };
  const toolState = bindToolInventory(createToolConditionState(), inv);
  flies.forEach((f, copy) => setToolRemaining(toolState, 'firefly_jar', f, { copy }));
  return { inv, toolState };
}
const left = (toolState) => toolCopies(toolState, 'firefly_jar').map((c) => c.remaining);

// #720 (Austin 2026-11-26): a recipe taking Firefly Jars (the Fireplace, catalog_recipes.js 321: 7, any fill)
// spends the empty jars first, then the least full. Glitch took bag order (inc_making checkItemsInBag /
// items_destroy); this choice is ours (tools/inventions/inventions.json making-spends-emptiest-jars).
describe('#720 a recipe spends empty Firefly Jars before full ones', () => {
  before(async () => {
    await loadRecipeCatalogFromFile(join(root, 'public/assets/content/recipes.json'));
    ensureMakingItems();
  });

  it('the Fireplace takes 7 jars of any fill', () => {
    const r = RECIPE_CATALOG.furniture_fireplace;
    const jars = r.inputs.find((i) => i.classTsid === 'firefly_jar');
    assert.equal(jars.qty, 7);
    assert.ok(!(jars.full > 0));
    const { inv, toolState } = pack([0, 7, 3, 0, 0, 1, 2, 7]);
    assert.equal(recipeInputHave(inv, jars, toolState), 8);
  });

  it('the full jar stays when an empty one could go', () => {
    const { inv, toolState } = pack([0, 7, 3, 0, 0, 1, 2, 7]);
    const r = craftRecipe(inv, { energy: 1000, xp: 0, imagination: 0 }, 'furniture_fireplace', { ...OPTS, toolState });
    assert.equal(r.ok, true, r.msgs?.join(' '));
    assert.equal(inv.firefly_jar, 1);
    assert.deepEqual(left(toolState), [7]);
  });

  it('the fullest jars stay, in their pack order', () => {
    const { inv, toolState } = pack([7, 0, 4, 0, 0, 0, 0, 0, 6, 0]);
    const r = craftRecipe(inv, { energy: 1000, xp: 0, imagination: 0 }, 'furniture_fireplace', { ...OPTS, toolState });
    assert.equal(r.ok, true, r.msgs?.join(' '));
    assert.deepEqual(left(toolState), [7, 4, 6]);
  });

  it('jars of the same fill go as before (the last ones)', () => {
    const { inv, toolState } = pack([7, 7, 7, 7, 7, 7, 7, 7, 7]);
    craftRecipe(inv, { energy: 1000, xp: 0, imagination: 0 }, 'furniture_fireplace', { ...OPTS, toolState });
    assert.deepEqual(left(toolState), [7, 7]);
  });

  it('a batch spends the empties across its units', () => {
    const { inv, toolState } = pack([7, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 5], 2);
    const out = craftRecipeBatch(inv, { energy: 2000, xp: 0, imagination: 0 }, 'furniture_fireplace', 2, { ...OPTS, toolState });
    assert.equal(out.made ?? out.result?.made ?? 2, 2);
    assert.equal(inv.firefly_jar, 2);
    assert.deepEqual(left(toolState), [7, 5]);
  });

  it('the Firefly Jar is the only recipe input with a fill or charge kept per copy', () => {
    const kept = new Set();
    for (const r of Object.values(RECIPE_CATALOG)) {
      for (const i of r.inputs || []) if (TOOL_CONDITION_CATALOG[i.classTsid]) kept.add(i.classTsid);
    }
    assert.deepEqual([...kept], ['firefly_jar']);
  });
});
