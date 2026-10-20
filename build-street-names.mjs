/**
 * Public street names, hub names, and each street's official vendor store
 * from Tiny Speck's production map data (CC0):
 *   glitch-GameServerJS/inc_data_maps_prod.js       maps_get_streets(), maps_get_hubs()
 *   glitch-GameServerJS/inc_data_mapextras_prod.js  map_stores
 *
 * The archived location XML often carries an internal template label
 * ("firebog_05"); production players saw "Pandu Chepa". This patches
 * assets/streets/index.json (label, internalLabel, hubName, store) and each
 * street JSON's label. Safe to re-run.
 *
 * Run from spike root:
 *   node build-street-names.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const gsjs = process.env.GSJS_ROOT || '/Users/austin/Documents/glitch-audit/glitch-GameServerJS';
const indexPath = join(root, 'public/assets/streets/index.json');

/** map_stores names → js/vendor.js profile keys. */
const STORE_KEYS = {
  Hardware: 'hardware',
  'Animal Goods': 'animal',
  'Alchemical Goods': 'alchemical',
  Produce: 'produce',
  'Gardening Goods': 'gardening',
  'Kitchen Tools': 'kitchen',
  Groceries: 'groceries',
  Mining: 'mining',
  Toys: 'toys',
  'Gardening Tools': 'gardening_tools',
  Tool: 'tools',
  Meal: 'meals',
  Food: 'meals',
  Liquor: 'liquor',
};

async function evaluate(file, expose) {
  const sandbox = { config: {}, log: { info() {}, error() {} } };
  vm.runInNewContext(`${await readFile(join(gsjs, file), 'utf8')}\n${expose}`, sandbox);
  return sandbox;
}

const maps = await evaluate(
  'inc_data_maps_prod.js',
  'this.streets = maps_get_streets(); this.hubs = maps_get_hubs();'
);
const extras = await evaluate('inc_data_mapextras_prod.js', 'this.stores = map_stores;');

const names = new Map();
// maps_get_streets(): mote id -> hub id -> { L-tsid: public name }.
for (const hubs of Object.values(maps.streets || {})) {
  for (const [hubId, streets] of Object.entries(hubs || {})) {
    for (const [tsid, name] of Object.entries(streets || {})) {
      if (typeof name === 'string') names.set(tsid.slice(1), { name: name.trim(), hubId });
    }
  }
}

const index = JSON.parse(await readFile(indexPath, 'utf8'));
let renamed = 0;
let stores = 0;
for (const [tsid, meta] of Object.entries(index.streets || {})) {
  const key = tsid.slice(1);
  const found = names.get(key);
  if (found?.name) {
    if (!meta.internalLabel && meta.label !== found.name) meta.internalLabel = meta.label;
    if (meta.label !== found.name) renamed += 1;
    meta.label = found.name;
    if (!meta.hubId) meta.hubId = found.hubId;
    const hubName = maps.hubs?.[meta.hubId]?.name;
    if (hubName && !meta.hubName) meta.hubName = hubName;
    try {
      const streetPath = join(root, 'public', meta.file);
      const street = JSON.parse(await readFile(streetPath, 'utf8'));
      if (street.label !== found.name) {
        street.internalLabel ||= street.label;
        street.label = found.name;
        await writeFile(streetPath, `${JSON.stringify(street)}\n`);
      }
    } catch {
      // Street geometry file missing: the index label is still corrected.
    }
  }
  const storeName = extras.stores?.[`L${key}`] || extras.stores?.[`G${key}`];
  const store = STORE_KEYS[storeName];
  if (store) {
    meta.store = store;
    stores += 1;
  } else {
    delete meta.store;
  }
}

await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(`Public names: ${names.size} in map data, ${renamed} index labels corrected; ${stores} official stores.`);
