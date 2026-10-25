// Build public/assets/content/signpost-graph.json: every imported street's
// visible signpost neighbours (and, under `doors`, its door neighbours), keyed by street-index TSID, so a feature can
// route across streets without loading 1,400 street files (the Contraband's
// "check the address" path, js/smuggling.js routeTo).
//
// Usage: node tools/build-signpost-graph.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const doors = {};
const doorKeys = {};
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
  for (const door of data.doors || []) {
    if (!door || door.hidden || door.destinations?.length) continue;
    const to = resolve(door.connect?.street || door.connect?.tsid);
    if (!to || to === key) continue;
    const keyId = Number(door.key_id) || 0;
    // Two doors to one room: an unlocked one wins.
    if (!through.has(to) || !keyId) through.set(to, keyId);
  }
  if (through.size) {
    doors[key] = [...through.keys()].sort();
    doorEdges += through.size;
    for (const [to, keyId] of through) if (keyId) doorKeys[`${key}>${to}`] = keyId;
  }
}
const file = join(pub, 'assets/content/signpost-graph.json');
writeFileSync(file, `${JSON.stringify({ source: 'tools/build-signpost-graph.mjs from assets/streets/*.json visible signposts and doors', streets: graph, doors, doorKeys })}\n`);
console.log(`signpost graph: ${Object.keys(graph).length} streets, ${edges} links, ${doorEdges} door links (${Object.keys(doorKeys).length} locked) -> ${file}`);
