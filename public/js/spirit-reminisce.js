/**
 * G562: the Street Spirit's reminisce verb, the only way back into the three
 * memory repeats (A Summer's Day, Winter Walk, An Autumn Day).
 *
 * Source (tinyspeck/glitch-GameServerJS, CC0):
 * - items/street_spirit.js 207-245 (and the same verb in every regional
 *   spirit class, "defined by street_spirit"): verbs.reminisce, label
 *   "reminisce", tooltip "A remembering", sort_on 51 (before buy/sell 52 and
 *   talk to 53). Its conditions (218-235) show it only when the spirit has
 *   one of the repeats to offer: blue_and_white_part2 once blue_and_white_part1
 *   is done, winter_walk_part2 once winter_walk is done, an_autumn_day_part2
 *   whenever it is offered; otherwise the verb is not in the menu at all
 *   (state null). Its handler (236-244) runs offerQuests.
 * - items/street_spirit.js talk_to 292-306 / 317-331: talking never offers
 *   the repeats (deleted from the offer list and excluded).
 * - items/include/npc_quests.js offerQuests 190-350: one offer goes straight
 *   to its card (no_backtrack); more show got_quest_text ("I've got
 *   something for you...", street_spirit_groddle.js 22) with each quest's
 *   title and "Nevermind".
 * - items/include/npc_conversation.js 321-338: the card is the quest's offer
 *   text with button_accept / button_decline (quests/quest.js 14-15: "Ok,
 *   I'll do it!" / "Not right now"; the three repeats keep the defaults).
 * - quests/*_part2.js: is_repeatable 1, hide_questlog 1, so the repeats were
 *   never in the quest log as offers. an_autumn_day_part2.js canOffer 73-87:
 *   an hour after part 1, and an hour after its own last finish or fail.
 */
import { ensureQuestOfferState } from './quest-offers.js?v=d18bee8b';

export const SPIRIT_REMINISCE_SOURCE = 'tinyspeck/glitch-GameServerJS items/street_spirit.js 207-245 (CC0)';

/** setAvailableQuests order (street_spirit.js onCreate 442-450): Summer, Winter, Autumn. */
export const SPIRIT_REPEAT_QUESTS = Object.freeze(['blue_and_white_part2', 'winter_walk_part2', 'an_autumn_day_part2']);

/** The part each repeat needs done before the verb shows it (conditions 223-229; Autumn checks none). */
export const SPIRIT_REPEAT_AFTER = Object.freeze({
  blue_and_white_part2: 'blue_and_white_part1',
  winter_walk_part2: 'winter_walk',
  an_autumn_day_part2: '',
});

/**
 * The verb row (street_spirit.js 207-217). The source's sort_on 51 put it first, but a spirit
 * that sells is visited to shop, so Browse goods stays first and the menu's default (Austin
 * 2026-11-11); reminisce comes right after it.
 */
export const REMINISCE_VERB = Object.freeze({
  id: 'reminisce',
  label: 'reminisce',
  tooltip: 'A remembering',
  sort: 15,
});

/** npc_quests.js offerQuests 315-329 and street_spirit_groddle.js 22-23. */
export const SPIRIT_REMINISCE_TEXT = Object.freeze({
  choose: "I've got something for you...",
  cancel: 'Nevermind',
  accept: "Ok, I'll do it!",
  decline: 'Not right now',
});

export const isStreetSpiritClass = (classId) => /^street_spirit(_|$)/.test(String(classId || ''));

/**
 * The repeats a spirit can reminisce now, in source order. `canOffer(id)` is
 * the game's own offer check for that quest (hour waits, a run already under
 * way); `done(id)` says whether a quest is done.
 */
export function spiritReminisceOffers({ canOffer, done } = {}) {
  const out = [];
  for (const id of SPIRIT_REPEAT_QUESTS) {
    const after = SPIRIT_REPEAT_AFTER[id];
    if (after && !(typeof done === 'function' && done(after))) continue;
    if (typeof canOffer === 'function' && canOffer(id)) out.push(id);
  }
  return out;
}

/**
 * Add the reminisce row to a spirit's verbs when it has something to offer,
 * else leave the list alone (the source hides the verb). Returns a new list
 * or null.
 */
export function withReminisceVerb(verbs, offers) {
  if (!Array.isArray(verbs) || !offers?.length || verbs.some((v) => v?.id === REMINISCE_VERB.id)) return null;
  const row = { ...REMINISCE_VERB, enabled: true };
  const browse = verbs.findIndex((v) => v?.id === 'browse');
  if (browse < 0) return [row, ...verbs];
  return [...verbs.slice(0, browse + 1), row, ...verbs.slice(browse + 1)];
}

/**
 * A save from before G562 may hold a repeat as a Magic Rock offer (waiting in
 * Offered, put off with "Not right now", or queued). Those go: only a spirit
 * offers them now. Returns the ids dropped.
 */
export function dropSpiritRepeatOffers(questState) {
  if (!questState || typeof questState !== 'object') return [];
  const offers = ensureQuestOfferState(questState);
  const dropped = [];
  for (const id of SPIRIT_REPEAT_QUESTS) {
    let had = false;
    for (const key of ['offered', 'declined']) {
      if (offers[key] && Object.hasOwn(offers[key], id)) {
        delete offers[key][id];
        had = true;
      }
    }
    if (offers.queue.includes(id)) {
      offers.queue = offers.queue.filter((q) => q !== id);
      had = true;
    }
    if (had) dropped.push(id);
  }
  return dropped;
}
