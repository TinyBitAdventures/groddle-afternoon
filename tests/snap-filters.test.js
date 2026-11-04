import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FILTERS, FILTER_PACKS, VINTAGE_TEXT, applyFilter, colorize, dither, filtersFor, noise, outline, toFloat,
} from '../public/js/snap-filters.js?v=32315cf1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = join(root, '..', 'glitch-GameServerJS', 'main.js');

function picture(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) data.set(fn(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}
const gradient = () => picture(64, 48, (x, y) => [x * 4, y * 5, 128, 255]);
const flat = (rgb, w = 8, h = 8) => picture(w, h, () => [...rgb, 255]);
const px = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
const toBytes = (buf, i = 0) => [...buf.slice(i, i + 4)].map((v) => Math.round(v * 255));

describe('snap filter packs (main.js 6871-6893)', () => {
  it('match the server list', { skip: existsSync(MAIN) ? false : 'needs glitch-GameServerJS beside the repo' }, () => {
    const text = readFileSync(MAIN, 'utf8');
    for (const [card, list] of Object.entries(FILTER_PACKS)) {
      const block = text.split(`imagination_has_upgrade('${card}')`)[1].split(/\n\s*\}/)[0];
      const pushed = [...block.matchAll(/tsid:'([a-z_]+)', label:'([^']+)'/g)].map((m) => ({ tsid: m[1], label: m[2] }));
      assert.deepEqual(list.map((f) => ({ ...f })), pushed, card);
    }
  });

  it('filtersFor gives the owned packs in pack order', () => {
    assert.deepEqual(filtersFor([]), []);
    assert.deepEqual(filtersFor(['snapshotting']), []);
    const got = filtersFor(['snapshottery_filter_pack_3', 'snapshottery_basic_filter_pack']).map((f) => f.tsid);
    assert.deepEqual(got, ['boost_filter', 'bw_fitler', 'historic_filter', 'memphis_filter', 'dither_filter', 'shift_filter', 'outline_filter']);
    assert.equal(filtersFor(['snapshottery_basic_filter_pack'])[1].defaultAlpha, 1); // BlackWhiteFilter keeps 1
    assert.equal(filtersFor(['snapshottery_filter_pack_2'])[2].defaultAlpha, 1); // AncientFilter keeps 1
    assert.equal(filtersFor(['snapshottery_filter_pack_1'])[0].defaultAlpha, 0.8);
  });
});

describe('applyFilter', () => {
  it('every filter keeps the size, changes the picture, keeps an opaque picture opaque', () => {
    const img = gradient();
    for (const tsid of Object.keys(FILTERS)) {
      const out = applyFilter(img, tsid, undefined, { rng: () => 0.5 });
      assert.equal(out.width, 64);
      assert.equal(out.height, 48);
      assert.equal(out.data.length, img.data.length);
      assert.notDeepEqual(out.data, img.data, tsid);
      if (tsid === 'shift_filter') continue; // the alpha channel's own offset leaves a 1 px edge (ColorSeparator oa)
      for (let i = 3; i < out.data.length; i += 4) assert.equal(out.data[i], 255, tsid);
    }
  });

  it('alpha 0 gives the original back, but a lockAlpha border stays', () => {
    const img = gradient();
    for (const tsid of Object.keys(FILTERS)) {
      const out = applyFilter(img, tsid, 0, { rng: () => 0.5 });
      if (FILTERS[tsid].overlays.some((o) => o.lockAlpha)) {
        // Vintage's black frame and Ancient's white edge are drawn at full strength (lockAlpha);
        // a picture near snap size, as Flash's smoothed draw also thins an 800 px border on a tiny one.
        const big = picture(800, 550, () => [60, 90, 120, 255]);
        const b = applyFilter(big, tsid, 0, { rng: () => 0.5 });
        assert.deepEqual(px(b, 400, 275), px(big, 400, 275), tsid); // the middle
        assert.notDeepEqual(px(b, 2, 2), px(big, 2, 2), tsid); // the edge
      } else {
        assert.deepEqual(out.data, img.data, tsid);
      }
    }
    assert.deepEqual(applyFilter(img, 'normal').data, img.data);
    assert.deepEqual(applyFilter(img, '').data, img.data);
  });
});

describe('components', () => {
  it('ChannelColorizer: B&W of pure blue and Piggy of pure red', () => {
    const blue = toFloat(flat([0, 0, 255], 1, 1));
    const bw = colorize(blue, 1, 1, FILTERS.bw_fitler.components[0]);
    // (128*0 + 128*0 + 255*1) / (255 + (511 - 255) * 0.5) = 255 / 383.
    const v = Math.round((255 / 383) * 255);
    assert.deepEqual(toBytes(bw), [v, v, v, 255]);
    const red = toFloat(flat([255, 0, 0], 1, 1));
    assert.deepEqual(toBytes(colorize(red, 1, 1, FILTERS.piggy_filter.components[0])), [214, 45, 45, 255]);
  });

  it('Dither: mid grey is the 4x4 Bayer pattern, half on', () => {
    const grey = toFloat(flat([128, 128, 128], 4, 4));
    const out = dither(grey, 4, 4);
    let on = 0;
    for (let i = 0; i < out.length; i += 4) on += out[i];
    assert.equal(on, 8);
    assert.equal(out[0], 1); // threshold 1/17
    assert.equal(out[4], 0); // threshold 9/17
  });

  it('Outline: flat is white, a hard edge is black', () => {
    const flatBuf = toFloat(flat([90, 120, 30]));
    const f = outline(flatBuf, 8, 8, { difference: [1, 0] });
    for (let i = 0; i < f.length; i += 1) assert.equal(f[i], 1);
    const edge = toFloat(picture(8, 8, (x) => (x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255])));
    const e = outline(edge, 8, 8, { difference: [1, 0] });
    assert.deepEqual(toBytes(e, (2 * 8 + 3) * 4), [0, 0, 0, 255]);
    assert.deepEqual(toBytes(e, (2 * 8 + 6) * 4), [255, 255, 255, 255]);
  });

  it('Noise: white stays white and the scramble is fixed', () => {
    const white = toFloat(flat([255, 255, 255], 32, 32));
    const a = noise(white, 32, 32, { alpha: 0.07, srcSize: [900, 600] });
    for (let i = 0; i < a.length; i += 1) assert.equal(a[i], 1);
    const g = toFloat(gradient());
    assert.deepEqual(noise(g, 64, 48, { alpha: 0.07 }), noise(g, 64, 48, { alpha: 0.07 }));
  });
});

describe('the Vintage border caption', () => {
  it('keeps the Glitch trademark out of player pictures', () => {
    assert.match(VINTAGE_TEXT.text, /GRODDLE SNP 6005/);
    assert.doesNotMatch(VINTAGE_TEXT.text, /glitch/i);
  });
});
