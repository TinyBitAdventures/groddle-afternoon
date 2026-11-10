/**
 * How gems are found, told to players (register G617; Austin 2026-11-10: "Tell players how gems
 * are found: a line on a project's moonstone ask and in the mining tooltip that gems need Truly
 * Outrageous. No balance change.").
 *
 * These words are the remake's own (the original had no such hint). They hold for all five gems:
 * each is a row of the gem_small drop table (imagination-effects.js GEM_SMALL_DROPS), which a
 * swing rolls only with a Truly Outrageous card (mining_drop_1-4, "Truly Outrageous I" to "IV"
 * in the Upgrades shop; mining.js mineRock). A few other rare drop tables can turn up a gem too,
 * so the project line does not say only. Nothing here changes odds, costs or drops.
 */
import { GEM_ITEMS } from './imagination-effects.js?v=70169933';

export const GEM_CARD_NAME = 'Truly Outrageous';

export const GEM_HINTS = Object.freeze({
  /** Under a street project's gem ask (features/street-jobs-feature.js). */
  project: `Gems turn up while mining once you have a ${GEM_CARD_NAME} upgrade card.`,
  /** On a rock's Mine tooltip, only for a player with none of the four cards (content.js). */
  mining: `Gems need a ${GEM_CARD_NAME} upgrade card.`,
});

/** One of the five gems (gem_amber ... gem_diamond)? */
export const isGem = (classTsid) => Object.hasOwn(GEM_ITEMS, String(classTsid || ''));

/**
 * The gem line for a rock's Mine tooltip. A swing rolls for a gem only with a Truly Outrageous
 * card (the profile's gem_small drop, as mineRock reads it); with one, the tooltip says nothing more.
 * @param {{ dropClassId?: string|null, dropChance?: number }|null} profile mining.js miningProfile
 */
export function miningGemHint(profile) {
  if (!profile) return '';
  return profile.dropClassId === 'gem_small' && profile.dropChance > 0 ? '' : GEM_HINTS.mining;
}
