/**
 * Map routes (register row G177): the destination the map draws a path to,
 * the "To: / Next:" GPS line, and who sets and clears a route.
 * Pure rules: no DOM, no Pixi, no storage.
 *
 * What the source does (tinyspeck/glitch-GameServerJS and glitch-client, CC0):
 * - players/player.js buildPath() 2439-2562: a route runs from the street you
 *   are on (an instance counts as its template) to one destination, or to the
 *   closest of several (apiFindShortestGlobalPath). From a home it fails with
 *   "Return to the world to continue on your path" (2481); to the street you are on,
 *   "You're already there! (or really, really close)". setPath() 2564 keeps it
 *   on the player (map_path) and getPathRsp() 2581 sends the street list.
 * - main.js 137-138 get_path_to_location / clear_location_path, doMapGetPath()
 *   6455 and doMapClearPath() 6471: the player sets or clears a route from the Map.
 * - Who sets a route for you:
 *   quests/hell_quest.js onAccepted() 95-121 (Beelzebooze: Panka Surazu,
 *   LA5RPAFK9OE28GN, "your map has been updated with the route to the Hell Bar");
 *   players/inc_announcements.js 446-453 and 488-495 (Warm and Smuggly: the
 *   Contraband's destination, then the map opens on it); items/contraband.js
 *   check_address 62-78 (the same, or "Hmm. You seem to be off the path right
 *   now..."); items/npc_bureaucrat.js 763-794 (The Back Alley: Fuelmaking's
 *   closest Subway Station, or Legalize It's closest Bureaucratic Hall, built
 *   from the street you came from); players/inc_world_events.js 133-142 (a
 *   lonely Street Spirit, if you say Yes).
 * - Who clears it: items/contraband.js drop 102, items/npc_deimaginator.js
 *   finishCatch 258 and items/npc_smuggler.js 525, 884-885, 1195, 1306, 1417
 *   (the run ends); players/player.js croak() 1293 keeps the route as
 *   previous_map_path and resurrect() 1386-1398 puts that one back, so "If a
 *   player sets a path in hell or has one set by the hell quest, it shouldn't
 *   persist after they leave"; resets (player.js 1764, inc_newxp.js 29).
 * - locations/location.js 310-313: entering the destination counts
 *   map_dest_reached (A Little Tutorial Reinforcement's "Reach a map destination").
 * - Client (glitch-client com/tinyspeck/engine): TSFrontController.startLocationPath
 *   1759-1847 finds where you are on the path and the signpost (or door) that
 *   leads to the next street; off the path it walks the list from the end for
 *   any street a signpost here links to. view/ui/map/GpsUI.as draws the GPS:
 *   "To: <destination>", "Next: <street>", "You Have Arrived!" at the
 *   destination, "Return to world for directions" off the path, a close button
 *   (endLocationPath), an arrow that points at the next signpost; moveMoveEnded
 *   307-363 asks for a new route when you leave the path, moveMoveStarted
 *   366-369 clears the route when you leave the street you arrived on.
 *   view/gameoverlay/maps/MapHub.as 70-72 draws the path in hub_map_path_color,
 *   default 0xf0f258.
 *
 * Remake: routes run over public/assets/content/signpost-graph.json
 * (tools/build-signpost-graph.mjs): visible signposts under `streets`, and
 * since G192 the doors under `doors` (fixed-destination, visible doors; key
 * locked ones listed in `doorKeys`). js/street-graph.js joins them, closed roads out, so a route can
 * end inside a door-only room (the Hell Bar behind Panka Surazu, Vicar's
 * Peak). On a street the client looks for a signpost to the next street first
 * and a door second (TSFrontController.startLocationPath 1791-1799,
 * loc_path_door; Location.getDoorThatLinksToLocTsid), and so do
 * signpostToward() / doorToward() here. A locked door is taken only when no
 * other way exists, the subway included (a route to Hazy Gate 3 once went
 * through Level 2 West's Yellow-Teal Square Key door: Austin, 2026-11-03), and a
 * door whose key nothing gives (the signpost-graph's `sealed` list, empty since
 * Dust Traps drop Door Keys 7-10 and 12) is no way at all. Unlike player.js, resurrecting forgets the stored route
 * once it is restored (the source kept previous_map_path for ever and could
 * restore a stale one after a later croak).
 */

import { closedOnTheWay, doorRooms, findRoute, graphKey, hasRoad, isClosed, lockedOnTheWay, routeGraph, sameStreet, tsidAliases } from './street-graph.js?v=92206051';
import { DOOR_KEYS, DOOR_TEXT } from './doors.js?v=f815e7c8';

/**
 * R11 (G969): the graph and its walks live in js/street-graph.js, closed roads included; these
 * names stay here for the modules and tests that import them from the Map's rules.
 */
export { doorRooms, findRoute, graphKey, routeGraph, sameStreet, tsidAliases };

/** Player-facing copy, verbatim from the source. */
export const ROUTE_TEXT = Object.freeze({
  /** GpsUI.as setDestinationText 201. */
  to: 'To: ',
  /** GpsUI.as getNextText 265. */
  next: 'Next: ',
  /** GpsUI.as updateArrow 179. */
  arrived: 'You Have Arrived!',
  /** GpsUI.as getNextText 274-277. */
  offPath: 'Return to world for directions',
  /** player.js buildPath 2502 / 2514 / 2536. */
  alreadyThere: "You're already there! (or really, really close)",
  /** player.js buildPath 2481. */
  fromHome: 'Return to the world to continue on your path',
  /** player.js buildPath 2546. */
  notFound: 'Path not found',
  /** The remake's own (Austin 2026-11-15): the destination is still under construction, or only closed roads lead there. */
  noRoad: 'No road there yet',
  /** The remake's own (check 2026-11-25, regionWayIn): the Map card's way into a region whose map shows unbuilt roads. */
  wayIn: 'The way in: ',
  noRoadInto: 'No open road leads into ',
  /** The remake's own (Austin 2026-11-25): the way in needs Your Papers or a key you do not have yet. */
  wayInGated: 'Show the way says what you need for it.',
  /** GpsUI.as moveMoveEnded 347-352 growl. */
  rerouteFailed: 'Creating path failed: Path not found',
  /** items/contraband.js check_address 71. */
  contrabandOffPath: 'Hmm. You seem to be off the path right now. Your contraband is temporarily confused about where it needs to go.',
  /**
   * The remake's own (R24): only the subway gets there, and the gate would turn you back
   * (js/subway.js gateRefusal). The feature adds where Your Papers come from (subway.js papersHint).
   */
  subwayPapers: 'The only way there is the subway, and the gate needs your papers.',
  subwayDubious: 'The only way there is the subway, and the gate turns away journeys of dubious purpose.',
  /**
   * Austin 2026-11-25: only a locked door you hold no key for gets there. Glitch's own refusal at
   * the door (locations/inc_locked_doors.js 49, js/doors.js DOOR_TEXT.needKey), led by where the
   * door is and followed by the key that opens it (items/door_key_N.js name_single).
   */
  lockedDoor: (doors, keys, many = false) => `The only way there is through ${doors}. ${many ? 'You need the correct keys to unlock them' : DOOR_TEXT.needKey.replace(/\.$/, '')}: ${keys}.`,
  /** The remake's own (Austin 2026-11-25): the subway or a locked door, and you may take neither. */
  subwayOrDoor: (gate, doors, keys) => `The only ways there are the subway, whose gate ${gate}, and ${doors}, which needs ${keys}.`,
  /** The remake's own (Austin 2026-11-25): the only way rides the subway and goes through a locked door. */
  subwayAndDoor: (gate, doors, keys) => `The only way there rides the subway, whose gate ${gate}, and goes through ${doors}, which needs ${keys}.`,
  /** items/npc_bureaucrat.js 897 (Legalize It proposition, last beat). */
  bureaucratHall: "You can go back to wherever you were now: I'll set the closest Bureaucratic Hall as the destination on your map.",
});

/** The most boards a post draws (street-render.js SIGN_MAX_ARMS; this module stays free of Pixi). */
export const SIGN_ARMS = 9;

/** MapHub.as 72: CSSManager hub_map_path_color, default 0xf0f258. */
export const ROUTE_COLOR = 0xf0f258;
export const ROUTE_COLOR_CSS = '#f0f258';

/** The destinations the source routes to (GSJS line refs above). */
export const ROUTE_TARGETS = Object.freeze({
  /** quests/hell_quest.js 114-115: buildPath('LA5RPAFK9OE28GN', pc.location.tsid). */
  hellBar: 'LA5RPAFK9OE28GN',
  /** items/npc_bureaucrat.js 782 (prod): Gregarious Grange, Baeli Bray, Chego Chase. */
  bureaucraticHalls: Object.freeze(['LLI32G3NUTD100I', 'LA91JUQT2G82GUL', 'LA5I10NJDL52TKD']),
});

/**
 * Every GSJS caller that sets a route, and whether the remake plays it.
 * `wired` names the remake module that calls setRoute.
 */
export const ROUTE_SOURCES = Object.freeze([
  Object.freeze({ id: 'hell_quest', title: 'Beelzebooze', gsjs: 'quests/hell_quest.js:95-121', target: 'Panka Surazu (LA5RPAFK9OE28GN)', playable: true, wired: 'js/features/hell-tickets-feature.js' }),
  Object.freeze({ id: 'smuggling_basic', title: 'Warm and Smuggly', gsjs: 'players/inc_announcements.js:446-453, 488-495; items/contraband.js:62-78', target: "the Contraband's destination", playable: true, wired: 'js/features/smuggling-feature.js' }),
  Object.freeze({ id: 'fuelmaking_refuel_robot', title: "We're Off to See the Lizard", gsjs: 'items/npc_bureaucrat.js:768-780, 785-792', target: 'the closest Subway Station street', playable: true, wired: 'js/quest-rooms/back-alley.js' }),
  Object.freeze({ id: 'card_carrying_qualification', title: 'Legalize It', gsjs: 'items/npc_bureaucrat.js:781-792', target: 'the closest Bureaucratic Hall', playable: false, why: 'the remake runs Legalize It as one scripted instance (game.js legalizeRun) with its own route stages, so there is no street to route from' }),
  Object.freeze({ id: 'loneliness', title: 'A lonely Street Spirit', gsjs: 'players/inc_world_events.js:120-142', target: "the Street Spirit's street", playable: true, wired: 'js/features/spirit-loneliness-feature.js' }),
  Object.freeze({ id: 'vendor_quest', title: 'Meet the Merchants', gsjs: 'quests/vendor_ping_pong_part1.js offer ("Click on your map over there in the top right corner to locate him")', target: 'the nearest street where the quest\'s vendor stands', playable: true, remake: true, wired: 'js/features/vendor-npcs-feature.js' }),
  Object.freeze({ id: 'player', title: 'Your own destination (Map)', gsjs: 'main.js:137-138, 6455-6475', target: 'any street', playable: true, wired: 'js/features/map-routes-feature.js (Map: Set a destination)' }),
  Object.freeze({ id: 'tutorial_reinforcement', title: 'A Little Tutorial Reinforcement', gsjs: 'quests/tutorial_reinforcement.js:36-41 (map_dest_reached)', target: 'any destination you set', playable: false, why: 'the catalog marks the quest removed_feature (never offered); the remake still counts map_dest_reached' }),
]);

/**
 * One-way roads (player report 82): public/assets/content/one-way-roads.json
 * (tools/routes/build-one-way.mjs) lists, per street, the signposts a player cannot reach from
 * where another signpost drops them, from the street's floors, ladders and jump height. The Other
 * Drop (GLI1D5DO1671QPA) only goes down: from Level 4 East or Arjun Plunge you land on its floor,
 * 1,100 px under the next ledge, and Eastern Approach's signpost is at the top. findRoute follows
 * a street's `cut[from]` for the street it entered from, and `startCut` (startCut below) on the
 * street the route starts on. A street the file does not list, an arrival it does not know (a
 * door, a ride, a teleport) and a start with no position are two-way.
 * @param {{ streets?: Record<string, { cut?: Record<string, string[]>, reach?: Record<string, string[]> }> }} json
 * @returns {Record<string, { cut: Record<string, string[]>, reach: Record<string, string[]> }>}
 */
export function oneWayRoads(json = {}) {
  const out = {};
  for (const [k, v] of Object.entries(json?.streets || {})) {
    if (!v || typeof v !== 'object') continue;
    out[k] = { cut: { ...(v.cut || {}) }, reach: { ...(v.reach || {}) } };
  }
  return out;
}

/** A floor the avatar stands on (street-model.js isStandable: platform_pc_perm not 1 or 0). */
const standable = (p) => p && p.pc_perm !== 1 && p.pc_perm !== 0;
const floorY = (p, x) => {
  const [x1, y1, x2, y2] = p.x1 <= p.x2 ? [p.x1, p.y1, p.x2, p.y2] : [p.x2, p.y2, p.x1, p.y1];
  const at = Math.max(x1, Math.min(x2, x));
  return x2 === x1 ? (y1 + y2) / 2 : y1 + ((y2 - y1) * (at - x1)) / (x2 - x1);
};

/**
 * The floor under a point in street (world) coordinates, as tools/routes/build-one-way.mjs finds
 * the floor an arrival lands on: the highest floor at or below the feet there, else the lowest one
 * at that x, else the nearest floor end. Returns the platform's id, or ''.
 * @param {{ id: string, x1: number, y1: number, x2: number, y2: number, pc_perm?: number|null }[]} platforms
 */
export function floorBeneath(platforms, x, y) {
  let best = null;
  let bestY = 0;
  let lowest = null;
  let lowY = 0;
  let near = null;
  let nearD = Infinity;
  for (const p of platforms || []) {
    if (!standable(p)) continue;
    const lo = Math.min(p.x1, p.x2);
    const hi = Math.max(p.x1, p.x2);
    if (x >= lo - 4 && x <= hi + 4) {
      const fy = floorY(p, x);
      if (fy >= y - 10 && (!best || fy < bestY)) [best, bestY] = [p, fy];
      if (!lowest || fy > lowY) [lowest, lowY] = [p, fy];
    } else {
      for (const [px, py] of [[p.x1, p.y1], [p.x2, p.y2]]) {
        const d = Math.hypot(px - x, py - y);
        if (d < nearD) [near, nearD] = [p, d];
      }
    }
  }
  return String((best || lowest || near)?.id || '');
}

/**
 * The roads out of reach from where you stand on a one-way street (oneWayRoads `reach`: the
 * floors each listed signpost is reached from). `x`, `y` are street coordinates (street-model.js
 * screenToWorld). Returns street keys, [] when everything is in reach or nothing is known.
 * @param {{ reach?: Record<string, string[]> }|null|undefined} entry  oneWayRoads()[street]
 * @param {object[]} platforms  the street JSON's platforms
 */
export function startCut(entry, platforms, x, y) {
  if (!entry?.reach || !Number.isFinite(x) || !Number.isFinite(y)) return [];
  const floor = floorBeneath(platforms, x, y);
  if (!floor) return [];
  return Object.entries(entry.reach).filter(([, ids]) => !(ids || []).includes(floor)).map(([to]) => to).sort();
}

/**
 * The subway as route links (Austin, 2026-11-03): between every two of its surface streets, a
 * ride (js/subway.js: in at the street's subway entrance, a Red Line or Blue Line ticket, off at
 * the other stop, up its stairs). findRoute takes one when it saves more than
 * SUBWAY_RIDE_STREETS streets of walking (street-graph.js, #488).
 * @param {string[]} streets  the stations' surface street keys (js/street-jobs.js SUBWAY_STREETS)
 * @returns {Record<string, string[]>}
 */
export function subwayRides(streets = []) {
  const list = [...new Set(streets.filter(Boolean))];
  const out = {};
  for (const a of list) out[a] = list.filter((b) => b !== a);
  return out;
}

/** Whether the hop from `a` to `b` is a subway ride and no road (subwayRides). */
export function isRide(graph, rides, a, b) {
  if (!rides || !a || !b) return false;
  const ka = graphKey(graph, a) || a;
  const kb = graphKey(graph, b) || b;
  return Boolean(rides[ka]?.includes(kb)) && !hasRoad(graph, ka, kb);
}

/**
 * #480: the route sources that never ride the subway. Warm and Smuggly's run (source 'smuggling')
 * carries the package, and the gate refuses anyone carrying it (subway_gate.js 72-76, js/subway.js
 * gateRefusal 'dubious'), so its route keeps to the roads.
 */
export const NO_RIDE_SOURCES = Object.freeze(['smuggling']);

/**
 * The rides (subwayRides) a route from this source may take: none for NO_RIDE_SOURCES, and none
 * when the gate would refuse this player (R24: `refusal` is js/subway.js gateFor, the gate's own
 * answer: no Your Papers badge, or the dont_get_caught buff).
 */
export function routeRides(rides, source, refusal = null) {
  if (refusal) return null;
  return NO_RIDE_SOURCES.includes(String(source || '')) ? null : rides;
}

export function createRouteState() {
  return { route: null, previous: null, reached: 0, lastCleared: '' };
}

function normalizeRoute(route) {
  if (!route || typeof route !== 'object') return null;
  const destination = String(route.destination || '');
  if (!destination) return null;
  const path = Array.isArray(route.path) ? route.path.map(String).filter(Boolean) : null;
  return {
    destination,
    path: path && path.length ? path : null,
    source: String(route.source || 'player'),
    quest: route.quest ? String(route.quest) : '',
    setAt: Number(route.setAt) || 0,
    arrivedAt: Number(route.arrivedAt) || 0,
  };
}

/** The feature's saved slice. */
export function normalizeRouteState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  return {
    route: normalizeRoute(s.route),
    previous: normalizeRoute(s.previous),
    reached: Math.max(0, Math.floor(Number(s.reached) || 0)),
    lastCleared: String(s.lastCleared || ''),
  };
}

/** The gate's refusal in a few words, for the sentences that name a door too (ROUTE_TEXT.subwayOrDoor). */
const GATE_WORDS = Object.freeze({ papers: 'needs your papers', dubious: 'turns away journeys of dubious purpose' });

const andList = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

/**
 * Austin 2026-11-25: what stands in the way when no route you may take gets there: the subway gate
 * (`refused`, R24: { rides, text, gate, hint }, the rides it turns you back from) or locked doors
 * whose key you do not hold (street-graph.js lockedOnTheWay), or both. Names what each needs, in
 * Glitch's words where it had them. { subway, doors: [{ from, to, key }], text } or null when
 * neither would get you there (the roads are still being built, or nothing leads there).
 * @param {object} graph  a street graph (its keys are the traveller's)
 * @param {string} from
 * @param {string[]} list  the destinations
 * @param {object} ways  findRoute's options (rides, oneWay, startCut, locked)
 * @param {{ rides?: object, text?: string, gate?: string, hint?: string }|null} refused
 * @param {(tsid: string) => string} label  a street's name
 */
export function routeNeeds(graph, from, list, ways = {}, refused = null, label = (t) => t) {
  if (!from || !list?.length) return null;
  const byRide = refused?.rides ? findRoute(graph, from, list, { ...ways, rides: refused.rides }) : null;
  const byKey = lockedOnTheWay(graph, from, list, ways);
  const both = !byRide && !byKey && refused?.rides ? lockedOnTheWay(graph, from, list, { ...ways, rides: refused.rides }) : null;
  if (!byRide && !byKey && !both) return null;
  const subwayText = String(refused?.text || ROUTE_TEXT.subwayPapers);
  if (byRide && !byKey) return { subway: true, doors: [], text: subwayText };
  const doors = (byKey || both).doors;
  const where = [...new Set(doors.map((d) => label(d.from)))];
  const doorWords = `${where.length > 1 || doors.length > 1 ? 'locked doors' : 'a locked door'} on ${andList(where)}`;
  const keyIds = [...new Set(doors.map((d) => d.key))];
  const keyWords = andList(keyIds.map((id) => `a ${DOOR_KEYS[id]?.label || 'door key'}`));
  if (!byRide && !both) return { subway: false, doors, text: ROUTE_TEXT.lockedDoor(doorWords, keyWords, doors.length > 1) };
  const gate = GATE_WORDS[refused?.gate] || GATE_WORDS.papers;
  const hint = refused?.hint ? ` ${refused.hint}` : '';
  const text = byRide ? ROUTE_TEXT.subwayOrDoor(gate, doorWords, keyWords) : ROUTE_TEXT.subwayAndDoor(gate, doorWords, keyWords);
  return { subway: true, doors, text: `${text}${hint}` };
}

/**
 * buildPath + setPath. `from` is where the route starts (default: the street
 * you are on; the Back Alley passes the street you came from). `to` may list
 * several destinations: the closest one wins. With no route you may take, the subway gate you
 * would be refused at (`refused`, R24) or the locked doors you hold no key for (the graph's keys)
 * are named instead (routeNeeds: `gated`, `subway`, `doors`); `label` names the streets.
 * @returns {{ ok: boolean, state: object, route?: object, error?: string, gated?: boolean, subway?: boolean, doors?: object[] }}
 */
export function planRoute(state, graph, { from, to, source = 'player', quest = '', inHome = false, locked = undefined, rides = null, refused = null, oneWay = null, startCut = null, label = (t) => t, now = Date.now(), ...rest } = {}) {
  const s = normalizeRouteState(state);
  if (inHome) return { ok: false, state: s, error: ROUTE_TEXT.fromHome };
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!list.length) return { ok: false, state: s, error: ROUTE_TEXT.notFound };
  if (from && list.some((t) => sameStreet(t, from))) return { ok: false, state: s, error: ROUTE_TEXT.alreadyThere };
  const ways = { ...rest, locked, rides, oneWay, startCut };
  const path = from ? findRoute(graph, from, list, ways) : null;
  // R24 and Austin 2026-11-25: no way you may take, and the only ones ride the subway this
  // player's gate refuses (`refused`: { rides, text }) or go through a locked door whose key you do
  // not hold: say what each needs instead of a route the gate or the door turns back.
  const need = !path && from ? routeNeeds(graph, from, list, ways, refused, label) : null;
  if (need) return { ok: false, state: s, error: need.text, gated: true, subway: need.subway, doors: need.doors };
  // No route, but the roads would get there once built (street projects): say so (not_a_destination).
  const why = !path && from ? closedOnTheWay(graph, from, list, ways) : null;
  // Every destination still under construction: no route through its crossed arm.
  if (why?.closed) return { ok: false, state: s, error: ROUTE_TEXT.noRoad, closed: graphKey(graph, list[0]) || String(list[0]), through: [] };
  // Only closed roads in the way: no route, and which streets are still being built.
  if (why?.through) return { ok: false, state: s, error: ROUTE_TEXT.noRoad, through: why.through };
  // A route from somewhere off the graph (an instance, Hell One) still keeps its
  // destination: the GPS says "Return to world for directions" until a street on
  // the graph finds the way (GpsUI moveMoveEnded asks again on every arrival).
  const destination = path ? path[path.length - 1] : graphKey(graph, list[0]) || String(list[0]);
  const route = normalizeRoute({ destination, path: path && path.length > 1 ? path : null, source, quest, setAt: now });
  return { ok: true, state: { ...s, route, lastCleared: '' }, route };
}

/** endLocationPath / clear_location_path. `source` limits it to that owner's route. */
export function clearRoute(state, { source = '', reason = 'cleared' } = {}) {
  const s = normalizeRouteState(state);
  if (!s.route) return { cleared: false, state: s };
  if (source && s.route.source !== source) return { cleared: false, state: s };
  return { cleared: true, state: { ...s, route: null, lastCleared: reason } };
}

/**
 * TSFrontController.startLocationPath: where you are on the route and which
 * street comes next.
 * @returns {{ status: 'none'|'arrived'|'on'|'off', index: number, next: string, remaining: string[] }}
 */
export function routeStep(route, graph, currentTsid) {
  const r = normalizeRoute(route);
  if (!r) return { status: 'none', index: -1, next: '', remaining: [] };
  if (sameStreet(currentTsid, r.destination)) return { status: 'arrived', index: r.path ? r.path.length - 1 : 0, next: '', remaining: [r.destination] };
  const path = r.path || [];
  const here = graphKey(graph, currentTsid);
  const index = here ? path.indexOf(here) : -1;
  if (index > -1 && index < path.length - 1) {
    return { status: 'on', index, next: path[index + 1], remaining: path.slice(index) };
  }
  // Off the path: any later street a signpost here links to (walked from the end).
  for (let i = path.length - 1; i >= 0; i--) {
    if (here && hasRoad(graph, here, path[i])) return { status: 'on', index: -1, next: path[i], remaining: [here, ...path.slice(i)] };
  }
  return { status: 'off', index: -1, next: '', remaining: path };
}

/**
 * R34 (#538): the stations a route's subway legs use, read off the subway line (js/subway-line.js
 * stations: id, name, label, surfaceStreetTsid / connects_to, next_stop, previous_stop).
 */
function stationOnStreet(stations, graph, tsid) {
  if (!tsid) return null;
  return (stations || []).find((s) => sameStreet(s.surfaceStreetTsid, tsid) || sameStreet(s.connects_to, tsid)
    || (graph && graphKey(graph, s.surfaceStreetTsid || s.connects_to) === graphKey(graph, tsid))) || null;
}

/**
 * PURE (#538): the line that reaches `to` from `from` in fewer stops (the Red Line runs next_stop,
 * the Blue Line previous_stop: inc_transit.js transit_get_next_stop / transit_get_previous_stop).
 * A tie takes the Red Line. Returns { direction: 'forwards'|'backwards', stops } or null.
 */
export function rideLine(stations, from, to) {
  if (!from || !to || from.id === to.id) return null;
  const byId = new Map((stations || []).map((s) => [Number(s.id), s]));
  const count = (key) => {
    let at = from;
    for (let n = 1; n <= byId.size; n++) {
      at = byId.get(Number(at?.[key]));
      if (!at) return Infinity;
      if (at.id === to.id) return n;
    }
    return Infinity;
  };
  const fwd = count('next_stop');
  const back = count('previous_stop');
  if (!Number.isFinite(fwd) && !Number.isFinite(back)) return null;
  return back < fwd ? { direction: 'backwards', stops: back } : { direction: 'forwards', stops: fwd };
}

/**
 * R34 (#538): the route step wherever a subway leg takes you, one model for every view. Routes ride
 * the subway (a remake addition, subwayRides): the path holds the two surface streets and the ride
 * between them, while the player passes the surface street's entrance, the station, the train and the
 * far station. Glitch's GPS knew streets only (GpsUI.as getNextText), so each view says where the
 * thing that glows leads, in the GPS's own "Next: " line:
 * - `{ street }` on a surface street whose next hop is a ride: the station its entrance goes down to
 *   ("Next: Jutuan Central Subway Station").
 * - `{ station }` on a platform: the line to board when the ride starts here ("Next: Subway Blue
 *   Line", whichever line reaches the stop sooner, rideLine); the street up the stairs otherwise,
 *   the far station's own street included ("Next: Groddle Forest Junction"). Off the route (a stop
 *   the route does not use), 'off', for the caller to plan again from the station's street.
 * - `{ car: true, stop }` in the train (`stop` the station it last stood at): the stop to get off at
 *   ("Next: Groddle Forest Junction"), with no arrow (the train has nothing to walk to; its stop
 *   prompt asks).
 * Each step carries `say` (the words after "Next: ") and `via` ('entrance'|'board'|'stairs'|'ride')
 * on top of routeStep's fields; a step with no subway leg in it is routeStep's own.
 */
export function legStep(route, graph, where = {}, { rides = null, stations = [], lines = {}, label = (t) => t } = {}) {
  const r = normalizeRoute(route);
  if (!r) return { status: 'none', index: -1, next: '', remaining: [] };
  const path = r.path || [];
  const surface = (st) => (st ? graphKey(graph, st.surfaceStreetTsid || st.connects_to) || st.surfaceStreetTsid || st.connects_to : '');
  const ride = (a, b) => isRide(graph, rides, a, b);
  if (where.car) {
    const at = where.stop ? path.indexOf(surface(where.stop)) : -1;
    let i = -1;
    for (let k = Math.max(0, at); k < path.length - 1 && i < 0; k++) if (ride(path[k], path[k + 1])) i = k;
    for (let k = 0; k < path.length - 1 && i < 0; k++) if (ride(path[k], path[k + 1])) i = k;
    let next = i > -1 ? path[i + 1] : '';
    // No ride on the route (planned again on foot): off at the last station the route passes.
    if (!next) {
      for (let k = path.length - 1; k >= 0 && !next; k--) if (stationOnStreet(stations, graph, path[k])) [i, next] = [k - 1, path[k]];
      if (!next && stationOnStreet(stations, graph, r.destination)) next = r.destination;
    }
    const to = stationOnStreet(stations, graph, next);
    if (!to) return { status: 'off', index: -1, next: '', remaining: path };
    return { status: 'on', index: i, next, remaining: i > -1 ? path.slice(i) : [next], say: to.name || label(next), via: 'ride' };
  }
  if (where.station) {
    const here = surface(where.station);
    if (sameStreet(here, r.destination)) return { status: 'on', index: path.length - 1, next: here, remaining: [here], say: label(here), via: 'stairs' };
    const step = routeStep(r, graph, here);
    if (step.status !== 'on') return step;
    if (ride(here, step.next)) {
      const line = rideLine(stations, where.station, stationOnStreet(stations, graph, step.next));
      const name = line ? lines[line.direction] : '';
      if (name) return { ...step, say: `Subway ${name}`, via: 'board', line: line.direction };
      return { ...step, via: 'board' };
    }
    return { ...step, say: label(here), via: 'stairs' };
  }
  const step = routeStep(r, graph, where.street);
  if (step.status === 'on' && ride(where.street, step.next)) {
    const st = stationOnStreet(stations, graph, where.street);
    if (st) return { ...step, say: st.label || label(step.next), via: 'entrance' };
  }
  return step;
}

/**
 * A street finished loading. Leaving the street you arrived on clears the
 * route (GpsUI moveMoveStarted); reaching the destination counts
 * map_dest_reached (location.js 310); off the path, a new route is asked for
 * from here (GpsUI moveMoveEnded), unless you are somewhere the graph does not
 * know (homes, instances, Hell One).
 * @returns {{ state: object, events: string[] }}
 */
export function enterStreet(state, graph, currentTsid, { now = Date.now(), offWorld = false, locked = undefined, rides = null, oneWay = null, startCut = null, ...rest } = {}) {
  let s = normalizeRouteState(state);
  const events = [];
  const r = s.route;
  if (!r) return { state: s, events };
  if (r.arrivedAt && !sameStreet(currentTsid, r.destination)) {
    s = { ...s, route: null, lastCleared: 'left-destination' };
    events.push('cleared');
    return { state: s, events };
  }
  if (sameStreet(currentTsid, r.destination)) {
    if (!r.arrivedAt) {
      s = { ...s, route: { ...r, arrivedAt: now }, reached: s.reached + 1 };
      events.push('arrived');
    }
    return { state: s, events };
  }
  const step = routeStep(r, graph, currentTsid);
  // On the path, but its next road is out of reach from where you came in (a one-way street, or a
  // route saved before one-way roads were known): a new route from here, as off the path.
  const cutOff = step.status === 'on' && Boolean(startCut?.length) && startCut.includes(graphKey(graph, step.next) || step.next);
  if ((step.status === 'off' || cutOff) && !offWorld && graphKey(graph, currentTsid)) {
    const path = findRoute(graph, currentTsid, r.destination, { ...rest, locked, rides, oneWay, startCut });
    if (path && path.length > 1) {
      s = { ...s, route: { ...r, path } };
      events.push('rerouted');
    } else {
      events.push('reroute-failed');
    }
  }
  return { state: s, events };
}

/** player.js croak() 1293: the route you had is kept for after Naraka. */
export function croakRoute(state) {
  const s = normalizeRouteState(state);
  return s.route ? { ...s, previous: s.route } : s;
}

/** player.js resurrect() 1386-1398: back to the route you had before you croaked, or none. */
export function resurrectRoute(state) {
  const s = normalizeRouteState(state);
  if (s.previous) return { ...s, route: { ...s.previous, arrivedAt: 0 }, previous: null };
  return { ...s, route: null, previous: null, lastCleared: s.route ? 'resurrected' : s.lastCleared };
}

/** #104: how many of the next stops the Map's route line names before it counts the rest. */
export const ROUTE_STOPS_SHOWN = 3;

/**
 * PURE (#104, a remake addition: GpsUI.as showed only To and Next): the Map's route line for a long
 * route, the next few stops, a count of the rest, then the destination, so a route of dozens of
 * stops stays one short line: "A → B → C → … 40 more stops … → Z". Short routes are listed whole.
 * @param {string[]} stops  the stops' words in order (the destination last)
 * @returns {{ text: string, hidden: number }}
 */
export function routeStopsLine(stops, shown = ROUTE_STOPS_SHOWN) {
  const list = (stops || []).filter(Boolean);
  const keep = Math.max(1, Math.floor(Number(shown)) || ROUTE_STOPS_SHOWN);
  // Cutting saves room only when at least two stops would be counted.
  if (list.length <= keep + 2) return { text: list.join(' → '), hidden: 0 };
  const hidden = list.length - keep - 1;
  return { text: `${list.slice(0, keep).join(' → ')} → … ${hidden} more stops … → ${list[list.length - 1]}`, hidden };
}

/**
 * The GPS lines (GpsUI.as setDestinationText / getNextText).
 * @param {(tsid: string) => string} label
 */
export function gpsText(route, step, label = (t) => t) {
  const r = normalizeRoute(route);
  if (!r) return null;
  const to = `${ROUTE_TEXT.to}${label(r.destination)}`;
  if (step?.status === 'arrived') return { to: ROUTE_TEXT.arrived, next: '', arrived: true };
  // legStep's `say` (#538): what a subway leg's glowing door, gate or stop leads to.
  if (step?.status === 'on' && step.next) return { to, next: `${ROUTE_TEXT.next}${step.say || label(step.next)}`, arrived: false, ...(step.via === 'ride' ? { noArrow: true } : {}) };
  return { to, next: ROUTE_TEXT.offPath, arrived: false, offPath: true };
}

/**
 * Which signpost board on this street leads to `nextTsid`
 * (Location.getSignpostThatLinksToLocTsid). signposts: street JSON signposts
 * ({ connects: [{ tsid }] }). Returns { sign, board } indexes or null.
 * A post draws up to SIGN_ARMS boards (street-render.js SIGN_MAX_ARMS, one per number key:
 * the Sabudana Drama Towers posts have five), so the fifth is a road the GPS can light too.
 */
export function signpostToward(signposts, nextTsid) {
  if (!nextTsid) return null;
  for (let sign = 0; sign < (signposts || []).length; sign++) {
    const s = signposts[sign];
    if (!s || s.hidden) continue;
    const shown = (s.connects || []).filter((c) => c && (c.label || c.tsid)).slice(0, SIGN_ARMS);
    for (let board = 0; board < shown.length; board++) {
      const c = shown[board];
      if (!c.hidden && sameStreet(c.tsid, nextTsid)) return { sign, board };
    }
  }
  return null;
}

/**
 * Which door on this street leads to `nextTsid` (Location.getDoorThatLinksToLocTsid,
 * the loc_path_door branch of TSFrontController.startLocationPath). doors:
 * street JSON doors. Hidden doors are not drawn (client DoorView) and doors
 * with random destinations lead nowhere fixed. Returns the door index or -1.
 */
export function doorToward(doors, nextTsid) {
  if (!nextTsid) return -1;
  const list = doors || [];
  // Two doors to one room (build-signpost-graph keeps the unlocked one): an unlocked door first.
  let found = -1;
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    if (!d || d.hidden || d.destinations?.length) continue;
    const to = d.connect?.street || d.connect?.tsid;
    if (!sameStreet(to, nextTsid)) continue;
    if (!Number(d.key_id)) return i;
    if (found < 0) found = i;
  }
  return found;
}

/**
 * The path lines for one hub map (MapHub.updateLocPath): every remaining route
 * street drawn on this hub, in route order, joined end to end; the hub exit
 * (GO) to light when the route leaves this hub; the destination pin.
 * @param {string[]} remaining  route street keys from here on
 * @param {{ key: string, x1: number, y1: number, x2: number, y2: number }[]} segments  this hub's drawn streets
 * @param {(tsid: string) => string} hubOf  street key -> hub id
 * @param {string} hubId  the hub on screen
 */
export function hubRouteDrawing(remaining, segments, hubOf, hubId) {
  const byKey = new Map();
  for (const seg of segments || []) for (const a of tsidAliases(seg.key)) byKey.set(a, seg);
  const lines = [];
  const joins = [];
  let prev = null;
  let exitHub = '';
  const list = remaining || [];
  for (let i = 0; i < list.length; i++) {
    const seg = byKey.get(list[i]);
    if (!seg) {
      const h = hubOf(list[i]);
      if (prev && h && String(h) !== String(hubId) && !exitHub) exitHub = String(h);
      prev = null;
      continue;
    }
    lines.push({ key: list[i], x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 });
    if (prev) {
      // Join the closest ends of the two streets.
      const ends = (s) => [[s.x1, s.y1], [s.x2, s.y2]];
      let best = null;
      for (const [ax, ay] of ends(prev)) {
        for (const [bx, by] of ends(seg)) {
          const d = Math.hypot(ax - bx, ay - by);
          if (!best || d < best.d) best = { d, x1: ax, y1: ay, x2: bx, y2: by };
        }
      }
      if (best && best.d > 0.5) joins.push({ x1: best.x1, y1: best.y1, x2: best.x2, y2: best.y2 });
    }
    prev = seg;
  }
  const mid = (seg) => ({ x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 });
  const last = list.length ? byKey.get(list[list.length - 1]) : null;
  let pin = last ? mid(last) : null;
  let pinVia = '';
  // A door-only room in this hub (the Hell Bar, G192) is not drawn: pin the street its door is on.
  if (!pin && list.length > 1 && hubId && String(hubOf(list[list.length - 1]) || '') === String(hubId)) {
    for (let i = list.length - 2; i >= 0; i--) {
      const seg = byKey.get(list[i]);
      if (seg) {
        pin = mid(seg);
        pinVia = 'door';
        break;
      }
    }
  }
  return { lines, joins, exitHub, pin, pinVia };
}

/**
 * The way into a region whose map shows unbuilt roads (check 2026-11-25, R11, a sibling of G801).
 * A player could not find a way into Xalanga for "To Xalanga, And Beyond": its map shows 38 of its
 * 40 streets under construction, and the two open ones (Hazy Gate 3, Languid Line S) are reached
 * from Yellow Yawning in Moshi Moshi Oshilatis, which nothing on that map named. From `from` over
 * the open roads (and `opts.rides`, as a route would go): the region's nearest open street
 * (`entry`), the street before it on the way (`before`, '' when you start there) and the route.
 * Null when you are in the region already, when none of its streets is under construction (its map
 * shows every way in), or with no street to start from; { noRoad: true } when no open road gets
 * there but built roads would (the Projects sheet's Roads to a region, G801). Only a locked door
 * you hold no key for gets in (Austin 2026-11-25): the way in through it, with `doors` (the locked
 * doors on it, street-graph.js lockedOnTheWay), so Show the way says which key it needs. Glitch's
 * world was fully open, so it never needed this.
 * @param {object} graph  a street graph (js/street-graph.js), closed roads in it
 * @param {{ from: string, hubId: string, streets: string[], hubOf: (tsid: string) => string, rides?: object, oneWay?: object, startCut?: Iterable<string> }} o
 */
export function regionWayIn(graph, { from = '', hubId = '', streets = [], hubOf = () => '', ...opts } = {}) {
  const hub = String(hubId || '');
  const list = (streets || []).filter((t) => graphKey(graph, t));
  if (!from || !hub || !list.length || !graphKey(graph, from)) return null;
  if (String(hubOf(from) || '') === hub) return null;
  if (!list.some((t) => isClosed(graph, t))) return null;
  let path = findRoute(graph, from, list, opts);
  let doors = null;
  if (!path) {
    const locked = lockedOnTheWay(graph, from, list, opts);
    if (!locked) return closedOnTheWay(graph, from, list, opts) ? { noRoad: true } : null;
    ({ path, doors } = locked);
  }
  const at = path.findIndex((t) => String(hubOf(t) || '') === hub);
  if (at < 0) return null;
  return { entry: path[at], before: at > 0 ? path[at - 1] : '', path, ...(doors ? { doors } : {}) };
}
