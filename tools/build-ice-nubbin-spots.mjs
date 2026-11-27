#!/usr/bin/env node
/**
 * G1323 (#725): a spot on an icy wall for every Ice Nubbin the location files name (144 on the 17
 * Nottis streets, 166 on Drifa's 15). Glitch set them by hand (ice_knob.js obey_physics false) and the files only count
 * them, so the planner stood them on the path. For each street whose file names Ice Nubbins
 * (street-ecology.json counts.ice_knob) it takes the spots measured on pictures of the street
 * (assets/content/ice-nubbin-picture-spots.json, each row citing its pictures) and places the rest on
 * the street's own snow skirts by js/ice-nubbin-walls.js. Writes public/js/ice-nubbin-spots-data.js,
 * which street-ecology.js MEASURED_NODE_SPOTS reads, so every nubbin is drawn wall-mounted, keyed
 * ice_knob:<i> left to right, the same in solo and in the realtime server's data
 * (tools/build-realtime-objects.mjs).
 *
 * The rule reads the art's masks (tools/ice-nubbin-wall-masks.json: each deco these streets draw in
 * their street-sized layers, its alpha on a grid of at most MASK_MAX cells a side, measured from
 * public/assets/decos/groddle/<art>.webp with ImageMagick by --measure).
 *
 *   node tools/build-ice-nubbin-spots.mjs            write
 *   node tools/build-ice-nubbin-spots.mjs --check    exit 1 if stale, a street is short, a spot is out of reach or a mask is missing
 *   node tools/build-ice-nubbin-spots.mjs --measure  measure the masks again (needs ImageMagick), then write
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iceMaskSprites, iceNubbinReach, iceNubbinWallSpots } from '../public/js/ice-nubbin-walls.js?v=9f0ee47c';
import { DECO_TWINS } from '../public/js/street-render.js?v=a175beef';
import { ecologyForStreet, populationForStreet, setStreetEcologyCatalog, streetReservedSpots } from '../public/js/street-ecology.js?v=da5177b2';
import { fixedPictureBoxes } from './build-barnacle-wall-spots.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'public/js/ice-nubbin-spots-data.js';
const MASKS = 'tools/ice-nubbin-wall-masks.json';
const PICTURES = 'public/assets/content/ice-nubbin-picture-spots.json';
/** A mask's cells a side at most; else one cell per MASK_CELL px of the art. */
export const MASK_MAX = 64;
const MASK_CELL = 3;
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

/** A rule spot's knob variant, in the measured mix (19 on the pictures: knob1 5, knob2 5, knob3 6, knob4 3). */
export const RULE_VARIANTS = Object.freeze([3, 1, 2, 3, 1, 2, 4, 1, 3, 2, 4, 3, 1, 2]);

/**
 * The two places whose files name Ice Nubbins: Nottis (hub 137, 17 streets, 144 nubbins), the streets
 * #725 is about, and Drifa (hub 141, 15 streets, 166), set on their walls by the same rule (Austin,
 * 2026-11-27).
 */
export const NOTTIS_HUB = '137';
export const DRIFA_HUB = '141';
export const NUBBIN_HUBS = Object.freeze([NOTTIS_HUB, DRIFA_HUB]);

/** The streets whose file names Ice Nubbins: [tsid, wanted count]. */
export function nubbinStreets(ecology = read('public/assets/content/street-ecology.json').streets, index = read('public/assets/streets/index.json').streets) {
  return Object.entries(ecology)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tsid, row]) => [tsid, Number(row?.counts?.ice_knob) || 0])
    .filter(([tsid, want]) => want && NUBBIN_HUBS.includes(index[tsid]?.hubId));
}

/** Measure the alpha mask of every deco the streets draw in their street-sized layers (null: no art). */
export function measureMasks() {
  const index = read('public/assets/streets/index.json').streets;
  const available = new Set(read('public/assets/decos/manifest.json'));
  const names = new Set();
  for (const [tsid] of nubbinStreets(undefined, index)) for (const n of iceMaskSprites(read(`public/${index[tsid].file}`))) names.add(n);
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
 * The keep-clear spots the rule keeps off: the street's own, less the nubbins' covers (which this file
 * feeds) and the front art boxes (the rule reads the street-sized front art by its masks; a sliding
 * foreground moves over a wall as the camera does, as it did over Glitch's nubbins).
 */
export function nubbinReserved(tsid, street) {
  return [
    ...streetReservedSpots(street).filter((r) => !r.pen && !r.front && !String(r.key || '').startsWith('node:ice_knob:')),
    ...fixedPictureBoxes(populationForStreet(tsid, ecologyForStreet(tsid))),
  ];
}

export function buildIceNubbinSpots({ masks = read(MASKS).masks } = {}) {
  const catalog = read('public/assets/content/street-ecology.json');
  const pictures = read(PICTURES).streets;
  const index = read('public/assets/streets/index.json').streets;
  setStreetEcologyCatalog(catalog);
  const spots = {};
  const short = [];
  const unreachable = [];
  const unmeasured = new Set();
  const tally = { streets: 0, picture: 0, rule: 0, high: 0, tiers: {} };
  for (const [tsid, want] of nubbinStreets(catalog.streets, index)) {
    const street = read(`public/${index[tsid].file}`);
    for (const n of iceMaskSprites(street)) if (!Object.prototype.hasOwnProperty.call(masks, n)) unmeasured.add(n);
    const seen = (pictures[tsid]?.spots || []).slice(0, want).map(([x, y, v]) => [x, y, v, 0]);
    const rule = iceNubbinWallSpots(street, want - seen.length, { reserved: nubbinReserved(tsid, street), keep: seen.map(([x, y]) => ({ x, y })), masks });
    const rows = [...seen, ...rule.map((s, i) => [s.x, s.y, RULE_VARIANTS[i % RULE_VARIANTS.length], s.tier])]
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (rows.length < want) short.push(`${index[tsid].label} (${tsid}): ${rows.length} of ${want}`);
    for (const [x, y] of rows) {
      const r = iceNubbinReach(street, x, y);
      if (!r?.reachable) unreachable.push(`${index[tsid].label} ${x},${y}: ${JSON.stringify(r)}`);
      if (r?.jump) tally.high += 1;
    }
    spots[tsid] = rows;
    tally.streets += 1;
    tally.picture += seen.length;
    tally.rule += rule.length;
    for (const s of rule) tally.tiers[s.tier] = (tally.tiers[s.tier] || 0) + 1;
  }
  const lines = Object.entries(spots).map(([tsid, list]) => `  ${tsid}: Object.freeze([${list.map((r) => `[${r.join(', ')}]`).join(', ')}]),`);
  const text = `// Generated by tools/build-ice-nubbin-spots.mjs: never edit by hand.
/**
 * G1323 (#725): Ice Nubbin spots on the icy walls, left to right (ice_knob:<i> is the i-th):
 * [x, y, knob, tier] in street px (0, 0 = the street's top left; x, y the frame cell's bottom centre).
 * tier 0 measured on a picture (assets/content/ice-nubbin-picture-spots.json cites it), 1 a snow
 * skirt, 2 a rock cliff (js/ice-nubbin-walls.js). street-ecology.js MEASURED_NODE_SPOTS reads them.
 */
export const ICE_NUBBIN_SPOTS = Object.freeze({
${lines.join('\n')}
});
`;
  return { text, spots, short, unreachable, tally, unmeasured: [...unmeasured].sort() };
}

function main() {
  const check = process.argv.includes('--check');
  if (process.argv.includes('--measure')) {
    const masks = measureMasks();
    const about = 'G1323: alpha masks of the decos the Ice Nubbin wall rule reads (js/ice-nubbin-walls.js). Generated by node tools/build-ice-nubbin-spots.mjs --measure from public/assets/decos/groddle; do not edit by hand. { [sprite]: { w, h, d } }: w x h cells, d base64 bits row-major (1 = drawn); null = no art.';
    const rows = Object.entries(masks).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
    writeFileSync(join(root, MASKS), `{"about":${JSON.stringify(about)},\n"masks":{\n${rows.join(',\n')}\n}}\n`);
    console.log(`${MASKS}: ${Object.keys(masks).length} decos`);
  }
  const { text, short, unreachable, tally, unmeasured } = buildIceNubbinSpots();
  const out = join(root, OUT);
  let before = '';
  try { before = readFileSync(out, 'utf8'); } catch { /* new */ }
  if (short.length) console.error(`streets short of their count: ${short.join('; ')}`);
  if (unreachable.length) console.error(`nubbins out of reach: ${unreachable.join('; ')}`);
  if (unmeasured.length) console.error(`decos with no mask (run node tools/build-ice-nubbin-spots.mjs --measure): ${unmeasured.join(', ')}`);
  const summary = `${tally.streets} streets, ${tally.picture} nubbins measured on pictures, ${tally.rule} by the wall rule (tiers ${JSON.stringify(tally.tiers)}), ${tally.high} high enough to jump for`;
  const bad = short.length || unreachable.length || unmeasured.length;
  if (check) {
    if (before !== text || bad) {
      console.error(`${OUT} is stale or failing: run node tools/build-ice-nubbin-spots.mjs`);
      process.exit(1);
    }
    console.log(`ice nubbin spots are current: ${summary}`);
    return;
  }
  if (before !== text) writeFileSync(out, text);
  console.log(`${OUT}: ${summary}`);
  if (bad) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
