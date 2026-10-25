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
 * locked ones listed in `doorKeys`). routeGraph() joins them, so a route can
 * end inside a door-only room (the Hell Bar behind Panka Surazu, Vicar's
 * Peak). On a street the client looks for a signpost to the next street first
 * and a door second (TSFrontController.startLocationPath 1791-1799,
 * loc_path_door; Location.getDoorThatLinksToLocTsid), and so do
 * signpostToward() / doorToward() here. A locked door is taken only when no
 * other way exists. Unlike player.js, resurrecting forgets the stored route
 * once it is restored (the source kept previous_map_path for ever and could
 * restore a stale one after a later croak).
 */

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
  /** GpsUI.as moveMoveEnded 347-352 growl. */
  rerouteFailed: 'Creating path failed: Path not found',
  /** items/contraband.js check_address 71. */
  contrabandOffPath: 'Hmm. You seem to be off the path right now. Your contraband is temporarily confused about where it needs to go.',
  /** items/npc_bureaucrat.js 897 (Legalize It proposition, last beat). */
  bureaucratHall: "You can go back to wherever you were now: I'll set the closest Bureaucratic Hall as the destination on your map.",
});

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
  Object.freeze({ id: 'loneliness', title: 'A lonely Street Spirit', gsjs: 'players/inc_world_events.js:120-142', target: "the Street Spirit's street", playable: false, why: 'the remake has no loneliness world event (js/street-spirits.js notes it is not built)' }),
  Object.freeze({ id: 'player', title: 'Your own destination (Map)', gsjs: 'main.js:137-138, 6455-6475', target: 'any street', playable: true, wired: 'js/features/map-routes-feature.js (Map: Set a destination)' }),
  Object.freeze({ id: 'tutorial_reinforcement', title: 'A Little Tutorial Reinforcement', gsjs: 'quests/tutorial_reinforcement.js:36-41 (map_dest_reached)', target: 'any destination you set', playable: false, why: 'the catalog marks the quest removed_feature (never offered); the remake still counts map_dest_reached' }),
]);

/** L/G (and LLI/GLI, LIF/GIF) aliases of a TSID. */
export function tsidAliases(tsid) {
  const t = String(tsid || '');
  if (!t) return [];
  const out = new Set([t]);
  if (t.startsWith('L')) out.add(`G${t.slice(1)}`);
  if (t.startsWith('G')) out.add(`L${t.slice(1)}`);
  return [...out];
}

/** The graph key for a TSID (the street-index key), or null. */
export function graphKey(graph, tsid) {
  if (!graph || !tsid) return null;
  for (const alias of tsidAliases(tsid)) if (Object.prototype.hasOwnProperty.call(graph, alias)) return alias;
  return null;
}

export const sameStreet = (a, b) => Boolean(a && b) && String(a).slice(1) === String(b).slice(1);

/**
 * The route graph from signpost-graph.json: signpost and door neighbours in
 * one adjacency map, plus the locked door edges ("from>to" keys) that a route
 * avoids while it can (G192).
 * @param {{ streets?: Record<string, string[]>, doors?: Record<string, string[]>, doorKeys?: Record<string, number> }} json
 * @returns {{ graph: Record<string, string[]>, doors: Record<string, string[]>, locked: Set<string> }}
 */
export function routeGraph(json = {}) {
  const graph = {};
  for (const [k, v] of Object.entries(json?.streets || {})) graph[k] = [...(v || [])];
  const doors = {};
  for (const [k, v] of Object.entries(json?.doors || {})) {
    doors[k] = [...(v || [])];
    const out = new Set(graph[k] || []);
    for (const to of v || []) out.add(to);
    graph[k] = [...out];
    for (const to of v || []) graph[to] ||= [];
  }
  return { graph, doors, locked: new Set(Object.keys(json?.doorKeys || {})) };
}

/**
 * Shortest route over visible signposts (apiFindGlobalPathX, or
 * apiFindShortestGlobalPath when `to` lists several streets). Returns the
 * street keys from `from` to the destination inclusive, [from] when you are
 * already there, or null. `blocked` lists streets whose road is closed
 * (street projects, js/street-jobs.js closedStreets): the route goes round
 * them when it can, and through them only when there is no other way.
 * `locked` lists door edges ("from>to", routeGraph) that need a key: the
 * route takes one only when nothing else gets there (G192).
 * @param {Record<string, string[]>} graph
 * @param {string} from
 * @param {string|string[]} to
 * @param {{ blocked?: Iterable<string>, locked?: Set<string>|null }} [opts]
 */
export function findRoute(graph, from, to, { blocked = null, locked = null } = {}) {
  const start = graphKey(graph, from);
  if (!start) return null;
  const targets = new Set((Array.isArray(to) ? to : [to]).map((t) => graphKey(graph, t)).filter(Boolean));
  if (!targets.size) return null;
  if (targets.has(start)) return [start];
  const closed = new Set();
  for (const t of blocked || []) for (const a of tsidAliases(t)) closed.add(a);
  const keyed = locked && locked.size ? locked : null;
  const none = new Set();
  return (
    bfs(graph, start, targets, closed, keyed) ||
    (keyed ? bfs(graph, start, targets, closed, null) : null) ||
    (closed.size ? bfs(graph, start, targets, none, keyed) : null) ||
    (closed.size && keyed ? bfs(graph, start, targets, none, null) : null)
  );
}

function bfs(graph, start, targets, closed, locked) {
  const prev = new Map([[start, null]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const next of graph[cur] || []) {
      if (prev.has(next)) continue;
      if (locked && locked.has(`${cur}>${next}`)) continue;
      if (closed.has(next) && !targets.has(next)) continue;
      prev.set(next, cur);
      if (targets.has(next)) {
        const path = [next];
        for (let at = cur; at != null; at = prev.get(at)) path.unshift(at);
        return path;
      }
      queue.push(next);
    }
  }
  return null;
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

/**
 * buildPath + setPath. `from` is where the route starts (default: the street
 * you are on; the Back Alley passes the street you came from). `to` may list
 * several destinations: the closest one wins.
 * @returns {{ ok: boolean, state: object, route?: object, error?: string }}
 */
export function planRoute(state, graph, { from, to, source = 'player', quest = '', inHome = false, blocked = null, locked = null, now = Date.now() } = {}) {
  const s = normalizeRouteState(state);
  if (inHome) return { ok: false, state: s, error: ROUTE_TEXT.fromHome };
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!list.length) return { ok: false, state: s, error: ROUTE_TEXT.notFound };
  if (from && list.some((t) => sameStreet(t, from))) return { ok: false, state: s, error: ROUTE_TEXT.alreadyThere };
  const path = from ? findRoute(graph, from, list, { blocked, locked }) : null;
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
  const links = new Set(here ? graph?.[here] || [] : []);
  for (let i = path.length - 1; i >= 0; i--) {
    if (links.has(path[i])) return { status: 'on', index: -1, next: path[i], remaining: [here, ...path.slice(i)] };
  }
  return { status: 'off', index: -1, next: '', remaining: path };
}

/**
 * A street finished loading. Leaving the street you arrived on clears the
 * route (GpsUI moveMoveStarted); reaching the destination counts
 * map_dest_reached (location.js 310); off the path, a new route is asked for
 * from here (GpsUI moveMoveEnded), unless you are somewhere the graph does not
 * know (homes, instances, Hell One).
 * @returns {{ state: object, events: string[] }}
 */
export function enterStreet(state, graph, currentTsid, { now = Date.now(), offWorld = false, blocked = null, locked = null } = {}) {
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
  if (step.status === 'off' && !offWorld && graphKey(graph, currentTsid)) {
    const path = findRoute(graph, currentTsid, r.destination, { blocked, locked });
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

/**
 * The GPS lines (GpsUI.as setDestinationText / getNextText).
 * @param {(tsid: string) => string} label
 */
export function gpsText(route, step, label = (t) => t) {
  const r = normalizeRoute(route);
  if (!r) return null;
  const to = `${ROUTE_TEXT.to}${label(r.destination)}`;
  if (step?.status === 'arrived') return { to: ROUTE_TEXT.arrived, next: '', arrived: true };
  if (step?.status === 'on' && step.next) return { to, next: `${ROUTE_TEXT.next}${label(step.next)}`, arrived: false };
  return { to, next: ROUTE_TEXT.offPath, arrived: false, offPath: true };
}

/**
 * Which signpost board on this street leads to `nextTsid`
 * (Location.getSignpostThatLinksToLocTsid). signposts: street JSON signposts
 * ({ connects: [{ tsid }] }). Returns { sign, board } indexes or null.
 * Boards past the fourth are not drawn (street-render.js shows four arms).
 */
export function signpostToward(signposts, nextTsid) {
  if (!nextTsid) return null;
  for (let sign = 0; sign < (signposts || []).length; sign++) {
    const s = signposts[sign];
    if (!s || s.hidden) continue;
    const shown = (s.connects || []).filter((c) => c && (c.label || c.tsid)).slice(0, 4);
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
