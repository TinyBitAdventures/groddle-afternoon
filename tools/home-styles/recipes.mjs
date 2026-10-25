/**
 * Home street styles composed from CC0 decos (register G204).
 *
 * GameServerJS inc_data_homes_prod.js 818-1152 lists 37 exterior styles, each a
 * template street (geometry + a main image) that was never archived. What did
 * survive is one 2400x272 header panorama per exterior style
 * (research/wayback/raw/home-images/headers, Wayback captures of
 * c2.glitch.bz/homes/<date>/header-<ts>.jpg). They are REFERENCE ONLY: their
 * pixels never ship. Their order is the GSJS order with Forgotten Growth
 * (_ruin_high) rendered first: header 2 is basic, 3 firebog_1, ... 31 _rook,
 * 32-36 the September 2012 batch (dated 2012-09-07, the batch's main images
 * 2012-09-05), 37 Bonzai.
 *
 * Each recipe names the CC0 decos (assets/decos/groddle, from the
 * tinyspeck/glitch-locations street bundles) that rebuild the look the
 * header shows, as parallax layers around the house lot. tools/home-styles/
 * build.mjs reads the deco sizes and writes public/js/home-styles-data.js.
 *
 * Item fields: s (deco name, or a list cycled by position), scale, y (bottom
 * on the pre-STREET_LIFT 620 px street, field top 586), every, jitter, offset,
 * and optional tint, alpha, hang (y is the top), flipY (mirrored, drawn down
 * from y), noFlip (never mirrored).
 * Layer fields: f (parallax: 0 sky, 1 world), items, or band ({ y, h, color,
 * alpha }: a full-width strip such as water or mist), tint, alpha.
 * Look fields: sky [top, bottom] or [top, middle, bottom], field, fieldDark,
 * soil (deco or null), soilColor, stars, layers, near, nearTint, trim.
 *
 * build.mjs records which header each composition follows. `missing` marks a
 * style whose own art is not in any CC0 set, so it is not offered.
 */

const item = (s, scale, y, every, jitter = 0, offset = 0, extra = {}) => ({ s, scale, y, every, jitter, offset, ...extra });

// Groddle forest and meadow (groddle1.swf, Groddle Forest / Meadow / Heights streets)
const TALL_PINES = ['tree_coniferous_fg_1', 'tree_coniferous_fg_2', 'tree_coniferous_fg_3', 'tree_coniferous_fg_4'];
const PINES = ['tree_coniferous_1', 'tree_coniferous_3', 'tree_coniferous_4'];
const OAKS = ['tree_deciduous1', 'tree_deciduous2', 'tree_deciduous3'];
const LOGS = ['tree_dead_1', 'tree_dead_2'];
const GRODDLE_NEAR = [
  { s: 'groddle_grass_2', scale: 0.55, every: 300, jitter: 120 },
  { s: 'wildflowers_bunch_2', scale: 0.6, every: 420, jitter: 160, offset: 120 },
  { s: 'groddle_grass_1', scale: 0.5, every: 520, jitter: 160, offset: 60 },
];
const FOREST_NEAR = [
  { s: 'groddle_grass_2', scale: 0.55, every: 280, jitter: 120 },
  { s: 'groddle_fern_1', scale: 0.6, every: 460, jitter: 160, offset: 140 },
  { s: 'bush_2', scale: 0.5, every: 640, jitter: 200, offset: 300 },
];
const GRODDLE_TRIM = ['flower_bush_5', 'bush_1', 'groddle_flower_2'];
const FOREST_TRIM = ['bush_1', 'groddle_fern_1', 'flower_bush_3'];

const mountains = (o = {}) => item('mountain_blue_1', 0.42, 470, 760, 120, 0, o);
const pineHills = (o = {}) => item('pinehills_distant_1', 0.34, 500, 900, 200, 0, o);
const mountainTrees = (o = {}) => item('mountain_blue_trees_1', 0.42, 540, 980, 200, 0, o);
const forestWall = (o = {}) => item('wallpaper_tree_short_1', 0.36, 566, 520, 120, 0, o);
const pineClusters = (o = {}) => item(['pinecluster_1', 'pinecluster_2'], 0.44, 570, 480, 160, 80, o);
const midPines = (o = {}) => item(PINES, 0.22, 590, 360, 140, 40, o);
const tallPines = (every = 520, o = {}) => item(TALL_PINES, 0.16, 604, every, 160, 260, o);
const oaks = (every = 900, o = {}) => item(OAKS, 0.48, 592, every, 260, 420, o);
const logs = (o = {}) => item(LOGS, 0.34, 600, 1400, 300, 640, o);
const mounds = (o = {}) => item('evenground_mound_1', 0.46, 598, 1300, 200, 300, o);
const rocky = (o = {}) => item('heights_mound_3', 0.42, 600, 1500, 260, 900, o);
const clouds = (o = {}) => item(['cloud_fluffy_1', 'cloud_fluffy_2'], 0.5, 300, 900, 300, 100, o);

/** Groddle forest style: sky, a far band, then forest layers. */
function groddleForest({ sky, field = 0x5f8a2f, fieldDark = 0x4d7426, far = [], mid = [], near = [], tint, nearTint, trim = FOREST_TRIM, ground = FOREST_NEAR }) {
  return {
    sky,
    field,
    fieldDark,
    soil: 'crosssection_short_3',
    soilColor: 0x6a4329,
    layers: [
      ...far,
      ...(mid.length ? [{ f: 0.5, items: mid, tint }] : []),
      ...(near.length ? [{ f: 0.75, items: near, tint: nearTint }] : []),
    ],
    near: ground,
    trim,
  };
}

// Firebog (firebog.swf, Kalavana streets)
const BOTTLETREES = ['bottletree_body2', 'bottletree_body3', 'bottletree_body4'];
/** A bottletree: a body (1,314 px tall at 1x) with a treetop on its rim, never jittered apart. */
const bottle = (scale, y, every, offset, top = 'treetop_noflowers_1', extra = {}) => [
  item(BOTTLETREES, scale, y, every, 0, offset, extra),
  item(top, scale * 0.8, Math.round(y - 1314 * scale * 0.93), every, 0, offset, extra),
];
/** The short bottletree (bottletree_body1, 832 px tall). */
const shortBottle = (scale, y, every, offset, top = 'treetop_noflowers_2', extra = {}) => [
  item('bottletree_body1', scale, y, every, 0, offset, extra),
  item(top, scale * 0.9, Math.round(y - 832 * scale * 0.93), every, 0, offset, extra),
];
const FIREBOG_NEAR = [
  { s: 'grass_solid', scale: 0.6, every: 260, jitter: 100 },
  { s: 'underground_plant_1', scale: 0.6, every: 380, jitter: 140, offset: 90 },
  { s: 'ground_spots_dark_1', scale: 0.5, every: 700, jitter: 200, offset: 30, below: 18 },
];
const FIREBOG_TRIM = ['mushrooms', 'grass_solid', 'underground_plant_1'];

function firebog({ sky, field = 0x5e4430, fieldDark = 0x4a3324, layers, near = FIREBOG_NEAR, trim = FIREBOG_TRIM, nearTint }) {
  return { sky, field, fieldDark, soil: null, soilColor: 0x4c3022, layers, near, nearTint, trim };
}

// Uralia (zutto1.swf, the Uralia and Ilmenskie streets)
const URALIA_NEAR = [
  { s: 'plant_grass_2', scale: 0.7, every: 220, jitter: 90 },
  { s: 'purple_mushroom_3', scale: 0.4, every: 640, jitter: 200, offset: 200 },
  { s: 'plant_fern_2', scale: 0.55, every: 420, jitter: 140, offset: 80 },
];
const URALIA_TRIM = ['purple_mushroom_3', 'zutto_plant_2', 'plant_fern_2'];

// Savanna (groddle1.swf acacias, Baqala and Andra streets; alpine_landscape.swf cliffs)
const ACACIAS = ['tree_acacia_1', 'tree_acacia_2', 'tree_acacia_3', 'tree_acacia_4'];
const SAVANNA_NEAR = [
  { s: 'pampas_2', scale: 0.4, every: 300, jitter: 120 },
  { s: 'pampas_1', scale: 0.38, every: 460, jitter: 160, offset: 150 },
  { s: 'alakol_water_rock_2', scale: 0.5, every: 900, jitter: 260, offset: 420 },
];
const SAVANNA_TRIM = ['pampas_2', 'flower_bush_7', 'pampas_1'];

function savanna({ sky, field = 0x9a8650, fieldDark = 0x7d6c3e, far, mid, near, nearTint, trim = SAVANNA_TRIM, ground = SAVANNA_NEAR }) {
  return {
    sky,
    field,
    fieldDark,
    soil: null,
    soilColor: 0x6b5232,
    layers: [...far, { f: 0.5, items: mid }, { f: 0.75, items: near, tint: nearTint }],
    near: ground,
    trim,
  };
}

const SILHOUETTES = ['tree_02', 'tree_03'];

export const RECIPES = {
  // ---------------------------------------------------------------- Groddle
  basic: {
    look: groddleForest({
      sky: [0xf2c27c, 0xe7b0a8, 0xf3dcc4],
      field: 0x5f8a2a,
      fieldDark: 0x4c7020,
      far: [
        { f: 0.08, items: [mountains({ tint: 0xe8d8e0 })] },
        { f: 0.2, items: [pineHills({ tint: 0xd9c8c0 })] },
        { f: 0.32, items: [item(PINES, 0.16, 566, 300, 120, 60, { tint: 0xb8b8a0 })] },
      ],
      mid: [tallPines(700), logs()],
      near: [tallPines(900, { scale: 0.19, offset: 520 }), item('bush_3', 0.42, 600, 560, 200, 260)],
    }),
  },
  forest_1_high: {
    look: groddleForest({
      sky: [0x6e9ac0, 0xbcd0d8],
      field: 0x6b7c34,
      fieldDark: 0x5a6a2a,
      far: [
        { f: 0.08, items: [mountains()] },
        { f: 0.2, items: [pineHills()] },
        { f: 0.32, items: [mountainTrees({ y: 560 })] },
      ],
      mid: [midPines(), rocky(), item('tree_dark_1', 0.3, 594, 1700, 300, 1100)],
      near: [tallPines(780), item('bush_3', 0.42, 600, 520, 200, 200)],
    }),
  },
  highlands_1_high: {
    look: groddleForest({
      sky: [0x8a9fad, 0xc0cccd],
      field: 0x6f8a46,
      fieldDark: 0x5d763a,
      far: [
        { f: 0.08, items: [item('transition_hill_1', 0.6, 520, 900, 200, 0, { tint: 0xa8b4a8 })] },
        { f: 0.22, items: [pineHills({ tint: 0xb8c4b8 }), item('tree_deciduous1', 0.3, 560, 1100, 300, 500, { tint: 0xa8b8a0 })] },
        { f: 0.36, items: [pineClusters({ tint: 0xc8d4c0, scale: 0.36 })] },
      ],
      mid: [oaks(820), rocky({ scale: 0.36 })],
      near: [oaks(1200, { scale: 0.62, offset: 760 }), item('bush_3', 0.42, 600, 640, 200, 200)],
    }),
  },
  meadow_ext_default_high: {
    // The source START_EXT_TEMPLATE (config_base.js 235); the remake's first Meadow look, unchanged.
    look: {
      seed: 'meadow',
      sky: [0xa6effa, 0xeafcfb],
      field: 0x77ad43,
      fieldDark: 0x5f9636,
      soil: 'crosssection_short_3',
      soilColor: 0x6a4329,
      layers: [
        { f: 0.08, items: [item('mountain_blue_1', 0.42, 470, 760, 120)] },
        { f: 0.16, items: [item('pinehills_distant_1', 0.34, 500, 900, 200)] },
        { f: 0.3, items: [item('pinehills_1', 0.36, 520, 1100, 260)] },
        {
          f: 0.5,
          items: [
            item('transition_hill_1', 0.5, 548, 1000, 120),
            item('tree_coniferous_2', 0.2, 548, 520, 160, 140),
            item('tree_deciduous3', 0.21, 552, 780, 140, 380),
          ],
        },
        {
          f: 0.75,
          items: [
            item('evenground_horizon', 0.55, 590, 1300, 0),
            item('bush_3', 0.42, 596, 640, 200, 260),
            item('tree_coniferous_1', 0.24, 594, 1150, 220, 700),
          ],
        },
      ],
      near: GRODDLE_NEAR,
      trim: GRODDLE_TRIM,
    },
  },
  meadows_int_default__high: {
    look: groddleForest({
      sky: [0x1c201e, 0x3a2c40],
      field: 0x2f3e28,
      fieldDark: 0x24301f,
      far: [
        { f: 0.12, items: [forestWall({ tint: 0x4a3a58, y: 540 })] },
        { f: 0.28, items: [item(OAKS, 0.5, 566, 520, 160, 120, { tint: 0x55456a })] },
        { f: 0.4, items: [item('light_shafts_blue', 0.24, 560, 1300, 300, 400, { alpha: 0.35 })] },
      ],
      mid: [item(OAKS, 0.62, 590, 620, 200, 300), item('mushroom_light_tree_maytang', 0.34, 592, 1100, 260, 700)],
      tint: 0x7a6890,
      near: [item('mushroom_light_tree_2_maytang', 0.36, 600, 1300, 300, 200), item('fireflies', 0.5, 520, 900, 300, 500)],
      nearTint: 0xa898b8,
      ground: [
        { s: 'groddle_grass_2', scale: 0.55, every: 300, jitter: 120, tint: 0x8090a0 },
        { s: 'bling_mushroom_bunch_ground_1', scale: 0.5, every: 620, jitter: 200, offset: 160 },
      ],
      trim: ['bling_mushroom_bunch_ground_1', 'groddle_fern_1', 'bush_1'],
    }),
  },
  forest_2_high: {
    look: groddleForest({
      sky: [0xb9c8bc, 0xdfe4d4],
      field: 0x5a5c2a,
      fieldDark: 0x4a4c22,
      far: [
        { f: 0.1, items: [forestWall({ tint: 0x9aa890 })] },
        { f: 0.25, items: [item(TALL_PINES, 0.12, 576, 260, 100, 0, { tint: 0x8a9878 })] },
      ],
      mid: [item(TALL_PINES, 0.15, 596, 300, 120, 140), mounds({ s: 'dirt_mound_1', scale: 0.4 })],
      near: [tallPines(420, { scale: 0.19 }), item('bush_3', 0.44, 600, 500, 160, 100)],
    }),
  },
  forest_3_high: {
    look: groddleForest({
      sky: [0xb8cbc2, 0xd8ddd2],
      field: 0x625628,
      fieldDark: 0x504620,
      far: [
        { f: 0.08, items: [mountains({ tint: 0xd8e0e0 })] },
        { f: 0.2, items: [forestWall({ tint: 0xa8b4a0 })] },
        { f: 0.34, items: [item('heights_face_rock_2', 0.4, 584, 1300, 300, 500, { tint: 0xb8b0a0 })] },
      ],
      mid: [item(TALL_PINES, 0.15, 596, 340, 140, 60), rocky({ scale: 0.5 })],
      near: [tallPines(560), item('bush_3', 0.42, 600, 600, 200, 300)],
    }),
  },
  forest_4_high: {
    look: groddleForest({
      sky: [0x7fb2c8, 0xd2e0e2],
      field: 0x5a7a20,
      fieldDark: 0x4a681a,
      far: [
        { f: 0.06, items: [mountains({ tint: 0xe8f0f4, y: 450 })] },
        { band: { y: 470, h: 50, color: 0x9cb9c4, alpha: 1 }, f: 0.1 },
        { f: 0.14, items: [item('pinecluster_2', 0.28, 488, 700, 300, 200, { tint: 0x8aa0a0 })] },
        { f: 0.3, items: [item(PINES, 0.18, 570, 260, 120, 0, { tint: 0x9aac90 })] },
      ],
      mid: [tallPines(560, { scale: 0.15 }), logs()],
      near: [tallPines(760), item('bush_3', 0.42, 600, 600, 200, 300)],
    }),
  },
  forest_5_high: {
    look: groddleForest({
      sky: [0xbf8698, 0xe6bcc4],
      field: 0x5d5a30,
      fieldDark: 0x4b4826,
      far: [
        { f: 0.08, items: [mountains({ tint: 0xd8c4d4 })] },
        { f: 0.2, items: [pineClusters({ tint: 0x7a7a70, scale: 0.4, y: 556 })] },
        { f: 0.32, items: [item(PINES, 0.2, 578, 220, 100, 0, { tint: 0x8a8a78 })] },
      ],
      mid: [item(TALL_PINES, 0.15, 596, 380, 140, 160), rocky({ scale: 0.36 })],
      near: [tallPines(620), logs()],
    }),
  },
  forest_6_high: {
    look: groddleForest({
      sky: [0xb9aabb, 0xe2d2c4],
      field: 0x52692a,
      fieldDark: 0x435822,
      far: [
        { f: 0.08, items: [mountains({ tint: 0xc8c0cc })] },
        { f: 0.22, items: [item('tree_deciduous2', 0.32, 560, 900, 300, 300, { tint: 0x9a9c88 }), pineHills({ tint: 0xb0a8a8 })] },
      ],
      mid: [oaks(640, { scale: 0.42 }), midPines({ every: 520, offset: 300 }), item('tree_bare_thin_1', 0.3, 592, 1300, 300, 900), rocky({ scale: 0.4, s: 'heights_face_rock_2' })],
      near: [tallPines(560), oaks(1300, { scale: 0.6, offset: 900 }), item('bush_3', 0.42, 600, 640, 200, 300)],
    }),
  },
  meadows_1_high: {
    look: groddleForest({
      sky: [0x9aa0c6, 0xe8dccd],
      field: 0x5a721f,
      fieldDark: 0x4a6019,
      far: [
        { f: 0.06, items: [mountains({ tint: 0xf0eef8 })] },
        { f: 0.2, items: [pineHills({ tint: 0xa0b0a0 })] },
        { f: 0.32, items: [item(PINES, 0.18, 572, 300, 120, 0, { tint: 0x98a890 })] },
      ],
      mid: [tallPines(460, { scale: 0.15 }), mounds()],
      near: [tallPines(700), item('bush_3', 0.42, 600, 600, 200, 300)],
    }),
  },
  meadows_2_high: {
    look: groddleForest({
      sky: [0x34507a, 0x7a7e9e, 0xb0a8b4],
      field: 0x4c6418,
      fieldDark: 0x3d5214,
      far: [
        { f: 0.08, items: [mountains({ tint: 0x9aa4c4 })] },
        { f: 0.2, items: [item('transition_hill_1', 0.56, 548, 900, 200, 200, { tint: 0x6a8060 }), pineHills({ tint: 0x6a7a70, scale: 0.28, y: 540 })] },
      ],
      mid: [item(TALL_PINES, 0.14, 594, 900, 300, 300), item('mushroom_amanita_1', 0.42, 596, 1100, 300, 700)],
      tint: 0xb0b8d0,
      near: [tallPines(1100, { scale: 0.18 }), item('bush_3', 0.42, 600, 640, 200, 300)],
      nearTint: 0xc8d0e0,
      ground: [
        { s: 'groddle_grass_2', scale: 0.55, every: 300, jitter: 120 },
        { s: 'mushroom_amanita_1', scale: 0.45, every: 760, jitter: 200, offset: 220 },
        { s: 'wildflowers_bunch_2', scale: 0.6, every: 520, jitter: 160, offset: 120 },
      ],
    }),
  },
  meadows_3_high: {
    look: groddleForest({
      sky: [0xbcd6da, 0xeaf0ea],
      field: 0x5b7c24,
      fieldDark: 0x4a681d,
      far: [
        { f: 0.06, items: [mountains({ tint: 0xffffff, y: 480 })] },
        { f: 0.18, items: [item('evenground_horizon', 0.6, 560, 1300, 0, 0, { tint: 0xa8c098 }), item(PINES, 0.12, 556, 900, 300, 400, { tint: 0x9ab090 })] },
      ],
      mid: [oaks(980, { scale: 0.4 }), logs(), item('mushroom_amanita_1', 0.4, 596, 900, 300, 300)],
      near: [item(TALL_PINES, 0.18, 604, 1500, 200, 1100), item('bush_3', 0.42, 600, 640, 200, 300)],
      ground: [
        { s: 'groddle_grass_2', scale: 0.55, every: 300, jitter: 120 },
        { s: 'wildflowers_bunch_2', scale: 0.6, every: 420, jitter: 160, offset: 120 },
        { s: 'mushroom_amanita_1', scale: 0.4, every: 900, jitter: 260, offset: 520 },
      ],
      trim: GRODDLE_TRIM,
    }),
  },
  heights_1_high: {
    look: groddleForest({
      sky: [0x48aabb, 0xa8d0c8],
      field: 0x62742a,
      fieldDark: 0x50601f,
      far: [
        { f: 0.08, items: [mountains({ tint: 0xc8d8dc })] },
        { f: 0.2, items: [pineHills({ tint: 0x98b0a8 })] },
        { band: { y: 548, h: 30, color: 0xe8f0ec, alpha: 0.55 }, f: 0.3 },
      ],
      mid: [item('heights_mound_3', 0.5, 594, 760, 200, 0), item('heights_face_rock_2', 0.42, 598, 1100, 260, 500), midPines({ scale: 0.24 })],
      near: [tallPines(860), item('tree_bare_thin_1', 0.3, 600, 1700, 300, 1300)],
      ground: [
        { s: 'groddle_grass_2', scale: 0.55, every: 300, jitter: 120 },
        { s: 'pampas_2', scale: 0.32, every: 520, jitter: 160, offset: 200 },
        { s: 'heights_face_rock_1', scale: 0.4, every: 900, jitter: 200, offset: 600 },
      ],
    }),
  },

  // ---------------------------------------------------------------- Firebog
  firebog_1_high: {
    // The remake's first Firebog look, unchanged.
    look: {
      seed: 'firebog',
      sky: [0xf0d98a, 0x9a5a3a],
      field: 0x6a4a34,
      fieldDark: 0x523726,
      soil: null,
      soilColor: 0x4c3022,
      layers: [
        { f: 0.1, items: [item('background_horizon_bottletrees_1', 0.7, 500, 1300, 0)] },
        { f: 0.25, items: [item('background_brown_bump3', 0.6, 548, 1280, 0)] },
        {
          f: 0.45,
          items: [
            item('treetop_noflowers_2', 0.2, 420, 900, 180, 200),
            item('bottletree_body1', 0.16, 566, 900, 180, 200),
            item('background_bottletree_silhouette', 0.8, 560, 430, 120, 60),
          ],
        },
        {
          f: 0.75,
          items: [
            item('background_brown_bump1', 0.55, 600, 1600, 0),
            item('mushrooms', 0.42, 600, 560, 200, 300),
          ],
        },
      ],
      near: FIREBOG_NEAR,
      trim: FIREBOG_TRIM,
    },
  },
  firebog_1b_high: {
    look: firebog({
      sky: [0x8c7a48, 0x8a8a52],
      field: 0x4a3828,
      fieldDark: 0x3b2c1e,
      layers: [
        { f: 0.1, items: [item('background_horizon_bottletrees_2', 0.7, 520, 1300, 0, 0, { tint: 0xb0a070 })] },
        { f: 0.3, items: [item('backhill1_green', 0.5, 560, 820, 200, 200), item('backhill2_green', 0.6, 562, 900, 200, 640)] },
        {
          f: 0.5,
          items: [
            ...bottle(0.2, 590, 760, 120),
            item('legs_moss_4', 0.3, 594, 1100, 300, 500),
          ],
        },
        { f: 0.75, items: [item('stone_moss_group_3', 0.5, 600, 900, 260, 300), item('underground_bogwillow', 0.5, 600, 700, 200, 100)] },
      ],
    }),
  },
  firebog_3_high: {
    look: firebog({
      sky: [0x3a2410, 0x5a3a14],
      field: 0x463322,
      fieldDark: 0x37281a,
      layers: [
        { f: 0.1, items: [item('background', 0.5, 540, 1700, 0, 0, { tint: 0x8a6a40 })] },
        { f: 0.3, items: [...bottle(0.18, 580, 700, 0, 'treetop_noflowers_3', { tint: 0xa08060 })] },
        {
          f: 0.55,
          items: [
            item('hanging_braches1', 0.4, 120, 900, 260, 300, { hang: true, tint: 0xc0a080 }),
            item('legs_moss_4', 0.34, 596, 1000, 260, 700),
            item('sprout', 0.4, 594, 1300, 300, 1100),
          ],
        },
        { f: 0.75, items: [item('hang_branch1', 0.5, 140, 700, 200, 100, { hang: true }), item('stone_moss_group_3', 0.5, 600, 900, 260, 400)] },
      ],
      nearTint: 0xd8c0a0,
    }),
  },
  firebog_4_high: {
    look: firebog({
      sky: [0xc8b46c, 0xa48a62],
      field: 0x544232,
      fieldDark: 0x433426,
      layers: [
        { f: 0.08, items: [item(['background_bottletree_1', 'background_bottletree_2'], 0.9, 540, 360, 160, 0, { tint: 0xc8b488 })] },
        { f: 0.2, items: [item('background_horizon_no_bottletrees_1', 0.6, 560, 1300, 0, 0, { tint: 0xa89070 })] },
        {
          f: 0.45,
          items: [
            item('background_bottletree_hut', 0.4, 588, 1100, 300, 200),
            ...shortBottle(0.2, 590, 1100, 760),
          ],
        },
        { f: 0.75, items: [...bottle(0.24, 600, 900, 300), item('lantern_stacked', 0.6, 600, 1300, 300, 600)] },
      ],
    }),
  },
  firebog_2_high: {
    look: firebog({
      sky: [0x41535e, 0x6a8592],
      field: 0x4a3929,
      fieldDark: 0x3a2d20,
      layers: [
        { f: 0.08, items: [item('clouds5', 0.8, 360, 900, 300, 0, { alpha: 0.5 })] },
        { f: 0.2, items: [item('background_horizon_bottletrees_1', 0.7, 540, 1300, 0, 0, { tint: 0x2a2a28 })] },
        {
          f: 0.45,
          items: [
            item('background_bottletree_face', 0.42, 590, 1000, 260, 300),
            item('legs_moss_4', 0.36, 596, 1300, 300, 900),
            item('underground_bogwillow', 0.42, 596, 520, 160, 100),
          ],
          tint: 0xb8c0c8,
        },
        { f: 0.75, items: [item('firebean_2', 0.4, 600, 760, 220, 300), item('underground_bogwillow_2', 0.6, 600, 600, 200, 100)] },
      ],
    }),
  },
  firebog_4a_high: {
    look: firebog({
      sky: [0x3c4834, 0x6e7048],
      field: 0x433427,
      fieldDark: 0x35291e,
      layers: [
        { f: 0.15, items: [item('background_horizon_bottletrees_2', 0.7, 540, 1300, 0, 0, { tint: 0x5a5c40 })] },
        {
          f: 0.45,
          items: [
            item('background_bottletree_hut', 0.36, 588, 1200, 300, 200),
            ...bottle(0.2, 590, 1200, 800, 'treetop_noflowers_3'),
            item('lantern', 0.7, 150, 300, 80, 0, { hang: true }),
          ],
          tint: 0xc0c4a0,
        },
        { f: 0.75, items: [item('lantern_stacked', 0.6, 600, 900, 260, 400), item('stone_moss_group_4', 0.5, 600, 1000, 260, 200)] },
      ],
    }),
  },

  // ----------------------------------------------------------------- Uralia
  uralia_1_high: {
    // The remake's first Uralia look, unchanged.
    look: {
      seed: 'uralia',
      sky: [0x8fd6cf, 0xd8eedd],
      field: 0x5e8f8a,
      fieldDark: 0x4b7672,
      soil: null,
      soilColor: 0x40525a,
      layers: [
        { f: 0.06, items: [item('zutto_cloud_1', 0.6, 360, 700, 260)] },
        { f: 0.14, items: [item('bck_hill_9', 0.42, 540, 620, 160)] },
        { f: 0.32, items: [item('hill_11', 0.55, 560, 760, 140), item('bck_tree_2', 0.8, 560, 330, 120, 100)] },
        {
          f: 0.6,
          items: [
            item('zutto_hill_1', 0.5, 594, 1100, 0),
            item('tree_11', 0.42, 596, 780, 220, 320),
            item('tree_7', 0.46, 596, 980, 200, 700),
          ],
        },
      ],
      near: URALIA_NEAR,
      trim: URALIA_TRIM,
    },
  },
  uralia_2_high: {
    look: {
      sky: [0x8ccfe2, 0xd6f0ee],
      field: 0x3f9a9d,
      fieldDark: 0x2f8084,
      soil: null,
      soilColor: 0x2f5a62,
      layers: [
        { f: 0.03, items: [item('moon', 0.24, 200, 2400, 0, 820, { noFlip: true })] },
        { f: 0.08, items: [item(['bck_hill_1', 'bck_hill_12'], 0.42, 540, 520, 200)] },
        { f: 0.2, items: [item('bck_flying_platforms_1', 0.24, 330, 1100, 300, 300), item('bck_tree_3', 0.6, 560, 420, 160, 100)] },
        {
          f: 0.45,
          items: [
            item('tree_8', 0.36, 588, 900, 240, 100),
            item('tree_14', 0.4, 590, 760, 220, 420),
            item('tree_12', 0.42, 590, 1000, 260, 760),
          ],
        },
        { f: 0.7, items: [item('tree_15', 0.6, 600, 1100, 300, 300), item('tree_6', 0.46, 600, 900, 260, 800), item('zutto_tree_2', 0.4, 600, 1300, 300, 1200)] },
      ],
      near: URALIA_NEAR,
      trim: URALIA_TRIM,
    },
  },
  uralia_2a_high: {
    look: {
      sky: [0x1d1628, 0x2c2a58],
      field: 0x2a6c94,
      fieldDark: 0x205676,
      soil: null,
      soilColor: 0x1e3448,
      stars: { count: 70, color: 0xffffff, maxY: 420 },
      layers: [
        { f: 0.03, items: [item('moon', 0.24, 190, 2400, 0, 820, { noFlip: true, tint: 0xd8d0ff })] },
        { f: 0.08, items: [item(['bck_hill_1', 'bck_hill_12'], 0.42, 540, 520, 200, 0, { tint: 0x8a80c0 })] },
        { f: 0.22, items: [item('bck_tree_3', 0.6, 560, 420, 160, 100, { tint: 0x6a70b0 })] },
        {
          f: 0.45,
          items: [item('tree_8', 0.36, 588, 900, 240, 100), item('tree_14', 0.4, 590, 760, 220, 420), item('tree_12', 0.42, 590, 1000, 260, 760)],
          tint: 0x8a8cc8,
        },
        { f: 0.7, items: [item('tree_15', 0.6, 600, 1100, 300, 300), item('tree_11', 0.42, 600, 900, 260, 800)], tint: 0xa8a8d8 },
      ],
      near: URALIA_NEAR,
      nearTint: 0xb0b0e0,
      trim: URALIA_TRIM,
    },
  },
  uralia_3_high: {
    look: {
      sky: [0x4c9fbc, 0xd2e8e8],
      field: 0xb2e2e4,
      fieldDark: 0x92c8cc,
      soil: null,
      soilColor: 0x5a8a94,
      layers: [
        { f: 0.03, items: [item('moon', 0.2, 180, 2400, 0, 600, { noFlip: true })] },
        { f: 0.08, items: [item(['bck_hill_1', 'bck_hill_12', 'bck_rocks_1'], 0.42, 540, 460, 200, 0, { tint: 0xe8f4f4 })] },
        { f: 0.2, items: [item('zutto_cloud_2', 0.8, 520, 600, 260, 100), item('bck_tree_1', 0.6, 560, 520, 160, 260, { tint: 0xd8f0ec })] },
        {
          f: 0.45,
          items: [item('tree_8', 0.36, 588, 900, 240, 100), item('tree_14', 0.4, 590, 760, 220, 420), item('bck_flying_platforms_1', 0.22, 360, 1300, 300, 900, { tint: 0xe8f4f4 })],
        },
        { f: 0.7, items: [item('tree_15', 0.6, 600, 1100, 300, 300), item('zutto_tree_3', 0.44, 600, 1000, 300, 800)] },
      ],
      near: [
        { s: 'plant_grass_2', scale: 0.7, every: 240, jitter: 90, tint: 0xd8f0f0 },
        { s: 'purple_mushroom_1', scale: 0.4, every: 640, jitter: 200, offset: 200 },
      ],
      trim: URALIA_TRIM,
    },
  },

  // ------------------------------------------------------------------ Kajuu
  kajuu_1_high: {
    look: savanna({
      sky: [0x9eb2a6, 0xc8c8a8],
      field: 0x8a7442,
      fieldDark: 0x6e5c34,
      far: [
        { f: 0.08, items: [item(['cliff_cover_3', 'cliff_cover_5'], 0.34, 540, 600, 200, 0, { tint: 0x9a9a98 })] },
        { f: 0.22, items: [item(['alakol_cliff_1', 'alakol_cliff_2'], 0.5, 566, 700, 200, 200, { tint: 0xb0a088 }), item(ACACIAS, 0.12, 560, 900, 300, 600, { tint: 0x8a9070 })] },
      ],
      mid: [item(['alakol_cliff_2', 'heights_face_rock_2'], 0.6, 596, 900, 260, 100), item(ACACIAS, 0.24, 592, 1200, 300, 700)],
      near: [item(ACACIAS, 0.32, 604, 1600, 300, 1100), item('pampas_2', 0.5, 600, 500, 200, 200)],
    }),
  },
  kajuu_2_high: {
    look: savanna({
      sky: [0xa0b4a8, 0xd0d0b0],
      field: 0x7a6236,
      fieldDark: 0x624e2a,
      far: [
        { f: 0.08, items: [item('heights_face_1', 0.32, 548, 900, 300, 0, { tint: 0xb0a898 }), item(['tree_coniferous_1', 'tree_coniferous_3'], 0.12, 548, 300, 100, 120, { tint: 0x7a8a68 })] },
        { f: 0.22, items: [item(ACACIAS, 0.14, 560, 600, 200, 200, { tint: 0x7a7a5c }), item('alakol_cliff_1', 0.5, 566, 900, 200, 500, { tint: 0xa89878 })] },
      ],
      mid: [item(ACACIAS, 0.26, 592, 900, 300, 400), item('alakol_cliff_2', 0.6, 598, 1100, 200, 900)],
      near: [item('pampas_1', 0.5, 600, 520, 200, 100), item('alakol_water_rock_1', 0.6, 600, 1400, 300, 900)],
    }),
  },
  kajuu_3_high: {
    look: savanna({
      sky: [0xb4b8a0, 0xd8d0b0],
      field: 0x5a4422,
      fieldDark: 0x46341a,
      far: [
        { f: 0.06, items: [item('land_l4_mesa_1', 0.3, 556, 800, 300, 0, { tint: 0x8a8070 }), item(ACACIAS, 0.1, 556, 700, 300, 400, { tint: 0x707058 })] },
        { f: 0.2, items: [item('stalagmite_2', 0.5, 300, 520, 200, 0, { flipY: true, tint: 0x8a7050 }), item(ACACIAS, 0.2, 570, 900, 260, 300)] },
      ],
      mid: [item('stalagmite_2', 0.8, 120, 700, 240, 200, { flipY: true }), item('stalagmite_2', 0.5, 596, 900, 260, 600), item(ACACIAS, 0.26, 592, 1300, 300, 900)],
      near: [item('stalagmite_2', 1.1, 20, 1100, 300, 500, { flipY: true }), item('heights_face_1', 0.36, 600, 1700, 300, 1300)],
      nearTint: 0xc8b8a0,
    }),
  },
  savannah_ext_1_high: {
    look: savanna({
      sky: [0xc2cfd4, 0xf0ebc6],
      field: 0x9a8a4e,
      fieldDark: 0x82723e,
      far: [
        { f: 0.06, items: [item('alakol_cliff_1', 0.44, 560, 1100, 300, 0, { tint: 0xc8c8c8 }), item('mountain_blue_1', 0.3, 556, 1600, 300, 600, { tint: 0x8a8ab0 })] },
        { f: 0.2, items: [item(ACACIAS, 0.14, 568, 700, 260, 200, { tint: 0x9a9a7a })] },
      ],
      mid: [item(ACACIAS, 0.3, 592, 760, 260, 300), item('alakol_water_rock_2', 0.6, 596, 900, 260, 600)],
      near: [item(ACACIAS, 0.42, 606, 1500, 300, 1100), item('pampas_2', 0.5, 600, 600, 200, 200)],
      ground: [
        { s: 'pampas_2', scale: 0.36, every: 320, jitter: 120 },
        { s: 'flower_bush_7', scale: 0.5, every: 560, jitter: 160, offset: 150 },
        { s: 'alakol_water_rock_2', scale: 0.5, every: 900, jitter: 260, offset: 420 },
      ],
    }),
  },

  // ------------------------------------------------------- Late forest pairs
  forest_sunset_ext_1_high: {
    look: groddleForest({
      sky: [0xd78a44, 0xd06a1c, 0xf0a868],
      field: 0x56501a,
      fieldDark: 0x464014,
      far: [
        { f: 0.06, items: [item('pinehills_2', 0.4, 520, 900, 300, 0, { tint: 0x1a1414 }), item('mountain_blue_1', 0.3, 500, 1300, 300, 500, { tint: 0x1a1414 })] },
        { band: { y: 520, h: 30, color: 0xe08840, alpha: 0.9 }, f: 0.1 },
        { f: 0.25, items: [item(PINES, 0.2, 572, 260, 100, 0, { tint: 0x5a6030 })] },
      ],
      mid: [item(TALL_PINES, 0.15, 596, 360, 140, 140), logs()],
      tint: 0xe8d0b0,
      near: [tallPines(520), item('bush_3', 0.42, 600, 520, 200, 200)],
      nearTint: 0xf0dcc0,
    }),
  },
  forest_dusk_ext_1_high: {
    look: groddleForest({
      sky: [0x3a3046, 0x4e4048, 0x5a4a30],
      field: 0x2e3810,
      fieldDark: 0x222a0a,
      far: [
        { f: 0.06, items: [mountains({ tint: 0x50485a })] },
        { f: 0.18, items: [forestWall({ tint: 0x303828 })] },
        { f: 0.3, items: [item(PINES, 0.2, 574, 260, 100, 0, { tint: 0x404a30 }), item('lantern', 0.6, 250, 700, 200, 300, { hang: true })] },
      ],
      mid: [item(TALL_PINES, 0.15, 596, 380, 140, 140), item('lantern', 0.8, 260, 900, 260, 500, { hang: true })],
      tint: 0x8a9070,
      near: [tallPines(560), item('bush_3', 0.42, 600, 520, 200, 200)],
      nearTint: 0xa0a888,
      ground: [
        { s: 'groddle_grass_2', scale: 0.55, every: 280, jitter: 120, tint: 0x9aa080 },
        { s: 'wildflowers_bunch_2', scale: 0.6, every: 460, jitter: 160, offset: 140, tint: 0xb0b0a0 },
      ],
    }),
  },
  aranna_ext_1_high: {
    look: {
      sky: [0xd8e8ee, 0xfefef4],
      field: 0xdfe6e0,
      fieldDark: 0xbcc8c4,
      soil: null,
      soilColor: 0x6a5a40,
      layers: [
        { f: 0.06, items: [item('k03_background_snowhill_02', 0.24, 500, 700, 200)] },
        { band: { y: 500, h: 46, color: 0x2e6f88, alpha: 1 }, f: 0.12 },
        { f: 0.18, items: [item('snow_pinecluster_01a_al1', 0.5, 548, 700, 300, 100), item('rock_snowy_1a_al1', 0.6, 556, 900, 300, 400)] },
        {
          f: 0.45,
          items: [item('snowcap_heights_coniferous_1_al1', 0.3, 592, 760, 260, 100), item('snow_drift_01b_al1', 0.5, 594, 900, 260, 500)],
        },
        { f: 0.75, items: [item('tree_coniferous_1', 0.26, 604, 1300, 300, 500), item('snow_bush_01a_al1', 0.5, 600, 800, 260, 200)] },
      ],
      near: [
        { s: 'whitesnow_splotch_1a_g1', scale: 0.7, every: 300, jitter: 120, below: 14 },
        { s: 'pampas_2', scale: 0.34, every: 560, jitter: 160, offset: 150 },
        { s: 'snow_bush_01a_al1', scale: 0.3, every: 820, jitter: 260, offset: 420 },
      ],
      trim: ['snow_bush_01a_al1', 'pampas_2', 'mountain_flora_01a_al1'],
    },
  },
  pol_ext_coral_high: {
    missing: 'Its coral seabed set (pol_ext_coral) is in none of the CC0 street bundles; no coral, kelp or anemone symbol survives.',
  },
  pol_ext_bonsai_high: {
    look: {
      sky: [0xf0e0c8, 0xc8c0c8, 0xa8a4b0],
      field: 0x3e5a22,
      fieldDark: 0x30481a,
      soil: null,
      soilColor: 0x3a3428,
      layers: [
        { f: 0.06, items: [item(['cliff_face_mountaineering_01a_al1', 'cone_top_rock_01b_al1'], 0.36, 520, 600, 260, 0, { tint: 0x7a7488 })] },
        { band: { y: 500, h: 40, color: 0xf4f0f0, alpha: 0.5 }, f: 0.1 },
        { f: 0.2, items: [item('cliff_face_mountaineering_01b_al1', 0.4, 560, 900, 260, 300, { tint: 0x8a8494 }), item('mountain_bonsai_01b_al1', 0.8, 548, 700, 260, 100, { tint: 0x8a9a88 })] },
        { f: 0.45, items: [item(['mountain_bonsai_01b_al1', 'mountain_bonsai_01c_al1'], 1.4, 594, 520, 200, 100)] },
        { f: 0.75, items: [item(['mountain_bonsai_01c_al1', 'mountain_bonsai_01b_al1'], 2, 604, 900, 260, 400), item('mountain_flora_01a_al1', 0.6, 600, 600, 200, 200)] },
      ],
      near: [
        { s: 'groddle_grass_2', scale: 0.5, every: 300, jitter: 120 },
        { s: 'mountain_flora_01a_al1', scale: 0.4, every: 640, jitter: 200, offset: 200 },
      ],
      trim: ['mountain_flora_01a_al1', 'groddle_grass_2', 'bush_1'],
    },
  },

  // ----------------------------------------------------------- One-offs
  _moon_high: {
    look: {
      sky: [0x000000, 0x07070a],
      field: 0xafaea9,
      fieldDark: 0x908f8a,
      soil: null,
      soilColor: 0x6e6d69,
      stars: { count: 110, color: 0xffffff, maxY: 560 },
      layers: [
        { f: 0.02, items: [item('moon_asset_plain.svg', 0.26, 230, 2400, 0, 900, { noFlip: true, w: 322, h: 322 })] },
        { f: 0.4, items: [item('earthdot_grp_2', 0.9, 586, 900, 260, 300, { tint: 0x6a6a66 })] },
      ],
      near: [
        { s: 'earthdot_grp_3', scale: 0.7, every: 700, jitter: 200, tint: 0x7a7974, below: 30 },
        { s: 'radioactive_sign_1', scale: 0.32, every: 1700, jitter: 300, offset: 1200 },
        { s: 'cattle_skull', scale: 0.24, every: 1900, jitter: 300, offset: 300, tint: 0xe0e0e0 },
      ],
      trim: ['ra_drum_3', 'ra_drum_1', 'ra_drum_2'],
    },
  },
  _crimson_forest_high: {
    look: {
      sky: [0xc8bebc, 0xa09292],
      field: 0x353232,
      fieldDark: 0x2a2727,
      soil: null,
      soilColor: 0x262222,
      layers: [
        { f: 0.1, items: [item(SILHOUETTES, 0.16, 566, 120, 60, 0, { tint: 0xa89c9c })] },
        { band: { y: 540, h: 40, color: 0xc0b4b4, alpha: 0.5 }, f: 0.14 },
        { f: 0.25, items: [item(SILHOUETTES, 0.2, 580, 160, 80, 60, { tint: 0x7a6e6e })] },
        { f: 0.45, items: [item(SILHOUETTES, 0.24, 594, 240, 100, 30, { tint: 0x4a4040 })] },
        { f: 0.75, items: [item(SILHOUETTES, 0.28, 606, 460, 160, 200, { tint: 0x2a2222 })] },
      ],
      near: [
        { s: 'coalleaf_1', scale: 1, every: 70, jitter: 40, tint: 0xb02a24, below: 8 },
        { s: 'coalleaf_2', scale: 1, every: 90, jitter: 50, offset: 30, tint: 0xd03a2c, below: 14 },
      ],
      trim: ['tree_foliage_red_big', 'coalleaf_1', 'coalleaf_2'],
    },
  },
  _ruin_high: {
    look: groddleForest({
      sky: [0x8fb08a, 0xc8d8b0],
      field: 0x5f5418,
      fieldDark: 0x4d4412,
      far: [
        { f: 0.1, items: [forestWall({ tint: 0x6a8050 })] },
        { f: 0.25, items: [item(TALL_PINES, 0.12, 574, 240, 100, 0, { tint: 0x7a9068 }), item('archway_y', 0.18, 572, 1100, 300, 500, { tint: 0xb0b098 })] },
      ],
      mid: [item(TALL_PINES, 0.15, 596, 320, 140, 140), item('archway_x', 0.22, 596, 1300, 300, 800), item('building_ruins_1', 0.3, 598, 1100, 300, 300)],
      near: [tallPines(560), item('stone_moss_group_1', 0.5, 600, 900, 260, 300)],
      ground: [
        { s: 'groddle_grass_2', scale: 0.55, every: 280, jitter: 120 },
        { s: 'stone_moss_2', scale: 0.4, every: 700, jitter: 200, offset: 300 },
        { s: 'flower_bush_3', scale: 0.5, every: 560, jitter: 160, offset: 140 },
      ],
    }),
  },
  _rook_high: {
    look: {
      sky: [0x1a1c1b, 0x303230],
      field: 0x0c0c0c,
      fieldDark: 0x050505,
      soil: null,
      soilColor: 0x0a0a0a,
      layers: [
        { f: 0.1, items: [item(SILHOUETTES, 0.16, 566, 130, 60, 0, { tint: 0x3a3c3a })] },
        { band: { y: 520, h: 70, color: 0x5a5c58, alpha: 0.35 }, f: 0.14 },
        { f: 0.28, items: [item(SILHOUETTES, 0.22, 584, 190, 90, 40, { tint: 0x1e201e })] },
        { f: 0.5, items: [item(['tree_bare_bunch_1', 'tree_bare_tall_1'], 0.34, 596, 300, 120, 0, { tint: 0x080808 })] },
        { f: 0.75, items: [item(SILHOUETTES, 0.3, 608, 520, 200, 260, { tint: 0x000000 })] },
      ],
      near: [{ s: 'grass_solid', scale: 0.5, every: 220, jitter: 90, tint: 0x101010 }],
      trim: ['grass_solid', 'underground_plant_1', 'grass_solid'],
      nearTint: 0x202020,
    },
  },
};

/** The purchase looks (js/homes.js HOME_STYLES) start on these source styles. */
export const PURCHASE_STREET_STYLE = {
  meadow: 'meadow_ext_default_high',
  firebog: 'firebog_1_high',
  uralia: 'uralia_1_high',
};
