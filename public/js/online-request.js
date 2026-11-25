/**
 * R26 (#506, G1024): the one way the online features ask the realtime server before a verb lands
 * (shared gardens, shared Patches, street objects). Each used to keep its own wait (8 s, 8 s, 6 s),
 * started before the page saved, and dropped an answer that came after it.
 *
 * - The wait starts when the request goes out, after any save it waits on first (a seed bought a
 *   moment ago reaches the site's ledger through the save write).
 * - That save has its own bounded wait (SAVE_FIRST_MS). A save that fails or runs out is said
 *   ('save-failed'), and nothing is sent.
 * - The wait is the server's worst case: hello's `wait` in ms (groddle-afternoon-server ledger.go
 *   actAnswerWait), else ANSWER_WAIT_FALLBACK_MS, the same sum made here from ledger.go's numbers
 *   (tests/online-request.test.js ties the two).
 * - A request past its wait is not forgotten: the feature says it did not answer, and the record
 *   stays (late) so an answer that comes after is still applied, or its refusal shown.
 *
 * Pure: no DOM; tests pass their own clock and timers.
 */

/** groddle-afternoon-server ledger.go: ledgerTimeout, ledgerTries, ledgerPauseStep. */
export const LEDGER_CALL = Object.freeze({ timeoutMs: 5000, tries: 3, pauseStepMs: 400 });
/** ledger.go actLedgerChain: a Master Gardener pour asks for the bottle, then the seeds. */
export const ACT_LEDGER_CHAIN = 2;
/** ledger.go actAnswerMargin: the hub's queues and the answer's write. */
export const ACT_ANSWER_MARGIN_MS = 2000;

/** The longest one ledger call can take: every try runs out, with the pauses between (ledger.go ledgerCallWorst). */
export function ledgerCallWorstMs(call = LEDGER_CALL) {
  let ms = call.tries * call.timeoutMs;
  for (let t = 1; t < call.tries; t += 1) ms += t * call.pauseStepMs;
  return ms;
}

/** The answer's wait when the server does not say (an older server): ledger.go actAnswerWait. */
export const ANSWER_WAIT_FALLBACK_MS = ACT_LEDGER_CHAIN * ledgerCallWorstMs() + ACT_ANSWER_MARGIN_MS;
/** The server's word is kept within these bounds. */
export const ANSWER_WAIT_MIN_MS = 5000;
export const ANSWER_WAIT_MAX_MS = 120_000;
/** The save a request waits on first gets this long. */
export const SAVE_FIRST_MS = 20_000;
/** A late request is kept this long for its answer, then let go. */
export const LATE_KEEP_MS = 5 * 60_000;

/**
 * #676 (Austin's ruling 2026-11-25): a request this long with no answer asks whether the socket is
 * still there (realtime-client.js probe: a ping, and no answer drops and reconnects it at once). A
 * phone whose connection died had kept saying "still asking" for the answer's whole wait.
 */
export const PROBE_AFTER_MS = 3000;
/** #676: the words while the socket connects again, in place of "still asking" and "still connecting". */
export const RECONNECTING_LINE = 'Reconnecting...';

/**
 * G1306 (Austin's ruling 2026-11-25, #689): the one realtime state with no shared world at all: the
 * site runs no realtime (the ticket route's 503, realtime-client.js 'off'). Only then do shared
 * things (quoins, street objects, gardens, Patches) follow the solo rules on this page. Every other
 * state that is not 'online' (connecting, offline, stopped, replaced, signed out...) stops them.
 */
export const NO_REALTIME_STATES = Object.freeze(new Set(['off']));
/** G1306: states the client does not leave by itself (realtime-feature says why); never "Reconnecting...". */
export const ENDED_STATES = Object.freeze(new Set(['off', 'signed-out', 'replaced', 'other-character', 'booted', 'suspended']));
/** G1306: a shared act refused while this page cannot reach the street and will not by itself (home-machines.js offline). */
export const OFFLINE_LINE = 'You need to be online to do that.';

/**
 * G1306: multiplayer with a realtime client that is not online now but the street is shared: shared
 * acts are refused (offlineLine), nothing is granted here. False in solo (no client) and with no
 * realtime on the site ('off').
 */
export function sharedOffline(client) {
  return Boolean(client) && client.state !== 'online' && !NO_REALTIME_STATES.has(client.state);
}

/** G1306: the words for a shared act refused while not online: "Reconnecting..." unless the client has ended. */
export function offlineLine(client) {
  return ENDED_STATES.has(client?.state) ? OFFLINE_LINE : RECONNECTING_LINE;
}

/**
 * #676: a feature's line (busy, connecting, timeout), or RECONNECTING_LINE while its client connects
 * again. G1306: a stopped or retrying client says "Reconnecting..." too, an ended one OFFLINE_LINE.
 */
export function waitLine(client, line) {
  if (client?.reconnecting || client?.state === 'stopped' || client?.state === 'offline') return RECONNECTING_LINE;
  if (ENDED_STATES.has(client?.state)) return OFFLINE_LINE;
  return line;
}

/** How long to wait for an answer on this connection: hello's word, else the fallback. */
export function answerWaitMs(client) {
  const w = Number(client?.answerWaitMs);
  if (!Number.isFinite(w) || w <= 0) return ANSWER_WAIT_FALLBACK_MS;
  return Math.min(ANSWER_WAIT_MAX_MS, Math.max(ANSWER_WAIT_MIN_MS, w));
}

/**
 * The requests one feature has out. Records are the feature's own objects; this adds `sentAt`
 * (0 while a save goes first), `late` (past the wait) and `gone` (the street was left).
 *
 * @param {object} [opts]
 * @param {() => number} [opts.now]
 * @param {() => number} [opts.waitMs] the answer's wait now (answerWaitMs of the feature's client)
 * @param {(fn: () => void, ms: number) => any} [opts.later]
 * @param {(id: any) => void} [opts.cancel]
 */
export function createOnlineRequests({
  now = () => Date.now(),
  waitMs = () => ANSWER_WAIT_FALLBACK_MS,
  later = (fn, ms) => setTimeout(fn, ms),
  cancel = (id) => clearTimeout(id),
  probe = null,
  probeAfterMs = PROBE_AFTER_MS,
} = {}) {
  const all = new Map();
  const live = () => [...all.values()].filter((r) => !r.late && !r.gone);

  function sent(req, transmit) {
    const rec = all.get(req);
    if (!rec) return 'dropped';
    let ok = false;
    try {
      ok = Boolean(transmit());
    } catch {
      ok = false;
    }
    if (!ok) {
      all.delete(req);
      return 'unsent';
    }
    rec.sentAt = now();
    return 'sent';
  }

  return {
    /** Requests still waiting on their answer (busy checks); late and left ones are not. */
    values() {
      return live()[Symbol.iterator]();
    },
    get size() {
      return live().length;
    },
    /** Every record, late and left ones too (an answer finds its request here). */
    entries() {
      return [...all.entries()][Symbol.iterator]();
    },
    has(req) {
      return all.has(req);
    },
    get(req) {
      return all.get(req);
    },
    delete(req) {
      return all.delete(req);
    },
    clear() {
      all.clear();
    },
    deleteWhere(test) {
      for (const [req, rec] of all) if (test(rec)) all.delete(req);
    },
    /** The player left the street: answers still come, but the targets are gone. */
    leave(test = () => true) {
      for (const rec of all.values()) if (test(rec)) rec.gone = true;
    },
    /** A request about to go out. */
    open(req, rec) {
      rec.sentAt = 0;
      rec.probed = false;
      rec.late = false;
      rec.gone = false;
      all.set(req, rec);
      return rec;
    },
    /**
     * Send: `transmit()` returns falsy when the socket could not take it. With `save`, that save
     * (a promise of true) goes first within SAVE_FIRST_MS. `done(result)` hears 'sent', 'unsent'
     * (nothing went out), 'save-failed' or 'dropped' (the request was let go meanwhile), at once
     * when there is no save.
     */
    send(req, transmit, { save = null, done = () => {} } = {}) {
      if (!save) {
        const out = sent(req, transmit);
        done(out);
        return out;
      }
      return new Promise((resolve) => {
        let timer = null;
        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          if (timer != null) cancel(timer);
          let out;
          if (!all.has(req)) out = 'dropped';
          else if (ok !== true) {
            all.delete(req);
            out = 'save-failed';
          } else out = sent(req, transmit);
          done(out);
          resolve(out);
        };
        timer = later(() => finish(false), SAVE_FIRST_MS);
        Promise.resolve()
          .then(save)
          .then((ok) => finish(ok === true), () => finish(false));
      });
    },
    /** The answer's request (late, left or live), taken out; null when none. */
    take(req) {
      const rec = all.get(req);
      if (!rec) return null;
      all.delete(req);
      return rec;
    },
    /**
     * Requests out longer than the wait, newly late (the feature says so); very old late ones are let go.
     * #676: a request out PROBE_AFTER_MS with no answer calls `probe` (once for it).
     */
    expire() {
      const t = now();
      const wait = waitMs();
      const out = [];
      let ask = false;
      for (const [req, rec] of all) {
        if (rec.late) {
          if (t - rec.lateAt >= LATE_KEEP_MS) all.delete(req);
          continue;
        }
        if (rec.sentAt && !rec.probed && !rec.gone && t - rec.sentAt >= probeAfterMs) {
          rec.probed = true;
          ask = true;
        }
        if (!rec.sentAt || t - rec.sentAt < wait) continue;
        rec.late = true;
        rec.lateAt = t;
        if (!rec.gone) out.push(rec);
      }
      if (ask && typeof probe === 'function') {
        try { probe(); } catch { /* the client is gone */ }
      }
      return out;
    },
  };
}
