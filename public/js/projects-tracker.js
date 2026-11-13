/**
 * The Projects panel's data (ticket 81, Friendly 2026-11-04; Austin approved it the same day,
 * register G520): every street project you have put something into, solo and online, with its
 * street and region, the phase it is on, your own part, how far along it is and what it still
 * needs, and the finished ones with when they finished.
 *
 * Glitch kept the record and never showed it: each player's `jobs.todo` and `jobs.done`
 * (GSJS players/inc_jobs.js 1-16; jobs_accept 111-121 adds a project, jobs_mark_complete 56-91
 * moves it to done), and nothing in the server or the client read it back for a list. Its
 * completion notices (the Magic Rock's "Yay! The ... phase" and "Hooray! The project ... has been
 * completed!", inc_jobs.js 303 and 380-410) are the remake's already (features/street-jobs-feature.js),
 * so the panel only marks a newly finished project until you have looked: it sends nothing of its own.
 *
 * Pure: the board's rules are js/street-jobs.js; `row` is a project's row (the save's in solo,
 * the realtime server's online: projects.go rowJSON through js/street-jobs-mp.js rowFromServer),
 * and only the player's own share is read from it (`mine`). Words come from `labels`.
 */

import { jobDef, jobDivisor, jobStatus, phaseBaseCost, phaseClass, phaseName, phaseRequirements, workGear } from './street-jobs.js?v=47d8573e';

/** The projects the panel follows: a street's build or upgrade, and online a group hall. Homes' restorations stay their home's. */
export const TRACKED_KINDS = Object.freeze(['street', 'upgrade', 'hall']);

export const PROJECTS_TEXT = Object.freeze({
  title: 'Projects',
  // Gap 3: Street Spirits give the projects (a board only where no spirit stands).
  empty: 'You have not put anything into a street project yet. Look for a Street Spirit with a "Project available" bubble, and every street you help build shows up here.',
  active: 'Under way',
  done: 'Done',
  noneActive: 'None under way right now.',
  noneDone: 'None finished yet.',
  needs: 'Still needed',
  nothingLeft: 'Everything for this phase is in.',
  unknown: 'Its progress shows once you are connected.',
  loading: 'Checking your projects...',
  offline: 'Not connected: showing what this game knows.',
  destination: 'Set as Destination',
  teleport: 'Teleport',
  showMap: 'Show on Map',
  newMark: 'New',
  later: 'Opens after the earlier steps',
  // Ticket 81 (Friendly, 2026-11-06): each need says whether you can do it now.
  ready: 'You can do this',
  readySome: 'you can do now',
  haveNone: 'You have none',
  // G656: the featured street project (js/featured-project.js), online only.
  featured: 'Featured',
  featuredCopy: 'The street project everyone is building together. It stays featured until it is built.',
  solo: `Solo amounts: 1/50 of the original totals.`,
  online: 'Shared amounts: 1/50 of the original totals.',
});

const whole = (v) => Math.max(0, Math.floor(Number(v) || 0));
const clean = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
const gTsid = (tsid) => {
  const s = String(tsid || '');
  return s.startsWith('L') ? `G${s.slice(1)}` : s;
};

const boardsCache = new WeakMap();
/** Every street whose board offers a job (catalog.byStreet turned round): job id -> [tsid]. */
export function boardStreets(catalog) {
  if (!catalog) return new Map();
  let out = boardsCache.get(catalog);
  if (out) return out;
  out = new Map();
  for (const [tsid, ids] of Object.entries(catalog.byStreet || {})) {
    for (const id of ids || []) {
      if (!out.has(id)) out.set(id, []);
      out.get(id).push(tsid);
    }
  }
  boardsCache.set(catalog, out);
  return out;
}

/** Your base cost in a row, every phase together. */
export function mineTotal(row) {
  return Object.values(row?.mine || {}).reduce((sum, n) => sum + whole(n), 0);
}

/**
 * The jobs this player has put something into: a row with any of their base cost in it, or a
 * phase the save remembers contributing to (state.phasesContributed, js/street-jobs.js record and
 * js/street-jobs-mp.js markContributed: "<job>-<phase class>"), which online is all a fresh page
 * knows before the server's list comes.
 * @param {object} state the board's state (js/street-jobs.js normalizeStreetJobState)
 * @param {object} catalog street-jobs.json
 * @param {Record<string, object>} rows job id -> row
 */
export function contributedJobs(state, catalog, rows = {}) {
  const out = new Set();
  const tracked = (id) => TRACKED_KINDS.includes(jobDef(catalog, id)?.kind);
  for (const [id, row] of Object.entries(rows || {})) if (tracked(id) && mineTotal(row) > 0) out.add(id);
  const keys = new Set(state?.phasesContributed || []);
  if (keys.size) {
    for (const [id, job] of Object.entries(catalog?.jobs || {})) {
      if (out.has(id) || !TRACKED_KINDS.includes(job.kind)) continue;
      if ((job.phases || []).some((p) => keys.has(clean(`${id}-${p.classTsid}`)))) out.add(id);
    }
  }
  return out;
}

/**
 * Where a project's buttons go: the board you build it at while it runs (the first offering street
 * whose own road is open, as js/street-jobs.js closedRoadText picks), and the street itself once it
 * stands (a new street to walk, an upgraded one to see). A group hall has no street of its own.
 */
export function projectPlace(catalog, jobId, { done = false, closed = [] } = {}) {
  const job = jobDef(catalog, jobId);
  if (!job) return '';
  if (done && job.street && job.kind !== 'hall') return gTsid(job.street);
  const shut = new Set((closed || []).map(gTsid));
  const boards = boardStreets(catalog).get(jobId) || (job.connecting || []);
  return boards.find((t) => !shut.has(gTsid(t))) || boards[0] || gTsid(job.street) || '';
}

/** The picture for a currants need (the board's own, features/street-jobs-feature.js). */
export const CURRANTS_ICON = 'assets/sprites/street-jobs/pile_of_currants.webp';

const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const upper = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Ticket 81 (Friendly, 2026-11-06: "7 more units of work: clear with a Pick (Mining IV)" was a hard
 * read): the task first, what is left at the end. "Clear with a Pick (Mining IV) · 7 units",
 * "Contribute Planks · 12 more", "Contribute currants · 400 more".
 */
export function needLine(r, labels = {}) {
  const left = Math.max(0, whole(r.need) - whole(r.got));
  const n = left.toLocaleString('en-US');
  const item = labels.item || ((cls) => String(cls || '').replace(/_/g, ' '));
  if (r.type === 'currants') return `Contribute currants · ${n} more`;
  if (r.type === 'work') {
    const tool = item(r.classIds?.[0] || r.classId, 1);
    const skill = r.skill && labels.skill ? ` (${labels.skill(r.skill)})` : '';
    const task = r.verb ? `${upper(r.verb)} with ${article(tool)} ${tool}` : `Work with ${article(tool)} ${tool}`;
    return `${task}${skill} · ${n} unit${left === 1 ? '' : 's'}`;
  }
  return `Contribute ${item(r.classId, left)} · ${n} more`;
}

/**
 * Whether you can do a need now, by the board's own rules: work takes a tool in your pack that
 * still works and the skill (js/street-jobs.js workGear, workCheck's rule); items and currants
 * take what you carry (the board's Add and Give put in the lesser of what you have and what is
 * left). Energy is left out, as the board's Hire a hand leaves it out: it comes back.
 * can: 'yes' (all of it), 'some' (items or currants: some of it), 'no', or '' without a ctx.
 * @param {object} r a phaseRequirements row
 * @param {{ inv?: Record<string, number>, learned?: string[], toolOk?: Function, currants?: number, have?: (cls: string) => number }|null} ctx
 */
export function needCan(r, ctx, labels = {}) {
  if (!ctx) return { can: '', mark: '' };
  const left = Math.max(0, whole(r.need) - whole(r.got));
  const item = labels.item || ((cls) => String(cls || '').replace(/_/g, ' '));
  if (r.type === 'work') {
    const gear = workGear(r, ctx);
    const missing = [];
    if (!gear.tool) {
      const tool = item(gear.tools[0], 1);
      missing.push(gear.held.length ? `a working ${tool}` : `${article(tool)} ${tool}`);
    }
    if (gear.missingSkill) missing.push(labels.skill ? labels.skill(r.skill) : String(r.skill));
    return missing.length ? { can: 'no', mark: `You need ${missing.join(' and ')}` } : { can: 'yes', mark: PROJECTS_TEXT.ready };
  }
  const have = r.type === 'currants' ? whole(ctx.currants) : whole(ctx.have ? ctx.have(r.classId) : ctx.inv?.[r.classId]);
  if (!have) return { can: 'no', mark: PROJECTS_TEXT.haveNone };
  return { can: have >= left ? 'yes' : 'some', mark: `You have ${have.toLocaleString('en-US')}` };
}

/** One need as the panel draws it: its words, its picture and count, and whether you can do it now. */
export function needEntry(r, labels = {}, ctx = null) {
  const left = Math.max(0, whole(r.need) - whole(r.got));
  const icon = r.type === 'currants' ? CURRANTS_ICON : labels.icon ? labels.icon(r.type === 'work' ? r.classIds?.[0] || r.classId : r.classId) : '';
  return { id: r.id, type: r.type, classId: r.classId, open: Boolean(r.open), left, text: needLine(r, labels), icon, ...needCan(r, ctx, labels) };
}

/**
 * One project for the panel.
 * @param {object} state the board's state (its grandfathered roads and resting streets)
 * @param {object} catalog street-jobs.json
 * @param {string} jobId
 * @param {object|null} row the project's row, or null when not known yet (online, before the list)
 * @param {{ now?: number, opts?: object, seenAt?: number, closed?: string[], labels?: object, known?: boolean, ctx?: object }} o
 *   labels: { item(cls, n), skill(id), icon(cls) }; ctx: what you carry and know (needCan), or none
 */
export function projectEntry(state, catalog, jobId, row, o = {}) {
  const job = jobDef(catalog, jobId);
  if (!job) return null;
  const now = o.now ?? Date.now();
  const labels = o.labels || {};
  const known = Boolean(row);
  const view = { ...state, jobs: row ? { [jobId]: row } : {} };
  const st = jobStatus(view, catalog, jobId, now, o.opts || {});
  const doneAt = whole(row?.doneAt);
  const finished = st.status === 'done' || st.status === 'built';
  const index = Math.min(job.phases.length - 1, whole(st.phase));
  const pc = phaseClass(catalog, jobId, index);
  const divisor = jobDivisor(job);
  const reqs = known && !finished ? phaseRequirements(view, catalog, jobId) : [];
  const need = reqs.reduce((s, r) => s + whole(r.need), 0);
  const got = reqs.reduce((s, r) => s + Math.min(whole(r.need), whole(r.got)), 0);
  const shares = [];
  job.phases.forEach((p, i) => {
    const mine = whole(row?.mine?.[p.classTsid]);
    if (!mine) return;
    const def = catalog.classes?.[p.classTsid];
    const total = phaseBaseCost(def, divisor);
    shares.push({ index: i, name: phaseName(job, p, def), share: total ? Math.min(1, mine / total) : 0, current: i === index && !finished });
  });
  const place = projectPlace(catalog, jobId, { done: finished, closed: o.closed });
  const boards = boardStreets(catalog).get(jobId) || [];
  return {
    jobId,
    kind: job.kind,
    title: job.title || job.label || jobId,
    label: job.label || '',
    street: gTsid(job.street),
    hub: job.hub || '',
    hubId: String(job.hubId || ''),
    board: boards.find((t) => gTsid(t) === place) || boards[0] || '',
    place,
    status: st.status,
    until: whole(st.until),
    finished,
    known,
    phase: index,
    phaseCount: job.phases.length,
    phaseName: pc ? phaseName(job, pc.phase, pc.def) : '',
    progress: finished ? 1 : need ? got / need : 0,
    shares,
    needs: reqs.filter((r) => !r.done).map((r) => needEntry(r, labels, o.ctx || null)),
    doneAt,
    isNew: finished && doneAt > 0 && doneAt > whole(o.seenAt),
  };
}

const ACTIVE_RANK = { active: 0, open: 1, delayed: 2, cooldown: 3 };

/**
 * Every project of yours, split: `active` (under way: most of the phase in first) and `done`
 * (newest first), and `fresh`, how many finished since you last looked.
 * @param {object} state
 * @param {object} catalog
 * @param {Record<string, object>} rows job id -> row (solo: state.jobs; online: the server's)
 * @param {object} o projectEntry's options
 */
export function projectList(state, catalog, rows = {}, o = {}) {
  const ids = contributedJobs(state, catalog, rows);
  const entries = [...ids].map((id) => projectEntry(state, catalog, id, rows?.[id] || null, o)).filter(Boolean);
  const active = entries
    .filter((e) => !e.finished)
    .sort((a, b) => (ACTIVE_RANK[a.status] ?? 9) - (ACTIVE_RANK[b.status] ?? 9) || b.progress - a.progress || a.title.localeCompare(b.title));
  const done = entries.filter((e) => e.finished).sort((a, b) => b.doneAt - a.doneAt || a.title.localeCompare(b.title));
  return { active, done, fresh: done.filter((e) => e.isNew).length };
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", else the date. */
export function agoWords(ms, now = Date.now()) {
  const t = whole(ms);
  if (!t) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d > 300 ? 'numeric' : undefined });
}

/** The line under a project's title: where it is and how it stands. */
export function statusLine(e, now = Date.now()) {
  const where = [e.label && e.kind === 'street' ? `${e.label}, ${e.hub}` : e.hub].filter(Boolean).join('');
  const mins = (t) => Math.max(1, Math.ceil((t - now) / 60000));
  if (e.finished) {
    if (!e.doneAt) return `${where ? `${where}. ` : ''}The road is open for you.`;
    return `${where ? `${where}. ` : ''}Finished ${agoWords(e.doneAt, now)}.`;
  }
  // A one-phase project's phase is often titled the street itself ("{job_location}"): then it says nothing more.
  const own = e.phaseName && e.phaseName !== e.label ? e.phaseName : '';
  const phase = e.phaseCount > 1 ? `Phase ${e.phase + 1} of ${e.phaseCount}${e.phaseName ? `: ${e.phaseName}` : ''}` : own;
  if (e.status === 'delayed') return `${where ? `${where}. ` : ''}${phase ? `${phase}, opens` : 'Opens'} in ${mins(e.until)} min.`;
  if (e.status === 'cooldown') return `${where ? `${where}. ` : ''}Opens in ${mins(e.until)} min.`;
  if (!phase) return where ? `${where}.` : '';
  return `${where ? `${where}. ` : ''}${phase}${/[.!?]$/.test(phase) ? '' : '.'}`;
}

/** "Your part: 40% of phase 1, 12% of phase 2 so far" (the completion card's per-phase share, contributionsText). */
export function shareLine(e) {
  if (!e.shares.length) return e.known ? '' : 'You put something in.';
  const pct = (s) => `${Math.max(1, Math.round(s.share * 100))}%`;
  if (e.phaseCount === 1) return `Your part: ${pct(e.shares[0])}${e.shares[0].current ? ' so far' : ''}`;
  return `Your part: ${e.shares.map((s) => `${pct(s)} of phase ${s.index + 1}${s.current ? ' so far' : ''}`).join(', ')}`;
}
