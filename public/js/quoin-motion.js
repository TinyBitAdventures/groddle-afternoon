/**
 * World quoin motion. The 1x sheet bakes each quoin's bob into its 24 frames
 * as whole-pixel steps (tools/quoin-art/frames.json body.dy, sheet pixels,
 * y down). At 3x those steps read as a shake, so world quoins advance their
 * frames on their own clock and ease the bob between one frame and the next.
 * Qurazy squashes instead of bobbing and has no entry.
 */
export const QUOIN_FRAME_BOB = Object.freeze({
  xp: Object.freeze([0, 1, 2, 2, 1, 0, -1, -2, -3, -4, -5, -6, -7, -8, -9, -9, -8, -7, -6, -5, -4, -3, -3, -1]),
  mood: Object.freeze([0, -1, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0]),
  energy: Object.freeze([0, 1, 2, 3, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6, -7, -8, -8, -7, -6, -5, -4, -3, -2, -1]),
  currants: Object.freeze([0, -1, -2, -3, -4, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1]),
  mystery: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]),
  favor: Object.freeze([0, -1, -2, -3, -4, -5, -6, -7, -8, -9, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 2, 1]),
  time: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -4, -3, -2, -1]),
});

/** Sheet pixels to add at a fractional frame position so the baked bob moves smoothly. */
export function quoinBobBetweenFrames(typeId, frameClock) {
  const dy = QUOIN_FRAME_BOB[typeId];
  if (!dy || !Number.isFinite(frameClock)) return 0;
  const n = dy.length;
  const whole = Math.floor(frameClock);
  const f = ((whole % n) + n) % n;
  return (dy[(f + 1) % n] - dy[f]) * (frameClock - whole);
}

/** Advance a quoin clock (frames) by the ticker delta, wrapping at the frame count. */
export function advanceQuoinClock(clock, animationSpeed, dt, frames) {
  const next = (Number(clock) || 0) + animationSpeed * dt;
  return frames > 0 ? next % frames : next;
}
