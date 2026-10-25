/**
 * G279: the two animal verbs that pay iMG for kind words, as the source has
 * them (tinyspeck/glitch-GameServerJS, CC0).
 *
 * Chicken "butter up" (items/npc_chicken.js 163-236): hidden on an
 * announcement or rooked chicken (176-177, the rook feature's menu), off while
 * incubating (178-180) or sad (181-183, animal-crowding.js), and otherwise
 * always on: no daily limit and no energy check. It loses 4 energy, adds 10
 * mood and 4 iMG (197-199, stats_add_xp takes the mood bonus) and the chicken
 * says thank you for 2 s (230).
 *
 * Butterfly "sing to" (items/npc_butterfly.js 543-693): only offered with the
 * Butterfly Whisperer badge (567), off while sad (569-571), once per
 * butterfly per game day (573-574, the skill package interval counter of
 * players/inc_skill_packages.js 681-713) and at 2 energy or less (576). The
 * butterfly picks a wisdom line by level and weight (604-630); the iMG is 5%
 * of the energy tank, doubled for the rarest line (634-635), and the energy
 * cost is twice that (636), refused if you have less (637-640). No mood. It
 * adds life points by Animal Kinship rank (642-656), says the wisdom for 5 s
 * (677), and counts the song toward the day's limit (682). The Feats
 * (685) live in js/solo-feats.js and the sound (680) in js/sound-moments.js.
 */

import { metabolicGain, moodMax, energyMax, loseEnergy } from './metabolics.js';
import { grantMoodXp } from './mood-xp.js';

export const BUTTER_UP = Object.freeze({
  verb: 'butter_up',
  label: 'butter up',
  tooltip: 'Tell this chicken how wonderful it is', // npc_chicken.js 172
  incubatingReason: 'This chicken is focused on the miracle of life! No butter!', // 179
  energyCost: 4, // 197 metabolics_lose_energy(4)
  mood: 10, // 198 metabolics_add_mood(10)
  xp: 4, // 199 stats_add_xp(4)
  bubble: "That's the nicest thing I've ever heard! Thank you!", // 230
  bubbleMs: 2 * 1000, // 230
  sound: 'HAPPY_CHICKEN', // 195
  activity: 'You buttered up a Chicken.', // 232, items/item.js 26-77 buildVerbMessage(..., 'butter up', 'buttered up')
});

export const SING_TO = Object.freeze({
  verb: 'sing_to',
  label: 'sing to',
  achievement: 'butterfly_whisperer', // npc_butterfly.js 555, 567
  tooltip: 'Sing, and get wisdom', // 556 get_tooltip with the badge
  limit: 1, // 573
  limitReason: 'You already sang to this Butterfly enough today.', // 574
  lowEnergyReason: "You don't have enough energy to do that.", // 576
  lowEnergyAt: 2, // 576 metabolics_get_energy() <= 2
  lackEnergyLine: 'You lack sufficient energy to kick out the jams. Maybe you should eat something?', // 638
  agitatedLine: 'The butterfly is agitated by your decidedly un-dulcet tones. It flies away.', // 596
  tankShare: 0.05, // 635
  energyPerXp: 2, // 636
  bubbleMs: 5000, // 677
  lifeMax: 400, // 840, 849-850 addLifePoints
  lifeCountCap: 100, // 649
  sound: 'BUTTERFLY_SING', // 680
  activity: 'You sang to a Butterfly.', // 687 buildVerbMessage(..., 'sing to', 'sang to')
  failedActivity: 'You tried to sing to a Butterfly.', // item.js 35-36
});

/**
 * npc_butterfly.js 604-618, verbatim: [chance out of 10, min level, max level, wisdom].
 * The last line has no full stop in the source.
 */
export const BUTTERFLY_WISDOM = Object.freeze([
  [10, 1, 7, "If a plant isn't hungry, don't feed it, silly."],
  [10, 1, 7, 'Have you been hoeing weedy patches to no avail? Soil Appreciation will help you.'],
  [10, 1, 7, 'After you tend a weedy patch, plant something quickly, or all your efforts will be for naught.'],
  [10, 3, 10, "If you want to choose what kinds of beans to plant, you're going to need a Bean Seasoner."],
  [10, 1, 5, "You'll have more luck nibbling piggies if you pet and feed them first."],
  [10, 1, 999, "Of course the chicken came before the egg. That's why it crossed the road."],
  [3, 1, 999, 'Cosma does not remember the butterflies, but we remember her.'],
  [5, 1, 999, 'What is the sound of one piggy napping?'],
  [5, 1, 999, "Don't take any wooden coins."],
  [10, 1, 999, "Don't sweat the petty things. Also, don't pet the sweaty things."],
  [10, 1, 999, 'A pig in the hand is worth two in the poke.'],
  [10, 1, 999, 'Now is the Kukubee Winter of our discontent.'],
  [10, 1, 7, 'Cherries are the root of all fruits'],
].map((row) => Object.freeze(row)));

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Butter up's menu state, or null when the source hides it. */
export function butterUpVerbState(state = {}) {
  if (state?.isAnnouncement) return null; // 177 is_announcement
  if (state?.incubatingEgg) return { enabled: false, reason: BUTTER_UP.incubatingReason };
  return { enabled: true, reason: '' };
}

/**
 * Run butter up on a chicken: -4 energy, +10 mood (the metabolic gate),
 * +4 iMG with the mood bonus. Mutates pc.
 */
export function butterUpChicken(state = {}, pc = {}) {
  const gate = butterUpVerbState(state);
  if (!gate || !gate.enabled) return { ok: false, msg: gate?.reason || '', effects: { energy: 0, mood: 0, xp: 0 } };
  const energyBefore = num(pc.energy);
  // G289: metabolics_lose_energy, nothing lost while dead (inc_metabolics.js 108-122).
  loseEnergy(pc, BUTTER_UP.energyCost);
  const moodBefore = num(pc.mood);
  // 197: metabolics_add_mood, nothing while dead (inc_metabolics.js 79-86).
  if (metabolicGain('mood').ok) pc.mood = Math.min(moodMax(pc), moodBefore + BUTTER_UP.mood);
  const xp = grantMoodXp(pc, BUTTER_UP.xp);
  state.butteredUp = num(state.butteredUp) + 1;
  return {
    ok: true,
    msg: BUTTER_UP.activity,
    bubble: BUTTER_UP.bubble,
    bubbleMs: BUTTER_UP.bubbleMs,
    effects: { energy: pc.energy - energyBefore, mood: num(pc.mood) - moodBefore, xp },
  };
}

/** Today's sing_to uses on this butterfly (getSkillPackageLimitUses). */
export function singUsesToday(state = {}, dayKey = '') {
  return state?.singToDay === dayKey ? num(state.singToUses) : 0;
}

/**
 * Sing to's menu state, or null when the source hides it (no badge).
 * @param {{ achievements?: string[], energy?: number, dayKey?: string }} ctx
 */
export function singToVerbState(state = {}, { achievements = [], energy = 0, dayKey = '' } = {}) {
  if (!(achievements || []).includes(SING_TO.achievement)) return null;
  if (singUsesToday(state, dayKey) >= SING_TO.limit) return { enabled: false, reason: SING_TO.limitReason };
  if (num(energy) <= SING_TO.lowEnergyAt) return { enabled: false, reason: SING_TO.lowEnergyReason };
  return { enabled: true, reason: '' };
}

/** The weighted pool for a level (620-628): each line repeated `chance` times. */
export function wisdomPool(level = 1) {
  const lv = num(level, 1);
  const pool = [];
  for (const [chance, min, max, text] of BUTTERFLY_WISDOM) {
    if (lv >= min && lv <= max) for (let i = 0; i < chance; i += 1) pool.push([chance, text]);
  }
  return pool;
}

/** iMG and energy for one song (633-636): 5% of the tank, x2 for a chance-3 line. */
export function singReward(tank, chance) {
  const boost = Math.ceil(0.5 / (num(chance, 10) / 10));
  const xp = Math.ceil(SING_TO.tankShare * num(tank, 100)) * boost;
  return { boost, xp, energyCost: xp * SING_TO.energyPerXp };
}

/** Life points per song by Animal Kinship rank (642-646). */
export function singLifeFor(akRank = 0) {
  if (akRank >= 6) return 3;
  if (akRank >= 3) return 2;
  return 1;
}

/**
 * Run sing to. Mutates pc and the butterfly's state on success.
 * @param {{ achievements?: string[], level?: number, akRank?: number, dayKey?: string, rng?: () => number }} ctx
 */
export function singToButterfly(state = {}, pc = {}, ctx = {}) {
  const none = { energy: 0, mood: 0, xp: 0 };
  const { achievements = [], level = 1, akRank = 0, dayKey = '', rng = Math.random } = ctx;
  if (!(achievements || []).includes(SING_TO.achievement)) {
    // 594-597: the handler's own refusal (the menu never offers it).
    return { ok: false, failed: true, msg: `${SING_TO.failedActivity} ${SING_TO.agitatedLine}`, effects: none };
  }
  const gate = singToVerbState(state, { achievements, energy: pc.energy, dayKey });
  if (!gate.enabled) return { ok: false, msg: gate.reason, effects: none };
  const pool = wisdomPool(level);
  if (!pool.length) return { ok: false, msg: '', effects: none };
  const roll = Math.min(0.999999, Math.max(0, num(rng(), 0)));
  const [chance, wisdom] = pool[Math.floor(roll * pool.length)]; // common.js 363 choose_one
  const reward = singReward(energyMax(pc), chance);
  if (num(pc.energy) < reward.energyCost) {
    // 637-640: refused before any counter moves.
    return { ok: false, msg: SING_TO.lackEnergyLine, effects: none, wisdom, ...reward };
  }
  // 642-656 addLifePoints (837-856): up to 400, counted only while it added any.
  let life = singLifeFor(akRank);
  const sung = num(state.timesSungTo);
  if (sung < SING_TO.lifeCountCap) {
    const before = Number.isFinite(Number(state.lifePoints)) && state.lifePoints !== '' ? num(state.lifePoints) : SING_TO.lifeMax;
    const after = Math.min(SING_TO.lifeMax, before + life);
    state.lifePoints = after;
    life = after - before;
  }
  if (life > 0) state.timesSungTo = sung + 1;
  const xp = grantMoodXp(pc, reward.xp); // 658 stats_add_xp(xp, false, ...)
  const energyBefore = num(pc.energy);
  loseEnergy(pc, reward.energyCost); // 666 metabolics_lose_energy (G289)
  // 682 incrementSkillPackageLimit: keyed by game day (current_day_key).
  state.singToUses = singUsesToday(state, dayKey) + 1;
  state.singToDay = dayKey;
  return {
    ok: true,
    msg: SING_TO.activity,
    wisdom,
    bubble: wisdom,
    bubbleMs: SING_TO.bubbleMs,
    life,
    ...reward,
    effects: { energy: pc.energy - energyBefore, mood: 0, xp },
  };
}
