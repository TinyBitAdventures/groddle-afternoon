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
 *
 * QA: ?autostart=1&questoffer=off&subwaydemo=<station id | name | tsid>
 *   enters that station by the stairs. &subwaypapers=1 grants You Have
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

import { countItem } from '../inventory.js?v=catalog-unified-7';
import { doorsFeature } from './doors-feature.js?v=g431-1';
import { textureFromUrl } from '../textures.js';
import {
  CAR_FLOOR,
  CAR_FLOOR_LIGHTS,
  CAR_TSID,
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
} from '../subway.js?v=play-1';

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
.subway-dialog { position: absolute; inset: 0; z-index: 60; display: grid; place-items: center; pointer-events: none; }
.subway-dialog-card { pointer-events: auto; max-width: min(440px, calc(100% - 32px)); background: #fffdf5; color: #2b2a26; border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0,0,0,.35); padding: 1rem 1.15rem 1.05rem; font: 15px/1.4 "Trebuchet MS", system-ui, sans-serif; }
.subway-dialog-card h3 { margin: 0 0 .15rem; font-size: 1.05rem; }
.subway-dialog-card .subway-kicker { margin: 0 0 .35rem; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; color: #8a8270; }
.subway-dialog-card p { margin: .3rem 0; }
.subway-dialog-card .subway-lines { margin: .45rem 0 .2rem; padding: 0; list-style: none; }
.subway-dialog-card .subway-lines li { margin: .15rem 0; }
.subway-dialog-card .subway-dot { display: inline-block; width: .7rem; height: .7rem; border-radius: 50%; margin-right: .4rem; vertical-align: -1px; }
.subway-dialog-actions { display: flex; flex-wrap: wrap; gap: .45rem; margin-top: .7rem; }
.subway-dialog-actions button { font: inherit; font-weight: 700; border: 0; border-radius: 999px; padding: .45rem .95rem; cursor: pointer; background: #e7e2d2; color: #2b2a26; }
.subway-dialog-actions button.primary { background: #3d8b4a; color: #fff; }
.subway-dialog-actions button:focus-visible { outline: 3px solid #f5c542; outline-offset: 2px; }
.subway-announce { position: absolute; left: 50%; top: 15%; transform: translateX(-50%); width: min(560px, calc(100% - 32px)); z-index: 55;
  text-align: center; pointer-events: none; color: #fff; font: 700 clamp(18px, 3.2vw, 30px)/1.2 "Trebuchet MS", system-ui, sans-serif;
  text-shadow: 0 0 3px #3a3a32, 0 2px 4px rgba(0,0,0,.65), 1px 1px 0 #3a3a32, -1px -1px 0 #3a3a32, 1px -1px 0 #3a3a32, -1px 1px 0 #3a3a32; }
.subway-announce b { color: #ffe14a; }
.subway-map { position: absolute; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(20,20,16,.35); }
.subway-map-card { width: 620px; max-width: calc(100% - 32px); background: #f3f1e6; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.4);
  padding: .7rem .9rem .8rem; font: 14px/1.3 "Trebuchet MS", system-ui, sans-serif; color: #2b2a26; }
.subway-map-head { display: flex; align-items: center; gap: .5rem; }
.subway-map-head h3 { margin: 0; flex: 1; text-align: center; font-size: 1.25rem; }
.subway-map-head button { font: inherit; border: 0; background: none; cursor: pointer; }
.subway-map-lines button { border-radius: 999px; padding: .15rem .6rem; font-size: .78rem; font-weight: 700; border: 2px solid transparent; background: #e2dfd0; }
.subway-map-lines button[aria-pressed="true"] { border-color: currentColor; background: #fff; }
.subway-map-close { font-size: 1.4rem; color: #c43; line-height: 1; padding: 0 .2rem; }
.subway-map svg { display: block; width: 100%; height: auto; max-height: min(400px, calc(100vh - 260px)); margin-top: .3rem; }
.subway-map-foot { text-align: center; margin: .3rem 0 0; color: #6d675a; font-size: .8rem; }
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
  const s = new engine.PIXI.Sprite(textureFromUrl(artUrl(row.piece)));
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
  const spot = boardingSpot();
  engine.enter(CAR_TSID, { spawnX: spot.x, spawnY: spot.y });
  return true;
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
  pendingBoard = null;
  ride = createRide({ stop, direction, now: Date.now(), timing: rideTiming(fastScale(engine)) });
  state = { ...state, stop, direction, inCar: true, rides: (state.rides || 0) + 1 };
  // transit_schedule_departure: one count per boarding.
  engine.achievement(RIDE_COUNTER, 1);
  showAnnouncement(engine, announce.boarding(Math.round(ride.timing.board / 1000)), 5000);
  engine.save();
}

function getOffPrompt(engine, station) {
  openDialog(engine, {
    id: 'get-off',
    kicker: CAR_LABEL_KICKER,
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

function demoStep(engine, now) {
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
    if (ride && inCar(engine)) {
      runRide(engine, t);
      animateCar(t);
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

  /** A reload in the train resumes on the platform of its last stop. */
  reloadLocation(saved) {
    if (!saved || !isCarTsid(saved.tsid)) return null;
    const back = stationById(state.stop) || STATIONS[0];
    const spot = disembarkSpot(back);
    state = { ...state, inCar: false };
    return { tsid: back.streetTsid, x: spot.x, y: spot.y };
  },

  /** QA / tests. */
  _state() {
    return { state: { ...state }, ride: ride ? { ...ride, timing: undefined } : null, dialog: dialog?.id || '', windows: windows.length };
  },
};
