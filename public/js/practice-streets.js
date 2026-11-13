/**
 * The two lost skill-quest practice streets (register row G682), rebuilt from
 * players' full-street snaps: Breezy, EZ Cookin' (ezcooking_1) and Talking
 * 'bout Soil Appreciation (soilappreciation_1). Pure data and street builders
 * (no Pixi, no DOM); tools/build-rebuilt-rooms.mjs writes the street JSON and
 * the index rows, js/quest-rooms/ez-cookin.js and soil-appreciation.js run the
 * quests on them, and the newxp tutorial's EZ Cooking pick walks the first
 * (js/newxp.js FIRST_SKILLS).
 *
 * Sources
 * - config_prod.js:1341-1342 newxp_locations ezcooking_1 LIFII3UBRFB3KBE and
 *   soilappreciation_1 LHFS40864GB396O; inc_data_maps_prod.js:18068-18069 lists
 *   both in hub 132 "Skill Quests" (maps_get_hubs_132, line 1155). Neither is
 *   in tinyspeck/glitch-locations: no geometry survives.
 * - quests/ezcooking_1.js and soilappreciation_1.js onStarted:
 *   teleportToLocationDelayed(..., 123, -958) (magic_rock.js:664 for the
 *   tutorial's EZ Cooking pick). The street script is
 *   locations/skillquest_ezc_v2.js / skillquest_sa.js: the flamingo at
 *   370,-93 says hello and flies off to the right; EZ Cookin' puts its food on
 *   the counters (location_targets food_1_1 .. food_3_3, special_items), Soil
 *   Appreciation gates Dig on the Patch behind Tend (verbAvailable: "You must
 *   tend this Patch first"). The "Do it all!" flag (finish_ezcooking,
 *   finish_soilappreciation) was the exit's box, as on the two archived practice
 *   streets (GUVCT29PSU53G9V's box_7 quest:flag:finish_lightgreenthumb).
 * - Snaps (research/eleven-snaps/Tutorial, Eleven street-snap collections of
 *   zoi, mackenzie and cleops, Nov-Dec 2012; reference only, nothing of them
 *   ships): a full-street snap is the street at 1 px = 1 street unit, so the
 *   street is the snap's size (2800 x 1000 and 2500 x 1000) with its top-left at
 *   0, -1000: the food's location_targets land on the snapped counters' tops,
 *   and the avatar standing at the left end stands at the flamingo's -93.
 *   Both streets: a pine forest at sunset, orange sky over a dark pine line,
 *   tall firs, red-brown rock bluffs, a back lane of grass with a dirt edge,
 *   the walking lane in front and a band of dark stony soil under it.
 *   EZ Cookin': a round table with the Knife & Board on it, then three serving
 *   counters, each under a hanging lamp, the food on them, two big trunks in
 *   front, the wooden EXIT arrow at the right. Soil Appreciation: a grey
 *   stone, a Dirt Pile, a raised grassy block (its right side slopes down to
 *   the lane) with the Patch on top, and the EXIT arrow at the right
 *   (mackenzie's snap; zoi's two have no arrow).
 *
 * Art: Tiny Speck's CC0 decos already in assets/decos/groddle. The firs are
 * tree_coniferous_* (the near trunks tree_coniferous_fg_*), the pine line
 * pinehills_* and pinecluster_*, the bluffs heights_face_rock_* tinted the
 * snaps' red-brown, the grey stone heights_mound_1, the grass evenground
 * planes, the soil band grassSlice_f1, the raised block corey3_grassSlice_f1,
 * the sun the tutorial's own sun_01a_newxp, the EXIT arrow sign_arrow_1 with
 * the snaps' word drawn on it (features/rebuilt-rooms-feature.js).
 * Made for Groddle (no CC0 piece matches the snaps' own): the glass-topped
 * steel serving counters, their white hanging lamps and the round mosaic table
 * are new art, gz_ai_ezc_glass_counter, gz_ai_ezc_hanging_lamp and
 * gz_ai_ezc_round_table, drawn by GPT Image 2.6 Sunburst from our measurement
 * drawing and Tiny Speck's CC0 decos, dedicated CC0 1.0 (provenance in
 * tools/provenance/made-decos.json; brief in research/art-briefs/ez-cookin).
 * They replace the stand-ins store_counter and k04_table_01 (the store_lamp_01
 * lamps read like swings, Austin 2026-11-13).
 * Ours: the Hoe and Shovel's spots (they were street items; no snap shows them
 * before they were taken), the walls at both ends, the boxes' sizes.
 */

export const PRACTICE_HUB = Object.freeze({ hubId: '132', hubName: 'Skill Quests' });
export const PRACTICE_SNAPS = 'research/eleven-snaps/Tutorial (zoi, mackenzie, cleops; reference only)';
/** quests/ezcooking_1.js, soilappreciation_1.js onStarted: teleportToLocationDelayed(..., 123, -958). */
export const PRACTICE_START = Object.freeze({ x: 123, y: -958 });
/** skillquest_ezc_v2.js / skillquest_sa.js location_targets initial_flamingo. */
export const PRACTICE_FLAMINGO = Object.freeze({ x: 370, y: -93 });

const deco = (sprite, x, y, w, h, z, extra = {}) => ({ sprite, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z, r: 0, ...extra });
const countDecos = (layers) => layers.reduce((n, l) => n + (l.decos?.length || 0), 0);
const sameTsid = (a, b) => String(a || '').length > 1 && String(a || '').slice(1) === String(b || '').slice(1);
/** A floor (no item_perm: a hand-drawn line is a plain floor for items too, as the other rebuilt rooms). */
const plat = (id, x1, y1, x2, y2 = y1, extra = {}) => ({ id, x1, y1, x2, y2, pc_perm: -1, ...extra });
/** A table top: items rest on it, the avatar walks through (as the archived practice streets' side table). */
const shelf = (id, x1, x2, y) => ({ id, x1, y1: y, x2, y2: y, pc_perm: 0, item_perm: -1 });

/** A deterministic 0..1 from an integer (the builder's --check must be stable). */
const rnd = (n) => {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h % 10000) / 10000;
};

/** Logical sizes (the 2x WebP halved) of the pieces used here. */
const SIZE = Object.freeze({
  tree_coniferous_1: [265, 647],
  tree_coniferous_2: [370, 661],
  tree_coniferous_3: [385, 652],
  tree_coniferous_4: [364, 643],
  tree_coniferous_fg_1: [633, 1406],
  tree_coniferous_fg_2: [679, 1464],
  tree_coniferous_fg_3: [630, 1435],
  tree_coniferous_fg_4: [720, 1435],
  pinehills_1: [850, 270],
  pinehills_2: [878, 265],
  pinehills_distant_1: [1019, 334],
  pinecluster_1: [269, 196],
  pinecluster_2: [362, 211],
  heights_face_rock_1: [173, 55],
  heights_face_rock_2: [391, 111],
  heights_platform_rock_2: [414, 145],
  heights_mound_1: [214, 85],
  evenground_platform_long: [1226, 92],
  evenground_platform_long_dark: [1226, 92],
  grassSlice_f1: [160, 60],
  corey3_grassSlice_f1: [160, 60],
  transition_grass_1: [98, 29],
  cover_bush1: [713, 73],
  groddle_bush1: [160, 94],
  groddle_bush4: [142, 68],
  heights_bush_1: [160, 94],
  bush_3: [283, 100],
  flower_bush_5: [251, 107],
  groddle_fern_1: [126, 75],
  plant_fern_1: [31, 71],
  groddle_grass_1: [106, 51],
  wildflowers_bunch_2: [191, 25],
  sun_01a_newxp: [311, 311],
  gz_ai_ezc_glass_counter: [220, 66],
  gz_ai_ezc_hanging_lamp: [75, 654],
  gz_ai_ezc_round_table: [182, 96],
  sign_arrow_1: [140, 93],
});
const sized = (sprite, x, y, s, z, extra = {}) => deco(sprite, x, y, SIZE[sprite][0] * s, SIZE[sprite][1] * s, z, extra);

/** Layer x for a world x on a layer `lw` wide (parallax: the layers line up mid-view). */
const PARALLAX_VIEW = 1280;
function layerX(wx, W, lw) {
  if (lw === W) return Math.round(wx);
  return Math.round((wx - PARALLAX_VIEW / 2) * (lw - PARALLAX_VIEW) / (W - PARALLAX_VIEW) + PARALLAX_VIEW / 2);
}

/**
 * A plane of a flat-fill strip (`sprite` at its own aspect), `w` wide, from `bottom - h` to
 * `bottom`: rows overlapping a fifth rather than one strip stretched tall (winter-walk-streets.js
 * dirtPlane). Returns the decos, top row last.
 */
function plane(sprite, x, bottom, w, h, z) {
  const [sw, sh] = SIZE[sprite];
  const rh = (w * sh) / sw;
  const n = h <= rh ? 1 : Math.ceil((h - rh) / (rh * 0.8)) + 1;
  const step = n > 1 ? (h - rh) / (n - 1) : 0;
  const rows = [];
  for (let i = 0; i < n; i += 1) rows.push(deco(sprite, x, bottom - i * step, w, Math.min(h, rh), z + i));
  return rows;
}

/* ------------------------------------------------------------------ */
/* Shared scenery                                                        */
/* ------------------------------------------------------------------ */

/** Both snaps' sky: orange at the top, a yellow glow down at the horizon. */
const SUNSET = Object.freeze({ top: 'E06A34', bottom: 'F7C766' });
/** The snaps' rock bluffs behind the firs (a red-brown). */
const BLUFF_FILTER = Object.freeze({ tintColor: 0x8c3f26, tintAmount: 62, brightness: -10 });

/** The far pine line (a dark band along the horizon), local to a layer `lw` wide. */
function pineLine(lw, H, z0, seed) {
  const out = [];
  let z = z0;
  for (let x = -200, i = 0; x < lw + 400; x += 760, i += 1) {
    out.push(sized(i % 2 ? 'pinehills_2' : 'pinehills_1', x + rnd(seed + i) * 120, H - 205, 1.05, z++, i % 2 ? { flip: true } : {}));
  }
  for (let x = 60, i = 0; x < lw; x += 300 + rnd(seed + 40 + i) * 220, i += 1) {
    out.push(sized(i % 2 ? 'pinecluster_2' : 'pinecluster_1', x, H - 190, 0.9 + rnd(seed + 80 + i) * 0.5, z++, i % 3 ? {} : { flip: true }));
  }
  return out;
}

/** Firs standing on the back lane: [sprite, world x, scale, flip]. */
function firs(rows, W, lw, baseY, z0) {
  return rows.map(([sprite, wx, s, flip], i) => sized(sprite, layerX(wx, W, lw), baseY, s, z0 + i, flip ? { flip: true } : {}));
}

/** The back lane: dark grass with its dirt edge, and the walking lane's front planes. */
function groundDecos(W, z0) {
  const out = [];
  let z = z0;
  // The back lane's grass (the snaps: a darker green behind a dirt edge) and the walking lane in front.
  for (let x = 400, i = 0; x < W + 1000; x += 1100, i += 1) {
    const rows = plane('evenground_platform_long_dark', x, 860, 1400, 120, z);
    out.push(...rows);
    z += rows.length;
  }
  for (let x = 400; x < W + 1000; x += 1100) {
    const rows = plane('evenground_platform_long', x, 948, 1400, 130, z);
    out.push(...rows);
    z += rows.length;
  }
  // The band of dark stony soil under the lane, to the bottom edge.
  for (let x = 0; x < W + 200; x += 150) out.push(sized('grassSlice_f1', x + 75, 1012, 1.0, z++));
  return out;
}

/** Bushes, ferns and grass along the back lane's edge (local; seeded). */
function laneEdge(W, y, z0, seed, skip = []) {
  const out = [];
  let z = z0;
  const kinds = ['groddle_bush1', 'heights_bush_1', 'groddle_bush4', 'bush_3', 'groddle_fern_1', 'groddle_grass_1', 'flower_bush_5'];
  for (let x = 40, i = 0; x < W; x += 140 + rnd(seed + i) * 170, i += 1) {
    if (skip.some(([a, b]) => x > a && x < b)) continue;
    const sprite = kinds[Math.floor(rnd(seed + 100 + i) * kinds.length)];
    out.push(sized(sprite, x, y + rnd(seed + 200 + i) * 14, 0.7 + rnd(seed + 300 + i) * 0.45, z++, i % 2 ? { flip: true } : {}));
  }
  return out;
}

function shell({ tsid, label, bounds, platforms, layers, barriers, boxes, source, why }) {
  return {
    source,
    reconstructed: true,
    tsid,
    label,
    hubId: PRACTICE_HUB.hubId,
    hubName: PRACTICE_HUB.hubName,
    swf_file: 'groddle1.swf,newxp_misc.swf',
    bounds: { ...bounds },
    platforms,
    layers,
    signposts: [],
    doors: [],
    barriers,
    boxes,
    stats: {
      platformCount: platforms.length,
      layerCount: layers.length,
      decoCount: countDecos(layers),
      signpostCount: 0,
      doorCount: 0,
      ladderCount: 0,
      barrierCount: barriers.length,
    },
    gradient: { ...SUNSET },
    // The archived practice streets' track (GUVCT29PSU53G9V, GHFRK14DDU53RQQ music_file).
    musicFile: 'NEW_XP_TRAINING1',
    ladders: [],
    // Instances kept their own light: the snaps are all at the same sunset.
    ownLight: true,
    noMap: true,
    why,
  };
}

/**
 * The middleground's decos in world coordinates (street-render.js draws a `middleground` layer's
 * decos through worldToScreen; every other layer is layer-local). The builders lay them out in
 * the snaps' pixels (local), so they move by the street's top-left here.
 */
const toWorld = (decos, B) => decos.map((d) => ({ ...d, x: d.x + B.l, y: d.y + B.t }));

const indexRow = (street) => ({
  label: street.label,
  file: `assets/streets/${street.tsid}.json`,
  hubId: street.hubId,
  hubName: street.hubName,
  platforms: street.platforms.length,
  decos: street.stats.decoCount,
  reconstructed: true,
});

/* ------------------------------------------------------------------ */
/* Breezy, EZ Cookin'                                                    */
/* ------------------------------------------------------------------ */

export const EZ_COOKIN_TSID = 'GIFII3UBRFB3KBE';
export const EZ_COOKIN_SOURCE_TSID = 'LIFII3UBRFB3KBE';
export const EZ_COOKIN_LABEL = "Breezy, EZ Cookin'";
export const EZ_COOKIN_BOUNDS = Object.freeze({ l: 0, r: 2800, t: -1000, b: 0 });
/** The walking lane: zoi's avatar stands at -92 at the left end (the flamingo's -93). */
export const EZ_COOKIN_FLOOR_Y = -92;
/** The round table the Knife & Board waits on (snap x 520..698, top at -182). */
export const EZ_KNIFE_TABLE = Object.freeze({ x: 608, x1: 540, x2: 676, top: -182 });
/** The three serving counters, left to right (snap: 220 wide, tops at -200 where the food rests). */
export const EZ_COUNTERS = Object.freeze([
  Object.freeze({ id: 'trant1', x: 1022, x1: 912, x2: 1132, top: -200 }),
  Object.freeze({ id: 'trant2', x: 1442, x1: 1332, x2: 1552, top: -200 }),
  Object.freeze({ id: 'trant3', x: 1857, x1: 1747, x2: 1967, top: -200 }),
]);
/**
 * Where the snaps draw the made props (1 px = 1 unit, y as world y): each counter's glass top at
 * -204 and feet at -140 (the food rests on the lid, -200); each lamp's shade -375 to -348 under
 * wires from -397, over its counter; the table's feet at -99 under its tiled top.
 */
export const EZ_PROP_ART = Object.freeze({ counterFeet: -140, counterH: 64, lampShadeBottom: -348, tableFeet: -99 });
/** The Knife & Board on its table (a street item: its x from the snap). */
export const EZ_KNIFE_AND_BOARD = Object.freeze({ id: 'knife_and_board', classTsid: 'knife_and_board', count: 1, x: 605, y: -182 });
/** skillquest_ezc_v2.js location_targets food_* with special_items (class, count): world x, y. */
export const EZ_FOOD = Object.freeze([
  Object.freeze({ id: 'food_1_1', classTsid: 'cheese', count: 1, x: 996, y: -192, counter: 1 }),
  Object.freeze({ id: 'food_1_2', classTsid: 'tomato', count: 2, x: 1054, y: -192, counter: 1 }),
  Object.freeze({ id: 'food_2_1', classTsid: 'bun', count: 1, x: 1415, y: -193, counter: 2 }),
  Object.freeze({ id: 'food_2_2', classTsid: 'meat', count: 1, x: 1467, y: -194, counter: 2 }),
  Object.freeze({ id: 'food_3_1', classTsid: 'bun', count: 10, x: 1803, y: -193, counter: 3 }),
  Object.freeze({ id: 'food_3_2', classTsid: 'cheese', count: 5, x: 1856, y: -195, counter: 3 }),
  Object.freeze({ id: 'food_3_3', classTsid: 'meat', count: 5, x: 1916, y: -193, counter: 3 }),
]);
/** skillquest_ezc_v2.js location_targets initial_flamingo_2: where the flamingo flies off to. */
export const EZ_FLAMINGO_AWAY = Object.freeze({ x: 3304, y: -110 });
/** The wooden EXIT arrow (snap x 2400..2530, the board 762..835). */
export const EZ_EXIT_SIGN = Object.freeze({ x: 2465, y: -165, w: 140, h: 93 });
/** The exit's box: the "Do it all!" flag (world, bottom-centre, as the archived streets' box_7). */
export const EZ_FINISH_BOX = Object.freeze({ id: 'quest:flag:finish_ezcooking', x: 2620, y: EZ_COOKIN_FLOOR_Y, w: 200, h: 800 });
export const EZ_WALLS = Object.freeze({ l: 30, r: 2770 });

export const EZ_COOKIN_SOURCE_LINE =
  "reconstruction: Breezy, EZ Cookin' (LIFII3UBRFB3KBE, hub 132, not in tinyspeck/glitch-locations); layout from the Eleven full-street snaps (2800 x 1000, 1 px = 1 street unit; reference only) and skillquest_ezc_v2.js location_targets, CC0 groddle decos and three props made for Groddle (gz_ai_ezc_*, CC0 1.0)";

function ezSkyDecos(lw, H) {
  // The sun low at the left, through the trees (zoi's snap).
  return [sized('sun_01a_newxp', layerX(180, 2800, lw), H - 300, 1.1, 0)];
}

function ezBackDecos(lw, H) {
  return pineLine(lw, H, 0, 11);
}

function ezBluffDecos(lw, H) {
  const W = EZ_COOKIN_BOUNDS.r;
  // The red-brown bluffs: behind the middle counters and past the last one, to the arrow.
  return [
    sized('heights_platform_rock_2', layerX(1250, W, lw), H - 180, 1.0, 0),
    sized('heights_face_rock_2', layerX(1990, W, lw), H - 170, 1.25, 1),
    sized('heights_platform_rock_2', layerX(2300, W, lw), H - 175, 1.1, 2, { flip: true }),
    sized('heights_face_rock_2', layerX(2560, W, lw), H - 180, 0.9, 3),
  ];
}

function ezFirDecos(lw, H) {
  const W = EZ_COOKIN_BOUNDS.r;
  return firs([
    ['tree_coniferous_2', 330, 0.62, false],
    ['tree_coniferous_4', 470, 0.75, true],
    ['tree_coniferous_1', 860, 0.82, false],
    ['tree_coniferous_3', 1110, 0.72, true],
    ['tree_coniferous_2', 1580, 0.78, false],
    ['tree_coniferous_1', 2160, 0.8, true],
    ['tree_coniferous_4', 2470, 0.9, false],
    ['tree_coniferous_3', 2690, 0.7, true],
  ], W, lw, H - 196, 0);
}

function ezNearFirDecos(lw, H) {
  const W = EZ_COOKIN_BOUNDS.r;
  // The tall trunks close behind the lane (zoi: at 690, 930, 1150 and 2580).
  return firs([
    ['tree_coniferous_fg_2', 690, 0.62, false],
    ['tree_coniferous_fg_1', 930, 0.6, true],
    ['tree_coniferous_fg_3', 1150, 0.58, false],
    ['tree_coniferous_fg_4', 2580, 0.62, true],
  ], W, lw, H - 160, 0);
}

function ezMiddleDecos() {
  const W = EZ_COOKIN_BOUNDS.r;
  const oy = -EZ_COOKIN_BOUNDS.t;
  const out = [...groundDecos(W, 0)];
  let z = out.length;
  out.push(...laneEdge(W, 852, z, 21, [[880, 2000]]));
  z = out.length;
  // The round table and the three counters under their lamps (made for Groddle, EZ_PROP_ART).
  const t = EZ_KNIFE_TABLE;
  const a = EZ_PROP_ART;
  out.push(sized('gz_ai_ezc_round_table', t.x, a.tableFeet + oy, 1, z++, { id: 'deco_ez_knife_table' }));
  for (const c of EZ_COUNTERS) {
    out.push(deco('gz_ai_ezc_glass_counter', c.x, a.counterFeet + oy, 220, a.counterH, z++, { id: `deco_ez_counter_${c.id}` }));
    // The lamp's file ends 2 units under the shade (its little diffuser).
    out.push(sized('gz_ai_ezc_hanging_lamp', c.x, a.lampShadeBottom + 2 + oy, 1, z++, { id: `deco_ez_lamp_${c.id}` }));
  }
  const s = EZ_EXIT_SIGN;
  out.push(deco('sign_arrow_1', s.x, s.y + oy, s.w, s.h, z++, { id: 'deco_ez_exit' }));
  // Ferns and grass on the lane (zoi: a fern under the second counter's left end, grass tufts).
  out.push(sized('groddle_fern_1', 860, 890, 0.8, z++));
  out.push(sized('plant_fern_1', 236, 905, 1.0, z++));
  out.push(sized('groddle_grass_1', 1680, 912, 0.6, z++));
  return out;
}

function ezFrontDecos() {
  const W = EZ_COOKIN_BOUNDS.r;
  // The big trunks in front of the lane (zoi: 1215 and 2040), and dark bushes along the bottom.
  // The snaps' two trunks are bare up past the lamps, so both are fg_1 (no low skirt): the food
  // and the counters' tops stay in view (fg_3 here, its low skirt, hid the first counter's cheese).
  const out = [
    sized('tree_coniferous_fg_1', 1215, 1060, 0.85, 0),
    sized('tree_coniferous_fg_1', 2040, 1060, 0.88, 1, { flip: true }),
    sized('tree_coniferous_fg_4', 2790, 1060, 0.8, 2),
    sized('tree_coniferous_fg_2', 10, 1060, 0.8, 3, { flip: true }),
  ];
  let z = out.length;
  for (let x = 120, i = 0; x < W; x += 420 + rnd(500 + i) * 260, i += 1) {
    out.push(sized(i % 2 ? 'groddle_bush1' : 'heights_bush_1', x, 1030, 1.1 + rnd(600 + i) * 0.5, z++, i % 2 ? { flip: true } : {}));
  }
  return out;
}

/** The street's platforms (world): the lane, then the table tops the food rests on. */
export function ezCookinPlatforms() {
  const t = EZ_KNIFE_TABLE;
  return [
    // The lane runs wall to wall.
    plat('plat_ez_lane', EZ_WALLS.l, EZ_COOKIN_FLOOR_Y, EZ_WALLS.r, EZ_COOKIN_FLOOR_Y),
    shelf('plat_ez_knife_table', t.x1, t.x2, t.top),
    ...EZ_COUNTERS.map((c) => shelf(`plat_ez_counter_${c.id}`, c.x1 + 12, c.x2 - 12, c.top)),
  ];
}

/** The street's boxes (screen space, bottom-centre): the counters, the table and the exit (skillquest_ezc_v2.js eventScriptHitBox). */
export function ezCookinBoxes() {
  const oy = -EZ_COOKIN_BOUNDS.t;
  const f = EZ_FINISH_BOX;
  return [
    { key: 'box_knife', id: 'knifeandboard', x: EZ_KNIFE_TABLE.x, y: EZ_COOKIN_FLOOR_Y + oy, w: 240, h: 200 },
    ...EZ_COUNTERS.map((c) => ({ key: `box_${c.id}`, id: c.id, x: c.x, y: EZ_COOKIN_FLOOR_Y + oy, w: 240, h: 200 })),
    { key: 'box_finish', id: f.id, x: f.x, y: f.y + oy, w: f.w, h: f.h },
  ];
}

/** The street JSON. */
export function ezCookinStreet() {
  const B = EZ_COOKIN_BOUNDS;
  const W = B.r - B.l;
  const H = B.b - B.t;
  const platforms = ezCookinPlatforms();
  const barriers = [
    { id: 'wall_ez_left', x: EZ_WALLS.l, y: B.t, h: EZ_COOKIN_FLOOR_Y - B.t, pc_perm: null },
    { id: 'wall_ez_right', x: EZ_WALLS.r, y: B.t, h: EZ_COOKIN_FLOOR_Y - B.t, pc_perm: null },
  ];
  const layers = [
    { id: 'T_ez_sky', name: 'sky', z: -6, w: 2380, h: H, decos: ezSkyDecos(2380, H) },
    { id: 'T_ez_pines', name: 'bg_4', z: -5, w: 2480, h: H, decos: ezBackDecos(2480, H), filters: { brightness: -40, saturation: -10 } },
    { id: 'T_ez_bluffs', name: 'bg_3', z: -4, w: 2580, h: H, decos: ezBluffDecos(2580, H), filters: { ...BLUFF_FILTER } },
    { id: 'T_ez_firs', name: 'bg_2', z: -3, w: 2660, h: H, decos: ezFirDecos(2660, H), filters: { brightness: -24 } },
    { id: 'T_ez_near', name: 'bg_1', z: -2, w: 2740, h: H, decos: ezNearFirDecos(2740, H), filters: { brightness: -12 } },
    { id: 'middleground', name: 'middleground', z: 0, w: W, h: H, decos: toWorld(ezMiddleDecos(), B) },
    { id: 'T_ez_front', name: 'middleplus', z: 1, w: W, h: H, decos: ezFrontDecos(), filters: { brightness: -18 } },
  ];
  return shell({
    tsid: EZ_COOKIN_TSID,
    label: EZ_COOKIN_LABEL,
    bounds: B,
    platforms,
    layers,
    barriers,
    boxes: ezCookinBoxes(),
    source: EZ_COOKIN_SOURCE_LINE,
    why: {
      street: 'config_prod.js:1341 newxp_locations.ezcooking_1; inc_data_maps_prod.js:18068 (hub 132 Skill Quests); no location XML.',
      bounds: 'The snaps are full-street snaps, 2800 x 1000 at 1 px a unit: skillquest_ezc_v2.js food_1_1 (996, -192) lands on the first counter\'s top at 0, -1000.',
      layout: 'Left to right (zoi, mackenzie, cleops snaps): the start, the round table with the Knife & Board, three serving counters under hanging lamps with the food on them, two big trunks in front, the wooden EXIT arrow and the way out at the right.',
      food: 'skillquest_ezc_v2.js location_targets and special_items: cheese and two tomatoes, a bun and meat, ten buns, five cheese and five meat.',
      art: 'CC0 groddle decos: tree_coniferous_*, pinehills_*, pinecluster_*, heights rocks tinted red-brown, evenground planes, grassSlice_f1, sun_01a_newxp, sign_arrow_1. Made for Groddle (no CC0 piece matches): the glass counters, hanging lamps and round table, gz_ai_ezc_* by GPT Image 2.6 Sunburst, CC0 1.0 (tools/provenance/made-decos.json).',
      ours: 'The walls at both ends and the boxes\' sizes.',
    },
  });
}

export const ezCookinIndexEntry = indexRow;

/* ------------------------------------------------------------------ */
/* Talking 'bout Soil Appreciation                                       */
/* ------------------------------------------------------------------ */

export const SOIL_TSID = 'GHFS40864GB396O';
export const SOIL_SOURCE_TSID = 'LHFS40864GB396O';
export const SOIL_LABEL = "Talking 'bout Soil Appreciation";
export const SOIL_BOUNDS = Object.freeze({ l: 0, r: 2500, t: -1000, b: 0 });
export const SOIL_FLOOR_Y = -93;
/**
 * The raised grassy block (snap x 1625..2005): a flat top at -250 from its steep left face, the
 * right side sloping down to the lane (the snaps' grass edge runs from 1895, -250 to 2005, -155
 * and on into the lane).
 */
export const SOIL_BLOCK = Object.freeze({ x1: 1640, x2: 1890, top: -250, slopeEnd: 2070 });
/** The Patch on the block's top (snap 1720..1810). */
export const SOIL_PATCH = Object.freeze({ id: 'patch', classTsid: 'patch', x: 1765, y: SOIL_BLOCK.top });
/** The Dirt Pile (snap 1440..1600). */
export const SOIL_DIRT_PILE = Object.freeze({ id: 'dirt_pile', classTsid: 'dirt_pile', x: 1520, y: SOIL_FLOOR_Y });
/** The grey stone (snap 850..1090, on the back lane). */
export const SOIL_STONE = Object.freeze({ x: 970, y: -125 });
/** Ours: the tools' spots (street items; no snap shows them before they were taken). */
export const SOIL_TOOLS = Object.freeze([
  Object.freeze({ id: 'hoe', classTsid: 'hoe', count: 1, x: 560, y: SOIL_FLOOR_Y }),
  Object.freeze({ id: 'shovel', classTsid: 'shovel', count: 1, x: 690, y: SOIL_FLOOR_Y }),
]);
/** skillquest_sa.js location_targets initial_flamingo_2. */
export const SOIL_FLAMINGO_AWAY = Object.freeze({ x: 2797, y: -110 });
/** mackenzie's EXIT arrow (snap 2060..2190, its board 765..830). */
export const SOIL_EXIT_SIGN = Object.freeze({ x: 2125, y: -170, w: 140, h: 93 });
export const SOIL_FINISH_BOX = Object.freeze({ id: 'quest:flag:finish_soilappreciation', x: 2340, y: SOIL_FLOOR_Y, w: 200, h: 800 });
export const SOIL_WALLS = Object.freeze({ l: 30, r: 2470 });

export const SOIL_SOURCE_LINE =
  "reconstruction: Talking 'bout Soil Appreciation (LHFS40864GB396O, hub 132, not in tinyspeck/glitch-locations); layout from the Eleven full-street snaps (2500 x 1000, 1 px = 1 street unit; reference only) and skillquest_sa.js, CC0 groddle decos";

function soilSkyDecos(lw, H) {
  // The sun just right of the middle, low behind the pine line (zoi).
  return [sized('sun_01a_newxp', layerX(1390, 2500, lw), H - 330, 1.25, 0)];
}

function soilBluffDecos(lw, H) {
  const W = SOIL_BOUNDS.r;
  return [
    sized('heights_platform_rock_2', layerX(760, W, lw), H - 195, 1.05, 0),
    sized('heights_face_rock_2', layerX(1450, W, lw), H - 205, 1.2, 1, { flip: true }),
    sized('heights_face_rock_1', layerX(2120, W, lw), H - 210, 1.4, 2),
  ];
}

function soilFirDecos(lw, H) {
  const W = SOIL_BOUNDS.r;
  return firs([
    ['tree_coniferous_4', 120, 0.85, false],
    ['tree_coniferous_2', 300, 0.95, true],
    ['tree_coniferous_1', 770, 1.0, false],
    ['tree_coniferous_3', 1210, 0.7, true],
    ['tree_coniferous_2', 1780, 1.05, false],
    ['tree_coniferous_4', 2260, 0.98, true],
    ['tree_coniferous_1', 2440, 0.9, false],
  ], W, lw, H - 270, 0);
}

function soilMiddleDecos() {
  const W = SOIL_BOUNDS.r;
  const oy = -SOIL_BOUNDS.t;
  const out = [...groundDecos(W, 0)];
  let z = out.length;
  out.push(...laneEdge(W, 852, z, 31, [[1600, 2080]]));
  z = out.length;
  // The grey stone and its two pebbles on the back lane.
  out.push(sized('heights_mound_1', SOIL_STONE.x, SOIL_STONE.y + oy, 1.12, z++, { id: 'deco_soil_stone' }));
  // The raised block: its grassy top and stony face, the slope on its right.
  const b = SOIL_BLOCK;
  out.push(deco('corey3_grassSlice_f1', (b.x1 + b.x2) / 2 + 20, -118 + oy, 400, 150, z++, { id: 'deco_soil_block' }));
  // Its grassy top (the snaps: a bright green cap over the stony face), the Patch's ground.
  out.push(deco('evenground_platform_long', (b.x1 + b.x2) / 2 + 20, b.top + 14 + oy, 410, 44, z++, { id: 'deco_soil_block_top' }));
  // The slope: a grassy bank falling away to the right, under the block's right end.
  out.push(deco('transition_grass_1', b.x2 + 60, SOIL_FLOOR_Y + oy + 8, 300, 175, z++, { id: 'deco_soil_slope' }));
  const s = SOIL_EXIT_SIGN;
  out.push(deco('sign_arrow_1', s.x, s.y + oy, s.w, s.h, z++, { id: 'deco_soil_exit' }));
  out.push(sized('groddle_fern_1', 1330, 900, 0.75, z++));
  out.push(sized('groddle_grass_1', 420, 905, 0.6, z++));
  return out;
}

function soilFrontDecos() {
  const W = SOIL_BOUNDS.r;
  const out = [
    sized('tree_coniferous_fg_2', 15, 1060, 0.78, 0),
    sized('tree_coniferous_fg_4', 2495, 1060, 0.8, 1, { flip: true }),
  ];
  let z = out.length;
  for (let x = 1120, i = 0; x < W; x += 520 + rnd(700 + i) * 240, i += 1) {
    out.push(sized(i % 2 ? 'heights_bush_1' : 'groddle_bush1', x, 1028, 1.0 + rnd(800 + i) * 0.4, z++, i % 2 ? { flip: true } : {}));
  }
  return out;
}

/** The street's platforms (world): the lane and the block, its slope down to the lane. */
export function soilPlatforms() {
  const b = SOIL_BLOCK;
  return [
    plat('plat_soil_lane', SOIL_WALLS.l, SOIL_FLOOR_Y, SOIL_WALLS.r, SOIL_FLOOR_Y),
    plat('plat_soil_block', b.x1, b.top, b.x2, b.top),
    plat('plat_soil_slope', b.x2, b.top, b.slopeEnd, SOIL_FLOOR_Y),
  ];
}

export function soilBoxes() {
  const oy = -SOIL_BOUNDS.t;
  const f = SOIL_FINISH_BOX;
  return [{ key: 'box_finish', id: f.id, x: f.x, y: f.y + oy, w: f.w, h: f.h }];
}

export function soilStreet() {
  const B = SOIL_BOUNDS;
  const W = B.r - B.l;
  const H = B.b - B.t;
  const platforms = soilPlatforms();
  const barriers = [
    { id: 'wall_soil_left', x: SOIL_WALLS.l, y: B.t, h: SOIL_FLOOR_Y - B.t, pc_perm: null },
    { id: 'wall_soil_right', x: SOIL_WALLS.r, y: B.t, h: SOIL_FLOOR_Y - B.t, pc_perm: null },
  ];
  const layers = [
    { id: 'T_soil_sky', name: 'sky', z: -6, w: 2150, h: H, decos: soilSkyDecos(2150, H) },
    { id: 'T_soil_pines', name: 'bg_4', z: -5, w: 2230, h: H, decos: pineLine(2230, H, 0, 41), filters: { brightness: -40, saturation: -10 } },
    { id: 'T_soil_bluffs', name: 'bg_3', z: -4, w: 2320, h: H, decos: soilBluffDecos(2320, H), filters: { ...BLUFF_FILTER } },
    { id: 'T_soil_firs', name: 'bg_2', z: -3, w: 2410, h: H, decos: soilFirDecos(2410, H), filters: { brightness: -14 } },
    { id: 'middleground', name: 'middleground', z: 0, w: W, h: H, decos: toWorld(soilMiddleDecos(), B) },
    { id: 'T_soil_front', name: 'middleplus', z: 1, w: W, h: H, decos: soilFrontDecos(), filters: { brightness: -18 } },
  ];
  return shell({
    tsid: SOIL_TSID,
    label: SOIL_LABEL,
    bounds: B,
    platforms,
    layers,
    barriers,
    boxes: soilBoxes(),
    source: SOIL_SOURCE_LINE,
    why: {
      street: 'config_prod.js:1342 newxp_locations.soilappreciation_1; inc_data_maps_prod.js:18069 (hub 132 Skill Quests); no location XML.',
      bounds: 'The snaps are full-street snaps, 2500 x 1000 at 1 px a unit; the lane is at the flamingo\'s -93 (skillquest_sa.js initial_flamingo).',
      layout: 'Left to right (zoi, mackenzie, cleops snaps): the start, a grey stone, the Dirt Pile, a raised grassy block with the Patch on top (walked up from its right, where it slopes into the lane), the EXIT arrow (mackenzie) and the way out at the right.',
      art: 'CC0 groddle decos: tree_coniferous_*, pinehills_*, pinecluster_*, heights rocks tinted red-brown, heights_mound_1, evenground planes, grassSlice_f1 and corey3_grassSlice_f1, sun_01a_newxp, sign_arrow_1. The Patch and the Dirt Pile are the items\' own art.',
      ours: 'The Hoe and Shovel\'s spots near the start (they were street items), the walls at both ends and the box sizes.',
    },
  });
}

export const soilIndexEntry = indexRow;

/* ------------------------------------------------------------------ */
/* Runtime helpers                                                       */
/* ------------------------------------------------------------------ */

export const isEzCookinTsid = (tsid) => sameTsid(tsid, EZ_COOKIN_TSID);
export const isSoilTsid = (tsid) => sameTsid(tsid, SOIL_TSID);
export const isPracticeStreetTsid = (tsid) => isEzCookinTsid(tsid) || isSoilTsid(tsid);

/** The EXIT word on each street's arrow (world centre). */
export function practiceExitSign(tsid) {
  const s = isEzCookinTsid(tsid) ? EZ_EXIT_SIGN : isSoilTsid(tsid) ? SOIL_EXIT_SIGN : null;
  if (!s) return null;
  return { x: s.x - 8, y: s.y - s.h / 2 + 2, text: 'EXIT', size: 22 };
}

/** No location XML: nothing spawns on either street (the rooms place what the scripts did). */
export function practiceStreetEcology(tsid) {
  if (!isPracticeStreetTsid(tsid)) return null;
  const ez = isEzCookinTsid(tsid);
  return {
    label: ez ? EZ_COOKIN_LABEL : SOIL_LABEL,
    sourceTsid: ez ? EZ_COOKIN_SOURCE_TSID : SOIL_SOURCE_TSID,
    counts: {},
    quoins: 0,
    reconstructed: true,
  };
}

/** World to the street's screen space (what engine.player and the boxes use). */
export function practiceScreen(tsid, x, y) {
  const B = isSoilTsid(tsid) ? SOIL_BOUNDS : EZ_COOKIN_BOUNDS;
  return { x: x - B.l, y: y - B.t };
}

/** Whether a screen-space point is in a bottom-centred box. */
export function inPracticeBox(box, x, y) {
  return Boolean(box) && Math.abs(x - box.x) <= box.w / 2 && y <= box.y + 4 && y >= box.y - box.h;
}
