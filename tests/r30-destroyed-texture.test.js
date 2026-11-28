/**
 * #577, #578 (R30): a destroyed TextureSource still held by a sprite is never drawn. Pixi 8.23's
 * TextureSource.destroy sets `style` to null; the next bind of that source reached
 * GlTextureSystem._initSource, whose updateStyle read `style.addressModeU` and threw (the reports'
 * "Cannot read properties of null (reading 'addressModeU')"), inside Pixi's render. js/pixi-fixes.js
 * guardDestroyedSources draws it as Texture.EMPTY and tells the game once. The vendored Pixi's real
 * WebGL texture system runs in a vm on a stub WebGL context.
 * Run: node --test tests/r30-destroyed-texture.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { guardDestroyedSources } from '../public/js/pixi-fixes.js?v=0f42b75e';
import { installHiresFirstDraw } from '../public/js/sprite-hires.js?v=6a4569c4';

const ROOT = join(import.meta.dirname, '..');

function loadPixi() {
  const g = { console, setTimeout, clearTimeout, navigator: { userAgent: 'node' }, performance };
  g.window = g;
  g.self = g;
  g.globalThis = g;
  g.WebGLRenderingContext = function WebGLRenderingContext() {};
  g.WebGL2RenderingContext = function WebGL2RenderingContext() {};
  vm.createContext(g);
  vm.runInContext(readFileSync(join(ROOT, 'public/vendor/pixi/pixi-8.23.0.min.js'), 'utf8'), g);
  return g.PIXI;
}
const PIXI = loadPixi();

/** Pixi's real GlTextureSystem on a WebGL context that does nothing; `bound` logs bindTexture's textures. */
function textureSystem() {
  const bound = [];
  let made = 0;
  const gl = new Proxy({
    createTexture: () => ({ glTexture: (made += 1) }),
    bindTexture: (_target, texture) => bound.push(texture),
  }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'string' && /^[A-Z_0-9]+$/.test(k)) return 1;
      return () => ({});
    },
  });
  const renderer = {
    uid: 7,
    gc: { now: 1, addResourceHash() {}, addCollection() {} },
    context: { webGLVersion: 2, extensions: {}, supports: { nonPowOf2mipmaps: true, nonPowOf2wrapping: true } },
  };
  const system = new PIXI.GlTextureSystem(renderer);
  system.contextChange(gl);
  return { system, renderer: { texture: system }, bound, made: () => made };
}

const deadSource = (label = 'assets/sprites/tools/pick-tool@3x.webp') => {
  const s = new PIXI.TextureSource({ width: 4, height: 4, label });
  s.destroy();
  return s;
};

describe('#577/#578: a destroyed texture source is drawn as nothing, not thrown on', () => {
  it('the harness reproduces the reports: binding a destroyed source throws on its null style', () => {
    const { system } = textureSystem();
    system.bindSource(new PIXI.TextureSource({ width: 4, height: 4 }), 0);
    const dead = deadSource();
    assert.equal(dead.style, null, 'TextureSource.destroy leaves no style');
    assert.throws(() => system.bindSource(dead, 1), /Cannot read properties of null \(reading 'addressModeU'\)/);
  });

  it('guarded: no throw, Texture.EMPTY is bound in its place, told once per bind, nothing made on the GPU for it', () => {
    const { system, renderer, bound, made } = textureSystem();
    const told = [];
    assert.equal(guardDestroyedSources(PIXI, renderer, { onDestroyed: (s) => told.push(s.label) }), true);
    const live = new PIXI.TextureSource({ width: 4, height: 4 });
    system.bindSource(live, 0);
    const empty = system.getGlSource(PIXI.Texture.EMPTY.source).texture;
    const before = made();
    const dead = deadSource();
    for (let frame = 0; frame < 3; frame += 1) {
      system.bindSource(live, 1);
      assert.doesNotThrow(() => system.bindSource(dead, 1));
      assert.equal(bound.at(-1), empty, 'the empty texture is what draws');
    }
    assert.equal(made(), before, 'no GPU texture made for the destroyed source');
    assert.equal(dead._gpuData[7], undefined, 'and none kept on it');
    assert.deepEqual(told, Array(3).fill('assets/sprites/tools/pick-tool@3x.webp'), 'game.js reports it once (createErrorOnce)');
    // A live source still gets its own texture.
    const fresh = new PIXI.TextureSource({ width: 8, height: 8 });
    system.bindSource(fresh, 2);
    assert.notEqual(bound.at(-1), empty);
    assert.equal(guardDestroyedSources(PIXI, renderer), true, 'installing twice is a no-op');
  });

  it('with the hi-res first-draw wrapper on top (the Firefox stack in #578): no throw and no 3x swap', () => {
    const { system, renderer } = textureSystem();
    guardDestroyedSources(PIXI, renderer);
    installHiresFirstDraw(renderer, () => Promise.resolve());
    assert.equal(system.hiresFirstDraw, true);
    // A first-draw sheet (listed for a 3x swap).
    const dead = deadSource('assets/sprites/avatar/vector/base.webp');
    assert.doesNotThrow(() => system.bindSource(dead, 3));
    assert.equal(dead.hiresUpgrade, undefined, 'a destroyed sheet is never upgraded');
  });

  it('game.js installs it on the renderer before the hi-res wrapper and reports each texture once, named', () => {
    const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
    const guard = game.indexOf('guardDestroyedSources(PIXI, app.renderer, {');
    assert.ok(guard > 0 && guard < game.indexOf('installHiresFirstDraw(app.renderer, whenLoaded);'));
    assert.match(game, /destroyedDrawn\('draw destroyed texture', new Error\(`destroyed texture drawn: \$\{source\?\.label \|\| `source \$\{source\?\.uid\}`\}`\)\);/);
    assert.match(game, /const destroyedDrawn = createErrorOnce\(\);/);
  });
});
