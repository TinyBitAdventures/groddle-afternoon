/**
 * Sharp 3x signpost post, arm and shadow from hand-traced vectors (tools/signpost-art, G509).
 * Run: node --test tests/signpost-art.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_DRAW_SPRITES, HIRES_SPRITES } from '../public/js/sprite-hires.js?v=add7b764';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const art = join(root, 'tools/signpost-art');
const results = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/results.json'), 'utf8'));
const PARTS = {
  post: 'assets/ui/signpost/signpost_post.webp',
  arm: 'assets/ui/signpost/signpost_arm.webp',
  shadow: 'assets/ui/signpost/signpost_shadow.webp',
};

describe('3x signpost art', () => {
  it('every signpost draw uses the 1x URLs the 3x list routes (street, home way out, friends\' arms)', () => {
    const render = readFileSync(join(root, 'public/js/street-render.js'), 'utf8');
    const friends = readFileSync(join(root, 'public/js/features/home-street-mp-feature.js'), 'utf8');
    for (const path of Object.values(PARTS)) assert.ok(render.includes(`'${path}'`), path);
    assert.ok(friends.includes(`'${PARTS.arm}'`));
    // No module draws signpost art from any other file.
    const js = join(root, 'public/js');
    for (const name of readdirSync(js, { recursive: true })) {
      if (!String(name).endsWith('.js')) continue;
      for (const m of readFileSync(join(js, name), 'utf8').matchAll(/assets\/ui\/signpost\/[\w@.-]+/g)) {
        // The generated lists (sprite-hires.js, data-versions.js) also name the 3x copies.
        const known = Object.values(PARTS).flatMap((p) => [p, HIRES_SPRITES.get(p)]);
        assert.ok(known.includes(m[0]), `${name}: ${m[0]}`);
      }
    }
    for (const path of Object.values(PARTS)) {
      assert.ok(HIRES_SPRITES.has(path), path);
      // Eager: the street builds its signpost from the loaded texture (loadSignpostTextures).
      assert.equal(FIRST_DRAW_SPRITES.has(path), false, path);
    }
  });

  it('is registered from tools/signpost-art and passed the 3:1 downscale bars', () => {
    for (const [id, path] of Object.entries(PARTS)) {
      const r = results[path];
      assert.equal(r.status, 'ok', id);
      assert.equal(r.source, 'tools/signpost-art', id);
      assert.equal(r.hires, HIRES_SPRITES.get(path), id);
      assert.equal(r.cells, 1, id);
      assert.ok(r.score >= 0.95, `${id} ${r.score}`);
      assert.deepEqual(r.drift, [], id);
    }
  });

  it('says the art is a hand trace of the 1x PNGs, dedicated CC0', () => {
    assert.match(readFileSync(join(art, 'build.mjs'), 'utf8'), /a hand trace of those 1x PNGs \(CC0\)/);
    assert.match(readFileSync(join(art, 'build.mjs'), 'utf8'), /Nothing comes from\s+\* videos, screenshots, other remakes or image generators/);
    for (const id of Object.keys(PARTS)) {
      const svg = readFileSync(join(art, 'svg', `${id}.svg`), 'utf8');
      assert.match(svg, new RegExp(`Hand-traced from Tiny Speck's 1x signpost_${id}\\.png \\(CC0`), id);
      assert.match(svg, /dedicated CC0 1\.0/, id);
    }
  });

  it('the measured grain in the SVGs matches the 1x PNGs (grain.mjs --check)', async () => {
    const { grainFor, withGrain } = await import('../tools/signpost-art/grain.mjs');
    for (const id of ['post', 'arm']) {
      const svg = readFileSync(join(art, 'svg', `${id}.svg`), 'utf8');
      assert.equal(withGrain(svg, grainFor(id)), svg, `svg/${id}.svg grain is stale`);
    }
  });
});
