/**
 * G334 (Piggies only), Austin 2026-11-07: a street Piggy walks in the same place on every player's
 * screen, as Chickens and Butterflies do (js/street-creatures.js piggyWalkAt; the server keeps "lag"
 * and "hold", groddle-afternoon-server objects_pigs.go, TestStreetPiggiesWalkAPath). Rooting is on
 * the shared path (npc_piggy.js startMoving 1226-1245, onRooting 1131-1160). Race Piggies, yard
 * animals and solo stay as they were.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { CREATURE_PATHS, PATH_STEP, PIGGY_PLAN_ROOTS, PIGGY_ROOT, followPath, pathFrom, pathTime, piggyPlan, piggyWalkAt, chickenSeed } from '../public/js/street-creatures.js?v=fe3f7248';
import { createStreetCopy, reconcile, streetPigIndex, takeObjs } from '../public/js/street-objects.js?v=33bc330f';
import { GAME_EPOCH_MS } from '../public/js/game-day.js?v=cf9afac0';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const gsjs = read('../glitch-GameServerJS/items/npc_piggy.js');
const home = (over = {}) => ({ baseX: 1000, range: 90, speed: CREATURE_PATHS.pig.speed, dir: 1, trunks: [], trunkPx: 0, ...over });

describe('G334 a street Piggy on a shared path', () => {
  it('keeps the solo walk and the source rooting', () => {
    assert.equal(CREATURE_PATHS.pig.speed, 0.45 * 60, 'game.js spawnPiggies 0.45 px a frame');
    assert.match(gsjs, /onRooting/);
    assert.deepEqual([...PIGGY_ROOT.walkS], [3, 10]);
    assert.equal(PIGGY_ROOT.lookMs, 5000);
    assert.equal(PIGGY_ROOT.sniffMs, 3000);
    assert.equal(PIGGY_ROOT.lookChance, 0.3);
  });

  it('every page with the same spot and seed has it in the same place at the same time', () => {
    const seed = chickenSeed(2, 1000);
    for (const t of [0, 1234, 60_000, 3_600_000, 86_400_000]) {
      assert.deepEqual(piggyWalkAt(home(), t, seed), piggyWalkAt(home(), t, seed));
    }
    // Two Piggies on a street do not walk in step.
    const other = chickenSeed(3, 1000);
    const differs = [...Array(40).keys()].some((i) => piggyWalkAt(home(), i * 7000, seed).x !== piggyWalkAt(home(), i * 7000, other).x);
    assert.ok(differs);
  });

  it('stays on its walk, never jumps, and its round joins up', () => {
    const seed = chickenSeed(1, 1000);
    const plan = piggyPlan(home(), seed);
    assert.equal(plan.segs.filter((g) => g.pose !== 'walk').length, PIGGY_PLAN_ROOTS);
    let was = piggyWalkAt(home(), 0, seed);
    for (let t = 100; t < plan.ms * 2; t += 100) {
      const now = piggyWalkAt(home(), t, seed);
      assert.ok(now.x >= 910 - 1e-6 && now.x <= 1090 + 1e-6, `x ${now.x} at ${t}`);
      assert.ok(Math.abs(now.x - was.x) <= 27 * 0.1 + 1e-6, `a jump at ${t}: ${was.x} to ${now.x}`);
      was = now;
    }
  });

  it('roots as the source does: 3 to 10 s of walk, a look on 5 s, a sniff 3 s that turns it round', () => {
    const plan = piggyPlan(home(), chickenSeed(4, 1000));
    for (let i = 0; i + 1 < plan.segs.length - 1; i += 2) {
      const walk = plan.segs[i];
      const root = plan.segs[i + 1];
      assert.equal(walk.pose, 'walk');
      assert.ok(walk.ms >= 3000 && walk.ms <= 10000, `walk ${walk.ms}`);
      assert.equal(root.ms, root.pose === 'look' ? 5000 : 3000);
    }
    assert.ok(plan.segs.some((g) => g.pose === 'look') && plan.segs.some((g) => g.pose === 'sniff'));
  });

  it('does not stop in a tree\'s trunk', () => {
    const trunks = [1000, 1060];
    const trunkPx = 40;
    const plan = piggyPlan(home({ trunks, trunkPx }), chickenSeed(5, 1000));
    for (const g of plan.segs) {
      if (g.pose === 'walk') continue;
      const { x } = piggyWalkAt(home({ trunks, trunkPx }), g.at + 1, chickenSeed(5, 1000));
      assert.ok(trunks.every((t) => Math.abs(t - x) >= trunkPx), `rooting at ${x}`);
    }
  });

  it('a hold stops the clock for everyone, and the path goes on from there', () => {
    const local = 1_800_000_000_000;
    const path = pathFrom({ lag: 2500, hold: 2500 }, local, 0, local);
    const stopped = pathTime(path, local, 0);
    assert.equal(pathTime(path, local + 2000, 0), stopped, 'held');
    assert.equal(pathTime(path, local + 3500, 0), stopped + 1000, 'on again');
    assert.equal(pathTime({ lag: 0, holdEnd: 0 }, GAME_EPOCH_MS + 5000, 0), 5000);
  });

  it('an old server leaves Piggies to each page; a new one puts a path on them', () => {
    const state = { hunger: 0, mood: 1 };
    const target = { classId: 'npc_piggy' };
    const obj = { id: 'pig:0', kind: 'pig', state, target };
    const old = createStreetCopy();
    takeObjs(old, { street: 'GA5', snap: true, creatures: true, animals: [], objs: [{ id: 'pig:0', mood: 1, hunger: 0 }] }, 1000);
    assert.equal(old.pigPaths, false);
    reconcile(obj, old, 1000);
    assert.equal(target.sharedPath, undefined);
    const copy = createStreetCopy();
    takeObjs(copy, { street: 'GA5', snap: true, creatures: true, pigpaths: true, animals: [], now: 5000, objs: [{ id: 'pig:0', mood: 1, hunger: 0, lag: 300, hold: 200 }] }, 1000);
    assert.equal(copy.pigPaths, true);
    reconcile(obj, copy, 1000);
    assert.deepEqual(target.sharedPath, { lag: 300, holdEnd: 5200 });
  });

  it('only a street Piggy has one: race Piggies and yard animals stay their own', () => {
    assert.equal(streetPigIndex({ classId: 'npc_piggy', animalKey: 'GA5:npc_piggy:3' }, 'GA5'), 3);
    assert.equal(streetPigIndex({ classId: 'race_piggy', animalKey: 'GA5:npc_piggy:3' }, 'GA5'), -1);
    assert.equal(streetPigIndex({ classId: 'npc_piggy', husbandryAnimal: true, animalKey: 'GA5:npc_piggy:3' }, 'GA5'), -1);
    assert.equal(streetPigIndex({ classId: 'npc_piggy', animalKey: 'RH_HOME_EXT:npc_piggy:0' }, 'GA5'), -1);
  });

  it('game.js walks a Piggy on its path before its patrol, a held one stays local', () => {
    const game = read('public/game.js');
    const at = game.indexOf('for (const p of piggies) {');
    const body = game.slice(at, game.indexOf('for (const c of chickens) {', at));
    assert.ok(body.indexOf('p._path?.(dt)') < body.indexOf('p.x += p.vx * dt'));
    assert.match(body, /p\._pathStand\?\.\(\)/);
    const feature = read('public/js/features/street-objects-feature.js');
    const step = feature.slice(feature.indexOf("} else if (obj.kind === 'pig') {\n    // G334"));
    assert.match(step, /if \(!copy\.pigPaths\) return;/);
    assert.match(step, /if \(Math\.abs\(spr\.vx \|\| 0\) < 0\.01\) return false;/);
    const mood = read('public/js/features/animal-mood-feature.js');
    assert.match(mood, /r\.mode === 'idle' && !target\.sprite\._path && !isExtra\(target\)/, 'its own rooting clock stops on a path');
    assert.ok(PATH_STEP.pig > 0.45, 'the sprite can keep up with its path');
    assert.equal(followPath(100, 100.3, 1, PATH_STEP.pig), 100.3);
  });
});
