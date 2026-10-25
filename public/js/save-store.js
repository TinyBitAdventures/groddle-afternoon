/**
 * The save interface (multiplayer phase 1): every read and write of a
 * character's saved game goes through one store with named entries, so the
 * game never cares where its save lives.
 *
 * - Solo: the browser store, over localStorage with the exact keys the game
 *   has always used. No migration: a save written before this module loads
 *   untouched. It reads globalThis.localStorage on every call, so practice
 *   copies (js/practice-mode.js swaps window.localStorage for a per-tab
 *   store) keep working.
 * - Multiplayer: Minn will own the save (phase 2). Until then its store
 *   refuses every call with "not available yet".
 *
 * Values are the raw strings the game serializes (player-save.js,
 * world-items.js, ...); the store never parses or rewrites them.
 *
 * Device preferences that are not part of a character stay on localStorage
 * directly and are not entries here: the mute choice (groddle.audio.muted,
 * js/audio-pref.js) and the /compare/ page theme (groddle-compare-theme).
 */

import { GAME_MODE, MULTIPLAYER } from './game-mode.js?v=mp1-1';

/** Save entry name -> localStorage key. These keys must never change. */
export const SAVE_KEYS = Object.freeze({
  /** Pack, metabolics, every saved system and the per-street world snapshot (player-save.js). */
  playerState: 'groddle_player_state_v1',
  /** Last street and x/y. */
  location: 'groddle_player_location',
  /** Stacks the player dropped on streets (world-items.js). */
  droppedItems: 'groddle_dropped_items_v1',
  /** The opt-in stand-in Glitches (?companions=1|0, remembered): a solo world setting. */
  companions: 'groddle:companions',
  /** Last acknowledged new game day (game-day.js). */
  lastNewDayTs: 'groddle_last_new_day_ts',
  lastNewDayKey: 'groddle_last_new_day_key',
  /** The avatar look (character-builder.js). */
  appearance: 'groddle.avatar.appearance.v1',
});

export const SAVE_ENTRY_NAMES = Object.freeze(Object.keys(SAVE_KEYS));

export const MULTIPLAYER_SAVE_UNAVAILABLE = 'Multiplayer saves are not available yet';

function keyFor(name) {
  const key = Object.prototype.hasOwnProperty.call(SAVE_KEYS, name) ? SAVE_KEYS[name] : null;
  if (!key) throw new Error(`Unknown save entry: ${name}`);
  return key;
}

/**
 * The solo store. get() returns the stored string or null; set() stores a
 * string; remove() deletes. Storage errors (private windows, quota) throw
 * as localStorage does; call sites keep their own try/catch.
 * @param {{ storage?: Storage | (() => Storage|null) }} [opts] a Storage or a getter (tests)
 */
export function createBrowserSaveStore(opts = {}) {
  const storage = () => {
    const s = typeof opts.storage === 'function' ? opts.storage() : opts.storage;
    return s || globalThis.localStorage || null;
  };
  return Object.freeze({
    kind: 'browser',
    keyFor,
    get(name) {
      const key = keyFor(name);
      const s = storage();
      return s ? s.getItem(key) : null;
    },
    set(name, value) {
      const key = keyFor(name);
      const s = storage();
      if (!s) throw new Error('Browser storage is unavailable');
      s.setItem(key, String(value));
    },
    remove(name) {
      const key = keyFor(name);
      const s = storage();
      if (s) s.removeItem(key);
    },
  });
}

/** Phase 1 stub for the multiplayer store: Minn saves arrive in phase 2. */
export function createMultiplayerSaveStore() {
  const refuse = (name) => {
    keyFor(name);
    throw new Error(MULTIPLAYER_SAVE_UNAVAILABLE);
  };
  return Object.freeze({
    kind: 'multiplayer',
    keyFor,
    get: refuse,
    set: refuse,
    remove: refuse,
  });
}

export function createSaveStore(mode = GAME_MODE, opts = {}) {
  return mode === MULTIPLAYER ? createMultiplayerSaveStore() : createBrowserSaveStore(opts);
}

/** The store for this page's mode. */
export const saveStore = createSaveStore(GAME_MODE);
