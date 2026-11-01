/**
 * The visible top of every piece things rest on, and the sweep that nothing
 * set on one floats (Austin 2026-11-01: "the diamond still floats above that
 * shelf").
 *
 * A piece with a surface (a shelf, a table, a cabinet, a fireplace: every
 * FURNITURE_CATALOG class with `surface`, plain or upgraded) holds what you set
 * on it at js/home-decor.js surfaceHeight. That height must sit on the art:
 * never above the piece's visible top, and on the drawn piece, not in the air
 * in front of it or between its legs.
 *
 *   node tools/furniture-upgrades/tops.mjs           measure each upgrade's art
 *                                                    into art.json (top), then
 *                                                    run build.mjs to carry it
 *                                                    into the data module
 *   node tools/furniture-upgrades/tops.mjs --check   exit 1 when a recorded top
 *                                                    is stale, or when anything
 *                                                    set on a piece would float
 *
 * `top` (1x px from the art's top edge) is the median, over the middle 40% of
 * the art's columns (30% to 70%), of the first row at least half opaque: where
 * a thing set down in the middle of the piece would first touch it from above.
 * The plain pieces are measured too (their @3x.webp), for the sweep only.
 *
 * The sweep, for each piece at its surfaceHeight h (art height H, the rest row
 * H - h from the top):
 *   - not above the visible top: h <= H - top + 1;
 *   - on the art: in at least REST_ON of those middle columns the art is drawn
 *     (alpha >= REST_ALPHA) within REST_BELOW px under the rest row.
 *
 * Needs ImageMagick (`magick`) to read the art; with none it says so and
 * exits 0 (tests/furniture-surfaces.test.js skips).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const ART = join(here, 'art.json');

/** The middle columns measured (fractions of the width). */
export const MIDDLE = Object.freeze([0.3, 0.7]);
/** Alpha (0-255) that counts as the piece's top edge. */
export const TOP_ALPHA = 128;
/** Alpha that counts as drawn under a resting thing (glass tops are faint). */
export const REST_ALPHA = 40;
/** 1x px under the rest row searched for the drawn piece. */
export const REST_BELOW = 3;
/** Share of the middle columns that must have the piece under the rest row. */
export const REST_ON = 0.5;

export function hasMagick() {
  try {
    execFileSync('magick', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** The art's alpha channel: { w, h, a } at its file's own size. */
export function readAlpha(path) {
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', path]).toString().trim().split(' ').map(Number);
  const a = execFileSync('magick', [path, '-alpha', 'extract', '-depth', '8', 'gray:-'], { maxBuffer: 1 << 26 });
  return { w, h, a };
}

function middleColumns(w) {
  const out = [];
  for (let x = Math.floor(w * MIDDLE[0]); x < Math.ceil(w * MIDDLE[1]); x += 1) out.push(x);
  return out;
}

/** PURE: the visible top in file px (median first row with alpha >= TOP_ALPHA over the middle), or null. */
export function visibleTop({ w, h, a }) {
  const rows = [];
  for (const x of middleColumns(w)) {
    let y = 0;
    while (y < h && a[y * w + x] < TOP_ALPHA) y += 1;
    if (y < h) rows.push(y);
  }
  if (!rows.length) return null;
  rows.sort((p, q) => p - q);
  return rows[Math.floor(rows.length / 2)];
}

/** PURE: the share of the middle columns with the piece drawn within `below` file px under file row `row`. */
export function restOn({ w, h, a }, row, below) {
  const cols = middleColumns(w);
  let on = 0;
  for (const x of cols) {
    for (let y = Math.max(0, row); y <= Math.min(h - 1, row + below); y += 1) {
      if (a[y * w + x] >= REST_ALPHA) {
        on += 1;
        break;
      }
    }
  }
  return cols.length ? on / cols.length : 0;
}

/** Every piece things rest on: { key, cls, id, path, w, h } at 1x (id '' for the plain piece). */
export async function surfacePieces() {
  const { FURNITURE_CATALOG } = await import(join(root, 'public/js/homes-catalog.js'));
  const { FURNITURE_UPGRADES } = await import(join(root, 'public/js/furniture-upgrades-data.js'));
  const out = [];
  for (const [cls, def] of Object.entries(FURNITURE_CATALOG)) {
    if (!def.surface) continue;
    const scale = Math.min(1, Number(def.scale) || 1);
    const plain = def.art.path.replace(/\.png$/, '@3x.webp');
    out.push({ key: `${cls}/0`, cls, id: '', path: existsSync(join(root, 'public', plain)) ? plain : def.art.path, w: Math.round(def.art.w * scale), h: Math.round(def.art.h * scale) });
    for (const [id, row] of Object.entries(FURNITURE_UPGRADES[cls]?.upgrades || {})) {
      if (row.art) out.push({ key: `${cls}/${id}`, cls, id, path: row.art.path, w: row.art.w, h: row.art.h });
    }
  }
  return out;
}

/** Measure one piece: its visible top at 1x, and the art read for the sweep. */
function measure(piece) {
  const img = readAlpha(join(root, 'public', piece.path));
  const k = img.h / piece.h;
  const t = visibleTop(img);
  return { img, k, top: t == null ? null : Math.floor(t / k) };
}

/** The sweep: every piece's surfaceHeight sits on its art. Returns the problems. */
export async function sweep(measured) {
  const { surfaceHeight } = await import(join(root, 'public/js/home-decor.js'));
  const problems = [];
  for (const [piece, m] of measured) {
    const h = surfaceHeight(piece.cls, piece.id);
    if (!h) {
      problems.push(`${piece.key}: no surface`);
      continue;
    }
    if (m.top == null) {
      problems.push(`${piece.key}: nothing drawn over its middle`);
      continue;
    }
    if (h > piece.h - m.top + 1) problems.push(`${piece.key}: rests ${h} over its foot, above its visible top ${piece.h - m.top}`);
    const row = Math.round((piece.h - h) * m.k);
    const on = restOn(m.img, row, Math.round(REST_BELOW * m.k));
    if (on < REST_ON) problems.push(`${piece.key}: rests ${h} over its foot in the air (${Math.round(on * 100)}% of its middle drawn under it)`);
  }
  return problems;
}

async function main() {
  const check = process.argv.includes('--check');
  if (!hasMagick()) {
    console.log('skip: ImageMagick (magick) not found');
    return;
  }
  const art = JSON.parse(readFileSync(ART, 'utf8'));
  const pieces = await surfacePieces();
  const measured = pieces.map((piece) => [piece, measure(piece)]);
  const problems = [];
  let changed = 0;
  for (const [piece, m] of measured) {
    if (!piece.id) continue;
    const key = `${piece.cls}/${piece.id}`;
    if (!art[key]) {
      problems.push(`${key}: not in art.json`);
      continue;
    }
    if (art[key].top !== m.top) {
      if (check) problems.push(`${key}: top ${art[key].top} recorded, ${m.top} measured: run node tools/furniture-upgrades/tops.mjs`);
      else {
        art[key].top = m.top;
        changed += 1;
      }
    }
  }
  if (!check) {
    writeFileSync(ART, `${JSON.stringify(art, null, 1)}\n`);
    console.log(`measured ${measured.length} pieces, ${changed} tops written to art.json: now run node tools/furniture-upgrades/build.mjs`);
    return;
  }
  problems.push(...(await sweep(measured)));
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`ok: ${measured.length} pieces rest things on their art`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
