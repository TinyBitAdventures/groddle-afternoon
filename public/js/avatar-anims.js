/**
 * Glitch avatar sheet animations, from the client:
 *  - com/tinyspeck/core/data/AvatarAnimationDefinitions.as: which swf frame
 *    numbers each sheet PNG holds (sorted, base frames removed from the
 *    others) and each animation's frame list. Avatar sheets play at 30 fps
 *    (the tinyspeck avatar-animations demo steps every 33 ms).
 *  - com/tinyspeck/engine/view/renderer/util/AvatarAnimationState.as: which
 *    animation the avatar shows for its physics state.
 *
 * The sheets are Tiny Speck's vector avatar composited at these swf frames
 * (js/avatar-compositor.js; the default look prerendered as VECTOR_AVATAR in
 * js/avatar-vector-sheets.js). The layout was first read off a player's
 * 2012 sheets from Wayback (62d8dab1), which stay research reference only:
 * tools/avatar-compositor/score.mjs checks poses against them offline.
 */

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Standing idles and the AFK doze (AvatarAnimationDefinitions defs). */
const IDLE_ANIMS = Object.freeze({
  idle1: [801, ...range(806, 821), ...range(815, 820).reverse(), ...range(816, 821), ...range(806, 820).reverse(), 801],
  idle2: [801, ...range(852, 861), 861, 861, ...range(852, 860).reverse(), ...range(874, 892), ...range(852, 861), 861, 861, ...range(852, 860).reverse(), 801, ...range(914, 941), 801, 801, 801],
  idle3: [801, ...range(946, 961), ...Array(12).fill(961), ...range(974, 989), ...Array(40).fill(989), ...range(1030, 1047), 801],
  idle4: [...range(1049, 1067), ...Array(25).fill(1067), ...range(1093, 1103), 1103, 1103, ...range(1106, 1126), ...Array(18).fill(1049)],
  idleSleepyStart: [801, 801, 494, 494, 495, 496, 496, ...range(498, 503), 505, 507, 509, 511, 513, 514, ...range(521, 542).reverse()],
  idleSleepyLoop: [...range(521, 547), ...range(521, 546).reverse(), ...range(522, 547), ...range(521, 546).reverse()],
  idleSleepyEnd: [...range(521, 542), 514, 513, 511, 509, 507, 505, 503, 502, 501, 500, 499, 498, 496, 496, 495, 494, 494, 801, 801],
});

/**
 * A sheet's cells as the client's init builds them: the sorted unique frames
 * of its animations, less any frame the base sheet already holds.
 */
function sheetOf(anims, base = []) {
  return Object.freeze([...new Set(anims.flat())].filter((fn) => !base.includes(fn)).sort((a, b) => a - b));
}
const BASE_FRAMES = Object.freeze([...range(103, 114), 489, 490, 801]);

/** Swf frame numbers held by each sheet, in cell order. */
export const SHEET_FRAMES = Object.freeze({
  base: BASE_FRAMES,
  jump: Object.freeze(range(192, 224)),
  climb: Object.freeze(range(1145, 1163)),
  angry: Object.freeze([...range(625, 637), ...range(688, 694)]),
  happy: Object.freeze([...range(405, 418), ...range(472, 478)]),
  surprise: Object.freeze([...range(225, 237), ...range(287, 294)]),
  idle1: sheetOf([IDLE_ANIMS.idle1], BASE_FRAMES),
  idle2: sheetOf([IDLE_ANIMS.idle2], BASE_FRAMES),
  idle3: sheetOf([IDLE_ANIMS.idle3], BASE_FRAMES),
  idle4: sheetOf([IDLE_ANIMS.idle4], BASE_FRAMES),
  idleSleepy: sheetOf([IDLE_ANIMS.idleSleepyStart, IDLE_ANIMS.idleSleepyLoop, IDLE_ANIMS.idleSleepyEnd], BASE_FRAMES),
});

/** Sheets every look loads up front, and the idle sheets loaded on demand (first long stand, first AFK). */
export const CORE_SHEETS = Object.freeze(['base', 'jump', 'climb', 'angry', 'happy', 'surprise']);
export const IDLE_SHEETS = Object.freeze(['idle1', 'idle2', 'idle3', 'idle4', 'idleSleepy']);
const framesOf = (names) => [...new Set(names.flatMap((n) => SHEET_FRAMES[n]))].sort((a, b) => a - b);
/** Swf frames of the core sheets, then the idle sheets' own: the compositor data's frame order. */
export const CORE_FRAMES = Object.freeze(framesOf(CORE_SHEETS));
export const IDLE_FRAMES = Object.freeze(framesOf(IDLE_SHEETS).filter((fn) => !CORE_FRAMES.includes(fn)));

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
  hit1: [489],
  hit2: [490],
  // Emotions (TSFrontController.playEmotionAnimation): ~3 s each, replacing the stand.
  angry: [625, 626, 627, 628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 636, 635, 636, 637, 636, 635, 636, 637, 636, 635, 636, 637, 636, 635, 636, 637, 636, 635, 636, 637, 636, 635, 636, 637, 636, 635, 636, 637, 636, 635, 688, 689, 690, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 691, 692, 693, 694, 625],
  happy: [405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 417, 416, 415, 416, 417, 418, 417, 416, 415, 416, 417, 418, 417, 416, 415, 416, 417, 418, 417, 416, 415, 416, 417, 418, 417, 416, 415, 416, 417, 418, 417, 416, 415, 416, 417, 418, 417, 416, 415, 416, 417, 418, 417, 416, 415, 416, 417, 418, 472, 473, 474, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 475, 476, 477, 478, 405],
  surprise: [225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 236, 235, 236, 237, 236, 235, 236, 237, 236, 235, 236, 237, 236, 235, 236, 237, 236, 235, 236, 237, 236, 235, 236, 237, 236, 235, 236, 237, 287, 288, 289, 290, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 292, 293, 294, 225],
  // Standing idles (STAND = idle4 looping; random idle1-3/idle0/idle4) and the AFK doze.
  ...IDLE_ANIMS,
});

/** Emotions a player can show (player.js emotion_types); each lasts 3000 ms (setEmotionTimeout). */
export const EMOTIONS = Object.freeze(['happy', 'surprise', 'angry']);
export const EMOTION_MS = 3000;

/** Frames the fall settles into after its run (212, 213, 214, 213 ... 4 ticks each). */
export const FALL_LOOP = Object.freeze([
  214, 214, 214, 214, 213, 213, 213, 213, 212, 212, 212, 212, 213, 213, 213, 213,
]);

/**
 * AFK (AvatarAnimationState.AFK): idleSleepyStart, idleSleepyLoop x5,
 * idleSleepyEnd as one sequence, looped while away (gotoAndLoopSequence).
 */
export const AFK_SEQUENCE = Object.freeze([
  ...IDLE_ANIMS.idleSleepyStart,
  ...Array.from({ length: 5 }, () => IDLE_ANIMS.idleSleepyLoop).flat(),
  ...IDLE_ANIMS.idleSleepyEnd,
]);

/** AvatarAnimationState.DEFAULT_IDLE_STR: the stand loops idle4. */
export const STAND_ANIM = 'idle4';
/** AvatarAnimationState.IDLES_TO_RANDOM (idle0 is the still stand frame). */
export const IDLES_TO_RANDOM = Object.freeze(['idle1', 'idle2', 'idle3', 'idle0', 'idle4']);
/** AvatarView random_idle_wait_ms / random_idle_ms. */
export const RANDOM_IDLE_WAIT_MS = 15000;
export const RANDOM_IDLE_MS = 6000;
/** AvatarController AFK_TIMEOUT: no key or click for 120 s. */
export const AFK_TIMEOUT_MS = 120000;
/** The sheet an idle state draws from (null: the base sheet). */
export function idleSheetFor(state) {
  if (state === 'stand' || state === 'idle4') return 'idle4';
  if (state === 'idle1' || state === 'idle2' || state === 'idle3') return state;
  if (state === 'afk' || state === 'wake') return 'idleSleepy';
  return null;
}

/**
 * AvatarView's random idle timer (calcAndSetAvatarViewAnimationState):
 * standing for waitMs starts one random idle (IDLES_TO_RANDOM) for idleMs,
 * then the timer restarts. Any non-standing frame, hit or emotion resets it
 * (resetIdleTimer). The pick is made `leadMs` early (`upcoming`) so its sheet
 * can load before it plays; the choice and odds are the client's.
 */
export function createIdleClock({ waitMs = RANDOM_IDLE_WAIT_MS, idleMs = RANDOM_IDLE_MS, leadMs = 3000, pick = () => IDLES_TO_RANDOM[Math.floor(Math.random() * IDLES_TO_RANDOM.length)] } = {}) {
  const clock = {
    startedAt: null,
    random: null,
    upcoming: null,
    reset() {
      clock.startedAt = null;
      clock.random = null;
      clock.upcoming = null;
    },
    standingMs(now) {
      return clock.startedAt == null ? 0 : now - clock.startedAt;
    },
    /** One frame: standing (STAND or a hit) or not; returns the random idle or null. */
    step(now, standing) {
      if (!standing) {
        clock.reset();
        return null;
      }
      if (clock.startedAt == null) {
        clock.startedAt = now;
        return null;
      }
      const ms = now - clock.startedAt;
      if (ms > waitMs + idleMs) {
        clock.reset();
        return null;
      }
      if (clock.upcoming == null && ms > waitMs - leadMs) clock.upcoming = pick();
      if (ms > waitMs && clock.random == null) clock.random = clock.upcoming ?? pick();
      return clock.random;
    },
  };
  return clock;
}

/**
 * AvatarView.getStandInForStand for a standing avatar: a hit, then idle4
 * while a choices dialog has focus, then an emotion, AFK, the random idle,
 * else the stand. `idles`: the look has idle frames (every vector look);
 * without them the stand stays the still idle0 frame.
 */
export function standInState(s) {
  if (s.hit === 'hit1' || s.hit === 'hit2') return s.hit;
  if (s.idles && s.choices) return 'idle4';
  if (EMOTIONS.includes(s.emotion)) return s.emotion;
  if (!s.idles) return 'stand';
  if (s.afk) return 'afk';
  if (s.waking) return 'wake';
  if (s.randomIdle) return s.randomIdle;
  return 'stand';
}

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
    // AvatarView.getStandInForStand replaces the stand (hit, emotion, idles, AFK).
    if (!s.moving) return standInState(s);
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

/**
 * Which source animation (and whether it loops) plays for a state. With
 * `idles` the stand loops idle4 (STAND); without, it holds idle0.
 */
export function animForState(state, { idles = false } = {}) {
  switch (state) {
    case 'stand': return idles ? { anim: STAND_ANIM, loop: true } : { anim: 'idle0', loop: false };
    case 'idle0': return { anim: 'idle0', loop: false };
    case 'idle1': case 'idle2': case 'idle3': case 'idle4': return { anim: state, loop: false };
    case 'afk': return { anim: 'afk', loop: true };
    case 'wake': return { anim: 'idleSleepyEnd', loop: false };
    case 'walk1x': return { anim: 'walk1x', loop: true };
    case 'walk2x': return { anim: 'walk2x', loop: true };
    case 'climb': return { anim: 'climb', loop: true };
    case 'climbPause': return { anim: 'climb', loop: false, hold: true };
    case 'lift': return { anim: 'jumpOver_lift', loop: false };
    case 'fall': return { anim: 'jumpOver_fall', loop: false, then: FALL_LOOP };
    case 'land': return { anim: 'jumpOver_land', loop: false };
    case 'hit1': case 'hit2': case 'happy': case 'surprise': case 'angry': return { anim: state, loop: false };
    default: return { anim: 'idle0', loop: false };
  }
}

/**
 * scale.x for a Glitch sprite drawn facing right (the vector NPC Glitches,
 * js/npc-glitch.js) or one drawn facing left, moving in `facing`
 * (negative = left).
 */
export function crowdScaleX(scale, facing, facesRight) {
  const left = facing < 0;
  return (left === Boolean(facesRight)) ? -scale : scale;
}
