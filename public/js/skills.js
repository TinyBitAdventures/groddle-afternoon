/**
 * Persistent Glitch skill study queue backed by the mined GSJS catalog.
 *
 * Official production rules ported from GameServerJS/players/inc_skills.js:
 * - point_cost is study work (10 points per second), not spendable iMG
 * - one skill studies at a time; choosing another pauses the current skill
 * - paused progress and active completion timestamps persist across sessions
 * - time quoins, shrine favor and emblems accelerate the active study, up to
 *   half its remaining time
 * - G205, when acceleration is lost or kept (inc_skills.js 732-1067):
 *   the speed-up itself is spent at once (the end moves earlier), so pausing,
 *   switching or unlearning keeps every second of it in the paused points.
 *   A pause also keeps the row's is_accelerated flag (776-778, 614-617 never
 *   clear it), and resuming a flagged row marks it accelerated to its end
 *   (824-830), which leaves no room for more speed-ups until it finishes. A
 *   fresh start is never accelerated (832-835). The one skills_stop_acceleration
 *   timer is not cancelled by a switch (only 1007, 1958), so it still fires at
 *   the old acceleration end and clears the flag of whatever is studying then
 *   (1003-1023); `accelerationStopAt` keeps that pending timer.
 */

import { getSkillCatalog } from './content-catalogs.js?v=10b118dd';

export const SKILL_POINTS_PER_SECOND = 10;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanKey(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_:-]/g, '');
}

function cleanLearned(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(cleanKey).filter(Boolean))];
}

/**
 * Seconds per study second (skills_points_to_seconds): brain capacity and the
 * learntime_* category upgrades scale how long points take. 1 = unmodified.
 */
function cleanTimeFactor(value) {
  const n = finite(value, 1);
  return n > 0 && n < 1000 ? n : 1;
}

/**
 * The pending skills_stop_acceleration timer (inc_skills.js 983, 1056): when
 * it is due, it clears the flag of the study that is active at that moment.
 * Every change below fires it first, so the active row now is the one that
 * was active when it came due.
 */
function fireAccelerationStop(state, now) {
  const stopAt = finite(state?.accelerationStopAt, 0);
  if (!stopAt || stopAt > now) return;
  for (const row of Object.values(state.queue || {})) {
    if (row && !row.isPaused) row.acceleratedUntil = Math.min(finite(row.acceleratedUntil, 0), stopAt);
  }
  state.accelerationStopAt = 0;
}

/** The active row's acceleration end with a due stop timer applied (read only). */
function effectiveAcceleratedUntil(state, row, now) {
  if (!row || row.isPaused) return 0;
  const until = Math.max(0, finite(row.acceleratedUntil, 0));
  const stopAt = finite(state?.accelerationStopAt, 0);
  return stopAt && stopAt <= now ? Math.min(until, stopAt) : until;
}

function resolveTimeFactor(ctx, def) {
  const raw = typeof ctx?.timeFactor === 'function' ? ctx.timeFactor(def) : ctx?.timeFactor;
  return cleanTimeFactor(raw);
}

export function normalizeSkillState(seed = {}) {
  const learned = cleanLearned(seed?.learned);
  const known = new Set(learned);
  const queue = {};
  let hasActive = false;
  for (const [rawId, rawRow] of Object.entries(seed?.queue || {})) {
    const classTsid = cleanKey(rawId);
    if (!classTsid || known.has(classTsid) || !rawRow || typeof rawRow !== 'object') continue;
    const totalPoints = Math.max(1, Math.floor(finite(rawRow.totalPoints, rawRow.pointsRemaining || 1)));
    const pointsRemaining = Math.min(
      totalPoints,
      Math.max(1, Math.ceil(finite(rawRow.pointsRemaining, totalPoints)))
    );
    let isPaused = rawRow.isPaused === true;
    // Repair hostile/corrupt snapshots with more than one active study.
    if (!isPaused && hasActive) isPaused = true;
    if (!isPaused) hasActive = true;
    const timeFactor = cleanTimeFactor(rawRow.timeFactor);
    const endsAt = isPaused ? 0 : Math.max(0, Math.floor(finite(rawRow.endsAt, 0)));
    // The source's queue start (reset on every resume). Saves from before it
    // was stored derive it from the stored points and time factor.
    const resumedAt = isPaused
      ? 0
      : Math.max(0, Math.floor(finite(rawRow.resumedAt, 0))) ||
        Math.max(0, endsAt - Math.max(1, Math.round((pointsRemaining / SKILL_POINTS_PER_SECOND) * timeFactor)) * 1000);
    queue[classTsid] = {
      classTsid,
      totalPoints,
      pointsRemaining,
      startedAt: Math.max(0, Math.floor(finite(rawRow.startedAt, 0))),
      endsAt,
      resumedAt,
      pausedAt: isPaused ? Math.max(0, Math.floor(finite(rawRow.pausedAt, 0))) : 0,
      isPaused,
      acceleratedUntil: isPaused ? 0 : Math.max(0, Math.floor(finite(rawRow.acceleratedUntil, 0))),
      // GSJS keeps is_accelerated on a paused queue row (see the header).
      pausedAccelerated: isPaused && rawRow.pausedAccelerated === true,
      timeFactor,
    };
  }
  const accelerationStopAt = Math.max(0, Math.floor(finite(seed?.accelerationStopAt, 0)));
  return { learned, queue, accelerationStopAt };
}

export function createSkillState(seed = {}) {
  return normalizeSkillState(seed);
}

export function listSkills() {
  return Object.values(getSkillCatalog()).sort((a, b) =>
    String(a.name).localeCompare(String(b.name)) || (a.level || 0) - (b.level || 0)
  );
}

export function hasSkill(state, classTsid) {
  return state.learned.includes(classTsid);
}

export function studySecondsForSkill(classTsidOrDef) {
  const def = typeof classTsidOrDef === 'string'
    ? getSkillCatalog()[classTsidOrDef]
    : classTsidOrDef;
  return def ? Math.max(1, Math.round((def.pointCost || 0) / SKILL_POINTS_PER_SECOND)) : 0;
}

export function formatStudyTime(seconds) {
  const value = Math.max(0, Math.ceil(finite(seconds, 0)));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/** Check official catalog prerequisites for learning or resuming a skill. */
export function canLearnSkill(state, classTsid, ctx = {}) {
  const def = getSkillCatalog()[classTsid];
  if (!def) return { ok: false, reason: 'unknown' };
  if (state.learned.includes(classTsid)) return { ok: false, reason: 'already_learned' };
  const queued = state.queue?.[classTsid];
  if (queued && !queued.isPaused) return { ok: false, reason: 'studying', def };
  const level = ctx.level ?? 1;
  if ((def.requiresLevel || 0) > level) {
    return { ok: false, reason: 'level', need: def.requiresLevel };
  }
  for (const skillId of def.reqSkills || []) {
    if (!state.learned.includes(skillId)) return { ok: false, reason: 'req_skill', need: skillId };
  }
  const doneQuests = new Set(ctx.completedQuests || []);
  for (const questId of def.reqQuests || []) {
    if (!doneQuests.has(questId)) return { ok: false, reason: 'req_quest', need: questId };
  }
  const doneAchievements = new Set(ctx.unlockedAchievements || []);
  for (const achievementId of def.reqAchievements || []) {
    if (!doneAchievements.has(achievementId)) {
      return { ok: false, reason: 'req_achievement', need: achievementId };
    }
  }
  const upgrades = new Set(ctx.upgrades || []);
  for (const upgradeId of def.reqUpgrades || []) {
    if (!upgrades.has(upgradeId)) return { ok: false, reason: 'req_upgrade', need: upgradeId };
  }
  return { ok: true, reason: queued ? 'paused' : 'ok', def, queued };
}

export function getStudyStatus(state, classTsid, now = Date.now()) {
  const row = state.queue?.[classTsid];
  if (!row) return null;
  const factor = cleanTimeFactor(row.timeFactor);
  const totalSeconds = Math.max(1, Math.round((row.totalPoints / SKILL_POINTS_PER_SECOND) * factor));
  const remainingSeconds = row.isPaused
    ? Math.max(1, Math.ceil((row.pointsRemaining / SKILL_POINTS_PER_SECOND) * factor))
    : Math.max(0, Math.ceil((row.endsAt - now) / 1000));
  const acceleratedUntil = effectiveAcceleratedUntil(state, row, now);
  return {
    ...row,
    acceleratedUntil,
    totalSeconds,
    remainingSeconds,
    elapsedSeconds: Math.max(0, totalSeconds - remainingSeconds),
    progress: Math.max(0, Math.min(1, (totalSeconds - remainingSeconds) / totalSeconds)),
    isAccelerated: !row.isPaused && acceleratedUntil > now,
  };
}

export function listStudyQueue(state, now = Date.now()) {
  return Object.keys(state.queue || {})
    .map((classTsid) => getStudyStatus(state, classTsid, now))
    .filter(Boolean)
    .sort((a, b) => Number(a.isPaused) - Number(b.isPaused) || a.startedAt - b.startedAt);
}

export function getActiveStudy(state, now = Date.now()) {
  return listStudyQueue(state, now).find((row) => !row.isPaused) || null;
}

/**
 * Pause one study (skills_train 774-778, skills_unlearn 611-617): its points
 * keep the time left, speed-ups included, and the row keeps is_accelerated.
 */
export function pauseSkillStudy(state, classTsid, now = Date.now()) {
  const row = state.queue?.[classTsid];
  if (!row) return { ok: false, reason: 'not_queued' };
  if (row.isPaused) return { ok: false, reason: 'already_paused' };
  const remainingSeconds = Math.max(0, (row.endsAt - now) / 1000);
  if (remainingSeconds <= 0) return tickSkillStudy(state, now);
  fireAccelerationStop(state, now);
  // skills_get_queue 1360-1364 has already cleared a lapsed flag by now.
  const wasAccelerated = finite(row.acceleratedUntil, 0) > now;
  row.pointsRemaining = Math.max(
    1,
    Math.ceil((remainingSeconds * SKILL_POINTS_PER_SECOND) / cleanTimeFactor(row.timeFactor))
  );
  row.endsAt = 0;
  row.resumedAt = 0;
  row.pausedAt = now;
  row.isPaused = true;
  row.acceleratedUntil = 0;
  row.pausedAccelerated = wasAccelerated;
  return {
    ok: true,
    reason: 'paused',
    classTsid,
    wasAccelerated,
    remainingSeconds: row.pointsRemaining / SKILL_POINTS_PER_SECOND,
  };
}

/** Start a new study or resume paused progress; active study is paused first. */
export function startSkillStudy(state, classTsid, ctx = {}, now = Date.now()) {
  const due = tickSkillStudy(state, now);
  fireAccelerationStop(state, now);
  const check = canLearnSkill(state, classTsid, ctx);
  if (!check.ok) return { ...check, completed: due.completed };
  const pausedIds = [];
  for (const row of listStudyQueue(state, now)) {
    if (!row.isPaused && row.classTsid !== classTsid) {
      const paused = pauseSkillStudy(state, row.classTsid, now);
      if (paused.ok) pausedIds.push(row.classTsid);
    }
  }
  const existing = state.queue?.[classTsid];
  const totalPoints = Math.max(1, Math.floor(check.def.pointCost || SKILL_POINTS_PER_SECOND));
  const pointsRemaining = existing?.pointsRemaining || totalPoints;
  const timeFactor = resolveTimeFactor(ctx, check.def);
  const durationSeconds = Math.max(1, Math.round((pointsRemaining / SKILL_POINTS_PER_SECOND) * timeFactor));
  const endsAt = now + durationSeconds * 1000;
  // skills_train 824-830: a resumed row that was accelerated when paused is
  // accelerated to its end; a new start (832-835) is not accelerated.
  const keepsAcceleration = Boolean(existing?.isPaused && existing.pausedAccelerated);
  state.queue[classTsid] = {
    classTsid,
    totalPoints: existing?.totalPoints || totalPoints,
    pointsRemaining,
    startedAt: existing?.startedAt || now,
    endsAt,
    resumedAt: now,
    pausedAt: 0,
    isPaused: false,
    acceleratedUntil: keepsAcceleration ? endsAt : 0,
    pausedAccelerated: false,
    timeFactor,
  };
  return {
    ok: true,
    reason: existing ? 'resumed' : 'started',
    accelerated: keepsAcceleration,
    def: check.def,
    durationSeconds,
    timeFactor,
    totalSeconds: Math.max(1, Math.round(studySecondsForSkill(check.def) * timeFactor)),
    pausedIds,
    completed: due.completed,
  };
}

/**
 * skills_increase_brain_capacity (players/inc_skills.js:1893-1931): when the
 * learning-time modifier changes, `percent` = new / old modifier, and every
 * unpaused study moves its end earlier by round((end - start) * (1 - percent))
 * seconds, never sooner than one second from now. `start` is the source's
 * queue start, which resets on every resume (`resumedAt` here). Paused
 * studies keep their points; the source recomputes their time from points with
 * the current modifier (skills_points_to_seconds), so their stored factor
 * takes the new modifier too, as does the active one for a later pause.
 */
export function rescaleStudiesForLearningModifier(state, percent, now = Date.now()) {
  const ratio = finite(percent, 1);
  if (!(ratio > 0) || ratio === 1) return { ok: false, reason: 'unchanged', percent: ratio, rescaled: [] };
  const rescaled = [];
  for (const [classTsid, row] of Object.entries(state?.queue || {})) {
    if (!row || typeof row !== 'object') continue;
    row.timeFactor = cleanTimeFactor(cleanTimeFactor(row.timeFactor) * ratio);
    if (row.isPaused) continue;
    const start = Math.max(0, finite(row.resumedAt, 0)) || finite(row.startedAt, now);
    const spanSeconds = Math.max(0, (finite(row.endsAt, now) - start) / 1000);
    const timeChange = Math.round(spanSeconds * (1 - ratio));
    const before = row.endsAt;
    row.endsAt = Math.max(row.endsAt - timeChange * 1000, now + 1000);
    rescaled.push({ classTsid, before, endsAt: row.endsAt, timeChange });
  }
  return { ok: true, reason: 'rescaled', percent: ratio, rescaled };
}

/** Compatibility name retained for callers from the instant-learning prototype. */
export function learnSkill(state, classTsid, _pc = null, ctx = {}) {
  return startSkillStudy(state, classTsid, ctx, ctx.now ?? Date.now());
}

/** Complete any due active study. Absolute timestamps make offline study work. */
export function tickSkillStudy(state, now = Date.now()) {
  fireAccelerationStop(state, now);
  const completed = [];
  for (const [classTsid, row] of Object.entries(state.queue || {})) {
    if (row.isPaused || row.endsAt > now) continue;
    if (!state.learned.includes(classTsid)) state.learned.push(classTsid);
    delete state.queue[classTsid];
    completed.push({ classTsid, def: getSkillCatalog()[classTsid] || null });
  }
  return { ok: true, reason: completed.length ? 'completed' : 'ticked', completed };
}

/**
 * skills_get_max_acceleration (players/inc_skills.js:924-941): half the
 * still-unaccelerated study time, rounded; 0 when nothing is studying or the
 * acceleration already reaches the end (skills_at_max_acceleration). While
 * accelerated, the official server measures the gap between the study end and
 * the acceleration end, so repeated time quoins, favor or emblems never cut a
 * study by more than half at once.
 */
export function maxStudyAcceleration(state, now = Date.now()) {
  const active = getActiveStudy(state, now);
  if (!active) return 0;
  if (active.isAccelerated && active.acceleratedUntil >= active.endsAt) return 0;
  const unacceleratedSeconds = active.isAccelerated
    ? Math.max(0, (active.endsAt - active.acceleratedUntil) / 1000)
    : active.remainingSeconds;
  return Math.max(0, Math.round(unacceleratedSeconds / 2));
}

/**
 * Apply official double-speed acceleration for at most half the time remaining
 * (skills_start_acceleration, inc_skills.js:957-999). Time quoins, Giant favor
 * spent at a shrine and spent emblems all come through here.
 */
export function accelerateActiveStudy(state, seconds, now = Date.now(), opts = {}) {
  tickSkillStudy(state, now);
  const active = getActiveStudy(state, now);
  if (!active) return { ok: false, reason: 'not_studying', requested: Math.max(0, Math.floor(finite(seconds, 0))) };
  const requested = Math.max(0, Math.floor(finite(seconds, 0)));
  // skills_start_acceleration(duration, ignore_max): capped by the time left, not half of it.
  const maximum = opts.ignoreMax
    ? Math.max(0, Math.floor(active.remainingSeconds))
    : maxStudyAcceleration(state, now);
  const applied = Math.min(requested, maximum);
  const row = state.queue[active.classTsid];
  if (!applied) {
    // quoin.js 202 calls skills_start_acceleration even at the maximum; its
    // zero reschedule (1052-1056) re-arms the stop timer at the row's end.
    if (active.isAccelerated) state.accelerationStopAt = row.acceleratedUntil;
    return { ok: false, reason: 'max_acceleration', requested, maximum, classTsid: active.classTsid };
  }
  row.endsAt = Math.max(now + 100, row.endsAt - applied * 1000);
  row.acceleratedUntil = Math.max(row.acceleratedUntil || 0, now) + applied * 1000;
  state.accelerationStopAt = row.acceleratedUntil;
  const tick = tickSkillStudy(state, now);
  return {
    ok: true,
    reason: 'accelerated',
    classTsid: active.classTsid,
    requested,
    maximum,
    applied,
    completed: tick.completed,
  };
}

/** Grant a skill without study (starter/admin content). */
export function grantSkill(state, classTsid, skipPrereq = false) {
  const def = getSkillCatalog()[classTsid];
  if (!def) return { ok: false, reason: 'unknown' };
  if (state.learned.includes(classTsid)) return { ok: false, reason: 'already_learned' };
  if (!skipPrereq) {
    for (const skillId of def.reqSkills || []) {
      if (!state.learned.includes(skillId)) return { ok: false, reason: 'req_skill', need: skillId };
    }
  }
  delete state.queue?.[classTsid];
  state.learned.push(classTsid);
  return { ok: true, reason: 'granted', def };
}

/**
 * Grant a skill and, first, every prerequisite skill it chains through, so a
 * starter grant never shows Alchemy II learned while Alchemy I is not.
 * @returns {string[]} skills newly granted, prerequisites first
 */
export function grantSkillWithPrereqs(state, classTsid, seen = new Set()) {
  if (seen.has(classTsid)) return [];
  seen.add(classTsid);
  const def = getSkillCatalog()[classTsid];
  if (!def) return [];
  const granted = [];
  for (const skillId of def.reqSkills || []) {
    granted.push(...grantSkillWithPrereqs(state, skillId, seen));
  }
  if (grantSkill(state, classTsid, true).ok) granted.push(classTsid);
  return granted;
}

export function listLearnedSkills(state) {
  const catalog = getSkillCatalog();
  return state.learned.map((id) => catalog[id]).filter(Boolean);
}
