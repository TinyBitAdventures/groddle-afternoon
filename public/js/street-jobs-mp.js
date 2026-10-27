/**
 * Street projects in multiplayer (G346): the pure half of the shared Job
 * Board. The realtime server (groddle-afternoon-server projects.go, its
 * header lists the messages and the source rules) owns every street-building
 * and street-upgrade project; the Groddle site's ledger takes each item and
 * currant contribution out before it counts and puts each phase reward's
 * currants and items in (src/LedgerProject.php). This turns the server's
 * rows into the board's (js/street-jobs.js) state, keeps the ids a save has
 * applied, and words the shared bits. features/street-jobs-feature.js uses
 * it only when engine.mode is 'multiplayer'; solo never loads a line of it
 * into its state.
 */

import { phaseBaseCost } from './street-jobs.js?v=jobs-3';

/** Ids a save remembers as applied (the site's LedgerMath::PROJECT_APPLIED_KEEP). */
export const APPLIED_KEEP = 64;

/** Words the multiplayer board adds (the refusals come from the server). */
export const MP_TEXT = Object.freeze({
  offline: 'You are not connected right now, so the project cannot take that.',
  offlineWork: 'You are not connected right now, so your work on the project stopped.',
  counting: 'Counting your contribution...',
  lostWork: 'The project stopped hearing your work.',
  note: 'Amounts are 1/50 of the original totals, shared by everyone on this street.',
  winner: 'As one of the top contributors you also earned the performance rewards.',
  notWinner: 'The top contributors also earned the performance rewards.',
});

const whole = (v) => Math.max(0, Math.floor(Number(v) || 0));
const clean = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

/** Is this one of the projects the server shares (a street's build or upgrade)? Homes' restorations stay per player. */
export function isSharedJob(catalog, jobId) {
  const kind = catalog?.jobs?.[jobId]?.kind;
  return kind === 'street' || kind === 'upgrade';
}

/** A server time (ms) on this page's clock: offset is server now minus local now. */
export const localTime = (t, offset) => (whole(t) ? whole(t) - (Number(offset) || 0) : 0);

/** The server's row (projects.go rowJSON) as the board's row (street-jobs.js cleanRow), plus the shared extras. */
export function rowFromServer(row, offset = 0) {
  const counts = (o) => {
    const out = {};
    for (const [k, n] of Object.entries(o && typeof o === 'object' ? o : {})) if (clean(k)) out[clean(k)] = whole(n);
    return out;
  };
  return {
    phase: whole(row?.phase),
    got: counts(row?.got),
    mine: counts(row?.mine),
    hired: {},
    startedAt: localTime(row?.started, offset),
    readyAt: localTime(row?.ready, offset),
    doneAt: localTime(row?.done, offset),
    option: row?.option ? clean(row.option) : null,
    held: counts(row?.held),
    votes: counts(row?.votes),
    top: (Array.isArray(row?.top) ? row.top : []).slice(0, 5).map((c) => ({ id: whole(c?.id), name: String(c?.name || 'A Glitch').slice(0, 40), cost: whole(c?.cost) })),
    count: whole(row?.count),
  };
}

/** project_world / project_built: finished projects and resting streets into the board's state. */
export function applyWorld(state, catalog, { built = {}, rest = {} } = {}, offset = 0) {
  let changed = false;
  for (const [jobId, b] of Object.entries(built || {})) {
    if (!isSharedJob(catalog, jobId)) continue;
    const row = state.jobs[jobId] || rowFromServer({}, offset);
    const at = localTime(b?.at, offset) || 1;
    if (row.doneAt !== at || row.option !== (b?.option ? clean(b.option) : row.option)) changed = true;
    row.doneAt = at;
    if (b?.option) row.option = clean(b.option);
    state.jobs[jobId] = row;
  }
  for (const [tsid, at] of Object.entries(rest || {})) {
    if (!clean(tsid)) continue;
    const t = localTime(at, offset);
    if (state.streetDone[clean(tsid)] !== t) changed = true;
    state.streetDone[clean(tsid)] = t;
  }
  return changed;
}

/**
 * A character's save from before the shared board: a project it finished on
 * its own keeps its road open for it (grandfathered), and every shared row
 * goes (the server's rows replace them). Returns whether anything changed.
 */
export function migrateToShared(state, catalog) {
  let changed = false;
  for (const [jobId, row] of Object.entries(state.jobs || {})) {
    if (!isSharedJob(catalog, jobId)) continue;
    const job = catalog.jobs[jobId];
    if (row?.doneAt && job.kind === 'street' && job.street && !state.grandfathered.includes(job.street)) state.grandfathered.push(job.street);
    delete state.jobs[jobId];
    changed = true;
  }
  for (const tsid of Object.keys(state.streetDone || {})) {
    delete state.streetDone[tsid];
    changed = true;
  }
  return changed;
}

/** The saved slice in multiplayer: the player's own bits (no shared rows) and the applied ids. */
export function sharedSlice(state, catalog, lists) {
  const jobs = {};
  for (const [jobId, row] of Object.entries(state.jobs || {})) if (!isSharedJob(catalog, jobId)) jobs[jobId] = row;
  return {
    ...state,
    jobs,
    streetDone: {},
    applied: [...(lists?.applied || [])].slice(-APPLIED_KEEP),
    rewarded: [...(lists?.rewarded || [])].slice(-APPLIED_KEEP),
  };
}

/** The applied and rewarded id lists out of a saved slice. */
export function listsFrom(slice) {
  const list = (v) => [...new Set((Array.isArray(v) ? v : []).map((id) => String(id || '')).filter((id) => /^job-[gr]-[a-z0-9-]{1,34}$/.test(id)))].slice(-APPLIED_KEEP);
  return { applied: list(slice?.applied), rewarded: list(slice?.rewarded) };
}

export function remember(list, id) {
  if (!list.includes(id)) list.push(id);
  if (list.length > APPLIED_KEEP) list.splice(0, list.length - APPLIED_KEEP);
  return list;
}

/** The player's own count of distinct phases contributed to (the group_count badges), as street-jobs.js record does. */
export function markContributed(state, jobId, classTsid) {
  const key = clean(`${jobId}-${classTsid}`);
  const newPhase = !state.phasesContributed.includes(key);
  if (newPhase) state.phasesContributed.push(key);
  return { newPhase, distinctPhases: state.phasesContributed.length };
}

/** "Ada 59%, Bo 41%": the phase's top contributors by their share of its total base cost. */
export function topLine(row, def, divisor) {
  const total = phaseBaseCost(def, divisor) || 1;
  const top = row?.top || [];
  if (!top.length) return '';
  const more = whole(row?.count) > top.length ? ` and ${whole(row.count) - top.length} more` : '';
  return `${top.map((c) => `${c.name} ${Math.round((c.cost / total) * 100)}%`).join(', ')}${more}`;
}

/** The share of a phase this player put in, from its row's mine (per phase class). */
export function phaseShare(row, classTsid, def, divisor) {
  const total = phaseBaseCost(def, divisor);
  return total ? Math.min(1, whole(row?.mine?.[classTsid]) / total) : 0;
}

/**
 * What of a project_reward to apply: everything, unless the site already put
 * its currants and items into the stored save on a load (the id is applied
 * but this page never applied the reward), or it was all applied before.
 */
export function rewardPlan(msg, lists) {
  const id = String(msg?.id || '');
  if (lists.rewarded.includes(id)) return { skip: true };
  return { skip: false, ledger: !lists.applied.includes(id) };
}

/** A reward message's parts as payout() takes them; ledger false drops what the site already put in. */
export function rewardParts(msg, { ledger = true } = {}) {
  const r = msg?.rewards || {};
  const p = msg?.performance || {};
  const favor = (list) => (Array.isArray(list) ? list : []).filter((f) => f && f.giant && whole(f.points)).map((f) => ({ giant: String(f.giant), points: whole(f.points) }));
  return {
    rewards: { xp: whole(r.xp), currants: ledger ? whole(r.currants) : 0, mood: whole(r.mood), energy: whole(r.energy), favor: favor(r.favor) },
    performance: {
      xp: whole(p.xp),
      mood: whole(p.mood),
      energy: whole(p.energy),
      currants: ledger ? whole(p.currants) : 0,
      favor: favor(p.favor),
      items: ledger ? (Array.isArray(p.items) ? p.items : []).filter((it) => clean(it?.c) && whole(it?.n)).map((it) => ({ classTsid: clean(it.c), count: whole(it.n) })) : [],
    },
  };
}
