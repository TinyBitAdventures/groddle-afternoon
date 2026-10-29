/**
 * Eat or drink several of a stack at once, the original's way.
 *
 * Client: picking a pack verb on a stack of more than one opened the count
 * chooser unless the verb was is_single or is_all
 * (InteractionMenuController.as 974-993: "Eat how many Meats?"), its choices
 * from getCountChoices (1760-1797) and the line under them the verb's
 * effects times the count (InteractionMenu.as 1849-1881: "+30 energy").
 *
 * Server: one handler call ate the whole count.
 * - include/food.js food_eat 104-209: eats no more than the energy needs
 *   (food_needed = ceil(energy_needed / energy each), the rest stays in the
 *   pack), adds count x energy once (capped at the top), the variety bonus
 *   is decided once before the history moves and paid for every one eaten
 *   (bonus each x count, 132-141), food_today grows by the energy that
 *   landed, and the daily limit is looked at only before (food_eat_conditions
 *   17-23) and after (158-165: Stuffed), so the last batch may pass it.
 *   meals_eaten +1 when base_cost x count > 10, items_eaten + count (191-201).
 * - include/drink.js drink_drink 31-139: refused at full mood for a mood
 *   drink, drinks no more than the mood needs (drink_needed =
 *   ceil(mood_needed / drink_mood)), then count x mood, count x energy and
 *   count x xp, each added once.
 * - paradise_ticket.js verbs.eat 45-70: 20 iMG and 1 energy for each, no cap.
 *
 * Verbs with is_single (GSJS items/*.js) stay one at a time: Licorice and the
 * Sno Cones' eat, twenty drinks (the buff drinks), every herb's munch and
 * essence's imbibe (js/buffs.js keeps those single already).
 *
 * Seasonal candy and pumpkin pie take a count too, cut first to what their
 * daily limit leaves (limitCountCap; the feature runs its rule for each one).
 */

import { ITEM_CATALOG, countItem, getItemUseInfo, removeItem, useItem } from './inventory.js?v=catalog-unified-7';
import { loseEnergy, loseMood, metabolicGain, moodMax } from './metabolics.js';
import { quoteFoodVarietyBonus, foodFullness } from './food.js?v=food-memory-8';

/**
 * Eat and drink verbs marked "is_single": 1 in GSJS items/*.js (verbs.eat:
 * licorice and the six sno cones; verbs.drink: the twenty below).
 * tests/eat-many.test.js checks this list against the source.
 */
export const SINGLE_CONSUME_ITEMS = Object.freeze(new Set([
  'licorice',
  'sno_cone_blue',
  'sno_cone_green',
  'sno_cone_orange',
  'sno_cone_purple',
  'sno_cone_rainbow',
  'sno_cone_red',
  'beer',
  'bubble_tea',
  'carrot_margarita',
  'cloud_11_smoothie',
  'cloudberry_daiquiri',
  'coffee',
  'cosmapolitan',
  'crabato_juice',
  'earthshaker',
  'exotic_juice',
  'face_smelter',
  'flaming_humbaba',
  'gurly_drink',
  'hooch',
  'mabbish_coffee',
  'pungent_sunrise',
  'savory_smoothie',
  'slow_gin_fizz',
  'tooberry_shake',
  'wine_of_the_dead',
]));

function whole(value, fallback = 0) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

/** An ordinary eat or drink use (getItemUseInfo) that the source let take a count. */
export function consumeTakesCount(classTsid, info = getItemUseInfo(classTsid)) {
  if (!info?.usable) return false;
  if (info.kind !== 'food' && info.kind !== 'drink') return false;
  return !SINGLE_CONSUME_ITEMS.has(String(classTsid || ''));
}

/**
 * How many of a stack one eat or drink can take: the stack, cut to what the
 * energy (food) or mood (mood drink) still needs, as the handlers did.
 * Returns { max, stack, need, cappedBy: 'energy' | 'mood' | null, full }.
 * `full` is true when nothing can go in (full energy for food, full mood
 * for a mood drink); max is then 0.
 */
export function consumeCountCap(info, pc, stack, { energyMax = 100 } = {}) {
  const have = Math.max(0, whole(stack));
  const effects = info?.effects || {};
  if (info?.kind === 'drink') {
    const mood = Number(effects.mood) || 0;
    const top = moodMax(pc);
    const value = Number(pc?.mood) || 0;
    if (mood > 0 && value >= top) return { max: 0, stack: have, need: 0, cappedBy: 'mood', full: true };
    // drink.js 44-58: drink_needed only when drink_mood is not 0; <= 0 means no cap.
    const need = mood !== 0 ? Math.ceil((top - value) / mood) : 0;
    const capped = need > 0 && need < have;
    return { max: capped ? need : have, stack: have, need, cappedBy: capped ? 'mood' : null, full: false };
  }
  const per = Math.round(Number(effects.energy) || 0);
  if (per <= 0) return { max: have, stack: have, need: 0, cappedBy: null, full: false };
  const room = Math.max(0, Math.round(Number(energyMax) || 100) - (Number(pc?.energy) || 0));
  if (room <= 0) return { max: 0, stack: have, need: 0, cappedBy: 'energy', full: true };
  const need = Math.ceil(room / per);
  const capped = need < have;
  return { max: capped ? need : have, stack: have, need, cappedBy: capped ? 'energy' : null, full: false };
}

/**
 * A feature's daily limit on top of consumeCountCap: seasonal candy and
 * pumpkin pie cut msg.count to what is left today before food_eat looks at
 * the energy (items/birch_candy.js 133-146, items/pumpkin_pie.js 100-112).
 * `limit` is { kind, left, ... } (js/seasons.js dailyEatLimit) or null.
 * Returns the cap with max no more than `left`, cappedBy the limit's kind
 * when that is the cut that binds, and `limit` kept for the chooser's line.
 */
export function limitCountCap(cap, limit) {
  if (!cap || !limit) return cap;
  const left = Math.max(0, whole(limit.left));
  const out = { ...cap, limit };
  // The daily limit is looked at first, so it is the one named when it and the energy cut alike.
  if (left <= cap.max && left < cap.stack) {
    out.max = left;
    out.cappedBy = limit.kind;
  }
  return out;
}

/**
 * getCountChoices (InteractionMenuController.as 1760-1797) with "Just one"
 * first (int_menu_default_to_one): up to five, every count; past five,
 * 1/2/3/5, 1/3/5/10, 1/5/10/20 or 1/10/20/30 by size, and always All. Sorted
 * small to large, the counts never above `max`.
 */
export function consumeCountChoices(max) {
  const n = Math.max(0, whole(max));
  if (n < 1) return [];
  let counts;
  if (n <= 5) counts = Array.from({ length: n }, (_, i) => i + 1);
  else if (n <= 10) counts = [1, 2, 3, 5];
  else if (n <= 20) counts = [1, 3, 5, 10];
  else if (n <= 30) counts = [1, 5, 10, 20];
  else counts = [1, 10, 20, 30];
  return [...new Set([...counts.filter((c) => c < n), n])];
}

/** Clamp a chosen count to 1..max (max at least 1). */
export function clampConsumeCount(value, max) {
  const top = Math.max(1, whole(max, 1));
  return Math.min(top, Math.max(1, whole(value, 1)));
}

/**
 * What eating or drinking `count` would give now, for the chooser's line:
 * the client's effects x count (InteractionMenu.as 1862-1871), but with the
 * energy and mood the top lets in, and the variety iMG for each one eaten.
 * `varietyImg` is the per-item bonus from quoteFoodVarietyBonus.
 * Returns { energy, mood, xp } (only the non-zero ones).
 */
export function previewConsume(info, pc, count, { energyMax = 100, varietyImg = 0 } = {}) {
  const n = Math.max(0, whole(count));
  const effects = info?.effects || {};
  const out = {};
  const energy = (Number(effects.energy) || 0) * n;
  if (energy > 0) {
    const room = Math.max(0, Math.round(Number(energyMax) || 100) - (Number(pc?.energy) || 0));
    if (Math.min(energy, room) > 0) out.energy = Math.min(energy, room);
  } else if (energy < 0) out.energy = energy;
  const mood = (Number(effects.mood) || 0) * n;
  if (mood > 0) {
    const room = Math.max(0, moodMax(pc) - (Number(pc?.mood) || 0));
    if (Math.min(mood, room) > 0) out.mood = Math.min(mood, room);
  } else if (mood < 0) out.mood = mood;
  const xp = (Number(effects.xp) > 0 ? Number(effects.xp) * n : 0) + Math.max(0, whole(varietyImg)) * n;
  if (xp > 0) out.xp = xp;
  return out;
}

/**
 * Eat or drink `count` of a stack in one go (food_eat / drink_drink with
 * msg.count). One is exactly useItem. More takes them out together and adds
 * count x each effect once, so a dead or Super Pooped player hears the
 * refusal once. The caller caps count with consumeCountCap first; this still
 * refuses a mood drink at full mood (drink.js 38-42).
 * Returns { ok, count, effects, msgs }.
 */
export function useItemMany(inv, pc, classTsid, count = 1) {
  const n = Math.max(1, whole(count, 1));
  if (n === 1) return { ...useItem(inv, pc, classTsid), count: 1 };
  if (countItem(inv, classTsid) < n) {
    return { ok: false, count: 0, msgs: [`You don't have ${n} of those.`] };
  }
  const info = getItemUseInfo(classTsid);
  if (!info.usable) return { ok: false, count: 0, msgs: [info.reason] };
  const label = ITEM_CATALOG[classTsid]?.label || classTsid;
  const plural = ITEM_CATALOG[classTsid]?.namePlural || `${label}s`;
  if (info.kind === 'drink' && (info.effects.mood || 0) > 0 && (pc.mood || 0) >= moodMax(pc)) {
    return {
      ok: false,
      count: 0,
      reason: 'mood_full',
      msgs: [`You tried to drink ${n} ${plural}, but you're already in a perfectly good mood, so then you didn't do it.`],
    };
  }
  if (!removeItem(inv, classTsid, n)) return { ok: false, count: 0, msgs: [`You don't have ${n} of those.`] };
  const effects = {};
  const addEnergy = () => {
    const amount = (info.effects.energy || 0) * n;
    if (!amount || (amount > 0 && !metabolicGain('energy').ok)) return;
    const before = pc.energy || 0;
    if (amount < 0) loseEnergy(pc, -amount);
    else pc.energy = Math.min(Math.max(100, Number(pc.energyMax) || 100), before + amount);
    if ((pc.energy || 0) !== before) effects.energy = (pc.energy || 0) - before;
  };
  const addMood = () => {
    const amount = (info.effects.mood || 0) * n;
    if (!amount || (amount > 0 && !metabolicGain('mood').ok)) return;
    const before = pc.mood || 0;
    if (amount < 0) loseMood(pc, -amount);
    else pc.mood = Math.min(moodMax(pc), before + amount);
    if ((pc.mood || 0) !== before) effects.mood = (pc.mood || 0) - before;
  };
  // Same order as useItem: drink_drink mood then energy, food_eat energy first.
  if (info.kind === 'drink') {
    addMood();
    addEnergy();
  } else {
    addEnergy();
    addMood();
  }
  if (info.effects.xp > 0) {
    const xp = info.effects.xp * n;
    pc.imagination = (pc.imagination || 0) + xp;
    pc.xp = (pc.xp || 0) + xp;
    effects.xp = xp;
  }
  // item.js buildVerbMessage: "You ate 3 Meats." / "You drank 2 Orange Juices."
  return { ok: true, count: n, msgs: [`You ${info.kind === 'drink' ? 'drank' : 'ate'} ${n} ${plural}.`], effects };
}

/**
 * food_eat's bookkeeping for one batch (food.js 132-164): the variety bonus
 * is quoted before the history moves and paid for each one eaten, the
 * history is stamped once, fullness grows by the energy that landed, and one
 * batch is one meal when it was big enough. Same shape as recordFoodEat.
 */
export function recordFoodEatMany(state, classTsid, opts = {}) {
  const count = Math.max(1, whole(opts.count, 1));
  const appliedEnergy = Math.max(0, whole(opts.appliedEnergy));
  if (!state || !classTsid || appliedEnergy <= 0) {
    return { ok: false, reason: 'no_energy_restored', bonus: 0 };
  }
  state.history ||= {};
  const now = whole(opts.now ?? Date.now(), Date.now());
  const quote = quoteFoodVarietyBonus(state, classTsid, opts.baseEnergy, opts.upgrades || [], now);
  const bonus = quote.img * count;
  state.history[classTsid] = Math.max(0, now);
  state.foodToday = Math.max(0, whole(state.foodToday)) + appliedEnergy;
  state.itemsEaten = Math.max(0, whole(state.itemsEaten)) + count;
  // food.js 191: base_cost x count > 10 (the remake keeps base energy as recordFoodEat does).
  const meal = (Number(opts.baseEnergy) || 0) * count > 10;
  if (meal) state.mealsEaten = Math.max(0, whole(state.mealsEaten)) + 1;
  if (bonus > 0) {
    state.varietyBonuses = Math.max(0, whole(state.varietyBonuses)) + 1;
    state.varietyImg = Math.max(0, whole(state.varietyImg)) + bonus;
  }
  return {
    ok: true,
    count,
    bonus,
    quote,
    fullness: foodFullness(state, opts.energyMax || 100),
    meal,
  };
}
