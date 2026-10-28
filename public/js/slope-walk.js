/**
 * Walking down slopes (Baby Steppes, 2026-10-28: "walking down the hill looks choppy").
 *
 * The remake adds gravity every frame and puts the feet back on a floor only
 * when they reach or pass it, calling the avatar airborne once they float more
 * than 2 px above it. Walking down a slope the floor drops |vx| * slope under
 * the feet each frame (4.4 px across a 0.36 slope: 1.58 px), faster than a
 * frame or two of gravity, so the avatar floated up to 2.2 px off the line,
 * left the floor for 4 of every 7 frames and dropped back, and the animation
 * flashed the jump's land frame and restarted the walk cycle every 7 frames.
 *
 * The original client (AvatarPhysicsHandler.as) turns gravity off on the floor
 * (updateAvatarVelocities: vy = -0.01 "keeps you from sliding down slopes") and
 * finds the floor with a 0.5 px band round its foot circle (solver), so its
 * avatar also stepped down slopes in falls ("to intercept 'step' falls from
 * sloped platforms", applyAvatarPhysicsToSelf). It hid them in the animation:
 * AvatarAnimationState.calcAnimationStateFromAPO keeps the current state while
 * the falling avatar is within close_limit of the floor ("when we're very
 * close to the platform, don't change current state"). The remake keeps that
 * rule (holdCloseToFloor) and also keeps a walking avatar on the slope.
 */

import { CLOSE_LIMIT_PERC, LAND_LIMIT_PERC } from './avatar-anims.js';

/** Steepest descent a walking avatar stays on: 1 px down per px across (45 degrees, 99.7% of street platforms). */
export const SLOPE_STICK = 1;

/** game.js's floor tolerance: feet within 2 px over a floor still stand on it. */
const FLOOR_SLACK = 2;

/**
 * Whether a walking avatar that was on the floor at the start of this frame
 * goes back onto the floor below its feet: only while it is not rising (a
 * jump leaves the floor first) and only when the floor fell away by no more
 * than a walkable slope does over this frame's step. Walking off a ledge drops
 * further than that and falls as before.
 * @param {{ wasGrounded: boolean, vy: number, dx: number, feetY: number, groundY: number|null, slope?: number }} s
 */
export function stickToSlope({ wasGrounded, vy, dx, feetY, groundY, slope = SLOPE_STICK }) {
  if (wasGrounded !== true || !(vy >= 0) || !Number.isFinite(groundY) || !Number.isFinite(feetY)) return false;
  const drop = groundY - feetY;
  return drop > 0 && drop <= Math.abs(Number(dx) || 0) * slope + FLOOR_SLACK;
}

/**
 * AvatarAnimationState's close_limit rule for a falling avatar: within
 * land_limit * close_limit_perc of the floor (land_limit = 30% of the fall
 * speed in px/s) the current state stays, whatever it is, so a short step
 * down a slope or a ledge keeps the walk cycle instead of flashing land.
 * avatar-anims.js avatarAnimState already holds land, fall and lift.
 * @param {string} state the state avatarAnimState picked
 * @param {string} last the state on screen
 * @param {{ airborne?: boolean, vy?: number, distFromFloor?: number|null }} s  vy in px/s
 */
export function holdCloseToFloor(state, last, s) {
  if (!s?.airborne || !last) return state;
  const vy = Number(s.vy) || 0;
  if (vy < 0 || s.distFromFloor == null) return state;
  return s.distFromFloor < vy * LAND_LIMIT_PERC * CLOSE_LIMIT_PERC ? last : state;
}
