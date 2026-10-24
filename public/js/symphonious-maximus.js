/**
 * Symphonious Maximus, the hidden Uralia street behind Cebarkul's wooden
 * door, rebuilt (pure data and a builder: no Pixi, no DOM).
 *
 * What survives in source:
 * - GSJS inc_data_maps_prod.js 16034: hub 51 "Uralia" lists
 *   LUVR3SGQ6EF3400 "Symphonious Maximus" among its streets, but the Uralia
 *   map (maps_get_maps_51, 2135) never draws it: a hidden street. No location
 *   XML for it is in the public dump and nothing in GSJS names it again.
 * - Cebarkul's archived location (streets/mnt/stos/location_data/
 *   GIF12PMQ5121D68.xml) holds door_1354232290656 (added 2012-11-30, ten days
 *   before Glitch closed), a zutto_door_asset_wooden_door_lock in the rock
 *   spire, whose connect lands at -1925,-312 in Symphonious Maximus. The
 *   ladder up to it (ladder_1354231103669) and its ledge were placed the same
 *   day.
 * - The yellow stars: items/toy_star_1.js "Star-Jingler-mid" ("A star that
 *   plays a single note of mid tone for your ear pleasure. Try touching
 *   it!"; onPlayerCollision 26-28: announce_sound_to_all("BIG_STAR_3") and
 *   setAndBroadcastState('glow'); not_selectable) and items/toy_star_2.js
 *   "Star-Jingler-low" (BIG_STAR_1, no glow). Both were made on 2012-08-01
 *   and the public locations dump places neither anywhere, so this street
 *   is the only place they are seen. Their art is glitch-items
 *   misc/toy_star_1/toy_star_1.swf (CC0): state "1" a yellow star, state
 *   "glow" 29 frames at 24 fps through a colour matrix from near white back
 *   to yellow. Nothing resets the state, so a touched star keeps cycling
 *   its glow (the video's stars are the pale cycle, not the rest yellow).
 *
 * Everything else is read off Lily Linguistic's visit (video 7SzDOzodeDQ,
 * t0012-t0175; reference only, no pixels or audio), measured at ~2.36 world
 * px per video px (the avatar is ~55 video px against the remake's 130),
 * with the client minimap and the loading card for the whole-street layout:
 * - a Uralia night: navy sky, deep violet higher up; pale mint peaks.
 * - a pale mint floor with craters. Walking into a crater throws the avatar
 *   high into the sky (t0038-t0046, t0094-t0098), so the craters are bounce
 *   pads (rebuilt as location event boxes, like the fungal wall shrooms).
 * - red, purple, teal and green mushroom trees, the twisted shelf tree with
 *   a dark doorway, a stone arch.
 * - left: a grid of stars over the first crater (two outer columns of 3,
 *   three inner columns of 3, half a row apart), and small floating islands
 *   stepping up from it.
 * - up top: a row of floating islands (teal, yellow, big lilac with a smaller
 *   one under it, yellow, yellow) hung with vines, rows of stars over each,
 *   three big stars in the gaps, a teal ladder from the floor up to the
 *   fourth island, and the Cebarkul signpost on the last one (t0128).
 * Four player Snaps (G104: research/wayback/raw/snaps/symphonious_maximus/,
 * Dec 2012, reference only) add: big white glow orbs, each a disc in a thin
 * dark gap and a pale ring, at several sizes, in the sky among the trees and
 * under the islands (GLOW_ORBS; no CC0 art has them, so they are clean
 * vectors, drawn and slowly drifted by the feature as in the video); a
 * purple-brown hexagon-patterned soil band under the mint floor with a
 * music-note burrow (zutto1.swf ground_large_2, SOIL_NOTES) and a striped
 * caterpillar (ground_caterpillar); vines with a hook under the islands
 * (liana_2).
 * Not rebuilt: the music (none is listed for the street in
 * inc_data_sounds.js).
 *
 * Art: CC0 Uralia (zutto1.swf street bundle) decos already in assets/decos,
 * and the Star-Jingler frames rendered from toy_star_1.swf
 * (tools/symphonious-maximus-art.py). tools/build-symphonious-maximus.mjs
 * writes the street JSON, its index row and Cebarkul's door target;
 * features/symphonious-maximus-feature.js runs the stars.
 */

export const SYMPHONIOUS_TSID = 'GUVR3SGQ6EF3400';
export const SYMPHONIOUS_SOURCE_TSID = 'LUVR3SGQ6EF3400';
export const SYMPHONIOUS_LABEL = 'Symphonious Maximus';
export const SYMPHONIOUS_HUB = Object.freeze({ hubId: '51', hubName: 'Uralia' });
export const CEBARKUL_TSID = 'GIF12PMQ5121D68';
export const CEBARKUL_SOURCE_TSID = 'LIF12PMQ5121D68';
export const CEBARKUL_DOOR = 'door_1354232290656';
/** The door's connect x/y: world, in Symphonious Maximus. */
export const SYMPHONIOUS_ARRIVE = Object.freeze({ x: -1925, y: -312 });
export const SYMPHONIOUS_SOURCE =
  "reconstruction: Symphonious Maximus (LUVR3SGQ6EF3400, not in tinyspeck/glitch-locations); layout from video 7SzDOzodeDQ, art CC0 zutto1.swf decos and glitch-items toy_star_1.swf";

/** True for the street under either TSID prefix (G as imported, L as GSJS names it). */
export const isSymphoniousTsid = (tsid) => String(tsid || '').slice(1) === SYMPHONIOUS_TSID.slice(1);

/** World px per video px (avatar ~55 video px, 130 in the remake). */
export const VIDEO_SCALE = 2.36;

const L = -2400;
const R = 3400;
const T = -2200;
const B = 0;
export const SYMPHONIOUS_BOUNDS = Object.freeze({ l: L, r: R, t: T, b: B });
const W = R - L;
const H = B - T;
const screen = (x, y) => ({ x: Math.round(x - L), y: Math.round(y - T) });

/** The floor's walk line (the door's arrival y). */
export const GROUND_Y = -312;

/* ------------------------------------------------------------------ */
/* Stars (items/toy_star_1.js)                                          */
/* ------------------------------------------------------------------ */

export const STAR_JINGLER = Object.freeze({
  classTsid: 'toy_star_1',
  label: 'Star-Jingler-mid',
  sound: 'BIG_STAR_3',
  /** toy_star_1.swf stage at x1 (getAssetInfo position w/h 46x42). */
  w: 46,
  h: 42,
  /** The "glow" label: frames 2-30 at the SWF's 24 fps. */
  glowFrames: 29,
  glowMs: Math.round((29 / 24) * 1000),
  art: 'assets/sprites/symphonious/toy_star_1@3x.webp',
  glowArt: 'assets/sprites/symphonious/toy_star_1_glow@3x.webp',
});

/** The remake avatar's body box for a star touch (feet x, y; ~130 px tall). */
export const AVATAR_BODY = Object.freeze({ w: 56, h: 124 });

const grid = [];
// Star grid over the first crater (t0039-t0046, t0159-t0175): world x of the
// five columns, rows above the floor read off f41/f168.
const OUTER = [-1776, -1005];
const INNER = [-1557, -1363, -1170];
for (const x of OUTER) for (const up of [373, 618, 864]) grid.push([x, GROUND_Y - up]);
for (const x of INNER) for (const up of [250, 503, 755]) grid.push([x, GROUND_Y - up]);

const row = (x0, step, n, y) => Array.from({ length: n }, (_, i) => [x0 + i * step, y]);

/**
 * Star-Jinglers: world centre x, y. `where` names the cluster.
 */
export const STARS = Object.freeze([
  ...grid.map(([x, y]) => ({ x, y, where: 'grid' })),
  ...row(-645, 150, 4, -1540).map(([x, y]) => ({ x, y, where: 'teal island' })),
  ...row(125, 170, 4, -1560).map(([x, y]) => ({ x, y, where: 'first yellow island' })),
  ...row(210, 170, 3, -1640).map(([x, y]) => ({ x, y, where: 'first yellow island, high' })),
  ...row(1045, 170, 4, -1620).map(([x, y]) => ({ x, y, where: 'lilac island' })),
  ...row(1945, 170, 4, -1580).map(([x, y]) => ({ x, y, where: 'ladder island' })),
  ...row(2030, 170, 3, -1680).map(([x, y]) => ({ x, y, where: 'ladder island, high' })),
  ...row(2760, 130, 3, -1590).map(([x, y]) => ({ x, y, where: 'signpost island' })),
  // Among the mushroom trees on the floor (t0057-t0063, t0100-t0110).
  ...[
    [-300, -470], [-120, -560], [60, -500], [240, -610], [420, -480], [600, -560],
    [1000, -620], [1180, -470], [1700, -520], [1900, -600], [2380, -500],
  ].map(([x, y]) => ({ x, y, where: 'mushroom trees' })),
].map((s, i) => Object.freeze({ id: `star_${String(i + 1).padStart(2, '0')}`, ...s })));

/** The three big stars in the island gaps: decoration only (items had one size). */
export const BIG_STARS = Object.freeze([
  Object.freeze({ x: -50, y: -1290, scale: 2.2 }),
  Object.freeze({ x: 805, y: -1290, scale: 2.2 }),
  Object.freeze({ x: 1785, y: -1270, scale: 2.2 }),
]);

/** Did an avatar with feet at (px, py) touch the star (both screen space)? */
export function touchesStar(star, px, py, body = AVATAR_BODY) {
  const sx0 = star.x - STAR_JINGLER.w / 2;
  const sx1 = star.x + STAR_JINGLER.w / 2;
  const sy0 = star.y - STAR_JINGLER.h / 2;
  const sy1 = star.y + STAR_JINGLER.h / 2;
  return px + body.w / 2 >= sx0 && px - body.w / 2 <= sx1 && py >= sy0 && py - body.h <= sy1;
}

/**
 * The glow cycle: the overlay (state "glow" frame 2, near white) fades to
 * nothing over the 29 frames, then the cycle starts again.
 * @returns {number} overlay alpha 0..1
 */
export function glowAlpha(sinceMs) {
  if (!(sinceMs >= 0)) return 0;
  return 1 - (sinceMs % STAR_JINGLER.glowMs) / STAR_JINGLER.glowMs;
}

/* ------------------------------------------------------------------ */
/* Floor and craters                                                   */
/* ------------------------------------------------------------------ */

export const CRATER_DEPTH = 56;
/** Bounce: the fungal shroom recipe (gravity x -7.5) held long enough to clear the star grid. */
export const CRATER_BOUNCE = Object.freeze({ param: 'gravity', value: -7.5, duration: 1400 });

export const CRATERS = Object.freeze([
  { id: 'c1', x: -1360, w: 520, shaft: true, why: 'under the star grid: the first bounce (t0038-t0046) lands in the grid' },
  { id: 'c2', x: -660, w: 330, why: 'the smaller crater right of the purple mushroom (f39)' },
  { id: 'c3', x: 40, w: 380, shaft: true, why: 'in front of the green mushroom trees: she walks in and is thrown up (t0094-t0098)' },
  { id: 'c4', x: 880, w: 420, why: 'by the twisted shelf tree (t0058-t0063)' },
  { id: 'c5', x: 1560, w: 400, shaft: true, why: 'by the blue mushroom and the arch: the bounce reaches the lilac island (t0064-t0075)' },
  { id: 'c6', x: 2230, w: 360, why: 'left of the ladder (t0134)' },
].map((c) => Object.freeze(c)));

function groundPoints() {
  const pts = [[L, GROUND_Y]];
  for (const c of CRATERS) {
    const bottom = GROUND_Y + CRATER_DEPTH;
    pts.push([c.x - c.w / 2, GROUND_Y], [c.x - c.w / 4, bottom], [c.x + c.w / 4, bottom], [c.x + c.w / 2, GROUND_Y]);
  }
  pts.push([R, GROUND_Y]);
  return pts;
}

/* ------------------------------------------------------------------ */
/* Floating islands                                                    */
/* ------------------------------------------------------------------ */

/**
 * Top edge of each island deco (first opaque row per column, as a fraction
 * of the deco height) at x = 0.05 .. 0.95 of its width, measured from the
 * deco WebPs' alpha (tools/symphonious-maximus-art.py --profiles).
 */
export const ISLAND_PROFILES = Object.freeze({
  flying_platform_1: [0.13, 0.12, 0.11, 0.11, 0.07, 0.07, 0.07, 0.06, 0.07, 0.0, 0.01, 0.02, 0.03, 0.05, 0.06, 0.07, 0.12, 0.2, 0.22],
  flying_platform_2: [0.22, 0.19, 0.17, 0.08, 0.03, 0.04, 0.08, 0.11, 0.11, 0.03, 0.13, 0.09, 0.14, 0.14, 0.15, 0.16, 0.18, 0.18, 0.21],
  flying_platform_3: [0.14, 0.11, 0.1, 0.1, 0.06, 0.01, 0.0, 0.0, 0.01, 0.02, 0.02, 0.03, 0.02, 0.02, 0.04, 0.05, 0.07, 0.1, 0.17],
  flying_platform_4: [0.19, 0.13, 0.1, 0.07, 0.05, 0.04, 0.03, 0.02, 0.02, 0.02, 0.03, 0.03, 0.04, 0.06, 0.08, 0.09, 0.11, 0.14, 0.18],
  flying_platform_5: [0.27, 0.25, 0.23, 0.22, 0.14, 0.1, 0.15, 0.19, 0.17, 0.18, 0.19, 0.18, 0.16, 0.09, 0.22, 0.22, 0.22, 0.23, 0.26],
  flying_platform_6: [0.21, 0.13, 0.1, 0.1, 0.1, 0.11, 0.1, 0.08, 0.06, 0.04, 0.04, 0.03, 0.04, 0.11, 0.12, 0.14, 0.15, 0.17, 0.2],
});
/** Deco logical size (the WebP's pixel size). */
const DECO_SIZE = Object.freeze({
  flying_platform_1: [940, 552],
  flying_platform_2: [1036, 770],
  flying_platform_3: [692, 228],
  flying_platform_4: [396, 184],
  flying_platform_5: [334, 250],
  flying_platform_6: [890, 450],
});
/** Feet stand a little into the snow or grass. */
const SINK = 8;

export const ISLANDS = Object.freeze([
  { id: 'teal_small', sprite: 'flying_platform_4', x: -1200, top: -1250, s: 0.75, why: 'small teal island above the grid, where the first bounce can land (f41: right of the grid)' },
  { id: 'lilac_small', sprite: 'flying_platform_5', x: -880, top: -1340, s: 0.8, why: 'small lilac island, one step up (f41 top right, t0106)' },
  { id: 'teal', sprite: 'flying_platform_3', x: -420, top: -1400, s: 1.0, why: 'first of the top row: snowy mint (minimap 28-41%, t0107-t0110)' },
  { id: 'yellow_a', sprite: 'flying_platform_6', x: 380, top: -1440, s: 0.9, why: 'lit yellow top (minimap 45-58%, t0111-t0116)' },
  { id: 'lilac', sprite: 'flying_platform_2', x: 1300, top: -1480, s: 0.9, why: 'the big lilac island with a smaller one under it (minimap 61-76%, t0117-t0121)' },
  { id: 'yellow_b', sprite: 'flying_platform_1', x: 2200, top: -1460, s: 0.85, why: 'yellow island with the ladder at its right end (t0122-t0131)' },
  { id: 'yellow_c', sprite: 'flying_platform_6', x: 2960, top: -1470, s: 0.7, flip: true, why: 'the last island, with the Cebarkul signpost (t0128-t0129)' },
].map((i) => Object.freeze(i)));

const median3 = (a, i) => {
  const v = [a[Math.max(0, i - 1)], a[i], a[Math.min(a.length - 1, i + 1)]].sort((p, q) => p - q);
  return v[1];
};

/** An island's walk line: world points left to right. */
export function islandPoints(island) {
  const [lw, lh] = DECO_SIZE[island.sprite];
  const w = lw * island.s;
  const h = lh * island.s;
  const prof = ISLAND_PROFILES[island.sprite];
  const pts = [];
  for (let i = 0; i < prof.length; i += 1) {
    const f = 0.05 + i * 0.05;
    const src = island.flip ? prof.length - 1 - i : i;
    const y = island.top + median3(prof, src) * h + SINK;
    pts.push([Math.round(island.x - w / 2 + f * w), Math.round(y)]);
  }
  return pts;
}

/** Walk-line y at world x on an island (null off it). */
export function islandYAt(island, x) {
  const pts = islandPoints(island);
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    if (x >= x1 && x <= x2) return y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
  }
  return null;
}

const islandById = (id) => ISLANDS.find((i) => i.id === id);

/* ------------------------------------------------------------------ */
/* Ladder and signpost                                                 */
/* ------------------------------------------------------------------ */

export const LADDER = Object.freeze({ id: 'ladder_sym_1', x: 2560, w: 110, island: 'yellow_b', why: 'teal ladder from the floor to the right end of the fourth island (t0130-t0140)' });
export const SIGNPOST = Object.freeze({ id: 'signpost_sym_1', x: 3080, island: 'yellow_c', why: '"Cebarkul" on a post at the right of the last island (t0128)' });

export function ladderGeometry() {
  const top = Math.round(islandYAt(islandById(LADDER.island), LADDER.x) - 10);
  return { id: LADDER.id, x: LADDER.x, y: GROUND_Y, w: LADDER.w, h: GROUND_Y - top, top };
}

/* ------------------------------------------------------------------ */
/* Decos                                                               */
/* ------------------------------------------------------------------ */

const deco = (sprite, x, y, w, h, z, extra = {}) => ({ sprite, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z, r: 0, ...extra });

/** Middleground props: [sprite, world x, bottom y, logical w, h, scale, z, flip]. */
const PROPS = [
  // Far left (t0034): a lilac snowy rock bush.
  ['zutto_platform_1', -2250, -300, 486, 460, 0.8, 20],
  ['purple_mushroom_3', -2050, -318, 168, 140, 0.7, 41],
  // The red spotted mushroom over the first crater (f39 x 240).
  ['tree_15', -1460, -330, 188, 228, 1.6, 30],
  ['tree_8', -1100, -326, 512, 842, 0.45, 26],
  ['tree_14', -930, -322, 460, 422, 0.55, 32],
  ['zutto_plant_2', -1780, -312, 202, 186, 0.6, 44],
  ['plant_giant_fern_1', -1640, -305, 86, 188, 0.6, 45],
  ['tree_11', -480, -330, 332, 570, 0.85, 28],
  // The green mushroom trees with fern spirals and stars on their trunks.
  ['zutto_platform_3', -150, -322, 280, 300, 1.2, 24],
  ['zutto_platform_2', 120, -318, 302, 212, 1.1, 33],
  ['platform_4', 330, -316, 180, 132, 1.3, 36],
  ['zutto_platform_3', 520, -322, 280, 300, 1.0, 25, true],
  ['zutto_platform_2', 700, -318, 302, 212, 0.9, 34],
  ['tree_7', 260, -330, 256, 418, 0.7, 18],
  // The twisted shelf tree and the stump with a dark doorway (t0058-t0063).
  ['tree_8', 900, -330, 512, 842, 0.95, 22],
  ['tree_int_enter', 1030, -320, 920, 1434, 0.4, 35],
  ['tree_10', 1180, -326, 292, 364, 0.9, 27],
  ['tree_14', 1310, -322, 460, 422, 0.5, 31],
  ['tree_12', 1460, -330, 320, 362, 1.1, 29],
  ['tree_4', 1820, -318, 508, 236, 0.8, 37],
  ['tree_11', 2060, -330, 332, 570, 0.9, 28],
  ['tree_13', 2390, -326, 450, 408, 0.8, 26],
  ['tree_15', 2830, -330, 188, 228, 1.2, 30],
  ['tree_12', 3150, -330, 320, 362, 0.9, 29],
  ['tree_6', 3320, -330, 368, 476, 0.7, 23, true],
  // Small plants along the floor.
  ['zutto_plant_1', -1250, -312, 82, 106, 1.1, 46],
  ['zutto_plant_3', -380, -312, 118, 110, 1.1, 46],
  ['zutto_plant_2', 1250, -312, 202, 186, 0.5, 46],
  ['purple_mushroom_1', 1680, -316, 90, 118, 1.2, 47],
  ['zutto_plant_1', 2700, -312, 82, 106, 1.1, 46],
  ['plant_fern_1', -820, -310, 62, 142, 0.8, 48],
  ['plant_fern_4', 600, -310, 58, 154, 0.8, 48],
  ['plant_fern_2', 2000, -310, 72, 144, 0.8, 48],
  ['purple_mushroom_2', 3000, -316, 42, 96, 1.2, 47],
];

/** Vines hung under the islands (the islands' own art has some); liana_2 ends in the Snaps' hook. */
const VINES = [
  ['liana_2', 1180, -900, 102, 316, 0.7, 8],
  ['liana_2', 2330, -1010, 102, 316, 0.6, 8, true],
  ['liana_1', -360, -1210, 332, 436, 0.5, 8],
  ['liana_5', 300, -1160, 298, 272, 0.6, 8],
  ['liana_6', 560, -1180, 342, 230, 0.5, 8, true],
  ['liana_1', 1240, -1000, 332, 436, 0.55, 8, true],
  ['liana_5', 2100, -1120, 298, 272, 0.6, 8],
  ['liana_3', 2380, -1150, 456, 362, 0.5, 8],
];

function middlegroundDecos() {
  const out = [];
  for (const [sprite, x, y, lw, lh, s, z, flip] of [...PROPS, ...VINES]) {
    out.push(deco(sprite, x, y, lw * s, lh * s, z, flip ? { flip: true } : {}));
  }
  for (const isl of ISLANDS) {
    const [lw, lh] = DECO_SIZE[isl.sprite];
    out.push(deco(isl.sprite, isl.x, isl.top + lh * isl.s, lw * isl.s, lh * isl.s, 60, { id: `island_${isl.id}`, ...(isl.flip ? { flip: true } : {}) }));
  }
  // Ladder art: zutto stone ladder tiles stacked from the floor to the island,
  // each shifted so its two rails line up (rail midpoint measured per tile).
  const lad = ladderGeometry();
  const k = 0.75;
  const step = 100 * k;
  const TILES = {
    ladder_tile_cap_1_stone: [150, 100, 71],
    zutto_ladder_tile_center_01_stone: [140, 100, 71],
    zutto_ladder_tile_center_02_stone: [140, 100, 71],
    zutto_ladder_tile_center_03_stone: [142, 110, 71],
    ladder_tile_cap_0_stone: [140, 100, 60],
  };
  const n = Math.ceil(lad.h / step);
  for (let i = 0; i < n; i += 1) {
    const sprite = i === 0 ? 'ladder_tile_cap_1_stone' : i === n - 1 ? 'ladder_tile_cap_0_stone' : `zutto_ladder_tile_center_0${(i % 3) + 1}_stone`;
    const [lw, lh, mid] = TILES[sprite];
    out.push(deco(sprite, lad.x + (lw / 2 - mid) * k, lad.y - i * step + 6, lw * k, lh * k, 70 + i));
  }
  return out;
}

/**
 * Pale peaks behind the floor, on two parallax layers (G104). The video's
 * client view is ~1,500 x 1,000 world px, so at floor level its peaks fill
 * the lower two thirds and leave navy sky above and between them; the
 * remake's 408 px view would show only their pale feet at full size. So the
 * peaks are drawn small enough for the same framing in 408 px: at the floor
 * the near peaks rise ~150-250 px and the far ones ~200-270 px above the
 * floor's back edge, with navy above and between them. They sink at half
 * to 0.7 of the climb (feet always hidden behind the floor while it is in
 * view), so the star grid has the far peaks in its lower half and the
 * island row has none, as in t0039-t0046 and t0105-t0129.
 * [sprite, height] in order; each deco keeps its art's aspect.
 */
const HILL_ASPECT = Object.freeze({
  bck_hill_1: 598 / 610, bck_hill_2: 1108 / 742, bck_hill_4: 330 / 458, bck_hill_5: 336 / 476,
  bck_hill_8: 656 / 640, bck_hill_12: 342 / 438, bck_hill_14: 412 / 368, bck_hill_15: 428 / 470,
  bck_hill_16: 452 / 506, bck_hill_17: 410 / 576,
});
const PEAKS_NEAR = [
  ['bck_hill_14', 200], ['bck_hill_12', 275], ['bck_hill_15', 230], ['bck_hill_2', 190], ['bck_hill_17', 290],
  ['bck_hill_16', 235], ['bck_hill_5', 255], ['bck_hill_14', 215], ['bck_hill_4', 270], ['bck_hill_15', 205],
  ['bck_hill_12', 250], ['bck_hill_2', 200], ['bck_hill_16', 280], ['bck_hill_17', 225],
];
const PEAKS_FAR = [
  ['bck_hill_2', 300], ['bck_hill_17', 355], ['bck_hill_8', 310], ['bck_hill_1', 335],
  ['bck_hill_16', 360], ['bck_hill_2', 290], ['bck_hill_15', 345], ['bck_hill_17', 325],
];
/** Vertical parallax rate of the near and far peak layers (1 = moves with the floor). */
export const PEAK_RATE = Object.freeze({ near: 0.7, far: 0.5 });
/** Screen y of the peaks' feet with the avatar on the floor (the floor's back edge is ~288). */
const PEAK_FEET = Object.freeze({ near: 330, far: 390 });
/** percY with the avatar on the floor (camera y 1582 of 1792 in a 408 px view). */
const FLOOR_PERC_Y = 1582 / (H - 408);

/** A parallax layer height for a vertical rate (the client's percY rule over a 408 px view). */
const layerHeightFor = (rate) => Math.round(408 + rate * (H - 408));
/** Layer y of the peaks' feet, so they stand at `feet` on screen with the avatar on the floor. */
const peakBase = (rate, feet) => Math.round(feet + FLOOR_PERC_Y * (layerHeightFor(rate) - 408));

/** Peaks laid out left to right in groups of three with a sky gap after each group. */
function peakDecos(list, { start, step, gap, base, width }) {
  const out = [];
  let x = start;
  let i = 0;
  while (x < width + step) {
    const [sprite, h] = list[i % list.length];
    const w = h * HILL_ASPECT[sprite];
    out.push(deco(sprite, x, base, w, h, i, i % 3 === 1 ? { flip: true } : {}));
    i += 1;
    x += step + (i % 3 === 0 ? gap : 0);
  }
  return out;
}
const SKY = [
  ['zutto_stars_1', 600, 500, 1777, 455], ['stars_2', 1700, 820, 1374, 383], ['zutto_stars_1', 2600, 380, 1777, 455],
  ['stars_3', 3200, 700, 396, 260], ['stars_2', 3600, 300, 1374, 383], ['stars_3', 900, 1000, 396, 260],
  ['zutto_stars_1', 3400, 1050, 1777, 455], ['stars_3', 2100, 1150, 396, 260],
];

/** Floor layer: mint surface shapes, crater bowls, flower sprinkles (screen space). */
function floorDecos() {
  const out = [];
  const surfaces = ['ground_surface_1', 'grass_surface_5', 'ground_surface_2', 'grass_surface_4'];
  const sizes = { ground_surface_1: [1280, 204], grass_surface_5: [1430, 166], ground_surface_2: [1406, 184], grass_surface_4: [1184, 158] };
  let k = 0;
  for (let x = L - 200; x < R + 400; x += 900) {
    const sprite = surfaces[k % surfaces.length];
    const [lw, lh] = sizes[sprite];
    // Bottom edge just over the soil band's frost fringe (G104); the top stays where it was.
    const p = screen(x, FLOOR_BOTTOM_Y);
    out.push(deco(sprite, p.x, p.y, lw * 1.15, FLOOR_BOTTOM_Y + 366, 1 + (k % 3), k % 2 ? { flip: true } : {}));
    k += 1;
  }
  for (const c of CRATERS) {
    const p = screen(c.x, GROUND_Y + CRATER_DEPTH + 20);
    out.push(deco('cave_gr_hole_1', p.x, p.y, c.w * 0.92, c.w * 0.24, 10, { id: `crater_${c.id}` }));
  }
  // Low mounds along the back edge, so the floor meets the peaks in a ragged line.
  const mounds = [['grass_hill', 786, 146, 0.6], ['hillock_1', 332, 134, 0.6], ['zutto_hill_3', 998, 250, 0.45], ['ground_hill_1', 318, 82, 0.8], ['grass_stone_2', 188, 62, 1.0]];
  k = 0;
  for (let x = L + 120; x < R; x += 270) {
    k += 1;
    if (CRATERS.some((c) => Math.abs(x - c.x) < c.w / 2 + 60)) continue;
    const [sprite, lw, lh, sc] = mounds[k % mounds.length];
    const p = screen(x, GROUND_Y + 12);
    out.push(deco(sprite, p.x, p.y, lw * sc, lh * sc, 5 + (k % 4), k % 2 ? { flip: true } : {}));
  }
  const sprinkles = ['grass_texture_1', 'grass_texture_2', 'grass_texture_3'];
  k = 0;
  for (let x = L + 300; x < R; x += 640) {
    const p = screen(x + ((k * 137) % 200), -170 - ((k * 53) % 90));
    out.push(deco(sprinkles[k % 3], p.x, p.y, 375, 55, 20));
    k += 1;
  }
  return out;
}

/**
 * Top of the purple soil band under the mint floor (G104). The Snaps and the
 * video put it ~190 world px under the walk line, below the remake's 408 px
 * view, so the band (squashed to 210 px) is raised to show in the bottom of
 * the view from ~115 px down, as the peaks were scaled down. It is its own
 * layer between the floor base and the pale floor surfaces: the surfaces end
 * at FLOOR_BOTTOM_Y over its mint cap, so only the frost fringe and the
 * purple soil show under them (the cap's unfiltered teal would not match the
 * filtered floor).
 */
export const SOIL_TOP_Y = GROUND_Y + 55;
const SOIL_H = 210;
/** Bottom edge of the floor surfaces (world y), a little under a crater's bowl (GROUND_Y + 76). */
export const FLOOR_BOTTOM_Y = GROUND_Y + 105;

/** Music-note burrows: zutto1.swf ground_large_2's top (tools/symphonious-maximus-art.py --soil), world centre x. */
export const SOIL_NOTES = Object.freeze([
  Object.freeze({ x: -420, why: 'between the two left craters (Snap 248938: under the floor near a crater)' }),
  Object.freeze({ x: 2760, why: 'right of the ladder' }),
]);
export const SOIL_NOTE_ART = Object.freeze({ file: 'assets/sprites/symphonious/ground_large_2_top@2x.webp', w: 420, h: 128, dy: 12 });
/** Striped caterpillars in the soil (ground_caterpillar), world x: one beside each note as in the Snap, one more. */
export const SOIL_CATERPILLARS = Object.freeze([-250, 1300, 2930]);

/**
 * The soil band with its frost fringe (layer T_sym_soil, screen space):
 * ground_2 end to end, every other one flipped, so each join meets its own
 * mirror image and shows no seam.
 */
function soilDecos() {
  const out = [];
  const SOIL_W = 984;
  let k = 0;
  // 6 px overlap so no hairline shows between neighbours (their end columns are half transparent).
  for (let x = L - SOIL_W / 2; x < R + SOIL_W; x += SOIL_W - 6) {
    const p = screen(x, SOIL_TOP_Y + SOIL_H);
    out.push(deco('ground_2', p.x, p.y, SOIL_W, SOIL_H, 1, { id: `sym_soil_${k + 1}`, ...(k % 2 ? { flip: true } : {}) }));
    k += 1;
  }
  SOIL_CATERPILLARS.forEach((x, i) => {
    const p = screen(x, SOIL_TOP_Y + 66 + 68);
    out.push(deco('ground_caterpillar', p.x, p.y, 76, 68, 4, i % 2 ? { flip: true } : {}));
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Glow orbs (G104)                                                    */
/* ------------------------------------------------------------------ */

/**
 * The Snaps' orb, measured on the biggest (Snap 248953): a white disc of
 * 0.68 R, a dark navy gap to 0.81 R, then a pale ring to R (~40% white).
 */
export const ORB_SHAPE = Object.freeze({ disc: 0.68, gap: 0.81, ringAlpha: 0.4, gapColor: 0x0d2b4c, gapAlpha: 0.85 });
/** A slow drift (the video's orbs float; the Snaps freeze them): px and period. */
export const ORB_DRIFT = Object.freeze({ amp: 10, periodMs: 7000 });
/**
 * Orbs: world x, height above the floor, outer radius R. Ring diameters in
 * the Snaps run ~15-47 Snap px (~36-113 world px at ~2.4 world px per Snap
 * px); they sit among the treetops and under the islands, clear of the stars.
 */
export const GLOW_ORBS = Object.freeze([
  [-2150, 520, 34], [-1900, 230, 22], [-1660, 470, 46], [-860, 640, 28], [-560, 740, 40], [-250, 680, 52],
  [150, 640, 24], [480, 250, 44], [800, 560, 30], [1150, 260, 26], [1600, 380, 48], [2000, 520, 36],
  [2440, 250, 24], [2800, 600, 50], [3150, 240, 30], [3300, 760, 20],
].map(([x, up, r]) => Object.freeze({ x, y: GROUND_Y - up, r })));

/** Floor base: one opaque white block tinted the video's floor mint, so no sky shows between the surface shapes. */
function floorBaseDecos() {
  const p = screen((L + R) / 2, 80);
  return [deco('mask_white', p.x, p.y, W + 200, 410, 0)];
}

/**
 * Light shafts over three craters: the cone turned over (rotated about its
 * top), so it fades out upward and its hard narrow end sits behind the floor.
 * Its own layer between the peaks and the floor (screen space).
 */
function shaftDecos() {
  return CRATERS.filter((c) => c.shaft).map((c) => {
    const top = screen(c.x, -1300);
    const bottom = screen(c.x, GROUND_Y + 10);
    return deco('cave_shaft_light_1', top.x, top.y, 700, bottom.y - top.y, 0, { r: 180 });
  });
}

/** Sky fade: object_floor_fade turned over (opaque at the top) and tinted violet. */
function skyFadeDecos() {
  return [deco('object_floor_fade', W / 2, 0, W + 400, 1500, 0, { r: 180 })];
}

function parallaxLayer(id, name, z, w, h, decos, filters = null) {
  return { id, name, z, w, h, decos, ...(filters ? { filters } : {}) };
}

function layers() {
  const nearW = Math.round(W * 0.88);
  const farW = Math.round(W * 0.72);
  const skyW = Math.round(W * 0.62);
  const nearH = layerHeightFor(PEAK_RATE.near);
  const farH = layerHeightFor(PEAK_RATE.far);
  const near = peakDecos(PEAKS_NEAR, { start: 80, step: 250, gap: 260, base: peakBase(PEAK_RATE.near, PEAK_FEET.near), width: nearW });
  const far = peakDecos(PEAKS_FAR, { start: 220, step: 340, gap: 300, base: peakBase(PEAK_RATE.far, PEAK_FEET.far), width: farW });
  return [
    parallaxLayer('T_sym_skyfade', 'sky fade', -9, W, H, skyFadeDecos(), { tintColor: 0x1b0d33, tintAmount: 100 }),
    parallaxLayer('sky', 'sky', -8, skyW, Math.round(H * 0.8), SKY.map(([s, x, y, w, h], i) => deco(s, x, y, w, h, i))),
    parallaxLayer('bg_peaks_far', 'far peaks', -7, farW, farH, far, { brightness: -25, saturation: -15 }),
    parallaxLayer('bg_peaks', 'peaks', -6, nearW, nearH, near, { brightness: -8 }),
    parallaxLayer('T_sym_shafts', 'light shafts', -4, W, H, shaftDecos()),
    parallaxLayer('T_sym_floorbase', 'floor base', -3, W, H, floorBaseDecos(), { tintColor: 0x8dc3cb, tintAmount: 100 }),
    parallaxLayer('T_sym_soil', 'soil', -2.5, W, H, soilDecos(), { brightness: 12, saturation: -15 }),
    parallaxLayer('T_sym_floor', 'floor', -2, W, H, floorDecos(), { saturation: -40, brightness: 50 }),
    { id: 'middleground', name: 'middleground', z: 0, w: W, h: H, decos: middlegroundDecos() },
  ];
}

/* ------------------------------------------------------------------ */
/* Street                                                              */
/* ------------------------------------------------------------------ */

function polyline(prefix, pts) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    if (x2 - x1 < 1) continue;
    out.push({ id: `${prefix}_${out.length + 1}`, x1, y1, x2, y2, pc_perm: -1 });
  }
  return out;
}

/** Crater bounce boxes (screen space, bottom-centre) and their events. */
export function craterEventBoxes() {
  return CRATERS.map((c) => {
    const p = screen(c.x, GROUND_Y + CRATER_DEPTH);
    return { id: `bounce_${c.id}`, x: p.x, y: p.y, w: Math.round(c.w / 2 - 20), h: 40, onEnter: ['crater_bounce'], onExit: [], source: 'crater (video 7SzDOzodeDQ)' };
  });
}

export function symphoniousEvents() {
  return {
    crater_bounce: [{ type: 'physics', param: CRATER_BOUNCE.param, value: CRATER_BOUNCE.value, duration: CRATER_BOUNCE.duration, all: false }],
  };
}

/**
 * The street JSON. `cebarkulArrive` is the signpost's landing in Cebarkul
 * (its screen space: in front of the wooden door), filled in by the builder.
 */
export function symphoniousStreet({ cebarkulArrive = null } = {}) {
  const platforms = [
    ...polyline('plat_sym_ground', groundPoints()),
    ...ISLANDS.flatMap((isl) => polyline(`plat_sym_${isl.id}`, islandPoints(isl))),
  ];
  const lad = ladderGeometry();
  const signIsland = islandById(SIGNPOST.island);
  const signY = Math.round(islandYAt(signIsland, SIGNPOST.x));
  const ls = layers();
  const decoCount = ls.reduce((n, l) => n + l.decos.length, 0);
  const stars = STARS.map((s) => ({ id: s.id, ...screen(s.x, s.y) }));
  const bigStars = BIG_STARS.map((s) => ({ ...screen(s.x, s.y), scale: s.scale }));
  return {
    source: SYMPHONIOUS_SOURCE,
    reconstructed: true,
    tsid: SYMPHONIOUS_TSID,
    label: SYMPHONIOUS_LABEL,
    hubId: SYMPHONIOUS_HUB.hubId,
    hubName: SYMPHONIOUS_HUB.hubName,
    swf_file: 'zutto1.swf',
    bounds: { ...SYMPHONIOUS_BOUNDS },
    platforms,
    layers: ls,
    signposts: [{
      id: SIGNPOST.id,
      x: SIGNPOST.x,
      y: signY,
      w: 150,
      h: 200,
      connects: [{ tsid: CEBARKUL_SOURCE_TSID, label: 'Cebarkul', hub_id: SYMPHONIOUS_HUB.hubId, ...(cebarkulArrive ? { arrive: { ...cebarkulArrive } } : {}) }],
    }],
    stats: {
      platformCount: platforms.length,
      layerCount: ls.length,
      decoCount,
      signpostCount: 1,
      doorCount: 0,
      ladderCount: 1,
      barrierCount: 0,
    },
    gradient: { top: '163460', bottom: '215A76' },
    ladders: [{ id: lad.id, x: lad.x, y: lad.y, w: lad.w, h: lad.h }],
    events: symphoniousEvents(),
    eventBoxes: craterEventBoxes(),
    starJinglers: { classTsid: STAR_JINGLER.classTsid, sound: STAR_JINGLER.sound, stars, bigStars },
    glowOrbs: { shape: { ...ORB_SHAPE }, drift: { ...ORB_DRIFT }, orbs: GLOW_ORBS.map((o, i) => ({ id: `orb_${i + 1}`, ...screen(o.x, o.y), r: o.r })) },
    soilArt: SOIL_NOTES.map((n) => ({ file: SOIL_NOTE_ART.file, ...screen(n.x, SOIL_TOP_Y + SOIL_NOTE_ART.dy), w: SOIL_NOTE_ART.w, h: SOIL_NOTE_ART.h })),
    why: {
      street: 'inc_data_maps_prod.js 16034 (hub 51); no location XML. Cebarkul door_1354232290656 (2012-11-30) arrives at -1925,-312.',
      layout: 'Video 7SzDOzodeDQ t0012-t0175 at 2.36 world px per video px, with its minimap and loading card for the whole street.',
      stars: 'items/toy_star_1.js Star-Jingler-mid: touch plays BIG_STAR_3 and sets state glow (the SWF\'s 29-frame cycle); placements from the video.',
      craters: 'Inferred from the video: walking into a crater throws the avatar into the sky. Rebuilt as event boxes with the fungal bounce recipe.',
      orbs: 'Snaps 248938/248947/248953 (Dec 2012): white discs with a pale ring halo; clean vectors (no CC0 art), drawn by the feature.',
      soil: 'Snap 248938: purple hexagon soil under the mint floor with a music-note burrow (zutto1 ground_large_2) and a striped caterpillar (ground_caterpillar).',
      ladder: LADDER.why,
      signpost: SIGNPOST.why,
    },
  };
}

/** The index.json row. */
export function symphoniousIndexEntry(street = symphoniousStreet()) {
  return {
    label: SYMPHONIOUS_LABEL,
    file: `assets/streets/${SYMPHONIOUS_TSID}.json`,
    hubId: SYMPHONIOUS_HUB.hubId,
    hubName: SYMPHONIOUS_HUB.hubName,
    platforms: street.platforms.length,
    decos: street.stats.decoCount,
    reconstructed: true,
  };
}
