/**
 * The owed queue for counted reports (register G968, root R10): the pure half.
 *
 * Every count the game reports to the realtime server for it to tally (today
 * that is feat_add, the shared Feat's contributions: animal verbs, hugs, pets,
 * harvests, Qurazys, quests, streaks, donations and the rest of feats.json)
 * goes through one queue kept in the save. A report stays owed until the
 * server answers it; a failed send, a dropped socket or a pace refusal asks
 * again later, at the server's pace (feats-mp.js MP_PACE). Each report carries
 * an id the server remembers (groddle-afternoon-server feats.go featReport),
 * so asking again after a lost answer never counts twice: the answer says
 * what that id has counted in all (done) of its whole amount (want).
 *
 * Before this, Qurazys (G754, #328 #335) and Questing and Contesting's quests
 * (G896, #428) each kept their own owed list and every other Feat sent once
 * (#361 G786 fixed donations on the server's side only); a report lost to a
 * failed or paced send was gone and still spent the per-animal cap. Now the
 * cap is spent only when the server accepts (owedAnswer `accepted`).
 *
 * One report is asked at a time (the server's bucket is per player per Feat,
 * and only one Feat runs a day). Reports with nothing but an amount for the
 * same run merge while they have never been asked; an act, a donation's spend
 * id or a cap keeps a report to itself.
 *
 * Glitch had no such queue: the client and the game server were one process
 * (players/inc_feats.js feats_increment ran on the server beside the verb).
 * This keeps that "every contribution counts" across a network.
 */

import { DONATION_OP_RE, MP_ACTS, MP_PACE, reportFor } from './feats-mp.js?v=17e84113';

/** The most reports kept owed (a long time offline on a busy Feat day; plain reports merge). */
export const OWED_MAX = 200;
/** No answer this long (a dropped socket): asked again, under the same id. */
export const OWED_ANSWER_MS = 20_000;
/** The send was refused (offline, or this tab is playing somewhere else): tried again this often. */
export const OWED_OFFLINE_MS = 5_000;
/** A paced report waits at most this long before it is asked again (the Ramble's pace frees one in 48 minutes). */
export const OWED_RETRY_MAX_MS = 5 * 60_000;
export const OWED_RETRY_MIN_MS = 1_000;
const MAX_N = 100_000;
/** Answers that settle a report: counted in full before (dup), or it cannot count, ever. */
const FINAL = new Set(['dup', 'already', 'street', 'act', 'amount', 'bad', 'not_today', 'carried']);

export const OWED_ID_RE = /^fo-[a-z0-9]{8,32}$/;
const RUN_RE = /^[a-z0-9_]{1,40}:\d{1,12}$/;
const FEAT_RE = /^[a-z0-9_]{1,40}$/;
const ACT_RE = /^[a-z_]{1,16}$/;
const STREET_RE = /^[A-Za-z0-9_-]{1,32}$/;

/** A report id (feats.go featReportRe): the time and eight random characters. */
export function owedId(rng = Math.random, now = Date.now()) {
  let tail = '';
  for (let i = 0; i < 8; i += 1) tail += Math.floor(rng() * 36).toString(36);
  return `fo-${Math.max(0, Math.floor(now)).toString(36)}${tail}`;
}

export function createOwed() {
  return { list: [], flight: null, retryAt: 0, pacedUntil: 0, idsSeen: false };
}

function whole(v, max = MAX_N) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
}

function plain(e) {
  return !e.act && !e.op && !e.cap;
}

/** The run key a report counts toward ('' while the server has not named today's Feat). */
export function runKey(run) {
  return run ? `${run.feat}:${run.run}` : '';
}

/** A Ramble first visit takes no pace (feats.go firstStreet), so a paced repeat visit never holds it back. */
function unpaced(e) {
  return Boolean(e.act && MP_ACTS[e.feat]?.[e.act]?.dedupe === 'first-street');
}

/** Reports owed with this cap key that the server has not accepted yet. */
export function capHeld(q, key) {
  let n = 0;
  for (const e of q.list) if (e.cap?.key === key && !e.capSpent) n += 1;
  return n;
}

/**
 * Owes one counted report. rep: { feat, n, act?, street?, op?, cap?: { key, max } }; run is today's
 * run or null. Returns the entry it went into (a plain report may merge into one never asked).
 */
export function oweReport(q, rep, run, now = Date.now(), rng = Math.random) {
  const feat = String(rep?.feat || '');
  const n = whole(rep?.n);
  if (!FEAT_RE.test(feat) || !n) return null;
  if (run && run.feat !== feat) return null;
  const key = runKey(run);
  const e = { id: owedId(rng, now), feat, run: key, n, done: 0, at: now };
  if (rep.act) e.act = String(rep.act).slice(0, 16);
  if (rep.street) e.street = String(rep.street).slice(0, 32);
  if (rep.op && DONATION_OP_RE.test(String(rep.op))) e.op = String(rep.op);
  if (rep.cap?.key) e.cap = { key: String(rep.cap.key).slice(0, 120), max: Math.max(1, whole(rep.cap.max) || 1) };
  if (plain(e)) {
    const into = q.list.find((o) => o.feat === feat && o.run === key && plain(o) && !o.asked && o.id !== q.flight?.id);
    if (into) {
      into.n = Math.min(into.n + n, MAX_N);
      return into;
    }
  }
  q.list.push(e);
  while (q.list.length > OWED_MAX) {
    const drop = q.list.findIndex((o) => o.id !== q.flight?.id);
    if (drop < 0) break;
    q.list.splice(drop, 1);
  }
  return e;
}

/**
 * Today's run is known: a report held from before it counts toward it if it is the same Feat and
 * was made after the run began; a report for any other run can never count and is dropped.
 * Returns true when the list changed.
 */
export function placeOwed(q, run) {
  if (!run) return false;
  const key = runKey(run);
  const start = Number(run.start) || 0;
  let changed = false;
  q.list = q.list.filter((e) => {
    if (e.run === key) return true;
    if (!e.run && e.feat === run.feat && e.at >= start) {
      e.run = key;
      changed = true;
      return true;
    }
    changed = true;
    return false;
  });
  if (q.flight && !q.list.some((e) => e.id === q.flight.id)) q.flight = null;
  return changed;
}

/** The pace interval for what is left of a report (one unit's time, times what the bucket holds of it). */
export function retryDelay(feat, left = 1) {
  const p = MP_PACE[feat];
  if (!p) return OWED_RETRY_MIN_MS;
  const per = Math.ceil(p.everyMs / Math.max(1, p.n));
  const ms = per * Math.max(1, Math.min(whole(left) || 1, p.burst || 1));
  return Math.min(OWED_RETRY_MAX_MS, Math.max(OWED_RETRY_MIN_MS, ms));
}

/**
 * The next report to ask, or null: one at a time; one unanswered past OWED_ANSWER_MS is asked again
 * under its id. Returns { entry, report } (report is the feat_add payload, with the id).
 */
export function nextReport(q, run, now = Date.now()) {
  if (!run) return null;
  if (q.flight) {
    if (now - q.flight.at < OWED_ANSWER_MS) return null;
    q.flight = null;
  }
  if (now < q.retryAt) return null;
  const key = runKey(run);
  for (const e of q.list) {
    if (e.run !== key || (e.retryAt || 0) > now) continue;
    if (now < q.pacedUntil && !unpaced(e)) continue;
    const report = reportFor(run, e.feat, Math.max(1, e.n - e.done), { act: e.act, street: e.street, op: e.op });
    if (!report) {
      e.dead = true;
      continue;
    }
    report.id = e.id;
    return { entry: e, report };
  }
  if (q.list.some((e) => e.dead)) q.list = q.list.filter((e) => !e.dead);
  return null;
}

/** The report went out (client.send said yes). */
export function owedSent(q, entry, now = Date.now()) {
  entry.asked = true;
  q.flight = { id: entry.id, at: now };
}

/** The send was refused: offline (or displaced); asked again OWED_OFFLINE_MS later. */
export function owedOffline(q, now = Date.now()) {
  q.flight = null;
  q.retryAt = now + OWED_OFFLINE_MS;
}

/** A new connection: what was asked on the old one is asked again (the server forgot its bucket too). */
export function owedReconnected(q) {
  q.flight = null;
  q.retryAt = 0;
  q.pacedUntil = 0;
  for (const e of q.list) e.retryAt = 0;
}

/**
 * feat_counted. Matched by its id; an answer without one (a server from before report ids) answers
 * the one in flight for that Feat. Returns null when it answers no owed report, else
 * { entry, settled, accepted } (accepted: the server counted it, now or before; the cap is spent then).
 */
export function owedAnswer(q, msg, now = Date.now()) {
  const id = typeof msg?.id === 'string' ? msg.id : '';
  let entry = null;
  if (id) {
    q.idsSeen = true;
    entry = q.list.find((e) => e.id === id) || null;
  } else if (q.flight && !q.idsSeen) {
    const e = q.list.find((o) => o.id === q.flight.id);
    if (e && e.feat === msg?.feat && (!e.street || !msg.street || e.street === msg.street)) entry = e;
  }
  if (!entry) return null;
  if (q.flight?.id === entry.id) q.flight = null;
  const reason = String(msg.reason || '');
  const n = Math.max(0, Math.floor(Number(msg.n)) || 0);
  const before = entry.done;
  const done = Number(msg.done);
  entry.done = Number.isFinite(done) && done >= 0 ? Math.max(entry.done, Math.floor(done)) : entry.done + n;
  const want = whole(msg.want) || entry.n;
  const accepted = entry.done > before || reason === 'dup';
  const settled = FINAL.has(reason) || (!reason && entry.done >= want);
  if (reason === 'not_today') {
    const run = entry.run;
    q.list = q.list.filter((e) => e !== entry && (!run || e.run !== run));
  } else if (settled) {
    q.list = q.list.filter((e) => e !== entry);
  } else {
    // The pace held all or part of it: asked again a pace interval later, the Feat's other reports too.
    entry.retryAt = now + retryDelay(entry.feat, want - entry.done);
    if (!unpaced(entry)) q.pacedUntil = entry.retryAt;
  }
  return { entry, settled, accepted, reason };
}

/** What is owed: the reports, and the amount left of them (for one Feat when feat is given). */
export function owedCount(q, feat = '') {
  let reports = 0;
  let amount = 0;
  for (const e of q.list) {
    if (feat && e.feat !== feat) continue;
    reports += 1;
    amount += Math.max(0, e.n - e.done);
  }
  return { reports, amount };
}

/** The save's copy. */
export function owedSave(q) {
  return q.list.map((e) => {
    const out = { id: e.id, feat: e.feat, run: e.run, n: e.n, done: e.done, at: e.at };
    for (const k of ['act', 'street', 'op']) if (e[k]) out[k] = e[k];
    if (e.cap) out.cap = { ...e.cap };
    if (e.capSpent) out.capSpent = true;
    if (e.asked) out.asked = true;
    return out;
  });
}

/** A save's owed reports, checked field by field (anything malformed is left out). */
export function owedRestore(raw) {
  const q = createOwed();
  if (!Array.isArray(raw)) return q;
  const ids = new Set();
  for (const r of raw.slice(-OWED_MAX)) {
    if (!r || typeof r !== 'object') continue;
    const id = String(r.id || '');
    const feat = String(r.feat || '');
    const run = String(r.run || '');
    const n = whole(r.n);
    if (!OWED_ID_RE.test(id) || ids.has(id) || !FEAT_RE.test(feat) || !n || (run && (!RUN_RE.test(run) || !run.startsWith(`${feat}:`)))) continue;
    const e = { id, feat, run, n, done: Math.min(n, Math.max(0, Math.floor(Number(r.done)) || 0)), at: Math.max(0, Number(r.at) || 0) };
    if (r.act != null) {
      if (!ACT_RE.test(String(r.act))) continue;
      e.act = String(r.act);
    }
    if (r.street != null) {
      if (!STREET_RE.test(String(r.street))) continue;
      e.street = String(r.street);
    }
    if (r.op != null) {
      if (!DONATION_OP_RE.test(String(r.op))) continue;
      e.op = String(r.op);
    }
    if (r.cap && typeof r.cap === 'object' && typeof r.cap.key === 'string' && r.cap.key) {
      e.cap = { key: r.cap.key.slice(0, 120), max: Math.max(1, whole(r.cap.max) || 1) };
      if (r.capSpent === true) e.capSpent = true;
    }
    if (r.asked === true) e.asked = true;
    ids.add(id);
    q.list.push(e);
  }
  return q;
}
