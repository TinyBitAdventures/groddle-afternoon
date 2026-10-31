/**
 * Build a compact, playable ecology catalog from Tiny Speck's archived
 * locations-xml item references. The G-prefixed files contain geometry while
 * their L-prefixed aliases retain the late-game item population snapshot.
 *
 * Published zones (level builder, docs/level-builder/spec.md 11) have no location XML: their
 * population rows come from public/assets/zones/*.json (tools/builder/zones.mjs mergeZoneEcology),
 * added after Tiny Speck's, so a run keeps them.
 *
 * Run from spike root:
 *   node build-street-ecology.mjs
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { interiorReason } from './public/js/street-ecology.js';
import { VENDOR_NPC_LABELS } from './public/js/vendor-npcs.js';
import { SWOONERFLY_LABEL, SWOONERFLY_CLASS } from './public/js/swoonerflies.js';
import { files, listZones, mergeZoneEcology } from './tools/builder/zones.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const streetIndexPath = join(root, 'public/assets/streets/index.json');
const outputPath = join(root, 'public/assets/content/street-ecology.json');
const locationRoot =
  process.env.GRODDLE_LOCATION_XML ||
  decodeURIComponent(new URL('../streets/mnt/stos/location_data', import.meta.url).pathname);
const gsjsRoot = process.env.GRODDLE_GSJS || join(root, '..', 'glitch-GameServerJS');

/**
 * GameServerJS building lists for street-ecology.js interiorReason(), as
 * G-prefixed tsids: config_prod.js `machine_rooms` and the POL templates in
 * inc_data_pols_prod.js (template key -> template_tsid).
 */
async function buildingLists() {
  const g = (tsid) => `G${tsid.slice(1)}`;
  const machineRooms = new Set();
  const polTemplates = new Map();
  try {
    const config = await readFile(join(gsjsRoot, 'config_prod.js'), 'utf8');
    const list = config.match(/var machine_rooms = \[([^\]]*)\]/)?.[1] || '';
    for (const m of list.matchAll(/'([A-Z0-9]+)'/g)) machineRooms.add(g(m[1]));
  } catch {
    console.warn('config_prod.js not found: machine_rooms skipped');
  }
  try {
    const pols = await readFile(join(gsjsRoot, 'inc_data_pols_prod.js'), 'utf8');
    for (const m of pols.matchAll(/"([a-z_0-9]+)"\s*:\s*\{\s*"template_tsid"\s*:\s*"([A-Z0-9]+)"/g)) polTemplates.set(g(m[2]), m[1]);
  } catch {
    console.warn('inc_data_pols_prod.js not found: POL templates skipped');
  }
  return { machineRooms, polTemplates };
}

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
 * a separate top-level `soil` map instead of `counts`; a street whose only
 * archived objects are patches gets an exact row with no other ecology.
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
 * Written to a separate top-level `wildlife` map, like `soil`. 51 Fox
 * Rangers, 278 Fox Stop Markers, and 93 Heli Kitties in the archived snapshot.
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
 * `furniture` map, like `soil`. 265 Mailboxes, 199 Visiting Stones, 135
 * Notes (63 on the curated-empty Stoot memorial, which stays empty) and 7
 * Notice Boards in the archived snapshot. Clickable Broadcasters are
 * invisible event triggers whose per-instance `event` props are absent from
 * the dump, so they are not mapped.
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
 * Vendor NPCs (js/vendor-npcs.js, features/vendor-npcs-feature.js): the
 * Gardening Tools Vendor, Meal Vendor, Tool Vendor, Uncle Friendly, Helga and
 * the Sno Cone Vending Machine, each with its own catalog_stores.js store. Written to a separate top-level
 * `vendors` map, like `soil`, and read from the `items` objrefs only (the
 * AFLC Frogs listed under __MISSING_ITEMS__ were deleted mail couriers).
 * 11, one per street, in the archived snapshot.
 */
function vendorsFromLabels(labels) {
  const counts = {};
  for (const label of labels) {
    const classTsid = VENDOR_NPC_LABELS[label];
    if (classTsid) counts[classTsid] = (counts[classTsid] || 0) + 1;
  }
  return counts;
}

/**
 * World Swoonerflies (js/swoonerflies.js, features/swoonerflies-feature.js):
 * items/npc_swoonerfly.js objrefs labelled "Swoonerfly", from the `items`
 * objrefs. Written to a separate top-level `swoonerflies` map, like `vendors`.
 * An instanced location (dynamic is_instance true) is skipped: Area 42
 * (LHF8DDDBTPF3P4U, instance_id tower_quest_desert) holds four that a
 * player's squid dropped mid-quest (npc_squid.js:311-317 createSwoonerfly,
 * five calls at 337-405), and Gwendolyn's room already drops those
 * (js/quest-rooms/gwendolyn.js swoonerfly()). Three in the archived snapshot:
 * Parsin's Trail SW, Tower St West and Pandhal Pegs, one each.
 */
function swoonerfliesFromLabels(labels) {
  const n = labels.filter((label) => label === SWOONERFLY_LABEL).length;
  return n ? { [SWOONERFLY_CLASS]: n } : {};
}

function isInstanceLocation(xml) {
  return /<bool id="is_instance">true<\/bool>/.test(xml);
}

/**
 * Curated source-empty streets. Their archived XML holds only scenery-style
 * objects, and the remake deliberately keeps them uncluttered (for example the
 * private Stoot memorial), so the row is emitted with `empty: true` even when
 * no mapped labels are present.
 */
/** items/quoin.js is labelled "Coin"; older objrefs keep the "Quoin" label. */
const QUOIN_LABELS = Object.freeze(new Set(['Quoin', 'Coin']));

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
const lists = await buildingLists();
const streets = {};
const soil = {};
const wildlife = {};
const furniture = {};
const vendors = {};
const swoonerflies = {};
for (const [tsid, meta] of Object.entries(index.streets || {})) {
  const candidates = locationAliases(tsid).map((alias) => join(locationRoot, `${alias}.xml`));
  const sourcePath = await firstReadable(candidates);
  if (!sourcePath) continue;
  const sourceTsid = sourcePath.slice(sourcePath.lastIndexOf('/') + 1, -4);
  if (CURATED_EMPTY_STREETS.has(tsid)) {
    streets[tsid] = { label: meta.label || tsid, sourceTsid, counts: {}, empty: true };
    continue;
  }
  const xml = await readFile(sourcePath, 'utf8');
  const labels = itemLabels(xml);
  const soilCounts = soilFromLabels(labels);
  if (Object.keys(soilCounts).length) soil[tsid] = soilCounts;
  const wildlifeCounts = wildlifeFromLabels(labels);
  if (Object.keys(wildlifeCounts).length) wildlife[tsid] = wildlifeCounts;
  const furnitureCounts = furnitureFromLabels(labels);
  if (Object.keys(furnitureCounts).length) furniture[tsid] = furnitureCounts;
  const vendorCounts = vendorsFromLabels(labels);
  if (Object.keys(vendorCounts).length) vendors[tsid] = vendorCounts;
  const swoonCounts = isInstanceLocation(xml) ? {} : swoonerfliesFromLabels(labels);
  if (Object.keys(swoonCounts).length) swoonerflies[tsid] = swoonCounts;
  const ecology = ecologyFromLabels(labels);
  const geometry = JSON.parse(await readFile(join(root, 'public', meta.file), 'utf8'));
  const interiorWhy = interiorReason({ ...geometry, tsid, hubId: meta.hubId ?? geometry.hubId }, lists);
  if (interiorWhy) {
    // Indoors (street-ecology.js interiorReason): static counts and the
    // archived quoins only; spawners indoors hold items, not animals.
    streets[tsid] = {
      label: meta.label || tsid,
      sourceTsid,
      counts: ecology.counts,
      ...(ecology.giantId ? { giantId: ecology.giantId } : {}),
      interior: true,
      interiorWhy,
      quoins: labels.filter((label) => QUOIN_LABELS.has(label)).length,
    };
    continue;
  }
  if (!Object.keys(ecology.counts).length && !ecology.giantId && !ecology.spawners) {
    // Nothing living, no rocks, garden, street spirit, shrine or spawner: the
    // file is quoins, Qurazy markers, event boxes, patches, notes and the
    // like (Gentle Island Exit: 4 Coins and a Qurazy marker). Austin
    // 2026-10-30: such a street gets only what its file lists, so it gets an
    // exact row (street-ecology.js populationForStreet) with its archived
    // quoins; the soil, furniture, wildlife and vendor maps above still apply.
    // These streets used to get no row, and so the invented fallback set.
    streets[tsid] = {
      label: meta.label || tsid,
      sourceTsid,
      counts: {},
      exact: true,
      quoins: labels.filter((label) => QUOIN_LABELS.has(label)).length,
    };
    continue;
  }
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
  vendorStreetCount: Object.keys(vendors).length,
  vendors,
  swoonerflyStreetCount: Object.keys(swoonerflies).length,
  swoonerflies,
};

mergeZoneEcology(catalog, listZones(files(root)).map((z) => z.zone));
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Wrote ${catalog.streetCount} official street ecologies${catalog.zoneStreetCount ? ` and ${catalog.zoneStreetCount} from published zones` : ''} to ${outputPath}`);
