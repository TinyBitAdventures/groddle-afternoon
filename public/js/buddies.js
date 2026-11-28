/**
 * Buddies in multiplayer (register G325): the rules and copy the buddies
 * feature (js/features/buddies-feature.js) draws from, kept pure (no DOM, no
 * Pixi) so tests drive them directly. The list lives on the site
 * (groddle-afternoon-site src/Buddies.php, groddle/v1/buddies); presence comes
 * from the realtime server (groddle-afternoon-server/buddies.go, whose header
 * lists the messages). The original is GameServerJS players/inc_buddies.js
 * and the player menu in main.js (3590-3646).
 */
import { UNNAMED_PLAYER } from './player-names.js?v=f9b78094';
import { PLAYER_REPORT_TEXT } from './player-report.js?v=8d7e5653';

/** config_prod.js:1276 buddy_limit. */
export const BUDDY_LIMIT = 1000;
/** Ask the site for a fresh watch token this often (it is good for an hour, Buddies::WATCH_TTL). */
export const WATCH_REFRESH_MS = 30 * 60 * 1000;
/** The badge counter the buddy badges count (achievements/good_buddy.js and the rest: player buddies_count). */
export const BUDDY_COUNTER = 'player:buddies_count';

export const BUDDY_VERBS = Object.freeze({
  add: 'buddy_add',
  remove: 'buddy_remove',
  ignore: 'buddy_ignore',
  unignore: 'buddy_unignore',
  report: 'player_report', // G872 (js/player-report.js)
});

/** Copy from the source where it has some (file:line), else short plain words. */
export const BUDDY_TEXT = Object.freeze({
  title: 'Buddies', // inc_buddies.js:10 the group's label
  addVerb: 'Add to Friends', // main.js:3638
  addTip: 'Add this person to your contact list', // main.js:3641
  removeVerb: 'Remove from Friends', // main.js:3620
  removeTip: 'Remove this person from your contact list', // main.js:3623
  ignoreVerb: 'Block', // main.js:3594 'Block / Report': Report is its own row here (G872, js/player-report.js)
  ignoreTip: (name) => `Prevent ${name} from talking to you`, // main.js:3597
  unignoreVerb: (name) => `Un-Block ${name}`, // main.js:3605
  unignoreTip: (name) => `Allow ${name} to talk to you`, // main.js:3608
  limit: (n) => `You currently have the maximum number of friends (${n} or more!)`, // main.js:3640
  addedYou: (name) => `${name} just added you as a contact!`, // inc_buddies.js:209
  // inc_buddies.js:215-225: added while you were away and not your buddy, a friend_add notification asks you to add them back.
  addedYouAsk: (name) => `${name} just added you as a contact! Add them back?`,
  addBack: 'Add back',
  notNow: 'Not now',
  blocked: (name) => `You blocked ${name}.`, // inc_buddies.js:560
  unblocked: (name) => `You un-blocked ${name}.`, // inc_buddies.js:577
  hidden: 'A secret place', // inc_buddies.js:343 a hidden location
  added: (name) => `${name} is on your buddy list now.`,
  removed: (name) => `${name} is off your buddy list.`,
  online: (name) => `${name} is online.`,
  offline: (name) => `${name} went offline.`,
  removeConfirm: (name) => `Remove ${name} from your friends?`,
  ignoreConfirm: (name) => `Block ${name}? You won't see their chat or emotes, they can't invite you to a party or trade with you, and they come off your buddy list.`,
  unignoreConfirm: (name) => `Un-block ${name}?`,
  yes: 'Yes',
  no: 'Never mind.',
  offlineWhere: 'Offline',
  empty: 'No buddies yet. Click another player to add them.',
  failed: 'That didn\'t work. Try again in a moment.',
});

const n0 = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);

function entry(e, extra = {}) {
  return { id: n0(e?.id), name: String(e?.name || UNNAMED_PLAYER), ...extra };
}

/**
 * The site's answer (groddle/v1/buddies) in the shape the feature keeps:
 * { limit, buddies: [{ id, name, addedAt, mutual }], reverse: [{ id, name,
 * addedAt, isNew }], ignoring: [{ id, name }], token, expiresIn, told }.
 */
export function normalizeList(answer) {
  const a = answer && typeof answer === 'object' ? answer : {};
  const list = (rows, map) => (Array.isArray(rows) ? rows.map(map).filter((e) => e.id > 0) : []);
  return {
    limit: n0(a.limit) || BUDDY_LIMIT,
    buddies: list(a.buddies, (e) => entry(e, { addedAt: String(e?.addedAt || ''), mutual: e?.mutual === true })),
    reverse: list(a.reverse, (e) => entry(e, { addedAt: String(e?.addedAt || ''), isNew: e?.new === true })),
    ignoring: list(a.ignoring, (e) => entry(e)),
    token: typeof a.watch?.token === 'string' ? a.watch.token : '',
    expiresIn: n0(a.watch?.expiresIn),
    told: typeof a.told === 'string' ? a.told : '',
  };
}

export const isBuddy = (list, id) => Boolean(list?.buddies.some((b) => b.id === id));
export const isReverse = (list, id) => Boolean(list?.reverse.some((b) => b.id === id));
export const isIgnoring = (list, id) => Boolean(list?.ignoring.some((b) => b.id === id));

/**
 * The player menu's buddy entries for another player (main.js:3590-3646):
 * Add to Friends (disabled at the limit unless they added you first) or
 * Remove from Friends, then Block or Un-Block at the bottom, and Report
 * under it (G872: Glitch's Block / Report, main.js:3594, as two rows; a
 * blocked player can still be reported).
 */
export function buddyVerbs(list, player) {
  if (!list || !player?.id) return [];
  const name = String(player.name || 'them');
  const out = [];
  if (isBuddy(list, player.id)) {
    out.push({ id: BUDDY_VERBS.remove, label: BUDDY_TEXT.removeVerb, tooltip: BUDDY_TEXT.removeTip, enabled: true, reason: '', durationMs: 0, sort: 2 });
  } else {
    const ok = list.buddies.length < list.limit || isReverse(list, player.id);
    out.push({ id: BUDDY_VERBS.add, label: BUDDY_TEXT.addVerb, tooltip: BUDDY_TEXT.addTip, enabled: ok, reason: ok ? '' : BUDDY_TEXT.limit(list.limit), durationMs: 0, sort: 1000 });
  }
  if (isIgnoring(list, player.id)) {
    out.push({ id: BUDDY_VERBS.unignore, label: BUDDY_TEXT.unignoreVerb(name), tooltip: BUDDY_TEXT.unignoreTip(name), enabled: true, reason: '', durationMs: 0, sort: 2000 });
  } else {
    out.push({ id: BUDDY_VERBS.ignore, label: BUDDY_TEXT.ignoreVerb, tooltip: BUDDY_TEXT.ignoreTip(name), enabled: true, reason: '', durationMs: 0, sort: 2000 });
  }
  out.push({ id: BUDDY_VERBS.report, label: PLAYER_REPORT_TEXT.verb, tooltip: PLAYER_REPORT_TEXT.tip(name), enabled: true, reason: '', durationMs: 0, sort: 2001 });
  return out;
}

/**
 * Where a buddy is, in words: offline, the street's name, or "A secret
 * place" for a private one (street '').
 * @param {{ street: string } | undefined} presence the server's last word, undefined when offline
 * @param {(tsid: string) => string} labelFor
 */
export function buddyWhere(presence, labelFor = (t) => t) {
  if (!presence) return BUDDY_TEXT.offlineWhere;
  if (!presence.street) return BUDDY_TEXT.hidden;
  const label = labelFor(presence.street);
  return label && label !== presence.street ? label : BUDDY_TEXT.hidden;
}

/** Reverse entries the player has not been told about yet (added while they were away). */
export function freshReverse(list, told = new Set()) {
  return (list?.reverse || []).filter((r) => r.isNew && !told.has(r.id));
}

/**
 * How to tell a fresh reverse entry (buddies_has_added, inc_buddies.js:203-225):
 * 'ask' (they are not your buddy: Add them back?, the friend_add notification),
 * 'tell' (already your buddy: the line alone, friend_add_mutual).
 */
export function addedYouKind(list, id) {
  return isBuddy(list, id) ? 'tell' : 'ask';
}

/** Who added you that you have not added back: the panel's "Added you" rows. */
export function addedYouOnly(list) {
  return (list?.reverse || []).filter((r) => !isBuddy(list, r.id) && !isIgnoring(list, r.id));
}

/**
 * One of the server's presence messages applied to id -> { name, street }; returns what changed.
 * `quiet` is the server's word that the change is for the list alone, with no notice: a buddy going
 * on and off again inside its window (groddle-afternoon-server buddies.go sayOnline/sayOffline,
 * ours: Glitch showed no notice at all, Austin 2026-11-28).
 */
export function applyPresence(online, msg) {
  const id = n0(msg?.id);
  if (!id) return null;
  const name = String(msg.name || UNNAMED_PLAYER);
  const quiet = msg.quiet === true;
  switch (msg.t) {
    case 'buddy_online':
      online.set(id, { name, street: String(msg.street || '') });
      return { id, name, kind: 'online', quiet };
    case 'buddy_moved':
      online.set(id, { name, street: String(msg.street || '') });
      return { id, name, kind: 'moved', quiet };
    case 'buddy_offline':
      online.delete(id);
      return { id, name, kind: 'offline', quiet };
    default:
      return null;
  }
}

/** buddies_status: the whole online map again. */
export function applyStatus(online, msg) {
  online.clear();
  for (const p of Array.isArray(msg?.online) ? msg.online : []) {
    const id = n0(p?.id);
    if (id) online.set(id, { name: String(p.name || UNNAMED_PLAYER), street: String(p.street || '') });
  }
  return online;
}

/**
 * #646: the buddy list's two orders. 'online' (the default) is Glitch's: ContactList.as builds
 * Online buddies over Offline buddies, each section sorted by label, case-insensitively
 * (BaseContacts.as 154: SortTools.vectorSortOn(contact_sort, ['label'], [Array.CASEINSENSITIVE])).
 * 'az' is every buddy by name alone (a player's request), so no row moves when people come and go.
 */
export const BUDDY_SORTS = Object.freeze(['online', 'az']);
export const BUDDY_SORT_TEXT = Object.freeze({ label: 'Sort buddies', online: 'Online first', az: 'A to Z' });
/** The per-browser key the chosen order is kept under. */
export const BUDDY_SORT_KEY = 'groddle.buddySort';

/** PURE: a known order, else Glitch's. */
export function normalizeBuddySort(v) {
  return BUDDY_SORTS.includes(v) ? v : 'online';
}

const byName = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }) || (Number(a?.id) || 0) - (Number(b?.id) || 0);

/** PURE: the buddies in `mode`'s order (`online`: a Set or Map of online ids). */
export function sortBuddies(buddies = [], online = new Set(), mode = 'online') {
  const on = (b) => Number(Boolean(online?.has?.(b.id)));
  const list = [...(buddies || [])];
  return normalizeBuddySort(mode) === 'az' ? list.sort(byName) : list.sort((a, b) => on(b) - on(a) || byName(a, b));
}

/** The chosen order from storage (a blocked or missing storage: Glitch's). */
export function loadBuddySort(storage = globalThis.localStorage) {
  try {
    return normalizeBuddySort(storage?.getItem?.(BUDDY_SORT_KEY));
  } catch {
    return 'online';
  }
}

export function saveBuddySort(mode, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(BUDDY_SORT_KEY, normalizeBuddySort(mode));
  } catch { /* a blocked storage keeps it for the session */ }
}
