// G593: Heli Kitties had no Rook key, so the Rook could not stop a shared Heli Kitty online. The kitty
// feature's targets carried no spawn index, so rook-attack-feature gave each a loose key in the order
// its scan met them (npc_kitty_chicken:100, :101, ...): two pages could name different kitties, the
// server (rook.go) never told the street objects, and a rooked kitty flew on along its shared path.
// Now each kitty is keyed by its spawn index (npc_kitty_chicken:<i>, from heli-kitties-feature's
// kittyKey kitty:<i>), the server holds its path (objects_creatures.go rookCreatureKey), and a rooked
// kitty is not startled (npc_kitty_chicken.js onPlayerCollision 1207-1210).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOK_LOOSE_KEY_BASE, rookKeyFor } from '../public/js/rook-attack.js?v=c12e825f';
import { syncKeys } from '../public/js/rook-mp.js?v=0b9056b1';
import { kittyIndex } from '../public/js/features/heli-kitties-feature.js?v=a209368b';
import { creatureOf } from '../public/js/street-creatures.js?v=16acda00';

const featureCopy = async (name) => (await import(`../public/js/features/rook-attack-feature.js?fresh=rook-heli-kitty-${name}`)).rookAttackFeature;

const TSID = 'GA5215DAMMR2G95'; // a street with Heli Kitties and a shrine
const ME = 500;

function sprite(x) {
  return { x, y: 800, visible: true, destroyed: false, scale: { x: 1, set() {} }, textures: [{}], gotoAndPlay() {}, play() {} };
}

/** The street's Heli Kitties as heli-kitties-feature buildKitty registers them. */
function streetKitties(n = 3) {
  return Array.from({ length: n }, (_, i) => ({
    classId: 'npc_kitty_chicken',
    featureId: 'heli-kitties',
    label: 'Heli Kitty',
    sprite: sprite(300 + i * 400),
    airborne: true,
    kittyKey: `kitty:${i}`,
    classIndex: kittyIndex(`kitty:${i}`),
    state: {},
    name: `kitty ${i}`,
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
    street: { tsid: TSID, hubId: '58', hubName: 'Uralia' },
    streetTsid: TSID,
    interactables,
    player: { x: 300, y: 800 },
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

let clock = 50_000;
function tick(feature, engine) {
  clock += 500;
  feature.onTick(500, clock, engine);
}
function enter(feature, engine) {
  feature.onStreetClear(engine);
  for (let i = 0; i < 8; i += 1) tick(feature, engine);
}

describe('G593: a Heli Kitty has a Rook key', () => {
  it('its key is its spawn index, the same as the street objects\' kitty:<i>, never a loose one', () => {
    const k = streetKitties();
    assert.deepEqual(k.map(rookKeyFor), ['npc_kitty_chicken:0', 'npc_kitty_chicken:1', 'npc_kitty_chicken:2']);
    assert.deepEqual(k.map((t) => creatureOf(t)?.index), [0, 1, 2], 'the index the server shares it by');
    assert.deepEqual(syncKeys(k.map((t) => ({ key: rookKeyFor(t) }))), ['npc_kitty_chicken:0', 'npc_kitty_chicken:1', 'npc_kitty_chicken:2'], 'sent to the server');
    // The QA kitty (kittydemo) is kitty:99: still under the loose keys.
    assert.equal(kittyIndex('kitty:99'), 99);
    assert.ok(99 < ROOK_LOOSE_KEY_BASE);
    assert.equal(kittyIndex('crab:1'), undefined);
    assert.equal(kittyIndex(''), undefined);
  });

  it('online: two players name the same kitty, and the rooked one is the one the server rooked', async () => {
    const featureA = await featureCopy('a');
    const featureB = await featureCopy('b');
    const a = streetKitties();
    const sentA = [];
    const A = onlineEngine([...a], sentA);
    enter(featureA, A.engine);
    assert.deepEqual(sentA.find(([k]) => k === 'rook_sync')[1].keys.sort(), ['npc_kitty_chicken:0', 'npc_kitty_chicken:1', 'npc_kitty_chicken:2']);
    featureA.onStreetClear(A.engine);
    // Player B: kitty 0 is not drawn yet when the scan runs (its sheets still loading), then arrives.
    const b = streetKitties();
    const listB = [b[2], b[1]];
    const sentB = [];
    const B = onlineEngine(listB, sentB);
    enter(featureB, B.engine);
    listB.push(b[0]);
    tick(featureB, B.engine);
    B.fire('msg:rook', { street: TSID, snap: true, attack: null, rooked: { 'npc_kitty_chicken:1': { class: 'npc_kitty_chicken', doses: 0, by: [] } } });
    assert.equal(featureB.targetRooked(b[1], B.engine), true);
    assert.equal(featureB.targetRooked(b[0], B.engine), null);
    assert.equal(featureB.targetRooked(b[2], B.engine), null);
    assert.ok(featureB.verbOverride(b[1], B.engine)?.some((v) => v.id === 'rook_revive'), 'Revive on the rooked kitty');
    featureB.runVerbOverride(b[1], 'rook_revive', B.engine);
    assert.deepEqual(sentB.at(-1), ['rook_revive', { key: 'npc_kitty_chicken:1', balm: false }]);
    featureB.onStreetClear(B.engine);
  });

  it('a rooked kitty is not startled, and solo it stays where it was struck (the feature asks the Rook)', () => {
    const src = readFileSync(new URL('../public/js/features/heli-kitties-feature.js', import.meta.url), 'utf8');
    const scare = src.slice(src.indexOf('function scare('), src.indexOf('function pet('));
    assert.match(scare, /if \(rooked\(engine, entity\)\) return false;/);
    assert.ok(scare.indexOf('rooked(engine, entity)') < scare.indexOf('rollScare'), 'checked before the roll');
    assert.match(src, /else if \(rooked\(engine, entity\)\) continue;/);
    assert.match(src, /classIndex: kittyIndex\(kitty\.key\)/);
  });
});
