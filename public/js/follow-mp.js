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
 */

import { COMPANION_FOLLOW_TRAIL_DISTANCE, STALKER_ACHIEVEMENT_ID, companionFollowVelocity } from './local-companions.js?v=street-players-4';

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
  const n = String(name || 'That Glitch');
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
  const n = String(name || 'that Glitch');
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
