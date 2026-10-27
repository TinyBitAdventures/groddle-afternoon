/**
 * Official food history / variety bonus / daily fullness behavior.
 * Source: GameServerJS items/include/food.js, players/player.js, config_prod.js.
 *
 * Tiny Speck used a rolling food history per class_tsid. With the
 * food_variety_bonus upgrade, a tagged meal grants 25% of its energy as iMG
 * after more than one game day away, or 50% after more than 30 game days (and
 * on the first-ever taste). The server also limited total restored food energy
 * to 20 times the player's energy maximum per game day.
 */

import { GAME_DAY_MS } from './game-day.js?v=dametime-4';
import { ITEM_CATALOG } from './inventory.js?v=catalog-unified-7';

export const FOOD_VARIETY_UPGRADE = 'food_variety_bonus';
export const FOOD_ENERGY_LIMIT_MULTIPLIER = 20;

/** Current edible catalog entries whose official GSJS tags include foodbonus. */
export const FOOD_BONUS_ITEMS = new Set([
  'sammich',
  'fried_egg',
  'green_eggs',
  'waffles',
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanKey(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_:-]/g, '');
}

export function normalizeFoodState(seed = {}) {
  const history = {};
  const rows = Object.entries(seed?.history || seed?.list || {}).slice(0, 512);
  for (const [rawId, rawTime] of rows) {
    const classTsid = cleanKey(rawId);
    const at = Math.max(0, Math.floor(finite(rawTime, -1)));
    if (classTsid && at >= 0) history[classTsid] = at;
  }
  return {
    history,
    foodToday: Math.max(0, Math.floor(finite(seed?.foodToday, 0))),
    itemsEaten: Math.max(0, Math.floor(finite(seed?.itemsEaten, 0))),
    mealsEaten: Math.max(0, Math.floor(finite(seed?.mealsEaten, 0))),
    varietyBonuses: Math.max(0, Math.floor(finite(seed?.varietyBonuses, 0))),
    varietyImg: Math.max(0, Math.floor(finite(seed?.varietyImg, 0))),
  };
}

export function createFoodState(seed = {}) {
  return normalizeFoodState(seed);
}

/**
 * A meal earns the variety bonus only when its GSJS item carries the
 * `foodbonus` tag. The hand-maintained set covers the original shipped meals;
 * recipe imports register tags on ITEM_CATALOG (making-items.json).
 */
export function isFoodBonusItem(classTsid) {
  const id = String(classTsid || '');
  if (FOOD_BONUS_ITEMS.has(id)) return true;
  const tags = ITEM_CATALOG[id]?.tags;
  return Array.isArray(tags) && tags.includes('foodbonus');
}

/** GameServerJS game_days_since_ts used Math.round, not floor. */
export function rollingGameDaysSince(lastAt, now = Date.now()) {
  const diff = Number(now) - Number(lastAt);
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.round(diff / GAME_DAY_MS);
}

export function foodBonusKind(state, classTsid, upgrades = [], now = Date.now()) {
  if (!upgrades.includes(FOOD_VARIETY_UPGRADE)) return 'none';
  if (!isFoodBonusItem(classTsid)) return 'none';
  const lastAt = Number(state?.history?.[classTsid] || 0);
  if (!lastAt) return 'month';
  const days = rollingGameDaysSince(lastAt, now);
  if (days > 30) return 'month';
  if (days > 1) return 'day';
  return 'none';
}

export function quoteFoodVarietyBonus(
  state,
  classTsid,
  baseEnergy,
  upgrades = [],
  now = Date.now()
) {
  const kind = foodBonusKind(state, classTsid, upgrades, now);
  const energy = Math.max(0, Math.round(finite(baseEnergy, 0)));
  const img = kind === 'month'
    ? Math.round(energy / 2)
    : kind === 'day'
      ? Math.round(energy / 4)
      : 0;
  const lastAt = Number(state?.history?.[classTsid] || 0);
  return {
    kind,
    img,
    baseEnergy: energy,
    firstTaste: kind === 'month' && !lastAt,
    lastAt: lastAt || null,
    gameDaysSince: lastAt ? rollingGameDaysSince(lastAt, now) : null,
  };
}

export function foodDailyLimit(energyMax = 100) {
  return Math.max(1, Math.round(finite(energyMax, 100) * FOOD_ENERGY_LIMIT_MULTIPLIER));
}

export function foodFullness(state, energyMax = 100) {
  const eaten = Math.max(0, Math.floor(finite(state?.foodToday, 0)));
  const limit = foodDailyLimit(energyMax);
  return {
    eaten,
    limit,
    remaining: Math.max(0, limit - eaten),
    percent: Math.max(0, Math.min(100, (eaten / limit) * 100)),
    stuffed: eaten >= limit,
  };
}

/** Original food gates. Buff herbs bypass this because they are not sent here. */
export function canEatFood(state, pc, energyMax = 100) {
  if (foodFullness(state, energyMax).stuffed) {
    return { ok: false, reason: "You can't eat any more food today. You're stuffed!" };
  }
  if (Number(pc?.energy || 0) >= energyMax) {
    return { ok: false, reason: 'You already have full energy.' };
  }
  return { ok: true };
}

/**
 * Commit one successful eat. `baseEnergy` drives the variety reward while
 * `appliedEnergy` drives daily fullness, matching the server's capped value.
 */
export function recordFoodEat(state, classTsid, opts = {}) {
  const appliedEnergy = Math.max(0, Math.floor(finite(opts.appliedEnergy, 0)));
  if (!state || !classTsid || appliedEnergy <= 0) {
    return { ok: false, reason: 'no_energy_restored', bonus: 0 };
  }
  state.history ||= {};
  const quote = quoteFoodVarietyBonus(
    state,
    classTsid,
    opts.baseEnergy,
    opts.upgrades || [],
    opts.now ?? Date.now()
  );
  state.history[classTsid] = Math.max(0, Math.floor(finite(opts.now, Date.now())));
  state.foodToday = Math.max(0, Math.floor(finite(state.foodToday, 0))) + appliedEnergy;
  state.itemsEaten = Math.max(0, Math.floor(finite(state.itemsEaten, 0))) + 1;
  if (Number(opts.baseEnergy || 0) > 10) {
    state.mealsEaten = Math.max(0, Math.floor(finite(state.mealsEaten, 0))) + 1;
  }
  if (quote.img > 0) {
    state.varietyBonuses = Math.max(0, Math.floor(finite(state.varietyBonuses, 0))) + 1;
    state.varietyImg = Math.max(0, Math.floor(finite(state.varietyImg, 0))) + quote.img;
  }
  return {
    ok: true,
    bonus: quote.img,
    quote,
    fullness: foodFullness(state, opts.energyMax || 100),
    meal: Number(opts.baseEnergy || 0) > 10,
  };
}

export function resetFoodDay(state) {
  if (!state) return state;
  state.foodToday = 0;
  return state;
}

export function foodBonusStatus(quote) {
  if (!quote || quote.img <= 0) return 'Eaten recently · no variety bonus';
  if (quote.firstTaste) return `First taste · +${quote.img} iMG`;
  if (quote.kind === 'month') return `Long-lost favorite · +${quote.img} iMG`;
  return `Variety bonus · +${quote.img} iMG`;
}
