/**
 * G844 (#393, Firefox on Windows at DPR 3 on a 4K screen): drawing into a render texture came back
 * fully transparent, so the report's world picture was black, the street map showed only its lines
 * and the ground skirt faded to the pale sky colour. Not reproduced here; these feed the code
 * transparent pixel buffers: a boot probe (js/render-probe.js) rides in the report's context, an
 * empty picture counts as failed everywhere one is drawn off screen and each place falls back,
 * and the street map and skirt targets get their depth and stencil first (#380b).
 * Run: node --test tests/g844-render-probe.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canvasTransparent, configureReadback, ensureDepthStencil, pixelsTransparent, probeRenderTexture, renderProbeLine } from '../public/js/render-probe.js?v=519c86ef';
import { snapshotEmpty, snapshotStreetView } from '../public/js/ui/street-minimap.js?v=9eabe65f';
import { SKIRT_DEEP_SHADE, shadeColour, skirtFadeColour } from '../public/js/street-render.js?v=dab4ec4b';
import { captureFrame, reportContext } from '../public/js/features/bug-report-feature.js?v=d4d7be10';

const PUBLIC = join(import.meta.dirname, '..', 'public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');

/** RGBA pixels: `n` pixels, every one clear, or with the pixel at `opaqueAt` drawn. */
function pixels(n, opaqueAt = -1) {
  const px = new Uint8ClampedArray(n * 4);
  if (opaqueAt >= 0) px.set([120, 160, 90, 255], opaqueAt * 4);
  return px;
}

/** A canvas-like whose 2D context hands back `data` (and a document whose copies do the same). */
function fakeCanvas(width, height, data) {
  const ctx = { drawImage() {}, getImageData: (x, y, w, h) => ({ data: data ?? pixels(w * h) }) };
  return { width, height, getContext: () => ctx };
}
const fakeDoc = (data) => ({ createElement: () => { const c = fakeCanvas(0, 0, data); return c; } });

describe('G844 an empty picture counts as failed', () => {
  it('pixelsTransparent: every alpha clear is empty, one drawn pixel is not', () => {
    assert.equal(pixelsTransparent(pixels(64)), true);
    assert.equal(pixelsTransparent(pixels(64, 63)), false);
    assert.equal(pixelsTransparent(new Uint8ClampedArray(0)), true);
    assert.equal(pixelsTransparent(null), true);
  });

  it('canvasTransparent: a small canvas is read whole, a large one as a copy; unreadable counts as drawn', () => {
    assert.equal(canvasTransparent(fakeCanvas(32, 16, pixels(32 * 16))), true);
    assert.equal(canvasTransparent(fakeCanvas(32, 16, pixels(32 * 16, 5))), false);
    // 1280 wide: read through a 96-wide copy the document makes.
    assert.equal(canvasTransparent(fakeCanvas(1280, 720), fakeDoc(pixels(96 * 54))), true);
    assert.equal(canvasTransparent(fakeCanvas(1280, 720), fakeDoc(pixels(96 * 54, 100))), false);
    assert.equal(canvasTransparent({ width: 10, height: 10, getContext: () => { throw new Error('tainted'); } }, { createElement: () => { throw new Error('no'); } }), false);
    assert.equal(canvasTransparent({ width: 0, height: 10 }), true);
    assert.equal(canvasTransparent('not a canvas'), false);
  });
});

describe('G844 the boot probe', () => {
  function fakeGl(rendererName) {
    const gl = Object.create(null);
    Object.assign(gl, { RENDERER: 1, MAX_TEXTURE_SIZE: 2, MAX_RENDERBUFFER_SIZE: 3 });
    gl.getParameter = (k) => ({ 1: rendererName, 2: 16384, 3: 16384, 99: 'ANGLE (NVIDIA GeForce RTX 3080 Direct3D11)' })[k];
    gl.getExtension = (n) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 99 } : null);
    return gl;
  }
  function fakeRenderer(drawn, rendererName = 'WebKit WebGL') {
    const calls = [];
    const target = { ensureDepthStencilTexture: () => calls.push('stencil') };
    return {
      calls,
      resolution: 3,
      gl: fakeGl(rendererName),
      renderTarget: { getRenderTarget: () => target },
      render: () => calls.push('render'),
      extract: { pixels: () => ({ pixels: pixels(64 * 9, drawn ? 0 : -1) }) },
    };
  }
  const PIXI = {
    RenderTexture: { create: (o) => ({ ...o, destroy() {} }) },
    Graphics: class { rect() { return this; } fill() { return this; } destroy() {} },
  };

  it('a square that comes back transparent fails, with the GPU name and limits', () => {
    const r = fakeRenderer(false);
    const p = probeRenderTexture(PIXI, r);
    assert.equal(p.ok, false);
    assert.equal(p.plain, false);
    assert.equal(p.gl, 'ANGLE (NVIDIA GeForce RTX 3080 Direct3D11)', 'masked RENDERER: the debug extension names it');
    assert.equal(p.maxTexture, 16384);
    assert.equal(p.maxRenderbuffer, 16384);
    assert.equal(p.resolution, 3);
    assert.deepEqual(r.calls, ['render', 'stencil', 'render'], 'plain first, then with its depth and stencil made before the draw');
    // G1166: a restore adds the bakes it dropped and the destroyed-texture draws since.
    assert.equal(renderProbeLine(p, { resolution: 3, restores: 1 }), 'rt failed (plain failed) · res 3 · tex 16384 · rb 16384 · restores 1 · bakes dropped 0 · dead draws 0 · webgl · ANGLE (NVIDIA GeForce RTX 3080 Direct3D11)');
  });

  it('a square that comes back drawn passes; Firefox keeps its own RENDERER', () => {
    const p = probeRenderTexture(PIXI, fakeRenderer(true, 'NVIDIA GeForce GTX 980, or similar'));
    assert.equal(p.ok, true);
    assert.equal(p.gl, 'NVIDIA GeForce GTX 980, or similar');
    assert.match(renderProbeLine(p), /^rt ok \(plain ok\) · res 3 · /);
    assert.equal(renderProbeLine(null), '');
    assert.ok(renderProbeLine({ ok: true, gl: 'x'.repeat(400) }).length <= 200, 'kept small');
  });

  it('game.js probes at boot and after a restored context, and keeps it on the canvas', () => {
    const game = read('game.js');
    assert.match(game, /runRenderProbe\(\);\n    \}\);\n  \}\);\n  runRenderProbe\(\);/);
    assert.match(game, /renderProbe = probeRenderTexture\(PIXI, app\?\.renderer\);/);
    assert.match(game, /app\.canvas\.dataset\.renderProbe = renderProbeLine\(/);
    assert.match(game, /renderProbeLine: \(\) => renderProbeLine\(renderProbe, \{ resolution: app\?\.renderer\?\.resolution, \.\.\.contextLossCounts\(\), motion: motionPreference\(\) \}\),/);
  });
});

describe("G844 the report's context and picture", () => {
  const env = { document: { querySelectorAll: () => [] }, location: { pathname: '/play/' }, navigator: { userAgent: 'Firefox' }, innerWidth: 1280, innerHeight: 720 };

  it('carries the probe line; a failed probe also rides in the errors, which the site keeps today', () => {
    const line = 'rt failed (plain failed) · res 3 · webgl2 · ANGLE';
    const failed = reportContext({ renderProbeLine: () => line, renderProbe: { ok: false, plain: false } }, ['e1'], env);
    assert.equal(failed.gpu, line);
    assert.deepEqual(failed.errors, ['e1', `render probe: ${line}`]);
    const fine = reportContext({ renderProbeLine: () => 'rt ok (plain ok)', renderProbe: { ok: true, plain: true } }, Array.from({ length: 12 }, (_, i) => `e${i}`), env);
    assert.equal(fine.gpu, 'rt ok (plain ok)');
    assert.equal(fine.errors.length, 10);
    assert.ok(!fine.errors.some((e) => e.startsWith('render probe')));
    const full = reportContext({ renderProbeLine: () => line, renderProbe: { ok: false } }, Array.from({ length: 12 }, (_, i) => `e${i}`), env);
    assert.equal(full.errors.length, 10);
    assert.equal(full.errors[9], `render probe: ${line}`);
  });

  it('an empty frame is no picture, never a black one (read from its own 2D context, no copy)', () => {
    const canvas = { getBoundingClientRect: () => ({ width: 1280 }) };
    const doc = { querySelector: () => canvas, createElement: () => { throw new Error('no copy is made'); } };
    const empty = fakeCanvas(1280, 720);
    assert.equal(captureFrame({ camera: { w: 1280 }, snapshotCanvas: () => empty }, doc), null);
    const drawn = fakeCanvas(1280, 720, pixels(1280 * 720, 3));
    assert.equal(captureFrame({ camera: { w: 1280 }, snapshotCanvas: () => drawn }, doc), drawn);
    // A frame that cannot be read is used as before.
    const opaque = { width: 1280, height: 720 };
    assert.equal(captureFrame({ camera: { w: 1280 }, snapshotCanvas: () => opaque }, doc), opaque);
    assert.equal(canvasTransparent(fakeCanvas(1280, 720), null), false, 'large, no document: not read, used');
  });

  it('game.js: the report picture is read through the one readback, which copies the screen when it fails', () => {
    const game = read('game.js');
    const fn = game.slice(game.indexOf('function stageCanvas('), game.indexOf('\n}\n', game.indexOf('function stageCanvas(')));
    // R29 (#517): js/render-probe.js readbackCanvas (tests/r29-readback.test.js drives it).
    assert.match(fn, /readbackCanvas\(PIXI, app\.renderer, \{ width: w, height: h, resolution, passes: \[\{ container: app\.stage \}\]/);
    assert.ok(!game.includes('function screenStageCanvas('), 'the screen copy lives in the readback');
    // A home frame copied from the screen: the camera is back, so the screen is drawn again.
    assert.match(game, /if \(frame && snapshotScreenCopies !== copies\) app\.renderer\.render\(\{ container: app\.stage \}\);/);
  });
});

describe('G844 the street map keeps its lines', () => {
  const view = { worldW: 1800, sourceWorldH: 738, children: [], updateParallax() {} };
  const PIXI = {
    RenderTexture: { create: (o) => ({ ...o, destroy() {} }) },
    Matrix: class { scale() { return this; } },
  };

  it('an empty snapshot is null (the lines picture stays); its target gets depth and stencil before drawing', () => {
    configureReadback();
    const calls = [];
    const renderer = {
      renderTarget: { getRenderTarget: () => ({ ensureDepthStencilTexture: () => calls.push('stencil') }) },
      render: () => calls.push('render'),
      extract: { canvas: () => fakeCanvas(150, 40, pixels(150 * 40)) },
    };
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.equal(snapshotStreetView(PIXI, renderer, view, { width: 150, height: 40 }, { W: 1800, H: 738 }), null);
    } finally {
      console.warn = warn;
    }
    assert.deepEqual(calls, ['stencil', 'render']);
    const drawn = fakeCanvas(150, 40, pixels(150 * 40, 77));
    assert.equal(snapshotStreetView(PIXI, { ...renderer, extract: { canvas: () => drawn } }, view, { width: 150, height: 40 }, { W: 1800, H: 738 }), drawn);
    assert.equal(snapshotEmpty(fakeCanvas(150, 40, pixels(150 * 40))), true);
  });

  it('ensureDepthStencil leaves a renderer without targets alone', () => {
    const rt = {};
    assert.equal(ensureDepthStencil({}, rt), rt);
    assert.equal(ensureDepthStencil(null, rt), rt);
  });
});

describe('G844 the ground skirt', () => {
  it('a band read that found nothing opaque fades to the sky darkened, not the raw pale sky', () => {
    assert.equal(skirtFadeColour(null, 0xb8d9bd, 0xb8d9bd), shadeColour(0xb8d9bd, SKIRT_DEEP_SHADE));
    assert.notEqual(skirtFadeColour(null, 0xb8d9bd, 0xb8d9bd), 0xb8d9bd);
    assert.equal(skirtFadeColour(null, 0x000000, 0x000000), 0x000000, 'black stays black (ticket 39)');
    assert.equal(skirtFadeColour(null, null, 0x6b8f3c), 0x6b8f3c, 'no gradient: the meadow green as before');
  });

  it('its targets get depth and stencil before drawing (the solid copy draws one sprite, no mask)', () => {
    const src = read('js/street-render.js');
    const fn = src.slice(src.indexOf('function buildGroundSkirt('), src.indexOf('root.groundSkirt = {'));
    assert.equal((fn.match(/ensureDepthStencil\(renderer, PIXI\.RenderTexture\.create\(/g) || []).length, 3);
    // R29 (#517): the band's colour is read through the one readback (its target gets them there).
    assert.match(fn, /const read = readbackPixels\(PIXI, renderer, \{/);
    assert.match(fn, /const solid = PIXI\.RenderTexture\.create\(/);
  });
});
