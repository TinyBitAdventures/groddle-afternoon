/**
 * Glitch avatar sheet animations, from the client:
 *  - com/tinyspeck/core/data/AvatarAnimationDefinitions.as: which swf frame
 *    numbers each sheet PNG holds (sorted, base frames removed from the
 *    others) and each animation's frame list. Avatar sheets play at 30 fps
 *    (the tinyspeck avatar-animations demo steps every 33 ms).
 *  - com/tinyspeck/engine/view/renderer/util/AvatarAnimationState.as: which
 *    animation the avatar shows for its physics state.
 *
 * The sheets are a real player's renders recovered from the Wayback CDX
 * (c2.glitch.bz/avatars/2012-10-19/62d8dab1..._1350661246_{base,climb,jump}.png).
 * Each PNG is one row cropped to its content: base 15 cells of 102 x 135,
 * jump 33 of 108 x 138, climb 19 of 92 x 128.
 */

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Swf frame numbers held by each sheet, in cell order. */
export const SHEET_FRAMES = Object.freeze({
  base: Object.freeze([...range(103, 114), 489, 490, 801]),
  jump: Object.freeze(range(192, 224)),
  climb: Object.freeze(range(1145, 1163)),
});

/**
 * The avatar art and where each sheet's feet sit. Anchors put the feet line
 * (the lowest content row across a sheet's frames) and the middle of its
 * content box on the avatar's x/y; the crops differ per sheet.
 */
export const GLITCH_AVATAR = Object.freeze({
  id: '62d8dab1',
  dir: 'assets/sprites/avatar/glitch-62d8/',
  sheets: Object.freeze({
    base: { file: 'base.png', cells: 15, fw: 102, fh: 135, feetY: 133, midX: 44 },
    jump: { file: 'jump.png', cells: 33, fw: 108, fh: 138, feetY: 135, midX: 60 },
    climb: { file: 'climb.png', cells: 19, fw: 92, fh: 128, feetY: 123, midX: 57 },
  }),
  // Glitch renders avatars at the world's own scale.
  scale: 1,
  // The sheets are drawn facing right (the portrait styles face left).
  facesRight: true,
});

/** Animation frame lists (AvatarAnimationDefinitions defs). */
export const ANIMS = Object.freeze({
  idle0: [801],
  walk1x: [103, 103, 104, 105, 105, 106, 107, 107, 108, 109, 109, 110, 111, 111, 112, 113, 113, 114],
  walk2x: range(103, 114),
  jumpOver_lift: range(192, 203),
  // The source fall runs 204-214 then wobbles 212-214 for ~10 s; the wobble
  // is the loop here (fallLoop).
  jumpOver_fall: range(204, 214),
  jumpOver_land: range(215, 224),
  climb: range(1145, 1163),
});

/** Frames the fall settles into after its run (212, 213, 214, 213 ... 4 ticks each). */
export const FALL_LOOP = Object.freeze([
  214, 214, 214, 214, 213, 213, 213, 213, 212, 212, 212, 212, 213, 213, 213, 213,
]);

export const ANIM_FPS = 30;
/** PhysicsModel anim_state_land_limit_perc / anim_state_close_limit_perc. */
export const LAND_LIMIT_PERC = 0.3;
export const CLOSE_LIMIT_PERC = 0.3;

/** { sheet, index } for a swf frame number, or null. */
export function frameRef(fn) {
  for (const [sheet, frames] of Object.entries(SHEET_FRAMES)) {
    const index = frames.indexOf(fn);
    if (index >= 0) return { sheet, index };
  }
  return null;
}

/**
 * The animation for the avatar's physics (calcAnimationStateFromAPO), in the
 * remake's names: stand, walk1x, walk2x, climb, climbPause, lift, fall, land.
 * Velocities are px per second; distFromFloor is the floor's depth below the
 * feet (positive; null over a void).
 * @param {{ onLadder?: boolean, climbing?: boolean, airborne?: boolean, moving?: boolean,
 *   vx?: number, vy?: number, vxMax?: number, distFromFloor?: number|null }} s
 * @param {string} last the previous state
 */
export function avatarAnimState(s, last = 'stand') {
  if (s.onLadder) return s.climbing ? 'climb' : 'climbPause';
  if (!s.airborne) {
    if (!s.moving) return 'stand';
    return Math.abs(s.vx || 0) < 150 && (s.vxMax ?? 335) < 150 ? 'walk1x' : 'walk2x';
  }
  const vy = Number(s.vy) || 0;
  if (vy < 0) return 'lift';
  const landLimit = vy * LAND_LIMIT_PERC;
  const closeLimit = landLimit * CLOSE_LIMIT_PERC;
  const dist = s.distFromFloor;
  if (dist != null && dist < closeLimit && (last === 'land' || last === 'fall' || last === 'lift')) return last;
  if (dist != null && dist < landLimit) return 'land';
  return 'fall';
}

/** Which source animation (and whether it loops) plays for a state. */
export function animForState(state) {
  switch (state) {
    case 'walk1x': return { anim: 'walk1x', loop: true };
    case 'walk2x': return { anim: 'walk2x', loop: true };
    case 'climb': return { anim: 'climb', loop: true };
    case 'climbPause': return { anim: 'climb', loop: false, hold: true };
    case 'lift': return { anim: 'jumpOver_lift', loop: false };
    case 'fall': return { anim: 'jumpOver_fall', loop: false, then: FALL_LOOP };
    case 'land': return { anim: 'jumpOver_land', loop: false };
    default: return { anim: 'idle0', loop: false };
  }
}
