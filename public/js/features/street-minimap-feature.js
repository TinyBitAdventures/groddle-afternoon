/**
 * MINIMAP (G370): the street map's wiring (the view and its rules are js/ui/street-minimap.js).
 *
 * - Follows engine.street: a new street (or scene) gets its geometry and signposts at once, and
 *   the card waits unseen (READY, js/ui/street-minimap.js) for the snapshot of its own layers.
 *   ART: the snapshot is taken when the street's art has really loaded: once the street view for
 *   this street is up, every image under it (its layers, decos, front layers; a live scene's kept
 *   entities too) that is still loading is waited for (js/textures.js onLoaded / onFailed), then
 *   ART_SETTLE_MS for the colour bakes street-render runs as they land, then a frame. A slow
 *   network has a cap: ART_CAP_MS after the map shows, the best snapshot so far shows, and the
 *   map snaps again when the rest lands. The 2012 client did the same: a snap once the location
 *   was built (LocationViewBuilder.locationBuilt -> resnapMiniMap) and another as each late deco
 *   arrived (DecoRenderer.addAndSyncDecoAsset), batched to once a second. Only while the map
 *   shows; a hidden map snaps when it next shows.
 * - Scenes a feature builds (lane HOMEMAP: the home street, the house, Tower floors, a visit to
 *   another player's home, the instances and races) have no street image to draw: they are
 *   snapped live, as the 2012 client re-snapped a home street (TSFrontController.resnapMiniMap,
 *   HandOfDecorator maybeResnapMiniMap): the scene's background with its cultivations, fixtures
 *   and furniture, never a player or a walking character (snapsWithScene). The same street built
 *   again (a cultivation placed or removed, an expansion, a new style) keeps its picture and
 *   snaps 0.25 s and 1.5 s later; anything else that changes what the snapshot draws (the Mail
 *   Dispatcher moved, a visitor's view of the owner's change, furniture after decorating) snaps
 *   0.3 s after it settles, never more than once a second (resnapMiniMap's batching). The
 *   scene's own post (the signpost: Back to Ur and the friends' arms) shows as one signpost
 *   (sceneSignMarks), as location.is_home kept a home's posts (maybeAddSignpost).
 * - READY in every scene: a live scene (home street, house, Tower floors, visits, instances, races)
 *   is watched the same way (its own view and its kept entities) and snapped live; one with no view
 *   to snap shows the lines at the cap, so the card is never left hidden. The phone sheet opened
 *   before its picture is in shows a calm empty card (style.css PHONE MAP), never the lines. fog_map
 *   keeps its wash and words over the picture (they fade in with it); no_map stays hidden.
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
 * - RIGHTCLICK (right-click audit later batch item 6): a right-click, a long press, Shift+F10 or
 *   the Menu key on another player's dot opens their menu (engine.openPlayerMenu: they are here, so
 *   the whole world menu), on a signpost Walk here and its arms (engine.openSignpostMenu, game.js);
 *   nothing else on the map opens one (menuFromMap).
 *
 * - No card on a phone (Austin 2026-11-12, on his iPhone: "I think the minimap should just be hidden
 *   on the phone"): where window.GRODDLE_DEVICE is "phone" (the phone gate, js/touch-controls.js
 *   isPhoneDevice) the corner card is never built; the Menu's Street map switch, Classic's
 *   Preferences row and Shift+M go with it (style.css PHONEKEYS).
 * - PHONE MAP (Austin 2026-11-13, p13: "Not having the minimap makes it hard to find streets ... Maybe
 *   an icon which opens minimap full screen then closes when finished?"): a small map button at the
 *   front of the street's name opens the same map full screen (the street's picture, your spot, the
 *   others here, the signposts), with the signposts' destinations listed under it. A tap on the map or
 *   a destination walks there (MAPWALK) and closes it; so do the X, a tap outside and Esc. It costs
 *   nothing while closed: the view, its picture canvas and its one snapshot are made on open and freed
 *   on close (view.destroy zeroes the canvases), and nothing runs per tick but a street check.
 * - SUBWAY (#463, a player's request Austin approved 2026-11-19): a street's subway entrance shows on
 *   the map like a signpost (js/ui/street-minimap.js stationMarks, the hub map's subway icon), and the
 *   phone sheet lists it with the signposts, a tap walks there.
 *
 * Canvas data: streetMap (shown|off|no-map|hidden|phone), streetMapFog, streetMapExpanded,
 * streetMapDots, streetMapDotIds, streetMapSigns, streetMapPicture (lines|snapshot),
 * streetMapReady (1 the card shows with its picture, 0 it waits unseen for it), streetMapArt (ART:
 * waiting for the view | loading:<images left> | capped:<images left> | loaded), streetMapCache (REVISIT:
 * hit, the street's last picture showed at once | miss), streetMapCacheKb (the cache's size),
 * streetMapSnapMs (the last snapshot's cost), streetMapSnaps (how many taken), streetMapWalk (the last click: kind:x, or
 * refused). QA: &streetmapexpand=1 expands it on each street.
 */

import { STREET_ENTITY_KINDS } from '../street-render.js?v=e7e9dfda';
import { DOOR_LOOKS, createPictureCache, createStreetMinimap, doorArtName, doorMarks, markArt, minimapVisibility, onStreetMapChange, sceneDoorMarks, sceneSignMarks, setStreetMap, signpostMarks, snapshotStreetView, snapsWithScene, stationMarks, streetMapOn, teleporterMarks, withDoorArt } from '../ui/street-minimap.js?v=faab9586';
import { classicArtHd, classicArtUrl } from '../classic/classic-art.js?v=0f6f02a3';
import { onUiModeChange } from '../classic/ui-mode.js?v=a8deea36';
import { focusBack } from '../ui/focus-return.js?v=da190597';
import { isPhoneDevice } from '../touch-controls.js?v=8bc690ac';
import { isFailed, isLoaded, onFailed, onLoaded } from '../textures.js?v=b8e38103';

export const STREET_MINIMAP_FEATURE_ID = 'street-minimap';
const UPDATE_MS = 100;
/** ART: the best snapshot shows this long after the map shows, even while decos still arrive... */
export const ART_CAP_MS = 3000;
/** ...and once the art is in, the colour bakes it sets off (street-render recolour, edge mirrors) get this long. */
export const ART_SETTLE_MS = 120;
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
/** REVISIT: the last picture of each recent street this session (js/ui/street-minimap.js createPictureCache). */
export const pictureCache = createPictureCache();
/** ART: the art watch for this street ({ street, view, left, loaded, capped, ... }), or null. */
let art = null;
/** PHONE MAP: { btn, sheet, plateStreet } on a phone (the map's view lives only while the sheet is open). */
let phone = null;

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
    // PHONE MAP: opened on purpose, so the corner card's setting never hides it.
    pref: phone ? true : streetMapOn(),
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

/**
 * R51 (#656): what a real street's snapshot draws from the entity layer: the street's own things
 * the street renderer lists (js/street-render.js STREET_ENTITY_KINDS: its doors, the dinos and
 * subway entrances among them), as getSnapshot kept the doors and hid the players and itemstacks.
 */
export function streetEntities(engine) {
  const layer = engine.entityLayer;
  if (!layer || layer.destroyed) return null;
  const keep = new Set();
  const rows = [];
  for (const child of layer.children || []) {
    if (!child || child.destroyed || !STREET_ENTITY_KINDS.includes(child.streetEntity)) continue;
    keep.add(child);
    rows.push(`${child.streetEntity}:${Math.round(child.x / 4)}:${Math.round(child.y / 4)}`);
  }
  if (engine.player) keep.delete(engine.player);
  return { layer, keep: (child) => keep.has(child), rows };
}

/** R51: what the snapshot draws from the entity layer: a live scene's kept things, else the street's own. */
export function snapshotEntities(engine) {
  return isLiveScene(engine.streetView) ? sceneEntities(engine) : streetEntities(engine);
}

/** What the snapshot would draw, as a string: a change asks for a new one. */
function liveKey(engine) {
  const v = engine.streetView;
  if (!v || v.destroyed) return '';
  const ents = snapshotEntities(engine);
  const b = engine.street?.bounds || {};
  return `${v.uid ?? ''}|${b.r - b.l}x${b.b - b.t}|${(ents?.rows || []).sort().join(',')}`;
}

function snap(engine) {
  if (!view || !street || engine.street !== street) return;
  // ART: never another street's view (the old one stays up while the new one loads).
  if (!viewIsFor(engine.streetView, street)) return;
  if (view.state !== 'shown') {
    snapOwed = true;
    return;
  }
  snapOwed = false;
  const size = view.pictureSize();
  const t0 = performance.now();
  const geom = view.geometry;
  const canvas = snapshotStreetView(engine.PIXI, engine.renderer, engine.streetView, size, {
    W: geom?.W,
    H: geom?.H,
    viewW: engine.viewWidth,
    entities: snapshotEntities(engine),
  });
  lastSnapAt = performance.now();
  snapKey = liveKey(engine);
  const ms = lastSnapAt - t0;
  engine.setData?.('streetMapSnapMs', ms.toFixed(1));
  // REVISIT: kept for a walk back once the art is all in (never a capped, half-loaded picture).
  if (canvas && view.setPicture(canvas) && street.tsid && (!art || art.loaded)) {
    pictureCache.put(street.tsid, view.pictureForCache());
    engine.setData?.('streetMapCacheKb', String(Math.round(pictureCache.bytes() / 1024)));
  }
  // READY: a snapshot that fails outright shows the lines picture rather than no card.
  else if (!canvas && !view.ready) view.reveal();
  engine.setData?.('streetMapPicture', view.root.dataset.picture || 'lines');
  engine.setData?.('streetMapSnaps', String((snapCount += 1)));
}

/** READY: the card shows with its picture, or waits unseen for it (canvas data streetMapReady). */
function readyChanged(engine, on) {
  engine.setData?.('streetMapReady', on ? '1' : '0');
  if (view) engine.setData?.('streetMapPicture', view.root.dataset.picture || 'lines');
}

function scheduleSnaps(engine, at) {
  clearSnaps();
  snapTimers = at.map((ms) => {
    const t = setTimeout(() => {
      snapTimers = snapTimers.filter((x) => x !== t);
      snap(engine);
    }, ms);
    return t;
  });
}

/** ART: whether `v` (engine.streetView) is the view of `forStreet`: a scene a feature builds, or a street view built from it. */
export function viewIsFor(v, forStreet) {
  if (!v || v.destroyed || !forStreet) return false;
  if (isLiveScene(v) || !v.street) return true;
  return v.street === forStreet || String(v.street.tsid || '') === String(forStreet.tsid || '');
}

/**
 * PURE (ART): the image sources under `roots` (Pixi nodes) still loading: a texture's source that has
 * neither loaded nor failed (js/textures.js; a canvas or render texture counts as loaded).
 */
export function pendingArtSources(roots = [], { loaded = isLoaded, failed = isFailed } = {}) {
  const out = new Set();
  const stack = roots.filter(Boolean);
  while (stack.length) {
    const n = stack.pop();
    if (!n || n.destroyed) continue;
    const src = n.texture?.source;
    if (src && !src.destroyed && !out.has(src) && !loaded(src) && !failed(src)) out.add(src);
    const kids = n.children;
    if (kids?.length) for (let i = 0; i < kids.length; i++) stack.push(kids[i]);
  }
  return [...out];
}

/** ART: what the snapshot draws: the view, its front layers, and a live scene's kept entities. */
function artRoots(engine, v) {
  const roots = [v];
  if (v.frontView && !v.frontView.destroyed && v.frontView.parent !== v) roots.push(v.frontView);
  const ents = snapshotEntities(engine);
  for (const child of ents?.layer.children || []) if (ents.keep(child)) roots.push(child);
  return roots;
}

function stopArt() {
  if (!art) return;
  clearTimeout(art.capTimer);
  clearTimeout(art.settleTimer);
  art = null;
}

function startArt(engine) {
  stopArt();
  art = { street, view: null, left: 0, gen: 0, loaded: false, capped: false, capTimer: null, settleTimer: null };
  engine.setData?.('streetMapArt', 'waiting');
  attachArt(engine);
}

/** ART: start watching once this street's view is up (sync tries again every tick until it is). */
function attachArt(engine) {
  const a = art;
  if (!a || a.loaded) return;
  const v = engine.streetView;
  if (a.view && a.view === v && !v.destroyed) return;
  if (!viewIsFor(v, a.street)) return;
  a.view = v;
  watchArt(engine, a);
  // Past the cap already with nothing shown (the view came late): the best snapshot now.
  if (art === a && a.capped && view && !view.ready) snap(engine);
}

function watchArt(engine, a) {
  const pending = pendingArtSources(artRoots(engine, a.view));
  a.gen += 1;
  const gen = a.gen;
  a.left = pending.length;
  if (!a.left) {
    artLanded(engine, a);
    return;
  }
  engine.setData?.('streetMapArt', `loading:${a.left}`);
  const done = () => {
    if (art !== a || a.gen !== gen) return;
    a.left -= 1;
    if (a.left <= 0) artLanded(engine, a);
  };
  for (const src of pending) {
    onLoaded(src, done);
    onFailed(src, done);
  }
}

/** ART: everything that was loading is in: wait for anything added since, else snap a frame after the bakes. */
function artLanded(engine, a) {
  const v = engine.streetView;
  if (v !== a.view || !v || v.destroyed) {
    // Built again meanwhile: watch the new one.
    a.view = null;
    attachArt(engine);
    return;
  }
  if (pendingArtSources(artRoots(engine, v)).length) {
    watchArt(engine, a);
    return;
  }
  a.loaded = true;
  engine.setData?.('streetMapArt', 'loaded');
  clearTimeout(a.settleTimer);
  a.settleTimer = setTimeout(() => {
    const frame = globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
    frame(() => {
      if (art === a) snap(engine);
    });
  }, ART_SETTLE_MS);
}

/** ART: the cap runs from when the map first shows on this street. */
function startArtCap(engine) {
  const a = art;
  if (!a || a.capTimer || a.loaded) return;
  a.capTimer = setTimeout(() => {
    if (art !== a || a.loaded) return;
    a.capped = true;
    engine.setData?.('streetMapArt', `capped:${a.left}`);
    if (!view || view.ready) return;
    // Nothing to snap (a scene with no view of its own): the lines, so the rule never leaves a map hidden.
    if (!viewIsFor(engine.streetView, street)) view.reveal();
    else snap(engine);
  }, ART_CAP_MS);
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
  // REVISIT: a street walked back to shows its last picture at once; its art still refreshes it.
  const cached = street && !rebuilt ? pictureCache.get(street.tsid) : null;
  view.setStreet(street, { platforms: engine.platforms || [], keepPicture: rebuilt, cached });
  if (street && !rebuilt) engine.setData?.('streetMapCache', cached ? 'hit' : 'miss');
  if (!rebuilt) lastSignKey = '';
  engine.setData?.('streetMapSigns', view.root.dataset.signs || '0');
  engine.setData?.('streetMapFog', street?.fogMap ? '1' : '0');
  engine.setData?.('streetMapPicture', street ? view.root.dataset.picture || 'lines' : '');
  engine.setData?.('streetMapReady', view.ready ? '1' : '0');
  if (!street) stopArt();
  // The same street built again, already shown: its picture stays until the rebuild snaps.
  else if (rebuilt && view.ready) {
    stopArt();
    scheduleSnaps(engine, REBUILD_SNAP_AT_MS);
  } else startArt(engine);
}

/**
 * A live scene's own posts on the map, and a new snapshot when what it draws has changed (R51: on
 * a real street too, when its doors come in after the snap).
 */
function syncLiveScene(engine) {
  if (snapKey && liveKey(engine) !== snapKey) requestResnap(engine);
  if (!isLiveScene(engine.streetView)) return;
  // G1232 (#645): a scene's way out (the hall's glass doors) beside its posts.
  const marks = [...sceneSignMarks(engine.interactables || []), ...sceneDoorMarks(engine.interactables || [])];
  const signKey = marks.map((m) => `${m.x},${m.y},${m.tip}`).join('|');
  if (signKey !== lastSignKey) {
    lastSignKey = signKey;
    view.setSceneSigns(marks);
    engine.setData?.('streetMapSigns', view.root.dataset.signs || '0');
  }
}

function sync(engine, force = false) {
  if (!view) return;
  if (engine.street !== street) enterStreet(engine);
  attachArt(engine);
  const state = stateFor(engine);
  if (state === 'shown') startArtCap(engine);
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

/**
 * RIGHTCLICK: a mark's menu (the view's onMenu): a player's (their id and name) or a signpost's
 * (Walk here, as a click on it, then its arms). Returns whether one opened.
 */
export function menuFromMap(engine, goal, { at = null, keys = false, el = null, mark = '' } = {}) {
  const findOpener = () => (mark ? view?.root.querySelector(`[data-mark="${globalThis.CSS?.escape ? CSS.escape(mark) : mark}"]`) || null : null);
  if (goal?.kind === 'player') {
    return Boolean(engine.openPlayerMenu?.({ id: goal.id, name: goal.label, at, keys, anchor: el, opener: el, findOpener }));
  }
  if (goal?.kind === 'sign') {
    return Boolean(engine.openSignpostMenu?.({ id: goal.id, x: goal.x, y: goal.y, at, keys, anchor: el, opener: el, findOpener, walk: () => walkFromMap(engine, goal, { keyboard: keys }) }));
  }
  return false;
}

/** MAPWALK: a click on the map (or Enter on a mark) walks you there. */
export function walkFromMap(engine, goal, { keyboard = false, doc = globalThis.document } = {}) {
  if (!keyboard) {
    const active = doc?.activeElement;
    if (active?.matches?.('input, textarea, select, [contenteditable="true"]')) active.blur?.();
  }
  // #645: a teleporter's portal button travels where walking into it does (the hidden-floors feature's teleport).
  if (String(goal?.id || '').startsWith('teleporter:')) {
    const ok = engine.query?.('teleportFromMap', goal.id.slice('teleporter:'.length), engine) === true;
    engine.setData?.('streetMapWalk', ok ? goal.id : 'refused');
    return ok;
  }
  const ok = Boolean(engine.walkTo?.(goal));
  engine.setData?.('streetMapWalk', ok ? `${goal.kind}:${Math.round(goal.x)}` : 'refused');
  if (ok) view?.setDestination(engine.userWalkGoal || null);
  return ok;
}

/** PURE: whether this device goes without the street map (a phone, the phone gate's device). */
export function minimapOffOnDevice(win = globalThis) {
  return isPhoneDevice(win);
}

/* ------------------------------------------------------------ phone map */

const PHONE_MAP_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="15" height="12" rx="2" /><path d="M2.5 12.5 7 9l3.5 2.5L14 8l3.5 3" /><circle cx="10.5" cy="7" r="1.4" fill="currentColor" stroke="none" /></svg>';
export const PHONE_MAP_TEXT = Object.freeze({ open: 'Street map', close: 'Close the street map', signs: 'Signposts', none: 'No signposts on this street.', map: 'Map', mapLabel: 'Open the Map (M)' });
/** The bar's Map icon (play/index.html #map-btn), for the sheet's Map button. */
const WORLD_MAP_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 5 7.5 3l5 2 5-2v12l-5 2-5-2-5 2z" /><path d="M7.5 3v12M12.5 5v12" /></svg>';

/**
 * PURE: whether the street sheet offers the Map (G858, #409): where the bar's Map button is there and
 * live, as on a computer, where the street's name opens the Map (topbar.js installLocationLink). The
 * tutorial and quest places that take the Map away (body.nx-hide-map, a disabled #map-btn) keep it away.
 */
export function phoneMapLinkAllowed(doc = globalThis.document) {
  const btn = doc?.getElementById?.('map-btn');
  return Boolean(btn && !btn.disabled && !doc.body?.classList?.contains('nx-hide-map'));
}

/**
 * PURE: the map's width (css px) in a box `availW` x `availH`, so the whole street fits without
 * scrolling: as wide as the box, unless the street is tall enough that its height is the limit.
 */
export function phoneMapWidth(street, availW, availH) {
  const b = street?.bounds || {};
  const W = Number(b.r) - Number(b.l);
  const H = Number(b.b) - Number(b.t);
  const aw = Math.max(0, Number(availW) || 0);
  const ah = Math.max(0, Number(availH) || 0);
  if (!(W > 0) || !(H > 0) || !(ah > 0)) return Math.max(160, Math.floor(aw));
  return Math.max(160, Math.floor(Math.min(aw, (ah * W) / H)));
}

/**
 * The eight ways a signpost can stand from you on the phone sheet (#534, Austin 2026-11-19: live, eight
 * directions), clockwise from right in screen space (y grows down), one per 45 degrees.
 */
export const PHONE_SIGN_DIRS = Object.freeze(['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right']);
/** Within this many world px of you a signpost is 'here'. */
export const PHONE_SIGN_NEAR = 60;
/** The dead zone: an arrow keeps its way until you are this far (degrees, px for 'here') past the edge. */
export const PHONE_SIGN_DEAD = Object.freeze({ deg: 10, px: 15 });

/**
 * PURE (#534): which way a signpost `dx`, `dy` world px from you stands (screen space, y down): 'here'
 * within PHONE_SIGN_NEAR, else one of PHONE_SIGN_DIRS. `prev`, the arrow it shows now, holds until
 * the way is a dead zone past its edge, so an arrow never flickers between neighbours.
 */
export function phoneSignDir(dx, dy = 0, prev = '') {
  const x = Number(dx);
  const y = Number.isFinite(Number(dy)) ? Number(dy) : 0;
  if (!Number.isFinite(x)) return 'here';
  const d = Math.hypot(x, y);
  if (d <= PHONE_SIGN_NEAR || (prev === 'here' && d <= PHONE_SIGN_NEAR + PHONE_SIGN_DEAD.px)) return 'here';
  const ang = (Math.atan2(y, x) * 180) / Math.PI;
  const i = PHONE_SIGN_DIRS.indexOf(prev);
  if (i >= 0) {
    const off = Math.abs((((ang - i * 45) % 360) + 540) % 360 - 180);
    if (off <= 22.5 + PHONE_SIGN_DEAD.deg) return prev;
  }
  return PHONE_SIGN_DIRS[((Math.round(ang / 45) % 8) + 8) % 8];
}

/**
 * PURE: the signposts' rows under the phone map, left to right: { id, kind, x, y, text, side } where
 * side says which way it stands from `you` ({ x, y }, or an x alone; #534: phoneSignDir). A subway
 * entrance (#463, kind 'station': the remake's own) is a row like a signpost's, its station's name;
 * so is a door out (G1232, #645, kind 'door': the remake's own), where it leads.
 */
export function phoneSignRows(marks = [], you = null) {
  const at = typeof you === 'number' || you == null ? { x: you, y: null } : you;
  return [...marks]
    .filter((m) => m && Number.isFinite(m.x))
    .sort((a, b) => a.x - b.x)
    .map((m) => {
      const dy = Number.isFinite(at.y) && Number.isFinite(m.y) ? m.y - at.y : 0;
      const side = Number.isFinite(at.x) ? phoneSignDir(m.x - at.x, dy) : 'here';
      const kind = m.kind === 'station' || m.kind === 'door' ? m.kind : 'sign';
      const text = String(m.tip || '').split('\n').filter(Boolean).join(', ') || (kind === 'station' ? 'Subway station' : kind === 'door' ? 'Door' : 'Signpost');
      return { id: m.id, kind, ...(kind === 'door' ? { look: DOOR_LOOKS.includes(m.look) ? m.look : 'door' } : {}), x: m.x, y: m.y, text, side };
    });
}

/**
 * #534: the open sheet's arrows follow you (an auto-walk is when it matters). `items` are
 * { el, x, y, side }; each takes its new way from `you` ({ x, y }) and its button's data-side changes
 * only when the way does. Returns how many changed.
 */
export function phoneSignRefresh(items = [], you = null) {
  if (!Number.isFinite(you?.x)) return 0;
  let changed = 0;
  for (const it of items) {
    const dy = Number.isFinite(you.y) && Number.isFinite(it.y) ? it.y - you.y : 0;
    const side = phoneSignDir(it.x - you.x, dy, it.side);
    if (side === it.side) continue;
    it.side = side;
    if (it.el?.dataset) it.el.dataset.side = side;
    changed += 1;
  }
  return changed;
}

function phoneOpen(engine) {
  if (!phone || view || !engine.street || engine.street.noMap) return;
  const doc = document;
  const gameRoot = doc.getElementById('game-root');
  if (!gameRoot) return;
  const sheet = doc.createElement('div');
  sheet.id = 'street-minimap-sheet';
  sheet.className = 'smm-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'smm-sheet-title');
  sheet.dataset.ctx = 'minimap';
  sheet.innerHTML = `
    <div class="smm-sheet-card">
      <header class="smm-sheet-head"><h2 id="smm-sheet-title"></h2><button type="button" class="smm-sheet-mapbtn" aria-label="${PHONE_MAP_TEXT.mapLabel}" hidden>${WORLD_MAP_SVG}<span>${PHONE_MAP_TEXT.map}</span></button><button type="button" class="smm-sheet-x" aria-label="${PHONE_MAP_TEXT.close}" title="${PHONE_MAP_TEXT.close}">×</button></header>
      <div class="smm-sheet-map"></div>
      <section class="smm-sheet-signs" aria-label="${PHONE_MAP_TEXT.signs}"></section>
    </div>`;
  sheet.querySelector('#smm-sheet-title').textContent = (doc.getElementById('street-name')?.textContent || '').trim() || PHONE_MAP_TEXT.open;
  gameRoot.append(sheet);
  const mapBox = sheet.querySelector('.smm-sheet-map');
  const signsBox = sheet.querySelector('.smm-sheet-signs');
  phone.sheet = sheet;
  // The signposts' destinations, a tap away.
  const live = isLiveScene(engine.streetView);
  const marks = [...signpostMarks(engine.street), ...(live ? sceneSignMarks(engine.interactables || []) : []), ...stationMarks(engine.street), ...doorMarks(engine.street), ...(live ? sceneDoorMarks(engine.interactables || []) : []), ...teleporterMarks(engine.query?.('minimapTeleporters', engine.street, engine) || [])];
  const rows = phoneSignRows(marks, engine.player ? { x: engine.player.x, y: engine.player.y } : null);
  phone.signs = [];
  if (rows.length) {
    const list = doc.createElement('ul');
    for (const row of rows) {
      const li = doc.createElement('li');
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'smm-sheet-sign';
      b.dataset.side = row.side;
      b.dataset.signId = row.id;
      b.dataset.kind = row.kind;
      // SHARP MARKS: the row's icon is the trace (14 x 21 CSS px from a 10 x 15 bitmap, 3x on a phone).
      // #645: a door's row shows its kind's icon (a dinosaur's mouth, a portal or a door).
      if (row.kind === 'door') b.dataset.look = row.look;
      b.innerHTML = `${markArt(row.kind === 'door' ? doorArtName(row.look) : row.kind === 'station' ? 'map_icon_subway' : 'teensy_signpost', withDoorArt({ artUrl: classicArtUrl, artHd: classicArtHd, crisp: true }))}<span></span>`;
      b.querySelector('span').textContent = row.text;
      phone.signs.push({ el: b, x: row.x, y: row.y, side: row.side });
      b.setAttribute('aria-label', row.kind === 'station' ? `Walk to ${row.text}` : row.kind === 'door' ? `Walk to the door to ${row.text}` : `Walk to the signpost to ${row.text}`);
      b.addEventListener('click', () => {
        if (walkFromMap(engine, { kind: row.kind, id: row.id, x: row.x, y: row.y }, { keyboard: true })) phoneClose(engine, { walked: true });
      });
      li.append(b);
      list.append(li);
    }
    signsBox.append(list);
    engine.setData?.('streetMapPhoneSides', phone.signs.map((x) => x.side).join(','));
  } else {
    const p = doc.createElement('p');
    p.className = 'smm-sheet-none';
    p.textContent = PHONE_MAP_TEXT.none;
    signsBox.append(p);
  }
  host = mapBox;
  // #600: the map fits the box the sheet leaves it once the head and the list are in (the list takes
  // up to 38% of the card), so a tall street never runs over the Map button, the X or the list.
  const availW = mapBox.clientWidth || gameRoot.clientWidth - 32;
  const availH = Math.max(120, (mapBox.clientHeight || gameRoot.clientHeight * 0.6));
  view = createStreetMinimap(doc, mapBox, {
    artUrl: classicArtUrl,
    artHd: classicArtHd,
    crisp: () => true,
    teleporters: (s) => engine.query?.('minimapTeleporters', s, engine) || [],
    reducedMotion: () => true,
    onHide: () => phoneClose(engine),
    onShow: () => {},
    onLayout: () => {},
    onReady: (on) => readyChanged(engine, on),
    maxHeight: () => availH,
    onResnap: () => scheduleSnaps(engine, [60]),
    onWalk: (goal, how) => {
      const ok = walkFromMap(engine, goal, how);
      if (ok) phoneClose(engine, { walked: true });
      return ok;
    },
  });
  view.root.classList.add('is-phone-sheet');
  view.root.style.setProperty('--mm-w', `${phoneMapWidth(engine.street, availW, availH)}px`);
  street = null;
  lastState = '';
  lastDots = '';
  sync(engine, true);
  view.expand(true);
  sheet.querySelector('.smm-sheet-x').addEventListener('click', () => phoneClose(engine));
  // G858 (#409): the Map, a tap away, as the street's name is on a computer.
  const mapBtn = sheet.querySelector('.smm-sheet-mapbtn');
  if (typeof engine.openMap === 'function' && phoneMapLinkAllowed(doc)) {
    mapBtn.hidden = false;
    mapBtn.addEventListener('click', () => {
      phoneClose(engine, { map: true });
      engine.openMap();
    });
  }
  // A tap outside the card closes it; the street under it never hears the tap.
  sheet.addEventListener('pointerdown', (e) => e.stopPropagation());
  sheet.addEventListener('click', (e) => {
    if (!e.target?.closest?.('.smm-sheet-card')) phoneClose(engine);
  });
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      phoneClose(engine);
    }
  });
  phone.btn.setAttribute('aria-expanded', 'true');
  sheet.querySelector('.smm-sheet-x').focus?.({ preventScroll: true });
  engine.setData?.('streetMapPhone', 'open');
}

function phoneClose(engine, { walked = false, map = false } = {}) {
  if (!phone) return;
  clearSnaps();
  stopArt();
  view?.destroy();
  view = null;
  host = null;
  street = null;
  lastState = '';
  lastDots = '';
  snapOwed = false;
  phone.sheet?.remove();
  phone.sheet = null;
  phone.signs = [];
  phone.btn.setAttribute('aria-expanded', 'false');
  engine.setData?.('streetMap', 'phone');
  engine.setData?.('streetMapPhone', walked ? 'walked' : map ? 'map' : 'closed');
  // The keys go back to the world after a walk; the button after a close; the Map takes them after Map.
  if (!walked && !map) phone.btn.focus?.({ preventScroll: true });
}

/** PHONE MAP: the button at the front of the street's name (made once; kept when the name redraws). */
function phoneInstall(engine) {
  const plate = document.getElementById('street-nameplate');
  if (!plate) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'street-map-phone-btn';
  btn.className = 'smm-phone-btn';
  btn.setAttribute('aria-label', PHONE_MAP_TEXT.open);
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.title = PHONE_MAP_TEXT.open;
  btn.innerHTML = PHONE_MAP_SVG;
  btn.hidden = true;
  // Its own tap: never the street's, never a quest's nameplate.
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (view) phoneClose(engine);
    else phoneOpen(engine);
  });
  plate.prepend(btn);
  phone = { btn, sheet: null, signs: [], plateStreet: undefined };
}

export const streetMinimapFeature = {
  id: STREET_MINIMAP_FEATURE_ID,

  init(engine) {
    if (typeof document === 'undefined') return;
    // A phone has no street map: no card, no snapshots, nothing per tick (onTick returns with no view).
    if (minimapOffOnDevice(globalThis)) {
      engine.setData?.('streetMap', 'phone');
      // PHONE MAP: a button that opens it full screen.
      phoneInstall(engine);
      return;
    }
    host = document.getElementById('game-root');
    if (!host || view) return;
    view = createStreetMinimap(document, host, {
      artUrl: classicArtUrl,
      // SHARP MARKS: the Modern card scales the marks up (u 1.2); Classic draws them 1:1 and
      // takes the traces on a high-DPI screen.
      artHd: classicArtHd,
      crisp: () => document.documentElement.dataset.ui !== 'classic',
      teleporters: (s) => engine.query?.('minimapTeleporters', s, engine) || [],
      reducedMotion,
      onHide: () => setStreetMap(false),
      onShow: () => {
        setStreetMap(true);
        // The show button goes away under the focus: the card's tab takes it.
        setTimeout(() => (view.root.querySelector('.smm-tab:not([hidden])') || view.root.querySelector('.smm-hide'))?.focus?.(), 0);
      },
      // What stacks under the map (the route card) starts a 12 px gap below it.
      onLayout: (h) => host.style.setProperty('--minimap-h', `${h > 0 ? h + 12 : 0}px`),
      onReady: (on) => readyChanged(engine, on),
      maxHeight: () => Math.max(120, (host.clientHeight || 600) * 0.55),
      onResnap: () => scheduleSnaps(engine, [60]),
      onWalk: (goal, how) => walkFromMap(engine, goal, how),
      onMenu: (goal, how) => menuFromMap(engine, goal, how),
      isMenuOpen: (mark) => Boolean(engine.isMinimapMenuOpen?.(mark)),
    });
    onStreetMapChange((on) => {
      sync(engine, true);
      // The show button for a keyboard player, the world after a click (js/ui/focus-return.js).
      if (!on && view.root.contains(document.activeElement)) focusBack(view.showBtn, { doc: document, byOpener: false });
    });
    onUiModeChange(() => setTimeout(() => {
      view?.refreshArt();
      view?.relayout();
    }, 0));
    globalThis.addEventListener?.('resize', () => view?.relayout());
    engine.setData?.('streetMap', 'hidden');
  },

  onStreetClear() {
    clearSnaps();
  },

  onTick(dtMs, now, engine) {
    if (phone) {
      // The button shows on a street that has a map.
      if (phone.plateStreet !== engine.street) {
        phone.plateStreet = engine.street;
        const off = !engine.street || Boolean(engine.street.noMap);
        if (phone.btn.hidden !== off) phone.btn.hidden = off;
      }
      if (!view) return;
      // A new street, a full-screen moment, the street card: the sheet closes.
      if (engine.street !== street || stateFor(engine) !== 'shown') {
        phoneClose(engine, { walked: true });
        return;
      }
      // #534: the arrows follow you while the sheet is open (kept through a jump: the ground counts).
      const me = engine.player;
      if (me && me.onGround !== false && phoneSignRefresh(phone.signs, { x: me.x, y: me.y })) engine.setData?.('streetMapPhoneSides', phone.signs.map((x) => x.side).join(','));
    }
    if (!view) return;
    const t = performance.now();
    if (t - lastUpdate < UPDATE_MS && engine.street === street) return;
    lastUpdate = t;
    sync(engine);
  },
};
