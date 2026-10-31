#!/usr/bin/env node
/**
 * The hub map's street icons (vendor, shrine, subway station), as the 2012 client drew them
 * beside each street line (glitch-client MapHub.as drawStreet 640-760, from the Street fields
 * `store`, `shrine` and `has_subway`, data/map/Street.as).
 *
 * The server put those fields on the hub map's street objects (GSJS locations/location.js
 * get_map 2995-3010 and 3080-3086): `shrine` from config.map_shrines and `store` from
 * config.map_stores (inc_data_mapextras_prod.js, keyed by L-tsid), and `has_subway` on each
 * street a subway_1 station connects_to (config_prod.js transit_instances). This writes the
 * same three fields onto the streets of public/assets/maps/hubs/hub-<id>.json (and the legacy
 * copy assets/maps/hub-56-groddle-forest.json), so the map reads them as the client did.
 *
 * What the remake really has on each street decides, so the map never sends you to an
 * empty spot:
 *   shrine      the Giant of the shrine the remake builds there: street-ecology.json giantId
 *               (the street's own "Shrine to X" item in Tiny Speck's location XML, which
 *               js/street-ecology.js populationForStreet spawns). It agrees with map_shrines on
 *               all 859 of its streets and adds two map_shrines leaves out (Chad Gallows and
 *               Ajaya Bliss, both Zille).
 *   store       the map_stores name, on a street where the remake has a street spirit vendor
 *               (street-ecology.json counts.street_spirit). The few map_stores streets whose
 *               archived file has no street spirit get no icon. Hechey Track's vendor sells
 *               Groceries in the remake (js/vendor.js selectVendorProfile), so its icon says so.
 *   has_subway  public/js/subway-line.js (tools/build-subway.mjs): the 12 stations' connects_to.
 * Published zones' own hubs (tools/builder/build-zone-maps.mjs) are left alone.
 *
 *   node tools/build-map-icons.mjs          write
 *   node tools/build-map-icons.mjs --check  exit 1 if a hub file is stale (tests/map-icons.test.js)
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = process.env.GSJS_ROOT || join(root, '..', 'glitch-GameServerJS');
const HUB_DIR = join(root, 'public/assets/maps/hubs');
const LEGACY = join(root, 'public/assets/maps/hub-56-groddle-forest.json');
const ECOLOGY = join(root, 'public/assets/content/street-ecology.json');
const FIELDS = ['store', 'shrine', 'has_subway'];

/** map_stores and map_shrines from inc_data_mapextras_prod.js (data only: two var literals). */
export function readMapExtras(gsjs = GSJS) {
  const sandbox = {};
  vm.runInNewContext(
    `${readFileSync(join(gsjs, 'inc_data_mapextras_prod.js'), 'utf8')}\nthis.stores = map_stores; this.shrines = map_shrines;`,
    sandbox,
  );
  return { stores: sandbox.stores || {}, shrines: sandbox.shrines || {} };
}

/** Streets whose remake vendor is not their map_stores one (js/vendor.js selectVendorProfile). */
export const VENDOR_OVERRIDES = Object.freeze({ LLI2V0UN7RD1T2J: 'Groceries' });

/** The remake's tsid for a map street (L -> G). */
const g = (tsid) => `G${String(tsid).slice(1)}`;

/**
 * The icon fields for one map street (pure).
 * @param {string} tsid  the map's L-tsid
 * @param {{ stores: object, ecology: object, subway: Set<string> }} src
 */
export function iconFields(tsid, { stores, ecology, subway }) {
  const row = ecology[g(tsid)] || null;
  const out = {};
  const store = VENDOR_OVERRIDES[tsid] || stores[tsid];
  if (store && Number(row?.counts?.street_spirit) > 0) out.store = store;
  if (row?.giantId) out.shrine = row.giantId;
  if (subway.has(tsid)) out.has_subway = true;
  return out;
}

/** A hub file's text with the icon fields set on its streets (the rest untouched). */
export function patchHubText(text, src) {
  const hub = JSON.parse(text);
  for (const s of hub.streets || []) {
    for (const f of FIELDS) delete s[f];
    Object.assign(s, iconFields(s.tsid, src));
  }
  let next = `${JSON.stringify(hub, null, 2)}\n`;
  // A file written with \u escapes keeps them (hub-63's "Likomärkä").
  if (/\\u00[89a-f][0-9a-f]/i.test(text)) next = next.replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return next;
}

export async function sources() {
  const { stores, shrines } = readMapExtras();
  const ecology = JSON.parse(readFileSync(ECOLOGY, 'utf8')).streets;
  const { SUBWAY_LINE } = await import(pathToFileURL(join(root, 'public/js/subway-line.js')).href);
  const subway = new Set(SUBWAY_LINE.stations.map((s) => s.connects_to).filter(Boolean));
  return { stores, shrines, ecology, subway };
}

export function hubFiles() {
  return [
    ...readdirSync(HUB_DIR).filter((f) => /^hub-\d+\.json$/.test(f)).sort().map((f) => join(HUB_DIR, f)),
    LEGACY,
  ].filter((f) => existsSync(f));
}

async function main() {
  const check = process.argv.includes('--check');
  if (!existsSync(join(GSJS, 'inc_data_mapextras_prod.js'))) {
    console.error(`no glitch-GameServerJS beside the game (${GSJS})`);
    process.exit(1);
  }
  const src = await sources();
  const stale = [];
  const counts = { store: 0, shrine: 0, has_subway: 0 };
  for (const file of hubFiles()) {
    const text = readFileSync(file, 'utf8');
    const next = patchHubText(text, src);
    if (file !== LEGACY) for (const s of JSON.parse(next).streets || []) for (const f of FIELDS) if (s[f]) counts[f] += 1;
    if (next !== text) {
      stale.push(relative(root, file));
      if (!check) writeFileSync(file, next);
    }
  }
  console.log(`map icons: ${counts.store} vendors, ${counts.shrine} shrines, ${counts.has_subway} subway stations`);
  console.log(`${check ? 'stale' : 'wrote'}: ${stale.length ? stale.join(', ') : 'nothing'}`);
  if (check && stale.length) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
