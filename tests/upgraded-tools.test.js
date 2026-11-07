/**
 * G179: the Grand Ol' Grinder and the High-Class Hoe (Tinkertool recipes 219
 * and 220, catalog_recipes.js 4515-4555) and the work they do: either grinder
 * crushes (dullite.js:108,126), a High-Class Hoe is tried before a Hoe
 * (include/garden.js:233-238, patch.js:393-402).
 * G183: the Irrigator 9000 wears (irrigator_9000.js points_capacity 500) and
 * pours before a Watering Can (include/garden.js:125-130, include/trants.js:117-121),
 * isToolItem knows the High-Class Hoe, and the Grand Ol' Grinder works the
 * Make panel with its own tool_animation.
 * Run: node --test tests/upgraded-tools.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECIPE_CATALOG,
  TOOL_CATALOG,
  buildCraftBatchResult,
  canCraft,
  craftRecipe,
  ensureMakingItems,
  grinderResultLine,
  hasTool,
  listRecipesForTool,
  loadRecipeCatalogFromFile,
  recipeToolFor,
  recipeToolInUse,
} from '../public/js/making.js?v=704da2eb';
import { ITEM_CATALOG, countItem, createInventory, isToolItem } from '../public/js/inventory.js?v=d82f3b00';
import {
  GRINDER_TOOLS,
  HOE_TOOLS,
  TOOL_CONDITION_CATALOG,
  WATERING_CAN_TOOLS,
  createToolConditionState,
  firstWorkingTool,
  getToolCondition,
  setToolRemaining,
} from '../public/js/tools.js?v=689d6594';
import { crushOre } from '../public/js/mining.js?v=4532ff9b';
import { MAKE_TOOL_SHEETS } from '../public/js/make-tool-sheets.js?v=6f758e09';
import { clearPlot, createGarden, getPlot, hasHoe, hasWateringCan, plantPlot, waterPlot } from '../public/js/garden.js?v=74dd94d0';
import { performTrantCare, quoteTrantCare } from '../public/js/trant-care.js?v=d0cd039d';
import { createTrantState, setTrantTables } from '../public/js/trants.js?v=9c2e8c0f';
import { createPlot, performPlotVerb, plotVerbs } from '../public/js/patches.js?v=ddd16221';

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
    const inv = createInventory({ grand_ol_grinder: 1, bag_elemental_pouch: 1, dullite: 3 });
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
    const inv = createInventory({ ore_grinder: 1, grand_ol_grinder: 1, bag_elemental_pouch: 1, dullite: 2 });
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

describe('G183: the Irrigator 9000 wears and pours first', () => {
  const seededPlot = (inv) => {
    const garden = createGarden({ cols: 1, rows: 1, now: 0 });
    plantPlot(garden, '1-1', createInventory({ seed_spinach: 1 }), { energy: 40, mood: 40 }, 'seed_spinach', { now: 0 });
    return garden;
  };

  it('is tracked with 500 points and base cost 750 (irrigator_9000.js:16,25)', () => {
    assert.deepEqual(
      { capacity: TOOL_CONDITION_CATALOG.irrigator_9000.capacity, baseCost: TOOL_CONDITION_CATALOG.irrigator_9000.baseCost },
      { capacity: 500, baseCost: 750 }
    );
    assert.deepEqual(WATERING_CAN_TOOLS, ['irrigator_9000', 'watering_can']);
    assert.equal(getToolCondition(createToolConditionState(), 'irrigator_9000').tracked, true);
    assert.equal(hasWateringCan(createInventory({ irrigator_9000: 1 })), true);
  });

  it('garden.js waterPlot pours with the Irrigator before a Watering Can and wears it', () => {
    const garden = seededPlot();
    const inv = createInventory({ watering_can: 1, irrigator_9000: 1 });
    const toolState = createToolConditionState();
    const r = waterPlot(garden, '1-1', { energy: 40, mood: 40 }, { inv, toolState, now: 1, rng: () => 0 });
    assert.equal(r.ok, true, r.msgs?.[0]);
    assert.equal(r.toolUse.classTsid, 'irrigator_9000');
    assert.ok(getToolCondition(toolState, 'irrigator_9000').remaining < 500);
    assert.equal(getToolCondition(toolState, 'watering_can').remaining, 100);
  });

  it('a broken Irrigator hands the pour to the Watering Can; alone it refuses', () => {
    const inv = createInventory({ watering_can: 1, irrigator_9000: 1 });
    const toolState = createToolConditionState();
    setToolRemaining(toolState, 'irrigator_9000', 0);
    const r = waterPlot(seededPlot(), '1-1', { energy: 40, mood: 40 }, { inv, toolState, now: 1, rng: () => 0 });
    assert.equal(r.toolUse.classTsid, 'watering_can');
    const alone = waterPlot(seededPlot(), '1-1', { energy: 40, mood: 40 }, { inv: createInventory({ irrigator_9000: 1 }), toolState, now: 1 });
    assert.equal(alone.reason, 'broken_tool');
    assert.match(alone.msgs[0], /Irrigator 9000/);
  });

  it('trees: trant-care.js waters with the Irrigator (include/trants.js:117-121)', () => {
    setTrantTables(JSON.parse(readFileSync(join(content, 'trants.json'), 'utf8')));
    const tools = createToolConditionState();
    const pc = { energy: 100, mood: 50, imagination: 0, xp: 0 };
    // The verb menu names the can that will pour (content.js water tooltip).
    assert.equal(quoteTrantCare(createTrantState('trant_fruit'), 'trant_fruit', 'water', { inv: { irrigator_9000: 1, watering_can: 1 }, pc, tools }).toolLabel, 'Irrigator 9000');
    const r = performTrantCare(createTrantState('trant_fruit', { health: 7 }), 'trant_fruit', 'water', {
      inv: { irrigator_9000: 1, watering_can: 1 }, pc, tools, learned: [], rng: () => 0,
    });
    assert.equal(r.ok, true, r.msg);
    assert.equal(r.toolUse.classTsid, 'irrigator_9000');
    assert.equal(getToolCondition(tools, 'irrigator_9000').remaining, 498);
    const none = performTrantCare(createTrantState('trant_fruit'), 'trant_fruit', 'water', { inv: {}, pc, tools });
    assert.equal(none.reason, 'tool_missing');
  });

  it('opens the street-project watering work that was hire-only', () => {
    const jobs = json('street-jobs.json');
    for (const cls of ['job_street_ph1_02b', 'job_street_ph4_01d', 'job_street_ph4_06b']) {
      assert.ok(!(jobs.classes[cls].hireOnly || []).includes('irrigator_9000'), cls);
    }
  });

  it('game.js pours with the Irrigator sheet (OGA irrigator_9000 tool_animation, 950x228)', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    assert.match(game, /IRRIGATOR_TOOL_SHEET = Object\.freeze\(\{ url: 'assets\/sprites\/making\/irrigator_9000-tool\.png', fw: 95, fh: 76, cols: 10, rows: 3 \}\)/);
    assert.match(game, /firstWorkingTool\(toolState, inv, WATERING_CAN_TOOLS\)/);
    // Ticket 63: the pack's broken icons come from js/tools.js BROKEN_TOOL_ICONS.
    assert.match(game, /brokenToolIcon\(s\.classTsid\)/);
    assert.match(readFileSync(join(pub, 'js/tools.js'), 'utf8'), /BROKEN_TOOL_ICONS = Object\.freeze\(new Set\(\[[^\]]*'irrigator_9000'/);
    const png = readFileSync(join(pub, 'assets/sprites/making/irrigator_9000-tool.png'));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [950, 228]);
  });
});

describe('G183: isToolItem and the Grand Ol\' Grinder animation', () => {
  it('isToolItem knows high_class_hoe by its real id, and Pickles are not a pick', () => {
    assert.equal(isToolItem('high_class_hoe'), true);
    assert.equal(isToolItem('hoe_highclass'), false);
    assert.equal(isToolItem('pickle'), false);
    assert.equal(isToolItem('pick'), true);
  });

  it('the Make panel swings the Grand Ol\' Grinder sheet when it does the crushing', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    assert.match(game, /const toolInUse = recipeToolInUse\(inv, recipe\.tool,/);
    // G188: the stand-in's sheet first, then the recipe tool's (js/make-tool-sheets.js).
    assert.match(game, /makeToolSheetVisual\(toolInUse\) \|\| makeToolSheetVisual\(recipe\.tool\)/);
    // grand_ol_grinder__x1_tool_animation (850x395, 17x5 cells of 50x79, 83 frames): G191 renders it
    // sharp from grand_ol_grinder.swf, 83 frames in one row (83 is prime) at the table's density.
    const s = MAKE_TOOL_SHEETS.grand_ol_grinder;
    assert.deepEqual([s.fw, s.fh, s.frames, s.cols], [50, 79, 83, 83]);
    const webp = readFileSync(join(pub, s.url));
    assert.equal(webp.toString('ascii', 12, 16), 'VP8L');
    const bits = webp.readUInt32LE(21);
    assert.deepEqual([(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1], [83 * 50 * (s.density || 1), 79 * (s.density || 1)]);
  });

  it('recipeToolInUse names the Grand Ol\' Grinder only when it is the grinder at work', () => {
    const toolState = createToolConditionState();
    assert.equal(recipeToolInUse(createInventory({ ore_grinder: 1, grand_ol_grinder: 1 }), 'ore_grinder', toolState, 1), 'ore_grinder');
    assert.equal(recipeToolInUse(createInventory({ grand_ol_grinder: 1 }), 'ore_grinder', toolState, 1), 'grand_ol_grinder');
  });
});

/**
 * Austin 2026-11-04: the Grinder destroys what it makes that the pack can't
 * carry, as Glitch did (grand_ol_grinder.js 613-619, players/inc_items.js
 * 292-319 createItemFromGround with destroy_remainder), instead of handing it
 * to the magic rock; Barnacle Talc falls to the ground. Player report #95:
 * the line names what was crushed and the elements made, not the recipe.
 */
describe('Grinder overflow and its line (grand_ol_grinder.js onCrushComplete)', () => {
  const learned = ['refining_1'];
  const crushBatch = (inv, key, qty, room) => {
    const pc = { energy: 500, imagination: 0, xp: 0 };
    const units = [];
    for (let i = 1; i <= qty; i++) units.push(craftRecipe(inv, pc, key, { learned, room, unitIndex: i, batchQty: qty }));
    return { units, result: buildCraftBatchResult(inv, pc, key, qty, qty, { learned }) };
  };

  it('keeps what fits and destroys the rest, with Glitch\'s line', () => {
    const inv = createInventory({ ore_grinder: 1, bag_elemental_pouch: 1, dullite: 3, element_red: 4990 });
    // The pouch has room for 10 more Red Elements and plenty of Green.
    const room = (cls, n) => (cls === 'element_red' ? Math.min(n, 5000 - countItem(inv, cls)) : n);
    const { units, result } = crushBatch(inv, 'crush_dullite', 3, room);
    assert.ok(units.every((u) => u.ok));
    assert.equal(countItem(inv, 'element_red'), 5000, 'the pouch is full, nothing for the magic rock');
    assert.equal(countItem(inv, 'element_green'), 24);
    assert.deepEqual(units.map((u) => u.destroyed.element_red || 0), [0, 0, 5]);
    assert.equal(
      result.activityLine,
      "You crushed 3 Chunks of Dullite (+3 iMG, -12 energy). 5 Red Elements were created, but destroyed, because you couldn't carry them. You got 10 Red Elements, and 24 Green Elements."
    );
    assert.equal(result.headline, 'You crushed 3 Chunks of Dullite!');
    assert.deepEqual(result.outputs.map((o) => [o.classTsid, o.qty]), [['element_red', 10], ['element_green', 24]]);
    assert.doesNotMatch(result.activityLine, /You made|Crush Dullite/);
  });

  it('says only what was destroyed when nothing fits', () => {
    assert.equal(
      grinderResultLine({ input: 'beryl', crushed: 1, xp: 1, energy: -4, outputs: [
        { classTsid: 'element_red', made: 20, destroyed: 20 },
        { classTsid: 'element_green', made: 2, destroyed: 2 },
        { classTsid: 'element_blue', made: 4, destroyed: 4 },
      ] }),
      "You crushed 1 Chunk of Beryl (+1 iMG, -4 energy). 20 Red Elements were created, but destroyed, because you couldn't carry them. 2 Green Elements were created, but destroyed, because you couldn't carry them. 4 Blue Elements were created, but destroyed, because you couldn't carry them."
    );
    assert.equal(
      grinderResultLine({ input: 'sparkly', crushed: 2, energy: 0, outputs: [
        { classTsid: 'element_red', made: 10 }, { classTsid: 'element_green', made: 2 },
        { classTsid: 'element_blue', made: 8 }, { classTsid: 'element_shiny', made: 12 },
      ] }),
      'You crushed 2 Chunks of Sparkly (0 energy). You got 10 Red Elements, 2 Green Elements, 8 Blue Elements, and 12 Shiny Elements.'
    );
  });

  it('hands Barnacle Talc it cannot carry back for the ground, never destroyed', () => {
    const inv = createInventory({ ore_grinder: 1, barnacle: 2 });
    const { units, result } = crushBatch(inv, 'crush_barnacle', 2, () => 0);
    assert.deepEqual(units.map((u) => u.dropped), [{ barnacle_talc: 1 }, { barnacle_talc: 1 }]);
    assert.deepEqual(units.map((u) => u.destroyed), [{}, {}]);
    assert.equal(countItem(inv, 'barnacle_talc'), 0);
    assert.equal(result.activityLine, 'You crushed 2 Mortar Barnacles (+2 iMG, -6 energy). You got 2 Barnacle Talc.');
  });

  it('without a pack check (other callers) everything lands as before', () => {
    const inv = createInventory({ ore_grinder: 1, bag_elemental_pouch: 1, dullite: 1 });
    const { units } = crushBatch(inv, 'crush_dullite', 1, undefined);
    assert.deepEqual(units[0].destroyed, {});
    assert.equal(countItem(inv, 'element_red'), 5);
  });

  it('the Make panel passes the pack check to Grinder sessions and drops the talc at the feet', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    assert.match(game, /isGrinderRecipe\(recipe\) \? \{ \.\.\.opts, room: grinderPackRoom \} : opts/);
    assert.match(game, /features\.query\('packRoom', cls, n, engine\)/);
    assert.match(game, /engine\.dropWorldStack\(cls, n, player\.x, player\.y - GRINDER_DROP_RISE\)/);
    assert.match(game, /dropGrinderRemainder\(result\.dropped\);\n\s+record\.made \+= 1;/);
  });

  it('matches the source', { skip: !existsSync(join(here, '../../glitch-GameServerJS')) && 'needs glitch-GameServerJS' }, () => {
    const src = readFileSync(join(here, '../../glitch-GameServerJS/items/grand_ol_grinder.js'), 'utf8');
    assert.match(src, /createItemFromGround\(outputs\[i\]\.class_tsid, to_get, \(this\.class_crushing != "barnacle"\)\)/);
    assert.match(src, / were created, but destroyed, because you couldn't carry them\./);
    assert.match(src, /rsp \+= " You got "\+pretty_list\(you_got, ", and "\)\+"\.";/);
  });
});
