#!/usr/bin/env node
/**
 * Which SWF frame each cell of a 1x sheet shows, for sheets whose OGA cells
 * are not the label's frames in order (the crab's listen / like / dislike
 * strips hold 24 cells of a 34-frame label). For each cell it scores every
 * rendered frame in [from, to] at one fixed 3x placement (from a sheet of
 * the same SWF that did match, e.g. the crab's walk: offset3x in
 * results.json) and prints the best frame and score, as a sheet "frameList"
 * for build.mjs.
 *
 *   node tools/vector-sprites/frame-match.mjs <1x sheet> <fw> <fh> <cols> <cells> <frameDir> <from> <to> <dx> <dy>
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readRGBA, crop, downscale, compare, scoreOf } from './build.mjs';

const [sheet, fw, fh, cols, cells, frameDir, from, to, dx, dy] = process.argv.slice(2);
const one = readRGBA(resolve(sheet));
const DX = Number(dx);
const DY = Number(dy);
const qx = Math.ceil(DX / 3);
const qy = Math.ceil(DY / 3);
const px = 3 * qx - DX;
const py = 3 * qy - DY;
const renders = new Map();
for (let n = Number(from); n <= Number(to); n++) {
  const f = join(frameDir, `${n}.png`);
  if (existsSync(f)) renders.set(n, downscale(readRGBA(f), px, py));
}
const list = [];
for (let k = 0; k < Number(cells); k++) {
  const cell = crop(one, (k % Number(cols)) * Number(fw), Math.floor(k / Number(cols)) * Number(fh), Number(fw), Number(fh));
  let best = null;
  for (const [n, d] of renders) {
    const s = scoreOf(compare(cell, d, qx, qy));
    if (!best || s > best.s) best = { n, s };
  }
  list.push(best.n);
  console.log(`cell ${k}: frame ${best.n} score ${best.s.toFixed(4)}`);
}
console.log(JSON.stringify(list));
