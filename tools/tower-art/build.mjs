#!/usr/bin/env node
/**
 * Tower exterior articles: every variant of every chassis part, from the six
 * CC0 tower chassis SWFs in tinyspeck/glitch-items (furniture_base and
 * furniture_tower_chassis), plus the three scaffolding stages of
 * misc/proto/proto_furniture_tower_chassis.swf, each as a 1x WebP and its
 * sharp 3x twin with their registration points.
 *
 * The client's chassis (furniture_tower_chassis*.as initializehead) attaches
 * exported symbols by class name: floor_ground_<n> and door_<n> (the door
 * follows the ground floor), floor_top_<n>, extra_floor_<n> for floors 1-7,
 * deco_ground_<n> and deco_side_<n>. Each .as lists the choices in
 * config_options; this reads those lists, finds each symbol's character id
 * (FFDec symbolClass), exports it as SVG at zoom 3 (FFDec), pads the canvas so
 * glow/shadow filters are not clipped, rasterises in Chromium
 * (vector-sprites/svg-raster.mjs, which keeps blend modes), trims the
 * transparent border on the 1x grid and writes the pair
 * (vector-sprites/aligned-art.mjs: <name>.webp at 1x, the 3:1 box downscale,
 * and <name>@3x.webp, lossy q 88 with lossless alpha). Empty symbols (base
 * deco_ground_1 is "no deco") and invisible ones (the door hit areas) are
 * recorded as null and not written. The proto's stages keep its whole
 * 344 x 204 stage (the scene "1" is state 1: frames 3, 2, 1), drawn by FFDec's
 * PNG renderer (their layer-blended shadows).
 *
 * Every pair is registered in tools/vector-sprites/results.json (source
 * tools/tower-art), so js/sprite-hires.js loads the 3x file instead of the 1x
 * wherever the 1x URL is drawn on a dense screen (a Retina window draws the
 * Tower at about 2.5 device px per world px: the 2x art it replaces was
 * magnified 1.26).
 *
 * Output:
 *   public/assets/sprites/home-tower/<style>_<part>_<n>.webp (+ @3x.webp)
 *   public/assets/sprites/home-tower/proto_<state>.webp (+ @3x.webp)
 *   public/js/home-tower-art.js  (generated: choices + [file, originX, originY, w, h] at 1x)
 *
 * Usage: node tools/tower-art/build.mjs [--work <dir>] [--check]
 *   --work   FFDec / raster cache (default $TMPDIR/tower-art-work-3x)
 *   --check  exit 1 if the generated module or the 3x registration would change (no writes)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { FFDEC, JAVA } from '../vector-sprites/swf-labels.mjs';
import { symbolClasses } from '../vector-sprites/swf-parts.mjs';
import { rasteriseSvgs } from '../vector-sprites/svg-raster.mjs';
import { ZOOM, checkPairs, cutPair, padSvg, registerPairs, writePair } from '../vector-sprites/aligned-art.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ITEMS = join(os.homedir(), 'Documents/glitch-audit/glitch-items/furniture');
const OUT_DIR = join(ROOT, 'public/assets/sprites/home-tower');
const OUT_JS = join(ROOT, 'public/js/home-tower-art.js');
const PUB = join(ROOT, 'public');
const REL_DIR = 'assets/sprites/home-tower';
const RESULTS = join(ROOT, 'tools/vector-sprites/results.json');
const SOURCE = 'tools/tower-art';
const PROTO_SWF = join(os.homedir(), 'Documents/glitch-audit/glitch-items/misc/proto/proto_furniture_tower_chassis/proto_furniture_tower_chassis.swf');
/** js/home-tower.js PROTO_ART: state n is the scene named n (DefineSceneAndFrameLabelData: frames 1-3 are scenes 3, 2, 1). */
const PROTO_FRAMES = { 1: 3, 2: 2, 3: 1 };
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const WORK = opt('--work', join(os.tmpdir(), 'tower-art-work-3x'));
const CHECK = args.includes('--check');

/** Remake style id -> chassis SWF/AS (catalog_furniture.js add_furniture_29 swf urls). */
const STYLES = {
  base: 'furniture_base/furniture_tower_chassis/furniture_tower_chassis',
  tree: 'furniture_tower_chassis/furniture_tower_chassis_tree_tower',
  quarry: 'furniture_tower_chassis/furniture_tower_chassis_rock_tower',
  mushroom: 'furniture_tower_chassis/furniture_tower_chassis_mushroom_tower',
  spaceship: 'furniture_tower_chassis/furniture_tower_chassis_spaceship_tower',
  adobe: 'furniture_tower_chassis/furniture_tower_chassis_basic_tower',
};
/** config_options key -> symbol prefix (floor_1..7 all use extra_floor_<n>). */
const PARTS = { floor_ground: 'floor_ground', floor_top: 'floor_top', floor_1: 'extra_floor', deco_ground: 'deco_ground', deco_side: 'deco_side' };
const PAD = 20; // 1x px of room for filters around FFDec's shape bounds
const ALPHA_MIN = 8; // a pixel counts as drawn above this alpha (0-255)

/** config_options from the .as frame script: { key: count }. */
function configCounts(asFile) {
  const src = readFileSync(asFile, 'utf8').replace(/\s+/g, ' ');
  const m = /config_options = \{([^}]*)\}/.exec(src);
  if (!m) throw new Error(`no config_options in ${asFile}`);
  const out = {};
  for (const row of m[1].matchAll(/(\w+): \[([^\]]*)\]/g)) out[row[1]] = row[2].split(',').filter((s) => s.trim()).length;
  return out;
}

function exportSvgs(swf, ids, dir) {
  const done = join(dir, '.done');
  if (existsSync(done)) return;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  console.log(`  ffdec: ${swf.split('/').pop()} (${ids.length} sprites)`);
  execFileSync(JAVA, ['-jar', FFDEC, '-zoom', String(ZOOM), '-selectid', ids.join(','), '-format', 'sprite:svg', '-export', 'sprite', dir, swf], { stdio: 'ignore' });
  writeFileSync(done, '');
}

const art = {};
const counts = {};
const files = [];
const jobs = [];
const pending = [];
for (const [style, base] of Object.entries(STYLES)) {
  const swf = join(ITEMS, `${base}.swf`);
  const cfg = configCounts(join(ITEMS, `${base}.as`));
  const sym = symbolClasses(swf);
  counts[style] = { floor_ground: cfg.floor_ground, floor_top: cfg.floor_top, extra_floor: cfg.floor_1, deco_ground: cfg.deco_ground, deco_side: cfg.deco_side };
  const want = [];
  for (const [key, prefix] of Object.entries(PARTS)) {
    for (let n = 1; n <= cfg[key]; n += 1) want.push(`${prefix}_${n}`);
    if (key === 'floor_ground') for (let n = 1; n <= cfg[key]; n += 1) want.push(`door_${n}`);
  }
  const missing = want.filter((s) => !sym.has(s));
  if (missing.length) throw new Error(`${style}: symbols missing ${missing.join(' ')}`);
  const dir = join(WORK, style);
  exportSvgs(swf, want.map((s) => sym.get(s)), dir);
  const subs = readdirSync(dir);
  art[style] = {};
  for (const name of want) {
    const id = sym.get(name);
    const sub = subs.find((d) => d === `DefineSprite_${id}` || d.startsWith(`DefineSprite_${id}_`));
    if (!sub) throw new Error(`${style}: no export for ${name} (${id})`);
    const text = readFileSync(join(dir, sub, '1.svg'), 'utf8');
    const part = name.replace(/_\d+$/, '');
    const n = Number(name.split('_').pop());
    (art[style][part] ||= [])[n - 1] = null;
    if (!/width="[1-9][\d.]*px"/.test(text) || !/height="[1-9][\d.]*px"/.test(text)) continue;
    // Pad the canvas so blurred glows and drop shadows are not clipped.
    const padded = padSvg(text, PAD);
    const svg = join(dir, `${name}.pad.svg`);
    const png = join(dir, `${name}.png`);
    if (!existsSync(svg) || readFileSync(svg, 'utf8') !== padded.text) writeFileSync(svg, padded.text);
    if (!existsSync(png) || statSync(png).mtimeMs < statSync(svg).mtimeMs - 1000) jobs.push({ svg, png });
    pending.push({ style, part, n, png, rx: padded.rx, ry: padded.ry });
  }
}

// The scaffolding: the proto's three stages on its whole stage (not trimmed). FFDec's own PNG
// renderer draws them: their shadows sit in `layer` clips with alpha-blended children, which the
// SVG export drops (opaque black in Chromium).
const protoDir = join(WORK, 'proto-png');
if (!existsSync(join(protoDir, '.done'))) {
  rmSync(protoDir, { recursive: true, force: true });
  mkdirSync(protoDir, { recursive: true });
  execFileSync(JAVA, ['-jar', FFDEC, '-zoom', String(ZOOM), '-ignorebackground', '-format', 'frame:png', '-export', 'frame', protoDir, PROTO_SWF], { stdio: 'ignore' });
  writeFileSync(join(protoDir, '.done'), '');
}
const protos = [];
for (const [state, frame] of Object.entries(PROTO_FRAMES)) {
  const png = join(protoDir, `${frame}.png`);
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', png], { encoding: 'utf8' }).trim().split(' ').map(Number);
  protos.push({ state, png, w: Math.ceil(w / ZOOM), h: Math.ceil(h / ZOOM) });
}

if (jobs.length) {
  console.log(`  raster: ${jobs.length} svgs`);
  await rasteriseSvgs(jobs);
}

if (!CHECK) mkdirSync(OUT_DIR, { recursive: true });
const rows = [];
const pair = (file, cut, swf) => {
  const hires = `${REL_DIR}/${file.replace(/\.webp$/, '@3x.webp')}`;
  rows.push({ path: `${REL_DIR}/${file}`, hires, w: cut.w, h: cut.h, swf });
  if (!CHECK) writePair(cut, join(OUT_DIR, file));
};
for (const p of pending) {
  const cut = cutPair(p.png, ALPHA_MIN);
  if (!cut) continue;
  const file = `${p.style}_${p.part}_${p.n}.webp`;
  // 1x registration point inside the trimmed image, and the 1x size.
  art[p.style][p.part][p.n - 1] = [file, +(p.rx / ZOOM - cut.x).toFixed(2), +(p.ry / ZOOM - cut.y).toFixed(2), cut.w, cut.h];
  files.push(file);
  pair(file, cut, `furniture/${STYLES[p.style]}.swf`);
}
for (const p of protos) {
  const cut = cutPair(p.png, -1);
  if (cut.x || cut.y || cut.w !== p.w || cut.h !== p.h) throw new Error(`proto_${p.state}: stage not kept`);
  const file = `proto_${p.state}.webp`;
  files.push(file);
  pair(file, cut, 'misc/proto/proto_furniture_tower_chassis/proto_furniture_tower_chassis.swf');
}
await writePair.flush();
const results = JSON.parse(readFileSync(RESULTS, 'utf8'));

const lines = [
  '/**',
  ' * GENERATED by tools/tower-art/build.mjs. Do not edit.',
  ' *',
  ' * Tower chassis articles per style, every choice the client offered',
  ' * (config_options in each furniture_tower_chassis*.as): index n-1 holds',
  ' * variant n as [file, originX, originY, w, h] at 1x (the 1x WebP in',
  ' * assets/sprites/home-tower, its 3x twin <name>@3x.webp in js/sprite-hires.js),',
  ' * or null for an empty / invisible symbol.',
  ' * door follows floor_ground; extra_floor serves floor_1..7.',
  ' */',
  `export const TOWER_PART_CHOICES = Object.freeze(${JSON.stringify(counts)});`,
  '',
  'export const TOWER_VARIANT_ART = Object.freeze({',
  ...Object.entries(art).map(([style, parts]) => `  ${style}: {\n${Object.entries(parts).map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`).join('\n')}\n  },`),
  '});',
  '',
];
const js = lines.join('\n');
const want = new Set(rows.flatMap((r) => [r.path.split('/').pop(), r.hires.split('/').pop()]));
if (CHECK) {
  const same = existsSync(OUT_JS) && readFileSync(OUT_JS, 'utf8') === js;
  const { HIRES_SPRITES } = await import('../../public/js/sprite-hires.js?v=dd5da64c');
  const bad = checkPairs(results, SOURCE, rows.map((r) => r.path), PUB, HIRES_SPRITES);
  for (const r of rows) if (results[r.path] && results[r.path].hires !== r.hires) bad.push(`${r.path}: results name ${results[r.path].hires}`);
  for (const f of readdirSync(OUT_DIR)) if (!want.has(f) && f !== 'tower_expander.webp' && !/^tower_expander@\d+x\.webp$/.test(f)) bad.push(`${REL_DIR}/${f}: not built here`);
  if (!same) bad.push('home-tower-art.js is stale');
  if (bad.length) {
    for (const b of bad) console.error(`stale: ${b}`);
    process.exit(1);
  }
  console.log(`ok: ${files.length} articles`);
} else {
  writeFileSync(OUT_JS, js);
  // The 2x files these pairs replace (and anything else no longer built).
  for (const f of readdirSync(OUT_DIR)) if (!want.has(f) && f !== 'tower_expander.webp' && !/^tower_expander@\d+x\.webp$/.test(f)) unlinkSync(join(OUT_DIR, f));
  registerPairs(results, SOURCE, rows, PUB);
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  const { writeModule } = await import('../vector-sprites/build.mjs');
  writeModule(results);
  let one = 0, three = 0;
  for (const r of rows) {
    one += statSync(join(PUB, r.path)).size;
    three += statSync(join(PUB, r.hires)).size;
  }
  console.log(`wrote ${files.length} articles (1x ${(one / 1024).toFixed(0)} KB, 3x ${(three / 1024).toFixed(0)} KB), js/home-tower-art.js and their js/sprite-hires.js rows`);
}
