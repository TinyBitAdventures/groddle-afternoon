/**
 * Persistent Glitch skill study queue backed by the mined GSJS catalog.
 *
 * Official production rules ported from GameServerJS/players/inc_skills.js:
 * - point_cost is study work (10 points per second), not spendable iMG
 * - one skill studies at a time; choosing another pauses the current skill
 * - paused progress and active completion timestamps persist across sessions
 * - time quoins accelerate the active study, up to half its remaining time
 */

import { getSkillCatalog } from './content-catalogs.js';

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
    queue[classTsid] = {
      classTsid,
      totalPoints,
      pointsRemaining,
      startedAt: Math.max(0, Math.floor(finite(rawRow.startedAt, 0))),
      endsAt: isPaused ? 0 : Math.max(0, Math.floor(finite(rawRow.endsAt, 0))),
      pausedAt: isPaused ? Math.max(0, Math.floor(finite(rawRow.pausedAt, 0))) : 0,
      isPaused,
      acceleratedUntil: isPaused ? 0 : Math.max(0, Math.floor(finite(rawRow.acceleratedUntil, 0))),
    };
  }
  return { learned, queue };
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
  const totalSeconds = Math.max(1, Math.round(row.totalPoints / SKILL_POINTS_PER_SECOND));
  const remainingSeconds = row.isPaused
    ? Math.max(1, Math.ceil(row.pointsRemaining / SKILL_POINTS_PER_SECOND))
    : Math.max(0, Math.ceil((row.endsAt - now) / 1000));
  return {
    ...row,
    totalSeconds,
    remainingSeconds,
    elapsedSeconds: Math.max(0, totalSeconds - remainingSeconds),
    progress: Math.max(0, Math.min(1, (totalSeconds - remainingSeconds) / totalSeconds)),
    isAccelerated: !row.isPaused && row.acceleratedUntil > now,
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

export function pauseSkillStudy(state, classTsid, now = Date.now()) {
  const row = state.queue?.[classTsid];
  if (!row) return { ok: false, reason: 'not_queued' };
  if (row.isPaused) return { ok: false, reason: 'already_paused' };
  const remainingSeconds = Math.max(0, (row.endsAt - now) / 1000);
  if (remainingSeconds <= 0) return tickSkillStudy(state, now);
  row.pointsRemaining = Math.max(1, Math.ceil(remainingSeconds * SKILL_POINTS_PER_SECOND));
  row.endsAt = 0;
  row.pausedAt = now;
  row.isPaused = true;
  row.acceleratedUntil = 0;
  return { ok: true, reason: 'paused', classTsid, remainingSeconds: row.pointsRemaining / SKILL_POINTS_PER_SECOND };
}

/** Start a new study or resume paused progress; active study is paused first. */
export function startSkillStudy(state, classTsid, ctx = {}, now = Date.now()) {
  const due = tickSkillStudy(state, now);
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
  const durationSeconds = Math.max(1, Math.round(pointsRemaining / SKILL_POINTS_PER_SECOND));
  state.queue[classTsid] = {
    classTsid,
    totalPoints: existing?.totalPoints || totalPoints,
    pointsRemaining,
    startedAt: existing?.startedAt || now,
    endsAt: now + durationSeconds * 1000,
    pausedAt: 0,
    isPaused: false,
    acceleratedUntil: existing?.acceleratedUntil > now ? existing.acceleratedUntil : 0,
  };
  return {
    ok: true,
    reason: existing ? 'resumed' : 'started',
    def: check.def,
    durationSeconds,
    totalSeconds: studySecondsForSkill(check.def),
    pausedIds,
    completed: due.completed,
  };
}

/** Compatibility name retained for callers from the instant-learning prototype. */
export function learnSkill(state, classTsid, _pc = null, ctx = {}) {
  return startSkillStudy(state, classTsid, ctx, ctx.now ?? Date.now());
}

/** Complete any due active study. Absolute timestamps make offline study work. */
export function tickSkillStudy(state, now = Date.now()) {
  const completed = [];
  for (const [classTsid, row] of Object.entries(state.queue || {})) {
    if (row.isPaused || row.endsAt > now) continue;
    if (!state.learned.includes(classTsid)) state.learned.push(classTsid);
    delete state.queue[classTsid];
    completed.push({ classTsid, def: getSkillCatalog()[classTsid] || null });
  }
  return { ok: true, reason: completed.length ? 'completed' : 'ticked', completed };
}

/** Apply official double-speed acceleration for at most half the time remaining. */
export function accelerateActiveStudy(state, seconds, now = Date.now()) {
  tickSkillStudy(state, now);
  const active = getActiveStudy(state, now);
  if (!active) return { ok: false, reason: 'not_studying', requested: Math.max(0, Math.floor(finite(seconds, 0))) };
  const requested = Math.max(0, Math.floor(finite(seconds, 0)));
  // While already accelerated, the official server measures the still-
  // unaccelerated gap between the study end and acceleration end. This keeps
  // repeated time quoins from reducing a study by more than half at once.
  const unacceleratedSeconds = active.isAccelerated
    ? Math.max(0, (active.endsAt - active.acceleratedUntil) / 1000)
    : active.remainingSeconds;
  const maximum = Math.max(0, Math.round(unacceleratedSeconds / 2));
  const applied = Math.min(requested, maximum);
  if (!applied) return { ok: false, reason: 'max_acceleration', requested, maximum, classTsid: active.classTsid };
  const row = state.queue[active.classTsid];
  row.endsAt = Math.max(now + 100, row.endsAt - applied * 1000);
  row.acceleratedUntil = Math.max(row.acceleratedUntil || 0, now) + applied * 1000;
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
