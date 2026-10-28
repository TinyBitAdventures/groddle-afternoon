/**
 * Install the c2.glitch.bz sounds recovered from the Wayback CDX index as
 * public/assets/audio/sfx/<KEY>.mp3, byte for byte (Tiny Speck's own files, as
 * Glitch served them; see research/coverage/g312-provenance.md "Original sounds,
 * 2026-10-28").
 *
 * Source (outside git): ~/Documents/glitch-audit/wayback/sfx-cdx/raw/<YYYY-MM>__<name>,
 * fetched from https://web.archive.org/web/<ts>id_/<url> (urls.tsv beside it).
 * Keys and urls: the rows of assets/content/sound-keys.json with a `keyFrom`
 * (build-sound-keys.mjs RECOVERED).
 *
 *   node tools/sound/install-c2-sfx.mjs [--check]
 *
 * --check writes nothing and fails when a shipped file is missing or differs.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const RAW = process.env.GLITCH_C2_RAW || join(process.env.HOME || '', 'Documents/glitch-audit/wayback/sfx-cdx/raw');
const OUT_DIR = join(root, 'public/assets/audio/sfx');
const CHECK = process.argv.includes('--check');
const { keys } = JSON.parse(readFileSync(join(root, 'public/assets/content/sound-keys.json'), 'utf8'));
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');

const bad = [];
let n = 0;
for (const [key, row] of Object.entries(keys)) {
  if (!row.keyFrom) continue;
  const m = row.url.match(/^http:\/\/c2\.glitch\.bz\/sounds\/(\d{4}-\d\d)\/(.+)$/);
  if (!m) throw new Error(`${key}: not a c2 sounds url (${row.url})`);
  const src = join(RAW, `${m[1]}__${m[2]}`);
  const dest = join(OUT_DIR, `${key}.mp3`);
  n += 1;
  if (CHECK) {
    if (!existsSync(dest) || (existsSync(src) && md5(src) !== md5(dest))) bad.push(key);
    continue;
  }
  if (!existsSync(src)) throw new Error(`missing source ${src}`);
  if (!existsSync(dest) || md5(src) !== md5(dest)) {
    copyFileSync(src, dest);
    console.log(`${key.padEnd(28)} <- ${m[1]}/${m[2]}`);
  }
}
if (bad.length) {
  console.error(`missing or changed: ${bad.join(', ')}`);
  process.exit(1);
}
console.log(`${n} c2 files ${CHECK ? 'checked' : 'in place'}`);
