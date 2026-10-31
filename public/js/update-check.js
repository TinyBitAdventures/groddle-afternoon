/**
 * Update ready (Austin, 2026-10-31): instead of a message to everyone before a deploy, an open game
 * learns a new version is out and offers to save and reload. Pure: no DOM of its own, so
 * tests/update-ready.test.js drives it with a fake fetch and fake timers. The pill and its wiring are
 * js/features/update-ready-feature.js.
 *
 * - The deploy (tools/deploy/build-id.mjs, from kinsta.sh and the local sync) stamps each play page
 *   with <meta name="groddle-build" content="<id>"> and writes play/build.json { build, version }.
 *   A page with no stamp (a QA server on the repo's public/) never checks.
 * - The check fetches play/build.json with cache: 'no-store' and a ?t= buster (a few dozen bytes).
 *   It runs about every CHECK_EVERY_MS (jittered by JITTER either way, so one deploy does not bring
 *   every open game at once), when the tab is shown again, and in multiplayer when the realtime
 *   socket comes back after a drop (a server restart reconnects everyone: a random wait of up to
 *   RECONNECT_SPREAD_MS spreads them out). Shown and reconnect checks wait MIN_GAP_MS after the last.
 * - A failed check is silent; the next waits twice as long each time, up to BACKOFF_MAX_MS.
 * - A different build is announced once (onUpdate), and checking stops: the reload loads the newest.
 */

export const CHECK_EVERY_MS = 5 * 60_000;
/** The interval varies by this share either way (4 to 6 minutes). */
export const JITTER = 0.2;
/** Shown-again and reconnect checks skip when the last check was this recent. */
export const MIN_GAP_MS = 60_000;
/** A reconnect check waits a random 0..this, so a server restart does not bring every client at once. */
export const RECONNECT_SPREAD_MS = 20_000;
export const BACKOFF_MAX_MS = 30 * 60_000;
/** The file the deploy writes (tools/deploy/build-id.mjs BUILD_FILE), from the site root. */
export const BUILD_PATH = 'play/build.json';

/** The words (plain, no em dashes). */
export const UPDATE_TEXT = Object.freeze({
  pill: 'Update ready',
  tip: 'A new version is ready. Save your game and reload',
  saving: 'Saving…',
  activity: 'A new version is ready. Update ready at the top saves your game and reloads.',
  notSaved: 'Your game could not be saved just now, so it did not reload. Try again in a moment.',
});

/** The build this page was stamped with ('' when it was not: then nothing checks). */
export function ownBuild(doc = globalThis.document) {
  const v = doc?.querySelector?.('meta[name="groddle-build"]')?.getAttribute?.('content');
  return typeof v === 'string' ? v.trim() : '';
}

/** The build file's address with a cache buster: `<site root>/play/build.json?t=<ms>`. */
export function buildUrl(baseUri, at = Date.now()) {
  return `${new URL(BUILD_PATH, baseUri).href}?t=${Math.floor(at)}`;
}

/** The wait before the next scheduled check: the interval, jittered, doubled per failure up to the cap. */
export function nextDelay({ failures = 0, random = Math.random } = {}) {
  const base = CHECK_EVERY_MS * (1 - JITTER + 2 * JITTER * random());
  return Math.round(Math.min(BACKOFF_MAX_MS, base * 2 ** Math.min(Math.max(0, failures), 8)));
}

/**
 * @param {object} opts
 * @param {string} opts.own this page's build (ownBuild); empty disables every check
 * @param {(at: number) => string} opts.url the build file's address (buildUrl)
 * @param {typeof fetch} [opts.fetch]
 * @param {(fn: () => void, ms: number) => any} [opts.setTimeout]
 * @param {(id: any) => void} [opts.clearTimeout]
 * @param {() => number} [opts.now]
 * @param {() => number} [opts.random]
 * @param {(info: { build: string, version: string }) => void} [opts.onUpdate] once, on the first different build
 */
export function createUpdateCheck({
  own,
  url,
  fetch: fetchFn = globalThis.fetch?.bind(globalThis),
  setTimeout: later = globalThis.setTimeout?.bind(globalThis),
  clearTimeout: cancel = globalThis.clearTimeout?.bind(globalThis),
  now = () => Date.now(),
  random = Math.random,
  onUpdate = () => {},
} = {}) {
  const self = String(own || '');
  let timer = null;
  let spreadTimer = null;
  let failures = 0;
  let lastAt = -Infinity;
  let inFlight = null;
  let latest = null;
  let running = false;
  let checks = 0;

  const enabled = () => Boolean(self && fetchFn && later);

  function schedule(ms) {
    if (timer != null) cancel?.(timer);
    timer = later(() => {
      timer = null;
      check('interval');
    }, ms);
  }

  function stopTimers() {
    if (timer != null) cancel?.(timer);
    if (spreadTimer != null) cancel?.(spreadTimer);
    timer = spreadTimer = null;
  }

  /** Fetches the build file now (one at a time); resolves to the newer build or null. */
  function check(reason = 'manual') {
    if (!enabled() || latest) return Promise.resolve(latest);
    if (inFlight) return inFlight;
    lastAt = now();
    checks += 1;
    inFlight = (async () => {
      let found = null;
      try {
        const res = await fetchFn(url(now()), { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (!res?.ok) throw new Error(`build file ${res?.status}`);
        const body = await res.json();
        const build = typeof body?.build === 'string' ? body.build.trim() : '';
        if (!build) throw new Error('no build in the build file');
        failures = 0;
        if (build !== self) found = { build, version: typeof body.version === 'string' ? body.version : '', reason };
      } catch {
        failures += 1;
      }
      inFlight = null;
      if (found) {
        latest = found;
        running = false;
        stopTimers();
        try { onUpdate(found); } catch { /* the pill's trouble, not the check's */ }
      } else if (running) {
        schedule(nextDelay({ failures, random }));
      }
      return latest;
    })();
    return inFlight;
  }

  /** A check that waits MIN_GAP_MS after the last one (shown again, reconnect); `spread` waits 0..that ms first. */
  function nudge(reason, { spread = 0 } = {}) {
    if (!enabled() || latest || !running) return false;
    if (now() - lastAt < MIN_GAP_MS) return false;
    if (spread > 0) {
      if (spreadTimer != null) return false;
      spreadTimer = later(() => {
        spreadTimer = null;
        if (now() - lastAt >= MIN_GAP_MS) check(reason);
      }, Math.floor(random() * spread));
      return true;
    }
    check(reason);
    return true;
  }

  return {
    /** Starts the schedule: the first check after one jittered interval (the page just loaded the newest). */
    start() {
      if (running || !enabled() || latest) return false;
      running = true;
      lastAt = now();
      schedule(nextDelay({ failures, random }));
      return true;
    },
    stop() {
      running = false;
      stopTimers();
    },
    check,
    /** The tab is shown again. */
    shown: () => nudge('visible'),
    /** The realtime socket came back after a drop. */
    reconnected: () => nudge('reconnect', { spread: RECONNECT_SPREAD_MS }),
    get own() { return self; },
    get latest() { return latest; },
    get running() { return running; },
    get failures() { return failures; },
    get checks() { return checks; },
    get scheduled() { return timer != null; },
  };
}

/**
 * What would make the pill rude right now ('' when nothing): a race or other scene, the trade window,
 * a modal prompt or quest dialogue, an open panel (.glitch-modal) or any shown modal dialog.
 * The pill waits until it clears.
 */
export function blockingUi(engine, doc = globalThis.document) {
  try {
    if (engine?.inScene?.()) return 'scene';
    if (engine?.questDialogueOpen?.()) return 'dialogue';
    const trade = doc?.getElementById?.('trade-window');
    if (trade && !trade.hidden) return 'trade';
    if (doc?.querySelector?.('.glitch-modal:not([hidden])')) return 'panel';
    const modals = doc?.querySelectorAll?.('[role="dialog"][aria-modal="true"], dialog[open]') || [];
    for (const d of modals) if (!d.hidden && d.getClientRects?.().length) return 'modal';
  } catch { /* no page */ }
  return '';
}

/**
 * Saves, then reloads (the Update ready click). Solo: engine.save() writes the save to this browser
 * at once. Multiplayer: engine.save() and then the store's flush, which resolves once the cloud save
 * is written; the page reloads only when it was ('saved', or 'pending' when a newer change came in
 * meanwhile: the page's own pagehide flush sends that one). The location is written by the game's
 * own beforeunload, as on any reload. Resolves to true when it reloaded.
 * @param {{ engine: object, store?: { flush?: Function }, reload: () => void, say?: (text: string) => void }} opts
 */
export async function saveThenReload({ engine, store, reload, say = () => {} }) {
  try {
    engine?.save?.();
  } catch {
    say(UPDATE_TEXT.notSaved);
    return false;
  }
  if (typeof store?.flush === 'function') {
    let state = '';
    try {
      state = await store.flush();
    } catch {
      state = 'offline';
    }
    if (state !== 'saved' && state !== 'pending') {
      say(UPDATE_TEXT.notSaved);
      return false;
    }
  }
  reload();
  return true;
}
