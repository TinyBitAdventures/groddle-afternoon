import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RENDER_RESOLUTION, renderResolution } from '../public/js/render-density.js';

test('backing store matches the displayed canvas density', () => {
  // 1574 CSS px on Retina: the old fixed 2x store was upscaled 1.64x.
  assert.equal(renderResolution(1574, 960, 2), 3.3);
  assert.equal(renderResolution(960, 960, 2), 2);
  assert.equal(renderResolution(1280, 960, 1), 1.35);
});

test('never drops below 1 or above the cap', () => {
  assert.equal(renderResolution(390, 960, 1), 1);
  assert.equal(renderResolution(390, 960, 3), 1.2);
  assert.equal(renderResolution(2560, 960, 2), MAX_RENDER_RESOLUTION);
});

test('falls back to the view width and a dpr of 1', () => {
  assert.equal(renderResolution(0, 960, 0), 1);
  assert.equal(renderResolution(undefined, 960, undefined), 1);
});
