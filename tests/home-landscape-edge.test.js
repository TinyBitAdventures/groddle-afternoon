/**
 * G951 (Austin 2026-11-17): on the home street, at the right end past the house, the flat
 * meadow field stopped short of the screen's edge with the Social drawer open: sky showed under
 * the hills to its right and the soil's cross-section stepped down there.
 *
 * The camera stops with the street's right end left of the drawer (game.js syncCameraSafeArea,
 * movement.js cameraTargetX; G582), so it shows the world up to that reserve past the street, and
 * a street narrower than the view sits centred. drawLandscape drew the field and soil 50 px past
 * the street and the parallax rows only to a fixed span. They now reach whatever the camera can
 * show (js/landscape-reach.js landscapeWindow, rowRange).
 *
 * This runs the real drawLandscape on a fake Pixi for every built street style at every front-yard
 * width (3 + 8 to 20 + 20 segments) and every back-yard look at every back-yard width (5 to 20
 * segments, the smallest and largest house), and moves the camera as the game does to both ends
 * of the street in views from a phone's to the widest, the drawer folded and open as far as the
 * camera allows. At every stop the field, the soil and every row of every parallax layer must
 * reach both edges of the view.
 * Run: node --test tests/home-landscape-edge.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { HOME_LIMITS } from '../public/js/homes-catalog.js?v=0367f90f';
import { YARD_SEGMENT_W, HOUSE_LOT_W } from '../public/js/home-cultivation.js?v=b2868d29';
import { interiorWidth } from '../public/js/home-decor.js?v=31f37d9b';
import { EXTERIOR_STYLES, INTERIOR_STYLES, streetLook, yardLook } from '../public/js/home-styles.js?v=ec5d2f69';
import { cameraLocationViewWidth, cameraTargetX } from '../public/js/movement.js?v=f4be1a05';
import { LANDSCAPE_VIEW_W, cameraEnds, landscapeWindow, rowRange } from '../public/js/landscape-reach.js?v=2f2d7cb3';
import { BACK_YARD_GROUND_Y, STREET_GROUND_Y, drawLandscape, landscapeItemHalf } from '../public/js/features/homes-feature.js?v=62049096';
import { buildNeighbourBackground } from '../public/js/features/neighbour-scene.js?v=a47cd190';
import { NEIGHBOUR_SCENE } from '../public/js/neighbours.js?v=13f35acd';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

/** A fake Graphics that keeps its rectangles. */
class RectGraphics extends Display {
  constructor() {
    super();
    this.rects = [];
  }
  rect(x, y, w, h) {
    this.rects.push([x, x + w]);
    return this;
  }
  fill() {
    return this;
  }
}
const rectPixi = new Proxy({ Graphics: RectGraphics }, { get: (t, k) => (k in t ? t[k] : fakePixi[k]) });

/** Views from an upright phone's to the widest the scenes are drawn for. */
const VIEWS = [402, 640, 960, 1280, 1680, LANDSCAPE_VIEW_W];

/** game.js cameraTargetForPlayer, at a player standing at x. */
function cameraAt(x, W, view, inset) {
  const spare = view - W;
  if (spare > 0) return -Math.round(spare / 2);
  return cameraTargetX(x, 0, W, view, 4.4, inset);
}

/** Every camera stop to check: both ends, each view, the drawer folded and open its widest. */
function stops(W) {
  const out = [];
  for (const view of VIEWS) {
    for (const inset of [0, view * 0.42, view]) {
      for (const x of [0, W]) out.push({ camX: cameraAt(x, W, view, inset), view });
    }
  }
  return out;
}

/** [left, right] intervals cover [a, b] with no gap. */
function covers(spans, a, b) {
  let at = a;
  for (const [l, r] of [...spans].sort((p, q) => p[0] - q[0])) {
    if (l > at + 0.5) break;
    at = Math.max(at, r);
    if (at >= b) return true;
  }
  return at >= b - 0.5;
}

/**
 * Each parallax row's pieces, matched by their drawn width (one of the item's alts) and put
 * back on the row's lattice (piece k at offset - 200 + k * every, before its jitter): every
 * piece whose art could show in the view, however its jitter falls, must be drawn (each claims
 * a drawn piece within its jitter of its lattice spot, in order).
 */
function rowShortfalls(lc, layer, view, camX) {
  const out = [];
  const visL = camX * layer.f;
  const visR = visL + view;
  const left = new Set(lc.children.filter((c) => !Array.isArray(c.homeLayoutFills)));
  for (const item of layer.items || []) {
    const widths = new Set((item.alts?.length ? item.alts : [item]).map((row) => (row.w ?? item.w) * item.scale));
    const mine = [...left].filter((s) => widths.has(Math.abs(s.width)));
    for (const s of mine) left.delete(s);
    const base = (item.offset || 0) - 200;
    const reach = landscapeItemHalf(item) + (item.jitter || 0);
    const xs = mine.map((s) => s.x).sort((p, q) => p - q);
    const claimed = new Set();
    // The pieces the view could show: centre within its art's reach of the view.
    const from = Math.ceil((visL - reach - base) / item.every);
    const to = Math.floor((visR + reach - base) / item.every);
    for (let k = from; k <= to; k += 1) {
      const c = base + k * item.every;
      if (c + reach <= visL || c - reach >= visR) continue;
      const hit = xs.findIndex((x, i) => !claimed.has(i) && Math.abs(x - c) <= (item.jitter || 0) + 1e-6);
      if (hit >= 0) claimed.add(hit);
      else {
        out.push(`${item.s}: piece ${k} at ${Math.round(c)} missing, view ${Math.round(visL)} to ${Math.round(visR)}`);
        break;
      }
    }
  }
  return out;
}

/** Every gap the camera would show in one drawn landscape, [] when there is none. */
function gaps(root, look, W) {
  const field = root.children.find((c) => c.zIndex === -40);
  const soilFill = root.children.find((c) => c.zIndex === -39.5);
  const soil = root.children.filter((c) => c.zIndex === -39).map((s) => [s.x, s.x + s.width]);
  const layers = root.children.filter((c) => Number.isFinite(c.parallaxF) && c.zIndex > -99);
  const out = [];
  for (const { camX, view } of stops(W)) {
    const a = camX;
    const b = camX + view;
    const at = `W ${W} view ${view} cam ${Math.round(camX)}`;
    const fill = (g) => g.homeLayoutFills.map(([x, , w]) => [x, x + w]);
    if (!covers(fill(field).slice(0, 1), a, b)) out.push(`${at}: field`);
    if (!covers(fill(soilFill).slice(0, 1), a, b)) out.push(`${at}: soil fill`);
    if (look.soil && !covers(soil, a, b)) out.push(`${at}: soil tiles`);
    look.layers.forEach((layer, li) => {
      for (const miss of rowShortfalls(layers[li], layer, view, camX)) out.push(`${at}: layer ${li} (f ${layer.f}) ${miss}`);
    });
  }
  return out;
}

const engine = { PIXI: fakePixi, renderer: null };

function draw(look, seed, width, groundY) {
  const root = new fakePixi.Container();
  drawLandscape(engine, root, look, seed, { width, groundY, lift: 0 });
  return root;
}

describe('home landscapes reach every edge the camera shows (G951)', () => {
  const saved = {};
  before(() => {
    saved.document = globalThis.document;
    saved.PIXI = globalThis.PIXI;
    globalThis.PIXI = fakePixi;
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null };
  });
  after(() => {
    globalThis.document = saved.document;
    globalThis.PIXI = saved.PIXI;
  });

  it('the camera window: the widest reserve at the right end, centred when narrow', () => {
    const view = 1280;
    assert.deepEqual(cameraEnds(3000, view), { min: 0, max: 3000 - cameraLocationViewWidth(view, view) });
    assert.deepEqual(cameraEnds(800, view), { min: -240, max: -240 });
    const win = landscapeWindow(2370, 1, LANDSCAPE_VIEW_W);
    assert.equal(win.left, 0);
    assert.equal(win.right, 2370 + LANDSCAPE_VIEW_W * 0.48);
    const narrow = landscapeWindow(750, 1, LANDSCAPE_VIEW_W);
    assert.equal(narrow.left, -(LANDSCAPE_VIEW_W - 750) / 2);
    assert.equal(narrow.right, 750 + (LANDSCAPE_VIEW_W - 750) / 2);
    // A row keeps its first piece (k 0) and adds pieces only where the window needs them.
    assert.deepEqual(rowRange({ base: -200, every: 300, half: 50 }, { left: 0, right: 1000 }), { first: 0, last: 4 });
    assert.deepEqual(rowRange({ base: -200, every: 300, half: 50 }, { left: -700, right: 1000 }), { first: -1, last: 4 });
  });

  it('every street style, every front-yard width, both ends', () => {
    const built = EXTERIOR_STYLES.filter((row) => row.built);
    assert.ok(built.length > 30);
    const widths = [];
    for (let n = HOME_LIMITS.START_FRONTYARD_LEFT_SEGMENTS + HOME_LIMITS.START_FRONTYARD_RIGHT_SEGMENTS; n <= HOME_LIMITS.MAX_FRONTYARD_LEFT_SEGMENTS + HOME_LIMITS.MAX_FRONTYARD_RIGHT_SEGMENTS; n += 1) {
      widths.push(n * YARD_SEGMENT_W + HOUSE_LOT_W);
    }
    const bad = [];
    for (const row of built) {
      const look = streetLook(row.key);
      for (const W of widths) {
        const miss = gaps(draw(look, look.seed || row.key, W, STREET_GROUND_Y), look, W);
        if (miss.length) bad.push(`${row.key}: ${miss[0]} (+${miss.length - 1})`);
      }
    }
    assert.deepEqual(bad.slice(0, 12), []);
  });

  it('every back-yard look, every back-yard width, the smallest and largest house', () => {
    const built = INTERIOR_STYLES.filter((row) => row.built);
    assert.ok(built.length > 30);
    const rooms = [HOME_LIMITS.MIN_WALL_SEGMENTS, HOME_LIMITS.MAX_WALL_SEGMENTS].map((wallSegments) => interiorWidth({ wallSegments }));
    const bad = [];
    for (const row of built) {
      const look = yardLook(row.key);
      for (let seg = HOME_LIMITS.START_BACKYARD_SEGMENTS; seg <= HOME_LIMITS.MAX_BACKYARD_SEGMENTS; seg += 1) {
        for (const room of rooms) {
          const W = seg * YARD_SEGMENT_W + room;
          const miss = gaps(draw(look, `yard:${row.key}`, W, BACK_YARD_GROUND_Y), look, W);
          if (miss.length) bad.push(`${row.key}: ${miss[0]} (+${miss.length - 1})`);
        }
      }
    }
    assert.deepEqual(bad.slice(0, 12), []);
  });

  it("a neighbour's street reaches both edges too", () => {
    const W = NEIGHBOUR_SCENE.width;
    for (const style of ['meadow', 'firebog', 'uralia', 'snow']) {
      const root = buildNeighbourBackground(rectPixi, { id: `n-${style}`, style, props: [], house: { path: 'house', w: 100, h: 100, scale: 1, doorX: 0.5, saleX: -1 } });
      const field = root.children.find((c) => c.zIndex === -40);
      const soilFill = root.children.find((c) => c.zIndex === -39.5);
      const soil = root.children.filter((c) => c.zIndex === -39).map((s) => [s.x, s.x + s.width]);
      for (const { camX, view } of stops(W)) {
        const at = `${style} at cam ${camX} view ${view}`;
        assert.ok(covers(field.rects.slice(0, 1), camX, camX + view), `${at}: field`);
        assert.ok(covers(soilFill.rects, camX, camX + view), `${at}: soil fill`);
        assert.ok(covers(soil, camX, camX + view), `${at}: soil tiles`);
      }
    }
  });
});
