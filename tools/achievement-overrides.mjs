#!/usr/bin/env node
/**
 * Badge conditions the remake adds where Tiny Speck's own file has none, each
 * cited. The content build (glitch-audit/scripts/extract-gsjs-content.mjs, outside
 * git) writes public/assets/content/achievements.json from GSJS achievements/*.js
 * and applies this table last, and the inventory (tools/inventory/build.mjs)
 * judges the badges with it, so a rebuild keeps the condition.
 *
 *   node tools/achievement-overrides.mjs          apply to achievements.json
 *   node tools/achievement-overrides.mjs --check  exit 1 when achievements.json is stale
 *
 * A row applies only while the GSJS file still has no conditions of its own.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ACHIEVEMENT_CONDITION_OVERRIDES = Object.freeze({
  // #154 (Austin 2026-11-09: make it earnable, Eleven Giants' rule). Tiny Speck's
  // achievements/brillah_completist.js:17 ships `var conditions = {};`, so nothing
  // granted it; Eleven Giants' eleven-gsjs/achievements/brillah_completist.js:18-23
  // wires it like every other hub Completist: Brillah is hub 112, 27 streets on its map.
  brillah_completist: Object.freeze({
    conditions: Object.freeze([
      Object.freeze({ id: '1000', type: 'counter', group: 'streets_visited_in_hub', name: 'number_112', num: 27, desc: 'number_112' }),
    ]),
    source: 'eleven-gsjs/achievements/brillah_completist.js:18-23',
  }),
});

/** achievements.json shape ({ id: { conditions: [{ id, type, group, name, num, desc }] } }), changed in place. */
export function applyAchievementOverrides(catalog) {
  for (const [id, row] of Object.entries(ACHIEVEMENT_CONDITION_OVERRIDES)) {
    const def = catalog[id];
    if (!def || (def.conditions || []).length) continue;
    def.conditions = row.conditions.map((c) => ({ ...c }));
  }
  return catalog;
}

/** tools/inventory/gsjs-data.mjs readAchievements shape ([{ id, conditions: [{ id, type, group, name, num }] }]). */
export function withAchievementOverrides(list) {
  return list.map((a) => {
    const row = ACHIEVEMENT_CONDITION_OVERRIDES[a.id];
    if (!row || (a.conditions || []).length) return a;
    return { ...a, conditions: row.conditions.map(({ id, type, group, name, num }) => ({ id, type, group, name, num })), conditionsFrom: row.source };
  });
}

const here = dirname(fileURLToPath(import.meta.url));
export const ACHIEVEMENTS_JSON = join(here, '../public/assets/content/achievements.json');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = readFileSync(ACHIEVEMENTS_JSON, 'utf8');
  const next = JSON.stringify(applyAchievementOverrides(JSON.parse(text)));
  if (process.argv.includes('--check')) {
    if (next !== text) {
      console.error('achievements.json is missing a condition override: run node tools/achievement-overrides.mjs');
      process.exit(1);
    }
    console.log('achievements.json carries every condition override');
  } else if (next !== text) {
    writeFileSync(ACHIEVEMENTS_JSON, next);
    console.log(`achievements.json: applied ${Object.keys(ACHIEVEMENT_CONDITION_OVERRIDES).length} condition override(s)`);
  } else {
    console.log('achievements.json already carries every condition override');
  }
}
