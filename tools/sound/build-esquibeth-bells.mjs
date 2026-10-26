/**
 * The five Esquibeth puzzle bells (BW_D2, BW_E2, BW_G2, BW_C2, BW_A1), cut from
 * Tiny Speck's CC0 ringtone "Esquebeth Puzzle.mp3" (archive.org esquebeth-quest,
 * CC0 licenseurl). G317: the c2.glitch.bz bell files (2012-08, via Wayback) are in
 * no CC0 release, so the remake no longer ships them.
 *
 * The ringtone is the puzzle melody played on the same bells: its D2 at 3.746 s
 * matches the old c2 BW_D2 take sample for sample (r 0.985 over the first 0.5 s)
 * and rings for 0.88 s before the next note. That one strike, faded out, is every
 * bell: D2 as it is, the others resampled to their pitch (E2 +2, G2 +5, C2 -2,
 * A1 -5 semitones). Each result still picks its own old c2 bell out of the five
 * (tests/sound.test.js keeps the pitch order). Levels are pulled down 12 dB to sit
 * where the c2 bells did.
 *
 * Writes public/assets/audio/sfx/bells/<KEY>.mp3.
 *
 *   node tools/sound/build-esquibeth-bells.mjs          (build)
 *   node tools/sound/build-esquibeth-bells.mjs --check  (source md5 + outputs present)
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const RESEARCH = process.env.GLITCH_ARCHIVEORG || join(process.env.HOME || '', 'Documents/glitch-audit/research/audio-archiveorg');
export const BELL_SOURCE = Object.freeze({
  item: 'esquebeth-quest',
  file: 'Esquebeth Puzzle.mp3',
  md5: '58128a69a993acd0dc25cd9099cd239c',
  url: 'https://archive.org/download/esquebeth-quest/Esquebeth%20Puzzle.mp3',
  startSeconds: 3.746,
  seconds: 0.88,
  fadeAt: 0.55,
  gainDb: -12,
});
/** Semitones from the D2 strike. */
export const BELL_SHIFTS = Object.freeze({ BW_D2: 0, BW_E2: 2, BW_G2: 5, BW_C2: -2, BW_A1: -5 });
export const BELL_DIR = 'assets/audio/sfx/bells';

const OUT = join(root, 'public', BELL_DIR);

function run() {
  const src = join(RESEARCH, BELL_SOURCE.item, BELL_SOURCE.file);
  if (!existsSync(src)) throw new Error(`missing ${src} (fetch ${BELL_SOURCE.url})`);
  const md5 = createHash('md5').update(readFileSync(src)).digest('hex');
  if (md5 !== BELL_SOURCE.md5) throw new Error(`${src}: md5 ${md5}, archive.org lists ${BELL_SOURCE.md5}`);
  if (process.argv.includes('--check')) {
    const missing = Object.keys(BELL_SHIFTS).filter((k) => !existsSync(join(OUT, `${k}.mp3`)));
    if (missing.length) throw new Error(`missing bells: ${missing.join(', ')}`);
    console.log('bells ok');
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const { startSeconds, seconds, fadeAt, gainDb } = BELL_SOURCE;
  for (const [key, semis] of Object.entries(BELL_SHIFTS)) {
    const rate = (44100 * 2 ** (semis / 12)).toFixed(3);
    const filters = [`afade=t=out:st=${fadeAt}:d=${(seconds - fadeAt).toFixed(2)}`, `volume=${gainDb}dB`];
    if (semis) filters.push(`asetrate=${rate}`, 'aresample=44100');
    const args = ['-hide_banner', '-nostats', '-y', '-ss', String(startSeconds), '-t', String(seconds), '-i', src,
      '-map', '0:a:0', '-map_metadata', '-1', '-id3v2_version', '0', '-write_id3v1', '0',
      '-af', filters.join(','), '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '128k', join(OUT, `${key}.mp3`)];
    const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ffmpeg ${key}: ${r.stderr}`);
    console.log(`${key} ${semis >= 0 ? '+' : ''}${semis}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
