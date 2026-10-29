/**
 * The Eleven Secret Locations as a feature module (see js/feature-host.js).
 *
 * Rules and copy live in js/secret-spots.js (players/inc_eleven_secrets.js,
 * location.js handleElevenSecrets, config_prod.js secret_spots). This file
 * binds them to the world:
 * - From level 5 (checked on every street and every few seconds) the hunt
 *   picks its 20 spots and shuffles the Giants, unless the badge is held.
 * - Each pending spot on the current street gets the secret_location_marker
 *   beacon, Tiny Speck's own art (tools/overlay-art, G273): the clip's
 *   'active' loop standing on the floor, fitted to the 110 x 110
 *   location_overlay, and the 11_SECRET_LOCATIONS_BEACON_LOOP shimmer,
 *   softer the farther away you are.
 * - Walking into the spot's box (avatar body vs the street box): the
 *   collision jolt, the marker's "off" burst, the marker cancelled and the
 *   "Secret Spot!" rainbow over the avatar 600 ms later, then 3.5 s later the
 *   locking VoG overlay (the intro on the first find, else the count and the
 *   Giant's message), the growl with favor and iMG when it is dismissed, and
 *   1 s after that the eleven_secret_locations:<id> counter (group_count 11
 *   unlocks the badge; the lead's achievements.js counts distinct labels).
 * - The Tower Secrets (TowerSpot_ boxes) belong to features/home-tower-feature.js.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&secretdemo=1 starts a
 * fresh hunt (seeded by &secretseed=N), travels to the first chosen spot and
 * stands the avatar on the floor just beside it; &secretfound=N pre-finds N spots
 * (10 makes the next one Lem's and the badge); &secretautoplay=1 walks in and
 * clicks through the overlays; &secretrainbowhold=1 keeps the rainbow up. Canvas data: secretState, secretChosen,
 * secretFound, secretPending, secretMarkers, secretLast, secretGiant,
 * secretCount, secretOverlay, secretGrowl, secretDemo, secretBox.
 */

import { emblemCostFor } from '../shrines.js?v=spinning-wheel-test-9';
import {
  ELEVEN_BADGE,
  SECRET_MARKER_SIZE,
  SECRET_SOUNDS,
  SECRET_TIMING,
  announcementPages,
  bodyHitsBox,
  createSecretState,
  growlText,
  normalizeSecretState,
  pendingSpots,
  pendingSpotsOn,
  secretCounter,
  secretReward,
  spotBox,
  startSecretHunt,
  streetKeyFor,
  triggerSecretSpot,
} from '../secret-spots.js?v=secrets-1';
import { playSheetOverlay } from '../overlay-art.js?v=g448-2';

export const SECRET_SPOTS_FEATURE_ID = 'secret-spots';
const MARKER_Z = 4;
const BEACON_EVERY_MS = 2600;
const BEACON_RANGE = 900; // px: past this the shimmer is silent
const CHECK_MS = 80;
const LEVEL_CHECK_MS = 3000;

let state = createSecretState();
let markers = []; // { spot, box, art (playSheetOverlay handle), off: 0|startMs }
let inside = new Set();
let queue = []; // { at, fn }
let running = null; // { id, count, giant, msgIndex }
let rainbow = null; // playSheetOverlay handle
let lastCheck = 0;
let lastLevelCheck = 0;
let lastBeacon = 0;
let ui = null;
let demo = { stage: 'idle', at: 0, target: null };

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

function publish(engine) {
  engine.setData('secretState', state.done ? 'done' : state.started ? 'hunting' : 'idle');
  engine.setData('secretChosen', state.spots.length);
  engine.setData('secretFound', state.found.length);
  engine.setData('secretPending', engine.street ? pendingSpotsOn(state, engine.streetTsid).length : 0);
  engine.setData('secretMarkers', markers.length);
}

const hasBadge = (engine) => (engine.unlockedAchievements || []).includes(ELEVEN_BADGE);

function maybeStart(engine, opts = {}) {
  const began = startSecretHunt(state, { level: Number(engine.pc?.level) || 1, hasBadge: hasBadge(engine), ...opts });
  if (began) {
    engine.save();
    buildMarkers(engine);
  }
  publish(engine);
  return began;
}

/* ------------------------------------------------------------------ */
/* Marker (secret_location_marker)                                     */
/* ------------------------------------------------------------------ */

/** Highest floor at x between y0 and y1 (screen platforms), or null. */
function floorAt(engine, x, y0, y1) {
  let best = null;
  for (const p of engine.platforms || []) {
    const x1 = Math.min(p.x1, p.x2);
    const x2 = Math.max(p.x1, p.x2);
    if (x < x1 || x > x2) continue;
    const y = x2 === x1 ? p.y1 : p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1);
    if (y < y0 || y > y1) continue;
    if (best == null || y < best) best = y;
  }
  return best;
}

/** Ground under a box, so the beacon stands on the floor. */
function groundUnder(engine, box) {
  return floorAt(engine, box.x, box.y - box.h, box.y + 80);
}

/** A standing spot just outside a box on the same floor (QA placement). */
function besideBox(engine, box) {
  const floor = groundUnder(engine, box) ?? box.y;
  for (const dx of [-90, 90, -130, 130, -70, 70]) {
    const y = floorAt(engine, box.x + dx, floor - 40, floor + 40);
    if (y != null) return { x: box.x + dx, y };
  }
  return { x: box.x - 90, y: floor };
}

/**
 * The marker (location.js 4180-4190, showSecretLocationMarker): a
 * location_overlay of secret_location_marker, 110 x 110 (the 30 x 100
 * stage at 1.1), standing on the floor under the spot. Its clip loops
 * 'active' until the spot is found, then plays 'off' (frames 90-117, a
 * flash and the glow rising away) until the overlay is cancelled 600 ms
 * later. It shows until then (no fade out).
 */
function buildMarker(engine, spot) {
  const box = spotBox(engine.street, spot);
  if (!box) return null;
  const at = { x: box.x, y: groundUnder(engine, box) ?? box.y + 20 };
  const art = playSheetOverlay(engine.PIXI, 'secret_location_marker', {
    layer: engine.entityLayer,
    at: () => at,
    wh: SECRET_MARKER_SIZE,
    durationMs: 1e9,
    state: 'active',
    zIndex: MARKER_Z,
  });
  return { spot, box, art, off: 0 };
}

function destroyMarker(m) {
  m.art?.stop();
}

function clearMarkers() {
  for (const m of markers) destroyMarker(m);
  markers = [];
}

function buildMarkers(engine) {
  clearMarkers();
  if (!engine.street || engine.transientInstance?.()) return;
  for (const spot of pendingSpotsOn(state, engine.streetTsid)) {
    const m = buildMarker(engine, spot);
    if (m) markers.push(m);
  }
  engine.setData('secretMarkers', markers.length);
}

/* ------------------------------------------------------------------ */
/* Rainbow (rainbow_secretspot)                                        */
/* ------------------------------------------------------------------ */

/**
 * players/player.js 3014-3029 show_rainbow('rainbow_secretspot'): a
 * pc_overlay, 400 x 400 standing at the avatar (no keep-in-bounds), 4 s,
 * Tiny Speck's own art (tools/overlay-art, G251); the SWF stop()s on its last
 * frame. QA: &secretrainbowhold=1 holds it at 3 s, the words spelled out.
 */
function playRainbow(engine) {
  const p = engine.player;
  const hold = engine.param('secretrainbowhold') === '1';
  return playSheetOverlay(engine.PIXI, 'rainbow_secretspot', {
    layer: engine.fxLayer || engine.entityLayer,
    at: () => ({ x: p.x, y: p.y }),
    wh: 400,
    durationMs: SECRET_TIMING.rainbow,
    loop: false,
    holdMs: hold ? 3000 : null,
    resolution: engine.resolution || 1,
  });
}

function clearRainbow() {
  if (!rainbow) return;
  rainbow.stop();
  rainbow = null;
}

/* ------------------------------------------------------------------ */
/* VoG overlay (vp_overlay, locking, click to advance)                  */
/* ------------------------------------------------------------------ */

const CSS = `
#secret-spots-panel{position:fixed;z-index:62;display:flex;justify-content:center;align-items:flex-start;pointer-events:auto;background:rgba(10,20,30,.18)}
#secret-spots-panel[hidden]{display:none!important}
#secret-spots-panel .ss-card{margin-top:var(--ss-top,15%);width:min(500px,92%);box-sizing:border-box;padding:18px 22px 14px;border-radius:14px;
  background:rgba(24,38,52,.88);color:#fff;text-align:center;box-shadow:0 6px 22px rgba(0,0,0,.35);cursor:pointer;
  font:700 17px/1.4 "Trebuchet MS","Segoe UI",sans-serif;text-shadow:0 1px 2px rgba(0,0,0,.4)}
#secret-spots-panel .ss-text{white-space:pre-line}
#secret-spots-panel .ss-row{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:12px}
#secret-spots-panel .ss-hint{font-size:12px;opacity:.75}
#secret-spots-panel button{font:800 14px "Trebuchet MS",sans-serif;border:0;border-radius:999px;padding:6px 16px;background:#bff3ff;color:#163447;cursor:pointer}
`;

function ensureUi() {
  if (ui) return ui;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const panel = document.createElement('div');
  panel.id = 'secret-spots-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = '<div class="ss-card"><div class="ss-text"></div><div class="ss-row"><span class="ss-hint"></span><button type="button">OK</button></div></div>';
  document.body.appendChild(panel);
  ui = { panel, text: panel.querySelector('.ss-text'), hint: panel.querySelector('.ss-hint'), button: panel.querySelector('button'), card: panel.querySelector('.ss-card'), advance: null };
  ui.card.addEventListener('click', () => ui.advance?.());
  return ui;
}

function placeUi() {
  if (!ui || ui.panel.hidden) return;
  const c = document.querySelector('#game-root canvas') || document.querySelector('canvas');
  const r = c ? c.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  Object.assign(ui.panel.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
}

/** Show pages one at a time; resolves when the last is dismissed. */
function showPages(engine, pages, { showHint = false } = {}) {
  ensureUi();
  return new Promise((resolve) => {
    let i = 0;
    const show = () => {
      ui.text.textContent = pages[i];
      ui.hint.textContent = showHint ? 'Click to continue' : '';
      ui.button.textContent = i < pages.length - 1 ? 'Next' : 'OK';
      ui.panel.hidden = false;
      placeUi();
      engine.setData('secretOverlay', `${i + 1}/${pages.length}:${pages[i].slice(0, 60)}`);
    };
    ui.advance = () => {
      i += 1;
      if (i < pages.length) {
        show();
        return;
      }
      ui.advance = null;
      ui.panel.hidden = true;
      engine.setData('secretOverlay', '');
      resolve();
    };
    show();
  });
}

/* ------------------------------------------------------------------ */
/* Finding a spot                                                      */
/* ------------------------------------------------------------------ */

function grantFavor(engine, giant, amount) {
  const shrine = engine.shrineState;
  const favor = shrine?.favor || engine.pc?.giantFavor;
  if (!favor || !amount) return 0;
  const cap = shrine ? emblemCostFor(shrine, giant) : Infinity;
  const before = Number(favor[giant]) || 0;
  favor[giant] = Math.min(cap, before + amount);
  return Math.round(favor[giant] - before);
}

function grantXp(engine, amount) {
  if (!amount) return 0;
  engine.pc.xp = (engine.pc.xp || 0) + amount;
  engine.pc.imagination = (engine.pc.imagination || 0) + amount;
  return amount;
}

function later(now, ms, fn) {
  queue.push({ at: now + ms, fn });
}

function find(engine, marker, now) {
  const hit = triggerSecretSpot(state, marker.spot.id, engine.streetTsid);
  if (!hit) return;
  running = { ...hit, msgIndex: Math.floor(Math.random() * 3) };
  engine.save();
  engine.setData('secretLast', hit.id);
  engine.setData('secretCount', hit.count);
  engine.setData('secretGiant', hit.giant);
  // triggerSecretLocationMarker: jolt, stop the beacon, marker 'off'.
  engine.playSound(SECRET_SOUNDS.collision, { volume: 0.7 });
  marker.art?.setState('off');
  marker.off = now;
  const others = hit.last ? markers.filter((m) => m !== marker) : [];
  later(now, SECRET_TIMING.markerCancel, () => {
    destroyMarker(marker);
    markers = markers.filter((m) => m !== marker);
    // clearRemainingSecretOverlays on the eleventh.
    for (const m of others) destroyMarker(m);
    if (others.length) markers = markers.filter((m) => !others.includes(m));
    publish(engine);
  });
  later(now, SECRET_TIMING.rainbowDelay, () => {
    clearRainbow();
    rainbow = playRainbow(engine);
    engine.playSound(SECRET_SOUNDS.rainbow, { volume: 0.7 });
  });
  later(now, SECRET_TIMING.announce, () => announce(engine));
  publish(engine);
}

async function announce(engine) {
  const hit = running;
  if (!hit) return;
  await showPages(engine, announcementPages(hit.count, hit.giant, hit.msgIndex), { showHint: hit.count <= 1 });
  // doGrowl
  const reward = secretReward(hit.giant, hit.count);
  const favor = grantFavor(engine, reward.favorGiant, reward.favor);
  const xp = grantXp(engine, reward.xp);
  const line = growlText(hit.giant, hit.msgIndex, { favor, xp });
  engine.pushActivity(line);
  engine.setData('secretGrowl', `${hit.giant}:${favor}:${xp}`);
  engine.updateHud();
  engine.save();
  later(performance.now(), SECRET_TIMING.increment, () => {
    // elevenSecretsIncrement: after the growl so the badge never hides the message.
    engine.achievement(secretCounter(hit.id), 1);
    running = null;
    engine.save();
    publish(engine);
  });
}

function checkSpots(engine, now) {
  if (now - lastCheck < CHECK_MS || !engine.player) return;
  lastCheck = now;
  if (engine.transientInstance?.()) return;
  const p = engine.player;
  const nowInside = new Set();
  for (const m of markers) {
    if (m.off || !bodyHitsBox(m.box, p.x, p.y)) continue;
    nowInside.add(m.spot.id);
    // One find at a time; a spot entered meanwhile fires once the sequence ends.
    if (!inside.has(m.spot.id) && !running) {
      find(engine, m, now);
      inside.add(m.spot.id);
    }
  }
  for (const id of [...inside]) if (!nowInside.has(id)) inside.delete(id);
}

function beacon(engine, now) {
  const live = markers.filter((m) => !m.off);
  if (!live.length || running || now - lastBeacon < BEACON_EVERY_MS || !engine.player) return;
  lastBeacon = now;
  const d = Math.min(...live.map((m) => Math.hypot(m.box.x - engine.player.x, (m.box.y - engine.player.y) * 1.5)));
  if (d > BEACON_RANGE) return;
  // The recovered beacon take runs 8.9 s; play one shimmer per tick.
  engine.playSound(SECRET_SOUNDS.beacon, { volume: 0.12 + 0.3 * (1 - d / BEACON_RANGE), maxSeconds: BEACON_EVERY_MS / 1000 });
}

/* ------------------------------------------------------------------ */
/* QA                                                                  */
/* ------------------------------------------------------------------ */

function seededRng(seed) {
  let s = (Number(seed) || 11) >>> 0 || 11;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function demoStep(engine, now) {
  if (!engine.param('secretdemo') || demo.stage === 'done' || now < demo.at) return;
  if (demo.stage === 'idle') {
    if (engine.busy()) return;
    state = createSecretState();
    startSecretHunt(state, { force: true, rng: seededRng(engine.param('secretseed')) });
    const pre = Math.max(0, Math.min(10, Number(engine.param('secretfound')) || 0));
    for (let i = 0; i < pre; i += 1) {
      state.found.push(state.spots[i]);
      engine.achievement(secretCounter(state.spots[i]), 1);
    }
    const target = pendingSpots(state).find((s) => engine.streetExists(streetKeyFor(s.tsid)));
    if (!target) {
      demo = { stage: 'done', at: 0 };
      engine.setData('secretDemo', 'no-street');
      return;
    }
    demo = { stage: 'away', at: 0, target };
    engine.setData('secretDemo', `travelling:${target.id}`);
    engine.save();
    engine.enter(streetKeyFor(target.tsid));
    return;
  }
  if (demo.stage === 'place') {
    const m = markers.find((x) => x.spot.id === demo.target.id);
    if (!m) {
      demo = { stage: 'done', at: 0 };
      engine.setData('secretDemo', 'no-marker');
      return;
    }
    const p = engine.player;
    const at = besideBox(engine, m.box);
    p.x = at.x;
    p.y = at.y - 2;
    p.vx = 0;
    p.vy = 0;
    engine.snapCamera();
    engine.setData('secretDemo', 'placed');
    engine.setData('secretBox', `${Math.round(m.box.x)},${Math.round(m.box.y)}`);
    demo = engine.param('secretautoplay') ? { stage: 'walk', at: now + 1500, target: demo.target } : { stage: 'done', at: 0 };
    return;
  }
  if (demo.stage === 'walk') {
    const m = markers.find((x) => x.spot.id === demo.target.id);
    if (!m || m.off) {
      demo = { stage: 'advance', at: now + 500, target: demo.target };
      engine.setData('secretDemo', 'found');
      return;
    }
    const dir = Math.sign(m.box.x - engine.player.x);
    engine.player.x += dir * Math.min(12, Math.abs(m.box.x - engine.player.x));
    return;
  }
  if (demo.stage === 'advance') {
    if (ui?.advance && !ui.panel.hidden) {
      ui.advance();
      demo.at = now + 1200;
      return;
    }
    if (!running && state.found.includes(demo.target.id)) {
      demo = { stage: 'done', at: 0 };
      engine.setData('secretDemo', 'done');
    }
  }
}

/* ------------------------------------------------------------------ */
/* Feature                                                             */
/* ------------------------------------------------------------------ */

export const secretSpotsFeature = {
  id: SECRET_SPOTS_FEATURE_ID,

  init(engine) {
    if (engine.param('secretdemo')) engine.setData('secretDemo', 'idle');
  },

  save() {
    return { v: 1, ...state, spots: state.spots.slice(), giants: state.giants.slice(), found: state.found.slice() };
  },

  restore(slice) {
    state = normalizeSecretState(slice || {});
    running = null;
    queue = [];
  },

  onStreetEnter(street, engine) {
    inside = new Set();
    if (!demo.stage || demo.stage === 'done' || demo.stage === 'idle') maybeStart(engine);
    buildMarkers(engine);
    publish(engine);
    if (demo.stage === 'away' && demo.target && street?.tsid && street.tsid.slice(1) === demo.target.tsid.slice(1)) {
      demo = { stage: 'place', at: Date.now() + 600, target: demo.target };
    }
  },

  onStreetClear() {
    clearMarkers();
    clearRainbow();
    inside = new Set();
  },

  onTick(_dtMs, now, engine) {
    if (!engine.started) return;
    const t = performance.now();
    if (queue.length) {
      const due = queue.filter((q) => t >= q.at);
      queue = queue.filter((q) => t < q.at);
      for (const q of due) {
        try {
          q.fn();
        } catch (e) {
          console.warn('secret spots step', e);
        }
      }
    }
    if (!state.started && t - lastLevelCheck > LEVEL_CHECK_MS) {
      lastLevelCheck = t;
      if (!engine.param('secretdemo')) maybeStart(engine);
    }
    placeUi();
    checkSpots(engine, t);
    beacon(engine, t);
    demoStep(engine, now);
  },

  /** The Magic Rock waits while a DNAja-vu overlay is up. */
  holdQuestOffers() {
    return running || (ui && !ui.panel.hidden) ? true : null;
  },
};
