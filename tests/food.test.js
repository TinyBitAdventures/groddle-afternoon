/**
 * Official food variety and daily fullness loop.
 * Run: node --test tests/food.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_DAY_MS } from '../public/js/game-day.js';
import {
  FOOD_VARIETY_UPGRADE,
  FOOD_ENERGY_LIMIT_MULTIPLIER,
  FOOD_BONUS_ITEMS,
  createFoodState,
  normalizeFoodState,
  rollingGameDaysSince,
  foodBonusKind,
  quoteFoodVarietyBonus,
  foodDailyLimit,
  foodFullness,
  canEatFood,
  recordFoodEat,
  resetFoodDay,
  foodBonusStatus,
} from '../public/js/food.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '../public');
const upgrades = [FOOD_VARIETY_UPGRADE];

describe('official food memory and variety rewards', () => {
  it('maps the shipped meals whose GSJS tags include foodbonus', () => {
    assert.deepEqual([...FOOD_BONUS_ITEMS].sort(), [
      'fried_egg',
      'green_eggs',
      'sammich',
      'waffles',
    ]);
    assert.equal(FOOD_ENERGY_LIMIT_MULTIPLIER, 20);
  });

  it('gives a 50% first-taste reward and remembers the meal', () => {
    const state = createFoodState();
    const quote = quoteFoodVarietyBonus(state, 'sammich', 25, upgrades, 1_000_000);
    assert.equal(quote.kind, 'month');
    assert.equal(quote.firstTaste, true);
    assert.equal(quote.img, 13);
    assert.equal(foodBonusStatus(quote), 'First taste · +13 iMG');

    const eaten = recordFoodEat(state, 'sammich', {
      baseEnergy: 25,
      appliedEnergy: 20,
      upgrades,
      now: 1_000_000,
    });
    assert.equal(eaten.bonus, 13);
    assert.equal(state.history.sammich, 1_000_000);
    assert.equal(state.foodToday, 20);
    assert.equal(state.itemsEaten, 1);
    assert.equal(state.mealsEaten, 1);
    assert.equal(state.varietyBonuses, 1);
    assert.equal(state.varietyImg, 13);
  });

  it('uses the server Math.round thresholds for day and month bonuses', () => {
    const now = 100 * GAME_DAY_MS;
    const state = createFoodState({ history: { sammich: now - 1.4 * GAME_DAY_MS } });
    assert.equal(rollingGameDaysSince(state.history.sammich, now), 1);
    assert.equal(foodBonusKind(state, 'sammich', upgrades, now), 'none');

    state.history.sammich = now - 1.5 * GAME_DAY_MS;
    const day = quoteFoodVarietyBonus(state, 'sammich', 25, upgrades, now);
    assert.equal(day.kind, 'day');
    assert.equal(day.img, 6);
    assert.equal(foodBonusStatus(day), 'Variety bonus · +6 iMG');

    state.history.sammich = now - 30.5 * GAME_DAY_MS;
    const month = quoteFoodVarietyBonus(state, 'sammich', 25, upgrades, now);
    assert.equal(month.kind, 'month');
    assert.equal(month.img, 13);
    assert.equal(foodBonusStatus(month), 'Long-lost favorite · +13 iMG');
  });

  it('requires both the imagination upgrade and an official foodbonus tag', () => {
    const state = createFoodState();
    assert.equal(quoteFoodVarietyBonus(state, 'sammich', 25, [], 100).img, 0);
    assert.equal(quoteFoodVarietyBonus(state, 'apple', 10, upgrades, 100).img, 0);
    assert.equal(foodBonusStatus({ img: 0 }), 'Eaten recently · no variety bonus');
  });

  it('tracks capped restored energy against the official 20× daily budget', () => {
    const state = createFoodState({ foodToday: 1_990 });
    assert.equal(foodDailyLimit(100), 2_000);
    assert.deepEqual(foodFullness(state, 100), {
      eaten: 1990,
      limit: 2000,
      remaining: 10,
      percent: 99.5,
      stuffed: false,
    });
    assert.equal(canEatFood(state, { energy: 50 }).ok, true);
    const eaten = recordFoodEat(state, 'sammich', {
      baseEnergy: 25,
      appliedEnergy: 10,
      upgrades,
      now: 500,
    });
    assert.equal(eaten.fullness.stuffed, true);
    assert.equal(canEatFood(state, { energy: 50 }).ok, false);
    assert.match(canEatFood(state, { energy: 50 }).reason, /stuffed/i);
  });

  it('blocks food at full energy and does not remember zero-energy uses', () => {
    const state = createFoodState();
    assert.equal(canEatFood(state, { energy: 100 }).ok, false);
    assert.match(canEatFood(state, { energy: 100 }).reason, /full energy/i);
    const result = recordFoodEat(state, 'sammich', {
      baseEnergy: 25,
      appliedEnergy: 0,
      upgrades,
      now: 100,
    });
    assert.equal(result.ok, false);
    assert.deepEqual(state.history, {});
  });

  it('resets only daily fullness while preserving long-term taste history', () => {
    const state = createFoodState({
      history: { sammich: 77 },
      foodToday: 500,
      itemsEaten: 9,
      mealsEaten: 4,
    });
    resetFoodDay(state);
    assert.equal(state.foodToday, 0);
    assert.equal(state.history.sammich, 77);
    assert.equal(state.itemsEaten, 9);
    assert.equal(state.mealsEaten, 4);
  });

  it('repairs untrusted persisted history and counters', () => {
    const state = normalizeFoodState({
      history: { sammich: 123.9, 'bad key!': 5, future: -2 },
      foodToday: -40,
      itemsEaten: 3.8,
      varietyImg: '12',
    });
    assert.deepEqual(state.history, { sammich: 123, badkey: 5, future: 0 });
    assert.equal(state.foodToday, 0);
    assert.equal(state.itemsEaten, 3);
    assert.equal(state.varietyImg, 12);
  });
});

describe('food-memory client integration', () => {
  it('persists, resets, previews, rewards, and exposes deterministic QA', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const css = readFileSync(join(publicRoot, 'style.css'), 'utf8');
    const save = readFileSync(join(publicRoot, 'js/player-save.js'), 'utf8');
    assert.match(game, /const foodState = createFoodState\(\)/);
    assert.match(game, /food:\s*foodState/);
    assert.match(game, /recordFoodEat/);
    assert.match(game, /resetFoodDay\(foodState\)/);
    assert.match(game, /Eating a variety of foods helps you think!/);
    assert.match(game, /fooddemo/);
    assert.match(game, /foodlast/);
    assert.match(game, /pack-food-memory/);
    assert.match(css, /\.pack-food-memory/);
    assert.match(save, /normalizeFoodState/);
    assert.match(save, /replace\(targets\.food/);
  });
});
