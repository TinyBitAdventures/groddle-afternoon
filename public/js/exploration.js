/**
 * Street-visit badge counters, as locations/location.js onPlayerEnter emits
 * them:
 *
 * - `locations_visited:<tsid>` on every visit (instances count as their
 *   template); OK Explorer, Rambler, Wanderer, Globetrotter and friends are
 *   group_count badges over it.
 * - `hubs_visited:<hub>` on every visit.
 * - `streets_visited_in_hub:number_<hub>` on the first visit to a street that
 *   countsTowardHubAchievement (the hub's own map lists it); every
 *   `<hub>_completist` badge is a counter on that label.
 * - `streets_visited_in_hub_<hub>:<tsid>` on every counting visit (Haraiva's
 *   Completist is a group_count over it).
 *
 * Remake rule: the public archive lost a few streets of most hubs (1 to 3 of
 * Groddle Forest's 41, all but 2 of Uralia's 4), so no Completist badge could
 * ever finish. When every street the archive kept for a hub has been visited,
 * the hub counter is topped up to the hub map's full street count.
 */

import { HUB_MAP_STREETS } from './hub-maps-data.js';

// js/hell.js noteNarakaVisit already counts Naraka's streets (its index rows
// leave Hell One Clone's hub blank), so hub 40 is left to it.
const HUBS_COUNTED_ELSEWHERE = new Set(['40']);

const mappedSets = new Map();
function mappedSet(hubId) {
  const key = String(hubId);
  if (!mappedSets.has(key)) mappedSets.set(key, new Set(HUB_MAP_STREETS[key] || []));
  return mappedSets.get(key);
}

/** True when the hub's own map lists the street (countsTowardHubAchievement). */
export function countsTowardHub(tsid, hubId) {
  return Boolean(tsid && hubId != null && mappedSet(hubId).has(tsid));
}

/**
 * Streets of a hub the remake can actually load: listed on the hub map,
 * present in the street index, and filed under that hub.
 * @param {string|number} hubId
 * @param {Record<string, { hubId?: string }>} indexStreets
 */
export function availableHubStreets(hubId, indexStreets = {}) {
  const key = String(hubId);
  return (HUB_MAP_STREETS[key] || []).filter((tsid) => String(indexStreets[tsid]?.hubId ?? '') === key);
}

/** Total streets the source hub map lists for a hub. */
export function hubMapStreetCount(hubId) {
  return (HUB_MAP_STREETS[String(hubId)] || []).length;
}

/**
 * The counters one street entry emits, in source order.
 * @param {object} args
 * @param {string} args.tsid           street (or instance template) tsid
 * @param {string|number} args.hubId
 * @param {string[]} [args.visitedInHub] counting streets of this hub already seen (before this visit)
 * @param {Record<string, object>} [args.indexStreets]
 * @returns {{ counter: string, amount: number }[]}
 */
export function streetVisitCounters({ tsid, hubId, visitedInHub = [], indexStreets = {} }) {
  if (!tsid) return [];
  const out = [{ counter: `locations_visited:${tsid}`, amount: 1 }];
  if (hubId == null || hubId === '') return out;
  const hub = String(hubId);
  out.push({ counter: `hubs_visited:${hub}`, amount: 1 });
  if (HUBS_COUNTED_ELSEWHERE.has(hub) || !countsTowardHub(tsid, hub)) return out;
  const seen = new Set(visitedInHub);
  if (!seen.has(tsid)) {
    seen.add(tsid);
    const available = availableHubStreets(hub, indexStreets);
    const allKept = available.length > 0 && available.every((id) => seen.has(id));
    // Top up to the full hub count once every kept street has been seen.
    const amount = allKept ? Math.max(1, hubMapStreetCount(hub) - (seen.size - 1)) : 1;
    out.push({ counter: `streets_visited_in_hub:number_${hub}`, amount });
  }
  out.push({ counter: `streets_visited_in_hub_${hub}:${tsid}`, amount: 1 });
  return out;
}

/**
 * Emit one street entry's counters through `apply(counter, amount)` and
 * remember the street under its hub (the hub list is what streetVisitCounters
 * checks next time, whether or not a badge counts that group).
 * @returns {any[]} everything `apply` returned, flattened
 */
export function applyStreetVisit({ state, tsid, hubId, indexStreets = {}, apply }) {
  const key = `streets_visited_in_hub_${hubId}`;
  const counters = streetVisitCounters({ tsid, hubId, visitedInHub: state.groups?.[key] || [], indexStreets });
  const results = [];
  for (const { counter, amount } of counters) results.push(...(apply(counter, amount) || []));
  if (counters.some((c) => c.counter === `${key}:${tsid}`)) {
    if (!state.groups || typeof state.groups !== 'object') state.groups = {};
    const list = state.groups[key] || (state.groups[key] = []);
    if (!list.includes(tsid)) list.push(tsid);
  }
  return results;
}
