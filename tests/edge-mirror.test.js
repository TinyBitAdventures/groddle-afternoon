/**
 * EDGE MIRROR (G582, Austin 2026-11-11 "mirror the street's edge"): the camera stops with a
 * street's right end left of the Modern skin's Social drawer, a floating card, so the world past
 * the end shows around it. Each layer's art at its end is mirrored past that end (street-render
 * attachEdgeMirrors): the strip widths cover the most the camera can show past each layer's own
 * end (its parallax lands it elsewhere), the reflection meets the art at the end, and the strips'
 * textures go with the street.
 * Run: node --test tests/edge-mirror.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EDGE_MIRROR_BYTES,
  EDGE_MIRROR_MARGIN,
  attachEdgeMirrors,
  edgeMirrorResolution,
  edgeMirrorStrip,
  edgeMirrorTexels,
  edgeMirrorWidths,
  parallaxLayerOffset,
  wholeTexels,
} from '../public/js/street-render.js?v=3bc17de1';
import { cameraTargetX } from '../public/js/movement.js?v=b30f84eb';

describe('edge mirror widths', () => {
  it('covers the reserve past the middleground end and nothing more without one', () => {
    const base = { parallax: false, streetW: 6000, vpW: 1000 };
    assert.deepEqual(edgeMirrorWidths({ ...base, maxInset: 420 }), { left: 0, right: 420 + EDGE_MIRROR_MARGIN });
    assert.deepEqual(edgeMirrorWidths({ ...base, maxInset: 0 }), { left: 0, right: 0 });
  });

  it('scales each parallax layer by how far it ends from the street end (Groddle Forest Junction)', () => {
    const at = (layerW) => edgeMirrorWidths({ layerW, streetW: 6000, vpW: 1000, maxInset: 420 }).right;
    // foreground 6500: 420 x 5500 / 5000 = 462 past its end; sky 4800: 420 x 3800 / 5000 = 319.2.
    assert.equal(at(6500), 462 + EDGE_MIRROR_MARGIN);
    assert.equal(at(4800), Math.ceil(319.2 + EDGE_MIRROR_MARGIN));
    // A layer narrower than the view never fills it: its right end shows at the street's start
    // (100 px), and its slide runs on past the street's end (percX over 1), so its LEFT end comes
    // 1.084 x 100 px into the view while the camera stops at the reserve.
    assert.deepEqual(
      edgeMirrorWidths({ layerW: 900, streetW: 6000, vpW: 1000, maxInset: 420 }),
      { left: Math.ceil(108.4 + EDGE_MIRROR_MARGIN), right: 100 + EDGE_MIRROR_MARGIN }
    );
  });

  it('agrees with the camera and the parallax at every reserve (the strip always reaches the view edge)', () => {
    for (const [W, vpW] of [[6000, 1000], [3000, 1515], [2400, 1680], [1800, 960]]) {
      for (const share of [0, 0.2, 0.42]) {
        const inset = vpW * share;
        const camX = cameraTargetX(1e9, 0, W, vpW, 4.4, inset);
        for (const lw of [vpW + 50, W * 0.8, W, W + 500]) {
          const { right } = edgeMirrorWidths({ layerW: lw, streetW: W, vpW, maxInset: vpW * 0.42 });
          const end = parallaxLayerOffset({ w: lw, h: 1000 }, camX, 0, vpW, 600, W, 1000).x - camX + lw;
          assert.ok(end + right >= vpW, `W ${W} view ${vpW} share ${share} layer ${lw}: end ${end} + ${right}`);
        }
      }
    }
  });

  it('mirrors both ends of a street narrower than the view, capped at the layer', () => {
    assert.deepEqual(
      edgeMirrorWidths({ parallax: false, streetW: 800, vpW: 1000, maxInset: 420 }),
      { left: 100 + EDGE_MIRROR_MARGIN, right: 100 + EDGE_MIRROR_MARGIN }
    );
    // A parallax layer is centred on the street (report #209, parallaxRestX): a 900 px one shows
    // 50 px past each end of the 1000 px view, a 60 px one is all strip on both sides.
    assert.deepEqual(edgeMirrorWidths({ layerW: 900, streetW: 800, vpW: 1000 }), { left: 50 + EDGE_MIRROR_MARGIN, right: 50 + EDGE_MIRROR_MARGIN });
    assert.deepEqual(edgeMirrorWidths({ layerW: 60, streetW: 800, vpW: 1000 }), { left: 60, right: 60 });
  });
});

describe('edge mirror strip geometry', () => {
  const boxes = [
    { x0: 5500, y0: 300, x1: 5800, y1: 900 },
    { x0: 5900, y0: 100, x1: 6120, y1: 1300 },
    { x0: 0, y0: 600, x1: 200, y1: 700 },
  ];

  it('takes the last px and flips them about the end, so the edge pixels meet', () => {
    const s = edgeMirrorStrip('right', 444, 6000, boxes, 1200);
    assert.deepEqual(s, { side: 'right', x0: 5556, y0: 100, w: 444, h: 1100, at: 6444, end: 6000 });
    // Drawn with scale.x -1 at `at`, the point d px left of the end lands d px right of it.
    const screen = (x) => s.at - (x - s.x0);
    for (const d of [0, 1, 100, 444]) assert.equal(screen(6000 - d), 6000 + d);
  });

  it('flips the first px about x = 0 at the left end', () => {
    const s = edgeMirrorStrip('left', 150, 6000, boxes, 1200);
    assert.deepEqual(s, { side: 'left', x0: 0, y0: 600, w: 150, h: 100, at: 0, end: 0 });
    const screen = (x) => s.at - (x - s.x0);
    assert.equal(screen(0), 0);
    assert.equal(screen(150), -150);
  });

  it('flips art that stops a hair short of the end about its own edge (Grimssea Hollow bark at x 0.5)', () => {
    // A 1125 px street with its bark centred at 563: the art runs 0.5 to 1125.5.
    const bark = [{ x0: 0.5, y0: 0, x1: 1125.5, y1: 2250 }];
    const left = edgeMirrorStrip('left', 111, 1125, bark);
    assert.equal(left.end, 0.5);
    assert.equal(left.x0, 0.5);
    assert.equal(left.at, 0.5);
    // Overhanging the right end: flipped about the layer's end (and clipped there).
    assert.equal(edgeMirrorStrip('right', 111, 1125, bark).end, 1125);
    // Short of the right end by under EDGE_MIRROR_SNAP: about the art's edge.
    const r = edgeMirrorStrip('right', 100, 6000, [{ x0: 5000, y0: 0, x1: 5998.6, y1: 100 }]);
    assert.equal(r.end, 5998.6);
    assert.equal(r.x0, 5898.6);
    assert.equal(r.at, 6098.6);
    const t = edgeMirrorTexels(r, 6000, 1.52);
    assert.ok(Math.abs(t.at - Math.round(t.width * 1.52) / 1.52 - 5998.6) < 1e-6);
    // Art that stops well short is a real gap at the end, mirrored as drawn.
    assert.equal(edgeMirrorStrip('right', 100, 6000, [{ x0: 5000, y0: 0, x1: 5990, y1: 100 }]).end, 6000);
    assert.equal(edgeMirrorStrip('left', 100, 6000, [{ x0: 5, y0: 0, x1: 90, y1: 100 }]).end, 0);
  });

  it('has nothing to draw where no art crosses the column', () => {
    assert.equal(edgeMirrorStrip('right', 100, 6000, [{ x0: 0, y0: 0, x1: 5000, y1: 100 }]), null);
    assert.equal(edgeMirrorStrip('right', 0, 6000, boxes), null);
    // Art wholly below the layer's bottom is the ground skirt's.
    assert.equal(edgeMirrorStrip('right', 100, 6000, [{ x0: 5950, y0: 1250, x1: 6000, y1: 1300 }], 1200), null);
  });

  it('drops the resolution to the budget', () => {
    assert.equal(edgeMirrorResolution([{ w: 400, h: 1000 }], 2), 2);
    const big = [{ w: 700, h: 3000 }, { w: 700, h: 3000 }, { w: 700, h: 3000 }];
    const res = edgeMirrorResolution(big, 2);
    assert.ok(res < 2 && res >= 0.5);
    assert.ok(big.reduce((n, s) => n + s.w * s.h, 0) * res * res * 4 <= EDGE_MIRROR_BYTES);
  });
});

describe('edge mirror seam (Middle Arbor, 2026-11-12: a thin light line at the right end)', () => {
  // Pixi sizes a render texture in whole pixels (TextureSource.resize) and a sprite by that.
  const pixiWidth = (width, res) => Math.round(width * res) / res;

  it('the old texture came out short at a resolution that rounded down (the gap)', () => {
    // Middle Arbor at 910 css px on a 2x screen: sky strip 324 px at 1.52 is 492.48 texels, 492 kept.
    assert.ok(pixiWidth(324, 1.52) < 324);
    // Drawn flipped from its far side (at = end + w), it stopped 0.32 px short of the end.
    assert.ok(6000 + 324 - pixiWidth(324, 1.52) - 6000 > 0.3);
  });

  it('meets the end exactly at every resolution and width, and never comes out short', () => {
    const resolutions = [];
    for (let r = 0.5; r <= 2.0001; r += 0.05) resolutions.push(r, r / 1.25, r / 1.25 / 1.25);
    for (const res of resolutions) {
      for (let w = 1; w <= 900; w += 1) {
        for (const lw of [6000, 4700, 5400.5]) {
          const right = edgeMirrorTexels({ side: 'right', w, h: 977 }, lw, res);
          const drawn = pixiWidth(right.width, res);
          assert.equal(Math.round(right.width * res), right.pixelWidth, `res ${res} w ${w}`);
          assert.ok(drawn >= w - 1e-9, `res ${res} w ${w}: ${drawn} short`);
          // The sprite, scale.x -1 at `at`, spans [at - drawn, at]: its seam edge on the end.
          assert.ok(Math.abs(right.at - drawn - lw) < 1e-6, `res ${res} w ${w} lw ${lw}: seam at ${right.at - drawn}`);
          // The texture's right edge is the layer's end: the texel at the seam is the end's art.
          assert.ok(Math.abs(right.x0 + drawn - lw) < 1e-6);
          const left = edgeMirrorTexels({ side: 'left', w, h: 977 }, lw, res);
          assert.equal(left.x0, 0);
          assert.equal(left.at, 0);
          assert.ok(pixiWidth(left.width, res) >= w - 1e-9);
        }
      }
    }
  });

  it('keeps a width already on whole texels and rounds the rest up', () => {
    assert.equal(wholeTexels(428, 1.75), 749);
    assert.equal(wholeTexels(428, 1.8), 771);
    assert.equal(wholeTexels(324, 1.52), 493);
    assert.equal(wholeTexels(0.2, 1), 1);
  });
});

/** Just enough Pixi for attachEdgeMirrors: containers, sprites, a clip and counted render textures. */
function fakePixi() {
  const made = [];
  class Container {
    constructor() {
      this.children = [];
      this.parent = null;
      this.destroyed = false;
      this.listeners = {};
      this.x = 0;
      this.y = 0;
      this.zIndex = 0;
      this.visible = true;
      this.mask = null;
      this.label = '';
    }
    addChild(...kids) {
      for (const kid of kids) {
        kid.parent?.removeChild(kid);
        kid.parent = this;
        this.children.push(kid);
      }
      return kids[0];
    }
    addChildAt(kid, i) {
      kid.parent?.removeChild(kid);
      kid.parent = this;
      this.children.splice(i, 0, kid);
      return kid;
    }
    getChildIndex(kid) {
      return this.children.indexOf(kid);
    }
    removeChild(kid) {
      const i = this.children.indexOf(kid);
      if (i >= 0) this.children.splice(i, 1);
      kid.parent = null;
      return kid;
    }
    once(name, fn) {
      (this.listeners[name] ||= []).push(fn);
    }
    destroy(opts) {
      if (this.destroyed) return;
      this.destroyed = true;
      this.parent?.removeChild(this);
      if (opts?.children) for (const kid of [...this.children]) kid.destroy?.(opts);
      for (const fn of this.listeners.destroyed || []) fn();
    }
  }
  class Sprite extends Container {
    constructor(texture) {
      super();
      this.texture = texture;
      this.scale = { x: 1, y: 1 };
      this.anchor = { x: 0, y: 0 };
      this.rotation = 0;
    }
  }
  class Graphics extends Container {
    rect() {
      return this;
    }
    fill() {
      return this;
    }
  }
  class Matrix {
    constructor(...m) {
      this.m = m;
    }
  }
  const RenderTexture = {
    create(o) {
      const rt = { ...o, orig: { width: o.width, height: o.height }, destroyed: false, destroy() { this.destroyed = true; } };
      made.push(rt);
      return rt;
    },
  };
  return { PIXI: { Container, Sprite, Graphics, Matrix, RenderTexture }, made };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('edge mirror lifecycle', () => {
  it('builds one texture per layer end once the view width is known, rebuilds on a new width, frees on leave', async () => {
    const { PIXI, made } = fakePixi();
    const renders = [];
    const renderer = { resolution: 2, render: (o) => renders.push(o) };
    const root = new PIXI.Container();
    const deco = (x, y, w, h) => {
      const spr = new PIXI.Sprite({ orig: { width: w, height: h }, source: {} });
      spr.x = x;
      spr.y = y;
      return spr;
    };
    const ground = new PIXI.Container();
    ground.label = 'middleground';
    ground.addChild(deco(5700, 900, 360, 200), deco(100, 900, 360, 200));
    const far = new PIXI.Container();
    far.label = 'bg_1';
    far.zIndex = -10;
    far.parallaxLayer = { w: 5400, h: 1200 };
    far.addChild(deco(5200, 300, 300, 600));
    root.addChild(far, ground);
    attachEdgeMirrors(PIXI, renderer, root, [far, ground], 6000, 1200, () => 0.42);
    await tick();
    assert.equal(made.length, 0, 'nothing until a frame says how wide the view is');
    root.edgeMirrorFrame(5000, 1000);
    await tick();
    const stats = root.edgeMirrorStats();
    assert.equal(stats.builds, 1);
    assert.deepEqual(stats.strips.map((s) => `${s.layer}:${s.side}:${s.w}`).sort(), ['bg_1:right:394', 'middleground:right:444']);
    assert.equal(made.length, 2);
    assert.equal(renders.length, 2);
    // Each strip in its own container beside its layer, moving with it, over it.
    assert.equal(ground.edgeMirror.parent, root);
    assert.equal(ground.edgeMirror.zIndex, 0.5);
    far.x = 640;
    root.edgeMirrorFrame(5000, 1000);
    assert.equal(far.edgeMirror.x, 640);
    // The layers went back where they were (rendered alone in a throwaway parent).
    assert.deepEqual(root.children.slice(0, 2), [far, ground]);
    // The middleground's deco overhangs its end: it is clipped there while its strip shows.
    assert.ok(ground.mask && ground.mask.edgeClip);
    root.edgeMirrorFrame(0, 1000);
    assert.equal(ground.mask, null, 'no clip while the end is off screen');
    const sprite = ground.edgeMirror.children[0];
    assert.equal(sprite.scale.x, -1);
    assert.equal(sprite.x, 6444);
    assert.equal(sprite.visible, false);
    // Wider view (zoom out): built again, the old textures freed.
    root.edgeMirrorFrame(0, 1500);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(root.edgeMirrorStats().builds, 2);
    assert.equal(made.length, 4);
    assert.ok(made.slice(0, 2).every((t) => t.destroyed));
    // Leaving the street frees every strip.
    root.destroy({ children: true });
    assert.ok(made.every((t) => t.destroyed));
    assert.equal(root.edgeMirrorStats().textures, 0);
  });

  it('renders whole texels ending on the layer end and draws the strip from there (no seam at 1.9)', async () => {
    const { PIXI, made } = fakePixi();
    const renders = [];
    const renderer = { resolution: 1.9, render: (o) => renders.push(o) };
    const root = new PIXI.Container();
    const ground = new PIXI.Container();
    ground.label = 'middleground';
    const spr = new PIXI.Sprite({ orig: { width: 400, height: 200 }, source: {} });
    spr.x = 5600;
    spr.y = 900;
    ground.addChild(spr);
    root.addChild(ground);
    attachEdgeMirrors(PIXI, renderer, root, [ground], 6000, 1200, () => 0.42);
    root.edgeMirrorFrame(5000, 1000);
    await tick();
    const [rt] = made;
    const res = rt.resolution;
    // 444 px at 1.9 is 843.6 texels: Pixi would keep 844 (fine) but 1.8 or 1.52 lose the last.
    assert.ok(Number.isInteger(Math.round(rt.width * res)) && Math.abs(rt.width * res - Math.round(rt.width * res)) < 1e-6);
    assert.ok(rt.width >= 444);
    // The column rendered ends at the layer's end, and the flipped sprite's seam edge sits on it.
    assert.ok(Math.abs(-renders[0].transform.m[4] + rt.width - 6000) < 1e-6);
    const strip = ground.edgeMirror.children[0];
    assert.ok(Math.abs(strip.x - rt.width - 6000) < 1e-6);
  });

  it('builds nothing on a wide street where nothing covers the world (Classic)', async () => {
    const { PIXI, made } = fakePixi();
    const root = new PIXI.Container();
    const ground = new PIXI.Container();
    ground.label = 'middleground';
    ground.addChild(new PIXI.Sprite({ orig: { width: 100, height: 100 }, source: {} }));
    root.addChild(ground);
    attachEdgeMirrors(PIXI, { resolution: 1, render() {} }, root, [ground], 6000, 1200, 0);
    await tick();
    root.edgeMirrorFrame(0, 1000);
    await tick();
    assert.equal(made.length, 0);
    assert.equal(root.edgeMirrorStats().builds, 1);
  });
});
