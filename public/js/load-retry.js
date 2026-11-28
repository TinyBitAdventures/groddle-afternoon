/**
 * #768 (R26, the load side): the one time limit and retry for the game's picture and data loads.
 *
 * A house built from a full save came up with no house in it: its pictures were asked for and the
 * requests never answered, neither loaded nor failed. js/textures.js retried only after an error, the
 * home street's neighbours request waited for ever behind its loading flag, and some 75 fetches had
 * no time limit at all, so one stalled request left a hole for the whole session.
 *
 * - timeLimit(start, { ms }): runs start(signal) and fails it with a LoadTimeout when nothing has
 *   settled in `ms` (the signal is aborted, so a fetch or picture stops waiting too). The promise
 *   carries expire(), to give up at once (a load found stalled after a throttled background tab).
 * - fetchRetry(input, init, opts): fetch with a stall limit of LOAD_TIMEOUT_MS: the answer's head,
 *   then each piece of its body, must come within it (a long download that keeps moving is fine).
 *   A stalled GET or HEAD is asked for again after RETRY_WAITS_MS (1 s, 4 s, 16 s); a write (POST,
 *   PUT, DELETE) is never sent twice, it only fails. Errors the network or server gave stay as fetch
 *   gives them (a rejection, or a Response that is not ok): their callers handle those already.
 * - loadTimeoutFor(attempt): a picture's limit, doubled on each try (20 s, 40 s, 80 s, 160 s), so a
 *   very slow line still gets a big sheet in the end. A picture has no progress to watch.
 *
 * Timers are unref'd where that exists (Node), so a test never waits on one.
 */

/** A load with no answer this long counts as stalled. */
export const LOAD_TIMEOUT_MS = 20_000;
/** Waits between tries of a stalled load (js/textures.js uses the same for its pictures). */
export const RETRY_WAITS_MS = Object.freeze([1_000, 4_000, 16_000]);

/** The error a stalled load fails with. */
export class LoadTimeout extends Error {
  constructor(ms, what = '') {
    super(`no answer in ${Math.round(ms / 1000)} s${what ? ` (${what})` : ''}`);
    this.name = 'TimeoutError';
    this.code = 'load-timeout';
    this.ms = ms;
  }
}

/** Did this load fail by stalling (timeLimit, fetchRetry)? */
export function isLoadTimeout(err) {
  return Boolean(err) && err.code === 'load-timeout';
}

/** A picture's limit on try `attempt` (1-based): LOAD_TIMEOUT_MS, doubled each try. */
export function loadTimeoutFor(attempt = 1, base = LOAD_TIMEOUT_MS) {
  return base * 2 ** Math.max(0, Math.min(6, (Number(attempt) || 1) - 1));
}

function later(fn, ms) {
  const t = setTimeout(fn, ms);
  t?.unref?.();
  return t;
}

/** Resolves after `ms` (never keeps Node alive). */
export function pause(ms) {
  return new Promise((resolve) => later(resolve, ms));
}

/**
 * Run start(signal) with a time limit. Rejects with a LoadTimeout after `ms` with nothing settled,
 * aborting the signal; the returned promise has expire() to time it out now.
 */
export function timeLimit(start, { ms = LOAD_TIMEOUT_MS, what = '' } = {}) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  let expire = () => {};
  let timer = null;
  const promise = new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      if (timer != null) clearTimeout(timer);
      fn(v);
    };
    expire = () => {
      if (done) return;
      const err = new LoadTimeout(ms, what);
      try { ctrl?.abort(err); } catch { /* an old engine: abort() takes no reason */ }
      finish(reject, err);
    };
    timer = later(expire, ms);
    let run;
    try {
      run = Promise.resolve(start(ctrl?.signal));
    } catch (err) {
      run = Promise.reject(err);
    }
    run.then((v) => finish(resolve, v), (err) => finish(reject, err));
  });
  promise.expire = () => expire();
  return promise;
}

const NO_BODY = new Set([101, 204, 205, 304]);

/** One try: the head within `ms`, then each body piece within `ms`; a real Response comes back read. */
async function fetchOnce(input, init, ms, fetchImpl) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const own = init?.signal;
  if (own && ctrl) {
    if (own.aborted) ctrl.abort(own.reason);
    else own.addEventListener?.('abort', () => ctrl.abort(own.reason), { once: true });
  }
  let timer = null;
  let fail = null;
  const stalled = new Promise((_, reject) => { fail = reject; });
  stalled.catch(() => {});
  const arm = () => {
    if (timer != null) clearTimeout(timer);
    timer = later(() => {
      const err = new LoadTimeout(ms, String(input?.url || input || '').replace(/[?#].*$/, '').slice(-80));
      try { ctrl?.abort(err); } catch { /* no reason taken */ }
      fail(err);
    }, ms);
  };
  try {
    arm();
    const call = fetchImpl || globalThis.fetch;
    const res = await Promise.race([call(input, ctrl ? { ...(init || {}), signal: ctrl.signal } : init), stalled]);
    const reader = typeof Response === 'function' && res instanceof Response && res.body && !NO_BODY.has(res.status) && String(init?.method || 'GET').toUpperCase() !== 'HEAD' ? res.body.getReader() : null;
    if (!reader) return res;
    const parts = [];
    let size = 0;
    for (;;) {
      arm();
      const { done, value } = await Promise.race([reader.read(), stalled]);
      if (done) break;
      parts.push(value);
      size += value.byteLength;
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const p of parts) {
      bytes.set(p, at);
      at += p.byteLength;
    }
    const out = new Response(bytes, { status: res.status, statusText: res.statusText, headers: res.headers });
    try {
      Object.defineProperty(out, 'url', { value: res.url });
      Object.defineProperty(out, 'redirected', { value: res.redirected });
    } catch { /* read-only in this engine */ }
    return out;
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}

/**
 * fetch with a stall limit, and a GET or HEAD that stalls asked for again (RETRY_WAITS_MS).
 * opts: timeoutMs (the stall limit), waits (between tries), retry (override: false never asks
 * again, true asks again even for a write), fetchImpl (else globalThis.fetch at call time).
 */
export async function fetchRetry(input, init = undefined, { timeoutMs = LOAD_TIMEOUT_MS, waits = RETRY_WAITS_MS, retry, fetchImpl } = {}) {
  const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
  const again = retry ?? (method === 'GET' || method === 'HEAD');
  const tries = again ? waits.length + 1 : 1;
  for (let i = 0; ; i += 1) {
    try {
      return await fetchOnce(input, init, timeoutMs, fetchImpl);
    } catch (err) {
      if (!isLoadTimeout(err) || i + 1 >= tries || init?.signal?.aborted) throw err;
      await pause(waits[i] ?? waits[waits.length - 1] ?? 0);
    }
  }
}
