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
import {
  glitchLayerMatrix,
  parallaxLayerOffset,
  shadeColour,
  skirtBandHeight,
  skirtFadeColour,
  skirtFadeStops,
  skirtGroundOffset,
  skirtTiles,
  SKIRT_BAND,
  SKIRT_SLIDE_MAX,
} from '../public/js/street-render.js?v=41c545c5';
import { streetHeight, streetWidth } from '../public/js/street-model.js?v=505d8990';

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

  it('keeps a gradient Flash wrote without leading zeros, as the client read it (ticket 39)', () => {
    // ColorUtil.colorStrToNum: parseInt("0x" + color, 16), so "50404" is 050404.
    assert.deepEqual(street('GA5PV4T79OE2AOA').gradient, { top: '050404', bottom: '850000' }, 'Mahatam Audarika');
    assert.deepEqual(street('GA5Q57C99OE2GNU').gradient, { top: '7A0000', bottom: '020A06' }, 'Ratna Vitteha');
    const index = JSON.parse(readFileSync(join(here, '../public/assets/streets/index.json'), 'utf8')).streets;
    const hell = Object.keys(index).filter((t) => String(index[t].hubId) === '40');
    assert.ok(hell.length >= 7);
    for (const tsid of hell) assert.match(street(tsid).gradient?.top || '', /^[0-9A-F]{6}$/, `${tsid} has its own sky`);
    const skyless = Object.keys(index).filter((t) => /^G/.test(t) && !street(t).gradient);
    assert.ok(skyless.length <= 11, `${skyless.length} streets draw the painted meadow sky (11 have no gradient in the archive)`);
  });

  it('draws a black ground skirt black, not as a missing colour (ticket 39, Panka Surazu)', () => {
    const src = readFileSync(join(here, '../public/js/street-render.js'), 'utf8');
    assert.match(src, /const fallback = Number\.isFinite\(parsed\) \? parsed : 0x6b8f3c;/);
    assert.ok(!/16\) \|\| 0x6b8f3c/.test(src));
  });

  it('mirrors the ground below the street instead of stretching its last row (Austin 2026-11-02)', () => {
    const src = readFileSync(join(here, '../public/js/street-render.js'), 'utf8');
    const body = src.slice(src.indexOf('function buildGroundSkirt('), src.indexOf('function addLadderTiles('));
    // Upside down copies meet the edge: texture row `band - 1` (the art at bounds.b) is drawn at sourceH.
    assert.match(body, /spr\.scale\.y = -1;\s*spr\.y = sourceH \+ tile\.y \+ band;/);
    assert.match(body, /spr\.y = sourceH \+ tile\.y;/);
    assert.ok(!/ROWS - 1, w, 1/.test(body), 'no stretched one-row frame');
    // Nothing above bounds.b: the fills and overlays start at the edge or below it.
    for (const m of body.matchAll(/\.rect\(0, ([^,]+),/g)) assert.match(m[1], /^sourceH( \+ fadeDepth)?$/, m[0]);
    assert.match(body, /fade\.y = sourceH;/);
    assert.match(body, /shade\.y = sourceH;/);
    // Under the middleground: its art and the front layers' draw over the strip below the edge.
    assert.match(body, /strip\.zIndex = main\.inFront \? -1 : main\.zIndex - 1;/);
    // One texture per chunk, freed with the view.
    assert.match(body, /root\.once\('destroyed', \(\) => \{\s*for \(const t of textures\) t\.destroy\(true\);/);
    assert.match(src, /buildGroundSkirt\(PIXI, opts\.renderer, root, grounds, W, sourceH, skirtDepth, /);
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

describe('ground skirt (the strip under a street in the Modern UI)', () => {
  it('mirrors a short band of the bottom (never more than the skirt or the street)', () => {
    assert.equal(skirtBandHeight(0, 1000), 0);
    assert.equal(skirtBandHeight(-5, 1000), 0);
    assert.equal(skirtBandHeight(20, 1000), 20);
    assert.equal(skirtBandHeight(172, 1000), SKIRT_BAND);
    assert.ok(SKIRT_BAND >= 40 && SKIRT_BAND <= 80, 'short enough to stay soil, not the ledge above (Cebarkul)');
    assert.equal(skirtBandHeight(172, 30), 30, 'a short room mirrors only what it has');
  });

  it('lays the band down the skirt mirrored, then the right way up, so its rows always meet', () => {
    assert.deepEqual(skirtTiles(172, 56), [
      { y: 0, flip: true },
      { y: 56, flip: false },
      { y: 112, flip: true },
      { y: 168, flip: false },
    ]);
    assert.deepEqual(skirtTiles(56, 56), [{ y: 0, flip: true }]);
    assert.deepEqual(skirtTiles(0, 56), []);
    assert.deepEqual(skirtTiles(100, 0), []);
    // Each copy's top row is the row the copy above ended on (a mirror pair), so no seam.
    const rowAt = (tiles, band, y) => {
      const t = tiles.find((c) => y >= c.y && y < c.y + band);
      const k = y - t.y;
      return t.flip ? band - 1 - k : k;
    };
    const tiles = skirtTiles(300, 56);
    for (const t of tiles.slice(1)) assert.equal(rowAt(tiles, 56, t.y), rowAt(tiles, 56, t.y - 1));
    assert.equal(rowAt(tiles, 56, 0), 55, 'the first row below the edge is the art right at the edge');
  });

  it('takes the layers drawn at the ground and leaves out the ones that slide away (parallaxLayerOffset)', () => {
    const hechey = street('GLI2V0UN7RD1T2J');
    const W = streetWidth(hechey);
    const H = streetHeight(hechey);
    const picked = hechey.layers.filter((l) => skirtGroundOffset(l, W, H)).map((l) => l.id).sort();
    assert.deepEqual(picked, ['middleground', 'middleplus'], 'the dirt is in the band, the sky and hills are not');
    // A street-size layer never moves against the ground.
    for (const camX of [0, 1234, W - 1000]) {
      for (const camY of [0, 300, H - 493, H - 400]) {
        const same = parallaxLayerOffset({ w: W, h: H }, camX, camY, 1000, 493, W, H);
        assert.ok(Math.abs(same.x) < 1e-6 && Math.abs(same.y) < 1e-6, `${camX},${camY}`);
      }
    }
    assert.deepEqual(skirtGroundOffset({ id: 'T_1', decos: [] }, W, H), { x: 0, y: 0 }, 'no canvas size: street coordinates');
    assert.equal(skirtGroundOffset(null, W, H), null);
    // A wide foreground (500 px of slide) is left out; Matsya's front rocks (100 px) go in, placed
    // where they are with the camera mid-street and their bottom on the street's.
    assert.equal(skirtGroundOffset({ id: 'foreground', w: 6500, h: 1000 }, 6000, 1000), null);
    const matsya = street('GUV2LJJO5UC30B2');
    const rocks = matsya.layers.find((l) => l.id === 'T_1347661370388');
    const mw = streetWidth(matsya);
    const mh = streetHeight(matsya);
    const at = skirtGroundOffset(rocks, mw, mh);
    assert.ok(Math.abs(mw - rocks.w) <= SKIRT_SLIDE_MAX);
    const mid = parallaxLayerOffset(rocks, (mw - 1000) / 2, mh - 493, 1000, 493, mw, mh);
    assert.ok(Math.abs(at.x - mid.x) < 1e-6 && Math.abs(at.y - mid.y) < 1e-6, JSON.stringify({ at, mid }));
    for (const camX of [0, mw - 1000]) {
      const end = parallaxLayerOffset(rocks, camX, mh - 493, 1000, 493, mw, mh);
      assert.ok(Math.abs(end.x - at.x) <= SKIRT_SLIDE_MAX / 2 + 1e-6, 'off by at most half the slide');
    }
  });

  it('leaves streets whose own art runs below the edge alone: that art draws over the skirt', () => {
    // The Great Hole to Ix (Austin's good example): the dirt and trunks run past bounds.b.
    const hole = street('GLI2VDR4JRD1AEG');
    const W = streetWidth(hole);
    const H = streetHeight(hole);
    const mz = hole.layers.find((l) => l.id === 'middleground').z;
    const below = hole.layers.filter((l) => l.id !== 'middleground' && (l.decos || []).some((d) => d.y > (l.h || H) + 50));
    const front = below.filter((l) => l.z > mz).map((l) => l.id).sort();
    assert.deepEqual(front, ['foreground', 'middleplus']);
    // Both are front layers, which game.js draws above the whole street view (the strip included).
    assert.deepEqual(skirtGroundOffset(hole.layers.find((l) => l.id === 'middleplus'), W, H), { x: 0, y: 0 });
    assert.equal(skirtGroundOffset(hole.layers.find((l) => l.id === 'foreground'), W, H), null, 'its trees are not mirrored');
  });

  it('fades into the gradient bottom when it is darker than the ground, else the ground darkened', () => {
    const purple = 0x3a2f4a;
    const deep = shadeColour(purple, 0.55);
    assert.equal(skirtFadeColour(purple, 0xb8d9bd, 0xb8d9bd), deep, 'Cebarkul: a pale sky bottom is not ground');
    assert.equal(skirtFadeColour(purple, 0x000000, 0x000000), 0x000000, 'Panka Surazu: black stays black (ticket 39)');
    assert.equal(skirtFadeColour(0x6a6a6a, 0x690900, 0x690900), 0x690900, 'Hell One: its dark red');
    assert.equal(skirtFadeColour(purple, null, 0x6b8f3c), deep, 'no gradient: the band darkened');
    assert.equal(skirtFadeColour(null, 0x000000, 0x000000), 0x000000, 'no read: the fallback');
    assert.equal(skirtFadeColour(null, null, 0x6b8f3c), 0x6b8f3c);
    assert.equal(shadeColour(0xffffff, 0.5), 0x808080);
    assert.equal(shadeColour(0x123456, 1), 0x123456);
  });

  it('shades the seam a little and fades smoothly, readable at the edge and gone at the foot', () => {
    const { shade, fade } = skirtFadeStops();
    assert.equal(fade[0].at, 0);
    assert.ok(fade[0].alpha > 0 && fade[0].alpha < 0.3, 'the mirrored ground shows at the seam');
    assert.equal(fade[fade.length - 1].at, 1);
    assert.equal(fade[fade.length - 1].alpha, 1, 'solid at the foot, where the plain colour carries on');
    for (let i = 1; i < fade.length; i++) {
      assert.ok(fade[i].at > fade[i - 1].at && fade[i].alpha > fade[i - 1].alpha, 'rises');
      assert.ok(fade[i].alpha - fade[i - 1].alpha <= 0.3, 'no step');
    }
    assert.ok(shade[0].alpha > 0 && shade[0].alpha <= 0.35, 'a slight darken at the mirror line');
    assert.equal(shade[shade.length - 1].alpha, 0);
    assert.ok(shade[shade.length - 1].at <= 0.15, 'only near the seam');
  });
});
