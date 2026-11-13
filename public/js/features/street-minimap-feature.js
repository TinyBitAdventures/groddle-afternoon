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
 *   scene's own post (the signpost: Back to Ur and the friends' arms) shows as one signpost
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
 *
 * Canvas data: streetMap (shown|off|no-map|hidden|phone), streetMapFog, streetMapExpanded,
 * streetMapDots, streetMapDotIds, streetMapSigns, streetMapPicture (lines|snapshot),
 * streetMapSnapMs (the last snapshot's cost), streetMapSnaps (how many taken), streetMapWalk (the last click: kind:x, or
 * refused). QA: &streetmapexpand=1 expands it on each street.
 */

import { createStreetMinimap, minimapVisibility, onStreetMapChange, sceneSignMarks, setStreetMap, signpostMarks, snapshotStreetView, snapsWithScene, streetMapOn } from '../ui/street-minimap.js?v=82f98cee';
import { classicArtUrl } from '../classic/classic-art.js?v=5f713e7d';
import { onUiModeChange } from '../classic/ui-mode.js?v=9705b783';
import { focusBack } from '../ui/focus-return.js?v=da190597';
import { isPhoneDevice } from '../touch-controls.js?v=34d558e1';

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
export const PHONE_MAP_TEXT = Object.freeze({ open: 'Street map', close: 'Close the street map', signs: 'Signposts', none: 'No signposts on this street.' });

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
 * PURE: the signposts' rows under the phone map, left to right: { id, x, y, text, side } where side
 * says which way it stands from you ('left', 'right' or 'here', within 60 world px).
 */
export function phoneSignRows(marks = [], youX = null) {
  return [...marks]
    .filter((m) => m && Number.isFinite(m.x))
    .sort((a, b) => a.x - b.x)
    .map((m) => {
      const dx = Number.isFinite(youX) ? m.x - youX : 0;
      const side = !Number.isFinite(youX) || Math.abs(dx) <= 60 ? 'here' : dx < 0 ? 'left' : 'right';
      const text = String(m.tip || '').split('\n').filter(Boolean).join(', ') || 'Signpost';
      return { id: m.id, x: m.x, y: m.y, text, side };
    });
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
      <header class="smm-sheet-head"><h2 id="smm-sheet-title"></h2><button type="button" class="smm-sheet-x" aria-label="${PHONE_MAP_TEXT.close}" title="${PHONE_MAP_TEXT.close}">×</button></header>
      <div class="smm-sheet-map"></div>
      <section class="smm-sheet-signs" aria-label="${PHONE_MAP_TEXT.signs}"></section>
    </div>`;
  sheet.querySelector('#smm-sheet-title').textContent = (doc.getElementById('street-name')?.textContent || '').trim() || PHONE_MAP_TEXT.open;
  gameRoot.append(sheet);
  const mapBox = sheet.querySelector('.smm-sheet-map');
  const signsBox = sheet.querySelector('.smm-sheet-signs');
  phone.sheet = sheet;
  host = mapBox;
  // The map fits the box the sheet leaves it (at least a third of the screen stays for the list).
  const availW = mapBox.clientWidth || gameRoot.clientWidth - 32;
  const availH = Math.max(120, (mapBox.clientHeight || gameRoot.clientHeight * 0.6));
  view = createStreetMinimap(doc, mapBox, {
    artUrl: classicArtUrl,
    reducedMotion: () => true,
    onHide: () => phoneClose(engine),
    onShow: () => {},
    onLayout: () => {},
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
  // One snapshot, once the sheet has its size (its decos are on the street already).
  scheduleSnaps(engine, [60]);
  // The signposts' destinations, a tap away.
  const marks = [...signpostMarks(engine.street), ...(isLiveScene(engine.streetView) ? sceneSignMarks(engine.interactables || []) : [])];
  const rows = phoneSignRows(marks, engine.player?.x);
  if (rows.length) {
    const list = doc.createElement('ul');
    for (const row of rows) {
      const li = doc.createElement('li');
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'smm-sheet-sign';
      b.dataset.side = row.side;
      b.dataset.signId = row.id;
      b.innerHTML = `<img alt="" src="${classicArtUrl('teensy_signpost')}" /><span></span>`;
      b.querySelector('span').textContent = row.text;
      b.setAttribute('aria-label', `Walk to the signpost to ${row.text}`);
      b.addEventListener('click', () => {
        if (walkFromMap(engine, { kind: 'sign', id: row.id, x: row.x, y: row.y }, { keyboard: true })) phoneClose(engine, { walked: true });
      });
      li.append(b);
      list.append(li);
    }
    signsBox.append(list);
  } else {
    const p = doc.createElement('p');
    p.className = 'smm-sheet-none';
    p.textContent = PHONE_MAP_TEXT.none;
    signsBox.append(p);
  }
  sheet.querySelector('.smm-sheet-x').addEventListener('click', () => phoneClose(engine));
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

function phoneClose(engine, { walked = false } = {}) {
  if (!phone) return;
  clearSnaps();
  view?.destroy();
  view = null;
  host = null;
  street = null;
  lastState = '';
  lastDots = '';
  snapOwed = false;
  phone.sheet?.remove();
  phone.sheet = null;
  phone.btn.setAttribute('aria-expanded', 'false');
  engine.setData?.('streetMap', 'phone');
  engine.setData?.('streetMapPhone', walked ? 'walked' : 'closed');
  // The keys go back to the world after a walk; the button after a close.
  if (!walked) phone.btn.focus?.({ preventScroll: true });
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
  phone = { btn, sheet: null, plateStreet: undefined };
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
      onMenu: (goal, how) => menuFromMap(engine, goal, how),
      isMenuOpen: (mark) => Boolean(engine.isMinimapMenuOpen?.(mark)),
    });
    onStreetMapChange((on) => {
      sync(engine, true);
      // The show button for a keyboard player, the world after a click (js/ui/focus-return.js).
      if (!on && view.root.contains(document.activeElement)) focusBack(view.showBtn, { doc: document, byOpener: false });
    });
    onUiModeChange(() => setTimeout(() => view?.relayout(), 0));
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
    }
    if (!view) return;
    const t = performance.now();
    if (t - lastUpdate < UPDATE_MS && engine.street === street) return;
    lastUpdate = t;
    sync(engine);
  },
};
