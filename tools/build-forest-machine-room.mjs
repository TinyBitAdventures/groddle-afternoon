/**
 * Write the Forest Community Machine Room (public/js/forest-machine-room.js)
 * as street JSON from the Meadow Community Machine Room template, list it in
 * assets/streets/index.json, and point Middle Valley Clearing's door
 * (door_1304704230037) at it. The room's way out lands in front of that door.
 * Safe to re-run; run it again after a street re-import or a
 * build-street-navigation.mjs pass.
 *
 *   node tools/build-forest-machine-room.mjs          write
 *   node tools/build-forest-machine-room.mjs --check  exit 1 if anything is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=4be109b9';
import {
  CLEARING_DOOR,
  CLEARING_TSID,
  FOREST_MACHINE_ROOM_ARRIVE,
  FOREST_MACHINE_ROOM_SOURCE_TSID,
  FOREST_MACHINE_ROOM_TSID,
  TEMPLATE_TSID,
  forestMachineRoomIndexEntry,
  forestMachineRoomStreet,
} from '../public/js/forest-machine-room.js?v=5f7e4589';

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

const clearing = read(`${CLEARING_TSID}.json`);
const door = (clearing.doors || []).find((d) => d.id === CLEARING_DOOR);
if (!door) throw new Error(`Middle Valley Clearing has no ${CLEARING_DOOR}`);
if (door.connect?.tsid !== FOREST_MACHINE_ROOM_SOURCE_TSID) throw new Error(`${CLEARING_DOOR} no longer leads to ${FOREST_MACHINE_ROOM_SOURCE_TSID}`);

// The way out lands in front of the Clearing's door (door x/y are Clearing screen space).
const backXY = { x: door.x + clearing.bounds.l, y: door.y + clearing.bounds.t };
const back = arrivalInTarget(clearing, backXY.x, backXY.y);
if (!back?.snapped) throw new Error("no floor in front of Middle Valley Clearing's door");

const street = forestMachineRoomStreet(read(`${TEMPLATE_TSID}.json`), { clearingArrive: { x: back.x, y: back.y }, clearingXY: backXY });
put(`${FOREST_MACHINE_ROOM_TSID}.json`, `${JSON.stringify(street)}\n`);

// The Clearing's door: its own connect x/y, snapped to the copied floor.
if (door.connect.x !== FOREST_MACHINE_ROOM_ARRIVE.x || door.connect.y !== FOREST_MACHINE_ROOM_ARRIVE.y) {
  throw new Error(`${CLEARING_DOOR} connect moved: ${door.connect.x},${door.connect.y}`);
}
const arrive = arrivalInTarget(street, door.connect.x, door.connect.y);
if (!arrive?.snapped) throw new Error(`no floor at ${door.connect.x},${door.connect.y} in the Forest machine room`);
door.connect.street = FOREST_MACHINE_ROOM_TSID;
door.connect.arrive = { x: arrive.x, y: arrive.y };
put(`${CLEARING_TSID}.json`, `${JSON.stringify(clearing)}\n`);

const indexPath = join(streetsDir, 'index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const row = forestMachineRoomIndexEntry(street);
if (JSON.stringify(index.streets[FOREST_MACHINE_ROOM_TSID]) !== JSON.stringify(row)) {
  index.streets[FOREST_MACHINE_ROOM_TSID] = row;
  put('index.json', `${JSON.stringify(index, null, 2)}\n`);
}

console.log(`${check ? 'stale' : 'wrote'}: ${stale.length ? stale.join(', ') : 'nothing'}`);
if (check && stale.length) process.exit(1);
