/**
 * Build a compact, playable ecology catalog from Tiny Speck's archived
 * locations-xml item references. The G-prefixed files contain geometry while
 * their L-prefixed aliases retain the late-game item population snapshot.
 *
 * Run from spike root:
 *   node build-street-ecology.mjs
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const streetIndexPath = join(root, 'public/assets/streets/index.json');
const outputPath = join(root, 'public/assets/content/street-ecology.json');
const locationRoot =
  process.env.GRODDLE_LOCATION_XML ||
  '/Users/austin/Documents/glitch-audit/streets/mnt/stos/location_data';

const LABEL_TO_CLASS = Object.freeze({
  Piggy: 'npc_piggy',
  Chicken: 'npc_chicken',
  Butterfly: 'npc_butterfly',
  'Fruit Tree': 'trant_fruit',
  'Egg Plant': 'trant_egg',
  'Bean Tree': 'trant_bean',
  'Bubble Tree': 'trant_bubble',
  'Spice Plant': 'trant_spice',
  'Gas Plant': 'trant_gas',
  'Wood Tree': 'wood_tree',
  'Metal Rock': 'rock_metal_1',
  'Dullite Rock': 'rock_dullite_1',
  'Beryl Rock': 'rock_beryl_1',
  'Sparkly Rock': 'rock_sparkly_1',
  Garden: 'garden',
  'Street Spirit': 'street_spirit',
  // Harvestable world resource nodes (js/resource-nodes.js). Labels are the
  // exact objref labels in the archived location XML; Peat Bog covers the
  // peat_1/peat_2/peat_3 visual variants, which share one label.
  Firefly: 'npc_firefly',
  Salmon: 'npc_salmon',
  'Mortar Barnacle': 'mortar_barnacle',
  'Ice Nubbin': 'ice_knob',
  'Jellisac Growth': 'jellisac',
  'Dirt Pile': 'dirt_pile',
  'Peat Bog': 'peat_1',
  'Paper Tree': 'paper_tree',
  Sloth: 'npc_sloth',
  'Dust Trap': 'dust_trap',
});

/**
 * Soil objects (js/patches.js): Patches, Dark Patches, the one archived
 * Seedling, and dead trants that clear back into a Patch. They are written to
 * a separate top-level `soil` map instead of `counts`, so a street whose only
 * archived objects are patches keeps its playable fallback population.
 */
const SOIL_LABEL_TO_CLASS = Object.freeze({
  Patch: 'patch',
  'Dark Patch': 'patch_dark',
  Seedling: 'patch_seedling',
  'Dead Bean Tree': 'trant_bean_dead',
  'Dead Bubble Tree': 'trant_bubble_dead',
  'Dead Egg Plant': 'trant_egg_dead',
  'Dead Fruit Tree': 'trant_fruit_dead',
  'Dead Gas Plant': 'trant_gas_dead',
  'Dead Spice Plant': 'trant_spice_dead',
});

function soilFromLabels(labels) {
  const counts = {};
  for (const label of labels) {
    const classTsid = SOIL_LABEL_TO_CLASS[label];
    if (classTsid) counts[classTsid] = (counts[classTsid] || 0) + 1;
  }
  return counts;
}

/**
 * Fox Brushing Preserves and Heli Kitties (js/foxes.js, js/heli-kitties.js).
 * Written to a separate top-level `wildlife` map, like `soil`, so kitty-only
 * streets keep their playable fallback population. 51 Fox Rangers, 278 Fox
 * Stop Markers, and 93 Heli Kitties in the archived snapshot.
 */
const WILDLIFE_LABEL_TO_CLASS = Object.freeze({
  'Fox Ranger': 'npc_fox_ranger',
  'Fox Stop Marker': 'fox_stop_marker',
  'Heli Kitty': 'npc_kitty_chicken',
});

function wildlifeFromLabels(labels) {
  const counts = {};
  for (const label of labels) {
    const classTsid = WILDLIFE_LABEL_TO_CLASS[label];
    if (classTsid) counts[classTsid] = (counts[classTsid] || 0) + 1;
  }
  return counts;
}

/**
 * Street furniture (js/street-furniture.js): street Mailboxes, Visiting
 * Stones, placed Notes and Notice Boards. Written to a separate top-level
 * `furniture` map, like `soil`, so furniture-only streets keep their playable
 * fallback population. 265 Mailboxes, 199 Visiting Stones, 135 Notes (63 on
 * the curated-empty Stoot memorial, which stays empty) and 7 Notice Boards in
 * the archived snapshot. Clickable Broadcasters are invisible event triggers
 * whose per-instance `event` props are absent from the dump, so they are not
 * mapped.
 */
const FURNITURE_LABEL_TO_CLASS = Object.freeze({
  Mailbox: 'npc_mailbox',
  'Visiting Stone': 'visiting_stone',
  Note: 'note',
  'Notice Board': 'bag_notice_board',
});

function furnitureFromLabels(labels) {
  const counts = {};
  for (const label of labels) {
    const classTsid = FURNITURE_LABEL_TO_CLASS[label];
    if (classTsid) counts[classTsid] = (counts[classTsid] || 0) + 1;
  }
  return counts;
}

/**
 * Curated source-empty streets. Their archived XML holds only scenery-style
 * objects, and the remake deliberately keeps them uncluttered (for example the
 * private Stoot memorial), so the row is emitted with `empty: true` even when
 * no mapped labels are present.
 */
const CURATED_EMPTY_STREETS = Object.freeze(new Set(['GIFPV9EMLT72DP4']));

const GIANT_ALIASES = Object.freeze({
  alph: 'alph',
  cosma: 'cosma',
  friendly: 'friendly',
  grendaline: 'grendaline',
  humbaba: 'humbaba',
  lem: 'lem',
  mab: 'mab',
  pot: 'pot',
  spriggan: 'spriggan',
  ti: 'ti',
  tii: 'ti',
  zille: 'zille',
});

async function firstReadable(paths) {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next canonical/alias snapshot.
    }
  }
  return null;
}

function locationAliases(tsid) {
  const out = [];
  if (tsid.startsWith('G')) out.push(`L${tsid.slice(1)}`);
  if (tsid.startsWith('L')) out.push(`G${tsid.slice(1)}`);
  out.push(tsid);
  return [...new Set(out)];
}

function itemLabels(xml) {
  const block = xml.match(/<objrefs id="items">([\s\S]*?)<\/objrefs>/)?.[1] || '';
  return [...block.matchAll(/<objref\b[^>]*\blabel="([^"]+)"/g)].map((match) => match[1]);
}

function ecologyFromLabels(labels) {
  const counts = {};
  let giantId = null;
  let spawners = 0;
  for (const label of labels) {
    const classTsid = LABEL_TO_CLASS[label];
    if (classTsid) counts[classTsid] = (counts[classTsid] || 0) + 1;
    if (label.toLowerCase() === 'spawner') spawners += 1;
    const shrine = label.match(/(?:Ix )?Shrine (?:for|to) ([A-Za-z]+)/i);
    if (shrine) giantId = GIANT_ALIASES[shrine[1].toLowerCase()] || giantId;
  }
  return { counts, giantId, spawners };
}

const index = JSON.parse(await readFile(streetIndexPath, 'utf8'));
const streets = {};
const soil = {};
const wildlife = {};
const furniture = {};
for (const [tsid, meta] of Object.entries(index.streets || {})) {
  const candidates = locationAliases(tsid).map((alias) => join(locationRoot, `${alias}.xml`));
  const sourcePath = await firstReadable(candidates);
  if (!sourcePath) continue;
  const sourceTsid = sourcePath.slice(sourcePath.lastIndexOf('/') + 1, -4);
  if (CURATED_EMPTY_STREETS.has(tsid)) {
    streets[tsid] = { label: meta.label || tsid, sourceTsid, counts: {}, empty: true };
    continue;
  }
  const labels = itemLabels(await readFile(sourcePath, 'utf8'));
  const soilCounts = soilFromLabels(labels);
  if (Object.keys(soilCounts).length) soil[tsid] = soilCounts;
  const wildlifeCounts = wildlifeFromLabels(labels);
  if (Object.keys(wildlifeCounts).length) wildlife[tsid] = wildlifeCounts;
  const furnitureCounts = furnitureFromLabels(labels);
  if (Object.keys(furnitureCounts).length) furniture[tsid] = furnitureCounts;
  const ecology = ecologyFromLabels(labels);
  if (!Object.keys(ecology.counts).length && !ecology.giantId && !ecology.spawners) continue;
  streets[tsid] = {
    label: meta.label || tsid,
    sourceTsid,
    counts: ecology.counts,
    ...(ecology.giantId ? { giantId: ecology.giantId } : {}),
    ...(ecology.spawners ? { spawners: ecology.spawners } : {}),
  };
}

const catalog = {
  source: 'tinyspeck/glitch-locations locations-xml.zip item references (CC0)',
  sourceSnapshot: '2012-12 late-game L-prefixed location objects',
  streetCount: Object.keys(streets).length,
  streets,
  soilStreetCount: Object.keys(soil).length,
  soil,
  wildlifeStreetCount: Object.keys(wildlife).length,
  wildlife,
  furnitureStreetCount: Object.keys(furniture).length,
  furniture,
};

await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Wrote ${catalog.streetCount} official street ecologies to ${outputPath}`);
