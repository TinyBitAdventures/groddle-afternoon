/**
 * G334 / G329, the shared street world between real players: a street tree's
 * Tree Poison and death (features/tree-death-feature.js multiplayer branch),
 * a street Piggy's mood, hunger and ticks (js/street-objects.js applyPigState,
 * features/animal-mood-feature.js), and digging a Dirt Pile together
 * (js/help-dig.js, features/help-mine-feature.js, resource-nodes-feature's
 * grant), with It Takes Two moved into the multiplayer quests. The server
 * side is objects_world_test.go in groddle-afternoon-server. Solo is checked
 * to stay as it was.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  POUR_VERBS,
  actMessage,
  applyPigState,
  applyTreeState,
  applyWoodState,
  createStreetCopy,
  digSkill,
  freshenTree,
  idKind,
  pigSkill,
  reconcile,
  stateFor,
  streetPigIndex,
  takeObjs,
} from '../public/js/street-objects.js?v=g414-1';
import { HELP_DIG_COUNTER, HELP_DIG_LABEL, digHelpFrom, helpDigMessage, othersDigging } from '../public/js/help-dig.js?v=g329-dig-1';
import { MULTIPLAYER_QUESTS, MULTIPLAYER_QUESTS_LEFT_OUT, creditedMultiplayerQuests, offerableMultiplayerQuest } from '../public/js/quests-mp.js?v=g358-1';
import { createResourceNode, harvestResourceNode } from '../public/js/resource-nodes.js?v=g414-1';
import { isPoisoned, TREE_ANTIDOTE, TREE_POISON, BOTANY_SKILL } from '../public/js/tree-poison.js';
import { treeDeathFeature } from '../public/js/features/tree-death-feature.js?v=g414-1';
import { patchesFeature } from '../public/js/features/patches-feature.js?v=g414-1';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=g414-1';
import { helpMineFeature } from '../public/js/features/help-mine-feature.js?v=g403-1';
import { animalMoodFeature } from '../public/js/features/animal-mood-feature.js?v=g430-1';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('street objects: poison, death and Piggies on the wire', () => {
  it('names a street Piggy by its spawn index, never a released one', () => {
    assert.equal(streetPigIndex({ classId: 'npc_piggy', animalKey: 'GST:npc_piggy:3' }, 'GST'), 3);
    assert.equal(streetPigIndex({ classId: 'npc_piggy', animalKey: 'GOTHER:npc_piggy:3' }, 'GST'), -1);
    assert.equal(streetPigIndex({ classId: 'npc_piggy', animalKey: 'GST:npc_piggy:3', husbandryAnimal: true }, 'GST'), -1);
    assert.equal(streetPigIndex({ classId: 'npc_chicken', animalKey: 'GST:npc_chicken:0' }, 'GST'), -1);
    assert.equal(idKind('pig:2'), 'pig');
  });

  it('pours are the server words poison and antidote; eat carries the tree', () => {
    assert.deepEqual(POUR_VERBS, { 'treepoison:poison': 'poison', 'treepoison:antidote': 'antidote' });
    assert.deepEqual(actMessage({ req: 4, id: 'pig:1', verb: 'eat', on: 'tree:7' }), { req: 4, id: 'pig:1', verb: 'eat', on: 'tree:7' });
    assert.deepEqual(actMessage({ req: 4, id: 'pig:1', verb: 'eat', on: 'rock:1' }), { req: 4, id: 'pig:1', verb: 'eat' });
  });

  it('a poisoned tree reads poisonEndsAt from the server, a cure clears it, death marks it', () => {
    const now = 1_000_000;
    const st = { classTsid: 'trant_fruit' };
    const base = { id: 'tree:0', fruit: 10, cap: 70, health: 7, maturity: 10, petted: false, watered: false };
    applyTreeState(st, { ...base, poison: 90_000, by: 7 }, now);
    assert.equal(st.poisonEndsAt, now + 90_000);
    assert.equal(st.poisonBy, 7);
    assert.ok(isPoisoned(st));
    applyTreeState(st, base, now + 1000);
    assert.equal(isPoisoned(st), false, 'anyone\'s antidote cures it here too');
    applyTreeState(st, { ...base, fruit: 0, dead: true, by: 7 }, now);
    assert.deepEqual([st.sharedDead, st.sharedDeadBy], [true, 7]);
    freshenTree(st, 'trant_fruit', 0);
    assert.equal(st.sharedDead, undefined, 'a fresh tree is neither poisoned nor dead');
    const wood = {};
    applyWoodState(wood, { id: 'tree:7', maturity: 6, count: 0, poison: 5000, by: 2 }, now);
    assert.equal(wood.poisonEndsAt, now + 5000);
  });

  it('the poison clock counts down from when it arrived', () => {
    const copy = createStreetCopy();
    takeObjs(copy, { street: 'G1', snap: true, objs: [{ id: 'tree:0', fruit: 1, cap: 9, poison: 10_000 }] }, 1000);
    assert.equal(stateFor(copy, 'tree:0', 4000).poison, 7000);
  });

  it('a street Piggy takes the server\'s mood, hunger, flags and clock; its own counters stay', () => {
    const st = { mood: 2, hunger: 0, petUsesToday: 1, nibbleUsesToday: 1 };
    applyPigState(st, { id: 'pig:0', mood: 0, hunger: 10, petted: true, daily: false, croak: true, in: 60_000 }, 5000);
    assert.deepEqual(
      [st.mood, st.hunger, st.hasBeenPetted, st.isDaily, st.croaking, st.hungerAt, st.petUsesToday, st.nibbleUsesToday],
      [0, 10, 1, 0, true, 65_000, 1, 1],
    );
    const copy = createStreetCopy();
    takeObjs(copy, { street: 'G1', snap: true, objs: [] });
    const pig = { id: 'pig:0', kind: 'pig', state: { mood: 1, hunger: 4 } };
    assert.equal(reconcile(pig, copy), false, 'a Piggy the server does not list keeps the local rules');
    assert.equal(pig.state.hunger, 4);
  });

  it('the rank words the server reads its rolls by', () => {
    assert.equal(pigSkill([]), 'no_skill');
    assert.equal(pigSkill(['animalkinship_1', 'animalkinship_2']), 'animalkinship_2');
    assert.equal(digSkill([]), 'no_skill');
    assert.equal(digSkill(['soil_appreciation_1', 'soil_appreciation_2']), 'soil_appreciation_2');
  });
});

// ---------------------------------------------------------------------------
// Help digging
// ---------------------------------------------------------------------------

describe('help digging (G329)', () => {
  it('reads the server\'s help and words the bonus as dirt_pile.js does', () => {
    assert.equal(digHelpFrom(null), null);
    assert.equal(digHelpFrom({ n: 0, items: 0 }), null);
    assert.deepEqual(digHelpFrom({ n: 3, items: 2, class: 'loam', loam: true, by: ['Bo', 'Cy', 'Di'] }), { n: 3, items: 2, classTsid: 'loam', loam: true, by: ['Bo', 'Cy', 'Di'] });
    assert.equal(helpDigMessage(1, 'earth', ['Bo']), 'You got 1 additional Lump of Earth thanks to the help you got from Bo.');
    assert.equal(helpDigMessage(2, 'loam', ['Bo', 'Cy']), 'You got 2 additional Lumps of Loam thanks to the help you got from Bo, and Cy.');
    assert.deepEqual(othersDigging([3, 7, 9], 7), [3, 9]);
    assert.equal(HELP_DIG_COUNTER, 'helped_dig');
    assert.equal(HELP_DIG_LABEL, 'Help dig');
  });

  it('a dig with the crew\'s Loam yields Loam; solo and no grant dig Earth as before', () => {
    const ctx = { verbId: 'dig', skills: ['soil_appreciation_2'], upgrades: [], now: 1, rng: () => 0.9 };
    const solo = harvestResourceNode(createResourceNode('dirt_pile'), { shovel: 1 }, { energy: 100 }, ctx);
    assert.deepEqual(solo.outputs, [{ classTsid: 'earth', qty: 3 }]);
    const helped = harvestResourceNode(createResourceNode('dirt_pile'), { shovel: 1 }, { energy: 100 }, { ...ctx, loamBonus: true });
    assert.deepEqual(helped.outputs, [{ classTsid: 'loam', qty: 3 }]);
  });

  it('It Takes Two is a multiplayer quest now, offered by Soil Appreciation II, credited once', () => {
    assert.equal(MULTIPLAYER_QUESTS.soilappreciation_help_digging.offer, 'source');
    assert.equal('soilappreciation_help_digging' in MULTIPLAYER_QUESTS_LEFT_OUT, false);
    assert.ok(offerableMultiplayerQuest('soilappreciation_help_digging', { multiplayer: true }));
    assert.equal(offerableMultiplayerQuest('soilappreciation_help_digging', { multiplayer: false }), null);
    assert.ok(creditedMultiplayerQuests().includes('soilappreciation_help_digging'));
  });

  function digEngine({ mode = 'multiplayer', diggers = [], help = null } = {}) {
    const sent = [];
    const pile = { classId: 'dirt_pile', featureId: 'resource-nodes', resourceKey: 'dirt_pile:0', sprite: { x: 400, y: 900 } };
    const engine = {
      mode,
      inv: {},
      data: {},
      activity: [],
      counters: [],
      setData(k, v) { this.data[k] = String(v); },
      pushActivity(m) { this.activity.push(m); },
      floatText() {},
      refreshPack() {},
      achievement(c, n) { this.counters.push([c, n]); },
      query(hook, ...args) {
        if (hook === 'realtimeClient') return { me: { id: 7 } };
        if (hook === 'sharedDiggers') return diggers;
        if (hook === 'sharedDigSwing') { sent.push(args[1]); return true; }
        if (hook === 'sharedVerbGrant') return help ? { help } : null;
        return null;
      },
    };
    return { engine, pile, sent };
  }

  it('the dig reads Help dig while someone else digs, and the crew hears it start and stop', () => {
    const { engine, pile, sent } = digEngine({ diggers: [3] });
    assert.equal(helpMineFeature.sharedVerbLabel(pile, 'dig', engine), 'Help dig');
    assert.equal(helpMineFeature.sharedVerbLabel(pile, 'dig', digEngine({ diggers: [7] }).engine), null, 'only you: Dig');
    helpMineFeature.verbStarted(pile, { id: 'dig' }, engine);
    helpMineFeature.verbCancelled(pile, 'dig', engine);
    assert.deepEqual(sent, ['start', 'stop']);
  });

  it('a helped dig gets the server\'s bonus, its line, and counts for It Takes Two', () => {
    const { engine, pile } = digEngine({ help: { n: 2, items: 1, class: 'earth', loam: false, by: ['Bo', 'Cy'] } });
    helpMineFeature.resourceNodeUsed(pile, { ok: true, verbId: 'dig' }, engine);
    assert.equal(engine.inv.earth, 1);
    assert.deepEqual(engine.activity, ['You got 1 additional Lump of Earth thanks to the help you got from Bo, and Cy.']);
    assert.deepEqual(engine.counters, [['helped_dig', 1]]);
    const alone = digEngine();
    helpMineFeature.resourceNodeUsed(pile, { ok: true, verbId: 'dig' }, alone.engine);
    assert.deepEqual([alone.engine.inv, alone.engine.counters], [{}, []]);
  });

  it('solo: no crew, no label, nothing counted', () => {
    const { engine, pile, sent } = digEngine({ mode: 'solo', diggers: [3], help: { n: 1, items: 1, class: 'earth', by: ['Bo'] } });
    assert.equal(helpMineFeature.sharedVerbLabel(pile, 'dig', engine), null);
    helpMineFeature.verbStarted(pile, { id: 'dig' }, engine);
    helpMineFeature.resourceNodeUsed(pile, { ok: true, verbId: 'dig' }, engine);
    assert.deepEqual([sent, engine.counters, engine.inv], [[], [], {}]);
  });
});

// ---------------------------------------------------------------------------
// Tree death between real players
// ---------------------------------------------------------------------------

function tree(classId, x, i) {
  return { classId, label: classId, treeIndex: i, state: { classTsid: classId, maturity: 7, health: 8 }, sprite: { x, y: 902, height: 200 } };
}

function treeEngine({ trees, mode = 'multiplayer', me = 7, asked = null } = {}) {
  const world = { trees: trees.map((t) => ({ classId: t.classId, state: t.state })) };
  const slots = {};
  const calls = { drops: [], asks: [], adopted: [] };
  const engine = {
    mode,
    interactables: [...trees],
    inv: { [TREE_POISON]: 1, [TREE_ANTIDOTE]: 1 },
    pc: { mood: 100, energy: 100, energyMax: 100 },
    learnedSkills: [BOTANY_SKILL],
    player: { x: trees[0].sprite.x - 100, y: trees[0].sprite.y },
    streetTsid: 'GTEST',
    streetWorld: () => world,
    streetSlot: (id) => (slots[id] ||= {}),
    activeBuffIds: () => [],
    buffRow: () => null,
    applyBuff: () => ({ ok: true }),
    removeBuff: () => ({ ok: true }),
    homeContext: () => ({ inHome: false }),
    unregister: (t) => { engine.interactables = engine.interactables.filter((x) => x !== t); },
    param: () => null,
    setData: () => {},
    pushActivity: () => {},
    toast: () => {},
    floatText: () => {},
    achievement: () => {},
    refreshPack: () => {},
    save: () => {},
    dropWorldStack: (...args) => calls.drops.push(args),
    say: () => {},
    metabolicGate: () => ({ ok: true }),
    query(hook, ...args) {
      if (hook === 'realtimeClient') return mode === 'multiplayer' ? { me: { id: me } } : null;
      if (hook === 'sharedVerbGrant') return asked?.granted ? { roll: undefined } : null;
      if (hook === 'sharedObjectVerb') { calls.asks.push(args[1]); return asked ? true : null; }
      return null;
    },
  };
  return { engine, slots, calls };
}

describe('tree death between real players (G334)', () => {
  const realAdopt = patchesFeature.adoptPlot;
  let adopted;
  beforeEach(() => {
    treeDeathFeature._reset();
    adopted = [];
    patchesFeature.adoptPlot = (engine, row) => { adopted.push(row); return row; };
  });

  it('a pour on a street tree asks the server first, and lands on its go-ahead', () => {
    const t = tree('trant_bean', 500, 0);
    const asked = { granted: false };
    const { engine, calls } = treeEngine({ trees: [t], asked });
    assert.equal(treeDeathFeature._completePour(engine, 'poison', t), true);
    assert.deepEqual(calls.asks, ['treepoison:poison']);
    assert.equal(isPoisoned(t.state), false, 'nothing lands before the server says');
    assert.equal(engine.pc.mood, 100, 'and nothing is spent');
    asked.granted = true;
    assert.equal(treeDeathFeature._completePour(engine, 'poison', t), true);
    assert.ok(isPoisoned(t.state));
    assert.equal(engine.pc.mood, 90, 'the pourer\'s own mood cost, as in solo');
    patchesFeature.adoptPlot = realAdopt;
  });

  it('a shared tree never dies on this page\'s clock, only on the server\'s word', () => {
    const t = tree('trant_bean', 500, 0);
    const { engine, slots } = treeEngine({ trees: [t] });
    t.state.poisonedAt = 1;
    t.state.poisonEndsAt = 2;
    treeDeathFeature.onTick(16, Date.now(), engine);
    assert.ok(engine.interactables.includes(t), 'still standing past its local deadline');
    assert.equal(treeDeathFeature.sharedTreeDied(t, { by: 0 }, engine), true);
    assert.ok(!engine.interactables.includes(t));
    assert.deepEqual(adopted.map((r) => [r.key, r.soilClass]), [['tree:0', 'trant_bean_dead']]);
    assert.equal(slots['tree-death'].replaced[0].classId, 'trant_bean');
    patchesFeature.adoptPlot = realAdopt;
  });

  it('a dead Wood Tree\'s Planks fall for its poisoner only', () => {
    const mine = treeEngine({ trees: [tree('wood_tree', 900, 0)], me: 7 });
    treeDeathFeature.sharedTreeDied(mine.engine.interactables[0], { by: 7 }, mine.engine);
    assert.deepEqual(mine.calls.drops.map((d) => d.slice(0, 2)), [['plank', 25]]);
    const theirs = treeEngine({ trees: [tree('wood_tree', 900, 0)], me: 8 });
    treeDeathFeature.sharedTreeDied(theirs.engine.interactables[0], { by: 7 }, theirs.engine);
    assert.deepEqual(theirs.calls.drops, []);
    patchesFeature.adoptPlot = realAdopt;
  });

  it('solo is as it was: the pour lands at once and the tree dies on its own clock', () => {
    const t = tree('trant_bean', 500, 0);
    const { engine, calls } = treeEngine({ trees: [t], mode: 'solo' });
    assert.equal(treeDeathFeature._completePour(engine, 'poison', t), true);
    assert.deepEqual(calls.asks, []);
    assert.ok(isPoisoned(t.state));
    assert.equal(treeDeathFeature.sharedTreeDied(t, { by: 0 }, engine), null);
    treeDeathFeature.onTick(16, t.state.poisonEndsAt + 10, engine);
    assert.ok(!engine.interactables.includes(t));
    patchesFeature.adoptPlot = realAdopt;
  });
});

// ---------------------------------------------------------------------------
// The street-objects feature: pours, Piggies and the tick events
// ---------------------------------------------------------------------------

function rig() {
  const listeners = new Map();
  const sent = [];
  const client = {
    state: 'online',
    wanted: 'GSTREET',
    street: 'GSTREET',
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
  const pigT = { classId: 'npc_piggy', label: 'Piggy', animalKey: 'GSTREET:npc_piggy:1', state: { mood: 1, hunger: 0 }, sprite: { x: 300, y: 900 } };
  const treeT = { classId: 'trant_fruit', label: 'Fruit Tree', treeIndex: 0, state: { classTsid: 'trant_fruit', maturity: 10, health: 7, fruitCount: 20, fruitCapacity: 70 }, sprite: { x: 500, y: 900 } };
  const events = [];
  const died = [];
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'GSTREET',
    inv: { potato: 3, cherry: 2 },
    pc: { energy: 200, imaginationUpgrades: [] },
    learnedSkills: [],
    interactables: [pigT, treeT],
    data: {},
    toasts: [],
    activeBuffIds: () => [],
    setData(k, v) { this.data[k] = String(v); },
    toast(line) { this.toasts.push(line); },
    pushActivity() {},
    playSound() {},
    say() {},
    query(hook, ...args) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'streetResourceNodes') return [];
      if (hook === 'sharedAnimalEvent') { events.push([args[0], args[1]]); return true; }
      if (hook === 'sharedTreeDied') { died.push([args[0], args[1]]); return true; }
      return null;
    },
    executeVerb() {},
  };
  streetObjectsFeature._reset();
  streetObjectsFeature.onTick(16, 0, engine);
  client.emit('roster', { street: 'GSTREET', players: [] });
  client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [{ id: 'pig:1', mood: 2, hunger: 3, petted: true, daily: true, croak: false, in: 1000 }] });
  streetObjectsFeature.onTick(16, 0, engine);
  return { engine, client, sent, pigT, treeT, events, died };
}

describe('street objects feature: Piggies and pours (G334)', () => {
  it('a snapshot lands on the street Piggy, and it is the server\'s now', () => {
    const r = rig();
    assert.deepEqual([r.pigT.state.mood, r.pigT.state.hunger, r.pigT.state.hasBeenPetted], [2, 3, 1]);
    assert.equal(streetObjectsFeature.sharedPiggy(r.pigT, r.engine), true);
    assert.equal(streetObjectsFeature.sharedPiggy({ ...r.pigT, husbandryAnimal: true }, r.engine), null);
  });

  it('pet, nibble and feed ask the server with the words it reads', () => {
    const r = rig();
    assert.equal(streetObjectsFeature.runVerbOverride(r.pigT, 'pet', r.engine), true);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_act', req: 1, id: 'pig:1', verb: 'pet', skill: 'no_skill' });
    r.client.emit('msg:obj_no', { t: 'obj_no', req: 1, id: 'pig:1', verb: 'pet', code: 'sad', message: 'x' });
    streetObjectsFeature.runVerbOverride(r.pigT, 'feed:potato:2', r.engine);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_act', req: 2, id: 'pig:1', verb: 'feed', perks: ['sate'] });
    r.client.emit('msg:obj_ok', { t: 'obj_ok', req: 2, id: 'pig:1', verb: 'feed', obj: { id: 'pig:1', mood: 2, hunger: 0, petted: true, daily: true, croak: false, in: 900 } });
    assert.equal(r.pigT.state.hunger, 0);
  });

  it('a pour asks as poison; a death the server announces reaches tree-death', () => {
    const r = rig();
    assert.equal(streetObjectsFeature.sharedObjectVerb(r.treeT, 'treepoison:poison', r.engine), true);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_act', req: 1, id: 'tree:0', verb: 'poison' });
    assert.equal(streetObjectsFeature.sharedTree(r.treeT, r.engine), true);
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', objs: [{ id: 'tree:0', fruit: 0, cap: 70, health: 7, maturity: 10, petted: false, watered: false, dead: true, by: 9 }] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.deepEqual(r.died.map(([t, info]) => [t.classId, info.by]), [['trant_fruit', 9]]);
  });

  it('the server\'s tick events reach the animal-mood feature; a Piggy eating tells the server', () => {
    const r = rig();
    r.client.emit('msg:obj_ev', { t: 'obj_ev', street: 'GSTREET', id: 'pig:1', ev: 'ate', on: 'tree:0' });
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0][0], r.pigT);
    assert.deepEqual([r.events[0][1].ev, r.events[0][1].on], ['ate', r.treeT]);
    assert.equal(streetObjectsFeature.sharedPiggyAte(r.pigT, r.treeT, r.engine), true);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_act', req: 1, id: 'pig:1', verb: 'eat', on: 'tree:0' });
    r.client.emit('msg:obj_ok', { t: 'obj_ok', req: 1, id: 'pig:1', verb: 'eat', obj: { id: 'pig:1', mood: 2, hunger: 0, petted: true, daily: true, croak: false, in: 900 } });
    assert.deepEqual(r.engine.toasts, []);
    assert.equal(r.pigT.state.hunger, 0);
  });

  it('solo: nothing is shared', () => {
    const r = rig();
    r.engine.mode = 'solo';
    assert.equal(streetObjectsFeature.runVerbOverride(r.pigT, 'pet', r.engine), null);
    assert.equal(streetObjectsFeature.sharedPiggy(r.pigT, r.engine), null);
    assert.equal(streetObjectsFeature.sharedTree(r.treeT, r.engine), null);
  });
});

describe('animal mood: a shared Piggy\'s tick events (G334)', () => {
  it('says the happy line and walks to the tree it ate from', () => {
    const said = [];
    const pig = { classId: 'npc_piggy', animalKey: 'G1:npc_piggy:0', state: { mood: 1, hunger: 0 }, sprite: { x: 100, y: 900, scale: { x: 1 }, range: 90, vx: 0.4 } };
    const treeT = { classId: 'trant_fruit', state: { fruitCount: 3 }, sprite: { x: 300, y: 900 } };
    const engine = {
      mode: 'multiplayer',
      say: (t, text) => said.push(text),
      setData() {},
      interactables: [pig, treeT],
      param: () => null,
      query: () => null,
    };
    assert.equal(animalMoodFeature.sharedAnimalEvent(pig, { ev: 'happy' }, engine), true);
    assert.deepEqual(said, ['Other animals make me happy!']);
    animalMoodFeature.sharedAnimalEvent(pig, { ev: 'ate', on: treeT }, engine);
    assert.match(animalMoodFeature._state().lastEvent, /^shared:ate$/);
    assert.equal(animalMoodFeature.sharedAnimalEvent({ classId: 'npc_chicken', sprite: {} }, { ev: 'happy' }, engine), null);
  });
});
