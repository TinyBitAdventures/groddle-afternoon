/**
 * Groups and chat channels in multiplayer (register G326): the game-wide
 * channels of the original (Global Chat, Live Help, the Trade Channel) and
 * player groups (find, join, make, leave, invite, and each group's chat).
 * The groups live on the site (groddle-afternoon-site src/Groups.php,
 * groddle/v1/groups, through js/minn-account.js); the chat runs on the
 * realtime server (groddle-afternoon-server/channels.go), which opens a
 * group's chat only for the groups the site signed for this player
 * (groups_watch), never a list this game makes up. The rules and copy are
 * js/groups.js; the original is GameServerJS groups/group.js and
 * players/inc_groups.js.
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')). In solo
 * this feature does nothing: no UI, no hooks answer.
 *
 * - Chat tabs over the chat dock's input: Street (the street's chat, as
 *   before), Party while you are in one (it opens the Party pane and what
 *   you type goes to the party, as /p does), then each chat you have open:
 *   Live Help, Global Chat, Trade Channel, then your groups by name
 *   (BaseContacts.as:163-177). A tab not in front counts its new lines (the
 *   contact list's activity counter, ContactElement.as:317-322). The open
 *   chats and the tab in front are remembered for next time.
 * - Menu, Groups: the channels (Open / Close; Live Help and the Trade
 *   Channel show the original's first-time dialog), your groups (Chat,
 *   Invite, Members, Leave), invitations (Join / Decline), Find Groups
 *   (public ones by name) and Make a group (name, description, public or
 *   private). At most 20 groups (config_prod.js:39 max_groups).
 * - The modern skin's Social drawer (engine.social): each open chat is a tab
 *   there (after Local and Party), with Who is here and Close over its lines;
 *   the drawer's Local and Party tabs stand for Street and Party.
 * - In a chat tab, /who names who is in it (main.js:5573-5582); other
 *   commands (emotes, /p, ...) go where they always did.
 * - Blocking: a blocked player's lines are dropped here, as the original's
 *   client dropped an ignored player's (RightSideManager.as:218-223),
 *   through buddies-feature's realtimeHidden.
 *
 * QA: canvas data groupsCount, groupsTab, groupsOpen (chats open),
 * groupsUnread (chat:n,...), groupsLastSaid (chat|name|text), groupsPanel;
 * window.groddleGroups.
 */

import { createMinnAccount } from '../minn-account.js?v=81339760';
import { saveStore } from '../save-store.js?v=b74a8113';
import {
  CHANNELS,
  CHANNEL_INTRO,
  DESCRIPTION_MAX,
  GROUP_TEXT,
  WATCH_REFRESH_MS,
  chatLabel,
  chatLine,
  groupChannel,
  groupIdOf,
  groupNameProblem,
  isChannel,
  knownChat,
  mayOpen,
  normalizeGroup,
  normalizeGroups,
  pushLine,
  readMemory,
  tabCommand,
  tabOrder,
  writeMemory,
} from '../groups.js?v=65337c22';

export const GROUPS_FEATURE_ID = 'groups';

const STYLE = `
.grp-tabs { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin: 0 0 0.3rem; pointer-events: auto; font: 600 var(--fs-xs)/var(--lh-snug) var(--font-system); }
.grp-tabs[hidden] { display: none; }
.grp-tab { display: inline-flex; align-items: center; gap: 0.3rem; border: 0; border-radius: var(--radius-pill); padding: 0.2rem var(--sp-5); cursor: pointer; color: var(--text-heading);
  background: color-mix(in srgb, var(--surface-card) 92%, transparent); box-shadow: var(--shadow-1); font: inherit; }
.grp-tab[aria-selected="true"] { color: var(--text-inverse); background: var(--c-violet-50); }
.grp-tab .grp-unread { min-width: 1.1rem; padding: 0 0.3rem; border-radius: var(--radius-pill); font-size: var(--fs-2xs); line-height: var(--lh-normal); text-align: center; color: var(--text-inverse); background: var(--c-orange-68); }
.grp-tab .grp-x { margin-left: var(--sp-1); opacity: 0.7; font-weight: 700; }
.grp-tab .grp-x:hover { opacity: 1; }
.grp-box { pointer-events: auto; margin: 0 0 0.3rem; padding: var(--sp-3) 0.55rem var(--sp-3); border-radius: var(--radius-md); background: color-mix(in srgb, var(--surface-card) 96%, transparent);
  box-shadow: var(--shadow-2); color: var(--text); font: var(--fs-sm)/var(--lh-normal) var(--font-system); }
.grp-box[hidden] { display: none; }
.grp-box-head { display: flex; align-items: center; gap: var(--sp-3); }
.grp-box-head b { color: var(--c-violet-50); font-size: var(--fs-sm); flex: 1 1 auto; }
.grp-box-head button { font: 600 var(--fs-xs)/var(--lh-snug) var(--font-system); border: 0; border-radius: var(--radius-pill); padding: var(--sp-1) var(--sp-4); cursor: pointer; color: var(--text-heading); background: var(--surface-lilac); box-shadow: inset 0 0 0 1px var(--c-mauve-85); }
.grp-lines { list-style: none; margin: 0.3rem 0 0; padding: 0; max-height: 9rem; overflow-y: auto; }
.grp-lines li { margin: var(--sp-1) 0; overflow-wrap: anywhere; }
.grp-lines li b { color: var(--c-violet-50); }
.grp-lines li.is-note { color: var(--text-muted); font-style: italic; }
.grp-shade { position: fixed; inset: 0; z-index: var(--z-screen); display: grid; place-items: center; padding: var(--sp-8); background: color-mix(in srgb, var(--c-sage-23) 45%, transparent); }
.grp-shade[hidden] { display: none; }
.grp-panel { width: min(32rem, 100%); max-height: calc(100vh - 2rem); overflow: auto; border-radius: var(--radius-2xl); padding: var(--sp-8) var(--sp-9) var(--sp-9);
  background: var(--surface-card); color: var(--c-sand-28); box-shadow: var(--shadow-3); font: var(--fs-base)/var(--lh-loose) var(--font-system); }
.grp-panel h2 { margin: 0 0 var(--sp-3); font-size: var(--fs-xl); }
.grp-panel h3 { margin: var(--sp-7) 0 var(--sp-3); font-size: var(--fs-lg); color: var(--c-lime-49); }
.grp-panel p { margin: var(--sp-3) 0; }
.grp-panel .grp-close { float: right; border: 0; padding: 0.2rem 0.55rem; color: var(--c-sand-28); background: transparent; font-size: var(--fs-2xl); line-height: var(--lh-none); cursor: pointer; }
.grp-panel ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-3); }
.grp-panel li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem var(--sp-5); padding: 0.45rem var(--sp-5); border-radius: var(--radius-md); background: var(--surface-parchment); }
.grp-panel li .grp-what { flex: 1 1 12rem; min-width: 0; }
.grp-panel li .grp-what small { display: block; opacity: 0.8; overflow-wrap: anywhere; }
.grp-panel li .grp-tag { margin-left: 0.3rem; padding: 0 var(--sp-3); border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: 700; color: var(--c-lime-49); background: var(--c-sage-95); }
.grp-panel li .grp-people { flex: 1 1 100%; margin: var(--sp-1) 0 0; font-size: var(--fs-sm); opacity: 0.9; }
.grp-panel button.grp-act { font: inherit; font-weight: 700; border: 0; border-radius: var(--radius-md); padding: 0.3rem var(--sp-5); cursor: pointer; color: var(--text-moss); background: var(--surface-moss); box-shadow: inset 0 0 0 2px var(--c-lime-85); }
.grp-panel button.grp-act:disabled { opacity: 0.55; cursor: default; }
.grp-panel button.grp-go { font: inherit; font-weight: 700; border: 0; border-radius: var(--radius-md); padding: var(--sp-3) 0.8rem; cursor: pointer; color: var(--text-inverse); background: linear-gradient(180deg, var(--c-orange-76), var(--c-orange-68)); box-shadow: 0 2px 0 var(--c-orange-57); }
.grp-panel button.grp-go:disabled { opacity: 0.55; cursor: default; }
.grp-panel form { display: grid; gap: 0.45rem; }
.grp-panel label { display: grid; gap: var(--sp-1); font-weight: 600; font-size: var(--fs-md); }
.grp-panel input[type="text"], .grp-panel input[type="search"], .grp-panel textarea { font: inherit; font-weight: 400; padding: var(--sp-3) 0.55rem; border-radius: var(--radius-md); border: 1px solid var(--c-gold-83); background: var(--surface-bright); color: var(--c-sand-28); }
.grp-panel textarea { min-height: 3.2rem; resize: vertical; }
.grp-panel .grp-modes { display: flex; gap: var(--sp-8); font-weight: 400; }
.grp-panel .grp-modes label { display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 400; }
.grp-panel .grp-row { display: flex; gap: var(--sp-3); }
.grp-panel .grp-row input { flex: 1 1 auto; min-width: 0; }
.grp-panel .grp-none { opacity: 0.75; font-style: italic; }
.grp-panel .grp-note { min-height: 1.4em; margin-top: var(--sp-5); font-weight: 600; color: var(--c-lime-49); }
.grp-panel .grp-note[data-tone="bad"] { color: var(--text-danger); }
.grp-panel .grp-picks { display: flex; flex-wrap: wrap; gap: 0.3rem; flex: 1 1 100%; }
`;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function createSession(engine, client) {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  const userId = () => Number(client.me?.id || boot.player?.id) || 0;
  let list = null;
  let tokenAt = 0;
  let loading = null;
  let busy = false;
  let note = '';
  let noteTone = 'good';
  let inParty = false;
  let lastSaid = '';
  /** The server's word: chats open on this socket, and the ones it may open. */
  let allowed = null;
  /** chat -> { lines, unread } for each chat open (or asked for). */
  const chats = new Map();
  let memory = readMemory(storage(), userId());
  let tab = memory.tab;
  let search = { q: '', groups: null, busy: false };
  /** group id -> people (from groddle/v1/groups/{id}), shown under the group. */
  const people = new Map();
  /** group id: the invite picker is open. */
  let inviting = 0;

  // —— The dock: tabs and the chat box ——
  const style = el('style', { id: 'groups-css' });
  style.textContent = STYLE;
  document.head.append(style);
  const dock = document.getElementById?.('local-chat-dock');
  const form = document.getElementById?.('local-chat-form');
  const input = document.getElementById?.('local-chat-input');
  const streetPlaceholder = input?.placeholder || '';
  const tabs = el('div', { class: 'grp-tabs', role: 'tablist', 'aria-label': 'Chats', 'data-groups-tabs': '' });
  const box = el('section', { class: 'grp-box', hidden: true, 'aria-live': 'polite', 'data-groups-box': '' });
  const boxHead = el('div', { class: 'grp-box-head' });
  const boxTitle = el('b', {});
  const whoBtn = el('button', { type: 'button', 'data-groups-who': '' }, 'Who is here');
  const closeBtn = el('button', { type: 'button', 'data-groups-close-chat': '' }, 'Close');
  boxHead.append(boxTitle, whoBtn, closeBtn);
  const lines = el('ol', { class: 'grp-lines', 'data-groups-lines': '' });
  box.append(boxHead, lines);
  const social = engine.social || null;
  if (dock && form) {
    if (!social) {
      dock.insertBefore(box, form);
      dock.insertBefore(tabs, form);
    }
    // Before the game's own submit handler (game.js local-chat-form): a line typed in a chat tab goes there.
    dock.addEventListener('submit', onSubmit, true);
  }
  /** The drawer's tabs for the open chats: channel -> 'label|order' last handed over. */
  const handed = new Map();
  /** channel -> its head in the drawer (Who is here, Close). */
  const heads = new Map();
  const drawerLine = (line) => (line.note ? { note: true, text: line.text } : { name: line.name, text: line.text, mine: line.id === userId(), at: line.at });
  function headFor(channel) {
    let h = heads.get(channel);
    if (!h) {
      h = el('div', { class: 'social-chan-head', 'data-groups-box': channel });
      const w = el('button', { type: 'button', 'data-groups-who': channel }, 'Who is here');
      const c = el('button', { type: 'button', 'data-groups-close-chat': channel }, 'Close');
      w.addEventListener('click', () => who(channel));
      c.addEventListener('click', () => closeChat(channel));
      h.append(w, c);
      heads.set(channel, h);
    }
    return h;
  }
  /** The drawer shows the open chats as its own tabs (Local and Party are the drawer's). */
  function handOver() {
    const order = tabOrder([...chats.keys()], list, { inParty }).filter((t) => t !== 'street' && t !== 'party' && knownChat(t));
    order.forEach((ch, i) => {
      const label = chatLabel(ch, list);
      const sig = `${label}|${i}`;
      if (handed.get(ch) === sig && social.has(ch)) return;
      handed.set(ch, sig);
      social.channel(ch, { label, header: headFor(ch), placeholder: `Chat in ${label}`, inputLabel: label, order: 30 + i, empty: 'Nobody has said anything here yet.' });
      social.setLines(ch, (chats.get(ch)?.lines || []).map(drawerLine));
    });
    for (const ch of [...handed.keys()]) {
      if (order.includes(ch)) continue;
      handed.delete(ch);
      heads.delete(ch);
      social.drop(ch);
    }
  }
  // The drawer's tab in front is this feature's tab (what a typed line is for).
  social?.onTab((t) => {
    const want = t === 'local' ? 'street' : t === 'party' ? 'party' : chats.has(t) ? t : 'street';
    if (want === tab) return;
    tab = want;
    const chat = chats.get(tab);
    if (chat) chat.unread = 0;
    remember();
    publish();
  });
  whoBtn.addEventListener('click', () => who(tab));
  closeBtn.addEventListener('click', () => closeChat(tab));

  // —— The panel ——
  const shade = el('div', { id: 'groups-shade', class: 'grp-shade', hidden: true, 'data-groups-shade': '' });
  const panel = el('div', { class: 'grp-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'groups-title', 'data-groups-panel': '' });
  shade.append(panel);
  document.body.append(shade);
  shade.addEventListener('pointerdown', (e) => { if (e.target === shade) closePanel(); });
  shade.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') closePanel();
  });
  const menu = document.getElementById?.('more-list');
  let menuBtn = null;
  if (menu) {
    menuBtn = el('button', { id: 'groups-btn', type: 'button', class: 'chrome-btn', title: 'Groups and chat channels' }, GROUP_TEXT.title);
    menuBtn.addEventListener('click', () => openPanel());
    const before = document.getElementById?.('signout-btn');
    if (before && before.parentElement === menu) menu.insertBefore(menuBtn, before);
    else menu.append(menuBtn);
  }

  function remember() {
    memory = { ...memory, open: [...chats.keys()], tab };
    writeMemory(storage(), userId(), memory);
  }

  function publish() {
    engine.setData?.('groupsCount', String(list?.groups.length || 0));
    engine.setData?.('groupsTab', tab);
    engine.setData?.('groupsOpen', [...chats.keys()].filter((c) => allowed?.open.has(c)).join(','));
    engine.setData?.('groupsUnread', [...chats.entries()].filter(([, c]) => c.unread).map(([k, c]) => `${k}:${c.unread}`).join(','));
    engine.setData?.('groupsLastSaid', lastSaid);
    if (menuBtn) menuBtn.textContent = list?.invites.length ? `${GROUP_TEXT.title} (${list.invites.length})` : GROUP_TEXT.title;
  }

  // —— Tabs ——
  function renderTabs() {
    const order = tabOrder([...chats.keys()], list, { inParty });
    if (!order.includes(tab)) tab = 'street';
    if (social) {
      handOver();
      publish();
      return;
    }
    tabs.hidden = order.length < 2;
    tabs.replaceChildren(...order.map((t) => {
      const label = t === 'street' ? GROUP_TEXT.street : t === 'party' ? GROUP_TEXT.party : chatLabel(t, list);
      const b = el('button', { type: 'button', role: 'tab', class: 'grp-tab', 'aria-selected': String(t === tab), 'data-groups-tab': t });
      b.append(document.createTextNode(label));
      const unread = chats.get(t)?.unread || 0;
      if (unread && t !== tab) b.append(el('span', { class: 'grp-unread', 'aria-label': `${unread} new` }, String(Math.min(unread, 99))));
      b.addEventListener('click', () => setTab(t));
      return b;
    }));
    renderBox();
    publish();
  }

  function renderBox() {
    // The drawer draws the lines and owns the input's hint.
    if (social) return;
    const chat = chats.get(tab);
    const show = Boolean(chat) && knownChat(tab);
    box.hidden = !show;
    if (input) input.placeholder = show ? `Chat in ${chatLabel(tab, list)}` : tab === 'party' ? 'Chat with your party' : streetPlaceholder;
    if (!show) return;
    boxTitle.textContent = chatLabel(tab, list);
    lines.replaceChildren(...chat.lines.map((line) => {
      const li = el('li', line.note ? { class: 'is-note' } : {});
      if (line.note) li.textContent = line.text;
      else li.append(el('b', {}, `${line.name}: `), document.createTextNode(line.text));
      return li;
    }));
    lines.scrollTop = lines.scrollHeight;
  }

  function setTab(t) {
    tab = t;
    const chat = chats.get(t);
    if (chat) chat.unread = 0;
    if (social) social.select(t === 'street' ? 'local' : t);
    else if (t === 'party') {
      // The Party pane is party-feature's: open it.
      const partyBox = document.getElementById?.('party-box');
      if (partyBox?.hidden) document.querySelector?.('[data-party-btn]')?.click?.();
    }
    remember();
    renderTabs();
  }

  function chatOf(channel) {
    let chat = chats.get(channel);
    if (!chat) {
      chat = { lines: [], unread: 0 };
      chats.set(channel, chat);
    }
    return chat;
  }

  function addNote(channel, text) {
    const chat = chats.get(channel);
    if (!chat) return;
    pushLine(chat.lines, { note: true, text });
    if (channel === tab) renderBox();
    social?.push(channel, { note: true, text });
  }

  // —— Sending ——
  function onSubmit(e) {
    if (!input) return;
    const text = String(input.value || '');
    if (tab === 'party') {
      // party-feature's /p: what you type goes to the party.
      if (text.trim() && !text.trim().startsWith('/')) input.value = `/p ${text.trim()}`;
      return;
    }
    if (!knownChat(tab) || !chats.has(tab)) return;
    const cmd = tabCommand(text);
    if (!cmd) return; // other commands: the game's (emotes, /p, ...)
    e.preventDefault?.();
    e.stopPropagation?.();
    input.value = '';
    if (cmd.who) who(tab);
    else say(tab, cmd.say);
  }

  function say(channel, text) {
    if (!client.send('channel_say', { channel, text })) addNote(channel, GROUP_TEXT.offline);
    return true;
  }

  function who(channel) {
    if (knownChat(channel)) client.send('channel_who', { channel });
  }

  function watch() {
    if (!list?.token || client.state !== 'online') return false;
    return client.send('groups_watch', { token: list.token });
  }

  /** Opens a chat: the server checks it against the signed list. */
  async function openChat(channel, { focus = true, intro = true } = {}) {
    if (!knownChat(channel)) return false;
    if (intro && CHANNEL_INTRO[channel] && !memory.intro?.[channel] && engine.prompt) {
      const d = CHANNEL_INTRO[channel];
      engine.prompt({
        modal: true,
        title: d.title,
        text: d.body,
        choices: [{ label: d.ok, value: true }, { label: GROUP_TEXT.no, value: false }],
        onChoice: (v) => {
          if (v !== true) return;
          memory = { ...memory, intro: { ...memory.intro, [channel]: true } };
          remember();
          openChat(channel, { focus, intro: false });
        },
      });
      return true;
    }
    if (channel === 'trade' && list && !list.channels.trade && (engine.pc?.imaginationUpgrades || []).includes('trade_channel')) {
      // Bought a moment ago: the site reads the save, so write it first and ask again.
      engine.save?.();
      try { await saveStore.flush?.(); } catch { /* the answer says */ }
      await refresh();
    }
    if (!mayOpen(channel, list)) {
      const why = channel === 'trade' ? GROUP_TEXT.needsTrade : GROUP_TEXT.notFound;
      engine.toast?.(why, 3200);
      say0(why, 'bad');
      return false;
    }
    chatOf(channel);
    if (focus) tab = channel;
    client.send('channel_join', { channel });
    remember();
    renderTabs();
    if (focus && social) {
      social.select(channel);
      if (!social.isOpen()) social.open();
    }
    if (focus) input?.focus?.({ preventScroll: true });
    return true;
  }

  function closeChat(channel) {
    if (!chats.has(channel)) return;
    chats.delete(channel);
    client.send('channel_leave', { channel });
    if (tab === channel) tab = 'street';
    remember();
    renderTabs();
    render();
  }

  // —— The list ——
  function apply(answer) {
    list = normalizeGroups(answer);
    tokenAt = Date.now();
    watch();
    renderTabs();
    render();
    return list;
  }

  async function refresh() {
    if (loading) return loading;
    loading = (async () => {
      try {
        return apply(await account.groups());
      } catch (err) {
        console.warn('[groups]', err?.message || err);
        return null;
      } finally {
        loading = null;
        render();
      }
    })();
    render();
    return loading;
  }

  function say0(text, tone = 'good') {
    note = text;
    noteTone = tone;
    if (!shade.hidden) render();
  }

  async function act(run, ok) {
    if (busy) return false;
    busy = true;
    render();
    try {
      const answer = await run();
      apply(answer);
      ok?.(answer);
      return true;
    } catch (err) {
      say0(err?.message || GROUP_TEXT.failed, 'bad');
      engine.toast?.(err?.message || GROUP_TEXT.failed, 3600);
      return false;
    } finally {
      busy = false;
      render();
    }
  }

  const nameOf = (id) => list?.groups.find((g) => g.id === id)?.name || list?.invites.find((g) => g.id === id)?.name || search.groups?.find((g) => g.id === id)?.name || 'the group';

  function join(id) {
    const name = nameOf(id);
    return act(() => account.joinGroup(id), () => {
      say0(GROUP_TEXT.joined(name));
      engine.toast?.(GROUP_TEXT.joined(name), 3000);
      if (search.groups) search.groups = search.groups.map((g) => (g.id === id ? { ...g, member: true, members: g.members + 1 } : g));
    });
  }

  function leave(group) {
    return act(() => account.leaveGroup(group.id), () => {
      const ch = groupChannel(group.id);
      chats.delete(ch);
      if (tab === ch) tab = 'street';
      people.delete(group.id);
      remember();
      renderTabs();
      say0(GROUP_TEXT.left(group.name));
      engine.toast?.(GROUP_TEXT.left(group.name), 3000);
    });
  }

  function decline(group) {
    return act(() => account.declineGroupInvite(group.id), () => say0(GROUP_TEXT.declined(group.name)));
  }

  function invite(group, player) {
    return act(() => account.inviteToGroup(group.id, player.id), () => {
      inviting = 0;
      say0(GROUP_TEXT.invited(player.name, group.name));
      engine.toast?.(GROUP_TEXT.invited(player.name, group.name), 3000);
    });
  }

  function create({ name, description, mode }) {
    const problem = groupNameProblem(name);
    if (problem) {
      say0(problem, 'bad');
      return Promise.resolve(false);
    }
    return act(() => account.createGroup({ name: name.replace(/\s+/g, ' ').trim(), description, mode }), (answer) => {
      const made = list.groups.find((g) => g.id === Number(answer?.created));
      say0(GROUP_TEXT.created(made?.name || name));
      engine.toast?.(GROUP_TEXT.created(made?.name || name), 3000);
    });
  }

  async function find(q) {
    search = { ...search, q, busy: true };
    render();
    try {
      const answer = await account.searchGroups(q);
      search = { q, groups: (Array.isArray(answer?.groups) ? answer.groups : []).map(normalizeGroup).filter((g) => g.id), busy: false };
    } catch (err) {
      search = { ...search, busy: false };
      say0(err?.message || GROUP_TEXT.failed, 'bad');
    }
    render();
    return search.groups;
  }

  async function showPeople(group) {
    if (people.has(group.id)) {
      people.delete(group.id);
      render();
      return;
    }
    try {
      const answer = await account.group(group.id);
      people.set(group.id, (Array.isArray(answer?.people) ? answer.people : []).map((p) => ({ id: Number(p.id) || 0, name: String(p.name || 'A Glitch'), role: p.role === 'admin' ? 'admin' : 'member' })));
    } catch (err) {
      say0(err?.message || GROUP_TEXT.failed, 'bad');
    }
    render();
  }

  /** Who you might invite: your buddies, then the others on this street (by name). */
  function invitable(group) {
    const out = new Map();
    for (const b of globalThis.groddleBuddies?.list?.buddies || []) out.set(Number(b.id), String(b.name));
    for (const p of client.players || []) if (!out.has(Number(p.id))) out.set(Number(p.id), String(p.name));
    const inIt = new Set((people.get(group.id) || []).map((p) => p.id));
    return [...out.entries()].filter(([id]) => id && id !== userId() && !inIt.has(id)).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }

  // —— Panel ——
  function openPanel() {
    shade.hidden = false;
    engine.setData?.('groupsPanel', 'open');
    render();
    refresh();
    if (!search.groups && !search.busy) find('');
  }

  function closePanel() {
    shade.hidden = true;
    engine.setData?.('groupsPanel', 'closed');
  }

  function button(label, attrs, run, cls = 'grp-act') {
    const b = el('button', { type: 'button', class: cls, ...attrs }, label);
    b.disabled = busy;
    b.addEventListener('click', run);
    return b;
  }

  function groupRow(g, buttons, { extra = null } = {}) {
    const li = el('li', { 'data-group': String(g.id) });
    const what = el('span', { class: 'grp-what' });
    what.append(document.createTextNode(g.name));
    what.append(el('span', { class: 'grp-tag' }, g.mode === 'private' ? GROUP_TEXT.private : GROUP_TEXT.public));
    const bits = [`${g.members} ${g.members === 1 ? 'member' : 'members'}`];
    if (g.role === 'admin' && list?.groups.some((m) => m.id === g.id)) bits.push(GROUP_TEXT.admin);
    if (g.invitedBy) bits.push(`invited by ${g.invitedBy.name}`);
    what.append(el('small', {}, [g.description, bits.join(' · ')].filter(Boolean).join(' · ')));
    li.append(what, ...buttons);
    if (extra) li.append(extra);
    return li;
  }

  function render() {
    publish();
    if (shade.hidden) return;
    panel.replaceChildren();
    const x = el('button', { type: 'button', class: 'grp-close', 'aria-label': 'Close' }, '×');
    x.addEventListener('click', closePanel);
    panel.append(x, el('h2', { id: 'groups-title' }, GROUP_TEXT.title));

    // Channels.
    panel.append(el('h3', {}, 'Channels'));
    const chans = el('ul', { 'data-groups-channels': '' });
    for (const c of CHANNELS) {
      const open = chats.has(c.id);
      const li = el('li', { 'data-channel': c.id });
      const what = el('span', { class: 'grp-what' }, c.label);
      if (c.id === 'help' && list?.channels.help === 'newbie') what.append(el('small', {}, 'The newbie channel, until level 11'));
      if (c.id === 'trade' && list && !list.channels.trade) what.append(el('small', {}, GROUP_TEXT.needsTrade));
      li.append(what);
      li.append(open
        ? button('Close', { 'data-channel-close': c.id }, () => closeChat(c.id))
        : button('Open', { 'data-channel-open': c.id }, () => { openChat(c.id); closePanel(); }));
      chans.append(li);
    }
    panel.append(chans);

    if (!list) {
      panel.append(el('p', {}, loading ? 'Loading…' : GROUP_TEXT.failed));
    } else {
      panel.append(el('h3', {}, `Your groups (${list.groups.length} of ${list.max})`));
      if (!list.groups.length) panel.append(el('p', { class: 'grp-none' }, GROUP_TEXT.emptyMine));
      else {
        const ul = el('ul', { 'data-groups-mine': '' });
        for (const g of list.groups) {
          let extra = null;
          if (people.has(g.id) || inviting === g.id) {
            extra = el('div', { class: 'grp-people' });
            if (people.has(g.id)) extra.append(el('p', {}, people.get(g.id).map((p) => (p.role === 'admin' ? `${p.name} (${GROUP_TEXT.admin})` : p.name)).join(', ')));
            if (inviting === g.id) {
              const picks = el('div', { class: 'grp-picks' });
              const candidates = invitable(g);
              if (!candidates.length) picks.append(el('span', { class: 'grp-none' }, 'Add buddies, or stand near other players, to invite them.'));
              for (const p of candidates) picks.append(button(p.name, { 'data-group-invite-pick': String(p.id) }, () => invite(g, p)));
              extra.append(picks);
            }
          }
          ul.append(groupRow(g, [
            button('Chat', { 'data-group-chat': String(g.id) }, () => { openChat(groupChannel(g.id)); closePanel(); }),
            button('Invite', { 'data-group-invite': String(g.id) }, () => { inviting = inviting === g.id ? 0 : g.id; if (inviting && !people.has(g.id)) showPeople(g); else render(); }),
            button('Members', { 'data-group-members': String(g.id) }, () => showPeople(g)),
            button('Leave', { 'data-group-leave': String(g.id) }, () => confirmLeave(g)),
          ], { extra }));
        }
        panel.append(ul);
      }
      if (list.invites.length) {
        panel.append(el('h3', {}, 'Invitations'));
        const ul = el('ul', { 'data-groups-invites': '' });
        for (const g of list.invites) {
          ul.append(groupRow(g, [
            button('Join', { 'data-group-accept': String(g.id) }, () => join(g.id)),
            button('Decline', { 'data-group-decline': String(g.id) }, () => decline(g)),
          ]));
        }
        panel.append(ul);
      }

      // Find Groups.
      panel.append(el('h3', {}, GROUP_TEXT.find));
      const findForm = el('form', { 'data-groups-find': '' });
      const row = el('div', { class: 'grp-row' });
      const q = el('input', { type: 'search', maxlength: '32', placeholder: 'A group\'s name', 'aria-label': 'Group name', 'data-groups-q': '' });
      q.value = search.q;
      row.append(q, button('Find', { type: 'submit' }, () => {}, 'grp-act'));
      findForm.append(row);
      findForm.addEventListener('submit', (e) => { e.preventDefault?.(); find(String(q.value || '').trim()); });
      panel.append(findForm);
      if (search.busy) panel.append(el('p', {}, 'Looking…'));
      else if (search.groups) {
        if (!search.groups.length) panel.append(el('p', { class: 'grp-none' }, GROUP_TEXT.emptySearch));
        else {
          const ul = el('ul', { 'data-groups-found': '' });
          for (const g of search.groups) {
            const mine = list.groups.some((m) => m.id === g.id) || g.member;
            ul.append(groupRow(g, [mine
              ? button('Chat', { 'data-group-chat': String(g.id) }, () => { openChat(groupChannel(g.id)); closePanel(); })
              : button('Join', { 'data-group-join': String(g.id) }, () => join(g.id))]));
          }
          panel.append(ul);
        }
      }

      // Make a group.
      panel.append(el('h3', {}, 'Make a group'));
      const make = el('form', { 'data-groups-make': '' });
      const nameIn = el('input', { type: 'text', maxlength: '32', autocomplete: 'off', 'data-groups-name': '' });
      const descIn = el('textarea', { maxlength: String(DESCRIPTION_MAX), 'data-groups-description': '' });
      const nameLabel = el('label', {}, 'Name');
      nameLabel.append(nameIn);
      const descLabel = el('label', {}, 'Description');
      descLabel.append(descIn);
      const modes = el('div', { class: 'grp-modes', role: 'radiogroup', 'aria-label': 'Who can join' });
      const radios = {};
      for (const [mode, label] of [['public', 'Public: anyone can join'], ['private', 'Private: by invitation']]) {
        const l = el('label', {});
        const r = el('input', { type: 'radio', name: 'grp-mode', value: mode, 'data-groups-mode': mode });
        if (mode === 'public') r.checked = true;
        radios[mode] = r;
        l.append(r, document.createTextNode(label));
        modes.append(l);
      }
      const go = el('button', { type: 'submit', class: 'grp-go', 'data-groups-create': '' }, 'Make the group');
      go.disabled = busy || list.groups.length >= list.max;
      make.append(nameLabel, descLabel, modes, go);
      if (list.groups.length >= list.max) make.append(el('p', { class: 'grp-none' }, GROUP_TEXT.limit(list.max)));
      make.addEventListener('submit', (e) => {
        e.preventDefault?.();
        create({ name: String(nameIn.value || ''), description: String(descIn.value || ''), mode: radios.private.checked ? 'private' : 'public' });
      });
      panel.append(make);
    }
    panel.append(el('p', { class: 'grp-note', role: 'status', 'aria-live': 'polite', 'data-tone': noteTone }, note));
  }

  function confirmLeave(g) {
    const text = g.members <= 1 ? GROUP_TEXT.leaveLastConfirm(g.name) : GROUP_TEXT.leaveConfirm(g.name);
    if (!engine.prompt) return leave(g);
    engine.prompt({
      modal: true,
      text,
      choices: [{ label: GROUP_TEXT.yes, value: true }, { label: GROUP_TEXT.no, value: false }],
      onChoice: (v) => { if (v === true) leave(g); },
    });
    return true;
  }

  // —— Messages ——
  client.on('hello', () => {
    allowed = null;
    if (list?.token && Date.now() - tokenAt < WATCH_REFRESH_MS) watch();
    else refresh();
  });
  client.on('msg:groups_status', (msg) => {
    allowed = { open: new Set(Array.isArray(msg.open) ? msg.open : []), channels: new Set(Array.isArray(msg.channels) ? msg.channels : []) };
    // Chats remembered (or asked for before the list was in): open them on this socket.
    for (const ch of [...chats.keys()]) {
      if (allowed.open.has(ch)) continue;
      if (isChannel(ch) ? allowed.channels.has(ch) : mayOpen(ch, list)) client.send('channel_join', { channel: ch });
      else chats.delete(ch);
    }
    remember();
    renderTabs();
  });
  client.on('msg:channel_joined', (msg) => {
    const ch = String(msg.channel || '');
    if (!knownChat(ch)) return;
    allowed?.open.add(ch);
    const chat = chatOf(ch);
    chat.lines = [];
    for (const raw of Array.isArray(msg.history) ? msg.history : []) {
      const line = chatLine(raw);
      if (line && !engine.query?.('realtimeHidden', line.id)) pushLine(chat.lines, line);
    }
    remember();
    renderTabs();
    social?.setLines(ch, chat.lines.map(drawerLine));
  });
  client.on('msg:channel_left', (msg) => {
    const ch = String(msg.channel || '');
    allowed?.open.delete(ch);
    if (!chats.has(ch)) return;
    chats.delete(ch);
    if (tab === ch) tab = 'street';
    remember();
    renderTabs();
  });
  client.on('msg:channel_said', (msg) => {
    const ch = String(msg.channel || '');
    const line = chatLine(msg);
    if (!line || !chats.has(ch)) return;
    // The original's client drops an ignored player's lines (RightSideManager.as:218-223).
    if (line.id !== userId() && engine.query?.('realtimeHidden', line.id)) return;
    const chat = chats.get(ch);
    pushLine(chat.lines, line);
    lastSaid = `${ch}|${line.name}|${line.text}`;
    if (ch !== tab && line.id !== userId()) chat.unread += 1;
    if (ch === tab) renderBox();
    renderTabs();
    social?.push(ch, drawerLine(line));
  });
  client.on('msg:channel_note', (msg) => addNote(String(msg.channel || ''), String(msg.text || '')));
  client.on('msg:party', (msg) => {
    inParty = Boolean(msg.party);
    if (!inParty && tab === 'party') tab = 'street';
    renderTabs();
  });
  client.on('error', ({ code, message }) => {
    if (code !== 'channels') return;
    const text = String(message || GROUP_TEXT.failed);
    if (knownChat(tab) && chats.has(tab)) addNote(tab, text);
    else engine.toast?.(text, 3200);
    if (/expired|not checked/.test(text) && Date.now() - tokenAt > 5000) refresh();
  });
  const timer = setInterval(() => { if (client.state === 'online') refresh(); }, WATCH_REFRESH_MS);
  timer?.unref?.();

  // The chats open last time come back (the server opens them once the list is watched).
  for (const ch of memory.open) chatOf(ch);
  renderTabs();
  refresh();

  return {
    client,
    get list() { return list; },
    get tab() { return tab; },
    chats,
    refresh,
    openChat,
    closeChat,
    setTab,
    say,
    join,
    leave,
    create,
    find,
    invite,
    decline,
    openPanel,
    closePanel,
    /** What the dock's submit does with a line (QA and tests). */
    submit(text) {
      if (!input) return false;
      input.value = text;
      let stopped = false;
      onSubmit({ preventDefault() {}, stopPropagation() { stopped = true; } });
      return stopped;
    },
  };
}

let session = null;

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client) return null;
  session = createSession(engine, client);
  globalThis.groddleGroups = session;
  return session;
}

export const groupsFeature = {
  id: GROUPS_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine);
  },
};
