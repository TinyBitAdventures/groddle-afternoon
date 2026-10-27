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
 * skills_increase_brain_capacity's `percent` (inc_skills.js:1894-1900):
 * new / old learning-time modifier for the same known + queued count.
 */
export function brainCapacityRescale(count, oldCapacity, newCapacity) {
  return learningTimeModifier(count, newCapacity) / learningTimeModifier(count, oldCapacity);
}

/**
 * Seconds factor for one skill (skills_points_to_seconds): the learning
 * modifier, then the category reduction (100 - percent) / 100 when one is set,
 * then Better Learning's cut (`discount`, 0 to 0.2, better-learning.js, G62).
 * Each multiplies the seconds, as inc_skills.js:1093-1118 does with the first two.
 * @param {{ count: number, brainCapacity: number, categoryId?: number, reductions?: Record<number, number>, discount?: number }} ctx
 */
export function skillTimeFactor({ count = 0, brainCapacity = 20, categoryId = null, reductions = {}, discount = 0 } = {}) {
  let factor = learningTimeModifier(count, brainCapacity);
  const pct = categoryId == null ? 0 : Number(reductions?.[categoryId]) || 0;
  if (pct) factor *= (100 - pct) / 100;
  const cut = Number(discount) || 0;
  if (cut > 0 && cut < 1) factor *= 1 - cut;
  return factor;
}

/* ------------------------------------------------------------------ */
/* Cards wired 2026-10-22 (register row G14)                           */
/* ------------------------------------------------------------------ */

/**
 * catalog_tags.js *_task_limit_upgrade: the tools each batch-size card
 * covers. crystalmalization_task_limit_upgrade has no card.
 */
export const TASK_LIMIT_TOOLS = Object.freeze({
  food: Object.freeze(['awesome_pot', 'frying_pan', 'knife_and_board', 'mike_tyson_grill', 'saucepan']),
  transmog: Object.freeze(['bubble_tuner', 'fruit_changing_machine', 'gassifier', 'spice_mill']),
  drink: Object.freeze(['blender', 'cocktail_shaker']),
  machine: Object.freeze(['blockmaker', 'fuelmaker', 'metalmaker', 'woodworker']),
  fiberarts: Object.freeze(['loomer']),
  tincturing: Object.freeze(['tincturing_kit']),
});

/**
 * get_task_limit_multiplier (inc_making.js:1759-1806): Captain Cook,
 * Tireless Transmogrifier, Boisterous Bartender and Mad Machinist I/II
 * (x1.5 / x2), Luscious Loomer (x2.5), Tincturing Todd (x2).
 */
export function taskLimitMultiplier(tool, owned) {
  const set = asSet(owned);
  const has = (group) => TASK_LIMIT_TOOLS[group].includes(tool);
  let m = 1;
  const pair = (group, prefix) => {
    if (!has(group)) return;
    if (set.has(`${prefix}_2`)) m = 2;
    else if (set.has(`${prefix}_1`)) m = 1.5;
  };
  pair('food', 'recipe_task_limit_food');
  pair('transmog', 'recipe_task_limit_transmog');
  pair('drink', 'recipe_task_limit_drink');
  pair('machine', 'recipe_task_limit_machines');
  if (has('fiberarts') && set.has('recipe_task_limit_loomer_1')) m = 2.5;
  if (has('tincturing') && set.has('recipe_task_limit_tincturing_1')) m = 2;
  return m;
}

/** main.js:795-799: a recipe's task_limit after the cards, Math.round. */
export function adjustedTaskLimit(taskLimit, tool, owned) {
  const base = Math.max(0, Math.floor(Number(taskLimit) || 0));
  const m = taskLimitMultiplier(tool, owned);
  return m === 1 ? base : Math.round(base * m);
}

/**
 * inc_making.js:368-375: Better / Betterer Blockmaker burn 20 / 40% less
 * fuel: tool_uses -= Math.round(tool_uses * pct).
 */
export function blockmakerFuel(fuel, owned) {
  const n = Math.max(0, Number(fuel) || 0);
  const set = asSet(owned);
  if (set.has('blockmaking_save_fuel_2')) return n - Math.round(n * 0.4);
  if (set.has('blockmaking_save_fuel_1')) return n - Math.round(n * 0.2);
  return n;
}

/** still.js:286-297: Corn / Grain / Potato Hoocher put 20% more in the hopper. */
export const HOOCHER_UPGRADES = Object.freeze({
  corn: Object.freeze({ id: 'distilling_corn', name: 'Corn Hoocher' }),
  grain: Object.freeze({ id: 'distilling_grain', name: 'Grain Hoocher' }),
  potato: Object.freeze({ id: 'distilling_potato', name: 'Potato Hoocher' }),
});

export function distillingBonus(classTsid, owned) {
  const row = HOOCHER_UPGRADES[classTsid];
  return row && asSet(owned).has(row.id) ? { multiplier: 1.2, name: row.name } : { multiplier: 1, name: '' };
}

/** machine_stand assemble_* verbs need Master Assembler; machine_base fully_disassemble needs Master Exploder. */
export function hasMasterAssembler(owned) {
  return asSet(owned).has('engineering_assemble_machine');
}

export function hasMasterExploder(owned) {
  return asSet(owned).has('engineering_disassemble_machine');
}

/** woodworker.js:264-265 and siblings: the installing overlay runs 2000 ms, 1000 with Speedy Assembler. */
export function machinePartInstallMs(owned) {
  return asSet(owned).has('engineering_reduce_time') ? 1000 : 2000;
}

/**
 * Focusing Orb cards (focusing_orb.js): Double Max Relax doubles a Max
 * Relax's energy, mood and iMG; Enlightenment / Focused Imagination pay
 * bonus iMG 8% of the time (Max Luck always).
 */
export const MEDITATION_IMAGINATION_CHANCE = 0.08;

export function meditationCards(owned) {
  const set = asSet(owned);
  return {
    maxRelaxDouble: set.has('meditative_arts_max_relax'),
    standingImagination: set.has('meditative_arts_imagination'),
    focusedImagination: set.has('focused_meditation_imagination'),
  };
}

/**
 * Levitate Longer (focusing_orb.js:315-369): min energy 12 + round(tank *
 * 0.008) instead of 20 + ..., energy cost 12, buff 8000 ms instead of 5000.
 * Levitate with Style (catalog_buffs.js:1251-1257): gravity 0.798,
 * vy_jump 1.176, friction_air 1.59 instead of gravity 0.85.
 */
export function levitationCards(owned) {
  const set = asSet(owned);
  const longer = set.has('levitation_time');
  return {
    minEnergyBase: longer ? 12 : 20,
    energyCost: longer ? 12 : 20,
    durationMs: longer ? 8000 : 5000,
    physics: set.has('levitation_physics')
      ? { jetpack: 1, gravity: 0.798, vy_jump: 1.176, friction_air: 1.59 }
      : { jetpack: 1, gravity: 0.85 },
  };
}

/** npc_fox.js:222 and 343: Bristling Bonus wears the brush 1.5x and adds 8 to 12 Fiber. */
export function foxBrushingCard(owned) {
  return asSet(owned).has('fox_brushing_bonus')
    ? { toolWearMultiplier: 1.5, rangeAdd: Object.freeze([8, 12]) }
    : { toolWearMultiplier: 1, rangeAdd: Object.freeze([0, 0]) };
}

/**
 * include/mining.js onRespawn (143-171): a respawning rock is a 150-chunk
 * mega rock at 0 / 5 / 10 / 20% (metal, dullite, beryl, sparkly), +50% of
 * that with Rock Whisperer (mining.js:419 passes the clearing player's card).
 */
export const MEGA_ROCK_CHANCE = Object.freeze({ metal_rock: 0, dullite: 0.05, beryl: 0.1, sparkly: 0.2 });
export const MEGA_ROCK_CHUNKS = 150;

export function megaRockChance(rockType, owned) {
  const chance = MEGA_ROCK_CHANCE[rockType] ?? 0.2;
  return asSet(owned).has('mining_high_capacity_rock') ? chance + 0.5 * chance : chance;
}

/** npc_sloth.js:590-601, 825-834: Friend of Metal, 7% per collision with a hiding Sloth, 5 minutes apart, 1-3 Snails. */
export const SLOTH_BONUS_SNAILS = Object.freeze({ upgrade: 'sloth_bonus_snails', chance: 0.07, cooldownMs: 5 * 60 * 1000, counts: Object.freeze([1, 2, 3]) });

export function rollSlothBonusSnails(owned, lastAt, now = Date.now(), rng = Math.random, maxLuck = false) {
  if (!asSet(owned).has(SLOTH_BONUS_SNAILS.upgrade)) return 0;
  // (!last || last > 5 min) && is_chance(0.07) || max_luck, as written.
  const ready = !lastAt || now - lastAt > SLOTH_BONUS_SNAILS.cooldownMs;
  if (!((ready && rng() < SLOTH_BONUS_SNAILS.chance) || maxLuck)) return 0;
  const counts = SLOTH_BONUS_SNAILS.counts;
  return counts[Math.min(counts.length - 1, Math.floor(rng() * counts.length))];
}

/** spindle.js:425: Spellbound Spindle, 4% of spins make String instead of Thread (Max Luck does not help). */
export function spellboundSpindle(owned, rng = Math.random) {
  return asSet(owned).has('fiber_arts_bonus_1') && rng() < 0.04;
}

/** loomer.js:309: Wondrous Weave, 4% of General Fabric batches (or Max Luck) give 2 more. */
export function wondrousWeave(owned, rng = Math.random, maxLuck = false) {
  return asSet(owned).has('fiber_arts_bonus_2') && (rng() < 0.04 || maxLuck);
}

/**
 * inc_making.js:840-875: Bonus Tool From Spare Parts. 5% of Tinkertool
 * batches (or Max Luck) also make a random tool worth 0.5x to 2x the output's
 * base cost. Candidates: catalog.class_tsids tagged tool, not no_rube, potion
 * or deleted, minus five named classes; base_cost from each item file.
 */
export const BONUS_TOOL_CANDIDATES = Object.freeze({
  ace_of_spades: 3000, alchemical_tongs: 600, awesome_pot: 300, beaker: 400, bean_seasoner: 175, blender: 150,
  bubble_tuner: 150, cauldron: 3500, class_axe: 900, cocktail_shaker: 150, construction_tool: 500, crystallizer: 2500,
  egg_seasoner: 175, fancy_pick: 1000, focusing_orb: 1200, fox_brush: 200, fruit_changing_machine: 200, frying_pan: 125,
  gassifier: 150, grand_ol_grinder: 2000, hatchet: 100, high_class_hoe: 600, hoe: 60, irrigator_9000: 750,
  knife_and_board: 75, loomer: 400, mike_tyson_grill: 175, ore_grinder: 200, pick: 500, quill: 400, saucepan: 200,
  scraper: 300, shovel: 300, smelter: 700, spice_mill: 150, spindle: 200, splendid_spindle: 2000, still: 2000,
  super_scraper: 2000, test_tube: 100, tincturing_kit: 1250, tinkertool: 500, watering_can: 75,
});

export function bonusToolCandidates(value) {
  const v = Number(value) || 0;
  return Object.keys(BONUS_TOOL_CANDIDATES).filter((id) => BONUS_TOOL_CANDIDATES[id] >= 0.5 * v && BONUS_TOOL_CANDIDATES[id] <= 2 * v);
}

export function rollBonusTool(owned, outputValue, rng = Math.random, maxLuck = false) {
  if (!asSet(owned).has('toolcrafting_bonus_tool')) return null;
  if (!(rng() < 0.05 || maxLuck)) return null;
  const list = bonusToolCandidates(outputValue);
  if (!list.length) return null;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}
