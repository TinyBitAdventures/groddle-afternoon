/**
 * G1171: the layer colour filters are Flash's ColorMatrixFilter: the matrix on unmultiplied
 * colour, every result clamped to 0-1, then multiplied by alpha again. Pixi 8's ColorMatrixFilter
 * skipped the clamp, so a see-through cloud on a brightening layer (Aranna's BG2) kept its
 * overshoot past white and drew whiter and more solid than the 2012 street templates.
 * Run: node --test tests/g1171-flash-colour-matrix.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colourFilter, flashColorMatrixFilter, flashColorMatrixPixel, glitchLayerMatrix } from '../public/js/street-render.js?v=cd2b2649';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const street = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));

/** Pixi 8.23's ColorMatrixFilter shader, then the 8-bit render target's clamp. */
function pixiPixel(m, [r, g, b, a]) {
  if (a > 0) { r /= a; g /= a; b /= a; }
  const res = [0, 5, 10, 15].map((i) => m[i] * r + m[i + 1] * g + m[i + 2] * b + m[i + 3] * a + m[i + 4]);
  return [res[0] * res[3], res[1] * res[3], res[2] * res[3], res[3]].map((v) => Math.min(1, Math.max(0, v)));
}
/** A premultiplied pixel over an opaque background, in bytes. */
const over = (px, bg) => [0, 1, 2].map((k) => Math.round(255 * Math.min(1, px[k] + (bg[k] / 255) * (1 - px[3]))));
const bytes = (px) => px.map((v) => Math.round(v * 255));

// Gummadi Gad's BG2 (saturation -45, contrast 27, brightness 36, blur 3), the template screen's case.
const BG2 = glitchLayerMatrix(street('GHV2SR7FENA29JQ').layers.find((l) => l.name === 'BG2').filters);
const SKY = [177, 203, 255];

describe('G1171: Flash colour matrix maths', () => {
  it('a translucent white pushed past white stays white at its own opacity', () => {
    const white48 = [0.48, 0.48, 0.48, 0.48];
    const flash = flashColorMatrixPixel(BG2, white48);
    assert.deepEqual(bytes(flash), [122, 122, 122, 122], 'clamped to white, alpha kept');
    assert.deepEqual(over(flash, SKY), [214, 228, 255], 'the unfiltered composite, as in Flash');
    // Pixi's filter keeps the overshoot in the premultiplied colour: brighter than white at 48%.
    assert.ok(over(pixiPixel(BG2, white48), SKY)[0] >= 240, 'the old filter drew it near solid white');
  });

  it('opaque art is the same as before wherever the colour stays in range', () => {
    let n = 0;
    for (let r = 0; r <= 1; r += 0.125) {
      for (let g = 0; g <= 1; g += 0.25) {
        for (let b = 0; b <= 1; b += 0.25) {
          const px = [r, g, b, 1];
          assert.deepEqual(bytes(flashColorMatrixPixel(BG2, px)), bytes(pixiPixel(BG2, px)), `opaque ${px}`);
          n += 1;
        }
      }
    }
    assert.ok(n > 100);
  });

  it('a translucent pixel that stays in range is unchanged too', () => {
    const px = [0.1, 0.12, 0.2, 0.5];
    assert.deepEqual(bytes(flashColorMatrixPixel(BG2, px)), bytes(pixiPixel(BG2, px)));
  });

  it('dark and darkening: no channel goes under 0, a clear pixel stays clear', () => {
    const dark = glitchLayerMatrix({ brightness: -80, contrast: 40 });
    const out = flashColorMatrixPixel(dark, [0.02, 0.01, 0.03, 0.3]);
    assert.deepEqual(bytes(out), [0, 0, 0, 77]);
    assert.equal(flashColorMatrixPixel(BG2, [0, 0, 0, 0])[3], 0, 'alpha row is identity: clear stays clear');
  });

  it('the offset column is in 0-255 units on 0-255 channels, as Flash documents', () => {
    // adjustBrightness(255) takes black to white; 51 lifts it a fifth.
    assert.deepEqual(bytes(flashColorMatrixPixel(glitchLayerMatrix({ brightness: 255 }), [0, 0, 0, 1])), [255, 255, 255, 255]);
    assert.deepEqual(bytes(flashColorMatrixPixel(glitchLayerMatrix({ brightness: 51 }), [0, 0, 0, 1])), [51, 51, 51, 255]);
  });

  it('both shaders clamp the result before multiplying by alpha', () => {
    const src = read('public/js/street-render.js');
    const gl = src.slice(src.indexOf('const COLOUR_MATRIX_GL'), src.indexOf('const COLOUR_MATRIX_WGSL'));
    assert.match(gl, /c\.rgb \/= c\.a;[\s\S]*result = clamp\(result, 0\.0, 1\.0\);\s*finalColor = vec4\(result\.rgb \* result\.a, result\.a\);/);
    const wgsl = src.slice(src.indexOf('const COLOUR_MATRIX_WGSL'), src.indexOf('let colourMatrixPrograms'));
    assert.match(wgsl, /c\.rgb \/ c\.a[\s\S]*result = clamp\(result, vec4<f32>\(0\.0\), vec4<f32>\(1\.0\)\);\s*return vec4<f32>\(result\.rgb \* result\.a, result\.a\);/);
  });
});

/** A PIXI with just what flashColorMatrixFilter builds. */
function fakePixi() {
  const made = [];
  class UniformGroup { constructor(u) { this.uniforms = Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v.value])); this.updates = 0; } update() { this.updates += 1; } }
  class Filter { constructor(o) { Object.assign(this, o); made.push(this); } }
  class ColorMatrixFilter { constructor() { throw new Error('a layer colour went through Pixi\'s ColorMatrixFilter'); } }
  return {
    made,
    PIXI: {
      UniformGroup, Filter, ColorMatrixFilter,
      defaultFilterVert: 'vert',
      GlProgram: { from: (o) => ({ gl: o.name, fragment: o.fragment }) },
      GpuProgram: { from: (o) => ({ gpu: o.fragment.entryPoint }) },
    },
  };
}

describe('G1171: every layer colour goes through the Flash filter', () => {
  it('colourFilter builds a flashColorMatrixFilter with the layer matrix', () => {
    const { PIXI, made } = fakePixi();
    const filters = street('GHV2SR7FENA29JQ').layers.find((l) => l.name === 'BG2').filters;
    const f = colourFilter(PIXI, filters);
    assert.equal(made.length, 1);
    assert.equal(f.flashColorMatrix, true);
    assert.equal(f.glProgram.gl, 'flash-color-matrix');
    assert.deepEqual(f.matrix, glitchLayerMatrix(filters));
    assert.equal(f.glitchFilters, filters);
    assert.equal(colourFilter(PIXI, { blur: 5 }), null, 'a blur-only layer has no colour filter');
    f.matrix = glitchLayerMatrix({ brightness: 10 });
    assert.equal(f.resources.colorMatrixUniforms.uniforms.uColorMatrix[4], 10 / 255, 'matrix sets the uniform');
  });

  it('street-render builds every layer colour with colourFilter, never Pixi\'s ColorMatrixFilter', () => {
    const src = read('public/js/street-render.js');
    // The one Pixi ColorMatrixFilter left is the edge fade's whitening, which cannot overshoot.
    const pixi = src.match(/new PIXI\.ColorMatrixFilter\(\)/g) || [];
    assert.equal(pixi.length, 1);
    assert.match(src, /const whiten = new PIXI\.ColorMatrixFilter\(\);\n\s*whiten\.matrix = \[0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0\];/);
    assert.match(src, /const colour = colourFilter\(PIXI, layer\.filters\);/);
    assert.match(src, /colourFilter\(PIXI, colour\.glitchFilters\)/, 'the blur bake\'s live decos');
    assert.match(src, /const signColour = colourFilter\(PIXI,/);
    assert.match(src, /const cm = flashColorMatrixFilter\(PIXI, matrix\);/);
  });

  it('game.js: the avatar tone, the entity layer and the memory lights use it', () => {
    const src = read('public/game.js');
    assert.match(src, /avatarTone = flashColorMatrixFilter\(PIXI, matrix\);/);
    assert.match(src, /entityLayer\.filters = \[flashColorMatrixFilter\(PIXI, bgLayer\.middlegroundMatrix\)\];/);
    assert.match(src, /return flashColorMatrixFilter\(PIXI, glitchLayerMatrix\(filters\)\);/);
    // No layer matrix reaches a Pixi ColorMatrixFilter.
    assert.doesNotMatch(src, /\.matrix = (glitchLayerMatrix\(|matrix;|bgLayer\.middlegroundMatrix)/);
  });

  it('the shared programs are built once per PIXI', () => {
    const { PIXI } = fakePixi();
    const a = flashColorMatrixFilter(PIXI, glitchLayerMatrix({ brightness: 1 }));
    const b = flashColorMatrixFilter(PIXI);
    assert.equal(a.glProgram, b.glProgram);
    assert.deepEqual(b.matrix, [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
  });
});
