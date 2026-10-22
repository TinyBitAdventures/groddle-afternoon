/**
 * Pixel helpers for tools/quoin-art (ImageMagick for codecs, typed arrays for
 * the maths). Images are { w, h, p } with p premultiplied RGBA floats 0..255.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function readImage(file) {
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', `${file}[0]`], { encoding: 'utf8' }).trim().split(' ').map(Number);
  const raw = execFileSync('magick', [`${file}[0]`, '-depth', '8', 'rgba:-'], { maxBuffer: w * h * 4 + 1024 });
  const p = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = raw[i * 4 + 3] / 255;
    p[i * 4] = raw[i * 4] * a;
    p[i * 4 + 1] = raw[i * 4 + 1] * a;
    p[i * 4 + 2] = raw[i * 4 + 2] * a;
    p[i * 4 + 3] = raw[i * 4 + 3];
  }
  return { w, h, p };
}

/** Straight-alpha 8-bit bytes of an image (for writing). */
export function toBytes(img) {
  const out = Buffer.alloc(img.w * img.h * 4);
  for (let i = 0; i < img.w * img.h; i++) {
    const a = img.p[i * 4 + 3];
    out[i * 4 + 3] = Math.round(a);
    if (a > 0) for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round(Math.min(255, (img.p[i * 4 + k] / a) * 255));
  }
  return out;
}

export function writeImage(img, file) {
  execFileSync('magick', ['-size', `${img.w}x${img.h}`, '-depth', '8', 'rgba:-', file], { input: toBytes(img) });
}

export function crop(img, x0, y0, w, h) {
  const p = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = y0 + y;
    if (sy < 0 || sy >= img.h) continue;
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      if (sx < 0 || sx >= img.w) continue;
      const s = (sy * img.w + sx) * 4, d = (y * w + x) * 4;
      for (let k = 0; k < 4; k++) p[d + k] = img.p[s + k];
    }
  }
  return { w, h, p };
}

/** Box-downscale by an integer factor (3x render -> 1x). */
export function downscale(img, f = 3) {
  const w = Math.floor(img.w / f), h = Math.floor(img.h / f), p = new Float32Array(w * h * 4), n = f * f;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = (y * w + x) * 4;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) {
      const s = ((y * f + j) * img.w + x * f + i) * 4;
      for (let k = 0; k < 4; k++) p[d + k] += img.p[s + k];
    }
    for (let k = 0; k < 4; k++) p[d + k] /= n;
  }
  return { w, h, p };
}

/**
 * Agreement of two same-size images, the tools/vector-sprites measure:
 * 1 - (alpha error / mass + colour error / (3 mass)) / 2. `rows` limits the
 * comparison to y in [y0, y1).
 */
export function score(a, b, { y0 = 0, y1 = a.h } = {}) {
  let ea = 0, ec = 0, m = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < a.w; x++) {
    const s = (y * a.w + x) * 4;
    const oa = a.p[s + 3], ba = b.p[s + 3];
    if (oa === 0 && ba === 0) continue;
    ea += Math.abs(oa - ba);
    ec += Math.abs(a.p[s] - b.p[s]) + Math.abs(a.p[s + 1] - b.p[s + 1]) + Math.abs(a.p[s + 2] - b.p[s + 2]);
    m += Math.max(oa, ba);
  }
  return m === 0 ? 1 : 1 - (ea / m + ec / (3 * m)) / 2;
}

/** Render an SVG string to an image at width x height with rsvg-convert (via temp files). */
export function renderSvg(svg, width, height) {
  const dir = mkdtempSync(join(tmpdir(), 'quoin-svg-'));
  try {
    const src = join(dir, 'in.svg');
    const out = join(dir, 'out.png');
    writeFileSync(src, svg);
    execFileSync('rsvg-convert', ['-w', String(width), '-h', String(height), '-f', 'png', '-o', out, src]);
    const png = readFileSync(out);
    const raw = execFileSync('magick', [out, '-depth', '8', 'rgba:-'], { maxBuffer: width * height * 4 + 1024 });
    const p = new Float32Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const a = raw[i * 4 + 3] / 255;
      for (let k = 0; k < 3; k++) p[i * 4 + k] = raw[i * 4 + k] * a;
      p[i * 4 + 3] = raw[i * 4 + 3];
    }
    return { w: width, h: height, p, png };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
