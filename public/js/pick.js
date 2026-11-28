/**
 * R56 (#752, Austin 2026-11-27): the one pick for the pointer (hover, click, right click, a phone's
 * tap and Decoration Mode), as Glitch picked: LocationRenderer.as getMostLikelyItemstackFromList
 * (1863-1953) walked the stacks under the mouse front to back and took the first whose bitmap had an
 * opaque pixel at the mouse (alpha over 200 where furniture overlapped, 1887-1888), testing a 3 x 3
 * box round it (`extra`, 1933-1941); LocationView.as onMouseClicked (82-95) routed clicks through it.
 *
 * Before, the pick took the smallest padded rectangle under the pointer, so where pieces overlapped
 * the one placed first won, not the one drawn in front, and a rectangle's empty corners took clicks
 * from its neighbour (a column of Storage Display Boxes: the upper third of a box picked the box
 * above).
 *
 * The rule now:
 * - one thing's rectangle (padded 8 px, as before) under the pointer: that thing, so a click on
 *   empty space near a small thing on its own still reaches it;
 * - more than one: in draw order, front first, the first whose art has a solid pixel (alpha over
 *   SOLID_ALPHA) at the pointer or one pixel round it;
 * - a thing with no art the pick can test (an invisible hit area, a garden plot, which is picked
 *   by its base, #204) keeps its rectangle: drawn behind the art that won, it loses to it (a stack
 *   lying on a garden); drawn in front of it, the old rule (smallest area, the plot whose base is
 *   under the pointer) decides between them, as before;
 * - no art under the pointer: the old rule over every rectangle hit, as before.
 *
 * Masks: one per texture, built the first time a pick needs it (never per frame), one bit per
 * pixel, at most MASK_MAX px a side.
 */
import { rimArtParts } from './enter-chooser.js?v=6996c6f5';

/** Glitch's minimum_alpha for furniture under the mouse with another stack (LocationRenderer.as 1887-1888). */
export const SOLID_ALPHA = 200;
/** Glitch's `extra`: pixels tested each way round the pointer (a 3 x 3 box). */
export const PICK_REACH = 1;
/** The longest side a mask keeps; a bigger texture is sampled down to it. */
export const MASK_MAX = 512;
/** The padding round a thing's rectangle (game.js spriteWorldHitBox): exact boxes none, airborne 14. */
export const PICK_PAD = 8;
export const PICK_PAD_AIRBORNE = 14;

/** texture -> { res, fw, fh, mask } (mask null: unreadable) */
let masks = new WeakMap();
const stats = { built: 0, bytes: 0, unreadable: 0, picks: 0, artPicks: 0 };

/** Pick counters and mask memory (game.js QA pickStats). */
export function pickStats() {
  return { ...stats };
}

/** Tests: forget every mask. */
export function resetPickMasks() {
  masks = new WeakMap();
  Object.assign(stats, { built: 0, bytes: 0, unreadable: 0, picks: 0, artPicks: 0 });
}

/**
 * A one-bit mask of an RGBA picture: the pixels whose alpha is over `solid`.
 * @param {ArrayLike<number>} rgba
 * @param {number} w
 * @param {number} h
 */
export function alphaMask(rgba, w, h, solid = SOLID_ALPHA) {
  const bits = new Uint8Array(Math.ceil((w * h) / 8));
  for (let i = 0, n = w * h; i < n; i++) if (rgba[i * 4 + 3] > solid) bits[i >> 3] |= 1 << (i & 7);
  return { w, h, bits };
}

/** Whether a mask has a solid pixel at (u, v) or within `rx` across and `ry` down of it (mask px). */
export function maskSolidNear(mask, u, v, rx = PICK_REACH, ry = rx) {
  if (!mask) return false;
  const cx = Math.floor(u);
  const cy = Math.floor(v);
  const x0 = Math.max(0, cx - rx);
  const x1 = Math.min(mask.w - 1, cx + rx);
  const y0 = Math.max(0, cy - ry);
  const y1 = Math.min(mask.h - 1, cy + ry);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * mask.w + x;
      if (mask.bits[i >> 3] & (1 << (i & 7))) return true;
    }
  }
  return false;
}

let scratch = null;
/**
 * The browser's reader: a texture's frame drawn once into a scratch canvas and its alpha read.
 * Returns { rgba, w, h } in mask px, or null when the texture cannot be read (no drawable source, a
 * rotated frame in an atlas).
 */
function canvasPixels(texture) {
  const source = texture?.source;
  const res = source?.resource;
  const frame = texture?.frame;
  if (!res || !frame || !(frame.width > 0) || !(frame.height > 0) || texture.rotate) return null;
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return null;
  const rw = Number(res.naturalWidth || res.videoWidth || res.width) || 0;
  const k = source.width > 0 && rw > 0 ? rw / source.width : 1;
  const s = Math.min(1, MASK_MAX / Math.max(frame.width, frame.height));
  const w = Math.max(1, Math.round(frame.width * s));
  const h = Math.max(1, Math.round(frame.height * s));
  try {
    if (!scratch) {
      scratch = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    }
    if (scratch.width < w) scratch.width = w;
    if (scratch.height < h) scratch.height = h;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(res, frame.x * k, frame.y * k, frame.width * k, frame.height * k, 0, 0, w, h);
    return { rgba: ctx.getImageData(0, 0, w, h).data, w, h };
  } catch {
    return null;
  }
}

/** Whether a texture's picture has arrived (an image still loading is read later, not cached). */
function pictureReady(texture) {
  const res = texture?.source?.resource;
  if (!res) return false;
  if (res.complete === false) return false;
  return Number(res.naturalWidth || res.videoWidth || res.width) > 0;
}

/**
 * A texture's mask, built once per picture (null when it cannot be read). The cache holds the
 * picture and frame it was built from: a texture filled in when its image arrives, or given a
 * sharper copy, is read again.
 */
export function textureMask(texture, pixelsOf = canvasPixels) {
  if (!texture || typeof texture !== 'object' || !texture.frame) return null;
  const res = texture.source?.resource;
  const { width: fw, height: fh } = texture.frame;
  const had = masks.get(texture);
  if (had && had.res === res && had.fw === fw && had.fh === fh) return had.mask;
  if (!pictureReady(texture)) return null;
  // A 2D canvas read of the picture file (canvasPixels), never a GL readback (R29 is about those).
  const px = pixelsOf(texture);
  const mask = px ? alphaMask(px.rgba, px.w, px.h) : null;
  if (had?.mask) stats.bytes -= had.mask.bits.byteLength;
  if (mask) {
    stats.built++;
    stats.bytes += mask.bits.byteLength;
  } else stats.unreadable++;
  masks.set(texture, { res, fw, fh, mask });
  return mask;
}

/** Whether a node and every parent of it is shown. */
function shown(node) {
  for (let n = node, i = 0; n && i < 64; n = n.parent, i++) {
    if (n.destroyed || n.visible === false || n.renderable === false || n.alpha === 0) return false;
  }
  return true;
}

/**
 * Whether an art Sprite has a solid pixel at a global point: the point in the sprite's own px
 * (anchor, scale and a flip undone by toLocal), then in its texture's trimmed frame.
 * true / false; null when its texture cannot be read (the caller treats its rectangle as the art).
 */
export function spriteSolidAt(part, global, pixelsOf = canvasPixels) {
  const tex = part?.texture;
  if (!tex?.frame || typeof part.toLocal !== 'function') return null;
  const local = part.toLocal(global);
  const orig = tex.orig || tex.frame;
  const trim = tex.trim || null;
  const ax = part.anchor?.x ?? 0;
  const ay = part.anchor?.y ?? 0;
  const u = local.x + ax * orig.width - (trim ? trim.x : 0);
  const v = local.y + ay * orig.height - (trim ? trim.y : 0);
  const fw = tex.frame.width;
  const fh = tex.frame.height;
  const reach = PICK_REACH;
  if (u < -reach || v < -reach || u >= fw + reach || v >= fh + reach) return false;
  const mask = textureMask(tex, pixelsOf);
  if (!mask) return null;
  // The reach is a pixel of the art as drawn (Glitch's stage px): three of a 3x render's.
  const kx = mask.w / fw;
  const ky = mask.h / fh;
  return maskSolidNear(mask, u * kx, v * ky, Math.max(1, Math.round(reach * kx)), Math.max(1, Math.round(reach * ky)));
}

/**
 * A node's place in what is drawn, as a list of [zIndex, index] from the stage down: Pixi draws a
 * Container's children in order, a sortable one's by zIndex (stable). Compare with drawOrderCompare.
 */
export function drawPath(node) {
  const path = [];
  for (let n = node, i = 0; n?.parent && i < 64; n = n.parent, i++) {
    const p = n.parent;
    const at = Array.isArray(p.children) ? p.children.indexOf(n) : 0;
    path.push(p.sortableChildren ? [Number(n.zIndex) || 0, at] : [0, at]);
  }
  return path.reverse();
}

/** Negative when path a draws behind path b (a child draws over its parent and after it). */
export function drawOrderCompare(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i][0] !== b[i][0]) return a[i][0] - b[i][0];
    if (a[i][1] !== b[i][1]) return a[i][1] - b[i][1];
  }
  return a.length - b.length;
}

/** Axis-aligned hit box in world space (anchor-aware); game.js spriteWorldHitBox. */
export function spriteWorldHitBox(spr, pad = 6) {
  if (!spr) return null;
  // Garden plot / mine rock cells use world coords + explicit hit size (Containers often report 0×0)
  const w = Math.abs(spr._worldHitW || spr._gardenHitW || spr._mineHitW || spr._rookHitW || spr.width || 0);
  const h = Math.abs(spr._worldHitH || spr._gardenHitH || spr._mineHitH || spr._rookHitH || spr.height || 0);
  if (w < 2 || h < 2) return null;
  // Default anchor 0.5,1 for world entities; fall back to actual anchor
  const ax = spr.anchor?.x ?? 0.5;
  const ay = spr.anchor?.y ?? 1;
  const left = spr.x - w * ax - pad;
  // G1164: a box whose bottom sits under the feet (a player's: hit_box_offset_y, AbstractAvatarView.as 142).
  const top = spr.y - h * ay - pad + (Number(spr._worldHitBelow) || 0);
  return { left, top, right: left + w + pad * 2, bottom: top + h + pad * 2, w, h };
}

export function pointInHitBox(box, x, y) {
  return Boolean(box) && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/** The pad a target's rectangle takes. */
export function targetPad(t) {
  return t.sprite?._worldHitExact ? 0 : t.airborne ? PICK_PAD_AIRBORNE : PICK_PAD;
}

/**
 * The old rule: smallest area first (a plot's counts 0.15), and among the plots hit the one whose
 * base is under the pointer (report #204, js/garden-view.js nearestPlotIndex).
 */
function byArea(hits, x, y, nearestPlotIndex) {
  const sorted = [...hits].sort((a, b) => a.area - b.area);
  if (sorted[0].t.classId === 'garden_plot' && nearestPlotIndex) {
    const plots = sorted.filter((h) => h.t.classId === 'garden_plot').map((h) => h.t);
    return plots[nearestPlotIndex(plots.map((t) => t.sprite), x, y)] || sorted[0].t;
  }
  return sorted[0].t;
}

/**
 * The art a target draws (rimArtParts: its own Sprite, a Container's art Sprites, or the art an
 * invisible hit box names), shown ones only. A garden plot is picked by its base (#204), never its art.
 */
function targetArt(t, PIXI, artParts) {
  if (t.classId === 'garden_plot') return [];
  let parts = [];
  try {
    parts = artParts ? artParts(t) : PIXI ? rimArtParts(t.sprite, PIXI) : [];
  } catch {
    parts = [];
  }
  return (parts || []).filter(shown);
}

/** Whether a drawn candidate has a solid pixel at the point (its parts front first). */
function drawnSolid(d, global, x, y, pixelsOf) {
  for (const part of [...d.parts].sort((a, b) => drawOrderCompare(drawPath(b), drawPath(a)))) {
    const s = spriteSolidAt(part, global, pixelsOf);
    // An unreadable texture counts as solid over its rectangle (the old behaviour for it).
    if (s === true || (s === null && pointInHitBox(spriteWorldHitBox(d.t.sprite, 0), x, y))) return true;
  }
  return false;
}

/** The rectangles hit, split into drawn ones (front first, with their art) and plain hit areas. */
function overlapOf(hits, PIXI, artParts) {
  const drawn = [];
  const plain = [];
  for (const h of hits) {
    const parts = targetArt(h.t, PIXI, artParts);
    if (!parts.length) {
      plain.push(h);
      continue;
    }
    // Its front-most part decides where it is drawn.
    const paths = parts.map(drawPath);
    let front = 0;
    for (let i = 1; i < paths.length; i++) if (drawOrderCompare(paths[i], paths[front]) > 0) front = i;
    drawn.push({ ...h, parts, path: paths[front] });
  }
  drawn.sort((a, b) => drawOrderCompare(b.path, a.path));
  return { drawn, plain };
}

/**
 * The first of `items` (front first, each with the rectangle the caller already found holding the
 * point) whose art is solid at a global point: Decoration Mode's furnitureAt (js/features/
 * homes-feature.js), which keeps its own order and rectangles. One item: that item (its rectangle is
 * enough); an item with no art, or art that cannot be read, counts as solid over its rectangle; no
 * art solid there: the front one, as before.
 * @template T
 * @param {T[]} items
 * @param {{ x: number, y: number }} global
 * @param {(item: T) => any} artOf the item's art Sprite (or null)
 */
export function pickFront(items, global, artOf, pixelsOf = canvasPixels) {
  if (items.length < 2) return items[0] ?? null;
  for (const item of items) {
    const art = artOf(item);
    if (!art || !shown(art)) continue;
    const s = spriteSolidAt(art, global, pixelsOf);
    if (s !== false) return item;
  }
  return items[0];
}

/** QA (game.js pickAt): every rectangle under the point, drawn ones front first with whether their art is solid there. */
export function pickExplain(targets, x, y, opts = {}) {
  const { PIXI = null, layer = null, artParts = null, pixelsOf = canvasPixels } = opts;
  const global = layer?.toGlobal ? layer.toGlobal({ x, y }) : { x, y };
  const { drawn, plain } = overlapOf(rectangleHits(targets, x, y), PIXI, artParts);
  return [...drawn.map((d) => ({ t: d.t, solid: drawnSolid(d, global, x, y, pixelsOf) })), ...plain.map((h) => ({ t: h.t, solid: null }))];
}

/**
 * The thing under a world point (the entity layer's coordinates), or null.
 * @param {any[]} targets the registered interactables
 * @param {number} x
 * @param {number} y
 * @param {{ PIXI?: any, layer?: any, nearestPlotIndex?: Function, artParts?: (t: any) => any[], pixelsOf?: Function }} [opts]
 *   layer: the Container the targets' x,y are in (to reach the art's own px); artParts and
 *   pixelsOf stand in for Pixi and the canvas in tests.
 */
/** Every target whose padded rectangle holds the point, with its area for the old rule. */
function rectangleHits(targets, x, y) {
  const hits = [];
  for (const t of targets || []) {
    if (!t?.sprite || t.sprite.destroyed || t.absent) continue;
    const box = spriteWorldHitBox(t.sprite, targetPad(t));
    if (!pointInHitBox(box, x, y)) continue;
    hits.push({ t, box, area: box.w * box.h * (t.classId === 'garden_plot' ? 0.15 : 1) });
  }
  return hits;
}

/** The pick before R56, by rectangles alone (QA pickAt, the tests' "before"). */
export function pickByRectangle(targets, x, y, { nearestPlotIndex = null } = {}) {
  const hits = rectangleHits(targets, x, y);
  return hits.length ? byArea(hits, x, y, nearestPlotIndex) : null;
}

export function pickTarget(targets, x, y, opts = {}) {
  const { PIXI = null, layer = null, nearestPlotIndex = null, artParts = null, pixelsOf = canvasPixels } = opts;
  const hits = rectangleHits(targets, x, y);
  if (!hits.length) return null;
  stats.picks++;
  if (hits.length === 1) return hits[0].t;
  const global = layer?.toGlobal ? layer.toGlobal({ x, y }) : { x, y };
  const { drawn, plain } = overlapOf(hits, PIXI, artParts);
  const art = drawn.find((d) => drawnSolid(d, global, x, y, pixelsOf)) || null;
  if (!art) return byArea(hits, x, y, nearestPlotIndex);
  stats.artPicks++;
  // A hit area drawn behind the art loses to it (a stack lying on a garden's plots); one drawn in
  // front of it, or not in the scene, keeps the old rule against it.
  const rivals = plain.filter((h) => !h.t.sprite.parent || drawOrderCompare(drawPath(h.t.sprite), art.path) > 0);
  if (!rivals.length) return art.t;
  return byArea([art, ...rivals], x, y, nearestPlotIndex);
}
