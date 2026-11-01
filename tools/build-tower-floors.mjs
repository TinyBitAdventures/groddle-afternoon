/**
 * Write the abandoned towers' 15 upper floors (public/js/tower-floors.js,
 * register row G144) as street JSON, list them in assets/streets/index.json,
 * and give each lobby lift's floor rows their arrival in the floor (the
 * lobby XML's connect point, which build-street-navigation.mjs could not
 * place while the floors did not exist). Safe to re-run; run it again after a
 * street re-import or a build-street-navigation.mjs pass, and after changing
 * a layout in tower-floors.js. Then the key builders, in order:
 * build-restoration, data-versions, module-keys, play-online.
 *
 *   node tools/build-tower-floors.mjs          write
 *   node tools/build-tower-floors.mjs --check  exit 1 if anything is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=4be109b9';
import {
  TOWERS,
  towerFloorArrive,
  towerFloorFor,
  towerFloorIndexEntry,
  towerFloorLayout,
  towerFloorStreet,
} from '../public/js/tower-floors.js?v=3d1ad8b7';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');
const check = process.argv.includes('--check');
const stale = [];

const read = (file) => JSON.parse(readFileSync(join(streetsDir, file), 'utf8'));

function put(file, text) {
  let before = '';
  try {
    before = readFileSync(join(streetsDir, file), 'utf8');
  } catch {
    /* new file */
  }
  if (before === text) return;
  stale.push(file);
  if (!check) writeFileSync(join(streetsDir, file), text);
}

const indexPath = join(streetsDir, 'index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
let indexChanged = false;
function indexRow(tsid, row) {
  if (JSON.stringify(index.streets[tsid]) === JSON.stringify(row)) return;
  index.streets[tsid] = row;
  indexChanged = true;
}

for (const tower of TOWERS) {
  const lobby = read(`${tower.lobby}.json`);
  const lift = (lobby.signposts || []).find((s) => (s.connects || []).some((c) => towerFloorFor(c.tsid)));
  if (!lift) throw new Error(`${lobby.label} has no lift`);
  const named = lift.connects.map((c) => towerFloorFor(c.tsid)).filter(Boolean).map((f) => f.source).sort();
  const expected = tower.floors.map((f) => f.source).sort();
  if (JSON.stringify(named) !== JSON.stringify(expected)) throw new Error(`${lobby.label}'s lift names ${named.join(', ')}, not ${expected.join(', ')}`);
  for (const floor of tower.floors) {
    // A floor is built once it has a layout (its panorama's, or the default).
    if (!towerFloorLayout(floor)) continue;
    const street = towerFloorStreet({ ...floor, tower }, lobby);
    const at = arrivalInTarget(street, floor.arrive.x, floor.arrive.y);
    if (!at?.snapped) throw new Error(`no floor line at ${floor.arrive.x},${floor.arrive.y} in ${floor.label}`);
    put(`${floor.tsid}.json`, `${JSON.stringify(street)}\n`);
    indexRow(floor.tsid, towerFloorIndexEntry(street));
  }
  // The lobby's lift: each floor row lands in front of that floor's lift.
  for (const c of lift.connects) {
    const f = towerFloorFor(c.tsid);
    if (f && towerFloorLayout(f)) c.arrive = towerFloorArrive(f);
  }
  put(`${tower.lobby}.json`, `${JSON.stringify(lobby)}\n`);
}

if (indexChanged) put('index.json', `${JSON.stringify(index, null, 2)}\n`);

console.log(`${check ? 'stale' : 'wrote'}: ${stale.length ? stale.join(', ') : 'nothing'}`);
if (check && stale.length) process.exit(1);
