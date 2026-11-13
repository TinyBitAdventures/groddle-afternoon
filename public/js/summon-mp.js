/**
 * Summoning another real player (Teleportation V) in multiplayer: the menu
 * entry, the words and the target's own refusals. Pure: no DOM, no socket.
 * The server keeps the request and moves the target
 * (groddle-afternoon-server summon.go); the summoner's checks and payment are
 * js/teleportation.js canSummon / paySummon; features/summon-mp-feature.js is
 * the world side.
 *
 * Sources (GameServerJS, CC0):
 * - main.js doPcVerbMenu 3661-3715: "Summon <name>" on another player online
 *   and unblocked, for a player with Teleportation V; the tooltip "Summon
 *   this player to your location. -<cost> energy", disabled with
 *   can_summon's error, "They are too busy to be summoned." or "You can't do
 *   this anymore today"; requires_confirmation. The client asked "Are you
 *   sure you want to <tooltip>?" with "Never mind" and "Yes, I'm sure"
 *   (glitch-client InteractionMenuController.as 844-880).
 * - main.js doPcMenu 3878-3935: the summoner's "Waiting for <name> to
 *   confirm." (30 s), the target's "<name> would like to summon you to
 *   <place>. Do you accept?" or, from a Party Space, "<name> would like to
 *   invite you to their party in <place>. Do you accept?", Yes / No, 30 s,
 *   a timeout answering no.
 * - players/inc_teleportation.js: "<name> is on their way!" (648-655, 10 s),
 *   "<name> did not accept your summons." (718-725), "Oops. Something
 *   happened with that teleport." (614), the target's refusals in
 *   can_summon (740-759), "Summoning <name> to your location." (643, the
 *   token's reason, here the Activity line with the energy). From inside
 *   someone else's house the friend was sent to its front door outside
 *   (teleportation_summon 663-665, pols_get_entrance_outside) after being
 *   asked to the house by name, with no word of the door; the door lines
 *   here are ours, on the source's own "summon you to <place>" and "is on
 *   their way!".
 */

export const SUMMON_VERB = 'mp_summon';
/** Under Follow (900) and the server's other rows; main.js gives summon no sort_on. */
export const SUMMON_VERB_SORT = 950;
/** main.js:3893, 3907, 3922: the prompts' timeout. */
export const SUMMON_ASK_SECONDS = 30;
/** inc_teleportation.js:651: "<name> is on their way!" stays 10 s. */
export const SUMMON_ON_WAY_SECONDS = 10;

/** Words players read: Glitch's where it had them, else short plain remake copy. */
export const SUMMON_TEXT = Object.freeze({
  verb: (name) => `Summon ${name}`,
  tip: (cost) => `Summon this player to your location. -${cost} energy`,
  confirm: (cost) => `Are you sure you want to summon this player to your location. -${cost} energy?`,
  never: 'Never mind',
  sure: "Yes, I'm sure",
  waiting: (name) => `Waiting for ${name} to confirm.`,
  asked: (name, place) => `${name} would like to summon you to ${place}. Do you accept?`,
  askedParty: (name, place) => `${name} would like to invite you to their party in ${place}. Do you accept?`,
  yes: 'Yes',
  no: 'No',
  ok: 'OK',
  onTheirWay: (name) => `${name} is on their way!`,
  summoning: (name, cost) => `Summoning ${name} to your location.${cost ? ` -${cost} energy` : ''}`,
  declined: (name) => `${name} did not accept your summons.`,
  oops: 'Oops. Something happened with that teleport.',
  summoned: (name) => `${name} summoned you.`,
  // Ours (inc_teleportation.js 663-665 dropped the friend outside someone else's house without a word).
  door: (house) => `the front door of ${house}`,
  onTheirWayDoor: (name, house) => `${name} is on their way! They will arrive outside, at the front door of ${house}.`,
  summonedDoor: (name, house) => `${name} summoned you to the front door of ${house}.`,
  someHouse: 'the house',
  offline: "You're offline, so nobody can hear your summons right now.",
});

/**
 * The menu entry on another player (doPcVerbMenu 3661-3715), or null when the
 * summoner lacks Teleportation V. `check` is canSummon's answer ({ ok, error,
 * energyCost }).
 */
export function summonVerb({ targetId, name = '', rank = 0, check = null } = {}) {
  if (!(Number(targetId) > 0) || Number(rank) < 5) return null;
  const cost = Number(check?.energyCost) || 0;
  const ok = Boolean(check?.ok);
  return {
    id: SUMMON_VERB,
    label: SUMMON_TEXT.verb(String(name || 'them')),
    tooltip: SUMMON_TEXT.tip(cost),
    enabled: ok,
    reason: ok ? '' : String(check?.error || ''),
    durationMs: 0,
    sort: SUMMON_VERB_SORT,
  };
}

/**
 * The target's own refusal (can_summon 740-759), sent as summon_answer why, or '' to ask:
 * dead (They are dead.), busy in the tutorial or a quest room or any place the game holds
 * them in (They cannot be summoned right now.), Contraband (the fragile contraband line).
 * @param {{ dead?: boolean, busy?: boolean, contraband?: boolean }} me
 */
export function summonRefusal({ dead = false, busy = false, contraband = false } = {}) {
  if (contraband) return 'contraband';
  if (dead) return 'dead';
  if (busy) return 'busy';
  return '';
}

/** The target's prompt (main.js:3899-3925): into a Party Space it is the party's invitation. */
export function askedText({ name = '', place = '', party = '' } = {}) {
  const who = String(name || 'Someone');
  return party ? SUMMON_TEXT.askedParty(who, String(party)) : SUMMON_TEXT.asked(who, String(place || 'their location'));
}
