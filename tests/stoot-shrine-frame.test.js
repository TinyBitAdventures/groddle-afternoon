/**
 * The Stoot shrine (unnnn, GIFPV9EMLT72DP4, through the Mezzanine crawlspace): Glitch's
 * flash_crasher_demon held up rook_hall_placeholder_painting, a framed photo of a real person. The
 * photo stays out (tools/deco-pipeline/recover.py HELD), so the street showed the demon holding
 * nothing. Now the demon holds that deco's own wooden frame, empty and with a blank plaque
 * (recover.py CUTS, ours, Austin 2026-11-25), drawn through DECO_TWINS at the painting's spot and size.
 * Run: node --test tests/stoot-shrine-frame.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECO_TWINS } from '../public/js/street-render.js?v=16933720';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const HELD = 'rook_hall_placeholder_painting';
const FRAME = 'rook_hall_placeholder_painting_frame';
const SHRINE = 'GIFPV9EMLT72DP4';
/** A URL or label that names the held painting itself (not the frame cut). */
const namesHeld = (s) => new RegExp(`${HELD}(?!_frame)`).test(String(s || ''));

/** The Pixi pieces buildStreetView touches; images load on the next tick. */
function fakePixi() {
  class Container {
    constructor() {
      Object.assign(this, { children: [], parent: null, destroyed: false, listeners: {}, x: 0, y: 0, visible: true, culled: false, zIndex: 0 });
      this.anchor = { x: 0, y: 0, set: (x, y = x) => Object.assign(this.anchor, { x, y }) };
      this.scale = { x: 1, y: 1, set: (x, y = x) => Object.assign(this.scale, { x, y }) };
    }
    addChild(...kids) {
      for (const kid of kids) {
        kid.parent = this;
        this.children.push(kid);
      }
      return kids[0];
    }
    once(name, fn) { (this.listeners[name] ||= []).push(fn); }
    destroy() {
      this.destroyed = true;
      for (const fn of this.listeners.destroyed || []) fn();
    }
  }
  class Graphics extends Container {}
  for (const verb of ['rect', 'fill', 'ellipse', 'roundRect', 'moveTo', 'lineTo', 'stroke', 'circle']) Graphics.prototype[verb] = function chain() { return this; };
  class Sprite extends Container {
    constructor(texture) {
      super();
      this.texture = texture;
    }
    set width(v) { this.scale.x = v / (this.texture?.orig?.width || 1); }
    get width() { return Math.abs(this.scale.x) * (this.texture?.orig?.width || 1); }
    set height(v) { this.scale.y = v / (this.texture?.orig?.height || 1); }
    get height() { return Math.abs(this.scale.y) * (this.texture?.orig?.height || 1); }
  }
  let uid = 0;
  class ImageSource {
    constructor(o) { Object.assign(this, o, { width: 1, height: 1, handlers: {}, uid: ++uid }); }
    on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
    once(name, fn) { return this.on(name, fn); }
    off() { return this; }
    emit(name, ...args) { for (const fn of this.handlers[name] || []) fn(...args); }
    resize(w, h) { Object.assign(this, { width: w, height: h }); return true; }
    update() {}
  }
  class Texture {
    constructor(o) {
      Object.assign(this, o);
      if (!this.orig) this.orig = { get width() { return o.source?.width || 1; }, get height() { return o.source?.height || 1; } };
    }
  }
  class Rectangle { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } }
  return { Container, Graphics, Sprite, ImageSource, Texture, ColorMatrixFilter: class {}, Rectangle };
}

describe('the Stoot shrine: the demon holds an empty frame, never the held photo', () => {
  it('ships the frame cut, keeps the photo out of the deco library', () => {
    const manifest = new Set(JSON.parse(read('public/assets/decos/manifest.json')));
    assert.ok(!manifest.has(HELD), 'the photo is not shipped');
    assert.ok(!existsSync(join(root, `public/assets/decos/groddle/${HELD}.webp`)));
    assert.ok(manifest.has(FRAME), 'the frame is shipped');
    assert.ok(existsSync(join(root, `public/assets/decos/groddle/${FRAME}.webp`)));
    assert.equal(DECO_TWINS[HELD], FRAME);
    const recover = read('tools/deco-pipeline/recover.py');
    assert.match(recover, new RegExp(`'${FRAME}': \\{\\s*'from': '${HELD}'`), 'a CUTS entry made from the painting');
    const rows = JSON.parse(read('tools/deco-pipeline/recovered.json')).decos;
    assert.match(rows[FRAME].cut, /photo of a real person/);
  });

  it(`${SHRINE} draws the frame at the painting's spot and size and loads nothing named for the photo`, async () => {
    const loaded = [];
    globalThis.PIXI = fakePixi();
    globalThis.Image = class {
      set src(v) {
        this._src = v;
        loaded.push(String(v));
        this.naturalWidth = 64;
        this.naturalHeight = 64;
        setTimeout(() => this.onload?.(), 0);
      }
      get src() { return this._src; }
    };
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) };
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      loaded.push(String(url));
      return { ok: false };
    };
    try {
      const { buildStreetView } = await import('../public/js/street-render.js?v=16933720');
      const manifest = new Set(JSON.parse(read('public/assets/decos/manifest.json')));
      const s = { ...JSON.parse(read(`public/assets/streets/${SHRINE}.json`)), gradient: null, signposts: [] };
      s.layers = s.layers.map((l) => ({ ...l, filters: null }));
      const placed = s.layers.find((l) => l.id === 'T_1311832165202').decos.find((d) => d.sprite === HELD);
      assert.deepEqual([placed.x, placed.y, placed.w, placed.h], [517, 426, 375, 284], 'the source placement is kept');
      const renderer = { resolution: 1, gl: { getParameter: () => 8192 }, generateTexture: () => null, on() {}, off() {} };
      const view = buildStreetView(s, globalThis.PIXI, { available: manifest, renderer });
      const all = [];
      const walk = (n) => { for (const c of n.children || []) { all.push(c); walk(c); } };
      walk(view);
      walk(view.frontView);
      const label = (spr) => `${spr.texture?.label || ''} ${spr.texture?.source?.label || ''} ${spr.texture?.source?.url || ''}`;
      const frames = all.filter((c) => c.texture && label(c).includes(FRAME));
      assert.equal(frames.length, 1, 'one frame drawn');
      const [frame] = frames;
      assert.equal(frame.parent.label, 'T_1311832165202', 'on the painting\'s layer');
      assert.deepEqual([frame.x, frame.y], [517, 426]);
      // Wait for the fake images, then the frame is sized as the placement.
      await new Promise((r) => setTimeout(r, 20));
      assert.ok(Math.abs(frame.width - 375) < 1 && Math.abs(frame.height - 284) < 1, `${frame.width} x ${frame.height}`);
      for (const c of all) if (c.texture && namesHeld(label(c))) assert.fail(`a sprite names the photo: ${label(c)}`);
      assert.deepEqual(loaded.filter(namesHeld), [], 'nothing named for the photo is requested');
      assert.ok(loaded.some((u) => u.includes(FRAME)), 'the frame art is requested');
      view.destroy();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
