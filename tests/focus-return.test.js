// Enter stays the world's (Austin 2026-10-30): a mouse click on a HUD control hands focus back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { releaseTarget, releasesFocus, installFocusReturn } from '../public/js/ui/focus-return.js?v=da190597';

/** A tiny element: closest() over a chain of selectors it matches. */
function node(matches, parent = null) {
  const self = { parent, matches, contains: (n) => { for (let x = n; x; x = x.parent) if (x === self) return true; return false; } };
  self.closest = (sel) => {
    for (let x = self; x; x = x.parent) if (sel.split(',').some((s) => x.matches.includes(s.trim()))) return x;
    return null;
  };
  self.blur = () => { self.blurred = true; };
  return self;
}

test('a mouse click on a HUD button lets focus go; keyboard, fields and modals keep it', () => {
  const hud = node(['#pack-bar']);
  const pin = node(['button'], hud);
  assert.equal(releasesFocus(pin, { detail: 1 }), true, 'mouse click on a button');
  assert.equal(releasesFocus(pin, { detail: 0 }), false, 'Enter or Space on a focused button (detail 0)');
  const field = node(['textarea'], hud);
  assert.equal(releasesFocus(field, { detail: 1 }), false, 'a text field keeps the keys');
  const modal = node(['[role="dialog"]']);
  assert.equal(releasesFocus(node(['button'], modal), { detail: 1 }), false, 'a modal window keeps the keys');
  assert.equal(releasesFocus(node(['div'], hud), { detail: 1 }), false, 'not a control');
});

test('installed: a frame after the click, a control still holding focus is blurred', () => {
  const listeners = {};
  const pin = node(['button']);
  const doc = { body: {}, activeElement: pin, addEventListener: (t, fn) => { listeners[t] = fn; }, removeEventListener() {} };
  const frames = [];
  installFocusReturn(doc, { raf: (fn) => frames.push(fn) });
  listeners.click({ target: pin, detail: 1 });
  assert.equal(pin.blurred, undefined, 'not at once: what the click opened gets a frame');
  frames.shift()();
  assert.equal(pin.blurred, true);
  const redrawn = node(['button']);
  doc.activeElement = redrawn;
  listeners.click({ target: pin, detail: 1 });
  frames.shift()();
  assert.equal(redrawn.blurred, true, 'a copy of the control the click drew again lets go too');
  const row = node(['button'], node(['#verb-menu']));
  doc.activeElement = row;
  listeners.click({ target: pin, detail: 1 });
  frames.shift()();
  assert.equal(row.blurred, undefined, 'a menu the click opened keeps the keys');
  const field = node(['textarea']);
  doc.activeElement = field;
  listeners.click({ target: pin, detail: 1 });
  frames.shift()();
  assert.equal(field.blurred, undefined, 'a field the click focused keeps them too');
});

test('game.js installs it once, before the top bar', () => {
  const game = readFileSync(join(import.meta.dirname, '../public/game.js'), 'utf8');
  assert.match(game, /installFocusReturn\(document\);\n(?:[^\n]*\n){0,4}\s+installTopBar\(document,/);
});

// Austin 2026-11-03: click Mute in the Sound popover, and Space toggled it again instead of jumping.
const TEXT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"])';

test('toggles let go after a click: the world outside a window that keeps the keys, its title inside one', () => {
  const pop = node(['[role="dialog"]', '[data-click-releases]']);
  assert.equal(releaseTarget(node(['button'], pop)), 'world', 'Mute in the Sound popover');
  assert.equal(releaseTarget(node(['input[type="range"]'], pop)), 'world', 'its slider');
  assert.equal(releaseTarget(node(['input[type="range"]'], pop), { detail: 0 }), '', 'a key press on it keeps focus');
  const menu = node(['#more-list']);
  assert.equal(releaseTarget(node(['input[type="checkbox"]', '[role="switch"]'], menu)), 'world', 'a switch in the Menu');
  const prefs = node(['[role="dialog"]', '[aria-modal="true"]']);
  assert.equal(releaseTarget(node(['input[type="checkbox"]'], prefs)), 'dialog', 'a Preferences checkbox: focus to the window, which keeps the keys');
  assert.equal(releaseTarget(node(['input[type="radio"]'], prefs)), 'dialog');
  assert.equal(releaseTarget(node(['button'], prefs)), '', 'a button in a modal keeps focus as before');
  assert.equal(releaseTarget(node([TEXT], prefs)), '', 'a text field keeps the keys');
  assert.equal(releaseTarget(node(['select'], menu)), '', 'a select too');
  const verbs = node(['#verb-menu']);
  assert.equal(releaseTarget(node(['button'], verbs)), '', 'the verb menu keeps its keys');
  // RIGHTCLICK: the shared menu a click on a chat name opens keeps them too (Esc closes it).
  const ctx = node(['.ctx-menu:not([hidden])']);
  assert.equal(releaseTarget(node(['[role="menuitem"]', 'button'], ctx)), '', 'the shared menu keeps its keys');
});

test('installed: a slider keeps focus while dragged and lets go on pointerup; a modal toggle hands focus to the title', () => {
  const listeners = {};
  const world = node(['canvas']);
  let title = null;
  const doc = {
    body: {}, activeElement: null, addEventListener: (t, fn) => { listeners[t] = fn; }, removeEventListener() {},
    querySelector: (sel) => (sel.includes('canvas') ? world : null), getElementById: (id) => (id === 'prefs-title' ? title : null),
  };
  world.focus = () => { doc.activeElement = world; };
  const frames = [];
  installFocusReturn(doc, { raf: (fn) => frames.push(fn) });
  const pop = node(['[role="dialog"]', '[data-click-releases]']);
  const slider = node(['input[type="range"]'], pop);
  doc.activeElement = slider;
  listeners.pointerdown({ target: slider });
  listeners.click({ target: slider, detail: 1 });
  assert.equal(frames.length, 0, 'its click waits for the pointerup');
  listeners.pointerup({ target: slider });
  frames.shift()();
  assert.equal(doc.activeElement, world, 'released when the drag ends');
  const prefs = node(['[role="dialog"]', '[aria-modal="true"]']);
  prefs.getAttribute = (a) => (a === 'aria-labelledby' ? 'prefs-title' : null);
  title = node(['h2'], prefs);
  title.hasAttribute = () => false;
  title.setAttribute = (k, v) => { title[k] = v; };
  title.focus = () => { doc.activeElement = title; };
  const box = node(['input[type="checkbox"]'], prefs);
  doc.activeElement = box;
  listeners.pointerdown({ target: box });
  listeners.click({ target: box, detail: 1 });
  frames.shift()();
  assert.equal(doc.activeElement, title, 'Space cannot press it again, and Esc still closes Preferences');
  assert.equal(title.tabindex, '-1');
});
