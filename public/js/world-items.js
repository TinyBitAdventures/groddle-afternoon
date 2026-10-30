/**
 * Player-dropped street item stacks.
 *
 * Tiny Speck's takeable.js moves a stack from the pack to the player's street
 * position, merges compatible nearby stacks, and exposes Pick up in-world.
 * This module keeps that loop deterministic and persistence-friendly without
 * coupling it to Pixi or DOM state.
 */
import { addItem, removeItem } from './inventory.js?v=85d4faba';

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

function cleanRecord(row, streetTsid, fallbackId) {
  const classTsid = cleanClassTsid(row?.classTsid);
  const count = cleanCount(row?.count);
  if (!classTsid || count < 1) return null;
  const id = String(row?.id || fallbackId).trim() || fallbackId;
  return {
    id,
    streetTsid,
    classTsid,
    count,
    x: finite(row?.x, 0),
    y: finite(row?.y, 0),
    droppedAt: Math.max(0, Math.floor(finite(row?.droppedAt, 0))),
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
      .filter((row) => row.classTsid === item)
      .map((row) => ({ row, distance: Math.hypot(row.x - x, row.y - y) }))
      .filter((candidate) => candidate.distance <= mergeRadius)
      .sort((a, b) => a.distance - b.distance)[0]?.row
    : null;

  if (!removeItem(inv, item, count)) return { ok: false, reason: 'missing' };
  if (merge) {
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
  };
}
