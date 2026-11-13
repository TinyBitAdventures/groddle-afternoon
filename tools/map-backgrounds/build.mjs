#!/usr/bin/env node
/**
 * Region map backgrounds from Tiny Speck's world-map thumbnails (G471, round 5, Austin approved
 * "build the upscaled thumbnails as map backgrounds" 2026-10-31).
 *
 * Each region map (MapHub.as) was drawn over a 760 x 460 painting (the hub's `bg`, and an `fg`
 * png in front), loaded from c1/c2.glitch.bz/client_maps/. Those files are lost: no mirror and
 * no Wayback copy (public/assets/maps/art-recovery.log). Tiny Speck's CC0 world-map file
 * (glitch-overlays/world_map.fla) keeps a 150 x 91 miniature of each painting
 * (LIBRARY/z_hub_maps_small/sm_<region>.jpg, a JPEG bitmap, imported from "hub_maps_small 150";
 * no vector or larger copy exists in the FLA: its only other bitmaps are the world-map
 * backdrops). The same files are the corner thumbs the map has shown so far
 * (public/assets/maps/art/thumbs, byte for byte).
 *
 * The miniatures frame the whole painting at the map's own aspect (150 / 91 ~ 760 / 460):
 * against the 2012 encyclopedia maps (research/wayback/raw/c1-img/maps_encyclopedia, reference
 * only, never shipped) every one of the 41 regions with a copy lines up at scale 1 and offset 0
 * (grey-level correlation, a grid search of +-10% scale and +-30 px found nothing better).
 * So each one is scaled to the frame as is, then softened into a painting (RECIPE):
 *
 *   1. Mitchell to 4x (8x for Retina), then a Gaussian blur that melts the 8 px JPEG blocks of
 *      the quality-50 thumbnail (they would be 40 px tiles at full size);
 *   2. a small Kuwahara filter: flat patches with soft edges, like brush strokes;
 *   3. Lanczos to the frame (760 x 460, and 1520 x 920 for Retina), a mild unsharp mask that
 *      gives the cliffs and paths their edges back;
 *   4. a little seeded grain, the canvas texture the paintings had (and it hides the smoothness);
 *   5. WebP.
 * Tuned by eye against the Tribute Blog's Muufo and Aranna maps (posts 42806514860,
 * 40106877686) and the encyclopedia copies of the same two (reference only).
 *
 * Repainted regions (G522, Austin approved a repaint of Groddle Meadow first, 2026-11-05): a region
 * listed in tools/provenance/repainted-maps.json carries a new painting made from its thumbnail
 * (AI-generated, dedicated CC0 1.0, its provenance in that file). This builder keeps those two
 * files as they are (same names, recorded here with their hashes and `repainted`), and --check
 * fails when one differs from the provenance file. The next region is one entry there.
 * A repaint also stands for a public region with streets that has no thumbnail (G569, 2026-11-13:
 * Naraka, Ilmenskie Caverns, Ilmenskie Deeps, The Seams, painted from their street layouts): its
 * manifest row has `thumb: null` and no symbol, and its files are named for the region's letters.
 *
 * Which hub gets which: every region the world map offers (js/map-graph.js PUBLIC_HUBS) whose
 * row in assets/maps/index.json names a thumb (thumbLocal) and that has streets. The test,
 * POL and tower hubs that share a region's thumb (Old Groddle Forest, the Jethimadh Tower hubs,
 * the POL hubs) keep the plain map: the painting is of the region, not of them.
 *
 * Writes
 *   public/assets/maps/art/bg/<region>.webp, <region>@2x.webp
 *   public/assets/maps/art/bg/backgrounds.json  provenance: the FLA (sha256), each source
 *       symbol, its library path, the thumb's sha256 and import path, the recipe, each output's
 *       bytes and sha256
 *   public/js/hub-map-backgrounds.js  hub id -> { x1, x2 } for js/map-graph.js
 *
 *   node tools/map-backgrounds/build.mjs          build (needs ImageMagick 7: magick)
 *   node tools/map-backgrounds/build.mjs --check  exit 1 when the manifest, the module or a file is
 *       stale against the FLA, the map index and the recipe (no ImageMagick; tests/map-backgrounds.test.js)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXml, readZip } from '../avatar-compositor/xfl.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const spike = join(here, '../..');
const audit = join(spike, '..');
export const FLA = 'glitch-overlays/world_map.fla';
const FOLDER = 'z_hub_maps_small/';
const OUT_DIR = 'public/assets/maps/art/bg';
const MANIFEST = `${OUT_DIR}/backgrounds.json`;
const MODULE = 'public/js/hub-map-backgrounds.js';
const INDEX = 'public/assets/maps/index.json';
export const REPAINTS = 'tools/provenance/repainted-maps.json';

export const FRAME = Object.freeze([760, 460]);

/**
 * js/map-graph.js PUBLIC_HUBS, read from its text (importing the module would load the one this
 * writes).
 */
export function publicHubs() {
  const src = readFileSync(join(spike, 'public/js/map-graph.js'), 'utf8');
  const m = src.match(/export const PUBLIC_HUBS = Object\.freeze\(new Set\(\[([\s\S]*?)\]/);
  if (!m) throw new Error('js/map-graph.js: no PUBLIC_HUBS');
  return new Set(m[1].split(',').map((x) => x.trim()).filter(Boolean));
}

/** The ImageMagick steps, per density (1 = the 760 x 460 frame, 2 = Retina). */
export const RECIPE = Object.freeze({
  1: Object.freeze(['-filter', 'Mitchell', '-resize', '400%', '-blur', '0x2.5', '-kuwahara', '2',
    '-filter', 'Lanczos', '-resize', '760x460!', '-unsharp', '0x2+0.5+0',
    '-seed', '471', '-attenuate', '0.2', '+noise', 'Gaussian', '-quality', '72']),
  2: Object.freeze(['-filter', 'Mitchell', '-resize', '800%', '-blur', '0x5', '-kuwahara', '4',
    '-filter', 'Lanczos', '-resize', '1520x920!', '-unsharp', '0x4+0.5+0',
    '-seed', '471', '-attenuate', '0.2', '+noise', 'Gaussian', '-quality', '68']),
});

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const readJson = (rel) => JSON.parse(readFileSync(join(spike, rel), 'utf8'));

/** The thumbnails in the FLA: symbol -> { item, bytes, sha256, source }. */
export function readThumbs(flaPath = join(audit, FLA)) {
  const zip = readZip(flaPath);
  const doc = parseXml(zip.read('DOMDocument.xml').toString('utf8'));
  const out = new Map();
  const walk = (n) => {
    if (n.tag === 'DOMBitmapItem' && String(n.attrs.name || '').startsWith(FOLDER)) {
      const item = n.attrs.name;
      const buf = zip.read(`LIBRARY/${n.attrs.href}`);
      if (!buf) throw new Error(`${FLA}: no LIBRARY/${n.attrs.href}`);
      const symbol = basename(item).replace(/\.jpg$/i, '');
      out.set(symbol, { item: `LIBRARY/${n.attrs.href}`, buf, sha256: sha256(buf), source: n.attrs.sourceExternalFilepath || '' });
    }
    for (const c of n.children || []) walk(c);
  };
  walk(doc);
  return { thumbs: out, flaSha256: sha256(readFileSync(flaPath)) };
}

/** hub id -> its repaint's provenance (tools/provenance/repainted-maps.json `regions`). */
export function repaints() {
  return readJson(REPAINTS).regions || {};
}

/** hub id -> { hubName, symbol } for every public region with a thumb and streets. */
export function regionThumbs(index = readJson(INDEX)) {
  const out = {};
  const PUBLIC_HUBS = publicHubs();
  for (const [id, row] of Object.entries(index.hubs || {})) {
    if (!PUBLIC_HUBS.has(String(id)) || !row.thumbLocal || !(row.streetCount > 0)) continue;
    out[id] = { hubName: row.hubName, symbol: basename(row.thumbLocal).replace(/\.jpg$/i, '') };
  }
  return out;
}

/** The manifest without the outputs' hashes (what --check can work out with no ImageMagick). */
function plan() {
  const { thumbs, flaSha256 } = readThumbs();
  const regions = {};
  const seen = new Map();
  const repainted = repaints();
  for (const [hubId, { hubName, symbol }] of Object.entries(regionThumbs())) {
    const t = thumbs.get(symbol);
    if (!t) throw new Error(`hub ${hubId} ${hubName}: no ${symbol} in ${FLA}`);
    if (seen.has(symbol)) throw new Error(`${symbol}: two regions (${seen.get(symbol)}, ${hubId})`);
    seen.set(symbol, hubId);
    const key = symbol.replace(/^sm_/, '');
    const thumb = `public/assets/maps/art/thumbs/${symbol}.jpg`;
    regions[hubId] = {
      hubName,
      symbol: `${FOLDER}${symbol}`,
      item: t.item,
      sourceFile: t.source,
      sha256: t.sha256,
      thumb: thumb.replace(/^public\//, ''),
      thumbMatches: existsSync(join(spike, thumb)) && sha256(readFileSync(join(spike, thumb))) === t.sha256,
      x1: `assets/maps/art/bg/${key}.webp`,
      x2: `assets/maps/art/bg/${key}@2x.webp`,
    };
    if (repainted[hubId]) regions[hubId].repainted = REPAINTS;
  }
  const index = readJson(INDEX);
  const PUBLIC_HUBS = publicHubs();
  for (const [hubId, r] of Object.entries(repainted)) {
    if (!regions[hubId]) {
      // A region the world map never drew a thumbnail for (Naraka, the two Ilmenskies, The Seams:
      // their own paintings are lost too, G569): its repaint stands alone, made from its street
      // layout, under the region's name with the letters only (Ilmenskie Caverns, ilmenskiecaverns).
      const row = index.hubs?.[hubId];
      if (!row || !PUBLIC_HUBS.has(String(hubId)) || !(row.streetCount > 0)) throw new Error(`${REPAINTS}: hub ${hubId} is not a region with streets`);
      const key = String(row.hubName).toLowerCase().replace(/[^a-z]/g, '');
      if (Object.values(regions).some((x) => x.x1 === `assets/maps/art/bg/${key}.webp`)) throw new Error(`${REPAINTS}: hub ${hubId} ${key}: two regions`);
      regions[hubId] = { hubName: row.hubName, thumb: null, x1: `assets/maps/art/bg/${key}.webp`, x2: `assets/maps/art/bg/${key}@2x.webp`, repainted: REPAINTS };
    }
    const row = regions[hubId];
    for (const d of ['x1', 'x2']) {
      if (r[d]?.file !== row[d]) throw new Error(`${REPAINTS}: hub ${hubId} ${d} must be ${row[d]}`);
    }
  }
  return {
    note: 'Region map backgrounds upscaled from Tiny Speck\'s CC0 world-map thumbnails (G471); a region with `repainted` carries a repaint made from its thumbnail instead (G522), or, with `thumb: null`, from its street layout (a region with no thumbnail, G569), its provenance in that file. Built by tools/map-backgrounds/build.mjs; do not edit.',
    license: 'CC0 (Tiny Speck, glitch-overlays)',
    source: { fla: FLA, sha256: flaSha256, folder: `LIBRARY/${FOLDER}` },
    frame: FRAME,
    recipe: RECIPE,
    regions,
  };
}

function moduleText(manifest) {
  const rows = Object.entries(manifest.regions)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([id, r]) => `  '${id}': Object.freeze({ x1: '${r.x1}', x2: '${r.x2}'${r.repainted ? ', repainted: true' : ''}${r.thumb === null ? ', noThumb: true' : ''} }), // ${r.hubName}`);
  return `/**
 * GENERATED by tools/map-backgrounds/build.mjs; do not edit.
 * Region id -> its map background, upscaled and softened from the region's 150 x 91 thumbnail in
 * Tiny Speck's CC0 world-map file (glitch-overlays/world_map.fla, ${FOLDER}sm_*.jpg; G471):
 * x1 fills the 760 x 460 frame, x2 is the same at twice the size for Retina screens.
 * \`repainted\`: the region's painting was repainted for the remake from that thumbnail (G522,
 * provenance in tools/provenance/repainted-maps.json). \`noThumb\`: the region has no thumbnail, so
 * its repaint was made from its street layout (G569).
 * Provenance (symbol, sha256, recipe): assets/maps/art/bg/backgrounds.json.
 */
export const HUB_MAP_BACKGROUNDS = Object.freeze({
${rows.join('\n')}
});
`;
}

function render(src, dest, density) {
  execFileSync('magick', [src, ...RECIPE[density], dest]);
}

function build() {
  const manifest = plan();
  const outDir = join(spike, OUT_DIR);
  mkdirSync(outDir, { recursive: true });
  const { thumbs } = readThumbs();
  const tmp = join(outDir, '.src.jpg');
  const keep = new Set(['backgrounds.json']);
  try {
    for (const r of Object.values(manifest.regions)) {
      if (!r.repainted) writeFileSync(tmp, thumbs.get(basename(r.symbol)).buf);
      for (const d of [1, 2]) {
        const rel = r[`x${d}`];
        // A repaint is kept as it is (its provenance names how it was made).
        if (!r.repainted) render(tmp, join(spike, 'public', rel), d);
        const buf = readFileSync(join(spike, 'public', rel));
        r[`x${d}Bytes`] = buf.length;
        r[`x${d}Sha256`] = sha256(buf);
        keep.add(basename(rel));
      }
    }
  } finally {
    rmSync(tmp, { force: true });
  }
  for (const f of readdirSync(outDir)) if (!keep.has(f)) rmSync(join(outDir, f));
  writeFileSync(join(spike, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(spike, MODULE), moduleText(manifest));
  const total = Object.values(manifest.regions).reduce((n, r) => n + r.x1Bytes + r.x2Bytes, 0);
  console.log(`${Object.keys(manifest.regions).length} regions, ${(total / 1024).toFixed(0)} KB`);
}

/** Problems with the built files (empty when current). */
export function check() {
  const problems = [];
  const want = plan();
  let have;
  try {
    have = readJson(MANIFEST);
  } catch {
    return [`${MANIFEST} missing`];
  }
  const strip = (m) => JSON.stringify({ ...m, regions: Object.fromEntries(Object.entries(m.regions || {}).map(([id, r]) => [id, Object.fromEntries(Object.entries(r).filter(([k]) => !/^x[12](Bytes|Sha256)$/.test(k)))])) });
  if (strip(have) !== strip(want)) problems.push(`${MANIFEST} is stale against ${FLA}, the map index, the recipe or ${REPAINTS}`);
  for (const [id, r] of Object.entries(repaints())) {
    for (const d of ['x1', 'x2']) {
      const p = join(spike, 'public', r[d]?.file || '');
      if (existsSync(p) && sha256(readFileSync(p)) !== r[d].sha256) problems.push(`hub ${id}: ${r[d].file} differs from ${REPAINTS}`);
    }
  }
  for (const [id, r] of Object.entries(have.regions || {})) {
    for (const d of [1, 2]) {
      const p = join(spike, 'public', r[`x${d}`] || '');
      if (!existsSync(p)) problems.push(`hub ${id}: ${r[`x${d}`]} missing`);
      else if (sha256(readFileSync(p)) !== r[`x${d}Sha256`]) problems.push(`hub ${id}: ${r[`x${d}`]} differs from the manifest`);
    }
  }
  const files = new Set(Object.values(have.regions || {}).flatMap((r) => [basename(r.x1), basename(r.x2)]));
  for (const f of existsSync(join(spike, OUT_DIR)) ? readdirSync(join(spike, OUT_DIR)) : []) {
    if (f !== 'backgrounds.json' && !files.has(f)) problems.push(`${OUT_DIR}/${f} is not in the manifest`);
  }
  const mod = join(spike, MODULE);
  if (!existsSync(mod) || readFileSync(mod, 'utf8') !== moduleText(have)) problems.push(`${MODULE} is stale`);
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--check')) {
    const problems = check();
    for (const p of problems) console.error(p);
    if (problems.length) process.exit(1);
    console.log('map backgrounds current');
  } else {
    build();
  }
}
