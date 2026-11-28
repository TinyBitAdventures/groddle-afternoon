/**
 * Quests that need a street you cannot reach yet (Austin, 2026-11-03).
 *
 * A fresh world keeps every street project's road closed until it is built (the
 * remake replays the build-out: js/street-jobs.js roadClosure). Glitch's own world
 * ended with every project street standing (jobs_is_locked false in the location
 * dump), so its quests never asked for a street behind a barricade; here some do:
 * "To Xalanga, And Beyond" wants a teleport point in Xalanga: Hazy Gate 3 is built from the start
 * (tools/street-jobs-built-from-start.json), but Yellow Yawning, its way in, still waits on
 * Tlemcen, Heckes and Viscid Pud (or Level 2 West's Key 7 door; a door whose key nothing gives is
 * no way here: signpost-graph `sealed`). Neva Neva and Ajaya Bliss ("Well, I Neva!", "A Blissful
 * Trip") are behind Door Key 9 doors on streets still to be built. Glitch gated such offers by where you could go
 * (quests/*.js canOffer, e.g. the region and location checks); the remake holds them:
 *  - an offer whose requirement needs such a street waits until one of its streets
 *    can be reached (quest-offers.js eligibleTrigger, ctx.questHeld);
 *  - an accepted one shows "On hold" in the Quests list, keeps its progress, and
 *    leaves the tracker and the pins until the road opens. Nothing is stored: the
 *    hold is worked out from the roads each time, so it can never go stale.
 *
 * Pure: the street index and the reach come in. The reach itself, and the projects on the way to a
 * held quest's street, are walks over the street graph (js/street-graph.js reachableStreets,
 * fewestClosures), which holds the closed roads (R11, G969).
 * Where a requirement can happen comes from its COUNTER_ROUTES rows
 * (quest-offers.js routesForCounter): a requirement is bound to streets only when
 * every route that can advance it happens on named streets.
 */
import { routesForCounter, WINTRY_PLACE_STREETS } from './quest-offers.js?v=36e610b5';
import { PHANTOM_QUEST_ID, phantomPlaceNeed } from './ghost-quest.js?v=5f3cc133';

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
 * Street-bound requirements a quest's own story chose for this player (#145): Notice the
 * Unnoticeable's cold spots (questState.story.phantom, js/ghost-quest.js phantomPlaceNeed), each
 * of which must be reached. [{ name, desc, streets, need, story: true }], G tsids in the index.
 */
export function questStoryNeeds(classTsid, questState, idx) {
  if (classTsid !== PHANTOM_QUEST_ID || !questState) return [];
  const need = phantomPlaceNeed(questState);
  if (!need) return [];
  const streets = [...new Set(need.streets.map(G))].filter(idx.has);
  if (!streets.length) return [];
  return [{ ...need, streets, need: streets.length, story: true }];
}

/** A cache key for questStoryNeeds (changes when a spot is found or swapped), or ''. */
export function questStoryKey(classTsid, questState) {
  if (classTsid !== PHANTOM_QUEST_ID) return '';
  const need = phantomPlaceNeed(questState);
  return need ? need.streets.join(',') : '';
}

/**
 * Why this quest waits, or null: the first street-bound requirement none of whose
 * streets can be reached. { name, desc, streets, place } (place: the hub, or the street,
 * the requirement names). `questState` adds the streets its story chose for this player
 * (questStoryNeeds); for those, `streets` and `place` name only the ones out of reach.
 */
export function questHold(def, reach, idx, questState = null) {
  if (!reach) return null;
  const needs = [...questPlaceNeeds(def, idx), ...questStoryNeeds(def?.classTsid, questState, idx)];
  for (const need of needs) {
    if (need.streets.filter((t) => reach.has(t)).length >= (need.need || 1)) continue;
    if (need.story) {
      const blocked = need.streets.filter((t) => !reach.has(t));
      return { ...need, streets: blocked, place: idx.label(blocked[0]) };
    }
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
export function holdNote(hold, { building = '', board = '', giver = '' } = {}) {
  if (!hold) return '';
  const road = `On hold: waiting for the road to ${hold.place} to be built`;
  if (building && board) {
    const first = building === hold.place ? 'Help build it' : `Start with ${building}`;
    // Gap 3: `giver` names who gives it there ("the Street Spirit"), else the project board.
    return `${road}. ${first}, at ${giver || 'the project board'} on ${board}.`;
  }
  return `${road}.`;
}
