#!/usr/bin/env node
/**
 * Item-supply report: every item the game asks for, and whether a solo player
 * can get it (tools/job-obtainable.mjs decides obtainability).
 *
 *   node tools/supply-report.mjs            summary + top missing items
 *   node tools/supply-report.mjs --json     full report as JSON
 *   node tools/supply-report.mjs --item X   why X is missing (recipe tree)
 *
 * Demand comes from:
 *  - recipes.json: every recipe's tool and inputs (playable = tool held and
 *    every input obtainable)
 *  - street-jobs.json: excluded jobs whose reason lists missing items
 *    (re-run build-street-jobs.mjs first for fresh numbers)
 *  - quests.json: solo quests' `item` and `make` requirements and the tools
 *    their `work` requirements name
 *  - FEATURE_NEEDS below: items feature modules consume or require
 *
 * Node only.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { obtainableItems } from './job-obtainable.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const content = (name) => JSON.parse(readFileSync(join(root, 'assets/content', name), 'utf8'));

/** Items a feature module consumes or gates on (feature → items). */
export const FEATURE_NEEDS = Object.freeze({
  'rook-attack': ['focusing_orb', 'potion_rook_balm'],
  meditation: ['focusing_orb'],
  teleportation: ['quill', 'paper'],
  'street-furniture': ['paper'],
  foxes: ['fox_bait', 'fox_brush'],
  'hog-haul': ['pig_bait'],
  'rook-woods': ['pick'],
  machines: ['machine_stand', 'fuel_cell'],
});

export async function supplyReport() {
  const { items: have, sources, tools: held } = await obtainableItems();
  const making = await import(join(root, 'js/making.js'));
  const recipes = making.RECIPE_CATALOG;
  const quests = content('quests.json');
  const jobs = content('street-jobs.json');

  const demand = new Map(); // item -> { recipes, jobs, quests, features }
  const want = (id, kind, by) => {
    if (!id || have.has(id)) return;
    if (!demand.has(id)) demand.set(id, { recipes: [], jobs: [], quests: [], features: [] });
    demand.get(id)[kind].push(by);
  };

  // Recipes.
  const recipeRows = [];
  for (const [key, r] of Object.entries(recipes)) {
    const toolOk = !r.tool || held.has(r.tool);
    const missing = (r.inputs || []).map((i) => i.classTsid).filter((id) => !have.has(id));
    if (!toolOk) want(r.tool, 'recipes', key);
    for (const id of missing) want(id, 'recipes', key);
    recipeRows.push({ key, tool: r.tool, playable: toolOk && !missing.length, missing: [...(!toolOk ? [r.tool] : []), ...missing] });
  }

  // Jobs.
  const jobsBlocked = [];
  for (const [id, row] of Object.entries(jobs.excluded || {})) {
    const m = String(row.reason).match(/^needs items the remake cannot make yet: (.*)$/);
    if (!m) continue;
    const blockers = m[1].split(', ');
    jobsBlocked.push({ id, blockers });
    for (const b of blockers) want(b, 'jobs', id);
  }

  // Quests.
  const questRows = [];
  for (const def of Object.values(quests)) {
    if (!def.solo) continue;
    const missing = [];
    for (const req of def.requirements || []) {
      if (req.type === 'item' && req.classId && !have.has(req.classId)) missing.push(req.classId);
      if (req.type === 'make') {
        const recipe = Object.values(recipes).find((r) => String(r.id) === String(req.recipeId));
        const out = req.outputClass || recipe?.outputs?.[0]?.classTsid;
        if (!recipe) missing.push(`recipe:${req.recipeId}`);
        else if (recipe.tool && !held.has(recipe.tool)) missing.push(recipe.tool);
        else for (const i of recipe.inputs || []) if (!have.has(i.classTsid)) missing.push(i.classTsid);
        if (out && !recipe) want(out, 'quests', def.classTsid);
      }
      if (req.type === 'work' && req.classId && !held.has(req.classId) && !have.has(req.classId)) missing.push(req.classId);
    }
    const uniq = [...new Set(missing)];
    for (const id of uniq) if (!id.startsWith('recipe:')) want(id, 'quests', def.classTsid);
    questRows.push({ id: def.classTsid, completable: !uniq.length, missing: uniq });
  }

  // Features.
  for (const [feature, ids] of Object.entries(FEATURE_NEEDS)) for (const id of ids) want(id, 'features', feature);

  const missing = [...demand.entries()]
    .map(([id, d]) => ({ id, ...d, weight: d.recipes.length + d.jobs.length + d.quests.length + d.features.length * 5, recipeTree: explain(id, recipes, have, held) }))
    .sort((a, b) => b.weight - a.weight);

  return {
    counts: {
      obtainableItems: have.size,
      heldTools: held.size,
      recipes: recipeRows.length,
      playableRecipes: recipeRows.filter((r) => r.playable).length,
      sourceJobs: jobs.counts?.sourceJobs,
      playableJobs: jobs.counts?.playableJobs,
      jobsBlockedByItems: jobsBlocked.length,
      soloQuests: questRows.length,
      completableQuests: questRows.filter((q) => q.completable).length,
      missingItems: missing.length,
    },
    missing,
    recipes: recipeRows,
    quests: questRows,
    sources: Object.fromEntries([...have].sort().map((id) => [id, sources[id] || 'tool'])),
  };
}

/** For a missing item: the recipes that would make it and what each lacks (one level). */
function explain(id, recipes, have, held) {
  const rows = [];
  for (const [key, r] of Object.entries(recipes)) {
    if (!(r.outputs || []).some((o) => o.classTsid === id)) continue;
    const lack = [];
    if (r.tool && !held.has(r.tool)) lack.push(`tool:${r.tool}`);
    for (const i of r.inputs || []) if (!have.has(i.classTsid)) lack.push(i.classTsid);
    rows.push({ key, tool: r.tool, lack });
  }
  return rows;
}

async function main() {
  const report = await supplyReport();
  const args = process.argv.slice(2);
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 1));
    return;
  }
  const at = args.indexOf('--item');
  if (at >= 0) {
    const id = args[at + 1];
    const row = report.missing.find((m) => m.id === id);
    console.log(row ? JSON.stringify(row, null, 1) : `${id}: obtainable (${report.sources[id] || 'tool'})`);
    return;
  }
  console.log(JSON.stringify(report.counts, null, 1));
  for (const m of report.missing.slice(0, Number(args[0]) || 60)) {
    const why = m.recipeTree.length
      ? m.recipeTree.map((r) => `${r.key}[${r.lack.join('+') || 'ok'}]`).join(' | ')
      : 'no recipe';
    console.log(`${m.id}  r${m.recipes.length} j${m.jobs.length} q${m.quests.length} f${m.features.length}  <- ${why}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
