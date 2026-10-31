#!/usr/bin/env node
/**
 * Build the volcano zone's art: write each piece's SVG (draw.mjs), render it to PNG with
 * rsvg-convert, measure it as intake does (js/builder/colour-stats.js against the role's band in
 * style-profiles.json) and write manifest.json beside the PNGs.
 *
 *   node tools/builder/art/volcano/build.mjs --out <folder> [--only name,name] [--sheets]
 *
 * --sheets also makes contact.png (every piece on mid grey and on near black) and mock.png (the
 * pieces put together as one place) in the folder above --out. Needs rsvg-convert and ImageMagick 7
 * (magick). Drawn by Claude (claude-opus-5-5) for Austin's volcano prompt; CC0 1.0. See draw.mjs.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIECES } from './draw.mjs';
import { colourStats, hueOverlap } from '../../../../public/js/builder/colour-stats.js?v=30f71984';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const out = resolve(opt('--out') || 'volcano-art');
const only = opt('--only') ? new Set(opt('--only').split(',')) : null;
mkdirSync(join(out, 'svg'), { recursive: true });

const profiles = JSON.parse(readFileSync(join(repo, 'public/assets/content/style-profiles.json'), 'utf8'));
const band = (role) => profiles.profiles.default.roles[role]?.palette || null;

/** RGBA bytes of a PNG, through ImageMagick. */
function rgba(file) {
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', file], { encoding: 'utf8' }).trim().split(' ').map(Number);
  const buf = execFileSync('magick', [file, '-depth', '8', 'rgba:-'], { maxBuffer: 1 << 28 });
  return { w, h, px: new Uint8Array(buf.buffer, buf.byteOffset, buf.length) };
}

/** Where the art sits in its file: top surface (median first solid row over the middle 60%), bottom gap. */
function geometry({ w, h, px }) {
  const firstSolid = [];
  for (let x = Math.floor(w * 0.2); x < w * 0.8; x += 4) {
    for (let y = 0; y < h; y += 1) if (px[(y * w + x) * 4 + 3] > 200) { firstSolid.push(y); break; }
  }
  firstSolid.sort((a, b) => a - b);
  let gap = 0;
  outer: for (let y = h - 1; y >= 0; y -= 1) {
    for (let x = 0; x < w; x += 1) if (px[(y * w + x) * 4 + 3] > 0) break outer;
    gap += 1;
  }
  // Intake's square-edges share: solid pixels round the visible box's outline.
  const at = (x, y) => px[(y * w + x) * 4 + 3];
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (at(x, y) > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let edgeSolid = 0;
  let edgeN = 0;
  for (let x = x0; x <= x1; x += 1) { edgeN += 2; edgeSolid += (at(x, y0) > 127) + (at(x, y1) > 127); }
  for (let y = y0; y <= y1; y += 1) { edgeN += 2; edgeSolid += (at(x0, y) > 127) + (at(x1, y) > 127); }
  return { surface: firstSolid.length ? firstSolid[Math.floor(firstSolid.length / 2)] : null, bottomGap: gap, edgeSolid: Math.round((edgeSolid / edgeN) * 100) / 100 };
}

const manifest = [];
for (const p of PIECES) {
  if (only && !only.has(p.args.name)) continue;
  const piece = p.make(p.args);
  const svgFile = join(out, 'svg', `${piece.name}.svg`);
  const pngFile = join(out, `${piece.name}.png`);
  writeFileSync(svgFile, piece.svg);
  execFileSync('rsvg-convert', ['-w', String(piece.w), '-h', String(piece.h), '-b', 'none', '-o', pngFile, svgFile]);
  // A bottom-anchored piece that does not reach its file's bottom (a cloud) loses the empty rows,
  // so intake's registration check sees its visible bottom on the anchor.
  if (p.anchor === 'bottom') {
    const gap = geometry(rgba(pngFile)).bottomGap;
    if (gap > 0) execFileSync('magick', [pngFile, '-gravity', 'north', '-crop', `${piece.w}x${piece.h - gap}+0+0`, '+repage', '-strip', '-define', 'png:exclude-chunks=date,time', pngFile]);
  }
  const img = rgba(pngFile);
  const stats = colourStats(img.px, img.w, img.h, { step: img.w * img.h > 2e6 ? 2 : 1 });
  const g = geometry(img);
  const b = band(p.role);
  const style = b ? {
    l: stats.l, lBand: [b.l[0], b.l[2]], lIn: stats.l >= b.l[0] && stats.l <= b.l[2],
    s: stats.s, sBand: [b.s[0], b.s[2]], sIn: stats.s >= b.s[0] && stats.s <= b.s[2],
    hueOverlap: hueOverlap(stats.hue, b.hue), hueIn: hueOverlap(stats.hue, b.hue) >= 0.25 || stats.hue.every((v) => v === 0),
  } : null;
  let use = p.use;
  if (use === 'topper') use = `Ledge topper: its walkable top is ${g.surface} px under the file's top (${Math.round((g.surface / piece.h) * 1000) / 10}% of its height). Put the platform line on that surface: deco y = line y + (drawn h) x ${Math.round(((piece.h - g.surface) / piece.h) * 1000) / 1000}.`;
  else if (use === 'ground') use = `Ground strip: walkable top ${g.surface} px under the file's top. Lay copies along a floor overlapping by about 8% of their width (the rounded ends hide the joins); deco y = floor y + (drawn h) x ${Math.round(((piece.h - g.surface) / piece.h) * 1000) / 1000}.`;
  else if (use === 'vent') use = 'Middleground on a floor, its bottom on the floor line; the mouth is about 30% down from the file top, centred: put a steam or lava emitter there (emitter y = floor y - drawn h x 0.70).';
  else if (use === 'rim') {
    g.surface = piece.top;
    use = `The top street's crater: middleground, its bottom on (or a little under) the floor. The near lip's flat top (the middle 76% of its width) is ${piece.top} px under the file's top, so a floor line along the lip is at deco y - (drawn h) x ${Math.round(((piece.h - piece.top) / piece.h) * 1000) / 1000}. The far wall and the lava lake are behind it; both ends rise into rock.`;
  }
  manifest.push({ name: piece.name, file: `${piece.name}.png`, role: p.role, anchor: p.anchor, w: img.w, h: img.h, drawn: p.drawn, what: p.what, use, surface: g.surface, bottomGap: g.bottomGap, edgeSolid: g.edgeSolid, stats, style });
  const flag = style ? `${style.lIn ? '' : 'L!'}${style.sIn ? '' : 'S!'}${style.hueIn ? '' : 'H!'}` : '';
  process.stdout.write(`${piece.name.padEnd(30)} ${String(img.w).padStart(4)}x${String(img.h).padEnd(4)} ${p.role.padEnd(12)} l ${stats.l} s ${stats.s} hue ${style?.hueOverlap} gap ${g.bottomGap} edge ${g.edgeSolid} ${flag}\n`);
}
if (!only) writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);

if (args.includes('--sheets')) {
  const up = dirname(out);
  const tiles = manifest.map((m) => join(out, m.file));
  const row = (bg, file) => {
    const parts = tiles.map((t) => ['(', t, '-resize', '240x240>', '-background', bg, '-gravity', 'south', '-extent', '260x260', ')']).flat();
    execFileSync('magick', [...parts, '+append', file]);
  };
  // Two rows of each background, so the sheet stays readable.
  const half = Math.ceil(tiles.length / 2);
  const sheet = (bg, a, b, file) => {
    const one = (list, f) => execFileSync('magick', [...list.map((t) => ['(', t, '-resize', '240x240>', '-background', bg, '-gravity', 'south', '-extent', '260x260', ')']).flat(), '+append', f]);
    one(tiles.slice(0, half), a);
    one(tiles.slice(half), b);
    execFileSync('magick', [a, b, '-background', bg, '-append', file]);
  };
  void row;
  sheet('#808080', join(up, '.c1.png'), join(up, '.c2.png'), join(up, '.cg.png'));
  sheet('#16120f', join(up, '.c3.png'), join(up, '.c4.png'), join(up, '.cd.png'));
  execFileSync('magick', [join(up, '.cg.png'), join(up, '.cd.png'), '-append', `PNG32:${join(up, 'contact.png')}`]);
  // The mock: a 1600 x 1000 view, pieces at their drawn size (half the file).
  const f = (n) => join(out, `gz_ai_${n}.png`);
  const at = (n, scale, x, y, extra = []) => ['(', f(n), '-resize', `${Math.round(scale * 100)}%`, ...extra, ')', '-geometry', `+${Math.round(x)}+${Math.round(y)}`, '-composite'];
  execFileSync('magick', [
    '-size', '1600x1000', 'gradient:#3d3040-#c86a40',
    ...at('ash_haze_sky', 0.45, -100, 330),
    ...at('volcano_cone_far', 0.4, 180, 360),
    ...at('ash_cloud_big', 0.5, 60, 60), ...at('ash_cloud_small', 0.5, 1100, 120),
    ...at('basalt_ridge', 0.5, -200, 520, ['-modulate', '85,80']), ...at('basalt_ridge', 0.5, 1400, 520, ['-modulate', '85,80']),
    ...at('basalt_slope_tall', 0.45, 1250, 0),
    ...at('basalt_columns', 0.5, 40, 560),
    ...at('lava_fall', 0.5, 1110, 330),
    ...at('basalt_ground', 0.5, -40, 880), ...at('basalt_ground', 0.5, 520, 880), ...at('basalt_ground', 0.5, 1080, 880),
    ...at('lava_pool', 0.5, 640, 870),
    ...at('steam_vent', 0.5, 330, 770), ...at('lava_vent', 0.5, 960, 760),
    ...at('basalt_ledge_medium', 0.5, 420, 600), ...at('pumice_ledge_small', 0.5, 800, 470), ...at('basalt_ledge_small', 0.5, 1180, 340),
    ...at('cooled_rock_1', 0.5, 140, 800), ...at('cooled_rock_hot', 0.5, 1340, 790),
    ...at('steam_puff_1', 0.5, 375, 720), ...at('steam_puff_2', 0.6, 395, 670), ...at('steam_puff_1', 0.7, 360, 610), ...at('steam_wisp', 0.8, 380, 560),
    ...at('lava_blob', 0.5, 1030, 700), ...at('lava_drop', 0.5, 1010, 660), ...at('lava_blob', 0.35, 1060, 640), ...at('ember', 0.6, 1000, 610), ...at('ember', 0.5, 1080, 590),
    `PNG32:${join(up, 'mock.png')}`,
  ]);
  for (const t of ['.c1', '.c2', '.c3', '.c4', '.cg', '.cd']) execFileSync('rm', ['-f', join(up, `${t}.png`)]);
}
