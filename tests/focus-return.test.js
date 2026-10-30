// Enter stays the world's (Austin 2026-10-30): a mouse click on a HUD control hands focus back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { releasesFocus, installFocusReturn } from '../public/js/ui/focus-return.js?v=8885653a';

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
  const field = node(['input'], hud);
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
  const field = node(['input']);
  doc.activeElement = field;
  listeners.click({ target: pin, detail: 1 });
  frames.shift()();
  assert.equal(field.blurred, undefined, 'a field the click focused keeps them too');
});

test('game.js installs it once, before the top bar', () => {
  const game = readFileSync(join(import.meta.dirname, '../public/game.js'), 'utf8');
  assert.match(game, /installFocusReturn\(document\);\n\s+installTopBar\(document,/);
});
