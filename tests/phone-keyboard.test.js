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
import { isTypingField, keyboardBox, keyboardUp, watchPhoneKeyboard } from '../public/js/touch-controls.js?v=d65f8c10';

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

// Landscape audit #5: the Social drawer's chat box sat under the keyboard (sideways about 145 px of
// 335 are left). While it is up, html carries the box above it and the drawer you type in fits it.
describe('the chat box above the keyboard (#5)', () => {
  it('keyboardBox: the visual viewport in the game root\'s px, a gap all round', () => {
    assert.deepEqual(keyboardBox({ top: 0, height: 144, innerHeight: 335, rootTop: 0 }), { top: 4, height: 136 }, 'iOS sideways');
    assert.deepEqual(keyboardBox({ top: 40, height: 144, innerHeight: 335, rootTop: 0 }), { top: 44, height: 136 }, 'iOS scrolled the view down');
    assert.deepEqual(keyboardBox({ top: 0, height: 144, innerHeight: 144, rootTop: 0 }), { top: 4, height: 136 }, 'Android: the window shrank');
    assert.deepEqual(keyboardBox({ top: 0, height: 300, innerHeight: 200 }), { top: 4, height: 192 }, 'never taller than the window');
    assert.deepEqual(keyboardBox({}), { top: 4, height: 0 });
  });
  it('watchPhoneKeyboard sets --kbd-top and --kbd-h while it is up, follows a scroll, and clears them', () => {
    const win = fakeWin(335);
    const vvOn = {};
    win.visualViewport = { height: 335, offsetTop: 0, addEventListener: (t, fn) => { vvOn[t] = fn; }, removeEventListener() {} };
    const doc = fakeDoc();
    const props = new Map();
    doc.documentElement.style = { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) };
    doc.getElementById = (id) => (id === 'game-root' ? { getBoundingClientRect: () => ({ top: 0 }) } : null);
    watchPhoneKeyboard({ doc, win });
    doc.activeElement = { tagName: 'INPUT', type: 'text' };
    win.visualViewport.height = 144;
    vvOn.resize();
    assert.equal(doc.classes.has('kbd-up'), true);
    assert.equal(props.get('--kbd-top'), '4px');
    assert.equal(props.get('--kbd-h'), '136px');
    win.visualViewport.offsetTop = 40;
    vvOn.scroll();
    assert.equal(props.get('--kbd-top'), '44px');
    doc.activeElement = null;
    win.visualViewport.height = 335;
    win.visualViewport.offsetTop = 0;
    vvOn.resize();
    assert.equal(props.has('--kbd-top'), false);
    assert.equal(props.has('--kbd-h'), false);
  });
  it('style.css: the open drawer you type in fits the box, over the HUD', () => {
    const at = css.indexOf('/* CHAT ABOVE THE KEYBOARD (#5)');
    assert.ok(at > 0);
    const rule = css.slice(at, css.indexOf('/* === end LANDSCAPE-PANELS === */', at));
    assert.match(rule, /:root\.touch-phone\.kbd-up #game-root \.local-chat-dock\.social-drawer\.is-open:focus-within \{\s*top: var\(--kbd-top, var\(--social-top, 8px\)\);\s*height: var\(--kbd-h, auto\);\s*min-height: 0;/);
  });
});

