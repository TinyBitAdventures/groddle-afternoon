/**
 * Street Piggies' walks to food, the same for everyone online (slice 1 of
 * research/plans/street-animals-shared.md): the server (groddle-afternoon-server objects_pigs.go
 * startTrip) sends a trip in a Piggy's state, on its shared path's clock, and every page draws it
 * (js/street-creatures.js piggyAt). The server knows where a Piggy is from the same walk the game
 * draws (pigpath.go ports piggyPlan), so the two must agree to the last digit.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PIGGY_TRIP,
  chickenSeed,
  pathFrom,
  pathTime,
  piggyAt,
  piggyPlan,
  piggyTripAt,
  piggyWalkAt,
  tripBaseTime,
  tripFrom,
} from '../public/js/street-creatures.js?v=909163e7';
import { EAT_PAUSE_MS } from '../public/js/animal-mood.js?v=a49495fc';
import { ANIMAL_BODY, TREE_FOOTPRINT, setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=08076876';
import { GAME_EPOCH_MS } from '../public/js/game-day.js?v=edb00566';
import { createStreetCopy, takeObjs, reconcile } from '../public/js/street-objects.js?v=3f2d8a2c';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=ddc43409';
import { setCreatureEcology, streetObjectLayout } from '../tools/build-realtime-objects.mjs';
import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs } from '../public/js/street-loader.js?v=18b181ad';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const home = { baseX: 1200, range: 90, speed: 27, dir: 1, trunks: [], trunkPx: 120 };
const SEED = chickenSeed(2, 1200);

describe('a Piggy\'s trip', () => {
  it('reads the server\'s trip onto the path\'s clock, and refuses a malformed one', () => {
    const c0 = GAME_EPOCH_MS + 5e11;
    assert.deepEqual(tripFrom({ x0: 1200, x1: 1500, c0, leg: 7143, eat: 3000 }), { x0: 1200, x1: 1500, c0: 5e11, leg: 7143, eat: 3000, ms: 17286 });
    assert.equal(tripFrom(null), null);
    assert.equal(tripFrom({ x0: 'a', x1: 1, c0, leg: 1, eat: 1 }), null);
    assert.equal(tripFrom({ x0: 1, x1: 1, c0: 0, leg: 1, eat: 1 }), null);
    // pathFrom carries it with the lag and the hold.
    const path = pathFrom({ lag: 100, hold: 0, trip: { x0: 1200, x1: 1500, c0, leg: 7143, eat: 3000 } }, 1000, 0, 1000);
    assert.equal(path.trip.c0, 5e11);
    assert.equal(pathFrom({ lag: 0, hold: 0 }, 1000).trip, undefined);
  });

  it('walks there, stands at the food, walks back, and its path takes it on from where it left it', () => {
    const t0 = 5e11 + 12345;
    const start = piggyWalkAt(home, t0, SEED);
    const trip = tripFrom({ x0: start.x, x1: start.x + 300, c0: t0 + GAME_EPOCH_MS, leg: Math.round((300 / PIGGY_TRIP.speed) * 1000), eat: EAT_PAUSE_MS });
    // Before it sets off it is on its walk.
    assert.equal(piggyTripAt(trip, t0 - 1), null);
    assert.deepEqual(piggyAt(home, t0 - 1000, SEED, trip), { ...piggyWalkAt(home, t0 - 1000, SEED), phase: '' });
    // Off it goes from where its walk had it, toward the food, at 42 px/s.
    assert.equal(piggyAt(home, t0, SEED, trip).x, start.x);
    const mid = piggyAt(home, t0 + trip.leg / 2, SEED, trip);
    assert.deepEqual([Math.round(mid.x), mid.dir, mid.pose, mid.phase], [Math.round(start.x + 150), 1, 'walk', 'go']);
    // At the food: it stands for the source's 3 s (onFoodPathing 1531).
    const eat = piggyAt(home, t0 + trip.leg + 10, SEED, trip);
    assert.deepEqual([eat.x, eat.pose, eat.phase], [start.x + 300, 'eat', 'eat']);
    // Home again, facing back.
    const back = piggyAt(home, t0 + trip.leg + trip.eat + trip.leg / 2, SEED, trip);
    assert.deepEqual([Math.round(back.x), back.dir, back.phase], [Math.round(start.x + 150), -1, 'home']);
    // Its walk stood still meanwhile, and goes on from there: no jump when it is back.
    assert.equal(tripBaseTime(trip, t0 + 5000), t0);
    assert.equal(tripBaseTime(trip, t0 + trip.ms + 700), t0 + 700);
    const end = piggyAt(home, t0 + trip.ms - 1, SEED, trip);
    const after = piggyAt(home, t0 + trip.ms, SEED, trip);
    assert.ok(Math.abs(end.x - after.x) < 1, `${end.x} then ${after.x}`);
    assert.equal(after.phase, '');
  });

  it('stops where the server says, the game\'s own numbers (beside a tree\'s foot, a body apart)', () => {
    assert.equal(PIGGY_TRIP.treeStop, TREE_FOOTPRINT / 2 + ANIMAL_BODY.piggies / 2);
    assert.equal(PIGGY_TRIP.gap, ANIMAL_BODY.piggies + 8);
    assert.equal(PIGGY_TRIP.eatMs, EAT_PAUSE_MS);
    // npc_piggy.js onCreate 1442: npc_walk_speed randInt(30, 55), the middle.
    assert.equal(PIGGY_TRIP.speed, 42);
  });
});

describe('a Piggy\'s walk on the server', () => {
  it('pigpath.go holds the game\'s own values for piggyWalkAt (the server puts a Piggy where every page does)', { skip: skipWithoutServer }, () => {
    const src = readFileSync(serverPath('pigpath_test.go'), 'utf8');
    const homes = [
      { baseX: 1234.5, range: 90, speed: 27, dir: 1, trunks: [1300, 900], trunkPx: 120 },
      { baseX: 402.3, range: 61, speed: 27, dir: -1, trunks: [], trunkPx: 120 },
      { baseX: 2999.9, range: 90, speed: 27, dir: -1, trunks: [3050.2], trunkPx: 120 },
    ];
    const rows = [...src.matchAll(/\{(\d), (\d+), ([\d.e+]+), ([\d.]+), (-?1), "(\w+)", ([\d.]+)\}/g)];
    assert.ok(rows.length >= 15, `the table in pigpath_test.go: ${rows.length} rows`);
    for (const [, h, seed, t, x, dir, pose, ms] of rows) {
      const hm = homes[Number(h)];
      assert.equal(chickenSeed(Number(h) + 3, hm.baseX), Number(seed));
      assert.equal(piggyPlan(hm, Number(seed)).ms, Number(ms));
      const p = piggyWalkAt(hm, Number(t), Number(seed));
      assert.deepEqual([p.x, p.dir, p.pose], [Number(x), Number(dir), pose], `home ${h} at ${t}`);
    }
  });

  it('data/objects.json gives each Piggy its walk and the street its trunks, and the trip rules', { skip: skipWithoutServer }, async () => {
    const data = JSON.parse(readFileSync(serverPath('data/objects.json'), 'utf8'));
    assert.deepEqual(data.rules.pigtrip, { ...PIGGY_TRIP });
    applyStreetIndex(JSON.parse(read('public/assets/streets/index.json')));
    const ecology = JSON.parse(read('public/assets/content/street-ecology.json'));
    setStreetEcologyCatalog(ecology);
    setCreatureEcology(ecology);
    const withPigs = Object.keys(data.streets).filter((t) => data.streets[t].pigs).slice(0, 8);
    for (const tsid of [STREET_INDEX.default, ...withPigs]) {
      const street = await loadStreetDataFromFs(tsid, join(root, 'public/assets/streets'));
      const layout = streetObjectLayout(street, { starter: tsid === STREET_INDEX.default });
      assert.deepEqual(layout.pigs, data.streets[tsid]?.pigs || [], `${tsid}: node tools/build-realtime-objects.mjs`);
      assert.deepEqual(layout.trunks, data.streets[tsid]?.trunks || [], `${tsid} trunks`);
      for (const p of layout.pigs) assert.ok(p.length === 4 && p[3] >= 0 && p[3] <= 90, `${tsid} pig ${p}`);
    }
  });
});

// A street with one Piggy, on a server that walks Piggies to food.
function rig() {
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
  const poses = [];
  const sprite = { x: 1000, y: 800, baseX: 1000, range: 90, vx: 0.45, baseScale: 1, scale: { x: 1, y: 1 }, destroyed: false };
  const pig = { classId: 'npc_piggy', label: 'Piggy', classIndex: 2, animalKey: 'GSTREET:npc_piggy:2', state: { mood: 1, hunger: 3 }, sprite };
  const tree = { classId: 'trant_fruit', treeIndex: 1, state: { fruitCount: 5 }, sprite: { x: 1500, y: 800 } };
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'GSTREET',
    worldW: 3000,
    interactables: [pig],
    data: {},
    placement(key) {
      // This page's own plan puts the Piggy 40 px off the server's: the server's numbers win.
      if (key === 'piggies') return [{}, {}, { x: 1040, y: 798, room: 400 }];
      if (key === 'trees') return [{ x: 1500 }];
      return [];
    },
    setData(k, v) { this.data[k] = String(v); },
    toast() {},
    pushActivity() {},
    query(hook, t, pose) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'piggyPathPose') { poses.push(pose); return true; }
      return null;
    },
  };
  streetObjectsFeature._reset();
  streetObjectsFeature.onTick(16, 0, engine);
  client.emit('roster', { street: 'GSTREET', players: [] });
  return { engine, client, sent, pig, tree, poses };
}

describe('a Piggy\'s trip: the feature', () => {
  it('walks the Piggy from the server\'s home, and on the trip the server sends', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
    const r = rig();
    const now = Date.now();
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, creatures: true, pigpaths: true, pigtrips: true, animals: [], homes: { 'pig:2': [1000, 90] }, trunks: [1500], now, objs: [{ id: 'pig:2', mood: 1, hunger: 3, lag: 0, hold: 0, in: 1000 }] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.equal(typeof r.pig.sprite._path, 'function');
    assert.equal(streetObjectsFeature.sharedPiggyTrips(r.pig, r.engine), true);
    const homeNow = { baseX: 1000, range: 90, speed: 27, dir: 1, trunks: [1500], trunkPx: 120 };
    const tp = now - GAME_EPOCH_MS;
    assert.equal(r.pig.sprite._pathPoint().x, piggyWalkAt(homeNow, tp, chickenSeed(2, 1000)).x, 'the server\'s home, not this page\'s plan');
    // A worked tree is sent to the server once; the Piggy is not walked here.
    assert.equal(streetObjectsFeature.sharedPiggyFood(r.tree, r.engine), true);
    assert.deepEqual(r.sent.filter((m) => m.verb === 'food').map((m) => m.id), ['tree:1']);
    // The server's trip: from where its walk had it to beside the tree.
    const x0 = piggyWalkAt(homeNow, tp, chickenSeed(2, 1000)).x;
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', now, objs: [{ id: 'pig:2', mood: 1, hunger: 3, lag: 0, hold: 0, in: 1000, trip: { x0, x1: 1380, c0: now, leg: 9000, eat: 3000 } }] });
    streetObjectsFeature.onTick(300, 0, r.engine);
    t.mock.timers.tick(4500);
    const p = r.pig.sprite._pathPoint();
    assert.equal(p.phase, 'go');
    assert.ok(Math.abs(p.x - (x0 + (1380 - x0) / 2)) < 1, `halfway: ${p.x}`);
    r.pig.sprite._path(1);
    assert.equal(r.poses.at(-1), 'walk');
    t.mock.timers.tick(5000);
    r.pig.sprite._path(1);
    assert.equal(r.pig.sprite._pathPoint().x, 1380);
    assert.equal(r.poses.at(-1), 'eat');
  });

  it('an older server (no trips): nothing is sent, the page walks its Piggies as before', () => {
    const r = rig();
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, creatures: true, pigpaths: true, animals: [], now: Date.now(), objs: [{ id: 'pig:2', mood: 1, hunger: 3, lag: 0, hold: 0 }] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.equal(streetObjectsFeature.sharedPiggyTrips(r.pig, r.engine), null);
    assert.equal(streetObjectsFeature.sharedPiggyFood(r.tree, r.engine), null);
    assert.equal(r.sent.filter((m) => m.verb === 'food').length, 0);
  });

  it('reconcile takes the trip from the server\'s state, on the path\'s clock', () => {
    const copy = createStreetCopy();
    const now = 1_800_000_000_000;
    takeObjs(copy, { street: 'S', snap: true, pigpaths: true, pigtrips: true, homes: { 'pig:0': [500, 60] }, trunks: [], now, objs: [{ id: 'pig:0', mood: 1, hunger: 2, lag: 0, hold: 0, trip: { x0: 500, x1: 700, c0: now, leg: 4762, eat: 3000 } }] }, now);
    assert.equal(copy.pigTrips, true);
    assert.deepEqual(copy.homes, { 'pig:0': [500, 60] });
    const target = { classId: 'npc_piggy', state: {} };
    reconcile({ id: 'pig:0', kind: 'pig', target, state: target.state }, copy, now);
    assert.equal(target.sharedPath.trip.x1, 700);
    assert.equal(pathTime(target.sharedPath, now, 0), now - GAME_EPOCH_MS);
  });
});

describe('a Piggy\'s trip: animal mood', () => {
  it('a worked tree goes to the server once; the server\'s "ate" is the chew and "Yum!", never a walk of this page\'s own', async () => {
    const { animalMoodFeature } = await import('../public/js/features/animal-mood-feature.js?v=8025a944');
    const said = [];
    const asked = [];
    const pig = { classId: 'npc_piggy', animalKey: 'G1:npc_piggy:0', state: { mood: 1, hunger: 4 }, sprite: { x: 100, y: 900, scale: { x: 1 }, range: 90, vx: 0.4, visible: true, destroyed: false } };
    const treeT = { classId: 'trant_fruit', treeIndex: 0, state: { fruitCount: 3 }, sprite: { x: 300, y: 900, destroyed: false } };
    const engine = {
      mode: 'multiplayer',
      streetTsid: 'G1',
      player: { x: 280 },
      say: (t, text) => said.push(text),
      setData() {},
      interactables: [pig, treeT],
      param: () => null,
      query: (hook, a) => {
        if (hook === 'sharedPiggy' || hook === 'sharedPiggyTrips') return true;
        if (hook === 'sharedPiggyFood') { asked.push(a); return true; }
        return null;
      },
    };
    animalMoodFeature.onEvent('trant_fruit:harvest', 1, engine);
    assert.deepEqual(asked, [treeT], 'the tree is sent once');
    animalMoodFeature.sharedAnimalEvent(pig, { ev: 'ate', on: treeT }, engine);
    assert.deepEqual(said, ['Yum!']);
    assert.equal(pig.sprite.range, 90, 'not held for a walk of its own');
    assert.equal(animalMoodFeature._state().lastEvent, 'shared:ate');
    // Nobody hungry: nothing is sent.
    pig.state.hunger = 0;
    animalMoodFeature.onEvent('trant_fruit:water', 1, engine);
    assert.equal(asked.length, 1);
  });
});
