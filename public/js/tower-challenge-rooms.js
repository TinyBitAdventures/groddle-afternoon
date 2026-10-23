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
 * Art is only the corridors' own CC0 set (firebog.swf jethimadh_int_*,
 * jethimadh_frame_*, the corridors' ladder and decor_plants pieces,
 * door_asset_jethimadh_int); no pixels from screenshots or video.
 *
 * tools/build-tower-rooms.mjs writes all five rooms' street JSON. The shell,
 * ladder, plaque, lantern and wall helpers are exported for js/tower-mid-rooms.js.
 */

import { stepsPiece, TOWER_ROOMS, towerRoomIndexEntry, towerRoomStreet } from './tower-rooms.js?v=tower-rooms-1';

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

function buildRoom4() {
  const c = collector();
  const bounds = { l: -1300, r: 1300, t: -2100, b: BELOW_FLOOR };
  c.decos.push(...shell(bounds));

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

  // Six drinks on the floor either side of the garden.
  const drinkWhy = 'W rooms table: "six different drinks: Cosma-politan, Gurly Drink, Pungent Sunrise, Savory Smoothie, Too-Berry Shake, and Slow Gin Fizz"; F 3343 "I drank the drinks". One of each on the floor, back once a game day after you take it.';
  const drinkX = [-640, -470, -300, 300, 470, 640];
  const items = ROOM_4_DRINKS.map((d, i) => ({ id: `r4_${d.cls}`, cls: d.cls, label: d.label, count: 1, x: drinkX[i], y: floorY(c.platforms, drinkX[i]), why: drinkWhy }));

  // "purty" (F 3343): the corridors' plant pots and baskets (C3, C6) round the garden, lanterns up the walls.
  c.decos.push(
    { sprite: 'decor_plants6', x: -200, y: fl.mid + 4, w: 217, h: 157, z: 4, r: 0, layer: 'fg' },
    { sprite: 'decor_plants1', x: 200, y: fl.mid + 4, w: 160, h: 163, z: 4, r: 0, layer: 'fg' },
    { sprite: 'decor_plants4', x: -980, y: -150, w: 200, h: 143, z: 4, r: 0, layer: 'fg' },
    { sprite: 'decor_plants3', x: 980, y: -150, w: 174, h: 147, z: 4, r: 0, layer: 'fg' },
    { sprite: 'decor_plants_basket', x: 1100, y: -158, w: 165, h: 65, z: 5, r: 0, layer: 'fg' },
    { sprite: 'decor_plants_basket', x: -560, y: -1700, w: 165, h: 65, z: 5, r: 0, layer: 'fg' },
    { sprite: 'firebog_light_pool', x: 0, y: fl.mid + 30, w: 640, h: 146, z: 3, r: 0, layer: 'mg' },
  );
  for (const [x, y] of [[-420, -380], [420, -380], [-1020, -900], [600, -1000], [-300, -1450], [700, -1750]]) c.decos.push(lantern(x, y, y > -500));
  c.decos.push(
    { sprite: 'jethimadh_int_pillar_1_mod', x: -420, y: -96, w: 230, h: 860, z: 5, r: 0, flip: true, layer: 'fg' },
    { sprite: 'jethimadh_int_pillar_1', x: 420, y: -96, w: 230, h: 860, z: 6, r: 0, layer: 'fg' },
  );
  plaque(c, -900, -1733, 'Way Out');

  c.platforms.push(flat('r4_ceiling', bounds.l + 40, bounds.r - 40, bounds.t + 35, 'Chamber roof (solid from below).', 1));

  return {
    tsid: ROOM_4_TSID,
    sourceTsid: 'LIF1Q6PMN7123NQ',
    label: 'Room 4',
    bounds,
    platforms: c.platforms,
    barriers: barriersFor(bounds, 'r4'),
    decos: c.decos,
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
      decor: 'F 3343 Room 4 "my was it purty": the corridors\' decor_plants pots and basket (C3, C6) round the garden and a light pool under it.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Room 8 (LIF1FHA10312KLV)                                             */
/* ------------------------------------------------------------------ */

function buildRoom8() {
  const c = collector();
  const bounds = { l: -1000, r: 1000, t: -1000, b: BELOW_FLOOR };
  c.decos.push(...shell(bounds));
  floor(c, 'r8', bounds, { top: -160, w: 900, h: 140 });

  const doorWhy = 'Arrival -736,-630 from Corridor Four door_1304677515848 (archived, key 3). T: Room 8\'s door is one way, into Corridor Four\'s east half (left of the C6E door), so it stands where you arrive and leads on, not back.';
  const out = wayOut(c, 'r8', bounds, -736, -630, 560, 80, doorWhy);

  const climbWhy = 'Remake route: ledges from the floor back up to the way out, 75 px apart (one plain jump each), low ends facing.';
  const route = climb(c, 'r8_climb', [
    [-420, -190, 200, false],
    [-170, -265, 200, true],
    [-420, -340, 200, false],
    [-170, -415, 200, true],
    [-420, -490, 200, false],
    [-170, -565, 200, true],
  ], climbWhy);
  route.push(out);

  // The key course: "Contains a Teal-Red Hexagon Key" (W rooms table; W Key: once per instance).
  const keyWhy = 'W rooms table: Room 8 "Contains a Teal-Red Hexagon Key" (door_key_4, opens Room 15 in C4E); W Key spawn table "Challenge Room 8, once per instance". Remake: one a game day on a shelf at the top of a climb up the right side.';
  const keyRoute = climb(c, 'r8_key', [
    [430, -205, 200, false],
    [680, -280, 200, true],
    [430, -355, 200, false],
    [680, -430, 200, true],
    [430, -505, 200, false],
    [680, -580, 200, true],
  ], keyWhy);
  const shelf = c.add(stepsPiece('r8_key_shelf', 430, -655, 260, 50, { why: keyWhy }));
  keyRoute.push(shelf);
  const shelfX = Math.round(shelf.left + 0.2 * (shelf.right - shelf.left));

  c.platforms.push(flat('r8_ceiling', bounds.l + 40, bounds.r - 40, bounds.t + 35, 'Chamber roof (solid from below).', 1));

  c.decos.push(
    lantern(-300, -330, true),
    lantern(300, -330, true),
    lantern(-760, -560),
    lantern(820, -760),
    { sprite: 'jethimadh_int_pillar_1_mod', x: 0, y: -96, w: 230, h: 860, z: 5, r: 0, flip: true, layer: 'fg' },
    { sprite: 'blotch_outer', x: -520, y: -720, w: 272, h: 130, z: 4, r: 0, layer: 'mg' },
    { sprite: 'blotch_inner', x: 560, y: -860, w: 240, h: 120, z: 4, r: 0, layer: 'mg' },
  );
  plaque(c, -560, -662, 'Way Out');

  return {
    tsid: ROOM_8_TSID,
    sourceTsid: 'LIF1FHA10312KLV',
    label: 'Room 8',
    bounds,
    platforms: c.platforms,
    barriers: barriersFor(bounds, 'r8'),
    decos: c.decos,
    ladders: [],
    doors: [
      {
        id: 'door_r8_wayout',
        x: -736,
        y: -630,
        ...DOOR,
        connect: { tsid: 'LTJ10K7P3812R8F', label: 'Corridor Four', x: 290, y: -565, hub_id: '77' },
        why: 'T: one way into Corridor Four\'s east half, left of the C6E door (world 492); remake arrival on its first floor plank (183..393).',
      },
    ],
    spots: [],
    keyDrop: { id: 'r8_key', key: 4, x: shelfX, y: shelf.top + 30, w: 120, h: 120, why: keyWhy },
    route: route.map((p) => ({ left: p.left, right: p.right, top: p.top, low: p.low })),
    keyRoute: keyRoute.map((p) => ({ left: p.left, right: p.right, top: p.top, low: p.low })),
    why: {
      room: 'W: "Room 8 || Orange-Blue Square Key || Located in C4W. Contains a Teal-Red Hexagon Key." G (2011-07): "a Teal-Red Hexagon Key to enter, which spawns in Room 8".',
      size: 'Remake: a 2000 wide chamber like Room 15, 1000 above y 0; the arrival x -736 sits inside -1000..1000.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Room 16 (LTJ11V9DK812UNL)                                            */
/* ------------------------------------------------------------------ */

function buildRoom16() {
  const c = collector();
  const bounds = { l: -1000, r: 1000, t: -1000, b: BELOW_FLOOR };
  c.decos.push(...shell(bounds));
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

  c.decos.push(
    lantern(-300, -330, true),
    lantern(340, -330, true),
    lantern(800, -620),
    lantern(-200, -760),
    { sprite: 'jethimadh_int_pillar_1', x: 220, y: -96, w: 230, h: 860, z: 6, r: 0, layer: 'fg' },
    { sprite: 'blotch_outer', x: -760, y: -800, w: 272, h: 130, z: 4, r: 0, layer: 'mg' },
    { sprite: 'blotch_inner', x: 520, y: -720, w: 240, h: 120, z: 4, r: 0, layer: 'mg' },
  );
  plaque(c, 140, -440, 'Way Out');

  return {
    tsid: ROOM_16_TSID,
    sourceTsid: 'LTJ11V9DK812UNL',
    label: 'Room 16',
    bounds,
    platforms: c.platforms,
    barriers: barriersFor(bounds, 'r16'),
    decos: c.decos,
    ladders: [],
    doors: [
      {
        id: 'door_r16_wayout',
        x: -7,
        y: -407,
        ...DOOR,
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
  if (room.ladders?.length) {
    street.ladders = room.ladders.map(strip);
    street.stats.ladderCount = street.ladders.length;
  }
  return street;
}

/** The index.json row for any rebuilt room (ladders add no counts). */
export const anyTowerRoomIndexEntry = towerRoomIndexEntry;
