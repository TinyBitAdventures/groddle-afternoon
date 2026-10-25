/**
 * Character builder: the saved appearance and its presets.
 *
 * Every look is Tiny Speck's avatar rebuilt from its vector parts
 * (js/avatar-rig.js, js/avatar-looks.js): real hair, eyes, mouth, nose, ears
 * and wardrobe articles in their GSJS colourways. Presets come in three
 * groups: the remake's own looks, Tiny Speck's four new-player starters
 * (js/avatar-starter.js) and costume sets from the GSJS wardrobe.
 *
 * The bitmap avatars are retired: the classic and alt portraits and the
 * recovered 62d8 sheets were real players' pixels captured by Wayback
 * (reference only). Saves that used them move to the nearest vector look
 * (migrateAppearance).
 */
import { normalizeVectorFields, vectorFieldsFromColors } from './avatar-looks.js';
import { installReimaginedTags } from './avatar-reimagined.js';
import { starterRowFields } from './avatar-starter.js';
import { saveStore } from './save-store.js?v=mp2-1';

// The builder's wardrobe chips (game.js) get a "Reimagined" tag on the
// greyscale masters the remake coloured (js/avatar-reimagined.js, row G52).
if (typeof document !== 'undefined') installReimaginedTags(document);

/** @typedef {{ r: number, g: number, b: number }} Rgb */

/**
 * @typedef {{
 *   bodyStyle: 'vector',
 *   vector?: object,
 *   hair: Rgb,
 *   skin: Rgb,
 *   shirt: Rgb,
 *   shirtDark: Rgb,
 *   pants: Rgb,
 *   shoes: Rgb,
 *   sole: Rgb,
 * }} Appearance
 * The colour fields are the older recolour looks' (kept so an old save's
 * colours can carry over); vector looks draw only from `vector`.
 */

export const STORAGE_KEY = 'groddle.avatar.appearance.v1';
/**
 * Saved appearance format: 1 had no `v` (colour-only looks), 2 added vector
 * looks, 3 retired the bitmap body styles.
 */
export const APPEARANCE_VERSION = 3;

export const BODY_STYLES = {
  // Tiny Speck's vector avatar: rig + articles composited per look
  // (js/avatar-compositor.js), default look prerendered.
  vector: {
    id: 'vector',
    label: 'Glitch',
    sheets: true,
    vector: true,
  },
};

/** Body styles older saves may hold; all drew players' Wayback pixels. */
export const RETIRED_BODY_STYLES = Object.freeze(['glitch', 'classic', 'alt']);

const COLOUR_FIELDS = ['hair', 'skin', 'shirt', 'shirtDark', 'pants', 'shoes', 'sole'];

/** The colour fields every appearance carries (the old default's: lavender hair, grey skin, lime top). */
const DEFAULT_COLOURS = Object.freeze({
  hair: { r: 205, g: 205, b: 232 },
  skin: { r: 190, g: 190, b: 196 },
  shirt: { r: 214, g: 240, b: 40 },
  shirtDark: { r: 150, g: 170, b: 30 },
  pants: { r: 100, g: 40, b: 110 },
  shoes: { r: 120, g: 210, b: 40 },
  sole: { r: 170, g: 60, b: 200 },
});

/**
 * The retired bitmap presets, as saved (style + colours), and the vector look
 * each moves to: the untouched defaults to the vector default, the five
 * colour themes to their vector rebuilds (10c415cb), the purple Alt body to
 * Midnight. Any other retired look keeps its colours as tints.
 */
const LEGACY_LOOKS = [
  ['glitch', DEFAULT_COLOURS, 'vector'],
  ['classic', { hair: [72, 140, 72], skin: [190, 180, 165], shirt: [180, 30, 40], shirtDark: [40, 32, 40], pants: [50, 90, 140], shoes: [50, 130, 50], sole: [210, 195, 160] }, 'vector'],
  ['classic', { hair: [70, 100, 200], skin: [200, 185, 175], shirt: [40, 90, 180], shirtDark: [25, 40, 90], pants: [40, 50, 80], shoes: [40, 70, 140], sole: [200, 200, 210] }, 'blueberry'],
  ['classic', { hair: [200, 100, 40], skin: [210, 170, 130], shirt: [180, 90, 40], shirtDark: [80, 40, 20], pants: [100, 70, 45], shoes: [100, 60, 35], sole: [220, 200, 160] }, 'autumn'],
  ['classic', { hair: [50, 45, 70], skin: [150, 145, 160], shirt: [90, 40, 140], shirtDark: [30, 20, 45], pants: [35, 35, 50], shoes: [40, 35, 55], sole: [180, 175, 190] }, 'midnight'],
  ['classic', { hair: [230, 100, 160], skin: [240, 200, 190], shirt: [230, 80, 140], shirtDark: [80, 30, 55], pants: [100, 60, 140], shoes: [230, 90, 150], sole: [255, 230, 240] }, 'candy'],
  ['classic', { hair: [50, 110, 55], skin: [160, 175, 140], shirt: [50, 120, 70], shirtDark: [25, 55, 35], pants: [55, 80, 50], shoes: [60, 100, 45], sole: [200, 195, 150] }, 'forest'],
  ['alt', { hair: [150, 80, 160], skin: [170, 120, 180], shirt: [50, 90, 140], shirtDark: [30, 50, 80], pants: [60, 140, 90], shoes: [200, 100, 60], sole: [220, 180, 140] }, 'midnight'],
];

const rgbOf = (c) => (Array.isArray(c) ? { r: c[0], g: c[1], b: c[2] } : c);
const colourKey = (style, colours) => [style, ...COLOUR_FIELDS.map((k) => {
  const c = rgbOf(colours[k]);
  return `${clampByte(c?.r)},${clampByte(c?.g)},${clampByte(c?.b)}`;
})].join('|');

/**
 * Default look: the vector Glitch in the catalog's default outfit.
 * @returns {Appearance}
 */
export function createDefaultAppearance() {
  const colours = Object.fromEntries(COLOUR_FIELDS.map((k) => [k, { ...DEFAULT_COLOURS[k] }]));
  return { ...colours, bodyStyle: 'vector', vector: normalizeVectorFields({}) };
}

/** A vector preset: catalog default plus these fields. */
function vectorPreset(fields) {
  return { ...createDefaultAppearance(), vector: normalizeVectorFields(fields) };
}

/** The builder's preset chips, one group at a time (js/avatar-builder-ui.js). */
export const PRESET_GROUPS = Object.freeze([
  { id: 'looks', label: 'Looks' },
  { id: 'starter', label: 'Starter' },
  { id: 'costumes', label: 'Costumes' },
]);

/**
 * Matching costume sets from the GSJS wardrobe (inc_data_clothing.js): each
 * article in its own colourway (catalog variant index = GSJS colourway id),
 * the rest of the look filled from ordinary articles and real palette ids so
 * it reads finished. Nothing is recoloured. Giants' masks and robes share id
 * runs (masks 1122-1132, robes 1180-1191; Rook 1130, 1153-1154).
 */
const COSTUMES = [
  // Rook: rook_mask 1130, rook_outfit_top 1153, rook_outfit_pants 1154.
  ['rook', 'Rook', { outfit: { hair: 'hair_B0018', hat: 'rook_mask', eyes: 'eyes_20101109E', mouth: 'mouth_20101109E', nose: 'nose_0001', ears: 'ears_0002', shirt: 'plain_tee_dark', coat: 'rook_outfit_top', pants: 'rook_outfit_pants', shoes: 'nevermore_boots' }, variant: { shirt: 3, shoes: 0 }, skinColor: 52, hairColor: 81 }],
  // Mab: mab_mask 1129, mab 1191.
  ['mab', 'Mab', { outfit: { hair: 'Curly_pixie_hair', hat: 'mab_mask', eyes: 'eyes_01', mouth: 'mouth_09', nose: 'nose_0009', ears: 'ears_0005', shirt: 'plain_tee_dark', coat: 'mab', pants: 'plain_trousers', shoes: 'laborer_boots' }, variant: { shirt: 0, pants: 3, shoes: 0 }, skinColor: 50, hairColor: 83 }],
  // Cosma: cosma_hat 652, cosma_coat 619.
  ['cosma', 'Cosma', { outfit: { hair: 'loopy_bun', hat: 'cosma_hat', eyes: 'eyes_girly_2', mouth: 'mouth_little_lady', nose: 'nose_skinny_1', ears: 'ears_0001', shirt: 'plain_tee_light', coat: 'cosma_coat', pants: 'leggings_pants', shoes: 'khussa' }, variant: { shirt: 0, coat: 0, pants: 1, shoes: 3 }, skinColor: 41, hairColor: 76 }],
  // Alph: alph_mask 1124, alph_lem 1189.
  ['alph', 'Alph', { outfit: { hair: 'hair_07', hat: 'alph_mask', eyes: 'eyes_big_eyebrows', mouth: 'mouth_12', nose: 'nose_manly_1', ears: 'ears_0003', shirt: 'classic_undershirt', coat: 'alph_lem', pants: 'plain_trousers', shoes: 'steeltoe_boots' }, variant: { shirt: 0, coat: 0, pants: 7, shoes: 0 }, skinColor: 13, hairColor: 74 }],
  // Lem: Lem_mask 1126, alph_lem 1190.
  ['lem', 'Lem', { outfit: { hair: 'hair_09', hat: 'Lem_mask', eyes: 'eyes_20101109B', mouth: 'mouth_01', nose: 'nose_0017', ears: 'ears_0009', shirt: 'plain_tee_dark', coat: 'alph_lem', pants: 'plain_trousers', shoes: 'chelsea_boots' }, variant: { shirt: 4, coat: 1, pants: 15, shoes: 1 }, skinColor: 45, hairColor: 65 }],
  // Grendaline: grendaline_mask 1128, Grendaline_tii_outfit 1188.
  ['grendaline', 'Grendaline', { outfit: { hair: 'wavy_tieback_ponytail', hat: 'grendaline_mask', eyes: 'eyes_girly_1', mouth: 'mouth_20101109C', nose: 'nose_curl', ears: 'ears_fish', shirt: 'plain_tee_light', coat: 'Grendaline_tii_outfit', pants: 'leggings_pants', shoes: 'fairy_shoes' }, variant: { shirt: 0, coat: 1, pants: 1, shoes: 1 }, skinColor: 31, hairColor: 84 }],
  // Chicken suit: chicken_hat 471, chicken_suit_top 444, chicken_suit_pants 484, chicken_feet 485.
  ['chicken', 'Chicken suit', { outfit: { hair: 'hair_03', hat: 'chicken_hat', eyes: 'eyes_03', mouth: 'mouth_tongue', nose: 'nose_0001', ears: 'ears_0001', shirt: 'plain_tee_light', coat: 'chicken_suit_top', pants: 'chicken_suit_pants', shoes: 'chicken_feet' }, variant: { hat: 0, shirt: 2, coat: 0, pants: 0 }, skinColor: 4, hairColor: 69 }],
  // Bunny suit: bunny_suit_hat 295, bunny_suit_coat 594, bunny_suit_pants 511, bunny_slippers 473.
  ['bunny', 'Bunny suit', { outfit: { hair: 'pigtails', hat: 'bunny_suit_hat', eyes: 'eyes_girly_2', mouth: 'mouth_10', nose: 'nose_curl', ears: 'ears_0001', shirt: 'plain_tee_light', coat: 'bunny_suit_coat', pants: 'bunny_suit_pants', shoes: 'bunny_slippers' }, variant: { hat: 0, shirt: 1, coat: 0, pants: 1, shoes: 0 }, skinColor: 1, hairColor: 87 }],
  // Unicorn: unicorn_hat 834, unicorn_top 843, unicorn_pants 844.
  ['unicorn', 'Unicorn', { outfit: { hair: 'loopy_bun', hat: 'unicorn_hat', eyes: 'eyes_rainbow', mouth: 'mouth_B0013', nose: 'nose_0017', ears: 'ears_0001', shirt: 'plain_tee_light', coat: 'unicorn_top', pants: 'unicorn_pants', shoes: 'ballet_shoes' }, variant: { hat: 1, shirt: 1, coat: 1, pants: 1, shoes: 0 }, skinColor: 52, hairColor: 122 }],
  // Gorilla: gorilla_mask 868, gorilla_coat 787, gorilla_pants 867 (bare feet).
  ['gorilla', 'Gorilla', { outfit: { hair: 'Buzzcut', hat: 'gorilla_mask', eyes: 'eyes_20101109C', mouth: 'mouth_old', nose: 'nose_jughead', ears: 'ears_0005', shirt: 'plain_tee_dark', coat: 'gorilla_coat', pants: 'gorilla_pants', shoes: 'none' }, variant: { hat: 0, shirt: 3, coat: 0, pants: 0 }, skinColor: 70, hairColor: 81 }],
  // Garden gnome: Garden_gnome_hat 1118, garden_gnome_top 1175.
  ['gnome', 'Garden gnome', { outfit: { hair: 'baldTop', hat: 'Garden_gnome_hat', eyes: 'eyes_20101109A', mouth: 'mouth_20101109D', nose: 'nose_0010', ears: 'ears_0002', shirt: 'plain_tee_light', coat: 'garden_gnome_top', pants: 'plain_trousers', shoes: 'clogs' }, variant: { hat: 1, shirt: 4, coat: 1, pants: 13, shoes: 2 }, skinColor: 15, hairColor: 76 }],
  // Cardboard robot: cardboard_robot_hat 394, cardboard_robot_top 393, cardboard_robot_pants 404.
  ['robot', 'Cardboard robot', { outfit: { hair: 'Buzzcut', hat: 'cardboard_robot_hat', eyes: 'eyes_robot', mouth: 'mouth_black', nose: 'nose_triangle', ears: 'ears_0003', shirt: 'classic_undershirt', coat: 'cardboard_robot_top', pants: 'cardboard_robot_pants', shoes: 'steeltoe_boots' }, variant: { shirt: 1, shoes: 1 }, skinColor: 62, hairColor: 20 }],
  // Maki roll: maki_roll_hat 729, maki_costume 721.
  ['maki', 'Maki roll', { outfit: { hair: 'hair_12', hat: 'maki_roll_hat', eyes: 'eyes_02', mouth: 'mouth_20101109F', nose: 'nose_0006', ears: 'ears_0001', shirt: 'plain_tee_dark', coat: 'maki_costume', pants: 'plain_trousers', shoes: 'geta' }, variant: { shirt: 3, pants: 10 }, skinColor: 56, hairColor: 81 }],
];

function costumePresets() {
  return Object.fromEntries(COSTUMES.map(([id, label, fields]) => [`costume_${id}`, {
    id: `costume_${id}`,
    label,
    group: 'costumes',
    appearance: vectorPreset(fields),
  }]));
}

/**
 * Tiny Speck's four new-player looks: every "Start fresh" slot on one choice
 * row (js/avatar-starter.js, GSJS inc_data_default_avatars.js).
 */
function starterPresets() {
  return Object.fromEntries([0, 1, 2, 3].map((i) => [`starter${i + 1}`, {
    id: `starter${i + 1}`,
    label: `Starter ${i + 1}`,
    group: 'starter',
    appearance: vectorPreset(starterRowFields(i)),
  }]));
}

/** Named full looks for one-click presets (group: PRESET_GROUPS id, 'looks' when unset). */
export const APPEARANCE_PRESETS = {
  vector: {
    id: 'vector',
    label: 'Glitch',
    appearance: createDefaultAppearance(),
  },
  sunday: {
    id: 'sunday',
    label: 'Sunday best',
    appearance: vectorPreset({
      outfit: { hair: 'hair_09', hat: 'bowler_hat', eyes: 'eyes_20101109B', mouth: 'mouth_01', nose: 'nose_0006', ears: 'ears_0002', shirt: 'Shirt_and_Tie', pants: 'plain_trousers', shoes: 'Men_DressShoes' },
      variant: { pants: 13 },
      skinColor: 4,
      hairColor: 6,
    }),
  },
  cowpoke: {
    id: 'cowpoke',
    label: 'Cowpoke',
    appearance: vectorPreset({
      outfit: { hair: 'Curly_pixie_hair', hat: 'cap', eyes: 'eyes_03', mouth: 'mouth_09', nose: 'nose_20101109A', ears: 'ears_0009', shirt: 'plaid_shirt', pants: 'regular_jeans', shoes: 'cowboy_boots' },
      skinColor: 33,
      hairColor: 79,
    }),
  },
  party: {
    id: 'party',
    label: 'Party',
    appearance: vectorPreset({
      outfit: { hair: 'mohawk', hat: 'party_hat', eyes: 'eyes_girly_1', mouth: 'mouth_tongue', nose: 'nose_clown', ears: 'ears_0003', shirt: 'hawaiian_shirt', pants: 'cargo_shorts', shoes: 'havaianas' },
      skinColor: 31,
      hairColor: 111,
    }),
  },
  dapper: {
    id: 'dapper',
    label: 'Dapper',
    appearance: vectorPreset({
      outfit: { hair: 'Mullet', hat: 'top_hat', eyes: 'eyes_20101109C', mouth: 'mouth_12', nose: 'nose_manly_1', ears: 'ears_0001', shirt: 'classic_undershirt', coat: 'tuxedo_and_bowtie', pants: 'plain_trousers', shoes: 'Men_DressShoes' },
      variant: { pants: 13 },
      skinColor: 1,
      hairColor: 22,
    }),
  },
  dino: {
    id: 'dino',
    label: 'Dino',
    appearance: vectorPreset({
      outfit: { hair: 'pigtails', hat: 'none', eyes: 'eyes_big_eyebrows', mouth: 'mouth_10', nose: 'nose_0010', ears: 'ears_0005', shirt: 'plain_tee_light', coat: 'Mini_dino_top', pants: 'Mini_dino_pants', shoes: 'bunny_slippers' },
      skinColor: 50,
      hairColor: 80,
    }),
  },
  // The five colour themes the classic portrait used to recolour, rebuilt as
  // vector looks: real GSJS articles in their own colourways (no recolouring)
  // and real skin/hair palette ids, chosen to keep each name's colours.
  blueberry: {
    id: 'blueberry',
    label: 'Blueberry',
    appearance: vectorPreset({
      outfit: { hair: 'MopHair', hat: 'striped_tuque', eyes: 'eyes_01', mouth: 'mouth_B0013', nose: 'nose_0017', ears: 'ears_0003', shirt: 'freddy_shirt', pants: 'regular_jeans', shoes: 'rain_boots' },
      variant: { hat: 2, shirt: 6, pants: 1, shoes: 6 },
      skinColor: 52,
      hairColor: 14,
    }),
  },
  autumn: {
    id: 'autumn',
    label: 'Autumn',
    appearance: vectorPreset({
      outfit: { hair: 'hair_10', hat: 'none', eyes: 'eyes_20101109F', mouth: 'mouth_02', nose: 'nose_0009', ears: 'ears_0009', shirt: 'turtle_neck', coat: 'pea_coat', pants: 'wide_belt_regular_jeans', shoes: 'campers' },
      variant: { shirt: 2, coat: 3, pants: 2, shoes: 0 },
      skinColor: 56,
      hairColor: 108,
    }),
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    appearance: vectorPreset({
      outfit: { hair: 'electro_longbangs', hat: 'none', eyes: 'eyes_20101109A', mouth: 'mouth_20101109E', nose: 'nose_20101109C', ears: 'ears_0002', shirt: 'tied_shoulder_top', coat: 'star_hoodie', pants: 'japajeans', shoes: 'clogs' },
      variant: { shirt: 2, coat: 0, pants: 1, shoes: 1 },
      skinColor: 17,
      hairColor: 123,
    }),
  },
  candy: {
    id: 'candy',
    label: 'Candy',
    appearance: vectorPreset({
      outfit: { hair: 'loopy_bun', hat: 'capcake_hat', eyes: 'eyes_girly_2', mouth: 'mouth_little_lady', nose: 'nose_curl', ears: 'ears_0001', shirt: 'flower_print_baby_tee_light', pants: 'striped_legwarmers_pants', shoes: 'crocs_with_socks' },
      variant: { hat: 0, shirt: 0, pants: 0, shoes: 0 },
      skinColor: 1,
      hairColor: 87,
    }),
  },
  forest: {
    id: 'forest',
    label: 'Forest',
    appearance: vectorPreset({
      outfit: { hair: 'hair_B0018', hat: 'elven_boy_hat', eyes: 'eyes_12', mouth: 'mouth_20101109F', nose: 'nose_oblong_1', ears: 'ears_0005', shirt: 'plain_tee_dark', coat: 'elven_boy_top', pants: 'lightweight_shorts', shoes: 'rain_boots' },
      variant: { hat: 0, shirt: 4, coat: 0, pants: 2, shoes: 3 },
      skinColor: 33,
      hairColor: 9,
    }),
  },
  ...starterPresets(),
  ...costumePresets(),
};

/**
 * @param {Partial<Appearance>} [partial]
 * @returns {Appearance}
 */
export function normalizeAppearance(partial = {}) {
  const d = createDefaultAppearance();
  const out = { ...d, ...partial };
  for (const k of COLOUR_FIELDS) {
    const c = partial[k] || d[k];
    out[k] = {
      r: clampByte(c.r),
      g: clampByte(c.g),
      b: clampByte(c.b),
    };
  }
  out.bodyStyle = 'vector';
  out.vector = normalizeVectorFields(partial.vector || {});
  out.v = APPEARANCE_VERSION;
  return out;
}

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
}

/**
 * @param {Appearance} appearance
 * @returns {string}
 */
export function appearanceToJson(appearance) {
  return JSON.stringify(normalizeAppearance(appearance));
}

/**
 * @param {string} json
 * @returns {Appearance}
 */
export function appearanceFromJson(json) {
  try {
    return migrateAppearance(JSON.parse(json));
  } catch {
    return createDefaultAppearance();
  }
}

/**
 * @param {Appearance} appearance
 * @param {{ storage?: Storage }} [opts]
 */
export function saveAppearance(appearance, opts = {}) {
  // The look is part of the character: it saves through js/save-store.js (key STORAGE_KEY in solo)
  // unless a caller hands in its own Storage.
  if (opts.storage) {
    opts.storage.setItem(STORAGE_KEY, appearanceToJson(appearance));
    return true;
  }
  saveStore.set('appearance', appearanceToJson(appearance));
  return true;
}

/**
 * @param {{ storage?: Storage }} [opts]
 * @returns {Appearance}
 */
export function loadAppearance(opts = {}) {
  let raw = null;
  try {
    raw = opts.storage ? opts.storage.getItem(STORAGE_KEY) : saveStore.get('appearance');
  } catch {
    return createDefaultAppearance();
  }
  if (!raw) return createDefaultAppearance();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { return createDefaultAppearance(); }
  return migrateAppearance(parsed);
}

/**
 * Saved looks on a retired bitmap body style ('glitch', 'classic', 'alt',
 * any save version) move to the nearest vector look: an untouched bitmap
 * preset becomes its vector rebuild (LEGACY_LOOKS); a recoloured one keeps
 * its colours as tints on the vector default outfit (skin, hair, top,
 * trousers, shoes). Vector saves load as they are.
 * @param {object} parsed
 * @returns {Appearance}
 */
export function migrateAppearance(parsed) {
  const raw = parsed && typeof parsed === 'object' ? parsed : {};
  const saved = normalizeAppearance(raw);
  if (!RETIRED_BODY_STYLES.includes(raw.bodyStyle)) return saved;
  const key = colourKey(raw.bodyStyle, saved);
  const legacy = LEGACY_LOOKS.find(([style, colours]) => colourKey(style, colours) === key);
  if (legacy) return normalizeAppearance(APPEARANCE_PRESETS[legacy[2]].appearance);
  return normalizeAppearance({ ...saved, vector: vectorFieldsFromColors(saved) });
}

/**
 * Stable short id for cache keys.
 * @param {Appearance} appearance
 */
export function appearanceCacheKey(appearance) {
  const a = normalizeAppearance(appearance);
  const parts = [a.bodyStyle];
  for (const k of COLOUR_FIELDS) {
    const c = a[k];
    parts.push(`${c.r},${c.g},${c.b}`);
  }
  parts.push(JSON.stringify(a.vector));
  return parts.join('|');
}
