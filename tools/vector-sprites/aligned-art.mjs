/**
 * Whole-pixel 1x + 3x pairs from FFDec zoom-3 SVG exports, for the art
 * generators that place symbols by their registration point
 * (tools/tower-art, tools/proto-art, tools/note-pole-art).
 *
 * FFDec draws the symbol at zoom 3 (its hairlines and blurs at that zoom),
 * the canvas is padded to a multiple of 3 px, Chromium rasterises it
 * (svg-raster.mjs keeps the blend modes), the drawn pixels' box is snapped
 * out to the 1x grid (multiples of 3), and the 1x file is that crop
 * box-downscaled 3:1: one picture at two densities, exactly 3x apart, as
 * js/sprite-hires.js and tests/vector-sprites.test.js require. The 3x file is
 * `<name>@3x.webp` beside the 1x `<name>.webp` (js/textures.js reads
 * resolution 3 from the name, so frames and sizes stay in 1x units).
 */
import { execFile } from 'node:child_process';
import os from 'node:os';
import { readFileSync, statSync, unlinkSync } from 'node:fs';
import { crop, downscale, readImage, writeImage } from '../quoin-art/pixels.mjs';

export const ZOOM = 3;

/** FFDec SVG canvas size and the outer group's translate (the registration point, 3x px). */
export function svgFrame(text) {
  const head = /<svg[^>]*>/.exec(text)[0];
  const w = Number(/width="([\d.]+)px"/.exec(head)?.[1] || 0);
  const h = Number(/height="([\d.]+)px"/.exec(head)?.[1] || 0);
  const g = /<g transform="matrix\(([^)]*)\)"/.exec(text);
  const v = g ? g[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0];
  return { head, w, h, tx: v[4], ty: v[5] };
}

/**
 * The SVG with `pad` 1x px of room on every side (filters are not clipped)
 * and a canvas a whole number of 1x px: { text, rx, ry, w, h } with the
 * registration point (rx, ry) in 3x px of the new canvas.
 */
export function padSvg(text, pad = 20) {
  const f = svgFrame(text);
  const P = pad * ZOOM;
  const W = Math.ceil((f.w + 2 * P) / ZOOM) * ZOOM;
  const H = Math.ceil((f.h + 2 * P) / ZOOM) * ZOOM;
  const out = text
    .replace(f.head, f.head.replace(/width="[\d.]+px"/, `width="${W}px"`).replace(/height="[\d.]+px"/, `height="${H}px"`))
    .replace(/<g transform="matrix\(([^)]*)\)"/, (all, m) => {
      const v = m.split(',').map(Number);
      v[4] += P;
      v[5] += P;
      return `<g transform="matrix(${v.join(', ')})"`;
    });
  return { text: out, rx: f.tx + P, ry: f.ty + P, w: W, h: H };
}

/**
 * The drawn part of a zoom-3 raster (alpha above alphaMin of 255), snapped
 * out to the 1x grid: { three, one, x, y, w, h } (x, y, w, h in 1x px of the
 * canvas), or null when nothing is drawn.
 */
export function cutPair(png, alphaMin = 8) {
  const img = readImage(png);
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.p[(y * img.w + x) * 4 + 3] <= alphaMin) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0 || (x1 === x0 && y1 === y0)) return null;
  const bx = Math.floor(x0 / ZOOM), by = Math.floor(y0 / ZOOM);
  const bw = Math.floor(x1 / ZOOM) + 1 - bx, bh = Math.floor(y1 / ZOOM) + 1 - by;
  const three = crop(img, bx * ZOOM, by * ZOOM, bw * ZOOM, bh * ZOOM);
  return { three, one: downscale(three, ZOOM), x: bx, y: by, w: bw, h: bh };
}

/**
 * Write a pair as WebP with lossless alpha, as the 2x art these replace was:
 * the 1x at `one` (…/<name>.webp, lossy quality + 4: a 1x pixel shows more)
 * and the 3x at …/<name>@3x.webp (lossy `quality`). The pixels are taken at
 * once (the caller can drop the cut); the encodes run in a pool of `pool`
 * (writePair.flush() waits for them all). Resolves to the 3x path.
 */
export function writePair(pair, one, quality = 88) {
  if (!one.endsWith('.webp')) throw new Error(`${one}: not .webp`);
  const three = one.replace(/\.webp$/, '@3x.webp');
  const tmp1 = `${one}.tmp.png`;
  const tmp3 = `${three}.tmp.png`;
  writeImage(pair.one, tmp1);
  writeImage(pair.three, tmp3);
  const enc = (q, src, out) => ['-quiet', '-metadata', 'none', '-q', String(q), '-m', '6', '-sharp_yuv', '-alpha_q', '100', '-alpha_filter', 'best', src, '-o', out];
  const job = Promise.all([
    run('cwebp', enc(Math.min(100, quality + 4), tmp1, one)),
    run('cwebp', enc(quality, tmp3, three)),
  ]).finally(() => {
    unlinkSync(tmp1);
    unlinkSync(tmp3);
  }).then(() => three);
  pending.add(job);
  job.finally(() => pending.delete(job)).catch(() => {});
  return job;
}
const pending = new Set();
const queue = [];
let running = 0;
const POOL = Math.max(2, Math.min(8, (os.availableParallelism?.() || 4) - 1));
function run(cmd, argv) {
  return new Promise((resolve, reject) => {
    queue.push(() => {
      running += 1;
      execFile(cmd, argv, (err) => {
        running -= 1;
        if (queue.length) queue.shift()();
        if (err) reject(err); else resolve();
      });
    });
    if (running < POOL) queue.shift()();
  });
}
/** Wait for every encode writePair started. */
writePair.flush = async () => {
  while (pending.size) await Promise.all([...pending]);
};

/** Pixel size from a PNG or WebP header. */
export function imageSize(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}

/**
 * Register generated pairs in tools/vector-sprites/results.json, so
 * js/sprite-hires.js loads each @3x file wherever its 1x URL is used on a
 * dense screen: rows { path (from public/), hires, w, h, swf } for one
 * `source` (the generator), replacing that source's old rows.
 */
export function registerPairs(results, source, rows, pub) {
  for (const [path, r] of Object.entries(results)) if (r.source === source) delete results[path];
  for (const row of rows) {
    results[row.path] = {
      animal: source.split('/').pop(),
      character: source.split('/').pop(),
      source,
      swf: row.swf,
      status: 'ok',
      hires: row.hires,
      bytes: statSync(`${pub}/${row.hires}`).size,
      cells: 1,
      fw: row.w,
      fh: row.h,
      scoreKind: 'one zoom-3 render; the 1x is its 3:1 box downscale',
      score: 1,
      minFrame: 1,
      frameScores: [1],
      drift: [],
    };
  }
  return results;
}

/** --check problems for one source's registered pairs ([] when every pair is exactly 3x and listed). */
export function checkPairs(results, source, paths, pub, hiresMap) {
  const bad = [];
  const want = new Set(paths);
  for (const path of paths) {
    const r = results[path];
    if (r?.status !== 'ok' || r.source !== source) { bad.push(`${path}: not registered in tools/vector-sprites/results.json`); continue; }
    let a, b;
    try {
      a = imageSize(`${pub}/${path}`);
      b = imageSize(`${pub}/${r.hires}`);
    } catch {
      bad.push(`${path}: file missing`);
      continue;
    }
    if (b.w !== a.w * 3 || b.h !== a.h * 3) bad.push(`${r.hires}: ${b.w}x${b.h}, not 3x ${a.w}x${a.h}`);
    if (a.w !== r.fw || a.h !== r.fh) bad.push(`${path}: ${a.w}x${a.h}, results ${r.fw}x${r.fh}`);
    if (hiresMap && hiresMap.get(path) !== r.hires) bad.push(`${path}: not in js/sprite-hires.js`);
  }
  for (const [path, r] of Object.entries(results)) if (r.source === source && !want.has(path)) bad.push(`${path}: stale result`);
  return bad;
}
