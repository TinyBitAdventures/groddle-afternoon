/**
 * LEVEL BUILDER art pack: the picture work art-intake.mjs does on art from an image model, on
 * plain RGBA buffers ({ w, h, px: Uint8Array of w*h*4, straight alpha }). Pure apart from
 * readImage and writePng, which touch the disk (and ImageMagick for files that are not PNG).
 *
 * - PNG in and out with node:zlib (8 and 16 bit, every colour type, not interlaced; anything else
 *   goes through `magick`);
 * - keying: the picture's own alpha when it has one, else a flat #FF00FF-ish background keyed
 *   out from the border inwards, with the key's colour unmixed from soft edges;
 * - the fake checkerboard some models paint when asked for transparency (refused);
 * - trim, Lanczos-3 resampling on premultiplied colour, the left-right seam of a strip (measured,
 *   and mended by crossfading the ends), a light pull toward the art bible's palette, a sharpness
 *   figure, and where a topper's walkable surface sits.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r3 = (n) => Math.round(n * 1000) / 1000;

export function blank(w, h) {
  return { w, h, px: new Uint8Array(w * h * 4) };
}

// —— PNG ——

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PURE: decode a PNG (not interlaced) into RGBA 8 bit; throws on anything it cannot read. */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let pos = 8;
  let ihdr = null;
  let plte = null;
  let trns = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], type: data[9], interlace: data[12] };
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (!ihdr) throw new Error('PNG without IHDR');
  const { w, h, depth, type, interlace } = ihdr;
  if (interlace) throw new Error('interlaced PNG');
  if (![1, 2, 4, 8, 16].includes(depth)) throw new Error(`PNG bit depth ${depth}`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`PNG colour type ${type}`);
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((w * channels * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  const rows = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y += 1) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error(`PNG filter ${f}`);
      out[i] = v & 0xff;
    }
    prev = out;
  }
  const img = blank(w, h);
  const px = img.px;
  const sample = (row, x, ch) => {
    // One channel value of pixel x, scaled to 0-255.
    if (depth === 8) return rows[row * stride + x * channels + ch];
    if (depth === 16) return rows[row * stride + (x * channels + ch) * 2];
    const bit = (x * channels + ch) * depth;
    const byte = rows[row * stride + (bit >> 3)];
    const v = (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      if (type === 3) {
        const idx = depth === 8 ? rows[y * stride + x] : sample(y, x, 0);
        px[o] = plte[idx * 3];
        px[o + 1] = plte[idx * 3 + 1];
        px[o + 2] = plte[idx * 3 + 2];
        px[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (type === 0 || type === 4) {
        const g = sample(y, x, 0);
        px[o] = g;
        px[o + 1] = g;
        px[o + 2] = g;
        px[o + 3] = type === 4 ? sample(y, x, 1) : 255;
      } else {
        px[o] = sample(y, x, 0);
        px[o + 1] = sample(y, x, 1);
        px[o + 2] = sample(y, x, 2);
        px[o + 3] = type === 6 ? sample(y, x, 3) : 255;
      }
    }
  }
  return img;
}

function chunk(type, data = Buffer.alloc(0)) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** PURE: an RGBA PNG, each row filtered the way that packs smallest (the usual sum-of-bytes guess). */
export function encodePng(img) {
  const { w, h, px } = img;
  const stride = w * 4;
  const out = Buffer.alloc((stride + 1) * h);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < h; y += 1) {
    const row = px.subarray(y * stride, (y + 1) * stride);
    const up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f += 1) {
      const c = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i += 1) {
        const a = i >= 4 ? row[i - 4] : 0;
        const b = up ? up[i] : 0;
        const cc = up && i >= 4 ? up[i - 4] : 0;
        let p;
        if (f === 0) p = 0;
        else if (f === 1) p = a;
        else if (f === 2) p = b;
        else if (f === 3) p = (a + b) >> 1;
        else {
          const q = a + b - cc;
          const pa = Math.abs(q - a);
          const pb = Math.abs(q - b);
          const pc = Math.abs(q - cc);
          p = pa <= pb && pa <= pc ? a : pb <= pc ? b : cc;
        }
        const v = (row[i] - p) & 0xff;
        c[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    out[y * (stride + 1)] = best;
    cand[best].copy(out, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(out, { level: 9 })), chunk('IEND')]);
}

/** A picture file as RGBA: PNG read here, anything else (WebP, JPEG) through ImageMagick 7. */
export function readImage(file) {
  const buf = readFileSync(file);
  if (buf.subarray(0, 8).equals(SIG)) {
    try {
      return decodePng(buf);
    } catch { /* interlaced or odd: let ImageMagick read it */ }
  }
  const png = execFileSync('magick', [`${file}[0]`, '-colorspace', 'sRGB', '-depth', '8', 'PNG32:-'], { maxBuffer: 1 << 30 });
  return decodePng(png);
}

export function writePng(file, img) {
  const buf = encodePng(img);
  writeFileSync(file, buf);
  return buf;
}

export const IMAGE_EXTS = Object.freeze(['.png', '.webp', '.jpg', '.jpeg']);
export const isImageFile = (f) => IMAGE_EXTS.includes(extname(f).toLowerCase());

// —— Colour helpers ——

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = ([r, g, b]) => `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** PURE: sRGB 0-255 to CIE Lab (D65). */
export function rgbToLab([r, g, b]) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (t * 24389) / 27 / 116 + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

export const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** PURE: HSL (h degrees, s and l 0-1) to sRGB 0-255. */
export function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// —— Keying ——

/** PURE: share of pixels that are not fully opaque, and of fully clear ones. */
export function alphaShare(img) {
  let soft = 0;
  let clear = 0;
  const n = img.w * img.h;
  for (let i = 3; i < img.px.length; i += 4) {
    if (img.px[i] < 250) soft += 1;
    if (img.px[i] === 0) clear += 1;
  }
  return { soft: soft / n, clear: clear / n };
}

/** The picture's border pixels (every pixel of the outer ring), as [r, g, b, a]. */
function borderPixels(img) {
  const out = [];
  const { w, h, px } = img;
  const at = (x, y) => {
    const o = (y * w + x) * 4;
    out.push([px[o], px[o + 1], px[o + 2], px[o + 3]]);
  };
  for (let x = 0; x < w; x += 1) {
    at(x, 0);
    if (h > 1) at(x, h - 1);
  }
  for (let y = 1; y < h - 1; y += 1) {
    at(0, y);
    if (w > 1) at(w - 1, y);
  }
  return out;
}

const isMagentaish = ([r, g, b]) => r > 150 && b > 150 && g < 120 && Math.abs(r - b) < 80;

/**
 * PURE: the key colour a model actually painted (models rarely give exact #FF00FF): the median
 * of the magenta-looking border pixels, or null when under 30% of the border looks magenta.
 */
export function estimateKey(img) {
  const border = borderPixels(img);
  const m = border.filter(isMagentaish);
  if (!border.length || m.length / border.length < 0.3) return null;
  const med = (i) => m.map((p) => p[i]).sort((a, b) => a - b)[m.length >> 1];
  return [med(0), med(1), med(2)];
}

/**
 * PURE: a painted checkerboard where a transparent background was asked for (two light greys in
 * alternating squares round the border). True means the picture has no usable background.
 */
export function looksLikeCheckerboard(img) {
  const border = borderPixels(img).filter((p) => p[3] > 250);
  if (border.length < 16) return false;
  const greyLight = border.filter(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) < 14 && r + g + b > 3 * 140);
  if (greyLight.length / border.length < 0.6) return false;
  const levels = greyLight.map(([r, g, b]) => Math.round((r + g + b) / 3)).sort((a, b) => a - b);
  const lo = levels[Math.floor(levels.length * 0.2)];
  const hi = levels[Math.floor(levels.length * 0.8)];
  return hi - lo >= 12;
}

/**
 * PURE: key a flat background out. The background is every pixel within `hi` of the key colour
 * that touches the border through other such pixels, plus any pixel within `lo * 0.6` anywhere
 * (holes the background shows through). Within it, pixels under `lo` go clear; the soft ones
 * between take the colour of the nearest solid pixel (spread outward from the art), and their
 * alpha is how far they sit from the key toward that colour, so a soft white edge over magenta
 * comes out white and half clear, not pink. Answers how many pixels it cleared and keyed.
 */
export function keyOut(img, key, { lo = 70, hi = 150 } = {}) {
  const { w, h, px } = img;
  const n = w * h;
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    dist[i] = Math.hypot(px[o] - key[0], px[o + 1] - key[1], px[o + 2] - key[2]);
  }
  const inBg = new Uint8Array(n);
  const stack = [];
  const seed = (i) => {
    if (!inBg[i] && dist[i] < hi) {
      inBg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x += 1) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  for (let i = 0; i < n; i += 1) if (dist[i] < lo * 0.6) seed(i);
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < n - w) seed(i + w);
  }
  // Soft edges and glows ramp from the key up to the art's own colour. Walk up each ramp (a pixel
  // next to the soft band, no nearer the key than its neighbour there, in nearly
  // the same direction from the key) so the colour a soft pixel is unmixed against is the solid
  // colour at the top of its ramp, not a half-blended one. Hard edges stop after a pixel or two.
  let front = [];
  for (let i = 0; i < n; i += 1) if (inBg[i] && dist[i] >= lo * 0.5) front.push(i);
  const along = (i, j) => {
    const a = i * 4;
    const b = j * 4;
    const u = [px[a] - key[0], px[a + 1] - key[1], px[a + 2] - key[2]];
    const v = [px[b] - key[0], px[b + 1] - key[1], px[b + 2] - key[2]];
    const nu = Math.hypot(...u);
    const nv = Math.hypot(...v);
    return nu > 0 && nv > 0 && (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv) > 0.97;
  };
  for (let pass = 0; pass < 160 && front.length; pass += 1) {
    const next = [];
    for (const j of front) {
      const x = j % w;
      const nb = [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j >= w ? j - w : -1, j < n - w ? j + w : -1];
      for (const i of nb) {
        if (i < 0 || inBg[i] || dist[i] < dist[j] - 0.25 || !along(i, j)) continue;
        inBg[i] = 2;
        next.push(i);
      }
    }
    front = next;
  }
  // The tops of the ramps (a walked pixel nothing within 3 px rises above by more than 1) are
  // the solid colour. (3 px, not the 4 neighbours: an 8-bit ramp has flat steps.)
  const tops = [];
  for (let i = 0; i < n; i += 1) {
    if (inBg[i] !== 2) continue;
    const x = i % w;
    const y = (i - x) / w;
    let top = true;
    for (let dy = -3; dy <= 3 && top; dy += 1) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -3; dx <= 3; dx += 1) {
        const xx = x + dx;
        if (xx >= 0 && xx < w && dist[yy * w + xx] > dist[i] + 1) {
          top = false;
          break;
        }
      }
    }
    if (top) tops.push(i);
  }
  for (const i of tops) inBg[i] = 0;
  // The nearest solid colour for every soft pixel: a breadth-first spread from the art outward.
  const src = new Int32Array(n).fill(-1);
  let queue = [];
  for (let i = 0; i < n; i += 1) if (!inBg[i]) { src[i] = i; queue.push(i); }
  while (queue.length) {
    const next = [];
    for (const i of queue) {
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1];
      for (const j of nb) {
        if (j < 0 || src[j] >= 0 || !inBg[j] || dist[j] < lo) continue;
        src[j] = src[i];
        next.push(j);
      }
    }
    queue = next;
  }
  let cleared = 0;
  let keyed = 0;
  for (let i = 0; i < n; i += 1) {
    if (!inBg[i]) continue;
    keyed += 1;
    const o = i * 4;
    if (dist[i] < lo || (src[i] < 0 && inBg[i] !== 2)) {
      px[o] = 0;
      px[o + 1] = 0;
      px[o + 2] = 0;
      px[o + 3] = 0;
      cleared += 1;
      continue;
    }
    const so = (src[i] < 0 ? i : src[i]) * 4;
    const c = [px[so] - key[0], px[so + 1] - key[1], px[so + 2] - key[2]];
    const ob = [px[o] - key[0], px[o + 1] - key[1], px[o + 2] - key[2]];
    const cc = c[0] * c[0] + c[1] * c[1] + c[2] * c[2];
    // Projection of the pixel onto the line from the key to the solid colour; the distance ramp
    // keeps pixels near the key from keeping much (a solid colour close to the key projects badly).
    let a = clamp(Math.min(cc > 0 ? (ob[0] * c[0] + ob[1] * c[1] + ob[2] * c[2]) / cc : 1, inBg[i] === 2 ? 1 : ((dist[i] - lo) / (hi - lo)) * 1.5), 0, 1);
    if (a > 0.97) a = 1; // texture just inside a hard edge: solid
    if (a < 0.02) {
      px[o] = 0;
      px[o + 1] = 0;
      px[o + 2] = 0;
      px[o + 3] = 0;
      cleared += 1;
      continue;
    }
    for (let q = 0; q < 3; q += 1) px[o + q] = clamp(Math.round((px[o + q] - (1 - a) * key[q]) / a), 0, 255);
    px[o + 3] = Math.round(a * px[o + 3]);
  }
  return { cleared, keyed };
}

/** PURE: colour under fully clear pixels set to 0 (what intake does too). */
export function clearHidden(img) {
  const { px } = img;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] === 0) { px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; }
  return img;
}

// —— Geometry ——

/** PURE: the box of pixels with alpha over `thr`: { x, y, w, h } or null when nothing shows. */
export function opaqueBox(img, thr = 8) {
  const { w, h, px } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (px[(y * w + x) * 4 + 3] > thr) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function crop(img, { x, y, w, h }) {
  const out = blank(w, h);
  for (let r = 0; r < h; r += 1) out.px.set(img.px.subarray(((y + r) * img.w + x) * 4, ((y + r) * img.w + x + w) * 4), r * w * 4);
  return out;
}

/** PURE: the picture on a larger clear canvas at (x, y). */
export function pad(img, w, h, x, y) {
  const out = blank(w, h);
  for (let r = 0; r < img.h; r += 1) {
    const ty = y + r;
    if (ty < 0 || ty >= h) continue;
    for (let c = 0; c < img.w; c += 1) {
      const tx = x + c;
      if (tx < 0 || tx >= w) continue;
      const s = (r * img.w + c) * 4;
      const d = (ty * w + tx) * 4;
      out.px[d] = img.px[s];
      out.px[d + 1] = img.px[s + 1];
      out.px[d + 2] = img.px[s + 2];
      out.px[d + 3] = img.px[s + 3];
    }
  }
  return out;
}

// —— Resampling (Lanczos 3, premultiplied) ——

function lanczos(x) {
  if (x === 0) return 1;
  if (x <= -3 || x >= 3) return 0;
  const p = Math.PI * x;
  return (3 * Math.sin(p) * Math.sin(p / 3)) / (p * p);
}

function weights(src, dst) {
  const scale = dst / src;
  const support = scale < 1 ? 3 / scale : 3;
  const out = [];
  for (let i = 0; i < dst; i += 1) {
    const centre = (i + 0.5) / scale - 0.5;
    const lo = Math.max(0, Math.floor(centre - support));
    const hi = Math.min(src - 1, Math.ceil(centre + support));
    const ws = [];
    let sum = 0;
    for (let j = lo; j <= hi; j += 1) {
      const wv = lanczos((j - centre) * (scale < 1 ? scale : 1));
      ws.push(wv);
      sum += wv;
    }
    out.push({ lo, ws: ws.map((v) => v / (sum || 1)) });
  }
  return out;
}

/** PURE: the picture resampled to w x h (Lanczos 3 on premultiplied colour, so clear edges stay clean). */
export function resize(img, w, h) {
  if (w === img.w && h === img.h) return { w, h, px: img.px.slice() };
  const src = new Float32Array(img.w * img.h * 4);
  for (let i = 0; i < img.w * img.h; i += 1) {
    const a = img.px[i * 4 + 3] / 255;
    src[i * 4] = img.px[i * 4] * a;
    src[i * 4 + 1] = img.px[i * 4 + 1] * a;
    src[i * 4 + 2] = img.px[i * 4 + 2] * a;
    src[i * 4 + 3] = img.px[i * 4 + 3];
  }
  const wx = weights(img.w, w);
  const mid = new Float32Array(w * img.h * 4);
  for (let y = 0; y < img.h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const { lo, ws } = wx[x];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < ws.length; k += 1) {
        const o = (y * img.w + lo + k) * 4;
        const wv = ws[k];
        r += src[o] * wv;
        g += src[o + 1] * wv;
        b += src[o + 2] * wv;
        a += src[o + 3] * wv;
      }
      const d = (y * w + x) * 4;
      mid[d] = r;
      mid[d + 1] = g;
      mid[d + 2] = b;
      mid[d + 3] = a;
    }
  }
  const wy = weights(img.h, h);
  const out = blank(w, h);
  for (let y = 0; y < h; y += 1) {
    const { lo, ws } = wy[y];
    for (let x = 0; x < w; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < ws.length; k += 1) {
        const o = ((lo + k) * w + x) * 4;
        const wv = ws[k];
        r += mid[o] * wv;
        g += mid[o + 1] * wv;
        b += mid[o + 2] * wv;
        a += mid[o + 3] * wv;
      }
      const d = (y * w + x) * 4;
      const A = clamp(a, 0, 255);
      out.px[d + 3] = Math.round(A);
      if (A > 0.5) {
        const k = 255 / A;
        out.px[d] = clamp(Math.round(r * k), 0, 255);
        out.px[d + 1] = clamp(Math.round(g * k), 0, 255);
        out.px[d + 2] = clamp(Math.round(b * k), 0, 255);
      }
    }
  }
  return out;
}

// —— Seams ——

const premul = (px, o) => {
  const a = px[o + 3] / 255;
  return [px[o] * a, px[o + 1] * a, px[o + 2] * a, px[o + 3]];
};

/**
 * PURE: how badly a strip's right edge meets its left edge when copies sit side by side: the mean
 * difference across the wrap (last column to first) over the mean difference between neighbouring
 * columns inside the picture. About 1 is seamless; over 2.5 shows a seam.
 */
export function seamScore(img) {
  const { w, h, px } = img;
  if (w < 4) return 0;
  const diff = (x0, x1) => {
    let t = 0;
    for (let y = 0; y < h; y += 1) {
      const a = premul(px, (y * w + x0) * 4);
      const b = premul(px, (y * w + x1) * 4);
      t += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]);
    }
    return t / h;
  };
  const wrap = diff(w - 1, 0);
  let inner = 0;
  let n = 0;
  const step = Math.max(1, Math.floor(w / 64));
  for (let x = 1; x < w - 2; x += step) {
    inner += diff(x, x + 1);
    n += 1;
  }
  inner /= n || 1;
  return r3(wrap / (inner + 1));
}

/**
 * PURE: a strip made seamless by crossfading its ends: the last `frac` of the width is faded
 * into the first, and the picture comes back that much narrower (the caller scales it back to
 * the target width). The new right edge was the old pixel beside the new left edge's source, so
 * the wrap is as smooth as any neighbouring pair of columns.
 */
export function fixSeam(img, frac = 0.08) {
  const { w, h, px } = img;
  const k = Math.max(2, Math.round(w * frac));
  const nw = w - k;
  const out = blank(nw, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < nw; x += 1) {
      const d = (y * nw + x) * 4;
      const s = (y * w + x) * 4;
      if (x >= k) {
        out.px.set(px.subarray(s, s + 4), d);
        continue;
      }
      const t = x / k; // 0 at the left edge (all the tail), 1 at k (all the head)
      const a = premul(px, s);
      const b = premul(px, (y * w + nw + x) * 4);
      const A = a[3] * t + b[3] * (1 - t);
      out.px[d + 3] = Math.round(A);
      if (A > 0.5) {
        for (let c = 0; c < 3; c += 1) out.px[d + c] = clamp(Math.round(((a[c] * t + b[c] * (1 - t)) * 255) / A), 0, 255);
      }
    }
  }
  return out;
}

// —— Palette ——

/**
 * PURE: every visible pixel pulled a little toward its nearest swatch: by `strength` when it is
 * that colour already, less the further it is, and not at all past `reach` (redmean RGB distance,
 * 0-765). A light touch: it ties stray hues to the bible without flattening the painting.
 */
export function snapToPalette(img, swatches, { strength = 0.15, reach = 120 } = {}) {
  if (!swatches.length || strength <= 0) return { moved: 0 };
  const sw = swatches.map((s) => (Array.isArray(s) ? s : hexToRgb(s)));
  const { px } = img;
  let moved = 0;
  const cache = new Map();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let hit = cache.get(key);
    if (hit === undefined) {
      let best = null;
      let bestD = Infinity;
      for (const s of sw) {
        const rm = (r + s[0]) / 2;
        const dr = r - s[0];
        const dg = g - s[1];
        const db = b - s[2];
        const d = Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      hit = bestD < reach ? [best, strength * (1 - bestD / reach)] : null;
      cache.set(key, hit);
    }
    if (!hit) continue;
    const [s, k] = hit;
    px[i] = Math.round(r + (s[0] - r) * k);
    px[i + 1] = Math.round(g + (s[1] - g) * k);
    px[i + 2] = Math.round(b + (s[2] - b) * k);
    moved += 1;
  }
  return { moved };
}

// —— Measures ——

/** PURE: mean absolute Laplacian of lightness over solid pixels (higher is crisper), 0-255 scale. */
export function sharpness(img) {
  const { w, h, px } = img;
  const lum = (x, y) => {
    const o = (y * w + x) * 4;
    return 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
  };
  let t = 0;
  let n = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 250000)));
  for (let y = 1; y < h - 1; y += step) {
    for (let x = 1; x < w - 1; x += step) {
      if (px[(y * w + x) * 4 + 3] < 250 || px[(y * w + x - 1) * 4 + 3] < 250 || px[(y * w + x + 1) * 4 + 3] < 250 || px[((y - 1) * w + x) * 4 + 3] < 250 || px[((y + 1) * w + x) * 4 + 3] < 250) continue;
      t += Math.abs(4 * lum(x, y) - lum(x - 1, y) - lum(x + 1, y) - lum(x, y - 1) - lum(x, y + 1));
      n += 1;
    }
  }
  return n ? r3(t / n) : 0;
}

/** PURE: the first row from the top with alpha over `thr` in column x, or null. */
export function topAt(img, x, thr = 128) {
  const cx = clamp(Math.round(x), 0, img.w - 1);
  for (let y = 0; y < img.h; y += 1) if (img.px[(y * img.w + cx) * 4 + 3] > thr) return y;
  return null;
}

/** PURE: a topper's walkable surface: the median first solid row over the middle 60% of its width. */
export function surfaceRow(img) {
  const rows = [];
  for (let x = Math.floor(img.w * 0.2); x < img.w * 0.8; x += 2) {
    const y = topAt(img, x, 200);
    if (y !== null) rows.push(y);
  }
  rows.sort((a, b) => a - b);
  return rows.length ? rows[rows.length >> 1] : null;
}

/** PURE: empty rows under the art (a bottom-anchored piece should have none). */
export function bottomGap(img) {
  const box = opaqueBox(img);
  return box ? img.h - (box.y + box.h) : img.h;
}
