/**
 * The Butler, part by part: paints bag_butler.swf's butlerDoll (flattened by
 * tools/avatar-compositor/butler.mjs into assets/butler-rig/butler.json) with
 * the avatar compositor's Canvas2D painter, at any frame and any scale.
 *
 * The doll has 1082 frames; a sheet per look at 3x would be hundreds of MB,
 * so the game paints the current frame into one small canvas instead
 * (ButlerPainter) and re-uploads it when the frame changes.
 *
 * parts = { accessory, bod, skull, face, closeArm, farArm, closeLeg, farLeg },
 * the GSJS instance props (bag_butler.js make_config), e.g. { accessory: '10',
 * bod: 'body10', skull: 'skull10', face: 'face10', closeArm: '10', ... }.
 */
import { paintItems } from './avatar-compositor.js';

export const BUTLER_RIG_URL = 'assets/butler-rig/butler.json';
/** Backing pixels per world pixel for the in-game Butler. */
export const BUTLER_RIG_SCALE = 3;
/**
 * The doll point that stands on the ground, in doll units: the sole of the
 * idle0 pose (tools/avatar-compositor/butler-score.mjs measures it against
 * the recovered OGA sheets).
 */
export const BUTLER_FEET = Object.freeze({ x: 0, y: 52 });

/** Doll container -> the config option that fills it and the class a value attaches (bag_butler.as initializehead). */
const SLOT_CLASS = Object.freeze({
  farArmUpper: (p) => `farArmUpper${p.farArm}`,
  farArmLower: (p) => `farArmLower${p.farArm}`,
  farLegLower: (p) => `farLegLower${p.farLeg}`,
  farLegUpper: (p) => `farLegUpper${p.farLeg}`,
  bod: (p) => p.bod,
  skull: (p) => p.skull,
  face: (p) => p.face,
  closeLegLower: (p) => `closeLegLower${p.closeLeg}`,
  accessoryUnder: (p) => `accessoryUnder${p.accessory}`,
  closeLegUpper: (p) => `closeLegUpper${p.closeLeg}`,
  closeArmUpper: (p) => `closeArmUpper${p.closeArm}`,
  accessoryOver: (p) => `accessoryOver${p.accessory}`,
  closeArmLower: (p) => `closeArmLower${p.closeArm}`,
});

function mul(p, c) {
  return [
    p[0] * c[0] + p[2] * c[1], p[1] * c[0] + p[3] * c[1],
    p[0] * c[2] + p[2] * c[3], p[1] * c[2] + p[3] * c[3],
    p[0] * c[4] + p[2] * c[5] + p[4], p[1] * c[4] + p[3] * c[5] + p[5],
  ];
}

let rigPromise = null;
let loadedRig = null;
/** The rig (cached): butler.json plus a paint source for its shapes. */
export function loadButlerRig(url = BUTLER_RIG_URL) {
  if (!rigPromise) {
    rigPromise = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    }).then((rig) => {
      rig.sources = new Map([['butler', { shapes: rig.shapes, bitmaps: new Map() }]]);
      loadedRig = rig;
      return rig;
    }).catch((err) => {
      rigPromise = null;
      throw err;
    });
  }
  return rigPromise;
}

/** The rig if it has loaded, else null (starts the load). */
export function butlerRigNow() {
  if (!loadedRig && typeof fetch !== 'undefined') loadButlerRig().catch(() => {});
  return loadedRig;
}

/** [first doll frame, frame count] of an animation label. */
export function clipRange(rig, clip) {
  return rig.labels[clip] || rig.labels.idle0;
}

/** Draw items for 1-based doll frame n (paintItems format). */
export function drawList(rig, parts, n) {
  const f = Math.max(1, Math.min(rig.frames.length, Math.round(n)));
  const pose = rig.poses[rig.frames[f - 1]];
  const items = [];
  rig.slots.forEach((slot, i) => {
    const cls = SLOT_CLASS[slot]?.(parts);
    const part = cls && rig.parts[cls];
    if (!part) return;
    const ops = Array.isArray(part) ? part : part.variants[part.frames[f - 1]];
    for (const o of ops) items.push({ src: 'butler', s: o.s, m: mul(pose[i], o.m), a: o.a });
  });
  return items;
}

/** Paint doll frame n into ctx with device transform base. */
export function paintFrame(ctx, rig, parts, n, base) {
  paintItems(ctx, drawList(rig, parts, n), rig.sources, base);
}

/**
 * One frame on a canvas, fitted to `box` (doll units, default the clip's
 * box) and standing on the canvas bottom: dialog portraits and previews.
 */
export function paintPortrait(rig, parts, canvas, { clip = 'idle0', frame = 0, pad = 4, flip = false, box = null } = {}) {
  const [first] = clipRange(rig, clip);
  const b = box || rig.box[clip] || rig.box.idle0;
  const w = canvas.width;
  const h = canvas.height;
  const s = Math.min((w - 2 * pad) / (b[2] - b[0]), (h - 2 * pad) / (b[3] - b[1]));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cx = (b[0] + b[2]) / 2;
  paintFrame(ctx, rig, parts, first + frame, [flip ? -s : s, 0, 0, s, w / 2 - cx * s * (flip ? -1 : 1), h - pad - b[3] * s]);
  return canvas;
}

const portraitCache = new Map();
/** A PNG data URL of the standing Butler (award icons, dialog portraits). */
export function portraitUrl(rig, parts, { w = 148, h = 168 } = {}) {
  const key = `${JSON.stringify(parts)}:${w}x${h}`;
  if (portraitCache.has(key)) return portraitCache.get(key);
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const url = paintPortrait(rig, parts, c).toDataURL('image/png');
  if (portraitCache.size > 40) portraitCache.clear();
  portraitCache.set(key, url);
  return url;
}

/**
 * The in-game Butler: one canvas sized to the playing clip's box at `scale`,
 * repainted only when the frame changes. Feed `canvas` to a Pixi
 * CanvasSource (resolution = scale) and call source.update() after draw()
 * returns true. anchorFor(clip) gives the texture anchor that keeps the feet
 * (BUTLER_FEET) on the sprite position.
 */
export class ButlerPainter {
  constructor(rig, parts, scale = BUTLER_RIG_SCALE) {
    this.rig = rig;
    this.parts = { ...parts };
    this.scale = scale;
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    this.ctx = this.canvas?.getContext('2d') || null;
    this.clip = null;
    this.frame = -1;
    // One box for every clip, so the texture never changes size mid-street.
    this.box = Object.values(rig.box).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
    if (this.canvas) {
      this.canvas.width = Math.ceil((this.box[2] - this.box[0]) * scale);
      this.canvas.height = Math.ceil((this.box[3] - this.box[1]) * scale);
    }
  }

  setParts(parts) {
    this.parts = { ...parts };
    this.frame = -1;
  }

  frames(clip) {
    return clipRange(this.rig, clip)[1];
  }

  /** Texture anchor (0-1) that puts BUTLER_FEET on the sprite position. */
  anchor() {
    const b = this.box;
    return { x: (BUTLER_FEET.x - b[0]) / (b[2] - b[0]), y: (BUTLER_FEET.y - b[1]) / (b[3] - b[1]) };
  }

  /** Paint frame i (0-based) of clip; false when nothing changed. */
  draw(clip, i) {
    const [first, count] = clipRange(this.rig, clip);
    const n = first + Math.max(0, Math.min(count - 1, i));
    const pose = this.rig.frames[n - 1];
    // Frames that share a pose (and face frame) paint the same pixels.
    const face = this.rig.parts[this.parts.face];
    const faceKey = face && !Array.isArray(face) ? face.frames[n - 1] : 0;
    const key = `${pose}:${faceKey}`;
    if (key === this.frame || !this.ctx) return false;
    this.frame = key;
    this.clip = clip;
    const s = this.scale;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    paintFrame(this.ctx, this.rig, this.parts, n, [s, 0, 0, s, -this.box[0] * s, -this.box[1] * s]);
    return true;
  }
}
