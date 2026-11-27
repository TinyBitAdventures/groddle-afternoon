/**
 * #372 (iPhone Safari, upright and sideways): Camera Mode came up but a drag did not move the look.
 * Safari ends a touch's pointer stream early with pointercancel, and the drag dropped with it.
 * js/features/camera-mode-feature.js: where the browser has touch events the one-finger drag follows
 * them, its touchmove taken (preventDefault) while Camera Mode is on.
 * Browser check (Playwright WebKit, iPhone UA, 402x660 and 874x402, &camerademo=1): a drag whose
 * pointer stream is cancelled after two moves still pans the look (206,69 and 161,54).
 * Run: node --test tests/r372-camera-touch-drag.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function fakeWindow() {
  const on = {};
  return {
    on,
    GRODDLE_DEVICE: 'phone',
    ontouchstart: null,
    addEventListener(type, fn) { (on[type] ||= []).push(fn); },
    removeEventListener() {},
    fire(type, ev) { for (const fn of on[type] || []) fn(ev); },
  };
}

describe('#372 Camera Mode drag on a phone with touch events', async () => {
  const win = fakeWindow();
  globalThis.window = win;
  globalThis.GRODDLE_DEVICE = 'phone';
  const { cameraModeFeature, cameraTouchMode } = await import('../public/js/features/camera-mode-feature.js?v=1dbbcbd3');
  const canvas = { getBoundingClientRect: () => ({ width: 400, height: 600 }) };
  const data = {};
  const looks = [];
  const engine = {
    canvas,
    camera: { x: 500, w: 400 },
    worldW: 4000,
    learnedSkills: [],
    setData: (k, v) => { data[k] = v; },
    setCameraLook: (x, y) => looks.push([x, y]),
    playSound() {},
    busy: () => false,
    acting: () => false,
    query() { return null; },
    param() { return null; },
  };
  cameraModeFeature.init(engine);

  it('knows a browser with touch events', () => {
    assert.equal(cameraTouchMode(win), true);
    assert.equal(cameraTouchMode({}), false);
    assert.ok(win.on.touchmove?.length && win.on.touchstart?.length && win.on.touchcancel?.length);
  });

  it('pans with one finger after the pointer stream is cancelled, and takes the touchmove', () => {
    win.fire('keydown', { key: 'c', target: {}, preventDefault() {}, stopImmediatePropagation() {} });
    assert.equal(data.cameraMode, '1');
    const t = (x, y) => ({ identifier: 3, target: canvas, clientX: x, clientY: y });
    win.fire('touchstart', { changedTouches: [t(200, 300)] });
    win.fire('pointercancel', { pointerId: 3, pointerType: 'touch' });
    let prevented = 0;
    for (let i = 1; i <= 5; i++) {
      win.fire('touchmove', { changedTouches: [t(200 - i * 20, 300 - i * 5)], cancelable: true, preventDefault: () => { prevented += 1; } });
    }
    assert.equal(prevented, 5);
    assert.equal(data.cameraDrag, 'touch');
    assert.ok(Number(data.cameraLookX) > 0, `look x ${data.cameraLookX}`);
    win.fire('touchend', { changedTouches: [t(100, 275)] });
  });

  it('leaves a two-finger pinch to the zoom', () => {
    const before = data.cameraLookX;
    const a = (x) => ({ identifier: 1, target: canvas, clientX: x, clientY: 300 });
    const b = (x) => ({ identifier: 2, target: canvas, clientX: x, clientY: 320 });
    win.fire('touchstart', { changedTouches: [a(100), b(300)] });
    let prevented = 0;
    win.fire('touchmove', { changedTouches: [a(60), b(340)], cancelable: true, preventDefault: () => { prevented += 1; } });
    assert.equal(prevented, 0);
    assert.equal(data.cameraLookX, before);
  });
});
