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
 *   street glows in the map path colour (0xf0f258, MapHub.as 72).
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
 *                            (&routestepms=N, default 2500), then travel on
 * Canvas data: routeActive, routeTo, routeDest, routeNext, routeStatus,
 * routePath, routeSource, routeQuest, routeSign, routeReached, routeCleared,
 * routeMapLines, routeMapExit, routeMode.
 */

import { STREET_INDEX } from '../street-loader.js';
import { hellFeature } from './hell-feature.js?v=hell-4';
import {
  ROUTE_COLOR,
  ROUTE_COLOR_CSS,
  ROUTE_TEXT,
  clearRoute,
  createRouteState,
  croakRoute,
  enterStreet,
  gpsText,
  hubRouteDrawing,
  normalizeRouteState,
  planRoute,
  resurrectRoute,
  routeStep,
  sameStreet,
  tsidAliases,
} from '../map-routes.js?v=g177-1';

export const MAP_ROUTES_FEATURE_ID = 'map-routes';
const GRAPH_URL = 'assets/content/signpost-graph.json?v=smuggling-1';

let state = createRouteState();
let graph = null;
let graphPromise = null;
/** The glowing board on this street: { view, glow, key }. */
let highlight = null;
let gps = null;
let lastDead = null;
let pickMode = false;
let lastPublish = 0;
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
      graph = json.streets || {};
      return graph;
    })
    .catch(() => {
      graph = {};
      return graph;
    });
  return graphPromise;
}

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

/** Glow the board that leads to `next` (TSFrontController.startLocationPath loc_path_signpost). */
function placeHighlight(engine, next) {
  const key = next ? `${engine.streetTsid}>${next}` : '';
  if (highlight && highlight.key === key && highlight.glow && !highlight.glow.destroyed) return;
  clearHighlight();
  if (!next) return;
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
    highlight = { view, glow, key, board: board.index };
    return;
  }
}

/* ------------------------------------------------------------ GPS */

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById('map-routes-style')) return;
  const style = document.createElement('style');
  style.id = 'map-routes-style';
  style.textContent = `
.route-gps{position:absolute;top:10px;right:10px;z-index:12;display:grid;grid-template-columns:30px 1fr auto;gap:6px;align-items:center;
  max-width:min(300px,42%);padding:5px 6px 5px 8px;border:1px solid #c5bdaa;border-radius:12px 12px 12px 4px;background:rgba(255,253,247,.94);
  box-shadow:0 2px 8px rgba(0,0,0,.14);color:#3d5a32;font:700 .8rem/1.25 "Trebuchet MS",sans-serif;pointer-events:auto}
.route-gps[hidden]{display:none}
@media (max-width:700px){.route-gps{top:46px;max-width:calc(100% - 20px)}}
.route-gps-arrow{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:${ROUTE_COLOR_CSS};box-shadow:inset 0 0 0 2px #8a7a2a}
.route-gps-arrow svg{transition:transform .15s linear}
.route-gps-arrow.arrived{background:#cfe8b0;box-shadow:inset 0 0 0 2px #5f8a3a}
.route-gps-text{min-width:0}
.route-gps-to{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#3d5a32;background:none;border:0;padding:0;font:inherit;text-align:left;cursor:pointer}
.route-gps-to:hover{text-decoration:underline}
.route-gps-next{display:block;font-weight:400;font-size:.74rem;color:#5c5444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.route-gps-next.off{font-style:italic}
.route-gps-x{border:0;background:none;color:#8a8068;font:700 1rem/1 "Trebuchet MS",sans-serif;cursor:pointer;padding:2px 4px;align-self:start;opacity:.6}
.route-gps-x:hover{opacity:1}
.map-route-card{padding:6px 10px;border-radius:10px;background:#fffbe0;box-shadow:0 2px 8px rgba(0,0,0,.12);margin:0 0 8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:.8rem}
.map-route-card strong{font-size:.85rem}
.map-route-card .map-route-swatch{width:22px;height:8px;border-radius:4px;background:${MAP_ROUTE_CSS};box-shadow:0 0 0 1.5px #4a2408;flex:none}
.map-route-card .map-route-body{flex:1 1 220px;min-width:0}
.map-route-card button{font:700 .74rem "Trebuchet MS",sans-serif;padding:3px 8px;border-radius:8px;border:1px solid #b9ae8e;background:#fff;color:#3d5a32;cursor:pointer}
.map-route-card button[aria-pressed="true"]{background:${ROUTE_COLOR_CSS};border-color:#8a7a2a}
.map-route-line{fill:none;stroke:${MAP_ROUTE_CSS};stroke-width:8;stroke-linecap:round;pointer-events:none}
.map-route-under{fill:none;stroke:#4a2408;stroke-width:13;stroke-linecap:round;stroke-opacity:.7;pointer-events:none}
.map-route-ants{fill:none;stroke:#fffbe0;stroke-width:2;stroke-dasharray:6 9;stroke-linecap:round;pointer-events:none;animation:mapRouteAnts 1.1s linear infinite}
@keyframes mapRouteAnts{to{stroke-dashoffset:-30}}
@media (prefers-reduced-motion: reduce){.map-route-ants{animation:none}}
.map-route-pin{fill:${MAP_ROUTE_CSS};stroke:#4a2408;stroke-width:2.5;pointer-events:none}
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
  el.innerHTML = `<span class="route-gps-arrow">${ARROW_SVG}</span>
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
  g.angle = null;
}

/** GpsUI.updateArrow: rotate toward the next signpost. */
function pointArrow(engine) {
  if (!gps || gps.el.hidden || !highlight?.view || highlight.view.destroyed || !engine.player) return;
  const svg = gps.arrow.querySelector('svg');
  if (!svg) return;
  const view = highlight.view;
  const p = engine.player;
  const deg = (Math.atan2(view.y - 60 - (p.y - 40), view.x - p.x) * 180) / Math.PI;
  const rounded = Math.round(deg / 3) * 3;
  if (rounded === gps.angle) return;
  gps.angle = rounded;
  svg.style.transform = `rotate(${rounded}deg)`;
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
  engine.setData('routeSign', highlight ? `${Math.round(highlight.view.x)}:${highlight.board}` : '');
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
  let body;
  if (r) {
    const dest = `${label(r.destination)}${hubName(r.destination) ? ` (${hubName(r.destination)})` : ''}`;
    const text = gpsText(r, step, label);
    const rest = step.status === 'on' ? step.remaining.slice(1) : [];
    const via = rest.length > 1 ? `<span>Route: ${rest.map(label).join(' → ')}</span>` : `<span>${text.arrived ? ROUTE_TEXT.arrived : text.next}</span>`;
    body = `<span class="map-route-swatch" aria-hidden="true"></span><div class="map-route-body"><strong>${ROUTE_TEXT.to}${dest}</strong><br>${via}</div>`;
  } else {
    body = `<span class="map-route-swatch" aria-hidden="true"></span><div class="map-route-body"><span>${pickMode ? 'Click a street to set it as your destination.' : 'No destination set.'}</span></div>`;
  }
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
  if (r && hubOf(r.destination) && document.querySelector('#map-canvas svg') && !document.querySelector(`#map-canvas g.map-street[data-tsid="${r.destination}"]`)) {
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
  // openMap renders the SVG before it asks for cards, so the route can go on now.
  decorateMap(engine);
  return card;
}

/* ------------------------------------------------------------ QA */

function demoSetup(engine) {
  if (demoDone) return;
  const to = engine.param?.('routedemo');
  if (!to) return;
  demoDone = true;
  loadGraph().then(() => setRoute(engine, { to, source: 'player' }));
}

/** &routeautoplay=1: stand at each highlighted signpost, then travel on. */
function autoplay(engine, now) {
  if (engine.param?.('routeautoplay') !== '1' || !state.route) return;
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
  if (auto.key !== key) {
    auto = { key, at: now };
    engine.player.x = highlight.view.x - 40;
    engine.player.vx = 0;
    engine.snapCamera?.();
    return;
  }
  if (auto.at && now - auto.at > stepMs) {
    auto.at = 0;
    engine.enter(step.next);
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
    highlight = null;
    auto = { at: 0, key: '' };
    demoSetup(engine);
    const apply = () => {
      if (state.route) {
        const res = enterStreet(state, graph || {}, engine.streetTsid, { offWorld: offWorld(engine), blocked: closedRoads(engine) });
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

  onStreetClear() {
    highlight = null;
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
    if (highlight?.glow && !highlight.glow.destroyed) highlight.glow.alpha = 0.8 + 0.2 * Math.sin(now / 260);
    if (now - lastPublish > 120) {
      lastPublish = now;
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
    highlight = null;
    gps = null;
    lastDead = null;
    pickMode = false;
    demoDone = false;
    lastHudKey = '';
  },
  _setGraph(g) {
    graph = g;
  },
};

