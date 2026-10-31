/**
 * Write the Hell Bar (public/js/hell-bar.js) as street JSON, list it in
 * assets/streets/index.json, and point Panka Surazu's door
 * (door_1330398275523) at it. The bar's way out lands in front of that door.
 * Safe to re-run; run it again after a street re-import or a
 * build-street-navigation.mjs pass.
 *
 *   node tools/build-hell-bar.mjs          write
 *   node tools/build-hell-bar.mjs --check  exit 1 if anything is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=4be109b9';
import {
  HELL_BAR_ARRIVE,
  HELL_BAR_TSID,
  PANKA_DOOR,
  PANKA_TSID,
  hellBarIndexEntry,
  hellBarStreet,
} from '../public/js/hell-bar.js?v=6b7c50e8';

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

const panka = read(`${PANKA_TSID}.json`);
const door = (panka.doors || []).find((d) => d.id === PANKA_DOOR);
if (!door) throw new Error(`Panka Surazu has no ${PANKA_DOOR}`);

// The way out lands in front of Panka's door (door x/y are Panka screen space).
const backXY = { x: door.x + panka.bounds.l, y: door.y + panka.bounds.t };
const back = arrivalInTarget(panka, backXY.x, backXY.y);
if (!back?.snapped) throw new Error("no floor in front of Panka Surazu's door");

const street = hellBarStreet({ pankaArrive: { x: back.x, y: back.y }, pankaXY: backXY });
put(`${HELL_BAR_TSID}.json`, `${JSON.stringify(street)}\n`);

// Panka's door: its own connect x/y, snapped to the rebuilt floor.
if (door.connect.x !== HELL_BAR_ARRIVE.x || door.connect.y !== HELL_BAR_ARRIVE.y) {
  throw new Error(`${PANKA_DOOR} connect moved: ${door.connect.x},${door.connect.y}`);
}
const arrive = arrivalInTarget(street, door.connect.x, door.connect.y);
if (!arrive?.snapped) throw new Error(`no floor at ${door.connect.x},${door.connect.y} in the Hell Bar`);
door.connect.street = HELL_BAR_TSID;
door.connect.arrive = { x: arrive.x, y: arrive.y };
put(`${PANKA_TSID}.json`, `${JSON.stringify(panka)}\n`);

const indexPath = join(streetsDir, 'index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const row = hellBarIndexEntry(street);
if (JSON.stringify(index.streets[HELL_BAR_TSID]) !== JSON.stringify(row)) {
  index.streets[HELL_BAR_TSID] = row;
  put('index.json', `${JSON.stringify(index, null, 2)}\n`);
}

console.log(`${check ? 'stale' : 'wrote'}: ${stale.length ? stale.join(', ') : 'nothing'}`);
if (check && stale.length) process.exit(1);
