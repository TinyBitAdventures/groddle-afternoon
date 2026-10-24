/**
 * Skill effects across the older systems, plus the full skill tree model.
 * Sources: items/catalog_skill_packages.js, players/inc_skill_packages.js,
 * players/inc_making.js, items/include/garden.js, items/include/mining.js,
 * items/emblem_base (emblem_*.js), inc_data_skills.js.
 * Run: node --test tests/skill-effects.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js';
import {
  SKILL_PACKAGES,
  skillPackageDetails,
  highestSkillLevel,
} from '../public/js/skill-packages.js';
import {
  miningProfile,
  mineRock,
  createMineRock,
  crushOre,
} from '../public/js/mining.js';
import {
  createGarden,
  gardenActionProfile,
  plantPlot,
  waterPlot,
  harvestPlot,
  clearPlot,
  SEED_CATALOG,
  GARDEN_HARVEST_FAILED_LINES,
} from '../public/js/garden.js';
import {
  loadRecipeCatalogFromFile,
  ensureMakingItems,
  canCraft,
  craftRecipe,
  craftDurationFor,
  makingSkillAdjustments,
  recipeEnergyCost,
  RECIPE_CATALOG,
  MAKING_TOOL_SKILLS,
  craftRecipeBatch,
  craftUnitDurations,
  MACHINE_EXTRA_WAIT_MS,
} from '../public/js/making.js';
import { createInventory, countItem } from '../public/js/inventory.js?v=catalog-unified-3';
import { createToolConditionState, getToolCondition } from '../public/js/tools.js?v=tools-2';

const root = join(import.meta.dirname, '..', 'public');

before(async () => {
  await loadContentCatalogsFromDir(join(root, 'assets/content'));
  await loadRecipeCatalogFromFile(join(root, 'assets/content/recipes.json'));
  ensureMakingItems();
});

const fresh = (seed = {}) => ({ energy: 100, mood: 50, imagination: 0, xp: 0, ...seed });

describe('skill package lookup (getSkillPackageDetails)', () => {
  it('carries every catalog_skill_packages.js package', () => {
    assert.equal(Object.keys(SKILL_PACKAGES).length, 64);
    assert.equal(SKILL_PACKAGES.mining.skills.mining_4.duration, 8000);
  });

  it('uses the highest qualifying rank and no_skill as the floor', () => {
    assert.equal(skillPackageDetails('mining', []), null);
    assert.equal(skillPackageDetails('mining', ['mining_1', 'mining_2', 'mining_3', 'mining_4']).skill, 'mining_4');
    assert.equal(skillPackageDetails('croppery_harvest', []).skill, 'no_skill');
    assert.equal(skillPackageDetails('croppery_harvest', ['croppery_1', 'croppery_2']).skill, 'croppery_2');
  });

  it('applies imagination duration multipliers like the source', () => {
    const plain = skillPackageDetails('mining', ['mining_1']);
    const faster = skillPackageDetails('mining', ['mining_1'], ['mining_time_2']);
    assert.equal(plain.duration, 20000);
    assert.equal(faster.duration, 15000);
  });

  it('measures consecutive skill family levels (skills_get_highest_level)', () => {
    assert.equal(highestSkillLevel(['cheffery_1', 'cheffery_2'], 'cheffery_1'), 2);
    assert.equal(highestSkillLevel(['cheffery_2'], 'cheffery_1'), 0);
  });
});

describe('Mining I to IV and Refining II', () => {
  it('scales swing time, energy, wear, and xp by rank', () => {
    const ranks = ['mining_1', 'mining_2', 'mining_3', 'mining_4'];
    const want = [
      { durationMs: 1800, energy: 12, toolWear: 2, xp: 2 },
      { durationMs: 1260, energy: 10, toolWear: 2, xp: 2 },
      { durationMs: 900, energy: 8, toolWear: 1, xp: 5 },
      { durationMs: 720, energy: 7, toolWear: 1, xp: 10 },
    ];
    ranks.forEach((_, i) => {
      const profile = miningProfile(ranks.slice(0, i + 1), 'pick');
      assert.deepEqual(
        { durationMs: profile.durationMs, energy: profile.energy, toolWear: profile.toolWear, xp: profile.xp },
        want[i],
      );
    });
    assert.equal(miningProfile([], 'pick'), null);
  });

  it('mineRock spends the rank row and wears the pick by it', () => {
    const inv = createInventory({ pick: 1 });
    const tools = createToolConditionState();
    const pc = fresh({ mood: 75 }); // the x1 mood band (G148)
    const rock = createMineRock('rock_metal_1');
    const r = mineRock(rock, inv, pc, {
      learned: ['mining_1', 'mining_2', 'mining_3', 'mining_4'],
      toolState: tools,
      rng: () => 0,
    });
    assert.equal(r.ok, true);
    assert.equal(pc.energy, 93);
    assert.equal(pc.xp, 10);
    assert.equal(getToolCondition(tools, 'pick').remaining, 99);
    const blocked = mineRock(createMineRock('rock_metal_1'), inv, fresh(), { learned: [] });
    assert.equal(blocked.reason, 'skill');
  });

  it('Refining II crushes for 3 energy and 1 wear per chunk', () => {
    const inv = createInventory({ ore_grinder: 1, dullite: 2 });
    const one = fresh();
    assert.equal(crushOre(inv, one, 'dullite', { learned: ['refining_1'] }).effects.energy, -4);
    const two = fresh();
    assert.equal(crushOre(inv, two, 'dullite', { learned: ['refining_1', 'refining_2'] }).effects.energy, -3);
  });
});

describe('Croppery and Herbalism garden packages', () => {
  function ripe(type = 'default', seedId = 'seed_spinach') {
    const garden = createGarden({ gardenType: type, cols: 1, rows: 1 });
    const plot = garden.plots['1-1'];
    plot.state = 'crop';
    plot.seed = seedId;
    return garden;
  }

  it('no Croppery: half harvest, 3 energy, 75% pick success', () => {
    const profile = gardenActionProfile('default', 'harvest', []);
    assert.equal(profile.halfHarvest, true);
    assert.equal(profile.successRate, 75);
    const inv = createInventory();
    const pc = fresh();
    const r = harvestPlot(ripe(), '1-1', inv, pc, { learned: [], rng: () => 0.5 });
    assert.equal(r.ok, true);
    assert.equal(r.count, Math.round(SEED_CATALOG.seed_spinach.produces / 2));
    assert.equal(pc.energy, 97);
  });

  it('a failed pick costs nothing and keeps the crop', () => {
    const garden = ripe();
    const inv = createInventory();
    const pc = fresh();
    const r = harvestPlot(garden, '1-1', inv, pc, { learned: [], rng: () => 0.9 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'failed');
    assert.ok(GARDEN_HARVEST_FAILED_LINES.default.includes(r.msgs[0]));
    assert.equal(pc.energy, 100);
    assert.equal(garden.plots['1-1'].state, 'crop');
  });

  it('a failed water costs its energy plus 3 mood', () => {
    const garden = createGarden({ cols: 1, rows: 1 });
    garden.plots['1-1'].state = 'seeds';
    garden.plots['1-1'].seed = 'seed_spinach';
    const pc = fresh();
    const r = waterPlot(garden, '1-1', pc, { learned: [], rng: () => 0.9, inv: createInventory({ watering_can: 1 }) });
    assert.equal(r.reason, 'failed');
    assert.equal(pc.energy, 98);
    assert.equal(pc.mood, 47);
    assert.equal(garden.plots['1-1'].wet, false);
  });

  it('Croppery I gives the full harvest; Croppery III adds a 6% double', () => {
    const learned = ['croppery_1', 'croppery_2', 'croppery_3'];
    const inv = createInventory();
    const pc = fresh();
    const r = harvestPlot(ripe(), '1-1', inv, pc, { learned, rng: () => 0.01 });
    const n = SEED_CATALOG.seed_spinach.produces;
    assert.equal(r.baseCount, n);
    assert.equal(r.bonusCount, n);
    assert.equal(r.superHarvest, true);
    assert.equal(pc.mood, 53);
    // 7 iMG after the mood gain, at 53%: x0.9 rounds to 6 (G148).
    assert.equal(pc.xp, 6);
    const plain = harvestPlot(ripe(), '1-1', createInventory(), fresh(), { learned, rng: () => 0.5 });
    assert.equal(plain.bonusCount, 0);
  });

  it('herb gardens run Herbalism: 10% then 20% super harvests', () => {
    assert.equal(gardenActionProfile('herb', 'harvest', ['herbalism_1', 'herbalism_2']).bonusChance, 0.1);
    assert.equal(gardenActionProfile('herb', 'harvest', ['herbalism_1', 'herbalism_2', 'herbalism_3']).bonusChance, 0.2);
    assert.equal(gardenActionProfile('herb', 'harvest', ['croppery_1']).halfHarvest, true);
  });

  it('planting and hoeing use the rank energy, rewards, and Hoe wear', () => {
    const garden = createGarden({ cols: 1, rows: 1 });
    const inv = createInventory({ seed_spinach: 1, hoe: 1 });
    const pc = fresh();
    const planted = plantPlot(garden, '1-1', inv, pc, 'seed_spinach', { learned: ['croppery_1', 'croppery_2'] });
    assert.equal(planted.ok, true);
    assert.equal(pc.energy, 98);
    assert.equal(pc.mood, 52);
    garden.plots['1-1'].state = 'dirty';
    const tools = createToolConditionState();
    const cleared = clearPlot(garden, '1-1', fresh(), { learned: [], inv, toolState: tools });
    assert.equal(cleared.ok, true);
    assert.equal(getToolCondition(tools, 'hoe').capacity - getToolCondition(tools, 'hoe').remaining, 2);
  });

  it('callers without a learned list keep the legacy flat costs', () => {
    assert.equal(gardenActionProfile('default', 'harvest').legacy, true);
  });
});

describe('making skill rules (players/inc_making.js)', () => {
  const key = (id) => Object.keys(RECIPE_CATALOG).find((k) => RECIPE_CATALOG[k].id === id) || id;

  it('each tool needs its required skill, except transmogrifiers', () => {
    assert.equal(MAKING_TOOL_SKILLS.frying_pan.requiredSkill, 'cheffery_1');
    const inv = createInventory({ frying_pan: 1, egg_plain: 3, cheese: 1 });
    const recipe = RECIPE_CATALOG.basic_omelet;
    assert.deepEqual(canCraft(inv, recipe, { learned: [] }), { ok: false, reason: 'skill', skill: 'cheffery_1' });
    const fruit = createInventory({ fruit_changing_machine: 1, cherry: 3 });
    assert.equal(canCraft(fruit, RECIPE_CATALOG.change_orange, { learned: [] }).ok, true);
    const tube = createInventory({ test_tube: 1, element_red: 6, element_green: 3 });
    assert.equal(canCraft(tube, RECIPE_CATALOG.groddlene, { learned: [] }).skill, 'alchemy_1');
  });

  it('cooking level II halves time and energy; level III uses 0.67', () => {
    const omelet = RECIPE_CATALOG.basic_omelet;
    assert.equal(recipeEnergyCost(omelet, ['cheffery_1']), 5);
    assert.equal(recipeEnergyCost(omelet, ['cheffery_1', 'cheffery_2']), 3);
    assert.equal(recipeEnergyCost(omelet, ['cheffery_1', 'cheffery_2', 'cheffery_3']), 3);
    assert.equal(makingSkillAdjustments(omelet, ['cheffery_1', 'cheffery_2']).waitMultiplier, 0.5);
    assert.equal(craftDurationFor(omelet, ['cheffery_1']), 2000);
    assert.equal(craftDurationFor(omelet, ['cheffery_1', 'cheffery_2']), 1000);
    const inv = createInventory({ frying_pan: 1, egg_plain: 3, cheese: 1 });
    const pc = fresh();
    assert.equal(craftRecipe(inv, pc, 'basic_omelet', { learned: ['cheffery_1', 'cheffery_2'] }).ok, true);
    assert.equal(pc.energy, 97);
  });

  it('unskilled transmogrification: twice as slow, +25% energy, 20% failure', () => {
    const recipe = RECIPE_CATALOG.change_pineapple;
    const adjust = makingSkillAdjustments(recipe, []);
    assert.equal(adjust.energyCost, 5);
    assert.equal(adjust.waitMultiplier, 2);
    assert.equal(adjust.failChance, 0.2);
    assert.equal(makingSkillAdjustments(recipe, ['fruitchanging_1']).failChance, 0);
    const inv = createInventory({ fruit_changing_machine: 1, cherry: 5 });
    const pc = fresh();
    const failed = craftRecipe(inv, pc, 'change_pineapple', { learned: [], rng: () => 0.1 });
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, 'transmog_failed');
    assert.equal(countItem(inv, 'cherry'), 5);
    assert.equal(pc.energy, 98);
    assert.equal(pc.mood, 48);
    const made = craftRecipe(inv, pc, 'change_pineapple', { learned: [], rng: () => 0.5 });
    assert.equal(made.ok, true);
    assert.equal(pc.energy, 93);
  });

  it('transmogrification rolls once per batch', () => {
    const inv = createInventory({ fruit_changing_machine: 1, cherry: 15 });
    const tools = createToolConditionState();
    const pc = fresh();
    // Every roll after the first would fail; only the first counts.
    let calls = 0;
    const rng = () => (calls++ === 0 ? 0.5 : 0.1);
    const batch = craftRecipeBatch(inv, pc, 'change_pineapple', 3, { learned: [], rng, toolState: tools });
    assert.equal(batch.made, 3);
    const failInv = createInventory({ fruit_changing_machine: 1, cherry: 15 });
    const failPc = fresh();
    const failed = craftRecipeBatch(failInv, failPc, 'change_pineapple', 3, { learned: [], rng: () => 0.1 });
    assert.equal(failed.made, 0);
    assert.equal(failPc.energy, 98);
    assert.equal(failPc.mood, 48);
    assert.equal(countItem(failInv, 'cherry'), 15);
  });

  it('transmog time follows the sliding scale; machines add 2200 ms once', () => {
    const fruit = RECIPE_CATALOG.change_plum;
    const skilled = craftUnitDurations(fruit, 12, ['fruitchanging_1']);
    assert.deepEqual(skilled, [2000, 2000, 2000, 2000, 2000, 1000, 1000, 1000, 1000, 1000, 500, 500]);
    assert.equal(craftUnitDurations(fruit, 1, [])[0], 4000);
    const board = RECIPE_CATALOG.board;
    const each = craftDurationFor(board, ['woodworking_1']);
    assert.deepEqual(craftUnitDurations(board, 2, ['woodworking_1']), [each + MACHINE_EXTRA_WAIT_MS, each]);
    assert.equal(craftUnitDurations(RECIPE_CATALOG.basic_omelet, 2, ['cheffery_1']), null);
  });

  it('the Make panel Smelter and Grinder wear like their packages', () => {
    const tools = createToolConditionState();
    const inv = createInventory({ smelter: 1, metal_rock: 10, ore_grinder: 1, dullite: 9 });
    const pc = fresh({ energy: 500 });
    const smelt = getToolCondition(tools, 'smelter').remaining;
    assert.equal(craftRecipeBatch(inv, pc, 'plain_metal', 2, { learned: ['smelting_1'], toolState: tools }).made, 2);
    assert.equal(smelt - getToolCondition(tools, 'smelter').remaining, 6);
    const grind = getToolCondition(tools, 'ore_grinder').remaining;
    assert.equal(craftRecipeBatch(inv, pc, 'crush_dullite', 9, { learned: ['refining_1'], toolState: tools }).made, 9);
    assert.equal(grind - getToolCondition(tools, 'ore_grinder').remaining, 6); // 2 * round(9 / 3)
    assert.equal(makingSkillAdjustments(RECIPE_CATALOG.plain_metal, ['smelting_1'], ['smelting_energy']).energyCost, 3);
  });

  it('the Grinder runs the Refining package', () => {
    const crush = RECIPE_CATALOG.crush_dullite;
    assert.equal(recipeEnergyCost(crush, ['refining_1']), 4);
    assert.equal(recipeEnergyCost(crush, ['refining_1', 'refining_2']), 3);
    assert.equal(makingSkillAdjustments(crush, ['refining_1', 'refining_2']).waitMultiplier, 0.5);
    assert.ok(key('1'));
  });
});
