/**
 * Source-derived street population plus deterministic, collision-aware
 * placement on recovered locations-xml platforms.
 */

import { avatarHeadReach, groundBeneath, isItemSolid, isStandable, platformYAt, worldToScreen } from './street-model.js?v=505d8990';
import { behindFloor } from './reach.js?v=4187d746';

export const STREET_ECOLOGY_URL = 'assets/content/street-ecology.json?v=official-ecology-6';

/**
 * Interior hubs: every street in them is indoors, and their archived item
 * lists hold no animals, fruit or Musicblocks. Jethimadh Tower: Base (hub 77,
 * inc_data_maps_prod.js) is six corridors whose objrefs are Quoins (labelled
 * "Quoin" or "Coin", the same quoin class), a Qurazy marker and one spawner
 * each; the Glitch Forever wiki has those spawners dropping keys and drinks
 * (C3's key, C5's Cloud 11 Smoothies, C6's Slow Gin Fizz), never animals.
 * build-street-ecology.mjs marks their rows `interior: true` with the archived
 * quoin count; populationForStreet then keeps only the exact static counts.
 * Rows a feature builds for rebuilt rooms (tower-rooms-feature) do the same.
 */
export const INTERIOR_HUBS = Object.freeze({ 77: 'Jethimadh Tower: Base' });

export function isInteriorHub(hubId) {
  return hubId != null && hubId !== '' && Object.prototype.hasOwnProperty.call(INTERIOR_HUBS, String(hubId));
}

/**
 * Interior streets in outdoor hubs (G43). build-street-ecology.mjs asks
 * interiorReason() for every street and writes `interior: true` plus the
 * reason (`interiorWhy`) on the row, so no outdoor piggies, trees, vendor or
 * shrine appear indoors. The tests, in order:
 *
 * - door art: the street's own doors use the art drawn for a door seen from
 *   inside (`*_int*`, `*interior*`, stair doors, `shoppeIn`). This finds the
 *   five abandoned-apartment lobbies, their five basements (location.js lists
 *   the same basements as "Apt basements"), Uncle Friendly's Emporium, the
 *   Jethimadh Tower Base rooms, Mazza'la Gala and the Underground Puzzles.
 * - art sets: every SWF the street draws from is an interior set
 *   (`bldg_int_*`, `pol_int_*`, or one listed in INTERIOR_ART_SETS): the two
 *   community machine rooms, Giant Living Room, Giant Kitchen and the Eesti
 *   Life catalog rooms. Outdoor streets that borrow a few interior decos keep
 *   outdoor art too, so they never match.
 * - GameServerJS lists, passed in by the build: config_prod.js
 *   `machine_rooms`, and inc_data_pols_prod.js POL templates (SM Apartment 01,
 *   the bottle-tree apartment).
 * - INTERIOR_STREETS: the few interiors no source field marks, each with why.
 */
export const INTERIOR_DOOR_ART = /(?:_int(?:_|\d|$)|interior|stairdoor|stairs_(?:up|down)|shoppeIn$)/i;

export const INTERIOR_ART_SETS = Object.freeze({
  'kukubee2.swf': 'k04 room art only: floors, wallpaper, counters, fridge (Giant Kitchen, Giant Living Room, Eesti Life Catalog Page 17)',
});

export const INTERIOR_STREETS = Object.freeze({
  GDOOSA8V29J24I3: 'The forgotten floor: an apartment hall (apartment_hall_wall, sign_apartment_groddle, bldg_int_apt art) reached only by teleporter; archived items are notes, a cherry, cubimals and teleporters',
  GDOC74759ST2IG1: 'Autumn Lodge: inside a hollow log (layers "log top", "log back", "log bottom"; 97 apartment_hall_floor pieces); its two spawners hold the two archived Fried Eggs, not animals',
});

function isInteriorArtSet(swf) {
  return /^(?:bldg|pol)_int_/.test(swf) || Object.prototype.hasOwnProperty.call(INTERIOR_ART_SETS, swf);
}

/**
 * Why a street is indoors, or null. `street` is a street JSON (or index row)
 * with tsid, hubId, doors and swf_file; `lists` holds GameServerJS building
 * lists as G-prefixed tsids ({ machineRooms, polTemplates }).
 */
export function interiorReason(street, lists = {}) {
  const tsid = String(street?.tsid || '');
  if (isInteriorHub(street?.hubId)) return `hub ${street.hubId} ${INTERIOR_HUBS[String(street.hubId)]}`;
  const door = (street?.doors || []).find((d) => INTERIOR_DOOR_ART.test(String(d?.sprite || '')));
  if (door) return `door art ${door.sprite}`;
  const swfs = String(street?.swf_file || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (swfs.length && swfs.every(isInteriorArtSet)) return `interior art ${[...new Set(swfs)].join(',')}`;
  const g = tsid.startsWith('L') ? `G${tsid.slice(1)}` : tsid;
  if (lists.machineRooms?.has?.(g)) return 'config_prod.js machine_rooms';
  if (lists.polTemplates?.has?.(g)) return `inc_data_pols_prod.js POL template ${lists.polTemplates.get?.(g) || ''}`.trim();
  if (Object.prototype.hasOwnProperty.call(INTERIOR_STREETS, g)) return INTERIOR_STREETS[g];
  return null;
}

/** @type {{source?:string, sourceSnapshot?:string, streetCount?:number, streets:Record<string, any>}} */
let catalog = { streets: {} };

const TREE_CLASSES = Object.freeze([
  'trant_fruit',
  'trant_egg',
  'trant_bean',
  'trant_bubble',
  'trant_spice',
  'trant_gas',
  'wood_tree',
]);

const ROCK_CLASSES = Object.freeze([
  'rock_metal_1',
  'rock_dullite_1',
  'rock_beryl_1',
  'rock_sparkly_1',
]);

/**
 * Harvestable world resource nodes (see js/resource-nodes.js), in source
 * frequency order, with per-street render caps. `resourceCounts` on a
 * population stays exact; `resourceNodeClasses` is the capped spawn list.
 */
export const RESOURCE_NODE_CLASSES = Object.freeze([
  'npc_firefly',
  'npc_salmon',
  'mortar_barnacle',
  'dust_trap',
  'ice_knob',
  'jellisac',
  'dirt_pile',
  'peat_1',
  'npc_sloth',
  'paper_tree',
]);

export const RESOURCE_NODE_CAPS = Object.freeze({
  npc_firefly: 12,
  npc_salmon: 8,
  mortar_barnacle: 6,
  dust_trap: 4,
  ice_knob: 6,
  jellisac: 6,
  dirt_pile: 3,
  peat_1: 3,
  npc_sloth: 4, // 16 source streets hold 3-4 (Gomed Essoni, Tamar Garna, Heera Amond); Circle Crunch needs 3
  paper_tree: 1,
});

function resourceCountsFrom(counts) {
  const out = {};
  for (const classTsid of RESOURCE_NODE_CLASSES) {
    const n = whole(counts?.[classTsid]);
    if (n > 0) out[classTsid] = n;
  }
  return out;
}

function expandResourceClasses(counts) {
  const out = [];
  for (const classTsid of RESOURCE_NODE_CLASSES) {
    const n = Math.min(whole(counts?.[classTsid]), RESOURCE_NODE_CAPS[classTsid] || 4);
    for (let i = 0; i < n; i += 1) out.push(classTsid);
  }
  return out;
}

function whole(value, fallback = 0, max = 999) {
  const n = Number(value);
  return Math.max(0, Math.min(max, Math.floor(Number.isFinite(n) ? n : fallback)));
}

export function stableEcologyHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function streetEcologyAliases(tsid) {
  if (!tsid) return [];
  const out = new Set([String(tsid)]);
  if (String(tsid).startsWith('G')) out.add(`L${String(tsid).slice(1)}`);
  if (String(tsid).startsWith('L')) out.add(`G${String(tsid).slice(1)}`);
  return [...out];
}

export function setStreetEcologyCatalog(next) {
  catalog = next && typeof next === 'object' && next.streets
    ? next
    : { streets: {} };
  return catalog;
}

export function getStreetEcologyCatalog() {
  return catalog;
}

export async function loadStreetEcologyCatalog(fetchImpl = globalThis.fetch) {
  if (!fetchImpl) return catalog;
  try {
    const response = await fetchImpl(STREET_ECOLOGY_URL);
    if (response.ok) setStreetEcologyCatalog(await response.json());
  } catch {
    // No catalog: streets load with no ecology (the starter keeps its onboarding set).
  }
  return catalog;
}

/**
 * Ticket 64: the floor runs nobody reaches on a street ({ [line id]: [[x1, x2]] },
 * screen x), from the catalog's unreachedFloors section (tools/ecology/build-unreached-floors.mjs:
 * the builder's reach graph from every arrival; each line's runs kept as "x1-x2 x1-x2").
 * The planner puts nothing there. Null: none known.
 */
export function unreachedFloorsFor(tsid, source = catalog) {
  for (const alias of streetEcologyAliases(tsid)) {
    const row = source?.unreachedFloors?.[alias];
    if (row) return parseUnreachedRow(row);
  }
  return null;
}

const unreachedParsed = new WeakMap();
function parseUnreachedRow(row) {
  if (unreachedParsed.has(row)) return unreachedParsed.get(row);
  const out = {};
  for (const [line, runs] of Object.entries(row)) {
    out[line] = Array.isArray(runs) ? runs : String(runs).split(' ').map((r) => r.split('-').map(Number)).filter((r) => r.length === 2 && r.every(Number.isFinite));
  }
  unreachedParsed.set(row, out);
  return out;
}

/** PURE: whether x on `line` is in one of the street's unreached runs. */
export function inUnreachedRun(unreached, line, x) {
  const runs = unreached && line?.id != null ? unreached[line.id] : null;
  return Boolean(runs && runs.some(([lo, hi]) => x >= lo && x <= hi));
}

/** PURE: a line no arrival reaches anywhere along it (its runs cover it end to end). */
function wholeLineUnreached(unreached, line) {
  const runs = unreached && line?.id != null ? unreached[line.id] : null;
  if (!runs) return false;
  const lo = Math.min(line.x1, line.x2);
  const hi = Math.max(line.x1, line.x2);
  // Stand points start 24 px in from the street's edges (reach-graph.js buildReachGraph).
  return runs.some(([a, b]) => a <= lo + 28 && b >= hi - 28);
}

export function ecologyForStreet(tsid, source = catalog) {
  for (const alias of streetEcologyAliases(tsid)) {
    if (source?.streets?.[alias]) return source.streets[alias];
  }
  return null;
}

function expandClasses(counts, classes, totalCap) {
  const out = [];
  for (const classTsid of classes) {
    const perClass = Math.min(whole(counts?.[classTsid]), 8);
    for (let i = 0; i < perClass && out.length < totalCap; i += 1) out.push(classTsid);
  }
  return out;
}

/**
 * The original's street caps (locations/inc_admin.js 862-870
 * admin_clean_street): 3 Piggies, 2 Chickens and 3 Butterflies a street.
 * build-street-ecology.mjs writes counts at these caps already; a
 * feature-built row may lift Piggies and Chickens with its own `caps`.
 */
export const STREET_ANIMAL_CAPS = Object.freeze({ piggies: 3, chickens: 2, butterflies: 3 });

/**
 * The remake's rendering caps, for what the original's street cleanup never
 * touched: the starter street keeps its onboarding set or its own page's and
 * snapshot's counts when higher (Hechey Track: 6 Piggies, 7 Chickens), and an
 * instanced location (admin_clean_street returns early for instances: The
 * Great Hog Haul's 6 Piggies) carries these as its row's `caps`.
 */
export const RENDER_ANIMAL_CAPS = Object.freeze({ npc_piggy: 6, npc_chicken: 3 });

/**
 * A street's Butterflies (build-street-ecology.mjs: the live street pages'
 * count, at most 3), all in the air. Ticket 25 (2026-11-01, "butterflies just
 * sitting on the ground"): the original never sets a healthy Butterfly down:
 * npc_butterfly.js flyAround 886-969 keeps it flying in the 200 px band above
 * the floor (apiStartFlyingInTheArea), onWaitStart/onWaitEnd 1486-1531 only
 * pause it by the player, and it lands only when rooked (onRooked 1395-1404
 * drops it to the platform line, rest-rooked) or sad (flyAround returns). The
 * remake's split put one in two on the path for good, resting.
 */
export function butterflySplit(count) {
  const total = Math.min(whole(count), 3);
  return { butterflies: 0, flyingButterflies: total };
}

/**
 * Classes a feature spawns from a street's counts (not the planner's own groups): the feature
 * reads population.featureCounts in placementGroups. js/fire-dragon.js is the first (2026-11-02).
 */
export const FEATURE_CLASSES = Object.freeze(['npc_fire_dragon']);

/** PURE: whole counts of FEATURE_CLASSES from an ecology row's counts. */
export function featureCountsFrom(counts) {
  const out = {};
  for (const c of FEATURE_CLASSES) {
    const n = Math.floor(Number(counts?.[c]));
    if (Number.isFinite(n) && n > 0) out[c] = Math.min(12, n);
  }
  return out;
}

function emptyPopulation({ source, sourceTsid = null }) {
  return {
    source,
    sourceTsid,
    sourceEmpty: true,
    giantId: null,
    piggies: 0,
    chickens: 0,
    butterflies: 0,
    flyingButterflies: 0,
    treeClasses: [],
    rockClasses: [],
    gardens: 0,
    vendor: false,
    shrine: false,
    apples: 0,
    musicblocks: 0,
    quoins: 0,
    companions: false,
    resourceCounts: {},
    featureCounts: {},
    resourceNodeClasses: [],
  };
}

/**
 * Convert an archived item-reference row into bounded playable counts.
 * Static items stay exact (within rendering caps). Archived spawners add no
 * animals: a spawner refills whenever a player enters, so its snapshot already
 * holds what it spawns, and 409 of the 449 archived streets with spawners show
 * no animal at all (register G44b). Butterflies are the one exception the
 * builder adds, from the live street pages' counts (counts.npc_butterfly,
 * evidence in the catalog's `butterflies` map).
 *
 * A street with no row gets nothing (Austin 2026-10-30): no invented piggies,
 * trees, rocks, garden, vendor or shrine. build-street-ecology.mjs writes a row
 * for every street that has an archived file, so only streets with no file at
 * all (and no feature row) land here; the starter street keeps its onboarding
 * set either way.
 */
export function populationForStreet(tsid, entry, { starter = false } = {}) {
  if (entry?.empty === true) {
    return emptyPopulation({ source: 'tinyspeck-locations-xml', sourceTsid: entry.sourceTsid || null });
  }
  if (!entry && !starter) return emptyPopulation({ source: 'no-archived-row' });
  const counts = entry?.counts || {};
  if (entry?.interior === true || entry?.exact === true) {
    // Indoors, or an outdoor street whose archived file holds no ecology at
    // all (`exact`: quoins, Qurazy markers, event boxes, patches, notes):
    // exactly what the archived row lists, no spawner-inferred animals, no
    // invented scenery, no ambient apples or Musicblocks, and the archived
    // quoin count instead of the outdoor eight.
    return {
      source: 'tinyspeck-locations-xml',
      sourceTsid: entry.sourceTsid || null,
      ...(entry.interior === true ? { interior: true } : { exact: true }),
      giantId: entry.giantId || null,
      piggies: Math.min(whole(counts.npc_piggy), STREET_ANIMAL_CAPS.piggies),
      chickens: Math.min(whole(counts.npc_chicken), STREET_ANIMAL_CAPS.chickens),
      ...butterflySplit(counts.npc_butterfly),
      treeClasses: expandClasses(counts, TREE_CLASSES, 8),
      rockClasses: expandClasses(counts, ROCK_CLASSES, 10),
      gardens: Math.min(whole(counts.garden), 2),
      vendor: whole(counts.street_spirit) > 0,
      shrine: !!entry.giantId,
      apples: 0,
      musicblocks: 0,
      quoins: whole(entry.quoins, 0, 40),
      companions: entry.companions !== false,
      resourceCounts: resourceCountsFrom(counts),
      featureCounts: featureCountsFrom(counts),
      resourceNodeClasses: expandResourceClasses(counts),
    };
  }
  // A feature-built row for a rebuilt street may lift the rendering caps to its
  // source's own count (Vicar's Peak's loading card: 11 Piggies, 7 Chickens);
  // an archived instanced location carries RENDER_ANIMAL_CAPS.
  const caps = entry?.caps || {};
  const pigCap = starter ? RENDER_ANIMAL_CAPS.npc_piggy : STREET_ANIMAL_CAPS.piggies;
  const chickenCap = starter ? RENDER_ANIMAL_CAPS.npc_chicken : STREET_ANIMAL_CAPS.chickens;
  let piggies = Math.min(whole(counts.npc_piggy), whole(caps.piggies, pigCap, 12));
  let chickens = Math.min(whole(counts.npc_chicken), whole(caps.chickens, chickenCap, 8));
  let { butterflies, flyingButterflies } = butterflySplit(counts.npc_butterfly);

  let treeClasses = expandClasses(counts, TREE_CLASSES, 8);
  let rockClasses = expandClasses(counts, ROCK_CLASSES, 10);
  let gardens = Math.min(whole(counts.garden), 2);
  let vendor = whole(counts.street_spirit) > 0;
  let shrine = !!entry?.giantId;

  // The default street remains a self-contained onboarding playground while
  // retaining its exact archived piggy/trant population and official shrine.
  if (starter) {
    piggies = Math.max(3, piggies);
    chickens = Math.max(2, chickens);
    // The onboarding four, all flying (ticket 25: the original's never sat on the ground).
    flyingButterflies = Math.max(4, butterflies + flyingButterflies);
    butterflies = 0;
    if (!treeClasses.length) {
      treeClasses = ['trant_fruit', 'trant_egg', 'trant_bean', 'wood_tree'];
    } else if (!treeClasses.includes('wood_tree') && treeClasses.length < 8) {
      treeClasses.push('wood_tree');
    }
    if (!rockClasses.length) {
      rockClasses = [
        'rock_metal_1',
        'rock_dullite_1',
        'rock_beryl_1',
        'rock_sparkly_1',
        'rock_metal_1',
      ];
    }
    gardens = Math.max(2, gardens);
    vendor = true;
    shrine = true;
  }

  return {
    // No row here means the starter street without its catalog row (the
    // catalog failed to load): the onboarding set above, nothing else.
    source: entry ? 'tinyspeck-locations-xml' : 'starter-onboarding',
    sourceTsid: entry?.sourceTsid || null,
    giantId: entry?.giantId || null,
    piggies,
    chickens,
    butterflies,
    flyingButterflies,
    treeClasses,
    rockClasses,
    gardens,
    vendor,
    shrine,
    // Feature-built rows (private instances such as party spaces) may pin
    // these; archived street rows never carry them.
    apples: Number.isFinite(entry?.apples) ? whole(entry.apples, 0, 8) : 4,
    musicblocks: Number.isFinite(entry?.musicblocks) ? whole(entry.musicblocks, 0, 2) : 1,
    quoins: Number.isFinite(entry?.quoins) ? whole(entry.quoins, 0, 40) : 8,
    companions: entry?.companions !== false,
    resourceCounts: resourceCountsFrom(counts),
    featureCounts: featureCountsFrom(counts),
    resourceNodeClasses: expandResourceClasses(counts),
  };
}

/**
 * Big scenery needs a floor under it (lane PERCH, 2026-10-31): a bean tree
 * planned onto a 24 px branch stub halfway up Groddle Forest Junction's great
 * trunk stood as a tree in a tree. Each group below needs a continuous run of
 * floor about its own width, half of it on each side of its spot.
 *
 * The widths are the art as game.js draws it:
 * - trees: the trants' full-grown frames (assets/sprites/trants/frames/*_m10.png,
 *   m7 is the same size) at spawnTrees' trantDisplayScale (210 px tall, never
 *   above 1:1): trant_bean 198x270 -> 154 px, trant_bubble 167x277 -> 127,
 *   trant_egg 296x278 -> 224, trant_fruit 271x249 -> 229, trant_gas 276x258 -> 225,
 *   trant_spice 318x250 -> 267, and the Wood Tree's 88 px frame (treeWoodGrowth,
 *   1:1). The planner sees the group, not the class, so it asks for TREE_FOOTPRINT
 *   px: every trant's foot on the floor (the frames' bottom 15%, drawn: trant_egg's
 *   roots 171 px, trant_spice 136, trant_bean 130, the rest under 60), while a
 *   wider canopy may reach past an edge as a real tree's does.
 * - gardens: garden-view.js gardenLayout's bed box, 280 px for the four-plot
 *   strip (the first garden) and 227 px for the three-plot herb bed.
 * - vendor: the Street Spirit art (decos/groddle/vendor.webp, 422 px) at 0.25.
 * - shrine: one shrine cell (151 px) at spawnShrine's 0.78.
 * - rocks: the mining sheets' opaque art (assets/sprites/mining, cells 131-137 px)
 *   at spawnMineRock's 0.85: metal 134 -> 114 px, beryl and sparkly 114 -> 97,
 *   dullite 108 -> 92.
 * - the walking animals (lane DOORCLEAR, 2026-10-31: a Chicken stood on the tip
 *   of a short branch up in Groddle Forest Junction's great tree and walked off
 *   its ends): the body (ANIMAL_BODY) plus its patrol both ways (ANIMAL_PATROL,
 *   game.js spawnPiggies / spawnChickens spr.range, the walk loop turning at
 *   baseX +- range). Piggies: the feet and body of the walk art (about 86 px at
 *   ENTITY_SCALE.piggy; snout and tail may overhang, as a canopy does), 60 px,
 *   + 2 x 90 = 240; Chickens: the walk art's bird (54 px of the 148 px cell at
 *   ENTITY_SCALE.chicken 0.702) 38 px, + 2 x 100 = 238. They keep off perches
 *   while any floor has room (planStreetPlacements). A Piggy is a shared server object online, laid out from
 *   this plan, and must stand where a player beside it can reach it
 *   (tests/reach.test.js). When no spot has the room (a fallback) game.js
 *   shortens the patrol to the floor it got (animalPatrolRange).
 * - resting Butterflies: the rest frame's cell (70 px at ENTITY_SCALE.butterfly
 *   0.702), 48 px, so one never sits on a stub narrower than itself. They fly,
 *   so a branch or ledge is as good as a floor (PERCHING_GROUPS).
 * Flying Butterflies, Batterflies (they fly loops 150 px over the floor), quoins,
 * apples and the rest keep the plain rule: any line wide enough to sample.
 */
export const TREE_FOOTPRINT = 180;
export const ANIMAL_BODY = Object.freeze({ piggies: 60, chickens: 38 });
export const ANIMAL_PATROL = Object.freeze({ piggies: 90, chickens: 100 });
export const PLACEMENT_FOOTPRINTS = Object.freeze({
  trees: TREE_FOOTPRINT,
  gardens: 280,
  vendor: 106,
  shrine: 118,
  rocks: 100,
  piggies: ANIMAL_BODY.piggies + 2 * ANIMAL_PATROL.piggies,
  chickens: ANIMAL_BODY.chickens + 2 * ANIMAL_PATROL.chickens,
  butterflies: 48,
});
/** Groups that need their room but may sit on a perch as readily as on a floor. */
export const PERCHING_GROUPS = Object.freeze(['butterflies']);

/**
 * How far a walking animal planned at a spot with `room` (the plan point's room:
 * twice the floor on its narrower side) patrols each way: its own range, or less
 * when the floor is short, so it turns before the line ends.
 */
export function animalPatrolRange(key, room) {
  const range = ANIMAL_PATROL[key];
  if (!range) return 0;
  if (!Number.isFinite(room)) return range;
  return Math.max(0, Math.min(range, Math.floor((room - ANIMAL_BODY[key]) / 2)));
}

/**
 * Glitch floors are often many short lines joined end to end (or one line's
 * end resting on another), so a floor's width is its run: lines that hold
 * items (isStandable and isItemSolid) whose ends meet within FLOOR_JOIN_PX.
 */
export const FLOOR_JOIN_PX = 6;

/**
 * A spot is a perch when a floor run at least the footprint wide lies more than
 * PERCH_DROP_PX under it (a branch or ledge over the street's floor; 150 px is
 * well past the avatar's 105 px jump). Big scenery stands on a perch only when
 * the floors below have no free, uncrowded spot left; a cliff top or an upper
 * floor with nothing under it is a floor like any other.
 */
export const PERCH_DROP_PX = 150;

/**
 * Keep-clear fixtures (lane DOORCLEAR, 2026-10-31): a Fruit Tree planted on
 * Groddle Forest Junction's subway steps (door_1, door_asset_subway_forest_heights_1,
 * 294 x 294 at 4099, 1063) hid half the way down. The planner reserves the
 * street's fixed things, each as a floor point with a soft clearance (as the
 * signposts always were) and a box the art covers (`block`):
 * - doors (street.doors, build-street-navigation.mjs: screen space already,
 *   bottom-centre, w x h; the client's DoorView and doors-feature buildView draw
 *   the art there; hidden doors are not drawn): subway entrances, houses,
 *   tower and machine-room doors, Bureaucratic Hall, cave mouths. Soft
 *   clearance half the door's width, as the art is wide. A door is also a
 *   doorway (`doorway: true`): its rect is where the player stands to go in
 *   (doors.js insideBottomRect, the hit test).
 * - ladder feet (street.ladders: world x centre, y bottom, h up, as
 *   street-model.js climbWallsWorld reads them): the bottom LADDER_FOOT_PX of
 *   the ladder, where the player steps on (LadderView).
 * - signposts (world x, y at the post's foot, w x h), clearance 100 as before.
 * Big scenery (PLACEMENT_HEIGHTS: trees, gardens, the vendor, shrines, rocks)
 * never overlaps a block with its own box (footprint wide, height tall, standing
 * on its spot); smaller things (quoins, apples, animals, Musicblocks, nodes)
 * may stand beside a door but never inside its doorway. Only when every free
 * spot breaks that does a thing still go down (never dropped), and the plan
 * lists it under `blocked` ({ key, index, fixture }). The original placed
 * every one of these by hand (GSJS obey_physics false), so no tree ever stood
 * on a doorstep; the remake plans them and keeps the doors clear instead.
 */
export const PLACEMENT_HEIGHTS = Object.freeze({
  trees: 210, // spawnTrees trantDisplayScale targetH
  gardens: 80, // garden-view.js bed box (44 px) and the crops that grow from it
  vendor: 127, // decos/groddle/vendor.webp 422 x 508 at 0.25
  shrine: 147, // a shrine cell 188 px tall at spawnShrine's 0.78
  rocks: 110, // the mining sheets' cells (131-137 px) at spawnMineRock's 0.85
});
export const LADDER_FOOT_PX = 120;
/** Below a door's floor point, how far a spot still counts as its doorstep (a sloped floor). */
export const DOORWAY_DROP_PX = 40;

/**
 * The street's keep-clear spots for planStreetPlacements, in screen space:
 * { x, y, key, clearance, block: { l, r, t, b }, doorway? }. One helper for
 * game.js enterStreet, the realtime data builders and the level builder, so
 * every player's street and the server's layout match.
 */
export function streetReservedSpots(street) {
  const out = [];
  const bounds = street?.bounds;
  const toScreen = (x, y) => (bounds ? worldToScreen(street, x, y) : { x, y });
  const box = (x, y, w, h) => ({ l: x - w / 2, r: x + w / 2, t: y - h, b: y });
  (street?.signposts || []).forEach((signpost, index) => {
    if (!Number.isFinite(signpost?.x) || !Number.isFinite(signpost?.y)) return;
    const point = toScreen(signpost.x, signpost.y);
    out.push({ ...point, key: `signpost:${index}`, clearance: 100, block: box(point.x, point.y, Number(signpost.w) || 100, Number(signpost.h) || 200) });
  });
  for (const door of street?.doors || []) {
    if (!door || door.hidden || !Number.isFinite(door.x) || !Number.isFinite(door.y)) continue;
    const w = Number(door.w) > 0 ? Number(door.w) : 60;
    const h = Number(door.h) > 0 ? Number(door.h) : 110;
    out.push({ x: door.x, y: door.y, key: `door:${door.id}`, clearance: Math.round(w / 2), block: box(door.x, door.y, w, h), doorway: true });
  }
  for (const ladder of street?.ladders || []) {
    if (!ladder || !Number.isFinite(ladder.x) || !Number.isFinite(ladder.y) || !(ladder.h > 0)) continue;
    const foot = toScreen(ladder.x, ladder.y);
    const w = Number(ladder.w) > 0 ? Number(ladder.w) : 50;
    out.push({ ...foot, key: `ladder:${ladder.id}`, clearance: Math.round(w / 2), block: box(foot.x, foot.y, w, Math.min(ladder.h, LADDER_FOOT_PX)) });
  }
  out.push(...frontDecoCovers(street));
  return out;
}

/** The smallest deco on a layer in front of the player that can hide a tree, rock or Piggy (px). */
export const FRONT_DECO_MIN = Object.freeze({ w: 120, h: 90 });
/** How much of a thing's box a front deco has to cover for the thing to count as behind it. */
export const FRONT_HIDE_SHARE = 0.6;
/** Front decos that are see-through (shadows, light and haze overlays): they hide nothing. */
export const FRONT_SEE_THROUGH = /shadow|overlay|trans|glow|light|haze|fog|mist|ray|beam|gradient/i;

/**
 * Ticket 89: the decos drawn in front of the avatar and the street's items (a layer with z > 0:
 * middleplus, foreground; game.js syncStreetFront draws them over the middleground), as keep-clear spots
 * `{ key, front: true, block }` in screen space. They never take a clearance or keep anything
 * away; planStreetPlacements only takes a spot whose tree, rock or Piggy (REACH_BOXES) they would
 * mostly hide last, as it does a spot behind a floor. The original set those by hand where they
 * showed (Flipside's Spice Plant sat inside the Swiss-cheese pipe's front half). Only layers as
 * wide as the street: a parallax layer moves against the street as the camera does.
 */
export function frontDecoCovers(street) {
  const out = [];
  const width = street?.bounds ? street.bounds.r - street.bounds.l : 0;
  for (const layer of street?.layers || []) {
    if (!(Number(layer?.z) > 0) || !width || Number(layer.w) !== width) continue;
    (layer.decos || []).forEach((d, i) => {
      const w = Number(d?.w) || 0;
      const h = Number(d?.h) || 0;
      if (w < FRONT_DECO_MIN.w || h < FRONT_DECO_MIN.h || !Number.isFinite(d.x) || !Number.isFinite(d.y) || Number(d.r)) return;
      if (FRONT_SEE_THROUGH.test(String(d.sprite || ''))) return;
      out.push({ x: d.x, y: d.y, key: `front:${layer.name || layer.id}:${i}`, front: true, block: { l: d.x - w / 2, r: d.x + w / 2, t: d.y - h, b: d.y } });
    });
  }
  return out;
}

/** PURE: whether a thing of `key` at `spot` is mostly behind one front deco (frontDecoCovers). */
export function hiddenBehindFront(spot, key, fronts) {
  const size = REACH_BOXES[key];
  if (!size || !fronts?.length) return false;
  const [w, h] = size;
  const l = spot.x - w / 2;
  const r = spot.x + w / 2;
  const t = spot.y - h;
  for (const f of fronts) {
    const b = f.block;
    const ox = Math.min(r, b.r) - Math.max(l, b.l);
    const oy = Math.min(spot.y, b.b) - Math.max(t, b.t);
    if (ox > 0 && oy > 0 && ox * oy >= FRONT_HIDE_SHARE * w * h) return true;
  }
  return false;
}

/** How near a floor's ends sit to a front deco's top for the floor to be that top (px up or down). */
export const FRONT_TOP_BAND = 30;

/**
 * Ticket 118: the front decos (frontDecoCovers) with a floor laid along their top and the street's
 * real floor running behind them (Flipside's Swiss-cheese pipe: its two lines run 1198 to 1616 at
 * 1813 to 1829, the deco 1188 to 1645 from 1807 to 1972, the floor behind at 1950). The avatar
 * walks along such a line, as in the original, but rooted scenery has no ground to the eye on it:
 * its foot rests on the deco's rim with the street showing behind. Nor beside it: behind the end
 * of the pipe the deco still cuts the trunk off. A deco counts when a line's whole floor run lies
 * across it, both the line's ends are within FRONT_TOP_BAND of its top and an item floor runs
 * lower down within its box. A cliff or shelf that goes on past the deco is a floor of its own.
 */
export function frontDecoWalkways(platforms, fronts) {
  if (!fronts?.length || !Array.isArray(platforms)) return [];
  const lines = platforms.filter((p) => isStandable(p) && isItemSolid(p));
  const spans = floorRunSpans(lines);
  return fronts.filter(({ block: b }) => lines.some((line) => {
    const lo = Math.min(line.x1, line.x2);
    const hi = Math.max(line.x1, line.x2);
    const run = (spans.get(line) || []).find((span) => lo >= span[0] && hi <= span[1]);
    if (!run || run[0] < b.l || run[1] > b.r) return false;
    if (Math.abs(line.y1 - b.t) > FRONT_TOP_BAND || Math.abs(line.y2 - b.t) > FRONT_TOP_BAND) return false;
    const low = Math.max(line.y1, line.y2);
    return lines.some((under) => {
      const y = under === line ? null : platformYAt(under, (lo + hi) / 2, 0.01);
      return y != null && y > low && y <= b.b + FRONT_TOP_BAND;
    });
  }));
}

/** PURE: whether the foot (`footprint` px wide) of a thing at `spot` is on or behind one of them. */
export function footAtWalkway(spot, footprint, walkways) {
  return (walkways || []).some(({ block: b }) => spot.x + footprint / 2 > b.l && spot.x - footprint / 2 < b.r
    && spot.y >= b.t - FRONT_TOP_BAND && spot.y <= b.b);
}

/** The first fixture a thing at `spot` would cover: big scenery by its box, the rest by the doorways. */
export function blockingFixture(spot, fixtures, { footprint = 0, height = 0 } = {}) {
  for (const fixture of fixtures || []) {
    const b = fixture?.block;
    // A front deco (frontDecoCovers) covers things; nothing covers it.
    if (!b || fixture.front) continue;
    if (footprint > 0 && height > 0) {
      if (spot.x - footprint / 2 < b.r && b.l < spot.x + footprint / 2 && spot.y - height < b.b && b.t < spot.y) return fixture;
    } else if (fixture.doorway && spot.x > b.l && spot.x < b.r && spot.y >= b.t && spot.y <= b.b + DOORWAY_DROP_PX) {
      return fixture;
    }
  }
  return null;
}

function pointToSegment(px, py, p) {
  const dx = p.x2 - p.x1;
  const dy = p.y2 - p.y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - p.x1) * dx + (py - p.y1) * dy) / len2)) : 0;
  return Math.hypot(px - (p.x1 + dx * t), py - (p.y1 + dy * t));
}

/**
 * For each line that holds items, the x spans of the floor run it belongs to
 * (merged where they meet within FLOOR_JOIN_PX). Returns a Map line -> spans.
 */
export function floorRunSpans(lines) {
  const n = lines.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const touches = (a, b) => [[a.x1, a.y1], [a.x2, a.y2]].some(([x, y]) => pointToSegment(x, y, b) <= FLOOR_JOIN_PX);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = lines[i];
      const b = lines[j];
      if (Math.min(a.x1, a.x2) > Math.max(b.x1, b.x2) + FLOOR_JOIN_PX) continue;
      if (Math.min(b.x1, b.x2) > Math.max(a.x1, a.x2) + FLOOR_JOIN_PX) continue;
      if (touches(a, b) || touches(b, a)) parent[find(i)] = find(j);
    }
  }
  const byRun = new Map();
  lines.forEach((line, i) => {
    const r = find(i);
    if (!byRun.has(r)) byRun.set(r, []);
    byRun.get(r).push([Math.min(line.x1, line.x2), Math.max(line.x1, line.x2)]);
  });
  const merged = new Map();
  for (const [r, spans] of byRun) {
    spans.sort((a, b) => a[0] - b[0]);
    const runSpans = [];
    for (const [lo, hi] of spans) {
      const last = runSpans[runSpans.length - 1];
      if (last && lo <= last[1] + FLOOR_JOIN_PX) last[1] = Math.max(last[1], hi);
      else runSpans.push([lo, hi]);
    }
    merged.set(r, runSpans);
  }
  const out = new Map();
  lines.forEach((line, i) => out.set(line, merged.get(find(i))));
  return out;
}

/**
 * The widest footprint a spot at x on `line` can hold: twice the floor its
 * run gives on the narrower side.
 */
function roomAt(spans, x) {
  for (const [lo, hi] of spans || []) {
    if (x >= lo - 0.01 && x <= hi + 0.01) return 2 * Math.max(0, Math.min(x - lo, hi - x));
  }
  return 0;
}

/** Build dense, stable candidates along the lower reachable platform bands. */
export function buildPlatformCandidates(platforms, { worldW = 2500, seed = '', unreached = null } = {}) {
  // Only lines the avatar stands on (street-model.js isStandable): an underside or
  // ceiling (pc_perm 1) floats a tree (the cave roof on Meadow's Edge), and a soft
  // line (pc_perm 0) is one the player falls through, so a spot there (the arrival
  // too) hangs mid-air (Odena Odes' cave line).
  // Each spot also says whether the line holds items (`item`, isItemSolid): every
  // planned thing is an item in the original and needs one (planStreetPlacements);
  // only the arrival goes by the avatar's rule alone.
  // Ticket 64: nor a floor nobody gets to (unreachedFloorsFor): Level 3 East's floor
  // line under the whole cave walk held its rocks, quoins and Musicblock. In the
  // original they were set by hand where a player reaches them.
  const standable = (platforms || []).filter((platform) => {
    return [platform?.x1, platform?.y1, platform?.x2, platform?.y2].every(Number.isFinite)
      && isStandable(platform);
  });
  const reachable = unreached ? standable.filter((platform) => !wholeLineUnreached(unreached, platform)) : standable;
  const clean = reachable.length ? reachable : standable;
  const skipRuns = reachable.length ? unreached : null;
  if (!clean.length) {
    return Array.from({ length: 32 }, (_, index) => ({
      id: `fallback:${index}`,
      x: 80 + ((index * 173) % Math.max(200, worldW - 160)),
      y: 600,
    }));
  }
  const minY = Math.min(...clean.flatMap((p) => [p.y1, p.y2]));
  const maxY = Math.max(...clean.flatMap((p) => [p.y1, p.y2]));
  const lowerThreshold = minY + (maxY - minY) * 0.46;
  let pool = clean.filter((p) => (p.y1 + p.y2) / 2 >= lowerThreshold);
  if (pool.length < 4) pool = clean;

  // Each item spot's room (the footprint its floor run holds, PLACEMENT_FOOTPRINTS)
  // and `under`: the widest floor run more than PERCH_DROP_PX below it (0: none).
  const itemLines = clean.filter((p) => isItemSolid(p));
  const spans = floorRunSpans(itemLines);
  const under = (x, y) => {
    let widest = 0;
    for (const line of itemLines) {
      if (x < Math.min(line.x1, line.x2) || x > Math.max(line.x1, line.x2)) continue;
      const t = line.x2 === line.x1 ? 0 : (x - line.x1) / (line.x2 - line.x1);
      if (line.y1 + (line.y2 - line.y1) * t <= y + PERCH_DROP_PX) continue;
      for (const [lo, hi] of spans.get(line)) if (x >= lo && x <= hi) widest = Math.max(widest, hi - lo);
    }
    return widest;
  };
  const candidates = [];
  const seen = new Set();
  for (let pIndex = 0; pIndex < pool.length; pIndex += 1) {
    const platform = pool[pIndex];
    const width = Math.abs(platform.x2 - platform.x1);
    if (width < 18) continue;
    const samples = Math.max(1, Math.ceil(width / 88));
    for (let i = 0; i < samples; i += 1) {
      const t = (i + 0.5) / samples;
      const x = platform.x1 + (platform.x2 - platform.x1) * t;
      const y = platform.y1 + (platform.y2 - platform.y1) * t;
      if (x < 34 || x > worldW - 34) continue;
      if (skipRuns && inUnreachedRun(skipRuns, platform, x)) continue;
      const key = `${Math.round(x / 22)}:${Math.round(y / 14)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const item = isItemSolid(platform);
      candidates.push({
        id: `${platform.id || pIndex}:${i}`,
        x,
        y,
        item,
        room: item ? roomAt(spans.get(platform), x) : 0,
        under: item ? under(x, y) : 0,
      });
    }
  }
  candidates.sort((a, b) => {
    return stableEcologyHash(`${seed}:${a.id}`) - stableEcologyHash(`${seed}:${b.id}`);
  });
  return candidates;
}

function scaledDistance(a, b, verticalScale = 1.75) {
  return Math.hypot(a.x - b.x, (a.y - b.y) * verticalScale);
}

/**
 * Allocate every category in one pass. Large scenery goes first, then roaming
 * NPCs and collectibles fill the remaining platform anchors.
 *
 * Every spot is on a floor the avatar stands on (buildPlatformCandidates). The
 * player's arrival (`key: 'player'`, or `avatar: true`) needs nothing more; every
 * other request places a thing that is an item in the original (a tree, rock, quoin,
 * animal, apple, garden, vendor...), so its spot must also be on a line items rest
 * on (the client's item_solid_from_top, street-model.js isItemSolid): Umbra's
 * walkway that items fall through (pc_perm -1, item_perm 0) holds none of them.
 * The trees, rocks, quoins and animals are set by hand in the original (GSJS
 * obey_physics false), where the player reaches them, so they keep the avatar's
 * floor too; a shelf only items rest on (pc_perm 0, item_perm -1) holds none.
 *
 * Big scenery and the animals (PLACEMENT_FOOTPRINTS, or a request's own
 * `footprint`) also need room: a spot whose floor run holds its width (an
 * animal's: its walk), half on each side. Among those it takes, in order: a floor
 * spot clear of everything placed (nearest >= 1), a perch (PERCH_DROP_PX) that is
 * clear, a crowded floor spot, a crowded perch. A walking animal (ANIMAL_PATROL)
 * takes any floor spot, crowded or not, before a perch; PERCHING_GROUPS (or
 * `perch: true`) take a perch as a floor. The plan lists perches under `perches`
 * ({ key, index }).
 * When no free spot has the room the thing still goes down, on the roomiest spots
 * left, and the plan lists it under `fallbacks` ({ key, index, room, footprint }).
 * Every placed point carries its spot's `room`.
 *
 * Reserved spots that carry a `block` (streetReservedSpots: doors, ladder feet,
 * signposts) are kept clear before all of that: big scenery (PLACEMENT_HEIGHTS,
 * or a request's own `height`) never covers one, nothing else stands in a
 * doorway, and the room asked for is the most a clear spot has. When no clear
 * spot is left the thing goes on the best covering one and the plan lists it
 * under `blocked` ({ key, index, fixture }).
 *
 * Ticket 64: no spot is on a floor run no arrival reaches (`unreached`, by default
 * the catalog's unreachedFloorsFor(`tsid`), `tsid` defaulting to the seed).
 *
 * @param {any[]} platforms
 * @param {{key:string,count:number,clearance:number,footprint?:number}[]} requests
 */
export function planStreetPlacements(
  platforms,
  requests,
  { worldW = 2500, seed = '', reserved = [], tsid = seed, unreached = unreachedFloorsFor(tsid) } = {}
) {
  const candidates = buildPlatformCandidates(platforms, { worldW, seed, unreached });
  // Front decos (frontDecoCovers) keep nothing clear; they only rank the spots they hide.
  const fronts = (reserved || []).filter((p) => p?.front && p.block);
  const walkways = frontDecoWalkways(platforms, fronts);
  const occupied = (reserved || []).filter((p) => !p?.front && Number.isFinite(p?.x) && Number.isFinite(p?.y))
    .map((point, index) => ({ ...point, key: point.key || `reserved:${index}`, clearance: whole(point.clearance, 120, 600) }));
  const fixtures = occupied.filter((point) => point.block);
  const used = new Set();
  const groups = {};
  const fallbacks = [];
  const perches = [];
  const blocked = [];
  const hiddenCache = new Map();

  for (const request of requests || []) {
    const count = whole(request?.count, 0, 40);
    const clearance = whole(request?.clearance, 40, 600);
    groups[request.key] = [];
    const avatar = request.key === 'player' || request.avatar === true;
    const footprint = avatar ? 0 : Number.isFinite(request?.footprint)
      ? Math.max(0, request.footprint)
      : PLACEMENT_FOOTPRINTS[request.key] || 0;
    const perching = request?.perch === true || PERCHING_GROUPS.includes(request.key);
    const walker = Boolean(ANIMAL_PATROL[request.key]);
    const height = Number.isFinite(request?.height) ? Math.max(0, request.height) : PLACEMENT_HEIGHTS[request.key] || 0;
    // The fixture each spot would cover for this request (null: clear); the arrival covers nothing.
    const covers = new Map();
    if (!avatar && fixtures.length) {
      for (const candidate of candidates) {
        const fixture = blockingFixture(candidate, fixtures, { footprint, height });
        if (fixture) covers.set(candidate.id, fixture);
      }
    }
    for (let index = 0; index < count; index += 1) {
      // The room this one asks for: its footprint, or the most any free clear spot
      // has (any free spot's, when none is clear).
      let need = 0;
      if (footprint > 0) {
        let clearNeed = -1;
        for (const candidate of candidates) {
          if (used.has(candidate.id) || candidate.item === false) continue;
          const room = Math.min(footprint, candidate.room || 0);
          need = Math.max(need, room);
          if (!covers.has(candidate.id)) clearNeed = Math.max(clearNeed, room);
        }
        if (clearNeed >= 0) need = clearNeed;
        if (need < footprint) fallbacks.push({ key: request.key, index, room: Math.round(need), footprint });
      }
      let best = null;
      let bestScore = -Infinity;
      let bestTier = Infinity;
      for (const candidate of candidates) {
        if (used.has(candidate.id)) continue;
        if (!avatar && candidate.item === false) continue;
        if (need > 0 && (candidate.room || 0) < need) continue;
        const nearest = occupied.length
          ? Math.min(...occupied.map((other) => {
              const needed = Math.max(1, clearance + other.clearance);
              return scaledDistance(candidate, other) / needed;
            }))
          : 2;
        const centerBias = request.key === 'player'
          ? 0.85 - Math.abs(candidate.x - worldW / 2) / Math.max(1, worldW / 2)
          : 0;
        const edgeBias = Math.min(candidate.x, worldW - candidate.x) / Math.max(1, worldW) * 0.08;
        const jitter = (stableEcologyHash(`${seed}:${request.key}:${index}:${candidate.id}`) % 1000) / 100000;
        const score = nearest + centerBias + edgeBias + jitter;
        const perch = !perching && (candidate.under || 0) >= footprint;
        // Big scenery: a clear perch before a crowded floor; a walking animal stays on
        // the floor while it has room, crowded or not (it walks off as others come),
        // never planted in a tree, rock or stall or on another walker, and, before a
        // crowded spot, its walk clear of them (walkInScenery).
        const scenery = walker ? walkInScenery(candidate, request.key, occupied) : 0;
        // Ticket 64 follow-up: a tree, rock or Piggy behind a floor from beside it only when no other spot is left.
        let hidden = 0;
        if (REACH_BOXES[request.key]) {
          const k = `${request.key}:${candidate.id}`;
          if (!hiddenCache.has(k)) hiddenCache.set(k, hiddenBehindFloor(platforms, candidate, request.key) || hiddenBehindFront(candidate, request.key, fronts));
          hidden = hiddenCache.get(k) ? 32 : 0;
        }
        // Ticket 118: rooted scenery on or behind a front deco that players walk along, last too.
        if (!hidden && height > 0 && footAtWalkway(candidate, footprint, walkways)) hidden = 32;
        const tier = (footprint > 0
          ? walker ? (perch ? 8 : 0) + (scenery === 2 ? 4 : 0) + (nearest < 1 ? 2 : 0) + (scenery === 1 ? 1 : 0) : (perch ? 1 : 0) + (nearest < 1 ? 2 : 0)
          : 0) + (covers.has(candidate.id) ? (walker ? 16 : 4) : 0) + hidden;
        if (tier < bestTier || (tier === bestTier && score > bestScore)) {
          bestTier = tier;
          bestScore = score;
          best = candidate;
        }
      }
      if (!best) break;
      if (footprint > 0 && !perching && (best.under || 0) >= footprint) perches.push({ key: request.key, index });
      if (covers.has(best.id)) blocked.push({ key: request.key, index, fixture: covers.get(best.id).key });
      used.add(best.id);
      const point = { x: best.x, y: best.y, id: best.id, key: request.key, clearance, room: best.room || 0 };
      groups[request.key].push(point);
      occupied.push(point);
    }
  }

  return { seed: String(seed), groups, occupied, candidateCount: candidates.length, fallbacks, perches, blocked };
}

/**
 * The boxes of the things a player clicks from beside them (tests/reach.test.js: every server-laid
 * tree, rock and piggy stays in reach). A spot whose thing would sit behind a floor from every
 * side (js/reach.js behindFloor: the client's "can't reach that" line) is taken last.
 */
const REACH_BOXES = Object.freeze({ trees: [150, 200], rocks: [90, 60], piggies: [70, 50] });
const BESIDE_DX = Object.freeze([-60, -30, 30, 60]);

/** PURE: whether a thing of `key` at `spot` is behind a floor from any place beside it. */
export function hiddenBehindFloor(platforms, spot, key) {
  const size = REACH_BOXES[key];
  if (!size || !Array.isArray(platforms)) return false;
  const [w, h] = size;
  const box = { left: spot.x - w / 2, right: spot.x + w / 2, top: spot.y - h, bottom: spot.y };
  const half = avatarHeadReach(1).reach / 2;
  for (const dx of BESIDE_DX) {
    const g = groundBeneath(platforms, spot.x + dx, spot.y - 10, 30);
    if (!g || Math.abs(g.y - spot.y) > 40) continue;
    if (behindFloor(platforms, { x: spot.x + dx, y: g.y - half }, box, null, { feetY: g.y })) return true;
  }
  return false;
}

/** How near a walk may come to big scenery on its own floor (px up or down: a sloped floor). */
export const WALK_FLOOR_DY = 40;
/** How near the arrival point (the plan's player) a walking animal may be planted. */
export const WALK_ARRIVAL_PX = 140;
const SCENERY_KEYS = Object.freeze(['trees', 'gardens', 'vendor', 'shrine', 'rocks']);

/**
 * A walking animal's spot against the big scenery already placed (lane PIGSTUCK, 2026-11-01:
 * Piggies parked in a Bean Tree on Groddle Forest Junction): 0 when its whole walk (body and
 * patrol both ways, animalPatrolRange on the spot's room) keeps clear of every tree, rock,
 * garden, vendor and shrine footprint on its floor, 1 when its walk reaches into one, 2 when the
 * spot itself is inside one, on another walking animal or at the arrival point. The original's animals were set down by hand (npc_piggy.js 2955
 * obey_physics false) and walked their whole floor past trees (startMoving 2600-2700); the
 * remake's walk is a short patrol, so it is planned clear of them.
 */
export function walkInScenery(point, key, placed = []) {
  const range = animalPatrolRange(key, point?.room);
  const body = (ANIMAL_BODY[key] || 0) / 2;
  let worst = 0;
  for (const other of placed || []) {
    if (!Number.isFinite(other?.x) || !Number.isFinite(other?.y) || Math.abs(other.y - point.y) > WALK_FLOOR_DY) continue;
    // Where players arrive: not planted there either (a walk may pass it).
    if (other.key === 'player') {
      if (Math.abs(point.x - other.x) < WALK_ARRIVAL_PX) return 2;
      continue;
    }
    // Another walker: never planted on top of it (they walk through each other, as the original's did).
    if (ANIMAL_BODY[other.key]) {
      if (Math.abs(point.x - other.x) < (ANIMAL_BODY[other.key] + (ANIMAL_BODY[key] || 0)) / 2) return 2;
      continue;
    }
    if (!SCENERY_KEYS.includes(other.key)) continue;
    const reach = (PLACEMENT_FOOTPRINTS[other.key] || 0) / 2 + body;
    if (Math.abs(point.x - other.x) < reach) return 2;
    if (Math.abs(point.x - range - other.x) < reach || Math.abs(point.x + range - other.x) < reach
      || (point.x - range < other.x && point.x + range > other.x)) worst = 1;
  }
  return worst;
}

export function nearestPlacementGap(plan, fromKey, toKeys = null) {
  const from = plan?.groups?.[fromKey] || [];
  const allowed = toKeys ? new Set(toKeys) : null;
  const targets = Object.entries(plan?.groups || {})
    .filter(([key]) => key !== fromKey && (!allowed || allowed.has(key)))
    .flatMap(([, points]) => points);
  if (!from.length || !targets.length) return Infinity;
  return Math.min(...from.flatMap((a) => targets.map((b) => Math.hypot(a.x - b.x, a.y - b.y))));
}
