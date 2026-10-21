/**
 * Official Wood Tree harvesting loop.
 *
 * Source: Tiny Speck `items/wood_tree.js`, `items/hatchet.js`, and the
 * `wood_tree_harvest` skill package. The remake keeps the original daily
 * limit, maturity production curve, energy cost, and Hatchet wear.
 */

import { canUseTool, useToolCondition } from './tools.js?v=tools-2';
import { woodHarvestOverrides } from './imagination-effects.js';

export const WOOD_TREE_SOURCE = 'tinyspeck/glitch-GameServerJS CC0';

export const WOOD_TREE_HARVEST = Object.freeze({
  durationMs: 4000,
  energyCost: 20,
  hatchetWear: 5,
  dailyLimit: 1,
  plankYieldByMaturity: Object.freeze([25, 30, 40, 50, 60, 80]),
});

const HARVEST_LINES = Object.freeze({
  small: Object.freeze(['Donk.', 'Thonk.', "You've got wood.", 'Planks.']),
  medium: Object.freeze([
    'Never mind the quality, feel the width.',
    'Wood you like some planks?',
    'Mighty chopper you have there.',
  ]),
  mighty: Object.freeze([
    'How much wood would a Wood Tree drop if a Wood Tree could drop wood?',
    'Tiiiiimmmmberrrrr!',
    'Many planks.',
    'Planks for having me.',
  ]),
});

function whole(value, fallback = 0, min = 0, max = 999999) {
  const number = Math.floor(Number(value));
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

/** Fill and sanitize persisted Wood Tree fields without replacing the object. */
export function ensureWoodTreeState(state = {}) {
  state.maturity = whole(state.maturity, 6, 0, 6);
  state.harvestCount = whole(state.harvestCount ?? state.harvest_count, 0, 0, 1);
  state.harvestedToday = state.harvestedToday === true || state.harvested === true;
  state.totalHarvests = whole(state.totalHarvests, 0);
  state.petted = state.petted === true;
  state.watered = state.watered === true;
  delete state.harvest_count;
  delete state.harvested;
  return state;
}

export function plankYieldForMaturity(maturity) {
  const index = whole(maturity, 1, 1, 6) - 1;
  return WOOD_TREE_HARVEST.plankYieldByMaturity[index];
}

export function woodMaturityLabel(maturity) {
  return ['Stump', 'Wee', 'Young', 'Sturdy', 'Large', 'Mighty'][whole(maturity, 1, 1, 6) - 1];
}

export function woodTreeStatusLabel(state = {}) {
  const s = ensureWoodTreeState(state);
  if (s.maturity <= 0) return 'Cleared · only a patch remains';
  const yieldCount = plankYieldForMaturity(s.maturity);
  const base = s.harvestedToday
    ? `${woodMaturityLabel(s.maturity)} · harvested today`
    : `${woodMaturityLabel(s.maturity)} · ${yieldCount} planks · Hatchet required`;
  const care = [s.petted ? 'petted' : '', s.watered ? 'watered' : ''].filter(Boolean).join(' + ');
  return care ? `${base} · ${care}` : base;
}

/** Read-only harvest gate used by the verb menu. */
export function quoteWoodTreeHarvest(state, inv = {}, pc = {}, toolState = {}) {
  const s = ensureWoodTreeState(state || {});
  if (s.maturity <= 0) {
    return { ok: false, reason: 'cleared', msg: 'This Wood Tree has been cleared.' };
  }
  if (s.harvestedToday) {
    return {
      ok: false,
      reason: 'daily_limit',
      msg: 'You can only harvest this tree once per game day.',
    };
  }
  if ((inv?.hatchet || 0) < 1) {
    return {
      ok: false,
      reason: 'hatchet',
      msg: "You can't just pluck planks from a tree. You need a Hatchet.",
    };
  }
  // Woodier Harvest (gardening_harvest_wood): 12 energy and 3 Hatchet wear.
  const woodier = woodHarvestOverrides(pc?.imaginationUpgrades);
  const energyCost = woodier?.energyCost ?? WOOD_TREE_HARVEST.energyCost;
  const hatchetWear = woodier?.toolWear ?? WOOD_TREE_HARVEST.hatchetWear;
  const tool = canUseTool(toolState, 'hatchet', hatchetWear);
  if (!tool.ok) return { ...tool, reason: 'broken_hatchet', msg: tool.msg };
  if ((pc?.energy || 0) <= energyCost) {
    return {
      ok: false,
      reason: 'energy',
      msg: `You need ${energyCost} energy to harvest this tree.`,
    };
  }
  return {
    ok: true,
    durationMs: WOOD_TREE_HARVEST.durationMs,
    energyCost,
    hatchetWear,
    plankYield: plankYieldForMaturity(s.maturity),
    maturity: s.maturity,
    condition: tool.condition,
  };
}

function harvestLine(maturity, turn) {
  const pool = maturity >= 6
    ? HARVEST_LINES.mighty
    : maturity >= 4
      ? HARVEST_LINES.medium
      : HARVEST_LINES.small;
  return pool[whole(turn, 0) % pool.length];
}

/** Commit one atomic harvest after every gate succeeds. */
export function harvestWoodTree(state, inv = {}, pc = {}, toolState = {}) {
  const s = ensureWoodTreeState(state || {});
  const quote = quoteWoodTreeHarvest(s, inv, pc, toolState);
  if (!quote.ok) return quote;
  const toolUse = useToolCondition(toolState, 'hatchet', quote.hatchetWear);
  if (!toolUse.ok) return { ...toolUse, reason: 'broken_hatchet' };

  const maturityBefore = s.maturity;
  pc.energy = Math.max(0, (pc.energy || 0) - quote.energyCost);
  inv.plank = (inv.plank || 0) + quote.plankYield;
  s.harvestedToday = true;
  s.totalHarvests += 1;

  // Production trees above maturity 2 lose one maturity every second harvest.
  // Wee trees lose one immediately, matching `wood_tree.js::endHarvest`.
  if (maturityBefore <= 2 || s.harvestCount !== 0) {
    s.maturity = Math.max(0, maturityBefore - 1);
    s.harvestCount = 0;
  } else {
    s.harvestCount = 1;
  }

  return {
    ok: true,
    plankYield: quote.plankYield,
    maturityBefore,
    maturityAfter: s.maturity,
    depleted: s.maturity <= 0,
    energyCost: quote.energyCost,
    toolUse,
    line: harvestLine(maturityBefore, s.totalHarvests - 1),
    source: WOOD_TREE_SOURCE,
  };
}

export function resetWoodTreeDay(state = {}) {
  const s = ensureWoodTreeState(state);
  s.harvestedToday = false;
  s.petted = false;
  s.watered = false;
  return s;
}
