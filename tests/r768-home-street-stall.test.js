/**
 * #768: the home street's neighbours request (the site's homes/<me>/street) had no time limit, and
 * its loading flag turned every later load away while it waited, so one request that never answered
 * left the street without its signpost arms for the session. It now goes through js/load-retry.js:
 * a stalled ask is stopped after 20 s and asked again after 1 s, and the arms come in.
 *
 * This runs the real session (home-street-mp-feature with homes-feature's scenes) on a fake Pixi.
 * Run: node --test tests/r768-home-street-stall.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it, mock } from 'node:test';

import { homeStreetMpFeature } from '../public/js/features/home-street-mp-feature.js?v=1640f3d3';
import { homesFeature } from '../public/js/features/homes-feature.js?v=7c7ee524';
import { LOAD_TIMEOUT_MS, RETRY_WAITS_MS } from '../public/js/load-retry.js?v=24823577';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const ME = { id: 1, name: 'Bo' };
const ADA = { id: 7, name: 'Ada' };
const flush = async (n = 12) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

describe('#768: a home street request that never answers', () => {
  const saved = {};
  let engine;
  let home;
  const asks = [];

  before(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 5_000_000 });
    for (const k of ['document', 'fetch', 'groddleHomeStreet', 'GRODDLE_MP_BOOT', 'PIXI']) saved[k] = globalThis[k];
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.PIXI = fakePixi;
    // The first ask for my street hangs (no answer, no error); every other ask answers.
    globalThis.fetch = (url) => {
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      asks.push(path);
      if (path === `homes/${ME.id}/street` && asks.filter((p) => p === path).length === 1) return new Promise(() => {});
      const out = path === `homes/${ME.id}/street` ? { signpost: [{ position: 0, ...ADA }], poles: [], restores: [] } : {};
      return Promise.resolve({ status: 200, ok: true, headers: { get: () => null }, json: async () => out });
    };
    const client = { state: 'online', me: ME, on: () => () => {}, send: () => true };
    home = { inHome: false, room: 'street', style: 'meadow' };
    const entityLayer = new Display();
    engine = {
      mode: 'multiplayer',
      started: true,
      PIXI: fakePixi,
      entityLayer,
      streetTsid: 'GLI32N0F1UD114O',
      player: { x: 100, y: 870 },
      inv: [],
      pc: { name: ME.name },
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      param: () => null,
      homeContext: () => home,
      setData() {},
      toast() {},
      pushActivity() {},
      achievement() {},
      save() {},
      register(t) { return t; },
      clear() {
        for (const s of [...entityLayer.children]) entityLayer.removeChild(s);
        homesFeature.onStreetClear(engine);
        homeStreetMpFeature.onStreetClear(engine);
      },
    };
    homeStreetMpFeature.onTick(16, 1, engine);
  });

  after(() => {
    mock.timers.reset();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('is asked again after its limit, and the signpost gets its arm to Ada', async () => {
    const session = globalThis.groddleHomeStreet;
    assert.ok(session, 'the session started');
    engine.clear();
    home = { inHome: true, room: 'street', style: 'meadow' };
    homesFeature.homeScene('street', engine).spawnTargets();
    engine.streetTsid = 'RH_HOME_EXT';
    homeStreetMpFeature.onTick(16, 1000, engine);
    await flush();
    assert.equal(session.own.loading, true, 'waiting on the stalled ask');
    assert.equal(session.own.neighbors, null, 'no arms yet');
    mock.timers.tick(LOAD_TIMEOUT_MS);
    await flush();
    mock.timers.tick(RETRY_WAITS_MS[0]);
    await flush();
    assert.equal(asks.filter((p) => p === `homes/${ME.id}/street`).length >= 2, true, 'asked again');
    assert.equal(session.own.loading, false, 'the loading flag lets go');
    assert.deepEqual(session.own.neighbors.map((n) => n.name), ['Ada']);
    assert.deepEqual(session.act('signpost'), ['sign_go_0', 'sign_edit'], 'the arm to Ada is on the post');
  });
});
