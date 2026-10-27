/**
 * Official living-trant and Wood Tree tending packages.
 *
 * Sources:
 * - items/catalog_skill_packages.js: light_green_thumb_pet/water,
 *   wood_tree_pet/water
 * - items/include/trants.js: Watering Can requirement and completion cadence;
 *   :117-121 waters with a working Irrigator 9000 first, then a Watering Can
 * - items/wood_tree.js: Wood Tree tending gates
 */

import { TOOL_CONDITION_CATALOG, WATERING_CAN_TOOLS, canUseTool, firstWorkingTool, useToolCondition } from './tools.js?v=woodcutting-test-3';
import { fruitCapacityAt, fruitProductionAt } from './trants.js?v=trant-harvest-2';
import { scaledToolWear, toolWearMultiplier } from './imagination-effects.js';
import { metabolicGain, moodMax, loseEnergy, loseMood } from './metabolics.js';
import { grantMoodXp } from './mood-xp.js';

const freezeRanks = (ranks) => Object.freeze(
  Object.fromEntries(Object.entries(ranks).map(([id, row]) => [id, Object.freeze(row)]))
);

export const LIGHT_GREEN_THUMB_RANK_IDS = Object.freeze([
  'light_green_thumb_1',
  'light_green_thumb_2',
  'light_green_thumb_3',
]);

export const TRANT_CARE_PACKAGES = Object.freeze({
  living_pet: freezeRanks({
    no_skill: { rank: -1, durationMs: 3000, successRate: 60, energyCost: 2, moodBonus: 2, xpBonus: 0, toolWear: 0 },
    light_green_thumb_1: { rank: 1, durationMs: 3000, successRate: 100, energyCost: 2, moodBonus: 2, xpBonus: 1, toolWear: 0 },
    light_green_thumb_2: { rank: 2, durationMs: 2000, successRate: 100, energyCost: 2, moodBonus: 2, xpBonus: 2, toolWear: 0 },
    light_green_thumb_3: { rank: 3, durationMs: 2000, successRate: 100, energyCost: 2, moodBonus: 2, xpBonus: 4, toolWear: 0 },
  }),
  living_water: freezeRanks({
    no_skill: { rank: -1, durationMs: 4000, successRate: 90, energyCost: 5, moodBonus: 1, xpBonus: 1, toolWear: 2 },
    light_green_thumb_1: { rank: 1, durationMs: 2000, successRate: 100, energyCost: 5, moodBonus: 1, xpBonus: 1, toolWear: 1 },
    light_green_thumb_2: { rank: 2, durationMs: 2000, successRate: 100, energyCost: 2, moodBonus: 2, xpBonus: 2, toolWear: 1 },
    light_green_thumb_3: { rank: 3, durationMs: 2000, successRate: 100, energyCost: 2, moodBonus: 2, xpBonus: 4, toolWear: 1 },
  }),
  wood_pet: freezeRanks({
    no_skill: { rank: -1, durationMs: 3000, successRate: 80, energyCost: 2, moodBonus: 4, xpBonus: 2, toolWear: 0 },
    light_green_thumb_1: { rank: 1, durationMs: 3000, successRate: 100, energyCost: 2, moodBonus: 6, xpBonus: 3, toolWear: 0 },
    light_green_thumb_2: { rank: 2, durationMs: 2000, successRate: 100, energyCost: 2, moodBonus: 8, xpBonus: 5, toolWear: 0, dropTable: 'light_green_thumb_small', dropChance: 6 },
    light_green_thumb_3: { rank: 3, durationMs: 2000, successRate: 100, energyCost: 2, moodBonus: 10, xpBonus: 8, toolWear: 0, dropTable: 'light_green_thumb_large', dropChance: 9 },
  }),
  wood_water: freezeRanks({
    no_skill: { rank: -1, durationMs: 4000, successRate: 90, energyCost: 3, moodBonus: 2, xpBonus: 2, toolWear: 2 },
    light_green_thumb_1: { rank: 1, durationMs: 2000, successRate: 100, energyCost: 3, moodBonus: 4, xpBonus: 2, toolWear: 1 },
    light_green_thumb_2: { rank: 2, durationMs: 2000, successRate: 100, energyCost: 2, moodBonus: 4, xpBonus: 4, toolWear: 1, dropTable: 'tree_watering_small', dropChance: 6 },
    light_green_thumb_3: { rank: 3, durationMs: 2000, successRate: 100, energyCost: 2, moodBonus: 4, xpBonus: 6, toolWear: 1, dropTable: 'tree_watering_large', dropChance: 9 },
  }),
});

function learnedList(value) {
  if (Array.isArray(value)) return value;
  return value?.learned || value?.skills || [];
}

export function highestLightGreenThumbRank(value) {
  const learned = new Set(learnedList(value));
  for (let rank = 3; rank >= 1; rank -= 1) {
    const id = `light_green_thumb_${rank}`;
    if (learned.has(id)) return id;
  }
  return 'no_skill';
}

export function resolveTrantCarePackage(classId, kind, learned = []) {
  const family = classId === 'wood_tree' ? 'wood' : 'living';
  const packageId = `${family}_${kind}`;
  const rankId = highestLightGreenThumbRank(learned);
  const row = TRANT_CARE_PACKAGES[packageId]?.[rankId];
  return row ? { ...row, packageId, rankId, kind } : null;
}

/** Quote all gates without mutating player, tree, inventory, or tool state. */
export function quoteTrantCare(state, classId, kind, ctx = {}) {
  const profile = resolveTrantCarePackage(classId, kind, ctx.learned || ctx.skills || []);
  if (!state || !profile || !['pet', 'water'].includes(kind)) {
    return { ok: false, reason: 'invalid', msg: 'That tree cannot be tended this way.', profile };
  }
  const flag = kind === 'water' ? 'watered' : 'petted';
  let toolId = null;
  if (state[flag]) {
    return { ok: false, reason: 'daily', msg: `This tree was already ${flag} today.`, profile };
  }
  if (kind === 'water') {
    const can = firstWorkingTool(ctx.tools, ctx.inv, WATERING_CAN_TOOLS, profile.toolWear);
    if (!can.owned) {
      return { ok: false, reason: 'tool_missing', msg: 'You need a working Watering Can.', profile };
    }
    toolId = can.tool || can.fallback;
    const tool = canUseTool(ctx.tools, toolId, profile.toolWear);
    if (!tool.ok) {
      return { ok: false, reason: 'tool_broken', msg: 'Sadly, your Watering Can is too worn out.', profile, tool, toolId };
    }
  }
  const energy = Math.max(0, Number(ctx.pc?.energy) || 0);
  // inc_skill_packages.js startSkillPackage refuses at energy <= cost.
  if (energy <= profile.energyCost) {
    return {
      ok: false,
      reason: 'energy',
      msg: `You need ${profile.energyCost} energy to ${kind} this tree.`,
      profile,
    };
  }
  return { ok: true, profile, flag, toolId, toolLabel: TOOL_CONDITION_CATALOG[toolId]?.label || null };
}

/**
 * include/trants.js onFruitCycle (1043-1054), called from plusHealth (697-704):
 * refresh the capacity for the tree's maturity and health, then push the
 * fruitProdMap cell's fruit back on, never past the capacity (pushFruit 466-473).
 * This is the only way a living trant regrows fruit after initTrant fills it
 * (518); nothing in GSJS refills trees at the new game day.
 * Returns the fruit added.
 */
export function trantFruitCycle(state, classId = state?.classTsid) {
  if (!state) return 0;
  const cap = fruitCapacityAt(classId, state.maturity, state.health);
  state.fruitCapacity = cap;
  const before = Math.min(cap, Math.max(0, Number(state.fruitCount) || 0));
  const push = fruitProductionAt(classId, state.maturity, state.health);
  state.fruitCount = Math.min(cap, before + Math.max(0, push));
  return state.fruitCount - before;
}

/**
 * Commit one tending attempt. The success roll comes first, as in
 * finishSkillPackage: a failure spends no energy and no Watering Can wear; a
 * failed living-trant pet loses its mood bonus (include/trants.js onPetComplete).
 * Health rises once a period, when the tree has been both petted and watered
 * (include/trants.js performTending), and that health tick regrows the fruit.
 */
export function performTrantCare(state, classId, kind, ctx = {}) {
  const quote = quoteTrantCare(state, classId, kind, ctx);
  if (!quote.ok) return quote;
  const { profile, flag, toolId } = quote;
  const rng = ctx.rng || Math.random;
  const pc = ctx.pc;
  const success = rng() * 100 < profile.successRate;
  if (!success) {
    const moodBefore = Number(pc.mood) || 0;
    if (kind === 'pet' && classId !== 'wood_tree' && profile.moodBonus) {
      // include/trants.js 97: metabolics_lose_mood(mood_bonus) (G300: nothing while dead).
      loseMood(pc, profile.moodBonus);
    }
    return {
      ok: false,
      attempted: true,
      success: false,
      reason: 'failed',
      msg: 'Oops. You failed! You probably need a bit more skill to stop that from happening.',
      profile,
      toolUse: null,
      effects: { energy: 0, mood: (Number(pc.mood) || 0) - moodBefore, xp: 0 },
    };
  }
  // G289: metabolics_lose_energy, nothing lost while dead (inc_metabolics.js 108-122).
  loseEnergy(pc, profile.energyCost);
  // Heavy Flow (lightgreenthumb_tool_wear): the Watering Can wears at half rate.
  const upgrades = ctx.upgrades || ctx.imaginationUpgrades || pc?.imaginationUpgrades || [];
  const wear = kind === 'water'
    ? scaledToolWear(ctx.tools, toolId, profile.toolWear, toolWearMultiplier(toolId, upgrades))
    : 0;
  const toolUse = kind === 'water' && wear > 0
    ? useToolCondition(ctx.tools, toolId, wear)
    : null;
  state[flag] = true;
  let fruitAdded = 0;
  if (classId !== 'wood_tree') {
    if (state.petted && state.watered) {
      // performTending (670-684): plusHealth, which runs onFruitCycle.
      state.health = Math.max(1, Math.min(10, (Number(state.health) || 5) + 1));
      fruitAdded = trantFruitCycle(state, classId);
    } else {
      state.fruitCapacity = fruitCapacityAt(classId, state.maturity, state.health);
      state.fruitCount = Math.min(state.fruitCapacity, Math.max(0, Number(state.fruitCount) || 0));
    }
  }
  const moodBefore = Number(pc.mood) || 0;
  // G259: mood_bonus is metabolics_add_mood (inc_skill_packages.js 524), refused while dead.
  if (!(profile.moodBonus > 0) || metabolicGain('mood').ok) pc.mood = Math.min(moodMax(pc), moodBefore + profile.moodBonus);
  const mood = pc.mood - moodBefore;
  // inc_skill_packages.js 532: xp_bonus takes the mood bonus (after the mood gain).
  const xp = grantMoodXp(pc, profile.xpBonus);
  return {
    ok: true,
    attempted: true,
    success: true,
    profile,
    toolUse,
    fruitAdded,
    effects: { energy: -profile.energyCost, mood, xp },
    msg: `Thanks for ${kind === 'water' ? 'watering' : 'petting'}!`,
  };
}
