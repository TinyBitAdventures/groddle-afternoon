/**
 * Player avatar facing helpers (pure). The avatar itself is Tiny Speck's
 * vector Glitch (js/avatar-rig.js, js/avatar-compositor.js), drawn facing
 * right; game.js flips it with these and VECTOR_AVATAR.facesRight.
 */

/**
 * scale.x for art drawn facing LEFT: flip on X when facing right so movement
 * direction matches the drawing (game.js negates this for right-facing art).
 * @param {number} baseScale  positive magnitude
 * @param {'left'|'right'} facing
 * @returns {number} scale.x including sign
 */
export function facingScaleX(baseScale, facing) {
  const mag = Math.abs(baseScale);
  // Art faces left → positive scale = left, negative = right
  return facing === 'right' ? -mag : mag;
}

/**
 * Resolve facing from horizontal velocity.
 * @param {number} vx
 * @param {'left'|'right'} [prev='right']
 */
export function facingFromVelocity(vx, prev = 'right') {
  if (vx < -0.05) return 'left';
  if (vx > 0.05) return 'right';
  return prev;
}
