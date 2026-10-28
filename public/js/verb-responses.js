/**
 * Which talkback an animal, tree or rock answers a finished verb with, and
 * the line (item.js chooseResponse: one of the pool at random). The pools
 * are js/verb-responses-data.js (tools/build-verb-responses.mjs). Each
 * answer carries that verb's slugs (sendResponse(key, pc, slugs), item.js
 * 1060-1065 -> sendBubble(choice, 3500, pc, slugs)).
 */

import { VERB_RESPONSE_POOLS } from './verb-responses-data.js?v=g414-1';

/** item.js sendResponse: the bubble stays 3,500 ms. */
export const VERB_RESPONSE_MS = 3500;

const has = (learned, id) => Array.isArray(learned) && learned.includes(id);

/**
 * npc_piggy.js 1745-1756 (pet), 1625-1656 (nibble); npc_chicken.js
 * 1500-1534 (squeeze); npc_butterfly.js 1145-1182 (massage), 1300-1352
 * (milk; without Butterfly Whisperer the butterfly talks gibberish).
 * `bonus` is the package's bonus roll (super harvest, or massage's extra mood).
 */
export function animalResponseKey(classId, verb, { learned = [], achievements = [], bonus = false } = {}) {
  const ak = (n) => has(learned, `animalkinship_${n}`);
  if (classId === 'npc_piggy' && verb === 'pet') {
    if (!ak(1) && !ak(2)) return 'pet_ak1';
    if (!ak(4)) return 'pet_ak2_ak3';
    if (!ak(6)) return 'pet_ak4_ak5';
    return 'pet_ak6_ak7';
  }
  if (classId === 'npc_piggy' && verb === 'nibble') {
    // 1628-1642: past the first test every Animal Kinship IV player gets bonus_ak4.
    if (bonus) return ak(4) ? 'nibble_bonus_ak4' : 'nibble_bonus_ak3';
    if (!ak(1) && !ak(2)) return 'nibble_ak1';
    if (!ak(4)) return 'nibble_ak2_ak3';
    if (!ak(6)) return 'nibble_ak4_ak5';
    return 'nibble_ak6_ak7';
  }
  if (classId === 'npc_chicken' && verb === 'squeeze') {
    if (bonus) {
      if (!ak(4)) return 'squeeze_bonus_ak3';
      if (!ak(5)) return 'squeeze_bonus_ak4';
      if (!ak(6)) return 'squeeze_bonus_ak5';
      if (!ak(7)) return 'squeeze_bonus_ak6';
      return 'squeeze_bonus_ak7';
    }
    if (!ak(2)) return 'squeeze_ak1';
    if (!ak(4)) return 'squeeze_ak2_ak3';
    if (!ak(6)) return 'squeeze_ak4_ak5';
    return 'squeeze_ak6_ak7';
  }
  if (classId === 'npc_butterfly' && (verb === 'massage' || verb === 'milk')) {
    if (!has(achievements, 'butterfly_whisperer')) return `${verb}_${ak(2) ? 'ak2_ak3' : 'ak1'}_gibberish`;
    if (bonus) {
      if (verb === 'milk' && !ak(4)) return 'milk_bonus_ak3';
      if (!ak(5)) return `${verb}_bonus_ak4`;
      if (!ak(6)) return `${verb}_bonus_ak5`;
      if (!ak(7)) return `${verb}_bonus_ak6`;
      return `${verb}_bonus_ak7`;
    }
    if (!ak(2)) return `${verb}_ak1`;
    if (!ak(4)) return `${verb}_ak2_ak3`;
    if (!ak(6)) return `${verb}_ak4_ak5`;
    return `${verb}_ak6_ak7`;
  }
  return null;
}

/**
 * include/trants.js 64-85 (pet), 172-193 (water); wood_tree.js 957-990:
 * the key follows Light Green Thumb (the remake has no tending drop yet).
 */
export function trantCareResponseKey(kind, { learned = [], gotDrop = false } = {}) {
  if (kind !== 'pet' && kind !== 'water') return null;
  const lgt = (n) => has(learned, `light_green_thumb_${n}`);
  if (gotDrop) return `${kind}_drop_${lgt(3) ? 'lgt3' : 'lgt2'}`;
  if (!lgt(1)) return `${kind}_na`;
  if (!lgt(2)) return `${kind}_lgt1`;
  if (!lgt(3)) return `${kind}_lgt2`;
  return `${kind}_lgt3`;
}

/** include/mining.js 420-495: what the rock says after a swing. */
export function rockResponseKey(rockType, toGet, { cleared = false, gem = null } = {}) {
  if (cleared) return rockType === 'metal_rock' ? 'metal_rock_disappeared' : 'rock_disappeared';
  if (gem) {
    const name = String(gem).replace(/^gem_/, '');
    return `gem_drop_${name}`;
  }
  const n = Number(toGet) || 0;
  if (rockType === 'metal_rock') return n < 9 ? 'mine_metal_rock' : 'mine_max_metal_rock';
  if (rockType === 'dullite') return n < 9 ? 'mine_dullite' : 'mine_max_dullite';
  if (rockType === 'beryl') return n < 8 ? 'mine_beryl' : 'mine_max_beryl';
  return n < 7 ? 'mine_sparkly' : 'mine_max_sparkly';
}

/**
 * The answer to a verb that failed its success roll (no slugs: runSkillPackage
 * returns before costs). npc_piggy.js 1774 pet_na_fail, 1676 nibble_na_fail;
 * include/trants.js 103 pet_na_failed, 204 water_na_failed; wood_tree.js
 * 1040-1042. npc_chicken.js has squeeze_na_failed in its table but never
 * sends it, and the butterfly's misses say nothing.
 */
export function failureResponseKey(classId, verb) {
  if (classId === 'npc_piggy') return verb === 'pet' ? 'pet_na_fail' : verb === 'nibble' ? 'nibble_na_fail' : null;
  if (/^trant_/.test(String(classId)) || classId === 'wood_tree') {
    return verb === 'pet' ? 'pet_na_failed' : verb === 'water' ? 'water_na_failed' : null;
  }
  return null;
}

/**
 * include/shrines.js 632-651: a 20x or 5x lucky bonus has its own line,
 * otherwise the tier follows the donation's whole base cost (397:
 * getBaseCost() * count): up to 10, 100, 500, or more.
 */
export function shrineDonationResponseKey(baseCost, bonus = null) {
  if (bonus === 'super') return 'super_donation_20x_xp';
  if (bonus === 'huge') return 'super_donation_5x_xp';
  const cost = Number(baseCost) || 0;
  if (cost <= 10) return 'donated_item_tier1';
  if (cost <= 100) return 'donated_item_tier2';
  if (cost <= 500) return 'donated_item_tier3';
  return 'donated_item_tier4';
}

/**
 * A resource node's answer after its verb (js/resource-nodes.js result):
 * mortar_barnacle.js 290 scrape; ice_knob.js 136-176 + 308 the yield's key
 * ("we don't have talkbacks for 5": scrape); peat_1.js 288-293 the drop
 * line when the package's drop came up; dirt_pile.js 360-445 the gone line
 * when the pile is dug out, else dig_loam / dig_dirt (_helped with a crew).
 */
export function resourceNodeResponseKey(classTsid, { qty = 0, gotDrop = false, gone = false, loam = false, helped = false } = {}) {
  if (classTsid === 'mortar_barnacle') return 'scrape';
  if (classTsid === 'ice_knob') {
    // 1 (and 5, with Ice Scraping Yield) is plain scrape; 2-4 have their own lines.
    const n = Number(qty) || 0;
    return n >= 2 && n <= 4 ? `scrape_${n}_ice` : 'scrape';
  }
  if (/^peat_[123]$/.test(String(classTsid))) return gotDrop ? 'harvest_peat_drop' : 'harvest_peat_ns_bs';
  if (classTsid === 'dirt_pile') {
    if (gone) return 'dirt_pile_gone';
    return `${loam ? 'dig_loam' : 'dig_dirt'}${helped ? '_helped' : ''}`;
  }
  return null;
}

/** The pool a class answers from (the rocks share one table, so do the peat bogs). */
export function responsePool(classId, key) {
  const id = String(classId);
  const table = /^rock_|^mineable_rock$/.test(id)
    ? VERB_RESPONSE_POOLS.rock
    : /^peat_[123]$/.test(id) ? VERB_RESPONSE_POOLS.peat_1 : VERB_RESPONSE_POOLS[classId];
  return (key && table?.[key]) || null;
}

/**
 * The bubble for one answer: { key, text, durationMs, slugs } or null when
 * the class has no such pool.
 */
export function verbResponse(classId, key, { rng = Math.random, slugs = null, speaker = '' } = {}) {
  const pool = responsePool(classId, key);
  if (!pool?.length) return null;
  const text = pool[Math.floor(rng() * pool.length) % pool.length];
  return { speaker, key, text, durationMs: VERB_RESPONSE_MS, slugs: slugs || null };
}
