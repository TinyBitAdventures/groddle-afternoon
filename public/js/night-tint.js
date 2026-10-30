/**
 * NIGHT TINT (POLISH 2026-10-30): whether the world darkens with the game clock,
 * a device preference like the zoom (js/world-zoom.js).
 *
 * The remake tints the street by Dametime (js/game-day.js daylightState: dawn,
 * day, dusk, night). The 2012 client had no world tint at all, so a player can
 * turn it off. On is the default and keeps the current look; off means no tint at
 * any hour. A place with its own light (`ownLight: true`) is never tinted either way.
 *
 * The choice lives in localStorage['groddle.nightTint'] on this device only
 * ('off' or 'on', read and written in try/catch: private windows), never in a
 * save and never sent to the realtime server.
 *
 * Controls: the Menu's Settings group next to Zoom (js/ui/topbar.js) and
 * Preferences on `,` (js/classic/classic-prefs.js).
 */

export const NIGHT_TINT_STORAGE_KEY = 'groddle.nightTint';
export const NIGHT_TINT_EVENT = 'groddle:night-tint';
export const NIGHT_TINT_DEFAULT = true;
export const NIGHT_TINT_LABEL = 'Night tint';
export const NIGHT_TINT_HINT = 'The world darkens at dusk and night with the game clock. The 2012 game had no tint.';

/** PURE: the stored words as on (true) or off (false); anything else is the default. */
export function parseNightTint(v) {
  if (v === 'off' || v === false || v === '0' || v === 'false') return false;
  if (v === 'on' || v === true || v === '1' || v === 'true') return true;
  return NIGHT_TINT_DEFAULT;
}

/**
 * PURE: the world tint's strength for a daylight opacity: none when the player
 * turned the tint off or the place keeps its own light.
 */
export function worldTintOpacity(opacity, { on = true, ownLight = false } = {}) {
  if (!on || ownLight) return 0;
  const n = Number(opacity);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function loadNightTint(storage) {
  try {
    return parseNightTint(storage?.getItem(NIGHT_TINT_STORAGE_KEY) ?? null);
  } catch {
    return NIGHT_TINT_DEFAULT;
  }
}

export function saveNightTint(on, storage) {
  try {
    storage?.setItem(NIGHT_TINT_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* the choice just won't be remembered */
  }
}

/**
 * The setting for one window (the module's default binds globalThis; tests pass a
 * fake). set() stores it, tells onChange listeners and sends `groddle:night-tint`.
 */
export function createNightTint({ win = globalThis, storage } = {}) {
  const store = storage !== undefined ? storage : (() => { try { return win?.localStorage; } catch { return null; } })();
  let on = loadNightTint(store);
  const listeners = new Set();
  return {
    get: () => on,
    set(v) {
      const next = Boolean(v);
      if (next === on) return on;
      on = next;
      saveNightTint(on, store);
      for (const fn of [...listeners]) {
        try { fn(on); } catch (err) { console.error(err); }
      }
      try {
        if (typeof win?.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent(NIGHT_TINT_EVENT, { detail: { on } }));
      } catch { /* no window events (tests) */ }
      return on;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const tint = createNightTint();
/** This window's choice: true tints the world by the clock. */
export const nightTintOn = () => tint.get();
export const setNightTint = (on) => tint.set(on);
export const onNightTintChange = (fn) => tint.onChange(fn);
/** The shared setting object ({ get, set, onChange }) the Menu's toggle takes. */
export const nightTint = tint;
