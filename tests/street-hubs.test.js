/**
 * Street hubs (register G184): every imported street's hub in
 * assets/streets/index.json, and in its street JSON, is the hub of its own
 * location object (L<id>.xml game_object hubid in Tiny Speck's
 * locations-xml.zip), which GSJS inc_data_maps_prod.js maps_get_streets()
 * lists it under. The importer used to take the first signpost target's hub,
 * which on 82 border streets was a neighbour's (Louise Pasture got Ix).
 * build-street-names.mjs writes the hubs; run it after a reimport.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { convertLocationXml } from '../public/js/location-xml.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCATIONS = join(ROOT, '../streets/mnt/stos/location_data');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const index = JSON.parse(readFileSync(join(ROOT, 'public/assets/streets/index.json'), 'utf8')).streets;

const sandbox = { config: {}, log: { info() {}, error() {} } };
vm.runInNewContext(
  `${readFileSync(join(GSJS, 'inc_data_maps_prod.js'), 'utf8')}\nthis.streets = maps_get_streets(); this.hubs = maps_get_hubs();`,
  sandbox
);
/** street id without its G/L prefix -> every hub maps_get_streets() lists it under */
const mapHubs = new Map();
for (const hubs of Object.values(sandbox.streets)) {
  for (const [hub, streets] of Object.entries(hubs)) {
    for (const tsid of Object.keys(streets)) {
      const key = tsid.slice(1);
      if (!mapHubs.has(key)) mapHubs.set(key, []);
      mapHubs.get(key).push(hub);
    }
  }
}

function ownHub(key) {
  const path = join(LOCATIONS, `L${key}.xml`);
  if (!existsSync(path)) return null;
  const fd = openSync(path, 'r');
  const buf = Buffer.alloc(1024);
  const n = readSync(fd, buf, 0, 1024, 0);
  closeSync(fd);
  return buf.subarray(0, n).toString('utf8').match(/<game_object\b[^>]*\bhubid="(\d+)"/)?.[1] ?? null;
}

const rows = Object.entries(index).map(([tsid, meta]) => {
  const key = tsid.slice(1);
  return { tsid, meta, own: ownHub(key), maps: mapHubs.get(key) || [] };
});

test('every street on the map lists has its own location hub, which the map data agrees with', () => {
  const live = rows.filter((r) => r.own && r.maps.length);
  assert.equal(live.length, 1368);
  const wrong = [];
  for (const r of live) {
    assert.deepEqual(r.maps, [r.own], `${r.tsid} listed under one hub, its own`);
    if (r.meta.hubId !== r.own) wrong.push(`${r.tsid} ${r.meta.label}: index ${r.meta.hubId}, own ${r.own}`);
    assert.equal(r.meta.hubName, sandbox.hubs[r.own].name, `${r.tsid} hub name`);
  }
  assert.deepEqual(wrong, []);
});

test('rebuilt rooms (no location XML) keep a hub the map data lists them under', () => {
  const rebuilt = rows.filter((r) => !r.own);
  assert.equal(rebuilt.length, 36); // + Snowed In, Ethereal Endeavour, Martleby Hare, Growing Stuff (G157-G159)
  for (const r of rebuilt) assert.deepEqual(r.maps, [r.meta.hubId], `${r.tsid} ${r.meta.label}`);
});

test('instance copies off the map lists carry their own hub or none (follow-up row)', () => {
  const copies = rows.filter((r) => r.own && !r.maps.length);
  assert.equal(copies.length, 54);
  for (const r of copies) assert.ok(['', r.own].includes(r.meta.hubId), `${r.tsid} ${r.meta.label}: ${r.meta.hubId}`);
  assert.equal(copies.filter((r) => r.meta.hubId === '').length, 21);
});

test('a street JSON that carries a hub carries the index hub', () => {
  for (const { tsid, meta } of rows) {
    const path = join(ROOT, 'public', meta.file);
    if (!existsSync(path)) continue;
    const street = JSON.parse(readFileSync(path, 'utf8'));
    if (street.hubId == null) continue;
    assert.equal(String(street.hubId), meta.hubId, `${tsid} ${meta.label}`);
    assert.equal(street.hubName, meta.hubName, `${tsid} ${meta.label}`);
  }
});

test('the corrected border streets', () => {
  const hub = (tsid) => `${index[tsid].hubName} (${index[tsid].hubId})`;
  assert.equal(hub('GLIFIG7BP8G1MU9'), 'Groddle Meadow (58)'); // Louise Pasture, was Ix
  assert.equal(hub('GCR13M5UQEM15TA'), 'Groddle Forest (56)'); // Ferncaster End, was Shimla Mirch
  assert.equal(hub('GA5KKVRDKAT2EA2'), 'Sura (121)'); // Shinso Ello, was Jethimadh
  assert.equal(hub('GIF2IUQJQ571TFL'), 'Uralia (51)'); // Eastern Approach, was Ilmenskie Caverns
});

test('the converter takes the own hub over the first signpost guess', () => {
  const xml = readFileSync(join(LOCATIONS, 'GLIFIG7BP8G1MU9.xml'), 'utf8');
  assert.equal(convertLocationXml(xml, {}).hubId, '27'); // first signpost: Ix
  assert.equal(convertLocationXml(xml, { 58: 'Groddle Meadow' }, { hubId: '58' }).hubId, '58');
  assert.equal(convertLocationXml(xml, { 58: 'Groddle Meadow' }, { hubId: '58' }).hubName, 'Groddle Meadow');
});

test('build-street-names.mjs --check: index and street JSON are current', () => {
  execFileSync(process.execPath, [join(ROOT, 'build-street-names.mjs'), '--check'], { cwd: ROOT, stdio: 'pipe' });
});
