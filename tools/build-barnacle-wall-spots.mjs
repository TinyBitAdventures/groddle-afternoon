#!/usr/bin/env node
/**
 * G916 (#446): a spot for every Mortar Barnacle on the streets no full-street snap covers.
 * For each street whose location file names barnacles (street-ecology.json counts.mortar_barnacle)
 * and that has no row in barnacle-spots.json (tools/snap-placements/barnacles.py), it takes the
 * spots measured on other pictures of the street (assets/content/barnacle-picture-spots.json: video
 * frames and photos registered on the street, each row citing its pictures) and places the rest on
 * the street's own walls by js/barnacle-walls.js. Writes public/js/barnacle-wall-spots-data.js,
 * which street-ecology.js MEASURED_NODE_SPOTS reads beside BARNACLE_SPOTS, so every barnacle the
 * file names is drawn wall-mounted, keyed mortar_barnacle:<i> left to right.
 *
 *
 * G998 (#489): a street the snaps cover but whose file names more barnacles than they showed (5
 * streets, one each) had the rest planned on a floor. Those leftovers go on its walls by the same
 * rule now (after any spot read on a picture of it), written as BARNACLE_LEFTOVER_SPOTS: the
 * measured spots keep mortar_barnacle:0..n-1 and the leftovers follow, left to right.
 *
 * G936: the rule reads the art's masks (tools/barnacle-wall-masks.json: each wall and ground deco these
 * streets draw, its alpha on a grid of at most MASK_MAX cells a side, measured from
 * public/assets/decos/groddle/<art>.webp with ImageMagick by --measure), so a spot sits on a wall's
 * drawn art under no ground art; a row's fifth field is 1 when the barnacle is drawn mirrored.
 *
 *   node tools/build-barnacle-wall-spots.mjs            write
 *   node tools/build-barnacle-wall-spots.mjs --check    exit 1 if stale, a street is short or a mask is missing
 *   node tools/build-barnacle-wall-spots.mjs --measure  measure the masks again (needs ImageMagick), then write
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BARNACLE_VARIANT_FACES, barnacleMaskSprites, barnacleWallSpots } from '../public/js/barnacle-walls.js?v=75e568c3';
import { DECO_TWINS } from '../public/js/street-render.js?v=cd2b2649';
import { nudgedBarnacleSpots } from '../public/js/barnacle-nudges.js?v=159f11bf';
import {
  ecologyForStreet,
  populationForStreet,
  rockPlacementRequest,
  setStreetEcologyCatalog,
  shrinePlacementRequest,
  streetReservedSpots,
  treePlacementRequest,
} from '../public/js/street-ecology.js?v=f1c11a2d';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'public/js/barnacle-wall-spots-data.js';
const MASKS = 'tools/barnacle-wall-masks.json';
/** A mask's cells a side at most; else one cell per MASK_CELL px of the art. */
export const MASK_MAX = 64;
const MASK_CELL = 3;
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

/** The streets this file places barnacles on: [tsid, street row, wanted count]. */
function builderStreets(ecology, snapped, index) {
  return Object.entries(ecology)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tsid, row]) => [tsid, Number(row?.counts?.mortar_barnacle) || 0])
    .filter(([tsid, want]) => want && !snapped[tsid]?.length && index[tsid]);
}

/** G998: the snapped streets whose file names more barnacles than the snaps showed: [tsid, wanted count]. */
function leftoverStreets(ecology, snapped, index) {
  return Object.entries(ecology)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tsid, row]) => [tsid, Number(row?.counts?.mortar_barnacle) || 0])
    .filter(([tsid, want]) => snapped[tsid]?.length && want > snapped[tsid].length && index[tsid]);
}

/**
 * G936: measure the alpha mask of every wall and ground deco the builder's streets draw (the art
 * street-render.js draws for the name: DECO_TWINS when the manifest lacks it; null when there is no art).
 * { [sprite]: { w, h, d } }: w x h cells, d base64 bits row-major, 1 where the cell is mostly drawn.
 */
export function measureMasks() {
  const ecology = read('public/assets/content/street-ecology.json').streets;
  const snapped = read('public/assets/content/barnacle-spots.json').streets;
  const index = read('public/assets/streets/index.json').streets;
  const available = new Set(read('public/assets/decos/manifest.json'));
  const names = new Set();
  for (const [tsid] of [...builderStreets(ecology, snapped, index), ...leftoverStreets(ecology, snapped, index)]) {
    for (const n of barnacleMaskSprites(read(`public/${index[tsid].file}`))) names.add(n);
  }
  const out = {};
  for (const name of [...names].sort()) {
    const art = available.has(name) ? name : DECO_TWINS[name];
    const file = art && join(root, 'public/assets/decos/groddle', `${art}.webp`);
    if (!file || !existsSync(file)) {
      out[name] = null;
      continue;
    }
    const [iw, ih] = execFileSync('magick', ['identify', '-format', '%w %h', file], { encoding: 'utf8' }).trim().split(' ').map(Number);
    const w = Math.max(1, Math.min(MASK_MAX, Math.ceil(iw / MASK_CELL)));
    const h = Math.max(1, Math.min(MASK_MAX, Math.ceil(ih / MASK_CELL)));
    const raw = execFileSync('magick', [file, '-alpha', 'extract', '-filter', 'box', '-resize', `${w}x${h}!`, '-depth', '8', 'gray:-']);
    const bytes = Buffer.alloc(Math.ceil((w * h) / 8));
    for (let i = 0; i < w * h; i += 1) if (raw[i] >= 128) bytes[i >> 3] |= 1 << (7 - (i & 7));
    out[name] = { w, h, d: bytes.toString('base64') };
  }
  return out;
}

/**
 * PURE: the things the planner seats where a picture shows them (trees, the shrine, rocks: the
 * `fixed` points of their requests, which planStreetPlacements seats before anything else), as
 * keep-clear boxes, so a barnacle the rule places never lands on one (the picture's spot wins).
 */
export function fixedPictureBoxes(population) {
  const out = [];
  for (const req of [treePlacementRequest(population), shrinePlacementRequest(population), rockPlacementRequest(population)]) {
    for (const f of req?.fixed || []) {
      if (!Number.isFinite(f?.x) || !Number.isFinite(f?.y)) continue;
      const w = Number(f.w) || 100;
      const h = Number(f.h) || 120;
      out.push({ x: f.x, y: f.y, key: `fixed:${req.key}`, block: { l: f.x - w / 2, r: f.x + w / 2, t: f.y - h, b: f.y } });
    }
  }
  return out;
}

/** A rule spot's blister variant, in the measured mix (101 of 201 are blister1, 55 blister2, 22 blister4...). */
export const RULE_VARIANTS = Object.freeze([1, 2, 1, 4, 1, 2, 1, 3, 1, 2, 6, 1, 4, 2, 5]);

export function buildBarnacleWallSpots({ masks = read(MASKS).masks } = {}) {
  const catalog = read('public/assets/content/street-ecology.json');
  const ecology = catalog.streets;
  const snapped = read('public/assets/content/barnacle-spots.json').streets;
  const pictures = read('public/assets/content/barnacle-picture-spots.json').streets;
  const index = read('public/assets/streets/index.json').streets;
  setStreetEcologyCatalog(catalog);
  const spots = {};
  const short = [];
  const unmeasured = new Set();
  const tally = { picture: 0, rule: 0, streets: 0, pictured: 0, tiers: {}, mirrored: 0 };
  const measuredSpots = nudgedBarnacleSpots(snapped);
  const leftovers = {};
  /** The rows for `want` barnacles on a street past the `measured` ones its snaps show. */
  const place = (tsid, want, measured = []) => {
    const street = read(`public/${index[tsid].file}`);
    for (const n of barnacleMaskSprites(street)) if (!Object.prototype.hasOwnProperty.call(masks, n)) unmeasured.add(n);
    const seen = (pictures[tsid]?.spots || []).slice(0, want - measured.length).map(([x, y, v]) => [x, y, v, 0]);
    // The street's keep-clear spots, less the barnacles' own covers (which this file feeds).
    const reserved = [
      // Pen and fence art (penArtCovers, #575) only ranks garden beds.
      ...streetReservedSpots(street).filter((r) => !r.pen && !String(r.key || '').startsWith('node:mortar_barnacle:')),
      ...fixedPictureBoxes(populationForStreet(tsid, ecologyForStreet(tsid))),
    ];
    const keep = [...measured, ...seen].map(([x, y]) => ({ x, y }));
    const rule = barnacleWallSpots(street, want - measured.length - seen.length, { reserved, keep, masks });
    // A spot that should face one way is mirrored when its variant's art faces the other (G936).
    const ruleRows = rule.map((s, i) => {
      const v = RULE_VARIANTS[i % RULE_VARIANTS.length];
      const mirror = Boolean(s.face) && s.face !== BARNACLE_VARIANT_FACES[v];
      return [s.x, s.y, v, s.tier, ...(mirror ? [1] : [])];
    });
    const rows = [...seen, ...ruleRows]
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (measured.length + rows.length < want) short.push(`${index[tsid].label} (${tsid}): ${measured.length + rows.length} of ${want}`);
    tally.streets += 1;
    if (seen.length) tally.pictured += 1;
    tally.picture += seen.length;
    tally.rule += rule.length;
    for (const s of rule) tally.tiers[s.tier] = (tally.tiers[s.tier] || 0) + 1;
    tally.mirrored += ruleRows.filter((r) => r[4] === 1).length;
    return rows;
  };
  for (const [tsid, want] of builderStreets(ecology, snapped, index)) spots[tsid] = place(tsid, want);
  // G998: a snapped street's leftovers on its walls too, after the spots its snaps measured.
  for (const [tsid, want] of leftoverStreets(ecology, snapped, index)) leftovers[tsid] = place(tsid, want, measuredSpots[tsid]);
  const row = ([tsid, list]) => `  ${tsid}: Object.freeze([${list.map((r) => `[${r.join(', ')}]`).join(', ')}]),`;
  const lines = Object.entries(spots).map(row);
  const leftoverLines = Object.entries(leftovers).map(row);
  const text = `// Generated by tools/build-barnacle-wall-spots.mjs: never edit by hand.
/**
 * G916 (#446): Mortar Barnacle spots for the streets no full-street snap covers, left to right
 * (mortar_barnacle:<i> is the i-th): [x, y, blister, tier] in street px (0, 0 = the street's top
 * left; x, y the art's bottom centre, as barnacle-spots.json). tier 0 measured on a picture
 * (assets/content/barnacle-picture-spots.json cites it), 1 a wall of the kinds the measured streets
 * use, 2 another big deco, 3 a ledge's underside, 4 the floor (js/barnacle-walls.js). G936: a fifth
 * field 1 draws the barnacle mirrored (it faces outward on a round wall's right part).
 * street-ecology.js MEASURED_NODE_SPOTS reads them beside BARNACLE_SPOTS.
 */
export const BARNACLE_WALL_SPOTS = Object.freeze({
${lines.join('\n')}
});

/**
 * G998 (#489): the barnacles a snapped street's file names past those its snaps show (barnacle-spots.json),
 * on its walls by the same rule (or tier 0, read on a picture of it: barnacle-picture-spots.json cites it).
 * street-ecology.js MEASURED_NODE_SPOTS puts them after the measured spots, so those keep their keys.
 */
export const BARNACLE_LEFTOVER_SPOTS = Object.freeze({
${leftoverLines.join('\n')}
});
`;
  return { text, spots, leftovers, short, tally, unmeasured: [...unmeasured].sort() };
}

function main() {
  const check = process.argv.includes('--check');
  if (process.argv.includes('--measure')) {
    const masks = measureMasks();
    const about = 'G936: alpha masks of the wall and ground decos the barnacle wall rule reads (js/barnacle-walls.js). Generated by node tools/build-barnacle-wall-spots.mjs --measure from public/assets/decos/groddle; do not edit by hand. { [sprite]: { w, h, d } }: w x h cells, d base64 bits row-major (1 = drawn); null = no art.';
    const rows = Object.entries(masks).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
    const text = `{"about":${JSON.stringify(about)},\n"masks":{\n${rows.join(',\n')}\n}}\n`;
    writeFileSync(join(root, MASKS), text);
    console.log(`${MASKS}: ${Object.keys(masks).length} decos`);
  }
  const { text, short, tally, unmeasured } = buildBarnacleWallSpots();
  const out = join(root, OUT);
  let before = '';
  try { before = readFileSync(out, 'utf8'); } catch { /* new */ }
  if (short.length) console.error(`streets short of their count: ${short.join('; ')}`);
  if (unmeasured.length) console.error(`decos with no mask (run node tools/build-barnacle-wall-spots.mjs --measure): ${unmeasured.join(', ')}`);
  const summary = `${tally.streets} streets, ${tally.picture} barnacles measured on pictures (${tally.pictured} streets), ${tally.rule} by the wall rule (tiers ${JSON.stringify(tally.tiers)}, ${tally.mirrored} mirrored)`;
  if (check) {
    if (before !== text || short.length || unmeasured.length) {
      console.error(`${OUT} is stale: run node tools/build-barnacle-wall-spots.mjs`);
      process.exit(1);
    }
    console.log(`barnacle wall spots are current: ${summary}`);
    return;
  }
  if (before !== text) writeFileSync(out, text);
  console.log(`${OUT}: ${summary}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
