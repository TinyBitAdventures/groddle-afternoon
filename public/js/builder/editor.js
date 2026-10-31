/**
 * LEVEL BUILDER editor (spec section 6, phase P1), the module /console/builder/ loads
 * (groddle-afternoon-site src/AdminBuilderPage.php). It draws streets with the game's own renderer
 * (street-render.js buildStreetView), so what you see at 100% is what /play/ shows at the same camera.
 *
 * P1: open any shipped street (read-only) or a draft's street; fork a shipped street into a draft;
 * select decos (click, Shift+click, Alt+click cycles, marquee, Ctrl+A), move, resize (eight
 * handles, Shift keeps proportions), rotate (the knob, or R with the arrows), flip, z order, move
 * between layers (keeping where it appears), copy, cut, paste, delete; the inspector; the layers
 * panel (eye and lock are this editor's only) and the outliner; undo and redo; autosave every 2 s
 * (js/builder/session.js); and play-testing a draft in /play/ (js/builder/draft-play.js).
 *
 * P2: geometry (js/builder/geometry-handles.js): select, move, nudge, delete, copy and paste
 * platforms, walls, ladders and signposts with LocoDeco's handles; the draw tools (V select, Q
 * platform, W wall, E ladder, S signpost); snapping (js/builder/snap.js: `;` ends, floors and
 * guides, `G` the 10 px grid); the inspector for geometry (perms, signpost size, arms and where they
 * arrive), the sky gradient and layer filters (previewed live); overlays (geometry, view frame,
 * rulers and guides, the "layout" parallax preview, panning at the view edge while dragging, the
 * reach map and jump arc from js/builder/reach-graph.js); and the validator in a worker
 * (js/builder/validate-worker.js) with its findings panel. Until the worker exists the editor works
 * without it, and the reach map is worked out here from the view centre.
 *
 * P3: new zones (js/builder/editor-zone.js): a new draft with a new hub (ids from 900) or an
 * existing one; new streets from templates (js/builder/templates.js); the hub map editor; each
 * street's population with the planner's spots (an overlay); and the zone's ways in from shipped
 * streets (edits[]): open a shipped street with a draft chosen, pick a signpost, add a way in. The
 * deco picker (js/builder/editor-picker.js, D): search, facets, thumbnails, drag or Enter to place,
 * and new art brought in through the site's intake.
 *
 * Zone ambient effects (js/builder/editor-effects.js, js/street-effects.js; spec 15 Q12): the
 * Effect button adds a steam vent at the view centre, its ring drags like a signpost, the
 * inspector tunes its kind, layer, rate, size, height, spread and bursts, and the street's
 * inspector sets the earthquake rumble with a Shake now preview. The effects play live in the view
 * (the Effects overlay switch), drawn by the game's own code.
 *
 * Addresses: #draft=<id>&street=<key> opens a draft's street, #view=<tsid> a shipped street.
 * QA: window.groddleBuilderQA (state, with the effects' stats; camera, matchView, select, anchorOf, selectGeo, geoHandles).
 */
import { buildStreetView, loadDecoManifest, loadSignpostTextures, DECO_TWINS, flashBlurSize } from '../street-render.js?v=3f8384af';
import { worldToScreen, platformsScreen, isStandable, streetWidth, streetHeight, navigableSignposts } from '../street-model.js?v=23b926e5';
import { ensureStreetIndex, STREET_INDEX, resolveIndexTsid } from '../street-loader.js?v=390e4702';
import { loadStreetEcologyCatalog, ecologyForStreet } from '../street-ecology.js?v=7e30da8f';
import { createBuilderApi } from './api.js?v=9560d68f';
import { DraftSession, statusWords, SAVE_MS, POLL_MS } from './session.js?v=caebc29e';
import { forkStreet, forkOps, newTsid, streetKeyFrom, relayerPosition, isLayerLocal, withDecoIds, floorUnder, libraryAsset, screenToDeco, streetWithEdits, editsOn, linkEdit } from './zone.js?v=6a3db28e';
import { mountPicker, PICK_MIME } from './editor-picker.js?v=724352b6';
import { newDraftDialog, newStreetDialog, hubMapDialog, populationSection, zoneSection, plannedSpots, SPOT_GROUPS, spotGroup } from './editor-zone.js?v=aec513c7';
import { decoFor, NEW_ART_BUNDLE } from './deco-search.js?v=fda9b16b';
import { populationForStreet, planStreetPlacements } from '../street-ecology.js?v=7e30da8f';
import { nextDecoId, findDeco, applyOps } from './ops.js?v=acf30407';
import { postOffFloor, offFloorWords, settlePostOps, arrivalOps, followPostOps } from './posts.js?v=ebcf627c';
import { decoBox, contains, handlePoints, resizeBy, rotationTo, meetsRect, corners } from './handles.js?v=2f6896c4';
import { layerRole } from './layer-role.js?v=e585f610';
import { installNewArt, withNewArt, provenanceSection } from './new-art.js?v=29f0b13e';
import * as textureUrls from '../textures.js?v=db2ce452';
import { installPixiFixes } from '../pixi-fixes.js?v=173fb649';
import { installHiresDecos } from '../deco-hires.js?v=cc8506f6';
import { OVERLAY_COLOURS, drawGeometryOverlay, drawReachOverlay, drawEffectMarkers, strokeSegs } from './overlays.js?v=7dd09d5a';
import { createStreetEffects, createRumbleClock, prefersReducedMotion } from '../street-effects.js?v=e427650f';
import { effectInspector, rumbleSection } from './editor-effects.js?v=85f32fd1';
import { setLayerOffsets } from './geometry-handles.js?v=d39231a4';
import { GEO_KINDS, GEO_LIST, GEO_WORDS, PERMS, geoKey, parseGeoKey, geoItem, geoKindOf, geoShape, geoHits, geoHandles, handleWorld, dragHandle, moveBy, changedFields, drawnItem, postOnFloor, defaultItem, permKey, permValue, permName, dashes, arriveFor, newConnect, shapeBounds } from './geometry-handles.js?v=d39231a4';
import { SNAP_PX, GUIDE_PX, endPoints, joinedEnds, snapPlatform, snapDrawnPlatform, snapPoint, floorSnapY, rulerTicks, bestPull } from './snap.js?v=c1cb84a7';

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 4;
export const CLIPBOARD_KEY = 'groddle.builder.clipboard';
export const PANELS_KEY = 'groddle.builder.panels';
export const OVERLAYS_KEY = 'groddle.builder.overlays';
export const SNAP_KEY = 'groddle.builder.snap';
const HANDLE_PX = 7;
/** How many arms the game draws on a signpost (street-render.js, connects.slice(0, 4)). */
const SIGN_ARMS_SHOWN = 4;
/** Rulers' thickness in canvas px. */
const RULER_PX = 20;
/** Geometry is picked this many canvas px from a line. */
const PICK_PX = 6;
/** Canvas colours (the street's art is the same in light and dark). */
/** The overlays' colours (js/builder/overlays.js, shared with the render page /builder-render/). */
const COLOURS = OVERLAY_COLOURS;
const hexCss = (n) => `#${n.toString(16).padStart(6, '0')}`;

/** The view frames the overlay draws (spec 6.7): the game's Wide view and the original client's. */
export const VIEW_FRAMES = Object.freeze([
  Object.freeze({ id: 'wide', label: 'Wide', w: 960, h: 408 }),
  Object.freeze({ id: 'original', label: 'Original', w: 1000, h: 600 }),
]);
export const OVERLAY_DEFAULTS = Object.freeze({ geometry: true, reach: false, arc: false, frame: false, rulers: false, layout: false, edgePan: true, populations: false, effects: true });
export const SEVERITIES = Object.freeze([
  Object.freeze({ id: 'fatal', label: 'Fatal' }),
  Object.freeze({ id: 'error', label: 'Errors' }),
  Object.freeze({ id: 'warn', label: 'Warnings' }),
  Object.freeze({ id: 'info', label: 'Notes' }),
]);
const FILTER_KEYS = Object.freeze(['brightness', 'contrast', 'saturation', 'tintColor', 'tintAmount', 'blur']);

// —— Pure helpers (tests/builder-editor.test.js) ——

/** PURE: what an address names: { draft, street } or { view } (a shipped tsid). */
export function parseHash(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const draft = p.get('draft') || '';
  const view = p.get('view') || '';
  return { draft: /^[a-z][a-z0-9-]{2,47}$/.test(draft) ? draft : '', street: p.get('street') || '', view: /^[GL][A-Z0-9]{12,14}$/.test(view) ? view : '' };
}

export function hashFor({ draft = '', street = '', view = '' }) {
  if (draft) return `#draft=${encodeURIComponent(draft)}${street ? `&street=${encodeURIComponent(street)}` : ''}`;
  return view ? `#view=${encodeURIComponent(view)}` : '';
}

/**
 * PURE: the page's own address with a new hash. The page has <base href="/">, so a bare "#..."
 * given to history.replaceState would point the address bar at the site's home page (and a
 * reload would leave the builder).
 */
export function addressFor(loc, hash) {
  return `${loc.pathname}${loc.search || ''}${hash}`;
}

/** PURE: the play-test address (spec 6.8): a practice copy that starts on the draft street. */
export function playTestUrl({ draft, street, x, y }) {
  const q = new URLSearchParams({ practice: '1', autostart: '1', draft, street });
  if (Number.isFinite(x) && Number.isFinite(y)) {
    q.set('streetx', String(Math.round(x)));
    q.set('streety', String(Math.round(y)));
  }
  return `/play/?${q}`;
}

/** PURE: how far an arrow key nudges: 5 px, Shift 20, Alt 1. */
export function nudgeStep(e) {
  return e.altKey ? 1 : e.shiftKey ? 20 : 5;
}

/** PURE: the zoom after a wheel step at `z` (Ctrl/Cmd+wheel or a pinch). */
export function zoomAfter(z, deltaY) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * Math.exp(-deltaY * 0.0015)));
}

/** PURE: a deco's new z for Ctrl+] / [ (`top` with Shift: above or below everything in its layer). */
export function zFor(layer, deco, dir, top = false) {
  const zs = (layer.decos || []).filter((d) => d !== deco).map((d) => Number(d.z) || 0);
  if (top) return dir > 0 ? (zs.length ? Math.max(...zs) + 1 : 0) : (zs.length ? Math.min(...zs) - 1 : 0);
  return (Number(deco.z) || 0) + dir;
}

/** PURE: shipped streets matching a search (label words first, then hub, then tsid). */
export function searchStreets(list, query, limit = 30) {
  const q = String(query || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q) return list.slice(0, limit);
  const out = [];
  for (const s of list) {
    const label = String(s.label || '').toLowerCase();
    const score = s.tsid.toLowerCase() === q ? 0 : label === q ? 1 : label.startsWith(q) ? 2 : ` ${label}`.includes(` ${q}`) ? 3 : label.includes(q) ? 4 : String(s.hub || '').toLowerCase().includes(q) ? 5 : -1;
    if (score >= 0) out.push([score, s]);
  }
  out.sort((a, b) => a[0] - b[0] || String(a[1].label).localeCompare(String(b[1].label)));
  return out.slice(0, limit).map(([, s]) => s);
}

/** PURE: layers in panel order: front first (highest z), then by their order in the file. */
export function layersFrontFirst(layers) {
  return (layers || []).map((l, i) => ({ l, i })).sort((a, b) => (Number(b.l.z) || 0) - (Number(a.l.z) || 0) || b.i - a.i).map(({ l }) => l);
}

/** PURE: the overlay switches as stored (anything missing or odd takes its default). */
export function readOverlays(stored) {
  const out = { ...OVERLAY_DEFAULTS };
  for (const k of Object.keys(OVERLAY_DEFAULTS)) if (typeof stored?.[k] === 'boolean') out[k] = stored[k];
  return out;
}

/**
 * PURE: the camera the "layout" parallax preview draws every layer for: a game-sized `frame`
 * centred on the view centre, kept inside the street (the game's own camera clamp).
 */
export function layoutCamera(centre, frame, W, H) {
  return {
    x: Math.max(0, Math.min(Math.max(0, W - frame.w), centre.x - frame.w / 2)),
    y: Math.max(0, Math.min(Math.max(0, H - frame.h), centre.y - frame.h / 2)),
  };
}

/** PURE: how far to pan this frame while a drag sits within `margin` px of the view's edge (canvas px). */
export function edgePan(cx, cy, w, h, margin = 32, speed = 14) {
  const pull = (v, size) => {
    if (v < margin) return -speed * Math.min(1, (margin - v) / margin);
    if (v > size - margin) return speed * Math.min(1, (v - (size - margin)) / margin);
    return 0;
  };
  return { dx: pull(cx, w), dy: pull(cy, h) };
}

/** PURE: a report's counts in the bar's terms: errors (fatal and error), warnings, notes. */
export function findingCounts(report) {
  const c = report?.counts || {};
  return { errors: (c.fatal || 0) + (c.error || 0), warnings: c.warn || 0, notes: c.info || 0 };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** PURE: the Validate button's words for the validator's state. */
export function validateWords(state, report) {
  if (state === 'off') return 'Validate: not available';
  if (state === 'running') return 'Validate: checking';
  if (state === 'failed') return 'Validate: did not finish';
  if (!report) return 'Validate';
  const c = findingCounts(report);
  return `Validate: ${plural(c.errors, 'error')}, ${plural(c.warnings, 'warning')}`;
}

/** PURE: findings grouped by severity, worst first: [{ id, label, items }] (empty groups left out). */
export function groupFindings(findings) {
  return SEVERITIES.map((s) => ({ ...s, items: (findings || []).filter((f) => f.severity === s.id) })).filter((g) => g.items.length);
}

/** PURE: a finding's `at` ("<streetKey>/<elementId>"): { street, id }. */
export function parseAt(at) {
  const s = String(at || '');
  const i = s.indexOf('/');
  return i < 0 ? { street: s, id: '' } : { street: s.slice(0, i), id: s.slice(i + 1) };
}

/** PURE: where a finding points, in screen space (its `where` is screen or world), or null. */
export function findingPoint(finding, street) {
  const w = finding?.where;
  if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y) || !street?.bounds) return null;
  return w.space === 'world' ? { x: w.x - street.bounds.l, y: w.y - street.bounds.t } : { x: w.x, y: w.y };
}

/** PURE: a layer's filters with one value changed: zero drops the key, an empty set is null. */
export function filtersWith(filters, key, value) {
  const out = { ...(filters || {}) };
  if (value === null || value === undefined || value === '' || (key !== 'tintColor' && Number(value) === 0)) delete out[key];
  else out[key] = Number(value);
  // Keys keep the order the file has; a new one goes after them (FILTER_KEYS order).
  const kept = {};
  for (const k of Object.keys(filters || {})) if (k in out) kept[k] = out[k];
  for (const k of FILTER_KEYS) if (k in out && !(k in kept)) kept[k] = out[k];
  return Object.keys(kept).length ? kept : null;
}

/** PURE: a street gradient colour ("87A8C9") for a colour input ("#87a8c9"), and back. */
export const colourInput = (hex) => `#${String(hex || '000000').replace(/^#/, '').padStart(6, '0').slice(0, 6).toLowerCase()}`;
export const colourHex = (value) => String(value || '').replace(/^#/, '').toUpperCase();
/** PURE: a tint colour number for a colour input, and back. */
export const tintInput = (n) => `#${(Number(n) || 0).toString(16).padStart(6, '0').slice(-6)}`;
export const tintNumber = (value) => parseInt(String(value || '').replace(/^#/, ''), 16) || 0;

// —— The page ——

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'text') n.textContent = String(v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
}

const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
};

async function boot() {
  const root = document.querySelector('[data-builder]');
  if (!root || root.dataset.booted) return;
  root.dataset.booted = '1';
  const PIXI = globalThis.PIXI;
  const api = createBuilderApi();

  // —— State ——
  const S = {
    mode: 'none', // 'view' (a shipped street, read-only) | 'draft' | 'none'
    drafts: [],
    session: null,
    streetKey: '',
    viewTsid: '',
    viewStreet: null, // the street drawn in view mode (ids numbered)
    activeLayer: 'middleground',
    hidden: new Set(), // layers hidden in this editor only
    locked: new Set(),
    selected: [], // deco ids
    revertTo: null, // { id: deco copy } when the selection was made (Esc)
    cam: { x: 0, y: 0, zoom: 1 },
    frame: null, // QA: { w, h } parallax computed for this view size
    view: null, // the street view (buildStreetView root)
    preview: new Map(), // deco id -> values being dragged
    drag: null,
    shippedList: null,
    catalog: null,
    rKey: false,
    space: false,
    rebuildTimer: 0,
    // —— P2 ——
    tool: 'select', // 'select' | a geometry kind (the draw tools)
    geoSel: [], // geometry keys "<kind>:<id>" (never mixed with decos)
    geoRevert: null, // { key: item copy } when the selection was made (Esc)
    geoPreview: new Map(), // geometry key -> fields being dragged
    snap: { on: true, grid: false, ...store.get(SNAP_KEY, {}) },
    overlays: readOverlays(store.get(OVERLAYS_KEY, null)),
    guides: [], // [{ axis: 'x' | 'y', at }] in world px, this street's (localStorage)
    streetPatch: null, // { gradient?, filters?: { layerId: filters | null } }: the sky and filters previewed live
    version: 0, // bumped on every change to the street drawn (reach and arcs go stale)
    geoDrawn: '', // what the geometry layer was last drawn for
    pointer: null, // the last pointer on the canvas: { cx, cy, shift, ctrl }
    arcs: null,
    arcAt: null,
    arcT: 0,
    arcWorld: null, // { version, world } for jumpArcs
    reachMod: null, // js/builder/reach-graph.js, loaded on first use
    reachLocal: null, // { key, data, from } reach worked out here (a shipped street, or no validator)
    reachFrom: null, // the screen point reach is worked out from here
    reachPinned: false, // "Reach from the view centre" was asked for: show it over the validator's
    validate: { state: 'idle', report: null, id: 0, timer: 0, worker: null },
    shippedStreets: new Map(), // tsid -> street JSON (signpost arm targets)
    // —— P3 ——
    viewShown: null, // { key, street }: the shipped street on screen with the draft's edits on it
    spots: null, // { key, spots } the planner's spots for the street on screen (the populations overlay)
    profiles: null, // assets/content/style-profiles.json (templates)
    hubs: null, // [{ id, name }] Tiny Speck's hubs (assets/maps/index.json)
    validateMod: null, // js/builder/validate.js (placementRequests), loaded with the populations overlay
  };
  const panels = store.get(PANELS_KEY, { left: true, right: true });

  // —— Layout ——
  root.replaceChildren();
  const status = el('p', { class: 'builder-status', role: 'status', 'aria-live': 'polite', 'data-builder-status': '' });
  const draftSel = el('select', { 'aria-label': 'Draft', 'data-builder-draft': '' });
  const streetSel = el('select', { 'aria-label': 'Street', 'data-builder-street': '' });
  const btn = (text, attrs = {}) => el('button', { type: 'button', class: 'builder-btn', ...attrs }, text);
  const openBtn = btn('Open street', { 'data-builder-open': '', 'aria-haspopup': 'dialog' });
  const forkBtn = btn('Fork into draft', { 'data-builder-fork': '', 'aria-haspopup': 'dialog', hidden: true });
  const newDraftBtn = btn('New draft', { 'data-builder-new-draft-open': '', 'aria-haspopup': 'dialog', title: 'A new zone: its own streets and a hub' });
  const newStreetBtn = btn('New street', { 'data-builder-new-street-open': '', 'aria-haspopup': 'dialog', hidden: true, title: 'A new street in this draft, from a template' });
  const undoBtn = btn('Undo', { 'data-builder-undo': '', 'aria-keyshortcuts': 'Control+Z Meta+Z', disabled: true });
  const redoBtn = btn('Redo', { 'data-builder-redo': '', 'aria-keyshortcuts': 'Control+Shift+Z Meta+Shift+Z', disabled: true });
  const zoomOut = btn('−', { 'aria-label': 'Zoom out' });
  const zoomLabel = el('output', { class: 'builder-zoom', 'aria-live': 'off', 'data-builder-zoom': '' }, '100%');
  const zoomIn = btn('+', { 'aria-label': 'Zoom in' });
  const fitBtn = btn('Fit', { 'aria-keyshortcuts': '0', title: 'Fit the street (0); 100% is 1' });
  const playBtn = btn('Play', { class: 'builder-btn builder-primary', 'data-builder-play': '', 'aria-keyshortcuts': 'P', disabled: true });
  const keysBtn = btn('Keys', { 'aria-haspopup': 'dialog', 'aria-keyshortcuts': 'Shift+?' });
  const validateBtn = btn('Validate', { class: 'builder-btn builder-validate', 'data-builder-validate': '', 'aria-controls': 'builder-findings', hidden: true, title: 'Check the draft: reach, links, geometry' });
  const bar = el('header', { class: 'builder-bar' },
    el('div', { class: 'builder-bar-group' }, el('a', { href: '/console/#builder', class: 'builder-back' }, 'Console'), newDraftBtn, draftSel, streetSel, newStreetBtn, openBtn, forkBtn),
    el('div', { class: 'builder-bar-group' }, undoBtn, redoBtn, zoomOut, zoomLabel, zoomIn, fitBtn, keysBtn, validateBtn, playBtn),
    status);
  const layersList = el('ul', { class: 'builder-layers', 'aria-label': 'Layers', 'data-builder-layers': '' });
  const outline = el('ul', { class: 'builder-outline', 'aria-label': 'Decos on the active layer', 'data-builder-outline': '' });
  const outlineHead = el('h2', { class: 'builder-h' }, 'Decos');
  const geoOutline = el('div', { class: 'builder-geo-outline', 'data-builder-geometry': '' });
  const left = el('aside', { class: 'builder-left', 'aria-label': 'Layers, decos and geometry', hidden: !panels.left },
    el('h2', { class: 'builder-h' }, 'Layers'), layersList, outlineHead, outline, el('h2', { class: 'builder-h' }, 'Geometry'), geoOutline);
  const inspector = el('div', { class: 'builder-inspector', 'data-builder-inspector': '' });
  const findingsBody = el('div', { class: 'builder-findings-body', 'data-builder-findings': '' });
  const findings = el('section', { class: 'builder-findings', id: 'builder-findings', 'aria-labelledby': 'builder-findings-title', tabindex: '-1', hidden: true },
    el('h2', { class: 'builder-h', id: 'builder-findings-title' }, 'Findings'), findingsBody);
  const right = el('aside', { class: 'builder-right', 'aria-label': 'Inspector and findings', hidden: !panels.right }, el('h2', { class: 'builder-h' }, 'Inspector'), inspector, findings);
  const canvasHost = el('div', { class: 'builder-canvas', 'data-builder-canvas': '' });
  const note = el('p', { class: 'builder-note', role: 'status', 'aria-live': 'polite', hidden: true });
  const toggleLeft = btn('Layers', { class: 'builder-btn builder-toggle', 'aria-pressed': String(panels.left), 'aria-label': 'Show the layers panel' });
  const toggleRight = btn('Inspector', { class: 'builder-btn builder-toggle', 'aria-pressed': String(panels.right), 'aria-label': 'Show the inspector' });

  // Tools, snapping and the overlay menu, over the canvas's top left.
  const TOOLS = [['select', 'Select', 'V'], ['platform', 'Platform', 'Q'], ['barrier', 'Wall', 'W'], ['ladder', 'Ladder', 'E'], ['signpost', 'Signpost', 'S']];
  const toolBtns = TOOLS.map(([id, label, key]) => btn(label, { class: 'builder-tool', 'data-tool': id, 'aria-pressed': String(id === 'select'), 'aria-keyshortcuts': key, title: `${label} (${key})` }));
  const snapBtn = btn('Snap', { class: 'builder-tool', 'data-builder-snap': '', 'aria-keyshortcuts': ';', title: 'Snap line ends, decos to the floor and guides (;)' });
  const gridBtn = btn('Grid', { class: 'builder-tool', 'data-builder-grid': '', 'aria-keyshortcuts': 'G', title: 'Snap to a 10 px grid (G)' });
  const overlaysBtn = btn('Overlays', { class: 'builder-tool', 'aria-expanded': 'false', 'aria-controls': 'builder-overlays', 'data-builder-overlays': '' });
  const overlayMenu = el('div', { class: 'builder-menu', id: 'builder-overlays', role: 'group', 'aria-label': 'Overlays', hidden: true });
  const toolbar = el('div', { class: 'builder-toolbar' },
    el('div', { class: 'builder-toolgroup', role: 'group', 'aria-label': 'Tools' }, ...toolBtns),
    el('div', { class: 'builder-toolgroup', role: 'group', 'aria-label': 'Snapping and overlays' }, snapBtn, gridBtn, overlaysBtn),
    overlayMenu);
  const rulerTop = el('canvas', { class: 'builder-ruler builder-ruler-top', 'aria-hidden': 'true', hidden: true });
  const rulerLeft = el('canvas', { class: 'builder-ruler builder-ruler-left', 'aria-hidden': 'true', hidden: true });
  const stage = el('div', { class: 'builder-stage' }, canvasHost, toolbar, note, el('div', { class: 'builder-toggles' }, toggleLeft, toggleRight));
  const body = el('div', { class: 'builder-body' }, left, stage, right);
  root.append(bar, body);

  function say(text, tone = 'ok') {
    note.hidden = !text;
    note.textContent = text || '';
    note.dataset.tone = tone;
    clearTimeout(say.t);
    if (text) say.t = setTimeout(() => { note.hidden = true; }, 7000);
  }
  function failed(err) { say(err?.status === 401 ? 'You are signed out. Reload to sign in again.' : err?.message || 'That did not work.', 'bad'); }
  for (const [b, side, p] of [[toggleLeft, 'left', left], [toggleRight, 'right', right]]) {
    b.addEventListener('click', () => {
      panels[side] = !panels[side];
      p.hidden = !panels[side];
      b.setAttribute('aria-pressed', String(panels[side]));
      store.set(PANELS_KEY, panels);
      resize();
    });
  }

  // —— Pixi, set up as game.js sets it up, so decos draw from the same files at the same density ——
  PIXI.Filter.defaultOptions.resolution = 'inherit';
  installPixiFixes(PIXI);
  const app = new PIXI.Application();
  // Street decos load as WebP, 3x on Retina (js/deco-hires.js), same logical sizes.
  installHiresDecos(textureUrls, { renderer: () => app?.renderer });
  // New art (gz_ sprites) draws from the site's /builder-art/<sha256> (js/builder/new-art.js).
  installNewArt(textureUrls, () => (S.mode === 'draft' ? S.session?.zone.assets : null));
  await app.init({
    resizeTo: canvasHost,
    background: 0x8ec8e8,
    antialias: false,
    resolution: Math.min(4, globalThis.devicePixelRatio || 1),
    autoDensity: true,
    gcMaxUnusedTime: 20000,
    gcFrequency: 5000,
  });
  const canvas = app.canvas;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Street. Click a deco to select it; arrow keys move the selection. Press Shift and ? for the keys.');
  canvas.dataset.builderView = '';
  canvasHost.append(canvas, rulerTop, rulerLeft);
  const world = new PIXI.Container();
  world.label = 'builder-world';
  // Geometry and the reach map, in the street's own px over the street view (drawn again only
  // when they change or the zoom does); the selection, arcs, frames and guides in canvas px.
  const geoGfx = new PIXI.Graphics();
  geoGfx.label = 'builder-geometry';
  const overlay = new PIXI.Graphics();
  overlay.label = 'builder-overlay';
  app.stage.addChild(world, overlay);
  function resize() { app.resize?.(); }

  const [available] = await Promise.all([loadDecoManifest(), loadSignpostTextures(PIXI), ensureStreetIndex(), loadStreetEcologyCatalog()]);

  // —— The street being drawn ——
  const street = () => (S.mode === 'draft' ? S.session?.zone.streets.find((s) => s.key === S.streetKey)?.street : viewWithEdits()) || null;
  /**
   * The shipped street on screen, with the open draft's ways in on it (edits[]): the arms show on
   * its signposts as they will once published. The shipped file is never changed.
   */
  function viewWithEdits() {
    const v = S.viewStreet;
    if (!v) return null;
    const edits = S.session ? editsOn(S.session.zone.edits, v.tsid) : [];
    if (!edits.length) return v;
    const key = `${v.tsid}|${JSON.stringify(edits)}`;
    if (S.viewShown?.key !== key) S.viewShown = { key, street: streetWithEdits(v, edits) };
    return S.viewShown.street;
  }
  /** The zone's street row on screen (draft mode), or null. */
  const streetRowShown = () => (S.mode === 'draft' ? S.session?.zone.streets.find((s) => s.key === S.streetKey) || null : null);
  const editable = () => S.mode === 'draft' && Boolean(street());
  const layerOf = (id) => (street()?.layers || []).find((l) => l.id === id) || null;
  const decoOf = (id) => {
    const s = street();
    if (!s) return [null, null];
    const [layer, i] = findDeco(s, id);
    return layer ? [layer, layer.decos[i]] : [null, null];
  };
  /** A geometry item by kind and id on the street drawn, and with any drag preview on top. */
  const geoOf = (kind, id) => geoItem(street(), kind, id);
  const geoShown = (kind, item) => {
    const p = S.geoPreview.get(geoKey(kind, item.id));
    return p ? { ...item, ...p } : item;
  };
  /** The selected geometry as [{ key, kind, id, item }] (items still on the street only). */
  const geoSelected = () => S.geoSel.map((key) => {
    const g = parseGeoKey(key);
    const item = g && geoOf(g.kind, g.id);
    return item ? { key, ...g, item } : null;
  }).filter(Boolean);
  const containerOf = (layerId) => (S.view?.layerContainers || []).find((lc) => lc.label === layerId) || null;
  const offsetOf = (layerId) => {
    const lc = containerOf(layerId);
    return lc ? { x: lc.x, y: lc.y } : { x: 0, y: 0 };
  };
  const offsets = () => Object.fromEntries((street()?.layers || []).map((l) => [l.id, offsetOf(l.id)]));
  /** A deco's values with any drag preview on top. */
  const shown = (deco) => (S.preview.has(deco.id) ? { ...deco, ...S.preview.get(deco.id) } : deco);
  const boxOf = (layer, deco) => {
    const spr = S.view?.decoViews?.get(deco.id);
    const size = spr ? { w: Math.abs(spr.width), h: Math.abs(spr.height) } : null;
    return decoBox(street(), layer, shown(deco), offsetOf(layer.id), size);
  };

  function mount() {
    const s = street();
    if (S.view) {
      S.view.destroy({ children: true });
      S.view = null;
    }
    S.fx?.destroy();
    S.fx = null;
    setLayerOffsets(null);
    world.removeChildren();
    S.geoDrawn = '';
    S.version += 1;
    if (!s) return;
    // The game draws what loadStreetData gives it: hidden connects dropped. The sky and layer
    // filters being previewed (the inspector's sliders) draw over the draft's own.
    const data = { ...s, signposts: navigableSignposts(s.signposts) };
    const patch = S.streetPatch;
    if (patch?.gradient) data.gradient = patch.gradient;
    if (patch?.filters) {
      data.layers = s.layers.map((l) => {
        if (!(l.id in patch.filters)) return l;
        const { filters, ...rest } = l;
        return patch.filters[l.id] ? { ...rest, filters: patch.filters[l.id] } : rest;
      });
    }
    const t0 = performance.now();
    S.view = buildStreetView(data, PIXI, { renderer: app.renderer, available: S.mode === 'draft' ? withNewArt(available, S.session?.zone.assets) : available });
    S.view.buildMs = Math.round(performance.now() - t0);
    S.view.signById = new Map(data.signposts.map((p, i) => [p.id, S.view.signViews?.[i]]));
    world.addChild(S.view, S.view.frontView, geoGfx);
    for (const lc of S.view.layerContainers) lc.visible = !S.hidden.has(lc.label);
    // Effects play live (the rumble only shakes on Shake now: an editor that shook by itself
    // would be no place to work).
    if (data.emitters?.length) {
      S.fx = createStreetEffects({ ...data, rumble: null }, PIXI, S.view, { available: S.mode === 'draft' ? withNewArt(available, S.session?.zone.assets) : available, reduced: prefersReducedMotion() });
      S.fx.setVisible(S.overlays.effects);
    }
    setLayerOffsets(S.view.layerContainers);
    canvas.dataset.street = s.tsid;
    canvas.dataset.decos = String(S.view.decoDrawn);
  }
  /** Draw the street again soon (the sky and filter preview, at most every 90 ms). */
  let previewTimer = 0;
  function remountSoon(ms = 90) {
    if (ms === 0) {
      clearTimeout(previewTimer);
      previewTimer = 0;
      mount();
      return;
    }
    if (previewTimer) return;
    previewTimer = setTimeout(() => { previewTimer = 0; mount(); }, ms);
  }
  /** After an edit: move sprites in place where that is enough, else draw the street again. */
  function refresh(changed = []) {
    const s = street();
    if (!s || !S.view) return mount();
    const key = S.streetKey;
    let rebuild = false;
    S.version += 1;
    S.geoDrawn = '';
    for (const c of changed) {
      const [k, id] = c.split('/');
      if (k !== key) continue;
      // The population and editor state draw nothing (the spots overlay follows S.version).
      if (id === 'population' || id === 'editor') continue;
      if (!/^d_\d+$/.test(id || '')) {
        // Lines and walls are only the overlay's; ladders (their tiles) and signposts are drawn.
        const kind = geoKindOf(s, id);
        if (kind === 'platform' || kind === 'barrier') continue;
        rebuild = true;
        break;
      }
      const [layer, deco] = decoOf(id);
      const spr = S.view.decoViews.get(id);
      if (!layer || !spr || spr.destroyed || flashBlurSize(layer.filters?.blur) > 0 || spr.parent?.label !== layer.id || spr.decoSprite !== undefined && spr.decoSprite !== deco.sprite) { rebuild = true; break; }
      syncSprite(layer, deco);
    }
    if (changed.some((c) => c === key || c === 'zone')) rebuild = true;
    if (rebuild) {
      clearTimeout(S.rebuildTimer);
      S.rebuildTimer = setTimeout(mount, 60);
    }
  }
  function syncSprite(layer, deco) {
    const spr = S.view?.decoViews?.get(deco.id);
    if (!spr || spr.destroyed) return;
    const d = shown(deco);
    const pos = isLayerLocal(layer) ? { x: d.x, y: d.y } : worldToScreen(street(), d.x, d.y);
    spr.x = pos.x;
    spr.y = pos.y;
    if (d.w > 0) spr.width = d.w;
    if (d.h > 0) spr.height = d.h;
    spr.scale.x = (d.flip ? -1 : 1) * Math.abs(spr.scale.x);
    spr.angle = Number(d.r) || 0;
    spr.zIndex = Number(d.z) || 0;
    spr.visible = !d.hidden;
  }

  // —— Camera ——
  const viewSize = () => ({ w: canvasHost.clientWidth / S.cam.zoom, h: canvasHost.clientHeight / S.cam.zoom });
  function setZoom(z, at = null) {
    const before = S.cam.zoom;
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    const px = at?.x ?? canvasHost.clientWidth / 2;
    const py = at?.y ?? canvasHost.clientHeight / 2;
    S.cam.x += px / before - px / next;
    S.cam.y += py / before - py / next;
    S.cam.zoom = next;
    zoomLabel.textContent = `${Math.round(next * 100)}%`;
    saveCamera();
  }
  function fit() {
    const s = street();
    if (!s) return;
    const W = streetWidth(s);
    const H = streetHeight(s);
    const z = Math.min(canvasHost.clientWidth / W, canvasHost.clientHeight / H) * 0.98;
    S.cam.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    S.cam.x = (W - canvasHost.clientWidth / S.cam.zoom) / 2;
    S.cam.y = (H - canvasHost.clientHeight / S.cam.zoom) / 2;
    zoomLabel.textContent = `${Math.round(S.cam.zoom * 100)}%`;
    saveCamera();
  }
  const cameraKey = () => `groddle.builder.camera:${S.mode === 'draft' ? `${S.session?.id}/${S.streetKey}` : S.viewTsid}`;
  function saveCamera() {
    clearTimeout(saveCamera.t);
    saveCamera.t = setTimeout(() => store.set(cameraKey(), S.cam), 400);
  }
  function restoreCamera() {
    const c = store.get(cameraKey(), null);
    if (c && Number.isFinite(c.x) && Number.isFinite(c.y) && c.zoom > 0) {
      S.cam = { x: c.x, y: c.y, zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.zoom)) };
      zoomLabel.textContent = `${Math.round(S.cam.zoom * 100)}%`;
    } else {
      // Like the game's first frame: 100%, the camera at the street's bottom centre.
      const s = street();
      S.cam.zoom = 1;
      S.cam.x = (streetWidth(s) - canvasHost.clientWidth) / 2;
      S.cam.y = Math.max(0, streetHeight(s) - canvasHost.clientHeight);
      zoomLabel.textContent = '100%';
    }
  }
  /** Canvas px to screen-space world px. */
  const toWorld = (cx, cy) => ({ x: cx / S.cam.zoom + S.cam.x, y: cy / S.cam.zoom + S.cam.y });
  const toCanvas = (p) => ({ x: (p.x - S.cam.x) * S.cam.zoom, y: (p.y - S.cam.y) * S.cam.zoom });

  // —— Every frame ——
  const DRAG_PANS = new Set(['move', 'resize', 'geo-move', 'geo-handle', 'draw', 'marquee', 'guide']);
  app.ticker.add(() => {
    const v = S.view;
    // Panning at the view edge while dragging (an overlay switch).
    if (S.drag && S.pointer && S.overlays.edgePan && DRAG_PANS.has(S.drag.kind)) {
      const { dx, dy } = edgePan(S.pointer.cx, S.pointer.cy, canvasHost.clientWidth, canvasHost.clientHeight);
      if (dx || dy) {
        S.cam.x += dx / S.cam.zoom;
        S.cam.y += dy / S.cam.zoom;
        dragMove(S.pointer.cx, S.pointer.cy, S.pointer);
        saveCamera();
      }
    }
    world.scale.set(S.cam.zoom);
    world.position.set(-S.cam.x * S.cam.zoom, -S.cam.y * S.cam.zoom);
    if (v) {
      const { w, h } = viewSize();
      const s = street();
      if (S.overlays.layout && s) {
        // "Layout": every layer at the offset the game gives it with a Wide view centred here.
        const f = VIEW_FRAMES[0];
        const c = layoutCamera({ x: S.cam.x + w / 2, y: S.cam.y + h / 2 }, f, streetWidth(s), streetHeight(s));
        v.updateParallax(c.x, c.y, f.w, f.h, f.h);
        if (v.skyView) {
          v.skyView.x = S.cam.x;
          v.skyView.y = S.cam.y;
          v.skyView.width = w;
          v.skyView.height = h;
        }
      } else {
        const fw = S.frame?.w || w;
        const fh = S.frame?.h || h;
        v.updateParallax(S.cam.x, S.cam.y, fw, fh, Math.max(fh, h));
      }
      v.cullDecos(S.cam.x, S.cam.y, w, h);
      S.fx?.update(app.ticker.deltaMS, { x: S.cam.x, y: S.cam.y, w, h });
    }
    if (S.shake) {
      const o = S.shake.step(app.ticker.deltaMS / 1000);
      world.position.x += o.dx * S.cam.zoom;
      world.position.y += o.dy * S.cam.zoom;
      if (!o.active && !o.started) S.shake = null;
    }
    updateArcs();
    drawGeometry();
    drawOverlay();
    drawRulers();
  });

  // —— Geometry and reach (in the street's px, under the selection) ——
  /** The geometry, reach and population overlays (js/builder/overlays.js draws the first two, as the render page does). */
  function drawGeometry() {
    const s = street();
    const z = S.cam.zoom;
    // Effects on parallax layers move with the camera: their markers are drawn again as it moves.
    const fxCam = (s?.emitters || []).some((e) => e.layer && e.layer !== 'middleground') ? `${Math.round(S.cam.x)},${Math.round(S.cam.y)}` : '';
    const key = `${S.version}|${z}|${S.overlays.geometry}|${S.overlays.reach}|${S.overlays.populations}|${S.overlays.effects}|${fxCam}|${S.validateMod ? 1 : 0}|${S.validate.report ? S.validate.id : 0}|${S.reachLocal?.key || ''}|${S.geoPreview.size ? Math.random() : ''}`;
    if (key === S.geoDrawn) return;
    S.geoDrawn = key;
    geoGfx.clear();
    if (!s) return;
    const px = (n) => n / z;
    if (S.overlays.reach) drawReach(s, px);
    if (S.overlays.populations) drawSpots(s, px);
    // Effects' rings show whenever the street has effects: they are how you pick one.
    if (s.emitters?.length) drawEffectMarkers(geoGfx, s, { px, shown: geoShown });
    if (!S.overlays.geometry) return;
    drawGeometryOverlay(geoGfx, s, { px, shown: geoShown });
  }

  /**
   * The populations overlay (spec 6.7): where the ecology planner puts this street's population
   * (js/street-ecology.js planStreetPlacements, seeded by the street's tsid, as the game plans it),
   * a dot per thing coloured by kind.
   */
  function drawSpots(s, px) {
    const row = streetRowShown();
    if (!row?.population || !S.validateMod) {
      if (!S.validateMod) loadValidateMod();
      S.spots = null;
      return;
    }
    const key = `${S.streetKey}|${S.version}`;
    if (S.spots?.key !== key) {
      S.spots = { key, spots: plannedSpots({ street: s, population: row.population, platformsScreen, worldToScreen, populationForStreet, planStreetPlacements, placementRequests: S.validateMod.placementRequests, worldW: streetWidth(s) }) };
      if (!S.selected.length && !S.geoSel.length) queueMicrotask(renderInspector);
    }
    for (const g of SPOT_GROUPS) {
      const mine = S.spots.spots.filter((p) => spotGroup(p.key) === g);
      if (!mine.length) continue;
      for (const p of mine) geoGfx.circle(p.x, p.y - px(9), px(g.id === 'player' ? 9 : 7));
      geoGfx.fill({ color: g.colour, alpha: 0.9 }).stroke({ width: px(2), color: 0x000000, alpha: 0.6 });
    }
  }
  function loadValidateMod() {
    if (S.validateModLoading) return;
    S.validateModLoading = import('./validate.js?v=1705a409').then((m) => { S.validateMod = m; S.geoDrawn = ''; }).catch(() => { S.validateModLoading = null; });
  }

  /** The reach to draw: the validator's for a draft street, else the one worked out here. */
  function reachData() {
    if (S.reachPinned && S.reachLocal?.key === reachKey()) return S.reachLocal.data;
    if (S.mode === 'draft' && S.validate.report?.reach?.[S.streetKey]) return S.validate.report.reach[S.streetKey];
    return S.reachLocal?.key === reachKey() ? S.reachLocal.data : null;
  }
  function drawReach(s, px) {
    const r = reachData();
    if (!r) {
      ensureLocalReach();
      return;
    }
    drawReachOverlay(geoGfx, r, { px });
  }

  function drawOverlay() {
    overlay.clear();
    const s = street();
    if (!s) return;
    const line = { width: 1.5, color: 0x1fa6ff, alpha: 1 };
    const cw = canvasHost.clientWidth;
    const ch = canvasHost.clientHeight;
    // View frames, centred on the view.
    if (S.overlays.frame) {
      for (const f of VIEW_FRAMES) {
        const w = f.w * S.cam.zoom;
        const h = f.h * S.cam.zoom;
        const x = (cw - w) / 2;
        const y = (ch - h) / 2;
        overlay.rect(x, y, w, h).stroke({ width: 3, color: 0x000000, alpha: 0.5 });
        if (f.id === 'wide') overlay.rect(x, y, w, h).stroke({ width: 1.5, color: 0xffffff });
        else for (const seg of [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]]) strokeSegs(overlay, dashes(...seg, 10, 6), { width: 1.5, color: 0xffffff });
      }
    }
    // Guides.
    if (S.overlays.rulers) {
      for (const g of S.guides) {
        const p = toCanvas({ x: g.at - s.bounds.l, y: g.at - s.bounds.t });
        if (g.axis === 'x') overlay.moveTo(p.x, 0).lineTo(p.x, ch);
        else overlay.moveTo(0, p.y).lineTo(cw, p.y);
      }
      overlay.stroke({ width: 1, color: 0x00e5ff, alpha: 0.9 });
    }
    // The jump arcs from the pointer.
    if (S.overlays.arc && S.arcs) {
      for (const a of S.arcs) {
        const pts = (a.points || []).map(toCanvas);
        if (pts.length < 2) continue;
        const colour = a.kind === 'running' ? COLOURS.running : COLOURS.plain;
        overlay.poly(pts.flatMap((p) => [p.x, p.y]), false).stroke({ width: 4, color: 0x000000, alpha: 0.4 });
        overlay.poly(pts.flatMap((p) => [p.x, p.y]), false).stroke({ width: 2, color: colour });
        if (a.landed) {
          const l = toCanvas(a.landed);
          overlay.circle(l.x, l.y, 4).fill({ color: colour }).stroke({ width: 1, color: 0x000000 });
        }
      }
      const f = S.arcs[0]?.from && toCanvas(S.arcs[0].from);
      if (f) overlay.circle(f.x, f.y, 4).fill({ color: 0xffffff }).stroke({ width: 1.5, color: 0x000000 });
    }
    // A shape being drawn.
    if (S.drag?.kind === 'draw') drawDrawing(s, S.drag);
    // Selected geometry: highlighted, with its handles.
    const geo = geoSelected();
    for (const { kind, item } of geo) {
      const sh = geoShape(s, kind, geoShown(kind, item));
      if (kind === 'platform') {
        const a = toCanvas({ x: sh.x1, y: sh.y1 });
        const b = toCanvas({ x: sh.x2, y: sh.y2 });
        overlay.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 6, color: 0xffffff, alpha: 0.6 }).moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2.5, color: COLOURS.select });
      } else {
        const b = shapeBounds(sh);
        const a = toCanvas({ x: b.x1, y: b.y1 });
        const c = toCanvas({ x: b.x2, y: b.y2 });
        const pad = kind === 'barrier' ? 4 : 0;
        overlay.rect(a.x - pad, a.y, c.x - a.x + pad * 2, c.y - a.y).stroke({ width: 3, color: 0xffffff, alpha: 0.7 });
        overlay.rect(a.x - pad, a.y, c.x - a.x + pad * 2, c.y - a.y).stroke(line);
      }
    }
    if (geo.length === 1 && editable()) {
      const { kind, item } = geo[0];
      for (const h of geoHandles(s, kind, geoShown(kind, item), S.cam.zoom)) {
        const c = toCanvas(h);
        if (kind === 'barrier' || (kind === 'ladder' && h.id === 'height')) overlay.circle(c.x, c.y, HANDLE_PX - 1).fill({ color: 0xffffff }).stroke(line);
        else overlay.rect(c.x - HANDLE_PX / 2 - 0.5, c.y - HANDLE_PX / 2 - 0.5, HANDLE_PX + 1, HANDLE_PX + 1).fill({ color: 0xffffff }).stroke(line);
      }
    }
    for (const id of S.selected) {
      const [layer, deco] = decoOf(id);
      if (!layer) continue;
      const box = boxOf(layer, deco);
      const pts = corners(box).map(toCanvas);
      overlay.poly(pts.flatMap((p) => [p.x, p.y]), true).stroke({ width: 3, color: 0xffffff, alpha: 0.7 });
      overlay.poly(pts.flatMap((p) => [p.x, p.y]), true).stroke(line);
      const a = toCanvas({ x: box.ax, y: box.ay });
      overlay.circle(a.x, a.y, 3).fill({ color: 0x1fa6ff });
      if (S.selected.length === 1 && editable() && !S.locked.has(layer.id)) {
        const hs = handlePoints(box, S.cam.zoom).map((h) => ({ ...h, ...toCanvas(h) }));
        const top = toCanvas(corners(box)[0]);
        const topR = toCanvas(corners(box)[1]);
        const knob = hs.find((h) => h.id === 'rotate');
        overlay.moveTo((top.x + topR.x) / 2, (top.y + topR.y) / 2).lineTo(knob.x, knob.y).stroke(line);
        for (const h of hs) {
          if (h.id === 'rotate') overlay.circle(h.x, h.y, HANDLE_PX - 1).fill({ color: 0xffffff }).stroke(line);
          else overlay.rect(h.x - HANDLE_PX / 2 - 0.5, h.y - HANDLE_PX / 2 - 0.5, HANDLE_PX + 1, HANDLE_PX + 1).fill({ color: 0xffffff }).stroke(line);
        }
      }
    }
    if (S.drag?.kind === 'marquee') {
      const a = toCanvas(S.drag.from);
      const b = toCanvas(S.drag.to);
      overlay.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)).fill({ color: 0x1fa6ff, alpha: 0.12 }).stroke(line);
    }
  }
  /** The shape a draw tool is making, as it will be added. */
  function drawDrawing(s, d) {
    const item = drawnItem(s, d.tool, d.from, d.to, { level: Boolean(S.pointer?.shift) });
    if (!item) return;
    const sh = geoShape(s, d.tool, item);
    const style = { width: 2.5, color: COLOURS.select };
    if (d.tool === 'platform') {
      const a = toCanvas({ x: sh.x1, y: sh.y1 });
      const b = toCanvas({ x: sh.x2, y: sh.y2 });
      overlay.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 6, color: 0xffffff, alpha: 0.6 }).moveTo(a.x, a.y).lineTo(b.x, b.y).stroke(style);
      return;
    }
    const b = shapeBounds(sh);
    const a = toCanvas({ x: b.x1, y: b.y1 });
    const c = toCanvas({ x: b.x2, y: b.y2 });
    if (d.tool === 'barrier') overlay.moveTo(a.x, a.y).lineTo(a.x, c.y).stroke({ width: 6, color: 0xffffff, alpha: 0.6 }).moveTo(a.x, a.y).lineTo(a.x, c.y).stroke(style);
    else overlay.rect(a.x, a.y, c.x - a.x, c.y - a.y).fill({ color: COLOURS.select, alpha: 0.12 }).stroke(style);
  }

  // —— Rulers (canvas px, in the street's world numbers) ——
  let rulersDrawn = '';
  function drawRulers() {
    const on = S.overlays.rulers && Boolean(street());
    rulerTop.hidden = !on;
    rulerLeft.hidden = !on;
    stage.classList.toggle('has-rulers', on);
    if (!on) { rulersDrawn = ''; return; }
    const s = street();
    const cw = canvasHost.clientWidth;
    const ch = canvasHost.clientHeight;
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    const dark = matchMedia?.('(prefers-color-scheme: dark)').matches;
    const key = `${S.cam.x}|${S.cam.y}|${S.cam.zoom}|${cw}|${ch}|${dpr}|${dark}|${document.documentElement.dataset.theme || ''}`;
    if (key === rulersDrawn) return;
    rulersDrawn = key;
    const css = getComputedStyle(root);
    const col = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    const bg = col('--surface', 'white');
    const fg = col('--fg', 'black');
    const muted = col('--muted', 'gray');
    for (const [cv, axis] of [[rulerTop, 'x'], [rulerLeft, 'y']]) {
      const w = axis === 'x' ? cw : RULER_PX;
      const h = axis === 'x' ? RULER_PX : ch;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        cv.style.width = `${w}px`;
        cv.style.height = `${h}px`;
      }
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = muted;
      ctx.fillStyle = fg;
      ctx.font = '10px system-ui, sans-serif';
      ctx.lineWidth = 1;
      const origin = axis === 'x' ? s.bounds.l + S.cam.x : s.bounds.t + S.cam.y;
      const span = (axis === 'x' ? cw : ch) / S.cam.zoom;
      const { step, ticks } = rulerTicks(origin, span, S.cam.zoom);
      ctx.beginPath();
      for (let v = Math.ceil(origin / (step / 5)) * (step / 5); v <= origin + span; v += step / 5) {
        const at = Math.round((v - origin) * S.cam.zoom) + 0.5;
        if (axis === 'x') { ctx.moveTo(at, RULER_PX); ctx.lineTo(at, RULER_PX - 4); } else { ctx.moveTo(RULER_PX, at); ctx.lineTo(RULER_PX - 4, at); }
      }
      for (const v of ticks) {
        const at = Math.round((v - origin) * S.cam.zoom) + 0.5;
        if (axis === 'x') {
          ctx.moveTo(at, RULER_PX); ctx.lineTo(at, 4);
          ctx.fillText(String(v), at + 3, 11);
        } else {
          ctx.moveTo(RULER_PX, at); ctx.lineTo(4, at);
          ctx.save();
          ctx.translate(11, at - 3);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(String(v), 0, 0);
          ctx.restore();
        }
      }
      ctx.stroke();
    }
  }

  // —— Selection ——
  function select(ids, { add = false } = {}) {
    S.geoSel = [];
    S.geoRevert = null;
    const next = add ? [...new Set([...S.selected, ...ids])] : [...new Set(ids)];
    S.selected = next.filter((id) => decoOf(id)[0]);
    S.revertTo = Object.fromEntries(S.selected.map((id) => [id, JSON.parse(JSON.stringify(decoOf(id)[1]))]));
    const first = S.selected[0] && decoOf(S.selected[0])[0];
    if (first && first.id !== S.activeLayer && S.selected.every((id) => decoOf(id)[0]?.id === first.id)) S.activeLayer = first.id;
    renderPanels();
  }
  /** Select geometry (keys "<kind>:<id>"); decos and geometry are never selected together. */
  function selectGeo(keys, { add = false } = {}) {
    const s = street();
    const next = add ? [...new Set([...S.geoSel, ...keys])] : [...new Set(keys)];
    S.geoSel = next.filter((k) => { const g = parseGeoKey(k); return g && geoItem(s, g.kind, g.id); });
    S.selected = [];
    S.revertTo = null;
    S.geoRevert = Object.fromEntries(geoSelected().map(({ key, item }) => [key, JSON.parse(JSON.stringify(item))]));
    renderPanels();
  }
  /** Select a deco or a piece of geometry by its id (a finding's `at`). */
  function selectById(id) {
    if (decoOf(id)[0]) return select([id]);
    const kind = geoKindOf(street(), id);
    if (kind) selectGeo([geoKey(kind, id)]);
  }
  /** What geometry can be picked: all of it while it is drawn or a draw tool is on, else signposts. */
  const pickKinds = () => (S.overlays.geometry || S.tool !== 'select' ? GEO_KINDS : ['signpost', 'emitter']);
  /** Geometry under a point, best first (platforms win), as keys. */
  function geoHitsAt(p) {
    const s = street();
    if (!s) return [];
    return geoHits(s, p, PICK_PX / S.cam.zoom, pickKinds()).map((h) => geoKey(h.kind, h.id));
  }
  /** Everything under a point, topmost first: the active layer first unless `all`. */
  function hitsAt(p, { all = false } = {}) {
    const s = street();
    if (!s || !S.view) return [];
    const out = [];
    const order = layersFrontFirst(s.layers);
    for (const layer of order) {
      if (S.hidden.has(layer.id) || S.locked.has(layer.id) || layer.hidden) continue;
      if (!all && layer.id !== S.activeLayer) continue;
      const decos = [...layer.decos].map((d, i) => ({ d, i })).sort((a, b) => (Number(b.d.z) || 0) - (Number(a.d.z) || 0) || b.i - a.i);
      for (const { d } of decos) {
        if (d.hidden) continue;
        const box = boxOf(layer, d);
        if (!contains(box, p)) continue;
        // A deco covering most of its layer is skipped unless that layer is the active one (LocoDeco).
        if (layer.id !== S.activeLayer && box.w * box.h > 0.8 * streetWidth(s) * streetHeight(s)) continue;
        out.push(d.id);
      }
    }
    return out;
  }

  // —— Edits ——
  function readOnlyNote() { say('This is a shipped street, so it opens read-only. Fork it into a draft to change it.'); }
  function commit(ops, label) {
    if (!ops.length) return;
    if (!editable()) return readOnlyNote();
    try {
      // A line that moves carries the signposts standing on it, and the arms landing there follow (P7).
      const follow = ops.some((o) => o.op === 'platform.set') ? followPostOps(S.session.zone, ops) : null;
      S.session.apply(follow ? follow.ops : ops, { label });
      if (follow?.carried.length) say(`Moved ${follow.carried.map((c) => c.split('/').pop()).join(', ')} with the line${follow.arms.length ? `; ${follow.arms.length === 1 ? 'one arm lands' : `${follow.arms.length} arms land`} there again` : ''}.`);
    } catch (err) {
      failed(err);
    }
  }
  /** Ops on the draft as a whole (the hub map, ways in, new streets): a draft is enough, even with a shipped street on screen. */
  function commitZone(ops, label) {
    if (!ops.length) return;
    if (!S.session) return say('Choose a draft first (the Draft menu), or make a new one.', 'bad');
    try {
      S.session.apply(ops, { label });
    } catch (err) {
      failed(err);
    }
  }
  const setOps = (changes) => changes.filter(([, set]) => Object.keys(set).length).map(([id, set]) => ({ op: 'deco.set', street: S.streetKey, id, set }));
  function editSelected(fn, label) {
    const changes = [];
    for (const id of S.selected) {
      const [layer, deco] = decoOf(id);
      if (!layer || S.locked.has(layer.id)) continue;
      const set = fn(deco, layer) || {};
      for (const k of Object.keys(set)) if (deco[k] === set[k]) delete set[k];
      changes.push([id, set]);
    }
    commit(setOps(changes), label);
  }
  function nudge(dx, dy) {
    if (S.geoSel.length) return commit(geoSetOps(geoSelected().map(({ kind, item }) => [kind, item, moveBy(kind, item, dx, dy)])), 'nudge');
    editSelected((d) => ({ x: Math.round(d.x + dx), y: Math.round(d.y + dy) }), 'nudge');
  }
  /** <kind>.set ops for [kind, item, fields] (unchanged fields left out, empty sets dropped). */
  function geoSetOps(changes) {
    return changes.map(([kind, item, set]) => [kind, item.id, changedFields(item, set)]).filter(([, , set]) => Object.keys(set).length).map(([kind, id, set]) => ({ op: `${kind}.set`, street: S.streetKey, id, set }));
  }
  /** Add geometry items ([kind, item] without ids: the ops give them) and select what was added. */
  function addGeometry(items, label) {
    const s = street();
    if (!s || !items.length) return;
    if (!editable()) return readOnlyNote();
    const before = Object.fromEntries(GEO_KINDS.map((k) => [k, (s[GEO_LIST[k]] || []).length]));
    commit(items.map(([kind, item]) => ({ op: `${kind}.add`, street: S.streetKey, [kind]: item })), label);
    const now = street();
    const added = GEO_KINDS.flatMap((k) => (now?.[GEO_LIST[k]] || []).slice(before[k]).map((g) => geoKey(k, g.id)));
    if (added.length) selectGeo(added);
    return added;
  }
  function rotate(by) { editSelected((d) => { let r = (Number(d.r) || 0) + by; while (r > 180) r -= 360; while (r <= -180) r += 360; return { r }; }, 'rotate'); }
  function flip() { editSelected((d) => ({ flip: !d.flip }), 'flip'); }
  function zOrder(dir, top) { editSelected((d, layer) => ({ z: zFor(layer, d, dir, top) }), 'z'); }
  function moveLayer(dir) {
    const s = street();
    if (!s || !editable() || !S.selected.length) return;
    const order = layersFrontFirst(s.layers);
    const ops = [];
    const offs = offsets();
    for (const id of S.selected) {
      const [from, deco] = decoOf(id);
      const at = order.indexOf(from);
      const to = order[at - dir];
      if (!to || S.locked.has(to.id)) continue;
      ops.push({ op: 'deco.move', street: S.streetKey, id, layer: to.id, set: relayerPosition(s, from, to, deco, offs) });
    }
    if (ops.length) {
      commit(ops, 'layer');
      const target = decoOf(S.selected[0])[0];
      if (target) S.activeLayer = target.id;
      say(`Moved to the ${target?.name || target?.id} layer, where it appeared.`);
      renderPanels();
    }
  }
  function remove() {
    if (S.geoSel.length) {
      const ops = geoSelected().map(({ kind, id }) => ({ op: `${kind}.remove`, street: S.streetKey, id }));
      if (!ops.length) return;
      commit(ops, 'delete');
      S.geoSel = [];
      renderPanels();
      return;
    }
    const ops = S.selected.filter((id) => !S.locked.has(decoOf(id)[0]?.id)).map((id) => ({ op: 'deco.remove', street: S.streetKey, id }));
    if (!ops.length) return;
    commit(ops, 'delete');
    S.selected = [];
    renderPanels();
  }
  function copy(cut = false) {
    if (S.geoSel.length) {
      const geometry = geoSelected().map(({ kind, item }) => {
        const { id, ...rest } = item;
        return { kind, item: rest };
      });
      store.set(CLIPBOARD_KEY, { decos: [], geometry, at: Date.now() });
      say(`Copied ${geometry.length === 1 ? `1 ${GEO_WORDS[geometry[0].kind].toLowerCase()}` : `${geometry.length} pieces of geometry`}.`);
      if (cut) remove();
      return;
    }
    const decos = S.selected.map((id) => decoOf(id)).filter(([l]) => l).map(([layer, deco]) => ({ layer: layer.id, role: layerRole(layer, street()), deco }));
    if (!decos.length) return;
    store.set(CLIPBOARD_KEY, { decos, at: Date.now() });
    say(`Copied ${decos.length === 1 ? '1 deco' : `${decos.length} decos`}.`);
    if (cut) remove();
  }
  /** Paste copied geometry: at the view centre (the group's bottom centre there), or where it was. */
  function pasteGeometry(geometry, inPlace) {
    const s = street();
    let dx = 0;
    let dy = 0;
    if (!inPlace) {
      const pts = geometry.flatMap(({ kind, item }) => (kind === 'platform' ? [{ x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 }] : [{ x: item.x, y: item.y }]));
      const { w, h } = viewSize();
      const xs = pts.map((p) => p.x);
      dx = Math.round(S.cam.x + w / 2 + s.bounds.l - (Math.min(...xs) + Math.max(...xs)) / 2);
      dy = Math.round(S.cam.y + h / 2 + s.bounds.t - Math.max(...pts.map((p) => p.y)));
    }
    addGeometry(geometry.filter((g) => GEO_KINDS.includes(g.kind)).map(({ kind, item }) => [kind, { ...item, ...moveBy(kind, item, dx, dy) }]), 'paste');
  }
  async function paste(inPlace) {
    const clip = store.get(CLIPBOARD_KEY, null);
    if (clip?.geometry?.length) {
      if (!editable()) return readOnlyNote();
      return pasteGeometry(clip.geometry, inPlace);
    }
    if (!clip?.decos?.length) return say('Nothing to paste yet. Copy a deco or some geometry first.');
    if (!editable()) return readOnlyNote();
    const s = street();
    const target = layerOf(S.activeLayer) || layerOf('middleground');
    if (S.locked.has(target.id)) return say('That layer is locked (L).');
    const taken = new Set();
    const ops = [];
    const ids = [];
    let dx = 0;
    let dy = 0;
    if (!inPlace) {
      const { w, h } = viewSize();
      const centre = { x: S.cam.x + w / 2, y: S.cam.y + h / 2 };
      const at = isLayerLocal(target) ? { x: centre.x - offsetOf(target.id).x, y: centre.y - offsetOf(target.id).y } : { x: centre.x + s.bounds.l, y: centre.y + s.bounds.t };
      const mx = clip.decos.reduce((n, c) => n + c.deco.x, 0) / clip.decos.length;
      const my = Math.max(...clip.decos.map((c) => c.deco.y));
      dx = at.x - mx;
      dy = at.y - my;
    }
    const catalog = await loadCatalog();
    for (const c of clip.decos) {
      const id = nextDecoId(s, taken);
      taken.add(id);
      const deco = { ...c.deco, id, x: Math.round(c.deco.x + dx), y: Math.round(c.deco.y + dy) };
      ops.push({ op: 'deco.add', street: S.streetKey, layer: target.id, deco });
      ids.push(id);
      const art = catalog.has(deco.sprite) ? deco.sprite : DECO_TWINS[deco.sprite];
      if (art && catalog.has(art) && !S.session.zone.assets?.[deco.sprite] && !ops.some((o) => o.op === 'asset.set' && o.name === deco.sprite)) {
        ops.unshift({ op: 'asset.set', name: deco.sprite, asset: libraryAsset(catalog.get(art)) });
      }
    }
    commit(ops, 'paste');
    setTimeout(() => select(ids), 80);
  }
  function revertSelection() {
    if (S.geoRevert && editable()) {
      const ops = [];
      for (const [key, was] of Object.entries(S.geoRevert)) {
        const g = parseGeoKey(key);
        const now = g && geoOf(g.kind, g.id);
        if (!now) continue;
        const set = {};
        const unset = [];
        for (const k of Object.keys(was)) if (k !== 'id' && k !== 'connects' && JSON.stringify(now[k]) !== JSON.stringify(was[k])) set[k] = was[k];
        for (const k of Object.keys(now)) if (k !== 'id' && k !== 'connects' && !(k in was)) unset.push(k);
        if (Object.keys(set).length || unset.length) ops.push({ op: `${g.kind}.set`, street: S.streetKey, id: g.id, set, ...(unset.length ? { unset } : {}) });
      }
      if (!ops.length) return false;
      commit(ops, 'revert');
      return true;
    }
    if (!S.revertTo || !editable()) return false;
    const changes = [];
    for (const [id, was] of Object.entries(S.revertTo)) {
      const [, now] = decoOf(id);
      if (!now) continue;
      const set = {};
      for (const k of ['x', 'y', 'w', 'h', 'r', 'z', 'flip', 'hidden']) if (k in was && now[k] !== was[k]) set[k] = was[k];
      changes.push([id, set]);
    }
    const ops = setOps(changes);
    if (!ops.length) return false;
    commit(ops, 'revert');
    return true;
  }

  // —— Session events ——
  function onSession(e) {
    if (e.kind === 'status') {
      status.textContent = statusWords(S.session);
      status.dataset.state = S.session.status;
    } else if (['apply', 'undo', 'redo'].includes(e.kind)) {
      // A way in changed with a shipped street on screen: draw it again with its new arms.
      if (S.mode === 'view' && e.changed?.includes('edits')) mount();
      else refresh(e.changed);
      if (e.changed?.some((c) => c === 'hub' || c === 'edits' || !c.includes('/'))) hubMap.refresh();
      if (e.changed?.some((c) => c.startsWith('asset:'))) picker.refresh();
      S.selected = S.selected.filter((id) => decoOf(id)[0]);
      S.geoSel = geoSelected().map((g) => g.key);
      if (e.changed?.includes(S.streetKey)) fillStreets();
      renderPanels();
      scheduleValidate();
    } else {
      // remote, rebased, conflict: the whole draft may differ.
      hubMap.refresh();
      fillStreets();
      if (!street()) return openDraftStreet('');
      mount();
      S.selected = S.selected.filter((id) => decoOf(id)[0]);
      S.geoSel = geoSelected().map((g) => g.key);
      renderPanels();
      scheduleValidate();
      if (e.kind === 'remote') say('This draft changed somewhere else; showing the new version.');
    }
    undoBtn.disabled = !S.session.canUndo;
    redoBtn.disabled = !S.session.canRedo;
  }

  // —— Panels ——
  function renderPanels() {
    renderLayers();
    renderOutline();
    renderGeoOutline();
    renderInspector();
    renderTools();
    renderValidate();
    renderFindings();
    undoBtn.disabled = !S.session?.canUndo;
    redoBtn.disabled = !S.session?.canRedo;
    playBtn.disabled = S.mode !== 'draft' || !street();
    forkBtn.hidden = S.mode !== 'view';
    newStreetBtn.hidden = !S.session;
    canvas.dataset.selected = [...S.selected, ...S.geoSel].join(',');
  }
  function renderTools() {
    for (const b of toolBtns) b.setAttribute('aria-pressed', String(b.dataset.tool === S.tool));
    snapBtn.setAttribute('aria-pressed', String(S.snap.on));
    gridBtn.setAttribute('aria-pressed', String(S.snap.grid));
    canvas.dataset.tool = S.tool;
    canvas.dataset.overlays = Object.entries(S.overlays).filter(([, v]) => v).map(([k]) => k).join(',');
  }
  function setTool(tool) {
    if (tool !== 'select' && !editable()) {
      if (street()) readOnlyNote();
      tool = 'select';
    }
    S.tool = tool;
    if (S.drag?.kind === 'draw') S.drag = null;
    renderTools();
    const words = { select: 'Select: click to pick, drag to move.', platform: 'Platform: drag to draw a line. Shift keeps it level.', barrier: 'Wall: drag up or down to draw one.', ladder: 'Ladder: drag from its foot up.', signpost: 'Signpost: click to stand one on the floor, or drag its size.' };
    if (tool !== 'select') say(`${words[tool]} Esc goes back to Select.`);
  }
  /** The left panel's geometry lists, one per kind (a keyboard way to pick geometry). */
  function renderGeoOutline() {
    const s = street();
    if (!s) return geoOutline.replaceChildren();
    const sel = new Set(S.geoSel);
    const open = geoOutline.querySelectorAll('details[open]');
    const wasOpen = new Set([...open].map((d) => d.dataset.kind));
    geoOutline.replaceChildren(...GEO_KINDS.map((kind) => {
      const items = s[GEO_LIST[kind]] || [];
      const details = el('details', { 'data-kind': kind, open: wasOpen.has(kind) || items.some((g) => sel.has(geoKey(kind, g.id))) ? true : null },
        el('summary', { text: `${GEO_WORDS[kind]}s (${items.length})` }),
        el('ul', { class: 'builder-outline' }, ...items.map((g) => {
          const key = geoKey(kind, g.id);
          const sub = kind === 'platform' ? permName(g.pc_perm) : kind === 'barrier' ? (PERMS.find((p) => p.value === g.pc_perm)?.wall || PERMS[3].wall) : kind === 'signpost' ? `${(g.connects || []).length} arms` : `${Math.round(g.h)} tall`;
          return el('li', {}, el('button', {
            type: 'button',
            class: 'builder-deco',
            'aria-pressed': String(sel.has(key)),
            'data-geo': key,
            onclick: (e) => {
              selectGeo([key], { add: e.shiftKey });
              if (!e.shiftKey) centreOnGeo(kind, g);
            },
          }, el('span', { text: g.id }), el('span', { class: 'builder-sub', text: ` ${sub}` })));
        })));
      return details;
    }));
  }
  function centreAt(p) {
    const { w, h } = viewSize();
    S.cam.x = p.x - w / 2;
    S.cam.y = p.y - h / 2;
    saveCamera();
  }
  function centreOnGeo(kind, item) {
    const b = shapeBounds(geoShape(street(), kind, item));
    centreAt({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 });
  }
  function renderLayers() {
    const s = street();
    layersList.replaceChildren(...layersFrontFirst(s?.layers || []).map((layer) => {
      const active = layer.id === S.activeLayer;
      const eye = btn(S.hidden.has(layer.id) ? 'Show' : 'Hide', { class: 'builder-mini', 'aria-pressed': String(S.hidden.has(layer.id)), 'aria-label': `${S.hidden.has(layer.id) ? 'Show' : 'Hide'} ${layer.name || layer.id} in the editor` });
      eye.addEventListener('click', () => {
        if (S.hidden.has(layer.id)) S.hidden.delete(layer.id); else S.hidden.add(layer.id);
        const lc = containerOf(layer.id);
        if (lc) lc.visible = !S.hidden.has(layer.id);
        renderLayers();
      });
      const lock = btn(S.locked.has(layer.id) ? 'Unlock' : 'Lock', { class: 'builder-mini', 'aria-pressed': String(S.locked.has(layer.id)), 'aria-label': `${S.locked.has(layer.id) ? 'Unlock' : 'Lock'} ${layer.name || layer.id}` });
      lock.addEventListener('click', () => toggleLock(layer.id));
      const name = el('button', { type: 'button', class: 'builder-layer-name', 'aria-pressed': String(active), 'data-layer': layer.id, onclick: () => { S.activeLayer = layer.id; renderPanels(); } },
        el('span', { text: layer.name || layer.id }), el('span', { class: 'builder-sub', text: ` ${layerRole(layer, s)} · z ${layer.z ?? 0} · ${layer.decos.length}${layer.hidden ? ' · hidden in game' : ''}${flashBlurSize(layer.filters?.blur) ? ' · blurred' : ''}` }));
      return el('li', { class: active ? 'is-active' : null, 'data-layer-row': layer.id }, name, eye, lock);
    }));
  }
  function toggleLock(id) {
    if (S.locked.has(id)) S.locked.delete(id); else S.locked.add(id);
    S.selected = S.selected.filter((d) => decoOf(d)[0]?.id !== id);
    renderPanels();
    say(S.locked.has(id) ? 'Layer locked: its decos cannot be picked.' : 'Layer unlocked.');
  }
  function renderOutline() {
    const layer = layerOf(S.activeLayer);
    outlineHead.textContent = layer ? `Decos on ${layer.name || layer.id} (${layer.decos.length})` : 'Decos';
    if (!layer) return outline.replaceChildren();
    const sel = new Set(S.selected);
    outline.replaceChildren(...layer.decos.map((d) => el('li', {}, el('button', {
      type: 'button',
      class: 'builder-deco',
      'aria-pressed': String(sel.has(d.id)),
      'data-deco': d.id,
      onclick: (e) => {
        select([d.id], { add: e.shiftKey });
        if (!e.shiftKey) centreOn(d.id);
      },
    }, el('span', { text: d.sprite }), el('span', { class: 'builder-sub', text: ` ${d.id}${d.hidden ? ' · hidden' : ''}` })))));
  }
  function centreOn(id) {
    const [layer, deco] = decoOf(id);
    if (!layer) return;
    const box = boxOf(layer, deco);
    const { w, h } = viewSize();
    S.cam.x = box.ax - w / 2;
    S.cam.y = box.ay - box.h / 2 - h / 2;
    saveCamera();
  }
  const field = (label, input) => el('label', { class: 'builder-field' }, el('span', { text: label }), input);
  function numberInput(name, value, onCommit, attrs = {}) {
    const input = el('input', { type: 'number', name, value: String(Math.round(Number(value) * 100) / 100), step: '1', inputmode: 'decimal', ...attrs });
    input.addEventListener('change', () => { const n = Number(input.value); if (Number.isFinite(n)) onCommit(n); });
    return input;
  }
  /** Draw the inspector again, keeping the keyboard focus on the field it was on. */
  function renderInspector() {
    const a = document.activeElement;
    const focusKey = a && inspector.contains(a) ? a.dataset.focus || a.name || '' : '';
    buildInspector();
    if (focusKey) {
      const esc = globalThis.CSS?.escape ? CSS.escape(focusKey) : focusKey;
      inspector.querySelector(`[data-focus="${esc}"], [name="${esc}"]`)?.focus();
    }
  }
  function buildInspector() {
    const s = street();
    inspector.replaceChildren();
    // append() writes a null as the text "null": leave the absent parts out.
    const add = (...kids) => inspector.append(...kids.filter((k) => k != null));
    if (!s) return add(el('p', { class: 'builder-sub', text: 'Open a street to begin.' }));
    if (S.geoSel.length) return buildGeoInspector(s, add);
    if (!S.selected.length) {
      const layer = layerOf(S.activeLayer);
      add(
        el('p', {}, el('b', { text: s.label }), el('span', { class: 'builder-sub', text: ` ${s.tsid}` })),
        el('p', { class: 'builder-sub', text: S.mode === 'view' ? 'A shipped street, open to look at. Fork it into a draft to change it.' : `${s.hubName || ''} · ${streetWidth(s)} by ${streetHeight(s)}` }),
        el('p', { class: 'builder-sub', text: 'Click a deco on the active layer to select it, or a line, wall, ladder or signpost. Alt+click cycles through everything under the pointer.' }));
      if (editable()) {
        add(el('h3', { class: 'builder-h3', text: 'Add at the view centre' }),
          el('div', { class: 'builder-row builder-wrap' }, ...GEO_KINDS.map((kind) => btn(GEO_WORDS[kind], { class: 'builder-mini', 'data-add': kind, onclick: () => addAtCentre(kind) }))));
      }
      const row = streetRowShown();
      if (row) {
        add(populationSection({ el, btn, field, row, editable: editable(), commit, spotsShown: S.overlays.populations, toggleSpots: (on) => setOverlay('populations', on), planned: S.spots?.spots?.length || 0 }));
        add(rumbleSection({ el, btn, field, numberInput, street: s, streetKey: S.streetKey, editable: editable(), commit, reduced: prefersReducedMotion(), preview: previewRumble }));
        add(zoneSection({ el, btn, zone: S.session.zone, labelOf: (t) => targetOf(t).label, editable: Boolean(S.session), commit: commitZone, openHubMap: () => hubMap.open(), openShipped: (t) => openShipped(t) }));
      }
      if (layer) {
        const hid = el('input', { type: 'checkbox', name: 'layer-hidden', checked: layer.hidden ? true : null, disabled: !editable() || null });
        hid.addEventListener('change', () => commit([{ op: 'layer.set', street: S.streetKey, layer: layer.id, ...(hid.checked ? { set: { hidden: true } } : { unset: ['hidden'] }) }], 'layer'));
        add(el('h3', { class: 'builder-h3', text: `Layer ${layer.name || layer.id}` }),
          el('p', { class: 'builder-sub', text: `${layerRole(layer, s)}, z ${layer.z ?? 0}${layer.w ? `, ${layer.w} by ${layer.h}` : ''}` }),
          el('label', { class: 'builder-check' }, hid, ' Hidden in the game'));
      }
      buildSkyAndFilters(s, layer, add);
      return;
    }
    if (S.selected.length > 1) {
      add(el('p', {}, el('b', { text: `${S.selected.length} decos` })),
        el('p', { class: 'builder-sub', text: 'Arrows move them all; H flips, R with the arrows rotates, Delete removes.' }));
      return;
    }
    const [layer, deco] = decoOf(S.selected[0]);
    if (!layer) return;
    const ro = !editable() || S.locked.has(layer.id);
    const set = (patch, label = 'inspector') => commit(setOps([[deco.id, Object.fromEntries(Object.entries(patch).filter(([k, v]) => deco[k] !== v))]]), label);
    const aspect = store.get('groddle.builder.aspect', true);
    const lockAspect = el('input', { type: 'checkbox', checked: aspect ? true : null });
    lockAspect.addEventListener('change', () => store.set('groddle.builder.aspect', lockAspect.checked));
    const dis = ro ? { disabled: true } : {};
    const w = numberInput('w', deco.w, (n) => set(lockAspect.checked && deco.w > 0 ? { w: Math.max(1, Math.round(n)), h: Math.max(1, Math.round((deco.h * n) / deco.w)) } : { w: Math.max(1, Math.round(n)) }), { min: '1', ...dis });
    const h = numberInput('h', deco.h, (n) => set(lockAspect.checked && deco.h > 0 ? { h: Math.max(1, Math.round(n)), w: Math.max(1, Math.round((deco.w * n) / deco.h)) } : { h: Math.max(1, Math.round(n)) }), { min: '1', ...dis });
    const layerPick = el('select', { name: 'layer', ...dis }, ...layersFrontFirst(street().layers).map((l) => el('option', { value: l.id, selected: l.id === layer.id ? true : null }, l.name || l.id)));
    layerPick.addEventListener('change', () => {
      const to = layerOf(layerPick.value);
      if (!to || to === layer) return;
      commit([{ op: 'deco.move', street: S.streetKey, id: deco.id, layer: to.id, set: relayerPosition(street(), layer, to, deco, offsets()) }], 'layer');
      S.activeLayer = to.id;
      renderPanels();
    });
    const flipBox = el('input', { type: 'checkbox', checked: deco.flip ? true : null, ...dis });
    flipBox.addEventListener('change', () => commit([{ op: 'deco.set', street: S.streetKey, id: deco.id, ...(flipBox.checked ? { set: { flip: true } } : { unset: ['flip'] }) }], 'flip'));
    const hidBox = el('input', { type: 'checkbox', checked: deco.hidden ? true : null, ...dis });
    hidBox.addEventListener('change', () => commit([{ op: 'deco.set', street: S.streetKey, id: deco.id, ...(hidBox.checked ? { set: { hidden: true } } : { unset: ['hidden'] }) }], 'hidden'));
    const spr = S.view?.decoViews?.get(deco.id);
    const file = S.catalog?.get(deco.sprite)?.size2;
    const reset = btn('File size', { class: 'builder-mini', ...dis, title: 'Reset to the art\'s own size' });
    reset.addEventListener('click', () => {
      const size = file ? { w: Math.round(file[0] / 2), h: Math.round(file[1] / 2) } : spr ? { w: Math.round(spr.texture.width), h: Math.round(spr.texture.height) } : null;
      if (size) set(size, 'size');
    });
    const local = isLayerLocal(layer);
    const box = boxOf(layer, deco);
    const worldAt = { x: Math.round(box.ax + street().bounds.l), y: Math.round(box.ay + street().bounds.t) };
    add(
      el('p', {}, el('b', { text: deco.sprite }), el('span', { class: 'builder-sub', text: ` ${deco.id}` })),
      ro ? el('p', { class: 'builder-sub', text: S.mode === 'view' ? 'Read-only: fork this street to change it.' : 'This layer is locked.' }) : null,
      el('div', { class: 'builder-grid' },
        field('x', numberInput('x', deco.x, (n) => set({ x: Math.round(n) }), dis)),
        field('y', numberInput('y', deco.y, (n) => set({ y: Math.round(n) }), dis)),
        field('w', w), field('h', h),
        field('r', numberInput('r', deco.r || 0, (n) => set({ r: Math.max(-180, Math.min(180, Math.round(n))) }), { min: '-180', max: '180', ...dis })),
        field('z', numberInput('z', deco.z || 0, (n) => set({ z: Math.round(n) }), dis))),
      el('div', { class: 'builder-row' }, el('label', { class: 'builder-check' }, lockAspect, ' Keep proportions'), reset),
      el('label', { class: 'builder-check' }, flipBox, ' Flipped (H)'),
      el('label', { class: 'builder-check' }, hidBox, ' Hidden in the game'),
      field('Layer', layerPick),
      el('p', { class: 'builder-sub', text: local ? `Layer-local x, y. With this camera it sits at ${worldAt.x}, ${worldAt.y} in the street.` : 'Street x, y (the middleground is the street\'s own space).' }),
      file ? el('p', { class: 'builder-sub', text: `Art file ${file[0]} by ${file[1]} (drawn at half: ${Math.round(file[0] / 2)} by ${Math.round(file[1] / 2)}).` }) : null,
      provenanceSection(el, deco.sprite, S.mode === 'draft' ? S.session?.zone.assets?.[deco.sprite] : null, { library: S.catalog }));
  }

  /** Shake the view once with the street's rumble (none under reduced motion: the clock gives 0). */
  function previewRumble() {
    const r = street()?.rumble;
    if (!r) return;
    S.shake = createRumbleClock(r, 'preview', { reduced: prefersReducedMotion() });
    S.shake.trigger();
    say(prefersReducedMotion() ? 'Your device asks for less motion, so the view stays still.' : 'Shaking as players will feel it.');
  }
  function addAtCentre(kind) {
    const s = street();
    const { w, h } = viewSize();
    const item = defaultItem(s, kind, { x: S.cam.x + w / 2, y: S.cam.y + h / 2 });
    if (item) addGeometry([[kind, item]], 'add');
  }
  // —— The deco picker's placing (spec 6.4) ——
  /**
   * Place a picker row on the active layer: at the view centre, or where it was dropped (`at`: a
   * pointer event's client x, y). A middleground deco stands on the floor under it while snapping
   * is on. A library deco brings its provenance row; new art has its own already.
   */
  function placeDeco(row, at = null) {
    if (!editable()) return S.mode === 'view' ? readOnlyNote() : say('Open a draft street first (New street, or Fork into draft).', 'bad');
    const s = street();
    const layer = layerOf(S.activeLayer);
    if (!layer) return say('Pick a layer first.', 'bad');
    if (S.locked.has(layer.id)) return say(`${layer.name || layer.id} is locked. Unlock it (L) to place on it.`, 'bad');
    let p;
    if (at) {
      const r = canvas.getBoundingClientRect();
      p = toWorld(at.clientX - r.left, at.clientY - r.top);
    } else {
      const { w, h } = viewSize();
      p = { x: S.cam.x + w / 2, y: S.cam.y + h / 2 };
    }
    if (layer.id === 'middleground' && S.snap.on) {
      const floor = floorUnder(platformsScreen(s), p.x, p.y, isStandable);
      if (floor && floor.y >= p.y - 2 && floor.y - p.y < 400 && Math.abs(floor.x - p.x) < 2) p = { x: p.x, y: floor.y };
    }
    const pos = screenToDeco(s, layer, p, offsetOf(layer.id));
    const id = nextDecoId(s);
    const z = (layer.decos || []).reduce((m, d) => Math.max(m, Number(d.z) || 0), 0) + 1;
    const deco = decoFor(row, { id, x: pos.x, y: pos.y, z });
    const ops = [];
    if (row.bundle !== NEW_ART_BUNDLE && !S.session.zone.assets?.[row.name] && row.source) ops.push({ op: 'asset.set', name: row.name, asset: libraryAsset(row) });
    ops.push({ op: 'deco.add', street: S.streetKey, layer: layer.id, deco });
    commit(ops, 'place');
    if (decoOf(id)[0]) {
      select([id]);
      say(`Placed ${row.name} on ${layer.name || layer.id} at ${deco.x}, ${deco.y}, ${deco.w} by ${deco.h}.`);
    }
  }
  canvasHost.addEventListener('dragover', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes(PICK_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  canvasHost.addEventListener('drop', async (e) => {
    const name = e.dataTransfer?.getData(PICK_MIME);
    if (!name) return;
    e.preventDefault();
    const row = picker.find(name) || (await loadCatalog()).get(name);
    if (row) placeDeco(row, { clientX: e.clientX, clientY: e.clientY });
  });
  /** New art through the site's intake (P5's POST admin/builder/assets), then its asset.set op. */
  async function uploadArt(body) {
    if (!S.session) throw new Error('Open a draft first.');
    await S.session.flush();
    const r = await api.intake(body);
    if (r?.op) commitZone([r.op], 'new art');
    return r;
  }

  function permSelect(name, value, onPick, { wall = false, dis = {} } = {}) {
    const sel = el('select', { name, ...dis },
      ...(value === undefined ? [el('option', { value: '', selected: true }, 'Not set (a floor)')] : []),
      ...PERMS.map((p) => el('option', { value: p.key, selected: permKey(value) === p.key ? true : null }, `${p.label} (${p.key === 'null' ? 'null' : p.value}): ${wall ? p.wall : p.line}`)));
    sel.addEventListener('change', () => onPick(permValue(sel.value)));
    return sel;
  }
  /** The inspector for geometry: coordinates, perms, a signpost's size and its arms. */
  function buildGeoInspector(s, add) {
    const geo = geoSelected();
    if (geo.length > 1) {
      add(el('p', {}, el('b', { text: `${geo.length} pieces of geometry` })),
        el('p', { class: 'builder-sub', text: 'Arrows move them all, Delete removes them, Ctrl/Cmd+C and V copy them.' }));
      return;
    }
    if (!geo.length) return;
    const { kind, id, item } = geo[0];
    const ro = !editable();
    const dis = ro ? { disabled: true } : {};
    const set = (patch, label = 'inspector') => commit(geoSetOps([[kind, item, patch]]), label);
    const setPerm = (field) => (v) => commit([{ op: `${kind}.set`, street: S.streetKey, id, ...(v === undefined ? { set: {}, unset: [field] } : { set: { [field]: v } }) }], 'perm');
    const num = (name, label, value, fn, attrs = {}) => field(label, numberInput(name, value, fn, { ...dis, ...attrs }));
    add(el('p', {}, el('b', { text: GEO_WORDS[kind] }), el('span', { class: 'builder-sub', text: ` ${id}` })),
      ro ? el('p', { class: 'builder-sub', text: 'Read-only: fork this street to change it.' }) : null);
    if (kind === 'platform') {
      const len = Math.round(Math.hypot(item.x2 - item.x1, item.y2 - item.y1));
      const level = btn('Level it', { class: 'builder-mini', ...dis, title: 'Put the right end at the left end\'s height' });
      level.addEventListener('click', () => set(item.x1 <= item.x2 ? { y2: item.y1 } : { y1: item.y2 }, 'level'));
      add(el('div', { class: 'builder-grid' },
        num('x1', 'x1', item.x1, (n) => set({ x1: Math.round(n) })), num('y1', 'y1', item.y1, (n) => set({ y1: Math.round(n) })),
        num('x2', 'x2', item.x2, (n) => set({ x2: Math.round(n) })), num('y2', 'y2', item.y2, (n) => set({ y2: Math.round(n) }))),
        el('div', { class: 'builder-row' }, el('span', { class: 'builder-sub', text: `${len} px long` }), level),
        field('Players', permSelect('pc_perm', item.pc_perm, setPerm('pc_perm'), { dis })),
        field('Items', permSelect('item_perm', item.item_perm, setPerm('item_perm'), { dis })),
        el('p', { class: 'builder-sub', text: 'Street x, y: y goes up as it gets more negative. A new line is a Floor for both.' }));
    } else if (kind === 'barrier') {
      add(el('div', { class: 'builder-grid' },
        num('x', 'x', item.x, (n) => set({ x: Math.round(n) })), num('y', 'Top y', item.y, (n) => set({ y: Math.round(n) })),
        num('h', 'Height (down)', item.h, (n) => set({ h: Math.max(1, Math.round(n)) }), { min: '1' })),
        field('Blocks', permSelect('pc_perm', item.pc_perm, setPerm('pc_perm'), { wall: true, dis })),
        el('p', { class: 'builder-sub', text: 'From the left means a player walking right into it.' }));
    } else if (kind === 'emitter') {
      add(effectInspector({
        el, btn, field, numberInput, item, id, street: s, dis, layers: layersFrontFirst(s.layers),
        set: (patch, label = 'effect') => commit(geoSetOps([[kind, item, patch]]), label),
        unset: (keys, label = 'effect') => commit([{ op: 'emitter.set', street: S.streetKey, id, set: {}, unset: keys }], label),
      }));
    } else if (kind === 'ladder') {
      add(el('div', { class: 'builder-grid' },
        num('x', 'x (centre)', item.x, (n) => set({ x: Math.round(n) })), num('y', 'y (foot)', item.y, (n) => set({ y: Math.round(n) })),
        num('w', 'Width', item.w, (n) => set({ w: Math.max(1, Math.round(n)) }), { min: '1' }), num('h', 'Height (up)', item.h, (n) => set({ h: Math.max(1, Math.round(n)) }), { min: '1' })),
        el('p', { class: 'builder-sub', text: 'Drag the square to move it, the circle to change its height.' }));
    } else {
      add(el('div', { class: 'builder-grid' },
        num('x', 'x (centre)', item.x, (n) => set({ x: Math.round(n) })), num('y', 'y (foot)', item.y, (n) => set({ y: Math.round(n) })),
        num('w', 'Width', item.w, (n) => set({ w: Math.max(1, Math.round(n)) }), { min: '1' }), num('h', 'Height', item.h, (n) => set({ h: Math.max(1, Math.round(n)) }), { min: '1' })));
      const off = postOffFloor(s, item);
      if (off && S.mode === 'draft') {
        const settle = btn('Stand it on the floor', { class: 'builder-mini', name: 'post-settle', ...dis, disabled: ro || off.why === 'none' ? true : undefined, title: 'Move it onto the floor under it; the arms that land here follow' });
        settle.addEventListener('click', () => settlePost(item));
        add(el('p', { class: 'builder-sub builder-warn', 'data-builder-post-off': off.why, text: offFloorWords(item, off) }), el('div', { class: 'builder-row' }, settle));
      }
      buildArms(s, item, add, dis);
      if (S.mode === 'view' && S.session) buildWaysIn(s, item, add);
    }
    const del = btn(`Delete this ${GEO_WORDS[kind].toLowerCase()}`, { class: 'builder-mini', ...dis });
    del.addEventListener('click', () => remove());
    add(el('div', { class: 'builder-row' }, del));
  }

  // —— Signpost arms (connects) ——
  /** Streets an arm can lead to: this draft's other streets, then the shipped ones. */
  async function armTargets(query) {
    if (!S.shippedList) {
      try { S.shippedList = await api.streets(); } catch (err) { failed(err); S.shippedList = []; }
    }
    const own = S.mode === 'draft' ? S.session.zone.streets.filter((r) => r.key !== S.streetKey).map((r) => ({ tsid: r.street.tsid, label: r.street.label, hub: 'this draft', key: r.key, hubId: r.street.hubId })) : [];
    return searchStreets([...own, ...S.shippedList], query, 8);
  }
  /** A target street's JSON: a draft street from the zone, a shipped one fetched once. */
  async function targetStreet(target) {
    if (target.key) return S.session?.zone.streets.find((r) => r.key === target.key)?.street || null;
    const key = resolveIndexTsid(target.tsid);
    if (S.shippedStreets.has(key)) return withDraftEdits(S.shippedStreets.get(key));
    const file = key && STREET_INDEX.streets[key]?.file;
    if (!file) return null;
    const data = await (await fetch(file)).json();
    S.shippedStreets.set(key, data);
    return withDraftEdits(data);
  }
  /** A shipped street with the open draft's edits on it (as the play-test and publishing put them). */
  function withDraftEdits(data) {
    const edits = S.session ? editsOn(S.session.zone.edits, data.tsid) : [];
    return edits.length ? streetWithEdits(data, edits) : data;
  }
  /** The draft street (or shipped row) a connect's tsid names, for its words. */
  function targetOf(tsid) {
    const own = S.session?.zone.streets.find((r) => r.street.tsid === tsid);
    if (own) return { tsid, key: own.key, label: own.street.label, hubId: own.street.hubId, hub: 'this draft' };
    const key = resolveIndexTsid(tsid);
    const row = key && STREET_INDEX.streets[key];
    return row ? { tsid, label: row.label, hubId: row.hubId, hub: row.hubName || '' } : { tsid, label: tsid, hub: 'not a known street' };
  }
  async function addArm(post, target) {
    const s = street();
    const key = S.streetKey;
    let arrive = null;
    try { arrive = arriveFor(await targetStreet(target), s.tsid); } catch { arrive = null; }
    const meta = targetOf(target.tsid);
    commit([{ op: 'connect.add', street: key, signpost: post.id, connect: newConnect({ tsid: target.tsid, label: target.label || meta.label, hubId: target.hubId || meta.hubId, arrive }) }], 'arm');
    say(arrive ? `Linked to ${target.label}: players arrive at ${arrive.x}, ${arrive.y} there.` : `Linked to ${target.label}. No signpost there links back yet, so the arm has no arrival point; type one in, or work it out once one does.`);
  }
  /** Stand a post on its floor (PHY-009), and work out again the arms that land on this street. */
  function settlePost(post) {
    const zone = S.session?.zone;
    if (!zone) return;
    const { ops } = settlePostOps(zone, { street: S.streetKey, ids: [post.id] });
    if (!ops.length) return say(`${post.id} already stands on its floor.`);
    const work = JSON.parse(JSON.stringify(zone));
    applyOps(work, ops);
    const arrive = arrivalOps(work, { into: S.streetKey });
    commit([...ops, ...arrive.ops], 'settle');
    say(`${post.id} stands on the floor${arrive.arms.length ? `; ${arrive.arms.length === 1 ? 'one arm lands' : `${arrive.arms.length} arms land`} there again` : ''}.`);
  }
  async function workOutArrive(post, at) {
    const c = post.connects[at];
    let arrive = null;
    try { arrive = arriveFor(await targetStreet(targetOf(c.tsid)), street().tsid); } catch { arrive = null; }
    if (!arrive) return say('No signpost on that street links back here with a floor near it, so there is no arrival point to work out.', 'bad');
    commit([{ op: 'connect.set', street: S.streetKey, signpost: post.id, at, set: { arrive } }], 'arrive');
    say(`Arrival set to ${arrive.x}, ${arrive.y} on the other street.`);
  }
  function buildArms(s, post, add, dis) {
    const arms = post.connects || [];
    add(el('h3', { class: 'builder-h3', text: `Arms (${arms.length})` }));
    if (!arms.length) add(el('p', { class: 'builder-sub', text: 'A signpost with no arm is not drawn in the game. Add one below.' }));
    arms.forEach((c, at) => {
      const meta = targetOf(c.tsid);
      const setArm = (patch, unset = []) => commit([{ op: 'connect.set', street: S.streetKey, signpost: post.id, at, set: patch, ...(unset.length ? { unset } : {}) }], 'arm');
      const label = el('input', { type: 'text', name: `arm-label-${at}`, value: c.label, maxlength: '48', ...dis });
      label.addEventListener('change', () => { const v = label.value.trim(); if (v && v !== c.label) setArm({ label: v }); });
      const hid = el('input', { type: 'checkbox', name: `arm-hidden-${at}`, checked: c.hidden ? true : null, ...dis });
      hid.addEventListener('change', () => (hid.checked ? setArm({ hidden: true }) : setArm({}, ['hidden'])));
      const ax = el('input', { type: 'number', name: `arm-ax-${at}`, value: c.arrive ? String(c.arrive.x) : '', step: '1', placeholder: 'none', ...dis });
      const ay = el('input', { type: 'number', name: `arm-ay-${at}`, value: c.arrive ? String(c.arrive.y) : '', step: '1', placeholder: 'none', ...dis });
      const setArrive = () => {
        if (ax.value === '' && ay.value === '') { if (c.arrive) setArm({}, ['arrive']); return; }
        const x = Number(ax.value);
        const y = Number(ay.value);
        if (ax.value !== '' && ay.value !== '' && Number.isFinite(x) && Number.isFinite(y)) setArm({ arrive: { x: Math.round(x), y: Math.round(y) } });
      };
      ax.addEventListener('change', setArrive);
      ay.addEventListener('change', setArrive);
      const work = btn('Work it out', { class: 'builder-mini', name: `arm-work-${at}`, ...dis, title: 'Where the signpost on that street that links back here stands' });
      work.addEventListener('click', () => workOutArrive(post, at));
      const drop = btn('Remove arm', { class: 'builder-mini', name: `arm-remove-${at}`, ...dis });
      drop.addEventListener('click', () => commit([{ op: 'connect.remove', street: S.streetKey, signpost: post.id, at }], 'arm'));
      // A road out to a shipped street: offer the way back in (an edit on that street).
      const shippedKey = S.mode === 'draft' && !meta.key ? resolveIndexTsid(c.tsid) : null;
      const back = shippedKey && !(S.session.zone.edits || []).some((e) => editsOn([e], shippedKey).length && [e.connect, ...(e.newSignpost?.connects || [])].some((x) => x?.tsid === s.tsid))
        ? btn(`Add the way back on ${meta.label}`, { class: 'builder-mini', name: `arm-back-${at}`, title: 'Opens that street: pick a signpost there and add a way into this draft' })
        : null;
      back?.addEventListener('click', async () => {
        await openShipped(shippedKey);
        say(`Pick a signpost on ${meta.label} (geometry or the Signposts list), then "Add a way in" in the inspector. Your draft stays chosen.`);
      });
      add(el('fieldset', { class: 'builder-fieldset builder-arm', 'data-arm': String(at) },
        el('legend', { text: `To ${meta.label}` }),
        el('p', { class: 'builder-sub', text: `${c.tsid}${meta.hub ? ` · ${meta.hub}` : ''}${c.hub_id ? ` · hub ${c.hub_id}` : ''}` }),
        field('Label on the arm', label),
        el('label', { class: 'builder-check' }, hid, ' Hidden (the game leaves it off the post)'),
        el('div', { class: 'builder-grid' }, field('Arrive x', ax), field('Arrive y', ay)),
        el('p', { class: 'builder-sub', text: 'Where players land on that street, in its screen px.' }),
        el('div', { class: 'builder-row builder-wrap' }, work, drop, back)));
    });
    if (dis.disabled) return;
    if (arms.length >= 8) return add(el('p', { class: 'builder-sub', text: 'Eight arms is the most a signpost holds.' }));
    if (arms.filter((c) => !c.hidden).length >= SIGN_ARMS_SHOWN) add(el('p', { class: 'builder-sub builder-warn', text: `The game draws a signpost's first ${SIGN_ARMS_SHOWN} arms; another one will not show. Use a second signpost.` }));
    const search = el('input', { type: 'search', name: 'arm-search', 'aria-label': 'Street to link to', placeholder: 'Street to link to', autocomplete: 'off', spellcheck: 'false' });
    const results = el('ul', { class: 'builder-results builder-arm-results', 'aria-label': 'Streets to link to' });
    const fill = async () => {
      const found = await armTargets(search.value);
      results.replaceChildren(...found.map((t) => el('li', {}, el('button', {
        type: 'button',
        class: 'builder-result',
        onclick: () => addArm(post, t),
      }, el('b', { text: t.label }), el('span', { class: 'builder-sub', text: ` ${t.hub || ''} · ${t.tsid}` })))));
    };
    search.addEventListener('input', fill);
    add(el('h3', { class: 'builder-h3', text: 'Add an arm' }), search, results);
  }

  // —— Ways into a draft from a shipped street (edits[], spec 4 and 11) ——
  /**
   * On a shipped street's signpost, with a draft chosen: the arms the draft adds to it (removable)
   * and a way to add one into each of the draft's streets. The arrival is where that street's
   * signpost leading back here stands; without one the arm has none yet (NAV-002 says so).
   */
  function buildWaysIn(s, post, add) {
    const zone = S.session.zone;
    const mine = (zone.edits || []).map((e, at) => ({ e, at })).filter(({ e }) => editsOn([e], s.tsid).length && e.op === 'add-connect' && e.signpost === post.id);
    add(el('h3', { class: 'builder-h3', text: `Ways into ${zone.title} (${mine.length})` }),
      el('p', { class: 'builder-sub', text: 'Arms this draft adds to this shipped signpost. The shipped file is never changed; publishing adds them.' }));
    for (const { e, at } of mine) {
      const drop = btn('Remove', { class: 'builder-mini', 'data-builder-edit-remove': String(at) });
      drop.addEventListener('click', () => commitZone([{ op: 'edit.remove', at }], 'way in'));
      add(el('div', { class: 'builder-row builder-arm-in', 'data-builder-way-in': String(at) },
        el('span', { text: `To ${e.connect.label}${e.connect.arrive ? `, arriving at ${e.connect.arrive.x}, ${e.connect.arrive.y}` : ', no arrival yet'}` }), drop));
    }
    const targets = zone.streets.filter((r) => !mine.some(({ e }) => e.connect.tsid === r.street.tsid));
    if (!targets.length) return;
    // The game draws a signpost's first four arms (street-render.js): a fifth would not show.
    if ((post.connects || []).filter((c) => !c.hidden).length >= SIGN_ARMS_SHOWN) {
      add(el('p', { class: 'builder-sub builder-warn', 'data-builder-post-full': '', text: `This signpost already shows ${SIGN_ARMS_SHOWN} arms, the most the game draws. Pick another signpost on ${s.label}.` }));
      return;
    }
    const pick = el('select', { name: 'way-in-street', 'aria-label': 'Draft street the arm leads to' }, ...targets.map((r) => el('option', { value: r.key }, r.street.label)));
    const go = btn('Add a way in', { class: 'builder-mini builder-primary', 'data-builder-way-in-add': '' });
    go.addEventListener('click', () => {
      const r = zone.streets.find((x) => x.key === pick.value);
      if (!r) return;
      const arrive = arriveFor(r.street, s.tsid);
      commitZone([{ op: 'edit.add', edit: linkEdit({ shippedTsid: S.viewTsid, signpost: post.id, target: { tsid: r.street.tsid, label: r.street.label, hubId: r.street.hubId }, arrive }) }], 'way in');
      say(arrive ? `${s.label} now leads to ${r.street.label}, arriving at ${arrive.x}, ${arrive.y}.` : `${s.label} now leads to ${r.street.label}. Give ${r.street.label} a signpost with an arm back to ${s.label}, then add this again to set where players arrive.`);
    });
    add(el('div', { class: 'builder-row builder-wrap' }, pick, go));
  }

  // —— Sky and layer filters (street.set gradient, layer.set filters), previewed live ——
  function buildSkyAndFilters(s, layer, add) {
    const ro = !editable();
    const dis = ro ? { disabled: true } : {};
    const grad = s.gradient || null;
    const top = el('input', { type: 'color', name: 'sky-top', value: colourInput(grad?.top || '87A8C9'), ...dis });
    const bottom = el('input', { type: 'color', name: 'sky-bottom', value: colourInput(grad?.bottom || 'FFE7A0'), ...dis });
    const preview = () => {
      S.streetPatch = { ...(S.streetPatch || {}), gradient: { top: colourHex(top.value), bottom: colourHex(bottom.value) } };
      remountSoon();
    };
    const commitSky = () => {
      const g = { top: colourHex(top.value), bottom: colourHex(bottom.value) };
      S.streetPatch = null;
      if (grad && grad.top === g.top && grad.bottom === g.bottom) return remountSoon(0);
      commit([{ op: 'street.set', street: S.streetKey, set: { gradient: g } }], 'sky');
    };
    for (const i of [top, bottom]) {
      i.addEventListener('input', preview);
      i.addEventListener('change', commitSky);
    }
    add(el('h3', { class: 'builder-h3', text: 'Sky and layer filters' }),
      el('div', { class: 'builder-grid' }, field('Sky top', top), field('Sky bottom', bottom)),
      grad ? null : el('p', { class: 'builder-sub', text: 'No sky gradient yet: picking a colour adds one.' }));
    if (!layer) return;
    const f = layer.filters || {};
    const sliders = [['brightness', 'Brightness', -100, 100], ['contrast', 'Contrast', -100, 100], ['saturation', 'Saturation', -100, 100], ['tintAmount', 'Tint amount', 0, 100], ['blur', 'Blur', 0, 100]];
    const values = { ...f };
    const previewFilters = () => {
      let next = layer.filters || null;
      for (const k of FILTER_KEYS) next = filtersWith(next, k, values[k]);
      S.streetPatch = { ...(S.streetPatch || {}), filters: { ...(S.streetPatch?.filters || {}), [layer.id]: next } };
      remountSoon();
      return next;
    };
    const commitFilters = () => {
      const next = previewFilters();
      S.streetPatch = null;
      if (JSON.stringify(next) === JSON.stringify(layer.filters || null)) return remountSoon(0);
      commit([{ op: 'layer.set', street: S.streetKey, layer: layer.id, ...(next ? { set: { filters: next } } : { unset: ['filters'] }) }], 'filters');
    };
    const rows = sliders.map(([k, label, min, max]) => {
      const out = el('output', { class: 'builder-out', text: String(f[k] ?? 0) });
      const input = el('input', { type: 'range', name: `filter-${k}`, min: String(min), max: String(max), step: '1', value: String(f[k] ?? 0), ...dis });
      input.addEventListener('input', () => { values[k] = Number(input.value); out.textContent = input.value; previewFilters(); });
      input.addEventListener('change', commitFilters);
      return el('label', { class: 'builder-range' }, el('span', { text: label }), input, out);
    });
    const tint = el('input', { type: 'color', name: 'filter-tintColor', value: tintInput(f.tintColor), ...dis });
    tint.addEventListener('input', () => { values.tintColor = tintNumber(tint.value); previewFilters(); });
    tint.addEventListener('change', commitFilters);
    const reset = btn('No filters', { class: 'builder-mini', ...dis, title: 'Clear this layer\'s filters' });
    reset.addEventListener('click', () => { if (layer.filters) commit([{ op: 'layer.set', street: S.streetKey, layer: layer.id, unset: ['filters'] }], 'filters'); });
    add(el('p', { class: 'builder-sub', text: `Filters on ${layer.name || layer.id} (pick a layer on the left).` }),
      ...rows, field('Tint colour', tint), el('div', { class: 'builder-row' }, reset));
  }

  // —— Pointer ——
  const pointer = (e) => {
    const r = canvas.getBoundingClientRect();
    return { cx: e.clientX - r.left, cy: e.clientY - r.top };
  };
  function handleAt(cx, cy) {
    if (S.selected.length !== 1 || !editable()) return null;
    const [layer, deco] = decoOf(S.selected[0]);
    if (!layer || S.locked.has(layer.id)) return null;
    const box = boxOf(layer, deco);
    for (const h of handlePoints(box, S.cam.zoom)) {
      const c = toCanvas(h);
      if (Math.abs(c.x - cx) <= HANDLE_PX && Math.abs(c.y - cy) <= HANDLE_PX) return { handle: h, layer, deco, box };
    }
    return null;
  }
  /** The handle of the one selected piece of geometry under a canvas point. */
  function geoHandleAt(cx, cy) {
    if (S.geoSel.length !== 1 || !editable()) return null;
    const [g] = geoSelected();
    if (!g) return null;
    for (const h of geoHandles(street(), g.kind, geoShown(g.kind, g.item), S.cam.zoom)) {
      const c = toCanvas(h);
      if (Math.abs(c.x - cx) <= HANDLE_PX && Math.abs(c.y - cy) <= HANDLE_PX) return { ...g, handle: h.id };
    }
    return null;
  }
  /** A guide near a canvas point (while rulers and guides are shown). */
  function guideAt(cx, cy) {
    const s = street();
    if (!S.overlays.rulers || !s) return null;
    return S.guides.find((g) => {
      const c = toCanvas({ x: g.at - s.bounds.l, y: g.at - s.bounds.t });
      return g.axis === 'x' ? Math.abs(c.x - cx) <= 4 : Math.abs(c.y - cy) <= 4;
    }) || null;
  }
  /** A screen point on the grid and pulled to guides (snapping), in screen space. */
  function snapScreen(p) {
    const s = street();
    if (!s) return p;
    const w = snapPoint({ x: p.x + s.bounds.l, y: p.y + s.bounds.t }, { grid: S.snap.grid, guides: S.overlays.rulers ? S.guides : [], radius: S.snap.on ? GUIDE_PX / S.cam.zoom : 0 });
    return { x: w.x - s.bounds.l, y: w.y - s.bounds.t };
  }
  const mods = (e) => ({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    const { cx, cy } = pointer(e);
    const p = toWorld(cx, cy);
    S.pointer = { cx, cy, ...mods(e) };
    canvas.setPointerCapture(e.pointerId);
    if (S.space || e.button === 1) {
      S.drag = { kind: 'pan', cx, cy, cam: { ...S.cam } };
      return;
    }
    if (e.button !== 0) return;
    // A draw tool: drag out the new thing (S: a click stands a post on the floor).
    if (S.tool !== 'select') {
      if (!editable()) { setTool('select'); return; }
      const at = snapScreen(p);
      S.drag = { kind: 'draw', tool: S.tool, from: at, to: at };
      return;
    }
    const gh = geoHandleAt(cx, cy);
    if (gh) {
      const at = handleWorld(gh.kind, gh.item, gh.handle);
      const skip = new Set([gh.key]);
      // The ends joined to this one (Ctrl/Cmd brings them along).
      const joined = gh.kind === 'platform' || gh.kind === 'barrier' ? joinedEnds(street(), at, skip) : [];
      S.drag = { kind: 'geo-handle', from: p, g: gh, joined, moved: false };
      return;
    }
    const h = handleAt(cx, cy);
    if (h) {
      S.drag = { kind: h.handle.id === 'rotate' ? 'rotate' : 'resize', from: p, ...h };
      return;
    }
    const guide = guideAt(cx, cy);
    if (guide) {
      S.drag = { kind: 'guide', guide };
      return;
    }
    // Geometry wins over decos, platforms over the rest (LocoDeco); Alt+click cycles through all.
    const geo = geoHitsAt(p);
    const decos = hitsAt(p, { all: e.altKey });
    let pick = e.altKey ? null : geo[0] || decos[0] || null;
    if (e.altKey) {
      const all = [...geo, ...decos];
      const current = S.geoSel.length === 1 ? S.geoSel[0] : S.selected.length === 1 ? S.selected[0] : null;
      pick = all.length ? all[(all.indexOf(current) + 1) % all.length] : null;
    }
    if (pick && parseGeoKey(pick)) {
      if (e.shiftKey) {
        selectGeo(S.geoSel.includes(pick) ? S.geoSel.filter((k) => k !== pick) : [...S.geoSel, pick]);
        return;
      }
      if (!S.geoSel.includes(pick)) selectGeo([pick]);
      if (editable()) S.drag = { kind: 'geo-move', from: p, keys: [...S.geoSel], moved: false };
      return;
    }
    if (pick) {
      if (e.shiftKey) {
        select(S.selected.includes(pick) ? S.selected.filter((x) => x !== pick) : [...S.selected, pick]);
        return;
      }
      if (!S.selected.includes(pick)) select([pick]);
      if (editable()) S.drag = { kind: 'move', from: p, ids: S.selected.filter((x) => !S.locked.has(decoOf(x)[0]?.id)), moved: false };
      return;
    }
    S.drag = { kind: 'marquee', from: p, to: p, add: e.shiftKey };
  });

  /** Move a signpost's sprite and a ladder's tiles with a drag (the street is drawn again on release). */
  function previewSprites(kind, item, shown) {
    const s = street();
    if (kind === 'signpost') {
      const g = S.view?.signById?.get(item.id);
      if (g && !g.destroyed) {
        g.x = shown.x - s.bounds.l;
        g.y = shown.y - s.bounds.t;
      }
    } else if (kind === 'ladder') {
      const mg = containerOf('middleground');
      for (const spr of mg?.children || []) {
        if (spr.glitchLadderId !== item.id || spr.destroyed) continue;
        spr.ladderX ??= spr.x;
        spr.ladderY ??= spr.y;
        spr.x = spr.ladderX + (shown.x - item.x);
        spr.y = spr.ladderY + (shown.y - item.y);
      }
    }
  }

  /** Follow the pointer in a drag (also each frame while the view pans at its edge). */
  function dragMove(cx, cy, m) {
    const d = S.drag;
    if (!d) return;
    const s = street();
    const p = toWorld(cx, cy);
    if (d.kind === 'pan') {
      S.cam.x = d.cam.x - (cx - d.cx) / S.cam.zoom;
      S.cam.y = d.cam.y - (cy - d.cy) / S.cam.zoom;
      saveCamera();
    } else if (d.kind === 'move') {
      let dx = Math.round(p.x - d.from.x);
      let dy = Math.round(p.y - d.from.y);
      d.moved = d.moved || Math.abs(dx) + Math.abs(dy) > 1;
      if (!d.moved) return;
      // The grid and guides pull the first deco's anchor (middleground: the street's own px).
      const [l0, d0] = decoOf(d.ids[0]);
      if (l0 && !isLayerLocal(l0) && (S.snap.grid || (S.snap.on && S.guides.length))) {
        const at = snapScreen(worldToScreen(s, d0.x + dx, d0.y + dy));
        dx = Math.round(at.x + s.bounds.l - d0.x);
        dy = Math.round(at.y + s.bounds.t - d0.y);
      }
      for (const id of d.ids) {
        const [layer, deco] = decoOf(id);
        S.preview.set(id, { x: deco.x + dx, y: deco.y + dy });
        syncSprite(layer, deco);
      }
    } else if (d.kind === 'resize') {
      const next = resizeBy(s, d.layer, d.deco, d.box, d.handle, d.from, p, { keepAspect: m.shift, offset: offsetOf(d.layer.id) });
      S.preview.set(d.deco.id, next);
      syncSprite(d.layer, d.deco);
    } else if (d.kind === 'rotate') {
      S.preview.set(d.deco.id, { r: rotationTo(d.box, p, m.shift ? 15 : 1) });
      syncSprite(d.layer, d.deco);
    } else if (d.kind === 'marquee') {
      d.to = p;
    } else if (d.kind === 'draw') {
      d.to = snapScreen(p);
    } else if (d.kind === 'guide') {
      d.guide.at = Math.round(d.guide.axis === 'x' ? p.x + s.bounds.l : p.y + s.bounds.t);
      d.off = d.guide.axis === 'x' ? cx < RULER_PX : cy < RULER_PX;
    } else if (d.kind === 'geo-move') {
      let dx = Math.round(p.x - d.from.x);
      let dy = Math.round(p.y - d.from.y);
      d.moved = d.moved || Math.abs(dx) + Math.abs(dy) > 1;
      if (!d.moved) return;
      const first = parseGeoKey(d.keys[0]);
      const item0 = first && geoOf(first.kind, first.id);
      if (item0 && (S.snap.grid || (S.snap.on && S.guides.length))) {
        const ref = handleWorld(first.kind, item0, first.kind === 'platform' ? 'p1' : first.kind === 'barrier' ? 'top' : 'bottom');
        const at = snapScreen({ x: ref.x + dx - s.bounds.l, y: ref.y + dy - s.bounds.t });
        dx = Math.round(at.x + s.bounds.l - ref.x);
        dy = Math.round(at.y + s.bounds.t - ref.y);
      }
      d.dx = dx;
      d.dy = dy;
      for (const key of d.keys) {
        const g = parseGeoKey(key);
        const item = g && geoOf(g.kind, g.id);
        if (!item) continue;
        const next = moveBy(g.kind, item, dx, dy);
        S.geoPreview.set(key, next);
        previewSprites(g.kind, item, { ...item, ...next });
      }
    } else if (d.kind === 'geo-handle') {
      handleDrag(d, p, m, false);
    }
  }

  /**
   * A handle drag: the dragged item's new fields, then (on release, with snapping on) a platform
   * end pulled onto an end within 30 px, then the joined ends brought along when Ctrl/Cmd is held.
   */
  function handleDrag(d, p, m, release) {
    const s = street();
    const { kind, item, handle, key } = d.g;
    // The end goes where the pointer took it, then the grid and guides pull the end itself.
    const start = handleWorld(kind, item, handle);
    const startScreen = { x: start.x - s.bounds.l, y: start.y - s.bounds.t };
    const aim = snapScreen({ x: startScreen.x + (p.x - d.from.x), y: startScreen.y + (p.y - d.from.y) });
    d.moved = d.moved || Math.abs(p.x - d.from.x) + Math.abs(p.y - d.from.y) > 1;
    if (!d.moved) return;
    const next = kind === 'signpost'
      ? dragHandle(s, kind, item, handle, d.from, p, { level: m.shift })
      : dragHandle(s, kind, item, handle, startScreen, aim, { level: m.shift });
    if (release && S.snap.on && kind === 'platform') {
      const skip = new Set([key, ...(m.ctrl ? d.joined.map((j) => geoKey(j.kind, j.id)) : [])]);
      Object.assign(next, snapPlatform({ ...item, ...next }, endPoints(s, skip), [handle]));
    }
    S.geoPreview.set(key, next);
    previewSprites(kind, item, { ...item, ...next });
    // Joined ends follow the dragged end by the same amount (Ctrl/Cmd held).
    const moved = handleWorld(kind, { ...item, ...next }, handle);
    const ddx = moved.x - start.x;
    const ddy = moved.y - start.y;
    for (const j of d.joined) {
      const jkey = geoKey(j.kind, j.id);
      if (!m.ctrl) { S.geoPreview.delete(jkey); continue; }
      const other = geoOf(j.kind, j.id);
      if (!other) continue;
      const prev = S.geoPreview.get(jkey) || {};
      let set;
      if (j.kind === 'platform') set = j.end === 'p1' ? { x1: other.x1 + ddx, y1: other.y1 + ddy } : { x2: other.x2 + ddx, y2: other.y2 + ddy };
      else if (j.end === 'top') set = { x: other.x + ddx, y: other.y + ddy, h: other.h - ddy };
      else set = { x: other.x + ddx, h: other.h + ddy };
      S.geoPreview.set(jkey, { ...prev, ...set });
    }
  }

  canvas.addEventListener('pointermove', (e) => {
    const { cx, cy } = pointer(e);
    S.pointer = { cx, cy, ...mods(e) };
    if (!S.drag) {
      const gh = geoHandleAt(cx, cy);
      const dh = !gh && handleAt(cx, cy);
      canvas.style.cursor = gh ? (gh.kind === 'barrier' || gh.handle === 'height' ? 'ns-resize' : gh.kind === 'signpost' ? 'nwse-resize' : 'move')
        : dh ? (dh.handle.id === 'rotate' ? 'grab' : 'nwse-resize')
          : S.space ? 'grab' : S.tool !== 'select' ? 'crosshair' : guideAt(cx, cy) ? (guideAt(cx, cy).axis === 'x' ? 'ew-resize' : 'ns-resize') : 'default';
      return;
    }
    dragMove(cx, cy, S.pointer);
  });
  canvas.addEventListener('pointerleave', () => { if (!S.drag) { S.pointer = null; S.arcs = null; } });

  function endDrag() {
    const d = S.drag;
    S.drag = null;
    if (!d) return;
    const s = street();
    if (d.kind === 'marquee') {
      const rect = { x1: d.from.x, y1: d.from.y, x2: d.to.x, y2: d.to.y };
      if (Math.abs(rect.x2 - rect.x1) + Math.abs(rect.y2 - rect.y1) < 3) {
        if (!d.add) select([]);
        return;
      }
      const layer = layerOf(S.activeLayer);
      if (!layer || S.locked.has(layer.id)) return;
      const ids = layer.decos.filter((x) => !x.hidden && meetsRect(boxOf(layer, x), rect)).map((x) => x.id);
      select(ids, { add: d.add });
      return;
    }
    if (d.kind === 'pan') return;
    if (d.kind === 'guide') {
      if (d.off) S.guides = S.guides.filter((g) => g !== d.guide);
      saveGuides();
      return;
    }
    if (d.kind === 'draw') {
      let item = drawnItem(s, d.tool, d.from, d.to, { level: Boolean(S.pointer?.shift) });
      if (!item && d.tool === 'signpost') item = postOnFloor(s, d.from);
      if (!item) return say(`Drag to draw a ${GEO_WORDS[d.tool].toLowerCase()}.`);
      if (d.tool === 'platform' && S.snap.on) item = snapDrawnPlatform(item, endPoints(s));
      addGeometry([[d.tool, item]], 'draw');
      return;
    }
    if (d.kind === 'geo-move' || d.kind === 'geo-handle') {
      if (d.kind === 'geo-handle' && d.moved && S.pointer) handleDrag(d, toWorld(S.pointer.cx, S.pointer.cy), S.pointer, true);
      if (d.kind === 'geo-move' && d.moved && S.snap.on) {
        // A moved line joins up: the shortest pull onto an end within 30 px, for the whole group.
        const skip = new Set(d.keys);
        const ends = endPoints(s, skip);
        const pts = d.keys.map(parseGeoKey).filter((g) => g?.kind === 'platform').flatMap((g) => {
          const v = S.geoPreview.get(geoKey(g.kind, g.id));
          return v ? [{ x: v.x1, y: v.y1 }, { x: v.x2, y: v.y2 }] : [];
        });
        const pull = pts.length ? bestPull(pts, ends) : null;
        if (pull) {
          for (const key of d.keys) {
            const g = parseGeoKey(key);
            const item = geoOf(g.kind, g.id);
            if (item) S.geoPreview.set(key, moveBy(g.kind, item, (d.dx || 0) + pull.dx, (d.dy || 0) + pull.dy));
          }
        }
      }
      const changes = [...S.geoPreview].map(([key, v]) => {
        const g = parseGeoKey(key);
        const item = g && geoOf(g.kind, g.id);
        return item ? [g.kind, item, v] : null;
      }).filter(Boolean);
      S.geoPreview.clear();
      const ops = geoSetOps(changes);
      if (ops.length) commit(ops, d.kind === 'geo-move' ? 'move' : 'resize');
      else if (d.moved) remountSoon(0);
      S.version += 1;
      return;
    }
    // Decos: middleground decos dropped near a floor sit on it (snapping).
    if (d.kind === 'move' && d.moved && S.snap.on) {
      for (const [id, v] of S.preview) {
        const [layer] = decoOf(id);
        if (layer?.id !== 'middleground') continue;
        const y = floorSnapY(s, v.x, v.y, SNAP_PX);
        if (y != null) v.y = y;
      }
    }
    const changes = [...S.preview].map(([id, v]) => [id, Object.fromEntries(Object.entries(v).filter(([k, val]) => decoOf(id)[1]?.[k] !== val))]);
    S.preview.clear();
    if (changes.length) commit(setOps(changes), d.kind);
    else refresh(S.selected.map((id) => `${S.streetKey}/${id}`));
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => {
    for (const id of S.preview.keys()) {
      const [layer, deco] = decoOf(id);
      S.preview.delete(id);
      if (layer) syncSprite(layer, deco);
    }
    if (S.geoPreview.size) {
      S.geoPreview.clear();
      remountSoon(0);
    }
    S.drag = null;
  });

  // Rulers: drag from one to add a guide; drag a guide back onto its ruler to remove it.
  for (const [r, axis] of [[rulerTop, 'y'], [rulerLeft, 'x']]) {
    r.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !street()) return;
      const { cx, cy } = pointer(e);
      const s = street();
      const p = toWorld(cx, cy);
      const guide = { axis, at: Math.round(axis === 'x' ? p.x + s.bounds.l : p.y + s.bounds.t) };
      S.guides.push(guide);
      S.drag = { kind: 'guide', guide, off: true };
      S.pointer = { cx, cy, ...mods(e) };
      r.setPointerCapture(e.pointerId);
    });
    r.addEventListener('pointermove', (e) => {
      const { cx, cy } = pointer(e);
      S.pointer = { cx, cy, ...mods(e) };
      dragMove(cx, cy, S.pointer);
    });
    r.addEventListener('pointerup', endDrag);
  }
  const guidesKey = () => `groddle.builder.guides:${S.mode === 'draft' ? `${S.session?.id}/${S.streetKey}` : S.viewTsid}`;
  function saveGuides() {
    store.set(guidesKey(), S.guides.map(({ axis, at }) => ({ axis, at })));
  }
  function loadGuides() {
    const g = store.get(guidesKey(), []);
    S.guides = Array.isArray(g) ? g.filter((x) => (x?.axis === 'x' || x?.axis === 'y') && Number.isFinite(x.at)).slice(0, 50) : [];
  }
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { cx, cy } = pointer(e);
    if (e.ctrlKey || e.metaKey) {
      setZoom(zoomAfter(S.cam.zoom, e.deltaY), { x: cx, y: cy });
    } else {
      S.cam.x += (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) / S.cam.zoom;
      S.cam.y += (e.shiftKey && !e.deltaX ? 0 : e.deltaY) / S.cam.zoom;
      saveCamera();
    }
  }, { passive: false });

  // —— Keys ——
  const keySheet = el('dialog', { class: 'builder-dialog', 'aria-labelledby': 'builder-keys-title' },
    el('h2', { id: 'builder-keys-title', text: 'Keys' }),
    el('dl', { class: 'builder-keys' }, ...[
      ['Click, Shift+click, Alt+click', 'Select (lines, walls, ladders and signposts before decos), add or remove, cycle through everything under the pointer'],
      ['Drag on empty space', 'Select with a box on the active layer'],
      ['V, Q, W, E, S', 'Select; draw a platform, a wall, a ladder; a signpost (click to stand one on the floor, or drag its size)'],
      ['Shift while drawing or dragging a line end', 'Keep the line level'],
      ['Ctrl/Cmd while dragging an end', 'Bring the ends joined to it along'],
      ['; (semicolon)', 'Snapping on or off: line ends within 30 px, middleground decos onto the floor, guides'],
      ['G', 'The 10 px grid on or off'],
      ['Drag from a ruler', 'Add a guide (Overlays, Rulers and guides); drag it back onto the ruler to remove it'],
      ['Ctrl/Cmd+A, with Shift', 'Select the active layer, every layer'],
      ['Arrows', 'Move 5 px; Shift 20; Alt 1'],
      ['R with Left or Right', 'Rotate 1°; Shift 15°'],
      ['H', 'Flip'],
      ['Ctrl/Cmd+] and [ (or Up and Down)', 'Bring forward, send back; with Shift, to the front or back'],
      ['Alt+Up, Alt+Down', 'Move to the layer in front or behind, staying where it appears'],
      ['Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z', 'Undo, redo'],
      ['Ctrl/Cmd+C, X, V, Shift+V', 'Copy, cut, paste at the view centre, paste in place'],
      ['Delete', 'Delete'],
      ['Esc', 'Leave a draw tool; put the selection back as it was; again to deselect'],
      ['Space+drag, wheel, Ctrl/Cmd+wheel', 'Pan, pan, zoom'],
      ['0, 1', 'Fit the street, 100%'],
      ['L', 'Lock the active layer'],
      ['D', 'The deco picker: type to search, Down into the results, Enter places at the view centre; or drag one onto the street'],
      ['P', 'Play-test from the view centre'],
      ['Ctrl/Cmd+S', 'Save now'],
      ['?', 'This sheet'],
    ].flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
    el('form', { method: 'dialog' }, el('button', { class: 'builder-btn', text: 'Close' })));
  root.append(keySheet);
  keysBtn.addEventListener('click', () => keySheet.showModal());

  document.addEventListener('keydown', (e) => {
    if (e.target?.closest?.('input, select, textarea, dialog, [contenteditable]')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (k === ' ') { S.space = true; if (e.target === canvas || e.target === document.body) e.preventDefault(); return; }
    if (k === 'r' || k === 'R') { if (!mod) S.rKey = true; }
    if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) S.session?.redo(); else S.session?.undo(); return; }
    if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); S.session?.redo(); return; }
    if (mod && (k === 's' || k === 'S')) { e.preventDefault(); S.session?.flush().then(() => say('Saved.')); return; }
    if (mod && (k === 'a' || k === 'A')) {
      e.preventDefault();
      const s = street();
      if (!s) return;
      const layers = e.shiftKey ? s.layers : [layerOf(S.activeLayer)].filter(Boolean);
      select(layers.filter((l) => !S.locked.has(l.id) && !S.hidden.has(l.id)).flatMap((l) => l.decos.map((d) => d.id)));
      return;
    }
    if (mod && (k === 'c' || k === 'C')) { e.preventDefault(); copy(false); return; }
    if (mod && (k === 'x' || k === 'X')) { e.preventDefault(); copy(true); return; }
    if (mod && (k === 'v' || k === 'V')) { e.preventDefault(); paste(e.shiftKey); return; }
    if (mod && (k === ']' || k === 'ArrowUp')) { e.preventDefault(); zOrder(1, e.shiftKey); return; }
    if (mod && (k === '[' || k === 'ArrowDown')) { e.preventDefault(); zOrder(-1, e.shiftKey); return; }
    if (mod) return;
    if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); moveLayer(k === 'ArrowUp' ? 1 : -1); return; }
    if (k.startsWith('Arrow') && (S.selected.length || S.geoSel.length)) {
      e.preventDefault();
      if (S.rKey && S.selected.length && (k === 'ArrowLeft' || k === 'ArrowRight')) { rotate((k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 15 : 1)); return; }
      const n = nudgeStep(e);
      nudge(k === 'ArrowLeft' ? -n : k === 'ArrowRight' ? n : 0, k === 'ArrowUp' ? -n : k === 'ArrowDown' ? n : 0);
      return;
    }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); remove(); return; }
    if (k === 'Escape') {
      if (S.drag?.kind === 'draw') { S.drag = null; return; }
      if (S.tool !== 'select') { setTool('select'); return; }
      if (!revertSelection()) select([]);
      else { S.revertTo = null; S.geoRevert = null; }
      return;
    }
    const tools = { v: 'select', q: 'platform', w: 'barrier', e: 'ladder', s: 'signpost' };
    if (!e.altKey && tools[k.toLowerCase()]) { setTool(tools[k.toLowerCase()]); return; }
    if (k === ';') { toggleSnap(); return; }
    if (k === 'g' || k === 'G') { toggleGrid(); return; }
    if (k === 'h' || k === 'H') { flip(); return; }
    if (k === '0') { fit(); return; }
    if (k === '1') { setZoom(1); return; }
    if (k === '=' || k === '+') { setZoom(S.cam.zoom * 1.25); return; }
    if (k === '-') { setZoom(S.cam.zoom / 1.25); return; }
    if (k === 'l' || k === 'L') { toggleLock(S.activeLayer); return; }
    if (k === 'p' || k === 'P') { playTest(); return; }
    if (k === 'd' || k === 'D') { e.preventDefault(); if (!panels.left) toggleLeft.click(); picker.open(); return; }
    if (k === '?') { keySheet.showModal(); }
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ') S.space = false;
    if (e.key === 'r' || e.key === 'R') S.rKey = false;
  });

  undoBtn.addEventListener('click', () => S.session?.undo());
  redoBtn.addEventListener('click', () => S.session?.redo());
  zoomIn.addEventListener('click', () => setZoom(S.cam.zoom * 1.25));
  zoomOut.addEventListener('click', () => setZoom(S.cam.zoom / 1.25));
  fitBtn.addEventListener('click', fit);

  // —— Tools, snapping and overlays ——
  for (const b of toolBtns) b.addEventListener('click', () => setTool(b.dataset.tool));
  function toggleSnap() {
    S.snap.on = !S.snap.on;
    store.set(SNAP_KEY, S.snap);
    renderTools();
    say(S.snap.on ? 'Snapping on: line ends join within 30 px, middleground decos sit on the floor, guides pull.' : 'Snapping off.');
  }
  function toggleGrid() {
    S.snap.grid = !S.snap.grid;
    store.set(SNAP_KEY, S.snap);
    renderTools();
    say(S.snap.grid ? 'Grid on: drags land on 10 px steps.' : 'Grid off.');
  }
  snapBtn.addEventListener('click', toggleSnap);
  gridBtn.addEventListener('click', toggleGrid);

  /** A small picture of how the overlay draws a thing (colour and pattern, so not by colour alone). */
  function legend(colour, { dash = false, thick = false, ticks = false, box = false } = {}) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 28 12');
    svg.setAttribute('width', '28');
    svg.setAttribute('height', '12');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('builder-legend');
    // A dark ground, as the overlay draws its lines over a dark outline on the street.
    const ground = document.createElementNS(NS, 'rect');
    for (const [k, v] of Object.entries({ width: 28, height: 12, rx: 3, fill: '#1d2430' })) ground.setAttribute(k, String(v));
    svg.append(ground);
    const shape = document.createElementNS(NS, box ? 'rect' : 'line');
    if (box) for (const [k, v] of Object.entries({ x: 2, y: 1, width: 24, height: 10, fill: 'none' })) shape.setAttribute(k, String(v));
    else for (const [k, v] of Object.entries({ x1: 1, y1: 5, x2: 27, y2: 5 })) shape.setAttribute(k, String(v));
    shape.setAttribute('stroke', hexCss(colour));
    shape.setAttribute('stroke-width', thick ? '4' : '2.5');
    if (dash) shape.setAttribute('stroke-dasharray', '5 3');
    svg.append(shape);
    if (ticks) {
      const t = document.createElementNS(NS, 'path');
      t.setAttribute('d', 'M5 5v4M11 5v4M17 5v4M23 5v4');
      t.setAttribute('stroke', hexCss(colour));
      t.setAttribute('stroke-width', '1.5');
      svg.append(t);
    }
    return svg;
  }
  const keyRow = (svg, text) => el('li', {}, svg, el('span', { text }));
  function overlayCheck(name, label) {
    const input = el('input', { type: 'checkbox', name: `overlay-${name}`, checked: S.overlays[name] ? true : null });
    input.addEventListener('change', () => setOverlay(name, input.checked));
    return el('label', { class: 'builder-check' }, input, ` ${label}`);
  }
  const reachFromBtn = btn('Reach from the view centre', { class: 'builder-mini', title: 'Work the reach map out again from the floor under the view centre' });
  reachFromBtn.addEventListener('click', () => {
    const { w, h } = viewSize();
    S.reachFrom = { x: S.cam.x + w / 2, y: S.cam.y + h / 2 };
    S.reachLocal = null;
    S.reachPinned = true;
    if (!S.overlays.reach) setOverlay('reach', true);
    S.geoDrawn = '';
    ensureLocalReach(true);
  });
  const clearGuidesBtn = btn('Clear guides', { class: 'builder-mini' });
  clearGuidesBtn.addEventListener('click', () => { S.guides = []; saveGuides(); say('Guides cleared.'); });
  const asPlayed = el('input', { type: 'radio', name: 'overlay-parallax', value: 'played', checked: S.overlays.layout ? null : true });
  const asLayout = el('input', { type: 'radio', name: 'overlay-parallax', value: 'layout', checked: S.overlays.layout ? true : null });
  for (const r of [asPlayed, asLayout]) r.addEventListener('change', () => setOverlay('layout', asLayout.checked));
  overlayMenu.append(
    overlayCheck('geometry', 'Geometry'),
    el('ul', { class: 'builder-key' },
      keyRow(legend(COLOURS.Floor), 'Floor'), keyRow(legend(COLOURS.Roof, { ticks: true }), 'Roof (solid from below)'),
      keyRow(legend(COLOURS.Soft, { dash: true }), 'Soft (no collider)'), keyRow(legend(COLOURS.Hard, { thick: true }), 'Hard (both ways)'),
      keyRow(legend(COLOURS.wall, { ticks: true }), 'Wall, ticks on the side it blocks'), keyRow(legend(COLOURS.ladder, { box: true }), 'Ladder'),
      keyRow(legend(COLOURS.post, { box: true }), 'Signpost (dashed: no arm shown)')),
    overlayCheck('reach', 'Reach map'),
    el('ul', { class: 'builder-key' },
      keyRow(legend(COLOURS.reached, { thick: true }), 'Reached from an arrival'), keyRow(legend(COLOURS.unreached, { thick: true }), 'Not reached; a red box is an exit not reached'),
      keyRow(legend(COLOURS.arrival, { box: true }), 'Arrival (hollow: no floor under it)'), keyRow(legend(COLOURS.trap, { thick: true }), 'Trap: reached, with no way to an exit')),
    reachFromBtn,
    overlayCheck('arc', 'Jump arc from the pointer'),
    el('ul', { class: 'builder-key' }, keyRow(legend(COLOURS.plain), 'Standing jump'), keyRow(legend(COLOURS.running), 'Running jump')),
    overlayCheck('populations', 'Populations: the planner\'s spots'),
    el('ul', { class: 'builder-key' }, ...SPOT_GROUPS.map((g) => keyRow(legend(g.colour, { box: true }), g.label))),
    overlayCheck('effects', 'Effects: steam, lava and embers, playing'),
    overlayCheck('frame', 'View frame: Wide 960 by 408 (solid), Original 1000 by 600 (dashed)'),
    overlayCheck('rulers', 'Rulers and guides'),
    clearGuidesBtn,
    el('fieldset', { class: 'builder-fieldset' }, el('legend', { text: 'Parallax' }),
      el('label', { class: 'builder-check' }, asPlayed, ' As played (for this view)'),
      el('label', { class: 'builder-check' }, asLayout, ' Layout (every layer placed for a Wide view at the centre)')),
    overlayCheck('edgePan', 'Pan at the view edge while dragging'));
  function setOverlay(name, on) {
    S.overlays[name] = on;
    store.set(OVERLAYS_KEY, S.overlays);
    const box = overlayMenu.querySelector(`[name="overlay-${name}"]`);
    if (box) box.checked = on;
    if (name === 'layout') { asLayout.checked = on; asPlayed.checked = !on; }
    if (name === 'arc' && on) loadReach();
    if (name === 'arc' && !on) S.arcs = null;
    if (name === 'reach' && on) ensureLocalReach();
    if (name === 'populations') { if (on) loadValidateMod(); renderInspector(); }
    if (name === 'effects') S.fx?.setVisible(on);
    S.geoDrawn = '';
    renderTools();
  }
  function showMenu(open) {
    overlayMenu.hidden = !open;
    overlaysBtn.setAttribute('aria-expanded', String(open));
    if (open) overlayMenu.querySelector('input')?.focus();
  }
  overlaysBtn.addEventListener('click', () => showMenu(overlayMenu.hidden));
  overlayMenu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); showMenu(false); overlaysBtn.focus(); }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!overlayMenu.hidden && !overlayMenu.contains(e.target) && e.target !== overlaysBtn) showMenu(false);
  });

  // —— Reach and the jump arc (js/builder/reach-graph.js, loaded on first use) ——
  async function loadReach() {
    if (S.reachMod) return S.reachMod;
    if (loadReach.p) return loadReach.p;
    loadReach.p = import('./reach-graph.js?v=6f7512af').then((m) => { S.reachMod = m; S.geoDrawn = ''; return m; }).catch(() => {
      say('The reach map could not load.', 'bad');
      return null;
    });
    return loadReach.p;
  }
  const reachKey = () => `${S.mode}:${S.mode === 'draft' ? S.streetKey : S.viewTsid}:${S.version}:${S.reachFrom ? `${Math.round(S.reachFrom.x)},${Math.round(S.reachFrom.y)}` : ''}`;
  /** Arrivals for reach worked out here: the draft row's editor.spawn if any, else the floor under the view centre. */
  function localArrivals(s) {
    const spawn = S.mode === 'draft' ? S.session?.zone.streets.find((r) => r.key === S.streetKey)?.editor?.spawn : null;
    if (spawn && Number.isFinite(spawn.x) && Number.isFinite(spawn.y)) return [{ x: spawn.x, y: spawn.y, from: 'spawn' }];
    const { w, h } = viewSize();
    const at = S.reachFrom || { x: S.cam.x + w / 2, y: S.cam.y + h / 2 };
    S.reachFrom = at;
    const spot = floorUnder(platformsScreen(s), at.x, at.y, isStandable);
    return spot ? [{ x: spot.x, y: spot.y - 1, from: 'view centre' }] : [];
  }
  let reachBusy = false;
  /** Reach worked out here: for a shipped street, or a draft while the validator has none. */
  async function ensureLocalReach(now = false) {
    const s = street();
    if (!s || !S.overlays.reach || reachBusy) return;
    const v = S.validate;
    const fromValidator = v.state === 'idle' || v.state === 'running' || (v.state === 'done' && v.report?.reach?.[S.streetKey]);
    if (S.mode === 'draft' && fromValidator && !now) return;
    if (S.reachLocal?.key === reachKey()) return;
    reachBusy = true;
    try {
      const m = await loadReach();
      const cur = street();
      if (!m || cur !== s) return;
      const arrivals = localArrivals(s);
      const key = reachKey();
      await new Promise((r) => setTimeout(r, 0));
      const t0 = performance.now();
      const data = m.reachStreet(s, arrivals);
      S.reachLocal = { key, data, ms: Math.round(performance.now() - t0) };
      S.geoDrawn = '';
    } catch (err) {
      say(`The reach map did not work out: ${err?.message || err}`, 'bad');
    } finally {
      reachBusy = false;
    }
  }
  function updateArcs() {
    if (!S.overlays.arc || !S.pointer || S.drag || !street()) return;
    if (!S.reachMod) { loadReach(); return; }
    const now = performance.now();
    if (now - S.arcT < 50) return;
    const p = toWorld(S.pointer.cx, S.pointer.cy);
    if (S.arcAt && Math.abs(S.arcAt.x - p.x) + Math.abs(S.arcAt.y - p.y) < 2 && S.arcWorld?.version === S.version) return;
    S.arcT = now;
    S.arcAt = p;
    try {
      if (S.arcWorld?.version !== S.version || S.arcWorld.street !== street()) S.arcWorld = { version: S.version, street: street(), world: S.reachMod.streetWorld(street()) };
      S.arcs = S.reachMod.jumpArcs(street(), p, S.arcWorld.world);
    } catch {
      S.arcs = null;
    }
  }

  // —— The validator (js/builder/validate-worker.js), 400 ms after the last edit ——
  const V = S.validate;
  function validator() {
    if (V.worker) return V.worker;
    if (V.state === 'off' || typeof Worker !== 'function') { V.state = 'off'; return null; }
    // The worker's module URL comes from the module itself, so it carries its content key (a
    // `new URL(...)` written here would not be keyed by tools/module-keys).
    if (!V.workerUrl) {
      if (!V.loading) {
        V.loading = import('./validate-worker.js?v=fa3797a4').then((m) => { V.workerUrl = m.WORKER_URL; V.dataPaths = m.VALIDATOR_DATA; runValidate(); }).catch(() => { V.state = 'off'; ensureLocalReach(); });
      }
      return null;
    }
    try {
      V.worker = new Worker(V.workerUrl, { type: 'module' });
    } catch {
      V.state = 'off';
      return null;
    }
    V.worker.addEventListener('message', (e) => {
      const { id, report, error } = e.data || {};
      if (id !== V.id) return;
      if (error) { V.state = 'failed'; V.error = String(error); } else { V.state = 'done'; V.report = report; }
      S.geoDrawn = '';
      renderValidate();
      renderFindings();
      if (V.state === 'failed') ensureLocalReach();
    });
    V.worker.addEventListener('error', (e) => {
      e.preventDefault?.();
      V.worker?.terminate();
      V.worker = null;
      V.state = 'off';
      V.report = null;
      S.geoDrawn = '';
      renderValidate();
      renderFindings();
      ensureLocalReach();
    });
    return V.worker;
  }
  function scheduleValidate(ms = 400) {
    clearTimeout(V.timer);
    if (S.mode !== 'draft' || !S.session) return;
    V.timer = setTimeout(runValidate, ms);
  }
  /** The shipped streets the zone's arms and edits name (the validator's NAV rules look at them). */
  function shippedNamed(zone) {
    const own = new Set(zone.streets.map((r) => r.street.tsid));
    const out = new Set();
    for (const r of zone.streets) for (const p of r.street.signposts || []) for (const c of p.connects || []) {
      const k = !own.has(c.tsid) && resolveIndexTsid(c.tsid);
      if (k && STREET_INDEX.streets[k]?.file) out.add(k);
    }
    for (const e of zone.edits || []) {
      const k = resolveIndexTsid(e.tsid);
      if (k && STREET_INDEX.streets[k]?.file) out.add(k);
    }
    return [...out];
  }
  function runValidate() {
    if (S.mode !== 'draft' || !S.session) return;
    const named = shippedNamed(S.session.zone);
    const missing = named.filter((k) => !S.shippedStreets.has(k));
    if (missing.length) {
      // Fetch them first (once each), then check.
      Promise.all(missing.map((k) => targetStreet({ tsid: k }).catch(() => null))).then(() => { if (missing.every((k) => S.shippedStreets.has(k))) scheduleValidate(0); });
      return;
    }
    const w = validator();
    if (!w) { if (!V.loading || V.workerUrl) { renderValidate(); renderFindings(); } return; }
    V.id += 1;
    V.state = 'running';
    renderValidate();
    try {
      // The worker fetches the validator's data at the keys the page uses (js/data-urls.js).
      const keyed = globalThis.groddleDataUrl || ((p) => p);
      const urls = Object.fromEntries((V.dataPaths || []).map((p) => [p, new URL(keyed(p), document.baseURI).href]));
      const shipped = Object.fromEntries(named.map((k) => [k, S.shippedStreets.get(k)]));
      w.postMessage({ id: V.id, zone: S.session.zone, urls, shipped });
    } catch (err) {
      V.state = 'failed';
      V.error = err?.message || String(err);
      renderValidate();
    }
  }
  function renderValidate() {
    const on = S.mode === 'draft' && Boolean(S.session);
    validateBtn.hidden = !on;
    findings.hidden = !on;
    validateBtn.textContent = validateWords(V.state, V.report);
    validateBtn.dataset.state = V.state;
    const c = findingCounts(V.report);
    validateBtn.dataset.errors = String(c.errors);
    validateBtn.title = V.state === 'off' ? 'The validator is not in this build yet. The reach map is worked out from the view centre instead.' : 'Check the draft: reach, links, geometry';
  }
  validateBtn.addEventListener('click', () => {
    if (V.state === 'off') V.state = 'idle';
    runValidate();
    if (!panels.right) toggleRight.click();
    findings.focus();
  });
  function renderFindings() {
    if (S.mode !== 'draft') return findingsBody.replaceChildren();
    if (V.state === 'off') return findingsBody.replaceChildren(el('p', { class: 'builder-sub', text: 'The validator is not in this build yet.' }));
    if (V.state === 'failed') return findingsBody.replaceChildren(el('p', { class: 'builder-sub', text: `The check did not finish: ${V.error || 'no reason given'}.` }));
    const r = V.report;
    if (!r) return findingsBody.replaceChildren(el('p', { class: 'builder-sub', text: V.state === 'running' ? 'Checking the draft.' : 'Not checked yet.' }));
    const groups = groupFindings(r.findings);
    if (!groups.length) return findingsBody.replaceChildren(el('p', { class: 'builder-sub', text: 'No findings: everything checked is fine.' }));
    findingsBody.replaceChildren(...groups.map((g) => el('div', { class: 'builder-findgroup', 'data-severity': g.id },
      el('h3', { class: 'builder-h3', text: `${g.label} (${g.items.length})` }),
      el('ul', { class: 'builder-outline' }, ...g.items.map((f) => {
        const at = parseAt(f.at);
        const other = at.street && at.street !== S.streetKey;
        return el('li', {}, el('button', {
          type: 'button',
          class: 'builder-finding',
          'data-rule': f.rule || '',
          'data-waived': f.waived ? '' : null,
          onclick: () => goToFinding(f),
        }, el('span', { text: f.message || f.rule }), el('span', { class: 'builder-sub', text: ` ${f.rule || ''}${f.at ? ` · ${f.at}` : ''}${other ? ' (another street)' : ''}${f.waived ? ' · waived' : ''}` })));
      })))));
  }
  /** Centre on a finding and select what it names (another street of the draft opens first). */
  function goToFinding(f) {
    const at = parseAt(f.at);
    const key = at.street || f.street;
    if (S.mode === 'draft' && key && key !== S.streetKey && S.session.zone.streets.some((r) => r.key === key)) openDraftStreet(key);
    const s = street();
    if (!s) return;
    if (at.id) selectById(at.id);
    const pt = findingPoint(f, s);
    if (pt) centreAt(pt);
    else if (at.id) {
      const kind = geoKindOf(s, at.id);
      if (kind) centreOnGeo(kind, geoItem(s, kind, at.id));
      else if (decoOf(at.id)[0]) centreOn(at.id);
    }
    canvas.focus();
  }

  // —— Play-test (spec 6.8) ——
  async function playTest() {
    const s = street();
    if (S.mode !== 'draft' || !s) return say('Play-testing is for a draft\'s streets. Fork this street into a draft first.');
    await S.session.flush();
    if (S.session.pending.length || S.session.status !== 'saved') return say('Save first: the draft has changes the site has not taken yet.', 'bad');
    const { w, h } = viewSize();
    const spot = floorUnder(platformsScreen(s), S.cam.x + w / 2, S.cam.y + h / 2, isStandable);
    globalThis.open(playTestUrl({ draft: S.session.id, street: S.streetKey, x: spot?.x, y: spot?.y }), '_blank', 'noopener');
  }
  playBtn.addEventListener('click', playTest);

  // —— P3: the deco picker and the new-zone dialogs ——
  const picker = mountPicker({
    el, btn, field, say,
    catalog: loadCatalog,
    assets: () => (S.session ? S.session.zone.assets : null),
    hub: () => String(street()?.hubId || ''),
    role: () => { const l = layerOf(S.activeLayer); return l ? layerRole(l, street()) : ''; },
    editable,
    draft: () => S.session?.id || '',
    place: placeDeco,
    upload: uploadArt,
  });
  layersList.after(picker.section);
  root.append(picker.dialog);
  async function loadProfiles() {
    if (S.profiles) return S.profiles;
    const r = await fetch('assets/content/style-profiles.json');
    S.profiles = await r.json();
    return S.profiles;
  }
  async function hubList() {
    if (S.hubs) return S.hubs;
    const r = await fetch('assets/maps/index.json');
    const idx = await r.json();
    S.hubs = Object.values(idx.hubs || {}).map((h) => ({ id: String(h.hubId), name: String(h.hubName) })).sort((a, b) => a.name.localeCompare(b.name));
    return S.hubs;
  }
  const hubStreets = (hubId) => Object.entries(STREET_INDEX.streets).filter(([, r]) => String(r.hubId) === String(hubId) && r.file).map(([tsid, r]) => ({ tsid, label: r.label })).sort((a, b) => a.label.localeCompare(b.label));
  const newDraft = newDraftDialog({
    el, btn, field, root, api,
    drafts: () => S.drafts,
    hubList,
    async onCreated(id) {
      S.drafts = await api.drafts();
      await openDraft(id);
      say('Draft made. Add its first street.');
      newStreet.open();
    },
  });
  const newStreet = newStreetDialog({ el, btn, field, root, say, session: () => S.session, profiles: loadProfiles, catalog: loadCatalog, commit: commitZone, openStreet: (key) => { S.mode = 'draft'; openDraftStreet(key); } });
  const hubMap = hubMapDialog({ el, btn, field, root, say, session: () => S.session, commit: commitZone, hubList, hubStreets });
  newDraftBtn.addEventListener('click', () => newDraft.open());
  newStreetBtn.addEventListener('click', () => newStreet.open());

  // —— Opening drafts and streets ——
  function fillDrafts() {
    draftSel.replaceChildren(el('option', { value: '' }, 'No draft (looking only)'), ...S.drafts.map((d) => el('option', { value: d.id, selected: S.session?.id === d.id ? true : null }, `${d.title} (${d.id})`)));
  }
  function fillStreets() {
    const streets = S.mode === 'draft' ? S.session.zone.streets : [];
    streetSel.hidden = S.mode !== 'draft';
    streetSel.replaceChildren(...(streets.length ? streets.map((s) => el('option', { value: s.key, selected: s.key === S.streetKey ? true : null }, `${s.street.label} (${s.key})`)) : [el('option', { value: '' }, 'No streets yet')]));
  }
  async function loadCatalog() {
    if (S.catalog) return S.catalog;
    const r = await fetch('assets/content/deco-catalog.json');
    S.catalog = new Map((await r.json()).decos.map((d) => [d.name, d]));
    return S.catalog;
  }
  async function openDraft(id, streetKey = '') {
    // Send what is pending first, so the draft fetched below has it.
    if (S.session) await S.session.flush();
    // The draft already open (back from a shipped street): keep its session and its undo history.
    if (S.session?.id === id && !S.session.pending.length) {
      S.mode = 'draft';
      if (S.validate.state !== 'off') S.validate.state = 'idle';
      fillDrafts();
      openDraftStreet(streetKey || S.streetKey);
      return;
    }
    let r;
    try { r = await api.draft(id); } catch (err) { failed(err); return; }
    S.session = new DraftSession(r.zone, { api, onChange: onSession });
    S.mode = 'draft';
    if (S.validate.state !== 'off') S.validate.state = 'idle';
    S.validate.report = null;
    status.textContent = statusWords(S.session);
    fillDrafts();
    openDraftStreet(streetKey);
  }
  /** What belongs to the street on screen, cleared when another opens. */
  function resetStreetState() {
    S.selected = [];
    S.preview.clear();
    S.geoSel = [];
    S.geoRevert = null;
    S.geoPreview.clear();
    S.streetPatch = null;
    S.reachLocal = null;
    S.reachFrom = null;
    S.reachPinned = false;
    S.arcs = null;
    S.arcWorld = null;
    S.activeLayer = 'middleground';
  }
  function openDraftStreet(key) {
    const streets = S.session.zone.streets;
    S.streetKey = streets.some((s) => s.key === key) ? key : streets[0]?.key || '';
    resetStreetState();
    fillStreets();
    loadGuides();
    scheduleValidate(0);
    if (!S.streetKey) {
      mount();
      renderPanels();
      say('This draft has no streets yet. Add one (New street), or open a shipped street and fork it into the draft.');
      history.replaceState(null, '', addressFor(location, hashFor({ draft: S.session.id })));
      return;
    }
    restoreCamera();
    mount();
    renderPanels();
    history.replaceState(null, '', addressFor(location, hashFor({ draft: S.session.id, street: S.streetKey })));
  }
  async function openShipped(tsid) {
    const key = resolveIndexTsid(tsid);
    const meta = key && STREET_INDEX.streets[key];
    if (!meta?.file) return say('No shipped street has that id.', 'bad');
    let data;
    try {
      const r = await fetch(meta.file);
      data = await r.json();
    } catch { return say('That street did not load.', 'bad'); }
    if (S.session) await S.session.flush();
    S.mode = 'view';
    S.viewTsid = key;
    S.viewStreet = withDecoIds(data);
    if (!S.viewStreet.hubName && meta.hubName) S.viewStreet.hubName = meta.hubName;
    resetStreetState();
    if (S.tool !== 'select') S.tool = 'select';
    clearTimeout(S.validate.timer);
    fillStreets();
    loadGuides();
    restoreCamera();
    mount();
    renderPanels();
    history.replaceState(null, '', addressFor(location, hashFor({ view: key })));
  }
  draftSel.addEventListener('change', () => {
    if (draftSel.value) openDraft(draftSel.value);
    else if (S.mode === 'draft') {
      const s = street();
      S.session = null;
      S.mode = 'none';
      resetStreetState();
      if (s) say('No draft chosen. Open a street to look at it.');
      mount();
      fillStreets();
      renderPanels();
    }
  });
  streetSel.addEventListener('change', () => openDraftStreet(streetSel.value));

  // Open street: search the shipped streets and the draft's own.
  const openInput = el('input', { type: 'search', 'aria-label': 'Street name or id', placeholder: 'Street name or id', autocomplete: 'off', spellcheck: 'false' });
  const openList = el('ul', { class: 'builder-results', role: 'listbox', 'aria-label': 'Streets' });
  const openDialog = el('dialog', { class: 'builder-dialog', 'aria-labelledby': 'builder-open-title' },
    el('h2', { id: 'builder-open-title', text: 'Open a street' }),
    el('p', { class: 'builder-sub', text: 'Shipped streets open read-only; fork one into a draft to change it.' }),
    openInput, openList,
    el('form', { method: 'dialog' }, el('button', { class: 'builder-btn', text: 'Close' })));
  root.append(openDialog);
  async function fillOpen() {
    if (!S.shippedList) {
      try { S.shippedList = await api.streets(); } catch (err) { failed(err); S.shippedList = []; }
    }
    const own = S.mode === 'draft' ? S.session.zone.streets.map((s) => ({ tsid: s.street.tsid, label: s.street.label, hub: 'this draft', key: s.key })) : [];
    const found = searchStreets([...own, ...S.shippedList], openInput.value);
    openList.replaceChildren(...found.map((s) => el('li', {}, el('button', {
      type: 'button',
      class: 'builder-result',
      onclick: () => { openDialog.close(); if (s.key) openDraftStreet(s.key); else openShipped(s.tsid); },
    }, el('b', { text: s.label }), el('span', { class: 'builder-sub', text: ` ${s.hub || ''} · ${s.tsid}` })))));
  }
  openInput.addEventListener('input', fillOpen);
  openBtn.addEventListener('click', () => { openDialog.showModal(); openInput.value = ''; fillOpen(); openInput.focus(); });

  // Fork into a draft.
  const forkLabel = el('input', { type: 'text', name: 'label', maxlength: '48', required: true, autocomplete: 'off' });
  const forkKey = el('input', { type: 'text', name: 'key', maxlength: '32', required: true, pattern: '[a-z][a-z0-9\\-]{0,31}', autocomplete: 'off', spellcheck: 'false' });
  const forkDraft = el('select', { name: 'draft' });
  const forkNewTitle = el('input', { type: 'text', name: 'title', maxlength: '80', autocomplete: 'off', placeholder: 'Mossy Hollow' });
  const forkNewId = el('input', { type: 'text', name: 'id', maxlength: '48', autocomplete: 'off', spellcheck: 'false', placeholder: 'mossy-hollow', pattern: '[a-z][a-z0-9\\-]{2,47}' });
  const forkNew = el('fieldset', { class: 'builder-fieldset' }, el('legend', { text: 'New draft' }), field('Title', forkNewTitle), field('Id', forkNewId));
  const forkForm = el('form', { class: 'builder-form' },
    field('Into', forkDraft), forkNew,
    field('Street name', forkLabel), field('Key', forkKey),
    el('p', { class: 'builder-sub', text: 'The copy gets a new id and name. The shipped street is never changed.' }),
    el('div', { class: 'builder-row' }, el('button', { type: 'submit', class: 'builder-btn builder-primary', text: 'Fork' }), el('button', { type: 'button', class: 'builder-btn', text: 'Cancel', onclick: () => forkDialog.close() })));
  const forkDialog = el('dialog', { class: 'builder-dialog', 'aria-labelledby': 'builder-fork-title' }, el('h2', { id: 'builder-fork-title', text: 'Fork into a draft' }), forkForm);
  root.append(forkDialog);
  forkDraft.addEventListener('change', () => { forkNew.hidden = forkDraft.value !== ''; });
  forkNewTitle.addEventListener('input', () => { forkNewId.value = streetKeyFrom(forkNewTitle.value).slice(0, 48); });
  forkLabel.addEventListener('input', () => { forkKey.value = streetKeyFrom(forkLabel.value); });
  forkBtn.addEventListener('click', () => {
    const s = street();
    if (!s) return;
    forkDraft.replaceChildren(...S.drafts.map((d) => el('option', { value: d.id }, d.title)), el('option', { value: '' }, 'A new draft'));
    forkNew.hidden = S.drafts.length > 0;
    forkLabel.value = `Copy of ${s.label}`.slice(0, 48);
    forkKey.value = streetKeyFrom(forkLabel.value);
    forkDialog.showModal();
    forkLabel.focus();
  });
  forkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const shipped = S.viewStreet;
    if (!shipped) return;
    try {
      let id = forkDraft.value;
      if (!id) {
        id = forkNewId.value.trim();
        await api.create(id, forkNewTitle.value.trim() || forkLabel.value.trim());
        S.drafts = await api.drafts();
      }
      const r = await api.draft(id);
      const zone = r.zone;
      const key = streetKeyFrom(forkKey.value || forkLabel.value, zone.streets.map((x) => x.key));
      const raw = await (await fetch(STREET_INDEX.streets[S.viewTsid].file)).json();
      const fork = forkStreet(raw, {
        zoneId: id,
        key,
        label: forkLabel.value.trim(),
        tsid: newTsid(),
        indexRow: STREET_INDEX.streets[S.viewTsid],
        catalog: await loadCatalog(),
        twins: DECO_TWINS,
        ecologyRow: ecologyForStreet(S.viewTsid),
      });
      const viewCam = { ...S.cam };
      await api.ops(id, r.rev, forkOps(zone, fork), `forked ${S.viewTsid}`);
      forkDialog.close();
      store.set(`groddle.builder.camera:${id}/${key}`, viewCam);
      await openDraft(id, key);
      say(`Forked into ${id} as ${fork.draftStreet.street.label}. Edits save as you go.`);
    } catch (err) { failed(err); }
  });

  // —— Saving and polling ——
  setInterval(() => { if (!S.drag) S.session?.flush(); }, SAVE_MS);
  setInterval(() => {
    if (document.hidden || S.drag || !S.session) return;
    S.session.poll().catch(() => {});
  }, POLL_MS);
  addEventListener('beforeunload', (e) => {
    if (S.session?.pending.length) {
      S.session.flush();
      e.preventDefault();
    }
  });
  addEventListener('hashchange', () => route());

  async function route() {
    const h = parseHash(location.hash);
    if (h.draft) {
      if (S.session?.id === h.draft) openDraftStreet(h.street);
      else await openDraft(h.draft, h.street);
    } else if (h.view) {
      await openShipped(h.view);
    } else if (!street()) {
      await openShipped(STREET_INDEX.default);
    }
  }

  // —— QA (tools/qa, the P1 checks) ——
  globalThis.groddleBuilderQA = {
    state: () => ({
      mode: S.mode,
      draft: S.session?.id || '',
      rev: S.session?.rev ?? null,
      status: S.session?.status || '',
      pending: S.session?.pending.length || 0,
      street: street()?.tsid || '',
      streetKey: S.streetKey,
      label: street()?.label || '',
      selected: [...S.selected],
      activeLayer: S.activeLayer,
      cam: { ...S.cam },
      decos: S.view?.decoDrawn ?? 0,
      buildMs: S.view?.buildMs ?? 0,
      fps: Math.round(app.ticker.FPS),
      canUndo: Boolean(S.session?.canUndo),
      canRedo: Boolean(S.session?.canRedo),
      tool: S.tool,
      geoSel: [...S.geoSel],
      snap: { ...S.snap },
      overlays: { ...S.overlays },
      guides: S.guides.map((g) => ({ ...g })),
      validate: { state: S.validate.state, counts: findingCounts(S.validate.report), findings: S.validate.report?.findings?.length ?? null },
      reach: (() => { const r = reachData(); return r ? { surfaces: r.surfaces?.length || 0, reached: (r.surfaces || []).filter((u) => u.reached).length, targets: r.targets?.length || 0, arrivals: r.arrivals?.length || 0, local: r === S.reachLocal?.data, ms: S.reachLocal?.ms ?? null } : null; })(),
      arcs: (S.arcs || []).map((a) => ({ kind: a.kind, dir: a.dir, points: a.points?.length || 0, landed: a.landed })),
      effects: S.fx ? S.fx.stats() : null,
      shaking: Boolean(S.shake),
    }),
    camera(x, y, zoom = S.cam.zoom) { S.cam = { x, y, zoom }; zoomLabel.textContent = `${Math.round(zoom * 100)}%`; },
    /** Draw parallax for a view of w x h world px (match /play/'s frame), or null for the canvas's own. */
    frame(w, h) { S.frame = w && h ? { w, h } : null; },
    select: (ids) => select(ids),
    deco: (id) => JSON.parse(JSON.stringify(decoOf(id)[1] || null)),
    layerOf: (id) => decoOf(id)[0]?.id || null,
    /** A deco's anchor and handles in canvas px (for pointer drags). */
    anchorOf(id) {
      const [layer, deco] = decoOf(id);
      if (!layer) return null;
      const box = boxOf(layer, deco);
      return { anchor: toCanvas({ x: box.ax, y: box.ay }), handles: handlePoints(box, S.cam.zoom).map((h) => ({ id: h.id, ...toCanvas(h) })) };
    },
    flush: () => S.session?.flush(),
    viewOffsets: () => offsets(),
    selectGeo: (keys) => selectGeo(keys),
    geo: (kind, id) => JSON.parse(JSON.stringify(geoOf(kind, id) || null)),
    geoList: (kind) => JSON.parse(JSON.stringify(street()?.[GEO_LIST[kind]] || [])),
    /** A geometry item's handles in canvas px (for pointer drags). */
    geoHandles(kind, id) {
      const item = geoOf(kind, id);
      return item ? geoHandles(street(), kind, item, S.cam.zoom).map((h) => ({ id: h.id, ...toCanvas(h) })) : null;
    },
    /** A street (world) point in canvas px. */
    canvasAt(x, y) { const s = street(); return s ? toCanvas({ x: x - s.bounds.l, y: y - s.bounds.t }) : null; },
    setOverlay: (name, on) => setOverlay(name, on),
    setTool: (t) => setTool(t),
    report: () => JSON.parse(JSON.stringify(S.validate.report || null)),
    validateNow: () => runValidate(),
    goToFinding: (f) => goToFinding(f),
    // —— P3 ——
    zone: () => JSON.parse(JSON.stringify(S.session?.zone || null)),
    pickerResults: () => picker.results(),
    hubMap: () => hubMap.map(),
    spots: () => (S.spots?.spots || []).map((p) => ({ ...p })),
  };

  try { S.drafts = await api.drafts(); } catch (err) { failed(err); }
  fillDrafts();
  // The deco catalog (sizes for the inspector, provenance for forks and pastes), in the background.
  loadCatalog().then(() => renderInspector()).catch(() => {});
  root.querySelector('[data-builder-loading]')?.remove();
  await route();
  root.dataset.ready = '1';
}

if (typeof document !== 'undefined' && document.querySelector) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot());
  else boot();
}
