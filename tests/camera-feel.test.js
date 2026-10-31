/**
 * FEEL: the camera's ease and the parallax layers drawn from it (js/camera-feel.js).
 * Austin (2026-10-30): on Guillermo Gamera Way the far layers "shift left/right ever so slightly
 * while the main character is slowing down". Each plane was rounded on its own in view pixels,
 * so against the middleground they went back and forth while the camera eased to a stop.
 * Run: node --test tests/camera-feel.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAMERA_REST_DEVICE_PX,
  drawnLayerOffset,
  easeCameraAxis,
  layerScreenDir,
  settleOnDevice,
  snapToDevice,
} from '../public/js/camera-feel.js?v=e668afc5';
import { dampingAlpha } from '../public/js/movement.js?v=a314f8a1';
import { parallaxLayerOffset } from '../public/js/street-render.js?v=ae048a15';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

// Guillermo Gamera Way (GM4109NI2R640): 8000 px wide, its seven parallax layers' widths.
const STREET_W = 8000;
const LAYER_W = { bg_2: 5984, foreground: 8800, L8951808305521: 6520, sky: 4000, middleplus: 8000, bg_1: 7040, L9675856784521: 5000 };
// The stage at 1440x900 and 1920x1080 on a DPR 2 screen (js/location-view.js stageFor, render-density).
const STAGES = [{ viewW: 1363, res: 2.1 }, { viewW: 1515, res: 2.55 }];

/** The avatar lets go of D at full speed: friction takes vx down (0.78 a frame), then it stands. */
function stopFrames(startX = 1500, frames = 200) {
  const xs = [];
  let x = startX;
  let vx = 4.4;
  for (let i = 0; i < frames; i++) {
    x += vx;
    vx = vx * 0.78 < 0.05 ? 0 : vx * 0.78;
    xs.push(x);
  }
  return xs;
}

/** Every plane's screen x per frame, the way game.js draws it now (street-render updateParallax). */
function drawNow({ viewW, res }, xs) {
  let state = { value: xs[0] - viewW / 2 - 60, rest: false, dir: 0 }; // the camera trails the walking avatar
  const rows = [];
  for (const px of xs) {
    state = easeCameraAxis(state.value, px - viewW / 2, dampingAlpha(0.08, 1), res, state);
    const cam = state.value;
    const row = { rest: state.rest, mid: -cam };
    for (const [id, w] of Object.entries(LAYER_W)) {
      const at = parallaxLayerOffset({ w, h: 1000 }, cam, 0, viewW, 408, STREET_W, 2000);
      const prev = rows.length ? rows.at(-1)[id] : NaN;
      row[id] = -cam + drawnLayerOffset(at.x, cam, state.rest ? res : 0, layerScreenDir(state.dir, viewW, w), prev);
    }
    rows.push(row);
  }
  return rows;
}

/** The same frames the way game.js drew them before: world to half a view px, layers floored. */
function drawBefore({ viewW }, xs) {
  let cam = xs[0] - viewW / 2 - 60;
  const rows = [];
  for (const px of xs) {
    cam += (px - viewW / 2 - cam) * dampingAlpha(0.08, 1);
    const worldX = -Math.round(cam * 2) / 2;
    const row = { mid: worldX };
    const perc = -worldX / (STREET_W - viewW);
    for (const [id, w] of Object.entries(LAYER_W)) row[id] = Math.floor(perc * (viewW - w));
    rows.push(row);
  }
  return rows;
}

/** Direction changes in a series, ignoring frames that hold still. */
function reversals(values) {
  const steps = values.slice(1).map((v, i) => v - values[i]).filter((d) => Math.abs(d) > 1e-9);
  let n = 0;
  for (let i = 1; i < steps.length; i++) if (Math.sign(steps[i]) !== Math.sign(steps[i - 1])) n++;
  return n;
}

describe('camera ease (easeCameraAxis)', () => {
  it('closes the gap without ever turning back, and rests within a device pixel of the target', () => {
    for (const res of [2, 2.1, 2.55]) {
      for (const [from, to] of [[0, 100], [500, -20], [10, 10.3], [3.33, 3.4]]) {
        let state = { value: from, rest: false, dir: 0 };
        const dir = Math.sign(to - from);
        for (let i = 0; i < 400; i++) {
          const next = easeCameraAxis(state.value, to, dampingAlpha(0.08, 1.7), res, state);
          assert.ok((next.value - state.value) * dir >= -1e-9, `${from}->${to} @${res} turned back at ${i}`);
          state = next;
        }
        assert.equal(state.rest, true);
        assert.ok(Math.abs(state.value - to) < 1 / res, `${from}->${to} @${res} rests within a device px`);
        assert.ok(Math.abs(state.value * res - Math.round(state.value * res)) < 1e-6, 'rests on a device pixel');
      }
    }
  });

  it('arrives within a quarter of a device pixel, stepping on along its way', () => {
    const res = 2.5;
    const a = easeCameraAxis(45.70, 45.754, 0.08, res, { rest: false, dir: 1 });
    assert.equal(a.rest, true);
    assert.equal(a.dir, 1);
    assert.equal(a.value, 46); // the nearest pixel (45.6) is behind 45.70, so the next one on
    assert.equal(easeCameraAxis(10.4, 10.45, 0.08, 2, { rest: false, dir: 1 }).value, 10.5); // nearest, ahead
    const b = easeCameraAxis(100, 101, 0.08, res, { rest: false, dir: 1 });
    assert.equal(b.rest, false);
    assert.ok(Math.abs(b.value - 100.08) < 1e-12);
    assert.ok(CAMERA_REST_DEVICE_PX < 1);
  });

  it('holds at rest until the target is a device pixel away, then eases from where it rests', () => {
    const res = 2;
    let s = { value: 50, rest: true, dir: 1 };
    s = easeCameraAxis(s.value, 50.3, 0.08, res, s);
    assert.deepEqual(s, { value: 50, rest: true, dir: 1 });
    s = easeCameraAxis(s.value, 49.6, 0.08, res, s);
    assert.deepEqual(s, { value: 50, rest: true, dir: 1 });
    s = easeCameraAxis(s.value, 45, 0.08, res, s);
    assert.equal(s.rest, false);
    assert.equal(s.dir, -1);
    assert.ok(Math.abs(s.value - 49.6) < 1e-9, 'departs from the resting value, no jump');
  });

  it('starts on the target when the camera has no position yet', () => {
    assert.deepEqual(easeCameraAxis(undefined, 42, 0.08, 2), { value: 42, rest: true, dir: 0 });
    assert.deepEqual(easeCameraAxis(NaN, 42.2, 0.08, 2), { value: 42, rest: true, dir: 0 });
  });
});

describe('device-pixel snapping', () => {
  it('snaps to multiples of 1 / resolution, nearest or along a direction', () => {
    assert.equal(snapToDevice(10.3, 2), 10.5);
    assert.equal(snapToDevice(10.2, 2), 10);
    assert.equal(snapToDevice(10.2, 2, 1), 10.5);
    assert.equal(snapToDevice(10.3, 2, -1), 10);
    assert.equal(snapToDevice(10.5, 2, 1), 10.5);
    const v = snapToDevice(123.456, 2.55);
    assert.ok(Math.abs(v * 2.55 - Math.round(v * 2.55)) < 1e-9);
    assert.equal(snapToDevice(7.3, 0), 7);
  });

  it('settles on the nearest device pixel unless that steps back past last frame', () => {
    assert.equal(settleOnDevice(10.3, NaN, 2, 1), 10.5);
    assert.equal(settleOnDevice(10.2, 9.9, 2, 1), 10);
    assert.equal(settleOnDevice(10.2, 10.1, 2, 1), 10.5);
    assert.equal(settleOnDevice(10.2, 10.15, 2, 1), 10.5);
    assert.equal(settleOnDevice(-10.2, -10.15, 2, -1), -10.5);
    assert.equal(settleOnDevice(10.2, 10.15, 2, 0), 10);
    assert.equal(settleOnDevice(10.2, 400, 2, 1), 10, 'a jump (new place) is never held back');
  });

  it('puts a layer\'s screen position (not its local x) on a device pixel', () => {
    const cam = 941.744;
    assert.equal(drawnLayerOffset(-500.123, cam, 0), -500.123);
    const exact = -500.123 - cam;
    const screen = drawnLayerOffset(-500.123, cam, 2.1, -1, exact + 0.01) - cam;
    assert.ok(Math.abs(screen * 2.1 - Math.round(screen * 2.1)) < 1e-6);
    assert.ok(screen <= exact + 0.01 + 1e-9, 'never back past last frame along its way');
  });

  it('a layer wider than the view moves against the camera, a narrower one with it', () => {
    assert.equal(layerScreenDir(1, 1363, 5984), -1);
    assert.equal(layerScreenDir(-1, 1363, 5984), 1);
    assert.equal(layerScreenDir(1, 1363, 1000), 1);
    assert.equal(layerScreenDir(1, 1363, 1363), 0);
    assert.equal(layerScreenDir(0, 1363, 5984), 0);
  });
});

describe('parallax layers while the avatar stops (Guillermo Gamera Way)', () => {
  it('parallaxLayerOffset is exact: no per-layer whole-pixel floor', () => {
    const at = parallaxLayerOffset({ w: 5984, h: 1824 }, 900.25, 0, 1363, 408, STREET_W, 2000);
    assert.ok(Math.abs(at.x - (900.25 + (900.25 / (STREET_W - 1363)) * (1363 - 5984))) < 1e-9);
    assert.notEqual(at.x, Math.floor(at.x));
  });

  for (const stage of STAGES) {
    it(`before: layers wobbled against the middleground (view ${stage.viewW}, res ${stage.res})`, () => {
      const rows = drawBefore(stage, stopFrames());
      const wobbles = Object.keys(LAYER_W).map((id) => reversals(rows.map((r) => r[id] - r.mid)));
      assert.ok(wobbles.some((n) => n >= 5), `expected the old wobble, got ${wobbles}`);
    });

    it(`now: every plane slides one way and its parallax against the world never turns back (view ${stage.viewW}, res ${stage.res})`, () => {
      const rows = drawNow(stage, stopFrames());
      const restAt = rows.findIndex((r) => r.rest);
      assert.ok(restAt > 20, 'the camera eases after the avatar stops');
      assert.ok(rows.slice(restAt).every((r) => r.rest), 'once at rest it stays');
      for (const id of ['mid', ...Object.keys(LAYER_W)]) {
        // The whole stop, arrival included: each plane only ever moves one way.
        assert.equal(reversals(rows.map((r) => r[id])), 0, `${id} screen x`);
        if (id !== 'mid') assert.equal(reversals(rows.slice(0, restAt).map((r) => r[id] - r.mid)), 0, `${id} against the middleground`);
      }
      // Arriving moves each plane by under a device pixel, once, and lands it on a device pixel.
      const last = rows[restAt - 1];
      const rest = rows[restAt];
      for (const id of ['mid', ...Object.keys(LAYER_W)]) {
        assert.ok(Math.abs(rest[id] - last[id]) * stage.res < 1.1, `${id} settle step`);
        assert.ok(Math.abs(rest[id] * stage.res - Math.round(rest[id] * stage.res)) < 1e-6, `${id} on a device pixel at rest`);
        assert.equal(rows.at(-1)[id], rest[id], `${id} holds still at rest`);
      }
    });
  }
});

describe('game.js wiring', () => {
  it('eases both camera axes with easeCameraAxis, one position per frame, drawn as is', () => {
    assert.match(game, /cameraRest\.x = easeCameraAxis\(camTarget, target, dampingAlpha\(0\.08, dt\), camRes, cameraRest\.x\)/);
    assert.match(game, /cameraRest\.y = easeCameraAxis\(camY, targetY, dampingAlpha\(0\.12, dt\), camRes, cameraRest\.y\)/);
    assert.match(game, /camTarget = cameraRest\.x\.value;\n\s*world\.x = -camTarget;/);
    assert.match(game, /camY = cameraRest\.y\.value;\n\s*world\.y = -camY;/);
    assert.doesNotMatch(game, /camTarget \+= \(target - camTarget\)/);
  });

  it('hands the street the camera\'s rest state so layers snap only at rest', () => {
    assert.match(game, /bgLayer\?\.updateParallax\?\.\(-world\.x, -world\.y, VIEW_W, LOCATION_VIEW_H, VIEW_H, parallaxSnap\(\)\)/);
    assert.match(game, /x: cameraRest\.x\.rest \? res : 0, y: cameraRest\.y\.rest \? res : 0, dx: cameraRest\.x\.dir, dy: cameraRest\.y\.dir/);
  });
});
