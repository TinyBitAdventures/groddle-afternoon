/**
 * Report #774 (iPhone, Your House): "machines cannot be moved around by dragging once they've been placed
 * like was stated in a previous update." The v0.79.0 slide (#730) made a finger hold still 350 ms on a
 * placed machine before a drag lifts it, in Decoration Mode too; a finger that moved first ended the press,
 * and Decoration Mode had already taken the press from the room, so a phone's press-and-drag did nothing
 * at all. In Decoration Mode every other placed piece drags at once under a finger: furniture and shelf
 * stacks (homes-feature onPressMove: only a loose press out of the mode waits for its hold) and the
 * pack's tiles' drags. A machine there now does the same. Out of Decoration Mode the hold stays, as a loose
 * piece's does (LOOSE_HOLD_MS).
 *
 * Glitch: the client was Flash with a mouse (HandOfDecorator.as onMouseDown 2411-2427, onMouseMove
 * 2430-2436: a press and a move lift the piece), so no touch rule of its own; Decoration Mode's own pieces
 * set the rule here.
 *
 * Run: node --test tests/report774-machine-touch.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { homeMachinesFeature } from '../public/js/features/home-machines-feature.js?v=8d2b740a';
import { homesFeature } from '../public/js/features/homes-feature.js?v=52c98a6b';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

/** The house's ground floor, no back yard (the room from world x 0), as homes-feature's _state names it. */
const groundFloor = () => ({ scene: { room: 'interior', houseFloor: 0, tower: null, background: { houseX: 0 } }, decor: { wallSegments: 11 }, cult: null });

describe('#774: a finger drags a placed machine in Decoration Mode at once, as furniture', () => {
  const saved = {};
  const listeners = {};
  const realState = homesFeature._state;
  const realMode = homesFeature.homeEditMode;
  let editing = 'decorate';
  let s;
  let id;
  // The game canvas, 960 client px wide at 0,0, so a client point is a world point (camera.w 960).
  const canvas = { tagName: 'CANVAS', style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) };
  const fire = (type, x, extra = {}) => {
    const ev = { type, target: canvas, pointerType: 'touch', pointerId: 3, button: 0, clientX: x, clientY: 300, stopPropagation() { this.stopped = true; }, preventDefault() {}, ...extra };
    for (const fn of listeners[type] || []) fn(ev);
    return ev;
  };
  const rx = () => s.state().machines.find((m) => m.id === id).rx;

  before(() => {
    for (const k of ['document', 'groddleHomeMachines', 'PIXI', 'window']) saved[k] = globalThis[k];
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), body: new FakeEl('body'), head: new FakeEl('head'), getElementById: () => null, querySelector: () => null };
    globalThis.PIXI = fakePixi;
    globalThis.window = {
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    };
    homesFeature._state = groundFloor;
    homesFeature.homeEditMode = () => editing;
    const layer = new Display();
    layer.toLocal = (p) => ({ x: p.x, y: p.y });
    const engine = {
      mode: 'solo', started: true, PIXI: { Sprite: Display, Graphics: Display, Point: class { constructor(x, y) { this.x = x; this.y = y; } } },
      entityLayer: layer, camera: { w: 960 }, streetTsid: 'RH_HOME_INT', platforms: [],
      inv: { metalmaker: 1 }, player: { x: 0, y: 570 }, query: () => null, param: () => null, transientInstance: () => false,
      homeContext: () => ({ inHome: true, owned: true }), setData() {}, toast() {}, save() {}, refreshPack() {}, pushActivity() {}, register: (t) => t, unregister() {},
      // Whatever is pressed is the machine (game.js pickInteractableAt).
      interactableAt: () => ({ homeMachine: id }),
    };
    homeMachinesFeature._reset();
    homeMachinesFeature.onTick(16, Date.now(), engine);
    s = globalThis.groddleHomeMachines;
    assert.equal(s.placeAt('metalmaker', 500), true);
    id = s.state().machines[0].id;
  });

  after(() => {
    homesFeature._state = realState;
    homesFeature.homeEditMode = realMode;
    homeMachinesFeature._reset();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('Decoration Mode: a finger pressed on it and moved straight away slides it', () => {
    editing = 'decorate';
    assert.equal(s.state().where?.place, 'house');
    assert.equal(fire('pointerdown', 500).stopped, true, 'the press is the machine\'s, not the room\'s');
    for (let x = 510; x <= 580; x += 10) fire('pointermove', x);
    fire('pointerup', 580);
    assert.equal(rx(), 580, 'a phone\'s press-and-drag moved nothing in Decoration Mode');
  });

  it('out of Decoration Mode a finger still holds first (a swipe never moves it), as a loose piece', () => {
    editing = null;
    const was = rx();
    fire('pointerdown', was);
    for (let x = was + 10; x <= was + 80; x += 10) fire('pointermove', x);
    fire('pointerup', was + 80);
    assert.equal(rx(), was);
  });
});
