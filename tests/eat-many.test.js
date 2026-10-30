/**
 * Eat or drink several at once (js/eat-many.js): the source's count rules
 * (include/food.js food_eat, include/drink.js drink_drink), the is_single
 * list, the client's count choices, and the pack card's controls.
 * Run: node --test tests/eat-many.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  SINGLE_CONSUME_ITEMS,
  consumeTakesCount,
  consumeCountCap,
  consumeCountChoices,
  clampConsumeCount,
  previewConsume,
  limitCountCap,
  useItemMany,
  recordFoodEatMany,
} from '../public/js/eat-many.js?v=4faca8e6';
import { CANDY_CLASSES, CANDY_DAILY_MAX, PIE_DAILY_MAX, SOURCE_LINES, dailyEatLimit, pieEatGate } from '../public/js/seasons.js?v=fcb12a83';
import { seasonsFeature } from '../public/js/features/seasons-feature.js?v=5e5f2923';
import { getGameDayKey } from '../public/js/game-day.js?v=3095e05b';
import { createInventory, getItemUseInfo, registerItemUse, useItem, countItem } from '../public/js/inventory.js?v=85d4faba';
import { FOOD_VARIETY_UPGRADE, createFoodState, recordFoodEat } from '../public/js/food.js?v=f6c6d15b';

const root = join(import.meta.dirname, '..');
const gsjs = join(root, '../glitch-GameServerJS');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

// Meat as the source has it: items/meat.js base_cost 10 x energy_factor 1.
registerItemUse('meat', { kind: 'food', verb: 'Eat', energy: 10 });

describe('which eats and drinks take a count', () => {
  it('matches every is_single eat and drink verb in GSJS items/*.js', { skip: !existsSync(join(gsjs, 'items')) && 'no GSJS checkout' }, () => {
    const single = new Set();
    for (const file of readdirSync(join(gsjs, 'items'))) {
      if (!file.endsWith('.js')) continue;
      const text = readFileSync(join(gsjs, 'items', file), 'utf8');
      for (const verb of ['eat', 'drink']) {
        const at = text.indexOf(`\nverbs.${verb} = {`);
        if (at < 0) continue;
        const body = text.slice(at, text.indexOf('\n};', at));
        if (/"is_single"\s*:\s*1/.test(body)) single.add(file.replace(/\.js$/, ''));
      }
    }
    assert.deepEqual([...SINGLE_CONSUME_ITEMS].sort(), [...single].sort());
  });

  it('lets ordinary food and multi drinks take a count, never a single one', () => {
    assert.equal(consumeTakesCount('meat'), true);
    assert.equal(consumeTakesCount('milk_butterfly'), true);
    assert.equal(consumeTakesCount('bubble_tea'), false); // verbs.drink is_single
    assert.equal(consumeTakesCount('licorice', { usable: true, kind: 'food' }), false);
    assert.equal(consumeTakesCount('meat', { usable: false, kind: 'food' }), false);
    assert.equal(consumeTakesCount('spinach', { usable: true, verb: 'Activate' }), false);
  });
});

describe('the source caps a batch', () => {
  const meat = () => getItemUseInfo('meat');

  it('eats no more Meat than the energy needs (food.js 105-116)', () => {
    assert.deepEqual(consumeCountCap(meat(), { energy: 50 }, 4), { max: 4, stack: 4, need: 5, cappedBy: null, full: false });
    assert.deepEqual(consumeCountCap(meat(), { energy: 75 }, 4), { max: 3, stack: 4, need: 3, cappedBy: 'energy', full: false });
    assert.equal(consumeCountCap(meat(), { energy: 95 }, 4).max, 1);
    assert.deepEqual(consumeCountCap(meat(), { energy: 100 }, 4), { max: 0, stack: 4, need: 0, cappedBy: 'energy', full: true });
    // A bigger tank (Energy Tank cards) leaves more room.
    assert.equal(consumeCountCap(meat(), { energy: 100, energyMax: 150 }, 9, { energyMax: 150 }).max, 5);
  });

  it('drinks no more than the mood needs, and nothing at full mood (drink.js 38-58)', () => {
    const milk = { usable: true, kind: 'drink', effects: { mood: 6 } };
    assert.deepEqual(consumeCountCap(milk, { mood: 90 }, 5), { max: 2, stack: 5, need: 2, cappedBy: 'mood', full: false });
    assert.equal(consumeCountCap(milk, { mood: 100 }, 5).full, true);
    // A mood-losing drink is not capped (drink_needed <= 0 drinks the count).
    assert.equal(consumeCountCap({ usable: true, kind: 'drink', effects: { mood: -5, energy: 10 } }, { mood: 100 }, 6).max, 6);
  });

  it('offers the client count choices, smallest first (InteractionMenuController.as 1760-1797)', () => {
    assert.deepEqual(consumeCountChoices(1), [1]);
    assert.deepEqual(consumeCountChoices(4), [1, 2, 3, 4]);
    assert.deepEqual(consumeCountChoices(8), [1, 2, 3, 5, 8]);
    assert.deepEqual(consumeCountChoices(15), [1, 3, 5, 10, 15]);
    assert.deepEqual(consumeCountChoices(25), [1, 5, 10, 20, 25]);
    assert.deepEqual(consumeCountChoices(40), [1, 10, 20, 30, 40]);
    assert.equal(clampConsumeCount(9, 3), 3);
    assert.equal(clampConsumeCount(0, 3), 1);
  });

  it('previews the count the top lets in, with the variety iMG for each one', () => {
    assert.deepEqual(previewConsume(meat(), { energy: 50 }, 3), { energy: 30 });
    assert.deepEqual(previewConsume(meat(), { energy: 75 }, 3), { energy: 25 });
    assert.deepEqual(previewConsume(meat(), { energy: 50 }, 3, { varietyImg: 5 }), { energy: 30, xp: 15 });
  });
});

describe('one batch, one handler call', () => {
  it('eats three Meat at once: one energy add, one message, one left', () => {
    const inv = { meat: 4 };
    const pc = { energy: 75, mood: 50 };
    const r = useItemMany(inv, pc, 'meat', 3);
    assert.equal(r.ok, true);
    assert.equal(r.count, 3);
    assert.equal(pc.energy, 100);
    assert.deepEqual(r.effects, { energy: 25 });
    assert.deepEqual(r.msgs, ['You ate 3 Meats.']);
    assert.equal(countItem(inv, 'meat'), 1);
  });

  it('is exactly useItem for one', () => {
    const a = { inv: { meat: 2 }, pc: { energy: 40 } };
    const b = { inv: { meat: 2 }, pc: { energy: 40 } };
    const one = useItemMany(a.inv, a.pc, 'meat', 1);
    const plain = useItem(b.inv, b.pc, 'meat');
    assert.deepEqual({ ...one, count: undefined }, { ...plain, count: undefined });
    assert.deepEqual(a, b);
  });

  it('refuses a mood drink batch at full mood and keeps the stack', () => {
    registerItemUse('milk_butterfly', { kind: 'drink', verb: 'Drink', mood: 6 });
    const inv = { milk_butterfly: 3 };
    const pc = { energy: 50, mood: 100 };
    const r = useItemMany(inv, pc, 'milk_butterfly', 2);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'mood_full');
    assert.match(r.msgs[0], /already in a perfectly good mood/);
    assert.equal(countItem(inv, 'milk_butterfly'), 3);
  });

  it('drinks two Butterfly Milks for 12 mood', () => {
    const inv = { milk_butterfly: 3 };
    const pc = { energy: 50, mood: 80 };
    const r = useItemMany(inv, pc, 'milk_butterfly', 2);
    assert.equal(r.ok, true);
    assert.equal(pc.mood, 92);
    assert.deepEqual(r.msgs, ['You drank 2 Butterfly Milks.']);
    assert.equal(countItem(inv, 'milk_butterfly'), 1);
  });

  it('will not take more than the pack holds', () => {
    const inv = { meat: 2 };
    const r = useItemMany(inv, { energy: 0 }, 'meat', 3);
    assert.equal(r.ok, false);
    assert.equal(countItem(inv, 'meat'), 2);
  });
});

describe('food memory for a batch (food.js 132-164)', () => {
  const upgrades = [FOOD_VARIETY_UPGRADE];

  it('pays the variety bonus for every one eaten, decided before the history moves', () => {
    const source = existsSync(join(gsjs, 'items/include/food.js')) ? readFileSync(join(gsjs, 'items/include/food.js'), 'utf8') : '';
    if (source) assert.match(source, /bonus = Math\.round\(energy_gain_single\/2\) \* count;/);
    const state = createFoodState();
    const r = recordFoodEatMany(state, 'sammich', { count: 3, baseEnergy: 25, appliedEnergy: 60, upgrades, now: 1_000_000 });
    assert.equal(r.ok, true);
    assert.equal(r.bonus, 13 * 3);
    assert.equal(state.history.sammich, 1_000_000);
    assert.equal(state.foodToday, 60);
    assert.equal(state.itemsEaten, 3);
    assert.equal(state.mealsEaten, 1);
    assert.equal(state.varietyBonuses, 1);
    assert.equal(state.varietyImg, 39);
    // Eaten again straight away: no bonus.
    assert.equal(recordFoodEatMany(state, 'sammich', { count: 2, baseEnergy: 25, appliedEnergy: 50, upgrades, now: 1_000_100 }).bonus, 0);
  });

  it('counts a batch of small things as one meal once base x count passes 10', () => {
    const state = createFoodState();
    recordFoodEatMany(state, 'cherry', { count: 3, baseEnergy: 1, appliedEnergy: 3, now: 5 });
    assert.equal(state.mealsEaten, 0);
    recordFoodEatMany(state, 'cherry', { count: 11, baseEnergy: 1, appliedEnergy: 11, now: 6 });
    assert.equal(state.mealsEaten, 1);
  });

  it('matches recordFoodEat for one', () => {
    const a = createFoodState();
    const b = createFoodState();
    const one = recordFoodEatMany(a, 'sammich', { count: 1, baseEnergy: 25, appliedEnergy: 20, upgrades, now: 9 });
    const plain = recordFoodEat(b, 'sammich', { baseEnergy: 25, appliedEnergy: 20, upgrades, now: 9 });
    assert.deepEqual(a, b);
    assert.equal(one.bonus, plain.bonus);
    assert.equal(one.meal, plain.meal);
  });

  it('records nothing when no energy landed', () => {
    const state = createFoodState();
    assert.equal(recordFoodEatMany(state, 'meat', { count: 2, baseEnergy: 10, appliedEnergy: 0 }).ok, false);
    assert.equal(state.itemsEaten, 0);
  });
});

describe('the pack card chooser', () => {
  it('imports eat-many under one key', () => {
    assert.match(game, /from '\.\/js\/eat-many\.js\?v=[0-9a-f]{8}';/);
  });

  it('adds "Eat more" (a second level of the stack menu) beside "Eat one" and an "Eat how many?" panel', () => {
    assert.match(game, /attrs: 'data-pack-eat-many', cls: 'pack-eat-more', label: `\$\{eatMany\.verb\} more`, next: true, tip: `Choose how many to/);
    assert.match(game, /\$\{escapeHtml\(eatMany\.verb\)\} how many \$\{escapeHtml\(eatMany\.plural\)\}\?/);
    assert.match(game, /data-pack-eat-choice="\$\{n\}" aria-pressed=/);
    assert.match(game, /n === 1\s*\? 'Just one'/);
    assert.match(game, /data-pack-eat-confirm>\$\{escapeHtml\(eatMany\.verb\)\} \$\{qty\}<\/button>/);
    // Keyboard: arrows, -/+, Home/End and Esc stay in the chooser.
    assert.match(game, /ArrowLeft: -1, ArrowDown: -1, '-': -1, ArrowRight: 1, ArrowUp: 1, '\+': 1, '=': 1/);
    assert.match(game, /e\.key === 'Home' \|\| e\.key === 'End'/);
  });

  it('eats the chosen count through the pack Eat, cut to the source caps', () => {
    assert.match(game, /function usePackItem\(classTsid, count = 1\)/);
    assert.match(game, /if \(eatMany\.ticket\) eatPackedParadiseTicket\(classTsid, n\);\s*else usePackItem\(classTsid, n\);/);
    assert.match(game, /consumeCountCap\(ordinaryInfo, pc, countItem\(inv, classTsid\), \{ energyMax: energyCap\(\) \}\)/);
    assert.match(game, /eatCount > 1\s*\? useItemMany\(inv, pc, classTsid, eatCount\)/);
    assert.match(game, /recordFoodEatMany\(foodState, classTsid, \{ \.\.\.eatOpts, count: eaten \}\)/);
    assert.match(game, /consumeAchievementCounters\(classTsid, \{ kind: ordinaryInfo\.kind, tags: meta\.tags, baseCost: meta\.baseCost, count: eaten \}\)/);
  });

  it('keeps feature eats, buff herbs and per-eat limits one at a time', () => {
    const fn = game.slice(game.indexOf('function packEatManyInfo('), game.indexOf('function packEatPreview('));
    assert.match(fn, /useInfo\.buff\) return null;/);
    assert.match(fn, /useInfo\.food && !useInfo\.food\.gate\.ok\) return null;/);
    assert.match(fn, /features\.query\('packUseInfo', classTsid, engine\)\) return null;/);
    // A feature gate keeps it single unless the feature also gives a count rule (candy, pie) and is open.
    assert.match(fn, /const limit = features\.query\('packEatLimit', classTsid, engine\);/);
    assert.match(fn, /if \(gate != null && !\(limit && gate\.ok !== false\)\) return null;/);
    assert.match(fn, /if \(cap\.max < 2\) return null;/);
  });

  it('styles the chooser', () => {
    const css = readFileSync(join(root, 'public/style.css'), 'utf8');
    assert.match(css, /\.pack-eat-quantity \.pack-eat-choice\.is-selected \{/);
    assert.match(css, /\.pack-eat-quantity button:focus-visible \{/);
  });
});

describe('seasonal candy and pumpkin pie take a count (Austin 2026-10-29)', () => {
  const item = (name) => readFileSync(join(gsjs, 'items', name), 'utf8');
  const noGsjs = !existsSync(join(gsjs, 'items')) && 'no GSJS checkout';

  it('cuts the count to what is left today, as the handlers did', { skip: noGsjs }, () => {
    for (const cls of CANDY_CLASSES) {
      const src = item(`${cls}.js`);
      // birch_candy.js 134-141: num_can_eat = 11 - candy_eaten today; msg.count cut to it.
      assert.match(src, /var num_can_eat = 11 - num_candies_eaten;\s*\/\/ Don't let the player eat more than the number that gives them toothache\.\s*if \(msg\.count > num_can_eat\) \{\s*msg\.count = num_can_eat;/);
      // 159-164: one toothache when the batch makes eleven, -10 mood, and the last one gives no rush.
      assert.match(src, /if \(\(num_candies_eaten \+ num\) >= 11\) \{\s*var mood_loss = Math\.abs\(pc\.metabolics_lose_mood\(10\)\);/);
      assert.match(src, /num -= 1; \/\/ subtract one - the final candy doesn't give sugar rush/);
    }
    assert.equal(CANDY_DAILY_MAX, 11);
    const pie = item('pumpkin_pie.js');
    // pumpkin_pie.js 100-117: num_can_eat = 5 - pies_eaten; pies_eaten += msg.count; Full of Pie once.
    assert.match(pie, /var num_can_eat = 5 - num_pies_eaten;[\s\S]*?msg\.count = num_can_eat;/);
    assert.match(pie, /pc\.achievements_increment_daily\('pies_eaten', 'pumpkin', msg\.count\);\s*pc\.buffs_apply\('full_of_pie'\);/);
    assert.equal(PIE_DAILY_MAX, 5);
    // 254-257: the line once the five are eaten.
    assert.ok(pie.includes(`reason:"${SOURCE_LINES.noMorePie}"`));
    // food.js 207: food_eat hands back the count it really ate (the energy cut), which the
    // candy and pie handlers then count.
    assert.match(readFileSync(join(gsjs, 'items/include/food.js'), 'utf8'), /\n\tmsg\.count = count;\n\treturn true;/);
  });

  it('dailyEatLimit and limitCountCap: the daily limit first, then the energy', () => {
    const day = 'd1';
    const st = { daily: { day, candy: 8, pies: 3, nog: 0, pi: 0, treats: {} } };
    const candy = dailyEatLimit(st, day, 'birch_candy');
    assert.deepEqual(candy, { kind: 'candy', daily: 11, eaten: 8, left: 3, toothacheMood: 10 });
    assert.deepEqual(dailyEatLimit(st, day, 'pumpkin_pie'), { kind: 'pie', daily: 5, eaten: 3, left: 2 });
    assert.equal(dailyEatLimit(st, day, 'meat'), null);
    // Five candies, energy for all five: three today, named by the candy limit.
    const roomy = { max: 5, stack: 5, need: 9, cappedBy: null, full: false };
    assert.deepEqual(limitCountCap(roomy, candy), { ...roomy, max: 3, cappedBy: 'candy', limit: candy });
    // Energy for only two: the energy cut binds.
    const tight = { max: 2, stack: 5, need: 2, cappedBy: 'energy', full: false };
    assert.equal(limitCountCap(tight, candy).max, 2);
    assert.equal(limitCountCap(tight, candy).cappedBy, 'energy');
    // Three in the pack and three left: not capped (the note says the last one aches instead).
    const three = { max: 3, stack: 3, need: 9, cappedBy: null, full: false };
    assert.equal(limitCountCap(three, candy).cappedBy, null);
    assert.equal(limitCountCap(roomy, null), roomy);
    assert.deepEqual(pieEatGate({ daily: { day, candy: 0, pies: 5, nog: 0, pi: 0, treats: {} } }, day), { ok: false, msg: 'No more pie. You cannot possibly eat another slice.' });
  });

  /** A seasons-feature engine with the buffs and lines it touches. */
  function seasonEngine({ mood = 50 } = {}) {
    const buffs = {};
    const calls = { apply: [], extend: [], toasts: [], activity: [], achievements: [] };
    const engine = {
      pc: { mood, energy: 50 },
      inv: createInventory(),
      param: () => null,
      hasBuff: (id) => Boolean(buffs[id]),
      applyBuff: (id, opts = {}) => {
        if (opts.extendMs && buffs[id]) { buffs[id] += opts.extendMs; calls.extend.push(id); return; }
        buffs[id] = 120_000;
        calls.apply.push(id);
      },
      achievement: (counter, n) => calls.achievements.push([counter, n]),
      toast: (msg) => calls.toasts.push(msg),
      pushActivity: (row) => calls.activity.push(typeof row === 'string' ? row : row.base),
      updateHud: () => {},
      save: () => {},
      setData: () => {},
    };
    return { engine, buffs, calls };
  }

  it('three candies with eight eaten: the rule three times in order, one toothache, no toast of its own', () => {
    seasonsFeature._reset();
    seasonsFeature.restore({ daily: { day: getGameDayKey(Date.now()), candy: 8, pies: 0, nog: 0, pi: 0, treats: {} } }, null);
    const { engine, buffs, calls } = seasonEngine({ mood: 50 });
    assert.deepEqual(seasonsFeature.packEatLimit('birch_candy'), { kind: 'candy', daily: 11, eaten: 8, left: 3, toothacheMood: 10 });
    seasonsFeature.onEvent('birch_candy:eat', 3, engine);
    assert.equal(seasonsFeature._state().state.daily.candy, 11);
    // The ninth applies the rush, the tenth extends it, the eleventh aches (birch_candy.js 159-189).
    assert.deepEqual(calls.apply, ['sugar_rush']);
    assert.deepEqual(calls.extend, ['sugar_rush']);
    assert.equal(buffs.sugar_rush, 240_000);
    assert.equal(engine.pc.mood, 40);
    assert.deepEqual(calls.toasts, [], 'the pack shows the one toast');
    const line = 'OW! TOOTHACHE! Stupid candy. Stupid, delicious, scrumptious, addictive candy. No more candy today. You lose 10 mood.';
    assert.deepEqual(calls.activity, [line]);
    assert.equal(seasonsFeature.packEatLine('corn_syrup_squares'), null);
    assert.equal(seasonsFeature.packEatLine('birch_candy'), line);
    assert.equal(seasonsFeature.packEatLine('birch_candy'), null, 'once');
    assert.equal(seasonsFeature.packUseGate('birch_candy').ok, false);
    assert.equal(seasonsFeature.packUseGate('birch_candy').msg, "No more candy today. You don't want toothache again.");
    seasonsFeature._reset();
  });

  it('a running Sugar Rush is extended once per candy; one candy still says its own toothache', () => {
    seasonsFeature._reset();
    seasonsFeature.restore({ daily: { day: getGameDayKey(Date.now()), candy: 2, pies: 0, nog: 0, pi: 0, treats: {} } }, null);
    const { engine, buffs, calls } = seasonEngine();
    buffs.sugar_rush = 120_000;
    seasonsFeature.onEvent('carobish_treats:eat', 2, engine);
    assert.deepEqual(calls.extend, ['sugar_rush', 'sugar_rush'], 'num + 1 then (num - 1) durations: two more');
    assert.equal(buffs.sugar_rush, 360_000);
    seasonsFeature.restore({ daily: { day: getGameDayKey(Date.now()), candy: 10, pies: 0, nog: 0, pi: 0, treats: {} } }, null);
    seasonsFeature.onEvent('birch_candy:eat', 1, engine);
    assert.equal(calls.toasts.length, 1, 'a single eat keeps its own line');
    assert.equal(seasonsFeature.packEatLine('birch_candy'), null);
    seasonsFeature._reset();
  });

  it('pies: the count added once, Full of Pie once, and the source line when the batch makes five', () => {
    seasonsFeature._reset();
    seasonsFeature.restore({ daily: { day: getGameDayKey(Date.now()), candy: 0, pies: 3, nog: 0, pi: 0, treats: {} } }, null);
    const { engine, calls } = seasonEngine();
    assert.equal(seasonsFeature.packEatLimit('pumpkin_pie').left, 2);
    seasonsFeature.onEvent('pumpkin_pie:eat', 2, engine);
    assert.equal(seasonsFeature._state().state.daily.pies, 5);
    assert.deepEqual(calls.apply, ['full_of_pie']);
    assert.equal(seasonsFeature.packEatLine('pumpkin_pie'), SOURCE_LINES.noMorePie);
    assert.equal(seasonsFeature.packUseGate('pumpkin_pie').msg, SOURCE_LINES.noMorePie);
    seasonsFeature._reset();
  });

  it('the pack card offers the count, cut to the limit, with the cap note and one summary toast', () => {
    const info = game.slice(game.indexOf('function packEatManyInfo('), game.indexOf('function packEatPreview('));
    assert.match(info, /const cap = limitCountCap\(consumeCountCap\(base, pc, have, \{ energyMax: energyCap\(\) \}\), limit\);/);
    assert.match(info, /max: cap\.max, cap, limit \};/);
    const preview = game.slice(game.indexOf('function packEatPreview('), game.indexOf('function packEatCapNote('));
    assert.match(preview, /many\.limit\?\.toothacheMood && qty >= many\.limit\.left/);
    const note = game.slice(game.indexOf('function packEatCapNote('), game.indexOf('function showToolRepairFx('));
    assert.match(note, /Eleven candies a day: \$\{many\.max\} more today and the last one brings a toothache, so \$\{rest\} in your pack\./);
    assert.match(note, /Five pies a day: \$\{many\.max\} more today, so \$\{rest\} in your pack\./);
    assert.match(note, /That makes eleven today: the last one brings a toothache\./);
    const use = game.slice(game.indexOf('function usePackItem('), game.indexOf('function openPackedCubimalBox('));
    assert.match(use, /const limit = features\.query\('packEatLimit', classTsid, engine\);\s*const cap = limitCountCap\(consumeCountCap\(ordinaryInfo, pc, countItem\(inv, classTsid\), \{ energyMax: energyCap\(\) \}\), limit\);/);
    assert.match(use, /const capLine = eaten > 1 \? features\.query\('packEatLine', classTsid, engine\) : null;/);
    assert.match(use, /\$\{capLine \? ` \$\{capLine\}` : ''\}`/);
    // The gate still refuses the eat that would pass the limit.
    assert.ok(use.indexOf("features.query('packUseGate', classTsid, engine)") < use.indexOf("features.query('packEatLimit', classTsid, engine)"));
  });
});
