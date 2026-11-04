/**
 * Buddies in multiplayer (register G325): add another player as a buddy,
 * see which of your buddies are online and where, hear when one comes
 * online, goes offline or adds you, and block (ignore) a player. The list
 * lives on the site (groddle-afternoon-site src/Buddies.php, groddle/v1/buddies,
 * through js/minn-account.js); the realtime server
 * (groddle-afternoon-server/buddies.go) tells presence, from a list the site
 * signed (buddies_watch), never one this game makes up. The rules and copy
 * are js/buddies.js; the original is GameServerJS players/inc_buddies.js.
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')). In solo
 * this feature does nothing: no UI, no verbs, no hooks answer.
 *
 * - Another player's Glitch (the player menu the party feature draws,
 *   extended through verbOverride, as trade-feature does): Add to Friends or
 *   Remove from Friends, and Block or Un-Block, as the source's player menu
 *   (main.js:3590-3646). Removing and blocking ask first (requires_confirmation).
 * - Menu, Buddies: your buddies with online or offline and the street they
 *   are on, Remove; who added you (Add back); who you block (Un-block).
 * - Toasts: a buddy online or offline, "X just added you as a contact!"
 *   live from the server (the source's activity line, inc_buddies.js:209).
 * - Adds made while you were away (the site marks those new; they may come
 *   from the website's "Add to buddy list" on your page): a prompt each,
 *   "X just added you as a contact! Add them back?" with Add back and Not now
 *   (the source's friend_add notification, inc_buddies.js:215-225); the line
 *   alone when you already hold them (friend_add_mutual). A prompt goes away
 *   when you add, block or lose them some other way first.
 * - Blocking: the blocked player's chat and emotes are hidden here
 *   (realtime-feature asks query('realtimeHidden', id)); their party invites
 *   and trade offers are refused by the server (party.go, trade.go ask
 *   buddies.go's buddies.ignoring hook, fed by your signed list).
 * - Badges: Fine Friend, Good Buddy, Jolly Good Chap, A-1 Comrade and Best
 *   Pal count real buddies (player buddies_count, set to the list's size as
 *   addToBuddyGroup and removeBuddy's achievements_set do, inc_buddies.js:196 and 276).
 *
 * - RIGHTCLICK (right-click audit later batch item 3): every row of the panel (your buddies, who
 *   added you, who you block) opens that player's menu from a list (engine.openPlayerMenu,
 *   js/ui/player-menu.js): a click on the row (not on its buttons), a right-click, a long press on
 *   touch, Enter or Shift+F10 on the name (Glitch's contact rows, ContactElement.as 267-271). The
 *   menu sits over the panel and closes with it.
 * - The modern skin's Social drawer (engine.social) has a Buddies tab: who is
 *   online (here, or the street they are on) and offline, IM (player-im-feature),
 *   Visit where homes can be visited, who added you, and Manage buddies for this panel. Its head
 *   counts the buddies online (drawerView()).
 *
 * QA: canvas data buddiesCount, buddiesOnline (name@street,...),
 * buddiesIgnoring (ids), buddiesAsking (ids with an "Add them back?" prompt),
 * buddiesLast (the last notice); window.groddleBuddies.
 */

import { createMinnAccount } from '../minn-account.js?v=63ba1e0b';
import { bindContextTrigger } from '../ui/context-menu.js?v=57c5f1fe';
import { STREET_INDEX } from '../street-loader.js?v=33d2b8bc';
import {
  BUDDY_COUNTER,
  BUDDY_TEXT,
  BUDDY_VERBS,
  WATCH_REFRESH_MS,
  addedYouKind,
  addedYouOnly,
  applyPresence,
  applyStatus,
  buddyVerbs,
  buddyWhere,
  freshReverse,
  isBuddy,
  isIgnoring,
  normalizeList,
} from '../buddies.js?v=df41a3bb';

export const BUDDIES_FEATURE_ID = 'buddies';
const VERB_IDS = new Set(Object.values(BUDDY_VERBS));

const STYLE = `
.buddies-shade { position: fixed; inset: 0; z-index: var(--z-screen); display: grid; place-items: center; padding: var(--sp-8); background: color-mix(in srgb, var(--c-sage-23) 45%, transparent); }
.buddies-shade[hidden] { display: none; }
.buddies-panel { width: min(30rem, 100%); max-height: calc(100vh - 2rem); overflow: auto; border-radius: var(--radius-2xl); padding: var(--sp-8) var(--sp-9) var(--sp-9);
  background: var(--surface-card); color: var(--c-sand-28); box-shadow: var(--shadow-3); font: var(--fs-base)/var(--lh-loose) var(--font-system); }
.buddies-panel h2 { margin: 0 0 var(--sp-3); font-size: var(--fs-xl); }
.buddies-panel h3 { margin: var(--sp-7) 0 var(--sp-3); font-size: var(--fs-lg); color: var(--c-lime-49); }
.buddies-panel p { margin: var(--sp-3) 0; }
.buddies-panel .buddies-close { float: right; border: 0; padding: 0.2rem 0.55rem; color: var(--c-sand-28); background: transparent; font-size: var(--fs-2xl); line-height: var(--lh-none); cursor: pointer; }
.buddies-panel ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-3); }
.buddies-panel li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem var(--sp-5); padding: 0.45rem var(--sp-5); border-radius: var(--radius-md); background: var(--surface-parchment); }
.buddies-panel li .buddy-what { flex: 1 1 12rem; }
.buddies-panel li[data-ctx] { cursor: pointer; }
.buddies-panel button.buddy-what { margin: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: start; cursor: pointer; border-radius: var(--radius-xs); }
.buddies-panel button.buddy-what:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.buddies-panel li .buddy-what small { display: block; opacity: 0.8; }
.buddies-panel li .buddy-dot { display: inline-block; width: 8px; height: 8px; margin-right: var(--sp-3); border-radius: var(--radius-round); background: var(--c-sand-67); vertical-align: 1px; }
.buddies-panel li[data-online="true"] .buddy-dot { background: var(--c-lime-67); }
.buddies-panel li .buddy-new { margin-left: 0.3rem; padding: 0 var(--sp-3); border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: 700; color: var(--text-inverse); background: var(--c-orange-68); }
.buddies-panel button.buddy-act { font: inherit; font-weight: 700; border: 0; border-radius: var(--radius-md); padding: 0.3rem var(--sp-5); cursor: pointer; color: var(--text-moss); background: var(--surface-moss); box-shadow: inset 0 0 0 2px var(--c-lime-85); }
.buddies-panel button.buddy-act:disabled { opacity: 0.55; cursor: default; }
.buddies-panel .buddies-none { opacity: 0.75; font-style: italic; }
.buddies-panel .buddies-note { min-height: 1.4em; margin-top: var(--sp-5); font-weight: 600; color: var(--c-lime-49); }
.buddies-panel .buddies-note[data-tone="bad"] { color: var(--text-danger); }
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

/** The public name of a street tsid (party-feature's streetLabel). */
function streetLabel(engine, tsid) {
  const feature = engine.query?.('labelFor', tsid, engine);
  if (feature?.street) return feature.street;
  const s = STREET_INDEX.streets || {};
  const meta = s[tsid] || s[String(tsid).replace(/^G/, 'L')] || s[String(tsid).replace(/^L/, 'G')];
  return meta?.label || tsid;
}

function createSession(engine, client) {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  let list = null;
  let tokenAt = 0;
  let loading = null;
  let busy = false;
  let lastCount = -1;
  let last = '';
  /** id -> { name, street }: who on the watched lists the server says is online. */
  const online = new Map();
  /** Reverse entries already told ("added you"), so a refresh does not tell them twice. */
  const told = new Set();
  /** id -> prompt uid: the "Add them back?" prompts showing or queued. */
  const asking = new Map();
  /** The adds the prompts asked for, one after another. */
  let addQueue = Promise.resolve();
  let running = null;
  let note = '';
  let noteTone = 'good';

  // —— Panel ——
  const style = el('style', { id: 'buddies-css' });
  style.textContent = STYLE;
  document.head.append(style);
  const shade = el('div', { id: 'buddies-shade', class: 'buddies-shade', hidden: true, 'data-buddies-shade': '' });
  const panel = el('div', { class: 'buddies-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'buddies-title', 'data-buddies-panel': '' });
  shade.append(panel);
  document.body.append(shade);
  shade.addEventListener('pointerdown', (e) => { if (e.target === shade) close(); });
  // RIGHTCLICK: a row's player menu, over the panel (layer screen); the panel redraws under it.
  const rowOf = (t) => {
    const li = t?.closest?.('li[data-buddy]');
    return li && panel.contains(li) && engine.openPlayerMenu ? li : null;
  };
  let menuFor = 0;
  const openRow = (li, { at = null, keys = false } = {}) => {
    const id = Number(li.getAttribute('data-buddy')) || 0;
    const opened = engine.openPlayerMenu?.({
      id,
      name: li.getAttribute('data-name') || '',
      at,
      keys,
      anchor: li,
      opener: li.querySelector('[data-buddy-who]') || li,
      findOpener: () => panel.querySelector(`[data-buddy-who="${id}"]`),
      layer: 'screen',
    });
    if (opened) menuFor = id;
    return opened;
  };
  panel.addEventListener('click', (e) => {
    const li = rowOf(e.target);
    if (!li || e.target?.closest?.('button.buddy-act')) return;
    const keys = e.detail === 0;
    openRow(li, { at: keys ? null : { x: e.clientX, y: e.clientY }, keys });
  });
  bindContextTrigger(panel, {
    rowOf,
    isOpenFor: (li) => Boolean(engine.isPlayerMenuOpen?.(li.getAttribute('data-buddy'))),
    open: (li, { at, keys }) => openRow(li, { at, keys }),
    longPress: true,
  });
  shade.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });
  const menu = document.getElementById?.('more-list');
  if (menu) {
    const btn = el('button', { id: 'buddies-btn', type: 'button', class: 'chrome-btn', title: 'Your buddies: who is online and where' }, BUDDY_TEXT.title);
    btn.addEventListener('click', () => open());
    const before = document.getElementById?.('signout-btn');
    if (before && before.parentElement === menu) menu.insertBefore(btn, before);
    else menu.append(btn);
  }

  function open() {
    shade.hidden = false;
    engine.setData?.('buddiesPanel', 'open');
    render();
    refresh();
  }

  function close() {
    shade.hidden = true;
    engine.setData?.('buddiesPanel', 'closed');
    if (menuFor && engine.isPlayerMenuOpen?.(menuFor)) engine.closePlayerMenu?.({ focus: false });
    menuFor = 0;
  }

  function say(text, tone = 'good') {
    note = text;
    noteTone = tone;
    if (!shade.hidden) render();
  }

  function where(id) {
    return buddyWhere(online.get(id), (t) => streetLabel(engine, t));
  }

  function row(entry, { buttons = [], showWhere = true, isNew = false } = {}) {
    const on = online.has(entry.id);
    const menu = Boolean(engine.openPlayerMenu);
    const li = el('li', { 'data-buddy': String(entry.id), 'data-online': String(on), 'data-ctx': menu ? 'player' : false, 'data-name': entry.name });
    const what = menu
      ? el('button', { type: 'button', class: 'buddy-what', 'data-buddy-who': String(entry.id), 'aria-haspopup': 'menu', 'aria-keyshortcuts': 'Shift+F10' })
      : el('span', { class: 'buddy-what' });
    what.append(el('span', { class: 'buddy-dot', 'aria-hidden': 'true' }), document.createTextNode(entry.name));
    if (isNew) what.append(el('span', { class: 'buddy-new' }, 'new'));
    if (showWhere) what.append(el('small', { 'data-buddy-where': '' }, on ? `Online: ${where(entry.id)}` : BUDDY_TEXT.offlineWhere));
    li.append(what);
    for (const b of buttons) {
      const button = el('button', { type: 'button', class: 'buddy-act', [`data-buddy-${b.kind}`]: String(entry.id) }, b.label);
      button.disabled = busy;
      button.addEventListener('click', b.run);
      li.append(button);
    }
    return li;
  }

  function render() {
    publish();
    if (shade.hidden) return;
    panel.replaceChildren();
    const x = el('button', { type: 'button', class: 'buddies-close', 'aria-label': 'Close' }, '×');
    x.addEventListener('click', close);
    const n = list?.buddies.length || 0;
    panel.append(x, el('h2', { id: 'buddies-title' }, n ? `${BUDDY_TEXT.title} (${n})` : BUDDY_TEXT.title));
    if (!list) {
      panel.append(el('p', {}, loading ? 'Loading…' : BUDDY_TEXT.failed));
    } else {
      const mine = el('ul', { 'data-buddies-list': '' });
      // Online first (by name), then offline.
      const sorted = [...list.buddies].sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.name.localeCompare(b.name));
      // G328: Visit their home street (PlayerInfoDialog.as 155-160), when a feature can take you there.
      const visit = (b) => (engine.query?.('canVisitHomes', engine) ? [{ kind: 'visit', label: 'Visit', run: () => { close(); engine.query?.('visitHome', b.id, b.name, engine); } }] : []);
      // IM a buddy, online or not (player-im-feature; the source's buddy list opened the player menu with IM, ContactElement.as:270).
      const im = (b) => (engine.query?.('imReady', engine) ? [{ kind: 'im', label: 'IM', run: () => { close(); engine.query?.('imOpen', b.id, b.name, engine); } }] : []);
      for (const b of sorted) mine.append(row(b, { buttons: [...im(b), ...visit(b), { kind: 'remove', label: 'Remove', run: () => confirmRemove(b) }] }));
      panel.append(sorted.length ? mine : el('p', { class: 'buddies-none' }, BUDDY_TEXT.empty));
      const back = addedYouOnly(list);
      if (back.length) {
        panel.append(el('h3', {}, 'Added you'));
        const ul = el('ul', { 'data-buddies-reverse': '' });
        for (const r of back) ul.append(row(r, { isNew: r.isNew, buttons: [{ kind: 'add', label: 'Add back', run: () => add(r) }, { kind: 'ignore', label: BUDDY_TEXT.ignoreVerb, run: () => confirmIgnore(r) }] }));
        panel.append(ul);
      }
      if (list.ignoring.length) {
        panel.append(el('h3', {}, 'Blocked'));
        const ul = el('ul', { 'data-buddies-ignoring': '' });
        for (const r of list.ignoring) ul.append(row(r, { showWhere: false, buttons: [{ kind: 'unignore', label: 'Un-block', run: () => confirmUnignore(r) }] }));
        panel.append(ul);
      }
    }
    const p = el('p', { class: 'buddies-note', role: 'status', 'aria-live': 'polite', 'data-tone': noteTone }, note);
    panel.append(p);
  }

  function publish() {
    engine.social?.refresh();
    engine.setData?.('buddiesCount', String(list?.buddies.length || 0));
    engine.setData?.('buddiesOnline', [...online.entries()].map(([id, p]) => `${p.name}@${p.street || 'secret'}`).join(','));
    engine.setData?.('buddiesIgnoring', (list?.ignoring || []).map((r) => r.id).join(','));
    engine.setData?.('buddiesLast', last);
    engine.setData?.('buddiesAsking', [...asking.keys()].join(','));
  }

  function notice(text, ms = 4200) {
    last = text;
    engine.toast?.(text, ms);
    engine.pushActivity?.(text);
    publish();
  }

  // —— The list and the watch ——
  function watch() {
    if (!list?.token || client.state !== 'online') return false;
    return client.send('buddies_watch', { token: list.token });
  }

  /** inc_buddies.js:196 and 276 achievements_set('player', 'buddies_count', n): the counter is the list's size. */
  function countBadges() {
    const n = list?.buddies.length || 0;
    if (n === lastCount) return;
    lastCount = n;
    engine.resetAchievementCounter?.(BUDDY_COUNTER);
    if (n > 0) engine.achievement?.(BUDDY_COUNTER, n);
  }

  function apply(answer) {
    list = normalizeList(answer);
    tokenAt = Date.now();
    // Someone you just blocked or stopped holding: drop them from the online map now; the server's status follows.
    for (const id of [...online.keys()]) if (!isBuddy(list, id) && !list.reverse.some((r) => r.id === id)) online.delete(id);
    for (const r of freshReverse(list, told)) {
      told.add(r.id);
      if (addedYouKind(list, r.id) === 'ask') askBack(r);
      else notice(BUDDY_TEXT.addedYou(r.name));
    }
    settleAsks();
    countBadges();
    watch();
    render();
    return list;
  }

  async function refresh() {
    if (loading) return loading;
    loading = (async () => {
      try {
        return apply(await account.buddies());
      } catch (err) {
        console.warn('[buddies]', err?.message || err);
        return null;
      } finally {
        loading = null;
        render();
      }
    })();
    render();
    return loading;
  }

  async function act(run, ok) {
    if (busy) return false;
    busy = true;
    render();
    let done;
    running = new Promise((resolve) => { done = resolve; });
    try {
      const answer = await run();
      apply(answer);
      ok?.(answer);
      return true;
    } catch (err) {
      say(err?.message || BUDDY_TEXT.failed, 'bad');
      engine.toast?.(err?.message || BUDDY_TEXT.failed, 3600);
      return false;
    } finally {
      busy = false;
      running = null;
      done();
      render();
    }
  }

  // —— "Add them back?" (adds made while you were away) ——
  function askBack(r) {
    if (asking.has(r.id)) return;
    last = BUDDY_TEXT.addedYouAsk(r.name);
    if (!engine.prompt) {
      notice(BUDDY_TEXT.addedYou(r.name));
      return;
    }
    const uid = engine.prompt({
      text: BUDDY_TEXT.addedYouAsk(r.name),
      choices: [{ label: BUDDY_TEXT.addBack, value: 'add' }, { label: BUDDY_TEXT.notNow, value: 'later' }],
      onChoice: (v) => {
        asking.delete(r.id);
        if (v === 'add' && !isBuddy(list, r.id) && !isIgnoring(list, r.id)) queueAdd({ id: r.id, name: r.name });
        publish();
      },
    });
    asking.set(r.id, uid || '');
    publish();
  }

  /** Prompts for someone you now hold, block, or who no longer holds you: taken away unanswered. */
  function settleAsks() {
    for (const [id, uid] of [...asking]) {
      if (isBuddy(list, id) || isIgnoring(list, id) || !list.reverse.some((r) => r.id === id)) {
        asking.delete(id);
        if (uid) engine.removePrompt?.(uid);
      }
    }
  }

  /** Add back from a prompt, after whatever add or remove is running (several prompts answered quickly). */
  function queueAdd(p) {
    addQueue = addQueue.then(async () => {
      while (running) await running;
      if (!isBuddy(list, p.id)) await add(p);
    });
    return addQueue;
  }

  function add(player) {
    return act(() => account.addBuddy(player.id), (answer) => {
      // The proof that you added them, for their "added you" if they are online.
      if (typeof answer?.told === 'string' && answer.told) client.send('buddy_tell', { token: answer.told });
      say(BUDDY_TEXT.added(player.name));
      engine.toast?.(BUDDY_TEXT.added(player.name), 3200);
    });
  }

  function remove(player) {
    return act(() => account.removeBuddy(player.id), () => {
      online.delete(player.id);
      say(BUDDY_TEXT.removed(player.name));
      engine.toast?.(BUDDY_TEXT.removed(player.name), 3200);
    });
  }

  function ignore(player) {
    return act(() => account.ignorePlayer(player.id), () => {
      online.delete(player.id);
      say(BUDDY_TEXT.blocked(player.name));
      engine.pushActivity?.(BUDDY_TEXT.blocked(player.name));
      engine.toast?.(BUDDY_TEXT.blocked(player.name), 3200);
    });
  }

  function unignore(player) {
    return act(() => account.unignorePlayer(player.id), () => {
      say(BUDDY_TEXT.unblocked(player.name));
      engine.pushActivity?.(BUDDY_TEXT.unblocked(player.name));
      engine.toast?.(BUDDY_TEXT.unblocked(player.name), 3200);
    });
  }

  function ask(text, yes) {
    if (!engine.prompt) return yes();
    engine.prompt({
      modal: true,
      text,
      choices: [{ label: BUDDY_TEXT.yes, value: true }, { label: BUDDY_TEXT.no, value: false }],
      onChoice: (v) => { if (v === true) yes(); },
    });
    return true;
  }
  const confirmRemove = (p) => ask(BUDDY_TEXT.removeConfirm(p.name), () => remove(p));
  const confirmIgnore = (p) => ask(BUDDY_TEXT.ignoreConfirm(p.name), () => ignore(p));
  const confirmUnignore = (p) => ask(BUDDY_TEXT.unignoreConfirm(p.name), () => unignore(p));

  // —— Messages ——
  client.on('hello', () => {
    // A new socket: send the list again (a fresh one when it is getting old).
    if (list?.token && Date.now() - tokenAt < WATCH_REFRESH_MS) watch();
    else refresh();
  });
  client.on('msg:buddies_status', (msg) => {
    applyStatus(online, msg);
    render();
  });
  for (const kind of ['buddy_online', 'buddy_offline', 'buddy_moved']) {
    client.on(`msg:${kind}`, (msg) => {
      const change = applyPresence(online, msg);
      if (!change) return;
      // Toasts for your own buddies; who only added you just updates the panel.
      if (isBuddy(list, change.id)) {
        if (change.kind === 'online') notice(BUDDY_TEXT.online(change.name), 3200);
        if (change.kind === 'offline') notice(BUDDY_TEXT.offline(change.name), 3200);
      }
      render();
    });
  }
  client.on('msg:buddy_added', (msg) => {
    const id = Number(msg.id) || 0;
    if (!id || isIgnoring(list, id)) return;
    told.add(id);
    notice(BUDDY_TEXT.addedYou(String(msg.name || 'A Glitch')));
    // Your reverse list changed: a fresh list and token, so you watch them too.
    refresh();
  });
  client.on('error', ({ code, message }) => {
    if (code !== 'buddies') return;
    console.warn('[buddies]', message);
    if (/expired/.test(message) && Date.now() - tokenAt > 5000) refresh();
  });
  const timer = setInterval(() => { if (client.state === 'online') refresh(); }, WATCH_REFRESH_MS);
  timer?.unref?.();

  refresh();

  return {
    client,
    get list() { return list; },
    online,
    refresh,
    add,
    remove,
    ignore,
    unignore,
    open,
    close,
    isIgnoring: (id) => isIgnoring(list, Number(id)),
    /**
     * The drawer's Buddies tab (js/ui/social-drawer.js): your buddies, online first,
     * each with where they are; who added you (newAdds: the ones the site marks new);
     * null until the list is in.
     */
    drawerView() {
      if (!list) return null;
      const here = String(engine.streetTsid || '');
      const canVisit = Boolean(engine.query?.('canVisitHomes', engine));
      const canIm = Boolean(engine.query?.('imReady', engine));
      const rows = [...list.buddies]
        .sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.name.localeCompare(b.name))
        .map((b) => {
          const p = online.get(b.id);
          const on = Boolean(p);
          const where = !on ? BUDDY_TEXT.offlineWhere : p.street && p.street === here ? `Here on ${streetLabel(engine, here)}` : `Online: ${buddyWhere(p, (t) => streetLabel(engine, t))}`;
          const actions = [
            ...(canIm ? [{ label: 'IM', run: () => engine.query?.('imOpen', b.id, b.name, engine) }] : []),
            ...(canVisit ? [{ label: 'Visit', run: () => engine.query?.('visitHome', b.id, b.name, engine) }] : []),
          ];
          return { id: b.id, name: b.name, online: on, where, actions };
        });
      const back = addedYouOnly(list);
      return {
        rows,
        empty: BUDDY_TEXT.empty,
        addedYou: back.map((r) => r.name),
        newAdds: back.filter((r) => r.isNew).map((r) => r.id),
        manage: () => open(),
      };
    },
    verbs(target) {
      return buddyVerbs(list, { id: target.playerId, name: target.label || target.name });
    },
    run(target, verbId) {
      const p = { id: target.playerId, name: target.label || target.name || 'them' };
      if (!list) {
        engine.toast?.(BUDDY_TEXT.failed, 2400);
        refresh();
        return true;
      }
      if (verbId === BUDDY_VERBS.add) add(p);
      else if (verbId === BUDDY_VERBS.remove) confirmRemove(p);
      else if (verbId === BUDDY_VERBS.ignore) confirmIgnore(p);
      else if (verbId === BUDDY_VERBS.unignore) confirmUnignore(p);
      else return false;
      return true;
    },
  };
}

let session = null;
let guard = false;

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client) return null;
  session = createSession(engine, client);
  globalThis.groddleBuddies = session;
  return session;
}

export const buddiesFeature = {
  id: BUDDIES_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine);
  },

  /** Another player's Glitch (pc_remote): its menu plus the buddy entries (main.js:3590-3646). */
  verbOverride(target, engine) {
    if (guard || !session || target?.classId !== 'pc_remote' || !target.playerId || engine?.mode !== 'multiplayer') return null;
    guard = true;
    let base;
    try {
      base = engine.targetVerbs?.(target) || [];
    } finally {
      guard = false;
    }
    return [...base.filter((v) => !VERB_IDS.has(v.id)), ...session.verbs(target)];
  },

  runVerbOverride(target, verbId) {
    if (!VERB_IDS.has(verbId) || !session || !target?.playerId) return null;
    return session.run(target, verbId);
  },

  /** G478 (player-mail-feature): your buddies' names, for the mail's To field (MailComposeUI.as:384-411). */
  buddyNames() {
    const list = session?.list;
    return list ? list.buddies.map((b) => ({ id: b.id, name: b.name })) : null;
  },

  /**
   * realtime-feature, before it shows another player's chat line or emote:
   * true hides it (you block them).
   */
  realtimeHidden(id) {
    return session?.isIgnoring(id) ? true : null;
  },
};
