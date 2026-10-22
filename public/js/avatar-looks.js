/**
 * Vector avatar looks: the saved appearance (js/character-builder.js,
 * bodyStyle 'vector') as article names, real GSJS colourways and palette
 * colours, resolved against assets/avatar/catalog.json into the look the
 * compositor draws (js/avatar-compositor.js).
 *
 * Saved shape (all optional; missing parts fall back to the catalog default):
 *   outfit:  { eyes, mouth, nose, ears, hair, hat, shirt, coat, dress, pants, skirt, shoes } -> article name | 'none'
 *   variant: { [type]: index into the article's GSJS colourways }
 *   tint:    { [type]: 'rrggbb' }  custom color_1 (overrides the colourway's)
 *   skinColor / hairColor: GSJS data_avatar_colors id, or skinTint / hairTint 'rrggbb'
 *   face:    { eye_scale, eye_dist, eye_height, ... } (AvatarConfig numbers)
 */

/** Article types the builder offers, in tab order. */
export const LOOK_TYPES = Object.freeze(['hair', 'hat', 'eyes', 'mouth', 'nose', 'ears', 'shirt', 'coat', 'dress', 'pants', 'skirt', 'shoes']);
/** Types a look may leave empty. */
export const OPTIONAL_TYPES = Object.freeze(['hat', 'coat', 'dress', 'skirt', 'hair', 'shirt', 'pants', 'shoes', 'nose', 'ears']);

const HEX = /^[0-9a-f]{6}$/i;
export const cleanHex = (v) => {
  const s = String(v ?? '').replace(/^#/, '').toLowerCase();
  return HEX.test(s) ? s : null;
};

/** A solid colorize (tintAmount 100) like the palettes use. */
export function tintColor(hex) {
  return { tintColor: hex, tintAmount: '100', brightness: '0', saturation: '0', contrast: '0', alpha: '100' };
}

/** Catalog lookup helpers. */
export function catalogItem(catalog, type, name) {
  return catalog?.types?.[type]?.find((i) => i.name === name) || null;
}

/** The default saved look (catalog.defaultLook) as saved fields. */
export function defaultVectorFields(catalog) {
  const d = catalog?.defaultLook || {};
  return normalizeVectorFields({ outfit: d.outfit, variant: d.variant, tint: d.tint, skinColor: d.skinColor, hairColor: d.hairColor, skinTint: d.skinTint, hairTint: d.hairTint, face: d.face }, catalog);
}

/**
 * Clean saved vector fields: names must exist in the catalog (when given),
 * hat and hair rules are left to the rig (slotAssignments).
 */
export function normalizeVectorFields(raw = {}, catalog = null) {
  const out = { outfit: {}, variant: {}, tint: {}, face: {} };
  const outfit = raw.outfit || {};
  for (const type of LOOK_TYPES) {
    let name = outfit[type];
    if (name && typeof name === 'object') name = name.name;
    if (typeof name !== 'string' || !name) continue;
    if (name !== 'none' && catalog && !catalogItem(catalog, type, name)) continue;
    out.outfit[type] = name;
  }
  for (const [type, v] of Object.entries(raw.variant || {})) {
    const n = Math.trunc(Number(v));
    if (LOOK_TYPES.includes(type) && Number.isFinite(n) && n >= 0) out.variant[type] = n;
  }
  for (const [type, v] of Object.entries(raw.tint || {})) {
    const hex = cleanHex(v);
    if (LOOK_TYPES.includes(type) && hex) out.tint[type] = hex;
  }
  for (const k of ['skinColor', 'hairColor']) {
    const n = Math.trunc(Number(raw[k]));
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  for (const k of ['skinTint', 'hairTint']) {
    const hex = cleanHex(raw[k]);
    if (hex) out[k] = hex;
  }
  for (const k of ['eye_scale', 'eye_dist', 'eye_height', 'nose_scale', 'nose_height', 'mouth_scale', 'mouth_height', 'ears_scale', 'ears_height']) {
    const n = Number(raw.face?.[k]);
    if (Number.isFinite(n)) out.face[k] = Math.max(-5, Math.min(5, n));
  }
  return out;
}

/** Colours for an article: its colourway, then a custom color_1 tint. */
export function articleColors(item, variantIndex = 0, tintHex = null) {
  const variants = item?.variants || [];
  const v = variants[Math.min(Math.max(0, variantIndex | 0), Math.max(0, variants.length - 1))];
  const colors = { ...(v?.colors || item?.colors || {}) };
  if (tintHex) colors.color_1 = tintColor(tintHex);
  return colors;
}

/**
 * Palette colours. Skin is a flat hard-light tint (skin_tint_color, see
 * avatar-rig.js hardLightMatrix); hair uses the palette's colour filters.
 */
function paletteColors(catalog, slot, id, hex) {
  const entry = hex ? null : catalog?.palettes?.[slot]?.find((p) => p.id === id);
  if (slot === 'skin') {
    const tint = hex || cleanHex(entry?.color);
    return tint ? { tint } : null;
  }
  // A custom hair colour needs its highlight layer too (color_10, drawn over
  // color_1): shaped like the palette's, a brighter, contrastier same hue.
  if (hex) return { color_1: tintColor(hex), color_10: { ...tintColor(hex), brightness: '20', saturation: '-20', contrast: '80' } };
  return entry?.colors || null;
}

/**
 * The compositor look for saved vector fields: missing parts use the
 * catalog default; 'none' leaves the slot empty.
 */
export function resolveLook(fields, catalog) {
  const f = normalizeVectorFields(fields, catalog);
  const d = catalog?.defaultLook || {};
  const outfit = {};
  for (const type of LOOK_TYPES) {
    const name = f.outfit[type] ?? (typeof d.outfit?.[type] === 'object' ? d.outfit[type].name : d.outfit?.[type]);
    if (!name || name === 'none') continue;
    const item = catalogItem(catalog, type, name);
    if (!item) continue;
    const defVariant = d.variant?.[type] ?? 0;
    const sameAsDefault = name === (d.outfit?.[type]?.name ?? d.outfit?.[type]);
    const variant = f.variant[type] ?? (sameAsDefault ? defVariant : 0);
    const tint = f.tint[type] ?? (sameAsDefault && f.variant[type] === undefined ? cleanHex(d.tint?.[type]) : null);
    outfit[type] = { name, colors: articleColors(item, variant, tint) };
  }
  const skinId = f.skinColor ?? (f.skinTint ? null : d.skinColor);
  const hairId = f.hairColor ?? (f.hairTint ? null : d.hairColor);
  return {
    outfit,
    colors: {
      skin: paletteColors(catalog, 'skin', skinId, f.skinTint ?? (f.skinColor ? null : cleanHex(d.skinTint))) || {},
      hair: paletteColors(catalog, 'hair', hairId, f.hairTint ?? (f.hairColor ? null : cleanHex(d.hairTint))) || {},
    },
    face: { ...(d.face || {}), ...f.face },
  };
}

/** Stable key for a resolved look (texture cache). */
export function lookKey(look) {
  const parts = [];
  for (const type of LOOK_TYPES) {
    const a = look.outfit?.[type];
    if (!a) continue;
    parts.push(`${type}=${a.name}:${JSON.stringify(a.colors)}`);
  }
  parts.push(`skin=${JSON.stringify(look.colors?.skin || {})}`, `hair=${JSON.stringify(look.colors?.hair || {})}`, `face=${JSON.stringify(look.face || {})}`);
  return parts.join('|');
}

const rgbHex = (c) => [c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).padStart(2, '0')).join('');

/**
 * Carry a v1 recoloured look (hair/skin/shirt/pants/shoes RGB) onto the
 * vector default outfit as palette-style tints, so a player's chosen
 * colours survive the move off the raster sheets.
 */
export function vectorFieldsFromColors(app) {
  const fields = { tint: {} };
  if (app?.skin) fields.skinTint = rgbHex(app.skin);
  if (app?.hair) fields.hairTint = rgbHex(app.hair);
  if (app?.shirt) fields.tint.shirt = rgbHex(app.shirt);
  if (app?.pants) fields.tint.pants = rgbHex(app.pants);
  if (app?.shoes) fields.tint.shoes = rgbHex(app.shoes);
  return normalizeVectorFields(fields);
}

/** Swatch colour (hex) for a colourway: its color_1 tint. */
export function variantSwatch(colors) {
  const c = colors?.color_1;
  if (!c) return 'cccccc';
  const amount = Number(c.tintAmount) || 0;
  const hex = cleanHex(c.tintColor) || 'cccccc';
  if (amount >= 50) return hex;
  return 'd8d8d8';
}

/**
 * A random look from the catalog: every face part, a hair style (a hat one
 * time in four, only with hair it allows), a top (a dress one time in six),
 * a coat one time in four, a bottom, shoes, real colourways and palette
 * colours.
 */
export function randomVectorFields(catalog, rng = Math.random) {
  const pick = (list) => list[Math.floor(rng() * list.length) % list.length];
  const items = (type) => catalog?.types?.[type] || [];
  const outfit = {};
  const variant = {};
  const choose = (type) => {
    const list = items(type);
    if (!list.length) return null;
    const item = pick(list);
    outfit[type] = item.name;
    if (item.variants?.length) variant[type] = Math.floor(rng() * item.variants.length) % item.variants.length;
    return item;
  };
  for (const type of ['eyes', 'mouth', 'nose', 'ears', 'hair', 'shoes']) choose(type);
  if (rng() < 1 / 6 && items('dress').length) { choose('dress'); outfit.shirt = 'none'; outfit.pants = 'none'; } else { choose('shirt'); if (rng() < 0.2 && items('skirt').length) { choose('skirt'); outfit.pants = 'none'; } else choose('pants'); }
  if (rng() < 0.25) {
    const hats = items('hat').filter((h) => catalog.hatHair?.[h.name]?.includes(outfit.hair));
    if (hats.length) {
      const h = pick(hats);
      outfit.hat = h.name;
      if (h.variants?.length) variant.hat = Math.floor(rng() * h.variants.length) % h.variants.length;
    }
  }
  if (!outfit.hat) outfit.hat = 'none';
  if (!(rng() < 0.25 && choose('coat'))) outfit.coat = 'none';
  const skin = catalog?.palettes?.skin || [];
  const hair = catalog?.palettes?.hair || [];
  return normalizeVectorFields({ outfit, variant, skinColor: skin.length ? pick(skin).id : undefined, hairColor: hair.length ? pick(hair).id : undefined }, catalog);
}
