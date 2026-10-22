/**
 * Character builder — appearance model + pure recolor of styled Glitch avatars.
 *
 * The default look ('vector') is Tiny Speck's avatar rebuilt from its vector
 * parts (js/avatar-rig.js, js/avatar-looks.js): real hair, eyes, mouth, nose,
 * ears and wardrobe articles in their GSJS colourways. The older looks remain
 * as presets: the recovered 62d8 sheets ('glitch', recoloured by region) and
 * the classic/alt portraits.
 */
import { normalizeVectorFields, vectorFieldsFromColors } from './avatar-looks.js';

/** @typedef {{ r: number, g: number, b: number }} Rgb */

/**
 * @typedef {{
 *   bodyStyle: 'vector'|'glitch'|'classic'|'alt',
 *   vector?: object,
 *   hair: Rgb,
 *   skin: Rgb,
 *   shirt: Rgb,
 *   shirtDark: Rgb,
 *   pants: Rgb,
 *   shoes: Rgb,
 *   sole: Rgb,
 * }} Appearance
 */

export const STORAGE_KEY = 'groddle.avatar.appearance.v1';
/** Saved appearance format; 1 had no `v` (colour-only looks). */
export const APPEARANCE_VERSION = 2;

export const BODY_STYLES = {
  // Tiny Speck's vector avatar: rig + articles composited per look
  // (js/avatar-compositor.js), default look prerendered.
  vector: {
    id: 'vector',
    label: 'Glitch',
    sheets: true,
    vector: true,
  },
  // Real Glitch animation sheets (base walk, climb, jump) recovered from the
  // Wayback CDX; js/avatar-anims.js maps their frames.
  glitch: {
    id: 'glitch',
    label: 'Recovered',
    sheets: true,
  },
  classic: {
    id: 'classic',
    label: 'Classic Glitch',
    idleUrl: 'assets/sprites/avatar_styled_idle.png',
    walkUrl: 'assets/sprites/avatar_styled_walk.png',
    walkFw: 172,
    walkFh: 248,
    walkCols: 8,
  },
  alt: {
    id: 'alt',
    label: 'Purple Alt',
    idleUrl: 'assets/sprites/avatar_styled_alt.png',
    // Alt has no dedicated walk strip yet — recolor idle for both until one exists
    walkUrl: 'assets/sprites/avatar_styled_alt.png',
    walkFw: 0, // whole image
    walkFh: 0,
    walkCols: 1,
  },
};

/** Named swatches for the builder UI. */
export const COLOR_SWATCHES = {
  hair: [
    { id: 'green', label: 'Moss', rgb: { r: 72, g: 140, b: 72 } },
    { id: 'blue', label: 'Sky', rgb: { r: 70, g: 130, b: 200 } },
    { id: 'pink', label: 'Rose', rgb: { r: 220, g: 100, b: 150 } },
    { id: 'purple', label: 'Violet', rgb: { r: 140, g: 80, b: 180 } },
    { id: 'orange', label: 'Ember', rgb: { r: 220, g: 120, b: 50 } },
    { id: 'blonde', label: 'Wheat', rgb: { r: 220, g: 190, b: 90 } },
    { id: 'black', label: 'Night', rgb: { r: 40, g: 40, b: 48 } },
    { id: 'white', label: 'Frost', rgb: { r: 230, g: 235, b: 240 } },
  ],
  skin: [
    { id: 'stone', label: 'Stone', rgb: { r: 190, g: 180, b: 165 } },
    { id: 'peach', label: 'Peach', rgb: { r: 230, g: 180, b: 150 } },
    { id: 'tan', label: 'Tan', rgb: { r: 200, g: 150, b: 110 } },
    { id: 'brown', label: 'Earth', rgb: { r: 140, g: 95, b: 70 } },
    { id: 'deep', label: 'Deep', rgb: { r: 90, g: 60, b: 45 } },
    { id: 'green', label: 'Leaf', rgb: { r: 140, g: 170, b: 130 } },
    { id: 'blue', label: 'Pond', rgb: { r: 140, g: 170, b: 200 } },
    { id: 'purple', label: 'Plum', rgb: { r: 170, g: 140, b: 190 } },
  ],
  shirt: [
    { id: 'red', label: 'Crimson', rgb: { r: 180, g: 30, b: 40 } },
    { id: 'blue', label: 'Cobalt', rgb: { r: 40, g: 90, b: 180 } },
    { id: 'green', label: 'Forest', rgb: { r: 40, g: 130, b: 70 } },
    { id: 'yellow', label: 'Sun', rgb: { r: 220, g: 180, b: 40 } },
    { id: 'purple', label: 'Grape', rgb: { r: 120, g: 50, b: 160 } },
    { id: 'orange', label: 'Pumpkin', rgb: { r: 220, g: 110, b: 40 } },
    { id: 'teal', label: 'Teal', rgb: { r: 30, g: 140, b: 150 } },
    { id: 'pink', label: 'Pink', rgb: { r: 220, g: 90, b: 140 } },
  ],
  pants: [
    { id: 'blue', label: 'Denim', rgb: { r: 50, g: 90, b: 140 } },
    { id: 'brown', label: 'Cord', rgb: { r: 110, g: 75, b: 50 } },
    { id: 'black', label: 'Ink', rgb: { r: 40, g: 40, b: 50 } },
    { id: 'green', label: 'Moss', rgb: { r: 50, g: 100, b: 60 } },
    { id: 'purple', label: 'Eggplant', rgb: { r: 80, g: 50, b: 110 } },
    { id: 'gray', label: 'Slate', rgb: { r: 110, g: 115, b: 125 } },
    { id: 'red', label: 'Brick', rgb: { r: 140, g: 50, b: 50 } },
    { id: 'teal', label: 'Sea', rgb: { r: 40, g: 110, b: 120 } },
  ],
  shoes: [
    { id: 'green', label: 'Frog', rgb: { r: 50, g: 130, b: 50 } },
    { id: 'red', label: 'Cherry', rgb: { r: 180, g: 40, b: 50 } },
    { id: 'blue', label: 'Navy', rgb: { r: 40, g: 70, b: 140 } },
    { id: 'brown', label: 'Boot', rgb: { r: 100, g: 65, b: 40 } },
    { id: 'black', label: 'Patent', rgb: { r: 35, g: 35, b: 40 } },
    { id: 'yellow', label: 'Duck', rgb: { r: 220, g: 190, b: 50 } },
    { id: 'purple', label: 'Grape', rgb: { r: 110, g: 50, b: 150 } },
    { id: 'white', label: 'Cloud', rgb: { r: 230, g: 230, b: 235 } },
  ],
};

/**
 * The old default classic look (matches avatar_styled_idle). Saves still on it
 * move to the Glitch sheets (loadAppearance).
 * @returns {Appearance}
 */
export function createClassicAppearance() {
  return {
    bodyStyle: 'classic',
    hair: { r: 72, g: 140, b: 72 },
    skin: { r: 190, g: 180, b: 165 },
    shirt: { r: 180, g: 30, b: 40 },
    shirtDark: { r: 40, g: 32, b: 40 },
    pants: { r: 50, g: 90, b: 140 },
    shoes: { r: 50, g: 130, b: 50 },
    sole: { r: 210, g: 195, b: 160 },
  };
}

/**
 * The recovered Glitch sheets in their own colours (62d8dab1: lavender hair,
 * grey skin, lime top, purple trousers, green shoes).
 * @returns {Appearance}
 */
export function createGlitchSheetsAppearance() {
  return {
    bodyStyle: 'glitch',
    hair: { r: 205, g: 205, b: 232 },
    skin: { r: 190, g: 190, b: 196 },
    shirt: { r: 214, g: 240, b: 40 },
    shirtDark: { r: 150, g: 170, b: 30 },
    pants: { r: 100, g: 40, b: 110 },
    shoes: { r: 120, g: 210, b: 40 },
    sole: { r: 170, g: 60, b: 200 },
  };
}

/**
 * Default look: the vector Glitch in the catalog's default outfit (styled on
 * 62d8dab1, so the colour fields match the recovered sheets for the classic
 * swatches).
 * @returns {Appearance}
 */
export function createDefaultAppearance() {
  return { ...createGlitchSheetsAppearance(), bodyStyle: 'vector', vector: normalizeVectorFields({}) };
}

/** A vector preset: catalog default plus these fields. */
function vectorPreset(fields) {
  return { ...createDefaultAppearance(), vector: normalizeVectorFields(fields) };
}

/** Named full looks for one-click presets. */
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
  glitch: {
    id: 'glitch',
    label: 'Recovered',
    appearance: createGlitchSheetsAppearance(),
  },
  classic: {
    id: 'classic',
    label: 'Classic',
    appearance: createClassicAppearance(),
  },
  blueberry: {
    id: 'blueberry',
    label: 'Blueberry',
    appearance: {
      bodyStyle: 'classic',
      hair: { r: 70, g: 100, b: 200 },
      skin: { r: 200, g: 185, b: 175 },
      shirt: { r: 40, g: 90, b: 180 },
      shirtDark: { r: 25, g: 40, b: 90 },
      pants: { r: 40, g: 50, b: 80 },
      shoes: { r: 40, g: 70, b: 140 },
      sole: { r: 200, g: 200, b: 210 },
    },
  },
  autumn: {
    id: 'autumn',
    label: 'Autumn',
    appearance: {
      bodyStyle: 'classic',
      hair: { r: 200, g: 100, b: 40 },
      skin: { r: 210, g: 170, b: 130 },
      shirt: { r: 180, g: 90, b: 40 },
      shirtDark: { r: 80, g: 40, b: 20 },
      pants: { r: 100, g: 70, b: 45 },
      shoes: { r: 100, g: 60, b: 35 },
      sole: { r: 220, g: 200, b: 160 },
    },
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    appearance: {
      bodyStyle: 'classic',
      hair: { r: 50, g: 45, b: 70 },
      skin: { r: 150, g: 145, b: 160 },
      shirt: { r: 90, g: 40, b: 140 },
      shirtDark: { r: 30, g: 20, b: 45 },
      pants: { r: 35, g: 35, b: 50 },
      shoes: { r: 40, g: 35, b: 55 },
      sole: { r: 180, g: 175, b: 190 },
    },
  },
  candy: {
    id: 'candy',
    label: 'Candy',
    appearance: {
      bodyStyle: 'classic',
      hair: { r: 230, g: 100, b: 160 },
      skin: { r: 240, g: 200, b: 190 },
      shirt: { r: 230, g: 80, b: 140 },
      shirtDark: { r: 80, g: 30, b: 55 },
      pants: { r: 100, g: 60, b: 140 },
      shoes: { r: 230, g: 90, b: 150 },
      sole: { r: 255, g: 230, b: 240 },
    },
  },
  forest: {
    id: 'forest',
    label: 'Forest',
    appearance: {
      bodyStyle: 'classic',
      hair: { r: 50, g: 110, b: 55 },
      skin: { r: 160, g: 175, b: 140 },
      shirt: { r: 50, g: 120, b: 70 },
      shirtDark: { r: 25, g: 55, b: 35 },
      pants: { r: 55, g: 80, b: 50 },
      shoes: { r: 60, g: 100, b: 45 },
      sole: { r: 200, g: 195, b: 150 },
    },
  },
  alt_base: {
    id: 'alt_base',
    label: 'Alt body',
    appearance: {
      bodyStyle: 'alt',
      hair: { r: 150, g: 80, b: 160 },
      skin: { r: 170, g: 120, b: 180 },
      shirt: { r: 50, g: 90, b: 140 },
      shirtDark: { r: 30, g: 50, b: 80 },
      pants: { r: 60, g: 140, b: 90 },
      shoes: { r: 200, g: 100, b: 60 },
      sole: { r: 220, g: 180, b: 140 },
    },
  },
};

/**
 * @param {Partial<Appearance>} [partial]
 * @returns {Appearance}
 */
export function normalizeAppearance(partial = {}) {
  const d = createDefaultAppearance();
  const out = { ...d, ...partial };
  for (const k of ['hair', 'skin', 'shirt', 'shirtDark', 'pants', 'shoes', 'sole']) {
    const c = partial[k] || d[k];
    out[k] = {
      r: clampByte(c.r),
      g: clampByte(c.g),
      b: clampByte(c.b),
    };
  }
  out.bodyStyle = BODY_STYLES[partial.bodyStyle] ? partial.bodyStyle : d.bodyStyle;
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
    return normalizeAppearance(JSON.parse(json));
  } catch {
    return createDefaultAppearance();
  }
}

/**
 * @param {Appearance} appearance
 * @param {{ storage?: Storage }} [opts]
 */
export function saveAppearance(appearance, opts = {}) {
  const storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!storage) return false;
  storage.setItem(STORAGE_KEY, appearanceToJson(appearance));
  return true;
}

/**
 * @param {{ storage?: Storage }} [opts]
 * @returns {Appearance}
 */
export function loadAppearance(opts = {}) {
  const storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!storage) return createDefaultAppearance();
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return createDefaultAppearance();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { return createDefaultAppearance(); }
  return migrateAppearance(parsed);
}

/**
 * Saved looks from before the vector avatar (no `v`): an untouched default
 * (classic portrait or recovered sheets) becomes the vector default; a
 * recoloured recovered-sheets look keeps its colours on the vector default
 * outfit (skin, hair, top, trousers, shoes tints); classic and alt looks stay.
 * @param {object} parsed
 * @returns {Appearance}
 */
export function migrateAppearance(parsed) {
  const saved = normalizeAppearance(parsed || {});
  if (parsed && Number(parsed.v) >= APPEARANCE_VERSION) return saved;
  const key = appearanceCacheKey(saved);
  if (key === appearanceCacheKey(createClassicAppearance()) || key === appearanceCacheKey(createGlitchSheetsAppearance())) return createDefaultAppearance();
  if (saved.bodyStyle === 'glitch') return { ...saved, bodyStyle: 'vector', vector: vectorFieldsFromColors(saved) };
  return saved;
}

/**
 * Classify a pixel into an appearance region.
 * Green hair vs shoes uses vertical position (yNorm 0=top, 1=bottom).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {number} a
 * @param {number} yNorm
 * @returns {null|'hair'|'skin'|'shirt'|'shirtDark'|'pants'|'shoes'|'sole'}
 */
export function classifyAvatarPixel(r, g, b, a, yNorm = 0.5) {
  if (a < 30) return null;

  // Cream / tan shoe sole (before skin — similar lightness)
  if (
    r > 150 &&
    g > 125 &&
    b > 70 &&
    b < 200 &&
    r - b > 20 &&
    Math.abs(r - g) < 55 &&
    g > b - 5 &&
    yNorm > 0.55
  ) {
    return 'sole';
  }

  // Red sweater stripe
  if (r > 90 && r > g + 35 && r > b + 35 && g < 120 && b < 120) {
    return 'shirt';
  }

  // Black sweater stripe / outline-ish dark
  if (r < 70 && g < 65 && b < 75 && Math.max(r, g, b) - Math.min(r, g, b) < 40) {
    // Eyes/mouth darker details — keep if very small and mid-face? treat as shirtDark for body
    if (yNorm > 0.35 && yNorm < 0.75) return 'shirtDark';
    // shoes can be dark outlines near bottom
    if (yNorm > 0.75) return 'shoes';
    return 'shirtDark';
  }

  // Blue jeans
  if (b > 70 && b > r + 12 && b >= g - 5 && r < 140 && g < 160) {
    return 'pants';
  }

  // Green: hair (upper) vs shoes (lower)
  if (g > 70 && g >= r + 12 && g >= b + 3 && r < 145 && b < 150) {
    if (yNorm < 0.42) return 'hair';
    if (yNorm > 0.68) return 'shoes';
    // mid green rare — hair fringe / shoe top
    return yNorm < 0.55 ? 'hair' : 'shoes';
  }

  // Skin (low saturation mid-high lightness)
  const maxc = Math.max(r, g, b);
  const minc = Math.min(r, g, b);
  if (maxc > 100 && maxc < 240 && maxc - minc < 55 && Math.abs(r - g) < 45) {
    // exclude pure green already handled
    if (!(g > r + 20 && g > b + 10)) return 'skin';
  }

  return null;
}

/**
 * Regions of the Glitch sheet avatar (62d8dab1, js/avatar-anims.js): lavender
 * hair, grey skin, lime top, purple trousers and soles, green shoes. The
 * yellow eyes and the dark headband are left as drawn. yNorm is the height in
 * the sheet row (each sheet is one row of frames).
 * @returns {null|'hair'|'skin'|'shirt'|'shirtDark'|'pants'|'shoes'|'sole'}
 */
export function classifyGlitchPixel(r, g, b, a, yNorm = 0.5) {
  if (a < 30) return null;
  const maxc = Math.max(r, g, b);
  const minc = Math.min(r, g, b);
  const sat = maxc - minc;
  // Lime top (and its darker folds); yellow eyes sit high and are less green.
  if (g > 120 && r > 0.6 * g && b < 0.55 * g && g >= r - 10) {
    if (yNorm < 0.42 && r > g - 15) return null;
    // Lime-green near the bottom is the shoes (the climb's tucked feet).
    if (yNorm > 0.82) return 'shoes';
    return g > 170 ? 'shirt' : 'shirtDark';
  }
  // Green shoes.
  if (g > r + 25 && g > b + 25 && yNorm > 0.6) return 'shoes';
  // Purple trousers; the same purple on the soles at the very bottom.
  if (r > g + 25 && b > g + 25) return yNorm > 0.9 ? 'sole' : 'pants';
  // Lavender hair: light with a blue cast, high on the figure.
  if (yNorm < 0.55 && maxc > 150 && b > r + 6 && b >= g && sat < 80) return 'hair';
  // Grey skin: neutral mid-to-light greys (the headband is darker, kept).
  if (sat < 22 && maxc > 120 && maxc < 235) return 'skin';
  return null;
}

/**
 * Blend source luminance with target hue for natural shading.
 * @param {number} sr
 * @param {number} sg
 * @param {number} sb
 * @param {Rgb} target
 */
export function applyTargetColor(sr, sg, sb, target) {
  const srcLum = (sr * 0.35 + sg * 0.45 + sb * 0.2) / 255;
  // Preserve relative shading around mid-gray
  const factor = 0.45 + srcLum * 1.1;
  return {
    r: clampByte(target.r * factor),
    g: clampByte(target.g * factor),
    b: clampByte(target.b * factor),
  };
}

/**
 * Recolor RGBA buffer in place.
 * @param {Uint8ClampedArray|Uint8Array} data
 * @param {number} width
 * @param {number} height
 * @param {Appearance} appearance
 * @returns {number} pixels changed
 */
export function recolorImageData(data, width, height, appearance, classify = classifyAvatarPixel) {
  const app = normalizeAppearance(appearance);
  let changed = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const a = data[o + 3];
    const yNorm = Math.floor(i / width) / Math.max(1, height - 1);
    const region = classify(r, g, b, a, yNorm);
    if (!region) continue;
    const target = app[region] || app.skin;
    const c = applyTargetColor(r, g, b, target);
    if (c.r !== r || c.g !== g || c.b !== b) {
      data[o] = c.r;
      data[o + 1] = c.g;
      data[o + 2] = c.b;
      changed += 1;
    }
  }
  return changed;
}

/**
 * Pick random swatches for a fun look.
 * @param {{ rng?: () => number }} [opts]
 * @returns {Appearance}
 */
export function randomAppearance(opts = {}) {
  const rng = opts.rng || Math.random;
  const pick = (arr) => arr[Math.floor(rng() * arr.length)].rgb;
  const shirt = pick(COLOR_SWATCHES.shirt);
  return normalizeAppearance({
    bodyStyle: rng() < 0.15 ? 'alt' : 'classic',
    hair: pick(COLOR_SWATCHES.hair),
    skin: pick(COLOR_SWATCHES.skin),
    shirt,
    shirtDark: {
      r: Math.round(shirt.r * 0.25),
      g: Math.round(shirt.g * 0.25),
      b: Math.round(shirt.b * 0.3),
    },
    pants: pick(COLOR_SWATCHES.pants),
    shoes: pick(COLOR_SWATCHES.shoes),
    sole: { r: 210, g: 195, b: 160 },
  });
}

/**
 * Stable short id for cache keys.
 * @param {Appearance} appearance
 */
export function appearanceCacheKey(appearance) {
  const a = normalizeAppearance(appearance);
  const parts = [a.bodyStyle];
  for (const k of ['hair', 'skin', 'shirt', 'shirtDark', 'pants', 'shoes', 'sole']) {
    const c = a[k];
    parts.push(`${c.r},${c.g},${c.b}`);
  }
  if (a.bodyStyle === 'vector') parts.push(JSON.stringify(a.vector));
  return parts.join('|');
}

/**
 * Resolve sheet URLs for an appearance.
 * @param {Appearance} appearance
 */
export function resolveBodySheets(appearance) {
  const a = normalizeAppearance(appearance);
  return BODY_STYLES[a.bodyStyle] || BODY_STYLES.classic;
}
