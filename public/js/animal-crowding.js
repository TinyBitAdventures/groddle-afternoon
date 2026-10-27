/**
 * Crowding sadness, ported from Tiny Speck's GSJS (CC0). Pure rules: the
 * animal-mood feature runs them on the street you stand on, and the back
 * yard's replay (animal-husbandry.js advanceYard) reads the sulk they leave.
 *
 * Sources (glitch-GameServerJS):
 * - config_prod.js population_controls 1205-1221: per_width / min_max /
 *   max_max for npc_piggy (7 / 18 / 40), npc_butterfly and npc_chicken
 *   (4 / 6 / 20). No other class has a limit (getSadnessMax returns 9999).
 * - items/include/animal_sadness.js getSadnessMax 126-151: width is
 *   |geo.l| + |geo.r|; max = min(max(round(width / 1000) * per_width,
 *   min_max), max_max); halved (rounded) on public streets; on a POL the
 *   owner's herdkeeping_animal_sadness_2 adds round(max * 0.2), else _1 adds
 *   round(max * 0.1).
 * - animal_sadness.js onSadnessCheck 65-124 (Batterflies never; skill-quest
 *   animals set ignore_sadness): population >= max 90%, >= 0.9 max 60%,
 *   >= 0.8 max 45%, >= 0.7 max 30%. On a hit at >= 0.9 max, 5% of animals
 *   (never an incubating chicken) say "That's it! I am OUT of here! Too
 *   crowded!!!" for 7 s, a smoke_puff plays from 6.5 s and they are deleted
 *   at 7 s; every other hit starts sadness in randInt(1, 23) s. A miss at
 *   >= max puffs the animal away at once (deleted after 500 ms; again never
 *   an incubating chicken). Otherwise a piggy (or a baby) somewhere
 *   depressing goes sad in 500 ms.
 * - Callers: npc_chicken.js onContainerItemAdded/Removed 990-1006 and
 *   npc_butterfly.js 1043-1059: every chicken (butterfly) checks when
 *   another arrives on or leaves the street. Piggies check only on an
 *   arrival (npc_animal onContainerItemAdded, npc_piggy.js 1413-1415; the
 *   piggy's own onContainerItemRemoved 1043-1051 never checks), and a piggy
 *   released somewhere depressing checks itself (onReleased 1081-1083).
 *   Nothing checks on load (npc_animal onLoad 1540-1547).
 * - onSadnessStart 153-187: only on a street, never a flying or incubating
 *   chicken; is_sad for 3 minutes, fullStop, a butterfly drops to the
 *   platform below it; the interval starts at once somewhere depressing,
 *   else in randInt(1, 23) s.
 * - onSadnessInterval 189-229: a bubble for 7 s (sad_piggy for a piggy
 *   somewhere depressing, sad_baby_animals for babies, else one of the ten
 *   crowding lines 265-280); piggy rooked2 20% / too_much_nibble, chicken
 *   rooked2 20% / sit, butterfly fly-rooked; again every 30 s.
 * - onSadnessEnd 231-255: sadness ends (onRevived); !sadness_ticks + 1; at
 *   or over the limit the animal checks again in 5 minutes, below it only
 *   while it has had fewer than 4 sad spells, then the count resets.
 * - isSad 257-263: is_sad, or a piggy/baby somewhere depressing. A sad
 *   animal skips its twice-daily tick (npc_piggy.js 1834), will not walk to
 *   food (1394, 1419), is skipped by the Meat Collector (meat_collector.js
 *   371) and the Butterfly Milker (butterfly_milker.js 366), refuses the
 *   verbs in CROWD_SAD_REASONS, and a sad piggy is always captured (444).
 * - npc_chicken.js onLoad 1156-1160 / leave 943-945: a chicken somewhere
 *   depressing leaves (apiDelete) a second after loading; npc_butterfly.js
 *   onLoad 1070-1076 deletes a butterfly there at once. Neither has a puff.
 *
 * Respawn (G82, Austin's call 2026-10-23, no source equivalent): the source
 * apiDelete is for good. In the remake a street (ecology) animal that left
 * (an OUT of here leaver, a puff at the limit, a gloomy-place leaver) comes
 * back from the street's archived population at the next game-day rollover
 * (game-day.js, the boundary every daily reset uses). Released and raised
 * animals (husbandry slots) stay gone, as in the source.
 */
import { getGameDayStartMs } from './game-day.js?v=dametime-4';

/** config_prod.js population_controls 1205-1221. */
export const POPULATION_CONTROLS = Object.freeze({
  npc_piggy: Object.freeze({ perWidth: 7, minMax: 18, maxMax: 40 }),
  npc_butterfly: Object.freeze({ perWidth: 4, minMax: 6, maxMax: 20 }),
  npc_chicken: Object.freeze({ perWidth: 4, minMax: 6, maxMax: 20 }),
});
export const CROWD_CLASSES = Object.freeze(Object.keys(POPULATION_CONTROLS));
/** Which classes check when one of their class leaves the street (see Callers above). */
export const CHECK_ON_REMOVE = Object.freeze({ npc_piggy: false, npc_chicken: true, npc_butterfly: true });
/** getSadnessMax 129: "No upper limit". */
export const NO_LIMIT = 9999;

/** inc_data_imagination.js 2707-2756: the owner's card share of the POL limit (best one counts). */
export const CROWD_CARDS = Object.freeze([
  Object.freeze({ id: 'herdkeeping_animal_sadness_2', share: 0.2, name: 'Super Happy Animals' }),
  Object.freeze({ id: 'herdkeeping_animal_sadness_1', share: 0.1, name: 'Happy Animals' }),
]);

/** onSadnessCheck chance bands (70-84), highest first. */
export const CROWD_BANDS = Object.freeze([
  Object.freeze({ share: 1, chance: 0.9 }),
  Object.freeze({ share: 0.9, chance: 0.6 }),
  Object.freeze({ share: 0.8, chance: 0.45 }),
  Object.freeze({ share: 0.7, chance: 0.3 }),
]);

export const CROWD_TIMING = Object.freeze({
  /** randInt(1, 23) * 1000 before onSadnessStart (101) and before the first interval (185). */
  startMinS: 1,
  startMaxS: 23,
  /** apiSetTimer('onSadnessStart', 500) somewhere depressing (122). */
  depressedStartMs: 500,
  /** is_sad lasts 3 * 60 * 1000 (169). */
  sadMs: 3 * 60 * 1000,
  /** onSadnessInterval repeats every 30 s (228); its bubble shows 7 s (193-199). */
  intervalMs: 30 * 1000,
  bubbleMs: 7000,
  /** onSadnessEnd checks again in 5 * 60 * 1000 (244, 248) while under 4 sad spells (247). */
  recheckMs: 5 * 60 * 1000,
  quietSpells: 4,
  /** The 5% leave (86-98): bubble 7 s, puff from 6.5 s for 1.5 s (delta_y 95), deleted at 7 s. */
  leaveChance: 0.05,
  leaveBandShare: 0.9,
  leaveMs: 7000,
  leavePuffMs: 6500,
  /** The miss at the limit (104-116): puff now, deleted after 500 ms. */
  vanishMs: 500,
  puffMs: 1500,
  puffDeltaY: 95,
  /** npc_chicken.js onLoad: leave() after 1000 ms somewhere depressing. */
  gloomChickenMs: 1000,
});

/** onSadnessCheck 88 (the source's curly apostrophe). */
export const CROWD_LEAVE_LINE = 'That’s it! I am OUT of here! Too crowded!!!';

/** getSadnessResponse 266-277. */
export const CROWD_SAD_LINES = Object.freeze([
  'This sucks! Sooooo ... crowded. Making me feel sad.',
  'Damn, I am really bummed on account of how crowded it is.',
  'I am feeling claustrophobic and just … sad.',
  'Too crowded for me. Cripes!',
  'It is uncomfortable because of the crowding.',
  'Crap! So crowded. I feel sad.',
  'This crowding suuuuuuuucks.',
  'I hate how crowded it is in here.',
  'This is much too crowded for me.',
  "Ugh! Can't believe how crowded it is. Makes me so sad!",
]);

/**
 * Verbs isSad() turns off, with the source reasons: npc_piggy.js 568-570,
 * 765-767, 836-838, 930-932; npc_chicken.js butter_up 181-183, incubate
 * 563-565, squeeze 758-760; npc_butterfly.js sing_to 569-571, milk 711-713
 * (no trailing period in the source), massage 781-783.
 */
export const CROWD_SAD_REASONS = Object.freeze({
  npc_piggy: Object.freeze({
    pet: "Can't do that! Piggy is sad!.",
    nibble: "Can't do that! Piggy is sad!.",
    feed: "Can't do that! Piggy is sad!.",
    name: 'This piggy is sad, and in no mood to be called names. Even nice ones.',
  }),
  npc_chicken: Object.freeze({
    squeeze: "Can't do that! Chicken is sad!.",
    incubate: "Can't do that! Chicken is sad!.",
    butter_up: 'Hold the butter! This chicken is too sad.',
  }),
  npc_butterfly: Object.freeze({
    sing_to: "Can't do that! Butterfly is sad!.",
    milk: "Can't do that! Butterfly is sad!",
    massage: "Can't do that! Butterfly is sad!.",
  }),
});

const BABIES = new Set(['chick', 'piglet', 'caterpillar']);
const DEPRESSED_CLASSES = new Set(['npc_piggy', ...BABIES]);

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** GSJS randInt(lo, hi) (common.js 691-694): lo + floor(random * (1 + hi - lo)). */
export function randInt(lo, hi, rng = Math.random) {
  return lo + Math.floor(rng() * (1 + hi - lo));
}

/** |geo.l| + |geo.r| (getSadnessMax 131); `fallback` when a street has no bounds. */
export function streetWidth(bounds, fallback = 0) {
  if (bounds && Number.isFinite(Number(bounds.l)) && Number.isFinite(Number(bounds.r))) {
    return Math.abs(Number(bounds.l)) + Math.abs(Number(bounds.r));
  }
  return Math.max(0, num(fallback, 0));
}

/** The best herdkeeping_animal_sadness card the owner holds, or null. */
export function crowdCard(upgrades = []) {
  const owned = new Set(upgrades || []);
  return CROWD_CARDS.find((c) => owned.has(c.id)) || null;
}

/**
 * getSadnessMax: how many of a class a street holds before they get sad.
 * `pol` is a player-owned location (the remake's back yard); `upgrades`
 * are the owner's imagination cards.
 */
export function sadnessMax(classId, { width = 0, pol = false, upgrades = [] } = {}) {
  const cfg = POPULATION_CONTROLS[classId];
  if (!cfg) return NO_LIMIT;
  let max = Math.min(Math.max(Math.round(num(width) / 1000) * cfg.perWidth, cfg.minMax), cfg.maxMax);
  if (!pol) return Math.round(max / 2);
  const card = crowdCard(upgrades);
  if (card) max += Math.round(max * card.share);
  return max;
}

/** The onSadnessCheck chance for a population against its limit. */
export function crowdChance(population, max) {
  const pop = num(population);
  for (const band of CROWD_BANDS) {
    if (pop >= max * band.share) return band.chance;
  }
  return 0;
}

/** GSJS is_chance (common.js 351-361): never at <= 0, always at 1, else random <= prob. */
function isChance(prob, rng) {
  if (prob <= 0) return false;
  if (prob >= 1) return true;
  return rng() <= prob;
}

/**
 * onSadnessCheck for one animal. Returns { outcome, delayMs, chance }:
 * 'sad' (onSadnessStart after delayMs), 'leave' (the OUT of here line, gone
 * in 7 s), 'vanish' (puffed away, gone in 500 ms), 'depressed' (a piggy or
 * baby somewhere depressing, sad in 500 ms) or null.
 */
export function sadnessCheck({ classId, population = 0, max = NO_LIMIT, incubating = false, depressing = false, ignore = false, rng = Math.random } = {}) {
  if (ignore || classId === 'npc_batterfly') return { outcome: null, delayMs: 0, chance: 0 };
  const chance = crowdChance(population, max);
  const keepsEggs = classId === 'npc_chicken' && incubating;
  if (isChance(chance, rng)) {
    if (population >= max * CROWD_TIMING.leaveBandShare && isChance(CROWD_TIMING.leaveChance, rng) && !keepsEggs) {
      return { outcome: 'leave', delayMs: CROWD_TIMING.leaveMs, chance };
    }
    return { outcome: 'sad', delayMs: randInt(CROWD_TIMING.startMinS, CROWD_TIMING.startMaxS, rng) * 1000, chance };
  }
  if (population >= max) {
    if (!keepsEggs) return { outcome: 'vanish', delayMs: CROWD_TIMING.vanishMs, chance };
    return { outcome: null, delayMs: 0, chance };
  }
  if (DEPRESSED_CLASSES.has(classId) && depressing) return { outcome: 'depressed', delayMs: CROWD_TIMING.depressedStartMs, chance };
  return { outcome: null, delayMs: 0, chance };
}

/** onSadnessStart's refusals: a flying or incubating chicken stays happy. */
export function canStartSadness(classId, { flying = false, incubating = false } = {}) {
  if (classId === 'npc_chicken' && (flying || incubating)) return false;
  return true;
}

/**
 * onSadnessStart's timing: { until, firstLineAt } from `now`. Somewhere
 * depressing the first line is at once, else randInt(1, 23) s later.
 */
export function sadnessStart(now = Date.now(), { depressing = false, rng = Math.random } = {}) {
  return {
    until: now + CROWD_TIMING.sadMs,
    firstLineAt: depressing ? now : now + randInt(CROWD_TIMING.startMinS, CROWD_TIMING.startMaxS, rng) * 1000,
  };
}

/**
 * onSadnessEnd: { spells, recheck } after a sad spell ends. `spells` is the
 * new !sadness_ticks (0 once it resets).
 */
export function sadnessEnd({ population = 0, max = NO_LIMIT, spells = 0 } = {}) {
  const next = Math.max(0, Math.floor(num(spells))) + 1;
  if (population >= max) return { spells: next, recheck: true };
  if (next < CROWD_TIMING.quietSpells) return { spells: next, recheck: true };
  return { spells: 0, recheck: false };
}

/** Whether an animal's saved crowd sulk covers `at` (isSad's is_sad half). */
export function isCrowdSad(state, at = Date.now()) {
  return num(state?.crowdSadUntil, 0) > at;
}

/** onSadnessInterval's clip: rooked2 a fifth of the time, else the class's own sulk. */
export function crowdSadClip(classId, rng = Math.random) {
  if (classId === 'npc_butterfly') return 'fly-rooked';
  if (classId === 'npc_piggy') return rng() < 0.2 ? 'rooked2' : 'too_much_nibble';
  if (classId === 'npc_chicken') return rng() < 0.2 ? 'rooked2' : 'sit';
  return null;
}

/**
 * onSadnessInterval's bubble pool for a class. `depressedLines` is the
 * sad_piggy list (a piggy somewhere depressing), `babyLines` the
 * sad_baby_animals list; everything else uses the crowding lines.
 */
export function crowdSadLinePool(classId, { depressing = false, depressedLines = [], babyLines = [] } = {}) {
  if (classId === 'npc_piggy' && depressing) return depressedLines;
  if (BABIES.has(classId)) return babyLines;
  return CROWD_SAD_LINES;
}

/** npc_chicken.js / npc_butterfly.js onLoad somewhere depressing: { outcome, delayMs } or null. */
export function gloomOnLoad(classId, depressing) {
  if (!depressing) return null;
  if (classId === 'npc_chicken') return { outcome: 'leave', delayMs: CROWD_TIMING.gloomChickenMs };
  if (classId === 'npc_butterfly') return { outcome: 'vanish', delayMs: 0 };
  return null;
}

/**
 * G82: the moment before which a departed ecology animal is back: the start
 * of the current game day, or a later rollover the game ran (a forced roll,
 * QA's &animalcrowdrespawn=1), whichever is later.
 */
export function crowdRespawnBoundary(now = Date.now(), rolledAt = 0) {
  return Math.max(num(rolledAt, 0), getGameDayStartMs(now));
}

/** G82: did an ecology animal that left at `goneAt` come back by `boundary`? */
export function crowdGoneReturns(goneAt, boundary) {
  const g = num(goneAt, 0);
  return g > 0 && g < num(boundary, 0);
}
