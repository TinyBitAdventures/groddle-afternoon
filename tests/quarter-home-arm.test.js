/**
 * The home street's quarter arm (ours, Austin 2026-11-27; inventions home-quarter-arm): when the
 * street's owner holds a lot in Marylpole Mount Quarter, their one signpost (GATESIGN2: Back to Ur
 * on its top arm pointing left, the five friends' arms below, locations/home.js addNeighbor) also
 * carries the lot's name ("1105 Marylpole Mount Quarter", groups/quarter.js generate_pol_label) on
 * its top row, pointing right, opposite Back to Ur. Taking it goes to that block, standing at the
 * lot: for the owner and for a visitor alike. No lot, no arm. The friends' arms are unchanged.
 *
 * This runs the real session (home-street-mp-feature with homes-feature's scenes) on a fake Pixi,
 * as home-signpost-after-visit does, with the site's homes/<id>/street answers carrying `quarter`.
 * Run: node --test tests/quarter-home-arm.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { homeStreetMpFeature } from '../public/js/features/home-street-mp-feature.js?v=220e8dd1';
import { homesFeature } from '../public/js/features/homes-feature.js?v=2f2a9900';
import { quarterFeature } from '../public/js/features/quarter-feature.js?v=611772e4';
import { visitSceneTsid } from '../public/js/neighbours-mp.js?v=de82fd7d';
import { SIGN_FIRST_ARM_Y } from '../public/js/street-render.js?v=c1ac1f42';
import { QUARTER_TEXT, homeArm, lotArrival, normalizeHeld } from '../public/js/quarter.js?v=a38887ca';
import { clearStreetCache, clearStreetIndex } from '../public/js/street-loader.js?v=b8ea30df';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const pub = join(root, 'public');
const read = (p) => readFileSync(join(pub, p), 'utf8');
const street = (tsid) => JSON.parse(read(`assets/streets/${tsid}.json`));

const ME = { id: 1, name: 'Bo' };
const ADA = { id: 7, name: 'Ada' };
const ADA_VIEW = { owner: ADA, home: { owned: true, style: 'meadow' }, homes: { decor: { placed: [] }, cult: { items: [] } }, key: false, pass: '', random: false, butler: null };
const FRIENDS = [{ position: 0, id: 7, name: 'Ada' }, { position: 1, id: 9, name: 'Cy' }, { position: 2, id: 11, name: 'Di' }, { position: 3, id: 12, name: 'Ed' }, { position: 4, id: 13, name: 'Flo' }];
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('the arm\'s words and where it leads (js/quarter.js)', () => {
  it('names the lot as Glitch named a house, and only a real lot', () => {
    assert.deepEqual(homeArm({ street: 'GQRMM1100BLOCK1', lot: 1105 }), { label: '1105 Marylpole Mount Quarter', tsid: 'GQRMM1100BLOCK1', lot: 1105 });
    assert.equal(homeArm({ street: 'GQRMM1200BLOCK1', lot: 1205 }).label, '1205 Marylpole Mount Quarter');
    assert.equal(homeArm(null), null);
    assert.equal(homeArm({ street: 'GQRMM1100BLOCK1', lot: 1205 }), null, 'a lot on another block than named');
    assert.equal(homeArm({ lot: 1100 }), null);
    assert.deepEqual(normalizeHeld({ street: 'LQRMM1200BLOCK1', lot: 1295 }), { street: 'GQRMM1200BLOCK1', lot: 1295 });
  });

  it('stands you at the lot on its block (screen space, on the floor)', () => {
    for (const tsid of ['GQRMM1100BLOCK1', 'GQRMM1200BLOCK1']) {
      const s = street(tsid);
      for (const spot of s.quarter.lots) {
        const at = lotArrival(s, spot.lot);
        assert.deepEqual(at, { tsid, spawnX: spot.x - s.bounds.l, spawnY: spot.y - s.bounds.t }, `${spot.lot}`);
      }
    }
    assert.equal(lotArrival(street('GQRMM1100BLOCK1'), 1205), null);
  });
});

describe('the home street\'s signpost (home-street-mp-feature, the real session)', () => {
  const saved = {};
  let engine;
  let home;
  let answers;
  const went = [];

  before(() => {
    for (const k of ['document', 'fetch', 'groddleHomeStreet', 'GRODDLE_MP_BOOT', 'PIXI']) saved[k] = globalThis[k];
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.PIXI = fakePixi;
    answers = {};
    globalThis.fetch = async (url) => {
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      const out = answers[path] || {};
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => out };
    };
    const client = { state: 'online', me: ME, on: () => () => {}, send: () => true };
    home = { inHome: false, room: 'street', style: 'meadow' };
    const entityLayer = new Display();
    const data = {};
    engine = {
      mode: 'multiplayer',
      started: true,
      PIXI: fakePixi,
      entityLayer,
      data,
      streetTsid: 'GLI32N0F1UD114O',
      player: { x: 100, y: 870 },
      inv: [],
      pc: { name: ME.name },
      query: (hook, ...args) => {
        if (hook === 'realtimeClient') return client;
        if (hook === 'quarterGo') { went.push(args[0]); return true; }
        return null;
      },
      param: () => null,
      homeContext: () => home,
      setData(k, v) { data[k] = v; },
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
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  async function goHome() {
    engine.clear();
    home = { inHome: true, room: 'street', style: 'meadow' };
    homesFeature.homeScene('street', engine).spawnTargets();
    engine.streetTsid = 'RH_HOME_EXT';
    homeStreetMpFeature.onTick(16, 1000 + Math.random(), engine);
    await wait(5);
    // A fresh load of my own street's answer each time (loadOwn waits 4 s between loads).
    homeStreetMpFeature.onTick(16, 9000 + Math.random() * 1000, engine);
    await wait(5);
  }

  async function visitAda() {
    engine.clear();
    home = { inHome: false, room: 'street', style: 'meadow' };
    engine.streetTsid = visitSceneTsid(ADA.id, 'street');
    assert.equal(homeStreetMpFeature.homeStreetVisit({ owner: ADA.id, name: ADA.name, room: 'street', key: false, view: ADA_VIEW, spots: {} }, engine), true);
    await wait(5);
  }

  /** The friends' signpost's box (its boards: the friends' arms and the quarter arm). */
  function friendsBox() {
    return engine.entityLayer.children.find((c) => c.zIndex === 21 && Array.isArray(c.signBoards));
  }

  it('with a lot: the arm on the top row, pointing right, opposite Back to Ur; the friends\' arms unchanged', async () => {
    answers = { [`homes/${ME.id}/street`]: { signpost: FRIENDS, poles: [], restores: [], quarter: { street: 'GQRMM1100BLOCK1', lot: 1105 } } };
    await goHome();
    const session = globalThis.groddleHomeStreet;
    assert.equal(engine.data.hsQuarterArm, '1105 Marylpole Mount Quarter');
    assert.deepEqual(session.act('signpost'), ['sign_go_0', 'sign_go_1', 'sign_go_2', 'sign_go_3', 'sign_go_4', 'sign_quarter', 'sign_edit']);
    const boards = friendsBox().signBoards;
    const friends = boards.filter((b) => b.verbId.startsWith('sign_go_'));
    // The five friends' arms: their slots, sides and number keys as before (2 to 6, under Back to Ur's 1).
    assert.equal(friends.length, 5);
    friends.forEach((b, i) => {
      assert.equal(b.y, -200 + i * 28 + 32, `friend ${i}'s slot`);
      assert.equal(b.hitArea.x < 0, Boolean(i % 2), `friend ${i}'s side`);
      assert.equal(b.key, String(i + 2));
    });
    const arm = boards.find((b) => b.verbId === 'sign_quarter');
    assert.ok(arm, 'the quarter arm is a board of its own');
    assert.equal(arm.y, SIGN_FIRST_ARM_Y, 'the top row, where Back to Ur is');
    assert.equal(arm.hitArea.x, 0, 'pointing right (Back to Ur points left)');
    assert.ok(arm.rotation < 0, 'tilted as a right arm');
    assert.equal(arm.key, '7', 'its number after the friends\'');
    assert.equal(arm.tip, QUARTER_TEXT.armVerb('1105 Marylpole Mount Quarter'));
    // It clears the friends' top arm (slot 0, a right arm too) below it.
    assert.ok(arm.y + 15 < friends[0].y - 15, 'above the first friend\'s arm');
    // Taking it goes to the lot (quarter-feature quarterGo).
    went.length = 0;
    session.act('signpost', 'sign_quarter');
    assert.deepEqual(went, [{ street: 'GQRMM1100BLOCK1', lot: 1105 }]);
  });

  it('a visitor sees the owner\'s arm, and it takes them to the owner\'s lot', async () => {
    answers = { [`homes/${ADA.id}/street`]: { signpost: [{ position: 0, ...ME }], poles: [], restores: [], sales: [], quarter: { street: 'GQRMM1200BLOCK1', lot: 1205 } } };
    await visitAda();
    const session = globalThis.groddleHomeStreet;
    assert.equal(engine.data.hsQuarterArm, '1205 Marylpole Mount Quarter');
    assert.deepEqual(session.act('signpost'), ['sign_go_0', 'sign_quarter']);
    const arm = friendsBox().signBoards.find((b) => b.verbId === 'sign_quarter');
    assert.equal(arm.key, '3', 'after the one friend\'s arm');
    went.length = 0;
    session.act('signpost', 'sign_quarter');
    assert.deepEqual(went, [{ street: 'GQRMM1200BLOCK1', lot: 1205 }]);
  });

  it('no lot: no arm, and the five friends\' arms as before', async () => {
    answers = { [`homes/${ADA.id}/street`]: { signpost: FRIENDS, poles: [], restores: [], sales: [], quarter: null } };
    await visitAda();
    const session = globalThis.groddleHomeStreet;
    assert.deepEqual(session.act('signpost'), ['sign_go_0!', 'sign_go_1', 'sign_go_2', 'sign_go_3', 'sign_go_4']);
    assert.equal(engine.data.hsQuarterArm, '');
    const boards = friendsBox().signBoards;
    assert.equal(boards.length, 5);
    assert.deepEqual(boards.map((b) => b.verbId), ['sign_go_0', 'sign_go_1', 'sign_go_2', 'sign_go_3', 'sign_go_4']);
  });

  it('the arm is Tiny Speck\'s signpost arm, as the friends\' are', () => {
    const src = read('js/features/quarter-feature.js');
    const fn = src.slice(src.indexOf('export function addQuarterArm('), src.indexOf('/** Solo: the arm drawn'));
    assert.match(src, /const SIGN_ARM_ART = 'assets\/ui\/signpost\/signpost_arm\.webp';/);
    assert.match(read('js/features/home-street-mp-feature.js'), /const SIGN_ART = \{ arm: 'assets\/ui\/signpost\/signpost_arm\.webp' \};/, 'the friends\' arms\' art');
    assert.match(fn, /new PIXI\.Sprite\(textureFromUrl\(SIGN_ARM_ART\)\)/);
    assert.doesNotMatch(fn, /Graphics/);
    assert.match(fn, /row\.y = SIGN_FIRST_ARM_Y;/);
    assert.match(read('js/features/home-street-mp-feature.js'), /const arm = addQuarterArm\(PIXI, box, holder, held, \{ key, verbId: 'sign_quarter' \}\);/);
  });
});

describe('solo: your own lot\'s arm on your home street (features/quarter-feature.js)', () => {
  const saved = {};
  before(() => {
    for (const k of ['document', 'PIXI']) saved[k] = globalThis[k];
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null };
    globalThis.PIXI = fakePixi;
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  function soloEngine() {
    const entityLayer = new Display();
    const targets = new Set();
    const data = {};
    const engine = {
      mode: 'solo', started: true, PIXI: fakePixi, entityLayer, data, targets, inv: [], pc: { name: 'Ur' },
      streetTsid: 'RH_HOME_EXT', player: { x: 100, y: 870 },
      homeContext: () => ({ inHome: true, room: 'street', style: 'meadow', owned: true }),
      query: () => null, param: () => null, setData(k, v) { data[k] = v; }, toast() {}, pushActivity() {}, save() {}, achievement() {},
      register(t) { targets.add(t); return t; },
      unregister(t) { targets.delete(t); },
    };
    homesFeature.homeScene('street', engine).spawnTargets();
    return engine;
  }
  const armBox = (engine) => engine.entityLayer.children.find((c) => c.zIndex === 21 && Array.isArray(c.signBoards));

  it('no lot: no arm; with your lot: the arm on the top row pointing right, number 2 after Back to Ur', () => {
    const engine = soloEngine();
    quarterFeature.restore(undefined, engine);
    quarterFeature.onTick(16, 1, engine);
    assert.equal(armBox(engine), undefined, 'no lot, no arm');
    quarterFeature.restore({ lot: 1255 }, engine);
    quarterFeature.onTick(16, 2, engine);
    const box = armBox(engine);
    assert.ok(box, 'the arm');
    assert.equal(box.signBoards.length, 1);
    const [arm] = box.signBoards;
    assert.equal(arm.y, SIGN_FIRST_ARM_Y);
    assert.equal(arm.hitArea.x, 0, 'pointing right');
    assert.equal(arm.key, '2');
    assert.equal(engine.data.quarterArm, '1255 Marylpole Mount Quarter');
    const target = [...engine.targets].find((t) => t.classId === 'quarter_home_arm');
    assert.equal(target.sprite, box);
    assert.deepEqual(quarterFeature.verbsFor(target, engine).map((v) => [v.id, v.label]), [['quarter_arm_go', 'Go to 1255 Marylpole Mount Quarter']]);
    // Taking it is quarterGo's trip (its own test below): the verb is the arm's.
    assert.equal(quarterFeature.runVerb(target, 'quarter_arm_go', engine), true);
    assert.equal(quarterFeature.runVerb({ quarterLot: 0 }, 'quarter_arm_go', engine), false);
    // Leaving home takes it away.
    quarterFeature.onStreetClear(engine);
    assert.equal(engine.data.quarterArm, '');
  });
});

describe('quarterGo: to the block, standing at the lot (features/quarter-feature.js)', () => {
  const saved = {};
  before(() => {
    saved.fetch = globalThis.fetch;
    clearStreetIndex();
    clearStreetCache();
    // The street loader reads the index and the block from the game's own files.
    globalThis.fetch = async (url) => {
      const file = join(pub, String(url).replace(/^\/+/, '').replace(/\?.*$/, ''));
      const text = readFileSync(file, 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(text) };
    };
  });
  after(() => {
    globalThis.fetch = saved.fetch;
    clearStreetIndex();
    clearStreetCache();
  });

  it('enters the lot\'s block at the lot, from home or a visit (engine.enter)', async () => {
    const trips = [];
    const engine = { enter: async (tsid, opts) => { trips.push([tsid, opts]); return true; }, toast() {}, pushActivity() {}, setData() {} };
    assert.equal(quarterFeature.quarterGo({ street: 'GQRMM1200BLOCK1', lot: 1235 }, engine), true);
    await wait(20);
    const s = street('GQRMM1200BLOCK1');
    const spot = s.quarter.lots.find((l) => l.lot === 1235);
    assert.deepEqual(trips, [['GQRMM1200BLOCK1', { spawnX: spot.x - s.bounds.l, spawnY: spot.y - s.bounds.t }]]);
    assert.equal(quarterFeature.quarterGo(null, engine), null, 'no lot: not this feature\'s');
  });
});
