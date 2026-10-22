/**
 * Looks for the other Glitches you meet (local companions, race and Game of
 * Crowns rivals, party guests, the Hog Haul rival): Tiny Speck's vector
 * avatar in real GSJS wardrobe articles, colourways and skin/hair palettes
 * (assets/avatar/catalog.json, CC0), one fixed look per name.
 *
 * Pure and deterministic: tools/avatar-compositor/build.mjs npcs runs
 * buildNpcLooks(catalog) once, bakes each look's sheets and writes the fields
 * into js/npc-glitch-sheets.js, so a name keeps its look across sessions and
 * builds (tests/npc-glitches.test.js regenerates them and compares).
 *
 * No source records what these stand-ins wore (they are remake actors named
 * after players in the reference recordings), so each look is drawn with a
 * seeded RNG through randomVectorFields (every article and colour is a real
 * GSJS one), steered so the top's colourway matches the name's colour (the
 * nameplate and race tint each one already had), and rerolled until it is
 * distinct from the player's default look and the looks drawn before it.
 */
import { catalogItem, cleanHex, randomVectorFields } from './avatar-looks.js';

/** Fixed seed for the whole set (mixed into each name's hash). */
export const NPC_GLITCH_SEED = 0x47b1c4;

/**
 * The named Glitches, in build order. `color` is each one's existing
 * signature colour (js/local-companions.js nameplates, js/races.js and
 * js/party-spaces.js tints, the Hog Haul rival's fallback tint).
 */
export const NPC_GLITCH_ROSTER = Object.freeze([
  Object.freeze({ id: 'amp', name: 'Amp', color: 'f2a34a' }),
  Object.freeze({ id: 'bumbishfish', name: 'Bumbishfish', color: '69a9ef' }),
  Object.freeze({ id: 'lily-linguistic', name: 'Lily Linguistic', color: 'ed86bd' }),
  Object.freeze({ id: 'gomez-addams', name: 'Gomez Addams', color: 'd8b5ff' }),
]);

/**
 * Articles left out of NPC looks: costume pieces that read as a gag or hide
 * the face (the player can still wear them). Matched against article names.
 */
export const NPC_SKIP_ARTICLES = Object.freeze([
  // Faces and masks.
  /eyes_blank/i, /clown/i, /mask/i, /helmet/i, /pumpkin/i, /skeletor/i, /zombie/i,
  // Whole-body costumes and ride-ons.
  /^ride/i, /costume/i, /suit_(top|coat|hat)/i, /hot_dog/i, /japadog/i, /godzilla/i, /mini_dino/i, /unicorn/i,
  /glitchamaphone/i, /cardboard/i, /censor_bar/i, /hobo_barrel/i, /potato_sack/i, /paper(bag)?_/i, /post_it/i,
  /garden_gnome/i, /armor/i, /gorilla/i, /humbaba/i, /^train_0/i, /straight_jacket/i, /hospital/i, /chest_hair/i,
  /ghost/i, /bubble$/i, /^log$/i, /^tower$/i, /octopus/i, /lizard/i, /watermelon/i, /domoku/i, /deadmau5/i,
  // Giant and rook outfits (shrine and quest pieces).
  /^(mab|alph_lem|cosma_|spriggan_zille|grendaline|rook_)/i,
  // Underwear-level tops.
  /bikini/i, /playboy/i, /sexy/i,
]);

/** mulberry32: a small seeded PRNG in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a of a name, mixed with NPC_GLITCH_SEED. */
export function nameSeed(name) {
  let h = 0x811c9dc5;
  for (const ch of String(name || '')) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h ^ NPC_GLITCH_SEED) >>> 0;
}

const rgb = (hex) => [0, 2, 4].map((i) => parseInt(String(hex).slice(i, i + 2), 16) || 0);
/** Euclidean RGB distance between two 'rrggbb' colours. */
export function colorDistance(a, b) {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

const skipped = (name) => NPC_SKIP_ARTICLES.some((re) => re.test(String(name || '')));

/**
 * A colourway's main colour: its color_1 tint when that is a solid colorize
 * (tintAmount 50+), else null (a filter on the art's own colours, which a
 * swatch cannot name).
 */
export function colourwayColor(colors) {
  const c = colors?.color_1;
  if (!c || (Number(c.tintAmount) || 0) < 50) return null;
  return cleanHex(c.tintColor);
}

/** The colourway of `item` nearest `hex` (index and distance), or null. */
function nearestVariant(item, hex) {
  let best = null;
  (item?.variants || []).forEach((v, index) => {
    const main = colourwayColor(v.colors);
    if (!main) return;
    const d = colorDistance(main, hex);
    if (!best || d < best.d) best = { index, d };
  });
  return best;
}

/** How close a top colourway must be to the signature colour. */
const SIGNATURE_MATCH = 70;

/**
 * Point the look's top (dress or shirt) at a colourway near `hex`: the drawn
 * article's own nearest colourway when it is close, else a seeded pick among
 * the same type's articles that have one.
 */
function steerTop(fields, catalog, hex, rng) {
  const type = fields.outfit.dress && fields.outfit.dress !== 'none' ? 'dress' : 'shirt';
  const own = nearestVariant(catalogItem(catalog, type, fields.outfit[type]), hex);
  if (own && own.d <= SIGNATURE_MATCH) {
    fields.variant[type] = own.index;
    return;
  }
  const options = (catalog.types?.[type] || [])
    .filter((item) => !skipped(item.name))
    .map((item) => ({ item, near: nearestVariant(item, hex) }))
    .filter((o) => o.near && o.near.d <= SIGNATURE_MATCH);
  if (!options.length) return;
  const pick = options[Math.floor(rng() * options.length) % options.length];
  fields.outfit[type] = pick.item.name;
  fields.variant[type] = pick.near.index;
}

/** Does any article in the look match NPC_SKIP_ARTICLES? */
export function hasSkippedArticle(fields) {
  return Object.values(fields?.outfit || {}).some((name) => name !== 'none' && skipped(name));
}

const topOf = (f) => (f.outfit.dress && f.outfit.dress !== 'none' ? f.outfit.dress : f.outfit.shirt);

/**
 * Two looks read as different Glitches: different hair style (or hat), a
 * different top, and a different skin or hair colour.
 */
export function looksDistinct(a, b) {
  if (!a || !b) return true;
  const head = (f) => `${f.outfit.hair || ''}/${f.outfit.hat && f.outfit.hat !== 'none' ? f.outfit.hat : ''}`;
  if (head(a) === head(b)) return false;
  if (topOf(a) === topOf(b)) return false;
  return a.skinColor !== b.skinColor || a.hairColor !== b.hairColor;
}

/**
 * One NPC look: randomVectorFields with the given seed, top steered to
 * `color`, rerolled (seed + n) until it has no skipped article and is
 * distinct from every look in `avoid`. Returns { fields, seed, attempts }.
 */
export function npcLookFields(catalog, { seed = NPC_GLITCH_SEED, color = null, avoid = [] } = {}) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const s = (seed + attempt * 0x9e3779b1) >>> 0;
    const rng = mulberry32(s);
    const fields = randomVectorFields(catalog, rng);
    if (color) steerTop(fields, catalog, color, rng);
    if (hasSkippedArticle(fields)) continue;
    if (!avoid.every((other) => looksDistinct(fields, other))) continue;
    return { fields, seed: s, attempts: attempt + 1 };
  }
  throw new Error('npcLookFields: no distinct look in 200 draws');
}

/** The player's default look as fields (the first look every NPC avoids). */
function defaultFields(catalog) {
  const d = catalog?.defaultLook || {};
  return { outfit: { ...(d.outfit || {}) }, skinColor: d.skinColor, hairColor: d.hairColor };
}

/**
 * Every roster look, in roster order, each distinct from the player's
 * default and the ones before it: [{ id, name, color, seed, attempts, fields }].
 */
export function buildNpcLooks(catalog, roster = NPC_GLITCH_ROSTER) {
  const avoid = [defaultFields(catalog)];
  return roster.map((entry) => {
    const look = npcLookFields(catalog, { seed: nameSeed(entry.name), color: entry.color, avoid });
    avoid.push(look.fields);
    return { id: entry.id, name: entry.name, color: entry.color, seed: look.seed, attempts: look.attempts, fields: look.fields };
  });
}

/**
 * The roster id for a name: its own look when named, else a stable pick
 * from the roster by the name's hash (any future unnamed Glitch).
 */
export function npcIdFor(name, roster = NPC_GLITCH_ROSTER) {
  const hit = roster.find((r) => r.name === name || r.id === name);
  if (hit) return hit.id;
  return roster[nameSeed(name) % roster.length].id;
}

/**
 * Per-Glitch idle timing so a group never idles in step: where in the
 * idle4 loop it starts (a frame offset), how long it stands before its first
 * random idle, and the random-idle wait after that (all from the name).
 */
export function npcIdleTiming(name, salt = 0, { loopFrames = 51, waitMs = 15000 } = {}) {
  const rng = mulberry32((nameSeed(name) + Math.imul(salt + 1, 0x85ebca6b)) >>> 0);
  return {
    loopOffset: Math.floor(rng() * loopFrames),
    firstWaitMs: Math.round(waitMs * (0.35 + rng() * 0.9)),
    waitMs: Math.round(waitMs * (0.8 + rng() * 0.6)),
  };
}
