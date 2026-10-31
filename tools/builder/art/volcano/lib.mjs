/**
 * Volcano art: shared drawing helpers (seeded random, smooth blob paths, SVG pieces).
 * Pure string building; nothing here touches the disk. See draw.mjs for the pieces.
 */

/** Seeded random (mulberry32): the same seed draws the same picture every time. */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  next.pick = (list) => list[Math.floor(next() * list.length)];
  return next;
}

const f = (n) => Math.round(n * 10) / 10;

/** A closed smooth path through points (Catmull-Rom turned into cubic Beziers). */
export function smoothClosed(pts, tension = 1) {
  const n = pts.length;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return `${d} Z`;
}

/** An open smooth path through points. */
export function smoothOpen(pts, tension = 1) {
  const n = pts.length;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

/** Points round an ellipse, each pushed in or out by up to `wobble` of its radius. */
export function blobPoints(r, cx, cy, rx, ry, n = 12, wobble = 0.18, flatBottom = null) {
  const pts = [];
  const phase = r() * Math.PI * 2;
  for (let i = 0; i < n; i += 1) {
    const t = phase + (i / n) * Math.PI * 2;
    const k = 1 + (r() * 2 - 1) * wobble;
    let x = cx + Math.cos(t) * rx * k;
    let y = cy + Math.sin(t) * ry * k;
    if (flatBottom !== null && y > flatBottom) y = flatBottom;
    pts.push([x, y]);
  }
  return pts;
}

/** A wobbly horizontal edge from x0 to x1 around y, as points. */
export function edge(r, x0, x1, y, step, amp) {
  const pts = [];
  const n = Math.max(2, Math.round((x1 - x0) / step));
  for (let i = 0; i <= n; i += 1) pts.push([x0 + ((x1 - x0) * i) / n, y + (i === 0 || i === n ? 0 : (r() * 2 - 1) * amp)]);
  return pts;
}

/** The SVG document around a body. */
export function svgDoc(w, h, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n<defs>\n${defs}\n</defs>\n${body}\n</svg>\n`;
}

export const lin = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1, units = 'objectBoundingBox') =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="${units}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`;

export const rad = (id, stops, cx = 0.5, cy = 0.5, rr = 0.5, fx = cx, fy = cy) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${rr}" fx="${fx}" fy="${fy}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`;

/** A soft blur filter (stdDeviation s), with room round the shape. */
export const blur = (id, s) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s}"/></filter>`;

/**
 * Painterly grain: fractal noise turned into a soft light and dark mottle, kept inside the
 * shape's alpha. Used on rock fills so they read as painted, not flat vector.
 */
export const grain = (id, freq, seed, strength = 0.18) => `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${seed}" result="n"/>
<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${-strength * 2.2} ${strength * 1.1}" result="dark"/>
<feComposite in="dark" in2="SourceAlpha" operator="in" result="darkIn"/>
<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="darkIn"/></feMerge>
</filter>`;

/** Edge roughening: displaces the shape's outline a little, like a brush edge. */
export const rough = (id, freq, seed, scale) => `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%">
<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed}" result="t"/>
<feDisplacementMap in="SourceGraphic" in2="t" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>
</filter>`;

export const path = (d, attrs = '') => `<path d="${d}" ${attrs}/>`;

/** Palettes. Basalt is a warm dark umber (hue about 30 degrees, as Tiny Speck's rock and dirt are, not a neutral grey), lava runs yellow to deep red. */
export const BASALT = { outline: '#1c1611', deep: '#2b231c', base: '#3e3329', mid: '#544537', light: '#715d49', rim: '#9a7c5a' };
export const PUMICE = { outline: '#4a3a30', deep: '#7b6553', base: '#9c8268', mid: '#b49a7c', light: '#cdb592', hole: '#6f5a49' };
export const LAVA = { white: '#fff6c4', yellow: '#ffd84a', orange: '#ff8a1e', red: '#d8401c', deep: '#8a1c14', crust: '#3a1612' };

/**
 * A mask that rounds off where a floor-standing piece meets the ground: the art keeps its bottom on
 * the file's bottom, but only a few rounded lumps touch it (as Tiny Speck's ground pieces do), so it
 * never ends in a hard straight line. `fadeX` also fades both sides out over that share of the width.
 */
export function groundMask(id, r, w, h, depth = 18, fadeX = 0) {
  const pts = [[0, 0], [w, 0], [w, h - depth * 1.6]];
  const n = Math.max(4, Math.round(w / 60));
  for (let i = 1; i < n; i += 1) {
    const x = w - (w * i) / n;
    pts.push([x, i % 3 === 1 ? h + 2 : h - depth * (0.35 + r() * 0.6)]);
  }
  pts.push([0, h - depth * 1.6]);
  const fade = fadeX > 0
    ? `<linearGradient id="${id}F" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000"/><stop offset="${fadeX}" stop-color="#fff"/><stop offset="${1 - fadeX}" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="${id}X"><rect width="${w}" height="${h}" fill="url(#${id}F)"/></mask>`
    : '';
  return `${fade}<mask id="${id}"><g${fadeX > 0 ? ` mask="url(#${id}X)"` : ''}><path d="${smoothClosed(pts, 0.8)}" fill="#fff"/></g></mask>`;
}
