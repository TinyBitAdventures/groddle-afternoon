#!/usr/bin/env node
/**
 * #731, #574: the alpha masks of the front decos drawn over a planned Visiting Stone's dead end
 * (street-furniture.js stoneDeadEndZone), so the planner can tell a stone behind bare branches (seen,
 * as East Spice's stood in Glitch) from one behind a trunk (Puckell Peck's conifer):
 * street-ecology.js frontArtShare. Each mask is the art street-render.js draws for the name
 * (DECO_TWINS when the manifest lacks it; null when there is no art), measured from
 * public/assets/decos/groddle/<art>.webp with ImageMagick on a grid of at most MASK_MAX cells a side,
 * a cell set where its alpha is over half. Writes public/js/stone-front-masks-data.js.
 *
 *   node tools/build-stone-front-masks.mjs           measure (needs ImageMagick) and write
 *   node tools/build-stone-front-masks.mjs --check   exit 1 when a deco over a dead end has no mask or one is left over
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECO_TWINS } from '../public/js/street-render.js?v=a175beef';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=10376267';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import {
  ecologyForStreet, frontDecoCovers, hiddenBehindFront, planStreetPlacements, populationForStreet,
  setStreetEcologyCatalog, streetReservedSpots,
} from '../public/js/street-ecology.js?v=dde3c62d';
import { FURNITURE_GROUPS, stoneDeadEndZone } from '../public/js/street-furniture.js?v=071203fc';
import { STONE_SPOTS } from '../public/js/stone-spots-data.js?v=3373caf6';
import { creatureRequests, setCreatureEcology } from './build-realtime-objects.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'public/js/stone-front-masks-data.js';
/** A mask's cells a side at most; else one cell per MASK_CELL px of the art. */
export const MASK_MAX = 64;
const MASK_CELL = 3;
/** How far past a dead end a front deco may stand and still be drawn over it (a sliding layer's drift). */
const ZONE_MARGIN = 600;
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

/**
 * The streets whose planned Visiting Stone is behind the front art's boxes with no spot in its dead
 * end the boxes leave clear (the ones frontArtShare decides, street-ecology.js reseatHiddenNodes), and
 * the sprites of the front decos over those dead ends: { streets: [tsid], sprites: [name] }.
 */
export async function stoneFrontSprites() {
  const catalog = read('public/assets/content/street-ecology.json');
  const indexJson = read('public/assets/streets/index.json');
  const index = indexJson.streets;
  setZoneStreetsShown(false);
  applyStreetIndex(indexJson);
  setStreetEcologyCatalog(catalog);
  setCreatureEcology(catalog);
  const key = FURNITURE_GROUPS.visiting_stone.key;
  const names = new Set();
  const streets = [];
  for (const [rowTsid, row] of Object.entries(catalog.furniture).sort(([a], [b]) => a.localeCompare(b))) {
    if (!row?.visiting_stone) continue;
    const tsid = `G${rowTsid.slice(1)}`;
    if (!index[tsid] || STONE_SPOTS[tsid]) continue;
    const street = await loadStreetDataFromFs(tsid, join(root, 'public/assets/streets'));
    const zone = stoneDeadEndZone(street);
    if (!zone) continue;
    const fronts = frontDecoCovers(street);
    const pop = populationForStreet(tsid, ecologyForStreet(tsid), { starter: tsid === indexJson.default });
    const plan = (reseat) => planStreetPlacements(platformsScreen(street), creatureRequests(pop, street, catalog), {
      worldW: streetWidth(street), seed: tsid, reserved: streetReservedSpots(street), reseat,
    });
    const planned = plan(false).groups[key]?.[0];
    if (!planned || !hiddenBehindFront(planned, key, fronts)) continue;
    // Moved by the boxes' rule (no `share`): a spot there the boxes leave clear.
    if (plan(true).moved.some((m) => m.key === key && m.share == null)) continue;
    streets.push(tsid);
    for (const f of fronts) {
      if (f.block.r < zone.lo - ZONE_MARGIN || f.block.l > zone.hi + ZONE_MARGIN) continue;
      if (f.art?.sprite) names.add(f.art.sprite);
    }
  }
  return { streets, sprites: [...names].sort() };
}

function measure(names) {
  const available = new Set(read('public/assets/decos/manifest.json'));
  const out = {};
  for (const name of names) {
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

function render(masks) {
  const rows = Object.entries(masks).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  return `// Generated by tools/build-stone-front-masks.mjs: never edit by hand.
/**
 * #731, #574: alpha masks of the front decos over the planned Visiting Stones' dead ends, for
 * street-ecology.js frontArtShare. { [sprite]: { w, h, d } | null }: w x h cells, d base64 bits
 * row-major (1 = the art's alpha is over half there); null = no art.
 */
export const STONE_FRONT_MASKS = Object.freeze({
${rows.join('\n')}
});
`;
}

async function main() {
  const { streets, sprites: names } = await stoneFrontSprites();
  if (process.argv.includes('--check')) {
    const { STONE_FRONT_MASKS } = await import(join(root, OUT));
    const have = Object.keys(STONE_FRONT_MASKS).sort();
    if (JSON.stringify(have) !== JSON.stringify(names)) {
      const missing = names.filter((n) => !have.includes(n));
      const extra = have.filter((n) => !names.includes(n));
      console.error(`${OUT} is stale: missing ${missing.join(', ') || 'none'}; left over ${extra.join(', ') || 'none'} (run node tools/build-stone-front-masks.mjs)`);
      process.exit(1);
    }
    console.log(`${OUT} is current (${names.length} masks, ${streets.length} streets)`);
    return;
  }
  writeFileSync(join(root, OUT), render(measure(names)));
  console.log(`wrote ${OUT} (${names.length} masks, ${streets.length} streets: ${streets.join(' ')})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
