/**
 * Public street names, hub names, and each street's official vendor store
 * from Tiny Speck's production map data (CC0):
 *   glitch-GameServerJS/inc_data_maps_prod.js       maps_get_streets(), maps_get_hubs()
 *   glitch-GameServerJS/inc_data_mapextras_prod.js  map_stores
 *
 * The archived location XML often carries an internal template label
 * ("firebog_05"); production players saw "Pandu Chepa". This patches
 * assets/streets/index.json (label, internalLabel, hubId, hubName, store) and
 * each street JSON's label, hubId and hubName. Safe to re-run.
 *
 * Hubs (G184): each street's own location object names its hub, the
 * game_object attribute `hubid` on streets/mnt/stos/location_data/L<id>.xml
 * (Tiny Speck's locations-xml.zip, e.g. LLIFIG7BP8G1MU9.xml line 1, Louise
 * Pasture hubid="58"), and maps_get_streets() lists the street under that
 * same hub for every imported street. The importer once took the hub of the
 * first signpost target instead, which on a border street is the neighbour's
 * hub (Louise Pasture got Ix). A street listed on the map data takes its own
 * hub; an instance copy that is not on the map lists keeps what it has, and a
 * rebuilt room (no L*.xml) keeps the hub its build tool gave it.
 *
 * Run from spike root:
 *   node build-street-names.mjs
 *   node build-street-names.mjs --check   exit 1 if index.json or a street is stale
 */

import { readFile, writeFile, open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const gsjs = process.env.GSJS_ROOT || decodeURIComponent(new URL('../glitch-GameServerJS', import.meta.url).pathname);
const indexPath = join(root, 'public/assets/streets/index.json');
const locationDir =
  process.env.LOCATION_XML_DIR || join(root, '../streets/mnt/stos/location_data');
const check = process.argv.includes('--check');
const stale = [];

/** The hubid attribute on L<key>.xml's game_object (first line), or null. */
async function ownLocationHub(key, dir = locationDir) {
  let fh;
  try {
    fh = await open(join(dir, `L${key}.xml`), 'r');
  } catch {
    return null;
  }
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(1024), 0, 1024, 0);
    const head = buffer.subarray(0, bytesRead).toString('utf8');
    return head.match(/<game_object\b[^>]*\bhubid="(\d+)"/)?.[1] ?? null;
  } finally {
    await fh.close();
  }
}

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

const indexText = await readFile(indexPath, 'utf8');
const index = JSON.parse(indexText);
let renamed = 0;
let stores = 0;
let rehubbed = 0;
for (const [tsid, meta] of Object.entries(index.streets || {})) {
  const key = tsid.slice(1);
  const found = names.get(key);
  if (found?.name) {
    if (!meta.internalLabel && meta.label !== found.name) meta.internalLabel = meta.label;
    if (meta.label !== found.name) renamed += 1;
    meta.label = found.name;
    const own = await ownLocationHub(key);
    if (own && own !== found.hubId) {
      throw new Error(`${tsid}: L${key}.xml hubid ${own} but maps_get_streets lists hub ${found.hubId}`);
    }
    const hubName = maps.hubs?.[found.hubId]?.name;
    if (own) {
      if (meta.hubId !== own) rehubbed += 1;
      meta.hubId = own;
      if (hubName) meta.hubName = hubName;
    } else {
      if (!meta.hubId) meta.hubId = found.hubId;
      const name = maps.hubs?.[meta.hubId]?.name;
      if (name && !meta.hubName) meta.hubName = name;
    }
    try {
      const streetPath = join(root, 'public', meta.file);
      const text = await readFile(streetPath, 'utf8');
      const street = JSON.parse(text);
      if (street.label !== found.name) {
        street.internalLabel ||= street.label;
        street.label = found.name;
      }
      // A street JSON that carries its own hub (the loader prefers it over the
      // index row) carries the same one; files without one read the index.
      if (own && street.hubId != null) {
        street.hubId = meta.hubId;
        if (meta.hubName) street.hubName = meta.hubName;
      }
      const next = `${JSON.stringify(street)}\n`;
      if (next !== text) {
        stale.push(meta.file);
        if (!check) await writeFile(streetPath, next);
      }
    } catch (err) {
      // Street geometry file missing: the index row is still corrected.
      if (err?.code !== 'ENOENT') throw err;
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

const indexNext = `${JSON.stringify(index, null, 2)}\n`;
if (indexNext !== indexText) {
  stale.push('assets/streets/index.json');
  if (!check) await writeFile(indexPath, indexNext);
}
console.log(
  `Public names: ${names.size} in map data, ${renamed} index labels corrected, ${rehubbed} hubs corrected; ${stores} official stores.`
);
console.log(`${check ? 'stale' : 'wrote'}: ${stale.length ? `${stale.length} files` : 'nothing'}`);
if (check && stale.length) {
  console.log(stale.slice(0, 20).join('\n'));
  process.exit(1);
}
