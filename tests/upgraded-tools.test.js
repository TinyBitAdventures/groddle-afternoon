/**
 * G179: the Grand Ol' Grinder and the High-Class Hoe (Tinkertool recipes 219
 * and 220, catalog_recipes.js 4515-4555) and the work they do: either grinder
 * crushes (dullite.js:108,126), a High-Class Hoe is tried before a Hoe
 * (include/garden.js:233-238, patch.js:393-402).
 * Run: node --test tests/upgraded-tools.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECIPE_CATALOG,
  TOOL_CATALOG,
  canCraft,
  craftRecipe,
  ensureMakingItems,
  hasTool,
  listRecipesForTool,
  loadRecipeCatalogFromFile,
  recipeToolFor,
  recipeToolInUse,
} from '../public/js/making.js';
import { ITEM_CATALOG, countItem, createInventory } from '../public/js/inventory.js?v=catalog-unified-3';
import {
  GRINDER_TOOLS,
  HOE_TOOLS,
  TOOL_CONDITION_CATALOG,
  createToolConditionState,
  firstWorkingTool,
  getToolCondition,
  setToolRemaining,
} from '../public/js/tools.js?v=tools-4';
import { crushOre } from '../public/js/mining.js';
import { clearPlot, createGarden, getPlot, hasHoe } from '../public/js/garden.js';
import { createPlot, performPlotVerb, plotVerbs } from '../public/js/patches.js';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const content = join(pub, 'assets/content');
const json = (name) => JSON.parse(readFileSync(join(content, name), 'utf8'));

before(async () => {
  await loadRecipeCatalogFromFile(join(content, 'recipes.json'));
  ensureMakingItems();
});

describe('recipes 219 and 220 (catalog_recipes.js 4515-4555)', () => {
  it('are imported with the source numbers and no longer skipped', () => {
    const grinder = RECIPE_CATALOG.grand_ol_grinder;
    assert.deepEqual(
      {
        id: grinder.id, tool: grinder.tool, energy: grinder.energyCost, xp: grinder.xpReward, wait: grinder.waitMs,
        skills: grinder.skills, inputs: grinder.inputs, outputs: grinder.outputs, wear: grinder.toolWear, limit: grinder.taskLimit,
      },
      {
        id: '219', tool: 'tinkertool', energy: 75, xp: 60, wait: 20000,
        skills: ['refining_2', 'tinkering_5'],
        inputs: [{ classTsid: 'molybdenum', qty: 11 }, { classTsid: 'plain_metal', qty: 17 }],
        outputs: [{ classTsid: 'grand_ol_grinder', qty: 1 }], wear: 1, limit: 1,
      }
    );
    const hoe = RECIPE_CATALOG.high_class_hoe;
    assert.deepEqual(
      {
        id: hoe.id, tool: hoe.tool, energy: hoe.energyCost, xp: hoe.xpReward, wait: hoe.waitMs,
        skills: hoe.skills, inputs: hoe.inputs, outputs: hoe.outputs, wear: hoe.toolWear, limit: hoe.taskLimit,
      },
      {
        id: '220', tool: 'tinkertool', energy: 40, xp: 40, wait: 20000,
        skills: ['soil_appreciation_5', 'tinkering_5'],
        inputs: [{ classTsid: 'plank', qty: 2 }, { classTsid: 'plain_metal', qty: 5 }, { classTsid: 'molybdenum', qty: 3 }],
        outputs: [{ classTsid: 'high_class_hoe', qty: 1 }], wear: 1, limit: 1,
      }
    );
    const skipped = json('recipes-skipped.json').skipped.map((r) => r.id);
    assert.ok(!skipped.includes('219') && !skipped.includes('220'));
  });

  it('carry the item files: labels, base costs, capacities, tool row', () => {
    const items = json('making-items.json').items;
    assert.equal(items.grand_ol_grinder.label, "Grand Ol' Grinder");
    assert.equal(items.grand_ol_grinder.baseCost, 2000);
    assert.equal(items.grand_ol_grinder.pointsCapacity, 500);
    assert.equal(items.high_class_hoe.label, 'High-Class Hoe');
    assert.equal(items.high_class_hoe.baseCost, 600);
    assert.equal(items.high_class_hoe.pointsCapacity, 250);
    assert.equal(ITEM_CATALOG.grand_ol_grinder.isTool, true);
    assert.equal(ITEM_CATALOG.high_class_hoe.isTool, true);
    assert.deepEqual(
      [TOOL_CONDITION_CATALOG.grand_ol_grinder.capacity, TOOL_CONDITION_CATALOG.grand_ol_grinder.baseCost],
      [500, 2000]
    );
    assert.deepEqual(
      [TOOL_CONDITION_CATALOG.high_class_hoe.capacity, TOOL_CONDITION_CATALOG.high_class_hoe.baseCost],
      [250, 600]
    );
  });

  it('make each tool on a Tinkertool with both skills', () => {
    const inv = createInventory({ tinkertool: 1, molybdenum: 14, plain_metal: 22, plank: 2 });
    const pc = { energy: 500, imagination: 0, xp: 0 };
    const learned = ['refining_2', 'tinkering_5', 'tinkering_1', 'soil_appreciation_5'];
    assert.equal(canCraft(inv, RECIPE_CATALOG.grand_ol_grinder, { learned: ['tinkering_5', 'tinkering_1'] }).skill, 'refining_2');
    const a = craftRecipe(inv, pc, 'grand_ol_grinder', { learned, rng: () => 0.99 });
    assert.equal(a.ok, true, a.msgs?.[0]);
    const b = craftRecipe(inv, pc, 'high_class_hoe', { learned, rng: () => 0.99 });
    assert.equal(b.ok, true, b.msgs?.[0]);
    assert.equal(countItem(inv, 'grand_ol_grinder'), 1);
    assert.equal(countItem(inv, 'high_class_hoe'), 1);
    assert.equal(countItem(inv, 'molybdenum'), 0);
    assert.equal(countItem(inv, 'plain_metal'), 0);
  });

  it('feed the Craftybot menu (build-craftybot.mjs)', () => {
    const specs = json('craftybot-specs.json');
    assert.ok(!specs.coverage.menuSkipped.noRemakeRecipe.includes('grand_ol_grinder'));
    assert.ok(!specs.coverage.menuSkipped.noRemakeRecipe.includes('high_class_hoe'));
  });

  it('open the street-project work that needed them', () => {
    const jobs = json('street-jobs.json');
    for (const cls of ['job_street_ph1_01d', 'job_street_ph1_07b', 'job_street_ph2_01d']) {
      const hireOnly = jobs.classes[cls].hireOnly || [];
      assert.ok(!hireOnly.includes('high_class_hoe') && !hireOnly.includes('grand_ol_grinder'), cls);
    }
  });
});

describe("Grand Ol' Grinder crushes like a Grinder", () => {
  it('stands in for ore_grinder in the Make panel', () => {
    assert.deepEqual(GRINDER_TOOLS, ['ore_grinder', 'grand_ol_grinder']);
    assert.equal(recipeToolFor('grand_ol_grinder'), 'ore_grinder');
    assert.equal(TOOL_CATALOG.grand_ol_grinder.label, "Grand Ol' Grinder");
    const inv = createInventory({ grand_ol_grinder: 1 });
    assert.equal(hasTool(inv, 'ore_grinder'), true);
    assert.deepEqual(
      listRecipesForTool('grand_ol_grinder').map((r) => r.key).sort(),
      listRecipesForTool('ore_grinder').map((r) => r.key).sort()
    );
    assert.ok(listRecipesForTool('grand_ol_grinder').some((r) => r.key === 'crush_dullite'));
  });

  it('crush recipes wear the Grand Ol’ Grinder when it is the one in the pack', () => {
    const inv = createInventory({ grand_ol_grinder: 1, dullite: 3 });
    const toolState = createToolConditionState();
    const pc = { energy: 100, imagination: 0, xp: 0 };
    const r = craftRecipe(inv, pc, 'crush_dullite', { learned: ['refining_1'], toolState });
    assert.equal(r.ok, true, r.msgs?.[0]);
    assert.equal(r.toolUse.classTsid, 'grand_ol_grinder');
    assert.equal(getToolCondition(toolState, 'grand_ol_grinder').remaining, 498);
    assert.match(r.msgs[0], /Grand Ol' Grinder/);
    assert.equal(countItem(inv, 'element_red'), 5);
  });

  it('a broken Grinder hands the work to the Grand Ol’ Grinder', () => {
    const inv = createInventory({ ore_grinder: 1, grand_ol_grinder: 1, dullite: 2 });
    const toolState = createToolConditionState();
    const pc = { energy: 100, imagination: 0, xp: 0 };
    const first = craftRecipe(inv, pc, 'crush_dullite', { learned: ['refining_1'], toolState });
    assert.equal(first.toolUse.classTsid, 'ore_grinder');
    setToolRemaining(toolState, 'ore_grinder', 0);
    assert.equal(recipeToolInUse(inv, 'ore_grinder', toolState, 2), 'grand_ol_grinder');
    const second = craftRecipe(inv, pc, 'crush_dullite', { learned: ['refining_1'], toolState });
    assert.equal(second.ok, true);
    assert.equal(second.toolUse.classTsid, 'grand_ol_grinder');
  });

  it('both broken: the refusal names the Grinder', () => {
    const inv = createInventory({ ore_grinder: 1, grand_ol_grinder: 1, dullite: 1 });
    const toolState = createToolConditionState();
    setToolRemaining(toolState, 'ore_grinder', 0);
    setToolRemaining(toolState, 'grand_ol_grinder', 0);
    const check = canCraft(inv, RECIPE_CATALOG.crush_dullite, { learned: ['refining_1'], toolState });
    assert.equal(check.reason, 'broken_tool');
    assert.equal(check.tool, 'ore_grinder');
  });

  it('mining.js crushOre takes either grinder', () => {
    const inv = createInventory({ grand_ol_grinder: 1, beryl: 3 });
    const toolState = createToolConditionState();
    const r = crushOre(inv, { energy: 100 }, 'beryl', { qty: 3, learned: ['refining_1'], toolState });
    assert.equal(r.ok, true, r.msgs?.[0]);
    assert.equal(r.toolUse.classTsid, 'grand_ol_grinder');
    assert.equal(getToolCondition(toolState, 'grand_ol_grinder').remaining, 498);
  });
});

describe('High-Class Hoe tends like a Hoe, and goes first', () => {
  it('garden.js clearPlot prefers a working High-Class Hoe (include/garden.js:233-238)', () => {
    assert.deepEqual(HOE_TOOLS, ['high_class_hoe', 'hoe']);
    const garden = createGarden({ cols: 1, rows: 1, now: 0 });
    const inv = createInventory({ hoe: 1, high_class_hoe: 1 });
    const toolState = createToolConditionState();
    assert.equal(hasHoe(createInventory({ high_class_hoe: 1 })), true);
    getPlot(garden, '1-1').state = 'dirty';
    const r = clearPlot(garden, '1-1', { energy: 40 }, { inv, toolState });
    assert.equal(r.ok, true);
    assert.equal(r.toolUse.classTsid, 'high_class_hoe');
    assert.equal(getToolCondition(toolState, 'hoe').remaining, 50);
  });

  it('a broken High-Class Hoe falls back to the Hoe', () => {
    const garden = createGarden({ cols: 1, rows: 1, now: 0 });
    const inv = createInventory({ hoe: 1, high_class_hoe: 1 });
    const toolState = createToolConditionState();
    setToolRemaining(toolState, 'high_class_hoe', 0);
    getPlot(garden, '1-1').state = 'dirty';
    const r = clearPlot(garden, '1-1', { energy: 40 }, { inv, toolState });
    assert.equal(r.ok, true);
    assert.equal(r.toolUse.classTsid, 'hoe');
  });

  it('only a broken High-Class Hoe: broken_hoe talkback', () => {
    const garden = createGarden({ cols: 1, rows: 1, now: 0 });
    const inv = createInventory({ high_class_hoe: 1 });
    const toolState = createToolConditionState();
    setToolRemaining(toolState, 'high_class_hoe', 0);
    getPlot(garden, '1-1').state = 'dirty';
    const r = clearPlot(garden, '1-1', { energy: 40 }, { inv, toolState });
    assert.equal(r.reason, 'broken_tool');
    assert.match(r.msgs[0], /High-Class Hoe/);
  });

  it('patches tend with it and wear its 250 points (patch.js:393-402)', () => {
    const plot = createPlot('patch');
    const toolState = createToolConditionState();
    const c = {
      inv: { high_class_hoe: 1 }, pc: { energy: 100, mood: 50, xp: 0, imagination: 0, currants: 0 },
      skills: ['soil_appreciation_1'], upgrades: [], buffs: [], toolState, hubId: 56, now: 1_000_000, rng: () => 0,
    };
    assert.equal(plotVerbs(plot, c).find((v) => v.id === 'tend').enabled, true);
    const r = performPlotVerb(plot, 'tend', c);
    assert.equal(r.ok, true);
    assert.equal(getToolCondition(toolState, 'high_class_hoe').remaining, 248);
  });

  it('firstWorkingTool reports a broken-only pack as owned', () => {
    const toolState = createToolConditionState();
    setToolRemaining(toolState, 'hoe', 0);
    assert.deepEqual(firstWorkingTool(toolState, { hoe: 1 }, HOE_TOOLS, 1), { tool: null, owned: true, fallback: 'hoe' });
    assert.deepEqual(firstWorkingTool(toolState, {}, HOE_TOOLS, 1), { tool: null, owned: false, fallback: null });
  });

  it('patches-feature swings the High-Class Hoe sheet (OGA tool_animation, 890x165)', () => {
    const src = readFileSync(join(pub, 'js/features/patches-feature.js'), 'utf8');
    assert.match(src, /high_class_hoe: Object\.freeze\(\{ url: 'assets\/sprites\/soil\/high-class-hoe-tool\.png', fw: 89, fh: 55, cols: 10, count: 30 \}\)/);
    const png = readFileSync(join(pub, 'assets/sprites/soil/high-class-hoe-tool.png'));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [890, 165]);
  });
});
