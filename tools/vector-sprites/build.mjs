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
 *     every frame clipped to its cell. Rejected sheets are reported, not written.
 *  5. tools/vector-sprites/results.json (scores, placement) and the generated
 *     public/js/sprite-hires.js (1x path -> 3x path) are updated.
 *
 * Manifest options (characters.json uses them):
 *  - "budget": { "maxSide": px, "maxMB": decoded MB } rejects a sheet whose 3x
 *    file would be larger, before any rendering.
 *  - "firstDraw": true (manifest or job) keeps the sheet out of the eager
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
 *
 * Usage:
 *   node tools/vector-sprites/build.mjs [--manifest tools/vector-sprites/animals.json]
 *        [--only <substring>] [--work <dir>] [--dry]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { FFDEC, JAVA, swfSprites } from './swf-labels.mjs';
import { swapParts } from './swf-parts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const PUBLIC = join(ROOT, 'public');
const ITEMS = join(os.homedir(), 'Documents/glitch-audit/glitch-items');
const RESULTS = join(HERE, 'results.json');
const MODULE = join(PUBLIC, 'js/sprite-hires.js');

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

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const manifestPath = resolve(opt('manifest', join(HERE, 'animals.json')));
const only = opt('only', '');
const WORK = resolve(opt('work', join(os.tmpdir(), 'vector-sprites')));
const DRY = args.includes('--dry');

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
 * Box-downscale a 3x render at phase (px, py): pixel (u, v) averages render
 * pixels 3u+px..3u+px+2 (u from -1, so the image is offset by one pixel).
 */
function downscale(img, px, py) {
  const w = Math.ceil((img.w - px) / 3) + 2;
  const h = Math.ceil((img.h - py) / 3) + 2;
  const p = new Float32Array(w * h * 4);
  for (let v = 0; v < h; v++) {
    for (let u = 0; u < w; u++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < 3; j++) {
        const y = 3 * (v - 1) + py + j;
        if (y < 0 || y >= img.h) continue;
        for (let i = 0; i < 3; i++) {
          const x = 3 * (u - 1) + px + i;
          if (x < 0 || x >= img.w) continue;
          const s = (y * img.w + x) * 4;
          r += img.p[s]; g += img.p[s + 1]; b += img.p[s + 2]; a += img.p[s + 3];
        }
      }
      const d = (v * w + u) * 4;
      p[d] = r / 9; p[d + 1] = g / 9; p[d + 2] = b / 9; p[d + 3] = a / 9;
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

function exportSprite(swf, id, zoom = 3) {
  const dir = join(WORK, `${basename(swf, '.swf')}_${id}${zoom === 3 ? '' : `_z${zoom}`}`);
  const done = join(dir, '.done');
  if (!existsSync(done)) {
    mkdirSync(dir, { recursive: true });
    console.log(`  ffdec: ${basename(swf)} sprite ${id} @${zoom}x`);
    execFileSync(JAVA, ['-jar', FFDEC, '-zoom', String(zoom), '-selectid', String(id), '-format', 'sprite:png', '-export', 'sprite', dir, swf], { stdio: 'ignore' });
    writeFileSync(done, '');
  }
  const sub = readdirSync(dir).find((n) => n === `DefineSprite_${id}` || n.startsWith(`DefineSprite_${id}_`));
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
  const { cells } = sheetCells(sheet, ogaImg);
  const label = labels.find((l) => l.name === sheet.label);
  if (!label && !sheet.swfStart) return { status: 'rejected', reason: `label ${sheet.label} not in sprite ${job.sprite}` };
  const start = sheet.swfStart ?? label.start;
  const swfCount = sheet.swfCount ?? label?.count ?? cells.length;
  const cellImgs = cells.map((c) => crop(ogaImg, c.x, c.y, sheet.fw, sheet.fh));
  const step = sheet.step ?? 1;

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
  const shifts = (sheet.shift !== undefined ? [sheet.shift] : [0, 1, -1])
    .filter((s) => sheet.shift !== undefined || (start + s >= start && start + s + (cells.length - 1) * step <= labelEnd) || s === 0);
  const mirrors = sheet.mirror !== undefined ? [sheet.mirror] : [false, true];
  let best = null;
  for (const shift of shifts) {
    for (const mirror of mirrors) {
      // Estimate the 1x offset from centroids at phase 0, then search around it.
      const est = [];
      for (const c of samples) {
        const e = render(start + c.k * step + shift, mirror);
        if (!e) continue;
        const a = centroid(cellImgs[c.k]);
        const b = centroid(phase(e, 0, 0));
        if (a && b) est.push([a.x - (b.x - 1), a.y - (b.y - 1)]);
      }
      if (!est.length) continue;
      const med = (i) => est.map((p) => p[i]).sort((x, y) => x - y)[Math.floor(est.length / 2)];
      const ex = Math.round(med(0));
      const ey = Math.round(med(1));
      for (let px = 0; px < 3; px++) {
        for (let py = 0; py < 3; py++) {
          for (let qx = ex - 4; qx <= ex + 4; qx++) {
            for (let qy = ey - 4; qy <= ey + 4; qy++) {
              const acc = { ea: 0, ec: 0, m: 0 };
              for (const c of samples) {
                const e = render(start + c.k * step + shift, mirror);
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
  // Render pixel (X, Y) lands at cell 3x pixel (X + dx, Y + dy).
  const dx = 3 * best.qx - best.px;
  const dy = 3 * best.qy - best.py;

  // Score every frame with the global placement; also its own best nearby.
  const frames = [];
  for (const c of cells) {
    const n = start + c.k * step + best.shift;
    const e = render(n, best.mirror);
    if (!e) { frames.push({ k: c.k, swf: n, score: 0, missing: true }); continue; }
    const g = scoreOf(compare(cellImgs[c.k], phase(e, best.px, best.py), best.qx, best.qy));
    let own = { score: g, dx: 0, dy: 0 };
    for (let ox = -3; ox <= 3; ox++) {
      for (let oy = -3; oy <= 3; oy++) {
        const DX = dx + ox;
        const DY = dy + oy;
        const qx = Math.ceil(DX / 3);
        const qy = Math.ceil(DY / 3);
        const s = scoreOf(compare(cellImgs[c.k], phase(e, 3 * qx - DX, 3 * qy - DY), qx, qy));
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
  for (const f of frames) f.faint = masses[f.k] < medMass * FAINT_SHARE;
  const solid = frames.filter((f) => !f.faint);
  const scores = frames.map((f) => f.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...solid.map((f) => f.score));
  const faintMin = Math.min(1, ...frames.filter((f) => f.faint).map((f) => f.score));
  // A frame whose own best placement differs by more than one 3x pixel
  // and is clearly better means the global offset does not hold.
  const drift = solid.filter((f) => f.ownBest && (Math.abs(f.ownBest.dx) > 1 || Math.abs(f.ownBest.dy) > 1) && f.ownBest.score - f.score > 0.02);
  const result = {
    swf: relative(ITEMS, job.swf),
    sprite: job.sprite,
    ...(job.zoom && job.zoom !== 3 ? { zoom: job.zoom } : {}),
    label: sheet.label ?? null,
    swfFrames: [start + best.shift, start + best.shift + (cells.length - 1) * step],
    ...(step !== 1 ? { step } : {}),
    swfLabelFrames: swfCount,
    cells: cells.length,
    fw: sheet.fw,
    fh: sheet.fh,
    mirror: best.mirror,
    shift: best.shift,
    offset3x: [dx, dy],
    score: +mean.toFixed(4),
    minFrame: +min.toFixed(4),
    faintFrames: frames.filter((f) => f.faint).length,
    faintMin: +faintMin.toFixed(4),
    drift: drift.map((f) => ({ k: f.k, ...f.ownBest })),
  };
  const reasons = [];
  if (mean < SHEET_MIN) reasons.push(`mean score ${mean.toFixed(3)} < ${SHEET_MIN}`);
  if (min < FRAME_MIN) reasons.push(`frame ${solid.find((f) => f.score === min).k} score ${min.toFixed(3)} < ${FRAME_MIN}`);
  if (faintMin < FAINT_MIN) reasons.push(`faint frame score ${faintMin.toFixed(3)} < ${FAINT_MIN}`);
  if (drift.length) reasons.push(`${drift.length} frame(s) prefer another offset`);
  if (frames.some((f) => f.missing)) reasons.push('SWF has fewer frames than the sheet');
  if (reasons.length) return { ...result, status: 'rejected', reason: reasons.join('; '), frames };
  if (DRY) return { ...result, status: 'dry', frames };

  // Compose the 3x sheet: each frame clipped to its own cell.
  const W = ogaImg.w * 3;
  const H = ogaImg.h * 3;
  const out = new Uint8Array(W * H * 4);
  for (const c of cells) {
    const file = join(frameDir, `${start + c.k * step + best.shift}.png`);
    const raw = readRGBA(file);
    const img = best.mirror ? mirrorRaw(raw) : raw;
    const cx = c.x * 3;
    const cy = c.y * 3;
    const cw = sheet.fw * 3;
    const ch = sheet.fh * 3;
    for (let y = 0; y < img.h; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= ch) continue;
      for (let x = 0; x < img.w; x++) {
        const tx = x + dx;
        if (tx < 0 || tx >= cw) continue;
        const s = (y * img.w + x) * 4;
        const d = ((cy + ty) * W + cx + tx) * 4;
        out[d] = img.raw[s]; out[d + 1] = img.raw[s + 1]; out[d + 2] = img.raw[s + 2]; out[d + 3] = img.raw[s + 3];
      }
    }
  }
  const stem = oga.slice(0, -extname(oga).length);
  const png = `${stem}@3x.png`;
  const webp = `${stem}@3x.webp`;
  const tmpPng = join(WORK, `${basename(stem)}@3x.tmp.png`);
  execFileSync('magick', ['-size', `${W}x${H}`, '-depth', '8', 'rgba:-', '-define', 'png:compression-level=9', '-define', 'png:compression-filter=5', '-strip', `PNG32:${tmpPng}`], { input: out, maxBuffer: 1 << 26 });
  const tmpWebp = join(WORK, `${basename(stem)}@3x.tmp.webp`);
  execFileSync('cwebp', ['-quiet', '-lossless', '-exact', '-z', '9', tmpPng, '-o', tmpWebp]);
  const pngBytes = statSync(tmpPng).size;
  const webpBytes = statSync(tmpWebp).size;
  // Lossless WebP keeps the exact pixels; use it when it saves a fifth.
  const useWebp = extname(oga) === '.webp' || webpBytes < pngBytes * 0.8;
  for (const f of [png, webp]) if (existsSync(f)) unlinkSync(f);
  if (useWebp) { renameSync(tmpWebp, webp); unlinkSync(tmpPng); } else { renameSync(tmpPng, png); unlinkSync(tmpWebp); }
  const file = useWebp ? webp : png;
  return { ...result, status: 'ok', hires: relative(PUBLIC, file), bytes: statSync(file).size, frames };
}

// ---------------------------------------------------------------------------
// Generated module
// ---------------------------------------------------------------------------

export function writeModule(results) {
  const ok = Object.entries(results).filter(([, r]) => r.status === 'ok').sort(([a], [b]) => a.localeCompare(b));
  const entries = ok.map(([path, r]) => `  [${JSON.stringify(path)}, ${JSON.stringify(r.hires)}],`).join('\n');
  const firstDraw = ok.filter(([, r]) => r.firstDraw).map(([path]) => `  ${JSON.stringify(path)},`).join('\n');
  writeFileSync(MODULE, `/**
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
 * Sheets that stay 1x until the renderer first draws them (characters, NPCs,
 * shrines: big sheets that are often loaded and rarely all on screen).
 * installHiresSprites leaves them out of the eager URL route and
 * installHiresFirstDraw swaps them in place on first upload.
 */
export const FIRST_DRAW_SPRITES = new Set([
${firstDraw}
]);

let enabled = true;

/** The 3x URL for a sheet URL (query string kept), or null. */
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
 * memory and alias when minified. First-draw sheets stay 1x here.
 * @param {{ addUrlRoute: Function }} textures the js/textures.js module
 */
export function installHiresSprites(textures, { dpr = globalThis.devicePixelRatio || 1, viewWidth = globalThis.innerWidth || 960 } = {}) {
  enabled = dpr * Math.max(1, viewWidth / 960) >= 1.5;
  if (!enabled || typeof textures?.addUrlRoute !== 'function') return;
  textures.addUrlRoute('hires-sprites', (url) => (FIRST_DRAW_SPRITES.has(sheetPath(url)) ? null : hiresSpriteUrl(url)));
}

/**
 * Swap a 1x TextureSource to its 3x file in place, once, after the 1x image
 * has loaded. Every Texture already cut from it keeps its 1x frame rect and
 * turns sharp. Feature sheet loaders call this when a sheet is first drawn,
 * so sheets that are only preloaded never pay for 3x pixels. Resolves true
 * once swapped.
 * @param {any} source a Pixi 8 TextureSource
 * @param {string} url its 1x sheet URL
 * @param {(source: any) => Promise<any>} [whenLoaded] js/textures.js whenLoaded
 */
export function upgradeSource(source, url, whenLoaded = (s) => Promise.resolve(s)) {
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

/** The listed 1x sheet a TextureSource was loaded from, or null. */
export function sourceSheet(source) {
  const ids = [source?.label, source?.groddleUrl];
  for (const id of ids) {
    if (typeof id !== 'string' || !id) continue;
    const path = sheetPath(id);
    if (HIRES_SPRITES.has(path)) return path;
  }
  return null;
}

/**
 * Swap any listed sheet to 3x the first time the renderer uploads its 1x
 * texture (the WebGL or WebGPU texture system's _initSource runs once per
 * TextureSource, and again after Pixi's texture GC unloads it), whatever
 * loaded it: game.js SHEETS, quest-room kits, feature modules. Sheets that
 * are loaded but never drawn keep their 1x pixels.
 * @param {any} renderer a Pixi 8 renderer
 * @param {(source: any) => Promise<any>} [whenLoaded] js/textures.js whenLoaded
 */
export function installHiresFirstDraw(renderer, whenLoaded) {
  const system = renderer?.texture;
  if (!enabled || typeof system?._initSource !== 'function' || system.hiresFirstDraw) return;
  const init = system._initSource.bind(system);
  system._initSource = (source) => {
    const gpu = init(source);
    const path = source?.hiresUpgrade ? null : sourceSheet(source);
    if (path) upgradeSource(source, path, whenLoaded);
    return gpu;
  };
  system.hiresFirstDraw = true;
}
`);
}

// ---------------------------------------------------------------------------

/** Pixel size of an image file. */
function imageSize(file) {
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', `${file}[0]`], { encoding: 'utf8' }).trim().split(' ').map(Number);
  return { w, h };
}

/** Why a sheet's 3x file would break the manifest budget, or null. */
export function overBudget({ w, h }, budget) {
  if (!budget) return null;
  const W = w * 3;
  const H = h * 3;
  const mb = (W * H * 4) / 2 ** 20;
  if (budget.maxSide && Math.max(W, H) > budget.maxSide) return `3x is ${W}x${H}, over the ${budget.maxSide} px texture side`;
  if (budget.maxMB && mb > budget.maxMB) return `3x is ${W}x${H} = ${mb.toFixed(1)} MB decoded, over ${budget.maxMB} MB`;
  return null;
}

const characterOf = (job) => job.character || job.name;

function main() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const results = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
  mkdirSync(WORK, { recursive: true });
  const record = (job, sheet, r) => {
    const { frames, ...summary } = r;
    results[sheet.path] = {
      animal: job.name,
      ...(job.character ? { character: job.character } : {}),
      ...summary,
      ...((job.firstDraw ?? manifest.firstDraw) ? { firstDraw: true } : {}),
      frameScores: frames?.map((f) => f.score),
    };
  };
  // Budget first: a character with any oversized sheet is not rendered at all.
  const tooBig = new Map();
  for (const job of manifest.jobs) {
    for (const sheet of job.sheets) {
      const why = overBudget(imageSize(join(PUBLIC, sheet.path)), manifest.budget);
      if (why && !tooBig.has(characterOf(job))) tooBig.set(characterOf(job), `${basename(sheet.path)}: ${why}`);
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
    if (job.parts) {
      const tag = createHash('sha1').update(JSON.stringify(job.parts)).digest('hex').slice(0, 8);
      source = join(WORK, `${basename(swf, '.swf')}.${job.name}.${tag}.swf`);
      if (!existsSync(source)) console.log(`  parts: ${swapParts(swf, source, job.parts)} placements swapped`);
    }
    const labels = swfSprites(source).find((s) => s.id === job.sprite)?.labels || [];
    const frameDir = exportSprite(source, job.sprite, job.zoom ?? 3);
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
      console.log(`  ${tag} ${basename(sheet.path)} score ${r.score ?? '-'} min ${r.minFrame ?? '-'} mirror ${r.mirror ?? '-'} shift ${r.shift ?? '-'} offset ${r.offset3x ?? '-'}${r.bytes ? ` ${(r.bytes / 1024).toFixed(0)} KB` : ''}${r.reason ? ` (${r.reason})` : ''} ${((Date.now() - t) / 1000).toFixed(1)}s`);
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
      if (r.hires && existsSync(join(PUBLIC, r.hires)) && !DRY) unlinkSync(join(PUBLIC, r.hires));
      results[p] = { ...r, status: 'rejected', reason: `held back: ${c} also needs ${basename(bad)} (${results[bad]?.status || 'not built'})`, hires: undefined, bytes: undefined };
      console.log(`  held ${basename(p)}: ${c} also needs ${basename(bad)}`);
    }
  }
  if (DRY) {
    writeFileSync(join(WORK, 'dry-results.json'), `${JSON.stringify(results, null, 1)}\n`);
    return;
  }
  for (const [path, r] of Object.entries(results)) {
    if (r.status !== 'ok') continue;
    if (!existsSync(join(PUBLIC, r.hires))) delete results[path];
  }
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  writeModule(results);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
