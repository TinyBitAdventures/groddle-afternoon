/**
 * Player report 116 (Friendly, 2026-11-06, Safari): "my screen shows that im at my house ...
 * the location at the top of my screen [says Archimedes Acres] ... couldn't move ... my
 * focusing orb cooldown is stuck". The report's error list: greeting@neighbours-mp-feature.js
 * :589 tickButler@:606. Leaving a visited home street cleared the visit but kept the owner's
 * Butler (vb): game.js clearWorldEntities only takes the sprites off the stage, so tickButler
 * went on ticking it on the next street, and the first time the player came within 550 px of
 * where it had stood (never greeted on the visit: it waits 660 px right of the house) the
 * greeting read visit.key with no visit. Nothing caught the throw, and Pixi's ticker asks for
 * the next frame only after its listeners return, so the view froze for good while the DOM
 * top bar moved on.
 *
 * The safety net: the feature host runs each feature's onTick in its own guard, and game.js runs
 * the frame's work in one, so a throw is reported once (console and the report form's error
 * list, with the feature's id) and the loop goes on.
 *
 * This runs the real visit (neighbours-mp-feature's visitHome and the owner's street from
 * homes-feature) against a fake Pixi, leaves by each way out, and walks to the old Butler's x.
 * Run: node --test tests/visitor-butler-leaves.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { neighboursMpFeature } from '../public/js/features/neighbours-mp-feature.js?v=79d8f2e5';
import { createErrorOnce, createFeatureHost, reportPageError } from '../public/js/feature-host.js?v=127e0a3c';
import { pageErrorLine, rememberError } from '../public/js/features/bug-report-feature.js?v=249f473f';
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

describe('the visited Butler stays on its street (report 116)', () => {
  const saved = {};
  let engine;
  let client;

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
      homeContext: () => ({ inHome: false, room: 'street' }),
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

  /** Walk to where the Butler stood, on whatever street you are on now, for a couple of seconds. */
  function walkToOldButler(x) {
    engine.player.x = x;
    for (let i = 0; i < 120; i += 1) neighboursMpFeature.onTick(1000 / 60, Date.now(), engine);
  }

  it('Go back (the signpost\'s Back to Ur): the Butler goes with the visit', async () => {
    const { session, b } = await visit();
    await session.runVerb({ classId: 'neighbours_gate' }, 'go_back');
    await wait(1);
    assert.equal(session.visit, null);
    assert.doesNotThrow(() => walkToOldButler(b.box.x), 'the frozen view: greeting() read the visit that had ended');
    assert.equal(session.butler, null, 'no Butler left behind');
    assert.equal(b.box.destroyed, true, 'its sprite is destroyed, not only taken off the stage');
  });

  it('any other way off the street (a teleport, the map): the Butler goes too', async () => {
    const { session, b } = await visit();
    await engine.enter('GA5101HF7F429V5');
    assert.equal(session.visit, null);
    assert.doesNotThrow(() => walkToOldButler(b.box.x));
    assert.equal(session.butler, null);
    assert.equal(b.box.destroyed, true);
  });

  it('a Butler left over with no visit never greets (the guard in tickButler and greeting)', async () => {
    const src = read('public/js/features/neighbours-mp-feature.js');
    const tick = src.slice(src.indexOf('  function tickButler('), src.indexOf('  // The picker and the message box'));
    assert.match(tick, /if \(!vb \|\| vb\.box\.destroyed \|\| !visit\) return;/);
    const greet = src.slice(src.indexOf('  function greeting()'), src.indexOf('  function tickButler('));
    assert.match(greet, /visit\?\.key/);
  });
});

describe('one throw no longer stops the game loop (report 116)', () => {
  it('the feature host runs every feature\'s onTick in its own guard and reports a throw once, with its id', () => {
    const heard = [];
    let ticks = 0;
    const host = createFeatureHost([
      { id: 'broken', onTick() { throw new TypeError("Cannot read properties of null (reading 'key')"); } },
      { id: 'after', onTick() { ticks += 1; } },
    ], { onError: (where, err) => heard.push([where, err.message]) });
    for (let i = 0; i < 90; i += 1) assert.doesNotThrow(() => host.tick(16, i, {}));
    assert.equal(ticks, 90, 'the features after it still tick');
    assert.deepEqual(heard, [['broken.onTick', "Cannot read properties of null (reading 'key')"]], 'once, not every frame');
    assert.deepEqual(host.caught(), ["broken.onTick|Cannot read properties of null (reading 'key')"]);
  });

  it('a new error from the same place is reported too; a run of different ones stops at the limit', () => {
    const heard = [];
    const once = createErrorOnce({ report: (where) => heard.push(where), limit: 3 });
    assert.equal(once('a.onTick', new Error('one')), true);
    assert.equal(once('a.onTick', new Error('one')), false);
    assert.equal(once('a.onTick', new Error('two')), true);
    assert.equal(once('b.onTick', new Error('one')), true);
    assert.equal(once('c.onTick', new Error('one')), false, 'past the limit');
    assert.deepEqual(heard, ['a.onTick', 'a.onTick', 'b.onTick']);
    // A reporter that throws never reaches the loop.
    assert.equal(createErrorOnce({ report: () => { throw new Error('x'); } })('d', new Error('y')), true);
  });

  it('other hooks still throw (a street change or a save must not half happen in silence)', () => {
    const host = createFeatureHost([{ id: 'broken', onStreetEnter() { throw new Error('boom'); } }], { onError: () => {} });
    assert.throws(() => host.streetEnter({}, {}), /boom/);
  });

  it('the caught error still reaches the report form\'s error list, named by where it was caught', () => {
    const saved = { reportError: globalThis.reportError, error: console.error };
    const fired = [];
    globalThis.reportError = (err) => fired.push(err);
    console.error = () => {};
    try {
      const err = new TypeError("Cannot read properties of null (reading 'key')");
      err.stack = 'greeting@https://groddleafternoon.com/js/features/neighbours-mp-feature.js:589:18\ntickButler@https://groddleafternoon.com/js/features/neighbours-mp-feature.js:606:25\nonTick@x';
      reportPageError('neighbours-mp.onTick', err);
      assert.deepEqual(fired, [err], 'reportError fires the window error event (the console shows it too)');
      const list = rememberError([], pageErrorLine({ error: err, message: err.message }));
      assert.deepEqual(list, ['neighbours-mp.onTick: greeting@https://groddleafternoon.com/js/features/neighbours-mp-feature.js:589:18 tickButler@https://groddleafternoon.com/js/features/neighbours-mp-feature.js:606:25']);
      // An uncaught error reads as before.
      assert.equal(pageErrorLine({ error: { stack: 'a\nb\nc' } }), 'a b');
      assert.equal(pageErrorLine({ message: 'Script error.' }), 'Script error.');
    } finally {
      if (saved.reportError === undefined) delete globalThis.reportError;
      else globalThis.reportError = saved.reportError;
      console.error = saved.error;
    }
    assert.match(read('public/js/features/bug-report-feature.js'), /window\.addEventListener\('error', \(e\) => rememberError\(pageErrors, pageErrorLine\(e\)\)\);/);
  });

  it('game.js runs the frame inside one guard and keeps the ticker going', () => {
    const game = read('public/game.js');
    assert.match(game, /import \{ createErrorOnce, createFeatureHost \} from '\.\/js\/feature-host\.js/);
    assert.match(game, /const frameFailed = createErrorOnce\(\);\n\s*const gameFrame = \(ticker\) => \{\n\s*syncStreetFront\(\);/);
    assert.match(game, /app\.ticker\.add\(\(ticker\) => \{\n\s*try \{\n\s*gameFrame\(ticker\);\n\s*\} catch \(err\) \{\n\s*frameFailed\('game loop', err\);\n\s*\}\n\s*\}\);/);
    // The features tick inside the frame, each in the host's own guard.
    const frame = game.slice(game.indexOf('const gameFrame = (ticker) => {'), game.indexOf("frameFailed('game loop', err);"));
    assert.ok(frame.includes('features.tick((1000 / 60) * dt, Date.now(), engine);'));
    assert.match(read('public/js/feature-host.js'), /tick\(dtMs, now, engine\) \{\n\s*eachGuarded\('onTick', dtMs, now, engine\);/);
  });
});
