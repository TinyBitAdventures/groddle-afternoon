/**
 * The Classic imagination hub on X (classic-spec spec §9; ImgMenuView.as, ImgMenuElement.as; Austin
 * 2026-10-30: in Classic X opens the hub, as the original did, and U keeps Upgrades). Modern's X is
 * left exactly as it is (imagination-feature.js).
 *
 * A full-viewport overlay with the radial vignette and the seven clouds (imagination_clouds.swf,
 * public/assets/classic/; the skill book, quest book and upgrade cards on the first three), each routed to what the remake already has:
 *   Skills (S), Quests (Q or L), Upgrades (U): the Skills panel, the Quest Log, the upgrade cards;
 *   Your looks (Y): the Look builder (no outfit history exists); Teleport (T): the saved teleport
 *   points (Shift+T); Go home (H): Home; Back to world (B): closes the hub.
 * Arrows cycle the clouds, Enter picks, X and Esc close. The iMG button in the ear opens it too.
 *
 * Pictures in the clouds, as the client's (ImgMenuElement.as 119-127, 204-242: an image masked by a
 * second cloud of the same shape): Your looks shows your avatar (game.js ownerPortraitUrl, the same
 * still the home card uses), Teleport the familiar's teleport art, Go home your home street and Back
 * to world the street you are on, both from the game's own view snapshot (engine.snapshotView). The
 * home street is captured while you are on it and kept on this device; until the first visit the
 * cloud stays bare. At home the home cloud reads "Back to world" and the world cloud dims, as
 * ImgMenuHome / ImgMenuBackToWorld did.
 * Opening fades the hub in over .4 s and each cloud in .2 s, .1 s apart, each with its CLOUD1-7
 * sound, after IMAGINATION_OPEN; closing plays IMAGINATION_CLOSE (ImgMenuView.as 151-300).
 *
 * The key listener is registered when this module loads (before the features' own listeners, which
 * come with the game's init), so under Classic it takes X first. It never takes X while typing, while
 * the loading or start card is up, or while the upgrade cards are open (X closes those, as before).
 */
import { uiState, onUiModeChange, readUiCache, writeUiCache } from './ui-mode.js?v=g476-1';
import { classicArtUrl } from './classic-art.js?v=g468-9';

/** The clouds, in the client's two rows (ImgMenuView.as 343-415). */
export const HUB_CLOUDS = Object.freeze([
  { id: 'skills', title: 'Skills', art: 'cloud_skills', icon: 'skill_book_small', keys: ['s'], row: 1 },
  { id: 'quests', title: 'Quests', art: 'cloud_quests', icon: 'quest_book', keys: ['q', 'l'], row: 1 },
  { id: 'upgrades', title: 'Upgrades', art: 'cloud_upgrades', icon: 'upgrade_icon', keys: ['u'], row: 1 },
  { id: 'looks', title: 'Your looks', art: 'cloud_keys', keys: ['y'], row: 2 },
  { id: 'teleport', title: 'Teleport', art: 'cloud_keys', icon: 'familiar_dialog_teleport', keys: ['t'], row: 2 },
  { id: 'home', title: 'Go home', art: 'cloud_home', keys: ['h'], row: 2 },
  { id: 'back', title: 'Back to world', art: 'cloud_back_to_world', keys: ['b'], row: 2 },
]);

/** The cloud shapes' size (imagination_clouds.swf), for the pictures cut to them. */
export const CLOUD_SIZE = Object.freeze({ cloud_home: [207, 80.3], cloud_back_to_world: [148.1, 54.75], cloud_keys: [49.7, 44.3] });

/** PURE: where a snapshot w x h goes in a box bw x bh: cover, centred across, 70% of the spare height down (the ground). */
export function coverRect(w, h, bw, bh) {
  const s = Math.max(bw / w, bh / h);
  const dw = w * s;
  const dh = h * s;
  return { x: (bw - dw) / 2, y: (bh - dh) * 0.7, w: dw, h: dh };
}

/** PURE: the home and world clouds' words and state for where you are (ImgMenuHome.as 24-30, ImgMenuBackToWorld.as 28-43). */
export function placeClouds(atHome) {
  return atHome
    ? { homeTitle: 'Back to world', homePicture: 'world', backDisabled: true }
    : { homeTitle: 'Go home', homePicture: 'home', backDisabled: false };
}

/** PURE: the cloud a key picks inside the hub, or null. */
export function hubKey(key) {
  const k = String(key || '').toLowerCase();
  return HUB_CLOUDS.find((c) => c.keys.includes(k))?.id || null;
}

/** PURE: X opens the hub under Classic only, with no modifier, not repeated, not typing. */
export function isHubKey(e, { classic, typing = false }) {
  if (!classic || !e || typing || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
  return String(e.key || '').toLowerCase() === 'x';
}

const typingIn = (t) => Boolean(t?.matches?.('input, textarea, select, [contenteditable="true"]'));

let hub = null;

function el(doc, tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

function shown(doc, id) {
  const n = doc.getElementById(id);
  return Boolean(n && !n.hidden && !n.closest('[hidden]'));
}

/** The game is running and nothing modal is up. */
function gameReady(doc) {
  if (doc.body?.classList.contains('is-booting')) return false;
  const start = doc.getElementById('overlay');
  if (start && !start.classList.contains('hidden')) return false;
  return true;
}

/** The game's view drawn into a cloud-sized JPEG data URL (an offscreen canvas, never on the page). */
async function snapshotUrl(engine, art) {
  const view = engine?.snapshotView?.({ resolution: 0.5 });
  if (!view?.width || !view?.height || typeof OffscreenCanvas !== 'function') return null;
  const [cw, ch] = CLOUD_SIZE[art];
  const c = new OffscreenCanvas(Math.round(cw * 2), Math.round(ch * 2));
  const ctx = c.getContext('2d');
  const r = coverRect(view.width, view.height, c.width, c.height);
  ctx.drawImage(view, r.x, r.y, r.w, r.h);
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || '') || null);
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(blob);
  });
}

function createHub(doc, win, { engine = null, avatarPortrait = null } = {}) {
  const root = doc.getElementById('game-root');
  if (!root) return null;
  const box = el(doc, 'section', { id: 'classic-hub', class: 'classic-hub', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Imagination', hidden: true });
  const close = el(doc, 'button', { type: 'button', class: 'classic-hub-close', 'aria-label': 'Close (X)' });
  close.append(el(doc, 'img', { src: classicArtUrl('img_close'), alt: '' }));
  const rows = [el(doc, 'div', { class: 'classic-hub-row is-row1' }), el(doc, 'div', { class: 'classic-hub-row is-row2' })];
  const buttons = [];
  for (const c of HUB_CLOUDS) {
    const b = el(doc, 'button', { type: 'button', class: 'classic-hub-cloud', 'data-hub-cloud': c.id, 'aria-keyshortcuts': c.keys.map((k) => k.toUpperCase()).join(' ') });
    b.style.setProperty('--i', String(buttons.length));
    const cloud = el(doc, 'span', { class: 'classic-hub-art' });
    cloud.append(el(doc, 'img', { src: classicArtUrl(c.art), alt: '' }));
    // A picture cut to the cloud's own shape (a second cloud as its mask).
    if (c.id === 'home' || c.id === 'back') {
      const pic = el(doc, 'img', { class: 'classic-hub-pic', alt: '', hidden: true });
      const mask = `url("${classicArtUrl(c.art)}") center / 100% 100% no-repeat`;
      pic.style.setProperty('-webkit-mask', mask);
      pic.style.setProperty('mask', mask);
      cloud.append(pic);
    }
    // Your looks: the avatar standing on its cloud, mirrored (ImgMenuYourLooks.as 22-63).
    if (c.id === 'looks') cloud.append(el(doc, 'img', { class: 'classic-hub-pic classic-hub-avatar', alt: '', hidden: true }));
    // What sat on the cloud (the skill book, the quest book, the upgrade cards; ImgMenuElement.as).
    if (c.icon) cloud.append(el(doc, 'img', { class: 'classic-hub-icon', src: classicArtUrl(c.icon), alt: '' }));
    b.append(el(doc, 'span', { class: 'classic-hub-title' }, c.title), cloud);
    b.addEventListener('click', () => pick(c.id));
    rows[c.row - 1].append(b);
    buttons.push(b);
  }
  box.append(close, ...rows);
  root.append(box);
  close.addEventListener('click', () => api.close());

  const cloudOf = (id) => buttons.find((b) => b.dataset.hubCloud === id);
  const setPic = (id, url) => {
    const pic = cloudOf(id)?.querySelector('.classic-hub-pic');
    if (!pic) return;
    if (url) pic.src = url;
    pic.hidden = !url;
  };
  const sound = (key) => { try { engine?.playSound?.(key, { volume: 0.5 }); } catch { /* audio off */ } };
  const atHome = () => {
    try { return Boolean(engine?.homeContext?.()?.inHome); } catch { return false; }
  };
  /** The home street as you last saw it here; refreshed while you stand on it (at most every 2 minutes). */
  let homeShotAt = 0;
  async function captureHome({ force = false } = {}) {
    try {
      const ctx = engine?.homeContext?.();
      if (!ctx?.inHome || ctx.room !== 'street') return;
      if (!force && (engine?.busy?.({ ignoreHome: true }) || Date.now() - homeShotAt < 120000)) return;
      homeShotAt = Date.now();
      const url = await snapshotUrl(engine, 'cloud_home');
      if (url) writeUiCache('home', url);
    } catch { /* no snapshot this time */ }
  }
  win.setInterval?.(captureHome, 10000);
  let worldUrl = null;
  async function refreshPictures() {
    const home = atHome();
    // Opened on the home street itself: that is the picture of home from now on.
    if (home) await captureHome({ force: true });
    const words = placeClouds(home);
    const homeCloud = cloudOf('home');
    homeCloud.querySelector('.classic-hub-title').textContent = words.homeTitle;
    cloudOf('back').disabled = words.backDisabled;
    try {
      if (!home) worldUrl = (await snapshotUrl(engine, 'cloud_back_to_world')) || worldUrl;
    } catch { /* keep the last */ }
    setPic('back', home ? null : worldUrl);
    setPic('home', words.homePicture === 'home' ? readUiCache('home') : worldUrl);
    try {
      setPic('looks', (await avatarPortrait?.()) || null);
    } catch { setPic('looks', null); }
  }

  const click = (id) => doc.getElementById(id)?.click();
  const key = (init) => win.dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, ...init }));
  function pick(id) {
    api.close();
    // After the hub has gone, so the panel's own focus and keys take over.
    win.setTimeout(() => {
      if (id === 'skills') click('skills-btn');
      else if (id === 'quests') click('quest-btn');
      else if (id === 'upgrades') click('img-btn');
      else if (id === 'looks') click('avatar-btn');
      else if (id === 'home') click('home-btn');
      else if (id === 'teleport') key({ key: 'T', code: 'KeyT', shiftKey: true });
    }, 0);
  }

  let returnFocus = null;
  const api = {
    isOpen: () => !box.hidden,
    open() {
      if (!box.hidden) return;
      returnFocus = doc.activeElement;
      refreshPictures();
      box.hidden = false;
      sound('IMAGINATION_OPEN');
      buttons.forEach((b, i) => win.setTimeout(() => { if (!box.hidden) sound(`CLOUD${i + 1}`); }, 100 * i));
      doc.querySelector('.top-bar .hud-img')?.classList.add('is-hub-open');
      buttons[2].focus({ preventScroll: true });
    },
    close() {
      if (box.hidden) return;
      box.hidden = true;
      sound('IMAGINATION_CLOSE');
      doc.querySelector('.top-bar .hud-img')?.classList.remove('is-hub-open');
      const back = returnFocus;
      returnFocus = null;
      if (back?.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
    },
    toggle() { if (api.isOpen()) api.close(); else api.open(); },
    /** QA: the cloud pictures now ({ home, world, looks } data URLs or null), and a fresh world snapshot. */
    pictures: () => Object.fromEntries(['home', 'back', 'looks'].map((id) => {
      const pic = cloudOf(id)?.querySelector('.classic-hub-pic');
      return [id, pic && !pic.hidden ? pic.src.slice(0, 40) : null];
    })),
    snapshot: (art = 'cloud_back_to_world') => snapshotUrl(engine, art),
    hasEngine: () => Boolean(engine?.snapshotView),
    /** Keys while it is open: they stay in the hub. */
    onKey(e) {
      const k = String(e.key || '');
      if (k === 'Escape' || hubKey(k) === null && k.toLowerCase() === 'x') { api.close(); return true; }
      const id = hubKey(k);
      if (id && !e.ctrlKey && !e.metaKey && !e.altKey) { if (id === 'back') api.close(); else pick(id); return true; }
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowUp') {
        const i = buttons.indexOf(doc.activeElement);
        const step = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1;
        buttons[(i + step + buttons.length) % buttons.length].focus({ preventScroll: true });
        return true;
      }
      if (k === 'Enter' || k === ' ' || k === 'Tab') return false;
      return true;
    },
  };
  return api;
}

// Registered on load, ahead of the features' window listeners (see the top of the file).
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (!hub) return;
    const classic = uiState().mode === 'classic';
    if (hub.isOpen()) {
      if (!classic) { hub.close(); return; }
      if (hub.onKey(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }
    if (!isHubKey(e, { classic, typing: typingIn(e.target) || typingIn(document.activeElement) })) return;
    if (!gameReady(document) || shown(document, 'imagination-panel')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    hub.open();
  }, true);
}

export function installClassicHub({ doc = globalThis.document, win = globalThis, engine = null, avatarPortrait = null } = {}) {
  hub = createHub(doc, win, { engine, avatarPortrait });
  if (!hub) return null;
  // The iMG button in the ear opens the hub under Classic (ImaginationButton.as), not the cards.
  doc.addEventListener('click', (e) => {
    if (uiState().mode !== 'classic' || !e.target?.closest?.('.top-bar .hud-img')) return;
    e.preventDefault();
    e.stopPropagation();
    hub.toggle();
  }, true);
  onUiModeChange((now) => { if (now.mode !== 'classic') hub.close(); });
  win.groddleClassicHub = hub;
  return hub;
}
