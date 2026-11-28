/**
 * Report #700: time in the Ancestral Lands felt short. Our numbers were Glitch's (600 s, the Dust
 * Trap table, the cap at full); two things were not, and Austin's ruling (2026-11-26) is "as Glitch"
 * on both:
 *
 * 1. The visit's clock stopped while the tab was hidden: each frame counted at most a second, and a
 *    hidden tab runs no frames. Glitch's clock was wall-clock on its server (get_baqala_buff_time:
 *    time_spent + time() - entry_time, players/inc_special_locations.js 114-116), so it ran on, and
 *    the buff's on_remove (check_baqala_boot 151-168) sent you away on time whether you watched or not.
 * 2. Each player had their own Dust Traps (register G946). In Glitch a trap was one item on the street
 *    (items/dust_trap.js): the first player in sprang it (doPlayerResponse 132-153: this.ready, then
 *    this.ready = false) and it was down for everyone (setAndBroadcastState) for 2 x the time it had
 *    stood ready. Online the realtime server decides it (objects_dust_trap.go); the page asks
 *    (street-objects-feature sharedTrapTrigger) and runs the trap's own roll only when it was first.
 */
import { after, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FEATURES } from '../public/js/features/index.js?v=c3d605f4';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=0537418b';
import { SHARED_NODE_CLASSES, applyNodeState, createStreetCopy, freshenNode, stateFor, takeObjs } from '../public/js/street-objects.js?v=a3cc4ce5';
import { createResourceNode, resourceNodeFrame } from '../public/js/resource-nodes.js?v=c2eb46b1';
import { applyBuff, createBuffState, hasBuff, removeBuff } from '../public/js/buffs.js?v=09184e60';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=c9b84764';
import { NOSTALGIA_BOOT_STREETS } from '../public/js/ancestral-nostalgia-data.js?v=0adb9184';
import { ruleTables } from '../tools/build-realtime-objects.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(root, '../glitch-GameServerJS');
const hasGsjs = existsSync(join(GSJS, 'items/dust_trap.js'));
const gsjs = (rel) => readFileSync(join(GSJS, rel), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));

before(async () => {
  await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
});

describe('#700 the source', () => {
  it('Glitch counted the visit on the server clock and kept one trap on the street', { skip: !hasGsjs && 'glitch-GameServerJS not beside the repo' }, () => {
    const loc = gsjs('players/inc_special_locations.js');
    assert.match(loc, /return this\.baqala_times \? \(this\.baqala_times\.time_spent \+ time\(\) - this\.baqala_times\.entry_time\) : 0;/);
    const trap = gsjs('items/dust_trap.js');
    assert.match(trap, /if\(this\.ready\) \{\s*if\(this\.ready_time\) \{\s*var reset_time = 2 \* \(time\(\) - this\.ready_time\);/);
    assert.match(trap, /this\.ready = false;\s*this\.pc = pc;/);
    assert.match(trap, /function makeReady\(\)\{ \/\/ defined by dust_trap\s*this\.setAndBroadcastState\('idle'\);\s*this\.ready = true;\s*this\.ready_time = time\(\);/);
  });
});

describe('#700 the clock runs on in a hidden tab', () => {
  const feature = FEATURES.find((f) => f.id === 'juju-bandits');
  const street = (hubId) => ({ hubId, platforms: [], bounds: { l: 0, r: 3000, t: -1000, b: 0 } });
  const enter = (engine, s) => {
    engine.street = s;
    feature.onStreetClear(engine);
    feature.onStreetEnter(s, engine);
  };
  const makeEngine = () => {
    const buffs = createBuffState();
    const data = {};
    const engine = {
      data,
      buffs,
      prompts: [],
      travels: [],
      street: street('86'),
      inv: {},
      player: { x: 500, y: 0 },
      pc: { imaginationUpgrades: [] },
      questState: { active: { help_juju_bandits: {} }, completed: [] },
      param: () => null,
      setData: (k, v) => { data[k] = String(v); },
      achievement() {},
      save() {},
      refreshPack() {},
      pushActivity() {},
      hasBuff: (id) => hasBuff(buffs, id, Date.now()),
      applyBuff: (id) => applyBuff(buffs, id, null, Date.now()),
      removeBuff: (id) => removeBuff(buffs, id, null, Date.now()),
      buffRow: (id) => (hasBuff(buffs, id, Date.now()) ? buffs.active[id] : null),
      prompt: (p) => { engine.prompts.push(p); return ''; },
      travel: async (tsid, meta) => {
        engine.travels.push({ tsid, ...meta });
        enter(engine, street('85'));
        return { ok: true };
      },
      streetExists: () => true,
      query: (hook) => (hook === 'openForEveryone' ? new Set(NOSTALGIA_BOOT_STREETS.map((r) => r.tsid)) : hook === 'openRoadsLoaded' ? true : null),
      inScene: () => false,
      transientInstance: () => false,
      questDialogueOpen: () => false,
      acting: () => false,
    };
    return engine;
  };
  const savedDoc = globalThis.document;
  after(() => {
    mock.timers.reset();
    if (savedDoc === undefined) delete globalThis.document;
    else globalThis.document = savedDoc;
    feature.restore(undefined);
  });

  it('a gap with no frames counts in full (it counted one second)', () => {
    feature.restore(undefined);
    const engine = makeEngine();
    const t0 = Date.now();
    const wall = Date.now;
    Date.now = () => t0;
    try { enter(engine, street('86')); } finally { Date.now = wall; }
    feature.onTick(16, t0 + 1000, engine);
    feature.onTick(16, t0 + 2000, engine);
    // The tab hidden five minutes: no frames, then one.
    feature.onTick(16, t0 + 2000 + 300_000, engine);
    assert.ok(Math.abs(feature._state().clock.spent - 302) < 0.01, String(feature._state().clock.spent));
    assert.equal(engine.data.nostalgiaLeft, '298');
    feature.restore(undefined);
  });

  it('while hidden, a timer keeps the visit going and sends you away on time', async () => {
    feature.restore(undefined);
    const listeners = {};
    globalThis.document = { visibilityState: 'visible', addEventListener: (type, fn) => { listeners[type] = fn; } };
    const t0 = Date.now();
    mock.timers.enable({ apis: ['setInterval', 'Date'], now: t0 });
    const engine = makeEngine();
    feature.init(engine);
    assert.equal(typeof listeners.visibilitychange, 'function', 'it watches the tab');
    enter(engine, street('86'));
    feature.onTick(16, t0 + 1000, engine);
    mock.timers.tick(1000);
    // Hidden: no more frames.
    globalThis.document.visibilityState = 'hidden';
    listeners.visibilitychange();
    for (let i = 0; i < 597; i += 1) mock.timers.tick(1000);
    assert.equal(engine.travels.length, 0, 'still there with seconds to go');
    assert.ok(Number(engine.data.nostalgiaLeft) <= 2, engine.data.nostalgiaLeft);
    for (let i = 0; i < 4; i += 1) mock.timers.tick(1000);
    await flush();
    assert.equal(engine.travels.length, 1, 'sent away at 10 minutes, the tab still hidden');
    assert.equal(engine.hasBuff('too_much_nostalgia'), true);
    // Back on the tab: the timer stops, frames take over.
    globalThis.document.visibilityState = 'visible';
    listeners.visibilitychange();
    const spent = feature._state().clock.spent;
    mock.timers.tick(5000);
    assert.equal(feature._state().clock.spent, spent, 'no timer once the tab shows');
    mock.timers.reset();
  });
});

describe('#700 (G946) a Dust Trap is the street\'s', () => {
  const ID = 'node:dust_trap:0';

  it('is a shared node, with the source\'s reset row for the server', () => {
    assert.ok(SHARED_NODE_CLASSES.includes('dust_trap'));
    const rules = ruleTables(Object.fromEntries(['trant_fruit', 'trant_egg', 'trant_bean', 'trant_bubble', 'trant_spice', 'trant_gas'].map((id) => [id, { fruitCapMap: [], fruitProdMap: [] }])));
    assert.deepEqual(rules.nodes.dust_trap, { model: 'respawn', min: 0, max: 1, initial: 1, ready: 1, verbs: ['trigger'], reset: [180000, 3600000, 86400000] });
  });

  it('down for everyone from the server\'s word: smackDown from when it went down, then down, then up', () => {
    const now = 1_000_000;
    const node = createResourceNode('dust_trap', { now: 0 });
    applyNodeState(node, { id: ID, units: 0, in: 100_000, sprung: 500 }, now);
    assert.deepEqual([node.units, node.depleted, node.respawnAt, node.triggeredAt], [0, true, now + 100_000, now - 500]);
    assert.equal(resourceNodeFrame(node, now).sheetKey, 'smackDown');
    assert.equal(resourceNodeFrame(node, now + 5000).sheetKey, 'down');
    assert.equal(resourceNodeFrame(node, now + 99_500).sheetKey, 'up');
    applyNodeState(node, { id: ID, units: 1, in: 0 }, now + 100_000);
    assert.deepEqual([node.depleted, node.triggeredAt], [false, 0]);
    applyNodeState(node, { id: ID, units: 0, in: 100_000, sprung: 1 }, now);
    freshenNode(node);
    assert.deepEqual([node.units, node.depleted, node.triggeredAt], [1, false, 0]);
    // Its time down grows while the copy waits.
    const copy = createStreetCopy();
    takeObjs(copy, { t: 'objs', street: 'S', snap: true, objs: [{ id: ID, units: 0, in: 9000, sprung: 1000 }] }, now);
    assert.equal(stateFor(copy, ID, now + 2000).sprung, 3000);
  });

  /** street-objects-feature on a Baqala street with one Dust Trap. */
  function rig({ mode = 'multiplayer', spots = { [ID]: [500, 602] } } = {}) {
    const listeners = new Map();
    const sent = [];
    const client = {
      state: 'online',
      wanted: 'BAQ',
      on(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
        return () => {};
      },
      send(t, m) { sent.push({ t, ...m }); return true; },
      emit(type, detail) {
        for (const fn of listeners.get(type) || []) fn(detail);
      },
    };
    const entity = { key: 'dust_trap:0', classTsid: 'dust_trap', x: 500, y: 600, node: createResourceNode('dust_trap', { now: Date.now() }), target: null };
    const engine = {
      mode,
      started: true,
      streetTsid: 'BAQ',
      inv: {},
      pc: { energy: 200, imaginationUpgrades: [] },
      learnedSkills: [],
      interactables: [],
      data: {},
      activeBuffIds: () => [],
      setData(k, v) { this.data[k] = String(v); },
      toast() { throw new Error('a trap walked into says nothing'); },
      pushActivity() {},
      playSound() {},
      query(hook) {
        if (hook === 'realtimeClient') return client;
        if (hook === 'streetResourceNodes') return [{ key: entity.key, classTsid: entity.classTsid, node: entity.node, target: null, refresh() {}, ready: () => true, reason: () => '', moveTo: () => ({ x: 500, y: 600 }) }];
        return null;
      },
    };
    streetObjectsFeature._reset();
    streetObjectsFeature.onTick(16, 0, engine);
    client.emit('roster', { street: 'BAQ', players: [] });
    client.emit('msg:objs', { t: 'objs', street: 'BAQ', snap: true, objs: [], spots });
    return { engine, client, sent, entity };
  }

  it('the first one in springs it: the page asks the street and rolls only on its go-ahead', () => {
    const { engine, client, sent, entity } = rig();
    let rolls = 0;
    const go = () => {
      rolls += 1;
      // resource-nodes-feature triggerTrap runs on the ready trap the server sprang.
      assert.equal(entity.node.depleted, false);
      entity.node.depleted = true;
      entity.node.units = 0;
    };
    assert.equal(streetObjectsFeature.sharedTrapTrigger(entity.key, go, engine), true);
    assert.equal(streetObjectsFeature.sharedTrapTrigger(entity.key, go, engine), true, 'every frame in its box asks once');
    const asks = sent.filter((m) => m.t === 'obj_act');
    assert.equal(asks.length, 1);
    assert.deepEqual([asks[0].id, asks[0].verb], [ID, 'trigger']);
    assert.equal(rolls, 0, 'no roll before the answer');
    client.emit('msg:obj_ok', { t: 'obj_ok', req: asks[0].req, id: ID, verb: 'trigger', before: { id: ID, units: 1, in: 0 }, obj: { id: ID, units: 0, in: 181250, sprung: 1 }, reset: 180000 });
    assert.equal(rolls, 1);
    assert.equal(entity.node.depleted, true);
    assert.ok(Math.abs(entity.node.respawnAt - Date.now() - 181250) < 1000, 'down until the server raises it');
  });

  it('sprung first by someone else: nothing, and it shows down', () => {
    const { engine, client, sent, entity } = rig();
    let rolls = 0;
    streetObjectsFeature.sharedTrapTrigger(entity.key, () => { rolls += 1; }, engine);
    const ask = sent.find((m) => m.t === 'obj_act');
    client.emit('msg:obj_no', { t: 'obj_no', req: ask.req, id: ID, verb: 'trigger', code: 'not_ready', message: 'The Dust Trap is resetting.', obj: { id: ID, units: 0, in: 60000, sprung: 4000 } });
    assert.equal(rolls, 0);
    assert.equal(entity.node.depleted, true);
    assert.ok(Math.abs(entity.node.triggeredAt - (Date.now() - 4000)) < 1000);
    // Still in its box after a refusal: not asked again at once.
    assert.equal(streetObjectsFeature.sharedTrapTrigger(entity.key, () => { rolls += 1; }, engine), true);
    assert.equal(sent.filter((m) => m.t === 'obj_act').length, 1);
  });

  it('another player springs it: the street hears it go down', () => {
    const { engine, client, entity } = rig();
    client.emit('msg:objs', { t: 'objs', street: 'BAQ', objs: [{ id: ID, units: 0, in: 200000, sprung: 1 }] });
    streetObjectsFeature.onTick(16, Date.now(), engine);
    assert.equal(entity.node.depleted, true);
  });

  it('solo, or on a server that lays out no trap, it stays the player\'s own', () => {
    const solo = rig({ mode: 'solo' });
    assert.equal(streetObjectsFeature.sharedTrapTrigger(solo.entity.key, () => {}, solo.engine), null);
    const old = rig({ spots: {} });
    assert.equal(streetObjectsFeature.sharedTrapTrigger(old.entity.key, () => {}, old.engine), null);
    assert.equal(old.sent.filter((m) => m.t === 'obj_act').length, 0);
  });

  it('the trap asks the street before it rolls (resource-nodes-feature checkTraps)', () => {
    const src = readFileSync(join(root, 'public/js/features/resource-nodes-feature.js'), 'utf8');
    const body = src.slice(src.indexOf('function checkTraps('), src.indexOf('// Feature', src.indexOf('function checkTraps(')));
    assert.match(body, /engine\.query\?\.\('sharedTrapTrigger', entity\.key, go, engine\) != null\) continue;\s*triggerTrap\(engine, entity\);/);
  });
});
