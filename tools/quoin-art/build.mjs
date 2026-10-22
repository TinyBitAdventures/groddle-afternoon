#!/usr/bin/env node
/**
 * Sharp 3x quoin sheet from hand-traced vectors.
 *
 * Tiny Speck's quoin art only survives as the 1x sheet
 * (assets/sprites/quoin__x1_..._1354829599.png, 24 frames x 8 types of
 * 40 x 45); the SWF/FLA in glitch-items/misc/quoin hold the same bitmaps, so
 * there is no vector or larger original. The art here is a hand trace of that
 * 1x sheet (CC0): one SVG per quoin body plus the shared propeller in
 * tools/quoin-art/svg/, drawn over enlarged 1x frames with colours sampled
 * from its pixels. Nothing comes from videos, screenshots or other remakes.
 *
 * 1. frames.json (tools/quoin-art/measure.mjs) holds the original animation,
 *    measured frame by frame from the 1x sheet: each body's whole-pixel bob,
 *    the propeller hub position, spin (rotor horizontal scale) and offset,
 *    and the Qurazy cloud's per-frame squash and spot colours.
 * 2. Every cell is composed from the SVGs with those transforms into one SVG
 *    document and rendered with rsvg-convert at 3x: 2880 x 1080, the same
 *    24 x 8 grid of 120 x 135 frames on a transparent background.
 * 3. Each frame is box-downscaled 3:1 and scored against its 1x cell (the
 *    tools/vector-sprites measure); a frame that prefers a one-pixel shift is
 *    reported as drift. The sheet is refused below the vector-sprites bars.
 * 4. The sheet is written beside the 1x file as <name>@3x.png (or .webp when
 *    lossless WebP is smaller), registered in tools/vector-sprites/results.json
 *    and public/js/sprite-hires.js is regenerated, so js/textures.js loads it
 *    at resolution 3 wherever the 1x URL is used (logical frames unchanged).
 *
 * Usage: node tools/quoin-art/build.mjs [--dry] [--contact <out.png>]
 *   --dry      render and score only (no files written)
 *   --contact  also write a 1x-vs-3x contact sheet for review
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { HERE, FW, FH, COLS, TYPES, allCells, sheetSvg } from './compose.mjs';
import { crop, downscale, readImage, renderSvg, score, toBytes } from './pixels.mjs';

const ROOT = join(HERE, '../..');
const PUBLIC = join(ROOT, 'public');
export const SHEET = 'assets/sprites/quoin__x1_1_x1_2_x1_3_x1_4_x1_5_x1_6_x1_7_x1_8_png_1354829599.png';
const RESULTS = join(ROOT, 'tools/vector-sprites/results.json');

/** Same bars as tools/vector-sprites (tests/vector-sprites.test.js checks them). */
export const SHEET_MIN = 0.9;
export const FRAME_MIN = 0.8;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const contactAt = args.indexOf('--contact');
const CONTACT = contactAt >= 0 ? args[contactAt + 1] : null;

function shifted(img, dx, dy) {
  const out = { w: img.w, h: img.h, p: new Float32Array(img.p.length) };
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const sx = x - dx, sy = y - dy;
    if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
    for (let k = 0; k < 4; k++) out.p[(y * img.w + x) * 4 + k] = img.p[(sy * img.w + sx) * 4 + k];
  }
  return out;
}

/** Contact sheet: per type, its 24 1x frames point-enlarged 3x above the 3x render. */
function writeContact(one, three, file) {
  const W = COLS * FW * 3, band = FH * 3, gap = 6, H = TYPES.length * (2 * band + gap);
  const out = { w: W, h: H, p: new Float32Array(W * H * 4) };
  // mid-grey backdrop so white rims and glows read
  for (let i = 0; i < W * H; i++) { out.p[i * 4] = 86; out.p[i * 4 + 1] = 86; out.p[i * 4 + 2] = 100; out.p[i * 4 + 3] = 255; }
  const over = (o, src) => {
    const a = src[3] / 255;
    for (let k = 0; k < 3; k++) out.p[o + k] = src[k] + out.p[o + k] * (1 - a);
  };
  TYPES.forEach((_, row) => {
    const y0 = row * (2 * band + gap);
    for (let y = 0; y < band; y++) for (let x = 0; x < W; x++) {
      const s1 = ((row * FH + Math.floor(y / 3)) * one.w + Math.floor(x / 3)) * 4;
      over(((y0 + y) * W + x) * 4, one.p.subarray(s1, s1 + 4));
      const s3 = ((row * band + y) * three.w + x) * 4;
      over(((y0 + band + y) * W + x) * 4, three.p.subarray(s3, s3 + 4));
    }
  });
  execFileSync('magick', ['-size', `${W}x${H}`, '-depth', '8', 'rgba:-', file], { input: toBytes(out) });
}

async function main() {
  const data = JSON.parse(readFileSync(join(HERE, 'frames.json'), 'utf8'));
  const one = readImage(join(PUBLIC, SHEET));
  const svg = sheetSvg(data, allCells());
  const three = renderSvg(svg, one.w * 3, one.h * 3);
  const small = downscale(three, 3);

  const frameScores = [];
  const drift = [];
  const perType = {};
  TYPES.forEach((type, row) => {
    const scores = [];
    for (let f = 0; f < COLS; f++) {
      const o = crop(one, f * FW, row * FH, FW, FH);
      const d = crop(small, f * FW, row * FH, FW, FH);
      const s = score(o, d);
      let best = { s, dx: 0, dy: 0 };
      for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
        if (!dx && !dy) continue;
        const t = score(o, shifted(d, dx, dy));
        if (t > best.s + 0.01) best = { s: t, dx, dy };
      }
      if (best.dx || best.dy) drift.push({ type, frame: f, dx: best.dx, dy: best.dy });
      scores.push(+s.toFixed(4));
    }
    perType[type] = { mean: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4), min: Math.min(...scores) };
    frameScores.push(...scores);
  });
  const mean = +(frameScores.reduce((a, b) => a + b, 0) / frameScores.length).toFixed(4);
  const minFrame = Math.min(...frameScores);
  for (const [type, s] of Object.entries(perType)) console.log(`${type.padEnd(9)} mean ${s.mean.toFixed(4)}  worst ${s.min.toFixed(4)}`);
  console.log(`sheet     mean ${mean.toFixed(4)}  worst ${minFrame.toFixed(4)}  drift ${drift.length}`);

  if (CONTACT) {
    writeContact(one, three, CONTACT);
    console.log(`contact sheet: ${CONTACT}`);
  }
  if (mean < SHEET_MIN || minFrame < FRAME_MIN || drift.length) {
    console.error('refused: below the 3x sheet bars', JSON.stringify(drift));
    process.exitCode = 1;
    return;
  }
  if (DRY) return;

  // Write <name>@3x.png or .webp (lossless, whichever is smaller).
  const stem = join(PUBLIC, SHEET.replace(/\.png$/, ''));
  const tmp = mkdtempSync(join(os.tmpdir(), 'quoin-art-'));
  const tmpPng = join(tmp, 'sheet.png');
  const tmpWebp = join(tmp, 'sheet.webp');
  writeFileSync(tmpPng, three.png);
  execFileSync('magick', [tmpPng, '-strip', '-define', 'png:compression-level=9', tmpPng]);
  execFileSync('magick', [tmpPng, '-define', 'webp:lossless=true', '-define', 'webp:method=6', '-define', 'webp:exact=true', tmpWebp]);
  const useWebp = statSync(tmpWebp).size < statSync(tmpPng).size * 0.9;
  for (const ext of ['png', 'webp']) if (existsSync(`${stem}@3x.${ext}`)) unlinkSync(`${stem}@3x.${ext}`);
  const file = `${stem}@3x.${useWebp ? 'webp' : 'png'}`;
  renameSync(useWebp ? tmpWebp : tmpPng, file);
  rmSync(tmp, { recursive: true, force: true });
  const hires = file.slice(PUBLIC.length + 1);
  console.log(`wrote ${hires} (${statSync(file).size} bytes)`);

  // Register with the 3x sprite list (tools/vector-sprites/results.json -> js/sprite-hires.js).
  const { writeModule } = await import('../vector-sprites/build.mjs');
  const results = JSON.parse(readFileSync(RESULTS, 'utf8'));
  results[SHEET] = {
    animal: 'quoin',
    character: 'quoin',
    source: 'tools/quoin-art',
    status: 'ok',
    hires,
    bytes: statSync(file).size,
    cells: COLS * TYPES.length,
    fw: FW,
    fh: FH,
    scoreKind: 'hand-traced vectors vs the 1x sheet (3:1 box downscale)',
    score: mean,
    minFrame,
    drift: [],
    perType,
    frameScores,
  };
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  writeModule(results);
  console.log('registered in tools/vector-sprites/results.json and public/js/sprite-hires.js');
}

main();
