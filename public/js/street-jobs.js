/**
 * Street projects ("jobs"): pure rules over the catalog built by
 * build-street-jobs.mjs (public/assets/content/street-jobs.json).
 *
 * How the original worked (glitch-GameServerJS, CC0):
 *  - locations/inc_jobs.js: a street's `jobs` hash names the street a job
 *    builds (street_info.type 1) and the connecting streets whose Street
 *    Spirit offers it (type 2). Phases run in `in_order`; a finished phase can
 *    hold the next one back for `delay_seconds`. A street offers no new
 *    street-building job for 30 minutes after its last one finished. A locked
 *    street's incoming signposts stay locked until the job is done
 *    (jobs_modify_connections), then they open.
 *  - quests/quest.js: requirements sit in buckets; a bucket's group N+1 opens
 *    once every requirement in group N is complete (getCurrentReqGroup).
 *    Items and currants add `amount * base_cost` to your contribution; work
 *    needs a working tool from `class_ids` and the listed skill.
 *  - items/include/jobs.js: work runs one unit every 1,500 ms, each unit
 *    costs the requirement's energy and tool wear, and stops when energy
 *    would drop to the unit cost, the tool breaks, or you leave.
 *  - players/inc_jobs.js: each contributor's phase rewards are the class
 *    rewards times (your base cost / the phase's total base cost). The top
 *    contributors (performance_percent, else performance_cutoff) also get
 *    the performance rewards and drop tables, and every top-five finisher
 *    gets a `job_phase_winner` badge count. Finishing a street job hands
 *    every contributor a Teleportation Script to the new street.
 *  - locations/inc_upgrades.js: a street upgrade swaps the street to the
 *    winning option's template geometry.
 *
 * Solo version (documented choices):
 *  - SOLO_DIVISOR: every requirement amount is ceil(source / 50), minimum 1,
 *    because the source totals were sized for a whole server (a typical
 *    phase needed 3,000 items and 2,500 work units).
 *  - Rewards keep the source share formula, then divide by the same 50, so
 *    a phase pays what a 1/50 contributor earned (7,500 iMG becomes 150).
 *    You are always the top contributor, so the performance rewards and drop
 *    tables are source-exact and unscaled.
 *  - Hire a hand: work you cannot do yourself (no working tool from the
 *    list, or missing the skill) can be paid for at the requirement's
 *    base_cost in currants per unit, the source's own value of one unit. It
 *    stands in for the neighbours who held that tool and skill.
 *  - Upgrades: the option you pick is the winning vote. The template
 *    geometry is not in the public dump, so the feature applies a clean
 *    ecology improvement read from the option's own description.
 *  - Restorations (job type 5, kind 'restore'): a depleted cultivation's
 *    proto offers its job_cult_* class (items/proto_*.js setJobData). These
 *    were sized for a home owner and a few neighbours, so they run at the
 *    source amounts (`divisor: 1`), and the reward is the class reward times
 *    your share times the proto's lifespan multiplier (players/inc_jobs.js
 *    jobs_familiar_job_complete_do: my_contribution / getTotalBasecost *
 *    multiplier; quest.js passes spirit.getMaxWearMultiplier()).
 */

export const SOLO_DIVISOR = 50;
/** items/include/jobs.js startJobWork unit_duration. */
export const WORK_UNIT_MS = 1500;
/** locations/inc_jobs.js jobs_get_available: 30 * 60 seconds. */
export const STREET_JOB_COOLDOWN_MS = 30 * 60 * 1000;
export const PHASE_WINNER_COUNTER = 'job_phase_winner:count';
export const PARTICIPANT_COUNTER = 'job_contribution_phases:all';
/** achievements/*.js group_count on job_contributions: distinct phases contributed to. */
export const CONTRIBUTION_BADGES = Object.freeze([
  ['interested_party', 5],
  ['team_player', 17],
  ['project_enthusiast', 53],
  ['up_n_comer', 137],
  ['deeply_concerned_citizen', 253],
]);
export const TROPHY_FAMILIES = Object.freeze(['wood', 'earth', 'rock', 'dirt']);

const clean = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
const whole = (value) => Math.max(0, Math.floor(Number(value) || 0));
const gTsid = (tsid) => {
  const s = String(tsid || '');
  return s.startsWith('L') ? `G${s.slice(1)}` : s;
};

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */

function cleanRow(row) {
  const got = {};
  for (const [rid, n] of Object.entries(row?.got || {})) if (clean(rid)) got[clean(rid)] = whole(n);
  const mine = {};
  for (const [cls, n] of Object.entries(row?.mine || {})) if (clean(cls)) mine[clean(cls)] = whole(n);
  const hired = {};
  for (const [cls, n] of Object.entries(row?.hired || {})) if (clean(cls)) hired[clean(cls)] = whole(n);
  return {
    phase: whole(row?.phase),
    got,
    mine,
    hired,
    startedAt: whole(row?.startedAt),
    readyAt: whole(row?.readyAt),
    doneAt: whole(row?.doneAt),
    option: row?.option ? clean(row.option) : null,
  };
}

/** Persistable slice; hostile or missing input becomes a fresh state. */
export function normalizeStreetJobState(seed = {}) {
  const src = seed && typeof seed === 'object' ? seed : {};
  const jobs = {};
  for (const [id, row] of Object.entries(src.jobs || {})) if (clean(id)) jobs[clean(id)] = cleanRow(row);
  const streetDone = {};
  for (const [tsid, at] of Object.entries(src.streetDone || {})) if (clean(tsid)) streetDone[clean(tsid)] = whole(at);
  const list = (value) => [...new Set((Array.isArray(value) ? value : []).map(clean).filter(Boolean))];
  return {
    v: 1,
    initialized: src.initialized === true,
    grandfathered: list(src.grandfathered),
    jobs,
    streetDone,
    phasesContributed: list(src.phasesContributed),
    phaseWins: whole(src.phaseWins),
    trophiesGranted: list(src.trophiesGranted),
  };
}

/**
 * First run on a save: every street already visited counts as built, so an
 * existing world never loses a road it has walked.
 */
export function initializeStreetJobs(state, visited = []) {
  if (state.initialized) return false;
  state.initialized = true;
  state.grandfathered = [...new Set([...state.grandfathered, ...visited.map((t) => clean(gTsid(t)))])].filter(Boolean);
  return true;
}

const rowFor = (state, jobId) => (state.jobs[jobId] ||= cleanRow({}));

/* ------------------------------------------------------------------ */
/* Catalog helpers                                                      */
/* ------------------------------------------------------------------ */

export function soloNeed(num, divisor = SOLO_DIVISOR) {
  return Math.max(1, Math.ceil(whole(num) / (divisor > 0 ? divisor : SOLO_DIVISOR)));
}

/** A job's amount divisor: SOLO_DIVISOR, or the job's own (restorations run at 1). */
export function jobDivisor(job) {
  const d = Number(job?.divisor);
  return d > 0 ? d : SOLO_DIVISOR;
}

export function jobDef(catalog, jobId) {
  return catalog?.jobs?.[jobId] || null;
}

export function phaseClass(catalog, jobId, index) {
  const job = jobDef(catalog, jobId);
  const phase = job?.phases?.[index];
  return phase ? { phase, def: catalog.classes?.[phase.classTsid] || null } : null;
}

/** Source text with {job_location}, {job_participation}, {job_phase}, {job_phase_label}. */
export function jobText(template, vars = {}) {
  return String(template || '')
    .replace(/\{job_location\}/g, vars.location || '')
    .replace(/\{job_participation\}/g, String(vars.participation ?? 0))
    .replace(/\{job_phase\}/g, vars.phase || '')
    .replace(/\{job_phase_label\}/g, vars.phaseLabel || '');
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
export const phaseOrdinal = (index) => ORDINALS[index] || `${index + 1}th`;

/** Strip the source's HTML/split markup for plain UI text. */
export function plainText(html) {
  return String(html || '')
    .replace(/<split[^>]*>/g, '\n\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Total base cost of a phase at solo amounts (quest.js getTotalBasecost). */
export function phaseBaseCost(def, divisor = SOLO_DIVISOR) {
  return (def?.requirements || []).reduce((sum, r) => sum + soloNeed(r.num, divisor) * whole(r.baseCost), 0);
}

/**
 * Requirements of the job's current phase with solo amounts, progress, and
 * the bucket/group gate.
 */
export function phaseRequirements(state, catalog, jobId, index = null) {
  const row = state.jobs[jobId] || cleanRow({});
  const at = index == null ? row.phase : index;
  const pc = phaseClass(catalog, jobId, at);
  if (!pc?.def) return [];
  const sameRow = at === row.phase;
  const divisor = jobDivisor(jobDef(catalog, jobId));
  const reqs = pc.def.requirements.map((r) => {
    const need = soloNeed(r.num, divisor);
    const got = sameRow ? Math.min(need, whole(row.got[r.id])) : at < row.phase || row.doneAt ? need : 0;
    return { ...r, need, got, done: got >= need };
  });
  for (const r of reqs) r.open = !r.done && r.group <= currentReqGroup(reqs, r.bucket);
  return reqs;
}

/** quest.js getCurrentReqGroup: the lowest group in the bucket not yet complete. */
export function currentReqGroup(reqs, bucket) {
  const groups = [...new Set(reqs.filter((r) => r.bucket === bucket).map((r) => r.group))].sort((a, b) => a - b);
  let open = 1;
  for (const group of groups) {
    const rows = reqs.filter((r) => r.bucket === bucket && r.group === group);
    if (rows.every((r) => r.done)) open = group + 1;
  }
  return open;
}

/* ------------------------------------------------------------------ */
/* Status                                                               */
/* ------------------------------------------------------------------ */

/**
 * A street project counts as built when finished, or grandfathered/exempt.
 * `force` lists jobs to run regardless (QA demo boards).
 */
export function isJobBuilt(state, catalog, jobId, { exemptFrom = [], force = [] } = {}) {
  const job = jobDef(catalog, jobId);
  if (!job) return true;
  if (state.jobs[jobId]?.doneAt) return true;
  if (force.includes(jobId)) return false;
  if (job.kind !== 'street') return false;
  if (state.grandfathered.includes(job.street)) return true;
  return job.connecting.some((tsid) => exemptFrom.includes(tsid));
}

/**
 * 'built' | 'done' | 'delayed' | 'cooldown' | 'active' | 'open'
 * plus the phase index and, for waits, when they end.
 */
export function jobStatus(state, catalog, jobId, now = Date.now(), opts = {}) {
  const job = jobDef(catalog, jobId);
  const row = state.jobs[jobId];
  if (!job) return { status: 'built', phase: 0 };
  if (row?.doneAt) return { status: 'done', phase: job.phases.length - 1 };
  if (isJobBuilt(state, catalog, jobId, opts)) return { status: 'built', phase: 0 };
  const phase = row?.phase || 0;
  if (row?.readyAt && row.readyAt > now) return { status: 'delayed', phase, until: row.readyAt };
  const started = Boolean(row?.startedAt);
  if (!started && job.kind === 'street') {
    const offering = opts.street || job.connecting[0];
    const last = state.streetDone[offering] || 0;
    if (last && now - last < STREET_JOB_COOLDOWN_MS) {
      return { status: 'cooldown', phase, until: last + STREET_JOB_COOLDOWN_MS };
    }
  }
  return { status: started ? 'active' : 'open', phase };
}

const STATUS_RANK = { active: 0, open: 1, delayed: 2, cooldown: 3, done: 4, built: 5 };

/** Every project a street's board offers, best first (items/include/jobs.js offerJobs). */
export function streetJobs(state, catalog, tsid, now = Date.now(), opts = {}) {
  const ids = catalog?.byStreet?.[gTsid(tsid)] || [];
  return ids
    .map((jobId, order) => ({ jobId, order, ...jobStatus(state, catalog, jobId, now, { ...opts, street: gTsid(tsid) }) }))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.order - b.order);
}

/** Does this street need a board (any project not finished)? */
export function streetHasOpenProject(state, catalog, tsid, now = Date.now(), opts = {}) {
  return streetJobs(state, catalog, tsid, now, opts).some((row) => row.status !== 'done' && row.status !== 'built');
}

/* ------------------------------------------------------------------ */
/* Contributing                                                         */
/* ------------------------------------------------------------------ */

function canContribute(state, catalog, jobId, now) {
  const status = jobStatus(state, catalog, jobId, now);
  if (status.status === 'active' || status.status === 'open') return { ok: true, status };
  const msg = {
    done: 'This project is finished.',
    built: 'This street is already built.',
    delayed: 'The next phase is not ready yet.',
    cooldown: 'This street just finished a project. The next one opens soon.',
  }[status.status];
  return { ok: false, status, msg: msg || 'This project is not open.' };
}

function record(state, catalog, jobId, classTsid, baseCost, now, { hired = false } = {}) {
  const row = rowFor(state, jobId);
  if (!row.startedAt) row.startedAt = now;
  row.mine[classTsid] = (row.mine[classTsid] || 0) + baseCost;
  if (hired) row.hired[classTsid] = (row.hired[classTsid] || 0) + baseCost;
  const key = clean(`${jobId}-${classTsid}`);
  const newPhase = !state.phasesContributed.includes(key);
  if (newPhase) state.phasesContributed.push(key);
  return { newPhase, distinctPhases: state.phasesContributed.length };
}

/** Badges whose distinct-phase threshold was just reached. */
export function contributionBadgesReached(distinctPhases, before = distinctPhases - 1) {
  return CONTRIBUTION_BADGES.filter(([, n]) => before < n && distinctPhases >= n).map(([id]) => id);
}

/**
 * quest.js inc_item: put up to `count` of one item into the first open
 * requirement for it. Mutates `inv` (plain class -> count map).
 */
export function contributeItems(state, catalog, jobId, classId, count, inv, now = Date.now()) {
  const gate = canContribute(state, catalog, jobId, now);
  if (!gate.ok) return { ok: false, msg: gate.msg };
  const req = phaseRequirements(state, catalog, jobId).find((r) => r.type === 'item' && r.classId === classId && r.open);
  if (!req) return { ok: false, msg: 'Nothing here needs that right now.' };
  const have = whole(inv?.[classId]);
  const amount = Math.min(whole(count), have, req.need - req.got);
  if (amount <= 0) return { ok: false, msg: `You have no ${classId.replace(/_/g, ' ')} to give.` };
  inv[classId] = have - amount;
  const row = rowFor(state, jobId);
  row.got[req.id] = req.got + amount;
  const classTsid = jobDef(catalog, jobId).phases[row.phase].classTsid;
  const rec = record(state, catalog, jobId, classTsid, amount * req.baseCost, now);
  return { ok: true, amount, baseCost: amount * req.baseCost, req, ...rec, phaseReady: phaseIsComplete(state, catalog, jobId) };
}

/** quest.js inc_currants. Mutates pc.currants. */
export function contributeCurrants(state, catalog, jobId, amount, pc, now = Date.now()) {
  const gate = canContribute(state, catalog, jobId, now);
  if (!gate.ok) return { ok: false, msg: gate.msg };
  const req = phaseRequirements(state, catalog, jobId).find((r) => r.type === 'currants' && r.open);
  if (!req) return { ok: false, msg: 'No currants are needed right now.' };
  const pay = Math.min(whole(amount), whole(pc?.currants), req.need - req.got);
  if (pay <= 0) return { ok: false, msg: 'You do not have any currants to give.' };
  pc.currants = whole(pc.currants) - pay;
  const row = rowFor(state, jobId);
  row.got[req.id] = req.got + pay;
  const classTsid = jobDef(catalog, jobId).phases[row.phase].classTsid;
  const rec = record(state, catalog, jobId, classTsid, pay * req.baseCost, now);
  return { ok: true, amount: pay, baseCost: pay * req.baseCost, req, ...rec, phaseReady: phaseIsComplete(state, catalog, jobId) };
}

/**
 * Can the player do one unit of this work requirement themselves?
 * ctx: { inv, learned: string[], energy, toolOk(classTsid, wear) -> bool }
 */
export function workCheck(state, catalog, jobId, rid, ctx = {}, now = Date.now()) {
  const gate = canContribute(state, catalog, jobId, now);
  if (!gate.ok) return { ok: false, msg: gate.msg };
  const req = phaseRequirements(state, catalog, jobId).find((r) => r.id === rid && r.type === 'work');
  if (!req) return { ok: false, msg: 'There is no such work.' };
  if (!req.open) return { ok: false, req, msg: req.done ? "There's no more work left to do." : 'Finish the earlier steps first.' };
  const tools = req.classIds?.length ? req.classIds : [req.classId];
  const held = tools.filter((tool) => whole(ctx.inv?.[tool]) > 0);
  const tool = held.find((t) => (ctx.toolOk ? ctx.toolOk(t, req.wear) : true)) || null;
  const missingSkill = req.skill && !(ctx.learned || []).includes(req.skill);
  const canHire = !tool || missingSkill;
  if (!held.length) return { ok: false, req, canHire, msg: `You need a ${tools[0].replace(/_/g, ' ')}.` };
  if (!tool) return { ok: false, req, canHire, msg: "You don't have the necessary working tool." };
  if (missingSkill) return { ok: false, req, canHire, tool, msg: 'You need the skill this work asks for.' };
  const energy = ctx.energy ?? ctx.pc?.energy;
  if (whole(energy) <= req.energy) return { ok: false, req, tool, canHire: false, msg: "You don't have enough energy to continue." };
  return { ok: true, req, tool, canHire: false };
}

/**
 * One 1.5 s work unit (items/include/jobs.js acceptJobWork). Charges energy
 * on pc and calls ctx.useTool(classTsid, wear) for wear.
 */
export function applyWorkUnit(state, catalog, jobId, rid, ctx = {}, now = Date.now()) {
  const check = workCheck(state, catalog, jobId, rid, { ...ctx, energy: ctx.pc?.energy }, now);
  if (!check.ok) return check;
  const { req, tool } = check;
  ctx.pc.energy = Math.max(0, (Number(ctx.pc.energy) || 0) - req.energy);
  const wear = ctx.useTool ? ctx.useTool(tool, req.wear) : null;
  const row = rowFor(state, jobId);
  row.got[req.id] = req.got + 1;
  const classTsid = jobDef(catalog, jobId).phases[row.phase].classTsid;
  const rec = record(state, catalog, jobId, classTsid, req.baseCost, now);
  return {
    ok: true,
    amount: 1,
    req,
    tool,
    wear,
    energy: req.energy,
    left: req.need - req.got - 1,
    ...rec,
    phaseReady: phaseIsComplete(state, catalog, jobId),
  };
}

/** Currants to hire out the rest of a work requirement (base_cost per unit). */
export function hireQuote(state, catalog, jobId, rid) {
  const req = phaseRequirements(state, catalog, jobId).find((r) => r.id === rid && r.type === 'work');
  if (!req || req.done) return { ok: false, units: 0, cost: 0 };
  const units = req.need - req.got;
  return { ok: true, req, units, cost: units * whole(req.baseCost) };
}

/** Hire a hand for the remaining units; only when you cannot work it yourself. */
export function hireWork(state, catalog, jobId, rid, ctx = {}, now = Date.now()) {
  const check = workCheck(state, catalog, jobId, rid, { ...ctx, energy: Infinity }, now);
  if (check.ok) return { ok: false, msg: 'You can do this work yourself.' };
  if (!check.canHire) return { ok: false, msg: check.msg };
  if (!check.req.open) return { ok: false, msg: check.msg };
  const quote = hireQuote(state, catalog, jobId, rid);
  if (whole(ctx.pc?.currants) < quote.cost) return { ok: false, msg: `Hiring a hand costs ${quote.cost} currants.` };
  ctx.pc.currants = whole(ctx.pc.currants) - quote.cost;
  const row = rowFor(state, jobId);
  row.got[rid] = check.req.need;
  const classTsid = jobDef(catalog, jobId).phases[row.phase].classTsid;
  const rec = record(state, catalog, jobId, classTsid, quote.cost, now, { hired: true });
  return { ok: true, units: quote.units, cost: quote.cost, req: check.req, ...rec, phaseReady: phaseIsComplete(state, catalog, jobId) };
}

/**
 * Has anyone put anything into this job yet (items/include/jobs.js
 * hasInProgressJob: started and not finished)?
 */
export function jobInProgress(state, jobId) {
  const row = state.jobs[jobId];
  return Boolean(row && row.startedAt && !row.doneAt);
}

/**
 * Wine of the Dead on a proto (items/wine_of_the_dead.js pour: target.resetJob):
 * the project is cancelled and everything put into it is gone.
 */
export function cancelJob(state, jobId) {
  if (!jobInProgress(state, jobId)) return false;
  delete state.jobs[jobId];
  return true;
}

export function phaseIsComplete(state, catalog, jobId) {
  const reqs = phaseRequirements(state, catalog, jobId);
  return reqs.length > 0 && reqs.every((r) => r.done);
}

/** Upgrade vote: the option you back is the winning option. */
export function chooseOption(state, catalog, jobId, optionId) {
  const job = jobDef(catalog, jobId);
  if (job?.kind !== 'upgrade') return false;
  const up = catalog.upgrades?.[job.street];
  if (!up?.options?.some((o) => o.id === optionId)) return false;
  rowFor(state, jobId).option = optionId;
  return true;
}

/* ------------------------------------------------------------------ */
/* Completing                                                           */
/* ------------------------------------------------------------------ */

/** Roll one recovered drop table ([[cumulative%, rows]]). */
export function rollDropTable(table, rng = Math.random) {
  const drops = table?.drops || [];
  const roll = Math.floor(rng() * 100) + 1;
  for (const [chance, rows] of drops) {
    if (roll <= chance) {
      const row = rows[Math.floor(rng() * rows.length) % rows.length];
      return row ? { ...row } : null;
    }
  }
  return null;
}

/**
 * Close the current phase: rewards (players/inc_jobs.js), performance
 * rewards, the next phase's delay, and the job's completion. Mutates state.
 * Returns everything the feature must pay out and announce.
 */
export function settlePhase(state, catalog, jobId, now = Date.now(), rng = Math.random) {
  if (!phaseIsComplete(state, catalog, jobId)) return { ok: false, msg: 'This phase still needs work.' };
  const job = jobDef(catalog, jobId);
  const row = rowFor(state, jobId);
  const index = row.phase;
  const { phase, def } = phaseClass(catalog, jobId, index);
  const divisor = jobDivisor(job);
  const total = phaseBaseCost(def, divisor);
  const mine = row.mine[phase.classTsid] || 0;
  const share = total ? Math.min(1, mine / total) : 1;
  // Restorations: the proto's lifespan multiplier scales the reward (quest.js getMaxWearMultiplier).
  const wearMultiplier = Number(job.rewardMultiplier) > 0 ? Number(job.rewardMultiplier) : 1;
  const mult = (share / divisor) * wearMultiplier;
  const r = def.rewards || {};
  const rewards = {
    xp: Math.round((r.xp || 0) * mult),
    currants: Math.round((r.currants || 0) * mult),
    mood: Math.round((r.mood || 0) * mult),
    energy: Math.round((r.energy || 0) * mult),
    favor: (r.favor || []).map((f) => ({ giant: f.giant, points: Math.round(f.points * mult) })),
  };
  const perf = def.performance || {};
  const performance = { xp: perf.xp || 0, mood: perf.mood || 0, energy: perf.energy || 0, items: [], currants: 0, favor: [] };
  for (const tableId of perf.dropTables || []) {
    const drop = rollDropTable(catalog.drops?.[tableId], rng);
    if (!drop) continue;
    if (drop.class_id) performance.items.push({ classTsid: drop.class_id, count: drop.count || 1 });
    else if (drop.currants) performance.currants += drop.currants;
    else if (drop.favor) performance.favor.push(drop.favor);
  }
  state.phaseWins += 1;
  const finalPhase = index >= job.phases.length - 1;
  const participation = Math.round(share * 100);
  const out = {
    ok: true,
    jobId,
    index,
    phase,
    def,
    share,
    participation,
    rewards,
    performance,
    finalPhase,
    phaseWins: state.phaseWins,
    phaseCount: job.phases.length,
  };
  if (finalPhase) {
    row.doneAt = now;
    if (job.kind === 'street') for (const tsid of job.connecting) state.streetDone[tsid] = now;
    else if (job.street) state.streetDone[job.street] = now;
    out.jobDone = true;
    out.phasesContributed = job.phases.filter((p) => (row.mine[p.classTsid] || 0) > 0).length;
    out.participant = out.phasesContributed >= 4;
    out.option = job.kind === 'upgrade' ? upgradeOption(catalog, job.street, row.option) : null;
  } else {
    row.phase = index + 1;
    row.got = {};
    const next = job.phases[row.phase];
    row.readyAt = next?.delaySeconds ? now + next.delaySeconds * 1000 : 0;
    out.next = next;
    out.readyAt = row.readyAt;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Road locks and upgrades                                              */
/* ------------------------------------------------------------------ */

/**
 * jobs_modify_connections: the road into a street that is still being built
 * stays closed. `signpostTsids` are the destinations the current street's
 * signposts list; the Map stays open (it is the remake's teleport).
 */
export function roadClosure(state, catalog, toTsid, signpostTsids = [], opts = {}) {
  const to = gTsid(toTsid);
  const roads = new Set(signpostTsids.map(gTsid));
  if (!roads.has(to)) return null;
  for (const [jobId, job] of Object.entries(catalog?.jobs || {})) {
    if (job.kind !== 'street' || job.street !== to) continue;
    if (isJobBuilt(state, catalog, jobId, opts)) continue;
    return { jobId, job };
  }
  return null;
}

/** Every street whose road is closed right now (for QA attributes). */
export function closedStreets(state, catalog, opts = {}) {
  const out = new Set();
  for (const [jobId, job] of Object.entries(catalog?.jobs || {})) {
    if (job.kind === 'street' && !isJobBuilt(state, catalog, jobId, opts)) out.add(job.street);
  }
  return [...out];
}

export function upgradeOption(catalog, street, optionId) {
  const options = catalog?.upgrades?.[street]?.options || [];
  return options.find((o) => o.id === optionId) || options[0] || null;
}

/** The applied upgrade for a street, or null. */
export function appliedUpgrade(state, catalog, street) {
  const tsid = gTsid(street);
  for (const [jobId, job] of Object.entries(catalog?.jobs || {})) {
    if (job.kind !== 'upgrade' || job.street !== tsid) continue;
    const row = state.jobs[jobId];
    if (row?.doneAt) return upgradeOption(catalog, tsid, row.option);
  }
  return null;
}

const GIANT_WORDS = {
  alph: 'alph', cosma: 'cosma', friendly: 'friendly', grendaline: 'grendaline', humbaba: 'humbaba',
  lem: 'lem', mab: 'mab', pot: 'pot', spriggan: 'spriggan', ti: 'ti', tii: 'ti', zille: 'zille',
};

/**
 * What an upgrade option's description promises that the remake can show:
 * shrine Giant, more animals (Piggies especially), mining rocks, and ground
 * flora. Platforms, quoin layouts, and sky changes need the lost template
 * geometry.
 */
export function upgradeFeatures(option) {
  const desc = String(option?.desc || '');
  const shrine = desc.match(/shrine (?:is )?(?:to|for) (\w+)/i);
  const flora = [];
  if (/flower/i.test(desc)) flora.push('flowers');
  if (/mushroom|shroom|fungi/i.test(desc)) flora.push('mushrooms');
  if (/bush/i.test(desc)) flora.push('bushes');
  return {
    giantId: shrine ? GIANT_WORDS[shrine[1].toLowerCase()] || null : null,
    moreAnimals: /\bmore\b[^.]*\banimals\b/i.test(desc),
    piggies: /especially piggies/i.test(desc),
    rocks: /mining rocks/i.test(desc),
    flora,
  };
}

/** Apply an upgrade's features to the street's archived ecology entry. */
export function upgradeEcologyEntry(base, option) {
  const f = upgradeFeatures(option);
  const counts = { ...(base?.counts || {}) };
  const bump = (cls, n) => {
    counts[cls] = (counts[cls] || 0) + n;
  };
  if (f.moreAnimals) {
    bump('npc_piggy', 1);
    bump('npc_chicken', 1);
    bump('npc_butterfly', 1);
  }
  if (f.piggies) bump('npc_piggy', 2);
  if (f.rocks) {
    bump('rock_metal_1', 1);
    bump('rock_dullite_1', 1);
  }
  const entry = { ...(base || {}), counts, upgrade: option?.name || '' };
  if (f.giantId) entry.giantId = f.giantId;
  return entry;
}
