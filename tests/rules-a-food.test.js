/**
 * rules-a food and drink (2026-11-12): drink iMG takes the mood bonus, no drinking while
 * dead, Bacon and Sesame Oil are edible, the flavour lines, the 75% fullness line and the
 * fallback eat numbers. Sources: glitch-GameServerJS items/include/drink.js,
 * items/include/food.js, players/inc_stats.js, items/<class>.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { CONSUME_FLAVOUR_LINES, getItemUseInfo, useItem } from '../public/js/inventory.js?v=2bd5b93e';
import { useItemMany } from '../public/js/eat-many.js?v=f2dba300';
import { moodScaledXp } from '../public/js/mood-xp.js?v=958e7680';

const game = fs.readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');

describe('drink iMG takes the mood bonus (drink.js 108-111, inc_stats.js 270-271)', () => {
  it('a Bubble Tea at a high mood gives more than its 10, at a low mood less', () => {
    const happy = { energy: 50, mood: 60, energyMax: 100, moodMax: 100, imagination: 0, xp: 0 };
    const want = moodScaledXp({ ...happy, mood: 90 }, 10);
    const r = useItem({ bubble_tea: 1 }, happy, 'bubble_tea');
    assert.equal(r.ok, true);
    assert.equal(r.effects.xp, want, 'scaled after the mood the drink gave (30 mood first)');
    assert.ok(want > 10);
    const sad = { energy: 50, mood: 1, energyMax: 100, moodMax: 100, imagination: 0, xp: 0 };
    const lemon = useItem({ lemon_juice: 1 }, sad, 'lemon_juice');
    assert.ok(lemon.effects.xp === undefined || lemon.effects.xp < 10);
  });

  it('a count of drinks scales once, as count x drink_xp', () => {
    const pc = { energy: 10, mood: 60, energyMax: 100, moodMax: 100, imagination: 0, xp: 0 };
    const r = useItemMany({ bubble_tea: 2 }, pc, 'bubble_tea', 2);
    assert.equal(r.effects.xp, moodScaledXp({ mood: 100, moodMax: 100 }, 20));
  });
});

describe('no drinking or eating while dead (orange_juice.js 112-115, include/food.js 14)', () => {
  it('the pack greys Drink and Eat with "You are dead :(" and keeps the item', () => {
    assert.match(game, /const DEAD_CONSUME_LINE = 'You are dead :\(';/);
    assert.match(game, /playerIsDead\(\) && \(info\.kind === 'drink' \|\| info\.effects\?\.energy\)/);
    assert.match(game, /\(ordinaryInfo\.kind === 'drink' \|\| isFood\) && playerIsDead\(\)\) \{\n\s+toast\(DEAD_CONSUME_LINE\);\n\s+return;/);
  });
});

describe('Bacon and Sesame Oil are food (bacon.js 16, 23; sesame_oil.js 16, 23)', () => {
  it('a Rasher of Bacon is 100 energy, Sesame Oil 4', () => {
    assert.deepEqual([getItemUseInfo('bacon').usable, getItemUseInfo('bacon').effects.energy], [true, 100]);
    assert.equal(getItemUseInfo('sesame_oil').effects.energy, 4);
  });
});

describe('flavour lines after the eat', () => {
  it('Stinky Cheese, Pi, Butterfly Milk and Pumpkin Ale say their own line', () => {
    assert.equal(Object.keys(CONSUME_FLAVOUR_LINES).length, 6);
    const r = useItem({ milk_butterfly: 1 }, { energy: 50, mood: 10, moodMax: 100 }, 'milk_butterfly');
    assert.equal(r.flavour, 'Butterfly milk has the delicate effervescence of a thousand butterfly farts dancing on your tongue.');
    assert.match(game, /if \(r\.flavour\) pushActivity\(r\.flavour\);/);
  });
});

describe('the 75% fullness line is the source prompt (include/food.js 165-174)', () => {
  it('says it in full', () => {
    assert.ok(game.includes(' You are getting quite full and won’t be able to eat much more today.'));
  });
});

describe('the fallback eat numbers are the source\'s', () => {
  it('base_cost x energy_factor and drink_* props', () => {
    assert.deepEqual(getItemUseInfo('cherry').effects, { energy: 1 });
    assert.deepEqual(getItemUseInfo('sammich').effects, { energy: 29 });
    assert.deepEqual(getItemUseInfo('milk_butterfly').effects, { mood: 6 });
    assert.deepEqual(getItemUseInfo('orange_juice').effects, { energy: 15, mood: 20 });
    assert.deepEqual(getItemUseInfo('lemon_juice').effects, { energy: 10, mood: -5, xp: 10 });
  });
});
