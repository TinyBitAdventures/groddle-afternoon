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

import { GAME_MODE, MULTIPLAYER } from './game-mode.js?v=1ecf2899';
import { leaveHandoff, listenForClaims, newWriterId } from './save-claim.js?v=30cf5250';

export { newWriterId };

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

/** The kind and format a save carries on the server (groddle-afternoon-site/src/SaveShape.php). */
export const MULTIPLAYER_SAVE_KIND = 'groddle-multiplayer';
export const SOLO_SAVE_KIND = 'groddle-solo';
export const SAVE_FORMAT = 1;

/**
 * What the multiplayer store says about its save, on window as the
 * groddle:save-state event and <html data-save-state>:
 * saved, pending (a change waits for the next write), saving, offline (the
 * last write failed; it retries), conflict (someone else saved over the
 * copy this page loaded), elsewhere (the character was opened in another
 * window or device since), signed-out (the session ended), error (the
 * server refused the save). In conflict and elsewhere the page keeps its
 * game in memory and writes nothing until the player chooses (js/online-
 * boot.js asks): keep this window's game (takeover) or load the saved one;
 * error waits for "Try again" (retry). None of them is ever silent.
 */
export const SAVE_STATES = Object.freeze(['saved', 'pending', 'saving', 'offline', 'conflict', 'elsewhere', 'signed-out', 'error']);

/** The states that stop writing until the player acts (online-boot.js shows each one). */
export const SAVE_STOPPED = Object.freeze(['conflict', 'elsewhere', 'signed-out', 'error']);

/** The player's answer to a stopped save, as a groddle:save-choice event: keep (this window's game), retry. */
export const SAVE_CHOICE_EVENT = 'groddle:save-choice';

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
 * to groddle/v1/save, naming the version it was made from, this page's
 * writer id and a number that grows with each write (seq). A change waits
 * debounceMs for more changes (never longer than maxWaitMs in all); a
 * failed write retries with backoff. The site lets the page that loaded the
 * save last keep writing whatever version it names, as long as each write
 * is newer than its last (so a write whose answer was lost, or a keepalive
 * write beside one in flight, never stops this page: ticket 21); an older
 * one comes back "superseded" and changes nothing. A 409 says another page
 * claimed the save (elsewhere) or someone else wrote over it (conflict):
 * writing stops, the game goes on in memory, and the player chooses;
 * takeover() writes this copy back over the other (the site first applies
 * the trades this copy missed, MultiplayerSave.php). The REST nonce the
 * server hands back on each answer is kept. An answer whose ledger corrected
 * the save (groddle-afternoon-site src/Ledger.php, G335: what the site could
 * not account for was taken out of the stored save) goes to
 * onLedger({ corrected: { items, currants }, text }).
 *
 * Writes are counted: mark() is the number of the first write that holds
 * everything set so far, and written the newest write the site accepted, so
 * written >= mark() says a change is in the stored save even when more
 * changes keep the state from ever settling on "saved" (savedThrough).
 */
export function createSaveSync({
  url,
  nonce = '',
  nonceUrl = '',
  version = 0,
  writer = '',
  confirmedAt = null,
  payload,
  fetch: fetchFn = globalThis.fetch?.bind(globalThis),
  timers = { setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) },
  now = () => Date.now(),
  debounceMs = 2500,
  maxWaitMs = 15000,
  onState = () => {},
  onLedger = () => {},
  onFinal = () => {},
} = {}) {
  let state = 'saved';
  let dirty = false;
  let firstDirtyAt = 0;
  let timer = null;
  let inFlight = null;
  let failures = 0;
  let nonceRetried = false;
  let seq = 0;
  let started = 0; // writes begun (flush; not the keepalive copies beside one)
  let landed = 0; // the newest of them the site accepted
  let takingOver = false;
  let yielding = false;
  let current = { version, nonce, confirmedAt };
  let lastError = null;
  let refused = {};
  const blocked = () => SAVE_STOPPED.includes(state) || yielding;
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
  /** The next write's body: this copy, its version, this page and a number newer than any before. */
  function body(extra = {}) {
    seq += 1;
    return JSON.stringify({ version: current.version, ...(writer ? { writer, seq } : {}), ...extra, data: payload() });
  }
  function put(text, keepalive) {
    // A write sent as the page goes away may land after the next page has read the save, or not
    // at all (a body over the keepalive limit is cancelled with the page): it is handed on too.
    if (keepalive) {
      try { onFinal(text); } catch { /* the page is going */ }
    }
    return fetchFn(url, {
      method: 'PUT',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: Boolean(keepalive) && text.length <= KEEPALIVE_LIMIT,
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': current.nonce },
      body: text,
    });
  }
  async function answer(res) {
    takeNonce(res);
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (res.ok && Number.isInteger(data?.version)) {
      // A superseded answer: a newer write of this page is in already; nothing else to do.
      if (!data.superseded || data.version > current.version) current.version = data.version;
      if (typeof data.updatedAt === 'string') current.confirmedAt = data.updatedAt;
      if (data.ledger?.corrected && typeof data.ledger.corrected === 'object') {
        try { onLedger(data.ledger); } catch { /* a listener's trouble is not the save's */ }
      }
      failures = 0;
      nonceRetried = false;
      lastError = null;
      return 'ok';
    }
    lastError = { status: res.status, code: data?.code || '', message: typeof data?.message === 'string' ? data.message : '' };
    if (res.status === 409) {
      current.serverVersion = Number(data?.data?.version) || 0;
      refused = { serverVersion: current.serverVersion, otherUpdatedAt: data?.data?.updatedAt || null, otherSavedAt: Number(data?.data?.savedAt) || 0 };
      return data?.code === 'groddle_save_elsewhere' ? 'elsewhere' : 'conflict';
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
    if (!fetchFn || SAVE_STOPPED.includes(state)) return inFlight || Promise.resolve(state);
    if (inFlight) {
      if (keepalive && dirty && !takingOver) {
        // The page is going away mid-write: send the newest copy beside it. Its seq is newer, so
        // the site keeps it whichever lands first, and the older one comes back superseded.
        try { put(body(), true).catch(() => {}); } catch { /* the page is going */ }
      }
      return inFlight;
    }
    if (!dirty && !takingOver) return Promise.resolve(state);
    clear();
    dirty = false;
    firstDirtyAt = 0;
    const text = takingOver ? body({ takeover: true, since: current.confirmedAt || null }) : body();
    started += 1;
    const number = started;
    setState('saving');
    inFlight = (async () => {
      let outcome;
      try {
        outcome = await answer(await put(text, keepalive));
      } catch {
        outcome = 'offline';
      }
      inFlight = null;
      if (outcome === 'ok') {
        // A superseded answer is ok too: a newer copy of this page's is in already.
        landed = Math.max(landed, number);
        takingOver = false;
        if (dirty && !yielding) {
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
        if (!yielding) schedule(Math.min(30_000, 2000 * 2 ** Math.min(failures - 1, 4)));
      } else {
        takingOver = false;
        dirty = true;
        setState(outcome, { ...refused, ...lastError, confirmedAt: current.confirmedAt });
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
  /**
   * The player keeps this window's game over the copy saved elsewhere: written at once,
   * claiming the save back (the other window then stops writing and says so).
   */
  function takeover() {
    if (!['conflict', 'elsewhere'].includes(state) || yielding) return Promise.resolve(state);
    takingOver = true;
    dirty = true;
    state = 'pending';
    return flush();
  }
  /** "Try again" after the site refused a write (error): the next write goes now. */
  function retry() {
    if (state !== 'error') return Promise.resolve(state);
    state = 'pending';
    dirty = true;
    return flush();
  }
  /**
   * Another window of this browser takes the character (js/save-claim.js): the last change
   * is written first, then this page stops writing and says so.
   */
  async function yieldTo(detail = {}) {
    if (yielding || SAVE_STOPPED.includes(state)) return state;
    yielding = true;
    clear();
    try {
      await inFlight;
      if (dirty && !SAVE_STOPPED.includes(state)) await flush();
    } catch { /* offline: the other window loads what the site has */ }
    yielding = false;
    if (!SAVE_STOPPED.includes(state)) {
      clear();
      setState('elsewhere', { by: 'window', confirmedAt: current.confirmedAt, ...detail });
    }
    return state;
  }
  return {
    changed,
    flush,
    takeover,
    retry,
    yieldTo,
    /** The first write that holds everything set so far: the next one while a change waits, else the last begun (0: the loaded save). */
    mark: () => (dirty ? started + 1 : started),
    /** The newest write the site accepted (see mark). */
    get written() { return landed; },
    get state() { return state; },
    get version() { return current.version; },
    get nonce() { return current.nonce; },
    get dirty() { return dirty; },
    get lastError() { return lastError; },
    get writer() { return writer; },
    /** The site's time of this page's last save that it confirmed (or of the boot read). */
    get confirmedAt() { return current.confirmedAt; },
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

/** The event a ledger correction arrives as (js/features/ledger-feature.js applies it to the page). */
export const LEDGER_CORRECTED_EVENT = 'groddle:ledger-corrected';

/** Announces a ledger correction on the page. */
function announceLedger(scope, ledger) {
  try {
    if (typeof scope?.dispatchEvent === 'function' && typeof scope.CustomEvent === 'function') {
      scope.dispatchEvent(new scope.CustomEvent(LEDGER_CORRECTED_EVENT, { detail: ledger }));
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
  const writer = typeof boot.writer === 'string' && /^[A-Za-z0-9]{8,32}$/.test(boot.writer) ? boot.writer : newWriterId();
  const sync = createSaveSync({
    url: boot.saveUrl,
    nonce: boot.nonce || '',
    nonceUrl: boot.nonceUrl || '',
    version: Number.isInteger(boot.version) ? boot.version : 0,
    writer,
    confirmedAt: typeof boot.updatedAt === 'string' ? boot.updatedAt : null,
    payload: () => ({ kind: MULTIPLAYER_SAVE_KIND, format: SAVE_FORMAT, entries: Object.fromEntries(entries) }),
    fetch: opts.fetch ?? scope?.fetch?.bind(scope),
    timers: opts.timers,
    now: opts.now,
    debounceMs: opts.debounceMs,
    maxWaitMs: opts.maxWaitMs,
    onState: (state, detail) => announceSaveState(scope, state, detail),
    onLedger: (ledger) => announceLedger(scope, ledger),
    onFinal: (body) => leaveHandoff({ scope, player: boot.player?.id, body }),
  });
  if (typeof scope?.addEventListener === 'function') {
    scope.addEventListener('pagehide', () => { sync.flush({ keepalive: true }); });
    scope.document?.addEventListener?.('visibilitychange', () => {
      if (scope.document.visibilityState === 'hidden') sync.flush({ keepalive: true });
    });
    // The player's answer to a stopped save (js/online-boot.js): keep this window's game, or try again.
    scope.addEventListener(SAVE_CHOICE_EVENT, (e) => {
      if (e?.detail?.choice === 'keep') sync.takeover();
      else if (e?.detail?.choice === 'retry') sync.retry();
    });
  }
  // Another tab of this browser opening the same character asks this one to save and stand down first.
  const claims = listenForClaims({ scope, player: boot.player?.id, writer, onClaim: () => sync.yieldTo() });
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
    /** The write that will hold everything set so far, and the newest the site accepted (savedThrough). */
    mark: () => sync.mark(),
    get written() { return sync.written; },
    /** Keeps this window's game over a copy saved elsewhere (state conflict or elsewhere). */
    takeover: () => sync.takeover(),
    /** Writes again after the site refused a write (state error). */
    retry: () => sync.retry(),
    /** Saves the last change, then stops writing: another window plays now. */
    yieldTo: (detail) => sync.yieldTo(detail),
    get state() { return sync.state; },
    get version() { return sync.version; },
    /** This page's name on the save (MultiplayerSave.php writer). */
    writer,
    /** Stops answering other tabs' claims (tests). */
    close: () => claims.close(),
    /** The save entries as they are in memory (QA and tests). */
    snapshot: () => Object.fromEntries(entries),
    player: boot.player || null,
  });
}

/** The save states savedThrough gives up on: stopped until the player acts, or offline (the write will retry by itself). */
const SAVED_THROUGH_STOPS = Object.freeze(['conflict', 'elsewhere', 'signed-out', 'error', 'offline']);

/**
 * Writes the save now and resolves true once a write holding everything set
 * so far has landed (the site accepted it), false when the save stopped or
 * went offline first. Call it right after the change is set (engine.save()).
 * A busy save is fine: changes made after this one may keep the state on
 * "pending" for as long as the game plays, and only a write begun after the
 * change counts, so true means the change is in the stored save. That is what
 * an ack of a server's owed message needs (street-jobs-feature.js persist; the
 * server sends it again until the ack, so a crash before this never loses it).
 * A store without write counting (solo, or none loaded) waits for "saved" as
 * before; one that never writes resolves true.
 */
export async function savedThrough(store, { tries = 6 } = {}) {
  if (typeof store?.flush !== 'function') return true;
  const counted = typeof store.mark === 'function' && Number.isInteger(store.written);
  const need = counted ? store.mark() : 0;
  const done = () => (counted ? store.written >= need : store.state === 'saved');
  for (let i = 0; i < tries; i += 1) {
    if (counted && done()) return true;
    let st;
    try {
      st = await store.flush();
    } catch {
      return false;
    }
    if (done()) return true;
    if (SAVED_THROUGH_STOPS.includes(store.state || st)) return false;
  }
  return done();
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
