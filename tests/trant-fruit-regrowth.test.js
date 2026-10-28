/**
 * G262: living trants regrow fruit when tended, never at the day turn.
 *
 * GSJS items/include/trants.js pushes fruit in three places only: initTrant's
 * fillWithFruit (518), the harvest's put-back of fruit the pack refused (432),
 * and onFruitCycle (1043-1054), which only plusHealth calls (697-704).
 * plusHealth runs from performTending once a tree is both petted and watered
 * (670-684), from onFertilidust (1236-1244) and from the rook recovery steps.
 * The per-day reset is the harvest limit alone: inc_skill_packages.js 690-719
 * keys package_intervals by current_day_key().
 *
 * Run: node --test tests/trant-fruit-regrowth.test.js
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { performTrantCare, trantFruitCycle } from '../public/js/trant-care.js?v=g403-1';
import {
  createTrantState,
  fruitCapacityAt,
  fruitProductionAt,
  setTrantTables,
} from '../public/js/trants.js?v=trant-harvest-2';
import { fertilizeTree } from '../public/js/powders.js?v=g403-1';
import { createPlot, growTree, resetPlotDay, reviveDeadTree } from '../public/js/patches.js?v=g403-1';
import { createToolConditionState } from '../public/js/tools.js?v=woodcutting-test-8';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const gsjs = path.resolve(root, '../glitch-GameServerJS');
const read = (rel) => fs.readFileSync(path.join(gsjs, rel), 'utf8');
setTrantTables(JSON.parse(fs.readFileSync(path.join(publicDir, 'assets/content/trants.json'), 'utf8')));

const ctx = () => ({
  inv: { watering_can: 1 },
  pc: { energy: 100, mood: 50, imagination: 0, xp: 0 },
  tools: createToolConditionState(),
  learned: ['light_green_thumb_1'],
  rng: () => 0,
});

test.describe('the source pushes fruit only from initTrant, the harvest put-back and plusHealth', () => {
  const src = read('items/include/trants.js');
  test('onFruitCycle has one caller, plusHealth', () => {
    const calls = [...src.matchAll(/this\.onFruitCycle\(\)/g)];
    assert.equal(calls.length, 1);
    const plusHealth = src.slice(src.indexOf('function plusHealth(){'), src.indexOf('function minusHealth(){'));
    assert.match(plusHealth, /this\.onFruitCycle\(\);/);
    assert.match(src, /function onFruitCycle\(\)\{\n\tthis\.updateFruitCap\(\);[\s\S]{0,200}fruitProdMap\[this\.instanceProps\.maturity-1\]\[this\.instanceProps\.health-1\];[\s\S]{0,60}this\.pushFruit\(value\);/);
  });
  test('fillWithFruit runs only in initTrant and pushFruit only from the cycle and the put-back', () => {
    assert.equal([...src.matchAll(/this\.fillWithFruit\(\)/g)].length, 1);
    const init = src.slice(src.indexOf('function initTrant(){'), src.indexOf('function fillWithFruit(){'));
    assert.match(init, /this\.fillWithFruit\(\);/);
    assert.equal([...src.matchAll(/this\.pushFruit\(/g)].length, 2);
    assert.match(src, /\/\/ Put back any fruit we couldn't take[\s\S]{0,80}this\.pushFruit\(remaining\);/);
  });
  test('performTending raises health once both pet and water landed', () => {
    assert.match(src, /function performTending\(pc\)\{[\s\S]{0,120}if \(this\.pettings && this\.waterings\)\{[\s\S]{0,80}this\.plusHealth\(\);/);
    assert.match(src, /function onFertilidust\(\)\{[\s\S]{0,120}this\.instanceProps\.health = 9;\n\tthis\.plusHealth\(\);/);
  });
  test('nothing in GSJS refills a trant at the new day', () => {
    assert.doesNotMatch(src, /new_?day|NewDay/i);
    const player = read('players/player.js');
    const doNewDay = player.slice(player.indexOf('function doNewDay('), player.indexOf('function doNewDay(') + 6000);
    assert.doesNotMatch(doNewDay, /trant|fruit/i);
    assert.match(read('players/inc_skill_packages.js'), /function incrementSkillPackageLimit\(class_id, source_item\)\{\n\tvar today = current_day_key\(\);/);
  });
  test('a grown or revived trant starts empty: initTrant fills at maturity 1, whose capacity row is 0', () => {
    const fruit = read('items/trant_fruit.js');
    assert.match(fruit, /var fruitCapMap = \[\n\t\[0,0,0,0,0,0,0,0,0,0\],/);
    assert.match(src, /this\.instanceProps\.maturity = 1;\n\tthis\.instanceProps\.fruitCount = 0;/);
    assert.match(read('items/patch_seedling.js'), /ps\.setInstanceProp\("maturity", this\.grow_level\);/);
  });
});

test.describe('the remake regrows fruit the same way', () => {
  test('pet and water together regrow the production cell, capped at capacity', () => {
    const s = createTrantState('trant_fruit', { maturity: 7, health: 7, fruitCount: 0 });
    const pet = performTrantCare(s, 'trant_fruit', 'pet', ctx());
    assert.equal(pet.ok, true);
    assert.equal(s.fruitCount, 0, 'one half of the tending pushes nothing');
    const water = performTrantCare(s, 'trant_fruit', 'water', ctx());
    assert.equal(water.ok, true);
    assert.equal(s.health, 8);
    const cap = fruitCapacityAt('trant_fruit', 7, 8);
    assert.equal(fruitProductionAt('trant_fruit', 7, 8), 112);
    assert.equal(cap, 56);
    assert.equal(s.fruitCount, Math.min(cap, 112));
    assert.equal(water.fruitAdded, cap);
  });
  test('the cycle still pushes at health 10 and adds nothing to a full tree', () => {
    // trant_bean keeps the unswapped tables (capacity 576, production 288 at 10/10).
    const s = createTrantState('trant_bean', { maturity: 10, health: 10, fruitCount: 3 });
    assert.equal(trantFruitCycle(s, 'trant_bean'), 288);
    assert.equal(s.fruitCount, 291);
    assert.equal(trantFruitCycle(s, 'trant_bean'), 576 - 291);
    assert.equal(trantFruitCycle(s, 'trant_bean'), 0);
  });
  test('Fertilidust regrows the fruit with its health tick', () => {
    const s = createTrantState('trant_spice', { maturity: 6, health: 5, fruitCount: 0 });
    fertilizeTree('trant_spice', s);
    assert.equal(s.maturity, 7);
    assert.equal(s.health, 10);
    assert.equal(s.fruitCount, fruitCapacityAt('trant_spice', 7, 10));
  });
  test('a plot tree keeps its fruit at the day turn and grows or revives empty', () => {
    const plot = createPlot('patch', { now: 1, seed: 'g262' });
    plot.stage = 'seedling';
    plot.seedling = { trantClass: 'trant_fruit', beanClass: 'bean_fruit', plantedAt: 1, minAt: 1, maxAt: 1, upgradeGrowLevel: 0, petted: 3, petters: 0, growLevel: 6, thirdPetAt: 1 };
    const tree = growTree(plot, 1);
    assert.equal(tree.state.fruitCount, 0);
    tree.state.fruitCount = 5;
    tree.state.harvestsToday = 2;
    tree.state.petted = true;
    resetPlotDay(plot, () => 0.99, 2);
    assert.equal(tree.state.fruitCount, 5);
    assert.equal(tree.state.harvestsToday, 0);
    assert.equal(tree.state.petted, false);
    const dead = createPlot('patch', { now: 1, seed: 'g262-dead' });
    dead.stage = 'dead';
    dead.deadClass = 'trant_bean_dead';
    assert.equal(reviveDeadTree(dead, 3).state.fruitCount, 0);
  });
  test('the game day turn resets limits without refilling', () => {
    const game = fs.readFileSync(path.join(publicDir, 'game.js'), 'utf8');
    const body = game.slice(game.indexOf('function resetAllTrantsForNewDay() {'), game.indexOf('function resetAllAnimalsForNewDay()'));
    assert.match(body, /resetTrantDay\(tree\.state\);/);
    assert.doesNotMatch(body, /refillFruit/);
    for (const rel of ['js/patches.js', 'js/trant-care.js', 'js/powders.js']) {
      const src = fs.readFileSync(path.join(publicDir, rel), 'utf8');
      assert.doesNotMatch(src, /refillFruit\(/, rel);
    }
  });
});
