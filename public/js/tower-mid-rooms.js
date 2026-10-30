/**
 * Jethimadh Tower: Mid (hub 96): the Stairs and the Mezzanine, rebuilt (pure
 * data and a builder: no Pixi, no DOM). The Museum of the Rook itself is the
 * transient quest instance in game.js (js/rook-museum.js, production template
 * LA91BDTNHS82D36); these two streets are the walk to it.
 *
 * Neither street is in the public locations dump. What survives:
 *   inc_data_maps_prod.js hub 96 "Jethimadh Tower: Mid": LIFFUV4ATQ72I6D
 *     "Stairs", LIFGJ2246R72LJL "Mezzanine", LIFH35R0HR72BHV "Rook Museum",
 *     LIFPV9EMLT72DP4 "unnnn", LA9L33D5CNE3I0J "Hall of Rejected Concepts".
 *   Tower St West's archived door door_1313235999202 (the tower's back door,
 *     world -37,-197) -> Stairs, arriving at -2463,-191.
 *   unnnn (the Stoot Shrine, imported as GIFPV9EMLT72DP4) was cloned from the
 *     Mezzanine: its G XML has `sources { LIFGJ2246R72LJL: 1 }`. Its two
 *     archived deco layers (T_1311832165202 spotlights, T_1311832941302
 *     shadows) carry deco ids from 2011-07-28, the Mezzanine's build week
 *     (the museum opened in the 2011-08-11 test), and are street-sized, so they
 *     scroll with the middleground: the Mezzanine keeps them at the same world
 *     positions. Its bounds (-500..500, -700..0) and floor (y -12) are the
 *     clone's too.
 *   GSJS items/npc_quest_giver_widget.js: Greeterbot Sentry G-42, variant
 *     widgetWood, its no-quest line, the hall_repeat conversation and
 *     enterHall (instance LA91BDTNHS82D36, arrival -2270,-136).
 * Player record, each element carrying a `why`:
 *   B  Glitch Strategy beta recap 2011-08-19: "visit Tower St. West, climb the
 *      Stairs to reach the Mezzanine, and enter the door to the Rook museum";
 *      "the locked door to the Hall of Records (next door)".
 *   N  Glitch blog 2011-08-23 "Getting around": "Enter the Tower via the giant
 *      door on Tower St. West in Jethimadh, and ascend the stairway to the
 *      Mezzanine. If you have been chosen, you will be invited to enter the
 *      Rook Museum."
 *   H  Glitch Strategy "Guide to Hidden Locations" (2011-12): "in the lobby to
 *      the Rook Museum, you'll find (with a little investigation) an entrance
 *      to below the floorboards"; comment: "Left + Up + Space".
 *   F  Forum 13777 "Unnnn": "the hidden space under the floor in Jethimadh
 *      mezzanine"; "Head left (when you're in the floor space) and take
 *      spinach"; "just keep jumping, pressing left". Forum 29729 (2012-11):
 *      the Hall of Rejected Concepts "next to the Rook Museum".
 *   V  Two player recordings of the Hall (reference-videos/raw/-03T3bLY7a0,
 *      E6BIN3OfEkI): the Mezzanine's Hall door under a "Hall of Rejected
 *      Concepts" plaque; the Hall itself is js/hall-rejected-concepts.js.
 * Art is the tower's own CC0 set (firebog.swf jethimadh_int_*, frame, ladder,
 * lock door; the Rook Hall spotlights) and the Greeterbot's own SWF
 * (glitch-items inhabitants/widget_bot npc_widget.swf, symbol widgetWood,
 * frame 1 exported at 2x); no pixels from screenshots or video.
 *
 * tools/build-tower-rooms.mjs writes the three street JSON files (Stairs,
 * Mezzanine, Hall of Rejected Concepts) with the base tower rooms and links
 * Tower St West's door.
 */

import { towerRoomIndexEntry } from './tower-rooms.js?v=7b2aa06a';
import { DOOR, anyTowerRoomStreet, barriersFor, collector, flat, ladder, lantern, plaque, shell } from './tower-challenge-rooms.js?v=9e39f503';
import { HALL, HALL_TSID, buildHall } from './hall-rejected-concepts.js?v=fc452e86';

export const STAIRS_TSID = 'GIFFUV4ATQ72I6D';
export const MEZZANINE_TSID = 'GIFGJ2246R72LJL';
export const STOOT_SHRINE_TSID = 'GIFPV9EMLT72DP4';
export const TOWER_ST_WEST_TSID = 'GIF5UU8FO3029OK';
export { HALL_TSID };
export const MID_TOWER_HUB = Object.freeze({ hubId: '96', hubName: 'Jethimadh Tower: Mid' });
export const MID_TOWER_SOURCE = 'reconstruction: Jethimadh Tower Mid (not in tinyspeck/glitch-locations); doors, names and the Mezzanine\'s clone data from the archive, the rest from player records; art from the tower\'s CC0 set';

/** Greeterbot Sentry G-42 (GSJS npc_quest_giver_widget). */
export const GREETERBOT = Object.freeze({
  classId: 'npc_quest_giver_widget',
  label: 'Greeterbot Sentry G-42',
  variant: 'widgetWood',
  art: 'assets/sprites/quests/rook-museum/greeterbot_widgetWood_idle@2x.png',
  // npc_quest_giver_widget classProps.no_quest_text (overrides npc_quest_widget's).
  noQuestText: 'I\'m afraid one cannot simply enter the Museum of the Rook on a whim, little Glitch. One must be called to do so.',
  // conversation_run_hall_repeat, offered once rook_hall is done.
  repeatQuestion: 'Would you like to return to the Museum of the Rook, in order to review its artifacts?',
  repeatYes: 'Yes.',
  repeatNo: 'No.',
  repeatDeclined: 'Very well then. Please speak with me again if you are ever so inclined.',
  repeatDeclinedResponse: 'Will do.',
});

export const MUSEUM_DOOR_ID = 'door_mezz_museum';
export const STOOT_TELEPORTER_ID = 'mezz_stoot_teleporter';

/* ------------------------------------------------------------------ */
/* Stairs (LIFFUV4ATQ72I6D)                                             */
/* ------------------------------------------------------------------ */

/**
 * Corridor Four (GTJ10K7P3812R8F), the archived corridor that climbs: its
 * floor and roof platforms [x1, y1, x2, y2, pc_perm] and its middleground and
 * FG decos [layer, sprite, x, y, w, h, z, r, flip] in world space. The C4
 * door plaques and the east/west divider (frame_wall_left, divider_middle)
 * are left out: they belong to C4's own doors and halves.
 */
const C4_PLATFORMS = Object.freeze([
  [-1675, -411, -1339, -409, -1], [-1339, -409, -1314, -427, -1], [-1314, -427, -1173, -430, -1], [-1173, -430, -1144, -451, -1],
  [-1144, -451, -866, -453, -1], [-866, -453, -839, -474, -1], [-839, -474, -658, -479, -1], [-658, -479, -617, -509, -1],
  [-617, -509, -534, -508, -1], [-534, -508, -385, -506, -1], [-385, -506, -354, -527, -1], [-354, -527, -72, -527, -1],
  [-72, -527, -49, -543, -1], [-49, -543, 26, -542, -1], [183, -561, 393, -569, -1], [393, -569, 425, -590, -1],
  [425, -590, 601, -597, -1], [601, -597, 636, -628, -1], [636, -628, 860, -627, -1], [860, -627, 892, -647, -1],
  [892, -647, 1174, -648, -1], [1174, -648, 1200, -665, -1], [1200, -665, 1344, -668, -1], [1344, -668, 1372, -684, -1],
  [1372, -684, 1599, -684, -1],
  [-1675, -702, -1537, -811, 1], [-1537, -811, -1217, -914, 1], [-1217, -914, -483, -995, 1], [-483, -995, 21, -1036, 1],
  [21, -1036, 760, -1084, 1], [760, -1084, 1084, -1093, 1], [1084, -1093, 1191, -1100, 1], [1191, -1100, 1367, -1083, 1],
  [1367, -1083, 1494, -1043, 1], [1494, -1043, 1599, -964, 1],
]);

const C4_DECOS = Object.freeze([
  ['mg', 'jethimadh_int_bg_right', 1043, -518, 1291, 625, 0, -5, false],
  ['mg', 'jethimadh_int_bg_left', -1026, -333, 1312, 615, 1, -5, false],
  ['mg', 'jethimadh_int_bg_center', 20, -425, 964, 629, 2, -5, false],
  ['mg', 'jethimadh_int_bg_shadow_50percent', -22, -445, 3346, 583, 3, -5, false],
  ['mg', 'jethimadh_int_steps_1', -929, -307, 1645, 230, 4, 0, true],
  ['mg', 'jethimadh_int_steps_1', 334, -427, 1645, 230, 5, 0, true],
  ['mg', 'jethimadh_int_steps_1', 1586, -542, 1645, 230, 8, 0, true],
  ['fg', 'jethimadh_int_lantern_1', 502, -535, 353, 533, 0, 0, false],
  ['fg', 'jethimadh_int_lantern_1', -207, -480, 353, 533, 1, 0, false],
  ['fg', 'jethimadh_int_lantern_1', -1013, -399, 353, 533, 3, 0, false],
  ['fg', 'jethimadh_int_lantern_1', 1318, -568, 353, 533, 4, 0, false],
  ['fg', 'jethimadh_int_pillar_1', 1056, -586, 185, 530, 5, 0, false],
  ['fg', 'jethimadh_int_pillar_1_mod', -1393, -355, 192, 550, 6, 0, true],
  ['fg', 'jethimadh_int_pillar_1_mod', -694, -422, 202, 579, 7, 0, true],
  ['fg', 'jethimadh_int_frame_50percent', -18, -412, 3419, 645, 8, -5, false],
]);

/** Corridor Four's floor start and end (its first and last floor points). */
const C4_LOW = Object.freeze({ x: -1675, y: -411 });
const C4_HIGH = Object.freeze({ x: 1599, y: -684 });

/**
 * One flight: Corridor Four moved by (dx, dy), mirrored (it climbs to the
 * left) when `mirror`. Mirroring negates x, swaps each segment's ends, flips
 * every deco and negates its rotation.
 */
function flight(c, id, { dx, dy, mirror = false, why, zBase = 0 }) {
  const mx = (x) => (mirror ? -x : x) + dx;
  C4_PLATFORMS.forEach(([x1, y1, x2, y2, pc], i) => {
    const a = { x: mx(x1), y: y1 + dy };
    const b = { x: mx(x2), y: y2 + dy };
    const [p, q] = a.x <= b.x ? [a, b] : [b, a];
    c.platforms.push({ id: `plat_${id}_${String(i).padStart(2, '0')}`, x1: p.x, y1: p.y, x2: q.x, y2: q.y, pc_perm: pc, why });
  });
  // C4 splits into halves with a wall slab between x 26 and 183 (walls
  // 1304666165704/5); the Stairs have no halves, so a step bridges the slot.
  {
    const a = { x: mx(26), y: -542 + dy };
    const b = { x: mx(183), y: -561 + dy };
    const [p, q] = a.x <= b.x ? [a, b] : [b, a];
    c.platforms.push({ id: `plat_${id}_bridge`, x1: p.x, y1: p.y, x2: q.x, y2: q.y, pc_perm: -1, why: `${why} Corridor Four's east/west wall slot (x 26-183) is bridged.` });
  }
  for (const [layer, sprite, x, y, w, h, z, r, flip] of C4_DECOS) {
    const deco = { sprite, x: mx(x), y: y + dy, w, h, z: z + zBase, r: mirror && r ? -r : r, layer };
    if (flip !== mirror) deco.flip = true;
    c.decos.push(deco);
  }
  return { low: { x: mx(C4_LOW.x), y: C4_LOW.y + dy }, high: { x: mx(C4_HIGH.x), y: C4_HIGH.y + dy } };
}

/** Stairs layout: the archived arrival, two flights, the landing ladder, the top landing. */
export const STAIRS = Object.freeze({
  bounds: Object.freeze({ l: -2750, r: 1400, t: -1700, b: 210 }),
  arrival: Object.freeze({ x: -2463, y: -191 }),
  flight1: Object.freeze({ dx: -885, dy: 220 }),
  flight2: Object.freeze({ dx: -525, dy: -473 }),
  ladderX: 1250,
  mezzDoorX: -2450,
});

function buildStairs() {
  const c = collector();
  const { bounds, arrival, ladderX, mezzDoorX } = STAIRS;

  // Flight 1: Corridor Four placed so its first floor platform (-1675,-411)
  // carries the archived arrival from Tower St West (-2463,-191).
  const f1Why = 'Corridor Four\'s floor and roof (the archived corridor that climbs, firebog.swf steps art), moved so its first flat carries the archived arrival -2463,-191; B/N "climb the Stairs", "ascend the stairway".';
  const f1 = flight(c, 'st_f1', { ...STAIRS.flight1, why: f1Why });
  // Flight 2: the same corridor mirrored, climbing back to the left 420 px over the landing.
  const f2Why = 'Corridor Four mirrored: the second flight climbs back to the left above the first (a switchback stairwell, remake layout), its roof the stairwell top.';
  const f2 = flight(c, 'st_f2', { ...STAIRS.flight2, mirror: true, why: f2Why, zBase: 20 });

  // Bottom lip from the end wall to the first flight, where you arrive.
  const doorWhy = 'Archived: Tower St West door_1313235999202 (the tower\'s back door at world -37,-197) arrives at -2463,-191; the way back out stands there.';
  c.platforms.push(flat('st_bottom_lip', bounds.l + 32, f1.low.x, arrival.y, doorWhy));

  // Landing at the top of flight 1, a corridor ladder up to flight 2's lip.
  const landWhy = 'Remake route: a landing at the top of the first flight and a corridor ladder (C1/C2 art) 420 px up to the second flight.';
  c.platforms.push(flat('st_landing', f1.high.x, bounds.r - 32, f1.high.y, landWhy));
  c.platforms.push(flat('st_upper_lip', f2.low.x, bounds.r - 32, f2.low.y, landWhy));
  const ladders = [ladder(c, 'st', ladderX, f1.high.y, f2.low.y, landWhy)];

  // Top landing: from flight 2's high end to the end wall, the Mezzanine door on it.
  const topWhy = 'B "climb the Stairs to reach the Mezzanine": the top landing holds the door up to the Mezzanine (remake placement).';
  c.platforms.push(flat('st_top_lip', bounds.l + 32, f2.high.x, f2.high.y, topWhy));

  // Backdrop behind the landing shaft and both end walls (the corridors' wood and frame).
  c.decos.push(
    { sprite: 'jethimadh_int_bg_center', x: 1050, y: f1.high.y + 90, w: 700, h: 1100, z: 0, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_int_bg_shadow_50percent', x: 1050, y: f1.high.y + 60, w: 760, h: 1000, z: 1, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_int_bg_left', x: -2520, y: arrival.y + 120, w: 600, h: 1500, z: 0, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_frame_cap', x: -2700, y: bounds.b, w: 300, h: bounds.b - bounds.t, z: 9, r: 0, layer: 'fg' },
    { sprite: 'jethimadh_frame_cap', x: 1350, y: bounds.b, w: 300, h: bounds.b - bounds.t, z: 9, r: 0, flip: true, layer: 'fg' },
    lantern(1050, f1.high.y - 120),
    lantern(-2300, f2.high.y - 120),
  );
  // Plaques beside the doors at mid height, as the corridors hang theirs. G72:
  // a player Snap of the Stairs (jtower_stairs/, reference only) shows the
  // arched door at the low end with an "EXIT" plaque beside it; both plaques
  // sit in front of the second flight's backdrop (z 40+), which hid them. The
  // EXIT plaque hangs just past flight 1's first pillar (x -2278, FG), which
  // stands where the corridors' plaque spot would be.
  plaque(c, arrival.x + 380, arrival.y - 70, 'EXIT');
  plaque(c, mezzDoorX + 190, f2.high.y - 70, 'Mezzanine');
  for (const d of c.decos) if (d.sprite === 'jethimadh_int_door_sign' || d.sprite === 'firebog_sign_blank') d.z += 30;
  c.platforms.push(flat('st_ceiling', bounds.l + 40, bounds.r - 40, bounds.t + 35, 'Stairwell roof (solid from below).', 1));

  return {
    tsid: STAIRS_TSID,
    sourceTsid: 'LIFFUV4ATQ72I6D',
    label: 'Stairs',
    hub: MID_TOWER_HUB,
    bounds,
    platforms: c.platforms,
    barriers: barriersFor(bounds, 'st'),
    decos: c.decos,
    ladders,
    doors: [
      {
        id: 'door_st_tower_st_west',
        x: arrival.x,
        y: arrival.y,
        ...DOOR,
        connect: { tsid: 'LIF5UU8FO3029OK', label: 'Tower St West', x: -37, y: -197, hub_id: '71' },
        why: doorWhy,
      },
      {
        id: 'door_st_mezzanine',
        x: mezzDoorX,
        y: f2.high.y,
        ...DOOR,
        connect: { tsid: 'LIFGJ2246R72LJL', label: 'Mezzanine', x: MEZZ.stairsDoorX, y: MEZZ.floor, hub_id: '96' },
        why: topWhy,
      },
    ],
    spots: [],
    flights: { f1, f2 },
    why: {
      room: 'Maps: LIFFUV4ATQ72I6D "Stairs" in hub 96 "Jethimadh Tower: Mid". B: "visit Tower St. West, climb the Stairs to reach the Mezzanine". N: "Enter the Tower via the giant door on Tower St. West ... and ascend the stairway to the Mezzanine."',
      size: 'Remake: the arrival x -2463 puts the door near the left end, so the street starts at -2750; two Corridor Four flights (each 3274 wide, 273 up) stacked as a switchback reach 1157 px over the arrival. 300+ px of world under the lowest floor (b 210) like the base rooms.',
      decor: 'G72: Tower St West\'s archived door into the Stairs carries swf_file_versioned .../locations/firebog/1316548751.swf (streets GIF5UU8FO3029OK.xml), the corridors\' bundle, and a player Snap (2012-12-09, jtower_stairs/, reference only) shows the corridor set itself: a tilted curved wooden tube (jethimadh_int_bg_*), stepped sliced-tree "pews" (jethimadh_int_steps_1), a spotted pillar (jethimadh_int_pillar_1), a hanging lantern (jethimadh_int_lantern_1), the arched door (door_asset_jethimadh_int) with an EXIT plaque. So the Corridor Four flights stay; the low door\'s plaque reads EXIT and both plaques are lifted in front of the second flight. A second Snap (2012-06, Ancient filter) is too blurred to read.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Mezzanine (LIFGJ2246R72LJL)                                          */
/* ------------------------------------------------------------------ */

/** Mezzanine layout (world). Bounds l/r/t and the lobby floor are unnnn's clone data. */
export const MEZZ = Object.freeze({
  bounds: Object.freeze({ l: -500, r: 500, t: -700, b: 700 }),
  floor: -12,
  underside: 0,
  crawl: 290,
  ceiling: -665,
  shaftL: 400,
  stairsDoorX: -380,
  // G88 footage: the Greeterbot stands in front of the museum door, a little left of its middle.
  greeterX: 70,
  museumDoorX: 90,
  hallDoorX: 300,
  ladderX: 434,
});

/**
 * The Mezzanine's sign words (G88, footage i11hPtqFN8E t0000-t0004): the EXIT
 * arrow right of the Stairs door, pointing back to it, and the "Rook Museum"
 * plaque left of the museum door. x world; lift = sign bottom over the floor.
 */
export const MEZZ_SIGNS = Object.freeze([
  Object.freeze({ id: 'exit', text: 'EXIT', arrow: true, x: -220, lift: 128 }),
  Object.freeze({ id: 'rook_museum', text: 'Rook\nMuseum', arrow: false, x: -85, lift: 86 }),
]);

/** unnnn's two archived layers (layer-local, street-sized: world = local + (l, t) = local - (500, 700)). */
const UNNNN_SPOTLIGHTS = Object.freeze([
  [195, 294, 405, 337, 90, 8, false], [1088, -44, 176, 630, -117, 6, false], [-55, 295, 176, 630, -271, 1, false],
  [495, -335, 176, 630, -181, 3, false], [1015, 540, 176, 630, -61, 5, false], [49, 618, 176, 630, -308, 4, false],
  [1115, 260, 176, 630, -91, 0, false], [521, 560, 557, 398, 0, 7, false], [-52, -74, 176, 630, -238, 2, false],
  [820, 294, 405, 337, -90, 9, true], [506, -81, 557, 451, -180, 10, false],
]);
const UNNNN_SHADOWS = Object.freeze([
  [84, 703, 331, 1114, 0, 2, false], [924, 703, 331, 1114, 0, 1, true],
]);

function buildMezzanine() {
  const c = collector();
  const { bounds, floor, underside, crawl, ceiling, shaftL, stairsDoorX, museumDoorX, hallDoorX, ladderX } = MEZZ;
  const lobby = { l: bounds.l, r: bounds.r, t: bounds.t, b: underside };
  const below = { l: bounds.l, r: bounds.r, t: underside, b: bounds.b };

  // Lobby: the corridors' chamber shell over the clone's 1000 x 700, and the
  // clone's own Rook Hall spotlights and shadows at their archived positions
  // (unnnn layers T_1311832165202 / T_1311832941302: why.decor).
  c.decos.push(...shell(lobby));
  for (const [x, y, w, h, r, z, flip] of UNNNN_SPOTLIGHTS) {
    const deco = { sprite: 'rookhall_spotlight', x: x + bounds.l, y: y + bounds.t, w, h, z: 4 + z, r, layer: 'mg' };
    if (flip) deco.flip = true;
    c.decos.push(deco);
  }
  for (const [x, y, w, h, r, z, flip] of UNNNN_SHADOWS) {
    const deco = { sprite: 'firebog_linear_gradient_shadow', x: x + bounds.l, y: y + bounds.t, w, h, z: 20 + z, r, layer: 'fg' };
    if (flip) deco.flip = true;
    c.decos.push(deco);
  }
  c.decos.push(lantern(-260, -330), lantern(200, -330));
  // V: the Hall door's plaque (the recordings show it beside the door; here over it, the lobby being narrower).
  plaque(c, hallDoorX, floor - DOOR.h + 4, 'Hall of Rejected\nConcepts');
  // G88 (Austin approved shipping this sign text, 2026-10-23): read off player
  // footage, Lily Linguistic's "Rook Museum" (YouTube i11hPtqFN8E, t0000-t0004)
  // and "Hall of Rejected Concepts" (-03T3bLY7a0, t0000); notes in
  // research/video/README.md section 3c. Left to right the lobby shows the
  // Stairs door, a carved arrow sign pointing left reading "EXIT", a wooden
  // pillar, a "Rook Museum" plaque, the museum door with the Greeterbot in
  // front, then the Hall plaque and door. Remake text on the set's CC0 art
  // (sign_arrow_1 mirrored, the corridors' plaque), both at the footage's
  // height beside the doors. The footage lobby is wider (about 1,700 px against
  // unnnn's 1,000-px clone), so here they sit closer and the plaque is
  // three-quarter size; the pillar is left out (no room between the signs).
  for (const sign of MEZZ_SIGNS) {
    if (sign.arrow) {
      c.decos.push({ sprite: 'sign_arrow_1', x: sign.x, y: floor - sign.lift, w: 116, h: 77, z: 30, r: 0, flip: true, layer: 'mg', signText: sign.text });
    } else {
      c.decos.push({ sprite: 'jethimadh_int_door_sign', x: sign.x, y: floor - sign.lift, w: 140, h: 82, z: 11, r: 0, layer: 'mg' });
      c.decos.push({ sprite: 'firebog_sign_blank', x: sign.x, y: floor - sign.lift - 13, w: 103, h: 60, z: 16, r: 0, layer: 'mg', signText: sign.text });
    }
  }

  // Floors: the lobby floor (the clone's platform height) and the
  // floorboards under it, solid from below except over the ladder shaft in
  // the right-hand corner (Down at the ladder top climbs below).
  const floorWhy = 'unnnn\'s only platform is y -12 across its width (the clone\'s floor); the lobby keeps it.';
  c.platforms.push(flat('mz_floor', bounds.l + 32, bounds.r - 32, floor, floorWhy));
  c.platforms.push(flat('mz_floor_underside', bounds.l + 32, shaftL, underside, 'The floorboards, solid from below: the crawlspace is left by its ladder (or the teleporter).', 1));
  c.platforms.push(flat('mz_ceiling', bounds.l + 40, bounds.r - 40, ceiling, 'Lobby roof (solid from below).', 1));

  // Below the floorboards: a crawlspace the width of the lobby.
  const crawlWhy = 'F 13777: "the hidden space under the floor in Jethimadh mezzanine"; H: "below the floorboards". Remake: a crawlspace 290 px deep under the whole lobby, reached by a corridor ladder in the right-hand corner past the Hall door ("with a little investigation").';
  c.decos.push(
    { sprite: 'jethimadh_int_bg_left', x: -260, y: crawl + 80, w: 600, h: 420, z: 0, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_int_bg_right', x: 260, y: crawl + 80, w: 600, h: 420, z: 0, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_int_bg_shadow_50percent', x: 0, y: crawl + 60, w: 1100, h: 420, z: 1, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_int_bg_shadow_50percent', x: 0, y: crawl + 40, w: 1100, h: 380, z: 2, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_frame_wall', x: 0, y: underside + 30, w: 1060, h: 48, z: 12, r: 0, layer: 'fg' },
    { sprite: 'jethimadh_frame_wall', x: 0, y: crawl + 40, w: 1060, h: 48, z: 12, r: 0, layer: 'fg' },
    { sprite: 'jethimadh_frame_cap', x: -470, y: bounds.b, w: 120, h: bounds.b - underside, z: 11, r: 0, layer: 'fg' },
    { sprite: 'jethimadh_frame_cap', x: 470, y: bounds.b, w: 120, h: bounds.b - underside, z: 11, r: 0, flip: true, layer: 'fg' },
    { sprite: 'jethimadh_int_steps_1c', x: -420, y: crawl + 30, w: 260, h: 60, z: 3, r: 0, layer: 'mg' },
  );
  c.platforms.push(flat('mz_crawl', bounds.l + 32, bounds.r - 32, crawl, crawlWhy));
  const ladders = [ladder(c, 'mz', ladderX, crawl, floor, crawlWhy)];


  const greeterWhy = 'Maps / quests: rook_hall_start sends you to "the Mezzanine in Jethimadh Tower" to "speak to Greeterbot Sentry G-42" (end_npcs npc_quest_giver_widget). V (G88, i11hPtqFN8E t0000-t0004, -03T3bLY7a0 t0000): it stands in front of the museum door, a little left of its middle.';
  const museumWhy = 'B "enter the door to the Rook museum"; N "If you have been chosen, you will be invited to enter the Rook Museum". The door goes the Greeterbot\'s way: npc_quest_giver_widget.enterHall (LA91BDTNHS82D36, arrive -2270,-136), the remake\'s transient museum.';
  const hallWhy = 'B "the locked door to the Hall of Records (next door)" (2011); forum 29729: the Hall of Rejected Concepts (LA9L33D5CNE3I0J) opened behind it "next to the Rook Museum" in 2012-11. V: the door wears a "Hall of Rejected Concepts" plaque and leads to the Hall\'s left end (js/hall-rejected-concepts.js).';
  const stootWhy = 'unnnn\'s objrefs include two Collision-triggered Teleporters (positions lost); H "Left + Up + Space", F 13777 "Head left (when you\'re in the floor space)", "just keep jumping, pressing left". A jump at the crawlspace\'s left end (box 60 px over its floor: a plain jump, spinach not needed) takes you to the Stoot Shrine.';

  return {
    tsid: MEZZANINE_TSID,
    sourceTsid: 'LIFGJ2246R72LJL',
    label: 'Mezzanine',
    hub: MID_TOWER_HUB,
    bounds,
    platforms: c.platforms,
    barriers: barriersFor(bounds, 'mz'),
    decos: c.decos,
    ladders,
    doors: [
      {
        id: 'door_mz_stairs',
        x: stairsDoorX,
        y: floor,
        ...DOOR,
        connect: { tsid: 'LIFFUV4ATQ72I6D', label: 'Stairs', x: STAIRS.mezzDoorX, y: STAIRS_TOP_Y, hub_id: '96' },
        why: 'Back down the Stairs (remake: the door the top landing leads to).',
      },
      {
        id: MUSEUM_DOOR_ID,
        x: museumDoorX,
        y: floor,
        ...DOOR,
        connect: { tsid: 'LA91BDTNHS82D36', label: 'Museum of the Rook', x: -2270, y: -136, hub_id: '96' },
        why: museumWhy,
      },
      {
        id: 'door_mz_hall',
        x: hallDoorX,
        y: floor,
        ...DOOR,
        connect: { tsid: 'LA9L33D5CNE3I0J', label: 'Hall of Rejected Concepts', x: HALL.doorX, y: HALL.floor, hub_id: '96' },
        why: hallWhy,
      },
    ],
    spots: [],
    teleports: [
      {
        id: STOOT_TELEPORTER_ID,
        x: bounds.l + 60,
        y: crawl - 60,
        w: 120,
        h: 240,
        to: { tsid: STOOT_SHRINE_TSID, label: 'unnnn', x: -380, y: -12 },
        why: stootWhy,
      },
    ],
    greeterbot: { x: MEZZ.greeterX, y: floor, why: greeterWhy },
    why: {
      room: 'Maps: LIFGJ2246R72LJL "Mezzanine" in hub 96. B/N: the lobby of the Rook Museum, reached up the Stairs, with the museum door, the Greeterbot and the locked Hall of Records next door; H/F: a hidden space under its floorboards that leads on to unnnn.',
      size: 'unnnn was cloned from the Mezzanine (sources LIFGJ2246R72LJL): its bounds -500..500 x -700..0, floor y -12 and street-sized deco layers are kept. The crawlspace runs below (to y 290) with 400 px of world under it (b 700), so the view never shows past the bottom.',
      decor: 'Source-exact positions: unnnn layers T_1311832165202 (11 rookhall_spotlight) and T_1311832941302 (the two upright firebog_linear_gradient_shadow; a third lies along the floor and a fourth duplicates the first, left out so the lobby floor stays lit), deco ids of 2011-07-28, street-sized so world = local - (500, 700). Left out: rook_hall_placeholder_painting (no art recovered) and unnnn\'s middleground flash_crasher_demon / water_ripple (the shrine room\'s scene, replaced in 2012). The shell, lanterns, crawlspace and ladder are the corridors\' art (remake). G88: the EXIT arrow and Rook Museum plaque are footage text on the set\'s CC0 sign art (MEZZ_SIGNS).',
    },
  };
}

/** The Stairs' top landing height (flight 2's high end), for the Mezzanine's door back down. */
const STAIRS_TOP_Y = C4_HIGH.y + STAIRS.flight2.dy;

/**
 * unnnn's way back up (remake): walking into its left end returns you to the
 * Mezzanine's crawlspace, right of the teleporter. World coordinates in each street.
 */
export const STOOT_RETURN = Object.freeze({
  tsid: STOOT_SHRINE_TSID,
  bounds: Object.freeze({ l: -500, r: 500, t: -700, b: 0 }),
  box: Object.freeze({ x: -470, y: 0, w: 60, h: 300 }),
  to: Object.freeze({ tsid: MEZZANINE_TSID, x: -300, y: 290 }),
  why: 'unnnn\'s second Collision-triggered Teleporter (position lost): the remake puts it at the room\'s left end, the side you came in from, and lands you in the crawlspace beside the teleporter that brought you.',
});

const MEZZANINE_ROOM = buildMezzanine();
const HALL_ROOM = buildHall({ hub: MID_TOWER_HUB, mezzanine: { sourceTsid: MEZZANINE_ROOM.sourceTsid, hallDoorX: MEZZ.hallDoorX, floor: MEZZ.floor } });

export const MID_TOWER_ROOMS = Object.freeze([buildStairs(), MEZZANINE_ROOM, HALL_ROOM]);

/** The archived door that leads into the rebuilt rooms. */
export const MID_TOWER_DOOR_LINKS = Object.freeze([
  { street: TOWER_ST_WEST_TSID, door: 'door_1313235999202', room: STAIRS_TSID },
]);

export const midTowerRoomByTsid = (tsid) => MID_TOWER_ROOMS.find((room) => room.tsid === tsid || room.sourceTsid === tsid) || null;

const toScreen = (bounds, x, y) => ({ x: x - bounds.l, y: y - bounds.t });

/** A world-space bottom-centre box in a street's screen space. */
export function boxToScreen(bounds, box) {
  return { ...box, ...toScreen(bounds, box.x, box.y) };
}

/**
 * The street JSON for a Mid tower room: the base rooms' format (with
 * ladders) and teleporter boxes (screen space, `teleport` = the target and
 * its arrival in the target's screen space, resolved by the builder).
 */
export function midTowerRoomStreet(room) {
  const street = { ...anyTowerRoomStreet(room), source: MID_TOWER_SOURCE };
  for (const t of room.teleports || []) {
    const { why, to, ...box } = t;
    street.boxes.push({ ...boxToScreen(room.bounds, box), teleport: { tsid: to.tsid, label: to.label, x: to.x, y: to.y } });
  }
  return street;
}

/** The index.json row: hub 96 instead of the base rooms' hub 77. */
export function midTowerIndexEntry(room) {
  return { ...towerRoomIndexEntry(room), hubId: MID_TOWER_HUB.hubId, hubName: MID_TOWER_HUB.hubName };
}
