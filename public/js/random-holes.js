/**
 * Glitch's Random Hole (items/random_hole.js, report #669's search for things you could fall
 * through; Austin 2026-11-27). Pure rules: no Pixi, no DOM; features/random-holes-feature.js
 * runs them each frame and moves you.
 *
 * What the source says (random_hole.js, the whole file):
 * - A hidden street item (is_hidden, not_selectable, no verbs, tags no_rube and no_trade) with a
 *   collision box: hitBox 10 x 10, per instance its `width` and `height` props (onPropsChanged
 *   apiSetHitBox). Its art is items/missing.swf: nothing of its own shows; a street drew the hole.
 * - onPlayerCollision: choose_one_hash(this.holes), any Random Hole in the same location, the one
 *   you touched too (findHoles keeps every item of the class), then
 *   pc.teleportToLocation(this.container.tsid, hole.x, hole.y - 120) and
 *   pc.addCTPCPhysics({ gravity: -2, duration_ms: 1100 }): you come out 120 px over that hole and
 *   are thrown upward for 1.1 s (gravity times -2, players/inc_physics.js; the client bounds the
 *   rise at vy_max), then fall as usual. No cooldown, sound or condition.
 * - No archived street places one (streets/, locations-xml.zip: no random_hole), so the remake has
 *   none on its streets. features/random-holes-feature.js places a few only for QA
 *   (&randomholedemo=<street>).
 */

/** random_hole.js hitBox and initInstanceProps: 10 x 10 px. */
export const RANDOM_HOLE_HIT = Object.freeze({ w: 10, h: 10 });
/** onPlayerCollision: teleportToLocation(..., hole.x, hole.y - 120). */
export const RANDOM_HOLE_POP_ABOVE = 120;
/** onPlayerCollision: addCTPCPhysics({ gravity: -2, duration_ms: 1100 }). */
export const RANDOM_HOLE_PHYSICS = Object.freeze({ gravity: -2, durationMs: 1100 });
export const RANDOM_HOLE_CLASS = 'random_hole';

/** A hole's hit box: its own width and height props, else the class's 10 x 10. */
export function holeBox(hole) {
  const w = Number(hole?.w) > 0 ? Number(hole.w) : RANDOM_HOLE_HIT.w;
  const h = Number(hole?.h) > 0 ? Number(hole.h) : RANDOM_HOLE_HIT.h;
  return { x1: hole.x - w / 2, x2: hole.x + w / 2, y1: hole.y - h, y2: hole.y };
}

/**
 * PURE: whether a body with its feet at (px, py) and `bodyH` tall touches the hole: the feet's x
 * inside the box's width, the body overlapping its height (the box rises from the hole's feet, as
 * every item hit box does: potions.js touchesPhysicsItem).
 */
export function touchesHole(hole, px, py, bodyH = 80) {
  const b = holeBox(hole);
  return px >= b.x1 && px <= b.x2 && py >= b.y1 && py - bodyH <= b.y2;
}

/**
 * PURE: whether the feet's path from `from` to `to` ({ x, y }) touched the hole at any point: a
 * walk crosses a 10 px box in two frames, and a frame's check would step past it.
 */
export function sweptTouch(hole, from, to, bodyH = 80) {
  if (!to) return false;
  // A step longer than any frame's walk or fall is a teleport (a door, a pit, a QA move): only
  // where it put you counts, not the street it skipped over.
  if (!from || Math.hypot(to.x - from.x, to.y - from.y) > MAX_FRAME_STEP) return touchesHole(hole, to.x, to.y, bodyH);
  const steps = Math.min(400, Math.max(1, Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) / 2)));
  for (let i = 0; i <= steps; i += 1) {
    const k = i / steps;
    if (touchesHole(hole, from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, bodyH)) return true;
  }
  return false;
}

/**
 * The longest step between two frames that is still a walk, jump or fall: the game steps at most
 * six 60 fps frames at once (avatar-step.js MAX_TICK_FRAMES) at about 11 px a frame (terminal
 * speed, a Spinach run). Longer is a teleport.
 */
export const MAX_FRAME_STEP = 120;

/** PURE: choose_one_hash over the street's holes (the touched one included); null with none. */
export function pickHole(holes, random = Math.random) {
  if (!holes?.length) return null;
  const i = Math.min(holes.length - 1, Math.floor(Math.max(0, random()) * holes.length));
  return holes[i];
}

/** PURE: where a hop to `hole` stands you: 120 px over it (screen y grows down). */
export function hopSpot(hole) {
  return { x: hole.x, y: hole.y - RANDOM_HOLE_POP_ABOVE };
}

/**
 * PURE: one frame's check. `inside` is the set of hole ids the body touched last frame
 * (onPlayerCollision fires when a touch starts, not while it lasts). Returns { touched, inside }:
 * `touched` the hole whose touch started this frame (the first in list order) or null, `inside` the
 * ids touched now.
 */
export function holeCheck(holes, from, to, inside = new Set(), bodyH = 80) {
  const now = new Set();
  let touched = null;
  for (const hole of holes || []) {
    if (!sweptTouch(hole, from, to, bodyH)) continue;
    now.add(hole.id);
    if (!touched && !inside.has(hole.id)) touched = hole;
  }
  return { touched, inside: now };
}

/** PURE: the hop's physics while it lasts (`until` ms), as the feature host takes them; null after. */
export function hopPhysics(until, now = Date.now()) {
  if (!(until > now)) return null;
  // vy_max 1.0: the normal terminal speed bounds the rise (boundAvatarVelocities), as potions-feature.
  return { gravity: RANDOM_HOLE_PHYSICS.gravity, vyMax: 1 };
}

/** The QA demo's holes: where along the street (fractions of its width) when the link names no x. */
export const DEMO_HOLE_FRACTIONS = Object.freeze([0.2, 0.4, 0.6, 0.8]);

/**
 * PURE: the QA link's value, `<street tsid>` or `here` (or `1`), then optionally `@x1,x2,...`
 * (screen x). Returns { street: tsid or '' (any street), xs: [] or the given x's }, or null when empty.
 */
export function parseHoleDemo(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const [where, at = ''] = raw.split('@');
  const w = where.trim();
  const street = w === '' || w === '1' || w.toLowerCase() === 'here' ? '' : w;
  const xs = at.split(',').map((v) => v.trim()).filter((v) => v !== '').map(Number).filter(Number.isFinite);
  return { street, xs };
}
const sameTsid = (a, b) => String(a || '').slice(1) === String(b || '').slice(1);

/** PURE: whether the demo asks for holes on this street. */
export function demoWantsStreet(demo, tsid) {
  if (!demo || !tsid) return false;
  return !demo.street || sameTsid(demo.street, tsid);
}

/**
 * PURE: the demo's holes, given the street's width and `groundAt(x)` (the floor's screen y there,
 * null with none): one at each named x, else at DEMO_HOLE_FRACTIONS of the width, on the ground.
 * Ids are `hole1`, `hole2`, ... in x order.
 */
export function demoHoles(demo, worldW, groundAt) {
  if (!demo) return [];
  const xs = demo.xs.length ? demo.xs : DEMO_HOLE_FRACTIONS.map((f) => Math.round(worldW * f));
  const out = [];
  for (const x of [...xs].sort((a, b) => a - b)) {
    const y = groundAt(x);
    if (!Number.isFinite(y)) continue;
    out.push({ id: `hole${out.length + 1}`, classTsid: RANDOM_HOLE_CLASS, x: Math.round(x), y: Math.round(y), w: RANDOM_HOLE_HIT.w, h: RANDOM_HOLE_HIT.h });
  }
  return out;
}

/**
 * The QA demo's picture of a hole. The item itself draws nothing (missing.swf), so the demo shows
 * where it put each one with a Tiny Speck ground hole: cave_gr_hole_1 (zutto1.swf, the game's deco
 * set, assets/decos/groddle), flat on the floor, `w` px wide.
 */
export const DEMO_HOLE_ART = Object.freeze({
  name: 'cave_gr_hole_1',
  url: 'assets/decos/groddle/cave_gr_hole_1.webp',
  w: 72,
  h: 27,
});
