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
 * Slice 2 (below): the owner's Butler for visitors (items/bag_butler.js
 * leave_package / leave_message; the site's src/ButlerParcels.php, the
 * server's homes_help.go), key-holders tending the owner's gardens
 * (items/garden_new.js tend; src/HomeTending.php), and the counters the
 * neighbour quests and the hosting badges read.
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
    // Slice 2: the owner's Butler as it looks (Neighbours::butlerView), or null.
    butler: answer.butler?.owned === true ? { owned: true, name: String(answer.butler.name || '').slice(0, 19), parts: answer.butler.parts && typeof answer.butler.parts === 'object' ? answer.butler.parts : {}, post: Number.isFinite(Number(answer.butler.post)) && answer.butler.post !== null ? Math.round(Number(answer.butler.post)) : null } : null,
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

// ---------------------------------------------------------------------------
// Slice 2: the owner's Butler for visitors, key-holders tending, the badges
// ---------------------------------------------------------------------------

/**
 * The owner's Butler as a visitor meets it (items/bag_butler.js; the words
 * are include/butler_strings.js 8, 29, 49, 140-172; the choices are
 * leave_package's conversation, bag_butler.js 1114). The site
 * (groddle-afternoon-site src/ButlerParcels.php) and the realtime server
 * (homes_help.go) take what a visitor leaves.
 */
export const VISITOR_BUTLER_CLASS = 'mp_butler';

export const VISITOR_BUTLER_VERBS = Object.freeze({
  talk: Object.freeze({ id: 'mp_butler_talk', label: 'talk to', tooltip: 'Say hello' }),
  // bag_butler.js leave_package 991-1004, leave_message 1146-1158.
  leavePackage: Object.freeze({ id: 'mp_butler_leave_package', label: 'leave package', tooltip: 'Leave a gift for the owner' }),
  leaveMessage: Object.freeze({ id: 'mp_butler_leave_message', label: 'leave message', tooltip: 'Leave a message for the owner' }),
});

export const VISITOR_BUTLER_TEXT = Object.freeze({
  strangerGreeting: (pc, owner) => `Hello, ${pc}. This is ${possessive(owner)} house.`,
  friendGreeting: (pc) => `Welcome, ${pc}.`,
  visitorOwnerHome: ' Please click on me if you need anything.',
  packageGiveSingle: (item, owner) => `Do you want to give this ${item} to ${owner}?`,
  packageGivePlural: (item, owner) => `Do you want to give these ${item} to ${owner}?`,
  yes: 'Of course!',
  keep: "No, I'm keeping it!",
  packageNo: "Oh, you're not leaving a package? Ok.",
  messageNo: "Oh, you're not leaving a message? Ok.",
  packageSuccess: (owner) => `Ok. What would you like me to tell ${owner}?`,
  packageConfirm: (owner) => `I will make sure ${owner} gets this!`,
  messageResponse: 'What is your message?',
  messageSuccess: (owner) => `Thanks! I will let ${owner} know.`,
  packageFail: "Sorry, I can't carry any more packages.",
  messageFail: "Sorry, I can't remember any more messages.",
  packageTypeFail: "Sorry, I'm not equipped to carry that.",
  interactFail: 'The Butler is talking to somebody else right now.',
  thanks: 'Thanks.',
  ok: 'Oh, ok.',
  // Ours: the picker, the box, nothing to give.
  pickTitle: 'Leave a package',
  pickHint: 'Choose something from your pack for the Butler to keep for them.',
  nothingToGive: "You don't have anything the Butler can carry.",
  howMany: 'How many?',
  leave: 'Leave it',
  cancel: 'Cancel',
  send: 'Leave message',
  skip: 'No message',
  // Ours: the owner hears at once (the source's Butler IMed an owner away from home).
  parcelArrived: (name, item, message) => (item && message ? `${name} left you a package and a message with your Butler.` : item ? `${name} left you a package with your Butler.` : `${name} left you a message with your Butler.`),
});

/** bag_butler.js:3762 input_max_chars. */
export const BUTLER_MESSAGE_MAX = 431;

/** The site's ids for a real visitor's parcel (homes_help.go: butler- and 16 hex). */
export function isSiteParcel(id) {
  return /^butler-[0-9a-f]{16}$/.test(String(id || ''));
}

/** The site's parcel list (groddle/v1/butler), checked. */
export function normalizeParcels(answer) {
  const out = [];
  for (const p of Array.isArray(answer?.parcels) ? answer.parcels : []) {
    const id = String(p?.id || '');
    const from = positiveId(p?.from?.id);
    if (!isSiteParcel(id) || !from) continue;
    const c = String(p?.item?.c || '');
    const n = Math.floor(Number(p?.item?.n) || 0);
    const item = /^[a-z0-9_]{1,64}$/.test(c) && n > 0 ? { c, n: Math.min(9999, n) } : null;
    const text = String(p?.text || '').slice(0, BUTLER_MESSAGE_MAX);
    if (!item && !text) continue;
    out.push({ id, from: { id: from, name: String(p?.from?.name || 'Someone').slice(0, 40) }, item, text, at: Math.max(0, Math.floor(Number(p?.at) || 0)) });
  }
  return out;
}

/**
 * The parcels the Butler does not hold yet, added to its state (js/butler.js
 * shape: packages keyed by the site's id, a package's message `<id>:m` with
 * withPackage, a lone message the site's id), as onLeavePackage +
 * takeMessage would have put them. Returns how many came in.
 */
export function mergeParcels(state, parcels) {
  if (!state || !Array.isArray(state.packages) || !Array.isArray(state.messages)) return 0;
  const held = new Set([...state.packages.map((p) => p.id), ...state.messages.map((m) => m.id)]);
  let added = 0;
  for (const p of parcels) {
    if (held.has(p.id) || held.has(`${p.id}:m`)) continue;
    const from = `p${p.from.id}`;
    if (p.item) state.packages.push({ id: p.id, from, fromName: p.from.name, classTsid: p.item.c, count: p.item.n, time: p.at });
    if (p.text) state.messages.push({ id: p.item ? `${p.id}:m` : p.id, from, fromName: p.from.name, text: p.text, time: p.at, withPackage: p.item ? p.id : null });
    added += 1;
  }
  return added;
}

/**
 * The tending a key-holder did on their copy of the owner's gardens, from
 * one plot's state before and after a garden verb (js/garden.js: water sets
 * wet, plant clean to seeds, clear dirty to clean, harvest crop to dirty).
 * Growth and drying (tickGarden) are not acts.
 */
export function tendAct(before, after) {
  if (!before || !after) return null;
  if (before.state === 'clean' && after.state === 'seeds' && after.seed) return { act: 'plant', seed: String(after.seed) };
  if (before.state === 'dirty' && after.state === 'clean') return { act: 'clear', seed: '' };
  if (before.state === 'crop' && after.state === 'dirty') return { act: 'harvest', seed: '' };
  if (!before.wet && after.wet && (after.state === 'seeds' || after.state === 'shoots' || after.state === 'crop')) return { act: 'water', seed: '' };
  return null;
}

/** A garden's plots as plain data (to compare after a verb). */
export function plotsSnapshot(garden) {
  const out = {};
  for (const [key, plot] of Object.entries(garden?.plots || {})) {
    out[key] = { state: plot?.state || 'clean', seed: plot?.seed || null, wet: plot?.wet === true };
  }
  return out;
}

/**
 * A key-holder's act on the owner's own garden (the owner's game, when it
 * hears of one): the garden grown to the act's time by the game's own
 * tickGarden, then the act's change, as the site recorded it
 * (src/HomeTending.php applyAct).
 */
export function applyTendAct(garden, act, tick = null) {
  const plot = garden?.plots?.[act?.plot];
  if (!plot) return false;
  const at = Number(act.at) || Date.now();
  if (typeof tick === 'function') tick(garden, at);
  if (act.act === 'water') {
    if (!plot.wet) plot.stageStartedAt = at;
    plot.wet = true;
    plot.wetAt = at;
    return true;
  }
  if (!['plant', 'clear', 'harvest'].includes(act.act)) return false;
  plot.state = act.act === 'plant' ? 'seeds' : act.act === 'clear' ? 'clean' : 'dirty';
  plot.seed = act.act === 'plant' ? String(act.seed || '') || null : null;
  plot.stageStartedAt = at;
  plot.growthMs = 0;
  if (act.act === 'plant') plot.growModifier = 1;
  return true;
}

/** The site's waiting acts (groddle/v1/homes/tending), checked. */
export function normalizeTendActs(list) {
  return (Array.isArray(list) ? list : []).map((a) => ({
    id: String(a?.id || ''),
    from: { id: positiveId(a?.from?.id), name: String(a?.from?.name || 'Someone').slice(0, 40) },
    yard: a?.yard === 'back' ? 'back' : 'street',
    garden: String(a?.garden || a?.g || ''),
    plot: String(a?.plot || a?.p || ''),
    act: String(a?.act || a?.a || ''),
    seed: String(a?.seed || a?.s || ''),
    at: Math.floor(Number(a?.at) || 0),
  })).filter((a) => a.garden && /^\d{1,2}-\d{1,2}$/.test(a.plot) && ['water', 'plant', 'clear', 'harvest'].includes(a.act));
}

/** What the owner reads when a friend tended their gardens (ours). */
export function tendedText(name, acts) {
  const kinds = new Set(acts.map((a) => a.act));
  const what = kinds.has('water') && kinds.size === 1 ? 'watered your garden'
    : kinds.has('plant') && kinds.size === 1 ? 'planted seeds in your garden'
      : kinds.has('harvest') && kinds.size === 1 ? 'harvested your garden'
        : kinds.has('clear') && kinds.size === 1 ? 'cleared a plot in your garden'
          : 'tended your garden';
  return `${name} ${what}.`;
}

/**
 * The quest and badge counters a visitor's help earns. The source declares
 * them but never counts three of them (quests/good_neighbor.js
 * neighbors_resources_tended, quests/neighbor_gifts.js give_bag_butler,
 * quests/water_neighbor_garden.js water_garden_for_others): reimagined, they
 * count what the quest text says. herb_seeds_planted_for_others is the
 * source's own (include/garden.js:394-396: each herb seed planted in a
 * garden that is not yours).
 */
export const NEIGHBOUR_COUNTERS = Object.freeze({
  tended: 'neighbors_resources_tended',
  gifts: 'give_bag_butler',
  watered: 'water_garden_for_others',
  herbs: 'herb_seeds_planted_for_others',
});

/**
 * The counters one site-confirmed tend call earns: every plot tended
 * (neighbors_resources_tended, reimagined: "Tend 11 Resources"), each
 * garden watered once a visit (water_garden_for_others, reimagined: "Water 5
 * gardens that aren't yours"), each herb seed planted (the source's).
 * `wateredThisVisit` is a Set of '<yard>:<garden>' the visit already counted.
 */
export function tendCounters(acts, { herbGardens = new Set(), wateredThisVisit = new Set() } = {}) {
  const out = [];
  for (const a of acts) {
    out.push([NEIGHBOUR_COUNTERS.tended, 1]);
    const bed = `${a.yard}:${a.garden}`;
    if (a.act === 'water' && !wateredThisVisit.has(bed)) {
      wateredThisVisit.add(bed);
      out.push([NEIGHBOUR_COUNTERS.watered, 1]);
    }
    if (a.act === 'plant' && herbGardens.has(bed) && /^herb_seed_/.test(a.seed)) out.push([NEIGHBOUR_COUNTERS.herbs, 1]);
  }
  return out;
}

/**
 * give_bag_butler, reimagined ("Leave 5 gifts of at least one item to the
 * butlers of 5 different neighbors"): a package counts once per owner.
 * Returns the new list of owners gifted and whether this one counted.
 */
export function noteGift(gifted, ownerId) {
  const id = positiveId(ownerId);
  const list = Array.isArray(gifted) ? gifted.filter((x) => positiveId(x)).slice(-64) : [];
  if (!id || list.includes(id)) return { gifted: list, counted: false };
  return { gifted: [...list, id].slice(-64), counted: true };
}

/** locations/home.js:59-64: the badge counters a hosted party earns the owner. */
export function hostedCounters(msg) {
  const out = [];
  if (msg?.three) out.push('hosted_party:three');
  if (msg?.seventeen) out.push('hosted_party:seventeen');
  return out;
}

/** The slice the feature keeps in the save (tending applied, owners gifted, the neighbour counters). */
export const TENDED_KEEP = 64;

export function normalizeNeighboursSlice(slice) {
  const s = slice && typeof slice === 'object' ? slice : {};
  const counts = {};
  for (const name of Object.values(NEIGHBOUR_COUNTERS)) {
    const n = Math.floor(Number(s.counts?.[name]) || 0);
    if (n > 0) counts[name] = Math.min(1e6, n);
  }
  return {
    tended: (Array.isArray(s.tended) ? s.tended : []).filter((id) => /^tend-[0-9a-f]{16}$/.test(String(id))).slice(-TENDED_KEEP),
    gifted: (Array.isArray(s.gifted) ? s.gifted : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(-64),
    /** The neighbour quests' counters so far (the quests themselves are offered once multiplayer quests are). */
    counts,
  };
}
