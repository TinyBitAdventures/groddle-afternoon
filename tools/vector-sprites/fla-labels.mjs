#!/usr/bin/env node
/**
 * Sprite sheets for clips that survive only in Tiny Speck's authoring files (CC0 glitch-items .fla),
 * not in the published SWF or the OGA sheets: G605/G507, the Piggy's "root" (the sniff the server
 * plays while it roots, npc_piggy.js onRooting 1131-1160, state 'sniff') in
 * glitch-items/inhabitants/piggy/npc_piggy.fla LIBRARY/pig.xml (frames 251-299; the published
 * npc_piggy.swf of Dec 2012 lists walk..too_much_nibble, rooked1/2 and no root or poop).
 *
 * For each job in tools/vector-sprites/fla-labels.json:
 *  1. tools/overlay-art/xfl-svg.mjs renders the FLA's main timeline with the clip's playhead put on
 *     a label (frameSvg start), at 3x, one SVG per frame; Chromium rasterises them
 *     (svg-raster.mjs, through the shared browser lock).
 *  2. The placement (mirror, 3x offset) is found on a reference label the OGA sheets do have (the
 *     Piggy's chew): the same art drawn the same way must land on the shipped @3x cells, scored
 *     the way build.mjs scores (premultiplied RGBA). The job fails under minScore.
 *  3. Each new label is written with that placement as <out>@3x.webp (lossless) and <out>.webp, its
 *     1x (a 3:1 box downscale of the 3x), cells fw x fh in `cols` columns.
 *  4. Provenance goes into tools/vector-sprites/fla-labels-results.json: the FLA, label, frames, the
 *     placement and its score. The art is Tiny Speck's own (CC0), redrawn by machine, never painted.
 *     The 1x path and its 3x twin join tools/vector-sprites/results.json (source "fla") and the
 *     generated js/sprite-hires.js, as build.mjs's SWF sheets do.
 *
 *   node tools/vector-sprites/fla-labels.mjs [--work <dir>] [--check]
 * --check: the sheets exist and the results name them (no rendering).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameSvg, loadFla } from '../overlay-art/xfl-svg.mjs';
import { readRGBA, crop, writeModule } from './build.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(root, 'public');
const ITEMS = resolve(root, '..', 'glitch-items');
const MANIFEST = join(root, 'tools/vector-sprites/fla-labels.json');
const RESULTS = join(root, 'tools/vector-sprites/fla-labels-results.json');
const SWF_RESULTS = join(root, 'tools/vector-sprites/results.json');
const argv = process.argv.slice(2);
const opt = (name, fb) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fb; };
const S = 3;

function framesOf(fla, clip, label) {
  const tl = fla.symbols.get(clip);
  const from = tl.labels.get(label);
  if (from === undefined) throw new Error(`${clip}: no label ${label}`);
  const starts = [...tl.labels.values()].filter((f) => f > from).sort((a, b) => a - b);
  return { from, count: (starts[0] ?? tl.frameCount) - from };
}

async function render(fla, clip, label, count, box, dir) {
  mkdirSync(dir, { recursive: true });
  const jobs = [];
  for (let n = 0; n < count; n++) {
    const svg = join(dir, `${label}-${n}.svg`);
    const png = join(dir, `${label}-${n}.png`);
    writeFileSync(svg, frameSvg(fla, n, { scale: S, box, start: { [clip]: label } }));
    jobs.push({ svg, png });
  }
  const { rasteriseSvgs } = await import('./svg-raster.mjs');
  await rasteriseSvgs(jobs);
  return jobs.map((j) => readRGBA(j.png));
}

function mirrored(img) {
  const p = new Float32Array(img.p.length);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const s = (y * img.w + x) * 4;
      const d = (y * img.w + (img.w - 1 - x)) * 4;
      p[d] = img.p[s]; p[d + 1] = img.p[s + 1]; p[d + 2] = img.p[s + 2]; p[d + 3] = img.p[s + 3];
    }
  }
  return { w: img.w, h: img.h, p };
}

function centroid(img) {
  let sx = 0, sy = 0, s = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const a = img.p[(y * img.w + x) * 4 + 3];
    sx += a * x; sy += a * y; s += a;
  }
  return s ? { x: sx / s, y: sy / s } : { x: 0, y: 0 };
}

/** build.mjs's score of cell o against render r placed at (dx, dy) (cell x shows r x - dx). */
function score(o, r, dx, dy) {
  let ea = 0, ec = 0, m = 0;
  for (let y = 0; y < o.h; y++) {
    const v = y - dy;
    for (let x = 0; x < o.w; x++) {
      const u = x - dx;
      const s = (y * o.w + x) * 4;
      let R = 0, G = 0, B = 0, A = 0;
      if (u >= 0 && u < r.w && v >= 0 && v < r.h) {
        const t = (v * r.w + u) * 4;
        R = r.p[t]; G = r.p[t + 1]; B = r.p[t + 2]; A = r.p[t + 3];
      }
      const oa = o.p[s + 3];
      if (oa === 0 && A === 0) continue;
      ea += Math.abs(oa - A);
      ec += Math.abs(o.p[s] - R) + Math.abs(o.p[s + 1] - G) + Math.abs(o.p[s + 2] - B);
      m += Math.max(oa, A);
    }
  }
  return m === 0 ? 1 : 1 - (ea / m + ec / (3 * m)) / 2;
}

function place(cells, renders) {
  let best = null;
  for (const mirror of [false, true]) {
    const rs = renders.map((r) => (mirror ? mirrored(r) : r));
    const pick = [0, Math.floor(rs.length / 3), Math.floor((2 * rs.length) / 3)];
    const c0 = centroid(cells[0]);
    const r0 = centroid(rs[0]);
    const gx = Math.round(c0.x - r0.x);
    const gy = Math.round(c0.y - r0.y);
    for (let dy = gy - 6; dy <= gy + 6; dy++) {
      for (let dx = gx - 6; dx <= gx + 6; dx++) {
        let s = 0;
        for (const k of pick) s += score(cells[k], rs[k], dx, dy);
        s /= pick.length;
        if (!best || s > best.s) best = { s, mirror, dx, dy };
      }
    }
  }
  return best;
}

function writeSheet(renders, { mirror, dx, dy }, fw, fh, cols, out, work) {
  const W3 = fw * S * cols;
  const H3 = fh * S * Math.ceil(renders.length / cols);
  const buf = new Uint8Array(W3 * H3 * 4);
  renders.forEach((img0, k) => {
    const img = mirror ? mirrored(img0) : img0;
    const cx = (k % cols) * fw * S;
    const cy = Math.floor(k / cols) * fh * S;
    for (let y = 0; y < fh * S; y++) {
      const v = y - dy;
      if (v < 0 || v >= img.h) continue;
      for (let x = 0; x < fw * S; x++) {
        const u = x - dx;
        if (u < 0 || u >= img.w) continue;
        const s = (v * img.w + u) * 4;
        const a = img.p[s + 3];
        const d = ((cy + y) * W3 + cx + x) * 4;
        // Back from premultiplied.
        buf[d] = a ? Math.round(img.p[s] * 255 / a) : 0;
        buf[d + 1] = a ? Math.round(img.p[s + 1] * 255 / a) : 0;
        buf[d + 2] = a ? Math.round(img.p[s + 2] * 255 / a) : 0;
        buf[d + 3] = Math.round(a);
      }
    }
  });
  const png3 = join(work, 'sheet3x.png');
  execFileSync('magick', ['-size', `${W3}x${H3}`, '-depth', '8', 'rgba:-', `PNG32:${png3}`], { input: buf, maxBuffer: 1 << 27 });
  const png1 = join(work, 'sheet1x.png');
  // A 3:1 box average (every 1x pixel the mean of its nine).
  execFileSync('magick', [png3, '-filter', 'Box', '-resize', `${W3 / S}x${H3 / S}!`, `PNG32:${png1}`]);
  execFileSync('cwebp', ['-quiet', '-lossless', '-exact', '-z', '9', '-metadata', 'none', png3, '-o', `${out}@3x.webp`]);
  execFileSync('cwebp', ['-quiet', '-lossless', '-exact', '-z', '9', '-metadata', 'none', png1, '-o', `${out}.webp`]);
  return { w: W3 / S, h: H3 / S };
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (argv.includes('--check')) {
    const results = JSON.parse(readFileSync(RESULTS, 'utf8'));
    let bad = 0;
    for (const job of manifest.jobs) {
      for (const sh of job.sheets) {
        const r = results.sheets?.[sh.out];
        for (const f of [`${sh.out}.webp`, `${sh.out}@3x.webp`]) {
          if (!existsSync(join(PUBLIC, f))) { console.error(`missing ${f}`); bad++; }
        }
        if (!r || r.label !== sh.label || r.fla !== job.fla) { console.error(`no result for ${sh.out}`); bad++; }
        const twin = JSON.parse(readFileSync(SWF_RESULTS, 'utf8'))[`${sh.out}.webp`];
        if (twin?.hires !== `${sh.out}@3x.webp` || twin?.status !== 'ok') { console.error(`results.json lacks ${sh.out}.webp`); bad++; }
      }
    }
    process.exit(bad ? 1 : 0);
  }
  const work = resolve(opt('work', join(root, '..', 'fla-labels-work')));
  const results = { _doc: 'Generated by tools/vector-sprites/fla-labels.mjs (do not edit): sheets drawn from Tiny Speck\'s CC0 authoring files (.fla), with the placement found on a reference label and its score.', sheets: {} };
  for (const job of manifest.jobs) {
    const fla = loadFla(join(ITEMS, job.fla));
    const box = job.box;
    const ref = framesOf(fla, job.clip, job.ref.label);
    const refCount = Math.min(ref.count, job.ref.frames);
    const refRenders = await render(fla, job.clip, job.ref.label, refCount, box, join(work, job.clip));
    const sheet = readRGBA(join(PUBLIC, job.ref.sheet));
    const cells = [];
    for (let k = 0; k < refCount; k++) cells.push(crop(sheet, (k % job.ref.cols) * job.fw * S, Math.floor(k / job.ref.cols) * job.fh * S, job.fw * S, job.fh * S));
    const at = place(cells, refRenders);
    const rs = refRenders.map((r) => (at.mirror ? mirrored(r) : r));
    const all = cells.map((c, k) => score(c, rs[k], at.dx, at.dy));
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    console.log(`${job.fla} ${job.ref.label}: mirror ${at.mirror} offset ${at.dx},${at.dy} score ${mean.toFixed(4)} (min ${Math.min(...all).toFixed(4)})`);
    if (mean < job.minScore) throw new Error(`${job.fla}: the reference ${job.ref.label} scores ${mean.toFixed(4)} < ${job.minScore}`);
    for (const sh of job.sheets) {
      const fr = framesOf(fla, job.clip, sh.label);
      const renders = await render(fla, job.clip, sh.label, fr.count, box, join(work, job.clip));
      const size = writeSheet(renders, at, job.fw, job.fh, sh.cols, join(PUBLIC, sh.out), work);
      results.sheets[sh.out] = { fla: job.fla, clip: job.clip, label: sh.label, flaFrames: [fr.from + 1, fr.from + fr.count], frames: fr.count, fw: job.fw, fh: job.fh, cols: sh.cols, w: size.w, h: size.h, ref: job.ref.label, mirror: at.mirror, offset3x: [at.dx, at.dy], refScore: Math.round(mean * 1e4) / 1e4, license: 'CC0 (Tiny Speck, glitch-items)' };
      console.log(`wrote ${sh.out}.webp and @3x (${fr.count} frames)`);
    }
  }
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  // The 3x twins, as build.mjs lists its own (results.json, js/sprite-hires.js).
  const swfResults = JSON.parse(readFileSync(SWF_RESULTS, 'utf8'));
  for (const [out, r] of Object.entries(results.sheets)) {
    swfResults[`${out}.webp`] = { animal: r.clip, source: 'fla', fla: r.fla, label: r.label, cells: r.frames, fw: r.fw, fh: r.fh, offset3x: r.offset3x, score: r.refScore, status: 'ok', hires: `${out}@3x.webp`, firstDraw: true };
  }
  writeFileSync(SWF_RESULTS, `${JSON.stringify(swfResults, null, 1)}\n`);
  writeModule(swfResults);
}

await main();
