/**
 * Pose check: the composed default look against the recovered 62d8dab1
 * player sheets (assets/sprites/avatar/glitch-62d8/), frame for frame.
 *
 * The outfits differ (62d8's exact articles are unknown), so the comparison
 * is on silhouettes: alpha agreement 1 - sum|a - b| / sum max(a, b) at one
 * global offset per sheet (like tools/vector-sprites' placement search),
 * plus, per frame, its own best offset (drift) and whether the same swf
 * frame of the composed sheet is the best match among all its frames.
 * Writes tools/avatar-compositor/score.json.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLITCH_AVATAR, SHEET_FRAMES } from '../../public/js/avatar-anims.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, '../../public');

/** A sheet passes when its mean frame score reaches this. */
export const POSE_SHEET_MIN = 0.7;
/** Every frame's own swf frame must be its best match within this margin. */
export const POSE_MATCH_MARGIN = 0.02;

function readAlpha(file) {
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', `${file}[0]`], { encoding: 'utf8' }).trim().split(' ').map(Number);
  const raw = execFileSync('magick', [`${file}[0]`, '-depth', '8', 'rgba:-'], { maxBuffer: w * h * 4 + 1024 });
  const a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = raw[i * 4 + 3] / 255;
  return { w, h, a };
}

function cell(img, x0, y0, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 + x;
    const sy = y0 + y;
    if (sx >= 0 && sy >= 0 && sx < img.w && sy < img.h) out[y * w + x] = img.a[sy * img.w + sx];
  }
  return { w, h, a: out };
}

/** Agreement of ref and mine where mine pixel (x, y) lands on ref (x + dx, y + dy). */
function agree(ref, mine, dx, dy) {
  let diff = 0;
  let mass = 0;
  for (let y = 0; y < ref.h; y++) {
    for (let x = 0; x < ref.w; x++) {
      const mx = x - dx;
      const my = y - dy;
      const b = mx >= 0 && my >= 0 && mx < mine.w && my < mine.h ? mine.a[my * mine.w + mx] : 0;
      const a = ref.a[y * ref.w + x];
      if (!a && !b) continue;
      diff += Math.abs(a - b);
      mass += Math.max(a, b);
    }
  }
  // Composed pixels that fall outside the ref cell count as misses.
  for (let my = 0; my < mine.h; my++) for (let mx = 0; mx < mine.w; mx++) {
    const x = mx + dx;
    const y = my + dy;
    if (x >= 0 && y >= 0 && x < ref.w && y < ref.h) continue;
    const b = mine.a[my * mine.w + mx];
    diff += b;
    mass += b;
  }
  return mass ? 1 - diff / mass : 1;
}

export async function score({ write = true } = {}) {
  const { VECTOR_AVATAR } = await import(`../../public/js/avatar-vector-sheets.js?t=${Date.now()}`);
  const report = { reference: GLITCH_AVATAR.id, sheets: {} };
  let ok = true;
  for (const [name, frames] of Object.entries(SHEET_FRAMES)) {
    const rd = GLITCH_AVATAR.sheets[name];
    const md = VECTOR_AVATAR.sheets[name];
    const refImg = readAlpha(join(PUBLIC, GLITCH_AVATAR.dir, rd.file));
    const mineImg = readAlpha(join(PUBLIC, VECTOR_AVATAR.dir, md.file));
    const refs = frames.map((_, k) => cell(refImg, k * rd.fw, 0, rd.fw, rd.fh));
    const mine = frames.map((_, k) => cell(mineImg, (k % md.cols) * md.fw, Math.floor(k / md.cols) * md.fh, md.fw, md.fh));
    // Feet-to-feet start: mine origin (midX, feetY) onto ref (midX, feetY), then search.
    const ex = rd.midX - md.midX;
    const ey = rd.feetY - md.feetY;
    let best = null;
    const sample = frames.map((_, k) => k).filter((k, i) => i % Math.max(1, Math.floor(frames.length / 8)) === 0);
    for (let dx = ex - 12; dx <= ex + 12; dx++) {
      for (let dy = ey - 12; dy <= ey + 12; dy++) {
        let s = 0;
        for (const k of sample) s += agree(refs[k], mine[k], dx, dy);
        s /= sample.length;
        if (!best || s > best.s) best = { s, dx, dy };
      }
    }
    const rows = frames.map((fn, k) => {
      const s = agree(refs[k], mine[k], best.dx, best.dy);
      let own = { s, dx: 0, dy: 0 };
      for (let ox = -3; ox <= 3; ox++) for (let oy = -3; oy <= 3; oy++) {
        const t = agree(refs[k], mine[k], best.dx + ox, best.dy + oy);
        if (t > own.s + 1e-9) own = { s: t, dx: ox, dy: oy };
      }
      // Frame for frame: the same swf frame should be the best match.
      let bestJ = k;
      let bestS = s;
      mine.forEach((m, j) => {
        if (j === k) return;
        const t = agree(refs[k], m, best.dx, best.dy);
        if (t > bestS) { bestS = t; bestJ = j; }
      });
      return { swf: fn, score: +s.toFixed(4), own: own.dx || own.dy ? { dx: own.dx, dy: own.dy, score: +own.s.toFixed(4) } : null, bestMatch: frames[bestJ], matched: bestJ === k || bestS - s <= POSE_MATCH_MARGIN };
    });
    const mean = rows.reduce((a, r) => a + r.score, 0) / rows.length;
    const drift = rows.filter((r) => r.own && (Math.abs(r.own.dx) > 2 || Math.abs(r.own.dy) > 2) && r.own.score - r.score > 0.03);
    const unmatched = rows.filter((r) => !r.matched);
    const pass = mean >= POSE_SHEET_MIN && !drift.length && !unmatched.length;
    ok &&= pass;
    report.sheets[name] = { pass, mean: +mean.toFixed(4), min: Math.min(...rows.map((r) => r.score)), offset: [best.dx, best.dy], expected: [ex, ey], drift: drift.map((r) => r.swf), unmatched: unmatched.map((r) => [r.swf, r.bestMatch]), frames: rows };
    console.log(`  ${pass ? 'ok ' : 'NO '} ${name}: mean ${mean.toFixed(3)} min ${Math.min(...rows.map((r) => r.score)).toFixed(3)} offset ${best.dx},${best.dy} (feet ${ex},${ey}) drift ${drift.length} unmatched ${unmatched.map((r) => `${r.swf}->${r.bestMatch}`).join(' ') || 0}`);
  }
  report.pass = ok;
  if (write) writeFileSync(join(HERE, 'score.json'), `${JSON.stringify(report, null, 1)}\n`);
  return report;
}
