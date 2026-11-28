/**
 * The open-road rule (root R11, register G1075, Austin 2026-11-21): which streets anyone can walk to,
 * one rule for the Map, the Projects tab, travel and the realtime server's featured project.
 *
 * How Glitch did it: a street with a street-building project not done was locked for the whole world
 * (locations/inc_jobs.js jobs_modify_connections 530-622: jobs_is_locked, every incoming signpost and
 * door locked; jobs_unlock opens them and reloads the global path finding). Nothing was per player:
 * a teleport there was refused (players/inc_teleportation.js 219-223) and the Map made it no
 * destination (locations/location.js 2915-2935), so no player stood past a locked road.
 *
 * The rule here, for everyone (the server mirrors it: groddle-afternoon-server openroads.go, and
 * testdata/open-roads.json holds the cases both must answer the same):
 *  - a street project's road is open when the project is done, built from the start
 *    (tools/street-jobs-built-from-start.json), a subway station's street (ticket 50), or a road from
 *    the starter street (`starters`; the server's `exempt`). Every other street project's street is
 *    closed (closedForEveryone).
 *  - the open world is every street the starter street reaches over those open roads (signposts and
 *    doors, locked doors left out: a new player holds no keys, G401) plus the ways no closure holds
 *    that every player can take (the Collision-triggered Teleporters; the subway needs papers, so it
 *    is not one). openWorld. The server features only a project whose board stands in it.
 *
 * One remake-only layer on top, per player: a street you have stood on keeps its road open for you
 * (`state.grandfathered`, js/street-jobs.js noteArrival and openWayHome; ticket 50: nothing may cut
 * you off from home). It is yours alone: it never counts as built for the world, so the Projects tab
 * still lists its project as under way, the server and the featured pick never see it, and following
 * you there is refused (#549). keptForYou says when a street is open only because of it, so the
 * Projects tab can say so beside the Map that shows it open.
 *
 * Pure: no DOM, no fetch.
 */

import { SUBWAY_LINE } from './subway-line.js?v=d74b3ee0';
import { reachableStreets, streetGraph } from './street-graph.js?v=92206051';

const gTsid = (tsid) => {
  const s = String(tsid || '');
  return s.startsWith('L') ? `G${s.slice(1)}` : s;
};

/**
 * Streets the subway comes up on (subway-line.js, config_prod.js transit_instances.subway_1). Ticket
 * 50 (calais, 2026-11-03): a fresh world closed 9 of the 12, so the subway set you down on a street
 * still "under construction" (Somewhat Sump), you walked out, and no road led back to it. Glitch
 * built the subway to streets that stood: every one of the 684 project streets is jobs_is_locked
 * false in the location dump (e.g. LLI57DI72HI153U.xml 110), and the Red Line was 2012's. So a
 * station street counts as built.
 */
export const SUBWAY_STREETS = Object.freeze(SUBWAY_LINE.stations.map((s) => gTsid(s.surfaceStreetTsid || s.connects_to)).filter(Boolean));

/**
 * A street project counted as built for everyone without being done: a subway station's street, or a
 * road from one of `starters` (the starter street). The server's table carries it as `exempt`
 * (tools/build-realtime-projects.mjs).
 */
export function exemptForEveryone(job, { starters = [] } = {}) {
  if (!job || job.kind !== 'street') return false;
  const street = gTsid(job.street);
  if (SUBWAY_STREETS.includes(street)) return true;
  const from = new Set(starters.map(gTsid).filter(Boolean));
  return (job.connecting || []).some((t) => from.has(gTsid(t)));
}

/**
 * Is a project built for everyone: done (`row.doneAt`), built from the start, or (a street project)
 * exempt. An upgrade or a hall is never built until it is done.
 */
export function builtForEveryone(job, row, { starters = [] } = {}) {
  if (!job) return true;
  if (row?.doneAt) return true;
  if (job.builtFromStart) return true;
  return exemptForEveryone(job, { starters });
}

/**
 * Every street whose road is closed for everyone: a street project's street not built for everyone.
 * `rows` is job id -> row ({ doneAt }). Sorted G tsids.
 */
export function closedForEveryone(catalog, rows = {}, { starters = [] } = {}) {
  const out = new Set();
  for (const [jobId, job] of Object.entries(catalog?.jobs || {})) {
    if (job?.kind !== 'street') continue;
    if (!builtForEveryone(job, rows?.[jobId], { starters })) out.add(gTsid(job.street));
  }
  return [...out].sort();
}

/** The per-player layer: is `street` one you have stood on (kept open for you alone)? */
export function keptOpen(state, street) {
  const t = gTsid(street);
  return Boolean(t) && (state?.grandfathered || []).some((s) => gTsid(s) === t);
}

/**
 * A street open for you only because you have stood on it: its road is closed for everyone else.
 * The Projects tab says so beside a project still under way (G1075: the Map showed Parsin's Trail SW
 * open while the tab listed its project as in progress, and a friend saw it closed).
 */
export function keptForYou(state, catalog, street, { starters = [] } = {}) {
  const t = gTsid(street);
  if (!keptOpen(state, t)) return false;
  return closedForEveryone(catalog, state?.jobs || {}, { starters }).includes(t);
}

/**
 * The free ways every player can take (no closure holds them, and unlike the subway they need no
 * papers): each teleporter's one way, from -> [to], G tsids.
 * @param {{ from: string, to: string }[]} teleporters js/hidden-floors.js TELEPORTERS and the like
 */
export function freeWays(teleporters = []) {
  const out = {};
  for (const t of teleporters) {
    const from = gTsid(t?.from);
    const to = gTsid(t?.to);
    if (!from || !to) continue;
    const list = (out[from] ||= []);
    if (!list.includes(to)) list.push(to);
  }
  return out;
}

/**
 * The open world: every street the starter street reaches over the open roads of `roads` (a street
 * graph, signpost-graph.json or an adjacency map; `closed` the streets closed for everyone; locked
 * doors left out) and the `free` ways. A Set of G tsids; empty with no starter.
 */
export function openWorld(roads, { closed = [], starter = '', free = {} } = {}) {
  if (!starter) return new Set();
  const graph = streetGraph(roads, { closed: [...closed] });
  return reachableStreets(graph, { starts: [gTsid(starter)], free, keyed: false });
}

/**
 * Can players work on this project from the open world: a street project whose board (an offering
 * street, `offer`) is in `reach`, or an upgrade of a street in it. The server's featured pick asks
 * the same (openroads.go featuredReachable).
 */
export function projectReachable(job, offer = [], reach = new Set()) {
  if (!job) return false;
  if (job.kind === 'upgrade') return reach.has(gTsid(job.street));
  return offer.some((t) => reach.has(gTsid(t)));
}
