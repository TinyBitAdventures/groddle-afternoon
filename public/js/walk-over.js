/**
 * Walk-over: a verb chosen on a thing more than reach away walks the avatar over to it
 * first, then runs (pure: no Pixi, no DOM). game.js requestVerb plans it with these and
 * steers the walk with js/user-path.js (MAPWALK).
 *
 * The original (Tiny Speck, CC0):
 * - The server measured every itemstack verb from the player's feet to the thing's
 *   (eleven-gsjs main.js doVerb 2939-2967): over 300 px (the verb's "proximity_override"
 *   if it has one, 150 px for everything while dead in Hell) it answered error 101
 *   "Get closer:<range>". No check for "give" (bugs.tinyspeck.com 9235), a pickup at
 *   home, a Fox (npc_fox) or a verb with "disable_proximity" (js/verb-ranges-data.js).
 * - On 101 the client said 'Moving you in order to "<verb>"' and walked you over
 *   (TSFrontController.as moveCloserForVerbOrAction 438-452, moveAvatarToLIVandDoVerbOrAction
 *   1887-1900): a walk to one x on your side of the thing, short of it by half the way
 *   there but at most min(half its width + 30, range - 20) (AvatarController.beginPath
 *   230-263). Left or right only, no jumps or ladders (user-path.js).
 * - Whatever ended the walk (arriving within 20 px, an arrow key, Space, a wall) the client
 *   measured again, to where the thing is now: in range, it sent the verb (after its
 *   position, maybeSendMoveXY); out of range, "Could not get close enough :(" (endPath
 *   127-224 -> doVerbOrActionAfterPath 591-652). A new street dropped it.
 *
 * The remake's differences, kept small:
 * - Distance is to the nearest edge of the thing's box (game.js interactDistance), not its
 *   middle: the remake's vendors, gardens and houses are drawn wider than the original's
 *   one point, and you never walk up to something you already touch.
 * - A thing the walk can never reach (behind a floor from wherever the walk stops: a plant in
 *   the cave under you, a tree up on a ledge) is refused at once with the client's line,
 *   instead of walking under it first (game.js simulates the walk with js/avatar-step.js).
 * - Online, the realtime server's own reach (street-objects.js inObjectReach) must hold
 *   too when the verb runs; a walk-over always ends well inside it.
 */

import { VERB_RANGES } from './verb-ranges-data.js?v=4d0a4515';

/** main.js doVerb 2955 required_range. */
export const DEFAULT_VERB_RANGE = 300;
/** main.js doVerb 2965: dead in Hell. */
export const HELL_VERB_RANGE = 150;
/** 810 of the 936 pickup verbs set proximity_override 800 (tools/build-verb-ranges.mjs). */
export const PICKUP_RANGE = 800;
/** PhysicsModel.path_end_allowance, taken off the range for the walk's stop (TSFrontController.as 1892). */
export const PATH_END_ALLOWANCE = 20;
/** "30 is about half of ava size" (TSFrontController.as 1891). */
export const HALF_AVATAR = 30;

/** TSFrontController.as 451. */
export const movingLine = (label) => `Moving you in order to "${String(label || 'use').toLowerCase()}"`;
/** TSFrontController.as 633. */
export const FAILED_LINE = 'Could not get close enough :(';

/** The verb's own id ("feed:apple:2" is feed). */
export const baseVerb = (verbId) => String(verbId || '').split(':')[0];

/**
 * PURE: how near the verb needs you, in px, or null when it never checked (main.js doVerb
 * 2939-2967). `classId` is the thing's class, as GameServerJS names it.
 */
export function verbRange(classId, verbId, { inHell = false, atHome = false } = {}) {
  const cls = String(classId || '');
  const verb = baseVerb(verbId);
  if (!verb || /^pc_/.test(cls) || cls === 'npc_fox') return null;
  if (verb === 'give') return null;
  if (atHome && verb === 'pickup') return null;
  const own = VERB_RANGES[cls]?.[verb];
  if (own === 0) return null;
  let range = Number.isFinite(own) ? own : verb === 'pickup' ? PICKUP_RANGE : DEFAULT_VERB_RANGE;
  if (inHell) range = HELL_VERB_RANGE;
  return range;
}

/**
 * PURE: the x the walk heads for (moveAvatarToLIVandDoVerbOrAction 1892, beginPath 245-251):
 * on your side of the thing, short of it by half the way, at most min(half its width + 30,
 * range - 20).
 */
export function walkOverGoalX({ targetX, targetW = 0, fromX, range = DEFAULT_VERB_RANGE }) {
  const x = Number(targetX);
  if (!Number.isFinite(x)) return null;
  const from = Number(fromX) || 0;
  const most = Math.max(0, Math.min((Math.max(0, Number(targetW) || 0) / 2) + HALF_AVATAR, range - PATH_END_ALLOWANCE));
  const offset = Math.min(Math.abs(from - x) * 0.5, most);
  return from < x ? x - offset : x + offset;
}

/**
 * PURE: in reach for the verb now. `dist` is to the thing, `range` verbRange's (null: any
 * distance), `behind` a floor between you and it, `serverFar` the realtime server would refuse.
 */
export function inVerbReach({ dist, range, behind = false, serverFar = false }) {
  if (serverFar || behind) return false;
  return range == null || (Number.isFinite(dist) && dist <= range);
}

/**
 * PURE: what ends a walk-over does (AvatarController endPath: every end but a new street
 * measures again). 'measure' runs the verb if in reach, else says FAILED_LINE; 'drop' forgets it.
 */
export function walkOverEnd(reason) {
  return ['arrived', 'key', 'jump', 'wall'].includes(reason) ? 'measure' : 'drop';
}
