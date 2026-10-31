#!/usr/bin/env node
/**
 * The garden art, rendered from Tiny Speck's own garden SWF (CC0).
 *
 * Source: tinyspeck/glitch-items harvestable_resources/garden/garden_new.swf
 * (the asset the client loaded for every garden: port/GardenManager.as
 * onSWFLoad -> GardenSWFData.garden_mc). Its 53 exported symbols are the plot
 * bases (dry, wet, depleted), seeds, the crop and herb seedlings (dry, wet,
 * fertilized), the harvested patches, every grown crop and herb
 * (garden_<crop>) and the bed frames by style and layout (strip_<rows>_1,
 * shimla_<rows>_1, polcrop_*, polherb_*, polgroddle_*, apartment_2_2).
 * js/garden-view.js puts them together the way GardenView.as and
 * GardenPlotView.as did.
 *
 * 1. tools/garden-art/swf-bounds.mjs reads each symbol's bounds around its
 *    registration point (FFDec's PNG export crops that away).
 * 2. FFDec exports every symbol at zoom 3 (and zoom 1, to score against).
 * 3. Each symbol gets a whole-pixel 1x cell around its bounds; its zoom-3
 *    render goes in at its exact place (top-left at bounds x 3). The small
 *    pieces share two sheets (garden_plots: bases, seeds, seedlings, harvested;
 *    garden_crops: the grown plants); each bed frame is its own file, so a
 *    street only loads the beds it shows. The 1x file is the 3x one
 *    box-downscaled 3:1 (one picture at two densities).
 * 4. Every symbol's zoom-3 render, box-downscaled 3:1 on its own pixel grid,
 *    is scored against FFDec's zoom-1 render (the tools/vector-sprites bars:
 *    sheet mean 0.9, worst frame 0.8, no frame preferring a one-pixel shift).
 * 5. Writes public/assets/sprites/garden/<file>.png and <file>@3x.png|webp,
 *    tools/garden-art/garden.json (provenance, every frame, every file's
 *    sha256), the generated public/js/garden-art.js, and registers the 3x
 *    files in tools/vector-sprites/results.json -> public/js/sprite-hires.js
 *    (first-draw: a sheet turns sharp when it is first drawn on a dense screen).
 *
 * Usage:
 *   node tools/garden-art/build.mjs [--work <dir>] [--swf <garden_new.swf>]
 *   node tools/garden-art/build.mjs --check
 *     no FFDec: every listed file is there with its recorded bytes, each 3x
 *     file is exactly 3x its 1x file, js/garden-art.js and the 3x list are
 *     current, and nothing else sits in assets/sprites/garden.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { symbolBounds } from './swf-bounds.mjs';
import { downscale, readImage, score, writeImage } from '../quoin-art/pixels.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const PUBLIC = join(ROOT, 'public');
const OUT_DIR = 'assets/sprites/garden';
const DATA = join(HERE, 'garden.json');
const MODULE = join(PUBLIC, 'js/garden-art.js');
const RESULTS = join(ROOT, 'tools/vector-sprites/results.json');
const ITEMS = join(os.homedir(), 'Documents/glitch-audit/glitch-items');
export const SWF_PATH = 'harvestable_resources/garden/garden_new.swf';
const JAVA = '/opt/homebrew/opt/openjdk@21/bin/java';
const FFDEC = join(os.homedir(), 'Documents/glitch-audit/tools/ffdec/ffdec.jar');

/** Same bars as tools/vector-sprites (tests/vector-sprites.test.js checks them). */
export const SHEET_MIN = 0.9;
export const FRAME_MIN = 0.8;

/** Other files in assets/sprites/garden that are not this tool's (their own CC0 records). */
export const OTHER_FILES = Object.freeze([
  'bean_garden__x1_1_x1_2_x1_3_x1_4_png_1354836553.png',
  'bean_garden__x1_iconic_png_1354836553.png',
  'garden_new__x1_1_png_1354833270.png',
]);

/** Which file each symbol goes in. */
export function fileFor(name) {
  if (/^garden_/.test(name)) return `${OUT_DIR}/garden_crops.png`;
  if (/^(strip|shimla|polherb|polcrop|polgroddle|apartment)_\d+_\d+$/.test(name)) return `${OUT_DIR}/garden_bed_${name}.png`;
  if (/^(dry|wet|depleted|seeds|(herb_)?seedling_(dry|wet|fertilized)|harvested_(dry|wet))$/.test(name)) return `${OUT_DIR}/garden_plots.png`;
  return null;
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const gitBlob = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const imageSize = (file) => {
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', `${file}[0]`], { encoding: 'utf8' }).trim().split(' ').map(Number);
  return { w, h };
};

/** js/garden-art.js from garden.json. */
export function moduleText(data) {
  const rows = Object.entries(data.frames)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, f]) => `  ${name}: ${JSON.stringify(f).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')},`)
    .join('\n');
  return `/**
 * Tiny Speck's garden art (garden_new.swf, CC0 tinyspeck/glitch-items ${data.source.commit.slice(0, 7)}),
 * generated by tools/garden-art/build.mjs; do not edit by hand. js/garden-view.js
 * puts the pieces together.
 *
 * Each symbol: url (the 1x file; js/sprite-hires.js has its @3x), x, y, w, h (its
 * whole-pixel cell there), ox, oy (where that cell's top-left sits from the
 * symbol's registration point), x0, y0, w0, h0 (the symbol's exact bounds
 * around that point, as GardenView.as measured them).
 */
export const GARDEN_ART = Object.freeze({
${rows}
});
`;
}

/** Shelf-pack cells ({ name, cw, ch }) into a sheet at most maxW wide, 1 px apart. */
export function pack(cells, maxW = 512) {
  const sorted = [...cells].sort((a, b) => b.ch - a.ch || a.name.localeCompare(b.name));
  let x = 0, y = 0, rowH = 0, w = 0;
  for (const c of sorted) {
    if (x > 0 && x + c.cw > maxW) { y += rowH + 1; x = 0; rowH = 0; }
    c.x = x; c.y = y;
    x += c.cw + 1;
    rowH = Math.max(rowH, c.ch);
    w = Math.max(w, c.x + c.cw);
  }
  return { w, h: y + rowH };
}

function ffdecExport(swf, zoom, out) {
  if (existsSync(join(out, '.done'))) return;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  console.log(`ffdec: ${relative(ITEMS, swf)} @${zoom}x`);
  execFileSync(JAVA, ['-Djava.awt.headless=true', '-Xmx2g', '-jar', FFDEC, '-zoom', String(zoom), '-format', 'sprite:png', '-export', 'sprite', out, swf], { stdio: 'ignore' });
  writeFileSync(join(out, '.done'), '');
}

function renders(dir) {
  const map = new Map();
  for (const d of readdirSync(dir)) {
    const m = /^DefineSprite_(\d+)/.exec(d);
    if (m) map.set(Number(m[1]), join(dir, d, '1.png'));
  }
  return map;
}

function paste(dst, src, x0, y0) {
  for (let y = 0; y < src.h; y++) {
    const dy = y0 + y;
    if (dy < 0 || dy >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const dx = x0 + x;
      if (dx < 0 || dx >= dst.w) continue;
      const s = (y * src.w + x) * 4, d = (dy * dst.w + dx) * 4;
      for (let k = 0; k < 4; k++) dst.p[d + k] = src.p[s + k];
    }
  }
}

const blank = (w, h) => ({ w, h, p: new Float32Array(w * h * 4) });

function shifted(img, dx, dy) {
  const out = blank(img.w, img.h);
  paste(out, img, dx, dy);
  return out;
}

function writePng(img, file) {
  writeImage(img, file);
  execFileSync('magick', [file, '-strip', '-define', 'png:compression-level=9', '-define', 'png:exclude-chunks=date,time', file]);
}

/** <stem>@3x.png or .webp (lossless, when clearly smaller). Returns the public path. */
function writeHires(img, stem) {
  const tmp = `${stem}.tmp@3x`;
  writePng(img, `${tmp}.png`);
  execFileSync('cwebp', ['-quiet', '-lossless', '-exact', '-z', '9', `${tmp}.png`, '-o', `${tmp}.webp`]);
  const webp = statSync(`${tmp}.webp`).size < statSync(`${tmp}.png`).size * 0.9;
  for (const ext of ['png', 'webp']) if (existsSync(`${stem}@3x.${ext}`)) unlinkSync(`${stem}@3x.${ext}`);
  const file = `${stem}@3x.${webp ? 'webp' : 'png'}`;
  renameSync(`${tmp}.${webp ? 'webp' : 'png'}`, file);
  unlinkSync(`${tmp}.${webp ? 'png' : 'webp'}`);
  return relative(PUBLIC, file);
}

async function build(args) {
  const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const swf = resolve(opt('swf', join(ITEMS, SWF_PATH)));
  const work = resolve(opt('work', join(os.tmpdir(), 'garden-art')));
  const blob = gitBlob(readFileSync(swf));
  let commit = '';
  try {
    commit = execFileSync('git', ['-C', dirname(swf), 'log', '-1', '--format=%H', '--', swf], { encoding: 'utf8' }).trim();
  } catch { /* not a checkout */ }
  const bounds = symbolBounds(swf);
  const unplaced = Object.keys(bounds).filter((n) => !fileFor(n));
  if (unplaced.length) throw new Error(`symbols with no file: ${unplaced.join(', ')}`);
  ffdecExport(swf, 3, join(work, `${blob}-z3`));
  ffdecExport(swf, 1, join(work, `${blob}-z1`));
  const r3 = renders(join(work, `${blob}-z3`));
  const r1 = renders(join(work, `${blob}-z1`));

  // Cells: whole 1x pixels around each symbol's bounds, its 3x render at its exact spot.
  const groups = new Map();
  for (const [name, b] of Object.entries(bounds)) {
    const img = readImage(r3.get(b.id));
    const want = { w: Math.ceil(b.w * 3 - 1e-6), h: Math.ceil(b.h * 3 - 1e-6) };
    if (Math.abs(img.w - want.w) > 1 || Math.abs(img.h - want.h) > 1) throw new Error(`${name}: render ${img.w}x${img.h}, bounds say ${want.w}x${want.h}`);
    const ox = Math.floor(b.x), oy = Math.floor(b.y);
    const px = Math.round(b.x * 3) - ox * 3, py = Math.round(b.y * 3) - oy * 3;
    const cw = Math.max(Math.ceil(b.x + b.w) - ox, Math.ceil((px + img.w) / 3));
    const ch = Math.max(Math.ceil(b.y + b.h) - oy, Math.ceil((py + img.h) / 3));
    const file = fileFor(name);
    if (!groups.has(file)) groups.set(file, []);
    groups.get(file).push({ name, b, img, ox, oy, px, py, cw, ch });
  }

  const data = {
    about: 'Tiny Speck garden art (CC0 1.0), rendered by tools/garden-art/build.mjs; js/garden-view.js composes it as GardenView.as and GardenPlotView.as did.',
    source: { repo: 'tinyspeck/glitch-items', path: SWF_PATH, commit, blob, licence: 'CC0 1.0', ffdec: 'sprite:png, zoom 3 (scored against zoom 1)' },
    files: {},
    frames: {},
  };
  const results = JSON.parse(readFileSync(RESULTS, 'utf8'));
  let bad = 0;
  for (const [file, cells] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const size = cells.length === 1 ? (cells[0].x = 0, cells[0].y = 0, { w: cells[0].cw, h: cells[0].ch }) : pack(cells);
    const three = blank(size.w * 3, size.h * 3);
    for (const c of cells) paste(three, c.img, c.x * 3 + c.px, c.y * 3 + c.py);
    const one = downscale(three, 3);
    const frameScores = [];
    const drift = [];
    for (const c of [...cells].sort((a, b) => a.name.localeCompare(b.name))) {
      // FFDec's own zoom-1 render against the zoom-3 render box-downscaled on the same
      // pixel grid (both start at the symbol's top-left): the 3x file is the same art.
      // Where it goes in the cell is exact by construction (bounds x 3, rounded).
      const ref = readImage(r1.get(c.b.id));
      const padded = blank(ref.w * 3, ref.h * 3);
      paste(padded, c.img, 0, 0);
      const mine = downscale(padded, 3);
      const s = score(ref, mine);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const t = score(ref, shifted(mine, dx, dy));
        if (t > s + 0.01) drift.push({ name: c.name, dx, dy, s: +t.toFixed(4) });
      }
      frameScores.push(+s.toFixed(4));
      data.frames[c.name] = {
        url: file, x: c.x, y: c.y, w: c.cw, h: c.ch, ox: c.ox, oy: c.oy,
        x0: c.b.x, y0: c.b.y, w0: c.b.w, h0: c.b.h,
      };
    }
    const mean = +(frameScores.reduce((a, b) => a + b, 0) / frameScores.length).toFixed(4);
    const minFrame = Math.min(...frameScores);
    console.log(`${file.padEnd(52)} ${String(cells.length).padStart(2)} cells  ${size.w}x${size.h}  mean ${mean.toFixed(4)}  worst ${minFrame.toFixed(4)}  drift ${drift.length}`);
    if (mean < SHEET_MIN || minFrame < FRAME_MIN || drift.length) {
      console.error(`refused: ${file} ${JSON.stringify(drift)}`);
      bad += 1;
      continue;
    }
    const abs = join(PUBLIC, file);
    writePng(one, abs);
    const hires = writeHires(three, abs.replace(/\.png$/, ''));
    data.files[file] = {
      hires, w: size.w, h: size.h, cells: cells.length,
      sha256: sha256(abs), sha256_3: sha256(join(PUBLIC, hires)),
      score: mean, minFrame, frameScores,
    };
    results[file] = {
      animal: 'garden-art',
      character: 'garden-art',
      source: 'tools/garden-art',
      swf: SWF_PATH,
      status: 'ok',
      hires,
      bytes: statSync(join(PUBLIC, hires)).size,
      cells: cells.length,
      fw: size.w,
      fh: size.h,
      scoreKind: 'each symbol: the zoom-3 render box-downscaled 3:1 vs FFDec zoom 1',
      score: mean,
      minFrame,
      drift: [],
      firstDraw: true,
      frameScores,
    };
  }
  if (bad) {
    process.exitCode = 1;
    return;
  }
  // Retired: the drawn plot dishes and wooden bed (G316 stand-ins) and the root-frame seedling.
  for (const old of ['plot_dry.png', 'plot_wet.png', 'plot_dirty.png', 'bed_frame_wood.png', 'bed_frame_wood@3x.png', 'plot_seedling.png', 'plot_seedling@3x.webp']) {
    const p = join(PUBLIC, OUT_DIR, old);
    if (existsSync(p)) unlinkSync(p);
    delete results[`${OUT_DIR}/${old}`];
  }
  writeFileSync(DATA, `${JSON.stringify(data, null, 1)}\n`);
  writeFileSync(MODULE, moduleText(data));
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  const { writeModule } = await import('../vector-sprites/build.mjs');
  writeModule(results);
  console.log(`wrote ${Object.keys(data.files).length} files, ${Object.keys(data.frames).length} frames; registered in tools/vector-sprites/results.json and js/sprite-hires.js`);
}

/** --check: the problems, [] when the shipped garden art matches garden.json. */
export async function check() {
  const bad = [];
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const results = JSON.parse(readFileSync(RESULTS, 'utf8'));
  if (data.source.repo !== 'tinyspeck/glitch-items' || data.source.licence !== 'CC0 1.0' || data.source.path !== SWF_PATH) bad.push('garden.json: source is not the CC0 glitch-items garden SWF');
  for (const [file, f] of Object.entries(data.files)) {
    const one = join(PUBLIC, file), three = join(PUBLIC, f.hires);
    if (!existsSync(one) || !existsSync(three)) { bad.push(`${file}: missing`); continue; }
    if (sha256(one) !== f.sha256) bad.push(`${file}: bytes differ from garden.json`);
    if (sha256(three) !== f.sha256_3) bad.push(`${f.hires}: bytes differ from garden.json`);
    const a = imageSize(one), b = imageSize(three);
    if (a.w !== f.w || a.h !== f.h) bad.push(`${file}: ${a.w}x${a.h}, garden.json ${f.w}x${f.h}`);
    if (b.w !== a.w * 3 || b.h !== a.h * 3) bad.push(`${f.hires}: not 3x ${file}`);
    if (f.score < SHEET_MIN || f.minFrame < FRAME_MIN) bad.push(`${file}: under the bars`);
    const r = results[file];
    if (r?.status !== 'ok' || r.hires !== f.hires || r.source !== 'tools/garden-art' || !r.firstDraw) bad.push(`${file}: not registered in tools/vector-sprites/results.json`);
  }
  for (const [name, fr] of Object.entries(data.frames)) {
    const f = data.files[fr.url];
    if (!f) { bad.push(`${name}: ${fr.url} not built`); continue; }
    if (fr.x < 0 || fr.y < 0 || fr.x + fr.w > f.w || fr.y + fr.h > f.h) bad.push(`${name}: cell outside ${fr.url}`);
    if (fileFor(name) !== fr.url) bad.push(`${name}: in ${fr.url}, belongs in ${fileFor(name)}`);
  }
  for (const path of Object.keys(results)) {
    if (path.startsWith(`${OUT_DIR}/`) && results[path].source === 'tools/garden-art' && !data.files[path]) bad.push(`${path}: stale result`);
  }
  const listed = new Set(OTHER_FILES);
  for (const [file, f] of Object.entries(data.files)) { listed.add(file.split('/').pop()); listed.add(f.hires.split('/').pop()); }
  for (const name of readdirSync(join(PUBLIC, OUT_DIR))) if (!listed.has(name)) bad.push(`${OUT_DIR}/${name}: not garden.json's and not listed`);
  if (!existsSync(MODULE) || readFileSync(MODULE, 'utf8') !== moduleText(data)) bad.push('public/js/garden-art.js is stale');
  const { moduleText: hiresText } = await import('../vector-sprites/build.mjs');
  if (readFileSync(join(PUBLIC, 'js/sprite-hires.js'), 'utf8') !== hiresText(results)) bad.push('public/js/sprite-hires.js is stale');
  return bad;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const bad = await check();
    for (const b of bad) console.log(`stale: ${b}`);
    console.log(bad.length ? `${bad.length} problem(s)` : 'tools/garden-art: ok');
    process.exitCode = bad.length ? 1 : 0;
  } else {
    await build(args);
  }
}
