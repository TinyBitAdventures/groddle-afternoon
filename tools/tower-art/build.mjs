#!/usr/bin/env node
/**
 * Tower exterior articles: every variant of every chassis part, from the six
 * CC0 tower chassis SWFs in tinyspeck/glitch-items (furniture_base and
 * furniture_tower_chassis), rasterised at 2x as WebP with their registration
 * points.
 *
 * The client's chassis (furniture_tower_chassis*.as initializehead) attaches
 * exported symbols by class name: floor_ground_<n> and door_<n> (the door
 * follows the ground floor), floor_top_<n>, extra_floor_<n> for floors 1-7,
 * deco_ground_<n> and deco_side_<n>. Each .as lists the choices in
 * config_options; this reads those lists, finds each symbol's character id
 * (FFDec symbolClass), exports it as SVG at zoom 2 (FFDec), pads the canvas so
 * glow/shadow filters are not clipped, rasterises in Chromium
 * (vector-sprites/svg-raster.mjs, which keeps blend modes), trims the
 * transparent border and encodes WebP (lossy q 88, sharp YUV, lossless alpha).
 * Empty symbols (base deco_ground_1 is "no deco") and invisible ones (the door
 * hit areas) are recorded as null and not written.
 *
 * Output:
 *   public/assets/sprites/home-tower/<style>_<part>_<n>.webp
 *   public/js/home-tower-art.js  (generated: choices + [file, originX, originY, w, h] at 1x)
 *
 * Usage: node tools/tower-art/build.mjs [--work <dir>] [--check]
 *   --work   FFDec / raster cache (default $TMPDIR/tower-art-work)
 *   --check  exit 1 if the generated module would change (no writes)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { FFDEC, JAVA } from '../vector-sprites/swf-labels.mjs';
import { symbolClasses } from '../vector-sprites/swf-parts.mjs';
import { rasteriseSvgs } from '../vector-sprites/svg-raster.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ITEMS = join(os.homedir(), 'Documents/glitch-audit/glitch-items/furniture');
const OUT_DIR = join(ROOT, 'public/assets/sprites/home-tower');
const OUT_JS = join(ROOT, 'public/js/home-tower-art.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const WORK = opt('--work', join(os.tmpdir(), 'tower-art-work'));
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
const ZOOM = 2;
const PAD = 40; // 2x px of room for filters around FFDec's shape bounds
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

/** FFDec frame SVG: canvas size and the outer translate (the registration point at 2x). */
function svgFrame(file) {
  const text = readFileSync(file, 'utf8');
  const head = /<svg[^>]*>/.exec(text)[0];
  const w = Number(/width="([\d.]+)px"/.exec(head)?.[1] || 0);
  const h = Number(/height="([\d.]+)px"/.exec(head)?.[1] || 0);
  const g = /<g transform="matrix\(([^)]*)\)"/.exec(text);
  const [, , , , tx, ty] = g ? g[1].split(',').map(Number) : [0, 0, 0, 0, 0, 0];
  return { text, head, w, h, tx, ty };
}

/** Bounding box of drawn pixels via ImageMagick (-trim geometry), or null when empty. */
function drawnBox(png) {
  const out = execFileSync('magick', [png, '-channel', 'A', '-threshold', `${(ALPHA_MIN / 255) * 100}%`, '+channel', '-format', '%@ %[fx:maxima.a]', 'info:'], { encoding: 'utf8' }).trim();
  const [geo, maxA] = out.split(' ');
  if (Number(maxA) === 0) return null;
  const m = /^(\d+)x(\d+)\+(\d+)\+(\d+)$/.exec(geo);
  if (!m) return null;
  const [, w, h, x, y] = m.map(Number);
  return w > 1 || h > 1 ? { w, h, x, y } : null;
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
    const frame = svgFrame(join(dir, sub, '1.svg'));
    const part = name.replace(/_\d+$/, '');
    const n = Number(name.split('_').pop());
    (art[style][part] ||= [])[n - 1] = null;
    if (!frame.w || !frame.h) continue;
    // Pad the canvas so blurred glows and drop shadows are not clipped.
    const W = Math.ceil(frame.w) + 2 * PAD;
    const H = Math.ceil(frame.h) + 2 * PAD;
    const padded = frame.text
      .replace(frame.head, frame.head.replace(/width="[\d.]+px"/, `width="${W}px"`).replace(/height="[\d.]+px"/, `height="${H}px"`))
      .replace(/<g transform="matrix\(([^)]*)\)"/, (all, m) => {
        const v = m.split(',').map(Number);
        v[4] += PAD;
        v[5] += PAD;
        return `<g transform="matrix(${v.join(', ')})"`;
      });
    const svg = join(dir, `${name}.pad.svg`);
    const png = join(dir, `${name}.png`);
    writeFileSync(svg, padded);
    if (!existsSync(png) || statSync(png).mtimeMs < statSync(svg).mtimeMs - 1000) jobs.push({ svg, png });
    pending.push({ style, part, n, png, ox: frame.tx + PAD, oy: frame.ty + PAD });
  }
}

if (jobs.length) {
  console.log(`  raster: ${jobs.length} svgs`);
  await rasteriseSvgs(jobs);
}

if (!CHECK) mkdirSync(OUT_DIR, { recursive: true });
for (const p of pending) {
  const box = drawnBox(p.png);
  if (!box) continue;
  const file = `${p.style}_${p.part}_${p.n}.webp`;
  // 1x registration point inside the trimmed image, and the 1x size.
  art[p.style][p.part][p.n - 1] = [file, +((p.ox - box.x) / ZOOM).toFixed(2), +((p.oy - box.y) / ZOOM).toFixed(2), box.w / ZOOM, box.h / ZOOM];
  files.push(file);
  if (CHECK) continue;
  const crop = join(dirname(p.png), `${p.style}_${p.part}_${p.n}.crop.png`);
  execFileSync('magick', [p.png, '-crop', `${box.w}x${box.h}+${box.x}+${box.y}`, '+repage', crop]);
  execFileSync('cwebp', ['-quiet', '-metadata', 'none', '-q', '88', '-m', '6', '-sharp_yuv', '-alpha_q', '100', '-alpha_filter', 'best', crop, '-o', join(OUT_DIR, file)]);
}

const lines = [
  '/**',
  ' * GENERATED by tools/tower-art/build.mjs. Do not edit.',
  ' *',
  ' * Tower chassis articles per style, every choice the client offered',
  ' * (config_options in each furniture_tower_chassis*.as): index n-1 holds',
  ' * variant n as [file, originX, originY, w, h] at 1x (2x WebP in',
  ' * assets/sprites/home-tower), or null for an empty / invisible symbol.',
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
if (CHECK) {
  const same = existsSync(OUT_JS) && readFileSync(OUT_JS, 'utf8') === js;
  const absent = files.filter((f) => !existsSync(join(OUT_DIR, f)));
  if (!same || absent.length) {
    console.error(`stale: ${same ? '' : 'home-tower-art.js '}${absent.length ? `${absent.length} files missing` : ''}`);
    process.exit(1);
  }
  console.log(`ok: ${files.length} articles`);
} else {
  writeFileSync(OUT_JS, js);
  let bytes = 0;
  for (const f of files) bytes += statSync(join(OUT_DIR, f)).size;
  console.log(`wrote ${files.length} articles (${(bytes / 1024).toFixed(0)} KB) and js/home-tower-art.js`);
}
