/**
 * What a Chicken does while it is not walking: pure rules. No Pixi, no DOM
 * (js/chicken-idle-art.js puts them on a sprite; tests/chicken-idles.test.js).
 *
 * Source: glitch-GameServerJS items/npc_chicken.js (CC0).
 *   onPause 1216-1277: on a street with players it stops every randInt(6000, 14000) ms, takes
 *   one of pause_state_choices as its state for that many seconds, and walks on.
 *   pause_state_choices 1856-1865: idle1 three times, idle2, idle3 and pause for 4 s,
 *   pecking_twice for 3 s, pecking_once for 2 s.
 *   onWaitStart 1630-1638: a player at it (its menu, a verb): nothing if it is rooked or sad;
 *   else, when it is not flying and not on an egg, it stops and its state is 'verb'.
 *   onWaitEnd 1620-1628: it walks on (not rooked, sad, on an egg or flying).
 *
 * How the client drew a state (glitch-client): each state is the frames under that FrameLabel of
 * the SWF's animatee, played at the engine's 30 frames a second (model/TSEngineConstants.as 6);
 * a state in the SWF's `loopers` loops and any other plays once and stops on its last frame
 * (spritesheet/SSCollection.as 116-131). npc_chicken.fla: animatee = chicken, loopers = walk,
 * flying, flying_no_feathers, flying_back, fall. So every state here plays once and holds: a
 * 2.2 s idle1 stands on its last frame for the rest of its 4 s.
 *
 * The art: Tiny Speck's OGA npc_chicken sheets (CC0), 148 x 110 cells, measured:
 *   idle1 888 x 1320 (6 x 12), 67 frames; idle2 888 x 880 (6 x 8), 47; idle3 888 x 1650 (6 x 15),
 *   86; pause 888 x 2420 (6 x 22), 131; pecking_twice 888 x 770 (6 x 7), 40; verb 888 x 1100
 *   (6 x 10), 55; pecking_once 888 x 660 (6 x 6), 32 (already in the game, game.js chickenPeck).
 * The same counts as npc_chicken.swf sprite 183's labels (idle1 670-736, idle2 737-783, idle3
 * 784-869, pause 202-332, verb 333-387, pecking_twice 388-427, pecking_once 428-459). The six
 * new ones are packed (js/packed-sheets-data.js, set 'chicken') and load when first played.
 */

import { PACKED_SHEETS } from './packed-sheets-data.js?v=f4623e14';

/** model/TSEngineConstants.as 6: TARGET_FRAMERATE. */
export const CHICKEN_IDLE_FPS = 30;

/** npc_chicken.fla `loopers`: none of the states below is in it. */
export const CHICKEN_LOOPERS = Object.freeze(['walk', 'flying', 'flying_no_feathers', 'flying_back', 'fall']);

/** Frames per state (the SWF's labels and the OGA sheets agree). */
export const CHICKEN_IDLE_FRAMES = Object.freeze({
  idle1: 67,
  idle2: 47,
  idle3: 86,
  pause: 131,
  pecking_twice: 40,
  pecking_once: 32,
  verb: 55,
});

/** npc_chicken.js pause_state_choices 1856-1865: [seconds, state]. */
export const CHICKEN_PAUSE_STATES = Object.freeze([
  Object.freeze([4, 'idle1']),
  Object.freeze([4, 'idle1']),
  Object.freeze([4, 'idle1']),
  Object.freeze([4, 'idle2']),
  Object.freeze([4, 'idle3']),
  Object.freeze([4, 'pause']),
  Object.freeze([3, 'pecking_twice']),
  Object.freeze([2, 'pecking_once']),
]);

/** The state a Chicken takes while a player is at it (onWaitStart 1637). */
export const CHICKEN_WAIT_STATE = 'verb';

/** The packed sheet of a state (pecking_once is game.js's own chickenPeck sheet: null here). */
export function chickenIdleSheet(state) {
  return PACKED_SHEETS.chicken?.[state] || null;
}

/**
 * The state a walk's pose names: 'walk', 'stand' (the still: idle1's first frame, for a Chicken
 * something else holds) or one of CHICKEN_IDLE_FRAMES. 'peck' is the older name of pecking_once.
 */
export function chickenPoseState(pose) {
  if (pose === 'peck') return 'pecking_once';
  if (pose === 'walk' || pose === 'stand') return pose;
  return Object.hasOwn(CHICKEN_IDLE_FRAMES, pose) ? pose : 'stand';
}

/** The frame a state shows `ms` after it began: it plays once at 30 fps and holds its last frame. */
export function chickenIdleFrame(state, ms) {
  const n = CHICKEN_IDLE_FRAMES[state];
  if (!n) return 0;
  return Math.min(n - 1, Math.floor((Math.max(0, Number(ms) || 0) * CHICKEN_IDLE_FPS) / 1000));
}

/**
 * onWaitStart for a Chicken a player is at. ctx: { rooked, sad, flying, incubating }. Returns the
 * pose to show: '' leaves it as it is (rooked or sad: the source returns before touching it, so
 * its rooked or sulking clip plays on; in the air it is the flight's), 'stand' for one on an egg
 * (the source leaves its state alone; the remake draws no sit yet), else 'verb'.
 */
export function chickenWaitPose(ctx = {}) {
  if (ctx.rooked || ctx.sad || ctx.flying) return '';
  if (ctx.incubating) return 'stand';
  return CHICKEN_WAIT_STATE;
}
