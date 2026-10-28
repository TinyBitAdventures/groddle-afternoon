/**
 * Which talkback an animal, tree or rock answers a finished verb with, and
 * the line (item.js chooseResponse: one of the pool at random). The pools
 * are js/verb-responses-data.js (tools/build-verb-responses.mjs). Each
 * answer carries that verb's slugs (sendResponse(key, pc, slugs), item.js
 * 1060-1065 -> sendBubble(choice, 3500, pc, slugs)).
 */

import { VERB_RESPONSE_POOLS } from './verb-responses-data.js?v=g412-1';

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

/** The pool a class answers from (the rocks share one table). */
export function responsePool(classId, key) {
  const table = /^rock_|^mineable_rock$/.test(String(classId)) ? VERB_RESPONSE_POOLS.rock : VERB_RESPONSE_POOLS[classId];
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
