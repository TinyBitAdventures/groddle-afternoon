/**
 * #411 (G867): a friend's Butler asks "Give <owner> 1 Apple?" and the prompt can be answered after
 * the visit ended. The answer read visit.name with no visit (neighbours-mp-feature.js confirmPackage)
 * and threw. Now a late answer does nothing: the Butler went with the visit, the apple stays in the
 * pack and nothing is sent. Answered on the visit, the package still goes.
 * Run: node --test tests/g867-butler-package-late.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { neighboursMpFeature } from '../public/js/features/neighbours-mp-feature.js?v=32168e61';
import { createInventory } from '../public/js/inventory.js?v=3be7988a';
import { FakeEl, Display, fakePixi } from './fake-scene.js';

const VIEW = {
  owner: { id: 7, name: 'Ada' },
  home: { owned: true, style: 'meadow' },
  homes: { decor: { placed: [] }, cult: { items: [] } },
  key: false,
  pass: { token: 'pass.sig', expiresIn: 1800 },
  butler: { owned: true, name: 'Pip', parts: {}, post: null },
};

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('a Butler package answered late (#411)', () => {
  const saved = {};
  let engine;
  let body;
  const sent = [];
  const prompts = [];

  before(() => {
    for (const k of ['document', 'fetch', 'groddleNeighbours', 'GRODDLE_MP_BOOT', 'PIXI']) saved[k] = globalThis[k];
    body = new FakeEl('body');
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body, getElementById: () => null, querySelector: () => null };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.PIXI = fakePixi;
    globalThis.fetch = async (url) => {
      if (!String(url).startsWith('https://groddle.localhost/wp-json/')) return { status: 404, ok: false, headers: { get: () => null }, json: async () => null };
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      const out = path === 'homes/7' ? VIEW : path === 'homes/visitors' ? { allow: false } : { given: [], received: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => out };
    };
    const listeners = new Map();
    const client = {
      state: 'online',
      me: { id: 1, name: 'Bo' },
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      send(type, msg) { sent.push([type, msg]); return true; },
    };
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
      inv: createInventory({ apple: 3 }),
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
      prompt(p) { prompts.push(p); },
      register(t) { engine.interactables.push(t); return t; },
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

  async function askToLeaveAnApple() {
    await wait(5);
    const session = globalThis.groddleNeighbours;
    engine.streetTsid = 'GLI32N0F1UD114O';
    assert.equal(await session.visitHome(7), true);
    assert.ok(session.butler, 'the owner\'s Butler stands on the visit');
    prompts.length = 0;
    sent.length = 0;
    assert.equal(session.runButler('mp_butler_leave_package'), true);
    const leave = body.all().find((e) => 'data-butler-leave' in e.attrs);
    assert.ok(leave, 'the pick list opened');
    leave.fire('click');
    assert.equal(prompts.length, 1, 'the Butler asks to confirm');
    return session;
  }

  it('the yes, answered after leaving the street, sends nothing and does not throw', async () => {
    const session = await askToLeaveAnApple();
    await engine.enter('GA5101HF7F429V5');
    assert.equal(session.visit, null);
    assert.doesNotThrow(() => prompts[0].onChoice(true));
    assert.doesNotThrow(() => prompts[0].onChoice(false));
    assert.deepEqual(sent, []);
    assert.equal(engine.inv.apple, 3, 'the apple stays in the pack');
  });

  it('answered on the visit, the package still goes with its message', async () => {
    const session = await askToLeaveAnApple();
    prompts[0].onChoice(true);
    const send = body.all().find((e) => 'data-butler-send' in e.attrs);
    assert.ok(send, 'the message box opened');
    body.all().find((e) => 'data-butler-text' in e.attrs).value = 'for you';
    send.fire('click');
    assert.deepEqual(sent, [['butler_leave', { owner: 7, item: { c: 'apple', n: 1 }, text: 'for you' }]]);
    await session.runVerb({ classId: 'neighbours_gate' }, 'go_back');
  });
});
