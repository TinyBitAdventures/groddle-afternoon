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
 * Addresses: #draft=<id>&street=<key> opens a draft's street, #view=<tsid> a shipped street.
 * QA: window.groddleBuilderQA (state, camera, matchView, select, anchorOf).
 */
import { buildStreetView, loadDecoManifest, loadSignpostTextures, DECO_TWINS, flashBlurSize } from '../street-render.js?v=3bcef6a7';
import { worldToScreen, platformsScreen, isStandable, streetWidth, streetHeight, navigableSignposts } from '../street-model.js?v=23b926e5';
import { ensureStreetIndex, STREET_INDEX, resolveIndexTsid } from '../street-loader.js?v=d6cbbd5c';
import { loadStreetEcologyCatalog, ecologyForStreet } from '../street-ecology.js?v=7e30da8f';
import { createBuilderApi } from './api.js?v=3f83c00b';
import { DraftSession, statusWords, SAVE_MS, POLL_MS } from './session.js?v=e64474a6';
import { forkStreet, forkOps, newTsid, streetKeyFrom, relayerPosition, isLayerLocal, withDecoIds, floorUnder, libraryAsset } from './zone.js?v=9608addf';
import { nextDecoId, findDeco } from './ops.js?v=044258c8';
import { decoBox, contains, handlePoints, resizeBy, rotationTo, meetsRect, corners } from './handles.js?v=e215d17d';
import { layerRole } from './layer-role.js?v=e585f610';
import { installNewArt, withNewArt, provenanceSection } from './new-art.js?v=b2411f6f';
import * as textureUrls from '../textures.js?v=01a295a1';
import { installPixiFixes } from '../pixi-fixes.js?v=173fb649';
import { installHiresDecos } from '../deco-hires.js?v=a65f2d79';

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 4;
export const CLIPBOARD_KEY = 'groddle.builder.clipboard';
export const PANELS_KEY = 'groddle.builder.panels';
const HANDLE_PX = 7;

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
  const undoBtn = btn('Undo', { 'data-builder-undo': '', 'aria-keyshortcuts': 'Control+Z Meta+Z', disabled: true });
  const redoBtn = btn('Redo', { 'data-builder-redo': '', 'aria-keyshortcuts': 'Control+Shift+Z Meta+Shift+Z', disabled: true });
  const zoomOut = btn('−', { 'aria-label': 'Zoom out' });
  const zoomLabel = el('output', { class: 'builder-zoom', 'aria-live': 'off', 'data-builder-zoom': '' }, '100%');
  const zoomIn = btn('+', { 'aria-label': 'Zoom in' });
  const fitBtn = btn('Fit', { 'aria-keyshortcuts': '0', title: 'Fit the street (0); 100% is 1' });
  const playBtn = btn('Play', { class: 'builder-btn builder-primary', 'data-builder-play': '', 'aria-keyshortcuts': 'P', disabled: true });
  const keysBtn = btn('Keys', { 'aria-haspopup': 'dialog', 'aria-keyshortcuts': 'Shift+?' });
  const bar = el('header', { class: 'builder-bar' },
    el('div', { class: 'builder-bar-group' }, el('a', { href: '/console/#builder', class: 'builder-back' }, 'Console'), draftSel, streetSel, openBtn, forkBtn),
    el('div', { class: 'builder-bar-group' }, undoBtn, redoBtn, zoomOut, zoomLabel, zoomIn, fitBtn, keysBtn, playBtn),
    status);
  const layersList = el('ul', { class: 'builder-layers', 'aria-label': 'Layers', 'data-builder-layers': '' });
  const outline = el('ul', { class: 'builder-outline', 'aria-label': 'Decos on the active layer', 'data-builder-outline': '' });
  const outlineHead = el('h2', { class: 'builder-h' }, 'Decos');
  const left = el('aside', { class: 'builder-left', 'aria-label': 'Layers and decos', hidden: !panels.left },
    el('h2', { class: 'builder-h' }, 'Layers'), layersList, outlineHead, outline);
  const inspector = el('div', { class: 'builder-inspector', 'data-builder-inspector': '' });
  const right = el('aside', { class: 'builder-right', 'aria-label': 'Inspector', hidden: !panels.right }, el('h2', { class: 'builder-h' }, 'Inspector'), inspector);
  const canvasHost = el('div', { class: 'builder-canvas', 'data-builder-canvas': '' });
  const note = el('p', { class: 'builder-note', role: 'status', 'aria-live': 'polite', hidden: true });
  const toggleLeft = btn('Layers', { class: 'builder-btn builder-toggle', 'aria-pressed': String(panels.left), 'aria-label': 'Show the layers panel' });
  const toggleRight = btn('Inspector', { class: 'builder-btn builder-toggle', 'aria-pressed': String(panels.right), 'aria-label': 'Show the inspector' });
  const stage = el('div', { class: 'builder-stage' }, canvasHost, note, el('div', { class: 'builder-toggles' }, toggleLeft, toggleRight));
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
  canvasHost.append(canvas);
  const world = new PIXI.Container();
  world.label = 'builder-world';
  const overlay = new PIXI.Graphics();
  overlay.label = 'builder-overlay';
  app.stage.addChild(world, overlay);
  function resize() { app.resize?.(); }

  const [available] = await Promise.all([loadDecoManifest(), loadSignpostTextures(PIXI), ensureStreetIndex(), loadStreetEcologyCatalog()]);

  // —— The street being drawn ——
  const street = () => (S.mode === 'draft' ? S.session?.zone.streets.find((s) => s.key === S.streetKey)?.street : S.viewStreet) || null;
  const editable = () => S.mode === 'draft' && Boolean(street());
  const layerOf = (id) => (street()?.layers || []).find((l) => l.id === id) || null;
  const decoOf = (id) => {
    const s = street();
    if (!s) return [null, null];
    const [layer, i] = findDeco(s, id);
    return layer ? [layer, layer.decos[i]] : [null, null];
  };
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
    world.removeChildren();
    if (!s) return;
    // The game draws what loadStreetData gives it: hidden connects dropped.
    const data = { ...s, signposts: navigableSignposts(s.signposts) };
    const t0 = performance.now();
    S.view = buildStreetView(data, PIXI, { renderer: app.renderer, available: S.mode === 'draft' ? withNewArt(available, S.session?.zone.assets) : available });
    S.view.buildMs = Math.round(performance.now() - t0);
    world.addChild(S.view, S.view.frontView);
    for (const lc of S.view.layerContainers) lc.visible = !S.hidden.has(lc.label);
    canvas.dataset.street = s.tsid;
    canvas.dataset.decos = String(S.view.decoDrawn);
  }
  /** After an edit: move sprites in place where that is enough, else draw the street again. */
  function refresh(changed = []) {
    const s = street();
    if (!s || !S.view) return mount();
    const key = S.streetKey;
    let rebuild = false;
    for (const c of changed) {
      const [k, id] = c.split('/');
      if (k !== key) continue;
      if (!/^d_\d+$/.test(id || '')) { rebuild = true; break; }
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
  app.ticker.add(() => {
    const v = S.view;
    world.scale.set(S.cam.zoom);
    world.position.set(-S.cam.x * S.cam.zoom, -S.cam.y * S.cam.zoom);
    if (v) {
      const { w, h } = viewSize();
      const fw = S.frame?.w || w;
      const fh = S.frame?.h || h;
      v.updateParallax(S.cam.x, S.cam.y, fw, fh, Math.max(fh, h));
      v.cullDecos(S.cam.x, S.cam.y, w, h);
    }
    drawOverlay();
  });

  function drawOverlay() {
    overlay.clear();
    const s = street();
    if (!s) return;
    const line = { width: 1.5, color: 0x1fa6ff, alpha: 1 };
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

  // —— Selection ——
  function select(ids, { add = false } = {}) {
    const next = add ? [...new Set([...S.selected, ...ids])] : [...new Set(ids)];
    S.selected = next.filter((id) => decoOf(id)[0]);
    S.revertTo = Object.fromEntries(S.selected.map((id) => [id, JSON.parse(JSON.stringify(decoOf(id)[1]))]));
    const first = S.selected[0] && decoOf(S.selected[0])[0];
    if (first && first.id !== S.activeLayer && S.selected.every((id) => decoOf(id)[0]?.id === first.id)) S.activeLayer = first.id;
    renderPanels();
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
  function nudge(dx, dy) { editSelected((d) => ({ x: Math.round(d.x + dx), y: Math.round(d.y + dy) }), 'nudge'); }
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
    const ops = S.selected.filter((id) => !S.locked.has(decoOf(id)[0]?.id)).map((id) => ({ op: 'deco.remove', street: S.streetKey, id }));
    if (!ops.length) return;
    commit(ops, 'delete');
    S.selected = [];
    renderPanels();
  }
  function copy(cut = false) {
    const decos = S.selected.map((id) => decoOf(id)).filter(([l]) => l).map(([layer, deco]) => ({ layer: layer.id, role: layerRole(layer, street()), deco }));
    if (!decos.length) return;
    store.set(CLIPBOARD_KEY, { decos, at: Date.now() });
    say(`Copied ${decos.length === 1 ? '1 deco' : `${decos.length} decos`}.`);
    if (cut) remove();
  }
  async function paste(inPlace) {
    const clip = store.get(CLIPBOARD_KEY, null);
    if (!clip?.decos?.length) return say('Nothing to paste yet. Copy a deco first.');
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
      refresh(e.changed);
      S.selected = S.selected.filter((id) => decoOf(id)[0]);
      renderPanels();
    } else {
      // remote, rebased, conflict: the whole draft may differ.
      fillStreets();
      if (!street()) return openDraftStreet('');
      mount();
      S.selected = S.selected.filter((id) => decoOf(id)[0]);
      renderPanels();
      if (e.kind === 'remote') say('This draft changed somewhere else; showing the new version.');
    }
    undoBtn.disabled = !S.session.canUndo;
    redoBtn.disabled = !S.session.canRedo;
  }

  // —— Panels ——
  function renderPanels() {
    renderLayers();
    renderOutline();
    renderInspector();
    undoBtn.disabled = !S.session?.canUndo;
    redoBtn.disabled = !S.session?.canRedo;
    playBtn.disabled = S.mode !== 'draft' || !street();
    forkBtn.hidden = S.mode !== 'view';
    canvas.dataset.selected = S.selected.join(',');
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
  function renderInspector() {
    const s = street();
    inspector.replaceChildren();
    // append() writes a null as the text "null": leave the absent parts out.
    const add = (...kids) => inspector.append(...kids.filter((k) => k != null));
    if (!s) return add(el('p', { class: 'builder-sub', text: 'Open a street to begin.' }));
    if (!S.selected.length) {
      const layer = layerOf(S.activeLayer);
      add(
        el('p', {}, el('b', { text: s.label }), el('span', { class: 'builder-sub', text: ` ${s.tsid}` })),
        el('p', { class: 'builder-sub', text: S.mode === 'view' ? 'A shipped street, open to look at. Fork it into a draft to change it.' : `${s.hubName || ''} · ${streetWidth(s)} by ${streetHeight(s)}` }),
        el('p', { class: 'builder-sub', text: 'Click a deco on the active layer to select it. Alt+click picks from every layer.' }));
      if (layer) {
        const hid = el('input', { type: 'checkbox', checked: layer.hidden ? true : null, disabled: !editable() || null });
        hid.addEventListener('change', () => commit([{ op: 'layer.set', street: S.streetKey, layer: layer.id, ...(hid.checked ? { set: { hidden: true } } : { unset: ['hidden'] }) }], 'layer'));
        add(el('h3', { class: 'builder-h3', text: `Layer ${layer.name || layer.id}` }),
          el('p', { class: 'builder-sub', text: `${layerRole(layer, s)}, z ${layer.z ?? 0}${layer.w ? `, ${layer.w} by ${layer.h}` : ''}` }),
          el('label', { class: 'builder-check' }, hid, ' Hidden in the game'));
      }
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
  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    const { cx, cy } = pointer(e);
    const p = toWorld(cx, cy);
    canvas.setPointerCapture(e.pointerId);
    if (S.space || e.button === 1) {
      S.drag = { kind: 'pan', cx, cy, cam: { ...S.cam } };
      return;
    }
    if (e.button !== 0) return;
    const h = handleAt(cx, cy);
    if (h) {
      S.drag = { kind: h.handle.id === 'rotate' ? 'rotate' : 'resize', from: p, ...h };
      return;
    }
    let hits = hitsAt(p, { all: e.altKey });
    if (e.altKey && hits.length) {
      // Alt+click cycles through everything under the pointer.
      const at = hits.indexOf(S.selected[0]);
      hits = [hits[(at + 1) % hits.length]];
    }
    const id = hits[0];
    if (id) {
      if (e.shiftKey) {
        select(S.selected.includes(id) ? S.selected.filter((x) => x !== id) : [...S.selected, id]);
        return;
      }
      if (!S.selected.includes(id)) select([id]);
      if (editable()) S.drag = { kind: 'move', from: p, ids: S.selected.filter((x) => !S.locked.has(decoOf(x)[0]?.id)), moved: false };
      return;
    }
    S.drag = { kind: 'marquee', from: p, to: p, add: e.shiftKey };
  });
  canvas.addEventListener('pointermove', (e) => {
    const d = S.drag;
    const { cx, cy } = pointer(e);
    if (!d) {
      canvas.style.cursor = handleAt(cx, cy) ? (handleAt(cx, cy).handle.id === 'rotate' ? 'grab' : 'nwse-resize') : S.space ? 'grab' : 'default';
      return;
    }
    const p = toWorld(cx, cy);
    if (d.kind === 'pan') {
      S.cam.x = d.cam.x - (cx - d.cx) / S.cam.zoom;
      S.cam.y = d.cam.y - (cy - d.cy) / S.cam.zoom;
      saveCamera();
    } else if (d.kind === 'move') {
      const dx = Math.round(p.x - d.from.x);
      const dy = Math.round(p.y - d.from.y);
      d.moved = d.moved || Math.abs(dx) + Math.abs(dy) > 1;
      if (!d.moved) return;
      for (const id of d.ids) {
        const [layer, deco] = decoOf(id);
        S.preview.set(id, { x: deco.x + dx, y: deco.y + dy });
        syncSprite(layer, deco);
      }
    } else if (d.kind === 'resize') {
      const next = resizeBy(street(), d.layer, d.deco, d.box, d.handle, d.from, p, { keepAspect: e.shiftKey, offset: offsetOf(d.layer.id) });
      S.preview.set(d.deco.id, next);
      syncSprite(d.layer, d.deco);
    } else if (d.kind === 'rotate') {
      S.preview.set(d.deco.id, { r: rotationTo(d.box, p, e.shiftKey ? 15 : 1) });
      syncSprite(d.layer, d.deco);
    } else if (d.kind === 'marquee') {
      d.to = p;
    }
  });
  function endDrag() {
    const d = S.drag;
    S.drag = null;
    if (!d) return;
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
    S.drag = null;
  });
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
      ['Click, Shift+click, Alt+click', 'Select, add or remove, cycle through what is under the pointer'],
      ['Drag on empty space', 'Select with a box on the active layer'],
      ['Ctrl/Cmd+A, with Shift', 'Select the active layer, every layer'],
      ['Arrows', 'Move 5 px; Shift 20; Alt 1'],
      ['R with Left or Right', 'Rotate 1°; Shift 15°'],
      ['H', 'Flip'],
      ['Ctrl/Cmd+] and [ (or Up and Down)', 'Bring forward, send back; with Shift, to the front or back'],
      ['Alt+Up, Alt+Down', 'Move to the layer in front or behind, staying where it appears'],
      ['Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z', 'Undo, redo'],
      ['Ctrl/Cmd+C, X, V, Shift+V', 'Copy, cut, paste at the view centre, paste in place'],
      ['Delete', 'Delete'],
      ['Esc', 'Put the selection back as it was; again to deselect'],
      ['Space+drag, wheel, Ctrl/Cmd+wheel', 'Pan, pan, zoom'],
      ['0, 1', 'Fit the street, 100%'],
      ['L', 'Lock the active layer'],
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
    if (k.startsWith('Arrow') && S.selected.length) {
      e.preventDefault();
      if (S.rKey && (k === 'ArrowLeft' || k === 'ArrowRight')) { rotate((k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 15 : 1)); return; }
      const n = nudgeStep(e);
      nudge(k === 'ArrowLeft' ? -n : k === 'ArrowRight' ? n : 0, k === 'ArrowUp' ? -n : k === 'ArrowDown' ? n : 0);
      return;
    }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); remove(); return; }
    if (k === 'Escape') { if (!revertSelection()) select([]); else S.revertTo = null; return; }
    if (k === 'h' || k === 'H') { flip(); return; }
    if (k === '0') { fit(); return; }
    if (k === '1') { setZoom(1); return; }
    if (k === '=' || k === '+') { setZoom(S.cam.zoom * 1.25); return; }
    if (k === '-') { setZoom(S.cam.zoom / 1.25); return; }
    if (k === 'l' || k === 'L') { toggleLock(S.activeLayer); return; }
    if (k === 'p' || k === 'P') { playTest(); return; }
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
    let r;
    try { r = await api.draft(id); } catch (err) { failed(err); return; }
    if (S.session) await S.session.flush();
    S.session = new DraftSession(r.zone, { api, onChange: onSession });
    S.mode = 'draft';
    status.textContent = statusWords(S.session);
    fillDrafts();
    openDraftStreet(streetKey);
  }
  function openDraftStreet(key) {
    const streets = S.session.zone.streets;
    S.streetKey = streets.some((s) => s.key === key) ? key : streets[0]?.key || '';
    S.selected = [];
    S.preview.clear();
    S.activeLayer = 'middleground';
    fillStreets();
    if (!S.streetKey) {
      mount();
      renderPanels();
      say('This draft has no streets yet. Open a shipped street and fork it into the draft.');
      history.replaceState(null, '', hashFor({ draft: S.session.id }));
      return;
    }
    restoreCamera();
    mount();
    renderPanels();
    history.replaceState(null, '', hashFor({ draft: S.session.id, street: S.streetKey }));
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
    S.selected = [];
    S.activeLayer = 'middleground';
    fillStreets();
    restoreCamera();
    mount();
    renderPanels();
    history.replaceState(null, '', hashFor({ view: key }));
  }
  draftSel.addEventListener('change', () => {
    if (draftSel.value) openDraft(draftSel.value);
    else if (S.mode === 'draft') {
      const s = street();
      S.session = null;
      S.mode = 'none';
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
