/**
 * A L'il Animal Kinship (the Animal Kinship skill quest street,
 * GHFRK14DDU53RQQ, instance of LHFEB4262843QGP): the practice animals and
 * their hint signs (register G290). Pure data and rules; the newxp feature
 * draws them.
 *
 * Sources (tinyspeck/glitch-GameServerJS, CC0):
 * - locations/skillquest_ak.js (and _v2, the same here):
 *   - location_targets 17-25: chicken (708, -101), piggy (1434, -104),
 *     butterfly (2190, -260), butterfly_lotion (1823, -190)
 *   - playerEnterCallback 40: wall_off broadcast 1 s after entering
 *   - eventScriptEventFired 103-143: items_added butterfly_lotion ->
 *     lotion_off; verb_milk_success -> the butterfly deleteWithPoof(20, 100)
 *     2.5 s later; verb_massage_success -> sign4off 2.5 s later;
 *     verb_squeeze_success twice -> the chicken deleteWithPoof(20, 100) and
 *     s1off 2.5 s later (the count starts again); verb_nibble_success -> the
 *     piggy deleteWithPoof(20, 100) 2.5 s later; verb_pet_success -> s2off
 *     2.5 s later
 *   - spawnChicken / spawnPiggy / spawnButterfly 227-250:
 *     createItemStackWithPoof at its target, once per visit, and
 *     sendBubble(text, 5 s) 2 s later
 * - LHFRK14DDU53RQQ.xml events: chicken / pig / butterfly call those spawns
 *   (code_location); sign1-4 and lotion show the hint signs (1 s fade, once:
 *   flag_has_exit); s1off, s2off, sign4off and lotion_off hide them.
 * - GHFRK14DDU53RQQ.xml: the hint signs are groddle_sign_blank decos whose
 *   sign_txt the client printed (default_deco_sign_med; the EXIT plaque
 *   deco_sign_vag_lg_gray, standalone and never hidden).
 *
 * The Collision-triggered Event Boxes that fired chicken, pig, butterfly,
 * sign1-4 and lotion were instance items (ten listed in LHFRK14DDU53RQQ.xml
 * items), and none was archived. They are rebuilt in front of what each one
 * shows, as on Gentle Island (js/newxp.js ISLAND_EVENT_BOXES): street px,
 * bottom-centre boxes like the street's own.
 */

export const SKILLQUEST_AK_TSID = 'GHFRK14DDU53RQQ';
export const SKILLQUEST_AK_SOURCE = 'LHFRK14DDU53RQQ';

/** spawnChicken / spawnPiggy / spawnButterfly: where (source px) and what each says. */
export const AK_ANIMALS = Object.freeze({
  npc_chicken: Object.freeze({ event: 'chicken', label: 'Chicken', x: 708, y: -101, bubble: 'Go ahead, squeeze me!' }),
  npc_piggy: Object.freeze({ event: 'pig', label: 'Piggy', x: 1434, y: -104, bubble: 'Get your nibble on!' }),
  npc_butterfly: Object.freeze({ event: 'butterfly', label: 'Butterfly', x: 2190, y: -260, bubble: 'Mmmm, massage me!', airborne: true }),
});

/** apiSetTimerX('sendBubble', 2*1000, text, 5*1000). */
export const AK_BUBBLE = Object.freeze({ delayMs: 2000, durationMs: 5000 });
/** apiSetTimerX('deleteWithPoof', 2.5*1000, 20, 100); item.js 509: gone 200 ms after the puff. */
export const AK_POOF_OUT = Object.freeze({ delayMs: 2500, dx: 20, dy: 100, deleteMs: 200 });
/** playerEnterCallback: apiSetTimerX('broadcastLocationEvent', 1*1000, 'wall_off'). */
export const AK_WALL_OFF_MS = 1000;
/** verb_squeeze_success: the chicken goes after the second squeeze. */
export const AK_SQUEEZES = 2;

/** The rebuilt event boxes (street px, bottom centre), each firing its events in order. */
export const AK_EVENT_BOXES = Object.freeze([
  Object.freeze({ id: 'chicken', x: 480, y: 900, w: 160, h: 400, events: Object.freeze(['sign1', 'chicken']) }),
  Object.freeze({ id: 'pig', x: 1180, y: 900, w: 160, h: 400, events: Object.freeze(['sign2', 'pig']) }),
  Object.freeze({ id: 'lotion', x: 1640, y: 900, w: 160, h: 400, events: Object.freeze(['lotion']) }),
  Object.freeze({ id: 'butterfly', x: 2010, y: 900, w: 160, h: 400, events: Object.freeze(['sign3', 'butterfly', 'sign4']) }),
]);

/** sign_txt (GHFRK14DDU53RQQ.xml), keyed by deco id. */
export const AK_SIGNS = Object.freeze({
  groddle_sign_blank_1340840145185: Object.freeze({ text: 'Chickens give up grain with a simple squeeze.', face: true }),
  groddle_sign_blank_1340318892614: Object.freeze({ text: 'Piggies prefer to be pet before being nibbled.', face: true }),
  groddle_sign_blank_1340318892615: Object.freeze({ text: 'Butterflies require a rubdown before being milked.', face: true }),
  groddle_sign_blank_1342128759601: Object.freeze({ text: 'Hint: Jump and hit Enter in air, to catch high butterflies.', face: true }),
  groddle_sign_blank_1342128759604: Object.freeze({ text: 'Grab the lotion', face: true }),
  groddle_sign_blank_1342132710696: Object.freeze({ text: 'EXIT', face: true, plaque: true }),
});

/** The animal a location event spawns (chicken -> npc_chicken), or null. */
export function akAnimalForEvent(event) {
  for (const [classId, row] of Object.entries(AK_ANIMALS)) if (row.event === event) return classId;
  return null;
}

/** A fresh per-visit state (reset(): spawned flags cleared, squeeze_count gone). */
export function createAkState() {
  return { spawned: {}, squeezes: 0 };
}

/**
 * eventScriptEventFired for one successful animal verb: what happens 2.5 s
 * later, as { poof: classId | null, event: locationEvent | null }, or null.
 * `alive(classId)` says whether that animal is still on the street
 * (getAnimal); the chicken's s1off rides on it being there, as in the source.
 */
export function akVerbReaction(state, verb, alive = () => true) {
  const v = String(verb || '').split(':')[0];
  if (v === 'milk') return alive('npc_butterfly') ? { poof: 'npc_butterfly', event: null } : null;
  if (v === 'massage') return { poof: null, event: 'sign4off' };
  if (v === 'nibble') return alive('npc_piggy') ? { poof: 'npc_piggy', event: null } : null;
  if (v === 'pet') return { poof: null, event: 's2off' };
  if (v === 'squeeze') {
    state.squeezes = (state.squeezes || 0) + 1;
    if (state.squeezes < AK_SQUEEZES) return null;
    state.squeezes = 0;
    return alive('npc_chicken') ? { poof: 'npc_chicken', event: 's1off' } : null;
  }
  return null;
}
