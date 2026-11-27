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
 * [data-reports-tab-empty]; #744: [data-reports-older] (Older reports, after the list while the site has more); #225: [data-reports-replied] (Has a reply, js/reports.js showsReplied) on a row;
 * #585: #reports-extensions [data-reports-extensions] (Browser extensions you use, optional; sent as context.extensions).
 * Read by the team (Austin 2026-11-12): [data-reports-read] in a row's line and, in a thread,
 * [data-reports-thread-read] under the newest message (js/reports.js readByTeamWords; datetime on both).
 *
 * Ticket 115 (Friendly, 2026-11-06): the list has tabs, All and each status with how many it holds,
 * and a red count on a tab holding a reply you have not read. A real tablist: one tab in the Tab
 * order, the arrow keys, Home and End move between them (and show them). The list itself is in the
 * site's order (js/reports.js sortReports): unread first, then answered, open, working, closed.
 *
 * #744 (a player with 234 reports saw 200 and thought the rest were deleted): the site sends the
 * list a page at a time (GET tickets?offset=, TicketStore::LIST_MAX each, the same order) and says
 * whether more exist. Older reports at the end of the list loads the next page and adds it after the
 * rows here; a refresh asks again for as many rows as were loaded, so the older ones stay.
 *
 * G791 (#216, #281: a bug gone before the report window opened): a reply can carry a picture,
 * one taken on purpose. Take a picture (under the reply box) hands over to the feature's
 * takePicture(): this window closes, the player shows the problem and takes the picture, and
 * the window comes back where it was with the picture held (hold()); Shift+R in the game holds
 * one without the window. The held picture goes with the next reply (shown small beside the
 * reply box, Remove drops it) or the next new report (in place of the picture drawn as the
 * form opens; Attach a picture unticked leaves it out). A refused picture never costs the
 * words: they go again without it. Each message shows its own picture under its words.
 * QA hooks: [data-reports-reply-picture] (the row), [data-reports-take] (Take a picture),
 * [data-reports-msg-picture] (a reply's picture in the thread), data-held on the panel.
 *
 * Several pictures, any kind (Austin 2026-11-15): a new report and a reply carry up to four
 * (js/report-pictures.js), a row of thumbnails under the box. Ways in: drop pictures anywhere on
 * this window (on the list it opens Write to us with them), Add pictures (the file picker, several
 * at once), paste one (Ctrl or Cmd+V), and Take a picture or Shift+R (one each). Each is read here
 * and made into the JPEG the site keeps, the file's own bytes never sent; one that cannot be read
 * is named in a plain line. A new report's own picture of the game is the first thumbnail and
 * counts as one of the four; its x unticks Attach a picture. Every thumbnail opens the pictures
 * over the game (js/ui/picture-lightbox.js gallery: Esc, the close button, Left and Right between
 * them) and has a remove button. The pictures wait together (the held list) for the next reply or
 * new report, as G791's one did. In a thread each message shows its own pictures as thumbnails,
 * opened the same way. A refused picture never costs the words: they go again without them.
 * QA hooks: [data-reports-tray=reply|new] (the thumbnails), [data-reports-thumb=<n>] (each,
 * data-lead on the game's own), [data-reports-thumb-remove], [data-reports-add] and
 * [data-reports-new-add] (Add pictures), [data-reports-new-take], #reports-file
 * [data-reports-file] (the picker), data-dropping on the panel while pictures are dragged over,
 * data-held (how many wait) and data-reading (how many are being read).
 *
 * G808, Circle the spot (#49, Austin 2026-11-22: option A): every picture about to go (the new
 * report's own and the waiting ones, in a new report or a reply) can carry up to 3 red rings, drawn
 * in its big view (js/ui/picture-lightbox.js with js/ui/picture-marks.js). Done draws them into a
 * JPEG the thumbnail shows ("2 marks") and Send sends; the picture itself is kept until Send, so
 * the rings can be changed again. The world picture and the one with the game's UI are framed
 * differently, so Include the game's UI changed after marking clears the rings, in a short line.
 * The picture with the UI is drawn before its big view opens (as Send does), so the rings land on
 * the picture that goes. QA hooks: [data-reports-thumb-marks] (the "2 marks" tag).
 *
 * REPORTSMENU (Austin 2026-11-12): each row has a menu (js/ui/report-row-menu.js): right-click, a
 * long press, or Shift+F10 or the Menu key on a focused row; Open, Add a message (Reopen when
 * closed), Close report, Mark as read or unread, Copy link. Up and Down (Home, End) move between
 * the rows, Enter opens one. A redrawn list keeps the focused row focused.
 *
 * Reactions (Austin 2026-11-18, the remake's own as the chat's are): under each message of a thread
 * the chat's chips and its add button, drawn by the chat's own js/ui/reaction-strip.js (the same
 * look, keys and picker, the picker inside this window so it stays over it): a chip puts yours on or
 * takes it off, its tip says who ("Heart: You and Austin"), the add button opens the set. The site
 * answers the message's reactions (api.react, src/TicketReactions.php); no email, the report's
 * status and news stay as they were. A site from before reactions sends none, and no button shows.
 * QA hooks: [data-reports-msg-react=<message id>] (each message's row), with the strip's own
 * [data-react-add], [data-react-chip], [data-react-picker], [data-react-pick]; canvas data reportReact.
 */

import { REPORT_EXTENSIONS_MAX, REPORT_FILTER_MIN, REPORT_MAX, REPORT_TABS, REPORT_TEXT as T, STATUS_WORDS, canEditFirst, inTab, matchesReport, messagePictures, numberedLine, pictureRefused, pictureSrc, readByTeamAt, readByTeamWords, refusalWords, reportNumber, showsReplied, sortReports, tabCounts, tabLabel, unreadCount, whenWords, appendReports } from '../reports.js?v=3c805cc4';
import { createReactionUI } from './reaction-strip.js?v=3de815f3';
import { parseReportReactionKey, reactorOf, reportReactionKey, reportReactions } from '../report-reactions.js?v=69462240';
import { PICTURE_TEXT as P, REPORT_PICTURES, convertPicture, dragHasFiles, filesOf, refusalWords as pictureRefusal, roomFor, takeForRoom } from '../report-pictures.js?v=fe05b74d';
import { focusBack } from './focus-return.js?v=da190597';
import { appendLinkedText, bindChatLinks } from '../chat-links.js?v=b717fac7';
import { lightboxLink } from './picture-lightbox.js?v=709c5bd1';
import { MARK_TEXT, bakeMarks, createMarkBook } from './picture-marks.js?v=315bb1da';
import { REPORT_MENU_TEXT, bindReportRowMenu, copyText, reportLink } from './report-row-menu.js?v=bce12edc';

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

/** #585: the context with the player's optional extensions line (trimmed, cut), when they wrote one. */
export function withExtensions(ctx, typed) {
  const extensions = String(typed || '').replace(/\s+/g, ' ').trim().slice(0, REPORT_EXTENSIONS_MAX);
  return extensions ? { ...(ctx || {}), extensions } : ctx;
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
 *   toast?: (text: string, ms?: number) => void, opener?: () => HTMLElement|null, now?: () => number, pictureWait?: number,
 *   setData?: (k: string, v: string) => void, bake?: (pic: object, rings: object[]) => Promise<object|null> }} opts
 *   setData: the rows' menu's QA data (canvas data contextMenu, reportMenu). bake: G808's rings drawn into a picture (js/ui/picture-marks.js bakeMarks).
 */
export function mountReportsSheet({ doc = globalThis.document, host, api, context = () => ({}), capture = () => null, takePicture: takeOnPurpose = null, onState = () => {}, toast = () => {}, opener = () => null, now = () => Date.now(), pictureWait = PICTURE_WAIT_MS, uiIdle = UI_IDLE_MS, setData = () => {}, convert = (file) => convertPicture(file, { doc }), bake = (pic, rings) => bakeMarks(pic, rings, { doc }) } = {}) {
  let state = 'closed';
  let view = 'list';
  let tickets = [];
  // #744: whether the site has older reports than the pages here, how many rows its pages gave
  // (the next page's offset), and an Older reports load under way.
  let more = false;
  let fetched = 0;
  let olderBusy = false;
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
  // G791: the pictures taken on purpose, added, dropped or pasted ({ url, width, height }), waiting for
  // the next reply or new report (up to REPORT_PICTURES.max; a new report's own picture counts too).
  let held = [];
  // Pictures being read (js/report-pictures.js convertPicture), and the work Send waits for.
  let reading = 0;
  let readingJob = Promise.resolve();
  // G808: the rings on the pictures about to go, kept beside them (js/ui/picture-marks.js); a change redraws the thumbnails.
  const marks = createMarkBook({ bake, onChange: () => redrawKeepingFocus() });
  /** The thumbnails again (a picture's rings drawn in); a thumbnail that had the keys keeps them. */
  function redrawKeepingFocus() {
    const was = doc.activeElement;
    const li = was?.closest?.('[data-reports-thumb]');
    const n = li?.getAttribute?.('data-reports-thumb');
    const tray = li?.parentNode;
    const sel = was?.hasAttribute?.('data-reports-thumb-remove') ? '[data-reports-thumb-remove]' : 'a';
    if (view === 'new') drawPicture();
    else drawHeld();
    if (n && tray && was && !was.isConnected) tray.querySelector?.(`[data-reports-thumb="${n}"] ${sel}`)?.focus?.({ preventScroll: true });
  }

  // Reactions on the thread's messages: each message's list as the chips read it, by reaction key, and you among them.
  const reacted = new Map();
  let reactor = 0;
  const reactUI = createReactionUI({
    doc,
    win: doc.defaultView || globalThis,
    reactions: (rk) => reacted.get(rk) || [],
    me: () => reactor,
    host: () => panel,
    send: (rk, key, on) => sendReaction(rk, key, on),
  });

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
  // #744: the next page of the list, after it (shown while the site has more).
  const olderBtn = e('button', { type: 'button', class: 'reports-btn is-quiet reports-older', hidden: true, 'data-reports-older': '' }, T.older);
  olderBtn.addEventListener('click', () => loadOlder());
  tabPanel.append(filter, list, empty, noMatch, tabEmpty, olderBtn);
  listView.append(tabs, tabPanel);
  // A thread.
  const threadView = e('section', { class: 'reports-view reports-thread-view', 'data-reports-thread-view': '', hidden: true });
  const threadHead = e('div', { class: 'reports-thread-head' });
  const threadChip = e('span', { class: 'reports-chip', 'data-reports-thread-status': '' });
  const threadWhen = e('span', { class: 'reports-when' });
  threadHead.append(threadChip, threadWhen);
  const msgs = e('ol', { class: 'reports-messages', 'data-reports-messages': '', 'aria-label': 'Messages' });
  bindChatLinks(msgs, { doc });
  // Read by the team: under the newest message (yours) once an administrator has opened it.
  const threadRead = e('p', { class: 'reports-read-note', title: T.readByTeamHint, hidden: true, 'data-reports-thread-read': '' });
  const closedNote = e('p', { class: 'reports-closed-note', hidden: true }, T.closed);
  const replyLabel = e('label', { for: 'reports-reply-text', class: 'reports-label' }, T.replyLabel);
  const reply = e('textarea', { id: 'reports-reply-text', class: 'reports-text', maxlength: String(REPORT_MAX), rows: '3', 'data-reports-reply-text': '' });
  // G791: pictures with the reply: their thumbnails under the box, then Add pictures and Take a picture.
  const replyTray = e('ul', { class: 'reports-tray', 'aria-label': T.trayLabel, hidden: true, 'data-reports-tray': 'reply' });
  const replyPicRow = e('div', { class: 'reports-picture-row reports-reply-picture', 'data-reports-reply-picture': '' });
  const replyPicText = e('div', { class: 'reports-picture-text' });
  const takeActs = e('div', { class: 'reports-take-actions' });
  const addBtn = e('button', { type: 'button', class: 'reports-btn is-quiet', 'aria-describedby': 'reports-take-hint', 'data-reports-add': '' }, P.add);
  const takeBtn = e('button', { type: 'button', class: 'reports-btn is-quiet', 'aria-describedby': 'reports-take-hint', hidden: !takeOnPurpose, 'data-reports-take': '' }, T.take);
  takeActs.append(addBtn, takeBtn);
  const takeHint = e('p', { id: 'reports-take-hint', class: 'reports-hint' }, takeOnPurpose ? T.takeHint : P.addHint);
  replyPicText.append(takeActs, takeHint);
  replyPicRow.append(replyPicText);
  const threadActs = e('div', { class: 'reports-actions' });
  const closeTicket = e('button', { type: 'button', class: 'reports-btn is-quiet', 'data-reports-close-ticket': '' }, T.closeTicket);
  const sendReply = e('button', { type: 'button', class: 'reports-btn', 'data-reports-send-reply': '' }, T.replySend);
  threadActs.append(closeTicket, sendReply);
  threadView.append(threadHead, msgs, threadRead, closedNote, replyLabel, reply, replyTray, replyPicRow, threadActs);
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
  // 2026-11-15: the first thumbnail of the new report's pictures, its x unticks Attach a picture.
  const picPreview = e('a', { class: 'reports-picture-thumb', href: '#', target: '_blank', rel: 'noopener', 'aria-label': T.pictureOpen, title: T.pictureOpen, hidden: true, 'data-reports-picture-preview': '' });
  const picPreviewImg = e('img', { alt: T.pictureAlt });
  picPreview.append(picPreviewImg);
  const picRemove = e('button', { type: 'button', class: 'reports-thumb-remove', 'aria-label': P.remove(1), title: P.remove(1), 'data-reports-thumb-remove': '' }, '×');
  const leadThumb = e('li', { class: 'reports-thumb', 'data-reports-thumb': '1', 'data-lead': '' });
  // G808: "2 marks" on the thumbnail of a picture with rings.
  const leadTag = e('span', { class: 'reports-thumb-marks', hidden: true, 'data-reports-thumb-marks': '' });
  leadThumb.append(picPreview, leadTag, picRemove);
  picRow.append(picText);
  const newTray = e('ul', { class: 'reports-tray', 'aria-label': T.trayLabel, hidden: true, 'data-reports-tray': 'new' });
  const newPicRow = e('div', { class: 'reports-picture-row reports-new-pictures' });
  const newPicText = e('div', { class: 'reports-picture-text' });
  const newTakeActs = e('div', { class: 'reports-take-actions' });
  const newAddBtn = e('button', { type: 'button', class: 'reports-btn is-quiet', 'aria-describedby': 'reports-new-pictures-hint', 'data-reports-new-add': '' }, P.add);
  const newTakeBtn = e('button', { type: 'button', class: 'reports-btn is-quiet', 'aria-describedby': 'reports-new-pictures-hint', hidden: !takeOnPurpose, 'data-reports-new-take': '' }, T.take);
  newTakeActs.append(newAddBtn, newTakeBtn);
  const newPicHint = e('p', { id: 'reports-new-pictures-hint', class: 'reports-hint' }, P.addHint);
  newPicText.append(newTakeActs, newPicHint);
  newPicRow.append(newPicText);
  // #585: Browser extensions you use (optional), one line; it stays for the next report (it is about the browser).
  const extRow = e('div', { class: 'reports-ext-row', 'data-reports-extensions-row': '' });
  const extLabel = e('label', { for: 'reports-extensions', class: 'reports-label' }, T.extensions);
  const extBox = e('input', { type: 'text', id: 'reports-extensions', class: 'reports-text reports-ext', maxlength: String(REPORT_EXTENSIONS_MAX), autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'reports-extensions-hint', 'data-reports-extensions': '' });
  const extHint = e('p', { id: 'reports-extensions-hint', class: 'reports-hint' }, T.extensionsHint);
  extRow.append(extLabel, extBox, extHint);
  const newActs = e('div', { class: 'reports-actions' });
  const sendBtn = e('button', { type: 'button', class: 'reports-btn', 'data-bug-report-send': '' }, T.send);
  newActs.append(sendBtn);
  newView.append(newTitle, label, text, picRow, newTray, newPicRow, extRow, newActs);
  // Add pictures: the browser's file picker, several at once (any image; js/report-pictures.js reads each).
  const fileInput = e('input', { type: 'file', id: 'reports-file', class: 'reports-file', accept: REPORT_PICTURES.accept, multiple: true, tabindex: '-1', 'aria-hidden': 'true', 'data-reports-file': '' });
  body.append(listView, threadView, newView);

  const foot = e('div', { class: 'reports-foot ui-sheet-foot' });
  const status = e('p', { class: 'panel-meta reports-status', 'aria-live': 'polite', 'data-bug-report-status': '' });
  const esc = e('span', { class: 'ui-sheet-esc' });
  esc.append(e('span', { class: 'kcap' }, 'Esc'), doc.createTextNode(' close'));
  foot.append(status, esc);
  card.append(head, body, foot);
  panel.append(card, fileInput);
  host.append(panel);

  function publish() {
    panel.dataset.reportsView = view;
    onState({ state, view, unread, ticket: ticket?.id || 0, last, held: held.length > 0 });
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
    if (q || tab !== 'all') return T.filterMeta(shownTickets().length, tickets.length);
    return more ? T.metaMore(tickets.length) : T.meta(tickets.length);
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
    // REPORTSMENU: the row with focus keeps it through the redraw (an action from its menu, a refresh).
    const focusedLi = doc.activeElement?.closest?.('.reports-row');
    const focusedId = Number(focusedLi?.dataset?.ticket) || 0;
    const focusedAt = focusedId ? [...list.children].indexOf(focusedLi) : -1;
    noMatch.hidden = !(q && tickets.length && !shown.length);
    tabEmpty.hidden = !(!q && tickets.length && !shown.length);
    drawTabs();
    list.replaceChildren(...shown.map((t) => {
      const li = e('li', { class: 'reports-row', 'data-ticket': t.id, 'data-unread': t.unread ? '1' : null });
      const replied = showsReplied(t);
      const read = readByTeamWords(t, now());
      const btn = e('button', { type: 'button', class: 'reports-row-btn', 'aria-haspopup': 'menu', 'aria-keyshortcuts': 'Shift+F10', 'aria-label': `${t.subject}, ${reportNumber(t) ? `${reportNumber(t)}, ` : ''}${STATUS_WORDS[t.status] || t.status}${replied ? `, ${T.replied}` : ''}${read ? `, ${read}` : ''}${t.unread ? `, ${T.unreadDot}` : ''}` });
      const top = e('span', { class: 'reports-row-top' });
      if (t.unread) top.append(e('span', { class: 'reports-dot', title: T.unreadDot, 'aria-hidden': 'true' }));
      top.append(e('span', { class: 'reports-subject' }, t.subject || T.sheet));
      const c = e('span');
      chip(c, t.status);
      // #225: an administrator replied to it, even if it has closed since.
      if (replied) top.append(e('span', { class: 'reports-replied', 'data-reports-replied': '', title: T.repliedHint, 'aria-hidden': 'true' }, T.replied));
      top.append(c);
      // #261: the report's number first, so a player can refer to it.
      const line = e('span', { class: 'reports-line' }, numberedLine(t, now()));
      // Read by the team, quiet after the line (only while you wrote last: js/reports.js readByTeamAt).
      if (read) line.append(e('time', { class: 'reports-read', datetime: readByTeamAt(t), title: T.readByTeamHint, 'data-reports-read': '' }, read));
      btn.append(top, line);
      btn.addEventListener('click', () => openTicket(t.id));
      li.append(btn);
      return li;
    }));
    empty.hidden = tickets.length > 0 || loading;
    olderBtn.hidden = !more;
    olderBtn.disabled = olderBusy;
    olderBtn.textContent = olderBusy ? T.olderLoading : T.older;
    if (focusedId && list.contains?.(doc.activeElement) === false) {
      // Gone from this tab (closed under Open): the row now in its place, else the tab, else the title.
      const btns = list.querySelectorAll?.('.reports-row-btn') || [];
      const to = rowBtn(focusedId) || btns[Math.min(focusedAt, btns.length - 1)] || (tabs.hidden ? null : tabBtns.get(tab)) || title;
      to?.focus?.({ preventScroll: true });
    }
  }

  /** REPORTSMENU: a report's row button as drawn now, or null. */
  function rowBtn(id) {
    return list.querySelector?.(`[data-ticket="${Number(id)}"] .reports-row-btn`) || null;
  }

  function drawThread() {
    if (!ticket) return;
    reactUI.closePicker();
    reactor = reactorOf(messages) || reactor;
    title.textContent = ticket.subject || T.sheet;
    chip(threadChip, ticket.status);
    threadWhen.textContent = numberedLine(ticket, now());
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
      else {
        // Addresses in a message are links (a reply's game link, a player's picture link), drawn as chat
        // lines draw them (js/chat-links.js: http and https only, text nodes only; another site asks first).
        const words = e('p', { class: 'reports-msg-body' });
        appendLinkedText(words, m.body, { doc });
        li.append(words);
      }
      // Under its words, each message's pictures as thumbnails, opened over the game together: the
      // report's own picture first under the report itself, then the message's own (G791, up to four).
      // Over the game, not a new tab (Austin 2026-11-03). After a pointer open or close focus goes
      // to this window's title: the window stays open, so the keys stay in it.
      const own = messagePictures(m).map((p) => ({ pic: p, alt: i === 0 ? T.reportPictureAlt : T.replyPictureAlt, hook: 'data-reports-msg-picture' }));
      if (i === 0 && pictureSrc(picture)) own.unshift({ pic: picture, alt: T.pictureAlt, hook: 'data-reports-thread-picture' });
      if (own.length) {
        const gallery = own.map((x) => ({ src: pictureSrc(x.pic), width: Number(x.pic.width) || 0, height: Number(x.pic.height) || 0, alt: x.alt }));
        const row = e('div', { class: 'reports-msg-pictures', 'data-count': String(own.length) });
        own.forEach((x, n) => {
          const a = pictureLink(gallery[n].src, x.pic, x.alt, x.hook, gallery, n);
          if (x.hook === 'data-reports-thread-picture') picLink = a;
          row.append(a);
        });
        li.append(row);
      }
      // The chat's reactions under it (a site from before them sends none: no button).
      const rk = Array.isArray(m.reactions) ? reportReactionKey(ticket.id, m.id) : '';
      if (rk) {
        reacted.set(rk, reportReactions(m.reactions));
        const react = e('div', { class: 'reports-msg-react', 'data-reports-msg-react': String(m.id) });
        li.append(react);
        reactUI.decorate(react, { rk, mine: m.author !== 'admin', name: m.author === 'admin' ? T.admin : T.you });
      }
      return li;
    }));
    if (!pictureSrc(picture) || !msgs.children[0]) picLink = null;
    const read = readByTeamWords(ticket, now());
    threadRead.textContent = read;
    threadRead.hidden = !read;
    if (read) threadRead.setAttribute('data-at', readByTeamAt(ticket));
    closedNote.hidden = ticket.status !== 'closed';
    closeTicket.hidden = ticket.status === 'closed';
    drawHeld();
    // Open at the newest message's first line (a long reply reads from its start); the body is the one scroller.
    globalThis.requestAnimationFrame?.(() => {
      const last = msgs.lastElementChild;
      if (!last?.getBoundingClientRect) return;
      body.scrollTop = Math.max(0, body.scrollTop + last.getBoundingClientRect().top - body.getBoundingClientRect().top - 8);
    });
  }

  /**
   * A picture from the site as a link that opens it in this window's lightbox (the report's and each
   * message's); `gallery` (the message's pictures) and `n` its place, so the lightbox goes between them.
   */
  function pictureLink(src, pic, alt, hook, gallery = null, n = 0) {
    const many = Array.isArray(gallery) && gallery.length > 1;
    const words = many ? P.open(n + 1, gallery.length) : T.pictureOpen;
    const a = e('a', { class: 'reports-picture', href: src, target: '_blank', rel: 'noopener', 'aria-label': words, title: words, [hook]: '' });
    a.append(e('img', { src, alt, width: String(Number(pic?.width) || ''), height: String(Number(pic?.height) || ''), loading: 'lazy' }));
    lightboxLink(a, {
      doc,
      host: panel,
      width: pic?.width,
      height: pic?.height,
      alt,
      label: T.pictureLabel,
      gallery,
      index: n,
      opener: () => a,
      fallback: () => title,
      onOpen: (lb) => { lightbox = lb; },
      onClose: () => { lightbox = null; },
    });
    return a;
  }

  /** The new report's own picture of the game as its thumbnail shows it (drawPicture), while Attach a picture is ticked, or null. */
  function leadShot() {
    return view === 'new' && picBox.checked && leadPic?.url ? leadPic : null;
  }

  /** Whether the new report's own picture takes one of the four (ticked, and drawn or still drawing). */
  function leadCounts() {
    if (!picBox.checked) return false;
    const want = mode();
    return Boolean(shots[want] || shots.world || jobs[want] || jobs.world || queued.size);
  }

  /** How many more pictures the message being written can take. */
  function room() {
    return roomFor(held.length + reading + (view === 'new' && leadCounts() ? 1 : 0));
  }

  /** A tray's pictures for the lightbox, in order (the new report's own picture first). */
  function trayGallery(which) {
    const list = [];
    const lead = which === 'new' ? leadShot() : null;
    // G808: each picture with its rings to mark (the game's own only once it is the one that goes).
    if (lead) list.push({ src: previewHref(lead), width: lead.width || 0, height: lead.height || 0, alt: T.pictureAlt, mark: lead === shots[mode()] ? marks.holder(lead) : null });
    held.forEach((p, i) => list.push({ src: previewHref(p), width: p.width || 0, height: p.height || 0, alt: P.thumbAlt(i + 1 + (lead ? 1 : 0)), mark: marks.holder(p) }));
    return list;
  }

  /** One waiting picture's thumbnail: a link to the lightbox (the tray's pictures) and its remove button. */
  function heldThumb(pic, i, which, offset) {
    const n = i + 1 + offset;
    // G808: the thumbnail shows the picture with its rings drawn in.
    const href = previewHref(marks.shown(pic));
    const li = e('li', { class: 'reports-thumb', 'data-reports-thumb': String(n) });
    const a = e('a', { class: 'reports-picture-thumb', href, target: '_blank', rel: 'noopener', 'aria-label': P.open(n, held.length + offset), title: P.open(n, held.length + offset), 'data-reports-held-picture': '' });
    a.append(e('img', { src: href, alt: P.thumbAlt(n), width: String(pic.width || ''), height: String(pic.height || '') }));
    lightboxLink(a, {
      doc,
      host: panel,
      width: pic.width,
      height: pic.height,
      alt: P.thumbAlt(n),
      label: T.pictureLabel,
      gallery: () => trayGallery(which),
      index: () => Math.max(0, held.indexOf(pic)) + offset,
      fallback: () => (which === 'new' ? text : reply),
      onOpen: (lb) => { lightbox = lb; },
      onClose: () => { lightbox = null; },
    });
    const rings = marks.count(pic);
    if (rings) li.append(e('span', { class: 'reports-thumb-marks', 'data-reports-thumb-marks': '' }, MARK_TEXT.tag(rings)));
    const x = e('button', { type: 'button', class: 'reports-thumb-remove', 'aria-label': P.remove(n), title: P.remove(n), 'data-reports-thumb-remove': '' }, '×');
    x.addEventListener('click', () => {
      unhold(pic);
      // The next picture's remove button, else Add pictures: the keys stay where the player was.
      const tray = which === 'new' ? newTray : replyTray;
      const next = tray.children[Math.min(n - 1, tray.children.length - 1)];
      (next?.lastElementChild || (which === 'new' ? newAddBtn : addBtn)).focus?.();
    });
    li.append(a, x);
    return li;
  }

  /** G791: the waiting pictures as thumbnails under both boxes, and the buttons' state (the room left). */
  function drawHeld() {
    panel.dataset.held = String(held.length);
    panel.dataset.reading = String(reading);
    // A new report's own picture and four waiting ones: the four the player chose go (ticked off).
    if (view === 'new' && picBox.checked && held.length >= REPORT_PICTURES.max) {
      picBox.checked = false;
      drawPicture();
    }
    const left = room();
    const full = left === 0;
    for (const b of [addBtn, newAddBtn, takeBtn, newTakeBtn]) b.disabled = full || state === 'sending';
    takeBtn.textContent = held.length ? T.takeAgain : T.take;
    newTakeBtn.textContent = takeBtn.textContent;
    const hint = reading ? P.reading : full ? P.full : held.length ? T.takeReply : takeOnPurpose ? T.takeHint : P.addHint;
    takeHint.textContent = hint;
    newPicHint.textContent = reading ? P.reading : full ? P.full : P.addHint;
    replyTray.replaceChildren(...held.map((p, i) => heldThumb(p, i, 'reply', 0)));
    replyTray.hidden = held.length === 0;
    const lead = leadShot();
    const leadOn = Boolean(lead) && !picPreview.hidden;
    picRemove.setAttribute('aria-label', P.remove(1));
    // The game's own picture's thumbnail stays in the row (hidden while there is none), so its link keeps its place.
    leadThumb.hidden = !leadOn;
    newTray.replaceChildren(leadThumb, ...held.map((p, i) => heldThumb(p, i, 'new', leadOn ? 1 : 0)));
    newTray.hidden = !leadOn && held.length === 0;
  }

  /**
   * G791: keep a picture for the next reply or new report (one taken on purpose, or read from a
   * file); null lets them all go. True when it is kept (a JPEG data URL, and room for it).
   */
  function hold(pic) {
    if (pic === null || pic === undefined) {
      const was = held;
      held = [];
      for (const p of was) { forget(p); forgetMarks(p); }
      drawHeld();
      publish();
      return false;
    }
    const next = okShot(pic);
    if (next && held.includes(next)) return true;
    if (!next || held.length >= REPORT_PICTURES.max) return false;
    held = [...held, next];
    drawHeld();
    publish();
    return true;
  }

  /** One waiting picture let go (its thumbnail's x). */
  function unhold(pic) {
    if (!held.includes(pic)) return;
    held = held.filter((p) => p !== pic);
    forget(pic);
    forgetMarks(pic);
    drawHeld();
    publish();
  }

  /** G808: a picture's rings go with it, and the address of its marked copy. */
  function forgetMarks(pic) {
    const look = marks.shown(pic);
    if (look !== pic) forget(look);
    marks.drop(pic);
  }

  /** A picture's preview address goes with it. */
  function forget(pic) {
    const url = previewUrls.get(pic);
    previewUrls.delete(pic);
    if (url?.startsWith('blob:')) { try { globalThis.URL.revokeObjectURL(url); } catch { /* gone */ } }
  }

  /**
   * Files dropped, pasted or picked: each read into the report's JPEG (js/report-pictures.js), in
   * order, as many as there is room for; what was left out or could not be read is said plainly.
   */
  function addFiles(files) {
    const list = Array.from(files || []);
    if (!list.length || state === 'closed') return readingJob;
    if (view === 'list') open('new');
    if (state === 'sending') return readingJob;
    const { take, over } = takeForRoom(list, room());
    const notes = over ? [take.length ? P.leftOut(over) : P.full] : [];
    if (!take.length) { say(notes.join(' '), true); return readingJob; }
    reading += take.length;
    drawHeld();
    say(P.reading);
    const job = readingJob.then(async () => {
      for (const file of take) {
        try {
          const pic = await convert(file);
          if (!hold(pic)) notes.push(P.full);
        } catch (err) {
          notes.push(pictureRefusal(err, file));
        }
        reading -= 1;
        drawHeld();
      }
      publish();
      if (state !== 'closed') say(notes.join(' '), notes.length > 0);
    });
    readingJob = job.catch(() => {});
    return readingJob;
  }

  /** G791: Take a picture: this window closes, the feature takes the picture, and the window comes back where it was. */
  function startTake() {
    if (!takeOnPurpose || state !== 'open') return;
    // The words typed so far stay in their boxes (neither is cleared until it is sent).
    const back = view === 'thread' && ticket ? ticket.id : 0;
    close();
    const resume = (line = '') => {
      if (state !== 'closed') return;
      if (back) {
        open('list');
        openTicket(back).then(() => { if (line) say(line, true); });
      } else {
        // The new report as it was: its own picture of the game and the words stay.
        open('new', { keep: true });
        if (line) say(line, true);
      }
    };
    takeOnPurpose({
      done: (pic) => resume(!pic ? T.takeFailed : hold(pic) ? '' : P.full),
      cancel: () => resume(),
    });
  }

  /**
   * A chip or a pick: the site puts the reaction on (or takes it off) and answers the message's
   * reactions, drawn in place. True when it went (the strip's send).
   */
  function sendReaction(rk, key, on) {
    const at = parseReportReactionKey(rk);
    if (!at || !ticket || at.ticket !== ticket.id || typeof api.react !== 'function') return false;
    setData('reportReact', `${key}:${on ? 'on' : 'off'}:sending`);
    api.react(at.ticket, at.message, key, on).then((r) => {
      const m = messages.find((x) => x.id === at.message);
      if (m && ticket?.id === at.ticket) m.reactions = Array.isArray(r?.reactions) ? r.reactions : [];
      reactor = reactorOf([{ reactions: r?.reactions }]) || reactor;
      reacted.set(rk, reportReactions(r?.reactions));
      reactUI.update(rk);
      setData('reportReact', `${key}:${on ? 'on' : 'off'}:done`);
    }).catch((err) => {
      say(refusalWords(err, T.reactFailed), true);
      setData('reportReact', `${key}:${on ? 'on' : 'off'}:failed`);
    });
    return true;
  }

  function show(next) {
    if (next !== 'list') rowMenu.close();
    reactUI.closePicker();
    view = next;
    listView.hidden = view !== 'list';
    threadView.hidden = view !== 'thread';
    newView.hidden = view !== 'new';
    back.hidden = view === 'list';
    // G925 (#454): Write to us is the list's button; on a report's thread it squeezed the title (Back returns to it).
    newBtn.hidden = view !== 'list';
    if (view === 'list') title.textContent = T.sheet;
    if (view === 'new') title.textContent = T.newReport;
    drawHeld();
    publish();
  }

  async function refresh() {
    loading = tickets.length === 0;
    if (loading && view === 'list') say(T.loading);
    try {
      // #744: as many rows as Older reports had loaded come again, so they stay in the list.
      const keep = fetched;
      let r = await api.list();
      let rows = Array.isArray(r?.tickets) ? r.tickets : [];
      let got = rows.length;
      while (r?.more === true && got < keep) {
        r = await api.list(got);
        const page = Array.isArray(r?.tickets) ? r.tickets : [];
        if (!page.length) break;
        got += page.length;
        rows = appendReports(rows, page);
      }
      tickets = rows;
      fetched = got;
      more = r?.more === true && got > 0;
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

  /** #744: Older reports: the site's next page, added after the rows here; the focus goes to the first new row shown. */
  async function loadOlder() {
    if (olderBusy || !more) return tickets;
    olderBusy = true;
    const had = shownTickets().length;
    drawList();
    say(T.olderLoading);
    try {
      const r = await api.list(fetched);
      const page = Array.isArray(r?.tickets) ? r.tickets : [];
      fetched += page.length;
      tickets = appendReports(tickets, page);
      more = r?.more === true && page.length > 0;
      olderBusy = false;
      setUnread(unreadCount(tickets));
      drawList();
      if (view === 'list') say(listMeta());
      const next = shownTickets()[had];
      const to = (next && rowBtn(next.id)) || (more ? olderBtn : null) || (tabs.hidden ? null : tabBtns.get(tab)) || title;
      to?.focus?.({ preventScroll: true });
    } catch (err) {
      olderBusy = false;
      drawList();
      if (view === 'list') say(refusalWords(err, T.olderFailed), true);
      olderBtn.focus?.({ preventScroll: true });
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
  // The new report's own picture as its thumbnail shows it (the world one while the UI one is still to come).
  let leadPic = null;
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
  /** A report's preview addresses go with it (a new report, or one sent); the waiting pictures keep theirs. */
  function releasePreview() {
    const keep = new Map();
    // The waiting pictures keep theirs, and so do their marked copies (G808).
    const kept = new Set([...held, ...held.map((p) => marks.shown(p))]);
    for (const [pic, url] of previewUrls) {
      if (kept.has(pic)) keep.set(pic, url);
      else if (url.startsWith('blob:')) { try { globalThis.URL.revokeObjectURL(url); } catch { /* gone */ } }
    }
    previewUrls = keep;
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
    picPreviewImg.setAttribute('alt', T.pictureAlt);
    // Ticket 73: the world picture shows while the one with the UI is still to come, the hint beside it.
    const which = previewWhich({ attach: picBox.checked, want, has: { world: Boolean(shots.world?.url), ui: Boolean(shots.ui?.url) }, pending });
    const shown = which ? shots[which] : null;
    if (pending && picBox.checked) picHint.textContent = T.pictureDrawing;
    else picHint.textContent = has ? (wantUi ? T.pictureHintUi : T.pictureHint) : T.pictureNone;
    picPreview.hidden = !shown;
    leadPic = shown;
    // G808: the thumbnail shows the rings drawn in (the big view opens the picture itself, its rings over it).
    const rings = shown ? marks.count(shown) : 0;
    leadTag.hidden = !rings;
    leadTag.textContent = rings ? MARK_TEXT.tag(rings) : '';
    if (shown) {
      const href = previewHref(marks.shown(shown));
      picPreview.setAttribute('href', href);
      picPreview.dataset.which = which;
      picPreviewImg.setAttribute('src', href);
      picPreviewImg.setAttribute('width', String(shown.width || ''));
      picPreviewImg.setAttribute('height', String(shown.height || ''));
    }
    // The new report's pictures: its own first, then the waiting ones (2026-11-15).
    drawHeld();
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
    marks.keepOnly(held);
    releasePreview();
    shots = { ui: null, world: null };
    jobs = { ui: null, world: null };
    queued = new Set(['world', 'ui']);
    // The game's own picture is one of the four (2026-11-15): ticked while there is room beside the waiting ones.
    picBox.checked = held.length < REPORT_PICTURES.max;
    wantUi = true;
    uiBox.checked = picBox.checked;
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
    // G808: with its rings drawn in, once they are drawn.
    await marks.settled();
    if (shots[want]?.url) return marks.url(shots[want]);
    if (!shots.world && !jobs.world) await takePicture('world');
    else if (jobs.world) await jobs.world.catch(() => {});
    await marks.settled();
    return shots.world?.url ? marks.url(shots.world) : null;
  }

  function open(which = 'list', { keep = false } = {}) {
    closePicture();
    if (state === 'closed') {
      state = 'open';
      panel.hidden = false;
    }
    say('');
    if (which === 'new') {
      show('new');
      sendBtn.disabled = false;
      // Back from Take a picture: the form's own picture stays as it was (a new one only for a new form).
      if (keep && round > 0) { drawPicture(); idleUi(); } else newPictures();
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
    rowMenu.close();
    reactUI.closePicker();
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
    // Pictures still being read go too (2026-11-15): the game's own first, then the waiting ones.
    drawHeld();
    await readingJob;
    const own = await pictureToSend();
    const urls = [own, ...held.map((p) => marks.url(p))].filter(Boolean).slice(0, REPORT_PICTURES.max);
    const pic = urls.length > 1 ? urls : urls[0] || null;
    const ctx = withExtensions(context(), extBox.value);
    try {
      let r;
      let without = false;
      try {
        r = await api.create(words, ctx, pic);
      } catch (err) {
        // The site refused a picture, not the report: send the words without them.
        if (!pic || !pictureRefused(err)) throw err;
        r = await api.create(words, ctx);
        without = true;
      }
      const sentWords = without ? (urls.length > 1 ? P.sentWithout : T.sentNoPicture) : T.sent;
      // G791: the waiting pictures went with it (a refusal keeps them for another try).
      if (held.length && !without) hold(null);
      shot = null;
      round += 1;
      stopIdle();
      marks.keepOnly(held);
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
      drawHeld();
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
    drawHeld();
    try {
      // G791: the waiting pictures go with it (any still being read first); a refused picture never costs the words.
      await readingJob;
      await marks.settled();
      const urls = held.map((p) => marks.url(p)).slice(0, REPORT_PICTURES.max);
      const pic = urls.length > 1 ? urls : urls[0] || null;
      let r;
      let without = false;
      try {
        r = await api.reply(ticket.id, message.slice(0, REPORT_MAX), pic);
      } catch (err) {
        if (!pic || !pictureRefused(err)) throw err;
        r = await api.reply(ticket.id, message.slice(0, REPORT_MAX));
        without = true;
      }
      if (pic && !without) hold(null);
      reply.value = '';
      ticket = r.ticket;
      messages = r.messages || [];
      if ('editable' in (r || {})) editable = r.editable === true;
      const row = tickets.find((t) => t.id === ticket.id);
      if (row) Object.assign(row, ticket);
      state = 'open';
      drawThread();
      drawList();
      say(without ? (urls.length > 1 ? P.replyWithout : T.replySentNoPicture) : T.replySent);
      reply.focus();
    } catch (err) {
      state = 'open';
      say(refusalWords(err), true);
    } finally {
      sendReply.disabled = false;
      drawHeld();
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

  /** A ticket the site answered with, put in the list in its row's place. */
  function keepTicket(next) {
    if (!next?.id) return;
    const row = tickets.find((t) => t.id === next.id);
    if (row) Object.assign(row, next);
    if (ticket?.id === next.id) ticket = { ...ticket, ...next };
  }

  /** REPORTSMENU: the row menu's actions (js/ui/report-row-menu.js), on the report `t` as the list holds it. */
  async function rowAction(id, t) {
    const M = REPORT_MENU_TEXT;
    if (state !== 'open' || !t?.id) return;
    if (id === 'open') { openTicket(t.id); return; }
    if (id === 'reply' || id === 'reopen') {
      await openTicket(t.id);
      if (view !== 'thread' || ticket?.id !== t.id) return;
      // The body is the one scroller (ticket 21): after the thread's own scroll to the newest message,
      // it brings the reply box into sight.
      const raf = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 16));
      raf(() => setTimeout(() => {
        const r = reply.getBoundingClientRect?.();
        const b = body.getBoundingClientRect?.();
        if (r && b && r.bottom > b.bottom) body.scrollTop += r.bottom - b.bottom + 8;
        reply.focus({ preventScroll: true });
      }, 0));
      if (id === 'reopen') say(M.reopenHint);
      return;
    }
    if (id === 'copy') {
      const url = reportLink(t.id, doc.defaultView?.location || globalThis.location);
      if (url && (await copyText(url, doc))) say(M.copied);
      else say(M.copyFailed(url), true);
      return;
    }
    try {
      if (id === 'close') {
        const r = await api.close(t.id);
        keepTicket(r?.ticket);
        drawList();
        say(T.closedDone);
      } else if (id === 'read') {
        // Opening a report is what reads it (GET tickets/{id}); the thread itself is not shown.
        const r = await api.thread(t.id);
        keepTicket(r?.ticket || { ...t, unread: false });
        setUnread(unreadCount(tickets));
        drawList();
        say(M.readDone);
      } else if (id === 'unread') {
        const r = await api.markUnread(t.id);
        keepTicket(r?.ticket);
        setUnread(Number.isFinite(r?.unread) ? r.unread : unreadCount(tickets));
        drawList();
        say(M.unreadDone);
      }
    } catch (err) {
      say(refusalWords(err), true);
    }
  }

  const rowMenu = bindReportRowMenu({
    doc,
    host: panel,
    list,
    ticketOf: (id) => tickets.find((t) => t.id === id) || null,
    rowFor: (id) => rowBtn(id),
    onPick: (id, t) => rowAction(id, t),
    setData,
  });

  // REPORTSMENU: Up and Down (Home, End) go from row to row; Enter (a row is a button) opens it.
  list.addEventListener('keydown', (ev) => {
    const at = ev.target?.closest?.('.reports-row-btn');
    if (!at || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
    const btns = [...(list.querySelectorAll?.('.reports-row-btn') || [])];
    const i = btns.indexOf(at);
    if (i < 0) return;
    const next = { ArrowDown: Math.min(btns.length - 1, i + 1), ArrowUp: Math.max(0, i - 1), Home: 0, End: btns.length - 1 }[ev.key];
    if (next === undefined) return;
    ev.preventDefault();
    btns[next].focus({ preventScroll: false });
  });

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
  picBox.addEventListener('change', () => {
    // The game's own picture is one of the four: no room beside four waiting ones.
    if (picBox.checked && held.length + reading >= REPORT_PICTURES.max) { picBox.checked = false; say(P.full, true); }
    drawPicture();
    idleUi();
  });
  filter.addEventListener('input', () => { drawList(); if (view === 'list') say(listMeta()); });
  uiBox.addEventListener('change', () => {
    // G808 (Austin 2026-11-22): the world picture and the one with the UI are framed differently, so rings on either go, in a line.
    const hadUi = marks.count(shots.ui) > 0;
    const hadWorld = marks.count(shots.world) > 0;
    for (const pic of [shots.ui, shots.world]) if (pic) forgetMarks(pic);
    if (hadUi || hadWorld) say(MARK_TEXT.uiCleared);
    wantUi = uiBox.checked;
    // Ticked again with no picture with the UI yet: it waits for a pause in typing, as at the start (ticket 73).
    if (wantUi && !shots.ui && !jobs.ui) { queued.add('ui'); drawPicture(); idleUi(); }
    else if (!shots[mode()] && !jobs[mode()]) takePicture(mode());
    else drawPicture();
  });
  // Ticket 73: the preview opens over the game as a thread's picture does; after a pointer close the caret goes back to the box.
  // 2026-11-15: with the waiting pictures, the first of them.
  lightboxLink(picPreview, {
    doc,
    host: panel,
    alt: T.pictureAlt,
    label: T.pictureLabel,
    gallery: () => trayGallery('new'),
    index: 0,
    // G808: the picture with the UI still to come is drawn first (as Send does), so its rings land on the picture that goes.
    ready: () => (view === 'new' && picBox.checked && wantUi && !shots.ui && (jobs.ui || queued.has('ui')) ? takePicture('ui') : null),
    fallback: () => text,
    onOpen: (lb) => { lightbox = lb; },
    onClose: () => { lightbox = null; },
  });
  x.addEventListener('click', () => close());
  back.addEventListener('click', () => backToList());
  newBtn.addEventListener('click', () => open('new'));
  sendBtn.addEventListener('click', () => send());
  sendReply.addEventListener('click', () => sendTheReply());
  takeBtn.addEventListener('click', () => startTake());
  newTakeBtn.addEventListener('click', () => startTake());
  // The game's own picture's x: Attach a picture unticked (ticking it again brings it back).
  picRemove.addEventListener('click', () => {
    picBox.checked = false;
    drawPicture();
    // The next picture's x, else the Attach a picture box: the keys stay where the player was.
    ((held.length ? newTray.children[1]?.lastElementChild : null) || picBox).focus?.();
  });
  // Add pictures: the file picker (several at once); what it gives is read like a drop.
  for (const b of [addBtn, newAddBtn]) b.addEventListener('click', () => { if (room() > 0) fileInput.click?.(); });
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = '';
    addFiles(files);
  });
  // Pictures dropped anywhere on the window (on the list, Write to us opens with them), or pasted.
  let dragDepth = 0;
  const dropping = (on) => { if (on) panel.setAttribute('data-dropping', ''); else panel.removeAttribute('data-dropping'); };
  panel.addEventListener('dragenter', (ev) => {
    if (state !== 'open' || !dragHasFiles(ev.dataTransfer)) return;
    ev.preventDefault();
    dragDepth += 1;
    dropping(true);
  });
  panel.addEventListener('dragover', (ev) => {
    if (state !== 'open' || !dragHasFiles(ev.dataTransfer)) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = room() > 0 || view === 'list' ? 'copy' : 'none';
  });
  panel.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropping(false);
  });
  panel.addEventListener('drop', (ev) => {
    dragDepth = 0;
    dropping(false);
    if (state !== 'open' || !dragHasFiles(ev.dataTransfer)) return;
    ev.preventDefault();
    addFiles(filesOf(ev.dataTransfer));
  });
  // A picture dropped beside the window (the top bar) must not open in place of the game.
  for (const kind of ['dragover', 'drop']) {
    doc.defaultView?.addEventListener?.(kind, (ev) => { if (state !== 'closed' && dragHasFiles(ev.dataTransfer)) ev.preventDefault(); });
  }
  panel.addEventListener('paste', (ev) => {
    const files = filesOf(ev.clipboardData);
    if (state !== 'open' || !files.length) return;
    ev.preventDefault();
    addFiles(files);
  });
  closeTicket.addEventListener('click', () => closeTheTicket());

  drawHeld();
  publish();
  return {
    panel,
    open,
    close,
    send,
    openTicket: (id) => { open('list'); return openTicket(Number(id)); },
    refresh,
    /** #744: Older reports, as its button does. */
    loadOlder,
    /** #744: whether the site has older reports than the list holds. */
    get more() { return more; },
    setUnread,
    /** G791: keep a picture for the next reply or new report (null lets them all go); true when kept. */
    hold,
    /** G791: Take a picture, as the button under the reply box does. */
    take: () => startTake(),
    /** Files (a drop, a paste, the picker) read into waiting pictures; resolves once they are read. */
    addFiles,
    /** The first waiting picture, or null (G791's one). */
    get held() { return held[0] || null; },
    /** Every waiting picture, in order (up to four). */
    get pictures() { return held.slice(); },
    /** How many more the message being written can take. */
    get room() { return room(); },
    get state() { return state; },
    get view() { return view; },
    get unread() { return unread; },
    /** REPORTSMENU: a row's menu (QA): open(id, { at, keys }), close(), ticket(). */
    rowMenu,
    /** The picture's lightbox while it is open (js/ui/picture-lightbox.js), else null. */
    get lightbox() { return lightbox?.open ? lightbox : null; },
  };
}
