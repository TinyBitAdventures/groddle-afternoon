/**
 * The Still on the ground plays Tiny Speck's own states (#285): still.js setAndBroadcastState
 * 'empty' (onContainerChanged, onPickup, giveHooch with too little left), 'active' (startWorking),
 * 'ready' (finishWorking when it stops) and 'collect' (verbs.collect, the 4 s before giveHooch).
 *
 * Sheets: OGA extracted_supply/glitch-assets/still/still__x1_<state>, 96x163 cells read left to
 * right, top to bottom, shipped as lossless WebP by tools/still-art/build.py (which checks the
 * frame counts here). 30 fps, as the machines' sheets: the collect clip's 119 frames last 3.97 s,
 * the collect verb's 4000 ms giveHooch timer. The body rests on y 140 of the cell, 62 px in
 * (getAssetInfo position x -35, w 68, h 100); the jug the collect clip drops falls below it.
 */

export const STILL_ART_CELL = Object.freeze({ fw: 96, fh: 163, ax: 62, ay: 140, fps: 30 });

/** The resting art's box (getAssetInfo position w, h), for the hit box. */
export const STILL_ART_BOX = Object.freeze({ w: 68, h: 100 });

export const STILL_ART = Object.freeze({
  empty: Object.freeze({ url: 'assets/sprites/machines/still-empty.webp', cols: 1, frames: 1, loop: false }),
  active: Object.freeze({ url: 'assets/sprites/machines/still-active.webp', cols: 10, frames: 99, loop: true }),
  ready: Object.freeze({ url: 'assets/sprites/machines/still-ready.webp', cols: 9, frames: 41, loop: true }),
  collect: Object.freeze({ url: 'assets/sprites/machines/still-collect.webp', cols: 10, frames: 119, loop: false }),
});

/** A sheet def for js/sprite-sheets.js createSheetLoader. */
export function stillSheetDef(state) {
  const art = STILL_ART[state] || STILL_ART.empty;
  return { path: art.url, fw: STILL_ART_CELL.fw, fh: STILL_ART_CELL.fh, cols: art.cols, frames: art.frames };
}

/**
 * Which state a Still on the ground shows: collecting wins, then working, then Hooch waiting
 * (finishWorking: 'ready'), else empty. A Still with no Hooch that stopped for want of grain is
 * 'ready' in the source too until someone collects (finishWorking always sets it); with no Hooch
 * at all it can only be one that never ran, so it is empty.
 */
export function stillArtState(state, { collecting = false, now = Date.now() } = {}) {
  if (collecting) return 'collect';
  if (state?.workingSince && state.workingSince <= now) return 'active';
  if (state?.hooch > 0) return 'ready';
  return 'empty';
}

/** The frame of `state` to show `ms` after it began: loopers loop, the rest hold their last frame. */
export function stillArtFrame(state, ms) {
  const art = STILL_ART[state] || STILL_ART.empty;
  const k = Math.max(0, Math.floor((Math.max(0, Number(ms) || 0) * STILL_ART_CELL.fps) / 1000));
  return art.loop ? k % art.frames : Math.min(art.frames - 1, k);
}
