/**
 * Visiting real players' homes and house keys in multiplayer (register
 * G328): the pure rules and the copy. The feature is
 * js/features/neighbours-mp-feature.js; the site's routes are
 * groddle-afternoon-site src/Neighbours.php (groddle/v1/homes, keys) and the
 * realtime server's module is groddle-afternoon-server homes.go.
 *
 * Sources: GameServerJS players/inc_houses.js (houses_visit 961-1035 and
 * admin_houses_visit 933-959, the knock 119-165 and 446-495),
 * locations/inc_pols.js pols_canEnter 278-532, players/inc_visiting.js,
 * players/inc_acl_keys.js and locations/inc_acl_keys.js, the client's
 * InteractionMenuController.as 622-628 ("Visit Home Street") and the keyring
 * (port/ACLDialog.as, view/ui/acl/*.as).
 *
 * Solo never loads any of this: solo's neighbours are js/neighbours.js.
 */

/** The realtime server's street for a player's home street (homes.go). */
export const HOME_STREET_PREFIX = 'HOME_';
/** The realtime server's street for a player's house. */
export const HOUSE_STREET_PREFIX = 'HOUSE_';
/** The scene tsid a visitor stands in on someone's home street or in their house. */
export const VISIT_SCENE_PREFIX = 'MPH_';

/** InteractionMenuController.as 622-628. */
export const VISIT_VERB = Object.freeze({
  id: 'visit_home_street',
  label: 'Visit Home Street',
  tooltip: "Go to the outside of this person's house.",
});

export const KEY_VERB = Object.freeze({ id: 'house_keys', label: 'Keys', tooltip: 'Manage your keyring' });

export const NEIGHBOURS_TEXT = Object.freeze({
  // port/ACLDialog.as 105, 123, 157, 168, 179, 256, 313.
  keyringTitle: 'Manage your keyring',
  keysFromFriends: 'Keys from friends',
  yourHouse: 'Your house',
  giveSubtitle: 'Give keys to your friends',
  receivedSubtitle: "View keys you've received",
  sendKey: 'Send them a key',
  done: 'Done',
  backToKeyring: 'Back to your keyring',
  // view/ui/acl/ACLYourHouseUI.as 41, 48; ACLKeysGivenUI.as 54, 90; ACLCreateKeyUI.as 62, 81-82, 103.
  wantToLet: 'Want to let your friends come and go as they please?',
  giveOut: 'Give out a key',
  givenHeader: "Keys you've given out",
  givenEmpty: 'Keys that you give out will show up here',
  chooseFriend: "Choose a friend you'd like to give a key to:",
  roommate: 'Roommate alert! Your friend will have access to everything in your house, including your crops and cabinet.',
  success: 'Success!',
  // ACLKeyGivenElementUI.as 34, 48-49, 64-65; ACLKeyReceivedElementUI.as 40, 69, 78.
  revoke: 'Revoke key',
  yes: 'Yes',
  no: 'No',
  revokeConfirm: (name) => `Are you sure you want to revoke ${possessive(name)} access to your house? If they're currently in your house, they'll be kicked out.`,
  visit: 'Visit',
  alreadyHere: 'You are already here!',
  // Ours: no friends to give a key to, nothing received.
  noFriends: 'Add some friends first (Menu, Buddies), then you can give them a key.',
  receivedEmpty: 'Keys your friends give you will show up here.',
  noHouse: "You can't give out keys because you don't have a house!",
  // inc_houses.js:142-150 houses_auth_request's prompt.
  knocking: (name) => `${name} is knocking on your door and would like to enter your house...`,
  letIn: 'Ok, let them in.',
  dontAnswer: "Nope, don't answer the door",
  // inc_houses.js:475-488, houses_familiar_knock (start, knock).
  knockVerb: 'Knock on the door',
  knockSent: "Ok! We'll let you know if they answer the door",
  // inc_pols.js:466; inc_houses.js:89; inc_acl_keys.js:57.
  entered: (name) => `${name} just entered your house.`,
  letYouIn: (name) => `${name} has let you into their house.`,
  veryWell: 'Very well',
  keyGiven: (name) => `${name} sent you a key to their house! (Keys can be found at your Magic Rock.)`,
  // Ours: the source sent the keyring's update alone.
  keyTaken: (name) => `${name} took back the key to their house.`,
  // Ours, plain words: the door, the way back, being walked out.
  enterVerb: 'Go inside',
  outsideVerb: 'Go outside',
  goBackVerb: 'Go back',
  noAnswer: (name) => `${name} didn't answer the door.`,
  outRevoked: (name) => `Your key to ${possessive(name)} house was taken back, so you are outside again.`,
  outOwnerLeft: (name) => `${name} went offline, so you are outside again.`,
  belongs: (name) => `That belongs to ${name}.`,
  visited: (name) => `You visited ${homeStreetName(name)}.`,
  cantFromHere: "You can't go visiting from here.",
  offline: 'You are offline, so you cannot visit anyone right now.',
  failed: "That didn't work. Try again in a moment.",
});

/** StringUtil.nameApostrophe: Ada's, James'. */
export function possessive(name) {
  const n = String(name || 'Someone');
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}

/** The loading card's and street name's "<Name>'s Home Street". */
export function homeStreetName(name) {
  return `${possessive(name)} Home Street`;
}

export function houseName(name) {
  return `${possessive(name)} House`;
}

function positiveId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** The realtime server's street for a home: HOME_<id> or HOUSE_<id>. */
export function homeStreetFor(ownerId, room = 'street') {
  const id = positiveId(ownerId);
  if (!id) return '';
  return `${room === 'interior' ? HOUSE_STREET_PREFIX : HOME_STREET_PREFIX}${id}`;
}

/** The visit scene's tsid (engine.enterScene): MPH_<id> on the street, MPH_<id>_IN in the house. */
export function visitSceneTsid(ownerId, room = 'street') {
  const id = positiveId(ownerId);
  if (!id) return '';
  return `${VISIT_SCENE_PREFIX}${id}${room === 'interior' ? '_IN' : ''}`;
}

/** { owner, room } a visit scene tsid names, or null. */
export function readVisitScene(tsid) {
  const m = /^MPH_([1-9]\d{0,17})(_IN)?$/.exec(String(tsid || ''));
  return m ? { owner: Number(m[1]), room: m[2] ? 'interior' : 'street' } : null;
}

/**
 * The street others share with the player now (realtime-feature's
 * realtimeStreet query): someone's home they visit, or their own home when
 * they are there (a Tower floor stays private, as the source's tower was its
 * own location nobody was let into).
 */
export function sharedHomeStreet({ visit = null, me = 0, inHome = false, room = 'street', towerFloor = false } = {}) {
  if (visit?.owner) return homeStreetFor(visit.owner, visit.room);
  if (!inHome || !positiveId(me) || towerFloor) return '';
  return homeStreetFor(me, room === 'interior' ? 'interior' : 'street');
}

/** The site's visit answer, checked: null unless it names an owner with a home. */
export function normalizeHomeView(answer) {
  const owner = positiveId(answer?.owner?.id);
  const name = String(answer?.owner?.name || '').trim().slice(0, 40);
  if (!owner || !name || answer?.home?.owned !== true) return null;
  const style = ['meadow', 'firebog', 'uralia'].includes(answer.home.style) ? answer.home.style : 'meadow';
  return {
    owner: { id: owner, name },
    home: { owned: true, style },
    homes: answer.homes && typeof answer.homes === 'object' && !Array.isArray(answer.homes) ? answer.homes : {},
    key: answer.key === true,
    pass: typeof answer.pass?.token === 'string' && answer.pass.token ? answer.pass.token : '',
    random: answer.random === true,
  };
}

/** The keyring answer, checked. */
export function normalizeKeys(answer) {
  const rows = (list) => (Array.isArray(list) ? list : [])
    .map((r) => ({ id: positiveId(r?.id), name: String(r?.name || '').slice(0, 40), at: typeof r?.at === 'string' ? r.at : '' }))
    .filter((r) => r.id && r.name);
  return {
    given: rows(answer?.given),
    received: rows(answer?.received),
    houseLimit: positiveId(answer?.houseLimit) || 100,
    playerLimit: positiveId(answer?.playerLimit) || 100,
    hasHouse: answer?.hasHouse === true,
  };
}

/** Whether the keyring says holder has a key to owner's house, from my side. */
export function holdsKeyFrom(keys, ownerId) {
  return Boolean(keys?.received?.some((r) => r.id === positiveId(ownerId)));
}

/**
 * StringUtil.formatTime for the keyring lines (ACLKeyGivenElementUI.as 49,
 * ACLKeyReceivedElementUI.as 69): under 12 hours "not long", else the time
 * in days or hours.
 */
export function keyAge(at, now = Date.now()) {
  const t = Date.parse(String(at || ''));
  const secs = Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 1000)) : 0;
  if (secs < 43200) return 'not long';
  const days = Math.floor(secs / 86400);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(secs / 3600);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export const givenLine = (at, now) => `Given a key ${keyAge(at, now)} ago`;
export const receivedLine = (at, now) => `Gave you a key ${keyAge(at, now)} ago`;

/** Buddies you could give a key to: not already holding one. */
export function keyCandidates(buddies = [], keys = null) {
  const held = new Set((keys?.given || []).map((r) => r.id));
  return (Array.isArray(buddies) ? buddies : []).filter((b) => positiveId(b?.id) && !held.has(Number(b.id)));
}

/**
 * The visit's door: with a key (or once let in) "Go inside", else "Knock on
 * the door" (the source's walk into the door asked the same,
 * houses_familiar_knock 'start').
 */
export function doorVerbs({ key = false, letIn = false, ownerName = '' } = {}) {
  if (key || letIn) return [{ id: 'enter', label: NEIGHBOURS_TEXT.enterVerb, tooltip: `Into ${houseName(ownerName)}`, enabled: true, reason: '' }];
  return [{ id: 'knock', label: NEIGHBOURS_TEXT.knockVerb, tooltip: `See if ${ownerName || 'they'} will let you in`, enabled: true, reason: '' }];
}

/** The home_out reason, as the visitor reads it. */
export function outText(why, ownerName) {
  return why === 'revoked' ? NEIGHBOURS_TEXT.outRevoked(ownerName) : NEIGHBOURS_TEXT.outOwnerLeft(ownerName);
}
