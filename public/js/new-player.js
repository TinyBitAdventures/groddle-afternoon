/**
 * A new multiplayer character starts as the original game's new player
 * (Austin's playtest, 2026-10-25: "Normal folks should start fresh"), then
 * plays the Gentle Island tutorial (js/features/newxp-feature.js), whose
 * grants along the way are the starting kit.
 *
 * Solo keeps the demo kit (level 5, 5,000 iMG, a full pack and tool row,
 * starter skills and tutorial cards): marketing links, Easter eggs and QA
 * routes rely on it. Only a multiplayer character with no saved player state
 * gets this baseline, decided once when game.js loads (before the first save
 * is written), so an existing multiplayer save is never touched.
 *
 * Source (~/Documents/glitch-audit/glitch-GameServerJS):
 * - players/player.js 1188-1243 onCreate (no skip flags): currants 0
 *   (1221, "formerly 100"), mood 55 (1222), energy 55 (1223),
 *   has_done_intro 0 (1225), then goToNewNewStartingLevel (1238-1239, the
 *   tutorial at newxp_intro, 1542-1569). It creates no items: the pack and
 *   tool row start empty. The hoe, can and food kit at 1200-1218 is only
 *   for skip_newux partial resets (testing, 1747), like skip_entire_intro
 *   (1193-1197). There is no player-facing way to skip the tutorial.
 * - players/inc_stats.js stats_init: xp 0 (5-10), level from xp, so 1
 *   (12-15, stats_calc_level_from_xp 168-176: under 400 xp is level 1),
 *   currants 0 (17), imagination 0 (54), quoin_multiplier 1 (57), favor
 *   points empty (28-29), no emblems (47-49).
 * - players/inc_metabolics.js metabolics_init 2-15: energy and mood tops at
 *   metabolics_calc_max(level) (313-350): 100 at level 1.
 * - players/inc_skills.js skills_init 1-22: an empty skills container (a
 *   level above 1 with no skills is logged as an error).
 * - players/inc_imagination.js imagination_init 1-12: no upgrades; the
 *   tutorial cards are bought in the tutorial.
 * - players/inc_newxp.js newxp_testing_modal_callback 5-33 (the dev reset
 *   to a new player) agrees: imagination, xp, skills and quests reset,
 *   energy tank 100, quoin multiplier 1, currants 0, the bag emptied.
 *
 * Quoin multiplier 1 and Giant favor 0 are already the remake's default
 * states (js/quoins.js createQuoinState, js/shrines.js createShrineState).
 */

/** The source new player's stats (player.js onCreate + inc_stats.js stats_init). */
export const NEW_PLAYER_STATS = Object.freeze({
  level: 1,
  xp: 0,
  imagination: 0,
  currants: 0,
  energy: 55,
  mood: 55,
  /** metabolics_calc_max(1); the remake sets pc.energyMax from the energy tank (imagination-feature syncEnergyTank). */
  energyMax: 100,
  /** The remake's buff reward multiplier (gift_of_gab); 1 with no buffs. */
  rewardMultiplier: 1,
});

/** Source citations for each value (file:line under glitch-GameServerJS). */
export const NEW_PLAYER_SOURCE = Object.freeze({
  level: 'players/inc_stats.js:12-15 (stats_calc_level_from_xp 168-176)',
  xp: 'players/inc_stats.js:5-10',
  imagination: 'players/inc_stats.js:54',
  currants: 'players/player.js:1221',
  energy: 'players/player.js:1223',
  mood: 'players/player.js:1222',
  energyMax: 'players/inc_metabolics.js:8-10, 313-351 (max = 100 at 334)',
  quoinMultiplier: 'players/inc_stats.js:57',
  favor: 'players/inc_stats.js:28-29',
  skills: 'players/inc_skills.js:1-22',
  imaginationUpgrades: 'players/inc_imagination.js:1-12',
  inventory: 'players/player.js:1188-1243 (no createItem outside skip_newux)',
  tutorial: 'players/player.js:1238-1239 goToNewNewStartingLevel (1542-1569)',
});

/**
 * Whether this page's character is a new multiplayer player: multiplayer
 * mode, a store that loaded its server save, and no player state in it.
 * Solo, practice copies and a store that cannot read are never new players.
 * @param {string} mode GAME_MODE
 * @param {{ ready?: boolean, get(name: string): string|null }} store the save store
 */
export function isNewMultiplayerPlayer(mode, store) {
  if (mode !== 'multiplayer' || !store || store.kind !== 'multiplayer' || store.ready !== true) return false;
  try {
    const raw = store.get('playerState');
    return typeof raw !== 'string' || raw.trim() === '';
  } catch {
    return false;
  }
}

/** A fresh pc object for game.js: the source stats and no imagination upgrades. */
export function newPlayerStats() {
  return { ...NEW_PLAYER_STATS, imaginationUpgrades: [] };
}

/**
 * An empty pack: every key named by the arguments (objects or arrays of
 * class ids) set to 0. Passing the inventory defaults zeroes the remake's
 * built-in pack (createInventory's lotion and salt); passing one-time
 * migration keys (the Paradise tickets) records a deliberate zero, so the
 * migration never fills them in later.
 * @param {...(object|string[])} keySets
 * @returns {Record<string, number>}
 */
export function newPlayerInventory(...keySets) {
  const out = {};
  for (const set of keySets) {
    const keys = Array.isArray(set) ? set : Object.keys(set || {});
    for (const key of keys) if (typeof key === 'string' && key) out[key] = 0;
  }
  return out;
}
