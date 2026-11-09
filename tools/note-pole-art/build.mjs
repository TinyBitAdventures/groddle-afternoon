#!/usr/bin/env node
/**
 * The Note Pole's parts (lane HOMES3, register G332): the CC0 note_pole.swf
 * (tinyspeck/glitch-items misc/note_pole) builds a pole from three exported
 * symbols its config picks (note_pole.as initializehead): pole<Size>_<n> in
 * poleContainer_mc, sign_<n> in signContainer_mc and, while a note is
 * posted, signNote_<n> in noteContainer_mc; the sign and the note sit at y 8
 * (Tall), 64 (Medium) or 129 (Short). The server's choices are poles 1-10,
 * signs 1-9 (items/note_pole.js instancePropsChoices).
 *
 * FFDec exports each symbol at zoom 3 as PNG (its own renderer, as the 2x
 * art was) and as SVG (where its registration point sits), and
 * tools/vector-sprites/aligned-art.mjs crops the PNG to what is drawn on the
 * 1x grid (some symbols carry wide empty bounds) and writes the pair: the 1x
 * (the 3:1 box downscale) and <symbol>@3x.webp. Each pair is registered in
 * tools/vector-sprites/results.json (source tools/note-pole-art), so
 * js/sprite-hires.js draws the 3x on dense screens (the pole is drawn at
 * world scale 1, about 2.5 device px per 1x px on a Retina window, where the
 * 2x art these replace was magnified 1.26). The containers' offsets come
 * from the main timeline's frame.
 *
 * Output:
 *   public/assets/sprites/note-pole/<symbol>.webp   1x (+ <symbol>@3x.webp)
 *   public/js/note-pole-art.js (generated: parts [file, left, top, w, h] at 1x
 *   from the symbol's registration point; containers; the sign's y per size)
 *
 * Usage: node tools/note-pole-art/build.mjs [--work <dir>] [--check]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { FFDEC, JAVA } from '../vector-sprites/swf-labels.mjs';
import { ZOOM, checkPairs, cutPair, registerPairs, svgFrame, writePair } from '../vector-sprites/aligned-art.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SWF = join(os.homedir(), 'Documents/glitch-audit/glitch-items/misc/note_pole/note_pole.swf');
const OUT_DIR = join(ROOT, 'public/assets/sprites/note-pole');
const OUT_JS = join(ROOT, 'public/js/note-pole-art.js');
const PUB = join(ROOT, 'public');
const REL_DIR = 'assets/sprites/note-pole';
const RESULTS = join(ROOT, 'tools/vector-sprites/results.json');
const SOURCE = 'tools/note-pole-art';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const WORK = opt('--work', join(os.tmpdir(), 'note-pole-art-work-3x'));
const CHECK = args.includes('--check');
/** items/note_pole.js instancePropsChoices 33-38. */
export const SIZES = ['Tall', 'Medium', 'Short'];
export const POLES = 10;
export const SIGNS = 9;
/** note_pole.as initializehead: signContainer_mc.y and noteContainer_mc.y per size. */
const SIGN_Y = { Tall: 8, Medium: 64, Short: 129 };

const NAMES = [
  ...SIZES.flatMap((s) => Array.from({ length: POLES }, (_, i) => `pole${s}_${i + 1}`)),
  ...Array.from({ length: SIGNS }, (_, i) => `sign_${i + 1}`),
  ...Array.from({ length: SIGNS }, (_, i) => `signNote_${i + 1}`),
];

function ffdec(argv) {
  execFileSync(JAVA, ['-jar', FFDEC, ...argv], { stdio: 'ignore', timeout: 600000 });
}

function symbolIds() {
  const dir = join(WORK, 'sym');
  if (!existsSync(join(dir, 'symbols.csv'))) {
    mkdirSync(dir, { recursive: true });
    ffdec(['-export', 'symbolClass', dir, SWF]);
  }
  const ids = new Map();
  for (const line of readFileSync(join(dir, 'symbols.csv'), 'utf8').split('\n')) {
    const m = /^(\d+);"(.*)"$/.exec(line.trim());
    if (m) ids.set(m[2], Number(m[1]));
  }
  return ids;
}

/** The main timeline's containers: their x, y inside mainContainer_mc. */
function containers() {
  const dir = join(WORK, 'frame');
  if (!existsSync(join(dir, '1.svg'))) {
    mkdirSync(dir, { recursive: true });
    ffdec(['-format', 'frame:svg', '-select', '1', '-export', 'frame', dir, SWF]);
  }
  const text = readFileSync(join(dir, '1.svg'), 'utf8');
  const at = (id) => {
    const m = new RegExp(`id="${id}" transform="matrix\\(([^)]*)\\)"`).exec(text);
    if (!m) throw new Error(`${id} not in the main frame`);
    const v = m[1].split(',').map(Number);
    return [v[4], v[5]];
  };
  return { pole: at('poleContainer_mc'), sign: at('signContainer_mc'), note: at('noteContainer_mc') };
}

function exported(kind, id, name) {
  const dir = join(WORK, kind, `DefineSprite_${id}_${name}`);
  const file = existsSync(dir) ? readdirSync(dir).find((f) => f.startsWith('1.')) : null;
  return file ? join(dir, file) : null;
}

mkdirSync(WORK, { recursive: true });
const ids = symbolIds();
const want = NAMES.map((n) => {
  if (!ids.has(n)) throw new Error(`${n} is not an exported symbol of ${SWF}`);
  return [n, ids.get(n)];
});
const missing = (kind) => want.filter(([n, id]) => !exported(kind, id, n)).map(([, id]) => id);
let todo = missing('svg3');
if (todo.length) ffdec(['-format', 'sprite:svg', '-zoom', String(ZOOM), '-selectid', todo.join(','), '-export', 'sprite', join(WORK, 'svg3'), SWF]);
todo = missing('png3');
if (todo.length) ffdec(['-format', 'sprite:png', '-zoom', String(ZOOM), '-selectid', todo.join(','), '-export', 'sprite', join(WORK, 'png3'), SWF]);

const pending = [];
for (const [name, id] of want) {
  // The PNG and the SVG export share one canvas; the SVG says where the registration point is.
  const f = svgFrame(readFileSync(exported('svg3', id, name), 'utf8'));
  pending.push({ name, png: exported('png3', id, name), rx: f.tx, ry: f.ty });
}

if (!CHECK) mkdirSync(OUT_DIR, { recursive: true });
const parts = {};
const rows = [];
for (const p of pending) {
  const cut = cutPair(p.png, 8);
  if (!cut) throw new Error(`${p.name}: empty`);
  const file = `${p.name}.webp`;
  // Top-left of the drawn art from the symbol's registration point, and its size (1x).
  parts[p.name] = [file, +(cut.x - p.rx / ZOOM).toFixed(2), +(cut.y - p.ry / ZOOM).toFixed(2), cut.w, cut.h];
  rows.push({ path: `${REL_DIR}/${file}`, hires: `${REL_DIR}/${p.name}@3x.webp`, w: cut.w, h: cut.h, swf: 'misc/note_pole/note_pole.swf' });
  if (!CHECK) writePair(cut, join(OUT_DIR, file));
}
await writePair.flush();

const js = [
  '/**',
  ' * GENERATED by tools/note-pole-art/build.mjs. Do not edit.',
  ' *',
  ' * The Note Pole\'s parts from tinyspeck/glitch-items misc/note_pole (CC0):',
  ' * parts are [file, left, top, w, h] at 1x, left/top from the symbol\'s',
  ' * registration point; the 1x WebP is in assets/sprites/note-pole (its 3x twin',
  ' * <symbol>@3x.webp in js/sprite-hires.js). containers',
  ' * are each part\'s container x, y in mainContainer_mc; signY the sign\'s and',
  ' * the note\'s y per size (note_pole.as initializehead).',
  ' */',
  `export const NOTE_POLE_CONTAINERS = Object.freeze(${JSON.stringify(containers())});`,
  `export const NOTE_POLE_SIGN_Y = Object.freeze(${JSON.stringify(SIGN_Y)});`,
  'export const NOTE_POLE_PARTS = Object.freeze({',
  ...Object.entries(parts).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`),
  '});',
  '',
].join('\n');

const results = JSON.parse(readFileSync(RESULTS, 'utf8'));
const keep = new Set(rows.flatMap((r) => [r.path.split('/').pop(), r.hires.split('/').pop()]));
if (CHECK) {
  const have = existsSync(OUT_JS) ? readFileSync(OUT_JS, 'utf8') : '';
  const { HIRES_SPRITES } = await import('../../public/js/sprite-hires.js?v=ac5f0e68');
  const bad = checkPairs(results, SOURCE, rows.map((r) => r.path), PUB, HIRES_SPRITES);
  for (const r of rows) if (results[r.path] && results[r.path].hires !== r.hires) bad.push(`${r.path}: results name ${results[r.path].hires}`);
  for (const f of readdirSync(OUT_DIR)) if (!keep.has(f)) bad.push(`${REL_DIR}/${f}: not built here`);
  if (have !== js) bad.push('note-pole-art.js');
  if (bad.length) {
    for (const b of bad) console.error(`stale: ${b}`);
    console.error('note pole art is stale: run node tools/note-pole-art/build.mjs');
    process.exit(1);
  }
  process.exit(0);
}
writeFileSync(OUT_JS, js);
for (const f of readdirSync(OUT_DIR)) if (!keep.has(f)) unlinkSync(join(OUT_DIR, f));
registerPairs(results, SOURCE, rows, PUB);
writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
const { writeModule } = await import('../vector-sprites/build.mjs');
writeModule(results);
let one = 0, three = 0;
for (const r of rows) {
  one += statSync(join(PUB, r.path)).size;
  three += statSync(join(PUB, r.hires)).size;
}
console.log(`note pole art: ${Object.keys(parts).length} parts in ${OUT_DIR} (1x ${(one / 1024).toFixed(0)} KB, 3x ${(three / 1024).toFixed(0)} KB) and their js/sprite-hires.js rows`);
