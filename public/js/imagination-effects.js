/**
 * Imagination upgrade effects that other rule modules read, kept free of the
 * 150 KB card catalog so any module can import it. Every number is the
 * GameServerJS value (file references inline). Callers pass the player's
 * owned upgrade ids (pc.imaginationUpgrades).
 */

const asSet = (list) => (list instanceof Set ? list : new Set(Array.isArray(list) ? list : []));

function bestTier(owned, prefix, values) {
  const set = asSet(owned);
  for (let tier = values.length; tier >= 1; tier -= 1) {
    if (set.has(`${prefix}${tier}`)) return values[tier - 1];
  }
  return 0;
}

/** imagination_get_achievement_modifier (inc_imagination.js:840): Overachiever I-V. */
export function achievementRewardModifier(owned) {
  return bestTier(owned, 'achievement_reward_bonus_', [0.02, 0.04, 0.06, 0.08, 0.1]);
}

/** imagination_get_quest_modifier (inc_imagination.js:860): Fit for a King I-V. */
export function questRewardModifier(owned) {
  return bestTier(owned, 'quest_reward_bonus_', [0.02, 0.04, 0.06, 0.08, 0.1]);
}

/**
 * Scale a rewards object for display the way the quest/achievement reward
 * code pays it: xp, currants, mood and energy times (1 + modifier), rounded;
 * favor in either shape ({ giant, points } or a map of them). Items and
 * recipes are untouched.
 */
export function scaleRewards(rewards, modifier, factor = 1) {
  if (!rewards) return rewards;
  // round_to_5, as paid (quests.js roundTo5), even with no modifier.
  const k = (1 + (Number(modifier) || 0)) * (Number(factor) > 0 ? Number(factor) : 1);
  const round5 = (v) => (v % 5 >= 2.5 ? Math.trunc(v / 5) * 5 + 5 : Math.trunc(v / 5) * 5);
  const out = { ...rewards };
  for (const key of ['xp', 'currants', 'mood', 'energy']) {
    if (typeof out[key] === 'number' && Number.isFinite(out[key])) out[key] = round5(out[key] * k);
  }
  const favor = out.favor;
  if (favor && typeof favor === 'object') {
    const scaleEntry = (entry) =>
      entry && typeof entry === 'object' && typeof entry.points === 'number'
        ? { ...entry, points: round5(entry.points * k) }
        : entry;
    if (typeof favor.points === 'number') out.favor = scaleEntry(favor);
    else out.favor = Object.fromEntries(Object.entries(favor).map(([id, entry]) => [id, scaleEntry(entry)]));
  }
  return out;
}

/** storeAdjust prices (inc_stores.js:13-41): vendors sell to you 2/5/7/10% cheaper. */
export function vendorSellDiscount(owned) {
  return bestTier(owned, 'vendors_lower_sell_price_', [0.02, 0.05, 0.07, 0.1]);
}

/** storeAdjustBuyPrice (inc_stores.js:398-452): vendors pay you 2/5/7/10% more. */
export function vendorBuyBonus(owned) {
  return bestTier(owned, 'vendors_higher_buy_price_', [0.02, 0.05, 0.07, 0.1]);
}

/** Price a vendor charges: round(cost - m*cost). */
export function adjustedVendorPrice(cost, owned) {
  const m = vendorSellDiscount(owned);
  return m ? Math.round(cost - m * cost) : cost;
}

/** Price a vendor pays: round(price + m*price). */
export function adjustedVendorPayout(price, owned) {
  const m = vendorBuyBonus(owned);
  return m ? Math.round(price + m * price) : price;
}

/** include/mining.js:307-326: +round(15%) chunks on the matching rock. */
export const MINING_EXPERT_UPGRADES = Object.freeze({
  rock_metal_1: 'mining_expert_metal_rock',
  rock_dullite_1: 'mining_expert_dullite',
  rock_beryl_1: 'mining_expert_beryl',
  rock_sparkly_1: 'mining_expert_sparkly',
});

export function miningExpertBonus(rockClass, owned, chunks) {
  const id = MINING_EXPERT_UPGRADES[rockClass];
  return id && asSet(owned).has(id) ? Math.round(0.15 * chunks) : 0;
}

/** catalog_drop_tables.js gem_small (rolled by the mining_drop_1-4 overlays). */
export const GEM_SMALL_DROPS = Object.freeze([
  [50, 'gem_amber'],
  [70, 'gem_sapphire'],
  [85, 'gem_ruby'],
  [95, 'gem_moonstone'],
  [100, 'gem_diamond'],
]);

/** GSJS label / plural / base_cost / stackmax / description for the five gems. */
export const GEM_ITEMS = Object.freeze({
  gem_amber: { label: 'Pleasing Amber', namePlural: 'Pleasing Ambers', baseCost: 200, stackMax: 10, desc: 'A pleasing chunk of amber.' },
  gem_sapphire: { label: 'Showy Sapphire', namePlural: 'Showy Sapphires', baseCost: 400, stackMax: 5, desc: 'A somewhat showy sapphire.' },
  gem_ruby: { label: 'Modestly Sized Ruby', namePlural: 'Modestly Sized Rubies', baseCost: 700, stackMax: 5, desc: 'A modestly sized ruby of nonetheless staggering beauty.' },
  gem_moonstone: { label: 'Luminous Moonstone', namePlural: 'Luminous Moonstones', baseCost: 1000, stackMax: 3, desc: 'A moonstone of eerie luminosity.' },
  gem_diamond: { label: 'Walloping Big Diamond', namePlural: 'Walloping Big Diamonds', baseCost: 2000, stackMax: 3, desc: "Yep, that's a walloping big diamond." },
});

export function rollGemSmall(rng = Math.random) {
  const roll = Math.floor(rng() * 101);
  for (const [threshold, classTsid] of GEM_SMALL_DROPS) if (roll <= threshold) return classTsid;
  return GEM_SMALL_DROPS.at(-1)[1];
}

/**
 * rollCraftingBonusImagination (tool_base): chance of bonus iMG worth a share
 * of the output's base cost. tool → [upgrade, chance, share]. Source file per
 * row: items/<tool>.js around line 307-320.
 */
export const MAKING_BONUS_IMAGINATION = Object.freeze({
  frying_pan: [['cheffery_imagination', 0.1, 0.2]],
  saucepan: [['saucery_imagination', 0.1, 0.2]],
  awesome_pot: [['master_chef_imagination', 0.1, 0.2]],
  blender: [['blending_imagination', 0.1, 0.2]],
  cocktail_shaker: [['cocktail_crafting_imagination', 0.1, 0.2]],
  cauldron: [['cocktail_crafting_imagination', 0.06, 0.1]],
  knife_and_board: [['ezcooking_less_imagination', 0.1, 0.2]],
  mike_tyson_grill: [['grilling_less_imagination', 0.1, 0.2]],
  spice_mill: [['spicemilling_imagination', 0.1, 0.2]],
  fruit_changing_machine: [['fruitchanging_imagination', 0.1, 0.5]],
  bubble_tuner: [['bubbletuning_imagination', 0.1, 0.3]],
  gassifier: [['gassifying_imagination', 0.1, 0.12]],
  bean_seasoner: [['botany_imagination', 0.12, 0.15]],
  tincturing_kit: [['tincturing_imagination', 0.08, 0.15]],
  test_tube: [['alchemy_1_imagination', 0.08, 0.1]],
  alchemical_tongs: [['alchemy_2_imagination', 0.12, 0.15]],
  beaker: [['intermediate_admixing_imagination_2', 0.06, 0.1], ['intermediate_admixing_imagination_1', 0.08, 0.1]],
  fuelmaker: [['fuelmaking_imagination', 0.1, 0.15]],
  metalmaker: [['metalmaking_imagination', 0.08, 0.2]],
  tinkertool: [['toolcrafting_imagination_2', 0.12, 0.15], ['toolcrafting_imagination_1', 0.06, 0.08]],
});

/** The bonus row the player qualifies for at this tool, or null. */
export function makingBonusRow(tool, owned) {
  const set = asSet(owned);
  for (const [id, chance, share] of MAKING_BONUS_IMAGINATION[tool] || []) {
    if (set.has(id)) return { id, chance, share };
  }
  return null;
}

/** Roll the crafting bonus: round(Σ output base cost × qty × share) on a hit. */
export function rollMakingBonusImagination(tool, owned, outputValue, rng = Math.random, maxLuck = false) {
  const row = makingBonusRow(tool, owned);
  if (!row || !(outputValue > 0)) return 0;
  if (!maxLuck && rng() >= row.chance) return 0;
  return Math.round(outputValue * row.share);
}

/** getHitPointModifier 0.5 (half wear) for these tool + upgrade pairs. */
export const HALF_WEAR_UPGRADES = Object.freeze({
  frying_pan: 'cheffery_tool_wear',
  saucepan: 'saucery_tool_wear',
  awesome_pot: 'master_chef_tool_wear',
  blender: 'blending_tool_wear',
  cocktail_shaker: 'cocktail_crafting_tool_wear',
  knife_and_board: 'ezcooking_tool_wear',
  mike_tyson_grill: 'grilling_tool_wear',
  watering_can: 'lightgreenthumb_tool_wear',
  irrigator_9000: 'lightgreenthumb_tool_wear',
});

export function toolWearMultiplier(tool, owned) {
  const id = HALF_WEAR_UPGRADES[tool];
  return id && asSet(owned).has(id) ? 0.5 : 1;
}

/**
 * Integer wear for a tool after a wear multiplier. The source keeps fractional
 * points_remaining; the remake's conditions are whole points, so the fraction
 * carries over on toolState.wearCarry (half wear on a 1-point action costs a
 * point every other use).
 */
export function scaledToolWear(toolState, tool, wear, multiplier) {
  const base = Math.max(0, Number(wear) || 0);
  if (multiplier === 1 || !base) return base;
  const carry = toolState?.wearCarry?.[tool] || 0;
  const exact = base * multiplier + carry;
  const whole = Math.floor(exact + 1e-9);
  if (toolState) {
    toolState.wearCarry ||= {};
    toolState.wearCarry[tool] = Math.max(0, exact - whole);
  }
  return whole;
}

/** smelter.js:426-441: The Green Smelt (energy 5 → 3) and Strong Smelter (wear 3 → 2). */
export function smeltingOverrides(owned) {
  const set = asSet(owned);
  return {
    energyCost: set.has('smelting_energy') ? 3 : null,
    toolWear: set.has('smelting_tool_wear') ? 2 : null,
  };
}

/** wood_tree.js:698-706 Woodier Harvest: energy 12 (base 20), wear 3 (base 5). */
export function woodHarvestOverrides(owned) {
  return asSet(owned).has('gardening_harvest_wood') ? { energyCost: 12, toolWear: 3 } : null;
}

/** garden.js:362-376: crop/herb plot grow time −10% / −20%. */
export function gardenGrowModifier(gardenType, owned) {
  const prefix = gardenType === 'herb' ? 'herbalism_time_' : 'croppery_time_';
  return bestTier(owned, prefix, [0.1, 0.2]);
}

/** tinkertool.js:419-421 Tink Happy Thoughts: each repair tick adds mood = that tick's wear. */
export function repairGivesMood(owned) {
  return asSet(owned).has('tinkering_repairing_gives_mood');
}

/** rook damage from a shrine the player primed (shrines.js:1040-1045): +25% / +50%. */
export function shrinePrimeBonus(owned) {
  return bestTier(owned, 'piety_shrine_prime_bonus_', [0.25, 0.5]);
}

/**
 * skills_get_learning_time_modifier (inc_skills.js:1792) with
 * config.skill_learning_modifier_step 0.05: 15% for the very first skill,
 * otherwise 1.05^(known + queued - brain capacity) once over capacity.
 */
export function learningTimeModifier(count, brainCapacity = 20) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return 0.15;
  const over = Math.max(0, n - Math.max(0, Math.floor(Number(brainCapacity) || 0)));
  return 1.05 ** over;
}

/**
 * Seconds factor for one skill (skills_points_to_seconds): the learning
 * modifier, then the category reduction (100 - percent) / 100 when one is set.
 * @param {{ count: number, brainCapacity: number, categoryId?: number, reductions?: Record<number, number> }} ctx
 */
export function skillTimeFactor({ count = 0, brainCapacity = 20, categoryId = null, reductions = {} } = {}) {
  let factor = learningTimeModifier(count, brainCapacity);
  const pct = categoryId == null ? 0 : Number(reductions?.[categoryId]) || 0;
  if (pct) factor *= (100 - pct) / 100;
  return factor;
}
