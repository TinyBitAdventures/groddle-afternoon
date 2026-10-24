/**
 * Write the lost floor (public/js/hidden-floors.js) as street JSON and list
 * it in assets/streets/index.json. The teleporters in and out of the lost
 * and forgotten floors live in hidden-floors.js and are run by
 * features/hidden-floors-feature.js, so no other street JSON changes.
 * Safe to re-run.
 *
 *   node tools/build-hidden-floors.mjs          write
 *   node tools/build-hidden-floors.mjs --check  exit 1 if anything is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOST_FLOOR_TSID, lostFloorIndexEntry, lostFloorStreet } from '../public/js/hidden-floors.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');
const check = process.argv.includes('--check');
const stale = [];

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

const street = lostFloorStreet();
put(`${LOST_FLOOR_TSID}.json`, `${JSON.stringify(street)}\n`);

const indexPath = join(streetsDir, 'index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const row = lostFloorIndexEntry(street);
if (JSON.stringify(index.streets[LOST_FLOOR_TSID]) !== JSON.stringify(row)) {
  index.streets[LOST_FLOOR_TSID] = row;
  put('index.json', `${JSON.stringify(index, null, 2)}\n`);
}

console.log(`${check ? 'stale' : 'wrote'}: ${stale.length ? stale.join(', ') : 'nothing'}`);
if (check && stale.length) process.exit(1);
