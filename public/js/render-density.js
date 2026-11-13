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

/**
 * PHONE ZOOM SHARPNESS (Austin 2026-11-13: "Yes, let the phone draw sharper when zoomed in, if it
 * can handle it"): zoomed in (js/world-zoom.js phoneZoom above 0), a phone's view holds fewer world
 * px, so the same backing store can spend more of them on each: the resolution rises until the
 * canvas holds as many backing px as it did at the whole-street view (`budgetPx`, the level-0
 * view's width x height at 1), never past the screen's own density (scale x DPR) nor this cap.
 * The canvas then costs what it cost at level 0; what grows is what is drawn at the renderer's
 * resolution (text, vector overlays, filter scratch over the screen). The cap is the dial for that
 * (WebKit at 402 x 660 DPR 3, footprint sampled every half second, tools/qa/street-memory.mjs
 * --engine=webkit --phone --closeup=1 for the walk: at 1.5 the Ferncaster End to Froughtful Fen trip
 * peaked at 1.27-1.44 GB, level 0 at 1.35-1.41 GB; a fresh Froughtful Fen 1.03-1.49 GB).
 * PHONE_RENDER_RESOLUTION (resolutionCap) stays the phone's cap for art files and every street
 * bake (game.js STREET_BAKE_CAP, js/street-render.js streetBakeResolution): with the bakes
 * following the resolution the trip peaked at 1.59-2.14 GB.
 */
export const PHONE_ZOOM_RESOLUTION_CAP = 1.5;

/**
 * PURE: the phone's render resolution for a view of viewW x viewH world px shown cssWidth CSS px
 * wide: min(scale x DPR, sqrt(budgetPx / (viewW x viewH)), cap), never under 1, on the
 * RESOLUTION_STEP grid (rounded down, so the budget always holds).
 */
export function phoneZoomResolution({ cssWidth, viewW, viewH, dpr = 1, budgetPx, cap = PHONE_ZOOM_RESOLUTION_CAP } = {}) {
  const w = Number(viewW);
  const h = Number(viewH);
  const budget = Number(budgetPx);
  if (!(w > 0) || !(h > 0) || !(budget > 0)) return 1;
  const css = Number(cssWidth) > 0 ? Number(cssWidth) : w;
  const screen = (css / w) * (Number(dpr) > 0 ? Number(dpr) : 1);
  const fit = Math.sqrt(budget / (w * h));
  const top = Math.min(MAX_RENDER_RESOLUTION, Number(cap) >= 1 ? Number(cap) : 1);
  const steps = Math.round(1 / RESOLUTION_STEP);
  return Math.max(1, Math.floor(Math.min(screen, fit, top) * steps + 1e-9) / steps);
}
