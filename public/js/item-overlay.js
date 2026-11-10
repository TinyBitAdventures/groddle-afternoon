/**
 * An item playing one of its own states over an avatar or a thing in the street: the client's
 * announcement with an `item_class` (a potion's bottle pouring, a powder's shaker, a Scraper at a
 * Barnacle), drawn from a packed sheet (js/packed-sheets.js, js/packed-sheets-data.js).
 *
 * How the client drew it (glitch-client, CC0):
 *   InLocationAnnouncementOverlay.as 425-441: with an item_class the art is an ItemIconView of
 *   that item in annc.state, sized max(annc.width, annc.height), registration 'center_bottom'.
 *   ItemIconView.as 311-349: with a size the frame is scaled so its longer side is that size
 *   (else it is drawn 1:1), centred across and standing on the overlay's point.
 *   InLocationAnnouncementOverlay.as 74-128: the point is the avatar's feet, or the stack's x and
 *   the top of its art (getYAboveDisplay), plus delta_x and delta_y.
 *   Announcement.as 281-285: a state that begins with '-' is that state mirrored (h_flipped).
 *   SSCollection.as 116-131: tool_animation always loops; another state loops only if the SWF's
 *   `loopers` names it, else it stops on its last frame. 30 frames a second (TSEngineConstants.as 6).
 *   The overlay fades in over 0.2 s and out over 0.4 s (js/overlay-art.js overlayAlpha).
 * Not recovered: ItemIconView.as 337-341 nudges a tool_animation by the item's tool_anim_offset_x
 * and _y styles, scaled by size / 40. The style sheet came from the server and is not in the
 * archive, so no nudge is applied.
 *
 * Memory: a sheet is fetched when first played and only the last KEEP_SHEETS are kept decoded;
 * an older one nobody is playing is destroyed (its 3x twin too) and fetched again if wanted.
 */

import { OVERLAY_FADE, overlayAlpha, overlayLifeMs, trackOverlay } from './overlay-art.js?v=75c3ea34';
import { cutPackedFrames, packedFrameAt } from './packed-sheets.js?v=ad5e6b30';
import { upgradeSource } from './sprite-hires.js?v=84018f88';
import { forgetTexture, loadTexture, whenLoaded } from './textures.js?v=f024bd6a';

/** Decoded sheets kept after their overlay ends. */
export const KEEP_SHEETS = 2;

/**
 * PURE: where the art stands and how big, as ItemIconView lays it out. `cell` is the frame's
 * [w, h]; `wh` the announcement's size (0: 1:1); (x, y) the overlay's point. Returns the bottom
 * centre, the scale, and the box { left, top, width, height } the frame covers.
 */
export function itemOverlayPlacement(cell, x, y, wh = 0) {
  const [w, h] = cell;
  const scale = wh > 0 ? wh / Math.max(w, h) : 1;
  return { x, y, scale, left: x - (w * scale) / 2, top: y - h * scale, width: w * scale, height: h * scale };
}

/** PURE: the overlay's point over an avatar (pc_overlay): its feet plus the deltas. */
export function pcOverlayPoint(player, { dx = 0, dy = 0 } = {}) {
  return { x: (Number(player?.x) || 0) + dx, y: (Number(player?.y) || 0) + dy };
}

/** path -> { path, promise, source, frames, refs, usedAt } */
const held = new Map();
let stamp = 0;

function evict(entry) {
  held.delete(entry.path);
  for (const t of new Set(entry.frames || [])) {
    // Texture.EMPTY (an empty frame) is Pixi's own: never destroyed.
    if (t && !t.destroyed && t.source === entry.source) t.destroy(false);
  }
  forgetTexture(entry.path);
  const source = entry.source;
  if (source && !source.destroyed) {
    const bitmap = source.resource;
    source.destroy();
    bitmap?.close?.();
  }
}

function trim() {
  const idle = [...held.values()].filter((e) => e.refs <= 0 && e.frames).sort((a, b) => a.usedAt - b.usedAt);
  while (held.size > KEEP_SHEETS && idle.length) evict(idle.shift());
}

function hold(PIXI, def) {
  let entry = held.get(def.path);
  if (!entry) {
    entry = { path: def.path, refs: 0, usedAt: 0, frames: null, source: null, promise: null };
    const e = entry;
    e.promise = loadTexture(def.path, { raw: true }).then((texture) => {
      e.source = texture.source;
      e.frames = cutPackedFrames(PIXI, texture.source, def);
      // The 3x twin, now that it is about to be drawn.
      upgradeSource(texture.source, def.path, whenLoaded);
      return e;
    }).catch(() => {
      if (held.get(def.path) === e) held.delete(def.path);
      return null;
    });
    held.set(def.path, entry);
  }
  entry.refs += 1;
  stamp += 1;
  entry.usedAt = stamp;
  return entry;
}

function drop(entry) {
  entry.refs -= 1;
  trim();
}

/** The sheets decoded now and how many overlays hold each (QA: groddleQA.itemOverlays()). */
export function itemOverlayStats() {
  return [...held.values()].map((e) => ({ path: e.path, loaded: Boolean(e.frames), refs: e.refs, resolution: e.source?.resolution ?? 0, pixelWidth: e.source?.pixelWidth ?? 0, pixelHeight: e.source?.pixelHeight ?? 0 }));
}

/**
 * Play `def` (a packed sheet row) on `layer`, standing on `at()` (world px, read every frame so
 * it follows an avatar or a walking animal), fitted to `wh` (0: 1:1), mirrored when `flipped`,
 * for `durationMs` with the client's fades. It loops if def.loop (pass `loop` to say otherwise).
 * `holdMs` freezes it at that moment for screenshots (it never ends). `onFrame(frame, ms)` is
 * told each new frame (QA). Returns { sprite, stop(), done, cancelled, frame }: `done` resolves
 * true once played, false when the art is missing, it was stopped, or a street change cancelled it.
 */
export function playItemOverlay(PIXI, def, { layer, at, wh = 0, flipped = false, durationMs = 2500, loop = def?.loop, zIndex = 900, holdMs = null, label = '', fade = OVERLAY_FADE, onFrame = null } = {}) {
  const handle = {
    sprite: null,
    stopped: false,
    cancelled: false,
    frame: -1,
    done: null,
    stop() { handle.stopped = true; },
    cancel() {
      handle.cancelled = true;
      if (handle.sprite && !handle.sprite.destroyed) handle.sprite.visible = false;
    },
  };
  const raf = globalThis.requestAnimationFrame;
  if (!PIXI?.Sprite || !def || !layer || typeof at !== 'function' || typeof raf !== 'function') {
    handle.done = Promise.resolve(false);
    return handle;
  }
  const release = trackOverlay(() => handle.cancel());
  const clock = () => globalThis.performance?.now?.() ?? Date.now();
  const startAt = clock();
  const entry = hold(PIXI, def);
  const row = { ...def, loop: Boolean(loop) };
  handle.done = entry.promise.then((ready) => new Promise((resolve) => {
    if (!ready?.frames?.length || handle.stopped || handle.cancelled || layer.destroyed) {
      resolve(false);
      return;
    }
    const sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
    sprite.anchor.set(0.5, 1);
    sprite.eventMode = 'none';
    sprite.zIndex = zIndex;
    sprite.alpha = 0;
    sprite.visible = false;
    sprite.label = label || `item-overlay:${def.path.split('/').pop()}`;
    layer.addChild(sprite);
    handle.sprite = sprite;
    const life = overlayLifeMs(durationMs, fade);
    const finish = (ok) => {
      if (!sprite.destroyed) sprite.destroy();
      resolve(ok);
    };
    const step = () => {
      if (sprite.destroyed || handle.stopped || handle.cancelled) {
        finish(false);
        return;
      }
      const ms = holdMs != null ? holdMs : clock() - startAt;
      if (holdMs == null && ms >= life) {
        finish(true);
        return;
      }
      const frame = packedFrameAt(row, ms);
      if (frame !== handle.frame) {
        handle.frame = frame;
        sprite.texture = ready.frames[frame] || PIXI.Texture.EMPTY;
        onFrame?.(frame, ms);
      }
      const p = at();
      const place = itemOverlayPlacement(def.cell, p.x, p.y, wh);
      sprite.x = place.x;
      sprite.y = place.y;
      sprite.scale.set((flipped ? -1 : 1) * place.scale, place.scale);
      sprite.alpha = holdMs != null ? 1 : overlayAlpha(ms, durationMs, fade);
      sprite.visible = true;
      raf(step);
    };
    raf(step);
  })).catch(() => false);
  handle.done.then(() => {
    release();
    drop(entry);
  });
  return handle;
}
