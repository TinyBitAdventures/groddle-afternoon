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

/**
 * A phone draws at 1 backing px per view px. At 3 (an iPhone's DPR) the first street took
 * 2.27 GB in WebKit, past where iOS closes a tab; at 1 it took 1.0 GB, because every texture
 * scales with the resolution and the 3x character sheets stay unloaded (js/sprite-hires.js).
 */
export const PHONE_RENDER_RESOLUTION = 1;

/** Ignore changes smaller than this so window drags don't thrash the renderer. */
export const RESOLUTION_STEP = 0.05;

/**
 * The highest render resolution this device gets.
 * `device` is window.GRODDLE_DEVICE, set by the phone gate on /play/ and /play/online/
 * ("phone", "tablet" or "computer", the same signals that send a phone to the companion), so a
 * phone that took Load the full game anyway draws at PHONE_RENDER_RESOLUTION. `density` is the
 * QA override `?density=`: a number caps there (`?density=4` lifts the phone cap, `?density=1`
 * tries the phone cap on a computer); "auto" or nothing keeps the device's own cap.
 * @param {{ device?: string|null, density?: string|null }} [env]
 * @returns {number}
 */
export function resolutionCap({ device = null, density = null } = {}) {
  const asked = String(density ?? '').trim().toLowerCase();
  const n = Number(asked);
  if (asked && asked !== 'auto' && Number.isFinite(n) && n > 0) return Math.min(MAX_RENDER_RESOLUTION, Math.max(1, n));
  return device === 'phone' ? PHONE_RENDER_RESOLUTION : MAX_RENDER_RESOLUTION;
}

/**
 * @param {number} cssWidth displayed canvas width in CSS pixels
 * @param {number} viewWidth logical view width (960)
 * @param {number} dpr window.devicePixelRatio
 * @param {number} [cap] the device's top resolution (resolutionCap)
 * @returns {number}
 */
export function renderResolution(cssWidth, viewWidth, dpr = 1, cap = MAX_RENDER_RESOLUTION) {
  const css = Number(cssWidth) > 0 ? Number(cssWidth) : viewWidth;
  const ratio = Number(dpr) > 0 ? Number(dpr) : 1;
  const raw = (css / viewWidth) * ratio;
  const top = Math.min(MAX_RENDER_RESOLUTION, Math.max(1, Number(cap) || MAX_RENDER_RESOLUTION));
  const clamped = Math.min(top, Math.max(1, raw));
  const steps = Math.round(1 / RESOLUTION_STEP);
  return Math.round(clamped * steps) / steps;
}
