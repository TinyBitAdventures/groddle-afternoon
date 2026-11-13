/**
 * PINCH PREVIEW (Austin 2026-11-13 on his iPhone: "The phone zoom in/out flickers and is mostly black
 * during the zoom itself"): a pinch resized the renderer once a frame, after Pixi had drawn, so the
 * screen showed the cleared canvas. Now js/touch-pinch.js says when a pinch begins and ends, game.js
 * scales only app.stage between, and sizes the renderer once, drawing at once, when the fingers lift.
 * Run: node --test tests/phone-pinch-preview.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPinchZoom } from '../public/js/touch-pinch.js?v=5bdb5971';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const fnBody = (name) => {
  const at = game.indexOf(`function ${name}(`);
  assert.ok(at >= 0, name);
  return game.slice(at, game.indexOf('\n}\n', at));
};

/** A canvas that keeps its listeners, and touch events as the browser sends them. */
function rig() {
  const on = {};
  const canvas = { style: {}, addEventListener: (t, fn) => { on[t] = fn; }, removeEventListener: (t) => { delete on[t]; }, setPointerCapture() {} };
  const log = [];
  let level = 0;
  const frames = [];
  const win = { requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; }, cancelAnimationFrame: () => {} };
  const api = installPinchZoom({
    canvas,
    tap: () => log.push('tap'),
    getLevel: () => level,
    setLevel: (z) => { level = z; log.push(`level ${z}`); },
    span: () => 2,
    begin: () => log.push('begin'),
    end: () => log.push('end'),
    win,
  });
  const ev = (type, id, x, y = 300) => on[type]({ type, pointerType: 'touch', isTrusted: true, pointerId: id, clientX: x, clientY: y });
  const frame = () => { const fns = frames.splice(0); for (const fn of fns) fn(); };
  return { api, ev, frame, log, on };
}

describe('js/touch-pinch.js: begin before the first level, end after the last', () => {
  it('a pinch that moves: begin once, levels once a frame, end once after the final level', () => {
    const { ev, frame, log } = rig();
    ev('pointerdown', 1, 150);
    ev('pointerdown', 2, 250);
    assert.deepEqual(log, [], 'two fingers down alone begin nothing');
    ev('pointermove', 2, 300);
    assert.deepEqual(log, ['begin']);
    ev('pointermove', 2, 350);
    frame();
    assert.deepEqual(log, ['begin', 'level 1']);
    ev('pointermove', 2, 300);
    ev('pointerup', 2, 300);
    assert.deepEqual(log, ['begin', 'level 1', 'level 0.58', 'end']);
    ev('pointerup', 1, 150);
    assert.deepEqual(log, ['begin', 'level 1', 'level 0.58', 'end'], 'no tap after a pinch, no second end');
  });
  it('a two-finger tap (no spread) never begins or ends', () => {
    const { ev, log } = rig();
    ev('pointerdown', 1, 150);
    ev('pointerdown', 2, 250);
    ev('pointermove', 2, 252);
    ev('pointerup', 2, 252);
    ev('pointerup', 1, 150);
    assert.deepEqual(log, []);
  });
  it('a cancelled pinch still ends; one finger is a tap with no begin', () => {
    const a = rig();
    a.ev('pointerdown', 1, 150);
    a.ev('pointerdown', 2, 250);
    a.ev('pointermove', 2, 320);
    a.ev('pointercancel', 1, 150);
    assert.equal(a.log[0], 'begin');
    assert.equal(a.log.at(-1), 'end');
    const b = rig();
    b.ev('pointerdown', 1, 150);
    b.ev('pointerup', 1, 152);
    assert.deepEqual(b.log, ['tap']);
  });
  it('destroy mid-pinch ends it', () => {
    const { api, ev, log } = rig();
    ev('pointerdown', 1, 150);
    ev('pointerdown', 2, 250);
    ev('pointermove', 2, 320);
    api.destroy();
    assert.deepEqual(log, ['begin', 'end']);
  });
});

describe('game.js: no renderer resize while a pinch is live', () => {
  it('the pinch wires begin and end to the preview', () => {
    assert.match(game, /begin: \(\) => beginPinchPreview\(\),\n\s*end: \(\) => endPinchPreview\(\),/);
  });
  it('the stage only scales during the preview; the renderer, CSS band and resize relay wait', () => {
    const sync = fnBody('syncLocationViewHeight');
    assert.match(sync, /if \(root && !stage\.pinned && !pinchPreview\) \{/);
    assert.match(sync, /if \(pinchPreview && app\?\.stage\) app\.stage\.scale\.set\(STAGE_SCALE \/ pinchPreview\.scale\);/);
    assert.match(sync, /if \(!pinchPreview\) resizeRendererToView\(stage\.cssWidth\);/);
    assert.doesNotMatch(sync, /app\.renderer\.resize\(/, 'every resize goes through resizeRendererToView');
    assert.match(fnBody('syncRenderResolution'), /if \(!app\?\.renderer \|\| !app\.canvas \|\| pinchPreview\) return;/);
    const apply = fnBody('applyWorldZoom');
    assert.ok(apply.indexOf('if (pinchPreview) return;') < apply.indexOf("dispatchEvent(new Event('resize'))"));
  });
  it('the lift sizes the renderer once, then draws in the same task', () => {
    const end = fnBody('endPinchPreview');
    const order = ['pinchPreview = null;', 'app.stage.scale.set(1);', 'resizeRendererToView(', 'app.render();', "dispatchEvent(new Event('resize'))"].map((s) => end.indexOf(s));
    assert.ok(order.every((i) => i >= 0), String(order));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(fnBody('beginPinchPreview'), /pinchPreview = \{ scale: STAGE_SCALE \};/);
  });
  it('no em-dashes in the new words', () => {
    for (const name of ['beginPinchPreview', 'endPinchPreview', 'resizeRendererToView']) assert.doesNotMatch(fnBody(name), /—/);
    assert.doesNotMatch(readFileSync(join(root, 'public/js/touch-pinch.js'), 'utf8'), /—/);
  });
});
