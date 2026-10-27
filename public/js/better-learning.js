/**
 * Better Learning I to V (register G62, Austin 2026-10-27): the 2011 skills,
 * back without the 2011 skill limit.
 *
 * What survives of them:
 *  - inc_data_skills.js:3938-3940 skills_get_quest_map: learning Better
 *    Learning I, III and V offers betterlearning_get_favor_at_shrines,
 *    betterlearning_spend_favor_with_primary_giant and
 *    betterlearning_spend_huge_favor (players/inc_quests.js:974-980
 *    quests_learnt_skill_do). The three quests and the three favor quests after
 *    them are in quests/betterlearning_*.js.
 *  - quests/job_street_ph1_03.js:140, job_street_ph3_08.js:157,
 *    job_street_ph4_06.js:157, job_street_ph4_06b.js:157 and
 *    job_group_ph4_06.js:157: street project work that needs Better Learning
 *    III or V.
 *  - players/inc_imagination.js:1227-1357 imagination_convert: the one GSJS
 *    file that still asks skills_has('betterlearning_N'). When the late game
 *    retired the skills, a player who knew them was paid in cards instead:
 *    rank I one Brain Capacity, II three more plus every Learning Speed I
 *    card, III four more plus every Learning Speed II, IV four more, V five
 *    more plus every Learning Speed III (each only while the converted iMG
 *    stayed above a quarter of the original). The remake has no 2011 saves to
 *    convert, so nothing runs it.
 *  - players/inc_skills.js:1792-1810 skills_get_learning_time_modifier still
 *    says the modifier is "based on how many skills they know and which Better
 *    Learning skill level they have"; by the end its base is only the brain
 *    capacity.
 *  - Ziggyny, "Better Learning" (2011-10-05; research/coverage/
 *    deep-dive-2026-10-27/raw/ziggyny-better-learning-quotes.md): each rank
 *    raised the skill cap (20 to 21, 24, 28, 32, 37) and cut the cost of all
 *    future skills by 2, 5, 8, 12 and 20%; the learn times were 10 min,
 *    176.4 min, 11.4 h, 33.12 h and 4.4 days; III needs an emblem of Lem.
 *
 * How the numbers fit together: the quoted times are 600, 10800, 43200 and
 * 129600 seconds and 5 days, each already cut by the discount of the rank
 * before it (176.4 min = 3 h x 0.98, 11.4 h = 12 h x 0.95, 33.12 h = 36 h x
 * 0.92, 4.4 d = 5 d x 0.88). So the discount was on the skill's cost in
 * study time (point_cost turned into seconds, skills_points_to_seconds), and
 * the base costs below are those round numbers in 2011 study seconds.
 * 2011 studied about 1 point a second; the late game studies 10
 * (config_prod.js:53 skill_points_per_second), ten times faster. Austin
 * (2026-10-27) kept the 2011 proportions: each rank costs its 2011 seconds in
 * points, so at the late rate it takes a tenth of the quoted time (Better
 * Learning V: 4.4 days then, about 10.6 hours now), in step with the rest of
 * the skill tree.
 *
 * Reimagined (nothing survives, or Austin's call):
 *  - No skill limit. The 2011 cap and its 3% per skill over it are not back:
 *    the remake keeps the late game's brain capacity (20, then 5% per skill
 *    over it, inc_skills.js:1792-1810, config_prod.js:54) raised to 60 by
 *    Brain Capacity cards. The ranks only carry the discount; the late game's
 *    own conversion shows the cap part became those cards.
 *  - Descriptions, the learned text, the Intellectual category, Lem as the
 *    primary Giant (only inferred: every emblem skill unlock in the catalog is
 *    the skill's primary Giant, and III needs Lem's) and no prerequisites
 *    beyond the ranks in order and Lem's emblem.
 *
 * Stacking: the discount is one more factor in skills_points_to_seconds, after
 * the brain-capacity modifier and the category Learning Speed card
 * (inc_skills.js:1093-1118 multiplies each into the seconds). They multiply:
 * Better Learning V with Intellectual Learning Speed V on an Intellectual
 * skill is 0.8 x 0.8 = 0.64 of the time. Ranks replace each other (2% becomes
 * 5%), they never add.
 *
 * Icons: no Better Learning art survives (no art_skill_betterlearning in the
 * imagination SWFs, no glitch-items icon); familiar.js skillArtFor falls back
 * to art_brain, the Brain Capacity card art the skills turned into.
 */

export const BETTER_LEARNING_SKILL_IDS = Object.freeze([
  'betterlearning_1',
  'betterlearning_2',
  'betterlearning_3',
  'betterlearning_4',
  'betterlearning_5',
]);

/** Cost cut on every later skill, by highest rank (Ziggyny 2011-10-05). */
export const BETTER_LEARNING_DISCOUNTS = Object.freeze({ 1: 0.02, 2: 0.05, 3: 0.08, 4: 0.12, 5: 0.2 });

/** The 2011 skill cap each rank set. Not used: the limit is gone (see header). */
export const BETTER_LEARNING_2011_CAPS = Object.freeze({ 0: 20, 1: 21, 2: 24, 3: 28, 4: 32, 5: 37 });

/** Base study seconds per rank (the quoted times before the rank-before's discount). */
export const BETTER_LEARNING_BASE_SECONDS = Object.freeze({ 1: 600, 2: 10800, 3: 43200, 4: 129600, 5: 432000 });

/** 2011 study points per second; the late game's 10 (config_prod.js:53) makes every time a tenth. */
export const BETTER_LEARNING_2011_POINTS_PER_SECOND = 1;

const DESCRIPTIONS = Object.freeze({
  1: 'Learning how to learn. Better Learning I takes 2% off the time every skill you learn after it takes.',
  2: 'Better Learning II turns your 2% off into 5% off the time of every skill you learn after it.',
  3: 'Better Learning III turns your 5% off into 8% off the time of every skill you learn after it. You need to spend an Emblem of Lem first.',
  4: 'Better Learning IV turns your 8% off into 12% off the time of every skill you learn after it.',
  5: 'Better Learning V turns your 12% off into 20% off the time of every skill you learn after it.',
});

const LEARNED = Object.freeze({
  1: 'Every skill you learn from now on takes 2% less time.',
  2: 'Every skill you learn from now on takes 5% less time.',
  3: 'Every skill you learn from now on takes 8% less time.',
  4: 'Every skill you learn from now on takes 12% less time.',
  5: 'Every skill you learn from now on takes 20% less time.',
});

/** inc_data_skills.js:3938-3940 skills_get_quest_map. */
const QUESTS = Object.freeze({
  1: 'betterlearning_get_favor_at_shrines',
  3: 'betterlearning_spend_favor_with_primary_giant',
  5: 'betterlearning_spend_huge_favor',
});

function skillDef(level) {
  const id = `betterlearning_${level}`;
  return {
    classTsid: id,
    id: null,
    name: 'Better Learning',
    level,
    description: DESCRIPTIONS[level],
    learned: LEARNED[level],
    pointCost: BETTER_LEARNING_BASE_SECONDS[level] * BETTER_LEARNING_2011_POINTS_PER_SECOND,
    categoryId: 19,
    requiresLevel: 0,
    questId: QUESTS[level] || null,
    reqSkills: level > 1 ? [`betterlearning_${level - 1}`] : [],
    reqAchievements: level === 3 ? ['emblem_skill_unlock_lem_1'] : [],
    reqQuests: [],
    reqUpgrades: [],
    postSkills: level < 5 ? [`betterlearning_${level + 1}`] : [],
    giants: { lem: { primary: 1 } },
    icons: {},
    remake: 'G62',
  };
}

/** The five catalog rows, in the shape of assets/content/skills.json. */
export const BETTER_LEARNING_SKILLS = Object.freeze(
  Object.fromEntries(BETTER_LEARNING_SKILL_IDS.map((id, i) => [id, Object.freeze(skillDef(i + 1))]))
);

/**
 * Add the five rows to a mined skill catalog (after the GSJS ones, so
 * emblemUnlockSkillFor('lem') still names Teleportation III first, as
 * emblem_lem.js getUnlockSkill did). Rows already present are kept.
 * @param {Record<string, object>} catalog
 */
export function withBetterLearning(catalog) {
  if (!catalog || typeof catalog !== 'object') return catalog;
  for (const [id, def] of Object.entries(BETTER_LEARNING_SKILLS)) {
    if (!catalog[id]) catalog[id] = { ...def, reqSkills: [...def.reqSkills], reqAchievements: [...def.reqAchievements], postSkills: [...def.postSkills], giants: { lem: { primary: 1 } } };
  }
  return catalog;
}

/** Highest Better Learning rank held in a row (skills_get_highest_level). */
export function betterLearningRank(learned) {
  const set = learned instanceof Set ? learned : new Set(Array.isArray(learned) ? learned : []);
  let rank = 0;
  while (rank < 5 && set.has(`betterlearning_${rank + 1}`)) rank += 1;
  return rank;
}

/** The discount (0 to 0.2) the player's Better Learning gives every study. */
export function betterLearningDiscount(learned) {
  return BETTER_LEARNING_DISCOUNTS[betterLearningRank(learned)] || 0;
}
