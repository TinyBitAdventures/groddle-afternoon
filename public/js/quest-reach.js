/**
 * Quests that need a street you cannot reach yet (Austin, 2026-11-03).
 *
 * A fresh world keeps every street project's road closed until it is built (the
 * remake replays the build-out: js/street-jobs.js roadClosure). Glitch's own world
 * ended with every project street standing (jobs_is_locked false in the location
 * dump), so its quests never asked for a street behind a barricade; here some do:
 * "To Xalanga, And Beyond" wants a teleport point in Xalanga: Hazy Gate 3 is built from the start
 * (tools/street-jobs-built-from-start.json), but Yellow Yawning, its way in, still waits on
 * Tlemcen, Heckes and Viscid Pud (the shorter way through Level 2 West's door needs a key nothing
 * gives, so the ways here never count it: signpost-graph `sealed`). Neva Neva and Ajaya Bliss
 * ("Well, I Neva!", "A Blissful Trip") are behind Door Key 9 doors. Glitch gated such offers by where you could go
 * (quests/*.js canOffer, e.g. the region and location checks); the remake holds them:
 *  - an offer whose requirement needs such a street waits until one of its streets
 *    can be reached (quest-offers.js eligibleTrigger, ctx.questHeld);
 *  - an accepted one shows "On hold" in the Quests list, keeps its progress, and
 *    leaves the tracker and the pins until the road opens. Nothing is stored: the
 *    hold is worked out from the roads each time, so it can never go stale.
 *
 * Pure: the street index, the ways between streets and the closed streets come in.
 * Where a requirement can happen comes from its COUNTER_ROUTES rows
 * (quest-offers.js routesForCounter): a requirement is bound to streets only when
 * every route that can advance it happens on named streets.
 */
import { routesForCounter, WINTRY_PLACE_STREETS } from './quest-offers.js?v=c6b0ab10';

const G = (t) => String(t || '').replace(/^L/, 'G');
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Labels and hubs to streets, from assets/streets/index.json.
 * @returns {{ bySlug: Map<string, string[]>, byHub: Map<string, string[]>, has: (t: string) => boolean, label: (t: string) => string, hubName: (t: string) => string }}
 */
export function placeIndex(streetIndex) {
  const streets = streetIndex?.streets || {};
  const bySlug = new Map();
  const byHub = new Map();
  for (const [tsid, row] of Object.entries(streets)) {
    const s = slug(row?.label);
    if (s) (bySlug.get(s) || bySlug.set(s, []).get(s)).push(tsid);
    const h = slug(row?.hubName);
    if (h) (byHub.get(h) || byHub.set(h, []).get(h)).push(tsid);
  }
  return {
    bySlug,
    byHub,
    has: (t) => Boolean(streets[G(t)]),
    label: (t) => streets[G(t)]?.label || G(t),
    hubName: (t) => streets[G(t)]?.hubName || '',
  };
}

/** The streets one route can happen on, or null when it can happen anywhere. */
export function routePlaces(route, vars, idx) {
  if (route.afterStreets) return [...new Set(route.afterStreets.map(G))].filter(idx.has);
  const ev = String(route.event || '');
  if (ev === 'street_entered_tsid:{a}' && Array.isArray(route.a)) return [...new Set(route.a.map(G))].filter(idx.has);
  if (ev === 'meditation_seconds_wintry') return [...new Set(WINTRY_PLACE_STREETS.map(G))].filter(idx.has);
  if (ev.includes('{')) return null;
  let m = ev.match(/^street_entered:([a-z0-9_]+)$/);
  if (m) return idx.bySlug.get(m[1]) || [];
  m = ev.match(/^(?:teleport_point_set|teleported_to):([a-z0-9_]+)$/);
  if (m) return idx.byHub.get(m[1]) || idx.bySlug.get(m[1]) || [];
  m = ev.match(/^(?:sparkly_mined_in|sparkly_ground_in):([a-z0-9_]+)$/);
  if (m) return idx.bySlug.get(m[1]) || idx.byHub.get(m[1]) || [];
  return null;
}

const needCache = new WeakMap();

/**
 * The requirements of a quest that can only be met on certain streets:
 * [{ name, desc, streets, need }] (streets: G tsids in the index; `need` of them must be reached,
 * one unless a route counts each street once).
 */
export function questPlaceNeeds(def, idx) {
  if (!def) return [];
  let byIdx = needCache.get(idx);
  if (!byIdx) needCache.set(idx, (byIdx = new Map()));
  if (byIdx.has(def.classTsid)) return byIdx.get(def.classTsid);
  const out = [];
  for (const req of def.requirements || []) {
    if (req.type !== 'counter' && req.type !== 'flag') continue;
    const routes = routesForCounter(req.name);
    if (!routes.length) continue;
    const places = new Set();
    let anywhere = false;
    // A route that counts each street once (the Seam Streets) needs as many streets as the count.
    let need = 1;
    for (const { route, vars } of routes) {
      if (route.distinct === true && Number(req.num) > 1) need = Math.max(need, Math.floor(Number(req.num)));
      const at = routePlaces(route, vars, idx);
      if (!at) {
        anywhere = true;
        break;
      }
      for (const t of at) places.add(t);
    }
    if (anywhere || !places.size) continue;
    out.push({ name: req.name, desc: req.desc || req.name, streets: [...places], need: Math.min(need, places.size) });
  }
  byIdx.set(def.classTsid, out);
  return out;
}

/**
 * Every street you can walk, ride or be set down on with the roads as they stand: from
 * the starts (the starter street, where you are, the streets already open to you) over
 * the ways a closure can hold (`graph`, never into a `shut` street) and the ways none
 * holds (`free`: the subway, the Collision-triggered Teleporters), as the ticket 50 test does.
 */
export function reachableStreets({ graph = {}, free = {}, shut = [], starts = [] } = {}) {
  const closed = shut instanceof Set ? shut : new Set(shut);
  const seen = new Set();
  const queue = [];
  for (const s of starts.map(G)) if (s && !seen.has(s)) (seen.add(s), queue.push(s));
  while (queue.length) {
    const at = queue.shift();
    for (const to of graph[at] || []) if (!closed.has(to) && !seen.has(to)) (seen.add(to), queue.push(to));
    for (const to of free[at] || []) if (!seen.has(to)) (seen.add(to), queue.push(to));
  }
  return seen;
}

/**
 * The street projects to build, in order, on the way from the starts to any of `targets`: the
 * fewest of them (0-1 search, entering a closed street costs one, as openWayHome), where a
 * closed street can only be entered from one of its project board streets (`boards`: street ->
 * the streets its road opens from, street-jobs.json `connecting`), since that is where it is
 * built: Hazy Gate 3's board stands on Ramble Way 4, inside Xalanga, so Xalanga's way in is
 * another one. [{ street, board }], the first one buildable now.
 */
export function closuresInTheWay({ graph = {}, free = {}, shut = [], starts = [], targets = [], boards = null } = {}) {
  const closed = shut instanceof Set ? shut : new Set(shut);
  const goal = new Set(targets.map(G));
  const cost = new Map();
  const prev = new Map();
  const deque = [];
  for (const s of starts.map(G)) if (s && !cost.has(s)) (cost.set(s, 0), prev.set(s, null), deque.push(s));
  let end = null;
  while (deque.length) {
    const at = deque.shift();
    if (goal.has(at)) {
      end = at;
      break;
    }
    const c = cost.get(at);
    const step = (to, w) => {
      if (cost.has(to) && cost.get(to) <= c + w) return;
      cost.set(to, c + w);
      prev.set(to, at);
      if (w) deque.push(to);
      else deque.unshift(to);
    };
    for (const to of graph[at] || []) {
      if (!closed.has(to)) step(to, 0);
      else if (!boards || boards[to]?.includes(at)) step(to, 1);
    }
    for (const to of free[at] || []) step(to, 0);
  }
  if (!end) return [];
  const path = [];
  for (let at = end; at; at = prev.get(at)) if (closed.has(at)) path.push({ street: at, board: prev.get(at) || '' });
  return path.reverse();
}

/**
 * Why this quest waits, or null: the first street-bound requirement none of whose
 * streets can be reached. { name, desc, streets, place } (place: the hub, or the street,
 * the requirement names).
 */
export function questHold(def, reach, idx) {
  if (!reach) return null;
  for (const need of questPlaceNeeds(def, idx)) {
    if (need.streets.filter((t) => reach.has(t)).length >= (need.need || 1)) continue;
    const hubs = [...new Set(need.streets.map(idx.hubName).filter(Boolean))];
    const place = hubs.length === 1 && need.streets.length > 1 ? hubs[0] : idx.label(need.streets[0]);
    return { ...need, place };
  }
  return null;
}

/**
 * The Quests list's note for a held quest. `building`: the first street project on the way that
 * can be built now, `board`: the street its project board stands on (both when known).
 */
export function holdNote(hold, { building = '', board = '' } = {}) {
  if (!hold) return '';
  const road = `On hold: waiting for the road to ${hold.place} to be built`;
  if (building && board) {
    const first = building === hold.place ? 'Help build it' : `Start with ${building}`;
    return `${road}. ${first}, at the project board on ${board}.`;
  }
  return `${road}.`;
}
