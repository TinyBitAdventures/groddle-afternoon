/**
 * LEVEL BUILDER (spec 9.1, 9.2; phase P5): one picture's colour, measured the same way for Tiny
 * Speck's library (tools/builder/deco-palette.mjs, in Chrome) and for new art at intake (the
 * site's src/BuilderIntake.php colourStats, a port held to this by tests/builder-style.test.js).
 *
 * Every pixel counts by its opacity (alpha 0 to 1), so a soft edge counts a little and the
 * transparent margin not at all:
 *
 * - l: mean HSL lightness (0 to 1);
 * - s: mean HSL saturation (0 to 1);
 * - hue: 12 bins of 30° (red first), each pixel weighted by opacity times saturation (a grey has no
 *   hue to speak of), summing to 1 (all zeros for a grey picture);
 * - cover: mean opacity over the whole file (how much of the rectangle is art).
 *
 * Rounded to 3 decimals, so a rebuild writes the same bytes.
 */

export const HUE_BINS = 12;

/** PURE: HSL of 0-255 RGB, as [h degrees 0-360, s 0-1, l 0-1]. */
export function hsl(r, g, b) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, Math.min(1, s), l];
}

const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * PURE: the colour of an RGBA picture (row-major bytes, straight alpha).
 * @param {Uint8Array|Uint8ClampedArray|number[]} rgba
 * @param {number} width
 * @param {number} height
 * @param {{ step?: number }} [opts] sample every step-th pixel in x and y (1: every pixel)
 * @returns {{ l: number, s: number, hue: number[], cover: number }}
 */
export function colourStats(rgba, width, height, { step = 1 } = {}) {
  let wSum = 0;
  let lSum = 0;
  let sSum = 0;
  let n = 0;
  const hue = new Array(HUE_BINS).fill(0);
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      n += 1;
      const a = rgba[i + 3] / 255;
      if (a <= 0) continue;
      const [h, s, l] = hsl(rgba[i], rgba[i + 1], rgba[i + 2]);
      wSum += a;
      lSum += a * l;
      sSum += a * s;
      if (s > 0) hue[Math.floor(h / 30) % HUE_BINS] += a * s;
    }
  }
  const hueSum = hue.reduce((a, b) => a + b, 0);
  return {
    l: wSum ? r3(lSum / wSum) : 0,
    s: wSum ? r3(sSum / wSum) : 0,
    hue: hue.map((v) => (hueSum ? r3(v / hueSum) : 0)),
    cover: n ? r3(wSum / n) : 0,
  };
}

/** PURE: how much two hue histograms share (the sum of the smaller bin), 0 to 1. */
export function hueOverlap(a, b) {
  let t = 0;
  for (let i = 0; i < HUE_BINS; i += 1) t += Math.min(Number(a?.[i]) || 0, Number(b?.[i]) || 0);
  return r3(t);
}
