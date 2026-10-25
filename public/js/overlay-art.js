/**
 * Tiny Speck's overlay animations, recovered from the CC0 authoring files in
 * glitch-overlays/ by tools/overlay-art/build.mjs (register G237, G194):
 *
 * - fireworks_1/2/3 (the loneliness party, items/include/loneliness.js
 *   345-430) are vector frames, a JSON array of SVG documents
 *   (<key>.frames.json): each is 1500-2200 px across at 1:1, too big for a
 *   bitmap sheet, and the browser draws them sharp at any scale.
 * - play_glitch (the Game's Play verb, items/game_box.js 137-149) is a
 *   bitmap sheet (play_glitch@2x.png), 15 fps.
 * - overlay_sneezing_powder (Sneezing Fit's tick, catalog_buffs.js 2446-2510,
 *   from Señor Funpickle, G209) is a bitmap sheet, 30 fps.
 *
 * Placement follows the client: an overlay with no width or height shows its
 * Flash stage at 1:1, centred on the overlay point (ArbitrarySWFView scale(),
 * registration 'center'); `box` is the part of the stage the art covers.
 * Timing: the SWF's main timeline (30 fps) loops for the overlay's duration;
 * the overlay fades in over 0.2 s and out over 0.4 s, each at most a third
 * of the duration, the fade out starting at duration minus the fade in
 * (Announcement.as 149-150, AbstractAnnouncementOverlay.as 251-255, 539,
 * 686-700).
 */

export const OVERLAY_BASE = 'assets/sprites/overlays/';
export const OVERLAY_MANIFEST_URL = `${OVERLAY_BASE}overlays.json?v=g209-1`;
/** Announcement.as 149-150. */
export const OVERLAY_FADE = Object.freeze({ inMs: 200, outMs: 400 });

let manifestPromise = null;
const framePromises = new Map();

/** overlays.json, once. */
export function loadOverlayManifest() {
  manifestPromise ||= fetch(OVERLAY_MANIFEST_URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`overlays.json ${r.status}`))))
    .catch((err) => {
      manifestPromise = null;
      throw err;
    });
  return manifestPromise;
}

/** Opacity at `ms` into an overlay shown for `durationMs` (0 once it is gone). */
export function overlayAlpha(ms, durationMs, fade = OVERLAY_FADE) {
  const d = Math.max(0, Number(durationMs) || 0);
  const fin = Math.min(fade.inMs, d / 3);
  const fout = Math.min(fade.outMs, d / 3);
  const outAt = d - fin;
  if (ms < 0) return 0;
  if (fin > 0 && ms < fin) return ms / fin;
  if (ms < outAt) return 1;
  if (fout <= 0) return 0;
  return Math.max(0, 1 - (ms - outAt) / fout);
}

/** How long the overlay is on screen, fade out included. */
export function overlayLifeMs(durationMs, fade = OVERLAY_FADE) {
  const d = Math.max(0, Number(durationMs) || 0);
  return d - Math.min(fade.inMs, d / 3) + Math.min(fade.outMs, d / 3);
}

/** Timeline frame at `ms`: looping (vp_overlay SWFs) or held on the last frame. */
export function overlayFrameAt(meta, ms, { loop = true } = {}) {
  const n = Math.max(1, meta?.frames || 1);
  const f = Math.max(0, Math.floor((Math.max(0, ms) * (meta?.fps || 30)) / 1000));
  return loop ? f % n : Math.min(n - 1, f);
}

/**
 * Where the art's box lands when the stage centre sits at (cx, cy) and one
 * stage px is `scale` screen units: { left, top, width, height }.
 */
export function overlayPlacement(meta, cx, cy, scale = 1) {
  const [sw, sh] = meta.stage;
  const [bx, by, bw, bh] = meta.box;
  return { left: cx + (bx - sw / 2) * scale, top: cy + (by - sh / 2) * scale, width: bw * scale, height: bh * scale };
}

/** A sheet cell's rect, in logical (stage) px of the sheet: { x, y, w, h }. */
export function cellRect(meta, cell) {
  const w = meta.cell[0] / meta.scale;
  const h = meta.cell[1] / meta.scale;
  return { x: (cell % meta.cols) * w, y: Math.floor(cell / meta.cols) * h, w, h };
}

/** The cell a timeline frame shows (identical frames share one). */
export function sheetCell(meta, frame) {
  return cellRect(meta, meta.order[Math.max(0, Math.min(meta.order.length - 1, frame))]);
}

/** Vector frames as decoded images (blob URLs), cached per overlay. */
export function loadVectorFrames(key) {
  if (framePromises.has(key)) return framePromises.get(key);
  const p = loadOverlayManifest().then(async (manifest) => {
    const meta = manifest[key];
    if (!meta || meta.kind !== 'svg') throw new Error(`no vector overlay ${key}`);
    const res = await fetch(`${OVERLAY_BASE}${meta.file}?v=${meta.fla.slice(0, 8)}`);
    if (!res.ok) throw new Error(`${meta.file} ${res.status}`);
    const svgs = await res.json();
    const urls = svgs.map((svg) => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })));
    const imgs = await Promise.all(urls.map(async (url) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      try {
        await img.decode();
      } catch {
        /* drawn when it arrives */
      }
      return img;
    }));
    return { meta, urls, imgs };
  });
  p.catch(() => framePromises.delete(key));
  framePromises.set(key, p);
  return p;
}

/**
 * Play a vector overlay over a viewport rect inside `root` (clipped to it):
 * the stage centre at (x, y) as fractions of the rect, `scale` screen px per
 * stage px, looping for `durationMs` with the client's fades. Each frame is
 * drawn into one canvas the size of the rect (drawing a decoded SVG costs a
 * few ms; swapping an <img> between SVG frames fell behind). Resolves with
 * true once it has played, false when the art could not load.
 */
export async function playVectorOverlay(root, key, { rect, x = 0.5, y = 0.5, scale = 1, durationMs = 2000, className = 'overlay-art' } = {}) {
  if (!root || !rect || typeof document === 'undefined') return false;
  let art;
  try {
    art = await loadVectorFrames(key);
  } catch {
    return false;
  }
  const { meta, imgs } = art;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.dataset.overlay = key;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  Object.assign(canvas.style, {
    position: 'absolute', left: `${rect.left}px`, top: `${rect.top}px`, pointerEvents: 'none', opacity: '0',
  });
  // The game's stylesheet sizes canvases in #game-root; this one keeps the rect's size.
  canvas.style.setProperty('width', `${rect.width}px`, 'important');
  canvas.style.setProperty('height', `${rect.height}px`, 'important');
  canvas.style.setProperty('display', 'block', 'important');
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const at = overlayPlacement(meta, rect.width * x, rect.height * y, scale);
  const life = overlayLifeMs(durationMs);
  const t0 = performance.now();
  let shown = -1;
  await new Promise((resolve) => {
    const step = (t) => {
      const ms = t - t0;
      if (ms >= life || !canvas.isConnected) {
        resolve();
        return;
      }
      const f = overlayFrameAt(meta, ms);
      if (f !== shown && imgs[f]?.complete) {
        shown = f;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.drawImage(imgs[f], at.left, at.top, at.width, at.height);
      }
      canvas.style.opacity = String(overlayAlpha(ms, durationMs));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  canvas.remove();
  return true;
}
