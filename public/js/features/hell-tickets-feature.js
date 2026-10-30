/**
 * Diabolical Drink Tickets and the Beelzebooze chain as a feature module
 * (register row G163; rules and source notes in js/hell-tickets.js).
 *
 * - After a croak, one time in three a local companion (Amp, Bumbishfish or
 *   Lily Linguistic, by name) mourns or celebrates your grave 20 to 50 s
 *   later, while you are still dead. That runs js/hell.js recognizeDeath
 *   (players/player.js 1430) through hellFeature.recognizeGrave: in Hell One
 *   with neither quest started the Magic Rock offers It's Better in a Hell
 *   Hole with its own text naming the mourner; elsewhere in Naraka with
 *   Beelzebooze not started it offers Beelzebooze; otherwise you get a
 *   Diabolical Drink Ticket and the source prompt.
 * - hell_hole onAccepted: "Make your way to the Hell Hole." in Hell One.
 * - hell_hole onComplete_custom: the Magic Rock offers Beelzebooze (it holds
 *   its own offers for the dead, so this feature makes it while you are dead).
 * - hell_quest onAccepted: a drink ticket and the source prompt, however the
 *   quest was accepted (here, the Magic Rock or the quest log).
 * - The quests advance through quest-offers-feature from the events
 *   hell-feature (hell_hole_jumped, wine_of_the_dead:drink) and
 *   hell-bar-feature (vendor_bought:wine_of_the_dead) send, and turn in
 *   through the familiar with their source rewards.
 *
 * QA routes (any *demo / *autoplay param turns the random visit off unless
 * &gravedemo is given, so other lanes' Hell routes stay deterministic):
 *   /play/?autostart=1&fresh=1&resetgame=1&questoffer=off&helldemo=croak&gravedemo=mourn
 *   &gravedemo=mourn|celebrate|1   the next croak this page load gets a visit (1 = random type)
 *   &gravevisitms=N                its delay (default 3000)
 *   &gravecompanion=Amp|Bumbishfish|Lily Linguistic
 *   &gravedone=1                   both quests already done: the ticket-and-prompt branch
 *   &hellticketautoplay=1          accept, jump the Hell Hole, accept Beelzebooze, walk
 *                                  Panka Surazu's door, buy the wine at the counter,
 *                                  resurrect (QA shortcut for the 11 grapes), drink, done
 *   &hellticketstepms=N            pause on each dialogue before advancing (default 2500)
 *   &routeautoplay=1               with hellticketautoplay: follow the map route to Panka
 *                                  Surazu signpost by signpost (map-routes feature, G177)
 * Canvas data: hellTicketVisit, hellTicketVisitAt, hellTicketVisitor, hellTicketBranch,
 * hellTicketOffer, hellTicketStage, hellTicketQuest, hellTicketHole, hellTicketTickets,
 * hellTicketWine, hellTicketVisits.
 */

import { addItem, countItem, removeItem } from '../inventory.js?v=catalog-unified-7';
import { OVERLAY_USES, playWindowOverlay } from '../overlays.js?v=g448-2';
import { acceptOffer, ensureQuestOfferState, markOffered } from '../quest-offers.js?v=g403-1';
import { getQuestCatalog } from '../content-catalogs.js?v=g403-1';
import { parseQuestConversation } from '../quests.js?v=item-buffs-7';
import { HELL_LOCATION, HELL_QUESTS, isInHell, isInHellOne } from '../hell.js';
import { BARTENDER, PANKA_DOOR, PANKA_TSID, isHellBarTsid } from '../hell-bar.js';
import {
  GRAVE_VISIT,
  HELL_HOLE_ACCEPTED_TEXT,
  TICKET_CLASS,
  WINE_CLASS,
  chainOfferDue,
  createHellTicketsState,
  graveVisitDue,
  hellQuestAcceptedText,
  hellQuestStatus,
  holeHintDue,
  normalizeHellTicketsState,
  planGraveVisit,
  recognitionBranch,
  ticketDue,
} from '../hell-tickets.js';
import { hellFeature } from './hell-feature.js?v=hell-16';
import { doorsFeature } from './doors-feature.js?v=g457-3';

export const HELL_TICKETS_FEATURE_ID = 'hell-tickets';

let state = createHellTicketsState();
/** The quest offer this feature has open: { id, text } or null. */
let offerOpen = null;
/** G255: an emergency offer closed unanswered, to show again (onEmergencyTick 335-360). */
let unanswered = null;
/** A prompt waiting for the screen to clear: { title, text }. */
let pendingPrompts = [];
/** The QA force applies to one croak per page load. */
let forceUsed = false;
let quiet = false;
let auto = { stage: '', at: 0, dialogAt: 0 };
/** When the current street finished loading: visits and offers wait for the loading card to fade. */
let streetAt = 0;
const SETTLE_MS = 2000;

const isPankaTsid = (tsid) => String(tsid || '').slice(1) === PANKA_TSID.slice(1);

function questContext(engine) {
  return { inv: engine.inv, pc: engine.pc, skills: engine.learnedSkills, addItem, removeItem, countItem, now: Date.now() };
}

function publish(engine) {
  engine.setData('hellTicketVisit', state.visit ? state.visit.type : '');
  engine.setData('hellTicketVisitAt', state.visit ? String(state.visit.at) : '');
  engine.setData('hellTicketVisitor', state.visit ? state.visit.recognizer : '');
  engine.setData('hellTicketVisits', String(state.visits));
  engine.setData('hellTicketQuest', hellQuestStatus(engine.questState, 'hell_quest'));
  engine.setData('hellTicketHole', hellQuestStatus(engine.questState, 'hell_hole'));
  engine.setData('hellTicketTickets', String(countItem(engine.inv, TICKET_CLASS)));
  engine.setData('hellTicketWine', String(countItem(engine.inv, WINE_CLASS)));
}

/**
 * quests_offer(id, true) from the familiar: the source text and one button.
 * G255: hell_hole and hell_quest have no onStarted, so quest.js get_status
 * 1119-1124 gives them only accept (button_accept); "Not right now" is the
 * accept-without-start of startable quests (G229). Both are is_emergency
 * (hell_hole.js 12, hell_quest.js 13): the card has the rays, no close X and
 * ignores Escape (QuestConversationUI.as 147-155, escKeyHandler 410-414); one
 * closed by force (another dialog taking the screen) shows again once the
 * screen is clear (QuestsDialog.as onEmergencyTick 335-360).
 */
function presentOffer(engine, id, text) {
  const qs = engine.questState;
  const def = getQuestCatalog()[id] || HELL_QUESTS[id];
  if (!qs || !def) return false;
  ensureQuestOfferState(qs);
  markOffered(qs, id, Date.now());
  offerOpen = { id, text };
  engine.setData('hellTicketOffer', id);
  engine.playSound?.('QUEST_OFFER', { volume: 0.55 });
  engine.offerQuestDialogue({
    title: def.title,
    kicker: 'Magic Rock',
    beats: parseQuestConversation(text || def.offer || def.desc),
    acceptLabel: def.acceptLabel || HELL_QUESTS[id]?.buttonAccept || "Ok, I'll do it!",
    declinable: false,
    urgent: true,
    onAccept: () => {
      offerOpen = null;
      const result = acceptOffer(qs, id, questContext(engine));
      engine.setData('hellTicketOfferResult', result.ok ? 'accepted' : result.reason || 'failed');
      if (result.ok) engine.pushActivity(`New quest: ${def.title}`);
      engine.refreshPack();
      engine.save();
      publish(engine);
    },
  });
  return true;
}

function grantTicket(engine) {
  addItem(engine.inv, TICKET_CLASS, 1);
  engine.refreshPack();
}

/** Apply recognizeDeath's effects (the grave state is hell-feature's). */
function applyRecognition(engine, result) {
  for (const effect of result.effects || []) {
    if (effect.type === 'grant_item' && effect.classTsid === TICKET_CLASS) grantTicket(engine);
    else if (effect.type === 'prompt') pendingPrompts.push({ text: effect.text });
    else if (effect.type === 'quest_offer') presentOffer(engine, effect.quest, effect.text);
  }
}

function fireVisit(engine) {
  const visit = state.visit;
  const result = hellFeature.recognizeGrave({ type: visit.type, recognizer: visit.recognizer, questState: engine.questState }, engine);
  state = { ...state, visit: null, visits: state.visits + (result.ok ? 1 : 0) };
  engine.setData('hellTicketBranch', recognitionBranch(result));
  if (result.ok) applyRecognition(engine, result);
  engine.save();
  publish(engine);
}

function planVisit(engine, hs, now) {
  const demo = engine.param('gravedemo');
  const force = Boolean(demo) && !forceUsed;
  state = { ...state, plannedVisitId: hs.visitId };
  if (!force && quiet) return;
  if (force) forceUsed = true;
  const ms = Number(engine.param('gravevisitms'));
  const visit = planGraveVisit({
    visitId: hs.visitId,
    now,
    force,
    delayMs: force ? (Number.isFinite(ms) && ms >= 0 ? ms : GRAVE_VISIT.demoDelayMs) : undefined,
    type: demo === 'mourn' || demo === 'celebrate' ? demo : undefined,
    recognizer: engine.param('gravecompanion') || undefined,
  });
  state = { ...state, visit };
  engine.save();
  publish(engine);
}

/* ------------------------------------------------------------------ */
/* QA autoplay                                                         */
/* ------------------------------------------------------------------ */

function stage(engine, name, now) {
  if (auto.stage === name) return;
  auto = { ...auto, stage: name, at: now };
  engine.setData('hellTicketStage', name);
}

function clickAward() {
  if (typeof document === 'undefined') return false;
  const btn = document.querySelector('#award-screen [data-award-next]:not([hidden]), #award-screen [data-award-close]:not([hidden])');
  if (!btn) return false;
  btn.click();
  return true;
}

const awardShowing = () => typeof document !== 'undefined' && Boolean(document.querySelector('#award-screen:not([hidden])'));

function autoplay(engine, now) {
  if (engine.param('hellticketautoplay') !== '1') return;
  const stepMs = Number.isFinite(Number(engine.param('hellticketstepms'))) ? Number(engine.param('hellticketstepms')) : 2500;
  const qs = engine.questState;
  const quest = hellQuestStatus(qs, 'hell_quest');
  const hole = hellQuestStatus(qs, 'hell_hole');
  const dead = hellFeature.isDead();
  // Dialogues (offers, prompts, the Bartender) and award screens: hold, then advance.
  if (engine.questDialogueOpen() || awardShowing()) {
    // Hold each new dialogue or award on screen for stepMs (the screenshots read them).
    const shown = typeof document === 'undefined' ? '' : [...document.querySelectorAll('#quest-dialogue:not([hidden]), #award-screen:not([hidden])')].map((el) => el.textContent.slice(0, 80)).join('|');
    if (shown !== auto.shown) {
      auto.shown = shown;
      auto.dialogAt = now;
    }
    if (!auto.dialogAt) auto.dialogAt = now;
    if (now - auto.dialogAt >= stepMs) {
      auto.dialogAt = 0;
      // Awards first: a quest dialogue can open under a queued award screen.
      if (!clickAward()) engine.acceptOpenOffer();
    }
    if (quest === 'done') stage(engine, 'complete', now);
    return;
  }
  auto.dialogAt = 0;
  if (quest === 'done') return stage(engine, 'done', now);
  if (engine.busy() || now - auto.at < 900 && auto.stage !== '') return;
  if (dead && hole === 'todo' && isInHellOne(engine.streetTsid)) {
    // Walk off the edge into the Hell Hole: the only floor gap in Hell One.
    if (auto.stage !== 'jump') {
      stage(engine, 'jump', now);
      const h = HELL_LOCATION.hellHole;
      engine.player.x = (h.x1 + h.x2) / 2;
      engine.player.y += 6;
      engine.player.vx = 0;
      engine.player.vy = 2;
      engine.player.onGround = false;
      engine.snapCamera?.();
    }
    return;
  }
  if (quest !== 'todo') return stage(engine, state.visit ? 'wait-visit' : 'wait', now);
  const tickets = countItem(engine.inv, TICKET_CLASS);
  const wine = countItem(engine.inv, WINE_CLASS);
  if (tickets > 0 && dead) {
    if (isHellBarTsid(engine.streetTsid)) {
      if (auto.stage !== 'bartender') {
        stage(engine, 'bartender', now);
        // Step into his hit box: his first-touch conversation runs the purchase (hell_bartender.js onPlayerCollision).
        engine.player.x = BARTENDER.x - 60 - engine.street.bounds.l;
        engine.player.vx = 0;
      }
      return;
    }
    if (isPankaTsid(engine.streetTsid)) {
      if (auto.stage !== 'door') {
        stage(engine, 'door', now);
        const target = (engine.interactables || []).find((t) => t.classId === 'street_door' && t.door?.id === PANKA_DOOR);
        if (target) {
          engine.player.x = target.door.x;
          engine.player.vx = 0;
          engine.snapCamera?.();
          setTimeout(() => doorsFeature.runVerb(target, 'enter', engine), 1200);
        }
      }
      return;
    }
    // &routeautoplay=1 walks the Beelzebooze map route signpost by signpost instead (G177).
    if (engine.param('routeautoplay') === '1') return stage(engine, 'route', now);
    if (auto.stage !== 'travel') {
      stage(engine, 'travel', now);
      engine.enter(PANKA_TSID, { bypassFeatureGates: true });
    }
    return;
  }
  if (wine > 0 && dead) {
    // The dead are not Pooped after a first croak, so the wine waits for the living
    // (wine_of_the_dead.js drink conditions). QA stands in for squishing 11 grapes.
    if (auto.stage !== 'resurrect') {
      stage(engine, 'resurrect', now);
      hellFeature.resurrectNow(engine);
    }
    return;
  }
  if (wine > 0 && !dead && auto.stage !== 'drink') {
    stage(engine, 'drink', now);
    // The pack popover's Drink button runs exactly this (features.runPackVerb).
    hellFeature.runPackVerb(WINE_CLASS, 'drink', engine);
  }
}

/* ------------------------------------------------------------------ */
/* Feature                                                             */
/* ------------------------------------------------------------------ */

export const hellTicketsFeature = {
  id: HELL_TICKETS_FEATURE_ID,

  init(engine) {
    const params = [...new URLSearchParams(globalThis.location?.search || '').keys()];
    quiet = params.some((key) => /demo$|autoplay$/.test(key));
    offerOpen = null;
    unanswered = null;
    pendingPrompts = [];
    forceUsed = false;
    auto = { stage: '', at: 0, dialogAt: 0 };
    if (engine.param('gravedone') === '1' && engine.questState) {
      const qs = engine.questState;
      qs.completed ||= [];
      for (const id of ['hell_hole', 'hell_quest']) if (!qs.completed.includes(id)) qs.completed.push(id);
      state = { ...state, ticketGiven: true, holeHinted: true, chainOffered: true };
    }
  },

  save() {
    return state;
  },

  restore(slice) {
    state = normalizeHellTicketsState(slice || {});
  },

  onStreetEnter(_street, engine) {
    streetAt = Date.now();
    publish(engine);
  },

  onTick(_dtMs, now, engine) {
    if (!engine.started) return;
    const qs = engine.questState;
    const hs = hellFeature._state();
    // A fresh croak: roll its grave visit once.
    if (hs.isDead && hs.visitId !== state.plannedVisitId) planVisit(engine, hs, now);
    // G255: our emergency offer closed unanswered (another dialog took the screen): show it again.
    if (offerOpen && !engine.questDialogueOpen()) {
      engine.setData('hellTicketOfferResult', 'waiting');
      unanswered = offerOpen;
      offerOpen = null;
      engine.save();
    }
    autoplay(engine, now);
    if (engine.busy() || offerOpen || now - streetAt < SETTLE_MS) return;
    if (pendingPrompts.length) {
      const next = pendingPrompts.shift();
      // G230: text only, as player.js recognizeDeath 1467-1472 and hell_quest.js onAccepted 107-112
      // send it (prompts_add with txt and choices, no title); no invented "Naraka" kicker.
      engine.prompt({ text: next.text });
      return;
    }
    if (unanswered) {
      const { id, text } = unanswered;
      unanswered = null;
      if (hellQuestStatus(qs, id) === 'none' && qs.offers?.offered?.[id]) {
        presentOffer(engine, id, text);
        return;
      }
    }
    const due = graveVisitDue(state.visit, hs, now, { inHell: isInHell(engine.streetTsid, engine.street?.hubId || '') });
    if (due === 'drop') {
      state = { ...state, visit: null };
      engine.save();
      publish(engine);
    } else if (due === 'fire') {
      fireVisit(engine);
      return;
    }
    if (holeHintDue(qs, state, { inHellOne: isInHellOne(engine.streetTsid) })) {
      state = { ...state, holeHinted: true };
      engine.toast(HELL_HOLE_ACCEPTED_TEXT, 4500);
      // G391 hell_hole.js 104-113: Tiny Speck's right_arrow under the hint, 75 px, x 50%, top_y 15%,
      // no duration (it goes at the next street change).
      const arrow = OVERLAY_USES.right_arrow;
      playWindowOverlay('right_arrow', { wh: arrow.wh, x: arrow.x, topY: arrow.topY, durationMs: 0 });
      engine.setData?.('hellHoleArrow', 'right_arrow');
      engine.pushActivity(HELL_HOLE_ACCEPTED_TEXT);
      engine.save();
    }
    if (ticketDue(qs, state)) {
      state = { ...state, ticketGiven: true };
      grantTicket(engine);
      pendingPrompts.push({ text: hellQuestAcceptedText(false) });
      // hell_quest.js onAccepted 114-120: buildPath('LA5RPAFK9OE28GN', pc.location.tsid), the route the prompt promises (G177).
      engine.query?.('mapRoute', 'set', { to: HELL_QUESTS.hell_quest.pathTo, source: 'hell_quest', quest: 'hell_quest' }, engine);
      engine.save();
      publish(engine);
      return;
    }
    if (chainOfferDue(qs, state, { dead: hs.isDead })) {
      state = { ...state, chainOffered: true };
      presentOffer(engine, 'hell_quest', HELL_QUESTS.hell_quest.offer);
      engine.save();
    }
    if (Math.floor(now / 1000) !== Math.floor((now - _dtMs) / 1000)) publish(engine);
  },

  /** QA / tests. */
  _state() {
    return state;
  },
  _reset() {
    state = createHellTicketsState();
    offerOpen = null;
    unanswered = null;
    pendingPrompts = [];
    forceUsed = false;
    quiet = false;
    streetAt = 0;
    auto = { stage: '', at: 0, dialogAt: 0 };
  },
};

