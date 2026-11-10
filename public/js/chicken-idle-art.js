/**
 * A Chicken's pose on its sprite: the walk, the still, or one of the original's idle states
 * (rules, source lines and measured sheets in js/chicken-idles.js). One place for every Chicken
 * the game draws: a street's (game.js spawnChickens walkPose), one of yours (the animal-husbandry
 * feature) and one in a yard you visit (yard-verbs-mp-feature).
 *
 * The six packed sheets load the first time their state is wanted, one at a time, so a street
 * with no Chicken costs nothing; until a sheet is in, the bird holds the still it always had.
 */

import { CHICKEN_IDLE_FPS, CHICKEN_IDLE_FRAMES, chickenIdleFrame, chickenIdleSheet, chickenPoseState } from './chicken-idles.js?v=6c0c1dd3';
import { createPackedLoader } from './packed-sheets.js?v=e62b4abd';

const WALK_SPEED = 0.12;
const IDLE_STATES = Object.keys(CHICKEN_IDLE_FRAMES);
let loader = null;
let loaderFor = null;
/** Sheets asked for and sheets in memory, for QA (canvas chickenIdleSheets). */
const asked = new Set();

function idleFrames(PIXI, textures, state) {
  if (state === 'pecking_once') return textures?.chickenPeck?.frames || [];
  const def = chickenIdleSheet(state);
  if (!def || !PIXI) return [];
  if (loaderFor !== PIXI) {
    loader = createPackedLoader(PIXI);
    loaderFor = PIXI;
  }
  if (!loader.ready(def)) {
    asked.add(state);
    loader.load(def);
    return [];
  }
  return loader.frames(def);
}

/** Whether the sprite shows one of the idle states: a clip that plays once with nothing to follow it. */
export function showsChickenIdle(spr, textures) {
  const shown = spr?.textures;
  if (!shown || spr.destroyed) return false;
  if (shown === textures?.chickenPeck?.frames) return true;
  return Boolean(loader) && IDLE_STATES.some((state) => {
    const def = chickenIdleSheet(state);
    return def && loader.ready(def) && loader.frames(def) === shown;
  });
}

/**
 * One frame of a Chicken on its own walk (one of yours, or one in a yard you visit): `at` is
 * js/yard-wander.js followYardPath's answer, `wait` the pose for a player at it (chickenWaitPose:
 * '' leaves it alone) or null when nobody is.
 */
export function yardChickenPose(PIXI, textures, spr, at, wait = null) {
  if (wait != null) return wait ? chickenPose(PIXI, textures, spr, wait) : '';
  if (at?.moving) return chickenPose(PIXI, textures, spr, 'walk');
  if (at?.idle) return chickenPose(PIXI, textures, spr, at.idle, at.poseMs);
  // Standing a moment after a player leaves it: what it shows holds; a walk stops on the still.
  return showsChickenIdle(spr, textures) ? '' : chickenPose(PIXI, textures, spr, 'stand');
}

/** The idle states whose sheets have been asked for so far (QA). */
export function chickenIdleSheetsAsked() {
  return [...asked].sort();
}

/**
 * Show `pose` on a Chicken's AnimatedSprite: 'walk', 'stand' or an idle state ('idle1', 'idle2',
 * 'idle3', 'pause', 'pecking_twice', 'pecking_once', 'verb'; 'peck' is pecking_once). `ms`: how
 * long ago the state began (a shared path knows; null starts it now). Safe to call every frame:
 * a state already showing plays on and holds its last frame. A one-shot clip with an onComplete
 * (a squeeze, a scared hop) plays to its end first. `textures` is game.js's table (chickenWalk,
 * chickenStand, chickenPeck). Returns the state shown, or '' when the sprite was left alone.
 */
export function chickenPose(PIXI, textures, spr, pose, ms = null) {
  if (!spr || spr.destroyed || (!spr.loop && spr.onComplete)) return '';
  const state = chickenPoseState(pose);
  if (state !== 'walk' && state !== 'stand') {
    const frames = idleFrames(PIXI, textures, state);
    if (frames.length) {
      if (spr.textures !== frames) {
        spr.textures = frames;
        spr.loop = false;
        spr.onComplete = null;
        spr.animationSpeed = CHICKEN_IDLE_FPS / 60;
        const k = ms == null ? 0 : chickenIdleFrame(state, ms);
        if (k >= frames.length - 1) spr.gotoAndStop(frames.length - 1);
        else spr.gotoAndPlay(k);
      }
      return state;
    }
    // Its sheet is on the way: the still meanwhile.
  }
  const still = state !== 'walk';
  const walk = (textures?.chickenWalk?.frames || []).slice(0, 6);
  const stand = textures?.chickenStand?.frames;
  if (still && stand?.length) {
    if (spr.textures[0] !== stand[0]) {
      spr.textures = stand;
      spr.loop = true;
      spr.gotoAndStop(0);
    }
    return 'stand';
  }
  if (!walk.length) return '';
  if (spr.textures[0] !== walk[0] || spr.textures.length !== walk.length) {
    spr.textures = walk;
    spr.loop = true;
    spr.animationSpeed = WALK_SPEED;
    if (still) spr.gotoAndStop(0);
    else spr.gotoAndPlay(0);
    return still ? 'stand' : 'walk';
  }
  if (still && spr.playing) spr.gotoAndStop(0);
  else if (!still && !spr.playing) spr.play();
  return still ? 'stand' : 'walk';
}
