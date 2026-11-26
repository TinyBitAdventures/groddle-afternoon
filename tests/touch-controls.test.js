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
  ACT_CANCEL_X,
  ACT_CHOOSE_LABEL,
  ACT_DRAG_STEP,
  STICK_DEAD,
  STICK_RADIUS,
  actDragPlan,
  climbGoalStep,
  isPhoneDevice,
  knobOffset,
  stickKeys,
  touchTapPlan,
} from '../public/js/touch-controls.js?v=8bc690ac';
import { chooseVerbRow, stepVerbRow } from '../public/js/ui/verb-menu.js?v=1ad4f969';

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
    assert.match(game, /if \(TOUCH_PHONE\) \{\s*(?:touchControls = )?installTouchControls\(/);
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
    // G876: the stick also notes what it holds (stickHeld), so reaching a ladder with it held Up is a press.
    // #695: while tending a garden the stick steps its plots first (gardenTendStick).
    assert.match(game, /press: \(k\) => \{\s*\/\/[^\n]*\n\s*if \(gardenTendStick\(k\)\) return;\s*keys\.add\(k\);\s*stickHeld\.add\(k\);\s*\},\s*release: \(k\) => \{\s*gardenTendStickNext\.delete\(k\);\s*keys\.delete\(k\);\s*stickHeld\.delete\(k\);\s*\},\s*jump: \(\) => \{\s*queueJump\(jumpState, movementNow\(\)\);\s*window\.dispatchEvent\(new CustomEvent\(TOUCH_JUMP_EVENT\)\);\s*\},/);
    assert.match(mod, /press\(' '\);\s*jump\(\);/);
  });
});

describe('Act (#327, G756)', () => {
  it('one press is one Enter, and it holds no keys', async () => {
    const { fakeControls } = await import('./touch-fake-dom.js');
    const c = fakeControls();
    const down = c.act.fire('pointerdown');
    assert.equal(down.defaultPrevented, true, 'never takes focus');
    assert.deepEqual(c.acts, [1]);
    assert.equal(c.keys.size, 0);
    c.act.fire('pointerup');
    assert.deepEqual(c.acts, [1], 'a release does not act again');
  });
  it('sits beside Jump, and game.js runs it down the Enter key\'s own path with the chooser', () => {
    assert.match(mod, /<button type="button" class="touch-act" data-touch-act aria-label="Act on what is nearby">Act<\/button>\s*<button type="button" class="touch-jump"/);
    assert.match(game, /act: \(\) => \{\s*const down = new KeyboardEvent\('keydown', \{ key: 'Enter', bubbles: true, cancelable: true \}\);\s*down\.touchAct = true;\s*window\.dispatchEvent\(down\);/);
    assert.match(game, /tryOpenNearestMenu\(\{ nearestFirst: e\.isTrusted === false && !e\.touchAct \}\);/);
    assert.match(css, /\.touch-act \{\n\s+position: absolute; bottom: calc\(var\(--sp-6\) \+ 44px\);/);
  });
});

/**
 * ACTPRESS (Austin 2026-11-15: "can another press on the action also select the menu item? Also even
 * better if press and drag on action could move the menu selection up/down").
 */
function fakeVerbMenu(spec) {
  const doc = { activeElement: null };
  const clicks = [];
  const el = { ownerDocument: doc, dataset: {}, querySelector: () => null, contains: (n) => rows.includes(n) };
  const rows = spec.map((r) => {
    const classes = new Set(['vm-row']);
    const row = {
      label: r.label,
      dataset: {},
      disabled: false,
      classList: { contains: (c) => classes.has(c), toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)) },
      getAttribute: (a) => (a === 'aria-disabled' && r.locked ? 'true' : null),
      hasAttribute: (a) => a === 'data-vm-back' && Boolean(r.back),
      getClientRects: () => [1],
      closest: (sel) => (sel === '.vm-row' ? row : null),
      matches: (sel) => sel === 'button',
      focus: () => { doc.activeElement = row; },
      click: () => clicks.push(r.label),
    };
    return row;
  });
  el.querySelectorAll = () => rows;
  const lit = () => doc.activeElement?.label ?? null;
  return { el, rows, doc, clicks, lit };
}

describe('Act drives an open menu (ACTPRESS)', () => {
  it('a drag steps one row per ACT_DRAG_STEP px, toward zero, and a long sideways move cancels', () => {
    assert.ok(ACT_DRAG_STEP >= 28 && ACT_DRAG_STEP <= 36);
    assert.deepEqual(actDragPlan(0, ACT_DRAG_STEP - 1), { steps: 0, cancel: false });
    assert.deepEqual(actDragPlan(5, ACT_DRAG_STEP), { steps: 1, cancel: false });
    assert.deepEqual(actDragPlan(0, ACT_DRAG_STEP * 2.5), { steps: 2, cancel: false });
    assert.deepEqual(actDragPlan(-10, -ACT_DRAG_STEP * 1.2), { steps: -1, cancel: false });
    assert.equal(actDragPlan(ACT_CANCEL_X, 0).cancel, true);
    assert.equal(actDragPlan(-ACT_CANCEL_X - 5, 40).cancel, true);
  });

  it('the highlight steps over locked rows and rests at either end', () => {
    // Austin's Spice Plant: Pet and Water locked, Harvest lit, Talk to below.
    const m = fakeVerbMenu([{ label: 'Pet', locked: true }, { label: 'Water', locked: true }, { label: 'Harvest' }, { label: 'Talk to' }]);
    m.rows[2].focus();
    stepVerbRow(m.el, 1);
    assert.equal(m.lit(), 'Talk to');
    stepVerbRow(m.el, 1);
    assert.equal(m.lit(), 'Talk to', 'rests on the last row');
    stepVerbRow(m.el, -1);
    assert.equal(m.lit(), 'Harvest');
    stepVerbRow(m.el, -1);
    assert.equal(m.lit(), 'Harvest', 'never lands on a locked row');
    const n = fakeVerbMenu([{ label: 'Pet' }, { label: 'Water', locked: true }, { label: 'Harvest' }]);
    n.rows[0].focus();
    stepVerbRow(n.el, 1);
    assert.equal(n.lit(), 'Harvest', 'skips the locked row between');
    stepVerbRow(n.el, -1);
    assert.equal(n.lit(), 'Pet');
  });

  it('choosing clicks the lit row, as a click would; a locked one goes through its own refusal', () => {
    const m = fakeVerbMenu([{ label: 'Pet', locked: true }, { label: 'Harvest' }]);
    m.rows[1].focus();
    chooseVerbRow(m.el);
    assert.deepEqual(m.clicks, ['Harvest']);
    m.rows[0].focus();
    chooseVerbRow(m.el);
    assert.deepEqual(m.clicks, ['Harvest', 'Pet'], 'the click reaches bindVerbMenu, which says why and stops it');
  });

  function controlsWithMenu(menuOpen = true) {
    const log = [];
    const state = { open: menuOpen };
    const menu = { step: (n) => log.push(`step ${n}`), choose: () => log.push('choose') };
    const frames = [];
    const flush = () => { for (const fn of frames.splice(0)) fn(); };
    return { log, state, flush, fake: import('./touch-fake-dom.js').then(({ fakeControls }) => fakeControls({
      win: { requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; } },
      install: { act: () => { log.push('act'); state.open = true; }, actMenu: () => (state.open ? menu : null) },
    })) };
  }

  it('a tap on Act with a menu open chooses its lit row, and only on the lift', async () => {
    const t = controlsWithMenu(true);
    const c = await t.fake;
    c.act.fire('pointerdown', { clientX: 300, clientY: 500 });
    assert.deepEqual(t.log, [], 'nothing on the press');
    c.act.fire('pointerup', { clientX: 302, clientY: 504 });
    assert.deepEqual(t.log, ['choose']);
    assert.equal(c.keys.size, 0, 'holds no keys');
  });

  it('the first Act still opens the menu and its lift chooses nothing', async () => {
    const t = controlsWithMenu(false);
    const c = await t.fake;
    c.act.fire('pointerdown', { clientX: 300, clientY: 500 });
    c.act.fire('pointerup', { clientX: 300, clientY: 500 });
    assert.deepEqual(t.log, ['act']);
    assert.equal(c.act.dataset.menu, 'open', 'Act reads Choose now');
    assert.equal(c.act.textContent, ACT_CHOOSE_LABEL);
    c.act.fire('pointerdown', { clientX: 300, clientY: 500 });
    c.act.fire('pointerup', { clientX: 300, clientY: 500 });
    assert.deepEqual(t.log, ['act', 'choose'], 'the second tap chooses');
  });

  it('press and drag steps the rows and the lift chooses; with no menu it opens one first', async () => {
    const t = controlsWithMenu(false);
    const c = await t.fake;
    c.act.fire('pointerdown', { clientX: 300, clientY: 500 });
    c.act.fire('pointermove', { clientX: 300, clientY: 500 + ACT_DRAG_STEP + 2 });
    assert.deepEqual(t.log, ['act'], 'waits a frame for the new menu to light its first row');
    t.flush();
    c.act.fire('pointermove', { clientX: 300, clientY: 500 + ACT_DRAG_STEP + 2 });
    c.act.fire('pointermove', { clientX: 304, clientY: 500 + ACT_DRAG_STEP * 2 + 2 });
    c.act.fire('pointermove', { clientX: 304, clientY: 500 + ACT_DRAG_STEP + 2 });
    c.act.fire('pointerup', { clientX: 304, clientY: 500 + ACT_DRAG_STEP + 2 });
    assert.deepEqual(t.log, ['act', 'step 1', 'step 1', 'step -1', 'choose']);
  });

  it('sideways a long way, a second finger or the browser\'s cancel lets go without choosing', async () => {
    const t = controlsWithMenu(true);
    const c = await t.fake;
    c.act.fire('pointerdown', { clientX: 300, clientY: 500 });
    c.act.fire('pointermove', { clientX: 300, clientY: 500 + ACT_DRAG_STEP });
    c.act.fire('pointermove', { clientX: 300 - ACT_CANCEL_X - 1, clientY: 500 + ACT_DRAG_STEP });
    c.act.fire('pointerup', { clientX: 200, clientY: 500 });
    assert.deepEqual(t.log, ['step 1']);
    t.log.length = 0;
    c.act.fire('pointerdown', { clientX: 300, clientY: 500, pointerId: 1 });
    c.act.fire('pointerdown', { clientX: 320, clientY: 500, pointerId: 2 });
    c.act.fire('pointerup', { clientX: 300, clientY: 500, pointerId: 1 });
    assert.deepEqual(t.log, [], 'a second finger on Act');
    c.act.fire('pointerdown', { clientX: 300, clientY: 500, pointerId: 3 });
    c.act.fire('pointermove', { clientX: 300, clientY: 500 + ACT_DRAG_STEP, pointerId: 3 });
    c.act.fire('pointercancel', { pointerId: 3 });
    c.act.fire('click', { detail: 1 });
    assert.deepEqual(t.log, ['step 1'], 'a cancelled drag');
    t.log.length = 0;
    // WebKit's tap that ends in pointercancel before its click still chooses.
    c.act.fire('pointerdown', { clientX: 300, clientY: 500, pointerId: 4 });
    c.act.fire('pointercancel', { pointerId: 4 });
    c.act.fire('lostpointercapture', { pointerId: 4 });
    c.act.fire('click', { detail: 1 });
    assert.deepEqual(t.log, ['choose']);
  });

  it('game.js hands Act the chooser or the verb menu, and the cue is in tokens', () => {
    assert.match(game, /actMenu: \(\) => \{\s*if \(enterChooser\?\.isOpen\(\)\) return enterChooser;[\s\S]{0,300}if \(menuTarget && menu && !menu\.hidden\) return actVerbMenu\(menu\);/);
    const cue = css.match(/\.touch-act\[data-menu="open"\] \{[^}]*\}/)?.[0] || '';
    assert.match(cue, /var\(--accent-soft\)/);
    assert.doesNotMatch(cue, /#[0-9a-f]{3,8}\b|\d+px\s*\/|font-size: \d/i);
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
