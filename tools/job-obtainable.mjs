/**
 * Which item classes a solo player can actually get in the remake today, for
 * classifying street projects (build-street-jobs.mjs, tests/street-jobs.test.js)
 * and the supply report (tools/supply-report.mjs).
 *
 * Sources:
 *  - every ordinary street-spirit store (vendor.js VENDOR_PROFILES), the
 *    Fox Ranger (foxes.js FOX_RANGER_STORE) and the Bureaucratic Hall clerks
 *    (bureaucracy.js: Your Papers, General Building Permit)
 *  - the starting kit's tools (making STARTER_TOOL_IDS, garden, mining and
 *    resource-node starter tools, the Hatchet); starter consumables are not
 *    counted because they run out
 *  - harvest systems: living trants, mine rock chunks, smelted Plain Metal,
 *    Wood Tree planks, Animal Kinship yields and drop tables, Batterfly
 *    Guano, soil and resource-node drop
 *    tables, fox fiber
 *  - then a fixpoint over every conversion: recipes.json (a recipe needs its
 *    tool held and every input; machine recipes burn fuel from the machine's
 *    tank, js/machines.js), garden seeds into crops, pack transforms
 *    (js/item-transforms.js: butter, cheese, herb seeds), Piggy Plop from
 *    crops, egg incubation, Herdkeeping capture, machine assembly
 *    from a Machine Stand and parts, the Still's Hooch, Paper into Notes, and
 *    the holiday paths in js/seasons.js (Zilloween pumpkin carving makes
 *    Pepitas; Jack-O-Lantern treats, Glitchmas stock and Egg Hunt eggs only
 *    run while their event is on)
 *
 * A tool counts as held only when one of those sources gives it.
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

/** Every conversion as { inputs: [ids], tool, outputs: [ids], source }. */
export async function supplyConversions() {
  const making = await import(js('making.js'));
  await making.loadRecipeCatalogFromFile(join(root, 'assets/content/recipes.json'));
  const garden = await import(js('garden.js'));
  const transforms = await import(js('item-transforms.js'));
  const machines = await import(js('machines.js'));

  const rows = [];
  for (const [key, recipe] of Object.entries(making.RECIPE_CATALOG)) {
    rows.push({
      inputs: (recipe.inputs || []).map((i) => i.classTsid),
      tool: recipe.tool || null,
      outputs: (recipe.outputs || []).map((o) => o.classTsid),
      source: `recipe:${key}`,
    });
  }
  for (const seed of Object.values(garden.SEED_CATALOG)) {
    rows.push({ inputs: [seed.seedId], tool: null, outputs: [seed.cropId], source: `garden:${seed.seedId}` });
  }
  for (const edge of transforms.transformEdges()) {
    rows.push({ inputs: [edge.from], tool: null, outputs: [edge.to], source: `transform:${edge.verb}` });
  }
  for (const [from, verbs] of Object.entries(transforms.ITEM_TRANSFORMS)) {
    for (const t of verbs) if (t.becomes) rows.push({ inputs: [from], tool: null, outputs: [t.becomes], source: `transform:${t.id}` });
  }
  for (const [machine, def] of Object.entries(machines.MACHINE_ASSEMBLIES)) {
    rows.push({ inputs: [machines.MACHINE_STAND, ...def.parts], tool: null, outputs: [machine], source: 'assembly' });
  }
  for (const id of Object.keys(machines.STILL.distillables)) {
    rows.push({ inputs: [id], tool: machines.STILL.classTsid, outputs: ['hooch'], source: 'still' });
  }
  rows.push({ inputs: ['paper'], tool: null, outputs: ['note'], source: 'paper:write' });
  // Animal husbandry (js/animal-husbandry.js): a Piggy fed 3+ crops plops,
  // a Chicken incubates seasoned eggs, Herdkeeping turns Pig Bait into a
  // Hog-tied Piggy.
  const husbandry = await import(js('animal-husbandry.js'));
  for (const crop of Object.keys(husbandry.PIGGY_CROP_SEEDS)) {
    rows.push({ inputs: [crop], tool: null, outputs: ['plop'], source: 'piggy_plop' });
  }
  for (const [egg, baby] of Object.entries(husbandry.INCUBATION.hatches)) {
    rows.push({ inputs: [egg], tool: null, outputs: [baby], source: 'incubation' });
  }
  rows.push({ inputs: [husbandry.HERDKEEPING.bait], tool: null, outputs: ['hogtied_piggy'], source: 'herdkeeping' });
  // Seasonal (js/seasons.js): Zilloween pumpkin carving (Pepitas), smashing, lighting; Glitchmas unwraps.
  const seasons = await import(js('seasons.js'));
  rows.push(...seasons.seasonalConversions());
  return rows;
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
  const foxes = await import(js('foxes.js'));
  const bureaucracy = await import(js('bureaucracy.js'));

  const have = new Set();
  const sources = {};
  const add = (id, source) => {
    if (!id || have.has(id)) return false;
    have.add(id);
    sources[id] = source;
    return true;
  };

  for (const profile of Object.values(vendor.VENDOR_PROFILES)) {
    for (const offer of profile.offers || []) add(offer.classTsid, `vendor:${profile.key}`);
  }
  for (const item of foxes.FOX_RANGER_STORE.items) add(item.classTsid, 'vendor:fox_ranger');
  // Bureaucratic Hall clerks (supply feature), after the Legalize It card.
  for (const id of Object.keys(bureaucracy.BUREAUCRACY_ITEMS)) add(id, 'vendor:bureaucracy');
  // Holiday-only sources (js/seasons.js): Jack-O-Lantern treats, Glitchmas stock and quest, Egg Hunt eggs.
  const seasons = await import(js('seasons.js'));
  for (const [id, source] of seasons.seasonalSources()) add(id, source);

  const starterTools = [
    ...making.STARTER_TOOL_IDS,
    ...Object.keys(garden.starterGardenTools()),
    ...Object.keys(resources.starterResourceTools()),
    ...Object.keys(mining.starterMiningTools()).filter((id) => id !== 'fuel_cell'),
    'hatchet',
  ];
  for (const id of starterTools) add(id, 'starter');

  for (const meta of Object.values(trants.TRANT_META)) add(meta.fruitClass, 'trant');
  for (const rock of Object.values(mining.ROCK_CATALOG)) add(rock.chunkId, 'mining');
  for (const rows of Object.values(mining.CRUSH_YIELDS)) for (const row of rows) add(row.classTsid, 'ore_grinder');
  add('plain_metal', 'smelter');
  add('plank', 'wood_tree');
  for (const id of ['meat', 'grain', 'milk_butterfly']) add(id, 'animal_kinship');
  // Batterflies on cave streets release Guano when fed any food (and hourly);
  // Animal Kinship V+ drop tables (squeeze: seasoned eggs, Musicblocks; nibble: bacon).
  const husbandry = await import(js('animal-husbandry.js'));
  add('guano', 'batterfly');
  for (const id of husbandry.akDropItems()) add(id, 'animal_kinship_drop');
  add(foxes.FIBER_ID, 'fox_brushing');
  const drops = new Set();
  walkClassTsids(resources.RESOURCE_DROP_TABLES, drops);
  walkClassTsids(resources.RESOURCE_ITEM_DEFS, drops);
  walkClassTsids(patches.SOIL_DROP_TABLES, drops);
  walkClassTsids(patches.SOIL_ITEM_DEFS, drops);
  for (const id of drops) add(id, 'harvest');
  for (const id of Object.keys(resources.RESOURCE_ITEM_DEFS || {})) add(id, 'harvest');
  for (const id of Object.keys(patches.SOIL_ITEM_DEFS || {})) add(id, 'harvest');

  const conversions = await supplyConversions();
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of conversions) {
      if (row.tool && !have.has(row.tool)) continue;
      if (!row.inputs.every((id) => have.has(id))) continue;
      for (const out of row.outputs) {
        if (add(out, row.source.startsWith('recipe:') ? `recipe:${row.tool || 'hand'}` : row.source)) grew = true;
      }
    }
  }

  // Tools a player can hold: anything above that is a tool.
  const toolIds = new Set([
    ...Object.keys(making.TOOL_CATALOG),
    ...Object.keys(tools.TOOL_CONDITION_CATALOG),
    'focusing_orb',
    'still',
  ]);
  const heldTools = new Set([...toolIds].filter((id) => have.has(id)));
  return { items: have, sources, tools: heldTools };
}
