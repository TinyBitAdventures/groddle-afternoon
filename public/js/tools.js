/**
 * Persistent Glitch-style tool condition and Tinkertool repairs.
 *
 * Capacities and base costs come from the generated Tiny Speck item classes.
 * Tools whose GSJS points_capacity is 0 remain intentionally wear-free.
 */

import { repairGivesMood } from './imagination-effects.js?v=70169933';
import { loseEnergy, metabolicGain, moodMax } from './metabolics.js?v=8504134e';

export const TOOL_CONDITION_CATALOG = Object.freeze({
  butterfly_lotion: {
    label: 'Butterfly Lotion',
    capacity: 5,
    baseCost: 10,
    repairable: false,
    source: 'butterfly_lotion.js',
  },
  watering_can: { label: 'Watering Can', capacity: 100, baseCost: 75, source: 'watering_can.js' },
  // irrigator_9000.js:16,18,25: parent watering_can, points_capacity 500, base_cost 750.
  irrigator_9000: { label: 'Irrigator 9000', capacity: 500, baseCost: 750, source: 'irrigator_9000.js' },
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
  // Not wear: what one jar holds. firefly_jar.js 25-27 initInstanceProps num_flies "0" (a new
  // jar is empty), 239-262 addFirefly and 444-451 removeFirefly change only that jar, max 7
  // (469 max_consumable), stackmax 1 (15). Held here so each jar keeps its own Fireflies and they
  // go with it wherever a tool's wear goes (bags, drops, gifts, trades, auctions, storage, the
  // site's ledger `r`). `contents`: a new copy starts at `empty`, never breaks, never wears.
  firefly_jar: { label: 'Firefly Jar', capacity: 7, baseCost: 100, repairable: false, contents: true, empty: 0, source: 'firefly_jar.js num_flies' },
});

/** Whether a class's copies hold contents (a Firefly Jar's Fireflies), not wear. */
export function isContentsClass(classTsid) {
  return TOOL_CONDITION_CATALOG[classTsid]?.contents === true;
}

/** What a new copy of a class holds: a full meter for a tool, `empty` for contents. */
function newPoints(def) {
  return def.contents ? Math.max(0, Math.min(def.capacity, finiteInt(def.empty, 0))) : def.capacity;
}

/**
 * Tools that stand in for one another, in the order the source looks for a
 * working one.
 * - Hoes: include/garden.js:233-238 and patch.js:393-402 take a working
 *   High-Class Hoe first, then a plain Hoe (patch.js:342-347 accepts either).
 * - Watering cans: include/garden.js:125-130 and include/trants.js:117-121
 *   water with a working Irrigator 9000 first, then a Watering Can.
 * - Grinders: dullite.js:108,126 and barnacle.js:108,119 crush with either
 *   (findFirst in pack order; the remake tries the plain Grinder first, the
 *   order the source's own conditions name them).
 */
export const HOE_TOOLS = Object.freeze(['high_class_hoe', 'hoe']);

/**
 * Ticket 63: the tools whose pack icon turns broken (assets/sprites/icons/<class>_broken.png):
 * every tool_base item's SWF has a broken_iconic state, which the client drew for a broken
 * tool in the pack (ItemstackAnimation.as 178-186: tool_state.is_broken -> 'broken_iconic').
 * Butterfly Lotion, the Quill, the Fox Brush's own frames and the four machines have none.
 */
export const BROKEN_TOOL_ICONS = Object.freeze(new Set([
  'ace_of_spades', 'alchemical_tongs', 'awesome_pot', 'blender', 'cauldron', 'class_axe', 'cocktail_shaker',
  'construction_tool', 'crystallizer', 'fancy_pick', 'fox_brush', 'frying_pan', 'grand_ol_grinder', 'hatchet',
  'high_class_hoe', 'hoe', 'irrigator_9000', 'knife_and_board', 'loomer', 'mike_tyson_grill', 'ore_grinder',
  'pick', 'saucepan', 'scraper', 'shovel', 'smelter', 'spindle', 'splendid_spindle', 'super_scraper',
  'tincturing_kit', 'tinkertool', 'watering_can',
]));

/** The broken pack icon of a tool class, or null when it has none. */
export function brokenToolIcon(classTsid) {
  return BROKEN_TOOL_ICONS.has(classTsid) ? `assets/sprites/icons/${classTsid}_broken.png` : null;
}
export const GRINDER_TOOLS = Object.freeze(['ore_grinder', 'grand_ol_grinder']);
export const WATERING_CAN_TOOLS = Object.freeze(['irrigator_9000', 'watering_can']);

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

/*
 * Each tool you hold wears on its own (ticket 12). In the source wear is an
 * instance prop of each tool stack: tool_base points_remaining (pick.js 32,
 * initInstanceProps; isWorking 405-430), use() lowers only the stack in use,
 * a stack made or bought is new at its class's points_capacity, and a repair
 * is a verb on one stack (pick.js repair 120-240, tinkertool.js startRepair).
 * Which one a verb uses: the first working one in pack order
 * (players/inc_items.js items_find_working_tool 729-732 and
 * items/include/mining.js 203-204: pc.findFirst(is_tool && isWorking), and
 * bag.js findFirst 672-694 walks the pack's slots in order, a bag's contents
 * where the bag sits).
 *
 * The remake's pack is one count per class (js/inventory.js), so a class's
 * row keeps one wear value per copy held, `copies`, in pack order (the
 * Nth stack of the class as js/pack-slots.js lays the pack out, findFirst's
 * order: toolCopyPlaces). Bound to the inventory (bindToolInventory), the
 * copies follow its count: a copy that arrives is new and full (a purchase,
 * a craft, a reward), and when one leaves it is the last one, unless the
 * path that moves it says which (takeToolCopy, receiveToolCopy carry a
 * given, dropped or traded tool's own wear). `remaining` and `broken` on
 * the row repeat the copy in use, for readers of older saves.
 *
 * Saves from before (one shared value per class): that value stays with
 * the first copy, the one that was in use, and any other copy held starts
 * full (the shared value was only ever charged once per use, so it is one
 * tool's wear; a pick bought on top of a worn one was charged that wear).
 */

/** The inventory a state's copies follow (not saved: a hidden property). */
export function bindToolInventory(state, inv) {
  if (!state || typeof state !== 'object') return state;
  Object.defineProperty(state, 'inv', { value: inv || null, writable: true, configurable: true, enumerable: false });
  // js/inventory.js addItem asks before more of a class arrive: the copies that left go first.
  if (inv && typeof inv === 'object') {
    Object.defineProperty(inv, ITEM_ARRIVING, { value: (cls) => syncToolCopies(state, cls), writable: true, configurable: true, enumerable: false });
  }
  return state;
}

/** The hook js/inventory.js addItem calls (Symbol.for, so neither module imports the other). */
export const ITEM_ARRIVING = Symbol.for('groddle.itemArriving');

/** A copy's points, clamped to the class's capacity; none given (null: the site's "new") is new (full, or an empty jar). */
function clampPoints(def, value) {
  if (value == null || value === '') return newPoints(def);
  return Math.max(0, Math.min(def.capacity, finiteInt(value, newPoints(def))));
}

function heldCount(state, classTsid) {
  const inv = state?.inv;
  if (!inv) return null;
  const n = Number(inv[classTsid]);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** The copy in use: the first that can take `wear` (findFirst isWorking), else the first. */
function inUseIndex(copies, wear = 1) {
  const cost = points(wear);
  const at = copies.findIndex((r) => r >= cost);
  return at >= 0 ? at : 0;
}

/** Repeat the copy in use on the row (older readers, and break events). */
function settleRow(row, def) {
  const copies = row.copies;
  const r = copies.length ? copies[def.contents ? 0 : inUseIndex(copies)] : newPoints(def);
  row.remaining = r;
  row.broken = !def.contents && r <= 0;
  return row;
}

export function normalizeToolConditionState(seed = {}) {
  const source = seed?.condition && typeof seed.condition === 'object' ? seed.condition : {};
  const condition = {};
  for (const [classTsid, def] of Object.entries(TOOL_CONDITION_CATALOG)) {
    const row = source[classTsid];
    if (!row || typeof row !== 'object') continue;
    // An older save's one value per class becomes the first copy's (see above).
    const copies = Array.isArray(row.copies)
      ? row.copies.map((r) => clampPoints(def, r))
      : [row.broken === true ? 0 : clampPoints(def, row.remaining)];
    condition[classTsid] = settleRow({
      copies,
      remaining: newPoints(def),
      broken: false,
      uses: Math.max(0, finiteInt(row.uses, 0)),
      repairs: Math.max(0, finiteInt(row.repairs, 0)),
    }, def);
  }
  return {
    condition,
    totalUses: Math.max(0, finiteInt(seed?.totalUses, 0)),
    totalBreaks: Math.max(0, finiteInt(seed?.totalBreaks, 0)),
    totalRepairs: Math.max(0, finiteInt(seed?.totalRepairs, 0)),
  };
}

/**
 * Return a class's stable mutable row, its copies in step with the inventory
 * (when bound): new copies full, the last ones gone. Unbound (a machine's own
 * tank, tests), a row always has at least one copy.
 */
export function ensureToolCondition(state, classTsid) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  if (!def || !state) return null;
  if (!state.condition || typeof state.condition !== 'object') state.condition = {};
  let row = state.condition[classTsid];
  if (!row) {
    row = { copies: [], remaining: newPoints(def), broken: false, uses: 0, repairs: 0 };
    state.condition[classTsid] = row;
  }
  if (!Array.isArray(row.copies)) {
    row.copies = [row.broken === true ? 0 : clampPoints(def, row.remaining)];
  }
  const held = heldCount(state, classTsid);
  const want = held == null ? Math.max(1, row.copies.length) : held;
  if (row.copies.length > want) row.copies.length = want;
  while (row.copies.length < want) row.copies.push(newPoints(def));
  return settleRow(row, def);
}

/**
 * Bring every row's copies in step with the pack now (ticket 12 follow-up, 2026-11-04: a Fancy
 * Pick dropped broken and then bought again "came pre-broken"). The copies used to follow the
 * count only when a tool was next looked at, so a tool that left and a new one that arrived
 * before then (a drop and a purchase, or a save in between) were the same copy to them, and the
 * new one took the old one's wear. game.js calls this every frame, before a save and after a
 * load, and addItem calls it for a class just before more of it arrive (ITEM_ARRIVING), so a
 * copy that left is gone before a new one comes. Rows are never created here.
 */
export function syncToolCopies(state, classTsid = null) {
  if (!state?.condition || !state.inv) return state;
  const rows = classTsid ? [classTsid] : Object.keys(state.condition);
  for (const cls of rows) {
    const row = state.condition[cls];
    if (!row || !TOOL_CONDITION_CATALOG[cls]) continue;
    const held = heldCount(state, cls);
    if (!Array.isArray(row.copies) || row.copies.length !== held) ensureToolCondition(state, cls);
  }
  return state;
}

/** Every copy's wear, in pack order (what each tool slot shows). */
export function toolCopies(state, classTsid) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  if (!def) return [];
  const row = ensureToolCondition(state, classTsid);
  return row.copies.map((r) => ({ remaining: r, capacity: def.capacity, percent: def.capacity ? r / def.capacity : 1, broken: !def.contents && r <= 0 }));
}

function copyIndexFor(row, opts, wear = 1) {
  const n = Number(opts?.copy);
  if (Number.isInteger(n) && n >= 0 && n < row.copies.length) return n;
  return inUseIndex(row.copies, wear);
}

/**
 * One tool's condition: the copy `opts.copy` (its place in pack order), else
 * the one a verb would use now (the first that can take `opts.wear`, 1 by default).
 */
export function getToolCondition(state, classTsid, opts = {}) {
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
  const copy = row?.copies.length ? copyIndexFor(row, opts, opts?.wear) : -1;
  const remaining = copy >= 0 ? Math.max(0, Math.min(def.capacity, Number(row.copies[copy]) || 0)) : newPoints(def);
  return {
    classTsid,
    label: def.label,
    tracked: true,
    copy,
    copies: row?.copies.length || 0,
    remaining,
    capacity: def.capacity,
    percent: def.capacity ? remaining / def.capacity : 1,
    broken: !def.contents && remaining <= 0,
    needsRepair: !def.contents && remaining < def.capacity,
    repairable: def.repairable !== false,
    ...(def.contents ? { contents: true } : {}),
    uses: row?.uses || 0,
    repairs: row?.repairs || 0,
  };
}

/** Whether a copy can take `wear`: the first working one (findFirst isWorking), or `opts.copy`. */
export function canUseTool(state, classTsid, wear = 1, opts = {}) {
  const condition = getToolCondition(state, classTsid, { ...opts, wear });
  // Contents (a jar's Fireflies) never wear: a jar is always usable as a jar.
  if (!condition.tracked || condition.contents) return { ok: true, condition, wear: 0 };
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

/**
 * Spend condition only after the associated gameplay mutation is known to succeed.
 * Only the copy in use wears (tool_base use(): its own points_remaining).
 */
export function useToolCondition(state, classTsid, wear = 1, opts = {}) {
  const check = canUseTool(state, classTsid, wear, opts);
  if (!check.ok || !check.condition.tracked || check.condition.contents) return check;
  const row = ensureToolCondition(state, classTsid);
  const def = TOOL_CONDITION_CATALOG[classTsid];
  const at = check.condition.copy;
  const before = row.copies[at];
  const wasBroken = before <= 0;
  row.copies[at] = Math.max(0, before - check.wear);
  row.uses = (row.uses || 0) + check.wear;
  state.totalUses = (state.totalUses || 0) + check.wear;
  const nowBroken = row.copies[at] <= 0;
  settleRow(row, def);
  const broke = !wasBroken && nowBroken;
  if (broke) state.totalBreaks = (state.totalBreaks || 0) + 1;
  return {
    ok: true,
    classTsid,
    copy: at,
    wear: check.wear,
    remaining: row.copies[at],
    capacity: check.condition.capacity,
    broke,
    msg: broke
      ? TOOL_CONDITION_CATALOG[classTsid]?.fuel
        ? `Your ${check.condition.label} is out of fuel. Refuel it with Fuel Cells.`
        : `Ooops! You done broke your ${check.condition.label}.`
      : '',
  };
}

/**
 * The wear a copy leaving the pack takes with it (a gift, a trade, a drop, an
 * auction): the last copy, unless `copy` says which. Call it while the copy is
 * still held; with `take`, that copy is the one that goes when the count drops.
 */
export function takeToolCopy(state, classTsid, { copy, take = true } = {}) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  if (!def) return null;
  const row = ensureToolCondition(state, classTsid);
  if (!row.copies.length) return newPoints(def);
  const n = Number(copy);
  const at = Number.isInteger(n) && n >= 0 && n < row.copies.length ? n : row.copies.length - 1;
  const r = row.copies[at];
  if (take && at !== row.copies.length - 1) {
    // The count drops next: move this copy last so it is the one that goes.
    row.copies.splice(at, 1);
    row.copies.push(r);
    settleRow(row, def);
  }
  return r;
}

/**
 * The wear a hand-over of `n` tools carries (a gift, a trade, an auction: one
 * value per class on the wire): the most worn of the `n` that will leave (the
 * last ones), so a tool passed between characters is never mended by it.
 */
export function leavingToolWear(state, classTsid, n = 1) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  if (!def) return null;
  const row = ensureToolCondition(state, classTsid);
  const k = Math.max(1, Math.floor(Number(n) || 1));
  const leaving = row.copies.slice(Math.max(0, row.copies.length - k));
  if (!leaving.length) return newPoints(def);
  return def.contents ? Math.max(...leaving) : Math.min(...leaving);
}

/**
 * Copies that just arrived with their own wear (a dropped, given, traded or
 * auctioned tool): the newest `n` (the last ones; the count already went up) take it.
 */
export function receiveToolCopy(state, classTsid, remaining, n = 1) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  if (!def) return null;
  const row = ensureToolCondition(state, classTsid);
  if (!row.copies.length) return null;
  const k = Math.min(row.copies.length, Math.max(1, Math.floor(Number(n) || 1)));
  for (let i = row.copies.length - k; i < row.copies.length; i += 1) row.copies[i] = clampPoints(def, remaining);
  settleRow(row, def);
  return getToolCondition(state, classTsid, { copy: row.copies.length - 1 });
}

/**
 * A bag about to leave the pack with tools in it (bags-feature packTakeBag): the
 * copies at `ranks` (their places in pack order, js/pack-slots.js unitPlaces) move
 * last, in order, so the count going down takes exactly those. Returns their points.
 */
export function pickToolCopies(state, classTsid, ranks = []) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  if (!def) return [];
  const row = ensureToolCondition(state, classTsid);
  const set = new Set(ranks.filter((r) => Number.isInteger(r) && r >= 0 && r < row.copies.length));
  const out = row.copies.filter((_, i) => set.has(i));
  row.copies = [...row.copies.filter((_, i) => !set.has(i)), ...out];
  settleRow(row, def);
  return out;
}

/**
 * Tools that came back into the pack inside a bag (bags-feature packGiveBag): the
 * newest copies (the count already went up) take `points` (null: full) and move to
 * `ranks`, their places in pack order, ascending.
 */
export function placeToolCopies(state, classTsid, ranks = [], points = []) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  if (!def) return false;
  const row = ensureToolCondition(state, classTsid);
  const k = Math.min(ranks.length, row.copies.length);
  if (!k) return false;
  const fresh = row.copies.splice(row.copies.length - k, k).map((r, i) => (points[i] === undefined ? r : clampPoints(def, points[i])));
  const order = ranks.slice(0, k).map((r, i) => [r, fresh[i]]).sort((a, b) => a[0] - b[0]);
  for (const [r, v] of order) row.copies.splice(Math.max(0, Math.min(row.copies.length, r)), 0, v);
  settleRow(row, def);
  return true;
}

/** A drag moved a class's copy from one place in pack order to another (bags-feature packMove). */
export function moveToolCopy(state, classTsid, from, to) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  if (!def) return false;
  const row = ensureToolCondition(state, classTsid);
  const n = row.copies.length;
  if (!(from >= 0 && from < n && to >= 0 && to < n) || from === to) return false;
  const [r] = row.copies.splice(from, 1);
  row.copies.splice(to, 0, r);
  settleRow(row, def);
  return true;
}

/** How many copies of a class are broken now (break events, js/quest-offers.js toolBreakEvents). */
export function brokenToolCopies(row, classTsid = null) {
  // A Firefly Jar never breaks; an empty one is just empty.
  if (classTsid && TOOL_CONDITION_CATALOG[classTsid]?.contents) return 0;
  if (Array.isArray(row?.copies)) return row.copies.filter((r) => Number(r) <= 0).length;
  return row?.broken === true || Number(row?.remaining) <= 0 ? 1 : 0;
}

export function highestTinkeringRank(learned = []) {
  const set = new Set(Array.isArray(learned) ? learned : []);
  return Object.entries(TINKERING_RANKS)
    .filter(([classTsid]) => set.has(classTsid))
    .map(([, def]) => def)
    .sort((a, b) => b.rank - a.rank)[0] || null;
}

/** Official repair rate/energy math, with the visible wait demo-scaled for this single-player spike. */
export function quoteToolRepair(state, classTsid, learned = [], opts = {}) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  // A repair is a verb on one tool (pick.js repair 120-240): `opts.copy`, else the first that needs one.
  const condition = getToolCondition(state, classTsid, { copy: repairCopyIndex(state, classTsid, opts) });
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
    durationMs: repairDurationMs(durationSeconds),
    // The full repair's energy (tinkertool.js tooltip: "The full repair takes $total_energy energy").
    energy,
    energyPerTwoTicks: Math.max(1, energyPerTwoTicks),
    tinkertoolWear: rawSeconds,
  };
}

/** How long the remake shows a repair of `seconds` source ticks. */
function repairDurationMs(seconds) {
  return Math.max(900, Math.min(8000, seconds * 180));
}

/**
 * PURE: how far a repair gets on the energy the player has (tinkertool.js onTick 405-445). Each
 * one-second tick repairs the rank's points while energy is above the two-tick cost; every other
 * tick pays that cost; the repair ends when energy is at or under it, keeping what it fixed.
 * The verb needs more than the cost plus one to start (repair conditions, line 83-85).
 * Returns { ok, points, energy (spent), ticks (that repaired: the Tinkertool's wear), full, durationMs }.
 */
export function toolRepairPlan(quote, energy) {
  if (!quote?.ok) return { ok: false, reason: quote?.reason || 'quote', points: 0, energy: 0, ticks: 0, full: false };
  const cost = Math.max(1, Number(quote.energyPerTwoTicks) || 1);
  let e = Math.max(0, Number(energy) || 0);
  if (e <= cost + 1) return { ok: false, reason: 'energy', points: 0, energy: 0, ticks: 0, full: false };
  const perTick = quote.tinkering.repairPerSecond;
  let points = 0;
  let spent = 0;
  let ticks = 0;
  for (let t = 1; t <= 10000; t += 1) {
    if (e > cost) {
      points = Math.min(quote.missing, points + perTick);
      ticks += 1;
    }
    if (t % 2 === 1) {
      if (e <= cost) break;
      e -= cost;
      spent += cost;
    }
    if (points >= quote.missing) break;
    if (e <= cost) break;
  }
  return { ok: true, points, energy: spent, ticks, full: points >= quote.missing, durationMs: repairDurationMs(ticks) };
}

/**
 * PURE: what one copy of a tool is worth to a vendor or a shrine (tool_base.js getBaseCost 360-368):
 * 20% of its base cost plus 80% by the wear it has left. A tool with no wear meter is worth its base
 * cost: null, as for a class this module does not track, so the caller uses its catalog value.
 */
export function toolWornBaseCost(state, classTsid, opts = {}) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  if (!def) return null;
  if (def.contents) return fireflyJarBaseCost(getToolCondition(state, classTsid, opts).remaining);
  // A machine's tank is fuel, not points_capacity: getBaseCost's else branch, the item's full
  // base cost, which the caller's catalog holds (this catalog keeps 0 for machines).
  if (def.fuel || !(def.baseCost > 0)) return null;
  const c = getToolCondition(state, classTsid, opts);
  const left = Math.max(0, Math.min(def.capacity, Number(c.remaining) || 0));
  return def.baseCost * 0.2 + def.baseCost * 0.8 * (left / def.capacity);
}

/** firefly_jar.js getBaseCost 306-335: an empty jar is 100, then 110, 120, 130, 150, 175, 225 and 300 full. */
export function fireflyJarBaseCost(flies) {
  return [100, 110, 120, 130, 150, 175, 225, 300][Math.max(0, Math.min(7, finiteInt(flies, 0)))];
}

/** The copy a sale or a donation takes: the most worn one (its place in pack order). */
export function mostWornToolCopy(state, classTsid) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  if (!def) return null;
  const row = ensureToolCondition(state, classTsid);
  if (!row.copies.length) return null;
  let at = 0;
  for (let i = 1; i < row.copies.length; i += 1) if (row.copies[i] < row.copies[at]) at = i;
  return at;
}

/** Commit a quoted full repair atomically. Inventory presence is supplied by the caller. */
export function repairToolCondition(state, classTsid, pc, opts = {}) {
  const quote = quoteToolRepair(state, classTsid, opts.learned || [], opts);
  if (!quote.ok) return quote;
  if (opts.hasTinkertool !== true && classTsid !== 'tinkertool') {
    return { ok: false, reason: 'tinkertool', quote, msg: 'You need a working Tinkertool to repair this.' };
  }
  if (classTsid === 'tinkertool' && opts.hasSpareTinkertool !== true) {
    return { ok: false, reason: 'spare_tinkertool', quote, msg: 'A Tinkertool needs another working Tinkertool for this repair.' };
  }
  // tinkertool.js onTick: the repair runs while the energy lasts and keeps what it fixed.
  const plan = toolRepairPlan(quote, pc?.energy);
  if (!plan.ok) {
    return { ok: false, reason: 'energy', quote, msg: "You don't have enough energy to repair this." };
  }
  // The Tinkertool doing the repair is another copy when the one repaired is a Tinkertool itself.
  const tinkerOpts = classTsid === 'tinkertool' ? { copy: spareTinkertoolIndex(state, quote.condition.copy, plan.ticks) } : {};
  const tinkerCheck = canUseTool(state, 'tinkertool', plan.ticks, tinkerOpts);
  if (!tinkerCheck.ok) {
    return { ok: false, reason: 'tinkertool_broken', quote, msg: tinkerCheck.msg };
  }
  const target = ensureToolCondition(state, classTsid);
  // tinkertool.js 435: each tick is metabolics_lose_energy; 368 reports what was used.
  const energyUsed = loseEnergy(pc, plan.energy);
  const capacity = quote.condition.capacity;
  const after = Math.min(capacity, quote.condition.remaining + plan.points);
  target.copies[quote.condition.copy] = after;
  const full = after >= capacity;
  // tinkertool.js endRepair 346-364: the badge and quest counters count a finished repair only.
  if (full) {
    target.repairs = (target.repairs || 0) + 1;
    state.totalRepairs = (state.totalRepairs || 0) + 1;
  }
  settleRow(target, TOOL_CONDITION_CATALOG[classTsid]);
  const tinkertoolUse = useToolCondition(state, 'tinkertool', plan.ticks, tinkerOpts);
  // Tink Happy Thoughts (tinkertool.js:419): each repair tick adds mood equal
  // to that tick's Tinkertool wear, so the whole repair adds the full wear.
  let moodGained = 0;
  // metabolics_add_mood: nothing while dead (inc_metabolics.js 79-86).
  if (repairGivesMood(opts.upgrades || pc?.imaginationUpgrades) && pc && plan.ticks > 0 && metabolicGain('mood').ok) {
    const before = Number(pc.mood) || 0;
    pc.mood = Math.min(moodMax(pc), before + plan.ticks);
    moodGained = pc.mood - before;
  }
  // endRepair 337-348: a tool short of full says how far it got.
  const said = full
    ? `You fixed the ${quote.condition.label} up just perfect.`
    : `You repaired the ${quote.condition.label} to ${Math.floor((after / capacity) * 100)} percent.`;
  return {
    ok: true,
    full,
    quote,
    plan,
    remaining: after,
    tinkertoolUse,
    moodGained,
    msg: `${said} You spent ${energyUsed} energy.`,
  };
}

/** The copy a repair works on: `opts.copy`, else the first (pack order) that needs one. */
function repairCopyIndex(state, classTsid, opts = {}) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  const row = ensureToolCondition(state, classTsid);
  if (!def || !row?.copies.length) return undefined;
  const n = Number(opts?.copy);
  if (Number.isInteger(n) && n >= 0 && n < row.copies.length) return n;
  const at = row.copies.findIndex((r) => r < def.capacity);
  return at >= 0 ? at : 0;
}

/** A working Tinkertool other than copy `not` (repairing a Tinkertool takes a spare one). */
function spareTinkertoolIndex(state, not, wear = 1) {
  const row = ensureToolCondition(state, 'tinkertool');
  const cost = points(wear);
  const at = row.copies.findIndex((r, i) => i !== not && r >= cost);
  if (at >= 0) return at;
  const any = row.copies.findIndex((_, i) => i !== not);
  return any >= 0 ? any : not;
}

/**
 * Set one tool to an exact remaining-point value (QA, a machine's fuel): the
 * copy `opts.copy`, else the one in use.
 */
export function setToolRemaining(state, classTsid, remaining, opts = {}) {
  const def = TOOL_CONDITION_CATALOG[classTsid];
  if (!def) return null;
  const row = ensureToolCondition(state, classTsid);
  if (!row.copies.length) return getToolCondition(state, classTsid);
  const at = copyIndexFor(row, opts);
  row.copies[at] = clampPoints(def, remaining);
  settleRow(row, def);
  return getToolCondition(state, classTsid, { copy: at });
}
