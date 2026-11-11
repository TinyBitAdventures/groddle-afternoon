/**
 * Following another real player in multiplayer (registers G329 and G334):
 * the words, the menu entries and the small rules the game keeps. Pure: no
 * DOM, no socket. The server decides who follows whom and where the leader
 * went (groddle-afternoon-server follow.go); features/follow-mp-feature.js is
 * the world side. Solo never reads this: its follow of the recorded Glitches
 * (js/local-companions.js, &followdemo=) is unchanged.
 *
 * Sources: the menu entries are glitch-client InteractionMenuController.as
 * 592-614 (Follow / Stop following, sort_on 900, the disabled reasons); the
 * prompts and activity lines are GameServerJS main.js:1497-1550 (doStartFollow)
 * and players/player.js:1479-1517 (respondToFollow); any input ends it
 * (AvatarController.as _endFollowing on the arrow keys and Space, 373-430);
 * the trailing gap is the solo follow's (js/local-companions.js
 * COMPANION_FOLLOW_TRAIL_DISTANCE, companionFollowVelocity).
 *
 * Ticket 71 (keeping pace): in Glitch a follower's own physics stopped and the
 * server walked its avatar along the leader's path (AvatarView.as 107-119 and
 * 255, NetController.as 199 skip the follower's own moves; GameServerJS main.js
 * 27 follow_move_end), so it kept pace, jumped where the leader jumped and
 * carried on under any dialog. The remake walks the follower itself:
 * followSteer is the walk at full speed with a catch-up, the place it is put
 * when it is lost, and the leader's take-off points it jumps at.
 */

import { COMPANION_FOLLOW_TRAIL_DISTANCE, STALKER_ACHIEVEMENT_ID, companionFollowVelocity } from './local-companions.js?v=188f756c';
import { GRAVITY, JUMP_SPEED } from './avatar-step.js?v=9cdca818';

export { STALKER_ACHIEVEMENT_ID };
export const FOLLOW_VERB = 'mp_follow';
export const FOLLOW_STOP_VERB = 'mp_follow_stop';
/** InteractionMenuController.as 597, 604: sort_on 900. */
export const FOLLOW_VERB_SORT = 900;
/** The source's prompt timeout (main.js:1522, 1529). */
export const FOLLOW_ASK_SECONDS = 30;
/** player.js:1487: the leader must still be this close on OK. */
export const FOLLOW_MAX_DISTANCE = 1000;
/** main.js:1482: Stalker, Non-Creepy Designation after three streets followed. */
export const FOLLOW_STALKER_STREETS = 3;
/** inc_teleportation.js:1054: Three's a Cloud with three or more followers. */
export const FOLLOW_CLOUD = 3;
/** player.js:3138: a Glitch Train is 20 long (the server decides; this is for words and tests). */
export const GLITCH_TRAIN_LENGTH = 20;
/** The trailing gap a follower keeps behind its leader. */
export const FOLLOW_TRAIL_DISTANCE = COMPANION_FOLLOW_TRAIL_DISTANCE;

/** The counters and flags the source set, by their source names. */
export const FOLLOW_COUNTERS = Object.freeze({
  // inc_teleportation.js:404-414 (plain) and 533-542 (map): achievements_increment(group, kind).
  withFollowers: 'teleportation_self_withfollowers',
  withFollowers5: 'teleportation_self_withfollowers_5',
  withFollowers11: 'teleportation_self_withfollowers_11',
  // inc_teleportation.js:1054-1056: quests_set_flag, Three's a Cloud's requirement r335.
  cloudFlag: 'teleportation_self_withfollowers_3',
  // player.js:3146-3152: achievements_increment('glitch_train', location), the buff, the reset.
  train: 'glitch_train',
});

/** Words players read. GSJS and client strings where they exist, otherwise short plain remake copy. */
export const FOLLOW_TEXT = Object.freeze({
  verb: 'Follow',
  verbTip: 'Start following this person.',
  stopVerb: 'Stop following',
  stopTip: 'Stop following this person.',
  sameStreet: 'You must be in the same location!',
  already: (name) => `You are already following ${name}`,
  asked: (name) => `${name} would like to follow you.`,
  ok: 'OK',
  noThanks: 'No thanks',
  waiting: (name) => `Waiting for ${name} to confirm...`,
  busy: (name) => `${name} is too busy to be followed...`,
  self: "You can't follow yourself!",
  started: (name) => `You started following ${name}.`,
  declined: (name) => `${name} declined to be followed.`,
  far: (name) => `You were too far away to follow ${name}.`,
  tooFar: (name) => `${name} is too far away to follow you.`,
  blocked: 'You are blocking or blocked by that player.',
  gone: 'That player is not here any more.',
  stopped: (name) => `You stopped following ${name}.`,
  offline: (name) => `${name} went offline, so you stopped following.`,
  private: (name) => `${name} went somewhere you can't follow.`,
  followedBy: (name) => `${name} is following you.`,
  unfollowedBy: (name) => `${name} stopped following you.`,
  going: (name) => `Following ${name}.`,
  lost: (name) => `You lost sight of ${name}.`,
  pillFollowing: (name) => `Following ${name}`,
  pillStop: 'Stop',
  pillLed: (names) => `Followed by ${listNames(names)}`,
});

/** "Ada", "Ada and Bo", "Ada, Bo and Cy", "Ada, Bo and 3 more". */
export function listNames(names, max = 2) {
  const list = (Array.isArray(names) ? names : []).map((n) => String(n || '').trim()).filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  if (list.length <= max + 1) return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  return `${list.slice(0, max).join(', ')} and ${list.length - max} more`;
}

/** The follower's line for a refusal the server sent (follow_refused why). */
export function refusedText(why, name) {
  const n = String(name || 'That player');
  switch (String(why || '')) {
    case 'self': return FOLLOW_TEXT.self;
    case 'street': return FOLLOW_TEXT.sameStreet;
    case 'already': return FOLLOW_TEXT.already(n);
    case 'busy': return FOLLOW_TEXT.busy(n);
    case 'blocked': return FOLLOW_TEXT.blocked;
    case 'declined': return FOLLOW_TEXT.declined(n);
    case 'far': return FOLLOW_TEXT.far(n);
    default: return FOLLOW_TEXT.gone;
  }
}

/** The follower's line when following ends (follow_ended why). */
export function endedText(why, name) {
  const n = String(name || 'that player');
  switch (String(why || '')) {
    case 'offline': return FOLLOW_TEXT.offline(n);
    case 'private': return FOLLOW_TEXT.private(n);
    default: return FOLLOW_TEXT.stopped(n);
  }
}

/**
 * The menu entries on another player's Glitch (InteractionMenuController.as
 * 592-614): Stop following when you follow them, otherwise Follow, disabled
 * with the source's reason while you follow someone else. The remote is on
 * your street by construction (realtime draws only your street's players).
 */
export function followVerbs({ targetId, followingId = 0, followingName = '', asking = 0 } = {}) {
  const target = Number(targetId) || 0;
  if (!target) return [];
  if (followingId && Number(followingId) === target) {
    return [{ id: FOLLOW_STOP_VERB, label: FOLLOW_TEXT.stopVerb, tooltip: FOLLOW_TEXT.stopTip, enabled: true, reason: '', durationMs: 0, sort: FOLLOW_VERB_SORT }];
  }
  const verb = { id: FOLLOW_VERB, label: FOLLOW_TEXT.verb, tooltip: FOLLOW_TEXT.verbTip, enabled: true, reason: '', durationMs: 0, sort: FOLLOW_VERB_SORT };
  if (followingId) {
    verb.enabled = false;
    verb.reason = FOLLOW_TEXT.already(followingName || 'someone');
  } else if (asking && Number(asking) === target) {
    verb.enabled = false;
    verb.reason = FOLLOW_TEXT.waiting(followingName || 'them');
  }
  return [verb];
}

/** Keys that are input (AvatarController.as onLeft/Right/Up/Down/SpaceKey): any of them ends a follow. */
const INPUT_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S']);
export function isFollowInputKey(key) {
  return INPUT_KEYS.has(String(key ?? ''));
}

/**
 * The walk toward a point FOLLOW_TRAIL_DISTANCE behind the leader, as the
 * solo follow walks after a recorded Glitch (companionFollowVelocity).
 */
export function followVelocity(playerX, leaderX, currentVelocity = 0, maxSpeed = 4.4) {
  return companionFollowVelocity(playerX, leaderX, currentVelocity, { trailDistance: FOLLOW_TRAIL_DISTANCE, maxSpeed });
}

/** Ticket 71: a follower further behind than this walks faster ... */
export const FOLLOW_CATCHUP_FROM = 130;
/** ... reaching FOLLOW_CATCHUP_SPEED x the walk speed this far behind. */
export const FOLLOW_CATCHUP_FULL = 250;
export const FOLLOW_CATCHUP_SPEED = 1.3;
/** Further than this from the leader, the follower is put at the trailing spot. */
export const FOLLOW_PLACE_DISTANCE = 1000;
/** The leader off screen this long also puts the follower at the trailing spot. */
export const FOLLOW_OFFSCREEN_MS = 1200;
/** How near a take-off point the follower jumps, and how long a point is kept. */
export const FOLLOW_TAKEOFF_REACH = 12;
export const FOLLOW_TAKEOFF_MAX_AGE_MS = 5000;
/** No catch-up this close before a take-off point, so the jump starts at walking speed like the leader's. */
export const FOLLOW_TAKEOFF_STEADY = 200;
/** A take-off point's floor and the follower's must be this close. */
export const FOLLOW_TAKEOFF_FLOOR = 48;

const FRAME_MS = 1000 / 60;
const clampTo = (v, a, b) => Math.max(a, Math.min(b, v));
const AIRBORNE_STATES = new Set(['lift', 'fall', 'land']);
const CLIMB_STATES = new Set(['climb', 'climbPause']);

/** The leader's avatar state stands on a floor (not jumping, falling or on a ladder). */
export function leaderGrounded(anim) {
  const a = String(anim || 'stand');
  return !AIRBORNE_STATES.has(a) && !CLIMB_STATES.has(a);
}

/**
 * The follower's top speed `gap` px from the leader: the walk speed, rising to
 * FOLLOW_CATCHUP_SPEED x from FOLLOW_CATCHUP_FROM to FOLLOW_CATCHUP_FULL behind.
 * A ramp, not a step: a step at 250 px would hold a follower there for good,
 * walking exactly as fast as the leader.
 */
export function followSpeedLimit(gap, walkMax = 4.4) {
  const k = clampTo((Math.abs(Number(gap) || 0) - FOLLOW_CATCHUP_FROM) / (FOLLOW_CATCHUP_FULL - FOLLOW_CATCHUP_FROM), 0, 1);
  return Math.max(0, Number(walkMax) || 0) * (1 + (FOLLOW_CATCHUP_SPEED - 1) * k);
}

/**
 * The walk toward `targetX` (companionFollowVelocity's blend, with the target
 * and the top speed given): settles within 10 px, otherwise eases toward
 * 0.085 x the distance, capped at `limit`.
 */
export function followSteerVelocity(playerX, targetX, currentVelocity = 0, limit = 4.4) {
  const v = Number(currentVelocity) || 0;
  const cap = Math.max(0, Number(limit) || 0);
  const error = (Number(targetX) || 0) - (Number(playerX) || 0);
  if (Math.abs(error) <= 10) {
    const next = v * 0.62;
    return Math.abs(next) < 0.05 ? 0 : next;
  }
  const desired = clampTo(error * 0.085, -cap, cap);
  return clampTo(v * 0.58 + desired * 0.42, -cap, cap);
}

/** The trailing spot behind a leader at `leaderX` for a follower at `playerX` (it stays on its own side). */
export function trailingX(playerX, leaderX) {
  const side = Number(leaderX) >= Number(playerX) ? -1 : 1;
  return Number(leaderX) + side * FOLLOW_TRAIL_DISTANCE;
}

/** A log of the leader's movement samples and the take-off points found in them. */
export function createTakeoffLog() {
  return { last: null, points: [], street: '' };
}

export function clearTakeoffLog(log, street = '') {
  log.last = null;
  log.points.length = 0;
  log.street = street;
}

/**
 * One movement sample of the leader ({ x, y, dir, anim, triple, t } with t in
 * local ms): a change from anything but a ladder into the rising jump state
 * ('lift') is a take-off. The leader's game shows 'lift' a few frames after
 * the feet leave the floor and sends at most every 100 ms, so the point is
 * worked back along the leader's path from how far it has risen (launch at
 * JUMP_SPEED under GRAVITY). From 'fall' it is the air jump after walking off
 * a ledge. Returns the new point or null.
 */
export function noteLeaderSample(log, sample) {
  if (!log || !sample) return null;
  const s = {
    x: Number(sample.x) || 0,
    y: Number(sample.y) || 0,
    dir: Number(sample.dir) < 0 ? -1 : 1,
    anim: String(sample.anim || 'stand'),
    triple: sample.triple === true,
    t: Number(sample.t) || 0,
  };
  const prev = log.last;
  log.last = s;
  if (!prev || s.anim !== 'lift' || prev.anim === 'lift' || CLIMB_STATES.has(prev.anim)) return null;
  const air = prev.anim === 'fall';
  const frames = Math.max(1, (s.t - prev.t) / FRAME_MS);
  const dx = s.x - prev.x;
  let k = 0;
  if (!air) {
    const v0 = -JUMP_SPEED * (s.triple ? 1.4 : 1);
    const rise = Math.max(0, prev.y - s.y);
    const disc = v0 * v0 - 2 * GRAVITY * rise;
    const since = disc > 0 ? (v0 - Math.sqrt(disc)) / GRAVITY : frames;
    k = clampTo(1 - since / frames, 0, 1);
  }
  const point = {
    x: prev.x + dx * k,
    y: air ? prev.y + (s.y - prev.y) * k : prev.y,
    dir: Math.abs(dx) > 2 ? Math.sign(dx) : s.dir,
    speed: Math.abs(dx) / frames,
    triple: s.triple,
    air,
    t: s.t,
  };
  log.points.push(point);
  if (log.points.length > 8) log.points.shift();
  return point;
}

/** Drops take-off points the follower at `playerX` has passed, and those older than FOLLOW_TAKEOFF_MAX_AGE_MS. */
export function pruneTakeoffs(log, playerX, now) {
  const x = Number(playerX) || 0;
  log.points = log.points.filter((p) => now - p.t <= FOLLOW_TAKEOFF_MAX_AGE_MS && (x - p.x) * p.dir <= FOLLOW_TAKEOFF_REACH);
  return log.points;
}

/** The next take-off point ahead of the follower (the oldest one kept), or null. */
export function nextTakeoff(log) {
  return log?.points?.[0] || null;
}

/**
 * Whether the follower ({ x, y, vx, onGround }) jumps now at the take-off
 * point `p`: within FOLLOW_TAKEOFF_REACH, on the same floor, on the ground
 * (in the air for an air jump), moving the way the leader went (a standing
 * jump takes any way in).
 */
export function takeoffDue(p, { x, y, vx = 0, onGround = true } = {}) {
  if (!p) return false;
  if (Math.abs((Number(x) || 0) - p.x) > FOLLOW_TAKEOFF_REACH) return false;
  if (Math.abs((Number(y) || 0) - p.y) > FOLLOW_TAKEOFF_FLOOR) return false;
  if (p.air ? onGround : !onGround) return false;
  if (p.speed < 0.5) return true;
  return Math.abs(vx) > 0.3 && Math.sign(vx) === p.dir;
}

/** Where a follower lands on the leader's new street: the trailing gap behind the leader's arrival. */
export function followArrival(go = {}) {
  const x = Number(go.x);
  const y = Number(go.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const dir = Number(go.dir) < 0 ? -1 : 1;
  return { x: x - dir * FOLLOW_TRAIL_DISTANCE, y };
}

/**
 * What a confirmed teleport with followers counts for the leader
 * (follow_teleported: followers at the teleport, complete at
 * teleport_complete): which of teleportation_self_withfollowers, _5 and _11
 * count (by kind), and whether teleportation_self_withfollowers_3 is set.
 */
export function teleportCounters({ kind = 'plain', followers = 0, complete = 0 } = {}) {
  const n = Math.max(0, Math.floor(Number(followers) || 0));
  return {
    kind: kind === 'map' ? 'map' : 'plain',
    one: n > 0,
    five: n >= 5,
    eleven: n >= 11,
    cloud: Math.floor(Number(complete) || 0) >= FOLLOW_CLOUD,
  };
}

/** The teleport kind a teleportation counter names (teleportation_self:<kind>), or ''. */
export function teleportKindOf(counter) {
  const m = /^teleportation_self:(plain|map)$/.exec(String(counter || ''));
  return m ? m[1] : '';
}
