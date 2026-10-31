/**
 * Diabolical Drink Tickets and the Beelzebooze chain, solo (register row G163).
 * Pure rules: no DOM, no Pixi, no storage.
 *
 * What the source does (tinyspeck/glitch-GameServerJS, CC0):
 * - players/player.js croak() 1305-1309: a Graveside Marker is left where you
 *   croaked (location.createItemStack('graveside_marker', 1, x, y-29), setOwner).
 * - items/graveside_marker.js celebrate 37-86 / mourn 88-137: ANOTHER player
 *   walking past the grave may Celebrate or Mourn it, once per grave (the
 *   first one wins: "Someone else has already recognized the passing of this
 *   Glitch."). The handler calls this.owner.recognizeDeath('celebrate'|'mourn', pc).
 *   onCreate 199-202: the marker fades after 45 minutes and is gone 15 minutes later;
 *   resurrect() 1338 removes it at once. So a recognition can only reach a
 *   player who is still dead.
 * - players/player.js recognizeDeath() 1430-1477 (online player):
 *   Hell One, neither quest started -> quests_offer('hell_hole');
 *   any hub-40 street, hell_quest not started -> quests_offer('hell_quest');
 *   otherwise a drink_ticket from the familiar and a prompt
 *   "<name> has mourned your passing, you received a drink ticket for Wine of the Dead."
 *   Offline, the record waits on the player and replays at login (player.js 200-204).
 * - quests/hell_hole.js: getOffer() 62-81 names the mourner; onAccepted() 83-114
 *   shows "Make your way to the Hell Hole." in Hell One; onEnterLocation() 122-126
 *   sets jump_hell_hole in Mahatam Audarika; onComplete_custom() 116-120 offers
 *   hell_quest if it has not been started. No rewards.
 * - quests/hell_quest.js: onAccepted() 95-121 (ticket 99-110) gives the drink_ticket and the prompt
 *   "You received a drink ticket for Wine of the Dead and your map has been updated
 *   with the route to the Hell Bar." Requirements buy_wotd (items/hell_bartender.js
 *   grantWine 349-351, the first wine bought on the quest) and drink_wotd
 *   (items/wine_of_the_dead.js drink 96, every drink). Rewards 250 iMG, 150 currants.
 *
 * What does not survive: when or how often other players mourned graves. That
 * was the live population walking past. The solo stand-ins (js/local-companions.js)
 * take their place, by name, as Feats and the Emotional Bear already do: the dead
 * player is in Naraka and never sees the grave, so no world actor is needed.
 * Chosen timing (stated, not source): one croak in three gets a visit, 20 to 50
 * seconds after the croak, while the grave still stands (you are still dead).
 * Most first visits land in Hell One, where the source offers hell_hole.
 */

import { HELL_QUESTS, normalizeHellState } from './hell.js?v=454c9f42';
import { LOCAL_COMPANION_PROFILES } from './local-companions.js?v=188f756c';

export const HELL_TICKETS_VERSION = 1;

/** Chosen in place of the lost live-player timing (see the header). */
export const GRAVE_VISIT = Object.freeze({
  chance: 1 / 3,
  minDelayMs: 20_000,
  maxDelayMs: 50_000,
  /** QA (?gravedemo=...) default when no &gravevisitms is given. */
  demoDelayMs: 3_000,
});

/** The solo stand-ins who walk past graves. */
export const GRAVE_VISITORS = Object.freeze(LOCAL_COMPANION_PROFILES.map((p) => p.name));

export const TICKET_CLASS = 'drink_ticket';
export const WINE_CLASS = 'wine_of_the_dead';

/** Quest events the remake routes to the two quests' flags (js/quest-offers.js COUNTER_ROUTES). */
export const HELL_TICKET_EVENTS = Object.freeze({
  jump: 'hell_hole_jumped',
  buy: 'vendor_bought:wine_of_the_dead',
  drink: 'wine_of_the_dead:drink',
});

/** quests/hell_hole.js onAccepted 89-101 (the overlay's text, line 100). */
export const HELL_HOLE_ACCEPTED_TEXT = HELL_QUESTS.hell_hole.acceptedOverlay;

/** quests/hell_quest.js onAccepted 99-105. The remake's pack has no size limit, so packFull never happens in play. */
export function hellQuestAcceptedText(packFull = false) {
  return packFull ? HELL_QUESTS.hell_quest.acceptedTextPackFull : HELL_QUESTS.hell_quest.acceptedText;
}

export function createHellTicketsState() {
  return normalizeHellTicketsState({});
}

/**
 * The feature's saved slice.
 * - plannedVisitId: the hell visitId whose croak has been rolled (one roll per croak)
 * - visit: the pending grave visit { visitId, at, type, recognizer } or null
 * - visits: how many recognitions have reached you
 * - ticketGiven: hell_quest's onAccepted ticket has been handed over
 * - holeHinted: hell_hole's onAccepted overlay has been shown
 * - chainOffered: hell_hole's onComplete_custom offer has been made
 */
export function normalizeHellTicketsState(saved = {}) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const v = s.visit && typeof s.visit === 'object' ? s.visit : null;
  const visit = v && Number.isFinite(Number(v.at)) && (v.type === 'mourn' || v.type === 'celebrate')
    ? {
        visitId: Math.max(0, Math.floor(Number(v.visitId) || 0)),
        at: Number(v.at),
        type: v.type,
        recognizer: GRAVE_VISITORS.includes(v.recognizer) ? v.recognizer : GRAVE_VISITORS[0],
      }
    : null;
  return {
    version: HELL_TICKETS_VERSION,
    plannedVisitId: Math.max(0, Math.floor(Number(s.plannedVisitId) || 0)),
    visit,
    visits: Math.max(0, Math.floor(Number(s.visits) || 0)),
    ticketGiven: s.ticketGiven === true,
    holeHinted: s.holeHinted === true,
    chainOffered: s.chainOffered === true,
  };
}

const pick = (list, r) => list[Math.max(0, Math.min(list.length - 1, Math.floor(r * list.length)))];

/**
 * Roll a grave visit for a fresh croak.
 * @param {{ visitId:number, now?:number, rng?:() => number, force?:boolean,
 *           delayMs?:number, type?:string, recognizer?:string }} opts
 * @returns {{ visitId, at, type, recognizer } | null}
 */
export function planGraveVisit(opts = {}) {
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const now = Number.isFinite(Number(opts.now)) ? Number(opts.now) : Date.now();
  if (!opts.force && !(rng() < GRAVE_VISIT.chance)) return null;
  const delay = Number.isFinite(Number(opts.delayMs)) && Number(opts.delayMs) >= 0
    ? Number(opts.delayMs)
    : GRAVE_VISIT.minDelayMs + rng() * (GRAVE_VISIT.maxDelayMs - GRAVE_VISIT.minDelayMs);
  const type = opts.type === 'mourn' || opts.type === 'celebrate' ? opts.type : rng() < 0.5 ? 'mourn' : 'celebrate';
  const recognizer = GRAVE_VISITORS.includes(opts.recognizer) ? opts.recognizer : pick(GRAVE_VISITORS, rng());
  return { visitId: Math.max(0, Math.floor(Number(opts.visitId) || 0)), at: now + Math.round(delay), type, recognizer };
}

/**
 * Is a pending visit due? 'drop' when its croak is over (resurrected, a new
 * croak, the grave gone or already recognized), 'fire' when due, else 'wait'.
 * `inHell: false` (the croak's move to Hell One still loading) waits: the
 * source's recognizeDeath branches on where the dead player stands.
 */
export function graveVisitDue(visit, hellState, now = Date.now(), { inHell = true } = {}) {
  if (!visit) return 'none';
  const h = normalizeHellState(hellState);
  if (!h.isDead || h.visitId !== visit.visitId || !h.graveMarker || h.graveMarker.state !== 'none') return 'drop';
  return now >= visit.at && inHell ? 'fire' : 'wait';
}

/** 'none' | 'todo' | 'done' as GSJS getQuestStatus (a declined offer is still 'none'). */
export function hellQuestStatus(questState, id) {
  if (questState?.completed?.includes?.(id)) return 'done';
  if (questState?.active?.[id]) return 'todo';
  return 'none';
}

/** quest-offers' own statuses that mean "an offer is already out or declined". */
function offerPending(questState, id) {
  const offers = questState?.offers || {};
  return Boolean(offers.offered?.[id] || offers.declined?.[id]);
}

/**
 * hell_hole onComplete_custom: offer hell_quest when it has not been started.
 * The remake's Magic Rock holds offers for the dead, so this feature makes the
 * offer while you are dead; once alive, the Magic Rock delivers the queued
 * chain offer (quests.json chainOffers) itself.
 */
export function chainOfferDue(questState, slice, { dead = false } = {}) {
  const s = normalizeHellTicketsState(slice);
  if (!dead || s.chainOffered) return null;
  if (hellQuestStatus(questState, 'hell_hole') !== 'done') return null;
  if (hellQuestStatus(questState, 'hell_quest') !== 'none' || offerPending(questState, 'hell_quest')) return null;
  return 'hell_quest';
}

/** hell_quest onAccepted: the ticket, once per accepted run, whoever offered it (this feature, the Magic Rock, the quest log). */
export function ticketDue(questState, slice) {
  return hellQuestStatus(questState, 'hell_quest') === 'todo' && !normalizeHellTicketsState(slice).ticketGiven;
}

/** hell_hole onAccepted: the overlay, only in Hell One. */
export function holeHintDue(questState, slice, { inHellOne = false } = {}) {
  return inHellOne && hellQuestStatus(questState, 'hell_hole') === 'todo' && !normalizeHellTicketsState(slice).holeHinted;
}

/** The three branches of recognizeDeath, for QA data and the report. */
export function recognitionBranch(result) {
  if (!result?.ok) return result?.reason || 'none';
  return result.offer || 'ticket';
}
