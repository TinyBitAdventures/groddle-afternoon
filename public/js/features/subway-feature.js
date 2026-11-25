/**
 * The Ur subway (register row G115; rules and copy in js/subway.js).
 *
 * - The 12 surface streets' subway entrances (their archived doors to the
 *   station tsids) are linked to the rebuilt stations when the street loads;
 *   the doors feature then enters them as any door. Each station's stairs
 *   lead back up to its street.
 * - In a station: the CC0 subway1.swf pieces laid out from footage, the
 *   station's own sign, the Subway Map post (verb View: the Subway System
 *   map) and A Red Button on the gate block (verb Push: SUBWAY_BUTTON, the
 *   papers / dubious-journey refusals, "Train tickets 50C." with both lines'
 *   next stops, pay 50 currants, board).
 * - In the train: the solo ride schedule (js/subway.js rideTiming), the
 *   source's announcements, TRAIN_DEPARTS / TRAVELLING_TRAIN / TRAIN_ARRIVES,
 *   the tunnel moving past the windows and the floor lights sweeping while
 *   it moves, and "This stop is X. Get off train?" at every stop. Staying on
 *   rides to the next stop. Each boarding counts transit:subways_entered
 *   (Subwayfarer 23, Ground Hogger 103, Commuter Mug 251, Chute Jockey 503).
 * - A reload in the train resumes on the platform of its last stop.
 * - Multiplayer (G115 online, js/subway-mp.js; groddle-afternoon-server
 *   subway.go): the trains are shared. A paid ticket asks the server for a
 *   seat; riders boarding the same line at the same station while a train
 *   stands there share it (its street TRAIN_<id>: they see each other and
 *   chat in the carriage), it waits for 3 riders or 60 s as the source did
 *   (10 s while nobody else is on the platform), and each rider gets off at
 *   their own stop. With no answer from the server in 3 s the ride is the
 *   rider's own, as in solo. The fare is the client's 50 currants, as before.
 *
 * QA: ?autostart=1&questoffer=off&subwaydemo=<station id | name | tsid>
 *   enters that station by the stairs. &subwaypapers=1 (with or without a demo) grants You Have
 *   Papers!, &subwaycurrants=N sets currants, &subwayfast=1 runs the ride at
 *   a quarter of its timings, &subwayhold=1 keeps it moving between stations
 *   (screenshots). &subwayautoplay=gate opens the ticket dialog;
 *   =ride buys a Red Line ticket and stops in the moving train; =map opens the
 *   Subway System map; =1 buys a ticket, rides one stop, gets off and walks
 *   up the stairs to the next stop's street. &subwayline=backwards picks the
 *   Blue Line. Canvas data: subwayStation, subwayPhase, subwayNext,
 *   subwayRides, subwayLast, subwayStops, subwayDialog, subwayAnnounce,
 *   subwayDemo, subwayWindows, subwayLinked.
 */

import { countItem } from '../inventory.js?v=6414dbdc';
import { isEditableTarget } from '../held-keys.js?v=a28eb293';
import { REPORT_WINDOW_SELECTOR, SCREEN_SELECTOR, START_CARD_SELECTOR, WINDOW_SELECTOR } from '../window-stack.js?v=a7104f02';
import { OVERLAY_USES, playOverlay } from '../overlays.js?v=91dcee74';
import { doorsFeature } from './doors-feature.js?v=3544c45b';
import { createMapZoom } from '../map-zoom.js?v=4f0762b2';
import { bindSubwayMap, renderSubwayMapSvg, subwayPaper } from '../map-views.js?v=ad712b91';
import { frameTexture, textureFromUrl } from '../textures.js?v=b8e38103';
import {
  CAR_FLOOR,
  CAR_FLOOR_LIGHTS,
  CAR_FLOOR_RUN,
  CAR_TILE_TOP,
  CAR_TSID,
  CAR_UNDERFLOOR,
  CAR_WINDOWS,
  CAR_WINDOW_BOTTOM,
  CARD_BADGE,
  FARE,
  LINE_COLOURS,
  PAPERS_BADGE,
  RIDE_COUNTER,
  STATIONS,
  STATION_BUTTON,
  STATION_GATE_WALL,
  STATION_X,
  SUBWAY_ART,
  SUBWAY_ART_BASE,
  SUBWAY_LINE,
  TEXT,
  announce,
  boardingSpot,
  canDisembark,
  createRide,
  disembarkSpot,
  findStation,
  gateFor,
  gateTerms,
  isCarTsid,
  lineName,
  lineText,
  lineStarPoint,
  lineView,
  nextStation,
  papersHint,
  payFare,
  rideNext,
  rideProgress,
  rideTiming,
  stationArrival,
  stationById,
  stationByTsid,
  stationScreen,
  stationSpots,
  stepRide,
  ticketOffer,
} from '../subway.js?v=ea6921ff';
import { BOARD_ANSWER_MS, SUBWAY_MP_TEXT, applyTrain, riderChanges, trainOf } from '../subway-mp.js?v=ffd57d82';
import { anchorBottomCentre } from '../sprite-feet.js?v=6358a697';

export const SUBWAY_FEATURE_ID = 'subway';
const STYLE_ID = 'subway-feature-style';
const DATA_MS = 250;

let state = { rides: 0, stop: null, direction: 'forwards', inCar: false };
let views = [];
let targets = [];
let windows = []; // { engine, x, y, handle } (G398: the subway_window overlay while moving)
let floorLights = [];
let ride = null;
let pendingBoard = null;
/** G1139: the station you are getting off at while its trip loads (the ride stays until you arrive). */
let gettingOff = null;
let travelLoop = null;
let dialog = null; // { el, onTimeout, until }
let announceTimer = 0;
let lastData = 0;
let demo = { stage: 'idle', at: 0 };
let generation = 0;
/** Multiplayer: the realtime client and the train answer we wait for (js/subway-mp.js). */
let mp = null;
/** M on the train: the line map ({ el, key }) and the stop you picked to get off at (a station id). */
let lineMap = null;
/** G909: the Subway System map's zoom and pan (js/map-zoom.js) on one host kept across opens. */
let mapZoomHost = null;
let mapZoom = null;
let chosenStop = null;

const fastScale = (engine) => (engine.param('subwayfast') === '1' ? 0.25 : 1);
const here = (engine) => stationByTsid(engine.streetTsid);
const inCar = (engine) => isCarTsid(engine.streetTsid);
const artUrl = (piece) => `${SUBWAY_ART_BASE}${SUBWAY_ART[piece][0]}`;

/* ------------------------------------------------------------------ */
/* DOM: style, dialogs, announcements, the map                         */
/* ------------------------------------------------------------------ */

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.subway-dialog { position: absolute; inset: 0; z-index: calc(var(--z-notice) + 10); display: grid; place-items: center; pointer-events: none; }
.subway-dialog-card { pointer-events: auto; max-width: min(440px, calc(100% - 32px)); background: var(--surface-card); color: var(--c-grey-29); border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-3); padding: var(--sp-8) var(--sp-9) 1.05rem; font: var(--fs-base)/var(--lh-normal) var(--font-ui); }
.subway-dialog-card h3 { margin: 0 0 var(--sp-1); font-size: var(--fs-lg); }
.subway-dialog-card .subway-kicker { margin: 0 0 var(--sp-3); font-size: var(--fs-sm); letter-spacing: .08em; text-transform: uppercase; color: var(--c-sand-60); }
.subway-dialog-card p { margin: .3rem 0; }
.subway-dialog-card .subway-lines { margin: .45rem 0 .2rem; padding: 0; list-style: none; }
.subway-dialog-card .subway-lines li { margin: var(--sp-1) 0; }
.subway-dialog-card .subway-dot { display: inline-block; width: .7rem; height: .7rem; border-radius: var(--radius-round); margin-right: var(--sp-3); vertical-align: -1px; }
.subway-dialog-actions { display: flex; flex-wrap: wrap; gap: .45rem; margin-top: .7rem; }
.subway-dialog-actions button { font: inherit; font-weight: 700; border: 0; border-radius: var(--radius-pill); padding: .45rem .95rem; cursor: pointer; background: var(--surface-sunken); color: var(--c-grey-29); }
.subway-dialog-actions button.primary { background: var(--c-green-58); color: var(--text-inverse); }
.subway-dialog-actions button:focus-visible { outline: 3px solid var(--c-gold-85); outline-offset: 2px; }
.subway-announce { position: absolute; left: 50%; top: 15%; transform: translateX(-50%); width: min(560px, calc(100% - 32px)); z-index: calc(var(--z-notice) + 5);
  text-align: center; pointer-events: none; color: var(--text-inverse); font: 700 clamp(var(--fs-xl), 3.2vw, var(--fs-4xl))/var(--lh-tight) var(--font-ui);
  text-shadow: 0 0 3px var(--c-sand-35), 0 2px 4px color-mix(in srgb, var(--c-black) 65%, transparent), 1px 1px 0 var(--c-sand-35), -1px -1px 0 var(--c-sand-35), 1px -1px 0 var(--c-sand-35), -1px 1px 0 var(--c-sand-35); }
.subway-announce b { color: var(--c-yellow-90); }
/* The Map's window (style.css #map-panel .map-card.map-hub, .map-canvas): its scrim, its card, the
   map in its gold frame, the Map's own Subway drawing inside. */
.subway-map { position: absolute; inset: 0; z-index: calc(var(--z-notice) + 10); display: grid; place-items: center; background: var(--scrim); }
.subway-map-card { width: 760px; max-width: calc(100% - 32px); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-l); box-shadow: var(--shadow-3);
  padding: .7rem var(--sp-7) .8rem; font: var(--fs-base)/var(--lh-snug) var(--font-ui); color: var(--text); }
.subway-map-zoom, .subway-line-frame { margin-top: .3rem; border: 1px solid var(--c-gold-59); border-radius: var(--radius-lg); overflow: hidden; background: var(--c-sage-93); }
.subway-map-zoom > svg, .subway-line-frame > svg { margin-top: 0; }
/* The paper fills the frame edge to edge (760 x 460), shrinking only on a short window. */
.subway-map .subway-line-frame > svg { max-height: calc(100vh - 200px); }
:root[data-ui="classic"] .subway-map .subway-map-svg :is(.subway-stop-name, .subway-stop-hub) { font-family: var(--font-classic-title); }
.subway-map .subway-map-svg.is-riding .subway-stop-hub, .subway-map .subway-map-svg.is-still :is(.subway-stop-hit, .subway-stop-hub) { cursor: default; }
.subway-map .subway-map-svg .subway-stop-mine { fill: none; stroke: var(--c-grey-29); stroke-width: 2.5; stroke-dasharray: 4 3; }
.subway-map-head { display: flex; align-items: center; gap: var(--sp-4); }
.subway-map-head h3 { margin: 0; flex: 1; text-align: left; font-size: var(--fs-2xl); color: var(--text); }
.subway-map-head button { font: inherit; border: 0; background: none; cursor: pointer; }
.subway-map-lines button { border-radius: var(--radius-pill); padding: var(--sp-1) var(--sp-5); font-size: var(--fs-sm); font-weight: 700; border: 2px solid transparent; background: var(--surface-sunken); }
.subway-map-lines button[aria-pressed="true"] { border-color: currentColor; background: var(--surface-bright); }
.subway-map-close { font-size: var(--fs-3xl); color: var(--c-red-58b); line-height: var(--lh-none); padding: 0 .2rem; }
.subway-map svg { display: block; width: 100%; height: auto; max-height: min(400px, calc(100vh - 260px)); margin-top: .3rem; }
.subway-map-foot { text-align: center; margin: .3rem 0 0; color: var(--text-muted); font-size: var(--fs-md); }
/* The card never outgrows the screen (the grid's one track is the screen, not the card's
   widest row), the map zooms and pans in place (the Map's zoom: two fingers, a drag, the wheel, + - Fit). */
.subway-map { grid-template-columns: minmax(0, 1fr); }
.subway-map-card { box-sizing: border-box; justify-self: center; }
.subway-map-zoom { position: relative; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.subway-map-zoom[data-zoomed] { cursor: grab; }
.subway-map-zoom[data-map-dragging], .subway-map-zoom[data-map-dragging] * { cursor: grabbing !important; }
.subway-map .map-zoom-ctl svg { margin: 0; max-height: none; }
@media (max-width: 720px), (max-height: 560px) {
  .subway-map { padding: var(--sp-3); box-sizing: border-box; }
  .subway-map-card { max-width: 100%; max-height: 100%; overflow: auto; padding: var(--sp-3) var(--sp-4) var(--sp-3); }
  .subway-map-head h3 { text-align: left; font-size: var(--fs-xl); }
  .subway-map-zoom > svg { max-height: calc(100dvh - 6.5rem); }
  .subway-map-foot { font-size: var(--fs-sm); }
  .subway-map-close { min-width: 2.75rem; min-height: 2.75rem; }
  /* The buttons lie in a row in the paper's empty top left corner, clear of Next stop at the bottom right. */
  .subway-map .map-zoom-ctl { top: var(--sp-2); left: var(--sp-2); right: auto; bottom: auto; flex-direction: row; }
}
/* Upright: the two lines take a row of their own under the title. */
@media (max-width: 520px) {
  .subway-map-head { flex-wrap: wrap; row-gap: var(--sp-2); }
  .subway-map-lines { order: 3; flex: 1 0 100%; display: flex; justify-content: center; gap: var(--sp-3); }
  .subway-map-zoom > svg { max-height: calc(100dvh - 8.5rem); }
}
.subway-line-card { width: 1000px; }
.subway-line-head h3 { text-align: left; display: flex; align-items: center; gap: var(--sp-3); }
.subway-line-head .subway-dot { display: inline-block; width: .8rem; height: .8rem; border-radius: var(--radius-round); }
.subway-line-head .subway-line-car { font-size: var(--fs-sm); font-weight: 400; color: var(--text-muted); }
.subway-line-body { display: grid; grid-template-columns: minmax(0, 1fr) 15.5rem; gap: var(--sp-5); align-items: start; }
.subway-line-body svg .moving { filter: grayscale(1); opacity: .75; }
.subway-line-stops { margin: .3rem 0 0; padding: 0; list-style: none; max-height: min(400px, calc(100vh - 260px)); overflow: auto; }
.subway-line-stops li { margin: 0; }
.subway-line-stops button { display: grid; grid-template-columns: 1.6rem 1fr auto; align-items: center; gap: var(--sp-2); width: 100%; text-align: left; font: inherit; border: 0; border-radius: var(--radius-md);
  background: none; padding: .22rem .35rem; cursor: pointer; color: var(--c-grey-29); }
.subway-line-stops button:hover, .subway-line-stops button:focus-visible { background: var(--surface-sunken); outline: none; }
.subway-line-stops button[aria-pressed="true"] { background: var(--surface-bright); box-shadow: inset 0 0 0 2px var(--line-colour); }
.subway-line-stops .n { font-size: var(--fs-sm); color: var(--text-muted); text-align: right; }
.subway-line-stops .name b { display: block; font-size: var(--fs-md); }
.subway-line-stops .name small { color: var(--text-muted); }
.subway-line-stops .tag { font-size: var(--fs-xs); font-weight: 700; color: var(--line-colour); text-transform: uppercase; letter-spacing: .04em; }
.subway-line-now { margin: .45rem 0 0; font-size: var(--fs-md); }
.subway-line-next { margin: .2rem 0 0; color: var(--line-colour); }
.subway-line-next b { display: block; font-size: var(--fs-lg); }
.subway-line-mine { margin: .45rem 0 0; font-size: var(--fs-md); }
@media (max-width: 720px) { .subway-line-body { grid-template-columns: 1fr; } }
`;
  document.head.appendChild(s);
}

const root = () => document.getElementById('game-root') || document.body;

function closeDialog(engine) {
  if (!dialog) return;
  dialog.release?.();
  dialog.el.remove();
  dialog = null;
  engine?.setData('subwayDialog', '');
}

/**
 * The windows over a card opened now: the window stack (js/window-stack.js) puts each new window
 * over the ones already up, but the report window, the start card and the full-screen views stay over it.
 */
const OVER_WINDOWS = [REPORT_WINDOW_SELECTOR, START_CARD_SELECTOR, SCREEN_SELECTOR].join(', ');

/**
 * May a subway card take the keyboard focus (#387)? Never from a text field the player is typing in,
 * nor from another window that holds it, nor while a window over the card is up (the report window,
 * z 512, over the card's 60): a typed Space would press the card's button. `el`: the card.
 */
export function dialogMayTakeFocus(doc, el) {
  if (!doc) return false;
  const active = doc.activeElement;
  if (isEditableTarget(active)) return false;
  if (active?.closest?.(`${WINDOW_SELECTOR}, ${OVER_WINDOWS}`) && !el?.contains?.(active)) return false;
  for (const w of doc.querySelectorAll?.(OVER_WINDOWS) || []) {
    if (w === el || w.contains?.(el)) continue;
    if (!w.hidden && w.getClientRects?.().length) return false;
  }
  return true;
}

/**
 * PURE (#518, R8): what a key does to a gate card. The Red Button's cards were conversations
 * (subway_gate.js conversation_start), the client's ChoicesDialog: Right and Down focus the next
 * choice, Left and Up the one before, round the ends (_focusNextChoice, _focusPrevChoice); Enter
 * makes the focused choice (_enterHandler); Escape closes with no choice (_escKeyHandler: no
 * cancel_value, so _makeNoChoice); and it stops the avatar while it has the keys
 * (stops_avatar_on_focus), so W A S D and Space do not walk or jump under it.
 * `at`: the focused choice's index, -1 when focus is not on one. Returns null for a key that goes
 * on as usual, else { move } (focus that choice), { close }, { native } (the focused button's own
 * Enter or Space presses it) or { hold } (kept from the avatar).
 */
export function choiceCardKey(e, { count = 0, at = -1 } = {}) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = String(e.key || '');
  if (k === 'Escape') return { close: true };
  if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowUp') {
    if (count < 1) return { hold: true };
    const step = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1;
    if (at < 0) return { move: step > 0 ? 0 : count - 1 };
    return { move: (at + step + count) % count };
  }
  if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
    if (at >= 0) return { native: true };
    // Focus elsewhere (a click on the street): Enter brings it back to the first choice, never buys.
    return k === 'Enter' && count > 0 ? { move: 0 } : { hold: true };
  }
  if (['w', 'a', 's', 'd'].includes(k.toLowerCase())) return { hold: true };
  return null;
}

/**
 * The gate cards keep the keys while they are open (choiceCardKey), as the game's modal windows
 * do: aria-modal (game.js escapeOpenFeatureDialog hands it Escape, focus-return keeps its focus),
 * and a capture listener ahead of the game's keys. Not over a text field the player is typing in,
 * another window that holds the focus, or a window over the card (dialogMayTakeFocus).
 */
function holdKeys(engine, el, buttons) {
  const onKey = (e) => {
    if (!el.isConnected || dialog?.el !== el) return;
    if (!el.contains(e.target) && !dialogMayTakeFocus(document, el)) return;
    const list = buttons();
    const act = choiceCardKey(e, { count: list.length, at: list.indexOf(document.activeElement) });
    if (!act) return;
    e.stopImmediatePropagation();
    if (!act.native) e.preventDefault();
    if (act.move != null) list[act.move]?.focus({ preventScroll: true });
    else if (act.close) closeDialog(engine);
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}

/**
 * A conversation card: { kicker, title, paras, lines, choices: [{ label, value, primary }], timeoutMs, onTimeout,
 * focus }. `focus: false` leaves the keyboard where it is, and the card is not modal (the get-off
 * prompt mid-ride, #387). onChoice(value) runs after it closes; Escape closes it with no choice.
 */
function openDialog(engine, opts, onChoice) {
  ensureStyle();
  closeDialog(engine);
  const el = document.createElement('div');
  el.className = 'subway-dialog glitch-modal';
  el.setAttribute('role', 'dialog');
  // #518: a gate card is modal (ChoicesDialog); the get-off prompt mid-ride is not (#387).
  const modal = opts.focus !== false;
  el.setAttribute('aria-modal', modal ? 'true' : 'false');
  const card = document.createElement('div');
  card.className = 'subway-dialog-card';
  if (opts.kicker) {
    const k = document.createElement('p');
    k.className = 'subway-kicker';
    k.textContent = opts.kicker;
    card.appendChild(k);
  }
  if (opts.title) {
    const h = document.createElement('h3');
    h.textContent = opts.title;
    card.appendChild(h);
  }
  for (const text of opts.paras || []) {
    const p = document.createElement('p');
    p.textContent = text;
    card.appendChild(p);
  }
  if (opts.lines?.length) {
    const ul = document.createElement('ul');
    ul.className = 'subway-lines';
    for (const line of opts.lines) {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'subway-dot';
      dot.style.background = LINE_COLOURS[line.direction];
      const b = document.createElement('b');
      b.textContent = line.name;
      li.append(dot, b, ` Next Stop: ${line.next}`);
      ul.appendChild(li);
    }
    card.appendChild(ul);
  }
  const actions = document.createElement('div');
  actions.className = 'subway-dialog-actions';
  for (const choice of opts.choices || []) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = choice.label;
    btn.dataset.value = choice.value;
    if (choice.primary) btn.className = 'primary';
    btn.addEventListener('click', () => {
      closeDialog(engine);
      onChoice?.(choice.value);
    });
    actions.appendChild(btn);
  }
  card.appendChild(actions);
  el.appendChild(card);
  root().appendChild(el);
  dialog = { el, onTimeout: opts.onTimeout || null, until: opts.timeoutMs ? Date.now() + opts.timeoutMs : 0, id: opts.id || '' };
  if (modal) dialog.release = holdKeys(engine, el, () => [...actions.querySelectorAll('button')]);
  engine.setData('subwayDialog', opts.id || 'open');
  if (opts.focus !== false && dialogMayTakeFocus(document, el)) actions.querySelector('button')?.focus({ preventScroll: true });
  return dialog;
}

/** inc_transit.js transit_make_announcement: centred, 15% down, the station name picked out. */
function showAnnouncement(engine, msg, durationMs) {
  ensureStyle();
  document.getElementById('subway-announce')?.remove();
  const el = document.createElement('div');
  el.id = 'subway-announce';
  el.className = 'subway-announce';
  const text = typeof msg === 'string' ? { text: msg } : msg;
  const [before, after = ''] = text.text.split('{name}');
  el.append(before);
  if (text.name) {
    const b = document.createElement('b');
    b.textContent = text.name;
    el.append(b, after);
  }
  root().appendChild(el);
  announceTimer = Date.now() + durationMs;
  const plain = text.text.replace('{name}', text.name || '');
  engine.setData('subwayAnnounce', plain);
  engine.pushActivity?.(plain);
}

function clearAnnouncement() {
  document.getElementById('subway-announce')?.remove();
  announceTimer = 0;
}

/** The Subway System map (items/subway_map.js view): every station at its map_pos, the line's arrows, you are here. */
function openMap(engine, { direction = 'forwards' } = {}) {
  ensureStyle();
  document.getElementById('subway-map')?.remove();
  mapZoom?.reset();
  const station = here(engine);
  const el = document.createElement('div');
  el.id = 'subway-map';
  el.className = 'subway-map glitch-modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', TEXT.mapTitle);
  const card = document.createElement('div');
  card.className = 'subway-map-card';
  const head = document.createElement('div');
  head.className = 'subway-map-head';
  const lines = document.createElement('div');
  lines.className = 'subway-map-lines';
  const h = document.createElement('h3');
  h.textContent = TEXT.mapTitle;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'subway-map-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', () => {
    el.remove();
    engine.setData('subwayMap', '');
  });
  head.append(h, lines, close);
  // G909 (#437): on an upright phone the map is drawn to the screen's width, and two fingers zoom it,
  // one drags it, as on the Map (MAPZOOM). Glitch's HubMapDialog was a fixed 760 x 460 with no zoom
  // (HubMapDialog.as MAP_W, MAP_H 58-61): a computer's window always held it.
  if (!mapZoomHost) {
    mapZoomHost = document.createElement('div');
    mapZoomHost.className = 'subway-map-zoom';
    mapZoomHost.dataset.subwayZoom = '1';
    mapZoom = createMapZoom(mapZoomHost);
  }
  const svgHost = mapZoomHost;
  const foot = document.createElement('p');
  foot.className = 'subway-map-foot';
  foot.textContent = TEXT.mapViewed;
  card.append(head, svgHost, foot);
  el.appendChild(card);
  el.addEventListener('click', (e) => {
    if (e.target === el) close.click();
  });
  // G874, #373: Esc closes it as it closes the other windows. The station sign's View sent map_open
  // with transit_tsid subway (items/subway_map.js 45), the client's HubMapDialog, a Dialog that
  // closes on Esc (Dialog.as 133). aria-modal lets game.js escapeOpenFeatureDialog hand it the key
  // when focus is elsewhere.
  el.setAttribute('aria-modal', 'true');
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close.click();
  });
  const draw = (dir) => {
    svgHost.innerHTML = mapSvg(station, dir);
    // The other line keeps the view (the same key); a new open starts whole.
    mapZoom.attach(svgHost.querySelector('svg'), 'subway');
    lines.replaceChildren(...['forwards', 'backwards'].map((d) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = lineName(d);
      b.style.color = LINE_COLOURS[d];
      b.setAttribute('aria-pressed', String(d === dir));
      b.addEventListener('click', () => draw(d));
      return b;
    }));
    engine.setData('subwayMap', dir);
  };
  draw(direction);
  root().appendChild(el);
}

/**
 * The station's Subway Map (items/subway_map.js view): G1127 (#606) the Map's own Subway view
 * (js/map-views.js renderSubwayMapSvg: the paper, the curved track, its names), your station marked,
 * the line's next stop flagged; nothing on it to press.
 */
function mapSvg(station, direction) {
  const next = station ? nextStation(station.id, direction) : null;
  return renderSubwayMapSvg({ direction, here: station ? { station, how: 'here' } : null, next: next?.id ?? null, interactive: false, paper: subwayPaper() });
}

/**
 * M on the train (Austin 2026-11-01): the line you are riding, as the client's transit map showed it
 * while riding (MapTransit.as setPlayerLocation 180-240; js/subway.js lineView): that line only, the
 * train's station marked (grey while it moves), the next stop, the stops in order, and the stop you
 * picked to get off at. The markers are the Subway Map's own (glitch-items misc/subway_map, CC0).
 * G1127 (#606, ours): drawn by the Map's Subway view (js/map-views.js renderSubwayMapSvg with `ride`),
 * so the train's map has the same paper, curved track and names as the Map's.
 */
function lineSvg(view) {
  return renderSubwayMapSvg({ ride: view, paper: subwayPaper() });
}

const reducedMotion = () => {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
};

/**
 * #538: the star where the train is, `now`: the share of the hop gone (js/subway.js rideProgress) of
 * the way to the next stop. Under reduced motion it steps in quarters instead of gliding.
 */
function placeLineStar(engine, now) {
  const star = lineMap?.star;
  if (!star) return;
  const view = lineView(ride, chosenStop);
  const p = rideProgress(ride, now, { steps: reducedMotion() ? 4 : 0 });
  const pt = lineStarPoint(view, p);
  if (!pt) return;
  const at = `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`;
  if (star.getAttribute('transform') === at) return;
  star.setAttribute('transform', at);
  const pct = Math.round(p * 100);
  if (lineMap.starPct !== pct) {
    lineMap.starPct = pct;
    engine?.setData?.('subwayLineStar', String(pct));
  }
}

const lineKey = (view) => (view ? `${view.direction}:${view.at.id}:${view.moving ? 'moving' : 'still'}:${view.chosen?.id || ''}` : '');

function closeLineMap(engine) {
  if (!lineMap) return false;
  lineMap.el.remove();
  lineMap = null;
  engine?.setData('subwayLineMap', '');
  return true;
}

function chooseStop(engine, id) {
  chosenStop = chosenStop === id ? null : id;
  engine.setData('subwayChosen', chosenStop || '');
  if (lineMap) drawLineMap(engine, { focus: id });
}

function drawLineMap(engine, { focus = null } = {}) {
  const view = lineView(ride, chosenStop);
  if (!lineMap || !view) return;
  const { el, card } = lineMap;
  card.style.setProperty('--line-colour', view.colour);
  lineMap.title.replaceChildren();
  const dot = document.createElement('span');
  dot.className = 'subway-dot';
  dot.style.background = view.colour;
  const car = document.createElement('span');
  car.className = 'subway-line-car';
  car.textContent = SUBWAY_LINE.car.label;
  lineMap.title.append(dot, lineText.title(view.lineName), car);
  lineMap.svg.innerHTML = lineSvg(view);
  lineMap.star = lineMap.svg.querySelector('[data-star]');
  placeLineStar(engine, Date.now());
  bindSubwayMap(lineMap.svg, { onStop: (e, st) => chooseStop(engine, st.id) });
  lineMap.now.textContent = view.moving ? lineText.between(view.at.name, view.next?.name || '') : lineText.at(view.at.name);
  lineMap.next.replaceChildren(lineText.next);
  const nb = document.createElement('b');
  nb.textContent = view.next?.name || '';
  lineMap.next.appendChild(nb);
  lineMap.mine.textContent = view.chosen ? lineText.getOffAt(view.chosen.name, view.chosen.away) : lineText.pick;
  lineMap.list.replaceChildren(...view.stops.map((x) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.stop = String(x.id);
    const mine = view.chosen?.id === x.id;
    b.setAttribute('aria-pressed', String(mine));
    b.title = mine ? lineText.unmark : lineText.mark(x.name);
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = x.away === 0 ? '' : String(x.away);
    const name = document.createElement('span');
    name.className = 'name';
    const nameB = document.createElement('b');
    nameB.textContent = x.name;
    const hub = document.createElement('small');
    hub.textContent = x.hubName;
    name.append(nameB, hub);
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = mine ? lineText.yourStop : x.away === 1 ? 'Next' : x.away === 0 ? 'Here' : '';
    b.append(n, name, tag);
    b.addEventListener('click', () => chooseStop(engine, x.id));
    li.appendChild(b);
    return li;
  }));
  lineMap.key = lineKey(view);
  if (focus != null) lineMap.list.querySelector(`button[data-stop="${focus}"]`)?.focus({ preventScroll: true });
  engine.setData('subwayLineMap', lineMap.key);
  engine.setData('subwayLineStops', view.stops.map((x) => x.id).join(','));
  el.hidden = false;
}

function openLineMap(engine) {
  ensureStyle();
  closeLineMap(engine);
  document.getElementById('subway-map')?.remove();
  const el = document.createElement('div');
  el.id = 'subway-line-map';
  el.className = 'subway-map glitch-modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  const card = document.createElement('div');
  card.className = 'subway-map-card subway-line-card';
  const head = document.createElement('div');
  head.className = 'subway-map-head subway-line-head';
  const title = document.createElement('h3');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'subway-map-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', () => closeLineMap(engine));
  head.append(title, close);
  const body = document.createElement('div');
  body.className = 'subway-line-body';
  const svg = document.createElement('div');
  svg.className = 'subway-line-frame';
  const side = document.createElement('div');
  const now = document.createElement('p');
  now.className = 'subway-line-now';
  const next = document.createElement('p');
  next.className = 'subway-line-next';
  const mine = document.createElement('p');
  mine.className = 'subway-line-mine';
  const list = document.createElement('ol');
  list.className = 'subway-line-stops';
  list.setAttribute('aria-label', 'Stops in order');
  side.append(now, next, list, mine);
  body.append(svg, side);
  card.append(head, body);
  el.appendChild(card);
  el.addEventListener('click', (e) => {
    if (e.target === el) closeLineMap(engine);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeLineMap(engine);
    }
  });
  root().appendChild(el);
  lineMap = { el, card, title, svg, now, next, mine, list, star: null, starPct: -1, key: '' };
  drawLineMap(engine);
  close.focus({ preventScroll: true });
  engine.playSound?.('OPEN_HUB_MAP', { volume: 0.5 });
  return true;
}

/* ------------------------------------------------------------------ */
/* World views                                                         */
/* ------------------------------------------------------------------ */

function clearViews(engine) {
  for (const t of targets) engine.unregister(t);
  targets = [];
  for (const v of views) {
    if (v.parent) v.parent.removeChild(v);
    if (!v.destroyed) v.destroy({ children: true });
  }
  views = [];
  for (const w of windows) w.handle?.stop();
  windows = [];
  floorLights = [];
}

function addSprite(engine, row, bounds) {
  const base = textureFromUrl(artUrl(row.piece));
  const s = new engine.PIXI.Sprite(row.frame ? frameTexture(base, new engine.PIXI.Rectangle(...row.frame)) : base);
  anchorBottomCentre(s, 'deco');
  s.x = row.x - bounds.l;
  s.y = row.y - bounds.t;
  s.width = row.w;
  s.height = row.h;
  if (row.flip) s.scale.x = -Math.abs(s.scale.x);
  if (row.alpha) s.alpha = row.alpha;
  s.zIndex = row.z;
  s.eventMode = 'none';
  engine.entityLayer.addChild(s);
  views.push(s);
  return s;
}

function drawStation(engine, street, station) {
  const b = street.bounds;
  // The station's art is the street's own (subway.js stationDecos, #482); the two things it clicks stay here.
  // A Red Button on the green gate box's face, under the grille, as the 2012 snaps show it (G838, #385);
  // it stood on the stone block beside the box before.
  // #509: 27 x 47 at x 433, as the snaps show it (it was 26 x 45 at 437); G1221 (#619): mirrored, as the snaps show it.
  const button = addSprite(engine, STATION_BUTTON, b);
  button.eventMode = 'static';
  button._worldHitW = 150;
  button._worldHitH = 200;
  targets.push(engine.register({
    classId: 'subway_gate',
    featureId: SUBWAY_FEATURE_ID,
    label: TEXT.gateLabel,
    subtitle: `${TEXT.gateTooltip} · ${FARE} currants`,
    sprite: button,
    subway: 'gate',
    // #509: mounted at the gate box's edge, so a route's halo would spill onto the floor: none (map-routes glowTarget).
    glowNone: true,
  }));
  // The Subway Map post where the station's snap shows it (subway.js STATION_SPOTS).
  const [mapX, mapY] = stationSpots(station).map;
  const post = addSprite(engine, { piece: 'subway_map', x: mapX, y: mapY, w: 95, h: 160, z: 4 }, b);
  post.eventMode = 'static';
  targets.push(engine.register({
    classId: 'subway_map',
    featureId: SUBWAY_FEATURE_ID,
    label: TEXT.mapLabel,
    subtitle: TEXT.mapTooltip,
    sprite: post,
    subway: 'map',
  }));
}

function drawCar(engine, street) {
  const b = street.bounds;
  const { PIXI } = engine;
  // The car's wall, ads and panes are the street's own (subway.js carDecos, #482).
  // The black of the tile's last rows, under the carried-on floor (a view taller than the car).
  const under = new PIXI.Graphics().rect(0, CAR_TILE_TOP + 700 + CAR_FLOOR_RUN - b.t - 2, b.r - b.l, 900).fill(CAR_UNDERFLOOR);
  under.zIndex = -71;
  under.eventMode = 'none';
  engine.entityLayer.addChild(under);
  views.push(under);
  for (const cx of CAR_WINDOWS) {
    // G398: while the train moves, Tiny Speck's subway_window overlay plays over the pane (setMoving).
    windows.push({ engine, x: cx - b.l, y: CAR_WINDOW_BOTTOM - b.t, handle: null });
  }
  for (const cx of CAR_FLOOR_LIGHTS) {
    const s = addSprite(engine, { piece: 'subway_interior_floor_light', x: cx, y: CAR_FLOOR + 30, w: 605, h: 87, z: -8 }, b);
    s.visible = false;
    s._baseX = s.x;
    floorLights.push(s);
  }
}

/**
 * G398 locations/inc_transit.js transit_start_subway_windows 426-470: on departure the car gets
 * three subway_window location_overlays (275 x 161, 1:1, at_bottom), the tunnel sliding past
 * behind the glass, until the train stops (transit_stop_subway_windows). The overlay is
 * subway_window_overlay.fla (CC0; the published 1296275255_7402.swf is not archived): its own
 * frame drawn over the static pane at the same centre and bottom, under everything in the car.
 */
function setMoving(moving) {
  for (const w of windows) {
    if (moving && !w.handle) {
      const use = OVERLAY_USES.subway_window;
      w.handle = playOverlay(w.engine.PIXI, 'subway_window', {
        layer: w.engine.entityLayer,
        at: () => ({ x: w.x, y: w.y }),
        wh: use.wh,
        durationMs: use.durationMs,
        loop: use.loop,
        zIndex: -61,
      });
    } else if (!moving && w.handle) {
      w.handle.stop();
      w.handle = null;
    }
  }
  for (const s of floorLights) s.visible = moving;
}

function animateCar(now) {
  if (!ride || ride.phase !== 'moving') return;
  const t = now / 1000;
  for (const s of floorLights) {
    const p = (t * 1.6) % 1;
    s.x = s._baseX + 240 - p * 480;
    s.alpha = 0.55 * Math.sin(p * Math.PI);
  }
}

/* ------------------------------------------------------------------ */
/* The gate                                                            */
/* ------------------------------------------------------------------ */

function hasPapers(engine) {
  return gateTerms(engine).hasPapers;
}

function pushGate(engine) {
  const station = here(engine);
  if (!station) return true;
  engine.playSound('SUBWAY_BUTTON', { volume: 0.6 });
  const refusal = gateFor(engine);
  engine.setData('subwayLast', refusal ? `refused:${refusal.code}` : 'ticket');
  if (refusal) {
    openDialog(engine, { id: `refused-${refusal.code}`, kicker: TEXT.gateLabel, paras: [refusal.text], choices: [{ label: TEXT.ok, value: 'ok', primary: true }] }, () => {
      if (refusal.code !== 'papers') return;
      // subway_gate.js 158: no card yet, so on to Legalize It (game.js: the quest's way into The Back Alley).
      if (engine.papersRefused?.()) return;
      const hint = papersHint({
        hasCardBadge: (engine.unlockedAchievements || []).includes(CARD_BADGE),
        hasPapersItem: countItem(engine.inv, 'your_papers') > 0,
        hasCardItem: countItem(engine.inv, CARD_BADGE) > 0,
      });
      if (hint) openDialog(engine, { id: 'papers-hint', kicker: TEXT.gateLabel, paras: [hint], choices: [{ label: TEXT.ok, value: 'ok', primary: true }] });
    });
    return true;
  }
  const offer = ticketOffer(station.id);
  openDialog(engine, {
    id: 'ticket',
    kicker: TEXT.gateLabel,
    title: offer.title,
    paras: [offer.text],
    lines: offer.lines,
    choices: offer.choices.map((c) => ({ ...c, primary: c.value !== 'no-pay' })),
  }, (value) => {
    if (value === 'pay-forwards') buyTicket(engine, station, 'forwards');
    else if (value === 'pay-backwards') buyTicket(engine, station, 'backwards');
  });
  return true;
}

function buyTicket(engine, station, direction) {
  const gate = engine.travelGate(CAR_TSID, { via: 'subway' });
  if (gate && gate.ok === false) {
    engine.toast(gate.msg || 'You cannot go through right now.');
    engine.setData('subwayLast', 'gate');
    return false;
  }
  if (!payFare(engine.pc)) {
    engine.setData('subwayLast', 'broke');
    openDialog(engine, { id: 'broke', kicker: TEXT.gateLabel, paras: [TEXT.cantAfford], choices: [{ label: TEXT.ok, value: 'ok', primary: true }] });
    return false;
  }
  engine.playSound('PAY_50_CURRANTS', { volume: 0.6 });
  engine.updateHud();
  engine.setData('subwayLast', `paid:${direction}`);
  pendingBoard = { stop: station.id, direction };
  // Multiplayer: a seat on the shared train first (subway.go board); the car once it answers.
  const client = mpClient(engine);
  if (client && client.state === 'online' && client.send('subway_board', { station: station.id, line: direction })) {
    pendingBoard.until = Date.now() + BOARD_ANSWER_MS;
    engine.setData('subwayLast', `asked:${direction}`);
    return true;
  }
  enterCar(engine);
  return true;
}

async function enterCar(engine) {
  if (pendingBoard) pendingBoard.until = 0;
  const spot = boardingSpot();
  // #674: the ticket moved you by teleport (inc_transit.js 176 instances_enter), and the car's hub (66)
  // is never a station's, so the trip plays TELEPORT_AWAY_HUB after PAY_50_CURRANTS (player.js 674-678).
  const ok = await engine.enter(CAR_TSID, { spawnX: spot.x, spawnY: spot.y, teleport: true });
  // R46: the car never loaded (the trip said so): no ticket used, so the fare comes back, as the
  // source's transit_refund_fare did for a boarding that did not happen.
  if (ok === false && pendingBoard && !inCar(engine)) {
    pendingBoard = null;
    engine.pc.currants = (Number(engine.pc.currants) || 0) + FARE;
    engine.updateHud();
    engine.setData('subwayLast', 'board-failed');
  }
  return ok;
}

/* ------------------------------------------------------------------ */
/* Multiplayer: shared trains                                          */
/* ------------------------------------------------------------------ */

const isMp = (engine) => engine?.mode === 'multiplayer' && Boolean(engine.query?.('realtimeClient'));

function mpClient(engine) {
  if (!isMp(engine)) return null;
  if (mp) return mp.client;
  const client = engine.query('realtimeClient');
  mp = { client };
  client.on('msg:subway_train', (msg) => onTrain(engine, trainOf(msg)));
  client.on('msg:subway_refused', () => {
    if (!pendingBoard?.until) return;
    // Ours: no seat (the platform changed under the ticket): transit_refund_fare gives the fare back.
    pendingBoard = null;
    engine.pc.currants = (Number(engine.pc.currants) || 0) + FARE;
    engine.updateHud();
    engine.setData('subwayLast', 'refused:server');
    openDialog(engine, { id: 'refused-server', kicker: TEXT.gateLabel, paras: [SUBWAY_MP_TEXT.refused], choices: [{ label: TEXT.ok, value: 'ok', primary: true }] });
  });
  return client;
}

function announceWaiting(engine) {
  if (!ride?.initial || !ride.need || ride.phase === 'moving') return;
  const secs = Math.max(1, Math.round((ride.departAt - Date.now()) / 1000));
  showAnnouncement(engine, SUBWAY_MP_TEXT.waiting(ride.need, secs), 5000);
}

function onTrain(engine, train) {
  if (!train) return;
  if (pendingBoard?.until) {
    pendingBoard.train = train;
    engine.setData('subwayTrain', train.train);
    enterCar(engine);
    return;
  }
  if (!ride || ride.train !== train.train) return;
  const before = ride.riders || [];
  const need = ride.need;
  applyTrain(ride, train, Date.now());
  const { on, off } = riderChanges(before, train.riders, mp?.client?.me?.id || 0);
  for (const name of on) engine.pushActivity?.(SUBWAY_MP_TEXT.boarded(name));
  for (const name of off) engine.pushActivity?.(SUBWAY_MP_TEXT.gotOff(name));
  if (ride.need !== need || on.length) announceWaiting(engine);
  engine.setData('subwayRiders', train.riders.length);
}

/* ------------------------------------------------------------------ */
/* The ride                                                            */
/* ------------------------------------------------------------------ */

function stopTravelSound() {
  travelLoop?.stop?.();
  travelLoop = null;
}

function board(engine) {
  const { stop, direction } = pendingBoard;
  const train = pendingBoard.train || null;
  pendingBoard = null;
  ride = createRide({ stop, direction, now: Date.now(), timing: rideTiming(train ? 1 : fastScale(engine)) });
  if (train) applyTrain(ride, train, Date.now());
  state = { ...state, stop, direction, inCar: true, rides: (state.rides || 0) + 1 };
  // transit_schedule_departure: one count per boarding.
  engine.achievement(RIDE_COUNTER, 1);
  if (train && ride.initial && ride.need) announceWaiting(engine);
  else showAnnouncement(engine, announce.boarding(Math.max(1, Math.round((ride.departAt - Date.now()) / 1000))), 5000);
  engine.setData('subwayRiders', train ? train.riders.length : '');
  engine.save();
}

function getOffPrompt(engine, station) {
  openDialog(engine, {
    id: 'get-off',
    // The stop you picked on the line map: the prompt says so (it asks at every stop, as the source did).
    kicker: chosenStop === station.id ? lineText.yourStop : CAR_LABEL_KICKER,
    paras: [announce.getOff(station.name)],
    choices: [{ label: TEXT.yes, value: 'yes', primary: true }, { label: TEXT.no, value: 'no' }],
    // #387: it pops up mid-ride, so it never takes the keyboard (a Space meant elsewhere pressed yes).
    // No answer keeps you riding, as the source's prompt timing out (inc_transit.js 378-392).
    focus: false,
    timeoutMs: ride.timing.prompt,
  }, (value) => {
    if (value === 'yes') disembark(engine);
  });
}
const CAR_LABEL_KICKER = SUBWAY_LINE.car.label;

/**
 * Get off at this stop. G1139 (#614): the ride stays until the station is up (the station's
 * onStreetEnter ends it), as Glitch's server kept the ride and moved you itself
 * (players/player.js transit_disembark_callback 2707, teleportToLocationDelayed). A trip that
 * fails (engine.enter false, R46) leaves you riding: the stop asks again while the doors are open,
 * else the next one does.
 */
async function disembark(engine) {
  if (gettingOff || !canDisembark(ride)) return false;
  const station = stationById(ride.stop);
  gettingOff = station.id;
  clearAnnouncement();
  closeLineMap(engine);
  engine.setData('subwayLast', `leaving:${station.id}`);
  const spot = disembarkSpot(station);
  let ok = false;
  try {
    // #674: off the car by teleport too (teleportToLocationDelayed): TELEPORT_AWAY_HUB, hub 66 to the station's.
    ok = (await engine.enter(station.streetTsid, { spawnX: spot.x, spawnY: spot.y, teleport: true })) !== false;
  } finally {
    gettingOff = null;
  }
  if (!ok) {
    engine.setData('subwayLast', `off-failed:${station.id}`);
    if (ride && inCar(engine) && canDisembark(ride) && Date.now() < (Number(ride.doorsAt) || Infinity)) getOffPrompt(engine, station);
    return false;
  }
  engine.setData('subwayLast', `off:${station.id}`);
  engine.save();
  return true;
}

/** G1139: in the car with no ride (a stale route, a trip that failed): nothing will move it on. */
const stranded = (engine) => inCar(engine) && !ride && !pendingBoard && !gettingOff;

/** Where a stranded car lets you out: the platform of the last stop. */
function strandedWayOut() {
  const back = stationById(state.stop) || STATIONS[0];
  const spot = disembarkSpot(back);
  return { tsid: back.streetTsid, x: spot.x, y: spot.y };
}

/** Off a stranded car to the last stop's platform; false when the trip failed (the EXIT stays). */
async function leaveStrandedCar(engine, opts = {}) {
  const to = opts.to?.tsid ? opts.to : strandedWayOut();
  const ok = await engine.enter(to.tsid, {
    ...(Number.isFinite(to.x) ? { spawnX: to.x } : {}),
    ...(Number.isFinite(to.y) ? { spawnY: to.y } : {}),
    ...(opts.transition === false ? { useTransition: false } : {}),
    // #674: off the car is a teleport (a skill's target, or the platform: TELEPORT_AWAY_HUB from hub 66).
    teleport: true,
  });
  if (ok === false) engine.setData('subwayLast', 'stranded-failed');
  return ok !== false;
}

function runRide(engine, now) {
  // QA: &subwayhold=1 keeps the train moving for screenshots.
  if (ride.phase === 'moving' && engine.param('subwayhold') === '1') return;
  for (const ev of stepRide(ride, now)) {
    if (ev.type === 'doors') {
      closeDialog(engine);
      showAnnouncement(engine, announce.doorsClose(ev.next.name), 3000);
      engine.playSound('TRAIN_DEPARTS', { volume: 0.7 });
    } else if (ev.type === 'depart') {
      showAnnouncement(engine, announce.departing(), 2000);
      setMoving(true);
      stopTravelSound();
      travelLoop = engine.playSoundLoop('TRAVELLING_TRAIN', { intervalMs: 1500, volume: 0.35 });
    } else if (ev.type === 'call') {
      showAnnouncement(engine, announce.nextStop(ev.next.name), 3000);
    } else if (ev.type === 'brakes') {
      stopTravelSound();
      engine.playSound('TRAIN_ARRIVES', { volume: 0.7 });
    } else if (ev.type === 'arrive') {
      setMoving(false);
      state = { ...state, stop: ev.station.id };
      showAnnouncement(engine, announce.arrived(ev.station.name), 2000);
      getOffPrompt(engine, ev.station);
      engine.save();
    }
  }
}

/* ------------------------------------------------------------------ */
/* QA                                                                  */
/* ------------------------------------------------------------------ */

function demoStation(engine) {
  const raw = engine.param('subwaydemo');
  return raw ? findStation(raw === '1' ? 'Gregarious Grange' : raw) : null;
}

const clickChoice = (value) => dialog?.el.querySelector(`button[data-value="${value}"]`)?.click();

let qaPapersDone = false;
function demoStep(engine, now) {
  // &subwaypapers=1 without a subway demo too (a Map route that rides the subway, xalanga-open3 QA).
  if (!qaPapersDone && engine.started && engine.param('subwaypapers') === '1') {
    qaPapersDone = true;
    if (!hasPapers(engine)) engine.grantAchievement?.(PAPERS_BADGE);
  }
  const station = demoStation(engine);
  if (!station || demo.stage === 'done' || now < demo.at) return;
  const mode = engine.param('subwayautoplay') || '';
  const dir = engine.param('subwayline') === 'backwards' ? 'backwards' : 'forwards';
  const set = (stage, wait = 0) => {
    demo = { stage, at: now + wait };
    engine.setData('subwayDemo', stage);
  };
  if (demo.stage === 'idle') {
    if (engine.param('subwaypapers') === '1' && !hasPapers(engine)) engine.grantAchievement?.(PAPERS_BADGE);
    const currants = Number(engine.param('subwaycurrants'));
    if (Number.isFinite(currants) && engine.param('subwaycurrants') !== null) {
      engine.pc.currants = currants;
      engine.updateHud();
    }
    if (engine.streetTsid !== station.streetTsid) {
      const spot = stationArrival(-760);
      set('away');
      engine.enter(station.streetTsid, { spawnX: spot.x, spawnY: spot.y });
    } else set('placed', 600);
    return;
  }
  if (demo.stage === 'away') return; // onStreetEnter moves it on
  if (demo.stage === 'placed') {
    if (!mode) return set('done');
    // Let the You Have Papers! award (subwaypapers=1) finish first.
    const award = document.getElementById('award-screen');
    if (award && !award.hidden) return set('placed', 400);
    if (mode === 'map') {
      openMap(engine, { direction: dir });
      return set('done');
    }
    // Walk-free: stand at the gate, on the platform's side of it (G1221), and push.
    const spot = stationScreen(STATION_GATE_WALL.x - 24);
    engine.player.x = spot.x;
    engine.player.y = spot.y;
    engine.player.vx = 0;
    engine.snapCamera();
    pushGate(engine);
    return set(mode === 'gate' ? 'done' : 'ticket', 900);
  }
  if (demo.stage === 'ticket') {
    if (dialog?.id !== 'ticket') return set('done');
    clickChoice(dir === 'backwards' ? 'pay-backwards' : 'pay-forwards');
    return set('riding', 500);
  }
  if (demo.stage === 'riding') {
    if (mode === 'ride' && ride?.phase === 'moving') return set('done');
    if (dialog?.id === 'get-off') {
      clickChoice('yes');
      return set('off', 500);
    }
    return;
  }
  if (demo.stage === 'off') {
    const st = here(engine);
    if (!st || mode !== '1') return st ? set('done') : undefined;
    const spot = stationScreen(STATION_X.stairs + 30);
    engine.player.x = spot.x;
    engine.player.y = spot.y;
    engine.player.vx = 0;
    engine.snapCamera();
    const door = engine.interactables.find((t) => t.classId === 'street_door' && t.door?.id === 'door_subway_stairs');
    if (!door) return set('off', 400);
    // The stairs are an ordinary door: the doors feature runs its Enter.
    doorsFeature.runVerb(door, 'enter', engine);
    return set('stairs', 400);
  }
}

/* ------------------------------------------------------------------ */
/* Feature                                                             */
/* ------------------------------------------------------------------ */

function publish(engine, now = Date.now(), force = false) {
  if (!force && now - lastData < DATA_MS) return;
  lastData = now;
  const station = here(engine);
  engine.setData('subwayStation', station ? station.id : inCar(engine) ? 'car' : '');
  engine.setData('subwayPhase', ride ? ride.phase : '');
  engine.setData('subwayNext', ride ? rideNext(ride)?.name || '' : '');
  engine.setData('subwayStops', ride ? ride.stops : '');
  engine.setData('subwayRides', state.rides || 0);
  engine.setData('subwayWindows', windows.length && windows[0].handle ? 'moving' : windows.length ? 'still' : '');
  engine.setData('subwayWindowArt', windows[0]?.handle?.art || '');
}

export const subwayFeature = {
  id: SUBWAY_FEATURE_ID,

  init(engine) {
    if (demoStation(engine)) engine.setData('subwayDemo', 'idle');
  },

  save() {
    return state;
  },

  restore(slice) {
    const s = slice && typeof slice === 'object' ? slice : {};
    state = {
      rides: Math.max(0, Math.floor(Number(s.rides) || 0)),
      stop: stationById(s.stop) ? Number(s.stop) : null,
      direction: s.direction === 'backwards' ? 'backwards' : 'forwards',
      inCar: !!s.inCar,
    };
  },

  /**
   * Surface entrances: their archived doors name the station tsids; point them at the rebuilt stations.
   * Each entrance also carries its station's name (`subwayStation`): the street map shows it (#463,
   * js/ui/street-minimap.js stationMarks).
   */
  prepareStreet(street) {
    let linked = 0;
    for (const door of street?.doors || []) {
      const station = door?.connect ? stationByTsid(door.connect.tsid) : null;
      if (!station) continue;
      door.subwayStation = station.label;
      if (door.connect.street) continue;
      door.connect.street = station.streetTsid;
      door.connect.arrive = stationArrival(door.connect.x);
      linked += 1;
    }
    if (linked) street._subwayLinked = linked;
  },

  /** No animals, trees, rocks or vendors underground. */
  ecologyOverride(street) {
    const station = stationByTsid(street?.tsid);
    if (station) return { label: station.label, sourceTsid: station.tsid, counts: {}, empty: true };
    if (isCarTsid(street?.tsid)) return { label: SUBWAY_LINE.car.label, sourceTsid: SUBWAY_LINE.template_tsid, counts: {}, empty: true };
    return null;
  },

  onStreetEnter(street, engine) {
    generation += 1;
    clearViews(engine);
    closeDialog(engine);
    closeLineMap(engine);
    if (!isCarTsid(street?.tsid)) {
      chosenStop = null;
      engine.setData('subwayChosen', '');
    }
    const station = stationByTsid(street?.tsid);
    engine.setData('subwayLinked', street?._subwayLinked || 0);
    if (station) {
      drawStation(engine, street, station);
      ride = null;
      stopTravelSound();
      setMoving(false);
      state = { ...state, stop: station.id, inCar: false };
    } else if (isCarTsid(street?.tsid)) {
      drawCar(engine, street);
      if (pendingBoard) board(engine);
      else if (!ride) {
        // In the train with no ride (a stale route): back to the platform of the last stop. G1139:
        // should that trip fail, the car's EXIT and /stuck lead there (deadEndRun, questRoomLeave).
        leaveStrandedCar(engine);
      }
      setMoving(ride?.phase === 'moving');
    } else {
      // Left the train by other means (map, teleport): the ride ends.
      if (ride) clearAnnouncement();
      ride = null;
      pendingBoard = null;
      stopTravelSound();
      if (state.inCar) state = { ...state, inCar: false };
    }
    if (demo.stage === 'away' && station && station === demoStation(engine)) {
      demo = { stage: 'placed', at: Date.now() + 1200 };
      engine.setData('subwayDemo', 'placed');
    }
    if (demo.stage === 'stairs' && !station && !isCarTsid(street?.tsid)) {
      demo = { stage: 'done', at: 0 };
      engine.setData('subwayDemo', `surface:${street?.tsid || ''}`);
    }
    publish(engine, Date.now(), true);
  },

  onStreetClear(engine) {
    generation += 1;
    clearViews(engine);
  },

  onTick(_dt, now, engine) {
    if (!engine.started) return;
    const t = Date.now();
    if (pendingBoard?.until && t >= pendingBoard.until) {
      // No answer from the server: ride alone, as in solo.
      engine.setData('subwayLast', 'alone');
      enterCar(engine);
    }
    // G1139: not while a stop's trip loads (the ride waits for it, and goes on should it fail).
    if (ride && inCar(engine) && !gettingOff) {
      runRide(engine, t);
      animateCar(t);
      if (lineMap && lineKey(lineView(ride, chosenStop)) !== lineMap.key) drawLineMap(engine);
      placeLineStar(engine, t);
    }
    if (dialog?.until && t >= dialog.until) {
      const cb = dialog.onTimeout;
      closeDialog(engine);
      cb?.();
    }
    if (announceTimer && t >= announceTimer) clearAnnouncement();
    demoStep(engine, t);
    publish(engine, t);
  },

  verbsFor(target) {
    if (target?.subway === 'gate') return [{ id: 'push', label: 'Push', enabled: true, durationMs: 0, tooltip: TEXT.gateTooltip }];
    if (target?.subway === 'map') return [{ id: 'view', label: 'View', enabled: true, durationMs: 0, tooltip: TEXT.mapTooltip }];
    return [];
  },

  runVerb(target, verbId, engine) {
    if (target?.subway === 'gate' && verbId === 'push') return pushGate(engine);
    if (target?.subway === 'map' && verbId === 'view') {
      openMap(engine);
      engine.pushActivity?.(TEXT.mapViewed);
      return true;
    }
    return false;
  },

  /**
   * game.js openMap (M, the map button, Classic's too): on the train it opens the line you are
   * riding instead of the world map, and M again closes it (HubMapDialog.as start 926-930: riding,
   * the client opened the transit map). Off the train, the world map as before.
   */
  openMapOverride(engine) {
    if (!inCar(engine) || !ride) return false;
    if (lineMap) return closeLineMap(engine);
    return openLineMap(engine);
  },

  /**
   * The street the Map marks "you" on underground: a station's surface street, or in the
   * train its last stop's (the stations and the train are on no hub map; the client showed
   * the parent street, HubMapDialog.as start, mapInfo.showStreet).
   */
  mapStreet(engine) {
    const station = here(engine) || (inCar(engine) ? stationById(state.stop) || null : null);
    return station ? { tsid: station.surfaceStreetTsid, hubId: station.surfaceHubId } : null;
  },

  /**
   * G888: a ride owns the car's way off (its stops): no dead-end exit. G1139 (#614): only while
   * there is one; a car with no ride (stranded) shows the EXIT, to the last stop's platform.
   */
  deadEndRun(engine) {
    return inCar(engine) && (ride || pendingBoard || gettingOff) ? 'subway' : null;
  },

  /** G1139: where the EXIT in a stranded car leads (features/dead-ends-feature.js wayOut). */
  deadEndWayOut(engine) {
    return stranded(engine) ? strandedWayOut() : null;
  },

  /** G1139: /stuck and I'm stuck in a stranded car take you off it (slash-commands-feature stuck). */
  questRoomHere(engine) {
    return stranded(engine) ? { title: SUBWAY_LINE.car.label, solved: true, stray: true, stuckLine: TEXT.strandedOff } : null;
  },

  /** G1139: off a stranded car (the EXIT, /stuck, a teleport's `to`); null elsewhere. */
  questRoomLeave(engine, opts = {}) {
    return stranded(engine) ? leaveStrandedCar(engine, opts) : null;
  },

  /** A reload in the train resumes on the platform of its last stop. */
  reloadLocation(saved) {
    if (!saved || !isCarTsid(saved.tsid)) return null;
    const back = stationById(state.stop) || STATIONS[0];
    const spot = disembarkSpot(back);
    state = { ...state, inCar: false };
    return { tsid: back.streetTsid, x: spot.x, y: spot.y };
  },

  /** realtime-feature sharedStreet: riders of one shared train are on its own street (subway.go TRAIN_<id>). */
  realtimeStreet(engine) {
    return ride?.street && inCar(engine) ? ride.street : null;
  },

  /** A rider's place in a party roster (party-feature streetLabel): the train, not TRAIN_<id>. */
  labelFor(tsid) {
    if (!/^TRAIN_[0-9A-F]{16}$/.test(String(tsid || ''))) return null;
    return { street: SUBWAY_LINE.car.label, hub: '', hubId: 'scene' };
  },

  /** QA / tests. */
  _state() {
    return { state: { ...state }, ride: ride ? { ...ride, timing: undefined } : null, dialog: dialog?.id || '', windows: windows.length, lineMap: lineMap?.key || '', chosenStop, gettingOff };
  },

  /** Tests (G1139, #674): a ride to set, the Get off answer, the ticket and the boarding trip, as the dialogs run them. */
  _test: {
    setRide(r, extra = {}) {
      ride = r;
      if ('state' in extra) state = { ...state, ...extra.state };
      if ('pendingBoard' in extra) pendingBoard = extra.pendingBoard;
    },
    disembark,
    enterCar,
    buyTicket,
  },
};
