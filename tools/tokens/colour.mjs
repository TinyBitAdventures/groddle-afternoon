// Colour parsing, OKLab distance and palette naming for the design tokens.

export const NAMED = {
  white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0], gold: [255, 215, 0], green: [0, 128, 0],
  teal: [0, 128, 128], purple: [128, 0, 128], grey: [128, 128, 128], gray: [128, 128, 128], yellow: [255, 255, 0],
  orange: [255, 165, 0], blue: [0, 0, 255], silver: [192, 192, 192], navy: [0, 0, 128], pink: [255, 192, 203],
  brown: [165, 42, 42], ivory: [255, 255, 240], beige: [245, 245, 220], wheat: [245, 222, 179], tan: [210, 180, 140],
  khaki: [240, 230, 140], crimson: [220, 20, 60], tomato: [255, 99, 71], coral: [255, 127, 80], salmon: [250, 128, 114],
  lime: [0, 255, 0], olive: [128, 128, 0], maroon: [128, 0, 0], cyan: [0, 255, 255], magenta: [255, 0, 255],
  whitesmoke: [245, 245, 245], snow: [255, 250, 250], linen: [250, 240, 230], cornsilk: [255, 248, 220],
};

// Properties whose value can hold a colour (named colours only count in these).
export const COLOUR_PROP = /^(color|background|background-color|background-image|border|border-(top|right|bottom|left)(-color)?|border-color|outline|outline-color|box-shadow|text-shadow|fill|stroke|filter|caret-color|text-decoration|text-decoration-color|accent-color|scrollbar-color|column-rule|border-image|--[\w-]+|-webkit-text-fill-color|-webkit-text-stroke(-color)?)$/;

// Raw colour literals in a (masked) CSS value: hex, rgb()/rgba() with numbers, hsl()/hsla(), named.
// Named colours only count in properties that take a colour (namedOk).
export function colourLiterals(masked, namedOk) {
  const out = [];
  const re = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])|\b(rgba?|hsla?)\(([^()]*)\)/g;
  for (const m of masked.matchAll(re)) {
    if (m[3] !== undefined && /var\(|from\s/.test(m[3])) continue;
    const c = parseColour(m[0]);
    if (c) out.push({ index: m.index, length: m[0].length, text: m[0], rgba: c });
  }
  if (namedOk) {
    const nre = new RegExp(`(?<![-\\w#.$])(${Object.keys(NAMED).join('|')})(?![-\\w(])`, 'gi');
    for (const m of masked.matchAll(nre)) {
      const [r, g, b] = NAMED[m[1].toLowerCase()];
      out.push({ index: m.index, length: m[0].length, text: m[0], rgba: [r, g, b, 1] });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

function hsl2rgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

export function parseColour(str) {
  const s = str.trim().toLowerCase();
  if (NAMED[s]) return [...NAMED[s], 1];
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 5 || h.length === 7) return null;
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), +a.toFixed(3)];
  }
  m = /^(rgba?|hsla?)\(([^()]*)\)$/.exec(s);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const num = (p, scale) => (p.endsWith('%') ? (parseFloat(p) / 100) * scale : parseFloat(p));
  const a = parts[3] === undefined ? 1 : num(parts[3], 1);
  if (m[1].startsWith('rgb')) return [num(parts[0], 255), num(parts[1], 255), num(parts[2], 255), a];
  const [r, g, b] = hsl2rgb(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]));
  return [r, g, b, a];
}

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export function oklab([r, g, b]) {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function oklch(rgb) {
  const [L, a, b] = oklab(rgb);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, Math.hypot(a, b), h];
}
// OKLab distance x 100 with the colour axes (a, b) counted twice, so two pale colours of different
// hue (a cream and a mint) stay apart while two shades of one colour merge. About 2 is just noticeable.
// A neutral grey (OKLCH chroma under 0.008) never merges with a tinted colour (chroma over 0.012),
// however close: a grey must not turn lilac or parchment.
export const NEUTRAL_C = 0.008;
export const TINT_C = 0.012;
export function deltaE(c1, c2) {
  const a = oklab(c1);
  const b = oklab(c2);
  const ca = Math.hypot(a[1], a[2]);
  const cb = Math.hypot(b[1], b[2]);
  if ((ca < NEUTRAL_C && cb > TINT_C) || (cb < NEUTRAL_C && ca > TINT_C)) return Infinity;
  return Math.hypot(a[0] - b[0], 2 * (a[1] - b[1]), 2 * (a[2] - b[2])) * 100;
}

export const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

// Palette family from OKLCH: neutrals by temperature, colours by hue band.
export function family(rgb) {
  const [L, C, h] = oklch(rgb);
  if (C < 0.005 || (C < 0.012 && (h < 40 || h >= 115))) return 'grey';
  if (C < 0.045) {
    if (h >= 40 && h < 115) return L >= 0.9 ? 'cream' : 'sand';
    if (h >= 115 && h < 190) return 'sage';
    if (h >= 190 && h < 290) return L < 0.4 ? 'navy' : 'slate';
    return 'mauve';
  }
  if (h >= 350 || h < 15) return 'pink';
  if (h < 42) return 'red';
  if (h < 70) return L < 0.55 ? 'brown' : 'orange';
  if (h < 100) return L < 0.55 ? 'umber' : 'gold';
  if (h < 118) return 'yellow';
  if (h < 135) return 'lime';
  if (h < 170) return 'green';
  if (h < 205) return 'teal';
  if (h < 240) return 'sky';
  if (h < 275) return L < 0.4 ? 'navy' : 'blue';
  if (h < 310) return 'violet';
  return 'plum';
}

export function paletteName(rgb, taken) {
  const [r, g, b] = rgb;
  if (r === 255 && g === 255 && b === 255) return '--c-white';
  if (r === 0 && g === 0 && b === 0) return '--c-black';
  const L = Math.round(oklch(rgb)[0] * 100);
  const base = `--c-${family(rgb)}-${L}`;
  if (!taken.has(base)) return base;
  for (const s of 'bcdefghijklmnopqrstuvwxyz') if (!taken.has(base + s)) return base + s;
  throw new Error('palette name space exhausted for ' + base);
}
