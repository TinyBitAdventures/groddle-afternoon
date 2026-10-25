/**
 * Parties in multiplayer (phase 4): the rules the party feature
 * (js/features/party-feature.js) draws from, kept pure (no DOM, no Pixi) so
 * tests drive them directly. The server is realtime/party.go, whose header
 * lists the messages; the original is GameServerJS groups/party.js and
 * players/inc_party.js, and the client's party chat (glitch-client
 * RightSideManager.as, InteractionMenuController.as).
 */

/** config_prod.js:40 max_party_size. */
export const PARTY_MAX_SIZE = 71;
/** inc_party.js:131 the invite prompt's timeout (party_invite_timeout - 1). */
export const PARTY_PROMPT_SECONDS = 89;
/** Lines kept in the party log. */
export const PARTY_LOG_LINES = 40;

/** Copy from the source, used by the feature. */
export const PARTY_TEXT = Object.freeze({
  title: 'Party Chat', // RightSideView.as:449, ContactElement.as:165
  inviteVerb: 'Invite to Party', // InteractionMenuController.as:581
  inviteTip: 'Invite this person to a multi-person private chat.', // InteractionMenuController.as:583
  accept: 'OK', // inc_party.js:134
  decline: 'No thanks', // inc_party.js:135
  leaveConfirm: "Are you sure you want to leave your party? You'll have to be invited back to rejoin.", // RightSideManager.as:722
  leaveYes: "Yes, I'd like to leave the party.", // RightSideManager.as:725
  leaveNo: 'Never mind.', // RightSideManager.as:724
  hidden: 'A secret place', // player.js:2094 make_hash_with_location, a hidden location
  notInParty: "You're not in a party!", // inc_party.js:360
});

/** A member as the server sends it (realtime/party.go roster). */
function normMember(m) {
  return {
    id: Number(m?.id) || 0,
    name: String(m?.name || 'A Glitch'),
    leader: m?.leader === true,
    online: m?.online === true,
    away: m?.away === true,
    street: typeof m?.street === 'string' ? m.street : '',
  };
}

/** The party message's party, or null when you are in none. */
export function normalizeParty(party) {
  if (!party || typeof party !== 'object' || !Array.isArray(party.members)) return null;
  const members = party.members.map(normMember).filter((m) => m.id > 0);
  if (members.length < 2) return null;
  const leader = members.find((m) => m.leader)?.id || Number(party.leader) || members[0].id;
  return { leader, members };
}

/**
 * Where a member is, in words: the street's name, "A secret place" off the
 * shared streets (homes, instances), or why they cannot be found.
 * @param {{ online: boolean, away: boolean, street: string }} member
 * @param {(tsid: string) => string} labelFor the street name for a tsid
 */
export function memberWhere(member, labelFor = (t) => t) {
  if (!member?.online) return 'Offline';
  if (member.away) return 'Reconnecting';
  if (!member.street) return PARTY_TEXT.hidden;
  return labelFor(member.street) || member.street;
}

/**
 * RightSideManager.as partyTooltip 1257-1290: "Partiers (3): You, Ada and Bo".
 * @param {{ members: { id: number, name: string }[] } | null} party
 * @param {number} meId
 */
export function partiersLine(party, meId) {
  const others = (party?.members || []).filter((m) => m.id !== meId).map((m) => m.name);
  const total = others.length;
  let txt = `Partiers (${total + 1}): `;
  if (!total) return `${txt}Just you!`;
  txt += `You${total > 1 ? ', ' : ' and '}`;
  others.forEach((name, i) => {
    if (i < total - 1) txt += name + (total > 2 ? ', ' : ' ');
    else txt += (total > 1 ? 'and ' : '') + name;
  });
  return txt;
}

/**
 * A party chat command, or null when the line is not one:
 * /p <text> and /party <text> talk to the party, /invite <name> invites
 * someone online, /leaveparty asks to leave. (The original had a Party Chat
 * tab instead; these are the remake's way to reach it from the one input.)
 * @returns {{ kind: 'chat', text: string } | { kind: 'invite', name: string } | { kind: 'leave' } | { kind: 'usage', text: string } | null}
 */
export function partyCommand(line) {
  const text = String(line || '').trim();
  const m = /^\/(p|party|invite|leaveparty)(?:\s+([\s\S]*))?$/i.exec(text);
  if (!m) return null;
  const word = m[1].toLowerCase();
  const rest = String(m[2] || '').replace(/\s+/g, ' ').trim();
  if (word === 'leaveparty') return rest ? null : { kind: 'leave' };
  if (word === 'invite') return rest ? { kind: 'invite', name: rest.slice(0, 64) } : { kind: 'usage', text: 'Who? Try /invite and their name.' };
  return rest ? { kind: 'chat', text: rest } : { kind: 'usage', text: 'Say something after /p to talk to your party.' };
}

/**
 * The Invite to Party verb for another player (InteractionMenuController.as
 * 580-590): off with a reason when they are already in your party.
 */
export function inviteVerb(player, party) {
  const member = Boolean(party?.members?.some((m) => m.id === player?.id));
  return {
    id: 'party_invite',
    label: PARTY_TEXT.inviteVerb,
    tooltip: PARTY_TEXT.inviteTip,
    enabled: !member,
    reason: member ? `${player?.name || 'They'} is already in your party.` : '',
    durationMs: 0,
  };
}

/** Players on this street you could invite: not already in your party. */
export function inviteCandidates(players, party) {
  const inParty = new Set((party?.members || []).map((m) => m.id));
  return (players || []).filter((p) => p && !inParty.has(p.id));
}
