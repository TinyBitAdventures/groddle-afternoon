/**
 * The floor at your own home is everyone's (#655 follow-up; G1190 shared house floors; Austin's
 * ruling: "the house floor is shared, as Glitch").
 *
 * In Glitch a stack set down in your house or Tower was locked to you (house_lock) only when the
 * plat line under it belonged to a piece of furniture (items/include/takeable.js takeable_drop
 * 179-198, `plats[i].source`); on the floor it was a plain stack anyone could pick up. Decoration
 * Mode's move did the same: doModifyItem deleted house_lock and set it again only on a furniture
 * plat (main.js 4852-4890), so a locked stack moved to the floor was unlocked.
 *
 * v0.63.0 put every Decoration Mode pack drop and move into the owner's save as locked decor, the
 * floor too. Here, online at your own home (features/drops-mp-feature.js decides where the floor is
 * shared and what it carries):
 *
 * - packToSharedFloor: a pack stack set down on the floor goes through the server as Drop does
 *   (sharedDrop): the pack gives it up when the server says it is down.
 * - ownRowToSharedFloor: one of your own (save) stacks moved onto the floor comes up into the pack and
 *   goes down the same way. A refusal leaves it in the pack, never gone; one the shared floor can't
 *   carry stays in the save (the caller moves it there); a full pack refuses.
 *
 * `into` names the like shared stack it was set on (drops.go "Merging": it joins it up to its pile, no stack limit at home);
 * `merge: false` sets it down on its own (HandOfDecorator.as shouldMerge 1656-1670 sent no_merge off a stack).
 *
 * `features` is the game's feature host (js/feature-host.js query), `engine` what the hooks take.
 */
import { dropInventoryStack, pickupDroppedStack } from './world-items.js?v=93313aad';

/** Whether `count` of a pack class set down at (x, y) went to the shared floor (true: the server weighs it). */
export function packToSharedFloor(features, engine, { classTsid, count, x, y, floor = false, into = null, merge = true } = {}) {
  if (!floor || !features?.query) return false;
  if (features.query('sharedDropFits', classTsid, count, engine) !== true) return false;
  return Boolean(features.query('sharedDrop', { classTsid, count, x, y, copy: null, into, merge }, engine));
}

/**
 * One of the owner's own stacks (`id` among the save's rows at `key` in `state`) sent to the shared
 * floor at (x, y), through the pack `inv`. Returns { ok: true, shared: true, count } or
 * { ok: false, reason: 'own' (stays in the save) | 'full' (the pack has no room) | 'gone' }.
 * `now`: the clock, for a stack put back where it lay.
 */
export function ownRowToSharedFloor(features, engine, { state, key, inv, id, x, y, into = null, merge = true } = {}) {
  const rows = state?.streets?.[String(key ?? '')];
  const row = Array.isArray(rows) ? rows.find((r) => r.id === id) : null;
  if (!row) return { ok: false, reason: 'gone' };
  const cls = row.classTsid;
  const n = Math.max(0, Math.floor(Number(row.count) || 0));
  // The shared floor carries one plain stack: no bag, name, specialization, tool wear or words.
  if (n < 1 || row.contents?.length || row.name || row.sort || row.points || row.tags) return { ok: false, reason: 'own' };
  if (features?.query?.('sharedDropFits', cls, n, engine) !== true) return { ok: false, reason: 'own' };
  const room = features.query('packRoom', cls, n, engine);
  if (room != null && room < n) return { ok: false, reason: 'full' };
  const was = { x: row.x, y: row.y, on: row.on, decor: row.decor === true, droppedAt: row.droppedAt };
  const lifted = pickupDroppedStack(state, inv, key, id, Infinity);
  if (!lifted.ok) return { ok: false, reason: 'gone' };
  if (features.query('sharedDrop', { classTsid: cls, count: lifted.count, x, y, copy: null, into, merge }, engine)) {
    return { ok: true, shared: true, count: lifted.count };
  }
  // Not taken after all: back down where it lay, as it was.
  const back = dropInventoryStack(state, inv, key, cls, lifted.count, { x: was.x, y: was.y }, { now: was.droppedAt, merge: false, ...(was.decor ? { decor: true } : {}) });
  if (back.ok && was.on != null) {
    const again = state.streets[key]?.find((r) => r.id === back.stack.id);
    if (again) again.on = was.on;
  }
  return { ok: false, reason: 'own' };
}
