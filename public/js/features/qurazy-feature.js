/**
 * G260: your Qurazy quoin on a street's Qurazy marker. Rules: js/qurazy.js
 * (GameServerJS locations/location.js 200-265, 731-760).
 *
 * - Which streets: the 1,306 archived locations whose item list holds a
 *   "Qurazy marker" (js/qurazy-markers.js, five with two). The markers' own
 *   x/y were never archived, so each marker takes a stable spot from the
 *   street planner on the recovered platforms (the `qurazy` group, asked for
 *   after every other group so nothing else moves).
 * - Entering rolls once a game day per street: always on a first visit, then
 *   0.1 to 0.7 by how long since your last visit, 0 if one was here today,
 *   yesterday or the day before, 0 after 5 today; Max Luck always places one.
 *   The quoin is the ordinary Qurazy: the level table reward, outside the
 *   daily quoin limit (js/quoins.js collectQuoin).
 * - Leaving the street drops one you did not grab (onPlayerExit 1008-1014).
 *   A reload is a reconnect: the same Qurazy is still where it was.
 * - Not on Gentle Island (newxp-feature places its scripted Qurazies,
 *   newbie_island.js) or in races, rooms and other transient instances.
 *
 * QA: &qurazy=off (no roll), &qurazy=force (as Max Luck), &qurazyrng=<0-1>
 * (fixed roll), &qurazyreset=1 (forget the day's rolls and finds),
 * &qurazydemo=near|collect (stand beside it, or on it). Canvas data:
 * qurazyMarkers, qurazyRoll (`spawn|miss|skip:reason:chance`), qurazyLive
 * (`x,y` or empty), qurazyFoundToday, qurazyCollected.
 */

import { GENTLE_ISLAND_TSIDS, isNewxpSceneTsid } from '../newxp.js?v=newxp-2';
import { qurazyMarkersFor } from '../qurazy-markers.js?v=g260-1';
import { OVERLAY_FADE, playVectorOverlay } from '../overlay-art.js?v=g273-1';
import {
  QURAZY_SPAWN_LINE,
  createQurazyState,
  qurazyDayIndex,
  qurazyFoundToday,
  rollQurazy,
  rollQurazyDay,
} from '../qurazy.js?v=g260-1';

export const QURAZY_FEATURE_ID = 'qurazy';
export const QURAZY_PLACEMENT_GROUP = 'qurazy';

let st = createQurazyState();
/** The Qurazy sprite placed this session (null when none is out). */
let liveQuoin = null;
/** True from load until the first street is built: that entry is a reconnect. */
let reconnecting = true;
let lastRoll = '';
let collected = 0;
/** QA &qurazydemo: where to stand once the boot has placed the avatar. */
let demo = null;

function params() {
  try {
    return new URLSearchParams(globalThis.location?.search || '');
  } catch {
    return new URLSearchParams('');
  }
}

/** A street the roll runs on (not the island, not a newxp scene). */
export function qurazyStreetEligible(tsid) {
  const key = String(tsid || '');
  return Boolean(key) && !GENTLE_ISLAND_TSIDS.includes(key) && !isNewxpSceneTsid(key) && qurazyMarkersFor(key) > 0;
}

function fixedRng() {
  const raw = params().get('qurazyrng');
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? () => Math.max(0, Math.min(1, n)) : null;
}

function publish(engine) {
  if (typeof engine?.setData !== 'function') return;
  engine.setData('qurazyMarkers', qurazyMarkersFor(engine.streetTsid));
  engine.setData('qurazyRoll', lastRoll);
  engine.setData('qurazyLive', st.live ? `${Math.round(st.live.x)},${Math.round(st.live.y)}` : '');
  engine.setData('qurazyFoundToday', qurazyFoundToday(st));
  engine.setData('qurazyCollected', collected);
}

function markerSpot(engine, index) {
  const points = engine.placement(QURAZY_PLACEMENT_GROUP) || [];
  const point = points[index] || points[0];
  if (point) return { x: point.x, y: point.y };
  // The planner ran out of room: above the street's last natural quoin spot.
  const quoinSpots = engine.placement('quoins') || [];
  const last = quoinSpots[quoinSpots.length - 1];
  return last ? { x: last.x, y: last.y - 80 } : null;
}

function placeQurazy(engine, spot) {
  const q = engine.spawnQuoin?.(spot, 'qurazy', { phaseIndex: 0 });
  if (!q) return null;
  q.qurazyMarker = true;
  liveQuoin = q;
  return q;
}

/**
 * location.js 746-756: announce_vp_overlay o_qurazy_quoin_overlay, 10 s,
 * x 50%, top_y -5%, fade_out_sec 3 (scale_to_stage leaves a SWF at 1:1:
 * InWindowAnnouncementOverlay.as 177), Tiny Speck's own art (tools/overlay-art,
 * G251) on the 960-wide viewport. The toast stands in if it cannot load.
 */
export const QURAZY_OVERLAY = Object.freeze({ key: 'o_qurazy_quoin_overlay', durationMs: 10000, x: 0.5, topY: -0.05, fadeOutMs: 3000 });

function showSpawnOverlay(engine) {
  const root = typeof document === 'undefined' ? null : document.getElementById('game-root');
  const c = root?.querySelector('canvas:not(.overlay-art):not(.lonely-fireworks):not(.lonely-portrait)')?.getBoundingClientRect();
  if (!c?.width) {
    engine.toast?.(QURAZY_SPAWN_LINE);
    return;
  }
  const r = root.getBoundingClientRect();
  const rect = { left: c.left - r.left, top: c.top - r.top, width: c.width, height: c.height };
  engine.setData?.('qurazyOverlay', 'playing');
  playVectorOverlay(root, QURAZY_OVERLAY.key, {
    rect,
    x: QURAZY_OVERLAY.x,
    topY: QURAZY_OVERLAY.topY,
    scale: c.width / 960,
    durationMs: QURAZY_OVERLAY.durationMs,
    fade: { inMs: OVERLAY_FADE.inMs, outMs: QURAZY_OVERLAY.fadeOutMs },
    loop: false,
    className: 'overlay-art qurazy-overlay',
  }).then((ok) => {
    engine.setData?.('qurazyOverlay', ok ? 'done' : 'missing');
    if (!ok) engine.toast?.(QURAZY_SPAWN_LINE);
  });
}

function standBeside(engine, mode) {
  const player = engine.player;
  if (!player || !liveQuoin) return;
  const onIt = mode === 'collect';
  player.x = liveQuoin.x - (onIt ? 0 : 70);
  player.y = liveQuoin.baseY + (onIt ? 28 : 58);
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
}

export const qurazyFeature = {
  id: QURAZY_FEATURE_ID,

  placementGroups(population, street) {
    const count = qurazyStreetEligible(street?.tsid) ? qurazyMarkersFor(street.tsid) : 0;
    return count ? [{ key: QURAZY_PLACEMENT_GROUP, count, clearance: 40 }] : [];
  },

  onStreetEnter(street, engine) {
    const tsid = street?.tsid || engine.streetTsid;
    const wasReconnect = reconnecting;
    reconnecting = false;
    liveQuoin = null;
    const p = params();
    const mode = String(p.get('qurazy') || '').toLowerCase();
    const now = Date.now();
    const today = qurazyDayIndex(now);
    rollQurazyDay(st, today);
    const markers = qurazyMarkersFor(tsid);

    // A reload on the street you left it on: the same Qurazy waits for you.
    if (wasReconnect && st.live && st.live.tsid === tsid && st.live.day === today && mode !== 'off') {
      placeQurazy(engine, st.live);
      lastRoll = 'spawn:reconnect:1';
    } else {
      st.live = null;
      if (mode === 'off') {
        lastRoll = 'skip:off:0';
      } else if (!qurazyStreetEligible(tsid) || engine.transientInstance?.()) {
        lastRoll = `skip:${markers ? 'not_here' : 'no_marker'}:0`;
      } else {
        const roll = rollQurazy(st, {
          tsid,
          markers,
          visitsBefore: engine.streetVisitsBefore?.(tsid) ?? 0,
          lastVisits: engine.streetLastVisits?.() || {},
          maxLuck: mode === 'force' || Boolean(engine.hasBuff?.('max_luck')),
          rng: fixedRng() || Math.random,
          now,
        });
        const chance = Math.round(roll.chance * 100) / 100;
        lastRoll = `${roll.spawn ? 'spawn' : roll.rolled ? 'miss' : 'skip'}:${roll.reason}:${chance}`;
        const spot = roll.spawn ? markerSpot(engine, roll.markerIndex) : null;
        if (spot && placeQurazy(engine, spot)) {
          st.live = { tsid, day: today, x: spot.x, y: spot.y };
          engine.pushActivity?.(QURAZY_SPAWN_LINE);
          showSpawnOverlay(engine);
        }
      }
    }
    const demoMode = String(p.get('qurazydemo') || '').toLowerCase();
    demo = demoMode && liveQuoin ? { mode: demoMode, at: now + 600 } : null;
    engine.save?.();
    publish(engine);
  },

  onStreetClear() {
    // onPlayerExit: one you did not grab is gone. The boot's first clear
    // comes before the reconnect check, so it keeps the saved one.
    if (!reconnecting) st.live = null;
    liveQuoin = null;
  },

  onTick(dtMs, now, engine) {
    if (demo && liveQuoin && Date.now() >= demo.at) {
      standBeside(engine, demo.mode);
      demo = null;
    }
    if (!liveQuoin) return;
    const list = engine.quoins || [];
    if (list.includes(liveQuoin)) return;
    // Grabbed (collectQuoin ran in the quoin loop): nothing waits here now.
    liveQuoin = null;
    st.live = null;
    collected += 1;
    engine.save?.();
    publish(engine);
  },

  save() {
    return {
      day: st.day,
      notFound: [...st.notFound],
      foundToday: { ...st.foundToday },
      lastFound: { ...st.lastFound },
      live: st.live ? { ...st.live } : null,
      totalSpawned: st.totalSpawned,
    };
  },

  restore(slice) {
    st = params().get('qurazyreset') === '1' ? createQurazyState() : createQurazyState(slice);
    reconnecting = true;
    liveQuoin = null;
  },
};

/** Tests: the live state and a clean slate. */
export function qurazyFeatureState() {
  return st;
}

export function resetQurazyFeatureForTests(seed = {}) {
  st = createQurazyState(seed);
  liveQuoin = null;
  reconnecting = true;
  lastRoll = '';
  collected = 0;
  demo = null;
}
