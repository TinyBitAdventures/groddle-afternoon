/**
 * Mood scales iMG, the way players/inc_stats.js did it.
 *
 * stats_add_xp(xp, no_bonus) (inc_stats.js 260-272) runs every award through
 * stats_xp_apply_bonus (559-570) unless the caller passed no_bonus = true or
 * the player is dead (pc.is_dead):
 *
 *   stats_get_xp_mood_bonus (229-258), mood as a percentage of the tank
 *   (inc_metabolics.js metabolics_get_percentage: value / top * 100):
 *     under 10%  x0      under 20%  x0.5    under 50%  x0.75
 *     under 70%  x0.9    under 80%  x1      under 90%  x1.1    else x1.2
 *   Pleasant Equilibrium (catalog_buffs.js 1625) reads mood under 50 as 49,
 *   so the multiplier never drops below x0.75.
 *
 *   xp = Math.round(xp * multiplier);
 *   No-No Powder Rush ("no-no powder nerf"): xp = Math.round(xp * 0.2).
 *
 * Which awards take the bonus is the caller's choice in the source (the
 * no_bonus flag); MOOD_XP_SOURCES records the ones the remake has.
 * stats_add_imagination (inc_stats.js 494) never scales.
 *
 * game.js installs the live context once (setMoodXpEnv): whether the player
 * is dead (Hell) and whether a buff is active. Without it the module reads
 * pc.activeBuffs and treats the player as alive. A pc with no numeric mood
 * is not scaled (unit fixtures with no metabolics).
 */

import { moodMax } from './metabolics.js';

/** [upper bound (exclusive), multiplier], inc_stats.js 237-257. */
export const MOOD_XP_BANDS = Object.freeze([
  Object.freeze([10, 0]),
  Object.freeze([20, 0.5]),
  Object.freeze([50, 0.75]),
  Object.freeze([70, 0.9]),
  Object.freeze([80, 1]),
  Object.freeze([90, 1.1]),
  Object.freeze([Infinity, 1.2]),
]);

/** inc_stats.js 233-235: with Pleasant Equilibrium, mood under 50 counts as 49. */
export const PLEASANT_EQUILIBRIUM_FLOOR = 49;

/** inc_stats.js 564-567. */
export const NO_NO_POWDER_XP_FACTOR = 0.2;

/**
 * Every iMG award path the remake has, with the source's no_bonus choice.
 * scaled: stats_add_xp(xp) / stats_add_xp(xp, false). flat: stats_add_xp(xp,
 * true) or stats_add_imagination.
 */
export const MOOD_XP_SOURCES = Object.freeze({
  scaled: Object.freeze({
    quoin: 'items/quoin.js 184 (xp), 209 (qurazy); moving_quoin.js 223',
    skill_package: 'players/inc_skill_packages.js 532 (pet, water, harvest, mine, milk, squeeze, gardens, nodes, patches)',
    drop_table: 'players/inc_skill_packages.js 106 runDropTable',
    making: 'players/inc_making.js 1546 (recipe iMG)',
    making_bonus: 'items/tinkertool.js 726 rollCraftingBonusImagination (tool_base)',
    smelting: 'items/smelter.js, ore_*.js refine',
    buff: 'items/catalog_buffs.js 244, 270, 449, 780, 1058, 1960',
    sno_cone: 'items/sno_cone_*.js 81',
    item_verb: 'spice and gas verbs (black_pepper.js ... white_gas.js), ice.js 72',
    musicblock: 'items/musicblock_*.js play',
    conch_play: 'items/conch.js 364-382',
    animal: 'npc_piggy.js 460 (capture), 673 (feed); chick.js 213, piglet.js 233, caterpillar.js 164 (feed); plop.js 190',
    kitty: 'npc_kitty_chicken.js 248, 757',
    meditation: 'items/focusing_orb.js 824, 965, 1104-1257',
    shrine_donation: 'items/include/shrines.js 450 (multiplier applied before the cap, then no_bonus)',
    shrine_emblem: 'items/include/shrines.js 111',
    giant_icon: 'items/include/icon.js 230, 455; icon_*.js',
    fertilidust: 'items/fertilidust.js 371',
    salmon_release: 'items/salmon.js 82 release (Pocket Salmon)',
    craftybot: 'items/npc_crafty_bot.js 1132 (disperse)',
    smuggler: 'items/npc_smuggler.js 515',
    race: 'locations/inc_race.js 368, 400',
    game: 'players/inc_games.js 672, 1077, 1373 (Game of Crowns)',
    job: 'quests/job_*.js job_complete, job_complete_performance',
    rook: 'locations/inc_rook.js 198-201, 741-792; items/include/rook.js 185, 198',
    swf_wrangle: 'items/swf_1.js 68, swf_2.js 68, swf_3.js 49 wrangle (25 per SWF, no_bonus false)',
    game_play: 'items/game_box.js 185 onFinishPlayGame (250, no_bonus false)',
    loneliness: 'items/include/loneliness.js 244 (party, 200), 621 (race visit)',
  }),
  flat: Object.freeze({
    quest: 'quests/*.js quest_complete (no_bonus true)',
    achievement: 'achievements/*.js (no_bonus true)',
    food_variety: 'items/include/food.js 144 (no_bonus true)',
    cubimal: 'items/npc_cubimal_*.js set free (no_bonus true)',
    eleven_secrets: 'players/inc_eleven_secrets.js 466, 473 ("no adjustment for mood bonus")',
    seasonal: 'pumpkin.js 367, pumpkin_carved_*.js 206, pumpkin_lit_*.js 308, seed_pumpkin.js 53, egg_plain.js 208 (no_bonus true)',
    conch_blow: 'items/conch.js 507 Esquibeth reward (no_bonus true)',
    paradise_ticket: 'paradise_ticket_*.js 53 stats_add_imagination',
    teleport_refund: 'teleportation_script.js 323 stats_add_imagination',
    level_up: 'players/inc_stats.js 226 stats_next_level (no_bonus true)',
  }),
});

let env = { isDead: null, hasBuff: null };

/**
 * game.js: install the live player context.
 * @param {{ isDead?: () => boolean, hasBuff?: (classTsid: string) => boolean }} [next]
 */
export function setMoodXpEnv(next = {}) {
  env = {
    isDead: typeof next.isDead === 'function' ? next.isDead : null,
    hasBuff: typeof next.hasBuff === 'function' ? next.hasBuff : null,
  };
}

function hasBuff(pc, classTsid) {
  if (env.hasBuff) return env.hasBuff(classTsid) === true;
  return Array.isArray(pc?.activeBuffs) && pc.activeBuffs.includes(classTsid);
}

function isDead() {
  return env.isDead ? env.isDead() === true : false;
}

/** inc_metabolics.js metabolics_get_percentage('mood'); null when pc has no mood. */
export function moodPercent(pc) {
  const mood = Number(pc?.mood);
  if (pc?.mood == null || !Number.isFinite(mood)) return null;
  return (mood / moodMax(pc)) * 100;
}

/**
 * inc_stats.js stats_get_xp_mood_bonus.
 * @param {number} percent mood as a percentage of the tank
 * @param {{ pleasantEquilibrium?: boolean }} [opts]
 */
export function moodXpMultiplier(percent, { pleasantEquilibrium = false } = {}) {
  let mood = Number(percent);
  if (!Number.isFinite(mood)) return 1;
  if (mood < 50 && pleasantEquilibrium) mood = PLEASANT_EQUILIBRIUM_FLOOR;
  for (const [below, multiplier] of MOOD_XP_BANDS) {
    if (mood < below) return multiplier;
  }
  return 1.2;
}

/** The multiplier this player earns at right now (1 for a pc with no mood). */
export function moodXpMultiplierFor(pc) {
  const percent = moodPercent(pc);
  if (percent == null) return 1;
  return moodXpMultiplier(percent, { pleasantEquilibrium: hasBuff(pc, 'pleasant_equilibrium') });
}

/**
 * inc_stats.js stats_xp_apply_bonus, skipped when dead (stats_add_xp 270).
 * @returns {number} the iMG that lands
 */
export function moodScaledXp(pc, xp) {
  const amount = Number(xp) || 0;
  if (!amount || isDead()) return amount;
  let out = Math.round(amount * moodXpMultiplierFor(pc));
  if (hasBuff(pc, 'no_no_powder')) out = Math.round(out * NO_NO_POWDER_XP_FACTOR);
  return out;
}

/**
 * stats_add_xp(xp, false): scale, then add to spendable iMG and lifetime XP.
 * @returns {number} the iMG that landed, for the activity line
 */
export function grantMoodXp(pc, xp) {
  if (!pc) return 0;
  const actual = moodScaledXp(pc, xp);
  if (!actual) return 0;
  pc.imagination = (Number(pc.imagination) || 0) + actual;
  pc.xp = (Number(pc.xp) || 0) + actual;
  return actual;
}
