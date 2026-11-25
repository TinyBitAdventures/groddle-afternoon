/**
 * G954 (#471): on a phone held upright the home street's trees floated with their roots in the
 * air (Bonzai), rocks hovered over a pale band, and the Change Style tiles showed the same.
 *
 * Two causes. The street: the style recipes stand each layer's trees, hills and cliffs up to
 * ~130 px behind the field's back edge and drew nothing under them, so sky showed between their
 * feet and the field at every view size (an upright phone frames the most of it). Each layer now
 * has the ground its pieces stand on (homes-feature.js layerGround). The tiles: the pieces were
 * placed in pixels for a 64 px tile while the field and bands were percent, and a phone's tile is
 * 52 px (stylePreviewLayout now places everything in percent).
 *
 * This draws every built street style and back-yard look with the real drawLandscape on a fake
 * Pixi and checks that every standing piece has ground or field under its feet, that no layer's
 * height depends on the view (an upright and a sideways phone, a desktop), and lays out every
 * style's tile at phone and desktop heights.
 * Run: node --test tests/g954-landscape-standing.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import { EXTERIOR_STYLES, INTERIOR_STYLES, streetLook, yardLook } from '../public/js/home-styles.js?v=ec5d2f69';
import { BACK_YARD_GROUND_Y, STREET_GROUND_Y, drawLandscape, landscapeGeometry, layerGround, stylePreviewLayout } from '../public/js/features/homes-feature.js?v=b0eea316';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

/** A fake Graphics that keeps its rectangles' boxes. */
class RectGraphics extends Display {
  constructor() {
    super();
    this.boxes = [];
  }
  rect(x, y, w, h) {
    this.boxes.push({ x, y, w, h });
    return this;
  }
  fill() {
    return this;
  }
}
const rectPixi = new Proxy({ Graphics: RectGraphics }, { get: (t, k) => (k in t ? t[k] : fakePixi[k]) });
const engine = { PIXI: rectPixi, renderer: null };

const SKY = /cloud|moon|haze|flying_platform|light_sha|light_spot|fireflies|treetop|ripple/i;
const OLD_GROUND = 620;
/** Views: an Android phone upright (#471) and sideways, an iPhone upright and sideways, a desktop. */
const VIEWS = [[384, 644], [644, 384], [402, 812], [812, 402], [1280, 800]];

function looks() {
  return [
    ...EXTERIOR_STYLES.filter((r) => r.built).map((r) => ({ key: r.key, look: streetLook(r.key), groundY: STREET_GROUND_Y })),
    ...INTERIOR_STYLES.filter((r) => r.built).map((r) => ({ key: `yard:${r.key}`, look: yardLook(r.key), groundY: BACK_YARD_GROUND_Y })),
  ];
}

function draw({ key, look, groundY }) {
  const root = new rectPixi.Container();
  const land = drawLandscape(engine, root, look, key, { width: 2400, groundY, lift: groundY - OLD_GROUND });
  return { root, land };
}

/** Each standing piece of each parallax layer whose feet show sky: [] when every one stands. */
function floating({ key, look, groundY }, root) {
  const { fieldTop } = landscapeGeometry(look, groundY);
  const layers = root.children.filter((c) => Number.isFinite(c.parallaxF) && c.zIndex > -99);
  const out = [];
  look.layers.forEach((layer, li) => {
    const lc = layers[li];
    const ground = lc.children.filter((c) => Array.isArray(c.homeLayoutFills) && c.boxes?.length).flatMap((g) => g.boxes);
    for (const item of layer.items || []) {
      if (item.hang || item.flipY || SKY.test(item.s)) continue;
      const feet = item.y + (groundY - OLD_GROUND) - landscapeGeometry(look, groundY).rise;
      if (feet >= fieldTop - 0.5) continue;
      const held = ground.some((b) => b.y <= feet + 0.5 && b.y + b.h >= fieldTop);
      if (!held) out.push(`${key} layer ${li} ${item.s}: feet ${Math.round(fieldTop - feet)} px above the field, nothing under`);
    }
  });
  return out;
}

describe('home landscapes stand on their ground (G954)', () => {
  const saved = {};
  before(() => {
    saved.document = globalThis.document;
    saved.PIXI = globalThis.PIXI;
    globalThis.PIXI = rectPixi;
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null };
  });
  after(() => {
    globalThis.document = saved.document;
    globalThis.PIXI = saved.PIXI;
  });

  it('#471 Bonzai: the cliffs and bonsai behind the field have ground under them', () => {
    const look = streetLook('pol_ext_bonsai_high');
    const grounds = look.layers.map((layer) => layerGround(look, layer));
    assert.ok(grounds.filter(Boolean).length >= 2, 'the far cliffs and the f 0.2 row');
    const { root } = draw({ key: 'bonsai', look, groundY: STREET_GROUND_Y });
    assert.deepEqual(floating({ key: 'bonsai', look, groundY: STREET_GROUND_Y }, root), []);
  });

  it('every street style and back-yard look: no standing piece shows sky under its feet', () => {
    const all = looks();
    assert.ok(all.length > 60);
    const bad = [];
    for (const row of all) bad.push(...floating(row, draw(row).root));
    assert.deepEqual(bad.slice(0, 12), []);
  });

  it('no layer moves up or down with the view (phones upright and sideways, a desktop)', () => {
    const bad = [];
    for (const row of looks()) {
      const { root, land } = draw(row);
      const ys = () => root.children.filter((c) => Number.isFinite(c.parallaxF)).map((c) => c.y);
      const first = ys().join();
      for (const [w, h] of VIEWS) {
        land.update(300, row.groundY - h * 0.7, w, h);
        if (ys().join() !== first) bad.push(`${row.key} at ${w}x${h}`);
      }
    }
    assert.deepEqual(bad.slice(0, 12), []);
  });

  it('every style tile, at the phone (52 px) and desktop (64 px) heights: the pieces stand where the street stands them', () => {
    const bad = [];
    for (const row of looks()) {
      const { field, parts } = stylePreviewLayout(row.look);
      const grounds = parts.filter((p) => p.band && p.bottom === 0);
      for (const tile of [52, 64]) {
        const px = (v) => (v * tile) / 100;
        for (const piece of parts.filter((p) => !p.band && !p.near && !SKY.test(p.s))) {
          const held = px(piece.bottom) <= px(field) + 0.01 || grounds.some((g) => px(g.height) >= px(piece.bottom) - 0.01);
          if (!held) bad.push(`${row.key} ${piece.s} at ${tile} px: ${px(piece.bottom - field).toFixed(1)} px over the field`);
        }
      }
    }
    assert.deepEqual(bad.slice(0, 12), []);
  });

  it('the tile picture is all percent, so it scales with the tile', () => {
    const src = readFileSync(new URL('../public/js/features/homes-feature.js', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('function stylePreviewEl('), src.indexOf('function ensureStylesUi('));
    assert.doesNotMatch(body, /px[;`]/);
  });
});
