/**
 * Snaps between real players (register G332), multiplayer only; solo is
 * untouched (every hook returns nothing outside multiplayer).
 *
 * - Taking a Snap: with the Snapshottery card (players/player.js 2148-2173
 *   getCameraAbilities), Enter in Camera Mode snaps the view (CameraMan.as
 *   492-550: the shutter, a flash, the polaroid with "click to enter a
 *   caption...", Save snap / discard, GlitchrSnapshotView.as 98-160) and the
 *   site keeps it (groddle-afternoon-site src/Snaps.php, as the client posted
 *   snaps.upload: debug/API.as 348-381) with the street and the spot. "Snap
 *   Saved!" follows (GlitchrSavedDialog.as 160-225). camera-mode-feature asks
 *   this feature (cameraSnap, cameraSnapHint).
 * - Menu, Snaps: your snaps, with Delete (the website's snaps/manage).
 * - The Camera: the Toy Vendor sells it (catalog_stores.js 1455-1458, 1100);
 *   "take a picture with" (items/camera.js 93-119) opens the snap travel
 *   screen (SnapTravelView.as): "In Soviet <street>, picture takes you!", a
 *   random Snap by another player 2 s later (the site's snaps/random, as
 *   snaps.randomForCamera?exclude_tsid=), Go there! or Forget it. Go there!
 *   (main.js 7605-7615) starts camera_recharging (90 s), counts Tottly's Toys,
 *   plays hit1 and teleports to the Snap's spot 500 ms later; Forget it
 *   (7617-7623) recharges for 15 s. Nothing in 10 s: "Your camera seems to
 *   have gone all wonky."
 *
 * The site decides who may snap (the card and level 5 from the save), the
 * limits, and which Snap the Camera sees; pictures are checked and written
 * again there. Canvas data: snapStage, snapTravelStreet, snapDialog,
 * snapsCount, snapsLast. window.groddleSnaps in multiplayer.
 */

import { createMinnAccount } from '../minn-account.js?v=81339760';
import { ITEM_CATALOG, countItem, ensureItem, itemIcon } from '../inventory.js?v=85d4faba';
import { STREET_INDEX, resolveIndexTsid } from '../street-loader.js?v=390e4702';
import {
  CAMERA_CLASS, CAPTION_MAX, FORGET_RECHARGE_SEC, RECHARGE_BUFF, SNAP_COPY as T, SNAP_MAX_BYTES, SNAP_QUALITY, SNAP_WIDTHS, TRAVEL,
  base64Bytes, canSnap, cleanCaption, isSnapUrl, jpegBase64, snapAuthor, snapPlace, snapStreet, takePictureState, withCamera,
} from '../snaps.js?v=7df81689';

export const SNAPS_FEATURE_ID = 'snaps';
const VERB = 'take_picture';

const STYLE = `
.snap-travel { position: absolute; inset: 0; z-index: calc(var(--z-screen) + 2); background: color-mix(in srgb, var(--c-black) 75%, transparent); color: var(--text-inverse); font: var(--fs-base)/var(--lh-normal) var(--font-ui); opacity: 0; transition: opacity 0.3s linear; pointer-events: auto; }
.snap-travel.is-in { opacity: 1; }
.snap-travel [hidden], .snap-shade [hidden] { display: none !important; }
.snap-travel-text { position: absolute; left: 30px; right: 30px; top: 50%; transform: translateY(-50%); text-align: center; font-size: var(--fs-2xl); font-weight: 700; text-shadow: 0 2px 2px var(--c-black); }
.snap-travel-place { position: absolute; left: 53px; right: 53px; top: 30px; text-align: center; font-size: var(--fs-2xl); font-weight: 700; text-shadow: 0 2px 3px var(--c-black), 0 0 3px color-mix(in srgb, var(--c-black) 30%, transparent); }
.snap-travel-place small { display: block; font-size: var(--fs-base); font-weight: 600; opacity: 0.9; }
.snap-travel-frame { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: var(--surface-bright); padding: var(--sp-8); max-width: calc(100% - 40px); box-sizing: border-box; }
.snap-travel-frame img { display: block; max-width: 100%; max-height: 52vh; background: linear-gradient(135deg, var(--c-grey-35), var(--c-black)); opacity: 0; transition: opacity 0.5s linear 0.2s; }
.snap-travel-frame img.is-in { opacity: 1; }
.snap-travel-buttons { position: absolute; left: 50%; bottom: 30px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: var(--sp-6); }
.snap-travel-go { width: 150px; border: 0; border-radius: var(--radius-md); padding: 0.55rem 0.8rem; font: 700 var(--fs-lg)/var(--lh-tight) var(--font-ui); color: var(--text-inverse); background: linear-gradient(var(--c-lime-76), var(--c-green-61)); box-shadow: 0 2px 0 var(--c-green-48b); cursor: pointer; }
.snap-travel-go:disabled { filter: grayscale(0.8); cursor: default; }
.snap-travel-forget { border: 0; border-radius: var(--radius-lg); padding: var(--sp-1) var(--sp-4); background: var(--overlay-dim); color: var(--text-inverse); font: 600 var(--fs-md)/var(--lh-normal) var(--font-system); text-shadow: 0 2px 2px var(--c-black); cursor: pointer; }
.snap-travel-forget:hover { background: color-mix(in srgb, var(--c-black) 70%, transparent); }
.snap-travel-author { position: absolute; right: 0; bottom: 0; padding: var(--sp-2) var(--sp-3); border-radius: var(--radius-lg) 0 0 0; background: var(--overlay-dim); font: var(--fs-sm)/var(--lh-snug) var(--font-system); text-shadow: 0 1px 1px var(--c-black); }
.snap-flash { position: absolute; inset: 0; z-index: calc(var(--z-screen) + 10); background: var(--surface-bright); pointer-events: none; opacity: 0; transition: opacity 0.1s linear; }
.snap-flash.is-on { opacity: 1; }
.snap-flash.is-off { opacity: 0; transition: opacity 0.6s linear 0.3s; }
.snap-shade { position: absolute; inset: 0; z-index: calc(var(--z-screen) + 4); background: color-mix(in srgb, var(--c-black) 55%, transparent); display: flex; align-items: center; justify-content: center; padding: var(--sp-8); pointer-events: auto; }
.snap-polaroid { background: var(--surface-card); color: var(--text); border-radius: var(--radius-xs); padding: var(--sp-7) var(--sp-7) var(--sp-6); width: min(560px, 100%); box-shadow: 0 10px 30px color-mix(in srgb, var(--c-black) 45%, transparent); font: var(--fs-md)/var(--lh-normal) var(--font-system); text-align: center; }
.snap-polaroid img { display: block; width: 100%; height: auto; background: var(--surface-dark); }
.snap-polaroid input { box-sizing: border-box; width: 100%; margin: var(--sp-5) 0 0; padding: 0.45rem 0.55rem; border: 0; border-radius: var(--radius-sm); box-shadow: inset 0 0 0 1px var(--c-mauve-85); font: italic var(--fs-base)/var(--lh-snug) var(--font-ui); background: var(--surface-bright); color: var(--text); }
.snap-polaroid h2 { margin: 0 0 var(--sp-4); font: 700 var(--fs-xl)/var(--lh-tight) var(--font-ui); color: var(--c-violet-36); }
.snap-polaroid p { margin: var(--sp-4) 0 0; white-space: pre-line; }
.snap-row { display: flex; gap: var(--sp-7); align-items: center; justify-content: center; margin-top: var(--sp-6); flex-wrap: wrap; }
.snap-save { border: 0; border-radius: var(--radius-md); padding: var(--sp-4) var(--sp-8); font: 700 var(--fs-base)/var(--lh-tight) var(--font-ui); color: var(--text-inverse); background: linear-gradient(var(--c-lime-76), var(--c-green-61)); box-shadow: 0 2px 0 var(--c-green-48b); cursor: pointer; }
.snap-save:disabled { filter: grayscale(0.7); cursor: default; }
.snap-link { border: 0; background: transparent; color: var(--c-violet-50); font: 600 var(--fs-md)/var(--lh-tight) var(--font-system); cursor: pointer; text-decoration: underline; padding: 0.2rem; }
.snap-shade-win { position: fixed; inset: 0; z-index: calc(var(--z-dialog) + 4); background: color-mix(in srgb, var(--c-mauve-23) 28%, transparent); display: flex; align-items: flex-start; justify-content: center; padding: 7vh var(--sp-8) var(--sp-8); pointer-events: auto; }
.snap-shade-win[hidden] { display: none; }
.snap-win { width: min(680px, 100%); max-height: 84vh; display: flex; flex-direction: column; border-radius: var(--radius-xl); background: var(--surface-card); color: var(--text); box-shadow: var(--shadow-3), 0 0 0 1px color-mix(in srgb, var(--c-violet-50) 18%, transparent); font: var(--fs-md)/var(--lh-normal) var(--font-system); }
.snap-win-head { display: flex; gap: var(--sp-5); align-items: center; padding: var(--sp-6) var(--sp-7) var(--sp-3); }
.snap-win-head h2 { margin: 0; font: 700 var(--fs-lg)/var(--lh-tight) var(--font-ui); color: var(--c-violet-36); }
.snap-win-head span { color: var(--text-subtle); font-size: var(--fs-sm); }
.snap-win-x { margin-left: auto; border: 0; background: transparent; font: 700 var(--fs-xl)/var(--lh-none) var(--font-system); color: var(--text-subtle); cursor: pointer; padding: var(--sp-1) var(--sp-3); border-radius: var(--radius-sm); }
.snap-win-body { overflow-y: auto; padding: var(--sp-3) var(--sp-7) var(--sp-7); }
.snap-win-foot { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-5); padding: var(--sp-3) var(--sp-7) var(--sp-5); color: var(--text-subtle); font-size: var(--fs-sm); }
.snap-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--sp-5); }
.snap-card { background: var(--surface-bright); border-radius: var(--radius-sm); box-shadow: var(--shadow-1); padding: var(--sp-3) var(--sp-3) var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-2); }
.snap-card img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: var(--c-grey-90); border-radius: var(--radius-xs); }
.snap-card b { font-size: var(--fs-sm); color: var(--c-violet-36); }
.snap-card i { font-size: var(--fs-sm); color: var(--c-mauve-46); overflow-wrap: anywhere; }
.snap-card .snap-link { align-self: flex-start; font-size: var(--fs-sm); }
.snap-note { color: var(--text-subtle); margin: var(--sp-3) 0; }
`;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

const root = () => document.getElementById('game-root') || document.body;

let session = null;

function multiplayer(engine) {
  return engine?.mode === 'multiplayer';
}

function createSession(engine) {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  const s = {
    account,
    album: null,
    travel: null, // { el, snap, timers, stage }
    dialog: null, // { el, stage }
    win: null,
    last: '',
  };
  if (!document.getElementById('snaps-style')) {
    const style = el('style', { id: 'snaps-style' });
    style.textContent = STYLE;
    document.head.append(style);
  }
  const menu = document.getElementById?.('more-list');
  if (menu && !document.getElementById('snaps-btn')) {
    const btn = el('button', { id: 'snaps-btn', type: 'button', class: 'chrome-btn', title: T.menuTip }, T.menu);
    btn.addEventListener('click', () => openAlbum(engine, s));
    const before = document.getElementById?.('signout-btn');
    if (before && before.parentElement === menu) menu.insertBefore(btn, before);
    else menu.append(btn);
  }
  globalThis.groddleSnaps = {
    state: () => ({ stage: s.travel?.stage || 'idle', dialog: s.dialog?.stage || 'closed', album: s.album, last: s.last, travelSnap: s.travel?.snap || null }),
    album: () => loadAlbum(s, true),
    openAlbum: () => openAlbum(engine, s),
    takePicture: () => openTravel(engine, s),
    snap: () => snapNow(engine, s, {}),
  };
  publish(engine, s);
  return s;
}

function publish(engine, s) {
  engine.setData?.('snapStage', s.travel?.stage || 'idle');
  engine.setData?.('snapTravelStreet', s.travel?.snap?.street || '');
  engine.setData?.('snapDialog', s.dialog?.stage || 'closed');
  engine.setData?.('snapsCount', s.album ? String(s.album.snaps.length) : '');
  engine.setData?.('snapsLast', s.last);
}

function note(engine, s, line) {
  s.last = line;
  publish(engine, s);
}

async function loadAlbum(s, fresh = false) {
  if (s.album && !fresh) return s.album;
  const a = await s.account.snaps();
  s.album = { snaps: Array.isArray(a?.snaps) ? a.snaps.filter((x) => isSnapUrl(x?.url)) : [], max: Number(a?.max) || 60 };
  return s.album;
}

function upgrades(engine) {
  return engine.pc?.imaginationUpgrades || [];
}

function dead(engine) {
  return engine.query?.('isDead', engine) === true;
}

function streetMeta(tsid) {
  const key = resolveIndexTsid(tsid);
  return key && tsid ? STREET_INDEX.streets?.[key] || null : null;
}

/* ------------------------------------------------------------------ */
/* Taking a Snap                                                       */
/* ------------------------------------------------------------------ */

/** The view as a JPEG no larger than the site keeps. */
function drawSnap(engine) {
  const view = engine.snapshotView?.({ resolution: 1 });
  if (!view?.width || !view?.height) return null;
  for (const width of SNAP_WIDTHS) {
    const w = Math.min(width, view.width);
    const h = Math.round((view.height * w) / view.width);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(view, 0, 0, w, h);
    const url = c.toDataURL('image/jpeg', SNAP_QUALITY);
    const b64 = jpegBase64(url);
    if (b64 && base64Bytes(b64) <= SNAP_MAX_BYTES) return { url, b64, w, h };
  }
  return null;
}

/** Where the Snap was taken: the street (or '' for a private place) and the avatar's spot. */
function snapSpot(engine) {
  const client = engine.query?.('realtimeClient');
  const home = engine.homeContext?.() || {};
  const street = snapStreet({
    realtime: client?.state === 'online' ? client.street : '',
    street: engine.streetTsid,
    dropTsid: engine.dropTsid,
    transient: Boolean(engine.transientInstance?.()),
    inHome: Boolean(home.inHome),
    indexed: (tsid) => Boolean(resolveIndexTsid(tsid) === tsid && STREET_INDEX.streets?.[tsid]),
  });
  return { street, x: Math.round(engine.player?.x || 0), y: Math.round(engine.player?.y || 0) };
}

function flash(onPeak) {
  const f = el('div', { class: 'snap-flash' });
  root().append(f);
  requestAnimationFrame(() => {
    f.classList.add('is-on');
    setTimeout(() => {
      onPeak?.();
      f.classList.add('is-off');
      f.classList.remove('is-on');
      setTimeout(() => f.remove(), 1000);
    }, 100);
  });
}

function closeDialog(engine, s) {
  s.dialog?.el.remove();
  s.dialog = null;
  publish(engine, s);
}

/** Enter in Camera Mode: snap, then the polaroid (CameraMan.as snap, GlitchrSnapshotView.start). */
function snapNow(engine, s, ctx) {
  if (s.dialog) return null; // the polaroid is up: its own keys
  if (!canSnap(upgrades(engine))) {
    engine.playSound?.('CLICK_FAILURE', { volume: 0.5 });
    engine.toast?.(T.needCard, 2600);
    note(engine, s, 'no-card');
    return true;
  }
  engine.playSound?.('CAMERA_SHUTTER', { volume: 0.6 });
  const picture = drawSnap(engine);
  if (!picture) {
    engine.toast?.(T.error('the view could not be drawn'), 3000);
    return true;
  }
  const spot = snapSpot(engine);
  flash(() => openPolaroid(engine, s, picture, spot, ctx));
  return true;
}

function openPolaroid(engine, s, picture, spot, ctx) {
  closeDialog(engine, s);
  const shade = el('div', { class: 'snap-shade', 'data-snap-dialog': '' });
  const card = el('div', { class: 'snap-polaroid', role: 'dialog', 'aria-label': 'Snap' });
  const img = el('img', { alt: '', src: picture.url, width: String(picture.w), height: String(picture.h) });
  const input = el('input', { type: 'text', maxlength: String(CAPTION_MAX), placeholder: T.caption, 'data-snap-caption': '', 'aria-label': 'Caption' });
  const row = el('div', { class: 'snap-row' });
  const save = el('button', { type: 'button', class: 'snap-save', 'data-snap-save': '' }, T.save);
  const discard = el('button', { type: 'button', class: 'snap-link', 'data-snap-discard': '' }, T.discard);
  const msg = el('p', { role: 'status', 'aria-live': 'polite' });
  row.append(save, discard);
  card.append(img, input, row, msg);
  shade.append(card);
  root().append(shade);
  s.dialog = { el: shade, stage: 'open' };
  publish(engine, s);
  setTimeout(() => input.focus(), 30);

  const doSave = async () => {
    if (!s.dialog || s.dialog.stage === 'saving') return;
    s.dialog.stage = 'saving';
    publish(engine, s);
    save.disabled = true;
    discard.disabled = true;
    input.disabled = true;
    msg.textContent = T.saving;
    try {
      const out = await s.account.saveSnap({ image: picture.b64, caption: cleanCaption(input.value), street: spot.street, x: spot.x, y: spot.y });
      s.album = { snaps: (out?.snaps || []).filter((x) => isSnapUrl(x?.url)), max: Number(out?.max) || 60 };
      note(engine, s, `saved:${out?.snap?.id || ''}`);
      ctx?.end?.();
      showSaved(engine, s, picture);
    } catch (err) {
      if (!s.dialog) return;
      s.dialog.stage = 'error';
      note(engine, s, `error:${err?.code || ''}`);
      card.replaceChildren(
        el('h2', {}, 'Error'),
        el('p', {}, T.error(err?.message || 'unknown')),
      );
      const ugh = el('button', { type: 'button', class: 'snap-save', 'data-snap-ugh': '' }, T.ugh);
      ugh.addEventListener('click', () => closeDialog(engine, s));
      const r = el('div', { class: 'snap-row' });
      r.append(ugh);
      card.append(r);
      ugh.focus();
    }
  };
  save.addEventListener('click', doSave);
  discard.addEventListener('click', () => closeDialog(engine, s));
  shade.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') closeDialog(engine, s);
    else if (e.key === 'Enter' && e.target === input) doSave();
  });
}

function showSaved(engine, s, picture) {
  if (!s.dialog) return;
  const card = s.dialog.el.querySelector('.snap-polaroid');
  s.dialog.stage = 'saved';
  publish(engine, s);
  const done = el('button', { type: 'button', class: 'snap-save', 'data-snap-done': '' }, T.done);
  done.addEventListener('click', () => closeDialog(engine, s));
  const row = el('div', { class: 'snap-row' });
  row.append(done);
  card.replaceChildren(el('h2', {}, T.saved), el('img', { alt: '', src: picture.url }), el('p', {}, T.savedBody), row);
  done.focus();
}

/* ------------------------------------------------------------------ */
/* Menu, Snaps                                                          */
/* ------------------------------------------------------------------ */

function placeText(tsid) {
  const meta = streetMeta(tsid);
  return meta ? `${meta.label}${meta.hubName ? `, ${meta.hubName}` : ''}` : '';
}

function openAlbum(engine, s) {
  if (s.win) s.win.remove();
  // MPANELS: the panel shell's centred frame in the modern skin (style.css): the head (the Camera, the
  // title, close), a body that scrolls, the count and Esc in the footer.
  const shade = el('div', { class: 'snap-shade-win ui-sheet-center', 'data-snaps-window': '' });
  const win = el('div', { class: 'snap-win ui-sheet-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'snaps-title' });
  const head = el('div', { class: 'snap-win-head ui-sheet-head' });
  const count = el('span', { class: 'panel-meta', 'data-snaps-count': '' });
  const x = el('button', { type: 'button', class: 'snap-win-x ui-sheet-x', 'aria-label': `${T.close} (Esc)` }, '×');
  const title = el('h2', { id: 'snaps-title', class: 'ui-sheet-title', tabindex: '-1' }, T.title);
  head.append(el('img', { class: 'ui-sheet-icon mp-modern-only', src: itemIcon(CAMERA_CLASS), alt: '' }), title, x);
  const body = el('div', { class: 'snap-win-body ui-sheet-body' });
  const foot = el('div', { class: 'snap-win-foot ui-sheet-foot' });
  const esc = el('span', { class: 'ui-sheet-esc mp-modern-only' });
  esc.append(el('span', { class: 'kcap' }, 'Esc'), document.createTextNode(' close'));
  foot.append(count, esc);
  win.append(head, body, foot);
  shade.append(win);
  document.body.append(shade);
  s.win = shade;
  const close = () => { shade.remove(); if (s.win === shade) s.win = null; };
  x.addEventListener('click', close);
  shade.addEventListener('pointerdown', (e) => { if (e.target === shade) close(); });
  shade.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });

  const draw = () => {
    const a = s.album || { snaps: [], max: 60 };
    count.textContent = T.count(a.snaps.length, a.max);
    body.replaceChildren();
    if (!a.snaps.length) {
      body.append(el('p', { class: 'snap-note' }, canSnap(upgrades(engine)) ? T.empty : T.emptyNoCard));
      return;
    }
    const grid = el('div', { class: 'snap-grid' });
    for (const snap of a.snaps) {
      const c = el('div', { class: 'snap-card', 'data-snap-id': String(snap.id) });
      c.append(el('img', { alt: snap.caption || '', src: snap.url, loading: 'lazy' }));
      const where = placeText(snap.street);
      if (where) c.append(el('b', {}, where));
      if (snap.caption) c.append(el('i', {}, snap.caption));
      const del = el('button', { type: 'button', class: 'snap-link', 'data-snap-delete': String(snap.id) }, T.remove);
      del.addEventListener('click', async () => {
        del.disabled = true;
        del.textContent = T.removing;
        try {
          const out = await s.account.deleteSnap(snap.id);
          s.album = { snaps: (out?.snaps || []).filter((y) => isSnapUrl(y?.url)), max: Number(out?.max) || 60 };
          note(engine, s, `deleted:${snap.id}`);
          draw();
        } catch (err) {
          del.disabled = false;
          del.textContent = T.remove;
          engine.toast?.(err?.message || 'That didn\'t work. Try again in a moment.', 2600);
        }
      });
      c.append(del);
      grid.append(c);
    }
    body.append(grid);
  };
  body.append(el('p', { class: 'snap-note' }, 'Loading…'));
  loadAlbum(s, true).then(() => { draw(); publish(engine, s); }).catch((err) => {
    body.replaceChildren(el('p', { class: 'snap-note' }, err?.message || 'That didn\'t work. Try again in a moment.'));
  });
  title.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ */
/* The Camera: snap travel                                              */
/* ------------------------------------------------------------------ */

function closeTravel(engine, s) {
  const t = s.travel;
  if (!t) return;
  for (const id of t.timers) clearTimeout(id);
  t.el.remove();
  s.travel = null;
  publish(engine, s);
}

/** take_picture: the snap travel screen (SnapTravelView.show). */
function openTravel(engine, s) {
  if (s.travel) return true;
  const state = takePictureState({ recharging: Boolean(engine.hasBuff?.(RECHARGE_BUFF)), dead: dead(engine) });
  if (!state.enabled) {
    engine.toast?.(state.reason, 2400);
    return true;
  }
  const here = engine.street?.label || engine.streetTsid || 'Ur';
  const shade = el('div', { class: 'snap-travel', 'data-snap-travel': '', role: 'dialog', 'aria-label': 'Snap travel' });
  const text = el('p', { class: 'snap-travel-text', 'data-snap-text': '' }, T.travel(here));
  const place = el('div', { class: 'snap-travel-place', 'data-snap-place': '', hidden: true });
  const frame = el('div', { class: 'snap-travel-frame', hidden: true });
  const img = el('img', { alt: '' });
  frame.append(img);
  const buttons = el('div', { class: 'snap-travel-buttons', hidden: true });
  const go = el('button', { type: 'button', class: 'snap-travel-go', 'data-snap-go': '', disabled: true }, T.go);
  const forget = el('button', { type: 'button', class: 'snap-travel-forget', 'data-snap-forget': '' }, T.forget);
  buttons.append(go, forget);
  const author = el('div', { class: 'snap-travel-author', 'data-snap-author': '', hidden: true });
  shade.append(text, frame, place, buttons, author);
  root().append(shade);
  requestAnimationFrame(() => shade.classList.add('is-in'));
  const t = { el: shade, snap: null, timers: [], stage: 'text', loaded: false, waited: 0, target: null };
  s.travel = t;
  publish(engine, s);

  const exclude = engine.streetTsid || '';
  s.account.randomSnap(/^[GL][A-Z0-9]{8,20}$/.test(exclude) ? exclude : '').then((out) => {
    if (s.travel !== t) return;
    const snap = out?.snap;
    if (!snap || !isSnapUrl(snap.url)) return; // nothing: the timeout says wonky
    t.snap = snap;
    const meta = streetMeta(snap.street);
    const p = snapPlace(meta);
    place.replaceChildren(document.createTextNode(p.label), el('small', {}, `in ${p.hub}`));
    author.textContent = snapAuthor(snap.owner);
    if (meta && Number.isFinite(Number(snap.x)) && Number.isFinite(Number(snap.y))) {
      t.target = { tsid: resolveIndexTsid(snap.street), x: Number(snap.x), y: Number(snap.y), label: p.label };
      go.disabled = false;
    }
    img.addEventListener('load', () => { t.loaded = true; }, { once: true });
    img.addEventListener('error', () => { t.snap = null; t.target = null; go.disabled = true; }, { once: true });
    img.src = snap.url;
    publish(engine, s);
  }).catch(() => { /* the timeout says wonky */ });

  const show = () => {
    if (s.travel !== t) return;
    if (!t.loaded) {
      // SnapTravelView.showSnap: retry every 200 ms, give up TIMEOUT_MS after the first try.
      t.waited += 200;
      if (t.waited > TRAVEL.timeoutMs) {
        engine.pushActivity?.(T.wonky);
        note(engine, s, 'wonky');
        closeTravel(engine, s);
        return;
      }
      t.timers.push(setTimeout(show, 200));
      return;
    }
    engine.playSound?.('CAMERA_SHUTTER', { volume: 0.6 });
    flash(() => {
      if (s.travel !== t) return;
      text.hidden = true;
      frame.hidden = false;
      place.hidden = false;
      buttons.hidden = false;
      author.hidden = false;
      img.classList.add('is-in');
      t.stage = 'shown';
      publish(engine, s);
      (go.disabled ? forget : go).focus();
    });
  };
  t.timers.push(setTimeout(show, TRAVEL.showDelayMs + 300));

  const doForget = () => {
    if (s.travel !== t) return;
    // main.js 7617-7623: camera_recharging, cut to 15 s.
    engine.applyBuff?.(RECHARGE_BUFF, { durationSec: FORGET_RECHARGE_SEC });
    note(engine, s, 'forgot');
    closeTravel(engine, s);
  };
  const doGo = () => {
    if (s.travel !== t || !t.target || go.disabled) return;
    const target = t.target;
    const gate = engine.transientInstance?.() ? { ok: false, msg: 'You cannot teleport right now.' } : engine.travelGate?.(target.tsid) || { ok: true };
    if (gate.ok === false) {
      engine.toast?.(gate.msg || 'You cannot teleport right now.', 2600);
      return;
    }
    go.disabled = true;
    // main.js 7605-7615: the buff, Tottly's Toys, hit1 for 1 s, then teleportToLocationDelayed (500 ms).
    engine.applyBuff?.(RECHARGE_BUFF);
    engine.featsIncrement?.('tottlys_toys', 1);
    engine.playHit?.('hit1', TRAVEL.hitMs);
    t.stage = 'going';
    note(engine, s, `go:${target.tsid}`);
    closeTravel(engine, s);
    setTimeout(() => {
      Promise.resolve(engine.enter?.(target.tsid, { spawnX: target.x, spawnY: target.y })).catch((err) => {
        console.warn('[snaps] travel', err?.message || err);
        engine.toast?.('The teleport fizzled.', 2400);
      });
    }, TRAVEL.goDelayMs);
  };
  go.addEventListener('click', doGo);
  forget.addEventListener('click', doForget);
  shade.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') doForget();
  });
  return true;
}

export const snapsFeature = {
  id: SNAPS_FEATURE_ID,

  init(engine) {
    if (!multiplayer(engine) || typeof document === 'undefined' || globalThis.groddlePractice === true) return;
    if (!ITEM_CATALOG[CAMERA_CLASS]) {
      ensureItem(CAMERA_CLASS, { label: 'Camera', baseCost: 1000, stackMax: 1, isTool: true, icon: itemIcon(CAMERA_CLASS) });
    }
    session = createSession(engine);
  },

  onStreetClear(engine) {
    if (session?.travel) closeTravel(engine, session);
  },

  /** catalog_stores.js 1455-1458: the Toy Vendor's Camera, in multiplayer. */
  vendorProfile(profile, engine) {
    if (!multiplayer(engine) || !session) return null;
    return withCamera(profile);
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== CAMERA_CLASS || !multiplayer(engine) || !session) return [];
    if (countItem(engine.inv, CAMERA_CLASS) < 1) return [];
    const st = takePictureState({ recharging: Boolean(engine.hasBuff?.(RECHARGE_BUFF)), dead: dead(engine) });
    return [{ id: VERB, label: T.verbLabel, enabled: st.enabled, reason: st.reason, tooltip: T.verbTip, primary: true }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== CAMERA_CLASS || verbId !== VERB || !multiplayer(engine) || !session) return false;
    if (countItem(engine.inv, CAMERA_CLASS) < 1) return false;
    return openTravel(engine, session);
  },

  /** camera-mode-feature: the hint with Enter to snap (CameraManView.as 189-196). */
  cameraSnapHint(engine, range) {
    if (!multiplayer(engine) || !session) return null;
    // getCameraAbilities 2155-2165: without the card, the Snapshottery line shows once Eyeballery's is gone.
    if (!canSnap(upgrades(engine))) return Number.isFinite(range) ? null : T.hintNoCard;
    return Number.isFinite(range) ? T.hintSnapStreet : T.hintSnap;
  },

  /** camera-mode-feature: Enter while looking. ctx.end() leaves Camera Mode (after a save). */
  cameraSnap(engine, ctx = {}) {
    if (!multiplayer(engine) || !session) return null;
    return snapNow(engine, session, ctx);
  },
};
