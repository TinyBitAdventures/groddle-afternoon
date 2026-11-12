/**
 * Street Chickens, Butterflies and Batterflies shared between players (multiplayer):
 * js/street-creatures.js (ids, the shared paths and their clock, the server's word on an animal's
 * state), the street-objects feature's side (the animals the server names follow their shared
 * paths, their verbs ask the server, others' verbs show here, solo untouched), and
 * tools/build-realtime-objects.mjs (the animals laid out as the game spawns them). The server side
 * is objects_creatures_test.go in groddle-afternoon-server.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  SNAP_PX,
  applyCreatureState,
  batterflyAt,
  batterflyPerks,
  batterflyResponseFor,
  CHICKEN_PAUSE,
  CHICKEN_PLAN_PAUSES,
  chickenPauseRoll,
  chickenPlan,
  chickenSeed,
  chickenWalkAt,
  clockOffset,
  creatureOf,
  easeToward,
  flyerAt,
  followPath,
  PATH_STEP,
  pathFrom,
  pathTime,
  serverPathClock,
  restAt,
  sharedCreatureLabel,
  walkerAt,
} from '../public/js/street-creatures.js?v=1ee77084';
import { actMessage, createStreetCopy, guanoPiles, idKind, reconcile, takeObjs } from '../public/js/street-objects.js?v=aa7262bf';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=3087c72e';
import { FEATURES } from '../public/js/features/index.js?v=b3607753';
import { GAME_EPOCH_MS } from '../public/js/game-day.js?v=188ef3fa';
import { creatureRequests, setCreatureEcology, streetObjectLayout } from '../tools/build-realtime-objects.mjs';
import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs } from '../public/js/street-loader.js?v=18b181ad';
import { setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=26dabe26';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

describe('street animals: the shared paths', () => {
  it('a Chicken walks to and fro across its spot, the odd ones setting off left', () => {
    const home = { baseX: 500, range: 100, speed: 30, dir: 1 };
    assert.deepEqual(walkerAt(home, 0), { x: 500, dir: 1 });
    assert.deepEqual(walkerAt(home, 2000), { x: 560, dir: 1 });
    assert.equal(walkerAt(home, 5000).x, 550);
    assert.equal(walkerAt(home, 5000).dir, -1);
    assert.equal(walkerAt(home, 10000).x, 400);
    assert.equal(walkerAt({ ...home, dir: -1 }, 1000).x, 470);
    for (let t = 0; t < 40000; t += 777) {
      const x = walkerAt(home, t).x;
      assert.ok(x >= 400 - 1e-9 && x <= 600 + 1e-9, `${t}: ${x}`);
    }
  });

  it('a flyer crosses the street and comes back in from the far side; a resting one bobs', () => {
    const home = { x0: 100, baseY: 500, worldW: 1000, phase0: 0 };
    assert.equal(flyerAt(home, 0).x, 100);
    assert.equal(flyerAt(home, 10000).x, 490);
    assert.ok(Math.abs(flyerAt(home, (1080 / 39) * 1000).x - 100) < 1e-6, 'one lap of the street and its margins');
    for (let t = 0; t < 60000; t += 1111) {
      const p = flyerAt(home, t);
      assert.ok(p.x >= -40 && p.x <= 1040 && Math.abs(p.y - 500) <= 14);
      assert.ok(Math.abs(restAt({ groundY: 800, phase0: 1 }, t).y - 802) <= 2);
      const b = batterflyAt({ baseX: 700, baseY: 300, phase0: 2 }, t);
      assert.ok(Math.abs(b.x - 700) <= 170 && Math.abs(b.y - 300) <= 60);
    }
  });

  it('the path clock is the server\'s, minus the time held, and stands still while held', () => {
    const local = 1_000_000;
    const offset = 5000;
    assert.equal(pathTime({ lag: 0, holdEnd: 0 }, local, offset), local + offset - GAME_EPOCH_MS);
    // The hold's end is kept on the server's clock (received at `local` with that offset).
    const held = pathFrom({ lag: 3000, hold: 2500 }, local, offset);
    assert.deepEqual(held, { lag: 3000, holdEnd: local + offset + 2500 });
    const at = pathTime(held, local, offset);
    assert.equal(pathTime(held, local + 2000, offset), at, 'still while held');
    assert.equal(pathTime(held, local + 3500, offset), at + 1000, 'then on again');
    // Two clients whose clocks differ see the same place: each has its own offset to the server.
    const server = 2_000_000_000_000;
    const a = pathTime({ lag: 0, holdEnd: 0 }, server - 7000, 7000);
    const b = pathTime({ lag: 0, holdEnd: 0 }, server + 3000, -3000);
    assert.equal(a, b);
  });

  it('a held animal stands still whatever the clock does meanwhile (lane CHICKLOOP)', () => {
    const local = 1_000_000;
    const held = pathFrom({ lag: 3000, hold: 2500 }, local, 5000);
    // A later frame was held up 200 ms on the way, then a quick one: the place does not move.
    const at = pathTime(held, local + 100, 5000);
    assert.equal(pathTime(held, local + 300, 4800), at);
    assert.equal(pathTime(held, local + 900, 5050), at);
    // The "at" a wait sends: the path's clock as the server counts it (server ms minus lag).
    assert.equal(serverPathClock(held, local + 100, 5000), local + 5000 + 2500 - 3000);
    assert.equal(serverPathClock({ lag: 400, holdEnd: 0 }, local, 5000), local + 5000 - 400);
    // A frame's own "now" fixes the hold's end on the server's clock, whatever the offset reads.
    assert.deepEqual(pathFrom({ lag: 3000, hold: 2500 }, local, 4321, 7_000_000), { lag: 3000, holdEnd: 7_002_500 });
  });

  it('the street\'s clock is the least delayed recent frame (lane CHICKLOOP)', () => {
    const samples = [];
    assert.equal(clockOffset(samples, 10_000, 4000), 6000);
    // Frames held up 150 and 300 ms read late: the offset stays.
    assert.equal(clockOffset(samples, 11_000, 5150), 6000);
    assert.equal(clockOffset(samples, 12_000, 6300), 6000);
    // A quicker frame than any before wins at once.
    assert.equal(clockOffset(samples, 13_000, 6990), 6010);
    // After the window the old frames are forgotten (the way there got slower for good).
    assert.equal(clockOffset(samples, 50_000, 44_100), 5900);
    assert.ok(samples.length <= 64);
  });

  it('pointing at a walker never moves it (lane CHICKLOOP: a Chicken dropped 25-53 px when a verb began)', () => {
    // clearHoverGlow put back the y the sprite had when the pointer came over it; a Chicken or Piggy
    // that walked up or down a slope since (followWalkFloor) went into the ground or the air.
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    const fn = (name) => {
      const i = game.indexOf(`function ${name}(`);
      return game.slice(i, game.indexOf('\n}\n', i));
    };
    for (const name of ['clearHoverGlow', 'setHoverTarget']) {
      assert.doesNotMatch(fn(name), /\.y\s*=[^=]|_hoverBaseY/, name);
    }
  });

  it('a walker is on its path, eases back to it after a correction, and jumps when far off', () => {
    // CHICKLOOP: within its walking pace a frame the sprite is on the path, not 4 px behind it.
    assert.equal(followPath(100, 100.5, 1, PATH_STEP.chicken), 100.5);
    assert.equal(followPath(100, 101.5, 2, PATH_STEP.chicken), 101.5, 'a slow frame');
    assert.ok(Math.abs(followPath(100, 110, 1, PATH_STEP.chicken) - 101.8) < 1e-9, 'a correction eases');
    // Behind a walking path (0.5 px a frame) it closes the gap and is on it again, not 4 px behind.
    let x = 0;
    let target = 10;
    for (let k = 0; k < 90; k += 1) {
      target += 0.5;
      x = followPath(x, target, 1, PATH_STEP.chicken);
      assert.ok(target - x < 10.5 && x <= target, `never past it, never further back: ${x} ${target}`);
    }
    assert.equal(x, target, 'on its path after a second and a half');
    assert.equal(followPath(0, SNAP_PX + 1, 1), SNAP_PX + 1);
    assert.ok(Math.abs(easeToward(0, 10, 1) - 1.2) < 1e-9);
    assert.equal(easeToward(0, SNAP_PX + 1, 1), SNAP_PX + 1);
    assert.equal(easeToward(5, 5.1, 1), 5.1);
  });
});

describe('street animals: a Chicken\'s walk, turns and pauses (lane CHICKWALK)', () => {
  // Austin 2026-11-01: "They move left and then snap back to the middle walking right. They never
  // turn around from the left and walk to the right."
  const homes = [
    { baseX: 1000, range: 100, dir: 1 },
    { baseX: 1000, range: 100, dir: -1 },
    { baseX: 2500, range: 30, dir: 1 },
  ];
  const run = (home, seed, from, ms, fn) => {
    let prev = null;
    for (let t = from; t <= from + ms; t += 1000 / 60) {
      const p = chickenWalkAt(home, t, seed);
      fn(p, prev, t);
      prev = p;
    }
  };

  it('the original\'s pauses: every 6-14 s, 2-4 s standing or pecking, turning round half the time', () => {
    assert.deepEqual([...CHICKEN_PAUSE.everyMs], [6000, 14000]);
    // Each pause's pose is the source's own state (npc_chicken.js pause_state_choices 1856-1865; lane
    // refsart drew them: tests/chicken-idles.test.js). The times and the rolls are what they were.
    assert.deepEqual(CHICKEN_PAUSE.choices.map(([ms, pose]) => `${ms / 1000}${pose}`), ['4idle1', '4idle1', '4idle1', '4idle2', '4idle3', '4pause', '3pecking_twice', '2pecking_once']);
    const rng = (() => { let k = 0; const v = [0, 0.4, 0, 0.99, 0.6, 0.999999]; return () => v[k++ % v.length]; })();
    assert.deepEqual(chickenPauseRoll(rng), { holdMs: 4000, pose: 'idle1', turn: true, nextMs: 6000 });
    assert.deepEqual(chickenPauseRoll(rng), { holdMs: 2000, pose: 'pecking_once', turn: false, nextMs: 14000 });
  });

  it('walks to each end of its walk, turns there and walks back, never a jump', () => {
    for (const [i, home] of homes.entries()) {
      const seed = chickenSeed(i, home.baseX);
      const plan = chickenPlan(home, seed);
      let maxStep = 0;
      const turns = { left: 0, right: 0 };
      run(home, seed, 1.7e12, 2 * plan.ms, (p, prev) => {
        assert.ok(p.x >= home.baseX - home.range - 1e-6 && p.x <= home.baseX + home.range + 1e-6, `inside its walk: ${p.x}`);
        if (!prev) return;
        maxStep = Math.max(maxStep, Math.abs(p.x - prev.x));
        if (p.dir === prev.dir) return;
        if (Math.abs(p.x - (home.baseX - home.range)) < 1) turns.left += 1;
        else if (Math.abs(p.x - (home.baseX + home.range)) < 1) turns.right += 1;
        else assert.notEqual(prev.pose, 'walk', `a turn mid-walk only after a pause: x ${p.x}`);
        if (prev.x <= home.baseX - home.range + 1e-6) assert.equal(p.dir, 1, 'from the left end it walks right');
        if (prev.x >= home.baseX + home.range - 1e-6) assert.equal(p.dir, -1, 'from the right end it walks left');
      });
      assert.ok(maxStep <= 0.5 + 1e-4, `at most its 0.5 px a frame: ${maxStep}`);
      assert.ok(turns.left >= 1 && turns.right >= 1, `turns at both ends: ${JSON.stringify(turns)}`);
    }
  });

  it('stands still through a pause, then walks on from there (and a round ends where the next begins)', () => {
    const home = homes[0];
    const seed = chickenSeed(0, home.baseX);
    const plan = chickenPlan(home, seed);
    assert.equal(plan.segs.filter((g) => g.pose !== 'walk').length, CHICKEN_PLAN_PAUSES);
    // Pauses start 6-14 s apart, as onPause's timer, and last their state's seconds.
    const pauses = plan.segs.filter((g) => g.pose !== 'walk');
    for (let k = 1; k < pauses.length; k += 1) {
      const gap = pauses[k].at - pauses[k - 1].at;
      assert.ok(gap >= 6000 && gap <= 14000, `onPause every 6-14 s: ${gap}`);
    }
    for (const g of pauses) assert.ok([2000, 3000, 4000].includes(g.ms));
    const epoch = 3e12 - (3e12 % plan.ms);
    for (const g of plan.segs) {
      const a = chickenWalkAt(home, epoch + g.at + 1, seed);
      const b = chickenWalkAt(home, epoch + g.at + g.ms - 1, seed);
      if (g.pose === 'walk') {
        assert.equal(a.pose, 'walk');
        continue;
      }
      assert.equal(a.pose, g.pose);
      assert.equal(b.x, a.x, 'stands where it stopped');
      assert.equal(b.dir, a.dir, 'facing the way it came until it walks on');
      const on = chickenWalkAt(home, epoch + g.at + g.ms + 1000 / 60, seed);
      assert.ok(Math.abs(on.x - a.x) <= 0.5 + 1e-4, 'walks on from there');
    }
    // The round repeats without a jump.
    const end = chickenWalkAt(home, epoch + plan.ms - 1, seed);
    const next = chickenWalkAt(home, epoch + plan.ms, seed);
    assert.ok(Math.abs(end.x - next.x) < 0.05 && end.dir === next.dir);
    assert.ok(Math.abs(next.x - home.baseX) < 1e-3 && next.dir === 1, 'from its spot, the way it set off');
  });

  it('every page draws it in the same place, and a hold freezes it there', () => {
    const home = homes[1];
    const seed = chickenSeed(1, home.baseX);
    assert.equal(seed, chickenSeed(1, home.baseX));
    assert.notEqual(seed, chickenSeed(2, home.baseX));
    const t = 1_900_000_000_000 - GAME_EPOCH_MS;
    assert.deepEqual(chickenWalkAt({ ...home }, t, seed), chickenWalkAt(home, t, seed));
    const held = pathFrom({ lag: 1000, hold: 3000 }, 5000, t + GAME_EPOCH_MS - 5000);
    const at = chickenWalkAt(home, pathTime(held, 5000, t + GAME_EPOCH_MS - 5000), seed);
    assert.deepEqual(chickenWalkAt(home, pathTime(held, 7500, t + GAME_EPOCH_MS - 5000), seed), at);
  });

  it('the art turns on the spot: the sprite is anchored under the bird (Chicken sheets are cut 27 px off centre)', async () => {
    const { ANIMAL_ANCHOR_X, animalAnchorX } = await import('../public/js/animals.js?v=4e488834');
    assert.equal(animalAnchorX('npc_chicken'), 101 / 148);
    assert.equal(animalAnchorX('npc_piggy'), 0.5);
    assert.equal(animalAnchorX('npc_butterfly'), 0.5);
    assert.ok(Object.isFrozen(ANIMAL_ANCHOR_X));
    // Turned round, the bird's middle (101 of the 148 px cell) stays at x, where at 0.5 it moved
    // 2 x 27 px x 0.702 = 38 px.
    const drawnMid = (anchor, sx) => sx * (101 - anchor * 148) * 0.702;
    assert.equal(Math.abs(drawnMid(animalAnchorX('npc_chicken'), 1) - drawnMid(animalAnchorX('npc_chicken'), -1)), 0);
    assert.ok(Math.abs(drawnMid(0.5, 1) - drawnMid(0.5, -1)) > 37);
    // Every Chicken sprite takes it: the street's, released and raised ones, the tutorial's, a visited yard's.
    assert.match(read('public/game.js'), /function spawnChickens[\s\S]*?spr\.anchor\.x = animalAnchorX\('npc_chicken'\)/);
    for (const f of ['animal-husbandry-feature.js', 'newxp-feature.js', 'yard-verbs-mp-feature.js']) {
      assert.match(read(`public/js/features/${f}`), /anchor\.set\(animalAnchorX\(/, f);
    }
  });

  it('online and solo walk with the pauses: the shared path and game.js\'s own walk', () => {
    const feat = read('public/js/features/street-objects-feature.js');
    assert.match(feat, /chickenWalkAt\(home, pathTime\(t\.sharedPath, Date\.now\(\), copy\.offset\), seed\)/);
    // Held for a player at it, it looks (the source's 'verb'); else the path's pose at the path's frame.
    assert.match(feat, /if \(held\) spr\.walkPose\?\.\(t\.state\?\.incubatingEgg \? 'stand' : 'verb'\);\n\s+else spr\.walkPose\?\.\(p\.pose, p\.poseMs\);/);
    const game = read('public/game.js');
    assert.match(game, /Math\.abs\(c\.vx\) >= 0\.01 && soloChickenPause\(c, dt\)/);
    assert.match(game, /function soloChickenPause\(c, dt\) \{[\s\S]*?chickenPauseRoll\(\)/);
    assert.match(game, /spr\.walkPose = \(pose, ms = null\) =>/);
    // A player at it: it stops and looks (or is left alone: rooked, sad), not walking in place.
    assert.match(game, /currentAction\?\.target\?\.sprite === c\) \{[\s\S]{0,500}?const pose = chickenWaitPose\(\{[\s\S]{0,300}?if \(pose\) c\.walkPose\?\.\(pose\);\n\s+continue;/);
  });
});

describe('street animals: ids and the server\'s word', () => {
  it('names the street\'s own animals by spawn index, never your own', () => {
    assert.deepEqual(creatureOf({ classId: 'npc_chicken', classIndex: 2 }), { id: 'chicken:2', kind: 'chicken', index: 2 });
    assert.deepEqual(creatureOf({ classId: 'npc_butterfly', classIndex: 4, airborne: true }), { id: 'butterfly:4', kind: 'butterfly', index: 4 });
    assert.deepEqual(creatureOf({ classId: 'npc_batterfly', featureId: 'animal-husbandry', husbandryKey: 'batterfly:1' }), { id: 'batterfly:1', kind: 'batterfly', index: 1 });
    assert.equal(creatureOf({ classId: 'npc_chicken', classIndex: 0, husbandryAnimal: 'a3' }), null);
    assert.equal(creatureOf({ classId: 'npc_chicken', featureId: 'animal-husbandry', classIndex: 0 }), null);
    assert.equal(creatureOf({ classId: 'npc_batterfly', husbandryKey: 'batterfly:demo' }), null);
    assert.equal(idKind('chicken:1'), 'chicken');
    assert.equal(idKind('batterfly:0'), 'batterfly');
  });

  it('someone else\'s egg is theirs to hatch; your own is never cleared by a state', () => {
    const now = 1_000_000;
    const s = {};
    applyCreatureState('npc_chicken', s, { id: 'chicken:0', sq: 2, inc: { egg: 'chicken_egg', by: 9, in: 40000 } }, { me: 7, now });
    assert.equal(s.incubatingEgg, 'chicken_egg');
    assert.equal(s.incubationStartedAt, now - 20000);
    assert.equal(s.incubBy, 9);
    assert.equal(s.sharedSqueezes, 2);
    assert.equal(sharedCreatureLabel('npc_chicken', s), 'Sitting on an egg');
    applyCreatureState('npc_chicken', s, { id: 'chicken:0' }, { me: 7, now });
    assert.equal(s.incubatingEgg, undefined, 'their egg hatched: the Chicken is free');
    const mine = { incubatingEgg: 'piggy_egg', incubationStartedAt: now - 59000 };
    applyCreatureState('npc_chicken', mine, { id: 'chicken:0', inc: { egg: 'piggy_egg', by: 7, in: 1000 } }, { me: 7, now });
    assert.equal(mine.incubBy, undefined);
    applyCreatureState('npc_chicken', mine, null, { me: 7, now });
    assert.equal(mine.incubatingEgg, 'piggy_egg', 'my own egg waits for my own hatch');
    const b = { milkUsesToday: 0 };
    applyCreatureState('npc_butterfly', b, { id: 'butterfly:1', ms: 1, mk: 1 });
    assert.equal(sharedCreatureLabel('npc_butterfly', b), 'Milked 1× today · resting in higher planes');
    const bat = { foodCounter: 3 };
    applyCreatureState('npc_batterfly', bat, { id: 'batterfly:0', food: 12 });
    assert.equal(bat.foodCounter, 12);
    assert.equal(batterflyResponseFor(0), 'feed_no_guano');
    assert.equal(batterflyResponseFor(5), 'feed_drops_3');
    assert.deepEqual(batterflyPerks(['batterfly_bonus_guano_2']), ['guano2']);
  });

  it('reconcile puts a fresh animal back on its path from the start', () => {
    const copy = createStreetCopy();
    takeObjs(copy, { street: 'GA1', snap: true, creatures: true, animals: ['chicken:0'], now: 5000, objs: [{ id: 'chicken:0', lag: 2500, hold: 1000, sq: 1 }] }, 1000);
    assert.equal(copy.creatures, true);
    assert.equal(copy.offset, 4000);
    assert.ok(copy.animals.has('chicken:0'));
    const target = { classId: 'npc_chicken', classIndex: 0, state: {} };
    const obj = { id: 'chicken:0', kind: 'chicken', classId: 'npc_chicken', state: target.state, target };
    assert.equal(reconcile(obj, copy, 1200), true);
    // The frame said now 5000: the hold ends at 5000 + 1000 on the server's clock.
    assert.deepEqual(target.sharedPath, { lag: 2500, holdEnd: 6000 });
    copy.objs.clear();
    reconcile(obj, copy, 3000);
    assert.deepEqual(target.sharedPath, { lag: 0, holdEnd: 0 });
    assert.equal(target.state.sharedSqueezes, 0);
  });
});

function rig({ mode = 'multiplayer' } = {}) {
  const sent = [];
  const listeners = new Map();
  const client = {
    state: 'online',
    wanted: 'GSTREET',
    me: { id: 7 },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
      return () => {};
    },
    send(kind, payload = {}) {
      sent.push({ t: kind, ...payload });
      return true;
    },
    emit(type, detail) {
      for (const fn of listeners.get(type) || []) fn(detail);
    },
  };
  const sprite = (x, y) => ({ x, y, baseX: x, range: 100, vx: 0.5, baseScale: 1, scale: { x: 1, y: 1 }, destroyed: false });
  const chicken = { classId: 'npc_chicken', label: 'Chicken', classIndex: 1, state: {}, sprite: sprite(500, 800) };
  const flyer = { classId: 'npc_butterfly', label: 'Butterfly', classIndex: 2, airborne: true, state: {}, sprite: { ...sprite(300, 600), _ambient: true } };
  const resting = { classId: 'npc_butterfly', label: 'Butterfly', classIndex: 0, state: {}, sprite: { ...sprite(900, 800), _groundY: 798, _ambient: false } };
  const bat = { classId: 'npc_batterfly', featureId: 'animal-husbandry', husbandryKey: 'batterfly:0', state: {}, sprite: { ...sprite(700, 400), _home: { baseX: 700, baseY: 400, phase0: 1 } } };
  const calls = [];
  const engine = {
    mode,
    started: true,
    streetTsid: 'GSTREET',
    worldW: 3000,
    inv: { chicken_egg: 1, grain: 20 },
    pc: { energy: 200, imaginationUpgrades: [] },
    learnedSkills: ['animalkinship_1', 'animalhusbandry_1'],
    toolState: null,
    interactables: [chicken, flyer, resting, bat],
    data: {},
    toasts: [],
    activeBuffIds: () => [],
    placement(key) {
      if (key === 'butterflies') return [{ x: 900, y: 798 }, { x: 1200, y: 798 }];
      if (key === 'flyingButterflies') return [{ x: 300, y: 690 }];
      if (key === 'chickens') return [{ x: 400, y: 798 }, { x: 500, y: 798 }];
      return [];
    },
    setData(k, v) { this.data[k] = String(v); },
    toast(line) { this.toasts.push(line); },
    pushActivity() {},
    playSound() {},
    say() {},
    playVerbAnimation(t, verb) { calls.push(['anim', t.classId, verb]); },
    query(hook, t) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'batterflyChew') { calls.push(['chew', t.husbandryKey]); return true; }
      if (hook === 'sharedGuanoPicked') { calls.push(['guano', t]); return true; }
      return null;
    },
    executeVerb(target, verbId) {
      assert.equal(streetObjectsFeature.runVerbOverride(target, verbId, engine), null, 'the granted run goes through');
      calls.push(['execute', verbId, streetObjectsFeature.sharedVerbGrant(target, verbId)]);
    },
  };
  streetObjectsFeature._reset();
  streetObjectsFeature.onTick(16, 0, engine);
  client.emit('roster', { street: 'GSTREET', players: [] });
  return { engine, client, sent, calls, chicken, flyer, resting, bat };
}

const snap = (extra = {}) => ({
  t: 'objs',
  street: 'GSTREET',
  snap: true,
  creatures: true,
  animals: ['batterfly:0', 'butterfly:0', 'butterfly:2', 'chicken:1'],
  now: Date.now(),
  objs: [],
  ...extra,
});

describe('street animals: the feature', () => {
  it('does nothing in solo, nor on a server that does not share them', () => {
    const solo = rig({ mode: 'solo' });
    assert.equal(streetObjectsFeature.runVerbOverride(solo.chicken, 'squeeze', solo.engine), null);
    const old = rig();
    old.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [] });
    streetObjectsFeature.onTick(16, 0, old.engine);
    assert.equal(streetObjectsFeature.runVerbOverride(old.chicken, 'squeeze', old.engine), null, 'the local rules');
    assert.equal(old.chicken.sprite._path, undefined);
  });

  it('puts the street\'s animals on their shared paths', () => {
    const r = rig();
    r.client.emit('msg:objs', snap());
    streetObjectsFeature.onTick(16, 0, r.engine);
    for (const t of [r.chicken, r.flyer, r.resting, r.bat]) assert.equal(typeof t.sprite._path, 'function', t.classId);
    r.chicken.sprite._path(1000);
    const x = r.chicken.sprite.x;
    assert.ok(x >= 400 && x <= 600, `the Chicken walks its 100 px either way of its spot: ${x}`);
    assert.equal(r.flyer.sprite._path(1000), true);
    assert.ok(r.flyer.sprite.x >= -40 && r.flyer.sprite.x <= 3040);
    // The Rook or a sulk holds it here its own way (vx 0, a grounded flyer): the local code runs.
    r.chicken.sprite.vx = 0;
    assert.equal(r.chicken.sprite._path(1), false);
    r.flyer.sprite._ambient = false;
    assert.equal(r.flyer.sprite._path(1), false);
    assert.match(r.engine.data.streetCreatures, /^t\d+ .*chicken:1@\d+,800/);
    // The socket drops: back to the local wander.
    r.client.emit('state', { state: 'connecting' });
    assert.equal(r.chicken.sprite._path, undefined);
  });

  it('a player at a Chicken holds it from where this screen stopped it, for the whole visit (lane CHICKLOOP)', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
    const r = rig();
    let at = null;
    r.engine.interactionTarget = () => at;
    // The server's clock is 5 s ahead of this one; the Chicken has stood 2 s so far (lag 2000).
    r.client.emit('msg:objs', snap({ now: Date.now() + 5000, objs: [{ id: 'chicken:1', lag: 2000, hold: 0 }] }));
    streetObjectsFeature.onTick(16, 0, r.engine);
    const waits = () => r.sent.filter((m) => m.t === 'obj_act' && m.verb === 'wait');
    assert.equal(waits().length, 0, 'nobody at it');
    // The menu opens: this screen stopped it now, on its path's clock (server ms minus lag).
    at = r.chicken;
    const stopped = Date.now() + 5000 - 2000;
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.deepEqual(waits().map((m) => [m.id, m.at]), [['chicken:1', stopped]]);
    // The menu stays open, then a verb on it: every wait names the same stop.
    t.mock.timers.tick(400);
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.equal(waits().length, 1, 'one wait every 700 ms');
    t.mock.timers.tick(400);
    streetObjectsFeature.onTick(16, 0, r.engine);
    t.mock.timers.tick(800);
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.deepEqual(waits().map((m) => m.at), [stopped, stopped, stopped]);
    // It walked on; the next visit stops it somewhere new.
    at = null;
    streetObjectsFeature.onTick(16, 0, r.engine);
    t.mock.timers.tick(3000);
    at = r.chicken;
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.equal(waits().at(-1).at, stopped + 4600);
    // A Batterfly flies on (no wait), and only a street animal the server named is held.
    at = r.bat;
    t.mock.timers.tick(800);
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.equal(waits().length, 4);
  });

  it('a squeeze asks the server with the rank, and runs on its roll', () => {
    const r = rig();
    r.client.emit('msg:objs', snap());
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.equal(streetObjectsFeature.runVerbOverride(r.chicken, 'squeeze', r.engine), true);
    const ask = r.sent.at(-1);
    assert.deepEqual(ask, { t: 'obj_act', req: 1, id: 'chicken:1', verb: 'squeeze', skill: 'animalkinship_1' });
    r.client.emit('msg:obj_ok', { req: 1, id: 'chicken:1', verb: 'squeeze', roll: 0.2, success: true, before: { id: 'chicken:1', lag: 0, hold: 0 }, obj: { id: 'chicken:1', lag: 2500, hold: 2500, sq: 1 } });
    assert.deepEqual(r.calls.at(-1), ['execute', 'squeeze', { roll: 0.2, chunks: undefined, help: null }]);
    assert.equal(r.chicken.state.sharedSqueezes, 1);
    assert.equal(r.chicken.sharedPath.lag, 2500);
  });

  it('an egg and a Batterfly\'s food name the item, and the Guano is the server\'s', () => {
    const r = rig();
    r.client.emit('msg:objs', snap());
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.equal(streetObjectsFeature.runVerbOverride(r.chicken, 'incubate:chicken_egg', r.engine), true);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_act', req: 1, id: 'chicken:1', verb: 'incubate', c: 'chicken_egg', n: 1 });
    assert.equal(streetObjectsFeature.runVerbOverride(r.bat, 'feed:grain:10', r.engine), true);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_act', req: 2, id: 'batterfly:0', verb: 'feed', c: 'grain', n: 10 });
    r.client.emit('msg:obj_ok', { req: 2, id: 'batterfly:0', verb: 'feed', guano: 1, before: { id: 'batterfly:0', food: 5 }, obj: { id: 'batterfly:0', food: 0, lag: 4000, hold: 4000 } });
    assert.equal(r.calls.at(-1)[2].guano, 1);
    assert.equal(r.bat.state.foodCounter, 0);
    // Too many: the pack says no before the server is asked.
    assert.equal(streetObjectsFeature.runVerbOverride(r.bat, 'feed:grain:99', r.engine), null);
  });

  it('the hourly Guano: one pile under each Batterfly, kept by a server that says so', () => {
    // The copy: the server's start and its piles; a server from before says nothing.
    const copy = createStreetCopy();
    assert.equal(guanoPiles(copy), null);
    takeObjs(copy, snap({ guano: 1_731_300_000_000, objs: [{ id: 'batterfly:0', food: 0, guano: 3 }, { id: 'batterfly:1', food: 2 }, { id: 'chicken:1', guano: 9 }] }));
    assert.equal(copy.guano, 1_731_300_000_000);
    assert.deepEqual(guanoPiles(copy), { 'batterfly:0': 3 });
    takeObjs(copy, { t: 'objs', street: 'GSTREET', objs: [{ id: 'batterfly:0', food: 0 }] });
    assert.deepEqual(guanoPiles(copy), {});
    takeObjs(copy, snap({ objs: [{ id: 'batterfly:0', food: 0, guano: 3 }] }));
    assert.equal(guanoPiles(copy), null, 'a server from before the shared pile');
    assert.deepEqual(actMessage({ req: 4, id: 'batterfly:0', verb: 'pickup' }), { req: 4, id: 'batterfly:0', verb: 'pickup' });

    // Solo: this page's own clock.
    const solo = rig({ mode: 'solo' });
    assert.equal(streetObjectsFeature.sharedGuano(solo.engine), false);
    assert.equal(streetObjectsFeature.sharedGuanoPick(solo.bat, solo.engine), null);

    // Online: not known until the street's snapshot comes, then the server's word.
    const r = rig();
    assert.equal(streetObjectsFeature.sharedGuano(r.engine), null, 'no snapshot yet: neither clock moves');
    r.client.emit('msg:objs', snap({ guano: 1_731_300_000_000, spots: { 'batterfly:0': [700, 820] }, objs: [{ id: 'batterfly:0', food: 0, lag: 0, hold: 0, guano: 3 }] }));
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.deepEqual(streetObjectsFeature.sharedGuano(r.engine), { since: 1_731_300_000_000, piles: { 'batterfly:0': 3 }, spots: { 'batterfly:0': [700, 820] } });
    // Pick up asks the server by the Batterfly's id; a second ask waits for the first.
    assert.equal(streetObjectsFeature.sharedGuanoPick(r.bat, r.engine), true);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_act', req: 1, id: 'batterfly:0', verb: 'pickup' });
    assert.equal(streetObjectsFeature.sharedGuanoPick(r.bat, r.engine), true);
    assert.equal(r.sent.filter((m) => m.verb === 'pickup').length, 1);
    // The answer: the pile into the pack once, and the pile is gone here.
    r.client.emit('msg:obj_ok', { req: 1, id: 'batterfly:0', verb: 'pickup', take: 3, before: { id: 'batterfly:0', food: 0, guano: 3 }, obj: { id: 'batterfly:0', food: 0, lag: 0, hold: 0 } });
    assert.deepEqual(r.calls.filter((c) => c[0] === 'guano'), [['guano', 3]]);
    assert.deepEqual(streetObjectsFeature.sharedGuano(r.engine).piles, {});
    assert.equal(r.calls.some((c) => c[0] === 'execute'), false, 'no local verb runs for a pickup');
    // Someone else was first: the server's line, nothing into the pack.
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', now: Date.now(), objs: [{ id: 'batterfly:0', food: 0, lag: 0, hold: 0, guano: 1 }] });
    assert.equal(streetObjectsFeature.sharedGuanoPick(r.bat, r.engine), true);
    r.client.emit('msg:obj_no', { req: 2, id: 'batterfly:0', verb: 'pickup', code: 'gone', message: 'Someone else picked that Guano up first.', obj: { id: 'batterfly:0', food: 0, lag: 0, hold: 0 } });
    assert.deepEqual(r.calls.filter((c) => c[0] === 'guano'), [['guano', 3]]);
    assert.equal(r.engine.toasts.at(-1), 'Someone else picked that Guano up first.');
    // An answer that comes after the player walked on still brings the Guano in (the server credited it).
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', now: Date.now(), objs: [{ id: 'batterfly:0', food: 0, lag: 0, hold: 0, guano: 2 }] });
    assert.equal(streetObjectsFeature.sharedGuanoPick(r.bat, r.engine), true);
    streetObjectsFeature.onStreetClear();
    r.engine.streetTsid = 'GOTHER';
    r.client.emit('msg:obj_ok', { req: 3, id: 'batterfly:0', verb: 'pickup', take: 2, obj: { id: 'batterfly:0', food: 0, lag: 0, hold: 0 } });
    assert.deepEqual(r.calls.filter((c) => c[0] === 'guano'), [['guano', 3], ['guano', 2]]);

    // A server from before the shared pile: the page's own clock, and no pickup is asked of it.
    const old = rig();
    old.client.emit('msg:objs', snap());
    streetObjectsFeature.onTick(16, 0, old.engine);
    assert.equal(streetObjectsFeature.sharedGuano(old.engine), false);
    assert.equal(streetObjectsFeature.sharedGuanoPick(old.bat, old.engine), null);
    assert.equal(old.sent.some((m) => m.verb === 'pickup'), false);
    // A site with no realtime: the page's own clock. A socket still connecting: wait.
    old.client.state = 'off';
    assert.equal(streetObjectsFeature.sharedGuano(old.engine), false);
    old.client.state = 'connecting';
    assert.equal(streetObjectsFeature.sharedGuano(old.engine), null);
  });

  it('someone else\'s verb shows here: the squeeze, the milking, the chew', () => {
    const r = rig();
    r.client.emit('msg:objs', snap());
    streetObjectsFeature.onTick(16, 0, r.engine);
    r.client.emit('msg:obj_ev', { street: 'GSTREET', id: 'chicken:1', ev: 'squeeze', by: 9 });
    r.client.emit('msg:obj_ev', { street: 'GSTREET', id: 'butterfly:0', ev: 'milk', by: 9 });
    r.client.emit('msg:obj_ev', { street: 'GSTREET', id: 'batterfly:0', ev: 'feed', by: 9 });
    r.client.emit('msg:obj_ev', { street: 'GSTREET', id: 'chicken:1', ev: 'squeeze', by: 7 });
    assert.deepEqual(r.calls, [['anim', 'npc_chicken', 'squeeze'], ['anim', 'npc_butterfly', 'milk'], ['chew', 'batterfly:0']]);
  });
});

describe('street animals: the server\'s layout', () => {
  it('asks the planner for the feature groups before the Batterflies, in the game\'s order', () => {
    const before = [];
    for (const f of FEATURES) {
      if (f.id === 'animal-husbandry') break;
      if (typeof f.placementGroups === 'function') before.push(f.id);
    }
    // street-jobs' groups are each player's own projects: left out (the server sends a Batterfly's place).
    assert.deepEqual(before, ['resource-nodes', 'races', 'patches', 'heli-kitties', 'street-furniture', 'street-jobs']);
  });

  it('lays out every street animal as the game spawns it, and matches the server\'s data', { skip: skipWithoutServer }, async () => {
    const data = JSON.parse(readFileSync(serverPath('data/objects.json'), 'utf8'));
    applyStreetIndex(JSON.parse(read('public/assets/streets/index.json')));
    const ecology = JSON.parse(read('public/assets/content/street-ecology.json'));
    setStreetEcologyCatalog(ecology);
    setCreatureEcology(ecology);
    const bats = Object.keys(data.streets).filter((t) => data.streets[t].batterflies).slice(0, 6);
    for (const tsid of [STREET_INDEX.default, ...Object.keys(data.streets).slice(0, 12), ...bats]) {
      const street = await loadStreetDataFromFs(tsid, join(root, 'public/assets/streets'));
      const layout = streetObjectLayout(street, { starter: tsid === STREET_INDEX.default });
      for (const key of ['chickens', 'butterflies', 'batterflies']) {
        assert.deepEqual(layout[key], data.streets[tsid]?.[key] || [], `${tsid} ${key} are stale: node tools/build-realtime-objects.mjs`);
      }
    }
    const total = (key) => Object.values(data.streets).reduce((n, s) => n + (s[key]?.length || 0), 0);
    assert.equal(total('chickens'), 1547);
    assert.equal(total('butterflies'), 1722);
    assert.equal(total('batterflies'), 139);
    assert.ok(creatureRequests);
  });
});
