/**
 * Player report 114 (Friendly, 2026-11-06): "After going directly from my home street to your
 * home street and then back to mine via your signpost - my signpost shows the destination to
 * your house with a lock beside it and won't allow me to go to your house."
 *
 * home-street-mp-feature locks the arm to the home you stand on (you are there already). It read
 * that from its own visit, which is cleared only by left() on a street clear, and going home
 * clears the old street before the street id changes (game.js renderHomeScene), so the visit
 * outlived the trip home and your own post kept its arm to that friend locked. The lock now asks
 * where() (the visit scene you stand on), as the post's other verbs do. The visit itself is kept
 * until the next street clear, as before: a purchase on the visit that settles after you left
 * still finds it (bought()).
 *
 * This runs the real session (home-street-mp-feature with homes-feature's scenes) on a fake Pixi.
 * Run: node --test tests/home-signpost-after-visit.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { homeStreetMpFeature } from '../public/js/features/home-street-mp-feature.js?v=1f7449b1';
import { homesFeature } from '../public/js/features/homes-feature.js?v=38327b85';
import { visitSceneTsid } from '../public/js/neighbours-mp.js?v=8d032640';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const ME = { id: 1, name: 'Bo' };
const ADA = { id: 7, name: 'Ada' };
const ADA_VIEW = { owner: ADA, home: { owned: true, style: 'meadow' }, homes: { decor: { placed: [] }, cult: { items: [] } }, key: false, pass: '', random: false, butler: null };
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('your signpost after a visit (report 114)', () => {
  const saved = {};
  let engine;
  let home;

  before(() => {
    for (const k of ['document', 'fetch', 'groddleHomeStreet', 'GRODDLE_MP_BOOT', 'PIXI']) saved[k] = globalThis[k];
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.PIXI = fakePixi;
    // Each post has an arm to the other's home (the site's homes/<id>/street).
    globalThis.fetch = async (url) => {
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      let out = {};
      if (path === `homes/${ME.id}/street`) out = { signpost: [{ position: 0, ...ADA }], poles: [], restores: [] };
      if (path === `homes/${ADA.id}/street`) out = { signpost: [{ position: 0, ...ME }], poles: [], restores: [], sales: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => out };
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
      // game.js clearWorldEntities: sprites off the stage, then the features' onStreetClear.
      clear() {
        for (const s of [...entityLayer.children]) entityLayer.removeChild(s);
        homesFeature.onStreetClear(engine);
        homeStreetMpFeature.onStreetClear(engine);
      },
    };
    homeStreetMpFeature.onTick(16, 1, engine);
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  /** game.js renderHomeScene: the old street goes first, then the home scene is built (its tsid after). */
  async function goHome() {
    engine.clear();
    home = { inHome: true, room: 'street', style: 'meadow' };
    homesFeature.homeScene('street', engine).spawnTargets();
    engine.streetTsid = 'RH_HOME_EXT';
    homeStreetMpFeature.onTick(16, 1000, engine);
    await wait(5);
    homeStreetMpFeature.onTick(16, 2000, engine);
  }

  /** neighbours-mp-feature show('street'): the scene, then homeStreetVisit. */
  async function visitAda() {
    engine.clear();
    home = { inHome: false, room: 'street', style: 'meadow' };
    engine.streetTsid = visitSceneTsid(ADA.id, 'street');
    assert.equal(homeStreetMpFeature.homeStreetVisit({ owner: ADA.id, name: ADA.name, room: 'street', key: false, view: ADA_VIEW, spots: {} }, engine), true);
    await wait(5);
  }

  it('home, to Ada\'s home by your post, and back home by hers: your arm to Ada still goes', async () => {
    const session = globalThis.groddleHomeStreet;
    assert.ok(session, 'the session started');
    await goHome();
    assert.deepEqual(session.act('signpost'), ['sign_go_0', 'sign_edit'], 'at home: the arm to Ada, and Edit');
    await visitAda();
    assert.deepEqual(session.act('signpost'), ['sign_go_0'], 'on Ada\'s street: her arm back to you');
    await goHome();
    assert.ok(session.visit, 'the visit is kept until the next street clear (a late purchase still finds it)');
    assert.deepEqual(session.act('signpost'), ['sign_go_0', 'sign_edit'], 'the arm to Ada is not locked');
  });

  it('on Ada\'s street an arm to Ada herself stays locked (you are there)', async () => {
    const session = globalThis.groddleHomeStreet;
    const was = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      const out = path === `homes/${ADA.id}/street` ? { signpost: [{ position: 0, ...ADA }, { position: 1, ...ME }], poles: [], restores: [], sales: [] } : {};
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => out };
    };
    try {
      await visitAda();
      assert.deepEqual(session.act('signpost'), ['sign_go_0!', 'sign_go_1']);
    } finally {
      globalThis.fetch = was;
    }
  });
});
