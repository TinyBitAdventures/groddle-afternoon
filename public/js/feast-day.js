/**
 * Thanksgiving Day's feast (G1009, Austin 2026-11-18): pure rules. The world side is
 * js/features/feast-day-feature.js; online the server owns the piles (groddle-afternoon-server
 * feast_day.go, whose numbers these mirror), solo the player's own save does, from their own table.
 *
 * Ours (inventions register: feast-day-piles): Glitch never ran a Thanksgiving event. It leans on
 * Glitch where it can:
 *  - On Thanksgiving Day (00:00-23:59 on Ur's clock, js/seasons.js urDate; the day Pot Luck Day's
 *    window is built around) the week's Harvest Table food spills over Groddle Forest Junction as
 *    piles eaten where they lie, as Hell One's grapes are squished where they lie (hell.js): never
 *    picked up, never in a pack.
 *  - Each pile is one food with 3 bites (one laid dish or crop's worth), drawn as the food's own
 *    put-down art for that count (js/world-art.js: a stack plays the scene named by its count), so
 *    the bites show without a number.
 *  - An emptied spot is laid again 20 s later, its food drawn from the week's lays weighted by what
 *    is left of each, as a Glitch spawner refills (items/spawner.js 23-31, 163-174).
 *  - A bite is the food's own eat (energy, mood, fullness, variety iMG: include/food.js), refused at
 *    full energy as any food is (food.js 126-128), 11 bites a player for the day.
 *  - A thin week (under 20 dishes laid) is topped up to 20 by Pot with his own harvest dishes; 16 of
 *    them lie out at once (one per spot), the rest as spots empty.
 *  - At midnight the leftovers are packed away; the table stays until Pot Luck Day ends.
 */

import { potLuckWindow, urDate } from './seasons.js?v=5d8f545a';
import { HARVEST_DISHES } from './pot-luck-feast.js?v=971888be';

export const FEAST_DAY_ID = 'feast_day';
export const FEAST_PILE_CLASS = 'feast_day_pile';

export const FEAST_DAY_RULES = Object.freeze({
  /** Piles on the street at once: one per spot (G1015a: 16 fit clear of the street tree's trunk). */
  piles: 16,
  /** A thin week is topped up to this many dishes by Pot (G1009: 20 dishes' worth). */
  potDishes: 20,
  /** Bites in a pile: one laid dish or crop's worth. */
  bites: 3,
  /** Bites a player may eat on the day. */
  cap: 11,
  /** An emptied spot is laid again this long after. */
  refillMs: 20_000,
  /**
   * Where the piles lie, the street's source x, as runs [from, to, spots]: right of the Harvest
   * Table (its right end ~202), either side of the spice tree's trunk (x 422; G1015a) and clear of
   * the shrine (online its foot at 789, its base 118 px wide from 730 to 848; solo the Hardware
   * Vendor stands about there). Each run keeps the widest pile (PILE_HALF each side) PILE_MARGIN
   * clear of the trunk (396-464: game.js draws this tree mirrored at 0.84, so its trunk leans right
   * of x 422) and of the shrine's base: the last pile, at 700, overlapped the shrine's base by up to
   * 15 px and the first right of the tree, at 490, its trunk.
   */
  runs: Object.freeze([Object.freeze([230, 344, 7]), Object.freeze([515, 678, 9])]),
});

/** Half the widest pile's art (a three-bite Sno Cone, 89 px; corn 79), for the spots' clearance. */
export const PILE_HALF = 45;
/** The gap kept between the widest pile and a fixture (the tree's trunk, the shrine, a signpost, the door). */
export const PILE_MARGIN = 6;

/** Each spot's source x, each run evenly from its `from` to its `to` (feast_day.go feastDaySpots, the same rounding). */
export const FEAST_SPOTS = Object.freeze(FEAST_DAY_RULES.runs.flatMap(([from, to, spots]) => Array.from({ length: spots }, (_, i) => {
  const n = spots - 1;
  return from + Math.floor((i * (to - from) + Math.floor(n / 2)) / n);
})));

export const FEAST_DAY_LINES = Object.freeze({
  verb: 'Eat',
  verbTip: 'Eat a bite of the feast, right here',
  /** #748: any item's own verb (a herb's Munch): "Munch a bite of the feast, right here". */
  tip: (verb) => `${String(verb || 'Eat')} a bite of the feast, right here`,
  /** A drink laid on the table is drunk, as Glitch's drinks are (include/drink.js verbs.drink; #723). */
  drinkVerb: 'Drink',
  drinkTip: 'Drink a sip of the feast, right here',
  subtitle: (left) => `Thanksgiving feast · ${servingsText(left)}`,
  tableServings: (left) => servingsText(left),
  bitesLeft: (n) => `${n} of your ${FEAST_DAY_RULES.cap} feast bites left today`,
  notHere: 'The feast is in Groddle Forest Junction.',
  noSeason: 'The feast is only on Thanksgiving Day.',
  full: 'You have had all 11 of your feast bites today. Pot says save room for next year.',
  gone: 'Too slow! Somebody else ate that bite.',
  slow: 'Slow down a little.',
  offline: 'The feast can’t be reached just now. Try again in a moment.',
  packed: 'Thanksgiving Day is over. Pot has packed the leftovers away.',
});

export function servingsText(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return `${v} ${v === 1 ? 'serving' : 'servings'} left`;
}

/** The day of November Thanksgiving falls on in year y (Pot Luck Day's window is built around it). */
export function thanksgivingDay(y) {
  return potLuckWindow(y).from[1] + 4;
}

/** The feast's key on Ur's calendar at `now` ("feast_day:2026"), or '' on any other day. */
export function feastDayKey(now = Date.now()) {
  const t = urDate(now);
  return t.m === 11 && t.d === thanksgivingDay(t.y) ? `${FEAST_DAY_ID}:${t.y}` : '';
}

/* -------------------------------------------------------------- the pool */

const clean = (o) => {
  const out = {};
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    for (const [c, n] of Object.entries(o)) {
      const v = Math.floor(Number(n));
      if (c && v > 0) out[c] = v;
    }
  }
  return out;
};

/**
 * A feast: { key, piles: [{ s, n, c, b }] (b 0: empty), placed, pot, ate, serial, refill: { <s>: at } }.
 * A saved one from another day is packed away by settleFeastDay.
 */
export function createFeastDayState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const piles = [];
  for (let i = 0; i < FEAST_DAY_RULES.piles; i += 1) piles.push({ s: i, n: 0, c: '', b: 0 });
  let serial = Math.max(0, Math.floor(Number(s.serial) || 0));
  for (const p of Array.isArray(s.piles) ? s.piles : []) {
    const i = Math.floor(Number(p?.s));
    const b = Math.floor(Number(p?.b));
    if (i >= 0 && i < FEAST_DAY_RULES.piles && b > 0 && b <= FEAST_DAY_RULES.bites && typeof p.c === 'string' && p.c) {
      piles[i] = { s: i, n: Math.floor(Number(p.n)) || 0, c: p.c, b };
      serial = Math.max(serial, piles[i].n);
    }
  }
  const refill = {};
  for (const [k, at] of Object.entries(clean(s.refill))) if (Number(k) >= 0 && Number(k) < FEAST_DAY_RULES.piles) refill[k] = at;
  const state = {
    key: typeof s.key === 'string' ? s.key : '',
    piles,
    placed: clean(s.placed),
    pot: clean(s.pot),
    ate: Math.max(0, Math.min(FEAST_DAY_RULES.cap, Math.floor(Number(s.ate) || 0))),
    serial,
    refill,
  };
  return state;
}

/** What is left to put out of each class: the week's lays (`counts`) and Pot's, less what went out. */
export function remaining(state, counts = {}) {
  const out = {};
  for (const [c, n] of Object.entries(clean(counts))) out[c] = (out[c] || 0) + n;
  for (const [c, n] of Object.entries(state?.pot || {})) out[c] = (out[c] || 0) + n;
  for (const c of Object.keys(out)) {
    const left = out[c] - (state?.placed?.[c] || 0);
    if (left > 0) out[c] = left;
    else delete out[c];
  }
  return out;
}

/** Servings (bites) still to eat: the piles' bites, and 3 for every dish still to come. */
export function servingsLeft(state, counts = {}) {
  let n = 0;
  for (const p of state?.piles || []) n += p.b || 0;
  for (const v of Object.values(remaining(state, counts))) n += v * FEAST_DAY_RULES.bites;
  return n;
}

/** The next class, weighted by what is left of each (sorted keys, as feast_day.go draw), or ''. */
export function drawClass(state, counts = {}, roll = Math.random) {
  const rem = remaining(state, counts);
  const keys = Object.keys(rem).sort();
  const total = keys.reduce((a, c) => a + rem[c], 0);
  if (!total) return '';
  let pick = Math.floor(roll() * total);
  for (const c of keys) {
    if (pick < rem[c]) return c;
    pick -= rem[c];
  }
  return keys[keys.length - 1];
}

/** Lay a new pile on spot s; false when nothing is left to put there. */
export function layPile(state, s, counts = {}, roll = Math.random) {
  const c = drawClass(state, counts, roll);
  if (!c) return false;
  state.serial += 1;
  state.placed[c] = (state.placed[c] || 0) + 1;
  state.piles[s] = { s, n: state.serial, c, b: FEAST_DAY_RULES.bites };
  delete state.refill[s];
  return true;
}

/**
 * Bring the feast to the calendar's `key`: a new day lays it out (Pot's top-up for a thin week, then
 * every spot), any other day packs it away. Returns 'started' | 'packed' | ''.
 */
export function settleFeastDay(state, key, counts = {}, roll = Math.random) {
  if (state.key === key) return '';
  const had = Boolean(state.key);
  Object.assign(state, createFeastDayState(), { key });
  if (!key) return had ? 'packed' : '';
  const total = Object.values(clean(counts)).reduce((a, n) => a + n, 0);
  for (let i = 0; total + i < FEAST_DAY_RULES.potDishes; i += 1) {
    const c = HARVEST_DISHES[i % HARVEST_DISHES.length];
    state.pot[c] = (state.pot[c] || 0) + 1;
  }
  for (let s = 0; s < FEAST_DAY_RULES.piles; s += 1) layPile(state, s, counts, roll);
  return 'started';
}

/**
 * One bite of spot s (pile serial n), solo: the checks feast_day.go makes, in its order (the day,
 * the player's cap, a pile still there). { ok, code, msg, pile, left, ate }.
 */
export function biteSolo(state, s, n, counts = {}, now = Date.now()) {
  if (!state?.key) return { ok: false, code: 'no_season', msg: FEAST_DAY_LINES.noSeason };
  if (state.ate >= FEAST_DAY_RULES.cap) return { ok: false, code: 'full', msg: FEAST_DAY_LINES.full };
  const p = state.piles[s];
  if (!p || p.b <= 0 || p.n !== n) return { ok: false, code: 'gone', msg: FEAST_DAY_LINES.gone };
  p.b -= 1;
  state.ate += 1;
  const pile = { ...p };
  if (p.b === 0) {
    state.piles[s] = { s, n: p.n, c: '', b: 0 };
    if (Object.keys(remaining(state, counts)).length) state.refill[s] = now + FEAST_DAY_RULES.refillMs;
  }
  return { ok: true, pile, left: servingsLeft(state, counts), ate: state.ate };
}

/** Lay every spot whose refill is due (solo). Returns the spots laid. */
export function refillDue(state, counts = {}, now = Date.now(), roll = Math.random) {
  const out = [];
  // A spot the pool had left empty waits 20 s again once a new lay gives it something (feast_day.go laid).
  if (Object.keys(remaining(state, counts)).length) {
    for (const p of state?.piles || []) if (!(p.b > 0) && state.refill[p.s] == null) state.refill[p.s] = now + FEAST_DAY_RULES.refillMs;
  }
  for (const [k, at] of Object.entries(state?.refill || {})) {
    if (now < at) continue;
    const s = Number(k);
    if (state.piles[s]?.b > 0 || !layPile(state, s, counts, roll)) delete state.refill[k];
    else out.push(s);
  }
  return out;
}
