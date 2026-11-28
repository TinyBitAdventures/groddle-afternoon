/**
 * #577, #578 (and #513; R30): players mining Sparkly rocks in a Double Rainbow Party Space froze: the
 * mining bar never filled, Cancel worked, then nothing moved until a reload. The report carried
 * "Cannot read properties of null (reading 'addressModeU')" from GlTextureSystem._initSource: a
 * destroyed TextureSource drawn.
 *
 * The destroy: js/item-overlay.js evict() destroyed the sheet it played, and it loaded that sheet
 * through js/textures.js, which shares one TextureSource per URL. Another player's mining bubble
 * (js/skill-bubbles.js) plays the Pick's sheet there, the same URL game.js playPickAnimation cuts
 * the pick you swing from and keeps for good (pickToolFrames). Once the bubble ended and two newer
 * sheets had played, the eviction destroyed the shared source, and your next swing drew it.
 * Now the overlay loads a source of its own (textures.js loadOwnTexture).
 * The vendored Pixi runs in a vm; images "decode" at once.
 * Run: node --test tests/item-overlay-own-sources.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(import.meta.dirname, '..');

function loadPixi() {
  const g = { console, setTimeout, clearTimeout, navigator: { userAgent: 'node' }, performance };
  g.window = g;
  g.self = g;
  g.globalThis = g;
  vm.createContext(g);
  vm.runInContext(readFileSync(join(ROOT, 'public/vendor/pixi/pixi-8.23.0.min.js'), 'utf8'), g);
  return g.PIXI;
}

let PIXI;
let textures;
let overlay;
let PICK;

before(async () => {
  PIXI = loadPixi();
  globalThis.PIXI = PIXI;
  // An image that "decodes" as soon as its src is set.
  globalThis.Image = class {
    set src(url) {
      this._src = url;
      this.naturalWidth = 1265;
      this.naturalHeight = 189;
      setTimeout(() => this.onload?.(), 0);
    }
    get src() { return this._src; }
  };
  globalThis.requestAnimationFrame ??= (fn) => setTimeout(() => fn(performance.now()), 4);
  textures = await import('../public/js/textures.js?v=b8e38103');
  overlay = await import('../public/js/item-overlay.js?v=c444e2cf');
  ({ PICK_SHEETS: { pick: PICK } } = await import('../public/js/node-tools.js?v=47a93d54'));
});

/** A short looping tool sheet row (js/skill-bubbles.js packedFromGrid shape). */
const row = (path) => Object.freeze({ path, fw: 50, fh: 50, cols: 2, frames: 4, plays: 4, cell: [50, 50], at: [0, 0], fps: 30, loop: true });

/** Play `def` as an item overlay for a moment and wait for it to end (a bubble over another player). */
async function playAndEnd(def) {
  const h = overlay.playItemOverlay(PIXI, def, { layer: new PIXI.Container(), at: () => ({ x: 0, y: 0 }), durationMs: 30, fade: { inMs: 0, outMs: 0 } });
  assert.equal(await h.done, true, `${def.path} played`);
}

describe('#577/#578: an item overlay never destroys a sheet another module draws from', () => {
  it('the pick you swing keeps a live source after other players\' bubbles played and were evicted', async () => {
    // game.js playPickAnimation: the pick's frames, cut from the shared source and kept for good.
    const tex = await textures.loadTexture(PICK.path);
    const swing = Array.from({ length: PICK.frames }, (_, i) => textures.frameTexture(tex.source,
      new PIXI.Rectangle((i % PICK.cols) * PICK.fw, Math.floor(i / PICK.cols) * PICK.fh, PICK.fw, PICK.fh)));

    // Another player mines (their bubble plays the Pick's sheet), then two other tools' bubbles play:
    // more than KEEP_SHEETS held, the oldest idle one (the pick) is evicted.
    await playAndEnd(PICK);
    await playAndEnd(row('assets/test/own-sources-a.webp'));
    await playAndEnd(row('assets/test/own-sources-b.webp'));
    const held = overlay.itemOverlayStats().map((s) => s.path);
    assert.ok(!held.includes(PICK.path), `the pick sheet was evicted (held: ${held.join(', ')})`);

    for (const t of swing) {
      assert.equal(t.source.destroyed, false, 'your pick\'s frames still draw a live source');
      assert.ok(t.source.style, 'with a style (a destroyed one has none: the addressModeU throw)');
    }
    // And the shared texture for the URL is still the one your frames came from.
    assert.equal(textures.textureFromUrl(PICK.path).source, tex.source);
  });

  it('what the overlay evicts it did destroy (its own copy), so its memory is still freed', async () => {
    const def = row('assets/test/own-sources-c.webp');
    const h = overlay.playItemOverlay(PIXI, def, { layer: new PIXI.Container(), at: () => ({ x: 0, y: 0 }), durationMs: 30, fade: { inMs: 0, outMs: 0 } });
    // Its frames, while it plays.
    await new Promise((r) => setTimeout(r, 12));
    const own = h.sprite?.texture?.source;
    assert.ok(own && own !== textures.textureFromUrl(def.path).source, 'a source of its own, not the shared one');
    await h.done;
    await playAndEnd(row('assets/test/own-sources-d.webp'));
    await playAndEnd(row('assets/test/own-sources-e.webp'));
    assert.equal(own.destroyed, true, 'evicted and destroyed');
  });

  it('a `keep` sheet still shares the per-URL source (the Shovel the Patches cut too) and is never evicted', () => {
    const src = readFileSync(join(ROOT, 'public/js/item-overlay.js'), 'utf8');
    assert.match(src, /const load = e\.keep \? loadTexture : loadOwnTexture;/);
    assert.doesNotMatch(src, /forgetTexture\(entry\.path\)/, 'evicting our own copy leaves the shared URL alone');
  });
});
