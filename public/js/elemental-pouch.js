/**
 * The Elemental Pouch (G83): rules only, no DOM or Pixi.
 *
 * Source: glitch-GameServerJS items/bag_elemental_pouch.js (CC0).
 *  - The item: label/description/base_cost 50/stackmax 1, tags bag + no_rube
 *    (lines 3-16, 748-751). Sold by the Hardware (56), Alchemical Goods (54),
 *    Tool (53) and Mining (75) Vendors: items/catalog_stores.js 117, 515,
 *    683, 1333 (build-stores.mjs keeps it; other bags stay out).
 *  - Picking one up off the ground needs Element Handling: canPickup 661-667,
 *    "You need to know Element Handling to pick this up."
 *  - Shake (verbs.shake 53-114): shown only with Elemental Shake
 *    (element_handling_bonus_1) or Super Elemental Shake
 *    (element_handling_bonus_2); once a day through the daily counter
 *    'elemental_shake' (players/inc_stats.js 1131-1140, cleared by
 *    doNewDay in players/player.js 1052); disabled "You already Shook your
 *    Elements today." / "There's nothing to shake.". doShake (669-690) runs
 *    blue, red, green, shiny in that order; each draws its own delta with
 *    choose_one (common.js 363: choices[randInt(0, n-1)]): bonus_2 one of
 *    0.08/0.09/0.10/0.11/0.12, else bonus_1 one of 0.04/0.05/0.06; bonus =
 *    Math.round(count * delta), and what the pouch cannot hold is thrown
 *    away. The counter is only set when something was made.
 *  - The pouch holds elements only, one 5000-stack per element (canContain
 *    651-659 with element_*.js stackmax 5000; onCreate capacity 4).
 *  - Rename (bag_generic verbs.rename 538-585, onInputBoxResponse 723-729):
 *    "My new name:", 32 characters of A-Z a-z 0-9 and space.
 *
 * Remake adaptation: the pack has no bag slots, so the pouch is a pack item
 * and the four element stacks in the pack are its contents. Shake reads and
 * adds to those stacks, and the 5000 per element limit is the pouch being
 * full. One name covers every pouch you carry (they share a pack slot).
 * Sort/Magic Sort/Stack Up are bag interface verbs behind the `interface`
 * cards (imagination-remake.js) and stay out.
 */

export const POUCH_CLASS = 'bag_elemental_pouch';
export const POUCH_SKILL = 'elementhandling_1';
export const SHAKE_COUNTER = 'elemental_shake';
export const SHAKE_CARD_1 = 'element_handling_bonus_1';
export const SHAKE_CARD_2 = 'element_handling_bonus_2';

/** items/bag_elemental_pouch.js 3-16 and 748-751. */
export const POUCH_ITEM = Object.freeze({
  label: 'Elemental Pouch',
  namePlural: 'Elemental Pouches',
  desc: 'An essential elemental pouch. You need it for carrying alchemical elements. What, you thought you could carry them in your HANDS? Requires Element Handling skill.',
  baseCost: 50,
  stackMax: 1,
  tags: ['bag', 'no_rube'],
});

/** verbs.shake handler 80-83: the order the four doShake calls run in. */
export const POUCH_ELEMENTS = Object.freeze([
  { classTsid: 'element_blue', single: 'Blue Element', plural: 'Blue Elements' },
  { classTsid: 'element_red', single: 'Red Element', plural: 'Red Elements' },
  { classTsid: 'element_green', single: 'Green Element', plural: 'Green Elements' },
  { classTsid: 'element_shiny', single: 'Shiny Element', plural: 'Shiny Elements' },
]);

/** items/element_*.js stackmax: what the pouch's one slot per element holds (canContain 651-659). */
export const ELEMENT_STACKMAX = 5000;

/** doShake 672-676. */
export const SHAKE_DELTAS = Object.freeze({
  [SHAKE_CARD_2]: Object.freeze([0.08, 0.09, 0.1, 0.11, 0.12]),
  [SHAKE_CARD_1]: Object.freeze([0.04, 0.05, 0.06]),
});

export const SHAKE_COPY = Object.freeze({
  tooltip: 'Shake up your Elements',
  already: 'You already Shook your Elements today.',
  empty: "There's nothing to shake.",
  full: 'You shook your pouch but it was too full to create any more elements.',
  made: (text) => `You shook your pouch and created an additional ${text}.`,
});

export const PICKUP_BLOCKED = 'You need to know Element Handling to pick this up.';
export const RENAME_COPY = Object.freeze({ tooltip: 'Give me a new name', title: 'Name Me!', label: 'My new name:' });

const asList = (value) => (Array.isArray(value) ? value : value instanceof Set ? [...value] : []);
const countOf = (inv, classTsid) => Math.max(0, Math.floor(Number(inv?.[classTsid]) || 0));

/** @param {object} [seed] */
export function createPouchState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  return {
    version: 1,
    // stats daily counter 'elemental_shake': the game day it was set on.
    shakeDay: typeof s.shakeDay === 'string' ? s.shakeDay : '',
    shakes: Math.max(0, Math.floor(Number(s.shakes) || 0)),
    name: normalizePouchName(s.name),
  };
}

export function hasPouch(inv) {
  return countOf(inv, POUCH_CLASS) > 0;
}

/** The delta table doShake uses, or null (no card: the verb is hidden). */
export function shakeDeltas(upgrades = []) {
  const owned = new Set(asList(upgrades));
  if (owned.has(SHAKE_CARD_2)) return SHAKE_DELTAS[SHAKE_CARD_2];
  if (owned.has(SHAKE_CARD_1)) return SHAKE_DELTAS[SHAKE_CARD_1];
  return null;
}

/** countContents(): every element in the pouch (the pack's element stacks). */
export function pouchContents(inv) {
  return POUCH_ELEMENTS.reduce((n, el) => n + countOf(inv, el.classTsid), 0);
}

/** stats_get_daily_counter('elemental_shake') for this game day. */
export function shookToday(state, dayKey) {
  return Boolean(dayKey) && state?.shakeDay === dayKey;
}

/**
 * verbs.shake conditions (64-77): null hides the verb, else { ok, msg }.
 * @param {ReturnType<typeof createPouchState>} state
 * @param {Record<string, number>} inv
 * @param {string[]} upgrades
 * @param {string} dayKey
 */
export function shakeCheck(state, inv, upgrades, dayKey) {
  if (!shakeDeltas(upgrades)) return null;
  if (shookToday(state, dayKey)) return { ok: false, msg: SHAKE_COPY.already };
  if (!pouchContents(inv)) return { ok: false, msg: SHAKE_COPY.empty };
  return { ok: true, msg: '' };
}

/** choose_one (common.js 363) with an injectable rng for tests and QA. */
export function chooseOne(choices, rng = Math.random) {
  const r = Math.min(0.999999, Math.max(0, Number(rng()) || 0));
  return choices[Math.floor(r * choices.length)];
}

/**
 * doShake (669-690) for one element: bonus = round(count * delta), added up to
 * what the pouch slot still holds. Returns how many were made.
 */
export function shakeElement(inv, classTsid, delta) {
  if (!delta) return 0;
  const count = countOf(inv, classTsid);
  const bonus = Math.round(count * delta);
  const room = Math.max(0, ELEMENT_STACKMAX - count);
  const added = Math.min(bonus, room);
  if (added > 0) inv[classTsid] = count + added;
  return added;
}

/** The handler's "1 Blue Element, 3 Red Elements and 2 Shiny Elements" list (85-106). */
export function elementChangeText(changes) {
  let text = '';
  changes.forEach((c, i) => {
    if (i > 0) text += i < changes.length - 1 ? ', ' : ' and ';
    text += `${c.count} ${c.name}`;
  });
  return text;
}

/**
 * Run the Shake verb. Mutates inv and state; returns { ok, msg, made, deltas }.
 * @param {{ rng?: () => number }} [opts]
 */
export function shakePouch(state, inv, upgrades, dayKey, opts = {}) {
  const check = shakeCheck(state, inv, upgrades, dayKey);
  if (!check) return { ok: false, hidden: true, msg: '', made: {}, deltas: {} };
  if (!check.ok) return { ok: false, msg: check.msg, made: {}, deltas: {} };
  const table = shakeDeltas(upgrades);
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const made = {};
  const deltas = {};
  const changes = [];
  for (const el of POUCH_ELEMENTS) {
    const delta = chooseOne(table, rng);
    deltas[el.classTsid] = delta;
    const n = shakeElement(inv, el.classTsid, delta);
    made[el.classTsid] = n;
    if (n === 1) changes.push({ name: el.single, count: 1 });
    if (n > 1) changes.push({ name: el.plural, count: n });
  }
  if (!changes.length) return { ok: true, full: true, msg: SHAKE_COPY.full, made, deltas };
  state.shakeDay = dayKey;
  state.shakes += 1;
  return { ok: true, full: false, msg: SHAKE_COPY.made(elementChangeText(changes)), made, deltas };
}

/** canPickup (661-667): a pouch on the ground needs Element Handling. */
export function pouchPickupCheck(learned = []) {
  return asList(learned).includes(POUCH_SKILL) ? { ok: true, msg: '' } : { ok: false, msg: PICKUP_BLOCKED };
}

/** onInputBoxResponse (723-729): first 32 characters, letters, digits and spaces only. */
export function normalizePouchName(value) {
  return value ? String(value).substr(0, 32).replace(/[^a-z0-9 ]/gi, '') : '';
}

/** getLabel (715-721): the player's name for it, else the item label. */
export function pouchLabel(state) {
  return state?.name && state.name.trim() ? state.name : POUCH_ITEM.label;
}
