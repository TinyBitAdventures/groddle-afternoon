#!/usr/bin/env node
/**
 * The pictures of the Our additions section of /restoration/ (Austin 2026-11-25, #699, G1308:
 * "a compare section ... so we can document the original artwork next to our addition"): each
 * addition of ours beside the Tiny Speck original it stands in for. Written to
 * public/assets/made-art/compare/ and recorded in tools/made-art/compare.json `files` (sha256, size,
 * what it shows and how it was made), which tools/made-art/build-data.mjs checks against the files.
 *
 * Groups:
 *   stats     the six stat icons (js/stat-icons.js) as SVG, from the code itself, one per stat and a
 *             grid of all six; Tiny Speck's six slug_<stat>_pos pictures (public/assets/classic/) in a
 *             grid, each at 4x with its pixels kept; the Imagination cards' icon_currant vector
 *             cropped to the icon (the card's own SVG, a new viewBox; the cards' iMG mark is shipped
 *             cropped already, assets/imagination/ui/moment_icon_imagination.svg).
 *   wardrobe  the reimagined wardrobe (G52): each article on the default look, Tiny Speck's
 *             greyscale file beside our first colourway, from the bare figures of
 *             tools/avatar-compositor/showcase.mjs --figures --max 1 (Chrome), and two side by side for the card.
 *
 *   node tools/made-art/compare-art.mjs [--only stats,wardrobe] [--wardrobe <showcase out dir>]
 *
 * --only recomposes those groups and keeps every other record. Only Tiny Speck's CC0 art and our
 * own: never a player's snap, footage or video frame.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GAME_DIR } from '../repos.mjs';
import { imageSize } from '../image-size.mjs';
import { statIconInner, statIconSvg } from '../../public/js/stat-icons.js?v=36d17f30';

export const COMPARE = join(GAME_DIR, 'tools/made-art/compare.json');
export const DIR = 'public/assets/made-art/compare';

/** The stats in the top bar's order, then favor. */
export const STATS = Object.freeze(['energy', 'mood', 'xp', 'imagination', 'currants', 'favor']);
/** Each stat icon at 4x its 16 px box, in a grid of three by two: cells wide enough for the widest slug at 4x. */
const ICON = 64;
const CELL = Object.freeze({ w: 80, h: 72, gap: 16, cols: 3 });
/** Tiny Speck's slugs at 4x, nearest neighbour, so every pixel shows. */
const SLUG_SCALE = 4;
const GRID = Object.freeze({ w: CELL.cols * CELL.w + (CELL.cols - 1) * CELL.gap, h: 2 * CELL.h + CELL.gap });
/** The top-left corner of stat i's cell. */
const cellAt = (i) => [(i % CELL.cols) * (CELL.w + CELL.gap), Math.floor(i / CELL.cols) * (CELL.h + CELL.gap)];

/** One stat icon as a file of its own (64 px, the code's 16 px box at 4x). */
export const oursIconSvg = (type) => `${statIconSvg(type, { size: ICON })}\n`;

/** The six stat icons in a grid of three by two (the slugs' grid), the code's shapes at 4x, each centred in its cell. */
export function oursGridSvg() {
  const groups = STATS.map((t, i) => {
    const [x, y] = cellAt(i);
    return `<g transform="translate(${x + (CELL.w - ICON) / 2} ${y + (CELL.h - ICON) / 2}) scale(${ICON / 16})">${statIconInner(t)}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID.w} ${GRID.h}" width="${GRID.w}" height="${GRID.h}">${groups}</svg>\n`;
}

/** A Tiny Speck card vector cropped to its icon: the same file with a viewBox round its drawing. */
export function croppedSvg(svg, [x, y, w, h]) {
  const head = /<svg\b[^>]*>/.exec(svg)?.[0];
  if (!head) throw new Error('not an SVG');
  const r = (v) => String(Math.round(v * 100) / 100);
  const next = head
    .replace(/\swidth="[^"]*"/, ` width="${r(w)}"`)
    .replace(/\sheight="[^"]*"/, ` height="${r(h)}"`)
    .replace(/\sviewBox="[^"]*"/, ` viewBox="${r(x)} ${r(y)} ${r(w)} ${r(h)}"`);
  return svg.replace(head, next);
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const rel = (name) => `${DIR}/${name}`;
const abs = (file) => join(GAME_DIR, file);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();

/** The drawing's box in a vector's own units: rendered at 10x, trimmed, padded by one unit. */
function vectorBox(file) {
  const tmp = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'compare-'));
  try {
    const png = join(tmp, 'big.png');
    run('rsvg-convert', ['-z', '10', abs(file), '-o', png]);
    const [w, h, x, y] = run('magick', [png, '-trim', '-format', '%w %h %X %Y', 'info:']).trim().split(/\s+/).map((v) => Number(v.replace('+', '')));
    // Whole units round the drawing, one unit of margin, so the file has a whole width and height.
    const x0 = Math.floor(x / 10) - 1;
    const y0 = Math.floor(y / 10) - 1;
    return [x0, y0, Math.ceil((x + w) / 10) + 1 - x0, Math.ceil((y + h) / 10) + 1 - y0];
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function record(files, name, buf, what, made, from = []) {
  const file = rel(name);
  writeFileSync(abs(file), buf);
  const size = /\.svg$/.test(name) ? svgSize(buf.toString('utf8')) : imageSize(buf);
  files[file] = { what, w: size.w, h: size.h, sha256: sha(buf), made, ...(from.length ? { from } : {}) };
}

/** An SVG file's width and height (its root's width and height). */
export function svgSize(svg) {
  const head = /<svg\b[^>]*>/.exec(svg)?.[0] || '';
  const w = Number(/\swidth="([\d.]+)"/.exec(head)?.[1]);
  const h = Number(/\sheight="([\d.]+)"/.exec(head)?.[1]);
  if (!(w > 0 && h > 0)) throw new Error('an SVG with no width and height');
  return { w, h };
}

function stats(files) {
  for (const t of STATS) {
    record(files, `stat-${t}-ours.svg`, Buffer.from(oursIconSvg(t)), `Our ${t} icon (js/stat-icons.js statIconSvg at 64 px)`, 'written from the code by compare-art.mjs');
  }
  record(files, 'stat-icons-ours.svg', Buffer.from(oursGridSvg()), 'Our six stat icons, three by two: energy, mood, xp, then iMG, currants, favor', 'written from the code by compare-art.mjs (statIconInner at 4x)');
  // Tiny Speck's six slugs at 4x with their pixels, each centred in the same cell as our icon.
  const slugs = STATS.map((t) => `public/assets/classic/slug_${t}_pos.webp`);
  const tmp = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'compare-'));
  try {
    const out = join(tmp, 'grid.png');
    const args = ['-size', `${GRID.w}x${GRID.h}`, 'xc:none'];
    for (const [i, s] of slugs.entries()) {
      const size = imageSize(abs(s));
      const [x, y] = cellAt(i);
      const ox = x + Math.round((CELL.w - size.w * SLUG_SCALE) / 2);
      const oy = y + Math.round((CELL.h - size.h * SLUG_SCALE) / 2);
      args.push('(', abs(s), '-filter', 'point', '-resize', `${SLUG_SCALE * 100}%`, ')', '-geometry', `+${ox}+${oy}`, '-composite');
    }
    run('magick', [...args, out]);
    const webp = join(tmp, 'grid.webp');
    run('cwebp', ['-quiet', '-lossless', '-exact', out, '-o', webp]);
    record(files, 'stat-icons-original.webp', readFileSync(webp), "Tiny Speck's six slugs, three by two: slug_energy_pos, slug_mood_pos, slug_xp_pos, then slug_imagination_pos, slug_currants_pos, slug_favor_pos",
      `each shipped slug at ${SLUG_SCALE}x nearest neighbour, centred in the cell our icon takes (magick -composite), cwebp -lossless -exact`,
      slugs.map((s) => ({ file: s, sha256: sha(readFileSync(abs(s))) })));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  for (const card of ['currant']) {
    const src = `public/assets/imagination/cards/icon_${card}.svg`;
    const box = vectorBox(src);
    record(files, `card-${card}-original.svg`, Buffer.from(croppedSvg(readFileSync(abs(src), 'utf8'), box)), `Tiny Speck's icon_${card} vector from the Imagination cards, cropped to the icon`,
      `the card's own SVG with its viewBox set round the drawing (rsvg-convert at 10x, trimmed, one unit of margin)`, [{ file: src, sha256: sha(readFileSync(abs(src))) }]);
  }
}

/** The articles side by side on the card (the popup steps through every one): a hat and a dress. */
export const WARDROBE_STRIP = Object.freeze(['banana_hat', 'teaport']);

function wardrobe(files, dir) {
  if (!dir || !existsSync(join(dir, 'figures'))) throw new Error('--wardrobe <dir>: the out dir of tools/avatar-compositor/showcase.mjs --figures --max 1');
  const catalog = JSON.parse(readFileSync(abs('public/assets/avatar/catalog.json'), 'utf8'));
  const items = Object.values(catalog.types).flat().filter((i) => i.reimagined).map((i) => i.name);
  const tmp = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'compare-'));
  try {
    const webp = (png, name, what) => {
      const out = join(tmp, `${name}.webp`);
      run('cwebp', ['-quiet', '-q', '90', '-alpha_q', '100', png, '-o', out]);
      record(files, name.endsWith('.webp') ? name : `${name}.webp`, readFileSync(out), what,
        'tools/avatar-compositor/showcase.mjs --figures --max 1 (the default look at the stand frame, scale 3), cwebp -q 90');
    };
    for (const name of items) {
      for (const [n, side] of [[0, 'original'], [1, 'ours']]) {
        const png = join(dir, 'figures', `${name}-${n}.png`);
        if (!existsSync(png)) throw new Error(`${png} is missing`);
        webp(png, `wardrobe-${name}-${side}`, `${name} on the default look: ${side === 'original' ? "Tiny Speck's greyscale file as it is" : 'our first colourway'}`);
      }
    }
    for (const [n, side] of [[0, 'original'], [1, 'ours']]) {
      const strip = join(tmp, `strip-${side}.png`);
      run('magick', [...WARDROBE_STRIP.map((name) => join(dir, 'figures', `${name}-${n}.png`)), '-background', 'none', '+append', strip]);
      webp(strip, `wardrobe-strip-${side}`, `${WARDROBE_STRIP.join(', ')} side by side: ${side === 'original' ? "Tiny Speck's greyscale files" : 'our colourways'}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main(argv) {
  const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : null);
  const only = opt('only')?.split(',') || ['stats', 'wardrobe'];
  const compare = JSON.parse(readFileSync(COMPARE, 'utf8'));
  mkdirSync(abs(DIR), { recursive: true });
  const keep = Object.fromEntries(Object.entries(compare.files || {}).filter(([file]) => !only.some((g) => (g === 'stats' ? /\/(?:stat|card)-/ : /\/wardrobe-/).test(file))));
  const files = { ...keep };
  if (only.includes('stats')) stats(files);
  if (only.includes('wardrobe')) wardrobe(files, opt('wardrobe'));
  compare.files = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(COMPARE, `${JSON.stringify(compare, null, 1)}\n`);
  console.log(`wrote ${Object.keys(files).length - Object.keys(keep).length} picture(s) to ${DIR}, recorded in tools/made-art/compare.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
