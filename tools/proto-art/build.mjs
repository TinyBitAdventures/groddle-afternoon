#!/usr/bin/env node
/**
 * Depleted cultivation protos: the `depleted` frame of each CC0 proto SWF in
 * tinyspeck/glitch-items (misc/proto/proto_<class>/proto_<class>.swf),
 * as a 1x WebP and its sharp 3x twin, with the stage's bottom-centre as the
 * origin.
 *
 * Every cultivation proto SWF has two main-timeline frames: frame 1 is the
 * finished item (the placement ghost) and frame 2 carries the frame label
 * `depleted` (DefineSceneAndFrameLabelData), the rubble the server shows once
 * the item wears out (items/proto_*.js onCreate setAndBroadcastState
 * 'depleted'). FFDec exports that frame as SVG at zoom 3; the stage
 * background rect is dropped, Chromium rasterises it (keeps the overlay
 * blend modes), and tools/vector-sprites/aligned-art.mjs trims it on the 1x
 * grid and writes the pair: the 1x (the 3:1 box downscale) and <name>@3x.webp.
 * Each pair is registered in tools/vector-sprites/results.json (source
 * tools/proto-art), so js/sprite-hires.js draws the 3x on dense screens (the
 * yard draws protos at world scale 1: about 2.5 device px per 1x px on a
 * Retina window, where the 2x art these replace was magnified 1.26).
 *
 * Output:
 *   public/assets/sprites/cultivation/proto/<proto_class>.webp (+ @3x.webp)
 *   public/js/home-proto-art.js (generated: [file, originX, originY, w, h] at 1x)
 *
 * Usage: node tools/proto-art/build.mjs [--work <dir>] [--check]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { FFDEC, JAVA } from '../vector-sprites/swf-labels.mjs';
import { rasteriseSvgs } from '../vector-sprites/svg-raster.mjs';
import { ZOOM, checkPairs, cutPair, padSvg, registerPairs, writePair } from '../vector-sprites/aligned-art.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ITEMS = join(os.homedir(), 'Documents/glitch-audit/glitch-items/misc/proto');
const OUT_DIR = join(ROOT, 'public/assets/sprites/cultivation/proto');
const OUT_JS = join(ROOT, 'public/js/home-proto-art.js');
const PUB = join(ROOT, 'public');
const REL_DIR = 'assets/sprites/cultivation/proto';
const RESULTS = join(ROOT, 'tools/vector-sprites/results.json');
const SOURCE = 'tools/proto-art';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const WORK = opt('--work', join(os.tmpdir(), 'proto-art-work-3x'));
const CHECK = args.includes('--check');
const PAD = 10; // 1x px
const ALPHA_MIN = 8;

/** locations/inc_cultivation.js cultivation_classes (the Tower keeps its own art). */
const PROTOS = [
  'proto_beryl_rock', 'proto_dullite_rock', 'proto_metal_rock', 'proto_sparkly_rock',
  'proto_peat', 'proto_dirt_pile', 'proto_patch',
  'proto_crop_garden_small', 'proto_crop_garden_medium', 'proto_crop_garden_large',
  'proto_herb_garden_small', 'proto_herb_garden_medium', 'proto_herb_garden_large',
  'proto_barnacle_pod', 'proto_jellisac_mound', 'proto_firefly_hive',
];

function depletedFrame(swf) {
  const dump = execFileSync(JAVA, ['-jar', FFDEC, '-dumpSWF', swf], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const row = /DefineSceneAndFrameLabelData.*len=\s*\d+\s+(.*)$/m.exec(dump);
  if (!row) throw new Error(`${swf}: no frame labels`);
  const bytes = Buffer.from(row[1].trim().split(/\s+/).map((h) => parseInt(h, 16)));
  // u30 scene count, scenes (u30 offset, string), u30 label count, labels (u30 frame, string).
  // The protos name a second scene `depleted` (offset 1), so look at both lists.
  let p = 0;
  const u30 = () => bytes[p++];
  const str = () => { const s = p; while (bytes[p]) p += 1; return bytes.toString('utf8', s, p++); };
  for (let list = 0; list < 2; list += 1) {
    for (let n = u30(), i = 0; i < n; i += 1) {
      const frame = u30();
      if (str() === 'depleted') return frame + 1;
    }
  }
  throw new Error(`${swf}: no depleted label`);
}

mkdirSync(WORK, { recursive: true });
const jobs = [];
const pending = [];
for (const proto of PROTOS) {
  const swf = join(ITEMS, proto, `${proto}.swf`);
  const frame = depletedFrame(swf);
  const dir = join(WORK, proto);
  if (!existsSync(join(dir, `${frame}.svg`))) {
    execFileSync(JAVA, ['-jar', FFDEC, '-zoom', String(ZOOM), '-select', String(frame), '-format', 'frame:svg', '-export', 'frame', dir, swf], { stdio: 'ignore' });
  }
  const file = readdirSync(dir).find((f) => f === `${frame}.svg`);
  if (!file) throw new Error(`${proto}: frame ${frame} not exported`);
  const text = readFileSync(join(dir, file), 'utf8')
    // The stage background colour is not part of the art.
    .replace(/\s*<rect fill="#[0-9a-fA-F]{6}" height="[\d.]+px" width="[\d.]+px"\/>/, '');
  const stage = /<svg[^>]*>/.exec(text)[0];
  const w = Number(/width="([\d.]+)px"/.exec(stage)[1]);
  const h = Number(/height="([\d.]+)px"/.exec(stage)[1]);
  const padded = padSvg(text, PAD);
  const svg = join(dir, 'depleted.pad.svg');
  const png = join(dir, 'depleted.png');
  if (!existsSync(svg) || readFileSync(svg, 'utf8') !== padded.text) writeFileSync(svg, padded.text);
  if (!existsSync(png) || statSync(png).mtimeMs < statSync(svg).mtimeMs - 1000) jobs.push({ svg, png });
  // Origin: the stage's bottom centre (where the item stands on the street), 3x px of the padded
  // canvas (the frame export's canvas is the stage, now PAD 1x px in).
  pending.push({ proto, png, ox: PAD * ZOOM + w / 2, oy: PAD * ZOOM + h });
}

if (jobs.length) await rasteriseSvgs(jobs);
if (!CHECK) mkdirSync(OUT_DIR, { recursive: true });
const art = {};
const files = [];
const rows = [];
for (const p of pending) {
  const cut = cutPair(p.png, ALPHA_MIN);
  if (!cut) throw new Error(`${p.png}: empty`);
  const file = `${p.proto}.webp`;
  art[p.proto] = [file, +(p.ox / ZOOM - cut.x).toFixed(2), +(p.oy / ZOOM - cut.y).toFixed(2), cut.w, cut.h];
  files.push(file);
  rows.push({ path: `${REL_DIR}/${file}`, hires: `${REL_DIR}/${p.proto}@3x.webp`, w: cut.w, h: cut.h, swf: `misc/proto/${p.proto}/${p.proto}.swf` });
  if (!CHECK) writePair(cut, join(OUT_DIR, file));
}
await writePair.flush();

const js = [
  '/**',
  ' * GENERATED by tools/proto-art/build.mjs. Do not edit.',
  ' *',
  ' * The `depleted` frame of each cultivation proto SWF (tinyspeck/glitch-items',
  ' * misc/proto, CC0) as [file, originX, originY, w, h] at 1x; the 1x WebP is in',
  ' * assets/sprites/cultivation/proto (its 3x twin <name>@3x.webp in js/sprite-hires.js)',
  ' * and the origin is the stage bottom centre.',
  ' */',
  'export const PROTO_DEPLETED_ART = Object.freeze({',
  ...Object.entries(art).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`),
  '});',
  '',
].join('\n');
const results = JSON.parse(readFileSync(RESULTS, 'utf8'));
const want = new Set(rows.flatMap((r) => [r.path.split('/').pop(), r.hires.split('/').pop()]));
if (CHECK) {
  const same = existsSync(OUT_JS) && readFileSync(OUT_JS, 'utf8') === js;
  const { HIRES_SPRITES } = await import('../../public/js/sprite-hires.js?v=96c22af7');
  const bad = checkPairs(results, SOURCE, rows.map((r) => r.path), PUB, HIRES_SPRITES);
  for (const r of rows) if (results[r.path] && results[r.path].hires !== r.hires) bad.push(`${r.path}: results name ${results[r.path].hires}`);
  for (const f of readdirSync(OUT_DIR)) if (!want.has(f)) bad.push(`${REL_DIR}/${f}: not built here`);
  if (!same) bad.push('home-proto-art.js is stale');
  if (bad.length) {
    for (const b of bad) console.error(`stale: ${b}`);
    process.exit(1);
  }
  console.log(`ok: ${files.length} protos`);
} else {
  writeFileSync(OUT_JS, js);
  for (const f of readdirSync(OUT_DIR)) if (!want.has(f)) unlinkSync(join(OUT_DIR, f));
  registerPairs(results, SOURCE, rows, PUB);
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  const { writeModule } = await import('../vector-sprites/build.mjs');
  writeModule(results);
  let one = 0, three = 0;
  for (const r of rows) {
    one += statSync(join(PUB, r.path)).size;
    three += statSync(join(PUB, r.hires)).size;
  }
  console.log(`wrote ${files.length} protos (1x ${(one / 1024).toFixed(0)} KB, 3x ${(three / 1024).toFixed(0)} KB), js/home-proto-art.js and their js/sprite-hires.js rows`);
}
