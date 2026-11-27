/**
 * Holes in an upper floor of the house (report #669, Austin 2026-11-27): a piece whose art is a gap
 * in the floorboards is a way down. Walk onto one on the second or third floor and you drop
 * through it with the normal falling motion and land on the floor below at the same x (clamped
 * inside the walls), with the floor change a Door between floors plays. Pure rules: no Pixi, no
 * DOM; features/homes-feature.js runs them each frame and moves you.
 *
 * What survives in source: nothing that makes these pieces holes. Both are plain furniture_rug
 * styles in items/catalog_furniture.js with no platforms, walls or config ("plats: {}"):
 *  - 310 "Shortcut to Urth", furniture_rug_floor_crack.swf (a jagged crack through the boards),
 *  - 353 "Manhole", furniture_rug_man_silhouette_hole.swf (a hole the shape of someone who fell
 *    through it).
 * items/furniture_rug.js, locations/inc_homes.js, items/include/furniture.js and the upgrade data
 * have no hole, fall or shortcut code, the two SWFs carry only the asset-provider boilerplate, and
 * glitch-client knows rugs only as a Decoration Mode tab (DecorateModel.as 42). In Glitch a house
 * was one tall location with every floor in it, so whether a player remembers falling through one
 * cannot be checked; the remake's floors are rooms of their own (js/home-floors.js).
 *
 * Ours (Austin's ruling, 2026-11-27): the whole behaviour, and which pieces it applies to.
 * FALL_THROUGH is the one list of fall-through classes and styles: the rule reads only it.
 *  - `gap` is the part of the art's width that is open floor, as fractions from the art's left
 *    edge (mirrored when the piece faces left): the columns with dark pixels across the art's
 *    middle third (310: 0.25 to 0.64; 353: the body, 0.18 to 0.70, not its thin right-hand limbs).
 *  - No fall on the ground floor (nothing under it), in Decoration or Cultivation Mode, while a
 *    verb runs, or for a player standing still: a hole set down under you, or a Door that leaves
 *    you on one, drops you only once you walk.
 */

export const FALL_THROUGH = Object.freeze([
  Object.freeze({ classTsid: 'furniture_rug', upgradeId: 310, name: 'Shortcut to Urth', gap: Object.freeze([0.25, 0.64]) }),
  Object.freeze({ classTsid: 'furniture_rug', upgradeId: 353, name: 'Manhole', gap: Object.freeze([0.18, 0.7]) }),
]);

/**
 * Walking: the feet moved at least this far since last frame (px) under their own speed (|vx| at
 * least this, px a frame). A teleport, a Door's arrival or a piece set down under you is not.
 */
export const WALK_EPS = 0.25;
/**
 * While you fall the floor line is cut this far either side of where you stepped in (px), past
 * the hole itself: the ground resolve holds feet within 8 px of a line and 15 px past its end
 * (js/avatar-step.js avatarGround, FOOT_RADIUS) until they are 24 px under it, and you may still
 * steer a little in the air.
 */
export const FALL_CUT_PX = 96;
/** The floor change comes once the feet are this far under the floor line (px)... */
export const FALL_SINK_PX = 40;
/** ...or this long after the drop began, whichever is first (ms). */
export const FALL_MAX_MS = 900;
/**
 * On the floor below you come in through its ceiling, feet this far over its walk line (px:
 * the walk line to the ceiling, INTERIOR.floorY - INTERIOR.ceilingY 413, less the avatar's head
 * reach 111 at scale 1), and keep falling until you land.
 */
export const FALL_ARRIVE_ABOVE = 413 - 111;

/** The FALL_THROUGH row for a placed piece, or null. */
export function fallThroughRow(item) {
  if (!item) return null;
  const up = String(item.upgradeId ?? '');
  return FALL_THROUGH.find((r) => r.classTsid === item.classTsid && String(r.upgradeId) === up) || null;
}

/**
 * The holes in a floor: { id, x1, x2 } in room x for each fall-through piece placed on it.
 * `sizeOf(classTsid, upgradeId)` gives the drawn { w } (home-decor furnitureSize); the piece's x
 * is its middle.
 */
export function floorHoles(placed, sizeOf) {
  const out = [];
  for (const item of Array.isArray(placed) ? placed : []) {
    const row = fallThroughRow(item);
    if (!row) continue;
    const w = Number(sizeOf?.(item.classTsid, item.upgradeId)?.w);
    const x = Number(item.x);
    if (!(w > 0) || !Number.isFinite(x)) continue;
    const left = x - w / 2;
    const [a, b] = row.gap;
    const x1 = item.facingRight === false ? left + (1 - b) * w : left + a * w;
    const x2 = item.facingRight === false ? left + (1 - a) * w : left + b * w;
    out.push({ id: item.id, classTsid: item.classTsid, upgradeId: row.upgradeId, x1: Math.round(x1), x2: Math.round(x2) });
  }
  return out;
}

/** The hole under room x, or null. */
export function holeUnder(holes, x) {
  if (!Number.isFinite(x)) return null;
  return (holes || []).find((h) => x >= h.x1 && x <= h.x2) || null;
}

/**
 * Whether this frame drops you through a hole: the hole, or null. `floor` is the house floor you
 * are on (0 the ground floor; null on a Tower floor or outside), `x` and `prevX` your room x now
 * and last frame (prevX null on the first frame in a room), `vx` your speed.
 */
export function fallCheck({ floor, editing = false, busy = false, onGround = false, prevX = null, x, vx = 0, holes }) {
  if (!(Number(floor) > 0) || editing || busy || !onGround) return null;
  if (!Number.isFinite(prevX) || !Number.isFinite(x) || Math.abs(x - prevX) < WALK_EPS || !(Math.abs(Number(vx) || 0) >= WALK_EPS)) return null;
  return holeUnder(holes, x);
}

/**
 * The floor lines with the walk line cut under a fall: nothing between x1 and x2 (screen x) on
 * any standable line there. Returns new line objects; the rest are kept as they are.
 */
export function cutFloorLines(lines, x1, x2) {
  const out = [];
  for (const p of Array.isArray(lines) ? lines : []) {
    const lo = Math.min(p.x1, p.x2);
    const hi = Math.max(p.x1, p.x2);
    if (hi <= x1 || lo >= x2 || p.y1 !== p.y2) {
      out.push(p);
      continue;
    }
    if (lo < x1) out.push({ ...p, id: `${p.id}-hole-l`, x1: lo, x2: x1 });
    if (hi > x2) out.push({ ...p, id: `${p.id}-hole-r`, x1: x2, x2: hi });
  }
  return out;
}

/** The cut under a fall that began at screen x `at` through `hole` (screen x): the hole and FALL_CUT_PX round you. */
export function fallCut(hole, at) {
  return { x1: Math.min(hole.x1, at - FALL_CUT_PX), x2: Math.max(hole.x2, at + FALL_CUT_PX) };
}

/** Whether the fall has gone far enough to change floors. */
export function fallDone({ feetY, floorY, elapsedMs }) {
  return feetY >= floorY + FALL_SINK_PX || elapsedMs >= FALL_MAX_MS;
}

/** Where you land on the floor below: the same room x, kept inside the walls ([left, right] room x). */
export function landingX(x, { left, right }) {
  const v = Math.round(Number(x) || 0);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left > right) return v;
  return Math.max(left, Math.min(right, v));
}
