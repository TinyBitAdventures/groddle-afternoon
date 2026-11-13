/**
 * A fake page for the phone's stick and Jump (js/touch-controls.js installTouchControls): elements with
 * listeners, classes, style and a rect, and the controls built into it with the keys they hold.
 * Shared by tests/touch-stick-fingers.test.js and tests/touch-float-stick.test.js.
 */
import { installTouchControls } from '../public/js/touch-controls.js?v=6ae5adce';

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
    ...(opts.doc || {}),
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
