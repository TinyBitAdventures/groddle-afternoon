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

/**
 * The keys, in plain words, under every Zoom slider (the Menu, the Sound popover and
 * Preferences), so a player who never saw the Zoomability card learns them (player
 * report on v0.7.0: 0 went back to Original and there seemed no key back out).
 */
export const ZOOM_KEYS_HINT = 'Keys: - out, = in, 0 Original';

/**
 * PURE: the brief notice a zoom key shows, or '' for none. Only `0` says anything:
 * it jumps all the way, so it says where it went and the way back out.
 */
export function zoomKeyToast(action, fixed = false) {
  if (fixed && action) return `Zoom: ${ZOOM_FIXED_NOTE.charAt(0).toLowerCase()}${ZOOM_FIXED_NOTE.slice(1)}`;
  return action === 'reset' ? 'Zoom: Original (press - to zoom out)' : '';
}

/**
 * FIXED (#149, 2026-11-08): on a street whose narrowest layer is about as wide as the Original
 * view (the Heights climbs: Clamber Crag's sky is 1000 px), the view never grows wider than that
 * layer (TSMainView.as 514, lm.max_vp_w = Math.min(lm.max_vp_w, layer.w); location-view.js
 * sceneViewWidthCap), so Wide and Original draw the same picture. The game marks such a street
 * fixed (Modern only: Classic's zoom also scales its frame), and then the keys leave the level
 * alone and say why, and the sliders show this note instead of the keys.
 */
export const ZOOM_FIXED_NOTE = 'This street looks the same at every zoom.';

/** PURE: the level after a zoom key. */
export function nextZoom(z, action) {
  const v = clampZoom(z);
  if (action === 'in') return clampZoom(v + ZOOM_KEY_STEP);
  if (action === 'out') return clampZoom(v - ZOOM_KEY_STEP);
  if (action === 'reset') return ZOOM_DEFAULT;
  return v;
}

export function loadZoom(storage, key = ZOOM_STORAGE_KEY, fallback = ZOOM_DEFAULT) {
  try {
    const raw = storage?.getItem(key) ?? null;
    return raw === null || raw === '' ? fallback : clampZoom(raw);
  } catch {
    return fallback;
  }
}

export function saveZoom(z, storage, key = ZOOM_STORAGE_KEY) {
  try {
    const v = clampZoom(z);
    // Every choice is kept, Wide too: an empty slot reads as the default (Original).
    storage?.setItem(key, String(v));
  } catch {
    /* the level just won't be remembered */
  }
}

/**
 * PHONE ZOOM (Austin 2026-11-12 on his iPhone: "It's a bit hard to hit the street signs. Maybe
 * zooming feature would be all it needs?"): an upright phone (js/location-view.js phoneStage)
 * already fits the whole street's height to the screen, so Wide and Original draw the same there.
 * Its own level goes the other way, closer: 0 is that whole-street view (where a phone starts), 1
 * the closest, a 408 px tall view (VIEW_FLOOR_H, the smallest any room was tuned for), about twice
 * as big on a 1000 px street. Same model as the world zoom (0 to 1, continuous, geometric), its
 * own slot on the device, never in a save; a two-finger pinch on the street moves it
 * (js/touch-pinch.js), as does the Menu's Zoom slider on a phone.
 */
export const PHONE_ZOOM_STORAGE_KEY = 'groddle.zoom.phone';
export const PHONE_ZOOM_DEFAULT = 0;
/** The phone slider's ends and the line under it (no keys on a phone). */
export const PHONE_ZOOM_ENDS = Object.freeze(['Whole street', 'Closest']);
export const PHONE_ZOOM_HINT = 'Pinch the street with two fingers to zoom.';

/** PURE: the phone level's live label. */
export function phoneZoomLabel(z) {
  const v = clampZoom(z);
  if (v <= 0) return PHONE_ZOOM_ENDS[0];
  if (v >= 1) return PHONE_ZOOM_ENDS[1];
  return `${Math.round(v * 100)}%`;
}

/** PURE: the words a screen reader hears for a phone level. */
export function phoneZoomValueText(z) {
  const v = clampZoom(z);
  if (v <= 0) return 'Whole street';
  if (v >= 1) return 'Closest';
  return `${Math.round(v * 100)}% of the way from the whole street to the closest`;
}

/**
 * The zoom for one window (the module's default binds globalThis; tests pass a fake).
 * set() stores the level, tells onZoomChange listeners (the stage, the sliders) and
 * sends `groddle:zoom` on the window.
 */
export function createWorldZoom({ win = globalThis, storage, key = ZOOM_STORAGE_KEY, fallback = ZOOM_DEFAULT } = {}) {
  const store = storage !== undefined ? storage : (() => { try { return win?.localStorage; } catch { return null; } })();
  let level = loadZoom(store, key, fallback);
  let fixed = false;
  const listeners = new Set();
  const fixedListeners = new Set();
  return {
    get: () => level,
    /** FIXED: true while this street draws the same at every level (set by the game per street and window). */
    fixed: () => fixed,
    setFixed(f) {
      const v = Boolean(f);
      if (v === fixed) return fixed;
      fixed = v;
      for (const fn of [...fixedListeners]) {
        try { fn(v); } catch (err) { console.error(err); }
      }
      return fixed;
    },
    onFixedChange(fn) {
      fixedListeners.add(fn);
      return () => fixedListeners.delete(fn);
    },
    set(z) {
      const v = clampZoom(z);
      if (v === level) return level;
      const before = level;
      level = v;
      saveZoom(v, store, key);
      for (const fn of [...listeners]) {
        try { fn(v, before); } catch (err) { console.error(err); }
      }
      try {
        if (typeof win?.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent(ZOOM_EVENT, { detail: { zoom: v, before } }));
      } catch { /* no window events (tests) */ }
      return level;
    },
    step(action) {
      // FIXED: a key changes nothing on this street, so the level (this device's choice for every street) stays.
      if (fixed) return level;
      return this.set(action === 'reset' ? fallback : nextZoom(level, action));
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
export const zoomFixed = () => zoom.fixed();
export const setZoomFixed = (f) => zoom.setFixed(f);
export const onZoomFixedChange = (fn) => zoom.onFixedChange(fn);

const phone = createWorldZoom({ key: PHONE_ZOOM_STORAGE_KEY, fallback: PHONE_ZOOM_DEFAULT });
/** PHONE ZOOM: this phone's close-up level, 0 (the whole street) to 1 (the closest); the same API as the world zoom. */
export const phoneZoom = Object.freeze({
  phone: true,
  get: () => phone.get(),
  set: (z) => phone.set(z),
  onChange: (fn) => phone.onChange(fn),
  fixed: () => phone.fixed(),
  setFixed: (f) => phone.setFixed(f),
  onFixedChange: (fn) => phone.onFixedChange(fn),
});
