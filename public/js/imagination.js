/**
 * Imagination ("iMG") upgrade cards, ported from GameServerJS
 * players/inc_imagination.js over the generated inc_data_imagination.js
 * catalog (./imagination-data.js, build-imagination.mjs).
 *
 * Source contract kept here:
 * - imagination_get_all: a card is learnable when it is not secret, not
 *   already owned (max_uses 1) and every condition holds: level (2), owned
 *   upgrade (3), learned skill (4), badge (5), finished quest (6), energy
 *   tank (7). Type 1 marks the nine new-player tutorial cards, which are only
 *   learnable inside the tutorial.
 * - imagination_get_deck: each learnable card goes in `chance` times. The
 *   three option cards (Energy Tank, Brain Capacity, Quoin Multiplier) pick
 *   one tier row from the current stat and add 1-5 amount variants, each
 *   `chances[k]` times, priced Math.round(cost_per * amount) (Brain Capacity
 *   takes 5%/10% off its larger amounts).
 * - imagination_get_next_upgrades: the hand holds 3 slots; empty slots fill
 *   from a freshly shuffled deck, skipping single-use cards already in hand.
 * - imagination_purchase_upgrade / imagination_grant: the card must be in the
 *   hand, not already owned, and affordable; iMG is spent (XP is lifetime and
 *   untouched), the upgrade is recorded with a timestamp, the slot empties and
 *   refills. Option cards add to their stat instead of becoming single-use.
 * - doImaginationShuffle: one free re-deal per game day. The Reshuffle Card
 *   (keepable_reshuffle → upgrade_card_reshuffle) re-deals without using it.
 *
 * Remake choices (documented in the skill doc): the remake has no tutorial
 * island, so the nine tutorial cards are granted as starter upgrades (every
 * source player bought them on the way out of the tutorial) and the remake's
 * movement feel is the post-tutorial baseline.
 */

import { IMAGINATION_UPGRADES, SHUFFLE_CARD_COST, CARD_ART_LAYERS } from './imagination-data.js';

export { IMAGINATION_UPGRADES, SHUFFLE_CARD_COST, CARD_ART_LAYERS };

export const HAND_SIZE = 3;
/** config_base.js */
export const BRAIN_CAPACITY_DEFAULT = 20;
export const BRAIN_CAPACITY_LIMIT = 60;
export const QUOIN_MULTIPLIER_LIMIT = 100;
/** imagination_get_deck amount variants per chances[] index. */
export const ENERGY_TANK_AMOUNTS = Object.freeze([10, 20, 50, 100, 500]);
export const BRAIN_CAPACITY_AMOUNTS = Object.freeze([1, 3, 5]);
export const BRAIN_CAPACITY_DISCOUNTS = Object.freeze([0, 0.05, 0.1]);
export const QUOIN_MULTIPLIER_AMOUNTS = Object.freeze([0.25, 0.5, 1]);
export const OPTION_CARDS = Object.freeze(['energy_tank', 'brain_capacity', 'quoin_multiplier']);

/** The nine type-1 (tutorial) cards, granted as starters in the remake. */
export const STARTER_UPGRADES = Object.freeze(
  Object.entries(IMAGINATION_UPGRADES)
    .filter(([, u]) => u.conditions.some((c) => c.type === 1))
    .map(([id]) => id)
    .sort()
);

/** Source walk/jump physics rewards (reward type 1) and the starting values. */
export const SOURCE_DEFAULT_PHYSICS = Object.freeze({ vx_max: 0.4597, vy_jump: 0.7105, gravity: 1 });

const asSet = (list) => (list instanceof Set ? list : new Set(Array.isArray(list) ? list : []));
const finite = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

export function upgradeById(id) {
  return IMAGINATION_UPGRADES[id] || null;
}

export function createImaginationState() {
  return {
    hand: Array(HAND_SIZE).fill(null),
    history: [],
    counts: {},
    purchasedAt: {},
    shuffledDay: null,
    shuffles: 0,
    brainCapacity: BRAIN_CAPACITY_DEFAULT,
    energyTankBonus: 0,
    starterGranted: false,
  };
}

function cleanCard(card) {
  if (!card || typeof card !== 'object') return null;
  const id = String(card.class_tsid || '');
  if (!IMAGINATION_UPGRADES[id]) return null;
  return {
    class_tsid: id,
    amount: finite(card.amount, 0),
    cost: Math.max(0, Math.round(finite(card.cost, 0))),
  };
}

export function normalizeImaginationState(raw) {
  const base = createImaginationState();
  if (!raw || typeof raw !== 'object') return base;
  const hand = Array.isArray(raw.hand) ? raw.hand : [];
  base.hand = Array.from({ length: HAND_SIZE }, (_, i) => cleanCard(hand[i]));
  base.history = (Array.isArray(raw.history) ? raw.history : [])
    .filter((h) => h && IMAGINATION_UPGRADES[h.class_tsid])
    .slice(-200)
    .map((h) => ({
      class_tsid: String(h.class_tsid),
      cost: Math.max(0, Math.round(finite(h.cost))),
      amount: finite(h.amount),
      when: finite(h.when),
    }));
  for (const [id, n] of Object.entries(raw.counts || {})) {
    if (IMAGINATION_UPGRADES[id] && finite(n) > 0) base.counts[id] = Math.floor(finite(n));
  }
  for (const [id, t] of Object.entries(raw.purchasedAt || {})) {
    if (IMAGINATION_UPGRADES[id] && finite(t) > 0) base.purchasedAt[id] = finite(t);
  }
  base.shuffledDay = raw.shuffledDay == null ? null : String(raw.shuffledDay);
  base.shuffles = Math.max(0, Math.floor(finite(raw.shuffles)));
  base.brainCapacity = Math.min(
    BRAIN_CAPACITY_LIMIT,
    Math.max(BRAIN_CAPACITY_DEFAULT, Math.floor(finite(raw.brainCapacity, BRAIN_CAPACITY_DEFAULT)))
  );
  base.energyTankBonus = Math.max(0, Math.floor(finite(raw.energyTankBonus)));
  base.starterGranted = raw.starterGranted === true;
  return base;
}

/**
 * Player context the rules read. Every field is optional.
 * @typedef {{
 *   level?: number, owned?: string[]|Set<string>, learned?: string[]|Set<string>,
 *   achievements?: string[]|Set<string>, questsDone?: string[]|Set<string>,
 *   maxEnergy?: number, quoinMultiplier?: number, brainCapacity?: number,
 *   inTutorial?: boolean, offerable?: (id: string) => boolean,
 * }} ImaginationContext
 */

/** One condition row → { type, ok, ... } exactly as imagination_get_all reports it. */
export function checkCondition(condition, ctx = {}) {
  const c = condition || {};
  switch (c.type) {
    case 1:
      return { type: 1, ok: ctx.inTutorial === true };
    case 2:
      return { type: 2, ok: finite(ctx.level, 1) >= c.level, need: c.level, got: finite(ctx.level, 1) };
    case 3:
      return { type: 3, ok: asSet(ctx.owned).has(c.imagination_id), imagination_id: c.imagination_id };
    case 4:
      return { type: 4, ok: asSet(ctx.learned).has(c.skill_id), skill_id: c.skill_id };
    case 5:
      return { type: 5, ok: asSet(ctx.achievements).has(c.achievement_id), achievement_id: c.achievement_id };
    case 6:
      return { type: 6, ok: asSet(ctx.questsDone).has(c.quest_id), quest_id: c.quest_id };
    case 7:
      return { type: 7, ok: finite(ctx.maxEnergy, 100) >= c.max_energy, need: c.max_energy, got: finite(ctx.maxEnergy, 100) };
    default:
      return { type: c.type, ok: false };
  }
}

/**
 * Secret cards the remake deals anyway (G358): Bonus Furniture Upgrade I-III.
 * inc_data_imagination.js 2037-2120 marks them is_secret, so
 * imagination_get_all (inc_imagination.js 552) never dealt them, though
 * construction_tool.js 334-381 reads them; they are the one way to a style
 * that cost credits, so the shop deals them with their source cost and
 * conditions (Austin decides the other paid styles).
 */
export const DEALT_SECRET_CARDS = new Set(['furnituremaking_bonus_upgrade_1', 'furnituremaking_bonus_upgrade_2', 'furnituremaking_bonus_upgrade_3']);

/**
 * imagination_get_all for one card: { got, reqs, can_learn }.
 * Secret cards are never learnable (the source skips them entirely), except
 * DEALT_SECRET_CARDS.
 */
export function upgradeStatus(id, ctx = {}) {
  const u = IMAGINATION_UPGRADES[id];
  if (!u) return null;
  const owned = asSet(ctx.owned);
  const got = owned.has(id);
  const reqs = u.conditions.map((c) => checkCondition(c, ctx));
  const isTutorial = u.conditions.some((c) => c.type === 1);
  let canLearn = (!u.is_secret || DEALT_SECRET_CARDS.has(id)) && !(got && u.max_uses);
  if (canLearn && isTutorial && ctx.inTutorial !== true) canLearn = false;
  if (canLearn) canLearn = reqs.every((r) => r.ok);
  return { id, got, reqs, can_learn: canLearn, is_secret: Boolean(u.is_secret), is_tutorial: isTutorial };
}

/** Pick the option tier row the way imagination_get_deck does (ascending keys ≤ stat). */
export function optionTier(options, statValue) {
  const keys = Object.keys(options || {}).sort((a, b) => Number(a) - Number(b));
  let best = 0;
  for (const key of keys) {
    if (Number(key) > statValue) break;
    best += 1;
  }
  if (best) best -= 1;
  const key = keys[best];
  return key === undefined ? null : { key, row: options[key] };
}

/** Reshuffle Card price: imagination_shuffle_card_cost[level - 5]. */
export function reshuffleCardCost(level) {
  const idx = Math.max(0, Math.min(SHUFFLE_CARD_COST.length - 1, Math.floor(finite(level, 5)) - 5));
  return SHUFFLE_CARD_COST[idx];
}

/** Get Out of Hell Free Card price: max(20, max energy × 0.1). */
export function resurrectionCardCost(maxEnergy) {
  return Math.max(20, finite(maxEnergy, 100) * 0.1);
}

function optionRows(id, u, ctx) {
  const rows = [];
  let stat;
  let amounts;
  if (id === 'energy_tank') {
    stat = finite(ctx.maxEnergy, 100);
    amounts = ENERGY_TANK_AMOUNTS;
  } else if (id === 'brain_capacity') {
    stat = finite(ctx.brainCapacity, BRAIN_CAPACITY_DEFAULT);
    if (stat >= BRAIN_CAPACITY_LIMIT) return rows;
    amounts = BRAIN_CAPACITY_AMOUNTS;
  } else if (id === 'quoin_multiplier') {
    stat = finite(ctx.quoinMultiplier, 1);
    if (stat >= QUOIN_MULTIPLIER_LIMIT) return rows;
    amounts = QUOIN_MULTIPLIER_AMOUNTS;
  } else {
    return rows;
  }
  const tier = optionTier(u.options, stat);
  if (!tier) return rows;
  (tier.row.chances || []).forEach((chance, k) => {
    if (!chance) return;
    const amount = amounts[k];
    let cost = Math.round(tier.row.cost_per * amount);
    if (id === 'brain_capacity' && BRAIN_CAPACITY_DISCOUNTS[k]) cost -= Math.round(cost * BRAIN_CAPACITY_DISCOUNTS[k]);
    for (let i = 0; i < chance; i += 1) rows.push({ class_tsid: id, amount, cost, chance });
  });
  return rows;
}

/** imagination_get_deck: every eligible card × its deal chance. */
export function buildDeck(ctx = {}) {
  const deck = [];
  for (const [id, u] of Object.entries(IMAGINATION_UPGRADES)) {
    if (typeof ctx.offerable === 'function' && !ctx.offerable(id)) continue;
    if (!upgradeStatus(id, ctx).can_learn) continue;
    if (u.options) {
      deck.push(...optionRows(id, u, ctx));
      continue;
    }
    let cost = u.cost;
    if (id === 'keepable_reshuffle') cost = reshuffleCardCost(ctx.level);
    else if (id === 'keepable_instant_resurrection') cost = resurrectionCardCost(ctx.maxEnergy);
    for (let i = 0; i < u.chance; i += 1) deck.push({ class_tsid: id, amount: 0, cost, chance: u.chance });
  }
  return deck;
}

function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function handHas(hand, id) {
  return hand.some((card) => card && card.class_tsid === id);
}

/**
 * imagination_get_next_upgrades: keep valid cards, fill empty slots.
 * Mutates and returns state.hand.
 */
export function dealHand(state, ctx = {}, rng = Math.random) {
  const hand = state.hand;
  for (let i = 0; i < HAND_SIZE; i += 1) {
    const card = hand[i];
    if (!card || !IMAGINATION_UPGRADES[card.class_tsid]) hand[i] = null;
    else if (card.class_tsid === 'brain_capacity' && finite(ctx.brainCapacity, BRAIN_CAPACITY_DEFAULT) >= BRAIN_CAPACITY_LIMIT) hand[i] = null;
    else if (card.class_tsid === 'quoin_multiplier' && finite(ctx.quoinMultiplier, 1) >= QUOIN_MULTIPLIER_LIMIT) hand[i] = null;
  }
  if (hand.every(Boolean)) return hand;
  for (const card of shuffle(buildDeck(ctx), rng)) {
    if (IMAGINATION_UPGRADES[card.class_tsid].max_uses && handHas(hand, card.class_tsid)) continue;
    const slot = hand.findIndex((c) => !c);
    if (slot === -1) break;
    hand[slot] = { class_tsid: card.class_tsid, amount: card.amount || 0, cost: card.cost };
  }
  return hand;
}

/** Display name/description for a dealt card (imagination_get_login). */
export function cardText(card, ctx = {}) {
  const u = IMAGINATION_UPGRADES[card?.class_tsid];
  if (!u) return null;
  const amountText = card.class_tsid === 'quoin_multiplier' ? Number(card.amount).toFixed(2) : String(card.amount);
  let name = u.name.replace(/\{amount\}/g, amountText);
  let desc = u.desc.replace(/\{amount\}/g, amountText);
  let current = null;
  let upgraded = null;
  let post = null;
  if (card.class_tsid === 'brain_capacity') {
    current = finite(ctx.brainCapacity, BRAIN_CAPACITY_DEFAULT);
    upgraded = current + card.amount;
    post = 'Your current Brain Capacity is {current}. Buying this will make it {upgraded}';
  } else if (card.class_tsid === 'energy_tank') {
    current = finite(ctx.maxEnergy, 100);
    upgraded = current + card.amount;
    post = 'Your current Energy Tank is {current}. Buying this will make it {upgraded}';
  } else if (card.class_tsid === 'quoin_multiplier') {
    const now = finite(ctx.quoinMultiplier, 1);
    current = now.toFixed(2);
    upgraded = (now + card.amount).toFixed(2);
    post = 'Your current Quoin Multiplier is {current}. Buying this will make it {upgraded}';
  }
  if (post) desc = `${desc} ${post}`;
  if (current && upgraded) desc = desc.replace(/\{current\}/g, current).replace(/\{upgraded\}/g, upgraded);
  return { name, desc, cost: card.cost, config: u.config, keepable: u.config.bg === 'keepable' };
}

/** The grant-time effect a caller must apply (stats live outside this module). */
export function grantEffect(id, amount = 0) {
  const u = IMAGINATION_UPGRADES[id];
  if (!u) return null;
  const effect = { id, amount };
  if (id === 'energy_tank') effect.energyTank = Math.floor(finite(amount));
  else if (id === 'brain_capacity') effect.brainCapacity = Math.floor(finite(amount));
  else if (id === 'quoin_multiplier') effect.quoinMultiplier = finite(amount);
  else if (/quoin_limit/.test(id)) effect.quoinLimit = true;
  const item = u.rewards.find((r) => r.type === 8);
  if (item) effect.item = { classTsid: item.data.class_id, count: Number(item.data.num) || 1 };
  const learn = u.rewards.find((r) => r.type === 9);
  if (learn) effect.learnTime = { categoryId: Number(learn.data.category_id), percent: Number(learn.data.percent) };
  const physics = u.rewards.find((r) => r.type === 1);
  if (physics) effect.physics = { ...physics.data };
  return effect;
}

/**
 * imagination_grant: record ownership, history and option stats.
 * `owned` is the pc.imaginationUpgrades array (mutated; ids stay unique).
 * Returns the grant effect, or null when the card cannot be granted.
 */
export function grantUpgrade(state, owned, id, { amount = 0, cost = 0, now = Date.now(), history = true } = {}) {
  const u = IMAGINATION_UPGRADES[id];
  if (!u) return null;
  if (u.max_uses && owned.includes(id)) return null;
  if (!owned.includes(id)) owned.push(id);
  state.counts[id] = (state.counts[id] || 0) + 1;
  state.purchasedAt[id] = now;
  const effect = grantEffect(id, amount);
  if (effect.brainCapacity) {
    state.brainCapacity = Math.min(BRAIN_CAPACITY_LIMIT, state.brainCapacity + effect.brainCapacity);
  }
  if (effect.energyTank) state.energyTankBonus += effect.energyTank;
  if (history) {
    state.history.push({ class_tsid: id, cost, amount, when: now });
    if (state.history.length > 200) state.history.splice(0, state.history.length - 200);
  }
  return effect;
}

/**
 * imagination_purchase_upgrade by hand slot. `wallet` is { imagination }.
 * On success spends iMG, grants, empties the slot and refills the hand.
 * @returns {{ ok: boolean, reason?: string, card?: object, effect?: object, text?: object }}
 */
export function purchaseCard(state, owned, wallet, slot, ctx = {}, { rng = Math.random, now = Date.now() } = {}) {
  const card = state.hand[slot];
  if (!card) return { ok: false, reason: 'That card is not in your hand.' };
  const u = IMAGINATION_UPGRADES[card.class_tsid];
  if (!u) return { ok: false, reason: 'That upgrade does not exist.' };
  if (u.max_uses && owned.includes(card.class_tsid)) return { ok: false, reason: 'You already have that upgrade.' };
  if (finite(wallet.imagination) < card.cost) return { ok: false, reason: 'Not enough imagination!' };
  const text = cardText(card, ctx);
  wallet.imagination = finite(wallet.imagination) - card.cost;
  const effect = grantUpgrade(state, owned, card.class_tsid, { amount: card.amount, cost: card.cost, now });
  // Brain capacity at its limit or the quoin multiplier at its cap removes every copy.
  const stripAll =
    (card.class_tsid === 'brain_capacity' && state.brainCapacity >= BRAIN_CAPACITY_LIMIT) ||
    (card.class_tsid === 'quoin_multiplier' && finite(ctx.quoinMultiplier, 1) + finite(effect.quoinMultiplier) >= QUOIN_MULTIPLIER_LIMIT);
  if (stripAll) {
    for (let i = 0; i < HAND_SIZE; i += 1) if (state.hand[i]?.class_tsid === card.class_tsid) state.hand[i] = null;
  } else {
    state.hand[slot] = null;
  }
  const nextCtx = {
    ...ctx,
    owned,
    brainCapacity: state.brainCapacity,
    maxEnergy: finite(ctx.maxEnergy, 100) + finite(effect.energyTank),
    quoinMultiplier: finite(ctx.quoinMultiplier, 1) + finite(effect.quoinMultiplier),
  };
  dealHand(state, nextCtx, rng);
  return { ok: true, card, effect, text };
}

/** Whether today's free re-deal is still available. */
export function canFreeReshuffle(state, dayKey) {
  return state.shuffledDay !== String(dayKey);
}

/**
 * imagination_reshuffle_hand. `free` uses the daily re-deal; otherwise the
 * caller has already consumed a Reshuffle Card.
 */
export function reshuffleHand(state, ctx = {}, { dayKey = '', free = true, rng = Math.random } = {}) {
  if (free && !canFreeReshuffle(state, dayKey)) return { ok: false, reason: "You've already re-dealt today" };
  if (free) state.shuffledDay = String(dayKey);
  state.shuffles += 1;
  state.hand = Array(HAND_SIZE).fill(null);
  dealHand(state, ctx, rng);
  return { ok: true };
}

/**
 * Grant the tutorial cards once per save. Returns the ids newly granted.
 */
export function grantStarterUpgrades(state, owned, now = Date.now()) {
  if (state.starterGranted) return [];
  const added = [];
  for (const id of STARTER_UPGRADES) {
    if (owned.includes(id)) continue;
    grantUpgrade(state, owned, id, { now, history: false });
    added.push(id);
  }
  state.starterGranted = true;
  return added;
}

/**
 * The stacked imagination physics (addImaginationPhysics): the source starts
 * from SOURCE_DEFAULT_PHYSICS and each owned walk/jump/triple card overrides
 * one field. Returns source multipliers.
 */
export function imaginationPhysics(owned) {
  const set = asSet(owned);
  const out = { ...SOURCE_DEFAULT_PHYSICS, can_3_jump: 0, multiplier_3_jump: 1, can_wall_jump: 0 };
  // Apply in purchase-independent tier order so the best tier wins.
  const ids = Object.keys(IMAGINATION_UPGRADES)
    .filter((id) => set.has(id) && IMAGINATION_UPGRADES[id].rewards.some((r) => r.type === 1))
    .sort((a, b) => physicsOrder(a) - physicsOrder(b));
  for (const id of ids) {
    const data = IMAGINATION_UPGRADES[id].rewards.find((r) => r.type === 1).data;
    for (const key of ['vx_max', 'vy_jump', 'gravity', 'can_3_jump', 'multiplier_3_jump', 'can_wall_jump']) {
      if (data[key] !== undefined && data[key] !== null) out[key] = data[key];
    }
  }
  return out;
}

function physicsOrder(id) {
  const m = id.match(/_(\d+)$/);
  return m ? Number(m[1]) : 0;
}

/**
 * Remake movement multipliers. The remake's tuned walk and jump are the
 * source's post-tutorial values (Walk Speed II vx 0.8268, High Jumper II
 * vy 1.0), so later cards scale relative to those.
 */
export const REMAKE_BASELINE_PHYSICS = Object.freeze({ vx_max: 0.8268, vy_jump: 1, gravity: 1 });

export function remakeMovementMultipliers(owned) {
  const p = imaginationPhysics(owned);
  return {
    speed: Math.max(1, p.vx_max / REMAKE_BASELINE_PHYSICS.vx_max),
    jump: Math.max(1, p.vy_jump / REMAKE_BASELINE_PHYSICS.vy_jump),
    gravity: 1,
  };
}

/** Category learning reductions (reward type 9, applyCategoryReduction): category id → total percent. */
export function learnTimeReductions(owned) {
  const set = asSet(owned);
  const out = {};
  for (const id of set) {
    const u = IMAGINATION_UPGRADES[id];
    const r = u?.rewards.find((x) => x.type === 9);
    if (!r) continue;
    const cat = Number(r.data.category_id);
    out[cat] = Math.max(out[cat] || 0, Number(r.data.percent) || 0);
  }
  return out;
}

/** Owned list with display text, newest purchase first. */
export function ownedUpgradeList(state, owned) {
  return [...asSet(owned)]
    .filter((id) => IMAGINATION_UPGRADES[id])
    .map((id) => {
      const u = IMAGINATION_UPGRADES[id];
      const count = state.counts[id] || 1;
      let name = u.name;
      if (u.options) {
        const total = state.history
          .filter((h) => h.class_tsid === id)
          .reduce((sum, h) => sum + finite(h.amount), 0);
        name = u.name.replace(/\{amount\}/g, id === 'quoin_multiplier' ? total.toFixed(2) : String(total));
      }
      return { id, name, desc: u.desc, config: u.config, count, when: state.purchasedAt[id] || 0, starter: STARTER_UPGRADES.includes(id) };
    })
    .sort((a, b) => b.when - a.when || a.name.localeCompare(b.name));
}
