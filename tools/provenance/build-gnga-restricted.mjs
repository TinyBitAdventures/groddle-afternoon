#!/usr/bin/env node
/**
 * Writes tools/provenance/gnga-restricted.json: the sha1 and size of every file in the
 * GoodnightGroddleArchive sets that must never ship (Austin's brief, 2026-11-09):
 *   - glitch-audio/Daniel Simmons Indiegogo Albums/  (backer reward, all rights reserved)
 *   - glitch-art/Indiegogo The Art of Glitch/        (purchased PDF, copyrighted)
 *   - glitch-art/FullStreetTemplates/                (Tiny Speck street panoramas: reference only)
 *   - glitch-art/Screenshots of Intro Tutorial/      (reference only)
 *   - glitch-art/mb_gng.png                          (called CC0 in the README; held until verified)
 * The TS-server sounds are left out on purpose: the game ships byte-identical Tiny Speck
 * originals from Sounds.zip (research/coverage/g312-provenance.md, "Original sounds, 2026-10-28").
 *
 * Only hashes, sizes and the set folder names are written, so tests/gnga-restricted.test.js runs
 * without the private clones. The clones are read-only research material outside the repo
 * (research/goodnight-groddle-archive, beside the game; GRODDLE_GNGA_DIR overrides).
 *
 *   node tools/provenance/build-gnga-restricted.mjs          rewrite the JSON
 *   node tools/provenance/build-gnga-restricted.mjs --check  exit 1 when it is stale
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT = join(root, 'tools/provenance/gnga-restricted.json');

export const SETS = Object.freeze([
  { id: 'indiegogo-albums', folder: 'glitch-audio/Daniel Simmons Indiegogo Albums', why: 'Daniel Simmons backer albums (Indiegogo): copyrighted, personal use only' },
  { id: 'art-of-glitch', folder: 'glitch-art/Indiegogo The Art of Glitch', why: 'The Art of Glitch digital edition (Indiegogo): purchased, copyrighted' },
  { id: 'street-templates', folder: 'glitch-art/FullStreetTemplates', why: 'stitched street panoramas of Tiny Speck game art: layout reference only, never the pixels' },
  { id: 'tutorial-screenshots', folder: 'glitch-art/Screenshots of Intro Tutorial', why: 'intro tutorial screenshots: reference only' },
  { id: 'mb-gng', folder: 'glitch-art/mb_gng.png', why: 'GNG musicblock icon: not found in a Tiny Speck CC0 release; held until verified' },
]);

export function gngaDir() {
  const candidates = [process.env.GRODDLE_GNGA_DIR, join(root, '..', 'research/goodnight-groddle-archive')];
  return candidates.find((d) => d && existsSync(join(d, 'glitch-art')) && existsSync(join(d, 'glitch-audio'))) || null;
}

function walk(p, out = []) {
  const st = statSync(p);
  if (!st.isDirectory()) { out.push(p); return out; }
  for (const name of readdirSync(p).sort()) {
    if (name === '.git') continue;
    walk(join(p, name), out);
  }
  return out;
}

export const sha1 = (buf) => createHash('sha1').update(buf).digest('hex');

export function build(dir) {
  const sets = {};
  for (const set of SETS) {
    const base = join(dir, set.folder);
    if (!existsSync(base)) throw new Error(`missing ${set.folder} under ${dir}`);
    const seen = new Map();
    let files = 0;
    for (const f of walk(base)) {
      const buf = readFileSync(f);
      files += 1;
      seen.set(sha1(buf), buf.length);
    }
    sets[set.id] = {
      folder: set.folder,
      why: set.why,
      files,
      hashes: [...seen].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([h, size]) => `${h}:${size}`),
    };
  }
  return {
    about: 'sha1:size of every file in the GoodnightGroddleArchive sets that must never ship. Written by tools/provenance/build-gnga-restricted.mjs; tests/gnga-restricted.test.js fails if any file under public/ or assets-src/ has these bytes. Clones: GoodnightGroddleArchive glitch-art 1d0fed8, glitch-audio ecc4021 (2026-11-09), read-only, outside the repo.',
    sets,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = gngaDir();
  if (!dir) {
    console.error('GoodnightGroddleArchive clones not found (research/goodnight-groddle-archive beside the game, or GRODDLE_GNGA_DIR)');
    process.exit(2);
  }
  const text = `${JSON.stringify(build(dir), null, 1)}\n`;
  if (process.argv.includes('--check')) {
    const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (cur !== text) { console.error('gnga-restricted.json is stale: run node tools/provenance/build-gnga-restricted.mjs'); process.exit(1); }
    console.log('gnga-restricted.json is current');
  } else {
    writeFileSync(OUT, text);
    const d = JSON.parse(text);
    for (const [id, s] of Object.entries(d.sets)) console.log(`${id}: ${s.files} files, ${s.hashes.length} distinct`);
  }
}
