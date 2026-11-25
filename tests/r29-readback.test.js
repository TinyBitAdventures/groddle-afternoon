/**
 * R29 (#517, a high-resolution AMD machine: a blank street map and a flat brown ground band):
 * reading an off-screen picture back from the GPU fails there. The boot probe saw it, but only the
 * report picture fell back to a copy of the screen; the street map and the ground skirt's colour
 * read their render textures as before and got nothing. Now every read goes through one helper
 * (js/render-probe.js readbackCanvas / readbackPixels / readbackExtract) that copies the screen
 * when the probe failed or a read came back empty, and no other module reads pixels back.
 * Here the probe is made to fail (as &readback=fail does in the browser) with a fake screen.
 * Run: node --test tests/r29-readback.test.js
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { alphaFromBlackWhite, configureReadback, readbackCanvas, readbackExtract, readbackPixels, readbackUsesTexture } from '../public/js/render-probe.js?v=519c86ef';
import { snapshotStreetView } from '../public/js/ui/street-minimap.js?v=faab86a5';

const PUBLIC = join(import.meta.dirname, '..', 'public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');

class Matrix {
  constructor(a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0) { Object.assign(this, { a, b, c, d, tx, ty }); }
  scale(x, y) { this.a *= x; this.d *= y; return this; }
}
const PIXI = { Matrix, RenderTexture: { create: (o) => ({ ...o, destroy() {} }) } };

/**
 * A screen three pixels wide: a ground pixel, a clear one (the sky left out) and one half drawn.
 * Whatever is drawn to the screen shows over its clear colour; copies read it back.
 */
function fakeScreen() {
  const screen = { clear: [0, 0, 0, 1], renders: [], extracts: 0 };
  const over = (c) => {
    const bg = c.slice(0, 3).map((v) => v * 255);
    return [100, 150, 50, 255, bg[0], bg[1], bg[2], 255, 100 + bg[0] / 2, 50 + bg[1] / 2, bg[2] / 2, 255];
  };
  const ctx2d = (canvas) => ({
    drawImage(src) { if (src === screen.canvas) canvas.data = Uint8ClampedArray.from(over(screen.clear)); },
    clearRect() {},
    getImageData: () => ({ data: canvas.data }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData(img) { canvas.data = img.data; },
  });
  const doc = {
    createElement() {
      const c = { width: 0, height: 0, data: new Uint8ClampedArray(12) };
      const ctx = ctx2d(c);
      c.getContext = () => ctx;
      return c;
    },
  };
  screen.canvas = { width: 6, height: 2 };
  const renderer = {
    resolution: 2,
    canvas: screen.canvas,
    renderTarget: { getRenderTarget: () => ({ ensureDepthStencilTexture() {} }) },
    render(opts) {
      screen.renders.push(opts);
      if (!opts.target && opts.clearColor) screen.clear = opts.clearColor;
    },
    extract: {
      canvas: () => { screen.extracts += 1; return doc.createElement('canvas'); },
      pixels: () => { screen.extracts += 1; return { pixels: new Uint8ClampedArray(12), width: 3, height: 1 }; },
    },
  };
  return { screen, renderer, doc };
}

afterEach(() => configureReadback());

describe('R29 one readback, which copies the screen where reading a render texture fails', () => {
  it('PURE: a picture over black and over white gives its alpha back', () => {
    const px = alphaFromBlackWhite([100, 150, 50, 255, 0, 0, 0, 255, 100, 50, 0, 255], [100, 150, 50, 255, 255, 255, 255, 255, 228, 178, 128, 255]);
    assert.deepEqual([...px], [100, 150, 50, 255, 0, 0, 0, 0, 100, 50, 0, 127]);
  });

  it('a failed probe: no render texture is read; the passes are drawn to the screen over black and white and copied', async () => {
    const { screen, renderer, doc } = fakeScreen();
    let redraws = 0;
    const copies = [];
    configureReadback({ probe: { ok: false, plain: true }, redraw: () => (redraws += 1), onCopy: (l) => copies.push(l) });
    assert.equal(readbackUsesTexture(), false);
    const view = { localTransform: new Matrix() };
    const out = readbackPixels(PIXI, renderer, { width: 3, height: 1, resolution: 1, passes: [{ container: view, transform: new Matrix(0.25, 0, 0, 0.5, -4, 0) }], label: 'skirt' }, doc);
    assert.equal(screen.extracts, 0, 'nothing read from a render texture');
    assert.deepEqual([...out.pixels], [100, 150, 50, 255, 0, 0, 0, 0, 100, 50, 0, 127]);
    assert.deepEqual(screen.renders.map((r) => [r.target, r.clearColor]), [[undefined, [0, 0, 0, 1]], [undefined, [1, 1, 1, 1]]]);
    // The screen draws at resolution 2: the transform is halved so the copy is 3 x 1 device px.
    assert.deepEqual([screen.renders[0].transform.a, screen.renders[0].transform.d, screen.renders[0].transform.tx], [0.125, 0.25, -2]);
    assert.deepEqual(copies, ['skirt']);
    assert.equal(redraws, 0, 'the stage goes back on the screen once the task is done');
    await Promise.resolve();
    assert.equal(redraws, 1);
  });

  it('the street map still gets its picture (the sky clear, the ground drawn) when the probe failed', () => {
    const { screen, renderer, doc } = fakeScreen();
    const restore = globalThis.document;
    globalThis.document = doc;
    try {
      configureReadback({ probe: { ok: false, plain: false } });
      const layer = { position: { x: 7, y: 0 }, scale: { x: 1, y: 1 }, parallaxF: 0.5 };
      const view = { worldW: 1800, sourceWorldH: 738, children: [layer], updateParallax() {} };
      const pic = snapshotStreetView(PIXI, renderer, view, { width: 3, height: 1 }, { W: 1800, H: 738 });
      assert.ok(pic, 'a picture, not the lines alone');
      assert.deepEqual([...pic.data], [100, 150, 50, 255, 0, 0, 0, 0, 201, 100, 0, 127], 'straight alpha, as a 2D canvas keeps it');
      assert.equal(screen.extracts, 0);
      assert.equal(screen.renders[0].container, view);
      assert.equal(layer.position.x, 7, 'the view put back');
    } finally {
      globalThis.document = restore;
    }
  });

  it('a probe that passed but a read that comes back empty: the screen copy takes its place', () => {
    const { screen, renderer, doc } = fakeScreen();
    configureReadback({ probe: { ok: true, plain: true } });
    const out = readbackPixels(PIXI, renderer, { width: 3, height: 1, passes: [{ container: {} }], label: 'skirt' }, doc);
    assert.equal(screen.extracts, 1, 'the render texture first');
    assert.equal(screen.renders[0].target.width, 3);
    assert.deepEqual(screen.renders[0].clearColor, [0, 0, 0, 0]);
    assert.equal(out.pixels[3], 255, 'then the screen');
    // A canvas the same way.
    const pic = readbackCanvas(PIXI, renderer, { width: 3, height: 1, passes: [{ container: {} }] }, doc);
    assert.equal(pic.data[3], 255);
  });

  it('a read that works is used as it is, with no screen copy', () => {
    const { screen, renderer, doc } = fakeScreen();
    configureReadback({ probe: { ok: true, plain: true } });
    const drawn = { pixels: Uint8ClampedArray.from([1, 2, 3, 255]), width: 1, height: 1 };
    renderer.extract.pixels = () => drawn;
    assert.equal(readbackPixels(PIXI, renderer, { width: 1, height: 1, passes: [{ container: {} }] }, doc), drawn);
    assert.equal(screen.renders.length, 1);
  });

  it('no screen to copy and an empty read: null (each caller keeps its own fallback)', () => {
    configureReadback({ force: true });
    const renderer = { render() {}, extract: { canvas: () => { throw new Error('read'); } } };
    assert.equal(readbackCanvas(PIXI, renderer, { width: 3, height: 1, passes: [{ container: {} }] }, null), null);
    assert.equal(readbackExtract(renderer, { target: {} }), null, 'the tile art: its fallback icon');
  });
});

describe('R29 no module reads pixels back outside the helper', () => {
  function jsFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name === 'vendor' || name === 'node_modules') continue;
      if (statSync(p).isDirectory()) jsFiles(p, out);
      else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(p);
    }
    return out;
  }
  // A renderer's extract (canvas, pixels, base64, image, texture), WebGL's readPixels, or extract taken out of a renderer.
  const READS = /\.extract\s*(?:\.|\[|\?\.)|\breadPixels\s*\(|\{\s*[^}]*\bextract\b[^}]*\}\s*=\s*[\w.?]*renderer/;

  // The level builder's render page is a tool an agent drives in a headless browser, never a player's game.
  const EXEMPT = new Set([join('js', 'render-probe.js'), join('builder-render', 'render.js')]);

  it('only js/render-probe.js names extract or readPixels', () => {
    const hits = [];
    for (const file of jsFiles(PUBLIC)) {
      const rel = relative(PUBLIC, file);
      if (EXEMPT.has(rel)) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (READS.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    assert.deepEqual(hits, [], 'read pixels through js/render-probe.js readbackCanvas / readbackPixels / readbackExtract');
  });

  it('the three readers and the report picture use it', () => {
    assert.match(read('js/ui/street-minimap.js'), /const canvas = readbackCanvas\(PIXI, renderer, \{/);
    assert.match(read('js/street-render.js'), /const read = readbackPixels\(PIXI, renderer, \{/);
    const game = read('game.js');
    assert.match(game, /return readbackCanvas\(PIXI, app\.renderer, \{ width: w, height: h, resolution, passes: \[\{ container: app\.stage \}\], label: 'report' \}\);/);
    assert.match(game, /extract: \(\{ resolution, frame \}\) => readbackExtract\(app\.renderer, \{/);
  });

  it('game.js hands the probe to it, and &readback=fail makes it fail as on #517', () => {
    const game = read('game.js');
    assert.match(game, /const READBACK_FAIL = new URLSearchParams\(location\.search\)\.get\('readback'\) === 'fail';/);
    const fn = game.slice(game.indexOf('function runRenderProbe('), game.indexOf('\n}\n', game.indexOf('function runRenderProbe(')));
    assert.match(fn, /if \(READBACK_FAIL\) renderProbe = \{ \.\.\.\(renderProbe \|\| \{\}\), ok: false, plain: false \};/);
    assert.ok(fn.indexOf('configureReadback({') > fn.indexOf('renderProbe = probeRenderTexture('), 'after the probe');
    assert.match(fn, /redraw: \(\) => app\?\.renderer\?\.render\(\{ container: app\.stage \}\),/);
  });
});
