/**
 * Full GSJS recipe import: catalog integrity, item metadata, icons, source
 * food/drink metabolics, new kitchen tools end to end, and skill/achievement gates.
 * Run: node --test tests/recipe-catalog.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAKE_TOOL_SHEETS } from '../public/js/make-tool-sheets.js';
import {
  RECIPE_CATALOG,
  TOOL_CATALOG,
  MAKING_ITEM_META,
  listRecipesForTool,
  listMakingTools,
  searchRecipes,
  listRecipesProducing,
  canCraft,
  craftRecipe,
  ensureMakingItems,
  loadRecipeCatalogFromFile,
  starterToolsInventory,
  STARTER_TOOL_IDS,
} from '../public/js/making.js';
import {
  ITEM_CATALOG,
  createInventory,
  countItem,
  getItemUseInfo,
  useItem,
} from '../public/js/inventory.js?v=catalog-unified-6';
import {
  FOOD_VARIETY_UPGRADE,
  createFoodState,
  isFoodBonusItem,
  quoteFoodVarietyBonus,
} from '../public/js/food.js';
import {
  TOOL_CONDITION_CATALOG,
  createToolConditionState,
  getToolCondition,
} from '../public/js/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '../public');
const content = join(publicRoot, 'assets/content');
const recipesPath = join(content, 'recipes.json');
const recipesJson = JSON.parse(readFileSync(recipesPath, 'utf8'));
const itemsJson = JSON.parse(readFileSync(join(content, 'making-items.json'), 'utf8'));
const skippedJson = JSON.parse(readFileSync(join(content, 'recipes-skipped.json'), 'utf8'));

/**
 * Items whose icon is not an OGA iconic frame. Every id still ships a PNG:
 * these use the GSJS getAssetInfo() 40×40 thumb (no OGA asset), or the OGA
 * x1_1 static frame (no iconic, or the iconic was an animation sheet).
 */
const GSJS_THUMB_ICONS = [
  'extremely_hallowed_shrine_powder',
  'fairly_hallowed_shrine_powder',
  'fertilidust',
  'fertilidust_lite',
  'firefly_jar',
  'potion_chris',
  'potion_favor',
  'powder_of_mild_fecundity',
  'powder_of_startling_fecundity',
  'sneezing_powder',
  'sparkle_powder',
];
/** Items with no recoverable icon at all (UI falls back to the generic icon). */
const MISSING_ICONS = [];

const NEW_TOOLS = [
  'saucepan',
  'mike_tyson_grill',
  'cocktail_shaker',
  'awesome_pot',
  'egg_seasoner',
  'bean_seasoner',
  'cauldron',
  'tincturing_kit',
  'test_tube',
  'beaker',
  'crystallizer',
  'woodworker',
  'fuelmaker',
  'loomer',
];

describe('GSJS recipe catalog import', () => {
  before(async () => {
    await loadRecipeCatalogFromFile(recipesPath);
    ensureMakingItems();
  });

  it('imports every eligible catalog_recipes.js row and documents every skip', () => {
    const catalogRows = Object.values(recipesJson).filter((r) => /catalog_recipes\.js/.test(r.source));
    assert.equal(skippedJson._meta.sourceRecipes, 339);
    assert.equal(catalogRows.length + skippedJson.skipped.length, 339);
    assert.ok(catalogRows.length >= 270, `expected the full catalog, got ${catalogRows.length}`);
    const ids = new Set(catalogRows.map((r) => r.id));
    for (const row of skippedJson.skipped) {
      assert.ok(!ids.has(row.id), `skipped ${row.id} is also imported`);
      assert.ok(row.reason && row.reason.length > 10, `skip ${row.id} needs a reason`);
    }
    assert.ok(skippedJson.skipped.every((r) => r.tool !== 'knife_and_board'));
    assert.ok(skippedJson.skipped.some((r) => r.tool === 'construction_tool'));
    assert.equal(Object.keys(RECIPE_CATALOG).length, Object.keys(recipesJson).length);
  });

  it('every recipe tool exists in TOOL_CATALOG and every item has a label', () => {
    for (const [key, recipe] of Object.entries(RECIPE_CATALOG)) {
      assert.ok(TOOL_CATALOG[recipe.tool], `${key}: missing tool ${recipe.tool}`);
      assert.ok(recipe.name, key);
      assert.ok(recipe.inputs.length >= 1, key);
      assert.ok(recipe.outputs.length >= 1, key);
      for (const io of [...recipe.inputs, ...recipe.outputs]) {
        assert.ok(Number.isInteger(io.qty) && io.qty > 0, `${key} ${io.classTsid}`);
        const meta = ITEM_CATALOG[io.classTsid];
        assert.ok(meta?.label, `${key}: ${io.classTsid} has no label`);
        assert.ok(!/^Item /.test(meta.desc), `${key}: ${io.classTsid} has a placeholder desc`);
      }
    }
    for (const id of NEW_TOOLS) {
      assert.ok(TOOL_CATALOG[id], id);
      assert.equal(ITEM_CATALOG[id].isTool, true, id);
      assert.ok(listRecipesForTool(id).length >= 1, `${id} has recipes`);
    }
    assert.equal(TOOL_CATALOG.mike_tyson_grill.label, 'Famous Pugilist Grill');
    assert.ok(listMakingTools().every((t) => listRecipesForTool(t.classTsid).length > 0));
    assert.ok(!listMakingTools().some((t) => t.classTsid === 'pick'));
  });

  it('preserves exact source numbers and provenance', () => {
    const slaw = Object.values(RECIPE_CATALOG).find((r) => r.id === '1');
    assert.deepEqual(
      {
        name: slaw.name,
        tool: slaw.tool,
        energyCost: slaw.energyCost,
        xpReward: slaw.xpReward,
        waitMs: slaw.waitMs,
        skills: slaw.skills,
        toolWear: slaw.toolWear,
        taskLimit: slaw.taskLimit,
      },
      {
        name: 'Simple Slaw',
        tool: 'knife_and_board',
        energyCost: 3,
        xpReward: 2,
        waitMs: 2000,
        skills: ['ezcooking_2'],
        toolWear: 1,
        taskLimit: 40,
      }
    );
    assert.deepEqual(slaw.inputs, [
      { classTsid: 'cabbage', qty: 1 },
      { classTsid: 'corn', qty: 1 },
      { classTsid: 'bean_plain', qty: 5 },
    ]);
    assert.equal(slaw.source, 'catalog_recipes.js recipes["1"]');
    // Legacy keys stay stable.
    assert.equal(RECIPE_CATALOG.sammich.id, '12');
    assert.equal(RECIPE_CATALOG.metal_post.id, '280');
    assert.equal(RECIPE_CATALOG.plain_metal.id, 'smelt_metal');
    // Multi-output test tube recipe and discoverable flag.
    const abba = Object.values(RECIPE_CATALOG).find((r) => r.id === '148');
    assert.deepEqual(abba.outputs.map((o) => o.classTsid), ['abbasidose', 'diabolic_acid']);
    assert.equal(abba.discoverable, true);
    assert.equal(abba.waitMs, 50);
    // Achievement-gated rows carry their gates.
    const crepes = Object.values(RECIPE_CATALOG).find((r) => r.id === '2');
    assert.deepEqual(crepes.achievements, ['grease_monkey']);
  });

  it('registers GSJS item metadata (label, desc, base cost, stack cap, tags)', () => {
    const roux = ITEM_CATALOG.roux;
    assert.equal(roux.label, 'Roux');
    assert.equal(roux.baseCost, itemsJson.items.roux.baseCost);
    assert.equal(roux.stackMax, itemsJson.items.roux.stackMax);
    assert.ok(roux.tags.includes('foodbonus'));
    assert.equal(ITEM_CATALOG.sammich.baseCost, 29);
    assert.equal(ITEM_CATALOG.sammich.stackMax, 20);
    assert.equal(ITEM_CATALOG.waffles.baseCost, 185);
    assert.match(ITEM_CATALOG.saucepan.desc, /sauce/i);
    assert.equal(Object.keys(MAKING_ITEM_META).length, Object.keys(itemsJson.items).length);
    assert.deepEqual(itemsJson._meta.missingSource, []);
  });

  it('ships an icon for every item and tool (or lists it as missing)', () => {
    const ids = new Set([...Object.keys(itemsJson.items), ...Object.keys(TOOL_CATALOG)]);
    const missing = [];
    for (const id of ids) {
      const iconPath = join(publicRoot, 'assets/sprites/icons', `${id}.png`);
      if (!existsSync(iconPath)) missing.push(id);
    }
    assert.deepEqual(missing.sort(), [...MISSING_ICONS].sort());
    for (const id of GSJS_THUMB_ICONS) {
      assert.ok(existsSync(join(publicRoot, 'assets/sprites/icons', `${id}.png`)), id);
    }
    for (const id of NEW_TOOLS) {
      assert.equal(ITEM_CATALOG[id].icon, `assets/sprites/icons/${id}.png`);
    }
    for (const id of ['saucepan', 'mike_tyson_grill', 'cocktail_shaker', 'awesome_pot', 'cauldron']) {
      // G188/G191: each tool's tool_animation sheet (tools/build-make-tool-sheets.py, js/make-tool-sheets.js).
      assert.ok(MAKE_TOOL_SHEETS[id] && existsSync(join(publicRoot, MAKE_TOOL_SHEETS[id].url)), `${id} sheet`);
    }
  });
});

describe('source food and drink metabolics', () => {
  before(async () => {
    await loadRecipeCatalogFromFile(recipesPath);
    ensureMakingItems();
  });

  it('food energy = round(base_cost × energy_factor) from include/food.js', () => {
    const expected = {
      sammich: 29,
      waffles: 185,
      fried_egg: 11,
      grilled_cheese: 90,
      potians_feast: 1000,
      bun: 9,
      meat: 10,
    };
    for (const [id, energy] of Object.entries(expected)) {
      const info = getItemUseInfo(id);
      assert.equal(info.usable, true, id);
      assert.equal(info.verb, 'Eat', id);
      assert.equal(info.kind, 'food', id);
      assert.deepEqual(info.effects, { energy }, id);
    }
  });

  it('drinks use drink_mood / drink_energy / drink_xp from include/drink.js', () => {
    assert.deepEqual(getItemUseInfo('orange_juice').effects, { energy: 15, mood: 20 });
    assert.deepEqual(getItemUseInfo('lemon_juice').effects, { energy: 10, mood: -5, xp: 10 });
    assert.deepEqual(getItemUseInfo('spicy_grog').effects, { energy: 5, mood: 30, xp: 3 });
    assert.deepEqual(getItemUseInfo('milk_butterfly').effects, { mood: 6 });
    assert.equal(getItemUseInfo('bubble_tea').kind, 'drink');
  });

  it('applies negative mood and drink iMG; refuses mood drinks at full mood', () => {
    const inv = createInventory({ lemon_juice: 1, orange_juice: 1, butterfly_lotion: 0 });
    const pc = { energy: 50, mood: 50, imagination: 0, xp: 0 };
    const r = useItem(inv, pc, 'lemon_juice');
    assert.equal(r.ok, true);
    assert.deepEqual(r.effects, { energy: 10, mood: -5, xp: 10 });
    assert.deepEqual([pc.energy, pc.mood, pc.imagination], [60, 45, 10]);
    const happy = { energy: 50, mood: 100 };
    const refused = useItem(inv, happy, 'orange_juice');
    assert.equal(refused.ok, false);
    assert.match(refused.msgs[0], /perfectly good mood/);
    assert.equal(countItem(inv, 'orange_juice'), 1);
  });

  it('herbs, potions and powders are not eaten or drunk', () => {
    assert.equal(getItemUseInfo('gandlevery').usable, false);
    assert.equal(getItemUseInfo('potion_rook_balm').usable, false);
    assert.equal(getItemUseInfo('sparkle_powder').usable, false);
  });

  it('foodbonus tags drive the variety bonus for imported meals only', () => {
    assert.equal(isFoodBonusItem('grilled_cheese'), true);
    assert.equal(isFoodBonusItem('roux'), true);
    assert.equal(isFoodBonusItem('cheese'), false);
    assert.equal(isFoodBonusItem('onion_rings'), false);
    const state = createFoodState();
    const energy = getItemUseInfo('grilled_cheese').effects.energy;
    const quote = quoteFoodVarietyBonus(state, 'grilled_cheese', energy, [FOOD_VARIETY_UPGRADE], 1_000);
    assert.equal(quote.kind, 'month');
    assert.equal(quote.img, 45);
  });
});

describe('new kitchen tools end to end', () => {
  before(async () => {
    await loadRecipeCatalogFromFile(recipesPath);
    ensureMakingItems();
  });

  const keyFor = (id) => Object.keys(RECIPE_CATALOG).find((k) => RECIPE_CATALOG[k].id === id);

  it('Saucepan makes Roux with source costs and wears the pan', () => {
    const key = keyFor('334');
    assert.equal(RECIPE_CATALOG[key].tool, 'saucepan');
    const inv = createInventory({ saucepan: 1, butterfly_butter: 1, flour: 1, pinch_of_salt: 0 });
    const pc = { energy: 50, mood: 75, imagination: 0, xp: 0 }; // the x1 mood band (G148)
    const toolState = createToolConditionState();
    const r = craftRecipe(inv, pc, key, { learned: ['saucery_1'], toolState });
    assert.equal(r.ok, true, r.msgs.join(' '));
    assert.equal(countItem(inv, 'roux'), 1);
    assert.equal(countItem(inv, 'flour'), 0);
    assert.equal(pc.energy, 47);
    assert.equal(pc.imagination, 8);
    assert.equal(TOOL_CONDITION_CATALOG.saucepan.capacity, 100);
    assert.equal(getToolCondition(toolState, 'saucepan').remaining, 99);
  });

  it('Famous Pugilist Grill makes Grilled Cheese, then it is eaten for source energy', () => {
    const key = keyFor('21');
    const inv = createInventory({ mike_tyson_grill: 1, bun: 2, cheese: 2 });
    const pc = { energy: 20, mood: 75, imagination: 0, xp: 0 }; // the x1 mood band (G148)
    const r = craftRecipe(inv, pc, key, { learned: ['grilling_1'] });
    assert.equal(r.ok, true, r.msgs.join(' '));
    assert.equal(countItem(inv, 'grilled_cheese'), 1);
    assert.equal(pc.energy, 12);
    assert.equal(pc.imagination, 6);
    const eat = useItem(inv, pc, 'grilled_cheese');
    assert.equal(eat.ok, true);
    assert.equal(eat.effects.energy, 88); // 90 energy, capped at 100
    assert.equal(pc.energy, 100);
  });

  it('Cocktail Shaker makes Spicy Grog from hooch and spices', () => {
    const key = keyFor('63');
    const inv = createInventory({
      cocktail_shaker: 1,
      hooch: 1,
      licorice: 1,
      all_spice: 1,
      hot_pepper: 1,
      mustard: 1,
    });
    const pc = { energy: 30, mood: 75, imagination: 0, xp: 0 }; // the x1 mood band (G148)
    const r = craftRecipe(inv, pc, key, { learned: ['cocktailcrafting_1'] });
    assert.equal(r.ok, true, r.msgs.join(' '));
    assert.equal(countItem(inv, 'spicy_grog'), 1);
    assert.equal(pc.energy, 24);
    assert.equal(pc.imagination, 8);
    for (const id of ['hooch', 'licorice', 'all_spice', 'hot_pepper', 'mustard']) {
      assert.equal(countItem(inv, id), 0, id);
    }
  });

  it('a Tinkertool can make the new tools (multi-skill gate)', () => {
    const key = keyFor('212');
    assert.deepEqual(RECIPE_CATALOG[key].outputs, [{ classTsid: 'mike_tyson_grill', qty: 1 }]);
    const inv = createInventory({ tinkertool: 1, plain_metal: 1, copper: 1 });
    const pc = { energy: 100, mood: 50, imagination: 0, xp: 0 };
    const blocked = craftRecipe(inv, pc, key, { learned: ['tinkering_5'] });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'skill');
    assert.match(blocked.msgs[0], /engineering_1/);
    const made = craftRecipe(inv, pc, key, { learned: ['tinkering_1', 'tinkering_5', 'engineering_1'] });
    assert.equal(made.ok, true);
    assert.equal(countItem(inv, 'mike_tyson_grill'), 1);
    assert.equal(ITEM_CATALOG.mike_tyson_grill.isTool, true);
  });
});

describe('making gates', () => {
  before(async () => {
    await loadRecipeCatalogFromFile(recipesPath);
    ensureMakingItems();
  });

  it('skill gating blocks without the skill and allows with it', () => {
    const key = Object.keys(RECIPE_CATALOG).find((k) => RECIPE_CATALOG[k].id === '41');
    const recipe = RECIPE_CATALOG[key];
    const inv = createInventory({ saucepan: 1, all_spice: 1, milk_butterfly: 1, olive_oil: 1 });
    assert.deepEqual(canCraft(inv, recipe, { learned: [] }), {
      ok: false,
      reason: 'skill',
      skill: 'saucery_1',
    });
    assert.equal(canCraft(inv, recipe, { learned: ['saucery_1'] }).ok, true);
    // No learned list (tests / QA) keeps the old permissive behavior.
    assert.equal(canCraft(inv, recipe).ok, true);
  });

  it('tool gating names the new tool', () => {
    const key = Object.keys(RECIPE_CATALOG).find((k) => RECIPE_CATALOG[k].id === '21');
    const inv = createInventory({ bun: 2, cheese: 2 });
    const r = craftRecipe(inv, { energy: 50 }, key, { learned: ['grilling_1'] });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'tool');
    assert.match(r.msgs[0], /Famous Pugilist Grill/);
  });

  it('achievement gating applies only when unlocked ids are supplied', () => {
    const key = Object.keys(RECIPE_CATALOG).find((k) => RECIPE_CATALOG[k].id === '2');
    const recipe = RECIPE_CATALOG[key];
    const inv = createInventory({ frying_pan: 1, swing_batter: 1, desssert_rub: 1, cloudberry_jam: 1 });
    // The Frying Pan itself needs Cheffery I (making_required_skill).
    const learned = ['cheffery_1'];
    assert.equal(canCraft(inv, recipe, { learned }).ok, true);
    const gated = canCraft(inv, recipe, { learned, achievements: [] });
    assert.equal(gated.reason, 'achievement');
    assert.equal(gated.achievement, 'grease_monkey');
    assert.equal(canCraft(inv, recipe, { learned, achievements: ['grease_monkey'] }).ok, true);
  });

  it('search and producer lookups cover the larger catalog', () => {
    assert.ok(searchRecipes('sno cone').length >= 6);
    assert.ok(searchRecipes('roux', { tool: 'saucepan' }).every((r) => r.tool === 'saucepan'));
    assert.ok(listRecipesProducing('roux').some((r) => r.id === '334'));
  });

  it('starter kit stays the original tool set; QA can request every tool', () => {
    assert.deepEqual(Object.keys(starterToolsInventory()), [...STARTER_TOOL_IDS]);
    assert.ok(!('saucepan' in starterToolsInventory()));
    const all = starterToolsInventory({ all: true });
    for (const id of NEW_TOOLS) assert.equal(all[id], 1, id);
  });
});
