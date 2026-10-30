/**
 * Official Wood Tree harvesting loop.
 *
 * Source: Tiny Speck `items/wood_tree.js`, `items/hatchet.js`, and the
 * `wood_tree_harvest` skill package. The remake keeps the original daily
 * limit, maturity production curve, energy cost, and Hatchet wear.
 *
 * The Class Axe (items/class_axe.js, parent class hatchet, 300 points) works
 * wherever a Hatchet does: wood_tree.js:673 doHarvest takes the first working
 * stack where `class_tsid == 'hatchet' || class_tsid == 'class_axe'`.
 */

import { canUseTool, useToolCondition } from './tools.js?v=9a2e7ef4';
import { woodHarvestOverrides } from './imagination-effects.js?v=70169933';
import { ENCHANTED_WOOD_TREE } from './enchanted-forests.js?v=dd04e11b';
import { loseEnergy } from './metabolics.js?v=8504134e';

export const WOOD_TREE_SOURCE = 'tinyspeck/glitch-GameServerJS CC0';

/** wood_tree.js:673 is_hatchet, in the order the remake looks for them. */
export const WOOD_TOOLS = Object.freeze(['hatchet', 'class_axe']);
const WOOD_TOOL_LABELS = Object.freeze({ hatchet: 'Hatchet', class_axe: 'Class Axe' });

export function woodToolLabel(tool) {
  return WOOD_TOOL_LABELS[tool] || 'Hatchet';
}

/**
 * The tool a harvest uses: the first working Hatchet or Class Axe, else the
 * first one owned (so its broken message shows), else null.
 */
export function pickWoodTool(inv = {}, toolState = {}, wear = WOOD_TREE_HARVEST.hatchetWear) {
  const owned = WOOD_TOOLS.filter((id) => (inv?.[id] || 0) >= 1);
  return owned.find((id) => canUseTool(toolState, id, wear).ok) || owned[0] || null;
}

export const WOOD_TREE_HARVEST = Object.freeze({
  durationMs: 4000,
  energyCost: 20,
  hatchetWear: 5,
  dailyLimit: 1,
  plankYieldByMaturity: Object.freeze([25, 30, 40, 50, 60, 80]),
});

/**
 * wood_tree.js:1303-1331 responses, picked by doHarvest (745-754) from the
 * maturity before the harvest: harvest_state_1to0 for the wee tree it fells,
 * 3to2_2to1 for 2-3, 5to4_4to3 for 4-5, 6to5 for 6.
 */
const HARVEST_LINES = Object.freeze({
  // harvest_state_1to0 (wood_tree.js:1304-1310).
  felled: Object.freeze(['Wood: felled.', 'My trunk! My mighty tru…', "I've totally lost wood.", "Aaaand I'm spent.", 'Kiss this wood goodbye.']),
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
  if (state.enchanted !== true) delete state.enchanted;
  delete state.harvest_count;
  delete state.harvested;
  return state;
}

/**
 * plankProdMap[maturity - 1]. An enchanted tree (wood_tree_enchanted.js,
 * state.enchanted) has its own map, 10-60 instead of 25-80.
 */
export function plankYieldForMaturity(maturity, state = null) {
  const index = whole(maturity, 1, 1, 6) - 1;
  const map = state?.enchanted === true ? ENCHANTED_WOOD_TREE.plankYieldByMaturity : WOOD_TREE_HARVEST.plankYieldByMaturity;
  return map[index];
}

/**
 * The source names one size: maturity 1 is the "wee tree" a harvest kills
 * (wood_tree.js:451 harvest_clear tooltip, :458 maturity == 1). The other
 * words follow doHarvest's talkback tiers (745-754): 2-3, 4-5, and 6.
 */
export function woodMaturityLabel(maturity) {
  return ['Wee', 'Young', 'Young', 'Large', 'Large', 'Mighty'][whole(maturity, 1, 1, 6) - 1];
}

export function woodTreeStatusLabel(state = {}) {
  const s = ensureWoodTreeState(state);
  if (s.maturity <= 0) return 'Cleared · only a patch remains';
  const yieldCount = plankYieldForMaturity(s.maturity, s);
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
  // Woodier Harvest (gardening_harvest_wood): 12 energy and 3 Hatchet wear.
  const woodier = woodHarvestOverrides(pc?.imaginationUpgrades);
  const hatchetWear = woodier?.toolWear ?? WOOD_TREE_HARVEST.hatchetWear;
  const woodTool = pickWoodTool(inv, toolState, hatchetWear);
  if (!woodTool) {
    return {
      ok: false,
      reason: 'hatchet',
      msg: "You can't just pluck planks from a tree. You need a Hatchet.",
    };
  }
  const energyCost = woodier?.energyCost ?? WOOD_TREE_HARVEST.energyCost;
  const tool = canUseTool(toolState, woodTool, hatchetWear);
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
    tool: woodTool,
    toolLabel: woodToolLabel(woodTool),
    plankYield: plankYieldForMaturity(s.maturity, s),
    maturity: s.maturity,
    condition: tool.condition,
  };
}

function harvestLine(maturity, turn) {
  const pool = maturity >= 6
    ? HARVEST_LINES.mighty
    : maturity >= 4
      ? HARVEST_LINES.medium
      : maturity >= 2
        ? HARVEST_LINES.small
        : HARVEST_LINES.felled;
  return pool[whole(turn, 0) % pool.length];
}

/** Commit one atomic harvest after every gate succeeds. */
export function harvestWoodTree(state, inv = {}, pc = {}, toolState = {}) {
  const s = ensureWoodTreeState(state || {});
  const quote = quoteWoodTreeHarvest(s, inv, pc, toolState);
  if (!quote.ok) return quote;
  const toolUse = useToolCondition(toolState, quote.tool, quote.hatchetWear);
  if (!toolUse.ok) return { ...toolUse, reason: 'broken_hatchet' };

  const maturityBefore = s.maturity;
  // G289: metabolics_lose_energy, nothing lost while dead (inc_metabolics.js 108-122).
  loseEnergy(pc, quote.energyCost);
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
    tool: quote.tool,
    toolLabel: quote.toolLabel,
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
