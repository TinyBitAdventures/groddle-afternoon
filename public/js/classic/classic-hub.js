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
 * The key listener is registered when this module loads (before the features' own listeners, which
 * come with the game's init), so under Classic it takes X first. It never takes X while typing, while
 * the loading or start card is up, or while the upgrade cards are open (X closes those, as before).
 */
import { uiState, onUiModeChange } from './ui-mode.js?v=g468-1';
import { classicArtUrl } from './classic-art.js?v=g468-1';

/** The clouds, in the client's two rows (ImgMenuView.as 343-415). */
export const HUB_CLOUDS = Object.freeze([
  { id: 'skills', title: 'Skills', art: 'cloud_skills', icon: 'skill_book_small', keys: ['s'], row: 1 },
  { id: 'quests', title: 'Quests', art: 'cloud_quests', icon: 'quest_book', keys: ['q', 'l'], row: 1 },
  { id: 'upgrades', title: 'Upgrades', art: 'cloud_upgrades', icon: 'upgrade_icon', keys: ['u'], row: 1 },
  { id: 'looks', title: 'Your looks', art: 'cloud_keys', keys: ['y'], row: 2 },
  { id: 'teleport', title: 'Teleport', art: 'cloud_keys', keys: ['t'], row: 2 },
  { id: 'home', title: 'Go home', art: 'cloud_home', keys: ['h'], row: 2 },
  { id: 'back', title: 'Back to world', art: 'cloud_back_to_world', keys: ['b'], row: 2 },
]);

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

function createHub(doc, win) {
  const root = doc.getElementById('game-root');
  if (!root) return null;
  const box = el(doc, 'section', { id: 'classic-hub', class: 'classic-hub', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Imagination', hidden: true });
  const close = el(doc, 'button', { type: 'button', class: 'classic-hub-close', 'aria-label': 'Close (X)' });
  close.append(el(doc, 'img', { src: classicArtUrl('img_close'), alt: '' }));
  const rows = [el(doc, 'div', { class: 'classic-hub-row is-row1' }), el(doc, 'div', { class: 'classic-hub-row is-row2' })];
  const buttons = [];
  for (const c of HUB_CLOUDS) {
    const b = el(doc, 'button', { type: 'button', class: 'classic-hub-cloud', 'data-hub-cloud': c.id, 'aria-keyshortcuts': c.keys.map((k) => k.toUpperCase()).join(' ') });
    const cloud = el(doc, 'span', { class: 'classic-hub-art' });
    cloud.append(el(doc, 'img', { src: classicArtUrl(c.art), alt: '' }));
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
      box.hidden = false;
      doc.querySelector('.top-bar .hud-img')?.classList.add('is-hub-open');
      buttons[2].focus({ preventScroll: true });
    },
    close() {
      if (box.hidden) return;
      box.hidden = true;
      doc.querySelector('.top-bar .hud-img')?.classList.remove('is-hub-open');
      const back = returnFocus;
      returnFocus = null;
      if (back?.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
    },
    toggle() { if (api.isOpen()) api.close(); else api.open(); },
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

export function installClassicHub({ doc = globalThis.document, win = globalThis } = {}) {
  hub = createHub(doc, win);
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
