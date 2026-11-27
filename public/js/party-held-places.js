/**
 * G911 (Austin 2026-11-16: build): the eight hand-built game.js places a party teleporter holds,
 * as G904 holds the quest rooms (js/quest-instance.js, features/quest-instances-feature.js).
 *
 * Glitch made the teleporter wherever you stood (GSJS players/inc_party.js 479-520, no location
 * check). The party space is an instance, and leaving an instance for another instance kept it
 * (groups/instance.js player_exited_location 343-363: "If we have left for another instance,
 * persist this place"); leaving the party sent you back to the exact spot (players/inc_instances.js
 * instances_enter 80-86 remembered it, instances_left 135-180 went there). Only a game's instance
 * gave the game up on the way out (instance.js 353-355 game.playerLeft), and none of these eight was
 * a game: Storyland (greedy_street_spirit), Legalize It's Back Alley (card_carrying_qualification),
 * Paradise (paradise_ticket launchInstance), Rooks' Woods (rook_egg_smash), the Museum of the Rook
 * (rook_hall), A Summer's Day (blue_and_white), Winter Walk and Four Letter Words (letter_block_2)
 * are quest or ticket instances. So each is held, and the party leads back into it.
 *
 * The place's own state stays in game.js while you are away (one trip, as before); this module is
 * the part that can be tested: the hold names the party record keeps, the run clocks that stop while
 * you are away, and Storyland's scene events to show again when it is rebuilt.
 */

export const HELD_PLACE_PREFIX = 'place-';

/** The places, by the kind game.js names them with (the hold is `place-<kind>`). */
export const HELD_PLACE_KINDS = Object.freeze([
  'storyland',
  'legalize',
  'paradise',
  'rook-woods',
  'rook-museum',
  'summers-day',
  'winter-walk',
  'de-embiggenify',
  'four-letter',
]);

/** The party record's `hold` for a place (js/party-spaces.js normalizePartyRecord keeps it), else ''. */
export function heldPlaceHold(kind) {
  return HELD_PLACE_KINDS.includes(kind) ? `${HELD_PLACE_PREFIX}${kind}` : '';
}

/** The place a party record's `hold` names, else '' (another feature's hold, or none). */
export function heldPlaceKind(hold) {
  const text = String(hold || '');
  if (!text.startsWith(HELD_PLACE_PREFIX)) return '';
  const kind = text.slice(HELD_PLACE_PREFIX.length);
  return HELD_PLACE_KINDS.includes(kind) ? kind : '';
}

/**
 * Each run's own clock (js/greedy-street-spirit.js, winter-walk.js, summers-day.js, rook-woods.js,
 * de-embiggenify.js, paradise-flight.js): timestamps that move on by the time spent away, so the run
 * is as it was when you left (as G904 stops a quest room's clock; Rooks' Woods' Crushers keep their
 * beat from startedAt). None of these places has a time limit (Austin 2026-11-27: Glitch's prompt,
 * no timer); the "Are you stuck?" prompt waits as long as you were away (game.js departHeldPlace).
 * Four Letter Words, the Museum and the Back Alley have none.
 */
export const HELD_PLACE_CLOCKS = Object.freeze({
  storyland: Object.freeze(['startedAt']),
  'winter-walk': Object.freeze(['startedAt']),
  'summers-day': Object.freeze(['startedAt']),
  'rook-woods': Object.freeze(['startedAt']),
  'de-embiggenify': Object.freeze(['enteredAt']),
  paradise: Object.freeze(['startedAt']),
});

/**
 * Move a held run's clock on by `awayMs`. A field not yet set (0: Rooks' Woods before Humbaba's
 * warning is read) stays unset. Returns the fields moved.
 */
export function shiftHeldClock(state, kind, awayMs) {
  const away = Math.max(0, Math.round(Number(awayMs) || 0));
  const keys = HELD_PLACE_CLOCKS[kind] || [];
  if (!state || !away) return [];
  const moved = [];
  for (const key of keys) {
    const value = Number(state[key]);
    if (!Number.isFinite(value) || value <= 0) continue;
    state[key] = value + away;
    moved.push(key);
  }
  return moved;
}

/**
 * Storyland rebuilt after a party: the scene events each act's Wall Button has shown so far, act by
 * act (js/greedy-street-spirit.js pressGreedyAct: act.eventIds[step] for each step read), so the
 * stage shows what it showed when you left.
 */
export function greedyReplayEvents(actSteps = [], acts = []) {
  const out = [];
  acts.forEach((act, index) => {
    const steps = Math.max(0, Math.min(Math.floor(Number(actSteps[index]) || 0), act?.eventIds?.length || 0));
    for (let step = 0; step < steps; step += 1) if (act.eventIds[step]) out.push(act.eventIds[step]);
  });
  return out;
}
