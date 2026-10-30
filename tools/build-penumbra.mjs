/**
 * Write Penumbra (public/js/penumbra.js) as street JSON, list it in
 * assets/streets/index.json, and put its Penumbra and Umbra entries into
 * assets/content/puzzle-triggers.json (Umbra's teleporter in, Penumbra's
 * squares, orbs and the way back). Safe to re-run.
 *
 *   node tools/build-penumbra.mjs          write
 *   node tools/build-penumbra.mjs --check  exit 1 if anything is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PENUMBRA_TSID,
  UMBRA_TSID,
  penumbraIndexEntry,
  penumbraPuzzleEntry,
  penumbraStreet,
  umbraPuzzleEntry,
} from '../public/js/penumbra.js?v=f6f7176e';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');
const puzzlePath = join(root, 'public/assets/content/puzzle-triggers.json');
const check = process.argv.includes('--check');
const stale = [];

function put(path, label, text) {
  let before = '';
  try {
    before = readFileSync(path, 'utf8');
  } catch {
    /* new file */
  }
  if (before === text) return;
  stale.push(label);
  if (!check) writeFileSync(path, text);
}

// 1. The street.
put(join(streetsDir, `${PENUMBRA_TSID}.json`), `${PENUMBRA_TSID}.json`, `${JSON.stringify(penumbraStreet())}\n`);

// 2. Its index row.
const indexPath = join(streetsDir, 'index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const row = penumbraIndexEntry();
if (JSON.stringify(index.streets[PENUMBRA_TSID]) !== JSON.stringify(row)) {
  index.streets[PENUMBRA_TSID] = row;
  put(indexPath, 'index.json', `${JSON.stringify(index, null, 2)}\n`);
}

// 3. Puzzle trigger entries.
const puzzles = JSON.parse(readFileSync(puzzlePath, 'utf8'));
puzzles.streets[UMBRA_TSID] = umbraPuzzleEntry();
puzzles.streets[PENUMBRA_TSID] = penumbraPuzzleEntry();
put(puzzlePath, 'puzzle-triggers.json', `${JSON.stringify(puzzles, null, 1)}\n`);

console.log(`${check ? 'stale' : 'wrote'}: ${stale.length ? stale.join(', ') : 'nothing'}`);
if (check && stale.length) process.exit(1);
