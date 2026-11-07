/**
 * Groups and chat channels in multiplayer (register G326): the rules and
 * copy the groups feature (js/features/groups-feature.js) draws from, kept
 * pure (no DOM, no Pixi) so tests drive them directly. The groups live on
 * the site (groddle-afternoon-site src/Groups.php, groddle/v1/groups); the
 * chat runs on the realtime server (groddle-afternoon-server/channels.go,
 * whose header lists the messages). The original is GameServerJS
 * groups/group.js and players/inc_groups.js, and the AS3 client's chat
 * panes (RightSideManager.as, BaseContacts.as, LiveHelpDialog.as,
 * TradeChannelDialog.as).
 */

import { hasBadWord, NAME_REFUSED } from './word-filter.js?v=9a7a7ebb';

/** config_prod.js:39 max_groups. */
export const GROUPS_MAX = 20;
/** Lines each chat tab keeps (the server's history ring is the same size, channels.go chanHistory). */
export const CHAT_LINES = 50;
/** Ask the site for a fresh watch token this often (it is good for an hour, Groups::WATCH_TTL). */
export const WATCH_REFRESH_MS = 30 * 60 * 1000;
/** Group names (Groups::NAME): a character name's letters, up to 32. */
export const GROUP_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9 _-]{1,30})[A-Za-z0-9]$/;
export const DESCRIPTION_MAX = 300;

/**
 * The game-wide channels, in the client's order (BaseContacts.as:173-177:
 * Live Help, Global, then Trade) with its labels (RightSideManager.as 1519,
 * 1545, 1573).
 */
export const CHANNELS = Object.freeze([
  Object.freeze({ id: 'help', label: 'Live Help' }),
  Object.freeze({ id: 'global', label: 'Global Chat' }),
  Object.freeze({ id: 'trade', label: 'Trade Channel' }),
]);
const CHANNEL_IDS = new Set(CHANNELS.map((c) => c.id));

/** The dialog each channel opens with the first time (LiveHelpDialog.as 50-87, TradeChannelDialog.as 50-95). */
export const CHANNEL_INTRO = Object.freeze({
  help: Object.freeze({
    title: 'Hey! It\'s the Help Channel!',
    body: 'This chat channel exists for players to ask and answer questions about the game. Please use the global chat channel for anything else and keep this free for helping. Thanks!',
    ok: 'OK! I will only use this for help!',
  }),
  trade: Object.freeze({
    title: 'Hello! This is the Trade Channel!',
    body: 'This channel is for trading chat only. Other conversations should happen elsewhere! Buyers come first; sellers: no spamming. Still, be funny & creative.',
    ok: 'Got it! I am here for trading',
  }),
});

/**
 * CMDHELP (Austin 2026-11-03): the note each join of a channel ends its history with
 * (features/groups-feature.js channel_joined), the remake's own words.
 */
export const CHANNEL_WELCOME = Object.freeze({
  help: 'Ask and answer questions about the game here. Type / in chat for commands.',
});

/** Copy from the source where it has some (file:line), else short plain words. */
export const GROUP_TEXT = Object.freeze({
  title: 'Groups',
  find: 'Find Groups', // ContactList.as:41
  street: 'Street',
  party: 'Party',
  admin: 'Administrator', // group.js:49 level 1 label_single
  member: 'Member', // group.js:53
  public: 'Public',
  private: 'Private',
  notFound: 'Group not found', // inc_groups.js:329
  notIn: 'You\'re not in that group', // group.js:1058
  needsTrade: 'The Trade Channel needs the Trade Channelling upgrade.', // player.js:3404 canJoinTradeChat
  limit: (n) => `You are in ${n} groups, the most you can be in. Leave one to join another.`,
  joined: (name) => `You joined ${name}.`,
  left: (name) => `You left ${name}.`,
  created: (name) => `You made ${name}.`,
  invited: (who, group) => `You invited ${who} to ${group}.`,
  invitedYou: (who, group) => `${who} invited you to ${group}.`,
  declined: (group) => `You declined ${group}.`,
  leaveConfirm: (name) => `Leave ${name}?`,
  leaveLastConfirm: (name) => `Leave ${name}? You are its last member, so the group ends.`,
  yes: 'Yes',
  no: 'Never mind.',
  offline: 'You are offline, so nobody heard that.',
  emptyMine: 'You are not in any groups yet. Find one below, or make your own.',
  emptySearch: 'No public groups match that.',
  failed: 'That didn\'t work. Try again in a moment.',
});

const n0 = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
const str = (v, max = 300) => String(v ?? '').slice(0, max);

/** A group card from the site (Groups::card). */
export function normalizeGroup(g) {
  return {
    id: n0(g?.id),
    name: str(g?.name, 32) || 'A group',
    description: str(g?.description),
    mode: g?.mode === 'private' ? 'private' : 'public',
    members: n0(g?.members),
    role: g?.role === 'admin' ? 'admin' : 'member',
    member: g?.member === true,
  };
}

/** The site's answer for the caller (Groups::answer), checked. */
export function normalizeGroups(answer) {
  const groups = (Array.isArray(answer?.groups) ? answer.groups : []).map(normalizeGroup).filter((g) => g.id);
  const invites = (Array.isArray(answer?.invites) ? answer.invites : []).map((g) => ({
    ...normalizeGroup(g),
    invitedBy: { id: n0(g?.invitedBy?.id), name: str(g?.invitedBy?.name, 32) || 'A Glitch' },
  })).filter((g) => g.id && !groups.some((m) => m.id === g.id));
  const ch = answer?.channels || {};
  return {
    max: n0(answer?.max) || GROUPS_MAX,
    groups,
    invites,
    channels: {
      global: ch.global !== false,
      help: ch.help === 'help' ? 'help' : 'newbie',
      trade: ch.trade === true,
      silenced: Array.isArray(ch.silenced) ? ch.silenced.filter((s) => s === 'chat' || s === 'help') : [],
    },
    token: typeof answer?.watch?.token === 'string' ? answer.watch.token : '',
  };
}

/** The chat name of a group on the realtime server (channels.go "group:<id>"). */
export const groupChannel = (id) => `group:${n0(id)}`;

/** The group id of a chat name, or 0 for a channel. */
export function groupIdOf(channel) {
  const m = /^group:([1-9]\d{0,18})$/.exec(String(channel || ''));
  return m ? Number(m[1]) : 0;
}

export function isChannel(channel) {
  return CHANNEL_IDS.has(channel);
}

/** Whether a chat name is one the game knows (a channel or a group). */
export function knownChat(channel) {
  return isChannel(channel) || groupIdOf(channel) > 0;
}

/** A tab's label: the channel's, or the group's name. */
export function chatLabel(channel, list) {
  const c = CHANNELS.find((x) => x.id === channel);
  if (c) return c.label;
  const id = groupIdOf(channel);
  return list?.groups.find((g) => g.id === id)?.name || 'Group';
}

/** Whether this player may open a chat now, by the site's list. */
export function mayOpen(channel, list) {
  if (!list) return false;
  if (channel === 'global') return list.channels.global;
  if (channel === 'help') return true;
  if (channel === 'trade') return list.channels.trade;
  const id = groupIdOf(channel);
  return id > 0 && list.groups.some((g) => g.id === id);
}

/**
 * The tabs in order: Street, Party (while in one), the channels (Live
 * Help, Global, Trade), then groups by name (BaseContacts.as:163-177 sorts
 * groups by label, case aside).
 */
export function tabOrder(open, list, { inParty = false } = {}) {
  const set = new Set(open || []);
  const tabs = ['street'];
  if (inParty) tabs.push('party');
  for (const c of CHANNELS) if (set.has(c.id)) tabs.push(c.id);
  const groups = [...set].filter((ch) => groupIdOf(ch) > 0)
    .map((ch) => ({ ch, name: chatLabel(ch, list).toLowerCase() }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : groupIdOf(a.ch) - groupIdOf(b.ch)));
  for (const g of groups) tabs.push(g.ch);
  return tabs;
}

/** A chat line from the server (channel_said or a history entry), or null. */
export function chatLine(m) {
  const id = n0(m?.id);
  const text = String(m?.text ?? '').slice(0, 200);
  if (!id || !text) return null;
  // lid: the line's id for reactions (the server's reactions.go), 0 without one.
  // web: said on the website's /chat/ (groddle-afternoon-server webchat.go); shown as "(web)" after the name.
  return { id, name: str(m?.name, 32) || 'A Glitch', text, at: Number(m?.at) || 0, lid: Math.max(0, Math.floor(Number(m?.lid)) || 0), web: m?.web === true };
}

/** The tag after the name of a line said on the website. */
export const WEB_TAG = '(web)';

/** PURE: the name a chat line shows: with WEB_TAG when it was said on the website. */
export function shownName(line) {
  return line?.web ? `${line.name} ${WEB_TAG}` : String(line?.name || '');
}

/**
 * PURE: a chat's lines without the one an administrator deleted (groddle-afternoon-server
 * chatdelete.go chat_delete, by its lid); the same array when it was not there.
 */
export function dropLid(lines, lid) {
  const n = Math.floor(Number(lid)) || 0;
  if (!n || !lines.some((l) => l.lid === n)) return lines;
  return lines.filter((l) => l.lid !== n);
}

/** Appends to a tab's lines, keeping the last CHAT_LINES. */
export function pushLine(lines, line, max = CHAT_LINES) {
  lines.push(line);
  while (lines.length > max) lines.shift();
  return lines;
}

/** A typed line in a chat tab: { who: true } for /who, { say } for words, null for other commands (the game's own). */
export function tabCommand(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/^\/who\s*$/i.test(t)) return { who: true };
  if (t.startsWith('/')) return null;
  return { say: t };
}

/** A group name's first problem, or '' (Groups::NAME and the site's words). */
export function groupNameProblem(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  if (!GROUP_NAME.test(n)) return 'Group names are 3 to 32 letters, numbers, spaces, - or _, starting and ending with a letter or number.';
  // The word filter (the remake's own addition): a name with a bad word is refused, as the site's Groups::create does.
  return hasBadWord(n) ? NAME_REFUSED : '';
}

/** What the game remembers per player: the chats open and the tab in front (a per-viewer convenience). */
export function readMemory(storage, userId) {
  const blank = { open: [], tab: 'street', intro: {} };
  if (!storage || !n0(userId)) return blank;
  try {
    const raw = JSON.parse(storage.getItem(`groddle-chats:${n0(userId)}`) || 'null');
    if (!raw || typeof raw !== 'object') return blank;
    const open = (Array.isArray(raw.open) ? raw.open : []).filter(knownChat).slice(0, 32);
    const tab = typeof raw.tab === 'string' && (raw.tab === 'street' || raw.tab === 'party' || knownChat(raw.tab)) ? raw.tab : 'street';
    const intro = {};
    for (const k of ['help', 'trade']) if (raw.intro?.[k] === true) intro[k] = true;
    return { open: [...new Set(open)], tab, intro };
  } catch {
    return blank;
  }
}

export function writeMemory(storage, userId, memory) {
  if (!storage || !n0(userId)) return false;
  try {
    storage.setItem(`groddle-chats:${n0(userId)}`, JSON.stringify({ open: [...new Set(memory.open || [])].filter(knownChat), tab: memory.tab || 'street', intro: memory.intro || {} }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Scrolling back past the lines the realtime server keeps (Austin 2026-11-04): the site keeps every
 * channel and group line (groddle-afternoon-site src/ChatHistory.php, GET chat/channels/<key>?before=<lid>).
 */
export const EARLIER_TEXT = Object.freeze({ more: 'Earlier messages', loading: 'Loading', none: 'No earlier messages', failed: 'Earlier messages did not load. Try again.' });

/** How many lines a chat holds once earlier ones are brought in (the drawer's LINE_LIMIT). */
export const EARLIER_MAX = 200;

/** PURE: the site's word for a chat ('global', 'help', 'trade', 'group-12'), or '' (Local, party). */
export function historyKey(channel) {
  if (channel === 'global' || channel === 'help' || channel === 'trade') return channel;
  const g = groupIdOf(channel);
  return g > 0 ? `group-${g}` : '';
}

/**
 * PURE: older lines from the site (newest first, as it answers) put before a chat's lines, oldest
 * first: each line once (by lid), none `hidden(id)` says you block, at most max (the newest kept).
 */
export function mergeEarlier(lines, older, { max = EARLIER_MAX, hidden = () => false } = {}) {
  const have = new Set(lines.filter((l) => l.lid).map((l) => l.lid));
  const add = [];
  for (const raw of Array.isArray(older) ? older : []) {
    const l = chatLine(raw);
    if (!l || !l.lid || have.has(l.lid) || hidden(l.id)) continue;
    have.add(l.lid);
    add.push(l);
  }
  add.sort((a, b) => a.lid - b.lid);
  const out = [...add, ...lines];
  return out.length > max ? out.slice(out.length - max) : out;
}

/** PURE: the lid to ask before: the oldest line's, 0 when there is none. */
export function oldestLid(lines) {
  let min = 0;
  for (const l of lines) if (l.lid && (!min || l.lid < min)) min = l.lid;
  return min;
}
