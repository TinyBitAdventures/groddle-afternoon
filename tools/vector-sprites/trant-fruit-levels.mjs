#!/usr/bin/env node
/**
 * Reports #545, #735: the trant art Tiny Speck's OGA cells do not have, drawn from the SWFs
 * (glitch-items, CC0) the way the client drew each tree (updateTrantDisplay, trant-states.mjs):
 *
 *  - the 1x still of each maturity with no OGA cell (2, 4, 6, 8, 9: trant-states.mjs `drawn`
 *    jobs), at health 10 holding all its fruit;
 *  - the 1x bare still of each maturity that bears fruit (trant_<species>_m<stage>_f0);
 *  - every fruit count between bare and full, as pieces laid on the bare still: piece k is the
 *    box where showing fruit k changes the picture (Glitch shows fruit in id order, so the look
 *    holding k fruit is the bare still with pieces 1..k pasted over it, each replacing its box).
 *    The pieces of one stage are packed in trant_<species>_m<stage>_fruit.webp and its @3x, and
 *    public/js/trant-fruit-pieces.js says where each one sits (js/trant-looks.js draws them).
 *
 * Every state of a stage is frozen into one work SWF (swf-state.mjs freezeStates) and drawn in one
 * FFDec export at 3x, on the full state's canvas, so they line up to the pixel; the bubble tree
 * goes through Chromium (svg-raster.mjs, under the browser lock). A stage with an OGA cell is placed
 * where build.mjs placed its full still (results.json offset3x); the other five are placed by the
 * SWF registration point, between their neighbours' (FFDec's SVG export gives it), so a tree grows
 * in place. 1x is the 3:1 box downscale, premultiplied. Then build.mjs writes the stills' @3x files
 * as for any other sheet (it matches its render against the 1x written here):
 *
 *   node tools/vector-sprites/trant-states.mjs --write
 *   node tools/vector-sprites/trant-fruit-levels.mjs [--work dir] [--only <species or job name>]
 *   node tools/vector-sprites/build.mjs --manifest tools/vector-sprites/harvestables.json --only trant-
 *   node tools/vector-sprites/trant-fruit-levels.mjs --verify   the built @3x stills equal the renders
 *
 * A later health-on-the-leaves pass (Glitch's fol_N gotoAndStop(health +/- jitter)) would draw one
 * bare still per health the same way (trant-states.mjs fruitState takes the health); the pieces
 * stay as they are.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { FFDEC, JAVA } from './swf-labels.mjs';
import { freezeStates } from './swf-state.mjs';
import { rasteriseSvgs } from './svg-raster.mjs';
import { svgFrame } from './aligned-art.mjs';
import { FRUIT_ROUNDING, OGA_STAGES, fruitShownState, trantStages } from './trant-states.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = resolve(HERE, '../../public');
const MODULE = join(PUBLIC, 'js/trant-fruit-pieces.js');
const ITEMS = join(os.homedir(), 'Documents/glitch-audit/glitch-items');
const S = 3;
const FRAMES = 'assets/sprites/trants/frames';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const WORK = resolve(opt('work', join(os.tmpdir(), 'trant-fruit-levels')));
const only = opt('only', '');
const VERIFY = args.includes('--verify');

function readRGBA(file) {
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', file], { encoding: 'utf8' }).trim().split(' ').map(Number);
  const raw = execFileSync('magick', [file, '-depth', '8', 'rgba:-'], { maxBuffer: 1 << 28 });
  return { w, h, raw: new Uint8Array(raw.buffer, raw.byteOffset, raw.length) };
}

/** The 3x cell: `img` placed at (dx, dy), clipped. */
function cell(img, fw3, fh3, dx, dy) {
  const out = new Uint8Array(fw3 * fh3 * 4);
  for (let y = 0; y < img.h; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= fh3) continue;
    for (let x = 0; x < img.w; x++) {
      const tx = x + dx;
      if (tx < 0 || tx >= fw3) continue;
      out.set(img.raw.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4), (ty * fw3 + tx) * 4);
    }
  }
  return out;
}

/** A w x h crop at (x, y) of a W-wide RGBA image. */
function crop(raw, W, x, y, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) out.set(raw.subarray(((y + j) * W + x) * 4, ((y + j) * W + x + w) * 4), j * w * 4);
  return out;
}

/** 3:1 box downscale, premultiplied. */
function downscale(raw, w3, h3) {
  const w = w3 / S;
  const h = h3 / S;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const p = ((y * S + j) * w3 + x * S + i) * 4;
          const al = raw[p + 3];
          r += raw[p] * al; g += raw[p + 1] * al; b += raw[p + 2] * al; a += al;
        }
      }
      const d = (y * w + x) * 4;
      if (a) {
        out[d] = Math.round(r / a); out[d + 1] = Math.round(g / a); out[d + 2] = Math.round(b / a);
      }
      out[d + 3] = Math.round(a / (S * S));
    }
  }
  return out;
}

function writeWebp(raw, w, h, file) {
  const png = `${file}.tmp.png`;
  execFileSync('magick', ['-size', `${w}x${h}`, '-depth', '8', 'rgba:-', `PNG32:${png}`], { input: raw, maxBuffer: 1 << 28 });
  execFileSync('cwebp', ['-quiet', '-lossless', '-exact', '-z', '9', '-metadata', 'none', png, '-o', file]);
  unlinkSync(png);
}

/** The box (3x px, snapped out to whole 1x px) where two cells differ, or null. */
function changedBox(a, b, fw3, fh3) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < fh3; y++) {
    for (let x = 0; x < fw3; x++) {
      const p = (y * fw3 + x) * 4;
      if (a[p] === b[p] && a[p + 1] === b[p + 1] && a[p + 2] === b[p + 2] && a[p + 3] === b[p + 3]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const x = Math.floor(x0 / S);
  const y = Math.floor(y0 / S);
  return { x, y, w: Math.floor(x1 / S) + 1 - x, h: Math.floor(y1 / S) + 1 - y };
}

/** Shelf-pack boxes ({ w, h }, 1x) into one sheet: sets each box's ax, ay; returns { W, H }. */
function pack(boxes) {
  const area = boxes.reduce((n, b) => n + b.w * b.h, 0);
  const W = Math.max(...boxes.map((b) => b.w), Math.ceil(Math.sqrt(area) * 1.15));
  let x = 0, y = 0, row = 0;
  for (const b of [...boxes].sort((p, q) => q.h - p.h || q.w - p.w)) {
    if (x + b.w > W) {
      x = 0;
      y += row;
      row = 0;
    }
    b.ax = x;
    b.ay = y;
    x += b.w;
    row = Math.max(row, b.h);
  }
  return { W, H: y + row };
}

/** FFDec's export of frame `frame` of sprites `ids` (png, or svg): file per id. */
function exportSprites(swf, ids, frame, fmt, dir) {
  rmSync(dir, { recursive: true, force: true });
  execFileSync(JAVA, ['-jar', FFDEC, '-zoom', String(S), '-select', ids.map((id) => `${id}:${frame}-${frame}`).join(','), '-selectid', ids.join(','), '-format', `sprite:${fmt}`, '-export', 'sprite', dir, swf], { stdio: 'ignore' });
  const subs = readdirSync(dir);
  return ids.map((id) => {
    const sub = subs.find((n) => n === `DefineSprite_${id}` || n.startsWith(`DefineSprite_${id}_`));
    if (!sub) throw new Error(`${swf}: no export of sprite ${id}`);
    return join(dir, sub, `${frame}.${fmt}`);
  });
}

async function rasterise(jobs) {
  const { acquireLock } = await import('../qa/browser-lock.mjs');
  const lock = await acquireLock({ label: 'trant-fruit-levels svg' });
  try {
    await rasteriseSvgs(jobs);
  } finally {
    lock.release();
  }
}

/**
 * One stage drawn in every state, on one canvas: the full state first, then 0..K-1 fruit shown.
 * { cells: [k] -> 3x cell RGBA (k = 0..K), reg: [x, y] of the registration point in the render }.
 */
async function renderStage(st, placeOf) {
  const name = `trant-${st.species}-m${st.maturity}`;
  const K = st.ids.length;
  const states = [st.set, ...Array.from({ length: K }, (_, k) => fruitShownState(st.species, st.set, st.ids, k))];
  const dir = join(WORK, name);
  mkdirSync(dir, { recursive: true });
  const swf = join(dir, 'states.swf');
  const { ids, missing } = freezeStates(join(ITEMS, st.swf), swf, st.sprite, states);
  if (missing.length) throw new Error(`${name}: not placed: ${missing.join(' ')}`);
  const svgs = exportSprites(swf, st.renderer === 'svg' ? ids : ids.slice(0, 1), st.frame, 'svg', join(dir, 'svg'));
  const f = svgFrame(readFileSync(svgs[0], 'utf8'));
  let pngs;
  if (st.renderer === 'svg') {
    pngs = svgs.map((svg, i) => join(dir, `${i}.png`));
    await rasterise(svgs.map((svg, i) => ({ svg, png: pngs[i] })));
  } else {
    pngs = exportSprites(swf, ids, st.frame, 'png', join(dir, 'png'));
  }
  const renders = pngs.map(readRGBA);
  for (const r of renders) {
    if (r.w !== renders[0].w || r.h !== renders[0].h) throw new Error(`${name}: states on different canvases (${r.w}x${r.h}, ${renders[0].w}x${renders[0].h})`);
  }
  const [fw, fh] = st.cell;
  const [dx, dy] = placeOf(st, [f.tx, f.ty], renders[0]);
  const full = cell(renders[0], fw * S, fh * S, dx, dy);
  const cells = [...renders.slice(1).map((r) => cell(r, fw * S, fh * S, dx, dy)), full];
  return { cells, reg: [f.tx, f.ty], at: [dx, dy], size: [renders[0].w, renders[0].h] };
}

function readModule() {
  if (!existsSync(MODULE)) return {};
  const src = readFileSync(MODULE, 'utf8');
  return JSON.parse(src.slice(src.indexOf('= ') + 2, src.lastIndexOf(';')));
}

function writeModule(data) {
  const body = JSON.stringify(data, (k, v) => (Array.isArray(v) && v.every((n) => typeof n === 'number') ? `[${v.join(',')}]` : v), 1)
    .replace(/"\[([\d,]*)\]"/g, '[$1]');
  writeFileSync(MODULE, `/**
 * #735: the fruit pieces of each trant stage (generated by tools/vector-sprites/trant-fruit-levels.mjs;
 * do not edit by hand). Per species: Glitch's fruit slots, slots[maturity - 1][health - 1]
 * (updateTrantDisplay: fruitPosArray / getFruitingPos), how fruit_amt of them rounds, and per
 * maturity that bears fruit the clip ids in the order Glitch shows them and one piece per id:
 * [atlas x, atlas y, w, h, x, y] in 1x px (atlas trant_<species>_m<stage>_fruit.webp, its @3x at 3x
 * those numbers), or 0 when that fruit changes nothing. The look holding k fruit is the stage's
 * _f0 still with pieces 1..k pasted in order, each replacing its box (js/trant-looks.js).
 */
export const TRANT_FRUIT_PIECES = ${body};
`);
}

async function main() {
  const results = JSON.parse(readFileSync(join(HERE, 'results.json'), 'utf8'));
  const all = trantStages();
  const want = (st) => !only || st.species === only || `trant-${st.species}-m${st.maturity}`.includes(only);
  mkdirSync(WORK, { recursive: true });
  const data = readModule();
  const regAt = new Map(); // `${species}:${m}` -> registration point in the 3x cell (OGA stages)
  const plainPath = (st) => `${FRAMES}/trant_${st.species}_m${st.maturity}.webp`;
  const ogaPlace = (st) => {
    const placed = results[plainPath(st)]?.offset3x;
    if (!placed) throw new Error(`${plainPath(st)} has no 3x placement in results.json (build.mjs first)`);
    return placed;
  };
  const placeOf = (st, reg) => {
    if (st.oga) {
      const at = ogaPlace(st);
      regAt.set(`${st.species}:${st.maturity}`, [at[0] + reg[0], at[1] + reg[1]]);
      return at;
    }
    // Between the OGA stages either side, by maturity.
    const lo = Math.max(...OGA_STAGES.filter((m) => m < st.maturity));
    const hi = Math.min(...OGA_STAGES.filter((m) => m > st.maturity));
    const a = regAt.get(`${st.species}:${lo}`);
    const b = regAt.get(`${st.species}:${hi}`);
    const t = (st.maturity - lo) / (hi - lo);
    return [Math.round(a[0] + (b[0] - a[0]) * t - reg[0]), Math.round(a[1] + (b[1] - a[1]) * t - reg[1])];
  };
  // OGA stages first: the others are placed between them.
  const order = [...all].sort((p, q) => p.species.localeCompare(q.species) || Number(q.oga) - Number(p.oga) || p.maturity - q.maturity);
  for (const st of order) {
    const name = `trant-${st.species}-m${st.maturity}`;
    if (!want(st) && !(st.oga && all.some((o) => o.species === st.species && !o.oga && want(o)))) continue;
    if (!want(st)) {
      // Only its registration point (a neighbour needs it).
      const dir = join(WORK, `${name}-reg`);
      mkdirSync(dir, { recursive: true });
      const swf = join(dir, 'state.swf');
      const { ids } = freezeStates(join(ITEMS, st.swf), swf, st.sprite, [st.set]);
      const f = svgFrame(readFileSync(exportSprites(swf, ids, st.frame, 'svg', join(dir, 'svg'))[0], 'utf8'));
      placeOf(st, [f.tx, f.ty]);
      continue;
    }
    const t0 = Date.now();
    const r = await renderStage(st, placeOf);
    const [fw, fh] = st.cell;
    const fw3 = fw * S;
    const fh3 = fh * S;
    const K = st.ids.length;
    const files = [];
    const full = r.cells[K];
    if (VERIFY) {
      for (const [path, raw] of [[plainPath(st), full], ...(K ? [[`${FRAMES}/trant_${st.species}_m${st.maturity}_f0.webp`, r.cells[0]]] : [])]) {
        const hi = join(PUBLIC, path.replace(/\.webp$/, '@3x.webp'));
        const img = existsSync(hi) ? readRGBA(hi) : null;
        let off = img ? 0 : -1;
        if (img) for (let p = 0; p < raw.length; p += 4) if (Math.abs(raw[p + 3] - img.raw[p + 3]) > 1) off++;
        console.log(`  verify ${path}@3x: ${off < 0 ? 'missing' : off ? `${off} px differ` : 'same'}`);
        if (off) process.exitCode = 1;
      }
      continue;
    }
    if (!st.oga) {
      writeWebp(downscale(full, fw3, fh3), fw, fh, join(PUBLIC, plainPath(st)));
      files.push(plainPath(st));
    }
    const sp = (data[`trant_${st.species}`] ||= {});
    sp.rounding = FRUIT_ROUNDING[st.species];
    sp.slots = st.slots;
    sp.stages ||= {};
    if (K) {
      const f0 = `${FRAMES}/trant_${st.species}_m${st.maturity}_f0.webp`;
      writeWebp(downscale(r.cells[0], fw3, fh3), fw, fh, join(PUBLIC, f0));
      files.push(f0);
      const boxes = [];
      for (let k = 1; k <= K; k++) {
        const box = changedBox(r.cells[k - 1], r.cells[k], fw3, fh3);
        if (box) box.k = k;
        boxes.push(box);
      }
      const real = boxes.filter(Boolean);
      const { W, H } = pack(real);
      const sheet3 = new Uint8Array(W * S * H * S * 4);
      for (const b of real) {
        const part = crop(r.cells[b.k], fw3, b.x * S, b.y * S, b.w * S, b.h * S);
        for (let j = 0; j < b.h * S; j++) sheet3.set(part.subarray(j * b.w * S * 4, (j + 1) * b.w * S * 4), ((b.ay * S + j) * W * S + b.ax * S) * 4);
      }
      const atlas = `${FRAMES}/trant_${st.species}_m${st.maturity}_fruit.webp`;
      writeWebp(downscale(sheet3, W * S, H * S), W, H, join(PUBLIC, atlas));
      writeWebp(sheet3, W * S, H * S, join(PUBLIC, atlas.replace(/\.webp$/, '@3x.webp')));
      files.push(atlas, atlas.replace(/\.webp$/, '@3x.webp'));
      sp.stages[st.maturity] = { ids: st.ids, pieces: boxes.map((b) => (b ? [b.ax, b.ay, b.w, b.h, b.x, b.y] : 0)) };
    } else {
      delete sp.stages[st.maturity];
    }
    console.log(`${name}: ${K} fruit, placed at ${r.at} (render ${r.size.join('x')}), ${files.map((f) => f.split('/').pop()).join(' ')} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  if (!VERIFY) {
    const sorted = {};
    for (const key of Object.keys(data).sort()) sorted[key] = data[key];
    writeModule(sorted);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
