/**
 * Write the rebuilt Jethimadh Tower Base rooms (public/js/tower-rooms.js:
 * Room 15 and the Ventilation Room; public/js/tower-challenge-rooms.js:
 * Rooms 4, 8 and 16; public/js/tower-mid-rooms.js: the Stairs and the Mezzanine of Jethimadh
 * Tower: Mid) as street JSON, list them in assets/streets/index.json, and link the corridor
 * doors (and Tower St West's tower door) that lead to them (connect.street + arrive), the way
 * build-street-navigation.mjs links doors to imported streets. Also links the
 * rooms' own doors back out and resolves teleporter boxes' arrivals. Safe to re-run; run it again after a street
 * re-import or a build-street-navigation.mjs pass.
 *
 *   node tools/build-tower-rooms.mjs          write
 *   node tools/build-tower-rooms.mjs --check  exit 1 if anything is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrivalInTarget, streetAliases } from '../public/js/location-navigation.js?v=38c12adf';
import { TOWER_ROOM_DOOR_LINKS } from '../public/js/tower-rooms.js?v=7b2aa06a';
import { ALL_TOWER_ROOMS, CHALLENGE_ROOM_DOOR_LINKS, anyTowerRoomIndexEntry, anyTowerRoomStreet } from '../public/js/tower-challenge-rooms.js?v=9e39f503';
import { MID_TOWER_DOOR_LINKS, MID_TOWER_ROOMS, midTowerIndexEntry, midTowerRoomStreet } from '../public/js/tower-mid-rooms.js?v=15143f80';
import { GWENDOLYN_DOOR_LINKS, GWENDOLYN_ROOMS, room23IndexEntry, room23Street } from '../public/js/gwendolyn-room-23.js?v=d371497b';

const ROOMS = [...ALL_TOWER_ROOMS, ...MID_TOWER_ROOMS, ...GWENDOLYN_ROOMS];
const LINKS = [...TOWER_ROOM_DOOR_LINKS, ...CHALLENGE_ROOM_DOOR_LINKS, ...MID_TOWER_DOOR_LINKS, ...GWENDOLYN_DOOR_LINKS];
const MID = new Set(MID_TOWER_ROOMS.map((room) => room.tsid));
const GWEN = new Set(GWENDOLYN_ROOMS.map((room) => room.tsid));
const indexEntry = (room) => (GWEN.has(room.tsid) ? room23IndexEntry(room) : MID.has(room.tsid) ? midTowerIndexEntry(room) : anyTowerRoomIndexEntry(room));
const roomStreet = (room) => (GWEN.has(room.tsid) ? room23Street(room) : MID.has(room.tsid) ? midTowerRoomStreet(room) : anyTowerRoomStreet(room));

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');
const check = process.argv.includes('--check');
const stale = [];

const read = (file) => JSON.parse(readFileSync(join(streetsDir, file), 'utf8'));
const index = read('index.json');
const loaded = new Map();
const streetFor = (key) => {
  if (!loaded.has(key)) loaded.set(key, read(`${key}.json`));
  return loaded.get(key);
};
const resolveKey = (tsid) => streetAliases(tsid).find((alias) => index.streets[alias]) || null;

function put(file, value) {
  const text = `${JSON.stringify(value)}\n`;
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

// 1. Index rows first, so the rooms resolve as door targets.
let indexChanged = false;
for (const room of ROOMS) {
  const row = indexEntry(room);
  if (JSON.stringify(index.streets[room.tsid]) !== JSON.stringify(row)) {
    index.streets[room.tsid] = row;
    indexChanged = true;
  }
}

// 2. The rooms, with their own doors linked to the corridors / street.
const rooms = new Map(ROOMS.map((room) => [room.tsid, roomStreet(room)]));
for (const street of rooms.values()) loaded.set(street.tsid, street);
for (const street of rooms.values()) {
  for (const door of street.doors) {
    const key = resolveKey(door.connect.tsid);
    door.connect.street = key;
    const arrive = key ? arrivalInTarget(streetFor(key), door.connect.x, door.connect.y) : null;
    if (arrive) door.connect.arrive = { x: arrive.x, y: arrive.y };
    else delete door.connect.arrive;
  }
  for (const box of street.boxes || []) {
    if (!box.teleport) continue;
    const key = resolveKey(box.teleport.tsid);
    const arrive = key ? arrivalInTarget(streetFor(key), box.teleport.x, box.teleport.y) : null;
    if (!arrive?.snapped) throw new Error(`${street.tsid} ${box.id}: no floor at ${box.teleport.x},${box.teleport.y} in ${box.teleport.tsid}`);
    box.teleport.street = key;
    box.teleport.arrive = { x: arrive.x, y: arrive.y };
  }
  put(`${street.tsid}.json`, street);
}

// 3. The archived corridor doors into the rooms.
const touched = new Set();
for (const link of LINKS) {
  const corridor = streetFor(link.street);
  const door = (corridor.doors || []).find((d) => d.id === link.door);
  if (!door?.connect) throw new Error(`${link.street} has no door ${link.door}`);
  const room = rooms.get(link.room);
  const arrive = arrivalInTarget(room, door.connect.x, door.connect.y);
  if (!arrive?.snapped) throw new Error(`${link.door}: no floor at ${door.connect.x},${door.connect.y} in ${link.room}`);
  door.connect.street = link.room;
  door.connect.arrive = { x: arrive.x, y: arrive.y };
  touched.add(link.street);
}
for (const key of touched) put(`${key}.json`, streetFor(key));

if (indexChanged) {
  stale.push('index.json');
  if (!check) writeFileSync(join(streetsDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
}

console.log(`${check ? 'stale' : 'wrote'}: ${stale.length ? stale.join(', ') : 'nothing'}`);
if (check && stale.length) process.exit(1);
