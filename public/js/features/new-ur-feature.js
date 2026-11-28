/**
 * Happy New Ur in the world (register G1195; the rules and the source are in js/new-ur.js).
 *
 * At each of the six Groddle midnights on December 31 (Ur's clock), on every street, for everyone:
 *  - from one game hour before (ten real minutes), a countdown above the pack, "Happy New Ur in
 *    9:52"; in the last minute it turns big; 10..4 in the middle of the view;
 *  - Tiny Speck's 321_countdown with COUNT_DOWN (groups/shared_instance_manager.js 672-683), its GO
 *    on the midnight;
 *  - at midnight the Sparkle Powder burst over the whole window (sparkle_powder.js 330-337: what
 *    Glitch showed Ur-wide at midnight on 2011-12-31) and fireworks_1-3 with LONELINESS_FIREWORKS on
 *    the loneliness party's 4 s rhythm (items/include/loneliness.js 355-463);
 *  - the New Day screen dressed "HAPPY NEW UR!" (game.js maybeNewDay asks newDayDress), the normal
 *    refill; your Glitch plays happy three seconds in.
 * The big midnight (nearest 1 PM Pacific) adds the party on Unnu Slight: the street is dressed all
 * of December 31 (confetti, a warm glow on the stone dragon's head), Goodnight Groddle plays in the
 * last minute, everyone there plays surprise at T-10 s, confetti bursts at midnight and the
 * fireworks go twice over. In the game hour before it and the one after, the countdown and the
 * Calendar's countdown row offer one free trip to Unnu Slight (once an eve, kept in the save).
 * Ours, beyond Glitch's two seconds of sparkles: inventions register new-ur-countdown.
 *
 * Online the show runs on the server's clock: new_ur.go sends {"t":"new_ur","now":…} on connect and
 * at each midnight, and this page keeps the difference to its own clock, so every player online sees
 * the same second. Solo runs off the device clock, as the New Day screen does.
 *
 * Hooks for the later pieces: collect('newUrMidnight', info, engine) at each midnight a player sees
 * (the keepsake and the badge), collect('newUrShow', info, engine) at the big midnight on the party
 * street (poppers); js/new-ur.js firstUrDay and hatsOn; js/seasons.js SEASONAL_STOCK.new_ur.
 *
 * QA: ?autostart=1&questoffer=off&seasondate=2026-12-31&newurmidnight=1..6 (&newurlead=<s>, default
 * 20) moves the show's clock so that midnight is that many seconds away; the New Day screen is then
 * run by this module at +2 s. window.groddleNewUr: state(), goParty(), midnight(k, leadS).
 * Canvas: newUrPhase, newUrMidnight (year:index[:big]), newUrLeft, newUrCues, newUrParty, newUrTrip,
 * newUrClock (local | qa | server).
 */

import { OVERLAY_USES, playCountdownArt, playWindowOverlay, windowOverlayFit } from '../overlays.js?v=306c160f';
import { exposeQA } from '../qa-gate.js?v=f4e2cd82';
import { parseSeasonDate } from '../seasons.js?v=5d8f545a';
import { fireworksUnder, viewport } from './spirit-loneliness-feature.js?v=5c90e95b';
import {
  DRAGON_AT,
  NEW_UR_TEXT,
  NEW_UR_TIMING,
  PARTY_STREET,
  bigNumber,
  countdownLeft,
  createNewUrState,
  isNewUrEve,
  newDayDress,
  newUrMoment,
  partyTripOpen,
  qaClockOffset,
  recordMidnight,
  takeTrip,
} from '../new-ur.js?v=cec82e41';

export const NEW_UR_FEATURE_ID = 'new-ur';

const STYLE = `
.new-ur-hud { position: absolute; z-index: var(--z-overlay); bottom: 6.6rem; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-2) var(--sp-6); border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--c-navy-23b) 82%, transparent); color: var(--c-gold-93b); font: 700 var(--fs-md)/var(--lh-normal) var(--font-system); box-shadow: var(--shadow-2); pointer-events: none; white-space: nowrap; }
.new-ur-hud[hidden], .new-ur-big[hidden] { display: none; }
.new-ur-hud.is-big { font-size: var(--fs-xl); padding: var(--sp-3) var(--sp-7); }
.new-ur-hud button { pointer-events: auto; border: 1px solid var(--c-gold-93b); border-radius: var(--radius-pill); background: var(--c-gold-93b); color: var(--c-navy-28); font: inherit; font-size: var(--fs-sm); padding: 0 var(--sp-5); cursor: pointer; }
.new-ur-big { position: absolute; z-index: var(--z-overlay); left: 50%; top: 38%; transform: translate(-50%, -50%); color: var(--c-gold-96); font: 900 var(--fs-countdown)/var(--lh-none) var(--font-system); text-shadow: 0 0 0.3em color-mix(in srgb, var(--c-gold-86d) 90%, transparent), 0 0.06em 0 var(--c-navy-28); pointer-events: none; }
.new-ur-count { position: absolute; left: 0; top: 0; width: 0; height: 0; overflow: hidden; }
.new-day-screen.is-new-ur .new-day-title { color: var(--c-orange-55); text-shadow: 0 0 0.4em color-mix(in srgb, var(--c-gold-89) 90%, transparent); }
.new-day-screen.is-new-ur .new-day-card { box-shadow: 0 0 0 3px var(--c-gold-90), var(--shadow-3); }
@media (max-width: 640px) { .new-ur-hud { bottom: 5.6rem; font-size: var(--fs-sm); } .new-ur-big { font-size: var(--fs-hero); } }
`;

const CONFETTI_COLOURS = [0xff5a5a, 0xffd23f, 0x3fc1ff, 0x7ddc5a, 0xff8ad8, 0xffffff];
const CONFETTI_CALM = 60;
const CONFETTI_BURST = 260;

let engineRef = null;
let state = createNewUrState();
let offset = 0;
let clockKind = 'local'; // 'local' | 'qa' | 'server'
let qaApplied = false;
let hud = null; // { box, text, button, big, count }
let cues = new Map(); // midnight key -> Set of cue names fired
let party = null; // { layer, glow, bits: [], burstUntil }
let client = null;
let last = '';
let lastHud = '';

const clock = () => Date.now() + offset;
const keyOf = (m) => `${m.year}:${m.index}`;
const seasonOff = (engine) => ['none', 'off'].includes(String(engine?.param?.('season') || '').trim().toLowerCase());
const onPartyStreet = (engine) => String(engine?.streetTsid || '') === PARTY_STREET;

function cue(m, name) {
  const k = keyOf(m);
  let set = cues.get(k);
  if (!set) cues.set(k, (set = new Set()));
  if (set.has(name)) return false;
  set.add(name);
  return true;
}

/* -------------------------------------------------------------------- clock */

function applyQa(engine) {
  if (qaApplied) return;
  qaApplied = true;
  const midnight = engine.param?.('newurmidnight');
  if (!midnight) return;
  const off = qaClockOffset({ midnight, lead: engine.param?.('newurlead') ?? '', date: parseSeasonDate(engine.param?.('seasondate')) });
  if (off) {
    offset = off;
    clockKind = 'qa';
  }
}

function moment(engine) {
  if (seasonOff(engine)) return { phase: 'none', midnight: null, msTo: Infinity };
  return newUrMoment(clock());
}

/* ---------------------------------------------------------------------- HUD */

function ensureHud() {
  if (hud || typeof document === 'undefined') return hud;
  const root = document.getElementById('game-root');
  if (!root) return null;
  if (!document.getElementById('new-ur-css')) {
    const style = document.createElement('style');
    style.id = 'new-ur-css';
    style.textContent = STYLE;
    document.head.append(style);
  }
  const box = document.createElement('div');
  box.className = 'new-ur-hud';
  box.hidden = true;
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  const text = document.createElement('span');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = NEW_UR_TEXT.goParty;
  button.title = NEW_UR_TEXT.goPartyTip;
  button.hidden = true;
  button.dataset.clickReleases = '';
  button.addEventListener('click', () => goParty(engineRef));
  box.append(text, button);
  const big = document.createElement('div');
  big.className = 'new-ur-big';
  big.hidden = true;
  big.setAttribute('aria-hidden', 'true');
  const count = document.createElement('div');
  count.className = 'new-ur-count';
  count.setAttribute('aria-hidden', 'true');
  root.append(box, big, count);
  hud = { box, text, button, big, count };
  return hud;
}

function tripState(engine, mo) {
  if (!mo.midnight?.big) return 'closed';
  if (state.trips.includes(String(mo.midnight.year))) return 'used';
  return partyTripOpen(clock()) ? 'open' : 'closed';
}

function renderHud(engine, mo) {
  const h = ensureHud();
  if (!h) return;
  const { phase, msTo, midnight } = mo;
  let text = '';
  if (phase === 'lead' || phase === 'big' || phase === 'ten') text = NEW_UR_TEXT.countdown(countdownLeft(msTo));
  else if (phase === 'show') text = `${NEW_UR_TEXT.name}!`;
  else if (phase === 'party') text = onPartyStreet(engine) ? NEW_UR_TEXT.partyHere : NEW_UR_TEXT.party;
  if (midnight?.big && (phase === 'lead' || phase === 'big') && !onPartyStreet(engine)) text += `. ${NEW_UR_TEXT.party}`;
  const showTrip = tripState(engine, mo) === 'open' && !onPartyStreet(engine) && phase !== 'three' && phase !== 'show';
  const num = phase === 'ten' ? bigNumber(msTo) : null;
  const sig = `${text}|${showTrip}|${num}|${phase === 'big' || phase === 'ten'}`;
  if (sig === lastHud) return;
  lastHud = sig;
  h.box.hidden = !text;
  h.text.textContent = text;
  h.button.hidden = !showTrip;
  h.box.classList.toggle('is-big', phase === 'big' || phase === 'ten');
  h.big.hidden = num == null;
  h.big.textContent = num == null ? '' : String(num);
}

/* --------------------------------------------------------------- the show */

function emote(engine, kind) {
  if (engine.query?.('emote', kind, engine) !== true) engine.playEmotion?.(kind);
}

function sparkle(engine) {
  const root = globalThis.document?.getElementById?.('game-root');
  if (!root) return;
  const use = OVERLAY_USES.overlay_sparkle_powder;
  const { rect, wh } = windowOverlayFit(root.clientWidth, root.clientHeight, use.size);
  playWindowOverlay('overlay_sparkle_powder', { rect, wh, durationMs: use.durationMs, loop: use.loop });
  engine.playSound?.('SPARKLE_POWDER', { volume: 0.6 });
}

function firework(engine, fw) {
  const vp = viewport();
  if (!vp) return;
  engine.playSound?.('LONELINESS_FIREWORKS', { volume: 0.55 });
  fireworksUnder(engine, fw, vp, NEW_UR_TIMING.fireworkMs).catch(() => {});
}

/** The cues of one midnight, each once, as the clock passes it (a late page skips what is long gone). */
function runCues(engine, mo) {
  const { midnight: m, msTo, phase } = mo;
  if (!m) return;
  const T = NEW_UR_TIMING;
  const here = m.big && onPartyStreet(engine);
  if (here && msTo <= T.bigMs && msTo > 0 && cue(m, 'music')) engine.playSound?.('GOODNIGHT_GRODDLE', { volume: 0.5 });
  if (here && msTo <= T.tenMs && msTo > T.threeMs && cue(m, 'surprise')) emote(engine, 'surprise');
  if (msTo <= T.threeMs && msTo > -1000 && cue(m, 'three')) {
    const h = ensureHud();
    if (h) playCountdownArt(h.count);
    engine.playSound?.('COUNT_DOWN', { volume: 0.55 });
  }
  if (phase !== 'show') return;
  const since = -msTo;
  if (cue(m, 'show')) {
    if (since < 4000) sparkle(engine);
    if (here && party) party.burstUntil = clock() + T.showMs;
    const seen = recordMidnight(state, m);
    if (clockKind !== 'qa') engine.save?.();
    const info = { year: m.year, index: m.index, big: m.big, at: m.at, ...seen };
    engine.collect?.('newUrMidnight', info, engine);
    if (here) engine.collect?.('newUrShow', info, engine);
  }
  const list = here ? [...T.fireworks, ...T.partyFireworks] : T.fireworks;
  list.forEach((fw, i) => {
    if (since >= fw.at && since < fw.at + 1500 && cue(m, `fw${i}`)) firework(engine, fw);
  });
  // The game's own new day turns on its clock; a QA clock runs it here, at +2 s.
  if (clockKind === 'qa' && since >= T.newDayAtMs && cue(m, 'newday')) engine.runNewDay?.();
  if (since >= T.happyAtMs && since < T.happyAtMs + 3000 && cue(m, 'happy')) emote(engine, 'happy');
}

/* ------------------------------------------------------------- party street */

function dressParty(engine) {
  const PIXI = engine.PIXI;
  const fx = engine.fxLayer;
  if (party || !PIXI?.Container || !fx) return;
  const layer = new PIXI.Container();
  layer.label = 'new-ur-party';
  layer.eventMode = 'none';
  // A warm glow on the stone dragon's head (ours: a light on the existing deco, nothing redrawn).
  const glow = new PIXI.Graphics();
  // Twenty faint rings, outermost first: a soft falloff with no hard edge.
  for (let i = 0; i < 20; i += 1) glow.circle(0, 0, 220 - i * 10).fill({ color: 0xffb347, alpha: 0.022 });
  glow.x = DRAGON_AT.x;
  glow.y = DRAGON_AT.y;
  glow.blendMode = 'add';
  layer.addChild(glow);
  const bits = [];
  for (let i = 0; i < CONFETTI_BURST; i += 1) {
    const g = new PIXI.Graphics();
    g.rect(-3, -1.5, 6, 3).fill(CONFETTI_COLOURS[i % CONFETTI_COLOURS.length]);
    g.visible = i < CONFETTI_CALM;
    layer.addChild(g);
    bits.push({ g, rx: Math.random(), ry: Math.random(), vy: 0.03 + Math.random() * 0.05, sway: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.2 });
  }
  fx.addChildAt(layer, 0);
  party = { layer, glow, bits, burstUntil: 0 };
}

function clearParty() {
  if (party?.layer && !party.layer.destroyed) party.layer.destroy({ children: true });
  party = null;
}

function tickParty(engine, dtMs) {
  if (!party || party.layer.destroyed) return;
  const t = clock();
  party.glow.alpha = 0.75 + 0.25 * Math.sin(t / 700);
  const cam = engine.camera || { x: 0, y: 0 };
  const w = Number(engine.viewWidth) || 960;
  const h = 620;
  const n = t < party.burstUntil ? CONFETTI_BURST : CONFETTI_CALM;
  const step = Math.min(50, Math.max(0, Number(dtMs) || 16)) / 16;
  party.bits.forEach((b, i) => {
    b.g.visible = i < n;
    if (!b.g.visible) return;
    b.ry += b.vy * step * (t < party.burstUntil ? 0.02 : 0.012);
    if (b.ry > 1.05) {
      b.ry = -0.05;
      b.rx = Math.random();
    }
    b.sway += 0.05 * step;
    b.g.x = cam.x + b.rx * w + Math.sin(b.sway) * 12;
    b.g.y = cam.y + b.ry * h;
    b.g.rotation += b.spin * step;
  });
}

function syncParty(engine) {
  const want = engine.street && onPartyStreet(engine) && !seasonOff(engine) && isNewUrEve(clock());
  if (want) dressParty(engine);
  else if (party) clearParty();
}

/* ------------------------------------------------------------------ the trip */

function goParty(engine = engineRef) {
  if (!engine) return false;
  const mo = moment(engine);
  const trip = tripState(engine, mo);
  if (onPartyStreet(engine)) return engine.toast?.(NEW_UR_TEXT.partyHere, 2500), false;
  if (trip === 'used') return engine.toast?.(NEW_UR_TEXT.partyUsed, 3000), false;
  if (trip !== 'open') return false;
  const gate = engine.travelGate?.(PARTY_STREET, { via: 'teleport' });
  if (gate && gate.ok === false) return engine.toast?.(gate.msg || 'You cannot travel right now.', 3000), false;
  takeTrip(state, mo.midnight.year);
  engine.save?.();
  Promise.resolve(engine.travel?.(PARTY_STREET, { via: 'teleport' })).then((res) => {
    // A trip that did not leave gives the free trip back.
    if (res && res.ok === false) state.trips = state.trips.filter((y) => y !== String(mo.midnight.year));
  }).catch(() => {});
  return true;
}

/* -------------------------------------------------------------------- online */

function watchServer(engine) {
  if (client || engine?.mode !== 'multiplayer') return;
  const c = engine.query?.('realtimeClient');
  if (!c?.on) return;
  client = c;
  c.on('msg:new_ur', (m) => {
    const now = Number(m?.now);
    if (!Number.isFinite(now) || clockKind === 'qa') return;
    offset = now - Date.now();
    clockKind = 'server';
  });
  c.on('state', ({ state: s } = {}) => {
    if (s === 'online') c.send?.('new_ur_sync', {});
  });
  c.send?.('new_ur_sync', {});
}

/* ------------------------------------------------------------------- publish */

function publish(engine, mo) {
  if (!engine?.setData) return;
  const m = mo.midnight;
  const cueList = m ? [...(cues.get(keyOf(m)) || [])].join(',') : '';
  const sig = `${mo.phase}|${m ? keyOf(m) : ''}|${Math.ceil(mo.msTo / 1000)}|${cueList}|${Boolean(party)}|${clockKind}`;
  if (sig === last) return;
  last = sig;
  engine.setData('newUrPhase', mo.phase);
  engine.setData('newUrMidnight', m ? `${keyOf(m)}${m.big ? ':big' : ''}` : '');
  engine.setData('newUrLeft', Number.isFinite(mo.msTo) ? String(Math.ceil(mo.msTo / 1000)) : '');
  engine.setData('newUrCues', cueList);
  engine.setData('newUrParty', party ? 'on' : 'off');
  engine.setData('newUrTrip', tripState(engine, mo));
  engine.setData('newUrClock', clockKind);
}

/* ------------------------------------------------------------------- feature */

export const newUrFeature = {
  id: NEW_UR_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    exposeQA('groddleNewUr', {
      state: () => {
        const g = party?.glow && !party.glow.destroyed ? party.glow.getGlobalPosition() : null;
        return { ...createNewUrState(state), moment: moment(engine), clock: clock(), clockKind, party: Boolean(party), glow: g ? { x: Math.round(g.x), y: Math.round(g.y) } : null, player: engine.player ? { x: Math.round(engine.player.x), y: Math.round(engine.player.y) } : null };
      },
      goParty: () => goParty(engine),
      /** Move the show's clock so midnight k (1-6) of this eve is leadS seconds away. */
      midnight: (k, leadS = 20) => {
        offset = qaClockOffset({ midnight: k, lead: leadS, date: parseSeasonDate(engine.param?.('seasondate')) });
        clockKind = offset ? 'qa' : 'local';
        syncParty(engine);
        return moment(engine);
      },
    });
  },

  onStreetEnter(_street, engine) {
    engineRef = engine;
    applyQa(engine);
    clearParty();
    syncParty(engine);
  },

  onStreetClear() {
    clearParty();
  },

  onTick(dtMs, _now, engine) {
    if (!engine.started) return;
    applyQa(engine);
    watchServer(engine);
    const mo = moment(engine);
    renderHud(engine, mo);
    runCues(engine, mo);
    syncParty(engine);
    tickParty(engine, dtMs);
    publish(engine, mo);
  },

  /** game.js maybeNewDay: the New Day screen's dress at a New Ur midnight, else null. */
  newDayDress(engine) {
    if (seasonOff(engine)) return null;
    return newDayDress(clock());
  },

  /** The Calendar's countdown row: the free trip while it is open. */
  newUrPartyTrip(engine) {
    const mo = moment(engine);
    return { open: tripState(engine, mo) === 'open' && !onPartyStreet(engine), label: NEW_UR_TEXT.goParty, tip: NEW_UR_TEXT.goPartyTip };
  },

  newUrGoParty(engine) {
    return goParty(engine);
  },

  /** The clock the show runs on (the server's online, a QA offset, else the device's): new-ur-party-feature. */
  newUrClock() {
    return clock();
  },

  save() {
    return createNewUrState(state);
  },

  restore(slice) {
    state = createNewUrState(slice || {});
  },
};
