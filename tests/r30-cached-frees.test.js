/**
 * R30 (#577, #578; register G1090): a picture from js/textures.js's per-URL cache is shared by every
 * module that asked for its URL. js/item-overlay.js once destroyed the Pick's sheet, which game.js
 * playPickAnimation had cut its frames from too; the next swing drew a destroyed source and Pixi
 * threw every frame. Now a cached picture is freed only through textures.js releaseTexture
 * (holdSource / holdTexture / loadHeldTexture count holds; a plain sourceFromUrl / textureFromUrl /
 * loadTexture caller keeps it for good), and the cache treats a destroyed picture as missing.
 *
 * - The source scan: no file frees a TextureSource directly (`source.destroy(`, `destroy(true)`,
 *   `textureSource: true`) beyond the counts on the allow-list below, each a texture its module made
 *   itself (a canvas, a render texture), never one from the cache. A new direct free fails here:
 *   use releaseTexture, or add the file with the reason the texture is its own.
 * - releaseTexture and the destroyed-is-missing rule, on the vendored Pixi in a vm.
 * Run: node --test tests/r30-cached-frees.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import vm from 'node:vm';

const ROOT = join(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');

function jsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'vendor' || name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) jsFiles(p, out);
    else if (/\.m?js$/.test(name)) out.push(p);
  }
  return out;
}

/** A direct free of a TextureSource: its destroy, or a texture or sprite destroyed with its source. */
const SOURCE_FREE = /[sS]ource\??\.destroy\(|\.destroy\(\s*true\s*\)|textureSource\s*:\s*true/;

/**
 * The files allowed to free a source directly, how many lines do, and why none of those sources
 * came out of the per-URL cache (the R30 audit read each).
 */
const ALLOW = {
  'js/textures.js': [1, 'releaseTexture itself: the one place a cached source is destroyed'],
  'js/overlay-art.js': [1, 'a CanvasSource the overlay painted itself'],
  'js/render-probe.js': [2, 'RenderTextures made for one readback'],
  'js/features/interrogation-room-feature.js': [1, 'only views marked _ownTexture (painted for the room)'],
  'js/features/neighbours-mp-feature.js': [1, "a box drawn on a canvas of the feature's own"],
  'js/features/spirit-loneliness-feature.js': [1, 'a canvas texture the feature painted'],
  'js/street-render.js': [12, 'tiles, recolour copies, edge fades and bakes: canvases and render textures it made'],
};

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

describe('R30: no module frees a cached picture directly', () => {
  const found = new Map();
  for (const file of jsFiles(PUBLIC)) {
    const rel = relative(PUBLIC, file).split('\\').join('/');
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
    const hits = [];
    lines.forEach((line, i) => {
      if (SOURCE_FREE.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
    if (hits.length) found.set(rel, hits);
  }

  it('every direct source free is on the allow-list, at its count', () => {
    const extra = [];
    for (const [rel, hits] of found) {
      const allowed = ALLOW[rel]?.[0] ?? 0;
      if (hits.length > allowed) extra.push(...hits, `  (${rel}: ${hits.length} found, ${allowed} allowed)`);
    }
    assert.deepEqual(extra, [], 'free a cached picture with textures.js releaseTexture; a texture the module made itself goes on ALLOW with why');
  });

  it('the allow-list has no stale entries (a count that fell is lowered here)', () => {
    const stale = Object.entries(ALLOW).filter(([rel, [n]]) => (found.get(rel)?.length || 0) !== n)
      .map(([rel, [n]]) => `${rel}: ${found.get(rel)?.length || 0} found, ${n} listed`);
    assert.deepEqual(stale, []);
  });

  it('a module that holds a cached picture gives it back with releaseTexture', () => {
    const missing = [];
    for (const file of jsFiles(PUBLIC)) {
      const rel = relative(PUBLIC, file).split('\\').join('/');
      if (rel === 'js/textures.js') continue;
      const src = stripComments(readFileSync(file, 'utf8'));
      if (/\b(holdSource|holdTexture|loadHeldTexture)\(/.test(src) && !/\breleaseTexture\(/.test(src)) missing.push(rel);
    }
    assert.deepEqual(missing, []);
  });

  it('the three sheets the audit found destroyed after a forget now go through releaseTexture', () => {
    const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
    assert.match(game, /const sheet = textureUrls\.holdTexture\(def\.url\);/, 'game.js idle sheets are held');
    assert.match(game, /textureUrls\.releaseTexture\(tex\);/, 'and given back');
    const npc = readFileSync(join(PUBLIC, 'js/npc-glitch.js'), 'utf8');
    assert.match(npc, /const source = holdSource\(url, \{ raw: true, scaleMode: 'linear' \}\);/);
    assert.match(npc, /releaseTexture\(sheet\.source\);/);
    const purple = readFileSync(join(PUBLIC, 'js/features/purple-journey-feature.js'), 'utf8');
    assert.match(purple, /const base = holdSource\(art\.url\);/);
    assert.match(purple, /if \(source\) releaseTexture\(source\);/);
    const overlay = readFileSync(join(PUBLIC, 'js/item-overlay.js'), 'utf8');
    assert.match(overlay, /releaseTexture\(source\) === 'destroyed'/, 'the item overlay frees its own copy the same way');
    for (const [name, src] of [['npc-glitch', npc], ['purple-journey', purple]]) {
      assert.doesNotMatch(src, /forgetTexture\(/, `${name}: releaseTexture forgets the URL itself`);
    }
  });

  it('the scan sees the freeing shapes it is meant to', () => {
    for (const line of ['tex.source.destroy();', 'sheet.source?.destroy()', 'texture.destroy(true);', 'b.destroy({ children: true, textureSource: true })']) {
      assert.ok(SOURCE_FREE.test(line), line);
    }
    for (const line of ['sprite.destroy();', 't.destroy(false);', 'view.destroy({ children: true })', 'if (source.destroyed) return;']) {
      assert.ok(!SOURCE_FREE.test(line), line);
    }
  });
});

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
let T;
before(async () => {
  PIXI = loadPixi();
  globalThis.PIXI = PIXI;
  globalThis.Image = class {
    set src(url) {
      this._src = url;
      this.naturalWidth = 64;
      this.naturalHeight = 32;
      setTimeout(() => this.onload?.(), 0);
    }
    get src() { return this._src; }
  };
  T = await import('../public/js/textures.js?v=29f80b6a');
});

const url = (name) => `assets/test/r30-${name}.webp`;

describe('R30: releaseTexture', () => {
  it('frees a held sheet once every hold is given back, and forgets it', async () => {
    const a = T.holdSource(url('held'));
    const b = T.holdSource(url('held'));
    assert.equal(a, b, 'two holders share one source');
    await T.whenLoaded(a);
    assert.equal(T.releaseTexture(a), 'held');
    assert.equal(a.destroyed, false, 'the other holder still draws it');
    assert.equal(T.releaseTexture(b), 'destroyed');
    assert.equal(a.destroyed, true);
    const again = T.holdSource(url('held'));
    assert.notEqual(again, a, 'the next ask loads it afresh');
    assert.equal(again.destroyed, false);
    assert.equal(T.releaseTexture(again), 'destroyed');
  });

  it('#577 shape: a sheet a plain caller has (the pick you swing) is never freed by a release', async () => {
    const pick = await T.loadTexture(url('pick'));
    const swing = T.frameTexture(pick.source, new PIXI.Rectangle(0, 0, 32, 32));
    const bubble = T.holdSource(url('pick'));
    assert.equal(bubble, pick.source);
    assert.equal(T.releaseTexture(bubble), 'shared');
    assert.equal(swing.source.destroyed, false, 'your swing still draws a live source');
    assert.equal(T.textureFromUrl(url('pick')), pick, 'and the cache still hands out the same one');
  });

  it('a plain caller that comes after a hold also keeps the sheet', async () => {
    const held = await T.loadHeldTexture(url('late'));
    const later = T.sourceFromUrl(url('late'));
    assert.equal(later, held.source);
    assert.equal(T.releaseTexture(held), 'shared');
    assert.equal(later.destroyed, false);
  });

  it('holdTexture and loadHeldTexture hold the whole-image texture\'s source', async () => {
    const t = await T.loadHeldTexture(url('whole'));
    assert.equal(T.isLoaded(t), true);
    const t2 = T.holdTexture(url('whole'));
    assert.equal(t2, t, 'one cached texture per URL');
    assert.equal(T.releaseTexture(t2), 'held');
    assert.equal(T.releaseTexture(t), 'destroyed');
    assert.equal(T.cachedTexture(url('whole')), null, 'forgotten');
  });

  it('a private copy (loadOwnTexture) is freed and the shared one stays', async () => {
    const shared = T.textureFromUrl(url('own'));
    const own = await T.loadOwnTexture(url('own'));
    assert.notEqual(own.source, shared.source);
    assert.equal(T.releaseTexture(own), 'destroyed');
    assert.equal(own.source.destroyed, true);
    assert.equal(shared.source.destroyed, false);
    assert.equal(T.textureFromUrl(url('own')), shared);
  });

  it('leaves alone a source it did not load, and one already freed', async () => {
    const canvasSource = new PIXI.TextureSource({ width: 4, height: 4 });
    assert.equal(T.releaseTexture(canvasSource), 'unknown');
    assert.equal(canvasSource.destroyed, false);
    assert.equal(T.releaseTexture(null), 'unknown');
    const s = T.holdSource(url('twice'));
    assert.equal(T.releaseTexture(s), 'destroyed');
    assert.equal(T.releaseTexture(s), 'gone');
  });

  it('counts what it did for QA', () => {
    const r = T.releaseStats();
    for (const k of ['destroyed', 'held', 'shared', 'unknown']) assert.equal(typeof r[k], 'number', k);
    assert.ok(r.destroyed >= 4 && r.held >= 2 && r.shared >= 2);
  });
});

describe('R30: the cache treats a freed picture as missing', () => {
  it('a source destroyed behind the cache\'s back is loaded again, not handed out', async () => {
    const tex = await T.loadTexture(url('stray'));
    const old = tex.source;
    old.destroy(); // a stray free (what the scan above keeps out)
    assert.equal(T.cachedTexture(url('stray')), null, 'cachedTexture: missing');
    const fresh = T.textureFromUrl(url('stray'));
    assert.notEqual(fresh, tex, 'textureFromUrl makes a new texture');
    assert.notEqual(fresh.source, old);
    assert.equal(fresh.source.destroyed, false);
    assert.equal(T.sourceFromUrl(url('stray')), fresh.source, 'sourceFromUrl hands out the new one');
    await T.whenLoaded(fresh);
    assert.equal(T.isLoaded(fresh), true);
  });

  it('a destroyed whole-image texture is replaced too', async () => {
    const tex = T.textureFromUrl(url('tex-gone'));
    tex.destroy(false);
    const fresh = T.textureFromUrl(url('tex-gone'));
    assert.notEqual(fresh, tex);
    assert.equal(fresh.destroyed, false);
  });

  it('a held texture whose source was destroyed is replaced for the next holder', () => {
    const t = T.holdTexture(url('held-gone'));
    t.source.destroy();
    const next = T.holdTexture(url('held-gone'));
    assert.notEqual(next.source, t.source);
    assert.equal(next.source.destroyed, false);
    assert.equal(T.releaseTexture(next), 'destroyed');
  });
});
