/**
 * G674: a second finger on the movement stick moved it. The stick (js/touch-controls.js) follows only
 * the finger that started it: another finger on its corner (a thumb going for Jump, a pinch) never
 * moves, resets or lets go of it, and a press a second finger joined is never a tap on the street.
 * Also the shared fake DOM for the stick's tests (fakeControls).
 * Run: node --test tests/touch-stick-fingers.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installTouchControls } from '../public/js/touch-controls.js?v=c7b3f264';

/** A fake element: listeners, classes, style, dataset, a rect. */
export function fakeEl(rect = { left: 0, top: 0, width: 132, height: 132 }) {
  const on = {};
  const classes = new Set();
  return {
    style: {},
    dataset: {},
    hidden: false,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, v) => (v ?? !classes.has(c) ? classes.add(c) : classes.delete(c)),
    },
    addEventListener(t, f) { (on[t] ||= []).push(f); },
    removeEventListener(t, f) { on[t] = (on[t] || []).filter((g) => g !== f); },
    fire(t, ev = {}) {
      const e = { type: t, timeStamp: 0, clientX: 0, clientY: 0, pointerId: 1, defaultPrevented: false, stopped: false, ...ev };
      e.preventDefault = () => { e.defaultPrevented = true; };
      e.stopPropagation = () => { e.stopped = true; };
      for (const f of on[t] || []) f(e);
      return e;
    },
    getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
    setPointerCapture() {},
    appendChild() {},
    after() {},
    remove() {},
    querySelector: () => null,
  };
}

/** The stick and Jump built into a fake page, with the keys they hold. */
export function fakeControls(opts = {}) {
  const parts = {
    '[data-touch-stick]': fakeEl(opts.zoneRect),
    '.touch-stick-base': fakeEl(),
    '.touch-stick-knob': fakeEl(),
    '[data-touch-jump]': fakeEl(),
  };
  const wrap = fakeEl();
  wrap.querySelector = (sel) => parts[sel] || null;
  const html = fakeEl();
  const doc = {
    documentElement: html,
    activeElement: null,
    body: fakeEl(),
    createElement: () => wrap,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    getElementById: () => null,
  };
  const win = {
    innerHeight: 335,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    addEventListener() {},
    removeEventListener() {},
    setTimeout: () => 0,
    navigator: {},
    ...(opts.win || {}),
  };
  const keys = new Set();
  const taps = [];
  const api = installTouchControls({
    root: fakeEl(),
    press: (k) => keys.add(k),
    release: (k) => keys.delete(k),
    jump: () => {},
    tapThrough: (x, y, how) => taps.push({ x, y, ...(how || {}) }),
    doc,
    win,
    ...(opts.install || {}),
  });
  return { api, keys, taps, zone: parts['[data-touch-stick]'], base: parts['.touch-stick-base'], knob: parts['.touch-stick-knob'], jump: parts['[data-touch-jump]'], wrap, doc, win };
}

describe('G674: the stick follows only the finger that started it', () => {
  it('a second finger landing on the stick does not move its base or take it over', () => {
    const { zone, base, keys } = fakeControls();
    zone.fire('pointerdown', { pointerId: 1, clientX: 60, clientY: 70 });
    assert.equal(base.style.left, '60px');
    zone.fire('pointermove', { pointerId: 1, clientX: 110, clientY: 70 });
    assert.deepEqual([...keys], ['ArrowRight']);
    const second = zone.fire('pointerdown', { pointerId: 2, clientX: 20, clientY: 100 });
    assert.equal(second.defaultPrevented, true, 'the second finger is kept from the page');
    assert.equal(second.stopped, true, 'and from the world behind');
    assert.equal(base.style.left, '60px', 'the base stays where the first thumb landed');
    zone.fire('pointermove', { pointerId: 2, clientX: 0, clientY: 100 });
    assert.deepEqual([...keys], ['ArrowRight'], 'the second finger moving does not steer');
  });
  it('the second finger lifting does not reset the stick; the first lifting does', () => {
    const { zone, keys, knob } = fakeControls();
    zone.fire('pointerdown', { pointerId: 1, clientX: 60, clientY: 70 });
    zone.fire('pointermove', { pointerId: 1, clientX: 10, clientY: 70 });
    zone.fire('pointerdown', { pointerId: 2, clientX: 100, clientY: 100 });
    zone.fire('pointerup', { pointerId: 2, clientX: 100, clientY: 100 });
    zone.fire('pointercancel', { pointerId: 2 });
    zone.fire('lostpointercapture', { pointerId: 2 });
    assert.deepEqual([...keys], ['ArrowLeft'], 'still walking left');
    assert.ok(zone.classList.contains('is-held'));
    zone.fire('pointerup', { pointerId: 1, clientX: 10, clientY: 70 });
    assert.deepEqual([...keys], []);
    assert.equal(knob.style.transform, '');
  });
  it('a finger still down after the first lifted does not start the stick when it moves', () => {
    const { zone, keys, base } = fakeControls();
    zone.fire('pointerdown', { pointerId: 1, clientX: 60, clientY: 70 });
    zone.fire('pointerdown', { pointerId: 2, clientX: 100, clientY: 100 });
    zone.fire('pointerup', { pointerId: 1, clientX: 60, clientY: 70, timeStamp: 500 });
    zone.fire('pointermove', { pointerId: 2, clientX: 20, clientY: 100 });
    assert.deepEqual([...keys], []);
    assert.equal(base.style.left, '');
    zone.fire('pointerup', { pointerId: 2 });
    zone.fire('pointerdown', { pointerId: 3, clientX: 40, clientY: 50, timeStamp: 900 });
    assert.equal(base.style.left, '40px', 'the next fresh touch starts the stick as before');
  });
  it('a quick tap still reaches the street behind; a tap a second finger joined does not', () => {
    const one = fakeControls();
    one.zone.fire('pointerdown', { pointerId: 1, clientX: 60, clientY: 70, timeStamp: 0 });
    one.zone.fire('pointerup', { pointerId: 1, clientX: 61, clientY: 70, timeStamp: 120 });
    one.zone.fire('click', { clientX: 61, clientY: 70, timeStamp: 125 });
    assert.equal(one.taps.length, 1);
    assert.deepEqual([one.taps[0].x, one.taps[0].y], [61, 70]);

    const two = fakeControls();
    two.zone.fire('pointerdown', { pointerId: 1, clientX: 60, clientY: 70, timeStamp: 0 });
    two.zone.fire('pointerdown', { pointerId: 2, clientX: 100, clientY: 90, timeStamp: 40 });
    two.zone.fire('pointerup', { pointerId: 2, clientX: 100, clientY: 90, timeStamp: 90 });
    two.zone.fire('click', { clientX: 100, clientY: 90, timeStamp: 95 });
    two.zone.fire('pointerup', { pointerId: 1, clientX: 60, clientY: 70, timeStamp: 120 });
    two.zone.fire('click', { clientX: 60, clientY: 70, timeStamp: 125 });
    assert.equal(two.taps.length, 0, 'neither finger of a two-finger press is a tap through');
  });
  it('a second finger\'s click while the stick is held is not a tap through', () => {
    const { zone, taps } = fakeControls();
    zone.fire('pointerdown', { pointerId: 1, clientX: 60, clientY: 70, timeStamp: 0 });
    zone.fire('pointerdown', { pointerId: 2, clientX: 100, clientY: 90, timeStamp: 30 });
    zone.fire('pointerup', { pointerId: 2, clientX: 100, clientY: 90, timeStamp: 80 });
    zone.fire('click', { clientX: 100, clientY: 90, timeStamp: 85 });
    assert.equal(taps.length, 0);
  });
});
