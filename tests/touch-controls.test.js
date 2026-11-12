/**
 * TOUCH: a phone's controls (js/touch-controls.js). Austin (2026-11-12) on his iPhone, with the
 * full game loaded: "Can't move yet." The stick holds the arrow keys, Jump queues the Space
 * key's jump, a tap on empty street walks there and a tapped ladder climbs to the tapped height.
 * Phones only: computers and tablets never build them.
 * Run: node --test tests/touch-controls.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STICK_DEAD,
  STICK_RADIUS,
  climbGoalStep,
  isPhoneDevice,
  knobOffset,
  stickKeys,
  touchTapPlan,
} from '../public/js/touch-controls.js?v=17e862bb';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');
const mod = readFileSync(join(root, 'public/js/touch-controls.js'), 'utf8');

describe('touch controls: who gets them', () => {
  it('only the phone gate\'s phone', () => {
    assert.equal(isPhoneDevice({ GRODDLE_DEVICE: 'phone' }), true);
    assert.equal(isPhoneDevice({ GRODDLE_DEVICE: 'tablet' }), false);
    assert.equal(isPhoneDevice({ GRODDLE_DEVICE: 'computer' }), false);
    assert.equal(isPhoneDevice({}), false);
    assert.equal(isPhoneDevice(null), false);
  });
  it('game.js builds them only on a phone and taps walk only for touch pointers', () => {
    assert.match(game, /const TOUCH_PHONE = isPhoneDevice\(window\);/);
    assert.match(game, /if \(TOUCH_PHONE\) \{\s*installTouchControls\(/);
    assert.match(game, /\} else if \(TOUCH_PHONE && e\.pointerType === 'touch'\) \{\s*\/\/[^\n]*\n\s*touchTapStreet\(sx, sy\);/);
  });
});

describe('the stick', () => {
  it('holds nothing inside the dead zone', () => {
    assert.deepEqual(stickKeys(0, 0), []);
    assert.deepEqual(stickKeys(STICK_DEAD - 1, 0), []);
    assert.deepEqual(stickKeys(-5, 5), []);
  });
  it('sideways holds Left or Right alone', () => {
    assert.deepEqual(stickKeys(30, 0), ['ArrowRight']);
    assert.deepEqual(stickKeys(-30, 4), ['ArrowLeft']);
    assert.deepEqual(stickKeys(-40, 20), ['ArrowLeft']);
  });
  it('up or down holds Up or Down alone, so a ladder climb never hops off', () => {
    assert.deepEqual(stickKeys(0, -30), ['ArrowUp']);
    assert.deepEqual(stickKeys(10, -40), ['ArrowUp']);
    assert.deepEqual(stickKeys(-8, 35), ['ArrowDown']);
  });
  it('a diagonal holds both', () => {
    assert.deepEqual(stickKeys(30, -30), ['ArrowRight', 'ArrowUp']);
    assert.deepEqual(stickKeys(-30, 30), ['ArrowLeft', 'ArrowDown']);
  });
  it('the knob stays inside its ring', () => {
    assert.deepEqual(knobOffset(10, 0), { x: 10, y: 0 });
    const k = knobOffset(300, 400);
    assert.ok(Math.abs(Math.hypot(k.x, k.y) - STICK_RADIUS) < 1e-9);
    assert.ok(k.x > 0 && k.y > 0);
  });
  it('holds the same keys a keyboard does, and Jump queues the Space key\'s jump', () => {
    assert.match(game, /press: \(k\) => keys\.add\(k\),\s*release: \(k\) => keys\.delete\(k\),\s*jump: \(\) => queueJump\(jumpState, movementNow\(\)\),/);
    assert.match(mod, /press\(' '\);\s*jump\(\);/);
  });
});

describe('a tap on the street', () => {
  it('walks to empty ground', () => {
    assert.deepEqual(touchTapPlan(812.4, 950), { kind: 'point', x: 812.4, y: 950 });
  });
  it('climbs a tapped ladder to the tapped height, held a little past its ends', () => {
    const ladder = { x: 400, yTop: 600, yBot: 1000 };
    assert.deepEqual(touchTapPlan(410, 700, ladder), { kind: 'ladder', x: 400, goalY: 700 });
    assert.equal(touchTapPlan(410, 100, ladder).goalY, 592);
    assert.equal(touchTapPlan(410, 1300, ladder).goalY, 1004);
  });
  it('the climb steps toward the goal until there or until the player takes over', () => {
    assert.equal(climbGoalStep(700, 900), 'up');
    assert.equal(climbGoalStep(900, 700), 'down');
    assert.equal(climbGoalStep(700, 704), '');
    assert.equal(climbGoalStep(700, 900, { held: true }), '');
    assert.equal(climbGoalStep(null, 900), '');
  });
  it('game.js climbs on arrival and drops the goal when the climb ends', () => {
    assert.match(game, /if \(w\.ladderGoalY != null && \(reason === 'arrived' \|\| reason === 'wall'\)\) climbTappedLadder\(w\.ladderGoalY\);/);
    assert.match(game, /climb\.wall = null;\s*climb\.goalY = null;/);
    assert.match(game, /const step = climbGoalStep\(climb\.goalY, player\.y, \{ held: left \|\| right \|\| up \|\| down \}\);/);
  });
});

describe('placement', () => {
  it('sit under every panel, above the pack row, clear of the safe area', () => {
    const block = css.slice(css.indexOf('/* —— TOUCH ——'), css.indexOf('/* —— end TOUCH —— */'));
    assert.ok(block.length > 100);
    assert.match(block, /\.touch-controls \{[^}]*z-index: var\(--z-hud\);/);
    assert.match(block, /bottom: calc\(var\(--pack-live-height, 72px\) \+ env\(safe-area-inset-bottom, 0px\)\);/);
    assert.match(block, /left: max\(var\(--sp-4\), env\(safe-area-inset-left, 0px\)\);/);
    assert.match(block, /right: max\(var\(--sp-6\), env\(safe-area-inset-right, 0px\)\);/);
    // Thumb-sized: Jump at least 44 px.
    const jump = block.match(/\.touch-jump \{[^}]*width: (\d+)px; height: (\d+)px;/);
    assert.ok(Number(jump[1]) >= 44 && Number(jump[2]) >= 44);
    assert.match(block, /touch-action: none/);
    // The start card (z-world, under the HUD) hides them until it closes.
    assert.match(block, /#game-root:has\(> #overlay:not\(\.hidden\)\) \.touch-controls \{ display: none; \}/);
  });
});
