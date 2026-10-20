/**
 * Which item classes a solo player can actually get in the remake today, for
 * classifying street projects (build-street-jobs.mjs, tests/street-jobs.test.js).
 *
 * Sources, in order:
 *  - every ordinary street-spirit store (vendor.js VENDOR_PROFILES)
 *  - harvest systems: living trants, garden crops, mine rock chunks, ore
 *    grinder elements, smelted Plain Metal, Wood Tree planks, Animal Kinship
 *    yields, soil and resource-node drop tables, fox fiber
 *  - then a fixpoint over recipes.json: a recipe adds its outputs once its
 *    tool and every input are obtainable
 *
 * Node only (reads recipes.json from disk).
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const js = (name) => join(root, 'js', name);

function walkClassTsids(value, out) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const row of value) walkClassTsids(row, out);
    return;
  }
  for (const [key, row] of Object.entries(value)) {
    if ((key === 'classTsid' || key === 'class_id') && typeof row === 'string') out.add(row);
    else walkClassTsids(row, out);
  }
}

export async function obtainableItems() {
  const vendor = await import(js('vendor.js'));
  const making = await import(js('making.js'));
  await making.loadRecipeCatalogFromFile(join(root, 'assets/content/recipes.json'));
  const trants = await import(js('trants.js'));
  const garden = await import(js('garden.js'));
  const mining = await import(js('mining.js'));
  const resources = await import(js('resource-nodes.js'));
  const patches = await import(js('patches.js'));
  const tools = await import(js('tools.js'));

  const have = new Set();
  const sources = {};
  const add = (id, source) => {
    if (!id || have.has(id)) return;
    have.add(id);
    sources[id] = source;
  };

  for (const profile of Object.values(vendor.VENDOR_PROFILES)) {
    for (const offer of profile.offers || []) add(offer.classTsid, `vendor:${profile.key}`);
  }
  for (const meta of Object.values(trants.TRANT_META)) add(meta.fruitClass, 'trant');
  for (const seed of Object.values(garden.SEED_CATALOG)) {
    if (have.has(seed.seedId)) add(seed.cropId, 'garden');
  }
  for (const rock of Object.values(mining.ROCK_CATALOG)) add(rock.chunkId, 'mining');
  for (const rows of Object.values(mining.CRUSH_YIELDS)) for (const row of rows) add(row.classTsid, 'ore_grinder');
  add('plain_metal', 'smelter');
  add('plank', 'wood_tree');
  for (const id of ['meat', 'grain', 'milk_butterfly']) add(id, 'animal_kinship');
  add('fiber', 'fox_brushing');
  const drops = new Set();
  walkClassTsids(resources.RESOURCE_DROP_TABLES, drops);
  walkClassTsids(resources.RESOURCE_ITEM_DEFS, drops);
  walkClassTsids(patches.SOIL_DROP_TABLES, drops);
  walkClassTsids(patches.SOIL_ITEM_DEFS, drops);
  for (const id of drops) add(id, 'harvest');
  for (const id of Object.keys(resources.RESOURCE_ITEM_DEFS || {})) add(id, 'harvest');
  for (const id of Object.keys(patches.SOIL_ITEM_DEFS || {})) add(id, 'harvest');

  const toolOk = (tool) => !tool || have.has(tool) || tool in making.TOOL_CATALOG;
  let grew = true;
  while (grew) {
    grew = false;
    for (const recipe of Object.values(making.RECIPE_CATALOG)) {
      if (!toolOk(recipe.tool)) continue;
      if (!(recipe.inputs || []).every((input) => have.has(input.classTsid))) continue;
      for (const output of recipe.outputs || []) {
        if (!have.has(output.classTsid)) {
          add(output.classTsid, `recipe:${recipe.tool || 'hand'}`);
          grew = true;
        }
      }
    }
  }

  // Tools a player can hold: the making catalog, condition-tracked tools, and
  // anything a store sells.
  const toolIds = new Set([
    ...Object.keys(making.TOOL_CATALOG),
    ...Object.keys(tools.TOOL_CONDITION_CATALOG),
    'focusing_orb',
  ]);
  const heldTools = new Set([...toolIds].filter((id) => have.has(id) || id in making.TOOL_CATALOG));
  return { items: have, sources, tools: heldTools };
}
