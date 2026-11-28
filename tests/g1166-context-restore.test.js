/**
 * G1166 (#621, #622: an iPad-class Apple GPU whose report said "restores 2"): what a lost and
 * restored WebGL context must draw again, and what a report says about it. A restored context
 * gives every render texture back empty. Reproduced in Chrome with WEBGL_lose_context (two
 * restores): the edge mirrors and the ground skirt stayed empty (tests/edge-mirror.test.js,
 * tests/textures.test.js), and so did every cacheAsTexture picture: a signpost's number keys.
 * The skin and the rocks were not reproduced, so the report's device line now also counts the
 * bakes the last restore dropped and the destroyed-texture draws since it.
 * Run: node --test tests/g1166-context-restore.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { redrawCachedTextures } from '../public/js/pixi-fixes.js?v=0f42b75e';
import { renderProbeLine } from '../public/js/render-probe.js?v=519c86ef';
import { reportContext } from '../public/js/features/bug-report-feature.js?v=43f29691';

const PUBLIC = join(import.meta.dirname, '..', 'public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');

/** A container; `cached` gives it a render group drawn through cacheAsTexture (Pixi 8's shape). */
function node({ cached = false, children = [], destroyed = false } = {}) {
  const n = { children, destroyed, redrawn: 0 };
  if (cached) {
    n.renderGroup = { isCachedAsTexture: true, textureNeedsUpdate: false };
    n.updateCacheTexture = () => {
      n.redrawn += 1;
      n.renderGroup.textureNeedsUpdate = true;
    };
  }
  return n;
}

describe('G1166 cached pictures draw again after a restored context', () => {
  it('marks every cached container under the stage, nested ones too, and nothing else', () => {
    const key1 = node({ cached: true });
    const key2 = node({ cached: true });
    const inner = node({ cached: true });
    const outer = node({ cached: true, children: [inner] });
    const plain = node();
    const plainGroup = node();
    plainGroup.renderGroup = { isCachedAsTexture: false };
    plainGroup.updateCacheTexture = () => assert.fail('a render group not cached as a texture is left alone');
    const gone = node({ cached: true, destroyed: true });
    const stage = node({ children: [node({ children: [key1, key2, plain] }), outer, plainGroup, gone] });
    assert.equal(redrawCachedTextures(stage), 4);
    for (const n of [key1, key2, inner, outer]) {
      assert.equal(n.redrawn, 1);
      assert.equal(n.renderGroup.textureNeedsUpdate, true);
    }
    assert.equal(gone.redrawn, 0, 'a destroyed container is skipped');
    assert.equal(redrawCachedTextures(null), 0);
  });

  it('runs from the restore handler, after the street bakes are dropped', () => {
    const game = read('game.js');
    assert.match(game, /import \{[^}]*redrawCachedTextures[^}]*\} from '\.\/js\/pixi-fixes\.js\?v=[0-9a-f]{8}';/);
    assert.match(game, /app\.canvas\.addEventListener\('webglcontextrestored', \(\) => \{[\s\S]{0,700}bgLayer\?\.dropBakes\?\.\(\)[\s\S]{0,300}redrawCachedTextures\(app\.stage\)/);
  });
});

describe('G1166 a report says what the last restore dropped and what drew as nothing since', () => {
  const probe = { ok: true, plain: true, maxTexture: 16384, maxRenderbuffer: 16384, api: 'webgl2', gl: 'Apple GPU' };

  it('adds the dropped bakes and the dead draws once there was a restore', () => {
    assert.equal(
      renderProbeLine(probe, { resolution: 2.35, restores: 2, dropped: 25, dead: 3 }),
      'rt ok (plain ok) · res 2.35 · tex 16384 · rb 16384 · restores 2 · bakes dropped 25 · dead draws 3 · webgl2 · Apple GPU',
    );
    // No restore: the line as before, unless something destroyed was drawn (since boot).
    assert.equal(renderProbeLine(probe, { resolution: 2, restores: 0, dropped: 9 }), 'rt ok (plain ok) · res 2 · tex 16384 · rb 16384 · restores 0 · webgl2 · Apple GPU');
    assert.equal(renderProbeLine(probe, { resolution: 2, restores: 0, dead: 4 }), 'rt ok (plain ok) · res 2 · tex 16384 · rb 16384 · restores 0 · dead draws 4 · webgl2 · Apple GPU');
    assert.ok(renderProbeLine({ ...probe, gl: 'x'.repeat(400) }, { restores: 9, dropped: 99999, dead: 99999 }).length <= 200);
  });

  it('rides in the report context as the gpu line', () => {
    const line = renderProbeLine(probe, { resolution: 2.35, restores: 2, dropped: 25, dead: 0 });
    const ctx = reportContext({ renderProbeLine: () => line, renderProbe: probe }, [], {});
    assert.match(ctx.gpu, /restores 2 · bakes dropped 25 · dead draws 0/);
  });

  it('game.js counts the draws since the last restore and the drops of that restore', () => {
    const game = read('game.js');
    // The guard's count is the game's, not the boot block's own.
    assert.match(game, /\nlet destroyedDraws = 0;\nlet destroyedDrawsAtRestore = 0;\nlet contextBakesDropped = 0;/);
    assert.match(game, /return \{ restores: contextRestores, dropped: contextBakesDropped, dead: destroyedDraws - destroyedDrawsAtRestore \};/);
    assert.match(game, /onDestroyed: \(source\) => \{\s*destroyedDraws \+= 1;/);
    assert.match(game, /contextRestores \+= 1;[\s\S]{0,120}destroyedDrawsAtRestore = destroyedDraws;/);
    assert.match(game, /const dropped = bgLayer\?\.dropBakes\?\.\(\) \?\? 0;\s*contextBakesDropped = dropped;/);
    assert.equal((game.match(/renderProbeLine\(renderProbe, \{ resolution: app\??\.renderer\?\.resolution, \.\.\.contextLossCounts\(\), motion: motionPreference\(\) \}\)/g) || []).length, 2);
  });
});
