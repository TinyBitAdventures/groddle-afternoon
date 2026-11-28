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
 *    tables are source-exact and unscaled far out (see performanceScale for
 *    near the start).
 *  - Hire a hand: work you cannot do yourself (no working tool from the
 *    list, or missing the skill) can be paid for at the requirement's
 *    base_cost in currants per unit, the source's own value of one unit. It
 *    stands in for the neighbours who held that tool and skill.
 *  - Upgrades: the option you pick is the winning vote. The template
 *    geometry is not in the public dump, so the feature applies a clean
 *    ecology improvement read from the option's own description.
 *  - Distance from the start (report #425, js/street-jobs-solo.js): solo, a
 *    street build or upgrade carries `job.solo` { hops, divisor, skillDrop }
 *    from SOLO_CURVE, put on by the feature. Its divisor stands in for
 *    SOLO_DIVISOR (500 next to Hechey Track, 50 far out) in the amounts and
 *    the rewards, and each work ask's skill drops skillDrop levels (waived
 *    near the start). Online the catalog has no `job.solo`, so nothing here
 *    changes for it.
 *  - Restorations (job type 5, kind 'restore'): a depleted cultivation's
 *    proto offers its job_cult_* class (items/proto_*.js setJobData). These
 *    were sized for a home owner and a few neighbours, so they run at the
 *    source amounts (`divisor: 1`), and the reward is the class reward times
 *    your share times the proto's lifespan multiplier (players/inc_jobs.js
 *    jobs_familiar_job_complete_do: my_contribution / getTotalBasecost *
 *    multiplier; quest.js passes spirit.getMaxWearMultiplier()).
 */

export const SOLO_DIVISOR = 50;
import { SUBWAY_STREETS, builtForEveryone, keptOpen } from './open-roads.js?v=d41120cf';
import { loseEnergy } from './metabolics.js?v=48f784bf';
import { soloSkill } from './street-jobs-solo.js?v=32f2a093';
import { htmlToText } from './html-text.js?v=6bbf4d1f';
import { fewestClosures, streetGraph } from './street-graph.js?v=92206051';
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
/** The five pieces of each Street Creator Trophy (items/trophy_street_creator_<family>_piece1..5.js). */
export const TROPHY_PIECES = Object.freeze(TROPHY_FAMILIES.flatMap((f) => [1, 2, 3, 4, 5].map((n) => `trophy_street_creator_${f}_piece${n}`)));

/**
 * The Street Creator Trophies, the source way (report 97). collection_street_creator_<family>
 * (collection_type 2) is earned holding one of each of its five pieces, however they came
 * (players/inc_items.js items_added 593-597, inc_achievements.js achievements_check_in_inventory
 * 520-544); granting it destroys one of each piece (inc_achievements.js 392-401, items_destroy, so
 * a missing one is skipped) and onComplete makes the whole trophy (createItemFromFamiliar). Once
 * per family: a save that got its trophy before keeps its pieces. Returns
 * [{ family, badge, trophy, take }] for the families whose badge is unlocked and trophy not given.
 * countOf(classTsid) is the pack count.
 */
export function planStreetTrophies(state, unlocked, countOf) {
  const out = [];
  const given = state?.trophiesGranted || [];
  for (const family of TROPHY_FAMILIES) {
    const badge = `collection_street_creator_${family}`;
    if (!(unlocked || []).includes(badge) || given.includes(family)) continue;
    const take = [1, 2, 3, 4, 5].map((n) => `trophy_street_creator_${family}_piece${n}`).filter((cls) => (Number(countOf(cls)) || 0) > 0);
    out.push({ family, badge, trophy: `trophy_street_creator_${family}`, take });
  }
  return out;
}

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
    // Ticket 81: when the Projects panel was last open (ms); null until a save has one (the feature sets it).
    trackerSeen: src.trackerSeen == null ? null : whole(src.trackerSeen),
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

/**
 * You arrived on `tsid` (any way: a quest, an instance's exit, a puzzle, a teleporter). If its road
 * was still closed it opens for you now, as a grandfathered street, so the way back to wherever you
 * came from is never a closed road (ticket 50: no street you can stand on cuts you off). Returns
 * true when it changed the state (save it).
 */
export function noteArrival(state, catalog, tsid, opts = {}) {
  const to = clean(gTsid(tsid));
  if (!to || state.grandfathered.includes(to)) return false;
  const closed = roadClosure(state, catalog, to, [to], opts);
  if (!closed) return false;
  state.grandfathered.push(to);
  return true;
}

/**
 * Ticket 50 and Austin's Wintry Place (2026-11-03): a closure must never cut the street you are on
 * off from the rest of the world. Glitch locked only the roads into a street still being built
 * (locations/inc_jobs.js jobs_modify_connections 578-603), and by its end every one of those streets
 * stood (jobs_is_locked false in the dump), so it never met a player on the far side of one. The
 * remake replays the build-out, and a subway, a teleporter, a quest or a door can set you down past
 * a closed road. So when no open way leads from `here` to a home street (the starter street or a
 * subway street), the closed roads on the way with the fewest of them open for you (grandfathered).
 * `graph` holds the roads a closure holds (signposts, doors: a street graph or an adjacency map, js/street-graph.js
 * fewestClosures), `free` the ways none does (the subway, Collision-triggered Teleporters); both street ->
 * [streets], G tsids. Returns the streets opened, in the order walked.
 */
export function openWayHome(state, catalog, { graph = {}, free = {}, here = '', homes = [], opts = {} } = {}) {
  const from = gTsid(here);
  const goal = homes.map(gTsid);
  if (!from || !goal.length || goal.includes(from)) return [];
  // The street graph with this state's closures (R11, G969): the fewest closed roads on the way home.
  const roads = streetGraph(graph, { closed: closedStreets(state, catalog, opts) });
  const opened = fewestClosures(roads, { starts: [from], targets: goal, free })
    .map(({ street }) => street)
    .filter((t) => !state.grandfathered.includes(t));
  state.grandfathered.push(...opened);
  return opened;
}

/**
 * Where home is for openWayHome, and the ways no closure holds, for one player (report #162). The
 * subway carries only a player with papers (subway.js gateRefusal): without them a subway street
 * is no way home and the rails are no way at all. A player set down in the Vortex of Random by the
 * Map's puzzle card had a way opened to Alakol's station and no further, and the gate turned them
 * back. `free` holds every free way, `rails` the subway's among them (street -> [streets]).
 */
export function wayHomeTerms({ starter = '', free = {}, rails = {}, papers = false, subway = SUBWAY_STREETS } = {}) {
  if (papers) return { homes: [starter, ...subway].filter(Boolean), free };
  const walk = {};
  for (const [from, tos] of Object.entries(free)) {
    const onRails = new Set(rails[from] || []);
    const kept = tos.filter((to) => !onRails.has(to));
    if (kept.length) walk[from] = kept;
  }
  return { homes: [starter].filter(Boolean), free: walk };
}

const rowFor = (state, jobId) => (state.jobs[jobId] ||= cleanRow({}));

/* ------------------------------------------------------------------ */
/* Catalog helpers                                                      */
/* ------------------------------------------------------------------ */

export function soloNeed(num, divisor = SOLO_DIVISOR) {
  return Math.max(1, Math.ceil(whole(num) / (divisor > 0 ? divisor : SOLO_DIVISOR)));
}

/**
 * A job's amount divisor: its solo distance terms' (job.solo, report #425; solo only), else the
 * job's own (restorations run at 1), else SOLO_DIVISOR.
 */
export function jobDivisor(job) {
  const solo = Number(job?.solo?.divisor);
  if (solo > 0) return solo;
  const d = Number(job?.divisor);
  return d > 0 ? d : SOLO_DIVISOR;
}

/**
 * The top contributor's (performance) rewards in solo, register G890 (Austin 2026-11-16): a near-start
 * project's curve divisor (job.solo, js/street-jobs-solo.js) shrinks them by how far it sits under
 * today's SOLO_DIVISOR, 50/500 = 1/10 next to Hechey Track, so a small basket no longer pays a far
 * project's 100 iMG and drops. Far out (1/50), online (no job.solo) and every other project: 1, the
 * source's amounts (quests/quest.js 1621-1629 performance_rewards to the top contributors).
 */
export function performanceScale(job) {
  const d = Number(job?.solo?.divisor);
  return d > SOLO_DIVISOR ? SOLO_DIVISOR / d : 1;
}

/** A performance amount at that scale: rounded, never below 1 when the source pays any. */
export function scalePerformance(n, scale = 1) {
  const v = whole(n);
  if (!v || !(scale < 1)) return v;
  return Math.max(1, Math.round(v * scale));
}

/** A drop table's chance at that scale, in percent as the card shows it ("a 10% chance at ..."). */
export const dropChancePercent = (scale) => Math.max(1, Math.round(Math.min(1, Number(scale) || 0) * 100));

export function jobDef(catalog, jobId) {
  return catalog?.jobs?.[jobId] || null;
}

export function phaseClass(catalog, jobId, index) {
  const job = jobDef(catalog, jobId);
  const phase = job?.phases?.[index];
  return phase ? { phase, def: catalog.classes?.[phase.classTsid] || null } : null;
}

/**
 * Source text with its placeholders filled, as quests/quest.js expandText 232-264 does: {pc_label},
 * {job_phase} (an ordinal word), {job_phase_label}, {job_location} (the job's primary location),
 * {job_performance} (your place among the contributors; dropped with its space when first) and
 * {job_participation} (your share in percent).
 */
export function jobText(template, vars = {}) {
  return String(template || '')
    .replace(/\{pc_label\}/g, vars.pcLabel || 'friend')
    .replace(/\{job_location\}/g, vars.location || '')
    .replace(/\{job_participation\}/g, String(vars.participation ?? 0))
    .replace(/\{job_phase\}/g, vars.phase || '')
    .replace(/\{job_phase_label\}/g, vars.phaseLabel || '')
    .replace(/\{job_performance\} ?/g, vars.performance ? `${vars.performance} ` : '');
}

/**
 * A phase's name for the player: its label, else its class's title (the street jobs' classes title
 * themselves "{job_location}", the new street's name), placeholders filled and markup and entities
 * gone ("Build &amp; Replenish" reads "Build & Replenish").
 */
export function phaseName(job, phase, def) {
  return plainText(jobText(phase?.label || def?.title || '', { location: job?.label }));
}

/**
 * The completion card's "Your contributions" (players/inc_jobs.js jobs_familiar_job_complete_do
 * 485-499): per phase "N. <label>: You contributed {job_participation}% of the work!" or "You did not
 * contribute.". Ticket (Austin 2026-11-01): the label was printed unfilled ("1. {job_location}"); it
 * is the phase's name now, and a one-phase project drops the number and name (the card's title
 * already names the street). `share(phase)` is your percent of that phase, `mine(phase)` whether you
 * gave anything.
 */
export function contributionsText(job, catalog, { mine, share }) {
  const phases = job?.phases || [];
  const line = (p) => (mine(p) ? `You contributed ${share(p)}% of the work!` : 'You did not contribute.');
  if (phases.length === 1) return line(phases[0]);
  return phases
    .map((p, i) => `${i + 1}. ${phaseName(job, p, catalog?.classes?.[p.classTsid]) || `Phase ${i + 1}`}: ${line(p)}`)
    .join(' ');
}

/** A share of a phase as Glitch printed it (quest.js expandText 261: Math.round(x * 10000) / 100). */
export const sharePercent = (share) => Math.round((Number(share) || 0) * 10000) / 100;

/**
 * G1109 (Austin 2026-11-21): one player's share of all the work on a project, each phase weighted by
 * its size: what they put into every phase over every phase's total (each part capped at its phase's
 * total), 0..1. `parts` is [{ mine, total }] per phase. Glitch's completion line named the last phase's
 * share only (quest.js expandText 261); the server sends the same figure as project_reward overall.
 */
export function overallShare(parts) {
  let got = 0;
  let all = 0;
  for (const part of parts || []) {
    const total = Math.max(0, Number(part?.total) || 0);
    if (!total) continue;
    all += total;
    got += Math.min(total, Math.max(0, Number(part?.mine) || 0));
  }
  return all ? got / all : 0;
}

/**
 * Rewards.convertToString (glitch-client Rewards.as 54-96): "150 iMG, 20 mood, and 5 favor with all of
 * the giants." in the order of Reward.as REWARD_TYPES (xp, mood, energy, currants, favor, items,
 * drop tables); a drop table is named without a count. `parts` is [[amount, word]], amount null for a
 * drop table.
 */
export function rewardWords(parts) {
  const list = parts.filter(([n]) => n === null || Number(n));
  return list
    .map(([n, word], i) => {
      const head = `${n === null ? '' : `${Number(n).toLocaleString('en-US')} `}${word}`;
      if (i < list.length - 1) return `${head}${list.length > 2 ? ', ' : ' '}`;
      return `${list.length > 1 ? 'and ' : ''}${head}.`;
    })
    .join('');
}

/**
 * The job dialog's rewards (JobDialog.as showRewards 713-742): "All contributors will split: ..." and
 * "The top N% of players will also split: ..." (performance_percent) or "The top N players will also
 * get: ..." (performance_cutoff; "The top player" for one). A restoration shows none (713-717). The
 * split pool is the class rewards at the job's amounts (over its divisor, as every share is paid);
 * the performance rewards are whole, or at performanceScale near the start in solo (G890: each drop
 * table then reads as its chance). names: { giant(id), drop(tableId) }.
 */
export function jobRewardsText(job, def, names = {}) {
  if (!job || !def || job.kind === 'restore' || job.kind === 'hall') return null;
  const d = jobDivisor(job);
  const giant = (g) => (g === 'all' ? 'all of the giants' : names.giant ? names.giant(g) : g);
  const scaled = (n) => Math.round((Number(n) || 0) / d);
  const r = def.rewards || {};
  const all = rewardWords([
    [scaled(r.xp), 'iMG'],
    [scaled(r.mood), 'mood'],
    [scaled(r.energy), 'energy'],
    [scaled(r.currants), 'currants'],
    ...(r.favor || []).map((f) => [scaled(f.points), `favor with ${giant(f.giant)}`]),
  ]);
  const p = def.performance || {};
  const ps = performanceScale(job);
  const chance = ps < 1 ? `a ${dropChancePercent(ps)}% chance at ` : '';
  const perf = rewardWords([
    [scalePerformance(p.xp, ps), 'iMG'],
    [scalePerformance(p.mood, ps), 'mood'],
    [scalePerformance(p.energy, ps), 'energy'],
    ...(p.dropTables || []).map((id) => [null, `${chance}${names.drop ? names.drop(id) : id}`]),
  ]);
  const pct = Number(def.performancePercent) || 0;
  const cut = Number(def.performanceCutoff) || 0;
  let top = '';
  if (perf && pct > 0) top = `The top ${pct}% of players will also split: ${perf}`;
  else if (perf && cut > 0) top = `The top ${cut !== 1 ? `${cut} players` : 'player'} will also get: ${perf}`;
  return { all: all ? `All contributors will split: ${all}` : '', top };
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
export const phaseOrdinal = (index) => ORDINALS[index] || `${index + 1}th`;

/** Strip the source's HTML/split markup for plain UI text. */
export function plainText(html) {
  return htmlToText(html);
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
  const job = jobDef(catalog, jobId);
  const divisor = jobDivisor(job);
  // Report #425: solo, near the start, a work ask's skill drops levels (job.solo.skillDrop); `skillWas` keeps the source's.
  const drop = job?.solo?.skillDrop || 0;
  const reqs = pc.def.requirements.map((r) => {
    const need = soloNeed(r.num, divisor);
    const got = sameRow ? Math.min(need, whole(row.got[r.id])) : at < row.phase || row.doneAt ? need : 0;
    const eased = drop && r.skill ? { skill: soloSkill(r.skill, drop), skillWas: r.skill } : null;
    return { ...r, ...eased, need, got, done: got >= need };
  });
  for (const r of reqs) r.open = !r.done && r.group <= currentReqGroup(reqs, r.bucket);
  return reqs;
}

/** JobDialog.as updateProgress 655-661: "N.N% complete", whole at 0 and 100. */
export function percentCompleteText(perc) {
  const p = Math.max(0, Math.min(1, Number(perc) || 0));
  return `${p !== 0 && p !== 1 ? (p * 100).toFixed(1) : p * 100}% complete`;
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

/** Streets the subway comes up on: counted as built for everyone (js/open-roads.js owns the rule). */
export { SUBWAY_STREETS };

/**
 * A street project counts as built when finished, built from the start (job.builtFromStart: Austin's
 * chosen roads, tools/street-jobs-built-from-start.json, solo and online alike), grandfathered (a
 * street you have stood on: see noteArrival), exempt, or a subway station's street. `force` lists
 * jobs to run regardless (QA demo boards). `open` (the solo QA param ?openroads=1, openRoadsWanted)
 * counts every street as built for the session: nothing is written, so the save never learns of it.
 * `mine` false leaves out the streets you have stood on (jobStatus in the shared world, report #294).
 */
export function isJobBuilt(state, catalog, jobId, { exemptFrom = [], force = [], open = false, mine = true } = {}) {
  const job = jobDef(catalog, jobId);
  if (!job) return true;
  const row = state.jobs[jobId];
  if (row?.doneAt) return true;
  if (force.includes(jobId)) return false;
  if (open && job.kind === 'street') return true;
  // R11 (G1075): the one rule for everyone (js/open-roads.js, the server's openroads.go), then your own kept roads.
  if (builtForEveryone(job, row, { starters: exemptFrom })) return true;
  return Boolean(mine && job.kind === 'street' && keptOpen(state, job.street));
}

/**
 * QA (lane phonefix, 2026-11-13): ?openroads=1 opens every road still under construction for one solo
 * session, so a street behind a closed road (Froughtful Fen on a fresh save) can be tested. Never in
 * multiplayer or on /play/online/, and never saved (isJobBuilt's `open` writes nothing).
 */
export function openRoadsWanted(value, { multiplayer = false, path = '' } = {}) {
  if (multiplayer || /\/play\/online(\/|$)/.test(String(path || ''))) return false;
  return value === '1' || value === 'true' || value === 'on' || value === '';
}

/**
 * 'built' | 'done' | 'delayed' | 'cooldown' | 'active' | 'open'
 * plus the phase index and, for waits, when they end.
 * `opts.sharedWorld` (online): a street you have stood on keeps its road open for you (roadClosure,
 * closedStreets) but its project is still the world's to build. Report #294 (Dr Flavius): Yan Jaggery
 * was the featured project at 63% (the server's row, projects_featured.go) while his board called the
 * street already built, so he could not help with it.
 */
export function jobStatus(state, catalog, jobId, now = Date.now(), opts = {}) {
  const job = jobDef(catalog, jobId);
  const row = state.jobs[jobId];
  if (!job) return { status: 'built', phase: 0 };
  if (row?.doneAt) return { status: 'done', phase: job.phases.length - 1 };
  if (isJobBuilt(state, catalog, jobId, { ...opts, mine: !opts.sharedWorld })) return { status: 'built', phase: 0 };
  const phase = row?.phase || 0;
  if (row?.readyAt && row.readyAt > now) return { status: 'delayed', phase, until: row.readyAt };
  const started = Boolean(row?.startedAt);
  // locations/inc_jobs.js jobs_get_available 457-461: a street or upgrade project not yet done (type 1 or 2,
  // started or not) is not offered for 30 minutes after the street's last such project finished.
  if (job.kind === 'street' || job.kind === 'upgrade') {
    const offering = opts.street || (job.kind === 'upgrade' ? job.street : job.connecting?.[0]);
    const last = state.streetDone[offering] || 0;
    if (last && now - last < STREET_JOB_COOLDOWN_MS) {
      return { status: 'cooldown', phase, until: last + STREET_JOB_COOLDOWN_MS };
    }
  }
  return { status: started ? 'active' : 'open', phase };
}

/*
 * #615 (G1140): items/include/jobs.js getAvailableJobs 2-62 sorts a giver's jobs per job: done, then
 * delayed (between phases), then given (the player has put something in: pc.jobs_has), else open,
 * whoever else has started it. offerJobs 121-155 offers the first given job, else the first open one;
 * onPlayerEnter (street_spirit.js 577-611) shows given, open, then delayed. A job resting between
 * phases never hides another, and others having started a job does not put it first.
 */
const STATUS_RANK = { given: 0, active: 1, open: 1, delayed: 2, cooldown: 3, done: 4, built: 5 };
const putIn = (row) => Object.values(row?.mine || {}).some((n) => Number(n) > 0);
const offerRank = (state, r) => STATUS_RANK[(r.status === 'active' || r.status === 'open') && putIn(state.jobs?.[r.jobId]) ? 'given' : r.status];

/** Every project a street's board offers, best first (items/include/jobs.js offerJobs: yours, then open, catalog order). */
export function streetJobs(state, catalog, tsid, now = Date.now(), opts = {}) {
  const ids = catalog?.byStreet?.[gTsid(tsid)] || [];
  return ids
    .map((jobId, order) => ({ jobId, order, ...jobStatus(state, catalog, jobId, now, { ...opts, street: gTsid(tsid) }) }))
    .sort((a, b) => offerRank(state, a) - offerRank(state, b) || a.order - b.order);
}

/** Does this street need a board (any project not finished)? */
export function streetHasOpenProject(state, catalog, tsid, now = Date.now(), opts = {}) {
  return streetJobs(state, catalog, tsid, now, opts).some((row) => row.status !== 'done' && row.status !== 'built');
}

/* ------------------------------------------------------------------ */
/* Contributing                                                         */
/* ------------------------------------------------------------------ */

/**
 * `opts` are the board's own jobStatus options (exemptFrom, force, open, sharedWorld), so the gate
 * agrees with what the board shows. Reports #302 and #304 (2026-11-13): online, Yan Jaggery's board
 * showed the featured project open (the #294 fix passed sharedWorld to the board) while every work row
 * said "But! This street is already built.": this gate still read the street as built for anyone who
 * had stood on it.
 */
function canContribute(state, catalog, jobId, now, opts = {}) {
  const status = jobStatus(state, catalog, jobId, now, opts);
  if (status.status === 'active' || status.status === 'open') return { ok: true, status };
  const msg = {
    done: 'This project is finished.',
    built: 'This street is already built.',
    delayed: 'The next phase is not ready yet.',
    cooldown: 'This street just finished a project. The next one opens soon.',
  }[status.status];
  return { ok: false, status, msg: msg || 'This project is not open.' };
}

/**
 * Does a contribution to this project count toward the project badges? quest.js 1434: a type 5 job
 * (a home restoration, the house's Build a New Floor, the Tower) adds no job_contributions, and
 * 1671: it has no winners and no job_phase_winner count.
 */
export const countsForBadges = (job) => Boolean(job) && job.kind !== 'restore';

function record(state, catalog, jobId, classTsid, baseCost, now, { hired = false } = {}) {
  const row = rowFor(state, jobId);
  if (!row.startedAt) row.startedAt = now;
  row.mine[classTsid] = (row.mine[classTsid] || 0) + baseCost;
  if (hired) row.hired[classTsid] = (row.hired[classTsid] || 0) + baseCost;
  if (!countsForBadges(jobDef(catalog, jobId))) return { newPhase: false, distinctPhases: state.phasesContributed.length };
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
 * The open requirement a contribution goes to: the row `rid` when one is named, else the first open
 * one of its kind. Report #290 (Dr Flavius): the Jethimadh Tower's last phase asks for Urth Blocks in
 * both its buckets (r662, r669), and both rows are open at once; what he put in on the second row
 * went to the first. Glitch's client sent the row it was on (JobDetailsUI.as 231-235, 389-394
 * current_req.id), but GSJS took no notice of it: quest.js inc_item 1463-1478 and inc_currants
 * 1443-1461 fill the first open row of its kind. The remake credits the row you chose.
 */
function contributionReq(state, catalog, jobId, match, rid = '') {
  return phaseRequirements(state, catalog, jobId).find((r) => match(r) && r.open && (!rid || r.id === rid));
}

/**
 * quest.js inc_item: put up to `count` of one item into the open requirement `rid` (the row the
 * player chose), or the first open requirement for it. Mutates `inv` (plain class -> count map).
 */
export function contributeItems(state, catalog, jobId, classId, count, inv, now = Date.now(), rid = '', opts = {}) {
  const gate = canContribute(state, catalog, jobId, now, opts);
  if (!gate.ok) return { ok: false, msg: gate.msg };
  const req = contributionReq(state, catalog, jobId, (r) => r.type === 'item' && r.classId === classId, rid);
  if (!req) return { ok: false, msg: 'Nothing here needs that right now.' };
  const have = whole(inv?.[classId]);
  const amount = Math.min(whole(count), have, req.need - req.got);
  // JobDetailsUI.as 191-199: "But! You don't have any."
  if (amount <= 0) return { ok: false, msg: "You don't have any." };
  inv[classId] = have - amount;
  const row = rowFor(state, jobId);
  row.got[req.id] = req.got + amount;
  const classTsid = jobDef(catalog, jobId).phases[row.phase].classTsid;
  const rec = record(state, catalog, jobId, classTsid, amount * req.baseCost, now);
  return { ok: true, amount, baseCost: amount * req.baseCost, req, ...rec, phaseReady: phaseIsComplete(state, catalog, jobId) };
}

/** quest.js inc_currants, into the row `rid` when named (see contributionReq). Mutates pc.currants. */
export function contributeCurrants(state, catalog, jobId, amount, pc, now = Date.now(), rid = '', opts = {}) {
  const gate = canContribute(state, catalog, jobId, now, opts);
  if (!gate.ok) return { ok: false, msg: gate.msg };
  const req = contributionReq(state, catalog, jobId, (r) => r.type === 'currants', rid);
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
 * What a work requirement asks of you, held or not: the tools it takes, the ones in your pack, the
 * first of those that still works (ctx.toolOk), and whether its skill is missing. workCheck's own
 * rule, also read by the Projects panel (ticket 81) for a step that is not open yet.
 * ctx: { inv, learned: string[], toolOk(classTsid, wear) -> bool }
 */
export function workGear(req, ctx = {}) {
  const tools = req.classIds?.length ? req.classIds : [req.classId];
  const held = tools.filter((tool) => whole(ctx.inv?.[tool]) > 0);
  const tool = held.find((t) => (ctx.toolOk ? ctx.toolOk(t, req.wear) : true)) || null;
  const missingSkill = req.skill && !(ctx.learned || []).includes(req.skill);
  return { tools, held, tool, missingSkill };
}

/**
 * G1191: tools a player can take for one another, the plain tool and its upgrade (items/*.js). A
 * work step takes only the classes it lists (quest.js get_status 950-974, as G1089 found), so a
 * Fancy Pick will not do where a step lists only the Pick, and the other way round.
 */
export const TOOL_KIN = Object.freeze({
  pick: 'fancy_pick', fancy_pick: 'pick',
  hoe: 'high_class_hoe', high_class_hoe: 'hoe',
  watering_can: 'irrigator_9000', irrigator_9000: 'watering_can',
  shovel: 'ace_of_spades', ace_of_spades: 'shovel',
  hatchet: 'class_axe', class_axe: 'hatchet',
  scraper: 'super_scraper', super_scraper: 'scraper',
  ore_grinder: 'grand_ol_grinder', grand_ol_grinder: 'ore_grinder',
});

const article = (name) => (/^[aeiou]/i.test(name) ? 'an' : 'a');

/**
 * The refusal when no listed tool works. quest.js get_status 973 names the step's class_id: "You
 * don't have a working Pick." (kept as it was for one tool). G1191, a help line beside it: a step
 * that lists two tools names both, and when you hold a kin tool the step does not take, it says
 * that tool won't do and what the step takes ("Your Fancy Pick won't do: this step takes a Pick.").
 */
export function noWorkingToolMsg(tools, inv = {}, itemName = (cls) => String(cls).replace(/_/g, ' ')) {
  const names = tools.map((t) => itemName(t));
  const line = `You don't have a working ${names.join(' or ')}.`;
  const kin = tools.map((t) => TOOL_KIN[t]).find((k) => k && !tools.includes(k) && whole(inv?.[k]) > 0);
  if (!kin) return line;
  return `${line} Your ${itemName(kin)} won't do: this step takes ${names.map((n) => `${article(n)} ${n}`).join(' or ')}.`;
}

/**
 * The first open work requirement of the current phase that takes `tool` (quest.js find_work
 * 1501-1514: work runs with a tool, and each unit goes to the first requirement still open for it).
 * Returns its id, or ''.
 */
export function findWork(state, catalog, jobId, tool, except = '') {
  const req = phaseRequirements(state, catalog, jobId).find(
    (r) => r.type === 'work' && r.open && r.id !== except && (r.classIds?.length ? r.classIds.includes(tool) : r.classId === tool),
  );
  return req ? req.id : '';
}

/**
 * Can the player do one unit of this work requirement themselves?
 * ctx: { inv, learned: string[], energy, toolOk(classTsid, wear) -> bool, itemName(cls), skillName(id), tick }
 * The board's words are quest.js get_status 966-976 ("You don't have a working <tool>.", "You don't know
 * <skill>."); a unit while working (ctx.tick) checks energy first and words a lost tool as
 * items/include/jobs.js acceptJobWork 382-393 does.
 */
export function workCheck(state, catalog, jobId, rid, ctx = {}, now = Date.now()) {
  const gate = canContribute(state, catalog, jobId, now, ctx.jobOpts);
  if (!gate.ok) return { ok: false, msg: gate.msg };
  const req = phaseRequirements(state, catalog, jobId).find((r) => r.id === rid && r.type === 'work');
  if (!req) return { ok: false, msg: 'There is no such work.' };
  if (!req.open) return { ok: false, req, msg: req.done ? "There's no more work left to do." : 'Finish the earlier steps first.' };
  const { tools, tool, missingSkill } = workGear(req, ctx);
  const canHire = !tool || missingSkill;
  const energy = ctx.energy ?? ctx.pc?.energy;
  const tired = whole(energy) <= req.energy;
  const itemName = (cls) => (ctx.itemName ? ctx.itemName(cls) : String(cls).replace(/_/g, ' '));
  const skillName = (id) => (ctx.skillName ? ctx.skillName(id) : String(id).replace(/_/g, ' '));
  if (ctx.tick && tired) return { ok: false, req, tool, canHire: false, msg: "You don't have enough energy to continue." };
  if (!tool) return { ok: false, req, canHire, msg: ctx.tick ? "You don't have the necessary working tool." : noWorkingToolMsg(tools, ctx.inv, itemName) };
  if (missingSkill) return { ok: false, req, canHire, tool, msg: `You don't know ${skillName(req.skill)}.` };
  if (tired) return { ok: false, req, tool, canHire: false, msg: "You don't have enough energy to continue." };
  return { ok: true, req, tool, canHire: false };
}

/**
 * One 1.5 s work unit (items/include/jobs.js acceptJobWork). Charges energy
 * on pc and calls ctx.useTool(classTsid, wear) for wear.
 */
export function applyWorkUnit(state, catalog, jobId, rid, ctx = {}, now = Date.now()) {
  const check = workCheck(state, catalog, jobId, rid, { ...ctx, energy: ctx.pc?.energy, tick: true }, now);
  if (!check.ok) return check;
  const { req, tool } = check;
  // G289: metabolics_lose_energy, nothing lost while dead (inc_metabolics.js 108-122).
  loseEnergy(ctx.pc, req.energy);
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
  // G890: solo near the start the top contributor's rewards shrink with the curve (performanceScale).
  // Each drop table's rows are single items or a currant/favor lump, so a smaller count does not
  // exist: the table rolls at that chance instead (1/10 next to the start), which keeps its worth in
  // step with the iMG. At scale 1 no extra roll is drawn, so far out and online are as before.
  const ps = performanceScale(job);
  const performance = { xp: scalePerformance(perf.xp, ps), mood: scalePerformance(perf.mood, ps), energy: scalePerformance(perf.energy, ps), items: [], currants: 0, favor: [] };
  for (const tableId of perf.dropTables || []) {
    if (ps < 1 && rng() >= ps) continue;
    const drop = rollDropTable(catalog.drops?.[tableId], rng);
    if (!drop) continue;
    if (drop.class_id) performance.items.push({ classTsid: drop.class_id, count: drop.count || 1 });
    else if (drop.currants) performance.currants += drop.currants;
    else if (drop.favor) performance.favor.push(drop.favor);
  }
  // quest.js 1671: a type 5 job (restore) has no winners and no job_phase_winner count.
  if (countsForBadges(job)) state.phaseWins += 1;
  const finalPhase = index >= job.phases.length - 1;
  // quest.js expandText 261 {job_participation}: two decimals.
  const participation = sharePercent(share);
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
    // G1109: the completion line's share is of the whole project, not this last phase.
    out.overall = sharePercent(overallShare(job.phases.map((p) => ({ mine: row.mine[p.classTsid] || 0, total: phaseBaseCost(catalog.classes?.[p.classTsid], divisor) }))));
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

/**
 * What a closed road says (ticket 37 follow-up, mr granberry 2026-11-02). It used to end "or use
 * the Map", but nothing reaches a street still being built: Glitch hid its signpost arms and locked
 * its doors (locations/inc_jobs.js jobs_modify_connections 578-603), refused a teleport there ("Your
 * teleportation target is unavailable.", players/inc_teleportation.js 219-223) and made it no
 * destination on the Map (locations/location.js 2915-2935 not_a_destination; the client's menu greys
 * Set as Destination and Teleport Here, InteractionMenuController.as 151-153 and 206-208). So it
 * names the project board to build it at: the one here when you stand on a street that offers it,
 * else the first offering street whose own road is open.
 * @param {{ jobId: string, job: object }} closed roadClosure's answer
 * Gap 3 (research/street-projects-audit-2026-11-11.md): `giver(tsid)` names who gives it on that
 * street ("the Street Spirit"); empty means the project board.
 * @param {{ here?: string, via?: 'signpost'|'door'|'teleport'|'map'|'route', label?: (tsid: string) => string, giver?: (tsid: string) => string, opts?: object }} [o]
 */
export function closedRoadText(state, catalog, closed, { here = '', via = 'signpost', label = (t) => t, giver = () => '', opts = {}, now = Date.now() } = {}) {
  if (!closed?.job) return '';
  const name = closed.job.label || label(closed.job.street);
  const connecting = (closed.job.connecting || []).map(gTsid);
  const at = gTsid(here);
  const shut = new Set(closedStreets(state, catalog, opts));
  const board = connecting.includes(at) ? at : connecting.find((t) => !shut.has(t)) || connecting[0] || '';
  const who = board ? giver(board) || 'the project board' : '';
  const where = !board ? 'at its project board' : board === at ? `at ${who} here on ${label(board)}` : `at ${who} on ${label(board)}`;
  // #339 (G761): resting (30 minutes after the street's last project, inc_jobs.js jobs_get_available
  // 457-461; or between phases) nobody can help yet, so the sign says when it starts, not to help now.
  const rest = closed.jobId && board ? jobStatus(state, catalog, closed.jobId, now, { ...opts, street: board }) : null;
  if (rest && (rest.status === 'cooldown' || rest.status === 'delayed') && rest.until > now) {
    const mins = Math.max(1, Math.ceil((rest.until - now) / 60_000));
    const wait = `${mins} minute${mins === 1 ? '' : 's'}`;
    const why = rest.status === 'cooldown'
      ? `${label(board)} just finished a project, so this one opens for help in about ${wait}.`
      : `Its project is resting between steps and opens for help again in about ${wait}.`;
    if (via === 'teleport') return `${name} is still under construction, so you can't teleport there yet. ${why}`;
    if (via === 'map') return `Still under construction. ${why}`;
    if (via === 'route') return why;
    return `The road to ${name} is still under construction. ${why} The road opens when the project is done.`;
  }
  if (via === 'teleport') return `${name} is still under construction, so you can't teleport there yet. Help build it ${where}.`;
  if (via === 'map') return `Still under construction. Help build it ${where}.`;
  // #566: after "the way runs through <street>, which is still under construction." (the Map's, the
  // Projects tab's and the buddy list's routes): what to do about it, without saying it twice.
  if (via === 'route') return `Help build it ${where}.`;
  return `The road to ${name} is still under construction. Help build it ${where}, and the road opens when the project is done.`;
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
