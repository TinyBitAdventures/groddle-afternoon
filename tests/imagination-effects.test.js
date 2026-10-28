import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { join } from 'node:path';
import {
  achievementRewardModifier,
  adjustedVendorPayout,
  adjustedVendorPrice,
  gardenGrowModifier,
  learningTimeModifier,
  makingBonusRow,
  miningExpertBonus,
  questRewardModifier,
  rollGemSmall,
  rollMakingBonusImagination,
  scaleRewards,
  scaledToolWear,
  skillTimeFactor,
  toolWearMultiplier,
} from '../public/js/imagination-effects.js?v=g403-1';
import { IMAGINATION_UPGRADES } from '../public/js/imagination.js?v=g403-1';
import { REMAKE_STATUS_RULES, isOfferedInRemake, remakeStatus } from '../public/js/imagination-remake.js?v=g403-1';
import { applyRewards } from '../public/js/quests.js';
import { createInventory, countItem, ensureItem } from '../public/js/inventory.js?v=catalog-unified-7';
import { createMineRock, miningProfile, mineRock, smeltMetalRocks } from '../public/js/mining.js?v=g403-1';
import { craftRecipe, makingSkillAdjustments } from '../public/js/making.js?v=g403-1';
import { createToolConditionState, getToolCondition, repairToolCondition, setToolRemaining } from '../public/js/tools.js?v=woodcutting-test-8';
import { quoteWoodTreeHarvest } from '../public/js/woodcutting.js?v=g414-1';
import { resolveAnimalKinshipPackage } from '../public/js/animal-kinship.js?v=g403-1';
import { createGarden, getPlot, plantPlot, plotKey } from '../public/js/garden.js?v=g403-1';
import { vendorBuy, vendorSell, vendorBuyUnitPrice } from '../public/js/vendor.js?v=vendor-profiles-12';
import { normalizePlayerSnapshot } from '../public/js/player-save.js?v=g403-1';
import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=g403-1';
import { createSkillState, getStudyStatus, pauseSkillStudy, startSkillStudy } from '../public/js/skills.js';

const root = join(import.meta.dirname, '..', 'public');
const ALL_AK = ['animalkinship_1', 'animalkinship_2', 'animalkinship_3', 'animalkinship_4', 'animalkinship_5', 'animalkinship_6', 'animalkinship_7'];

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(root, 'assets/content'));
});

describe('remake status for every card', () => {
  it('gives each of the 275 cards a status and deals only wired ones', () => {
    const counts = {};
    for (const id of Object.keys(IMAGINATION_UPGRADES)) {
      const { status, note } = remakeStatus(id);
      assert.ok(note.length > 10, id);
      counts[status] = (counts[status] || 0) + 1;
      assert.equal(isOfferedInRemake(id), status === 'live' || status === 'partial', id);
    }
    assert.equal(counts.starter, 9);
    assert.ok(counts.live > 150, JSON.stringify(counts));
    // No catalog card falls through to the default rule.
    for (const id of Object.keys(IMAGINATION_UPGRADES)) {
      assert.ok(REMAKE_STATUS_RULES.some(([re]) => re.test(id)), id);
    }
  });
});

describe('reward upgrades', () => {
  it('adds Overachiever and Fit for a King to the reward multiplier', () => {
    assert.equal(achievementRewardModifier(['achievement_reward_bonus_1', 'achievement_reward_bonus_3']), 0.06);
    assert.equal(questRewardModifier(['quest_reward_bonus_5']), 0.1);
    const pc = { xp: 0, imagination: 0, currants: 0, energy: 0, mood: 0 };
    applyRewards(pc, { xp: 100, currants: 50 }, { bonus: 0.1 });
    assert.deepEqual([pc.xp, pc.imagination, pc.currants], [110, 110, 55]);
    assert.equal(pc.rewardBuffConsumed, undefined);
    const buffed = { xp: 0, imagination: 0, rewardMultiplier: 1.2 };
    applyRewards(buffed, { xp: 100 }, { bonus: 0.04 });
    // round_to_5 (common.js): 124 -> 125, 82.5 -> 85, 11 -> 10.
    assert.equal(buffed.xp, 125);
    assert.deepEqual(scaleRewards({ xp: 75, favor: { giant: 'pot', points: 10 } }, 0.1), { xp: 85, favor: { giant: 'pot', points: 10 } });
  });
});

describe('vendor upgrades', () => {
  it('charges less and pays more with the haggling cards', () => {
    assert.equal(adjustedVendorPrice(100, ['vendors_lower_sell_price_2']), 95);
    assert.equal(adjustedVendorPayout(100, ['vendors_higher_buy_price_4']), 110);
    const offers = [{ classTsid: 'apple', label: 'Apple', buyPrice: 40, sellPrice: 20 }];
    assert.equal(vendorBuyUnitPrice(offers[0], ['vendors_lower_sell_price_4']), 36);
    const pc = { currants: 1000, imaginationUpgrades: ['vendors_lower_sell_price_4', 'vendors_higher_buy_price_1'] };
    const inv = createInventory({ apple: 0 });
    assert.equal(vendorBuy(pc, inv, offers, 'apple', 2).cost, 72);
    // inc_stores.js: round(5 * 0.66) = 3 an Apple, x10 = 30, +2% rounded once on the total.
    inv.apple = 10;
    assert.equal(vendorSell(pc, inv, offers, 'apple', 10).gain, 31);
  });
});

describe('mining and metal upgrades', () => {
  it('shortens swings and adds the gem drop through the package overlay', () => {
    const base = miningProfile(['mining_1'], 'pick');
    const fast = miningProfile(['mining_1'], 'pick', ['mining_time_3', 'mining_drop_2']);
    assert.equal(fast.sourceDurationMs, base.sourceDurationMs / 2);
    assert.equal(fast.dropClassId, 'gem_small');
    assert.equal(fast.dropChance, 5);
    assert.equal(base.dropChance, 0);
  });

  it('mines 15% more as an expert and can turn up a gem', () => {
    assert.equal(miningExpertBonus('rock_beryl_1', ['mining_expert_beryl'], 8), 1);
    assert.equal(miningExpertBonus('rock_beryl_1', ['mining_expert_dullite'], 8), 0);
    const rock = createMineRock('rock_beryl_1');
    const inv = createInventory({ pick: 1 });
    const pc = { energy: 100, imagination: 0, xp: 0, imaginationUpgrades: ['mining_expert_beryl', 'mining_drop_1'] };
    const r = mineRock(rock, inv, pc, { learned: ['mining_1'], rng: () => 0 });
    assert.equal(r.ok, true);
    assert.equal(r.gem, 'gem_amber');
    assert.equal(countItem(inv, 'gem_amber'), 1);
    assert.equal(rollGemSmall(() => 0.999), 'gem_diamond');
  });

  it('smelts for 3 energy and 2 wear with the smelting cards', () => {
    const inv = createInventory({ metal_rock: 10, smelter: 1 });
    const pc = { energy: 50, imagination: 0, xp: 0, imaginationUpgrades: ['smelting_energy', 'smelting_tool_wear'] };
    const tools = createToolConditionState();
    const before = getToolCondition(tools, 'smelter').remaining;
    const r = smeltMetalRocks(inv, pc, { learned: ['smelting_1'], toolState: tools });
    assert.equal(r.ok, true);
    assert.equal(pc.energy, 44);
    assert.equal(before - getToolCondition(tools, 'smelter').remaining, 4);
  });

  it('grinds faster with Refined Speed', () => {
    const recipe = { tool: 'ore_grinder', energyCost: 4, waitMs: 4000 };
    assert.equal(makingSkillAdjustments(recipe, ['refining_1']).waitMs, 4000);
    assert.equal(makingSkillAdjustments(recipe, ['refining_1'], ['refining_time_2']).waitMs, 2400);
  });
});

describe('making upgrades', () => {
  it('rolls bonus iMG worth a share of the output and halves cooking wear', () => {
    assert.deepEqual(makingBonusRow('beaker', ['intermediate_admixing_imagination_1']), {
      id: 'intermediate_admixing_imagination_1', chance: 0.08, share: 0.1,
    });
    assert.equal(rollMakingBonusImagination('frying_pan', ['cheffery_imagination'], 100, () => 0.05), 20);
    assert.equal(rollMakingBonusImagination('frying_pan', ['cheffery_imagination'], 100, () => 0.5), 0);
    assert.equal(toolWearMultiplier('knife_and_board', ['ezcooking_tool_wear']), 0.5);
    const tools = {};
    assert.deepEqual([1, 1, 1, 1].map(() => scaledToolWear(tools, 'knife_and_board', 1, 0.5)), [0, 1, 0, 1]);
  });

  it('applies them inside craftRecipe', () => {
    ensureItem('flour', { baseCost: 50 });
    const inv = createInventory({ grain: 10, knife_and_board: 1 });
    const pc = { energy: 50, imagination: 0, xp: 0, imaginationUpgrades: ['ezcooking_less_imagination', 'ezcooking_tool_wear'] };
    const tools = createToolConditionState();
    const start = getToolCondition(tools, 'knife_and_board').remaining;
    const r = craftRecipe(inv, pc, 'flour', { toolState: tools, rng: () => 0 });
    assert.equal(r.ok, true);
    assert.equal(r.bonusImagination, 10);
    assert.equal(start - getToolCondition(tools, 'knife_and_board').remaining, 0);
  });
});

describe('tree, garden, animal and tool upgrades', () => {
  it('Woodier Harvest costs 12 energy and 3 Hatchet wear', () => {
    const quote = quoteWoodTreeHarvest({ maturity: 6 }, { hatchet: 1 }, { energy: 50, imaginationUpgrades: ['gardening_harvest_wood'] }, createToolConditionState());
    assert.equal(quote.ok, true);
    assert.equal(quote.energyCost, 12);
    assert.equal(quote.hatchetWear, 3);
  });

  it('Super Animal Harvest and Grain Attraction overlay the package', () => {
    const base = resolveAnimalKinshipPackage('npc_chicken', 'squeeze', ALL_AK);
    const grain = resolveAnimalKinshipPackage('npc_chicken', 'squeeze', ALL_AK, ['animal_kinship_grain']);
    assert.deepEqual([grain.bonusAmount, grain.bonusMultiplier, grain.bonusChance], [10, 4, 0.1]);
    assert.notEqual(base.bonusAmount, 10);
    const milk = resolveAnimalKinshipPackage('npc_butterfly', 'milk', ALL_AK, ['animal_kinship_super_harvest_3']);
    assert.equal(milk.bonusMultiplier, 5);
  });

  it('Growth Spurt and Speedy Herbs set the plot grow modifier at planting', () => {
    assert.equal(gardenGrowModifier('herb', ['herbalism_time_2']), 0.2);
    assert.equal(gardenGrowModifier('default', ['herbalism_time_2']), 0);
    const garden = createGarden({ cols: 2, rows: 2, now: 0 });
    const key = plotKey(1, 1);
    const inv = createInventory({ seed_spinach: 1 });
    const pc = { energy: 50, mood: 40, imagination: 0, xp: 0, imaginationUpgrades: ['croppery_time_2'] };
    assert.equal(plantPlot(garden, key, inv, pc, 'seed_spinach', { now: 0 }).ok, true);
    assert.equal(getPlot(garden, key).growModifier, 0.8);
  });

  it('Tink Happy Thoughts adds the Tinkertool wear as mood', () => {
    const state = createToolConditionState();
    setToolRemaining(state, 'hoe', 0);
    const pc = { energy: 50, mood: 40, imaginationUpgrades: ['tinkering_repairing_gives_mood'] };
    const r = repairToolCondition(state, 'hoe', pc, { learned: ['tinkering_1'], hasTinkertool: true });
    assert.equal(r.ok, true);
    assert.equal(r.moodGained, r.quote.tinkertoolWear);
    assert.equal(pc.mood, 40 + r.quote.tinkertoolWear);
  });
});

describe('learning time and the energy tank', () => {
  it('follows skills_get_learning_time_modifier', () => {
    assert.equal(learningTimeModifier(0, 20), 0.15);
    assert.equal(learningTimeModifier(20, 20), 1);
    assert.ok(Math.abs(learningTimeModifier(22, 20) - 1.1025) < 1e-12);
    assert.ok(Math.abs(skillTimeFactor({ count: 21, brainCapacity: 20, categoryId: 6, reductions: { 6: 20 } }) - 0.84) < 1e-12);
  });

  it('stretches study time by the factor and keeps progress across a pause', () => {
    const state = createSkillState();
    const started = startSkillStudy(state, 'animalkinship_1', { level: 99, timeFactor: 2 }, 0);
    assert.equal(started.durationSeconds, 120);
    assert.equal(getStudyStatus(state, 'animalkinship_1', 30_000).remainingSeconds, 90);
    pauseSkillStudy(state, 'animalkinship_1', 30_000);
    assert.equal(getStudyStatus(state, 'animalkinship_1', 30_000).remainingSeconds, 90);
    const resumed = startSkillStudy(state, 'animalkinship_1', { level: 99, timeFactor: () => 1 }, 40_000);
    assert.equal(resumed.durationSeconds, 45);
  });

  it('saves a bigger energy tank and keeps energy above 100', () => {
    const snap = normalizePlayerSnapshot({ energy: 240, energyMax: 300 });
    assert.equal(snap.energyMax, 300);
    assert.equal(snap.energy, 240);
    assert.equal(normalizePlayerSnapshot({ energy: 240 }).energy, 100);
  });
});
