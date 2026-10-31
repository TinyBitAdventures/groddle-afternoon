/**
 * MINIMAP (G370): the street map's wiring (the view and its rules are js/ui/street-minimap.js).
 *
 * - Follows engine.street: a new street (or scene) gets its geometry, signposts and the lines
 *   picture at once, then the snapshot of its own layers 0.9 s and 4 s later, while the decos
 *   load (only while the map shows; a hidden map snaps when it next shows).
 * - Scenes a feature builds (lane HOMEMAP: the home street, the house, Tower floors, a visit to
 *   another player's home, the instances and races) have no street image to draw: they are
 *   snapped live, as the 2012 client re-snapped a home street (TSFrontController.resnapMiniMap,
 *   HandOfDecorator maybeResnapMiniMap): the scene's background with its cultivations, fixtures
 *   and furniture, never a player or a walking character (snapsWithScene). The same street built
 *   again (a cultivation placed or removed, an expansion, a new style) keeps its picture and
 *   snaps 0.25 s and 1.5 s later; anything else that changes what the snapshot draws (the Mail
 *   Dispatcher moved, a visitor's view of the owner's change, furniture after decorating) snaps
 *   0.3 s after it settles, never more than once a second (resnapMiniMap's batching). The
 *   scene's own posts (the World Gate, the friends' signpost) show as signposts
 *   (sceneSignMarks), as location.is_home kept a home's posts (maybeAddSignpost).
 * - Ten times a second: your point, the other players here and the Rube. Other players are the
 *   realtime feature's (engine.query('minimapPlayers'), multiplayer) and solo's local companions
 *   when they are on (engine.localCompanions); items are the features' (engine.query('minimapItems'),
 *   the Rube).
 * - Hidden by minimapVisibility: the setting, no_map, moving between streets, a full-screen
 *   moment, the Imagination menu, decorate mode, Camera Mode, the tutorial and arrival scenes.
 * - The height it takes goes on #game-root as --minimap-h, so the route card stacks under it.
 * - Click to walk (MAPWALK, MiniMapView.as mouseUpHandler): the view's click (or Enter on a
 *   mark) goes to engine.walkTo (game.js startUserWalk, js/user-path.js); a pointer click takes
 *   the keys back from a text field first, so the arrows and Space reach the avatar. While the
 *   walk runs its goal shows as a ring on the map (engine.userWalkGoal).
 *
 * Canvas data: streetMap (shown|off|no-map|hidden), streetMapFog, streetMapExpanded,
 * streetMapDots, streetMapDotIds, streetMapSigns, streetMapPicture (lines|snapshot),
 * streetMapSnapMs (the last snapshot's cost), streetMapSnaps (how many taken), streetMapWalk (the last click: kind:x, or
 * refused). QA: &streetmapexpand=1 expands it on each street.
 */

import { createStreetMinimap, minimapVisibility, onStreetMapChange, sceneSignMarks, setStreetMap, snapshotStreetView, snapsWithScene, streetMapOn } from '../ui/street-minimap.js?v=c52ec837';
import { classicArtUrl } from '../classic/classic-art.js?v=5745e669';
import { onUiModeChange } from '../classic/ui-mode.js?v=587c014a';

export const STREET_MINIMAP_FEATURE_ID = 'street-minimap';
const UPDATE_MS = 100;
const SNAP_AT_MS = [900, 4000];
/** The same street built again: its picture stays until these. */
const REBUILD_SNAP_AT_MS = [250, 1500];
/** A change in what the snapshot draws waits this long to settle... */
export const RESNAP_SETTLE_MS = 300;
/** ...and snaps at most once a second (resnapMiniMap: "batched and processed once per second"). */
export const RESNAP_MIN_MS = 1000;
/** The furniture layers homes-feature adds to the entity layer (addFurnitureLayers). */
const FURNITURE_LAYER = /^home-furniture/;

let view = null;
let host = null;
let street = null;
let lastUpdate = 0;
let snapTimers = [];
let snapOwed = false;
let lastState = '';
let lastDots = '';
let lastSnapAt = -Infinity;
let snapKey = '';
let resnapTimer = null;
let lastSignKey = '';
let snapCount = 0;

const reducedMotion = () => {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
};

/** The other players drawn on this street, and the tracked items. */
export function minimapRows(engine) {
  const rows = [];
  for (const p of engine.query?.('minimapPlayers', engine) || []) rows.push({ kind: 'player', ...p });
  for (const c of engine.localCompanions || []) {
    const s = c?.sprite;
    if (!s || s.destroyed || s.visible === false) continue;
    rows.push({ kind: 'player', id: `local-${c.name}`, label: c.label || c.name, x: s.x, y: s.y });
  }
  for (const it of engine.query?.('minimapItems', engine) || []) rows.push({ kind: 'item', ...it });
  return rows;
}

function stateFor(engine) {
  return minimapVisibility({
    pref: streetMapOn(),
    street: engine.street,
    started: engine.started,
    moving: Boolean(engine.streetCardUp?.()),
    screenView: Boolean(engine.screenViewOpen?.()),
    imagination: Boolean(engine.imaginationHubOpen?.()),
    decorating: engine.query?.('homeEditMode', engine) === 'decorate',
    cameraMode: engine.query?.('cameraModeActive', engine) === true,
    tutorial: engine.query?.('tutorialRunning', engine) === true,
    cutscene: Boolean(engine.instanceHold) || Boolean(engine.vogOpen?.()),
  });
}

function clearSnaps() {
  for (const t of snapTimers) clearTimeout(t);
  snapTimers = [];
  clearTimeout(resnapTimer);
  resnapTimer = null;
}

/** A scene a feature built (no street-render layers): its picture is the live scene. */
export function isLiveScene(streetView) {
  return Boolean(streetView && !streetView.destroyed && !streetView.parallaxLayers);
}

/** The entity layer's child that holds `obj` (or null). */
function topChild(layer, obj) {
  let o = obj;
  while (o && o.parent && o.parent !== layer) o = o.parent;
  return o && o.parent === layer ? o : null;
}

/**
 * What a live scene's snapshot draws from the entity layer: every registered thing that
 * snapsWithScene (with whatever holds it) and the furniture layers; never the player, a walking
 * character, prompts or effects. `rows` are the kept things for the change key.
 */
export function sceneEntities(engine) {
  const layer = engine.entityLayer;
  if (!layer || layer.destroyed) return null;
  const keep = new Set();
  const skip = new Set();
  const rows = [];
  for (const t of engine.interactables || []) {
    const top = t?.sprite && !t.sprite.destroyed ? topChild(layer, t.sprite) : null;
    if (!top) continue;
    if (snapsWithScene(t.classId)) {
      keep.add(top);
      rows.push(`${t.classId}:${Math.round(t.sprite.x / 4)}:${Math.round(t.sprite.y / 4)}`);
    } else skip.add(top);
  }
  for (const child of layer.children || []) {
    if (!FURNITURE_LAYER.test(String(child.label || ''))) continue;
    keep.add(child);
    for (const piece of child.children || []) rows.push(`f:${Math.round(piece.x / 4)}:${Math.round(piece.y / 4)}`);
  }
  if (engine.player) skip.add(engine.player);
  for (const s of skip) keep.delete(s);
  return { layer, keep: (child) => keep.has(child), rows };
}

/** What the snapshot would draw, as a string: a change asks for a new one. */
function liveKey(engine) {
  const v = engine.streetView;
  if (!isLiveScene(v)) return '';
  const ents = sceneEntities(engine);
  const b = engine.street?.bounds || {};
  return `${v.uid ?? ''}|${b.r - b.l}x${b.b - b.t}|${(ents?.rows || []).sort().join(',')}`;
}

function snap(engine) {
  if (!view || !street || engine.street !== street) return;
  if (view.state !== 'shown') {
    snapOwed = true;
    return;
  }
  snapOwed = false;
  const size = view.pictureSize();
  const t0 = performance.now();
  const live = isLiveScene(engine.streetView);
  const geom = view.geometry;
  const canvas = snapshotStreetView(engine.PIXI, engine.renderer, engine.streetView, size, {
    W: geom?.W,
    H: geom?.H,
    viewW: engine.viewWidth,
    entities: live ? sceneEntities(engine) : null,
  });
  lastSnapAt = performance.now();
  snapKey = live ? liveKey(engine) : '';
  const ms = lastSnapAt - t0;
  engine.setData?.('streetMapSnapMs', ms.toFixed(1));
  if (canvas) view.setPicture(canvas);
  engine.setData?.('streetMapPicture', view.root.dataset.picture || 'lines');
  engine.setData?.('streetMapSnaps', String((snapCount += 1)));
}

function scheduleSnaps(engine, at = SNAP_AT_MS) {
  clearSnaps();
  snapTimers = at.map((ms) => {
    const t = setTimeout(() => {
      snapTimers = snapTimers.filter((x) => x !== t);
      snap(engine);
    }, ms);
    return t;
  });
}

/** A change in a live scene: one snap once it settles, at most once a second. */
function requestResnap(engine) {
  if (resnapTimer || snapTimers.length) return;
  const wait = Math.max(RESNAP_SETTLE_MS, lastSnapAt + RESNAP_MIN_MS - performance.now());
  resnapTimer = setTimeout(() => {
    resnapTimer = null;
    snap(engine);
  }, wait);
}

function enterStreet(engine) {
  const next = engine.street || null;
  const rebuilt = Boolean(next && street && String(next.tsid || '') === String(street.tsid || ''));
  street = next;
  clearSnaps();
  snapOwed = false;
  view.setStreet(street, { platforms: engine.platforms || [], keepPicture: rebuilt });
  if (!rebuilt) lastSignKey = '';
  engine.setData?.('streetMapSigns', view.root.dataset.signs || '0');
  engine.setData?.('streetMapFog', street?.fogMap ? '1' : '0');
  engine.setData?.('streetMapPicture', street ? view.root.dataset.picture || 'lines' : '');
  if (street) scheduleSnaps(engine, rebuilt ? REBUILD_SNAP_AT_MS : SNAP_AT_MS);
}

/** A live scene's own posts on the map, and a new snapshot when what it draws has changed. */
function syncLiveScene(engine) {
  if (!isLiveScene(engine.streetView)) return;
  const marks = sceneSignMarks(engine.interactables || []);
  const signKey = marks.map((m) => `${m.x},${m.y},${m.tip}`).join('|');
  if (signKey !== lastSignKey) {
    lastSignKey = signKey;
    view.setSceneSigns(marks);
    engine.setData?.('streetMapSigns', view.root.dataset.signs || '0');
  }
  if (snapKey && liveKey(engine) !== snapKey) requestResnap(engine);
}

function sync(engine, force = false) {
  if (!view) return;
  if (engine.street !== street) enterStreet(engine);
  const state = stateFor(engine);
  if (force || state !== lastState) {
    lastState = state;
    view.setState(state);
    engine.setData?.('streetMap', state);
    if (state === 'shown' && street) {
      if (engine.param?.('streetmapexpand') === '1') view.expand(true);
      if (snapOwed) snap(engine);
    }
  }
  if (state !== 'shown') return;
  const p = engine.player;
  const rows = minimapRows(engine);
  view.update(p ? { x: p.x, y: p.y } : null, rows);
  const ids = rows.map((r) => `${r.kind}:${r.id}`).join(',');
  if (ids !== lastDots) {
    lastDots = ids;
    engine.setData?.('streetMapDots', String(rows.length));
    engine.setData?.('streetMapDotIds', ids);
  }
  engine.setData?.('streetMapExpanded', view.expanded ? '1' : '0');
  view.setDestination(engine.userWalkGoal || null);
  syncLiveScene(engine);
}

/** MAPWALK: a click on the map (or Enter on a mark) walks you there. */
export function walkFromMap(engine, goal, { keyboard = false, doc = globalThis.document } = {}) {
  if (!keyboard) {
    const active = doc?.activeElement;
    if (active?.matches?.('input, textarea, select, [contenteditable="true"]')) active.blur?.();
  }
  const ok = Boolean(engine.walkTo?.(goal));
  engine.setData?.('streetMapWalk', ok ? `${goal.kind}:${Math.round(goal.x)}` : 'refused');
  if (ok) view?.setDestination(engine.userWalkGoal || null);
  return ok;
}

export const streetMinimapFeature = {
  id: STREET_MINIMAP_FEATURE_ID,

  init(engine) {
    if (typeof document === 'undefined') return;
    host = document.getElementById('game-root');
    if (!host || view) return;
    view = createStreetMinimap(document, host, {
      artUrl: classicArtUrl,
      reducedMotion,
      onHide: () => setStreetMap(false),
      onShow: () => {
        setStreetMap(true);
        // The show button goes away under the focus: the card's tab takes it.
        setTimeout(() => (view.root.querySelector('.smm-tab:not([hidden])') || view.root.querySelector('.smm-hide'))?.focus?.(), 0);
      },
      // What stacks under the map (the route card) starts a 12 px gap below it.
      onLayout: (h) => host.style.setProperty('--minimap-h', `${h > 0 ? h + 12 : 0}px`),
      maxHeight: () => Math.max(120, (host.clientHeight || 600) * 0.55),
      onResnap: () => scheduleSnaps(engine, [60]),
      onWalk: (goal, how) => walkFromMap(engine, goal, how),
    });
    onStreetMapChange((on) => {
      sync(engine, true);
      if (!on && view.root.contains(document.activeElement)) view.showBtn.focus?.();
    });
    onUiModeChange(() => setTimeout(() => view?.relayout(), 0));
    globalThis.addEventListener?.('resize', () => view?.relayout());
    engine.setData?.('streetMap', 'hidden');
  },

  onStreetClear() {
    clearSnaps();
  },

  onTick(dtMs, now, engine) {
    if (!view) return;
    const t = performance.now();
    if (t - lastUpdate < UPDATE_MS && engine.street === street) return;
    lastUpdate = t;
    sync(engine);
  },
};
