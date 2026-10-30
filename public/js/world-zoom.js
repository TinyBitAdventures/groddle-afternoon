/**
 * ZOOM (Austin 2026-10-30): how close the world is drawn, a device preference.
 *
 * 0 is "Wide", the stage's own rule (js/location-view.js stageFor: about 1:1 up
 * to a 1680 x 720 view, magnified past that). 1 is
 * "Original", what new players get (Austin 2026-10-30): a view about 1000 px wide (the 2012 client's max_vp_w x max_vp_h,
 * 1000 x 600, LayoutModel.as 12-13) magnified to fill the window, as the old
 * remake magnified its 960 px view, so the world looks big and close. Values
 * between are continuous. stageFor never goes under its 960 x 408 floor, so
 * Original is as close as it gets.
 *
 * The level lives in localStorage['groddle.zoom'] on this device only (read and
 * written in try/catch: private windows), never in a save and never sent to the
 * realtime server: it changes only how this window draws the street.
 *
 * Controls: the Menu's Settings group and the Sound popover (js/ui/topbar.js),
 * Preferences on `,` (js/classic/classic-prefs.js), and the keys `=` (or `+`)
 * closer, `-` wider and `0` back to Original (zoomKeyAction), the 2012 client's own
 * zoom keys (TSFrontController.as startListeningToZoomKeys 3181-3192 and
 * zoomKeyHandler 3209-3227: 0 resets, minus and equal step, held keys repeat; its
 * zoom went the other way, out from 1:1, behind the Zoomability card). Ctrl or
 * Cmd with +/- stays the browser's own page zoom.
 */

export const ZOOM_STORAGE_KEY = 'groddle.zoom';
export const ZOOM_EVENT = 'groddle:zoom';
export const ZOOM_WIDE = 0;
export const ZOOM_ORIGINAL = 1;
/** Where a player who never chose starts, and where `0` goes back to. */
export const ZOOM_DEFAULT = ZOOM_ORIGINAL;
/** One `=` or `-` press: ten presses from Wide to Original. */
export const ZOOM_KEY_STEP = 0.1;

/** PURE: a zoom level 0..1 from anything (the default when unreadable), on a 1/100 grid. */
export function clampZoom(v) {
  const n = Number(v);
  if (v === null || v === '' || !Number.isFinite(n)) return ZOOM_DEFAULT;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

/** PURE: the live label: "Wide", "Original", or how far along, in percent. */
export function zoomLabel(z) {
  const v = clampZoom(z);
  if (v <= 0) return 'Wide';
  if (v >= 1) return 'Original';
  return `${Math.round(v * 100)}%`;
}

/** PURE: the words a screen reader hears for a level. */
export function zoomValueText(z) {
  const v = clampZoom(z);
  if (v <= 0) return 'Wide';
  if (v >= 1) return 'Original, the closest';
  return `${Math.round(v * 100)}% of the way from Wide to Original`;
}

/**
 * PURE: the zoom key a keydown is, or null: 'in' for `=` or `+`, 'out' for `-`,
 * 'reset' for `0`. Ctrl, Alt and Cmd combinations are the browser's.
 */
export function zoomKeyAction(e) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return null;
  const k = String(e.key || '');
  if (k === '=' || k === '+') return 'in';
  if (k === '-') return 'out';
  if (k === '0') return 'reset';
  return null;
}

/** PURE: the level after a zoom key. */
export function nextZoom(z, action) {
  const v = clampZoom(z);
  if (action === 'in') return clampZoom(v + ZOOM_KEY_STEP);
  if (action === 'out') return clampZoom(v - ZOOM_KEY_STEP);
  if (action === 'reset') return ZOOM_DEFAULT;
  return v;
}

export function loadZoom(storage) {
  try {
    return clampZoom(storage?.getItem(ZOOM_STORAGE_KEY) ?? null);
  } catch {
    return ZOOM_DEFAULT;
  }
}

export function saveZoom(z, storage) {
  try {
    const v = clampZoom(z);
    // Every choice is kept, Wide too: an empty slot reads as the default (Original).
    storage?.setItem(ZOOM_STORAGE_KEY, String(v));
  } catch {
    /* the level just won't be remembered */
  }
}

/**
 * The zoom for one window (the module's default binds globalThis; tests pass a fake).
 * set() stores the level, tells onZoomChange listeners (the stage, the sliders) and
 * sends `groddle:zoom` on the window.
 */
export function createWorldZoom({ win = globalThis, storage } = {}) {
  const store = storage !== undefined ? storage : (() => { try { return win?.localStorage; } catch { return null; } })();
  let level = loadZoom(store);
  const listeners = new Set();
  return {
    get: () => level,
    set(z) {
      const v = clampZoom(z);
      if (v === level) return level;
      const before = level;
      level = v;
      saveZoom(v, store);
      for (const fn of [...listeners]) {
        try { fn(v, before); } catch (err) { console.error(err); }
      }
      try {
        if (typeof win?.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent(ZOOM_EVENT, { detail: { zoom: v, before } }));
      } catch { /* no window events (tests) */ }
      return level;
    },
    step(action) {
      return this.set(nextZoom(level, action));
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const zoom = createWorldZoom();
/** This window's zoom level, 0 (Wide) to 1 (Original). */
export const worldZoom = () => zoom.get();
export const setWorldZoom = (z) => zoom.set(z);
export const stepWorldZoom = (action) => zoom.step(action);
export const onZoomChange = (fn) => zoom.onChange(fn);
