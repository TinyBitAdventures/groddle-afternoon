/**
 * Glitch avatar rig: which article part goes in which avatarContainer slot,
 * the original colour maths, and the per-frame draw list the compositor
 * paints. Pure data and maths (no DOM), shared by the browser compositor
 * (js/avatar-compositor.js), the offline build (tools/avatar-compositor/)
 * and the tests.
 *
 * Sources (glitch-client):
 *  - com/tinyspeck/engine/view/loadedswfs/AvatarSwf.as: addShirt, addPants,
 *    addShoes ... (part class -> container), masks (eyes and mouth by the
 *    skull, hair by the hat's HairMask, pants under boots), face offsets and
 *    scales, getColorFilterForArticelColor (colour filter per color_N child).
 *  - com/quasimondo/geom/ColorMatrix.as: colorize, contrast, saturation,
 *    brightness, alpha.
 *  - com/tinyspeck/core/data/AvatarSwfParticulars.as: hats that allow hair,
 *    coats that keep shirt sleeves.
 *
 * The rig (assets/avatar/base.json) is Avatar.swf's avatarContainer plus the
 * coat sleeve, shoulder, hair lock, headdress and tail containers recovered
 * from Avatar2011.fla (tools/avatar-compositor/xfl.mjs). The client's
 * sideBraceletCloseContainer_mc is in neither file, and addSocks is never
 * called, so the side bracelet and socks stay unwearable.
 */

// ---------------------------------------------------------------------------
// Colour (ColorMatrix.as)
// ---------------------------------------------------------------------------

const LUMA_R = 0.212671;
const LUMA_G = 0.71516;
const LUMA_B = 0.072169;
export const IDENTITY_CM = Object.freeze([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);

/** ColorMatrix.concat: `mat` applied after `m` (both 4x5, row-major). */
export function concatCM(m, mat) {
  const out = new Array(20);
  for (let y = 0; y < 4; y++) {
    const i = y * 5;
    for (let x = 0; x < 5; x++) {
      out[i + x] = mat[i] * m[x] + mat[i + 1] * m[x + 5] + mat[i + 2] * m[x + 10] + mat[i + 3] * m[x + 15] + (x === 4 ? mat[i + 4] : 0);
    }
  }
  return out;
}

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** A hex string or number as an RGB integer. */
export function rgbInt(c) {
  if (typeof c === 'number') return c & 0xffffff;
  const n = parseInt(String(c || '0').replace(/^#|^0x/i, ''), 16);
  return Number.isFinite(n) ? n & 0xffffff : 0;
}

/**
 * AvatarSwf.getColorFilterForArticelColor: { tintColor, tintAmount,
 * brightness, saturation, contrast, alpha } (GSJS strings or numbers) as a
 * 4x5 colour matrix.
 */
export function colorMatrixFor(color) {
  if (!color) return null;
  let m = IDENTITY_CM.slice();
  const rgb = rgbInt(color.tintColor);
  const amount = num(color.tintAmount) ? num(color.tintAmount) / 100 : 0;
  const r = ((rgb >> 16) & 0xff) / 255;
  const g = ((rgb >> 8) & 0xff) / 255;
  const b = (rgb & 0xff) / 255;
  const inv = 1 - amount;
  m = concatCM(m, [
    inv + amount * r * LUMA_R, amount * r * LUMA_G, amount * r * LUMA_B, 0, 0,
    amount * g * LUMA_R, inv + amount * g * LUMA_G, amount * g * LUMA_B, 0, 0,
    amount * b * LUMA_R, amount * b * LUMA_G, inv + amount * b * LUMA_B, 0, 0,
    0, 0, 0, 1, 0,
  ]);
  const c = (num(color.contrast) ? num(color.contrast) / 100 : 0) + 1;
  m = concatCM(m, [c, 0, 0, 0, 128 * (1 - c), 0, c, 0, 0, 128 * (1 - c), 0, 0, c, 0, 128 * (1 - c), 0, 0, 0, 1, 0]);
  const s = (num(color.saturation) ? num(color.saturation) / 100 : 0) + 1;
  const si = 1 - s;
  m = concatCM(m, [
    si * LUMA_R + s, si * LUMA_G, si * LUMA_B, 0, 0,
    si * LUMA_R, si * LUMA_G + s, si * LUMA_B, 0, 0,
    si * LUMA_R, si * LUMA_G, si * LUMA_B + s, 0, 0,
    0, 0, 0, 1, 0,
  ]);
  const br = num(color.brightness);
  m = concatCM(m, [1, 0, 0, 0, br, 0, 1, 0, 0, br, 0, 0, 1, 0, br, 0, 0, 0, 1, 0]);
  // (acc.alpha > -1) ? acc.alpha / 100 : 100; a missing alpha reads as 0 > -1 in AS3.
  const al = color.alpha === undefined || color.alpha === '' ? 1 : num(color.alpha) / 100;
  m = concatCM(m, [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, al, 0]);
  return m;
}

/**
 * Avatar.swf's skin parts predate the color_N skin layers, so the client
 * coloured them the old way (AvatarSwf.makeColorMcsForBody): a copy of each
 * part filled flat with skin_tint_color (ColorUtil.getColorTransform) and
 * blended HARDLIGHT over it. With a flat top colour, hard light is affine in
 * the colour underneath, so it is exactly this per-channel matrix.
 */
export function hardLightMatrix(hex) {
  const rgb = rgbInt(hex);
  const ch = [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff].map((v) => v / 255);
  const m = IDENTITY_CM.slice();
  ch.forEach((t, i) => {
    m[i * 6] = t <= 0.5 ? 2 * t : 2 * (1 - t);
    m[i * 5 + 4] = t <= 0.5 ? 0 : (2 * t - 1) * 255;
  });
  return m;
}

/** Apply a 4x5 matrix to [r, g, b, a] (0-255 colour, 0-1 alpha), clamped. */
export function applyCM(m, c) {
  if (!m) return c;
  const r = c[0], g = c[1], b = c[2], a = c[3] * 255;
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  return [
    clamp(m[0] * r + m[1] * g + m[2] * b + m[3] * a + m[4]),
    clamp(m[5] * r + m[6] * g + m[7] * b + m[8] * a + m[9]),
    clamp(m[10] * r + m[11] * g + m[12] * b + m[13] * a + m[14]),
    clamp(m[15] * r + m[16] * g + m[17] * b + m[18] * a + m[19]) / 255,
  ];
}

// ---------------------------------------------------------------------------
// Slots (AvatarSwf add* functions)
// ---------------------------------------------------------------------------

/** Article type -> [part class, container] in the order AvatarSwf adds them. */
export const SLOT_PARTS = Object.freeze({
  eyes: [['sideEyeClose', 'sideEyeCloseContainer_mc'], ['sideEyeOffside', 'sideEyeOffsideContainer_mc']],
  mouth: [['sideMouth', 'sideMouthContainer_mc']],
  nose: [['sideNose', 'sideNoseContainer_mc']],
  ears: [['sideEarClose', 'sideEarCloseContainer_mc'], ['backEars', 'backEarsContainer_mc']],
  hair: [['backHair', 'backHairContainer_mc'], ['sideHair', 'sideHairContainer_mc'], ['sideHairClose', 'sideHairCloseContainer_mc'], ['sideHairOffside', 'sideHairOffsideContainer_mc']],
  hat: [['backHat', 'backHatContainer_mc'], ['sideHat', 'sideHatContainer_mc'], ['sideHeaddressOffside', 'sideHeaddressOffsideContainer_mc'], ['sideHeaddressClose', 'sideHeaddressCloseContainer_mc']],
  shirt: [
    ['shirtTorso', 'sideShirtContainer_mc'], ['backShirtTorso', 'backShirtContainer_mc'],
    ['sleeveUpperClose', 'sideShirtSleeveUpperCloseContainer_mc'], ['backSleeveUpperLeft', 'backSleeveUpperLeftContainer_mc'],
    ['sleeveLowerClose', 'sideShirtSleeveLowerCloseContainer_mc'], ['backSleeveLowerLeft', 'backSleeveLowerLeftContainer_mc'],
    ['sleeveUpperOffside', 'sideShirtSleeveUpperOffsideContainer_mc'], ['backSleeveUpperRight', 'backSleeveUpperRightContainer_mc'],
    ['sleeveLowerOffside', 'sideShirtSleeveLowerOffsideContainer_mc'], ['backSleeveLowerRight', 'backSleeveLowerRightContainer_mc'],
  ],
  coat: [
    ['coatClose', 'sideCoatCloseContainer_mc'], ['coatOffside', 'sideCoatOffsideContainer_mc'],
    ['backCoat', 'backCoatContianer_mc'], ['backCoatOffside', 'backCoatOffsideContainer_mc'],
    ['coatSleeveUpperClose', 'sideCoatSleeveUpperCloseContainer_mc'], ['backCoatSleeveUpperLeft', 'backCoatSleeveUpperLeftContainer_mc'],
    ['coatSleeveLowerClose', 'sideCoatSleeveLowerCloseContainer_mc'], ['backCoatSleeveLowerLeft', 'backCoatSleeveLowerLeftContainer_mc'],
    ['coatSleeveUpperOffside', 'sideCoatSleeveUpperOffsideContainer_mc'], ['backCoatSleeveUpperRight', 'backCoatSleeveUpperRightContainer_mc'],
    ['coatSleeveLowerOffside', 'sideCoatSleeveLowerOffsideContainer_mc'], ['backCoatSleeveLowerRight', 'backCoatSleeveLowerRightContainer_mc'],
    ['sideShoulderOffside', 'sideShoulderOffsideContainer_mc'], ['sideShoulderCloseMiddle', 'sideShoulderCloseMiddleContainer_mc'], ['sideShoulderClose', 'sideShoulderCloseContainer_mc'],
  ],
  pants: [
    ['sideTail', 'sideTailContainer_mc'], ['backTail', 'backTailContainer_mc'],
    ['pantsTop', 'sidePantsBottomContainer_mc'], ['backPantsTop', 'backPantsBottomContainer_mc'],
    ['pantsLegUpperClose', 'sidePantsUpperCloseContainer_mc'], ['backPantsLegUpperLeft', 'backPantsUpperLeftContainer_mc'],
    ['pantsLegLowerClose', 'sidePantsLowerCloseContainer_mc'], ['backPantsLegLowerLeft', 'backPantsLowerLeftContainer_mc'],
    ['pantsLegUpperOffside', 'sidePantsUpperOffsideContainer_mc'], ['backPantsLegUpperRight', 'backPantsUpperRightContainer_mc'],
    ['pantsLegLowerOffside', 'sidePantsLowerOffsideContainer_mc'], ['backPantsLegLowerRight', 'backPantsLowerRightContainer_mc'],
    ['pantsFootClose', 'sidePantsFootCloseContainer_mc'], ['pantsFootOffside', 'sidePantsFootOffsideContainer_mc'],
    ['backPantsFootRight', 'backPantsFootRightContainer_mc'], ['backPantsFootLeft', 'backPantsFootLeftContainer_mc'],
  ],
  dress: [
    ['backDress', 'backDressContainer_mc'], ['backDressOffside', 'backDressOffsideContainer_mc'],
    ['dress', 'sideDressContainer_mc'], ['dressOffside', 'sideDressOffsideContainer_mc'],
    ['dressSleeveUpperClose', 'sideDressSleeveUpperCloseContainer_mc'], ['backDressSleeveUpperLeft', 'backDressSleeveUpperLeftContainer_mc'],
    ['dressSleeveUpperOffside', 'sideDressSleeveUpperOffsideContainer_mc'], ['backDressSleeveUpperRight', 'backDressSleeveUpperRightContainer_mc'],
    ['dressSleeveLowerClose', 'sideDressSleeveLowerCloseContainer_mc'], ['backDressSleeveLowerLeft', 'backDressSleeveLowerLeftContainer_mc'],
    ['dressSleeveLowerOffside', 'sideDressSleeveLowerOffsideContainer_mc'], ['backDressSleeveLowerRight', 'backDressSleeveLowerRightContainer_mc'],
  ],
  skirt: [['backSkirt', 'backSkirtContainer_mc'], ['skirt', 'sideSkirtContainer_mc']],
  shoes: [
    ['shoeClose', 'sideShoeCloseContainer_mc'], ['shoeOffside', 'sideShoeOffsideContainer_mc'],
    ['shoeToeClose', 'sideToeCloseContainer_mc'], ['shoeToeOffside', 'sideToeOffsideContainer_mc'],
    ['backShoeRight', 'backShoeRightContainer_mc'], ['backShoeLeft', 'backShoeLeftContainer_mc'],
    ['shoeUpperClose', 'sideShoeUpperCloseContainer_mc'], ['shoeUpperOffside', 'sideShoeUpperOffsideContainer_mc'],
    ['backShoeUpperRight', 'backShoeUpperRightContainer_mc'], ['backShoeUpperLeft', 'backShoeUpperLeftContainer_mc'],
  ],
  boots: [
    ['shoeClose', 'sideBootFootCloseContainer_mc'], ['shoeOffside', 'sideBootFootOffsideContainer_mc'],
    ['backShoeRight', 'backBootFootRightContainer_mc'], ['backShoeLeft', 'backBootFootLeftContainer_mc'],
    ['bootUpperOffside', 'sideBootUpperOffsideContainer_mc'], ['bootUpperClose', 'sideBootUpperCloseContainer_mc'],
    ['backBootUpperLeft', 'backBootUpperLeftContainer_mc'], ['backBootUpperRight', 'backBootUpperRightContainer_mc'],
  ],
  gloves: [
    ['gloveClose', 'sideGloveCloseContainer_mc'], ['gloveOffside', 'sideGloveOffsideContainer_mc'],
    ['gloveSleeveUpperClose', 'sideGloveSleeveUpperCloseContainer_mc'], ['gloveSleeveLowerClose', 'sideGloveSleeveLowerCloseContainer_mc'],
    ['gloveSleeveLowerOffside', 'sideGloveSleeveLowerOffsideContainer_mc'],
    ['backGloveRight', 'backGloveRightContainer_mc'], ['backGloveLeft', 'backGloveLeftContainer_mc'],
    ['backGloveSleeveUpperLeft', 'backGloveSleeveUpperLeftContainer_mc'], ['backGloveSleeveLowerLeft', 'backGloveSleeveLowerLeftContainer_mc'],
    ['backGloveSleeveUpperRight', 'backGloveSleeveUpperRightContainer_mc'], ['backGloveSleeveLowerRight', 'backGloveSleeveLowerRightContainer_mc'],
  ],
  necklace: [['necklace', 'sideNecklaceContainer_mc'], ['backNecklace', 'backNecklaceContainer_mc']],
  bracelet: [['braceletClose', 'sideBraceletCloseContainer_mc'], ['backBraceletRight', 'backBraceletRightContainer_mc']],
  ring: [['ring', 'sideRingCloseContainer_mc']],
});

/** Every article container (the client empties them all on initializeHead). */
export const ARTICLE_CONTAINERS = Object.freeze([...new Set(Object.values(SLOT_PARTS).flat().map(([, c]) => c))]);

/** The sleeve containers a coat hides (AvatarSwfParticulars.shirt_and_dress_sleeve_containersA). */
export const SHIRT_AND_DRESS_SLEEVES = Object.freeze([
  'sideDressSleeveUpperCloseContainer_mc', 'backDressSleeveUpperLeftContainer_mc', 'sideDressSleeveUpperOffsideContainer_mc', 'backDressSleeveUpperRightContainer_mc',
  'sideDressSleeveLowerCloseContainer_mc', 'backDressSleeveLowerLeftContainer_mc', 'sideDressSleeveLowerOffsideContainer_mc', 'backDressSleeveLowerRightContainer_mc',
  'sideShirtSleeveUpperCloseContainer_mc', 'backSleeveUpperLeftContainer_mc', 'sideShirtSleeveLowerCloseContainer_mc', 'backSleeveLowerLeftContainer_mc',
  'sideShirtSleeveUpperOffsideContainer_mc', 'backSleeveUpperRightContainer_mc', 'sideShirtSleeveLowerOffsideContainer_mc', 'backSleeveLowerRightContainer_mc',
]);
export const COATS_THAT_ALLOW_SLEEVES = Object.freeze(['elizabethan_robe', 'mongolian_fighting', 'Fisherman_vest']);

/** Hair containers a hat's HairMask clips when hat and hair are worn together. */
export const HAT_MASKED_HAIR = Object.freeze(['sideHairContainer_mc', 'backHairContainer_mc', 'sideHairCloseContainer_mc', 'sideHairOffsideContainer_mc']);

/** AvatarSwf.addShoes: 'boot' or 'ball' in the name (but not ballet) uses the boot containers. */
export function isBoot(name) {
  const n = String(name || '').toLowerCase();
  return (n.includes('boot') || n.includes('ball')) && !n.includes('ballet');
}

/** Body parts the skin colour reaches (AvatarSwf.colorable_skin_mcsA): rig nodes plus ears. */
export const SKIN_NODES = Object.freeze([
  'sideSkull_mc', 'sideTorso_mc', 'sideArmUpperClose_mc', 'sideArmUpperOffside_mc', 'sideArmLowerClose_mc', 'sideArmLowerOffside_mc',
  'sideHandClose_mc', 'sideHandOffside_mc', 'sideLegUpperClose_mc', 'sideLegUpperOffside_mc', 'sideLegLowerClose_mc', 'sideLegLowerOffside_mc',
  'sideFootClose_mc', 'sideFootOffside_mc', 'backHead_mc', 'backTorso_mc', 'backArmUpperLeft_mc', 'backArmUpperRight_mc',
  'backArmLowerLeft_mc', 'backArmLowerRight_mc', 'backHandLeft_mc', 'backHandRight_mc', 'backLegUpperLeft_mc', 'backLegUpperRight_mc',
  'backLegLowerLeft_mc', 'backLegLowerRight_mc', 'backFootLeft_mc', 'backFootRight_mc',
]);

const none = (a) => !a || !a.name || a.name === 'none';

/**
 * Which part goes in which container for an outfit, following
 * AvatarSwf.initializeHead: skirt excludes dress, a hat excludes hair unless
 * the hat allows it, boots use their own containers, most coats hide shirt
 * and dress sleeves. outfit: { [type]: { name, colors?, allowsHair? } }.
 * Returns Map<container, [{ type, part, article }]> and the hidden sleeve set.
 */
export function slotAssignments(outfit, { hatAllowsHair } = {}) {
  const map = new Map();
  const add = (type, list, article) => {
    for (const [part, container] of list) {
      if (!article.parts || article.parts.includes(part)) {
        if (!map.has(container)) map.set(container, []);
        map.get(container).push({ type, part, article });
      }
    }
  };
  const o = outfit || {};
  for (const type of ['eyes', 'mouth', 'ears', 'nose', 'pants']) if (!none(o[type])) add(type, SLOT_PARTS[type], o[type]);
  if (!none(o.coat)) add('coat', SLOT_PARTS.coat, o.coat);
  if (!none(o.shirt)) add('shirt', SLOT_PARTS.shirt, o.shirt);
  if (!none(o.skirt)) add('skirt', SLOT_PARTS.skirt, o.skirt);
  else if (!none(o.dress)) add('dress', SLOT_PARTS.dress, o.dress);
  const hatOn = !none(o.hat);
  const hairOn = !none(o.hair);
  const together = !hatOn || !hairOn || (hatAllowsHair ? hatAllowsHair(o.hat, o.hair) : Boolean(o.hat.allowsHair?.includes(o.hair.name)));
  if (hatOn) add('hat', SLOT_PARTS.hat, o.hat);
  if (hairOn && together) add('hair', SLOT_PARTS.hair, o.hair);
  if (!none(o.shoes)) add('shoes', isBoot(o.shoes.name) ? SLOT_PARTS.boots : SLOT_PARTS.shoes, o.shoes);
  for (const type of ['gloves', 'ring', 'necklace', 'bracelet']) if (!none(o[type])) add(type, SLOT_PARTS[type], o[type]);
  const hidden = new Set();
  if (!none(o.coat) && !COATS_THAT_ALLOW_SLEEVES.includes(o.coat.name)) for (const c of SHIRT_AND_DRESS_SLEEVES) hidden.add(c);
  return { map, hidden, hatAndHair: hatOn && hairOn && together, boots: !none(o.shoes) && isBoot(o.shoes.name) };
}

// ---------------------------------------------------------------------------
// Draw list
// ---------------------------------------------------------------------------

export function mulM(p, c) {
  return [
    p[0] * c[0] + p[2] * c[1],
    p[1] * c[0] + p[3] * c[1],
    p[0] * c[2] + p[2] * c[3],
    p[1] * c[2] + p[3] * c[3],
    p[0] * c[4] + p[2] * c[5] + p[4],
    p[1] * c[4] + p[3] * c[5] + p[5],
  ];
}

/** AS3 int(): truncate toward zero. */
const asInt = (v) => Math.trunc(Number(v) || 0);

/** Face numbers (AvatarConfig): eye_scale, eye_dist ... with the client's defaults. */
export function faceOf(face = {}) {
  return {
    eye_scale: num(face.eye_scale, 1), eye_dist: num(face.eye_dist), eye_height: num(face.eye_height),
    nose_scale: num(face.nose_scale, 1), nose_height: num(face.nose_height),
    mouth_scale: num(face.mouth_scale, 1), mouth_height: num(face.mouth_height),
    ears_scale: num(face.ears_scale, 1), ears_height: num(face.ears_height),
  };
}

/** Container offset (in its parent's space) and part scale from AvatarSwf.initializeHead. */
function faceTweak(container, face) {
  switch (container) {
    case 'sideEyeCloseContainer_mc': return { dx: -asInt(face.eye_dist), dy: asInt(face.eye_height), s: face.eye_scale };
    case 'sideEyeOffsideContainer_mc': return { dx: asInt(face.eye_dist), dy: asInt(face.eye_height), s: face.eye_scale };
    case 'sideMouthContainer_mc': return { dx: 0, dy: asInt(face.mouth_height), s: face.mouth_scale };
    case 'sideNoseContainer_mc': return { dx: 0, dy: asInt(face.nose_height), s: face.nose_scale };
    case 'sideEarCloseContainer_mc': return { dx: 0, dy: asInt(face.ears_height), s: face.ears_scale };
    case 'backEarsContainer_mc': return { dx: 0, dy: 0, s: face.ears_scale };
    default: return null;
  }
}

/** Colour matrix for an op's colour groups (innermost first), then the article-wide one. */
function groupMatrix(groups, colors, outer) {
  let m = null;
  for (const g of groups || []) {
    const cm = colors?.[g];
    if (cm) m = m ? concatCM(m, cm) : cm;
  }
  if (outer) m = m ? concatCM(m, outer) : outer;
  return m;
}

/** Combine an op's colour transform (Flash CXFORM, before filters) into a matrix. */
function cxMatrix(cx) {
  return [cx.m[0], 0, 0, 0, cx.o[0], 0, cx.m[1], 0, 0, cx.o[1], 0, 0, cx.m[2], 0, cx.o[2], 0, 0, 0, 1, 0];
}

/**
 * One frame as paint-ordered draw items:
 *   { src, s: shapeId, m: [a,b,c,d,e,f], a: alpha, cm: 4x5 | null }
 *   { clip: [{ src, s, m }], items: [...] }   (mask group)
 * rig: built rig ({ frames, nodes, table }); look: { assign (slotAssignments),
 * articles: Map<name, data>, colors: { skin, hair: { color_1, color_10 } },
 * face } with colour matrices precomputed (lookMatrices).
 */
export function frameDrawList(rig, look, frameIndex) {
  const rows = rig.table[frameIndex];
  const out = [];
  const { assign, articles, matrices } = look;
  const face = faceOf(look.face);
  const skin = matrices.skin;
  // Positions of mask sources this frame.
  let skull = null;
  const containerM = new Map();
  for (const row of rows) {
    if (row.n !== undefined && rig.nodes[row.n].name === 'sideSkull_mc') skull = { node: rig.nodes[row.n], m: row.m };
    if (row.slot) containerM.set(row.slot, row);
  }
  const partOps = (entry, m, extraCM) => {
    const data = articles.get(entry.article.name);
    const part = data?.parts?.[entry.part];
    if (!part) return [];
    const v = part.variants[part.frames === 0 ? 0 : part.frames[frameIndex]] || [];
    const colors = matrices.articles.get(entry.article.name);
    const src = entry.article.name;
    const walk = (ops) => {
      const list = [];
      for (const op of ops) {
        if (op.clip) {
          list.push({ clip: op.clip.map((c) => ({ src, s: c.s, m: mulM(m, c.m) })), items: walk(op.ops) });
          continue;
        }
        let cm = groupMatrix(op.g, colors, extraCM);
        if (op.cx) cm = cm ? concatCM(cxMatrix(op.cx), cm) : cxMatrix(op.cx);
        list.push({ src, s: op.s, m: mulM(m, op.m), a: (op.a ?? 1), cm });
      }
      return list;
    };
    return walk(v);
  };
  const maskFor = (container) => {
    if ((container === 'sideEyeCloseContainer_mc' || container === 'sideEyeOffsideContainer_mc' || container === 'sideMouthContainer_mc') && skull) {
      return skull.node.ops.map((o) => ({ src: 'base', s: o.s, m: mulM(skull.m, o.m) }));
    }
    // The hat's HairMask (in the hat container) also masks the front and
    // back hair locks (AvatarSwf: side_hair_close_mask, side_hair_offside_mask).
    if (assign.hatAndHair && HAT_MASKED_HAIR.includes(container)) {
      const back = container === 'backHairContainer_mc';
      const hatC = back ? 'backHatContainer_mc' : 'sideHatContainer_mc';
      const maskPart = back ? 'backHatHairMask' : 'sideHatHairMask';
      const row = containerM.get(hatC);
      const hat = assign.map.get(hatC)?.[0];
      if (row && hat) {
        const ops = partOps({ article: hat.article, part: maskPart }, row.m, null);
        if (ops.length) return ops.map((o) => ({ src: o.src, s: o.s, m: o.m }));
      }
    }
    if (assign.boots) {
      const legFor = {
        sidePantsLowerCloseContainer_mc: 'sideLegLowerCloseContainer_mc',
        sidePantsLowerOffsideContainer_mc: 'sideLegLowerOffsideContainer_mc',
        backPantsLowerLeftContainer_mc: 'backLegLowerLeftNakedContainer_mc',
        backPantsLowerRightContainer_mc: 'backLegLowerRightNakedContainer_mc',
      }[container];
      const leg = legFor && rig.containers?.[frameIndex]?.[legFor];
      if (leg) return [{ rect: [-7, -10, 14, 14], m: leg }];
    }
    return null;
  };
  for (const row of rows) {
    if (row.n !== undefined) {
      const node = rig.nodes[row.n];
      const cm = SKIN_NODES.includes(node.name) ? skin : null;
      for (const o of node.ops) out.push({ src: 'base', s: o.s, m: mulM(row.m, o.m), a: (row.a ?? 1) * (o.a ?? 1), cm });
      continue;
    }
    if (row.s !== undefined) { out.push({ src: 'base', s: row.s, m: row.m, a: row.a ?? 1, cm: null }); continue; }
    if (!row.slot || assign.hidden.has(row.slot)) continue;
    const entries = assign.map.get(row.slot);
    if (!entries) continue;
    let m = row.m;
    const tweak = faceTweak(row.slot, face);
    if (tweak && row.pm) {
      m = m.slice();
      m[4] += row.pm[0] * tweak.dx + row.pm[2] * tweak.dy;
      m[5] += row.pm[1] * tweak.dx + row.pm[3] * tweak.dy;
    }
    if (tweak && tweak.s !== 1) m = mulM(m, [tweak.s, 0, 0, tweak.s, 0, 0]);
    const items = [];
    for (const e of entries) {
      const extra = e.type === 'ears' ? skin : null;
      items.push(...partOps(e, m, extra).map((it) => (it.clip ? it : { ...it, a: it.a * (row.a ?? 1) })));
    }
    const mask = maskFor(row.slot);
    if (mask && items.length) out.push({ clip: mask, items });
    else out.push(...items);
  }
  return out;
}

/**
 * Unpack base.json's compact frame table (tools/avatar-compositor/build.mjs
 * packTable) into rows frameDrawList reads. Idempotent.
 */
export function expandRig(base) {
  if (base.expanded) return base;
  base.table = base.table.map((rows, f) => rows.map((r) => {
    const m = r.slice(1, 7);
    const out = r[0] >= 0 ? { n: r[0], m } : { slot: base.slots[-r[0] - 1], m };
    if (r.length > 7) out.a = r[7];
    if (out.slot && base.head?.[f]) out.pm = base.head[f];
    return out;
  }));
  base.expanded = true;
  return base;
}

/** Colour matrices for a look: skin, hair groups and every article's color_N. */
export function lookMatrices(look) {
  const skinColors = look.colors?.skin || {};
  const hairColors = look.colors?.hair || {};
  const articles = new Map();
  for (const [type, a] of Object.entries(look.outfit || {})) {
    if (none(a)) continue;
    const groups = {};
    const colors = type === 'hair' ? hairColors : a.colors || {};
    for (const [k, v] of Object.entries(colors)) groups[k] = colorMatrixFor(v);
    articles.set(a.name, groups);
  }
  const skin = skinColors.tint ? hardLightMatrix(skinColors.tint) : skinColors.color_1 ? colorMatrixFor(skinColors.color_1) : null;
  return { skin, articles };
}

/** Axis-aligned bounds of a transformed rect [xmin, ymin, xmax, ymax]. */
export function transformBounds(m, b) {
  const xs = [];
  const ys = [];
  for (const [x, y] of [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]]) {
    xs.push(m[0] * x + m[2] * y + m[4]);
    ys.push(m[1] * x + m[3] * y + m[5]);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Bounds of a draw list (clipped groups use their mask's bounds). shapeOf(src, id) -> shape. */
export function drawListBounds(items, shapeOf) {
  let b = null;
  const grow = (r) => {
    if (!r) return;
    b = b ? [Math.min(b[0], r[0]), Math.min(b[1], r[1]), Math.max(b[2], r[2]), Math.max(b[3], r[3])] : r.slice();
  };
  const boundsOf = (it) => {
    if (it.rect) return transformBounds(it.m, [it.rect[0], it.rect[1], it.rect[0] + it.rect[2], it.rect[1] + it.rect[3]]);
    const sh = shapeOf(it.src, it.s);
    return sh?.b ? transformBounds(it.m, sh.b) : null;
  };
  for (const it of items) {
    if (it.clip) {
      let cb = null;
      for (const c of it.clip) { const r = boundsOf(c); if (r) cb = cb ? [Math.min(cb[0], r[0]), Math.min(cb[1], r[1]), Math.max(cb[2], r[2]), Math.max(cb[3], r[3])] : r; }
      let ib = null;
      for (const c of it.items) { const r = c.clip ? drawListBounds([c], shapeOf) : boundsOf(c); if (r) ib = ib ? [Math.min(ib[0], r[0]), Math.min(ib[1], r[1]), Math.max(ib[2], r[2]), Math.max(ib[3], r[3])] : r; }
      if (cb && ib) grow([Math.max(cb[0], ib[0]), Math.max(cb[1], ib[1]), Math.min(cb[2], ib[2]), Math.min(cb[3], ib[3])]);
      continue;
    }
    if ((it.a ?? 1) <= 0) continue;
    grow(boundsOf(it));
  }
  return b;
}
