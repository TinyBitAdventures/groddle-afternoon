/**
 * Parallax layers, layer colour treatment, and sky gradients restored from
 * the archived location XML (build-street-layers.mjs).
 * Run: node --test tests/street-layers.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glitchLayerMatrix, parallaxLayerOffset } from '../public/js/street-render.js';

const here = dirname(fileURLToPath(import.meta.url));
const street = (tsid) =>
  JSON.parse(readFileSync(join(here, `../public/assets/streets/${tsid}.json`), 'utf8'));

describe('street layer data', () => {
  it('carries Hell One’s red sky gradient and silhouette filters', () => {
    const hell = street('GA5PPFP86NF2FOS');
    assert.deepEqual(hell.gradient, { top: 'FF5330', bottom: '690900' });
    const bg1 = hell.layers.find((layer) => layer.id === 'bg_1');
    assert.equal(bg1.w, 2740);
    assert.equal(bg1.h, 990);
    assert.equal(bg1.filters.saturation, -100);
  });

  it('gives every non-middleground layer on Hechey Track a parallax canvas size', () => {
    const hechey = street('GLI2V0UN7RD1T2J');
    for (const layer of hechey.layers) {
      assert.ok(layer.w > 0 && layer.h > 0, layer.id);
    }
  });
});

describe('layer colour matrix (client ColorMatrix.as)', () => {
  it('is null for an untreated layer', () => {
    assert.equal(glitchLayerMatrix({}), null);
    assert.equal(glitchLayerMatrix({ blur: 10 }), null);
  });

  it('applies brightness as a 0-255 offset normalized for Pixi', () => {
    const m = glitchLayerMatrix({ brightness: -100 });
    assert.equal(m[0], 1);
    assert.ok(Math.abs(m[4] + 100 / 255) < 1e-9);
  });

  it('fully desaturates at -100 using the client luminance weights', () => {
    const m = glitchLayerMatrix({ saturation: -100 });
    assert.ok(Math.abs(m[0] - 0.212671) < 1e-9);
    assert.ok(Math.abs(m[1] - 0.71516) < 1e-9);
    assert.ok(Math.abs(m[2] - 0.072169) < 1e-9);
  });

  it('keeps the source tint’s shifted blue row', () => {
    const m = glitchLayerMatrix({ tintAmount: 100, tintColor: 0x0000ff });
    assert.equal(m[12], 0);
    assert.ok(Math.abs(m[11] - 0.072169) < 1e-9);
  });
});

describe('parallax layer offset (LocationRenderer.recomputeParallax)', () => {
  const layer = { w: 2000, h: 900 };
  it('pins the layer’s left/top edge at the street start', () => {
    assert.deepEqual(parallaxLayerOffset(layer, 0, 0, 960, 408, 3000, 1000), { x: 0, y: 0 });
  });

  it('reaches the layer’s right/bottom edge at the street end', () => {
    const at = parallaxLayerOffset(layer, 2040, 592, 960, 408, 3000, 1000);
    assert.equal(at.x - 2040, 960 - 2000);
    assert.equal(at.y - 592, 408 - 900);
  });
});
