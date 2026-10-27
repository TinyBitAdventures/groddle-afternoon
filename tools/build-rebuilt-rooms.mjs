/**
 * Write the three rooms rebuilt from players' pictures (public/js/rebuilt-rooms.js;
 * register rows G157 Snowed In, G158 Martleby Hare, G159 Ethereal Endeavour) as
 * street JSON, list them in assets/streets/index.json, and point the doors that
 * lead in at them: Abbasid River's door_1353965313720, Doonboggle Trail's locked
 * door_1343415170600 (Door Key 1) and Rookthills Lay's locked door_1 (Door Key 2).
 * Each door's own connect x/y is kept and snapped to the rebuilt floor. Safe to
 * re-run; run it again after a street re-import or a build-street-navigation.mjs
 * pass.
 *
 *   node tools/build-rebuilt-rooms.mjs          write
 *   node tools/build-rebuilt-rooms.mjs --check  exit 1 if anything is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrivalInTarget } from '../public/js/location-navigation.js';
import {
  ABBASID_RIVER_DOOR,
  ABBASID_RIVER_TSID,
  DOONBOGGLE_DOOR,
  DOONBOGGLE_TSID,
  ETHEREAL_ARRIVE,
  ETHEREAL_TEMPLATE_TSID,
  ETHEREAL_TSID,
  FOOTLANDS_BALCONY,
  FOOTLANDS_TSID,
  MARTLEBY_ARRIVE,
  MARTLEBY_TSID,
  ROOKTHILLS_DOOR,
  ROOKTHILLS_TSID,
  SNOWED_IN_ARRIVE,
  SNOWED_IN_TSID,
  etherealIndexEntry,
  etherealStreet,
  martlebyIndexEntry,
  martlebyStreet,
  snowedInIndexEntry,
  snowedInStreet,
} from '../public/js/rebuilt-rooms.js';

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

/** The way back lands in front of the entry door (door x/y are the entry street's screen space). */
function inFrontOf(street, doorId) {
  const door = (street.doors || []).find((d) => d.id === doorId);
  if (!door) throw new Error(`${street.label} has no ${doorId}`);
  const xy = { x: door.x + street.bounds.l, y: door.y + street.bounds.t };
  const at = arrivalInTarget(street, xy.x, xy.y);
  if (!at?.snapped) throw new Error(`no floor in front of ${street.label}'s ${doorId}`);
  return { door, xy, arrive: { x: at.x, y: at.y } };
}

/** Point the entry door at the rebuilt room: its own connect x/y, snapped to the room's floor. */
function wireDoor(entry, door, room, expected) {
  if (door.connect?.tsid?.slice(1) !== room.tsid.slice(1)) throw new Error(`${entry.label}'s ${door.id} no longer leads to ${room.label}`);
  if (door.connect.x !== expected.x || door.connect.y !== expected.y) throw new Error(`${entry.label}'s ${door.id} connect moved: ${door.connect.x},${door.connect.y}`);
  const at = arrivalInTarget(room, door.connect.x, door.connect.y);
  if (!at?.snapped) throw new Error(`no floor at ${door.connect.x},${door.connect.y} in ${room.label}`);
  door.connect.street = room.tsid;
  door.connect.arrive = { x: at.x, y: at.y };
}

const indexPath = join(streetsDir, 'index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
let indexChanged = false;
function indexRow(tsid, row) {
  if (JSON.stringify(index.streets[tsid]) === JSON.stringify(row)) return;
  index.streets[tsid] = row;
  indexChanged = true;
}

// Snowed In, behind Abbasid River's door.
{
  const abbasid = read(`${ABBASID_RIVER_TSID}.json`);
  const { door, xy, arrive } = inFrontOf(abbasid, ABBASID_RIVER_DOOR);
  const room = snowedInStreet({ abbasidArrive: arrive, abbasidXY: xy });
  wireDoor(abbasid, door, room, SNOWED_IN_ARRIVE);
  put(`${SNOWED_IN_TSID}.json`, `${JSON.stringify(room)}\n`);
  put(`${ABBASID_RIVER_TSID}.json`, `${JSON.stringify(abbasid)}\n`);
  indexRow(SNOWED_IN_TSID, snowedInIndexEntry(room));
}

// Ethereal Endeavour, behind Doonboggle Trail's locked door.
{
  const trail = read(`${DOONBOGGLE_TSID}.json`);
  const { door, xy, arrive } = inFrontOf(trail, DOONBOGGLE_DOOR);
  if (!door.is_locked || door.key_id !== 1) throw new Error("Doonboggle Trail's door is no longer locked with Door Key 1");
  const room = etherealStreet(read(`${ETHEREAL_TEMPLATE_TSID}.json`), { doonboggleArrive: arrive, doonboggleXY: xy });
  wireDoor(trail, door, room, ETHEREAL_ARRIVE);
  put(`${ETHEREAL_TSID}.json`, `${JSON.stringify(room)}\n`);
  put(`${DOONBOGGLE_TSID}.json`, `${JSON.stringify(trail)}\n`);
  indexRow(ETHEREAL_TSID, etherealIndexEntry(room));
}

// Martleby Hare, behind Rookthills Lay's locked door; its door lands on Footlands Heath's balcony.
{
  const rook = read(`${ROOKTHILLS_TSID}.json`);
  const door = (rook.doors || []).find((d) => d.id === ROOKTHILLS_DOOR);
  if (!door) throw new Error(`Rookthills Lay has no ${ROOKTHILLS_DOOR}`);
  if (!door.is_locked || door.key_id !== 2) throw new Error("Rookthills Lay's door is no longer locked with Door Key 2");
  const footlands = read(`${FOOTLANDS_TSID}.json`);
  const balcony = arrivalInTarget(footlands, FOOTLANDS_BALCONY.x, FOOTLANDS_BALCONY.y);
  if (!balcony?.snapped) throw new Error("no floor on Footlands Heath's balcony");
  const room = martlebyStreet({ footlandsArrive: { x: balcony.x, y: balcony.y } });
  wireDoor(rook, door, room, MARTLEBY_ARRIVE);
  put(`${MARTLEBY_TSID}.json`, `${JSON.stringify(room)}\n`);
  put(`${ROOKTHILLS_TSID}.json`, `${JSON.stringify(rook)}\n`);
  indexRow(MARTLEBY_TSID, martlebyIndexEntry(room));
}

if (indexChanged) put('index.json', `${JSON.stringify(index, null, 2)}\n`);

console.log(`${check ? 'stale' : 'wrote'}: ${stale.length ? stale.join(', ') : 'nothing'}`);
if (check && stale.length) process.exit(1);
