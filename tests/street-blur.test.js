/**
 * Blurred street layers (js/street-render.js bakeBlurredLayer): the client's box blur, the tile
 * plan, the bake density and the tile memory budget.
 * Run: node --test tests/street-blur.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BLUR_TILE,
  BLUR_TILE_BUDGET_BYTES,
  BLUR_TILE_KEEP_BYTES,
  RECOLOUR_EVICT_MS,
  blurBakeResolution,
  blurTilePad,
  boxBlurWeights,
  flashBlurSize,
  pickBlurTilesToFree,
  planBlurTiles,
} from '../public/js/street-render.js?v=4df4a30c';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../public/js/street-render.js'), 'utf8');
const streetsDir = join(here, '../public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));

describe('client blur size (Layer.as blur:int, BlurFilter LOW)', () => {
  it('truncates like AS3 int and treats 1 or less as no blur', () => {
    assert.equal(flashBlurSize(undefined), 0);
    assert.equal(flashBlurSize(0), 0);
    assert.equal(flashBlurSize(1), 0);
    assert.equal(flashBlurSize(1.61), 0);
    assert.equal(flashBlurSize(2.186), 2);
    assert.equal(flashBlurSize('3'), 3);
    assert.equal(flashBlurSize(10), 10);
    assert.equal(flashBlurSize(900), 255);
  });

  it("leaves Surveyor's Stroll's clipboard layer (bg_1, blur 1) unblurred", () => {
    const layer = street('GA952QGCH3D31E2').layers.find((l) => l.decos?.some((d) => d.sprite === 'newxp_gentleisland_sign_clipboard_01a'));
    assert.equal(layer.filters.blur, 1);
    assert.equal(flashBlurSize(layer.filters.blur), 0);
  });

  it('box weights match Ruffle: whole texels to the radius, a fractional end, summing to the width', () => {
    assert.deepEqual(boxBlurWeights(1), [1]);
    assert.deepEqual(boxBlurWeights(2), [1, 0.5]);
    assert.deepEqual(boxBlurWeights(3), [1, 1]);
    assert.deepEqual(boxBlurWeights(2.5), [1, 0.75]);
    assert.deepEqual(boxBlurWeights(10), [1, 1, 1, 1, 1, 0.5]);
    for (const size of [2, 2.5, 3, 4, 5, 6.5, 10, 17]) {
      const w = boxBlurWeights(size);
      assert.ok(Math.abs(w[0] + 2 * w.slice(1).reduce((a, b) => a + b, 0) - size) < 1e-9, String(size));
    }
  });
});

describe('bake density', () => {
  it('follows the screen for light blurs and halves for heavy ones, in steps of 2', () => {
    assert.equal(blurBakeResolution(2, 1), 1);
    assert.equal(blurBakeResolution(2, 1.3), 1);
    assert.equal(blurBakeResolution(2, 2.6), 2);
    assert.equal(blurBakeResolution(2, 4), 2);
    assert.equal(blurBakeResolution(3, 2.6), 1);
    assert.equal(blurBakeResolution(4, 2.6), 1);
    assert.equal(blurBakeResolution(5, 2.6), 0.5);
    assert.equal(blurBakeResolution(10, 1), 0.5);
  });

  it("keeps every street's blur within the shader's reach (8 texels a side) at any screen", () => {
    const sizes = new Set();
    for (const f of readdirSync(streetsDir)) {
      if (!f.endsWith('.json') || f === 'index.json') continue;
      for (const layer of JSON.parse(readFileSync(join(streetsDir, f), 'utf8')).layers || []) {
        const size = flashBlurSize(layer.filters?.blur);
        if (size) sizes.add(size);
      }
    }
    assert.ok(sizes.size > 0);
    for (const size of sizes) {
      for (const screen of [1, 1.5, 2, 2.6, 3, 4]) {
        const r = (size * blurBakeResolution(size, screen) - 1) / 2;
        assert.ok(r <= 8, `blur ${size} at ${screen}`);
      }
    }
    assert.match(src, /for \(int i = 1; i <= 8; i\+\+\)/);
    assert.match(src, /for \(var i = 1; i <= 8; i\+\+\)/);
  });

  it('pads tiles past the box radius with an even count', () => {
    for (let size = 2; size <= 20; size++) {
      const pad = blurTilePad(size);
      assert.equal(pad % 2, 0, String(size));
      assert.ok(pad >= (size - 1) / 2 + 1, String(size));
    }
  });
});

describe('tile plan', () => {
  const boxes = [
    { x0: 10, y0: 900, x1: 141, y1: 1034 },
    null,
    { x0: 480, y0: 100, x1: 1600, y1: 700 },
    { x0: 3000, y0: 50, x1: 3010, y1: 60 },
  ];
  const pad = 4;
  const tiles = planBlurTiles(boxes, pad);

  it('covers every deco box grown by the pad, inside its cells, on even pixels', () => {
    boxes.forEach((b, i) => {
      if (!b) return;
      // every corner region of the grown box lies in some tile listing the deco
      for (const x of [b.x0 - pad, (b.x0 + b.x1) / 2, b.x1 + pad - 0.01]) {
        for (const y of [b.y0 - pad, (b.y0 + b.y1) / 2, b.y1 + pad - 0.01]) {
          const t = tiles.find((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
          assert.ok(t && t.items.includes(i), `box ${i} at ${x},${y}`);
        }
      }
    });
    for (const t of tiles) {
      assert.ok(t.w > 0 && t.h > 0 && t.w <= BLUR_TILE && t.h <= BLUR_TILE);
      assert.equal(t.x % 2, 0);
      assert.equal(t.y % 2, 0);
      assert.equal(t.w % 2, 0);
      assert.equal(t.h % 2, 0);
      assert.equal(Math.floor(t.x / BLUR_TILE), Math.floor((t.x + t.w - 1) / BLUR_TILE));
      assert.deepEqual([...t.items].sort((a, b) => a - b), t.items, 'layer order kept');
    }
  });

  it('never overlaps tiles and skips empty cells', () => {
    for (const a of tiles) {
      for (const b of tiles) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!overlap);
      }
    }
    // the tiny far deco gets one small tile, not a full cell
    const far = tiles.filter((t) => t.items.includes(3));
    assert.equal(far.length, 1);
    assert.ok(far[0].w <= 20 && far[0].h <= 20);
    assert.ok(!tiles.some((t) => t.items.includes(1)));
  });
});

describe('tile memory', () => {
  const MB = 1024 * 1024;
  const tile = (o) => ({ texture: {}, culled: true, seen: 0, bytes: 4 * MB, ...o });

  it('keeps every tile while the street is under BLUR_TILE_KEEP_BYTES (no rebakes)', () => {
    const now = 100000;
    const tiles = [tile({ id: 'old', seen: 0 }), tile({ id: 'older', seen: -5 })];
    assert.deepEqual(pickBlurTilesToFree(tiles, { now, bytes: 8 * MB }), []);
    assert.ok(BLUR_TILE_KEEP_BYTES < BLUR_TILE_BUDGET_BYTES);
  });

  it('past the keep line frees tiles culled for RECOLOUR_EVICT_MS, oldest first, never one near the camera', () => {
    const now = 100000;
    const tiles = [
      tile({ id: 'old', seen: now - RECOLOUR_EVICT_MS - 1 }),
      tile({ id: 'oldest', seen: now - RECOLOUR_EVICT_MS - 500 }),
      tile({ id: 'recent', seen: now - 100 }),
      tile({ id: 'near', culled: false, seen: 0 }),
      tile({ id: 'unbaked', texture: null, seen: 0 }),
    ];
    assert.deepEqual(pickBlurTilesToFree(tiles, { now, bytes: 100 * MB, keep: 80 * MB }).map((t) => t.id), ['oldest', 'old']);
    assert.deepEqual(pickBlurTilesToFree(tiles, { now, bytes: 83 * MB, keep: 80 * MB }).map((t) => t.id), ['oldest']);
  });

  it('over budget frees culled tiles least recently seen first, down to the budget', () => {
    const tiles = [
      tile({ id: 'b', seen: 20 }),
      tile({ id: 'a', seen: 10 }),
      tile({ id: 'c', seen: 30 }),
      tile({ id: 'near', culled: false, seen: 1 }),
    ];
    const pick = pickBlurTilesToFree(tiles, { now: 40, bytes: 18 * MB, budget: 12 * MB, squeeze: true });
    assert.deepEqual(pick.map((t) => t.id), ['a', 'b']);
    assert.deepEqual(pickBlurTilesToFree(tiles, { now: 40, bytes: 10 * MB, budget: 12 * MB, squeeze: true }), []);
    assert.ok(BLUR_TILE_BUDGET_BYTES >= 64 * MB);
  });
});

describe('bake wiring (street-render.js)', () => {
  it('bakes blurred layers in tiles with the client box blur, not a half-resolution Pixi blur', () => {
    assert.match(src, /const blur = flashBlurSize\(layer\.filters\?\.blur\);/);
    assert.match(src, /if \(blur > 0 && opts\.renderer\) bakeBlurredLayer\(lc, blur, colour, blurState\);/);
    assert.match(src, /flashBoxBlurFilter\(PIXI, size, true\), flashBoxBlurFilter\(PIXI, size, false\)/);
    assert.doesNotMatch(src, /BLURRED_LAYER_RESOLUTION/);
    assert.doesNotMatch(src, /new PIXI\.BlurFilter\(\{ strength: blur/);
  });

  it('crops each padded tile bake to its tile and bakes tiles as the camera nears them', () => {
    assert.match(src, /frame: new PIXI\.Rectangle\(0, 0, tile\.w \+ pad \* 2, tile\.h \+ pad \* 2\)/);
    assert.match(src, /frame: new PIXI\.Rectangle\(pad, pad, tile\.w, tile\.h\)/);
    assert.match(src, /spr\.blurTile \? bakeBlurTile\(spr\.blurTile, blurState\)/);
    assert.match(src, /evictBlurTiles\(blurState, now\);/);
  });
});
