/**
 * The tap that opens a verb menu is not a choice in it (the mobile QA, 2026-11-12): a phone opens the
 * menu on the finger's press, and the click of that same tap landed on a row under the finger (a Feed
 * picker opened from a pig) or beside the card (the menu closed at once: "the tap opened nothing").
 * And a chicken under the stick's corner could not be tapped at all: a quick tap on the stick that never
 * moved it is a tap on the thing behind it.
 * Run: node --test tests/verb-menu-tap.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindVerbMenu } from '../public/js/ui/verb-menu.js?v=94936f9c';
import { STICK_TAP_MS, isTapThrough } from '../public/js/touch-controls.js?v=34d558e1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const touch = readFileSync(join(root, 'public/js/touch-controls.js'), 'utf8');

function setup() {
  const docOn = {};
  const elOn = {};
  const doc = { addEventListener: (t, fn) => { (docOn[t] ||= []).push(fn); } };
  const row = { closest: (sel) => (sel === '.vm-row' ? row : null), getAttribute: () => null };
  const el = {
    dataset: {},
    ownerDocument: doc,
    addEventListener: (t, fn) => { (elOn[t] ||= []).push(fn); },
    contains: (n) => n === row || n === el,
  };
  bindVerbMenu(el);
  const press = (target) => { for (const fn of docOn.pointerdown || []) fn({ target }); };
  const click = (target, detail = 1) => {
    const e = { target, detail, stopped: false, preventDefault() {}, stopImmediatePropagation() { this.stopped = true; } };
    for (const fn of elOn.click || []) { fn(e); if (e.stopped) break; }
    return !e.stopped;
  };
  return { el, row, press, click, canvas: { closest: () => null } };
}

describe('the opening tap is not a choice', () => {
  it('a click whose press began outside the menu (the tap that opened it) is swallowed', () => {
    const { row, press, click, canvas } = setup();
    press(canvas);
    assert.equal(click(row), false);
  });
  it('a press and click on a row counts', () => {
    const { row, press, click } = setup();
    press(row);
    assert.equal(click(row), true);
  });
  it('keys (Enter, Space: detail 0) always count', () => {
    const { row, press, click, canvas } = setup();
    press(canvas);
    assert.equal(click(row, 0), true);
  });
});

describe('a tap on the stick\'s corner reaches the thing behind it', () => {
  it('a quick tap that never moved the stick', () => {
    assert.equal(STICK_TAP_MS, 300);
    assert.equal(isTapThrough({ moved: false, ms: 80 }), true);
    assert.equal(isTapThrough({ moved: true, ms: 80 }), false, 'a walk is not a tap');
    assert.equal(isTapThrough({ moved: false, ms: 600 }), false, 'a hold is not a tap');
  });
  // G674: only the stick's own quick press (no second finger) is a tap through; the floating stick's
  // wide corner (an option) also walks on empty street (tests/touch-float-stick.test.js).
  it('the stick passes its own quick tap on; game.js taps only a thing there (or walks, floating)', () => {
    assert.match(touch, /zone\.addEventListener\('click', \(e\) => \{\s*const ready = tapReady && stickId == null && !others\.size && isTapThrough\(\{ moved, ms: e\.timeStamp - downAt \}\);\s*tapReady = false;\s*if \(ready\) tapThrough\?\.\(e\.clientX, e\.clientY, \{ float: el\.dataset\.float === 'on' \}\);/);
    const at = game.indexOf('tapThrough: (x, y, how = {}) => {');
    assert.ok(at > 0);
    const fn = game.slice(at, game.indexOf('\n      },', at));
    assert.match(fn, /const hit = pickInteractableAt\(sx, sy\);/);
    assert.match(fn, /if \(!hit && !how\.float\) return;\s*app\.canvas\.dispatchEvent\(new PointerEvent\('pointerdown', \{ clientX: x, clientY: y, pointerType: 'touch'/);
  });
});
