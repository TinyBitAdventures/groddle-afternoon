/**
 * G298: a home yard poof fades the new item in (poofItIn,
 * LocationItemstackView.as 738-769: view_holder.alpha = 0, then a 1 s tween to
 * 1 after 0.2 s) even though other systems draw it: js/poof-fade.js fades the
 * layer's new children near the poof.
 * Run: node --test tests/poof-fade.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fadeInNewNear, layerCentreX, newChildrenNear } from '../public/js/poof-fade.js';
import { POOF_IN } from '../public/js/overlay-art.js?v=g294-1';

const here = dirname(fileURLToPath(import.meta.url));
const clientPath = join(here, '../../glitch-client/com/tinyspeck/engine/view/itemstack/LocationItemstackView.as');

/** A display object with a bounds box in its layer (the layer is unscaled, at the origin). */
function child(x, w = 40, extra = {}) {
  return { x, alpha: 1, destroyed: false, getBounds: () => ({ x: x - w / 2, y: 0, width: w, height: 30 }), ...extra };
}
const layer = (children) => ({ children, toLocal: (p) => ({ x: p.x, y: p.y }) });

describe('poof fade: which children', () => {
  it('only children new since the redraw began, near the poof x', () => {
    const old = child(500);
    const near = child(520);
    const far = child(900);
    const before = new Set([old]);
    const got = newChildrenNear([old, near, far], before, 500, 60, (c) => c.x);
    assert.deepEqual(got, [near]);
  });

  it('skips destroyed children and the puff overlay itself', () => {
    const gone = child(500, 40, { destroyed: true });
    const puff = child(500, 40, { label: 'overlay:proto_puff' });
    assert.deepEqual(newChildrenNear([gone, puff], new Set(), 500, 60, (c) => c.x), []);
  });

  it('a container at the origin is judged by its drawn bounds, not its position', () => {
    const garden = { x: 0, alpha: 1, getBounds: () => ({ x: 480, y: 0, width: 60, height: 20 }) };
    assert.equal(layerCentreX(layer([]), garden), 510);
    const empty = { x: 700, getBounds: () => ({ x: 0, y: 0, width: 0, height: 0 }) };
    assert.equal(layerCentreX(layer([]), empty), 700);
  });
});

describe('poof fade: timing', () => {
  it('0 for 0.2 s, then up over 1 s to each child\'s own alpha (TSTweener alpha 1, time 1, delay .2)', { skip: !existsSync(clientPath) }, () => {
    const src = readFileSync(clientPath, 'utf8');
    assert.match(src, /private function poofItIn\(\):void \{\n\t\t\tview_holder\.alpha = 0;/);
    assert.match(src, /TSTweener\.addTween\(view_holder, \{alpha:1, time:1, delay:\.2\}\);/);
    assert.equal(POOF_IN.fadeInDelayMs, 200);
    assert.equal(POOF_IN.fadeInMs, 1000);
  });

  it('steps on the frame callback and ends at the base alpha', () => {
    let now = 0;
    const frames = [];
    const raf = (fn) => frames.push(fn);
    const a = child(500);
    const b = child(510, 40, { alpha: 0.5 });
    const keep = child(500);
    const L = layer([keep, a, b]);
    const out = fadeInNewNear(L, new Set([keep]), { x: 500, halfW: 60, clock: () => now, raf });
    assert.deepEqual(out, [a, b]);
    assert.equal(a.alpha, 0);
    assert.equal(keep.alpha, 1);
    const run = (ms) => {
      now = ms;
      frames.shift()();
    };
    run(100);
    assert.equal(a.alpha, 0);
    run(700);
    assert.equal(a.alpha, 0.5);
    assert.equal(b.alpha, 0.25);
    run(1300);
    assert.equal(a.alpha, 1);
    assert.equal(b.alpha, 0.5);
    assert.equal(frames.length, 0);
  });

  it('a child destroyed mid-fade is left alone; no frame callback means no fade', () => {
    let now = 0;
    const frames = [];
    const a = child(500);
    fadeInNewNear(layer([a]), new Set(), { x: 500, halfW: 60, clock: () => now, raf: (fn) => frames.push(fn) });
    a.destroyed = true;
    now = 600;
    frames.shift()();
    assert.equal(a.alpha, 0);
    assert.equal(frames.length, 0);
    const b = child(500, 40, { alpha: 0.8 });
    fadeInNewNear(layer([b]), new Set(), { x: 500, halfW: 60, raf: null });
    assert.equal(b.alpha, 0.8);
    assert.deepEqual(fadeInNewNear(layer([child(500)]), new Set(), { x: NaN, halfW: 60 }), []);
  });

  it('homes-feature fades what the yard redraw adds for the poofed item', () => {
    const homes = readFileSync(join(here, '../public/js/features/homes-feature.js'), 'utf8');
    assert.ok(/const poofBefore = pendingPoofs\.length \? new Set\(engine\.entityLayer\?\.children \|\| \[\]\) : null;/.test(homes));
    assert.ok(/fadeInNewNear\(engine\.entityLayer, before, \{ x: cultivationWorldX\(item, st\), halfW: footprint\(item\.protoClass\) \}\)/.test(homes));
  });
});
