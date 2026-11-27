/**
 * #659 (root R52): on an iPad every Change Street Style tile was blank (Chrome on Android drew
 * them). Each tile was a stack of full-size deco <img> elements: about 300 images over the 37
 * street styles, 73 decos held decoded at full size (about 200 MB; a 1648 px mountain drawn 31 px
 * tall), 161 under a CSS brightness filter, all made again on every render of the dialog. Linux
 * WebKit draws them (scratchpad repro at the player's 834x1130), so the iPad's limit is the likely
 * cause; the tiles now paint into one small canvas each (js/ui/style-tile-paint.js), each deco
 * shrunk to the size a tile draws it and let go once the tiles are painted.
 * Run: node --test tests/style-tiles-659.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { describe, it } from 'node:test';

import { EXTERIOR_STYLES, streetLook } from '../public/js/home-styles.js?v=ec5d2f69';
import { stylePreviewLayout } from '../public/js/features/homes-feature.js?v=f112c06a';
import { TILE_MAX_DPR, createTilePainter, drawOps, shrinkSource, sourceHeights, tileOps } from '../public/js/ui/style-tile-paint.js?v=d0e1312b';

const DECO = new URL('../public/assets/decos/groddle/', import.meta.url);
const looks = () => EXTERIOR_STYLES.filter((r) => r.built).map((r) => streetLook(r.key));
const layoutOf = (look) => ({ ...stylePreviewLayout(look), fieldColor: look.field });

/** A WebP's pixel size from its header (VP8, VP8L or VP8X). */
function webpSize(file) {
  const b = readFileSync(file);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const v = b.readUInt32LE(21);
    return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  throw new Error(`${file}: ${kind}`);
}

/** Halves (as shrinkSource does) until the next half would be under `want` px tall. */
function shrunk({ w, h }, want) {
  while (h / 2 >= Math.max(1, Math.ceil(want))) {
    w = Math.max(1, Math.round(w / 2));
    h = Math.max(1, Math.round(h / 2));
  }
  return { w, h };
}

/** A canvas double that records what is drawn on it. */
function fakeCanvas(w = 0, h = 0, rect = { width: 0, height: 0 }) {
  const calls = [];
  const g = new Proxy({ calls }, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => { calls.push([k, ...args]); };
    },
    set(t, k, v) { calls.push([`=${String(k)}`, v]); return true; },
  });
  return { width: w, height: h, className: '', calls, getContext: () => g, getBoundingClientRect: () => rect };
}

describe('#659 the Change Style tiles', () => {
  it('a tile is one canvas: no stack of full-size <img>, no CSS filter (failed on main)', () => {
    const src = readFileSync(new URL('../public/js/features/homes-feature.js', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('function stylePreviewEl('), src.indexOf('function ensureStylesUi('));
    assert.doesNotMatch(body, /el\('img'/, 'stylePreviewEl puts an <img> per deco in the tile');
    assert.doesNotMatch(body, /filter:brightness/);
    assert.match(body, /canvasFor\(look\)/);
  });

  it('the decos the tiles hold decoded: a few MB, where the full-size stack held about 200', () => {
    const all = looks();
    assert.ok(all.length >= 30);
    let full = 0;
    let painted = 0;
    let tilePixels = 0;
    // A desktop tile (126x64) and a phone tile (110x52), at the most device pixels the painter uses.
    for (const [w, h] of [[126, 64], [110, 52]]) {
      const W = w * TILE_MAX_DPR;
      const H = h * TILE_MAX_DPR;
      const need = sourceHeights(all.map((look) => tileOps(layoutOf(look), W, H)));
      let fullHere = 0;
      let paintedHere = 0;
      for (const [s, px] of need) {
        if (s.endsWith('.svg')) continue; // drawn at the size asked
        const file = new URL(`${s}.webp`, DECO);
        assert.ok(existsSync(file), `${s}.webp`);
        const size = webpSize(file);
        fullHere += size.w * size.h * 4;
        const small = shrunk(size, px);
        paintedHere += small.w * small.h * 4;
      }
      full = Math.max(full, fullHere);
      painted = Math.max(painted, paintedHere);
      tilePixels = Math.max(tilePixels, all.length * W * H * 4);
    }
    assert.ok(full > 150e6, `the full-size decos: ${(full / 1e6).toFixed(0)} MB`);
    assert.ok(painted < 40e6, `the shrunk decos while painting: ${(painted / 1e6).toFixed(1)} MB`);
    assert.ok(tilePixels < 8e6, `the painted tiles kept: ${(tilePixels / 1e6).toFixed(1)} MB`);
  });

  it('tileOps places the pieces where the tile markup did (percent of the tile, centred on left)', () => {
    const layout = { field: 25, fieldColor: 0x336600, parts: [
      { band: true, bottom: 0, height: 40, color: 0x112233, alpha: 1 },
      { s: 'tree', left: 22, bottom: 30, height: 50, flip: false, lum: 0.8, alpha: null },
      { s: 'tree', left: 72, bottom: 30, height: 50, flip: true, lum: 1, alpha: 0.5 },
      { s: 'rock', left: 38, bottom: -10, height: 60, flip: false, lum: 1, alpha: null, near: true },
    ] };
    const ops = tileOps(layout, 200, 100);
    assert.deepEqual(ops.map((o) => (o.rect ? `rect:${o.color}` : o.s)), ['rect:#112233', 'tree', 'tree', 'rect:#336600', 'rock'], 'back to front, field before the near pieces');
    assert.deepEqual(ops[0], { rect: true, x: 0, y: 60, w: 200, h: 40, color: '#112233', alpha: 1 });
    assert.deepEqual(ops[1], { s: 'tree', cx: 44, bottom: 70, h: 50, flip: false, lum: 0.8, alpha: 1 });
    assert.equal(ops[2].flip, true);
    assert.equal(ops[2].alpha, 0.5);
    assert.deepEqual(ops[3], { rect: true, x: 0, y: 75, w: 200, h: 25, color: '#336600', alpha: 1 });
    assert.equal(ops[4].bottom, 110, 'a near piece may stand below the tile edge');
  });

  it('drawOps: brightness as black over the piece only, a flip about its centre, opacity', () => {
    const made = [];
    const make = (w, h) => { const c = fakeCanvas(w, h); made.push(c); return c; };
    const tile = fakeCanvas(200, 100);
    const art = { src: { naturalWidth: 40, naturalHeight: 20 }, aspect: 2 };
    drawOps(tile, [
      { s: 'dim', cx: 50, bottom: 80, h: 20, flip: false, lum: 0.6, alpha: 1 },
      { s: 'dim', cx: 120, bottom: 80, h: 20, flip: true, lum: 1, alpha: 0.5 },
    ], new Map([['dim', art]]), make);
    assert.equal(made.length, 1, 'one scratch canvas for the dimmed piece');
    const s = made[0].calls;
    assert.deepEqual(s.find((c) => c[0] === '=globalCompositeOperation'), ['=globalCompositeOperation', 'source-atop']);
    assert.deepEqual(s.find((c) => c[0] === '=fillStyle'), ['=fillStyle', 'rgba(0,0,0,0.400)']);
    const draws = tile.calls.filter((c) => c[0] === 'drawImage');
    assert.deepEqual(draws[0].slice(2), [30, 60, 40, 20], 'centred on cx, standing on bottom');
    assert.deepEqual(draws[1].slice(2), [100, 60, 40, 20]);
    const flipAt = tile.calls.findIndex((c) => c[0] === 'scale');
    assert.deepEqual(tile.calls[flipAt], ['scale', -1, 1]);
    assert.ok(tile.calls.some((c) => c[0] === '=globalAlpha' && c[1] === 0.5));
  });

  it('shrinkSource halves a big deco down to the size drawn, and keeps a small one as it is', () => {
    const made = [];
    const make = (w, h) => { const c = fakeCanvas(w, h); made.push(c); return c; };
    const big = { naturalWidth: 1648, naturalHeight: 320 };
    const out = shrinkSource(big, 62, make);
    assert.equal(out.src.height, 80);
    assert.equal(out.src.width, 412);
    assert.equal(out.aspect, 1648 / 320);
    assert.equal(made.length, 2);
    const small = { naturalWidth: 50, naturalHeight: 40 };
    assert.equal(shrinkSource(small, 62, make).src, small);
    assert.equal(shrinkSource({ naturalWidth: 0, naturalHeight: 0 }, 10, make), null);
  });

  it('the painter loads each deco once per paint, and a re-render of the dialog paints nothing again', async () => {
    const rect = { width: 126, height: 64 };
    const doc = { createElement: () => fakeCanvas(0, 0, rect) };
    const loads = [];
    const painter = createTilePainter({ doc, load: async (url) => { loads.push(url); return { naturalWidth: 400, naturalHeight: 200 }; } });
    const [a, b] = looks();
    const ca = painter.canvasFor(a);
    assert.equal(painter.canvasFor(a), ca, 'the same canvas for the same look');
    painter.canvasFor(b);
    const entries = [a, b].map((look) => ({ look, layout: layoutOf(look) }));
    assert.equal(await painter.paint(entries, 3), 2);
    assert.equal(ca.width, 126 * TILE_MAX_DPR, 'at most 2 device pixels per CSS pixel');
    const names = new Set([a, b].flatMap((look) => stylePreviewLayout(look).parts.filter((p) => !p.band).map((p) => p.s)));
    assert.equal(loads.length, names.size, 'one load per deco, however many tiles draw it');
    assert.equal(await painter.paint(entries, 3), 0, 'unchanged tiles are kept');
    assert.equal(loads.length, names.size);
    rect.width = 110;
    rect.height = 52;
    assert.equal(await painter.paint(entries, 2), 2, 'a new tile size paints again (a phone turned)');
  });
});
