#!/usr/bin/env node
/**
 * LEVEL BUILDER art pack (lane GROUNDED): placeholder art, so a zone's layout can start before any
 * picture exists. For each piece in an art pack's pieces.json (tools/builder/art-bible.mjs), a
 * plain flat-tone stand-in at the piece's file size and shape, by kind: a ground band to the bottom
 * edge, a ledge slab with a flat top, a support column, a wall, a stream, a background strip with a
 * seamless skyline, an object with a flat foot, a particle dot; colours from the pack's palette; a
 * thin label with the piece's short name.
 *
 *   node tools/builder/art-placeholders.mjs <pack dir> [--draft <id> | --draft file:<zone.json>] [--only a,b]
 *
 * Writes <pack>/placeholders/gz_ph_<short>.webp and placeholders.json (each piece's name, size,
 * sha256 and provenance: own-work-CC0, a placeholder drawn by this tool). With --draft it adds them
 * to the draft as art (the site's asset intake, then one batch of asset.set ops; a zone file gets
 * the rows here), so `cli.mjs place --sprite gz_ph_<short>` lays a street out with them.
 *
 * The names are gz_ph_<short>, not the gz_ai_<short> the bible uses for a zone that has no art yet:
 * a placeholder is own work, and the licence policy keeps gz_ai_ for AI art (AST-004 and the site's
 * intake refuse own work named gz_ai_). The bible, intake and art-apply.mjs match a piece by its
 * short name, so art-apply swaps a placeholder for its picture by name, as it swapped the SVG pieces.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blank, encodePng, hexToRgb, WEBP_ARGS } from './art-image.mjs';

export const PLACEHOLDER_AUTHOR = 'Austin Ginder (placeholder drawn by tools/builder/art-placeholders.mjs)';
export const PLACEHOLDER_INPUT = 'own:a flat placeholder shape, no picture yet';
export const placeholderName = (short) => `gz_ph_${short}`.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 96);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** PURE: a colour's HSL lightness and saturation (0-1). */
function hsl([r, g, b]) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { l, s };
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/**
 * PURE: the tones a placeholder is painted with, from a pack's palette (hex list): body (a dark
 * mid tone), top (a lighter edge), line (the darkest), light (the lightest), hot (the most
 * saturated light colour, for streams). Grey stand-ins when the palette is empty.
 */
export function tones(palette = []) {
  const cols = palette.map((h) => hexToRgb(h)).map((rgb) => ({ rgb, ...hsl(rgb) })).sort((a, b) => a.l - b.l);
  if (!cols.length) return { body: [96, 88, 80], top: [150, 140, 128], line: [40, 36, 32], light: [230, 226, 220], hot: [230, 120, 40] };
  const mids = cols.filter((c) => c.l >= 0.15 && c.l <= 0.45);
  const body = (mids.length ? mids[mids.length >> 1] : cols[cols.length >> 1]).rgb;
  const tops = cols.filter((c) => c.l > 0.42 && c.l <= 0.7);
  const hot = [...cols].filter((c) => c.l > 0.35).sort((a, b) => b.s - a.s)[0] || cols.at(-1);
  return { body, top: (tops[0] || cols[Math.min(cols.length - 1, cols.length * 0.7 | 0)]).rgb, line: cols[0].rgb, light: cols.at(-1).rgb, hot: hot.rgb };
}

/**
 * PURE: the shape of a placeholder as a coverage function (x, y) -> 0..1 over a w x h picture, and
 * where its walkable or flat top is (row), by kind.
 */
export function shapeOf(kind, role, w, h) {
  const rr = (x0, y0, x1, y1, rTop, rBot) => (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return 0;
    const r = y < (y0 + y1) / 2 ? rTop : rBot;
    if (r > 0) {
      const cy = y < (y0 + y1) / 2 ? y0 + r : y1 - r;
      const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
      if ((y < y0 + r || y > y1 - r) && (x < x0 + r || x > x1 - r)) return clamp(r + 0.5 - Math.hypot(x - cx, y - cy), 0, 1);
    }
    return 1;
  };
  const ellipse = (cx, cy, rx, ry) => (x, y) => clamp((1 - Math.hypot((x - cx) / rx, (y - cy) / ry)) * Math.min(rx, ry) + 0.5, 0, 1);
  switch (kind) {
    case 'ground': return { cover: rr(0, 0, w, h, 0, 0), top: 0 };
    case 'topper': return { cover: rr(0, 0, w, h, Math.min(h * 0.15, 12), Math.min(h * 0.35, w * 0.1)), top: 0 };
    case 'support': return { cover: rr(w * 0.1, 0, w * 0.9, h, 0, 0), top: 0 };
    case 'wall': return { cover: rr(w * 0.05, 0, w * 0.95, h, 0, 0), top: null };
    case 'stream': return { cover: rr(w * 0.3, 0, w * 0.7, h, 0, 0), top: null };
    case 'particle': return { cover: ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1), top: null };
    case 'strip': {
      // A skyline of three waves across the width, so the left and right edges meet.
      const base = h * 0.35;
      return { cover: (x, y) => clamp(y - (base + Math.sin((x / w) * Math.PI * 6) * h * 0.08) + 0.5, 0, 1), top: null };
    }
    default:
      if (role === 'sky') return { cover: ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1), top: null };
      return { cover: rr(w * 0.05, h * 0.08, w * 0.95, h, Math.min(w, h) * 0.25, 0), top: null };
  }
}

/** PURE: one placeholder picture ({w, h, px}) for a piece of pieces.json. */
export function drawPlaceholder(piece, palette = []) {
  const { w, h } = piece.target;
  const t = tones(palette);
  const back = piece.role === 'sky' || piece.role === 'bg';
  // Back layers hazier and paler, so the play area wins; particles the lightest tone; streams the hottest.
  const body = piece.kind === 'particle' ? t.light : piece.kind === 'stream' ? t.hot : back ? mix(t.body, t.light, piece.role === 'sky' ? 0.55 : 0.3) : t.body;
  const line = back ? mix(t.line, body, 0.5) : t.line;
  const { cover, top } = shapeOf(piece.kind, piece.role, w, h);
  const img = blank(w, h);
  const band = top === null ? -1 : Math.max(2, Math.round(h * 0.06));
  const edge = back || piece.kind === 'particle' ? 0 : 2;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const a = cover(x + 0.5, y + 0.5);
      if (a <= 0) continue;
      let c = body;
      if (top !== null && y - top < band) c = t.top;
      else if (edge && (cover(x + 0.5 - edge, y + 0.5) < 1 || cover(x + 0.5 + edge, y + 0.5) < 1 || (piece.kind !== 'ground' && piece.kind !== 'support' && piece.kind !== 'wall' && piece.kind !== 'stream' && cover(x + 0.5, y + 0.5 + edge) < 1))) c = line;
      const o = (y * w + x) * 4;
      img.px[o] = c[0];
      img.px[o + 1] = c[1];
      img.px[o + 2] = c[2];
      img.px[o + 3] = Math.round(a * (back ? 230 : 255));
    }
  }
  return img;
}

/** A font for the label: GRODDLE_LABEL_FONT, else a system sans; null when there is none (no label then). */
export function labelFont(env = process.env) {
  const list = [env.GRODDLE_LABEL_FONT, '/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'];
  return list.find((f) => f && existsSync(f)) || null;
}

/** A placeholder as WebP bytes, with a thin label (ImageMagick 7) when it is big enough to read and a font is at hand. */
export function placeholderWebp(piece, img, { label = true, font = labelFont() } = {}) {
  const { w, h } = piece.target;
  const size = Math.round(clamp(Math.min(h * 0.18, w * 0.08), 0, 28));
  const words = label && font && size >= 9 ? ['-font', font, '-gravity', 'center', '-fill', piece.kind === 'particle' || piece.role === 'sky' ? '#00000090' : '#FFFFFFB0', '-pointsize', String(size), '-annotate', '+0+0', `${piece.short} (placeholder)`] : [];
  const run = (extra) => execFileSync('magick', ['png:-', ...extra, ...WEBP_ARGS, 'webp:-'], { input: encodePng(img), maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'ignore'] });
  try {
    return run(words);
  } catch (e) {
    if (!words.length) throw e;
    return run([]); // the label is a nicety: without a usable font the shape is enough
  }
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/** Draws every piece's placeholder into <pack>/placeholders/. Answers the placeholders.json rows. */
export function writePlaceholders(dir, { only = null } = {}) {
  const pack = JSON.parse(readFileSync(join(dir, 'pieces.json'), 'utf8'));
  const out = join(dir, 'placeholders');
  mkdirSync(out, { recursive: true });
  const rows = [];
  for (const piece of pack.pieces) {
    if (only && !only.has(piece.short)) continue;
    const img = drawPlaceholder(piece, pack.palette || []);
    const buf = placeholderWebp(piece, img);
    const name = placeholderName(piece.short);
    writeFileSync(join(out, `${name}.webp`), buf);
    rows.push({ name, short: piece.short, kind: piece.kind, role: piece.role, file: `${name}.webp`, w: img.w, h: img.h, bytes: buf.length, sha256: sha(buf), provenance: { licence: 'own-work-CC0', author: PLACEHOLDER_AUTHOR, inputs: [PLACEHOLDER_INPUT], role: piece.role === 'particle' ? 'middleground' : piece.role } });
  }
  writeFileSync(join(out, 'placeholders.json'), `${JSON.stringify({ format: 'groddle-art-placeholders/1', zone: pack.zone, pieces: rows }, null, 1)}\n`);
  return rows;
}

/** PURE: a zone file's asset row for a placeholder (no site: the row says what intake would). */
export function localRow(r) {
  return { origin: 'new', licence: 'own-work-CC0', source: r.provenance.author, author: r.provenance.author, sha256: r.sha256, w: r.w, h: r.h, registration: { x: r.w / 2, y: r.h }, inputs: r.provenance.inputs, intake: `local-${r.sha256.slice(0, 16)}` };
}

async function main(argv) {
  const opt = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : null;
  };
  const valued = new Set(['--draft', '--only']);
  const dir = argv.find((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
  if (!dir || !existsSync(join(dir, 'pieces.json'))) {
    process.stderr.write('node tools/builder/art-placeholders.mjs <pack dir (with pieces.json)> [--draft <id> | --draft file:<zone.json>] [--only a,b]\n');
    return 2;
  }
  const rows = writePlaceholders(resolve(dir), { only: opt('--only') ? new Set(opt('--only').split(',')) : null });
  for (const r of rows) process.stdout.write(`placeholder  ${r.file.padEnd(36)} ${r.kind.padEnd(8)} ${r.w}x${r.h}  ${(r.bytes / 1024).toFixed(0)} KB\n`);
  process.stdout.write(`${rows.length} placeholders -> ${join(resolve(dir), 'placeholders')}\n`);
  const draft = opt('--draft');
  if (!draft) return 0;
  const { settings, createClient, draftTarget, fileTarget } = await import('./cli.mjs');
  if (draft.startsWith('file:')) {
    const t = fileTarget(draft.slice(5));
    const w = await t.write(() => rows.map((r) => ({ op: 'asset.set', name: r.name, asset: localRow(r) })), 'placeholders');
    process.stdout.write(`${draft.slice(5)} rev ${w.rev}: ${rows.length} placeholder rows\n`);
    return 0;
  }
  const cfg = settings(process.env);
  const client = createClient({ url: cfg.url, key: cfg.key });
  const ops = [];
  for (const r of rows) {
    const body = { draft, name: r.name, file2: readFileSync(join(resolve(dir), 'placeholders', r.file)).toString('base64'), licence: 'own-work-CC0', author: r.provenance.author, inputs: r.provenance.inputs, role: r.provenance.role };
    const { data } = await client.call('POST', '/assets', { body });
    ops.push(data.op);
  }
  const w = await draftTarget(client, draft).write(() => ops, `placeholders: ${rows.length} pieces`);
  process.stdout.write(`${draft} rev ${w.rev}: ${rows.length} placeholders in (place them with cli.mjs place --sprite gz_ph_<short>)\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  });
}
