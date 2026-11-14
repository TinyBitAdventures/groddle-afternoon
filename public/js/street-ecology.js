/**
 * Source-derived street population plus deterministic, collision-aware
 * placement on recovered locations-xml platforms.
 */

import { avatarHeadReach, groundBeneath, isItemSolid, isStandable, platformYAt, worldToScreen } from './street-model.js?v=b6cb6a4e';
import { behindFloor } from './reach.js?v=8e52df56';
import { MAILBOX_SHEETS, measuredMailboxes } from './street-furniture.js?v=cf1d21b1';
import { QUOIN_SPOTS } from './quoin-spots-data.js?v=7c343cbc';
import { BARNACLE_SPOTS } from './barnacle-spots-data.js?v=cea3daec';
import {
  JELLISAC_SPOTS,
  PAPER_TREE_SPOTS,
  PEAT_SPOTS,
  ROCK_BERYL_SPOTS,
  ROCK_DULLITE_SPOTS,
  ROCK_METAL_SPOTS,
  ROCK_SPARKLY_SPOTS,
  TREE_SPOTS,
} from './node-spots-data.js?v=97d4281c';
import { SHRINE_SPOTS } from './shrine-spots-data.js?v=776014a7';

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
 * frequency order. `resourceCounts` on a population is the location file's
 * count; `resourceNodeClasses` is the spawn list, the same count (G399) apart
 * from the two capped animals below.
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

/**
 * Only the wandering animals have a render cap: each is a sprite that moves
 * every frame, and the files name up to 49 Fireflies and 54 Salmon on one
 * street. Every node that stands still spawns as the location file says.
 */
export const RESOURCE_NODE_CAPS = Object.freeze({
  npc_firefly: 12,
  npc_salmon: 8,
});

/**
 * Player report #210: Mortar Barnacles were set by hand (mortar_barnacle.js obey_physics false), mostly
 * on walls: Froughtful Fen's 11 sit on the beehive huts over its decks and on a barrel, none on the
 * ground. The location files only count them, so a street whose players' snaps show where they were
 * has measured spots (MEASURED_NODE_SPOTS, assets/content/barnacle-spots.json from
 * tools/snap-placements/barnacles.py) and every barnacle the file names, measured first. Any the
 * snaps did not show are planned on a floor, as are all of a street with no snap, and of those the
 * planner seats at most PLANNED_NODE_CAPS: a floor is never where the original had them, so an
 * invented row of 13 along the ground is worse than a few.
 *
 * Player reports #249 and #250: Jellisacs and Peat Bogs were set by hand too (jellisac.js and
 * peat_base.js obey_physics false). Every Jellisac on Vuoksi Vale sat in a dark hole in the rock
 * face, and Peat Bogs lay flat on floors and ledges; the planner hung one Jellisac on a ledge in
 * mid-air and laid a Peat Bog along Ratin Jot Jog's root. They have measured spots the same way
 * (assets/content/node-spots.json from tools/snap-placements/nodes.py), and the planned rest keep
 * to steady floors (STEADY_FLOOR_GROUPS) and these caps.
 *
 * Rocks too (the placements audit, 2026-11-12): Glitch set its Metal, Beryl, Dullite and Sparkly
 * Rocks by hand (rock_metal_1.js etc. obey_physics false), and the planner put 31% of the 763 on
 * snapped streets at a height where the street never had one. Their spots and shapes come from the
 * snaps the same way (nodes.py), and the rest are planned (rockPlacementRequest, rockSpawnPlan).
 * Paper Trees the same (paper_tree.js obey_physics false: the snaps show them on the floors, where
 * no spot is ever a variant, so a spot carries none).
 */
export const PLANNED_NODE_CAPS = Object.freeze({
  mortar_barnacle: 6,
  jellisac: 4,
  peat_1: 3,
});

/** Measured spots per class: { [class]: { [G tsid]: [[x, y, variant number], ...] } } (street px). */
export const MEASURED_NODE_SPOTS = Object.freeze({
  mortar_barnacle: Object.freeze({ variantPrefix: 'blister', streets: BARNACLE_SPOTS }),
  jellisac: Object.freeze({ variantPrefix: 'jellySack', streets: JELLISAC_SPOTS }),
  peat_1: Object.freeze({ variantPrefix: 'peat', streets: PEAT_SPOTS }),
  // A Paper Tree's art follows its paper and care, never a variant: its spots carry none (null).
  paper_tree: Object.freeze({ variantPrefix: '', streets: PAPER_TREE_SPOTS }),
  // A rock's variant is the class of the shape the snap shows (rock_metal_2: items/rock_metal_2.js, proxy_item rock_metal_1).
  rock_metal_1: Object.freeze({ variantPrefix: 'rock_metal_', streets: ROCK_METAL_SPOTS }),
  rock_beryl_1: Object.freeze({ variantPrefix: 'rock_beryl_', streets: ROCK_BERYL_SPOTS }),
  rock_dullite_1: Object.freeze({ variantPrefix: 'rock_dullite_', streets: ROCK_DULLITE_SPOTS }),
  rock_sparkly_1: Object.freeze({ variantPrefix: 'rock_sparkly_', streets: ROCK_SPARKLY_SPOTS }),
});

/**
 * A street's measured node spots, { [class]: [{ x, y, variant }] } (street px, the art's frame cell
 * bottom centre: resource-nodes-feature draws these wall-mounted), or null when it has none.
 */
export function measuredNodeSpots(tsid) {
  let out = null;
  for (const [classTsid, source] of Object.entries(MEASURED_NODE_SPOTS)) {
    let rows = null;
    for (const alias of streetEcologyAliases(tsid)) {
      if (source.streets[alias]) {
        rows = source.streets[alias];
        break;
      }
    }
    if (!rows?.length) continue;
    out ||= {};
    out[classTsid] = rows
      .filter((row) => Number.isFinite(row?.[0]) && Number.isFinite(row?.[1]))
      .map(([x, y, v]) => ({ x, y, variant: Number.isFinite(v) ? `${source.variantPrefix}${v}` : null }));
  }
  return out;
}

function resourceCountsFrom(counts) {
  const out = {};
  for (const classTsid of RESOURCE_NODE_CLASSES) {
    const n = whole(counts?.[classTsid]);
    if (n > 0) out[classTsid] = n;
  }
  return out;
}

function expandResourceClasses(counts, spots = null) {
  const out = [];
  for (const classTsid of RESOURCE_NODE_CLASSES) {
    let n = Math.min(whole(counts?.[classTsid]), RESOURCE_NODE_CAPS[classTsid] ?? Infinity);
    if (PLANNED_NODE_CAPS[classTsid] != null) {
      const measured = Math.min(n, spots?.[classTsid]?.length || 0);
      n = measured + Math.min(n - measured, PLANNED_NODE_CAPS[classTsid]);
    }
    for (let i = 0; i < n; i += 1) out.push(classTsid);
  }
  return out;
}

/**
 * The population's measured spots: its nodes' for its spawn list (resource-nodes-feature
 * resourceSpawnPlan) and its trees' (treePlacementRequest), if any.
 */
function spotFields(spots, trees = null) {
  return { ...(spots ? { resourceSpots: spots } : {}), ...(trees ? { treeSpots: trees } : {}) };
}

/**
 * Glitch's rocks came in three shapes a kind (the placements audit, 2026-11-12): rock_metal_2 and
 * rock_metal_3 are items of their own with their own art (items/rock_metal_2.js 11-13: proxy_item
 * rock_metal_1, no info page; 'position' 156 x 137 against _1's 136 x 100), and every line that
 * mines them is _1's (the twelve rock_*_N.js files differ only in has_infopage, proxy_item,
 * is_routable, the art and the thumb). So the remake keeps one class a kind and draws the shape.
 * The art is Tiny Speck's own sheets (OpenGameArt glitch-assets-2.7z, CC0: js/mining.js ROCK_SHAPES).
 *
 * ROCK_SHAPE_SHARES: how many of each shape (_1, _2, _3) of each kind the players' 2012 snaps show
 * (tools/snap-placements/nodes.py, node-spots.json: 720 of the 767 rocks the files name on the 223
 * snapped rock streets, 430 of them _2 or _3); a planned rock takes a shape in those proportions,
 * fixed per street and rock (rockShapeFor).
 * ROCK_SHAPE_WIDTHS: each shape's whole rock as drawn (1:1), its first chunk frame's opaque width,
 * which the floor under a planned rock must hold (else it takes a narrower shape).
 * ROCK_SHAPE_HEIGHTS: the frame cell's height (what the hit box and the planner's keep-clear box cover).
 */
export const ROCK_SHAPE_SHARES = Object.freeze({
  rock_metal_1: Object.freeze([154, 96, 55]),
  rock_beryl_1: Object.freeze([53, 60, 60]),
  rock_dullite_1: Object.freeze([44, 51, 36]),
  rock_sparkly_1: Object.freeze([39, 25, 47]),
});
export const ROCK_SHAPE_WIDTHS = Object.freeze({
  rock_metal_1: Object.freeze([126, 138, 168]),
  rock_beryl_1: Object.freeze([96, 100, 153]),
  rock_dullite_1: Object.freeze([86, 87, 130]),
  rock_sparkly_1: Object.freeze([99, 104, 143]),
});
export const ROCK_SHAPE_HEIGHTS = Object.freeze({
  rock_metal_1: Object.freeze([100, 137, 92]),
  rock_beryl_1: Object.freeze([120, 129, 98]),
  rock_dullite_1: Object.freeze([114, 130, 82]),
  rock_sparkly_1: Object.freeze([127, 150, 88]),
});

/** PURE: a shape number (1-3) as a whole number, or 0. */
function rockShapeNumber(variant) {
  const n = Number(String(variant ?? '').slice(-1));
  return n >= 1 && n <= 3 ? n : 0;
}

/**
 * PURE: the shape (1-3) of a planned rock: drawn in Glitch's proportions from the street and the
 * rock's index (the same on every page and the server's layout); a shape wider than the floor its
 * spot holds (`room`, the plan point's) gives way to the widest one that fits, else the narrowest.
 */
export function rockShapeFor(tsid, index, classTsid, room = Infinity) {
  const shares = ROCK_SHAPE_SHARES[classTsid];
  if (!shares) return 1;
  const total = shares.reduce((a, b) => a + b, 0);
  let roll = ((stableEcologyHash(`${tsid}:rock-shape:${index}`) % 10007) / 10007) * total;
  let shape = shares.length;
  for (let i = 0; i < shares.length; i += 1) {
    if (roll < shares[i]) {
      shape = i + 1;
      break;
    }
    roll -= shares[i];
  }
  const widths = ROCK_SHAPE_WIDTHS[classTsid];
  if (!Number.isFinite(room) || widths[shape - 1] <= room) return shape;
  const fits = [1, 2, 3].filter((n) => widths[n - 1] <= room);
  if (fits.length) return fits.reduce((a, b) => (widths[b - 1] > widths[a - 1] ? b : a));
  return [1, 2, 3].reduce((a, b) => (widths[b - 1] < widths[a - 1] ? b : a));
}

/** Each rock's measured spot ({ x, y, shape }) by its index in rockClasses, or null where it is planned. */
function measuredRockSlots(population) {
  const used = {};
  return (population?.rockClasses || []).map((classTsid) => {
    const k = used[classTsid] || 0;
    used[classTsid] = k + 1;
    const spot = population?.resourceSpots?.[classTsid]?.[k];
    if (!spot || !Number.isFinite(spot.x) || !Number.isFinite(spot.y)) return null;
    return { x: spot.x, y: spot.y, shape: rockShapeNumber(spot.variant) || 1 };
  });
}

/**
 * The rocks' planner request: every rock of the street, the ones measured on its snaps as `fixed`
 * points (planStreetPlacements seats them first, where the snap shows them, and keeps every other
 * thing off them), the rest planned. game.js enterStreet, the realtime builders and the level
 * builder all ask with this.
 */
export function rockPlacementRequest(population) {
  const fixed = measuredRockSlots(population).map((slot, index) => {
    if (!slot) return null;
    const classTsid = population.rockClasses[index];
    return { x: slot.x, y: slot.y, w: ROCK_SHAPE_WIDTHS[classTsid]?.[slot.shape - 1] || 0, h: ROCK_SHAPE_HEIGHTS[classTsid]?.[slot.shape - 1] || 0 };
  }).filter(Boolean);
  return { key: 'rocks', count: population?.rockClasses?.length || 0, clearance: 74, ...(fixed.length ? { fixed } : {}) };
}

/**
 * PURE: each rock of the street, in rockClasses order (its index is its id, rock:<i>, and its saved
 * state's slot): { index, classTsid, x, y, shape, measured, room }. A measured rock stands where the
 * snap shows it, in the snap's shape; a planned one on the planner's next point (`points`, the
 * plan's rocks group: its fixed points first), in rockShapeFor's shape. x and y are null for a
 * planned rock the planner could not seat.
 */
export function rockSpawnPlan(population, points = [], tsid = '') {
  const slots = measuredRockSlots(population);
  const planned = (points || []).filter((p) => !p?.fixed);
  let next = 0;
  return (population?.rockClasses || []).map((classTsid, index) => {
    const slot = slots[index];
    if (slot) return { index, classTsid, x: slot.x, y: slot.y, shape: slot.shape, measured: true, room: Infinity };
    const p = planned[next];
    next += 1;
    const room = Number.isFinite(p?.room) ? p.room : Infinity;
    return {
      index,
      classTsid,
      x: Number.isFinite(p?.x) ? p.x : null,
      y: Number.isFinite(p?.y) ? p.y : null,
      shape: rockShapeFor(tsid, index, classTsid, room),
      measured: false,
      room,
    };
  });
}

/**
 * Trees (the placements audit, 2026-11-12): Glitch set its trants by hand (trant_fruit.js etc.
 * obey_physics false) and the planner put 27% of the ones on snapped streets at a height where the
 * street had none, low on the floors (their height rank against the street's floor spots: median
 * 0.30, Glitch's 0.56). tools/snap-placements/nodes.py measures every trant players' 2012 snaps show
 * (TREE_SPOTS, node-spots.json: the trunk's foot, the trant and its growth stage the snap shows).
 * Wood Trees are not measured (our art does not match the snaps), so they stay planned.
 *
 * PURE: a street's measured tree spots, [{ x, y, classTsid, stage }], or null.
 */
export function measuredTreeSpots(tsid) {
  for (const alias of streetEcologyAliases(tsid)) {
    const rows = TREE_SPOTS[alias];
    if (rows?.length) {
      return rows
        .filter((row) => Number.isFinite(row?.[0]) && Number.isFinite(row?.[1]))
        .map(([x, y, classTsid, stage]) => ({ x, y, classTsid: String(classTsid || ''), stage: Number(stage) || 0 }));
    }
  }
  return null;
}

/**
 * PURE: each tree's measured spot by its index in treeClasses ({ x, y, stage, shown }), or null where
 * it is planned. A trant the file names takes a spot where the snap shows a trant of its own class
 * first (left to right), then any trant spot left (a trant spot was a spot: a dead tree left a patch
 * and the patch grew whatever was planted, so the snap may show a Bean Tree where the file names a
 * Fruit Tree). The tree keeps its class, index and saved state; `shown` is the class the snap shows.
 * A Wood Tree never takes one.
 */
export function measuredTreeSlots(population) {
  const classes = population?.treeClasses || [];
  const spots = (population?.treeSpots || []).slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const taken = new Set();
  const out = classes.map(() => null);
  const seat = (index, spot, k) => {
    taken.add(k);
    out[index] = { x: spot.x, y: spot.y, stage: spot.stage, shown: spot.classTsid };
  };
  classes.forEach((classTsid, index) => {
    if (classTsid === 'wood_tree') return;
    const k = spots.findIndex((spot, i) => !taken.has(i) && spot.classTsid === classTsid);
    if (k >= 0) seat(index, spots[k], k);
  });
  classes.forEach((classTsid, index) => {
    if (classTsid === 'wood_tree' || out[index]) return;
    const k = spots.findIndex((spot, i) => !taken.has(i));
    if (k >= 0) seat(index, spots[k], k);
  });
  return out;
}

/**
 * Shrines (lanes meadow2012 and pins2, 2026-11-14): Glitch set each by hand (npc_shrine_*.js
 * obey_physics false) and the planner put Groddle Meadow's far from where its street's 2011-2012
 * picture shows them (30 of 36 more than 300 px off), and the same in the 16 other regions no
 * player's snap covers. tools/snap-placements/shrine-pictures.mjs seats the spots read off those
 * pictures on the floor under them (shrine-spots-data.js SHRINE_SPOTS).
 *
 * PURE: a street's shrine spot, { x, y } (the shrine's foot, street px), or null where it is planned.
 */
export function measuredShrineSpot(tsid) {
  if (!tsid) return null;
  for (const alias of streetEcologyAliases(tsid)) {
    const row = SHRINE_SPOTS[alias];
    if (row && Number.isFinite(row[0]) && Number.isFinite(row[1])) return { x: row[0], y: row[1] };
  }
  return null;
}

function shrineSpotField(tsid) {
  const spot = measuredShrineSpot(tsid);
  return spot ? { shrineSpot: spot } : {};
}

/**
 * The shrine's planner request: the street's shrine, as a `fixed` point where its picture shows it
 * (planStreetPlacements seats it before anything else is planned and keeps every other thing off
 * it, its box PLACEMENT_FOOTPRINTS.shrine x PLACEMENT_HEIGHTS.shrine), else planned. game.js
 * enterStreet, the realtime builders and the level builder all ask with this.
 */
export function shrinePlacementRequest(population) {
  const count = population?.shrine ? 1 : 0;
  const spot = population?.shrineSpot;
  const fixed = count && Number.isFinite(spot?.x) && Number.isFinite(spot?.y)
    ? [{ x: spot.x, y: spot.y, w: PLACEMENT_FOOTPRINTS.shrine, h: PLACEMENT_HEIGHTS.shrine }]
    : null;
  return { key: 'shrine', count, clearance: 135, ...(fixed ? { fixed } : {}) };
}

/**
 * The trees' planner request: every tree of the street, the ones the snaps show as `fixed` points at
 * their own index (planStreetPlacements seats them first, where the snap shows them, keeps every
 * other thing off them, and puts each at its index in the group, so placement('trees')[i] is still
 * tree i: its id tree:<i>, its class and its saved state), the rest planned. game.js enterStreet, the
 * realtime builders and the level builder all ask with this.
 */
export function treePlacementRequest(population) {
  const fixed = measuredTreeSlots(population).map((slot, index) => (
    slot ? { x: slot.x, y: slot.y, w: TREE_FOOTPRINT, h: PLACEMENT_HEIGHTS.trees, index } : null
  )).filter(Boolean);
  return { key: 'trees', count: population?.treeClasses?.length || 0, clearance: 135, ...(fixed.length ? { fixed } : {}) };
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

/**
 * Report #258: the streets whose shrine is this Giant's (each street row's giantId, where the
 * game stands its shrine), for "Find the closest Shrine to <Giant>" (glitch-client
 * FavorProgressUI.as 129, 189-212).
 */
export function shrineStreetsFor(giantId, source = catalog) {
  const id = String(giantId || '');
  if (!id) return [];
  return Object.entries(source?.streets || {}).filter(([, row]) => row?.giantId === id).map(([tsid]) => tsid);
}

export function ecologyForStreet(tsid, source = catalog) {
  for (const alias of streetEcologyAliases(tsid)) {
    if (source?.streets?.[alias]) return source.streets[alias];
  }
  return null;
}

function expandClasses(counts, classes, totalCap = Infinity, classCap = totalCap === Infinity ? Infinity : 8) {
  const out = [];
  for (const classTsid of classes) {
    const perClass = Math.min(whole(counts?.[classTsid]), classCap);
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
  // Spots measured on this street's snaps (player report #210): its own floors and walls, whatever row.
  const spots = measuredNodeSpots(tsid);
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
      rockClasses: expandClasses(counts, ROCK_CLASSES),
      gardens: Math.min(whole(counts.garden), 2),
      vendor: whole(counts.street_spirit) > 0,
      shrine: !!entry.giantId,
      apples: 0,
      musicblocks: 0,
      quoins: whole(entry.quoins, 0, 40),
      companions: entry.companions !== false,
      resourceCounts: resourceCountsFrom(counts),
      featureCounts: featureCountsFrom(counts),
      resourceNodeClasses: expandResourceClasses(counts, spots),
      ...spotFields(spots, measuredTreeSpots(tsid)),
      ...shrineSpotField(entry.giantId ? tsid : null),
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
  let rockClasses = expandClasses(counts, ROCK_CLASSES);
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
  // Report #252: on the Herb Gardens streets every Garden the file names is a bed in a planter box
  // (streetGardenBoxBeds), none is planned.
  const gardenBoxes = !starter && isGardenBoxStreet(tsid) ? whole(entry?.counts?.garden) : 0;
  if (gardenBoxes) gardens = 0;

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
    ...(gardenBoxes ? { gardenBoxes } : {}),
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
    resourceNodeClasses: expandResourceClasses(counts, spots),
    // The starter's onboarding trees are the remake's own: they are planned.
    ...spotFields(spots, starter && !entry ? null : measuredTreeSpots(tsid)),
    ...shrineSpotField(shrine && entry ? tsid : null),
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
 * - rocks: the mining sheets' opaque art (assets/sprites/mining) at 1:1, as Glitch drew
 *   items and the snaps show them (the placements audit, 2026-11-12: the art matches the snaps
 *   at scale 1.0, 0.98-0.999, and not at 0.85): the _1 and _2 shapes 86-138 px
 *   (ROCK_SHAPE_WIDTHS). A planned rock takes the wide, flat _3 shape (130-168 px) only where
 *   its floor holds it (rockShapeFor).
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
  rocks: 120,
  piggies: ANIMAL_BODY.piggies + 2 * ANIMAL_PATROL.piggies,
  chickens: ANIMAL_BODY.chickens + 2 * ANIMAL_PATROL.chickens,
  butterflies: 48,
  // Player report #210: a planned Mortar Barnacle's blister art (32-39 px a frame) and a little floor round it.
  'resource:mortar_barnacle': 60,
  // Reports #249, #250: a Jellisac's sack (40-47 px a frame), and a Peat Bog's mound (peat1-3 frames
  // 166-211 px, the opaque mound about 160-190) lying whole on its floor.
  'resource:jellisac': 60,
  'resource:peat_1': 180,
  // The placements audit (2026-11-12): nodes that hung off ledge ends, each its art's foot as drawn
  // (assets/sprites/resources, 1:1) and a little floor: a Dirt Pile's mound (179 px wide, 131 at
  // its foot), an Ice Nubbin's (38-67 px, knob4 the widest), a Dust Trap's (39 px idle, the
  // smack-down wider), a Paper Tree's trunk (54 px; the 230 px canopy may overhang, as a tree's
  // does), a Visiting Stone (street-furniture visiting-stone.webp, 81 px).
  'resource:dirt_pile': 150,
  'resource:ice_knob': 60,
  'resource:dust_trap': 60,
  'resource:paper_tree': 80,
  furnitureStone: 90,
  // A street mailbox's stand (mailbox-left-idle.webp: 46 px at its foot, 1:1) and a little floor; the
  // box on top may overhang.
  furnitureMailbox: 60,
});

/**
 * Player report #210: planned Mortar Barnacles stood on a 45 degree ramp and on short ledges over
 * Froughtful Fen's decks. A group here only takes a floor no steeper than `maxSlope` (rise over run)
 * and never a ledge (a run shorter than `ledgeRun` px) with another floor under it (a perch,
 * PERCH_DROP_PX); with no such spot left, or none with its footprint's room, it is not placed
 * (planStreetPlacements: no fallback).
 *
 * Reports #249, #250: planned Jellisacs and Peat Bogs (the ones the snaps do not show) keep to
 * steady floors too, and neither end of the thing may hang over air: `edgeDrop` is the most the
 * floor under either end of its footprint may fall away below its spot (footOverAir), so a Peat Bog
 * laid on a 0.5 root with its low end 38 px over air, or a Jellisac at a ledge's lip, is out. A Peat
 * Bog lies flat (no slope over 0.15), on a ledge as readily as on the floor (Glitch had them on
 * ledges: no ledge rule).
 *
 * The placements audit (2026-11-12): Dirt Piles and Ice Nubbins hung off ledge ends as the Peat Bog
 * did (Dirt Piles: 41 of 250 with an end over 12 px of air, up to 227 px on Firabiz Flaunts; Ice
 * Nubbins 17 of 310 over 40 px, 9 on short ledges high over the floor), Dust Traps stood on
 * slopes over 0.4, and Visiting Stones over edges (Salix Seach, 183 px). They take the Jellisac's
 * rule: both ends over a floor, no short ledge over another floor, and a Dirt Pile's wide mound
 * no slope over 0.25 (Glitch's rocks, the nearest thing measured: 97% on floors of 0.25 or less).
 * A street with no such spot left plans fewer of them (planStreetPlacements: no fallback).
 *
 * Mailboxes the same (the placements audit, 2026-11-12: 12 of 262 planned with an end over 40 px of
 * air, and after the height cut went the overhangs rose from 12 to 18): both ends of the stand over a
 * floor, no slope over 0.3, a ledge as good as a floor. A street's mailbox is where its mail is, so
 * one is never left out (`keep`): with no steady spot left it takes any, as before.
 */
export const STEADY_FLOOR_GROUPS = Object.freeze({
  'resource:mortar_barnacle': Object.freeze({ maxSlope: 0.4, ledgeRun: 240 }),
  'resource:jellisac': Object.freeze({ maxSlope: 0.25, ledgeRun: 240, edgeDrop: 12 }),
  'resource:peat_1': Object.freeze({ maxSlope: 0.15, ledgeRun: 0, edgeDrop: 12 }),
  'resource:dirt_pile': Object.freeze({ maxSlope: 0.25, ledgeRun: 240, edgeDrop: 12 }),
  'resource:ice_knob': Object.freeze({ maxSlope: 0.4, ledgeRun: 240, edgeDrop: 12 }),
  'resource:dust_trap': Object.freeze({ maxSlope: 0.4, ledgeRun: 240, edgeDrop: 12 }),
  'resource:paper_tree': Object.freeze({ maxSlope: 0.3, ledgeRun: 240, edgeDrop: 12 }),
  furnitureStone: Object.freeze({ maxSlope: 0.3, ledgeRun: 240, edgeDrop: 12 }),
  furnitureMailbox: Object.freeze({ maxSlope: 0.3, ledgeRun: 0, edgeDrop: 12, keep: true }),
});

/**
 * Big things stand on level ground (the placements audit, 2026-11-12): the planner had a Street
 * Spirit on a 1.38 slope (Mullat), a mailbox on 1.78 against Saani Shim's rock face and a Bean Tree
 * standing into Anrasan Glance's cliff. Of the rocks players' 2012 snaps show, 98.5% stand on a
 * floor of 0.3 rise over run or less (650 measured: 10 over 0.3, 2 over 0.4, the steepest 0.47),
 * and of the trants all of them (70: the steepest 0.23); 10% of the floor spots a street offers
 * are steeper. So these groups take a floor steeper than BIG_THING_MAX_SLOPE only when no other
 * spot is left (the plan lists them under `steep`), and never leave a thing out for it: a tree or
 * rock keeps its index, a Piggy its home.
 */
export const BIG_THING_MAX_SLOPE = 0.3;
export const BIG_THING_GROUPS = Object.freeze(['trees', 'rocks', 'vendor', 'shrine', 'piggies', 'chickens', 'furnitureMailbox']);

/** PURE: whether a planner spot (buildPlatformCandidates) is a floor a STEADY_FLOOR_GROUPS rule takes. */
export function steadyFloor(candidate, rule) {
  if (!rule) return true;
  if ((candidate?.slope || 0) > rule.maxSlope) return false;
  return !((candidate?.under || 0) > 0 && (candidate?.run || 0) < rule.ledgeRun);
}

/** How far above a surface may stand over an edge and still count as under it (a step up). */
export const EDGE_STEP_UP_PX = 60;

/**
 * PURE: how far the floor falls away under the worse end of a thing `half` px each side of a spot
 * (screen px; Infinity when an end has no floor under it at all). Only lines items rest on
 * (isItemSolid) count, and a surface up to EDGE_STEP_UP_PX over the spot is one
 * the end sits against (0 drop).
 */
export function footOverAir(platforms, spot, half) {
  let worst = 0;
  for (const dx of [-half, half]) {
    const x = spot.x + dx;
    let best = null;
    for (const line of platforms || []) {
      if (!isItemSolid(line)) continue;
      const py = platformYAt(line, x, 0);
      if (py == null || py < spot.y - EDGE_STEP_UP_PX) continue;
      if (best == null || py < best) best = py;
    }
    worst = Math.max(worst, best == null ? Infinity : Math.max(0, best - spot.y));
  }
  return worst;
}
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
 * For a rock a deck is not a perch (the placements audit, 2026-11-12): a planned rock on an upper
 * floor whose own run is DECK_RUN_PX or more stands there as readily as on the street's floor. Of
 * the rocks players' 2012 snaps show, 346 of 671 (52%) stand on an upper floor over another, all but
 * 17 of them on a run of 240 px or more (244 on 480 or more), as high over the floor below as any
 * such deck (median 338 px against 301); 44% of the floor spots on those streets are such upper
 * floors. Taking the lowest floors first kept planned rocks low: ranked against each street's floor
 * spots (0 its lowest, 1 its highest) their median was 0.27 against Glitch's 0.55, a two-sample KS
 * distance of 0.43; with every height a candidate and decks as floors it is 0.66, KS 0.13. Trees keep the perch rule for now: decks taken as floors also put them in Groddle
 * Forest Junction's pine branches, where its snaps show none (their spots are measured next, as
 * the rocks'), and the walking animals keep to the floor while it has room.
 */
export const DECK_RUN_PX = 240;
export const DECK_GROUPS = Object.freeze(['rocks']);

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
  rocks: 130, // the mining sheets' cells (82-150 px tall, ROCK_SHAPE_HEIGHTS) at spawnMineRock's 1:1
});
/**
 * Report #256: a Mortar Barnacle and a Visiting Stone planned on a ledge behind a Spice Tree on
 * Kalix Follows stood inside its canopy. A planned tree's canopy (TREE_CANOPY: the widest trant as
 * drawn, trant_spice 318x250 at spawnTrees' 210 px, 267 px; the group does not know its class) is
 * a box the groups below keep out of while any other spot is left, each by its art's box: its
 * footprint and this height (the art as drawn: the barnacle's blister frames 39-47 px, the
 * Jellisac's sack 39-52, the Ice Nubbin's knobs 52-71, the Peat Bog's mound 46-104, the Dust
 * Trap's idle trap 103, a Dirt Pile's mound about 120, a Paper Tree's 230 px canopy, the Visiting
 * Stone's 101x155 art at its 81 px width, 124). In Glitch they were set down by hand and never
 * planned into one another (the archived streets).
 */
export const TREE_CANOPY = Object.freeze({ w: 267, h: 210 });
export const UNDER_CANOPY_HEIGHTS = Object.freeze({
  'resource:mortar_barnacle': 47,
  'resource:jellisac': 52,
  'resource:ice_knob': 71,
  'resource:peat_1': 104,
  'resource:dust_trap': 103,
  'resource:dirt_pile': 120,
  'resource:paper_tree': 230,
  furnitureStone: 124,
});
/** A planned tree's canopy box (TREE_CANOPY over its spot). */
function canopyOf(point) {
  const w = TREE_CANOPY.w / 2;
  return { ...point, block: { l: point.x - w, r: point.x + w, t: point.y - TREE_CANOPY.h, b: point.y } };
}
export const LADDER_FOOT_PX = 120;
/** Below a door's floor point, how far a spot still counts as its doorstep (a sloped floor). */
export const DOORWAY_DROP_PX = 40;

/**
 * The street's keep-clear spots for planStreetPlacements, in screen space:
 * { x, y, key, clearance, block: { l, r, t, b }, doorway?, scenery? }. One helper for
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
  // Report #252: a Herb Gardens street's planter boxes hold its beds, kept clear as a planned bed is.
  if (isGardenBoxStreet(street?.tsid)) {
    streetGardenBoxes(street).forEach((b, index) => {
      out.push({ x: b.x, y: b.y, key: `garden-box:${index}`, clearance: 165, block: box(b.x, b.y, b.w, b.h) });
    });
  }
  // The mailboxes players' 2012 snaps show (street-furniture.js measuredMailboxes, nodes.py): set by
  // hand where they are, so every planned thing keeps clear of them as of a signpost.
  (measuredMailboxes(street?.tsid) || []).forEach((m, index) => {
    out.push({ x: m.x, y: m.y, key: `mailbox:${index}`, clearance: 80, block: box(m.x, m.y, MAILBOX_SHEETS.idle.fw, MAILBOX_SHEETS.idle.fh) });
  });
  out.push(...measuredNodeCovers(street?.tsid));
  out.push(...frontDecoCovers(street));
  return out;
}

/**
 * Report #319: the measured Peat Bogs, Jellisacs, Mortar Barnacles and Paper Trees (measuredNodeSpots,
 * drawn where the snaps show them, resource-nodes-feature resourceSpawnPlan) as keep-clear spots, so
 * a planned shrine, tree, rock, vendor, garden or animal never stands on one and a quoin keeps its
 * distance, as of a measured rock or tree (Viscid Pud's shrine was planned 32 px from its peat).
 * Glitch set both by hand (peat_1.js, jellisac.js, npc_shrine_*.js obey_physics false), so they
 * never met. Each box is the art's frame cell as drawn (1:1, its bottom centre on the spot: the
 * wall barnacles' too, so one well above a shrine leaves it be), the soft clearance its planned
 * node's (resource-nodes-feature RESOURCE_PLACEMENT_CLEARANCE). `scenery`: walking animals keep
 * their walk off it (walkInScenery). Every measured spot is drawn (expandResourceClasses keeps them).
 */
export const MEASURED_NODE_COVERS = Object.freeze({
  // resource-nodes.js mortar_barnacle sheets blister1-6: frame width x height.
  mortar_barnacle: Object.freeze({ clearance: 42, cells: Object.freeze({ blister1: [39, 44], blister2: [35, 40], blister3: [35, 39], blister4: [36, 40], blister5: [32, 39], blister6: [39, 47] }) }),
  jellisac: Object.freeze({ clearance: 42, cells: Object.freeze({ jellySack1: [40, 48], jellySack2: [42, 46], jellySack3: [44, 39], jellySack4: [47, 52] }) }),
  peat_1: Object.freeze({ clearance: 115, cells: Object.freeze({ peat1: [211, 52], peat2: [166, 46], peat3: [178, 57] }) }),
  // One art for every Paper Tree (its sheet follows its care): 232 x 216.
  paper_tree: Object.freeze({ clearance: 135, cells: Object.freeze({ '': [232, 216] }) }),
});

/** PURE: a street's measured node keep-clear spots (MEASURED_NODE_COVERS), in screen space. */
export function measuredNodeCovers(tsid) {
  const out = [];
  const spots = tsid ? measuredNodeSpots(tsid) : null;
  for (const [classTsid, rule] of Object.entries(MEASURED_NODE_COVERS)) {
    (spots?.[classTsid] || []).forEach((spot, index) => {
      const cells = Object.values(rule.cells);
      // An unknown variant takes the class's widest cell.
      const [w, h] = rule.cells[spot.variant || ''] || cells.reduce((a, b) => (b[0] > a[0] ? b : a));
      out.push({
        x: spot.x,
        y: spot.y,
        key: `node:${classTsid}:${index}`,
        clearance: rule.clearance,
        block: { l: spot.x - w / 2, r: spot.x + w / 2, t: spot.y - h, b: spot.y },
        scenery: true,
      });
    });
  }
  return out;
}

/**
 * Report #252: the three Herb Gardens streets, where each location file lists exactly as many
 * "Garden" items as the street has firebog planter boxes (Chakra Phool 8, Shimla Mirch 7,
 * Jethimadh 5), and players' snaps of 2012 show herbs growing in every box. Each Garden was a bed
 * in a box, so there the beds go in the boxes and none is planned (populationForStreet
 * `gardenBoxes`, the cap of two planned beds lifted).
 */
export const GARDEN_BOX_STREETS = Object.freeze(['GA95U14319524O9', 'GA97L62229522GS', 'GA99U5PI39524GN']);

/**
 * The planter box decos (decos/groddle/firebog_planter_box_<rows>x<cols>): a box named RxC holds R
 * rows of C plots (the snaps: the 1x3 boxes one row of three, 2x3 two rows of three, 3x4 twelve herbs
 * in three rows; garden_new.js width = plots across, height = plots deep). `soilFront` is how far
 * above the deco's foot the soil's front edge is, as a share of its height (the art measured at its
 * street size: 27 of 48, 26 of 64, 24 of 73 px); a bed's front plots stand on it (garden-view.js
 * plots 16 px deep, 14 a row: one, two and three rows fill the 18, 35 and 46 px of soil).
 */
export const PLANTER_BOXES = Object.freeze({
  firebog_planter_box_1x3: Object.freeze({ rows: 1, cols: 3, soilFront: 27 / 48 }),
  firebog_planter_box_2x3: Object.freeze({ rows: 2, cols: 3, soilFront: 26 / 64 }),
  firebog_planter_box_3x4: Object.freeze({ rows: 3, cols: 4, soilFront: 24 / 73 }),
});

export function isGardenBoxStreet(tsid) {
  const body = String(tsid || '').slice(1);
  return Boolean(body) && GARDEN_BOX_STREETS.some((t) => t.slice(1) === body);
}

/**
 * PURE: a street's planter boxes, left to right, in screen px: { x, y (the deco's foot), w, h, rows,
 * cols, bedY (where the bed's front plots stand), sprite }. Middleground decos are in world space.
 */
export function streetGardenBoxes(street) {
  const out = [];
  for (const layer of street?.layers || []) {
    if (layer?.name !== 'middleground' && layer?.id !== 'middleground') continue;
    for (const d of layer.decos || []) {
      const spec = PLANTER_BOXES[d?.sprite];
      if (!spec || d.hidden || !Number.isFinite(d.x) || !Number.isFinite(d.y)) continue;
      const p = street.bounds ? worldToScreen(street, d.x, d.y) : { x: d.x, y: d.y };
      const h = Number(d.h) || 48;
      out.push({ x: p.x, y: p.y, w: Number(d.w) || 250, h, rows: spec.rows, cols: spec.cols, bedY: p.y - Math.round(spec.soilFront * h) + 1, sprite: d.sprite });
    }
  }
  return out.sort((a, b) => a.x - b.x || a.y - b.y);
}

/**
 * The keys of the two beds the planner laid on these streets before report #252 (garden.js
 * streetGardenBed: herb2 four plots across, herb three, two rows each). Their plots, and any crops
 * growing in them, move into the smallest boxes that hold every one of their plots (on all three
 * streets herb2 goes to a 3x4 box and herb to a 2x3, so no plot is left out); the other boxes are
 * herb3, herb4... left to right.
 */
export const LEGACY_BOX_BEDS = Object.freeze([
  Object.freeze({ bed: 'herb2', cols: 4, rows: 2 }),
  Object.freeze({ bed: 'herb', cols: 3, rows: 2 }),
]);

/**
 * PURE: the beds in a street's planter boxes (report #252), left to right:
 * [{ bed, gardenType: 'herb', cols, rows, x, y, box }], x the box's centre and y where the bed's
 * front plots stand (game.js spawnGarden's origin, style none: the box is the bed). [] elsewhere.
 */
export function streetGardenBoxBeds(street, population) {
  const count = whole(population?.gardenBoxes);
  if (!count) return [];
  const boxes = streetGardenBoxes(street).slice(0, count);
  const keys = new Array(boxes.length).fill(null);
  for (const legacy of LEGACY_BOX_BEDS) {
    let pick = -1;
    boxes.forEach((b, i) => {
      if (keys[i]) return;
      const fits = b.cols >= legacy.cols && b.rows >= legacy.rows;
      const best = pick < 0 ? null : boxes[pick];
      const bestFits = best && best.cols >= legacy.cols && best.rows >= legacy.rows;
      if (pick < 0 || (fits && !bestFits) || (fits === bestFits && (fits ? b.cols * b.rows < best.cols * best.rows : b.cols * b.rows > best.cols * best.rows))) pick = i;
    });
    if (pick >= 0) keys[pick] = legacy.bed;
  }
  let next = 3;
  return boxes.map((b, i) => ({
    bed: keys[i] || `herb${next++}`,
    gardenType: 'herb',
    cols: b.cols,
    rows: b.rows,
    x: b.x,
    y: b.bedY,
    box: b,
  }));
}

/** The smallest deco on a layer in front of the player that can hide a tree, rock or Piggy (px). */
export const FRONT_DECO_MIN = Object.freeze({ w: 120, h: 90 });
/**
 * The smallest front deco that still counts as part of a fill: cave rock is laid as many tiles,
 * some turned (Megna Burrow's middleplus, cave_gr_tiling_piece 178 x 184, cave_gr_tile_horiz_sm
 * 184 x 89 at r 50 and 90), none of which hides a thing alone but which together hide it whole.
 */
export const FRONT_FILL_MIN = Object.freeze({ w: 40, h: 40 });
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
 * wide and as tall as the street: a parallax layer moves against the street as the camera does.
 * Smaller or turned tiles (FRONT_FILL_MIN, any `r`) come too, marked `fill` with their turn (`r`,
 * degrees clockwise about the bottom centre, as street-render.js sets spr.angle on a 0.5, 1
 * anchor) and their own size: they only hide things together (hiddenBehindFront), and a fill
 * tile is never a walkway (frontDecoWalkways).
 */
export function frontDecoCovers(street) {
  const out = [];
  const width = street?.bounds ? street.bounds.r - street.bounds.l : 0;
  const height = street?.bounds ? street.bounds.b - street.bounds.t : 0;
  for (const layer of street?.layers || []) {
    if (!(Number(layer?.z) > 0) || !width || Number(layer.w) !== width) continue;
    // A layer as wide as the street but shorter still moves up and down against it
    // (parallaxLayerOffset): Sylvan Grove's middleplus is 850 tall on a 1000 px street.
    if (Number.isFinite(Number(layer.h)) && Number(layer.h) > 0 && height && Number(layer.h) !== height) continue;
    (layer.decos || []).forEach((d, i) => {
      const w = Number(d?.w) || 0;
      const h = Number(d?.h) || 0;
      if (!Number.isFinite(d?.x) || !Number.isFinite(d?.y) || d.hidden) return;
      if (FRONT_SEE_THROUGH.test(String(d.sprite || ''))) return;
      const r = Number(d.r) || 0;
      const key = `front:${layer.name || layer.id}:${i}`;
      if (w >= FRONT_DECO_MIN.w && h >= FRONT_DECO_MIN.h && !r) {
        out.push({ x: d.x, y: d.y, key, front: true, block: { l: d.x - w / 2, r: d.x + w / 2, t: d.y - h, b: d.y } });
        return;
      }
      if (w < FRONT_FILL_MIN.w || h < FRONT_FILL_MIN.h) return;
      out.push({ x: d.x, y: d.y, key, front: true, fill: true, r, w, h, block: turnedBox(d.x, d.y, w, h, r) });
    });
  }
  return out;
}

/** The screen box round a deco w x h turned `r` degrees about its bottom centre (x, y). */
function turnedBox(x, y, w, h, r) {
  const a = (r * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const xs = [];
  const ys = [];
  for (const [cx, cy] of [[-w / 2, 0], [w / 2, 0], [-w / 2, -h], [w / 2, -h]]) {
    xs.push(x + cx * cos - cy * sin);
    ys.push(y + cx * sin + cy * cos);
  }
  return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
}

/** PURE: whether the point (px, py) is inside front deco `f` (its turn included). */
function insideFront(f, px, py) {
  const b = f.block;
  if (px < b.l || px > b.r || py < b.t || py > b.b) return false;
  if (!f.fill || !f.r) return true;
  const a = (-f.r * Math.PI) / 180;
  const dx = px - f.x;
  const dy = py - f.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return lx >= -f.w / 2 && lx <= f.w / 2 && ly >= -f.h && ly <= 0;
}

/** Sample grid for the share of a box that front decos cover together (columns x rows). */
const FRONT_SAMPLES = Object.freeze([8, 6]);

/**
 * PURE: the share (0..1) of a w x h box standing on `spot` that the front decos cover between
 * them, from a FRONT_SAMPLES grid of points at the cells' centres.
 */
export function frontCoverShare(spot, w, h, fronts) {
  if (!fronts?.length) return 0;
  const l = spot.x - w / 2;
  const t = spot.y - h;
  const near = fronts.filter(({ block: b }) => b.r > l && b.l < l + w && b.b > t && b.t < spot.y);
  if (!near.length) return 0;
  const [cols, rows] = FRONT_SAMPLES;
  let hit = 0;
  for (let i = 0; i < cols; i += 1) {
    const px = l + ((i + 0.5) * w) / cols;
    for (let j = 0; j < rows; j += 1) {
      const py = t + ((j + 0.5) * h) / rows;
      if (near.some((f) => insideFront(f, px, py))) hit += 1;
    }
  }
  return hit / (cols * rows);
}

/**
 * The boxes the front check uses for things players walk up to that are not REACH_BOXES (the
 * reach check is about floors): a shrine (one 151 x 188 cell at spawnShrine's 0.78) and the
 * vendor (PLACEMENT_HEIGHTS). Megna Burrow (GA912TJ0KF328Q3) planned its shrine on the slope
 * that runs up through the cave's rock, behind the middleplus fill, so it and a player at it
 * could not be seen.
 */
export const FRONT_BOXES = Object.freeze({ shrine: [118, 147], vendor: [105, 127] });

/**
 * PURE: whether a thing of `key` at `spot` is mostly behind the front decos (frontDecoCovers):
 * one big deco over FRONT_HIDE_SHARE of its box, or (for things that stand still) the decos
 * together over that share. A walking animal (ANIMAL_PATROL) keeps the one-deco rule: it walks out
 * from behind a fill, and the planner would otherwise put it inside a rock rather than behind one
 * (GIFBSQJTGME2KRH, tests/piggies-walk-on.test.js).
 */
export function hiddenBehindFront(spot, key, fronts) {
  const size = REACH_BOXES[key] || FRONT_BOXES[key];
  if (!size || !fronts?.length) return false;
  const [w, h] = size;
  const l = spot.x - w / 2;
  const r = spot.x + w / 2;
  const t = spot.y - h;
  for (const f of fronts) {
    if (f.fill) continue;
    const b = f.block;
    const ox = Math.min(r, b.r) - Math.max(l, b.l);
    const oy = Math.min(spot.y, b.b) - Math.max(t, b.t);
    if (ox > 0 && oy > 0 && ox * oy >= FRONT_HIDE_SHARE * w * h) return true;
  }
  if (ANIMAL_PATROL[key]) return false;
  return frontCoverShare(spot, w, h, fronts) >= FRONT_HIDE_SHARE;
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
  return fronts.filter(({ block: b, fill }) => !fill && lines.some((line) => {
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

/** The width of the floor run under x on `line` (0: none). */
function runAt(spans, x) {
  for (const [lo, hi] of spans || []) {
    if (x >= lo - 0.01 && x <= hi + 0.01) return hi - lo;
  }
  return 0;
}

/**
 * G271: on a street whose 2012 snaps show its quoins (quoin-spots-data.js), the planner's quoins only
 * top them up (quoins.js streetQuoinPoints drops a planned spot within MEASURED_QUOIN_CLEARANCE of a
 * measured coin, the coin hanging about 92 px over its floor). So a planned quoin never takes such a
 * spot: with every floor height planned they would land on the measured coins' floors and the
 * top-up would come up short (Hechey Track 34 of its 36).
 */
function nearMeasuredQuoin(tsid) {
  const rows = QUOIN_SPOTS[String(tsid || '')] || QUOIN_SPOTS[`G${String(tsid || '').slice(1)}`];
  if (!rows?.length) return null;
  return (spot) => rows.some((m) => m[2] !== 'qurazy' && Math.abs(m[0] - spot.x) < 80 && Math.abs(m[1] - (spot.y - 92)) < 160);
}

/** How far over a spot another item floor may lie for the spot to count as inside it (STACK_SINK_PX + 4). */
const LINE_OVER_PX = 12;

/** Build dense, stable candidates along every reachable floor. */
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
  // Every height (the placements audit, 2026-11-12). The pool once kept only the lines in the lowest
  // 54% of the street's floor heights, and nothing was ever planned higher: but 37% of the 698 rocks
  // and 32% of the 78 trants players' 2012 snaps show stood above that cut. Ranked against the
  // street's floor spots (0 its lowest, 1 its highest), Glitch's rocks spread over every height
  // (median 0.56; tenths 27 53 92 68 68 70 80 74 80 86, KS 0.08 from even) and so do its trants
  // (median 0.56), so every reachable floor is a candidate, as every height was to Tiny Speck (and for
  // a rock an upper deck is a floor, DECK_RUN_PX).
  const pool = clean;

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
      const item = isItemSolid(platform);
      // A spot just under another item floor (a line laid a few px over this one) is inside that
      // floor: a thing set down there rests on the upper line (walk-surface.js stackRestY).
      if (item && itemLines.some((other) => {
        if (other === platform) return false;
        const py = platformYAt(other, x, 0);
        return py != null && py < y - 0.5 && py >= y - LINE_OVER_PX;
      })) continue;
      seen.add(key);
      candidates.push({
        id: `${platform.id || pIndex}:${i}`,
        x,
        y,
        item,
        room: item ? roomAt(spans.get(platform), x) : 0,
        under: item ? under(x, y) : 0,
        // STEADY_FLOOR_GROUPS: the line's rise over run and its floor run's width.
        slope: Math.abs(platform.y2 - platform.y1) / Math.max(1e-6, width),
        run: item ? runAt(spans.get(platform), x) : 0,
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
 * Every placed point carries its spot's `room`. A STEADY_FLOOR_GROUPS group (planned Mortar
 * Barnacles, Jellisacs and Peat Bogs, player reports #210, #249, #250) takes no steep ramp and no
 * short ledge, nor (with an `edgeDrop`) a spot with an end of it over air, and no fallback: one
 * with no such spot that has its room is left out.
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
 * A request may carry `fixed` points ({ x, y, w?, h?, index? }: rocks and trees measured on the
 * snaps, rockPlacementRequest, treePlacementRequest): they
 * are occupied before any group is planned, `count` includes them, and its group starts with them
 * (marked `fixed`), or with an `index` each stands at its index and the planned ones fill the rest. A
 * STEADY_FLOOR_GROUPS rule with `keep` takes any spot when no steady one is left. BIG_THING_GROUPS take a floor
 * steeper than BIG_THING_MAX_SLOPE last; the plan lists such points under `steep`.
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
  // A request's `fixed` points (measured rocks, rockPlacementRequest) are seated before anything is
  // planned: every other group keeps clear of them, and big scenery never covers one (`w` x `h`).
  const fixedOf = new Map();
  for (const request of requests || []) {
    const pts = (Array.isArray(request?.fixed) ? request.fixed : []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
    if (!pts.length) continue;
    const clearance = whole(request?.clearance, 40, 600);
    const placed = pts.map((p, i) => ({
      x: p.x,
      y: p.y,
      id: `fixed:${request.key}:${i}`,
      key: request.key,
      clearance,
      room: 0,
      fixed: true,
      ...(Number.isInteger(p.index) ? { index: p.index } : {}),
      ...(p.w > 0 && p.h > 0 ? { block: { l: p.x - p.w / 2, r: p.x + p.w / 2, t: p.y - p.h, b: p.y } } : {}),
    }));
    fixedOf.set(request.key, placed);
    occupied.push(...placed);
  }
  const fixtures = occupied.filter((point) => point.block);
  // Planned trees' canopies (report #256): only the UNDER_CANOPY_HEIGHTS groups keep out of them.
  const canopies = [];
  const used = new Set();
  const groups = {};
  const fallbacks = [];
  const perches = [];
  const blocked = [];
  const steep = [];
  const hiddenCache = new Map();
  const edgeCache = new Map();

  for (const request of requests || []) {
    const count = whole(request?.count, 0, 40);
    const clearance = whole(request?.clearance, 40, 600);
    // Fixed points with an `index` (measured trees, treePlacementRequest) stand at that index in the
    // group, the planned ones fill the others in order; without one (rocks) they lead the group.
    const fixedPts = fixedOf.get(request.key) || [];
    const fixedAt = fixedPts.length && fixedPts.every((p) => Number.isInteger(p.index))
      ? new Map(fixedPts.filter((p) => p.index < count).map((p) => [p.index, p]))
      : null;
    groups[request.key] = fixedAt ? [] : fixedPts.slice(0, count);
    if (request.key === 'trees') for (const point of groups.trees) canopies.push(canopyOf(point));
    const maxSlope = BIG_THING_GROUPS.includes(request.key) ? BIG_THING_MAX_SLOPE : null;
    const deck = DECK_GROUPS.includes(request.key);
    const measuredQuoin = request.key === 'quoins' ? nearMeasuredQuoin(tsid) : null;
    const avatar = request.key === 'player' || request.avatar === true;
    const footprint = avatar ? 0 : Number.isFinite(request?.footprint)
      ? Math.max(0, request.footprint)
      : PLACEMENT_FOOTPRINTS[request.key] || 0;
    const perching = request?.perch === true || PERCHING_GROUPS.includes(request.key);
    const steady = STEADY_FLOOR_GROUPS[request.key] || null;
    // Reports #249, #250: a steady group with an edgeDrop also keeps both ends of its footprint over a floor.
    const steadyRule = (candidate) => {
      if (!steadyFloor(candidate, steady)) return false;
      if (!Number.isFinite(steady?.edgeDrop)) return true;
      const k = `${candidate.id}:${footprint}`;
      if (!edgeCache.has(k)) edgeCache.set(k, footOverAir(platforms, candidate, footprint / 2));
      return edgeCache.get(k) <= steady.edgeDrop;
    };
    let steadyAt = steadyRule;
    const walker = Boolean(ANIMAL_PATROL[request.key]);
    const height = Number.isFinite(request?.height) ? Math.max(0, request.height) : PLACEMENT_HEIGHTS[request.key] || 0;
    // The fixture each spot would cover for this request (null: clear); the arrival covers nothing.
    const covers = new Map();
    const underCanopy = footprint > 0 && canopies.length ? UNDER_CANOPY_HEIGHTS[request.key] || 0 : 0;
    if (!avatar && (fixtures.length || underCanopy)) {
      for (const candidate of candidates) {
        const fixture = blockingFixture(candidate, fixtures, { footprint, height })
          || (underCanopy ? blockingFixture(candidate, canopies, { footprint, height: underCanopy }) : null);
        if (fixture) covers.set(candidate.id, fixture);
      }
    }
    for (let index = groups[request.key].length; index < count; index += 1) {
      if (fixedAt?.has(index)) {
        groups[request.key].push(fixedAt.get(index));
        if (request.key === 'trees') canopies.push(canopyOf(fixedAt.get(index)));
        continue;
      }
      // A `keep` rule (mailboxes) goes down even with no steady spot left: on any spot, as a planned
      // thing did before the rule.
      if (steady?.keep) {
        steadyAt = candidates.some((c) => !used.has(c.id) && c.item !== false && steadyRule(c)) ? steadyRule : () => true;
      }
      // The room this one asks for: its footprint, or the most any free clear spot
      // has (any free spot's, when none is clear).
      let need = 0;
      if (footprint > 0) {
        let clearNeed = -1;
        for (const candidate of candidates) {
          if (used.has(candidate.id) || candidate.item === false || !steadyAt(candidate)) continue;
          const room = Math.min(footprint, candidate.room || 0);
          need = Math.max(need, room);
          if (!covers.has(candidate.id)) clearNeed = Math.max(clearNeed, room);
        }
        if (clearNeed >= 0) need = clearNeed;
        // A steady-floor group (STEADY_FLOOR_GROUPS) never takes a cramped spot: it is left out instead.
        if (steady && !steady.keep && need < footprint) break;
        if (need < footprint) fallbacks.push({ key: request.key, index, room: Math.round(need), footprint });
      }
      let best = null;
      let bestScore = -Infinity;
      let bestTier = Infinity;
      for (const candidate of candidates) {
        if (used.has(candidate.id)) continue;
        if (!avatar && candidate.item === false) continue;
        if (!steadyAt(candidate)) continue;
        if (measuredQuoin?.(candidate)) continue;
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
        const perch = !perching && (candidate.under || 0) >= footprint && !(deck && (candidate.run || 0) >= DECK_RUN_PX);
        // Big scenery: a clear perch before a crowded floor; a walking animal stays on
        // the floor while it has room, crowded or not (it walks off as others come),
        // never planted in a tree, rock or stall or on another walker, and, before a
        // crowded spot, its walk clear of them (walkInScenery).
        const scenery = walker ? walkInScenery(candidate, request.key, occupied) : 0;
        // Ticket 64 follow-up: a tree, rock or Piggy behind a floor from beside it only when no other spot is left.
        let hidden = 0;
        if (REACH_BOXES[request.key] || FRONT_BOXES[request.key]) {
          const k = `${request.key}:${candidate.id}`;
          if (!hiddenCache.has(k)) hiddenCache.set(k, (REACH_BOXES[request.key] && hiddenBehindFloor(platforms, candidate, request.key)) || hiddenBehindFront(candidate, request.key, fronts));
          hidden = hiddenCache.get(k) ? 32 : 0;
        }
        // Ticket 118: rooted scenery on or behind a front deco that players walk along, last too.
        if (!hidden && height > 0 && footAtWalkway(candidate, footprint, walkways)) hidden = 32;
        // Big things on a floor steeper than BIG_THING_MAX_SLOPE only when nothing else is left.
        const tooSteep = maxSlope != null && (candidate.slope || 0) > maxSlope ? 64 : 0;
        const tier = tooSteep + (footprint > 0
          ? walker ? (perch ? 8 : 0) + (scenery === 2 ? 4 : 0) + (nearest < 1 ? 2 : 0) + (scenery === 1 ? 1 : 0) : (perch ? 1 : 0) + (nearest < 1 ? 2 : 0)
          : 0) + (covers.has(candidate.id) ? (walker ? 16 : 4) : 0) + hidden;
        if (tier < bestTier || (tier === bestTier && score > bestScore)) {
          bestTier = tier;
          bestScore = score;
          best = candidate;
        }
      }
      if (!best) break;
      if (footprint > 0 && !perching && (best.under || 0) >= footprint && !(deck && (best.run || 0) >= DECK_RUN_PX)) perches.push({ key: request.key, index });
      if (covers.has(best.id)) blocked.push({ key: request.key, index, fixture: covers.get(best.id).key });
      if (maxSlope != null && (best.slope || 0) > maxSlope) steep.push({ key: request.key, index, slope: Math.round(best.slope * 100) / 100 });
      used.add(best.id);
      const point = { x: best.x, y: best.y, id: best.id, key: request.key, clearance, room: best.room || 0 };
      groups[request.key].push(point);
      occupied.push(point);
      if (request.key === 'trees') canopies.push(canopyOf(point));
    }
  }

  return { seed: String(seed), groups, occupied, candidateCount: candidates.length, fallbacks, perches, blocked, steep };
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
    // A measured node (measuredNodeCovers, report #319) by its own box.
    const sceneryBox = other.scenery && other.block ? other.block.r - other.block.l : 0;
    if (!sceneryBox && !SCENERY_KEYS.includes(other.key)) continue;
    const reach = (sceneryBox || PLACEMENT_FOOTPRINTS[other.key] || 0) / 2 + body;
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
