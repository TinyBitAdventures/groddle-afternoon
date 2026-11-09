/**
 * GoodnightGroddleArchive guard (2026-11-09): nothing under public/ or assets-src/ carries the
 * bytes of a file from the archive's restricted sets: the Daniel Simmons Indiegogo albums, the
 * Art of Glitch PDF, the FullStreetTemplates panoramas, the intro tutorial screenshots, and
 * mb_gng.png until its CC0 claim is verified. The TS-server sounds are not in the list: the game
 * ships byte-identical Tiny Speck originals from Sounds.zip (g312-provenance.md, 2026-10-28).
 *
 * The hashes live in tools/provenance/gnga-restricted.json (sha1:size only), so this runs without
 * the private clones; when the clones are beside the game the list must be current.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUT, SETS, build, gngaDir, sha1 } from '../tools/provenance/build-gnga-restricted.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIST = JSON.parse(readFileSync(OUT, 'utf8'));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (st.isFile()) out.push([p, st.size]);
  }
  return out;
}

/** Files under `dirs` whose sha1:size is in `restricted` (a Map of 'sha1:size' -> set id). */
function scan(dirs, restricted) {
  const sizes = new Set([...restricted.keys()].map((k) => Number(k.split(':')[1])));
  const hits = [];
  for (const dir of dirs) {
    for (const [f, size] of walk(dir)) {
      if (!sizes.has(size)) continue;
      const set = restricted.get(`${sha1(readFileSync(f))}:${size}`);
      if (set) hits.push(`${relative(root, f)} (${set})`);
    }
  }
  return hits;
}

const restricted = new Map();
for (const [id, set] of Object.entries(LIST.sets)) for (const h of set.hashes) restricted.set(h, id);

describe('GoodnightGroddleArchive restricted files stay out', () => {
  it('lists every restricted set by hash and size only', () => {
    assert.deepEqual(Object.keys(LIST.sets), SETS.map((s) => s.id));
    const min = { 'indiegogo-albums': 1000, 'art-of-glitch': 1, 'street-templates': 1200, 'tutorial-screenshots': 30, 'mb-gng': 1 };
    for (const [id, set] of Object.entries(LIST.sets)) {
      assert.equal(set.folder, SETS.find((s) => s.id === id).folder);
      assert.ok(set.files >= min[id], `${id}: ${set.files} files`);
      assert.ok(set.hashes.length >= 1 && set.hashes.length <= set.files, id);
      for (const h of set.hashes) assert.match(h, /^[0-9a-f]{40}:\d+$/, `${id}: ${h}`);
    }
    // No file names or local paths beyond the set folders.
    const text = readFileSync(OUT, 'utf8');
    assert.doesNotMatch(text, /\/Users\/|\.(mp3|flac|m4r|mp4|jpe?g|pdf)"/i);
  });

  it('no file under public/ or assets-src/ has the bytes of a restricted file', () => {
    assert.ok(restricted.size > 2000);
    assert.deepEqual(scan([join(root, 'public'), join(root, 'assets-src')], restricted), []);
  });

  it('the scan finds a planted copy', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gnga-guard-'));
    try {
      const buf = Buffer.from('a stand-in for a restricted file');
      writeFileSync(join(dir, 'copy.bin'), buf);
      writeFileSync(join(dir, 'other.bin'), Buffer.from('something else of a different size'));
      const fake = new Map([[`${sha1(buf)}:${buf.length}`, 'indiegogo-albums']]);
      const hits = scan([dir], fake);
      assert.equal(hits.length, 1);
      assert.match(hits[0], /copy\.bin \(indiegogo-albums\)$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('matches the clones when they are beside the game', (t) => {
    const dir = gngaDir();
    if (!dir) return t.skip('GoodnightGroddleArchive clones not present (research/goodnight-groddle-archive)');
    assert.equal(readFileSync(OUT, 'utf8'), `${JSON.stringify(build(dir), null, 1)}\n`, 'run node tools/provenance/build-gnga-restricted.mjs');
  });
});
