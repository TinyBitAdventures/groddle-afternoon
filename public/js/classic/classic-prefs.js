/**
 * Where a player picks the interface (Austin 2026-10-30): the Menu item
 * "Interface: Classic" (or "Interface: Modern" once Classic is chosen) and the
 * Preferences window on `,` (the client's commaKeyHandler, TSMainView.as
 * 806-814, PrefsDialog.as 44-275). One key map for both skins, so `,` opens
 * Preferences in either.
 *
 * Preferences shows only what works (open question 5): Interface (Modern or
 * Classic), with Classic chosen "Original window size" (open question 2:
 * the world at the 2012 client's 1000 x 600), and in both skins the world Zoom
 * (js/world-zoom.js: Wide to Original; Original window size already is the
 * 2012 picture, so the slider rests while it is on). The original's six checkboxes
 * have nothing behind them here and are left out. Changes apply at once, so the
 * window has Done where the original had Save.
 *
 * The window is built on first open. Keys pressed in it stay in it, so the
 * game's movement keys never fire under it; Esc, `,` and Done close it and
 * focus goes back where it was. Its modern look is the <style> below; Classic
 * restyles it in public/css/classic.css.
 */
import { CLASSIC, MODERN, onUiModeChange, setUiMode, setUiSize, uiState } from './ui-mode.js?v=g476-1';
import { CLASSIC_MIN_W, CLASSIC_MIN_H } from './classic-layout.js?v=g476-1';
import { installClassicChrome } from './classic-chrome.js?v=g476-2';
import { clampZoom, onZoomChange, setWorldZoom, worldZoom, zoomLabel, zoomValueText } from '../world-zoom.js?v=g476-1';

export const PREFS_TITLE = 'Preferences';

/** The Menu item's words for the player's choice: it offers the other skin. */
export function interfaceMenuLabel(pref) {
  return pref === CLASSIC
    ? { label: 'Interface: Modern', title: 'Switch to the Modern interface (Preferences: ,)' }
    : { label: 'Interface: Classic', title: 'Switch to the Classic interface, the 2012 look (Preferences: ,)' };
}

/** The keydown that opens or closes Preferences: `,` with no Ctrl, Alt or Cmd (Cmd+, is the browser's). */
export function isPreferencesKey(e) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return false;
  return e.key === ',' || (e.code === 'Comma' && !e.shiftKey);
}

/** Typing in a field keeps its comma. */
const typingIn = (t) => Boolean(t?.matches?.('input[type="text"], input[type="search"], input[type="email"], input[type="password"], input:not([type]), textarea, select, [contenteditable="true"]'));

export const PREFS_STYLE = `
.prefs-shade { position: fixed; inset: 0; z-index: var(--z-dialog); display: grid; place-items: center; padding: var(--sp-8); background: color-mix(in srgb, var(--c-sage-23) 30%, transparent); }
.prefs-shade[hidden] { display: none; }
.prefs-window { position: relative; width: min(26rem, 100%); max-height: calc(100vh - 2rem); overflow: auto; border-radius: var(--radius-2xl); padding: var(--sp-8) var(--sp-9) var(--sp-9);
  background: var(--surface-card); color: var(--text); box-shadow: var(--shadow-3); font: var(--fs-base)/var(--lh-loose) var(--font-ui); }
.prefs-window h2 { margin: 0 0 var(--sp-5); font-size: var(--fs-xl); color: var(--text-heading); }
.prefs-window fieldset { margin: 0 0 var(--sp-6); padding: 0; border: 0; }
.prefs-window legend { padding: 0; margin-bottom: var(--sp-3); font-weight: 700; }
.prefs-window .prefs-choice { display: flex; align-items: flex-start; gap: var(--sp-4); padding: var(--sp-3) 0; cursor: pointer; }
.prefs-window .prefs-choice input { margin: var(--sp-1) 0 0; accent-color: var(--accent); }
.prefs-window .prefs-choice small { display: block; color: var(--text-muted); }
.prefs-window .prefs-note { margin: var(--sp-2) 0 0; color: var(--text-muted); font-size: var(--fs-sm); }
.prefs-window .prefs-note[hidden], .prefs-window .prefs-choice[hidden] { display: none; }
.prefs-window .prefs-foot { display: flex; justify-content: flex-end; margin-top: var(--sp-6); }
.prefs-window .prefs-done { font: inherit; font-weight: 700; border: 0; border-radius: var(--radius-md); padding: var(--sp-4) var(--sp-8); cursor: pointer;
  color: var(--text-inverse); background: linear-gradient(180deg, var(--c-orange-76), var(--c-orange-68)); box-shadow: 0 2px 0 var(--c-orange-57); }
.prefs-window .prefs-close { position: absolute; top: var(--sp-5); right: var(--sp-5); border: 0; padding: var(--sp-1) var(--sp-4); background: transparent; color: var(--text-muted);
  font-size: var(--fs-2xl); line-height: var(--lh-none); cursor: pointer; }
.prefs-window .prefs-zoom { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: var(--sp-2) var(--sp-4); margin: var(--sp-4) 0 var(--sp-6); }
.prefs-window .prefs-zoom label { font-weight: 700; }
.prefs-window .prefs-zoom input { grid-column: 1 / -1; width: 100%; margin: 0; accent-color: var(--accent); }
.prefs-window .prefs-zoom-ends { grid-column: 1 / -1; display: flex; justify-content: space-between; color: var(--text-muted); font-size: var(--fs-sm); }
.prefs-window .prefs-zoom .prefs-note { grid-column: 1 / -1; }
.prefs-window button:focus-visible, .prefs-window input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`;

function el(doc, tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

/**
 * The Preferences window (built on first open).
 * @param {Document} doc
 */
export function createPreferences(doc) {
  let shade = null;
  let returnFocus = null;
  const parts = {};

  const sync = () => {
    if (!shade) return;
    const s = uiState();
    for (const r of parts.radios) r.checked = r.value === s.pref;
    parts.size.checked = s.size === 'original';
    parts.sizeRow.hidden = s.pref !== CLASSIC;
    parts.small.hidden = !s.forced;
    // ZOOM: "Original window size" is the 2012 picture at 1:1, so the zoom rests while Classic shows it.
    const held = s.mode === CLASSIC && s.size === 'original';
    const z = clampZoom(worldZoom());
    parts.zoom.disabled = held;
    if (doc.activeElement !== parts.zoom) parts.zoom.value = String(Math.round(z * 100));
    parts.zoomOut.textContent = zoomLabel(z);
    parts.zoom.setAttribute('aria-valuetext', zoomValueText(z));
    parts.zoomHeld.hidden = !held;
  };

  const build = () => {
    const style = el(doc, 'style', { id: 'prefs-css' });
    style.textContent = PREFS_STYLE;
    doc.head.append(style);
    shade = el(doc, 'div', { id: 'prefs-shade', class: 'prefs-shade', hidden: true });
    const win = el(doc, 'section', { id: 'prefs-window', class: 'prefs-window', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'prefs-title' });
    const close = el(doc, 'button', { type: 'button', class: 'prefs-close', 'aria-label': 'Close' }, '×');
    const title = el(doc, 'h2', { id: 'prefs-title' }, PREFS_TITLE);
    const group = el(doc, 'fieldset', { class: 'prefs-interface' });
    group.append(el(doc, 'legend', {}, 'Interface'));
    parts.radios = [];
    for (const [value, label, hint] of [
      [MODERN, 'Modern', 'The game as new players see it.'],
      [CLASSIC, 'Classic', 'The 2012 look: the face and energy arc, the chat column, the pack along the foot.'],
    ]) {
      const row = el(doc, 'label', { class: 'prefs-choice', 'data-prefs-ui': value });
      const input = el(doc, 'input', { type: 'radio', name: 'prefs-ui', value });
      input.addEventListener('change', () => { if (input.checked) setUiMode(value); });
      const words = el(doc, 'span', {}, label);
      words.append(el(doc, 'small', {}, hint));
      row.append(input, words);
      group.append(row);
      parts.radios.push(input);
    }
    parts.small = el(doc, 'p', { class: 'prefs-note', 'data-prefs-note': 'small-window', hidden: true },
      `Classic shows on windows at least ${CLASSIC_MIN_W} by ${CLASSIC_MIN_H}. Make the window bigger to see it.`);
    group.append(parts.small);
    parts.sizeRow = el(doc, 'label', { class: 'prefs-choice prefs-size', 'data-prefs-size': '', hidden: true });
    parts.size = el(doc, 'input', { type: 'checkbox', id: 'prefs-original-size' });
    parts.size.addEventListener('change', () => setUiSize(parts.size.checked ? 'original' : 'fill'));
    const sizeWords = el(doc, 'span', {}, 'Original window size');
    sizeWords.append(el(doc, 'small', {}, 'The world at 1000 by 600, as the 2012 client drew it, with the page around it.'));
    parts.sizeRow.append(parts.size, sizeWords);
    // ZOOM: the world zoom, the same slider as the Menu's (js/world-zoom.js).
    const zoomBox = el(doc, 'div', { class: 'prefs-zoom', 'data-zoom-control': 'prefs' });
    const zoomLbl = el(doc, 'label', { for: 'prefs-zoom' }, 'Zoom');
    parts.zoom = el(doc, 'input', { type: 'range', id: 'prefs-zoom', min: '0', max: '100', step: '1', 'aria-describedby': 'prefs-zoom-ends' });
    parts.zoomOut = el(doc, 'output', { for: 'prefs-zoom' });
    const zoomEnds = el(doc, 'span', { id: 'prefs-zoom-ends', class: 'prefs-zoom-ends' });
    zoomEnds.append(el(doc, 'span', {}, 'Wide'), el(doc, 'span', {}, 'Original'));
    parts.zoomHeld = el(doc, 'p', { class: 'prefs-note', 'data-prefs-note': 'zoom-held', hidden: true }, 'Original window size keeps the world at 1000 by 600, so zoom waits until it is off.');
    zoomBox.append(zoomLbl, parts.zoom, parts.zoomOut, zoomEnds, parts.zoomHeld);
    parts.zoom.addEventListener('input', () => {
      setWorldZoom(clampZoom(Number(parts.zoom.value) / 100));
      sync();
    });
    const foot = el(doc, 'div', { class: 'prefs-foot' });
    const done = el(doc, 'button', { type: 'button', class: 'prefs-done' }, 'Done');
    foot.append(done);
    win.append(close, title, group, parts.sizeRow, zoomBox, foot);
    shade.append(win);
    doc.body.append(shade);
    close.addEventListener('click', () => api.close());
    done.addEventListener('click', () => api.close());
    shade.addEventListener('pointerdown', (e) => { if (e.target === shade) api.close(); });
    // Keys pressed in the window stay in it: the game's movement keys must not fire under it.
    shade.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || (isPreferencesKey(e) && !typingIn(e.target))) {
        e.preventDefault();
        api.close();
      }
    });
    onUiModeChange(sync);
    onZoomChange(sync);
  };

  const api = {
    isOpen: () => Boolean(shade && !shade.hidden),
    open() {
      if (!shade) build();
      if (!api.isOpen()) returnFocus = doc.activeElement;
      sync();
      shade.hidden = false;
      (parts.radios.find((r) => r.checked) || parts.radios[0]).focus({ preventScroll: true });
    },
    close() {
      if (!api.isOpen()) return;
      shade.hidden = true;
      const back = returnFocus;
      returnFocus = null;
      if (back && typeof back.focus === 'function' && back.isConnected) back.focus({ preventScroll: true });
    },
    toggle() {
      if (api.isOpen()) api.close();
      else api.open();
    },
  };
  return api;
}

/**
 * The Menu item, the `,` key and the Classic chrome (game.js calls this once, after installMoreMenu).
 * @param {{ doc?: Document, engine?: object, avatarPortrait?: () => Promise<string|null> }} [o]
 * @returns {{ prefs: ReturnType<typeof createPreferences> }}
 */
export function installInterfaceSettings({ doc = globalThis.document, engine = null, avatarPortrait = null } = {}) {
  const prefs = createPreferences(doc);
  const list = doc.getElementById('more-list');
  if (list && !doc.getElementById('interface-btn')) {
    const btn = el(doc, 'button', { id: 'interface-btn', type: 'button', class: 'chrome-btn interface-chrome-btn' });
    const label = () => {
      const { label: text, title } = interfaceMenuLabel(uiState().pref);
      btn.textContent = text;
      btn.title = title;
    };
    label();
    btn.addEventListener('click', () => setUiMode(uiState().pref === CLASSIC ? MODERN : CLASSIC));
    onUiModeChange(label);
    list.append(btn);
  }
  doc.addEventListener('keydown', (e) => {
    if (!isPreferencesKey(e) || e.repeat || typingIn(e.target)) return;
    if (prefs.isOpen()) return; // the window's own handler closes it
    // Not while the loading card or the start card is up.
    if (doc.body?.classList.contains('is-booting')) return;
    const start = doc.getElementById('overlay');
    if (start && !start.classList.contains('hidden')) return;
    e.preventDefault();
    prefs.open();
  });
  const chrome = installClassicChrome({ doc, engine, avatarPortrait });
  return { prefs, chrome };
}
