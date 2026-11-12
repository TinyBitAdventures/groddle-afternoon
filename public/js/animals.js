/**
 * Stateful Animal Kinship loops inspired by Tiny Speck's npc_animal handlers.
 * Animals remember today's care, expose pack-backed feed choices, and reset on
 * the four-real-hour Groddle game day.
 */

import {
  ensureAnimalKinshipState,
  resetAnimalKinshipDay,
} from './animal-kinship.js?v=ffe074b2';
import {
  BABY_ANIMALS,
  babyFoodOptions,
  feedPiggyStack,
  incubationEggOptions,
  isFoodItem,
  itemLabel,
  itemStackMax,
} from './animal-husbandry.js?v=3017f786';
import { ensurePiggyMood, piggyMoodLabel } from './animal-mood.js?v=a49495fc';

export const ANIMAL_CLASS_IDS = Object.freeze([
  'npc_piggy',
  'npc_chicken',
  'npc_butterfly',
]);

/**
 * Where each walking animal's sheet puts the animal in its cell (the x of its anchor, 0..1), so a
 * sprite turned round by scale.x -1 turns on the spot. In the original the item's x is the art's
 * registration point under the animal and the client mirrors the art about it. Tiny Speck's
 * Chicken sheets (npc_chicken__x1_walk, pecking_once, sit: 148 x 110 cells, the same for every
 * state) were cut with the bird about 27 px right of the cell's middle: its body spans 75-131 px,
 * 101 px across the walk frames on average. Anchored at the middle (0.5), each turn mirrored the
 * bird about a point 27 px behind it and it hopped 38 px at its drawn scale (lane CHICKWALK,
 * Austin 2026-11-01: "They move left and then snap back to the middle walking right"). The Piggy
 * walk (88 x 62), the Butterfly's fly-side (70 x 65) and the Batterfly's profile (111 x 96) sheets
 * are centred in their cells (within 1.5 px), so they keep 0.5.
 */
export const ANIMAL_ANCHOR_X = Object.freeze({ npc_chicken: 101 / 148 });

/** The anchor x a walking animal's sprite takes (ANIMAL_ANCHOR_X; 0.5 for the rest). */
export function animalAnchorX(classId) {
  return ANIMAL_ANCHOR_X[classId] ?? 0.5;
}

/**
 * G583: where each walking animal's feet are in its sheet's cell (the anchor y, 0..1). The original
 * drew an NPC with its art's registration point (its feet) at the item's y, the platform line. Tiny
 * Speck's Chicken cells (148 x 110, every state) keep 13 empty rows under the bird's feet (walk and
 * the idle1 stand: lowest solid row 96; pecking_once 97), so anchored on the cell's bottom it stood
 * 13 px x its 0.70 scale above the line (Guillermo Gamera Way's arch landing, 2026-11-08). The
 * Piggy's walk keeps 1 to 3 rows (the +2 every walker is set down by covers it), so the rest keep 1.
 */
export const ANIMAL_ANCHOR_Y = Object.freeze({ npc_chicken: 97 / 110 });

/** The anchor y a walking animal's sprite takes on the ground (ANIMAL_ANCHOR_Y; 1 for the rest). */
export function animalAnchorY(classId) {
  return ANIMAL_ANCHOR_Y[classId] ?? 1;
}

const FEED_CATALOG = Object.freeze({
  npc_piggy: Object.freeze({
    apple: { label: 'Apple', nutrition: 2 },
    cherry: { label: 'Cherry', nutrition: 2 },
    grain: { label: 'Grain', nutrition: 1 },
    orange: { label: 'Orange', nutrition: 3 },
    lemon: { label: 'Lemon', nutrition: 2 },
    plum: { label: 'Plum', nutrition: 2 },
    spinach: { label: 'Spinach', nutrition: 2 },
    carrot: { label: 'Carrot', nutrition: 2 },
    corn: { label: 'Corn', nutrition: 3 },
    potato: { label: 'Potato', nutrition: 2 },
    bun: { label: 'Bun', nutrition: 4 },
    sammich: { label: 'Sammich', nutrition: 6 },
  }),
  // npc_chicken.js has no feed verb (G280, 3c6c2f47 dropped it): no chicken entry (G290).
  npc_butterfly: Object.freeze({}),
});

function defaultsFor(classId) {
  if (classId === 'npc_piggy') {
    return { petted: false, nibbled: false, fed: false, hunger: 1, petCount: 0, nibbleCount: 0, feedCount: 0 };
  }
  if (classId === 'npc_chicken') {
    // G282: no `buttered` flag: butter up has no daily limit (npc_chicken.js 163-236); js/animal-flattery.js counts butteredUp.
    return { squeezedToday: 0, squeezed: 0, fed: false, hunger: 1, feedCount: 0 };
  }
  if (classId === 'npc_butterfly') {
    return {
      massaged: false,
      milked: false,
      massageUsesToday: 0,
      milkUsesToday: 0,
      massageCount: 0,
      milkCount: 0,
    };
  }
  return {};
}

/** Fill missing fields without discarding an existing animal's state. */
export function ensureAnimalState(classId, state = {}) {
  const defaults = defaultsFor(classId);
  for (const [key, value] of Object.entries(defaults)) {
    if (state[key] === undefined) state[key] = value;
  }
  ensureAnimalKinshipState(classId, state);
  // Mood 0..2 and the twice-daily hunger clock (js/animal-mood.js).
  if (classId === 'npc_piggy') ensurePiggyMood(state);
  return state;
}

export function createAnimalState(classId, seed = {}) {
  return ensureAnimalState(classId, { ...seed });
}

/** Classes whose Feed (or Deposit) eats any `is_food` item (npc_animal, npc_batterfly, piggy_feeder). */
const ANY_FOOD_CLASSES = new Set(['npc_piggy', 'npc_batterfly', 'piggy_feeder']);

/** Pack foods this animal will accept, in a stable player-friendly order. */
export function listAnimalFeedOptions(classId, inv = {}) {
  if (BABY_ANIMALS[classId]) return babyFoodOptions(classId, inv);
  const catalog = FEED_CATALOG[classId] || {};
  const known = Object.entries(catalog)
    .filter(([classTsid]) => (inv[classTsid] || 0) > 0)
    .map(([classTsid, meta]) => ({
      classTsid,
      label: meta.label,
      nutrition: meta.nutrition,
      have: inv[classTsid] || 0,
    }));
  if (!ANY_FOOD_CLASSES.has(classId)) return known;
  // The source feeds any food (include/food.js is_food): the familiar list
  // first, then every other food in the pack alphabetically.
  const extra = Object.keys(inv || {})
    .filter((classTsid) => !catalog[classTsid] && (inv[classTsid] || 0) > 0 && isFoodItem(classTsid))
    .sort()
    .map((classTsid) => ({ classTsid, label: itemLabel(classTsid), nutrition: 0, have: inv[classTsid] || 0 }));
  return [...known, ...extra];
}

/** Does this target-item verb also ask how many (requires_target_item_count)? */
export function pickerTakesCount(classId, verbId = 'feed') {
  if (verbId === 'deposit') return classId === 'piggy_feeder';
  return verbId === 'feed' && (classId === 'npc_piggy' || classId === 'npc_batterfly');
}

/** Most you can give at once: one stack (npc_animal feed) and what you hold. */
export function pickerMaxCount(classId, classTsid, inv = {}) {
  const have = Math.max(0, inv?.[classTsid] || 0);
  return classId === 'npc_piggy' ? Math.min(have, itemStackMax(classTsid)) : have;
}

/** Choices for a target-item verb: Feed, Request incubation, Deposit. */
export function pickerOptionsFor(classId, verbId, inv = {}) {
  if (verbId === 'incubate') return incubationEggOptions(inv);
  if (verbId === 'deposit') return listAnimalFeedOptions('piggy_feeder', inv);
  return listAnimalFeedOptions(classId, inv);
}

/** Consume the selected food (one, or up to a stack for a Piggy) and update care state. */
export function feedAnimal(classId, state, inv, classTsid, count = 1) {
  const catalog = FEED_CATALOG[classId] || {};
  const food = catalog[classTsid] || (classId === 'npc_piggy' && isFoodItem(classTsid)
    ? { label: itemLabel(classTsid), nutrition: 0 }
    : null);
  if (!food) return { ok: false, reason: 'not_food', msg: "That animal doesn't want to eat that." };
  if ((inv?.[classTsid] || 0) < 1) return { ok: false, reason: 'missing', msg: `You have no ${food.label}.` };
  const s = ensureAnimalState(classId, state || {});
  if (classId === 'npc_piggy') {
    const n = Math.max(1, Math.min(Math.floor(Number(count) || 1), pickerMaxCount(classId, classTsid, inv)));
    inv[classTsid] -= n;
    const fed = feedPiggyStack(s, classTsid, n);
    s.fed = true;
    s.feedCount = (s.feedCount || 0) + 1;
    s.lastFed = classTsid;
    return { ok: true, classTsid, label: food.label, nutrition: food.nutrition, count: fed.count, xp: fed.xp, plops: fed.plops, msg: fed.msg };
  }
  inv[classTsid] -= 1;
  s.fed = true;
  s.hunger = 0;
  s.feedCount = (s.feedCount || 0) + 1;
  s.lastFed = classTsid;
  return { ok: true, classTsid, label: food.label, nutrition: food.nutrition, count: 1 };
}

/** Reset per-game-day limits while retaining lifetime counters. */
export function resetAnimalDay(classId, state) {
  const s = ensureAnimalState(classId, state || {});
  resetAnimalKinshipDay(classId, s);
  if (classId === 'npc_piggy') {
    // Hunger and mood move on the piggy's own twice-daily tick (js/animal-mood.js).
    s.fed = false;
    delete s.lastFed;
  } else if (classId === 'npc_chicken') {
    delete s.buttered; // G282: an old save's unused flag
    s.fed = false;
    s.hunger = Math.min(3, (s.hunger || 0) + 1);
    delete s.lastFed;
  } else if (classId === 'npc_butterfly') {
    // Exact daily counters/legacy booleans are reset by resetAnimalKinshipDay.
  }
  return s;
}

/** Short world-label feedback for the animal's current care state. */
export function animalStatusLabel(classId, state = {}) {
  const s = ensureAnimalState(classId, state);
  if (classId === 'npc_piggy') {
    const mood = piggyMoodLabel(s);
    if (mood) return mood;
    if (s.nibbleUsesToday) return `Nibbled ${s.nibbleUsesToday}× today · feeling philosophical`;
    if (s.petted && s.fed) return 'Fed and loved · ready for a nibble';
    if (s.petUsesToday) return `Petted ${s.petUsesToday}× today · ready for a nibble`;
    if (s.fed) return 'Well fed · wants a little love';
    return s.hunger >= 2 ? 'Hungry · pet before nibbling' : 'Happy little porcine · pet before nibbling';
  }
  if (classId === 'npc_chicken') {
    if (s.squeezeUsesToday) return `Squeezed ${s.squeezeUsesToday}× today · still suspicious`;
    if (s.fed) return 'Well fed · grain still available';
    return 'Bok · squeeze for grain';
  }
  if (classId === 'npc_butterfly') {
    if (s.milkUsesToday) return `Milked ${s.milkUsesToday}× today · resting in higher planes`;
    if (s.massageUsesToday) return `Massaged ${s.massageUsesToday}× today · ready for milking`;
    return 'Milk can fly · massage first';
  }
  return '';
}
