#!/usr/bin/env node
/**
 * Sharp 3x sprite sheets from Tiny Speck's vector SWFs (CC0 glitch-items).
 *
 * For each sheet in a manifest (tools/vector-sprites/<name>.json):
 *  1. FFDec exports every frame of one DefineSprite at zoom 3 (one shared
 *     canvas per sprite, cached under --work).
 *  2. Each OGA cell i is paired with SWF frame (label start + i + shift).
 *  3. One global placement per sheet (mirror, 3x-pixel offset, frame shift)
 *     is searched by box-downscaling the render 3:1 and comparing premultiplied
 *     RGBA against the OGA cells; every frame is then scored with it, and its
 *     own best offset must agree.
 *  4. Matching sheets are written next to the 1x file as <name>@3x.png (or
 *     .webp when lossless WebP is clearly smaller), exactly 3x its pixel size,
 *     every frame clipped to its cell (or as parts, see "budget"). Rejected
 *     sheets are reported, not written. Frames under 1% of the sheet's median
 *     alpha (a vanishing sparkle) are scored but not gated.
 *  5. tools/vector-sprites/results.json (scores, placement) and the generated
 *     public/js/sprite-hires.js (1x path -> 3x path) are updated.
 *
 * Manifest options (characters.json uses them):
 *  - "budget": { "maxSide": px, "maxMB": decoded MB } caps each 3x file. A
 *    sheet whose 3x is bigger is written as parts (<name>.p1@3x.webp, ...):
 *    its cells in frame order, each part in the squarest grid that fits;
 *    the 1x sheet is unchanged and js/sprite-hires.js points every frame at
 *    its part (SPLIT_SPRITES). Only a character with a cell too big for any
 *    part is rejected, before rendering.
 *  - "webp": true (manifest) always writes lossless WebP, even when it saves
 *    less than a fifth over PNG (seasons.json: one format per folder).
 *  - "firstDraw": true (manifest, job or sheet) keeps the sheet out of the eager
 *    URL route: it swaps to 3x when the renderer first draws it.
 *  - job "character": sheets sharing one are all-or-nothing (a character
 *    that is sharp in one state and soft in the next looks broken), so one
 *    rejected sheet holds back the others. Defaults to the job name.
 *  - job "swf" may be absolute (Wayback recoveries outside glitch-items).
 *  - sheet "step": cell k shows SWF frame start + shift + k * step.
 *  - job "zoom": FFDec zoom when the OGA sheet was drawn at another scale
 *    than the SWF (3 x that scale; the 3x file is still 3x the OGA pixels).
 *  - job "parts": { "<placed class>": "<class>" | null } renders a runtime
 *    variant (swf-parts.mjs swaps the placed part symbols in a work copy).
 *  - job "record": { "clips": ["<class>", ...] } bakes what the client's
 *    sprite-sheet recorder drew: the item's animated_mcs (clips) on their
 *    own copy of each label, every other nested clip on frame 1
 *    (swf-record.mjs; the Juju Bandits).
 *  - job "state": { "set": { "<instance>": frame | null }, "pad": n } freezes
 *    what the item's ActionScript sets (gotoAndStop / visible) on the
 *    sprite's named children (swf-state.mjs; harvestables.json).
 *  - job "renderer": "svg" renders FFDec's SVG export in Chromium, for art
 *    with multiply/overlay/hard-light blend modes (svg-raster.mjs).
 *  - sheet "frameList": [n, ...] gives each cell's SWF frame (the barnacle
 *    and ice sheets skip the "bigger" state).
 *  - job "sprite": 0 renders the root timeline (FFDec frame export).
 *  - sheet "swfStart" (+ "swfCount") pins the SWF frame when the sheet has
 *    no FrameLabel (a still picked by state, e.g. trant health 10).
 *  - job "padStage": n renders the root timeline (sprite 0) of a copy whose
 *    stage grows by n stage sizes on every side (tools/icon-hires/swfinfo.py
 *    rewrite), so art drawn outside the authored stage is kept: the tools'
 *    tool_animation scenes (hand-tools.json).
 *  - job "frameRange": [a, b] exports only SWF frames a-b of the sprite (a
 *    477-frame Street Spirit whose porthole clips are the last 93).
 *  - manifest "density": N (an integer, default 3) renders at zoom N and
 *    writes <name>@Nx files, placed and scored by an N:1 box downscale, for
 *    art drawn bigger than its 1x frames (the loneliness porthole: 1x cells
 *    fitted to 215-325 px, spirit-portraits.json). Such a manifest also
 *    names its own "results" file and "module" (js/sprite-dense.js), so
 *    js/sprite-hires.js and results.json stay the 3x sheets.
 *  - manifest "lossy": q writes lossy WebP at quality q with lossless alpha
 *    (cwebp -q q -alpha_q 100 -exact), as the 1x strips it doubles
 *    (street-spirits.json: the OGA strips are lossy q88 too).
 *
 * Usage:
 *   node tools/vector-sprites/build.mjs [--manifest tools/vector-sprites/animals.json]
 *        [--only <substring>] [--work <dir>] [--dry]
 *   node tools/vector-sprites/build.mjs --manifest <m> --check
 *        exit 1 when a manifest sheet has no result, an ok result's file is
 *        missing or not exactly N times its 1x sheet, or the generated
 *        module differs from what the results would write (no FFDec needed).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { FFDEC, JAVA, swfSprites } from './swf-labels.mjs';
import { swapParts, symbolClasses } from './swf-parts.mjs';
import { recordState } from './swf-record.mjs';
import { freezeState } from './swf-state.mjs';
import { rasteriseSvgs } from './svg-raster.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const PUBLIC = join(ROOT, 'public');
const ITEMS = join(os.homedir(), 'Documents/glitch-audit/glitch-items');
let RESULTS = join(HERE, 'results.json');
let MODULE = join(PUBLIC, 'js/sprite-hires.js');
/** The manifest "density" (texels per 1x pixel), set in main. */
let S = 3;
/** The manifest "lossy" WebP quality, or 0 for lossless, set in main. */
let lossy = 0;

/** A frame passes at this score (1 = identical after the 3:1 downscale). */
export const FRAME_MIN = 0.8;
/** A sheet passes when its mean frame score reaches this. */
export const SHEET_MIN = 0.88;
/**
 * Faint frames (a few sparkle pixels, under this share of the sheet's median
 * alpha mass) score noisily; they only need FAINT_MIN and skip the drift test.
 */
export const FAINT_SHARE = 0.15;
export const FAINT_MIN = 0.5;
/**
 * Vanishing frames (under this share of the median alpha mass: the last
 * wisp of a Juju Bandit's shrink sparkles, a spawn's first sub-pixel dot)
 * are mostly antialiasing noise at 1x; they are scored but not gated.
 */
export const EMPTY_SHARE = 0.01;

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const manifestPath = resolve(opt('manifest', join(HERE, 'animals.json')));
const only = opt('only', '');
const WORK = resolve(opt('work', join(os.tmpdir(), 'vector-sprites')));
const DRY = args.includes('--dry');
const CHECK = args.includes('--check');
/** A manifest's "minScore" raises SHEET_MIN (harvestables: 0.9, the test's bar). */
let sheetMin = SHEET_MIN;
/** The manifest "budget" (each 3x file), set in main. */
let budget = null;
/** The manifest "webp": always lossless WebP, set in main. */
let alwaysWebp = false;

// ---------------------------------------------------------------------------
// Pixels (ImageMagick for codecs, plain typed arrays for the maths)
// ---------------------------------------------------------------------------

function readRGBA(file) {
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', `${file}[0]`], { encoding: 'utf8' }).trim().split(' ').map(Number);
  const data = execFileSync('magick', [`${file}[0]`, '-depth', '8', 'rgba:-'], { maxBuffer: w * h * 4 + 1024 });
  return premultiply({ w, h, data: new Uint8Array(data.buffer, data.byteOffset, w * h * 4) });
}

/** Float premultiplied copy (0..255 per channel). */
function premultiply(img) {
  const out = new Float32Array(img.w * img.h * 4);
  for (let i = 0; i < img.w * img.h; i++) {
    const a = img.data[i * 4 + 3] / 255;
    out[i * 4] = img.data[i * 4] * a;
    out[i * 4 + 1] = img.data[i * 4 + 1] * a;
    out[i * 4 + 2] = img.data[i * 4 + 2] * a;
    out[i * 4 + 3] = img.data[i * 4 + 3];
  }
  return { w: img.w, h: img.h, raw: img.data, p: out };
}

function crop(img, x0, y0, w, h) {
  const p = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = y0 + y;
    if (sy < 0 || sy >= img.h) continue;
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      if (sx < 0 || sx >= img.w) continue;
      const s = (sy * img.w + sx) * 4;
      const d = (y * w + x) * 4;
      p[d] = img.p[s]; p[d + 1] = img.p[s + 1]; p[d + 2] = img.p[s + 2]; p[d + 3] = img.p[s + 3];
    }
  }
  return { w, h, p };
}

function mirrorRaw(img) {
  const raw = new Uint8Array(img.raw.length);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const s = (y * img.w + x) * 4;
      const d = (y * img.w + (img.w - 1 - x)) * 4;
      raw[d] = img.raw[s]; raw[d + 1] = img.raw[s + 1]; raw[d + 2] = img.raw[s + 2]; raw[d + 3] = img.raw[s + 3];
    }
  }
  return premultiply({ w: img.w, h: img.h, data: raw });
}

/**
 * Box-downscale an S x render (S = the manifest density, 3 by default) at
 * phase (px, py): pixel (u, v) averages render pixels Su+px..Su+px+S-1
 * (u from -1, so the image is offset by one pixel).
 */
function downscale(img, px, py) {
  const w = Math.ceil((img.w - px) / S) + 2;
  const h = Math.ceil((img.h - py) / S) + 2;
  const p = new Float32Array(w * h * 4);
  const n = S * S;
  for (let v = 0; v < h; v++) {
    for (let u = 0; u < w; u++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < S; j++) {
        const y = S * (v - 1) + py + j;
        if (y < 0 || y >= img.h) continue;
        for (let i = 0; i < S; i++) {
          const x = S * (u - 1) + px + i;
          if (x < 0 || x >= img.w) continue;
          const s = (y * img.w + x) * 4;
          r += img.p[s]; g += img.p[s + 1]; b += img.p[s + 2]; a += img.p[s + 3];
        }
      }
      const d = (v * w + u) * 4;
      p[d] = r / n; p[d + 1] = g / n; p[d + 2] = b / n; p[d + 3] = a / n;
    }
  }
  return { w, h, p };
}

function centroid(img) {
  let sx = 0, sy = 0, s = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const a = img.p[(y * img.w + x) * 4 + 3];
      sx += a * x; sy += a * y; s += a;
    }
  }
  return s > 0 ? { x: sx / s, y: sy / s, mass: s } : null;
}

/**
 * Compare OGA cell `o` with the downscaled render `d` shifted by (qx, qy)
 * (cell pixel x shows d pixel x - qx + 1). Returns err parts and the mass.
 */
function compare(o, d, qx, qy) {
  let ea = 0, ec = 0, m = 0;
  for (let y = 0; y < o.h; y++) {
    const v = y - qy + 1;
    for (let x = 0; x < o.w; x++) {
      const u = x - qx + 1;
      const s = (y * o.w + x) * 4;
      let r = 0, g = 0, b = 0, a = 0;
      if (u >= 0 && u < d.w && v >= 0 && v < d.h) {
        const t = (v * d.w + u) * 4;
        r = d.p[t]; g = d.p[t + 1]; b = d.p[t + 2]; a = d.p[t + 3];
      }
      const oa = o.p[s + 3];
      if (oa === 0 && a === 0) continue;
      ea += Math.abs(oa - a);
      ec += Math.abs(o.p[s] - r) + Math.abs(o.p[s + 1] - g) + Math.abs(o.p[s + 2] - b);
      m += Math.max(oa, a);
    }
  }
  return { ea, ec, m };
}

const scoreOf = ({ ea, ec, m }) => (m === 0 ? 1 : 1 - (ea / m + ec / (3 * m)) / 2);

// ---------------------------------------------------------------------------
// FFDec export (one per SWF sprite, cached)
// ---------------------------------------------------------------------------

async function exportSprite(swf, id, zoom = 3, renderer = 'png', range = null) {
  const dir = join(WORK, `${basename(swf, '.swf')}_${id}${zoom === 3 ? '' : `_z${zoom}`}${renderer === 'svg' ? '_svg' : ''}${range ? `_f${range[0]}-${range[1]}` : ''}`);
  const done = join(dir, '.done');
  // Sprite 0 is the root timeline (FFDec frame export, stage colour left out).
  const find = (d) => (id === 0 ? (existsSync(join(d, 'root')) ? 'root' : null) : readdirSync(d).find((n) => n === `DefineSprite_${id}` || n.startsWith(`DefineSprite_${id}_`)));
  // range: only those frames (FFDec -select <id>:a-b; files keep their frame numbers).
  const ffdec = (format, out) => execFileSync(JAVA, ['-jar', FFDEC, '-zoom', String(zoom), ...(range && id !== 0 ? ['-select', `${id}:${range[0]}-${range[1]}`] : []),
    ...(id === 0 ? ['-ignorebackground', '-format', `frame:${format}`, '-export', 'frame', join(out, 'root')] : ['-selectid', String(id), '-format', `sprite:${format}`, '-export', 'sprite', out]),
    swf], { stdio: 'ignore' });
  if (!existsSync(done)) {
    mkdirSync(dir, { recursive: true });
    console.log(`  ffdec: ${basename(swf)} sprite ${id} @${zoom}x${renderer === 'svg' ? ' (svg)' : ''}`);
    if (renderer === 'svg') {
      // FFDec's PNG renderer blends multiply/overlay against transparent
      // black; its SVG keeps mix-blend-mode, which Chromium composites right.
      const svgDir = join(dir, 'svg');
      ffdec('svg', svgDir);
      const sub = find(svgDir);
      if (!sub) throw new Error(`no svg export for sprite ${id} in ${svgDir}`);
      mkdirSync(join(dir, sub), { recursive: true });
      const jobs = readdirSync(join(svgDir, sub)).filter((n) => n.endsWith('.svg'))
        .map((n) => ({ svg: join(svgDir, sub, n), png: join(dir, sub, n.replace(/\.svg$/, '.png')) }));
      await rasteriseSvgs(jobs);
    } else {
      ffdec('png', dir);
    }
    writeFileSync(done, '');
  }
  const sub = find(dir);
  if (!sub) throw new Error(`no export for sprite ${id} in ${dir}`);
  return join(dir, sub);
}

// ---------------------------------------------------------------------------
// One sheet
// ---------------------------------------------------------------------------

function sheetCells(sheet, ogaImg) {
  const cols = sheet.cols ?? Math.floor(ogaImg.w / sheet.fw);
  const rows = Math.floor(ogaImg.h / sheet.fh);
  const first = sheet.first ?? 0;
  const count = sheet.frames ?? cols * rows - first;
  const cells = [];
  for (let k = 0; k < count; k++) {
    const i = first + k;
    cells.push({ k, x: (i % cols) * sheet.fw, y: Math.floor(i / cols) * sheet.fh });
  }
  return { cols, rows, cells };
}

function buildSheet(job, sheet, labels, frameDir) {
  const oga = join(PUBLIC, sheet.path);
  const ogaImg = readRGBA(oga);
  const { cells, cols: gridCols } = sheetCells(sheet, ogaImg);
  const label = labels.find((l) => l.name === sheet.label);
  if (!label && !sheet.swfStart && !sheet.frameList) return { status: 'rejected', reason: `label ${sheet.label} not in sprite ${job.sprite}` };
  // frameList: cell k shows SWF frame frameList[k] (states the sheet skips).
  const list = sheet.frameList;
  const start = list ? list[0] : (sheet.swfStart ?? label.start);
  const swfCount = sheet.swfCount ?? label?.count ?? cells.length;
  const cellImgs = cells.map((c) => crop(ogaImg, c.x, c.y, sheet.fw, sheet.fh));
  const step = sheet.step ?? 1;
  const frameOf = (k, shift) => (list ? list[k] : start + k * step) + shift;

  const renders = new Map();
  const render = (n, mirror) => {
    const key = `${n}:${mirror}`;
    if (!renders.has(key)) {
      const file = join(frameDir, `${n}.png`);
      if (!existsSync(file)) return null;
      const img = readRGBA(file);
      const r = mirror ? mirrorRaw(img) : img;
      renders.set(key, { img: r, phases: null });
    }
    return renders.get(key);
  };
  const phase = (entry, px, py) => {
    entry.phases ||= {};
    return (entry.phases[`${px}${py}`] ||= downscale(entry.img, px, py));
  };

  // Global search on up to 8 non-empty sample cells.
  const nonEmpty = cells.filter((c, i) => centroid(cellImgs[i]));
  if (!nonEmpty.length) return { status: 'rejected', reason: 'OGA sheet is empty' };
  const every = Math.max(1, Math.floor(nonEmpty.length / 8));
  const samples = nonEmpty.filter((_, i) => i % every === 0).slice(0, 8);
  // Cell k shows SWF frame start + k + shift; a shift may not leave the label.
  const labelEnd = start + swfCount - 1;
  const shifts = (sheet.shift !== undefined || list ? [sheet.shift ?? 0] : [0, 1, -1])
    .filter((s) => sheet.shift !== undefined || (start + s >= start && start + s + (cells.length - 1) * step <= labelEnd) || s === 0);
  const mirrors = sheet.mirror !== undefined ? [sheet.mirror] : [false, true];
  let best = null;
  for (const shift of shifts) {
    for (const mirror of mirrors) {
      // Estimate the 1x offset from centroids at phase 0, then search around it.
      const est = [];
      for (const c of samples) {
        const e = render(frameOf(c.k, shift), mirror);
        if (!e) continue;
        const a = centroid(cellImgs[c.k]);
        const b = centroid(phase(e, 0, 0));
        if (a && b) est.push([a.x - (b.x - 1), a.y - (b.y - 1)]);
      }
      if (!est.length) continue;
      const med = (i) => est.map((p) => p[i]).sort((x, y) => x - y)[Math.floor(est.length / 2)];
      const ex = Math.round(med(0));
      const ey = Math.round(med(1));
      for (let px = 0; px < S; px++) {
        for (let py = 0; py < S; py++) {
          for (let qx = ex - 4; qx <= ex + 4; qx++) {
            for (let qy = ey - 4; qy <= ey + 4; qy++) {
              const acc = { ea: 0, ec: 0, m: 0 };
              for (const c of samples) {
                const e = render(frameOf(c.k, shift), mirror);
                if (!e) { acc.m += 1e9; continue; }
                const r = compare(cellImgs[c.k], phase(e, px, py), qx, qy);
                acc.ea += r.ea; acc.ec += r.ec; acc.m += r.m;
              }
              // A non-zero shift has to win clearly.
              const s = scoreOf(acc) - (shift ? 0.01 : 0);
              if (!best || s > best.score) best = { score: s, shift, mirror, px, py, qx, qy };
            }
          }
        }
      }
    }
  }
  if (!best) return { status: 'rejected', reason: 'no rendered frames' };
  // Render pixel (X, Y) lands at cell Sx pixel (X + dx, Y + dy).
  const dx = S * best.qx - best.px;
  const dy = S * best.qy - best.py;

  // Score every frame with the global placement; also its own best nearby.
  const frames = [];
  for (const c of cells) {
    const n = frameOf(c.k, best.shift);
    const e = render(n, best.mirror);
    if (!e) { frames.push({ k: c.k, swf: n, score: 0, missing: true }); continue; }
    const g = scoreOf(compare(cellImgs[c.k], phase(e, best.px, best.py), best.qx, best.qy));
    let own = { score: g, dx: 0, dy: 0 };
    for (let ox = -S; ox <= S; ox++) {
      for (let oy = -S; oy <= S; oy++) {
        const DX = dx + ox;
        const DY = dy + oy;
        const qx = Math.ceil(DX / S);
        const qy = Math.ceil(DY / S);
        const s = scoreOf(compare(cellImgs[c.k], phase(e, S * qx - DX, S * qy - DY), qx, qy));
        if (s > own.score + 1e-9) own = { score: s, dx: ox, dy: oy };
      }
    }
    frames.push({ k: c.k, swf: n, score: +g.toFixed(4), ownBest: own.dx || own.dy ? { dx: own.dx, dy: own.dy, score: +own.score.toFixed(4) } : null });
    // Free memory early on big sheets.
    renders.delete(`${n}:${best.mirror}`);
  }
  const masses = cells.map((c) => centroid(cellImgs[c.k])?.mass || 0);
  const nz = masses.filter((m) => m > 0).sort((a, b) => a - b);
  const medMass = nz[Math.floor(nz.length / 2)] || 0;
  for (const f of frames) {
    f.faint = masses[f.k] < medMass * FAINT_SHARE;
    f.empty = masses[f.k] < medMass * EMPTY_SHARE;
  }
  const solid = frames.filter((f) => !f.faint);
  const scores = frames.map((f) => f.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...solid.map((f) => f.score));
  const faintMin = Math.min(1, ...frames.filter((f) => f.faint && !f.empty).map((f) => f.score));
  // A frame whose own best placement differs by more than one Sx pixel
  // and is clearly better means the global offset does not hold.
  const drift = solid.filter((f) => f.ownBest && (Math.abs(f.ownBest.dx) > 1 || Math.abs(f.ownBest.dy) > 1) && f.ownBest.score - f.score > 0.02);
  const result = {
    swf: relative(ITEMS, job.swf),
    sprite: job.sprite,
    ...(job.zoom && job.zoom !== 3 ? { zoom: job.zoom } : {}),
    label: sheet.label ?? null,
    swfFrames: list ? cells.map((c) => frameOf(c.k, best.shift)) : [start + best.shift, start + best.shift + (cells.length - 1) * step],
    ...(step !== 1 ? { step } : {}),
    swfLabelFrames: swfCount,
    cells: cells.length,
    fw: sheet.fw,
    fh: sheet.fh,
    mirror: best.mirror,
    shift: best.shift,
    ...(S === 3 ? { offset3x: [dx, dy] } : { density: S, offset: [dx, dy], cols: gridCols, first: sheet.first ?? 0 }),
    score: +mean.toFixed(4),
    minFrame: +min.toFixed(4),
    faintFrames: frames.filter((f) => f.faint).length,
    ...(frames.some((f) => f.empty) ? { emptyFrames: frames.filter((f) => f.empty).length } : {}),
    faintMin: +faintMin.toFixed(4),
    drift: drift.map((f) => ({ k: f.k, ...f.ownBest })),
  };
  const reasons = [];
  if (mean < sheetMin) reasons.push(`mean score ${mean.toFixed(3)} < ${sheetMin}`);
  if (min < FRAME_MIN) reasons.push(`frame ${solid.find((f) => f.score === min).k} score ${min.toFixed(3)} < ${FRAME_MIN}`);
  if (faintMin < FAINT_MIN) reasons.push(`faint frame score ${faintMin.toFixed(3)} < ${FAINT_MIN}`);
  if (drift.length) reasons.push(`${drift.length} frame(s) prefer another offset`);
  if (frames.some((f) => f.missing)) reasons.push('SWF has fewer frames than the sheet');
  if (reasons.length) return { ...result, status: 'rejected', reason: reasons.join('; '), frames };
  if (DRY) return { ...result, status: 'dry', frames };

  // Compose the 3x sheet: each frame clipped to its own cell. A sheet whose
  // 3x would break the budget as one file is written as parts instead, its
  // cells in frame order, each part in its own squarer grid within budget.
  const fw3 = sheet.fw * S;
  const fh3 = sheet.fh * S;
  const first = sheet.first ?? 0;
  const split = overBudget({ w: ogaImg.w, h: ogaImg.h }, budget, S)
    ? packParts(cells.length, sheet.fw, sheet.fh, budget, S)?.map((p) => ({ ...p, from: first + p.from }))
    : null;
  if (overBudget({ w: ogaImg.w, h: ogaImg.h }, budget, S) && !split) return { ...result, status: 'rejected', reason: `one ${S}x cell is over budget`, frames };
  const layouts = split || [{ W: ogaImg.w * S, H: ogaImg.h * S, at: (c) => ({ x: c.x * S, y: c.y * S }), cells }];
  if (split) {
    for (const part of split) {
      part.W = part.cols * fw3;
      part.H = Math.ceil(part.count / part.cols) * fh3;
      part.cells = cells.filter((c) => first + c.k >= part.from && first + c.k < part.from + part.count);
      part.at = (c) => {
        const j = first + c.k - part.from;
        return { x: (j % part.cols) * fw3, y: Math.floor(j / part.cols) * fh3 };
      };
    }
  }
  const stem = oga.slice(0, -extname(oga).length);
  // Drop this sheet's old Sx files (one file or parts) before writing.
  const base = basename(stem);
  const tail = new RegExp(`^\\d+@${S}x\\.(png|webp)$`);
  for (const f of readdirSync(dirname(oga))) {
    const part = f.startsWith(`${base}.p`) && tail.test(f.slice(base.length + 2));
    if (part || f === `${base}@${S}x.png` || f === `${base}@${S}x.webp`) unlinkSync(join(dirname(oga), f));
  }
  const written = [];
  layouts.forEach((layout, i) => {
    const { W, H } = layout;
    const out = new Uint8Array(W * H * 4);
    for (const c of layout.cells) {
      const file = join(frameDir, `${frameOf(c.k, best.shift)}.png`);
      const raw = readRGBA(file);
      const img = best.mirror ? mirrorRaw(raw) : raw;
      const { x: cx, y: cy } = layout.at(c);
      for (let y = 0; y < img.h; y++) {
        const ty = y + dy;
        if (ty < 0 || ty >= fh3) continue;
        for (let x = 0; x < img.w; x++) {
          const tx = x + dx;
          if (tx < 0 || tx >= fw3) continue;
          const s = (y * img.w + x) * 4;
          const d = ((cy + ty) * W + cx + tx) * 4;
          out[d] = img.raw[s]; out[d + 1] = img.raw[s + 1]; out[d + 2] = img.raw[s + 2]; out[d + 3] = img.raw[s + 3];
        }
      }
    }
    const name = split ? `${stem}.p${i + 1}@${S}x` : `${stem}@${S}x`;
    const tmpPng = join(WORK, `${basename(name)}.tmp.png`);
    execFileSync('magick', ['-size', `${W}x${H}`, '-depth', '8', 'rgba:-', '-define', 'png:compression-level=9', '-define', 'png:compression-filter=5', '-strip', `PNG32:${tmpPng}`], { input: out, maxBuffer: 1 << 26 });
    const tmpWebp = join(WORK, `${basename(name)}.tmp.webp`);
    // Lossless WebP keeps the exact pixels (a "lossy" manifest: lossless alpha, lossy colour).
    execFileSync('cwebp', lossy
      ? ['-quiet', '-q', String(lossy), '-alpha_q', '100', '-m', '6', '-exact', tmpPng, '-o', tmpWebp]
      : ['-quiet', '-lossless', '-exact', '-z', '9', tmpPng, '-o', tmpWebp]);
    // Lossless WebP: use it when it saves a fifth.
    const useWebp = lossy || alwaysWebp || extname(oga) === '.webp' || statSync(tmpWebp).size < statSync(tmpPng).size * 0.8;
    const file = `${name}.${useWebp ? 'webp' : 'png'}`;
    if (useWebp) { renameSync(tmpWebp, file); unlinkSync(tmpPng); } else { renameSync(tmpPng, file); unlinkSync(tmpWebp); }
    written.push({ hires: relative(PUBLIC, file), bytes: statSync(file).size, ...(split ? { from: layout.from, count: layout.count, cols: layout.cols, w: W, h: H } : {}) });
  });
  if (!split) return { ...result, status: 'ok', hires: written[0].hires, bytes: written[0].bytes, frames };
  return {
    ...result,
    status: 'ok',
    cols: gridCols,
    parts: written,
    bytes: written.reduce((a, p) => a + p.bytes, 0),
    frames,
  };
}

/**
 * Split n cells of fw x fh (1x) into the fewest parts whose Dx files (D =
 * density, 3 by default) each fit the budget, in frame order, each in the
 * grid with the least area (then the shortest side). [{ from, count, cols }]
 * (from 0), or null when one cell does not fit.
 */
export function packParts(n, fw, fh, { maxSide = Infinity, maxMB = Infinity } = {}, density = 3) {
  const fw3 = fw * density;
  const fh3 = fh * density;
  const maxBytes = maxMB * 2 ** 20;
  const grid = (p) => {
    let best = null;
    for (let c = 1; c <= p; c++) {
      const r = Math.ceil(p / c);
      const W = c * fw3;
      const H = r * fh3;
      if (W > maxSide || H > maxSide || W * H * 4 > maxBytes) continue;
      const key = [W * H, Math.max(W, H)];
      if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && key[1] < best.key[1])) best = { cols: c, key };
    }
    return best?.cols ?? null;
  };
  if (!grid(1)) return null;
  for (let k = 1; k <= n; k++) {
    const p = Math.ceil(n / k);
    if (!grid(p)) continue;
    const parts = [];
    for (let from = 0; from < n; from += p) {
      const count = Math.min(p, n - from);
      parts.push({ from, count, cols: grid(count) });
    }
    return parts;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Generated module
// ---------------------------------------------------------------------------

export function writeModule(results) {
  writeFileSync(MODULE, moduleText(results));
}

export function moduleText(results) {
  const ok = Object.entries(results).filter(([, r]) => r.status === 'ok').sort(([a], [b]) => a.localeCompare(b));
  const entries = ok.filter(([, r]) => !r.parts).map(([path, r]) => `  [${JSON.stringify(path)}, ${JSON.stringify(r.hires)}],`).join('\n');
  const split = ok.filter(([, r]) => r.parts).map(([path, r]) => `  [${JSON.stringify(path)}, { fw: ${r.fw}, fh: ${r.fh}, cols: ${r.cols}, parts: [${r.parts.map((p) => `[${JSON.stringify(p.hires)}, ${p.from}, ${p.count}, ${p.cols}]`).join(', ')}] }],`).join('\n');
  const firstDraw = ok.filter(([, r]) => r.firstDraw).map(([path]) => `  ${JSON.stringify(path)},`).join('\n');
  return `/**
 * Sprite sheets with a sharp 3x render (generated by
 * tools/vector-sprites/build.mjs; do not edit by hand). Each @3x file is
 * frame-for-frame Tiny Speck's vector SWF (CC0) at zoom 3, placed so its 3:1
 * downscale matches the OGA __x1_ sheet, exactly 3x its pixel size. The quoin
 * sheet is the exception: a hand trace of the 1x sheet (tools/quoin-art). js/textures.js
 * reads resolution 3 from the \`@3x\` name, so frame rectangles stay in 1x units.
 */
export const HIRES_SPRITES = new Map([
${entries}
]);

/**
 * Sheets whose 3x would break the texture budget as one file (8192 px side,
 * 64 MB decoded): the cells are split, in frame order, into part files that
 * each fit. 1x path -> { fw, fh, cols (1x cell grid), parts: [[url, from,
 * count, cols], ...] }: part p holds 1x cells from..from+count-1 in its own
 * cols-wide grid. The 1x sheet is unchanged; on first draw every frame
 * Texture cut from it is pointed at its part (frame rect still in 1x units).
 */
export const SPLIT_SPRITES = new Map([
${split}
]);

/**
 * Sheets that stay 1x until the renderer first draws them (characters, NPCs,
 * shrines: big sheets that are often loaded and rarely all on screen).
 * installHiresSprites leaves them out of the eager URL route and
 * installHiresFirstDraw swaps them in place on first upload.
 */
export const FIRST_DRAW_SPRITES = new Set([
${firstDraw}
]);

let enabled = true;
/** js/textures.js, for the frames of split sheets (installHiresSprites). */
let frameSource = null;

/** The 3x URL for a sheet URL (query string kept), or null (split sheets too). */
export function hiresSpriteUrl(url) {
  if (!enabled) return null;
  const s = String(url || '');
  const q = s.indexOf('?');
  const hi = HIRES_SPRITES.get(sheetPath(s));
  return hi ? hi + (q < 0 ? '' : s.slice(q)) : null;
}

/** A sheet URL as its HIRES_SPRITES key (from \`assets/\`, no query). */
function sheetPath(url) {
  const s = String(url || '');
  const q = s.indexOf('?');
  const path = q < 0 ? s : s.slice(0, q);
  const at = path.indexOf('assets/');
  return at < 0 ? path.replace(/^\\.?\\//, '') : path.slice(at);
}

/**
 * Route listed sheets to their 3x file when js/textures.js loads them
 * (game.js SHEETS, features, quest rooms). Only when sprites are drawn at
 * 1.5+ device pixels per art pixel (DPR x the 960px view's zoom): below that
 * the 1x sheets already fill the screen, and a 3x texture would only cost
 * memory and alias when minified. First-draw sheets stay 1x here. Split
 * sheets have their frame Textures tracked so they can move to the parts.
 * @param {{ addUrlRoute: Function, trackFrameTextures?: Function, framesOf?: Function }} textures the js/textures.js module
 */
export function installHiresSprites(textures, { dpr = globalThis.devicePixelRatio || 1, viewWidth = globalThis.innerWidth || 960 } = {}) {
  enabled = dpr * Math.max(1, viewWidth / 960) >= 1.5;
  if (!enabled || typeof textures?.addUrlRoute !== 'function') return;
  textures.addUrlRoute('hires-sprites', (url) => (FIRST_DRAW_SPRITES.has(sheetPath(url)) ? null : hiresSpriteUrl(url)));
  if (typeof textures.trackFrameTextures === 'function' && typeof textures.framesOf === 'function') {
    frameSource = textures;
    textures.trackFrameTextures({
      match: (url) => SPLIT_SPRITES.has(sheetPath(url)),
      added: (source, texture) => {
        if (source.hiresParts) pointAtPart(source, texture);
      },
    });
  }
}

/**
 * Swap a 1x TextureSource to its 3x file in place, once, after the 1x image
 * has loaded. Every Texture already cut from it keeps its 1x frame rect and
 * turns sharp. Feature sheet loaders call this when a sheet is first drawn,
 * so sheets that are only preloaded never pay for 3x pixels. Resolves true
 * once swapped. A split sheet loads its parts instead and its frames move
 * to them.
 * @param {any} source a Pixi 8 TextureSource
 * @param {string} url its 1x sheet URL
 * @param {(source: any) => Promise<any>} [whenLoaded] js/textures.js whenLoaded
 */
export function upgradeSource(source, url, whenLoaded = (s) => Promise.resolve(s)) {
  const split = enabled ? SPLIT_SPRITES.get(sheetPath(url)) : null;
  if (split) return upgradeSplit(source, split, whenLoaded);
  const hi = hiresSpriteUrl(url);
  if (!hi || !source || source.destroyed) return Promise.resolve(false);
  if (source.hiresUpgrade) return source.hiresUpgrade;
  source.hiresUpgrade = Promise.resolve(whenLoaded(source))
    .then(() => fetch(hi))
    .then((res) => {
      if (!res.ok) throw new Error(\`\${hi}: \${res.status}\`);
      return res.blob();
    })
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      if (source.destroyed) {
        bitmap.close?.();
        return false;
      }
      const old = source.resource;
      source.resource = bitmap;
      source.hiresSrc = hi;
      // Same logical size, three times the pixels: frames stay in 1x units.
      if (!source.resize(source.width, source.height, 3)) source.update();
      if (old && old !== bitmap) old.close?.();
      return true;
    })
    .catch(() => false);
  return source.hiresUpgrade;
}

/** Load a split sheet's parts as resolution-3 sources and move its frames there. */
function upgradeSplit(source, split, whenLoaded) {
  if (!source || source.destroyed || !frameSource) return Promise.resolve(false);
  if (source.hiresUpgrade) return source.hiresUpgrade;
  const bitmap = (url) => fetch(url).then((res) => {
    if (!res.ok) throw new Error(\`\${url}: \${res.status}\`);
    return res.blob();
  }).then((blob) => createImageBitmap(blob));
  source.hiresUpgrade = Promise.resolve(whenLoaded(source))
    .then(() => Promise.all(split.parts.map(([url]) => bitmap(url))))
    .then((bitmaps) => {
      if (source.destroyed) {
        for (const b of bitmaps) b.close?.();
        return false;
      }
      const Source = source.constructor;
      source.hiresSplit = split;
      source.hiresParts = split.parts.map(([url, from, count, cols], i) => ({
        from,
        count,
        cols,
        source: new Source({
          resource: bitmaps[i],
          resolution: 3,
          label: url,
          alphaMode: source.alphaMode,
          scaleMode: source.scaleMode,
          autoGarbageCollect: source.autoGarbageCollect,
        }),
      }));
      for (const texture of frameSource.framesOf(source)) pointAtPart(source, texture);
      return true;
    })
    .catch(() => false);
  return source.hiresUpgrade;
}

/**
 * Point one frame Texture of a split sheet at the part holding its cell
 * (same 1x size, the cell's place in the part). Frames that span cells or
 * fall outside every part stay on the 1x sheet.
 */
export function pointAtPart(source, texture) {
  const split = source?.hiresSplit;
  const frame = texture?.frame;
  if (!split || !frame || texture.destroyed || texture.source !== source) return false;
  const col = Math.floor((frame.x + 0.5) / split.fw);
  const row = Math.floor((frame.y + 0.5) / split.fh);
  const dx = frame.x - col * split.fw;
  const dy = frame.y - row * split.fh;
  if (col >= split.cols || dx + frame.width > split.fw + 0.5 || dy + frame.height > split.fh + 0.5) return false;
  const cell = row * split.cols + col;
  const part = source.hiresParts.find((p) => cell >= p.from && cell < p.from + p.count);
  if (!part || part.source.destroyed) return false;
  const j = cell - part.from;
  frame.x = (j % part.cols) * split.fw + dx;
  frame.y = Math.floor(j / part.cols) * split.fh + dy;
  texture.source = part.source;
  texture.update();
  return true;
}

/** The listed 1x sheet a TextureSource was loaded from, or null. */
export function sourceSheet(source) {
  const ids = [source?.label, source?.groddleUrl];
  for (const id of ids) {
    if (typeof id !== 'string' || !id) continue;
    const path = sheetPath(id);
    if (HIRES_SPRITES.has(path) || SPLIT_SPRITES.has(path)) return path;
  }
  return null;
}

/**
 * Swap any listed sheet to 3x the first time the renderer uploads its 1x
 * texture (the WebGL or WebGPU texture system's _initSource runs once per
 * TextureSource, and again after Pixi's texture GC unloads it), whatever
 * loaded it: game.js SHEETS, quest-room kits, feature modules. Sheets that
 * are loaded but never drawn keep their 1x pixels. A split sheet drawn
 * again at 1x (a frame cut after its parts arrived) re-points its frames.
 * @param {any} renderer a Pixi 8 renderer
 * @param {(source: any) => Promise<any>} [whenLoaded] js/textures.js whenLoaded
 */
export function installHiresFirstDraw(renderer, whenLoaded) {
  const system = renderer?.texture;
  if (!enabled || typeof system?._initSource !== 'function' || system.hiresFirstDraw) return;
  const init = system._initSource.bind(system);
  system._initSource = (source) => {
    const gpu = init(source);
    if (source?.hiresParts && frameSource) {
      for (const texture of frameSource.framesOf(source)) pointAtPart(source, texture);
    } else {
      const path = source?.hiresUpgrade ? null : sourceSheet(source);
      if (path) upgradeSource(source, path, whenLoaded);
    }
    return gpu;
  };
  system.hiresFirstDraw = true;
}
`;
}

// ---------------------------------------------------------------------------

/** Pixel size of an image file. */
function imageSize(file) {
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', `${file}[0]`], { encoding: 'utf8' }).trim().split(' ').map(Number);
  return { w, h };
}

/** Why a sheet's Dx file (D = density, 3 by default) would break the manifest budget, or null. */
export function overBudget({ w, h }, budget, density = 3) {
  if (!budget) return null;
  const W = w * density;
  const H = h * density;
  const mb = (W * H * 4) / 2 ** 20;
  if (budget.maxSide && Math.max(W, H) > budget.maxSide) return `${density}x is ${W}x${H}, over the ${budget.maxSide} px texture side`;
  if (budget.maxMB && mb > budget.maxMB) return `${density}x is ${W}x${H} = ${mb.toFixed(1)} MB decoded, over ${budget.maxMB} MB`;
  return null;
}

const characterOf = (job) => job.character || job.name;

async function main() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  sheetMin = Math.max(SHEET_MIN, manifest.minScore ?? 0);
  budget = manifest.budget || null;
  alwaysWebp = manifest.webp === true;
  S = manifest.density ?? 3;
  if (!Number.isInteger(S) || S < 2 || S > 9) throw new Error(`density ${S}: an integer 2-9`);
  lossy = manifest.lossy ?? 0;
  if (S !== 3 && !(manifest.results && manifest.module)) throw new Error('a density other than 3 needs its own "results" and "module"');
  if (manifest.results) RESULTS = join(HERE, manifest.results);
  if (manifest.module) MODULE = join(PUBLIC, manifest.module);
  const results = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
  if (CHECK) {
    process.exitCode = checkManifest(manifest, results) ? 0 : 1;
    return;
  }
  mkdirSync(WORK, { recursive: true });
  const record = (job, sheet, r) => {
    const { frames, ...summary } = r;
    results[sheet.path] = {
      animal: job.name,
      ...(job.character ? { character: job.character } : {}),
      ...summary,
      ...((sheet.firstDraw ?? job.firstDraw ?? manifest.firstDraw) ? { firstDraw: true } : {}),
      frameScores: frames?.map((f) => f.score),
    };
  };
  // Budget first: a sheet over budget as one 3x file is split into parts
  // (buildSheet); a character with a cell too big for any part is not
  // rendered at all.
  const tooBig = new Map();
  for (const job of manifest.jobs) {
    for (const sheet of job.sheets) {
      const why = overBudget({ w: sheet.fw, h: sheet.fh }, manifest.budget);
      if (why && !tooBig.has(characterOf(job))) tooBig.set(characterOf(job), `${basename(sheet.path)}: one cell ${why}`);
    }
  }
  for (const job of manifest.jobs) {
    const sheets = job.sheets.filter((s) => !only || s.path.includes(only) || job.name.includes(only) || characterOf(job).includes(only));
    if (!sheets.length) continue;
    const swf = resolve(ITEMS, job.swf);
    console.log(`${job.name}: ${job.swf} sprite ${job.sprite}`);
    const big = tooBig.get(characterOf(job));
    if (big) {
      for (const sheet of sheets) {
        record(job, sheet, { status: 'rejected', reason: `over budget (${big})` });
        console.log(`  NO  ${basename(sheet.path)} (over budget: ${big})`);
      }
      continue;
    }
    let source = swf;
    if (job.padStage) {
      // Root-timeline scenes (sprite 0): a copy with a bigger stage keeps art drawn outside it.
      const padded = join(WORK, `${basename(swf, '.swf')}.pad${job.padStage}.swf`);
      if (!existsSync(padded)) padStage(swf, padded, job.padStage);
      source = padded;
    }
    if (job.parts) {
      const tag = createHash('sha1').update(JSON.stringify(job.parts)).digest('hex').slice(0, 8);
      const swapped = join(WORK, `${basename(swf, '.swf')}.${job.name}.${tag}.swf`);
      if (!existsSync(swapped)) console.log(`  parts: ${swapParts(source, swapped, job.parts)} placements swapped`);
      source = swapped;
    }
    if (job.record) {
      // Only the frames these sheets use (plus a margin for the shift search).
      const rootLabels = swfSprites(source).find((s) => s.id === job.sprite)?.labels || [];
      const ranges = sheets.map((sh) => {
        if (sh.frameList) return [Math.min(...sh.frameList) - 2, Math.max(...sh.frameList) + 2];
        const l = rootLabels.find((x) => x.name === sh.label);
        const a = sh.swfStart ?? l?.start ?? 1;
        let b = sh.swfStart ? a + (sh.swfCount ?? sh.frames ?? 1) : (l?.end ?? a);
        if (sh.frames) b = Math.min(b, a + (sh.frames + 1) * (sh.step ?? 1));
        return [a - 2, b + 2 + Math.abs(sh.shift ?? 0)];
      });
      const tag = createHash('sha1').update(JSON.stringify([job.record, ranges])).digest('hex').slice(0, 8);
      const recorded = join(WORK, `${basename(source, '.swf')}.${job.name}.rec-${tag}.swf`);
      if (!existsSync(recorded)) {
        const r = recordState(source, recorded, job.sprite, { ...job.record, classes: symbolClasses(swf), frames: ranges });
        console.log(`  record: ${r.frames} frames baked (${r.sprites} one-frame sprites)`);
      }
      source = recorded;
    }
    if (job.state) {
      const tag = createHash('sha1').update(JSON.stringify(job.state)).digest('hex').slice(0, 8);
      const stated = join(WORK, `${basename(source, '.swf')}.${job.name}.state-${tag}.swf`);
      if (!existsSync(stated)) {
        const r = freezeState(source, stated, job.sprite, job.state);
        console.log(`  state: ${r.placements} placements frozen (${r.frozen} new sprites), ${r.dropped} hidden${r.missing.length ? `, missing ${r.missing.join(' ')}` : ''}`);
        if (r.missing.length) throw new Error(`${job.name}: state names not placed in sprite ${job.sprite}: ${r.missing.join(' ')}`);
      }
      source = stated;
    }
    const labels = swfSprites(source).find((s) => s.id === job.sprite)?.labels || [];
    // job.zoom is the 3x zoom; other densities scale it.
    const frameDir = await exportSprite(source, job.sprite, +(((job.zoom ?? 3) * S) / 3).toFixed(6), job.renderer ?? 'png', job.frameRange || null);
    for (const sheet of sheets) {
      const t = Date.now();
      let r;
      try {
        r = buildSheet({ ...job, swf }, sheet, labels, frameDir);
      } catch (err) {
        r = { status: 'rejected', reason: String(err.message || err) };
      }
      record(job, sheet, r);
      const tag = r.status === 'ok' ? 'ok ' : r.status === 'dry' ? 'dry' : 'NO ';
      console.log(`  ${tag} ${basename(sheet.path)} score ${r.score ?? '-'} min ${r.minFrame ?? '-'} mirror ${r.mirror ?? '-'} shift ${r.shift ?? '-'} offset ${r.offset3x ?? r.offset ?? '-'}${r.bytes ? ` ${(r.bytes / 1024).toFixed(0)} KB` : ''}${r.reason ? ` (${r.reason})` : ''} ${((Date.now() - t) / 1000).toFixed(1)}s`);
    }
  }
  // All-or-nothing per character: hold back the passing sheets of a
  // character that has a rejected (or unbuilt) one.
  const groups = new Map();
  for (const job of manifest.jobs) {
    for (const sheet of job.sheets) {
      const c = characterOf(job);
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(sheet.path);
    }
  }
  for (const [c, paths] of groups) {
    const bad = paths.find((p) => !['ok', 'dry'].includes(results[p]?.status));
    if (!bad) continue;
    for (const p of paths) {
      const r = results[p];
      if (!r || !['ok', 'dry'].includes(r.status)) continue;
      for (const f of r.parts ? r.parts.map((x) => x.hires) : [r.hires]) {
        if (f && existsSync(join(PUBLIC, f)) && !DRY) unlinkSync(join(PUBLIC, f));
      }
      results[p] = { ...r, status: 'rejected', reason: `held back: ${c} also needs ${basename(bad)} (${results[bad]?.status || 'not built'})`, hires: undefined, parts: undefined, bytes: undefined };
      console.log(`  held ${basename(p)}: ${c} also needs ${basename(bad)}`);
    }
  }
  if (DRY) {
    writeFileSync(join(WORK, 'dry-results.json'), `${JSON.stringify(results, null, 1)}\n`);
    return;
  }
  for (const [path, r] of Object.entries(results)) {
    if (r.status !== 'ok') continue;
    const files = r.parts ? r.parts.map((p) => p.hires) : [r.hires];
    if (files.some((f) => !existsSync(join(PUBLIC, f)))) delete results[path];
  }
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  writeFileSync(MODULE, S === 3 && !manifest.module ? moduleText(results) : denseModuleText(results));
}

/** The 1x file's pixel size from a PNG or WebP header (no ImageMagick: --check runs anywhere). */
function headerSize(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  throw new Error(`unknown image ${file}`);
}

/**
 * --check: every manifest sheet has a result; every ok result's file (or
 * parts) exists at exactly S x its 1x sheet (parts: their grid of S x cells);
 * the generated module matches the results. Prints each problem.
 */
function checkManifest(manifest, results) {
  const bad = [];
  for (const job of manifest.jobs) {
    for (const sheet of job.sheets) {
      const r = results[sheet.path];
      if (!r) { bad.push(`${sheet.path}: no result`); continue; }
      if (!existsSync(join(PUBLIC, sheet.path))) bad.push(`${sheet.path}: 1x sheet missing`);
      if (r.status !== 'ok') continue;
      const d = r.density ?? 3;
      if (d !== S) bad.push(`${sheet.path}: density ${d}, manifest ${S}`);
      const one = headerSize(join(PUBLIC, sheet.path));
      if (r.parts) {
        for (const p of r.parts) {
          if (!existsSync(join(PUBLIC, p.hires))) { bad.push(`${p.hires}: missing`); continue; }
          const got = headerSize(join(PUBLIC, p.hires));
          const want = { w: p.cols * sheet.fw * d, h: Math.ceil(p.count / p.cols) * sheet.fh * d };
          if (got.w !== want.w || got.h !== want.h) bad.push(`${p.hires}: ${got.w}x${got.h}, want ${want.w}x${want.h}`);
        }
      } else {
        if (!r.hires || !existsSync(join(PUBLIC, r.hires))) { bad.push(`${sheet.path}: ${r.hires || 'no file'} missing`); continue; }
        const got = headerSize(join(PUBLIC, r.hires));
        if (got.w !== one.w * d || got.h !== one.h * d) bad.push(`${r.hires}: ${got.w}x${got.h}, want ${one.w * d}x${one.h * d}`);
        if (!r.hires.endsWith(`@${d}x${extname(r.hires)}`)) bad.push(`${r.hires}: not named @${d}x`);
      }
      if (r.cells !== (sheet.frames ?? r.cells)) bad.push(`${sheet.path}: ${r.cells} cells, manifest ${sheet.frames}`);
    }
  }
  const want = S === 3 && !manifest.module ? moduleText(results) : denseModuleText(results);
  if (!existsSync(MODULE) || readFileSync(MODULE, 'utf8') !== want) bad.push(`${relative(ROOT, MODULE)} is stale`);
  for (const b of bad) console.log(`stale: ${b}`);
  console.log(bad.length ? `${bad.length} problem(s)` : `${relative(ROOT, manifestPath)}: ok`);
  return bad.length === 0;
}

/** tools/icon-hires/swfinfo.py rewrite: an uncompressed copy whose stage grows by `pad` stage sizes per side. */
function padStage(swf, out, pad) {
  const lib = join(HERE, '../icon-hires');
  execFileSync('python3', ['-I', '-c', 'import sys; sys.path.insert(0, sys.argv[1]); import swfinfo; swfinfo.rewrite(sys.argv[2], sys.argv[3], pad=float(sys.argv[4]))', lib, swf, out, String(pad)], { stdio: 'inherit' });
}

/**
 * js/sprite-dense.js: sheets drawn bigger than their 1x frames, rendered at
 * a density above 3 (manifest "density"). Plain lookups: their users (the
 * loneliness porthole draws on a 2D canvas) pick the file themselves.
 */
export function denseModuleText(results) {
  const ok = Object.entries(results).filter(([, r]) => r.status === 'ok').sort(([a], [b]) => a.localeCompare(b));
  const entries = ok.map(([path, r]) => {
    const parts = r.parts ? r.parts.map((p) => [p.hires, p.from, p.count, p.cols]) : [[r.hires, 0, (r.first ?? 0) + r.cells, r.cols]];
    return `  [${JSON.stringify(path)}, { density: ${r.density ?? 3}, fw: ${r.fw}, fh: ${r.fh}, cols: ${r.cols}, parts: ${JSON.stringify(parts)} }],`;
  }).join('\n');
  return `/**
 * Sheets drawn bigger than their 1x frames, with a sharp render at more than
 * 3 texels per 1x pixel (generated by tools/vector-sprites/build.mjs from a
 * manifest with a "density"; do not edit by hand). Each file is
 * frame-for-frame Tiny Speck's vector SWF (CC0) at zoom = density, placed
 * so its density:1 box downscale matches the 1x sheet, exactly density
 * times its cells. Big sheets are split, in frame order, into parts that
 * each decode to at most the manifest budget, so a 2D canvas decodes only
 * the part it draws. 1x path -> { density, fw, fh (1x cell), cols (1x grid),
 * parts: [[url, from, count, cols], ...] } (part cells from..from+count-1,
 * in a cols-wide grid of density x cells).
 */
export const DENSE_SPRITES = new Map([
${entries}
]);

/** A sheet URL as its DENSE_SPRITES key (from \`assets/\`, no query). */
export function densePath(url) {
  const s = String(url || '');
  const q = s.indexOf('?');
  const path = q < 0 ? s : s.slice(0, q);
  const at = path.indexOf('assets/');
  return at < 0 ? path.replace(/^\\.?\\//, '') : path.slice(at);
}

/**
 * The dense render of a 1x sheet when it is drawn at 1.5 or more device
 * pixels per 1x pixel, else null (the 1x sheet stays: below that a dense
 * image would only cost memory).
 * @param {string} url the 1x sheet
 * @param {number} pxPerTexel device pixels per 1x pixel where it is drawn
 */
export function denseSprite(url, pxPerTexel) {
  const hit = DENSE_SPRITES.get(densePath(url));
  return hit && pxPerTexel >= 1.5 ? hit : null;
}

/**
 * Where grid cell \`index\` (first + frame) of a dense sheet is: its part's URL and the cell's
 * rectangle there, in that file's pixels. Null outside the sheet.
 */
export function denseFrame(dense, index) {
  const part = dense?.parts.find(([, from, count]) => index >= from && index < from + count);
  if (!part) return null;
  const [url, from, , cols] = part;
  const j = index - from;
  const w = dense.fw * dense.density;
  const h = dense.fh * dense.density;
  const c = cols || dense.cols;
  return { url, x: (j % c) * w, y: Math.floor(j / c) * h, w, h };
}
`;
}

/** For one-off analysis scripts (tools/vector-sprites/frame-match.mjs). */
export { readRGBA, crop, downscale, compare, scoreOf, centroid };

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
