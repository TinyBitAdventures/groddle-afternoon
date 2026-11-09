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
 * soil (deco or null), soilColor, stars, layers, near, nearTint, trim, and
 * depth: how far the field reaches back from the walk line (default
 * homes-feature FIELD_DEPTH, 130; the backdrop rises with it, #117).
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
  // Coral Caves (template LHVJ59V4IJ83KVT, September 2012 batch). It had no coral set of its own: a visual
  // match of every symbol in the 62 production location bundles (lane coral, 2026-11-08; findings in
  // research/hunts/2026-11-08-coral-caves/findings.md) found its pieces in the same CC0 kit the Samudra
  // streets use (Matsya GUV2LJJO5UC30B2 and Niyuta GUVV0NRR2FC3D3D draw cone_top_rock_01b_al1 and
  // underground_bogwillow), under their own names: the tiered rocks are alpine cone_top_rock_01a/01b, the flat
  // rocks rock_rubble_01*, the beaded branches firebog underground_bogwillow, the boat firebog boat, the
  // fiddleheads Ilmenskie plant_fern_* and plant_giant_fern_*, the purple mushrooms purple_mushroom_*, the red
  // ones firebog mushrooms, the dark mounds cave_background_hill_*, the dark columns back_wall_*, all under
  // one murky olive layer tint. Laid out from header-1346981279 (2400x272) and a
  // player's game-scale picture (Flickr 8411950008); both reference only. Left out: the tall kelp-like blades
  // and the dark crystal columns of the header, which no CC0 symbol matched, and the pale spires (most like
  // Ilmenskie cave_icicle_*, but a tint cannot turn that teal art the header's tan).
  pol_ext_coral_high: {
    look: {
      sky: [0x5e3a20, 0x6e4426, 0x7a4c2c],
      field: 0x8a7038,
      fieldDark: 0x6a5428,
      soil: null,
      soilColor: 0x4a3a18,
      layers: [
        { f: 0.03, items: [item(['cave_stalactite_1', 'cave_stalactite_3', 'cave_stalactite_5'], 0.42, 150, 640, 260, 120, { hang: true, tint: 0xff8528 })] },
        { f: 0.05, items: [item(['back_wall_1', 'back_wall_2', 'back_wall_4', 'back_wall_5'], 0.36, 566, 560, 240, 0, { tint: 0xffba39 })] },
        { f: 0.09, items: [item(['cave_background_hill_1', 'cave_background_hill_2'], 0.15, 560, 120, 50, 40, { tint: 0xff8e0e, alpha: 0.8 })] },
        { band: { y: 550, h: 12, color: 0x24200a, alpha: 1 }, f: 0.11 },
        { f: 0.2, items: [item(['cone_top_rock_01b_al1', 'cone_top_rock_01a_al1'], 0.26, 568, 720, 260, 100, { tint: 0x7a6630 })] },
        { f: 0.32, items: [item('underground_bogwillow', 0.42, 580, 820, 260, 380, { tint: 0xffb49f })] },
        {
          f: 0.45,
          items: [
            item(['cone_top_rock_01a_al1', 'cone_top_rock_01b_al1'], 0.42, 592, 1000, 300, 200, { tint: 0x947c39 }),
            item(['underground_bogwillow_1', 'underground_bogwillow_3'], 0.7, 592, 1000, 260, 260, { tint: 0xffb49f }),
            item('mushrooms', 0.4, 592, 900, 260, 560, { tint: 0xae9861 }),
            item('purple_mushroom_3', 0.35, 592, 1100, 260, 760, { tint: 0x906645 }),
          ],
        },
        {
          f: 0.75,
          items: [
            item('rock_rubble_01b_al1', 0.5, 604, 900, 260, 300, { tint: 0x998245 }),
            item('plant_giant_fern_2', 0.75, 606, 760, 260, 100, { tint: 0xf39140 }),
            item('boat', 0.5, 604, 2600, 200, 1700, { tint: 0xccaf6b }),
          ],
        },
      ],
      near: [
        { s: 'plant_fern_1', scale: 0.6, every: 300, jitter: 110, tint: 0xff9932 },
        { s: 'plant_fern_5', scale: 0.7, every: 560, jitter: 160, offset: 150, tint: 0xff9932 },
        { s: 'rock_rubble_01d_al1', scale: 0.35, every: 480, jitter: 140, offset: 90, tint: 0x998245 },
        { s: 'rock_rubble_01g_al1', scale: 0.35, every: 700, jitter: 200, offset: 330, tint: 0x998245 },
        { s: 'purple_mushroom_2', scale: 0.45, every: 520, jitter: 180, offset: 200, tint: 0x906645 },
        { s: 'underground_bogwillow_2', scale: 0.55, every: 900, jitter: 260, offset: 420, tint: 0xffb49f },
        { s: 'mushrooms', scale: 0.3, every: 760, jitter: 240, offset: 600, tint: 0xae9861 },
      ],
      nearTint: 0x947c39,
      trim: ['plant_fern_2', 'purple_mushroom_3', 'rock_rubble_01d_al1'],
    },
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
      // G223 polish against header-1338327146 (reference only): grey dust and one crater, the
      // radioactive sign, and a single drum lying on its side out on the plain, not a row of
      // drums planted by the door. earthdot_grp_3 is orange-brown art, so tinting it grey made
      // brown stains; the grey earthdot_grp_4 and _grp_2 spots stand in for the dust and crater.
      near: [
        { s: 'earthdot_grp_4', scale: 0.8, every: 700, jitter: 200, tint: 0x9a9994, alpha: 0.5, below: 30 },
        { s: 'earthdot_grp_2', scale: 1, every: 1500, jitter: 300, offset: 700, tint: 0x6e6d69, below: 22 },
        { s: 'radioactive_sign_1', scale: 0.32, every: 1700, jitter: 300, offset: 1200, tint: 0xffffff },
        { s: 'ra_drum_1', scale: 0.28, every: 2300, jitter: 300, offset: 300, tint: 0xffffff },
      ],
      nearTint: 0xc4c3be,
      trim: ['rock_rubble_01c_al1', 'gravel_2', 'rock_rubble_01f_al1'],
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

// ---------------------------------------------------------- Yards from their own snaps
// A player's 39 labelled back-yard snaps of 2012-05-21 (Glitch E, research/hunts/2026-11-07-juju-and-styles/
// raw/glitch-e-yards; reference only, never shipped) show what many yards really looked like, and some differ
// from their paired street. The yards furthest from their snap have their own composition here, from CC0 decos
// only (the same Tiny Speck pieces the streets use), laid out from the picture. A yard is a tall location and
// the remake's camera shows much less sky over the house's yard (about 460 px at Wide, 240 at Original), so the
// sky's floating pieces sit lower than in the snaps.

/**
 * A walking bottletree (the snaps' Firebog giants): a body on a set of root legs, its treetop on the rim. The
 * pieces share x (no jitter) so they stay together; `y` is the feet.
 */
const walker = (scale, y, every, offset, extra = {}) => {
  const bodyY = Math.round(y - 604 * scale * 0.45);
  return [
    item('legs_back_set1', scale * 1.1, Math.round(y - 4), every, 0, offset, extra),
    item(BOTTLETREES, scale, bodyY, every, 0, offset, extra),
    item('treetop_noflowers_1', scale * 0.8, Math.round(bodyY - 1314 * scale * 0.93), every, 0, offset, extra),
    item('legs_front_set', scale, y, every, 0, offset, extra),
  ];
};

/** Night Lights (snap 12874): a starry Uralia night under red and green sky bands, floating islands, glowing mushroom trees. */
const NIGHT_LIGHTS_YARD = {
  sky: [0x2e1f2e, 0x1f192c, 0x2a2344],
  field: 0x266b94,
  fieldDark: 0x1e5676,
  soil: null,
  soilColor: 0x1a3046,
  stars: { count: 130, color: 0xf2dcff, maxY: 480 },
  layers: [
    // the snap's red and green bands across the top of the sky
    { f: 0.02, items: [item('newxp_haze_oval_1', 1.2, 230, 1500, 200, 0, { tint: 0xc0505a, alpha: 0.38 }), item('newxp_haze_oval_1', 1.1, 270, 1500, 200, 760, { tint: 0x48a888, alpha: 0.32 })] },
    { f: 0.06, items: [item(['bck_hill_6', 'bck_hill_11', 'bck_hill_1'], 0.24, 574, 300, 120, 0, { tint: 0xa880b8 })] },
    { band: { y: 576, h: 12, color: 0xb8d8f0, alpha: 0.85 }, f: 0.1 },
    {
      f: 0.1,
      items: [
        item('flying_platform_2', 0.24, 420, 1100, 220, 140, { tint: 0x8cb8e8 }),
        item('flying_platform_3', 0.32, 386, 1100, 160, 700, { tint: 0x8cb8e8 }),
      ],
    },
    { f: 0.16, items: [item('flying_platform_5', 0.42, 470, 1300, 260, 420, { tint: 0x9cc4f0 })] },
    {
      f: 0.35,
      items: [
        item('tree_9_part1', 0.42, 586, 1000, 200, 60, { tint: 0x9cb0e0 }),
        item('zutto_tree_2', 0.5, 584, 900, 220, 380, { tint: 0xb8a8e8 }),
        item('zutto_platform_3', 0.42, 588, 700, 200, 220, { tint: 0x88c8b0 }),
        item('tree_6', 0.6, 588, 1200, 240, 820, { tint: 0x90d0e0 }),
      ],
    },
    {
      f: 0.55,
      items: [
        item('light_spot', 0.22, 640, 520, 200, 300, { tint: 0xff5a5a, alpha: 0.5 }),
        item(['tree_14', 'tree_15'], 0.5, 598, 900, 260, 500, { tint: 0xf0b8c8 }),
        item('light_spot', 0.2, 640, 900, 260, 760, { tint: 0x58e8e0, alpha: 0.5 }),
        item('zutto_platform_1', 0.34, 600, 1100, 300, 100, { tint: 0x9ab8e8 }),
      ],
    },
  ],
  near: [
    { s: 'plant_fern_2', scale: 0.55, every: 300, jitter: 120, tint: 0x5aa8c8 },
    { s: 'zutto_plant_3', scale: 0.5, every: 560, jitter: 200, offset: 160, tint: 0x60b8c0 },
    { s: 'purple_mushroom_3', scale: 0.36, every: 700, jitter: 220, offset: 380 },
  ],
  nearTint: 0xa8c0e8,
  trim: URALIA_TRIM,
};

/** Wistful Tangle (snap 12961): a lilac-to-blue sky with white clouds, jade spires, floating islands and big Uralia trees. */
const WISTFUL_TANGLE_YARD = {
  sky: [0xd8c0eb, 0xbec4eb, 0xa1c8eb],
  field: 0x3e9a9d,
  fieldDark: 0x2f8084,
  soil: null,
  soilColor: 0x2f5a62,
  layers: [
    { f: 0.03, items: [item(['cloud_fluffy_1', 'cloud_fluffy_2'], 0.5, 260, 760, 260, 100, { alpha: 0.9 })] },
    { f: 0.06, items: [item(['bck_hill_9', 'bck_hill_10'], 0.36, 572, 700, 200, 0, { tint: 0xd0f0e4 })] },
    { f: 0.1, items: [item(['bck_rock_22', 'bck_rocks_1', 'bck_rock_11'], 0.5, 574, 620, 220, 200)] },
    {
      f: 0.16,
      items: [
        item('flying_platform_2', 0.26, 460, 1200, 200, 520),
        item('flying_platform_4', 0.42, 440, 1200, 200, 1080),
        item(['bck_rock_11', 'bck_rocks_1'], 0.32, 580, 520, 200, 0),
      ],
    },
    {
      f: 0.32,
      items: [
        item('tree_13', 0.5, 586, 900, 200, 0),
        item('tree_10', 0.56, 586, 900, 200, 300),
        item('tree_12', 0.56, 586, 900, 200, 600),
      ],
    },
    {
      f: 0.55,
      items: [
        item('tree_11', 0.62, 598, 1100, 220, 140),
        item('zutto_tree_3', 0.4, 598, 1100, 260, 520),
        item('tree_14', 0.42, 600, 1100, 260, 860),
        item('zutto_platform_3', 0.4, 600, 1400, 300, 1000),
      ],
    },
  ],
  near: [
    { s: 'plant_grass_2', scale: 0.6, every: 220, jitter: 90, tint: 0x3a6a70 },
    { s: 'purple_mushroom_3', scale: 0.32, every: 520, jitter: 200, offset: 200 },
    { s: 'mushroom_amanita_1', scale: 0.2, every: 640, jitter: 200, offset: 60 },
  ],
  trim: URALIA_TRIM,
};

/** Waggish Wander (snap 12963): snow falling from a deep teal sky, a crescent moon, mist, snowy floating islands and trees. */
const WAGGISH_WANDER_YARD = {
  sky: [0x1282a8, 0x53a4bf, 0xb9d9cc],
  field: 0xa9dfe1,
  fieldDark: 0x8cc6cc,
  soil: null,
  soilColor: 0x5a8a94,
  stars: { count: 110, color: 0xffffff, maxY: 560 },
  layers: [
    { f: 0.02, items: [item('moon', 0.22, 300, 2400, 0, 560, { noFlip: true, tint: 0xe0f0f0 })] },
    { f: 0.06, items: [item(['bck_hill_4', 'bck_hill_5', 'bck_hill_12', 'bck_hill_8'], 0.34, 574, 330, 140, 0, { tint: 0xe4f4ec })] },
    { f: 0.1, items: [item('newxp_haze_oval_1', 1.1, 590, 640, 200, 0, { tint: 0xffffff, alpha: 0.7 })] },
    {
      f: 0.14,
      items: [
        item('flying_platform_6', 0.26, 420, 1300, 200, 980),
        item('flying_platform_5', 0.34, 440, 1300, 200, 300, { tint: 0xf0e8f8 }),
      ],
    },
    {
      f: 0.3,
      items: [
        item('tree_8', 0.34, 588, 1000, 200, 520, { tint: 0xe8e0f0 }),
        item('zutto_platform_1', 0.36, 588, 1000, 200, 160),
        item('tree_12', 0.5, 588, 1000, 200, 820, { tint: 0xe0e8f0 }),
      ],
    },
    { f: 0.4, items: [item('newxp_haze_oval_1', 1, 600, 760, 200, 300, { tint: 0xffffff, alpha: 0.55 })] },
    {
      f: 0.55,
      items: [
        item('tree_11', 0.5, 600, 1100, 220, 0),
        item(['tree_14', 'tree_15'], 0.46, 600, 1100, 260, 440),
        item('zutto_platform_3', 0.4, 600, 1100, 260, 760, { tint: 0xd8f0e0 }),
      ],
    },
  ],
  near: [
    { s: 'plant_grass_2', scale: 0.6, every: 240, jitter: 90, tint: 0x5a8a94 },
    { s: 'zutto_plant_3', scale: 0.4, every: 600, jitter: 200, offset: 200, tint: 0x80b8c0 },
    { s: 'mushroom_amanita_1', scale: 0.18, every: 760, jitter: 200, offset: 420 },
  ],
  trim: ['purple_mushroom_3', 'snow_bush_01a_al1', 'plant_fern_2'],
};

/** Arid Boglands (snap 12968): an olive sky, pale bottletree domes far off, giant walking bottletrees and baskets of dry plants. */
const ARID_BOGLANDS_YARD = {
  sky: [0x4b4505, 0x636220, 0x7c833d],
  field: 0x4c3b2a,
  fieldDark: 0x3c2e20,
  soil: null,
  soilColor: 0x3a2a1c,
  layers: [
    { f: 0.03, items: [item('clouds5', 0.9, 380, 700, 260, 0, { tint: 0x4a4410, alpha: 0.6 })] },
    // the pale striped domes far off
    { f: 0.07, items: [item(['bck_hill_14', 'bck_hill_2'], 0.3, 568, 420, 140, 100, { tint: 0xe8d898 })] },
    { f: 0.14, items: [item(['background_bottletree_1', 'background_bottletree_2'], 0.9, 574, 420, 160, 0, { tint: 0x3a3418 })] },
    { band: { y: 574, h: 14, color: 0x5a5a3a, alpha: 0.7 }, f: 0.16 },
    { f: 0.32, items: [...walker(0.15, 590, 900, 820, { tint: 0xc8bc98 })] },
    { f: 0.55, items: [...walker(0.26, 606, 1300, 380), item('sprout', 0.34, 602, 700, 240, 760)] },
  ],
  near: [
    { s: 'grass_solid', scale: 0.6, every: 300, jitter: 120, tint: 0xb8b090 },
    { s: 'sprout', scale: 0.24, every: 760, jitter: 220, offset: 260 },
  ],
  trim: ['sprout', 'grass_solid', 'underground_plant_1'],
};

/** Faithful Fen (snap 12876): black over a teal sky, mist bands, a bottletree skyline, squat door trees and one giant. */
const FAITHFUL_FEN_YARD = {
  sky: [0x000000, 0x466a78, 0x677f87],
  field: 0x4a3929,
  fieldDark: 0x3a2d20,
  soil: null,
  soilColor: 0x34281c,
  layers: [
    { f: 0.03, items: [item('clouds_bg_middle_01a_newxp', 0.6, 470, 900, 300, 0, { tint: 0x8aa4b0, alpha: 0.55 })] },
    { f: 0.07, items: [item('background_horizon_bottletrees_1', 0.6, 568, 1100, 0, 0, { tint: 0x101416 })] },
    { f: 0.1, items: [item('clouds_bg_middle_01a_newxp', 0.5, 556, 700, 200, 300, { tint: 0x9ab4c0, alpha: 0.5 })] },
    { f: 0.22, items: [item(['background_bottletree_face', 'background_bottletree_hut', 'background_bottletree_barred'], 0.3, 584, 440, 140, 60, { tint: 0x8a7058 })] },
    { f: 0.45, items: [...walker(0.24, 600, 1300, 760), item('firebean_1', 0.5, 600, 800, 240, 300)] },
  ],
  near: [
    { s: 'grass_solid', scale: 0.6, every: 260, jitter: 100, tint: 0xa0a868 },
    { s: 'firebean_2', scale: 0.32, every: 620, jitter: 220, offset: 200 },
    { s: 'flower_bush_7', scale: 0.4, every: 900, jitter: 260, offset: 520, tint: 0xd8c840 },
  ],
  trim: ['firebean_1', 'grass_solid', 'underground_plant_1'],
};

/** Dusty Barrens (snaps 12882, 12883): giant acacias whose crowns spread over the top, a canyon behind, sand paths and bushes. */
const DUSTY_BARRENS_YARD = {
  sky: [0x9fb4a9, 0xb4b89c, 0xc8c4a0],
  field: 0x826a42,
  fieldDark: 0x644f26,
  soil: null,
  soilColor: 0x5a4424,
  layers: [
    { f: 0.03, items: [item('clouds_bg_middle_01a_newxp', 0.5, 300, 1000, 300, 0, { tint: 0x707878, alpha: 0.5 })] },
    { f: 0.07, items: [item(['cliff_cover_3', 'cliff_cover_5'], 0.18, 568, 300, 100, 0, { tint: 0xb4aa94 })] },
    { f: 0.14, items: [item(ACACIAS, 0.1, 574, 600, 200, 300, { tint: 0x7a7a5a }), item('alakol_cliff_1', 0.35, 580, 900, 200, 600, { tint: 0xc0b49c })] },
    { f: 0.3, items: [item(ACACIAS, 0.22, 590, 800, 240, 200, { tint: 0xc8c0a0 }), item('heights_bush_1', 0.4, 588, 520, 200, 100)] },
    { f: 0.6, items: [item(ACACIAS, 0.62, 610, 1100, 120, 640), item('pampas_2', 0.42, 602, 640, 200, 100)] },
  ],
  near: [
    { s: 'flower_bush_7', scale: 0.4, every: 360, jitter: 140 },
    { s: 'pampas_1', scale: 0.36, every: 520, jitter: 180, offset: 160 },
    { s: 'heights_bush_1', scale: 0.32, every: 700, jitter: 220, offset: 340 },
  ],
  trim: SAVANNA_TRIM,
};

/** Torrid Cove (snaps 12885, 12886): a cave mouth over the savanna, stalactites hanging from its roof, a grassy cliff, an acacia and rock spires. */
const TORRID_COVE_YARD = {
  sky: [0x9db4ae, 0xabb393, 0xbab177],
  field: 0x5f461a,
  fieldDark: 0x4a3612,
  soil: null,
  soilColor: 0x3e2c10,
  layers: [
    { f: 0.04, items: [item('land_l4_mesa_1', 0.24, 568, 900, 300, 0, { tint: 0x6a6a78 }), item(ACACIAS, 0.08, 572, 700, 260, 400, { tint: 0x6a6a5a })] },
    { f: 0.12, items: [item('stalagmite_2', 0.5, 584, 620, 200, 260, { tint: 0x5a4430 })] },
    { f: 0.3, items: [item(ACACIAS, 0.3, 592, 1100, 260, 500), item('stalagmite_2', 0.62, 592, 1100, 260, 900, { tint: 0x6a5038 })] },
    { f: 0.45, items: [item('heights_face_1', 0.3, 598, 1500, 100, 170, { tint: 0x7a6040 }), item('heights_bush_1', 0.5, 470, 1500, 60, 120)] },
    // stalactites hang from the cave roof across the top
    { f: 0.55, items: [item('stalagmite_2', 0.52, -30, 300, 120, 0, { flipY: true, tint: 0x4a3420 })] },
    { f: 0.7, items: [item('stalagmite_2', 0.6, -60, 520, 200, 160, { flipY: true, tint: 0x3a2818 })] },
  ],
  near: [
    { s: 'heights_bush_1', scale: 0.34, every: 420, jitter: 160 },
    { s: 'pampas_2', scale: 0.36, every: 600, jitter: 200, offset: 200 },
  ],
  nearTint: 0xa8a070,
  trim: SAVANNA_TRIM,
};

// ------------------------------------------------- The next yards from their snaps (lane yards2)
// The same snaps, the next yards by distance: six that need their own landscape (Glaring Muddle, Unkempt Crypt,
// Silent Orbit, Roaming Rubble, Dark Vista, Perfus Preference), then the ten Groddle forest and meadow yards, whose
// snaps show a dense pine forest behind tall pines and a flowering meadow where their streets have flat blob hills
// (pinehills_distant_1, wallpaper_tree_short_1, transition_hill_1). The forest is groddle1.swf's own pine shapes
// (forestShape_pine, the tree_pineCluster clumps) in front of the far mountains.

/** A dense pine treeline far off (forestShape_pine, 770 px wide), overlapping into one band. */
const pineBand = (tint, o = {}) => item(['forestShape_pine', 'corey3_forestShape_pine'], 0.5, 574, 300, 90, 0, { tint, ...o });
/** Pine clumps in front of the band (tree_pineCluster1-4). */
const pineClumps = (tint, o = {}) => item(['tree_pineCluster1', 'tree_pineCluster4', 'tree_pineCluster2', 'tree_pineCluster3'], 0.62, 582, 190, 80, 60, { tint, ...o });
/** A row of single pines between the clumps and the tall pines. */
const pineRow = (tint, o = {}) => item(['tree_coniferous_1', 'tree_coniferous1', 'tree_coniferous_3', 'tree_coniferous_2'], 0.1, 586, 170, 80, 40, { tint, ...o });
/** The tall pines that stand up out of view in every forest snap. */
const bigPines = (every, o = {}) => item(TALL_PINES, 0.17, 600, every, 180, 200, o);
/** Low meadow bushes along the tree line (heights_bush_3, groddle_bush7, bush_3). */
const meadowBushes = (o = {}) => item(['bush_patch_1', 'bush_3', 'bush_patch_2'], 0.26, 600, 330, 140, 80, o);
/** The white-flowered bushes dotted over the snaps' meadows. */
const daisyBushes = (o = {}) => item('flower_bush_7', 0.34, 600, 640, 240, 300, o);
const snowPeaks = (o = {}) => item('mountain_blue_1', 0.36, 560, 620, 200, 0, o);
const fluffyClouds = (o = {}) => item(['cloud_fluffy_1', 'cloud_fluffy_2'], 0.6, 470, 900, 300, 100, { alpha: 0.9, ...o });
const SNAP_MEADOW_NEAR = [
  { s: 'groddle_grass_2', scale: 0.55, every: 260, jitter: 110 },
  { s: 'flower_bush_7', scale: 0.26, every: 560, jitter: 200, offset: 180 },
  { s: 'groddle_fern_1', scale: 0.5, every: 620, jitter: 200, offset: 380 },
  { s: 'bare_patch_forest', scale: 0.32, every: 900, jitter: 120, offset: 160, below: 6 },
];

/** A forest yard from its snap: sky, far pieces, the pine band and clumps, tall pines and the meadow's edge. */
function snapForest({ sky, field, fieldDark, far = [], band, clumps, row, mid = [], tall, edge = [], near = SNAP_MEADOW_NEAR, trim = FOREST_TRIM }) {
  return {
    sky,
    field,
    fieldDark,
    soil: 'crosssection_short_3',
    soilColor: 0x6a4329,
    layers: [
      ...far,
      ...(band ? [{ f: 0.1, items: [band] }] : []),
      ...(clumps ? [{ f: 0.18, items: [clumps] }] : []),
      { f: 0.3, items: [...(row ? [row] : []), ...mid] },
      { f: 0.55, items: tall },
      { f: 0.75, items: edge },
    ],
    near,
    trim,
  };
}

/** Saplings Skip (snaps 12971, 12970): blue sky, white clouds, snowy peaks and brown rock hills over a pine band, tall pines, a flowering meadow. */
const SAPLINGS_SKIP_YARD = snapForest({
  sky: [0x4a7cb8, 0x86b2d8, 0xc6dce6],
  field: 0x627a2c,
  fieldDark: 0x506424,
  far: [
    { f: 0.03, items: [fluffyClouds({ y: 500 })] },
    { f: 0.05, items: [snowPeaks({ tint: 0xeef4fa })] },
    { f: 0.08, items: [item('heights_mound_3', 0.26, 570, 700, 260, 300, { tint: 0xc0a090 })] },
  ],
  band: pineBand(0x2a4628, { every: 420, jitter: 160 }),
  clumps: pineClumps(0x46663a, { every: 300, jitter: 140 }),
  row: pineRow(0x5a7a44, { every: 260 }),
  tall: [bigPines(620), item('tree_coniferous_2', 0.2, 598, 900, 260, 520)],
  edge: [meadowBushes(), daisyBushes(), item('heights_mound_3', 0.16, 602, 1300, 300, 900, { tint: 0xb09a8a })],
});

/** Busy Acre (snaps 12975, 12974): a pale yellow sky, a dark forest behind rows of tall pines, a bare dead tree, stumps and logs. */
const BUSY_ACRE_YARD = snapForest({
  sky: [0xe4c98c, 0xe2dcb2, 0xcad6c2],
  field: 0x5c6c2c,
  fieldDark: 0x4a5822,
  far: [{ f: 0.04, items: [item('groddle_mountain_cut1', 0.3, 556, 1200, 200, 500, { tint: 0x9aa6b0 })] }],
  band: pineBand(0x203620, { every: 260, jitter: 60 }),
  clumps: pineClumps(0x2a4226, { every: 150, jitter: 60 }),
  row: item(TALL_PINES, 0.12, 588, 230, 90, 0, { tint: 0x5a6a4c }),
  mid: [item('heights_tree_bare_2', 0.2, 590, 1300, 300, 700, { tint: 0x8a8a7a })],
  tall: [bigPines(300, { jitter: 100 })],
  edge: [meadowBushes({ every: 420 }), item('tree_dead_1', 0.26, 602, 1100, 300, 600), item('treeStump3', 0.3, 602, 900, 260, 200)],
  near: [...SNAP_MEADOW_NEAR, { s: 'fungus_oyster_01a_et1', scale: 0.16, every: 980, jitter: 260, offset: 700 }],
});

/** Evergreen Sweep (snaps 12979, 12978): a blue sky, one grey peak, a pine band with gaps, spaced tall pines, logs and rocks. */
const EVERGREEN_SWEEP_YARD = snapForest({
  sky: [0x78a4e6, 0xa6c2e4, 0xd6e0e4],
  field: 0x6a6a2c,
  fieldDark: 0x585822,
  far: [{ f: 0.04, items: [item('corey3_mountain_cut2', 0.34, 560, 1400, 300, 600, { tint: 0x8ea2b8 })] }],
  band: pineBand(0x2e4a2c, { every: 380, jitter: 150 }),
  clumps: pineClumps(0x3e5e36, { every: 260, jitter: 120 }),
  row: pineRow(0x50703e),
  tall: [bigPines(500), item('tree_coniferous2', 0.19, 598, 1100, 260, 700)],
  edge: [meadowBushes(), item('tree_dead_1', 0.28, 602, 1300, 300, 400), item('heights_mound_3', 0.14, 604, 900, 300, 700, { tint: 0xa09890 })],
});

/** Mulberry Mark (snaps 12981, 12980): a pink sky with pink mist, pale peaks, a dark forest across the whole yard, tall pines, rocks and roses. */
const MULBERRY_MARK_YARD = snapForest({
  sky: [0xe0a2b2, 0xe4aab6, 0xd892a2],
  field: 0x5e7230,
  fieldDark: 0x4c5e26,
  far: [
    { f: 0.04, items: [snowPeaks({ tint: 0xbcc0dc, scale: 0.26, y: 556, every: 460 })] },
    { f: 0.07, items: [item('newxp_haze_oval_1', 1.1, 540, 700, 200, 0, { tint: 0xf0b4c4, alpha: 0.6 })] },
  ],
  band: pineBand(0x1e3822, { every: 270, jitter: 60 }),
  clumps: pineClumps(0x284a2a, { every: 170, jitter: 70 }),
  row: pineRow(0x406a3c, { every: 220 }),
  tall: [bigPines(560)],
  edge: [meadowBushes(), item('heights_mound_3', 0.2, 602, 1000, 300, 500, { tint: 0x9a8c8a }), item('tree_dead_1', 0.26, 602, 1500, 300, 1100), item('flower_bush_1', 0.26, 602, 900, 260, 200)],
});

/** Tip Top Trinket (snaps 13022, 13021): a bright blue sky, clouds, pale blue peaks in mist, a brown rock ridge, very tall pines and grey-green bushes. */
const TIP_TOP_TRINKET_YARD = snapForest({
  sky: [0x2a92c8, 0x5ab0d0, 0xaad4d0],
  field: 0x6a8a30,
  fieldDark: 0x587426,
  far: [
    { f: 0.03, items: [fluffyClouds({ y: 480 })] },
    { f: 0.05, items: [snowPeaks({ tint: 0xc8dcf2 })] },
    { f: 0.08, items: [item('newxp_haze_oval_1', 1, 566, 600, 200, 0, { tint: 0xffffff, alpha: 0.5 })] },
    { f: 0.14, items: [item('heights_face_rock_2', 0.32, 584, 220, 60, 0, { tint: 0xb89a88 })] },
  ],
  clumps: pineClumps(0x3e6a3a, { every: 420, jitter: 200 }),
  tall: [bigPines(640, { scale: 0.19 }), item('tree_coniferous_1', 0.2, 598, 1100, 260, 800)],
  edge: [item(['heights_bush_1', 'heights_bush_2'], 0.4, 600, 380, 160, 100), item('pampas_2', 0.34, 600, 560, 200, 300)],
  near: [
    { s: 'heights_bush_2', scale: 0.32, every: 480, jitter: 180 },
    { s: 'pampas_2', scale: 0.3, every: 560, jitter: 200, offset: 200 },
    { s: 'groddle_grass_2', scale: 0.55, every: 300, jitter: 120, offset: 80 },
  ],
});

/** Vitric Inlet (snap 12880): a pale sky, white peaks over a still lake, pine clusters along the shore, tall pines, rocks and a log. */
const VITRIC_INLET_YARD = snapForest({
  sky: [0xd2eef8, 0xb0cce0, 0x90b0c8],
  field: 0x5c7a28,
  fieldDark: 0x4a6420,
  far: [
    { f: 0.04, items: [snowPeaks({ tint: 0xf2f6fa, y: 548 })] },
    { f: 0.06, items: [pineBand(0x34503c, { scale: 0.34, y: 552, every: 520, jitter: 220 })] },
    // the still inlet in front of the far shore
    { band: { y: 550, h: 30, color: 0xbccad2, alpha: 1 }, f: 0.08 },
    { f: 0.08, items: [item('water_ripple_double_1', 0.6, 566, 300, 120, 0, { tint: 0xe8f0f4, alpha: 0.7 })] },
  ],
  clumps: pineClumps(0x2e4c34, { every: 340, jitter: 160 }),
  row: pineRow(0x4a6a40),
  tall: [bigPines(520)],
  edge: [meadowBushes(), item('heights_mound_3', 0.14, 602, 900, 300, 300, { tint: 0xa08878 }), item('tree_dead_1', 0.26, 602, 1300, 300, 800)],
});

/** Olsen Rose (snap 12881): a lilac sky, a small grey peak, a dark forest far off, and an open meadow with one oak and one pine. */
const OLSEN_ROSE_YARD = snapForest({
  sky: [0xa898d2, 0xd2c6dc, 0xeadcc8],
  field: 0x5a7a2c,
  fieldDark: 0x486422,
  far: [{ f: 0.04, items: [item('corey3_mountain_cut2', 0.3, 560, 1300, 300, 700, { tint: 0x9aa8bc })] }],
  band: pineBand(0x3c5a3e, { scale: 0.42, every: 250, jitter: 50, y: 576 }),
  clumps: pineClumps(0x32502e, { scale: 0.5, every: 150, jitter: 60, y: 584 }),
  tall: [item('tree_deciduous3', 0.26, 598, 1200, 200, 300), item('tree_coniferous_2', 0.22, 598, 1200, 200, 760)],
  edge: [item('tree_dead_1', 0.26, 602, 1400, 300, 100), meadowBushes({ every: 520 })],
});

/** Blossom Thicket (snaps 12959, 12958): blue over a peach sunset, big white peaks, dense tall pines, rocks and wildflowers. */
const BLOSSOM_THICKET_YARD = snapForest({
  sky: [0x7a9ae4, 0xd8a4a4, 0xf0aa88],
  field: 0x5e8030,
  fieldDark: 0x4c6a26,
  far: [{ f: 0.04, items: [snowPeaks({ tint: 0xf6f6fa, scale: 0.44, y: 556 })] }],
  band: pineBand(0x2c4a2c, { every: 360, jitter: 140 }),
  clumps: pineClumps(0x3a6036, { every: 230, jitter: 100 }),
  row: pineRow(0x4e7a40, { every: 200 }),
  tall: [bigPines(380, { scale: 0.16 })],
  edge: [meadowBushes(), item('heights_mound_3', 0.18, 602, 900, 300, 400, { tint: 0xa89890 })],
  near: [...SNAP_MEADOW_NEAR, { s: 'flower_bush_3', scale: 0.26, every: 700, jitter: 240, offset: 60 }],
});

/** Warm Frolic (snap 12965): a yellow-to-pink sky, blue-grey peaks, a big oak, tall pines, a dark forest edge and white flowers. */
const WARM_FROLIC_YARD = snapForest({
  sky: [0xf6e060, 0xf2c0a0, 0xeaa2c2],
  field: 0x58902c,
  fieldDark: 0x467622,
  far: [{ f: 0.04, items: [snowPeaks({ tint: 0xb4c2d8, scale: 0.26, y: 562, every: 480 })] }],
  band: pineBand(0x2a4a28, { every: 440, jitter: 180 }),
  clumps: pineClumps(0x36602e, { every: 320, jitter: 160 }),
  tall: [item('tree_deciduous3', 0.3, 598, 1000, 160, 260), bigPines(500, { offset: 620 })],
  edge: [item('tree_dead_1', 0.26, 602, 1200, 300, 700), daisyBushes({ every: 520 }), meadowBushes({ every: 600 })],
});

/** Wailing Uplands (snaps 13043, 13042): an overcast blue-grey sky, a far plateau with lakes, oaks, pine clumps and flowering bushes. */
const WAILING_UPLANDS_YARD = snapForest({
  sky: [0x7a8c9c, 0x9aaab6, 0xb8c4c8],
  field: 0x6a8040,
  fieldDark: 0x586a34,
  far: [
    { f: 0.03, items: [fluffyClouds({ y: 480, tint: 0xe8ecf0 })] },
    { f: 0.04, items: [item('groddle_mountains_cutout', 0.34, 552, 900, 200, 300, { tint: 0xb0bcc6 })] },
    // the far plateau: flat grassland with grey lakes
    { f: 0.06, items: [item('evenground_horizon', 0.4, 562, 900, 100, 0, { tint: 0x9aac98 })] },
    { band: { y: 552, h: 8, color: 0xa4b4be, alpha: 0.9 }, f: 0.07 },
    { f: 0.08, items: [item('evenground_horizon', 0.34, 572, 700, 200, 300, { tint: 0x8a9c80 })] },
    { band: { y: 566, h: 6, color: 0xa8b8c0, alpha: 0.9 }, f: 0.09 },
  ],
  clumps: pineClumps(0x3e5a3c, { every: 360, jitter: 160 }),
  row: item(OAKS.slice(0, 2), 0.36, 586, 380, 140, 100, { tint: 0x80946c }),
  tall: [item('tree_deciduous3', 0.28, 598, 1000, 260, 300), item(OAKS.slice(0, 2), 0.5, 598, 1000, 260, 800)],
  edge: [daisyBushes({ every: 480 }), meadowBushes({ every: 500 })],
});

/** Glaring Muddle (snap 12872): a gold sky going red-brown above, streaked clouds, teal domes, walking bottletrees, bent root trunks and potted sprouts. */
const GLARING_MUDDLE_YARD = {
  sky: [0x6a3c3c, 0xb27a48, 0xe2b24c],
  field: 0x4a3a28,
  fieldDark: 0x3a2d1e,
  soil: null,
  soilColor: 0x34281a,
  layers: [
    { f: 0.03, items: [item(['clouds3', 'clouds1'], 0.9, 420, 520, 220, 0, { tint: 0x8a5a3c, alpha: 0.55 })] },
    { f: 0.08, items: [item(['background_bottletree_1', 'background_bottletree_2'], 0.8, 574, 520, 200, 200, { tint: 0x6a5a30 })] },
    // the teal striped domes behind the bog
    { f: 0.14, items: [item(['backhill1_green', 'backhill2_green'], 0.5, 582, 300, 100, 0, { tint: 0x70d0e0 })] },
    { f: 0.3, items: [...walker(0.13, 588, 1100, 900, { tint: 0xd8c098 }), item('legs_moss_4', 0.22, 588, 900, 260, 300, { tint: 0xd8c098 }), item('sprout', 0.22, 588, 600, 200, 100, { tint: 0xd8c098 })] },
    { f: 0.5, items: [...walker(0.2, 604, 1300, 520), item('legs_moss_1', 0.32, 602, 1300, 200, 80), item('sprout', 0.28, 602, 700, 240, 260)] },
  ],
  near: [
    { s: 'grass_solid', scale: 0.6, every: 260, jitter: 100, tint: 0xa8a070 },
    { s: 'sprout', scale: 0.22, every: 700, jitter: 240, offset: 300 },
    { s: 'underground_plant_1', scale: 0.6, every: 520, jitter: 200, offset: 120 },
  ],
  trim: ['sprout', 'grass_solid', 'underground_plant_1'],
};

/** Unkempt Crypt (snap 12877): a dark cave, roots hanging from the roof with their glowing bulbs, walking bottletrees and bent root trunks. */
const UNKEMPT_CRYPT_YARD = {
  sky: [0x241e14, 0x2e271a, 0x3a3020],
  field: 0x3e3224,
  fieldDark: 0x30261a,
  soil: null,
  soilColor: 0x2a2016,
  layers: [
    { f: 0.06, items: [item(['background_bottletree_1', 'background_bottletree_2'], 0.8, 574, 520, 200, 0, { tint: 0x3a3020 })] },
    { f: 0.12, items: [item(['hanging_braches2', 'hanging_braches1'], 0.3, 170, 240, 80, 0, { hang: true, tint: 0x6a4a3a })] },
    { f: 0.3, items: [...walker(0.15, 590, 1000, 300, { tint: 0xc8a870 }), item('legs_moss_4', 0.24, 590, 1000, 260, 800, { tint: 0xa88a60 })] },
    { f: 0.5, items: [...walker(0.2, 604, 1300, 760), item('legs_moss_1', 0.34, 604, 1300, 200, 120)] },
    { f: 0.6, items: [item(['hanging_braches1', 'hanging_braches2'], 0.34, 140, 420, 160, 200, { hang: true, tint: 0x9a7058 })] },
  ],
  near: [
    { s: 'grass_solid', scale: 0.55, every: 300, jitter: 120, tint: 0x8a8060 },
    { s: 'underground_plant_1', scale: 0.6, every: 560, jitter: 200, offset: 160 },
    { s: 'mushrooms', scale: 0.3, every: 800, jitter: 260, offset: 420 },
  ],
  nearTint: 0xc0a888,
  trim: ['mushrooms', 'grass_solid', 'underground_plant_1'],
};

/** Silent Orbit (snaps 13047, 13046): a black starry sky, a pale moon glowing low over the horizon, grey dust with craters and radioactive drums. */
const SILENT_ORBIT_YARD = {
  sky: [0x000000, 0x030304, 0x0a0a0c],
  field: 0xb2b1ac,
  fieldDark: 0x94938e,
  soil: null,
  soilColor: 0x6e6d69,
  stars: { count: 150, color: 0xffffff, maxY: 600 },
  layers: [
    // a pale moon low over the horizon: a white ball (k03_snowball_01) in a soft glow (light_spot)
    { f: 0.02, items: [item('light_spot', 0.16, 580, 2400, 0, 700, { noFlip: true, tint: 0xffffff, alpha: 0.5 }), item('k03_snowball_01', 0.8, 542, 2400, 0, 700, { noFlip: true, tint: 0xe6e6e2 })] },
    { band: { y: 580, h: 6, color: 0x2e2e2c, alpha: 1 }, f: 0.1 },
  ],
  near: [
    { s: 'earthdot_grp_2', scale: 1.6, every: 900, jitter: 260, offset: 100, tint: 0x4e4e4a, below: 26 },
    { s: 'earthdot_grp_4', scale: 0.8, every: 600, jitter: 200, offset: 400, tint: 0x9a9994, alpha: 0.5, below: 30 },
    { s: 'ra_drum_3', scale: 0.12, every: 1500, jitter: 200, offset: 220, tint: 0xffffff },
    { s: 'ra_drum_2', scale: 0.14, every: 1500, jitter: 200, offset: 300, tint: 0xffffff },
    { s: 'radioactive_sign_1', scale: 0.3, every: 1500, jitter: 200, offset: 60, tint: 0xffffff },
  ],
  nearTint: 0xc4c3be,
  trim: ['rock_rubble_01c_al1', 'gravel_2', 'rock_rubble_01f_al1'],
};

/** Roaming Rubble (snap 12884): a blue savanna sky, grey clouds, a layered canyon cliff, low rock outcrops, far peaks, small pines and big acacias. */
const ROAMING_RUBBLE_YARD = {
  sky: [0x5aa4c8, 0x9cc0c6, 0xd2d2b2],
  field: 0x9a8858,
  fieldDark: 0x806e44,
  soil: null,
  soilColor: 0x6b5232,
  layers: [
    { f: 0.03, items: [item(['clouds3', 'clouds1'], 0.8, 470, 700, 260, 200, { tint: 0x6a7480, alpha: 0.5 })] },
    { f: 0.05, items: [item('groddle_mountains_cutout', 0.32, 562, 900, 200, 0, { tint: 0x8a92a4 })] },
    { f: 0.1, items: [item('craggyMountain_background_01', 0.2, 584, 1300, 200, 100, { tint: 0xb89a80 }), item(['tree_coniferous_1', 'tree_coniferous_3'], 0.07, 580, 260, 120, 300, { tint: 0x3a5a34 })] },
    { f: 0.18, items: [item(['cliff_cover_5', 'cliff_cover_3'], 0.12, 586, 210, 80, 100), item(ACACIAS, 0.12, 580, 700, 260, 500, { tint: 0x7a7c60 })] },
    { f: 0.36, items: [item(ACACIAS, 0.26, 592, 900, 260, 300)] },
    { f: 0.6, items: [item(ACACIAS, 0.34, 604, 1300, 200, 800), item(['cliff_cover_3', 'heights_face_rock_2'], 0.13, 604, 1000, 300, 200)] },
  ],
  near: [
    { s: 'pampas_2', scale: 0.32, every: 420, jitter: 160 },
    { s: 'heights_bush_2', scale: 0.28, every: 520, jitter: 200, offset: 160, tint: 0x6a7a4a },
    { s: 'heights_bush_4', scale: 0.2, every: 700, jitter: 260, offset: 380, tint: 0x8a9a5a },
  ],
  trim: SAVANNA_TRIM,
};

/** Dark Vista (snap 12870): a black-green night, a pale fog light behind the trees, pale rock pillars in the fog, bare trees, vines hanging from above. */
const DARK_VISTA_YARD = {
  sky: [0x0a0e0c, 0x161d18, 0x262c26],
  field: 0x0a0a0a,
  fieldDark: 0x040404,
  soil: null,
  soilColor: 0x080808,
  layers: [
    // the pale fog light low behind the trees
    { f: 0.05, items: [item('groddle_light_pool', 1.7, 616, 600, 200, 100, { tint: 0xfff4c0 })] },
    { f: 0.07, items: [item(['craggyMountain_background_01', 'craggyMountain_background_02'], 0.14, 580, 420, 160, 100, { tint: 0x9aa090, alpha: 0.55 })] },
    { f: 0.1, items: [item(SILHOUETTES, 0.1, 580, 90, 50, 0, { tint: 0x323a32, alpha: 0.85 })] },
    { f: 0.14, items: [item('newxp_haze_oval_1', 1.2, 600, 700, 200, 0, { tint: 0x9a9c94, alpha: 0.3 })] },
    { f: 0.25, items: [item(SILHOUETTES, 0.15, 590, 260, 120, 60, { tint: 0x161c16 })] },
    { f: 0.5, items: [item(['tree_02', 'heights_tree_bare_1', 'tree_03'], 0.2, 604, 520, 200, 200, { tint: 0x040504 })] },
    { f: 0.65, items: [item('hanging_vine_01', 0.32, 20, 900, 260, 300, { hang: true, tint: 0x0c100c })] },
  ],
  near: [
    { s: 'grass_solid', scale: 0.5, every: 240, jitter: 100, tint: 0x141614 },
    { s: 'underground_plant_1', scale: 0.5, every: 560, jitter: 200, offset: 200, tint: 0x181a18 },
  ],
  nearTint: 0x202020,
  trim: ['grass_solid', 'underground_plant_1', 'grass_solid'],
};

/** Perfus Preference (snap 12878): a deep green sky, grey cloud streaks, bare trees far off, bottletree huts, walking bottletrees, red-leaved plants, mushrooms. */
const PERFUS_PREFERENCE_YARD = {
  sky: [0x063232, 0x214c3c, 0x5c7a58],
  field: 0x40302a,
  fieldDark: 0x32251e,
  soil: null,
  soilColor: 0x2e221a,
  layers: [
    { f: 0.03, items: [item(['clouds3', 'clouds1'], 0.9, 440, 420, 200, 0, { tint: 0x9ab4aa, alpha: 0.55 })] },
    { f: 0.08, items: [item(['heights_tree_bare_3', 'heights_tree_bare_4', 'background_bottletree_silhouette'], 0.1, 580, 220, 100, 0, { tint: 0x2a3a30 })] },
    { f: 0.2, items: [item(['background_bottletree_hut', 'background_bottletree_barred'], 0.3, 586, 560, 200, 100, { tint: 0xa09078 })] },
    { f: 0.35, items: [...bottle(0.15, 592, 1100, 600, 'treetop_noflowers_3', { tint: 0xc0b090 }), item('firebean_1', 0.34, 592, 900, 220, 300)] },
    { f: 0.55, items: [...walker(0.21, 606, 1300, 380), ...bottle(0.2, 606, 1300, 1000), item('firebean_2', 0.4, 604, 1300, 240, 760)] },
  ],
  near: [
    { s: 'grass_solid', scale: 0.6, every: 240, jitter: 100, tint: 0xa8b078 },
    { s: 'mushroom_amanita_1', scale: 0.12, every: 560, jitter: 200, offset: 160 },
    { s: 'firebean_2', scale: 0.26, every: 760, jitter: 240, offset: 420 },
  ],
  trim: ['firebean_1', 'grass_solid', 'underground_plant_1'],
};

/**
 * The purchase looks (js/homes.js HOME_STYLES, picked in the tutorial or at the
 * Home Street Selection Machine) start on the source's tutorial styles (G263):
 * items/magic_rock.js onConversation 'chassis-picker' 594-605 sets the street
 * and yard by the newxp choice street (firebog_4_high, meadow_ext_default_high,
 * uralia_2_high; locations/newxp_training2.js hitBox 170-177 names the same three).
 */
export const PURCHASE_STREET_STYLE = {
  meadow: 'meadow_ext_default_high',
  firebog: 'firebog_4_high',
  uralia: 'uralia_2_high',
};

/** magic_rock.js 594-605: the yard (interior) style each choice starts on. */
export const PURCHASE_YARD_STYLE = {
  meadow: 'meadows_int_default__high',
  firebog: 'firebog_int_4__high',
  uralia: 'uralia_int_2_hor_high',
};

/**
 * Back-yard (interior) styles (register G135 / G223). GSJS homes_interior_configs
 * (inc_data_homes_prod.js 1-816) name 37 templates, all layout "house-right" with
 * the groddle frame (home_groddle.swf, frame groddle): the house is the same in
 * every one, only the yard landscape left of it changes. No interior template's
 * geometry or main image was archived, so each yard is drawn with the CC0
 * composition of the street style from the same template family. The pairs come
 * from the template streets' names in inc_data_maps_prod.js (each interior row's
 * template is named <family>_int_<n>_HOR_high, its street's <family>_ext_<n>_high;
 * tests/home-styles.test.js reads them), not from the style keys, which lie three
 * times: Night Lights is keyed firebog_int_1b_hor_high but its template
 * LHVMN2RPE9U24OJ is uralia_int_2a_HOR_high (Midnight Glow's yard, as a player's
 * "Midnight Glow - (Night Lights)" in forum general/20994 page 2 says too), and
 * the keys of Easy Ash (firebog_int_4__high, template firebog_int_4_HOR_high) and
 * Perfus Preference (firebog_int_4_hor_high, template firebog_int_4a_HOR_high) are
 * swapped, so Easy Ash pairs with Vidya Vent, the street the Firebog tutorial
 * choice sets with it (magic_rock.js 594-597). The default yard pairs with the default street
 * (config_base.js START_INT_TEMPLATE meadows_int_default__high / START_EXT_TEMPLATE
 * meadow_ext_default_high), and the September 2012 batch added five yards and
 * five streets together (Engadget 2012-09-14 "5 interior and 5 exterior"; their
 * templates end IJ83 and their main images are dated 2012-09-05): Tjorn Trample /
 * Vatn Road, Nightfall Surprise / Eventide Essence, Ruddy Skies / Sunset Strip,
 * Grasslands Graze / Llano Lane, Anemone Alley / Coral Caves
 * (research/web-hunt-2026-10-24/REVIEW.md finding 2). A string is the street style whose look the yard
 * uses; `missing` keeps a yard out of the choices; `{ lookOf, look, ref }` is a yard drawn from a
 * surviving picture of the yard itself (`ref`, reference only); `lookOf` with `borrowed` says plainly on the
 * style's data what stands in for its art.
 */
export const YARD_LOOKS = {
  aranna_int_1_hor_high: 'aranna_ext_1_high',
  basic: { lookOf: 'basic', ref: 'snap 12965 "Warm Frolic backyard style" (2012-05-21, 3000x1516)', look: WARM_FROLIC_YARD },
  firebog_1_hor_high: { lookOf: 'firebog_1_high', ref: 'snap 12968 "Arid Boglands backyard style" (2012-05-21, 3000x1516)', look: ARID_BOGLANDS_YARD },
  firebog_int_1b_hor_high: { lookOf: 'uralia_2a_high', ref: 'snap 12874 "Night Lights backyard style" (2012-05-21, 3000x1516)', look: NIGHT_LIGHTS_YARD },
  firebog_int_1b__high: { lookOf: 'firebog_1b_high', ref: 'snap 12872 "Glaring Muddle backyard style" (2012-05-21, 3000x1516)', look: GLARING_MUDDLE_YARD },
  firebog_int_2__high: { lookOf: 'firebog_2_high', ref: 'snap 12876 "Faithful Fen backyard style" (2012-05-21, 3000x1516)', look: FAITHFUL_FEN_YARD },
  firebog_int_3_hor_high: { lookOf: 'firebog_3_high', ref: 'snap 12877 "Unkempt Crypt backyard style" (2012-05-21, 3000x1516)', look: UNKEMPT_CRYPT_YARD },
  firebog_int_4_hor_high: { lookOf: 'firebog_4a_high', ref: 'snap 12878 "Perfus Preference backyard style" (2012-05-21, 3000x1516)', look: PERFUS_PREFERENCE_YARD },
  firebog_int_4__high: 'firebog_4_high',
  forest_1_hor_high: { lookOf: 'forest_1_high', ref: 'snaps 12971 and 12970 "Saplings Skip backyard style", left and right side (2012-05-21, 3000x1516)', look: SAPLINGS_SKIP_YARD },
  forest_2__high: { lookOf: 'forest_2_high', ref: 'snaps 12975 and 12974 "Busy Acre backyard style", left and right side (2012-05-21, 3000x1516)', look: BUSY_ACRE_YARD },
  forest_3__high: { lookOf: 'forest_3_high', ref: 'snaps 12979 and 12978 "Evergreen Sweep backyard style", left and right side (2012-05-21, 3000x1516)', look: EVERGREEN_SWEEP_YARD },
  forest_4__high: { lookOf: 'forest_4_high', ref: 'snap 12880 "Vitric Inlet backyard style" (2012-05-21, 3000x1516)', look: VITRIC_INLET_YARD },
  forest_5__high: { lookOf: 'forest_5_high', ref: 'snaps 12981 and 12980 "Mulberry Mark backyard style", left and right side (2012-05-21, 3000x1516)', look: MULBERRY_MARK_YARD },
  forest_6__high: { lookOf: 'forest_6_high', ref: 'snap 12881 "Olsen Rose backyard style" (2012-05-21, 3000x1516)', look: OLSEN_ROSE_YARD },
  forest_dusk_int_1_hor_high: 'forest_dusk_ext_1_high',
  forest_sunset_int_1_hor_high: 'forest_sunset_ext_1_high',
  heights_1__high: { lookOf: 'heights_1_high', ref: 'snaps 13022 and 13021 "Tip Top Trinket backyard style", left and right side (2012-05-21, 3000x1516)', look: TIP_TOP_TRINKET_YARD },
  highlands_1_hor_high: { lookOf: 'highlands_1_high', ref: 'snaps 13043 and 13042 "Wailing Uplands backyard style", left and right side (2012-05-21, 3000x1516)', look: WAILING_UPLANDS_YARD },
  kajuu_1__high: { lookOf: 'kajuu_1_high', ref: 'snaps 12883 and 12882 "Dusty Barrens backyard style", left and right side (2012-05-21, 3000x1516)', look: DUSTY_BARRENS_YARD },
  kajuu_2__high: { lookOf: 'kajuu_2_high', ref: 'snap 12884 "Roaming Rubble backyard style" (2012-05-21, 3000x1516)', look: ROAMING_RUBBLE_YARD },
  kajuu_int_3_hor_high: { lookOf: 'kajuu_3_high', ref: 'snaps 12886 and 12885 "Torrid Cove backyard style", left and right side (2012-05-21, 3000x1516)', look: TORRID_COVE_YARD },
  meadows_1__high: { lookOf: 'meadows_1_high', ref: 'snaps 12959 and 12958 "Blossom Thicket", left and right side (2012-05-21, 3000x1516)', look: BLOSSOM_THICKET_YARD },
  meadows_2__high: 'meadows_2_high',
  meadows_3__high: 'meadows_3_high',
  meadows_int_default__high: 'meadow_ext_default_high',
  // Anemone Alley, Coral Caves' yard (templates POL_int_coral_HOR_high / POL_ext_coral_high). A player's 2012-09-07
  // snap through the house door (76401; reference only) shows the yard itself: tiered rocks, beaded
  // branches among them, a pair of fiddleheads, a big spotted fiddlehead and beaded branches in front, a flat
  // rock, white-capped pebbles and dark mounds behind, all murky yellow. The same CC0 pieces as the street
  // (cone_top_rock, underground_bogwillow, plant_fern, plant_giant_fern, rock_rubble, rock_snowy, cave_background_hill).
  pol_int_coral_hor_high: {
    lookOf: 'pol_ext_coral_high',
    ref: 'snap 76401 (2012-09-07, 900x600): the yard through the house door',
    look: {
      sky: [0x1c1206, 0x2e200c, 0x4a3418],
      field: 0x7a6230,
      fieldDark: 0x5e4a22,
      soil: null,
      soilColor: 0x3e3014,
      layers: [
        { f: 0.04, items: [item(['back_wall_2', 'back_wall_4'], 0.34, 562, 620, 240, 200, { tint: 0xffa030 })] },
        { f: 0.08, items: [item(['cave_background_hill_1', 'cave_background_hill_2'], 0.17, 566, 120, 50, 0, { tint: 0xf07a0a, alpha: 0.85 })] },
        { band: { y: 556, h: 10, color: 0x1a1606, alpha: 1 }, f: 0.1 },
        { f: 0.22, items: [item('underground_bogwillow', 0.4, 574, 700, 240, 300, { tint: 0xf0c070 })] },
        {
          f: 0.4,
          items: [
            item(['cone_top_rock_01a_al1', 'cone_top_rock_01b_al1'], 0.48, 594, 560, 200, 0, { tint: 0x8a7032 }),
            item(['underground_bogwillow_3', 'underground_bogwillow_1'], 0.8, 596, 760, 240, 300, { tint: 0xf0c070 }),
          ],
        },
        {
          f: 0.7,
          items: [
            item('rock_rubble_01b_al1', 0.55, 604, 840, 260, 200, { tint: 0x8a7032 }),
            item('rock_snowy_1c_al1', 0.6, 604, 1100, 300, 650, { tint: 0xb09a5c }),
            item('plant_giant_fern_2', 0.85, 608, 900, 260, 500, { tint: 0xe08838 }),
          ],
        },
      ],
      near: [
        { s: 'plant_fern_2', scale: 0.6, every: 340, jitter: 120, tint: 0xf09030 },
        { s: 'plant_fern_1', scale: 0.6, every: 620, jitter: 200, offset: 160, tint: 0xf09030 },
        { s: 'underground_bogwillow_2', scale: 0.7, every: 560, jitter: 200, offset: 180, tint: 0xf0c070 },
        { s: 'rock_rubble_01g_al1', scale: 0.4, every: 480, jitter: 160, offset: 320, tint: 0x8a7032 },
      ],
      nearTint: 0x8a7032,
      trim: ['plant_fern_2', 'rock_rubble_01d_al1', 'plant_giant_fern_1'],
    },
  },
  pol_int_crimson_hor_high: '_crimson_forest_high',
  pol_int_mordor_high: { missing: 'No street style shares its template family (mordor), and its own template was never archived.' },
  savannah_int_1__high: 'savannah_ext_1_high',
  uralia_1_hor_high: { lookOf: 'uralia_1_high', ref: 'snap 12961 "Wistful Tangle backyard style" (2012-05-21, 3000x1516)', look: WISTFUL_TANGLE_YARD },
  uralia_int_2_hor_high: 'uralia_2_high',
  uralia_int_3__high: { lookOf: 'uralia_3_high', ref: 'snap 12963 "Waggish Wander backyard style" (2012-05-21, 3000x1516)', look: WAGGISH_WANDER_YARD },
  _moon__high: { lookOf: '_moon_high', ref: 'snaps 13047 and 13046 "Silent Orbit backyard style", left and right side (2012-05-21, 3000x1516)', look: SILENT_ORBIT_YARD },
  _rook__high: { lookOf: '_rook_high', ref: 'snap 12870 "Dark Vista backyard style" (2012-05-21, 3000x1516)', look: DARK_VISTA_YARD },
  _ruin__high: '_ruin_high',
  // The pair's key hid it: Mythical Oak's exterior row is meadows_int_default__high, the same key as
  // interior Plush Pasture (inc_data_homes_prod.js 552, 873). Templates POL_ext_triney_2_high and
  // POL_int_triney_2_HOR_high (inc_data_maps_prod.js 19197, 19225); a player's note of the pair (general/19703).
  // The yard itself survives in players' snaps (reference only, never shipped): a dusk-purple sky,
  // big dark oaks with their canopy over the top, dark curling mushroom trees and a teal light shaft
  // behind, ground mist, glowing blue mushrooms round the trunks, a fallen log, and fiddleheads and
  // dark red flowers in front. Composed from CC0 decos (groddle1, maytang, corey3 bundles).
  _triney__high: {
    lookOf: 'meadows_int_default__high',
    ref: 'snap 12871 "Bewitched Backwoods backyard style" (2012-05-21, 3000x1516) and snap 12944 (2012-05-14)',
    look: {
      sky: [0x261c2a, 0x3a2b40, 0x4e3b54],
      field: 0x2c3a24,
      fieldDark: 0x223019,
      soil: 'crosssection_short_3',
      soilColor: 0x5a3a26,
      layers: [
        { f: 0.05, items: [item('tree_group_bg_4_maytang', 0.62, 562, 380, 140, 0, { tint: 0x46384f })] },
        { f: 0.08, items: [item('newxp_haze_oval_1', 1.2, 560, 760, 200, 0, { tint: 0x9a88a8, alpha: 0.45 })] },
        { f: 0.12, items: [item(['mushroom_light_tree_maytang', 'mushroom_light_tree_2_maytang'], 0.5, 572, 1100, 260, 520, { tint: 0x35283f })] },
        { f: 0.16, items: [item('light_shafts_blue', 0.36, 548, 1500, 300, 900, { alpha: 0.55 })] },
        { f: 0.22, items: [item(OAKS.slice(0, 2), 0.62, 578, 420, 140, 100, { tint: 0x4a5a44 })] },
        { f: 0.3, items: [item('newxp_haze_oval_1', 1, 590, 640, 200, 300, { tint: 0xb0a4bc, alpha: 0.35 })] },
        { f: 0.5, items: [item(OAKS.slice(0, 2), 0.95, 598, 820, 200, 300, { tint: 0xb4c8a4 }), item('tree_dead_2', 0.5, 596, 1700, 300, 1100, { tint: 0x7a7070 })] },
        { f: 0.75, items: [item(['corey3_shroom_aqua1', 'corey3_shroom_aqua2', 'mushroom_aqua_1'], 0.42, 603, 560, 220, 200), item('purple_mushroom_1', 0.4, 603, 900, 260, 640)] },
        { f: 0.9, items: [item('tree_plane_foliage_01a_g1', 0.8, 10, 1100, 300, 300, { hang: true, tint: 0x24341f })] },
      ],
      near: [
        { s: 'groddle_grass_2', scale: 0.5, every: 280, jitter: 120, tint: 0x6a7a68 },
        { s: 'plant_fern_1', scale: 0.5, every: 420, jitter: 160, offset: 120 },
        { s: 'bling_branchrosebrush_red_1', scale: 0.4, every: 700, jitter: 220, offset: 300, tint: 0x8a3a44 },
        { s: 'plant_fern_3', scale: 0.6, every: 520, jitter: 200, offset: 60 },
      ],
      trim: ['plant_fern_1', 'bling_mushroom_bunch_ground_1', 'plant_giant_fern_1'],
    },
  },
};
