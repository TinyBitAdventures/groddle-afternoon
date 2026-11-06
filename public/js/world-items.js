/**
 * Player-dropped street item stacks.
 *
 * Tiny Speck's takeable.js moves a stack from the pack to the player's street
 * position, merges compatible nearby stacks, and exposes Pick up in-world.
 * This module keeps that loop deterministic and persistence-friendly without
 * coupling it to Pixi or DOM state.
 */
import { addItem, removeItem } from './inventory.js?v=d82f3b00';
import { canRenameBag, cleanBagName } from './bag-names.js?v=22391c55';

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
    // In a house: the placed piece (its id in that room's decor) the stack rests on (js/home-decor.js settleStacks).
    ...(Number.isInteger(row?.on) && row.on > 0 ? { on: row.on } : {}),
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
  const merge = opts.merge !== false
    ? rows
      .filter((row) => row.classTsid === item && !row.contents && !row.name)
      .map((row) => ({ row, distance: Math.hypot(row.x - x, row.y - y) }))
      .filter((candidate) => candidate.distance <= mergeRadius)
      .sort((a, b) => a.distance - b.distance)[0]?.row
    : null;

  const points = cleanPoints(opts.points, count);
  const tags = cleanTags(opts.tags, count);
  if (!removeItem(inv, item, count)) return { ok: false, reason: 'missing' };
  if (merge) {
    // Tools keep their own wear: a stack's points line up with its first tools, any without one are full.
    if (points || merge.points) merge.points = [...pointsFor(merge.points, merge.count), ...pointsFor(points, count)];
    if (tags || merge.tags) merge.tags = [...pointsFor(merge.tags, merge.count), ...pointsFor(tags, count)];
    merge.count += count;
    merge.droppedAt = Math.max(0, Math.floor(finite(opts.now, Date.now())));
    return { ok: true, count, stack: { ...merge }, merged: true, remaining: inv[item] || 0 };
  }

  const stack = {
    id: `world-item-${state.nextId++}`,
    streetTsid: street,
    classTsid: item,
    count,
    x,
    y,
    droppedAt: Math.max(0, Math.floor(finite(opts.now, Date.now()))),
    ...(points ? { points } : {}),
    ...(tags ? { tags } : {}),
  };
  rows.push(stack);
  return { ok: true, count, stack: { ...stack }, merged: false, remaining: inv[item] || 0 };
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
 * Put a bag down with what it held (the pack already gave them up: bags-feature
 * packTakeBag). It never merges: each bag is its own thing on the ground.
 * opts.name: the bag's own name, which it keeps on the ground (an empty named bag goes down this way too).
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
