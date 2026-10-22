// Build public/assets/content/signpost-graph.json: every imported street's
// visible signpost neighbours, keyed by street-index TSID, so a feature can
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
let edges = 0;
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
}
const file = join(pub, 'assets/content/signpost-graph.json');
writeFileSync(file, `${JSON.stringify({ source: 'tools/build-signpost-graph.mjs from assets/streets/*.json visible signposts', streets: graph })}\n`);
console.log(`signpost graph: ${Object.keys(graph).length} streets, ${edges} links -> ${file}`);
