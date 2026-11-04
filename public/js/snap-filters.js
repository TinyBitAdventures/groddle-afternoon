/**
 * Snap photo filters (the Snapshottery filter packs): rules only, no DOM.
 *
 * Source (CC0):
 *  - glitch-GameServerJS main.js 6871-6893: Camera Mode's answer lists the
 *    filters each owned pack gives (FILTER_PACKS below, the source's tsids,
 *    the B&W filter's "bw_fitler" typo kept).
 *  - glitch-client com/tinyspeck/engine/view/ui/glitchr/filters/: one class
 *    per filter (<Name>Filter.as): a list of Flash filters applied in order
 *    (ColorMatrixFilter, an inner GlowFilter, Pixel Bender ShaderFilters) and
 *    optional overlays (FilterOverlay, GlitchrFilterUtils.drawOverlaysToBitmapData).
 *  - The shaders are glitch-client assets/*.pbj, read from their bytecode:
 *    ChannelColorizer, noise, historic (FadeToHistory), Curves, Dither
 *    (OrderDither), ColorSeparator, outline. Each helper below says what it
 *    computes.
 *  - GlitchrFiltersView.as bakeFiltersAndOverlaysToSnapshot / getOutputBitmapData:
 *    the filtered picture is drawn over the original at the slider's alpha
 *    (FilterThumbnailView.as: the slider starts at the filter's defaultAlpha),
 *    then the overlays, alpha-multiplied unless lockAlpha.
 *
 * Pictures are ImageData-shaped ({ width, height, data: Uint8ClampedArray RGBA }),
 * so this runs in the browser and in node. Work happens in 0..1 floats; each
 * component's result is clamped, as each Flash filter wrote 8-bit pixels.
 */

/** main.js 6872-6893: what each filter pack card gives, in order. */
export const FILTER_PACKS = Object.freeze({
  snapshottery_basic_filter_pack: Object.freeze([
    { tsid: 'boost_filter', label: 'Boost' },
    { tsid: 'bw_fitler', label: 'B&W' },
    { tsid: 'historic_filter', label: 'Historic' },
    { tsid: 'memphis_filter', label: 'Chilliwack' },
  ]),
  snapshottery_filter_pack_1: Object.freeze([
    { tsid: 'piggy_filter', label: 'Piggy' },
    { tsid: 'beryl_filter', label: 'Beryl' },
    { tsid: 'fire_fly_filter', label: 'Fire Fly' },
  ]),
  snapshottery_filter_pack_2: Object.freeze([
    { tsid: 'holga_filter', label: 'Holga' },
    { tsid: 'vintage_filter', label: 'Vintage' },
    { tsid: 'ancient_filter', label: 'Ancient' },
  ]),
  snapshottery_filter_pack_3: Object.freeze([
    { tsid: 'dither_filter', label: 'Dither' },
    { tsid: 'shift_filter', label: 'Shift' },
    { tsid: 'outline_filter', label: 'Outline' },
  ]),
});

/** VintageFilter.as addBorder: the border's caption (class glitchr_filters_sepia; its colour is not in the client source). The client printed GLITCH; the remake keeps the trademark out of player pictures. */
export const VINTAGE_TEXT = Object.freeze({
  text: '52                     GRODDLE SNP 6005                          53',
  width: 300,
  height: 250,
  scaleX: 0.9,
  scaleY: 0.8,
  color: '#c8a064',
});

const NOISE = (alpha) => ({ type: 'noise', alpha, srcSize: [900, 600] });
const GLOW = (color, alpha, blurX, blurY, strength) => ({ type: 'glow', color, alpha, blurX, blurY, strength });
const MATRIX = (gain, offset) => ({
  type: 'matrix',
  m: [gain, 0, 0, 0, offset, 0, gain, 0, 0, offset, 0, 0, gain, 0, offset, 0, 0, 0, 1, 0],
});
const BW_COLORIZER = { type: 'colorize', r: [128, 128, 128, 0], g: [128, 128, 128, 0], b: [255, 255, 255, 0], normalization: 0.5 };

const def = (tsid, label, defaultAlpha, components, overlays = []) => Object.freeze({ tsid, label, defaultAlpha, components: Object.freeze(components), overlays: Object.freeze(overlays) });

/** One row per filter class, components in the .as file's push order. */
export const FILTERS = Object.freeze({
  // BoostFilter.as: inner glow, then high contrast.
  boost_filter: def('boost_filter', 'Boost', 0.8, [GLOW(0x000000, 0.8, 128, 128, 1), MATRIX(1.5, -36)]),
  // BlackWhiteFilter.as (default alpha 1): colorizer, vignette, noise.
  bw_fitler: def('bw_fitler', 'B&W', 1, [BW_COLORIZER, GLOW(0, 0.8, 180, 180, 1.5), NOISE(0.07)]),
  // HistoricFilter.as: glow, noise, sepia.
  historic_filter: def('historic_filter', 'Historic', 0.8, [GLOW(0, 0.7, 180, 180, 1.5), NOISE(0.07), { type: 'sepia', crossfade: 2 }]),
  // MemphisFilter.as: vignette, curves, a wash.
  memphis_filter: def('memphis_filter', 'Chilliwack', 0.8, [
    GLOW(0, 0.5, 64, 64, 1),
    { type: 'curves', saturation: 1, redLow: [54, 13], redHigh: [200, 255], greenLow: [46, 0], greenHigh: [220, 255], blueLow: [0, 59], blueHigh: [255, 255] },
  ], [{ type: 'wash', cx: 6, cy: 6, r: 3 }]),
  // PiggyFilter.as / BerylFilter.as / FireFlyFilter.as: colorizer, noise, vignette.
  piggy_filter: def('piggy_filter', 'Piggy', 0.8, [{ type: 'colorize', r: [214, 45, 45, 0], g: [55, 219, 20, 0], b: [45, 20, 214, 0] }, NOISE(0.07), GLOW(0, 0.7, 180, 180, 1.5)]),
  beryl_filter: def('beryl_filter', 'Beryl', 0.8, [{ type: 'colorize', r: [230, 40, 30, 0], g: [0, 230, 35, 0], b: [0, 35, 230, 0] }, NOISE(0.07), GLOW(0, 0.7, 180, 180, 1.5)]),
  fire_fly_filter: def('fire_fly_filter', 'Fire Fly', 0.8, [{ type: 'colorize', r: [220, 80, 0, 0], g: [60, 220, 0, 0], b: [60, 0, 220, 0] }, NOISE(0.07), GLOW(0, 0.7, 180, 180, 1.5)]),
  // HolgaFilter.as: contrast, heavy vignette, noise.
  holga_filter: def('holga_filter', 'Holga', 0.8, [MATRIX(1.5, -40), GLOW(0, 1, 245, 245, 1.5), NOISE(0.07)]),
  // VintageFilter.as: glow, noise, sepia; a wash and the black border with its caption.
  vintage_filter: def('vintage_filter', 'Vintage', 0.8, [GLOW(0, 0.7, 180, 180, 1.5), NOISE(0.07), { type: 'sepia', crossfade: 2 }], [
    { type: 'wash', cx: 2, cy: 6, r: 2.5 },
    { type: 'vintageBorder', lockAlpha: true },
  ]),
  // AncientFilter.as (default alpha 1): grey curves, noise, white glow; a wash and a ragged white edge.
  ancient_filter: def('ancient_filter', 'Ancient', 1, [
    { type: 'curves', saturation: 0, redLow: [0, 23], redHigh: [207, 255], greenLow: [0, 0], greenHigh: [222, 255], blueLow: [41, 0], blueHigh: [255, 255] },
    NOISE(0.1),
    GLOW(0xffffff, 0.6, 128, 128, 1),
  ], [
    { type: 'wash', cx: 2, cy: 6, r: 3 },
    { type: 'decayBorder', lockAlpha: true },
  ]),
  // DitherFilter.as: black and white, then ordered dither.
  dither_filter: def('dither_filter', 'Dither', 0.8, [BW_COLORIZER, { type: 'dither' }]),
  // ShiftFilter.as: contrast, red/green shift, noise, glow (its streaks overlay is commented out in the source).
  shift_filter: def('shift_filter', 'Shift', 0.8, [MATRIX(1.5, -40), { type: 'separate', or: [-5, 10], og: [3, -4], oa: [-1.2, 1.0] }, NOISE(0.07), GLOW(0, 0.7, 180, 180, 1.5)]),
  // OutlineFilter.as.
  outline_filter: def('outline_filter', 'Outline', 0.8, [{ type: 'outline', difference: [1, 0] }]),
});

/** The filters the player's cards give, in pack order (main.js 6871-6893). */
export function filtersFor(upgrades = []) {
  const owned = new Set(Array.isArray(upgrades) ? upgrades : []);
  const out = [];
  for (const [card, list] of Object.entries(FILTER_PACKS)) {
    if (!owned.has(card)) continue;
    for (const f of list) out.push({ tsid: f.tsid, label: f.label, defaultAlpha: FILTERS[f.tsid].defaultAlpha });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Buffers                                                              */
/* ------------------------------------------------------------------ */

export function toFloat(img) {
  const src = img.data;
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 1) out[i] = src[i] / 255;
  return out;
}

export function toImage(buf, width, height) {
  const data = new Uint8ClampedArray(buf.length);
  for (let i = 0; i < buf.length; i += 1) data[i] = Math.round(buf[i] * 255);
  return { width, height, data };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function clampAll(buf) {
  for (let i = 0; i < buf.length; i += 1) buf[i] = clamp01(buf[i]);
  return buf;
}

const rgbOf = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/* ------------------------------------------------------------------ */
/* Components                                                           */
/* ------------------------------------------------------------------ */

/** flash.filters.ColorMatrixFilter: 4x5, offsets in 0..255. */
export function colorMatrix(buf, w, h, { m }) {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2], a = buf[i + 3];
    for (let c = 0; c < 4; c += 1) {
      const k = c * 5;
      out[i + c] = m[k] * r + m[k + 1] * g + m[k + 2] * b + m[k + 3] * a + m[k + 4] / 255;
    }
  }
  return clampAll(out);
}

/** Three passes of a box blur of length L over a padded line, zero outside. */
function boxBlurLine(line, L, passes = 3) {
  const n = line.length;
  const lo = -Math.floor((L - 1) / 2);
  const hi = lo + L - 1;
  let cur = line;
  const pre = new Float64Array(n + 1);
  for (let p = 0; p < passes; p += 1) {
    pre[0] = 0;
    for (let i = 0; i < n; i += 1) pre[i + 1] = pre[i] + cur[i];
    const next = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const a = Math.max(0, i + lo);
      const b = Math.min(n - 1, i + hi);
      next[i] = b >= a ? (pre[b + 1] - pre[a]) / L : 0;
    }
    cur = next;
  }
  return cur;
}

const blurLen = (v) => Math.max(1, Math.round(Number(v) || 1));
const padFor = (L) => Math.ceil(1.5 * L) + 2;

/** The blurred 1D profile of a solid run of n (zero outside). */
function profile(n, L) {
  const pad = padFor(L);
  const line = new Float32Array(n + pad * 2);
  for (let i = 0; i < n; i += 1) line[pad + i] = 1;
  return boxBlurLine(line, L).slice(pad, pad + n);
}

/** The alpha mask blurred (full separable pass, for a picture that is not opaque). */
function blurredMask(buf, w, h, Lx, Ly) {
  const px = padFor(Lx);
  const py = padFor(Ly);
  const W = w + px * 2;
  const H = h + py * 2;
  const grid = new Float32Array(W * H);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) grid[(y + py) * W + x + px] = buf[(y * w + x) * 4 + 3];
  for (let y = 0; y < H; y += 1) grid.set(boxBlurLine(grid.subarray(y * W, y * W + W), Lx), y * W);
  const col = new Float32Array(H);
  for (let x = 0; x < W; x += 1) {
    for (let y = 0; y < H; y += 1) col[y] = grid[y * W + x];
    const b = boxBlurLine(col, Ly);
    for (let y = 0; y < H; y += 1) grid[y * W + x] = b[y];
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) out[y * w + x] = grid[(y + py) * W + x + px];
  return out;
}

/**
 * flash.filters.GlowFilter(color, alpha, blurX, blurY, strength, HIGH, inner = true):
 * the edge of the picture's alpha, blurred (three box passes), glows inward.
 */
export function innerGlow(buf, w, h, { color = 0, alpha = 1, blurX = 6, blurY = 6, strength = 2 }) {
  const Lx = blurLen(blurX);
  const Ly = blurLen(blurY);
  let opaque = true;
  for (let i = 3; i < buf.length; i += 4) if (buf[i] < 1) { opaque = false; break; }
  let mask = null;
  let px = null;
  let py = null;
  if (opaque) {
    px = profile(w, Lx);
    py = profile(h, Ly);
  } else {
    mask = blurredMask(buf, w, h, Lx, Ly);
  }
  const [cr, cg, cb] = rgbOf(color);
  const out = new Float32Array(buf);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const blurred = opaque ? px[x] * py[y] : mask[y * w + x];
      const g = clamp01((1 - blurred) * strength) * alpha;
      if (g <= 0) continue;
      const i = (y * w + x) * 4;
      out[i] = buf[i] * (1 - g) + cr * g;
      out[i + 1] = buf[i + 1] * (1 - g) + cg * g;
      out[i + 2] = buf[i + 2] * (1 - g) + cb * g;
    }
  }
  return clampAll(out);
}

/**
 * ChannelColorizer.pbj: each input channel adds its own colour (r, g, b, a
 * int4 params, 0..255) and the sum is divided by 255, or by a normalised
 * divisor when normalization (or normalizationAlpha) is set.
 */
export function colorize(buf, w, h, { r = [255, 0, 0, 0], g = [0, 255, 0, 0], b = [0, 0, 255, 0], a = [0, 0, 0, 255], normalization = 0, normalizationAlpha = 0 }) {
  const d = [255, 255, 255, 255];
  if (normalization !== 0 || normalizationAlpha !== 0) {
    const s = [0, 1, 2, 3].map((k) => r[k] + g[k] + b[k] + a[k]);
    const m = Math.max(s[0], s[1], s[2]);
    const v = 255 + (m - 255) * normalization;
    d[0] = v;
    d[1] = v;
    d[2] = v;
    if (normalizationAlpha !== 0) d[3] = 255 + (s[3] - 255) * normalizationAlpha;
  }
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i += 4) {
    const R = buf[i], G = buf[i + 1], B = buf[i + 2], A = buf[i + 3];
    for (let k = 0; k < 4; k += 1) out[i + k] = (r[k] * R + g[k] * G + b[k] * B + a[k] * A) / d[k];
  }
  return clampAll(out);
}

/**
 * noise.pbj ("Simple additive noise"): each pixel adds alpha times another
 * pixel, picked by a fixed trigonometric scramble of its position around
 * center (default 128,128) over srcSize; a fully transparent pixel adds nothing.
 */
export function noise(buf, w, h, { alpha = 0.2, srcSize = [900, 600], center = [128, 128] }) {
  const [W, H] = srcSize;
  const [cx, cy] = center;
  const out = new Float32Array(buf);
  const wrap = (v) => {
    if (1 < v) v -= Math.floor(v);
    if (v < -1) v += Math.ceil(-v);
    return v;
  };
  for (let j = 0; j < h; j += 1) {
    const y = j + 0.5;
    for (let i = 0; i < w; i += 1) {
      const o = (j * w + i) * 4;
      if (buf[o] === 0 && buf[o + 1] === 0 && buf[o + 2] === 0 && buf[o + 3] === 0) continue;
      const x = i + 0.5;
      const k = (x - cx) * H + (y - cy);
      const r = Math.sqrt((x / W) ** 2 + (y / H) ** 2);
      if (k === 0 || r === 0) continue;
      const ang = (k / 180) * Math.PI;
      const fx = wrap(Math.cos(ang) / k);
      const fy = wrap((Math.sin(ang) * k) / r);
      const sx = Math.floor(cx + fx * W);
      const sy = Math.floor(cy + fy * H);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const s = (sy * w + sx) * 4;
      for (let c = 0; c < 4; c += 1) out[o + c] = buf[o + c] + buf[s + c] * alpha;
    }
  }
  return clampAll(out);
}

/** historic.pbj (FadeToHistory): 0..1 fades colour to grey, 1..2 grey to sepia. */
export function sepia(buf, w, h, { crossfade = 2 } = {}) {
  const out = new Float32Array(buf);
  const toSepia = 1 < crossfade;
  const t = toSepia ? crossfade - 1 : crossfade;
  const k = 1 - t;
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    const L = r * 0.3 + g * 0.59 + b * 0.11;
    if (toSepia) {
      out[i] = L * k + (0.4 * r + 0.769 * g + 0.189 * b) * t;
      out[i + 1] = L * k + (0.349 * r + 0.686 * g + 0.168 * b) * t;
      out[i + 2] = L * k + (0.272 * r + 0.534 * g + 0.131 * b) * t;
    } else {
      out[i] = r * k + L * t;
      out[i + 1] = g * k + L * t;
      out[i + 2] = b * k + L * t;
    }
  }
  return clampAll(out);
}

/** Curves.pbj: saturation toward grey, then a straight line per channel through (inLo,outLo)-(inHi,outHi), held to [outLo, outHi]. */
export function curves(buf, w, h, p) {
  const sat = p.saturation ?? 1;
  const lines = [[p.redLow, p.redHigh], [p.greenLow, p.greenHigh], [p.blueLow, p.blueHigh]].map(([lo = [0, 0], hi = [255, 255]]) => {
    const inLo = lo[0] / 255, outLo = lo[1] / 255, inHi = hi[0] / 255, outHi = hi[1] / 255;
    const slope = inHi === inLo ? 0 : (outHi - outLo) / (inHi - inLo);
    return { slope, icpt: outLo - slope * inLo, outLo, outHi };
  });
  const out = new Float32Array(buf);
  for (let i = 0; i < buf.length; i += 4) {
    const L = 0.3 * buf[i] + 0.59 * buf[i + 1] + 0.11 * buf[i + 2];
    for (let c = 0; c < 3; c += 1) {
      const { slope, icpt, outLo, outHi } = lines[c];
      let v = slope * (L + (buf[i + c] - L) * sat) + icpt;
      if (outHi < v) v = outHi;
      if (v < outLo) v = outLo;
      out[i + c] = v;
    }
  }
  return clampAll(out);
}

/** Dither.pbj (OrderDither, version 2): a 4x4 Bayer threshold per channel. */
export const BAYER = Object.freeze([[1, 9, 3, 11], [13, 5, 15, 7], [4, 12, 2, 10], [16, 8, 14, 6]].map((row) => Object.freeze(row.map((v) => v / 17))));

export function dither(buf, w, h) {
  const out = new Float32Array(buf);
  for (let y = 0; y < h; y += 1) {
    const row = BAYER[y % 4];
    for (let x = 0; x < w; x += 1) {
      const t = row[x % 4];
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c += 1) out[i + c] = t < buf[i + c] ? 1 : 0;
    }
  }
  return out;
}

/**
 * ColorSeparator.pbj: each channel read from its own offset (sampleLinear,
 * bilinear on pixel centres, transparent outside), then kept at its fade
 * percentage. The offsets are fixed, so each channel's four weights are too.
 */
export function colorSeparate(buf, w, h, { or = [0, 0], og = [0, 0], ob = [0, 0], oa = [0, 0], rfade = 100, gfade = 100, bfade = 100, afade = 100 }) {
  const out = new Float32Array(buf.length);
  const chans = [or, og, ob, oa].map(([dx, dy], c) => {
    // Pixel (i, j) reads at (i + 0.5 - dx, j + 0.5 - dy): index space u = i - dx.
    const fx = Math.floor(-dx);
    const fy = Math.floor(-dy);
    const tu = -dx - fx;
    const tv = -dy - fy;
    const fade = [rfade, gfade, bfade, afade][c] / 100;
    return { c, fx, fy, w00: (1 - tu) * (1 - tv) * fade, w10: tu * (1 - tv) * fade, w01: (1 - tu) * tv * fade, w11: tu * tv * fade };
  });
  for (const { c, fx, fy, w00, w10, w01, w11 } of chans) {
    for (let j = 0; j < h; j += 1) {
      const j0 = j + fy;
      const j1 = j0 + 1;
      const r0 = j0 >= 0 && j0 < h;
      const r1 = j1 >= 0 && j1 < h;
      for (let i = 0; i < w; i += 1) {
        const i0 = i + fx;
        const i1 = i0 + 1;
        const c0 = i0 >= 0 && i0 < w;
        const c1 = i1 >= 0 && i1 < w;
        let v = 0;
        if (r0 && c0) v += buf[(j0 * w + i0) * 4 + c] * w00;
        if (r0 && c1) v += buf[(j0 * w + i1) * 4 + c] * w10;
        if (r1 && c0) v += buf[(j1 * w + i0) * 4 + c] * w01;
        if (r1 && c1) v += buf[(j1 * w + i1) * 4 + c] * w11;
        out[(j * w + i) * 4 + c] = v;
      }
    }
  }
  return clampAll(out);
}

/**
 * outline.pbj: the largest rgba distance to the neighbours right, below,
 * below right and below left (those not transparent) picks foreground,
 * background, or a blend between them (difference = [max, min]).
 */
export function outline(buf, w, h, { difference = [0.1, 0.01], color = [0, 0, 0, 1], bgcolor = [1, 1, 1, 1] }) {
  const [max, min] = difference;
  const out = new Float32Array(buf.length);
  const near = [1, 0, 0, 1, 1, 1, -1, 1];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      let d = 0;
      for (let k = 0; k < 8; k += 2) {
        const nx = x + near[k];
        const ny = y + near[k + 1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = (ny * w + nx) * 4;
        if (buf[n + 3] === 0) continue;
        const d0 = buf[o] - buf[n], d1 = buf[o + 1] - buf[n + 1], d2 = buf[o + 2] - buf[n + 2], d3 = buf[o + 3] - buf[n + 3];
        const s2 = d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3;
        if (s2 > d) d = s2;
      }
      d = Math.sqrt(d);
      for (let c = 0; c < 4; c += 1) {
        if (max < d) out[o + c] = color[c];
        else if (min < d) out[o + c] = bgcolor[c] + (color[c] - bgcolor[c]) * ((d - min) / (max - min));
        else out[o + c] = bgcolor[c];
      }
    }
  }
  return clampAll(out);
}

const COMPONENTS = { matrix: colorMatrix, glow: innerGlow, colorize, noise, sepia, curves, dither, separate: colorSeparate, outline };

/* ------------------------------------------------------------------ */
/* Overlays                                                             */
/* ------------------------------------------------------------------ */

/** A small bitmap, premultiplied rgba floats. */
function bitmap(w, h) {
  return { w, h, data: new Float32Array(w * h * 4) };
}

/** graphics.drawCircle filled (coverage at each pixel centre, a 1 px soft edge), source-over. */
function fillCircle(bm, cx, cy, r, rgb, a) {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(bm.w - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(bm.h - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const sa = clamp01(r - d + 0.5) * a;
      if (sa <= 0) continue;
      const i = (y * bm.w + x) * 4;
      const k = 1 - sa;
      bm.data[i] = rgb[0] * sa + bm.data[i] * k;
      bm.data[i + 1] = rgb[1] * sa + bm.data[i + 1] * k;
      bm.data[i + 2] = rgb[2] * sa + bm.data[i + 2] * k;
      bm.data[i + 3] = sa + bm.data[i + 3] * k;
    }
  }
}

/** The 8x8 wash (MemphisFilter / VintageFilter / AncientFilter addWash): white at 0.25. */
function washBitmap(cx, cy, r) {
  const bm = bitmap(8, 8);
  fillCircle(bm, cx, cy, r, [1, 1, 1], 0.25);
  return bm;
}

/** VintageFilter.as addBorder: drawRect(0,0,300,250) with drawRect(15,15,280,230) cut out, black, plus its caption. */
function vintageBorderBitmap(opts) {
  const { width: W, height: H } = VINTAGE_TEXT;
  const bm = bitmap(W, H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const inner = x >= 15 && x < 295 && y >= 15 && y < 245;
      if (!inner) bm.data[(y * W + x) * 4 + 3] = 1;
    }
  }
  const t = typeof opts?.drawText === 'function' ? opts.drawText({ ...VINTAGE_TEXT }) : null;
  if (t?.data && t.width === W && t.height === H) {
    for (let i = 0; i < W * H * 4; i += 4) {
      const sa = t.data[i + 3] / 255;
      if (sa <= 0) continue;
      const k = 1 - sa;
      for (let c = 0; c < 3; c += 1) bm.data[i + c] = (t.data[i + c] / 255) * sa + bm.data[i + c] * k;
      bm.data[i + 3] = sa + bm.data[i + 3] * k;
    }
  }
  return bm;
}

/** AncientFilter.as createBorderOverlay / drawBorder: white circles of radius 2..8 along all four edges of 800x550. */
function decayBorderBitmap(rng = Math.random) {
  const W = 800;
  const H = 550;
  const bm = bitmap(W, H);
  const draw = (x, y, incX, incY) => {
    while (x <= W && y <= H) {
      const radius = 8 - rng() * 6;
      fillCircle(bm, x, y, radius, [1, 1, 1], 1);
      if (incX) x += radius / 2;
      if (incY) y += radius / 2;
    }
  };
  draw(0, 0, true, false);
  draw(0, H, true, false);
  draw(0, 0, false, true);
  draw(W, 0, false, true);
  return bm;
}

let decayCache = null;

function overlayBitmap(o, opts) {
  if (o.type === 'wash') return washBitmap(o.cx, o.cy, o.r);
  if (o.type === 'vintageBorder') return vintageBorderBitmap(opts);
  if (o.type === 'decayBorder') {
    // The filter is made once per client session (GlitchrFilterMap is a singleton), so one border is kept.
    if (opts?.rng) return decayBorderBitmap(opts.rng);
    decayCache ||= decayBorderBitmap();
    return decayCache;
  }
  return null;
}

/** GlitchrFilterUtils.drawOverlaysToBitmapData: the overlay scaled to the picture (smoothed), drawn over it. */
function drawOverlay(buf, w, h, bm, alphaMul) {
  const sx = bm.w / w;
  const sy = bm.h / h;
  const d = bm.data;
  for (let y = 0; y < h; y += 1) {
    const v = Math.min(bm.h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const j0 = Math.floor(v);
    const j1 = Math.min(bm.h - 1, j0 + 1);
    const tv = v - j0;
    for (let x = 0; x < w; x += 1) {
      const u = Math.min(bm.w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const i0 = Math.floor(u);
      const i1 = Math.min(bm.w - 1, i0 + 1);
      const tu = u - i0;
      const a00 = (j0 * bm.w + i0) * 4, a10 = (j0 * bm.w + i1) * 4, a01 = (j1 * bm.w + i0) * 4, a11 = (j1 * bm.w + i1) * 4;
      const sA = ((d[a00 + 3] * (1 - tu) + d[a10 + 3] * tu) * (1 - tv) + (d[a01 + 3] * (1 - tu) + d[a11 + 3] * tu) * tv) * alphaMul;
      if (sA <= 0) continue;
      const o = (y * w + x) * 4;
      const dA = buf[o + 3];
      const outA = sA + dA * (1 - sA);
      for (let c = 0; c < 3; c += 1) {
        const s = ((d[a00 + c] * (1 - tu) + d[a10 + c] * tu) * (1 - tv) + (d[a01 + c] * (1 - tu) + d[a11 + c] * tu) * tv) * alphaMul;
        buf[o + c] = outA > 0 ? clamp01((s + buf[o + c] * dA * (1 - sA)) / outA) : 0;
      }
      buf[o + 3] = clamp01(outA);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Applying a filter                                                    */
/* ------------------------------------------------------------------ */

/** A picture through a filter's components alone (0..1 floats), to pass back to applyFilter as opts.filtered. */
export function filterComponents(img, tsid) {
  const filter = FILTERS[tsid];
  return filter ? runComponents(toFloat(img), img.width, img.height, filter) : null;
}

/** The filter's components alone, in order (a thumbnail or a test). */
export function runComponents(buf, w, h, filter) {
  let cur = buf;
  for (const comp of filter.components) cur = COMPONENTS[comp.type](cur, w, h, comp);
  return cur;
}

/**
 * A filtered copy of a picture: the filtered picture drawn over the original
 * at alpha (default the filter's), then its overlays (GlitchrFiltersView.as
 * getOutputBitmapData). 'normal' or '' gives a plain copy.
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} img
 * @param {string} tsid
 * @param {number} [alpha]
 * @param {{ rng?: () => number, filtered?: Float32Array, drawText?: (spec: object) => ({ width: number, height: number, data: Uint8ClampedArray } | null) }} [opts]
 */
export function applyFilter(img, tsid, alpha, opts = {}) {
  const { width: w, height: h } = img;
  const filter = FILTERS[tsid];
  if (!filter) return { width: w, height: h, data: new Uint8ClampedArray(img.data) };
  const a = clamp01(Number.isFinite(Number(alpha)) && alpha !== null && alpha !== undefined ? Number(alpha) : filter.defaultAlpha);
  const orig = toFloat(img);
  const out = new Float32Array(orig);
  if (a > 0) {
    // opts.filtered: this picture's filterComponents, kept while the slider moves (only the blend changes).
    const f = opts.filtered?.length === orig.length ? opts.filtered : runComponents(orig, w, h, filter);
    // Source-over of the filtered picture at alpha.
    for (let i = 0; i < out.length; i += 4) {
      const sA = f[i + 3] * a;
      const dA = orig[i + 3];
      const oA = sA + dA * (1 - sA);
      for (let c = 0; c < 3; c += 1) out[i + c] = oA > 0 ? (f[i + c] * sA + orig[i + c] * dA * (1 - sA)) / oA : 0;
      out[i + 3] = oA;
    }
  }
  for (const o of filter.overlays) {
    const mul = o.lockAlpha ? 1 : a;
    if (mul <= 0) continue;
    const bm = overlayBitmap(o, opts);
    if (bm) drawOverlay(out, w, h, bm, mul);
  }
  return toImage(out, w, h);
}
