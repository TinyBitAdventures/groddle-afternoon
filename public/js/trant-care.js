/**
 * Official living-trant and Wood Tree tending packages.
 *
 * Sources:
 * - items/catalog_skill_packages.js: light_green_thumb_pet/water,
 *   wood_tree_pet/water
 * - items/include/trants.js: Watering Can requirement and completion cadence
 * - items/wood_tree.js: Wood Tree tending gates
 */

import { canUseTool, useToolCondition } from './tools.js';
import { fruitCapacityAt } from './trants.js?v=trant-harvest-2';
import { scaledToolWear, toolWearMultiplier } from './imagination-effects.js';

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

function countInventory(inv, classTsid) {
  return Math.max(0, Math.floor(Number(inv?.[classTsid]) || 0));
}

/** Quote all gates without mutating player, tree, inventory, or tool state. */
export function quoteTrantCare(state, classId, kind, ctx = {}) {
  const profile = resolveTrantCarePackage(classId, kind, ctx.learned || ctx.skills || []);
  if (!state || !profile || !['pet', 'water'].includes(kind)) {
    return { ok: false, reason: 'invalid', msg: 'That tree cannot be tended this way.', profile };
  }
  const flag = kind === 'water' ? 'watered' : 'petted';
  if (state[flag]) {
    return { ok: false, reason: 'daily', msg: `This tree was already ${flag} today.`, profile };
  }
  if (kind === 'water') {
    if (countInventory(ctx.inv, 'watering_can') < 1) {
      return { ok: false, reason: 'tool_missing', msg: 'You need a working Watering Can.', profile };
    }
    const tool = canUseTool(ctx.tools, 'watering_can', profile.toolWear);
    if (!tool.ok) {
      return { ok: false, reason: 'tool_broken', msg: 'Sadly, your Watering Can is too worn out.', profile, tool };
    }
  }
  const energy = Math.max(0, Number(ctx.pc?.energy) || 0);
  if (energy < profile.energyCost) {
    return {
      ok: false,
      reason: 'energy',
      msg: `You need ${profile.energyCost} energy to ${kind} this tree.`,
      profile,
    };
  }
  return { ok: true, profile, flag };
}

/**
 * Commit one tending attempt. Energy and Watering Can wear are spent on a failed
 * no-skill attempt, matching the original skill-package attempt semantics.
 */
export function performTrantCare(state, classId, kind, ctx = {}) {
  const quote = quoteTrantCare(state, classId, kind, ctx);
  if (!quote.ok) return quote;
  const { profile, flag } = quote;
  const rng = ctx.rng || Math.random;
  const pc = ctx.pc;
  pc.energy = Math.max(0, (Number(pc.energy) || 0) - profile.energyCost);
  // Heavy Flow (lightgreenthumb_tool_wear): the Watering Can wears at half rate.
  const upgrades = ctx.upgrades || ctx.imaginationUpgrades || pc?.imaginationUpgrades || [];
  const wear = kind === 'water'
    ? scaledToolWear(ctx.tools, 'watering_can', profile.toolWear, toolWearMultiplier('watering_can', upgrades))
    : 0;
  const toolUse = kind === 'water' && wear > 0
    ? useToolCondition(ctx.tools, 'watering_can', wear)
    : null;
  const success = rng() * 100 < profile.successRate;
  if (!success) {
    return {
      ok: false,
      attempted: true,
      success: false,
      reason: 'failed',
      msg: 'Oops. You failed! A little more Light Green Thumb would help.',
      profile,
      toolUse,
      effects: { energy: -profile.energyCost, mood: 0, xp: 0 },
    };
  }
  state[flag] = true;
  state.health = Math.max(1, Math.min(10, (Number(state.health) || 5) + 1));
  if (classId !== 'wood_tree') {
    state.fruitCapacity = fruitCapacityAt(classId, state.maturity, state.health);
    state.fruitCount = Math.min(state.fruitCapacity, Math.max(0, Number(state.fruitCount) || 0));
  }
  const moodBefore = Number(pc.mood) || 0;
  pc.mood = Math.min(100, moodBefore + profile.moodBonus);
  const mood = pc.mood - moodBefore;
  pc.imagination = (Number(pc.imagination) || 0) + profile.xpBonus;
  pc.xp = (Number(pc.xp) || 0) + profile.xpBonus;
  return {
    ok: true,
    attempted: true,
    success: true,
    profile,
    toolUse,
    effects: { energy: -profile.energyCost, mood, xp: profile.xpBonus },
    msg: `Thanks for ${kind === 'water' ? 'watering' : 'petting'}!`,
  };
}
