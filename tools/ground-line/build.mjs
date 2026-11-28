#!/usr/bin/env node
/**
 * G1146 (report #617): how far down each street's ground art reaches across its whole width, so a
 * phone's camera can stop there (js/location-view.js phoneGroundWorldHeight).
 *
 * Glitch's camera never went below a street's bottom (CameraMan.as 451-453: limit_b = loc.b -
 * loc_vp_h / 2), and its 600 px view seldom showed a street's whole height. An upright phone shows
 * the whole height, and a sideways one scrolls to the bottom, and both show the canvas past the
 * location view (the pack reserve, which a phone's short pack row leaves mostly open). There a street
 * whose ground pieces stop short showed a bare strip: on Briarset Croft the front dirt pieces end at
 * different depths, so under the grass the middle showed the plain dark fill parked below the street
 * (ug_exface3, wholly under the bottom) between the pieces' ends.
 *
 * For every street in assets/streets/index.json this draws the alpha of the ground's art into a grid
 * of CELL px: the middleground and every layer fixed to the ground (js/street-render.js
 * skirtGroundOffset: those the street's own size, or close to it), each deco as the street draws it
 * (bottom centre, w x h, flipped, turned r degrees; hidden decos, missing art and the spare art
 * parked wholly over the top (#602) or wholly under the bottom left out, since the original camera never reached
 * them). From the deepest floor you can stand on down, the first row whose art leaves more than
 * GAP_SHARE of the width bare ends the ground: that row (street px from the top) is the ground line.
 * A street whose art reaches LIMIT_BELOW px under its bottom or more is left out (nothing to stop).
 *
 * Writes public/js/street-ground-lines.js. Needs dwebp (libwebp, as the deco pipeline's cwebp).
 *
 *   node tools/ground-line/build.mjs           write the module
 *   node tools/ground-line/build.mjs --check   exit 1 when it is stale
 *   node tools/ground-line/build.mjs --report  print every street's line and bare strip (no write)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECO_TWINS, decoWhollyAboveTop, layerIsDrawn } from '../../public/js/street-render.js?v=124facce';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT_PATH = join(root, 'public/js/street-ground-lines.js');
const STREETS = join(root, 'public/assets/streets');
const DECOS = join(root, 'public/assets/decos/groddle');

/** Grid cell (street px). */
export const CELL = 2;
/** A row with more than this share of the width bare ends the ground. */
export const GAP_SHARE = 0.02;
/** How far under the street's bottom the art is followed; a line this deep or deeper is left out. */
export const LIMIT_BELOW = 200;
/** How far over the deepest floor the scan may start when that floor's own row is not yet whole. */
export const START_ABOVE = 80;
/** How far under the deepest floor the first whole row may be; none by then: no line. */
export const START_BELOW = 40;
/** A run of rows short of whole this short, with whole rows under it, does not end the ground (a seam). */
export const SEAM = 16;

/** PURE: the deco's turned box (street px) around its bottom centre (x, y): { x0, y0, x1, y1 }. */
export function decoBox(deco, x, y) {
  const w = Math.abs(Number(deco.w) || 0);
  const h = Math.abs(Number(deco.h) || 0);
  const r = ((Number(deco.r) || 0) * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [px, py] of [[-w / 2, 0], [w / 2, 0], [-w / 2, -h], [w / 2, -h]]) {
    const wx = x + px * c - py * s;
    const wy = y + px * s + py * c;
    x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); y0 = Math.min(y0, wy); y1 = Math.max(y1, wy);
  }
  return { x0, y0, x1, y1 };
}

/**
 * PURE: marks the cells of `grid` ({ cols, rows, top, cell, data: Uint8Array }) the deco's solid
 * art covers. `alpha` is the art's alpha ({ w, h, data }: 1 solid, 0 clear, row-major); without it
 * the whole box counts. (x, y) is the deco's bottom centre in street px.
 */
export function stampDeco(grid, deco, x, y, alpha = null) {
  const w = Math.abs(Number(deco.w) || 0);
  const h = Math.abs(Number(deco.h) || 0);
  if (!(w > 0 && h > 0)) return;
  const r = ((Number(deco.r) || 0) * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const box = decoBox(deco, x, y);
  const { cell, cols, rows, top, data } = grid;
  const i0 = Math.max(0, Math.floor(box.x0 / cell));
  const i1 = Math.min(cols - 1, Math.floor(box.x1 / cell));
  const j0 = Math.max(0, Math.floor((box.y0 - top) / cell));
  const j1 = Math.min(rows - 1, Math.floor((box.y1 - top) / cell));
  const flip = Boolean(deco.flip);
  for (let j = j0; j <= j1; j++) {
    const dy = top + (j + 0.5) * cell - y;
    for (let i = i0; i <= i1; i++) {
      if (data[j * cols + i]) continue;
      const dx = (i + 0.5) * cell - x;
      // Back into the deco's own frame: px across (-w/2..w/2), py up from its foot (-h..0).
      const px = dx * c + dy * s;
      const py = -dx * s + dy * c;
      if (px < -w / 2 || px >= w / 2 || py < -h || py >= 0) continue;
      if (alpha) {
        let u = Math.floor(((px + w / 2) / w) * alpha.w);
        if (flip) u = alpha.w - 1 - u;
        const v = Math.floor(((py + h) / h) * alpha.h);
        if (!alpha.data[Math.min(alpha.h - 1, v) * alpha.w + Math.min(alpha.w - 1, u)]) continue;
      }
      data[j * cols + i] = 1;
    }
  }
}

/** PURE: the share of each grid row its art covers. */
export function rowCover(grid) {
  const out = new Float64Array(grid.rows);
  for (let j = 0; j < grid.rows; j++) {
    let n = 0;
    for (let i = 0; i < grid.cols; i++) n += grid.data[j * grid.cols + i];
    out[j] = n / grid.cols;
  }
  return out;
}

/**
 * PURE: the ground line (street px from the top) from the rows' cover: from the deepest floor
 * (`floorY`) down, the end of the whole rows (no more than GAP_SHARE of the width bare), across
 * seams up to SEAM px. When the floor's own row is not whole (a lip, a hill's edge), the run may
 * start up to START_ABOVE over it or START_BELOW under it. null when no row there is whole.
 */
export function groundLineFromCover(cover, { top, cell, floorY }) {
  const whole = (j) => cover[j] >= 1 - GAP_SHARE;
  const rowOf = (y) => Math.floor((y - top) / cell);
  let j = Math.max(0, rowOf(floorY - START_ABOVE));
  const last = Math.min(cover.length, rowOf(floorY + START_BELOW) + 1);
  while (j < last && !whole(j)) j++;
  if (j >= last) return null;
  const seam = Math.ceil(SEAM / cell);
  for (;;) {
    while (j < cover.length && whole(j)) j++;
    let k = j;
    while (k < cover.length && k - j < seam && !whole(k)) k++;
    if (k < cover.length && k - j < seam && whole(k)) j = k;
    else break;
  }
  return top + j * cell;
}

/** The street's deepest floor you can stand on (street px from the top), or its bottom when it has none. */
export function deepestFloor(street) {
  const H = street.bounds.b - street.bounds.t;
  let deepest = -Infinity;
  for (const p of street.platforms || []) {
    if (p.pc_perm === 1) continue;
    deepest = Math.max(deepest, p.y1 - street.bounds.t, p.y2 - street.bounds.t);
  }
  return Number.isFinite(deepest) ? Math.min(deepest, H) : H;
}

const alphaCache = new Map();
/** The art's alpha at its file's own size ({ w, h, data }), or null when there is no art. */
function spriteAlpha(sprite) {
  if (alphaCache.has(sprite)) return alphaCache.get(sprite);
  const file = join(DECOS, `${sprite}.webp`);
  let out = null;
  if (existsSync(file)) {
    const pam = execFileSync('dwebp', ['-quiet', '-pam', file, '-o', '-'], { maxBuffer: 1 << 30 });
    const end = pam.indexOf('ENDHDR\n') + 7;
    const head = pam.subarray(0, end).toString('latin1');
    const w = Number(/WIDTH (\d+)/.exec(head)[1]);
    const h = Number(/HEIGHT (\d+)/.exec(head)[1]);
    const depth = Number(/DEPTH (\d+)/.exec(head)[1]);
    const data = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) data[k] = depth === 4 ? (pam[end + k * 4 + 3] >= 128 ? 1 : 0) : 1;
    out = { w, h, data };
  }
  alphaCache.set(sprite, out);
  return out;
}

/** One street's ground line: { line, H, floorY, bare } (bare: px between the line and the bottom it leaves open). */
export function measureStreet(street, available, alphaOf = spriteAlpha, onCover = null) {
  const { l, t, b, r } = street.bounds;
  const W = r - l;
  const H = b - t;
  const floorY = deepestFloor(street);
  const top = Math.max(0, Math.floor(floorY - START_ABOVE - 40));
  const bottom = H + LIMIT_BELOW;
  const grid = { cell: CELL, top, cols: Math.ceil(W / CELL), rows: Math.ceil((bottom - top) / CELL) };
  grid.data = new Uint8Array(grid.cols * grid.rows);
  for (const layer of street.layers || []) {
    if (!layerIsDrawn(layer)) continue;
    // A parallax layer (its own canvas, layer-local coordinates) is drawn into a grid of its own
    // width, its bottom on the street's bottom (where the slide leaves it with the camera at the
    // bottom, js/street-render.js parallaxLayerOffset), and laid over the street's grid stretched
    // to the street's width: a row whole across the layer is whole in every view, wherever it slides.
    const parallax = layer.id !== 'middleground' && layer.w > 0 && layer.h > 0;
    const into = parallax ? { cell: CELL, top, cols: Math.ceil(layer.w / CELL), rows: grid.rows } : grid;
    if (parallax) into.data = new Uint8Array(into.cols * into.rows);
    // Authored T_ layers without a canvas size use street px from the top-left already.
    const direct = parallax || /^T_/.test(String(layer.id || ''));
    let drawn = 0;
    for (const deco of layer.decos || []) {
      if (deco.hidden || deco.src) continue;
      const sprite = available.has(deco.sprite) ? deco.sprite : DECO_TWINS[deco.sprite] || deco.sprite;
      if (!available.has(sprite)) continue;
      if (!direct && decoWhollyAboveTop(deco, t)) continue;
      const x = direct ? deco.x : deco.x - l;
      const y = parallax ? deco.y + H - layer.h : direct ? deco.y : deco.y - t;
      // Spare art parked wholly under the street's bottom (Briarset Croft's ug_exface3): outside the original camera.
      if (decoBox(deco, x, y).y0 >= H) continue;
      stampDeco(into, deco, x, y, alphaOf(sprite));
      drawn += 1;
    }
    if (parallax && drawn) {
      for (let i = 0; i < grid.cols; i++) {
        const li = Math.min(into.cols - 1, Math.floor((i * into.cols) / grid.cols));
        for (let j = 0; j < grid.rows; j++) if (into.data[j * into.cols + li]) grid.data[j * grid.cols + i] = 1;
      }
    }
  }
  const cover = rowCover(grid);
  if (onCover) onCover(cover, top);
  const line = groundLineFromCover(cover, { top, cell: CELL, floorY });
  return { line, H, floorY };
}

function load(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Every street's measure, by tsid. */
export function measureAll() {
  const index = load(join(STREETS, 'index.json')).streets;
  const available = new Set(load(join(root, 'public/assets/decos/manifest.json')));
  const out = {};
  for (const tsid of Object.keys(index).sort()) {
    const file = join(STREETS, `${tsid}.json`);
    if (!existsSync(file)) continue;
    const street = load(file);
    if (!street.bounds || !Array.isArray(street.layers)) continue;
    out[tsid] = { label: index[tsid].label, ...measureStreet(street, available) };
  }
  return out;
}

/** PURE: the module's text from the measures: the streets whose line is above H + LIMIT_BELOW. */
export function moduleText(measures) {
  const rows = Object.entries(measures)
    .filter(([, m]) => Number.isFinite(m.line) && m.line < m.H + LIMIT_BELOW)
    .map(([tsid, m]) => `  ${tsid}: ${m.line},`);
  return `/**
 * GENERATED by tools/ground-line/build.mjs (do not edit). G1146 (report #617): for each street whose
 * ground art stops less than ${LIMIT_BELOW} px under its bottom, how far down from the street's top
 * (street px) that art still covers the whole width. A phone's camera never shows below it
 * (js/location-view.js phoneGroundWorldHeight).
 */
export const STREET_GROUND_LINES = Object.freeze({
${rows.join('\n')}
});
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const measures = measureAll();
  if (process.argv.includes('--report')) {
    for (const [tsid, m] of Object.entries(measures)) console.log([tsid, m.label, m.H, m.floorY, m.line].join('\t'));
  } else {
    const text = moduleText(measures);
    const now = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf8') : '';
    if (process.argv.includes('--check')) {
      if (now !== text) {
        console.error('public/js/street-ground-lines.js is stale: run node tools/ground-line/build.mjs');
        process.exit(1);
      }
      console.log('street-ground-lines.js is current');
    } else if (now !== text) {
      writeFileSync(OUT_PATH, text);
      console.log(`wrote ${OUT_PATH}`);
    } else console.log('street-ground-lines.js is current');
  }
}
