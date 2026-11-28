/**
 * Back to Gentle Island: a quest that lets a player who skipped the tutorial play it later, once
 * (ours, Austin 2026-11-28: "For folks which skipped the tutorial we should let them complete it.
 * Maybe we turn it into a quest, that way they go back in and complete it but only once?").
 *
 * Glitch had nothing like it. Every new player went through the tutorial (players/player.js
 * onCreate 1188-1243 then goToNewNewStartingLevel 1542-1569); skip_entire_intro and skip_newux
 * (1193-1218, set by resetForTesting 1653-1747) were testing flags, never a player's choice. A
 * player who had finished could walk back onto Gentle Island (locations/newbie_island.js 215-217
 * run the return_to_gentle_island overlay, players/inc_newxp.js newxpReturnToGentleIsland 83-86
 * says "Though you are on your own now, you are not really alone."), but has_done_intro stayed
 * set (inc_newxp.js newxpComplete 44-51), so the tutorial never ran a second time.
 *
 * Who is offered it: a save whose tutorial record says skipped (newxp status 'skipped'). Only solo
 * can skip: the start card's "Skip to Ur" and the Tutorial card's "Skip tutorial"
 * (features/newxp-feature.js); multiplayer has had no skip since 2026-10-26 (G334), before the
 * public launch. A save that finished (status 'done') or is still in it ('active') never is, and
 * 'off' (a save from before the tutorial, or a QA or autostart route that never saw the start
 * card) is left out too.
 *
 * Where it starts: Gentle Island, from its first step (the Magic Rock on Surveyor's Stroll). The
 * scenes before it (the clouds and the two training rooms) teach walking and jumping and sell the
 * walk and jump cards, which a skipper was given on skipping (newxp.js SKIP_TUTORIAL_CARDS); a
 * solo save already owns the other tutorial cards (imagination.js STARTER_UPGRADES). A skipper who
 * knows none of the three first skills (one who began the tutorial from zero and skipped before
 * the Magic Rock's pick) starts one step earlier, at the rock on the home street, so the pick is
 * theirs (replayStage).
 *
 * What it gives: what the tutorial gives, but only what the player never got (replayGrants):
 *  - the rock's 978 currants and Enlarge Yer Slots (buy two bags) run only for a player holding
 *    fewer than two Generic or Bigger Bags; one who has bags gets the quest given finished (no
 *    currants, no bags, no reward: quests_give_finished, as the tutorial does with a first skill's
 *    quest), so nobody ends up with doubled bags;
 *  - the home street is made only when there is none (it is free from the Home panel anyway);
 *  - the island's upgrade hands deal only tutorial cards the player does not own, so a solo save
 *    is dealt none and nobody pays twice;
 *  - On to the Big Time pays its 300 xp, 500 currants, 100 mood and 100 energy only when it was
 *    never completed, and the Greeter Twig comes only to a player who holds none;
 *  - the island's one-time finds (the Doonboggle Musicblock, the Spinach garden, the Gameshow
 *    Ticket, the quoins) keep their own flags, so a second try finds nothing twice.
 * The quest itself pays nothing of its own.
 *
 * Once: finishing sets the tutorial record to 'done' and the quest is completed and not
 * repeatable, so either alone stops another offer. Online the record and the quest log are part
 * of the character's save on the site (systems.features.newxp and the quest state), as every
 * feature's slice is (js/save-store.js); solo they are in the browser save.
 *
 * A way out: Leave (on the Tutorial card or the quest's log card) ends the try, puts the player
 * back where they took the quest and puts the quest back in the log, not started, with Try it;
 * the record goes back to skipped. What was found or earned on the way is kept, and the flags
 * keep it from coming twice.
 *
 * Counting skippers online (read-only, for the lead): a character's save on the site
 * (groddle/v1/save, the playerState JSON) holds systems.features.newxp.status: 'skipped' is a
 * skipper, 'off' never started it, 'active' is in it now, 'done' finished.
 */

import { FIRST_SKILLS, NEWXP_UPGRADES } from './newxp.js?v=eedf8fe3';

export const REPLAY_QUEST_ID = 'newxp_back_to_gentle_island';
/** The custom_code prerequisite the newxp feature answers (features/newxp-feature.js). */
export const REPLAY_GATE = 'newxp_skipped';
/** The flag the tutorial's end raises; the quest turns in on it (js/quest-offers.js EMITTED_EVENTS). */
export const REPLAY_DONE_COUNTER = 'gentle_island_finished';
/** The bags the tutorial's quest has you buy (buy_two_bags.js r365 num 2). */
export const REPLAY_BAGS = 2;

/** Every word the quest says (plain, short, no em dashes; the Magic Rock's voice: "Kid, ..."). */
export const REPLAY_TEXT = Object.freeze({
  title: 'Back to Gentle Island',
  desc: 'Go back to Gentle Island and finish the tutorial you skipped.',
  offer: 'Psst. Kid. You skipped Gentle Island, didn\'t you?<split butt_txt="Maybe I did" />No shame in it. But the island has a few things worth seeing, and it is not too late.<split butt_txt="Such as?" />A trip home, a little something from the rock, and the proper way off the island. Go back and finish it. You can leave partway and pick it up again later.',
  accept: 'Take me back',
  completion: 'That is the whole island done, kid. Now you have really seen it.',
  requirement: 'Finish the tutorial on Gentle Island',
  /** The rock on Surveyor's Stroll to a player who already holds bags (the bag quest given finished). */
  rockBagsHeld: 'Well, {name}, you came back!<split butt_txt="I did" />And you already have bags, so we can skip that part.',
  /** The Tutorial card's button during this quest (in place of Skip tutorial), and the log card's. */
  leave: 'Leave',
  leaveLog: 'Leave Gentle Island',
  leaveConfirm: 'Leave Gentle Island and go back to where you were? You can pick it up again from your quest log.',
  left: 'You left Gentle Island. Choose Try it in your quest log to go back.',
  notHere: 'Head out into Ur first, then choose Try it in your quest log.',
});

/**
 * The quest (its shape is quests.json's, as js/vine-radio.js RADIO_QUEST): offered by the Magic
 * Rock (the familiar) to a skipper, started from its offer or its log card's Try it.
 */
export const REPLAY_QUEST = Object.freeze({
  classTsid: REPLAY_QUEST_ID,
  title: REPLAY_TEXT.title,
  desc: REPLAY_TEXT.desc,
  offer: REPLAY_TEXT.offer,
  completion: REPLAY_TEXT.completion,
  requirements: Object.freeze([Object.freeze({ id: 'rgi1', type: 'flag', name: REPLAY_DONE_COUNTER, num: 1, classId: '', desc: REPLAY_TEXT.requirement })]),
  rewards: Object.freeze({}),
  prereqQuests: Object.freeze([]),
  isJob: false,
  autoComplete: false,
  isRepeatable: false,
  isEmergency: false,
  /** Ours: the rock offers it before its other waiting offers (a skipper otherwise waits behind every one). */
  offerFirst: true,
  isMultiplayer: false,
  hideQuestlog: false,
  familiarTurnin: false,
  silentComplete: false,
  showAlert: false,
  acceptLabel: REPLAY_TEXT.accept,
  prerequisites: Object.freeze([Object.freeze({ condition: 'custom_code', value: REPLAY_GATE })]),
  endNpcs: Object.freeze([]),
  locations: Object.freeze([]),
  instanced: false,
  // Startable (G229): "Not right now" puts it in the log with Try it, and a Leave puts it back there.
  needsStart: true,
  // Accepting takes you to Gentle Island (the offer card says so: quest-offers.js questMoveNote).
  movesOnStart: true,
  hasCanOffer: true,
  offerTriggers: Object.freeze([Object.freeze({ type: 'prerequisites' })]),
  offerNote: 'ours (Austin 2026-11-28): the Magic Rock offers it to a player who skipped the tutorial',
  solo: true,
  ours: true,
});

/** The quest catalog with Back to Gentle Island (js/content-catalogs.js); quests.json stays Tiny Speck's. */
export function withReplayQuest(catalog) {
  if (!catalog || typeof catalog !== 'object' || catalog[REPLAY_QUEST_ID]) return catalog;
  return { ...catalog, [REPLAY_QUEST_ID]: JSON.parse(JSON.stringify(REPLAY_QUEST)) };
}

const completed = (questState, id) => Array.isArray(questState?.completed) && questState.completed.includes(id);

/** PURE: is this save offered the quest now? Only a skipper who has not done it (status 'skipped'). */
export function replayEligible(save, questState) {
  return save?.status === 'skipped' && !completed(questState, REPLAY_QUEST_ID);
}

/** PURE: where the try starts: the island, or the rock's skill pick for a save that knows no first skill. */
export function replayStage(skills = []) {
  const known = new Set(skills || []);
  return FIRST_SKILLS.some((s) => known.has(s.id)) ? 'island' : 'house';
}

/** PURE: the tutorial cards this player owns (the island deals only the others). */
export function replayOwnedCards(owned = []) {
  return [...new Set((owned || []).filter((id) => Object.prototype.hasOwnProperty.call(NEWXP_UPGRADES, id)))];
}

/** PURE: the first skill the rock names on the island ("{skill} was a solid choice"): the save's, else one they know. */
export function replaySkill(save, skills = []) {
  if (save?.skill) return save.skill;
  const known = new Set(skills || []);
  return FIRST_SKILLS.find((s) => known.has(s.id))?.id || '';
}

/**
 * PURE: what this try hands out, from what the player already has.
 * `bags`: Generic and Bigger Bags in the pack (quest-offers.js genericBagsOwned); `currantsPaid`:
 * the island_currants flag; `bagQuestDone` / `leaveDone`: buy_two_bags / leave_gentle_island in the
 * completed list; `homeOwned`; `twigs`: Greeter Twigs held.
 */
export function replayGrants({ bags = 0, currantsPaid = false, bagQuestDone = false, leaveDone = false, homeOwned = false, twigs = 0 } = {}) {
  const hasBags = (Number(bags) || 0) >= REPLAY_BAGS;
  const bagQuest = bagQuestDone ? 'done' : hasBags ? 'given_finished' : 'run';
  return {
    bagQuest,
    islandCurrants: bagQuest === 'run' && !currantsPaid,
    home: !homeOwned,
    leaveRewards: !leaveDone,
    twig: !leaveDone && !((Number(twigs) || 0) > 0),
  };
}
