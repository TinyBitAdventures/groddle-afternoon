/**
 * The interface skin (Austin 2026-10-30): Modern (the default, what new
 * players see) or Classic (the late-2012 client's chrome over the same game).
 * One copy of game logic; the skin is `<html data-ui="modern|classic">`, and
 * every Classic rule is scoped under `:root[data-ui="classic"]`
 * (public/css/classic.css). The player-facing name is "Classic", never a brand.
 *
 * Which skin a page shows, in order:
 *   1. `?ui=classic|modern`, a QA and share flag, solo only. /play/online/
 *      strips every query param before any module loads (js/game-mode.js), and
 *      this ignores the flag in a multiplayer game even if one got through. The
 *      flag holds for that page load; it never changes the saved choice.
 *   2. localStorage['groddle.ui'] (the player's choice in Preferences or the
 *      Menu), read and written inside try/catch (private windows).
 *   3. Modern.
 * Classic is desktop only (open question 11): a window under 960 x 540 CSS px
 * shows Modern, and the saved choice comes back when the window grows.
 *
 * "Original window size" (open question 2) is a Classic-only choice in
 * localStorage['groddle.ui.size'] ('fill', the default, or 'original': the
 * world capped at 1000 x 600 as in 2012), shown as `data-ui-size`.
 *
 * Early apply: importing this module sets the attributes, and game.js imports
 * it first, so the skin is on <html> before endBoot() uncovers the HUD (the
 * boot cover hides it until then: no flash of the wrong skin).
 *
 * A change (setUiMode, setUiSize, or a resize across the desktop floor) sets the
 * attributes, tells onUiModeChange listeners and the `groddle:ui-mode` window
 * event, and dispatches `resize` so the stage and the pack pagers measure again
 * (game.js syncLocationViewHeight, refreshPackPagers).
 */
import { classicAllowed } from './classic-layout.js?v=299eef68';

export const MODERN = 'modern';
export const CLASSIC = 'classic';
export const UI_MODES = Object.freeze([MODERN, CLASSIC]);
export const UI_SIZES = Object.freeze(['fill', 'original']);
export const UI_STORAGE_KEY = 'groddle.ui';
export const UI_SIZE_KEY = 'groddle.ui.size';
export const UI_MODE_EVENT = 'groddle:ui-mode';

const modeOr = (v, d = null) => (UI_MODES.includes(v) ? v : d);
const sizeOr = (v, d = 'fill') => (UI_SIZES.includes(v) ? v : d);

/**
 * PURE: the skin a page shows.
 * @param {{ search?: string, stored?: string|null, online?: boolean, width?: number, height?: number }} o
 * @returns {{ mode: 'modern'|'classic', pref: 'modern'|'classic', source: 'url'|'storage'|'default', forced: boolean }}
 *   pref is what the player (or the URL) asked for; mode is what shows (forced: the window is too small).
 */
export function resolveUiMode({ search = '', stored = null, online = false, width = Infinity, height = Infinity } = {}) {
  let pref = null;
  let source = 'default';
  if (!online) {
    let flag = null;
    try { flag = new URLSearchParams(search).get('ui'); } catch { flag = null; }
    pref = modeOr(flag);
    if (pref) source = 'url';
  }
  if (!pref) {
    pref = modeOr(stored);
    if (pref) source = 'storage';
  }
  if (!pref) pref = MODERN;
  const forced = pref === CLASSIC && !classicAllowed(width, height);
  return { mode: forced ? MODERN : pref, pref, source, forced };
}

function readStore(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function writeStore(storage, key, value) {
  try { storage?.setItem(key, value); return true; } catch { return false; }
}

/**
 * The switch for one window (the module's default binds globalThis; tests pass a fake).
 * @param {{ win?: any, doc?: any, storage?: any }} scope
 */
export function createUiMode({ win = globalThis, doc = globalThis.document, storage } = {}) {
  const store = storage !== undefined ? storage : (() => { try { return win?.localStorage; } catch { return null; } })();
  const online = (() => { try { return win?.GRODDLE_MODE === 'multiplayer'; } catch { return false; } })();
  // The URL flag is read once: it is this page load's choice until the player picks in Preferences.
  let urlSearch = (() => { try { return String(win?.location?.search || ''); } catch { return ''; } })();
  const listeners = new Set();
  let current = null;

  const size = () => sizeOr(readStore(store, UI_SIZE_KEY));
  const resolve = () => resolveUiMode({
    search: urlSearch,
    stored: readStore(store, UI_STORAGE_KEY),
    online,
    width: Number(win?.innerWidth) || Infinity,
    height: Number(win?.innerHeight) || Infinity,
  });

  const apply = () => {
    const r = { ...resolve(), size: size() };
    const root = doc?.documentElement;
    if (root) {
      root.dataset.ui = r.mode;
      root.dataset.uiPref = r.pref;
      root.dataset.uiSize = r.size;
      if (r.forced) root.dataset.uiForced = 'small-window';
      else delete root.dataset.uiForced;
    }
    const changed = !current || current.mode !== r.mode || current.size !== r.size || current.pref !== r.pref;
    const before = current;
    current = r;
    return { changed, before, now: r };
  };

  let relaying = false;
  const announce = (now, before) => {
    for (const fn of [...listeners]) {
      try { fn(now, before); } catch (err) { console.error(err); }
    }
    try {
      if (typeof win?.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent(UI_MODE_EVENT, { detail: { ...now } }));
    } catch { /* no window events (tests) */ }
    // The stage, the pack pagers and anything else that measures on resize measure again.
    try {
      relaying = true;
      if (typeof win?.Event === 'function') win.dispatchEvent(new win.Event('resize'));
    } catch { /* tests */ } finally { relaying = false; }
  };

  const update = () => {
    const { changed, before, now } = apply();
    if (changed && before) announce(now, before);
    return now;
  };

  apply();
  try {
    win?.addEventListener?.('resize', () => {
      if (relaying) return;
      // A window crossing the desktop floor flips the shown skin; the game's own resize handlers have
      // already measured, so the relayed resize lets them measure the new skin.
      const { changed, before, now } = apply();
      if (changed && before) queueMicrotask(() => announce(now, before));
    });
  } catch { /* tests */ }

  return {
    /** The skin showing now: 'modern' or 'classic'. */
    mode: () => current.mode,
    /** Everything: { mode, pref, source, forced, size }. */
    state: () => ({ ...current }),
    /** The player's choice, saved; drops this page's ?ui= flag. */
    setMode(m) {
      const mode = modeOr(m);
      if (!mode) return current;
      writeStore(store, UI_STORAGE_KEY, mode);
      urlSearch = '';
      return update();
    },
    setSize(s) {
      const v = sizeOr(s, null);
      if (!v) return current;
      writeStore(store, UI_SIZE_KEY, v);
      return update();
    },
    /** fn(now, before) on every change; returns the unsubscribe. */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const ui = createUiMode();

/** Classic's own small pictures (the hub's home and world snapshots), kept on this device; try/catch throughout. */
export const UI_CACHE_PREFIX = 'groddle.ui.cache.';
export function readUiCache(key, storage = (() => { try { return globalThis.localStorage; } catch { return null; } })()) {
  return readStore(storage, UI_CACHE_PREFIX + key);
}
export function writeUiCache(key, value, storage = (() => { try { return globalThis.localStorage; } catch { return null; } })()) {
  return writeStore(storage, UI_CACHE_PREFIX + key, String(value));
}

/** The skin showing now. */
export const uiMode = () => ui.mode();
export const uiState = () => ui.state();
export const setUiMode = (m) => ui.setMode(m);
export const setUiSize = (s) => ui.setSize(s);
export const onUiModeChange = (fn) => ui.onChange(fn);
