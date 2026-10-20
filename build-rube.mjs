/**
 * Build the Rube's trade catalog from Tiny Speck's GameServerJS (CC0).
 *
 * npc_rube.js makeOffer walks every class in items/catalog.js: it may give
 * any item with a base cost above the player's level floor and no `no_rube`
 * tag (`rube_special` items only 20% of the time; dolls through their own
 * canRubeOffer), and asks for a pack item worth 1/6 to 1/2 as much (under
 * 2,500, never a doll or `no_rube`).
 *
 * Reads:   items/catalog.js, items/<class>.js (label, article, name_single,
 *          name_plural, base_cost, tags, canRubeOffer)
 * Writes:  public/assets/content/rube-catalog.json
 *          { items: { class: { label, article, single, plural, baseCost,
 *            tags, doll, special, art } } }
 *          `art` = an icon exists in public/assets/sprites/icons, so the
 *          remake's Rube only gives items it can draw.
 *
 * Run from spike root:  node build-rube.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const AUDIT = join(process.env.HOME || '', 'Documents/glitch-audit');
const GSJS = process.env.GLITCH_GSJS || join(AUDIT, 'glitch-GameServerJS');
const ICONS = join(root, 'public/assets/sprites/icons');
const OUT = join(root, 'public/assets/content/rube-catalog.json');

const unq = (s) => s.replace(/\\\//g, '/').replace(/\\"/g, '"').replace(/\\'/g, "'");
const strVar = (src, name) => {
  const m = src.match(new RegExp(`^var ${name} = "((?:[^"\\\\]|\\\\.)*)";`, 'm'));
  return m ? unq(m[1]) : '';
};

const catalogSrc = readFileSync(join(GSJS, 'items/catalog.js'), 'utf8');
const classes = [...(catalogSrc.match(/var class_tsids = \[([\s\S]*?)\];/)?.[1] || '').matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
const tagSrc = readFileSync(join(GSJS, 'items/catalog_tags.js'), 'utf8');
const specials = new Set([...(tagSrc.match(/"rube_special" : \[([\s\S]*?)\]/)?.[1] || '').matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));

const items = {};
let skipped = 0;
for (const id of classes) {
  const file = join(GSJS, 'items', `${id}.js`);
  if (!existsSync(file)) {
    skipped += 1;
    continue;
  }
  const src = readFileSync(file, 'utf8');
  const baseCost = Number(src.match(/^var base_cost = ([0-9.]+);/m)?.[1] || 0);
  if (!baseCost) continue;
  const tags = [...(src.match(/^var tags = \[([\s\S]*?)\];/m)?.[1] || '').matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  if (tags.includes('no_rube')) continue;
  items[id] = {
    label: strVar(src, 'label'),
    article: strVar(src, 'article') || 'a',
    single: strVar(src, 'name_single') || strVar(src, 'label'),
    plural: strVar(src, 'name_plural') || `${strVar(src, 'label')}s`,
    baseCost,
    doll: tags.includes('doll') || /function canRubeOffer/.test(src),
    special: specials.has(id) || tags.includes('rube_special'),
    art: existsSync(join(ICONS, `${id}.png`)),
  };
}

const counts = {
  catalog: classes.length,
  offerable: Object.keys(items).length,
  withArt: Object.values(items).filter((i) => i.art).length,
  missingFile: skipped,
};
writeFileSync(OUT, `${JSON.stringify({ generator: 'build-rube.mjs', source: 'GameServerJS items/catalog.js + items/*.js', counts, items })}\n`);
console.log(`wrote ${OUT}`, counts);
