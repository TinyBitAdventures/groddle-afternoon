#!/usr/bin/env node
/**
 * The restoration scorecard for /dev-glitch-game-coverage: every measure the
 * coverage loop works on, from public/restoration/data.json (rebuild it first
 * with node tools/build-restoration.mjs), the avatar catalog and the gap
 * register in ~/Documents/glitch-audit/research/coverage/register.md.
 *
 *   node tools/coverage.mjs          table
 *   node tools/coverage.mjs --json   machine-readable (for round logs)
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
// counts GSJS articles plus the few SWF-only ones (tools/avatar-compositor/catalog.json ownColours).
const WARDROBE_SWFS = 667;
const wardrobe = Object.values(catalog.types || {}).reduce((n, list) => n + list.length, 0);

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
  ['Sound keys with a real recording', data.sounds.playable, data.sounds.keys, 'the rest are synth stand-ins'],
  ['Item icons sharp (3x)', data.icons.sharp, data.icons.items, ''],
  ['Badges with official art', data.badges.officialArt, data.badges.total, ''],
  ['Wardrobe articles wearable', wardrobe, WARDROBE_SWFS, 'GSJS articles + SWF-only ones with their own colours; bracelets have no container'],
];

const reg = registerCounts();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ generatedAt: data.generatedAt, measures: measures.map(([name, have, of, note]) => ({ name, have, of, note })), register: reg }, null, 2));
} else {
  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '');
  console.log(`Restoration scorecard (data.json ${data.generatedAt || '?'})\n`);
  for (const [name, have, of, note] of measures) {
    console.log(`${name.padEnd(36)} ${String(have).padStart(5)} / ${String(of).padEnd(5)} ${pct(have, of).padStart(6)}  ${note}`);
  }
  if (reg) console.log(`\nGap register: ${reg.total} gaps (${Object.entries(reg.by).map(([k, v]) => `${v} ${k}`).join(', ')})`);
  else console.log(`\nGap register not found at ${REGISTER}`);
}
