/**
 * G1306 (Austin's ruling 2026-11-25, found on #689): while the realtime client was stopped (the
 * back/forward cache, before lane bfk's fix) or not online for any reason but "no realtime on this
 * site", shared quoins, street trees, rocks, nodes and animals, community gardens and Patches fell
 * back to the solo rules on the player's own page, so a player harvested and collected with only the
 * site's save reconcile limiting it. Now in multiplayer every state but 'online' and 'off' stops
 * them: the act is refused with "Reconnecting..." (or, when the client has ended, "You need to be
 * online to do that."), nothing is granted here, and the world keeps what the server last said.
 * Private places (instances, your own home) are untouched, and so is solo.
 * Run: node --test tests/offline-shared-g1306.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createRealtimeClient } from '../public/js/realtime-client.js?v=eb1515a8';
import { ENDED_STATES, NO_REALTIME_STATES, OFFLINE_LINE, RECONNECTING_LINE, offlineLine, sharedOffline, waitLine } from '../public/js/online-request.js?v=dac938db';
import { COPY } from '../public/js/street-objects.js?v=4c07576e';
import { LOCAL_STATES } from '../public/js/shared-quoins.js?v=32ec999a';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?fresh=g1306';
import { sharedQuoinsFeature } from '../public/js/features/shared-quoins-feature.js?fresh=g1306';
import { sharedGardensFeature } from '../public/js/features/shared-gardens-feature.js?fresh=g1306';
import { dropsMpFeature } from '../public/js/features/drops-mp-feature.js?fresh=g1306';
import { powdersFeature, runPowder } from '../public/js/features/powders-feature.js?fresh=g1306';
import { createGarden } from '../public/js/garden.js?v=fefa7bcd';
import { createTrantState } from '../public/js/trants.js?v=cf0fe1a3';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));
const NOT_ONLINE = ['idle', 'connecting', 'offline', 'stopped', 'replaced', 'signed-out', 'other-character', 'booted', 'suspended'];

describe('G1306: the one rule (js/online-request.js)', () => {
  it('only a site with no realtime follows the solo rules; every other state that is not online stops shared acts', () => {
    assert.deepEqual([...NO_REALTIME_STATES], ['off']);
    assert.deepEqual([...LOCAL_STATES], ['off'], 'quoins (and animal-mood, which reads it) use the same set');
    assert.equal(sharedOffline(null), false, 'solo: no client');
    assert.equal(sharedOffline({ state: 'online' }), false);
    assert.equal(sharedOffline({ state: 'off' }), false);
    for (const state of NOT_ONLINE) assert.equal(sharedOffline({ state }), true, state);
  });

  it('says "Reconnecting..." while the client comes back, and the machines\' words once it has ended', () => {
    assert.equal(RECONNECTING_LINE, 'Reconnecting...');
    assert.equal(OFFLINE_LINE, 'You need to be online to do that.');
    for (const state of ['idle', 'connecting', 'offline', 'stopped']) assert.equal(offlineLine({ state }), RECONNECTING_LINE, state);
    for (const state of ENDED_STATES) assert.equal(offlineLine({ state }), OFFLINE_LINE, state);
    assert.equal(waitLine({ state: 'stopped' }, COPY.connecting), RECONNECTING_LINE);
    assert.equal(waitLine({ state: 'offline' }, COPY.connecting), RECONNECTING_LINE);
    assert.equal(waitLine({ state: 'replaced' }, COPY.connecting), OFFLINE_LINE);
    assert.equal(waitLine({ state: 'connecting', reconnecting: false }, COPY.connecting), COPY.connecting, 'a first connect still says it is connecting');
    assert.equal(waitLine({ state: 'online' }, COPY.busy), COPY.busy);
    for (const s of [RECONNECTING_LINE, OFFLINE_LINE]) assert.doesNotMatch(s, /—/);
  });
});

/** A realtime client stand-in for the street-objects feature. */
function objectsRig({ wanted = 'GSTREET' } = {}) {
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
  const tree = createTrantState('trant_fruit', { maturity: 10, health: 7 });
  const treeT = { classId: 'trant_fruit', label: 'Fruit Tree', state: tree, treeIndex: 0 };
  const chickenT = { classId: 'npc_chicken', classIndex: 0, label: 'Chicken', state: {} };
  const chicken2T = { classId: 'npc_chicken', classIndex: 1, label: 'Chicken', state: {} };
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'GSTREET',
    inv: { watering_can: 1 },
    pc: { energy: 200, mood: 100, imaginationUpgrades: [] },
    learnedSkills: [],
    toolState: null,
    interactables: [treeT, chickenT, chicken2T],
    data: {},
    toasts: [],
    activeBuffIds: () => [],
    setData(k, v) { this.data[k] = String(v); },
    toast(line) { this.toasts.push(line); },
    pushActivity() {},
    playSound() {},
    say() {},
    refreshVerbMenu() {},
    query(hook) { return hook === 'realtimeClient' ? client : null; },
    executeVerb() {},
  };
  streetObjectsFeature._reset();
  streetObjectsFeature.onTick(16, 0, engine);
  return { engine, client, sent, treeT, chickenT, chicken2T };
}

function snapshot(r, extra = {}) {
  r.client.emit('roster', { street: 'GSTREET', players: [] });
  r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [], ...extra });
  streetObjectsFeature.onTick(16, 0, r.engine);
}

function drop(r, state, extra = {}) {
  r.client.state = state;
  r.client.emit('roster', { street: '', players: [] });
  r.client.emit('state', { state, ...extra });
}

describe('G1306: street trees, rocks, nodes and animals (street-objects-feature)', () => {
  it('a stopped client (the page the back/forward cache stopped) refuses a shared tree\'s verb and grants nothing', () => {
    const r = objectsRig();
    snapshot(r);
    drop(r, 'stopped');
    // Before: 'stopped' was a "no live street" state, so the verb ran on the solo rules (null).
    assert.equal(streetObjectsFeature.verbRefusedNow(r.treeT, 'water', r.engine), RECONNECTING_LINE, 'refused before the swing');
    assert.equal(streetObjectsFeature.runVerbOverride(r.treeT, 'water', r.engine), true, 'held here, not run locally');
    assert.equal(r.engine.toasts.at(-1), RECONNECTING_LINE);
    assert.equal(r.sent.filter((m) => m.t === 'obj_act').length, 0);
  });

  it('reconnecting and ended states refuse too, each with its own honest words', () => {
    const r = objectsRig();
    snapshot(r);
    drop(r, 'offline', { reconnecting: true });
    r.client.reconnecting = true;
    assert.equal(streetObjectsFeature.runVerbOverride(r.treeT, 'harvest', r.engine), true);
    assert.equal(r.engine.toasts.at(-1), RECONNECTING_LINE);
    for (const state of ['replaced', 'signed-out', 'other-character']) {
      r.client.reconnecting = false;
      drop(r, state);
      assert.equal(streetObjectsFeature.runVerbOverride(r.treeT, 'harvest', r.engine), true, state);
      assert.equal(r.engine.toasts.at(-1), OFFLINE_LINE, state);
    }
    assert.equal(r.sent.filter((m) => m.t === 'obj_act').length, 0);
  });

  it('a site with no realtime (off) keeps the solo rules', () => {
    const r = objectsRig();
    drop(r, 'off');
    assert.equal(streetObjectsFeature.runVerbOverride(r.treeT, 'water', r.engine), null);
    assert.equal(streetObjectsFeature.verbRefusedNow(r.treeT, 'water', r.engine), null);
  });

  it('a private place (no shared room wanted) keeps its own rules while offline', () => {
    const r = objectsRig({ wanted: '' });
    r.client.state = 'stopped';
    r.client.emit('state', { state: 'stopped' });
    assert.equal(streetObjectsFeature.runVerbOverride(r.treeT, 'water', r.engine), null);
  });

  it('a street animal the last snapshot held is still refused offline; one it did not hold stays the page\'s own', () => {
    const r = objectsRig();
    snapshot(r, { creatures: true, animals: ['chicken:0'], objs: [{ id: 'chicken:0' }] });
    assert.ok(streetObjectsFeature._state().snap);
    drop(r, 'stopped');
    // Before: the snapshot was forgotten, so every street animal ran on the solo rules offline.
    assert.equal(streetObjectsFeature.runVerbOverride(r.chickenT, 'squeeze', r.engine), true);
    assert.equal(r.engine.toasts.at(-1), RECONNECTING_LINE);
    assert.equal(streetObjectsFeature.runVerbOverride(r.chicken2T, 'squeeze', r.engine), null, 'not the server\'s on this street');
  });

  it('a street animal with no snapshot yet is not run on the page\'s rules either (hidden: not known)', () => {
    const r = objectsRig();
    r.client.state = 'connecting';
    r.client.emit('state', { state: 'connecting' });
    assert.equal(streetObjectsFeature.runVerbOverride(r.chickenT, 'squeeze', r.engine), true);
  });

  it('Fertilidust on a shared street tree is refused offline (it grew the tree on this page before)', () => {
    const r = objectsRig();
    snapshot(r);
    drop(r, 'stopped');
    assert.equal(streetObjectsFeature.sharedFertilize([r.treeT], false, r.engine), true);
    assert.equal(r.engine.toasts.at(-1), RECONNECTING_LINE);
    assert.equal(r.sent.filter((m) => m.t === 'obj_dust').length, 0);
  });

  it('a shared Guano pile is not picked up on this page\'s rules offline', () => {
    const r = objectsRig();
    snapshot(r);
    drop(r, 'stopped');
    const batterfly = { classId: 'npc_batterfly', husbandryKey: 'batterfly:0', state: {} };
    assert.equal(streetObjectsFeature.sharedGuanoPick(batterfly, r.engine, 100), true);
    assert.equal(r.engine.toasts.at(-1), RECONNECTING_LINE);
    assert.equal(streetObjectsFeature.sharedGuano(r.engine), null, 'neither clock moves while not known');
  });
});

describe('G1306: a real realtime client (fake socket) stopped by pagehide, then back', () => {
  it('refuses while stopped and connecting, and asks the server again once it is online', async () => {
    let t = 1_000_000;
    const timers = new Map();
    let seq = 0;
    const sockets = [];
    class FakeSocket {
      constructor() { this.readyState = 0; this.sent = []; sockets.push(this); }
      send(d) { if (this.readyState !== 1) throw new Error('not open'); this.sent.push(JSON.parse(d)); }
      close() { this.readyState = 3; }
      open() { this.readyState = 1; this.onopen?.(); }
      receive(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
    }
    const client = createRealtimeClient({
      ticket: async () => ({ ticket: `t${sockets.length}`, path: '/ws' }),
      baseUri: 'https://groddle.localhost/play/online/',
      WebSocket: FakeSocket,
      setTimeout: (fn, ms) => { timers.set(++seq, { fn, at: t + ms }); return seq; },
      clearTimeout: (id) => timers.delete(id),
      now: () => t,
      random: () => 0.5,
    });
    const tree = createTrantState('trant_fruit', { maturity: 10, health: 7 });
    const treeT = { classId: 'trant_fruit', label: 'Fruit Tree', state: tree, treeIndex: 0 };
    const toasts = [];
    const engine = {
      mode: 'multiplayer', started: true, streetTsid: 'GSTREET', inv: { watering_can: 1 },
      pc: { energy: 200, imaginationUpgrades: [] }, learnedSkills: [], toolState: null, interactables: [treeT], data: {},
      activeBuffIds: () => [], setData() {}, toast: (l) => toasts.push(l), pushActivity() {}, playSound() {}, say() {}, refreshVerbMenu() {},
      query: (hook) => (hook === 'realtimeClient' ? client : null), executeVerb() {},
    };
    streetObjectsFeature._reset();
    client.join({ street: 'GSTREET', x: 0, y: 0 });
    client.start();
    await flush();
    const online = async () => {
      const ws = sockets.at(-1);
      ws.open();
      ws.receive({ t: 'hello', you: { id: 7, name: 'Ada' } });
      ws.receive({ t: 'roster', street: 'GSTREET', players: [] });
      streetObjectsFeature.onTick(16, 0, engine);
      ws.receive({ t: 'objs', street: 'GSTREET', snap: true, objs: [] });
      streetObjectsFeature.onTick(16, 0, engine);
      return ws;
    };
    let ws = await online();
    assert.equal(client.state, 'online');
    assert.ok(streetObjectsFeature._state().snap);
    // pagehide: realtime-client.js bindPageLifecycle stops the client.
    client.stop();
    assert.equal(client.state, 'stopped');
    assert.equal(streetObjectsFeature.runVerbOverride(treeT, 'water', engine), true);
    assert.equal(toasts.at(-1), RECONNECTING_LINE);
    // pageshow: it starts again; while it connects the verb is still held.
    client.start();
    assert.equal(client.state, 'connecting');
    assert.equal(streetObjectsFeature.runVerbOverride(treeT, 'water', engine), true);
    await flush();
    ws = await online();
    assert.equal(client.state, 'online');
    assert.equal(streetObjectsFeature.runVerbOverride(treeT, 'water', engine), true);
    assert.equal(ws.sent.filter((m) => m.t === 'obj_act').length, 1, 'online, the server is asked');
    client.stop();
  });
});

/** shared-quoins: a client stand-in and an engine with natural quoins. */
function quoinsRig() {
  const listeners = new Map();
  const client = {
    state: 'online', street: '', wanted: 'GQTEST', me: { id: 1, name: 'Ada' }, sent: [],
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(type, detail) { for (const fn of listeners.get(type) || []) fn(detail); },
    send(kind, payload) { if (this.state !== 'online') return false; this.sent.push({ t: kind, ...payload }); return true; },
  };
  const engine = {
    mode: 'multiplayer', started: true, player: { x: 100, y: 828 }, streetTsid: 'GQTEST', population: { quoins: 8 },
    pc: { currants: 10 }, quoinState: { collectedToday: 0, dailyLimit: 100, multiplier: 2 }, quoins: [], data: {}, toasts: [], granted: [],
    transientInstance: () => false, homeContext: () => ({ inHome: false }),
    setData(k, v) { engine.data[k] = String(v); }, playSound() {}, pushActivity() {}, updateHud() {}, toast(l) { engine.toasts.push(l); },
    query(hook) { return hook === 'realtimeClient' ? client : null; },
    spawnQuoin(spot, typeId, opts) { const q = { x: spot.x, y: spot.y, typeId, naturalQuoinIndex: opts.naturalQuoinIndex, visible: true }; engine.quoins.push(q); return q; },
    takeQuoin(q) { const at = engine.quoins.indexOf(q); if (at < 0) return false; engine.quoins.splice(at, 1); return true; },
    grantQuoin(q) { engine.granted.push(q.naturalQuoinIndex); return engine.takeQuoin(q); },
  };
  return { client, engine };
}

describe('G1306: shared quoins', () => {
  it('stopped or replaced, the quoins drawn stay and a touch collects nothing (it was the solo pickup before)', () => {
    const { client, engine } = quoinsRig();
    sharedQuoinsFeature.onStreetEnter({}, engine);
    client.street = 'GQTEST';
    client.emit('roster', { street: 'GQTEST', players: [] });
    client.emit('msg:quoins', { t: 'quoins', street: 'GQTEST', shared: true, quoins: [{ i: 1, x: 200, y: 800, type: 'xp', class: 'small random xp' }], gone: [] });
    sharedQuoinsFeature.onTick(16, 0, engine);
    assert.equal(engine.data.sharedQuoins, 'shared');
    const q = engine.quoins.find((x) => x.naturalQuoinIndex === 1);
    assert.ok(q);
    for (const state of ['stopped', 'replaced']) {
      client.state = state;
      client.emit('roster', { street: '', players: [] });
      sharedQuoinsFeature.onTick(16, 0, engine);
      assert.notEqual(engine.data.sharedQuoins, 'local', state);
      assert.equal(sharedQuoinsFeature.quoinTouched(q, engine), true, `${state}: game.js leaves it alone`);
      assert.ok(engine.quoins.includes(q), `${state}: still drawn`);
    }
    assert.equal(engine.toasts[0], RECONNECTING_LINE);
    assert.deepEqual(engine.granted, []);
    // A site with no realtime: the solo rules.
    client.state = 'off';
    sharedQuoinsFeature.onTick(16, 0, engine);
    assert.equal(engine.data.sharedQuoins, 'local');
    assert.equal(sharedQuoinsFeature.quoinTouched(q, engine), null);
  });
});

describe('G1306: community gardens', () => {
  it('stopped or signed out, a shared plot keeps the server\'s bed and its verbs are refused', () => {
    const COMMUNITY = 'GCR101NQ4BU1SKS';
    const listeners = new Map();
    const sent = [];
    const client = {
      state: 'online', street: COMMUNITY, me: { id: 7 },
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
      send(kind, payload = {}) { if (this.state !== 'online') return false; sent.push({ t: kind, ...payload }); return true; },
      emit(type, detail) { for (const fn of listeners.get(type) || []) fn(detail); },
    };
    const world = { [COMMUNITY]: { gardens: { default: createGarden({ cols: 4, rows: 2 }) } } };
    const engine = {
      mode: 'multiplayer', started: true, streetTsid: COMMUNITY, inv: { seed_spinach: 2, watering_can: 1, hoe: 1 },
      pc: { energy: 500, mood: 50, imaginationUpgrades: [] }, learnedSkills: [], toolState: null, interactables: [], data: {}, toasts: [],
      setData(k, v) { this.data[k] = String(v); }, toast(l) { this.toasts.push(l); }, pushActivity() {}, playSound() {},
      refreshGarden() {}, refreshPack() {}, save() {}, visitedStreets: () => Object.keys(world),
      streetWorld: (tsid) => world[tsid] || (world[tsid] = { gardens: {} }),
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      executeVerb() { throw new Error('nothing runs here offline'); },
    };
    sharedGardensFeature._reset();
    sharedGardensFeature.restore(undefined, engine);
    sharedGardensFeature.onTick(16, 0, engine);
    const bed = sharedGardensFeature.sharedGardenFor('default', { cols: 4, rows: 2 }, engine);
    client.emit('msg:gardens', { t: 'gardens', street: COMMUNITY, snap: true, now: Date.now(), plots: { 'default:1-1': { state: 'crop', seed: 'seed_spinach', ripeAt: Date.now() - 1000, stageAt: Date.now() - 1000 } } });
    const plotT = { classId: 'garden_plot', state: { garden: bed, plotKey: '1-1', plot: bed.plots['1-1'] } };
    assert.equal(bed.plots['1-1'].state, 'crop');
    for (const [state, line] of [['stopped', RECONNECTING_LINE], ['signed-out', OFFLINE_LINE]]) {
      client.state = state;
      client.emit('state', { state });
      assert.equal(sharedGardensFeature.verbRefusedNow(plotT, 'harvest', engine), line, state);
      assert.equal(sharedGardensFeature.runVerbOverride(plotT, 'harvest', engine), true, state);
      assert.equal(engine.toasts.at(-1), line, state);
      // Before: these states put the save's own (empty) bed back and the verb ran on it.
      assert.equal(plotT.state.garden, bed, `${state}: the server's bed stays`);
      assert.equal(bed.plots['1-1'].state, 'crop', `${state}: as the server had it`);
    }
    assert.equal(sent.filter((m) => m.t === 'garden_act').length, 0);
  });
});

describe('G1306: drops on shared ground', () => {
  it('offline, a drop on a public street is refused (it became a stack only this page had); a pickup says the same', async () => {
    const STREET = 'LIF102FDNU11314';
    const handlers = {};
    const client = {
      state: 'online', street: STREET, wanted: STREET, sent: [],
      on(ev, fn) { (handlers[ev] ||= []).push(fn); return () => {}; },
      send(kind, payload) { if (this.state !== 'online') return false; this.sent.push([kind, payload]); return true; },
      emit(ev, msg) { for (const fn of handlers[ev] || []) fn(msg); },
    };
    const toasts = [];
    const engine = {
      mode: 'multiplayer', started: true, streetTsid: STREET, inv: { plank: 20 }, player: { x: 900, y: 620 },
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      dropWorldStack: () => ({ ok: true }), redrawDroppedStacks: () => {}, setData: () => {}, toast: (l) => toasts.push(l),
      pushActivity: () => {}, playSound: () => {}, floatText: () => {}, refreshPack: () => {}, save: () => {},
    };
    globalThis.document = { baseURI: 'https://groddle.localhost/' };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.fetch = async (url) => {
      const body = String(url).includes('trade-items.json') ? { items: { plank: {} }, untradeable: {} } : { drops: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
    };
    try {
      dropsMpFeature.init(engine);
      dropsMpFeature.onTick(16, 0, engine);
      await new Promise((r) => setTimeout(r, 30));
      client.state = 'stopped';
      client.emit('state', { state: 'stopped' });
      // Before: null, so game.js dropped the planks as the player's own stack here.
      assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'plank', count: 2, x: 900, y: 620 }, engine), true);
      assert.equal(toasts.at(-1), RECONNECTING_LINE);
      assert.equal(engine.inv.plank, 20, 'the pack keeps them');
      assert.equal(client.sent.filter(([k]) => k === 'ground_drop').length, 0);
      // A private place: the drop is the player's own, as before.
      client.wanted = '';
      assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'plank', count: 2, x: 900, y: 620 }, engine), null);
      // No realtime on the site: the solo rules.
      client.wanted = STREET;
      client.state = 'off';
      assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'plank', count: 2, x: 900, y: 620 }, engine), null);
    } finally {
      delete globalThis.document;
      delete globalThis.GRODDLE_MP_BOOT;
      delete globalThis.fetch;
      delete globalThis.groddleDrops;
    }
  });
});

describe('G1306: powders that reach the street', () => {
  it('offline, Sprinkle and Scatter are refused, the jar keeps its charge and nothing lands here', () => {
    powdersFeature._reset();
    const listeners = new Map();
    const client = {
      state: 'stopped', sent: [],
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
      send(kind, payload) { this.sent.push([kind, payload]); return true; },
    };
    const toasts = [];
    const engine = {
      mode: 'multiplayer', inv: { sparkle_powder: 1, sneezing_powder: 1 }, pc: { energy: 50, mood: 50, energyMax: 100, moodMax: 100 },
      player: { x: 500, y: 400 }, interactables: [], unlockedAchievements: [], hasBuff: () => false, applyBuff: () => ({ ok: true }), removeBuff() {},
      achievement() {}, playSound() {}, pushActivity() {}, toast: (l) => toasts.push(l), refreshPack() {}, updateHud() {}, save() {},
      setData() {}, param: () => null, floatText() {}, dropWorldStack() { throw new Error('no Bean drops here'); },
      query: (hook) => (hook === 'realtimeClient' ? client : null),
    };
    // Before: the solo runner ran (+10 mood for Sparkle, a Bean and -2 mood for Sneezing).
    assert.equal(runPowder(engine, 'sparkle_powder'), null);
    assert.equal(runPowder(engine, 'sneezing_powder'), null);
    assert.equal(engine.pc.mood, 50);
    assert.deepEqual(engine.inv, { sparkle_powder: 1, sneezing_powder: 1 });
    assert.deepEqual(toasts, [RECONNECTING_LINE, RECONNECTING_LINE]);
    assert.equal(client.sent.length, 0);
    powdersFeature._reset();
  });
});

describe('G1306: the wiring of the rest (one wording everywhere)', () => {
  it('foxes: a server fox is not brushed offline, and a failed ignite says the same words', () => {
    const src = read('public/js/features/foxes-feature.js');
    assert.match(src, /if \(mp && entity\.serverId && sharedOffline\(mp\.client\)\) \{\n\s+engine\.toast\(offlineLine\(mp\.client\), 2400\);[\s\S]{0,120}return \{ ok: false, reason: 'offline' \};/);
    assert.ok(src.indexOf("reason: 'offline'") < src.indexOf('const result = brushFox('), 'refused before brushFox grants Fiber');
    assert.doesNotMatch(src, /'You are offline\.'/);
  });

  it('street toys: played only through the server, or refused while the street is not live', () => {
    const src = read('public/js/features/street-toys-feature.js');
    assert.match(src, /if \(c \|\| \(sharedOffline\(lc\) && toyMessageFor\(\{ street: lc\.wanted \}, tsid\)\)\) \{\n\s+engine\.toast\?\.\(offlineLine\(lc\), 2400\);\n\s+return true;/);
  });

  it('Patches, Hi signs, home machines and yard visits use the same words', () => {
    assert.match(read('public/js/features/shared-patches-feature.js'), /const LOCAL_STATES = NO_REALTIME_STATES;/);
    assert.match(read('public/js/features/hi-signs-feature.js'), /engine\.toast\?\.\(offlineLine\(mpc\), 2400\);/);
    assert.equal((read('public/js/features/home-machines-feature.js').match(/say\(offlineLine\(client\)\);/g) || []).length, 3);
    assert.equal((read('public/js/features/yard-verbs-mp-feature.js').match(/notice\(offlineLine\(client\)\);/g) || []).length, 3);
  });

  it('no feature keeps its own list of "no live street" states any more', () => {
    for (const f of ['street-objects-feature', 'shared-gardens-feature', 'shared-patches-feature']) {
      const src = read(`public/js/features/${f}.js`);
      assert.doesNotMatch(src, /new Set\(\['off', 'signed-out', 'replaced', 'other-character', 'stopped'\]\)/, f);
    }
    assert.doesNotMatch(read('public/js/shared-quoins.js'), /'stopped'/);
  });
});
