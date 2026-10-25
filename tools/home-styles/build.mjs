#!/usr/bin/env node
/**
 * Builds public/js/home-styles-data.js: the 37 exterior and 37 interior home
 * styles of GameServerJS inc_data_homes_prod.js (homes_interior_configs 1-816,
 * homes_exterior_configs 818-1152), in source order, with the CC0 deco
 * composition (tools/home-styles/recipes.mjs) for each exterior style whose
 * art survives. Deco sizes come from assets-src/decos/groddle/<name>.png.
 *
 *   node tools/home-styles/build.mjs          write the module
 *   node tools/home-styles/build.mjs --check  exit 1 if it is stale
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PURCHASE_STREET_STYLE, PURCHASE_YARD_STYLE, RECIPES, YARD_LOOKS } from './recipes.mjs';

const spike = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GSJS = join(spike, '../glitch-GameServerJS/inc_data_homes_prod.js');
const SRC_DECOS = join(spike, 'assets-src/decos/groddle');
const PUB_DECOS = join(spike, 'public/assets/decos/groddle');
const OUT = join(spike, 'public/js/home-styles-data.js');
const check = process.argv.includes('--check');

/**
 * The 37 header panoramas (research/wayback/raw/home-images/headers, reference
 * only), by name. They follow the exterior order with _ruin_high first.
 */
const HEADERS = [
  'header-1338325153.jpg', 'header-1338326843.jpg', 'header-1338326874.jpg', 'header-1338326888.jpg',
  'header-1338326911.jpg', 'header-1338326923.jpg', 'header-1338326934.jpg', 'header-1338326943.jpg',
  'header-1338326954.jpg', 'header-1338326966.jpg', 'header-1338326974.jpg', 'header-1338326984.jpg',
  'header-1338326994.jpg', 'header-1338327006.jpg', 'header-1338327017.jpg', 'header-1338327029.jpg',
  'header-1338327038.jpg', 'header-1338327047.jpg', 'header-1338327058.jpg', 'header-1338327068.jpg',
  'header-1338327079.jpg', 'header-1338327089.jpg', 'header-1338327099.jpg', 'header-1338327111.jpg',
  'header-1338327121.jpg', 'header-1338327129.jpg', 'header-1338327138.jpg', 'header-1338327146.jpg',
  'header-1338327155.jpg', 'header-1338327163.jpg', 'header-1338327172.jpg', 'header-1346981249.jpg',
  'header-1346981259.jpg', 'header-1346981270.jpg', 'header-1346981279.jpg', 'header-1346981288.jpg',
  'header-1354058128.jpg',
];

/**
 * Trim plants kept at the sizes the first three looks used (homes-feature.js trimItems).
 * Two of those were drawn at hand-typed sizes, not their art's; kept so those looks do not move.
 */
const TRIM_SIZE = { flower_bush_5: { w: 260, h: 180 }, groddle_flower_2: { w: 120, h: 110 } };
const TRIM_SCALE = {
  flower_bush_5: 0.44, bush_1: 0.5, groddle_flower_2: 0.6, mushrooms: 0.38, grass_solid: 0.7,
  underground_plant_1: 0.7, purple_mushroom_3: 0.5, zutto_plant_2: 0.45, plant_fern_2: 0.6,
};

export function loadGsjsStyles(path = GSJS) {
  const src = readFileSync(path, 'utf8');
  // eslint-disable-next-line no-new-func
  const data = new Function(`${src}; return { homes_interior_configs, homes_exterior_configs };`)();
  const row = ([key, cfg]) => ({
    key,
    label: cfg.label,
    subscriber: cfg.is_subscriber === true,
    visible: cfg.is_visible === true,
    template: cfg.template,
    added: (String(cfg.main_image || '').match(/streets\/(\d{4}-\d{2}-\d{2})\//) || [])[1] || '',
  });
  return {
    interior: Object.entries(data.homes_interior_configs).map(row),
    exterior: Object.entries(data.homes_exterior_configs).map(row),
  };
}

function pngSize(name) {
  const path = join(SRC_DECOS, `${name}.png`);
  if (!existsSync(path)) throw new Error(`deco ${name}: no ${path}`);
  const b = readFileSync(path);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function shipped(name) {
  const file = name.endsWith('.svg') ? name : `${name}.webp`;
  if (!existsSync(join(PUB_DECOS, file))) throw new Error(`deco ${name}: not shipped (${file})`);
}

function resolveSprite(name, given = {}) {
  shipped(name);
  if (name.endsWith('.svg')) return { s: name, w: given.w, h: given.h };
  return { s: name, ...pngSize(name) };
}

function resolveItem(raw) {
  const { s, w, h, ...rest } = raw;
  const names = [].concat(s);
  const alts = names.map((name) => resolveSprite(name, { w, h }));
  const out = { ...alts[0], ...rest };
  if (alts.length > 1) out.alts = alts;
  return out;
}

function resolveLook(look) {
  return {
    ...look,
    layers: look.layers.map((layer) => (layer.band ? { ...layer } : { ...layer, items: layer.items.map(resolveItem) })),
    near: look.near.map(resolveItem),
    trim: look.trim.map((name) => {
      const sprite = resolveSprite(name);
      return { ...sprite, ...TRIM_SIZE[name], scale: TRIM_SCALE[name] ?? Math.round(Math.min(0.8, 90 / sprite.h) * 100) / 100 };
    }),
  };
}

export function buildData() {
  const { interior, exterior } = loadGsjsStyles();
  const order = ['_ruin_high', ...exterior.map((row) => row.key).filter((key) => key !== '_ruin_high')];
  const extRows = exterior.map((row) => {
    const recipe = RECIPES[row.key];
    if (!recipe) throw new Error(`no recipe for exterior style ${row.key}`);
    const ref = HEADERS[order.indexOf(row.key)];
    if (recipe.missing) return { ...row, ref, built: false, reason: recipe.missing };
    return { ...row, ref, built: true, look: resolveLook(recipe.look) };
  });
  for (const key of Object.keys(RECIPES)) {
    if (!exterior.some((row) => row.key === key)) throw new Error(`recipe ${key} is not a GSJS exterior style`);
  }
  const intRows = interior.map((row) => {
    const pair = YARD_LOOKS[row.key];
    if (pair == null) throw new Error(`no back-yard look for interior style ${row.key}`);
    if (typeof pair !== 'string') return { ...row, built: false, reason: pair.missing };
    const ext = extRows.find((r) => r.key === pair);
    if (!ext) throw new Error(`back-yard look ${row.key}: ${pair} is not a GSJS exterior style`);
    if (!ext.built) return { ...row, built: false, reason: `Drawn like the ${ext.label} street, which is not built: ${ext.reason}` };
    // The look is the street style's (js/home-styles.js yardLook), kept once in EXTERIOR_STYLES.
    return { ...row, built: true, lookOf: pair };
  });
  for (const key of Object.keys(YARD_LOOKS)) {
    if (!interior.some((row) => row.key === key)) throw new Error(`back-yard look ${key} is not a GSJS interior style`);
  }
  return { exterior: extRows, interior: intRows };
}

function render(data) {
  const json = (value) => JSON.stringify(value);
  const lines = [
    '// Generated by tools/home-styles/build.mjs from GameServerJS inc_data_homes_prod.js and',
    '// tools/home-styles/recipes.mjs (CC0 decos, tinyspeck/glitch-locations). Do not edit.',
    '// `ref` names the archived header panorama a composition follows (reference only, never shipped).',
    '',
    '/** homes_exterior_configs (inc_data_homes_prod.js 818-1152), source order. */',
    'export const EXTERIOR_STYLES = Object.freeze([',
    ...data.exterior.map((row) => `  ${json(row)},`),
    ']);',
    '',
    '/** homes_interior_configs (inc_data_homes_prod.js 1-816), source order. `lookOf`: the street style whose look the yard uses. */',
    'export const INTERIOR_STYLES = Object.freeze([',
    ...data.interior.map((row) => `  ${json(row)},`),
    ']);',
    '',
    '/** The street style each purchase look (js/homes.js HOME_STYLES) starts on. */',
    `export const PURCHASE_STREET_STYLE = Object.freeze(${JSON.stringify(PURCHASE_STREET_STYLE)});`,
    '',
    '/** The yard style each purchase look starts on (items/magic_rock.js 594-605). */',
    `export const PURCHASE_YARD_STYLE = Object.freeze(${JSON.stringify(PURCHASE_YARD_STYLE)});`,
    '',
  ];
  return lines.join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const text = render(buildData());
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (check) {
    if (current !== text) {
      console.error('public/js/home-styles-data.js is stale: run node tools/home-styles/build.mjs');
      process.exit(1);
    }
    console.log('home-styles-data.js is up to date');
  } else {
    writeFileSync(OUT, text);
    const data = buildData();
    const built = data.exterior.filter((row) => row.built).length;
    const yards = data.interior.filter((row) => row.built).length;
    console.log(`wrote ${OUT} (${built} of 37 exterior styles composed, ${yards} of 37 back yards)`);
  }
}
