#!/usr/bin/env node
/**
 * Writes the Groddle Afternoon brand files into public/brand/ (the /brand/
 * page, tools/brand/to-minn.mjs, shows them). The mark is our own drawing:
 * an arched window onto Groddle late in the day, a low sun resting above two
 * rolling hills, a round tree, and a path up the near hill. It is drawn here
 * once, on a 64 grid, and every file below is built from these shapes, so
 * the mark, its one-colour version, the lockups and the icons cannot drift.
 * No Tiny Speck art and no Glitch name or logo are part of it.
 *
 *   node tools/brand/build.mjs            write the SVGs, then render the PNGs and the ICO
 *   node tools/brand/build.mjs --svg      write the SVGs only
 *   node tools/brand/build.mjs --check    fail if an SVG on disk differs from what this would write
 *
 * Rendering needs rsvg-convert and ImageMagick (brew install librsvg imagemagick).
 * The files in public/brand/swap/ are the favicon, ICO and touch icons that
 * would replace the site's current ones once Austin approves the mark.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(import.meta.dirname, '..', '..');
const OUT = join(root, 'public', 'brand');

/** The site's colour tokens the mark is drawn in (public/restoration/restoration.css). */
export const MARK_COLOURS = {
  skyTop: '#e3b04a', // --sun (dark): the high afternoon sky
  skyLow: '#e58b3f', // --accent: the sky low down, near the hills
  sun: '#fbfaf2', // --surface (light)
  farHill: '#79bd64', // --moss (dark)
  nearHill: '#4f8a3f', // --moss (light)
  path: '#dcefc9', // --bg (light): the meadow's own pale green
  ink: '#30462c', // --fg (light)
  paper: '#fbfaf2', // --surface (light)
  night: '#161e17', // --bg (dark)
  nightInk: '#e3ebd8', // --fg (dark)
};

/** The wordmark: the site's display face at the header's weight. */
export const WORDMARK = { text: 'Groddle Afternoon', family: "'Iowan Old Style', Charter, Georgia, 'Times New Roman', serif", weight: 600 };
/** "Groddle Afternoon" in Iowan Old Style 600 is 9.06 of its size wide, and its capitals 0.697 of its size tall (measured in Chrome). */
const WORD_WIDTH = 9.0615;
const CAP = 0.6968;

const C = MARK_COLOURS;
// The arch: 48 wide, 56 tall, its top a half circle, its foot rounded off by 5.5.
const ARCH = 'M8 28a24 24 0 0 1 48 0v26.5a5.5 5.5 0 0 1-5.5 5.5h-37A5.5 5.5 0 0 1 8 54.5Z';
const SUN = { cx: 39, cy: 29.5, r: 10 };
const FAR_HILL = 'M8 40.5c6-4.5 12-5.5 18-3.5c6 2 10 4.5 16 4.5c5 0 9-2 14-4.5V60H8Z';
const NEAR_HILL = 'M8 51c8-4 17-6.5 27-6.5c8 0 14 2.5 21 5.5V60H8Z';
const NEAR_EDGE = 'M8 51c8-4 17-6.5 27-6.5c8 0 14 2.5 21 5.5';
const PATH = 'M19.5 60C27 55 30.5 50 35.3 44.6h1.4C35.2 49.5 33.2 55 36 60Z';
const TREE = { cx: 18.5, cy: 30.6, r: 5, trunk: 'M17.6 32h1.8v5.9a0.6 0.6 0 0 1-0.6 0.6h-0.6a0.6 0.6 0 0 1-0.6-0.6Z' };

const head = (w, h, title, vb = `0 0 ${w} ${h}`) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">\n  <title>${title}</title>\n`;
const note = '  <!-- The Groddle Afternoon mark: our own drawing (tools/brand/build.mjs writes this file). -->\n';

/** The full-colour mark's shapes, ids prefixed so two marks can share a page. */
function markShapes(id) {
  return `  <defs>
    <clipPath id="${id}-arch"><path d="${ARCH}"/></clipPath>
    <linearGradient id="${id}-sky" x1="0" y1="4" x2="0" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${C.skyTop}"/>
      <stop offset="1" stop-color="${C.skyLow}"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#${id}-arch)">
    <rect x="8" y="4" width="48" height="56" fill="url(#${id}-sky)"/>
    <circle cx="${SUN.cx}" cy="${SUN.cy}" r="${SUN.r}" fill="${C.sun}"/>
    <path d="${FAR_HILL}" fill="${C.farHill}"/>
    <circle cx="${TREE.cx}" cy="${TREE.cy}" r="${TREE.r}" fill="${C.nearHill}"/>
    <path d="${TREE.trunk}" fill="${C.nearHill}"/>
    <path d="${NEAR_HILL}" fill="${C.nearHill}"/>
    <path d="${PATH}" fill="${C.path}"/>
  </g>\n`;
}

/** The one-colour mark: the arch as a frame, the sun, tree and hills solid, the path and the near hill's edge cut out. */
function monoShapes(id, colour) {
  return `  <defs>
    <clipPath id="${id}-arch"><path d="${ARCH}"/></clipPath>
    <mask id="${id}-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
      <rect width="64" height="64" fill="#fff"/>
      <path d="${NEAR_EDGE}" fill="none" stroke="#000" stroke-width="3"/>
      <path d="${PATH}" fill="#000"/>
    </mask>
  </defs>
  <g clip-path="url(#${id}-arch)" fill="${colour}">
    <path d="${ARCH}" fill="none" stroke="${colour}" stroke-width="8"/>
    <g mask="url(#${id}-cut)">
      <circle cx="${SUN.cx}" cy="${SUN.cy}" r="${SUN.r}"/>
      <circle cx="${TREE.cx}" cy="${TREE.cy}" r="${TREE.r}"/>
      <path d="${TREE.trunk}"/>
      <path d="${FAR_HILL}"/>
    </g>
  </g>\n`;
}

/** The mark redrawn for 16 to 32 pixels: a wider arch, a bigger sun, no path, the tree a round bush. */
function smallShapes(id) {
  return `  <defs>
    <clipPath id="${id}-arch"><path d="M5 31a27 27 0 0 1 54 0v25a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6Z"/></clipPath>
    <linearGradient id="${id}-sky" x1="0" y1="4" x2="0" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${C.skyTop}"/>
      <stop offset="1" stop-color="${C.skyLow}"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#${id}-arch)">
    <rect x="5" y="4" width="54" height="58" fill="url(#${id}-sky)"/>
    <circle cx="38" cy="29" r="12" fill="${C.sun}"/>
    <path d="M5 42c7-5 14-6 21-4c7 2 11 5 18 5c6 0 10-2 15-5V62H5Z" fill="${C.farHill}"/>
    <circle cx="17" cy="33" r="6" fill="${C.nearHill}"/>
    <path d="M5 54c9-5 19-7.5 29-7.5c10 0 17 3 25 6.5V62H5Z" fill="${C.nearHill}"/>
  </g>\n`;
}

/** The mark's 64 box placed at (x, y), scaled so the arch (56 of the 64) is h tall. */
const placed = (shapes, x, y, h) => {
  const s = h / 56;
  return `  <g transform="translate(${r2(x - 8 * s)} ${r2(y - 4 * s)}) scale(${r2(s, 4)})">\n${shapes.replace(/^(?=.)/gm, '  ')}  </g>\n`;
};
const r2 = (n, d = 2) => Number(n.toFixed(d));

/** A line of the wordmark, its width held by textLength so a fallback face keeps the lockup's shape. */
const word = (text, x, baseline, size, colour, anchor = 'start') => {
  const width = text === WORDMARK.text ? WORD_WIDTH : text === 'Groddle' ? 3.8604 : 4.9043;
  return `  <text x="${r2(x)}" y="${r2(baseline)}" font-family="${WORDMARK.family.replace(/'/g, '&apos;')}" font-weight="${WORDMARK.weight}" font-size="${r2(size)}" fill="${colour}" text-anchor="${anchor}" textLength="${r2(width * size)}" lengthAdjust="spacingAndGlyphs">${text}</text>\n`;
};

/**
 * The lockups. Horizontal: the arch, then the wordmark a third of the arch's
 * height after it, set at 0.82 of the arch's height (the header's 28 px
 * icon, whose arch is 24.5 px, beside its 20 px name), its capitals centred
 * on the arch. Stacked: the arch centred over two lines, Groddle and Afternoon.
 */
export const LOCKUP = { gap: 1 / 3, size: 0.816, stackGap: 0.25, stackSize: 0.6, stackLeading: 1.12 };
function horizontal(colour) {
  const h = 56, size = h * LOCKUP.size, x = 48 + h * LOCKUP.gap, w = Math.ceil(x + WORD_WIDTH * size + 2);
  return head(w, h, 'Groddle Afternoon') + note + placed(markShapes('ga-h'), 0, 0, h) + word(WORDMARK.text, x, h / 2 + (CAP * size) / 2, size, colour) + '</svg>\n';
}
function stacked(colour) {
  const h = 56, size = h * LOCKUP.stackSize, w = Math.ceil(4.9043 * size + 4), top = h + h * LOCKUP.stackGap + CAP * size;
  const total = Math.ceil(top + size * LOCKUP.stackLeading + 2);
  return head(w, total, 'Groddle Afternoon') + note + placed(markShapes('ga-s'), (w - 48) / 2, 0, h)
    + word('Groddle', w / 2, top, size, colour, 'middle') + word('Afternoon', w / 2, top + size * LOCKUP.stackLeading, size, colour, 'middle') + '</svg>\n';
}

/** Clear space: the sun's width (20 of the arch's 56) kept empty round the lockup, shown on paper. */
function clearSpace() {
  const h = 56, size = h * LOCKUP.size, x0 = 48 + h * LOCKUP.gap, ww = x0 + WORD_WIDTH * size, pad = SUN.r * 2, m = 14;
  const W = Math.ceil(ww + 2 * (pad + m)), H = h + 2 * (pad + m), ox = pad + m, oy = pad + m;
  const disc = (cx, cy) => `  <circle cx="${r2(cx)}" cy="${r2(cy)}" r="${SUN.r}" fill="${C.skyLow}" fill-opacity="0.35"/>\n`;
  return head(W, H, 'Clear space round the Groddle Afternoon lockup')
    + `  <rect width="${W}" height="${H}" rx="12" fill="${C.paper}"/>\n`
    + `  <rect x="${m}" y="${m}" width="${r2(W - 2 * m)}" height="${H - 2 * m}" fill="none" stroke="${C.skyLow}" stroke-width="1.5" stroke-dasharray="5 4"/>\n`
    + `  <rect x="${ox}" y="${oy}" width="${r2(ww)}" height="${h}" fill="none" stroke="${C.ink}" stroke-opacity="0.25" stroke-width="1"/>\n`
    + disc(ox - SUN.r, oy + h / 2) + disc(ox + ww + SUN.r, oy + h / 2) + disc(ox + 24, oy - SUN.r) + disc(ox + 24, oy + h + SUN.r)
    + placed(markShapes('ga-c'), ox, oy, h) + word(WORDMARK.text, ox + x0, oy + h / 2 + (CAP * size) / 2, size, C.ink) + '</svg>\n';
}

/** The two directions explored and set aside (the arch above is the third, and the one chosen). */
const LETTERMARK = `  <rect x="2" y="2" width="60" height="60" rx="15" fill="${C.ink}"/>
  <path d="M47.5 21.5A18.5 18.5 0 1 0 50.5 34H36" fill="none" stroke="${C.farHill}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="43" cy="26.5" r="5.6" fill="${C.skyTop}"/>\n`;
const EMBLEM = `  <defs>
    <clipPath id="ga-e-disc"><circle cx="32" cy="32" r="24"/></clipPath>
  </defs>
  <circle cx="32" cy="32" r="30" fill="${C.ink}"/>
  <circle cx="32" cy="32" r="27" fill="none" stroke="${C.skyTop}" stroke-width="1.6" stroke-dasharray="3.2 2.4" stroke-linecap="round"/>
  <g clip-path="url(#ga-e-disc)">
    <rect x="8" y="8" width="48" height="48" fill="${C.paper}"/>
    <circle cx="40" cy="33" r="9" fill="${C.skyLow}"/>
    <path d="M8 41c8-5 16-6 24-3s16 3 24-1v19H8Z" fill="${C.farHill}"/>
    <path d="M23 24c-5 0-8 4-8 8.5c0 3.6 2.6 6.5 6 7.2V44h4v-4.3c3.4-0.7 6-3.6 6-7.2C31 28 28 24 23 24Z" fill="${C.nearHill}"/>
    <path d="M8 48c9-3.5 20-4.5 30-2c7 1.7 12 1.8 18 0.5V56H8Z" fill="${C.nearHill}"/>
  </g>\n`;

/** An app icon: the mark on a meadow square (touch icons need a solid background). */
const appIcon = () => head(64, 64, 'Groddle Afternoon') + note + `  <rect width="64" height="64" fill="${C.path}"/>\n` + placed(markShapes('ga-a'), 11, 8.5, 48) + '</svg>\n';

/** Every SVG this writes, by its path under public/brand/. */
export function svgFiles() {
  const mark = (shapes, title = 'Groddle Afternoon') => head(64, 64, title) + note + shapes + '</svg>\n';
  return {
    'mark.svg': mark(markShapes('ga')),
    'mark-small.svg': mark(smallShapes('ga-sm')),
    'mark-ink.svg': mark(monoShapes('ga-ink', C.ink)),
    'mark-paper.svg': mark(monoShapes('ga-paper', C.paper)),
    'lockup-horizontal.svg': horizontal(C.ink),
    'lockup-horizontal-dark.svg': horizontal(C.nightInk),
    'lockup-stacked.svg': stacked(C.ink),
    'lockup-stacked-dark.svg': stacked(C.nightInk),
    'clear-space.svg': clearSpace(),
    'app-icon.svg': appIcon(),
    'direction-lettermark.svg': mark(LETTERMARK, 'Direction explored: a G lettermark with the sun in its mouth'),
    'direction-emblem.svg': mark(EMBLEM, 'Direction explored: a stitched emblem with a tree and the sun'),
    'swap/favicon.svg': mark(smallShapes('ga-sm')),
  };
}

/** The PNG renders: [source svg, out path, size]. */
export const RENDERS = [
  ['mark-small.svg', 'png/icon-16.png', 16],
  ['mark-small.svg', 'png/icon-32.png', 32],
  ['mark.svg', 'png/mark-64.png', 64],
  ['app-icon.svg', 'png/icon-180.png', 180],
  ['app-icon.svg', 'png/icon-512.png', 512],
  ['mark.svg', 'png/mark-512.png', 512],
  ['app-icon.svg', 'swap/apple-touch-icon.png', 180],
  ['app-icon.svg', 'swap/favicon-192.png', 192],
];

function render() {
  for (const [src, out, size] of RENDERS) {
    mkdirSync(dirname(join(OUT, out)), { recursive: true });
    execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), join(OUT, src), '-o', join(OUT, out)]);
  }
  // Touch icons are opaque (iOS fills transparency with black).
  for (const out of ['swap/apple-touch-icon.png', 'swap/favicon-192.png']) execFileSync('magick', [join(OUT, out), '-background', C.path, '-alpha', 'remove', '-alpha', 'off', '-strip', join(OUT, out)]);
  // The ICO: 16, 32 and 48 from the small mark, like the current favicon.ico (16 and 32).
  const tmp = join(tmpdir(), `groddle-brand-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  try {
    const parts = [16, 32, 48].map((s) => {
      const f = join(tmp, `ico-${s}.png`);
      execFileSync('rsvg-convert', ['-w', String(s), '-h', String(s), join(OUT, 'mark-small.svg'), '-o', f]);
      return f;
    });
    execFileSync('magick', [...parts, join(OUT, 'swap', 'favicon.ico')]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const args = new Set(process.argv.slice(2));
  const files = svgFiles();
  if (args.has('--check')) {
    const stale = Object.entries(files).filter(([path, svg]) => !existsSync(join(OUT, path)) || readFileSync(join(OUT, path), 'utf8') !== svg).map(([p]) => p);
    if (stale.length) {
      console.error(`stale: ${stale.join(', ')} (run node tools/brand/build.mjs)`);
      process.exit(1);
    }
    console.log(`${Object.keys(files).length} brand SVGs up to date`);
    return;
  }
  for (const [path, svg] of Object.entries(files)) {
    mkdirSync(dirname(join(OUT, path)), { recursive: true });
    writeFileSync(join(OUT, path), svg);
  }
  if (!args.has('--svg')) render();
  console.log(`wrote ${Object.keys(files).length} SVGs${args.has('--svg') ? '' : ` and ${RENDERS.length + 1} renders`} to public/brand/`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
