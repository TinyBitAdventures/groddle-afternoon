/**
 * The avatar's movement step, shared by the game (game.js handleInput and physics()) and the
 * level builder's validator (js/builder/reach-graph.js, spec 7.4: "one stepper, shared with the
 * game"). Pure: no Pixi, no DOM. The game keeps its own state (climbing, Paradise courses, menus,
 * the walk animation) and calls these for the walking and airborne avatar; the validator calls
 * the same functions frame by frame to find where a jump lands.
 *
 * Units are px per frame at 60 fps (spec 2.3). A body is { x, y, vx, vy, onGround } with the feet
 * at x, y in screen space (the street's top-left origin, y down).
 */
import { avatarHeadReach, blockBarrierCrossing, buriedSignpostUnder, headCeiling, isStandable, resolveGround, worldToScreen } from './street-model.js?v=23b926e5';
import { stickToSlope } from './slope-walk.js?v=9af1e505';

/** Gravity per frame (x the street's gravity multiplier). game.js physics(). */
export const GRAVITY = 0.42;
/** Jump launch speed (x the jump multiplier). game.js handleInput. */
export const JUMP_SPEED = -9.6;
/** Walk speed, vx_max 335 px/s. */
export const WALK_MAX = 4.4;
/** Floor acceleration per frame; in the air it is vx_accel_add_in_air 0.22 against _floor 0.3. */
export const FLOOR_ACCEL = 0.58;
export const AIR_ACCEL_RATIO = 0.22 / 0.3;
/** Airborne with no key, vx stops under friction_thresh (80 of vx_max 335). */
export const AIR_STOP_RATIO = 80 / 335;
/** Off a ladder sideways: vx_off_ladder 300 of vx_max 335, with a tenth of a jump. */
export const OFF_LADDER_RATIO = 300 / 335;
/** normal vy_max (670 px/s) in the remake's px/frame, against its -9.6 = 570 px/s jump. */
export const STREET_PHYSICS_TERMINAL_VY = (9.6 * 670) / 570;
/** The avatar's height against walls at scale 1 (blockBarrierCrossing bodyH); ceilings use avatarHeadReach. */
export const AVATAR_BODY_H = 80;
/** The street ground resolve's snap (resolveGround's `snap`), as game.js calls it. */
export const GROUND_SNAP = 16;
/** The avatar never goes nearer the street's ends than this. */
export const EDGE_MARGIN = 24;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Neutral street physics (no per-street setting, no buffs). */
export const NORMAL_BUFF = Object.freeze({
  speed: 1, jump: 1, gravity: 1, vyMax: null, accel: 1, airAccel: 1, friction: 1, airDrag: 0, jetpack: false, tripleJump: 1,
});

/**
 * Per-street physics (js/features/location-events-feature.js): the host's optional extras with
 * neutral defaults. Source: AvatarPhysicsHandler.as (vy capped at vy_max, x2 upward; friction_air
 * drag; jetpack; multiplier_3_jump).
 */
export function streetPhysicsExtras(extra) {
  return {
    vyMax: Number.isFinite(extra.vyMax) && extra.vyMax > 0 ? extra.vyMax : null,
    accel: extra.accel ?? 1,
    airAccel: extra.airAccel ?? 1,
    friction: extra.friction ?? 1,
    airDrag: extra.airDrag > 0 ? extra.airDrag : 0,
    jetpack: extra.jetpack === true,
    tripleJump: extra.tripleJump ?? 1,
  };
}

/** Coasting decay per frame: ground friction scales the 0.78 rule; drag rules the air. */
export function coastDecay(onGround, buff) {
  if (!onGround && buff.airDrag > 0) return Math.max(0, 1 - buff.airDrag / 60);
  if (onGround && buff.friction !== 1) return 0.78 ** Math.max(0.05, buff.friction);
  return 0.78;
}

/** This frame's horizontal acceleration for a held key. */
export function steerAccel(onGround, buff) {
  return FLOOR_ACCEL * (onGround ? buff.accel : buff.airAccel * AIR_ACCEL_RATIO);
}

/**
 * vx after this frame's left/right input (game.js handleInput, less the companion follow it
 * puts between a held key and coasting). `dir` is -1, 0 or 1.
 */
export function steerX(vx, dir, onGround, buff) {
  const accel = steerAccel(onGround, buff);
  const max = WALK_MAX * buff.speed;
  if (dir < 0) return Math.max(vx - accel, -max);
  if (dir > 0) return Math.min(vx + accel, max);
  return coastX(vx, onGround, buff);
}

/** vx with no key held: airborne it keeps its momentum until under friction_thresh, else it coasts down. */
export function coastX(vx, onGround, buff) {
  const max = WALK_MAX * buff.speed;
  if (!onGround && !(buff.airDrag > 0)) return Math.abs(vx) < max * AIR_STOP_RATIO ? 0 : vx;
  const next = vx * coastDecay(onGround, buff);
  return Math.abs(next) < 0.05 ? 0 : next;
}

/** Air drag, the jetpack's vx bound and the vy_max cap, only on streets/events that set them. */
export function streetPhysicsFreeFall(body, buff, dt) {
  if (buff.airDrag > 0 && !body.onGround) body.vy *= Math.max(0, 1 - (buff.airDrag * dt) / 60);
  // A swim (jetpack) bounds vx to vx_max every frame, as boundAvatarVelocities does: a
  // run-up into A Summer's Day's pool no longer carries you across it at walking speed.
  if (buff.jetpack) {
    const vxCap = WALK_MAX * buff.speed;
    body.vx = clamp(body.vx, -vxCap, vxCap);
  }
  if (buff.vyMax) {
    const cap = STREET_PHYSICS_TERMINAL_VY * buff.vyMax;
    body.vy = clamp(body.vy, -(buff.gravity < 0 ? cap : cap * 2), cap);
  }
}

/**
 * The floor under the feet (screen y): the street ground resolve, else the lowest standable line
 * near x (imported streets have seams, so a small gap is bridged), else the bottom of every line.
 * A gap over a buried signpost is a hole to jump into (the Great Hole to Ix): fall, and never get
 * pulled back up onto the rim from below. `fallback` is the floor of a street with no lines.
 */
export function avatarGround(platforms, px, py, vy, { street = null, fallback = 0, bottom = null } = {}) {
  if (platforms?.length) {
    const hit = resolveGround(platforms, px, py, vy ?? 0, GROUND_SNAP);
    if (hit) return hit.y;
    let best = null;
    let bestY = -Infinity;
    for (const p of platforms) {
      if (!isStandable(p)) continue; // an underside is never the floor (pc_perm 1)
      const y = (p.y1 + p.y2) / 2;
      const minX = Math.min(p.x1, p.x2) - 8;
      const maxX = Math.max(p.x1, p.x2) + 8;
      if (px >= minX && px <= maxX && y > bestY) {
        bestY = y;
        best = y;
      }
    }
    const hole = street ? buriedSignpostUnder(street, px, Infinity) : null;
    if (best != null && py >= best - 80 && !(hole && py > best + 24)) return best;
    if (hole) return worldToScreen(street, px, street.bounds?.b ?? 0).y;
    // `bottom`: the lowest line of the whole street when `platforms` is only the lines near x.
    return bottom ?? platforms.reduce((m, p) => Math.max(m, p.y1, p.y2), 0);
  }
  return fallback;
}

/**
 * One frame of the walking or airborne avatar (game.js physics(), the branch that is neither
 * climbing, a Paradise course nor held by a menu), in the game's order: gravity, the street's
 * fall rules, the move, the street's ends, a rising head against undersides, walls, then the
 * floor (with the slope-walk stick). Mutates and returns `body`.
 *
 * @param {{ x:number, y:number, vx:number, vy:number, onGround?:boolean }} body
 * @param {{ dt?:number, buff?:object, platforms:object[], barriers?:object[], worldW:number,
 *   bodyScale?:number, ceilings?:boolean, ground:(x:number, y:number, vy:number) => number }} ctx
 *   `platforms` are screen-space lines (platformsScreen); `ground` is the floor resolve
 *   (avatarGround over the same lines); `ceilings` false when a feature owns the street's ceilings.
 */
export function stepAvatar(body, { dt = 1, buff = NORMAL_BUFF, platforms, barriers = [], worldW, bodyScale = 1, ceilings = true, ground }) {
  // On the floor before this frame's move (a jump in handleInput already left it).
  const wasGrounded = body.onGround === true;
  body.vy += GRAVITY * (buff.gravity ?? 1) * dt;
  streetPhysicsFreeFall(body, buff, dt);
  const prevX = body.x;
  const prevY = body.y;
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  body.x = clamp(body.x, EDGE_MARGIN, worldW - EDGE_MARGIN);
  // The avatar's collision height (80 px) shrinks with a street's pc_scale.
  const bodyH = AVATAR_BODY_H * bodyScale;
  // A rising head stops under an underside or ceiling (platform pc_perm 1 or null)
  // at the client's head circle, 111 px over the feet at scale 1 (avatarHeadReach).
  const head = avatarHeadReach(bodyScale);
  const headY = platforms?.length && ceilings ? headCeiling(platforms, prevX, prevY, body.x, body.y, head) : null;
  if (headY != null) {
    body.y = headY;
    if (body.vy < 0) body.vy = 0;
  }
  // Source <walls>: vertical colliders with directional pc_perm.
  const walledX = blockBarrierCrossing(barriers, prevX, body.x, body.y, bodyH);
  if (walledX !== body.x) {
    body.x = walledX;
    body.vx = 0;
  }
  const floor = ground(body.x, body.y, body.vy);
  if (body.y >= floor && body.vy >= 0) {
    body.y = floor;
    body.vy = 0;
    body.onGround = true;
  } else if (stickToSlope({ wasGrounded, vy: body.vy, dx: body.x - prevX, feetY: body.y, groundY: floor })) {
    // Walking down a slope (js/slope-walk.js): the floor fell away faster than
    // gravity moved the feet; stay on it instead of hopping down in falls.
    body.y = floor;
    body.vy = 0;
    body.onGround = true;
  } else if (body.y < floor - 2) {
    body.onGround = false;
  }
  return body;
}
