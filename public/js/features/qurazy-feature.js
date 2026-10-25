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

import { GENTLE_ISLAND_TSIDS, isNewxpSceneTsid } from '../newxp.js?v=newxp-3';
import { qurazyMarkersFor } from '../qurazy-markers.js?v=g260-1';
import { OVERLAY_FADE, loadOverlayManifest, overlayPlacement, playVectorOverlay } from '../overlay-art.js?v=g311-1';
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

/** Space between the street-name pill and the banner's drawn top, in screen px. */
export const QURAZY_PILL_GAP = 6;

/**
 * G274: the banner's top_y, moved down only as far as the street-name pill
 * needs. The client had no pill there (its location name sat in the HUD
 * above the viewport), so at the source's -5% the banner's drawn top (the
 * stage top plus the art box's top, overlayPlacement in overlay-art.js) lands
 * right on the remake's own chrome. Size, timing, fades and x stay the source's.
 * `pillBottom` is in px from the viewport's top; null (no pill) keeps -5%.
 */
export function qurazyBannerTopY({ height, scale = 1, boxTop = 0, pillBottom = null, gap = QURAZY_PILL_GAP, topY = QURAZY_OVERLAY.topY }) {
  if (!(height > 0) || !Number.isFinite(pillBottom)) return topY;
  const drawnTop = height * topY + boxTop * scale;
  const want = pillBottom + gap;
  return drawnTop >= want ? topY : (want - boxTop * scale) / height;
}

/** The street-name pill's bottom edge in px from the viewport canvas's top, or null when it is not shown. */
function pillBottomIn(c) {
  const pill = document.getElementById('street-nameplate')?.getBoundingClientRect();
  if (!pill?.width || !pill.height) return null;
  return pill.bottom - c.top;
}

/**
 * G297: the banner's drawn box (the art box, as overlayPlacement and
 * playVectorOverlay place it) in the px of `rect`'s parent (#game-root):
 * { left, top, right, bottom }.
 */
export function qurazyBannerBox(meta, rect, { x = QURAZY_OVERLAY.x, topY = QURAZY_OVERLAY.topY, scale = 1 } = {}) {
  if (!meta?.stage || !meta?.box || !rect) return null;
  const at = overlayPlacement(meta, rect.width * x, rect.height * topY + (meta.stage[1] * scale) / 2, scale);
  const left = rect.left + at.left;
  const top = rect.top + at.top;
  return { left, top, right: left + at.width, bottom: top + at.height };
}

/** True when two { left, top, right, bottom } boxes share any area. */
export function boxesOverlap(a, b) {
  return Boolean(a && b) && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * G297: at 760 px and below the banner lands on the activity feed's line
 * that repeats its message. The banner keeps the source's place (top_y -5%,
 * just under the street-name pill) and the feed fades under it while they
 * meet, the way it does under a speech bubble with no clear spot (G269,
 * style.css data-under-speech). Its own attribute, since game.js sets
 * data-under-speech every frame.
 */
export const QURAZY_FEED_ATTR = 'data-under-banner';

function fadeFeedUnderBanner(root, canvas, box) {
  const feed = document.getElementById('activity-feed');
  if (!feed || !box) return;
  const step = () => {
    if (!canvas.isConnected) {
      feed.removeAttribute(QURAZY_FEED_ATTR);
      return;
    }
    const r = root.getBoundingClientRect();
    let over = false;
    if (Number(canvas.style.opacity || 0) > 0.05) {
      for (const line of feed.querySelectorAll('.act:not(.is-leaving)')) {
        const b = line.getBoundingClientRect();
        if (b.width && b.height && boxesOverlap(box, { left: b.left - r.left, top: b.top - r.top, right: b.right - r.left, bottom: b.bottom - r.top })) {
          over = true;
          break;
        }
      }
    }
    if (feed.hasAttribute(QURAZY_FEED_ATTR) !== over) feed.toggleAttribute(QURAZY_FEED_ATTR, over);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Bumped when a banner starts or is stopped, so a stopped one does not report "done". */
let bannerRun = 0;
/** A banner is playing or loading (G309: overlay-art may cancel it before onStreetClear runs). */
let bannerLive = false;

async function showSpawnOverlay(engine) {
  const run = ++bannerRun;
  const root = typeof document === 'undefined' ? null : document.getElementById('game-root');
  const c = root?.querySelector('canvas:not(.overlay-art):not(.lonely-fireworks):not(.lonely-portrait)')?.getBoundingClientRect();
  if (!c?.width) {
    engine.toast?.(QURAZY_SPAWN_LINE);
    return;
  }
  const r = root.getBoundingClientRect();
  const rect = { left: c.left - r.left, top: c.top - r.top, width: c.width, height: c.height };
  const scale = c.width / 960;
  // The art box (overlays.json); playVectorOverlay reads the same cached manifest.
  const meta = await loadOverlayManifest().then((m) => m?.[QURAZY_OVERLAY.key] || null, () => null);
  if (run !== bannerRun) return;
  const boxTop = meta?.box?.[1] ?? 0;
  const topY = qurazyBannerTopY({ height: c.height, scale, boxTop, pillBottom: pillBottomIn(c) });
  engine.setData?.('qurazyOverlay', 'playing');
  engine.setData?.('qurazyOverlayTopY', String(Math.round(topY * 1000) / 1000));
  const box = qurazyBannerBox(meta, rect, { topY, scale });
  // playVectorOverlay adds its canvas once the frames load: watch for it (3 s at most).
  const t0 = Date.now();
  const watch = () => {
    if (run !== bannerRun || Date.now() - t0 > 3000) return;
    const canvas = root.querySelector('canvas.qurazy-overlay');
    if (canvas) fadeFeedUnderBanner(root, canvas, box);
    else requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  bannerLive = true;
  playVectorOverlay(root, QURAZY_OVERLAY.key, {
    rect,
    x: QURAZY_OVERLAY.x,
    topY,
    scale,
    durationMs: QURAZY_OVERLAY.durationMs,
    fade: { inMs: OVERLAY_FADE.inMs, outMs: QURAZY_OVERLAY.fadeOutMs },
    loop: false,
    className: 'overlay-art qurazy-overlay',
  }).then((ok) => {
    if (run !== bannerRun) return;
    bannerLive = false;
    // null: a street change cancelled it (overlay-art cancelAllOverlays, G309).
    if (ok === null) {
      engine.setData?.('qurazyOverlay', 'stopped');
      return;
    }
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

  onStreetClear(engine) {
    // onPlayerExit: one you did not grab is gone. The boot's first clear
    // comes before the reconnect check, so it keeps the saved one.
    if (!reconnecting) st.live = null;
    liveQuoin = null;
    // G303, G311: the banner goes with the street (cancelAllOverlaysWeCan 193-215). It is a
    // playVectorOverlay, so game.js endStreetOverlays has already taken its canvas down, and the
    // feed fade ends with the canvas (fadeFeedUnderBanner). One still waiting on the manifest
    // has not started its player yet: the run bump keeps it off the next street.
    bannerRun += 1;
    const wasLive = bannerLive;
    bannerLive = false;
    if (wasLive) engine?.setData?.('qurazyOverlay', 'stopped');
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
