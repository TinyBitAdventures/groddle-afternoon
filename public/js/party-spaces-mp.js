/**
 * Party Spaces between real players (G334, multiplayer only): the pure side
 * of what groddle-afternoon-server/party_spaces.go sends (its header lists
 * the messages and the source rules). The feature is
 * js/features/party-spaces-feature.js; solo never calls any of this.
 *
 * Source (GSJS, CC0): items/party_pack.js verbs.activate conditions (a party
 * is needed: "You must be in a party to activate. Didn't you read the
 * instructions?"), groups/party.js create_space / delete_space /
 * extend_space_time, players/inc_party.js party_space_prompt 456-475 (the
 * offer of a teleporter for the teleportation energy cost), main.js
 * party_space_kick 3730-3739 (the creator's "Kick out <name>", "Kick this
 * player out of your Party Space", with a confirmation) and 3963-3976.
 */

import { PARTY_SPACES, isPartyPack } from './party-spaces.js?v=6fea0ad5';

/** The hub street a space's members share (party_spaces.go partySpaceStreet + 16 hex, upper case). */
export const MP_SPACE_STREET_RE = /^PARTY_[0-9A-F]{16}$/;

export const MP_PARTY_TEXT = Object.freeze({
  noParty: "You must be in a party to activate. Didn't you read the instructions?",
  activating: 'Your Party Pack is being activated.',
  kickLabel: (name) => `Kick out ${name}`,
  kickTooltip: 'Kick this player out of your Party Space',
  kickConfirm: (name) => `Kick ${name} out of your Party Space?`,
  kickYes: 'Kick out',
  kickNo: 'Never mind',
  inviteKicker: (label) => `Party Space: ${label}`,
  inviteGo: (cost) => `Teleport (${cost} energy)`,
  inviteLater: 'Not now',
  partying: (names) => (names.length ? `Partying there now: ${names.join(', ')}.` : 'Nobody is there yet.'),
  inviteCost: (cost) => `A teleporter to the party costs ${cost} energy.`,
  privateSpace: 'That Party Space is private.',
  offline: "You're offline, so the party can't hear you right now.",
});

const int = (v) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : 0);

/**
 * A server Space as the game keeps it, or null: expiresAt is the local clock
 * the server's "left" lands on (both members' clocks run from the same left).
 */
export function normalizeSpace(view, now = Date.now()) {
  if (!view || typeof view !== 'object') return null;
  const street = String(view.street || '');
  const template = String(view.template || '');
  if (!MP_SPACE_STREET_RE.test(street) || !PARTY_SPACES[template]) return null;
  const left = Math.max(0, int(view.left));
  return {
    id: String(view.id || street.slice(6).toLowerCase()),
    street,
    template,
    label: String(view.label || PARTY_SPACES[template].label),
    pack: isPartyPack(view.pack) ? view.pack : '',
    taster: view.taster === true,
    creatorId: int(view.creator?.id),
    creatorName: String(view.creator?.name || ''),
    expiresAt: now + left,
    extensions: Math.max(0, int(view.extensions)),
    warned: view.warned === true,
  };
}

/** A party record (party-spaces.js startParty's shape) for a server space. */
export function partyFromSpace(space, previous = null, now = Date.now()) {
  if (!space) return null;
  const same = previous?.mp?.id === space.id ? previous : null;
  return {
    template: space.template,
    packClass: space.pack,
    taster: space.taster,
    startedAt: same?.startedAt || now,
    expiresAt: space.expiresAt,
    warned: space.warned,
    extensions: space.extensions,
    inside: same?.inside === true,
    returnTo: same?.returnTo || null,
    taken: same?.taken || {},
    teleporter: same?.teleporter || null,
    instance: same?.instance || now,
    mp: { id: space.id, street: space.street, creatorId: space.creatorId, creatorName: space.creatorName },
  };
}

/**
 * party_pack.js verbs.activate conditions in multiplayer: '' when Activate is
 * on. Before the instructions are read it is on (the instructions come first).
 */
export function mpActivationBlock({ inParty = false, instructionsRead = false, pending = false } = {}) {
  if (pending) return MP_PARTY_TEXT.activating;
  if (!instructionsRead) return '';
  return inParty ? '' : MP_PARTY_TEXT.noParty;
}

/** What a party_space message with no space means for the player (null: nothing to say). */
export function goneText(why, { expired = 'Our Party Space expired.' } = {}) {
  return why === 'expired' ? expired : null;
}

/** main.js:3730-3739: the creator, in the space, at someone else in it. */
export function kickVerb({ me, space, onSpaceStreet, target }) {
  if (!space || !onSpaceStreet || !target?.id || !me || space.creatorId !== me || target.id === me) return null;
  return { id: 'party_space_kick', label: MP_PARTY_TEXT.kickLabel(target.name || 'them'), enabled: true, tooltip: MP_PARTY_TEXT.kickTooltip };
}
