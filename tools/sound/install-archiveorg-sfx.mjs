/**
 * Install the archive.org Glitch audio mapped in tools/sound/archiveorg-sfx-map.json
 * as public/assets/audio/sfx/<KEY>.mp3.
 *
 * Sources (outside git): ~/Documents/glitch-audit/research/audio-archiveorg/<item id>/<file>
 * (fetched sequentially from https://archive.org/download/<item>/<name>).
 *
 * Per file:
 *   - drop the embedded PNG cover art and tags (every archive.org mp3 carries one)
 *   - gentle loudness levelling: integrated loudness (EBU R128, or mean volume for
 *     clips too short to gate) is pulled into LOUD_MIN..LOUD_MAX; peaks stay under
 *     PEAK_CEILING when lifted. Files already inside the window are not touched (the
 *     c2 and downloads files we already ship sit between -30 and -7.6 LUFS).
 *   - clips longer than LONG_SECONDS (music, ringtones, loops) re-encode at VBR q4;
 *     short clips are stream-copied unless a gain change forces a re-encode (VBR q2)
 *
 * Writes tools/sound/archiveorg-install-log.json (source md5, sizes, loudness, gain).
 *
 *   node tools/sound/install-archiveorg-sfx.mjs [--dry-run] [--only KEY,KEY]
 *
 * --only installs just those keys and keeps the other log rows (re-encoding the
 * whole set changes bytes nobody asked to change). Log rows for keys no longer in
 * the map are dropped either way.
 */

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const RESEARCH = process.env.GLITCH_ARCHIVEORG || join(process.env.HOME || '', 'Documents/glitch-audit/research/audio-archiveorg');
const MAP = JSON.parse(readFileSync(join(here, 'archiveorg-sfx-map.json'), 'utf8'));
const OUT_DIR = join(root, 'public/assets/audio/sfx');
const LOG = join(here, 'archiveorg-install-log.json');
const DRY = process.argv.includes('--dry-run');
const onlyAt = process.argv.indexOf('--only');
const ONLY = onlyAt > 0 ? new Set(String(process.argv[onlyAt + 1] || '').split(',').filter(Boolean)) : null;
if (ONLY) for (const key of ONLY) if (!MAP.files.some((f) => f.key === key)) throw new Error(`--only ${key}: not in the map`);

const LOUD_MIN = -30;
const LOUD_MAX = -10;
const PEAK_CEILING = -1;
const LONG_SECONDS = 5;

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}\n${r.stderr}`);
  return `${r.stdout}${r.stderr}`;
}

function measure(src) {
  const r128 = ffmpeg(['-i', src, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const summary = r128.slice(r128.lastIndexOf('Summary:'));
  const integrated = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
  const peak = Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
  const vol = ffmpeg(['-i', src, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-']);
  const mean = Number(vol.match(/mean_volume:\s+(-?[\d.]+) dB/)?.[1]);
  const max = Number(vol.match(/max_volume:\s+(-?[\d.]+) dB/)?.[1]);
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', src], { encoding: 'utf8' }).trim()) || 0;
  // Gating leaves very short clips at -70 LUFS; fall back to the mean level.
  const loudness = Number.isFinite(integrated) && integrated > -60 ? integrated : mean;
  return { loudness, integrated, mean, peak: Number.isFinite(peak) ? peak : max, duration };
}

function gainFor({ loudness, peak }) {
  if (!Number.isFinite(loudness)) return 0;
  let gain = 0;
  if (loudness > LOUD_MAX) gain = LOUD_MAX - loudness;
  else if (loudness < LOUD_MIN) gain = Math.min(LOUD_MIN - loudness, PEAK_CEILING - peak);
  return Math.abs(gain) < 0.5 ? 0 : Math.round(gain * 10) / 10;
}

const items = MAP.items;
const previous = ONLY && existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')).files || {} : {};
const log = {};
let bytesIn = 0;
let bytesOut = 0;
for (const entry of MAP.files) {
  if (ONLY && !ONLY.has(entry.key)) {
    if (previous[entry.key]) {
      log[entry.key] = previous[entry.key];
      bytesIn += previous[entry.key].bytesIn || 0;
      bytesOut += previous[entry.key].bytesOut || 0;
    }
    continue;
  }
  const item = items[entry.item];
  const src = join(RESEARCH, item.id, entry.file);
  if (!existsSync(src)) throw new Error(`missing source ${src}`);
  const dest = join(OUT_DIR, `${entry.key}.mp3`);
  const m = measure(src);
  const gain = gainFor(m);
  const long = m.duration > LONG_SECONDS;
  const mode = long ? 'vbr4' : gain ? 'vbr2' : 'copy';
  const args = ['-y', '-i', src, '-map', '0:a:0', '-map_metadata', '-1', '-id3v2_version', '0', '-write_id3v1', '0'];
  if (mode === 'copy') args.push('-c:a', 'copy');
  else {
    if (gain) args.push('-af', `volume=${gain}dB`);
    args.push('-c:a', 'libmp3lame', '-q:a', long ? '4' : '2');
  }
  args.push(dest);
  if (!DRY) ffmpeg(args);
  const inSize = statSync(src).size;
  const outSize = DRY ? 0 : statSync(dest).size;
  bytesIn += inSize;
  bytesOut += outSize;
  log[entry.key] = {
    source: `${item.id}/${entry.file}`,
    sourceMd5: createHash('md5').update(readFileSync(src)).digest('hex'),
    seconds: Math.round(m.duration * 100) / 100,
    loudness: Math.round(m.loudness * 10) / 10,
    peak: m.peak,
    gainDb: gain,
    mode,
    bytesIn: inSize,
    bytesOut: outSize,
  };
  console.log(`${entry.key.padEnd(40)} ${String(log[entry.key].loudness).padStart(6)} ${String(gain).padStart(5)} dB ${mode.padEnd(5)} ${inSize} → ${outSize}`);
}
if (!DRY) writeFileSync(LOG, `${JSON.stringify({ generatedBy: 'tools/sound/install-archiveorg-sfx.mjs', window: [LOUD_MIN, LOUD_MAX], peakCeiling: PEAK_CEILING, bytesIn, bytesOut, files: log }, null, 1)}\n`);
console.log(`${MAP.files.length} files, ${bytesIn} → ${bytesOut} bytes${DRY ? ' (dry run)' : ''}`);
