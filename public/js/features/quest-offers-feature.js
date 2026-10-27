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
 * (onConvoClose 209-216). An emergency
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
 *
 * G229: "Not right now" is the source's accept without start (quest.js
 * get_status 1102-1124, main.js doQuestConversationChoice 6034-6049): only a
 * startable quest (onStarted, catalog needsStart) shows it, and it puts the
 * quest in the log, not started; the log card's "Try it" (QuestElementUI.as
 * setTryButton 224-232) accepts it, which starts it. Every other offer has
 * only its accept button. Put off from the street, the Quests dialog opens on
 * it (QuestManager.as questConversationCompleteHandler 341-352). QA:
 * &questofferdemo=putoff[:<quest>] puts a startable offer in the log, put off,
 * and opens the Quests dialog; =card:<quest> opens any quest's offer card in
 * the log (one button or two). Canvas questOffersPutOff (the count).
 *
 * G255: a startable quest's log card carries the Try button the client drew
 * for every startable, unfinished quest (QuestElementUI.as setTryButton
 * 224-264): "Try it", disabled with "You're already doing this quest!" while
 * started, and "Try again" once a timed quest has failed (its timer buff's
 * on_remove calls failQuest, items/catalog_buffs.js 1397-1402; inc_quests.js
 * failQuest 420-471 keeps a startable quest in the log, quest.js onFail
 * 145-157 resets its progress and marks it failed, not started). Try again is
 * quest_begin (main.js doQuestBegin 6019-6031, restartQuest 291-309,
 * quest.js onRestart 79-100): a fresh timer and the Quests dialog closes
 * (QuestManager.as questBeginHandler 302-312). Dead, it fails with "You are
 * dead!" (onRestart 81-89, shown as "Error starting quest: ..." by
 * questBeginHandler 325-328). Where the location sets no_starting_quests
 * (location.js 2666-2676: races, games, party spaces) the Try button is
 * disabled with "Starting new quests is not allowed right now!" (setTryButton
 * 230, 253-258) and an offer's accept_and_start choice is too
 * (ConversationManager.as 582-585); features answer noStartingQuests(engine).
 * G329: in multiplayer, questContext asks questsMpContext
 * (features/quests-mp-feature.js), and the quests that need other players
 * (js/quests-mp.js) are offered too; solo never asks and offers as before.
 *
 * QA: &questofferdemo=timed[:<quest>] starts a timed quest (default
 * mining_mine_in_time_period) with one second left, so it fails and shows
 * Try again in the log.
 */

import {
  acceptOffer,
  ensureQuestOfferState,
  listDeclinedOffers,
  heldForNpcTurnIn,
  markOffered,
  nextQuestOffer,
  pendingQuestOffers,
  putOffOffer,
  questAwardPayload,
  restartTimedQuest,
  questOfferCard,
  routeQuestEvent,
  syncItemRequirements,
  tickQuestTimers,
  turnInQuest,
  waitingOffers,
} from '../quest-offers.js';
import { addItem, removeItem, countItem } from '../inventory.js?v=catalog-unified-7';
import { getQuestCatalog } from '../content-catalogs.js';

const OFFER_CHECK_MS = 30_000;
/** QuestElementUI.as setTryButton 247-258 and ConversationManager.as 584. */
export const NO_STARTING_QUESTS_TIP = 'Starting new quests is not allowed right now!';
export const ALREADY_DOING_TIP = 'You\'re already doing this quest!';
const STREET_ENTER_DELAY_MS = 4_000;
const SYNC_MS = 1_000;
/** G213: how soon a check spent by an award or new-day screen looks again. */
const SCREEN_RETRY_MS = 1_000;
/** G277: an emergency left waiting is looked at every second (QuestsDialog.as 41 emergency_timer = new Timer(1000), onEmergencyTick 335-360). */
export const EMERGENCY_RETRY_MS = 1_000;

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
  // G329: in multiplayer, features/quests-mp-feature.js lets the quests that need other
  // players be offered (js/quests-mp.js); solo asks nothing and the ctx is as it was.
  const mp = engine.mode === 'multiplayer' ? engine.query?.('questsMpContext', engine) : null;
  return {
    ...(mp ? { multiplayer: true, mpFacts: mp.facts || {}, mpReady: mp.ready || {} } : {}),
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

/** G255: why starting a quest is refused here, or ''. no_starting_quests (location.js 2666-2676). */
export function startBlockedReason(engine) {
  return engine.query?.('noStartingQuests', engine) === true ? NO_STARTING_QUESTS_TIP : '';
}

/** onRestart 81-89: the dead cannot start a quest (no startable quest has canStartInHell). */
function deadStartError(engine) {
  return engine.query?.('isDead', engine) === true ? 'Error starting quest: You are dead!' : '';
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

/** Accept an offer (the card's accept, or a put-off quest's Try it): in the log and started. */
function acceptCard(engine, classTsid, def) {
  // main.js doQuestConversationChoice 6040-6046 / doQuestBegin: starting while dead fails
  // ("You are dead!"); the quest stays in the log, accepted, not started (G255).
  const dead = def.needsStart ? deadStartError(engine) : '';
  if (dead) {
    putOffOffer(engine.questState, classTsid, Date.now());
    engine.setData('questOfferResult', 'dead');
    engine.toast?.(dead, 5000);
    engine.save();
    engine.updateHud?.();
    syncWaiting(engine);
    return { ok: false, reason: 'dead' };
  }
  const result = acceptOffer(engine.questState, classTsid, questContext(engine));
  engine.setData('questOfferResult', result.ok ? 'accepted' : result.reason || 'failed');
  if (result.ok) {
    engine.pushActivity(`New quest: ${def.title}`);
    engine.refreshPack();
    // A rebuilt quest room turns its own quest in: a room quest with no
    // requirements (Le Misérable, Gwendolyn's Task) must not complete on accept.
    if (result.completable?.length && !def.instanceRoom) finish([{ classTsid, def }], engine);
    // Accept and start closes the Quests dialog (QuestManager.as 341-344; Try it, questBeginHandler 307-312).
    if (def.needsStart && typeof document !== 'undefined' && !document.getElementById('quest-panel')?.hidden) {
      document.getElementById('quest-close')?.click();
    }
  }
  engine.save();
  syncWaiting(engine);
  return result;
}

/**
 * G229: the quest log's cards for quests put off with "Not right now": the
 * quest's words and requirements, and "Try it" (QuestElementUI.as 224-232),
 * which accepts and so starts it. A quest declined by a save from before G229
 * that has no start (not startable) shows its accept label instead.
 */
export function putOffCards(engine) {
  if (typeof document === 'undefined') return [];
  const rows = listDeclinedOffers(engine.questState).filter((row) => !engine.questState.active?.[row.classTsid]);
  return rows.map(({ classTsid, def }) => {
    const card = document.createElement('div');
    card.className = 'q-card q-put-off';
    card.dataset.questPutOff = classTsid;
    const title = document.createElement('div');
    title.className = 'q-title';
    title.textContent = def.title;
    const state = document.createElement('div');
    state.className = 'q-req';
    state.textContent = 'Not started yet.';
    card.append(title, state);
    for (const r of def.requirements || []) {
      const row = document.createElement('div');
      row.className = 'q-req';
      row.textContent = `${r.desc}: 0 / ${r.num}`;
      card.appendChild(row);
    }
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'content-action-btn';
    go.textContent = def.needsStart ? 'Try it' : def.acceptLabel || "Ok, I'll do it!";
    const blocked = def.needsStart ? startBlockedReason(engine) : '';
    go.disabled = offerOpen || Boolean(blocked);
    if (blocked) go.title = blocked;
    go.addEventListener('click', () => {
      if (offerOpen || engine.questDialogueOpen?.() || (def.needsStart && startBlockedReason(engine))) return;
      acceptCard(engine, classTsid, def);
      engine.updateHud?.();
    });
    card.appendChild(go);
    return card;
  });
}

/**
 * G255: the Try button on an accepted quest's log card (QuestElementUI.as
 * setTryButton 224-264): only startable quests this module handed out
 * (offers.managed; story quests draw their own Enter buttons). Started: "Try
 * it", disabled. Failed (a timed quest that ran out): "Try again", which
 * restarts it with a fresh timer.
 */
export function questLogActions(engine, classTsid) {
  if (typeof document === 'undefined') return [];
  const qs = engine.questState;
  const offers = ensureQuestOfferState(qs);
  const def = getQuestCatalog()[classTsid];
  if (!def?.needsStart || !qs.active?.[classTsid] || !offers.managed?.[classTsid]) return [];
  const failed = Boolean(offers.failed?.[classTsid]);
  const blocked = failed ? startBlockedReason(engine) : '';
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'content-action-btn q-try';
  go.dataset.questTry = classTsid;
  go.textContent = failed ? 'Try again' : 'Try it';
  go.disabled = !failed || Boolean(blocked) || offerOpen;
  const tip = !failed ? ALREADY_DOING_TIP : blocked;
  if (tip) go.title = tip;
  go.addEventListener('click', () => {
    if (go.disabled || engine.questDialogueOpen?.()) return;
    retryTimedQuest(engine, classTsid);
  });
  return [go];
}

/** "Try again" on a failed timed quest (quest_begin -> restartQuest -> onRestart). */
export function retryTimedQuest(engine, classTsid, now = Date.now()) {
  const qs = engine.questState;
  const def = getQuestCatalog()[classTsid];
  if (!def || !ensureQuestOfferState(qs).failed?.[classTsid]) return { ok: false, reason: 'not_failed' };
  const blocked = startBlockedReason(engine);
  if (blocked) return { ok: false, reason: 'no_starting_quests' };
  const dead = deadStartError(engine);
  if (dead) {
    engine.setData('questOfferResult', 'dead');
    engine.toast?.(dead, 5000);
    return { ok: false, reason: 'dead' };
  }
  const result = restartTimedQuest(qs, classTsid, now);
  engine.setData('questOfferResult', result.ok ? 'restarted' : result.reason || 'failed');
  if (result.ok) {
    engine.pushActivity(`Started again: ${def.title}`);
    // questBeginHandler 307-312: a successful start closes the Quests dialog.
    if (typeof document !== 'undefined' && !document.getElementById('quest-panel')?.hidden) {
      document.getElementById('quest-close')?.click();
    }
  }
  engine.save();
  engine.updateHud?.();
  return result;
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
    acceptCard(engine, card.classTsid, card.def);
  };
  // G229: "Not right now" (value accept): in the log, not started.
  const putOff = () => {
    settle();
    const result = putOffOffer(qs, card.classTsid, Date.now());
    engine.setData('questOfferResult', result.ok ? 'putoff' : result.reason || 'failed');
    if (result.ok) {
      engine.pushActivity(`“${card.def.title}” is in your quest log, not started yet. Choose Try it there when you are ready.`);
      // QuestManager.as 345-351: just accepting opens the Quests dialog on the quest.
      if (!inLog && typeof document !== 'undefined' && document.getElementById('quest-panel')?.hidden) {
        document.getElementById('quest-btn')?.click();
      }
    }
    engine.save();
    engine.updateHud?.();
    syncWaiting(engine);
  };
  engine.offerQuestDialogue({
    title: card.def.title,
    kicker: 'Magic Rock',
    beats: card.beats,
    acceptLabel: card.acceptLabel,
    declineLabel: card.declineLabel,
    declinable: card.startable === true,
    // ConversationManager.as 582-585: accept_and_start is disabled under no_starting_quests.
    acceptBlocked: card.startable === true ? startBlockedReason(engine) : '',
    onAccept: accept,
    onDecline: card.startable === true ? putOff : null,
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
  engine.setData('questOffersPutOff', String(listDeclinedOffers(engine.questState).length));
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
  const [kind, named] = mode.split(':');
  if (kind === 'putoff' || kind === 'card') {
    // G229 QA: putoff[:<quest>] puts a startable offer (the first due, or the one named) in the
    // log, put off; card:<quest> makes any quest a waiting offer and opens its card in the log.
    const id = named || pendingQuestOffers(qs, engine.pc, questContext(engine)).find((r) => r.def.needsStart)?.classTsid;
    if (id && !qs.active?.[id]) {
      markOffered(qs, id, Date.now());
      if (kind === 'putoff') putOffOffer(qs, id, Date.now());
    }
    engine.save();
    engine.updateHud?.();
    syncWaiting(engine);
    if (kind === 'card') setTimeout(() => showWaitingOffer(engine, { openPanel: true }), 1200);
    else if (typeof document !== 'undefined' && document.getElementById('quest-panel')?.hidden) {
      setTimeout(() => document.getElementById('quest-btn')?.click(), 600);
    }
    return;
  }
  if (kind === 'timed') {
    // G255 QA: a timed quest accepted with one second left, so it fails and shows Try again.
    const id = named || 'mining_mine_in_time_period';
    if (!qs.active?.[id] && acceptOffer(qs, id, questContext(engine)).ok) {
      const timer = ensureQuestOfferState(qs).timers[id];
      if (timer) timer.endsAt = Date.now() + 1000;
    }
    engine.save();
    engine.updateHud?.();
    if (typeof document !== 'undefined' && document.getElementById('quest-panel')?.hidden) {
      setTimeout(() => document.getElementById('quest-btn')?.click(), 600);
    }
    return;
  }
  const want = Math.max(1, Number(engine.param('questoffercount')) || 3);
  const rows = pendingQuestOffers(qs, engine.pc, questContext(engine)).filter((row) => !row.emergency).slice(0, want);
  rows.forEach((row, i) => markOffered(qs, row.classTsid, Date.now() - (rows.length - i)));
  engine.save();
  syncWaiting(engine);
  if (mode === 'show') setTimeout(() => showWaitingOffer(engine, { openPanel: true }), 1200);
}

export const questOffersFeature = {
  id: 'quest-offers',

  /** G229: game.js quest log asks for the put-off quests' cards. */
  questLogCards(engine) {
    return putOffCards(engine);
  },

  /** G255: game.js asks for each active quest card's extra buttons (the Try button). */
  questLogActions(classTsid, engine) {
    return questLogActions(engine, classTsid);
  },

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

  onEvent(counter, amount, engine, detail) {
    // G277: the detail ({ animal }) lets a butterfly count once per run (quest-offers.js distinct 'animal').
    const result = routeQuestEvent(engine.questState, counter, amount, { ...questContext(engine), detail });
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
      for (const id of failed) {
        const title = getQuestCatalog()[id]?.title || 'A timed quest';
        engine.pushActivity(`“${title}” ran out of time. Choose Try again in your quest log to start it over.`);
      }
      if (failed.length) engine.updateHud();
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
      // G277: an emergency still unanswered (pushed off, closed by force, held) tries again in 1 s, not 30 s.
      if (!offerOpen && waitingOffers(engine.questState).some((row) => row.emergency)) {
        nextOfferCheckAt = Math.min(nextOfferCheckAt, now + EMERGENCY_RETRY_MS);
      }
    }
  },
};
