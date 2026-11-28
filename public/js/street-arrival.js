/**
 * G913: where you stand when you come onto a street with no spot of your own (a new game's first
 * street, Skip to Ur, the tutorial skipped from its scenes, a trip that names no signpost or door).
 *
 * Glitch never set anyone down on a street at a made-up spot: a signpost or door landed you on its
 * connect's x and y, and a Map teleport on one of the street's incoming links, the points other
 * streets' signposts and doors land you on (players/inc_teleportation.js 482-503,
 * geo_links_get_incoming in locations/inc_geo_links.js 336-357; a street with none on one of its
 * teleport markers). The remake once took the street placement planner's spot (street-ecology.js
 * planStreetPlacements 'player', the free spot nearest the middle), and since the planner counts
 * every floor height (30e8eca38dd) that spot can be a tree's canopy: a fresh game began high in
 * Hechey Track's pines.
 *
 * So an arrival with no spot takes the street's incoming arrival nearest its middle
 * (assets/content/street-arrivals.json, tools/build-street-arrivals.mjs; one fixed point, so every
 * new game starts in the same place, where Glitch's teleport picked one at random). A street no
 * other street leads to takes its own way out nearest the middle, where /stuck stands you
 * (street-model.js stuckWay); with neither, null (game.js keeps the planner's spot).
 */
import { fetchRetry } from './load-retry.js?v=477aa7a7';
import { inUnreachedRun, unreachedFloorsFor } from './street-ecology.js?v=e5263244';
import { isStandable, platformYAt, stuckWay } from './street-model.js?v=a9a05f9d';

export const STREET_ARRIVALS_URL = 'assets/content/street-arrivals.json';

/** PURE: the street's incoming arrivals ([[x, y], ...], screen space) under its tsid or its G/L alias. */
export function arrivalsFor(table, tsid) {
  if (!table || !tsid) return [];
  const id = String(tsid);
  const rows = table[id] || table[`G${id.slice(1)}`] || table[`L${id.slice(1)}`];
  return Array.isArray(rows) ? rows.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])) : [];
}

/**
 * PURE: the spot an arrival with no spot of its own stands on: { x, y, from } with `from`
 * 'incoming' (an arrival from another street) or 'way' (the street's own signpost or door), or null.
 * `worldW` the street's width (screen space), `closed` the streets still being built (stuckWay).
 */
export function defaultArrival(street, table, { worldW, closed = [] } = {}) {
  if (!street) return null;
  const mid = Number.isFinite(worldW) && worldW > 0 ? worldW / 2 : 0;
  const rows = arrivalsFor(table, street.tsid);
  if (rows.length) {
    const [x, y] = rows.reduce((best, p) => (Math.abs(p[0] - mid) < Math.abs(best[0] - mid) ? p : best));
    return { x, y, from: 'incoming' };
  }
  const way = stuckWay(street, mid, closed);
  return way && Number.isFinite(way.x) && Number.isFinite(way.y) ? { x: way.x, y: way.y, from: 'way' } : null;
}

/**
 * G575 (Austin 2026-11-19): the ways onto a street that count as an arrival for /stuck. A signpost
 * or a door sets you down on its connect's spot, where you walked in; everything else (a load, a
 * resurrection, a home return, a teleport point, a quest room's way out) is no arrival, and /stuck
 * takes the nearest way out (game.js stuckReturn, street-model.js stuckWay).
 */
export const STUCK_ARRIVAL_WAYS = Object.freeze(['signpost', 'door']);

/**
 * PURE (G575): /stuck's spot for this entry onto `tsid`: { tsid, x, y, from: 'arrival' } at `at`
 * (where the avatar was set down) when `opts.arrivalBy` is a signpost or a door with a spot
 * (opts.spawnX), else { tsid, x, y, from: 'street' } at `street` (the street's own spot). Every
 * trip enters quiet under the loading card, so quiet cannot tell an arrival apart; the way can.
 */
export function stuckArrivalSpot(tsid, opts = {}, { at, street } = {}) {
  const arrived = STUCK_ARRIVAL_WAYS.includes(opts?.arrivalBy) && Number.isFinite(opts?.spawnX)
    && Number.isFinite(at?.x) && Number.isFinite(at?.y);
  return arrived
    ? { tsid, x: at.x, y: at.y, from: 'arrival' }
    : { tsid, x: street?.x, y: street?.y, from: 'street' };
}

/**
 * PURE (G920): the height for a spot given as x only (a QA or demo link's streetx with no streety,
 * a feature's trip that names an x): the street's ground at that x, the lowest standable floor
 * under it (screen y grows down), where a drop from above the street ends once it has fallen
 * through every ledge, branch and canopy. Floors nobody reaches (street-ecology.js
 * unreachedFloorsFor of `tsid`, a pocket under the street) are passed over while a reached one stands
 * at x. Null when no standable line spans x (game.js then keeps the old height).
 */
export function groundAt(platforms, x, { tsid = '', unreached = tsid ? unreachedFloorsFor(tsid) : null } = {}) {
  if (!Number.isFinite(x)) return null;
  let low = null;
  let reached = null;
  for (const p of platforms || []) {
    if (!p || !isStandable(p) || Math.abs(p.x2 - p.x1) < 1) continue; // an upright line is no floor
    const y = platformYAt(p, x, 0);
    if (!Number.isFinite(y)) continue;
    if (low == null || y > low) low = y;
    if (!inUnreachedRun(unreached, p, x) && (reached == null || y > reached)) reached = y;
  }
  return reached ?? low;
}

let tablePromise = null;
/**
 * The arrivals table, fetched once and shared. Resolves null when it cannot be had (offline, an old
 * build): defaultArrival then takes the street's own way out; a failed load is tried again next time.
 */
export function loadStreetArrivals(fetchFn = globalThis.fetch && fetchRetry) {
  if (typeof fetchFn !== 'function') return Promise.resolve(null);
  tablePromise ||= Promise.resolve()
    .then(() => fetchFn(STREET_ARRIVALS_URL))
    .then((r) => (r?.ok ? r.json() : null))
    .catch(() => null)
    .then((table) => {
      if (!table) tablePromise = null;
      return table;
    });
  return tablePromise;
}
