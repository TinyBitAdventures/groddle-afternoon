/**
 * G1311 (Austin's ruling 2026-11-25, after G1306): a street's Heli Kitties, Crab and Fire Dragons
 * are tended on the page and the server only mirrors the act (street-objects-feature
 * sharedWalkerVerb). G1306 stopped shared things while the realtime client is not online, but these
 * still gave their pet, flatter, hug, Crabato Juice and tune rewards on the player's own page. Now in
 * multiplayer, while the street is not live (reconnecting, stopped, replaced, signed out...), their
 * verbs and the Crab's call-out for a tune are refused with the same words as the rest
 * ("Reconnecting...", or "You need to be online to do that." once the client has ended) and grant
 * nothing. Solo, a site with no realtime ('off') and private places are untouched.
 * Run: node --test tests/offline-walkers-g1311.test.js
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { OFFLINE_LINE, RECONNECTING_LINE } from '../public/js/online-request.js?v=5fa7a635';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=e1ecef78';
import { heliKittiesFeature } from '../public/js/features/heli-kitties-feature.js?v=ae76f603';
import { crabsFeature } from '../public/js/features/crabs-feature.js?v=e918a242';
import { fireDragonFeature } from '../public/js/features/fire-dragon-feature.js?v=bd2ccc9f';
import { setWildlifeCatalog } from '../public/js/wildlife.js?v=352e8bfa';
import { MUSICBLOCK_CATALOG } from '../public/js/musicblocks.js?v=e4c81eb7';
import { createInventory } from '../public/js/inventory.js?v=3be7988a';

/** Hechey Track: one of the eight archived crab streets. */
const STREET = 'GLI2V0UN7RD1T2J';
const NOT_ONLINE = ['idle', 'connecting', 'offline', 'stopped', 'replaced', 'signed-out', 'other-character', 'booted', 'suspended'];
const ENDED = new Set(['replaced', 'signed-out', 'other-character', 'booted', 'suspended']);
const lineFor = (state) => (ENDED.has(state) ? OFFLINE_LINE : RECONNECTING_LINE);
const settle = () => new Promise((r) => setTimeout(r, 30));

class Obj {
  constructor(textures) {
    this.textures = textures;
    this.children = [];
    this.scale = { x: 1, y: 1, set(a, b) { this.x = a; this.y = b ?? a; } };
    this.anchor = { set() {} };
    this.x = 0;
    this.y = 0;
    this.destroyed = false;
  }
  play() {}
  gotoAndStop() {}
  gotoAndPlay() {}
  addChild(c) { this.children.push(c); }
  on() {}
  emit() {}
}
class Texture { constructor(o) { Object.assign(this, o); } }
Texture.EMPTY = {};
const PIXI = { Container: Obj, AnimatedSprite: Obj, Rectangle: class { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } }, ImageSource: class { on() {} emit() {} }, Texture };

let prevPixi;
beforeEach(() => {
  prevPixi = globalThis.PIXI;
  globalThis.PIXI = PIXI;
  setWildlifeCatalog({ streets: {}, wildlife: { [STREET]: { npc_kitty_chicken: 1 } } });
});
afterEach(() => {
  globalThis.PIXI = prevPixi;
  setWildlifeCatalog(null);
  for (const f of [heliKittiesFeature, crabsFeature, fireDragonFeature]) f.onStreetClear({ setData() {} });
});

/** A street with one Heli Kitty, its Crab and one Fire Dragon, each spawned by its own feature. */
async function rig({ mode = 'multiplayer', wanted = STREET, withClient = true } = {}) {
  const sent = [];
  const listeners = new Map();
  const client = {
    state: 'online',
    wanted,
    street: wanted,
    reconnecting: false,
    me: { id: 7 },
    probe() { return true; },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
      return () => {};
    },
    send(kind, payload = {}) {
      if (this.state !== 'online') return false;
      sent.push({ t: kind, ...payload });
      return true;
    },
    emit(type, detail) {
      for (const fn of listeners.get(type) || []) fn(detail);
    },
  };
  const slots = {};
  const features = [streetObjectsFeature, heliKittiesFeature, crabsFeature, fireDragonFeature];
  const engine = {
    PIXI,
    mode,
    started: true,
    streetTsid: STREET,
    worldW: 3000,
    groundY: 800,
    platforms: [{ x1: 0, y1: 800, x2: 3000, y2: 800, pc_perm: -1, item_perm: -1 }],
    population: { featureCounts: { npc_fire_dragon: 1 } },
    pc: { energy: 200, energyMax: 400, mood: 50, moodMax: 400, xp: 0, imaginationUpgrades: [] },
    inv: createInventory({}),
    learnedSkills: [],
    interactables: [],
    player: null,
    entityLayer: new Obj(),
    data: {},
    toasts: [],
    activity: [],
    setData(k, v) { this.data[k] = String(v); },
    toast(line) { this.toasts.push(line); },
    pushActivity(a) { this.activity.push(a); },
    param() { return ''; },
    placement(key) {
      if (key === 'kitty') return [{ x: 500, y: 800 }];
      return [{ x: key === 'crab' || /crab/i.test(key) ? 1500 : 2500, y: 800 }];
    },
    streetSlot(id) { return (slots[id] ||= {}); },
    register(t) { this.interactables.push(t); return t; },
    say() {},
    playSound() {},
    floatText() {},
    updateHud() {},
    refreshPack() {},
    save() {},
    featsIncrement() {},
    busy() { return false; },
    acting() { return false; },
    transientInstance() { return false; },
    hasBuff() { return false; },
    query(hook, ...args) {
      if (hook === 'realtimeClient') return withClient ? client : null;
      for (const f of features) {
        if (typeof f[hook] !== 'function') continue;
        const out = f[hook](...args);
        if (out != null) return out;
      }
      return null;
    },
  };
  streetObjectsFeature._reset();
  for (const f of [heliKittiesFeature, crabsFeature, fireDragonFeature]) {
    f.init(engine);
    f.onStreetEnter({ tsid: STREET }, engine);
  }
  await settle();
  const kitty = engine.interactables.find((t) => t.classId === 'npc_kitty_chicken');
  const crab = engine.interactables.find((t) => t.classId === 'npc_crab');
  const dragon = engine.interactables.find((t) => t.classId === 'npc_fire_dragon');
  assert.ok(kitty && crab && dragon, 'each feature spawned its street animal');
  streetObjectsFeature.onTick(16, 0, engine);
  return { engine, client, sent, kitty, crab, dragon };
}

/** The server's snapshot: it shares the three walkers on this street. */
function snapshot(r) {
  r.client.emit('roster', { street: STREET, players: [] });
  r.client.emit('msg:objs', {
    t: 'objs',
    street: STREET,
    snap: true,
    creatures: true,
    animals: ['kitty:0', 'crab:0', 'dragon:0'],
    spots: { 'kitty:0': [500, 800], 'crab:0': [1500, 800], 'dragon:0': [2500, 800] },
    now: Date.now(),
    objs: [],
  });
  streetObjectsFeature.onTick(16, 0, r.engine);
}

function drop(r, state) {
  r.client.state = state;
  r.client.emit('roster', { street: '', players: [] });
  r.client.emit('state', { state });
}

/** game.js runVerbFinish: the verb goes to the feature that owns the target. */
function run(r, target, verb) {
  const f = { 'heli-kitties': heliKittiesFeature, crabs: crabsFeature, 'fire-dragon': fireDragonFeature }[target.featureId];
  return f.runVerb(target, verb, r.engine);
}

/** Everything a verb could give or take on this page. */
function wallet(r) {
  return JSON.stringify({ pc: r.engine.pc, inv: r.engine.inv, activity: r.engine.activity.length });
}

const VERBS = [
  ['kitty', 'pet'],
  ['crab', 'crab_flatter'],
  ['crab', 'crab_hug'],
  ['crab', 'crab_insult'],
  ['crab', 'crab_pinch'],
  ['dragon', 'dragon_pet'],
];

describe('G1311: online, the walkers are tended here and the street sees it (unchanged)', () => {
  it('a pet, a flatter and a dragon pet give their rewards and tell the server', async () => {
    const r = await rig();
    snapshot(r);
    const mood = r.engine.pc.mood;
    for (const [who, verb] of [['kitty', 'pet'], ['crab', 'crab_flatter'], ['dragon', 'dragon_pet']]) {
      assert.equal(streetObjectsFeature.verbRefusedNow(r[who], verb, r.engine), null, `${who} ${verb} may start`);
      run(r, r[who], verb);
    }
    assert.ok(r.engine.pc.mood > mood, 'mood went up');
    assert.deepEqual(r.sent.filter((m) => m.t === 'obj_act').map((m) => [m.id, m.verb]), [['kitty:0', 'pet'], ['crab:0', 'flatter'], ['dragon:0', 'pet']]);
    assert.deepEqual(r.engine.toasts, []);
  });
});

describe('G1311: not online, a street Heli Kitty, Crab or Fire Dragon grants nothing', () => {
  for (const state of NOT_ONLINE) {
    it(`${state}: every verb is refused before the swing and in the feature, with "${lineFor(state)}"`, async () => {
      const r = await rig();
      snapshot(r);
      drop(r, state);
      const before = wallet(r);
      for (const [who, verb] of VERBS) {
        assert.equal(streetObjectsFeature.verbRefusedNow(r[who], verb, r.engine), lineFor(state), `${who} ${verb} before the swing`);
        r.engine.toasts.length = 0;
        run(r, r[who], verb);
        assert.deepEqual(r.engine.toasts, [lineFor(state)], `${who} ${verb} in its feature`);
      }
      assert.equal(wallet(r), before, 'no energy, mood, iMG, Crabato Juice or activity');
      assert.equal(r.sent.filter((m) => m.t === 'obj_act').length, 0);
    });
  }

  it('a client still connecting, before the street\'s first snapshot, refuses too', async () => {
    const r = await rig();
    r.client.state = 'connecting';
    const before = wallet(r);
    run(r, r.kitty, 'pet');
    assert.deepEqual(r.engine.toasts, [RECONNECTING_LINE]);
    assert.equal(wallet(r), before);
  });

  it('the Heli Kitty\'s name verbs wait too (naming counts toward an achievement)', async () => {
    const r = await rig();
    snapshot(r);
    drop(r, 'stopped');
    assert.equal(streetObjectsFeature.verbRefusedNow(r.kitty, 'name', r.engine), RECONNECTING_LINE);
    assert.equal(streetObjectsFeature.verbRefusedNow(r.kitty, 'rename', r.engine), RECONNECTING_LINE);
  });

  it('the Crab does not call out for a tune while the street is not live, and does once it is back', async () => {
    const r = await rig();
    snapshot(r);
    const block = Object.keys(MUSICBLOCK_CATALOG)[0];
    r.engine.inv[block] = 1;
    r.engine.player = { x: 1500, y: 800 };
    drop(r, 'offline');
    crabsFeature.onTick(16, 0, r.engine);
    assert.equal(crabsFeature._state().talk, null, 'no call-out offline');
    r.client.state = 'online';
    snapshot(r);
    crabsFeature.onTick(16, 0, r.engine);
    assert.equal(crabsFeature._state().talk, 'offer', 'online it asks for a tune as before');
  });
});

describe('G1311: solo, a site with no realtime, and places the server does not share are untouched', () => {
  it('solo (no realtime client): the pet lands as always', async () => {
    const r = await rig({ mode: 'solo', withClient: false });
    const mood = r.engine.pc.mood;
    assert.equal(streetObjectsFeature.verbRefusedNow(r.kitty, 'pet', r.engine), null);
    run(r, r.kitty, 'pet');
    run(r, r.dragon, 'dragon_pet');
    assert.ok(r.engine.pc.mood > mood);
    assert.deepEqual(r.engine.toasts, []);
  });

  it('a site with no realtime (\'off\'): the solo rules', async () => {
    const r = await rig();
    drop(r, 'off');
    const juice = Number(r.engine.inv.crabato_juice) || 0;
    run(r, r.crab, 'crab_flatter');
    run(r, r.crab, 'crab_hug');
    assert.deepEqual(r.engine.toasts, []);
    assert.equal(Number(r.engine.inv.crabato_juice) || 0, juice + 1, 'the hug gave its Crabato Juice');
  });

  it('a room that is not this street (a private place): the page\'s own rules', async () => {
    const r = await rig({ wanted: 'HOUSE_7' });
    drop(r, 'stopped');
    const mood = r.engine.pc.mood;
    assert.equal(streetObjectsFeature.verbRefusedNow(r.dragon, 'dragon_pet', r.engine), null);
    run(r, r.dragon, 'dragon_pet');
    assert.ok(r.engine.pc.mood > mood);
    assert.deepEqual(r.engine.toasts, []);
  });

  it('a street whose last snapshot did not hold the walkers (an older server): the page\'s own rules', async () => {
    const r = await rig();
    r.client.emit('roster', { street: STREET, players: [] });
    r.client.emit('msg:objs', { t: 'objs', street: STREET, snap: true, objs: [] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    drop(r, 'stopped');
    assert.equal(streetObjectsFeature.verbRefusedNow(r.kitty, 'pet', r.engine), null);
  });
});
