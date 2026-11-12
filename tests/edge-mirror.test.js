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
  edgeMirrorWidths,
  parallaxLayerOffset,
} from '../public/js/street-render.js?v=052b204a';
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
    assert.deepEqual(s, { side: 'right', x0: 5556, y0: 100, w: 444, h: 1100, at: 6444 });
    // Drawn with scale.x -1 at `at`, the point d px left of the end lands d px right of it.
    const screen = (x) => s.at - (x - s.x0);
    for (const d of [0, 1, 100, 444]) assert.equal(screen(6000 - d), 6000 + d);
  });

  it('flips the first px about x = 0 at the left end', () => {
    const s = edgeMirrorStrip('left', 150, 6000, boxes, 1200);
    assert.deepEqual(s, { side: 'left', x0: 0, y0: 600, w: 150, h: 100, at: 0 });
    const screen = (x) => s.at - (x - s.x0);
    assert.equal(screen(0), 0);
    assert.equal(screen(150), -150);
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
