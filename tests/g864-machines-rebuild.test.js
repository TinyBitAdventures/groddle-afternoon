/**
 * #404 (G864): machines on a home vanished for a moment, and could not be used, whenever the home
 * rebuilt in place (game.js refreshHomeScene -> clearWorldEntities -> onStreetClear): the feature
 * threw its machines away and fetched them again. Now a rebuild of the same place draws the machines
 * already loaded at once, and the fetch that follows still brings any real change.
 * This runs the real session in multiplayer in a Community Machine Room (the same path as a home).
 * Run: node --test tests/g864-machines-rebuild.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { homeMachinesFeature } from '../public/js/features/home-machines-feature.js?v=5833bdab';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const ROOM = 'GCR101Q98A12EHH';
const A = 'hm-00000000000000a1';
const B = 'hm-00000000000000b2';
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('machines through a rebuild in place (#404)', () => {
  const saved = {};
  let engine;
  let answers;
  let fetches = 0;

  before(() => {
    for (const k of ['document', 'fetch', 'GRODDLE_MP_BOOT', 'groddleHomeMachines', 'PIXI']) saved[k] = globalThis[k];
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), body: new FakeEl('body'), head: new FakeEl('head'), getElementById: () => null, querySelector: () => null };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.PIXI = fakePixi;
    answers = [];
    globalThis.fetch = (url) => {
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      if (!path.startsWith('machine-rooms/')) return Promise.resolve({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({ placed: [], taken: [] }) });
      fetches += 1;
      // Each room fetch waits until the test hands it an answer.
      return new Promise((resolve) => answers.push((body) => resolve({ status: 200, ok: true, headers: { get: () => null }, json: async () => body })));
    };
    const client = { state: 'online', me: { id: 5, name: 'Bo' }, on() { return () => {}; }, send() { return true; } };
    const targets = new Set();
    engine = {
      mode: 'multiplayer',
      started: true,
      // No Rectangle: the machines' sheets stay unloaded (their icons stand in).
      PIXI: { Sprite: Display, Graphics: Display },
      entityLayer: new Display(),
      streetTsid: ROOM,
      platforms: [],
      inv: {},
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      param: () => null,
      transientInstance: () => false,
      homeContext: () => ({ inHome: false }),
      setData() {},
      toast() {},
      register(t) { targets.add(t); return t; },
      unregister(t) { targets.delete(t); },
      targets,
    };
    homeMachinesFeature._reset();
  });

  after(() => {
    homeMachinesFeature._reset();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  const tick = () => homeMachinesFeature.onTick(16, Date.now(), engine);
  const shown = () => [...engine.targets].map((t) => t.homeMachine).sort();
  const machine = (id, place, rx) => ({ id, class: 'blockmaker', place, rx, fuel: 10 });

  it('draws the machines it had at once, then takes the fetch\'s news', async () => {
    tick();
    const session = globalThis.groddleHomeMachines;
    assert.ok(session, 'the session started');
    const place = session.debug().at?.place;
    assert.ok(place, 'in a machine room');
    assert.equal(answers.length, 1, 'the room is fetched');
    answers.shift()({ now: Date.now(), machines: [machine(A, place, -300), machine(B, place, 300)] });
    await wait(5);
    assert.deepEqual(shown(), [A, B]);

    // The scene is rebuilt in place: the street is cleared, then the next frame ticks.
    homeMachinesFeature.onStreetClear(engine);
    assert.deepEqual(shown(), [], 'cleared with the street');
    tick();
    assert.deepEqual(shown(), [A, B], 'drawn again at once, before any answer');
    assert.equal(session.state().where?.place, place, 'and usable: the home is known');
    assert.equal(answers.length, 1, 'a fetch still goes for real changes');

    // The fetch says one was picked up meanwhile.
    answers.shift()({ now: Date.now(), machines: [machine(A, place, -300)] });
    await wait(5);
    assert.deepEqual(shown(), [A]);
  });

  it('a different street starts from nothing', async () => {
    homeMachinesFeature.onStreetClear(engine);
    engine.streetTsid = 'GLI2V0UN7RD1T2J';
    tick();
    assert.deepEqual(shown(), []);
    const before = fetches;
    engine.streetTsid = ROOM;
    tick();
    assert.deepEqual(shown(), [], 'coming back later waits for the fetch (nothing kept from before)');
    assert.equal(fetches, before + 1);
    answers.shift()({ now: Date.now(), machines: [] });
    await wait(5);
  });
});
