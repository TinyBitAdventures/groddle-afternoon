/**
 * Giant shrines, distilled from Tiny Speck's items/include/shrines.js.
 *
 * Official donation math:
 *   item base cost × count → 20% iMG, 10% mood, 10% Giant favor.
 * Favor and donation iMG are capped per game day. Reaching a Giant's favor
 * target lets the player claim an emblem; each later emblem costs 100 more.
 */

import { levelInfoForXp } from './progression.js?v=progression-1';
import {
  ITEM_CATALOG,
  addItem,
  ensureItem,
  isToolItem,
  removeItem,
} from './inventory.js?v=catalog-unified-3';
import {
  GAMESHOW_TICKET_ID,
  gameshowTicketChance,
} from './spinning-wheel.js?v=spinning-wheel-1';
import { moodMax } from './metabolics.js';

export const EMBLEM_FAVOR_COST = 1000;
export const EMBLEM_FAVOR_INCREMENT = 100;
/** The level-5 daily donation iMG cap; donationXpLimit(xp) gives the real one. */
export const DAILY_DONATION_XP_LIMIT = 250;

/**
 * stats_donation_xp_limit (inc_stats.js:1280): 250 to level 5, 500 to level
 * 10, then a share of the level's XP interval (20% at 11 easing to 10% at 31
 * and up), with level 60's value hard-coded.
 */
export function donationXpLimit(xp) {
  const info = levelInfoForXp(xp);
  let base;
  if (info.level <= 5) base = 250;
  else if (info.level <= 10) base = 500;
  else if (info.level <= 30) base = info.needed * (0.2 - (info.level - 11) * 0.005);
  else if (info.level === 60) base = 170894.8;
  else base = info.needed * 0.1;
  return Math.round(Math.max(0, base));
}

export const GIANTS = Object.freeze({
  alph: Object.freeze({
    id: 'alph', name: 'Alph', color: '#d88445',
    description: 'The giant of creation, and the likely authority on whether the chicken or the Egg Plant came first.',
  }),
  cosma: Object.freeze({
    id: 'cosma', name: 'Cosma', color: '#8ab9db',
    description: 'The giant who governs the sky, levity, meditation, and the extremely specialized art of herding butterflies.',
  }),
  friendly: Object.freeze({
    id: 'friendly', name: 'Friendly', color: '#7d77bd',
    description: 'The giant of all things celestial, nocturnal, lunar, stygian and murky, despite being famously nice about it.',
  }),
  grendaline: Object.freeze({
    id: 'grendaline', name: 'Grendaline', color: '#55aab5',
    description: 'The giant of clouds, fogs, streams, oceans, and, as a sideline, big fluffy towels.',
  }),
  humbaba: Object.freeze({
    id: 'humbaba', name: 'Humbaba', color: '#d27a75',
    description: 'The giant who rules every beast with an even-numbered quantity of legs.',
  }),
  lem: Object.freeze({
    id: 'lem', name: 'Lem', color: '#e0a743',
    description: 'The giant of travel and navigation, and an unrepentant practitioner of geographical practical jokes.',
  }),
  mab: Object.freeze({
    id: 'mab', name: 'Mab', color: '#8db85b',
    description: 'The giant who holds sway over the harvest and honors industriousness, right up until it turns into greed.',
  }),
  pot: Object.freeze({
    id: 'pot', name: 'Pot', color: '#d99057',
    description: 'The big-hearted giant who dispenses prosperity and good fortune, provided sloth stays out of the way.',
  }),
  spriggan: Object.freeze({
    id: 'spriggan', name: 'Spriggan', color: '#6e9b4d',
    description: 'The taciturn giant with sole dominion over trees. Trees are serious business, you know.',
  }),
  ti: Object.freeze({
    id: 'ti', name: 'Tii', color: '#879aa8',
    description: 'The overseer of elements, forever calculating and combining all matters alchemical.',
  }),
  zille: Object.freeze({
    id: 'zille', name: 'Zille', color: '#9b8064',
    description: 'The giant of mountains, hills, hillocks, pingos, drumlins, buttes, and nearly every other bump in the ground.',
  }),
});

const GIANT_IDS = Object.freeze(Object.keys(GIANTS));

/**
 * GSJS item `var base_cost` for the goods obtainable early, used only until
 * the recipe import registers every item's baseCost on ITEM_CATALOG
 * (making-items.json, the same source values). Several were wrong before
 * (bubble_tea 18 vs 172, fuel_cell 10 vs 380, metal_post 95 vs 400).
 */
export const SHRINE_ITEM_BASE_COSTS = Object.freeze({
  apple: 5,
  milk_butterfly: 8,
  butterfly_lotion: 10,
  grain: 1,
  plank: 5,
  cherry: 1,
  egg_plain: 5,
  bean_plain: 1,
  plain_bubble: 2,
  all_spice: 3,
  general_vapour: 5,
  meat: 10,
  flour: 7,
  pinch_of_salt: 2,
  bun: 9,
  sammich: 29,
  orange: 5,
  lemon: 5,
  plum: 3,
  spinach: 3,
  carrot: 6,
  corn: 6,
  potato: 7,
  tomato: 5,
  broccoli: 5,
  cabbage: 7,
  cucumber: 4,
  onion: 4,
  parsnip: 6,
  rice: 4,
  zucchini: 5,
  orange_juice: 39,
  lemon_juice: 39,
  fruity_juice: 24,
  bubble_tea: 172,
  fried_egg: 11,
  green_eggs: 12,
  metal_rock: 3,
  dullite: 4,
  beryl: 6,
  sparkly: 8,
  plain_metal: 30,
  tin: 50,
  copper: 70,
  molybdenum: 100,
  metal_rod: 100,
  metal_post: 400,
  fuel_cell: 380,
  musicblock_d_green_02: 400,
  musicblock_d_green_03: 500,
  musicblock_d_red_01: 400,
  musicblock_d_red_05: 700,
});

const GIANT_TIPS = Object.freeze([
  'Donating to a shrine earns favor with that Giant.',
  'The more valuable your donation, the more favor you earn.',
  'Favor can be turned into Giant emblems at a shrine.',
  'You can only earn so much favor with each Giant in a single game day.',
]);

function whole(value, fallback = 0, max = 999999999) {
  const number = Number(value);
  return Math.max(0, Math.min(max, Math.floor(Number.isFinite(number) ? number : fallback)));
}

function cleanCountMap(seed = {}, max = 999999999) {
  const out = {};
  for (const giant of GIANT_IDS) out[giant] = whole(seed?.[giant], 0, max);
  return out;
}

export function normalizeShrineState(seed = {}) {
  return {
    favor: cleanCountMap(seed?.favor),
    emblems: cleanCountMap(seed?.emblems, 9999),
    dailyFavor: cleanCountMap(seed?.dailyFavor),
    dailyXp: whole(seed?.dailyXp),
    donations: whole(seed?.donations),
    donationsByGiant: cleanCountMap(seed?.donationsByGiant),
    giantTipIndex: whole(seed?.giantTipIndex, 0, GIANT_TIPS.length - 1),
  };
}

export function createShrineState(seed = {}) {
  return normalizeShrineState(seed);
}

export function resetShrineDay(state) {
  state.dailyFavor = cleanCountMap();
  state.dailyXp = 0;
  return state;
}

export function emblemCostFor(state, giantId) {
  return EMBLEM_FAVOR_COST + whole(state?.emblems?.[giantId], 0, 9999) * EMBLEM_FAVOR_INCREMENT;
}

export function donationValueFor(classTsid) {
  const catalogValue = whole(ITEM_CATALOG[classTsid]?.baseCost, 0);
  return catalogValue || SHRINE_ITEM_BASE_COSTS[classTsid] || 1;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Forest streets belong to Spriggan; other hubs receive a stable Giant. */
export function giantForStreet(street = {}) {
  const official = String(street?.officialGiantId || '').toLowerCase();
  if (GIANTS[official]) return GIANTS[official];
  const hub = String(street?.hubName || '').toLowerCase();
  if (hub.includes('forest')) return GIANTS.spriggan;
  if (hub.includes('salatu')) return GIANTS.lem;
  if (hub.includes('ilmenskie') || hub.includes('cavern')) return GIANTS.zille;
  const key = street?.hubId || street?.tsid || hub || 'groddle';
  return GIANTS[GIANT_IDS[stableHash(key) % GIANT_IDS.length]];
}

/** @param {{ xp?: number }} [opts] the player's lifetime XP sets the daily iMG cap */
export function quoteShrineDonation(state, giantId, inv, classTsid, count = 1, opts = {}) {
  const giant = GIANTS[giantId];
  if (!giant) return { ok: false, reason: 'unknown_giant' };
  if (
    !classTsid ||
    isToolItem(classTsid) ||
    classTsid.startsWith('emblem_') ||
    ITEM_CATALOG[classTsid]?.donatable === false
  ) {
    return { ok: false, reason: 'not_donatable' };
  }
  const have = whole(inv?.[classTsid]);
  const qty = Math.max(1, Math.min(have || 1, whole(count, 1, 9999)));
  if (have < qty) return { ok: false, reason: 'missing', have, qty };
  const baseCost = donationValueFor(classTsid) * qty;
  const rawXp = Math.round(baseCost * 0.2);
  const rawMood = Math.round(baseCost * 0.1);
  const rawFavor = Math.round(baseCost * 0.1);
  const emblemCost = emblemCostFor(state, giantId);
  const favorRoom = Math.max(0, emblemCost - whole(state?.favor?.[giantId]));
  const dailyFavorRoom = Math.max(0, emblemCost - whole(state?.dailyFavor?.[giantId]));
  const xpLimit = Number.isFinite(Number(opts.xp)) ? donationXpLimit(opts.xp) : DAILY_DONATION_XP_LIMIT;
  const dailyXpRoom = Math.max(0, xpLimit - whole(state?.dailyXp));
  // evalDonate: daily favor takes up to its own room; total favor caps after.
  const dailyFavor = Math.min(rawFavor, dailyFavorRoom);
  return {
    ok: true,
    giant,
    classTsid,
    label: ITEM_CATALOG[classTsid]?.label || classTsid.replace(/_/g, ' '),
    have,
    qty,
    baseCost,
    xp: Math.min(rawXp, dailyXpRoom),
    mood: rawMood,
    favor: Math.min(dailyFavor, favorRoom),
    dailyFavor,
    dailyXpRoom,
    xpLimit,
    rawXp,
    rawMood,
    rawFavor,
    emblemCost,
    atFavorCap: favorRoom <= 0,
    atDailyFavorCap: dailyFavorRoom <= 0,
    atDailyXpCap: dailyXpRoom <= 0,
  };
}

export function listShrineDonationOptions(state, giantId, inv = {}, opts = {}) {
  return Object.keys(inv)
    .filter((classTsid) =>
      whole(inv[classTsid]) > 0 &&
      !isToolItem(classTsid) &&
      !classTsid.startsWith('emblem_') &&
      ITEM_CATALOG[classTsid]?.donatable !== false
    )
    .map((classTsid) => quoteShrineDonation(state, giantId, inv, classTsid, 1, opts))
    .filter((row) => row.ok)
    .sort((a, b) => b.baseCost - a.baseCost || a.label.localeCompare(b.label));
}

export function donateToShrine(state, giantId, inv, pc, classTsid, count = 1, opts = {}) {
  const quote = quoteShrineDonation(state, giantId, inv, classTsid, count, { xp: pc?.xp });
  if (!quote.ok) return quote;
  if (!removeItem(inv, classTsid, quote.qty)) return { ok: false, reason: 'missing' };

  // The lucky bonus is added before the daily cap (items/include/shrines.js:460-478).
  let xp = quote.rawXp;
  let mood = quote.mood;
  let bonus = null;
  const roll = typeof opts.rng === 'function' ? opts.rng() : Math.random();
  if (roll < 0.001) {
    bonus = 'super';
    xp += Math.round(quote.baseCost);
    mood += Math.round(quote.baseCost * 0.5);
  } else if (roll < 0.01) {
    bonus = 'huge';
    xp += Math.round(quote.baseCost * 0.4);
    mood += Math.round(quote.baseCost * 0.2);
  }

  xp = Math.min(xp, quote.dailyXpRoom);

  const moodBefore = Number(pc.mood) || 0;
  pc.mood = Math.min(moodMax(pc), moodBefore + mood);
  const actualMood = pc.mood - moodBefore;
  pc.xp = (Number(pc.xp) || 0) + xp;
  pc.imagination = (Number(pc.imagination) || 0) + xp;
  state.favor[giantId] = whole(state.favor[giantId]) + quote.favor;
  state.dailyFavor[giantId] = whole(state.dailyFavor[giantId]) + quote.dailyFavor;
  state.dailyXp = Math.min(quote.xpLimit, whole(state.dailyXp) + xp);
  state.donations = whole(state.donations) + 1;
  state.donationsByGiant[giantId] = whole(state.donationsByGiant[giantId]) + 1;
  const tip = GIANT_TIPS[state.giantTipIndex % GIANT_TIPS.length];
  state.giantTipIndex = (state.giantTipIndex + 1) % GIANT_TIPS.length;
  const ticketChance = gameshowTicketChance(quote.baseCost);
  const ticketRoll = Number.isFinite(opts.ticketRoll)
    ? opts.ticketRoll
    : typeof opts.ticketRng === 'function'
      ? opts.ticketRng()
      : Math.random();
  const gameshowTicket = ticketChance > 0 && ticketRoll < ticketChance;
  if (gameshowTicket) {
    ensureItem(GAMESHOW_TICKET_ID, {
      label: 'Gameshow Ticket',
      desc: "One glittery, razzling, dazzling game show ticket. Ain't nothing you can do but USE it.",
      icon: 'assets/sprites/icons/gameshow_ticket.png',
      baseCost: 0,
    });
    addItem(inv, GAMESHOW_TICKET_ID, 1);
  }

  return {
    ...quote,
    ok: true,
    xp,
    mood: actualMood,
    favor: quote.favor,
    bonus,
    tip,
    gameshowTicket,
    ticketChance,
  };
}

export function canClaimEmblem(state, giantId) {
  return whole(state?.favor?.[giantId]) >= emblemCostFor(state, giantId);
}

/** Every emblem after a Giant's first also pays 50 iMG (items/include/shrines.js:111). */
export const EMBLEM_XP = 50;

export function claimShrineEmblem(state, giantId, inv = {}, pc = null) {
  const giant = GIANTS[giantId];
  if (!giant) return { ok: false, reason: 'unknown_giant' };
  const cost = emblemCostFor(state, giantId);
  if (!canClaimEmblem(state, giantId)) {
    return { ok: false, reason: 'favor', have: whole(state?.favor?.[giantId]), cost };
  }
  state.favor[giantId] = whole(state.favor[giantId]) - cost;
  const first = whole(state.emblems[giantId]) === 0;
  state.emblems[giantId] = whole(state.emblems[giantId]) + 1;
  const xp = first ? 0 : EMBLEM_XP;
  if (xp && pc) {
    pc.xp = (Number(pc.xp) || 0) + xp;
    pc.imagination = (Number(pc.imagination) || 0) + xp;
  }
  const classTsid = `emblem_${giantId}`;
  ensureItem(classTsid, {
    label: `Emblem of ${giant.name}`,
    desc: `A mark of devotion to ${giant.name}.`,
  });
  inv[classTsid] = whole(inv[classTsid]) + 1;
  return { ok: true, giant, classTsid, cost, count: state.emblems[giantId], xp: pc ? xp : 0 };
}
