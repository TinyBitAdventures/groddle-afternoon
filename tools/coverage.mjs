#!/usr/bin/env node
/**
 * The restoration scorecard for /dev-glitch-game-coverage: every measure the
 * coverage loop works on, from public/restoration/data.json (rebuild it first
 * with node tools/build-restoration.mjs), the avatar catalog and the gap
 * register in ~/Documents/glitch-audit/research/coverage/register.md.
 *
 *   node tools/coverage.mjs          table
 *   node tools/coverage.mjs --json   machine-readable (for round logs)
 *
 * When the inventory DB exists (node tools/inventory/build.mjs), it also prints one
 * reachable / total line per inventory kind.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const data = read('public/restoration/data.json');
const catalog = read('public/assets/avatar/catalog.json');
const REGISTER = join(homedir(), 'Documents/glitch-audit/research/coverage/register.md');

// Article SWFs in tinyspeck/glitch-avatars (667) that the remake could show: the catalog
// counts GSJS articles plus the few SWF-only ones (tools/avatar-compositor/catalog.json ownColours)
// and the greyscale masters shipped with borrowed colours (reimagined, row G52), named apart.
const WARDROBE_SWFS = 667;
const wardrobe = Object.values(catalog.types || {}).reduce((n, list) => n + list.length, 0);
const reimaginedWardrobe = Object.values(catalog.types || {}).reduce((n, list) => n + list.filter((i) => i.reimagined).length, 0);

const t = data.tally || {};
const playableSystems = (t.source || 0) + (t.rebuilt || 0) + (t.solo || 0) + (t.reimagined || 0);
const allSystems = Object.values(t).reduce((a, b) => a + b, 0);

function registerCounts() {
  if (!existsSync(REGISTER)) return null;
  const rows = readFileSync(REGISTER, 'utf8').split('\n').filter((l) => /^\| G\d+ /.test(l));
  const by = {};
  for (const row of rows) {
    const status = row.split('|').map((c) => c.trim()).filter(Boolean).at(-1) || '?';
    by[status] = (by[status] || 0) + 1;
  }
  return { total: rows.length, by };
}

const measures = [
  ['Systems playable', playableSystems, allSystems, 'checklist statuses (lost ones need other players)'],
  ['Story and skill quests playable', data.quests.playable, data.quests.story, 'quest-offers buckets'],
  ['Private quest rooms', data.rooms.built, data.rooms.total, ''],
  ['Streets on the maps imported', data.streets.onMapsImported, data.streets.onMaps, `${data.streets.imported} imported in all`],
  ['Skills live', data.skills.counts.live, data.skills.total, `${data.skills.counts.partial} partial`],
  ['Imagination cards live', data.imagination.counts.live + data.imagination.counts.starter, data.imagination.total, `${data.imagination.counts.later} later`],
  ['Street projects playable', data.jobs.playableJobs, data.jobs.sourceJobs, ''],
  ['Sound keys with a real recording', data.sounds.playable, data.sounds.keys, `the rest are synth stand-ins${data.sounds.deadKeys ? `; ${data.sounds.deadKeys} dead in the final client not counted` : ''}`],
  ['Item icons sharp (3x)', data.icons.sharp, data.icons.items, ''],
  ['Badges with official art', data.badges.officialArt, data.badges.total, ''],
  ['Wardrobe articles wearable', wardrobe, WARDROBE_SWFS, `${wardrobe - reimaginedWardrobe} + ${reimaginedWardrobe} reimagined (greyscale masters, borrowed colours); bracelets have no container`],
];

/**
 * Per-kind lines from the restoration inventory (tools/inventory/build.mjs), when its DB exists:
 * reachable / total, with the missing, unknown and unbuilt-in-the-original counts.
 */
async function inventoryLines() {
  const path = process.env.INVENTORY_DB || join(homedir(), 'Documents/glitch-audit/research/coverage/inventory.sqlite');
  if (!existsSync(path)) return null;
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path, { readOnly: true });
    const rows = db.prepare('SELECT kind, status, COUNT(*) AS n FROM entities GROUP BY kind, status').all();
    const built = db.prepare('SELECT at, "commit" FROM builds ORDER BY at DESC LIMIT 1').get();
    db.close();
    const by = {};
    for (const r of rows) {
      const k = (by[r.kind] ||= { kind: r.kind, total: 0, reachable: 0, missing: 0, unknown: 0, unbuilt: 0 });
      k.total += r.n;
      if (['source', 'rebuilt', 'solo', 'reimagined'].includes(r.status)) k.reachable += r.n;
      if (r.status === 'missing') k.missing += r.n;
      if (r.status === 'unknown') k.unknown += r.n;
      if (r.status === 'unbuilt_original') k.unbuilt += r.n;
    }
    return { builtAt: built?.at || '', commit: built?.commit || '', kinds: Object.values(by) };
  } catch {
    return null;
  }
}

const inventory = await inventoryLines();
const reg = registerCounts();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ generatedAt: data.generatedAt, measures: measures.map(([name, have, of, note]) => ({ name, have, of, note })), register: reg, inventory }, null, 2));
} else {
  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '');
  console.log(`Restoration scorecard (data.json ${data.generatedAt || '?'})\n`);
  for (const [name, have, of, note] of measures) {
    console.log(`${name.padEnd(36)} ${String(have).padStart(5)} / ${String(of).padEnd(5)} ${pct(have, of).padStart(6)}  ${note}`);
  }
  if (inventory) {
    console.log(`\nInventory (tools/inventory/build.mjs, built ${inventory.builtAt.slice(0, 16)} at ${inventory.commit || '?'}): reachable / total`);
    for (const k of inventory.kinds.sort((a, b) => a.kind.localeCompare(b.kind))) {
      console.log(`  ${k.kind.padEnd(34)} ${String(k.reachable).padStart(5)} / ${String(k.total).padEnd(5)} ${pct(k.reachable, k.total).padStart(6)}  ${k.missing} missing, ${k.unknown} unknown, ${k.unbuilt} unbuilt in the original`);
    }
  }
  if (reg) console.log(`\nGap register: ${reg.total} gaps (${Object.entries(reg.by).map(([k, v]) => `${v} ${k}`).join(', ')})`);
  else console.log(`\nGap register not found at ${REGISTER}`);
}
