#!/usr/bin/env node
/**
 * Measure the quoin animation from Tiny Speck's 1x sheet (CC0) and write
 * tools/quoin-art/frames.json, the per-frame data build.mjs replays.
 *
 * Rows 0-6 (iMG, mood, energy, currants, mystery, favor, time):
 *  - body.dy: the body is one fixed image moved by whole pixels. Each frame's
 *    lower body is matched against frame 0 at every vertical shift; the
 *    match must be exact (zero error), which is checked.
 *  - propeller: everything above the body's top row. The hub position is
 *    fitted once per row, then each frame's spin (the rotor's horizontal
 *    scale a, -1..1; the sign says which end of the grey bar leads) and a
 *    whole-pixel offset are chosen by rendering svg/propeller.svg at every
 *    candidate (a in 0.01 steps) and keeping the closest to the 1x pixels.
 * Row 7 (Qurazy): no propeller; the cloud squashes and its five spots change
 *  colour. Each frame's affine (scale x/y about the centre plus offset) is
 *  fitted to frame 0's alpha, and each spot's colour is the mean colour of
 *  its interior pixels in that frame.
 *
 * Usage: node tools/quoin-art/measure.mjs
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, FW, FH, COLS, TYPES, propellerDefs, propellerUse } from './compose.mjs';
import { readImage, crop, renderSvg, score } from './pixels.mjs';

export const SHEET = 'public/assets/sprites/quoin__x1_1_x1_2_x1_3_x1_4_x1_5_x1_6_x1_7_x1_8_png_1354829599.png';
const ROOT = join(HERE, '../..');
const OUT = join(HERE, 'frames.json');

/** Hub and stem colours, sampled from the 1x hub/stem pixels of each row. */
const PALETTES = {
  xp: { hubTop: '#efd37a', hubBottom: '#e4b03a', stemDark: '#e4ad31', stemLight: '#ecd68a' },
  mood: { hubTop: '#f6ca84', hubBottom: '#e7803c', stemDark: '#e36b24', stemLight: '#f4be79' },
  energy: { hubTop: '#6eaef4', hubBottom: '#2f9de6', stemDark: '#249be3', stemLight: '#79aef4' },
  currants: { hubTop: '#f4c86e', hubBottom: '#e5902e', stemDark: '#e38724', stemLight: '#f4d279' },
  mystery: { hubTop: '#f4ef86', hubBottom: '#e3b83e', stemDark: '#e1b035', stemLight: '#f7f1b3' },
  favor: { hubTop: '#7cb0f5', hubBottom: '#2f9de6', stemDark: '#269be3', stemLight: '#79aef4' },
  time: { hubTop: '#f4ef86', hubBottom: '#e1b235', stemDark: '#dfab29', stemLight: '#f5efaa' },
};

const sheet = readImage(join(ROOT, SHEET));
const cell = (row, f) => crop(sheet, f * FW, row * FH, FW, FH);

function bottomRow(img) {
  for (let y = img.h - 1; y >= 0; y--) for (let x = 0; x < img.w; x++) if (img.p[(y * img.w + x) * 4 + 3] > 0) return y;
  return -1;
}

/** Whole-pixel vertical shift of each frame's lower body against frame 0 (must be exact). */
function bodyShifts(row) {
  const f0 = cell(row, 0), b0 = bottomRow(f0);
  return Array.from({ length: COLS }, (_, f) => {
    const img = cell(row, f);
    let best = null;
    for (let dy = -14; dy <= 14; dy++) {
      let e = 0;
      for (let y = b0 - 13; y <= Math.min(FH - 1, b0 + 1); y++) {
        const y2 = y + dy;
        for (let x = 0; x < FW; x++) for (let k = 0; k < 4; k++) {
          const v = y2 >= 0 && y2 < FH ? img.p[(y2 * FW + x) * 4 + k] : 0;
          e += Math.abs(f0.p[(y * FW + x) * 4 + k] - v);
        }
      }
      if (!best || e < best.e) best = { e, dy };
    }
    if (best.e > 0) throw new Error(`row ${row} frame ${f}: body is not a whole-pixel move (error ${best.e})`);
    return best.dy;
  });
}

/** First body row (frame-0 coordinates): the first row with 4+ pixels identical in every frame. */
function bodyTop(row, dy) {
  const frames = Array.from({ length: COLS }, (_, f) => cell(row, f));
  for (let y = 0; y < FH; y++) {
    let same = 0;
    for (let x = 0; x < FW; x++) {
      const vals = new Set();
      let seen = 0;
      for (let f = 0; f < COLS; f++) {
        const yy = y + dy[f];
        if (yy < 0 || yy >= FH) continue;
        const o = (yy * FW + x) * 4;
        vals.add([0, 1, 2, 3].map((k) => Math.round(frames[f].p[o + k])).join());
        seen++;
      }
      const v = [...vals][0];
      if (seen && vals.size === 1 && !v.endsWith(',0')) same++;
    }
    if (same >= 4) return y;
  }
  throw new Error(`row ${row}: no body top`);
}

/** img moved down by dy whole pixels, with rows from `limit` down cleared. */
function shiftRows(img, dy, limit) {
  const out = { w: img.w, h: img.h, p: new Float32Array(img.p.length) };
  for (let y = 0; y < Math.min(limit, img.h); y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= img.h) continue;
    out.p.set(img.p.subarray(sy * img.w * 4, (sy + 1) * img.w * 4), y * img.w * 4);
  }
  return out;
}

/** 1x frame with everything from `limit` down cleared (the propeller only). */
function propellerTarget(row, f, limit) {
  const img = cell(row, f);
  for (let y = Math.max(0, limit); y < FH; y++) for (let x = 0; x < FW; x++) for (let k = 0; k < 4; k++) img.p[(y * FW + x) * 4 + k] = 0;
  return img;
}

function propellerFit(type, row, dy, top) {
  const palette = PALETTES[type];
  const limit = (f) => top + dy[f];
  const targets = Array.from({ length: COLS }, (_, f) => propellerTarget(row, f, limit(f)));
  const render = (cands) => {
    // cands: [{ x, y, a }] in cell coordinates; one 40 x 45 cell each, one rsvg pass.
    const cols = 24, rows = Math.ceil(cands.length / cols);
    const cells = cands.map((c, i) => `<g transform="translate(${(i % cols) * FW} ${Math.floor(i / cols) * FH})" clip-path="url(#cell)">${propellerUse(type, c.x, c.y, c.a)}</g>`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * FW}" height="${rows * FH}" viewBox="0 0 ${cols * FW} ${rows * FH}"><defs><clipPath id="cell"><rect width="${FW}" height="${FH}"/></clipPath>${propellerDefs(type, palette)}</defs>${cells.join('')}</svg>`;
    const img = renderSvg(svg, cols * FW, rows * FH);
    return cands.map((_, k) => crop(img, (k % cols) * FW, Math.floor(k / cols) * FH, FW, FH));
  };
  // 1. hub position: the widest frames (most propeller alpha) at a = +-1.
  const mass = targets.map((t) => t.p.reduce((s, v, i) => (i % 4 === 3 ? s + v : s), 0));
  const wide = mass.map((m, f) => [m, f]).sort((a, b) => b[0] - a[0]).slice(0, 4).map(([, f]) => f);
  let hub = null;
  {
    const cands = [];
    for (let x = 17.5; x <= 21.01; x += 0.25) for (let y = -6.5; y <= -0.99; y += 0.25) for (const a of [1, -1]) cands.push({ x, y, a });
    const scores = new Map();
    for (const f of wide) {
      const placed = cands.map((c) => ({ ...c, y: c.y + limit(f) }));
      const imgs = render(placed);
      imgs.forEach((img, k) => {
        const lim = limit(f);
        for (let y = Math.max(0, lim); y < FH; y++) for (let x = 0; x < FW; x++) for (let q = 0; q < 4; q++) img.p[(y * FW + x) * 4 + q] = 0;
        const key = `${cands[k].x},${cands[k].y}`;
        const s = score(targets[f], img, { y1: Math.max(0, lim) });
        const prev = scores.get(key) || new Map();
        prev.set(f, Math.max(prev.get(f) || 0, s));
        scores.set(key, prev);
      });
    }
    let best = null;
    for (const [key, per] of scores) {
      const s = [...per.values()].reduce((a, b) => a + b, 0) / per.size;
      if (!best || s > best.s) best = { s, key };
    }
    const [x, y] = best.key.split(',').map(Number);
    hub = { x, yRel: y };
  }
  // 2. spin and whole-pixel offset per frame. Every candidate spin is rendered
  //    once at the frame-0 position; a frame's candidates are those images
  //    moved by whole pixels (the cell clips the same rows either way).
  const spin = [], pdy = [], fitScore = [];
  const as = [];
  for (let a = -1; a <= 1.0001; a += 0.01) if (Math.abs(a) > 0.005) as.push(+a.toFixed(2));
  const base = render(as.map((a) => ({ x: hub.x, y: hub.yRel + top, a })));
  for (let f = 0; f < COLS; f++) {
    const lim = Math.max(0, limit(f));
    let best = null;
    for (const o of [0, -1, 1]) {
      base.forEach((img, k) => {
        const moved = shiftRows(img, dy[f] + o, lim);
        const s = score(targets[f], moved, { y1: lim });
        if (!best || s > best.s) best = { s, a: as[k], o };
      });
    }
    spin.push(best.a);
    pdy.push(dy[f] + best.o);
    fitScore.push(+best.s.toFixed(4));
  }
  return { palette, x: hub.x, y: +(hub.yRel + top).toFixed(2), dy: pdy, spin, fitScore };
}

// --- Qurazy -----------------------------------------------------------------

function bilinear(img, x, y, k) {
  const x0 = Math.floor(x - 0.5), y0 = Math.floor(y - 0.5), tx = x - 0.5 - x0, ty = y - 0.5 - y0;
  const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h ? 0 : img.p[(yy * img.w + xx) * 4 + k]);
  return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
}

/** Affine (sx, sy about centre c, then offset tx, ty) taking frame 0's alpha onto frame f. */
function qurazyFit(row) {
  const f0 = cell(row, 0);
  let cx = 0, cy = 0, m = 0;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const a = f0.p[(y * FW + x) * 4 + 3]; cx += (x + 0.5) * a; cy += (y + 0.5) * a; m += a; }
  cx /= m; cy /= m;
  const err = (img, P) => {
    let e = 0;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      // inverse map cell pixel (x, y) of frame f back into frame 0
      const u = (x + 0.5 - P.tx - cx) / P.sx + cx, v = (y + 0.5 - P.ty - cy) / P.sy + cy;
      e += Math.abs(img.p[(y * FW + x) * 4 + 3] - bilinear(f0, u, v, 3));
    }
    return e;
  };
  const out = [];
  for (let f = 0; f < COLS; f++) {
    const img = cell(row, f);
    let P = { sx: 1, sy: 1, tx: 0, ty: 0 }, e = err(img, P);
    for (const step of [0.5, 0.25, 0.1, 0.05, 0.02, 0.01]) {
      let moved = true;
      while (moved) {
        moved = false;
        for (const k of ['tx', 'ty', 'sx', 'sy']) for (const s of [1, -1]) {
          const d = k[0] === 's' ? step / 10 : step;
          const Q = { ...P, [k]: P[k] + s * d };
          const eq = err(img, Q);
          if (eq < e - 1e-6) { P = Q; e = eq; moved = true; }
        }
      }
    }
    // matrix(a b c d e f) mapping frame-0 coordinates into frame f
    out.push({ matrix: [P.sx, 0, 0, P.sy, cx - P.sx * cx + P.tx, cy - P.sy * cy + P.ty].map((v) => +v.toFixed(4)) });
  }
  return { centre: [+cx.toFixed(3), +cy.toFixed(3)], frames: out };
}

/** Mean colour of each Qurazy spot per frame (spot interiors from qurazy-spots.json). */
function qurazySpots(row, frames) {
  const spotsFile = join(HERE, 'qurazy-spots.json');
  if (!existsSync(spotsFile)) return {};
  const spots = JSON.parse(readFileSync(spotsFile, 'utf8'));
  const out = {};
  for (const [id, pts] of Object.entries(spots)) {
    out[id] = frames.map(({ matrix: [a, , , d, e, f2] }, f) => {
      const img = cell(row, f);
      const c = [0, 0, 0];
      let n = 0;
      for (const [x, y] of pts) {
        const X = a * (x + 0.5) + e, Y = d * (y + 0.5) + f2;
        const al = bilinear(img, X, Y, 3);
        if (al < 200) continue;
        for (let k = 0; k < 3; k++) c[k] += bilinear(img, X, Y, k) / al * 255;
        n++;
      }
      return '#' + c.map((v) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, '0')).join('');
    });
  }
  return out;
}

/**
 * Every row turns the same rotor: a 12-frame half-and-half cycle (twice per
 * 24-frame loop), started at a different frame. Find each row's phase
 * against row 0, take the median spin per cycle step over all rows and
 * frames, and replay that one cycle everywhere (removes 0.01-0.02 fit noise).
 */
function canonicalSpin(out) {
  const rows = Object.values(out.types).filter((t) => t.propeller);
  const ref = rows[0].propeller.spin;
  const N = 12;
  const phaseOf = (spin) => {
    let best = null;
    for (let ph = 0; ph < N; ph++) {
      let e = 0;
      for (let f = 0; f < COLS; f++) e += Math.abs(spin[f] - ref[(f + ph) % N]);
      if (!best || e < best.e) best = { e, ph };
    }
    return best.ph;
  };
  const buckets = Array.from({ length: N }, () => []);
  for (const t of rows) {
    t.propeller.spinPhase = phaseOf(t.propeller.spin);
    t.propeller.spin.forEach((a, f) => buckets[(f + t.propeller.spinPhase) % N].push(a));
  }
  const median = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const cycle = buckets.map(median);
  out.spinCycle = cycle;
  for (const t of rows) {
    t.propeller.measuredSpin = t.propeller.spin;
    t.propeller.spin = Array.from({ length: COLS }, (_, f) => cycle[(f + t.propeller.spinPhase) % N]);
  }
}

function main() {
  const out = {
    source: SHEET,
    note: 'Measured from the 1x sheet by tools/quoin-art/measure.mjs; replayed by build.mjs.',
    frame: [FW, FH],
    grid: [COLS, TYPES.length],
    types: {},
  };
  TYPES.forEach((type, row) => {
    if (type === 'qurazy') {
      const q = qurazyFit(row);
      out.types[type] = { row, body: { centre: q.centre, matrix: q.frames.map((f) => f.matrix) }, spots: qurazySpots(row, q.frames) };
      console.log(type, 'fitted', q.frames.length, 'frames');
      return;
    }
    const dy = bodyShifts(row);
    const top = bodyTop(row, dy);
    const propeller = propellerFit(type, row, dy, top);
    out.types[type] = { row, bodyTop: top, body: { dy }, propeller };
    console.log(type, 'top', top, 'hub', propeller.x, propeller.y, 'spin', propeller.spin.join(' '));
  });
  canonicalSpin(out);
  writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
}

main();
