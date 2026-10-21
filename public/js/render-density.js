/**
 * How many backing-store pixels the Pixi canvas draws per world pixel.
 *
 * The world is always laid out in a 960x540 view, but CSS stretches the
 * canvas to the window. A fixed `devicePixelRatio` backing store is then
 * upscaled a second time by the browser, so on a 1600px Retina window
 * everything was resampled 1.64x after Pixi drew it. Matching the backing
 * store to the canvas's displayed size draws text, vectors and the 2x deco
 * art at the screen's real density instead.
 */

/** 3840 backing pixels across: 4K at the 960px view, plenty for any laptop. */
export const MAX_RENDER_RESOLUTION = 4;

/** Ignore changes smaller than this so window drags don't thrash the renderer. */
export const RESOLUTION_STEP = 0.05;

/**
 * @param {number} cssWidth displayed canvas width in CSS pixels
 * @param {number} viewWidth logical view width (960)
 * @param {number} dpr window.devicePixelRatio
 * @returns {number}
 */
export function renderResolution(cssWidth, viewWidth, dpr = 1) {
  const css = Number(cssWidth) > 0 ? Number(cssWidth) : viewWidth;
  const ratio = Number(dpr) > 0 ? Number(dpr) : 1;
  const raw = (css / viewWidth) * ratio;
  const clamped = Math.min(MAX_RENDER_RESOLUTION, Math.max(1, raw));
  const steps = Math.round(1 / RESOLUTION_STEP);
  return Math.round(clamped * steps) / steps;
}
