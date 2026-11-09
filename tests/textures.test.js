/**
 * js/textures.js: URL textures for Pixi 8 (lazy source filled in on load,
 * routes, @3x resolution, loaded callbacks), against a small Pixi stand-in.
 * Run: node --test tests/textures.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

class Emitter {
  constructor() { this.handlers = new Map(); }
  on(ev, fn, ctx) { (this.handlers.get(ev) || this.handlers.set(ev, []).get(ev)).push([fn, ctx]); return this; }
  emit(ev, ...a) { for (const [fn, ctx] of this.handlers.get(ev) || []) fn.apply(ctx, a); return this; }
}
class ImageSource extends Emitter {
  constructor({ resource, label, resolution = 1 }) {
    super();
    Object.assign(this, { resource, label, resolution, width: 1 / resolution, height: 1 / resolution, pixelWidth: 1, pixelHeight: 1, updates: 0 });
  }
  resize(w, h, res) {
    const pw = Math.round(w * res);
    const ph = Math.round(h * res);
    const changed = pw !== this.pixelWidth || ph !== this.pixelHeight;
    Object.assign(this, { width: w, height: h, resolution: res, pixelWidth: pw, pixelHeight: ph });
    if (changed) this.emit('resize', this);
    return changed;
  }
  update() { this.updates += 1; }
}
class Texture {
  constructor({ source, frame, label, dynamic }) { Object.assign(this, { source, frame, label, dynamic: Boolean(dynamic) }); }
}
const failing = new Set();
class FakeImage {
  constructor() { this.naturalWidth = 0; this.naturalHeight = 0; }
  set src(url) {
    this._src = url;
    setTimeout(() => {
      if (failing.has(url)) return this.onerror?.();
      const m = /(\d+)x(\d+)/.exec(url);
      this.naturalWidth = m ? Number(m[1]) : 64;
      this.naturalHeight = m ? Number(m[2]) : 32;
      this.onload?.();
    }, 1);
  }
  get src() { return this._src; }
  decode() { return Promise.resolve(); }
}

let T;
const saved = {};
before(async () => {
  for (const k of ['PIXI', 'Image', 'document']) saved[k] = globalThis[k];
  globalThis.PIXI = { ImageSource, Texture };
  globalThis.Image = FakeImage;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) };
  T = await import('../public/js/textures.js?v=f024bd6a');
});
after(() => {
  for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
});

describe('js/textures.js', () => {
  it('hands out one dynamic texture per URL and fills it in when the image loads', async () => {
    const a = T.textureFromUrl('assets/a_200x100.png');
    assert.equal(T.textureFromUrl('assets/a_200x100.png'), a);
    assert.equal(a.dynamic, true);
    assert.equal(T.isLoaded(a), false);
    let called = 0;
    T.onLoaded(a, () => (called += 1));
    await T.whenLoaded(a);
    assert.equal(T.isLoaded(a), true);
    assert.equal(called, 1);
    assert.deepEqual([a.source.width, a.source.height, a.source.resolution], [200, 100, 1]);
    T.onLoaded(a, () => (called += 1));
    assert.equal(called, 2, 'runs at once when already loaded');
    assert.equal(T.sourceUrl(a), 'assets/a_200x100.png');
  });

  it('reads the resolution from an @3x file name, keeping the logical size', async () => {
    const t = await T.loadTexture('assets/b_300x150@3x.png');
    assert.deepEqual([t.source.width, t.source.height, t.source.resolution], [100, 50, 3]);
    assert.equal(T.resolutionOfUrl('x/y@2x.webp?v=1'), 2);
    assert.equal(T.resolutionOfUrl('x/y.png'), 1);
  });

  it('applies URL routes (3x icons and sheets) unless raw', async () => {
    T.addUrlRoute('test', (url) => (url === 'assets/icon.png' ? 'assets/icon_90x90@3x.png' : null));
    const routed = T.textureFromUrl('assets/icon.png');
    assert.equal(routed.label, 'assets/icon_90x90@3x.png');
    const raw = T.textureFromUrl('assets/icon.png', { raw: true });
    assert.notEqual(raw, routed);
    assert.equal(raw.label, 'assets/icon.png');
    assert.equal(T.cachedTexture('assets/icon.png'), routed);
  });

  it('frames of URL sources are dynamic; canvas sources count as loaded', () => {
    const src = T.sourceFromUrl('assets/sheet_64x64.png');
    assert.equal(T.frameTexture(src, { x: 0, y: 0, width: 8, height: 8 }).dynamic, true);
    const canvasSource = new ImageSource({ resource: {}, label: 'canvas' });
    assert.equal(T.frameTexture(canvasSource).dynamic, false);
    assert.equal(T.isLoaded(canvasSource), true);
    assert.equal(T.isLoaded(null), false);
  });

  it('reports failures without running onLoaded', async () => {
    failing.add('assets/missing.png');
    const t = T.textureFromUrl('assets/missing.png');
    let loaded = false;
    let failed = false;
    T.onLoaded(t, () => (loaded = true));
    T.onFailed(t, () => (failed = true));
    await assert.rejects(T.whenLoaded(t));
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(loaded, false);
    assert.equal(failed, true);
    assert.equal(T.isFailed(t), true);
  });
});

describe('ticket 21: street decos no street draws leave the image cache (releaseIdleImages)', () => {
  it('forgets a deco image only after it has been off the GPU for idleMs; others and GPU ones stay', async () => {
    const deco = 'assets/decos/groddle/t21_rock_100x50.webp';
    const icon = 'assets/sprites/icons/t21_icon_40x40.png';
    const onScreen = 'assets/decos/groddle/t21_drawn_80x80.webp';
    const decoTex = await T.loadTexture(deco);
    await T.loadTexture(icon);
    const drawn = await T.loadTexture(onScreen);
    const match = /(^|\/)assets\/decos\//;
    const onGpu = new Set([drawn.source]);
    assert.equal(T.releaseIdleImages({ match, onGpu, now: 1000, idleMs: 30000 }), 0, 'first seen off the GPU: noted only');
    assert.equal(T.releaseIdleImages({ match, onGpu, now: 20000, idleMs: 30000 }), 0, 'not yet idle long enough');
    assert.equal(T.cachedTexture(deco), decoTex);
    assert.equal(T.releaseIdleImages({ match, onGpu, now: 31001, idleMs: 30000 }), 1);
    assert.equal(T.cachedTexture(deco), null, 'the idle deco is forgotten');
    assert.equal(T.cachedTexture(onScreen), drawn, 'a deco on the GPU stays');
    assert.ok(T.cachedTexture(icon), 'an image outside the match stays');
    // Whoever still holds it keeps it; asking again loads a fresh copy.
    assert.equal(decoTex.source.destroyed, undefined);
    const again = T.textureFromUrl(deco);
    assert.notEqual(again, decoTex);
    await T.loadTexture(deco);
    assert.equal(T.isLoaded(again), true);
  });

  it('a deco back on the GPU starts its idle time again', async () => {
    const url = 'assets/decos/groddle/t21_back_60x60.webp';
    const tex = await T.loadTexture(url);
    const match = /assets\/decos\/groddle\/t21_back/;
    T.releaseIdleImages({ match, onGpu: new Set(), now: 0, idleMs: 30000 });
    T.releaseIdleImages({ match, onGpu: new Set([tex.source]), now: 20000, idleMs: 30000 });
    assert.equal(T.releaseIdleImages({ match, onGpu: new Set(), now: 40000, idleMs: 30000 }), 0, 'off again at 40 s: noted');
    assert.equal(T.releaseIdleImages({ match, onGpu: new Set(), now: 60000, idleMs: 30000 }), 0);
    assert.equal(T.releaseIdleImages({ match, onGpu: new Set(), now: 70001, idleMs: 30000 }), 1);
    assert.equal(T.releaseIdleImages({ match: null, onGpu: new Set() }), 0, 'no match: nothing');
  });
});
