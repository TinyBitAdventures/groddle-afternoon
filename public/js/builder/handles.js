/**
 * LEVEL BUILDER (spec 6.5): deco geometry for picking and handles, in screen-space world px (the
 * street's top-left origin, before the camera). A deco is drawn anchored bottom-centre, sized w x h,
 * rotated r degrees about the anchor, mirrored by flip (street-render.js buildStreetView), so its box
 * in its own frame is [-w/2, w/2] x [-h, 0] whatever the flip. Pure: the editor feeds it the deco's
 * data and its layer's current parallax offset, never Pixi's transforms (a blurred layer's sprites
 * are parked off the stage, so their transforms do not say where they are drawn).
 */
import { decoScreen, screenToDeco } from './zone.js?v=bdc23538';

const RAD = Math.PI / 180;
export const MIN_SIZE = 4;
/** Where the rotation knob sits above a deco's top edge, in canvas px. */
export const KNOB_GAP = 26;

/**
 * PURE: a deco's box. `size` is the drawn size when the deco has no w or h (its texture's).
 * @returns {{ ax: number, ay: number, w: number, h: number, r: number }}
 */
export function decoBox(street, layer, deco, offset, size = null) {
  const a = decoScreen(street, layer, deco, offset);
  return {
    ax: a.x,
    ay: a.y,
    w: deco.w > 0 ? deco.w : size?.w || 0,
    h: deco.h > 0 ? deco.h : size?.h || 0,
    r: Number(deco.r) || 0,
  };
}

/** PURE: a screen point in the box's own frame (anchor at 0,0, unrotated). */
export function toLocal(box, p) {
  const dx = p.x - box.ax;
  const dy = p.y - box.ay;
  const c = Math.cos(-box.r * RAD);
  const s = Math.sin(-box.r * RAD);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

/** PURE: a point of the box's frame on screen. */
export function toScreen(box, l) {
  const c = Math.cos(box.r * RAD);
  const s = Math.sin(box.r * RAD);
  return { x: box.ax + l.x * c - l.y * s, y: box.ay + l.x * s + l.y * c };
}

/** PURE: whether a screen point is on the deco (with `pad` px of slack each side). */
export function contains(box, p, pad = 0) {
  const l = toLocal(box, p);
  return l.x >= -box.w / 2 - pad && l.x <= box.w / 2 + pad && l.y >= -box.h - pad && l.y <= pad;
}

/** PURE: the four corners on screen, clockwise from the top left. */
export function corners(box) {
  return [[-box.w / 2, -box.h], [box.w / 2, -box.h], [box.w / 2, 0], [-box.w / 2, 0]].map(([x, y]) => toScreen(box, { x, y }));
}

/** PURE: the axis-aligned bounds on screen. */
export function bounds(box) {
  const c = corners(box);
  const xs = c.map((p) => p.x);
  const ys = c.map((p) => p.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

/** The eight resize handles (sx, sy: -1, 0 or 1 for left/centre/right and top/middle/bottom). */
export const HANDLES = Object.freeze([
  { id: 'nw', sx: -1, sy: -1 }, { id: 'n', sx: 0, sy: -1 }, { id: 'ne', sx: 1, sy: -1 }, { id: 'e', sx: 1, sy: 0 },
  { id: 'se', sx: 1, sy: 1 }, { id: 's', sx: 0, sy: 1 }, { id: 'sw', sx: -1, sy: 1 }, { id: 'w', sx: -1, sy: 0 },
]);

/** PURE: each handle's screen point, and the rotation knob's (KNOB_GAP canvas px over the top at `zoom`). */
export function handlePoints(box, zoom = 1) {
  const out = HANDLES.map((h) => ({ ...h, ...toScreen(box, { x: (h.sx * box.w) / 2, y: h.sy === -1 ? -box.h : h.sy === 0 ? -box.h / 2 : 0 }) }));
  out.push({ id: 'rotate', sx: 0, sy: 0, ...toScreen(box, { x: 0, y: -box.h - KNOB_GAP / zoom }) });
  return out;
}

/**
 * PURE: a resize by handle. The opposite edge stays put (the anchor moves with the edge it
 * belongs to); `keepAspect` (Shift) scales both sides together. `from` and `to` are the pointer's
 * screen points at the start and now. Returns the deco's new { x, y, w, h } in its layer's space.
 */
export function resizeBy(street, layer, deco, box, handle, from, to, { keepAspect = false, offset } = {}) {
  const a = toLocal(box, from);
  const b = toLocal(box, to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let w = box.w;
  let h = box.h;
  if (handle.sx !== 0) w = Math.max(MIN_SIZE, box.w + handle.sx * dx);
  if (handle.sy === -1) h = Math.max(MIN_SIZE, box.h - dy);
  if (handle.sy === 1) h = Math.max(MIN_SIZE, box.h + dy);
  if (keepAspect && box.w > 0 && box.h > 0) {
    const k = handle.sx !== 0 && handle.sy !== 0 ? Math.max(w / box.w, h / box.h) : handle.sx !== 0 ? w / box.w : h / box.h;
    w = Math.max(MIN_SIZE, box.w * k);
    h = Math.max(MIN_SIZE, box.h * k);
  }
  // The anchor (bottom centre) in the old frame: the far side stays where it was.
  const shiftX = handle.sx !== 0 ? (handle.sx * (w - box.w)) / 2 : 0;
  // Only the bottom edge carries the anchor down; a side handle with Shift grows upward.
  const shiftY = handle.sy === 1 ? h - box.h : 0;
  const anchor = toScreen(box, { x: shiftX, y: shiftY });
  const p = screenToDeco(street, layer, anchor, offset);
  return { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(w), h: Math.round(h) };
}

/** PURE: the rotation that points the knob at `p` (degrees, -180..180; `snap` rounds to it). */
export function rotationTo(box, p, snap = 1) {
  const deg = Math.atan2(p.y - box.ay, p.x - box.ax) / RAD + 90;
  let r = Math.round(deg / snap) * snap;
  while (r > 180) r -= 360;
  while (r <= -180) r += 360;
  return r === 0 ? 0 : r;
}

/** PURE: whether a box meets a screen rectangle (a marquee), by its axis-aligned bounds. */
export function meetsRect(box, rect) {
  const b = bounds(box);
  return b.x2 >= Math.min(rect.x1, rect.x2) && b.x1 <= Math.max(rect.x1, rect.x2) && b.y2 >= Math.min(rect.y1, rect.y2) && b.y1 <= Math.max(rect.y1, rect.y2);
}
