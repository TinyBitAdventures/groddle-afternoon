#!/usr/bin/env node
/**
 * Sharp 3x signpost art from hand-traced vectors.
 *
 * Tiny Speck's signpost post, arm and shadow only survive as 1x PNGs
 * (glitch-client TSEngineAssets/src/assets/graphics/signpost_post.png,
 * signpost_arm.png, signpost_shadow.png, embedded as plain bitmaps by
 * Assets.as), so there is no vector or larger original. The 2012 client drew
 * them at holder scale 0.8 on a 1x Flash stage; the remake draws them about 2x
 * to 2.8x on a 2x laptop screen, where the 1x pixels go soft. The art here is
 * a hand trace of those 1x PNGs (CC0): one SVG each in tools/signpost-art/svg/,
 * outlines drawn over enlarged 1x pixels with colours sampled from them, and
 * the wood grain measured from the pixels (grain.mjs). Nothing comes from
 * videos, screenshots, other remakes or image generators.
 *
 * 1. Each SVG is rendered with rsvg-convert at exactly 3x its PNG.
 * 2. The render is box-downscaled 3:1 and scored against the 1x PNG (the
 *    tools/vector-sprites measure); one that prefers a one-pixel shift is
 *    refused as drift, and so is one below the vector-sprites bars.
 * 3. Each 3x is written beside its 1x file as <name>@3x.png (or .webp when
 *    lossless WebP is smaller), registered in tools/vector-sprites/results.json
 *    and public/js/sprite-hires.js is regenerated, so js/textures.js loads it at
 *    resolution 3 wherever the 1x URL is used on a dense screen (street
 *    signposts, the home street's way out and its friends' signpost alike);
 *    sizes stay in 1x units, so every signpost keeps its place and size.
 *
 * Usage: node tools/signpost-art/build.mjs [--dry] [--contact <out.png>]
 *   --dry      render and score only (no files written)
 *   --contact  also write a 1x-vs-3x contact sheet for review
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeLosslessWebp } from '../webp-lossless.mjs';
import os from 'node:os';
import { downscale, readImage, renderSvg, score, toBytes } from '../quoin-art/pixels.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const PUBLIC = join(ROOT, 'public');
const RESULTS = join(ROOT, 'tools/vector-sprites/results.json');

/** The three signpost PNGs and their traces. */
export const PARTS = Object.freeze([
  { id: 'post', png: 'assets/ui/signpost/signpost_post.webp', svg: 'svg/post.svg' },
  { id: 'arm', png: 'assets/ui/signpost/signpost_arm.webp', svg: 'svg/arm.svg' },
  { id: 'shadow', png: 'assets/ui/signpost/signpost_shadow.webp', svg: 'svg/shadow.svg' },
]);

/** Same bars as tools/vector-sprites (tests/vector-sprites.test.js checks them). */
export const PART_MIN = 0.9;

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

/** Contact sheet: each part's 1x point-enlarged 3x beside its 3x render, on a mid grey. */
function writeContact(rows, file) {
  const gap = 12;
  const W = Math.max(...rows.map(({ one }) => one.w * 6 + gap * 3));
  const H = rows.reduce((t, { one }) => t + one.h * 3 + gap, gap);
  const out = { w: W, h: H, p: new Float32Array(W * H * 4) };
  for (let i = 0; i < W * H; i++) { out.p[i * 4] = 122; out.p[i * 4 + 1] = 138; out.p[i * 4 + 2] = 154; out.p[i * 4 + 3] = 255; }
  const over = (o, src) => {
    const a = src[3] / 255;
    for (let k = 0; k < 3; k++) out.p[o + k] = src[k] + out.p[o + k] * (1 - a);
  };
  let y0 = gap;
  for (const { one, three } of rows) {
    const xa = gap, xb = gap * 2 + one.w * 3;
    for (let y = 0; y < one.h * 3; y++) for (let x = 0; x < one.w * 3; x++) {
      const s1 = (Math.floor(y / 3) * one.w + Math.floor(x / 3)) * 4;
      over(((y0 + y) * W + xa + x) * 4, one.p.subarray(s1, s1 + 4));
      const s3 = (y * three.w + x) * 4;
      over(((y0 + y) * W + xb + x) * 4, three.p.subarray(s3, s3 + 4));
    }
    y0 += one.h * 3 + gap;
  }
  execFileSync('magick', ['-size', `${W}x${H}`, '-depth', '8', 'rgba:-', file], { input: toBytes(out) });
}

async function main() {
  const rows = [];
  let refused = false;
  for (const part of PARTS) {
    const one = readImage(join(PUBLIC, part.png));
    const svg = readFileSync(join(HERE, part.svg), 'utf8');
    const three = renderSvg(svg, one.w * 3, one.h * 3);
    const small = downscale(three, 3);
    const s = score(one, small);
    let best = { s, dx: 0, dy: 0 };
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
      if (!dx && !dy) continue;
      const t = score(one, shifted(small, dx, dy));
      if (t > best.s + 0.01) best = { s: t, dx, dy };
    }
    const drift = best.dx || best.dy ? [{ dx: best.dx, dy: best.dy }] : [];
    console.log(`${part.id.padEnd(7)} score ${s.toFixed(4)}${drift.length ? `  drift ${best.dx},${best.dy}` : ''}`);
    if (s < PART_MIN || drift.length) refused = true;
    rows.push({ part, one, three, score: +s.toFixed(4), drift });
  }
  if (CONTACT) {
    writeContact(rows, CONTACT);
    console.log(`contact sheet: ${CONTACT}`);
  }
  if (refused) {
    console.error('refused: below the 3x bars or drifting');
    process.exitCode = 1;
    return;
  }
  if (DRY) return;

  const { writeModule } = await import('../vector-sprites/build.mjs');
  const results = JSON.parse(readFileSync(RESULTS, 'utf8'));
  for (const { part, one, three, score: s } of rows) {
    // Write <name>@3x.png or .webp (lossless, whichever is smaller).
    const stem = join(PUBLIC, part.png.replace(/\.(png|webp)$/, ''));
    const tmp = mkdtempSync(join(os.tmpdir(), 'signpost-art-'));
    const tmpPng = join(tmp, 'part.png');
    const tmpWebp = join(tmp, 'part.webp');
    writeFileSync(tmpPng, three.png);
    execFileSync('magick', [tmpPng, '-strip', '-define', 'png:compression-level=9', tmpPng]);
    encodeLosslessWebp(tmpPng, tmpWebp);
    const useWebp = statSync(tmpWebp).size < statSync(tmpPng).size; // lossless WebP whenever smaller (Austin 2026-11-07)
    for (const ext of ['png', 'webp']) if (existsSync(`${stem}@3x.${ext}`)) unlinkSync(`${stem}@3x.${ext}`);
    const file = `${stem}@3x.${useWebp ? 'webp' : 'png'}`;
    renameSync(useWebp ? tmpWebp : tmpPng, file);
    rmSync(tmp, { recursive: true, force: true });
    const hires = file.slice(PUBLIC.length + 1);
    console.log(`wrote ${hires} (${statSync(file).size} bytes)`);
    results[part.png] = {
      animal: 'signpost',
      character: 'signpost',
      source: 'tools/signpost-art',
      status: 'ok',
      hires,
      bytes: statSync(file).size,
      cells: 1,
      fw: one.w,
      fh: one.h,
      scoreKind: 'hand-traced vectors vs the 1x PNG (3:1 box downscale)',
      score: s,
      minFrame: s,
      drift: [],
      frameScores: [s],
    };
  }
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  writeModule(results);
  console.log('registered in tools/vector-sprites/results.json and public/js/sprite-hires.js');
}

main();
