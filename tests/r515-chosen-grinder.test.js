/**
 * #515 (part a): crushing with the Grand Ol' Grinder hit the plain Grinder's limit. Since G1026
 * (#507) a crush checks its whole run's wear before it starts, but against the first owned Grinder
 * in a fixed order that could take one unit (tools.js firstWorkingTool), not the tool the player
 * opened Make from: a worn Grinder refused a batch the Grand Ol' Grinder could do, and took the wear.
 * Glitch's crush was a verb on the clicked tool (ore_grinder.js, grand_ol_grinder.js 530), so the
 * tool whose Make is open (game.js craftOpts useTool) now makes and wears.
 * Run: node --test tests/r515-chosen-grinder.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  RECIPE_CATALOG,
  VERB_WORN_LINES,
  canCraft,
  craftRecipeBatch,
  recipeToolChosen,
  setRecipeCatalog,
  verbBatchWornLine,
} from '../public/js/making.js?v=2a62a71a';
import { createToolConditionState, getToolCondition, setToolRemaining } from '../public/js/tools.js?v=4156bba8';

const root = join(import.meta.dirname, '..');
setRecipeCatalog(JSON.parse(readFileSync(join(root, 'public/assets/content/recipes.json'), 'utf8')));
const CRUSH = RECIPE_CATALOG.crush_dullite;

/** A pack with both Grinders, the plain one down to 5 uses. */
function setup() {
  const inv = { dullite: 300, ore_grinder: 1, grand_ol_grinder: 1, bag_elemental_pouch: 1 };
  const toolState = createToolConditionState();
  setToolRemaining(toolState, 'ore_grinder', 5);
  const pc = { energy: 5000, maxEnergy: 5000, mood: 100, maxMood: 100, imagination: 0, xp: 0, level: 20, imaginationUpgrades: [] };
  return { inv, toolState, pc, opts: { learned: ['refining_1'], upgrades: [], toolState, rng: () => 0.99, requireTool: true } };
}

describe('#515 the Grinder you clicked does the crushing', () => {
  it('the asked tool is the one worn, when it makes the recipe and the pack holds it', () => {
    const { inv, opts } = setup();
    assert.equal(recipeToolChosen(inv, CRUSH, opts, 1), 'ore_grinder', 'no asked tool: the first that can take a unit, as before');
    assert.equal(recipeToolChosen(inv, CRUSH, { ...opts, useTool: 'grand_ol_grinder' }, 1), 'grand_ol_grinder');
    assert.equal(recipeToolChosen(inv, CRUSH, { ...opts, useTool: 'ore_grinder' }, 1), 'ore_grinder');
    assert.equal(recipeToolChosen(inv, CRUSH, { ...opts, useTool: 'smelter' }, 1), 'ore_grinder', 'a tool that does not make it is ignored');
    assert.equal(recipeToolChosen({ ...inv, grand_ol_grinder: 0 }, CRUSH, { ...opts, useTool: 'grand_ol_grinder' }, 1), 'ore_grinder', 'nor one not in the pack');
    assert.equal(recipeToolChosen(inv, CRUSH, { ...opts, stationTool: 'ore_grinder', useTool: 'grand_ol_grinder' }, 1), 'ore_grinder', 'a machine at its station is itself');
  });

  it('a 300 Dullite crush on the Grand Ol\' Grinder is not refused for the worn Grinder', () => {
    const { inv, opts } = setup();
    assert.equal(verbBatchWornLine(inv, CRUSH, 300, opts), VERB_WORN_LINES.ore_grinder, 'the old pick: the 5-use Grinder');
    assert.equal(verbBatchWornLine(inv, CRUSH, 300, { ...opts, useTool: 'grand_ol_grinder' }), null, '500 uses take 100');
    assert.equal(verbBatchWornLine(inv, CRUSH, 300, { ...opts, useTool: 'ore_grinder' }), VERB_WORN_LINES.ore_grinder, 'the Grinder clicked: its own limit');
  });

  it('the run wears the Grand Ol\' Grinder, not the Grinder', () => {
    const { inv, pc, toolState, opts } = setup();
    const ask = { ...opts, useTool: 'grand_ol_grinder' };
    assert.equal(canCraft(inv, CRUSH, ask).ok, true);
    const out = craftRecipeBatch(inv, pc, 'crush_dullite', 30, ask);
    assert.equal(out.ok, true, String(out.msgs));
    assert.equal(out.made, 30);
    assert.equal(getToolCondition(toolState, 'ore_grinder').remaining, 5, 'the Grinder untouched');
    assert.equal(getToolCondition(toolState, 'grand_ol_grinder').remaining, 480, 'its wear: 2 a use over a third of the chunks');
  });

  it('a broken Grinder clicked refuses, though the Grand Ol\' Grinder works', () => {
    const { inv, toolState, opts } = setup();
    setToolRemaining(toolState, 'ore_grinder', 0);
    const check = canCraft(inv, CRUSH, { ...opts, useTool: 'ore_grinder' });
    assert.equal(check.ok, false);
    assert.equal(check.tool, 'ore_grinder');
    assert.equal(canCraft(inv, CRUSH, opts).ok, true, 'from no tool screen the working one still makes it');
  });

  it('game.js passes the open tool screen\'s tool into craftOpts', () => {
    const src = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(src, /\.\.\.\(!station && makeView === 'tool' && makeToolFilter && makeToolFilter !== 'all' \? \{ useTool: makeToolFilter \} : \{\}\)/);
    assert.match(src, /const toolInUse = recipeToolChosen\(inv, recipe,/);
  });
});
