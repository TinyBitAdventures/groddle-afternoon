/**
 * The on-screen keyboard on a phone (the mobile QA, 2026-11-12): with chat open the window shrank and
 * the pack row jumped to the middle of the screen, the stick and Jump beside it.
 * Run: node --test tests/phone-keyboard.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTypingField, keyboardUp, watchPhoneKeyboard } from '../public/js/touch-controls.js?v=c7b3f264';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

function fakeWin(h) {
  const on = {};
  const timers = [];
  return {
    innerHeight: h,
    scrollY: 0,
    scrolled: null,
    visualViewport: { height: h, addEventListener() {}, removeEventListener() {} },
    addEventListener: (t, fn) => { on[t] = fn; },
    removeEventListener: () => {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    scrollTo(x, y) { this.scrolled = [x, y]; this.scrollY = y; },
    run: () => { while (timers.length) timers.shift()(); },
    fire: (t) => on[t]?.(),
  };
}
function fakeDoc() {
  const on = {};
  const classes = new Set();
  return {
    activeElement: null,
    documentElement: { classList: { contains: (c) => classes.has(c), toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)), remove: (c) => classes.delete(c) } },
    addEventListener: (t, fn) => { on[t] = fn; },
    removeEventListener: () => {},
    fire: (t) => on[t]?.(),
    classes,
  };
}

describe('the on-screen keyboard on a phone', () => {
  it('typing fields', () => {
    assert.equal(isTypingField({ tagName: 'INPUT', type: 'text' }), true);
    assert.equal(isTypingField({ tagName: 'INPUT', type: 'search' }), true);
    assert.equal(isTypingField({ tagName: 'TEXTAREA' }), true);
    assert.equal(isTypingField({ tagName: 'INPUT', type: 'checkbox' }), false);
    assert.equal(isTypingField({ tagName: 'BUTTON' }), false);
    assert.equal(isTypingField(null), false);
  });
  it('up only while typing and the screen lost a quarter of its height', () => {
    assert.equal(keyboardUp({ typing: true, height: 170, visualHeight: 170, baseHeight: 343 }), true);
    assert.equal(keyboardUp({ typing: true, height: 343, visualHeight: 160, baseHeight: 343 }), true, 'iOS: the visual viewport shrinks');
    assert.equal(keyboardUp({ typing: false, height: 170, visualHeight: 170, baseHeight: 343 }), false);
    assert.equal(keyboardUp({ typing: true, height: 330, visualHeight: 330, baseHeight: 343 }), false);
  });
  it('html.kbd-up while it is up; the page goes back to the top after', () => {
    const win = fakeWin(343);
    const doc = fakeDoc();
    watchPhoneKeyboard({ doc, win });
    doc.activeElement = { tagName: 'INPUT', type: 'text' };
    doc.fire('focusin');
    win.innerHeight = 170;
    win.visualViewport.height = 170;
    win.fire('resize');
    assert.equal(doc.classes.has('kbd-up'), true);
    doc.activeElement = null;
    win.innerHeight = 343;
    win.visualViewport.height = 343;
    win.scrollY = 120;
    doc.fire('focusout');
    win.run();
    assert.equal(doc.classes.has('kbd-up'), false);
    assert.deepEqual(win.scrolled, [0, 0]);
  });
  it('style.css: the stick, Jump and the pack row wait (not the pack\'s own search)', () => {
    assert.match(css, /:root\.touch-phone\.kbd-up \.touch-controls \{ display: none; \}/);
    assert.match(css, /:root\.touch-phone\.kbd-up \.pack-bar:not\(:focus-within\) \{ visibility: hidden; \}/);
  });
});
