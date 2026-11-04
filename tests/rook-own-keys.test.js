// Ticket 12 (live v0.7.0, online, Hechey Track): "after a rook attack I revive a butterfly, then all the
// other butterflies on the street say 'you have helped revive this one'".
// In the source each rooked thing keeps its own healers (items/include/rook.js rookAttack 69-70
// `this.rook_healers = {}`, startRevive 118, playerIsHealer 268-274; npc_butterfly.js revive conditions
// 166-172). The remake keyed rooked things by the order a scan first met them in, so a Butterfly that
// had left the crowded street and came back, or one of your own animals among the street's, moved
// every later key along: on that visit a dose (kept by the server until three players revive it)
// showed on another Butterfly, and two players' "npc_butterfly:1" were different Butterflies.
// Now a key is the animal's own: its class and the index the street spawned it with (rookKeyFor).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rookKeyFor } from '../public/js/rook-attack.js?v=03e79296';
import { syncKeys } from '../public/js/rook-mp.js?v=d906f86e';

/** A copy of the feature of its own (its realtime binding is module state, one per player). */
const featureCopy = async (name) => (await import(`../public/js/features/rook-attack-feature.js?fresh=rook-own-keys-${name}`)).rookAttackFeature;

const TSID = 'GLI2V0UN7RD1T2J'; // Hechey Track, where the ticket came from
const ME = 500;

function sprite(x) {
  return { x, y: 800, visible: true, destroyed: false, scale: { x: 1, set() {} }, textures: [{}], gotoAndPlay() {}, play() {} };
}

/** The street's four Butterflies as game.js spawnButterflies registers them (two resting, two flying). */
function streetButterflies() {
  return [0, 1, 2, 3].map((i) => ({
    classId: 'npc_butterfly',
    label: 'Butterfly',
    airborne: i >= 2,
    sprite: sprite(400 + i * 500),
    state: {},
    animalKey: `${TSID}:npc_butterfly:${i}`,
    classIndex: i,
    name: `butterfly ${i}`,
  }));
}

function onlineEngine(interactables, sent) {
  const handlers = {};
  const client = {
    me: { id: ME },
    state: 'online',
    street: TSID,
    players: [],
    on: (k, fn) => { (handlers[k] ||= []).push(fn); },
    send: (k, p) => { sent.push([k, p]); return true; },
  };
  const engine = {
    started: true,
    mode: 'multiplayer',
    street: { tsid: TSID, hubId: '56', hubName: 'Groddle Forest' },
    streetTsid: TSID,
    interactables,
    player: { x: 400, y: 800 },
    pc: { energy: 500, mood: 500 },
    inv: {},
    camera: { x: 0, y: 0, w: 1280 },
    platforms: [],
    inScene: () => false,
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    busy: () => false,
    acting: () => false,
    param: () => null,
    setData: () => {},
    say: () => {},
    save: () => {},
    toast: () => {},
    pushActivity: () => {},
    playSound: () => {},
    updateHud: () => {},
    refreshPack: () => {},
    achievement: () => {},
    floatText: () => {},
    streetSlot: () => ({}),
    query: (k) => (k === 'realtimeClient' ? client : null),
    learnedSkills: [],
  };
  const fire = (k, m) => (handlers[k] || []).forEach((f) => f(m));
  return { engine, fire };
}

/** Ticks until the feature has scanned the street (and sent rook_sync). */
let clock = 50_000;
/** One more tick of the game clock (it only runs forward). */
function tick(rookAttackFeature, engine) {
  clock += 500;
  rookAttackFeature.onTick(500, clock, engine);
}

function enter(rookAttackFeature, engine) {
  rookAttackFeature.onStreetClear(engine);
  for (let i = 0; i < 8; i += 1) tick(rookAttackFeature, engine);
}

const dosedLabel = (rookAttackFeature, engine, target) => {
  const verbs = rookAttackFeature.verbOverride(target, engine);
  const revive = verbs?.find((v) => v.id === 'rook_revive');
  return revive ? (revive.enabled ? 'can revive' : revive.reason) : 'not rooked';
};

describe('ticket 12: a rooked animal keeps its own key and its own healers', () => {
  it('every rookable street spawn carries its own index, flying Butterflies after the resting ones', () => {
    const b = streetButterflies();
    assert.deepEqual(b.map(rookKeyFor), ['npc_butterfly:0', 'npc_butterfly:1', 'npc_butterfly:2', 'npc_butterfly:3']);
    // Your own animals are keyed by their id and never reach the shared server.
    const own = { classId: 'npc_butterfly', husbandryAnimal: 'a7', sprite: sprite(10) };
    assert.equal(rookKeyFor(own), 'npc_butterfly:ha7');
    assert.deepEqual(syncKeys([{ key: rookKeyFor(own) }, { key: 'npc_butterfly:2' }]), ['npc_butterfly:2']);
    assert.equal(rookKeyFor({ classId: 'apple', classIndex: 0 }), '');
  });

  it('online: a dose shows only on the Butterfly you dosed, after one had left the crowded street and come back', async () => {
    const rookAttackFeature = await featureCopy('online');
    // The server's rows after this player dosed Butterfly 1 on an earlier visit (rook.go rookedState).
    const rooked = {
      'npc_butterfly:0': { class: 'npc_butterfly', doses: 0, by: [] },
      'npc_butterfly:1': { class: 'npc_butterfly', doses: 1, by: [ME] },
      'npc_butterfly:2': { class: 'npc_butterfly', doses: 0, by: [] },
      'npc_butterfly:3': { class: 'npc_butterfly', doses: 0, by: [] },
    };
    const b = streetButterflies();
    // This visit Butterfly 1 had left the street (animal-mood-feature removeGone splices it out of
    // interactables) and one of your own Butterflies (animal-husbandry-feature) is on the street.
    const own = { classId: 'npc_butterfly', label: 'Butterfly', sprite: sprite(150), state: {}, husbandryAnimal: 'a3' };
    const list = [own, b[0], b[2], b[3]];
    const sent = [];
    const { engine, fire } = onlineEngine(list, sent);
    enter(rookAttackFeature, engine);
    // returnCrowd pushes it back at the end of interactables once the day rolls.
    list.push(b[1]);
    tick(rookAttackFeature, engine);
    fire('msg:rook', { street: TSID, snap: true, attack: null, rooked });
    const labels = Object.fromEntries(b.map((x) => [x.name, dosedLabel(rookAttackFeature, engine, x)]));
    assert.deepEqual(labels, {
      'butterfly 0': 'can revive',
      'butterfly 1': 'You have already helped revive this one.',
      'butterfly 2': 'can revive',
      'butterfly 3': 'can revive',
    });
    assert.equal(dosedLabel(rookAttackFeature, engine, own), 'not rooked', 'your own Butterfly is never one of the street\'s');
    const sync = sent.find(([k]) => k === 'rook_sync')?.[1];
    assert.deepEqual(sync.keys.sort(), ['npc_butterfly:0', 'npc_butterfly:2', 'npc_butterfly:3']);
    // Reviving Butterfly 2 sends Butterfly 2's key.
    rookAttackFeature.runVerbOverride(b[2], 'rook_revive', engine);
    assert.deepEqual(sent.at(-1), ['rook_revive', { key: 'npc_butterfly:2', balm: false }]);
    rookAttackFeature.onStreetClear(engine);
  });

  it('two players name the same Butterfly with the same key, whatever their streets looked like', async () => {
    const featureA = await featureCopy('player-a');
    const featureB = await featureCopy('player-b');
    const a = streetButterflies();
    const b = streetButterflies();
    const sentA = [];
    const sentB = [];
    const A = onlineEngine([...a], sentA);
    enter(featureA, A.engine);
    assert.deepEqual(sentA[0][1].keys, ['npc_butterfly:0', 'npc_butterfly:1', 'npc_butterfly:2', 'npc_butterfly:3']);
    featureA.onStreetClear(A.engine);
    // Player B: Butterfly 0 is away today, then comes back.
    const listB = [b[1], b[2], b[3]];
    const B = onlineEngine(listB, sentB);
    enter(featureB, B.engine);
    listB.push(b[0]);
    tick(featureB, B.engine);
    const rooked = { 'npc_butterfly:3': { class: 'npc_butterfly', doses: 1, by: [ME] } };
    B.fire('msg:rook', { street: TSID, snap: true, attack: null, rooked });
    assert.equal(dosedLabel(featureB, B.engine, b[3]), 'You have already helped revive this one.');
    for (const x of [b[0], b[1], b[2]]) assert.equal(dosedLabel(featureB, B.engine, x), 'not rooked', x.name);
    featureB.onStreetClear(B.engine);
  });

  it('solo: a rooked Piggy stays the rooked one on the next visit, whatever came back to the street first', async () => {
    const rookAttackFeature = await featureCopy('solo');
    const slots = {};
    const pigs = [0, 1, 2].map((i) => ({ classId: 'npc_piggy', label: 'Piggy', sprite: sprite(300 + i * 400), state: {}, classIndex: i, name: `piggy ${i}` }));
    const engine = {
      started: true,
      mode: 'solo',
      street: { tsid: TSID, hubId: '56' },
      streetTsid: TSID,
      interactables: [pigs[0], pigs[1], pigs[2]],
      player: { x: 300, y: 800 },
      pc: { energy: 100, mood: 100 },
      inv: {},
      camera: { x: 0, y: 0, w: 1280 },
      platforms: [],
      inScene: () => false,
      transientInstance: () => false,
      homeContext: () => ({ inHome: false }),
      busy: () => true,
      acting: () => false,
      param: () => null,
      setData: () => {},
      say: () => {},
      save: () => {},
      streetSlot: (id) => (slots[id] ||= {}),
    };
    enter(rookAttackFeature, engine);
    slots['rook-attack'].rooked = { 'npc_piggy:2': { classId: 'npc_piggy', doses: 1, at: Date.now() } };
    tick(rookAttackFeature, engine);
    assert.equal(pigs[2].subtitle, 'Rooked! It needs reviving');
    // Next visit: the same Piggies, found in another order.
    rookAttackFeature.onStreetClear(engine);
    for (const p of pigs) delete p.subtitle;
    engine.interactables = [pigs[2], pigs[0], pigs[1]];
    enter(rookAttackFeature, engine);
    assert.equal(pigs[2].subtitle, 'Rooked! It needs reviving');
    assert.equal(pigs[0].subtitle, undefined);
    assert.equal(pigs[1].subtitle, undefined);
    rookAttackFeature.onStreetClear(engine);
  });
});
