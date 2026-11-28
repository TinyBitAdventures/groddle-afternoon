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
  unload() { this.unloads = (this.unloads || 0) + 1; }
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
      // A missing file is missing whatever a retry adds to its URL (#768 review: retry=N).
      if (failing.has(url) || failing.has(String(url).replace(/[?&]retry=\d+$/, ''))) return this.onerror?.();
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
  T = await import('../public/js/textures.js?v=71c5d2dc');
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

describe('#284: a street trip unloads the street left behind from the GPU at once (unloadGpuCopies)', () => {
  it('unloads the managed URL images the match passes, nothing else', async () => {
    const deco = await T.loadTexture('assets/decos/groddle/t284_tree_120x60.webp');
    const sheet = await T.loadTexture('assets/sprites/animals/t284_pig_64x64.png');
    const gone = await T.loadTexture('assets/decos/groddle/t284_gone_30x30.webp');
    gone.source.destroyed = true;
    const bake = new ImageSource({ resource: null, label: 'render texture' });
    const match = /(^|\/)assets\/decos\//;
    const managed = [deco.source, sheet.source, gone.source, bake, null];
    assert.equal(T.unloadGpuCopies({ match, managed }), 1);
    assert.equal(deco.source.unloads, 1, 'the deco left behind is unloaded');
    assert.equal(sheet.source.unloads, undefined, 'an image outside the match stays');
    assert.equal(gone.source.unloads, undefined, 'a destroyed source is left alone');
    assert.equal(bake.unloads, undefined, 'a source not loaded from a URL (a bake) is left alone');
    // The image stays cached: whatever draws it again uploads it from there.
    assert.equal(T.cachedTexture('assets/decos/groddle/t284_tree_120x60.webp'), deco);
    assert.equal(T.isLoaded(deco), true);
    assert.equal(T.unloadGpuCopies({ match: null, managed }), 0, 'no match: nothing');
    assert.equal(T.unloadGpuCopies({ match }), 0, 'no managed list: nothing');
  });
});

describe('#312 (G708): a failed image upload is sent again (guardImageUploads)', () => {
  const fakeRenderer = () => {
    const gl = { NO_ERROR: 0, OUT_OF_MEMORY: 0x505, errors: [], getError() { return this.errors.shift() ?? 0; }, isContextLost: () => false };
    const sys = { uploads: 0, onSourceUpdate(source) { this.uploads += 1; this.last = source; } };
    return { gl, texture: sys, gcRuns: 0, textureGC: { run() { this.owner.gcRuns += 1; } } };
  };

  it('on OUT_OF_MEMORY frees what the GC can and unloads the source so its next draw uploads it again', async () => {
    const r = fakeRenderer();
    r.textureGC.owner = r;
    const later = [];
    const stats = T.guardImageUploads(r, { later: (fn) => later.push(fn) });
    assert.equal(T.guardImageUploads(r), stats, 'installed once');
    const tex = await T.loadTexture('assets/sprites/mining/rock_sparkly_2_755x150.webp');
    r.gl.errors.push(r.gl.OUT_OF_MEMORY);
    r.texture.onSourceUpdate(tex.source);
    assert.equal(r.texture.uploads, 1, 'the upload itself still runs');
    assert.deepEqual([stats.checked, stats.failed, stats.retried], [1, 1, 0]);
    assert.match(stats.last, /rock_sparkly_2.*0x505$/);
    later.shift()();
    assert.equal(r.gcRuns, 1);
    assert.equal(tex.source.unloads, 1);
    assert.equal(stats.retried, 1);
    // A clean upload is only counted.
    r.texture.onSourceUpdate(tex.source);
    assert.deepEqual([stats.checked, stats.failed], [2, 1]);
  });

  it('gives up after UPLOAD_RETRIES, and skips sources it did not load (placeholders, render textures)', async () => {
    const r = fakeRenderer();
    r.textureGC.owner = r;
    const later = [];
    const stats = T.guardImageUploads(r, { later: (fn) => later.push(fn) });
    const tex = await T.loadTexture('assets/sprites/mining/rock_metal_2_780x137.webp');
    for (let i = 0; i <= T.UPLOAD_RETRIES; i += 1) {
      r.gl.errors.push(r.gl.OUT_OF_MEMORY);
      r.texture.onSourceUpdate(tex.source);
    }
    assert.equal(later.length, T.UPLOAD_RETRIES);
    assert.equal(stats.gaveUp, 1);
    const bake = new ImageSource({ resource: null, label: 'render texture' });
    r.gl.errors.push(r.gl.OUT_OF_MEMORY);
    r.texture.onSourceUpdate(bake);
    assert.equal(stats.checked, T.UPLOAD_RETRIES + 1, 'a render texture is not checked');
    assert.equal(T.guardImageUploads({}), null, 'no WebGL renderer, no guard');
  });

  it('is on for phones in game.js, and G714 drops the street bakes after a restored context', async () => {
    const { readFileSync } = await import('node:fs');
    const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
    const render = readFileSync(new URL('../public/js/street-render.js', import.meta.url), 'utf8');
    assert.match(game, /uploadGuard = uploadGuardParam === '1' \|\| \(TOUCH_PHONE && uploadGuardParam !== '0'\) \? textureUrls\.guardImageUploads\(app\.renderer\) : null;/);
    assert.match(game, /app\.canvas\.addEventListener\('webglcontextrestored', \(\) => \{[\s\S]{0,400}bgLayer\?\.dropBakes\?\.\(\)/);
    // Every colour bake and blur tile is forgotten, the next cull bakes what is near again.
    assert.match(render, /root\.dropBakes = \(\) => \{[\s\S]{0,900}entry\.texture = null;[\s\S]{0,400}freeBlurTile\(tile, blurState\);[\s\S]{0,200}root\.edgeMirrorRebuild\?\.\(\);[\s\S]{0,200}root\.groundSkirtRebuild\?\.\(\);\s*cullAgain = true;/);
    // G1166 (#621): the ground skirt and the front layers' fades are render textures too: torn
    // down and built again from the art, the colour copies the band crosses baked first.
    const skirt = render.slice(render.indexOf('function buildGroundSkirt('), render.indexOf('function addLadderTiles('));
    assert.match(skirt, /made = \{ strip, covers, views, textures \};/);
    assert.match(skirt, /root\.once\('destroyed', \(\) => freeMade\(\)\);/);
    assert.match(skirt, /root\.groundSkirtRebuild = \(\) => \{\s*if \(!made \|\| root\.destroyed\) return false;\s*freeMade\(\{ detach: true \}\);[\s\S]{0,600}ensureRecoloured\(PIXI, renderer, root\.recolourCache, b\.child\)[\s\S]{0,120}build\(\);\s*return true;/);
    // Detaching frees the strip and every fade cover, and unhooks the covers from their layers.
    assert.match(skirt, /if \(lc\.edgeFade === cover\) lc\.edgeFade = null;[\s\S]{0,120}cover\.destroy\(\{ children: true \}\);[\s\S]{0,120}strip\.destroy\(\{ children: true \}\);/);
    assert.match(render, /if \(cullAgain\) \{\s*cullAgain = false;\s*force = true;\s*\}/);
    // cullLayer bakes again a near deco with no bake, and a near blur tile with no texture.
    assert.match(render, /if \(!out && child\.recolour && !child\.recolour\.entry\.texture\) rebake\(child\);/);
    assert.match(render, /if \(!tile\.texture\) rebake\(child\);/);
  });
});


// #662 (Oktyabrya, Safari on an Apple GPU): one street deco blank all session. One dropped request or
// failed decode left its source on the 1x1 placeholder for good; the cache only remade destroyed ones.
describe('#662: a street deco whose image failed once comes back on the next ask', () => {
  const realNow = Date.now;
  let clock = 0;
  before(() => { clock = realNow.call(Date); Date.now = () => clock; });
  after(() => { Date.now = realNow; });

  it('a failed deco load is tried again in place, and every sprite on it gets the picture', async () => {
    T.resetImageFailures();
    const url = 'assets/decos/groddle/flying_platform_6_300x120.png';
    const routed = T.routeUrl(url);
    failing.add(routed);
    const first = T.textureFromUrl(url);
    let resized = 0;
    first.source.on('resize', () => (resized += 1));
    await T.whenLoaded(first).catch(() => {});
    assert.equal(T.isFailed(first), true, 'harness: the first load fails (a dropped request or decode on Safari)');
    assert.equal(first.source.pixelWidth, 1, 'blank: the placeholder');
    failing.delete(routed); // the file is there again (it always was on disk and live)
    clock += T.RETRY_WAIT_MS[0];
    const again = T.textureFromUrl(url); // the next street, or the same street re-entered
    assert.equal(again, first, 'the same texture: sprites already drawn with it are the ones that fill in');
    await T.whenLoaded(again);
    assert.equal(T.isLoaded(again), true, 'loaded on the second try (v0.64.0 kept the failed source)');
    assert.equal(T.isFailed(again), false);
    assert.equal(first.source.width, 300);
    assert.equal(resized, 1, 'the source resized, which re-reads every sprite and frame cut from it');
    assert.deepEqual(T.imageFailureStats(), [{ path: url, count: 1, loaded: true }]);
    assert.equal(T.imageFailureLine(), `images failed: ${url} x1 (loaded later)`);
  });

  it('waits a little between tries and stops after LOAD_ATTEMPTS, so a missing file is not asked for forever', async () => {
    T.resetImageFailures();
    const url = 'assets/decos/really_missing.png';
    failing.add(T.routeUrl(url));
    const t = T.textureFromUrl(url);
    await T.whenLoaded(t).catch(() => {});
    let tries = 1;
    for (let round = 0; round < 20; round += 1) {
      const before = t.source;
      const p = T.whenLoaded(T.textureFromUrl(url)); // asked again at once: not yet
      if (p !== T.whenLoaded(before)) assert.fail('retried without waiting');
      clock += 20_000;
      const asked = T.textureFromUrl(url);
      if (T.isFailed(asked)) continue; // out of attempts: stays failed, no new load
      tries += 1;
      await T.whenLoaded(asked).catch(() => {});
    }
    assert.equal(tries, T.LOAD_ATTEMPTS);
    assert.deepEqual(T.imageFailureStats(), [{ path: url, count: T.LOAD_ATTEMPTS, loaded: false }]);
  });

  it('the report path is a bare path: no query, no data URL contents', async () => {
    T.resetImageFailures();
    const url = 'data:image/svg+xml;utf8,<svg>secret</svg>';
    failing.add(url);
    await T.whenLoaded(T.textureFromUrl(url)).catch(() => {});
    assert.equal(T.imageFailureLine(), 'images failed: data:image/svg+xml x1');
    T.resetImageFailures();
    assert.equal(T.imageFailureLine(), '');
  });
});

// #662 follow-up: the scene tests' fake Pixi (tests/fake-scene.js) hands back one proxy for every
// `new ImageSource()` and answers every symbol key with itself. startLoad read the load state back off
// the source, got the proxy, and the load's promise went without its catch: an unhandled rejection
// whenever an image failed (Node's Image is missing there). The state is now passed in.
describe('#662: a failed load leaves no unhandled rejection, whatever the source object is', () => {
  it('a source that answers every symbol with itself still gets its load promise caught', async () => {
    const chain = new Proxy(function chainFn() {}, {
      get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : chain),
      apply: () => chain,
      construct: () => chain,
    });
    const keepPixi = globalThis.PIXI;
    const keepImage = globalThis.Image;
    const seen = [];
    const onUnhandled = (reason) => seen.push(String(reason));
    process.on('unhandledRejection', onUnhandled);
    try {
      globalThis.PIXI = new Proxy({}, { get: () => chain });
      globalThis.Image = undefined; // as in those tests: every load fails
      const url = 'assets/decos/stand-in-source-missing.png';
      T.textureFromUrl(url);
      T.textureFromUrl(url); // asked again: no retry on a state this module did not make
      await new Promise((r) => setTimeout(r, 20));
      await new Promise((r) => setImmediate(r));
    } finally {
      globalThis.PIXI = keepPixi;
      globalThis.Image = keepImage;
      process.off('unhandledRejection', onUnhandled);
    }
    assert.deepEqual(seen, []);
  });
});
