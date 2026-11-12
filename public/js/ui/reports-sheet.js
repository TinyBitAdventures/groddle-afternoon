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
 *   knew (the feature's context()) and, with Attach a picture of the game
 *   ticked (the default), the picture the feature's capture() draws once the
 *   form is up, shown beside the box so you see what goes. Ticket 30: the box
 *   takes typing at once and both ticks work while a picture draws; Send waits
 *   for one still drawing at most PICTURE_WAIT_MS, then sends the world one.
 *   Ticket 73 (Safari froze typing while the picture with the UI was drawn):
 *   only the world picture is drawn as the form opens (a quick copy of the
 *   canvas, shown as soon as it exists); the one with the game's UI waits
 *   until the box has had no typing for UI_IDLE_MS, or Send (under Sending…),
 *   and uses the canvas as the form found it (the window is modal, so the
 *   windows under it are the same). The preview is the picture at its own
 *   shape, the world one until the UI one is ready, and opens over the game in
 *   the picture lightbox as a thread's picture does.
 *   A picture the site refuses never costs the report: it goes again without it.
 * A thread shows the report's picture under its first message; a click (or
 * Enter or Space on it) opens it full size over the game, in this window's
 * picture lightbox (js/ui/picture-lightbox.js, Austin 2026-11-03: not a new
 * browser tab; Esc closes the picture only, and Cmd or a middle click still
 * open a tab). Ticket 49: Working on it has its own chip, and
 * your report's first message has Edit until an administrator has read it
 * (the thread's editable): the words open in a box in place, Save sends them
 * (the same limit as a new report), Cancel puts them back. Once it is read
 * the site refuses (409) and Edit goes; a changed message says edited.
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
 * [data-reports-close-ticket], [data-reports-new], [data-reports-back],
 * #reports-picture [data-reports-picture] (the checkbox), #reports-picture-ui
 * [data-reports-picture-ui] (Include the game's UI: the feature's capture({ ui })),
 * [data-reports-picture-preview] (a link with the picture's img, data-which=world|ui), [data-reports-thread-picture]; ticket 49:
 * [data-reports-edit] (Edit), #reports-edit-text [data-reports-edit-text],
 * [data-reports-edit-save], [data-reports-edit-cancel], [data-edited] on a changed message; ticket 58:
 * #reports-filter [data-reports-filter] (the search box, shown from REPORT_FILTER_MIN reports), [data-reports-no-match];
 * ticket 115: [data-reports-tabs] (role tablist) with tabs #reports-tab-<all|open|answered|working|closed>
 * [data-reports-tab=<tab>] carrying data-count and data-unread, #reports-tabpanel [data-reports-tabpanel],
 * [data-reports-tab-empty]; #225: [data-reports-replied] (Has a reply, js/reports.js showsReplied) on a row.
 *
 * Ticket 115 (Friendly, 2026-11-06): the list has tabs, All and each status with how many it holds,
 * and a red count on a tab holding a reply you have not read. A real tablist: one tab in the Tab
 * order, the arrow keys, Home and End move between them (and show them). The list itself is in the
 * site's order (js/reports.js sortReports): unread first, then answered, open, working, closed.
 */

import { REPORT_FILTER_MIN, REPORT_MAX, REPORT_TABS, REPORT_TEXT as T, STATUS_WORDS, canEditFirst, inTab, matchesReport, pictureRefused, pictureSrc, refusalWords, showsReplied, sortReports, tabCounts, tabLabel, ticketLine, unreadCount, whenWords } from '../reports.js?v=0985b56d';
import { focusBack } from './focus-return.js?v=da190597';
import { lightboxLink } from './picture-lightbox.js?v=0d2814c8';

/** How long Send waits for a picture still drawing before it sends the world-only one (ms). */
export const PICTURE_WAIT_MS = 6000;

/** Ticket 73: the picture with the game's UI is drawn once the box has had no typing this long (ms), or at Send. */
export const UI_IDLE_MS = 1500;

/**
 * PURE: what a new report's preview shows: the chosen picture, or the world one while the
 * chosen one (with the UI) is still to come. 'world', 'ui' or '' (nothing to show).
 */
export function previewWhich({ attach = true, want = 'ui', has = {}, pending = false } = {}) {
  if (!attach) return '';
  if (has[want]) return want;
  return want === 'ui' && pending && has.world ? 'world' : '';
}

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
 * @param {{ doc?: Document, host: HTMLElement, api: ReturnType<import('../reports.js').createReportsApi>,
 *   context?: () => object, capture?: () => ({ url: string, width: number, height: number }|null|Promise<object|null>), onState?: (s: { state: string, view: string, unread: number, ticket: number, last: string }) => void,
 *   toast?: (text: string, ms?: number) => void, opener?: () => HTMLElement|null, now?: () => number, pictureWait?: number }} opts
 */
export function mountReportsSheet({ doc = globalThis.document, host, api, context = () => ({}), capture = () => null, onState = () => {}, toast = () => {}, opener = () => null, now = () => Date.now(), pictureWait = PICTURE_WAIT_MS, uiIdle = UI_IDLE_MS } = {}) {
  let state = 'closed';
  let view = 'list';
  let tickets = [];
  // Ticket 115: the tab the list shows (js/reports.js REPORT_TABS).
  let tab = 'all';
  let unread = 0;
  let ticket = null;
  let messages = [];
  let last = '';
  let loading = false;
  // Ticket 49: whether the report's first message can still be changed, and whether its box is open.
  let editable = false;
  let editing = false;
  let shot = null;
  let picture = null;
  // The thread's picture link (a redraw makes a new one) and its lightbox while it is open.
  let picLink = null;
  let lightbox = null;
  // The two pictures a new report can carry (with the game's UI, the world only), drawn when first wanted.
  let shots = { ui: null, world: null };
  // Each picture's drawing while it is under way (ticket 30: drawn behind the form, never in its way).
  let jobs = { ui: null, world: null };
  // The pictures still to start once the form has painted.
  let queued = new Set();
  let round = 0;
  // Ticket 73: the wait for a pause in typing before the picture with the UI is drawn.
  let idleTimer = null;
  // The preview's addresses this report (blob: URLs of its pictures, so Open in a new tab works), by picture.
  let previewUrls = new Map();

  const e = (tag, attrs, text) => el(doc, tag, attrs, text);
  const panel = e('div', { id: 'bug-report-panel', class: 'reports-panel ui-sheet ui-sheet-center', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bug-report-title', hidden: true, 'data-bug-report': '', 'data-reports-view': 'list' });
  const card = e('div', { class: 'reports-card ui-sheet-card' });
  const head = e('div', { class: 'reports-head ui-sheet-head' });
  const back = e('button', { type: 'button', class: 'reports-back', 'data-reports-back': '', 'aria-label': T.back, title: T.back, hidden: true }, '‹');
  const icon = e('img', { class: 'ui-sheet-icon', src: 'assets/ui/bug_icon.webp', alt: '', width: '23', height: '20' });
  const title = e('h2', { id: 'bug-report-title', class: 'ui-sheet-title', tabindex: '-1' }, T.sheet);
  const newBtn = e('button', { type: 'button', class: 'reports-new', 'data-reports-new': '' }, T.newReport);
  const x = e('button', { type: 'button', class: 'verb-menu-x ui-sheet-x', 'data-bug-report-close': '', 'aria-label': `${T.close} ${T.sheet} (Esc)` }, '×');
  head.append(back, icon, title, newBtn, x);

  const body = e('div', { class: 'reports-body ui-sheet-body' });
  // The list.
  const listView = e('section', { class: 'reports-view reports-list-view', 'data-reports-list-view': '', 'aria-label': T.sheet });
  const list = e('ul', { class: 'reports-list', 'data-reports-list': '' });
  const empty = e('p', { class: 'reports-empty', 'data-reports-empty': '', hidden: true }, T.none);
  // Ticket 58: a search box over your reports once there are a few (their subjects, client side).
  const filter = e('input', { type: 'search', id: 'reports-filter', class: 'reports-text reports-filter', placeholder: T.filterPlaceholder, 'aria-label': T.filterLabel, autocomplete: 'off', spellcheck: 'false', hidden: true, 'data-reports-filter': '' });
  const noMatch = e('p', { class: 'reports-empty', 'data-reports-no-match': '', hidden: true }, T.filterNone);
  // Ticket 115: the status tabs over the list (filled by drawTabs), and the list as their panel.
  const tabs = e('div', { class: 'reports-tabs', role: 'tablist', 'aria-label': T.tabsLabel, hidden: true, 'data-reports-tabs': '' });
  const tabBtns = new Map();
  for (const id of REPORT_TABS) {
    const b = e('button', { type: 'button', id: `reports-tab-${id}`, class: 'reports-tab', role: 'tab', 'aria-controls': 'reports-tabpanel', 'aria-selected': id === tab ? 'true' : 'false', tabindex: id === tab ? '0' : '-1', 'data-reports-tab': id });
    b.addEventListener('click', () => pickTab(id));
    tabBtns.set(id, b);
    tabs.append(b);
  }
  const tabEmpty = e('p', { class: 'reports-empty', 'data-reports-tab-empty': '', hidden: true }, T.tabNone);
  const tabPanel = e('div', { id: 'reports-tabpanel', class: 'reports-tabpanel', role: 'tabpanel', 'aria-labelledby': `reports-tab-${tab}`, 'data-reports-tabpanel': '' });
  tabPanel.append(filter, list, empty, noMatch, tabEmpty);
  listView.append(tabs, tabPanel);
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
  // Editing the report's first message in place (ticket 49): one box, kept across redraws.
  const editLabel = e('label', { for: 'reports-edit-text', class: 'reports-label' }, T.editLabel);
  const editBox = e('textarea', { id: 'reports-edit-text', class: 'reports-text reports-edit-text', maxlength: String(REPORT_MAX), rows: '4', 'data-reports-edit-text': '' });
  const editActs = e('div', { class: 'reports-actions reports-edit-actions' });
  const editCancel = e('button', { type: 'button', class: 'reports-btn is-quiet', 'data-reports-edit-cancel': '' }, T.editCancel);
  const editSave = e('button', { type: 'button', class: 'reports-btn', 'data-reports-edit-save': '' }, T.editSave);
  editActs.append(editCancel, editSave);
  // A new report: the original's form.
  const newView = e('section', { class: 'reports-view reports-new-view', 'data-reports-new-view': '', hidden: true });
  const newTitle = e('p', { class: 'reports-new-title' }, T.title);
  const label = e('label', { for: 'bug-report-text', class: 'reports-label' }, T.label);
  const text = e('textarea', { id: 'bug-report-text', class: 'reports-text', maxlength: String(REPORT_MAX), rows: '6', 'data-bug-report-text': '' });
  // Attach a picture of the game: ticked by default, the picture small beside it.
  const picRow = e('div', { class: 'reports-picture-row', 'data-reports-picture-row': '' });
  const picText = e('div', { class: 'reports-picture-text' });
  const picLabel = e('label', { class: 'reports-check', for: 'reports-picture' });
  const picBox = e('input', { type: 'checkbox', id: 'reports-picture', class: 'reports-checkbox', checked: true, 'aria-describedby': 'reports-picture-hint', 'data-reports-picture': '' });
  picBox.checked = true;
  picLabel.append(picBox, doc.createTextNode(` ${T.picture}`));
  const picHint = e('p', { id: 'reports-picture-hint', class: 'reports-hint' }, T.pictureHint);
  const uiLabel = e('label', { class: 'reports-check reports-check-sub', for: 'reports-picture-ui' });
  const uiBox = e('input', { type: 'checkbox', id: 'reports-picture-ui', class: 'reports-checkbox', checked: true, 'data-reports-picture-ui': '' });
  uiBox.checked = true;
  uiLabel.append(uiBox, doc.createTextNode(` ${T.pictureUi}`));
  picText.append(picLabel, uiLabel, picHint);
  // Ticket 73: the picture at its own shape, a link that opens it over the game (the lightbox).
  const picPreview = e('a', { class: 'reports-picture-thumb', href: '#', target: '_blank', rel: 'noopener', 'aria-label': T.pictureOpen, title: T.pictureOpen, hidden: true, 'data-reports-picture-preview': '' });
  const picPreviewImg = e('img', { alt: T.pictureAlt });
  picPreview.append(picPreviewImg);
  picRow.append(picText, picPreview);
  const newActs = e('div', { class: 'reports-actions' });
  const sendBtn = e('button', { type: 'button', class: 'reports-btn', 'data-bug-report-send': '' }, T.send);
  newActs.append(sendBtn);
  newView.append(newTitle, label, text, picRow, newActs);
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

  /** The reports the list shows: the tab's, matching the search, in the site's order. */
  function shownTickets() {
    const q = filter.hidden ? '' : filter.value.trim();
    return sortReports(tickets).filter((t) => inTab(t, tab) && matchesReport(t, q));
  }

  function listMeta() {
    const q = filter.hidden ? '' : filter.value.trim();
    return q || tab !== 'all' ? T.filterMeta(shownTickets().length, tickets.length) : T.meta(tickets.length);
  }

  /** Ticket 115: each tab's name, how many it holds and, in red, how many have a reply you have not read. */
  function drawTabs() {
    const counts = tabCounts(tickets);
    tabs.hidden = tickets.length === 0;
    for (const [id, b] of tabBtns) {
      const { count, unread: fresh } = counts[id];
      const on = id === tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.setAttribute('tabindex', on ? '0' : '-1');
      b.classList.toggle('is-on', on);
      b.dataset.count = String(count);
      b.dataset.unread = String(fresh);
      b.setAttribute('aria-label', [tabLabel(id), T.tabCount(count), fresh ? T.tabUnread(fresh) : ''].filter(Boolean).join(', '));
      const parts = [e('span', { class: 'reports-tab-name' }, tabLabel(id)), e('span', { class: 'reports-tab-count', 'aria-hidden': 'true' }, String(count))];
      if (fresh) parts.push(e('span', { class: 'reports-tab-dot', title: T.tabUnread(fresh), 'aria-hidden': 'true' }, String(fresh)));
      b.replaceChildren(...parts);
    }
    tabPanel.setAttribute('aria-labelledby', `reports-tab-${tab}`);
  }

  /** Show a tab's reports; from the keys, the focus goes with it. */
  function pickTab(id, focus = false) {
    if (!REPORT_TABS.includes(id)) return;
    tab = id;
    drawList();
    if (view === 'list') say(listMeta());
    if (focus) tabBtns.get(id)?.focus?.();
  }

  function drawList() {
    filter.hidden = tickets.length < REPORT_FILTER_MIN && !filter.value;
    const q = filter.hidden ? '' : filter.value.trim();
    const shown = shownTickets();
    noMatch.hidden = !(q && tickets.length && !shown.length);
    tabEmpty.hidden = !(!q && tickets.length && !shown.length);
    drawTabs();
    list.replaceChildren(...shown.map((t) => {
      const li = e('li', { class: 'reports-row', 'data-ticket': t.id, 'data-unread': t.unread ? '1' : null });
      const replied = showsReplied(t);
      const btn = e('button', { type: 'button', class: 'reports-row-btn', 'aria-label': `${t.subject}, ${STATUS_WORDS[t.status] || t.status}${replied ? `, ${T.replied}` : ''}${t.unread ? `, ${T.unreadDot}` : ''}` });
      const top = e('span', { class: 'reports-row-top' });
      if (t.unread) top.append(e('span', { class: 'reports-dot', title: T.unreadDot, 'aria-hidden': 'true' }));
      top.append(e('span', { class: 'reports-subject' }, t.subject || T.sheet));
      const c = e('span');
      chip(c, t.status);
      // #225: an administrator replied to it, even if it has closed since.
      if (replied) top.append(e('span', { class: 'reports-replied', 'data-reports-replied': '', title: T.repliedHint, 'aria-hidden': 'true' }, T.replied));
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
    const canEdit = canEditFirst({ editable, messages });
    if (!canEdit) editing = false;
    msgs.replaceChildren(...messages.map((m, i) => {
      const li = e('li', { class: `reports-msg is-${m.author === 'admin' ? 'admin' : 'player'}`, 'data-author': m.author, 'data-edited': m.edited ? '1' : null, 'data-editing': i === 0 && editing ? '1' : null });
      const who = e('p', { class: 'reports-msg-who' });
      who.append(e('b', {}, m.author === 'admin' ? T.admin : T.you), e('time', { datetime: m.at }, ` ${whenWords(m.at, now())}${m.edited ? ` · ${T.edited}` : ''}`));
      // Your report itself, not read yet: Edit (ticket 49).
      if (i === 0 && canEdit && !editing) {
        const edit = e('button', { type: 'button', class: 'reports-edit', 'data-reports-edit': '', title: T.editHint }, T.edit);
        edit.addEventListener('click', () => startEdit());
        who.append(edit);
      }
      li.append(who);
      if (i === 0 && editing) li.append(editLabel, editBox, editActs);
      else li.append(e('p', { class: 'reports-msg-body' }, m.body));
      return li;
    }));
    // The report's picture, under its first message (the report itself).
    const src = pictureSrc(picture);
    const first = msgs.children[0];
    if (src && first) {
      const a = e('a', { class: 'reports-picture', href: src, target: '_blank', rel: 'noopener', 'aria-label': T.pictureOpen, title: T.pictureOpen, 'data-reports-thread-picture': '' });
      a.append(e('img', { src, alt: T.pictureAlt, width: String(Number(picture.width) || ''), height: String(Number(picture.height) || ''), loading: 'lazy' }));
      // Over the game, not a new tab (Austin 2026-11-03). After a pointer open or close focus
      // goes to this window's title: the window stays open, so the keys stay in it.
      const { width, height } = picture;
      lightboxLink(a, {
        doc,
        host: panel,
        width,
        height,
        alt: T.pictureAlt,
        label: T.pictureLabel,
        opener: () => picLink,
        fallback: () => title,
        onOpen: (lb) => { lightbox = lb; },
        onClose: () => { lightbox = null; },
      });
      picLink = a;
      first.append(a);
    } else picLink = null;
    closedNote.hidden = ticket.status !== 'closed';
    closeTicket.hidden = ticket.status === 'closed';
    // Open at the newest message's first line (a long reply reads from its start); the body is the one scroller.
    globalThis.requestAnimationFrame?.(() => {
      const last = msgs.lastElementChild;
      if (!last?.getBoundingClientRect) return;
      body.scrollTop = Math.max(0, body.scrollTop + last.getBoundingClientRect().top - body.getBoundingClientRect().top - 8);
    });
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
      if (view === 'list') say(listMeta());
    } catch (err) {
      loading = false;
      drawList();
      if (view === 'list') say(refusalWords(err, T.loadFailed), true);
    }
    return tickets;
  }

  async function openTicket(id) {
    closePicture();
    show('thread');
    ticket = tickets.find((t) => t.id === id) || { id, status: 'open', subject: T.sheet };
    messages = [];
    picture = null;
    editable = false;
    editing = false;
    drawThread();
    say(T.loading);
    try {
      const r = await api.thread(id);
      ticket = r.ticket;
      messages = r.messages || [];
      picture = r.picture || null;
      editable = r.editable === true;
      // Read now: its dot goes, and the badge with it.
      const row = tickets.find((t) => t.id === id);
      if (row) Object.assign(row, ticket);
      else tickets.unshift(ticket);
      setUnread(unreadCount(tickets));
      drawList();
      drawThread();
      say('');
      // The caret waits in the reply box without scrolling past the newest message (ticket 21).
      setTimeout(() => reply.focus({ preventScroll: true }), 0);
    } catch (err) {
      say(refusalWords(err, T.loadFailed), true);
    }
  }

  const okShot = (x) => (x && typeof x.url === 'string' && x.url.startsWith('data:image/jpeg;base64,') ? x : null);
  // Ticket 58: Include the game's UI shows unticked (and greyed) while Attach a picture is
  // unticked; the choice is kept in wantUi and comes back when the picture is ticked again.
  let wantUi = true;
  const mode = () => (wantUi ? 'ui' : 'world');

  /** The preview's address for a picture: a blob: URL made once per picture (a data: URL cannot open in a tab), else its data URL. */
  function previewHref(pic) {
    if (previewUrls.has(pic)) return previewUrls.get(pic);
    let url = pic.url;
    try {
      const bin = globalThis.atob(pic.url.slice(pic.url.indexOf(',') + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      url = globalThis.URL.createObjectURL(new globalThis.Blob([bytes], { type: 'image/jpeg' }));
    } catch { url = pic.url; }
    previewUrls.set(pic, url);
    return url;
  }
  /** A report's preview addresses go with it (a new report, or one sent). */
  function releasePreview() {
    for (const url of previewUrls.values()) {
      if (url.startsWith('blob:')) { try { globalThis.URL.revokeObjectURL(url); } catch { /* gone */ } }
    }
    previewUrls = new Map();
  }

  /** The preview and the two boxes as the pictures stand. Both boxes stay usable while a picture draws. */
  function drawPicture() {
    const want = mode();
    shot = shots[want];
    const has = Boolean(shot?.url);
    const pending = Boolean(jobs[want]) || queued.has(want);
    const none = !shots.ui && !shots.world && !jobs.ui && !jobs.world && queued.size === 0;
    picBox.disabled = none;
    if (none) picBox.checked = false;
    uiBox.disabled = !picBox.checked;
    uiBox.checked = picBox.checked && wantUi;
    // Ticket 73: the world picture shows while the one with the UI is still to come, the hint beside it.
    const which = previewWhich({ attach: picBox.checked, want, has: { world: Boolean(shots.world?.url), ui: Boolean(shots.ui?.url) }, pending });
    const shown = which ? shots[which] : null;
    if (pending && picBox.checked) picHint.textContent = T.pictureDrawing;
    else picHint.textContent = has ? (wantUi ? T.pictureHintUi : T.pictureHint) : T.pictureNone;
    picPreview.hidden = !shown;
    if (shown) {
      const href = previewHref(shown);
      picPreview.setAttribute('href', href);
      picPreview.dataset.which = which;
      picPreviewImg.setAttribute('src', href);
      picPreviewImg.setAttribute('width', String(shown.width || ''));
      picPreviewImg.setAttribute('height', String(shown.height || ''));
    }
  }

  /** The next paint: a line just set ("Sending…", "Drawing the picture…") shows before a long drawing starts. */
  const painted = () => new Promise((r) => {
    const raf = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 16));
    raf(() => setTimeout(r, 0));
  });

  /** One picture of the game as it is now (the feature draws it; null when it cannot), in the background. */
  function takePicture(which) {
    if (jobs[which]) return jobs[which];
    queued.delete(which);
    if (which === 'ui') stopIdle();
    const mine = round;
    const job = (async () => {
      let s = null;
      if (which === 'ui') {
        // Ticket 73: the canvas as the world picture found it, so the world one comes first.
        if (!shots.world && (jobs.world || queued.has('world'))) await takePicture('world');
        if (mine !== round) return;
        await painted();
        if (mine !== round) return;
      }
      try { s = await capture({ ui: which === 'ui', world: which === 'ui' ? shots.world : null }); } catch { s = null; }
      if (mine !== round) return;
      shots[which] = okShot(s);
      // A UI picture that cannot be drawn (or came out blank) falls back to the world only.
      if (which === 'ui' && !shots.ui && wantUi) wantUi = false;
    })();
    jobs[which] = job;
    drawPicture();
    return job.finally(() => {
      if (jobs[which] === job) jobs[which] = null;
      drawPicture();
    });
  }

  function stopIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  }

  /** Ticket 73: the picture with the UI, once the box has had no typing for uiIdle ms (each key starts the wait again). */
  function idleUi() {
    stopIdle();
    if (state !== 'open' || view !== 'new' || !picBox.checked || !wantUi || !queued.has('ui') || jobs.ui || shots.ui) return;
    const mine = round;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (mine !== round || state !== 'open' || view !== 'new' || !picBox.checked || !wantUi || !queued.has('ui')) return;
      takePicture('ui');
    }, uiIdle);
  }

  /** A new report's pictures: the world at once (a quick copy of the canvas); the UI one after a pause in typing, or at Send. */
  function newPictures() {
    round += 1;
    stopIdle();
    releasePreview();
    shots = { ui: null, world: null };
    jobs = { ui: null, world: null };
    queued = new Set(['world', 'ui']);
    picBox.checked = true;
    wantUi = true;
    uiBox.checked = true;
    const mine = round;
    // After the form has painted and the box has the caret: typing never waits on a picture.
    const start = () => {
      if (mine !== round || state === 'closed' || view !== 'new') return;
      takePicture('world').then(() => {
        if (mine !== round) return;
        // No canvas to read: the picture with the UI (drawn over that canvas) cannot be drawn either.
        if (!shots.world) queued.delete('ui');
        if (state !== 'closed' && wantUi && queued.has('ui')) idleUi();
        else { queued.delete('ui'); drawPicture(); }
      });
    };
    drawPicture();
    picHint.textContent = T.pictureDrawing;
    const raf = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 16));
    raf(() => setTimeout(start, 50));
  }

  /** The picture that goes with Send: the chosen one (drawn now if it was still to come), waited on pictureWait ms at most, else the world. */
  async function pictureToSend() {
    stopIdle();
    if (!picBox.checked) return null;
    const want = mode();
    if (!shots[want] && !jobs[want]) takePicture(want);
    const job = jobs[want];
    if (job) await Promise.race([job.catch(() => {}), new Promise((r) => setTimeout(r, pictureWait))]);
    if (shots[want]?.url) return shots[want].url;
    if (!shots.world && !jobs.world) await takePicture('world');
    else if (jobs.world) await jobs.world.catch(() => {});
    return shots.world?.url || null;
  }

  function open(which = 'list') {
    closePicture();
    if (state === 'closed') {
      state = 'open';
      panel.hidden = false;
    }
    say('');
    if (which === 'new') {
      show('new');
      sendBtn.disabled = false;
      newPictures();
      setTimeout(() => text.focus(), 0);
    } else {
      show('list');
      drawList();
      setTimeout(() => title.focus({ preventScroll: true }), 0);
      refresh();
    }
    publish();
  }

  /** The picture's lightbox goes with whatever replaces the thread (no focus of its own). */
  function closePicture() {
    lightbox?.close({ focus: false });
    lightbox = null;
  }

  function close() {
    if (state === 'sending') return;
    closePicture();
    stopIdle();
    state = 'closed';
    panel.hidden = true;
    publish();
    // The Report a bug button after a keyboard open and close, the world after a click (focus-return.js).
    const back = opener();
    if (back) focusBack(back, { doc });
  }

  function backToList() {
    if (state === 'sending') return;
    closePicture();
    show('list');
    drawList();
    say(listMeta());
    // Opened straight on Write to us, the list was never fetched.
    if (!tickets.length) refresh();
    const row = ticket ? list.querySelector(`[data-ticket="${ticket.id}"] button`) : null;
    (row || (tabs.hidden ? null : tabBtns.get(tab)) || title).focus({ preventScroll: true });
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
    const words = message.slice(0, REPORT_MAX);
    const pic = await pictureToSend();
    try {
      let r;
      let without = false;
      try {
        r = await api.create(words, context(), pic);
      } catch (err) {
        // The site refused the picture, not the report: send the words without it.
        if (!pic || !pictureRefused(err)) throw err;
        r = await api.create(words, context());
        without = true;
      }
      const sentWords = without ? T.sentNoPicture : T.sent;
      shot = null;
      round += 1;
      stopIdle();
      releasePreview();
      shots = { ui: null, world: null };
      jobs = { ui: null, world: null };
      queued = new Set();
      text.value = '';
      state = 'open';
      sendBtn.disabled = false;
      if (r?.ticket) tickets.unshift(r.ticket);
      // The new report shows in the list whichever tab was open (ticket 115).
      if (r?.ticket && !inTab(r.ticket, tab)) tab = 'all';
      drawList();
      show('list');
      say(sentWords);
      toast(sentWords, 3200);
      refresh().then(() => say(sentWords));
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
      if ('editable' in (r || {})) editable = r.editable === true;
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
      if ('editable' in (r || {})) editable = r.editable === true;
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

  /** Edit: the report's words in a box in its place (ticket 49). */
  function startEdit() {
    if (state !== 'open' || view !== 'thread' || !canEditFirst({ editable, messages })) return;
    editing = true;
    editBox.value = String(messages[0]?.body || '');
    drawThread();
    say(T.editHint);
    setTimeout(() => editBox.focus(), 0);
  }

  function cancelEdit() {
    if (state === 'sending') return;
    editing = false;
    drawThread();
    say('');
    msgs.children[0]?.querySelector?.('[data-reports-edit]')?.focus?.();
  }

  async function saveEdit() {
    if (state !== 'open' || view !== 'thread' || !ticket || !editing) return;
    const message = editBox.value.trim();
    if (!message) {
      say(T.editEmpty, true);
      editBox.focus();
      return;
    }
    state = 'sending';
    editSave.disabled = true;
    say(T.editSaving);
    try {
      const r = await api.edit(ticket.id, message);
      ticket = r.ticket;
      messages = r.messages || messages;
      editable = r.editable === true;
      editing = false;
      const row = tickets.find((t) => t.id === ticket.id);
      if (row) Object.assign(row, ticket);
      state = 'open';
      drawThread();
      drawList();
      say(T.editDone);
      reply.focus({ preventScroll: true });
    } catch (err) {
      state = 'open';
      // Read meanwhile: the site says so in plain words, and Edit goes.
      if (err?.status === 409) {
        editable = false;
        editing = false;
        drawThread();
      }
      say(refusalWords(err), true);
    } finally {
      editSave.disabled = false;
    }
  }

  // Typing here is not walking: keys stay in the sheet (as the old form's did).
  for (const kind of ['keydown', 'keyup', 'keypress']) {
    panel.addEventListener(kind, (ev) => {
      ev.stopPropagation();
      if (kind !== 'keydown') return;
      // Esc in the edit box puts the words back; anywhere else it closes the sheet.
      if (ev.key === 'Escape') { ev.preventDefault(); if (editing && ev.target === editBox) cancelEdit(); else close(); }
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        if (view === 'new') send();
        else if (view === 'thread' && editing && ev.target === editBox) saveEdit();
        else if (view === 'thread') sendTheReply();
      }
    });
  }
  panel.addEventListener('pointerdown', (ev) => { if (ev.target === panel) close(); });
  // Ticket 115: the tabs' keys (a tablist's: Left and Right go round, Home and End to the ends).
  tabs.addEventListener('keydown', (ev) => {
    const i = REPORT_TABS.indexOf(tab);
    const n = REPORT_TABS.length;
    const next = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[ev.key];
    if (next === undefined) return;
    ev.preventDefault();
    pickTab(REPORT_TABS[next], true);
  });
  // Each key starts the wait for the picture with the UI again (ticket 73).
  text.addEventListener('input', () => { if (status.classList.contains('is-error')) say(''); idleUi(); });
  reply.addEventListener('input', () => { if (status.classList.contains('is-error')) say(''); });
  editBox.addEventListener('input', () => { if (status.classList.contains('is-error')) say(''); });
  editCancel.addEventListener('click', () => cancelEdit());
  editSave.addEventListener('click', () => saveEdit());
  picBox.addEventListener('change', () => { drawPicture(); idleUi(); });
  filter.addEventListener('input', () => { drawList(); if (view === 'list') say(listMeta()); });
  uiBox.addEventListener('change', () => {
    wantUi = uiBox.checked;
    // Ticked again with no picture with the UI yet: it waits for a pause in typing, as at the start (ticket 73).
    if (wantUi && !shots.ui && !jobs.ui) { queued.add('ui'); drawPicture(); idleUi(); }
    else if (!shots[mode()] && !jobs[mode()]) takePicture(mode());
    else drawPicture();
  });
  // Ticket 73: the preview opens over the game as a thread's picture does; after a pointer close the caret goes back to the box.
  lightboxLink(picPreview, {
    doc,
    host: panel,
    alt: T.pictureAlt,
    label: T.pictureLabel,
    fallback: () => text,
    onOpen: (lb) => { lightbox = lb; },
    onClose: () => { lightbox = null; },
  });
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
    /** The picture's lightbox while it is open (js/ui/picture-lightbox.js), else null. */
    get lightbox() { return lightbox?.open ? lightbox : null; },
  };
}
