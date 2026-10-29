/**
 * Multiplayer phase 4: the shared street quoins the realtime server owns
 * (the realtime server's quoins.go). For every street in public/assets/streets/index.json
 * it lays out the natural quoins exactly as game.js enterStreet does (the
 * street's source population, then planStreetPlacements over the street's
 * own platforms with the same group order and the signposts reserved) and
 * writes each spot's place, type and class, plus the class table from
 * js/quoins.js QUOIN_CLASSES (items/quoin.js onPropsChanged 318-662).
 *
 * What differs from a solo layout, on purpose: no saved-arrival reservation
 * (that one is per player; in multiplayer everyone stands the quoins where
 * the server says) and no feature ecology overrides (those streets are
 * private instances, rebuilt rooms or empty stations, never shared), but
 * one: a party street's own (party-spaces.js partyEcologyEntry, the
 * archived template's quoins), since a Party Space's party shares them
 * (G334, quoins.go spotsOf).
 *
 * Run from the game repo root:
 *   node tools/build-realtime-quoins.mjs           writes data/quoins.json in the server repo (go:embed in its quoins.go)
 *   node tools/build-realtime-quoins.mjs --check   exits 1 when the file is stale
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireServer, serverPath } from './repos.mjs';

import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs } from '../public/js/street-loader.js';
import { platformsScreen, streetWidth, worldToScreen } from '../public/js/street-model.js';
import {
  ecologyForStreet,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
} from '../public/js/street-ecology.js';
import {
  MYSTERY_QUOIN_KINDS,
  QUOIN_CLASSES,
  QUOIN_TYPES,
  STREET_QUOIN_CLASSES,
  mysteryClassFor,
  planStreetQuoins,
  streetQuoinClass,
} from '../public/js/quoins.js';
import { partyEcologyEntry, partySpaceForStreet } from '../public/js/party-spaces.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');
const outPath = serverPath('data', 'quoins.json');

/**
 * game.js enterStreet's planner groups up to and including 'quoins', in its
 * order (features' placementGroups come after quoins, so they never move
 * one). tests/shared-quoins.test.js checks this list against game.js.
 */
export function placementRequests(population) {
  return [
    { key: 'player', count: 1, clearance: 190 },
    { key: 'trees', count: population.treeClasses.length, clearance: 135 },
    { key: 'gardens', count: population.gardens, clearance: 165 },
    { key: 'vendor', count: population.vendor ? 1 : 0, clearance: 120 },
    { key: 'shrine', count: population.shrine ? 1 : 0, clearance: 135 },
    { key: 'rocks', count: population.rockClasses.length, clearance: 74 },
    { key: 'piggies', count: population.piggies, clearance: 92 },
    { key: 'chickens', count: population.chickens, clearance: 86 },
    { key: 'butterflies', count: population.butterflies, clearance: 62 },
    { key: 'flyingButterflies', count: population.flyingButterflies, clearance: 58 },
    { key: 'apples', count: population.apples, clearance: 30 },
    { key: 'musicblocks', count: population.musicblocks, clearance: 45 },
    { key: 'quoins', count: population.quoins, clearance: 28 },
  ];
}

/** The ecology game.js lays a street out with here: a party street's is its template's (party-spaces-feature ecologyOverride). */
export function streetEcology(tsid) {
  const party = partySpaceForStreet(tsid);
  return party ? partyEcologyEntry(party.id) : ecologyForStreet(tsid);
}

/**
 * One street's natural quoins: [x, y, type, class] where x, y are the
 * quoin's centre before its bob (game.js spawnWorldQuoin: x = spot.x,
 * baseY = spot.y - 58 - (index % 3) * 34) in the street's screen pixels.
 */
export function streetQuoinLayout(data, { starter = false, ecology = streetEcology(data.tsid) } = {}) {
  const population = populationForStreet(data.tsid, ecology, { starter });
  if (!population.quoins) return [];
  const reserved = (data.signposts || []).map((signpost, index) => {
    const point = worldToScreen(data, signpost.x, signpost.y);
    return { ...point, key: `signpost:${index}`, clearance: 100 };
  });
  const plan = planStreetPlacements(platformsScreen(data), placementRequests(population), {
    worldW: streetWidth(data),
    seed: data.tsid,
    reserved,
  });
  const points = plan.groups.quoins || [];
  const types = planStreetQuoins(data.tsid, points.length);
  return points.map((spot, i) => {
    const type = types[i] || 'xp';
    return [Math.round(spot.x * 10) / 10, Math.round((spot.y - 58 - (i % 3) * 34) * 10) / 10, type, streetQuoinClass(data.tsid, i, type)];
  });
}

/**
 * The class table the server rolls and times from: respawn seconds and the
 * benefit (fixed) or floor..ceil (random), quoin.js 318-662. A spot whose
 * class is of another type gives its own type's base amount instead
 * (js/quoins.js collectQuoin): the server reads `types` for that. Mystery
 * spots (the iMG pair) pay by `mysteryTable` instead.
 */
export function classTable() {
  const out = {};
  for (const [name, row] of Object.entries(QUOIN_CLASSES)) {
    const entry = { type: row.type, respawn: row.respawnSec, line: row.line };
    if (Number.isFinite(row.benefit)) entry.benefit = row.benefit;
    else {
      entry.floor = row.floor;
      entry.ceil = row.ceil;
    }
    out[name] = entry;
  }
  return out;
}

/**
 * What a mystery quoin turns into (reimagined, js/quoins.js
 * MYSTERY_QUOIN_KINDS): the kinds the server picks from, each as likely, and
 * for every street-pair class the class each kind pays by (mysteryClassFor).
 */
export function mysteryTable() {
  const classes = {};
  for (const kind of MYSTERY_QUOIN_KINDS) {
    for (const name of STREET_QUOIN_CLASSES[kind]) {
      classes[name] = Object.fromEntries(MYSTERY_QUOIN_KINDS.map((k) => [k, mysteryClassFor(name, k)]));
    }
  }
  return { kinds: [...MYSTERY_QUOIN_KINDS], classes };
}

async function main() {
  requireServer();
  const index = JSON.parse(await readFile(join(streetsDir, 'index.json'), 'utf8'));
  applyStreetIndex(index);
  setStreetEcologyCatalog(JSON.parse(await readFile(join(root, 'public/assets/content/street-ecology.json'), 'utf8')));
  const streets = {};
  let total = 0;
  for (const tsid of Object.keys(index.streets).sort()) {
    let data;
    try {
      data = await loadStreetDataFromFs(tsid, streetsDir);
    } catch (err) {
      console.warn(`skip ${tsid}: ${err.message}`);
      continue;
    }
    const layout = streetQuoinLayout(data, { starter: data.tsid === STREET_INDEX.default });
    if (!layout.length) continue;
    streets[data.tsid] = layout;
    total += layout.length;
  }
  const types = Object.fromEntries(Object.entries(QUOIN_TYPES).map(([id, def]) => [id, def.baseAmount]));
  const out = {
    about: 'Shared street quoins for quoins.go in groddle-afternoon-server. Generated by tools/build-realtime-quoins.mjs from public/assets/streets, street-ecology.json and js/quoins.js; do not edit by hand.',
    format: 'streets[tsid][i] = [x, y, type, class]',
    types,
    classes: classTable(),
    mystery: mysteryTable(),
    streets,
  };
  const text = `${JSON.stringify(out)}\n`;
  if (process.argv.includes('--check')) {
    const now = await readFile(outPath, 'utf8').catch(() => '');
    if (now !== text) {
      console.error(`${outPath} is stale: run node tools/build-realtime-quoins.mjs`);
      process.exit(1);
    }
    console.log(`${outPath} is current (${Object.keys(streets).length} streets, ${total} quoins)`);
    return;
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, text);
  console.log(`${Object.keys(streets).length} streets, ${total} quoins -> ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
