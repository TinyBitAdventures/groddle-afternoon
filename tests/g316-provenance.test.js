/**
 * G316/G317: no file that is neither Tiny Speck's nor our own comes back (untraced
 * art, the CDN loading strips, the licensed stock new_day_fanfare.mp3), and
 * nothing still points at a file that was taken out.
 *
 * 2026-10-29: the six butterfly 3x renders ship again. Their SWF was thought to be
 * a Wayback-only copy, but tinyspeck/glitch-items has the same file
 * (misc/npc/npc_butterfly/npc_butterfly.swf, commit 9a64021, sha1 63bafbd0...).
 * tools/provenance/non-cc0-removed.json lists the removed paths and their bytes.
 *
 * 2026-10-28 (Austin: use all of the original sound): Tiny Speck's own
 * recordings that G317 had also taken out ship again as the originals. They are
 * listed by path and git blob under `restored`, and each may appear only at its
 * own path with its own bytes (research/coverage/g312-provenance.md "Original
 * sounds, 2026-10-28").
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const REMOVED = JSON.parse(readFileSync(join(root, 'tools/provenance/non-cc0-removed.json'), 'utf8'));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const gitBlob = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');

describe('non-CC0 files stay out (G316/G317)', () => {
  it('no shipped or source file carries the bytes of a removed one', () => {
    const blobs = new Set(Object.keys(REMOVED.blobs));
    assert.ok(blobs.size >= 92);
    // The stock trumpet (Sounddogs, rights withheld) stays out.
    assert.match(Object.values(REMOVED.blobs).join('\n'), /licensed stock audio/);
    assert.ok(REMOVED.paths.includes('public/assets/audio/new_day_fanfare.mp3'));
    const hits = [];
    for (const dir of [join(pub, 'assets'), join(root, 'assets-src')]) {
      for (const f of walk(dir)) {
        if (!/\.(png|jpe?g|webp|gif|svg|mp3|ogg|wav)$/i.test(f)) continue;
        if (blobs.has(gitBlob(readFileSync(f)))) hits.push(relative(root, f));
      }
    }
    assert.deepEqual(hits, []);
  });

  it('the restored Tiny Speck originals sit only at their own paths, byte for byte (2026-10-28)', () => {
    const restored = Object.entries(REMOVED.restored);
    assert.equal(restored.length, 41);
    const byBlob = new Map(restored);
    for (const [blob, row] of restored) {
      assert.ok(!REMOVED.blobs[blob], `${row.path} is both removed and restored`);
      assert.ok(!REMOVED.paths.includes(row.path), row.path);
      assert.match(row.path, /^public\/assets\/audio\//);
      assert.match(row.source, /^(c2\.glitch\.bz via the Wayback CDX|archive\.org glitch-mmo-tiny-speck-unused-sfx|glitchthegame\.com downloads page)/);
      assert.ok(existsSync(join(root, row.path)), row.path);
      assert.equal(gitBlob(readFileSync(join(root, row.path))), blob, `${row.path}: not the original bytes`);
    }
    const misplaced = [];
    for (const dir of [join(pub, 'assets'), join(root, 'assets-src')]) {
      for (const f of walk(dir)) {
        if (!/\.(mp3|ogg|wav)$/i.test(f)) continue;
        const row = byBlob.get(gitBlob(readFileSync(f)));
        if (row && relative(root, f) !== row.path) misplaced.push(relative(root, f));
      }
    }
    assert.deepEqual(misplaced, []);
  });

  it('no removed path is back, and no code or data names one', () => {
    for (const p of REMOVED.paths) assert.ok(!existsSync(join(root, p)), p);
    // Paths as the game writes them (from assets/), minus files that were replaced in place.
    const gone = REMOVED.paths.filter((p) => p.startsWith('public/') && !existsSync(join(root, p))).map((p) => p.slice('public/'.length));
    const texts = walk(pub).filter((f) => ['.js', '.json', '.html', '.css', '.mjs'].includes(extname(f)) && !f.includes(`${join('assets', 'streets')}`));
    const named = [];
    for (const f of texts) {
      const text = readFileSync(f, 'utf8');
      if (!text.includes('assets/')) continue;
      for (const g of gone) if (text.includes(g)) named.push(`${relative(root, f)} -> ${g}`);
    }
    assert.deepEqual(named, []);
  });
});

describe('loading-card strips are our own renders (G316)', () => {
  it('every card key points at a strip drawn from the street\'s CC0 layers', async () => {
    const map = JSON.parse(readFileSync(join(pub, 'assets/content/loading-images.json'), 'utf8'));
    const { stripMap, STRIP_DIR } = await import('../tools/loading-strips/build.mjs');
    assert.deepEqual(map, stripMap());
    const streets = JSON.parse(readFileSync(join(pub, 'assets/streets/index.json'), 'utf8')).streets;
    for (const [key, row] of Object.entries(map)) {
      assert.ok(row.local.startsWith(`${STRIP_DIR}/`), key);
      assert.ok(existsSync(join(pub, row.local)), row.local);
      assert.ok(streets[row.tsid], `${key}: ${row.tsid} is a street the renderer can draw`);
    }
    assert.equal(existsSync(join(pub, 'assets/loading')), false, 'the CDN strips are gone');
  });

  it('a street with no strip, or a strip that fails to load, gets the card without a picture', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    // resolveLoadingImg answers only from the map, else null; the card then drops the box.
    assert.match(game, /function resolveLoadingImg\(tsid\) \{[\s\S]*?return null;\n\}/);
    const fx = readFileSync(join(pub, 'js/screen-fx.js'), 'utf8');
    assert.match(fx, /if \(opts\.loadingImg\) \{[\s\S]*?snap\.onerror = noPicture;[\s\S]*?\} else \{\n\s+noPicture\(\);/);
    assert.match(fx, /el\.dataset\.stSnap = 'none';/);
  });
});

describe('sprites, decos and garden art (G316)', () => {
  it('every 3x sprite file exists; the butterfly sheets render the CC0 glitch-items SWF', async () => {
    const { HIRES_SPRITES } = await import('../public/js/sprite-hires.js?v=5919dfde');
    for (const [lo, hi] of HIRES_SPRITES) {
      assert.ok(existsSync(join(pub, lo.split('?')[0])), lo);
      assert.ok(existsSync(join(pub, hi)), hi);
    }
    for (const lo of ['assets/sprites/npc_butterfly__x1_fly-side_png_1354829525.png', 'assets/sprites/rooks/butterfly-fly-rooked.png',
      'assets/sprites/quest-rooms/gwendolyn/swoonerfly_fall.png']) {
      assert.ok(HIRES_SPRITES.has(lo), lo);
      assert.ok(existsSync(join(pub, lo)), `${lo}: the CC0 1x sheet stays`);
    }
    for (const name of ['animals.json', 'characters.json']) {
      const m = JSON.parse(readFileSync(join(root, 'tools/vector-sprites', name), 'utf8'));
      for (const job of m.jobs) assert.ok(!/wayback/i.test(job.swf), `${job.name}: ${job.swf}`);
    }
  });

  it('every manifest deco has its file; renamed twins draw their CC0 SWF render', async () => {
    const names = JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8'));
    for (const n of names) assert.ok(existsSync(join(pub, 'assets/decos/groddle', `${n}.webp`)), n);
    const { DECO_TWINS } = await import('../public/js/street-render.js?v=1949ea5c');
    for (const [alias, twin] of Object.entries(DECO_TWINS)) {
      assert.ok(!names.includes(alias), alias);
      assert.ok(names.includes(twin), twin);
    }
    for (const n of ['patch_grass_2', 'patch_grass_4', 'patch_grass_6']) assert.ok(!names.includes(n), n);
  });

  it('the fruit tree and garden art come from CC0 cells or our own drawing', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    assert.match(game, /treeFruit: \{ url: 'assets\/sprites\/trants\/frames\/trant_fruit_m7\.png', whole: true \}/);
    assert.ok(existsSync(join(pub, 'assets/sprites/trants/frames/trant_fruit_m7.png')));
    for (const f of ['plot_dry.png', 'plot_wet.png', 'plot_dirty.png', 'bed_frame_wood.png']) {
      assert.ok(existsSync(join(pub, 'assets/sprites/garden', f)), f);
    }
    assert.match(readFileSync(join(root, 'tools/garden-art/build.py'), 'utf8'), /plot_\{s\}\.png/);
  });
});
