/**
 * One transient-instance runtime for the hand-built quest rooms (architecture
 * step 3): the shape every rebuilt quest location shares, kept pure so it can
 * be tested and could later run server-side.
 *
 * How the original worked (players/inc_quests.js questInstanceLocation,
 * players/inc_instances.js, quests/*.js onStarted / onExitLocation):
 *  - Accepting the quest started it (onStarted), which created a private copy
 *    of a template location and teleported the player in, remembering the
 *    exit point (instances_get_exit) on the street they came from.
 *  - Most rooms carried an exit delay (5 * 60 seconds, 2 * 60 for The High
 *    Jumper, 3 * 60 for the back alley) after which the instance closed.
 *  - Leaving before the quest was complete failed it (failQuest): progress
 *    reset and it could be started again. Leaving after the goal set the
 *    quest's `leave` flag, which completed most puzzle quests.
 *
 * Here a run holds: which quest and room, the stage (rooms with several
 * locations), the timer, the run's own flags, and the return point. Nothing
 * of a run is saved except the return point, so a reload inside an instance
 * always resumes on the street the player left from (reloadTarget).
 */

export const QUEST_SCENE_PREFIX = 'QI_';
/** The default exit delay of questInstanceLocation rooms. */
export const DEFAULT_INSTANCE_MS = 5 * 60 * 1000;
/** The HUD timer turns red under this. */
export const LOW_TIME_MS = 30 * 1000;

const STATUSES = new Set(['active', 'solved', 'expired', 'left']);

const cleanId = (value) => String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');

/** Scene TSID for one stage of a room: QI_<ROOM>_<STAGE>. */
export function questSceneTsid(roomId, stage = 'main') {
  return `${QUEST_SCENE_PREFIX}${cleanId(roomId).toUpperCase()}_${cleanId(stage).toUpperCase() || 'MAIN'}`;
}

export function isQuestSceneTsid(tsid) {
  return String(tsid || '').startsWith(QUEST_SCENE_PREFIX);
}

function cleanPoint(point) {
  if (!point || typeof point !== 'object') return null;
  const tsid = String(point.tsid || '').trim();
  if (!tsid || isQuestSceneTsid(tsid)) return null;
  const x = Number(point.x);
  const y = Number(point.y);
  return { tsid, x: Number.isFinite(x) ? Math.round(x) : 0, y: Number.isFinite(y) ? Math.round(y) : 0 };
}

/**
 * Start a run. `durationMs` 0 means no timer (rooms that stay open until you
 * leave, like Rainbow Run's exit_delay: 0).
 */
export function createQuestInstance({
  questId,
  roomId,
  now = Date.now(),
  durationMs = DEFAULT_INSTANCE_MS,
  returnTo = null,
  stage = 'main',
  repeat = false,
} = {}) {
  const ms = Math.max(0, Math.floor(Number(durationMs) || 0));
  return {
    questId: cleanId(questId),
    roomId: cleanId(roomId),
    stage: cleanId(stage) || 'main',
    status: 'active',
    repeat: Boolean(repeat),
    startedAt: now,
    durationMs: ms,
    expiresAt: ms ? now + ms : 0,
    returnTo: cleanPoint(returnTo),
    flags: {},
    bonusMs: 0,
  };
}

export function instanceRemainingMs(run, now = Date.now()) {
  if (!run || run.status !== 'active' && run.status !== 'solved') return 0;
  if (!run.expiresAt) return Infinity;
  return Math.max(0, run.expiresAt - now);
}

/** Advance the clock; an active run whose time is up becomes `expired`. */
export function stepQuestInstance(run, now = Date.now()) {
  if (!run || run.status !== 'active' || !run.expiresAt) return { expired: false };
  if (now < run.expiresAt) return { expired: false };
  run.status = 'expired';
  return { expired: true };
}

/** A time quoin or a room bonus: push the deadline back. */
export function extendQuestInstance(run, ms) {
  const add = Math.max(0, Math.floor(Number(ms) || 0));
  if (!run || !run.expiresAt || !add || (run.status !== 'active' && run.status !== 'solved')) return 0;
  run.expiresAt += add;
  run.bonusMs += add;
  return add;
}

/** Record a run flag once; true when it is new. */
export function setRunFlag(run, flag, now = Date.now()) {
  const key = String(flag || '').trim();
  if (!run || !key || run.flags[key]) return false;
  run.flags[key] = now;
  return true;
}

export function runFlag(run, flag) {
  return Boolean(run?.flags?.[String(flag || '')]);
}

/** The room's goal is met (the quest may still need the `leave` flag). */
export function solveQuestInstance(run, now = Date.now()) {
  if (!run || run.status !== 'active') return false;
  run.status = 'solved';
  run.solvedAt = now;
  return true;
}

/** Move to another location of the same room (An Autumn Day's branches). */
export function changeInstanceStage(run, stage) {
  const next = cleanId(stage);
  if (!run || !next || (run.status !== 'active' && run.status !== 'solved')) return false;
  run.stage = next;
  return true;
}

/**
 * Leave the room. Returns where to go and how it ended:
 *  - 'complete' when the room was solved (the quest's leave flag applies)
 *  - 'expired' when the clock ran out
 *  - 'abandoned' otherwise (the quest fails and can be started again)
 */
export function finishQuestInstance(run) {
  if (!run) return { ok: false, outcome: 'missing', returnTo: null };
  if (run.status === 'left') return { ok: false, outcome: run.outcome || 'left', returnTo: run.returnTo };
  const outcome = run.status === 'solved' ? 'complete' : run.status === 'expired' ? 'expired' : 'abandoned';
  run.status = 'left';
  run.outcome = outcome;
  return { ok: true, outcome, returnTo: run.returnTo };
}

/** m:ss for the HUD (Infinity reads as a dash). */
export function formatInstanceClock(ms) {
  if (!Number.isFinite(ms)) return '–';
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Persistent slice: only where to come back to, plus quests waiting for a
 * retry prompt (left early, timed out, or interrupted by a reload).
 */
export function normalizeInstanceSave(seed = {}) {
  const src = seed && typeof seed === 'object' ? seed : {};
  const retry = {};
  for (const [id, at] of Object.entries(src.retry || {})) {
    const key = cleanId(id);
    const n = Math.floor(Number(at));
    if (key && Number.isFinite(n) && n > 0) retry[key] = n;
  }
  const memory = {};
  for (const [id, row] of Object.entries(src.memory || {})) {
    const key = cleanId(id);
    if (key && row && typeof row === 'object') memory[key] = JSON.parse(JSON.stringify(row));
  }
  return {
    returnTo: cleanPoint(src.returnTo),
    questId: cleanId(src.questId) || null,
    roomId: cleanId(src.roomId) || null,
    retry,
    memory,
  };
}

/**
 * Where a reload should start: the saved return point when the save was
 * written inside a quest room (or a run was open), else null.
 */
export function reloadTarget(save, savedLocation) {
  const back = save?.returnTo;
  if (!back) return null;
  if (isQuestSceneTsid(savedLocation?.tsid) || save.questId) return { tsid: back.tsid, x: back.x, y: back.y };
  return null;
}

/** A point is inside an axis-aligned box given as bottom-centre x/y + w/h. */
export function inBottomBox(box, x, y) {
  if (!box) return false;
  const w = Number(box.w) || 0;
  const h = Number(box.h) || 0;
  return x >= box.x - w / 2 && x <= box.x + w / 2 && y <= box.y + 2 && y >= box.y - h;
}

export function isRunStatus(status) {
  return STATUSES.has(status);
}
