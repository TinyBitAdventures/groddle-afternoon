/**
 * Write Vicar's Peak (public/js/vicars-peak.js) as street JSON, list it in
 * assets/streets/index.json, and point Thornfad Layers' locked door (door_1,
 * Door Key 1) at it. The street's bottom door lands in front of that door;
 * its top door lands in Mossystep. Safe to re-run; run it again after a
 * street re-import or a build-street-navigation.mjs pass.
 *
 *   node tools/build-vicars-peak.mjs          write
 *   node tools/build-vicars-peak.mjs --check  exit 1 if anything is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=4be109b9';
import {
  MOSSYSTEP_ARRIVE,
  MOSSYSTEP_TSID,
  THORNFAD_DOOR,
  THORNFAD_TSID,
  VICARS_PEAK_ARRIVE,
  VICARS_PEAK_TSID,
  vicarsPeakIndexEntry,
  vicarsPeakStreet,
} from '../public/js/vicars-peak.js?v=465e7965';

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

const thornfad = read(`${THORNFAD_TSID}.json`);
const door = (thornfad.doors || []).find((d) => d.id === THORNFAD_DOOR);
if (!door) throw new Error(`Thornfad Layers has no ${THORNFAD_DOOR}`);

// The bottom door lands in front of Thornfad's door (door x/y are Thornfad screen space).
const backXY = { x: door.x + thornfad.bounds.l, y: door.y + thornfad.bounds.t };
const back = arrivalInTarget(thornfad, backXY.x, backXY.y);
if (!back?.snapped) throw new Error("no floor in front of Thornfad Layers' door");

const mossystep = read(`${MOSSYSTEP_TSID}.json`);
const moss = arrivalInTarget(mossystep, MOSSYSTEP_ARRIVE.x, MOSSYSTEP_ARRIVE.y);
if (!moss?.snapped) throw new Error(`no floor at ${MOSSYSTEP_ARRIVE.x},${MOSSYSTEP_ARRIVE.y} in Mossystep`);

const street = vicarsPeakStreet({
  thornfadArrive: { x: back.x, y: back.y },
  thornfadXY: backXY,
  mossystepArrive: { x: moss.x, y: moss.y },
});
put(`${VICARS_PEAK_TSID}.json`, `${JSON.stringify(street)}\n`);

// Thornfad's door: its own connect x/y, snapped to the rebuilt ground.
if (door.connect.x !== VICARS_PEAK_ARRIVE.x || door.connect.y !== VICARS_PEAK_ARRIVE.y) {
  throw new Error(`${THORNFAD_DOOR} connect moved: ${door.connect.x},${door.connect.y}`);
}
const arrive = arrivalInTarget(street, door.connect.x, door.connect.y);
if (!arrive?.snapped) throw new Error(`no floor at ${door.connect.x},${door.connect.y} in Vicar's Peak`);
door.connect.street = VICARS_PEAK_TSID;
door.connect.arrive = { x: arrive.x, y: arrive.y };
put(`${THORNFAD_TSID}.json`, `${JSON.stringify(thornfad)}\n`);

const indexPath = join(streetsDir, 'index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const row = vicarsPeakIndexEntry(street);
if (JSON.stringify(index.streets[VICARS_PEAK_TSID]) !== JSON.stringify(row)) {
  index.streets[VICARS_PEAK_TSID] = row;
  put('index.json', `${JSON.stringify(index, null, 2)}\n`);
}

console.log(`${check ? 'stale' : 'wrote'}: ${stale.length ? stale.join(', ') : 'nothing'}`);
if (check && stale.length) process.exit(1);
