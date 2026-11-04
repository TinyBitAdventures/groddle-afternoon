/**
 * The Social drawer (phase 2 modern skin; the HUD mock's right-hand drawer, Warm paper).
 *
 * One place on the right for what the game says and what players say. Its tab row is always the
 * same five (Austin's option A, 2026-11-02, after ticket 37: with many chats open the row ran off
 * the drawer and Local went out of sight): Activity (the notifier's log, js/notify.js: the same
 * entries, no second log), Local (the street's chat), Global (Global Chat: features/groups-feature.js
 * joins it when you pick the tab), Buddies (who is online and where: features/buddies-feature.js),
 * and Chats, a list of every other conversation: Private (your party, your Butler's IMs), Groups
 * (your groups' chats) and Channels (Live Help, the Trade Channel), each row with its avatar, name,
 * a short note, its last line and its unread count, unread and newest first. Picking a row opens
 * that conversation under a "‹ Chats" bar (the Chats tab stays selected); back goes to the list.
 * The client kept Local on screen and picked the other chats from its contact list
 * (RightSideView.as 195-199, ContactList.as 120-307), which is what the list is. Solo has Activity
 * only, with the chat input under it (solo's Local chat: Feat lines, hi, slash commands).
 *
 * - Open it is 300 px wide (--drawer-w), at most 600 px tall, top right under the top bar.
 *   Collapsed it is a 44 px rail (--rail-w) of the same tabs with unread badges (Chats with the
 *   total of its conversations). It opens by default at 1440 px wide and up and starts as the rail
 *   below; the player's own choice is kept (localStorage SOCIAL_STORE_KEY, every access in
 *   try/catch: a private window just gets the default again).
 * - The drawer is #local-chat-dock (so the tutorial's rule hiding Local chat,
 *   body.nx-hide-chat #local-chat-dock in newxp-feature, hides it too) and holds
 *   #local-chat-form and #local-chat-input as they were, so the game's submit
 *   handler, the slash commands and every feature reading the input work as before.
 * - The input keeps what you said: Up and Down walk back through it. "/" opens the
 *   drawer and focuses the input unless something else has the keyboard.
 * - Keys (ticket 37): a click never takes the keyboard (the arrow keys keep walking the avatar).
 *   With a tab focused (Tab to it) the arrow keys move along the row, with a ring round it; in the
 *   Chats list Up and Down move between rows and Enter opens one; Escape in a conversation goes
 *   back to the list, and Escape again (or on the row) gives the keys back to the game.
 * - The world canvas is not resized: the drawer sits over the world. inset() says how
 *   much of the right edge it covers, so the notices (js/notify-view.js) centre in what
 *   is left.
 *
 * Features hand their lines and views over (engine.social): channel(id, opts) makes or
 * changes a conversation, push(id, line) adds a line, setLines(id, lines) replaces them,
 * drop(id) takes one away, select(id) brings one to the front (in Chats unless it is a tab),
 * refresh() redraws after their data changed, statusSlot holds the realtime state pill.
 *
 * RIGHTCLICK (Austin 2026-11-03, right-click audit later batch item 2): in every chat a speaker's
 * name is a button (Local, Global, the groups, the party, IMs, Live Help, the Trade Channel); a
 * left click, a right-click, Enter or Shift+F10 on it opens that player's menu from a list
 * (playerMenu: game.js openPlayerListMenu, js/ui/player-menu.js), as Glitch's name links did
 * (glitch-client port/RightSideManager.as 305-307, view/ui/TSLinkedTextField.as 105-106). The rest
 * of the line stays plain text: selecting it and the browser's Copy work as before, and a
 * right-click on a name inside selected text keeps the browser's menu too. Your own lines ("You")
 * and lines with no player behind them (notes, the Butler, Feat lines) have no button. A Buddies
 * row opens the same menu (item 3): a click on the row, a right-click, a long press on touch, Enter
 * or Shift+F10 on its name; its IM and Visit chips act as before (Glitch's contact rows,
 * view/ui/chat/ContactElement.as 267-271). A Chats row (item 5) has a menu of its own, by a
 * right-click, a long press, Shift+F10 or the Menu key: Open (what a click does), then that
 * conversation's head buttons (Who is here and Close for a group or a channel, Leave for the
 * party, Close for an IM), and for an IM the other player's menu from a list (without IM: Open is
 * the IM). The menu closes when the drawer collapses or the tab changes.
 *
 * REACTIONS (js/chat-reactions.js, js/ui/reaction-strip.js; Austin 2026-11-04): online, a line handed over
 * with a reaction key (`rk`: a Local, party, channel or group line's id from the server, or an IM line's)
 * has an add-reaction button and its chips under the words; features/chat-reactions-feature.js connects
 * the sender (reactions.connect) and hands each line's reactions over (reactions.set). A change redraws
 * only that line's chips, in place: the rows and their words stay, so a selection survives it too.
 *
 * THREADS (js/chat-threads.js; Austin 2026-11-04): a conversation handed over with `threads: true` (Global
 * Chat, Live Help, the Trade Channel, the groups, IMs; never Local or the party) gives each line with a key a
 * "Reply in thread" button beside its reaction button and, once it has replies, a "3 replies · Ada" button
 * under it (redrawn in place, keyed by the line's `rk`). Either opens the thread in place: a "‹ Back" head,
 * the line, its replies (names, links, reactions as in the log) and the input sending there; Escape or Back
 * goes back to the conversation. Replies never show in the conversation's own log.
 * features/chat-threads-feature.js connects the sender (threads.connect) and hands the replies over.
 *
 * QA: canvas data socialThread (chat|key of the thread open, or ''), socialThreadReplies (how many it
 * shows), socialOpen (open|rail), socialTab (the tab selected: activity, local, global,
 * buddies or chats), socialChat (the conversation open in Chats, or ''), socialTabs (the row),
 * socialChats (the list's ids in order), socialUnread (id:n,... for every tab and conversation with
 * news, chats:n the Chats total); window.groddleSocial.
 */
import { colorizeAmounts } from '../notify-view.js?v=2835afc0';
import { bindContextTrigger, MORE_KEYS_LABEL } from './context-menu.js?v=57c5f1fe';
import { IM_VERB_ID } from '../player-im.js?v=23463a96';
import { selectionCovers } from './context-guard.js?v=0f71ac17';
import { appendLinkedText, linkifyTextNodes } from '../chat-links.js?v=b717fac7';
import { bindChatInput } from './chat-input.js?v=3cb4ce2e';
import { createNodeCache, pressLeavesKeys, reconcileChildren, uniqueKeys } from './keyed-nodes.js?v=9ab4de5c';
import { createReactionUI } from './reaction-strip.js?v=5118c23b';
import { sameWords } from '../chat-reactions.js?v=d65d555b';
import { THREAD_TEXT, mergeReplies, normalSummary, summaryText } from '../chat-threads.js?v=42954351';

export const SOCIAL_STORE_KEY = 'groddle-social-drawer';
/** The drawer opens by default at this window width and up (the mock's 1440 rule). */
export const OPEN_MIN_WIDTH = 1440;
/** A time line goes into the scrollback when this long has passed since the line before. */
export const TIME_GAP_MS = 5 * 60 * 1000;
export const LINE_LIMIT = 200;
export const HISTORY_LIMIT = 50;
/** The Global tab before groups-feature has joined Global Chat. */
export const GLOBAL_WAIT = 'Joining Global Chat…';
/** The Chats list with nothing in it. */
export const CHATS_EMPTY = 'Your party, your Butler, your groups, Live Help and the Trade Channel show here. Open a channel or a group from Menu, Groups.';

const ORDER = { activity: 0, local: 10, global: 15, party: 20, channel: 30, buddies: 90 };

/** The tabs that are always in the row (online), in order; every other conversation is in Chats. */
export const FIXED_TABS = Object.freeze(['activity', 'local', 'global', 'buddies']);
/** The row's last tab: the list of the other conversations. */
export const CHATS_TAB = 'chats';
/** A tab's label when its conversation's own name is too long for the row. */
export const TAB_LABELS = Object.freeze({ global: 'Global' });
/** The Chats list's sections, in order. */
export const CHAT_SECTIONS = Object.freeze([
  Object.freeze({ id: 'private', title: 'Private' }),
  Object.freeze({ id: 'groups', title: 'Groups' }),
  Object.freeze({ id: 'channels', title: 'Channels' }),
]);

/** PURE: a conversation's section: its own word, else by its id (party, butler and im:* private, group:* a group, the rest channels). */
export function sectionOf(id, section = '') {
  if (CHAT_SECTIONS.some((s) => s.id === section)) return section;
  const v = String(id || '');
  if (v === 'party' || v === 'butler' || v.startsWith('im:')) return 'private';
  if (v.startsWith('group:')) return 'groups';
  return 'channels';
}

/** PURE: the row of tabs: the fixed ones there are, then Chats (online, or once there is a conversation). */
export function tabRow(ids, { online = false } = {}) {
  const have = new Set(ids || []);
  const row = FIXED_TABS.filter((id) => have.has(id));
  const others = [...have].filter((id) => !FIXED_TABS.includes(id));
  if (online || others.length) row.push(CHATS_TAB);
  return row;
}

/**
 * PURE: the Chats list: [{ id, title, rows }] for the sections with conversations, each section's
 * rows unread first, then newest (by the last line's time), then by name.
 * `convs`: [{ id, label, section, unread, lastAt }].
 */
export function chatSections(convs) {
  const out = [];
  for (const s of CHAT_SECTIONS) {
    const rows = (convs || []).filter((c) => sectionOf(c.id, c.section) === s.id).sort((a, b) =>
      Number((b.unread || 0) > 0) - Number((a.unread || 0) > 0)
      || (Number(b.lastAt) || 0) - (Number(a.lastAt) || 0)
      || String(a.label).localeCompare(String(b.label)));
    if (rows.length) out.push({ id: s.id, title: s.title, rows });
  }
  return out;
}

/** PURE: a list row's last line: "You: …" or "Name: …", only the words in a private chat with that one person; '' for none. */
export function lastLineText(lines, { label = '', section = '' } = {}) {
  const l = (lines || []).at(-1);
  if (!l) return '';
  if (l.note) return String(l.text || '');
  const who = l.mine ? 'You' : String(l.name || 'Someone');
  if (section === 'private' && !l.mine && who === label) return String(l.text || '');
  return `${who}: ${l.text}`;
}

const ICONS = {
  expand: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m12 5-5 5 5 5"/></svg>',
  collapse: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m6 4 4 4-4 4"/></svg>',
  chev: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m4.5 3 3 3-3 3"/></svg>',
  activity: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2.5 10h3l2-5 3.5 10 2-5h4.5"/></svg>',
  local: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3.5 4.5h13v9h-7l-4 3v-3h-2z"/></svg>',
  party: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="7" cy="7.5" r="2.5"/><circle cx="13.5" cy="8" r="2"/><path d="M2.5 16c.5-2.8 2.3-4.2 4.5-4.2s4 1.4 4.5 4.2M12 12.2c2.2-.4 4.4.8 5 3.8"/></svg>',
  channel: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2.5 3.5h10v7h-5l-3 2.5v-2.5h-2z"/><path d="M14.5 7.5h3v7h-1.5v2.5l-3-2.5h-4v-2"/></svg>',
  chats: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M2.5 4h11M2.5 8h11M2.5 12h7"/></svg>',
  thread: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 4.5h10v6.5H8l-3 2.5V11H3z"/><path d="M15 8h2v6.5h-1.5V17l-3-2.5H10"/></svg>',
  back: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m7.5 3-3 3 3 3"/></svg>',
  buddies: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="9" cy="7" r="3"/><path d="M3.5 16.5c.6-3 2.8-4.7 5.5-4.7 1.2 0 2.3.3 3.2 1M15 11.5v5M12.5 14h5"/></svg>',
  send: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3.5 10 16.5 4l-4 12-2.5-5z"/></svg>',
};

/** "9:31 AM": the scrollback's time lines and the Activity entries' times. */
export function clockLabel(ms) {
  const d = new Date(ms);
  const h = d.getHours();
  return `${((h + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * Items with a time line before the first and before each that comes TIME_GAP_MS
 * or more after the one before: [{ sep: '9:31 AM' }, item, item, { sep: '9:40 AM' }, ...].
 */
export function withTimeLines(items, atOf = (x) => x.at, gap = TIME_GAP_MS) {
  const out = [];
  let last = null;
  for (const it of items) {
    const at = Number(atOf(it)) || 0;
    if (last === null || at - last >= gap) out.push({ sep: clockLabel(at) });
    last = at;
    out.push(it);
  }
  return out;
}

/** The badge's words: up to 99, then 99+. */
export function badgeText(n) {
  return n > 99 ? '99+' : String(n);
}

/** Open or rail when the player has not chosen: open from OPEN_MIN_WIDTH up. */
export function defaultOpen(width) {
  return Number(width) >= OPEN_MIN_WIDTH;
}

/** The player's choice: true (open), false (rail) or null (none yet). */
export function readChoice(storage) {
  try {
    const v = storage?.getItem(SOCIAL_STORE_KEY);
    return v === 'open' ? true : v === 'rail' ? false : null;
  } catch {
    return null;
  }
}

export function writeChoice(storage, open) {
  try {
    storage?.setItem(SOCIAL_STORE_KEY, open ? 'open' : 'rail');
    return true;
  } catch {
    return false;
  }
}

/** What you said, for Up and Down in the input (newest last, no repeats in a row). */
export function createHistory(limit = HISTORY_LIMIT) {
  const said = [];
  let at = -1;
  return {
    push(text) {
      const t = String(text || '').trim();
      at = -1;
      if (!t || said[said.length - 1] === t) return;
      said.push(t);
      while (said.length > limit) said.shift();
    },
    /** The line before the one showing (Up); null when there is none. */
    up() {
      if (!said.length) return null;
      at = at < 0 ? said.length - 1 : Math.max(0, at - 1);
      return said[at];
    },
    /** The line after (Down); '' past the newest; null when not walking. */
    down() {
      if (at < 0) return null;
      at += 1;
      if (at >= said.length) {
        at = -1;
        return '';
      }
      return said[at];
    },
    reset() {
      at = -1;
    },
    get lines() {
      return [...said];
    },
  };
}

/** A name's initial and a colour slot (0-7) for the round avatar. */
export function avatarOf(name) {
  const s = String(name || '?').trim() || '?';
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return { initial: [...s][0].toUpperCase(), hue: h % 8 };
}

/** "Ada: hi" (a solo chat line in the Activity log) as name and words, or null. */
export function splitChat(text) {
  const m = /^([^:]{1,40}):\s(.+)$/s.exec(String(text || ''));
  return m ? { name: m[1], text: m[2] } : null;
}

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

function storageOf() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * Mounts the drawer on `dock` (#local-chat-dock) inside `root` (#game-root).
 * `notifier` is js/notify.js's; `mode` 'solo' or 'online'; `canChat()` says whether "/"
 * may take the keyboard now; `streetName()` names the street for the input's hint.
 */
export function mountSocialDrawer({
  root,
  dock,
  notifier,
  mode = 'solo',
  canChat = () => true,
  streetName = () => '',
  setData = () => {},
  storage = storageOf(),
  width = () => globalThis.innerWidth || 0,
  playerMenu = null,
  contextMenu = () => null,
} = {}) {
  if (typeof document === 'undefined' || !root || !dock || !notifier) return null;
  const online = mode === 'online';
  const form = dock.querySelector('#local-chat-form');
  const input = dock.querySelector('#local-chat-input');
  const inputLabel = dock.querySelector('label[for="local-chat-input"]');
  const sendBtn = form?.querySelector('button[type="submit"]');
  const history = createHistory();

  /** id -> { id, kind, label, order, lines, unread, header, prefix, placeholder, inputLabel, compose, empty, section, note, initial, live, since } */
  const tabs = new Map();
  let tab = 'activity';
  let choice = readChoice(storage);
  let open = choice ?? defaultOpen(width());
  const listeners = new Set();
  /** fn() after each redraw, so a second view of a log keeps up (the Classic skin's lower pane). */
  const renderListeners = new Set();
  const rendered = () => {
    for (const fn of renderListeners) {
      try { fn(); } catch (e) { console.warn('social', e); }
    }
  };
  /** How many players are online (the server's presence_count), null until it says. */
  let onlineCount = null;
  /** Ids of buddies' "added you" already seen on the Buddies tab. */
  const seenAdds = new Set();
  let addsUnread = 0;

  // REACTIONS: rk -> the line's reactions ([{ key, by }]); the sender once a feature connects one.
  const reactStore = new Map();
  let reactor = null;
  const reactUI = online
    ? createReactionUI({
      doc: document,
      reactions: (rk) => reactStore.get(rk) || [],
      me: () => Number(reactor?.me?.()) || 0,
      send: (rk, key, on) => Boolean(reactor?.send?.(rk, key, on)),
      enabled: () => Boolean(reactor),
      host: () => root,
    })
    : null;
  // THREADS: tk (the line's rk) -> { n, last, replies, loaded, loading, note, parent }; the sender once a feature connects one.
  const threadStore = new Map();
  let threader = null;
  /** The thread open in place of its conversation: { chat, tk }, or null. */
  let thread = null;
  const threadParts = new WeakMap();
  const threadRows = new Map();
  function storeOf(tk) {
    let st = threadStore.get(tk);
    if (!st) threadStore.set(tk, (st = { n: 0, last: null, replies: [], loaded: false, loading: false, note: '', parent: null }));
    return st;
  }
  const threadable = (chatId, line) => Boolean(online && threader && line?.rk && !line.note && !line.sep && !line.reply && tabs.get(chatId)?.threads);
  function paintThread(row) {
    const p = threadParts.get(row);
    if (!p) return;
    const st = threadStore.get(p.tk);
    const text = summaryText(st);
    if (p.drawn === text) return;
    p.drawn = text;
    p.bar.hidden = !text;
    p.bar.textContent = text;
    p.bar.setAttribute('aria-label', text ? `${text}. Open the thread` : THREAD_TEXT.reply);
    row.classList.toggle('has-thread', Boolean(text));
  }
  /** A line's thread controls: the reply button (after the reaction button) and the count under it. */
  function decorateThread(row, line, chatId) {
    if (!threadable(chatId, line)) return;
    const tk = String(line.rk);
    let p = threadParts.get(row);
    if (!p || p.tk !== tk) {
      const reply = el('button', { type: 'button', class: 'thread-reply', 'data-thread-reply': tk, 'aria-label': THREAD_TEXT.replyLabel(line.mine ? '' : line.name), title: THREAD_TEXT.reply });
      reply.innerHTML = ICONS.thread;
      const bar = el('button', { type: 'button', class: 'thread-open', 'data-thread-open': tk });
      bar.hidden = true;
      for (const b of [reply, bar]) {
        b.addEventListener('pointerdown', (e) => {
          if (e.button === 0) e.preventDefault?.();
        });
        b.addEventListener('click', (e) => openThread(chatId, tk, { focus: e.detail === 0 || b === reply }));
      }
      row.append(reply, bar);
      row.classList.add('can-thread');
      p = { tk, reply, bar, drawn: null };
      threadParts.set(row, p);
    }
    // The reply button sits after the reaction button (on the line), the count last (under the chips).
    const add = row.querySelector?.('[data-react-add]');
    if (add && add.nextSibling !== p.reply) row.insertBefore(p.reply, add.nextSibling ?? null);
    if (p.bar.nextSibling) row.append(p.bar);
    if (!threadRows.has(tk)) threadRows.set(tk, new Set());
    threadRows.get(tk).add(row);
    paintThread(row);
  }
  function updateThread(tk) {
    const set = threadRows.get(tk);
    if (!set) return 0;
    let n = 0;
    for (const row of [...set]) {
      if (row.isConnected === false) {
        set.delete(row);
        continue;
      }
      paintThread(row);
      n += 1;
    }
    if (!set.size) threadRows.delete(tk);
    return n;
  }
  /** A drawn row of a line: its reaction button and chips (once), as they are now; in a conversation with threads, its thread controls. */
  const decorateRow = (node, line, chatId = '') => {
    if (reactUI && line?.rk && !line.note && !line.sep) reactUI.decorate(node, line);
    if (chatId) decorateThread(node, line, chatId);
    return node;
  };

  function addTab(id, opts) {
    const was = tabs.get(id);
    const t = {
      id,
      kind: opts.kind || was?.kind || 'chat',
      label: opts.label ?? was?.label ?? id,
      order: opts.order ?? was?.order ?? ORDER.channel,
      lines: was?.lines || [],
      unread: was?.unread || 0,
      header: opts.header === undefined ? was?.header || null : opts.header,
      prefix: opts.prefix ?? was?.prefix ?? '',
      placeholder: opts.placeholder ?? was?.placeholder ?? '',
      inputLabel: opts.inputLabel ?? was?.inputLabel ?? opts.label ?? was?.label ?? id,
      compose: opts.compose ?? was?.compose ?? true,
      empty: opts.empty ?? was?.empty ?? '',
      icon: opts.icon || was?.icon || 'local',
      /** In the Chats list: its section, the small note by its name, the letter in its circle. */
      section: sectionOf(id, opts.section ?? was?.section),
      note: opts.note ?? was?.note ?? '',
      initial: opts.initial ?? was?.initial ?? '',
      /** A feature has handed it over (Global is in the row before groups-feature joins it). */
      live: opts.live ?? was?.live ?? true,
      since: was?.since || Date.now(),
      /** THREADS: its lines take replies in threads. */
      threads: opts.threads ?? was?.threads ?? false,
    };
    tabs.set(id, t);
    return t;
  }

  addTab('activity', {
    kind: 'activity',
    label: 'Activity',
    order: ORDER.activity,
    icon: 'activity',
    compose: !online,
    inputLabel: 'Local chat',
    empty: 'Pet, gather, make, or explore to begin your afternoon.',
  });
  if (online) {
    addTab('local', { label: 'Local', order: ORDER.local, icon: 'local', inputLabel: 'Local chat', empty: 'Nobody has said anything on this street yet.' });
    // Global Chat is always a tab: groups-feature joins it when it is picked (onTab).
    addTab('global', { label: 'Global Chat', order: ORDER.global, icon: 'channel', live: false, placeholder: 'Chat in Global Chat', inputLabel: 'Global Chat', empty: GLOBAL_WAIT });
    addTab('buddies', { kind: 'buddies', label: 'Buddies', order: ORDER.buddies, icon: 'buddies', compose: false });
    tab = 'local';
  }

  // —— DOM ——
  dock.classList.add('social-drawer');
  dock.dataset.socialMode = online ? 'online' : 'solo';
  dock.setAttribute('aria-label', online ? 'Social' : 'Activity');
  const rail = el('div', { class: 'social-rail', 'data-social-rail': '' });
  const panel = el('div', { id: 'social-body', class: 'social-body', 'data-social-panel': '' });
  const head = el('div', { class: 'social-head' });
  const title = el('h2', { id: 'social-title', class: 'social-title' }, online ? 'Social' : 'Activity');
  const collapseBtn = el('button', { type: 'button', class: 'social-x', 'data-social-collapse': '', 'aria-controls': 'social-body', 'aria-expanded': 'true' });
  collapseBtn.innerHTML = ICONS.collapse;
  head.append(title, collapseBtn);
  const status = el('div', { class: 'social-status', 'data-social-status': '' });
  const presence = el('button', { type: 'button', class: 'social-presence', 'data-social-presence': '' });
  /** The realtime feature's state pill and its Play here button live here. */
  const statusSlot = el('div', { class: 'social-status-slot', 'data-social-status-slot': '' });
  status.append(presence, statusSlot);
  const tablist = el('div', { class: 'social-tabs', role: 'tablist', 'aria-label': 'Chats', 'data-social-tabs': '' });
  const view = el('div', { id: 'social-view', class: 'social-view', role: 'tabpanel', 'data-social-view': '' });
  // A conversation opened from Chats: "‹ Chats", its circle and its name over its lines.
  const convHead = el('div', { class: 'social-conv-head', 'data-social-conv-head': '' });
  const backBtn = el('button', { type: 'button', class: 'social-back', 'data-social-back': '', 'aria-label': 'Back to Chats', title: 'Back to Chats (Esc)' });
  backBtn.innerHTML = ICONS.back;
  backBtn.append(el('span', { class: 'social-back-label' }, 'Chats'));
  const convWho = el('span', { class: 'social-conv-who', 'data-social-conv-who': '' });
  convHead.append(backBtn, convWho);
  convHead.hidden = true;
  const viewHead = el('div', { class: 'social-view-head', 'data-social-view-head': '' });
  // THREADS: the head over a thread open in place: "‹ Back" to its conversation, and "Thread".
  const threadHead = el('div', { class: 'social-thread-head', 'data-social-thread-head': '' });
  const threadBack = el('button', { type: 'button', class: 'social-back social-thread-back', 'data-social-thread-back': '', title: `${THREAD_TEXT.back} (Esc)` });
  threadBack.innerHTML = ICONS.back;
  threadBack.append(el('span', { class: 'social-back-label' }, THREAD_TEXT.back));
  threadHead.append(threadBack, el('span', { class: 'social-thread-title' }, THREAD_TEXT.head));
  const log = el('div', { class: 'social-log', role: 'log', tabindex: '0', 'data-social-log': '' });
  view.append(convHead, viewHead, log);
  const compose = el('div', { class: 'social-compose', 'data-social-compose': '' });
  if (form) compose.append(form);
  if (sendBtn) {
    sendBtn.innerHTML = ICONS.send;
    sendBtn.setAttribute('aria-label', 'Send');
    sendBtn.title = 'Send';
    sendBtn.classList.add('social-send');
  }
  panel.append(head, status, tablist, view, compose);
  dock.prepend(rail, panel);
  if (!online) status.hidden = true;

  // —— State ——
  // `tab` is what the view shows: a fixed tab, CHATS_TAB (the list) or a conversation (in Chats).
  const CHATS_VIEW = Object.freeze({ id: CHATS_TAB, kind: 'chats', label: 'Chats', compose: false, header: null, lines: [] });
  function current() {
    if (tab === CHATS_TAB) return CHATS_VIEW;
    return tabs.get(tab) || tabs.get('activity');
  }

  const isFixed = (id) => FIXED_TABS.includes(id) && tabs.has(id);
  /** A conversation in the Chats list (not a tab of its own). */
  const isConversation = (id) => tabs.has(id) && !FIXED_TABS.includes(id);

  /** The tab selected in the row: Chats while a conversation is open. */
  function rowTab() {
    if (tab === CHATS_TAB || isFixed(tab)) return tab;
    return isConversation(tab) ? CHATS_TAB : 'activity';
  }

  /** The conversation open in Chats, or ''. */
  function openChat() {
    return isConversation(tab) ? tab : '';
  }

  function visible(id) {
    return open && tab === id && !document.hidden;
  }

  function sorted() {
    return [...tabs.values()].sort((a, b) => a.order - b.order || String(a.label).localeCompare(String(b.label)));
  }

  /** The tab row's ids (js: FIXED_TABS then Chats). */
  function row() {
    return tabRow(sorted().map((t) => t.id), { online });
  }

  function conversations() {
    return sorted().filter((t) => !FIXED_TABS.includes(t.id));
  }

  /** The Chats list, sectioned and in order. */
  function listed() {
    return chatSections(conversations().map((t) => ({ id: t.id, label: t.label, section: t.section, unread: t.unread, lastAt: t.lines.at(-1)?.at || t.since, t })));
  }

  function unreadOf(t) {
    if (t.kind === 'activity') return notifier.unread;
    if (t.kind === 'buddies') return addsUnread;
    if (t.kind === 'chats') return conversations().reduce((n, c) => n + c.unread, 0);
    return t.unread;
  }

  function markSeen() {
    const t = current();
    if (!open || document.hidden) return;
    if (t.kind === 'activity') notifier.markRead();
    else if (t.kind === 'buddies') {
      for (const id of buddyData()?.newAdds || []) seenAdds.add(id);
      addsUnread = 0;
    } else if (t.kind === 'chat') t.unread = 0;
  }

  // —— Rendering ——
  function iconButton(attrs, icon, n) {
    const b = el('button', { type: 'button', class: 'social-rail-btn', ...attrs });
    b.innerHTML = ICONS[icon] || ICONS.local;
    if (n) b.append(el('span', { class: 'social-badge', 'aria-hidden': 'true' }, badgeText(n)));
    return b;
  }

  function renderRail() {
    const items = [];
    const expand = iconButton({
      'data-social-expand': '',
      'aria-controls': 'social-body',
      'aria-expanded': 'false',
      'aria-label': online ? 'Open the social drawer' : 'Open the activity log',
      'aria-keyshortcuts': '/',
      title: online ? 'Open social (/)' : 'Open activity (/)',
    }, 'expand', 0);
    // Ticket 37: a click never takes the keyboard; from the keyboard (detail 0) the keys follow.
    expand.addEventListener('click', (e) => setOpen(true, { chosen: true, focus: e.detail === 0 ? 'tab' : null }));
    items.push(expand, el('span', { class: 'social-sep', 'aria-hidden': 'true' }));
    // The same tabs as the row; Chats is one button with the total of its conversations, and it
    // opens the list (the conversation with news is at the top of its section there).
    for (const id of row()) {
      const t = id === CHATS_TAB ? CHATS_VIEW : tabs.get(id);
      const n = unreadOf(t);
      const label = t.label;
      const b = iconButton({
        'data-social-rail-tab': id,
        'aria-label': n ? `${label}, ${n} new` : label,
        title: label,
      }, id === CHATS_TAB ? 'chats' : t.icon, n);
      b.addEventListener('click', (e) => {
        select(id);
        setOpen(true, { chosen: true, focus: e.detail === 0 ? 'log' : null });
      });
      items.push(b);
    }
    if (online) {
      const p = presenceData();
      if (p) {
        items.push(el('span', { class: 'social-sep', 'aria-hidden': 'true' }));
        const who = el('span', { class: 'social-who', title: p.title, 'aria-label': p.title, role: 'img' });
        who.append(el('span', { class: 'social-dot', 'aria-hidden': 'true' }), document.createTextNode(String(p.buddies ?? p.here)));
        items.push(who);
      }
    }
    rail.replaceChildren(...items);
  }

  function renderTabs() {
    const ids = row();
    tablist.hidden = ids.length < 2;
    const sel = rowTab();
    const buttons = ids.map((id) => {
      const chats = id === CHATS_TAB;
      const t = chats ? CHATS_VIEW : tabs.get(id);
      const label = TAB_LABELS[id] || t.label;
      // Chats keeps its total while selected: the list's rows are not read by showing the list.
      const n = chats ? unreadOf(t) : id === sel ? 0 : unreadOf(t);
      const b = el('button', {
        type: 'button',
        role: 'tab',
        id: `social-tab-${id.replace(/[^\w-]/g, '-')}`,
        class: chats ? 'social-tab is-chats' : 'social-tab',
        'aria-selected': String(id === sel),
        'aria-controls': 'social-view',
        tabindex: id === sel ? '0' : '-1',
        'data-social-tab': id,
        'aria-label': n ? `${t.label}, ${n} new` : t.label,
        title: t.label === label ? null : t.label,
      });
      if (chats) {
        const icon = el('span', { class: 'social-tab-icon', 'aria-hidden': 'true' });
        icon.innerHTML = ICONS.chats;
        b.append(icon);
      }
      b.append(el('span', { class: 'social-tab-label' }, label));
      if (n) b.append(el('span', { class: 'social-badge', 'aria-hidden': 'true' }, badgeText(n)));
      // Ticket 37 follow-up: a click picks the chat and leaves the keyboard where it was, so the arrow
      // keys keep walking the avatar (Chrome would otherwise focus the tab, and its arrows would switch chats).
      b.addEventListener('pointerdown', (e) => e.preventDefault?.());
      b.addEventListener('click', () => select(id, { focus: false }));
      return b;
    });
    tablist.replaceChildren(...buttons);
    const selBtn = tablist.querySelector('[aria-selected="true"]');
    if (selBtn) view.setAttribute('aria-labelledby', selBtn.id);
    fitTabs();
  }

  /**
   * The five tabs always fit (no scrolling): when counts would cut a label, the fixed tabs' counts
   * become dots (is-tight), then Chats shows its icon and count without its word (is-tighter). The
   * numbers stay in each tab's name for screen readers, and in the rail.
   */
  function fitTabs() {
    if (tablist.hidden || !(tablist.clientWidth > 0)) return;
    const cut = () => [...tablist.querySelectorAll('.social-tab-label')].some((l) => l.scrollWidth > l.clientWidth + 0.5);
    tablist.classList.toggle('is-tight', false);
    tablist.classList.toggle('is-tighter', false);
    if (!cut()) return;
    tablist.classList.add('is-tight');
    if (cut()) tablist.classList.add('is-tighter');
  }

  /** A conversation's round avatar: its letter (or the one it was given) in its colour. */
  function chatAvatar(t, cls = 'social-chat-av') {
    const a = avatarOf(t.label);
    return el('span', { class: `social-av ${cls}`, 'data-hue': String(a.hue), 'aria-hidden': 'true' }, t.initial || a.initial);
  }

  /** The note by a row's name: the feature's (Buddy, 3 members, Butler), channels "Everyone". */
  function noteOf(t) {
    return t.note || (t.section === 'channels' ? 'Everyone' : '');
  }

  function renderChats() {
    const secs = listed();
    if (!secs.length) return [el('p', { class: 'social-empty', 'data-social-chats-empty': '' }, CHATS_EMPTY)];
    const out = [];
    for (const sec of secs) {
      const box = el('div', { class: 'social-chat-sec', role: 'group', 'aria-labelledby': `social-chat-sec-${sec.id}`, 'data-social-chat-section': sec.id });
      box.append(el('h3', { id: `social-chat-sec-${sec.id}`, class: 'social-chat-sec-title' }, sec.title));
      for (const r of sec.rows) {
        const t = r.t;
        const n = t.unread;
        const note = noteOf(t);
        const last = lastLineText(t.lines, { label: t.label, section: t.section });
        const b = el('button', {
          type: 'button',
          class: `social-chat-row${n ? ' is-unread' : ''}`,
          'data-social-chat': t.id,
          'data-section': t.section,
          // RIGHTCLICK: its menu (Open, the conversation's head buttons).
          'data-ctx': 'chat',
          'aria-haspopup': 'menu',
          'aria-keyshortcuts': 'Shift+F10',
          'aria-label': `${[t.label, note, n ? `${n} new` : '', last].filter(Boolean).join(', ')}. ${MORE_KEYS_LABEL}`,
        });
        const txt = el('span', { class: 'social-chat-txt' });
        const name = el('span', { class: 'social-chat-name' });
        name.append(el('span', { class: 'social-chat-label' }, t.label));
        if (note) name.append(el('small', { class: 'social-chat-note' }, note));
        txt.append(name, el('span', { class: `social-chat-last${last ? '' : ' is-empty'}` }, last || t.empty || 'Nothing said yet.'));
        b.append(chatAvatar(t), txt);
        if (n) b.append(el('span', { class: 'social-badge', 'aria-hidden': 'true' }, badgeText(n)));
        // As the tabs: a click opens it without taking the keyboard (Enter on a focused row moves it in).
        b.addEventListener('pointerdown', (e) => e.preventDefault?.());
        b.addEventListener('click', () => {
          const keyed = document.activeElement === b;
          select(t.id);
          if (keyed) (current().compose && !compose.hidden ? input : log)?.focus?.({ preventScroll: true });
        });
        box.append(b);
      }
      out.push(box);
    }
    return out;
  }

  /** The bar over a conversation opened from Chats. */
  function renderConvHead(t) {
    const conv = isConversation(t.id);
    convHead.hidden = !conv;
    if (!conv) return;
    const name = el('span', { class: 'social-conv-name' }, t.label);
    convWho.replaceChildren(chatAvatar(t, 'social-conv-av'), name);
    convHead.dataset.socialConvHead = t.id;
  }

  /** RIGHTCLICK: the drawer's own menus (a player's, a Chats row's) close with the drawer or the tab. */
  let drawerMenu = '';
  function closeDrawerMenu() {
    if (!drawerMenu) return;
    const m = contextMenu?.();
    if (m?.isOpenFor?.(drawerMenu)) m.close({ focus: false });
    drawerMenu = '';
  }

  /**
   * Another player's menu from a name or a row: at the pointer for a click, beside `from` for the
   * keys; `find` gives the name or row as drawn now (the log redraws under it).
   */
  function openPlayer(id, name, from, { at = null, keys = false, find = null, ...more } = {}) {
    if (!playerMenu) return false;
    const opened = playerMenu({ id, name, at, keys, anchor: from, opener: from, findOpener: find, ...more });
    if (opened) drawerMenu = `player:${Number(id) || 0}`;
    return opened;
  }

  /** line -> its name button as last drawn (a keyboard-opened menu gives focus back to it). */
  const nameButtons = new WeakMap();

  /** A speaker's name as a button: a click, a right-click, Enter or Shift+F10 opens their menu. */
  function nameButton(line) {
    const id = Number(line.playerId) || 0;
    const name = line.name || 'Someone';
    const b = el('button', {
      type: 'button',
      class: 'social-name',
      'data-ctx': 'player',
      'data-player-id': String(id),
      'data-social-name': `${line.at}:${id}`,
      'aria-haspopup': 'menu',
      'aria-keyshortcuts': 'Shift+F10',
    }, name);
    nameButtons.set(line, b);
    const find = () => {
      const now = nameButtons.get(line);
      return now?.isConnected ? now : null;
    };
    // As the tabs: a click opens it without taking the keyboard from the world.
    b.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && !e.ctrlKey) e.preventDefault?.();
    });
    b.addEventListener('click', (e) => {
      const keys = e.detail === 0;
      openPlayer(id, name, b, { at: keys ? null : { x: e.clientX, y: e.clientY }, keys, find });
    });
    bindContextTrigger(b, {
      // A name inside selected text keeps the browser's menu (its Copy).
      rowOf: (t) => (selectionCovers(document.getSelection?.() || null, t) ? null : b),
      isOpenFor: () => Boolean(contextMenu?.()?.isOpenFor?.(`player:${id}`)),
      open: (_, { at, keys }) => openPlayer(id, name, b, { at, keys, find }),
    });
    return b;
  }

  function lineNode(line) {
    if (line.sep) return el('div', { class: 'social-time', 'data-social-time': '' }, line.sep);
    if (line.note) return el('p', { class: 'social-msg is-note' }, line.text);
    const p = el('p', { class: `social-msg${line.mine ? ' is-mine' : ''}${line.feat ? ' is-feat' : ''}` });
    const who = el('b', {});
    if (online && playerMenu && !line.mine && line.playerId > 0) who.append(nameButton(line));
    else who.textContent = line.mine ? 'You' : line.name || 'Someone';
    p.append(who, document.createTextNode(' '));
    // LINKS (js/chat-links.js): the addresses in what was said are links (text nodes only).
    appendLinkedText(p, String(line.text ?? ''), { doc: document });
    return p;
  }

  // —— Rows kept between redraws (js/ui/keyed-nodes.js): a selection in the log survives a redraw ——
  /** name -> the rows drawn into one container ('log': this drawer's own log). */
  const caches = new Map();
  function cacheFor(name) {
    let c = caches.get(name);
    if (!c) caches.set(name, (c = createNodeCache()));
    return c;
  }
  const lineKey = (id, l) => JSON.stringify(['l', id, l.at, l.playerId, l.mine, l.feat, l.note, l.name, l.text]);
  const entryKey = (e) => JSON.stringify(['a', e.id ?? 0, e.kind, e.text, e.html || '', e.count || 1, e.at]);

  /**
   * The rows for `items` (oldest first) with their time lines, each row the one made before for the
   * same key (`keyOf`), else `make(item)`; the cache forgets the rest.
   */
  function keyedRows(items, { atOf, keyOf, make, cache, after = null }) {
    const keys = uniqueKeys(items, keyOf);
    const nodes = [];
    let i = 0;
    let sep = null;
    for (const x of withTimeLines(items, atOf)) {
      if (x && x.sep !== undefined && Object.keys(x).length === 1) {
        sep = x.sep;
        continue;
      }
      const key = keys[i++];
      if (sep !== null) {
        const label = sep;
        nodes.push(cache.get(`sep|${label}|${key}`, () => lineNode({ sep: label })));
        sep = null;
      }
      const node = cache.get(key, () => make(x));
      nodes.push(after ? after(node, x) : node);
    }
    cache.sweep();
    return nodes;
  }

  /** A skin's own log for a tab (the Classic skin's Local Chat / Activity), or null for the drawer's. */
  let logSource = null;

  function activityNode(e) {
    if (e.sep) return lineNode(e);
    if (e.kind === 'chat') {
      const said = splitChat(e.text);
      if (said) return lineNode({ name: said.name, text: said.text });
      return el('p', { class: 'social-msg' }, e.text);
    }
    const row = el('div', { class: 'social-act', 'data-kind': e.kind });
    const body = el('div', { class: 'social-act-text' });
    body.innerHTML = e.html || colorizeAmounts(e.text);
    // LINKS: an entry that repeats what someone said (an IM's notice) keeps its addresses as links.
    linkifyTextNodes(body, { doc: document });
    const meta = el('div', { class: 'social-act-when' });
    meta.append(el('time', {}, clockLabel(e.at)));
    if (e.count > 1) meta.append(el('span', { class: 'social-count' }, `×${e.count}`));
    row.append(body, meta);
    return row;
  }

  function buddyData() {
    try {
      return globalThis.groddleBuddies?.drawerView?.() || null;
    } catch {
      return null;
    }
  }

  function presenceData() {
    const rt = globalThis.groddleRealtime;
    const state = rt?.client?.state;
    if (!rt || state !== 'online') return null;
    const here = Math.max(0, (Number(rt.client.here) || 1) - 1);
    const b = buddyData();
    const on = b ? b.rows.filter((r) => r.online) : null;
    const names = on?.length ? on.map((r) => r.name) : (rt.client.players || []).map((p) => p.name);
    const buddies = on ? on.length : null;
    const parts = [];
    if (buddies !== null) parts.push(`${buddies} ${buddies === 1 ? 'buddy' : 'buddies'} online`);
    parts.push(`${here} here`);
    // Who's around (features/presence-mp-feature.js): everyone online you would see on the website's panel.
    if (onlineCount !== null) parts.push(`${onlineCount} online`);
    return { buddies, here, names, label: parts.join(' · '), title: parts.join(', ') };
  }

  function renderStatus() {
    if (!online) return;
    const p = presenceData();
    presence.hidden = !p;
    if (!p) return;
    const avs = el('span', { class: 'social-avs', 'aria-hidden': 'true' });
    for (const name of p.names.slice(0, 4)) {
      const a = avatarOf(name);
      avs.append(el('span', { class: 'social-av', 'data-hue': String(a.hue) }, a.initial));
    }
    const chev = el('span', { class: 'social-chev', 'aria-hidden': 'true' });
    chev.innerHTML = ICONS.chev;
    presence.replaceChildren(...(p.names.length ? [avs] : []), el('span', { class: 'social-presence-label' }, p.label), chev);
    presence.setAttribute('aria-label', `${p.title}. Show buddies`);
  }

  function renderBuddies() {
    const data = buddyData();
    const out = [];
    if (!data) {
      out.push(el('p', { class: 'social-empty' }, 'Loading your buddies…'));
      return out;
    }
    if (!data.rows.length) out.push(el('p', { class: 'social-empty' }, data.empty || 'No buddies yet.'));
    const list = el('ul', { class: 'social-buddies', 'data-social-buddies': '' });
    for (const r of data.rows) {
      // RIGHTCLICK: the row opens the buddy's menu (a click, a right-click, a long press; Enter or
      // Shift+F10 on the name), as Glitch's contact rows did (ContactElement.as 267-271); the chips act.
      const li = el('li', { 'data-social-buddy': String(r.id), 'data-online': String(Boolean(r.online)), 'data-ctx': playerMenu ? 'player' : false, 'data-name': r.name });
      const a = avatarOf(r.name);
      const av = el('span', { class: 'social-av', 'data-hue': String(a.hue), 'aria-hidden': 'true' }, a.initial);
      if (r.online) av.append(el('span', { class: 'social-dot' }));
      const what = playerMenu
        ? el('button', { type: 'button', class: 'social-buddy-what', 'data-social-buddy-who': String(r.id), 'aria-haspopup': 'menu', 'aria-keyshortcuts': 'Shift+F10' })
        : el('span', { class: 'social-buddy-what' });
      what.append(el('span', { class: 'social-buddy-name' }, r.name), el('small', {}, r.where));
      li.append(av, what);
      for (const act of r.actions || []) {
        const b = el('button', { type: 'button', class: 'social-chip', 'aria-label': `${act.label} ${r.name}` }, act.label);
        b.addEventListener('click', act.run);
        li.append(b);
      }
      list.append(li);
    }
    if (data.rows.length) out.push(list);
    if (data.addedYou?.length) out.push(el('p', { class: 'social-note' }, `Added you: ${data.addedYou.join(', ')}`));
    if (data.manage) {
      const b = el('button', { type: 'button', class: 'social-chip social-manage', 'data-social-manage-buddies': '' }, 'Manage buddies');
      b.addEventListener('click', data.manage);
      out.push(b);
    }
    return out;
  }

  /** THREADS: the rows of a thread open in place: its line, then its replies (or why there are none). */
  function threadNodes(t, th) {
    const st = storeOf(th.tk);
    const parent = t.lines.find((l) => l.rk === th.tk) || st.parent;
    const cache = cacheFor('thread');
    const nodes = [];
    if (parent) {
      const node = cache.get(`parent|${lineKey(t.id, parent)}`, () => {
        const n = lineNode(parent);
        n.classList.add('is-thread-parent');
        return n;
      });
      nodes.push(decorateRow(node, parent));
    }
    const count = st.replies.length;
    nodes.push(cache.get(`count|${count}|${st.loading}`, () => el('div', { class: 'social-time social-thread-count', 'data-social-thread-count': String(count) }, count ? THREAD_TEXT.count(count) : st.loading ? THREAD_TEXT.loading : THREAD_TEXT.empty)));
    for (const r of st.replies) nodes.push(decorateRow(cache.get(`reply|${lineKey(t.id, r)}|${r.rk}`, () => lineNode(r)), r));
    if (st.note) nodes.push(cache.get(`note|${st.note}`, () => lineNode({ note: true, text: st.note })));
    cache.sweep();
    return nodes;
  }

  function renderView() {
    const t = current();
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
    renderConvHead(t);
    const th = thread && thread.chat === t.id ? thread : null;
    const headNode = th ? threadHead : t.header;
    if (th) threadBack.setAttribute('aria-label', THREAD_TEXT.backLabel(t.label));
    // The same head stays put (moving it would drop the keyboard from a button in it).
    if (viewHead.firstChild !== headNode || viewHead.childNodes?.length > 1) viewHead.replaceChildren(...(headNode ? [headNode] : []));
    viewHead.hidden = !headNode;
    let nodes;
    const own = th ? null : logSource?.(t.id) || null;
    if (th) {
      nodes = threadNodes(t, th);
      log.setAttribute('aria-live', 'polite');
    } else if (own) {
      nodes = own;
      log.setAttribute('aria-live', 'polite');
    } else if (t.kind === 'activity') {
      const entries = notifier.entries;
      nodes = entries.length
        ? keyedRows(entries, { atOf: (e) => e.at, keyOf: entryKey, make: activityNode, cache: cacheFor('log') })
        : [el('p', { class: 'social-empty' }, t.empty)];
      log.setAttribute('aria-live', 'off');
    } else if (t.kind === 'buddies') {
      nodes = renderBuddies();
      log.setAttribute('aria-live', 'off');
    } else if (t.kind === 'chats') {
      nodes = renderChats();
      log.setAttribute('aria-live', 'off');
    } else {
      nodes = t.lines.length
        ? keyedRows(t.lines, { atOf: (l) => l.at, keyOf: (l) => lineKey(t.id, l), make: lineNode, cache: cacheFor('log'), after: (node, l) => decorateRow(node, l, t.id) })
        : t.empty ? [el('p', { class: 'social-empty' }, t.empty)] : [];
      log.setAttribute('aria-live', 'polite');
    }
    // Only the rows that changed are touched: a selection in the others stays (Cmd+C copies it).
    reconcileChildren(log, nodes);
    log.setAttribute('aria-label', th ? `${THREAD_TEXT.head} in ${t.label}` : t.kind === 'activity' ? 'Activity log' : t.kind === 'buddies' ? 'Buddies' : t.kind === 'chats' ? 'Chats' : `${t.label} chat`);
    log.setAttribute('role', t.kind === 'chats' ? 'region' : 'log');
    // The list's rows take the keyboard themselves: Tab from the row of tabs lands on the first.
    log.setAttribute('tabindex', t.kind === 'chats' ? '-1' : '0');
    log.dataset.socialLog = t.id;
    if (th) log.dataset.socialThread = th.tk;
    else delete log.dataset.socialThread;
    if (t.kind === 'chats') log.dataset.socialList = '1';
    else delete log.dataset.socialList;
    if (atEnd || log.dataset.jump) log.scrollTop = log.scrollHeight;
    delete log.dataset.jump;
    // The input under the log: what it says and where your words go.
    // Global waits for groups-feature to join it: a line typed before then would go to Local.
    const showCompose = Boolean(form) && t.compose && t.live !== false;
    compose.hidden = !showCompose;
    if (input && showCompose) {
      const street = streetName();
      const hint = th ? THREAD_TEXT.placeholder : t.placeholder || (isConversation(t.id) ? `Message ${t.label}` : street ? `Say something on ${street}` : 'Say something');
      if (input.placeholder !== hint) input.placeholder = hint;
      if (inputLabel) inputLabel.textContent = th ? THREAD_TEXT.inputLabel : t.inputLabel || t.label;
    }
    compose.dataset.socialThread = th ? th.tk : '';
  }

  function publish() {
    dock.dataset.socialOpen = open ? 'open' : 'rail';
    setData('socialOpen', open ? 'open' : 'rail');
    setData('socialTab', rowTab());
    setData('socialChat', openChat());
    setData('socialThread', thread ? `${thread.chat}|${thread.tk}` : '');
    setData('socialThreadReplies', thread ? String(storeOf(thread.tk).replies.length) : '');
    setData('socialTabs', row().join(','));
    setData('socialChats', listed().flatMap((sec) => sec.rows.map((r) => r.id)).join(','));
    const counts = sorted().map((t) => [t.id, unreadOf(t)]);
    if (row().includes(CHATS_TAB)) counts.push([CHATS_TAB, unreadOf(CHATS_VIEW)]);
    setData('socialUnread', counts.filter(([, n]) => n).map(([id, n]) => `${id}:${n}`).join(','));
  }

  /** A selector for the drawer control that has the keyboard, so a redraw can give it back. */
  function focusSelector(node) {
    if (!node || node === input || node === document.body || !dock.contains?.(node)) return null;
    const esc = (v) => (globalThis.CSS?.escape ? CSS.escape(v) : String(v).replace(/"/g, '\\"'));
    for (const a of ['data-social-rail-tab', 'data-social-tab', 'data-social-chat', 'data-social-buddy-who', 'data-social-buddy', 'data-social-name']) {
      const v = node.getAttribute?.(a);
      if (v !== null && v !== undefined) return `[${a}="${esc(v)}"]`;
    }
    for (const a of ['data-thread-open', 'data-thread-reply']) {
      const v = node.getAttribute?.(a);
      if (v !== null && v !== undefined) return `[${a}="${esc(v)}"]`;
    }
    for (const a of ['data-social-expand', 'data-social-collapse', 'data-social-presence', 'data-social-manage-buddies', 'data-social-back', 'data-social-thread-back']) if (node.getAttribute?.(a) !== null) return `[${a}]`;
    const label = node.getAttribute?.('aria-label');
    return label ? `[aria-label="${esc(label)}"]` : null;
  }

  /** Runs a redraw; if it replaced the focused button, the keyboard goes back to its new copy. */
  function keepingFocus(draw) {
    const keep = focusSelector(document.activeElement);
    draw();
    if (keep && !dock.contains?.(document.activeElement)) dock.querySelector(keep)?.focus?.({ preventScroll: true });
  }

  function render() {
    keepingFocus(renderNow);
    rendered();
  }

  function renderNow() {
    markSeen();
    queueMicrotask?.(() => syncInset());
    dock.classList.toggle('is-open', open);
    rail.hidden = open;
    panel.hidden = !open;
    if (open) {
      renderStatus();
      renderTabs();
      renderView();
    }
    renderRail();
    publish();
  }

  // —— Actions ——
  function setOpen(next, { chosen = false, focus = null } = {}) {
    next = Boolean(next);
    if (chosen) {
      choice = next;
      writeChoice(storage, next);
    }
    if (next !== open) {
      open = next;
      if (open) log.dataset.jump = '1';
      else {
        closeDrawerMenu();
        reactUI?.closePicker();
      }
    }
    render();
    if (focus === 'tab') tablist.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true }) || log.focus({ preventScroll: true });
    else if (focus === 'log') log.focus({ preventScroll: true });
    else if (focus === 'rail') rail.querySelector('[data-social-expand]')?.focus({ preventScroll: true });
    else if (focus === 'input') input?.focus({ preventScroll: true });
  }

  /**
   * Brings a tab or a conversation to the front: a fixed tab, CHATS_TAB (the list), or any other
   * conversation, which opens in Chats. `focus` puts the keyboard on the row's tab.
   */
  function select(id, { focus = false } = {}) {
    if (id === CHATS_TAB ? !row().includes(CHATS_TAB) : !tabs.has(id)) return false;
    const changed = id !== tab;
    if (changed) {
      closeDrawerMenu();
      reactUI?.closePicker();
      thread = null;
    }
    tab = id;
    log.dataset.jump = '1';
    render();
    if (focus) tablist.querySelector(`[data-social-tab="${CSS.escape(rowTab())}"]`)?.focus({ preventScroll: true });
    if (changed) for (const fn of listeners) {
      try {
        fn(id);
      } catch (e) {
        console.warn('social', e);
      }
    }
    return true;
  }

  function trim(lines) {
    while (lines.length > LINE_LIMIT) lines.shift();
  }

  function normal(line) {
    const playerId = Number(line.playerId);
    return {
      name: String(line.name || ''),
      text: String(line.text || ''),
      note: Boolean(line.note),
      mine: Boolean(line.mine),
      feat: Boolean(line.feat),
      at: Number(line.at) || Date.now(),
      // RIGHTCLICK: who said it (their name opens their menu); 0 for a line no player said.
      playerId: Number.isFinite(playerId) && playerId > 0 ? Math.floor(playerId) : 0,
      // THREADS: a reply in a thread (it takes reactions, never a thread of its own).
      reply: Boolean(line.reply),
      // REACTIONS: the line's reaction key ('' for a line nobody can react to).
      rk: line.note ? '' : String(line.rk || ''),
    };
  }

  // —— Wiring ——
  collapseBtn.setAttribute('aria-label', online ? 'Collapse the social drawer' : 'Collapse the activity log');
  collapseBtn.title = 'Collapse';
  collapseBtn.addEventListener('click', (e) => setOpen(false, { chosen: true, focus: e.detail === 0 ? 'rail' : null }));
  presence.addEventListener('click', () => select('buddies', { focus: true }));

  /** Back from a conversation to the Chats list; `focus` puts the keyboard on its row there. */
  function back({ focus = false } = {}) {
    const from = openChat();
    if (!from) return false;
    select(CHATS_TAB);
    if (focus) (log.querySelector(`[data-social-chat="${CSS.escape(from)}"]`) || log.querySelector('[data-social-chat]') || log)?.focus?.({ preventScroll: true });
    return true;
  }
  /** THREADS: opens a line's thread in place of its conversation; `focus` puts the keyboard in the input. */
  function openThread(chatId, tk, { focus = false, parent = null } = {}) {
    const t = tabs.get(chatId);
    if (!online || !t || !t.threads || !threader || !tk) return false;
    if (tab !== chatId) select(chatId);
    const st = storeOf(tk);
    if (parent) st.parent = normal(parent);
    else if (!st.parent) st.parent = t.lines.find((l) => l.rk === tk) || null;
    st.note = '';
    st.loading = !st.loaded;
    thread = { chat: chatId, tk };
    closeDrawerMenu();
    reactUI?.closePicker();
    log.dataset.jump = '1';
    render();
    try {
      threader.load?.(chatId, tk);
    } catch (e) {
      console.warn('social', e);
    }
    if (focus) input?.focus?.({ preventScroll: true });
    return true;
  }
  /** Back from a thread to its conversation; `focus` puts the keyboard on the line's thread button. */
  function closeThread({ focus = false } = {}) {
    if (!thread) return false;
    const { tk } = thread;
    thread = null;
    log.dataset.jump = '1';
    render();
    if (focus) {
      const bar = log.querySelector(`[data-thread-open="${CSS.escape(tk)}"]`);
      (bar && !bar.hidden ? bar : log.querySelector(`[data-thread-reply="${CSS.escape(tk)}"]`) || log)?.focus?.({ preventScroll: true });
    }
    return true;
  }
  threadBack.addEventListener('pointerdown', (e) => e.preventDefault?.());
  threadBack.addEventListener('click', () => closeThread({ focus: document.activeElement === threadBack }));
  backBtn.addEventListener('pointerdown', (e) => e.preventDefault?.());
  backBtn.addEventListener('click', () => back({ focus: document.activeElement === backBtn }));

  // The Chats list: Up and Down (Home, End) move between its rows; Enter opens one (a button).
  log.addEventListener('keydown', (e) => {
    if (current().kind !== 'chats' || e.target?.getAttribute?.('data-social-chat') == null) return;
    const rows = log.querySelectorAll('[data-social-chat]');
    const i = rows.indexOf ? rows.indexOf(e.target) : [...rows].indexOf(e.target);
    let to = -1;
    if (e.key === 'ArrowDown') to = Math.min(rows.length - 1, i + 1);
    else if (e.key === 'ArrowUp') to = Math.max(0, i - 1);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = rows.length - 1;
    if (to < 0) return;
    e.preventDefault();
    rows[to]?.focus?.({ preventScroll: false });
  });

  // RIGHTCLICK: a buddy row's menu (the Buddies tab): a click on the row (not on a chip), a
  // right-click anywhere on it, a long press on touch, Enter or Shift+F10 on its name.
  const buddyRow = (t) => {
    if (!playerMenu || current().kind !== 'buddies') return null;
    const li = t?.closest?.('[data-social-buddy]');
    return li && log.contains(li) ? li : null;
  };
  const openBuddy = (li, { at = null, keys = false } = {}) => {
    const id = Number(li.getAttribute('data-social-buddy')) || 0;
    const who = li.querySelector('[data-social-buddy-who]');
    return openPlayer(id, li.getAttribute('data-name') || '', li, {
      at,
      keys,
      opener: who || li,
      find: () => log.querySelector(`[data-social-buddy-who="${CSS.escape(String(id))}"]`),
    });
  };
  // Selecting words in the log (or clicking them) leaves the arrow keys with the avatar; the selection stays.
  pressLeavesKeys(log, { doc: document });
  log.addEventListener('pointerdown', (e) => {
    // As the tabs: a press on the row does not take the keyboard (the chips are their own).
    if (buddyRow(e.target) && !e.target?.closest?.('.social-chip') && e.button === 0 && !e.ctrlKey) e.preventDefault?.();
  });
  log.addEventListener('click', (e) => {
    const li = buddyRow(e.target);
    if (!li || e.target?.closest?.('.social-chip')) return;
    const keys = e.detail === 0;
    openBuddy(li, { at: keys ? null : { x: e.clientX, y: e.clientY }, keys });
  });
  bindContextTrigger(log, {
    rowOf: buddyRow,
    isOpenFor: (li) => Boolean(contextMenu?.()?.isOpenFor?.(`player:${Number(li.getAttribute('data-social-buddy')) || 0}`)),
    open: (li, { at, keys }) => openBuddy(li, { at, keys }),
    longPress: true,
  });

  // RIGHTCLICK: a Chats row's menu (right-click, long press, Shift+F10 or the Menu key on it).
  const chatRow = (t) => {
    if (current().kind !== 'chats') return null;
    const b = t?.closest?.('[data-social-chat]');
    return b && log.contains(b) && tabs.has(b.getAttribute('data-social-chat')) ? b : null;
  };
  /** The head buttons a conversation shows over its lines, as rows (each presses its button). */
  const HEAD_ACTIONS = ['[data-groups-who]', '[data-groups-close-chat]', '[data-party-leave]', '[data-im-close]'];
  function headRows(t) {
    const out = [];
    for (const sel of HEAD_ACTIONS) {
      const btn = t.header?.querySelector?.(sel);
      if (!btn || btn.hidden || btn.disabled) continue;
      const label = String(btn.textContent || '').trim();
      if (!label) continue;
      const who = sel === '[data-groups-who]';
      out.push({
        id: sel.slice(1, -1),
        label,
        tip: btn.title || btn.getAttribute('aria-label') || '',
        focusBack: false,
        // Who is here answers in the conversation: open it first, so the answer shows.
        run: () => {
          if (who) select(t.id);
          btn.click();
        },
      });
    }
    return out;
  }
  function openChatMenu(row, { at = null, keys = false } = {}) {
    const id = row.getAttribute('data-social-chat');
    const t = tabs.get(id);
    if (!t) return false;
    const find = () => log.querySelector(`[data-social-chat="${CSS.escape(id)}"]`);
    const openRow = {
      id: 'open',
      label: 'Open',
      tip: `Shows ${t.label} here.`,
      focusBack: false,
      run: () => {
        select(id);
        // Opened from the keys, the keys go in as Enter on the row sends them.
        if (keys) (current().compose && !compose.hidden ? input : log)?.focus?.({ preventScroll: true });
      },
    };
    const im = /^im:(\d+)$/.exec(id);
    if (im && playerMenu) {
      return openPlayer(Number(im[1]), t.label, row, { at, keys, find, before: [openRow], after: headRows(t), omit: [IM_VERB_ID] });
    }
    const menu = contextMenu?.();
    if (!menu) return false;
    const opened = menu.open({
      title: t.label,
      rows: [openRow, ...headRows(t)],
      at,
      anchor: row,
      keys,
      opener: row,
      findOpener: find,
      owner: `chat:${id}`,
      onPick: (rowId, { row: picked }) => picked?.run?.(),
    });
    if (opened) drawerMenu = `chat:${id}`;
    return opened;
  }
  bindContextTrigger(log, {
    rowOf: chatRow,
    isOpenFor: (row) => {
      const id = row.getAttribute('data-social-chat');
      const im = /^im:(\d+)$/.exec(id);
      return Boolean(contextMenu?.()?.isOpenFor?.(im ? `player:${im[1]}` : `chat:${id}`));
    },
    open: (row, { at, keys }) => openChatMenu(row, { at, keys }),
    longPress: true,
  });

  // Tabs: arrow keys move along the row (the ARIA tabs pattern), Home and End to the ends, only
  // while a tab has the keyboard (Tab or Shift+Tab to it; a click does not take it), and the row
  // shows a ring meanwhile. Escape hands the keys back to the game, as the client's Tab cycle let go
  // of a chat (RightSideView.as focusCycle 134-168); its arrow keys were the avatar's otherwise.
  tablist.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.target?.blur?.();
      return;
    }
    const all = row();
    const i = all.indexOf(rowTab());
    let to = -1;
    if (e.key === 'ArrowRight') to = (i + 1) % all.length;
    else if (e.key === 'ArrowLeft') to = (i - 1 + all.length) % all.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = all.length - 1;
    if (to < 0) return;
    e.preventDefault();
    // Onto Chats from another tab: the list (a conversation you left open there is a click away).
    select(all[to], { focus: true });
  });

  // Keys pressed in the drawer stay in it (a focused tab or button never walks the avatar),
  // except Escape, which the game's own handlers see: in a conversation opened from Chats,
  // Escape first goes back to the list (the keyboard on its row), and from there gives the keys back.
  dock.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (tablist.contains?.(e.target)) return;
      if (thread && panel.contains?.(e.target)) {
        e.preventDefault?.();
        e.stopPropagation();
        closeThread({ focus: true });
        return;
      }
      if (openChat() && panel.contains?.(e.target)) {
        e.preventDefault?.();
        e.stopPropagation();
        back({ focus: true });
        return;
      }
      if (e.target?.getAttribute?.('data-social-chat') != null) e.target.blur?.();
      return;
    }
    if (e.key === '/' && !e.target?.matches?.('input, textarea, select, [contenteditable="true"]')) {
      e.preventDefault();
      focusInput();
    }
    e.stopPropagation();
  });

  // The box wraps and grows up to five lines (js/ui/chat-input.js); Enter sends. Up and Down walk
  // back through what you said from its first or last line.
  if (input) {
    bindChatInput(input, {
      form,
      onHistory(key) {
        if (key === 'ArrowUp') {
          const prev = history.up();
          if (prev === null) return false;
          input.value = prev;
          requestAnimationFrame?.(() => input.setSelectionRange?.(input.value.length, input.value.length));
          return true;
        }
        const next = history.down();
        if (next === null) return false;
        input.value = next;
        return true;
      },
    });
  }
  // Before every other submit handler (they listen on the form or on this dock later):
  // keep the line for Up, and send a Party tab's line to the party (/p, party-feature).
  dock.addEventListener('submit', (e) => {
    if (e.target !== form || !input) return;
    const text = String(input.value || '');
    history.push(text);
    // THREADS: a thread open in place: the words are a reply there (slash commands stay the game's).
    if (thread && threader && thread.chat === tab && text.trim() && !text.trim().startsWith('/')) {
      e.preventDefault?.();
      e.stopImmediatePropagation?.();
      e.stopPropagation?.();
      input.value = '';
      const { chat, tk } = thread;
      let sent = false;
      try {
        sent = Boolean(threader.send(chat, tk, text));
      } catch (err) {
        console.warn('social', err);
      }
      if (!sent) {
        storeOf(tk).note = THREAD_TEXT.offline;
        render();
      }
      return;
    }
    const t = current();
    if (t.prefix && text.trim() && !text.trim().startsWith('/')) input.value = `${t.prefix}${text.trim()}`;
  }, true);

  /** Shows the input (a tab that has one, the drawer open), for whatever is about to type in it. */
  function revealInput({ chosen = false } = {}) {
    if (!form) return false;
    if (online && (!current().compose || current().live === false)) select(tabs.has('local') ? 'local' : 'activity');
    if (!open) setOpen(true, { chosen });
    return true;
  }

  /** "/": open the drawer and put the keyboard in the input. */
  function focusInput() {
    if (!form || !canChat()) return false;
    revealInput({ chosen: true });
    input?.focus({ preventScroll: true });
    return true;
  }

  globalThis.addEventListener?.('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    if (e.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    if (!focusInput()) return;
    e.preventDefault();
  });

  // Until the player chooses, the window's width decides.
  globalThis.addEventListener?.('resize', () => {
    if (choice !== null) return;
    const want = defaultOpen(width());
    if (want !== open) setOpen(want);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });

  // Under the top bar: wherever it ends (a bar over the world or above it).
  let laidAt = -Infinity;
  function layout(force = false) {
    const t = performance.now();
    if (!force && t - laidAt < 500) return;
    laidAt = t;
    const bar = document.querySelector('.top-bar');
    const rr = root.getBoundingClientRect();
    const br = bar?.getBoundingClientRect();
    const top = Math.max(8, br && br.height ? Math.round(br.bottom - rr.top + 6) : 8);
    const v = `${top}px`;
    if (root.style.getPropertyValue('--social-top') !== v) root.style.setProperty('--social-top', v);
    syncInset();
  }

  /**
   * --inset-r on the root: the width the drawer takes on the right plus its gap (316 px open,
   * 60 px as the rail, 0 hidden), so things that centre in the free width (the one-row pack, as
   * in the mock) keep clear of it. The token block defaults it (and --inset-l) to 0.
   */
  function insetNow() {
    if (typeof dock.checkVisibility === 'function' && !dock.checkVisibility({ visibilityProperty: true })) return { left: 0, right: 0 };
    const r = dock.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    // Only a drawer on the right edge (a skin's stylesheet that has not loaded leaves it elsewhere),
    // and not one beside the world (the Classic skin's chat column, css/classic.css).
    if (!r.width || !r.height || r.left < rr.left + rr.width / 2 || r.left >= rr.right - 1) return { left: 0, right: 0 };
    // The width it is going to (not one caught halfway through the open or close transition).
    let w = r.width;
    try {
      const css = parseFloat(getComputedStyle(dock).getPropertyValue(open ? '--drawer-w' : '--rail-w'));
      w = css > 0 ? css : open ? 300 : 44;
    } catch {
      /* no computed style (tests): the measured width */
    }
    return { left: 0, right: Math.max(0, Math.round(rr.right - r.right + w + 8)) };
  }

  function syncInset() {
    const v = `${insetNow().right}px`;
    if (root.style.getPropertyValue('--inset-r') !== v) root.style.setProperty('--inset-r', v);
  }
  layout(true);
  globalThis.addEventListener?.('resize', () => layout(true));
  // The row's width changes as the drawer opens (it grows from the rail): fit the tabs again then.
  if (typeof globalThis.ResizeObserver === 'function') {
    let lastW = -1;
    new globalThis.ResizeObserver(() => {
      const w = tablist.clientWidth || 0;
      if (w === lastW) return;
      lastW = w;
      fitTabs();
    }).observe(tablist);
  }
  // STARTCARD: the loading card hides the drawer (body.is-booting, visibility), so the inset measured
  // under it is 0; measure again once the game is uncovered, so the start card and the pack centre
  // clear of a drawer that opens with the window.
  const body = document.body;
  if (body?.classList?.contains('is-booting') && typeof MutationObserver === 'function') {
    const uncovered = new MutationObserver(() => {
      if (body.classList.contains('is-booting')) return;
      uncovered.disconnect();
      syncInset();
    });
    uncovered.observe(body, { attributes: true, attributeFilter: ['class'] });
  }

  // The street's name in the input's hint follows the street.
  const streetEl = document.getElementById('street-name');
  if (streetEl && typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      if (open && current().compose) renderView();
    }).observe(streetEl, { childList: true, characterData: true, subtree: true });
  }

  const api = {
    root: dock,
    statusSlot,
    get mode() {
      return online ? 'online' : 'solo';
    },
    /** The tab selected in the row (chats while a conversation is open there). */
    get tab() {
      return rowTab();
    },
    /** The conversation open in Chats, or ''. */
    get chat() {
      return openChat();
    },
    /** What the view shows: the open conversation, else the tab. */
    get showing() {
      return tab;
    },
    /** The tab row. */
    get tabs() {
      return row();
    },
    /** The Chats list's conversations, in its order. */
    get chats() {
      return listed().flatMap((sec) => sec.rows.map((r) => r.id));
    },
    /** The Chats list as drawn: [{ id, title, rows: [{ id, label, note, unread, last }] }]. */
    chatList: () => listed().map((sec) => ({ id: sec.id, title: sec.title, rows: sec.rows.map(({ t }) => ({ id: t.id, label: t.label, note: noteOf(t), unread: t.unread, last: lastLineText(t.lines, { label: t.label, section: t.section }) })) })),
    /** Back from a conversation to the Chats list. */
    back: (opts) => back(opts),
    isOpen: () => open,
    open: (opts = {}) => setOpen(true, { chosen: true, ...opts }),
    close: (opts = {}) => setOpen(false, { chosen: true, ...opts }),
    toggle: () => setOpen(!open, { chosen: true }),
    /** Opens or closes it without keeping that as the player's choice (the Classic skin's column). */
    present: (next) => setOpen(next),
    /** Back to the player's own choice, or the default for the window (leaving the Classic skin). */
    restore: () => setOpen(choice ?? defaultOpen(width())),
    select,
    focusInput,
    /** Opens the drawer on a tab with the input (the Feat panel's Gather fills it in), without keeping that as the player's choice. */
    revealInput: () => revealInput(),
    /** A tab's unread count (chats: the total of its conversations). */
    unread: (id) => (id === CHATS_TAB ? unreadOf(CHATS_VIEW) : tabs.has(id) ? unreadOf(tabs.get(id)) : 0),
    /**
     * Makes or changes a conversation: { label, header, prefix, placeholder, inputLabel, order, empty,
     * section (private|groups|channels), note (by its name in the list), initial (in its circle) }.
     * Local and Global are tabs; anything else is in Chats.
     */
    channel(id, opts = {}) {
      if (id === 'activity' || id === 'buddies' || id === CHATS_TAB) return false;
      const { label, ...rest } = opts;
      // Global's row label stays "Global" (TAB_LABELS); its name is Global Chat.
      addTab(id, { order: id === 'local' ? ORDER.local : id === 'global' ? ORDER.global : id === 'party' ? ORDER.party : ORDER.channel, icon: id === 'party' ? 'party' : id === 'global' ? 'channel' : 'local', ...rest, ...(label ? { label } : {}), live: true });
      render();
      return true;
    },
    /** Takes a conversation away (a party that ended, a chat closed); Global stays as a tab, waiting. */
    drop(id) {
      if (id === 'activity' || id === 'local' || id === 'buddies' || !tabs.has(id)) return false;
      const was = tab === id;
      if (thread?.chat === id) thread = null;
      if (id === 'global') {
        const g = tabs.get('global');
        Object.assign(g, { lines: [], unread: 0, header: null, live: false, empty: GLOBAL_WAIT });
      } else tabs.delete(id);
      // A conversation closed while open goes back to the list; Global (a tab) to Local.
      if (was) select(id === 'global' ? 'local' : online ? CHATS_TAB : 'activity');
      else render();
      return true;
    },
    has: (id) => tabs.has(id),
    /** A line for a tab: { name, text, note, mine, feat, at }. */
    push(id, line) {
      const t = tabs.get(id);
      if (!t || t.kind !== 'chat') return false;
      const l = normal(line);
      t.lines.push(l);
      trim(t.lines);
      if (!l.mine && !visible(id)) t.unread += 1;
      render();
      return true;
    },
    /**
     * THREADS: online only (null solo). connect({ send(chat, tk, text) -> bool, load(chat, tk) }) (null
     * turns them off); summary(tk, { n, last }); setReplies(tk, lines) (all of them, loaded); addReplies(tk,
     * lines) (merged in); push(tk, line, summary?) (one new reply); note(tk, text) (a refusal or a failed
     * load, shown in the thread); open(chat, tk, { focus, parent }) / close(); current ({ chat, tk } or
     * null); get(tk) ({ n, last, replies, loaded }).
     */
    threads: online ? {
      connect(t) {
        threader = t && typeof t.send === 'function' ? t : null;
        if (!threader) thread = null;
        render();
      },
      summary(tk, sum) {
        const k = String(tk || '');
        if (!k) return false;
        const st = storeOf(k);
        const s = normalSummary(sum);
        st.n = s ? Math.max(s.n, st.replies.length) : st.replies.length;
        st.last = s?.last || st.last;
        updateThread(k);
        return true;
      },
      setReplies(tk, lines = [], { loaded = true } = {}) {
        const k = String(tk || '');
        if (!k) return false;
        const st = storeOf(k);
        st.replies = mergeReplies([], (lines || []).map((l) => normal({ ...l, reply: true })));
        st.loaded = st.loaded || loaded;
        st.loading = false;
        if (st.replies.length >= st.n) {
          st.n = st.replies.length;
          const last = st.replies[st.replies.length - 1];
          st.last = last ? { id: last.playerId, name: last.name } : null;
        }
        updateThread(k);
        if (thread?.tk === k) render();
        else publish();
        return true;
      },
      addReplies(tk, lines = []) {
        const k = String(tk || '');
        if (!k) return false;
        const st = storeOf(k);
        return api.threads.setReplies(k, [...st.replies, ...(lines || [])], { loaded: st.loaded });
      },
      push(tk, line, sum = null) {
        const k = String(tk || '');
        if (!k || !line) return false;
        const st = storeOf(k);
        const had = st.replies.length;
        st.replies = mergeReplies(st.replies, [normal({ ...line, reply: true })]);
        const added = st.replies.length > had;
        const s = normalSummary(sum);
        if (s) {
          st.n = Math.max(s.n, st.replies.length);
          st.last = s.last;
        } else if (added) {
          st.n = Math.max(st.n + 1, st.replies.length);
          const l = normal(line);
          st.last = { id: l.playerId, name: l.name };
        }
        updateThread(k);
        if (thread?.tk === k) {
          const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
          if (atEnd) log.dataset.jump = '1';
          render();
        } else publish();
        return added;
      },
      note(tk, text) {
        const k = String(tk || '');
        if (!k) return false;
        const st = storeOf(k);
        st.note = String(text || '');
        st.loading = false;
        if (thread?.tk === k) render();
        return true;
      },
      open: (chat, tk, opts) => openThread(chat, String(tk || ''), opts),
      close: (opts) => closeThread(opts),
      get current() {
        return thread ? { ...thread } : null;
      },
      get(tk) {
        const st = threadStore.get(String(tk || ''));
        return st ? { n: st.n, last: st.last ? { ...st.last } : null, replies: st.replies.map((l) => ({ ...l })), loaded: st.loaded } : null;
      },
    } : null,
    /** A tab's lines all at once (a channel's history on joining). */
    setLines(id, lines = []) {
      const t = tabs.get(id);
      if (!t || t.kind !== 'chat') return false;
      t.lines = lines.map(normal);
      trim(t.lines);
      render();
      return true;
    },
    /** A conversation's unread count as its owner knows it (an IM's kept on the server); none while it shows. */
    setUnread(id, n) {
      const t = tabs.get(id);
      if (!t || t.kind !== 'chat') return false;
      t.unread = visible(id) ? 0 : Math.max(0, Math.floor(Number(n)) || 0);
      render();
      return true;
    },
    lines: (id) => (tabs.get(id)?.lines || []).map((l) => ({ ...l })),
    /**
     * REACTIONS: your own line said on Local comes back from the server with its id (the drawer showed
     * it as you said it): the oldest of your last lines there without a key and with these words gets
     * `rk`. True when one did.
     */
    claimLine(id, text, rk) {
      const t = tabs.get(id);
      if (!t || t.kind !== 'chat' || !rk || t.lines.some((l) => l.rk === rk)) return false;
      const l = t.lines.slice(-20).find((x) => x.mine && !x.rk && !x.note && sameWords(x.text, text));
      if (!l) return false;
      l.rk = String(rk);
      render();
      return true;
    },
    /** REACTIONS: online only (null solo). */
    reactions: reactUI ? {
      /** The sender: { send(rk, key, on) -> bool, me() -> your player id }; null turns reactions off. */
      connect(r) {
        reactor = r && typeof r.send === 'function' ? r : null;
        if (!reactor) reactUI.closePicker();
        render();
      },
      /** A line's reactions now ([{ key, by: [{ id, name }] }]): its chips are drawn again in place. */
      set(rk, list) {
        const k = String(rk || '');
        if (!k) return false;
        if (list?.length) reactStore.set(k, list);
        else reactStore.delete(k);
        const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
        const n = reactUI.update(k);
        if (n && atEnd) log.scrollTop = log.scrollHeight;
        setData('socialReactions', String(reactStore.size));
        return true;
      },
      get: (rk) => (reactStore.get(String(rk || '')) || []).map((c) => ({ key: c.key, by: c.by.map((b) => ({ ...b })) })),
      /** Opens the picker for a drawn row (QA and the keys); false without one. */
      openPicker: (row, opts) => reactUI.openPicker(row, opts),
      closePicker: (opts) => reactUI.closePicker(opts),
      get pickerOpen() {
        return reactUI.pickerOpen;
      },
    } : null,
    /**
     * A Local chat line (game.js showLocalChatBubble: the player, a companion, another
     * player). Online it goes to Local; solo it is the Activity log's chat line.
     */
    localLine(name, text, { mine = false, feat = false, playerId = 0, rk = '' } = {}) {
      if (online) return api.push('local', { name, text, mine, feat, playerId, rk });
      notifier.chat(`${name}: ${text}`);
      return true;
    },
    /** The notifier changed (game.js notify onChange). */
    update() {
      if (!open || current().kind !== 'activity') {
        keepingFocus(() => {
          renderRail();
          if (open) renderTabs();
          publish();
        });
        rendered();
        return;
      }
      render();
    },
    /** Who's around: how many players are online (null: not known), for the presence pill. */
    setOnline(n) {
      const v = n === null || n === undefined || !Number.isFinite(Number(n)) ? null : Math.max(0, Math.floor(Number(n)));
      if (v === onlineCount) return;
      onlineCount = v;
      setData('socialOnline', v === null ? '' : String(v));
      render();
    },
    /** A feature's data changed (buddies, presence): redraw. */
    refresh() {
      const data = buddyData();
      if (data) {
        const fresh = (data.newAdds || []).filter((id) => !seenAdds.has(id));
        addsUnread = fresh.length;
      }
      render();
    },
    onTab(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /**
     * Some tabs' logs as one, oldest first, with the time lines, drawn as this drawer draws them (the
     * Classic skin's "Local Chat / Activity" pane: Local's lines and the Activity log together).
     */
    logNodes(ids = [], { cache = 'logNodes' } = {}) {
      const items = [];
      for (const id of ids) {
        const t = tabs.get(id);
        if (!t) continue;
        if (t.kind === 'activity') for (const e of notifier.entries) items.push({ at: Number(e.at) || 0, e, act: true, id });
        else if (t.kind === 'chat') for (const l of t.lines) items.push({ at: l.at, e: l, act: false, id });
      }
      items.sort((a, b) => a.at - b.at);
      // `cache` names the container the rows go in (one row can only be in one place); each keeps its rows.
      return keyedRows(items, {
        atOf: (x) => x.at,
        keyOf: (x) => (x.act ? entryKey(x.e) : lineKey(x.id, x.e)),
        make: (x) => (x.act ? activityNode(x.e) : lineNode(x.e)),
        cache: cacheFor(cache),
        after: (node, x) => (x.act ? node : decorateRow(node, x.e)),
      });
    },
    /**
     * A skin draws the drawer's log for some tabs itself: fn(tabId) gives its rows (logNodes with
     * cache 'log'), or null for the drawer's own. The drawer redraws with it.
     */
    setLogSource(fn) {
      logSource = typeof fn === 'function' ? fn : null;
      render();
    },
    /** A tab's or conversation's name, or ''. */
    label: (id) => (id === CHATS_TAB ? CHATS_VIEW.label : tabs.get(id)?.label || ''),
    onRender(fn) {
      renderListeners.add(fn);
      return () => renderListeners.delete(fn);
    },
    /** How much of the root's edges the drawer covers (px), for the notices: { left, right }. */
    inset: () => insetNow(),
    /** Once a frame from game.js: keeps it under the top bar. */
    frame() {
      layout();
    },
  };
  render();
  globalThis.groddleSocial = api;
  return api;
}
