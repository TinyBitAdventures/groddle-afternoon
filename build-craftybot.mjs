/**
 * Build the Craftybot job catalog from Tiny Speck's GameServerJS sources.
 *
 * Reads:
 *   items/catalog_craftytasking.js   1,162 static build specs (craftytasking_specs), one per
 *                                     item class, each the nested recipe tree the Crafty Bot
 *                                     walks (utils/craftytasking.js craftytasking_get_static_build_spec)
 *   public/assets/content/recipes.json the remake's recipe catalog (menu coverage only)
 *
 * Writes:
 *   public/assets/content/craftybot-specs.json
 *     { source, coverage, specs }: only the specs queueAdd accepts (a spec with
 *     `ingredients`, npc_crafty_bot.js queueAdd), stripped to the fields
 *     craftytasking_build_sequence reads (class_tsid, count, energy_cost,
 *     fuel_cost, tool, machine, recipe_id, ingredients, and the top-level
 *     required_ingredients it scans for elements).
 *
 * The catalog is evaluated in a node:vm sandbox; nothing from the Rhino host runs.
 *
 * Run from spike root:
 *   node build-craftybot.mjs          write the JSON and print coverage
 *   node build-craftybot.mjs --check  fail when the JSON on disk is stale
 */

import vm from 'node:vm';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const GSJS = process.env.GLITCH_GSJS || join(process.env.HOME || '', 'Documents/glitch-audit/glitch-GameServerJS');
const CATALOG = join(GSJS, 'items/catalog_craftytasking.js');
const OUT = join(root, 'public/assets/content/craftybot-specs.json');
const RECIPES = join(root, 'public/assets/content/recipes.json');

const ELEMENTS = new Set(['element_red', 'element_green', 'element_blue', 'element_shiny']);

export function loadCraftytaskingSpecs(file = CATALOG) {
  const src = readFileSync(file, 'utf8').replace(/^var craftytasking_specs = \{\};/m, '');
  const ctx = { craftytasking_specs: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'catalog_craftytasking.js' });
  return JSON.parse(JSON.stringify(ctx.craftytasking_specs));
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** The fields craftytasking_build_sequence(_step) and build_shopping_list_step read. */
export function stripSpec(spec, top = true) {
  const out = { class_tsid: spec.class_tsid, count: num(spec.count) };
  if (num(spec.energy_cost)) out.energy_cost = num(spec.energy_cost);
  if (num(spec.fuel_cost)) out.fuel_cost = num(spec.fuel_cost);
  if (spec.recipe_id != null) out.recipe_id = String(spec.recipe_id);
  if (spec.tool && spec.tool.class_tsid) {
    out.tool = { class_tsid: spec.tool.class_tsid, wait_ms: num(spec.tool.wait_ms) };
    if (spec.tool.verb) out.tool.verb = spec.tool.verb;
    if (spec.tool.tool_wear != null) out.tool.tool_wear = num(spec.tool.tool_wear);
  }
  if (spec.machine && spec.machine.class_tsid) {
    out.machine = { class_tsid: spec.machine.class_tsid, wait_ms: num(spec.machine.wait_ms) };
    if (spec.machine.fuel_cost) out.machine.fuel_cost = num(spec.machine.fuel_cost);
  }
  if (top && spec.required_ingredients) {
    const req = {};
    for (const [k, v] of Object.entries(spec.required_ingredients)) req[k] = num(v);
    out.required_ingredients = req;
  }
  if (spec.ingredients) {
    out.ingredients = Object.keys(spec.ingredients)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => stripSpec(spec.ingredients[k], false));
  }
  return out;
}

function walk(spec, fn) {
  fn(spec);
  for (const ing of spec.ingredients || []) walk(ing, fn);
}

export function buildCraftybotCatalog(all, recipes = {}) {
  const specs = {};
  const keys = Object.keys(all).sort();
  for (const k of keys) {
    if (!all[k]?.ingredients) continue;
    specs[k] = stripSpec(all[k]);
  }
  const byOutput = {};
  for (const r of Object.values(recipes)) for (const o of r.outputs || []) byOutput[o.classTsid] ||= r;
  const coverage = {
    sourceSpecs: keys.length,
    queueable: Object.keys(specs).length,
    withMachineStep: 0,
    withElements: 0,
    withFirefly: 0,
    topTools: {},
    menu: 0,
    menuSkipped: { noRemakeRecipe: [], machineRecipe: [], furniture: [] },
  };
  for (const [k, s] of Object.entries(specs)) {
    let machine = false;
    let firefly = false;
    walk(s, (n) => {
      if (n.machine) machine = true;
      if (n.class_tsid === 'firefly') firefly = true;
    });
    if (machine) coverage.withMachineStep += 1;
    if (firefly) coverage.withFirefly += 1;
    if (Object.keys(s.required_ingredients || {}).some((c) => ELEMENTS.has(c))) coverage.withElements += 1;
    const tool = s.tool?.class_tsid || (s.machine ? `machine:${s.machine.class_tsid}` : 'none');
    coverage.topTools[tool] = (coverage.topTools[tool] || 0) + 1;
    // The client's Which tool? / Which recipe? lists (WorldModel.getRecipesByTool defaults):
    // catalog recipes only, no furniture outputs, no recipes with a fuel_cell input (machines).
    const recipe = byOutput[k];
    if (!recipe) coverage.menuSkipped.noRemakeRecipe.push(k);
    // build-recipes.mjs moves a machine recipe's fuel_cell input into `fuel`.
    else if (recipe.fuel || (recipe.inputs || []).some((i) => i.classTsid === 'fuel_cell')) coverage.menuSkipped.machineRecipe.push(k);
    else if (k.startsWith('furniture_') || k.startsWith('bag_furniture_')) coverage.menuSkipped.furniture.push(k);
    else coverage.menu += 1;
  }
  coverage.topTools = Object.fromEntries(Object.entries(coverage.topTools).sort((a, b) => b[1] - a[1]));
  return {
    source: 'glitch-GameServerJS items/catalog_craftytasking.js (craftytasking_specs), stripped by build-craftybot.mjs',
    coverage,
    specs,
  };
}

function main() {
  const all = loadCraftytaskingSpecs();
  const recipesRaw = existsSync(RECIPES) ? JSON.parse(readFileSync(RECIPES, 'utf8')) : {};
  const recipes = recipesRaw.recipes || recipesRaw;
  const out = buildCraftybotCatalog(all, recipes);
  const text = `${JSON.stringify(out)}\n`;
  if (process.argv.includes('--check')) {
    const disk = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (disk !== text) {
      console.error('craftybot-specs.json is stale: run node build-craftybot.mjs');
      process.exit(1);
    }
    console.log('craftybot-specs.json is current');
    return;
  }
  writeFileSync(OUT, text);
  const c = out.coverage;
  console.log(`source specs ${c.sourceSpecs}, queueable ${c.queueable}, in the job menu ${c.menu}`);
  console.log(`machine steps ${c.withMachineStep}, element jobs ${c.withElements}, firefly ${c.withFirefly}`);
  console.log(`menu skips: no remake recipe ${c.menuSkipped.noRemakeRecipe.length}, machine recipes ${c.menuSkipped.machineRecipe.length}, furniture ${c.menuSkipped.furniture.length}`);
  console.log(`wrote ${OUT} (${(text.length / 1024).toFixed(0)} KB)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
