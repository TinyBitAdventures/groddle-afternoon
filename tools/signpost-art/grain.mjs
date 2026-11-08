#!/usr/bin/env node
/**
 * Measure the wood grain of Tiny Speck's 1x signpost PNGs (CC0) and write it
 * into the hand-traced SVGs in tools/signpost-art/svg/, between their
 * `<!-- grain -->` and `<!-- /grain -->` markers.
 *
 * The outlines, the post's dome, the foot's shoulder and the arm's rounded end
 * are drawn by hand in each SVG. The grain is fine streaks that run the length
 * of the wood, one 1x pixel across, so it is measured instead of guessed:
 *  - post and foot: one strip per 1x column, coloured along the grain by a
 *    vertical gradient of that column's colours (rows averaged in fours);
 *  - arm: one band per 1x row, coloured along the grain by a horizontal
 *    gradient of that row's colours (columns averaged in threes).
 * Each strip keeps a crisp edge to its neighbour, so at 3x the grain stays a set
 * of sharp lines instead of the 1x pixels' blur. Colours are the 1x pixels'
 * own (alpha divided out); outline pixels are left to the drawn outlines.
 *
 * Usage: node tools/signpost-art/grain.mjs [--check]
 *   --check  exit 1 if an SVG's grain differs from what the PNGs give
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage } from '../quoin-art/pixels.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, '../../public');
const DIR = 'assets/ui/signpost/';

/** The outline colour (#231f20) and anything darker than this luminance is outline, not grain. */
const OUTLINE_LUMA = 0x2a;

const hex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const luma = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const num = (n) => String(+n.toFixed(2));

/** Straight colour of a 1x pixel, or null where it is (nearly) empty. */
function colour(img, x, y, minAlpha = 0.2) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return null;
  const s = (y * img.w + x) * 4, a = img.p[s + 3];
  if (a < minAlpha * 255) return null;
  return [0, 1, 2].map((k) => (img.p[s + k] / a) * 255);
}

function mean(cs) {
  const ok = cs.filter(Boolean);
  if (!ok.length) return null;
  return [0, 1, 2].map((k) => ok.reduce((t, c) => t + c[k], 0) / ok.length);
}

/** Gradient stops along a run of samples [{ at, c }], dropping stops a straight line already gives. */
function stops(samples, lo, hi) {
  const keep = samples.filter((s, i) => {
    if (i === 0 || i === samples.length - 1) return true;
    const a = samples[i - 1], b = samples[i + 1];
    const t = (s.at - a.at) / (b.at - a.at);
    return s.c.some((v, k) => Math.abs(v - (a.c[k] + (b.c[k] - a.c[k]) * t)) > 1.2);
  });
  return keep.map((s) => `<stop offset="${num((s.at - lo) / (hi - lo))}" stop-color="${hex(s.c)}"/>`).join('');
}

/**
 * Vertical strips, one per 1x column x0..x1, over rows y0..y1 (drawn from top to bottom),
 * sampled over rows s0..s1 in blocks of `block`.
 */
function columnStrips(img, id, { x0, x1, top, bottom, s0, s1, block = 4, keepDark = false }) {
  const defs = [], rects = [];
  for (let x = x0; x <= x1; x++) {
    const samples = [];
    for (let y = s0; y <= s1; y += block) {
      const rows = [];
      for (let j = y; j < Math.min(y + block, s1 + 1); j++) rows.push(j);
      const c = mean(rows.map((j) => colour(img, x, j)).filter((c) => c && (keepDark || luma(c) > OUTLINE_LUMA)));
      if (c) samples.push({ at: (rows[0] + rows[rows.length - 1]) / 2 + 0.5, c });
    }
    if (!samples.length) continue;
    const lo = samples[0].at, hi = samples[samples.length - 1].at;
    if (samples.length === 1) {
      rects.push(`<rect x="${x}" y="${top}" width="1" height="${num(bottom - top)}" fill="${hex(samples[0].c)}"/>`);
      continue;
    }
    defs.push(`<linearGradient id="${id}${x}" gradientUnits="userSpaceOnUse" x1="0" y1="${num(lo)}" x2="0" y2="${num(hi)}">${stops(samples, lo, hi)}</linearGradient>`);
    rects.push(`<rect x="${x}" y="${top}" width="1" height="${num(bottom - top)}" fill="url(#${id}${x})"/>`);
  }
  return { defs, rects };
}

/**
 * Horizontal bands, one per 1x row y0..y1, over columns left..right, sampled over columns
 * s0..s1 in blocks of `block`. A sample that is outline takes the colour of the nearest row
 * above that is grain (the bottom rows run into the dark outline at the left end).
 */
function rowBands(img, id, { y0, y1, left, right, s0, s1, block = 3 }) {
  const defs = [], rects = [];
  /** @type {Map<number, number[]>} last grain colour per block start, from the row above */
  const above = new Map();
  for (let y = y0; y <= y1; y++) {
    const samples = [];
    for (let x = s0; x <= s1; x += block) {
      const cols = [];
      for (let i = x; i < Math.min(x + block, s1 + 1); i++) cols.push(i);
      let c = mean(cols.map((i) => colour(img, i, y, 0.35)).filter((c) => c && luma(c) > OUTLINE_LUMA + 6));
      if (c) above.set(x, c);
      else c = above.get(x) || null;
      if (c) samples.push({ at: (cols[0] + cols[cols.length - 1]) / 2 + 0.5, c });
    }
    if (!samples.length) continue;
    const lo = samples[0].at, hi = samples[samples.length - 1].at;
    defs.push(`<linearGradient id="${id}${y}" gradientUnits="userSpaceOnUse" x1="${num(lo)}" y1="0" x2="${num(hi)}" y2="0">${stops(samples, lo, hi)}</linearGradient>`);
    rects.push(`<rect x="${left}" y="${y}" width="${num(right - left)}" height="1" fill="url(#${id}${y})"/>`);
  }
  return { defs, rects };
}

/** The grain groups each SVG gets, by SVG name. */
export function grainFor(name) {
  if (name === 'post') {
    const img = readImage(join(PUBLIC, DIR, 'signpost_post.webp'));
    // The shaft: columns 9 (the half-covered left edge) to 34 (the right outline, kept dark).
    const shaft = columnStrips(img, 'g', { x0: 9, x1: 33, top: 0, bottom: 225, s0: 3, s1: 222 });
    const edge = columnStrips(img, 'e', { x0: 34, x1: 34, top: 0, bottom: 225, s0: 3, s1: 219, block: 8, keepDark: true });
    // The foot: every column it covers, below the shaft's end.
    const foot = columnStrips(img, 'f', { x0: 0, x1: 42, top: 219, bottom: 246, s0: 225, s1: 243, block: 3, keepDark: true });
    return {
      shaft: [...shaft.defs, ...edge.defs, ...shaft.rects, ...edge.rects],
      foot: [...foot.defs, ...foot.rects],
    };
  }
  if (name === 'arm') {
    const img = readImage(join(PUBLIC, DIR, 'signpost_arm.webp'));
    const bands = rowBands(img, 'g', { y0: 0, y1: 28, left: 0, right: 260, s0: 3, s1: 257 });
    return { arm: [...bands.defs, ...bands.rects] };
  }
  return {};
}

/** Replace each `<!-- grain:<key> -->...<!-- /grain:<key> -->` block with the measured grain. */
export function withGrain(svg, groups) {
  let out = svg;
  for (const [key, lines] of Object.entries(groups)) {
    const re = new RegExp(`(<!-- grain:${key} -->)[\\s\\S]*?(\\s*<!-- /grain:${key} -->)`);
    if (!re.test(out)) throw new Error(`no grain:${key} block`);
    out = out.replace(re, (_, a, b) => `${a}\n${lines.map((l) => `      ${l}`).join('\n')}${b}`);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const name of ['post', 'arm']) {
    const file = join(HERE, 'svg', `${name}.svg`);
    const svg = readFileSync(file, 'utf8');
    const next = withGrain(svg, grainFor(name));
    if (next === svg) continue;
    if (check) {
      console.error(`stale grain: svg/${name}.svg`);
      stale++;
    } else {
      writeFileSync(file, next);
      console.log(`wrote grain: svg/${name}.svg`);
    }
  }
  if (stale) process.exitCode = 1;
}
