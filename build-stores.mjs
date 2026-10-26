/**
 * Generate js/store-catalog.js from Tiny Speck's catalog_stores.js (CC0).
 *
 * Keeps the street-spirit shops a player meets on ordinary streets, with their
 * exact stock, prices, and buy-back multipliers. Test, unused, bag-only,
 * furniture, ticket, and limited-quantity rarity stores are left out.
 *
 * Also writes every item's base_cost and the no_vendor items, which set
 * what a store pays (inc_stores.js storeSell: round(base_cost * buy_multiplier)).
 *
 * Run from spike root:
 *   node build-stores.mjs
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const gsjs = process.env.GSJS_ROOT || decodeURIComponent(new URL('../glitch-GameServerJS', import.meta.url).pathname);
const outPath = join(root, 'public/js/store-catalog.js');

/** Street-spirit store ids kept, with the remake's world badge and colour. */
const KEEP = {
  3: { key: 'produce', id: 'street_spirit_produce', badge: 'P', color: 0xc74f47 },
  4: { key: 'hardware', id: 'street_spirit_hardware', badge: 'H', color: 0x6b7280 },
  5: { key: 'sno_cone', id: 'street_spirit_sno_cone', badge: 'SC', color: 0x5aa7d6 },
  6: { key: 'gardening', id: 'street_spirit_gardening', badge: 'GG', color: 0x6f9e3b },
  7: { key: 'kitchen', id: 'street_spirit_kitchen_tools', badge: 'K', color: 0xb5651d },
  8: { key: 'groceries', id: 'street_spirit_groceries', badge: 'G', color: 0xd87439 },
  9: { key: 'alchemical', id: 'street_spirit_alchemical_goods', badge: 'A', color: 0x7a4fb5 },
  10: { key: 'animal', id: 'street_spirit_animal_goods', badge: 'AG', color: 0xc9a227 },
  11: { key: 'tools', id: 'street_spirit_tool_vendor', badge: 'T', color: 0x3f6f8f },
  12: { key: 'gardening_tools', id: 'street_spirit_gardening_tools', badge: 'GT', color: 0x4f8a3b },
  13: { key: 'emporium', id: 'street_spirit_uncle_friendly', badge: 'UF', color: 0xd4a017 },
  15: { key: 'liquor', id: 'street_spirit_helgas_liquor', badge: 'HL', color: 0x9b2d30 },
  16: { key: 'meals', id: 'street_spirit_meals', badge: 'M', color: 0xe07b39 },
  18: { key: 'mining', id: 'street_spirit_mining', badge: 'Mi', color: 0x8a6d4b },
  19: { key: 'toys', id: 'street_spirit_toys', badge: 'Ty', color: 0x7653a6 },
};

const SEASONAL = new Set(['glitchmas_cracker', 'glitchmas_card']);

function itemMeta(classTsid) {
  const path = join(gsjs, 'items', `${classTsid}.js`);
  if (!existsSync(path)) return null;
  return readFile(path, 'utf8').then((src) => {
    const label = src.match(/^var label = "([^"]*)";/m)?.[1] || null;
    const hidden = /^var is_hidden = true;/m.test(src);
    const baseCost = Number(src.match(/^var base_cost = ([\d.]+);/m)?.[1] || 0);
    return { label, hidden, baseCost };
  });
}

const source = await readFile(join(gsjs, 'items/catalog_stores.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(`${source}\nthis.stores = stores;`, sandbox);

const stores = [];
const skipped = [];
for (const [rawId, meta] of Object.entries(KEEP)) {
  const store = sandbox.stores[rawId];
  if (!store) throw new Error(`catalog_stores.js has no store ${rawId}`);
  const offers = [];
  for (const entry of store.items || []) {
    if (!entry?.class_tsid || !(entry.cost > 0)) continue;
    if (entry.total_quantity !== undefined) continue;
    const info = await itemMeta(entry.class_tsid);
    if (!info || info.hidden) continue;
    // Machine parts and pasture machines have no remake system yet and no
    // recovered icon, so stock only what the pack can actually show.
    // Icons that arrived with drop tables still have no system behind them:
    // bags (no bag slots) and the snapshot Camera (no photos). The Elemental
    // Pouch is the exception: js/elemental-pouch.js gives it its Shake and
    // Rename verbs while elements stay in the pack (G83).
    // js/seasons.js SEASONAL_STOCK adds these only during Glitchmas.
    if (SEASONAL.has(entry.class_tsid)) continue;
    if ((/^bag_/.test(entry.class_tsid) && entry.class_tsid !== 'bag_elemental_pouch') || entry.class_tsid === 'camera') {
      skipped.push(`${store.name}: ${entry.class_tsid}`);
      continue;
    }
    if (!existsSync(join(root, 'public/assets/sprites/icons', `${entry.class_tsid}.png`))) {
      skipped.push(`${store.name}: ${entry.class_tsid}`);
      continue;
    }
    offers.push({ classTsid: entry.class_tsid, label: info.label || entry.class_tsid, cost: entry.cost });
  }
  stores.push({
    storeId: Number(rawId),
    ...meta,
    label: store.name,
    buyMultiplier: store.buy_multiplier,
    offers,
  });
}

// inc_stores.js storeSell prices every item from its own base_cost.
const baseCosts = {};
const noVendor = [];
for (const file of (await readdir(join(gsjs, 'items'))).sort()) {
  if (!file.endsWith('.js')) continue;
  const src = await readFile(join(gsjs, 'items', file), 'utf8');
  const cost = src.match(/^var base_cost = ([\d.]+);/m);
  if (!cost) continue;
  const classTsid = file.slice(0, -3);
  baseCosts[classTsid] = Number(cost[1]);
  const tags = src.match(/^var tags = \[([\s\S]*?)\];/m)?.[1] || '';
  if (/"no_vendor"/.test(tags)) noVendor.push(classTsid);
}

const banner = `/**
 * Generated by build-stores.mjs from glitch-GameServerJS items/catalog_stores.js
 * (CC0). Do not edit by hand; re-run \`node build-stores.mjs\`.
 */
`;
await writeFile(
  outPath,
  `${banner}\nexport const STORE_CATALOG = Object.freeze(${JSON.stringify(stores, null, 2)});\n`
    + `\n/** items/*.js base_cost, for store sell prices. */\nexport const ITEM_BASE_COSTS = Object.freeze(${JSON.stringify(baseCosts)});\n`
    + `\n/** Items tagged no_vendor: stores never buy them. */\nexport const NO_VENDOR_ITEMS = Object.freeze(new Set(${JSON.stringify(noVendor)}));\n`
);
console.log(
  `Wrote ${stores.length} stores, ${stores.reduce((n, s) => n + s.offers.length, 0)} offers to ${outPath}`
);
for (const s of stores) console.log(`  ${s.storeId} ${s.label}: ${s.offers.length}`);
console.log(`Skipped ${skipped.length} offers with no remake icon or system.`);
console.log(`Base costs for ${Object.keys(baseCosts).length} items, ${noVendor.length} no_vendor.`);
