/**
 * Report #689: a home machine's Make closed its panel as if the job had started while the realtime
 * client was not online (after a back/forward cache trip: tests/bfcache-realtime-689.test.js), so
 * the planks seemed to go in and nothing happened. startJob said yes in multiplayer before anything
 * was sent; only a 3.2 s "You need to be online to do that." came after. Now it says no when the act
 * cannot go, so game.js runMakeCraft keeps the panel open with the reason, as a refusal in solo does.
 * Run: node --test tests/machine-make-offline-689.test.js
 */
import assert from 'node:assert/strict';
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { homeMachinesFeature } from '../public/js/features/home-machines-feature.js?v=4a00bef2';
import { RECIPE_CATALOG, setRecipeCatalog } from '../public/js/making.js?v=dc595568';
import { MAX_FUEL } from '../public/js/machines.js?v=93a736f2';
import { fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));

describe('#689: a home machine\'s Make offline keeps the panel open', () => {
  const ROOM = 'GCR101Q98A12EHH';
  const saved = {};
  let engine;
  let client;
  const toasts = [];
  const sent = [];
  let session;
  let recipeEntry = null;

  beforeAll(async () => {
    for (const k of ['document', 'fetch', 'GRODDLE_MP_BOOT', 'PIXI', 'groddleHomeMachines']) saved[k] = globalThis[k];
    setRecipeCatalog(JSON.parse(read('public/assets/content/recipes.json')));
    recipeEntry = Object.entries(RECIPE_CATALOG).find(([, r]) => r.tool === 'woodworker');
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, querySelector: () => null, head: { append() {} }, body: { append() {} } };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.PIXI = fakePixi;
    const machine = { id: 'hm-00000000000000ab', class: 'woodworker', place: 'mr:meadow', rx: 300, fuel: MAX_FUEL, music: true, job: null, waiting: [], owner: 9 };
    globalThis.fetch = async (url) => {
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      const out = path.startsWith('machine-rooms/') ? { now: Date.now(), machines: [machine] } : { machines: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => out, text: async () => '' };
    };
    client = { state: 'online', me: { id: 9, name: 'Bo' }, on() { return () => {}; }, send(kind, payload) { if (client.state !== 'online') return false; sent.push({ kind, ...payload }); return true; } };
    engine = {
      mode: 'multiplayer',
      started: true,
      PIXI: fakePixi,
      entityLayer: fakePixi.Container ? new fakePixi.Container() : null,
      streetTsid: ROOM,
      player: { x: 400, y: 0 },
      inv: { slots: [] },
      pc: { imaginationUpgrades: [] },
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      param: () => null,
      homeContext: () => ({ inHome: false }),
      transientInstance: () => false,
      setData() {},
      toast: (text) => toasts.push(text),
      pushActivity() {},
      register: (t) => t,
      unregister() {},
    };
    homeMachinesFeature._reset();
    homeMachinesFeature.onTick(16, 0, engine);
    session = globalThis.groddleHomeMachines;
    for (let i = 0; i < 20 && !session?.state().machines.length; i += 1) {
      await flush();
      homeMachinesFeature.onTick(16, i * 16, engine);
    }
  });

  afterAll(() => {
    homeMachinesFeature._reset();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('the room\'s machine is loaded (the harness)', () => {
    assert.ok(recipeEntry, 'a Woodworker recipe');
    assert.equal(session?.state().machines.length, 1, JSON.stringify(session?.state()));
  });

  it('offline: false (the panel stays open) with the reason; online: the act goes', async () => {
    const [key] = recipeEntry;
    client.state = 'stopped';
    toasts.length = 0;
    assert.equal(session.make(0, key, 1), false, 'game.js runMakeCraft closes the panel unless startJob says false');
    // G1306: one wording for every shared act: "Reconnecting..." while the client comes back.
    assert.deepEqual(toasts, ['Reconnecting...']);
    client.state = 'replaced';
    toasts.length = 0;
    assert.equal(session.make(0, key, 1), false);
    assert.deepEqual(toasts, ['You need to be online to do that.'], 'an ended client: the machines\' words');
    assert.equal(sent.length, 0);
    client.state = 'online';
    assert.equal(session.make(0, key, 1), true);
    await flush();
    await flush();
    assert.equal(sent.at(-1)?.kind, 'home_machine');
    assert.equal(sent.at(-1)?.verb, 'use');
  });

  it('game.js closes the Make panel only when startJob is not false', () => {
    assert.match(read('public/game.js'), /if \(opts\.station\.startJob\(\{ key, recipe, qty: n, waitMultiplier \}\) !== false\) closeMakePanel\(\);/);
  });
});

