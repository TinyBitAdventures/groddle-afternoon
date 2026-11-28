/**
 * Source-derived street population plus deterministic, collision-aware
 * placement on recovered locations-xml platforms.
 */

import { fetchRetry } from './load-retry.js?v=477aa7a7';
import { avatarHeadReach, groundBeneath, isItemSolid, isStandable, platformYAt, worldToScreen } from './street-model.js?v=a9a05f9d';
import { behindFloor } from './reach.js?v=456da8a8';
import { MAILBOX_SHEETS, measuredMailboxes, measuredStones } from './street-furniture.js?v=071203fc';
import { QUOIN_SPOTS } from './quoin-spots-data.js?v=7c343cbc';
import { nudgedBarnacleSpots } from './barnacle-nudges.js?v=159f11bf';
import { BARNACLE_SPOTS } from './barnacle-spots-data.js?v=cea3daec';
import { BARNACLE_LEFTOVER_SPOTS, BARNACLE_WALL_SPOTS } from './barnacle-wall-spots-data.js?v=8ba1ff7d';
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
import { DIRT_PILE_PICTURE_SPOTS, PEAT_PICTURE_SPOTS, TREE_PICTURE_SPOTS } from './node-picture-spots-data.js?v=36608622';
import { SHRINE_SPOTS } from './shrine-spots-data.js?v=c45dc2c2';
import { gardenBedWidth, measuredGardenBeds, pictureGardenBeds } from './garden-beds.js?v=2ac6a12c';
import { JELLISAC_HOLE_SPOTS } from './jellisac-hole-spots-data.js?v=256c00e9';
import { STONE_FRONT_MASKS } from './stone-front-masks-data.js?v=31b2b54a';
import { decoCovers } from './barnacle-walls.js?v=75e568c3';
import { SLOTH_SPOTS } from './sloth-spots-data.js?v=0fb481e0';
import { ICE_NUBBIN_SPOTS } from './ice-nubbin-spots-data.js?v=0a86af3c';
import { slothSpotFromRow } from './sloth-trees.js?v=775bef07';

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
 * snaps did not show are planned on a floor, and of those the planner seats at most
 * PLANNED_NODE_CAPS: a floor is never where the original had them, so an invented row of 13 along
 * the ground is worse than a few. G916 (#446): a street with no snap has every barnacle its file
 * names on a wall instead (js/barnacle-wall-spots-data.js: measured on its other pictures, else by
 * js/barnacle-walls.js's rule), so the cap no longer applies there. G998 (#489): a snapped street whose
 * file names more than its snaps show has the rest on its walls by that rule too (BARNACLE_LEFTOVER_SPOTS,
 * after the measured ones), so no barnacle is planned on a floor any more.
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

/** G998: each street's measured rows with its leftover rows after them ({ [tsid]: rows }, a new object). */
function withLeftovers(measured, leftovers) {
  const out = { ...measured };
  for (const [tsid, rows] of Object.entries(leftovers)) if (out[tsid]) out[tsid] = [...out[tsid], ...rows];
  return out;
}

/** Measured spots per class: { [class]: { [G tsid]: [[x, y, variant number], ...] } } (street px). */
export const MEASURED_NODE_SPOTS = Object.freeze({
  // G916 (#446): a street no full-street snap covers takes the spots measured on its other pictures
  // and the rest on its walls by rule (tools/build-barnacle-wall-spots.mjs, js/barnacle-walls.js).
  // G936: a rule row's fifth field 1 draws the barnacle mirrored (it faces outward on a round wall's right part).
  // G998: a snapped street's leftovers follow its measured spots, which keep mortar_barnacle:0..n-1.
  mortar_barnacle: Object.freeze({ variantPrefix: 'blister', mirrorField: 4, streets: Object.freeze({ ...BARNACLE_WALL_SPOTS, ...withLeftovers(nudgedBarnacleSpots(BARNACLE_SPOTS), BARNACLE_LEFTOVER_SPOTS) }) }),
  // G933 (#453): a Jellisac the snaps never measured sits in its street's empty hole first
  // (tools/build-jellisac-hole-spots.mjs); only those left over are planned on a floor.
  jellisac: Object.freeze({ variantPrefix: 'jellySack', streets: Object.freeze({ ...JELLISAC_SPOTS, ...JELLISAC_HOLE_SPOTS }) }),
  // #633 (G1182): a street no snap covers takes the spots its 2011-2012 pictures show
  // (tools/snap-placements/node-pictures.mjs): Luiro Run's and Naatamo Way's four bogs.
  peat_1: Object.freeze({ variantPrefix: 'peat', streets: Object.freeze({ ...PEAT_PICTURE_SPOTS, ...PEAT_SPOTS }) }),
  // #633 (G1182): Dirt Piles were set by hand too (dirt_pile.js obey_physics false); no snap shows
  // one, so only a street picture places one (Bonelington Hole's, in the cave): the rest are planned.
  dirt_pile: Object.freeze({ variantPrefix: 'dirt', streets: DIRT_PILE_PICTURE_SPOTS }),
  // G1323 (#725): Ice Nubbins were set by hand on the icy walls (ice_knob.js obey_physics false); every
  // one the files name has a wall spot, measured on a picture or by js/ice-nubbin-walls.js's rule
  // (tools/build-ice-nubbin-spots.mjs), so none is planned on the path.
  ice_knob: Object.freeze({ variantPrefix: 'knob', streets: ICE_NUBBIN_SPOTS }),
  // A Paper Tree's art follows its paper and care, never a variant: its spots carry none (null).
  paper_tree: Object.freeze({ variantPrefix: '', streets: PAPER_TREE_SPOTS }),
  // A rock's variant is the class of the shape the snap shows (rock_metal_2: items/rock_metal_2.js, proxy_item rock_metal_1).
  rock_metal_1: Object.freeze({ variantPrefix: 'rock_metal_', streets: ROCK_METAL_SPOTS }),
  rock_beryl_1: Object.freeze({ variantPrefix: 'rock_beryl_', streets: ROCK_BERYL_SPOTS }),
  rock_dullite_1: Object.freeze({ variantPrefix: 'rock_dullite_', streets: ROCK_DULLITE_SPOTS }),
  rock_sparkly_1: Object.freeze({ variantPrefix: 'rock_sparkly_', streets: ROCK_SPARKLY_SPOTS }),
  // G891: each Sloth in its own street's tree (tools/build-sloth-spots.mjs), with its side, the floor
  // under it and its Knocker on the trunk: { x, y, variant: null, sloth: { dir, floor, knocker } }.
  npc_sloth: Object.freeze({ variantPrefix: '', streets: SLOTH_SPOTS, extra: (row) => {
    const spot = slothSpotFromRow(row);
    return spot ? { sloth: { dir: spot.dir, floor: spot.floor, knocker: spot.knocker } } : {};
  } }),
});

/**
 * A street's measured node spots, { [class]: [{ x, y, variant }] } (street px, the art's frame cell
 * bottom centre: resource-nodes-feature draws these wall-mounted), or null when it has none.
 * G936: `mirror: true` on a spot whose row sets its class's mirrorField to 1 (drawn mirrored).
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
      .map((row) => {
        const [x, y, v] = row;
        // A class with more to a row than its variant (the Sloth) reads it with its own `extra`.
        if (source.extra) return { x, y, variant: null, ...source.extra(row) };
        const mirror = source.mirrorField != null && row[source.mirrorField] === 1;
        return { x, y, variant: Number.isFinite(v) ? `${source.variantPrefix}${v}` : null, ...(mirror ? { mirror: true } : {}) };
      });
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

/**
 * G852, #394: Hechey Track's five starter rocks are the remake's own (its archived row names none:
 * populationForStreet's onboarding set), and the planner put four of them on its pine branches. They
 * stand on fixed spots on the street's main floor instead, as Glitch set its rocks by hand (rock_*.js
 * obey_physics false): [x, y, shape] by index (street px, the floor line's y under x), each clear of
 * the signposts (148, 2026, 4300, 5828), the ladder (3125) and the trees, gardens, shrine and vendor
 * (tests/g852-starter-rocks.test.js). Rocks 1-4 keep the floor spots the planner gave them once
 * branches were off limits (each rock's saved ore stays at its index); rock 0, planned on a 250 px
 * ledge 470 px over the floor, goes down to the open floor between the last tree and the east
 * signpost. Shapes are rockShapeFor's on those spots.
 */
export const STARTER_ROCK_SPOTS = Object.freeze({
  GLI2V0UN7RD1T2J: Object.freeze([[5650, 859.9, 1], [4538.3, 916.8, 2], [3326.5, 875, 2], [346, 958.8, 3], [1501, 882.6, 3]]),
});

/** Each rock's measured spot ({ x, y, shape }) by its index in rockClasses, or null where it is planned. */
function measuredRockSlots(population) {
  const used = {};
  return (population?.rockClasses || []).map((classTsid, index) => {
    const starterSpot = population?.starterRockSpots?.[index];
    if (starterSpot) return { x: starterSpot[0], y: starterSpot[1], shape: starterSpot[2] || 1 };
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
  // G852: Hechey Track's starter rocks (STARTER_ROCK_SPOTS) sit in the gaps the trees, gardens, vendor
  // and shrine leave, so they are seated at the rocks' turn (`late`), leaving those as they were.
  const late = fixed.length && population?.starterRockSpots ? { late: true } : {};
  // R43 (#680): the planned rocks in order, [index, class] (rockSpawnPlan), so the street furniture
  // planned after them keeps off each one's art as drawn (rockShapeFor on its spot's room).
  const slots = measuredRockSlots(population);
  const art = (population?.rockClasses || []).map((classTsid, index) => (slots[index] ? null : [index, classTsid])).filter(Boolean);
  return { key: 'rocks', count: population?.rockClasses?.length || 0, clearance: 74, ...(fixed.length ? { fixed } : {}), ...late, ...(art.length ? { art } : {}) };
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
    // #633 (G1182): a street no snap covers takes the trants its 2011-2012 pictures show (node-picture-spots-data.js).
    const rows = TREE_SPOTS[alias] || TREE_PICTURE_SPOTS[alias];
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

/**
 * G940 (#469): a street's beds measured on its snaps (garden-beds.js), as a population field; on the
 * two crop-garden streets no snap shows, the beds Tiny Speck's street picture shows (G1085, #575).
 */
function gardenBedsField(tsid) {
  const beds = measuredGardenBeds(tsid) || pictureGardenBeds(tsid);
  return beds ? { gardenBeds: beds } : {};
}

/**
 * The gardens' planner request (G940, report #469): every Garden the street's location file names,
 * the beds its snaps show as `fixed` points where they show them (planStreetPlacements seats them
 * first, they lead the group, and nothing else stands on one: each its own width, garden-beds.js
 * gardenBedWidth, by PLACEMENT_HEIGHTS.gardens), the rest planned. garden.js streetGardenBeds lays
 * out the beds from the plan's points. game.js enterStreet, the realtime builders and the level
 * builder all ask with this.
 */
export function gardenPlacementRequest(population) {
  const count = population?.gardens || 0;
  const fixed = (population?.gardenBeds || []).slice(0, count)
    .map((b) => ({ x: b.x, y: b.y, w: gardenBedWidth(b), h: PLACEMENT_HEIGHTS.gardens }));
  return { key: 'gardens', count, clearance: 165, ...(fixed.length ? { fixed } : {}) };
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

export async function loadStreetEcologyCatalog(fetchImpl = globalThis.fetch && fetchRetry) {
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
 * #704: the floor a street's Butterflies and Batterflies fly over, in `street`'s screen y (world y
 * less bounds.t), from the location's ground_y (the catalog's groundY section, written by
 * build-street-ecology.mjs from the geometry XML), or null where it has none. Glitch flew them in
 * the band over it (npc_batterfly.js flyAround 1047-1051: floor = geo.b, or geo.ground_y when set;
 * npc_butterfly.js flyAround the same); js/street-creatures.js flightFloor takes it.
 */
export function flightGroundFor(street, source = catalog) {
  const t = Number(street?.bounds?.t);
  if (!Number.isFinite(t)) return null;
  for (const alias of streetEcologyAliases(street?.tsid)) {
    const g = source?.groundY?.[alias];
    if (Number.isFinite(g)) return g - t;
  }
  return null;
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

/**
 * The floor runs a plain jump does not get to on a street ({ [line id]: [[x1, x2]] }, screen x),
 * from the catalog's plainUnreachedFloors section (tools/ecology/build-unreached-floors.mjs: the same
 * reach graph from every arrival with a plain jump alone). unreachedFloorsFor counts a triple jump
 * (G529), an imagination upgrade a new player lacks, so a floor only a triple jump lands on is reached
 * there and not here: the planner keeps NEW_PLAYER_REACH_GROUPS off these. Null: none known.
 */
export function plainUnreachedFloorsFor(tsid, source = catalog) {
  for (const alias of streetEcologyAliases(tsid)) {
    const row = source?.plainUnreachedFloors?.[alias];
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
 * FavorProgressUI.as 129, 189-212). #475: `giantAt(tsid, row)` names the Giant a street's shrine is
 * now (game.js streetShrineGiant: a built street upgrade's own Giant), so the finder, the map and
 * the street read one fact; without it, each archived row's.
 */
export function shrineStreetsFor(giantId, source = catalog, giantAt = null) {
  const id = String(giantId || '');
  if (!id) return [];
  const of = typeof giantAt === 'function' ? giantAt : (_tsid, row) => row?.giantId;
  return Object.entries(source?.streets || {}).filter(([tsid, row]) => of(tsid, row) === id).map(([tsid]) => tsid);
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
    // invented scenery, no kept apple or Musicblock spots, and the archived
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
      // G940 (#469): every Garden the location file names (the cap of two lifted), the snapped ones measured.
      gardens: whole(counts.garden),
      ...gardenBedsField(tsid),
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
  // G940 (#469): every Garden the location file names (the cap of two lifted).
  let gardens = whole(counts.garden);
  let vendor = whole(counts.street_spirit) > 0;
  let shrine = !!entry?.giantId;
  let starterRockSpots = null;

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
      starterRockSpots = STARTER_ROCK_SPOTS[tsid] || null;
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
    ...(gardens && !starter ? gardenBedsField(tsid) : {}),
    vendor,
    shrine,
    // Feature-built rows (private instances such as party spaces) may pin
    // these; archived street rows never carry them.
    // G943: no Apple lies on a street any more (Glitch placed none: no street file holds an apple
    // stack); the planner keeps their four spots, empty, so no street's layout moves.
    apples: Number.isFinite(entry?.apples) ? whole(entry.apples, 0, 8) : 4,
    // G938: the street drop that drew a block here is gone (no source); the planner keeps the spot
    // so no street's layout moves.
    musicblocks: Number.isFinite(entry?.musicblocks) ? whole(entry.musicblocks, 0, 2) : 1,
    quoins: Number.isFinite(entry?.quoins) ? whole(entry.quoins, 0, 40) : 8,
    companions: entry?.companions !== false,
    resourceCounts: resourceCountsFrom(counts),
    featureCounts: featureCountsFrom(counts),
    resourceNodeClasses: expandResourceClasses(counts, spots),
    // The starter's onboarding trees are the remake's own: they are planned.
    ...spotFields(spots, starter && !entry ? null : measuredTreeSpots(tsid)),
    ...shrineSpotField(shrine && entry ? tsid : null),
    ...(starterRockSpots ? { starterRockSpots } : {}),
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
  // G939: a planned Jellisac stands on flat ground (0.1; Clam Calumny's sat on a 0.15 ledge lip).
  'resource:jellisac': Object.freeze({ maxSlope: 0.1, ledgeRun: 240, edgeDrop: 12 }),
  'resource:peat_1': Object.freeze({ maxSlope: 0.15, ledgeRun: 0, edgeDrop: 12 }),
  'resource:dirt_pile': Object.freeze({ maxSlope: 0.25, ledgeRun: 240, edgeDrop: 12 }),
  'resource:ice_knob': Object.freeze({ maxSlope: 0.4, ledgeRun: 240, edgeDrop: 12 }),
  'resource:dust_trap': Object.freeze({ maxSlope: 0.4, ledgeRun: 240, edgeDrop: 12 }),
  'resource:paper_tree': Object.freeze({ maxSlope: 0.3, ledgeRun: 240, edgeDrop: 12 }),
  furnitureStone: Object.freeze({ maxSlope: 0.3, ledgeRun: 240, edgeDrop: 12 }),
  furnitureMailbox: Object.freeze({ maxSlope: 0.3, ledgeRun: 0, edgeDrop: 12, keep: true }),
});

/**
 * G852: soil patches (patches-feature.js soilPlacementGroups, a request's own `footprint` and
 * `steady` rule) hung off ledge ends: 33 of the 188 planned stood with less than their art's width
 * of floor under them (the spawn audit, 2026-11-16), four on branch art. A patch's mound is 79 px
 * wide drawn (assets/sprites/soil patch-*.webp at 1:1), 113 dug, and its hit box 130
 * (patches-feature _worldHitW), so it asks for SOIL_FOOTPRINT px of floor, both ends over it
 * (edgeDrop) on a level floor (no slope over 0.25, as a Dirt Pile's mound), a ledge as good as a
 * floor. A street's plots are shared and saved by key (`patch:<i>`), so one is never left out
 * (`keep`): with no such spot left it takes any, as before.
 */
export const SOIL_FOOTPRINT = 120;
export const SOIL_STEADY_FLOOR = Object.freeze({ maxSlope: 0.25, ledgeRun: 0, edgeDrop: 12, keep: true });

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

/**
 * Hand-ruled floors a big thing may take though steeper than BIG_THING_MAX_SLOPE, by street and
 * group: { tsid: { key: [{ x, y, maxSlope }] } }, a planner spot within 1 px of x, y and no steeper
 * than maxSlope. Each is one named spot on one street, not a looser rule; the plan does not list it
 * under `steep`.
 *
 * G1061, Austin's ruling 2026-11-20: Mossystep's Street Spirit stood in a Bean Tree's crown, the
 * only spot clear of the trees being the long floor at 704, 811 on a 0.32 slope (every other one is
 * behind the front art, on its Visiting Stone or on the measured tree's own box). Allow that slope.
 */
export const SLOPE_RULINGS = Object.freeze({
  GCR15ST40FM1M1I: Object.freeze({ vendor: Object.freeze([Object.freeze({ x: 704, y: 811, maxSlope: 0.32 })]) }),
});

/** PURE: whether SLOPE_RULINGS lets `key` stand on `candidate` on street `tsid` despite its slope. */
export function slopeRuled(tsid, key, candidate) {
  const spots = SLOPE_RULINGS[tsid]?.[key];
  if (!spots || !candidate) return false;
  return spots.some((s) => Math.abs(candidate.x - s.x) <= 1 && Math.abs(candidate.y - s.y) <= 1
    && (candidate.slope || 0) <= s.maxSlope);
}

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
/**
 * #602 (Hechey Track): a planned garden bed is a flat box, so it stands where the floor under its
 * whole width (PLACEMENT_FOOTPRINTS.gardens, the four-plot bed) stays within `maxRise` px of its
 * spot, up or down. The planner put Hechey Track's herb bed (the remake's own: the street had none
 * in Glitch) on a 0.23 slope whose floor rises 58 px under its right end into the dirt mound
 * there, so the bed sank into the mound. An uneven spot is taken only when no level one is left.
 * Beds measured on snaps (fixed points) stand where the snaps show them.
 */
export const LEVEL_FLOOR_GROUPS = Object.freeze({ gardens: Object.freeze({ maxRise: 12 }) });

/**
 * PURE: the most the floor under a thing `half` px each side of a spot rises over it or falls under
 * it (screen px, sampled across its width; Infinity where a sample has no floor). The floor at each
 * sample is the highest item line (isItemSolid) no more than EDGE_STEP_UP_PX over the spot.
 */
export function floorUnevenUnder(platforms, spot, half, samples = 8) {
  let worst = 0;
  for (let k = 0; k <= samples; k += 1) {
    const x = spot.x - half + (2 * half * k) / samples;
    let best = null;
    for (const line of platforms || []) {
      if (!isItemSolid(line)) continue;
      const py = platformYAt(line, x, 0);
      if (py == null || py < spot.y - EDGE_STEP_UP_PX) continue;
      if (best == null || py < best) best = py;
    }
    worst = Math.max(worst, best == null ? Infinity : Math.abs(best - spot.y));
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
 * The planned things a player has to touch, kept where a new player gets to: a quoin is taken by
 * touching it, a rock mined from beside it. The planner counts a floor only a triple jump lands on as
 * reached (unreachedFloorsFor, G529), but a triple jump is an imagination upgrade, so one of these
 * planned there moves to the nearest floor a plain jump reaches (plainUnreachedFloorsFor,
 * planStreetPlacements). Glitch set its rocks and quoins by hand (rock_*.js, quoin.js obey_physics
 * false) where players reach them; the ones measured on the 2012 snaps stay where Glitch had them.
 */
export const NEW_PLAYER_REACH_GROUPS = Object.freeze(['rocks', 'quoins']);

/**
 * The last group a rock moved into reach looks ahead to (planStreetPlacements laterSpots): the spots
 * the groups after it up to the quoins would take had nothing moved, which it keeps off while it
 * can, so they are planned where they were. Every caller lays a street out with the same groups up to
 * the quoins (tools/build-realtime-quoins.mjs placementRequests), so the server's rocks and a page's agree.
 */
const REACH_LOOKAHEAD_END = 'quoins';

/** The tier a later group's spot crowding a thing moved into reach adds: above every other rule's, so it is taken only when nothing else is left. */
const REACH_MOVED_TIER = 1024;

/**
 * G852, #394: rocks on tree branches. A deck (DECK_RUN_PX) is any upper floor 240 px wide, and a
 * pine's branch is a floor line 242-290 px wide drawn by branch art, so Hechey Track and 15 other
 * streets had rocks, a shrine, a vendor, patches and animals up in the trees. Of the 720 rocks
 * players' 2012 snaps show, none stands on branch art (the spawn audit, 2026-11-16), nor any of the
 * 172 mailboxes: Glitch set them by hand (rock_*.js, npc_mailbox.js obey_physics false) on floors.
 * A floor spot counts as branch art when a middleground deco named like a branch (BRANCH_ART: the
 * platform_branch_* pieces (planks laid over branches too), tree_stack_* branches and leaves, pine
 * clusters, tree tops, bottle-tree panels: the audit's own list) and at most BRANCH_ART_MAX_H tall (a trunk or a
 * whole tree is taller) holds the spot on its top edge (its box, BRANCH_ART_SLACK px either way),
 * and another floor lies more than PERCH_DROP_PX under it (the spot's `under`): a branch lying on
 * the ground is ground. The BRANCH_FREE_GROUPS (every big thing and the walking animals; small
 * pick-ups such as quoins, apples and Musicblocks may sit in a tree) take such a spot only when no
 * other spot is left (the plan lists it under `branch`), so none is ever left out and each keeps its
 * index (a rock's saved ore, a tree's growth).
 */
export const BRANCH_ART = /(platform_branch|tree_stack_branch|tree_stack_leafy|pinecluster|treetop|bottletree_(?!body)|platform_bottletree|tree_deciduous|(^|_)branch)/i;
export const BRANCH_ART_MAX_H = 320;
export const BRANCH_ART_SLACK = Object.freeze({ above: 12, below: 4 });

/**
 * #760 (R2): a fir drawn whole, its branches in the one deco (tree_coniferous_*, heights_coniferous_*,
 * 387-2043 px tall), is taller than BRANCH_ART_MAX_H, so the ledges a street lays along its tiers
 * counted as floor: the Metal Rock on Shoga Links stood half way up tree_coniferous_fg_2 and the Beryl
 * Rock on Willo Let up heights_coniferous_1. Of the 720 rocks in players' 2012 snaps none stands in
 * such a tree's crown. Its crown (WHOLE_TREE_CROWN: the middle `half` of its width either side, from
 * `from` of its height up to its top) is branch art; the trunk's foot below that is not.
 */
export const WHOLE_TREE_ART = /(^|_)(tree_coniferous|heights_coniferous)/i;
export const WHOLE_TREE_CROWN = Object.freeze({ half: 0.4, from: 0.3 });
export const BRANCH_FREE_GROUPS = Object.freeze([
  'trees', 'rocks', 'vendor', 'shrine', 'gardens', 'raceDispenser', 'piggies', 'chickens', 'crabs',
  'furnitureStone', 'furnitureMailbox', 'furnitureBoard',
  'resource:peat_1', 'resource:dirt_pile', 'resource:paper_tree',
]);
/** The patches feature's soil groups (patches-feature.js SOIL_GROUP_PREFIX) are big things too. */
const BRANCH_FREE_PREFIXES = Object.freeze(['soil:']);

/** PURE: whether a planner group keeps off branch art while any other spot is left. */
export function branchFreeGroup(key) {
  const k = String(key || '');
  return BRANCH_FREE_GROUPS.includes(k) || BRANCH_FREE_PREFIXES.some((p) => k.startsWith(p));
}

/**
 * The street's middleground branch art (BRANCH_ART) as `{ key, branch: true, block }` in screen
 * space, for streetReservedSpots. Like the front decos they keep nothing clear; the planner only
 * reads them to know which floor spots are branches (onBranchArt). Middleground decos sit in world
 * px, bottom centre, as the floor lines do.
 */
export function branchArtCovers(street) {
  const out = [];
  if (!street?.bounds) return out;
  for (const layer of street.layers || []) {
    if (!(layer?.name === 'middleground' || Number(layer?.z) === 0)) continue;
    (layer.decos || []).forEach((d, i) => {
      const w = Number(d?.w) || 0;
      const h = Number(d?.h) || 0;
      if (!Number.isFinite(d?.x) || !Number.isFinite(d?.y) || d.hidden || !w || !h) return;
      const sprite = String(d.sprite || '');
      const p = worldToScreen(street, d.x, d.y);
      // #760: a whole tree's crown.
      if (WHOLE_TREE_ART.test(sprite)) {
        const half = w * WHOLE_TREE_CROWN.half;
        out.push({ x: p.x, y: p.y, key: `branch:${i}`, branch: true, block: { l: p.x - half, r: p.x + half, t: p.y - h, b: p.y - h * WHOLE_TREE_CROWN.from } });
        return;
      }
      if (h > BRANCH_ART_MAX_H || !BRANCH_ART.test(sprite)) return;
      out.push({ x: p.x, y: p.y, key: `branch:${i}`, branch: true, block: { l: p.x - w / 2, r: p.x + w / 2, t: p.y - h, b: p.y } });
    });
  }
  return out;
}

/**
 * #575 (G1085, R2): Veldt Balm's planner put a street garden bed inside the animal pen
 * (groddle_alakol_house_animal_pen, the fenced corral the Piggies live in), where no one plants. The
 * planner knew nothing of middleground art. A pen or fence deco is kept here as
 * `{ key, pen: true, block }` (screen space, streetReservedSpots); like branch art it keeps nothing
 * clear: the PEN_FREE_GROUPS only take a spot whose box reaches into one when no other spot is left.
 */
export const PEN_ART = /animal_pen|fence/i;
/** The groups kept out of pens and fences (PEN_ART): garden beds. */
export const PEN_FREE_GROUPS = Object.freeze(['gardens']);

/** The street's middleground pen and fence art (PEN_ART) as `{ key, pen: true, block }` in screen space. */
export function penArtCovers(street) {
  const out = [];
  if (!street?.bounds) return out;
  for (const layer of street.layers || []) {
    if (!(layer?.name === 'middleground' || Number(layer?.z) === 0)) continue;
    (layer.decos || []).forEach((d, i) => {
      const w = Number(d?.w) || 0;
      const h = Number(d?.h) || 0;
      if (!Number.isFinite(d?.x) || !Number.isFinite(d?.y) || d.hidden || !w || !h || !PEN_ART.test(String(d.sprite || ''))) return;
      const p = worldToScreen(street, d.x, d.y);
      out.push({ x: p.x, y: p.y, key: `pen:${i}`, pen: true, block: { l: p.x - w / 2, r: p.x + w / 2, t: p.y - h, b: p.y } });
    });
  }
  return out;
}

/** PURE: whether a thing `w` x `h` standing on `spot` reaches into a pen or fence (penArtCovers). */
export function inPenArt(spot, w, h, pens) {
  return (pens || []).some(({ block: b }) => b && spot.x + w / 2 > b.l && spot.x - w / 2 < b.r && spot.y > b.t && spot.y - h < b.b);
}

/** PURE: whether a planner spot (buildPlatformCandidates) is a branch over another floor (branchArtCovers). */
export function onBranchArt(candidate, branches) {
  if (!((candidate?.under || 0) > 0) || !branches?.length) return false;
  const { x, y } = candidate;
  return branches.some(({ block: b }) => b && x >= b.l && x <= b.r && y >= b.t - BRANCH_ART_SLACK.above && y <= b.b + BRANCH_ART_SLACK.below);
}

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
 * Stone's 101x155 art at its 81 px width, 124, the Race Ticket Dispenser's 58x94, #555). In Glitch
 * they were set down by hand and never planned into one another (the archived streets).
 *
 * G1061 (#555's class, root R2): planned Street Spirits and mailboxes stood in trees' crowns too
 * (Senna Karup's and Mossystep's vendor, six mailboxes such as Lotha Harte's on a ledge 115 px up a
 * tree: tools/canopy-placements.mjs; Mossystep's has no other spot, CANOPY_RANK_ONLY). Glitch set every one down by hand from the street XML; where
 * the archive has no position the vendor (decos/groddle/vendor.webp 422 x 508 at 0.25, 106 x 127),
 * a planned shrine (a cell 151 x 188 at spawnShrine's 0.78, 118 x 147) and a planned mailbox (its
 * opaque art, 72 x 135 of mailbox-left-idle.webp's 97 x 146 cell, wider than the 60 px stand it asks
 * floor for: UNDER_CANOPY_WIDTHS) keep out of the canopies the same way. A shrine pinned from its
 * street's picture and the mailboxes the snaps show are not planned and stay where they are.
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
  // #555 (Iable Var): the Race Ticket Dispenser stood on a ledge in a fruit tree's crown.
  raceDispenser: 94,
  // G1061: the Street Spirit, a planned shrine and a planned mailbox, by their art.
  vendor: PLACEMENT_HEIGHTS.vendor,
  shrine: PLACEMENT_HEIGHTS.shrine,
  furnitureMailbox: 135,
});
/**
 * The art's width for a canopy group whose art is not its PLACEMENT_FOOTPRINTS width: the box it
 * keeps out of a canopy with (else its footprint). The Race Ticket Dispenser, a small fixture with no
 * footprint (the planner asks it no floor room): races/race_ticket_dispenser.webp, 58 x 94 at 1:1,
 * drawn on its feet. A mailbox (G1061): its box overhangs the 60 px stand, 72 px of opaque art.
 */
export const UNDER_CANOPY_WIDTHS = Object.freeze({
  raceDispenser: 58,
  furnitureMailbox: 72,
});
/**
 * G1061: groups a crown only ranks. A planned vendor, shrine or mailbox in a crown is taken last, but
 * the crown does not lower the floor it asks for: with every roomy spot under a tree it stands in the
 * roomiest one (the plan lists it under `blocked`, fixture `canopy`), never on a stub beside it, and a
 * crown comes before covering a door, a signpost or a measured tree's own box. The resource nodes and
 * the Visiting Stone keep #256's rule (a crown counts as covered for their room too).
 */
export const CANOPY_RANK_ONLY = Object.freeze(['vendor', 'shrine', 'furnitureMailbox']);
/** A planned tree's canopy box (TREE_CANOPY over its spot), named `canopy` in a plan's `blocked`. */
function canopyOf(point) {
  const w = TREE_CANOPY.w / 2;
  return { ...point, key: 'canopy', block: { l: point.x - w, r: point.x + w, t: point.y - TREE_CANOPY.h, b: point.y } };
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
  // G853: the Visiting Stones the snaps show (street-furniture.js measuredStones), the same: the stone's
  // box as drawn (81 x 124, UNDER_CANOPY_HEIGHTS.furnitureStone) and the planned stone's clearance.
  (measuredStones(street?.tsid) || []).forEach((m, index) => {
    out.push({ x: m.x, y: m.y, key: `stone:${index}`, clearance: 90, block: box(m.x, m.y, 81, UNDER_CANOPY_HEIGHTS.furnitureStone) });
  });
  out.push(...measuredNodeCovers(street?.tsid));
  out.push(...frontDecoCovers(street));
  out.push(...branchArtCovers(street));
  out.push(...penArtCovers(street));
  return out;
}

/**
 * Report #319: the measured Peat Bogs, Jellisacs, Mortar Barnacles, Ice Nubbins (G1323), Paper Trees and Dirt Piles (measuredNodeSpots,
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
  // #633: resource-nodes.js dirt_pile sheets dirt1 and dirt2, 195 x 71.
  dirt_pile: Object.freeze({ clearance: 110, cells: Object.freeze({ dirt1: [195, 71], dirt2: [195, 71] }) }),
  // G1323: resource-nodes.js ice_knob sheets knob1-4: frame width x height.
  ice_knob: Object.freeze({ clearance: 46, cells: Object.freeze({ knob1: [45, 69], knob2: [54, 68], knob3: [46, 71], knob4: [72, 52] }) }),
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
/**
 * G837 (#388): the lower bar for the things a player has to find and click, a shrine or a vendor
 * (FRONT_BOXES): a spot with this much of it behind the front art is taken last. Mesob Medium's
 * shrine stood half behind a front fir, under the mostly-hidden bar trees and rocks keep.
 */
export const FRONT_FIND_SHARE = 0.3;
/** Front decos that are see-through (shadows, light and haze overlays): they hide nothing. */
export const FRONT_SEE_THROUGH = /shadow|overlay|trans|glow|light|haze|fog|mist|ray|beam|gradient/i;

/**
 * Ticket 89: the decos drawn in front of the avatar and the street's items (a layer with z > 0:
 * middleplus, foreground; game.js syncStreetFront draws them over the middleground), as keep-clear spots
 * `{ key, front: true, block }` in screen space. They never take a clearance or keep anything
 * away; planStreetPlacements only takes a spot whose tree, rock or Piggy (REACH_BOXES) they would
 * mostly hide last, as it does a spot behind a floor. The original set those by hand where they
 * showed (Flipside's Spice Plant sat inside the Swiss-cheese pipe's front half). A layer as wide and
 * as tall as the street stays on it; any other front layer slides against the street as the camera
 * moves (street-render.js parallaxLayerOffset), so its decos come with `drift` and the cover checks
 * put them where they are with the camera on the thing (frontDrift). G837, #388: Mesob Medium's
 * foreground (6200 on a 6000 px street) stood a fir over the shrine; a third of all front layers
 * are a little wider or taller than their street and were left out.
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
    if (!(Number(layer?.z) > 0) || !width || !(Number(layer.w) > 0)) continue;
    // A layer wider or narrower, taller or shorter than the street slides against it
    // (parallaxLayerOffset): Sylvan Grove's middleplus is 850 tall on a 1000 px street.
    const lw = Number(layer.w);
    const lh = Number(layer.h) > 0 ? Number(layer.h) : height;
    const drift = lw !== width || (height > 0 && lh !== height) ? { sw: width, sh: height, lw, lh } : null;
    (layer.decos || []).forEach((d, i) => {
      const w = Number(d?.w) || 0;
      const h = Number(d?.h) || 0;
      if (!Number.isFinite(d?.x) || !Number.isFinite(d?.y) || d.hidden) return;
      if (FRONT_SEE_THROUGH.test(String(d.sprite || ''))) return;
      const r = Number(d.r) || 0;
      const key = `front:${layer.name || layer.id}:${i}`;
      const slide = drift ? { drift } : null;
      // #731: the art as drawn (frontArtShare reads its opaque pixels, STONE_FRONT_MASKS).
      const art = { sprite: String(d.sprite || ''), w, h, r, flip: Boolean(d.flip) };
      if (w >= FRONT_DECO_MIN.w && h >= FRONT_DECO_MIN.h && !r) {
        out.push({ x: d.x, y: d.y, key, front: true, block: { l: d.x - w / 2, r: d.x + w / 2, t: d.y - h, b: d.y }, art, ...slide });
        return;
      }
      if (w < FRONT_FILL_MIN.w || h < FRONT_FILL_MIN.h) return;
      out.push({ x: d.x, y: d.y, key, front: true, fill: true, r, w, h, block: turnedBox(d.x, d.y, w, h, r), art, ...slide });
    });
  }
  return out;
}

/**
 * The location view a sliding front layer is placed for (world px) and where the avatar stands in
 * it (movement.js yCamOffsetAnchor at the default y_cam_offset 150). A thing near mid-street finds
 * the layer in the same place in any view; nearer the ends a wider or narrower view moves the layer
 * by a share of its spare width or height only.
 */
const FRONT_DRIFT_VIEW = Object.freeze({ w: 1280, h: 720, anchor: 0.75 });

/**
 * PURE: how far a sliding front layer (frontDecoCovers `drift`) sits from the street, as
 * street-render.js parallaxLayerOffset (and parallaxRestX/Y) places it, with the camera on a player
 * standing at `spot` (movement.js cameraTargetX, cameraTargetY). { x: 0, y: 0 } for a layer that
 * stays on the street.
 */
export function frontDrift(drift, spot, view = FRONT_DRIFT_VIEW) {
  if (!drift) return { x: 0, y: 0 };
  const axis = (cam, street, layer, vp, rest) => {
    const max = street - vp;
    if (!(max > 0)) return rest;
    const at = Math.min(max, Math.max(0, cam));
    return at + (at / max) * (vp - layer);
  };
  return {
    x: axis(spot.x - view.w / 2, drift.sw, drift.lw, view.w, (drift.sw - drift.lw) / 2),
    y: axis(spot.y - view.h * view.anchor, drift.sh, drift.lh, view.h, drift.sh - drift.lh),
  };
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
  // A sliding layer's decos (frontDrift) are tested against the box moved into the layer's place.
  const near = [];
  for (const f of fronts) {
    const d = frontDrift(f.drift, spot);
    const b = f.block;
    if (b.r + d.x > l && b.l + d.x < l + w && b.b + d.y > t && b.t + d.y < spot.y) near.push([f, d]);
  }
  if (!near.length) return 0;
  const [cols, rows] = FRONT_SAMPLES;
  let hit = 0;
  for (let i = 0; i < cols; i += 1) {
    const px = l + ((i + 0.5) * w) / cols;
    for (let j = 0; j < rows; j += 1) {
      const py = t + ((j + 0.5) * h) / rows;
      if (near.some(([f, d]) => insideFront(f, px - d.x, py - d.y))) hit += 1;
    }
  }
  return hit / (cols * rows);
}

/** #731: the sample grid for frontArtShare (columns x rows; about 9 px a cell on a Visiting Stone). */
const ART_SAMPLES = Object.freeze([9, 14]);
/** #574, #731: the most of a Visiting Stone's box the front art may cover where it stands in its dead end. */
export const STONE_SEEN_SHARE = 0.3;

/**
 * PURE (#731): the share (0..1) of a w x h box standing on `spot` that the front decos' drawn art
 * covers, by its opaque pixels (alpha over half, STONE_FRONT_MASKS, measured by
 * tools/build-stone-front-masks.mjs) as street-render.js draws the deco (anchor bottom centre, sized
 * w x h, mirrored, turned), not by its box: bare branches leave a stone seen, a trunk hides it. A
 * deco with no mask measured counts by its box (frontCoverShare's rule), one with no art not at all.
 */
export function frontArtShare(spot, w, h, fronts, masks = STONE_FRONT_MASKS) {
  if (!fronts?.length) return 0;
  const l = spot.x - w / 2;
  const t = spot.y - h;
  const near = [];
  for (const f of fronts) {
    const d = frontDrift(f.drift, spot);
    const b = f.block;
    if (!(b.r + d.x > l && b.l + d.x < l + w && b.b + d.y > t && b.t + d.y < spot.y)) continue;
    const mask = f.art && Object.prototype.hasOwnProperty.call(masks, f.art.sprite) ? masks[f.art.sprite] : undefined;
    if (mask !== null) near.push([f, d, mask]);
  }
  if (!near.length) return 0;
  const [cols, rows] = ART_SAMPLES;
  let hit = 0;
  for (let i = 0; i < cols; i += 1) {
    const px = l + ((i + 0.5) * w) / cols;
    for (let j = 0; j < rows; j += 1) {
      const py = t + ((j + 0.5) * h) / rows;
      if (near.some(([f, d, mask]) => (f.art && mask ? decoCovers(f.art, f.x, f.y, mask, px - d.x, py - d.y) : insideFront(f, px - d.x, py - d.y)))) hit += 1;
    }
  }
  return hit / (cols * rows);
}

/**
 * The boxes the front check uses for things players walk up to that are not REACH_BOXES (the
 * reach check is about floors): a shrine (one 151 x 188 cell at spawnShrine's 0.78) and the
 * vendor (PLACEMENT_HEIGHTS). Megna Burrow (GA912TJ0KF328Q3) planned its shrine on the slope
 * that runs up through the cave's rock, behind the middleplus fill, so it and a player at it
 * could not be seen. G939: a planned Jellisac too (its widest cell, jellySack4): Quinmchary's stood
 * behind the foreground curtain and one on Clam Calumny inside the foreground's root pipe.
 */
export const FRONT_BOXES = Object.freeze({
  shrine: [118, 147],
  vendor: [105, 127],
  'resource:jellisac': [47, 52],
  // #490 (R2): every node the planner seats has its art's box, and one planned behind front art moves
  // (planStreetPlacements reseatHiddenNodes, NODE_FRONT_KEYS):
  // a Peat Bog stood behind a front hut on Raudan Rasp (GIFNIC9JFOU1B2S, bottletree_burb_wndw_2).
  // The boxes are the art as drawn (PLACEMENT_FOOTPRINTS and UNDER_CANOPY_HEIGHTS above): the barnacle's
  // blister 39 x 47, the Ice Nubbin's widest knob 67 x 71, the Peat Bog's mound 180 x 104, the Dirt
  // Pile's 179 x 120, the Dust Trap's idle trap 39 x 103, a Paper Tree with its canopy 230 x 230 and
  // a Salmon's swim frame (its 64 x 44 hit box). Spots measured on the snaps are never planned.
  'resource:mortar_barnacle': [39, 47],
  'resource:ice_knob': [67, 71],
  'resource:peat_1': [180, 104],
  'resource:dirt_pile': [179, 120],
  'resource:dust_trap': [39, 103],
  'resource:paper_tree': [230, 230],
  'resource:npc_salmon': [64, 44],
  // #574 (G1084, R2): planned street furniture too (street-furniture.js FURNITURE_GROUPS): Puckell Peck's
  // Visiting Stone stood behind a front conifer's trunk. The stone and the mailbox by the boxes the
  // canopy check keeps them out with (81 x 124, 72 x 135), the Notice Board by its opaque art (211 x 145
  // of notice-board-m0.webp). The stones and mailboxes the snaps show, and a board hung where a
  // picture shows it, are fixed and never move.
  furnitureStone: [81, UNDER_CANOPY_HEIGHTS.furnitureStone],
  furnitureMailbox: [UNDER_CANOPY_WIDTHS.furnitureMailbox, UNDER_CANOPY_HEIGHTS.furnitureMailbox],
  furnitureBoard: [211, 145],
  // #760 review: Cranbury Coppice's Race Ticket Dispenser, moved out of a fir's crown, stood wholly
  // behind the front fir's trunk (middleplus tree_coniferous_fg_2), the player vanishing there too.
  // Its art as drawn (UNDER_CANOPY_WIDTHS / _HEIGHTS: 58 x 94); found and clicked, so FRONT_FIND_SHARE.
  raceDispenser: [UNDER_CANOPY_WIDTHS.raceDispenser, UNDER_CANOPY_HEIGHTS.raceDispenser],
});
/**
 * G1236: the planned things players click that nothing planned after them may stand on (the planner
 * keeps them clear as it keeps a signpost or a door): Glitch set each by hand, clear of the rocks and
 * trees round it (the archived streets). Hechey Track's shrine opened a Metal Rock's menu.
 */
/** G1236: whether a fixture is one players click (a signpost, a door, a measured mailbox or stone, a planned CLICK_FIXTURE_GROUPS thing). */
function isClickFixture(fixture) {
  return fixture?.click === true || /^(signpost|door|mailbox|stone):/.test(fixture?.key || '');
}
/**
 * R43 (#680): a planned rock's or node's art box [w, h] for the street furniture planned after it
 * (null: none kept). The `planned`-th planned rock by the shape rockSpawnPlan draws it in (the rocks
 * request's `art`, rockShapeFor on its spot's room), a node by FRONT_BOXES; a Salmon swims and a
 * Firefly flies past anything.
 */
function nodeArtBox(request, point, planned, tsid) {
  const key = String(request?.key || '');
  if (key === 'rocks') {
    const [index, classTsid] = request.art?.[planned] || [];
    const widths = ROCK_SHAPE_WIDTHS[classTsid];
    if (!widths) return [PLACEMENT_FOOTPRINTS.rocks, PLACEMENT_HEIGHTS.rocks];
    const shape = rockShapeFor(tsid, index, classTsid, Number.isFinite(point.room) ? point.room : Infinity);
    return [widths[shape - 1], ROCK_SHAPE_HEIGHTS[classTsid][shape - 1]];
  }
  if (!key.startsWith('resource:') || /npc_salmon|npc_firefly/.test(key)) return null;
  return FRONT_BOXES[key] || null;
}
/** G1236: art boxes for the fixture check of groups FRONT_BOXES leaves out: a dropped Note (NOTE_ART 45 x 14). */
export const FIXTURE_ART_BOXES = Object.freeze({ furnitureNote: [45, 14] });
export const CLICK_FIXTURE_GROUPS = Object.freeze(['shrine', 'vendor', 'furnitureStone', 'furnitureMailbox', 'furnitureBoard']);
/** The FRONT_BOXES things a player has to find and click (FRONT_FIND_SHARE); the other nodes keep FRONT_HIDE_SHARE. */
export const FRONT_FIND_KEYS = Object.freeze(['shrine', 'vendor', 'resource:jellisac', 'raceDispenser']);
/** #490, #574: the nodes and furniture moved once their group is planned when the front art covers them (planStreetPlacements reseatHiddenNodes). */
export const NODE_FRONT_KEYS = Object.freeze(Object.keys(FRONT_BOXES).filter((k) => !FRONT_FIND_KEYS.includes(k)));
/**
 * #574: the planned street furniture among them (street-furniture.js FURNITURE_GROUPS). A player goes
 * looking for a mailbox or a board, so when its own stretch has no clear spot it moves past its zone
 * or to a crowded spot rather than stay behind the art. #731: a Visiting Stone moves within its dead
 * end only, as in Glitch: where the art's boxes cover it all, to the spot its drawn art leaves seen
 * (frontArtShare; Puckell Peck's conifer trunk, East Spice's gear trees).
 */
export const FURNITURE_FRONT_KEYS = Object.freeze(['furnitureStone', 'furnitureMailbox', 'furnitureBoard']);

/**
 * PURE: whether a thing of `key` at `spot` is behind the front decos (frontDecoCovers): one big
 * deco over `bar` of its box, or (for things that stand still) the decos together over that share.
 * The bar is FRONT_HIDE_SHARE (mostly hidden) for trees, rocks, Piggies and nodes (#490), FRONT_FIND_SHARE for a
 * shrine or vendor. A walking animal (ANIMAL_PATROL) keeps the one-deco rule on the street's own
 * layers: it walks out from behind a fill or a sliding layer's deco, and the planner would otherwise
 * put it inside a rock or a tree rather than behind one (GIFBSQJTGME2KRH, tests/piggies-walk-on.test.js).
 */
export function hiddenBehindFront(spot, key, fronts, bar = FRONT_FIND_KEYS.includes(key) ? FRONT_FIND_SHARE : FRONT_HIDE_SHARE) {
  const size = REACH_BOXES[key] || FRONT_BOXES[key];
  if (!size || !fronts?.length) return false;
  const [w, h] = size;
  const l = spot.x - w / 2;
  const r = spot.x + w / 2;
  const t = spot.y - h;
  for (const f of fronts) {
    if (f.fill || (f.drift && ANIMAL_PATROL[key])) continue;
    const b = f.block;
    const d = frontDrift(f.drift, spot);
    const ox = Math.min(r, b.r + d.x) - Math.max(l, b.l + d.x);
    const oy = Math.min(spot.y, b.b + d.y) - Math.max(t, b.t + d.y);
    if (ox > 0 && oy > 0 && ox * oy >= bar * w * h) return true;
  }
  if (ANIMAL_PATROL[key]) return false;
  return frontCoverShare(spot, w, h, fronts) >= bar;
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
  // A sliding layer (frontDecoCovers `drift`) never carries a floor: the floor stays as its decos move.
  return fronts.filter(({ block: b, fill, drift }) => !fill && !drift && lines.some((line) => {
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
    // A front deco (frontDecoCovers) covers things; nothing covers it. Branch art (G852) only marks floors, pen art (#575) only ranks garden beds.
    if (!b || fixture.front || fixture.branch || fixture.pen) continue;
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
export function buildPlatformCandidates(platforms, { worldW = 2500, seed = '', unreached = null, plainUnreached = null } = {}) {
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
        // On a run a plain jump does not get to (plainUnreachedFloorsFor): NEW_PLAYER_REACH_GROUPS move off it.
        ...(plainUnreached && inUnreachedRun(plainUnreached, platform, x) ? { plainOut: true } : {}),
      });
    }
  }
  candidates.sort((a, b) => {
    return stableEcologyHash(`${seed}:${a.id}`) - stableEcologyHash(`${seed}:${b.id}`);
  });
  return candidates;
}

/**
 * G852 measured the vertical weight (the spawn census, 2026-11-16): it is not what put big things up
 * trees. With 1.0 instead of 1.75 planned rocks on an upper floor fell only from 63% to 60% (Glitch's
 * snaps 48%: the deck rule and every-height pool set that), things on short high ledges rose from 5 to
 * 10, and every street's layout moved; branch art (onBranchArt) is the rule that keeps them down.
 */
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
 * A NEW_PLAYER_REACH_GROUPS thing (a rock, a quoin) planned on a run a plain jump does not get to
 * (`plainUnreached`, by default plainUnreachedFloorsFor(`tsid`): a floor only a triple jump lands on)
 * moves at its group's turn to the nearest spot a plain jump reaches (listed under `intoReach`,
 * { key, index, from }; `plainUnreached: null` plans without it); the groups after it are planned as
 * they were but where they would crowd it (planStreetPlacements reachMoved, laterSpots).
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
  { worldW = 2500, seed = '', reserved = [], tsid = seed, unreached = unreachedFloorsFor(tsid), plainUnreached = plainUnreachedFloorsFor(tsid), reseat = true } = {}
) {
  const candidates = buildPlatformCandidates(platforms, { worldW, seed, unreached, plainUnreached });
  // Front decos (frontDecoCovers) keep nothing clear; they only rank the spots they hide.
  const fronts = (reserved || []).filter((p) => p?.front && p.block);
  const walkways = frontDecoWalkways(platforms, fronts);
  // Branch art (branchArtCovers, G852) keeps nothing clear either: it marks the spots big things take last.
  const branches = (reserved || []).filter((p) => p?.branch && p.block);
  const onBranch = new Set(branches.length ? candidates.filter((c) => onBranchArt(c, branches)).map((c) => c.id) : []);
  // Pen and fence art (penArtCovers, #575) keeps nothing clear either: PEN_FREE_GROUPS take a spot in one last.
  const pens = (reserved || []).filter((p) => p?.pen && p.block);
  const occupied = (reserved || []).filter((p) => !p?.front && !p?.branch && !p?.pen && Number.isFinite(p?.x) && Number.isFinite(p?.y))
    .map((point, index) => ({ ...point, key: point.key || `reserved:${index}`, clearance: whole(point.clearance, 120, 600) }));
  // A request's `fixed` points (measured rocks, rockPlacementRequest) are seated before anything is
  // planned: every other group keeps clear of them, and big scenery never covers one (`w` x `h`).
  const fixedOf = new Map();
  const latePlaced = [];
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
    // A `late` request's fixed points (Hechey Track's starter rocks, STARTER_ROCK_SPOTS) are seated at
    // their group's turn: they were chosen in the gaps the earlier groups leave.
    if (request.late !== true) occupied.push(...placed);
    else latePlaced.push(...placed);
  }
  // G1236: a `late` request's fixed points keep every earlier group off them too (big things and
  // click fixtures never cover one), though they only crowd the planner's spacing at their own turn:
  // Hechey Track's planned shrine stood on a starter rock once a fresh game's arrival moved it.
  const fixtures = [...occupied, ...latePlaced].filter((point) => point.block);
  // Planned trees' canopies (report #256): only the UNDER_CANOPY_HEIGHTS groups keep out of them.
  const canopies = [];
  const used = new Set();
  const groups = {};
  const fallbacks = [];
  const perches = [];
  const blocked = [];
  const steep = [];
  const branch = [];
  const hiddenCache = new Map();
  const edgeCache = new Map();
  const fits = new Map();
  const moved = [];
  // NEW_PLAYER_REACH_GROUPS things moved into a new player's reach, where they now stand (their old spots are ghosts in `occupied`).
  const reachMoved = [];
  const intoReach = [];
  // A moved quoin hangs over its floor: later groups may stand under it, so only the others are kept clear.
  const crowdsReachMoved = (candidate, clearance) => reachMoved.some((m) => m.key !== 'quoins' && scaledDistance(candidate, m) < Math.max(1, clearance + m.clearance));
  // The spots the groups after a request (by its index) up to REACH_LOOKAHEAD_END take when nothing moves into reach.
  let lookahead = null;
  const laterSpots = (requestIndex) => {
    if (!lookahead) {
      const end = (requests || []).findIndex((r) => r?.key === REACH_LOOKAHEAD_END);
      const base = end > requestIndex
        ? planStreetPlacements(platforms, requests.slice(0, end + 1), { worldW, seed, reserved, tsid, unreached, plainUnreached: null, reseat })
        : null;
      lookahead = { base, end };
    }
    const { base, end } = lookahead;
    if (!base) return [];
    return requests.slice(requestIndex + 1, end + 1).flatMap((r) => (base.groups[r?.key] || []).filter((p) => !p.fixed).map((p) => ({ ...p, clearance: whole(r?.clearance, 40, 600) })));
  };
  // R43 (#680): the planned rocks' and nodes' art boxes, where they stand once seated (NODE_ART_BOX).
  const nodeArt = [];

  for (const [requestIndex, request] of (requests || []).entries()) {
    const count = whole(request?.count, 0, 40);
    const clearance = whole(request?.clearance, 40, 600);
    // Fixed points with an `index` (measured trees, treePlacementRequest) stand at that index in the
    // group, the planned ones fill the others in order; without one (rocks) they lead the group.
    const fixedPts = fixedOf.get(request.key) || [];
    const fixedAt = fixedPts.length && fixedPts.every((p) => Number.isInteger(p.index))
      ? new Map(fixedPts.filter((p) => p.index < count).map((p) => [p.index, p]))
      : null;
    groups[request.key] = fixedAt ? [] : fixedPts.slice(0, count);
    if (request.late === true && fixedPts.length) occupied.push(...fixedPts);
    if (request.key === 'trees') for (const point of groups.trees) canopies.push(canopyOf(point));
    const maxSlope = BIG_THING_GROUPS.includes(request.key) ? BIG_THING_MAX_SLOPE : null;
    const deck = DECK_GROUPS.includes(request.key);
    const branchFree = request.avatar !== true && branchFreeGroup(request.key);
    const penFree = pens.length > 0 && PEN_FREE_GROUPS.includes(request.key);
    // G853: a request's `zone` ({ lo, hi } screen x: a planned Visiting Stone's dead end) is where it
    // stands while any spot there is left; outside it, the nearer the better.
    const zone = Number.isFinite(request?.zone?.lo) && Number.isFinite(request?.zone?.hi) ? request.zone : null;
    const zoneMiss = (candidate) => (zone ? Math.max(0, zone.lo - candidate.x, candidate.x - zone.hi) : 0);
    const measuredQuoin = request.key === 'quoins' ? nearMeasuredQuoin(tsid) : null;
    const avatar = request.key === 'player' || request.avatar === true;
    const footprint = avatar ? 0 : Number.isFinite(request?.footprint)
      ? Math.max(0, request.footprint)
      : PLACEMENT_FOOTPRINTS[request.key] || 0;
    const perching = request?.perch === true || PERCHING_GROUPS.includes(request.key);
    const steady = request?.steady || STEADY_FLOOR_GROUPS[request.key] || null;
    const level = LEVEL_FLOOR_GROUPS[request.key] || null;
    const levelCache = new Map();
    // LEVEL_FLOOR_GROUPS: a spot whose floor rises or falls under the thing's width, only when no level one is left.
    const uneven = (candidate) => {
      if (!level || !(footprint > 0)) return false;
      if (!levelCache.has(candidate.id)) levelCache.set(candidate.id, floorUnevenUnder(platforms, candidate, footprint / 2) > level.maxRise);
      return levelCache.get(candidate.id);
    };
    // Reports #249, #250: a steady group with an edgeDrop also keeps both ends of its footprint over a floor.
    const steadyRule = (candidate) => {
      if (!steadyFloor(candidate, steady)) return false;
      if (!Number.isFinite(steady?.edgeDrop)) return true;
      const k = `${candidate.id}:${footprint}:${candidate.y}`;
      if (!edgeCache.has(k)) edgeCache.set(k, footOverAir(platforms, candidate, footprint / 2));
      return edgeCache.get(k) <= steady.edgeDrop;
    };
    let steadyAt = steadyRule;
    // #581: a SEATED_GROUP judges each spot where it would stand, seated on its floor (seatOnFloor),
    // so the front art, fixtures and canopies are measured from there.
    const seat = seatRule(request);
    // A rock's spot it cannot be seated on (an end of its foot over a ledge end or a step, more than
    // ROCK_SEAT_MAX_PX down) is `overAir`: taken only when no other is left (before one behind the front art).
    // One the front art would hide once seated, and not as planned, keeps its height (`afloat`): a
    // thing a player can find, a few px up, before one sunk out of sight.
    const pool = seat
      ? candidates.map((c) => {
          const drop = seatDrop(platforms, c, request.key, seat);
          let spot = drop > 0 ? { ...c, y: c.y + drop } : c;
          if (drop > 0 && fronts.length && hiddenBehindFront(spot, request.key, fronts) && !hiddenBehindFront(c, request.key, fronts)) spot = { ...c, afloat: true };
          if (request.key === 'rocks' && footOverAir(platforms, spot, seat.footprint / 2) > ROCK_SEAT_MAX_PX) return { ...spot, overAir: true };
          return spot;
        })
      : candidates;
    const walker = Boolean(ANIMAL_PATROL[request.key]);
    const height = Number.isFinite(request?.height) ? Math.max(0, request.height) : PLACEMENT_HEIGHTS[request.key] || 0;
    // G1236: a thing with no scenery height keeps off the fixtures players click by its art's box
    // (FRONT_BOXES), so a planned node or a stone never stands on a signpost, a door, a shrine or the vendor.
    // A Salmon swims past them (its spot is only where it starts), as a flyer flies.
    const art = !(height > 0) && !perching && request.key !== 'resource:npc_salmon' && (FRONT_BOXES[request.key] || FIXTURE_ART_BOXES[request.key]);
    const fixtureBox = art ? { footprint: art[0], height: art[1] } : null;
    // R43 (#680): a piece of street furniture keeps off every rock and node before it too (the measured
    // nodes' boxes, measuredNodeCovers, and the planned ones' art, nodeArt): Konka Brink's planned
    // Visiting Stone stood on a measured Mortar Barnacle.
    const furniture = FURNITURE_FRONT_KEYS.includes(request.key);
    const clickFixtures = art ? [...fixtures.filter((f) => isClickFixture(f) || (furniture && /^node:/.test(f.key || ''))), ...(furniture ? nodeArt : [])] : [];
    // The fixture each spot would cover for this request (null: clear); the arrival covers nothing.
    const covers = new Map();
    // G1061: the spots a CANOPY_RANK_ONLY group would take in a crown and nothing else: still roomy floor.
    const crownOnly = new Set();
    const rankOnly = CANOPY_RANK_ONLY.includes(request.key);
    // #555, G1061: a thing keeps out by its art's width (UNDER_CANOPY_WIDTHS), else its footprint.
    const canopyW = UNDER_CANOPY_WIDTHS[request.key] || footprint;
    const underCanopy = canopyW > 0 && canopies.length ? UNDER_CANOPY_HEIGHTS[request.key] || 0 : 0;
    if (!avatar && (fixtures.length || underCanopy)) {
      for (const candidate of pool) {
        let fixture = blockingFixture(candidate, fixtures, { footprint, height });
        if (!fixture && art) fixture = blockingFixture(candidate, clickFixtures, fixtureBox);
        if (!fixture && underCanopy) {
          fixture = blockingFixture(candidate, canopies, { footprint: canopyW, height: underCanopy });
          if (fixture && rankOnly) crownOnly.add(candidate.id);
        }
        if (fixture) covers.set(candidate.id, fixture);
      }
    }
    // #490: what a covered node may move to after the plan (reseatHiddenNodes): a free spot this group takes.
    if (NODE_FRONT_KEYS.includes(request.key)) {
      const loose = FURNITURE_FRONT_KEYS.includes(request.key);
      const fit = (c) => !used.has(c.id) && c.item !== false && steadyAt(c) && (c.room || 0) >= footprint
        && !covers.has(c.id) && !(branchFree && onBranch.has(c.id)) && !(maxSlope != null && (c.slope || 0) > maxSlope)
        && (loose || !zoneMiss(c)) && !footAtWalkway(c, footprint, walkways);
      // Furniture (FURNITURE_FRONT_KEYS) may leave its zone, last: `miss` ranks the spots out of it.
      // R43 (#680): outside it, the nearer the better (as the planner ranks a zone, by 400 px bands):
      // Konka Brink's stone, kept off the measured barnacles in its dead end, went to the far end of the street.
      // #731 (G1330): a Visiting Stone stays in its dead end, as in Glitch (East Spice's stood at the far
      // end, behind the thin branches of its gear trees): off the art it moves within it only, and when
      // the art's boxes cover every spot there, to the one its drawn art leaves seen (frontArtShare).
      // A street with no dead end the planner finds (stoneDeadEndZone null) keeps the rule above.
      const inZone = request.key === 'furnitureStone' && zone ? (c) => !zoneMiss(c) : null;
      fits.set(request.key, { fit, loose, inZone, miss: (c) => Math.ceil(zoneMiss(c) / 400), pool });
    }
    // The tier a spot ranks in for this group (lower first), `nearest` its crowding (the planner's score
    // term: its distance to the nearest taken spot over both clearances). The loop below and the
    // new-player reseat after it (NEW_PLAYER_REACH_GROUPS) rank by the same rules.
    const tierOf = (candidate, nearest) => {
      const perch = !perching && (candidate.under || 0) >= footprint && !(deck && (candidate.run || 0) >= DECK_RUN_PX);
      // Big scenery: a clear perch before a crowded floor; a walking animal stays on
      // the floor while it has room, crowded or not (it walks off as others come),
      // never planted in a tree, rock or stall or on another walker, and, before a
      // crowded spot, its walk clear of them (walkInScenery).
      const scenery = walker ? walkInScenery(candidate, request.key, occupied) : 0;
      // Ticket 64 follow-up: a tree, rock or Piggy behind a floor from beside it only when no other spot is left.
      let hidden = 0;
      // #490: the other nodes' boxes (NODE_FRONT_KEYS) are not ranked here; reseatHiddenNodes moves only the covered ones.
      if (REACH_BOXES[request.key] || FRONT_FIND_KEYS.includes(request.key)) {
        const k = `${request.key}:${candidate.id}`;
        if (!hiddenCache.has(k)) hiddenCache.set(k, (REACH_BOXES[request.key] && hiddenBehindFloor(platforms, candidate, request.key)) || hiddenBehindFront(candidate, request.key, fronts));
        hidden = hiddenCache.get(k) ? 32 : 0;
      }
      // Ticket 118: rooted scenery on or behind a front deco that players walk along, last too.
      if (!hidden && height > 0 && footAtWalkway(candidate, footprint, walkways)) hidden = 32;
      // Big things on a floor steeper than BIG_THING_MAX_SLOPE only when nothing else is left.
      // G1061: a SLOPE_RULINGS spot (one hand-ruled floor on one street) is not too steep for its group.
      const tooSteep = maxSlope != null && (candidate.slope || 0) > maxSlope && !slopeRuled(tsid, request.key, candidate) ? 64 : 0;
      // G852: big things and walkers up a tree's branch art only when nothing else is left.
      const onBranchArt = branchFree && onBranch.has(candidate.id) ? 128 : 0;
      // #575: a garden bed in an animal pen or on a fence (penArtCovers) only when nothing else is left.
      const inPen = penFree && inPenArt(candidate, footprint, height, pens) ? 256 : 0;
      const miss = zoneMiss(candidate);
      const outOfZone = miss > 0 ? 8 + Math.min(20, Math.ceil(miss / 400)) : 0;
      // #581: a rock that would hang an end over the air, only when nothing else is left.
      const overAir = candidate.overAir ? 16 : 0;
      const unlevel = uneven(candidate) ? 64 : 0;
      return inPen + onBranchArt + outOfZone + tooSteep + overAir + unlevel + (footprint > 0
        ? walker ? (perch ? 8 : 0) + (scenery === 2 ? 4 : 0) + (nearest < 1 ? 2 : 0) + (scenery === 1 ? 1 : 0) : (perch ? 1 : 0) + (nearest < 1 ? 2 : 0)
        : 0) + (covers.has(candidate.id) ? (walker ? 16 : crownOnly.has(candidate.id) ? 3 : 4) : 0) + hidden;
    };
    for (let index = groups[request.key].length; index < count; index += 1) {
      if (fixedAt?.has(index)) {
        groups[request.key].push(fixedAt.get(index));
        if (request.key === 'trees') canopies.push(canopyOf(fixedAt.get(index)));
        continue;
      }
      // A `keep` rule (mailboxes) goes down even with no steady spot left: on any spot, as a planned
      // thing did before the rule.
      if (steady?.keep) {
        steadyAt = pool.some((c) => !used.has(c.id) && c.item !== false && steadyRule(c)) ? steadyRule : () => true;
      }
      // The room this one asks for: its footprint, or the most any free clear spot
      // has (any free spot's, when none is clear).
      let need = 0;
      if (footprint > 0) {
        let clearNeed = -1;
        // G852, G853: the room on the spots the group prefers (off branch art, inside its zone), so a
        // roomy branch or a spot far from a stone's dead end never outranks them (offNeed < 0: none left).
        let offNeed = -1;
        let offClear = -1;
        for (const candidate of pool) {
          if (used.has(candidate.id) || candidate.item === false || !steadyAt(candidate)) continue;
          const room = Math.min(footprint, candidate.room || 0);
          need = Math.max(need, room);
          if (!covers.has(candidate.id) || crownOnly.has(candidate.id)) clearNeed = Math.max(clearNeed, room);
          if ((branchFree || zone) && !(branchFree && onBranch.has(candidate.id)) && !zoneMiss(candidate)) {
            offNeed = Math.max(offNeed, room);
            if (!covers.has(candidate.id) || crownOnly.has(candidate.id)) offClear = Math.max(offClear, room);
          }
        }
        if (clearNeed >= 0) need = clearNeed;
        if (offNeed >= 0) {
          const off = offClear >= 0 ? offClear : offNeed;
          // A steady group would be left out on a cramped floor: it may take the roomy branch instead.
          if (!(steady && !steady.keep && off < footprint)) need = off;
        }
        // A steady-floor group (STEADY_FLOOR_GROUPS) never takes a cramped spot: it is left out instead.
        if (steady && !steady.keep && need < footprint) break;
        if (need < footprint) fallbacks.push({ key: request.key, index, room: Math.round(need), footprint });
      }
      let best = null;
      let bestScore = -Infinity;
      let bestTier = Infinity;
      for (const candidate of pool) {
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
        // A thing moved into a new player's reach (NEW_PLAYER_REACH_GROUPS) is not in `occupied` (its old
        // spot is, as a ghost): a spot crowding it ranks last instead, so only a thing planned there moves.
        const tier = tierOf(candidate, nearest) + (reachMoved.length && crowdsReachMoved(candidate, clearance) ? REACH_MOVED_TIER : 0);
        if (tier < bestTier || (tier === bestTier && score > bestScore)) {
          bestTier = tier;
          bestScore = score;
          best = candidate;
        }
      }
      if (!best) break;
      if (footprint > 0 && !perching && (best.under || 0) >= footprint && !(deck && (best.run || 0) >= DECK_RUN_PX)) perches.push({ key: request.key, index });
      if (covers.has(best.id)) blocked.push({ key: request.key, index, fixture: covers.get(best.id).key });
      if (branchFree && onBranch.has(best.id)) branch.push({ key: request.key, index });
      if (maxSlope != null && (best.slope || 0) > maxSlope && !slopeRuled(tsid, request.key, best)) steep.push({ key: request.key, index, slope: Math.round(best.slope * 100) / 100 });
      used.add(best.id);
      const point = { x: best.x, y: best.y, id: best.id, key: request.key, clearance, room: best.room || 0, ...(best.afloat ? { afloat: true } : {}) };
      groups[request.key].push(point);
      occupied.push(point);
      if (request.key === 'trees') canopies.push(canopyOf(point));
    }
    // #490, R43 (#680): a node or piece of furniture the front art covers moves now, before the next
    // group is planned, so every group after it keeps clear of where it stands and no group after it
    // moves it. A group's spots depend only on the groups before it: the realtime server lays out the
    // shared nodes from the groups up to theirs (tools/build-realtime-objects.mjs) and every page,
    // whatever it plans after them, has them at the same spots. Moved after the whole plan, Lonkari
    // Line's Peat Bog stood where the page's mailbox had been planned clear of its first spot.
    // `reseat: false` (tests only): the plan as it was before #490, to show what reseatHiddenNodes moved.
    if (reseat && fits.has(request.key)) moved.push(...reseatHiddenNodes({ groups, occupied: reachMoved.length ? [...occupied, ...reachMoved.filter((m) => m.key !== 'quoins')] : occupied, candidates, used, fronts, fits, keys: [request.key] }));
    // A rock or quoin (NEW_PLAYER_REACH_GROUPS) on a floor only a triple jump lands on (`plainOut`) moves
    // now to the nearest free spot a plain jump reaches, ranked as the loop above ranks (tierOf; a rock
    // also keeps off the spots the later groups would take, laterSpots), then keeping half of every
    // other thing's clearance, then nearest. Its old spot stays taken (a `ghost` in `occupied`, its id
    // still used, its art still kept clear) and its new one is kept in `reachMoved`, which a later
    // group ranks last (REACH_MOVED_TIER) rather than scores against: so every group after it is
    // planned as before but where it would crowd a moved rock, and a street's layout changes only there.
    const ghosts = new Map();
    if (plainUnreached && NEW_PLAYER_REACH_GROUPS.includes(request.key)) {
      let later = null;
      for (const [index, point] of groups[request.key].entries()) {
        if (!point || point.fixed || !pool.find((c) => c.id === point.id)?.plainOut) continue;
        // A thing later groups keep clear of (not a quoin) also keeps off the spots they would take.
        if (!later) later = request.key === 'quoins' ? [] : laterSpots(requestIndex);
        let best = null;
        let bestRank = null;
        for (const c of pool) {
          if (c.plainOut || used.has(c.id) || c.item === false || !steadyAt(c) || measuredQuoin?.(c)) continue;
          let near = 2;
          for (const o of occupied) if (o !== point && !o.ghost) near = Math.min(near, scaledDistance(c, o) / Math.max(1, clearance + o.clearance));
          for (const o of reachMoved) near = Math.min(near, scaledDistance(c, o) / Math.max(1, clearance + o.clearance));
          // Half of every other thing's clearance at least, as reseatHiddenNodes keeps (a rock's tierOf
          // already ranks a spot inside a whole clearance after one clear of it), then the least crowded.
          const crowd = near >= 0.5 ? 0 : 2;
          const d = Math.abs(c.x - point.x) + Math.abs(c.y - point.y);
          const cramped = footprint > 0 && (c.room || 0) < Math.min(footprint, point.room || footprint) ? 8 : 0;
          // Crowding a later group's spot ranks after crowding a rock (tierOf's 2) and before covering a fixture (its 4).
          const crowdsLater = later.some((o) => scaledDistance(c, o) < Math.max(1, clearance + o.clearance)) ? 3 : 0;
          const rank = [tierOf(c, near) + cramped + crowdsLater, crowd, crowd === 2 ? -near : d];
          if (bestRank && (rank[0] - bestRank[0] || rank[1] - bestRank[1] || rank[2] - bestRank[2]) >= 0) continue;
          best = c;
          bestRank = rank;
        }
        if (!best) continue;
        const ghost = { ...point, ghost: true };
        occupied[occupied.indexOf(point)] = ghost;
        ghosts.set(point, ghost);
        reachMoved.push(point);
        used.add(best.id);
        intoReach.push({ key: request.key, index, from: { x: point.x, y: point.y } });
        Object.assign(point, { x: best.x, y: best.y, id: best.id, room: best.room || 0 });
        if (best.afloat) point.afloat = true;
        else delete point.afloat;
      }
    }
    let plannedIndex = 0;
    for (const point of groups[request.key]) {
      if (!point || point.fixed) continue;
      const size = nodeArtBox(request, point, plannedIndex, tsid);
      plannedIndex += 1;
      if (!size) continue;
      for (const at of ghosts.has(point) ? [point, ghosts.get(point)] : [point]) {
        nodeArt.push({ ...at, block: { l: at.x - size[0] / 2, r: at.x + size[0] / 2, t: at.y - size[1], b: at.y } });
      }
    }
    // G1236: a planned shrine, vendor or piece of street furniture is a thing players click, kept
    // clear like a signpost by every group after it (its art's box, FRONT_BOXES), where it stands.
    const clickBox = CLICK_FIXTURE_GROUPS.includes(request.key) && FRONT_BOXES[request.key];
    if (clickBox) {
      const [w, h] = clickBox;
      for (const point of groups[request.key]) {
        if (!point || point.fixed) continue;
        fixtures.push({ ...point, click: true, block: { l: point.x - w / 2, r: point.x + w / 2, t: point.y - h, b: point.y } });
      }
    }
  }

  const seated = seatOnFloor(groups, requests, platforms);
  return { seed: String(seed), groups, occupied: [...occupied.filter((p) => !p.ghost), ...reachMoved], candidateCount: candidates.length, fallbacks, perches, blocked, steep, branch, moved, intoReach, seated };
}

/**
 * #581: a planned rock or node stands on the floor under its whole foot, not only under its middle.
 * The planner's spot is the line's height at the spot's x, and a flat-bottomed rock drawn there on a
 * sloped or bowed floor hung its downhill end over the air (Gori Blear's Sparkly Rock: 9 px over a
 * floor falling to the ledge's tip, its corner past the art's rim). Glitch set its rocks and nodes
 * by hand (rock_*.js obey_physics false), seated in the art. So once the plan is made each planned
 * point of a SEATED_GROUPS group goes down onto the floor under the lower end of its foot (its
 * footprint, half each side: footOverAir), as far as the group's edgeDrop (a farther drop is a
 * ledge end, which the planner keeps them off); its uphill end sinks into the floor instead, as a
 * hand-set rock's did. Fixed and measured points stay where they are, and so does one the front art
 * would hide once seated (`afloat`, planStreetPlacements). Returns [{ key, index, drop }].
 */
export function seatOnFloor(groups, requests, platforms) {
  const seated = [];
  for (const request of requests || []) {
    const rule = seatRule(request);
    if (!rule) continue;
    (groups[request.key] || []).forEach((point, index) => {
      if (!point || point.fixed || point.afloat || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      const drop = seatDrop(platforms, point, request.key, rule);
      if (!(drop > 0)) return;
      point.y += drop;
      seated.push({ key: request.key, index, drop: Math.round(drop * 10) / 10 });
    });
  }
  return seated;
}

/** A SEATED_GROUP request's { footprint, cap } (null: not seated): its footprint and the most it goes down. */
function seatRule(request) {
  const footprint = Number.isFinite(request?.footprint) ? request.footprint : PLACEMENT_FOOTPRINTS[request?.key] || 0;
  if (!SEATED_GROUP(request?.key) || !(footprint > 0)) return null;
  if (request.key === 'rocks') return { footprint, cap: ROCK_SEAT_MAX_PX };
  const rule = request?.steady || STEADY_FLOOR_GROUPS[request.key];
  return Number.isFinite(rule?.edgeDrop) ? { footprint, cap: rule.edgeDrop } : null;
}

/**
 * PURE: how far a thing of `key` at `spot` goes down to the floor under the lower end of its foot
 * (0: it stands on it, or the drop is a ledge end it must not follow). A rock's shape is chosen
 * after the plan from its spot's room (rockShapeFor: never wider than the room when one fits), so it
 * is seated under the widest shape its room holds (up to ROCK_SEAT_MAX_PX down), else its footprint.
 */
function seatDrop(platforms, spot, key, { footprint, cap }) {
  const halves = key === 'rocks'
    ? [Math.max(footprint, Math.min(ROCK_DRAWN_WIDEST, Number(spot.room) || 0)) / 2, footprint / 2]
    : [footprint / 2];
  const drop = halves.map((half) => footOverAir(platforms, spot, half)).find((d) => d <= cap);
  return drop > 0 ? drop : 0;
}

/** The widest rock shape as drawn (ROCK_SHAPE_WIDTHS), and the most a planned rock goes down to its floor. */
const ROCK_DRAWN_WIDEST = Math.max(...Object.values(ROCK_SHAPE_WIDTHS).flat());
export const ROCK_SEAT_MAX_PX = 28;

/** The groups seatOnFloor seats: rocks and the resource nodes that stand on a floor. */
export const SEATED_GROUP = (key) => key === 'rocks' || String(key || '').startsWith('resource:');

/**
 * #490 (R2): a planned node mostly behind the front art (hiddenBehindFront, NODE_FRONT_KEYS) moves, as
 * soon as its group is planned (`keys`: that group; R43, #680), to the nearest free spot its group would take that the front art leaves clear (keeping every other
 * thing's clearance where it can, half of it at least); every other spot stays as planned, so a street's layout moves only where
 * something was hidden. With no such spot it stays (the front art covers every floor left). The
 * point is moved in place (groups and occupied share it), so its index and key stay its own.
 */
function reseatHiddenNodes({ groups, occupied, candidates, used, fronts, fits, keys = [...fits.keys()] }) {
  const moved = [];
  if (!fronts.length) return moved;
  for (const key of keys) {
    if (!fits.has(key)) continue;
    const { fit, loose, inZone, miss, pool } = fits.get(key);
    for (const [index, point] of (groups[key] || []).entries()) {
      if (point.fixed || !hiddenBehindFront(point, key, fronts)) continue;
      // The nearest spot clear of every other thing's clearance, else the nearest at half of it (the
      // planner too seats a node in a crowded spot when no clear one is left). Furniture (`loose`,
      // FURNITURE_FRONT_KEYS) ranks its zone first, then takes a more crowded spot (the roomiest) too.
      let best = null;
      let bestRank = [Infinity, Infinity, Infinity];
      const better = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      // #581: a seated group's spots as it would stand on them (planStreetPlacements `pool`).
      for (const c of pool || candidates) {
        const d = Math.abs(c.x - point.x) + Math.abs(c.y - point.y);
        if (d >= bestRank[2] && bestRank[0] === 0 && bestRank[1] === 0) continue;
        if (!fit(c) || (inZone && !inZone(c)) || hiddenBehindFront(c, key, fronts)) continue;
        let near = Infinity;
        for (const o of occupied) if (o !== point) near = Math.min(near, scaledDistance(c, o) / Math.max(1, point.clearance + o.clearance));
        const tier = near >= 1 ? 0 : near >= 0.5 ? 1 : 2;
        if (tier === 2 && !loose) continue;
        const rank = [loose ? miss(c) : 0, tier, tier === 2 ? -near : d];
        if (better(rank, bestRank) >= 0) continue;
        best = c;
        bestRank = rank;
      }
      // #731, #574: a stone whose dead end the art's boxes cover takes the spot there its drawn art
      // leaves seen (under STONE_SEEN_SHARE), the nearest to its own (which counts: it may stay), less
      // crowded first; with none, the least covered one (tests/visiting-stone-dead-end-731.test.js).
      let share = null;
      if (!best && inZone) {
        const [w, h] = FRONT_BOXES[key];
        let pick = null;
        for (const c of pool || candidates) {
          if (!inZone(c) || !(c.id === point.id || fit(c))) continue;
          const d = Math.abs(c.x - point.x) + Math.abs(c.y - point.y);
          const seen = frontArtShare(c, w, h, fronts);
          let near = Infinity;
          for (const o of occupied) if (o !== point) near = Math.min(near, scaledDistance(c, o) / Math.max(1, point.clearance + o.clearance));
          const rank = seen < STONE_SEEN_SHARE ? [0, near >= 0.5 ? 0 : 1, d] : [1, seen, d];
          if (pick && better(rank, pick.rank) >= 0) continue;
          pick = { c, rank, seen };
        }
        if (pick && pick.c.id !== point.id) {
          best = pick.c;
          share = Math.round(pick.seen * 100) / 100;
        }
      }
      if (!best) continue;
      used.delete(point.id);
      used.add(best.id);
      moved.push({ key, index, from: { x: point.x, y: point.y }, ...(share != null ? { share } : {}) });
      Object.assign(point, { x: best.x, y: best.y, id: best.id, room: best.room || 0 });
      if (best.afloat) point.afloat = true;
      else delete point.afloat;
    }
  }
  return moved;
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
