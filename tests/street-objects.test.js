/**
 * Multiplayer phase 4, shared street objects: js/street-objects.js (ids,
 * fresh state, server state on the local objects, the server copy and its
 * timers), js/features/street-objects-feature.js (ask first, apply on the
 * go-ahead with the server's rolls, refusals, remote changes, solo untouched),
 * the mining.js chunks override, and tools/build-realtime-objects.mjs (the
 * layout the server checks matches game.js and the committed data file).
 * The server side is objects_test.go in groddle-afternoon-server; the data
 * file check skips when that repo is not beside this one (tools/repos.mjs).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  COPY,
  SHARED_NODE_CLASSES,
  actMessage,
  applyNodeState,
  applyRockState,
  applyTreeState,
  applyWoodState,
  createStreetCopy,
  freshTreePlan,
  freshenNode,
  freshenRock,
  freshenTree,
  freshenWood,
  idKind,
  nodePerks,
  reconcile,
  rockPerks,
  rockReady,
  sharedNodeVerb,
  stateFor,
  takeObj,
  takeObjs,
  treeReady,
  treeSkill,
} from '../public/js/street-objects.js?v=g414-1';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=g454-1';
import { FEATURES } from '../public/js/features/index.js?v=registry-348';
import { createMineRock, mineRock } from '../public/js/mining.js?v=g403-1';
import { createResourceNode } from '../public/js/resource-nodes.js?v=g414-1';
import { createTrantState, fruitCapacityAt, setTrantTables } from '../public/js/trants.js?v=trant-harvest-2';
import { placementRequests, ruleTables, streetObjectLayout } from '../tools/build-realtime-objects.mjs';
import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs } from '../public/js/street-loader.js?v=g442-6';
import { setStreetEcologyCatalog } from '../public/js/street-ecology.js';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const trantTables = JSON.parse(read('public/assets/content/trants.json'));
setTrantTables(trantTables);

describe('street objects: the pure rules', () => {
  it('names objects the way the server lays them out', () => {
    assert.equal(idKind('rock:3'), 'rock');
    assert.equal(idKind('node:peat_1:0'), 'node');
    assert.equal(idKind('tree:12'), 'tree');
    assert.equal(idKind('quoin:1'), '');
    // game.js spawnTrees: maturity 10/7 by parity, health 7 + i % 3.
    assert.deepEqual(freshTreePlan(0), { maturity: 10, health: 7 });
    assert.deepEqual(freshTreePlan(5), { maturity: 7, health: 9 });
  });

  it('shares the stock verbs only', () => {
    assert.deepEqual(SHARED_NODE_CLASSES, ['mortar_barnacle', 'ice_knob', 'jellisac', 'dirt_pile', 'peat_1', 'paper_tree']);
    assert.equal(sharedNodeVerb('peat_2', 'harvest'), true);
    assert.equal(sharedNodeVerb('dirt_pile', 'dig'), true);
    assert.equal(sharedNodeVerb('paper_tree', 'pet'), true);
    assert.equal(sharedNodeVerb('npc_firefly', 'open'), false);
    assert.equal(sharedNodeVerb('dust_trap', 'trigger'), false);
  });

  it('tells the server only the perks that change its decision', () => {
    assert.deepEqual(rockPerks('rock_beryl_1', { upgrades: ['mining_expert_beryl', 'mining_high_capacity_rock'], buffs: ['max_luck'] }), ['luck', 'expert', 'whisperer']);
    assert.deepEqual(rockPerks('rock_dullite_1', { upgrades: ['mining_expert_beryl'] }), []);
    assert.deepEqual(nodePerks('paper_tree', 'harvest', { upgrades: ['gardening_harvest_paper'] }), ['paper8']);
    assert.deepEqual(nodePerks('paper_tree', 'pet', { upgrades: ['gardening_harvest_paper'] }), []);
    assert.equal(treeSkill('harvest', ['gardening_1', 'gardening_3']), 'gardening_3');
    assert.equal(treeSkill('harvest', []), 'no_skill');
    assert.equal(treeSkill('water', ['light_green_thumb_2']), 'light_green_thumb_2');
    assert.deepEqual(actMessage({ req: 3, id: 'rock:1', verb: 'mine', perks: ['luck', 'Bad Word'], skill: '' }), { req: 3, id: 'rock:1', verb: 'mine', perks: ['luck'] });
  });

  it('checks the player side before asking (pick, skill, energy; the stock is the server\'s)', () => {
    const rock = createMineRock('rock_beryl_1');
    const ctx = { inv: { pick: 1 }, pc: { energy: 100 }, learned: ['mining_1'] };
    assert.equal(rockReady(rock, ctx), true);
    assert.equal(rockReady(rock, { ...ctx, inv: {} }), false);
    assert.equal(rockReady(rock, { ...ctx, learned: [] }), false);
    assert.equal(rockReady(rock, { ...ctx, pc: { energy: 5 } }), false);
    const tree = createTrantState('trant_fruit', { maturity: 10, health: 7 });
    tree.fruitCount = 0;
    assert.equal(treeReady(tree, 'trant_fruit', 'harvest', { pc: { energy: 50 } }), true, 'an empty local copy still asks');
    tree.harvestsToday = 1;
    assert.equal(treeReady(tree, 'trant_fruit', 'harvest', { pc: { energy: 50 } }), false, 'the player\'s own daily limit is local');
    tree.petted = true;
    assert.equal(treeReady(tree, 'trant_fruit', 'pet', { pc: { energy: 50 } }), true);
    assert.equal(treeReady(tree, 'trant_fruit', 'water', { pc: { energy: 50 }, inv: {} }), false, 'no watering can');
  });

  it('puts server state on the local objects, and fresh back', () => {
    const now = 1_000_000;
    const rock = createMineRock('rock_sparkly_1');
    applyRockState(rock, { id: 'rock:0', chunks: 0, mega: false, in: 30000 }, now);
    assert.equal(rock.depleted, true);
    assert.equal(rock.respawnAt, now + 30000);
    applyRockState(rock, { id: 'rock:0', chunks: 150, mega: true, in: 0 }, now);
    assert.deepEqual([rock.depleted, rock.chunksRemaining, rock.mega, rock.respawnAt], [false, 150, true, 0]);
    freshenRock(rock);
    assert.deepEqual([rock.chunksRemaining, rock.mega], [50, false]);

    const peat = createResourceNode('peat_1');
    applyNodeState(peat, { id: 'node:peat_1:0', units: 1, in: 120000 }, now);
    assert.deepEqual([peat.units, peat.regrowAt], [1, now + 120000]);
    freshenNode(peat);
    assert.deepEqual([peat.units, peat.regrowAt], [4, 0]);
    const paper = createResourceNode('paper_tree');
    applyNodeState(paper, { id: 'node:paper_tree:0', units: 21, petted: true, watered: true, reset: 360000 }, now);
    assert.deepEqual([paper.units, paper.petted, paper.watered, paper.needsResetAt], [21, true, true, now + 360000]);

    const tree = createTrantState('trant_bean', { maturity: 7, health: 8 });
    tree.harvestsToday = 2;
    applyTreeState(tree, { id: 'tree:1', fruit: 10, cap: 98, health: 9, maturity: 7, petted: true, watered: false });
    assert.deepEqual([tree.fruitCount, tree.fruitCapacity, tree.health, tree.petted, tree.harvestsToday], [10, 98, 9, true, 2]);
    freshenTree(tree, 'trant_bean', 1);
    assert.deepEqual([tree.maturity, tree.health, tree.fruitCount, tree.petted], [7, 8, fruitCapacityAt('trant_bean', 7, 8), false]);
    assert.equal(tree.harvestsToday, 2, 'the player\'s own harvests today stay');
  });

  it('keeps one street\'s copy and counts its timers from arrival', () => {
    const copy = createStreetCopy();
    assert.equal(takeObjs(copy, { street: 'A', objs: [{ id: 'rock:1', chunks: 3 }] }), null, 'changes before the snapshot are dropped');
    assert.deepEqual(takeObjs(copy, { street: 'A', snap: true, objs: [{ id: 'node:peat_1:0', units: 2, in: 60000 }] }, 1000), ['node:peat_1:0']);
    assert.equal(takeObjs(copy, { street: 'B', objs: [{ id: 'rock:1' }] }), null, 'another street');
    assert.equal(stateFor(copy, 'node:peat_1:0', 31000).in, 30000);
    assert.equal(stateFor(copy, 'rock:9', 31000), null);
    assert.equal(takeObj(copy, { id: 'rock:9', chunks: 5 }, 31000), true);
    const rock = createMineRock('rock_metal_1');
    assert.equal(reconcile({ id: 'rock:9', kind: 'rock', rock }, copy, 31000), true);
    assert.equal(rock.chunksRemaining, 5);
    const rock2 = createMineRock('rock_metal_1', { chunksRemaining: 2 });
    reconcile({ id: 'rock:2', kind: 'rock', rock: rock2 }, copy, 31000);
    assert.equal(rock2.chunksRemaining, 50, 'anything the server does not list is fresh');
  });
});

describe('street objects: mining takes the server\'s roll', () => {
  it('mineRock gives opts.chunks, plus the player\'s own Mining Expert bonus', () => {
    const rock = createMineRock('rock_beryl_1');
    const inv = { pick: 1 };
    const r = mineRock(rock, inv, { energy: 100 }, { learned: ['mining_1'], chunks: 8, rng: () => 0 });
    assert.equal(r.got, 8);
    assert.equal(rock.chunksRemaining, 42);
    const r2 = mineRock(rock, { pick: 1 }, { energy: 100, imaginationUpgrades: ['mining_expert_beryl'] }, { learned: ['mining_1'], chunks: 8, rng: () => 0 });
    assert.equal(r2.got, 9, 'round(15% of 8) = 1 more');
    const r3 = mineRock(createMineRock('rock_beryl_1'), { pick: 1 }, { energy: 100 }, { learned: ['mining_1'], rng: () => 0 });
    assert.equal(r3.got, 4, 'no override: the local roll, as in solo');
  });

  it('game.js and content.js pass the grant through', () => {
    const game = read('public/game.js');
    assert.match(game, /features\.query\('sharedVerbGrant', target, verbId, engine\)/);
    assert.match(game, /sharedChunks: sharedGrant\?\.chunks/);
    assert.match(game, /GAME_MODE !== 'multiplayer' && Number\.isFinite\(opts\.spawnX\)/);
    assert.match(game, /rockIndex: index,/);
    assert.match(game, /treeIndex: i,/);
    assert.match(read('public/content.js'), /chunks: ctx\.sharedChunks/);
  });
});

/** A fake engine with one rock, one tree and one peat bog, and a fake realtime client. */
function rig({ mode = 'multiplayer' } = {}) {
  const sent = [];
  const listeners = new Map();
  const client = {
    state: 'online',
    wanted: 'GSTREET',
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
  const rock = createMineRock('rock_dullite_1');
  const tree = createTrantState('trant_fruit', { maturity: 10, health: 7 });
  const peat = createResourceNode('peat_1');
  const rockT = { classId: 'rock_dullite_1', label: 'Dullite Rock', state: { rock }, rockIndex: 1 };
  const treeT = { classId: 'trant_fruit', label: 'Fruit Tree', state: tree, treeIndex: 0 };
  const peatT = { classId: 'peat_1', featureId: 'resource-nodes', resourceKey: 'peat_1:0' };
  const calls = [];
  const engine = {
    mode,
    started: true,
    streetTsid: 'GSTREET',
    inv: { pick: 1, shovel: 1 },
    pc: { energy: 200, imaginationUpgrades: [] },
    learnedSkills: ['mining_1'],
    toolState: null,
    interactables: [rockT, treeT],
    data: {},
    toasts: [],
    activeBuffIds: () => [],
    setData(k, v) { this.data[k] = String(v); },
    toast(line) { this.toasts.push(line); },
    pushActivity() {},
    playSound() {},
    refreshRock(t) { calls.push(['refreshRock', t.classId]); },
    say() {},
    query(hook) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'streetResourceNodes') {
        return [{ key: 'peat_1:0', classTsid: 'peat_1', node: peat, target: peatT, refresh: () => calls.push(['refreshNode']), ready: () => true }];
      }
      return null;
    },
    executeVerb(target, verbId, opts) {
      // What game.js does: overrides first, then the local rules with the grant.
      assert.equal(streetObjectsFeature.runVerbOverride(target, verbId, engine), null, 'the granted run goes through');
      const grant = streetObjectsFeature.sharedVerbGrant(target, verbId);
      calls.push(['execute', verbId, opts?.animated === true, grant]);
      if (target === rockT) mineRock(rock, engine.inv, engine.pc, { learned: ['mining_1'], chunks: grant?.chunks });
      if (target === peatT) peat.units -= 1;
    },
  };
  streetObjectsFeature._reset();
  streetObjectsFeature.onTick(16, 0, engine);
  client.emit('roster', { street: 'GSTREET', players: [] });
  return { engine, client, sent, calls, rock, tree, peat, rockT, treeT, peatT };
}

describe('street objects: the feature', () => {
  it('does nothing in solo', () => {
    const r = rig({ mode: 'solo' });
    assert.equal(streetObjectsFeature.runVerbOverride(r.rockT, 'mine', r.engine), null);
    assert.equal(r.sent.length, 0);
    assert.equal(streetObjectsFeature._state().bound, false);
  });

  it('is registered just before the realtime feature', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.equal(ids.indexOf('street-objects') + 1, ids.indexOf('realtime'));
    assert.match(read('public/js/features/index.js'), /street-objects-feature\.js\?v=g454-1/);
  });

  it('asks for the street on joining, and waits for it', () => {
    const r = rig();
    assert.deepEqual(r.sent, [{ t: 'obj_sync' }]);
    assert.equal(streetObjectsFeature.runVerbOverride(r.rockT, 'mine', r.engine), true);
    assert.deepEqual(r.engine.toasts, [COPY.connecting]);
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [{ id: 'rock:1', chunks: 9, mega: false, in: 0 }] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.equal(r.rock.chunksRemaining, 9, 'the snapshot lands on the rock');
    assert.equal(r.tree.fruitCount, fruitCapacityAt('trant_fruit', 10, 7), 'an unlisted tree is fresh');
    assert.equal(r.peat.units, 4);
    assert.equal(r.engine.data.streetObjects, 'GSTREET:snap');
  });

  it('mines on the go-ahead with the server\'s chunks, then takes its word', () => {
    const r = rig();
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.equal(streetObjectsFeature.runVerbOverride(r.rockT, 'mine', r.engine), true, 'swallowed until the server answers');
    const act = r.sent.at(-1);
    assert.deepEqual(act, { t: 'obj_act', req: 1, id: 'rock:1', verb: 'mine' });
    assert.equal(streetObjectsFeature.runVerbOverride(r.rockT, 'mine', r.engine), true);
    assert.deepEqual(r.engine.toasts, [COPY.busy], 'one request per object at a time');
    r.client.emit('msg:obj_ok', { t: 'obj_ok', req: 1, id: 'rock:1', verb: 'mine', before: { id: 'rock:1', chunks: 12, mega: false, in: 0 }, obj: { id: 'rock:1', chunks: 5, mega: false, in: 0 }, chunks: 7 });
    const exec = r.calls.find((c) => c[0] === 'execute');
    assert.deepEqual(exec, ['execute', 'mine', true, { roll: undefined, chunks: 7, help: null }]);
    assert.equal(r.rock.chunksRemaining, 5);
    assert.equal(r.engine.inv.dullite, 7, 'the reward the server rolled');
    assert.equal(streetObjectsFeature.sharedVerbGrant(r.rockT, 'mine'), null, 'the grant is spent');
  });

  it('shows a refusal and the object as the server has it', () => {
    const r = rig();
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    streetObjectsFeature.runVerbOverride(r.peatT, 'harvest', r.engine);
    assert.equal(r.sent.at(-1).id, 'node:peat_1:0');
    r.client.emit('msg:obj_no', { t: 'obj_no', req: 1, id: 'node:peat_1:0', verb: 'harvest', code: 'not_ready', message: 'No more peat here!', obj: { id: 'node:peat_1:0', units: 0, in: 200000 } });
    assert.deepEqual(r.engine.toasts, ['No more peat here!']);
    assert.equal(r.peat.units, 0);
    assert.equal(r.calls.some((c) => c[0] === 'execute'), false, 'nothing is given');
    assert.equal(r.engine.data.streetObjectsLast, 'node:peat_1:0:harvest:not_ready');
  });

  it('a tree tending carries the server\'s roll; others\' changes redraw', () => {
    const r = rig();
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    r.engine.inv.watering_can = 1;
    streetObjectsFeature.runVerbOverride(r.treeT, 'pet', r.engine);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_act', req: 1, id: 'tree:0', verb: 'pet', skill: 'no_skill' });
    const before = { id: 'tree:0', fruit: 50, cap: 98, health: 7, maturity: 10, petted: false, watered: false };
    r.client.emit('msg:obj_ok', { t: 'obj_ok', req: 1, id: 'tree:0', verb: 'pet', before, obj: { ...before, petted: true }, roll: 0.25, success: true });
    assert.deepEqual(r.calls.find((c) => c[0] === 'execute')[3], { roll: 0.25, chunks: undefined, help: null });
    assert.equal(r.tree.petted, true);
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', objs: [{ ...before, fruit: 20, petted: true, watered: true, health: 8 }] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.deepEqual([r.tree.fruitCount, r.tree.watered, r.tree.health], [20, true, 8]);
    assert.match(r.treeT.subtitle, /20 Cherries/);
  });

  it('G361 / G335: a Fertilidust jar asks the server first; its go-ahead runs the verb, then the grown trees land', () => {
    const r = rig();
    const granted = [];
    const query = r.engine.query;
    r.engine.query = (hook, ...args) => (hook === 'powderUseGranted' ? (granted.push(args.slice(0, 2)), true) : query(hook, ...args));
    assert.equal(streetObjectsFeature.sharedFertilize([r.treeT], false, r.engine), null, 'not before the snapshot');
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.equal(streetObjectsFeature.sharedFertilize([r.rockT], false, r.engine), null, 'no street tree, nothing to tell');
    const patchTree = { ...r.treeT, grownFromBean: true };
    assert.equal(streetObjectsFeature.sharedFertilize([patchTree], true, r.engine), null, 'a tree in your own Patch stays local');
    assert.equal(streetObjectsFeature.sharedFertilize([r.treeT, patchTree], false, r.engine, 'fertilidust'), true);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_dust', req: 1 });
    // One jar at a time: a second while the first is asked waits.
    assert.equal(streetObjectsFeature.sharedFertilize([r.treeT], true, r.engine), true);
    assert.equal(r.sent.length, 2, 'not sent');
    assert.match(r.engine.toasts.at(-1), /still asking/);
    // The ledger used a charge: the verb runs here with its word.
    const use = { op: 'use-00000000000000a1', c: 'fertilidust', left: 4, spent: false };
    r.client.emit('msg:obj_dust_used', { t: 'obj_dust_used', req: 1, c: 'fertilidust', use });
    assert.deepEqual(granted, [['fertilidust', use]]);
    assert.equal(r.engine.data.streetObjectsLast, 'dust:used:4');
    r.client.emit('msg:obj_dust_used', { t: 'obj_dust_used', req: 1, c: 'fertilidust', use });
    assert.equal(granted.length, 1, 'once');
    // The Lite names its tree; a refusal shows the ledger's words and runs nothing.
    assert.equal(streetObjectsFeature.sharedFertilize([r.treeT], true, r.engine), true);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_dust', req: 2, id: 'tree:0' }, 'the Lite names its tree');
    r.client.emit('msg:obj_no', { t: 'obj_no', req: 2, id: 'tree:0', verb: 'dust', code: 'no_item', message: "You don't have enough of that item." });
    assert.equal(r.engine.toasts.at(-1), "You don't have enough of that item.");
    assert.equal(granted.length, 1);
    // Without a ledger on the server the go-ahead carries no use (the jar is this page's own word).
    streetObjectsFeature.sharedFertilize([r.treeT], false, r.engine, 'fertilidust');
    r.client.emit('msg:obj_dust_used', { t: 'obj_dust_used', req: 3, c: 'fertilidust' });
    assert.deepEqual(granted.at(-1), ['fertilidust', null]);
    r.client.emit('msg:obj_dusted', { t: 'obj_dusted', req: 3, ids: ['tree:0'] });
    assert.equal(r.engine.data.streetObjectsLast, 'dust:ok:1');
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', objs: [{ id: 'tree:0', fruit: 90, cap: 90, health: 10, maturity: 10, petted: false, watered: false }] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.deepEqual([r.tree.fruitCount, r.tree.health], [90, 10]);
    assert.equal(streetObjectsFeature.sharedFertilize([r.treeT], false, rig({ mode: 'solo' }).engine), null, 'solo is local');
  });

  it('G335: a pour\'s grant carries the ledger\'s use of the bottle', () => {
    const r = rig();
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.equal(streetObjectsFeature.sharedObjectVerb(r.treeT, 'treepoison:poison', r.engine), true);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_act', req: 1, id: 'tree:0', verb: 'poison' });
    const use = { op: 'use-00000000000000b2', c: 'potion_tree_poison', left: 0, spent: true };
    r.client.emit('msg:obj_ok', { t: 'obj_ok', req: 1, id: 'tree:0', verb: 'poison', obj: { id: 'tree:0', fruit: 98, cap: 98, health: 7, maturity: 10, poison: 180000, by: 1 }, poison: 180000, use });
    const exec = r.calls.find((c) => c[0] === 'execute' && c[1] === 'treepoison:poison');
    assert.deepEqual(exec[3].use, use);
  });

  it('G361 / G335: powders-feature asks sharedFertilize as the jar is used, and the dust lands on its own', () => {
    const src = read('public/js/features/powders-feature.js');
    assert.match(src, /return engine\.query\?\.\('sharedFertilize', targets, lite, engine, classTsid\) === true;/);
    assert.match(src, /if \(out\.ok && askDust\(engine, classTsid, trees, false\)\) return 'asked';/);
    assert.match(src, /if \(out\.ok && askDust\(engine, classTsid, \[out\.tree\.target\], true\)\) return 'asked';/);
    assert.doesNotMatch(src.slice(src.indexOf('function fertilize(')), /^[^\n]*sharedFertilize/m, 'fertilize no longer tells the server');
  });

  it('times out a request the server never answers', () => {
    const r = rig();
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [] });
    streetObjectsFeature.runVerbOverride(r.rockT, 'mine', r.engine);
    const realNow = Date.now;
    Date.now = () => realNow() + 7000;
    try {
      streetObjectsFeature.onTick(16, 0, r.engine);
    } finally {
      Date.now = realNow;
    }
    assert.deepEqual(r.engine.toasts, [COPY.timeout]);
    assert.equal(streetObjectsFeature._state().pending, 0);
  });

  it('leaves local verbs and local-only sites alone', () => {
    const r = rig();
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [] });
    assert.equal(streetObjectsFeature.runVerbOverride(r.rockT, 'talk_to', r.engine), null);
    r.engine.inv = {};
    assert.equal(streetObjectsFeature.runVerbOverride(r.rockT, 'mine', r.engine), null, 'no pick: the local refusal');
    r.client.state = 'off';
    r.engine.inv = { pick: 1 };
    assert.equal(streetObjectsFeature.runVerbOverride(r.rockT, 'mine', r.engine), null, 'no realtime on the site');
    const s = rig();
    s.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, none: true, objs: [] });
    assert.equal(streetObjectsFeature.runVerbOverride(s.rockT, 'mine', s.engine), null, 'a street the server does not share');
    const old = rig();
    old.client.emit('error', { code: 'bad_frame', message: 'That message kind is not one the server knows.' });
    assert.equal(streetObjectsFeature.runVerbOverride(old.rockT, 'mine', old.engine), null, 'a server without the objects module');
    old.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [] });
    assert.equal(streetObjectsFeature.runVerbOverride(old.rockT, 'mine', old.engine), true, 'its real snapshot takes over');
    const h = rig();
    h.client.wanted = '';
    assert.equal(streetObjectsFeature.runVerbOverride(h.rockT, 'mine', h.engine), null, 'a private place');
  });
});

describe('street objects: the server\'s layout', () => {
  it('lists game.js enterStreet\'s planner groups in order', () => {
    const game = read('public/game.js');
    const call = game.slice(game.indexOf('currentStreetPlacement = planStreetPlacements('));
    const keys = [...call.slice(0, call.indexOf("features.collect('placementGroups'")).matchAll(/\{ key: '([a-zA-Z]+)'/g)].map((m) => m[1]);
    const pop = { treeClasses: [], rockClasses: [], resourceNodeClasses: [] };
    assert.deepEqual(placementRequests(pop).map((r) => r.key), keys);
    // resource-nodes-feature is the first feature to add groups (quest-flags and hell add none).
    const features = FEATURES.map((f) => f.id);
    const firstWithGroups = FEATURES.find((f) => typeof f.placementGroups === 'function');
    assert.equal(firstWithGroups.id, 'resource-nodes');
    assert.ok(features.indexOf('resource-nodes') < 5);
  });

  it('matches the data file the server embeds', { skip: skipWithoutServer }, async () => {
    const data = JSON.parse(readFileSync(serverPath('data/objects.json'), 'utf8'));
    assert.deepEqual(data.rules, JSON.parse(JSON.stringify(ruleTables(trantTables))), 'rules are stale: node tools/build-realtime-objects.mjs');
    const index = JSON.parse(read('public/assets/streets/index.json'));
    applyStreetIndex(index);
    setStreetEcologyCatalog(JSON.parse(read('public/assets/content/street-ecology.json')));
    for (const tsid of [STREET_INDEX.default, ...Object.keys(data.streets).slice(0, 25)]) {
      const street = await loadStreetDataFromFs(tsid, join(root, 'public/assets/streets'));
      const layout = streetObjectLayout(street, { starter: tsid === STREET_INDEX.default });
      const want = data.streets[tsid] || {};
      for (const key of ['rocks', 'trees', 'nodes']) {
        assert.deepEqual(layout[key], want[key] || [], `${tsid} ${key} are stale: node tools/build-realtime-objects.mjs`);
      }
    }
  });
});

describe('street objects: Wood Trees', () => {
  it('take the shared maturity and harvest count, and keep the player\'s own daily limit', () => {
    const state = { maturity: 6, harvestCount: 0, harvestedToday: true, totalHarvests: 3 };
    applyWoodState(state, { id: 'tree:7', maturity: 4, count: 1 });
    assert.deepEqual(state, { maturity: 4, harvestCount: 1, harvestedToday: true, totalHarvests: 3 });
    applyWoodState(state, { id: 'tree:7', maturity: 99, count: -3 });
    assert.equal(state.maturity, 6);
    assert.equal(state.harvestCount, 0);
    freshenWood(state);
    assert.equal(state.maturity, 6);
    assert.equal(state.harvestedToday, true, 'fresh on the server is not a new day for you');
  });

  it('reconcile treats wood as its own kind', () => {
    const copy = createStreetCopy();
    takeObjs(copy, { street: 'GA1', snap: true, objs: [{ id: 'tree:7', maturity: 2, count: 0 }] });
    const obj = { id: 'tree:7', kind: 'wood', state: { maturity: 6, harvestCount: 1 } };
    assert.equal(reconcile(obj, copy), true);
    assert.deepEqual(obj.state, { maturity: 2, harvestCount: 0 });
  });

  it('the server data carries the Wood Trees the game lays out', { skip: skipWithoutServer }, () => {
    const data = JSON.parse(readFileSync(serverPath('data', 'objects.json'), 'utf8'));
    const woods = Object.values(data.streets).flatMap((s) => (s.trees || []).filter((r) => r[1] === 'wood_tree'));
    assert.ok(woods.length > 100, `${woods.length} wood trees`);
    assert.ok(woods.every((r) => r[4] === 6 && r[5] === 0), 'fresh at maturity 6');
    assert.match(read('public/js/features/street-objects-feature.js'), /t\.classId === 'wood_tree' && !t\.grownFromBean/);
  });
});

