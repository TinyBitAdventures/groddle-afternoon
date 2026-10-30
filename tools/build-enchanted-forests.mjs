/**
 * Write the three rebuilt Enchanted Forest hollows (public/js/enchanted-forests.js)
 * as street JSON, list them in assets/streets/index.json, and link the parent
 * streets' mini doors to them (connect.street + arrive) and the hollows' way
 * out back to the parent doors. Safe to re-run; run it again after a street
 * re-import or a build-street-navigation.mjs pass.
 *
 *   node tools/build-enchanted-forests.mjs          write
 *   node tools/build-enchanted-forests.mjs --check  exit 1 if anything is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=38c12adf';
import { ENCHANTED_FORESTS, buildEnchantedForestStreet, enchantedForestIndexEntry } from '../public/js/enchanted-forests.js?v=dd04e11b';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');
const check = process.argv.includes('--check');
const stale = [];

const read = (file) => JSON.parse(readFileSync(join(streetsDir, file), 'utf8'));
const index = read('index.json');

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

let indexChanged = false;
for (const forest of ENCHANTED_FORESTS) {
  const parent = read(`${forest.parent}.json`);
  const hollow = buildEnchantedForestStreet(forest, parent);

  // Way out -> the parent's mini door.
  const out = hollow.doors[0];
  const back = arrivalInTarget(parent, out.connect.x, out.connect.y);
  if (!back?.snapped) throw new Error(`${forest.label}: no floor under the ${parent.label} door`);
  out.connect.street = forest.parent;
  out.connect.arrive = { x: back.x, y: back.y };
  put(`${forest.tsid}.json`, hollow);

  // Parent mini door -> the hollow.
  const door = (parent.doors || []).find((d) => d.id === forest.door);
  const arrive = arrivalInTarget(hollow, door.connect.x, door.connect.y);
  if (!arrive?.snapped) throw new Error(`${forest.door}: no floor at ${door.connect.x},${door.connect.y} in ${forest.label}`);
  door.connect.street = forest.tsid;
  door.connect.arrive = { x: arrive.x, y: arrive.y };
  put(`${forest.parent}.json`, parent);

  const row = enchantedForestIndexEntry(forest, hollow);
  if (JSON.stringify(index.streets[forest.tsid]) !== JSON.stringify(row)) {
    index.streets[forest.tsid] = row;
    indexChanged = true;
  }
}

if (indexChanged) {
  stale.push('index.json');
  if (!check) writeFileSync(join(streetsDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
}

console.log(`${check ? 'stale' : 'wrote'}: ${stale.length ? stale.join(', ') : 'nothing'}`);
if (check && stale.length) process.exit(1);
