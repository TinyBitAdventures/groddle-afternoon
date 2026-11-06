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
 * This runs the real visit (neighbours-mp-feature's visitHome and the owner's street from
 * homes-feature) against a fake Pixi, leaves by each way out, and walks to the old Butler's x.
 * Run: node --test tests/visitor-butler-leaves.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { neighboursMpFeature } from '../public/js/features/neighbours-mp-feature.js?v=c4685cad';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// —— A fake Pixi: real display objects (children, destroyed, x/y), any other call a no-op ——

const noop = () => chain;
const chain = new Proxy(function chainFn() {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : k === Symbol.iterator ? [][Symbol.iterator].bind([]) : chain),
  apply: () => chain,
  construct: () => chain,
});

class Display {
  constructor() {
    this.children = [];
    this.parent = null;
    this.destroyed = false;
    this.x = 0;
    this.y = 0;
    this.zIndex = 0;
    this.visible = true;
    this.alpha = 1;
    this.rotation = 0;
    this.width = 0;
    this.height = 0;
    this.scale = { x: 1, y: 1, set(a, b = a) { this.x = a; this.y = b; } };
    this.anchor = { x: 0, y: 0, set(a, b = a) { this.x = a; this.y = b; } };
    this.pivot = { x: 0, y: 0, set(a, b = a) { this.x = a; this.y = b; } };
    this.position = { set: (a, b = a) => { this.x = a; this.y = b; } };
    return new Proxy(this, { get: (t, k) => (k in t || typeof k === 'symbol' ? t[k] : noop) });
  }
  addChild(...kids) {
    for (const k of kids) {
      k.parent?.removeChild?.(k);
      k.parent = this;
      this.children.push(k);
    }
    return kids[0];
  }
  addChildAt(k, i) {
    k.parent?.removeChild?.(k);
    k.parent = this;
    this.children.splice(i, 0, k);
    return k;
  }
  removeChild(k) {
    const i = this.children.indexOf(k);
    if (i >= 0) this.children.splice(i, 1);
    if (k) k.parent = null;
    return k;
  }
  removeChildren() {
    const out = this.children.splice(0);
    for (const k of out) k.parent = null;
    return out;
  }
  destroy() {
    this.destroyed = true;
    this.parent?.removeChild(this);
    for (const k of [...this.children]) k.destroy?.();
  }
  getBounds() { return { x: this.x, y: this.y, width: 0, height: 0 }; }
}
const fakePixi = new Proxy({ Container: Display, Graphics: Display, Sprite: Display, Text: Display, TilingSprite: Display }, {
  get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' ? undefined : chain),
});

// —— The page around the session (as tests/g328-mp.test.js) ——

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.hidden = false;
    this.textContent = '';
    this.style = {};
    this.dataset = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'hidden') this.hidden = true; }
  append(...kids) { this.children.push(...kids); }
  insertBefore(kid) { this.children.push(kid); }
  replaceChildren(...kids) { this.children = kids; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getContext() { return chain; }
}

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
