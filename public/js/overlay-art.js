/**
 * Tiny Speck's overlay animations, recovered from the CC0 authoring files in
 * glitch-overlays/ by tools/overlay-art/build.mjs (register G237, G194,
 * G251):
 *
 * - fireworks_1/2/3 (the loneliness party, items/include/loneliness.js
 *   345-430) are vector frames (<key>.frames.json: the SVG of each frame,
 *   the outlines and gradient ramps they share kept once, assembleFrames):
 *   each is 1500-2200 px across at 1:1, too big for a bitmap sheet, and the
 *   browser draws them sharp at any scale.
 * - play_glitch (the Game's Play verb, items/game_box.js 137-149) is a
 *   bitmap sheet (play_glitch@2x.webp), 15 fps.
 * - overlay_sneezing_powder (Sneezing Fit's tick, catalog_buffs.js 2446-2510,
 *   from Señor Funpickle, G209) is a bitmap sheet, 30 fps.
 * - G251, WebP sheets played in the world by playSheetOverlay: the Rook
 *   fight's focusing_orb_laser_beam and shrine_laser_beam_1/2/3, the
 *   rainbow_youdidit / rainbow_fullyrevived / rainbow_secretspot arcs, the
 *   smoke_puff a critter vanishes in and proto_puff (a box opening).
 * - G272/G273: rainbow_winner (a race win), poisoned (a poisoned tree),
 *   rooked (a fallen swoonerfly), and two overlays with states (the
 *   client's annc.state, a frame label the SWF's start() jumps to):
 *   secret_location_marker (active, off) and the stun orb
 *   focusing_orb_attack (orb1-4, orbBreak). play_glitch and the sneeze are
 *   WebP sheets now.
 *
 * Placement follows the client (ArbitrarySWFView.as 312-343 scale()): with no
 * width or height the Flash stage shows at 1:1, else it is fitted into a
 * square of the larger of the two. A window overlay (vp_overlay) is centred
 * on its point (overlayPlacement); an overlay in the street (pc_overlay,
 * itemstack_overlay, location_overlay) stands on it, registration
 * 'center_bottom' (InLocationAnnouncementOverlay.as 448, standPlacement).
 * `box` is the part of the stage the art covers.
 * Timing: the SWF's main timeline (30 fps) loops for the overlay's duration
 * unless it stop()s; the overlay fades in over 0.2 s and out over 0.4 s,
 * each at most a third of the duration, the fade out starting at duration
 * minus the fade in (Announcement.as 149-150, AbstractAnnouncementOverlay.as
 * 251-255, 539, 686-700).
 */

import { frameTexture, sourceFromUrl } from './textures.js';

export const OVERLAY_BASE = 'assets/sprites/overlays/';
export const OVERLAY_MANIFEST_URL = `${OVERLAY_BASE}overlays.json?v=g299-1`;
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

/**
 * An overlay in the street (InLocationAnnouncementOverlay.as 448, registration
 * 'center_bottom'): the stage fitted into a wh square (wh = the larger of the
 * announcement's width and height, 0 for 1:1), its bottom centre on (x, y),
 * then multiplied by `zoom` about that point (an overlay_scale message,
 * AbstractAnnouncementOverlay.as 162-166). { left, top, width, height, scale }.
 */
export function standPlacement(meta, x, y, wh = 0, zoom = 1) {
  const [sw, sh] = meta.stage;
  const [bx, by, bw, bh] = meta.box;
  const scale = (wh > 0 ? wh / Math.max(sw, sh) : 1) * zoom;
  const left = x - (sw * scale) / 2;
  const top = y - sh * scale;
  return { left: left + bx * scale, top: top + by * scale, width: bw * scale, height: bh * scale, scale };
}

/**
 * A stack's display top in world px (LocationItemstackView.as 633-655
 * getYAboveDisplay: the top of its art), from a Pixi sprite or container.
 */
export function displayTopOf(spr) {
  if (!spr) return 0;
  const b = spr.getLocalBounds?.();
  const minY = b ? (b.minY ?? b.y) : null;
  return Number.isFinite(minY) ? spr.y + minY * (spr.scale?.y ?? 1) : (spr.y || 0) - (spr.height || 0);
}

/** Where an itemstack_overlay stands: the stack's display top plus delta_y (InLocationAnnouncementOverlay.as 74-110). */
export function itemstackOverlayPoint(x, displayTop, { dx = 0, dy = 0 } = {}) {
  return { x: x + dx, y: displayTop + dy };
}

/** Tweener easeOutBack (overlay_scale tweens, AbstractAnnouncementOverlay.as 165). */
export function easeOutBack(t, s = 1.70158) {
  const u = Math.max(0, Math.min(1, t)) - 1;
  return u * u * ((s + 1) * u + s) + 1;
}

/** A sheet cell's rect, in logical (stage) px of the sheet: { x, y, w, h }. */
export function cellRect(meta, cell) {
  const w = meta.cell[0] / meta.scale;
  const h = meta.cell[1] / meta.scale;
  return { x: (cell % meta.cols) * w, y: Math.floor(cell / meta.cols) * h, w, h };
}

/**
 * The timeline frame a state shows `ms` after it began (G273): its frames
 * run from meta.states[state].from, looping or held on the last. Without
 * states (or an unknown state) the whole timeline, `loop` as given.
 */
export function stateFrameAt(meta, state, ms, { loop = true } = {}) {
  const st = state ? meta?.states?.[state] : null;
  if (!st) return overlayFrameAt(meta, ms, { loop });
  return st.from + overlayFrameAt({ frames: st.frames, fps: meta.fps }, ms, { loop: st.loop });
}

/** The cell a timeline frame shows (identical frames share one). */
export function sheetCell(meta, frame) {
  return cellRect(meta, meta.order[Math.max(0, Math.min(meta.order.length - 1, frame))]);
}

/**
 * The SVG text of each vector frame from a <key>.frames.json: an array of
 * whole SVGs, or { defs, frames } with the outlines and gradient ramps the
 * frames share kept once (tools/overlay-art/build.mjs shareFrames, G251),
 * put back into each frame's <defs>.
 */
export function assembleFrames(data) {
  if (Array.isArray(data)) return data;
  const defs = String(data?.defs || '');
  return (data?.frames || []).map((f) => (f.includes('<defs>') ? f.replace('<defs>', `<defs>${defs}`) : f.replace(/^(<svg[^>]*>)/, `$1<defs>${defs}</defs>`)));
}

/** Vector frames as decoded images (blob URLs), cached per overlay. */
export function loadVectorFrames(key) {
  if (framePromises.has(key)) return framePromises.get(key);
  const p = loadOverlayManifest().then(async (manifest) => {
    const meta = manifest[key];
    if (!meta || meta.kind !== 'svg') throw new Error(`no vector overlay ${key}`);
    const res = await fetch(`${OVERLAY_BASE}${meta.file}?v=${meta.fla.slice(0, 8)}`);
    if (!res.ok) throw new Error(`${meta.file} ${res.status}`);
    const svgs = assembleFrames(await res.json());
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
 * the stage centre at (x, y) as fractions of the rect (or its top edge at
 * `topY`, an announcement's top_y), `scale` screen px per stage px, looping
 * (or held on its last frame, `loop: false`) for `durationMs` with the
 * client's fades (`fade`: { inMs, outMs }, fade_in_sec / fade_out_sec). Each frame is
 * drawn into one canvas the size of the rect (drawing a decoded SVG costs a
 * few ms; swapping an <img> between SVG frames fell behind). Resolves with
 * true once it has played, false when the art could not load.
 */
export async function playVectorOverlay(root, key, { rect, x = 0.5, y = 0.5, topY = null, scale = 1, durationMs = 2000, fade = OVERLAY_FADE, loop = true, className = 'overlay-art' } = {}) {
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
    position: 'absolute', left: `${rect.left}px`, top: `${rect.top}px`, pointerEvents: 'none', opacity: '0', zIndex: '70',
  });
  // The game's stylesheet sizes canvases in #game-root; this one keeps the rect's size.
  canvas.style.setProperty('width', `${rect.width}px`, 'important');
  canvas.style.setProperty('height', `${rect.height}px`, 'important');
  canvas.style.setProperty('display', 'block', 'important');
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  // top_y (InWindowAnnouncementOverlay.as 286-295): the stage's top edge at that fraction, not its centre.
  const cy = topY == null ? rect.height * y : rect.height * topY + (meta.stage[1] * scale) / 2;
  const at = overlayPlacement(meta, rect.width * x, cy, scale);
  const life = overlayLifeMs(durationMs, fade);
  const t0 = performance.now();
  let shown = -1;
  await new Promise((resolve) => {
    const step = (t) => {
      const ms = t - t0;
      if (ms >= life || !canvas.isConnected) {
        resolve();
        return;
      }
      const f = overlayFrameAt(meta, ms, { loop });
      if (f !== shown && imgs[f]?.complete) {
        shown = f;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.drawImage(imgs[f], at.left, at.top, at.width, at.height);
      }
      canvas.style.opacity = String(overlayAlpha(ms, durationMs, fade));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  canvas.remove();
  return true;
}

/* ------------------------------------------------------------------ */
/* Sheets in the street (Pixi)                                          */
/* ------------------------------------------------------------------ */

const sheetFrames = new Map(); // `${key}:${cell}` -> Texture

/** The Texture of one sheet cell (cut once per overlay and cell). */
export function sheetTexture(PIXI, key, meta, cell) {
  const id = `${key}:${cell}`;
  let t = sheetFrames.get(id);
  if (!t || t.destroyed) {
    const c = cellRect(meta, cell);
    t = frameTexture(sourceFromUrl(`${OVERLAY_BASE}${meta.file}?v=${meta.fla.slice(0, 8)}`), new PIXI.Rectangle(c.x, c.y, c.w, c.h));
    sheetFrames.set(id, t);
  }
  return t;
}

/**
 * Play a sheet overlay in the street (pc_, itemstack_ or location_overlay):
 * a Pixi sprite on `layer`, standing on `at()` (world px, re-read every frame
 * so it can follow an avatar or a stack), fitted to `wh`, zoomed by
 * `zoomAt(ms)`, its timeline looping (or held on the last frame when the SWF
 * stop()s: `loop: false`) for `durationMs` with the client's fades, after
 * `delayMs`. `holdMs` freezes it at that moment for screenshots (it never
 * ends). `state` plays one of the overlay's states (G273), and
 * handle.setState(name) switches to another, from its start, the way a new
 * annc.state restarts the clip on its label. Returns { sprite, stop(),
 * setState(), done } (done resolves true once played, false when the art is
 * missing or it was stopped).
 */
export function playSheetOverlay(PIXI, key, { layer, at, wh = 0, zoomAt = null, durationMs = 2000, loop = true, delayMs = 0, holdMs = null, zIndex = 60, state = null } = {}) {
  const handle = {
    sprite: null,
    stopped: false,
    done: null,
    state,
    stateAt: null,
    stop() { handle.stopped = true; },
    setState(name) {
      if (name === handle.state) return;
      handle.state = name;
      handle.stateAt = null;
    },
  };
  const raf = globalThis.requestAnimationFrame;
  if (!PIXI?.Sprite || !layer || typeof at !== 'function' || typeof raf !== 'function') {
    handle.done = Promise.resolve(false);
    return handle;
  }
  const clock = () => globalThis.performance?.now?.() ?? Date.now();
  const startAt = clock() + Math.max(0, Number(delayMs) || 0);
  handle.done = loadOverlayManifest().then((manifest) => new Promise((resolve) => {
    const meta = manifest?.[key];
    if (!meta || meta.kind !== 'sheet' || handle.stopped || layer.destroyed) {
      resolve(false);
      return;
    }
    const sprite = new PIXI.Sprite(sheetTexture(PIXI, key, meta, meta.order[0]));
    sprite.eventMode = 'none';
    sprite.zIndex = zIndex;
    sprite.alpha = 0;
    sprite.visible = false;
    sprite.label = `overlay:${key}`;
    layer.addChild(sprite);
    handle.sprite = sprite;
    const life = overlayLifeMs(durationMs);
    const finish = (ok) => {
      if (!sprite.destroyed) sprite.destroy();
      resolve(ok);
    };
    const step = () => {
      if (sprite.destroyed || handle.stopped) {
        finish(false);
        return;
      }
      const real = clock() - startAt;
      const ms = holdMs != null ? holdMs : real;
      if (holdMs == null && ms >= life) {
        finish(true);
        return;
      }
      if (ms >= 0) {
        const p = at();
        if (handle.stateAt == null) handle.stateAt = ms;
        const frame = handle.state ? stateFrameAt(meta, handle.state, holdMs != null ? holdMs : ms - handle.stateAt) : overlayFrameAt(meta, ms, { loop });
        const cell = meta.order[Math.min(meta.order.length - 1, frame)];
        sprite.texture = sheetTexture(PIXI, key, meta, cell);
        const place = standPlacement(meta, p.x, p.y, wh, zoomAt ? zoomAt(ms) : 1);
        sprite.x = place.left;
        sprite.y = place.top;
        sprite.width = place.width;
        sprite.height = place.height;
        sprite.alpha = holdMs != null ? 1 : overlayAlpha(ms, durationMs);
        sprite.visible = true;
      }
      raf(step);
    };
    raf(step);
  })).catch(() => false);
  return handle;
}

/**
 * poof_in (locations/location.js 2054-2071 createItemStackWithPoof; the
 * client's LocationItemstackView.as 738-769 poofItIn): proto_puff (or the
 * given overlay) as an itemstack_overlay for 2 s, place_at_bottom with
 * delta_y = stage height / 2 - item height / 2, so the puff is centred on the
 * new stack, while the stack fades in over 1 s after 0.2 s. `bottom` is the
 * stack's bottom in world px. Returns the playSheetOverlay handle.
 */
export const POOF_IN = Object.freeze({ key: 'proto_puff', durationMs: 2000, fadeInDelayMs: 200, fadeInMs: 1000 });

export function playPoofIn(PIXI, { layer, x, bottom, itemH = 0, key = POOF_IN.key, zIndex = 70 } = {}) {
  let dy = 0;
  loadOverlayManifest()
    .then((m) => { dy = (m?.[key]?.stage?.[1] || 0) / 2 - itemH / 2; })
    .catch(() => {});
  return playSheetOverlay(PIXI, key, { layer, at: () => ({ x, y: bottom + dy }), durationMs: POOF_IN.durationMs, loop: false, zIndex });
}

/** The new stack's alpha `ms` after it poofs in (0 for 0.2 s, then up over 1 s). */
export function poofInAlpha(ms) {
  return Math.max(0, Math.min(1, (ms - POOF_IN.fadeInDelayMs) / POOF_IN.fadeInMs));
}
