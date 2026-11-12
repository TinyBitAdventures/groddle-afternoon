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

import { levelInfoForXp } from './progression.js?v=33462eaa';
import {
  ITEM_CATALOG,
  addItem,
  ensureItem,
  isToolItem,
  removeItem,
} from './inventory.js?v=60dfc9ca';
import {
  GAMESHOW_TICKET_ID,
  gameshowTicketChance,
} from './spinning-wheel.js?v=9605bed2';
import { metabolicGain, moodMax } from './metabolics.js?v=8504134e';
import { grantMoodXp } from './mood-xp.js?v=958e7680';
import { getSkillCatalog } from './content-catalogs.js?v=10b118dd';
import { accelerateActiveStudy, getActiveStudy, maxStudyAcceleration } from './skills.js?v=4542bdf9';
import { emblemUnlockSkillFor } from './skill-tree.js?v=faa54b90';

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

/** Descriptions: each shrine's own, verbatim (items/npc_shrine_<giant>.js var description, line 8). */
export const GIANTS = Object.freeze({
  alph: Object.freeze({
    id: 'alph', name: 'Alph', color: '#d88445',
    description: "This is a shrine to Alph, the giant of creation. If you've ever wondered \"Why do Piggies make meat?\" or \"Which came first: the chicken or the egg plant?\" chances are Alph has the answer.",
  }),
  cosma: Object.freeze({
    id: 'cosma', name: 'Cosma', color: '#8ab9db',
    description: 'This is a shrine to Cosma. As the giant who governs the sky, Cosma is also the giant of levity and meditation. She is, also, the only giant capable of herding butterflies.',
  }),
  friendly: Object.freeze({
    id: 'friendly', name: 'Friendly', color: '#7d77bd',
    description: 'This is a shrine to Friendly, the giant who oversees all things celestial, nocturnal, lunar, stygian and murky. Despite this, he is, as his name implies, considered by many to be the nicest of the giants and the one most likely to loan you twenty currants till payday.',
  }),
  grendaline: Object.freeze({
    id: 'grendaline', name: 'Grendaline', color: '#55aab5',
    description: 'This is a shrine to Grendaline. Quietly loyal and fierce, Grendaline is the giant who governs all things watery, from clouds and fogs to mountain streams and oceans. As a sideline, she is also influential in the sphere of big, fluffy towels.',
  }),
  humbaba: Object.freeze({
    id: 'humbaba', name: 'Humbaba', color: '#d27a75',
    description: 'This is a shrine to Humbaba, the giant who rules both two-legged and four-legged beasts. Actually, she rules all the beasts with even-numbered quantities of legs. The odd-numbered ones are on their own.',
  }),
  lem: Object.freeze({
    id: 'lem', name: 'Lem', color: '#e0a743',
    description: "This is a shrine to Lem, the giant of travel and navigation. If you've ever found yourself somewhere you didn't plan to be, chances are it was a Lemish practical joke, for which he is utterly unrepentant.",
  }),
  mab: Object.freeze({
    id: 'mab', name: 'Mab', color: '#8db85b',
    description: 'This is a shrine to Mab, the giant who holds sway over the harvest. She honors industriousness, and rightfully so. Sometimes, however, industriousness can turn to greed. This is a problem.',
  }),
  pot: Object.freeze({
    id: 'pot', name: 'Pot', color: '#d99057',
    description: 'This is a shrine to Pot. Big-hearted and generous, Pot is the giant who dispenses prosperity and good fortune. Which is all well and good if you can keep sloth and indolence at bay. Tricky.',
  }),
  spriggan: Object.freeze({
    id: 'spriggan', name: 'Spriggan', color: '#6e9b4d',
    description: 'This is a shrine to Spriggan. Sure, Spriggan is the most taciturn and humorless of all the giants. You would be, too, if you had sole dominion over the trees. Trees are serious business, you know.',
  }),
  ti: Object.freeze({
    id: 'ti', name: 'Tii', color: '#879aa8',
    description: "This is a shrine to Tii, the overseer of elements, and the giant who manipulates all matters alchemical. Unlike the other giants, Tii is neither male nor female. Or both male and female. It's either really simple or really confusing, depending how you look at it. Some reckon this is why Tii seems cold and distant. They are incorrect. Tii is merely calculating and combining. It's distracting.",
  }),
  zille: Object.freeze({
    id: 'zille', name: 'Zille', color: '#9b8064',
    description: "This is a shrine to Zille, the giant whose domain is the mountains. Hills, too. Also hillocks, pingos, drumlins and buttes. It's safe to consider that any bump in the ground is Zille's turf. She takes no responsibility, however, for volcanoes.",
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

/**
 * A tool's donation value through `opts.toolBaseCost(classTsid)` (its worn base cost,
 * tools.js toolWornBaseCost; null for a tool with no wear meter, which is worth its
 * catalog value), or null when the caller gave no callback (then tools stay out).
 * The original took tools at a shrine: include/shrines.js 397 values a stack at
 * getBaseCost() * count, and tool_base.js getBaseCost prices the wear.
 */
function toolDonationValue(classTsid, opts = {}) {
  if (!isToolItem(classTsid) || typeof opts.toolBaseCost !== 'function') return null;
  const cost = opts.toolBaseCost(classTsid);
  const value = cost != null && Number.isFinite(Number(cost))
    ? Number(cost)
    : whole(ITEM_CATALOG[classTsid]?.baseCost, 0) || SHRINE_ITEM_BASE_COSTS[classTsid] || 0;
  // A machine is worth 0 (machine_base, base_cost 0): the source would take it for nothing, so it stays out.
  return value > 0 ? value : null;
}

/**
 * @param {{ xp?: number, toolBaseCost?: (classTsid: string) => number|null }} [opts] the player's
 * lifetime XP sets the daily iMG cap; toolBaseCost lets a tool be given, one at a time
 */
export function quoteShrineDonation(state, giantId, inv, classTsid, count = 1, opts = {}) {
  const giant = GIANTS[giantId];
  if (!giant) return { ok: false, reason: 'unknown_giant' };
  const toolValue = classTsid ? toolDonationValue(classTsid, opts) : null;
  if (
    !classTsid ||
    (isToolItem(classTsid) && toolValue == null) ||
    classTsid.startsWith('emblem_') ||
    ITEM_CATALOG[classTsid]?.donatable === false
  ) {
    return { ok: false, reason: 'not_donatable' };
  }
  const have = whole(inv?.[classTsid]);
  const qty = toolValue != null ? 1 : Math.max(1, Math.min(have || 1, whole(count, 1, 9999)));
  if (have < qty) return { ok: false, reason: 'missing', have, qty };
  const baseCost = (toolValue ?? donationValueFor(classTsid)) * qty;
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
    maxQty: toolValue != null ? 1 : have,
    tool: toolValue != null,
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

/**
 * The count the donation window opens with (G630, report #168): the original set it to what would
 * fill the emblem or reach the day's favor limit, whichever is less, and never more than you hold
 * (ShrineDonateDialog.as tryToFillFavor 242-264, called as the window starts, 224-225):
 * min(how_many, floor((max - current) / item_favor), floor((max_daily_favor - cur_daily_favor) / item_favor)).
 * item_favor is one item's favor unrounded, cost * 0.1 * the powder bonus (items/include/shrines.js
 * favorRequest 670-697), and max is the same number as max_daily_favor (700-704). The picker's
 * least is 1 (ShrineDonateDialog.as 101, QuantityPicker.as 269-274), so an item worth more than
 * the favor left, or a full meter, still opens at 1; so does an item worth no favor (258-261).
 * A tool goes one at a time here.
 * @param {{ powderBonus?: number, toolBaseCost?: (classTsid: string) => number|null }} [opts]
 */
export function shrineFillQty(state, giantId, inv, classTsid, opts = {}) {
  if (!GIANTS[giantId] || !classTsid) return 1;
  const toolValue = toolDonationValue(classTsid, opts);
  if (toolValue != null) return 1;
  const have = Math.min(whole(inv?.[classTsid]), 9999);
  const powderBonus = [2, 3].includes(Number(opts.powderBonus)) ? Number(opts.powderBonus) : 1;
  const itemFavor = donationValueFor(classTsid) * 0.1 * powderBonus;
  if (!(itemFavor > 0)) return 1;
  const max = emblemCostFor(state, giantId);
  const amount = Math.min(
    have,
    Math.floor((max - whole(state?.favor?.[giantId])) / itemFavor),
    Math.floor((max - whole(state?.dailyFavor?.[giantId])) / itemFavor),
  );
  return Math.max(1, Math.min(amount, Math.max(1, have)));
}

export function listShrineDonationOptions(state, giantId, inv = {}, opts = {}) {
  return Object.keys(inv)
    .filter((classTsid) =>
      whole(inv[classTsid]) > 0 &&
      (!isToolItem(classTsid) || toolDonationValue(classTsid, opts) != null) &&
      !classTsid.startsWith('emblem_') &&
      ITEM_CATALOG[classTsid]?.donatable !== false
    )
    .map((classTsid) => quoteShrineDonation(state, giantId, inv, classTsid, 1, opts))
    .filter((row) => row.ok)
    // Tools after goods, so the panel's first pick is never a tool the player is using.
    .sort((a, b) => Number(a.tool) - Number(b.tool) || b.baseCost - a.baseCost || a.label.localeCompare(b.label));
}

export function donateToShrine(state, giantId, inv, pc, classTsid, count = 1, opts = {}) {
  const quote = quoteShrineDonation(state, giantId, inv, classTsid, count, { xp: pc?.xp, powderBonus: opts.powderBonus, noNo: opts.noNo, moodMultiplier: opts.moodMultiplier, toolBaseCost: opts.toolBaseCost });
  if (!quote.ok) return quote;
  // The caller's last step before the stack shrinks (a tool's copy moves last: tools.js takeToolCopy).
  if (typeof opts.beforeRemove === 'function') opts.beforeRemove();
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

  // shrines.js 490-492: the mood comes back through metabolics_add_mood,
  // which gives nothing while dead (inc_metabolics.js 79-86).
  const moodBefore = Number(pc.mood) || 0;
  if (mood > 0 && metabolicGain('mood').ok) pc.mood = Math.min(moodMax(pc), moodBefore + mood);
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
      icon: 'assets/sprites/icons/gameshow_ticket.webp',
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

/**
 * The Giant the top bar's favor display reads on this street, or null for none (G631).
 * Where a shrine stands it is that shrine's Giant, with no favor too: the street's archived shrine
 * (street.officialGiantId, js/street-ecology.js) or one standing there now (`shrineHere`: the
 * starter street without its catalog row, a QA shrine).
 * Every other place (a street with no shrine, a home, a room) still has a Giant its favor quoins
 * go to (giantForStreet's region rule). The display went on showing that one while you had favor
 * with it, as it did before G631; with none it shows no Giant, only the favor star.
 */
export function favorDisplayGiant(state, street, { shrineHere = false } = {}) {
  if (!street) return null;
  const giant = giantForStreet(street);
  if (shrineHere || GIANTS[String(street.officialGiantId || '').toLowerCase()]) return giant;
  return whole(state?.favor?.[giant.id]) > 0 ? giant : null;
}

/**
 * The top bar's favor panel (report #170, js/ui/topbar.js): every Giant in name order with the
 * favor held, what the next emblem needs (emblemCostFor) and whether that emblem is ready to
 * claim (canClaimEmblem). `hereId` marks the Giant the favor display reads here (favorDisplayGiant). Reads only.
 */
export function favorPanelRows(state, hereId = null) {
  return Object.values(GIANTS).map((giant) => {
    const points = whole(state?.favor?.[giant.id]);
    const target = emblemCostFor(state, giant.id);
    return {
      id: giant.id,
      name: giant.name,
      points,
      target,
      share: target > 0 ? Math.min(1, points / target) : 0,
      ready: canClaimEmblem(state, giant.id),
      here: giant.id === hereId,
      icon: `assets/sprites/giant-icons/icon_${giant.id === 'ti' ? 'tii' : giant.id}.webp`,
    };
  });
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
