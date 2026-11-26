/**
 * Player-dropped street item stacks.
 *
 * Tiny Speck's takeable.js moves a stack from the pack to the player's street
 * position, merges compatible nearby stacks, and exposes Pick up in-world.
 * This module keeps that loop deterministic and persistence-friendly without
 * coupling it to Pixi or DOM state.
 */
import { addItem, ITEM_CATALOG, removeItem } from './inventory.js?v=3be7988a';
import { canRenameBag, cleanBagName } from './bag-names.js?v=bba085e1';
import { bagKeep, stackMaxOf } from './pack-slots.js?v=38e4aea5';
import { ITEM_PLURALS } from './item-plurals-data.js?v=62e96051';
import { TOOL_CONDITION_CATALOG, copyTagKind, keepsOwnStack } from './tools.js?v=4156bba8';

export const WORLD_ITEM_STATE_VERSION = 1;
export const DEFAULT_MERGE_RADIUS = 56;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanCount(value) {
  return Math.max(0, Math.floor(finite(value, 0)));
}

function cleanClassTsid(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_:-]/g, '');
}

function cleanStreetTsid(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_:-]/g, '');
}

/**
 * A dropped tool's own wear, one value per tool in the stack (js/tools.js
 * copies; tool_base points_remaining is the stack's own instance prop, so a
 * tool put down and picked up again is the same worn tool). Null when none.
 */
function cleanPoints(value, count) {
  if (!Array.isArray(value)) return null;
  // null: a tool that went down new (full).
  const out = value.slice(0, count).map((r) => (r == null || !Number.isFinite(Number(r)) ? null : Math.max(0, Math.floor(Number(r)))));
  return out.some((r) => r != null) ? out : null;
}

/**
 * A stack's copies' own words (js/tools.js row.tags: a Cubimal's name, a pumpkin's phrases, a
 * Still's contents), lined up with its first units like `points`; null when none has any.
 */
function cleanTags(value, count) {
  if (!Array.isArray(value)) return null;
  const out = value.slice(0, count).map((t) => {
    if (t == null) return null;
    try {
      const text = JSON.stringify(t);
      return text && text.length <= 600 ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  });
  return out.some((t) => t != null) ? out : null;
}

/** `points` padded to `count` tools (null for a full one), for stacking one stack's tools on another's. */
function pointsFor(points, count) {
  const out = (points || []).slice(0, count);
  while (out.length < count) out.push(null);
  return out;
}

/**
 * The most one pile holds in a house or on a Tower floor, a shelf or a table: the count a stack may
 * hold anywhere (MakingSlot.as:25 MAX_COUNT; the realtime server's tradeSlotMax and the site's ledger
 * take no more in one drop or one take).
 */
export const FLOOR_PILE_MAX = 9999;

/**
 * How many of a class one pile holds when it is set down at home (in a house or on a Tower floor: on
 * the floor, a shelf or a table): FLOOR_PILE_MAX for every class, except one whose copies keep their
 * own identity, which never joins (1): a tool (its wear), a class whose copies carry words (js/tools.js
 * copyTagKind), one that keeps its own stack (keepsOwnStack: a Still, a Teleportation Script). A bag
 * with contents or a name never joins either (joinable). What would pass it lies beside the pile.
 * ours: Austin 2026-11-24, "Let's remove the pile limits": piles at home have no limit for any class;
 * Glitch's stackmax capped every pile (Eleven Location.addItem 475-503: emblems 1, moonstones 3). The
 * pack keeps Glitch's stackmax (js/pack-slots.js). The realtime server (drops.go pileMax) and the site
 * (LedgerDrop::pileCap) read the same rule from the trade table's pts and tag.
 */
export function pileMaxOf(classTsid) {
  return TOOL_CONDITION_CATALOG[classTsid] || copyTagKind(classTsid) || keepsOwnStack(classTsid) ? 1 : FLOOR_PILE_MAX;
}

/** The most stacks a bag holds (js/pack-slots.js BAG_DEFS: 16). */
export const BAG_CONTENTS_MAX = 16;

/**
 * What a dropped bag holds ([{ classTsid, count, points?, tags? }]), or null: in the
 * source a bag goes down with its contents inside it (items/include/takeable.js
 * takeable_drop 157-213 moves the bag itemstack and all it holds).
 */
export function cleanContents(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const row of value.slice(0, BAG_CONTENTS_MAX)) {
    const classTsid = cleanClassTsid(row?.classTsid ?? row?.cls);
    const count = cleanCount(row?.count);
    if (!classTsid || count < 1) continue;
    const points = cleanPoints(row?.points, count);
    const tags = cleanTags(row?.tags, count);
    out.push({ classTsid, count, ...(points ? { points } : {}), ...(tags ? { tags } : {}) });
  }
  return out.length ? out : null;
}

function cleanRecord(row, streetTsid, fallbackId) {
  const classTsid = cleanClassTsid(row?.classTsid);
  const count = cleanCount(row?.count);
  if (!classTsid || count < 1) return null;
  const id = String(row?.id || fallbackId).trim() || fallbackId;
  const points = cleanPoints(row?.points, count);
  const tags = cleanTags(row?.tags, count);
  // A bag with things in it is one bag (bags never stack, stackmax 1).
  const contents = count === 1 ? cleanContents(row?.contents) : null;
  // A named bag is one bag too, and keeps its name (items/bag_bigger.js getLabel 592-598; js/bag-names.js).
  const name = count === 1 && canRenameBag(classTsid) ? cleanBagName(row?.name) : '';
  // Its specialization too (pack-slots.js bagKeep): the source's bag carried it.
  const keep = count === 1 ? bagKeep(classTsid, row) : {};
  return {
    id,
    streetTsid,
    classTsid,
    count,
    x: finite(row?.x, 0),
    y: finite(row?.y, 0),
    droppedAt: Math.max(0, Math.floor(finite(row?.droppedAt, 0))),
    ...(points ? { points } : {}),
    ...(tags ? { tags } : {}),
    ...(contents ? { contents } : {}),
    ...(name ? { name } : {}),
    ...keep,
    // In a house: the placed piece (its id in that room's decor) the stack rests on (js/home-decor.js settleStacks).
    ...(Number.isInteger(row?.on) && row.on > 0 ? { on: row.on } : {}),
    // G1224: set down in Decoration Mode (the owner's decor), not dropped: the site's move of old floor
    // drops to the shared floor (HouseFloors) leaves it in the save.
    ...(row?.decor === true ? { decor: true } : {}),
  };
}

/** Normalize untrusted localStorage data without throwing. */
export function normalizeDroppedItemState(seed = {}) {
  const state = {
    version: WORLD_ITEM_STATE_VERSION,
    nextId: Math.max(1, cleanCount(seed?.nextId) || 1),
    streets: {},
  };
  let observedId = 0;
  const sourceStreets = seed?.streets && typeof seed.streets === 'object'
    ? seed.streets
    : {};
  for (const [rawStreet, rows] of Object.entries(sourceStreets)) {
    const streetTsid = cleanStreetTsid(rawStreet);
    if (!streetTsid || !Array.isArray(rows)) continue;
    const cleaned = [];
    for (let index = 0; index < rows.length; index += 1) {
      const record = cleanRecord(rows[index], streetTsid, `world-item-${state.nextId + index}`);
      if (!record) continue;
      cleaned.push(record);
      const match = record.id.match(/(\d+)$/);
      if (match) observedId = Math.max(observedId, Number(match[1]) || 0);
    }
    if (cleaned.length) state.streets[streetTsid] = cleaned;
  }
  state.nextId = Math.max(state.nextId, observedId + 1);
  return state;
}

export function createDroppedItemState(seed = {}) {
  return normalizeDroppedItemState(seed);
}

export function parseDroppedItemState(raw) {
  if (!raw) return createDroppedItemState();
  try {
    return normalizeDroppedItemState(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    return createDroppedItemState();
  }
}

export function serializeDroppedItemState(state) {
  return JSON.stringify(normalizeDroppedItemState(state));
}

/** Return defensive copies for rendering. */
export function listDroppedStacks(state, streetTsid) {
  const key = cleanStreetTsid(streetTsid);
  const rows = state?.streets?.[key];
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && cleanCount(row.count) > 0)
    .map((row) => ({ ...row, streetTsid: key }));
}

export function normalizeStackQuantity(requested, available) {
  const have = cleanCount(available);
  if (have < 1) return 0;
  return Math.max(1, Math.min(have, cleanCount(requested) || 1));
}

/**
 * Move a quantity from the pack into the current street. Nearby matching
 * stacks merge, matching the original server's default merge behavior.
 */
export function dropInventoryStack(state, inv, streetTsid, classTsid, requested, position = {}, opts = {}) {
  const street = cleanStreetTsid(streetTsid);
  const item = cleanClassTsid(classTsid);
  if (!street || !item) return { ok: false, reason: 'invalid_target' };
  const have = cleanCount(inv?.[item]);
  if (have < 1) return { ok: false, reason: 'missing' };
  const count = normalizeStackQuantity(requested, have);
  if (count < 1) return { ok: false, reason: 'quantity' };

  const x = finite(position?.x, 0);
  const y = finite(position?.y, 0);
  const rows = state.streets[street] || (state.streets[street] = []);
  const mergeRadius = Math.max(0, finite(opts.mergeRadius, DEFAULT_MERGE_RADIUS));
  // A like stack takes no more than its class's stackmax (Eleven's Location.addItem 475-503, it.count < it.stackmax):
  // a full one takes none, and what does not fit lies as its own stack. `pile`: at home (a house or a Tower
  // floor), where a pile has no stack limit (pileMaxOf).
  const max = opts.pile === true ? pileMaxOf(item) : stackMaxOf(item);
  const merge = opts.merge !== false
    ? rows
      .filter((row) => row.classTsid === item && !row.contents && !row.name && !row.sort && cleanCount(row.count) < max)
      .map((row) => ({ row, distance: Math.hypot(row.x - x, row.y - y) }))
      .filter((candidate) => candidate.distance <= mergeRadius)
      .sort((a, b) => a.distance - b.distance)[0]?.row
    : null;

  const points = cleanPoints(opts.points, count);
  const tags = cleanTags(opts.tags, count);
  if (!removeItem(inv, item, count)) return { ok: false, reason: 'missing' };
  const joins = merge ? Math.min(count, max - cleanCount(merge.count)) : 0;
  if (merge && joins === count) {
    // Tools keep their own wear: a stack's points line up with its first tools, any without one are full.
    if (points || merge.points) merge.points = [...pointsFor(merge.points, merge.count), ...pointsFor(points, count)];
    if (tags || merge.tags) merge.tags = [...pointsFor(merge.tags, merge.count), ...pointsFor(tags, count)];
    merge.count += count;
    merge.droppedAt = Math.max(0, Math.floor(finite(opts.now, Date.now())));
    if (opts.decor === true) merge.decor = true;
    return { ok: true, count, stack: { ...merge }, merged: true, remaining: inv[item] || 0 };
  }
  if (merge && joins > 0) {
    // Part fills the like stack to its limit (`max`); the rest lies beside it as its own stack.
    if (points || merge.points) merge.points = [...pointsFor(merge.points, merge.count), ...pointsFor(points, count).slice(0, joins)];
    if (tags || merge.tags) merge.tags = [...pointsFor(merge.tags, merge.count), ...pointsFor(tags, count).slice(0, joins)];
    merge.count += joins;
    merge.droppedAt = Math.max(0, Math.floor(finite(opts.now, Date.now())));
    if (opts.decor === true) merge.decor = true;
  }
  const rest = count - joins;
  const restPoints = joins && points ? points.slice(joins) : points;
  const restTags = joins && tags ? tags.slice(joins) : tags;

  const stack = {
    id: `world-item-${state.nextId++}`,
    streetTsid: street,
    classTsid: item,
    count: rest,
    x,
    y,
    droppedAt: Math.max(0, Math.floor(finite(opts.now, Date.now()))),
    ...(restPoints?.some((r) => r != null) ? { points: restPoints } : {}),
    ...(restTags?.some((t) => t != null) ? { tags: restTags } : {}),
    ...(opts.decor === true ? { decor: true } : {}),
  };
  rows.push(stack);
  return { ok: true, count, stack: { ...stack }, merged: joins > 0, remaining: inv[item] || 0, ...(joins ? { joined: joins, into: merge.id } : {}) };
}

/**
 * How near a stack set down in a house must land to a like one to join it: the original's Decoration
 * Mode merged only "dropping directly on stack", 10 px along the same plat line (HandOfDecorator.as
 * shouldMerge 1656-1670, tolerance 10, on the drop and on a move's itemstack_modify alike; main.js
 * doModifyItem and takeable_drop merge unless no_merge). The game uses the pack drop's 12 px (game.js dropPackStackAt).
 */
export const PLACED_MERGE_RADIUS = 12;

/** A stack that can take another of its class into it (or go into one): no bag, name, sort or street share. */
function joinable(row) {
  return Boolean(row) && !row.contents && !row.name && !row.sort && !row.shared && cleanCount(row.count) > 0;
}

/**
 * The like stack a stack laid at room-world `x` on surface `on` (a piece id, or null for the floor)
 * joins: the nearest of its class on the same surface within `radius`, or null. `stack` itself, and
 * anything not joinable, never counts.
 */
export function likeStackAt(rows, stack, x, on, radius = PLACED_MERGE_RADIUS) {
  if (!Array.isArray(rows) || !joinable(stack)) return null;
  const surface = on ?? null;
  const px = finite(x, NaN);
  if (!Number.isFinite(px)) return null;
  let best = null;
  for (const row of rows) {
    if (row === stack || row.id === stack.id || row.classTsid !== stack.classTsid || !joinable(row)) continue;
    // A full pile takes no more (pileMaxOf: at home no stack limit, only the most a stack holds).
    if (cleanCount(row.count) >= pileMaxOf(row.classTsid)) continue;
    if ((row.on ?? null) !== surface) continue;
    const d = Math.abs(finite(row.x, Infinity) - px);
    if (d <= radius && (!best || d < best.d)) best = { row, d };
  }
  return best?.row || null;
}

/**
 * One set-down stack laid onto another of its class (a Decoration Mode move onto a like stack): it
 * joins it, its copies' wear and words after the stack's own (as dropInventoryStack's merge), and its
 * record goes. Nothing is made or lost. Returns { ok, count, stack } or { ok: false, reason }.
 */
export function mergeDroppedStacks(state, streetTsid, fromId, intoId, opts = {}) {
  const rows = state?.streets?.[cleanStreetTsid(streetTsid)];
  if (!Array.isArray(rows) || fromId === intoId) return { ok: false, reason: 'missing' };
  const index = rows.findIndex((row) => row.id === fromId);
  const into = rows.find((row) => row.id === intoId);
  const from = rows[index];
  if (!from || !into) return { ok: false, reason: 'missing' };
  if (from.classTsid !== into.classTsid || !joinable(from) || !joinable(into)) return { ok: false, reason: 'unlike' };
  const had = cleanCount(into.count);
  // No more than its pile (pileMaxOf: at home no stack limit, only the most a stack holds): a full pile
  // takes none, and what does not fit stays in the stack moved (`left`).
  const room = pileMaxOf(into.classTsid) - had;
  if (room < 1) return { ok: false, reason: 'full' };
  const all = cleanCount(from.count);
  const count = Math.min(all, room);
  if (from.points || into.points) into.points = [...pointsFor(into.points, had), ...pointsFor(from.points, all).slice(0, count)];
  if (from.tags || into.tags) into.tags = [...pointsFor(into.tags, had), ...pointsFor(from.tags, all).slice(0, count)];
  into.count = had + count;
  into.droppedAt = Math.max(0, Math.floor(finite(opts.now, Date.now())));
  if (from.decor || opts.decor === true) into.decor = true;
  if (count < all) {
    from.count = all - count;
    if (Array.isArray(from.points)) {
      from.points = from.points.slice(count);
      if (!from.points.some((r) => r != null)) delete from.points;
    }
    if (Array.isArray(from.tags)) {
      from.tags = from.tags.slice(count);
      if (!from.tags.some((t) => t != null)) delete from.tags;
    }
    return { ok: true, count, stack: { ...into }, left: from.count };
  }
  rows.splice(index, 1);
  return { ok: true, count, stack: { ...into } };
}

/**
 * R50 (G1224, #655): a stack that comes from no pack set down at a place, as dropInventoryStack lays
 * one (its copies' wear in `points`, words in `tags`): on surface `on` (a piece id, Decoration Mode)
 * at (x, y), or into the like stack `into` there when it can still take it (#593). The owner's claim
 * of a stack dropped in their house for everyone (features/drops-mp-feature.js claimShared): the
 * site already moved it out of the shared floor, so this only records it. Returns
 * { ok, id, count, merged } or { ok: false, reason }.
 */
export function setDownStack(state, streetTsid, classTsid, requested, position = {}, opts = {}) {
  const n = cleanCount(requested);
  const placed = dropInventoryStack(state, { [cleanClassTsid(classTsid)]: n }, streetTsid, classTsid, n, position, { now: opts.now, merge: false, points: opts.points, tags: opts.tags, decor: true });
  if (!placed.ok) return placed;
  const street = cleanStreetTsid(streetTsid);
  const row = state.streets[street].find((r) => r.id === placed.stack.id);
  if (opts.on != null && opts.on !== '') row.on = opts.on;
  if (opts.into) {
    const joined = mergeDroppedStacks(state, street, row.id, String(opts.into), { now: opts.now });
    if (joined.ok) return { ok: true, id: joined.stack.id, count: placed.count, merged: true };
  }
  return { ok: true, id: row.id, count: placed.count, merged: false };
}

/** Move all or part of a street stack back into the pack. */
export function pickupDroppedStack(state, inv, streetTsid, stackId, requested = Infinity) {
  const street = cleanStreetTsid(streetTsid);
  const rows = state?.streets?.[street];
  if (!Array.isArray(rows)) return { ok: false, reason: 'missing' };
  const index = rows.findIndex((row) => row.id === stackId);
  if (index < 0) return { ok: false, reason: 'missing' };
  const stack = rows[index];
  const count = requested === Infinity
    ? cleanCount(stack.count)
    : normalizeStackQuantity(requested, stack.count);
  if (count < 1) return { ok: false, reason: 'quantity' };
  addItem(inv, stack.classTsid, count);
  const points = Array.isArray(stack.points) ? stack.points.splice(0, count) : [];
  if (Array.isArray(stack.points) && !stack.points.length) delete stack.points;
  const tags = Array.isArray(stack.tags) ? stack.tags.splice(0, count) : [];
  if (Array.isArray(stack.tags) && !stack.tags.length) delete stack.tags;
  stack.count -= count;
  const removed = stack.count <= 0;
  if (removed) rows.splice(index, 1);
  if (!rows.length) delete state.streets[street];
  return {
    ok: true,
    count,
    classTsid: stack.classTsid,
    removed,
    remaining: Math.max(0, stack.count),
    ...(points.some((r) => r != null) ? { points } : {}),
    ...(tags.some((t) => t != null) ? { tags } : {}),
  };
}

/**
 * The count a stack's Pick up asks about, or 0 when it is one press. InteractionMenuController.as
 * 976-985: a verb on more than one, with neither is_single nor is_all, asks; items/*.js verbs.pickup
 * (defined by takeable) sets neither, so any stack on the ground asks, up to the whole stack (905-910).
 * Ours: a bag with contents or a name comes back whole (pickupDroppedBag). A stack shared with the
 * street asks too (G560): drops.go ground_pickup takes the count and the rest stays for everyone.
 */
export function pickupCountToAsk(stack) {
  const count = cleanCount(stack?.count);
  if (count < 2 || stack.contents?.length || stack.name) return 0;
  return count;
}

/** InteractionMenuController.as 988: the verb's label, each word capitalized, "how many", the item's plural. */
export function pickupCountTitle(classTsid) {
  const meta = ITEM_CATALOG[classTsid];
  return `Pick Up how many ${meta?.namePlural || ITEM_PLURALS[classTsid] || meta?.label || classTsid}?`;
}

/**
 * Put a bag down with what it held (the pack already gave them up: bags-feature
 * packTakeBag). It never merges: each bag is its own thing on the ground.
 * opts.name: the bag's own name, which it keeps on the ground (an empty named bag goes down this way too);
 * opts.sort and opts.sortNamed: its specialization, which it keeps too.
 */
export function placeDroppedBag(state, streetTsid, classTsid, contents, position = {}, opts = {}) {
  const street = cleanStreetTsid(streetTsid);
  const item = cleanClassTsid(classTsid);
  if (!street || !item) return { ok: false, reason: 'invalid_target' };
  const held = cleanContents((contents || []).map((c) => ({ classTsid: c.classTsid ?? c.cls, count: c.count, points: c.points, tags: c.tags })));
  const rows = state.streets[street] || (state.streets[street] = []);
  const stack = {
    id: `world-item-${state.nextId++}`,
    streetTsid: street,
    classTsid: item,
    count: 1,
    x: finite(position?.x, 0),
    y: finite(position?.y, 0),
    droppedAt: Math.max(0, Math.floor(finite(opts.now, Date.now()))),
    ...(held ? { contents: held } : {}),
  };
  const name = canRenameBag(item) ? cleanBagName(opts.name) : '';
  if (name) stack.name = name;
  Object.assign(stack, bagKeep(item, { name, sort: opts.sort, sortNamed: opts.sortNamed }));
  rows.push(stack);
  return { ok: true, count: 1, stack: { ...stack }, merged: false };
}

/** Take a whole record off the ground (a bag with its contents going back into the pack). */
export function takeDroppedRecord(state, streetTsid, stackId) {
  const street = cleanStreetTsid(streetTsid);
  const rows = state?.streets?.[street];
  if (!Array.isArray(rows)) return null;
  const index = rows.findIndex((row) => row.id === stackId);
  if (index < 0) return null;
  const [row] = rows.splice(index, 1);
  if (!rows.length) delete state.streets[street];
  return row;
}
