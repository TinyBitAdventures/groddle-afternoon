/**
 * #679 (iPhone, out of Hell by the grapes): right after the loading card the stick stayed held and the
 * avatar walked on with no thumb down. The stick's lift was never heard, and nothing let it go: a new
 * press while it was "held" counted as a second finger (G674), its finger re-pressed the keys every frame
 * after the street change let them go, and only the window's blur reset it. Act had the same lock.
 * Austin's ruling (2026-11-25): a held stick stops at the new street and holds nothing until a new press.
 * Run: node --test tests/touch-stick-stuck-679.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeControls } from './touch-fake-dom.js';
import { pressIsOver } from '../public/js/touch-controls.js?v=8bc690ac';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

/** A page (document or window) whose listeners a test can fire. */
function target(extra = {}) {
  const on = {};
  return {
    ...extra,
    addEventListener(t, f) { (on[t] ||= []).push(f); },
    removeEventListener(t, f) { on[t] = (on[t] || []).filter((g) => g !== f); },
    fire(t, ev = {}) {
      const e = { type: t, timeStamp: 0, ...ev };
      for (const f of on[t] || []) f(e);
      return e;
    },
  };
}

/** The controls on a page with real listeners, frames run by hand and pointer capture kept. */
function controls() {
  const doc = target({ visibilityState: 'visible' });
  const frames = [];
  const win = target({
    innerHeight: 335,
    requestAnimationFrame: (f) => { frames.push(f); return frames.length; },
    cancelAnimationFrame: (id) => { frames[id - 1] = null; },
    setTimeout: () => 0,
    navigator: {},
  });
  const c = fakeControls({ doc, win });
  for (const el of [c.zone, c.act]) {
    const caps = new Set();
    el.setPointerCapture = (id) => caps.add(id);
    el.releasePointerCapture = (id) => caps.delete(id);
    el.hasPointerCapture = (id) => caps.has(id);
    el.caps = caps;
  }
  const runFrames = () => {
    const now = frames.splice(0);
    for (const f of now) f?.();
  };
  // fakeControls spreads the page into its own: fire and set state on that copy.
  return { ...c, runFrames };
}

describe('#679: a stick whose lift was never heard lets go', () => {
  it('a new primary press takes the stick (no other finger can be down)', () => {
    const { zone, base, keys } = controls();
    zone.fire('pointerdown', { pointerId: 1, isPrimary: true, clientX: 60, clientY: 70 });
    zone.fire('pointermove', { pointerId: 1, clientX: 110, clientY: 70 });
    assert.deepEqual([...keys], ['ArrowRight']);
    // The lift is lost (the loading card). The next touch:
    const e = zone.fire('pointerdown', { pointerId: 2, isPrimary: true, clientX: 40, clientY: 80 });
    assert.equal(e.stopped, false, 'not kept as a second finger');
    assert.deepEqual([...keys], [], 'the old walk let go');
    assert.equal(base.style.left, '40px', 'the stick starts where the new thumb landed');
    zone.fire('pointermove', { pointerId: 2, clientX: 0, clientY: 80 });
    assert.deepEqual([...keys], ['ArrowLeft'], 'and steers');
  });
  it('the same pointer id going down again ends the old press', () => {
    const { zone, base, keys } = controls();
    zone.fire('pointerdown', { pointerId: 5, clientX: 60, clientY: 70 });
    zone.fire('pointermove', { pointerId: 5, clientX: 110, clientY: 70 });
    zone.fire('pointerdown', { pointerId: 5, clientX: 30, clientY: 70 });
    assert.deepEqual([...keys], []);
    assert.equal(base.style.left, '30px');
  });
  it('a capture gone with no lift heard lets a new press take the stick; a held capture keeps G674', () => {
    const { zone, base, keys } = controls();
    zone.fire('pointerdown', { pointerId: 1, isPrimary: true, clientX: 60, clientY: 70 });
    zone.fire('pointermove', { pointerId: 1, clientX: 110, clientY: 70 });
    // A real second finger while the first still holds its capture: kept apart (G674).
    const second = zone.fire('pointerdown', { pointerId: 2, isPrimary: false, clientX: 20, clientY: 90 });
    assert.equal(second.stopped, true);
    assert.deepEqual([...keys], ['ArrowRight']);
    zone.fire('pointerup', { pointerId: 2 });
    // The capture goes with no lift or lostpointercapture heard.
    zone.caps.delete(1);
    zone.fire('pointerdown', { pointerId: 3, isPrimary: false, clientX: 44, clientY: 70 });
    assert.deepEqual([...keys], []);
    assert.equal(base.style.left, '44px');
  });
  it('a lift heard anywhere on the page ends the stick', () => {
    const { zone, doc, keys } = controls();
    zone.fire('pointerdown', { pointerId: 1, clientX: 60, clientY: 70 });
    zone.fire('pointermove', { pointerId: 1, clientX: 110, clientY: 70 });
    doc.fire('pointerup', { pointerId: 1 });
    assert.deepEqual([...keys], []);
    assert.equal(zone.classList.contains('is-held'), false);
    zone.fire('pointerdown', { pointerId: 1, clientX: 60, clientY: 70 });
    zone.fire('pointermove', { pointerId: 1, clientX: 110, clientY: 70 });
    doc.fire('pointercancel', { pointerId: 1 });
    assert.deepEqual([...keys], [], 'a cancel too');
  });
  it('the page hidden or left lets go', () => {
    const one = controls();
    one.zone.fire('pointerdown', { pointerId: 1, clientX: 60, clientY: 70 });
    one.zone.fire('pointermove', { pointerId: 1, clientX: 110, clientY: 70 });
    one.doc.fire('visibilitychange');
    assert.deepEqual([...one.keys], ['ArrowRight'], 'still visible: still held');
    one.doc.visibilityState = 'hidden';
    one.doc.fire('visibilitychange');
    assert.deepEqual([...one.keys], []);
    const two = controls();
    two.zone.fire('pointerdown', { pointerId: 1, clientX: 60, clientY: 70 });
    two.zone.fire('pointermove', { pointerId: 1, clientX: 10, clientY: 70 });
    two.win.fire('pagehide');
    assert.deepEqual([...two.keys], []);
  });
});

describe('#679: a held stick stops at a new street (Austin 2026-11-25)', () => {
  it('releaseStick lets go, the frame no longer re-presses, and the same finger holds nothing more', () => {
    const { api, zone, keys, runFrames } = controls();
    zone.fire('pointerdown', { pointerId: 1, clientX: 60, clientY: 70 });
    zone.fire('pointermove', { pointerId: 1, clientX: 110, clientY: 70 });
    runFrames();
    assert.deepEqual([...keys], ['ArrowRight']);
    // The street change: game.js lets go of every key, then of the stick.
    keys.clear();
    api.releaseStick();
    runFrames();
    runFrames();
    assert.deepEqual([...keys], [], 'no frame takes the keys back');
    zone.fire('pointermove', { pointerId: 1, clientX: 130, clientY: 70 });
    assert.deepEqual([...keys], [], 'the finger still down does not walk on');
    zone.fire('pointerup', { pointerId: 1, clientX: 130, clientY: 70 });
    zone.fire('pointerdown', { pointerId: 2, clientX: 60, clientY: 70 });
    zone.fire('pointermove', { pointerId: 2, clientX: 110, clientY: 70 });
    assert.deepEqual([...keys], ['ArrowRight'], 'a new press walks');
  });
  it('game.js releases the stick with the street\'s held keys', () => {
    const body = game.slice(game.indexOf('function clearWorldEntities('), game.indexOf('function clearWorldEntities(') + 1200);
    assert.match(body, /heldKeys\.releaseAll\('street'\);[\s\S]{0,200}touchControls\?\.releaseStick\?\.\(\)/);
    assert.match(game, /touchControls = installTouchControls\(\{/);
  });
});

describe('#679: Act\'s dead press', () => {
  it('a new primary press on Act acts though the last one\'s lift was lost', () => {
    const { act, acts } = controls();
    act.fire('pointerdown', { pointerId: 1, isPrimary: true, clientX: 300, clientY: 300 });
    assert.equal(acts.length, 1);
    act.fire('pointerdown', { pointerId: 2, isPrimary: true, clientX: 300, clientY: 300 });
    assert.equal(acts.length, 2);
    assert.equal(act.classList.contains('is-held'), true);
  });
  it('a capture gone lets a press beside the held stick act; a lift anywhere ends the press', () => {
    const { act, acts, doc } = controls();
    act.fire('pointerdown', { pointerId: 1, isPrimary: false, clientX: 300, clientY: 300 });
    act.caps.delete(1);
    act.fire('pointerdown', { pointerId: 2, isPrimary: false, clientX: 300, clientY: 300 });
    assert.equal(acts.length, 2);
    doc.fire('pointerup', { pointerId: 2 });
    assert.equal(act.classList.contains('is-held'), false);
    act.fire('pointerdown', { pointerId: 3, isPrimary: false, clientX: 300, clientY: 300 });
    assert.equal(acts.length, 3);
  });
  it('a second finger on a live Act press still only cancels it', () => {
    const { act, acts } = controls();
    act.fire('pointerdown', { pointerId: 1, isPrimary: true, clientX: 300, clientY: 300 });
    act.fire('pointerdown', { pointerId: 2, isPrimary: false, clientX: 300, clientY: 300 });
    assert.equal(acts.length, 1);
  });
});

describe('#679: pressIsOver', () => {
  it('reads the pointer id, the primary press and a lost capture', () => {
    const el = { hasPointerCapture: (id) => id === 1 };
    assert.equal(pressIsOver({ pointerId: 1 }, 1), true);
    assert.equal(pressIsOver({ pointerId: 2, isPrimary: true }, 1), true);
    assert.equal(pressIsOver({ pointerId: 2, isPrimary: false }, 1, true, el), false);
    assert.equal(pressIsOver({ pointerId: 2, isPrimary: false }, 3, true, el), true);
    assert.equal(pressIsOver({ pointerId: 2 }, 3, false, el), false, 'a capture never taken says nothing');
    assert.equal(pressIsOver({ pointerId: 2 }, 3, true, {}), false, 'nor a browser that cannot say');
  });
});
