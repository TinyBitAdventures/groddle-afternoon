/**
 * G972: a pack stack dragged onto another player's Butler leaves it as a package, as in Glitch
 * (items/bag_butler.js leave_package 991-1020: is_drop_target, drop_tip, drop_ok_code, conditions;
 * main.js 5452-5500 lists it as a target; LocationInputHandler.as 600-631 opens the verb with the
 * stack). The Butler is a target of the drop registry (js/drop-targets.js, R9 G967) and opens the
 * same leave-a-package flow as its menu (features/neighbours-mp-feature.js leavePackage).
 *
 * - The registry lists it (order between the garden's plots and the street's other things: also
 *   tests/drop-targets.test.js).
 * - A mouse drag and a touch drag onto the Butler reach the flow: a stack opens the count chooser at
 *   the dragged count, a single one goes straight to "Do you want to give this...".
 * - Not a target: your own Butler (conditions state null for the owner), what can't be given
 *   (drop_ok_code: no_trade, a bag, furniture, a trophy). Refused in red: the Butler talking to
 *   somebody else, or full.
 * Run: node --test tests/g972-butler-drop.test.js
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { neighboursMpFeature } from '../public/js/features/neighbours-mp-feature.js?v=b5c1feec';
import { createInventory, ensureItem } from '../public/js/inventory.js?v=6414dbdc';
import { BUTLER_DROP_TIP, BUTLER_GIVE_TIP, butlerCarries, butlerDropAnswer } from '../public/js/butler-drop.js?v=359fb767';
import { dropTargetIds, currentDrag } from '../public/js/drop-targets.js?v=59e6edb4';
import { dropPage, fakeSlot, mouseDrop, touchDrop } from './drop-fake.js';
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

describe('leave_package as a drop (pure)', () => {
  it('own Butler and nothing there are no target; what cannot be given is no target', () => {
    ensureItem('g972_no_trade', { label: 'Keepsake', tags: ['no_trade'] });
    const st = (cls, extra = {}) => ({ from: 'pack', cls, count: 1, ...extra });
    assert.equal(butlerDropAnswer(st('apple'), null), null);
    assert.equal(butlerDropAnswer(st('apple'), { mine: true }), null, 'conditions: state null for the owner');
    // G972 follow-up: the owner's own Butler takes the drop as give (bag_butler.js 608-660).
    assert.deepEqual(butlerDropAnswer(st('apple'), { mine: true, give: true }), { ok: true, tip: BUTLER_GIVE_TIP });
    assert.equal(butlerDropAnswer(st('apple'), { mine: true, give: true, busy: true }).ok, false, 'refused while the Butler talks');
    assert.equal(butlerDropAnswer(st('g972_no_trade'), { mine: true, give: true }), null, 'no_trade is no gift either');
    assert.equal(butlerDropAnswer(st('apple'), { mine: false, give: true }), null, "give is the owner's alone");
    for (const cls of ['g972_no_trade', 'bag_generic', 'furniture_chair', 'trophy_x']) assert.equal(butlerCarries(cls), false, cls);
    assert.equal(butlerCarries('bag_gift_box_wrapped'), true, 'a wrapped Gift Box goes though no_trade (bag_butler.js 1013)');
    assert.equal(butlerDropAnswer(st('g972_no_trade'), { mine: false }), null);
    assert.equal(butlerDropAnswer(st('apple', { bag: 'bag_generic_1' }), { mine: false }), null, 'a bag slot');
    assert.deepEqual(butlerDropAnswer(st('apple'), { mine: false }), { ok: true, tip: BUTLER_DROP_TIP });
    assert.equal(butlerDropAnswer(st('apple'), { busy: true }).ok, false);
    assert.equal(butlerDropAnswer(st('apple'), { full: 'Sorry' }).tip, 'Sorry');
  });
});

describe('dragging onto a friend\'s Butler (G972)', () => {
  const saved = {};
  let engine;
  let body;
  let session;
  let page;
  let under = true;
  const sent = [];
  const prompts = [];
  const toasts = [];
  const walks = [];
  const listeners = new Map();
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }), contains: (n) => n === canvas };
  const client = {
    state: 'online',
    me: { id: 1, name: 'Bo' },
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    send(type, msg) { sent.push([type, msg]); return true; },
  };
  const find = (attr) => body.all().find((e) => attr in e.attrs);

  before(async () => {
    for (const k of ['document', 'fetch', 'groddleNeighbours', 'GRODDLE_MP_BOOT', 'PIXI']) saved[k] = globalThis[k];
    body = new FakeEl('body');
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body, getElementById: () => null, querySelector: (s) => (s === '#game-root > canvas' ? canvas : null) };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.PIXI = fakePixi;
    globalThis.fetch = async (url) => {
      if (!String(url).startsWith('https://groddle.localhost/wp-json/')) return { status: 404, ok: false, headers: { get: () => null }, json: async () => null };
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      const out = path === 'homes/7' ? VIEW : path === 'homes/visitors' ? { allow: false } : { given: [], received: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => out };
    };
    const entityLayer = new Display();
    engine = {
      mode: 'multiplayer',
      started: true,
      PIXI: fakePixi,
      entityLayer,
      camera: { w: 960 },
      groundY: 870,
      streetTsid: 'GLI32N0F1UD114O',
      street: { label: 'Archimedes Acres', hubName: 'Groddle Meadow' },
      player: { x: 100, y: 870 },
      inv: createInventory({ apple: 3, cherry: 1, g972_no_trade: 1 }),
      interactables: [],
      data: {},
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      param: () => null,
      homeContext: () => ({ inHome: false, room: 'street' }),
      transientInstance: () => false,
      setData(k, v) { engine.data[k] = v; },
      toast(t) { toasts.push(t); },
      playSound() {},
      pushActivity() {},
      achievement() {},
      say() {},
      prompt(p) { prompts.push(p); },
      // The Butler under the pointer while `under` is set (the hit test is the engine's own).
      interactableAt: () => (under ? engine.interactables.find((t) => t.classId === 'mp_butler') || null : null),
      requestVerb(t, v, { run }) { walks.push([t.classId, v.id]); return run(); },
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
    await wait(5);
    session = globalThis.groddleNeighbours;
    assert.equal(await session.visitHome(7), true);
    assert.ok(session.butler?.target, 'the owner\'s Butler stands on the visit');
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  beforeEach(() => {
    sent.length = 0;
    prompts.length = 0;
    toasts.length = 0;
    walks.length = 0;
    under = true;
    client.me.id = 1;
    session.butler.busy = false;
    session.butler.full = '';
    page = dropPage([]);
  });

  const slotOf = (cls, n) => {
    const slot = fakeSlot(cls, n);
    page.row.contains = (x) => x === slot;
    return slot;
  };

  it('the registry lists the Butler', () => {
    const ids = dropTargetIds();
    assert.ok(ids.includes('butler'));
    assert.ok(ids.indexOf('butler') < ids.indexOf('world') || !ids.includes('world'), 'before the street\'s other things');
  });

  it('mouse: three Apples dragged on the Butler open the count chooser at 3, then the Butler asks and the package goes', () => {
    const { over, drop } = mouseDrop(page, slotOf('apple', 3), canvas, 480, 300);
    assert.equal(over.defaultPrevented, true, 'the Butler lights up as a target');
    assert.equal(drop.defaultPrevented, true);
    assert.equal(page.doc.documentElement.dataset.dropLast, 'butler:ok:mouse');
    assert.deepEqual(walks, [['mp_butler', 'mp_butler_leave_package']], 'walks into reach as the menu does');
    assert.equal(engine.data.butlerLeaveFrom, 'drop');
    const stacks = body.all().filter((e) => 'data-butler-stack' in e.attrs && e.attrs['aria-pressed'] !== undefined);
    assert.deepEqual([...new Set(stacks.map((e) => e.attrs['data-butler-stack']))].slice(-1), ['apple']);
    assert.equal(find('data-butler-count').attrs.value, '3', 'the dragged count');
    find('data-butler-leave').fire('click');
    assert.equal(prompts.length, 1);
    assert.match(prompts[0].text, /these 3 /);
    prompts[0].onChoice(true);
    find('data-butler-skip').fire('click');
    assert.deepEqual(sent, [['butler_leave', { owner: 7, item: { c: 'apple', n: 3 }, text: '' }]]);
    assert.equal(currentDrag(), null);
  });

  it('touch: one Cherry lifted onto the Butler goes straight to "Do you want to give this..."', async () => {
    await touchDrop(page, slotOf('cherry', 1), canvas, 480, 300);
    assert.equal(page.doc.documentElement.dataset.dropLast, 'butler:ok:touch');
    assert.equal(prompts.length, 1, 'no count chooser for one');
    assert.match(prompts[0].text, /this Cherry|this cherry/i);
    prompts[0].onChoice(true);
    find('data-butler-skip').fire('click');
    assert.deepEqual(sent, [['butler_leave', { owner: 7, item: { c: 'cherry', n: 1 }, text: '' }]]);
  });

  it('what cannot be given is no target: nothing opens, by touch or mouse', async () => {
    await touchDrop(page, slotOf('g972_no_trade', 1), canvas, 480, 300);
    assert.equal(page.doc.documentElement.dataset.dropLast, 'none:touch');
    mouseDrop(page, slotOf('g972_no_trade', 1), canvas, 480, 300);
    assert.equal(page.doc.documentElement.dataset.dropLast, 'none:mouse');
    assert.deepEqual([prompts.length, walks.length, sent.length], [0, 0, 0]);
  });

  it('your own Butler is no target for a package', async () => {
    client.me.id = 7;
    await touchDrop(page, slotOf('apple', 3), canvas, 480, 300);
    assert.equal(page.doc.documentElement.dataset.dropLast, 'none:touch');
    assert.deepEqual([prompts.length, walks.length, sent.length], [0, 0, 0]);
  });

  it('a Butler talking to somebody else, or full, refuses in red with its reason', async () => {
    session.butler.busy = true;
    await touchDrop(page, slotOf('apple', 3), canvas, 480, 300);
    assert.equal(page.doc.documentElement.dataset.dropLast, 'butler:no:touch');
    assert.deepEqual(toasts, ['The Butler is talking to somebody else right now.']);
    session.butler.busy = false;
    for (const fn of listeners.get('msg:butler_left')) fn({ owner: 7, status: 'refused', why: 'full', text: "Sorry, I can't carry any more packages.", item: { c: 'apple', n: 1 } });
    mouseDrop(page, slotOf('apple', 3), canvas, 480, 300);
    assert.equal(page.doc.documentElement.dataset.dropLast, 'butler:no:mouse');
    assert.equal(toasts[1], "Sorry, I can't carry any more packages.");
    assert.deepEqual([prompts.length, walks.length, sent.length], [0, 0, 0]);
  });

  it('off the Butler the drag is not the Butler\'s', () => {
    under = false;
    mouseDrop(page, slotOf('apple', 3), canvas, 100, 100);
    assert.notEqual(page.doc.documentElement.dataset.dropLast, 'butler:ok:mouse');
    assert.equal(walks.length, 0);
  });
});
