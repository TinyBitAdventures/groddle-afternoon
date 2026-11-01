/**
 * Install Austin's Wavelength takes (2026-11-01) as files that stand in for synth recipes.
 *
 * tools/sound/wavelength-sfx/takes.json lists the rounds Austin listened to and the takes he
 * picked from each (`rounds`, in order: a recipe shipped by an earlier round is not taken again).
 * A take ships only when every sound source its Wavelength job plays may be redistributed as a
 * standalone sound in this public repo (takes.json `sources`): Wavelength's own synth, presets, fx
 * and reverb (procedural) and MuseScore General (MIT, notice kept beside the files). A pick whose
 * job plays Serum 2 sfz, Bitwig multisamples or Apple EXS samples is held on its synth recipe and
 * listed under `held` with what blocks it.
 *
 * Per shipped take:
 *   - the delivered render (44.1 kHz stereo 160 kbps, already trimmed: the file Austin heard) is
 *     folded to mono, peaked at -1 dBFS and encoded as 96 kbps CBR MP3, tags dropped;
 *   - loudness is the short-sound LUFS of the Wavelength lane's measure.py (padded to 0.6 s, EBU
 *     R128 integrated), measured on the shipped file and on the synth recipe's own render
 *     (playSynthRecipe at volume 1, mono WAV); gainDb = recipe - take, so at the same playSound
 *     volume the take sits where the recipe sat in the game's mix (capped so a peak stays <= 0 dBFS);
 *   - its job is copied to tools/sound/wavelength-sfx/jobs/<recipe>.json.
 *
 * Writes public/assets/audio/sfx/wavelength/<recipe>.mp3, provenance.json and the MuseScore
 * General notice there, and the runtime table public/js/wavelength-sfx.js.
 *
 *   node tools/sound/install-wavelength-sfx.mjs --source <groddle-sfx folder with the round job folders>
 *     --renders <folder holding each round's renders folder (<recipe>[-<take>].mp3 + manifest.json)>
 *     --originals <folder with <recipe>.wav> [--notice <MuseScore_General_License.md>]
 *   node tools/sound/install-wavelength-sfx.mjs --check
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const CONFIG = JSON.parse(readFileSync(join(here, 'wavelength-sfx/takes.json'), 'utf8'));
const JOBS = join(here, 'wavelength-sfx/jobs');
const OUT_REL = 'assets/audio/sfx/wavelength';
const OUT = join(root, 'public', OUT_REL);
const PROVENANCE = join(OUT, 'provenance.json');
const TABLE = join(root, 'public/js/wavelength-sfx.js');
const NOTICE = 'MuseScore_General_License.md';
const PEAK_TARGET = -1;
const BITRATE = '96k';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const round1 = (x) => Math.round(x * 10) / 10;

function arg(name) {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : undefined;
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}\n${r.stderr}`);
  return `${r.stdout}${r.stderr}`;
}

/** Short-sound loudness, as the Wavelength lane's measure.py: pad to 0.6 s, EBU R128. */
function loudness(path) {
  const out = ffmpeg(['-i', path, '-af', 'apad=whole_dur=0.6,ebur128=peak=true+sample', '-f', 'null', '-']);
  const summary = out.slice(out.lastIndexOf('Summary:'));
  const num = (re) => {
    const m = summary.match(re);
    return m && m[1] !== '-inf' ? Number(m[1]) : -99;
  };
  return { lufs: num(/I:\s+(-?[\d.]+|-inf) LUFS/), peak: num(/Sample peak:\s+Peak:\s+(-?[\d.]+|-inf)/) };
}

function seconds(path) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' });
  return Math.round(Number(r.stdout.trim()) * 1000) / 1000;
}

/** Every sound source a Wavelength job plays, as takes.json `sources` ids. */
export function jobSources(job) {
  const ids = new Set();
  for (const t of job.tracks || []) {
    if (t.plugin === 'builtin:sampler') {
      const s = t.sampler || {};
      if (s.soundfont) ids.add(`soundfont:${s.soundfont}`);
      else if (s.sfz) ids.add(`sfz:${s.sfz}`);
      else if (s.multisample) ids.add(`multisample:${s.multisample}`);
      else if (s.exs) ids.add(`exs:${s.exs}`);
      else ids.add(`sampler:${JSON.stringify(s)}`);
    } else if (t.plugin === 'builtin:synth' && !t.patch && !t.state) {
      // A preset is named: a Wavelength built-in one ships, an Apple patch of the same name would not.
      ids.add(t.preset ? `builtin:synth:preset:${t.preset}` : 'builtin:synth');
    } else if (t.plugin === 'builtin:fx') {
      ids.add('builtin:fx');
    } else {
      ids.add(`plugin:${t.plugin}:${t.preset || t.patch || ''}`);
    }
    for (const fx of t.fx || []) if (!['pan', 'width', 'eq', 'tremolo'].includes(fx.type)) ids.add(`fx:${fx.type}`);
  }
  for (const bus of job.buses || []) for (const fx of bus.fx || []) ids.add(`fx:${fx.type}`);
  for (const fx of job.master?.fx || []) if (fx.type !== 'eq') ids.add(`fx:${fx.type}`);
  return [...ids].sort();
}

/** A round's picks as [recipe, take letter or ''] pairs. */
export function roundPicks(round) {
  return Array.isArray(round.picks) ? round.picks.map((r) => [r, '']) : Object.entries(round.picks);
}

/** The runtime table, from the provenance rows. */
export function tableSource(provenance) {
  const lines = [
    '/**',
    ' * Generated by tools/sound/install-wavelength-sfx.mjs from',
    ' * public/assets/audio/sfx/wavelength/provenance.json: do not edit by hand.',
    ' *',
    " * Austin's Wavelength takes (2026-11-01) that stand in for synth recipes of",
    ' * js/synth-sfx.js. The sound board plays the file for a key whose recipe is',
    ' * listed here and that has no recovered recording; the recipe stays the',
    ' * fallback while the file loads or when it fails. gainDb sets the take at the',
    " * recipe's loudness in the game's mix; vary is a small seeded pitch spread for",
    ' * recipes that varied per play; group names takes that load together.',
    ' */',
    '',
    `export const WAVELENGTH_TAKES = Object.freeze({`,
  ];
  for (const [recipe, row] of Object.entries(provenance.takes)) {
    const parts = [`file: '${row.file}'`, `gainDb: ${row.gainDb}`];
    if (row.vary) parts.push(`vary: ${row.vary}`);
    if (row.group) parts.push(`group: '${row.group}'`);
    lines.push(`  ${recipe}: Object.freeze({ ${parts.join(', ')} }),`);
  }
  lines.push('});', '');
  return lines.join('\n');
}

async function soundIndex() {
  const { SOUND_ALIASES, SOUND_CATEGORIES, SOUND_FILES } = await import('../../public/js/sound-keys.js?v=2d82d399');
  const { recipeForKey, SYNTH_RECIPE_NAMES } = await import('../../public/js/synth-sfx.js?v=9853c8e7');
  const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/sound-keys.json'), 'utf8'));
  const plays = {};
  const covers = {};
  for (const key of Object.keys(catalog.keys).sort()) {
    const recipe = recipeForKey(key, SOUND_CATEGORIES[key] || '');
    if (!recipe) continue;
    const file = SOUND_FILES[key] || SOUND_FILES[SOUND_ALIASES[key]];
    (file ? covers : plays)[recipe] ||= [];
    (file ? covers : plays)[recipe].push(key);
  }
  return { plays, covers, names: SYNTH_RECIPE_NAMES };
}

function checkConfig(names) {
  const picks = new Set(CONFIG.roundOnePicks);
  if (picks.size !== 66) throw new Error(`takes.json lists ${picks.size} round-one picks, not 66`);
  for (const r of [...CONFIG.roundOnePicks, ...CONFIG.redo]) if (!names.includes(r)) throw new Error(`${r} is not a synth recipe`);
  for (const r of CONFIG.redo) if (picks.has(r)) throw new Error(`${r} is both picked and redone`);
  for (const round of CONFIG.rounds) {
    for (const [r] of roundPicks(round)) {
      if (!picks.has(r) && !CONFIG.redo.includes(r)) throw new Error(`${round.id}: ${r} was neither picked in round one nor sent for a redo`);
    }
  }
}

async function install() {
  const source = arg('--source');
  const renders = arg('--renders');
  const originals = arg('--originals');
  const notice = arg('--notice') || join(process.env.HOME || '', 'Library/Application Support/Wavelength/soundfonts', NOTICE);
  if (!source || !renders || !originals) throw new Error('usage: --source <groddle-sfx> --renders <sfxcompare> --originals <dir> [--notice <file>]');
  const { plays, covers, names } = await soundIndex();
  checkConfig(names);
  const groups = Object.entries(CONFIG.groups || {}).map(([g, re]) => [g, new RegExp(re)]);

  mkdirSync(OUT, { recursive: true });
  mkdirSync(JOBS, { recursive: true });
  const provenance = {
    format: 'groddle-wavelength-sfx/2',
    about: "Austin Ginder's Wavelength recreations of the game's synth sound recipes, picked by Austin on 2026-11-01 (tools/sound/wavelength-sfx/takes.json). Each file plays for the keys listed with it, in place of its js/synth-sfx.js recipe; keys with a recovered Tiny Speck recording keep the recording (recordingKeys).",
    author: CONFIG.author,
    engine: CONFIG.engine,
    licence: CONFIG.licence,
    method: `Wavelength job (tools/sound/wavelength-sfx/jobs/<recipe>.json) rendered at 48 kHz, trimmed and levelled by the WAVESFX lane, delivered as 44.1 kHz stereo 160 kbps MP3; installed by tools/sound/install-wavelength-sfx.mjs as mono ${BITRATE}bps CBR MP3 peaked at ${PEAK_TARGET} dBFS. gainDb = short-sound LUFS of the synth recipe's render minus the shipped file's.`,
    rounds: CONFIG.rounds.map(({ id, rendered, about }) => ({ id, rendered, about })),
    sources: {},
    takes: {},
    held: {},
  };
  const cite = (rows) => rows.map((r) => {
    provenance.sources[r.id] = { label: r.label, licence: r.licence, ship: r.ship, ...(r.notice ? { notice: `${OUT_REL}/${r.notice}` } : {}), ...(r.why ? { why: r.why } : {}) };
    return r.id;
  });
  for (const round of CONFIG.rounds) {
    const manifest = JSON.parse(readFileSync(join(renders, round.renders, 'manifest.json'), 'utf8'));
    for (const [recipe, take] of roundPicks(round)) {
      if (provenance.takes[recipe]) continue; // an earlier round already ships it
      const name = take ? `${recipe}-${take}` : recipe;
      const jobFile = join(source, round.jobs, `${name}.json`);
      const job = JSON.parse(readFileSync(jobFile, 'utf8'));
      const rows = jobSources(job).map((id) => {
        const s = CONFIG.sources[id];
        if (!s) throw new Error(`${round.id} ${name}: unknown sound source ${id}; add it to takes.json sources with its licence`);
        return { id, ...s };
      });
      const instruments = cite(rows);
      const blocked = rows.filter((r) => !r.ship);
      if (blocked.length) {
        provenance.held[recipe] = { round: round.id, keys: plays[recipe] || [], blockedBy: blocked.map((r) => r.id), instruments };
        continue;
      }
      delete provenance.held[recipe];
      const src = join(renders, round.renders, `${name}.mp3`);
      const out = join(OUT, `${recipe}.mp3`);
      const fold = 'pan=mono|c0=0.5*c0+0.5*c1';
      const maxVol = Number(ffmpeg(['-i', src, '-af', `${fold},volumedetect`, '-f', 'null', '-']).match(/max_volume:\s+(-?[\d.]+) dB/)[1]);
      ffmpeg(['-y', '-i', src, '-map_metadata', '-1', '-fflags', '+bitexact', '-af', `${fold},volume=${round1(PEAK_TARGET - maxVol)}dB`,
        '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', BITRATE, '-id3v2_version', '0', '-write_id3v1', '0', out]);
      const measured = loudness(out);
      const original = loudness(join(originals, `${recipe}.wav`));
      // At the same playSound volume, the take lands at the recipe's loudness; never past 0 dBFS.
      const gainDb = round1(Math.min(original.lufs - measured.lufs, -measured.peak));
      const bytes = readFileSync(out);
      const usesMit = rows.some((r) => r.licence === 'MIT');
      copyFileSync(jobFile, join(JOBS, `${recipe}.json`));
      const group = groups.find(([, re]) => re.test(recipe))?.[0];
      const m = manifest.find((r) => r.recipe === recipe && (!take || r.candidate === take)) || {};
      provenance.takes[recipe] = {
        file: `${OUT_REL}/${recipe}.mp3`,
        sha256: sha256(bytes),
        bytes: bytes.length,
        seconds: seconds(out),
        round: round.id,
        ...(take ? { take } : {}),
        keys: plays[recipe] || [],
        recordingKeys: covers[recipe] || [],
        how: m.how || '',
        job: `tools/sound/wavelength-sfx/jobs/${recipe}.json`,
        instruments,
        licence: usesMit ? 'own-work+MIT' : 'own-work',
        ...(usesMit ? { notice: `${OUT_REL}/${NOTICE}` } : {}),
        author: CONFIG.author,
        rendered: round.rendered,
        lufs: measured.lufs,
        peak: measured.peak,
        recipeLufs: original.lufs,
        gainDb,
        ...(CONFIG.vary?.[recipe] ? { vary: CONFIG.vary[recipe] } : {}),
        ...(group ? { group } : {}),
      };
    }
  }
  if (!Object.keys(provenance.held).length) delete provenance.held;
  // Drop files and jobs of takes that no longer ship.
  for (const f of readdirSync(OUT)) if (f.endsWith('.mp3') && !provenance.takes[f.slice(0, -4)]) rmSync(join(OUT, f));
  for (const f of readdirSync(JOBS)) if (!provenance.takes[f.replace(/\.json$/, '')]) rmSync(join(JOBS, f));
  if (Object.values(provenance.takes).some((t) => t.notice)) copyFileSync(notice, join(OUT, NOTICE));
  writeFileSync(PROVENANCE, `${JSON.stringify(provenance, null, 1)}\n`);
  writeFileSync(TABLE, tableSource(provenance));
  const shipped = Object.keys(provenance.takes);
  const total = shipped.reduce((n, r) => n + provenance.takes[r].bytes, 0);
  console.log(`shipped ${shipped.length} (${(total / 1024).toFixed(1)} KB), held ${Object.keys(provenance.held || {}).length}`);
  for (const r of shipped) {
    const t = provenance.takes[r];
    console.log(`  ${r.padEnd(13)} ${t.round.padEnd(9)} ${String(t.bytes).padStart(6)} B  take ${t.lufs} LUFS, recipe ${t.recipeLufs}, gain ${t.gainDb} dB, keys ${t.keys.length}`);
  }
}

function check() {
  const provenance = JSON.parse(readFileSync(PROVENANCE, 'utf8'));
  const problems = [];
  if (readFileSync(TABLE, 'utf8') !== tableSource(provenance)) problems.push('public/js/wavelength-sfx.js is stale');
  const accounted = new Set([...Object.keys(provenance.takes), ...Object.keys(provenance.held || {})]);
  for (const round of CONFIG.rounds) for (const [r] of roundPicks(round)) if (!accounted.has(r)) problems.push(`${round.id} ${r}: picked but neither shipped nor held`);
  for (const [recipe, row] of Object.entries(provenance.takes)) {
    const abs = join(root, 'public', row.file);
    if (!existsSync(abs)) { problems.push(`${row.file} missing`); continue; }
    if (sha256(readFileSync(abs)) !== row.sha256) problems.push(`${row.file}: not the bytes provenance names`);
    if (!existsSync(join(root, row.job))) problems.push(`${recipe}: job ${row.job} missing`);
    else if (jobSources(JSON.parse(readFileSync(join(root, row.job), 'utf8'))).some((id) => !CONFIG.sources[id]?.ship)) problems.push(`${recipe}: plays a source that may not ship`);
  }
  for (const f of readdirSync(OUT)) if (f.endsWith('.mp3') && !provenance.takes[f.slice(0, -4)]) problems.push(`${relative(root, join(OUT, f))}: no provenance row`);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  const size = readdirSync(OUT).reduce((n, f) => n + statSync(join(OUT, f)).size, 0);
  console.log(`wavelength takes ok: ${Object.keys(provenance.takes).length} shipped, ${Object.keys(provenance.held || {}).length} held, ${(size / 1024).toFixed(1)} KB`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) check();
  else await install();
}
