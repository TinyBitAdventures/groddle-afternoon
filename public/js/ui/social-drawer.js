/**
 * The Social drawer (phase 2 modern skin; the HUD mock's right-hand drawer, Warm paper).
 *
 * One place on the right for what the game says and what players say: Activity (the
 * notifier's log, js/notify.js: the same entries, no second log), Local (the street's
 * chat), Party while you are in one, each chat channel you have open (Live Help,
 * Global Chat, the Trade Channel, your groups: features/groups-feature.js) and Buddies
 * (who is online and where: features/buddies-feature.js). Solo has Activity only, with
 * the chat input under it (solo's Local chat: Feat lines, hi, slash commands).
 *
 * - Open it is 300 px wide (--drawer-w), at most 600 px tall, top right under the top
 *   bar. Collapsed it is a 44 px rail (--rail-w) of tab buttons with unread badges.
 *   It opens by default at 1440 px wide and up and starts as the rail below; the
 *   player's own choice is kept (localStorage SOCIAL_STORE_KEY, every access in
 *   try/catch: a private window just gets the default again).
 * - The drawer is #local-chat-dock (so the tutorial's rule hiding Local chat,
 *   body.nx-hide-chat #local-chat-dock in newxp-feature, hides it too) and holds
 *   #local-chat-form and #local-chat-input as they were, so the game's submit
 *   handler, the slash commands and every feature reading the input work as before.
 * - The input keeps what you said: Up and Down walk back through it. "/" opens the
 *   drawer and focuses the input unless something else has the keyboard.
 * - The world canvas is not resized: the drawer sits over the world. inset() says how
 *   much of the right edge it covers, so the notices (js/notify-view.js) centre in what
 *   is left.
 *
 * Features hand their lines and views over (engine.social): channel(id, opts) makes or
 * changes a tab, push(id, line) adds a line, setLines(id, lines) replaces them,
 * drop(id) takes a tab away, refresh() redraws after their data changed, statusSlot
 * holds the realtime state pill. Without a drawer (a classic skin) they keep the old dock.
 *
 * QA: canvas data socialOpen (open|rail), socialTab, socialTabs, socialUnread
 * (tab:n,...); window.groddleSocial.
 */
import { colorizeAmounts } from '../notify-view.js?v=g469-2';

export const SOCIAL_STORE_KEY = 'groddle-social-drawer';
/** The drawer opens by default at this window width and up (the mock's 1440 rule). */
export const OPEN_MIN_WIDTH = 1440;
/** A time line goes into the scrollback when this long has passed since the line before. */
export const TIME_GAP_MS = 5 * 60 * 1000;
export const LINE_LIMIT = 200;
export const HISTORY_LIMIT = 50;

const ORDER = { activity: 0, local: 10, party: 20, channel: 30, buddies: 90 };

const ICONS = {
  expand: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m12 5-5 5 5 5"/></svg>',
  collapse: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m6 4 4 4-4 4"/></svg>',
  chev: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m4.5 3 3 3-3 3"/></svg>',
  activity: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2.5 10h3l2-5 3.5 10 2-5h4.5"/></svg>',
  local: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3.5 4.5h13v9h-7l-4 3v-3h-2z"/></svg>',
  party: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="7" cy="7.5" r="2.5"/><circle cx="13.5" cy="8" r="2"/><path d="M2.5 16c.5-2.8 2.3-4.2 4.5-4.2s4 1.4 4.5 4.2M12 12.2c2.2-.4 4.4.8 5 3.8"/></svg>',
  channel: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2.5 3.5h10v7h-5l-3 2.5v-2.5h-2z"/><path d="M14.5 7.5h3v7h-1.5v2.5l-3-2.5h-4v-2"/></svg>',
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
} = {}) {
  if (typeof document === 'undefined' || !root || !dock || !notifier) return null;
  const online = mode === 'online';
  const form = dock.querySelector('#local-chat-form');
  const input = dock.querySelector('#local-chat-input');
  const inputLabel = dock.querySelector('label[for="local-chat-input"]');
  const sendBtn = form?.querySelector('button[type="submit"]');
  const history = createHistory();

  /** id -> { id, kind, label, order, lines, unread, header, prefix, placeholder, inputLabel, compose, empty } */
  const tabs = new Map();
  let tab = 'activity';
  let choice = readChoice(storage);
  let open = choice ?? defaultOpen(width());
  const listeners = new Set();
  /** Ids of buddies' "added you" already seen on the Buddies tab. */
  const seenAdds = new Set();
  let addsUnread = 0;

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
  const viewHead = el('div', { class: 'social-view-head', 'data-social-view-head': '' });
  const log = el('div', { class: 'social-log', role: 'log', tabindex: '0', 'data-social-log': '' });
  view.append(viewHead, log);
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
  function current() {
    return tabs.get(tab) || tabs.get('activity');
  }

  function visible(id) {
    return open && tab === id && !document.hidden;
  }

  function sorted() {
    return [...tabs.values()].sort((a, b) => a.order - b.order || String(a.label).localeCompare(String(b.label)));
  }

  function unreadOf(t) {
    if (t.kind === 'activity') return notifier.unread;
    if (t.kind === 'buddies') return addsUnread;
    return t.unread;
  }

  function markSeen() {
    const t = current();
    if (!open || document.hidden) return;
    if (t.kind === 'activity') notifier.markRead();
    else if (t.kind === 'buddies') {
      for (const id of buddyData()?.newAdds || []) seenAdds.add(id);
      addsUnread = 0;
    } else t.unread = 0;
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
    expand.addEventListener('click', () => setOpen(true, { chosen: true, focus: 'tab' }));
    items.push(expand, el('span', { class: 'social-sep', 'aria-hidden': 'true' }));
    const all = sorted();
    const channels = all.filter((t) => t.kind === 'chat' && t.order >= ORDER.channel && t.order < ORDER.buddies);
    for (const t of all) {
      if (channels.includes(t) && t !== channels[0]) continue;
      let target = t;
      let n = unreadOf(t);
      let label = t.label;
      if (channels.includes(t)) {
        // The open chat channels share one rail button: it opens the first with something new.
        n = channels.reduce((sum, c) => sum + c.unread, 0);
        target = channels.find((c) => c.unread) || channels[0];
        label = channels.length > 1 ? 'Chats' : t.label;
      }
      const b = iconButton({
        'data-social-rail-tab': target.id,
        'aria-label': n ? `${label}, ${n} new` : label,
        title: label,
      }, channels.includes(t) ? 'channel' : t.icon, n);
      b.addEventListener('click', () => {
        select(target.id);
        setOpen(true, { chosen: true, focus: 'log' });
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
    const all = sorted();
    tablist.hidden = all.length < 2;
    const buttons = all.map((t) => {
      const n = t.id === tab ? 0 : unreadOf(t);
      const b = el('button', {
        type: 'button',
        role: 'tab',
        id: `social-tab-${t.id.replace(/[^\w-]/g, '-')}`,
        class: 'social-tab',
        'aria-selected': String(t.id === tab),
        'aria-controls': 'social-view',
        tabindex: t.id === tab ? '0' : '-1',
        'data-social-tab': t.id,
        'aria-label': n ? `${t.label}, ${n} new` : t.label,
      });
      b.append(el('span', { class: 'social-tab-label' }, t.label));
      if (n) b.append(el('span', { class: 'social-badge', 'aria-hidden': 'true' }, badgeText(n)));
      b.addEventListener('click', () => select(t.id, { focus: false }));
      return b;
    });
    tablist.replaceChildren(...buttons);
    const sel = tablist.querySelector('[aria-selected="true"]');
    if (sel) {
      view.setAttribute('aria-labelledby', sel.id);
      // A long row of chats scrolls: keep the one in front in view.
      if (typeof sel.scrollIntoView === 'function' && tablist.scrollWidth > tablist.clientWidth) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function lineNode(line) {
    if (line.sep) return el('div', { class: 'social-time', 'data-social-time': '' }, line.sep);
    if (line.note) return el('p', { class: 'social-msg is-note' }, line.text);
    const p = el('p', { class: `social-msg${line.mine ? ' is-mine' : ''}${line.feat ? ' is-feat' : ''}` });
    p.append(el('b', {}, line.mine ? 'You' : line.name || 'Someone'), document.createTextNode(` ${line.text}`));
    return p;
  }

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
      const li = el('li', { 'data-social-buddy': String(r.id), 'data-online': String(Boolean(r.online)) });
      const a = avatarOf(r.name);
      const av = el('span', { class: 'social-av', 'data-hue': String(a.hue), 'aria-hidden': 'true' }, a.initial);
      if (r.online) av.append(el('span', { class: 'social-dot' }));
      const what = el('span', { class: 'social-buddy-what' });
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

  function renderView() {
    const t = current();
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
    // The same head stays put (moving it would drop the keyboard from a button in it).
    if (viewHead.firstChild !== t.header || viewHead.childNodes?.length > 1) viewHead.replaceChildren(...(t.header ? [t.header] : []));
    viewHead.hidden = !t.header;
    let nodes;
    if (t.kind === 'activity') {
      const entries = notifier.entries;
      nodes = entries.length ? withTimeLines(entries).map(activityNode) : [el('p', { class: 'social-empty' }, t.empty)];
      log.setAttribute('aria-live', 'off');
    } else if (t.kind === 'buddies') {
      nodes = renderBuddies();
      log.setAttribute('aria-live', 'off');
    } else {
      nodes = t.lines.length ? withTimeLines(t.lines).map(lineNode) : t.empty ? [el('p', { class: 'social-empty' }, t.empty)] : [];
      log.setAttribute('aria-live', 'polite');
    }
    log.replaceChildren(...nodes);
    log.setAttribute('aria-label', t.kind === 'activity' ? 'Activity log' : t.kind === 'buddies' ? 'Buddies' : `${t.label} chat`);
    log.dataset.socialLog = t.id;
    if (atEnd || log.dataset.jump) log.scrollTop = log.scrollHeight;
    delete log.dataset.jump;
    // The input under the log: what it says and where your words go.
    const showCompose = Boolean(form) && t.compose;
    compose.hidden = !showCompose;
    if (input && showCompose) {
      const street = streetName();
      const hint = t.placeholder || (street ? `Say something on ${street}` : 'Say something');
      if (input.placeholder !== hint) input.placeholder = hint;
      if (inputLabel) inputLabel.textContent = t.inputLabel || t.label;
    }
  }

  function publish() {
    dock.dataset.socialOpen = open ? 'open' : 'rail';
    setData('socialOpen', open ? 'open' : 'rail');
    setData('socialTab', tab);
    setData('socialTabs', sorted().map((t) => t.id).join(','));
    setData('socialUnread', sorted().map((t) => [t.id, unreadOf(t)]).filter(([, n]) => n).map(([id, n]) => `${id}:${n}`).join(','));
  }

  /** A selector for the drawer control that has the keyboard, so a redraw can give it back. */
  function focusSelector(node) {
    if (!node || node === input || node === document.body || !dock.contains?.(node)) return null;
    const esc = (v) => (globalThis.CSS?.escape ? CSS.escape(v) : String(v).replace(/"/g, '\\"'));
    for (const a of ['data-social-rail-tab', 'data-social-tab', 'data-social-buddy']) {
      const v = node.getAttribute?.(a);
      if (v !== null && v !== undefined) return `[${a}="${esc(v)}"]`;
    }
    for (const a of ['data-social-expand', 'data-social-collapse', 'data-social-presence', 'data-social-manage-buddies']) if (node.getAttribute?.(a) !== null) return `[${a}]`;
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
    }
    render();
    if (focus === 'tab') tablist.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true }) || log.focus({ preventScroll: true });
    else if (focus === 'log') log.focus({ preventScroll: true });
    else if (focus === 'rail') rail.querySelector('[data-social-expand]')?.focus({ preventScroll: true });
    else if (focus === 'input') input?.focus({ preventScroll: true });
  }

  function select(id, { focus = false } = {}) {
    if (!tabs.has(id)) return false;
    const changed = id !== tab;
    tab = id;
    log.dataset.jump = '1';
    render();
    if (focus) tablist.querySelector(`[data-social-tab="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
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
    return {
      name: String(line.name || ''),
      text: String(line.text || ''),
      note: Boolean(line.note),
      mine: Boolean(line.mine),
      feat: Boolean(line.feat),
      at: Number(line.at) || Date.now(),
    };
  }

  // —— Wiring ——
  collapseBtn.setAttribute('aria-label', online ? 'Collapse the social drawer' : 'Collapse the activity log');
  collapseBtn.title = 'Collapse';
  collapseBtn.addEventListener('click', () => setOpen(false, { chosen: true, focus: 'rail' }));
  presence.addEventListener('click', () => select('buddies', { focus: true }));

  // Tabs: arrow keys move along the row (the ARIA tabs pattern), Home and End to the ends.
  tablist.addEventListener('keydown', (e) => {
    const all = sorted();
    const i = all.findIndex((t) => t.id === tab);
    let to = -1;
    if (e.key === 'ArrowRight') to = (i + 1) % all.length;
    else if (e.key === 'ArrowLeft') to = (i - 1 + all.length) % all.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = all.length - 1;
    if (to < 0) return;
    e.preventDefault();
    select(all[to].id, { focus: true });
  });

  // Keys pressed in the drawer stay in it (a focused tab or button never walks the avatar),
  // except Escape, which the game's own handlers see.
  dock.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return;
    if (e.key === '/' && !e.target?.matches?.('input, textarea, select, [contenteditable="true"]')) {
      e.preventDefault();
      focusInput();
    }
    e.stopPropagation();
  });

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        const prev = history.up();
        if (prev !== null) {
          input.value = prev;
          e.preventDefault();
          requestAnimationFrame?.(() => input.setSelectionRange?.(input.value.length, input.value.length));
        }
      } else if (e.key === 'ArrowDown') {
        const next = history.down();
        if (next !== null) {
          input.value = next;
          e.preventDefault();
        }
      }
    });
  }
  // Before every other submit handler (they listen on the form or on this dock later):
  // keep the line for Up, and send a Party tab's line to the party (/p, party-feature).
  dock.addEventListener('submit', (e) => {
    if (e.target !== form || !input) return;
    const text = String(input.value || '');
    history.push(text);
    const t = current();
    if (t.prefix && text.trim() && !text.trim().startsWith('/')) input.value = `${t.prefix}${text.trim()}`;
  }, true);

  /** Shows the input (a tab that has one, the drawer open), for whatever is about to type in it. */
  function revealInput({ chosen = false } = {}) {
    if (!form) return false;
    if (online && !current().compose) select(tabs.has('local') ? 'local' : 'activity');
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
    get tab() {
      return tab;
    },
    get tabs() {
      return sorted().map((t) => t.id);
    },
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
    /** A tab's unread count. */
    unread: (id) => (tabs.has(id) ? unreadOf(tabs.get(id)) : 0),
    /** Makes or changes a chat tab: { label, header, prefix, placeholder, inputLabel, order, empty }. */
    channel(id, opts = {}) {
      if (id === 'activity' || id === 'buddies') return false;
      addTab(id, { order: id === 'local' ? ORDER.local : id === 'party' ? ORDER.party : ORDER.channel, icon: id === 'party' ? 'party' : 'local', ...opts });
      render();
      return true;
    },
    /** Takes a tab away (a party that ended, a chat closed). */
    drop(id) {
      if (id === 'activity' || id === 'local' || id === 'buddies' || !tabs.has(id)) return false;
      tabs.delete(id);
      if (tab === id) select(online ? 'local' : 'activity');
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
    /** A tab's lines all at once (a channel's history on joining). */
    setLines(id, lines = []) {
      const t = tabs.get(id);
      if (!t || t.kind !== 'chat') return false;
      t.lines = lines.map(normal);
      trim(t.lines);
      render();
      return true;
    },
    lines: (id) => (tabs.get(id)?.lines || []).map((l) => ({ ...l })),
    /**
     * A Local chat line (game.js showLocalChatBubble: the player, a companion, another
     * player). Online it goes to Local; solo it is the Activity log's chat line.
     */
    localLine(name, text, { mine = false, feat = false } = {}) {
      if (online) return api.push('local', { name, text, mine, feat });
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
        return;
      }
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
