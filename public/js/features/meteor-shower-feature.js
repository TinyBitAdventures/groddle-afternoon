/**
 * Meteor showers and lone shooting stars in the night sky (ours, Austin 2026-11-27; the rules and
 * the drawing are js/meteor-shower.js, inventions register meteor-shower).
 *
 * Online the realtime server owns the event (meteor.go): an administrator starts one from the
 * console, and every game online gets {"t":"meteor","id","kind","seed","start","dur","hint","now"};
 * this page keeps the server's clock (now minus its own) and draws the streaks the seed gives at
 * that moment, so every player sees the same ones. It asks for the running event as it comes
 * online (meteor_sync), so a page that connects mid-shower joins it. {"t":"meteor","kind":"stop"}
 * ends it. A hinted shower (the console's "in 2 minutes") puts METEOR_TEXT.hint in the activity
 * feed as the frame comes, once per event; on a page just loaded, 5 s in (after its first notices).
 *
 * The streaks go into the view's meteor Graphics (street-render.js / homes-feature.js meteorLayer,
 * over the stars) at the strength of the clock's sky (engine.meteorSky: #749's look, null where
 * the sky is the street's own, indoors or NIGHT TINT off), slower and dimmer under
 * prefers-reduced-motion. A Snap asks meteorOnScreen (features/snaps-feature.js) to keep the tag.
 *
 * QA (solo preview): ?autostart=1&questoffer=off&streetdemo=<street>&timedemo=night&meteordemo=shower
 * (a shower from the first second) or meteordemo=star (a lone star, then 20 s of empty sky, then the next). Canvas:
 * meteor (none | soon | on | over), meteorKind, meteorStreaks (drawn now), meteorStrength, meteorClock
 * (local | demo | server). window.groddleMeteor: state(), start(kind), stop(), onScreen().
 */

import { exposeQA } from '../qa-gate.js?v=f4e2cd82';
import {
  METEOR,
  METEOR_TEXT,
  demoMeteorEvent,
  drawMeteorStreaks,
  meteorEventOf,
  meteorOnScreen,
  meteorPhase,
  meteorSchedule,
  meteorStrength,
  meteorStreaksAt,
} from '../meteor-shower.js?v=2eb3c0ed';

export const METEOR_FEATURE_ID = 'meteor-shower';

const run = {
  event: null,
  schedule: [],
  offset: 0,
  clock: 'local',
  hinted: new Set(),
  pendingHint: '',
  startedAt: -Infinity,
  layer: null,
  drawn: 0,
  strength: 0,
  demo: null, // 'shower' | 'star' once the QA param was read
  demoN: 0,
  client: null,
  last: '',
};

const reducedMotion = () => {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
};

const clockNow = () => Date.now() + run.offset;

function setEvent(ev, engine, now = clockNow()) {
  run.event = ev;
  run.schedule = ev ? meteorSchedule(ev) : [];
  if (!ev) clearLayer();
  if (ev?.hint && now < ev.start && !run.hinted.has(ev.id)) {
    run.hinted.add(ev.id);
    // On a page just loaded, after its own first notices (the featured street project's 4.2 s toast).
    if (Date.now() - run.startedAt >= HINT_SETTLE_MS) engine?.pushActivity?.(METEOR_TEXT.hint);
    else run.pendingHint = ev.id;
  }
}

/** A hint waits until the page has been playing this long. */
const HINT_SETTLE_MS = 5000;

function settleHint(engine) {
  if (!run.pendingHint || Date.now() - run.startedAt < HINT_SETTLE_MS) return;
  if (run.event?.id === run.pendingHint && clockNow() < run.event.start) engine.pushActivity?.(METEOR_TEXT.hint);
  run.pendingHint = '';
}

function clearLayer() {
  if (run.layer && !run.layer.destroyed) run.layer.clear?.();
  run.drawn = 0;
}

/** The server's meteor frame: an event to run (or the same one again), or a stop. */
export function takeMeteorFrame(m, engine, nowLocal = Date.now()) {
  if (m?.kind === 'stop') {
    if (!m.id || m.id === run.event?.id) setEvent(null, engine);
    return 'stopped';
  }
  const ev = meteorEventOf(m);
  if (!ev) return 'bad';
  if (Number.isFinite(m.now)) {
    run.offset = m.now - nowLocal;
    run.clock = 'server';
  }
  if (run.event?.id === ev.id) return 'same';
  setEvent(ev, engine, nowLocal + run.offset);
  return 'started';
}

function watchServer(engine) {
  if (run.client || engine?.mode !== 'multiplayer') return;
  const c = engine.query?.('realtimeClient');
  if (!c?.on) return;
  run.client = c;
  c.on('msg:meteor', (m) => takeMeteorFrame(m, engine));
  c.on('state', ({ state: s } = {}) => {
    if (s === 'online') c.send?.('meteor_sync', {});
  });
  c.send?.('meteor_sync', {});
}

function startDemo(kind, engine, leadMs = 800) {
  const ev = demoMeteorEvent(kind, Date.now(), { n: run.demoN++, leadMs });
  if (!ev) return null;
  run.offset = 0;
  run.clock = 'demo';
  setEvent(ev, engine);
  return ev;
}

function applyDemo(engine) {
  if (run.demo !== null) return;
  const want = String(engine.param?.('meteordemo') || '').toLowerCase();
  run.demo = want === 'shower' || want === 'star' ? want : '';
  if (run.demo) startDemo(run.demo, engine);
}

/** The sky now: its strength and the view's meteor Graphics (engine.meteorSky). */
function skyNow(engine) {
  const sky = engine.meteorSky?.() || {};
  return { strength: meteorStrength(sky.look), layer: sky.layer || null };
}

/** The top bar's pieces: on a phone the stats and the street's nameplate, on a computer the stats row. */
const TOP_BAR = ['hud-stats', 'street-nameplate'];
let viewCache = { at: -1e9, key: '', view: null };

/**
 * The meteors' view: its size in view px (the layer's), css px per view px (`scale`: a phone shows
 * the view shrunk) and how many view px at its top sit under the top bar (`top`), read from the page
 * at most twice a second.
 */
function viewSize(layer) {
  const w = layer?.viewW || globalThis.innerWidth || 1280;
  const h = layer?.viewH || globalThis.innerHeight || 800;
  const now = globalThis.performance?.now?.() ?? Date.now();
  const key = `${w}x${h}`;
  if (viewCache.view && viewCache.key === key && now - viewCache.at < 500) return viewCache.view;
  let scale = 1;
  let top = 0;
  try {
    const doc = globalThis.document;
    const canvas = doc?.querySelector?.('canvas');
    const box = canvas?.getBoundingClientRect?.();
    if (box && box.width > 0) {
      scale = box.width / w;
      const limit = (globalThis.innerHeight || box.bottom) * 0.4;
      let bar = 0;
      for (const id of TOP_BAR) {
        const r = doc.getElementById?.(id)?.getBoundingClientRect?.();
        if (r && r.height > 0 && r.bottom < limit) bar = Math.max(bar, r.bottom);
      }
      top = bar > 0 ? Math.max(0, bar + 6 - box.top) / scale : 0;
    }
  } catch { /* no page: the plain view */ }
  viewCache = { at: now, key, view: { w, h, scale, top } };
  return viewCache.view;
}

function publish(engine) {
  const phase = meteorPhase(run.event, clockNow());
  const sig = `${phase}|${run.event?.kind || ''}|${run.drawn}|${run.strength.toFixed(2)}|${run.clock}`;
  if (sig === run.last || !engine?.setData) return;
  run.last = sig;
  engine.setData('meteor', phase);
  engine.setData('meteorKind', run.event?.kind || '');
  engine.setData('meteorStreaks', String(run.drawn));
  engine.setData('meteorStrength', run.strength.toFixed(2));
  engine.setData('meteorClock', run.clock);
}

export const meteorShowerFeature = {
  id: METEOR_FEATURE_ID,

  init(engine) {
    exposeQA('groddleMeteor', {
      state: () => ({ view: viewSize(run.layer), event: run.event, phase: meteorPhase(run.event, clockNow()), clock: run.clock, now: clockNow(), drawn: run.drawn, strength: run.strength, streaks: run.schedule.length, onScreen: meteorShowerFeature.meteorOnScreen(engine) }),
      start: (kind = 'shower') => startDemo(kind, engine),
      stop: () => setEvent(null, engine),
      onScreen: () => meteorShowerFeature.meteorOnScreen(engine),
    });
  },

  onStreetClear() {
    // The view and its Graphics go with the street; the next street's is asked for afresh.
    run.layer = null;
    run.drawn = 0;
  },

  onTick(_dtMs, _now, engine) {
    if (!engine.started) return;
    if (run.startedAt === -Infinity) run.startedAt = Date.now();
    watchServer(engine);
    settleHint(engine);
    applyDemo(engine);
    const now = clockNow();
    let phase = meteorPhase(run.event, now);
    if (phase === 'over') {
      // The star preview: one lone star, then METEOR.demoStarGapMs of empty sky after its train, then the next.
      if (run.event?.demo && run.demo === 'star') {
        const ev = run.event;
        startDemo('star', engine, Math.max(800, ev.start + METEOR.starAtMs + METEOR.starMs + METEOR.trainMs + METEOR.demoStarGapMs - Date.now()));
      }
      else setEvent(null, engine);
      phase = meteorPhase(run.event, now);
    }
    if (phase !== 'on') {
      if (run.drawn) clearLayer();
      run.strength = 0;
      publish(engine);
      return;
    }
    const { strength, layer } = skyNow(engine);
    if (layer !== run.layer) {
      clearLayer();
      run.layer = layer;
    }
    run.strength = strength;
    if (!layer || layer.destroyed) {
      run.drawn = 0;
      publish(engine);
      return;
    }
    const reduced = reducedMotion();
    const list = strength > 0 ? meteorStreaksAt(run.event, now, { reduced, schedule: run.schedule }) : [];
    const { w, h, scale, top } = viewSize(layer);
    run.drawn = drawMeteorStreaks(layer, list, w, h, { strength, reduced, scale, top }) ? list.length : 0;
    publish(engine);
  },

  /** engine.query('meteorOnScreen'): a streak is in sight now, bright enough for a Snap to keep it. */
  meteorOnScreen(engine) {
    if (!engine || meteorPhase(run.event, clockNow()) !== 'on') return false;
    const { strength, layer } = skyNow(engine);
    const { w, h, scale, top } = viewSize(layer);
    return meteorOnScreen(run.event, clockNow(), { strength, reduced: reducedMotion(), w, h, scale, top });
  },
};

/** Tests: the run state back to a fresh page. */
export function resetMeteorRun() {
  viewCache = { at: -1e9, key: '', view: null };
  Object.assign(run, { event: null, schedule: [], offset: 0, clock: 'local', hinted: new Set(), pendingHint: '', startedAt: -Infinity, layer: null, drawn: 0, strength: 0, demo: null, demoN: 0, client: null, last: '' });
}

/** Tests: the run state. */
export const meteorRun = () => run;

export { METEOR };
