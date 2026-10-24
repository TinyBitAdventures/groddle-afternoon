/**
 * Giant shrines, distilled from Tiny Speck's items/include/shrines.js.
 *
 * Official donation math:
 *   item base cost × count → 20% iMG, 10% mood, 10% Giant favor.
 * Favor and donation iMG are capped per game day. Reaching a Giant's favor
 * target lets the player claim an emblem; each later emblem costs 100 more.
 *
 * Favor (and an emblem with nothing left to unlock) can be spent to speed up
 * the skill being studied: players/inc_skills.js get_skill_info, shrines.js
 * spend_points, emblem_base doSpend. See quoteFavorSpend / quoteEmblemSpend.
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
import { grantMoodXp } from './mood-xp.js';
import { getSkillCatalog } from './content-catalogs.js';
import { accelerateActiveStudy, getActiveStudy, maxStudyAcceleration } from './skills.js';
import { emblemUnlockSkillFor } from './skill-tree.js';

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
  // shrines.js:445-457: a hallowed powder multiplies XP, mood and favor
  // (opts.powderBonus 2 or 3); No-No Powder's rush keeps a fifth of the XP.
  // shrines.js 450 folds in the mood bonus here (opts.moodMultiplier, from
  // js/mood-xp.js) and then awards with no_bonus, so the cap sees scaled iMG.
  const powderBonus = [2, 3].includes(Number(opts.powderBonus)) ? Number(opts.powderBonus) : 1;
  const moodMultiplier = opts.moodMultiplier != null && Number.isFinite(Number(opts.moodMultiplier)) ? Number(opts.moodMultiplier) : 1;
  let rawXp = Math.round(Math.round(baseCost * 0.2 * powderBonus) * moodMultiplier);
  if (opts.noNo) rawXp = Math.round(rawXp * 0.2);
  const rawMood = Math.round(baseCost * 0.1 * powderBonus);
  const rawFavor = Math.round(baseCost * 0.1 * powderBonus);
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
    powderBonus,
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
  const quote = quoteShrineDonation(state, giantId, inv, classTsid, count, { xp: pc?.xp, powderBonus: opts.powderBonus, noNo: opts.noNo, moodMultiplier: opts.moodMultiplier });
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
    // The hallowed buff the donation used up (the caller removes it).
    powderConsumed: quote.powderBonus > 1 && opts.consume ? opts.consume : null,
  };
}

/**
 * npc_shrine_base onLoad: apiAddHitBox("emblem", 400, 400). Since the 2012-09-22 update a waiting
 * emblem is handed over as you walk into it (onPlayerCollision, hitbox "emblem"). Centred on the
 * shrine and rising from its feet; `x`/`y` are the player's feet.
 */
export const EMBLEM_HITBOX = Object.freeze({ w: 400, h: 400 });

export function inEmblemHitbox(shrine, x, y) {
  if (!shrine) return false;
  return Math.abs(x - shrine.x) <= EMBLEM_HITBOX.w / 2 && y <= shrine.y + 12 && y >= shrine.y - EMBLEM_HITBOX.h;
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
  // shrines.js 111: stats_add_xp(50, false) takes the mood bonus.
  const xp = !first && pc ? grantMoodXp(pc, EMBLEM_XP) : 0;
  const classTsid = `emblem_${giantId}`;
  ensureItem(classTsid, {
    label: `Emblem of ${giant.name}`,
    desc: `A mark of devotion to ${giant.name}.`,
  });
  inv[classTsid] = whole(inv[classTsid]) + 1;
  return { ok: true, giant, classTsid, cost, count: state.emblems[giantId], xp };
}

/* ------------------------------------------------------------------ */
/* Spending favor and emblems on skill study                            */
/* ------------------------------------------------------------------ */

/**
 * get_skill_info (players/inc_skills.js:1852-1886): seconds of study bought
 * per favor point by the Giant's place in the skill's `giants` list:
 * primary 10, secondary 7, any other Giant 5.
 */
export const FAVOR_STUDY_SECONDS = Object.freeze({ p: 10, s: 7, u: 5 });
/** emblem_base conditions/handler/doSpend: an emblem spends as 1,000 favor. */
export const EMBLEM_SPEND_FAVOR = 1000;
/** shrines.js:28/64, emblem_base:252/431: Crumb of Knowledge lengthens the speed-up. */
export const YELLOW_CRUMB_BUFF = 'yellow_crumb_flower';
export const YELLOW_CRUMB_MULTIPLIER = 1.05;
/** shrines.js spend_points:55-60, the two Better Learning quest flags. */
export const MAD_FAVOR_POINTS = 997;
export const ENORMOUS_FAVOR_POINTS = 1511;
export const FAVOR_SPENT_EVENTS = Object.freeze({
  primaryLarge: 'favor_spent:primary_large', // quests: primary_giant_spend_mad_favor
  huge: 'favor_spent:huge', // quests: spend_enormous_favor
});

/** Source copy (client ShrineDialog.as / EmblemSpendDialog.as, GSJS emblem_base). */
export const FAVOR_SPEND_COPY = Object.freeze({
  title: 'Learn Faster?',
  confirm: 'Are you sure you want to spend those favor points?',
  confirmYes: 'Yes, Spend!',
  confirmNo: 'No, Cancel!',
  spent: "You've done it! You spent that favor!",
  cannot: "You can't spend points right now",
  maxed: "You're already learning as fast as you can!",
  notLearning: 'If you were learning a new skill, you could use your favor points to learn it faster.',
  noFavor: 'No favor points?! Did you know that the giants will help you learn faster than normal if you donate to their shrines?',
  checkFavorTooltip: 'View & spend favor points',
  emblemMaxed: "Your learning is already accelerated to the max. More emblems won't help!",
  emblemNotLearning: 'You are not learning a skill.',
  emblemSillyGoose: 'Silly goose, you need to be learning a skill to be able to spend your emblem!',
});

/**
 * The client's StringUtil.formatTime(sec) with its defaults, used for the
 * speed-up figure in both spend dialogs: "5 mins", "2 hours 46 mins 40 secs".
 */
export function formatSpeedUpTime(seconds) {
  const sec = Math.max(0, Math.trunc(Number(seconds) || 0));
  let secTxt = `${sec % 60}${sec % 60 === 1 ? ' sec' : ' secs'}`;
  const mins = Math.floor(sec / 60) % 60;
  let minTxt = mins > 0 ? `${mins}${mins === 1 ? ' min' : ' mins'}` : '';
  const hours = Math.floor(sec / 3600) % 24;
  let hourTxt = hours > 0 ? `${hours}${hours === 1 ? ' hour' : ' hours'}` : '';
  const days = Math.floor(sec / 86400);
  let dayTxt = days > 0 ? `${days.toLocaleString('en-US')}${days === 1 ? ' day' : ' days'}` : '';
  if (sec % 60 === 0) secTxt = '';
  if (minTxt && secTxt) minTxt += ' ';
  if (hourTxt && (minTxt || secTxt)) hourTxt += ' ';
  if (dayTxt && (hourTxt || minTxt || secTxt)) dayTxt += ' ';
  return dayTxt + hourTxt + minTxt + secTxt;
}

/** 'p' primary, 's' secondary, 'u' unassociated (get_skill_info giant_rel). */
export function giantRelationFor(def, giantId) {
  const row = def?.giants?.[giantId];
  if (!row) return 'u';
  return Math.trunc(Number(row.primary) || 0) ? 'p' : 's';
}

/** ShrineDialog.as update(): the Note! line for each relation. */
export function favorRelationNote(giantName, rel) {
  if (rel === 'p') return `${giantName} is the best giant for learning this skill!`;
  if (rel === 's') return `${giantName} is the secondary giant for learning this skill.`;
  const pronoun = giantPronounWill(giantName);
  return `${giantName} is not associated with this skill, but ${pronoun} help you learn it anyway.`;
}

/** EmblemSpendDialog.as setBody(): the Note! line for each relation. */
export function emblemRelationNote(giantName, rel) {
  if (rel === 'p') return `${giantName} is the giant most closely affiliated with this skill, so spending their emblem here offers top-class speed-learning!`;
  if (rel === 's') return `${giantName} is affiliated with this skill (but not as closely as another giant), so spending their emblem will speed up learning a substantial amount`;
  return `${giantName} is not affiliated with this skill, so spending their Emblem won't speed up learning as much.`;
}

/** Giants.as getSex: the client's "he'll / she'll / they'll" for the Note! line. */
const GIANT_SEX = Object.freeze({
  alph: 'm', cosma: 'f', friendly: 'm', grendaline: 'f', humbaba: 'f',
  lem: 'm', mab: 'f', pot: 'm', spriggan: 'm', ti: 'n', tii: 'n', zille: 'f',
});
function giantPronounWill(giantName) {
  const sex = GIANT_SEX[String(giantName || '').toLowerCase()];
  return sex === 'f' ? "she'll" : sex === 'n' ? "they'll" : "he'll";
}

/**
 * get_skill_info for one Giant and a favor budget: points to spend (never
 * more than the acceleration cap buys) and the seconds they buy.
 * `rawSpendPoints` is the source's unrounded figure; `spendPoints` is the
 * whole number the client shows and the server removes (uint in ShrineDialog).
 */
export function skillSpeedInfo(def, giantId, points, maxSeconds) {
  const out = { giantRel: 'u', secondsPerPoint: FAVOR_STUDY_SECONDS.u, rawSpendPoints: 0, spendPoints: 0, speedUp: 0 };
  if (!def || !def.giants) return out;
  out.giantRel = giantRelationFor(def, giantId);
  out.secondsPerPoint = FAVOR_STUDY_SECONDS[out.giantRel];
  const maxPoints = Math.max(0, Number(maxSeconds) || 0) / out.secondsPerPoint;
  const budget = Math.max(0, Number(points) || 0);
  out.rawSpendPoints = maxPoints < budget ? maxPoints : budget;
  out.spendPoints = Math.floor(out.rawSpendPoints + 1e-9);
  out.speedUp = out.rawSpendPoints * out.secondsPerPoint;
  return out;
}

function activeStudyDef(skillState, now) {
  const active = skillState ? getActiveStudy(skillState, now) : null;
  if (!active || active.remainingSeconds <= 0) return { active: null, def: null };
  return { active, def: getSkillCatalog()[active.classTsid] || null };
}

/**
 * check_favor (items/include/shrines.js:21-44) + the client's Learn Faster?
 * states. `ok` only when favor can be spent right now.
 * @param {{ now?: number, yellowCrumb?: boolean }} [opts]
 */
export function quoteFavorSpend(state, giantId, skillState, opts = {}) {
  const giant = GIANTS[giantId];
  if (!giant) return { ok: false, reason: 'unknown_giant' };
  const now = opts.now ?? Date.now();
  const favorPoints = whole(state?.favor?.[giantId]);
  const { active, def } = activeStudyDef(skillState, now);
  const maxSeconds = active ? maxStudyAcceleration(skillState, now) : 0;
  const info = skillSpeedInfo(def, giantId, favorPoints, maxSeconds);
  const multiplier = opts.yellowCrumb ? YELLOW_CRUMB_MULTIPLIER : 1;
  const isLearning = Boolean(active && def);
  const base = {
    giant,
    giantId,
    favorPoints,
    isLearning,
    classTsid: active?.classTsid || null,
    def,
    maxSeconds,
    multiplier,
    ...info,
    speedUp: Math.round(info.speedUp * multiplier),
  };
  if (!isLearning) return { ...base, ok: false, reason: 'not_learning', text: FAVOR_SPEND_COPY.notLearning };
  if (favorPoints <= 0) return { ...base, ok: false, reason: 'no_favor', text: FAVOR_SPEND_COPY.noFavor };
  if (info.spendPoints <= 0) return { ...base, ok: false, reason: 'max_acceleration', text: FAVOR_SPEND_COPY.maxed };
  return { ...base, ok: true, reason: 'ok' };
}

/**
 * spend_points (items/include/shrines.js:46-75): sets the Better Learning
 * flags from the favor held before spending (997+ with the skill's primary
 * Giant; 1,511+ with any Giant), accelerates the study by speed_up x Yellow
 * Crumb (capped again by skills_start_acceleration) and removes the points.
 * @param {{ now?: number, yellowCrumb?: boolean }} [opts]
 */
export function spendFavorOnStudy(state, giantId, skillState, opts = {}) {
  const now = opts.now ?? Date.now();
  const quote = quoteFavorSpend(state, giantId, skillState, { ...opts, now });
  if (!quote.ok) return quote;
  const events = [];
  if (quote.favorPoints >= MAD_FAVOR_POINTS && quote.giantRel === 'p') events.push(FAVOR_SPENT_EVENTS.primaryLarge);
  if (quote.favorPoints >= ENORMOUS_FAVOR_POINTS) events.push(FAVOR_SPENT_EVENTS.huge);
  const accel = accelerateActiveStudy(skillState, quote.speedUp, now);
  state.favor[giantId] = Math.max(0, whole(state.favor[giantId]) - quote.spendPoints);
  return {
    ...quote,
    ok: true,
    reason: 'spent',
    spent: quote.spendPoints,
    applied: accel.applied || 0,
    completed: accel.completed || [],
    events,
    favorLeft: state.favor[giantId],
  };
}

/**
 * emblem_base `spend` conditions (emblem_*.js:197-216): an emblem first
 * unlocks its Giant's skill (`emblem_skill_unlock_<giant>_1`); once that badge
 * is held it buys get_skill_info(skill, giant, 1000).speed_up of study.
 * @param {{ unlockedAchievements?: string[], now?: number, yellowCrumb?: boolean }} [opts]
 */
export function quoteEmblemSpend(giantId, skillState, opts = {}) {
  const giant = GIANTS[giantId];
  if (!giant) return { ok: false, reason: 'unknown_giant' };
  const unlock = emblemUnlockSkillFor(giantId);
  if (unlock && !(opts.unlockedAchievements || []).includes(unlock.achievement)) {
    return { ok: true, mode: 'unlock', ...unlock, giant, giantId };
  }
  const now = opts.now ?? Date.now();
  const { active, def } = activeStudyDef(skillState, now);
  if (!active || !def) {
    return { ok: false, mode: 'speed', reason: 'not_learning', giant, giantId, text: FAVOR_SPEND_COPY.emblemNotLearning };
  }
  const maxSeconds = maxStudyAcceleration(skillState, now);
  const info = skillSpeedInfo(def, giantId, EMBLEM_SPEND_FAVOR, maxSeconds);
  const multiplier = opts.yellowCrumb ? YELLOW_CRUMB_MULTIPLIER : 1;
  const base = {
    mode: 'speed',
    giant,
    giantId,
    classTsid: active.classTsid,
    def,
    maxSeconds,
    multiplier,
    ...info,
    speedUp: Math.round(info.speedUp * multiplier),
    isPrimary: info.giantRel === 'p',
    isSecondary: info.giantRel !== 'u',
  };
  if (!(info.speedUp > 0)) return { ...base, ok: false, reason: 'max_acceleration', text: FAVOR_SPEND_COPY.emblemMaxed };
  return { ...base, ok: true, reason: 'ok' };
}

/**
 * emblem_base doSpend (emblem_*.js:424-438): accelerate by the emblem's
 * speed-up and destroy the emblem. Spending an emblem sets no quest flag and
 * leaves the earned-emblem count (and so the favor target) unchanged.
 */
export function spendEmblemOnStudy(inv, giantId, skillState, opts = {}) {
  const now = opts.now ?? Date.now();
  const quote = quoteEmblemSpend(giantId, skillState, { ...opts, now });
  if (!quote.ok) return quote;
  if (quote.mode !== 'speed') return { ...quote, ok: false, reason: 'unlock_first' };
  const classTsid = `emblem_${giantId}`;
  if (!removeItem(inv, classTsid, 1)) return { ...quote, ok: false, reason: 'no_emblem', text: FAVOR_SPEND_COPY.emblemSillyGoose };
  const accel = accelerateActiveStudy(skillState, quote.speedUp, now);
  return { ...quote, ok: true, reason: 'spent', applied: accel.applied || 0, completed: accel.completed || [] };
}
