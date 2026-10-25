/**
 * Persistent Glitch-style tool condition and Tinkertool repairs.
 *
 * Capacities and base costs come from the generated Tiny Speck item classes.
 * Tools whose GSJS points_capacity is 0 remain intentionally wear-free.
 */

import { repairGivesMood } from './imagination-effects.js';
import { moodMax } from './metabolics.js';

export const TOOL_CONDITION_CATALOG = Object.freeze({
  butterfly_lotion: {
    label: 'Butterfly Lotion',
    capacity: 5,
    baseCost: 10,
    repairable: false,
    source: 'butterfly_lotion.js',
  },
  watering_can: { label: 'Watering Can', capacity: 100, baseCost: 75, source: 'watering_can.js' },
  hoe: { label: 'Hoe', capacity: 50, baseCost: 60, source: 'hoe.js' },
  // high_class_hoe.js:16,25: parent hoe, points_capacity 250, base_cost 600.
  high_class_hoe: { label: 'High-Class Hoe', capacity: 250, baseCost: 600, source: 'high_class_hoe.js' },
  hatchet: { label: 'Hatchet', capacity: 100, baseCost: 100, source: 'hatchet.js' },
  class_axe: { label: 'Class Axe', capacity: 300, baseCost: 900, source: 'class_axe.js' },
  pick: { label: 'Pick', capacity: 100, baseCost: 500, source: 'pick.js' },
  fancy_pick: { label: 'Fancy Pick', capacity: 200, baseCost: 1000, source: 'fancy_pick.js' },
  smelter: { label: 'Smelter', capacity: 500, baseCost: 700, source: 'smelter.js' },
  ore_grinder: { label: 'Grinder', capacity: 100, baseCost: 200, source: 'ore_grinder.js' },
  // grand_ol_grinder.js:16,25: parent ore_grinder, points_capacity 500, base_cost 2000.
  grand_ol_grinder: { label: "Grand Ol' Grinder", capacity: 500, baseCost: 2000, source: 'grand_ol_grinder.js' },
  alchemical_tongs: { label: 'Alchemical Tongs', capacity: 100, baseCost: 600, source: 'alchemical_tongs.js' },
  knife_and_board: { label: 'Knife & Board', capacity: 100, baseCost: 75, source: 'knife_and_board.js' },
  frying_pan: { label: 'Frying Pan', capacity: 100, baseCost: 125, source: 'frying_pan.js' },
  blender: { label: 'Blender', capacity: 100, baseCost: 150, source: 'blender.js' },
  tinkertool: { label: 'Tinkertool', capacity: 200, baseCost: 500, source: 'tinkertool.js' },
  // Recipe-import making tools (points_capacity / base_cost from each GSJS item).
  saucepan: { label: 'Saucepan', capacity: 100, baseCost: 200, source: 'saucepan.js' },
  mike_tyson_grill: { label: 'Famous Pugilist Grill', capacity: 100, baseCost: 175, source: 'mike_tyson_grill.js' },
  cocktail_shaker: { label: 'Cocktail Shaker', capacity: 100, baseCost: 150, source: 'cocktail_shaker.js' },
  awesome_pot: { label: 'Awesome Pot', capacity: 100, baseCost: 300, source: 'awesome_pot.js' },
  cauldron: { label: 'Cauldron', capacity: 200, baseCost: 3500, source: 'cauldron.js' },
  tincturing_kit: { label: 'Tincturing Kit', capacity: 100, baseCost: 1250, source: 'tincturing_kit.js' },
  loomer: { label: 'Loomer', capacity: 100, baseCost: 400, source: 'loomer.js' },
  construction_tool: { label: 'Construction Tool', capacity: 100, baseCost: 500, source: 'construction_tool.js' },
  crystallizer: { label: 'Crystalmalizing Chamber', capacity: 1000, baseCost: 2500, source: 'crystallizer.js' },
  // Resource-node tools (js/resource-nodes.js): tool_base points_capacity overrides.
  scraper: { label: 'Scraper', capacity: 50, baseCost: 300, source: 'scraper.js' },
  super_scraper: { label: 'Super Scraper', capacity: 250, baseCost: 2000, source: 'super_scraper.js' },
  shovel: { label: 'Shovel', capacity: 100, baseCost: 300, source: 'shovel.js' },
  ace_of_spades: { label: 'Ace of Spades', capacity: 500, baseCost: 3000, source: 'ace_of_spades.js' },
  // Fox Brushing (js/foxes.js): fox_brush overrides points_capacity to 100.
  fox_brush: { label: 'Fox Brush', capacity: 100, baseCost: 200, source: 'fox_brush.js' },
  // Teleportation Scripts (js/teleportation.js): one wear per script written.
  quill: { label: 'Quill', capacity: 100, baseCost: 400, source: 'quill.js' },
  // Spinning (spindle.js / splendid_spindle.js points_capacity).
  spindle: { label: 'Spindle', capacity: 100, baseCost: 200, source: 'spindle.js' },
  splendid_spindle: { label: 'Splendid Spindle', capacity: 500, baseCost: 2000, source: 'splendid_spindle.js' },
  // Machines (js/machines.js): the condition is the fuel tank, machine_base
  // max_fuel 200. Fuel Cells refill it; a Tinkertool cannot.
  metalmaker: { label: 'Metalmaker', capacity: 200, baseCost: 0, repairable: false, fuel: true, source: 'metalmaker.js machine_base max_fuel' },
  woodworker: { label: 'Woodworker', capacity: 200, baseCost: 0, repairable: false, fuel: true, source: 'woodworker.js machine_base max_fuel' },
  fuelmaker: { label: 'Fuelmaker', capacity: 200, baseCost: 0, repairable: false, fuel: true, source: 'fuelmaker.js machine_base max_fuel' },
  blockmaker: { label: 'Blockmaker', capacity: 200, baseCost: 0, repairable: false, fuel: true, source: 'blockmaker.js machine_base max_fuel' },
});

/**
 * Tools that stand in for one another, in the order the source looks for a
 * working one.
 * - Hoes: include/garden.js:233-238 and patch.js:393-402 take a working
 *   High-Class Hoe first, then a plain Hoe (patch.js:342-347 accepts either).
 * - Grinders: dullite.js:108,126 and barnacle.js:108,119 crush with either
 *   (findFirst in pack order; the remake tries the plain Grinder first, the
 *   order the source's own conditions name them).
 */
export const HOE_TOOLS = Object.freeze(['high_class_hoe', 'hoe']);
export const GRINDER_TOOLS = Object.freeze(['ore_grinder', 'grand_ol_grinder']);

/**
 * The first owned tool in `candidates` that can take `wear` (any owned one
 * when no condition state is given). `owned` says whether the pack holds any
 * of them, so callers can tell "no hoe" from "a broken hoe".
 * @param {object|null} state  tool condition state (createToolConditionState)
 * @param {Record<string, number>} inv
 * @param {readonly string[]} candidates
 * @param {number} [wear]
 */
export function firstWorkingTool(state, inv, candidates, wear = 1) {
  const owned = candidates.filter((id) => (Number(inv?.[id]) || 0) > 0);
  for (const id of owned) {
    if (!state || canUseTool(state, id, wear).ok) return { tool: id, owned: true, fallback: owned[0] };
  }
  return { tool: null, owned: owned.length > 0, fallback: owned[0] || null };
}

/** Rank data from catalog_skill_packages.js `tinkering`. */
export const TINKERING_RANKS = Object.freeze({
  tinkering_1: { rank: 1, repairPerSecond: 3, energyPercent: 50 },
  tinkering_2: { rank: 2, repairPerSecond: 6, energyPercent: 40 },
  tinkering_3: { rank: 3, repairPerSecond: 12, energyPercent: 40 },
  tinkering_4: { rank: 4, repairPerSecond: 18, energyPercent: 30 },
  tinkering_5: { rank: 5, repairPerSecond: 25, energyPercent: 20 },
});

function finiteInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function points(value) {
  return Math.max(1, finiteInt(value, 1));
}

export function createToolConditionState(seed = {}) {
  return normalizeToolConditionState(seed);
}

export function normalizeToolConditionState(seed = {}) {
  const source = seed?.condition && typeof seed.condition === 'object' ? seed.condition : {};
  const condition = {};
  for (const [classTsid, def] of Object.entries(TOOL_CONDITION_CATALOG)) {
    const row = source[classTsid];
    if (!row || typeof row !== 'object') continue;
    const remaining = Math.max(0, Math.min(def.capacity, finiteInt(row.remaining, def.capacity)));
    condition[classTsid] = {
      remaining,
      broken: row.broken === true || remaining <= 0,
      uses: Math.max(0, finiteInt(row.uses, 0)),
      repairs: Math.max(0, finiteInt(row.repairs, 0)),
    };
  }
  return {
    condition,
    totalUses: Math.max(0, finiteInt(seed?.totalUses, 0)),
    totalBreaks: Math.max(0, finiteInt(seed?.totalBreaks, 0)),
    totalRepairs: Math.max(0, finiteInt(seed?.totalRepairs, 0)),
  };
}

/** Return a stable mutable condition record, initially fully repaired. */
export function ensureToolCondition(state, classTsid) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  if (!def || !state) return null;
  if (!state.condition || typeof state.condition !== 'object') state.condition = {};
  if (!state.condition[classTsid]) {
    state.condition[classTsid] = { remaining: def.capacity, broken: false, uses: 0, repairs: 0 };
  }
  return state.condition[classTsid];
}

export function getToolCondition(state, classTsid) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  if (!def) {
    return {
      classTsid,
      label: String(classTsid || '').replace(/_/g, ' '),
      tracked: false,
      remaining: 0,
      capacity: 0,
      percent: 1,
      broken: false,
      needsRepair: false,
      repairable: false,
    };
  }
  const row = ensureToolCondition(state, classTsid);
  const remaining = Math.max(0, Math.min(def.capacity, Number(row?.remaining) || 0));
  return {
    classTsid,
    label: def.label,
    tracked: true,
    remaining,
    capacity: def.capacity,
    percent: def.capacity ? remaining / def.capacity : 1,
    broken: row?.broken === true || remaining <= 0,
    needsRepair: remaining < def.capacity,
    repairable: def.repairable !== false,
    uses: row?.uses || 0,
    repairs: row?.repairs || 0,
  };
}

export function canUseTool(state, classTsid, wear = 1) {
  const condition = getToolCondition(state, classTsid);
  if (!condition.tracked) return { ok: true, condition, wear: 0 };
  const cost = points(wear);
  if (condition.broken || condition.remaining < cost) {
    return {
      ok: false,
      reason: 'broken_tool',
      condition,
      wear: cost,
      msg: TOOL_CONDITION_CATALOG[classTsid]?.fuel
        ? "That machine doesn't have enough fuel left."
        : `This ${condition.label} has become broken, and must be repaired.`,
    };
  }
  return { ok: true, condition, wear: cost };
}

/** Spend condition only after the associated gameplay mutation is known to succeed. */
export function useToolCondition(state, classTsid, wear = 1) {
  const check = canUseTool(state, classTsid, wear);
  if (!check.ok || !check.condition.tracked) return check;
  const row = ensureToolCondition(state, classTsid);
  const wasBroken = row.broken === true || row.remaining <= 0;
  row.remaining = Math.max(0, row.remaining - check.wear);
  row.uses = (row.uses || 0) + check.wear;
  state.totalUses = (state.totalUses || 0) + check.wear;
  row.broken = row.remaining <= 0;
  const broke = !wasBroken && row.broken;
  if (broke) state.totalBreaks = (state.totalBreaks || 0) + 1;
  return {
    ok: true,
    classTsid,
    wear: check.wear,
    remaining: row.remaining,
    capacity: check.condition.capacity,
    broke,
    msg: broke
      ? TOOL_CONDITION_CATALOG[classTsid]?.fuel
        ? `Your ${check.condition.label} is out of fuel. Refuel it with Fuel Cells.`
        : `Ooops! You done broke your ${check.condition.label}.`
      : '',
  };
}

export function highestTinkeringRank(learned = []) {
  const set = new Set(Array.isArray(learned) ? learned : []);
  return Object.entries(TINKERING_RANKS)
    .filter(([classTsid]) => set.has(classTsid))
    .map(([, def]) => def)
    .sort((a, b) => b.rank - a.rank)[0] || null;
}

/** Official repair rate/energy math, with the visible wait demo-scaled for this single-player spike. */
export function quoteToolRepair(state, classTsid, learned = []) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  const condition = getToolCondition(state, classTsid);
  if (!def || !condition.tracked) return { ok: false, reason: 'not_repairable', condition };
  if (def.repairable === false) return { ok: false, reason: 'not_repairable', condition };
  if (!condition.needsRepair) return { ok: false, reason: 'full', condition };
  const tinkering = highestTinkeringRank(learned);
  if (!tinkering) return { ok: false, reason: 'skill', condition };
  if (classTsid === 'tinkertool' && tinkering.rank < 3) {
    return { ok: false, reason: 'self_skill', condition, tinkering };
  }
  const missing = condition.capacity - condition.remaining;
  const rawSeconds = Math.ceil(missing / tinkering.repairPerSecond);
  const durationSeconds = Math.max(2, rawSeconds);
  const evenSeconds = durationSeconds % 2 ? durationSeconds + 1 : durationSeconds;
  const energyPerTwoTicks = Math.round(
    (tinkering.energyPercent / 100) * (def.baseCost / def.capacity) * tinkering.repairPerSecond
  );
  const energy = Math.max(1, Math.ceil(evenSeconds * (energyPerTwoTicks / 2)));
  return {
    ok: true,
    classTsid,
    condition,
    tinkering,
    missing,
    durationSeconds,
    durationMs: Math.max(900, Math.min(8000, durationSeconds * 180)),
    energy,
    tinkertoolWear: rawSeconds,
  };
}

/** Commit a quoted full repair atomically. Inventory presence is supplied by the caller. */
export function repairToolCondition(state, classTsid, pc, opts = {}) {
  const quote = quoteToolRepair(state, classTsid, opts.learned || []);
  if (!quote.ok) return quote;
  if (opts.hasTinkertool !== true && classTsid !== 'tinkertool') {
    return { ok: false, reason: 'tinkertool', quote, msg: 'You need a working Tinkertool to repair this.' };
  }
  if (classTsid === 'tinkertool' && opts.hasSpareTinkertool !== true) {
    return { ok: false, reason: 'spare_tinkertool', quote, msg: 'A Tinkertool needs another working Tinkertool for this repair.' };
  }
  const tinkerCheck = canUseTool(state, 'tinkertool', quote.tinkertoolWear);
  if (!tinkerCheck.ok) {
    return { ok: false, reason: 'tinkertool_broken', quote, msg: tinkerCheck.msg };
  }
  if ((pc?.energy || 0) < quote.energy) {
    return {
      ok: false,
      reason: 'energy',
      quote,
      msg: `You need ${quote.energy} energy to finish this repair.`,
    };
  }
  const target = ensureToolCondition(state, classTsid);
  pc.energy = Math.max(0, (pc.energy || 0) - quote.energy);
  target.remaining = quote.condition.capacity;
  target.broken = false;
  target.repairs = (target.repairs || 0) + 1;
  state.totalRepairs = (state.totalRepairs || 0) + 1;
  const tinkertoolUse = useToolCondition(state, 'tinkertool', quote.tinkertoolWear);
  // Tink Happy Thoughts (tinkertool.js:419): each repair tick adds mood equal
  // to that tick's Tinkertool wear, so the whole repair adds the full wear.
  let moodGained = 0;
  if (repairGivesMood(opts.upgrades || pc?.imaginationUpgrades) && pc) {
    const before = Number(pc.mood) || 0;
    pc.mood = Math.min(moodMax(pc), before + quote.tinkertoolWear);
    moodGained = pc.mood - before;
  }
  return {
    ok: true,
    quote,
    tinkertoolUse,
    moodGained,
    msg: `You fixed the ${quote.condition.label} up just perfect. You spent ${quote.energy} energy.`,
  };
}

/** QA helper: clamp one tool to an exact remaining-point value. */
export function setToolRemaining(state, classTsid, remaining) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  if (!def) return null;
  const row = ensureToolCondition(state, classTsid);
  row.remaining = Math.max(0, Math.min(def.capacity, finiteInt(remaining, def.capacity)));
  row.broken = row.remaining <= 0;
  return getToolCondition(state, classTsid);
}
