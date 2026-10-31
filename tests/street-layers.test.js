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
import { glitchLayerMatrix, parallaxLayerOffset } from '../public/js/street-render.js?v=3bcef6a7';

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

  it('tints with quasimondo colorize, the production default (alt_color_matrix)', () => {
    const m = glitchLayerMatrix({ tintAmount: 100, tintColor: 0x0000ff });
    assert.ok(Math.abs(m[10] - 0.212671) < 1e-9);
    assert.ok(Math.abs(m[11] - 0.71516) < 1e-9);
    assert.ok(Math.abs(m[12] - 0.072169) < 1e-9);
    // Le Misérable's purple panel light stays purple on white (j9xJLETQzi4).
    const p = glitchLayerMatrix({ tintAmount: 100, tintColor: 0x9f3dd4 });
    const white = (row) => p[row] + p[row + 1] + p[row + 2] + p[row + 4];
    assert.ok(white(10) > white(0) && white(0) > white(5), `rgb ${[0, 5, 10].map(white).map((v) => v.toFixed(2))}`);
  });

  it('applies contrast as a linear stretch about 128 after the tint', () => {
    const m = glitchLayerMatrix({ contrast: 50 });
    assert.equal(m[0], 1.5);
    assert.ok(Math.abs(m[4] - (128 * -0.5) / 255) < 1e-9);
  });
});

describe('parallax layer offset (LocationRenderer.recomputeParallax)', () => {
  const layer = { w: 2000, h: 900 };
  it('pins the layer’s left/top edge at the street start', () => {
    assert.deepEqual(parallaxLayerOffset(layer, 0, 0, 960, 408, 3000, 1000), { x: 0, y: 0 });
  });

  it('keeps a street-sized layer on the ground when the camera runs past the bottom', () => {
    // Hechey Track's middleplus dirt (6000 x 1000, like the middleground) with the
    // camera 10 px below the declared street (camera world height 1102).
    const dirt = { w: 6000, h: 1000 };
    for (const camY of [0, 300, 592, 602, 694]) {
      const at = parallaxLayerOffset(dirt, 2000, camY, 960, 408, 6000, 1000);
      assert.equal(at.y, 0, `camY ${camY}`);
    }
  });

  it('reaches the layer’s right/bottom edge at the street end', () => {
    const at = parallaxLayerOffset(layer, 2040, 592, 960, 408, 3000, 1000);
    assert.equal(at.x - 2040, 960 - 2000);
    assert.equal(at.y - 592, 408 - 900);
  });
});
