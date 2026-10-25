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
 * G225: only is_emergency offers pop up on the street (no close, Escape does
 * nothing, rays behind the rock). Every other offer waits in the quest log,
 * as in the final client: QuestManager.as 115-143 counts it on the player
 * info (updateNewQuestCount; ImaginationButton.as 96-135 pops the count and
 * shows "New Quest Added!" with QUEST_ADDED), and the Quests dialog says "You
 * have N new quests" with "Show me" / "Show me one" (QuestsDialog.as 241-252),
 * which opens the oldest one's card inside the dialog (onToastStarted
 * 222-238). Closing a card without answering leaves the offer waiting
 * (onConvoClose 209-216); "Not right now" declines it as before. An emergency
 * left unanswered (closed by force, or saved) shows again on the next check
 * (onEmergencyTick 335-360).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=now runs the first check
 * at once (on a fresh level 5 save that is send_mail, an emergency, so it
 * pops); &questofferautoplay=accept accepts it, opening a waiting offer from
 * the Quests dialog when the offer waits. &questofferpop=1 pops ordinary
 * offers on the street too (the pre-G225 behaviour, for older QA routes).
 * &questofferdemo=waiting (&questoffercount=N, default 3) puts N ordinary
 * offers in the log at once; =show also opens the Quests dialog and presses
 * "Show me". Other QA routes (any *demo or *autoplay param) get no offers;
 * ?questoffer=off silences them anywhere (the demo still runs).
 * &questofferaward=1 queues an award screen when a check first falls under a
 * loading card (G213: the screen shows as the card goes and the check looks
 * again every second while it is up); canvas questOfferAfterCardMs is the wait
 * from the card going to the offer. Canvas: questOffer (the last offer made),
 * questOffersWaiting (the count), questOfferCard (the open card: id:street|log),
 * questOfferResult.
 */

import {
  acceptOffer,
  declineOffer,
  ensureQuestOfferState,
  heldForNpcTurnIn,
  markOffered,
  nextQuestOffer,
  pendingQuestOffers,
  questAwardPayload,
  questOfferCard,
  routeQuestEvent,
  syncItemRequirements,
  tickQuestTimers,
  turnInQuest,
  waitingOffers,
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
/** The card on screen: { classTsid, inLog } (G225). */
let openCard = null;
/** Waiting offers at the last sync (-1 before the first), for the count's pop. */
let lastWaiting = -1;
/** &questofferdemo (G225 QA), run once the game has started. */
let demo = '';
let ui = null;
let noticeTimer = 0;
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
  // QuestsDialog.as onEmergencyTick 335-360: an emergency still unanswered shows again.
  const again = waitingOffers(qs).find((row) => row.emergency);
  let card = again ? questOfferCard(again.classTsid) : null;
  if (!card) {
    card = nextQuestOffer(qs, engine.pc, questContext(engine, now));
    if (!card || card.waiting) {
      if (card?.waiting) nextOfferCheckAt = now + Math.max(1_000, card.waiting);
      return false;
    }
    markOffered(qs, card.classTsid, now);
  }
  engine.setData('questOffer', card.classTsid);
  if (card.emergency === true || engine.param('questofferpop') === '1') {
    openOffer(engine, card, { inLog: false });
    return true;
  }
  // G225: an ordinary offer waits in the quest log (QuestManager.as 115-138).
  engine.save();
  syncWaiting(engine);
  if (engine.param('questofferautoplay') === 'accept') setTimeout(() => showWaitingOffer(engine, { openPanel: true }), 400);
  return true;
}

/** Show an offer's card: on the street, or inside the Quests dialog (`inLog`). */
function openOffer(engine, card, { inLog = false } = {}) {
  const qs = engine.questState;
  offerOpen = true;
  openCard = { classTsid: card.classTsid, inLog };
  engine.setData('questOfferCard', `${card.classTsid}:${inLog ? 'log' : 'street'}`);
  engine.playSound('QUEST_OFFER', { volume: 0.55 });
  const settle = () => {
    offerOpen = false;
    openCard = null;
    engine.setData('questOfferCard', '');
  };
  const accept = () => {
    settle();
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
    syncWaiting(engine);
  };
  const decline = () => {
    settle();
    declineOffer(qs, card.classTsid, Date.now());
    engine.setData('questOfferResult', 'declined');
    engine.pushActivity(`You can accept “${card.def.title}” from your quest log later.`);
    engine.save();
    syncWaiting(engine);
  };
  engine.offerQuestDialogue({
    title: card.def.title,
    kicker: 'Magic Rock',
    beats: card.beats,
    acceptLabel: card.acceptLabel,
    declineLabel: card.declineLabel,
    onAccept: accept,
    onDecline: decline,
    // G211: is_emergency offers pop with the rays behind the rock (QuestConversationUI.as 147-153);
    // inside the Quests dialog they have none (hide_rays, QuestsDialog.as 349).
    urgent: card.emergency === true && !inLog,
    inLog,
  });
  syncWaiting(engine);
  if (engine.param('questofferautoplay') === 'accept') setTimeout(() => engine.acceptOpenOffer(), 400);
}

/**
 * "Show me" (QuestsDialog.as onToastStarted 222-238): the oldest waiting
 * offer opens inside the Quests dialog. `openPanel` opens the dialog first (QA).
 */
export function showWaitingOffer(engine, { openPanel = false } = {}) {
  if (offerOpen) return false;
  const row = waitingOffers(engine.questState).find((r) => !r.emergency);
  const card = row ? questOfferCard(row.classTsid) : null;
  if (!card) return false;
  if (openPanel && typeof document !== 'undefined' && document.getElementById('quest-panel')?.hidden) {
    document.getElementById('quest-btn')?.click();
  }
  openOffer(engine, card, { inLog: true });
  return true;
}

/** QuestsDialog.as updateCountToast 241-252: the toast's words for `n` new quests. */
export function questCountToast(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return {
    count,
    text: count ? `You have ${count} new ${count !== 1 ? 'quests' : 'quest'}` : '',
    button: count > 1 ? 'Show me one' : 'Show me',
  };
}

function buildUi(engine) {
  if (typeof document === 'undefined') return null;
  if (ui?.toast?.isConnected) return ui;
  const btn = document.getElementById('quest-btn');
  const list = document.getElementById('quest');
  if (!btn || !list) return null;
  const count = document.createElement('span');
  count.className = 'quest-btn-count';
  count.hidden = true;
  count.setAttribute('aria-hidden', 'true');
  const notice = document.createElement('span');
  notice.className = 'quest-added-notice';
  notice.textContent = 'New Quest Added!';
  notice.setAttribute('aria-hidden', 'true');
  btn.append(count, notice);
  const toast = document.createElement('div');
  toast.id = 'quest-offer-toast';
  toast.className = 'quest-offer-toast';
  toast.hidden = true;
  toast.setAttribute('role', 'status');
  toast.innerHTML = '<span data-quest-toast-text></span><button type="button" data-quest-toast-show></button>';
  list.parentNode.insertBefore(toast, list);
  toast.querySelector('[data-quest-toast-show]').addEventListener('click', () => showWaitingOffer(engine));
  ui = { btn, count, notice, toast, text: toast.querySelector('[data-quest-toast-text]'), show: toast.querySelector('[data-quest-toast-show]') };
  return ui;
}

/** Update the count, the toast and canvas data; a rise pops the count with "New Quest Added!". */
function syncWaiting(engine) {
  const n = waitingOffers(engine.questState).filter((row) => !row.emergency).length;
  engine.setData('questOffersWaiting', String(n));
  const el = buildUi(engine);
  if (el) {
    const words = questCountToast(n);
    el.count.textContent = String(n);
    el.count.hidden = n <= 0;
    el.btn.title = n ? `Quests (Q): ${words.text}` : 'Quests (Q)';
    el.toast.hidden = n <= 0;
    el.text.innerHTML = n ? `You have <b>${n}</b> new ${n !== 1 ? 'quests' : 'quest'}` : '';
    el.show.textContent = words.button;
    // QuestsDialog.as onQuestUpdated 306-307: the button waits while a conversation is open.
    el.show.disabled = offerOpen;
    if (lastWaiting >= 0 && n > lastWaiting) {
      el.count.classList.remove('is-pop');
      void el.count.offsetWidth;
      el.count.classList.add('is-pop');
      el.notice.classList.add('is-shown');
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => el.notice.classList.remove('is-shown'), 3300);
    }
  }
  if (lastWaiting >= 0 && n > lastWaiting) engine.playSound?.('QUEST_ADDED', { volume: 0.6 });
  lastWaiting = n;
}

/** &questofferdemo=waiting|show: N ordinary offers straight into the log (G225 QA). */
function runDemo(engine, mode) {
  const qs = engine.questState;
  const want = Math.max(1, Number(engine.param('questoffercount')) || 3);
  const rows = pendingQuestOffers(qs, engine.pc, questContext(engine)).filter((row) => !row.emergency).slice(0, want);
  rows.forEach((row, i) => markOffered(qs, row.classTsid, Date.now() - (rows.length - i)));
  engine.save();
  syncWaiting(engine);
  if (mode === 'show') setTimeout(() => showWaitingOffer(engine, { openPanel: true }), 1200);
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
    offerOpen = false;
    openCard = null;
    lastWaiting = -1;
    nextSyncAt = 0;
    demo = String(engine.param('questofferdemo') || '');
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
      // G225: closed without an answer (the X in the Quests dialog, Escape):
      // the offer keeps waiting in the log (QuestsDialog.as onConvoClose 209-216).
      offerOpen = false;
      openCard = null;
      engine.setData('questOfferCard', '');
      syncWaiting(engine);
    }
    if (demo) {
      const mode = demo;
      demo = '';
      setTimeout(() => runDemo(engine, mode), 800);
    }
    if (now >= nextSyncAt) {
      nextSyncAt = now + SYNC_MS;
      syncWaiting(engine);
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
