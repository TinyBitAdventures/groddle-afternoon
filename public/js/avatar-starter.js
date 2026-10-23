/**
 * "Start fresh": Tiny Speck's new-player avatar picker, on the vector Glitch.
 *
 * Source (GSJS, CC0):
 *  - inc_data_default_avatars.js: four choices for each of nine keys (also
 *    copied into assets/avatar/catalog.json as `defaults`).
 *  - players/inc_avatar.js avatar_build_default: each key's chosen bits are
 *    merged into one hash (`top` sets hat, coat, shirt and dress; `bottom`
 *    sets pants, skirt and shoes; 0 is an empty slot).
 *  - main.js doAvatarGetChoices: the option names, their order, the two
 *    group breaks and the default pick for each key.
 *
 * Here each choice is the same bits as saved vector fields (js/avatar-looks.js):
 * GSJS article ids as catalog names and colourway indexes, palette ids as
 * skinColor / hairColor, and the AvatarConfig face numbers.
 */

/** doAvatarGetChoices option_names, in option_names_sort order. */
export const STARTER_SLOTS = Object.freeze([
  { id: 'hair_style', label: 'Hair Style' },
  { id: 'hair_color', label: 'Hair Color' },
  { id: 'skin_color', label: 'Skin Color' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'nose', label: 'Nose' },
  { id: 'mouth', label: 'Mouth' },
  { id: 'ears', label: 'Ears' },
  { id: 'top', label: 'Clothing: Top' },
  { id: 'bottom', label: 'Clothing: Bottom' },
]);

/** option_names_breaks: a group ends after these indexes (hair and skin / face / clothing). */
export const STARTER_BREAKS = Object.freeze([2, 6]);

/** default_options: the picker opens on these choices. */
export const STARTER_DEFAULT_CHOICES = Object.freeze({
  hair_style: 3, hair_color: 0, skin_color: 2, eyes: 0, nose: 1, mouth: 0, ears: 0, top: 2, bottom: 2,
});

/** Choices per slot (avatar_build_default clamps to 0-3). */
export const STARTER_CHOICE_COUNT = 4;

const NONE = 'none';

/**
 * inc_data_default_avatars.js, choice by choice. GSJS ids in comments: hair
 * styles and face parts are catalog `gsjsId`s, clothes are colourway ids
 * (the catalog variant with that id), colours are data_avatar_colors ids.
 */
export const STARTER_CHOICES = Object.freeze({
  hair_style: Object.freeze([
    { outfit: { hair: 'hair_10' } }, // hair 26
    { outfit: { hair: 'hair_01' } }, // hair 3
    { outfit: { hair: 'hair_11' } }, // hair 27
    { outfit: { hair: 'mohawk' } }, // hair 74
  ]),
  hair_color: Object.freeze([{ hairColor: 6 }, { hairColor: 111 }, { hairColor: 79 }, { hairColor: 123 }]),
  skin_color: Object.freeze([{ skinColor: 104 }, { skinColor: 33 }, { skinColor: 4 }, { skinColor: 31 }]),
  eyes: Object.freeze([
    { outfit: { eyes: 'eyes_20101109F' }, face: { eye_scale: 0.94406666666667, eye_height: 1.5266666666667, eye_dist: 0.53333333333333 } }, // eyes 20
    { outfit: { eyes: 'eyes_girly_1' }, face: { eye_scale: 0.81133333333333, eye_height: -0.88666666666667, eye_dist: -0.8 } }, // eyes 68
    { outfit: { eyes: 'eyes_02' }, face: { eye_scale: 0.96606666666667, eye_height: 2.4466666666667, eye_dist: -1.33 } }, // eyes 10
    { outfit: { eyes: 'eyes_blank' }, face: { eye_scale: 0.81866666666667, eye_height: -0.88666666666667, eye_dist: -0.8 } }, // eyes 88
  ]),
  nose: Object.freeze([
    { outfit: { nose: 'nose_0009' }, face: { nose_scale: 0.97053333333333, nose_height: 2.018 } }, // nose 49
    { outfit: { nose: 'nose_0001' }, face: { nose_scale: 0.92786666666667, nose_height: 1.5633333333333 } }, // nose 5
    { outfit: { nose: 'nose_0010' }, face: { nose_scale: 1.066, nose_height: 1.7173333333333 } }, // nose 50
    { outfit: { nose: 'nose_0006' }, face: { nose_scale: 0.92786666666667, nose_height: 2.5973333333333 } }, // nose 48
  ]),
  mouth: Object.freeze([
    { outfit: { mouth: 'mouth_02' }, face: { mouth_scale: 0.87226666666667, mouth_height: 1.8346666666667 } }, // mouth 37
    { outfit: { mouth: 'mouth_20101109A' }, face: { mouth_scale: 0.88066666666667, mouth_height: 1.634 } }, // mouth 42
    { outfit: { mouth: 'mouth_08' }, face: { mouth_scale: 0.96513333333333, mouth_height: 1.8206666666667 } }, // mouth 38
    { outfit: { mouth: 'mouth_20101109B' }, face: { mouth_scale: 0.75, mouth_height: 1.8206666666667 } }, // mouth 43
  ]),
  ears: Object.freeze([
    { outfit: { ears: 'ears_0009' }, face: { ears_scale: 0.928, ears_height: -1.1333333333333 } }, // ears 9
    { outfit: { ears: 'ears_0002' }, face: { ears_scale: 0.8488, ears_height: -3.5333333333333 } }, // ears 7
    { outfit: { ears: 'ears_0003' }, face: { ears_scale: 0.8488, ears_height: -3.5333333333333 } }, // ears 8
    // ears 0: no ears (GSJS also zeroes ears_scale; left at the default so later ears show).
    { outfit: { ears: NONE }, face: {} },
  ]),
  top: Object.freeze([
    { outfit: { hat: NONE, coat: NONE, shirt: 'ghost_tank', dress: NONE }, variant: { shirt: 4 } }, // shirt 256
    { outfit: { hat: NONE, coat: NONE, shirt: NONE, dress: 'plain_trimmed_dress' }, variant: { dress: 0 } }, // dress 367
    { outfit: { hat: NONE, coat: NONE, shirt: 'medallion_tunic_dark', dress: NONE }, variant: { shirt: 1 } }, // shirt 283
    { outfit: { hat: NONE, coat: NONE, shirt: 'double_striped_tee', dress: NONE }, variant: { shirt: 5 } }, // shirt 267
  ]),
  bottom: Object.freeze([
    { outfit: { pants: 'davie_street_shorts', skirt: NONE, shoes: 'square_toe_converse' }, variant: { pants: 1, shoes: 4 } }, // pants 184, shoes 261
    { outfit: { pants: NONE, skirt: NONE, shoes: 'nike_strap_sandals' }, variant: { shoes: 0 } }, // shoes 108
    { outfit: { pants: 'regular_jeans', skirt: NONE, shoes: 'single_lace_sneakers' }, variant: { pants: 0, shoes: 2 } }, // pants 163, shoes 168
    { outfit: { pants: 'plain_trousers', skirt: NONE, shoes: 'campers' }, variant: { pants: 9, shoes: 2 } }, // pants 1048, shoes 224
  ]),
});

const clone = (v) => JSON.parse(JSON.stringify(v || {}));

/**
 * One slot's choice merged into saved vector fields (avatar_build_default's
 * merge): its articles, colourways (any custom tint on them cleared),
 * palette id and face numbers replace what was there.
 */
export function applyStarterChoice(fields, slot, index) {
  const choice = STARTER_CHOICES[slot]?.[index];
  const out = clone(fields);
  if (!choice) return out;
  for (const k of ['outfit', 'variant', 'tint', 'face']) out[k] ||= {};
  for (const [type, name] of Object.entries(choice.outfit || {})) {
    out.outfit[type] = name;
    delete out.variant[type];
    delete out.tint[type];
  }
  Object.assign(out.variant, choice.variant || {});
  if (choice.hairColor) { out.hairColor = choice.hairColor; delete out.hairTint; }
  if (choice.skinColor) { out.skinColor = choice.skinColor; delete out.skinTint; }
  if (choice.face) {
    // A slot owns its face numbers: drop the previous part's before setting.
    const prefix = { eyes: 'eye_', nose: 'nose_', mouth: 'mouth_', ears: 'ears_' }[slot];
    if (prefix) for (const k of Object.keys(out.face)) if (k.startsWith(prefix)) delete out.face[k];
    Object.assign(out.face, choice.face);
  }
  return out;
}

/** Saved vector fields for a full set of choices ({ slot: 0-3 }; missing slots use the defaults). */
export function starterFields(choices = {}) {
  let fields = { outfit: {}, variant: {}, tint: {}, face: {} };
  for (const { id } of STARTER_SLOTS) {
    const i = Number.isInteger(choices[id]) && choices[id] >= 0 && choices[id] < STARTER_CHOICE_COUNT ? choices[id] : STARTER_DEFAULT_CHOICES[id];
    fields = applyStarterChoice(fields, id, i);
  }
  return fields;
}

/** Every slot on one choice row: Tiny Speck's four starter looks read row-wise. */
export function starterRowFields(index) {
  return starterFields(Object.fromEntries(STARTER_SLOTS.map(({ id }) => [id, index])));
}

const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

/**
 * Which choice a look shows for a slot (0-3), or -1 when it shows none of
 * them (a part picked elsewhere in the builder).
 */
export function starterChoiceOf(fields, slot) {
  const f = fields || {};
  const choices = STARTER_CHOICES[slot] || [];
  return choices.findIndex((c) => {
    for (const [type, name] of Object.entries(c.outfit || {})) {
      if ((f.outfit?.[type] ?? null) !== name) return false;
      if (f.tint?.[type]) return false;
      if (name !== NONE && (f.variant?.[type] ?? 0) !== (c.variant?.[type] ?? 0)) return false;
    }
    if (c.hairColor && (f.hairColor !== c.hairColor || f.hairTint)) return false;
    if (c.skinColor && (f.skinColor !== c.skinColor || f.skinTint)) return false;
    for (const [k, v] of Object.entries(c.face || {})) if (!near(f.face?.[k], v)) return false;
    return true;
  });
}

/** The current choice for every slot ({ slot: -1..3 }). */
export function starterChoicesOf(fields) {
  return Object.fromEntries(STARTER_SLOTS.map(({ id }) => [id, starterChoiceOf(fields, id)]));
}

/** A random choice for every slot. */
export function randomStarterChoices(rng = Math.random) {
  return Object.fromEntries(STARTER_SLOTS.map(({ id }) => [id, Math.floor(rng() * STARTER_CHOICE_COUNT) % STARTER_CHOICE_COUNT]));
}
