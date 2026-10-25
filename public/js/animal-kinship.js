/**
 * Official Animal Kinship action packages used by the street animals.
 *
 * Source: Tiny Speck GameServerJS items/catalog_skill_packages.js
 *   - ak_butterfly_massage
 *   - ak_butterfly_milk
 *   - ak_piggy_pet
 *   - ak_piggy_nibble
 *   - ak_chicken_squeeze
 *
 * Higher ranks intentionally have a zero duration where the source package
 * omits `duration`: the original server completed those packages immediately.
 */

import {
  canUseTool,
  setToolRemaining,
  useToolCondition,
} from './tools.js?v=tools-5';
import { SKILL_PACKAGES, getSkillPackageOverride, skillPackageDetails } from './skill-packages.js';
import { metabolicGain, moodMax } from './metabolics.js';
import { grantMoodXp } from './mood-xp.js';
import { petPiggy, piggyNibbleRefusal } from './animal-mood.js';

export const ANIMAL_KINSHIP_RANK_IDS = Object.freeze(
  Array.from({ length: 7 }, (_, index) => `animalkinship_${index + 1}`)
);

const profile = (
  rank,
  intervalLimit,
  durationMs,
  successRate,
  energyCost,
  moodBonus = 0,
  xpBonus = 0,
  bonusAmount = 0,
  bonusMultiplier = 0,
  bonusChance = 0,
  dropClassId = '',
  dropChance = 0,
  toolWear = 0
) => Object.freeze({
  rank,
  intervalLimit,
  durationMs,
  successRate,
  energyCost,
  moodBonus,
  xpBonus,
  bonusAmount,
  bonusMultiplier,
  bonusChance,
  dropClassId,
  dropChance,
  toolWear,
});

export const ANIMAL_KINSHIP_PACKAGES = Object.freeze({
  'npc_butterfly:massage': Object.freeze([
    profile(0, 1, 3000, 100, 10, 1, 1, 1, 0, 0, '', 0, 1),
    profile(1, 1, 1000, 100, 10, 1, 2, 1, 0, 0, '', 0, 1),
    profile(2, 1, 1000, 100, 5, 2, 2, 1, 0, 0, '', 0, 1),
    profile(3, 1, 1000, 100, 5, 2, 2, 1, 0, 0, '', 0, 1),
    profile(4, 2, 1000, 100, 5, 2, 5, 1, 5, 0.20, '', 0, 1),
    profile(5, 2, 1000, 100, 5, 2, 5, 0, 5, 0.20),
    profile(6, 2, 1000, 100, 5, 5, 10, 0, 5, 0.30),
    profile(7, 2, 1000, 100, 5, 5, 10, 0, 5, 0.30),
  ]),
  'npc_butterfly:milk': Object.freeze([
    profile(0, 1, 5000, 100, 10, 1, 1, 1),
    profile(1, 1, 3000, 100, 5, 1, 1, 1),
    profile(2, 1, 3000, 100, 5, 1, 1, 2),
    profile(3, 1, 2000, 100, 5, 1, 2, 2, 2, 0.08),
    profile(4, 1, 0, 100, 5, 1, 2, 3, 2, 0.09),
    profile(5, 1, 0, 100, 5, 2, 2, 3, 3, 0.10),
    profile(6, 2, 0, 100, 5, 2, 5, 4, 3, 0.12),
    profile(7, 2, 0, 100, 5, 5, 10, 5, 3, 0.15),
  ]),
  'npc_piggy:pet': Object.freeze([
    profile(0, 1, 4000, 90, 4, 1),
    profile(1, 1, 3000, 100, 4, 1, 1),
    profile(2, 1, 2000, 100, 4, 1, 1),
    profile(3, 1, 0, 100, 2, 2, 2),
    profile(4, 2, 0, 100, 2, 2, 2),
    profile(5, 2, 0, 100, 2, 2, 5),
    profile(6, 2, 0, 100, 2, 4, 10),
    profile(7, 2, 0, 100, 2, 4, 10),
  ]),
  'npc_piggy:nibble': Object.freeze([
    profile(0, 1, 5000, 90, 5, 0, 0, 1),
    profile(1, 1, 4000, 100, 2, 0, 0, 1),
    profile(2, 1, 3000, 100, 2, 0, 1, 2),
    profile(3, 1, 2000, 100, 2, 0, 2, 2, 2, 0.06),
    profile(4, 1, 2000, 100, 2, 0, 2, 3, 2, 0.06),
    profile(5, 1, 0, 100, 2, 2, 5, 3, 2, 0.09, 'bacon', 15),
    profile(6, 2, 0, 100, 2, 2, 5, 3, 3, 0.10, 'bacon', 20),
    profile(7, 2, 0, 100, 2, 5, 10, 4, 3, 0.12, 'bacon', 25),
  ]),
  'npc_chicken:squeeze': Object.freeze([
    profile(0, 1, 3000, 60, 1, 0, 0, 1),
    profile(1, 2, 2000, 100, 1, 0, 0, 1),
    profile(2, 3, 2000, 100, 1, 0, 0, 1),
    profile(3, 3, 0, 100, 2, 1, 1, 2, 3, 0.04),
    profile(4, 4, 0, 100, 2, 1, 1, 3, 2, 0.05),
    profile(5, 4, 0, 100, 2, 1, 2, 4, 2, 0.06, 'ak_chicken_squeeze', 3),
    profile(6, 5, 0, 100, 2, 1, 2, 4, 2, 0.08, 'ak_chicken_squeeze', 4),
    profile(7, 5, 0, 100, 2, 1, 3, 5, 2, 0.10, 'ak_chicken_squeeze', 6),
  ]),
});

const ACTION_STATE = Object.freeze({
  'npc_butterfly:massage': Object.freeze({ daily: 'massageUsesToday', total: 'massageCount', legacy: 'massaged' }),
  'npc_butterfly:milk': Object.freeze({ daily: 'milkUsesToday', total: 'milkCount', legacy: 'milked' }),
  'npc_piggy:pet': Object.freeze({ daily: 'petUsesToday', total: 'petCount', legacy: 'petted' }),
  'npc_piggy:nibble': Object.freeze({ daily: 'nibbleUsesToday', total: 'nibbleCount', legacy: 'nibbled' }),
  'npc_chicken:squeeze': Object.freeze({ daily: 'squeezeUsesToday', total: 'squeezed', legacy: 'squeezedToday' }),
});

function integer(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

export function highestAnimalKinshipRank(learned = []) {
  const known = new Set(Array.isArray(learned) ? learned : []);
  let rank = 0;
  for (let i = 1; i <= 7; i += 1) {
    if (known.has(`animalkinship_${i}`)) rank = i;
  }
  return rank;
}

/** Source skill package behind each action, for the imagination overlays. */
const AK_SOURCE_PACKAGES = Object.freeze({
  'npc_piggy:pet': 'ak_piggy_pet',
  'npc_piggy:nibble': 'ak_piggy_nibble',
  'npc_chicken:squeeze': 'ak_chicken_squeeze',
  'npc_butterfly:massage': 'ak_butterfly_massage',
  'npc_butterfly:milk': 'ak_butterfly_milk',
});

export function resolveAnimalKinshipPackage(classId, verbId, learned = [], upgrades = []) {
  const key = `${classId}:${verbId}`;
  const table = ANIMAL_KINSHIP_PACKAGES[key];
  if (!table) return null;
  const rank = highestAnimalKinshipRank(learned);
  const row = table[rank] || table[0];
  // Super Animal Harvest I-III and Grain Attraction overlay the package's
  // bonus fields (getSkillPackageDetails img_upgrades).
  const pkgId = AK_SOURCE_PACKAGES[key];
  // addSkillPackageOverride energy_cost (Easy Animalia: 0 for these five).
  const override = pkgId ? getSkillPackageOverride(pkgId) : null;
  const energy = Number.isFinite(override?.energy_cost) ? { energyCost: override.energy_cost } : null;
  const owned = new Set(Array.isArray(upgrades) ? upgrades : []);
  const img = pkgId ? SKILL_PACKAGES[pkgId]?.img_upgrades || {} : {};
  if (!Object.keys(img).some((id) => owned.has(id))) return energy ? { ...row, ...energy } : row;
  const details = skillPackageDetails(pkgId, learned, [...owned]);
  if (!details) return energy ? { ...row, ...energy } : row;
  return {
    ...row,
    bonusMultiplier: Number(details.bonus_multiplier) || row.bonusMultiplier,
    bonusChance: Number(details.bonus_chance) || row.bonusChance,
    bonusAmount: Number(details.bonus_amount) || row.bonusAmount,
    ...energy,
  };
}

/** Normalize new daily counters while preserving the older boolean save shape. */
export function ensureAnimalKinshipState(classId, state = {}) {
  if (classId === 'npc_butterfly') {
    if (state.massageUsesToday === undefined) state.massageUsesToday = state.massaged ? 1 : 0;
    if (state.milkUsesToday === undefined) state.milkUsesToday = state.milked ? 1 : 0;
    state.massageUsesToday = integer(state.massageUsesToday);
    state.milkUsesToday = integer(state.milkUsesToday);
    state.massageCount = integer(state.massageCount);
    state.milkCount = integer(state.milkCount);
    state.massaged = state.massageUsesToday > 0;
    state.milked = state.milkUsesToday > 0;
  }
  if (classId === 'npc_piggy') {
    if (state.petUsesToday === undefined) state.petUsesToday = state.petted ? 1 : 0;
    if (state.nibbleUsesToday === undefined) state.nibbleUsesToday = state.nibbled ? 1 : 0;
    state.petUsesToday = integer(state.petUsesToday);
    state.nibbleUsesToday = integer(state.nibbleUsesToday);
    state.petted = state.petUsesToday > 0;
    state.nibbled = state.nibbleUsesToday > 0;
  }
  if (classId === 'npc_chicken') {
    if (state.squeezeUsesToday === undefined) state.squeezeUsesToday = integer(state.squeezedToday);
    state.squeezeUsesToday = integer(state.squeezeUsesToday);
    state.squeezedToday = state.squeezeUsesToday;
  }
  return state;
}

function quoteFailure(reason, msg, profileData, rank, usesToday = 0) {
  return { ok: false, reason, msg, profile: profileData, rank, usesToday };
}

export function quoteAnimalKinship(state, classId, verbId, ctx = {}) {
  const key = `${classId}:${verbId}`;
  const actionState = ACTION_STATE[key];
  const rank = highestAnimalKinshipRank(ctx.learned || []);
  const selected = resolveAnimalKinshipPackage(
    classId,
    verbId,
    ctx.learned || [],
    ctx.upgrades || ctx.imaginationUpgrades || ctx.pc?.imaginationUpgrades || []
  );
  if (!actionState || !selected) {
    return quoteFailure('unsupported', 'That animal does not understand this interaction.', null, rank);
  }
  const s = ensureAnimalKinshipState(classId, state || {});
  const usesToday = integer(s[actionState.daily]);
  if (usesToday >= selected.intervalLimit) {
    const noun = verbId;
    const animalLabel = classId === 'npc_piggy'
      ? 'Piggy'
      : classId === 'npc_chicken'
        ? 'Chicken'
        : 'Butterfly';
    return quoteFailure(
      'daily_limit',
      `You can only ${noun} this ${animalLabel} ${selected.intervalLimit} ${selected.intervalLimit === 1 ? 'time' : 'times'} per game day.`,
      selected,
      rank,
      usesToday
    );
  }
  if (classId === 'npc_piggy' && verbId === 'nibble' && rank < 6 && s.petUsesToday < 1) {
    return quoteFailure('needs_pet', 'Give that Piggy some love first!', selected, rank, usesToday);
  }
  if (classId === 'npc_butterfly' && verbId === 'massage' && selected.toolWear > 0) {
    if ((Number(ctx.inv?.butterfly_lotion) || 0) < 1) {
      return quoteFailure(
        'needs_lotion',
        "Massaging a butterfly without lotion? That's not nice. It's too dry. Go find some lotion.",
        selected,
        rank,
        usesToday
      );
    }
    if (ctx.tools) {
      const lotion = canUseTool(ctx.tools, 'butterfly_lotion', selected.toolWear);
      if (!lotion.ok) {
        return quoteFailure('lotion_empty', 'That tube of Butterfly Lotion is empty.', selected, rank, usesToday);
      }
    }
  }
  if (classId === 'npc_butterfly' && verbId === 'milk' && rank < 6 && s.massageUsesToday < 1) {
    return quoteFailure(
      'needs_massage',
      'What? No warmup? Massage this Butterfly first.',
      selected,
      rank,
      usesToday
    );
  }
  const energy = Math.max(0, Number(ctx.pc?.energy) || 0);
  if (energy <= selected.energyCost) {
    return quoteFailure(
      'energy',
      `Needs ${selected.energyCost} energy (you have ${Math.floor(energy)}).`,
      selected,
      rank,
      usesToday
    );
  }
  return { ok: true, reason: 'ready', msg: '', profile: selected, rank, usesToday };
}

function awardMetabolics(pc, selected, moodBonus = selected.moodBonus) {
  const effects = { energy: 0, mood: 0, xp: 0, items: {} };
  pc.energy = Math.max(0, (Number(pc.energy) || 0) - selected.energyCost);
  effects.energy = -selected.energyCost;
  // G259: mood_bonus is metabolics_add_mood (inc_skill_packages.js 524), refused while dead.
  if (moodBonus && (moodBonus < 0 || metabolicGain('mood').ok)) {
    const before = Number(pc.mood) || 0;
    pc.mood = Math.min(moodMax(pc), before + moodBonus);
    effects.mood = pc.mood - before;
  }
  // inc_skill_packages.js 532: xp_bonus takes the mood bonus (after the mood gain).
  if (selected.xpBonus) effects.xp = grantMoodXp(pc, selected.xpBonus);
  return effects;
}

/**
 * Atomically perform one official Animal Kinship package.
 * Success-rate misses occur before costs and do not consume a daily use, as in
 * GameServerJS finishSkillPackage().
 */
export function performAnimalKinship(state, classId, verbId, ctx = {}) {
  const quote = quoteAnimalKinship(state, classId, verbId, ctx);
  if (!quote.ok) return { ...quote, attempted: false, effects: { energy: 0, mood: 0, xp: 0, items: {} } };
  // npc_piggy.js nibble handler 875-880: petted (or AK VI) but mood 0 or
  // hunger > 2 refuses before the package runs, so nothing is spent.
  if (classId === 'npc_piggy' && verbId === 'nibble') {
    const refusal = piggyNibbleRefusal(state || {});
    if (refusal) {
      return {
        ...quote,
        ok: false,
        attempted: false,
        reason: 'not_in_mood',
        refusal,
        msg: refusal.msg,
        effects: { energy: 0, mood: 0, xp: 0, items: {} },
      };
    }
  }
  const selected = quote.profile;
  const rng = typeof ctx.rng === 'function' ? ctx.rng : Math.random;
  if (selected.successRate < 100 && rng() >= selected.successRate / 100) {
    return {
      ...quote,
      ok: false,
      attempted: true,
      reason: 'success_rate',
      msg: verbId === 'squeeze' ? 'Buk! No squeeze! The Chicken greased its feathers.' : `That ${verbId} did not work.`,
      effects: { energy: 0, mood: 0, xp: 0, items: {} },
    };
  }

  const s = ensureAnimalKinshipState(classId, state || {});
  const actionState = ACTION_STATE[`${classId}:${verbId}`];
  const bonusTriggered = selected.bonusMultiplier > 1
    && selected.bonusChance > 0
    && rng() < selected.bonusChance;
  // npc_butterfly.onMassageComplete adds the base mood, then its historic
  // `mood * multiplier - multiplier` bonus expression.
  const massageMood = classId === 'npc_butterfly' && verbId === 'massage' && bonusTriggered
    ? selected.moodBonus + Math.max(0, selected.moodBonus * selected.bonusMultiplier - selected.bonusMultiplier)
    : selected.moodBonus;
  const effects = awardMetabolics(ctx.pc, selected, massageMood);
  let itemClassTsid = '';
  let itemCount = 0;
  let superHarvest = false;
  if (selected.bonusAmount > 0 && !['pet', 'massage'].includes(verbId)) {
    itemClassTsid = verbId === 'nibble'
      ? 'meat'
      : verbId === 'squeeze'
        ? 'grain'
        : 'milk_butterfly';
    itemCount = selected.bonusAmount;
    if (bonusTriggered) {
      itemCount *= selected.bonusMultiplier;
      superHarvest = true;
    }
    ctx.inv[itemClassTsid] = (Number(ctx.inv[itemClassTsid]) || 0) + itemCount;
    effects.items[itemClassTsid] = itemCount;
  }

  let toolUse = null;
  if (classId === 'npc_butterfly' && verbId === 'massage' && selected.toolWear > 0 && ctx.tools) {
    toolUse = useToolCondition(ctx.tools, 'butterfly_lotion', selected.toolWear);
    if (toolUse.ok && toolUse.broke) {
      ctx.inv.butterfly_lotion = Math.max(0, (Number(ctx.inv.butterfly_lotion) || 0) - 1);
      effects.items.butterfly_lotion = -1;
      if (ctx.inv.butterfly_lotion > 0) {
        setToolRemaining(ctx.tools, 'butterfly_lotion', toolUse.capacity);
        toolUse.replacementLoaded = true;
      }
    }
  } else if (classId === 'npc_butterfly' && verbId === 'massage' && selected.toolWear > 0) {
    // Compatibility for pure callers without the persistent tool system: one
    // legacy inventory unit represents the unavailable tube state.
    ctx.inv.butterfly_lotion = Math.max(0, (Number(ctx.inv.butterfly_lotion) || 0) - 1);
    effects.items.butterfly_lotion = -1;
    toolUse = { ok: true, wear: selected.toolWear, legacyConsumption: true };
  }

  s[actionState.daily] = integer(s[actionState.daily]) + 1;
  s[actionState.total] = integer(s[actionState.total]) + 1;
  // onPetComplete: incMood(1), capped at 2 (npc_piggy.js 1717, 1352-1362),
  // and the has_been_petted flag the source never set (G63b: the next daily
  // tick keeps this piggy's mood; js/animal-mood.js PIGGY_PET_PROTECTS_MOOD).
  if (classId === 'npc_piggy' && verbId === 'pet') petPiggy(s);
  if (actionState.legacy === 'squeezedToday') s.squeezedToday = s[actionState.daily];
  else s[actionState.legacy] = true;

  const label = classId === 'npc_piggy' ? 'Piggy' : classId === 'npc_chicken' ? 'Chicken' : 'Butterfly';
  const itemLabel = itemClassTsid === 'meat'
    ? 'Meat'
    : itemClassTsid === 'grain'
      ? 'Grain'
      : 'Butterfly Milk';
  const itemText = itemCount ? ` You receive ${itemCount} ${itemLabel}.` : '';
  return {
    ...quote,
    ok: true,
    attempted: true,
    reason: 'success',
    msg: `${superHarvest ? 'Super Harvest! ' : ''}You ${verbId} the ${label}.${itemText}`,
    effects,
    itemClassTsid,
    itemCount,
    superHarvest,
    bonusTriggered,
    toolUse,
    usesToday: s[actionState.daily],
  };
}

export function resetAnimalKinshipDay(classId, state = {}) {
  const s = ensureAnimalKinshipState(classId, state);
  if (classId === 'npc_butterfly') {
    s.massageUsesToday = 0;
    s.milkUsesToday = 0;
    s.massaged = false;
    s.milked = false;
  }
  if (classId === 'npc_piggy') {
    s.petUsesToday = 0;
    s.nibbleUsesToday = 0;
    s.petted = false;
    s.nibbled = false;
  }
  if (classId === 'npc_chicken') {
    s.squeezeUsesToday = 0;
    s.squeezedToday = 0;
  }
  return s;
}
