#!/usr/bin/env node
/**
 * G933 (#453, #460): a Jellisac the snaps never measured sits in its street's empty hole before one
 * is planned on a floor. Jellisacs live in the ground cutaway hollows (the location files' decos
 * ground_cutaway_hollow1-3 on the middleground): of the 211 measured on players' snaps, 168 sit in
 * one. So for each street whose location file names more Jellisacs (street-ecology.json
 * counts.jellisac) than node-spots.json measured, it takes the street's middleground hollows that
 * no measured Jellisac sits in and seats the rest there. Writes public/js/jellisac-hole-spots-data.js:
 * the street's whole list (the measured rows first, in their order, so jellisac:<i> keeps its saved
 * state, then the holes), which street-ecology.js MEASURED_NODE_SPOTS reads over JELLISAC_SPOTS.
 * What is left after the holes is planned as before.
 *
 * G939 (the placement audit, contact sheets in the lane report): a hollow is drawn as street-render.js
 * draws every deco, anchored at its bottom centre and turned `r` degrees clockwise about it, so a
 * turned hole's opening is not over its deco point: Blottnass' hollows lie on their sides (r -87) and
 * the G933 seat hung 28 px beside the hole. A Jellisac now sits on the hole's own centre: its sack's
 * centre HOLE_DROP px under the opening's (the measured median, any variant). A hole is taken when a
 * measured sack's centre is inside its opening, two seats never come within SEAT_GAP of each other,
 * and the art drawn over a hole (a later middleground deco or a front layer, read through its alpha
 * mask, tools/jellisac-hole-masks.json) puts it after the open holes: Lagan Lark's hang_branch stalks
 * curl over two hollows the old left-to-right order filled while two open ones stood empty.
 *
 *   node tools/build-jellisac-hole-spots.mjs           write
 *   node tools/build-jellisac-hole-spots.mjs --check   exit 1 if stale or a mask is missing
 *   node tools/build-jellisac-hole-spots.mjs --measure measure the masks again (needs ImageMagick), then write
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JELLISAC_SPOTS } from '../public/js/node-spots-data.js?v=97d4281c';
import { FRONT_SEE_THROUGH, MEASURED_NODE_COVERS, frontDrift, streetEcologyAliases } from '../public/js/street-ecology.js?v=da5177b2';
import { decoCovers } from '../public/js/barnacle-walls.js?v=75e568c3';
import { DECO_TWINS } from '../public/js/street-render.js?v=91152d38';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'public/js/jellisac-hole-spots-data.js';
const MASKS = 'tools/jellisac-hole-masks.json';
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

/** The hollow decos a Jellisac sits in. */
export const HOLE_SPRITE = /^ground_cutaway_hollow[123]$/;
/**
 * G939: px from a hollow's opening centre down to the sack's centre, the median of the measured
 * Jellisacs in each (hollow1 4 of them, hollow2 29, hollow3 135; spread 4.4 px against 6.9 for the
 * old bottom-to-bottom lift, which put a short jellySack3 high in the hole).
 */
export const HOLE_DROP = Object.freeze({ ground_cutaway_hollow1: 5, ground_cutaway_hollow2: 6, ground_cutaway_hollow3: 4 });
/** Two Jellisacs' centres at least this far apart (the nearest the snaps show is Quinmchary's 48). */
export const SEAT_GAP = 40;
/** A hole whose opening the art drawn over it covers this much of comes after the open ones. */
export const COVER_BAR = 0.35;
/** A hole's jellySack variant, in the measured mix (120 of 211 are jellySack1, 44 jellySack2, 26 3, 21 4). */
export const HOLE_VARIANTS = Object.freeze([1, 2, 1, 3, 1, 2, 1, 4, 1, 1]);
/** A jellySack's frame cell height (resource-nodes.js sheets, MEASURED_NODE_COVERS). */
export const sackHeight = (v) => (MEASURED_NODE_COVERS.jellisac.cells[`jellySack${v}`] || MEASURED_NODE_COVERS.jellisac.cells.jellySack1)[1];
/** A row's sack centre: the row is its frame cell's bottom centre. */
export const sackCentre = ([x, y, v]) => [x, y - sackHeight(v) / 2];

const half = (n) => Math.round(n * 2) / 2;

/** PURE: a deco's drawn box about its own centre, turned as street-render.js turns it. */
export function decoOpening(d, x, y) {
  const t = ((Number(d.r) || 0) * Math.PI) / 180;
  const w = Number(d.w) || 0;
  const h = Number(d.h) || 0;
  return {
    cx: x + (h / 2) * Math.sin(t),
    cy: y - (h / 2) * Math.cos(t),
    ex: Math.hypot((w / 2) * Math.cos(t), (h / 2) * Math.sin(t)),
    ey: Math.hypot((w / 2) * Math.sin(t), (h / 2) * Math.cos(t)),
  };
}

/** PURE: whether a sack centre [x, y] is inside a hole's opening (a little slack for the smallest). */
export function inHole(hole, [x, y]) {
  return Math.abs(x - hole.cx) <= Math.max(12, hole.ex) && Math.abs(y - hole.cy) <= Math.max(14, hole.ey);
}

/**
 * PURE: a street's middleground hollows, left to right: { sprite, x, y (the deco point, street px),
 * r, cx, cy, ex, ey (the opening's centre and half extents), z, order, seat: [x, y] (a sack's cell
 * bottom centre for jellySack1) }.
 */
export function streetHoles(street) {
  const b = street?.bounds;
  if (!b || !Array.isArray(street.layers)) return [];
  const out = [];
  for (const layer of street.layers) {
    if (layer?.name !== 'middleground') continue;
    (layer.decos || []).forEach((d, order) => {
      if (!HOLE_SPRITE.test(d?.sprite || '') || !Number.isFinite(d.x) || !Number.isFinite(d.y) || d.hidden) return;
      const x = d.x - b.l;
      const y = d.y - b.t;
      const o = decoOpening(d, x, y);
      out.push({ sprite: d.sprite, x, y, r: Number(d.r) || 0, ...o, z: Number(d.z) || 0, order, deco: d });
    });
  }
  return out.sort((a, c) => a.cx - c.cx || a.cy - c.cy);
}

/** PURE: where a sack of variant v sits in a hole: its cell's bottom centre. */
export function holeSeat(hole, v = 1) {
  return [half(hole.cx), half(hole.cy + HOLE_DROP[hole.sprite] + sackHeight(v) / 2)];
}

/**
 * The decos drawn over a hole: later middleground decos (street-render.js sorts a layer's decos by
 * z, then as listed) and every deco of a layer above the middleground (the frontView), a sliding
 * layer's where it stands with a player at the hole (street-ecology.js frontDrift).
 */
export function coverDecos(street) {
  const b = street.bounds;
  const W = b.r - b.l;
  const H = b.b - b.t;
  const layers = street.layers || [];
  const mi = layers.findIndex((l) => l.name === 'middleground' || l.id === 'middleground');
  const mz = layers[mi]?.z ?? mi;
  const out = [];
  layers.forEach((layer, li) => {
    const isMg = li === mi;
    if (!isMg && !((layer.z ?? li) > mz)) return;
    const lw = Number(layer.w) || W;
    const lh = Number(layer.h) || H;
    const drift = !isMg && (lw !== W || lh !== H) ? { sw: W, sh: H, lw, lh } : null;
    (layer.decos || []).forEach((d, order) => {
      if (!Number.isFinite(d?.x) || !Number.isFinite(d?.y) || d.hidden || HOLE_SPRITE.test(d.sprite || '')) return;
      if (FRONT_SEE_THROUGH.test(String(d.sprite || ''))) return;
      out.push({ d, x: isMg ? d.x - b.l : d.x, y: isMg ? d.y - b.t : d.y, mg: isMg, z: Number(d.z) || 0, order, drift });
    });
  });
  return out;
}

/** The opening's sample points: a 5 x 5 grid over the middle 70% of the opening, inside its ellipse. */
function samplePoints(hole) {
  const pts = [];
  for (const a of [-1, -0.5, 0, 0.5, 1]) {
    for (const c of [-1, -0.5, 0, 0.5, 1]) {
      if (a * a + c * c > 1.01) continue;
      pts.push([hole.cx + a * hole.ex * 0.7, hole.cy + c * hole.ey * 0.7]);
    }
  }
  return pts;
}

/** The decos that may cover a hole (drawn after it, their turned box over its opening). */
function holeCovers(hole, covers) {
  return covers.filter((c) => {
    if (c.mg && (c.z < hole.z || (c.z === hole.z && c.order <= hole.order))) return false;
    const dx = c.drift ? frontDrift(c.drift, { x: hole.cx, y: hole.cy }) : { x: 0, y: 0 };
    const o = decoOpening(c.d, c.x + dx.x, c.y + dx.y);
    return Math.abs(o.cx - hole.cx) < o.ex + hole.ex && Math.abs(o.cy - hole.cy) < o.ey + hole.ey;
  });
}

/** PURE (masks given): the share of a hole's opening that the art drawn over it covers. */
export function holeCoverShare(hole, covers, masks) {
  const over = holeCovers(hole, covers);
  if (!over.length) return 0;
  const pts = samplePoints(hole);
  let hit = 0;
  for (const [px, py] of pts) {
    if (over.some((c) => {
      const dx = c.drift ? frontDrift(c.drift, { x: hole.cx, y: hole.cy }) : { x: 0, y: 0 };
      const mask = Object.prototype.hasOwnProperty.call(masks, c.d.sprite) ? masks[c.d.sprite] : undefined;
      return decoCovers(c.d, c.x + dx.x, c.y + dx.y, mask, px, py);
    })) hit += 1;
  }
  return hit / pts.length;
}

/**
 * PURE: the measured rows, then seats in the holes none of them sits in, as many as `want` allows:
 * open holes (cover under COVER_BAR) left to right, then the covered ones, least covered first, the
 * chosen ones written left to right. A seat within SEAT_GAP of a sack already placed is skipped. holes: streetHoles rows, each with a
 * `cover` share (0 when not given).
 */
export function seatInHoles(measured, holes, want) {
  const rows = measured.slice(0, want).map((r) => [...r]);
  const placed = rows.map(sackCentre);
  const free = holes.filter((h) => !measured.some((r) => inHole(h, sackCentre(r))));
  const order = [...free].sort((a, c) => {
    const ca = (a.cover || 0) >= COVER_BAR;
    const cc = (c.cover || 0) >= COVER_BAR;
    if (ca !== cc) return ca ? 1 : -1;
    if (ca && (a.cover || 0) !== (c.cover || 0)) return (a.cover || 0) - (c.cover || 0);
    return a.cx - c.cx || a.cy - c.cy;
  });
  // Chosen open holes first, then covered ones; written left to right (jellisac:<i> by place, as before).
  const chosen = [];
  for (const h of order) {
    if (rows.length + chosen.length >= want) break;
    const c = [h.cx, h.cy + HOLE_DROP[h.sprite]];
    if (placed.some(([px, py]) => Math.hypot(px - c[0], py - c[1]) < SEAT_GAP)) continue;
    chosen.push(h);
    placed.push(c);
  }
  chosen.sort((a, c) => a.cx - c.cx || a.cy - c.cy).forEach((h, n) => {
    const v = HOLE_VARIANTS[n % HOLE_VARIANTS.length];
    rows.push([...holeSeat(h, v), v]);
  });
  return rows;
}

/** The streets this file seats Jellisacs on: [tsid, wanted count, measured rows]. */
function holeStreets(ecology, index) {
  const out = [];
  for (const [tsid, row] of Object.entries(ecology).sort(([a], [b]) => a.localeCompare(b))) {
    const want = Number(row?.counts?.jellisac) || 0;
    if (!want || !index[tsid]) continue;
    let measured = [];
    for (const alias of streetEcologyAliases(tsid)) {
      if (JELLISAC_SPOTS[alias]?.length) { measured = JELLISAC_SPOTS[alias]; break; }
    }
    if (measured.length >= want) continue;
    out.push([tsid, want, measured]);
  }
  return out;
}

/** G939: the sprites of every deco drawn over a hollow on the streets this file seats. */
export function holeMaskSprites() {
  const ecology = read('public/assets/content/street-ecology.json').streets;
  const index = read('public/assets/streets/index.json').streets;
  const names = new Set();
  for (const [tsid] of holeStreets(ecology, index)) {
    const street = read(`public/${index[tsid].file}`);
    const covers = coverDecos(street);
    for (const h of streetHoles(street)) for (const c of holeCovers(h, covers)) names.add(c.d.sprite);
  }
  return [...names].sort();
}

/** Measure each mask as tools/build-barnacle-wall-spots.mjs does (3 px cells, at most 64 a side). */
function measureMasks() {
  const available = new Set(read('public/assets/decos/manifest.json'));
  const out = {};
  for (const name of holeMaskSprites()) {
    const art = available.has(name) ? name : DECO_TWINS[name];
    const file = art && join(root, 'public/assets/decos/groddle', `${art}.webp`);
    if (!file || !existsSync(file)) {
      out[name] = null;
      continue;
    }
    const [iw, ih] = execFileSync('magick', ['identify', '-format', '%w %h', file], { encoding: 'utf8' }).trim().split(' ').map(Number);
    const w = Math.max(1, Math.min(64, Math.ceil(iw / 3)));
    const h = Math.max(1, Math.min(64, Math.ceil(ih / 3)));
    const raw = execFileSync('magick', [file, '-alpha', 'extract', '-filter', 'box', '-resize', `${w}x${h}!`, '-depth', '8', 'gray:-']);
    const bytes = Buffer.alloc(Math.ceil((w * h) / 8));
    for (let i = 0; i < w * h; i += 1) if (raw[i] >= 128) bytes[i >> 3] |= 1 << (7 - (i & 7));
    out[name] = { w, h, d: bytes.toString('base64') };
  }
  return out;
}

export function buildJellisacHoleSpots({ masks = existsSync(join(root, MASKS)) ? read(MASKS).masks : {} } = {}) {
  const ecology = read('public/assets/content/street-ecology.json').streets;
  const index = read('public/assets/streets/index.json').streets;
  const spots = {};
  const tally = { streets: 0, holes: 0, covered: 0 };
  const unmeasured = new Set();
  for (const [tsid, want, measured] of holeStreets(ecology, index)) {
    const street = read(`public/${index[tsid].file}`);
    const covers = coverDecos(street);
    const holes = streetHoles(street).map((h) => {
      for (const c of holeCovers(h, covers)) if (!Object.prototype.hasOwnProperty.call(masks, c.d.sprite)) unmeasured.add(c.d.sprite);
      return { ...h, cover: holeCoverShare(h, covers, masks) };
    });
    const rows = seatInHoles(measured, holes, want);
    if (rows.length === Math.min(measured.length, want)) continue;
    spots[tsid] = rows;
    tally.streets += 1;
    tally.holes += rows.length - measured.length;
    for (const [x, y, v] of rows.slice(measured.length)) {
      const h = holes.find((k) => inHole(k, sackCentre([x, y, v])));
      if (h && h.cover >= COVER_BAR) tally.covered += 1;
    }
  }
  const lines = Object.entries(spots).map(([tsid, list]) => `  ${tsid}: Object.freeze([${list.map((r) => `[${r.join(', ')}]`).join(', ')}]),`);
  const text = `// Generated by tools/build-jellisac-hole-spots.mjs: never edit by hand.
/**
 * G933 (#453, #460), G939: the Jellisacs of streets whose location file names more than the snaps
 * measured: [x, y, jellySack variant] in street px (the frame cell's bottom centre), the measured
 * rows (node-spots-data.js JELLISAC_SPOTS) first, then the street's empty middleground hollows
 * (ground_cutaway_hollow1-3, each sack on its turned opening's centre), open ones before those art
 * covers. street-ecology.js MEASURED_NODE_SPOTS reads them over JELLISAC_SPOTS; any Jellisac still
 * without a spot is planned on a floor.
 */
export const JELLISAC_HOLE_SPOTS = Object.freeze({
${lines.join('\n')}
});
`;
  return { text, spots, tally, unmeasured: [...unmeasured].sort() };
}

function main() {
  const check = process.argv.includes('--check');
  if (process.argv.includes('--measure')) {
    const masks = measureMasks();
    const about = 'G939: alpha masks of the decos drawn over a ground cutaway hollow on the streets tools/build-jellisac-hole-spots.mjs seats Jellisacs on. Generated by node tools/build-jellisac-hole-spots.mjs --measure from public/assets/decos/groddle; do not edit by hand. { [sprite]: { w, h, d } }: w x h cells, d base64 bits row-major (1 = drawn); null = no art.';
    const rows = Object.entries(masks).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
    writeFileSync(join(root, MASKS), `{"about":${JSON.stringify(about)},\n"masks":{\n${rows.join(',\n')}\n}}\n`);
    console.log(`${MASKS}: ${Object.keys(masks).length} decos`);
  }
  const { text, tally, unmeasured } = buildJellisacHoleSpots();
  const out = join(root, OUT);
  let before = '';
  try { before = readFileSync(out, 'utf8'); } catch { /* new */ }
  const summary = `${tally.streets} streets, ${tally.holes} Jellisacs seated in empty holes (${tally.covered} in a hole art covers)`;
  if (unmeasured.length) console.error(`decos with no mask (run node tools/build-jellisac-hole-spots.mjs --measure): ${unmeasured.join(', ')}`);
  if (check) {
    if (before !== text || unmeasured.length) {
      if (before !== text) console.error(`${OUT} is stale: run node tools/build-jellisac-hole-spots.mjs`);
      process.exit(1);
    }
    console.log(`jellisac hole spots are current: ${summary}`);
    return;
  }
  if (before !== text) writeFileSync(out, text);
  console.log(`${OUT}: ${summary}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
