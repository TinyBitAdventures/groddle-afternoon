/**
 * Install the Sounds.zip recordings (tools/sound/sounds-zip-map.json) as
 * public/assets/audio/sfx/<KEY>.mp3, byte for byte: Tiny Speck's own c2.glitch.bz
 * server files, from a fan re-upload of them (research/coverage/g312-provenance.md
 * "Sounds.zip, 2026-11-02"). No re-encode, no tag stripping, no levelling.
 *
 * Source (outside git): the zip's Sounds/ folder, unzipped, at
 * ~/Documents/glitch-audit/research/audio-hunt/raw/sounds-zip-drive/x/Sounds
 * (GLITCH_SOUNDS_ZIP to point elsewhere). The map's `source` names the Drive file.
 * A row with `sameAs` is already shipped under another name with the same bytes
 * (HELL = the downloads page's Dirge of the Damned): nothing is copied for it.
 * `held` rows are not installed.
 *
 *   node tools/sound/install-sounds-zip.mjs [--check]
 *
 * --check writes nothing and fails when a shipped file is missing or its md5
 * differs from the map (no source needed).
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const SRC = process.env.GLITCH_SOUNDS_ZIP
  || join(process.env.HOME || '', 'Documents/glitch-audit/research/audio-hunt/raw/sounds-zip-drive/x/Sounds');
const CHECK = process.argv.includes('--check');
const map = JSON.parse(readFileSync(join(here, 'sounds-zip-map.json'), 'utf8'));
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');

/** Where a map row ships, relative to public/. */
export function shippedFile(row) {
  return row.sameAs || `assets/audio/sfx/${row.key}.mp3`;
}

const bad = [];
let copied = 0;
for (const row of map.files) {
  const dest = join(root, 'public', shippedFile(row));
  const ok = existsSync(dest) && md5(dest) === row.md5;
  if (CHECK || row.sameAs) {
    if (!ok) bad.push(row.key);
    continue;
  }
  if (ok) continue;
  const src = join(SRC, row.zip);
  if (!existsSync(src)) throw new Error(`missing source ${src} (unzip Sounds.zip there, or set GLITCH_SOUNDS_ZIP)`);
  if (md5(src) !== row.md5) throw new Error(`${row.zip}: md5 ${md5(src)} is not the map's ${row.md5}`);
  copyFileSync(src, dest);
  copied += 1;
  console.log(`${row.key.padEnd(28)} <- ${row.zip}`);
}
if (bad.length) {
  console.error(`missing or changed: ${bad.join(', ')}`);
  process.exit(1);
}
console.log(`${map.files.length} Sounds.zip files ${CHECK ? 'checked' : `in place (${copied} copied)`}`);
