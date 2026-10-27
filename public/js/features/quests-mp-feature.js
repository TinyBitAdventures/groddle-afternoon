/**
 * Quests that need other players, between real players (register G329).
 * The rules, the sources and what was left out are js/quests-mp.js.
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')): in solo
 * nothing here runs, no hook answers, and the quests stay left out.
 *
 * - Offers: quest-offers-feature asks questsMpContext; the answer lets the
 *   familiar offer the multiplayer quests (by their own trigger, or by a
 *   fact this feature keeps: on a friend's home street with their key, or
 *   on any other player's home street) and says whether a Give to a player
 *   is live (engine.query('playerGiveReady'), G332).
 * - Counters the server or the site confirmed, as the source's names
 *   (engine.achievement, so quest-offers routes them to the accepted quest):
 *   bootleg_hooch from a vendor sale (vendor_sold:hooch) and from a settled
 *   trade (the server's trade_done, once per trade id); give_* from a Give
 *   the giver's client was told went through (items_given:<class> with
 *   { to, toLevel, count }: $S/lanes/quests/API.md); meditate_10players
 *   from meditation-feature's meditated_together (the server's peak of
 *   others meditating at once) of 10 or more. make_hooch is supply-feature's,
 *   transcendence_5players meditation-feature's, the neighbour counters
 *   neighbours-mp-feature's.
 * - Race quests: the server's race_waiting to the challenger logs the
 *   course's quest, started; race_failed (refund: the challenger's own
 *   challenge) fails it; race_end with you the winner sets
 *   multiplayer_quest_win, anyone else winning fails it; arriving on a
 *   street that is no race afterwards sets race_leave, which completes it.
 *   These flags are routed to the race quest alone (the solo Great Hog Haul,
 *   hogtie_piggy, has the same two flags).
 *
 * QA: canvas data questsMpFacts (facts kept), questsMpRace (course:state of
 * the race quest in hand), questsMpLast (the last thing counted);
 * window.groddleQuestsMp in multiplayer.
 */

import {
  acceptOffer,
  ensureQuestOfferState,
  questAwardPayload,
  routeQuestEvent,
  turnInQuest,
} from '../quest-offers.js';
import { addItem, removeItem, countItem } from '../inventory.js?v=catalog-unified-7';
import { getQuestCatalog } from '../content-catalogs.js';
import {
  MP_FACTS,
  MP_QUEST_COUNTERS as C,
  MP_RACE_QUESTS,
  giveCounters,
  isRaceStreet,
  normalizeQuestsMpSlice,
  tradeHoochCount,
} from '../quests-mp.js?v=g329-2';

export const QUESTS_MP_FEATURE_ID = 'quests-mp';
const FACT_CHECK_MS = 1_000;
/** "Meditate with 10 players" (meditative_arts_with_friends r438): the other players meditating at once. */
export const MEDITATE_TOGETHER = 10;

let slice = normalizeQuestsMpSlice(null);
let session = null;

function isMp(engine) {
  return engine?.mode === 'multiplayer' && Boolean(engine.query?.('realtimeClient'));
}

function rewardCtx(engine) {
  return { inv: engine.inv, pc: engine.pc, addItem, removeItem, countItem, managedOnly: true };
}

function createSession(engine, client) {
  /** match id -> course, for race_end (which names only the match). */
  const matches = new Map();
  let last = '';
  let nextFactCheck = 0;

  const me = () => Number(client.me?.id) || 0;
  const qs = () => engine.questState;
  const title = (id) => getQuestCatalog()[id]?.title || id;

  function publish() {
    engine.setData?.('questsMpFacts', Object.keys(slice.facts).sort().join(','));
    const race = MP_RACE_QUESTS.find((id) => qs().active?.[id]);
    const p = race ? qs().active[race].progress || {} : null;
    engine.setData?.('questsMpRace', race ? `${race}:${p[C.raceWin] ? 'won' : 'started'}` : '');
    engine.setData?.('questsMpLast', last);
  }

  function note(text) {
    last = text;
    publish();
  }

  function fact(name) {
    if (slice.facts[name]) return;
    slice.facts[name] = Date.now();
    note(`fact:${name}`);
    engine.save?.();
  }

  /** A counter the source increments (quests_inc_counter): quest-offers routes it. */
  function count(counter, amount, why) {
    if (!(amount > 0)) return;
    engine.achievement?.(counter, amount);
    note(`${counter}+${amount}:${why}`);
  }

  /** Once per receiver within the accepted quest's run (the source's per-target hashes). */
  function countOnce(questId, counter, label, why) {
    if (!qs().active?.[questId]) return;
    const offers = ensureQuestOfferState(qs());
    const seen = ((offers.distinct[questId] ||= {})[counter] ||= []);
    if (seen.includes(label)) return;
    seen.push(label);
    count(counter, 1, why);
  }

  function finish(rows) {
    for (const row of rows || []) {
      const done = turnInQuest(qs(), row.classTsid, engine.pc, rewardCtx(engine));
      if (!done.ok) continue;
      engine.playSound?.('COMPLETE_QUEST_REQUIREMENT', { volume: 0.6 });
      engine.award?.(questAwardPayload(row.def, done.rewards || {}));
      engine.pushActivity?.(`Quest complete: ${row.def.title}`);
      engine.refreshPack?.();
    }
  }

  /** A race quest's own flag, routed to it alone. */
  function raceFlag(course, flag) {
    if (!qs().active?.[course]) return;
    const result = routeQuestEvent(qs(), flag, 1, { ...rewardCtx(engine), only: course });
    finish(result.completable);
    note(`${course}:${flag}`);
    engine.updateHud?.();
    engine.save?.();
  }

  /** quest.js onAccept -> onRestart: the challenge is the quest (repeatable: again after a win). */
  function logRace(course) {
    if (!MP_RACE_QUESTS.includes(course)) return;
    const active = qs().active?.[course];
    if (active) {
      // Started again (onRestart: init_reqs): a quest left from a race that never ended here.
      for (const key of Object.keys(active.progress || {})) active.progress[key] = 0;
      active.startedAt = Date.now();
    } else {
      const result = acceptOffer(qs(), course, rewardCtx(engine));
      if (!result.ok) return;
      engine.pushActivity?.(`New quest: ${title(course)}`);
    }
    note(`${course}:logged`);
    engine.updateHud?.();
    engine.save?.();
  }

  /** failQuest (inc_quests.js 456-465): a repeatable quest leaves the log for fail_repeat. */
  function failRace(course, why) {
    if (!qs().active?.[course]) return;
    delete qs().active[course];
    const offers = ensureQuestOfferState(qs());
    delete offers.managed[course];
    delete offers.distinct[course];
    note(`${course}:failed:${why}`);
    engine.updateHud?.();
    engine.save?.();
  }

  client.on('msg:race_waiting', (msg) => {
    if (Number(msg?.from) === me() && me()) logRace(String(msg.course || ''));
  });
  client.on('msg:race_failed', (msg) => {
    // The challenger's own challenge expired or was withdrawn (refund: the ticket comes back).
    if (msg?.refund === true) failRace(String(msg.course || ''), 'nobody');
  });
  client.on('msg:race_match', (msg) => {
    const course = String(msg?.course || '');
    if (msg?.match && MP_RACE_QUESTS.includes(course)) {
      matches.set(String(msg.match), course);
      while (matches.size > 8) matches.delete(matches.keys().next().value);
    }
  });
  client.on('msg:race_end', (msg) => {
    const course = matches.get(String(msg?.match || ''));
    if (!course || !qs().active?.[course]) return;
    if (Number(msg.winner?.id) === me() && me()) raceFlag(course, C.raceWin);
    else failRace(course, msg.winner ? 'lost' : String(msg.why || 'over'));
  });
  client.on('msg:trade_done', (msg) => {
    const id = String(msg?.trade || '');
    if (!id || slice.trades.includes(id)) return;
    const n = tradeHoochCount(msg.gave);
    if (!n) return;
    slice.trades = [...slice.trades, id].slice(-50);
    count(C.bootlegHooch, n, `trade:${id}`);
    engine.save?.();
  });

  return {
    client,
    get slice() { return slice; },
    get last() { return last; },
    tick(now) {
      if (now < nextFactCheck) return;
      nextFactCheck = now + FACT_CHECK_MS;
      const visiting = engine.query?.('neighboursVisiting', engine);
      if (visiting?.owner && visiting.owner !== me()) {
        fact(MP_FACTS.visitNeighbour);
        if (visiting.key === true) fact(MP_FACTS.tendNeighbour);
      }
    },
    onEvent(counter, amount, detail) {
      const name = String(counter || '');
      // hooch.js onSell 145-147: hooch sold to a vendor is bootlegged too.
      if (name === 'vendor_sold:hooch') count(C.bootlegHooch, Math.max(1, Math.floor(Number(amount) || 1)), 'sold');
      // Ours (GSJS never sets it): 10 other players meditating at once during one meditation (G330's server count).
      else if (name === C.meditatedTogether && Number(amount) >= MEDITATE_TOGETHER) count(C.meditateTen, 1, `meditated:${amount}`);
      else if (name.startsWith('items_given:')) {
        const give = { classTsid: name.slice('items_given:'.length), count: detail?.count, to: detail?.to, toLevel: detail?.toLevel };
        for (const row of giveCounters(give)) {
          if (!row.label) count(row.counter, row.amount, 'give');
          else if (row.counter === C.giveScript) {
            // teleportation_script.js onGive 285-289: once per receiver, kept for good.
            if (slice.scriptsGiven.includes(row.label)) continue;
            slice.scriptsGiven = [...slice.scriptsGiven, row.label].slice(-200);
            if (qs().active?.teleportation_make_and_hand_out_tp_scripts) count(row.counter, 1, `give:${row.label}`);
          } else countOnce('kindly_randomness', row.counter, row.label, `give:${row.label}`);
        }
      }
    },
    streetEnter(street) {
      // location.js 533-538: a location that is no race sets race_leave.
      if (isRaceStreet(engine.streetTsid) || engine.inScene?.()) return;
      for (const course of MP_RACE_QUESTS) {
        if (qs().active?.[course]?.progress?.[C.raceWin]) raceFlag(course, C.raceLeave);
      }
    },
    context() {
      return { facts: { ...slice.facts }, ready: { give: engine.query?.('playerGiveReady', engine) === true, auctions: engine.query?.('auctionsReady', engine) === true } };
    },
  };
}

function ensure(engine) {
  if (session) return session;
  if (!isMp(engine)) return null;
  session = createSession(engine, engine.query('realtimeClient'));
  globalThis.groddleQuestsMp = session;
  return session;
}

export const questsMpFeature = {
  id: QUESTS_MP_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine)?.tick(now);
  },

  onEvent(counter, amount, engine, detail) {
    if (engine.mode !== 'multiplayer') return;
    ensure(engine)?.onEvent(counter, amount, detail);
  },

  onStreetEnter(street, engine) {
    if (engine.mode !== 'multiplayer') return;
    ensure(engine)?.streetEnter(street);
  },

  /** quest-offers-feature questContext: the multiplayer quests may be offered (js/quests-mp.js). */
  questsMpContext(engine) {
    if (engine?.mode !== 'multiplayer') return null;
    return ensure(engine)?.context() || null;
  },

  save() {
    const s = slice;
    if (!Object.keys(s.facts).length && !s.trades.length && !s.scriptsGiven.length) return undefined;
    return { facts: s.facts, trades: s.trades, ...(s.scriptsGiven.length ? { scriptsGiven: s.scriptsGiven } : {}) };
  },

  restore(seed, engine) {
    slice = engine?.mode === 'multiplayer' ? normalizeQuestsMpSlice(seed) : normalizeQuestsMpSlice(null);
  },
};
