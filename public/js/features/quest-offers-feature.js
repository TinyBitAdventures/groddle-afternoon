/**
 * The Magic Rock's quest offers (js/quest-offers.js) as a feature module.
 *
 * Offers arrive one at a time like the original familiar: checked shortly
 * after a street loads and every 30 seconds, never while a dialogue, award,
 * timed action, or private instance is in progress. Accepted quests advance
 * from every badge counter the game emits (onEvent) and from the pack (item
 * and currant requirements), and turn in automatically when complete (unless
 * their end NPC is one the world spawns: vendor-npcs-feature.js). Story
 * and starter quests keep their own progress path (managedOnly routing).
 *
 * A check that falls while a street loading card is up does not count: it
 * waits and runs again as soon as the card has gone (G200). Before, busy()
 * (the card is a blocking screen) spent it and the next check came 30 s
 * later, so an offer due on arrival waited up to a full 30 s after the card
 * (QA 23.6 s). The client held quest conversations under the card and showed
 * them once it had gone (QuestsDialog.as onEmergencyTick 338, G192).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=now offers the first
 * pending quest immediately; &questofferautoplay=accept accepts it. Other QA
 * routes (any *demo or *autoplay param) get no offers; ?questoffer=off
 * silences them anywhere. &questofferaward=1 queues an award screen when a
 * check first falls under a loading card (G213: the screen shows as the card
 * goes and the check looks again every second while it is up); canvas
 * questOfferAfterCardMs is the wait from the card going to the offer.
 */

import {
  acceptOffer,
  declineOffer,
  ensureQuestOfferState,
  heldForNpcTurnIn,
  markOffered,
  nextQuestOffer,
  questAwardPayload,
  routeQuestEvent,
  syncItemRequirements,
  tickQuestTimers,
  turnInQuest,
} from '../quest-offers.js';
import { addItem, removeItem, countItem } from '../inventory.js?v=catalog-unified-4';

const OFFER_CHECK_MS = 30_000;
const STREET_ENTER_DELAY_MS = 4_000;
const SYNC_MS = 1_000;
/** G213: how soon a check spent by an award or new-day screen looks again. */
const SCREEN_RETRY_MS = 1_000;

let nextOfferCheckAt = 0;
let nextSyncAt = 0;
let offerOpen = false;
/** A check fell while a street loading card was up: run it once the card has gone (G200). */
let heldByCard = false;
/** When the card that held a check went (QA: questOfferAfterCardMs). */
let cardGoneAt = 0;
let qaAwardQueued = false;
/** Offers are suppressed on QA routes and with ?questoffer=off. */
let quiet = false;
/** Pack counts at the last sync, for `in_inventory:<item>` gain events. */
let lastPack = null;
// Musicblocks and Cubimals already emit in_inventory through their badges.
const PACK_GAIN_SKIP = /^(musicblock_|npc_cubimal_)/;

function questContext(engine, now = Date.now()) {
  const street = engine.street || {};
  return {
    level: engine.pc.level,
    xp: engine.pc.xp,
    skills: engine.learnedSkills,
    achievements: engine.unlockedAchievements,
    inv: engine.inv,
    buffs: engine.activeBuffIds(),
    hub: street.hubId || '',
    street: street.label || '',
    streetTsid: engine.streetTsid,
    // create_giant_icon's offer trigger (items/include/shrines.js: 4+ emblems of one Giant).
    emblemsMax: Math.max(0, ...Object.values(engine.shrineState?.emblems || {}).map((n) => Number(n) || 0)),
    now,
    pc: engine.pc,
    addItem,
    removeItem,
    countItem,
    managedOnly: true,
    // `custom_code` prerequisites (GSJS canOffer) answered by the feature that owns them.
    customPrereq: (id, prereq) => engine.questCustomPrereq?.(id, prereq) === true,
  };
}

function finish(rows, engine) {
  for (const row of rows || []) {
    // A quest whose end NPC stands in the world waits for a talk with it (vendor-npcs-feature).
    if (heldForNpcTurnIn(row.def)) continue;
    const done = turnInQuest(engine.questState, row.classTsid, engine.pc, questContext(engine));
    if (!done.ok) continue;
    engine.playSound('COMPLETE_QUEST_REQUIREMENT', { volume: 0.6 });
    engine.award(questAwardPayload(row.def, done.rewards || {}));
    engine.pushActivity(`Quest complete: ${row.def.title}`);
    engine.refreshPack();
    engine.save();
    nextOfferCheckAt = Math.min(nextOfferCheckAt, Date.now() + STREET_ENTER_DELAY_MS);
  }
}

function presentOffer(engine, now = Date.now()) {
  if (offerOpen || engine.busy() || engine.questOffersHeld?.()) return false;
  const qs = engine.questState;
  const card = nextQuestOffer(qs, engine.pc, questContext(engine, now));
  if (!card || card.waiting) {
    if (card?.waiting) nextOfferCheckAt = now + Math.max(1_000, card.waiting);
    return false;
  }
  markOffered(qs, card.classTsid, now);
  offerOpen = true;
  engine.setData('questOffer', card.classTsid);
  engine.playSound('QUEST_OFFER', { volume: 0.55 });
  const accept = () => {
    offerOpen = false;
    const result = acceptOffer(qs, card.classTsid, questContext(engine));
    engine.setData('questOfferResult', result.ok ? 'accepted' : result.reason || 'failed');
    if (result.ok) {
      engine.pushActivity(`New quest: ${card.def.title}`);
      engine.refreshPack();
      // A rebuilt quest room turns its own quest in: a room quest with no
      // requirements (Le Misérable, Gwendolyn's Task) must not complete on accept.
      if (result.completable?.length && !card.def.instanceRoom) finish([{ classTsid: card.classTsid, def: card.def }], engine);
    }
    engine.save();
  };
  const decline = () => {
    offerOpen = false;
    declineOffer(qs, card.classTsid, Date.now());
    engine.setData('questOfferResult', 'declined');
    engine.pushActivity(`You can accept “${card.def.title}” from your quest log later.`);
    engine.save();
  };
  engine.offerQuestDialogue({
    title: card.def.title,
    kicker: 'Magic Rock',
    beats: card.beats,
    acceptLabel: card.acceptLabel,
    declineLabel: card.declineLabel,
    onAccept: accept,
    onDecline: decline,
    // G211: is_emergency offers pop with the rays behind the rock (QuestConversationUI.as 147-153).
    urgent: card.emergency === true,
  });
  if (engine.param('questofferautoplay') === 'accept') setTimeout(() => engine.acceptOpenOffer(), 400);
  return true;
}

export const questOffersFeature = {
  id: 'quest-offers',

  init(engine) {
    ensureQuestOfferState(engine.questState);
    // QA routes (any *demo / *autoplay / streetdemo param) stay uninterrupted
    // unless they ask for offers; ?questoffer=off silences them anywhere.
    const params = [...new URLSearchParams(globalThis.location?.search || '').keys()];
    const qaRoute = params.some((key) => /demo$|autoplay$/.test(key) && !key.startsWith('questoffer'));
    const mode = engine.param('questoffer');
    quiet = mode === 'off' || (qaRoute && mode !== 'now');
    nextOfferCheckAt = Date.now() + (engine.param('questoffer') === 'now' ? 1_500 : 12_000);
    heldByCard = false;
    cardGoneAt = 0;
  },

  onStreetEnter(street, engine) {
    nextOfferCheckAt = Math.min(
      nextOfferCheckAt || Infinity,
      Date.now() + (engine.param('questoffer') === 'now' ? 1_500 : STREET_ENTER_DELAY_MS)
    );
  },

  onEvent(counter, amount, engine) {
    const result = routeQuestEvent(engine.questState, counter, amount, questContext(engine));
    if (result.advanced.length) engine.updateHud();
    finish(result.completable, engine);
  },

  onTick(dtMs, now, engine) {
    if (!engine.started) return;
    if (offerOpen && !engine.questDialogueOpen()) {
      // Closed with Escape: treat it as "Not right now".
      offerOpen = false;
      const pending = Object.keys(ensureQuestOfferState(engine.questState).offered);
      for (const id of pending) declineOffer(engine.questState, id, now);
      engine.save();
    }
    if (now >= nextSyncAt) {
      nextSyncAt = now + SYNC_MS;
      const qs = engine.questState;
      const failed = tickQuestTimers(qs, now);
      for (const id of failed) engine.pushActivity('A timed quest ran out of time. You can restart it from the quest log.');
      const pack = { ...engine.inv };
      if (lastPack) {
        for (const [id, count] of Object.entries(pack)) {
          const gained = (Number(count) || 0) - (Number(lastPack[id]) || 0);
          if (gained > 0 && !PACK_GAIN_SKIP.test(id)) this.onEvent(`in_inventory:${id}`, gained, engine);
        }
      }
      lastPack = pack;
      const sync = syncItemRequirements(qs, engine.inv, questContext(engine, now));
      if (sync.advanced?.length) engine.updateHud();
      finish(sync.completable, engine);
    }
    if (quiet) return;
    const cardUp = engine.streetCardUp?.() === true;
    if (heldByCard && !cardUp) {
      heldByCard = false;
      cardGoneAt = now;
      nextOfferCheckAt = Math.min(nextOfferCheckAt, now);
    }
    if (now >= nextOfferCheckAt) {
      nextOfferCheckAt = now + OFFER_CHECK_MS;
      if (cardUp) {
        // QA (G213): &questofferaward=1 queues an award screen under the card, as a badge earned on arrival would.
        if (!heldByCard && engine.param('questofferaward') === '1' && !qaAwardQueued) {
          qaAwardQueued = true;
          engine.award({ kind: 'quest', title: 'Award held by the card', subtitle: 'QA', primaryLabel: 'OK' });
        }
        heldByCard = true;
      } else if (!offerOpen && engine.screenFxScreenUp?.() === true) {
        // G213: an award screen the card held shows as the card goes; this check
        // used to open the offer over it, or be spent by busy() and wait a full
        // 30 s more. While a screen is queued or up, look again shortly (the
        // client queues screens and quest conversations alike: TSFrontController.as
        // tryShowScreenViewFromQ 3399-3400, QuestsDialog.as onEmergencyTick 338).
        nextOfferCheckAt = Math.min(nextOfferCheckAt, now + SCREEN_RETRY_MS);
      } else if (presentOffer(engine, now)) {
        if (cardGoneAt) engine.setData('questOfferAfterCardMs', String(now - cardGoneAt));
        cardGoneAt = 0;
      }
    }
  },
};
