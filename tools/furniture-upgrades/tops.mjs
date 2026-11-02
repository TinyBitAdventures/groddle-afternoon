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
 * The plain pieces are measured too (their @3x.webp), into base.json (`top`, in
 * the art's own px), which build-homes.mjs carries into the catalog with the
 * piece's plat and foot.
 *
 * The sweep, for each piece at its surfaceHeight h (art height H, the rest row
 * H - h from the top):
 *   - not above the visible top: h <= H - top + 1;
 *   - on the art: in at least REST_ON of those middle columns the art is drawn
 *     (alpha >= REST_ALPHA) within REST_BELOW px under the rest row;
 *   - and what rests there sits on its own bottom (itemBottoms: no world-art
 *     state has clear rows under it);
 *   - on its plat (DECOPOLISH, Austin 2026-11-02: "Placed items seem to float
 *     above the table"): a piece whose source plat lies under its visible top
 *     rests things on that plat, plat - foot (the plain piece's plat read here
 *     from items/<class>.js getFurnitureBaseGeo and its foot from base.json, an
 *     upgrade's from catalog_furniture through the data module). The first two
 *     passed while the plain pieces rested things on the back edge of their
 *     tops, 5 px under the art's top edge and up to 13 px over the plat.
 *
 *   - a seat (platOnly: chair, armchair, bench, stool, sofa, loveseat, bed; SEATSELECT,
 *     Austin 2026-11-02) rests things only on its plat, plain and every style: its plat
 *     must lie on its art, and a style with no plat in the source holds nothing
 *     (platlessSeats: two hidden test sofas).
 *
 *   node tools/furniture-upgrades/tops.mjs           also writes the plain tops
 *                                                    into base.json: then run
 *                                                    node build-homes.mjs --no-art
 *
 * Needs ImageMagick (`magick`) to read the art; with none it says so and
 * exits 0 (tests/furniture-surfaces.test.js skips).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const ART = join(here, 'art.json');
const BASE = join(here, 'base.json');

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
    out.push({ key: `${cls}/0`, cls, id: '', path: existsSync(join(root, 'public', plain)) ? plain : def.art.path, w: Math.round(def.art.w * scale), h: Math.round(def.art.h * scale), artH: def.art.h, scale, def, platOnly: Boolean(def.platOnly) });
    for (const [id, row] of Object.entries(FURNITURE_UPGRADES[cls]?.upgrades || {})) {
      // A seat's style with no plat holds nothing (platOnly, SEATSELECT): the sweep proves that apart.
      if (def.platOnly && row.platY == null) continue;
      if (row.art) out.push({ key: `${cls}/${id}`, cls, id, path: row.art.path, w: row.art.w, h: row.art.h, platOnly: Boolean(def.platOnly) });
    }
  }
  return out;
}

/** Measure one piece: its visible top at 1x, and the art read for the sweep. */
function measure(piece) {
  const img = readAlpha(join(root, 'public', piece.path));
  const k = img.h / piece.h;
  const t = visibleTop(img);
  // A plain piece's top is recorded in its art's own px (the Fireplace's art is drawn at half size).
  const artTop = t == null || !piece.artH ? null : Math.floor(t / (img.h / piece.artH));
  return { img, k, top: t == null ? null : Math.floor(t / k), artTop };
}

/**
 * The height a piece's source plat rests things at, or null when it has none or
 * the plat is above its visible top: the plain piece's from items/<class>.js
 * (read here, not through the catalog) and base.json; an upgrade's from the data module.
 */
async function sourceRest(piece, m, base) {
  const { FURNITURE_UPGRADES } = await import(join(root, 'public/js/furniture-upgrades-data.js'));
  let plat = null;
  if (piece.id) {
    const row = FURNITURE_UPGRADES[piece.cls]?.upgrades?.[piece.id];
    if (row?.platY == null || !row.art) return null;
    plat = Math.round(row.platY - (Number(row.art.foot) || 0));
  } else {
    const { basePlats, surfaceFrom } = await import('./build.mjs');
    const y = surfaceFrom(basePlats(piece.cls));
    const b = base[piece.cls];
    // Only where the art is the base SWF's frame (build-homes.mjs baseSurface).
    if (y == null || !b?.h || !Number.isFinite(b.foot) || Math.abs(b.w - piece.def.art.w) > 8 || Math.abs(b.h - piece.artH) > 2) return null;
    plat = Math.round((y - b.foot) * piece.scale);
  }
  if (plat <= 0 || m.top == null || plat > piece.h - m.top) return null;
  return plat;
}

/** The sweep: every piece's surfaceHeight sits on its art. Returns the problems. */
export async function sweep(measured) {
  const { surfaceHeight } = await import(join(root, 'public/js/home-decor.js'));
  const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {};
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
    const want = await sourceRest(piece, m, base);
    if (want != null && Math.abs(h - want) > 1) problems.push(`${piece.key}: rests ${h} over its foot, its plat is at ${want}`);
    // A seat rests things only on its plat (SEATSELECT): the plat must be found and on the art.
    if (piece.platOnly && want == null) problems.push(`${piece.key}: a seat with no plat under its visible top`);
  }
  return problems;
}

/**
 * The seats' styles with no plat (platOnly classes, SEATSELECT): they hold nothing, as in the
 * original (include/furniture.js getPlatsAndWalls adds no geo). Returns the problems.
 */
export async function platlessSeats() {
  const { FURNITURE_CATALOG } = await import(join(root, 'public/js/homes-catalog.js'));
  const { FURNITURE_UPGRADES } = await import(join(root, 'public/js/furniture-upgrades-data.js'));
  const { surfaceHeight } = await import(join(root, 'public/js/home-decor.js'));
  const keys = [];
  const problems = [];
  for (const [cls, def] of Object.entries(FURNITURE_CATALOG)) {
    if (!def.platOnly) continue;
    if (def.platY == null) problems.push(`${cls}/0: a seat with no plat of its own`);
    for (const [id, row] of Object.entries(FURNITURE_UPGRADES[cls]?.upgrades || {})) {
      if (row.platY != null) continue;
      keys.push(`${cls}/${id}`);
      if (surfaceHeight(cls, id)) problems.push(`${cls}/${id}: has no plat in the source but holds things`);
    }
  }
  return { keys, problems };
}

/**
 * What rests on a piece rests by its own bottom: every world-art state
 * (js/world-art.js, the art a stack set down shows) is drawn with its bottom
 * centre on the stack's point, so the art must reach its bottom row (no
 * transparent rows under it lifting it off the surface). Returns the problems.
 */
export function itemBottoms() {
  const dir = join(root, 'public/assets/sprites/world');
  const files = [];
  for (const id of readdirSync(dir)) {
    for (const f of readdirSync(join(dir, id))) if (f.endsWith('@3x.webp')) files.push(join(dir, id, f));
  }
  const problems = [];
  for (let i = 0; i < files.length; i += 400) {
    const out = execFileSync('magick', ['identify', '-format', '%d/%f %h %@\n', ...files.slice(i, i + 400)], { maxBuffer: 1 << 24 }).toString();
    for (const line of out.trim().split('\n')) {
      const m = /^(\S+) (\d+) (\d+)x(\d+)\+(\d+)\+(\d+)$/.exec(line);
      if (!m) continue;
      const gap = Number(m[2]) - (Number(m[4]) + Number(m[6]));
      if (gap > 0) problems.push(`${m[1].slice(root.length + 1)}: ${gap} clear rows under the art (3x) lift it off what it rests on`);
    }
  }
  return { files: files.length, problems };
}

async function main() {
  const check = process.argv.includes('--check');
  if (!hasMagick()) {
    console.log('skip: ImageMagick (magick) not found');
    return;
  }
  const art = JSON.parse(readFileSync(ART, 'utf8'));
  const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {};
  const pieces = await surfacePieces();
  const measured = pieces.map((piece) => [piece, measure(piece)]);
  const problems = [];
  let changed = 0;
  let baseChanged = 0;
  for (const [piece, m] of measured) {
    if (!piece.id) {
      // The plain piece: its top in base.json, and the catalog carrying it (build-homes.mjs).
      const row = (base[piece.cls] ||= {});
      if (row.top !== m.artTop) {
        if (check) problems.push(`${piece.cls}: plain top ${row.top} recorded, ${m.artTop} measured: run node tools/furniture-upgrades/tops.mjs`);
        else {
          row.top = m.artTop;
          baseChanged += 1;
        }
      }
      if (check && piece.def.art.top !== row.top) problems.push(`${piece.cls}: the catalog's top ${piece.def.art.top} is not base.json's ${row.top}: run node build-homes.mjs --no-art`);
      const frame = Number.isFinite(row.foot) && Math.abs(row.w - piece.def.art.w) <= 8 && Math.abs(row.h - piece.artH) <= 2;
      if (check && (piece.def.art.foot ?? null) !== (frame ? row.foot : null)) problems.push(`${piece.cls}: the catalog's foot is not base.json's: run node build-homes.mjs --no-art`);
      continue;
    }
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
    const sorted = Object.fromEntries(Object.entries(base).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(BASE, `${JSON.stringify(sorted, null, 1)}\n`);
    console.log(`measured ${measured.length} pieces, ${changed} tops written to art.json and ${baseChanged} to base.json: now run node tools/furniture-upgrades/build.mjs and node build-homes.mjs --no-art`);
    return;
  }
  problems.push(...(await sweep(measured)));
  const platless = await platlessSeats();
  problems.push(...platless.problems);
  const items = itemBottoms();
  problems.push(...items.problems);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  const seats = measured.filter(([piece]) => piece.platOnly).length;
  console.log(`ok: ${measured.length} pieces rest things on their art, on their plats (${seats} seats on their seat plats; ${platless.keys.length} plat-less seat styles hold nothing); ${items.files} item states rest on their own bottoms`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
