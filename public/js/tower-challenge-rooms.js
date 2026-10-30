/**
 * Jethimadh Tower Base: the challenge rooms Room 4, Room 8 and Room 16,
 * rebuilt (pure data and a builder: no Pixi, no DOM). Room 15 and the
 * Ventilation Room live in js/tower-rooms.js; this module reuses its art
 * helpers and street format and adds the three rooms the corridors' locked
 * doors still point at.
 *
 * None of them is in the public locations dump. inc_data_maps_prod.js hub 77
 * names them (LIF1Q6PMN7123NQ "Room 4", LIF1FHA10312KLV "Room 8",
 * LTJ11V9DK812UNL "Room 16") and the archived corridor doors keep their keys
 * and arrival points:
 *   Corridor Two  door_1304676445973 (key 1) -> Room 4  at -1080, -1701
 *   Corridor Four door_1304677515848 (key 3) -> Room 8  at  -736,  -630
 *   Corridor Six  door_1304678594665 (key 6) -> Room 16 at    -7,  -407
 * Everything else comes from the player record, each element carrying a
 * `why`:
 *   W  Glitch Forever wiki "Jethimadh Tower: Base" (rooms table) and "Key"
 *      (key spawn table: Room 8 and Room 16 "once per instance").
 *   T  Terror Terror's "Relationship of Doors in Jethimadh Tower" diagram
 *      (the wiki page): Room 8's door is one way, into Corridor Four's east
 *      half, left of the C6E door.
 *   F  Forum thread 3343 (tower test day, 2011-05): Room 4 "I drank the
 *      drinks, harvested the plots and replanted"; "my was it purty".
 * Art: Room 8 (G110) is a dark void crossed by a rope-and-plank bridge, read
 * off its one Snap (research/wayback/raw/snaps/jtower_room_8/, reference only)
 * and dressed in firebog.swf street decos (see buildRoom8). Rooms
 * 4 and 16 are not tower interiors (G72): players' Snaps
 * (research/wayback/raw/snaps/jtower_room_4/, jtower_room_16/, reference
 * only) show a felt-craft meadow and a black cave round a wooden bottletree
 * pod, and the archived corridor doors name each room's location SWF:
 *   Corridor Two  door_1304676445973 connect swf .../locations/wardrobia/1304967037.swf
 *   Corridor Six  door_1304678594665 connect swf .../locations/firebog/1331248191.swf
 * Room 4 is dressed from the CC0 wardrobia.swf set (tools/room-art set
 * tower_room_4, drawn by features/tower-rooms-feature.js from `art`), Room 16
 * from firebog.swf's bottletree pieces already among the street decos. No
 * deco lists survive for either, so the layouts are read off the Snaps; the
 * platforms, ladder, doors, keys and items are unchanged, except (G97) Room
 * 4's two shelves, one-way ledges the Snaps' drinks stand on, and Room 16's
 * mouth, drawn from a render at the door's size (tools/room-art set
 * tower_room_16). No pixels from screenshots or video.
 *
 * tools/build-tower-rooms.mjs writes all five rooms' street JSON. The shell,
 * ladder, plaque, lantern and wall helpers are exported for js/tower-mid-rooms.js.
 */

import { decoPoint, hangingSign, stepsPiece, TOWER_ROOMS, towerRoomIndexEntry, towerRoomStreet } from './tower-rooms.js?v=7b2aa06a';
import { TOWER_ROOM_4_FILES } from './tower-room-4-art.js?v=6a934af6';
import { TOWER_ROOM_16_FILES } from './tower-room-16-art.js?v=eaafb5f7';

export const ROOM_4_TSID = 'GIF1Q6PMN7123NQ';
export const ROOM_8_TSID = 'GIF1FHA10312KLV';
export const ROOM_16_TSID = 'GTJ11V9DK812UNL';

export const DOOR = { w: 196, h: 214, sprite: 'door_asset_jethimadh_int' };
const LADDER_W = 50;
/**
 * Bounds bottom: the world runs 300 px under y 0 (400+ under each floor), the
 * way the archived corridors keep ~450 px of tube under theirs, so the camera
 * (anchored ~100 px over the feet, plus the 132 px the pack covers) never shows
 * past the street. The shell stretches down with it.
 */
const BELOW_FLOOR = 300;

export const flat = (id, x1, x2, y, why, pc = -1) => ({ id: `plat_${id}`, x1: Math.round(x1), y1: Math.round(y), x2: Math.round(x2), y2: Math.round(y), pc_perm: pc, why });

/** The floor under x: the lowest walkable surface (world y, largest). */
export function floorY(platforms, x) {
  let best = null;
  for (const p of platforms) {
    if (p.pc_perm !== -1) continue;
    const x1 = Math.min(p.x1, p.x2);
    const x2 = Math.max(p.x1, p.x2);
    if (x < x1 || x > x2) continue;
    const y = x2 === x1 ? p.y1 : p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1);
    if (best == null || y > best) best = y;
  }
  return best == null ? null : Math.round(best);
}

/** Collect a room's platforms and decos from steps pieces and plain rows. */
export function collector() {
  const platforms = [];
  const decos = [];
  const add = (piece) => {
    platforms.push(...piece.platforms);
    decos.push(...piece.decos);
    return piece;
  };
  return { platforms, decos, add };
}

/**
 * The chamber shell of Room 15 (a corridor section stood taller: wood
 * backdrops, their shadow, frame caps at both ends, frame walls top and
 * bottom), scaled to the room's bounds.
 */
export function shell(bounds) {
  const { l, r, t, b } = bounds;
  const cx = (l + r) / 2;
  const sx = (r - l) / 2000;
  const sy = (b - t) / 1000;
  const at = (dx) => Math.round(cx + dx * sx);
  const up = (dy) => Math.round(b + dy * sy);
  return [
    { sprite: 'jethimadh_int_bg_left', x: at(-560), y: up(-30), w: Math.round(900 * sx), h: Math.round(930 * sy), z: 1, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_int_bg_center', x: at(0), y: up(-24), w: Math.round(640 * sx), h: Math.round(940 * sy), z: 2, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_int_bg_right', x: at(560), y: up(-30), w: Math.round(900 * sx), h: Math.round(930 * sy), z: 0, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_int_bg_shadow_50percent', x: at(0), y: up(-40), w: Math.round(1960 * sx), h: Math.round(900 * sy), z: 3, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_frame_cap', x: at(-760), y: up(-10), w: Math.round(480 * sx), h: Math.round(980 * sy), z: 8, r: 0, layer: 'fg' },
    { sprite: 'jethimadh_frame_cap', x: at(760), y: up(-10), w: Math.round(480 * sx), h: Math.round(980 * sy), z: 8, r: 0, flip: true, layer: 'fg' },
    { sprite: 'jethimadh_frame_wall', x: at(0), y: up(-958), w: Math.round(1060 * sx), h: 42, z: 8, r: 0, layer: 'fg' },
    { sprite: 'jethimadh_frame_wall', x: at(0), y: up(-10), w: Math.round(1060 * sx), h: 42, z: 8, r: 0, layer: 'fg' },
  ];
}

/**
 * The corridors' floor: two steps pieces meeting in a dip, joined in the
 * middle, with flat lips out to the end walls (Room 15's floor without the
 * gaps at its ends).
 */
function floor(c, id, bounds, { top, w, h }) {
  const why = 'Corridor floor art (jethimadh_int_steps_1) mirrored into a dip; platforms follow its top edge, flat lips run out to the end walls.';
  const half = (bounds.r - bounds.l) / 2;
  const cx = (bounds.l + bounds.r) / 2;
  const off = half - w / 2 - 40;
  const left = c.add(stepsPiece(`${id}_floor_l`, cx - off, top, w, h, { why }));
  const right = c.add(stepsPiece(`${id}_floor_r`, cx + off, top, w, h, { flip: true, why }));
  const mid = Math.round(top + 0.422 * h);
  c.platforms.push(flat(`${id}_floor_mid`, left.right, right.left, mid, why));
  const lipY = Math.round(top + 0.06 * h);
  c.platforms.push(flat(`${id}_floor_lip_l`, bounds.l + 20, left.left, lipY, why));
  c.platforms.push(flat(`${id}_floor_lip_r`, right.right, bounds.r - 20, lipY, why));
  return { left, right, mid };
}

/**
 * A way-out ledge: a steps piece whose high block (0.067-0.334 of its width)
 * stands under the door, and a flat lip back to the end wall.
 */
function wayOut(c, id, bounds, doorX, y, w, h, why) {
  const cx = Math.round(doorX + (0.5 - 0.2005) * w);
  const piece = c.add(stepsPiece(`${id}_wayout`, cx, y, w, h, { why, z: 7 }));
  c.platforms.push(flat(`${id}_wayout_lip`, bounds.l + 20, piece.left + 15, y, why));
  return piece;
}

/**
 * Alternating sliced-tree ledges (the Ventilation Room's climb): unflipped on
 * the left, flipped on the right, so their low ends face each other.
 */
function climb(c, id, steps, why) {
  return steps.map(([cx, top, w, flip], i) => c.add(stepsPiece(`${id}_${String(i).padStart(2, '0')}`, cx, top, w, 44, { flip, why })));
}

/** A ladder (x centre, y bottom, h up) and the corridors' ladder art up it. */
export function ladder(c, id, x, bottom, top, why) {
  const h = bottom - top;
  const segs = Math.max(1, Math.round((h - 40) / 198));
  for (let i = 0; i < segs; i += 1) {
    c.decos.push({ sprite: 'ladder_interior_3steps', x, y: bottom + 11 - i * 198, w: 72, h: 199, z: 10 + i, r: 0, layer: 'mg' });
  }
  c.decos.push({ sprite: 'ladder_tile_cap_1_interior', x, y: top + 34, w: 97, h: 50, z: 10 + segs, r: 0, layer: 'mg' });
  return { id: `ladder_${id}`, x, y: bottom, w: LADDER_W, h, why };
}

/** The door plaque (jethimadh_int_door_sign + a blank firebog sign with painted text). */
export function plaque(c, x, y, text) {
  c.decos.push({ sprite: 'jethimadh_int_door_sign', x, y, w: 188, h: 110, z: 11, r: 0, layer: 'mg' });
  c.decos.push({ sprite: 'firebog_sign_blank', x, y: y - 17, w: 138, h: 80, z: 16, r: 0, layer: 'mg', signText: text });
}

export const lantern = (x, y, big = false) => ({ sprite: 'jethimadh_int_lantern_1', x, y, w: big ? 353 : 300, h: big ? 533 : 450, z: 3, r: 0, layer: 'fg' });

/** The flat walkable runs of a platform list (floor-type, |rise| <= 4 px, 16+ px long), world. */
export function flats(platforms) {
  return platforms
    .filter((p) => p.pc_perm === -1 && Math.abs(p.y2 - p.y1) <= 4 && Math.abs(p.x2 - p.x1) >= 16)
    .map((p) => ({ id: p.id, x1: Math.min(p.x1, p.x2), x2: Math.max(p.x1, p.x2), y: Math.round((p.y1 + p.y2) / 2) }));
}

export const TOWER_ROOM_4_ART_ROOT = 'assets/sprites/tower-rooms/room_4/';
export const TOWER_ROOM_16_ART_ROOT = 'assets/sprites/tower-rooms/room_16/';
const DECO_ROOT = 'assets/decos/groddle/';

export const barriersFor = (bounds, id) => [
  { id: `wall_${id}_left`, x: bounds.l + 32, y: bounds.t, h: bounds.b - bounds.t, pc_perm: null, why: 'Chamber end.' },
  { id: `wall_${id}_right`, x: bounds.r - 32, y: bounds.t, h: bounds.b - bounds.t, pc_perm: null, why: 'Chamber end.' },
];

/* ------------------------------------------------------------------ */
/* Room 4 (LIF1Q6PMN7123NQ)                                             */
/* ------------------------------------------------------------------ */

/** GSJS items/*.js name_single for the six drinks the W rooms table lists. */
export const ROOM_4_DRINKS = Object.freeze([
  { cls: 'cosmapolitan', label: 'Cosma-politan' },
  { cls: 'gurly_drink', label: 'Gurly Drink' },
  { cls: 'pungent_sunrise', label: 'Pungent Sunrise' },
  { cls: 'savory_smoothie', label: 'Savory Smoothie' },
  { cls: 'tooberry_shake', label: 'Too-Berry Shake' },
  { cls: 'slow_gin_fizz', label: 'Slow Gin Fizz' },
]);

/**
 * The two wooden shelves the drinks stand on (Snaps PHVM2S0SCF92Q3L, PIFILOB3DN63656 and
 * PHVIVNEBDA92RK5, reference only: drinks on wardrobia shelves at about head height). `y` is the
 * plank's top face, a one-way ledge 80-93 px over the floor steps under it, so a plain jump (apex
 * ~110 px) lands on it and a drink there is also in reach from the floor below.
 */
export const ROOM_4_SHELVES = Object.freeze([
  Object.freeze({ name: 'wardrobia_shelf_long', x: -490, y: -210, drinks: Object.freeze([-90, 0, 90]) }),
  Object.freeze({ name: 'wardrobia_shelf_short', x: 480, y: -210, drinks: Object.freeze([-55, 0, 55]) }),
]);
/** The plank's top face sits 3 px under the shelf art's top (52 px tall, bottom-centre anchor). */
const SHELF_TOP = 3;

/** sky_large_1's linen blue (the CC0 render's mid-tone), the room's sky gradient behind the felt. */
export const ROOM_4_SKY = 'cbe5f8';
/** platform_with_xsection_1's soil (the CC0 render's brown), filled under the felt ground. */
const ROOM_4_SOIL = 0x8f7d4f;

/**
 * Room 4's dressing as draw rows for features/tower-rooms-feature.js (world
 * space, bottom-centre anchors, z behind the avatar): wardrobia.swf pieces from
 * tools/room-art (TOWER_ROOM_4_FILES) and the corridor ladder from the street
 * decos. Every floor run gets felt ground whose grass top sits 28 px over it.
 */
function room4Art(c, bounds, fl) {
  const art = [];
  const felt = (name, x, y, { w, h, z, flip, r, signText } = {}) => {
    const [file, fw, fh] = TOWER_ROOM_4_FILES[name];
    const row = { name, src: `${TOWER_ROOM_4_ART_ROOT}${file}`, x: Math.round(x), y: Math.round(y), w: Math.round(w ?? fw), h: Math.round(h ?? fh), z, r: r || 0 };
    if (flip) row.flip = true;
    if (signText) row.signText = signText;
    art.push(row);
    return row;
  };
  const ground = (x) => floorY(c.platforms, x);

  // The sky: one linen swatch past every edge of the room, the stitched patch rising from the meadow.
  felt('sky_large_1', 0, bounds.b + 120, { w: 3700, h: 2900, z: -99 });
  felt('sky_patch_1', 260, fl.mid - 20, { w: 700, h: 360, z: -90, r: -62 });
  for (const [name, x, y, s] of [
    ['fabric_cloud_1', -520, -520, 1], ['fabric_cloud_2', 760, -430, 1], ['fabric_cloud_2', 120, -900, 0.9],
    ['fabric_cloud_1', 900, -1180, 0.9], ['fabric_cloud_2', -760, -1150, 1], ['fabric_cloud_1', -160, -1460, 1],
    ['fabric_cloud_2', 520, -1800, 1], ['fabric_cloud_1', -1000, -1950, 0.8], ['fabric_cloud_2', 1050, -2000, 0.8],
  ]) felt(name, x, y, { w: TOWER_ROOM_4_FILES[name][1] * s, h: TOWER_ROOM_4_FILES[name][2] * s, z: -88 });

  // Hills behind the meadow, the pines and the shelves (Snaps: pines a screen apart, shelves at head height).
  felt('platform_mound_1', -980, ground(-980) + 50, { z: -80 });
  felt('platform_mound_1', 1000, ground(1000) + 50, { z: -80, flip: true });
  // (G97: the second pine stands at -720, clear of the long shelf, as the Snaps keep shelves and pines apart.)
  for (const [name, x] of [['fabric_tree_mid_1', -1090], ['fabric_tree_mid_1', -720], ['fabric_tree_flat_1', 240], ['fabric_tree_mid_1', 860], ['fabric_tree_flat_1', 1130]]) {
    felt(name, x, ground(x) - 14, { z: -76 });
  }
  for (const shelf of ROOM_4_SHELVES) felt(shelf.name, shelf.x, shelf.y - SHELF_TOP + TOWER_ROOM_4_FILES[shelf.name][2], { z: -74 });

  // Soil under the meadow, then felt ground along every floor run (deepest runs in front).
  art.push({ name: 'soil', fill: ROOM_4_SOIL, x1: bounds.l, x2: bounds.r, y1: -40, y2: bounds.b + 700, z: -70 });
  // The floor's two steps pieces fall 61 px to the middle in 12-20 px steps: each side is one felt
  // band tilted along its runs (the grass top within ~10 px of every step), the middle flat a level band
  // in front, so the felt reads as one rolling meadow as in the Snaps.
  const runs = flats(c.platforms).filter((f) => f.y > -600);
  const H = 190;
  const DEPTH = 28;
  for (const side of [-1, 1]) {
    const mine = runs.filter((f) => /_floor_[lr]_/.test(f.id) && Math.sign(f.x1 + f.x2) === side);
    const outer = mine.reduce((a, b) => (Math.abs(a.x1 + a.x2) > Math.abs(b.x1 + b.x2) ? a : b));
    const inner = mine.reduce((a, b) => (Math.abs(a.x1 + a.x2) < Math.abs(b.x1 + b.x2) ? a : b));
    const [ox, ix] = [(outer.x1 + outer.x2) / 2, (inner.x1 + inner.x2) / 2];
    const slope = (inner.y - outer.y) / (ix - ox);
    const angle = Math.atan(slope);
    const topX = side * (bounds.r + 60 + 120) / 2; // the band runs from past the end wall to the middle
    const topY = outer.y + slope * (topX - ox) - DEPTH;
    felt('platform_with_xsection_1', topX - H * Math.sin(angle), topY + H * Math.cos(angle), { w: bounds.r + 60 - 120 + 40, h: H, z: -69, r: (angle * 180) / Math.PI });
  }
  const mid = runs.find((f) => f.id === 'plat_r4_floor_mid');
  felt('platform_with_xsection_1', 0, mid.y - DEPTH + H, { w: 520, h: H, z: -68 });
  for (const x of [-1150, -930, -660, -360, -150, 150, 380, 700, 980, 1200]) felt('fabric_flowers_1', x, ground(x) + 6, { z: -50 });

  // The way out: a felt island under the door, the corridor ladder up to it, the EXIT arrow pointing at the door.
  felt('platform_with_skirt_1', -965, -1701 - 18 + 120, { w: 660, h: 120, z: -45 });
  felt('fabric_flowers_1', -700, -1668, { z: -44 });
  felt('wardrobia_arrow_1', -1222, -1712, { w: 104, h: 74, z: -43, signText: 'EXIT' });
  for (const d of c.decos) {
    if (!/^ladder_/.test(d.sprite)) continue;
    art.push({ name: d.sprite, src: `${DECO_ROOT}${d.sprite}.png`, x: d.x, y: d.y, w: d.w, h: d.h, z: -40 + (d.z - 10), r: 0 });
  }
  return art.sort((a, b) => a.z - b.z);
}

function buildRoom4() {
  const c = collector();
  const bounds = { l: -1300, r: 1300, t: -2100, b: BELOW_FLOOR };

  const fl = floor(c, 'r4', bounds, { top: -170, w: 1200, h: 150 });

  // Way out: the door back to C2 at the archived arrival, high on the left.
  const doorWhy = 'Arrival -1080,-1701 from Corridor Two door_1304676445973 (archived, key 1); the way out stands where you arrive, 1530 px over the floor.';
  const out = wayOut(c, 'r4', bounds, -1080, -1701, 440, 70, doorWhy);

  // The corridors' ladder (C1, C2) from the floor up to the way-out ledge.
  const ladderWhy = 'Remake route: the arrival is 1530 px over the floor, so a corridor ladder (C1/C2 art: ladder_interior_3steps, ladder_tile_cap_1_interior) climbs from the floor to the way-out ledge; Down at its top climbs down.';
  const ladderX = -860;
  const ladderTop = Math.round(-1701 + 0.352 * 70); // the ledge's step over x -860 (0.736-0.769 of the piece)
  const ladders = [ladder(c, 'r4', ladderX, -167, ladderTop, ladderWhy)];

  // The garden: "4 plots with spinach" (W). One row of four crop plots on the floor's middle flat.
  const gardenWhy = 'W rooms table: "Bring a Hoe & 4 packets of Seeds. *Optional. Within are 4 plots with spinach"; F 3343 "harvested the plots and replanted". A 4 x 1 crop garden on the floor\'s middle flat, its empty plots replanted with spinach once a game day.';
  const garden = { x: 0, y: fl.mid, cols: 4, rows: 1, seed: 'seed_spinach', why: gardenWhy };

  // Six drinks on the two shelves either side of the garden (G97: the Snaps' drinks stand on shelves).
  const drinkWhy = 'W rooms table: "six different drinks: Cosma-politan, Gurly Drink, Pungent Sunrise, Savory Smoothie, Too-Berry Shake, and Slow Gin Fizz"; F 3343 "I drank the drinks". Snaps PHVM2S0SCF92Q3L, PIFILOB3DN63656, PHVIVNEBDA92RK5 (reference only): the drinks stand on wooden shelves at head height. One of each, three to a shelf, back once a game day after you take it.';
  const shelfWhy = 'Snaps PHVM2S0SCF92Q3L, PIFILOB3DN63656, PHVIVNEBDA92RK5 (reference only): wardrobia shelves at head height holding the drinks. Remake: the plank\'s top face, one way, a plain jump over the floor steps under it.';
  const spots = [];
  for (const shelf of ROOM_4_SHELVES) {
    const half = TOWER_ROOM_4_FILES[shelf.name][1] / 2;
    c.platforms.push(flat(`r4_${shelf.name.replace('wardrobia_', '')}`, shelf.x - half + 10, shelf.x + half - 10, shelf.y, shelfWhy));
    for (const dx of shelf.drinks) spots.push({ x: shelf.x + dx, y: shelf.y });
  }
  const items = ROOM_4_DRINKS.map((d, i) => ({ id: `r4_${d.cls}`, cls: d.cls, label: d.label, count: 1, x: spots[i].x, y: spots[i].y, why: drinkWhy }));

  c.platforms.push(flat('r4_ceiling', bounds.l + 40, bounds.r - 40, bounds.t + 35, 'Chamber roof (solid from below).', 1));

  const art = room4Art(c, bounds, fl);

  return {
    tsid: ROOM_4_TSID,
    sourceTsid: 'LIF1Q6PMN7123NQ',
    label: 'Room 4',
    bounds,
    platforms: c.platforms,
    barriers: barriersFor(bounds, 'r4'),
    // The street JSON keeps the ladder's art (a street needs decos); the felt over it is the art rows,
    // which draw the ladder again in front.
    decos: c.decos.filter((d) => /^ladder_/.test(d.sprite)),
    art,
    swf: 'wardrobia.swf',
    gradient: { top: ROOM_4_SKY, bottom: ROOM_4_SKY },
    ladders,
    doors: [
      {
        id: 'door_r4_wayout',
        x: -1080,
        y: -1701,
        ...DOOR,
        connect: { tsid: 'LIF1Q3IQM7122SP', label: 'Corridor Two', x: 131, y: -547, hub_id: '77' },
        why: 'Back through C2\'s Room 4 door (world 131,-547), the way you came in.',
      },
    ],
    spots: [],
    garden,
    items,
    wayOut: { left: out.left, right: out.right, top: out.top },
    why: {
      room: 'W: "Room 4 || Yellow-Purple Triangle Key || Located in C2. Key is acquired automatically. Bring a Hoe & 4 packets of Seeds. *Optional. Within are 4 plots with spinach and six different drinks". W trivia: "During development, challenge Room 4 had been called Back of the Wardrobe."',
      size: 'Remake: 2600 wide, 2100 above y 0 (no source bounds survive); the archived arrival y -1701 puts the way out high in the room, so the room is tall and the garden sits on its floor.',
      decor: 'G72: Corridor Two\'s archived door into Room 4 carries swf_file_versioned .../locations/wardrobia/1304967037.swf (streets GIF1Q3IQM7122SP.xml), and two player Snaps (2012-11/12, jtower_room_4/, reference only) show the wardrobia felt meadow: linen sky, a stitched sky patch, fabric clouds, felt pines and flowers, felt ground over a soil cross-section with stones, wooden shelves, a stitched blue EXIT arrow, the four spinach plots in the grass. No deco list survives: the layout is read off the Snaps over the unchanged platforms (felt ground along every floor run, the way-out ledge a felt island with a hanging skirt, the corridor ladder kept); F 3343 "my was it purty".',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Room 8 (LIF1FHA10312KLV)                                             */
/* ------------------------------------------------------------------ */

/**
 * Room 8 is the "unstable bridge" of its one Snap (research/wayback/raw/snaps/jtower_room_8/,
 * PUVTECCNR7S22RU, Xeloalex 2012-06-22 "Ahh..! Unstable Bridge!", Ancient filter; reference only):
 * a dark void crossed left to right. You arrive on a ring-step ledge with roots and beads hanging
 * under it; a rope-and-plank bridge hung from thorny vines, bead tassels under its planks, drops
 * across the void; on the right a curved plank deck rings a tree trunk, with branches growing on it,
 * a lantern, the key on the planks and a "Way Out" plank hung on ropes. The trunk's dark hollow is
 * the way out (the Snap's arched opening, at its right edge). Every piece is a firebog.swf street
 * deco: jethimadh_int_steps_1, bridge, vine_rope, hanging_eggs_decor, hanging_braches1,
 * walkway_1, bottletree_body2, sprout, ground_cutaway_hollow3, firebog_sign_blank_plank,
 * jethimadh_int_lantern_1, legs_moss_*, the vine ladder tiles. Snap scale ~3.2 world px a Snap px
 * (its avatar ~45 px tall): about the whole 2000-wide room. The gaps are closed to plain jumps
 * (the Snap's ~250 px hop to the deck is past the remake's ~150 px running jump); the bridge does
 * not sway (its instability is not recorded beyond the caption).
 */
const ROOM_8_BRIDGE = Object.freeze({
  // bridge.webp's walking line (fractions of the unflipped art): ~45% down each plank's face.
  line: Object.freeze([[0.03, 0.58], [0.25, 0.67], [0.42, 0.65], [0.52, 0.61], [0.62, 0.54], [0.75, 0.41], [0.87, 0.31], [0.97, 0.25]]),
});
/** walkway_1's walking line (fractions): ~40% down its plank face, left tip to past the middle. */
const WALKWAY_LINE = Object.freeze([[0.01, 0.28], [0.05, 0.23], [0.1, 0.25], [0.15, 0.26], [0.2, 0.35], [0.25, 0.42], [0.3, 0.48], [0.35, 0.52], [0.4, 0.55], [0.5, 0.56], [0.7, 0.53]]);

function buildRoom8() {
  const c = collector();
  const bounds = { l: -1000, r: 1000, t: -1150, b: 500 };
  const mg = (sprite, x, y, w, h, z, extra = {}) => ({ sprite, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z, r: 0, ...extra, layer: 'mg' });
  const lineOn = (d, line, id, why, maxX = Infinity) => {
    const pts = line.map(([fx, fy]) => decoPoint(d, fx, fy).map(Math.round)).sort((p, q) => p[0] - q[0]);
    while (pts.length > 2 && pts[pts.length - 2][0] >= maxX) pts.pop();
    const last = pts[pts.length - 1];
    if (last[0] > maxX) {
      const prev = pts[pts.length - 2];
      pts[pts.length - 1] = [maxX, Math.round(prev[1] + ((maxX - prev[0]) / (last[0] - prev[0])) * (last[1] - prev[1]))];
    }
    for (let i = 1; i < pts.length; i += 1) {
      const [[x1, y1], [x2, y2]] = [pts[i - 1], pts[i]];
      c.platforms.push({ id: `plat_${id}_${i}`, x1, y1, x2, y2, pc_perm: -1, why });
    }
    return { left: pts[0][0], right: pts[pts.length - 1][0], top: Math.min(...pts.map((p) => p[1])), low: Math.max(...pts.map((p) => p[1])) };
  };

  // The void: the corridor shell, dimmed to a faint wooden dark behind everything (BG layer).
  c.decos.push(...shell(bounds).map((d) => ({ ...d, layer: 'bg' })));

  // Arrival: the archived arrival point stands on a ring-step ledge (the Snap's upper-left slabs).
  const arriveWhy = 'Arrival -736,-630 from Corridor Four door_1304677515848 (archived, key 3). Snap PUVTECCNR7S22RU: you start on the left, on a two-step ring ledge over the void.';
  // The steps piece's high block (0.067-0.334 of its width) stands under the arrival, a lip runs back to the wall.
  const arrive = c.add(stepsPiece('r8_arrive', Math.round(-736 + (0.5 - 0.2005) * 560), -630, 560, 80, { why: arriveWhy, z: 7 }));
  c.platforms.push(flat('r8_arrive_lip', bounds.l + 20, arrive.left + 15, -630, arriveWhy));
  // The lip runs on to the wall under a second slab's high block (art only, behind the first).
  c.decos.push(mg('jethimadh_int_steps_1', -767, -550, 560, 80, 6));

  // The bridge: bridge.webp mirrored (its high end on the left) and turned 10 degrees down to the right.
  const bridgeWhy = 'Snap PUVTECCNR7S22RU: a rope-and-plank bridge drops left to right across the void, ~16 degrees, hung from thorny vines. Remake: its high end a short step under the ledge\'s low end; platforms follow the planks (bridge.webp, ~45% down each plank face).';
  const bridgeDeco = mg('bridge', -54, -411, 640, 136, 8, { flip: true, r: 10 });
  c.decos.push(bridgeDeco);
  const bridge = lineOn(bridgeDeco, ROOM_8_BRIDGE.line, 'r8_bridge', bridgeWhy);

  // The deck round the trunk: walkway_1's left half (its right half runs on behind the end wall).
  const deckWhy = 'Snap PUVTECCNR7S22RU: a curved plank deck round a tree trunk on the right, a little over the bridge\'s low end. Remake: its tip a plain running jump (~95 px, ~50 px up) from the bridge\'s end.';
  const deckDeco = mg('walkway_1', 840, -378, 1000, 120, 9);
  c.decos.push(deckDeco);
  const deck = lineOn(deckDeco, WALKWAY_LINE, 'r8_deck', deckWhy, bounds.r - 20);
  /** The deck's surface under x (world). */
  const deckY = (x) => floorY(c.platforms.filter((p) => p.id.startsWith('plat_r8_deck_')), x);

  // A fall into the void lands on its dark floor; a vine climbs back to the arrival ledge.
  const pitWhy = 'Remake: the Snap shows only dark under the bridge (~400 px of it); a fall lands on a floor ~700 px down, out of the bridge\'s view, in the dimmed corridor floor art.';
  const pitStart = c.decos.length;
  floor(c, 'r8_pit', bounds, { top: 130, w: 900, h: 140 });
  for (const d of c.decos.slice(pitStart)) d.layer = 'bg';
  const ladderWhy = 'Remake route back from the void: a vine (firebog_ladder_tile_*_vine) from the pit floor to the arrival ledge\'s lip by the end wall; Up at its foot climbs, the ledge mounts at its top.';
  const vineX = -900;
  const vineBottom = floorY(c.platforms, vineX);
  const vineTop = -630;
  const ladders = [{ id: 'ladder_r8_vine', x: vineX, y: vineBottom, w: LADDER_W, h: vineBottom - vineTop, why: ladderWhy }];
  // Tiles up to the ledge's underside; the leafy cap tucks under its lip (the ledge art hides the rest).
  const tiles = Math.floor((vineBottom - vineTop - 100) / 120);
  for (let i = 0; i < tiles; i += 1) c.decos.push(mg('firebog_ladder_tile_center_01_vine', vineX, vineBottom - i * 120, 44, 122, 4));
  c.decos.push(mg('firebog_ladder_tile_cap_1_vine', vineX, vineTop + 122, 44, 122, 4));

  // The key: "Contains a Teal-Red Hexagon Key" (W rooms table; W Key: once per instance). The Snap has it on the deck.
  const keyWhy = 'W rooms table: Room 8 "Contains a Teal-Red Hexagon Key" (door_key_4, opens Room 15 in C4E); W Key spawn table "Challenge Room 8, once per instance". Snap PUVTECCNR7S22RU: the key lies on the deck\'s planks under the Way Out sign. Remake: one a game day.';
  const keyX = 690;
  const keyFloor = deckY(keyX);

  // The way out: the trunk's hollow at the deck's far end.
  const doorWhy = 'T: Room 8\'s door is one way, into Corridor Four\'s east half (left of the C6E door). Snap PUVTECCNR7S22RU: the "Way Out" plank hangs over the deck on the right, by an arched hollow in the trunk; you cross the bridge to leave.';
  const doorX = 915;
  const doorY = deckY(doorX);

  c.platforms.push(flat('r8_ceiling', bounds.l + 40, bounds.r - 40, bounds.t + 35, 'Chamber roof (solid from below).', 1));

  // Dressing, back to front.
  c.decos.push(
    // Ringed trunks hold up the ledge and the deck (the Snap's pipes under both).
    mg('legs_moss_noBase', -830, 150, 370, 690, 2, { flip: true }),
    mg('legs_moss_2', 600, 170, 480, 560, 2),
    // The tree trunk on the right, rising out of the void past the deck; its hollow is the door.
    mg('bottletree_body2', 1050, 260, 600, 1340, 3),
    // Roots and beads hanging under the arrival ledge.
    mg('hanging_braches1', -610, -560 + 330, 390, 330, 5),
    mg('hanging_braches2', -420, -585 + 230, 226, 230, 5),
    // Branches growing on the deck, their pot behind the planks.
    mg('sprout', 560, -404, 170, 180, 6),
    mg('sprout', 975, -390, 170, 180, 6, { flip: true }),
  );
  // Thorny vines: two from the ceiling to each end of the bridge (leaning in, as in the Snap), one
  // from the middle up to the right.
  const vine = (fx, fy, lean) => {
    const [x, y] = decoPoint(bridgeDeco, fx, fy);
    const len = Math.round((y - bounds.t) / Math.cos((lean * Math.PI) / 180)) + 40;
    c.decos.push(mg('vine_rope', x, y, 30, len, 7, { r: lean }));
  };
  vine(0.97, 0.3, -12);
  vine(0.86, 0.36, -10);
  vine(0.13, 0.62, 20);
  vine(0.03, 0.6, 18);
  vine(0.55, 0.62, 34);
  // Bead tassels under the planks (hanging_eggs_decor: strings of charms), their tops at the planks' undersides.
  for (const [fx, w] of [[0.9, 150], [0.76, 130], [0.12, 140]]) {
    const [x, y] = decoPoint(bridgeDeco, fx, 0.9);
    c.decos.push(mg('hanging_eggs_decor', x, y + Math.round((w * 420) / 324) - 6, w, Math.round((w * 420) / 324), 7));
  }
  // The rope-hung "Way Out" plank and the lantern over the deck.
  c.decos.push(...hangingSign(760, deckY(760) - 112, 'Way Out', { w: 200, rope: 640 }));
  c.decos.push(lantern(750, -440));

  return {
    tsid: ROOM_8_TSID,
    sourceTsid: 'LIF1FHA10312KLV',
    label: 'Room 8',
    bounds,
    platforms: c.platforms,
    barriers: barriersFor(bounds, 'r8'),
    decos: c.decos,
    // The void's backdrop: the corridor wood at a fifth of its light (the Snap's faint shapes in the dark).
    bgFilters: { tintColor: 0, tintAmount: 82 },
    ladders,
    doors: [
      {
        id: 'door_r8_wayout',
        x: doorX,
        y: doorY,
        ...DOOR,
        w: 140,
        h: 196,
        sprite: 'ground_cutaway_hollow3',
        connect: { tsid: 'LTJ10K7P3812R8F', label: 'Corridor Four', x: 290, y: -565, hub_id: '77' },
        why: `${doorWhy} Remake arrival on C4E's first floor plank (183..393), left of the C6E door (world 492).`,
      },
    ],
    spots: [],
    keyDrop: { id: 'r8_key', key: 4, x: keyX, y: keyFloor + 30, w: 120, h: 120, why: keyWhy },
    route: [arrive, bridge, deck].map((p) => ({ left: p.left, right: p.right, top: p.top, low: p.low })),
    keyRoute: [arrive, bridge, deck].map((p) => ({ left: p.left, right: p.right, top: p.top, low: p.low })),
    why: {
      room: 'W: "Room 8 || Orange-Blue Square Key || Located in C4W. Contains a Teal-Red Hexagon Key." G (2011-07): "a Teal-Red Hexagon Key to enter, which spawns in Room 8".',
      size: 'Remake: a 2000 wide chamber like Room 15 (the Snap shows about that much at ~3.2 world px a Snap px); 1150 above y 0 for the vines, 500 below for the void\'s floor (300+ under it, as BELOW_FLOOR).',
      decor: 'G110: the only Snap (PUVTECCNR7S22RU, 2012-06-22, "Ahh..! Unstable Bridge!", jtower_room_8/, reference only): arrival ledge left, bridge over a dark void, deck, trunk, key, lantern and the "Way Out" plank on the right. No deco list or geometry survives: laid out from the Snap round the archived arrival, firebog.swf street decos only.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Room 16 (LTJ11V9DK812UNL)                                            */
/* ------------------------------------------------------------------ */

/**
 * Room 16's dressing (G72), all firebog.swf street decos, laid out from the
 * Snap round the archived arrival -7,-407: the pod's mouth is the way out.
 * The corridor steps art is dropped; every flat run of the unchanged
 * platforms gets bottletree planks whose top sits on it.
 */
function room16Decos(c, outPiece) {
  const mg = (sprite, x, y, w, h, z, extra = {}) => ({ sprite, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z, r: 0, ...extra, layer: 'mg' });
  const podX = -7;
  const decos = [
    // A dark haze under the cave roof.
    mg('crosssection_underground_fill_1', 0, -640, 2400, 520, 0),
    // Golden curling vines in from both walls.
    mg('treetop_noflowers_1', -990, -640, 760, 380, 1, { r: 90 }),
    mg('treetop_noflowers_2', -990, -230, 620, 300, 1, { r: 90, flip: true }),
    mg('treetop_noflowers_3', 990, -660, 760, 340, 1, { r: -90 }),
    mg('treetop_noflowers_1', 990, -250, 620, 310, 1, { r: -90, flip: true }),
    // Ringed branch arms out of the pod's sides, mossy tips up.
    mg('legs_moss_noBase', podX + 250, -770, 170, 316, 2),
    mg('legs_moss_noBase', podX - 250, -770, 170, 316, 2, { flip: true }),
    mg('legs_moss_2', podX + 260, -560, 200, 233, 2, { r: 40 }),
    mg('legs_moss_2', podX - 260, -560, 200, 233, 2, { r: -40, flip: true }),
    // The pod, its eye holes, and the roots hanging under its mouth.
    mg('bottletree_body2', podX, -340, 560, 659, 3),
    mg('ground_cutaway_hollow1', podX - 70, -790, 58, 70, 4),
    mg('ground_cutaway_hollow1', podX + 70, -790, 58, 70, 4),
    mg('hanging_braches1', podX, outPiece.top + 240, 300, 254, 4),
    // Big ringed pipes in the lower corners.
    mg('legs_moss_back_1', -860, 300, 330, 446, 9),
    mg('legs_moss_2', 870, 300, 380, 442, 9, { flip: true }),
  ];
  for (const [x, y] of [[-330, -700], [300, -860], [-150, -930], [360, -560], [-420, -470], [170, -300], [-660, -820], [660, -720], [-560, -560], [560, -420]]) {
    decos.push(mg('fireflies', x, y, 302, 97, 5));
  }
  for (const f of flats(c.platforms)) decos.push(mg('platform_bottletree_flat', (f.x1 + f.x2) / 2, f.y + 22, f.x2 - f.x1 + 24, 30, 7));
  return decos;
}

function buildRoom16() {
  const c = collector();
  const bounds = { l: -1000, r: 1000, t: -1000, b: BELOW_FLOOR };
  floor(c, 'r16', bounds, { top: -160, w: 900, h: 140 });

  // Way out: the arrival is the middle of the room, so the door ledge floats there.
  const doorWhy = 'Arrival -7,-407 from Corridor Six door_1304678594665 (archived, key 6); the way out stands where you arrive, in the middle of the room.';
  const outPiece = c.add(stepsPiece('r16_wayout', 125, -407, 440, 70, { why: doorWhy, z: 7 }));
  c.platforms.push(flat('r16_wayout_lip', outPiece.left - 110, outPiece.left + 15, -407, doorWhy));

  const climbWhy = 'Remake route: ledges from the floor up to the way-out ledge\'s low end, 75 px apart (one plain jump each).';
  const route = climb(c, 'r16_climb', [
    [380, -190, 200, false],
    [600, -265, 200, true],
    [380, -340, 200, false],
  ], climbWhy);
  route.push(outPiece);

  // Spinach, and the key it reaches: "Contains Spinach, which is used to get a Red-Green Triangle Key" (W).
  const keyWhy = 'W rooms table: Room 16 "Contains Spinach, which is used to get a Red-Green Triangle Key" (door_key_5, opens Room 23 in C5); W Key spawn table "Challenge Room 16, once per instance". Remake: one a game day on a high shelf 245 px over the top of the last left ledge (plain jump apex 110 px, spinach 296).';
  const left = climb(c, 'r16_left', [
    [-640, -190, 200, false],
    [-420, -265, 200, true],
    [-640, -340, 200, false],
    [-420, -415, 200, true],
  ], climbWhy);
  const launch = left[left.length - 1];
  const shelf = c.add(stepsPiece('r16_key_shelf', -760, -660, 260, 50, { why: keyWhy, z: 7 }));
  // A spinach jump carries you fast: the shelf runs on to the end wall so an overshoot still lands.
  c.platforms.push(flat('r16_key_shelf_lip', bounds.l + 20, shelf.left + 15, shelf.top + Math.round(0.06 * 50), keyWhy));
  const shelfX = Math.round(shelf.left + 0.2 * (shelf.right - shelf.left));

  const spinachWhy = 'W rooms table: Room 16 "Contains Spinach" (count not recorded). Remake: three on the floor, back once a game day, so a missed jump can be tried again.';
  const items = [{ id: 'r16_spinach', cls: 'spinach', label: 'Spinach', count: 3, x: -260, y: floorY(c.platforms, -260), why: spinachWhy }];

  c.platforms.push(flat('r16_ceiling', bounds.l + 40, bounds.r - 40, bounds.t + 35, 'Chamber roof (solid from below).', 1));

  const decos = room16Decos(c, outPiece);

  return {
    tsid: ROOM_16_TSID,
    sourceTsid: 'LTJ11V9DK812UNL',
    label: 'Room 16',
    bounds,
    platforms: c.platforms,
    barriers: barriersFor(bounds, 'r16'),
    decos,
    ladders: [],
    doors: [
      {
        id: 'door_r16_wayout',
        x: -7,
        y: -407,
        ...DOOR,
        // G72: the Snap shows the way out as the pod's mouth, a dark hollow (firebog ground_cutaway_hollow1).
        // G97: drawn from tools/room-art's render at the door's own size (`src`), so it is sharp; `sprite`
        // stays the street deco (the doors feature's fallback and the deco checks).
        sprite: 'ground_cutaway_hollow1',
        src: `${TOWER_ROOM_16_ART_ROOT}${TOWER_ROOM_16_FILES.ground_cutaway_hollow1[0]}`,
        connect: { tsid: 'LTJ110817812KO4', label: 'Corridor Six', x: 984, y: -467, hub_id: '77' },
        why: 'Back through C6W\'s Room 16 door (world 984,-467), the way you came in.',
      },
    ],
    spots: [],
    items,
    keyDrop: { id: 'r16_key', key: 5, x: shelfX, y: shelf.top + 30, w: 120, h: 120, why: keyWhy },
    route: route.map((p) => ({ left: p.left, right: p.right, top: p.top, low: p.low })),
    keyRoute: [...left, shelf].map((p) => ({ left: p.left, right: p.right, top: p.top, low: p.low })),
    launch: { left: launch.left, right: launch.right, top: launch.top, low: launch.low },
    why: {
      room: 'W: "Room 16 || Purple-Orange Circle Key || Located in C6W. Contains Spinach, which is used to get a Red-Green Triangle Key."',
      size: 'Remake: a 2000 wide chamber like Room 15, 1000 above y 0; the arrival -7,-407 is its middle.',
      decor: 'G72: Corridor Six\'s archived door into Room 16 carries swf_file_versioned .../locations/firebog/1331248191.swf (streets GTJ110817812KO4.xml), and a player Snap (2012-11-20, "in the mouth of weirdness", jtower_room_16/, reference only) shows a black cave round a huge wooden bottletree pod: two round eye holes, the avatar standing in its arched mouth on hanging roots, ringed branch arms with mossy tips, golden curling vines from the edges, fireflies, big ringed pipes in the lower corners. All firebog.swf street decos (bottletree_body2, ground_cutaway_hollow1, legs_moss_*, treetop_noflowers_*, hanging_braches1, fireflies, platform_bottletree_flat). No deco list survives: laid out from the Snap round the archived arrival (the mouth is the way out); every ledge keeps its platforms, dressed in bottletree planks along its flat runs.',
    },
  };
}

export const CHALLENGE_ROOMS = Object.freeze([buildRoom4(), buildRoom8(), buildRoom16()]);

/** The corridor doors that lead into the challenge rooms (archived ids). */
export const CHALLENGE_ROOM_DOOR_LINKS = Object.freeze([
  { street: 'GIF1Q3IQM7122SP', door: 'door_1304676445973', room: ROOM_4_TSID },
  { street: 'GTJ10K7P3812R8F', door: 'door_1304677515848', room: ROOM_8_TSID },
  { street: 'GTJ110817812KO4', door: 'door_1304678594665', room: ROOM_16_TSID },
]);

/** Every rebuilt Jethimadh Tower Base room (Room 15, Ventilation Room, Rooms 4, 8, 16). */
export const ALL_TOWER_ROOMS = Object.freeze([...TOWER_ROOMS, ...CHALLENGE_ROOMS]);

export const anyTowerRoomByTsid = (tsid) => ALL_TOWER_ROOMS.find((room) => room.tsid === tsid || room.sourceTsid === tsid) || null;

const strip = ({ why, ...rest }) => rest;

/** The street JSON for any rebuilt room: tower-rooms.js's format plus ladders. */
export function anyTowerRoomStreet(room) {
  const street = towerRoomStreet(room);
  if (room.swf) street.swf_file = room.swf;
  if (room.gradient) street.gradient = { ...room.gradient };
  if (room.ladders?.length) {
    street.ladders = room.ladders.map(strip);
    street.stats.ladderCount = street.ladders.length;
  }
  // A door drawn from its own render (Room 16's mouth, G97) carries the file as `src`.
  room.doors.forEach((d, i) => {
    if (d.src) street.doors[i].src = d.src;
  });
  return street;
}

/** The index.json row for any rebuilt room (ladders add no counts). */
export const anyTowerRoomIndexEntry = towerRoomIndexEntry;
