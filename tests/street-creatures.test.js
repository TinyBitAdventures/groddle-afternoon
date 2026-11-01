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
  creatureOf,
  easeToward,
  flyerAt,
  pathFrom,
  pathTime,
  restAt,
  sharedCreatureLabel,
  walkerAt,
} from '../public/js/street-creatures.js?v=04437144';
import { createStreetCopy, idKind, reconcile, takeObjs } from '../public/js/street-objects.js?v=dc3084ad';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=c2f5d278';
import { FEATURES } from '../public/js/features/index.js?v=f5076396';
import { GAME_EPOCH_MS } from '../public/js/game-day.js?v=edb00566';
import { creatureRequests, setCreatureEcology, streetObjectLayout } from '../tools/build-realtime-objects.mjs';
import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs } from '../public/js/street-loader.js?v=390e4702';
import { setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=cfa10e0b';
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
    const held = pathFrom({ lag: 3000, hold: 2500 }, local);
    assert.deepEqual(held, { lag: 3000, holdEnd: local + 2500 });
    const at = pathTime(held, local, offset);
    assert.equal(pathTime(held, local + 2000, offset), at, 'still while held');
    assert.equal(pathTime(held, local + 3500, offset), at + 1000, 'then on again');
    // Two clients whose clocks differ see the same place: each has its own offset to the server.
    const server = 2_000_000_000_000;
    const a = pathTime({ lag: 0, holdEnd: 0 }, server - 7000, 7000);
    const b = pathTime({ lag: 0, holdEnd: 0 }, server + 3000, -3000);
    assert.equal(a, b);
  });

  it('a sprite eases to its path, and jumps when it is far off', () => {
    assert.ok(Math.abs(easeToward(0, 10, 1) - 1.2) < 1e-9);
    assert.equal(easeToward(0, SNAP_PX + 1, 1), SNAP_PX + 1);
    assert.equal(easeToward(5, 5.1, 1), 5.1);
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
    assert.deepEqual(target.sharedPath, { lag: 2500, holdEnd: 2000 });
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
