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

import { countItem } from '../inventory.js?v=b7609342';
import { doorsFeature } from './doors-feature.js?v=f76198ff';
import { frameTexture, textureFromUrl } from '../textures.js?v=3149d699';
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
  DUBIOUS_BUFF,
  FARE,
  LINE_COLOURS,
  PAPERS_BADGE,
  RIDE_COUNTER,
  STATIONS,
  STATION_FLOOR,
  STATION_X,
  SUBWAY_ART,
  SUBWAY_ART_BASE,
  SUBWAY_LINE,
  TEXT,
  announce,
  boardingSpot,
  canDisembark,
  carArt,
  createRide,
  disembarkSpot,
  findStation,
  gateRefusal,
  isCarTsid,
  lineName,
  lineText,
  lineView,
  nextStation,
  papersHint,
  payFare,
  rideNext,
  rideTiming,
  stationArrival,
  stationArt,
  stationById,
  stationByTsid,
  stationScreen,
  stepRide,
  ticketOffer,
} from '../subway.js?v=44d1a09f';
import { BOARD_ANSWER_MS, SUBWAY_MP_TEXT, applyTrain, riderChanges, trainOf } from '../subway-mp.js?v=ffd57d82';

export const SUBWAY_FEATURE_ID = 'subway';
const STYLE_ID = 'subway-feature-style';
const DATA_MS = 250;

let state = { rides: 0, stop: null, direction: 'forwards', inCar: false };
let views = [];
let targets = [];
let windows = []; // { tunnel, lamp, mask }
let floorLights = [];
let ride = null;
let pendingBoard = null;
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
.subway-map { position: absolute; inset: 0; z-index: calc(var(--z-notice) + 10); display: grid; place-items: center; background: color-mix(in srgb, var(--c-grey-20) 35%, transparent); }
.subway-map-card { width: 620px; max-width: calc(100% - 32px); background: var(--surface-moss); border-radius: var(--radius-xl); box-shadow: var(--shadow-3);
  padding: .7rem var(--sp-7) .8rem; font: var(--fs-base)/var(--lh-snug) var(--font-ui); color: var(--c-grey-29); }
.subway-map-head { display: flex; align-items: center; gap: var(--sp-4); }
.subway-map-head h3 { margin: 0; flex: 1; text-align: center; font-size: var(--fs-2xl); }
.subway-map-head button { font: inherit; border: 0; background: none; cursor: pointer; }
.subway-map-lines button { border-radius: var(--radius-pill); padding: var(--sp-1) var(--sp-5); font-size: var(--fs-sm); font-weight: 700; border: 2px solid transparent; background: var(--surface-sunken); }
.subway-map-lines button[aria-pressed="true"] { border-color: currentColor; background: var(--surface-bright); }
.subway-map-close { font-size: var(--fs-3xl); color: var(--c-red-58b); line-height: var(--lh-none); padding: 0 .2rem; }
.subway-map svg { display: block; width: 100%; height: auto; max-height: min(400px, calc(100vh - 260px)); margin-top: .3rem; }
.subway-map-foot { text-align: center; margin: .3rem 0 0; color: var(--text-muted); font-size: var(--fs-md); }
.subway-line-card { width: 860px; }
.subway-line-head h3 { text-align: left; display: flex; align-items: center; gap: var(--sp-3); }
.subway-line-head .subway-dot { display: inline-block; width: .8rem; height: .8rem; border-radius: var(--radius-round); }
.subway-line-head .subway-line-car { font-size: var(--fs-sm); font-weight: 400; color: var(--text-muted); }
.subway-line-body { display: grid; grid-template-columns: minmax(0, 1fr) 15.5rem; gap: var(--sp-5); align-items: start; }
.subway-line-body svg .moving { filter: grayscale(1); opacity: .75; }
.subway-line-body svg .stop-hit { cursor: pointer; }
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
  dialog.el.remove();
  dialog = null;
  engine?.setData('subwayDialog', '');
}

/**
 * A conversation card: { kicker, title, paras, lines, choices: [{ label, value, primary }], timeoutMs, onTimeout }.
 * onChoice(value) runs after it closes.
 */
function openDialog(engine, opts, onChoice) {
  ensureStyle();
  closeDialog(engine);
  const el = document.createElement('div');
  el.className = 'subway-dialog glitch-modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'false');
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
  engine.setData('subwayDialog', opts.id || 'open');
  actions.querySelector('button')?.focus({ preventScroll: true });
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
  const svgHost = document.createElement('div');
  const foot = document.createElement('p');
  foot.className = 'subway-map-foot';
  foot.textContent = TEXT.mapViewed;
  card.append(head, svgHost, foot);
  el.appendChild(card);
  el.addEventListener('click', (e) => {
    if (e.target === el) close.click();
  });
  const draw = (dir) => {
    svgHost.innerHTML = mapSvg(station, dir);
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

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Which side of its dot each name sits, as on the Subway System map in bvOH7rsQ6qo t0016. */
const LABEL_SIDE = Object.freeze({ 11: 'above', 10: 'above', 9: 'right', 7: 'right', 12: 'left', 6: 'right', 1: 'right', 3: 'left', 8: 'above', 2: 'right', 4: 'left', 5: 'right' });

function mapSvg(station, direction) {
  const colour = LINE_COLOURS[direction];
  const pts = STATIONS.map((s) => ({ s, x: s.map_pos[0] + 60, y: s.map_pos[1] + 30 }));
  const at = (id) => pts.find((p) => p.s.id === id);
  let path = '';
  let arrows = '';
  for (const p of pts) {
    const q = at(p.s.next_stop);
    path += `M${p.x},${p.y} L${q.x},${q.y} `;
    const [a, b] = direction === 'backwards' ? [q, p] : [p, q];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    arrows += `<path d="M-6,-5 L5,0 L-6,5 Z" fill="${colour}" transform="translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${ang.toFixed(1)})"/>`;
  }
  const next = station ? nextStation(station.id, direction) : null;
  const dots = pts.map((p) => {
    const side = LABEL_SIDE[p.s.id] || 'right';
    const tx = side === 'right' ? p.x + 12 : side === 'left' ? p.x - 12 : p.x;
    const anchor = side === 'right' ? 'start' : side === 'left' ? 'end' : 'middle';
    const ty = side === 'above' ? p.y - 22 : p.y - 2;
    const marker = station && p.s.id === station.id
      ? `<image href="${artUrl(direction === 'backwards' ? 'subway_map_current_station_blue' : 'subway_map_current_station_red')}" x="${p.x - 15}" y="${p.y - 14}" width="30" height="27"/>`
      : `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#fff" stroke="${colour}" stroke-width="2.5"/>`;
    return `${marker}<text x="${tx}" y="${ty}" text-anchor="${anchor}" font-weight="700" font-style="italic" font-size="13" fill="#2b2a26">${esc(p.s.name)}</text>`
      + `<text x="${tx}" y="${ty + 13}" text-anchor="${anchor}" font-style="italic" font-size="11" fill="#8f8a7a">${esc(p.s.hubName)}</text>`;
  }).join('');
  const nextNote = next
    ? `<text x="690" y="440" text-anchor="end" font-size="12" fill="${colour}">Next stop:</text><text x="690" y="458" text-anchor="end" font-size="15" font-weight="700" fill="${colour}">${esc(next.name)}</text>`
    : '';
  return `<svg viewBox="110 0 590 475" role="img" aria-label="${esc(TEXT.mapTitle)}"><rect x="110" width="590" height="475" rx="8" fill="#eceadb"/>`
    + `<path d="${path}" fill="none" stroke="${colour}" stroke-width="3" stroke-linecap="round" opacity=".9"/>${arrows}${dots}${nextNote}</svg>`;
}

/**
 * M on the train (Austin 2026-11-01): the line you are riding, as the client's transit map showed it
 * while riding (MapTransit.as setPlayerLocation 180-240; js/subway.js lineView): that line only, the
 * train's station marked (grey while it moves), the next stop, the stops in order, and the stop you
 * picked to get off at. The markers are the Subway Map's own (glitch-items misc/subway_map, CC0).
 */
function lineSvg(view) {
  const colour = view.colour;
  const pts = STATIONS.map((s) => ({ s, x: s.map_pos[0] + 60, y: s.map_pos[1] + 30 }));
  const at = (id) => pts.find((p) => p.s.id === id);
  const blue = view.direction === 'backwards';
  let path = '';
  let arrows = '';
  for (const p of pts) {
    const q = at(p.s.next_stop);
    path += `M${p.x},${p.y} L${q.x},${q.y} `;
    const [a, b] = blue ? [q, p] : [p, q];
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    arrows += `<path d="M-6,-5 L5,0 L-6,5 Z" fill="${colour}" transform="translate(${((a.x + b.x) / 2).toFixed(1)},${((a.y + b.y) / 2).toFixed(1)}) rotate(${ang.toFixed(1)})"/>`;
  }
  const dots = pts.map((p) => {
    const side = LABEL_SIDE[p.s.id] || 'right';
    const tx = side === 'right' ? p.x + 14 : side === 'left' ? p.x - 14 : p.x;
    const anchor = side === 'right' ? 'start' : side === 'left' ? 'end' : 'middle';
    const mine = view.chosen?.id === p.s.id;
    // Above its dot, a name clears the ring round your stop.
    const ty = side === 'above' ? p.y - (mine ? 32 : 22) : p.y - 2;
    const isHere = p.s.id === view.at.id;
    const isNext = view.next && p.s.id === view.next.id;
    let mark = `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#fff" stroke="${colour}" stroke-width="2.5"/>`;
    if (isNext) mark = `<image href="${artUrl(blue ? 'subway_map_next_stop_blue' : 'subway_map_next_stop_red')}" x="${p.x - 12}" y="${p.y - 11.5}" width="24" height="23"/>`;
    if (isHere) mark = `<image class="${view.moving ? 'moving' : ''}" href="${artUrl(blue ? 'subway_map_current_station_blue' : 'subway_map_current_station_red')}" x="${p.x - 15}" y="${p.y - 14}" width="30" height="27"/>`;
    const ring = mine ? `<circle cx="${p.x}" cy="${p.y}" r="15" fill="none" stroke="#2b2a26" stroke-width="2.5" stroke-dasharray="4 3"/>` : '';
    const hint = mine ? ` (${lineText.yourStop.toLowerCase()})` : '';
    return `<g class="stop-hit" data-stop="${p.s.id}"><title>${esc(p.s.name)}${hint}</title><circle cx="${p.x}" cy="${p.y}" r="18" fill="transparent"/>${ring}${mark}`
      + `<text x="${tx}" y="${ty}" text-anchor="${anchor}" font-weight="700" font-style="italic" font-size="13" fill="#2b2a26">${esc(p.s.name)}</text>`
      + `<text x="${tx}" y="${ty + 13}" text-anchor="${anchor}" font-style="italic" font-size="11" fill="#8f8a7a">${mine ? esc(lineText.yourStop) : esc(p.s.hubName)}</text></g>`;
  }).join('');
  return `<svg viewBox="110 0 590 475" role="img" aria-label="${esc(lineText.title(view.lineName))}"><rect x="110" width="590" height="475" rx="8" fill="#eceadb"/>`
    + `<path d="${path}" fill="none" stroke="${colour}" stroke-width="3" stroke-linecap="round" opacity=".9"/>${arrows}${dots}</svg>`;
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
  for (const g of lineMap.svg.querySelectorAll('[data-stop]')) g.addEventListener('click', () => chooseStop(engine, Number(g.dataset.stop)));
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
  lineMap = { el, card, title, svg, now, next, mine, list, key: '' };
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
  windows = [];
  floorLights = [];
}

function addSprite(engine, row, bounds) {
  const base = textureFromUrl(artUrl(row.piece));
  const s = new engine.PIXI.Sprite(row.frame ? frameTexture(base, new engine.PIXI.Rectangle(...row.frame)) : base);
  s.anchor.set(0.5, 1);
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
  for (const row of stationArt(station)) addSprite(engine, row, b);
  // A Red Button, on the gate block's face.
  const button = addSprite(engine, { piece: 'subway_gate', x: STATION_X.gate + 26, y: STATION_FLOOR - 70, w: 27, h: 47, z: 4 }, b);
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
  }));
  const post = addSprite(engine, { piece: 'subway_map', x: STATION_X.map, y: STATION_FLOOR + 8, w: 95, h: 160, z: 4 }, b);
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
  for (const row of carArt()) addSprite(engine, row, b);
  // The black of the tile's last rows, under the carried-on floor (a view taller than the car).
  const under = new PIXI.Graphics().rect(0, CAR_TILE_TOP + 700 + CAR_FLOOR_RUN - b.t - 2, b.r - b.l, 900).fill(CAR_UNDERFLOOR);
  under.zIndex = -71;
  under.eventMode = 'none';
  engine.entityLayer.addChild(under);
  views.push(under);
  const [, ww, wh] = SUBWAY_ART.subway_window_static;
  for (const cx of CAR_WINDOWS) {
    addSprite(engine, { piece: 'subway_window_static', x: cx, y: CAR_WINDOW_BOTTOM, w: ww, h: wh, z: -62 }, b);
    // The glass (the overlay's mask, ~243 x 135): the tunnel wall slides past it while the train moves.
    const gx = cx - b.l - 121;
    const gy = CAR_WINDOW_BOTTOM - b.t - wh + 13;
    const box = new PIXI.Container();
    box.x = gx;
    box.y = gy;
    box.zIndex = -61;
    box.eventMode = 'none';
    const dark = new PIXI.Graphics().rect(0, 0, 243, 135).fill(0x1e1f1a);
    const tunnel = new PIXI.TilingSprite({ texture: textureFromUrl(artUrl('wall_1')), width: 243, height: 135 });
    tunnel.tileScale.set(0.55);
    tunnel.tint = 0x7a7a6e;
    tunnel.alpha = 0.85;
    const lamp = new PIXI.Sprite(textureFromUrl(artUrl('light_1')));
    lamp.anchor.set(0.5);
    lamp.width = 150;
    lamp.height = 50;
    lamp.y = 24;
    lamp.alpha = 0.8;
    const glare = new PIXI.Graphics().roundRect(0, 0, 243, 135, 14).fill({ color: 0xffffff, alpha: 0.07 });
    const mask = new PIXI.Graphics().roundRect(0, 0, 243, 135, 14).fill(0xffffff);
    box.addChild(dark, tunnel, lamp, glare, mask);
    box.mask = mask;
    box.visible = false;
    engine.entityLayer.addChild(box);
    views.push(box);
    windows.push({ box, tunnel, lamp, phase: Math.random() });
  }
  for (const cx of CAR_FLOOR_LIGHTS) {
    const s = addSprite(engine, { piece: 'subway_interior_floor_light', x: cx, y: CAR_FLOOR + 30, w: 605, h: 87, z: -8 }, b);
    s.visible = false;
    s._baseX = s.x;
    floorLights.push(s);
  }
}

function setMoving(moving) {
  for (const w of windows) w.box.visible = moving;
  for (const s of floorLights) s.visible = moving;
}

function animateCar(now) {
  if (!ride || ride.phase !== 'moving') return;
  const t = now / 1000;
  for (const w of windows) {
    w.tunnel.tilePosition.x = -((t * 900) % 100000);
    const p = ((t * 1.3 + w.phase) % 1);
    w.lamp.x = 243 + 120 - p * 600;
  }
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
  return (engine.unlockedAchievements || []).includes(PAPERS_BADGE);
}

function pushGate(engine) {
  const station = here(engine);
  if (!station) return true;
  engine.playSound('SUBWAY_BUTTON', { volume: 0.6 });
  const refusal = gateRefusal({ hasPapers: hasPapers(engine), dubious: !!engine.hasBuff?.(DUBIOUS_BUFF) });
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

function enterCar(engine) {
  if (pendingBoard) pendingBoard.until = 0;
  const spot = boardingSpot();
  engine.enter(CAR_TSID, { spawnX: spot.x, spawnY: spot.y });
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
    timeoutMs: ride.timing.prompt,
  }, (value) => {
    if (value === 'yes') disembark(engine);
  });
}
const CAR_LABEL_KICKER = SUBWAY_LINE.car.label;

async function disembark(engine) {
  if (!canDisembark(ride)) return false;
  const station = stationById(ride.stop);
  clearAnnouncement();
  stopTravelSound();
  ride = null;
  chosenStop = null;
  closeLineMap(engine);
  state = { ...state, stop: station.id, inCar: false };
  engine.setData('subwayLast', `off:${station.id}`);
  const spot = disembarkSpot(station);
  await engine.enter(station.streetTsid, { spawnX: spot.x, spawnY: spot.y });
  engine.save();
  return true;
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
    // Walk-free: stand at the gate and push.
    const spot = stationScreen(STATION_X.gate - 40);
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
  engine.setData('subwayWindows', windows.length && windows[0].box.visible ? 'moving' : windows.length ? 'still' : '');
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

  /** Surface entrances: their archived doors name the station tsids; point them at the rebuilt stations. */
  prepareStreet(street) {
    let linked = 0;
    for (const door of street?.doors || []) {
      const station = door?.connect && !door.connect.street ? stationByTsid(door.connect.tsid) : null;
      if (!station) continue;
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
        // In the train with no ride (a stale route): back to the platform of the last stop.
        const back = stationById(state.stop) || STATIONS[0];
        const spot = disembarkSpot(back);
        engine.enter(back.streetTsid, { spawnX: spot.x, spawnY: spot.y });
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
    if (ride && inCar(engine)) {
      runRide(engine, t);
      animateCar(t);
      if (lineMap && lineKey(lineView(ride, chosenStop)) !== lineMap.key) drawLineMap(engine);
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
    return { state: { ...state }, ride: ride ? { ...ride, timing: undefined } : null, dialog: dialog?.id || '', windows: windows.length, lineMap: lineMap?.key || '', chosenStop };
  },
};
