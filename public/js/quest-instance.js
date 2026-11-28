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
 *    Jumper, 3 * 60 for the back alley). It is not a time limit: after it the
 *    server asks "Are you stuck? Do you want to leave this place?" (see
 *    STUCK_PROMPT below); the room stays open as long as you like.
 *  - Leaving before the quest was complete failed it (failQuest): progress
 *    reset and it could be started again. Leaving after the goal set the
 *    quest's `leave` flag, which completed most puzzle quests.
 *
 * Here a run holds: which quest and room, the stage (rooms with several
 * locations), the timer, the run's own flags, and the return point. Nothing
 * of a run is saved except the return point, so a reload inside an instance
 * always resumes on the street the player left from (reloadTarget). G904: a
 * run held while you are away at a party is saved whole (heldRunSave).
 */

import { isGraphSource, streetsLeadingTo } from './street-graph.js?v=16013e6e';

export const QUEST_SCENE_PREFIX = 'QI_';
/** The default exit delay of questInstanceLocation rooms. */
export const DEFAULT_INSTANCE_MS = 5 * 60 * 1000;
/** The HUD timer turns red under this. */
export const LOW_TIME_MS = 30 * 1000;

/**
 * The exit delay's prompt (players/inc_instances.js 317-357). instances_create_delayed 377-386
 * schedules instances_show_exit_prompt `exit_delay` seconds after you enter; it is a prompts_add
 * with icon_buttons and no timeout (the bottom-right stack). "Yes, please" runs
 * instances_left(id, false, false, true): you go back to where you entered (force, even with
 * no_auto_return), and the quest's onExitLocation fails it unless it is complete. "No thanks"
 * asks again 2 * 60 seconds later. A dead player is asked 60 seconds later instead (323).
 * instances_cancel_exit_prompt 359-370 drops it (help_juju_bandits.js offerCampExit 324-337).
 */
export const STUCK_PROMPT_TEXT = 'Are you stuck? Do you want to leave this place?';
export const STUCK_PROMPT_CHOICES = Object.freeze([
  Object.freeze({ label: 'Yes, please', value: 'yes' }),
  Object.freeze({ label: 'No thanks', value: 'no' }),
]);
/** instances_exit_via_prompt "no": instances_schedule_exit_prompt(id, 2*60). */
export const STUCK_PROMPT_AGAIN_MS = 2 * 60 * 1000;
/** instances_show_exit_prompt: is_dead -> instances_schedule_exit_prompt(id, 60). */
export const STUCK_PROMPT_DEAD_MS = 60 * 1000;

const STATUSES = new Set(['active', 'solved', 'expired', 'left']);

const cleanId = (value) => String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');

/**
 * G1120: a quest room's own save.memory key, room:<roomId>:<key> (ctx.memory, and the world hooks
 * that read the same row, such as the Juju hunt). The one place the format lives: the normalizer
 * keeps exactly these characters (cleanMemoryKey).
 */
export const roomMemoryKey = (roomId, key) => `room:${roomId}:${key}`;
const cleanMemoryKey = (value) => String(value || '').trim().replace(/[^a-zA-Z0-9_:-]/g, '');

/**
 * G1120: saves from 2026-10-21 to the fix ran room keys through cleanId, which dropped the colons
 * (room:juju_camp:hunt saved as roomjuju_camphunt). The rooms that wrote memory then, with the
 * name each used; `more` when the name ran on (the Clubhouse's qurazy:<questId>).
 */
const STRIPPED_ROOM_MEMORY = Object.freeze([
  Object.freeze({ room: 'juju_camp', name: 'hunt' }),
  Object.freeze({ room: 'an_autumn_day', name: 'qurazy' }),
  Object.freeze({ room: 'clubhouse', name: 'qurazy', more: true }),
]);

/** The real key for a stripped one, else null. */
export function unstripRoomMemoryKey(key) {
  if (!key.startsWith('room') || key.includes(':')) return null;
  for (const { room, name, more } of STRIPPED_ROOM_MEMORY) {
    const head = `room${room}${name}`;
    if (key === head && !more) return roomMemoryKey(room, name);
    if (more && key.length > head.length && key.startsWith(head)) return roomMemoryKey(room, `${name}:${key.slice(head.length)}`);
  }
  return null;
}

/**
 * The room bar's button (#486, G1003): Leave while the room runs, the room's doneLabel (Go back)
 * once solved, and none once solved in a room the source made with {no_auto_return: true}
 * (room.noAutoReturn): players/inc_instances.js instances_left 145 sends you back only without it,
 * Glitch's client had no such button, and those rooms' objective is to find your own way back
 * (firefly_whistle.js 60; tower_quest.js 40, tower_quest_part2.js 39, tower_quest_part3.js 64,
 * tower_quest_part3repeat.js 48). Leave before the room is solved stays.
 */
export function roomLeaveButton(room, status) {
  const solved = status === 'solved';
  return { label: solved ? room?.doneLabel || 'Go back' : 'Leave', hidden: solved && Boolean(room?.noAutoReturn) };
}

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
 * Where a run comes back to: the place it was entered from (players/inc_instances.js
 * instances_get_exit, used by main.js 1070-1082 for an instance_exit signpost), your home
 * street or house included, as join_club.js onStarted 96-117 instanced you straight from home.
 * From inside another room's scene: that run's way back (`saved`).
 */
export function wayBackFrom(here, saved = null) {
  if (!here?.tsid || isQuestSceneTsid(here.tsid)) return cleanPoint(saved);
  return cleanPoint(here);
}

/**
 * Start a run. `durationMs` 0 means no timer (rooms that stay open until you
 * leave, like Rainbow Run's exit_delay: 0). `exitPromptMs` is the source exit
 * delay: the "Are you stuck?" prompt that long after entering (0: none).
 */
export function createQuestInstance({
  questId,
  roomId,
  now = Date.now(),
  durationMs = DEFAULT_INSTANCE_MS,
  exitPromptMs = 0,
  returnTo = null,
  stage = 'main',
  repeat = false,
} = {}) {
  const ms = Math.max(0, Math.floor(Number(durationMs) || 0));
  const askMs = Math.max(0, Math.floor(Number(exitPromptMs) || 0));
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
    exitPromptMs: askMs,
    stuckAt: askMs ? now + askMs : 0,
    stuckAsking: false,
  };
}

/** instances_schedule_exit_prompt: ask "Are you stuck?" `ms` from now (0 cancels). */
export function scheduleStuckPrompt(run, ms, now = Date.now()) {
  if (!run) return 0;
  const n = Math.max(0, Math.floor(Number(ms) || 0));
  run.stuckAt = n ? now + n : 0;
  return run.stuckAt;
}

/** The stuck prompt is due: a live run, scheduled, not already asking. */
export function stuckPromptDue(run, now = Date.now()) {
  if (!run || (run.status !== 'active' && run.status !== 'solved')) return false;
  return Boolean(run.stuckAt) && !run.stuckAsking && now >= run.stuckAt;
}

/**
 * The answer (instances_exit_via_prompt 346-357): 'leave' for Yes, please; No thanks (or a
 * prompt taken down unanswered by a scene change) asks again later.
 */
export function answerStuckPrompt(run, choice, { now = Date.now(), againMs = STUCK_PROMPT_AGAIN_MS } = {}) {
  if (!run) return 'none';
  run.stuckAsking = false;
  if (choice === 'yes') {
    run.stuckAt = 0;
    return 'leave';
  }
  if (choice === 'no') scheduleStuckPrompt(run, againMs, now);
  return 'stay';
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

/**
 * G904: a run held while you are away at a party. Glitch kept the instance and your place in it
 * when you left it for another instance, the party space being one (groups/instance.js
 * player_exited_location 343-363), and sent you back to the spot you left when you left the party
 * (players/inc_instances.js instances_enter 71-111, instances_left 135-180). The room's clock and
 * its "Are you stuck?" wait stop while you are away (the remake's choice: Glitch's ran on, as
 * events_add timers on the player, so the prompt could find you at the party).
 */
export function holdQuestInstance(run, now = Date.now()) {
  if (!run || (run.status !== 'active' && run.status !== 'solved') || run.heldAt) return false;
  run.heldAt = now;
  run.stuckAsking = false;
  return true;
}

/** Back from the party: the clock and the stuck wait carry on from where they stopped. */
export function resumeQuestInstance(run, now = Date.now()) {
  if (!run?.heldAt) return 0;
  const away = Math.max(0, now - run.heldAt);
  if (run.expiresAt) run.expiresAt += away;
  if (run.stuckAt) run.stuckAt += away;
  delete run.heldAt;
  return away;
}

/** The held run as saved, so a reload at the party neither fails nor loses it; `spot` is where you stood. */
export function heldRunSave(run, spot = {}) {
  if (!run?.heldAt) return null;
  return normalizeHeldRun({
    ...run,
    leftMs: run.expiresAt ? Math.max(0, run.expiresAt - run.heldAt) : 0,
    stuckInMs: run.stuckAt ? Math.max(0, run.stuckAt - run.heldAt) : 0,
    x: spot.x,
    y: spot.y,
    scale: spot.scale,
    data: spot.data,
  });
}

export function normalizeHeldRun(src) {
  if (!src || typeof src !== 'object') return null;
  const questId = cleanId(src.questId);
  const roomId = cleanId(src.roomId);
  if (!questId || !roomId || (src.status !== 'active' && src.status !== 'solved')) return null;
  const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const flags = {};
  for (const [k, v] of Object.entries(src.flags || {})) if (String(k).trim() && Number(v) > 0) flags[String(k).trim()] = Math.floor(Number(v));
  const scale = Number(src.scale);
  return {
    questId,
    roomId,
    stage: cleanId(src.stage) || 'main',
    status: src.status,
    repeat: src.repeat === true,
    startedAt: n(src.startedAt),
    durationMs: n(src.durationMs),
    leftMs: n(src.leftMs),
    returnTo: cleanPoint(src.returnTo),
    flags,
    bonusMs: n(src.bonusMs),
    exitPromptMs: n(src.exitPromptMs),
    stuckInMs: n(src.stuckInMs),
    solvedAt: n(src.solvedAt),
    x: Math.round(Number(src.x) || 0),
    y: Math.round(Number(src.y) || 0),
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    data: plainRoomData(src.data),
  };
}

/**
 * The room's own plain state (ctx.data) worth keeping through a reload at the party: keys not
 * starting with '_', whose values are numbers, strings, booleans or plain arrays/objects of them
 * (sprites, functions and class instances drop out). A room's build/enter puts back the rest.
 */
export function plainRoomData(data, { maxChars = 20000 } = {}) {
  const out = {};
  const plain = (v, depth) => {
    if (v == null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return Number.isNaN(v) ? false : true;
    if (depth > 4) return false;
    if (Array.isArray(v)) return v.every((x) => plain(x, depth + 1));
    if (typeof v !== 'object') return false;
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(v).every((x) => plain(x, depth + 1));
  };
  let size = 0;
  for (const [k, v] of Object.entries(data || {})) {
    if (k.startsWith('_') || !plain(v, 0)) continue;
    const json = JSON.stringify(v);
    if (json === undefined || size + json.length > maxChars) continue;
    size += json.length;
    out[k] = JSON.parse(json);
  }
  return out;
}

/** A held run back from its save (still held: resumeQuestInstance starts the clock again). */
export function runFromHeld(saved, now = Date.now()) {
  const h = normalizeHeldRun(saved);
  if (!h) return null;
  const run = {
    ...createQuestInstance({ questId: h.questId, roomId: h.roomId, now, durationMs: 0, returnTo: h.returnTo, stage: h.stage, repeat: h.repeat }),
    status: h.status,
    startedAt: h.startedAt || now,
    durationMs: h.durationMs,
    expiresAt: h.durationMs && h.leftMs ? now + h.leftMs : h.durationMs ? now : 0,
    flags: { ...h.flags },
    bonusMs: h.bonusMs,
    exitPromptMs: h.exitPromptMs,
    stuckAt: h.stuckInMs ? now + h.stuckInMs : 0,
    heldAt: now,
  };
  if (h.solvedAt) run.solvedAt = h.solvedAt;
  return run;
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
  const stripped = [];
  for (const [id, row] of Object.entries(src.memory || {})) {
    const key = cleanMemoryKey(id);
    if (!key || !row || typeof row !== 'object') continue;
    const real = unstripRoomMemoryKey(key);
    if (real) stripped.push([real, row]);
    else memory[key] = JSON.parse(JSON.stringify(row));
  }
  // G1120: a stripped row comes back under its real key; what was written there since wins.
  for (const [real, row] of stripped) memory[real] = { ...JSON.parse(JSON.stringify(row)), ...(memory[real] || {}) };
  return {
    returnTo: cleanPoint(src.returnTo),
    questId: cleanId(src.questId) || null,
    roomId: cleanId(src.roomId) || null,
    retry,
    memory,
    // G886: the last ordinary street you stood on, the way out of a quest room with no run open.
    lastStreet: cleanPoint(src.lastStreet),
    // G904: the run held while you are away at a party (heldRunSave).
    away: normalizeHeldRun(src.away),
  };
}

/**
 * G886: a quest room you stand in with no run open (a street or QA link, a save written there).
 * The source never left anyone in one: instances were entered only through their quest, and a
 * player logging out inside an underground puzzle or Paradise instance was moved to its exit,
 * instances_get_exit (where you came in from, else config.default_location), with "It looks like
 * you ran into some trouble. You've been moved to a safe place." (players/player.js onLogout
 * 333-338, inc_instances.js 208-215).
 * The practice streets' EXIT teleporter took you to that exit whatever the quest
 * (locations/inc_skillquest.js onTeleporterCollision 27-40).
 * G888 (Austin 2026-11-16): the remake no longer moves you out on arrival or reload (G886/G887
 * did, with that line); the street shows a visible EXIT that leads to this way out
 * (features/dead-ends-feature.js).
 */
/** Hechey Track, the street index's default (game.js STREET_INDEX.default, newxp-feature DEFAULT_START). */
export const STRAY_FALLBACK_TSID = 'GLI2V0UN7RD1T2J';

/**
 * Where a stray goes: the last ordinary street (instances_get_exit's "where you came in"), else
 * your home street when you have one, else the default street (config.default_location).
 * G887: `ordinary(tsid)` false drops a last street that is itself a dead end (a puzzle street, a
 * quest room), so the way out always ends on a street with roads to Ur.
 */
export function strayWayOut({ lastStreet = null, homeTsid = null, ordinary = null } = {}) {
  const back = cleanPoint(lastStreet);
  if (back && (typeof ordinary !== 'function' || ordinary(back.tsid))) return back;
  if (homeTsid) return { tsid: String(homeTsid), x: null, y: null };
  return { tsid: STRAY_FALLBACK_TSID, x: null, y: null };
}

/**
 * G887: the streets whose roads lead back to Hechey Track (`graph` is the street graph or
 * assets/content/signpost-graph.json: signposts and doors; road closures are not counted, a road still
 * being built is still Ur's: js/street-graph.js streetsLeadingTo, R11 G969). A G-keyed Set, or null
 * without a graph. Only these are kept as the last ordinary street: Orangian (its one door leads to
 * itself) once was, and the way out of a quest room led back onto it. `extra` ({ from, to } rows)
 * adds the ways out a feature runs itself (js/dead-ends.js urReach).
 */
export function streetsReachingUr(graph, start = STRAY_FALLBACK_TSID, extra = []) {
  if (!isGraphSource(graph)) return null;
  return streetsLeadingTo(graph, start, extra);
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
