// The game's engine object (public/game.js) has no `app`: features that read
// engine.app.renderer.resolution fell back to 1 or devicePixelRatio, so home-street sharp copies,
// the house interior's 3x pieces, the meditation orb's dense render and the quest rooms' scene
// animations never saw the real render density (js/render-density.js). They read
// engine.resolution (and engine.renderer / engine.canvas) instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'vendor' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('the engine exposes the render density, renderer and canvas, and has no app', () => {
  const game = readFileSync(join(pub, 'game.js'), 'utf8');
  const start = game.indexOf('\nconst engine = {');
  assert.ok(start > 0);
  const body = game.slice(start, start + 40000);
  assert.match(body, /get resolution\(\) \{\n {4}return app\?\.renderer\?\.resolution \|\| 1;/);
  assert.match(body, /get renderer\(\) \{\n {4}return app\?\.renderer \|\| null;/);
  assert.match(body, /get canvas\(\) \{\n {4}return app\?\.canvas \|\| null;/);
  assert.doesNotMatch(body.slice(0, body.indexOf('\n};')), /\n {2}(get )?app\b/);
});

test('no feature or quest room reads engine.app (it is undefined)', () => {
  const bad = [];
  for (const file of jsFiles(join(pub, 'js'))) {
    const src = readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (/\bengine\??\.app\b|ctx\.engine\??\.app\b/.test(line)) bad.push(`${file.slice(pub.length + 1)}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('a large Retina stage gets more than 2 backing px per world px, a phone gets 1', async () => {
  const { renderResolution, resolutionCap } = await import('../public/js/render-density.js?v=74c6f5f9');
  const desktop = renderResolution(1920, 960, 2, resolutionCap({ device: 'computer' }));
  const phone = renderResolution(1920, 960, 2, resolutionCap({ device: 'phone' }));
  assert.ok(desktop > 2, `desktop ${desktop}`);
  assert.equal(phone, 1);

  const { landscapeArt, wantsHiresPieces } = await import('../public/js/features/homes-feature.js?v=349dd21e');
  // House interiors: 3x pieces past 2.25, read from engine.resolution.
  assert.equal(wantsHiresPieces({ resolution: desktop }), true);
  assert.equal(wantsHiresPieces({ resolution: phone }), false);
  // Home street landscape: a sharp copy at the desktop density, the plain file on a phone.
  const tree = { s: 'tree_15', w: 188, h: 228, scale: 0.6 };
  assert.match(landscapeArt(tree, desktop).url, /tree_15@[\d.]+x\.webp$/);
  assert.equal(landscapeArt(tree, phone).url, 'assets/decos/groddle/tree_15.png');
});

test('each density reader takes engine.resolution', () => {
  const read = (p) => readFileSync(join(pub, p), 'utf8');
  assert.match(read('js/features/homes-feature.js'), /function wantsHiresPieces\(engine\) \{\n {2}const scale = engine\?\.resolution \|\| 1;/);
  assert.match(read('js/features/homes-feature.js'), /function landscapeArtist\(engine, root\) \{\n {2}const renderer = engine\?\.renderer;/);
  const tower = read('js/features/home-tower-feature.js');
  assert.match(tower, /wantsHiresDecos\(engine\?\.resolution \|\| 1\)/);
  assert.match(tower, /denseSprite\(BENCH_ART, BENCH_SCALE \* \(engine\?\.resolution \|\| 1\)\)/);
  assert.match(read('js/features/meditation-feature.js'), /ORB_TOOL_SHEET\.frameW\) \* \(engine\.resolution \|\| 1\)/);
  assert.match(read('js/features/shrine-hint-feature.js'), /engine\.canvas\?\.getBoundingClientRect/);
  assert.equal((read('js/quest-rooms/an-autumn-day.js').match(/ctx\.engine\?\.resolution/g) || []).length, 2);
  assert.match(read('js/quest-rooms/being-watched.js'), /resolution: ctx\.engine\?\.resolution \}/);
});
