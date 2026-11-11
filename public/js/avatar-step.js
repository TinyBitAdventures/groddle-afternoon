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
import { avatarHeadReach, blockBarrierCrossing, buriedSignpostUnder, headCeiling, isStandable, platformYAt, resolveGround, worldToScreen } from './street-model.js?v=b6cb6a4e';
import { stickToSlope } from './slope-walk.js?v=9af1e505';

/*
 * The client's normal PhysicsSetting (GSJS config_base.js physics_configs.normal 58-77: gravity
 * 1190, vy_jump -570, vy_max 670, friction_air -0.22, px/s) in the remake's px per frame at 60 fps.
 * The client stepped its physics in fixed 17 ms slices (StageBeacon.as onGameloopTimer 305-310,
 * lie_about_gl on; TSEngineConstants.TARGET_PHYSICS_FRAMERATE 60), so a second is 60 frames.
 */
/** Gravity per frame (x the street's gravity multiplier): 1190 px/s^2. */
export const GRAVITY = 1190 / 3600;
/** Jump launch speed (x the jump multiplier): vy_jump -570 px/s, High Jumper II (jump_2, vy_jump 1). */
export const JUMP_SPEED = -570 / 60;
/** Walk speed per frame (264 px/s; Walk Speed II is 0.8268 x vx_max 335 = 277 px/s). */
export const WALK_MAX = 4.4;
/** Floor acceleration per frame; in the air it is vx_accel_add_in_air 0.22 against _floor 0.3. */
export const FLOOR_ACCEL = 0.58;
export const AIR_ACCEL_RATIO = 0.22 / 0.3;
/** Airborne with no key, vx stops under friction_thresh (80 of vx_max 335). */
export const AIR_STOP_RATIO = 80 / 335;
/** Off a ladder sideways: vx_off_ladder 300 of vx_max 335, with a tenth of a jump. */
export const OFF_LADDER_RATIO = 300 / 335;
/** vy_max 670 px/s per frame: the fall speed cap, and the rise cap (x2 while triple jumping). */
export const TERMINAL_VY = 670 / 60;
/** The same cap under its older name (tools/builder/guide.mjs). */
export const STREET_PHYSICS_TERMINAL_VY = TERMINAL_VY;
/**
 * friction_air -0.22: in the air vy gains 0.22 x vy per second (AvatarPhysicsHandler.as
 * updateAvatarVelocities 411-415, `vy += -vy * friction_air * secs`), so a jump rises a little
 * longer and a fall speeds up to the cap. A street's own friction_air replaces it.
 */
export const AIR_FRICTION = -0.22;
/**
 * The remake's own movement before 2026-11-03 (gravity 0.42, launch -9.6, no air friction: a
 * 105 px jump), as multipliers on the frame above. The rebuilt quest rooms were laid out in it
 * (Mental Block's one block never two, the colour rooms' 100 px rises), so their scenes keep it
 * (features/quest-instances-feature.js) until they are laid out again at the client's scale.
 */
export const REMAKE_ROOM_PHYSICS = Object.freeze({ gravity: 0.42 / GRAVITY, jump: 9.6 / -JUMP_SPEED, airFriction: 0 });
/**
 * The most 60 fps frames one game tick stands for: 6 is 10 fps, Pixi's ticker minFPS. Below that
 * the game slows down instead of catching up (a hidden tab or a long stall is dropped, never
 * replayed as a burst of steps that would slow the next tick further).
 */
export const MAX_TICK_FRAMES = 6;

/**
 * PURE: one tick of `frames` (Pixi ticker.deltaTime: 1 at 60 fps, 4 at 15 fps, 0.5 at 120) as
 * equal movement steps of at most one frame each, at most MAX_TICK_FRAMES in all. The avatar is
 * stepped as the client stepped it (17 ms slices, StageBeacon.as TARGET_PHYSICS_FRAMERATE 60)
 * at any frame rate, so a jump is in the air as long at 15 fps as at 120. Until 2026-11-04 the
 * tick was one step capped at 2.5 frames: below 24 fps the world ran in slow motion (a 0.98 s
 * jump took 1.2 s at 20 fps and 1.6 s at 15).
 */
export function frameSteps(frames, max = MAX_TICK_FRAMES) {
  const total = Math.min(Math.max(0, Number(frames) || 0), max);
  if (!(total > 0)) return [];
  const n = Math.max(1, Math.ceil(total - 1e-9));
  return Array.from({ length: n }, () => total / n);
}

/** The avatar's height against walls at scale 1 (blockBarrierCrossing bodyH); ceilings use avatarHeadReach. */
export const AVATAR_BODY_H = 80;
/** The street ground resolve's snap (resolveGround's `snap`), as game.js calls it. */
export const GROUND_SNAP = 16;
/** The avatar never goes nearer the street's ends than this. */
export const EDGE_MARGIN = 24;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Neutral street physics (no per-street setting, no buffs). */
export const NORMAL_BUFF = Object.freeze({
  speed: 1, jump: 1, gravity: 1, vyMax: null, accel: 1, airAccel: 1, friction: 1, airDrag: 0, airFriction: null, jetpack: false, tripleJump: 1,
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
    airFriction: Number.isFinite(extra.airFriction) ? extra.airFriction : null,
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

/** The air's vertical friction: the street's friction_air (a drag when over 0), else normal -0.22. */
export function airFriction(buff) {
  const drag = buff?.airDrag > 0 ? buff.airDrag : null;
  const own = Number.isFinite(buff?.airFriction) ? buff.airFriction : null;
  if (drag != null && own != null) return Math.max(drag, own);
  return drag ?? own ?? AIR_FRICTION;
}

/**
 * The client's vertical frame in its order (AvatarPhysicsHandler.as updateAvatarVelocities
 * 411-415, then boundAvatarVelocities 433-442): friction_air on vy while airborne, gravity, then
 * vy bounded at vy_max falling and rising, at twice vy_max while a triple jump rises
 * (`triple_jumping`, cleared once vy turns downward, 756-761, or on landing). A swim (jetpack)
 * also bounds vx to vx_max every frame. Mutates `body`.
 */
export function avatarFall(body, buff, dt) {
  if (!body.onGround) body.vy *= Math.max(0, 1 - (airFriction(buff) * dt) / 60);
  body.vy += GRAVITY * (buff.gravity ?? 1) * dt;
  streetPhysicsFreeFall(body, buff, dt);
}

/**
 * PURE: a jump from flat ground at `multiplier` times JUMP_SPEED with these physics (multipliers
 * as NORMAL_BUFF), stepped with avatarFall at whole 60 fps frames as the validator steps it;
 * `triple` lets it rise at twice vy_max. Returns { apex, frames }: how high the feet rise and the
 * frames until they are back at the take-off height. Normal: 142.5 px (the client: 143 at its
 * 17 ms steps) and 59 frames.
 */
export function flatJump(multiplier = 1, buff = NORMAL_BUFF, { triple = false } = {}) {
  const body = { vx: 0, vy: JUMP_SPEED * (buff.jump ?? 1) * multiplier, onGround: false, tripleJumping: triple };
  let y = 0;
  let top = 0;
  let frames = 0;
  for (; frames < 4000; frames += 1) {
    avatarFall(body, buff, 1);
    y += body.vy;
    top = Math.min(top, y);
    if (y >= 0 && body.vy >= 0) break;
  }
  return { apex: -top, frames: frames + 1 };
}

/** PURE: flatJump's apex alone. */
export function jumpApex(multiplier = 1, buff = NORMAL_BUFF, opts = {}) {
  return flatJump(multiplier, buff, opts).apex;
}

/** The jetpack's vx bound and the vy_max cap (the street's vy_max multiplier, else normal). */
export function streetPhysicsFreeFall(body, buff, dt) {
  // A swim (jetpack) bounds vx to vx_max every frame, as boundAvatarVelocities does: a
  // run-up into A Summer's Day's pool no longer carries you across it at walking speed.
  if (buff.jetpack) {
    const vxCap = WALK_MAX * buff.speed;
    body.vx = clamp(body.vx, -vxCap, vxCap);
  }
  const cap = TERMINAL_VY * (buff.vyMax > 0 ? buff.vyMax : 1);
  body.vy = clamp(body.vy, -(body.tripleJumping ? cap * 2 : cap), cap);
  if (body.vy > 0) body.tripleJumping = false;
}

/**
 * The floor under the feet (screen y): the street ground resolve, else the lowest standable line
 * near x (imported streets have seams, so a small gap is bridged), else the bottom of every line.
 * The near line is read at x, not at its middle (ticket 98): a sloped flight's middle height made
 * a flat ledge in the air over its low half, and a fall stopped on it.
 * A gap over a buried signpost is a hole to jump into (the Great Hole to Ix): fall, and never get
 * pulled back up onto the rim from below. `fallback` is the floor of a street with no lines.
 */
/** How far under a line the feet may be and still be put on it (a seam or a slope's step). */
export const UNDER_LINE_SLACK = 24;

export function avatarGround(platforms, px, py, vy, { street = null, fallback = 0, bottom = null } = {}) {
  if (platforms?.length) {
    const hit = resolveGround(platforms, px, py, vy ?? 0, GROUND_SNAP);
    if (hit) return hit.y;
    let best = null;
    let bestY = -Infinity;
    for (const p of platforms) {
      if (!isStandable(p)) continue; // an underside is never the floor (pc_perm 1)
      const minX = Math.min(p.x1, p.x2);
      const maxX = Math.max(p.x1, p.x2);
      if (px < minX - 8 || px > maxX + 8) continue;
      const y = platformYAt(p, Math.min(maxX, Math.max(minX, px)), 0);
      if (y != null && y > bestY) {
        bestY = y;
        best = y;
      }
    }
    const hole = street ? buriedSignpostUnder(street, px, Infinity) : null;
    // The near line is a floor only for feet at it or above it. Feet well under it are under a
    // ledge, not on one (lines are one-way from above, as the client's): ticket 189, walking off
    // the end of Greyving Grays' lower gut over its open shaft lifted the avatar 2,260 px up onto
    // the only line at that x, the gut's upper bend.
    if (best != null && py >= best - 80 && py <= best + UNDER_LINE_SLACK && !(hole && py > best + 24)) return best;
    if (hole) return worldToScreen(street, px, street.bounds?.b ?? 0).y;
    // `bottom`: the lowest line of the whole street when `platforms` is only the lines near x.
    return bottom ?? platforms.reduce((m, p) => Math.max(m, p.y1, p.y2), 0);
  }
  return fallback;
}

/**
 * One frame of the walking or airborne avatar (game.js physics(), the branch that is neither
 * climbing, a Paradise course nor held by a menu), in the game's order: air friction, gravity
 * and the vy_max cap (avatarFall), the move, the street's ends, a rising head against undersides,
 * walls, then the floor (with the slope-walk stick). Mutates and returns `body`; `tripleJumping`
 * on it (set by the jump) lets a triple jump rise at twice vy_max.
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
  avatarFall(body, buff, dt);
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
    body.tripleJumping = false;
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
