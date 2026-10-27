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
 * FFDec exports each symbol at zoom 2 as PNG (the pixels, cropped to what is
 * drawn: some symbols carry wide empty bounds) and as SVG (where its
 * registration point sits); cwebp encodes the crops. The
 * containers' offsets come from the main timeline's frame.
 *
 * Output:
 *   public/assets/sprites/note-pole/<symbol>.webp   2x
 *   public/js/note-pole-art.js (generated: parts [file, left, top, w, h] at 1x
 *   from the symbol's registration point; containers; the sign's y per size)
 *
 * Usage: node tools/note-pole-art/build.mjs [--work <dir>] [--check]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { FFDEC, JAVA } from '../vector-sprites/swf-labels.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SWF = join(os.homedir(), 'Documents/glitch-audit/glitch-items/misc/note_pole/note_pole.swf');
const OUT_DIR = join(ROOT, 'public/assets/sprites/note-pole');
const OUT_JS = join(ROOT, 'public/js/note-pole-art.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const WORK = opt('--work', join(os.tmpdir(), 'note-pole-art-work'));
const CHECK = args.includes('--check');
const ZOOM = 2;
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

/** Where a symbol's own origin sits in its exported box: the outer g's translate. */
function svgBox(file) {
  const text = readFileSync(file, 'utf8');
  const head = /<svg[^>]*>/.exec(text)[0];
  const w = Number(/width="([\d.]+)px"/.exec(head)[1]);
  const h = Number(/height="([\d.]+)px"/.exec(head)[1]);
  const g = /<g transform="matrix\(([^)]*)\)"/.exec(text);
  const v = g ? g[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0];
  return { w, h, rx: v[4], ry: v[5] };
}

/** The drawn pixels' box in a PNG (alpha above a few levels): the export pads to the symbol's full bounds. */
function drawnBox(png) {
  const out = execFileSync('magick', [png, '-channel', 'A', '-threshold', '3%', '+channel', '-format', '%@', 'info:'], { encoding: 'utf8' }).trim();
  const m = /^(\d+)x(\d+)\+(\d+)\+(\d+)$/.exec(out);
  if (!m) throw new Error(`${png}: empty`);
  const [, w, h, x, y] = m.map(Number);
  return { w, h, x, y };
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
let todo = missing('svg');
if (todo.length) ffdec(['-format', 'sprite:svg', '-selectid', todo.join(','), '-export', 'sprite', join(WORK, 'svg'), SWF]);
todo = missing('png');
if (todo.length) ffdec(['-format', 'sprite:png', '-zoom', String(ZOOM), '-selectid', todo.join(','), '-export', 'sprite', join(WORK, 'png'), SWF]);

if (!CHECK) mkdirSync(OUT_DIR, { recursive: true });
const parts = {};
for (const [name, id] of want) {
  const box = svgBox(exported('svg', id, name));
  const png = exported('png', id, name);
  const drawn = drawnBox(png);
  const file = `${name}.webp`;
  // Top-left of the drawn art from the symbol's registration point, and its size (1x).
  parts[name] = [file, +(drawn.x / ZOOM - box.rx).toFixed(2), +(drawn.y / ZOOM - box.ry).toFixed(2), drawn.w / ZOOM, drawn.h / ZOOM];
  if (CHECK) continue;
  const crop = join(WORK, `${name}.crop.png`);
  execFileSync('magick', [png, '-crop', `${drawn.w}x${drawn.h}+${drawn.x}+${drawn.y}`, '+repage', crop]);
  execFileSync('cwebp', ['-quiet', '-metadata', 'none', '-q', '90', '-m', '6', '-sharp_yuv', '-alpha_q', '100', crop, '-o', join(OUT_DIR, file)]);
}

const js = [
  '/**',
  ' * GENERATED by tools/note-pole-art/build.mjs. Do not edit.',
  ' *',
  ' * The Note Pole\'s parts from tinyspeck/glitch-items misc/note_pole (CC0):',
  ' * parts are [file, left, top, w, h] at 1x, left/top from the symbol\'s',
  ' * registration point; the 2x WebP is in assets/sprites/note-pole. containers',
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

if (CHECK) {
  const have = existsSync(OUT_JS) ? readFileSync(OUT_JS, 'utf8') : '';
  const lost = Object.values(parts).filter(([file]) => !existsSync(join(OUT_DIR, file)));
  if (have !== js || lost.length) {
    console.error(`note pole art is stale${lost.length ? ` (${lost.length} files missing)` : ''}: run node tools/note-pole-art/build.mjs`);
    process.exit(1);
  }
  process.exit(0);
}
writeFileSync(OUT_JS, js);
console.log(`note pole art: ${Object.keys(parts).length} parts in ${OUT_DIR}`);
