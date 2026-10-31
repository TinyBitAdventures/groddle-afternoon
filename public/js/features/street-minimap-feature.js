/**
 * MINIMAP (G370): the street map's wiring (the view and its rules are js/ui/street-minimap.js).
 *
 * - Follows engine.street: a new street (or scene) gets its geometry, signposts and the lines
 *   picture at once, then the snapshot of its own layers 0.9 s and 4 s later, while the decos
 *   load (only while the map shows; a hidden map snaps when it next shows).
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
 * streetMapSnapMs (the last snapshot's cost), streetMapWalk (the last click: kind:x, or
 * refused). QA: &streetmapexpand=1 expands it on each street.
 */

import { createStreetMinimap, minimapVisibility, onStreetMapChange, setStreetMap, snapshotStreetView, streetMapOn } from '../ui/street-minimap.js?v=23e34f93';
import { classicArtUrl } from '../classic/classic-art.js?v=8da477d9';
import { onUiModeChange } from '../classic/ui-mode.js?v=587c014a';

export const STREET_MINIMAP_FEATURE_ID = 'street-minimap';
const UPDATE_MS = 100;
const SNAP_AT_MS = [900, 4000];

let view = null;
let host = null;
let street = null;
let lastUpdate = 0;
let snapTimers = [];
let snapOwed = false;
let lastState = '';
let lastDots = '';

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
  const canvas = snapshotStreetView(engine.PIXI, engine.renderer, engine.streetView, size);
  const ms = performance.now() - t0;
  engine.setData?.('streetMapSnapMs', ms.toFixed(1));
  if (canvas) view.setPicture(canvas);
  engine.setData?.('streetMapPicture', view.root.dataset.picture || 'lines');
}

function scheduleSnaps(engine, at = SNAP_AT_MS) {
  clearSnaps();
  snapTimers = at.map((ms) => setTimeout(() => snap(engine), ms));
}

function enterStreet(engine) {
  street = engine.street || null;
  clearSnaps();
  snapOwed = false;
  view.setStreet(street, { platforms: engine.platforms || [] });
  engine.setData?.('streetMapSigns', view.root.dataset.signs || '0');
  engine.setData?.('streetMapFog', street?.fogMap ? '1' : '0');
  engine.setData?.('streetMapPicture', street ? 'lines' : '');
  if (street) scheduleSnaps(engine);
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
