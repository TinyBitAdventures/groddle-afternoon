/**
 * Map routes as a feature module (register row G177; rules and source notes
 * in js/map-routes.js).
 *
 * - A quest step (or you, from the Map) sets a destination; the route runs
 *   over visible signposts from the street you are on.
 * - The GPS (glitch-client GpsUI.as), top right of the street: an arrow that
 *   points at the next signpost, "To: <destination>" and "Next: <street>",
 *   "You Have Arrived!" on the destination, "Return to world for directions"
 *   off the graph, and a close button (clear_location_path).
 * - On the street you are on, the signpost board that leads to the next
 *   street glows in the map path colour (0xf0f258, MapHub.as 72), or, when
 *   no signpost leads there, the door that does (loc_path_door, G192).
 * - Clicking the GPS arrow walks you to that signpost or door and takes it
 *   (GpsUI.as onArrowClick 96-112: startUserInitiatedPath, and the signpost
 *   board it set as interaction_sign goes on arrival, SignpostView.tryFocus
 *   404-412). At the destination it closes the route, as the close button does.
 * - The Map draws the rest of the route over the hub, pins the destination
 *   and lights the GO exit when the route leaves the hub (MapHub.updateLocPath).
 *   Its card names the destination and the route, clears it, and switches
 *   the next street click to "set as destination" (main.js
 *   get_path_to_location 137, doMapGetPath 6455).
 * - Leaving the street you arrived on clears the route; croaking keeps the
 *   route for later and resurrecting puts it back (player.js 1293, 1386-1398).
 *   A quest's route also goes when that quest leaves the log (done or
 *   abandoned), and the owner can clear it (Warm and Smuggly).
 *
 * Other modules set and clear routes through the feature host, so they need
 * no import:
 *   engine.query('mapRoute', 'set', { to, from, source, quest }, engine)  -> { ok, error, route }
 *   engine.query('mapRoute', 'clear', { source, reason }, engine)          -> { cleared }
 *   engine.query('mapRoute', 'get', null, engine)                         -> route | null
 *
 * QA (see tests/map-routes.test.js):
 *   &routedemo=<tsid>        set a player route from the street you load on
 *   &routeautoplay=1         walk the route: stand at each highlighted signpost
 *                            or door (&routestepms=N, default 2500), then travel on
 *   &routeautoplay=arrow     walk the route by clicking the GPS arrow on each street
 * Canvas data: routeActive, routeTo, routeDest, routeNext, routeStatus,
 * routePath, routeSource, routeQuest, routeSign, routeDoor, routeVia,
 * routeWalk, routeReached, routeCleared, routeMapLines, routeMapExit,
 * routeMapPin, routeMode, routeRooms (the rooms behind doors listed for the
 * Map's hub while "Set a destination" is on, G198), routeDoorGlow
 * (edge|outline:<w>x<h>, G198), routeGlowLayer (untinted|with-door: where
 * the door glow sits, G200).
 */

import { STREET_INDEX } from '../street-loader.js?v=d6cbbd5c';
import { hellFeature } from './hell-feature.js?v=6825f033';
import {
  ROUTE_COLOR,
  ROUTE_COLOR_CSS,
  ROUTE_TEXT,
  clearRoute,
  createRouteState,
  croakRoute,
  doorRooms,
  doorToward,
  enterStreet,
  gpsText,
  hubRouteDrawing,
  normalizeRouteState,
  planRoute,
  resurrectRoute,
  routeGraph,
  routeStep,
  sameStreet,
  tsidAliases,
} from '../map-routes.js?v=3e8f84ad';

export const MAP_ROUTES_FEATURE_ID = 'map-routes';
const GRAPH_URL = 'assets/content/signpost-graph.json?v=g198-1';

let state = createRouteState();
let graph = null;
/** Locked door edges ("from>to"): a route takes one only when it must (G192). */
let lockedDoors = null;
/** Rooms behind doors that no hub map draws (map-routes.js doorRooms, G198). */
let rooms = [];
let graphPromise = null;
/**
 * What leads on from this street: a signpost board or a door, glowing.
 * { kind: 'sign'|'door', view, glow, key, board?, target?, x, y }
 */
let highlight = null;
/** The GPS arrow's walk (onArrowClick): { x, kind, key, startedAt, lastX, lastMoveAt, dir }. */
let walk = null;
let gps = null;
let lastDead = null;
let pickMode = false;
let lastPublish = 0;
let lastLook = 0;
let lastHudKey = '';
let auto = { at: 0, key: '' };
let demoDone = false;
let canvasBound = false;

/* ------------------------------------------------------------ helpers */

function loadGraph() {
  if (graph) return Promise.resolve(graph);
  graphPromise ||= fetch(GRAPH_URL)
    .then((r) => r.json())
    .then((json) => {
      const built = routeGraph(json);
      graph = built.graph;
      lockedDoors = built.locked;
      rooms = doorRooms(json);
      return graph;
    })
    .catch(() => {
      graph = {};
      return graph;
    });
  return graphPromise;
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function indexMeta(tsid) {
  const streets = STREET_INDEX.streets || {};
  for (const a of tsidAliases(tsid)) if (streets[a]) return streets[a];
  return null;
}
const label = (tsid) => indexMeta(tsid)?.label || tsid || '';
const hubOf = (tsid) => String(indexMeta(tsid)?.hubId || '');
const hubName = (tsid) => indexMeta(tsid)?.hubName || '';

function offWorld(engine) {
  return Boolean(engine.homeContext?.().inHome || engine.transientInstance?.());
}

function currentStep(engine) {
  if (!state.route) return { status: 'none', index: -1, next: '', remaining: [] };
  if (offWorld(engine)) return { status: 'off', index: -1, next: '', remaining: state.route.path || [] };
  return routeStep(state.route, graph || {}, engine.streetTsid);
}

/** Streets still under construction (street-jobs-feature closedRoads): routes go round them. */
function closedRoads(engine) {
  return engine.query?.('closedRoads', engine) || null;
}

function questActive(engine, quest) {
  return Boolean(engine.questState?.active?.[quest]);
}

/* ------------------------------------------------------------ set / clear */

function setRoute(engine, opts = {}) {
  const from = opts.from || (offWorld(engine) ? '' : engine.streetTsid);
  const res = planRoute(state, graph || {}, {
    from,
    to: opts.to,
    source: opts.source || 'player',
    quest: opts.quest || '',
    inHome: !opts.from && Boolean(engine.homeContext?.().inHome),
    blocked: closedRoads(engine),
    locked: lockedDoors,
  });
  engine.setData?.('routeLast', res.ok ? `set:${res.route.source}` : res.error);
  if (!res.ok) return res;
  state = res.state;
  engine.save?.();
  refresh(engine);
  redrawOpenMap(engine);
  return res;
}

/** A route set or cleared while the Map is open: draw it again. */
function redrawOpenMap(engine) {
  if (typeof document === 'undefined') return;
  const panel = document.getElementById('map-panel');
  if (panel && !panel.hidden) engine.openMap?.();
}

function dropRoute(engine, opts = {}) {
  const res = clearRoute(state, opts);
  if (!res.cleared) return res;
  state = res.state;
  engine.save?.();
  refresh(engine);
  redrawOpenMap(engine);
  return res;
}

/* ------------------------------------------------------------ signpost glow */

function clearHighlight() {
  if (highlight?.glow && !highlight.glow.destroyed) {
    highlight.glow.parent?.removeChild(highlight.glow);
    highlight.glow.destroy({ children: true });
  }
  highlight = null;
}

/** The door targets on this street (features/doors-feature.js registers them as street_door). */
function doorTargets(engine) {
  return (engine.interactables || []).filter((t) => t?.classId === 'street_door' && t.door && t.sprite && !t.sprite.destroyed);
}

/**
 * Glow what leads to `next`: a signpost board first, a door second
 * (TSFrontController.startLocationPath 1789-1799: loc_path_signpost, else loc_path_door).
 */
function placeHighlight(engine, next) {
  const key = next ? `${engine.streetTsid}>${next}` : '';
  if (highlight && highlight.key === key && highlight.glow && !highlight.glow.destroyed) return;
  clearHighlight();
  if (!next) return;
  if (placeSignGlow(engine, next, key)) return;
  placeDoorGlow(engine, next, key);
}

/** The unfiltered container the door glow sits in (G200, routeGlowLayer). */
let glowLayer = null;

/**
 * G200: entityLayer carries the street's middleground colour matrix (game.js
 * enterStreet sets bgLayer.middlegroundMatrix on it, street-render.js
 * glitchLayerMatrix), so a glow drawn there took the street's colour: on
 * Naraka's red the 0xf0f258 halo round the Hell Bar door read orange. The
 * glow goes in its own unfiltered container in the world instead, directly
 * under entityLayer: above every street layer, below the door art and the
 * rest of the entity plane, so the art still covers its middle and only the
 * halo shows. Signpost glows need nothing: signposts sit in the street root,
 * outside the tinted layers. Null when entityLayer has no parent (tests):
 * the glow then goes beside the door art, as before.
 */
function routeGlowLayer(engine) {
  const ents = engine.entityLayer;
  const world = ents?.parent;
  const { PIXI } = engine;
  if (!world || !PIXI?.Container || typeof world.getChildIndex !== 'function') return null;
  if (!glowLayer || glowLayer.destroyed) {
    glowLayer = new PIXI.Container();
    glowLayer.label = 'route-glow-layer';
    glowLayer.eventMode = 'none';
  }
  if (glowLayer.parent !== world || world.getChildIndex(glowLayer) !== world.getChildIndex(ents) - 1) {
    glowLayer.parent?.removeChild(glowLayer);
    world.addChildAt(glowLayer, world.getChildIndex(ents));
  }
  // Same space as the door art: entityLayer sits at the world origin, but follow it if it moves.
  glowLayer.x = Number(ents.x) || 0;
  glowLayer.y = Number(ents.y) || 0;
  return glowLayer;
}

/** The door glow's reach past the art's edge, in world px (G198). */
const DOOR_GLOW_PAD = 7;
const DOOR_GLOW_BLUR = 6;
/**
 * G200: alpha gain after the blur. Out of the tint, the blurred halo's own
 * alpha (about 0.3 a few px out) over Naraka's dark red read olive, not the
 * route colour; the street tint had been brightening it. Colour unchanged.
 */
const DOOR_GLOW_GAIN = 1.75;

/**
 * G198: the door glows along its own edges. Before, a filled 0xf0f258 box the
 * size of the door rect sat behind it, and the Hell Bar's storefront door
 * (door_asset_hell_bar_entrance_01a, 350x298) turned into a yellow block.
 * Now a copy of the door art, flat 0xf0f258 (ColorMatrixFilter) and blurred,
 * sits just behind it a few px larger, so only a halo round the art shows.
 * Without a texture (a fake in tests) it is a thin outline the size of the art.
 */
function doorEdgeGlow(PIXI, sprite, w, h) {
  if (PIXI.Sprite && PIXI.ColorMatrixFilter && sprite.texture) {
    const glow = new PIXI.Sprite(sprite.texture);
    glow.label = 'route-door-glow';
    glow.anchor?.set?.(sprite.anchor?.x ?? 0.5, sprite.anchor?.y ?? 1);
    const flat = new PIXI.ColorMatrixFilter();
    const c = [(ROUTE_COLOR >> 16) & 255, (ROUTE_COLOR >> 8) & 255, ROUTE_COLOR & 255].map((v) => v / 255);
    // Every pixel the route colour, alpha kept (Pixi's offsets are 0-1, street-render.js 401).
    flat.matrix = [0, 0, 0, 0, c[0], 0, 0, 0, 0, c[1], 0, 0, 0, 0, c[2], 0, 0, 0, 1, 0];
    const gain = new PIXI.ColorMatrixFilter();
    gain.matrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, DOOR_GLOW_GAIN, 0];
    glow.filters = [flat, new PIXI.BlurFilter({ strength: DOOR_GLOW_BLUR, quality: 3 }), gain];
    return glow;
  }
  const glow = new PIXI.Graphics();
  glow.label = 'route-door-glow';
  glow.roundRect(-w / 2 - 3, -h - 3, w + 6, h + 6, 8).stroke({ color: ROUTE_COLOR, width: 4, alpha: 0.9 });
  return glow;
}

/** Keep the art-shaped glow on the door: doors-feature sizes the art once its texture loads (applyRect). */
function syncDoorGlow(hl) {
  const { glow, view } = hl || {};
  if (!glow || glow.destroyed || !view || view.destroyed || !glow.texture) return;
  const w = Math.abs(Number(view.width)) || 1;
  const h = Math.abs(Number(view.height)) || 1;
  const sx = Number(view.scale?.x) || 1;
  const sy = Number(view.scale?.y) || 1;
  glow.scale?.set?.(sx * (1 + (2 * DOOR_GLOW_PAD) / w), sy * (1 + DOOR_GLOW_PAD / h));
  glow.rotation = view.rotation || 0;
  glow.x = view.x;
  glow.y = view.y + DOOR_GLOW_PAD * 0.25;
}

function placeDoorGlow(engine, next, key) {
  const targets = doorTargets(engine);
  const at = doorToward(targets.map((t) => t.door), next);
  if (at < 0) return false;
  const target = targets[at];
  const { PIXI } = engine;
  const sprite = target.sprite;
  const door = target.door;
  // The door's art as drawn (doors-feature applyRect: door.w x door.h).
  const w = Math.max(24, Number(door.w) || Math.abs(Number(sprite.width)) || 60);
  const h = Math.max(40, Number(door.h) || Math.abs(Number(sprite.height)) || 110);
  const glow = doorEdgeGlow(PIXI, sprite, w, h);
  glow.x = sprite.x;
  glow.y = sprite.y;
  // Just behind the door art (doors-feature DOOR_Z 3): under the whole entity plane, untinted (G200),
  // or beside the art when there is no world to hold the layer.
  glow.zIndex = (Number(sprite.zIndex) || 3) - 0.5;
  const layer = sprite.parent === engine.entityLayer ? routeGlowLayer(engine) : null;
  (layer || sprite.parent || engine.entityLayer).addChild(glow);
  engine.setData?.('routeGlowLayer', layer ? 'untinted' : 'with-door');
  highlight = { kind: 'door', view: sprite, glow, key, target, door, x: sprite.x, y: sprite.y - h / 2, w, h };
  syncDoorGlow(highlight);
  engine.setData?.('routeDoorGlow', `${glow.texture ? 'edge' : 'outline'}:${Math.round(w)}x${Math.round(h)}`);
  return true;
}

function placeSignGlow(engine, next, key) {
  const views = engine.signViews || [];
  const { PIXI } = engine;
  for (const view of views) {
    if (!view || view.destroyed || view.visible === false) continue;
    const board = (view.signBoards || []).find((b) => sameStreet(b.connection?.tsid, next));
    if (!board) continue;
    const scale = Number(view.signScale) || 1;
    const glow = new PIXI.Container();
    glow.label = 'route-sign-glow';
    glow.scale.set(scale);
    const arm = new PIXI.Graphics();
    const hit = board.hitArea || { x: 0, y: -15, width: 120, height: 30 };
    arm.roundRect(hit.x - 7, hit.y - 6, hit.width + 14, hit.height + 12, 8).fill({ color: ROUTE_COLOR, alpha: 1 });
    arm.x = board.x;
    arm.y = board.y;
    arm.rotation = board.rotation || 0;
    arm.filters = [new PIXI.BlurFilter({ strength: 8, quality: 3 })];
    glow.addChild(arm);
    // Behind the post and arms: the post's own art stays on top.
    view.addChildAt(glow, 0);
    highlight = { kind: 'sign', view, glow, key, board: board.index, connection: board.connection, x: view.x, y: view.y - 60 };
    return true;
  }
  return false;
}

/* ------------------------------------------------------------ GPS */

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById('map-routes-style')) return;
  const style = document.createElement('style');
  style.id = 'map-routes-style';
  style.textContent = `
.route-gps{position:absolute;top:10px;right:10px;z-index:var(--z-hud);display:grid;grid-template-columns:30px 1fr auto;gap:var(--sp-3);align-items:center;
  max-width:min(300px,42%);padding:5px var(--sp-3) 5px var(--sp-4);border:1px solid var(--border-strong);border-radius:var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-xs);background:color-mix(in srgb, var(--surface-card) 94%, transparent);
  box-shadow:var(--shadow-2);color:var(--c-green-43);font:700 var(--fs-md)/var(--lh-snug) var(--font-ui);pointer-events:auto}
.route-gps[hidden]{display:none}
@media (max-width:700px){.route-gps{top:46px;max-width:calc(100% - 20px)}}
.route-gps-arrow{width:28px;height:28px;display:grid;place-items:center;padding:0;border:0;border-radius:var(--radius-round);background:${ROUTE_COLOR_CSS};box-shadow:inset 0 0 0 2px var(--c-gold-58);cursor:pointer}
.route-gps-arrow:hover,.route-gps-arrow:focus-visible{box-shadow:inset 0 0 0 2px var(--c-gold-58),0 0 0 3px color-mix(in srgb, var(--c-yellow-93) 55%, transparent);outline:none}
.route-gps-arrow.walking{box-shadow:inset 0 0 0 2px var(--c-green-43),0 0 0 3px color-mix(in srgb, var(--c-green-43) 35%, transparent)}
.route-gps-arrow svg{transition:transform .15s linear}
.route-gps-arrow.arrived{background:var(--c-lime-90);box-shadow:inset 0 0 0 2px var(--c-lime-60)}
.route-gps-text{min-width:0}
.route-gps-to{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--c-green-43);background:none;border:0;padding:0;font:inherit;text-align:left;cursor:pointer}
.route-gps-to:hover{text-decoration:underline}
.route-gps-next{display:block;font-weight:400;font-size:var(--fs-sm);color:var(--c-sand-44);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.route-gps-next.off{font-style:italic}
.route-gps-x{border:0;background:none;color:var(--c-sand-60);font:700 var(--fs-lg)/var(--lh-none) var(--font-ui);cursor:pointer;padding:var(--sp-1) var(--sp-2);align-self:start;opacity:.6}
.route-gps-x:hover{opacity:1}
.map-route-card{padding:var(--sp-3) var(--sp-5);border-radius:var(--radius-lg);background:var(--c-cream-99b);box-shadow:0 2px 8px color-mix(in srgb, var(--c-black) 12%, transparent);margin:0 0 var(--sp-4);display:flex;gap:var(--sp-5);align-items:center;flex-wrap:wrap;font-size:var(--fs-md)}
.map-route-card strong{font-size:var(--fs-base)}
.map-route-card .map-route-icon{width:30px;height:30px;object-fit:contain;flex:none}
.map-route-card .map-route-swatch{width:22px;height:8px;border-radius:var(--radius-xs);background:${MAP_ROUTE_CSS};box-shadow:0 0 0 1.5px var(--c-brown-31);flex:none}
.map-route-card .map-route-body{flex:1 1 220px;min-width:0}
.map-route-card button{font:700 var(--fs-sm) var(--font-ui);padding:3px var(--sp-4);border-radius:var(--radius-md);border:1px solid var(--c-gold-74);background:var(--surface-bright);color:var(--c-green-43);cursor:pointer}
.map-route-card button[aria-pressed="true"]{background:${ROUTE_COLOR_CSS};border-color:var(--c-gold-58)}
.map-route-rooms{flex:1 1 100%;display:flex;flex-wrap:wrap;gap:var(--sp-2) var(--sp-3);align-items:center;padding-top:var(--sp-2);border-top:1px dashed var(--c-gold-84)}
.map-route-rooms-head{font-weight:700;color:var(--c-sand-44);margin-right:var(--sp-1)}
.map-route-rooms button{font-weight:400}
.map-route-rooms button.locked::after{content:" (key)";color:var(--c-sand-60)}
.map-route-line{fill:none;stroke:${MAP_ROUTE_CSS};stroke-width:8;stroke-linecap:round;pointer-events:none}
.map-route-under{fill:none;stroke:var(--c-brown-31);stroke-width:13;stroke-linecap:round;stroke-opacity:.7;pointer-events:none}
.map-route-ants{fill:none;stroke:var(--text-on-dark);stroke-width:2;stroke-dasharray:6 9;stroke-linecap:round;pointer-events:none;animation:mapRouteAnts 1.1s linear infinite}
@keyframes mapRouteAnts{to{stroke-dashoffset:-30}}
@media (prefers-reduced-motion: reduce){.map-route-ants{animation:none}}
.map-route-pin{fill:${MAP_ROUTE_CSS};stroke:var(--c-brown-31);stroke-width:2.5;pointer-events:none}
.map-route-exit{fill:none;stroke:${MAP_ROUTE_CSS};stroke-width:6;pointer-events:none}
.hub-map-svg.route-picking .map-street{cursor:crosshair}
`;
  document.head.appendChild(style);
}

/**
 * The remake's Map already draws every street you can travel to in the source
 * path yellow (style.css .map-seg.travelable #f0e86a), so the route on the Map
 * is orange with a dark edge. The GPS and the signpost glow keep 0xf0f258.
 */
const MAP_ROUTE_CSS = '#ff9326';

const ARROW_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 7.2h8.5V3.5L17 9l-6.5 5.5v-3.7H2z" fill="#4a3d10"/></svg>';
const TICK_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9.5l4 4L15.5 5" fill="none" stroke="#3d6a22" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function ensureGps(engine) {
  if (typeof document === 'undefined') return null;
  if (gps?.el?.isConnected) return gps;
  const host = document.getElementById('street-nameplate')?.parentElement;
  if (!host) return null;
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'route-gps';
  el.id = 'route-gps';
  el.hidden = true;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Map route');
  el.innerHTML = `<button type="button" class="route-gps-arrow" aria-label="Walk to the next signpost" title="Walk to the next signpost">${ARROW_SVG}</button>
    <span class="route-gps-text"><button type="button" class="route-gps-to" title="Open the Map"></button><span class="route-gps-next"></span></span>
    <button type="button" class="route-gps-x" aria-label="Clear this route" title="Clear this route">×</button>`;
  host.appendChild(el);
  el.querySelector('.route-gps-x').addEventListener('click', () => {
    dropRoute(engine, { reason: 'closed' });
  });
  el.querySelector('.route-gps-to').addEventListener('click', () => {
    if (!state.route) return;
    engine.openMap?.(hubOf(state.route.destination) || undefined);
  });
  el.querySelector('.route-gps-arrow').addEventListener('click', () => arrowClick(engine));
  gps = { el, arrow: el.querySelector('.route-gps-arrow'), to: el.querySelector('.route-gps-to'), next: el.querySelector('.route-gps-next'), angle: null };
  return gps;
}

function renderGps(engine, step) {
  const g = ensureGps(engine);
  if (!g) return;
  const text = gpsText(state.route, step, label);
  if (!text) {
    g.el.hidden = true;
    lastHudKey = '';
    return;
  }
  const key = `${text.to}|${text.next}|${text.arrived}`;
  g.el.hidden = false;
  if (key === lastHudKey) return;
  lastHudKey = key;
  g.to.textContent = text.to;
  g.next.textContent = text.next;
  g.next.classList.toggle('off', Boolean(text.offPath));
  g.next.hidden = !text.next;
  g.arrow.classList.toggle('arrived', text.arrived);
  g.arrow.innerHTML = text.arrived ? TICK_SVG : ARROW_SVG;
  g.arrow.style.visibility = text.offPath ? 'hidden' : '';
  const tip = text.arrived ? 'Close the route' : 'Walk to the next signpost';
  g.arrow.title = tip;
  g.arrow.setAttribute('aria-label', tip);
  g.angle = null;
}

/** GpsUI.updateArrow: rotate toward the next signpost (or door). */
function pointArrow(engine) {
  if (!gps || gps.el.hidden || !highlight?.view || highlight.view.destroyed || !engine.player) return;
  const svg = gps.arrow.querySelector('svg');
  if (!svg) return;
  const p = engine.player;
  const deg = (Math.atan2(highlight.y - (p.y - 40), highlight.x - p.x) * 180) / Math.PI;
  const rounded = Math.round(deg / 3) * 3;
  if (rounded === gps.angle) return;
  gps.angle = rounded;
  svg.style.transform = `rotate(${rounded}deg)`;
}

/* ------------------------------------------------------------ the GPS arrow walk */

/**
 * GpsUI.as onArrowClick 96-112: with a next street, walk to the signpost (or
 * door) that leads there and take it (startUserInitiatedPath; on arrival
 * SignpostView.tryFocus 404-412 goes through the board set as
 * interaction_sign, and a door path ends by entering the door). At the
 * destination the arrow closes the route (onCloseClick).
 *
 * The walk holds the arrow key toward the post, as you would, so the avatar
 * walks with its own speed, animation, walls and energy. Any key or click of
 * yours takes over and ends it; so does a wall or a ledge in the way.
 */
const WALK_KEY = { [-1]: 'ArrowLeft', 1: 'ArrowRight' };
/** Close enough to use the post or the door (world px). */
const WALK_REACH = 26;
/** No headway for this long (a wall, a ledge): stop and leave you there. */
const WALK_STALL_MS = 1500;
const WALK_MAX_MS = 45000;
let walkInputBound = false;

function sendWalkKey(type, key) {
  if (typeof window === 'undefined' || typeof KeyboardEvent === 'undefined') return;
  window.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true }));
}

function bindWalkInput() {
  if (walkInputBound || typeof window === 'undefined') return;
  walkInputBound = true;
  const takeOver = (e) => {
    if (!walk || !e.isTrusted) return;
    if (e.target?.closest?.('.route-gps-arrow')) return;
    stopWalk(walk.engine, 'input');
  };
  window.addEventListener('keydown', takeOver, true);
  window.addEventListener('pointerdown', takeOver, true);
}

function stopWalk(engine, reason = '') {
  if (!walk) return;
  const held = walk.dir ? WALK_KEY[walk.dir] : '';
  walk = null;
  if (held) sendWalkKey('keyup', held);
  gps?.arrow?.classList.remove('walking');
  if (reason) engine?.setData?.('routeWalkEnd', reason);
}

function startWalk(engine, now) {
  stopWalk(engine);
  if (!highlight || !engine.player) return false;
  bindWalkInput();
  const x = highlight.kind === 'door' ? highlight.x : highlight.view.x;
  walk = { engine, kind: highlight.kind, key: highlight.key, x, startedAt: now, lastX: engine.player.x, lastMoveAt: now, dir: 0 };
  gps?.arrow?.classList.add('walking');
  engine.setData?.('routeWalkEnd', '');
  return true;
}

/** Take the highlighted signpost board or door (the end of the walk, or QA autoplay). */
function takeHop(engine) {
  if (!highlight || !state.route) return;
  const step = currentStep(engine);
  if (highlight.kind === 'door') {
    engine.setData?.('routeHop', `door:${step.next}`);
    // The door's own Enter verb, as a menu click would run it (doors-feature: key, level and gate checks).
    const verbs = engine.targetVerbs?.(highlight.target) || [];
    const enter = verbs.find((v) => v.id === 'enter') || { id: 'enter', label: 'Enter', durationMs: 0 };
    if (enter.enabled === false) {
      if (enter.reason) engine.toast?.(enter.reason, 2400);
      return;
    }
    engine.beginVerb?.(highlight.target, enter);
    return;
  }
  if (!step.next) return;
  engine.setData?.('routeHop', `sign:${step.next}`);
  const c = highlight.connection || {};
  if (engine.travel) engine.travel(step.next, { label: c.label || label(step.next), arrive: c.arrive });
  else engine.enter(step.next);
}

function stepWalk(engine, now) {
  if (!walk) return;
  const p = engine.player;
  if (!p || !highlight || highlight.key !== walk.key || offWorld(engine) || engine.busy?.() || engine.acting?.()) {
    stopWalk(engine, 'lost');
    return;
  }
  const dx = walk.x - p.x;
  if (Math.abs(dx) <= WALK_REACH) {
    stopWalk(engine, 'arrived');
    takeHop(engine);
    return;
  }
  const dir = dx > 0 ? 1 : -1;
  if (dir !== walk.dir) {
    if (walk.dir) sendWalkKey('keyup', WALK_KEY[walk.dir]);
    walk.dir = dir;
    sendWalkKey('keydown', WALK_KEY[dir]);
  }
  if (Math.abs(p.x - walk.lastX) > 2) {
    walk.lastX = p.x;
    walk.lastMoveAt = now;
  } else if (now - walk.lastMoveAt > WALK_STALL_MS) {
    stopWalk(engine, 'stalled');
    return;
  }
  if (now - walk.startedAt > WALK_MAX_MS) stopWalk(engine, 'timeout');
}

/** GpsUI.onArrowClick. */
function arrowClick(engine) {
  if (!state.route) return;
  const step = currentStep(engine);
  if (step.status === 'arrived') {
    dropRoute(engine, { reason: 'closed' });
    return;
  }
  if (walk) {
    stopWalk(engine, 'again');
    return;
  }
  if (step.status !== 'on' || !highlight || offWorld(engine)) return;
  if (engine.busy?.() || engine.acting?.()) return;
  // onTick's clock (game.js features.tick passes Date.now()).
  startWalk(engine, Date.now());
  publish(engine);
}

/* ------------------------------------------------------------ refresh + data */

function publish(engine, step = currentStep(engine)) {
  if (!engine?.setData) return;
  const r = state.route;
  engine.setData('routeActive', r ? '1' : '0');
  engine.setData('routeDest', r ? r.destination : '');
  engine.setData('routeTo', r ? label(r.destination) : '');
  engine.setData('routeNext', step.next ? label(step.next) : '');
  engine.setData('routeStatus', step.status);
  engine.setData('routePath', r?.path ? r.path.map(label).join('>') : '');
  engine.setData('routeSource', r ? r.source : '');
  engine.setData('routeQuest', r ? r.quest : '');
  engine.setData('routeSign', highlight?.kind === 'sign' ? `${Math.round(highlight.view.x)}:${highlight.board}` : '');
  engine.setData('routeDoor', highlight?.kind === 'door' ? `${Math.round(highlight.x)}:${label(highlight.door?.connect?.street || highlight.door?.connect?.tsid)}` : '');
  engine.setData('routeVia', highlight?.kind || '');
  engine.setData('routeWalk', walk ? `${walk.kind}:${Math.round(walk.x)}` : '');
  engine.setData('routeReached', String(state.reached));
  engine.setData('routeCleared', state.lastCleared || '');
  engine.setData('routeMode', pickMode ? 'pick' : '');
}

function refresh(engine) {
  const step = currentStep(engine);
  placeHighlight(engine, step.status === 'on' && !offWorld(engine) ? step.next : '');
  renderGps(engine, step);
  publish(engine, step);
  return step;
}

/* ------------------------------------------------------------ Map */

/** Draw the route over the hub map that openMap just rendered. */
function decorateMap(engine) {
  if (typeof document === 'undefined') return;
  const svg = document.querySelector('#map-canvas svg.hub-map-svg');
  if (!svg) return;
  svg.classList.toggle('route-picking', pickMode);
  svg.querySelectorAll('.map-route').forEach((el) => el.remove());
  engine.setData?.('routeMapLines', '0');
  engine.setData?.('routeMapExit', '');
  engine.setData?.('routeMapPin', '');
  if (!state.route) return;
  const step = currentStep(engine);
  const remaining = step.status === 'arrived' ? [state.route.destination] : step.remaining.length ? step.remaining : state.route.path || [state.route.destination];
  const segments = [];
  let hubId = '';
  svg.querySelectorAll('g.map-street').forEach((g) => {
    const line = g.querySelector('line.map-seg');
    if (!line) return;
    const key = g.getAttribute('data-tsid') || '';
    hubId ||= hubOf(key);
    segments.push({ key, x1: Number(line.getAttribute('x1')), y1: Number(line.getAttribute('y1')), x2: Number(line.getAttribute('x2')), y2: Number(line.getAttribute('y2')) });
  });
  const draw = hubRouteDrawing(remaining, segments, hubOf, hubId);
  const ns = 'http://www.w3.org/2000/svg';
  const group = document.createElementNS(ns, 'g');
  group.setAttribute('class', 'map-route');
  const add = (tag, attrs) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    group.appendChild(el);
    return el;
  };
  const all = [...draw.lines, ...draw.joins];
  for (const cls of ['map-route-under', 'map-route-line', 'map-route-ants']) {
    for (const l of all) add('line', { class: cls, x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 });
  }
  const pinGroup = document.createElementNS(ns, 'g');
  pinGroup.setAttribute('class', 'map-route map-route-pins');
  if (draw.pin && sameStreet(remaining[remaining.length - 1], state.route.destination)) {
    const { x, y } = draw.pin;
    const pin = add('path', { class: 'map-route-pin', d: `M${x},${y} c-7,-9 -12,-14 -12,-21 a12,12 0 1 1 24,0 c0,7 -5,12 -12,21z` });
    const dot = add('circle', { cx: x, cy: y - 21, r: 4.5, fill: '#4a2408', 'pointer-events': 'none' });
    pinGroup.append(pin, dot);
  }
  if (draw.exitHub) {
    const go = [...svg.querySelectorAll('g.map-hub-go')].find((g) => g.getAttribute('data-hub') === draw.exitHub);
    const ring = go?.querySelector('circle.map-go-ring');
    if (ring) add('circle', { class: 'map-route-exit', cx: ring.getAttribute('cx'), cy: ring.getAttribute('cy'), r: 27 });
  }
  // Under the labels, the "you" star and the GO rings, over the streets.
  const before = svg.querySelector('text.map-label') || svg.querySelector('.map-you') || null;
  svg.insertBefore(group, before);
  // The destination pin sits over the labels and the "you" star.
  if (pinGroup.childNodes.length) svg.insertBefore(pinGroup, svg.querySelector('g.map-hub-go'));
  engine.setData?.('routeMapLines', String(draw.lines.length));
  engine.setData?.('routeMapExit', draw.exitHub);
  engine.setData?.('routeMapPin', draw.pin ? draw.pinVia || 'street' : '');
}

/** Clicks on the Map while "Set a destination" is on: route instead of travel. */
function bindMapCanvas(engine) {
  if (canvasBound || typeof document === 'undefined') return;
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;
  canvasBound = true;
  canvas.addEventListener('click', (e) => {
    if (!pickMode) return;
    const g = e.target?.closest?.('g.map-street');
    if (!g) return;
    e.stopPropagation();
    e.preventDefault();
    const tsid = g.getAttribute('data-tsid');
    loadGraph().then(() => {
      pickMode = false;
      const res = setRoute(engine, { to: tsid, source: 'player' });
      if (!res.ok) {
        engine.toast?.(res.error, 2600);
        redrawOpenMap(engine);
        return;
      }
      engine.pushActivity?.(`Destination set: ${label(res.route.destination)}.`);
    });
  }, true);
}

function mapCard(engine) {
  if (typeof document === 'undefined') return null;
  ensureStyle();
  bindMapCanvas(engine);
  const card = document.createElement('div');
  card.className = 'map-route-card';
  card.dataset.mapRoute = '';
  const r = state.route;
  const step = currentStep(engine);
  // A quest run that shares this route (Warm and Smuggly's Contraband, G192: its Map card merged in here).
  const quest = engine.query?.('mapRouteCard', engine) || null;
  const shared = Boolean(quest && r && r.source === quest.source);
  const lead = quest?.icon
    ? `<img class="map-route-icon" src="${esc(quest.icon)}" alt="" aria-hidden="true">`
    : '<span class="map-route-swatch" aria-hidden="true"></span>';
  const lines = [];
  let head = '';
  if (r) {
    const dest = `${label(r.destination)}${hubName(r.destination) ? ` (${hubName(r.destination)})` : ''}`;
    const text = gpsText(r, step, label);
    const rest = step.status === 'on' ? step.remaining.slice(1) : [];
    head = shared ? quest.title : `${ROUTE_TEXT.to}${dest}`;
    lines.push(rest.length > 1 ? `Route: ${rest.map(label).join(' → ')}` : text.arrived ? ROUTE_TEXT.arrived : text.next);
    if (quest && !shared) lines.push(`${quest.title}. ${quest.text}`);
  } else if (quest) {
    head = quest.title;
    lines.push(quest.text);
  } else {
    lines.push(pickMode ? 'Click a street to set it as your destination.' : 'No destination set.');
  }
  card.dataset.mapRouteQuest = quest ? quest.source : '';
  const body = `${lead}<div class="map-route-body">${head ? `<strong>${esc(head)}</strong><br>` : ''}${lines.map((l) => `<span>${esc(l)}</span>`).join('<br>')}</div>`;
  card.innerHTML = `${body}<span class="map-route-actions"></span>`;
  const actions = card.querySelector('.map-route-actions');
  const button = (text, fn, pressed) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (pressed != null) b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', fn);
    actions.appendChild(b);
    return b;
  };
  // Another hub's destination: a button to its map (a door-only room in this hub is pinned on its street, G192).
  const shownHub = hubOf(document.querySelector('#map-canvas g.map-street[data-tsid]')?.getAttribute('data-tsid') || '');
  if (r && hubOf(r.destination) && document.querySelector('#map-canvas svg') && hubOf(r.destination) !== shownHub) {
    button('Show destination', () => engine.openMap?.(hubOf(r.destination)));
  }
  button('Set a destination', () => {
    pickMode = !pickMode;
    engine.setData?.('routeMode', pickMode ? 'pick' : '');
    loadGraph();
    engine.openMap?.();
  }, pickMode);
  if (r) {
    button('Clear route', () => dropRoute(engine, { reason: 'closed' }));
  }
  if (pickMode) roomPicker(engine, card, shownHub);
  // openMap renders the SVG before it asks for cards, so the route can go on now.
  decorateMap(engine);
  return card;
}

/**
 * G198: "Set a destination" can only pick a street the hub map draws, so the
 * rooms behind doors on this hub's streets (the Hell Bar, Vicar's Peak, the
 * subway stations, Jethimadh Tower's rooms) are listed under the route card
 * to pick from. The client had no such list (map-routes.js doorRooms): this
 * is the remake's way in to rooms the hub maps leave out.
 */
function roomsInHub(hubId) {
  if (!hubId) return [];
  return rooms
    .filter((row) => hubOf(row.street) === String(hubId))
    .map((row) => ({ ...row, label: label(row.room), streetLabel: label(row.street), viaLabel: label(row.via) }))
    .sort((a, b) => a.streetLabel.localeCompare(b.streetLabel) || a.label.localeCompare(b.label));
}

function roomPicker(engine, card, hubId) {
  const list = roomsInHub(hubId);
  engine.setData?.('routeRooms', list.map((row) => row.label).join('|'));
  if (!list.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'map-route-rooms';
  wrap.dataset.mapRouteRooms = String(list.length);
  const head = document.createElement('span');
  head.className = 'map-route-rooms-head';
  head.textContent = 'Behind doors:';
  wrap.appendChild(head);
  for (const row of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.room = row.room;
    b.textContent = row.label;
    const through = row.via === row.street ? `a door on ${row.streetLabel}` : `${row.viaLabel}, off ${row.streetLabel}`;
    b.title = `Through ${through}${row.locked ? ' (it needs a key)' : ''}`;
    b.setAttribute('aria-label', `Set ${row.label} as your destination, through ${through}`);
    if (row.locked) b.classList.add('locked');
    b.addEventListener('click', () => loadGraph().then(() => pickRoom(engine, row.room)));
    wrap.appendChild(b);
  }
  card.appendChild(wrap);
}

/** A room from the list: a player route to it, as a street click in pick mode sets one. */
function pickRoom(engine, room) {
  pickMode = false;
  const res = setRoute(engine, { to: room, source: 'player' });
  if (!res.ok) {
    engine.toast?.(res.error, 2600);
    redrawOpenMap(engine);
    return res;
  }
  engine.pushActivity?.(`Destination set: ${label(res.route.destination)}.`);
  return res;
}

/* ------------------------------------------------------------ QA */

function demoSetup(engine) {
  if (demoDone) return;
  const to = engine.param?.('routedemo');
  if (!to) return;
  demoDone = true;
  loadGraph().then(() => setRoute(engine, { to, source: 'player' }));
}

/**
 * &routeautoplay=1: stand at each highlighted signpost or door, then travel on.
 * &routeautoplay=arrow: click the GPS arrow on each street and let it walk you.
 */
function autoplay(engine, now) {
  const mode = engine.param?.('routeautoplay');
  if ((mode !== '1' && mode !== 'arrow') || !state.route) return;
  if (engine.busy?.() || engine.questDialogueOpen?.()) return;
  // Quest-room conversations and award cards are not part of busy(): hold for them too.
  if (typeof document !== 'undefined' && document.querySelector('#qi-dialogue:not([hidden]), #award-screen:not([hidden])')) {
    if (auto.at) auto.at = now;
    return;
  }
  const step = currentStep(engine);
  if (step.status !== 'on' || !highlight?.view) return;
  const key = `${engine.streetTsid}>${step.next}`;
  const stepMs = Number(engine.param('routestepms')) || 2500;
  if (mode === 'arrow') {
    // One click per street, after a beat to see the GPS.
    if (auto.key !== key) {
      auto = { key, at: now };
      return;
    }
    if (auto.at && !walk && now - auto.at > Math.min(stepMs, 1200)) {
      auto.at = 0;
      if (typeof document !== 'undefined') document.querySelector('#route-gps .route-gps-arrow')?.click();
      else arrowClick(engine);
    }
    return;
  }
  if (auto.key !== key) {
    auto = { key, at: now };
    engine.player.x = highlight.x - (highlight.kind === 'door' ? 0 : 40);
    engine.player.vx = 0;
    engine.snapCamera?.();
    return;
  }
  if (auto.at && now - auto.at > stepMs) {
    auto.at = 0;
    takeHop(engine);
  }
}

/* ------------------------------------------------------------ feature */

export const mapRoutesFeature = {
  id: MAP_ROUTES_FEATURE_ID,

  init(engine) {
    lastDead = null;
    pickMode = false;
    demoDone = false;
    canvasBound = false;
    auto = { at: 0, key: '' };
    loadGraph().then(() => refresh(engine));
  },

  save() {
    return state;
  },

  restore(slice) {
    state = normalizeRouteState(slice || {});
  },

  /**
   * The host API for other modules: engine.query('mapRoute', action, opts, engine).
   * 'set' needs the graph; before it loads, the route waits for it.
   */
  mapRoute(action, opts, engine) {
    if (action === 'get') return state.route;
    if (action === 'clear') return dropRoute(engine, opts || {});
    if (action === 'set') {
      if (graph) return setRoute(engine, opts || {});
      loadGraph().then(() => setRoute(engine, opts || {}));
      return { ok: true, pending: true };
    }
    return null;
  },

  onStreetEnter(_street, engine) {
    stopWalk(engine);
    // The glow layer outlives the street (G200): a glow left there goes now.
    clearHighlight();
    auto = { at: 0, key: '' };
    demoSetup(engine);
    const apply = () => {
      if (state.route) {
        const res = enterStreet(state, graph || {}, engine.streetTsid, { offWorld: offWorld(engine), blocked: closedRoads(engine), locked: lockedDoors });
        state = res.state;
        if (res.events.includes('arrived')) {
          // locations/location.js 310-313: pc.quests_inc_counter('map_dest_reached', 1).
          engine.achievement?.('map_destination_reached', 1);
          engine.playSound?.('COMPLETE_QUEST_REQUIREMENT', { volume: 0.35 });
        }
        if (res.events.length) engine.save?.();
      }
      refresh(engine);
    };
    if (graph) apply();
    else loadGraph().then(apply);
  },

  onStreetClear(engine) {
    stopWalk(engine);
    // The glow layer outlives the street (G200): take the glow out of it.
    clearHighlight();
  },

  onTick(_dtMs, now, engine) {
    if (!engine.started) return;
    const dead = Boolean(hellFeature.isDead?.());
    if (lastDead !== null && dead !== lastDead) {
      state = dead ? croakRoute(state) : resurrectRoute(state);
      engine.save?.();
      refresh(engine);
    }
    lastDead = dead;
    if (state.route?.quest && engine.questState && !questActive(engine, state.route.quest)) {
      dropRoute(engine, { reason: 'quest-done' });
    }
    if (highlight?.glow && !highlight.glow.destroyed) {
      highlight.glow.alpha = 0.8 + 0.2 * Math.sin(now / 260);
      if (highlight.kind === 'door') syncDoorGlow(highlight);
    }
    stepWalk(engine, now);
    if (now - lastPublish > 120) {
      lastPublish = now;
      // Doors (doors-feature) and signposts can register after the street is entered: look again.
      if (state.route && !highlight && graph && engine.streetTsid && now - lastLook > 400) {
        lastLook = now;
        refresh(engine);
      }
      pointArrow(engine);
    }
    autoplay(engine, now);
  },

  mapCards(engine) {
    const card = mapCard(engine);
    return card ? [card] : [];
  },

  /** QA / tests. */
  _state() {
    return state;
  },
  _reset() {
    state = createRouteState();
    walk = null;
    clearHighlight();
    gps = null;
    lastDead = null;
    pickMode = false;
    demoDone = false;
    lastHudKey = '';
  },
  /** Tests: a plain adjacency map, or signpost-graph.json as fetched ({ streets, doors, doorKeys }). */
  _setGraph(g) {
    if (g && g.streets && typeof g.streets === 'object' && !Array.isArray(g.streets)) {
      const built = routeGraph(g);
      graph = built.graph;
      lockedDoors = built.locked;
      rooms = doorRooms(g);
    } else {
      graph = g;
      lockedDoors = null;
      rooms = [];
    }
  },
  /** Tests (G198): the rooms behind doors listed for a hub, and picking one. */
  _roomsInHub(hubId) {
    return roomsInHub(hubId);
  },
  _pickRoom(engine, room) {
    return pickRoom(engine, room);
  },
  _setPickMode(on) {
    pickMode = Boolean(on);
  },
  /** QA / tests: the GPS arrow click, and one walk step. */
  _arrowClick(engine) {
    arrowClick(engine);
  },
  _stepWalk(engine, now) {
    stepWalk(engine, now);
  },
  _highlight() {
    return highlight;
  },
  _glowLayer() {
    return glowLayer;
  },
  _walk() {
    return walk;
  },
};

