/**
 * Add the navigation objects the first street import dropped (see
 * public/js/location-navigation.js for the source rules):
 *
 *   doors     screen space (x - bounds.l, y - bounds.t), bottom-centre, with
 *             deco sprite, key_id, requires_level, is_locked, house/owner
 *             fields, hidden, and `connect` { tsid, label, street (imported
 *             index key or null), x, y (source arrival, target world),
 *             arrive (target screen, on its platform) } or `destinations`.
 *   ladders   world space like platforms/walls (x centre, y bottom, h up).
 *   barriers  the XML <walls>: world space vertical colliders with pc_perm.
 *   boxes     screen space named hitboxes (e.g. Corridor One's key_drop).
 *   signposts each connect gains `hidden` and `arrive` (target screen).
 *
 * Source: tinyspeck/glitch-locations G*.xml geometry (CC0). Edits
 * assets/streets/*.json in place; safe to re-run after a re-import (run
 * build-street-layers.mjs and build-street-names.mjs too).
 *
 * Run from spike root:
 *   node build-street-navigation.mjs
 *   node build-street-navigation.mjs --only=GM4109NI2R640,GTJ1KOM8N2O1EFS   (just those streets)
 * A full run also rewrites streets later builders touched (e.g. the subway
 * station doors js/features/subway-feature.js retargets at load); use --only
 * after an importer change that only affects some streets.
 */

import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractLocationNavigation,
  buildStreetNavigation,
  streetAliases,
} from './public/js/location-navigation.js';

const root = dirname(fileURLToPath(import.meta.url));
const streetsDir = join(root, 'public/assets/streets');
const xmlRoot =
  process.env.GRODDLE_LOCATION_XML ||
  decodeURIComponent(new URL('../streets/mnt/stos/location_data', import.meta.url).pathname);

async function readable(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').filter(Boolean)) : null;

const index = JSON.parse(await readFile(join(streetsDir, 'index.json'), 'utf8'));
const files = (await readdir(streetsDir)).filter((f) => /^[GL][A-Z0-9]+\.json$/.test(f));
const streets = new Map();
for (const file of files) {
  const street = JSON.parse(await readFile(join(streetsDir, file), 'utf8'));
  streets.set(street.tsid || file.slice(0, -5), { file, street });
}

function resolve(tsid) {
  for (const alias of streetAliases(tsid)) {
    if (index.streets[alias]) return { key: alias, street: streets.get(alias)?.street || null };
  }
  return null;
}

const totals = {
  streets: 0,
  doorStreets: 0,
  doors: 0,
  hiddenDoors: 0,
  lockedDoors: 0,
  keyedDoors: 0,
  levelDoors: 0,
  doorsToImported: 0,
  doorsMissingTarget: 0,
  randomDoors: 0,
  ladders: 0,
  ladderStreets: 0,
  barriers: 0,
  barrierStreets: 0,
  boxes: 0,
  hiddenConnects: 0,
  hiddenSignposts: 0,
  signpostArrivals: 0,
};
const missingTargets = new Map();
const sprites = new Set();

for (const [tsid, { file, street }] of streets) {
  if (only && !only.has(tsid)) continue;
  let xmlPath = null;
  for (const alias of [tsid, ...streetAliases(tsid)]) {
    const candidate = join(xmlRoot, `${alias.startsWith('L') ? `G${alias.slice(1)}` : alias}.xml`);
    if (await readable(candidate)) {
      xmlPath = candidate;
      break;
    }
  }
  if (!xmlPath) continue;
  const nav = buildStreetNavigation(street, extractLocationNavigation(await readFile(xmlPath, 'utf8')), resolve);
  totals.streets += 1;

  street.doors = nav.doors;
  street.ladders = nav.ladders;
  street.barriers = nav.barriers;
  street.boxes = nav.boxes;
  street.signposts = nav.signposts;
  for (const key of ['doors', 'ladders', 'barriers', 'boxes']) if (!street[key].length) delete street[key];
  street.stats = {
    ...(street.stats || {}),
    doorCount: nav.doors.length,
    ladderCount: nav.ladders.length,
    barrierCount: nav.barriers.length,
  };

  if (nav.doors.length) totals.doorStreets += 1;
  for (const door of nav.doors) {
    totals.doors += 1;
    if (door.sprite) sprites.add(door.sprite);
    if (door.hidden) totals.hiddenDoors += 1;
    if (door.is_locked) totals.lockedDoors += 1;
    if (door.key_id) totals.keyedDoors += 1;
    if (door.requires_level) totals.levelDoors += 1;
    if (door.destinations) totals.randomDoors += 1;
    if (door.connect?.street || door.destinations?.some((d) => d.street)) totals.doorsToImported += 1;
    else if (!door.hidden) {
      totals.doorsMissingTarget += 1;
      if (door.connect) missingTargets.set(door.connect.tsid, door.connect.label);
    }
  }
  if (nav.ladders.length) totals.ladderStreets += 1;
  totals.ladders += nav.ladders.length;
  if (nav.barriers.length) totals.barrierStreets += 1;
  totals.barriers += nav.barriers.length;
  totals.boxes += nav.boxes.length;
  for (const sign of nav.signposts) {
    const hidden = sign.connects.filter((c) => c.hidden).length;
    totals.hiddenConnects += hidden;
    if (sign.connects.length && hidden === sign.connects.length) totals.hiddenSignposts += 1;
    totals.signpostArrivals += sign.connects.filter((c) => c.arrive).length;
  }
  await writeFile(join(streetsDir, file), `${JSON.stringify(street)}\n`);
}

console.log(JSON.stringify(totals));
console.log(`door sprites: ${sprites.size}; distinct missing door targets: ${missingTargets.size}`);
