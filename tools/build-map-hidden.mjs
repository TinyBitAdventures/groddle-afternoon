#!/usr/bin/env node
/**
 * The hub map streets the 2012 client left off the map: `invisible_to_outsiders` on a hub
 * map's street object (data/map/Street.as), which MapHub.as drawStreet skips unless you are
 * standing on it (634-640: `if (street.invisible_to_outsiders && !highlight_it) return null`).
 *
 * The GSJS map data (inc_data_maps_prod.js) lists these streets as plain "S" objects with
 * coordinates, and our hub files (public/assets/maps/hubs/hub-<id>.json) keep every one, so the
 * remake drew them all: four "Alakol Start" lines, a "Muufo Start" through the middle of Muufo,
 * the apartment towers and their basements as bare bars in a corner. The Tribute Blog's region
 * maps (Nov 2012, reference only, research/coverage/round5-tribute-blog) show none of them:
 *
 *   greeting streets  the Start streets (config_prod.js greeting_locations): GSJS get_map sets
 *                     not_a_destination and invisible_to_outsiders on them (locations/location.js
 *                     2945-2957). Alakol 46629431194, Bortola 47895873006, Salatu 52753082477,
 *                     Muufo 42806514860.
 *   machine rooms     config_prod.js machine_rooms; location.js is_hidden keeps them out of the
 *                     "A secret place" rule beside the apartment lobbies, "which are hidden on the
 *                     map on purpose" (2836-2843). Besara 41130542933, Groddle Meadow 53378454849.
 *   apartment basements  the "Apt basements" line of that same rule (2842).
 *   apartment towers  the lobbies that rule names; GSJS has no list of them, so they are named
 *                     here (TOWERS) from the blog maps: Aranna 40106877686, Besara 41130542933,
 *                     Bortola 47895873006, Muufo 42806514860, Groddle Meadow 53378454849.
 *   The forgotten floor  Muufo's stray floor at the top edge (193,11)-(393,11), absent from the
 *                     blog's Muufo map 42806514860.
 *
 * The street stays in the hub file (search for "you", Completist counts, the route graph); only
 * the drawing and the Map's street list leave it out (js/map-graph.js), and
 * tools/build-signpost-graph.mjs counts it off the maps, so a room behind a door (a tower, a
 * basement, a machine room) is offered under "Behind doors" like the Hell Bar (G198).
 *
 *   node tools/build-map-hidden.mjs          write
 *   node tools/build-map-hidden.mjs --check  exit 1 if a hub file is stale (tests/map-hidden.test.js)
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = process.env.GSJS_ROOT || join(root, '..', 'glitch-GameServerJS');
const HUB_DIR = join(root, 'public/assets/maps/hubs');
const LEGACY = join(root, 'public/assets/maps/hub-56-groddle-forest.json');
export const FIELD = 'invisible_to_outsiders';

/** The apartment towers (lobbies), by the blog maps (see above). */
export const TOWERS = Object.freeze({
  LIFI4FP9GRU2CC8: 'Sabudana Drama Towers (Aranna, post 40106877686)',
  LHVUR3UKGRU2SD2: 'Egret Taun Towers (Besara, post 41130542933)',
  LA9H1V6OGRU2FSB: 'Hauki Seeks Manor (Bortola, post 47895873006)',
  LHVUFJ6HGRU2V0E: 'Hakusan Heaps Towers (Muufo, post 42806514860)',
  LA5134UPLRU29OH: 'Gregarious Towers (Groddle Meadow, post 53378454849)',
});

/** Streets on no blog map that no GSJS rule names. */
export const STRAYS = Object.freeze({
  LDOOSA8V29J24I3: 'The forgotten floor (Muufo, post 42806514860)',
});

/** The L-tsid of a map street (the hub files keep L-tsids; the remake's files are G-). */
const l = (tsid) => `L${String(tsid).slice(1)}`;

/** greeting_locations, machine_rooms (config_prod.js) and the Apt basements (location.js is_hidden). */
export function readHiddenSources(gsjs = GSJS) {
  const cfg = readFileSync(join(gsjs, 'config_prod.js'), 'utf8');
  const greet = cfg.match(/var greeting_locations = \[[\s\S]*?\n\];/);
  const mach = cfg.match(/var machine_rooms = \[[^\]]*\];/);
  if (!greet || !mach) throw new Error('config_prod.js: greeting_locations or machine_rooms not found');
  const sandbox = {};
  vm.runInNewContext(`${greet[0]}\n${mach[0]}\nthis.greet = greeting_locations; this.mach = machine_rooms;`, sandbox);
  const loc = readFileSync(join(gsjs, 'locations/location.js'), 'utf8');
  const line = loc.split('\n').find((s) => /\/\/ Apt basements/.test(s)) || '';
  const basements = [...line.matchAll(/'(L[A-Z0-9]+)'/g)].map((m) => m[1]);
  if (!basements.length) throw new Error('location.js: the Apt basements line not found');
  return {
    greeting: new Set(sandbox.greet.map((g) => g.tsid)),
    machineRooms: new Set(sandbox.mach),
    basements: new Set(basements),
  };
}

/** Why the client left a map street off (pure): '' when it drew it. */
export function hiddenReason(tsid, src) {
  const k = l(tsid);
  if (src.greeting.has(k)) return 'greeting street';
  if (src.machineRooms.has(k)) return 'machine room';
  if (src.basements.has(k)) return 'apartment basement';
  if (TOWERS[k]) return 'apartment tower';
  if (STRAYS[k]) return 'stray floor';
  return '';
}

/** A hub file's text with the flag set on the streets the client hid (the rest untouched). */
export function patchHubText(text, src) {
  const hub = JSON.parse(text);
  for (const s of hub.streets || []) {
    delete s[FIELD];
    if (hiddenReason(s.tsid, src)) s[FIELD] = true;
  }
  let next = `${JSON.stringify(hub, null, 2)}\n`;
  // A file written with \u escapes keeps them (hub-63's "Likomärkä"; tools/build-map-icons.mjs).
  if (/\\u00[89a-f][0-9a-f]/i.test(text)) next = next.replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return next;
}

export function hubFiles() {
  return [
    ...readdirSync(HUB_DIR).filter((f) => /^hub-\d+\.json$/.test(f)).sort().map((f) => join(HUB_DIR, f)),
    LEGACY,
  ].filter((f) => existsSync(f));
}

async function main() {
  const check = process.argv.includes('--check');
  if (!existsSync(join(GSJS, 'config_prod.js'))) {
    console.error(`no glitch-GameServerJS beside the game (${GSJS})`);
    process.exit(1);
  }
  const src = readHiddenSources();
  const stale = [];
  const counts = {};
  for (const file of hubFiles()) {
    const text = readFileSync(file, 'utf8');
    const next = patchHubText(text, src);
    if (file !== LEGACY) for (const s of JSON.parse(next).streets || []) if (s[FIELD]) counts[hiddenReason(s.tsid, src)] = (counts[hiddenReason(s.tsid, src)] || 0) + 1;
    if (next !== text) {
      stale.push(relative(root, file));
      if (!check) writeFileSync(file, next);
    }
  }
  console.log(`hidden map streets: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}`);
  console.log(`${check ? 'stale' : 'wrote'}: ${stale.length ? stale.join(', ') : 'nothing'}`);
  if (check && stale.length) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
