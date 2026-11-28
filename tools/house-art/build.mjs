#!/usr/bin/env node
/**
 * House exteriors (G796): every part choice of the ten CC0 house chassis SWFs in
 * tinyspeck/glitch-items (furniture_base/furniture_chassis, the Groddle Cottage, and
 * the nine furniture_chassis upgrades of items/catalog_furniture.js 3334-3523), plus
 * the art each house draws around its parts (shadows, rocks, water), each as a 1x
 * WebP and its sharp 3x twin with its registration point. The Tower's generator
 * (tools/tower-art/build.mjs) for houses.
 *
 * The client attached the parts by class name: each .as file's initializehead() puts
 * the symbol named by the config (or a prefix plus it: the Frog House's glasses are
 * glassLeft_<choice> and glassRight_<choice>) into a named container of
 * maincontainer_mc.house_mc with addArticleToContainer (the article at the
 * container's 0,0). This reads those calls and the config_options / config_option_names
 * lists from the .as, the containers' places from the SWF (FFDec swf2xml:
 * maincontainer_mc on the stage, house_mc in it, each container in house_mc), exports
 * every choice's symbol as SVG at zoom 3 (FFDec), pads it so filters are not
 * clipped, rasterises it in Chromium (vector-sprites/svg-raster.mjs, which keeps
 * blend modes) and writes the trimmed pair (vector-sprites/aligned-art.mjs). What
 * house_mc places besides the containers is drawn too, in bands by depth: house_mc
 * exported from a copy of the SWF with the containers and the other bands' pieces
 * dropped (vector-sprites/swf-parts.mjs), so each band keeps its placements' colour
 * transforms, filters and blend modes and its depth among the parts.
 *
 * Empty symbols (topdeco_empty, the Frog House's glassLeft_none) are recorded as null
 * and not written.
 *
 * Every pair is registered in tools/vector-sprites/results.json (source
 * tools/house-art), so js/sprite-hires.js loads the 3x file on dense screens.
 *
 * Output:
 *   public/assets/sprites/home-house/<house>_<part>_<n>.webp (+ @3x.webp)
 *   public/assets/sprites/home-house/<house>_band_<k>.webp (+ @3x.webp)
 *   public/js/home-house-art.js  (generated: stages, layers, parts and choices)
 *
 * Usage: node tools/house-art/build.mjs [--work <dir>] [--check]
 *   --work   FFDec / raster cache (default $TMPDIR/house-art-work)
 *   --check  exit 1 if the generated module or the 3x registration would change (no writes)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { FFDEC, JAVA } from '../vector-sprites/swf-labels.mjs';
import { swapParts, symbolClasses } from '../vector-sprites/swf-parts.mjs';
import { rasteriseSvgs } from '../vector-sprites/svg-raster.mjs';
import { ZOOM, checkPairs, cutPair, padSvg, registerPairs, writePair } from '../vector-sprites/aligned-art.mjs';
import { mul, swfTree, swfXml } from './swf-tree.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ITEMS = join(os.homedir(), 'Documents/glitch-audit/glitch-items/furniture');
const OUT_DIR = join(ROOT, 'public/assets/sprites/home-house');
const OUT_JS = join(ROOT, 'public/js/home-house-art.js');
const PUB = join(ROOT, 'public');
const REL_DIR = 'assets/sprites/home-house';
const RESULTS = join(ROOT, 'tools/vector-sprites/results.json');
const SOURCE = 'tools/house-art';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const WORK = opt('--work', join(os.tmpdir(), 'house-art-work'));
const CHECK = args.includes('--check');

/**
 * Remake house id -> the catalog's SWF (catalog_furniture.js furniture_chassis swf urls,
 * the local CC0 copy) and the .as that drives it. The Creepy House's SWF is
 * furniture_chassis_tester2.swf; its .as is furniture_chassis_creepy_house.as (the FLA
 * beside it is the same house). The Bone Dwelling's .as carries the longer name.
 */
export const HOUSE_FILES = {
  cottage: ['furniture_base/furniture_chassis/furniture_chassis.swf', 'furniture_base/furniture_chassis/furniture_chassis.as'],
  frog: ['furniture_chassis/furniture_chassis_frog_house.swf', 'furniture_chassis/furniture_chassis_frog_house.as'],
  creepy: ['furniture_chassis/furniture_chassis_tester2.swf', 'furniture_chassis/furniture_chassis_creepy_house.as'],
  hominid: ['furniture_chassis/furniture_chassis_hobbit_house.swf', 'furniture_chassis/furniture_chassis_hobbit_house.as'],
  firebog: ['furniture_chassis/furniture_chassis_firebog_house.swf', 'furniture_chassis/furniture_chassis_firebog_house.as'],
  whimsy: ['furniture_chassis/furniture_chassis_seuss_house.swf', 'furniture_chassis/furniture_chassis_seuss_house.as'],
  orient: ['furniture_chassis/furniture_chassis_oriental_house.swf', 'furniture_chassis/furniture_chassis_oriental_house.as'],
  shipwreck: ['furniture_chassis/furniture_chassis_shipwreck.swf', 'furniture_chassis/furniture_chassis_shipwreck.as'],
  tipi: ['furniture_chassis/furniture_chassis_tipi_tent.swf', 'furniture_chassis/furniture_chassis_tipi_tent.as'],
  bone: ['furniture_chassis/furniture_chassis_prehistoric.swf', 'furniture_chassis/furniture_chassis_prehistoric_bone_dwelling.as'],
};
const PAD = 20; // 1x px of room for filters around FFDec's shape bounds
const ALPHA_MIN = 8; // a pixel counts as drawn above this alpha (0-255)

/** The .as frame script without comments, on one line. */
function asText(file) {
  return readFileSync(file, 'utf8').replace(/\/\/[^\n\r]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
}

/**
 * config_options ({ key: [symbol, ...] }, in the file's order), config_option_names
 * ({ key: label }) and initializehead's calls ([{ key, prefix, container }]).
 */
export function parseChassisAs(text) {
  const opts = /config_options = \{(.*?)\}\s*;?\s*house_mc =/.exec(text) || /config_options = \{(.*?\])\s*\}/.exec(text);
  if (!opts) throw new Error('no config_options');
  const options = {};
  for (const row of opts[1].matchAll(/(\w+): \[([^\]]*)\]/g)) {
    options[row[1]] = [...row[2].matchAll(/'([^']*)'/g)].map((m) => m[1]);
  }
  const namesAt = text.indexOf('config_option_names = {');
  const names = {};
  if (namesAt >= 0) {
    const end = text.indexOf('config_options = {', namesAt);
    for (const m of text.slice(namesAt, end).matchAll(/(\w+): '([^']*)'/g)) if (!(m[1] in names)) names[m[1]] = m[2];
  }
  const head = /function initializehead\(ob:Object\) \{(.*?)\}/.exec(text);
  if (!head) throw new Error('no initializehead');
  const calls = [...head[1].matchAll(/addArticleToContainer\((?:'([^']*)'\s*\+\s*)?ob\.(\w+), house_mc, '(\w+)'\)/g)]
    .map((m) => ({ key: m[2], prefix: m[1] || '', container: m[3] }));
  return { options, names, calls };
}

const r2 = (v) => Math.round(v * 100) / 100;

function exportSvgs(swf, ids, dir) {
  const done = join(dir, '.done');
  if (existsSync(done)) return;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  console.log(`  ffdec: ${swf.split('/').pop()} (${ids.length} sprites)`);
  execFileSync(JAVA, ['-jar', FFDEC, '-zoom', String(ZOOM), '-selectid', ids.join(','), '-format', 'sprite:svg', '-export', 'sprite', dir, swf], { stdio: 'ignore' });
  writeFileSync(done, '');
}

function spriteSvg(dir, id) {
  const sub = readdirSync(dir).find((d) => d === `DefineSprite_${id}` || d.startsWith(`DefineSprite_${id}_`));
  return sub ? readFileSync(join(dir, sub, '1.svg'), 'utf8') : null;
}

const art = {};
const files = [];
const jobs = [];
const pending = [];
const rows = [];

/** Queue a rasterisation of `text` (an FFDec sprite SVG); the art lands in `slot` = [holder, index]. */
function queue(house, name, text, dir, put) {
  if (!text || !/width="[1-9][\d.]*px"/.test(text) || !/height="[1-9][\d.]*px"/.test(text)) return;
  const padded = padSvg(text, PAD);
  const svg = join(dir, `${name}.pad.svg`);
  const png = join(dir, `${name}.png`);
  if (!existsSync(svg) || readFileSync(svg, 'utf8') !== padded.text) writeFileSync(svg, padded.text);
  if (!existsSync(png) || statSync(png).mtimeMs < statSync(svg).mtimeMs - 1000) jobs.push({ svg, png });
  pending.push({ house, name, png, rx: padded.rx, ry: padded.ry, put });
}

for (const [house, [swfRel, asRel]] of Object.entries(HOUSE_FILES)) {
  const swf = join(ITEMS, swfRel);
  const { options, names, calls } = parseChassisAs(asText(join(ITEMS, asRel)));
  const tree = swfTree(swfXml(swf, join(WORK, 'xml')));
  const main = tree.main.find((r) => r.name === 'maincontainer_mc');
  const mcRow = tree.sprites.get(main.id).find((r) => r.name === 'house_mc');
  const houseKids = tree.sprites.get(mcRow.id);
  const houseM = mul(main.m, mcRow.m);
  const sym = symbolClasses(swf);
  // The stage as the client measured it (ItemSSManager mc_w / mc_h rounded); the item stands on
  // its bottom centre (LocationItemstackView.as 853-854), so house_mc's origin from the foot is:
  const stage = [Math.round(tree.stage.w), Math.round(tree.stage.h)];
  const foot = [houseM[0], houseM[3], r2(houseM[4] - Math.round(stage[0] / 2)), r2(houseM[5] - stage[1])];
  if (houseM[1] || houseM[2]) throw new Error(`${house}: house_mc is rotated`);

  // Parts in initializehead's order, each with its containers.
  const parts = [];
  for (const call of calls) {
    if (!options[call.key]) throw new Error(`${house}: ${call.key} has no config_options`);
    let part = parts.find((p) => p.key === call.key);
    if (!part) parts.push(part = { key: call.key, label: names[call.key] || call.key, choices: options[call.key], containers: [] });
    part.containers.push(call);
  }
  // Symbols to export: every choice (with its container's prefix). A missing one is the
  // client's empty MovieClip (addArticleToContainer: new MovieClip()), only allowed for 'none'.
  const want = new Map();
  for (const part of parts) for (const c of part.containers) for (const choice of part.choices) {
    const name = `${c.prefix}${choice}`;
    if (sym.has(name)) want.set(name, sym.get(name));
    else if (choice !== 'none') throw new Error(`${house}: no symbol ${name}`);
  }
  const dir = join(WORK, house);
  exportSvgs(swf, [...want.values(), mcRow.id], dir);

  // Layers: house_mc's children by depth. A named container is a part's layer; runs of the
  // other pieces between them are bands.
  const containerIds = new Set();
  const layers = [];
  let band = null;
  const bands = [];
  for (const kid of [...houseKids].sort((a, b) => a.depth - b.depth)) {
    if (kid.m[1] || kid.m[2]) throw new Error(`${house}: ${kid.name || kid.id} is rotated`);
    const call = calls.find((c) => c.container === kid.name);
    if (call) {
      containerIds.add(kid.id);
      band = null;
      layers.push({ part: call.key, prefix: call.prefix, m: [kid.m[0], kid.m[3], r2(kid.m[4]), r2(kid.m[5])], art: [] });
      continue;
    }
    if (kid.name.endsWith('Container_mc')) throw new Error(`${house}: container ${kid.name} not in initializehead`);
    if (!band) {
      band = { ids: [], layer: { band: bands.length + 1, m: [1, 1, 0, 0], art: null } };
      bands.push(band);
      layers.push(band.layer);
    }
    band.ids.push(kid.id);
  }
  art[house] = { stage, foot, parts: parts.map(({ key, label, choices }) => ({ key, label, choices })), layers };

  for (const layer of layers) {
    if (layer.band) continue;
    const part = parts.find((p) => p.key === layer.part);
    part.choices.forEach((choice, i) => {
      layer.art[i] = null;
      const name = `${layer.prefix}${choice}`;
      if (!want.has(name)) return;
      const file = `${house}_${layer.prefix ? layer.prefix.replace(/_$/, '') : layer.part}_${i + 1}`;
      queue(house, file, spriteSvg(dir, want.get(name)), dir, (v) => { layer.art[i] = v; });
    });
  }
  // Each band: house_mc from a copy of the SWF with the containers and every other band dropped.
  for (const [k, b] of bands.entries()) {
    const bdir = join(WORK, `${house}-band-${k + 1}`);
    if (!existsSync(join(bdir, '.done'))) {
      mkdirSync(bdir, { recursive: true });
      const drop = {};
      for (const id of containerIds) drop[id] = null;
      for (const other of bands) if (other !== b) for (const id of other.ids) drop[id] = null;
      const copy = join(bdir, 'band.swf');
      swapParts(swf, copy, drop);
      exportSvgs(copy, [mcRow.id], join(bdir, 'svg'));
      writeFileSync(join(bdir, '.done'), '');
    }
    queue(house, `${house}_band_${k + 1}`, spriteSvg(join(bdir, 'svg'), mcRow.id), bdir, (v) => { b.layer.art = v; });
  }
}

if (jobs.length) {
  console.log(`  raster: ${jobs.length} svgs`);
  await rasteriseSvgs(jobs);
}

if (!CHECK) mkdirSync(OUT_DIR, { recursive: true });
for (const p of pending) {
  const cut = cutPair(p.png, ALPHA_MIN);
  if (!cut) continue;
  const file = `${p.name}.webp`;
  // 1x registration point inside the trimmed image, and the 1x size.
  p.put([file, r2(p.rx / ZOOM - cut.x), r2(p.ry / ZOOM - cut.y), cut.w, cut.h]);
  files.push(file);
  rows.push({ path: `${REL_DIR}/${file}`, hires: `${REL_DIR}/${p.name}@3x.webp`, w: cut.w, h: cut.h, swf: `furniture/${HOUSE_FILES[p.house][0]}` });
  if (!CHECK) writePair(cut, join(OUT_DIR, file));
}
await writePair.flush();

// Bands that drew nothing go; the rest keep their order.
for (const house of Object.values(art)) house.layers = house.layers.filter((l) => !l.band || l.art);

const lines = [
  '/**',
  ' * GENERATED by tools/house-art/build.mjs. Do not edit.',
  ' *',
  ' * The ten house chassis (G796): per house the SWF stage [mc_w, mc_h] as the client',
  ' * rounded it, `foot`: house_mc from the item\'s foot [scaleX, scaleY, x, y] (the item',
  ' * stands on the stage\'s bottom centre, facing right as drawn), `parts`: the rows the',
  ' * client offered (config_options in the .as, labels from config_option_names) with each',
  ' * choice\'s symbol name, and `layers` in depth order: a part\'s container',
  ' * ({ part, m: [scaleX, scaleY, x, y] in house_mc, art[choice - 1] }) or a band of the',
  ' * house\'s own pieces ({ band, art }). Art is [file, originX, originY, w, h] at 1x (the 1x',
  ' * WebP in assets/sprites/home-house, its 3x twin <name>@3x.webp in js/sprite-hires.js),',
  ' * or null for an empty symbol.',
  ' */',
  'export const HOUSE_ART = Object.freeze({',
  ...Object.entries(art).map(([house, a]) => [
    `  ${house}: {`,
    `    stage: ${JSON.stringify(a.stage)},`,
    `    foot: ${JSON.stringify(a.foot)},`,
    '    parts: [',
    ...a.parts.map((p) => `      ${JSON.stringify(p)},`),
    '    ],',
    '    layers: [',
    ...a.layers.map((l) => `      ${JSON.stringify(l.band ? { band: l.band, art: l.art } : { part: l.part, m: l.m, art: l.art })},`),
    '    ],',
    '  },',
  ].join('\n')),
  '});',
  '',
];
const js = lines.join('\n');
const want = new Set(rows.flatMap((r) => [r.path.split('/').pop(), r.hires.split('/').pop()]));
const results = JSON.parse(readFileSync(RESULTS, 'utf8'));
if (CHECK) {
  const same = existsSync(OUT_JS) && readFileSync(OUT_JS, 'utf8') === js;
  const { HIRES_SPRITES } = await import('../../public/js/sprite-hires.js?v=c1bcff21');
  const bad = checkPairs(results, SOURCE, rows.map((r) => r.path), PUB, HIRES_SPRITES);
  for (const r of rows) if (results[r.path] && results[r.path].hires !== r.hires) bad.push(`${r.path}: results name ${results[r.path].hires}`);
  for (const f of existsSync(OUT_DIR) ? readdirSync(OUT_DIR) : []) if (!want.has(f)) bad.push(`${REL_DIR}/${f}: not built here`);
  if (!same) bad.push('home-house-art.js is stale');
  if (bad.length) {
    for (const b of bad) console.error(`stale: ${b}`);
    process.exit(1);
  }
  console.log(`ok: ${files.length} articles`);
} else {
  writeFileSync(OUT_JS, js);
  for (const f of readdirSync(OUT_DIR)) if (!want.has(f)) unlinkSync(join(OUT_DIR, f));
  registerPairs(results, SOURCE, rows, PUB);
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  const { writeModule } = await import('../vector-sprites/build.mjs');
  writeModule(results);
  let one = 0, three = 0;
  for (const r of rows) {
    one += statSync(join(PUB, r.path)).size;
    three += statSync(join(PUB, r.hires)).size;
  }
  console.log(`wrote ${files.length} articles (1x ${(one / 1024).toFixed(0)} KB, 3x ${(three / 1024).toFixed(0)} KB), js/home-house-art.js and their js/sprite-hires.js rows`);
}
