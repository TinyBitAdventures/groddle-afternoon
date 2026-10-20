/**
 * Stateful Animal Kinship loops inspired by Tiny Speck's npc_animal handlers.
 * Animals remember today's care, expose pack-backed feed choices, and reset on
 * the four-real-hour Groddle game day.
 */

import {
  ensureAnimalKinshipState,
  resetAnimalKinshipDay,
} from './animal-kinship.js?v=butterfly-care-1';

export const ANIMAL_CLASS_IDS = Object.freeze([
  'npc_piggy',
  'npc_chicken',
  'npc_butterfly',
]);

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
  npc_chicken: Object.freeze({
    grain: { label: 'Grain', nutrition: 2 },
    corn: { label: 'Corn', nutrition: 3 },
  }),
  npc_butterfly: Object.freeze({}),
});

function defaultsFor(classId) {
  if (classId === 'npc_piggy') {
    return { petted: false, nibbled: false, fed: false, hunger: 1, petCount: 0, nibbleCount: 0, feedCount: 0 };
  }
  if (classId === 'npc_chicken') {
    return { squeezedToday: 0, squeezed: 0, buttered: false, fed: false, hunger: 1, feedCount: 0 };
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
  return state;
}

export function createAnimalState(classId, seed = {}) {
  return ensureAnimalState(classId, { ...seed });
}

/** Pack foods this animal will accept, in a stable player-friendly order. */
export function listAnimalFeedOptions(classId, inv = {}) {
  const catalog = FEED_CATALOG[classId] || {};
  return Object.entries(catalog)
    .filter(([classTsid]) => (inv[classTsid] || 0) > 0)
    .map(([classTsid, meta]) => ({
      classTsid,
      label: meta.label,
      nutrition: meta.nutrition,
      have: inv[classTsid] || 0,
    }));
}

/** Consume one selected food and update the animal's daily care state. */
export function feedAnimal(classId, state, inv, classTsid) {
  const catalog = FEED_CATALOG[classId] || {};
  const food = catalog[classTsid];
  if (!food) return { ok: false, reason: 'not_food', msg: "That animal doesn't want to eat that." };
  if ((inv?.[classTsid] || 0) < 1) return { ok: false, reason: 'missing', msg: `You have no ${food.label}.` };
  const s = ensureAnimalState(classId, state || {});
  inv[classTsid] -= 1;
  s.fed = true;
  s.hunger = 0;
  s.feedCount = (s.feedCount || 0) + 1;
  s.lastFed = classTsid;
  return { ok: true, classTsid, label: food.label, nutrition: food.nutrition };
}

/** Reset per-game-day limits while retaining lifetime counters. */
export function resetAnimalDay(classId, state) {
  const s = ensureAnimalState(classId, state || {});
  resetAnimalKinshipDay(classId, s);
  if (classId === 'npc_piggy') {
    s.fed = false;
    s.hunger = Math.min(3, (s.hunger || 0) + 1);
    delete s.lastFed;
  } else if (classId === 'npc_chicken') {
    s.buttered = false;
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
