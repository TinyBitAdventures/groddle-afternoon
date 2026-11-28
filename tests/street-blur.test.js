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
  BLUR_ART_RATIO,
  BLUR_LAYER_SHARP_BYTES,
  BLUR_TILE,
  BLUR_TILE_BUDGET_BYTES,
  BLUR_TILE_KEEP_BYTES,
  RECOLOUR_EVICT_MS,
  blurBakeResolution,
  bakeMissingBlurTiles,
  blurArtUpgrades,
  blurBakeFloor,
  blurLayerResolution,
  blurTilePad,
  boxBlurWeights,
  flashBlurSize,
  pickBlurTilesToFree,
  planBlurTiles,
  rebakeBlurLayers,
} from '../public/js/street-render.js?v=124facce';

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
  it('follows the screen for light blurs and halves for heavy ones, on a half-texel grid', () => {
    assert.equal(blurBakeResolution(2, 1), 1);
    assert.equal(blurBakeResolution(2, 1.2), 1);
    assert.equal(blurBakeResolution(2, 1.3), 1.5);
    assert.equal(blurBakeResolution(2, 1.75), 2);
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

  // A player's snap on Namaste (1907 x 710, Original zoom): creature_purple on a blur 2 layer drawn
  // much softer than the scene around it. Original zoom draws the world 1.3 to 1.9 times on a
  // desktop (renderer.resolution carries the zoom), and the bake floored that to 1 texel a layer
  // pixel, so the blurred tile was stretched on screen on top of the client's 2 px box.
  it('bakes a blur of 2 at the screen\'s density at Original zoom, never stretching a tile more than 1.2 times', () => {
    for (const screen of [1, 1.15, 1.3, 1.5, 1.6, 1.75, 1.9, 2]) {
      const res = blurBakeResolution(2, screen);
      assert.ok(screen / res <= 1.2, `blur 2 at ${screen}: baked at ${res}, stretched ${(screen / res).toFixed(2)}x`);
    }
  });

  it('keeps the detail cap (about 4 texels a box) and lands every density on whole texels at even tile edges', () => {
    const old = (size, r) => {
      const want = Math.min(r, 4 / size);
      return want >= 2 ? 2 : want >= 1 ? 1 : 0.5;
    };
    for (let size = 2; size <= 12; size++) {
      for (const screen of [1, 1.05, 1.25, 1.3, 1.5, 1.75, 1.9, 2, 2.25, 2.6, 3, 4]) {
        const res = blurBakeResolution(size, screen);
        assert.equal((2 * res) % 1, 0, `${size} at ${screen}`);
        assert.ok(res <= Math.max(0.5, 4 / size) && res <= 2, `${size} at ${screen}: ${res}`);
        // At 2 and over (the deco pipeline's sharp.py and animate.py measure there) nothing moved.
        if (screen >= 2) assert.equal(res, old(size, screen), `${size} at ${screen}`);
      }
    }
  });

  it('steps a big layer down while all its tiles would pass the layer budget, never under the old density', () => {
    const mb = 1024 * 1024;
    const namaste = (2.8 * mb) / 4; // its blur 2 layer, all tiles: about 2.8 MB at 1 texel a layer px
    const dasas = (35 * mb) / 4; // Dasas Terrace's blur 2 layer: 35 MB at 1, 138 MB at 2
    assert.equal(blurLayerResolution(2, 1.75, namaste), 2);
    assert.equal(blurLayerResolution(2, 1.75, (12 * mb) / 4), 1.5, '12 MB at 1 is 48 at 2 and 27 at 1.5');
    assert.equal(blurLayerResolution(2, 1.75, dasas), 1, 'over the budget even at 1.5: the old density');
    assert.equal(blurLayerResolution(2, 4, dasas), 2, 'never under what it had before (2 at 2 and over)');
    assert.equal(blurLayerResolution(2, 1.75, 1e12), blurBakeFloor(2, 1.75));
    assert.equal(blurLayerResolution(5, 4, 0), 0.5);
    assert.ok(BLUR_LAYER_SHARP_BYTES * 5 <= BLUR_TILE_BUDGET_BYTES);
    for (let size = 2; size <= 10; size++) {
      for (const screen of [1, 1.3, 1.75, 2, 4]) {
        const res = blurLayerResolution(size, screen, dasas);
        assert.ok(res >= blurBakeFloor(size, screen) && res <= blurBakeResolution(size, screen), `${size} at ${screen}`);
      }
    }
  });

  it('bakes a blurred layer again when the screen\'s density moves to another step, and only then', () => {
    const tile = (culled) => ({ texture: {}, sprite: { culled } });
    const filter = { resolution: 1 };
    const layer = { size: 2, res: 1, tiles: [tile(false), tile(true), { texture: null, sprite: { culled: false } }], liveFilters: [filter] };
    const heavy = { size: 5, res: 0.5, tiles: [tile(false)] };
    const state = { renderer: { resolution: 1.1 }, cap: 4, layers: [layer, heavy] };
    const baked = [];
    const freed = [];
    const free = (t) => { t.texture = null; freed.push(t); };
    const bake = (t, s) => { t.texture = { res: s.layers[0].res }; baked.push(t); };
    assert.equal(rebakeBlurLayers(state, bake, free), 0, 'same step: nothing');
    state.renderer.resolution = 1.75;
    assert.equal(rebakeBlurLayers(state, bake, free), 1);
    assert.equal(layer.res, 2);
    assert.equal(filter.resolution, 2, 'a playing deco draws through the blur at the new density');
    assert.equal(heavy.res, 0.5, 'a heavy blur stays under its detail cap');
    assert.deepEqual(freed, [layer.tiles[0], layer.tiles[1]]);
    assert.deepEqual(baked, [layer.tiles[0]], 'near tiles bake at once, culled ones when the camera comes');
    assert.equal(layer.tiles[1].texture, null);
    assert.equal(state.rebakes, 1);
    state.renderer.resolution = 1.8;
    assert.equal(rebakeBlurLayers(state, bake, free), 0, 'a drag inside the step bakes nothing');
  });

  // The same snap: creature_purple is drawn 294 x 275, 1.74 times its 169 x 158 stage, from a 2x
  // file of 338 x 316. The route loads 3x files only above 2.25, so at a bake of 2 its 2x file
  // was stretched 1.74 times inside the bake: it takes its 3x file (507 x 474) instead.
  it('gives a blurred deco drawn well past its file its 3x file for a bake over 1', () => {
    const deco = (w, h, fw, fh, url = 'assets/decos/groddle/creature_purple.png') => ({ blurArtUrl: url, width: w, height: h, texture: { frame: { width: fw, height: fh }, source: { resolution: 1 } } });
    const hires = (url) => (url.includes('creature') ? url.replace('.png', '@1.5x.webp') : null);
    const creature = deco(294, 275, 338, 316);
    const atStage = deco(169, 158, 338, 316);
    const flipped = deco(-294, 275, 338, 316);
    const noThree = deco(294, 275, 338, 316, 'assets/decos/groddle/rock.png');
    const sharp = { ...deco(294, 275, 338, 316), blurArtUrl: null };
    const all = [creature, atStage, flipped, noThree, sharp];
    assert.deepEqual(blurArtUpgrades(all, 2, hires).map((u) => u.child), [creature, flipped]);
    assert.equal(blurArtUpgrades(all, 2, hires)[0].url, 'assets/decos/groddle/creature_purple@1.5x.webp');
    assert.ok((294 * 2) / 338 >= BLUR_ART_RATIO && (169 * 2) / 338 < BLUR_ART_RATIO);
    assert.deepEqual(blurArtUpgrades(all, 1, hires), [], 'a bake of 1 (a phone) keeps the 2x files');
    assert.deepEqual(blurArtUpgrades(all, 1.5, hires), [], 'at 1.5 the 2x file is within the line');
  });

  it('marks blurred decos for it and checks them once the layer is tiled', () => {
    assert.match(src, /if \(blur && !own && !animated && !lostBlur && !pick\) spr\.blurArtUrl = url;/);
    assert.match(src, /state\.layers\.push\(layer\);\n\s*upgradeBlurLayerArt\(layer, state\);/);
    assert.match(src, /const ups = blurArtUpgrades\(layer\.parked\?\.children, layer\.res, state\.hiresUrl\);/);
  });

  it('runs the rebake on the renderer\'s resize, after it settles', () => {
    assert.match(src, /if \(sharpViews\.length\) root\.refreshSharpDecos\(\);\n\s*rebakeBlurLayers\(blurState\);/);
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

describe('street map snapshot (#561: Ramyeon Kon\'s far forest only where the camera had been)', () => {
  // A tile as bakeBlurredLayer makes it: no texture and a hidden sprite until it is baked.
  const tile = (id, o = {}) => ({ id, texture: null, bytes: 0, sprite: { visible: false, culled: true, destroyed: false }, ...o });
  const bake = (t) => {
    t.texture = { id: t.id };
    t.sprite.visible = true;
  };
  const free = (t) => {
    t.texture = null;
    t.sprite.visible = false;
  };

  it('bakes every tile with no texture, so the whole layer draws in the picture', () => {
    const near = tile('near', { texture: { id: 'near' }, sprite: { visible: true, culled: false } });
    const left = tile('left');
    const right = tile('right');
    const gone = tile('gone', { sprite: { visible: false, culled: true, destroyed: true } });
    const state = { layers: [{ tiles: [near, left] }, { tiles: [right, gone] }] };
    const baked = [];
    bakeMissingBlurTiles(state, (t, s) => {
      assert.equal(s, state);
      baked.push(t.id);
      bake(t);
    }, free);
    assert.deepEqual(baked, ['left', 'right'], 'the near tile is already baked; a destroyed one is skipped');
    assert.ok([near, left, right].every((t) => t.texture && t.sprite.visible));
  });

  it('afterwards frees only the tiles it baked that the camera still culls', () => {
    const near = tile('near', { texture: { id: 'near' }, sprite: { visible: true, culled: true } });
    const far = tile('far');
    const fresh = tile('fresh', { sprite: { visible: false, culled: false } });
    const state = { layers: [{ tiles: [near, far, fresh] }] };
    const freed = [];
    const release = bakeMissingBlurTiles(state, bake, (t) => {
      freed.push(t.id);
      free(t);
    });
    release();
    assert.deepEqual(freed, ['far'], 'a tile baked before stays; one near the camera stays for it');
    assert.ok(near.texture && fresh.texture && !far.texture);
  });

  it('a tile whose bake fails is not freed, and a street with no blurred layer is fine', () => {
    const failed = tile('failed');
    const release = bakeMissingBlurTiles({ layers: [{ tiles: [failed] }] }, () => {}, () => assert.fail('nothing to free'));
    release();
    assert.doesNotThrow(() => bakeMissingBlurTiles({ layers: [] })());
    assert.doesNotThrow(() => bakeMissingBlurTiles(undefined)());
  });

  it('the street view offers it to the map snapshot, recoloured copies back too', () => {
    assert.match(src, /root\.bakeForSnapshot = \(\) => \{/);
    assert.match(src, /ensureRecoloured\(PIXI, opts\.renderer, recolourCache, user\)/);
    assert.match(src, /return bakeMissingBlurTiles\(blurState\);/);
  });
});
