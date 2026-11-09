/**
 * Piggies between players: a street Piggy's name is everyone's online, as the
 * source's user_name on the one npc_piggy item (items/include/animal_naming.js
 * canName 3-22, onInputBoxResponse 38-62; npc_piggy.js verbs.name 750-784,
 * rename 786-816). The realtime server decides it (groddle-afternoon-server
 * objects_pigs.go namePig, objects_pigs_name_test.go); js/street-objects.js
 * applyPigState carries it into the Piggy's state, street-objects-feature asks
 * and shows it, animal-husbandry-feature's name modal goes through it. Solo
 * and released or raised Piggies keep the page's own naming.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { actMessage, applyPigState, createStreetCopy, stateFor, takeObjs } from '../public/js/street-objects.js?fresh=piggy-names';
import { canNameAnimal, namedAnimalLabel, namingVerbs } from '../public/js/animal-husbandry.js?fresh=piggy-names';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?fresh=piggy-names';

const PIG = { id: 'pig:1', mood: 1, hunger: 0, petted: false, daily: true, croak: false, in: 1000 };

describe('a street Piggy\'s name from the server', () => {
  it('takes the name, who gave it and when, in the shape the naming rules read', () => {
    const st = {};
    applyPigState(st, { ...PIG, name: 'Truffle', namer: 7, named: 60_000 }, 1_000_000, { me: 7 });
    assert.deepEqual([st.userName, st.namer, st.namedOn], ['Truffle', 'player', 940]);
    applyPigState(st, { ...PIG, name: 'Truffle', namer: 9, named: 60_000 }, 1_000_000, { me: 7 });
    assert.equal(st.namer, 'p9', 'someone else\'s name');
    assert.equal(namedAnimalLabel('npc_piggy', st), 'A Piggy Named Truffle');
  });

  it('no name from the server is no name here, even one this page gave before', () => {
    const st = { userName: 'Old', namer: 'player', namedOn: 5 };
    applyPigState(st, PIG, 1000, { me: 7 });
    assert.equal(st.userName, undefined);
    assert.equal(namedAnimalLabel('npc_piggy', st), 'Piggy');
  });

  it('the hour before someone else may rename it counts from the server\'s naming', () => {
    const nowS = 10_000;
    const learned = ['animalkinship_5'];
    const st = {};
    applyPigState(st, { ...PIG, name: 'Truffle', namer: 9, named: 30 * 60_000 }, nowS * 1000, { me: 7 });
    assert.equal(canNameAnimal(st, { learned, playerId: 'player', nowS }), false, 'someone else named it half an hour ago');
    assert.deepEqual(namingVerbs('npc_piggy', st, { learned, playerId: 'player', nowS }), []);
    applyPigState(st, { ...PIG, name: 'Truffle', namer: 7, named: 30 * 60_000 }, nowS * 1000, { me: 7 });
    assert.equal(canNameAnimal(st, { learned, playerId: 'player', nowS }), true, 'the namer may');
    applyPigState(st, { ...PIG, name: 'Truffle', namer: 9, named: 61 * 60_000 }, nowS * 1000, { me: 7 });
    assert.equal(canNameAnimal(st, { learned, playerId: 'player', nowS }), true, 'anyone, an hour on');
  });

  it('the name\'s age grows between frames', () => {
    const copy = createStreetCopy();
    takeObjs(copy, { street: 'G1', snap: true, objs: [{ ...PIG, name: 'Truffle', namer: 9, named: 1000 }] }, 1000);
    assert.equal(stateFor(copy, 'pig:1', 6000).named, 6000);
  });

  it('a name goes to the server cut and cleaned as the source does (onInputBoxResponse 41)', () => {
    assert.deepEqual(actMessage({ req: 3, id: 'pig:1', verb: 'name', perks: ['ak5'], name: 'Wil-bur! the 2nd, of the Grand Mile' }),
      { req: 3, id: 'pig:1', verb: 'name', perks: ['ak5'], name: 'Wilbur the 2nd of the Grand M' });
    assert.equal(actMessage({ req: 1, id: 'pig:1', verb: 'pet', name: 'x' }).name, undefined);
  });
});

function rig({ learned = ['animalkinship_5'] } = {}) {
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
  const said = [];
  const landed = [];
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'GSTREET',
    inv: {},
    pc: { energy: 200, imaginationUpgrades: [] },
    learnedSkills: learned,
    interactables: [pigT],
    data: {},
    toasts: [],
    activeBuffIds: () => [],
    setData(k, v) { this.data[k] = String(v); },
    toast(line) { this.toasts.push(line); },
    pushActivity() {},
    playSound() {},
    say(t, text) { said.push([t, text]); },
    query(hook, ...args) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'streetResourceNodes') return [];
      if (hook === 'sharedNameLanded') { landed.push([args[0], args[1]]); return true; }
      return null;
    },
    executeVerb() { throw new Error('a name replays no verb'); },
  };
  streetObjectsFeature._reset();
  streetObjectsFeature.onTick(16, 0, engine);
  client.emit('roster', { street: 'GSTREET', players: [] });
  client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [PIG] });
  streetObjectsFeature.onTick(16, 0, engine);
  return { engine, client, sent, pigT, said, landed };
}

describe('street objects feature: naming a street Piggy', () => {
  it('asks the server with Animal Kinship V, and the go-ahead lands for the namer', () => {
    const r = rig();
    assert.equal(streetObjectsFeature.sharedAnimalName(r.pigT, 'Wilbur', r.engine), true);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_act', req: 1, id: 'pig:1', verb: 'name', perks: ['ak5'], name: 'Wilbur' });
    assert.equal(streetObjectsFeature.sharedAnimalName(r.pigT, 'Babe', r.engine), true, 'one ask at a time');
    assert.equal(r.sent.length, 2, 'obj_sync and the one name');
    r.client.emit('msg:obj_ok', { t: 'obj_ok', req: 1, id: 'pig:1', verb: 'name', name: 'Wilbur', obj: { ...PIG, name: 'Wilbur', namer: 7, named: 0 } });
    assert.equal(r.pigT.state.userName, 'Wilbur');
    assert.equal(r.pigT.label, 'A Piggy Named Wilbur');
    assert.deepEqual(r.landed, [[r.pigT, 'Wilbur']]);
  });

  it('a refusal shows the server\'s line; "unchanged" says nothing', () => {
    const r = rig();
    streetObjectsFeature.sharedAnimalName(r.pigT, 'Babe', r.engine);
    r.client.emit('msg:obj_no', { t: 'obj_no', req: 1, id: 'pig:1', verb: 'name', code: 'named', message: 'Someone named this Piggy less than an hour ago.' });
    streetObjectsFeature.sharedAnimalName(r.pigT, 'Babe', r.engine);
    r.client.emit('msg:obj_no', { t: 'obj_no', req: 2, id: 'pig:1', verb: 'name', code: 'unchanged', message: '' });
    assert.deepEqual(r.engine.toasts, ['Someone named this Piggy less than an hour ago.']);
    assert.deepEqual(r.landed, []);
  });

  it('someone else\'s naming: the bubble, then the name in the state for this player too', () => {
    const r = rig();
    r.client.emit('msg:obj_ev', { t: 'obj_ev', street: 'GSTREET', id: 'pig:1', ev: 'name', name: 'Truffle', by: 9 });
    assert.deepEqual(r.said.map(([, text]) => text), ['And they shall call me "Truffle"']);
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', objs: [{ ...PIG, name: 'Truffle', namer: 9, named: 100 }] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.equal(r.pigT.label, 'A Piggy Named Truffle');
    assert.equal(r.pigT.state.namer, 'p9');
    assert.match(r.engine.data.streetObjectsView, /pig:1=m1h0~Truffle/);
  });

  it('local: solo, a released or raised Piggy, no Animal Kinship V perk without the skill', () => {
    const r = rig({ learned: [] });
    streetObjectsFeature.sharedAnimalName(r.pigT, 'Wilbur', r.engine);
    assert.equal(r.sent.at(-1).perks, undefined, 'the server refuses it with its own line');
    assert.equal(streetObjectsFeature.sharedAnimalName({ ...r.pigT, animalKey: undefined, husbandryAnimal: true }, 'X', r.engine), null);
    r.engine.mode = 'solo';
    assert.equal(streetObjectsFeature.sharedAnimalName(r.pigT, 'Wilbur', r.engine), null);
  });
});
