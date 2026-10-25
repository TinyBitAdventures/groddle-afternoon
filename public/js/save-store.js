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
 * - Multiplayer (phase 2): Minn owns the save. /play/online/ (js/online-boot.js)
 *   loads the whole save from groddle/v1/save into window.GRODDLE_MP_BOOT
 *   before game.js loads; the store serves get/set from memory and writes the
 *   whole save back in the background (debounced, plus a keepalive write when
 *   the page is hidden or closed), announcing "saving / saved / offline" as
 *   a groddle:save-state event. It never touches localStorage: a solo save
 *   never goes online. Without that boot data it refuses every call.
 * - Solo backups: soloSaveSnapshot() and restoreSoloSave() move a solo save
 *   to and from a backup on the player's account (js/features/account-
 *   backup-feature.js). A backup only ever comes back as a solo save.
 *
 * Values are the raw strings the game serializes (player-save.js,
 * world-items.js, ...); the store never parses or rewrites them.
 *
 * Device preferences that are not part of a character stay on localStorage
 * directly and are not entries here: the mute choice (groddle.audio.muted,
 * js/audio-pref.js) and the /compare/ page theme (groddle-compare-theme).
 */

import { GAME_MODE, MULTIPLAYER } from './game-mode.js?v=mp2-1';

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

/** The kind and format a save carries on the server (minn/groddle/src/SaveShape.php). */
export const MULTIPLAYER_SAVE_KIND = 'groddle-multiplayer';
export const SOLO_SAVE_KIND = 'groddle-solo';
export const SAVE_FORMAT = 1;

/**
 * What the multiplayer store says about its save, on window as the
 * groddle:save-state event and <html data-save-state>:
 * saved, pending (a change waits for the next write), saving, offline (the
 * last write failed; it retries), conflict (a newer copy was saved elsewhere:
 * this page stops writing), signed-out (the session ended), error (the
 * server refused the save; it is not retried).
 */
export const SAVE_STATES = Object.freeze(['saved', 'pending', 'saving', 'offline', 'conflict', 'signed-out', 'error']);

/** keepalive requests may carry about 64 KB; bigger writes go as ordinary requests. */
const KEEPALIVE_LIMIT = 60_000;

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

/** The multiplayer store with no save loaded: every call refuses, so the game never runs online without its server save. */
function createRefusingMultiplayerStore() {
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
    ready: false,
  });
}

/** Known entries of a save body, as strings (anything else is dropped). */
function entriesOf(value) {
  const out = new Map();
  if (!value || typeof value !== 'object') return out;
  for (const name of SAVE_ENTRY_NAMES) {
    if (Object.prototype.hasOwnProperty.call(value, name) && typeof value[name] === 'string') out.set(name, value[name]);
  }
  return out;
}

/**
 * Background writer for the multiplayer save: one whole-save PUT at a time
 * to groddle/v1/save, naming the version it was made from. A change waits
 * debounceMs for more changes (never longer than maxWaitMs in all); a
 * failed write retries with backoff; 409 means another copy was saved
 * since this one loaded, and writing stops (state conflict) rather than
 * overwrite it. The REST nonce the server hands back on each answer is kept.
 */
export function createSaveSync({
  url,
  nonce = '',
  nonceUrl = '',
  version = 0,
  payload,
  fetch: fetchFn = globalThis.fetch?.bind(globalThis),
  timers = { setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) },
  now = () => Date.now(),
  debounceMs = 2500,
  maxWaitMs = 15000,
  onState = () => {},
} = {}) {
  let state = 'saved';
  let dirty = false;
  let firstDirtyAt = 0;
  let timer = null;
  let inFlight = null;
  let failures = 0;
  let nonceRetried = false;
  let current = { version, nonce };
  let lastError = null;
  const blocked = () => state === 'conflict' || state === 'signed-out' || state === 'error';
  const setState = (next, detail = {}) => {
    if (next === state && !detail.force) return;
    state = next;
    onState(next, { version: current.version, ...detail });
  };
  const clear = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };
  const schedule = (ms) => {
    clear();
    timer = timers.setTimeout(() => {
      timer = null;
      flush();
    }, Math.max(0, ms));
  };
  const takeNonce = (res) => {
    const fresh = res?.headers?.get?.('X-WP-Nonce');
    if (fresh) current.nonce = fresh;
  };
  async function refreshNonce() {
    if (!nonceUrl || !fetchFn) return false;
    try {
      const res = await fetchFn(nonceUrl, { credentials: 'same-origin', cache: 'no-store' });
      const text = String(await res.text()).trim();
      if (res.ok && /^[0-9a-f]{10}$/.test(text)) {
        current.nonce = text;
        return true;
      }
    } catch { /* offline */ }
    return false;
  }
  function put(body, keepalive) {
    return fetchFn(url, {
      method: 'PUT',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: Boolean(keepalive) && body.length <= KEEPALIVE_LIMIT,
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': current.nonce },
      body,
    });
  }
  async function answer(res) {
    takeNonce(res);
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (res.ok && Number.isInteger(data?.version)) {
      current.version = data.version;
      failures = 0;
      nonceRetried = false;
      lastError = null;
      return 'ok';
    }
    lastError = { status: res.status, code: data?.code || '' };
    if (res.status === 409) {
      current.serverVersion = Number(data?.data?.version) || 0;
      return 'conflict';
    }
    if (res.status === 403 && data?.code === 'rest_cookie_invalid_nonce' && !nonceRetried) {
      nonceRetried = true;
      return (await refreshNonce()) ? 'retry' : 'signed-out';
    }
    if (res.status === 401 || res.status === 403) return 'signed-out';
    if (res.status >= 400 && res.status < 500) return 'error';
    return 'offline';
  }
  /** Writes now (when something changed and nothing blocks); resolves when this write is done. */
  function flush({ keepalive = false } = {}) {
    if (!fetchFn || blocked()) return Promise.resolve(state);
    if (inFlight) {
      if (keepalive && dirty) {
        // The page is going away mid-write: send the newest copy as the version the write in flight will make.
        const body = JSON.stringify({ version: current.version + 1, data: payload() });
        try { put(body, true).catch(() => {}); } catch { /* the page is going */ }
      }
      return inFlight;
    }
    if (!dirty) return Promise.resolve(state);
    clear();
    dirty = false;
    firstDirtyAt = 0;
    const body = JSON.stringify({ version: current.version, data: payload() });
    setState('saving');
    inFlight = (async () => {
      let outcome;
      try {
        outcome = await answer(await put(body, keepalive));
      } catch {
        outcome = 'offline';
      }
      inFlight = null;
      if (outcome === 'ok') {
        if (dirty) {
          setState('pending');
          schedule(debounceMs);
        } else {
          setState('saved', { force: true });
        }
      } else if (outcome === 'retry') {
        dirty = true;
        return flush();
      } else if (outcome === 'offline') {
        dirty = true;
        failures += 1;
        setState('offline', { failures });
        schedule(Math.min(30_000, 2000 * 2 ** Math.min(failures - 1, 4)));
      } else {
        setState(outcome, { serverVersion: current.serverVersion, ...lastError });
      }
      return state;
    })();
    return inFlight;
  }
  /** A save entry changed: write it soon. */
  function changed() {
    dirty = true;
    if (blocked()) return;
    const t = now();
    if (!firstDirtyAt) firstDirtyAt = t;
    if (inFlight) return;
    if (state !== 'offline') setState('pending');
    const waited = t - firstDirtyAt;
    schedule(waited >= maxWaitMs ? 0 : Math.min(debounceMs, maxWaitMs - waited));
  }
  return {
    changed,
    flush,
    get state() { return state; },
    get version() { return current.version; },
    get nonce() { return current.nonce; },
    get dirty() { return dirty; },
    get lastError() { return lastError; },
  };
}

/** Announces a save state on the page: the groddle:save-state event and <html data-save-state>. */
function announceSaveState(scope, state, detail) {
  try {
    const root = scope?.document?.documentElement;
    if (root?.dataset) root.dataset.saveState = state;
    if (typeof scope?.dispatchEvent === 'function' && typeof scope.CustomEvent === 'function') {
      scope.dispatchEvent(new scope.CustomEvent('groddle:save-state', { detail: { state, ...detail } }));
    }
  } catch { /* no page */ }
}

/**
 * The multiplayer store: the whole save in memory from boot data
 * (window.GRODDLE_MP_BOOT, set by js/online-boot.js from groddle/v1/save),
 * written back through createSaveSync. With no boot data it refuses.
 * @param {{ boot?: object, scope?: object, fetch?: Function, timers?: object, now?: () => number, debounceMs?: number, maxWaitMs?: number }} [opts]
 */
export function createMultiplayerSaveStore(opts = {}) {
  const scope = opts.scope ?? globalThis;
  const boot = 'boot' in opts ? opts.boot : scope?.GRODDLE_MP_BOOT;
  if (!boot || typeof boot !== 'object' || typeof boot.saveUrl !== 'string') return createRefusingMultiplayerStore();
  const entries = entriesOf(boot.entries);
  const sync = createSaveSync({
    url: boot.saveUrl,
    nonce: boot.nonce || '',
    nonceUrl: boot.nonceUrl || '',
    version: Number.isInteger(boot.version) ? boot.version : 0,
    payload: () => ({ kind: MULTIPLAYER_SAVE_KIND, format: SAVE_FORMAT, entries: Object.fromEntries(entries) }),
    fetch: opts.fetch ?? scope?.fetch?.bind(scope),
    timers: opts.timers,
    now: opts.now,
    debounceMs: opts.debounceMs,
    maxWaitMs: opts.maxWaitMs,
    onState: (state, detail) => announceSaveState(scope, state, detail),
  });
  if (typeof scope?.addEventListener === 'function') {
    scope.addEventListener('pagehide', () => { sync.flush({ keepalive: true }); });
    scope.document?.addEventListener?.('visibilitychange', () => {
      if (scope.document.visibilityState === 'hidden') sync.flush({ keepalive: true });
    });
  }
  const check = (name) => {
    keyFor(name);
    return name;
  };
  return Object.freeze({
    kind: 'multiplayer',
    keyFor,
    ready: true,
    get(name) {
      check(name);
      return entries.has(name) ? entries.get(name) : null;
    },
    set(name, value) {
      check(name);
      const text = String(value);
      if (entries.get(name) === text) return;
      entries.set(name, text);
      sync.changed();
    },
    remove(name) {
      check(name);
      if (!entries.has(name)) return;
      entries.delete(name);
      sync.changed();
    },
    /** Writes any pending change now; resolves to the save state. */
    flush: (o) => sync.flush(o),
    get state() { return sync.state; },
    get version() { return sync.version; },
    /** The save entries as they are in memory (QA and tests). */
    snapshot: () => Object.fromEntries(entries),
    player: boot.player || null,
  });
}

export function createSaveStore(mode = GAME_MODE, opts = {}) {
  return mode === MULTIPLAYER ? createMultiplayerSaveStore(opts) : createBrowserSaveStore(opts);
}

/**
 * The solo save in this browser as a backup body: every entry the browser
 * store holds, raw. Throws when there is no player state to back up.
 * @param {ReturnType<typeof createBrowserSaveStore>} [store]
 */
export function soloSaveSnapshot(store = createBrowserSaveStore()) {
  const entries = {};
  for (const name of SAVE_ENTRY_NAMES) {
    const value = store.get(name);
    if (typeof value === 'string') entries[name] = value;
  }
  if (!entries.playerState) throw new Error('There is no solo game in this browser to back up');
  return { kind: SOLO_SAVE_KIND, format: SAVE_FORMAT, entries };
}

/** When a save's player state says it was saved (player-save.js savedAt), or 0. */
export function savedAtOf(entries) {
  try {
    const at = Number(JSON.parse(entries?.playerState || 'null')?.savedAt);
    return Number.isFinite(at) && at > 0 ? at : 0;
  } catch {
    return 0;
  }
}

/**
 * Puts a solo backup back into this browser: every entry replaced, entries
 * the backup lacks removed. Only a solo save's shape restores. The page
 * should reload right after; until it does, freezeSoloSaves() keeps the
 * running game from writing its own state over the restored one.
 * @param {{ kind: string, format: number, entries: object }} data
 * @param {ReturnType<typeof createBrowserSaveStore>} [store]
 */
export function restoreSoloSave(data, store = createBrowserSaveStore()) {
  if (!data || data.kind !== SOLO_SAVE_KIND || data.format !== SAVE_FORMAT) throw new Error('Only a solo backup restores into a solo game');
  const entries = entriesOf(data.entries);
  if (!entries.has('playerState')) throw new Error('This backup has no player state');
  for (const name of SAVE_ENTRY_NAMES) {
    if (entries.has(name)) store.set(name, entries.get(name));
    else store.remove(name);
  }
  return Object.fromEntries(entries);
}

let soloFrozen = false;

/** Stops the page's solo store writing (a restore is about to reload the page). */
export function freezeSoloSaves() {
  soloFrozen = true;
}

/** The store for this page's mode. In solo, writes stop once freezeSoloSaves() is called. */
export const saveStore = GAME_MODE === MULTIPLAYER
  ? createSaveStore(GAME_MODE)
  : (() => {
    const browser = createBrowserSaveStore();
    return Object.freeze({
      ...browser,
      set(name, value) {
        if (soloFrozen) return;
        browser.set(name, value);
      },
      remove(name) {
        if (soloFrozen) return;
        browser.remove(name);
      },
    });
  })();
