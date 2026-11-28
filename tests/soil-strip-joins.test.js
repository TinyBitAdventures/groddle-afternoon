/**
 * G997 (#481): under a home street the soil cross-section (crosssection_short_3) was tiled end to
 * end every 620.8 px with a 2 px overlap. The piece was made to stand alone: its grass edge is
 * about 40 px down at its left end (rounded off at the corner) and about 21 px at its right, so
 * every join stepped 10 to 30 px, grass and all. drawLandscape and the neighbour's meadow street now
 * mirror every other tile and overlap the tiles (js/landscape-reach.js soilTiles, SOIL_JOIN).
 *
 * This draws every street and back-yard look that uses the strip on a fake Pixi, rebuilds the
 * strip's outline from the art's own alpha (each tile's top and bottom edge per screen column,
 * mirrored where the tile is), and measures the edge step across each join.
 * Run: node --test tests/soil-strip-joins.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { readImage } from '../tools/builder/art-image.mjs';
import { HOME_LIMITS } from '../public/js/homes-catalog.js?v=0367f90f';
import { YARD_SEGMENT_W, HOUSE_LOT_W } from '../public/js/home-cultivation.js?v=122d6f45';
import { EXTERIOR_STYLES, INTERIOR_STYLES, streetLook, yardLook } from '../public/js/home-styles.js?v=ec5d2f69';
import { SOIL_JOIN, soilTiles } from '../public/js/landscape-reach.js?v=2f2d7cb3';
import { BACK_YARD_GROUND_Y, STREET_GROUND_Y, drawLandscape } from '../public/js/features/homes-feature.js?v=70324a94';
import { buildNeighbourBackground } from '../public/js/features/neighbour-scene.js?v=fe6e52ce';
import { FakeEl, fakePixi } from './fake-scene.js';

const ART = (f) => fileURLToPath(new URL(`../public/assets/decos/groddle/${f}`, import.meta.url));
/** The most a join may step, in screen px (the art's own grass blades wobble about 2 px). */
const MAX_STEP = 3;

/** Per art column: the first and last row with alpha over half, or null where it is clear. */
function edges(img) {
  const top = [];
  const bottom = [];
  for (let x = 0; x < img.w; x += 1) {
    let t = null;
    let b = null;
    for (let y = 0; y < img.h; y += 1) {
      if (img.px[(y * img.w + x) * 4 + 3] > 128) {
        if (t == null) t = y;
        b = y;
      }
    }
    top.push(t);
    bottom.push(b);
  }
  return { w: img.w, h: img.h, top, bottom };
}

/** The strip's outline per screen column from its tiles: the union of every tile's art there. */
function outline(tiles, art, from, to) {
  const top = new Map();
  const bottom = new Map();
  for (let X = Math.floor(from); X <= to; X += 1) {
    let t = Infinity;
    let b = -Infinity;
    for (const s of tiles) {
      const c = X + 0.5;
      if (c < s.x || c >= s.x + s.w) continue;
      let u = (c - s.x) / s.w;
      if (s.flip) u = 1 - u;
      const col = Math.min(art.w - 1, Math.floor(u * art.w));
      if (art.top[col] == null) continue;
      t = Math.min(t, s.y + (art.top[col] * s.h) / art.h);
      b = Math.max(b, s.y + (art.bottom[col] * s.h) / art.h);
    }
    if (Number.isFinite(t)) top.set(X, t);
    if (Number.isFinite(b)) bottom.set(X, b);
  }
  return { top, bottom };
}

const mean = (m, a, b) => {
  const v = [];
  for (let X = a; X <= b; X += 1) if (m.has(X)) v.push(m.get(X));
  return v.length ? v.reduce((s, n) => s + n, 0) / v.length : NaN;
};

/** The worst edge step across each join: the mean of 4 columns either side of each tile's ends. */
function joinSteps(tiles, art) {
  const xs = tiles.map((s) => s.x);
  const from = Math.min(...xs);
  const to = Math.max(...tiles.map((s) => s.x + s.w));
  const { top, bottom } = outline(tiles, art, from, to);
  const out = [];
  for (const s of tiles) {
    for (const J of [Math.round(s.x), Math.round(s.x + s.w)]) {
      if (J - 6 < from || J + 6 > to) continue; // the strip's own ends, past the camera's reach
      const step = Math.max(Math.abs(mean(top, J, J + 3) - mean(top, J - 4, J - 1)), Math.abs(mean(bottom, J, J + 3) - mean(bottom, J - 4, J - 1)));
      out.push({ at: J, step });
    }
  }
  return out;
}

function spriteTiles(root) {
  return root.children
    .filter((c) => c.zIndex === -39)
    .map((s) => {
      // A mirrored tile is drawn with anchor x 1 and a negative scale, so x stays its left edge.
      if (s.scale.x < 0) assert.equal(s.anchor.x, 1, 'a mirrored soil tile keeps its left edge at x');
      return { x: s.x, y: s.y, w: s.width, h: s.height, flip: s.scale.x < 0 };
    });
}

const engine = { PIXI: fakePixi, renderer: null };

describe('the home soil strip meets at every join (G997, #481)', () => {
  const saved = {};
  let art;
  before(() => {
    saved.document = globalThis.document;
    saved.PIXI = globalThis.PIXI;
    globalThis.PIXI = fakePixi;
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null };
    art = edges(readImage(ART('crosssection_short_3.webp')));
  });
  after(() => {
    globalThis.document = saved.document;
    globalThis.PIXI = saved.PIXI;
  });

  it('the art itself: its two ends differ, so plain tiling steps', () => {
    assert.deepEqual([art.w, art.h], [1038, 236]);
    // Grass edge 20 columns in from each end: about 40 rows down at the left, 21 at the right.
    assert.ok(art.top[20] - art.top[art.w - 21] > 12, `ends ${art.top[20]} and ${art.top[art.w - 21]}`);
    const plain = [0, 1, 2].map((i) => ({ x: -40 + i * (620.8 - 2), y: 0, w: 620.8, h: 150, flip: false }));
    const worst = Math.max(...joinSteps(plain, art).map((j) => j.step));
    assert.ok(worst > 8, `plain tiling steps ${worst.toFixed(1)} px`);
  });

  it('soilTiles keeps tile 0 in place, mirrors every other tile and covers the window', () => {
    const tiles = soilTiles(620.8, -1200, 4000);
    const zero = tiles.findIndex((t) => t.x === -40);
    assert.ok(zero >= 0);
    assert.equal(tiles[zero].flip, false);
    assert.equal(tiles[zero + 1].flip, true);
    assert.equal(tiles[zero - 1].flip, true);
    assert.ok(tiles[0].x <= -1200 && tiles.at(-1).x + 620.8 >= 4000);
    assert.ok(Math.abs(tiles[zero + 1].x - tiles[zero].x - 620.8 * (1 - SOIL_JOIN)) < 1e-9);
  });

  it('every street and back-yard look with the strip, the widest yard: no join steps', () => {
    const W = (HOME_LIMITS.MAX_FRONTYARD_LEFT_SEGMENTS + HOME_LIMITS.MAX_FRONTYARD_RIGHT_SEGMENTS) * YARD_SEGMENT_W + HOUSE_LOT_W;
    const looks = [
      ...EXTERIOR_STYLES.filter((r) => r.built).map((r) => ({ key: r.key, look: streetLook(r.key), groundY: STREET_GROUND_Y })),
      ...INTERIOR_STYLES.filter((r) => r.built).map((r) => ({ key: `yard:${r.key}`, look: yardLook(r.key), groundY: BACK_YARD_GROUND_Y })),
    ].filter((r) => r.look.soil === 'crosssection_short_3');
    assert.ok(looks.length >= 28, `${looks.length} looks use the strip`);
    const bad = [];
    for (const { key, look, groundY } of looks) {
      const root = new fakePixi.Container();
      drawLandscape(engine, root, look, look.seed || key, { width: W, groundY, lift: 0 });
      const tiles = spriteTiles(root);
      assert.ok(tiles.length >= 3, key);
      const steps = joinSteps(tiles, art);
      assert.ok(steps.length >= 4, key);
      for (const j of steps) if (j.step > MAX_STEP) bad.push(`${key}: ${j.step.toFixed(1)} px at x ${j.at}`);
    }
    assert.deepEqual(bad.slice(0, 12), []);
  });

  it("a neighbour's meadow street: no join steps", () => {
    const root = buildNeighbourBackground(fakePixi, { id: 'n-meadow', style: 'meadow', props: [], house: { path: 'house', w: 100, h: 100, scale: 1, doorX: 0.5, saleX: -1 } });
    const tiles = spriteTiles(root);
    assert.ok(tiles.length >= 3);
    const bad = joinSteps(tiles, art).filter((j) => j.step > MAX_STEP);
    assert.deepEqual(bad, []);
  });
});
