/**
 * The Fire Dragon: the first animal made for Groddle Afternoon rather than restored
 * (Austin 2026-11-02, the "/groddle-make animal" experiment). Nothing here comes from
 * Tiny Speck's game: the rules and words are ours, and the art is AI-generated and
 * dedicated CC0 1.0 with its provenance in tools/provenance/made-sprites.json.
 *
 * It lives only where a street's population asks for it (`npc_fire_dragon` in the
 * ecology row, which the level builder writes), roams the floor like the crabs
 * (js/crabs.js), and can be petted once a game day.
 *
 * Pure rules; the world side is js/features/fire-dragon-feature.js.
 */

export const FIRE_DRAGON_CLASS = 'npc_fire_dragon';
export const FIRE_DRAGON_FEATURE_ID = 'fire-dragon';
export const FIRE_DRAGON_PLACEMENT_KEY = 'fire-dragons';
/** At most this many on one street. */
export const FIRE_DRAGON_MAX = 3;

export const FIRE_DRAGON_COPY = Object.freeze({
  label: 'Fire Dragon',
  subtitle: 'Warm to the touch',
  petted: 'The little dragon leans into your hand, and its tail flame flickers happily.',
  pettedToday: 'You already gave this dragon a pet today.',
});

/** The walk sheet: 8 frames, 120x76 logical cells (3x file), art faces right. */
export const FIRE_DRAGON_SHEET = Object.freeze({
  path: 'assets/sprites/made/fire-dragon/npc_fire_dragon_walk@3x.webp',
  fw: 120,
  fh: 76,
  cols: 8,
  frames: 8,
  /** The approved GIF ran at 10 frames a second. */
  fps: 10,
  /** Feet sit 2 px above the cell bottom (222 of 228 at 3x). */
  feetPad: 2,
});

export const FIRE_DRAGON_WALK = Object.freeze({
  speedMin: 55,
  speedMax: 65,
  left: Object.freeze([-380, -220]),
  right: Object.freeze([220, 380]),
  edge: 100,
  /** Stand a while between walks (ms). */
  restMin: 3000,
  restMax: 8000,
  stuckWaitMs: 1000,
  /** A menu or a pet stops it for this long. */
  menuWaitMs: 2000,
});

/** Mood a pet gives, once a game day per dragon. */
export const FIRE_DRAGON_PET_MOOD = 3;

const whole = (n) => (Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0);

/** PURE: how many dragons a street's population asks for (street-ecology.js featureCounts). */
export function fireDragonCount(population) {
  return Math.min(FIRE_DRAGON_MAX, whole(population?.featureCounts?.[FIRE_DRAGON_CLASS]));
}

/** PURE: the planner group for them (game.js placement plan, feature placementGroups). */
export function fireDragonPlacementGroups(population) {
  const count = fireDragonCount(population);
  return count ? [{ key: FIRE_DRAGON_PLACEMENT_KEY, count, clearance: 140 }] : [];
}

/** PURE: a walk speed in px a second. */
export function fireDragonWalkSpeed(rand = Math.random) {
  return FIRE_DRAGON_WALK.speedMin + Math.floor(rand() * (FIRE_DRAGON_WALK.speedMax - FIRE_DRAGON_WALK.speedMin + 1));
}

/** PURE: how long to stand before the next walk (ms). */
export function fireDragonRest(rand = Math.random) {
  return Math.round(FIRE_DRAGON_WALK.restMin + rand() * (FIRE_DRAGON_WALK.restMax - FIRE_DRAGON_WALK.restMin));
}

/** PURE: the next spot to walk to, kept inside the street's edges. */
export function fireDragonRoamTarget(x, goDir, bounds, rand = Math.random) {
  const range = goDir === 'left' ? FIRE_DRAGON_WALK.left : FIRE_DRAGON_WALK.right;
  let distance = Math.round(range[0] + rand() * (range[1] - range[0]));
  const l = bounds.l + FIRE_DRAGON_WALK.edge;
  const r = bounds.r - FIRE_DRAGON_WALK.edge;
  if (distance < 0 && x + distance < l) distance = Math.min(0, l - x);
  else if (distance > 0 && x + distance > r) distance = Math.max(0, r - x);
  return { distance, x: x + distance };
}

/** PURE: a dragon's saved memory (the game day it was last petted). */
export function normalizeDragonMemory(row) {
  return { pettedDay: typeof row?.pettedDay === 'string' ? row.pettedDay : '' };
}

/** PURE: the verb menu. */
export function fireDragonVerbs(memory, dayKey) {
  const petted = memory?.pettedDay === dayKey;
  return [{ id: 'dragon_pet', label: 'Pet', enabled: !petted, reason: petted ? FIRE_DRAGON_COPY.pettedToday : '' }];
}

/** PURE: pet a dragon: the mood to give and the memory to keep, or null if already petted today. */
export function petFireDragon(memory, dayKey) {
  if (memory?.pettedDay === dayKey) return null;
  return { mood: FIRE_DRAGON_PET_MOOD, memory: { ...normalizeDragonMemory(memory), pettedDay: dayKey }, message: FIRE_DRAGON_COPY.petted };
}
