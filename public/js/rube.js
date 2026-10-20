/**
 * The Rube: a mysterious trader who turns up on a street now and then,
 * walks over, and offers a lopsided swap from his pockets for something in
 * your pack, five offers at most, then fades away.
 *
 * Source (Tiny Speck GameServerJS, CC0):
 *   locations/inc_npcs.js  location_spawns on every street entry: fewer than
 *                          2 trades today, a street that can host him (no
 *                          instance, POL, Hell, or hubs 77/96/122/132), 0.5%
 *                          a visit, x2 under Rubeweed, x2 when 10+ game days
 *                          (4 h each) since the last trade, Rube Radar raises
 *                          it to 1%; never within an hour of a trade; only if
 *                          the pack holds something under 2,500 he can take.
 *                          tryRubeLure: the Rube Lure buff spawns him at once.
 *   items/npc_rube.js      makeOffer, talk_to, onConversation, resetOffer
 *                          (gone 4.3 s after a deal ends, fade_out 6 s),
 *                          max_offers 5, RUBE_APPEARS music
 *   items/essence_of_rubeweed.js  imbibe -> rube_lure (once a game day;
 *                          not within 30 min of a trade, nor after 3 trades)
 *   players/inc_stats.js / player.js  rube_trades (reset daily),
 *                          last_rube_trade
 *   inc_data_imagination.js  rube_better_items (level +10 for the floor),
 *                          rube_chance_to_meet
 */

export const RUBE_CLASS = 'npc_rube';
export const RUBE_BASE_CHANCE = 0.005;
export const RUBE_RADAR_CHANCE = 0.01;
export const RUBE_MAX_OFFERS = 5;
export const RUBE_DAILY_TRADES = 2;
export const RUBE_LURE_MAX_TRADES = 3;
export const RUBE_TRADE_COOLDOWN_MS = 60 * 60 * 1000;
export const RUBE_LURE_COOLDOWN_MS = 30 * 60 * 1000;
export const RUBE_GAME_DAY_MS = 4 * 60 * 60 * 1000;
export const RUBE_BANNED_HUBS = Object.freeze(['77', '96', '122', '132']);
export const RUBE_MAX_RECEIVE_COST = 2500;
export const RUBE_LEAVE_MS = 4300;
export const RUBE_FADE_MS = 6000;
export const RUBE_LURE_TICK_MS = 5000;

export const RUBE_TEXT = Object.freeze({
  arrived: 'The Rube is here to trade with you!',
  hello: (name) => `Hey, ${name}! Come talk to me if you'd like to trade.`,
  accept: 'Great deal, great deal!',
  brigand: 'Brigand!',
  noRoom: 'Oh dear. You do not have enough room to carry that. Please make some space and come back to talk to me.',
  nothingElse: 'I cannot find anything else I wish to part with. Next time, next time...',
  noDeals: Object.freeze([
    'Sorry, no deals today, my friend. I think I hear the missus calling!',
    "Too rich for my blood, friend. You'll need to stock some cheaper goods.",
    "On second thought, I can't bear to part with any of these wonderful things. Next time, next time…",
  ]),
  patience: 'I only have so much patience!',
  lastChance: 'Last chance!',
  done: 'The Rube is done trading for the time being.',
  tooltip: 'The Rube is bad at trading. Try it!',
  imbibe: "Something smells weird—like moss and seawater and… olives? Wait, it's you! Ugh, this had better be worth it.",
  alreadyLured: (name) => `You are already under the effects of ${name}.`,
  reek: 'You still reek strongly of Rube smell. Using this again will have no effect.',
  cantFind: "The Rube won't be able to find you here.",
  welcome: "You've recently traded with the Rube. Don't wear out your welcome!",
  yes: 'Sounds great!',
  redo: 'What else do you have?',
  no: 'No thanks.',
});

const asSet = (v) => (v instanceof Set ? v : new Set(Array.isArray(v) ? v : []));
const whole = (v) => Math.max(0, Math.floor(Number(v) || 0));

/* ------------------------------------------------------------ state */

export function createRubeState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  return {
    tradesToday: whole(s.tradesToday),
    lastTrade: whole(s.lastTrade),
    totalTrades: whole(s.totalTrades),
    visits: whole(s.visits),
    day: String(s.day || ''),
    lureDisabled: s.lureDisabled === true,
    lureActive: s.lureActive === true,
    history: Array.isArray(s.history) ? s.history.slice(-20) : [],
  };
}

/** player.js new day: rube_trades back to 0, the lure usable again. */
export function rollRubeDay(state, dayKey) {
  if (state.day === dayKey) return false;
  state.day = dayKey;
  state.tradesToday = 0;
  state.lureDisabled = false;
  return true;
}

/* ------------------------------------------------------------ catalog */

/** Base cost of a pack item for the Rube (0 = he will not touch it). */
export function rubeCost(catalog, classTsid) {
  return Number(catalog?.[classTsid]?.baseCost) || 0;
}

/** Pack stacks the Rube could take (getAllContents filter in location_spawns). */
export function tradeablePack(inv, catalog, filter = () => true) {
  const out = [];
  for (const [id, n] of Object.entries(inv || {})) {
    if (!(Number(n) > 0)) continue;
    const row = catalog?.[id];
    if (!row || !row.baseCost || row.doll) continue;
    if (row.baseCost >= RUBE_MAX_RECEIVE_COST) continue;
    if (filter(row, id)) out.push(id);
  }
  return out;
}

/* ------------------------------------------------------------ spawning */

/** can_spawn_rube for a street. */
export function streetCanHostRube({ instance = false, home = false, hell = false, hubId = '' } = {}) {
  return !instance && !home && !hell && !RUBE_BANNED_HUBS.includes(String(hubId));
}

/** location_spawns rube_chance. */
export function rubeSpawnChance({ rubeweed = false, lastTrade = 0, now = Date.now(), upgrades = [] } = {}) {
  let chance = RUBE_BASE_CHANCE;
  const daysSince = Math.floor((now - (lastTrade || 0)) / RUBE_GAME_DAY_MS);
  if (rubeweed) chance *= 2;
  if (daysSince >= 10) chance *= 2;
  if (asSet(upgrades).has('rube_chance_to_meet') && chance < RUBE_RADAR_CHANCE) chance = RUBE_RADAR_CHANCE;
  return chance;
}

/**
 * Does the Rube turn up on this street entry? ctx: { street (for
 * streetCanHostRube), inv, catalog, now, rubeweed, upgrades, lure }.
 * Returns { spawn, reason, chance, roll }.
 */
export function rubeEntryCheck(state, ctx = {}, rng = Math.random) {
  const now = ctx.now ?? Date.now();
  if (!streetCanHostRube(ctx.street)) return { spawn: false, reason: 'street' };
  if (ctx.lure) {
    return { spawn: true, reason: 'lure', chance: 1 };
  }
  if (state.tradesToday >= RUBE_DAILY_TRADES) return { spawn: false, reason: 'trades' };
  if (state.lastTrade && now - state.lastTrade < RUBE_TRADE_COOLDOWN_MS) return { spawn: false, reason: 'cooldown' };
  const chance = rubeSpawnChance({ rubeweed: ctx.rubeweed, lastTrade: state.lastTrade, now, upgrades: ctx.upgrades });
  const roll = rng();
  if (!(roll < chance)) return { spawn: false, reason: 'roll', chance, roll };
  if (!tradeablePack(ctx.inv, ctx.catalog).length) return { spawn: false, reason: 'pack', chance, roll };
  return { spawn: true, reason: 'roll', chance, roll };
}

/** essence_of_rubeweed imbibe conditions. */
export function imbibeCheck(state, ctx = {}) {
  const now = ctx.now ?? Date.now();
  if (ctx.dead) return { ok: false, msg: 'You are too dead for that now.' };
  if (state.lureActive) return { ok: false, msg: RUBE_TEXT.alreadyLured('Essence of Rubeweed') };
  if (state.lureDisabled) return { ok: false, msg: RUBE_TEXT.reek };
  if (!streetCanHostRube(ctx.street)) return { ok: false, msg: RUBE_TEXT.cantFind };
  if (state.tradesToday >= RUBE_LURE_MAX_TRADES) return { ok: false, msg: RUBE_TEXT.welcome };
  if (state.lastTrade && now - state.lastTrade < RUBE_LURE_COOLDOWN_MS) return { ok: false, msg: RUBE_TEXT.welcome };
  return { ok: true };
}

export function imbibeRubeweed(state, inv, ctx = {}) {
  const check = imbibeCheck(state, ctx);
  if (!check.ok) return check;
  if (!(Number(inv?.essence_of_rubeweed) > 0)) return { ok: false, msg: 'You have no Essence of Rubeweed.' };
  inv.essence_of_rubeweed -= 1;
  if (inv.essence_of_rubeweed <= 0) delete inv.essence_of_rubeweed;
  state.lureActive = true;
  state.lureDisabled = true;
  return { ok: true, msg: RUBE_TEXT.imbibe };
}

/* ------------------------------------------------------------ offers */

/** makeOffer's minimum base cost of what he gives, by level (+10 with Rube's Favorite). */
export function rubeMinBaseCost(level, upgrades = []) {
  let lvl = Number(level) || 0;
  if (asSet(upgrades).has('rube_better_items')) lvl += 10;
  if (lvl < 10) return 1;
  if (lvl < 20) return 10;
  if (lvl < 30) return 20;
  if (lvl < 40) return 30;
  if (lvl < 50) return 50;
  return 100;
}

export function createRubeVisit({ summoned = false, playerName = 'friend' } = {}) {
  return {
    offerGive: null,
    offerReceive: null,
    offerCount: 0,
    previous: {},
    done: false,
    summoned,
    playerName,
  };
}

/**
 * npc_rube makeOffer: up to 7 tries to pair a random catalog item (above the
 * level floor; rube_special 20%; dolls only when summoned, 10%, and you hold
 * something worth 1,500+) with a pack item worth 1/6 to 1/2 of it (from try 4
 * any pack item worth no more than it), never a pair offered before.
 * Mutates the visit; returns true when an offer stands.
 * ctx: { inv, catalog, level, upgrades }
 */
export function makeRubeOffer(visit, ctx = {}, rng = Math.random) {
  visit.offerGive = null;
  visit.offerReceive = null;
  if (visit.offerCount >= RUBE_MAX_OFFERS) return false;
  const catalog = ctx.catalog || {};
  const minBc = rubeMinBaseCost(ctx.level, ctx.upgrades);
  const inv = ctx.inv || {};
  const allGive = Object.keys(catalog).filter((id) => catalog[id].art !== false);
  let tries = 0;
  let ignoreBaseCosts = false;
  let give = null;
  let receive = null;
  let already = false;
  do {
    give = null;
    receive = null;
    already = false;
    tries += 1;
    if (tries >= 4) ignoreBaseCosts = true;
    const candidates = allGive.slice();
    do {
      const i = Math.floor(rng() * candidates.length);
      const id = candidates[i];
      const row = catalog[id];
      let canOffer = false;
      if (row?.baseCost) {
        if (row.doll) {
          canOffer = visit.summoned && rng() < 0.1 && tradeablePack(inv, catalog, (r) => r.baseCost >= 1500).length > 0;
        } else if (row.baseCost > minBc && (!row.special || rng() < 0.2)) {
          canOffer = true;
        }
      }
      if (canOffer) give = id;
      else candidates.splice(i, 1);
    } while (candidates.length && !give);
    if (!give) continue;
    const giveCost = catalog[give].baseCost;
    let contents;
    if (ignoreBaseCosts) contents = tradeablePack(inv, catalog, (r) => r.baseCost <= giveCost);
    else if (catalog[give].doll) contents = tradeablePack(inv, catalog, (r) => r.baseCost >= 1500);
    else contents = tradeablePack(inv, catalog, (r) => r.baseCost >= giveCost / 6 && r.baseCost <= giveCost / 2);
    if (contents.length) receive = contents[Math.floor(rng() * contents.length)];
    if (give && receive && visit.previous[`${give}--${receive}`]) already = true;
  } while (tries < 7 && (!give || !receive || already));
  if (give && receive && !already) {
    visit.offerCount += 1;
    visit.previous[`${give}--${receive}`] = 1;
    visit.offerGive = give;
    visit.offerReceive = receive;
    return true;
  }
  return false;
}

/** "I'll give you a Pick for one of your Cherries. OK?" plus the patience notes. */
export function rubeOfferText(visit, catalog, { redo = false } = {}) {
  const give = catalog[visit.offerGive];
  const receive = catalog[visit.offerReceive];
  if (!give || !receive) return '';
  let txt = `I'll give you ${give.article} ${give.single} for one of your ${receive.plural}. OK?`;
  if (redo) {
    if (visit.offerCount === RUBE_MAX_OFFERS - 1) txt += `\n\n${RUBE_TEXT.patience}`;
    if (visit.offerCount === RUBE_MAX_OFFERS) txt += `\n\n${RUBE_TEXT.lastChance}`;
  }
  if (visit.offerCount > RUBE_MAX_OFFERS - 2) txt += ` (${visit.offerCount}/${RUBE_MAX_OFFERS})`;
  return txt;
}

/**
 * talk_to: keep a standing offer if the pack still holds his ask, else make
 * a fresh one (offer_count reset). Returns { ok, text } or a no-deal line.
 */
export function rubeTalk(visit, ctx = {}, rng = Math.random) {
  if (visit.done) return { ok: false, text: RUBE_TEXT.done, done: true };
  const catalog = ctx.catalog || {};
  const has = (id) => Number(ctx.inv?.[id]) > 0;
  if (!visit.offerGive || !visit.offerReceive || !has(visit.offerReceive)) {
    visit.offerCount = 0;
    makeRubeOffer(visit, ctx, rng);
    if (!visit.offerGive || !visit.offerReceive || !has(visit.offerReceive)) {
      visit.done = true;
      const lines = RUBE_TEXT.noDeals;
      return { ok: false, text: lines[Math.floor(rng() * lines.length)], ended: true };
    }
  }
  return { ok: true, text: rubeOfferText(visit, catalog) };
}

/** "What else do you have?" */
export function rubeRedo(visit, ctx = {}, rng = Math.random) {
  makeRubeOffer(visit, ctx, rng);
  if (visit.offerGive && visit.offerReceive) return { ok: true, text: rubeOfferText(visit, ctx.catalog || {}, { redo: true }) };
  visit.done = true;
  return { ok: false, text: RUBE_TEXT.nothingElse, ended: true, state: 'offer_reject' };
}

/** "No thanks." */
export function rubeDecline(visit) {
  visit.done = true;
  visit.offerGive = null;
  visit.offerReceive = null;
  return { ok: true, ended: true, state: 'offer_reject' };
}

/**
 * "Sounds great!": take one of his ask, give his item, count the trade
 * (rube_trades for the day, last trade time). Missing item = "Brigand!".
 */
export function rubeAccept(visit, state, inv, now = Date.now()) {
  const give = visit.offerGive;
  const receive = visit.offerReceive;
  visit.done = true;
  visit.offerGive = null;
  visit.offerReceive = null;
  if (!give || !receive || !(Number(inv?.[receive]) > 0)) {
    return { ok: false, text: RUBE_TEXT.brigand, state: 'offer_reject', ended: true };
  }
  inv[receive] -= 1;
  if (inv[receive] <= 0) delete inv[receive];
  inv[give] = (Number(inv[give]) || 0) + 1;
  state.tradesToday += 1;
  state.totalTrades += 1;
  state.lastTrade = now;
  state.history.push({ give, receive, at: now });
  if (state.history.length > 20) state.history.shift();
  return { ok: true, text: RUBE_TEXT.accept, give, receive, state: 'offer_accept', ended: true };
}
