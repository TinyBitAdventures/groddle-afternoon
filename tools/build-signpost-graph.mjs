// Build public/assets/content/signpost-graph.json: every imported street's
// visible signpost neighbours (and, under `doors`, its door neighbours), keyed by street-index TSID, so a feature can
// route across streets without loading 1,400 street files (the Contraband's
// "check the address" path, js/smuggling.js routeTo).
//
// Usage: node tools/build-signpost-graph.mjs           write it
//        node tools/build-signpost-graph.mjs --check   exit 1 if the file is stale (tests/map-routes.test.js)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { obtainableItems } from './job-obtainable.mjs';

const check = process.argv.includes('--check');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const index = JSON.parse(readFileSync(join(pub, 'assets/streets/index.json'), 'utf8'));
const keys = new Set(Object.keys(index.streets));

// street-loader.js resolveIndexTsid aliases (L <-> G).
function resolve(tsid) {
  if (!tsid) return null;
  if (keys.has(tsid)) return tsid;
  const alt = tsid.startsWith('L') ? `G${tsid.slice(1)}` : tsid.startsWith('G') ? `L${tsid.slice(1)}` : null;
  return alt && keys.has(alt) ? alt : null;
}

const graph = {};
// Doors (G192): the client routes through a door when no signpost leads on
// (TSFrontController.startLocationPath 1791-1799 loc_path_door), so door-only
// rooms (the Hell Bar behind Panka Surazu, Vicar's Peak) can end a route.
// Visible doors with one fixed destination; random-destination doors and
// same-street doors are not edges. Locked doors are kept with their key, so a
// route takes them only when there is no other way (js/map-routes.js).
// A door whose key nothing gives is no way at all (Austin, 2026-11-03: a route to Hazy Gate 3
// went through Level 2 West's Yellow-Teal Square Key door into Oppidan Avenue, when Keys 7-10 and
// 12 had no source). tools/job-obtainable.mjs is the remake's own list of what a player can get, so
// such a door is left out of `doors` and listed under `sealed` ("from>to": key id) instead: routes,
// the Map's rooms and the quest hold's reachability (js/quest-reach.js) never count it. None today:
// Dust Traps drop those keys too (js/resource-nodes.js dust_trap_rare_keys, our design).
const { items: obtainable } = await obtainableItems();
const keyGiven = (keyId) => obtainable.has(`door_key_${keyId}`);
const doors = {};
const doorKeys = {};
const sealed = {};
let edges = 0;
let doorEdges = 0;
for (const [key, meta] of Object.entries(index.streets)) {
  const data = JSON.parse(readFileSync(join(pub, meta.file), 'utf8'));
  const out = new Set();
  for (const sign of data.signposts || []) {
    if (sign?.hidden) continue;
    for (const c of sign.connects || []) {
      if (!c || c.hidden) continue;
      const to = resolve(c.tsid);
      if (to && to !== key) out.add(to);
    }
  }
  graph[key] = [...out].sort();
  edges += out.size;
  const through = new Map();
  // Two doors to one room: an unlocked one wins, then one whose key can be had.
  const rank = (keyId) => (!keyId ? 0 : keyGiven(keyId) ? 1 : 2);
  for (const door of data.doors || []) {
    if (!door || door.hidden || door.destinations?.length) continue;
    const to = resolve(door.connect?.street || door.connect?.tsid);
    if (!to || to === key) continue;
    const keyId = Number(door.key_id) || 0;
    if (!through.has(to) || rank(keyId) < rank(through.get(to))) through.set(to, keyId);
  }
  for (const [to, keyId] of [...through]) {
    if (rank(keyId) < 2) continue;
    sealed[`${key}>${to}`] = keyId;
    through.delete(to);
  }
  if (through.size) {
    doors[key] = [...through.keys()].sort();
    doorEdges += through.size;
    for (const [to, keyId] of through) if (keyId) doorKeys[`${key}>${to}`] = keyId;
  }
}

// Streets no hub map draws (G198, and the hidden ones, round 5 maps): the Map's "Set a destination" can only pick
// a drawn street (InteractionMenuController.startLocationMenu 133-160 is the
// hub map's street menu), so js/map-routes.js doorRooms() lists the rooms
// behind doors from these. Hub maps: assets/maps/index.json -> hubs/*.json streets.
const drawn = new Set();
const mapIndexFile = join(pub, 'assets/maps/index.json');
if (existsSync(mapIndexFile)) {
  const mapIndex = JSON.parse(readFileSync(mapIndexFile, 'utf8'));
  for (const hub of Object.values(mapIndex.hubs || {})) {
    if (!hub?.file || !existsSync(join(pub, hub.file))) continue;
    const data = JSON.parse(readFileSync(join(pub, hub.file), 'utf8'));
    for (const s of data.streets || []) {
      // A street the client left off the map (tools/build-map-hidden.mjs) is not drawn: a tower,
      // basement or machine room is then a room behind its door, as the Hell Bar is.
      if (s?.invisible_to_outsiders) continue;
      const k = resolve(s?.tsid);
      if (k) drawn.add(k);
    }
  }
}
const offMap = [...keys].filter((k) => !drawn.has(k)).sort();

const file = join(pub, 'assets/content/signpost-graph.json');
const text = `${JSON.stringify({ source: 'tools/build-signpost-graph.mjs from assets/streets/*.json visible signposts and doors (not the doors whose key nothing gives, tools/job-obtainable.mjs), assets/maps/hubs/*.json drawn streets', streets: graph, doors, doorKeys, sealed, offMap })}\n`;
const summary = `${Object.keys(graph).length} streets, ${edges} links, ${doorEdges} door links (${Object.keys(doorKeys).length} locked), ${Object.keys(sealed).length} doors no key opens, ${offMap.length} off the hub maps`;
if (check) {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (current !== text) {
    console.error(`stale: ${file} (rebuild with node tools/build-signpost-graph.mjs; would be ${summary})`);
    process.exit(1);
  }
  console.log(`signpost graph current: ${summary}`);
} else {
  writeFileSync(file, text);
  console.log(`signpost graph: ${summary} -> ${file}`);
}
