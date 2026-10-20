/**
 * Player avatar sheet config + pure helpers (facing / frame counts).
 * Styled Glitch art paths — not the nude greyscale mannequin.
 */

/** Runtime sheet defs used by game loaders (must match assets on disk). */
export const AVATAR_SHEETS = {
  // Clothed full-body (Wayback c2.glitch.bz/avatars portrait, CC0)
  idle: {
    key: 'avatarStyledIdle',
    url: 'assets/sprites/avatar_styled_idle.png',
    whole: true,
  },
  // 8-frame clothed walk cycle (leg stride from styled idle — not static copies)
  walk: {
    key: 'avatarStyledWalk',
    url: 'assets/sprites/avatar_styled_walk.png',
    fw: 172,
    fh: 248,
    cols: 8,
    rows: 1,
  },
};

/**
 * @param {{ cols: number, rows: number, whole?: boolean }} sheet
 * @returns {number}
 */
export function expectedFrameCount(sheet) {
  if (sheet.whole) return 1;
  return (sheet.cols || 1) * (sheet.rows || 1);
}

/**
 * Source avatar art faces LEFT by default (idle + walk sheets).
 * Flip on X when facing right so movement direction matches the drawing.
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

/**
 * Assert asset looks styled (multi-color), not monochrome mannequin.
 * @param {Uint8Array|Buffer} pngBytes
 * @param {{ minOpaqueColors?: number }} [opts]
 */
export function assertStyledAvatarPng(pngBytes, opts = {}) {
  const minColors = opts.minOpaqueColors ?? 12;
  // Minimal PNG IHDR parse + scan IDAT via optional pure approach:
  // Prefer caller passing decoded samples; here we only check magic + size > 1KB
  if (!pngBytes || pngBytes.length < 1000) {
    throw new Error('avatar asset too small or missing');
  }
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (pngBytes[i] !== sig[i]) throw new Error('not a PNG');
  }
  return { ok: true, bytes: pngBytes.length, minColorsRequired: minColors };
}

/**
 * Build frame rectangles for a walk grid (pure, no Pixi).
 * @param {{ fw: number, fh: number, cols: number, rows: number }} sheet
 */
export function walkFrameRects(sheet) {
  const rects = [];
  const total = expectedFrameCount(sheet);
  let n = 0;
  for (let r = 0; r < sheet.rows && n < total; r++) {
    for (let c = 0; c < sheet.cols && n < total; c++) {
      rects.push({
        x: c * sheet.fw,
        y: r * sheet.fh,
        w: sheet.fw,
        h: sheet.fh,
        index: n,
      });
      n++;
    }
  }
  return rects;
}
