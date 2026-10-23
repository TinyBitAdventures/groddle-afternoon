#!/usr/bin/env node
/**
 * Depleted cultivation protos: the `depleted` frame of each CC0 proto SWF in
 * tinyspeck/glitch-items (misc/proto/proto_<class>/proto_<class>.swf),
 * rasterised at 2x as WebP with the stage's bottom-centre as the origin.
 *
 * Every cultivation proto SWF has two main-timeline frames: frame 1 is the
 * finished item (the placement ghost) and frame 2 carries the frame label
 * `depleted` (DefineSceneAndFrameLabelData), the rubble the server shows once
 * the item wears out (items/proto_*.js onCreate setAndBroadcastState
 * 'depleted'). FFDec exports that frame as SVG at zoom 2; the stage
 * background rect is dropped, Chromium rasterises it (keeps the overlay
 * blend modes), ImageMagick trims it and cwebp encodes it.
 *
 * Output:
 *   public/assets/sprites/cultivation/proto/<proto_class>.webp
 *   public/js/home-proto-art.js (generated: [file, originX, originY, w, h] at 1x)
 *
 * Usage: node tools/proto-art/build.mjs [--work <dir>] [--check]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { FFDEC, JAVA } from '../vector-sprites/swf-labels.mjs';
import { rasteriseSvgs } from '../vector-sprites/svg-raster.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ITEMS = join(os.homedir(), 'Documents/glitch-audit/glitch-items/misc/proto');
const OUT_DIR = join(ROOT, 'public/assets/sprites/cultivation/proto');
const OUT_JS = join(ROOT, 'public/js/home-proto-art.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const WORK = opt('--work', join(os.tmpdir(), 'proto-art-work'));
const CHECK = args.includes('--check');
const ZOOM = 2;
const PAD = 20;
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

function drawnBox(png) {
  const out = execFileSync('magick', [png, '-channel', 'A', '-threshold', `${(ALPHA_MIN / 255) * 100}%`, '+channel', '-format', '%@', 'info:'], { encoding: 'utf8' }).trim();
  const m = /^(\d+)x(\d+)\+(\d+)\+(\d+)$/.exec(out);
  if (!m) throw new Error(`${png}: empty`);
  const [, w, h, x, y] = m.map(Number);
  return { w, h, x, y };
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
  const text = readFileSync(join(dir, file), 'utf8');
  const head = /<svg[^>]*>/.exec(text)[0];
  const w = Number(/width="([\d.]+)px"/.exec(head)[1]);
  const h = Number(/height="([\d.]+)px"/.exec(head)[1]);
  const W = Math.ceil(w) + 2 * PAD;
  const H = Math.ceil(h) + 2 * PAD;
  const svgText = text
    .replace(head, head.replace(/width="[\d.]+px"/, `width="${W}px"`).replace(/height="[\d.]+px"/, `height="${H}px"`))
    // The stage background colour is not part of the art.
    .replace(/\s*<rect fill="#[0-9a-fA-F]{6}" height="[\d.]+px" width="[\d.]+px"\/>/, '')
    .replace(/<g transform="matrix\(([^)]*)\)"/, (all, m) => {
      const v = m.split(',').map(Number);
      v[4] += PAD;
      v[5] += PAD;
      return `<g transform="matrix(${v.join(', ')})"`;
    });
  const svg = join(dir, 'depleted.pad.svg');
  const png = join(dir, 'depleted.png');
  writeFileSync(svg, svgText);
  jobs.push({ svg, png });
  // Origin: the stage's bottom centre (where the item stands on the street).
  pending.push({ proto, png, ox: PAD + w / 2, oy: PAD + h });
}

if (jobs.length) await rasteriseSvgs(jobs);
if (!CHECK) mkdirSync(OUT_DIR, { recursive: true });
const art = {};
const files = [];
for (const p of pending) {
  const box = drawnBox(p.png);
  const file = `${p.proto}.webp`;
  art[p.proto] = [file, +((p.ox - box.x) / ZOOM).toFixed(2), +((p.oy - box.y) / ZOOM).toFixed(2), box.w / ZOOM, box.h / ZOOM];
  files.push(file);
  if (CHECK) continue;
  const crop = join(dirname(p.png), 'depleted.crop.png');
  execFileSync('magick', [p.png, '-crop', `${box.w}x${box.h}+${box.x}+${box.y}`, '+repage', crop]);
  execFileSync('cwebp', ['-quiet', '-metadata', 'none', '-q', '88', '-m', '6', '-sharp_yuv', '-alpha_q', '100', '-alpha_filter', 'best', crop, '-o', join(OUT_DIR, file)]);
}

const js = [
  '/**',
  ' * GENERATED by tools/proto-art/build.mjs. Do not edit.',
  ' *',
  ' * The `depleted` frame of each cultivation proto SWF (tinyspeck/glitch-items',
  ' * misc/proto, CC0) as [file, originX, originY, w, h] at 1x; the 2x WebP is in',
  ' * assets/sprites/cultivation/proto and the origin is the stage bottom centre.',
  ' */',
  'export const PROTO_DEPLETED_ART = Object.freeze({',
  ...Object.entries(art).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`),
  '});',
  '',
].join('\n');
if (CHECK) {
  const same = existsSync(OUT_JS) && readFileSync(OUT_JS, 'utf8') === js;
  const absent = files.filter((f) => !existsSync(join(OUT_DIR, f)));
  if (!same || absent.length) {
    console.error(`stale: ${same ? '' : 'home-proto-art.js '}${absent.length ? `${absent.length} files missing` : ''}`);
    process.exit(1);
  }
  console.log(`ok: ${files.length} protos`);
} else {
  writeFileSync(OUT_JS, js);
  let bytes = 0;
  for (const f of files) bytes += statSync(join(OUT_DIR, f)).size;
  console.log(`wrote ${files.length} protos (${(bytes / 1024).toFixed(0)} KB) and js/home-proto-art.js`);
}
