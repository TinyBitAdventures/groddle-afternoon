/**
 * Write Symphonious Maximus (public/js/symphonious-maximus.js) as street
 * JSON, list it in assets/streets/index.json, and point Cebarkul's wooden
 * door (door_1354232290656) at it. The street's Cebarkul signpost lands in
 * front of that door. Safe to re-run; run it again after a street
 * re-import or a build-street-navigation.mjs pass.
 *
 *   node tools/build-symphonious-maximus.mjs          write
 *   node tools/build-symphonious-maximus.mjs --check  exit 1 if anything is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=4be109b9';
import {
  CEBARKUL_DOOR,
  CEBARKUL_TSID,
  SYMPHONIOUS_ARRIVE,
  SYMPHONIOUS_TSID,
  symphoniousIndexEntry,
  symphoniousStreet,
} from '../public/js/symphonious-maximus.js?v=345ad437';

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

const cebarkul = read(`${CEBARKUL_TSID}.json`);
const door = (cebarkul.doors || []).find((d) => d.id === CEBARKUL_DOOR);
if (!door) throw new Error(`Cebarkul has no ${CEBARKUL_DOOR}`);

// The signpost back lands in front of the door (door x/y are Cebarkul screen space).
const back = arrivalInTarget(cebarkul, door.x + cebarkul.bounds.l, door.y + cebarkul.bounds.t);
if (!back?.snapped) throw new Error('no floor in front of the Cebarkul door');
const street = symphoniousStreet({ cebarkulArrive: { x: back.x, y: back.y } });
put(`${SYMPHONIOUS_TSID}.json`, `${JSON.stringify(street)}\n`);

// The door's own connect x/y, snapped to the rebuilt floor.
if (door.connect.x !== SYMPHONIOUS_ARRIVE.x || door.connect.y !== SYMPHONIOUS_ARRIVE.y) {
  throw new Error(`${CEBARKUL_DOOR} connect moved: ${door.connect.x},${door.connect.y}`);
}
const arrive = arrivalInTarget(street, door.connect.x, door.connect.y);
if (!arrive?.snapped) throw new Error(`no floor at ${door.connect.x},${door.connect.y} in Symphonious Maximus`);
door.connect.street = SYMPHONIOUS_TSID;
door.connect.arrive = { x: arrive.x, y: arrive.y };
put(`${CEBARKUL_TSID}.json`, `${JSON.stringify(cebarkul)}\n`);

const indexPath = join(streetsDir, 'index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const row = symphoniousIndexEntry(street);
if (JSON.stringify(index.streets[SYMPHONIOUS_TSID]) !== JSON.stringify(row)) {
  index.streets[SYMPHONIOUS_TSID] = row;
  put('index.json', `${JSON.stringify(index, null, 2)}\n`);
}

console.log(`${check ? 'stale' : 'wrote'}: ${stale.length ? stale.join(', ') : 'nothing'}`);
if (check && stale.length) process.exit(1);
