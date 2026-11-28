/**
 * Player report #465: "Machines in yard are no longer working: You need to be in their home or a
 * Community Machine Room to do that", and the same on Pick up. The server answers that when it
 * does not have the player on HOME_<owner> (groddle-afternoon-server home_machines.go machinePlace).
 * A visit left by the Home button or /home stayed set: game.js renderHomeScene runs no feature
 * onStreetEnter, so neighbours-mp's left() never heard, and its street() answered '' for a visit
 * whose scene was gone, so realtime-feature left the shared street and stayed off it at home.
 * A visit whose scene is gone and none on its way is over now; a scene on its way still shares nothing.
 * The machines also stand on the home street again and ask once more on that refusal.
 *
 * Run: node --test tests/g934-home-after-visit.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { neighboursMpFeature } from '../public/js/features/neighbours-mp-feature.js?v=8fa9f2e3';
import { createErrorOnce, createFeatureHost, reportPageError } from '../public/js/feature-host.js?v=b87e2cbc';
import { pageErrorLine, rememberError } from '../public/js/features/bug-report-feature.js?v=4af2f508';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function fakeClient() {
  const listeners = new Map();
  return {
    state: 'online',
    me: { id: 1, name: 'Bo' },
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    send() { return true; },
  };
}

const VIEW = {
  owner: { id: 7, name: 'Ada' },
  home: { owned: true, style: 'meadow' },
  homes: { decor: { placed: [] }, cult: { items: [] } },
  key: false,
  pass: { token: 'pass.sig', expiresIn: 1800 },
  butler: { owned: true, name: 'Pip', parts: {}, post: null },
};

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('home from a visit by the Home button: back on your own home street (#465)', () => {
  const saved = {};
  let engine;
  let client;
  let home = { inHome: false, room: 'street' };

  before(() => {
    for (const k of ['document', 'fetch', 'groddleNeighbours', 'GRODDLE_MP_BOOT', 'PIXI']) saved[k] = globalThis[k];
    const body = new FakeEl('body');
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body, getElementById: () => null, querySelector: () => null };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.PIXI = fakePixi;
    globalThis.fetch = async (url) => {
      // Only the site answers; the Butler's rig and art stay unloaded (the box and hit area stand without them).
      if (!String(url).startsWith('https://groddle.localhost/wp-json/')) return { status: 404, ok: false, headers: { get: () => null }, json: async () => null };
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      const out = path === 'homes/7' ? VIEW : path === 'homes/visitors' ? { allow: false } : { given: [], received: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => out };
    };
    client = fakeClient();
    const entityLayer = new Display();
    engine = {
      mode: 'multiplayer',
      started: true,
      PIXI: fakePixi,
      entityLayer,
      groundY: 870,
      streetTsid: 'GLI32N0F1UD114O',
      street: { label: 'Archimedes Acres', hubName: 'Groddle Meadow' },
      player: { x: 100, y: 870 },
      interactables: [],
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      param: () => null,
      homeContext: () => home,
      transientInstance: () => false,
      setData() {},
      toast() {},
      pushActivity() {},
      achievement() {},
      say() {},
      register(t) { engine.interactables.push(t); return t; },
      // game.js enterScene / enter: the street's sprites leave the stage (clearWorldEntities), then the features hear of it.
      clear() {
        for (const s of [...entityLayer.children]) entityLayer.removeChild(s);
        neighboursMpFeature.onStreetClear?.(engine);
        engine.interactables = [];
      },
      enterScene(scene) { engine.clear(); engine.streetTsid = scene.tsid; },
      async enter(tsid) { engine.clear(); engine.streetTsid = tsid; neighboursMpFeature.onStreetEnter(engine.street, engine); },
    };
    neighboursMpFeature.onTick(16, 0, engine);
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  async function visit() {
    await wait(5);
    const session = globalThis.groddleNeighbours;
    assert.ok(session, 'the session started');
    engine.streetTsid = 'GLI32N0F1UD114O';
    engine.player.x = 100;
    assert.equal(await session.visitHome(7), true);
    const b = session.butler;
    assert.ok(b?.box && !b.box.destroyed, 'the owner\'s Butler stands on the visit');
    assert.ok(Math.abs(engine.player.x - b.box.x) > 550, 'too far to be greeted on arrival');
    return { session, b };
  }


  it('the trip home by the Home button puts you back on HOME_<you>', async () => {
    await wait(5);
    const session = globalThis.groddleNeighbours;
    assert.ok(session, 'the session started');
    assert.equal(await session.visitHome(7), true);
    assert.equal(engine.streetTsid, 'MPH_7');
    assert.equal(neighboursMpFeature.realtimeStreet(engine), 'HOME_7', 'on the visit: the owner\'s street');
    // game.js renderHomeScene: the street clears and the home scene comes, with no onStreetEnter.
    engine.clear();
    engine.streetTsid = 'RH_HOME_EXT';
    home = { inHome: true, room: 'street' };
    assert.equal(neighboursMpFeature.realtimeStreet(engine), 'HOME_1', 'your own home street, not none');
    assert.equal(session.visit, null, 'the visit is over');
    home = { inHome: true, room: 'interior' };
    engine.streetTsid = 'RH_HOME_INT';
    assert.equal(neighboursMpFeature.realtimeStreet(engine), 'HOUSE_1');
  });

  it('a visit on its way (its scene not entered yet) still shares nothing', async () => {
    const session = globalThis.groddleNeighbours;
    home = { inHome: false, room: 'street' };
    engine.streetTsid = 'GLI32N0F1UD114O';
    const seen = [];
    const enter = engine.enterScene;
    engine.enterScene = (scene) => { seen.push(neighboursMpFeature.realtimeStreet(engine)); enter(scene); };
    assert.equal(await session.visitHome(7), true);
    engine.enterScene = enter;
    assert.deepEqual(seen, [null], 'between the street and the visit: no shared street');
    assert.ok(session.visit, 'the visit itself stays');
    assert.equal(neighboursMpFeature.realtimeStreet(engine), 'HOME_7');
  });

  it('home machines stand on the home street again and retry once on the away refusal', () => {
    const src = read('public/js/features/home-machines-feature.js');
    const fn = src.slice(src.indexOf('function retryAway('), src.indexOf('function onDone('));
    assert.match(fn, /msg\.why !== 'away' \|\| !ask \|\| ask\.retried \|\| home\?\.kind !== 'own'/);
    assert.match(fn, /client\.join\(\{ street, \.\.\.poseOf\(engine\.player\), look: lookOf\(engine\) \}\)/);
    assert.match(fn, /send\(ask\.verb, [^\n]+\{ retried: true \}\)/);
    const done = src.slice(src.indexOf('function onDone('), src.indexOf('function heldOf('));
    assert.ok(done.indexOf('retryAway(msg, ask)') < done.indexOf('say(String(msg.text'), 'the first refusal is not shown');
  });
});
