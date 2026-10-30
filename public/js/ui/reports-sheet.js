/**
 * TICKETS: the Reports sheet, the bug icon's window in multiplayer
 * (features/bug-report-feature.js mounts it). The shell's centred size
 * (js/ui/panel-shell.js, like Mail, the other inbox): it holds a text box, so
 * it is modal and its keys stay in it. Three views:
 * - list: your reports, newest news first, each with its status chip and a
 *   dot when an administrator replied since you last looked;
 * - thread: the messages oldest first, a reply box (a reply to a closed report
 *   opens it again) and Close report;
 * - new: the original's form (BootError.as 280-290), sent with what the game
 *   knew (the feature's context()).
 * Esc closes, Ctrl or Cmd+Enter sends, Back returns to the list.
 *
 * Classic restyles it in place as a 2012 window (css/classic.css, the same
 * ids and data hooks). Everything people wrote is set as text, never HTML.
 *
 * QA hooks (kept from the old form): #bug-report-panel, #bug-report-text
 * [data-bug-report-text], [data-bug-report-send], [data-bug-report-close],
 * [data-bug-report-status]; new: [data-reports-view] on the panel,
 * [data-reports-list] rows [data-ticket=<id>] with [data-unread],
 * [data-reports-messages], #reports-reply-text, [data-reports-send-reply],
 * [data-reports-close-ticket], [data-reports-new], [data-reports-back].
 */

import { REPORT_MAX, REPORT_TEXT as T, STATUS_WORDS, refusalWords, ticketLine, unreadCount, whenWords } from '../reports.js?v=g483-1';

function el(doc, tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  if (text) node.textContent = text;
  return node;
}

/**
 * @param {{ doc?: Document, host: HTMLElement, api: ReturnType<import('../reports.js?v=g483-1').createReportsApi>,
 *   context?: () => object, onState?: (s: { state: string, view: string, unread: number, ticket: number, last: string }) => void,
 *   toast?: (text: string, ms?: number) => void, opener?: () => HTMLElement|null, now?: () => number }} opts
 */
export function mountReportsSheet({ doc = globalThis.document, host, api, context = () => ({}), onState = () => {}, toast = () => {}, opener = () => null, now = () => Date.now() } = {}) {
  let state = 'closed';
  let view = 'list';
  let tickets = [];
  let unread = 0;
  let ticket = null;
  let messages = [];
  let last = '';
  let loading = false;

  const e = (tag, attrs, text) => el(doc, tag, attrs, text);
  const panel = e('div', { id: 'bug-report-panel', class: 'reports-panel ui-sheet ui-sheet-center', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bug-report-title', hidden: true, 'data-bug-report': '', 'data-reports-view': 'list' });
  const card = e('div', { class: 'reports-card ui-sheet-card' });
  const head = e('div', { class: 'reports-head ui-sheet-head' });
  const back = e('button', { type: 'button', class: 'reports-back', 'data-reports-back': '', 'aria-label': T.back, title: T.back, hidden: true }, '‹');
  const icon = e('img', { class: 'ui-sheet-icon', src: 'assets/ui/bug_icon.png', alt: '', width: '23', height: '20' });
  const title = e('h2', { id: 'bug-report-title', class: 'ui-sheet-title', tabindex: '-1' }, T.sheet);
  const newBtn = e('button', { type: 'button', class: 'reports-new', 'data-reports-new': '' }, T.newReport);
  const x = e('button', { type: 'button', class: 'verb-menu-x ui-sheet-x', 'data-bug-report-close': '', 'aria-label': `${T.close} ${T.sheet} (Esc)` }, '×');
  head.append(back, icon, title, newBtn, x);

  const body = e('div', { class: 'reports-body ui-sheet-body' });
  // The list.
  const listView = e('section', { class: 'reports-view reports-list-view', 'data-reports-list-view': '', 'aria-label': T.sheet });
  const list = e('ul', { class: 'reports-list', 'data-reports-list': '' });
  const empty = e('p', { class: 'reports-empty', 'data-reports-empty': '', hidden: true }, T.none);
  listView.append(list, empty);
  // A thread.
  const threadView = e('section', { class: 'reports-view reports-thread-view', 'data-reports-thread-view': '', hidden: true });
  const threadHead = e('div', { class: 'reports-thread-head' });
  const threadChip = e('span', { class: 'reports-chip', 'data-reports-thread-status': '' });
  const threadWhen = e('span', { class: 'reports-when' });
  threadHead.append(threadChip, threadWhen);
  const msgs = e('ol', { class: 'reports-messages', 'data-reports-messages': '', 'aria-label': 'Messages' });
  const closedNote = e('p', { class: 'reports-closed-note', hidden: true }, T.closed);
  const replyLabel = e('label', { for: 'reports-reply-text', class: 'reports-label' }, T.replyLabel);
  const reply = e('textarea', { id: 'reports-reply-text', class: 'reports-text', maxlength: String(REPORT_MAX), rows: '3', 'data-reports-reply-text': '' });
  const threadActs = e('div', { class: 'reports-actions' });
  const closeTicket = e('button', { type: 'button', class: 'reports-btn is-quiet', 'data-reports-close-ticket': '' }, T.closeTicket);
  const sendReply = e('button', { type: 'button', class: 'reports-btn', 'data-reports-send-reply': '' }, T.replySend);
  threadActs.append(closeTicket, sendReply);
  threadView.append(threadHead, msgs, closedNote, replyLabel, reply, threadActs);
  // A new report: the original's form.
  const newView = e('section', { class: 'reports-view reports-new-view', 'data-reports-new-view': '', hidden: true });
  const newTitle = e('p', { class: 'reports-new-title' }, T.title);
  const label = e('label', { for: 'bug-report-text', class: 'reports-label' }, T.label);
  const text = e('textarea', { id: 'bug-report-text', class: 'reports-text', maxlength: String(REPORT_MAX), rows: '6', 'data-bug-report-text': '' });
  const newActs = e('div', { class: 'reports-actions' });
  const sendBtn = e('button', { type: 'button', class: 'reports-btn', 'data-bug-report-send': '' }, T.send);
  newActs.append(sendBtn);
  newView.append(newTitle, label, text, newActs);
  body.append(listView, threadView, newView);

  const foot = e('div', { class: 'reports-foot ui-sheet-foot' });
  const status = e('p', { class: 'panel-meta reports-status', 'aria-live': 'polite', 'data-bug-report-status': '' });
  const esc = e('span', { class: 'ui-sheet-esc' });
  esc.append(e('span', { class: 'kcap' }, 'Esc'), doc.createTextNode(' close'));
  foot.append(status, esc);
  card.append(head, body, foot);
  panel.append(card);
  host.append(panel);

  function publish() {
    panel.dataset.reportsView = view;
    onState({ state, view, unread, ticket: ticket?.id || 0, last });
  }
  function say(line, error = false) {
    last = line || '';
    status.textContent = last;
    status.classList.toggle('is-error', Boolean(error));
    publish();
  }
  function setUnread(n) {
    unread = Math.max(0, Number(n) || 0);
    publish();
  }

  function chip(node, s) {
    node.className = `reports-chip is-${s}`;
    node.textContent = STATUS_WORDS[s] || s;
    node.dataset.status = s;
  }

  function drawList() {
    list.replaceChildren(...tickets.map((t) => {
      const li = e('li', { class: 'reports-row', 'data-ticket': t.id, 'data-unread': t.unread ? '1' : null });
      const btn = e('button', { type: 'button', class: 'reports-row-btn', 'aria-label': `${t.subject}, ${STATUS_WORDS[t.status] || t.status}${t.unread ? `, ${T.unreadDot}` : ''}` });
      const top = e('span', { class: 'reports-row-top' });
      if (t.unread) top.append(e('span', { class: 'reports-dot', title: T.unreadDot, 'aria-hidden': 'true' }));
      top.append(e('span', { class: 'reports-subject' }, t.subject || T.sheet));
      const c = e('span');
      chip(c, t.status);
      top.append(c);
      btn.append(top, e('span', { class: 'reports-line' }, ticketLine(t, now())));
      btn.addEventListener('click', () => openTicket(t.id));
      li.append(btn);
      return li;
    }));
    empty.hidden = tickets.length > 0 || loading;
  }

  function drawThread() {
    if (!ticket) return;
    title.textContent = ticket.subject || T.sheet;
    chip(threadChip, ticket.status);
    threadWhen.textContent = ticketLine(ticket, now());
    msgs.replaceChildren(...messages.map((m) => {
      const li = e('li', { class: `reports-msg is-${m.author === 'admin' ? 'admin' : 'player'}`, 'data-author': m.author });
      const who = e('p', { class: 'reports-msg-who' });
      who.append(e('b', {}, m.author === 'admin' ? T.admin : T.you), e('time', { datetime: m.at }, ` ${whenWords(m.at, now())}`));
      li.append(who, e('p', { class: 'reports-msg-body' }, m.body));
      return li;
    }));
    closedNote.hidden = ticket.status !== 'closed';
    closeTicket.hidden = ticket.status === 'closed';
    globalThis.requestAnimationFrame?.(() => { msgs.lastElementChild?.scrollIntoView?.({ block: 'nearest' }); });
  }

  function show(next) {
    view = next;
    listView.hidden = view !== 'list';
    threadView.hidden = view !== 'thread';
    newView.hidden = view !== 'new';
    back.hidden = view === 'list';
    newBtn.hidden = view === 'new';
    if (view === 'list') title.textContent = T.sheet;
    if (view === 'new') title.textContent = T.newReport;
    publish();
  }

  async function refresh() {
    loading = tickets.length === 0;
    if (loading && view === 'list') say(T.loading);
    try {
      const r = await api.list();
      tickets = Array.isArray(r?.tickets) ? r.tickets : [];
      loading = false;
      setUnread(unreadCount(tickets));
      drawList();
      if (view === 'list') say(T.meta(tickets.length));
    } catch (err) {
      loading = false;
      drawList();
      if (view === 'list') say(refusalWords(err, T.loadFailed), true);
    }
    return tickets;
  }

  async function openTicket(id) {
    show('thread');
    ticket = tickets.find((t) => t.id === id) || { id, status: 'open', subject: T.sheet };
    messages = [];
    drawThread();
    say(T.loading);
    try {
      const r = await api.thread(id);
      ticket = r.ticket;
      messages = r.messages || [];
      // Read now: its dot goes, and the badge with it.
      const row = tickets.find((t) => t.id === id);
      if (row) Object.assign(row, ticket);
      else tickets.unshift(ticket);
      setUnread(unreadCount(tickets));
      drawList();
      drawThread();
      say('');
      setTimeout(() => reply.focus(), 0);
    } catch (err) {
      say(refusalWords(err, T.loadFailed), true);
    }
  }

  function open(which = 'list') {
    if (state === 'closed') {
      state = 'open';
      panel.hidden = false;
    }
    say('');
    if (which === 'new') {
      show('new');
      sendBtn.disabled = false;
      setTimeout(() => text.focus(), 0);
    } else {
      show('list');
      drawList();
      setTimeout(() => title.focus({ preventScroll: true }), 0);
      refresh();
    }
    publish();
  }

  function close() {
    if (state === 'sending') return;
    state = 'closed';
    panel.hidden = true;
    publish();
    opener()?.focus?.();
  }

  function backToList() {
    if (state === 'sending') return;
    show('list');
    say(T.meta(tickets.length));
    drawList();
    const row = ticket ? list.querySelector(`[data-ticket="${ticket.id}"] button`) : null;
    (row || title).focus({ preventScroll: true });
  }

  async function send() {
    if (state !== 'open' || view !== 'new') return;
    const message = text.value.trim();
    if (!message) {
      say(T.empty, true);
      text.focus();
      return;
    }
    state = 'sending';
    sendBtn.disabled = true;
    say(T.sending);
    try {
      const r = await api.create(message.slice(0, REPORT_MAX), context());
      text.value = '';
      state = 'open';
      sendBtn.disabled = false;
      if (r?.ticket) tickets.unshift(r.ticket);
      drawList();
      show('list');
      say(T.sent);
      toast(T.sent, 3200);
      refresh().then(() => say(T.sent));
      const row = r?.ticket ? list.querySelector(`[data-ticket="${r.ticket.id}"] button`) : null;
      (row || title).focus({ preventScroll: true });
    } catch (err) {
      state = 'open';
      sendBtn.disabled = false;
      say(refusalWords(err), true);
    }
  }

  async function sendTheReply() {
    if (state !== 'open' || view !== 'thread' || !ticket) return;
    const message = reply.value.trim();
    if (!message) {
      say(T.replyEmpty, true);
      reply.focus();
      return;
    }
    state = 'sending';
    sendReply.disabled = true;
    say(T.sending);
    try {
      const r = await api.reply(ticket.id, message.slice(0, REPORT_MAX));
      reply.value = '';
      ticket = r.ticket;
      messages = r.messages || [];
      const row = tickets.find((t) => t.id === ticket.id);
      if (row) Object.assign(row, ticket);
      state = 'open';
      drawThread();
      drawList();
      say(T.replySent);
      reply.focus();
    } catch (err) {
      state = 'open';
      say(refusalWords(err), true);
    } finally {
      sendReply.disabled = false;
    }
  }

  async function closeTheTicket() {
    if (state !== 'open' || !ticket) return;
    try {
      const r = await api.close(ticket.id);
      ticket = r.ticket;
      messages = r.messages || messages;
      const row = tickets.find((t) => t.id === ticket.id);
      if (row) Object.assign(row, ticket);
      drawThread();
      drawList();
      say(T.closedDone);
      reply.focus();
    } catch (err) {
      say(refusalWords(err), true);
    }
  }

  // Typing here is not walking: keys stay in the sheet (as the old form's did).
  for (const kind of ['keydown', 'keyup', 'keypress']) {
    panel.addEventListener(kind, (ev) => {
      ev.stopPropagation();
      if (kind !== 'keydown') return;
      if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        if (view === 'new') send();
        else if (view === 'thread') sendTheReply();
      }
    });
  }
  panel.addEventListener('pointerdown', (ev) => { if (ev.target === panel) close(); });
  text.addEventListener('input', () => { if (status.classList.contains('is-error')) say(''); });
  reply.addEventListener('input', () => { if (status.classList.contains('is-error')) say(''); });
  x.addEventListener('click', () => close());
  back.addEventListener('click', () => backToList());
  newBtn.addEventListener('click', () => open('new'));
  sendBtn.addEventListener('click', () => send());
  sendReply.addEventListener('click', () => sendTheReply());
  closeTicket.addEventListener('click', () => closeTheTicket());

  publish();
  return {
    panel,
    open,
    close,
    send,
    openTicket: (id) => { open('list'); return openTicket(Number(id)); },
    refresh,
    setUnread,
    get state() { return state; },
    get view() { return view; },
    get unread() { return unread; },
  };
}
