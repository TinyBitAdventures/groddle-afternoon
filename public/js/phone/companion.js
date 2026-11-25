/**
 * The phone companion page (play/phone/, Austin 2026-10-31). Phones and
 * touch-only tablets land here from /play/online/ and /play/ (their
 * #phone-gate script), because the game is more than a phone tab holds. It
 * signs the player in with the game's own forms (js/account-forms.js, the
 * /play/online/ gate's flow: js/online-session.js quietSession, suspendedNow),
 * then shows four tabs over the routes the game already uses
 * (js/phone/companion-data.js): Reports (read, reply, close, write a new one
 * with a photo), Mail (read only), Friends (who is playing and where) and
 * Account (#636, js/phone/account-tab.js).
 * It never loads Pixi, game.js or the game's assets.
 *
 * Deep links the game's emails use keep working: #report=<id> opens that
 * report, #new the New player form, #verify=<token> and #reset=<key>&login=
 * finish a sign-up or a password reset.
 *
 * QA hooks: <main id="phone-app" data-phone="checking|signed-out|ready|...">,
 * [data-phone-tab=reports|mail|friends|account] with .pc-badge, panels
 * [data-phone-panel=...] with data-view, [data-phone-signout],
 * [data-phone-full], [data-ticket=<id>], [data-letter=<id>],
 * [data-friend=<id>], #pc-report-text, #pc-photo, #pc-reply-text, #pc-reply-photo.
 *
 * G791 (#216, #281): a reply takes a photo too (Add a photo under the reply box, the same
 * picker and size as a new report's), and each message shows the picture it carries.
 *
 * Several pictures (Austin 2026-11-15): a new report and a reply take up to four from the photo
 * picker (several at once, any picture the phone's browser opens, each made into the report's
 * JPEG by js/report-pictures.js), shown as thumbnails with an x each; a thumbnail, and each picture
 * in a thread, opens the pictures over the page (js/ui/picture-lightbox.js: swipe or the arrows
 * between them, the close button; loaded at the first tap, so the page stays small). QA hooks: [data-phone-photo-preview] (the thumbnails),
 * [data-phone-photo-thumb=<n>], [data-phone-photo-remove], [data-phone-message-picture].
 *
 * G808, Circle the spot (#49, Austin 2026-11-22): a photo about to go opens with the marking bar of
 * the shared lightbox (js/ui/picture-marks.js, loaded with it): up to 3 red rings, drawn into the
 * photo that is sent and shown on its thumbnail ("1 mark", [data-phone-photo-marks]).
 */

import { createMinnAccountCore } from '../minn-account-core.js?v=5baee954';
import { mountAccountForms, resetLinkFrom, verifyLinkFrom } from '../account-forms.js?v=683e1475';
import { gateFor, quietSession, suspendedNow } from '../online-session.js?v=6f1348c8';
import { REPORT_MAX, REPORT_TEXT, STATUS_WORDS, canEditFirst, createReportsApi, messagePictures, numberedLine, pictureRefused, pictureSrc, refusalWords, reportFromHash, reportNumber, unreadCount, whenWords } from '../reports.js?v=e861d5aa';
import { PICTURE_TEXT, REPORT_PICTURES, convertPicture, refusalWords as pictureRefusal, roomFor, takeForRoom } from '../report-pictures.js?v=84c52271';
import { DEVICE_KEY, PHONE_TEXT as T, PLAY_ONCE_HASH, PLAY_ONCE_KEY, POLL_MS, createPresenceApi, friendsView, fullGameHref, itemNamesFrom, itemWords, mailRows, mailboxFromSave, mergePlayerMail, phoneContext, phoneDevice, takenMailIds, unreadLetters } from './companion-data.js?v=464e4058';

const doc = globalThis.document;

function el(tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  if (text) node.textContent = text;
  return node;
}

/** G807: an iPhone or iPad (Mac with touch), or ?hstip=1. */
function mayShowHomeScreenTip() {
  const nav = globalThis.navigator || {};
  return /iPhone|iPad|iPod/.test(String(nav.userAgent || '')) || (/Mac/.test(String(nav.platform || '')) && nav.maxTouchPoints > 1) || /[?&]hstip=1(?:&|$)/.test(location.search);
}

function storeGet() {
  try { return localStorage.getItem(DEVICE_KEY) || ''; } catch { return ''; }
}

function storeSet(value) {
  try {
    if (value) localStorage.setItem(DEVICE_KEY, value);
    else localStorage.removeItem(DEVICE_KEY);
  } catch { /* private windows: this visit only */ }
}

/**
 * The way into the full game, at the top of the page (experimental phone play, 2026-11-12: players
 * missed it at the bottom), with the other choice beside it: stay for reports, mail and friends
 * (Austin 2026-11-13: both choices plain at a glance). On a phone, Play the game opens the game for
 * that one load (sessionStorage PLAY_ONCE_KEY, the gate removes it), so a reload comes back here.
 */
function mountPlay(host) {
  const play = el('section', { class: 'pc-card pc-play', 'aria-label': T.playTitle });
  play.append(el('h2', { class: 'pc-play-title' }, T.playTitle));
  const full = el('p', { class: 'pc-full' });
  // A phone no longer remembers the game (an older "full" is cleared); a touch tablet still does.
  if (phoneDevice() && storeGet() === 'full') storeSet('');
  if (storeGet() === 'full') {
    // Opened by hand on a tablet that chose the game: offer the way back.
    const back = el('button', { type: 'button', class: 'pc-linkish', 'data-phone-use-page': '' }, T.useThisPage);
    back.addEventListener('click', () => { storeSet(''); mountFull(full); });
    const go = el('a', { href: fullGameHref(location.search), class: 'pc-button', 'data-phone-full': '' }, T.full);
    const hint = el('span', { class: 'pc-hint' }, `${T.fullRemembered} `);
    hint.append(back);
    full.append(go, hint);
  } else {
    mountFull(full);
  }
  play.append(full, el('p', { class: 'pc-hint pc-stay' }, T.stayHere));
  host.append(play);
  // G807: the Add to Home Screen tip, loaded only on an iPhone or iPad (the page's size budget).
  if (mayShowHomeScreenTip()) {
    import('../home-screen-tip.js?v=f2287991').then(({ HOME_SCREEN_TIP_KEY, mountHomeScreenTip }) => {
      const store = { get: () => localStorage.getItem(HOME_SCREEN_TIP_KEY), set: (v) => localStorage.setItem(HOME_SCREEN_TIP_KEY, v) };
      mountHomeScreenTip(doc, { host: play, store });
    }).catch(() => {});
  }
}

/** The note under the panels: best on a computer, and the home page. */
function mountNote(host) {
  const note = el('aside', { class: 'pc-note', 'aria-label': 'About this page' });
  const p = el('p');
  p.append(el('strong', {}, T.computer), ` ${T.computerMore} `);
  p.append(el('a', { href: './' }, T.home));
  note.append(p);
  host.append(note);
}

/**
 * Play the game: this load only on a phone (the gate reads and removes PLAY_ONCE_KEY; with storage
 * blocked the link carries PLAY_ONCE_HASH instead), remembered on a touch tablet as before.
 */
function playOnce(a) {
  try {
    sessionStorage.setItem(PLAY_ONCE_KEY, '1');
  } catch {
    a.href = a.getAttribute('href').split('#')[0] + PLAY_ONCE_HASH;
  }
  if (!phoneDevice()) storeSet('full');
}

function mountFull(host) {
  const href = fullGameHref(location.search);
  const a = el('a', { href, class: 'pc-button', 'data-phone-full': '' }, T.full);
  a.addEventListener('click', () => playOnce(a));
  host.replaceChildren(a, el('span', { class: 'pc-hint' }, T.fullHint));
}

// —— the app ——

// Set by start(), on the page only (tests import this module without a page).
let app;
let gate;
let home;
let account;
// The ticket calls carry the session's nonce: made again each time the player signs in (showHome).
let reports;
let presence;

function start() {
  app = doc.getElementById('phone-app');
  gate = el('section', { class: 'pc-card pc-gate', 'aria-live': 'polite' });
  home = el('section', { class: 'pc-home', hidden: true });
  mountPlay(app);
  app.append(gate, home);
  mountNote(app);
  account = createMinnAccountCore({ baseUri: doc.baseURI });
  reports = createReportsApi({ baseUri: doc.baseURI });
  presence = createPresenceApi({ account });
  boot();
  // A reset or sign-up link opened in a tab already here changes only the hash; #report=<id> opens that report.
  window.addEventListener('hashchange', () => {
    if (app.dataset.phone === 'signed-out' && (resetLinkFrom(location.hash) || verifyLinkFrom(location.hash))) boot();
    const id = reportFromHash(location.hash);
    if (id && app.dataset.phone === 'ready') { select('reports', { quiet: true }); openThread(id); }
  });
}

function setState(s) {
  app.dataset.phone = s;
}

function showGate(state, session = null) {
  setState(state);
  home.hidden = true;
  gate.hidden = false;
  gate.replaceChildren();
  const h = el('h1', {}, '');
  gate.append(h);
  if (state === 'checking') {
    h.textContent = T.title;
    gate.append(el('p', {}, T.checking));
    return;
  }
  if (state === 'signed-out') {
    h.textContent = T.signedOutTitle;
    gate.append(el('p', {}, T.signedOutBody));
    const host = el('div', { class: 'pc-account' });
    gate.append(host);
    mountAccountForms(host, {
      account,
      start: location.hash === '#new' ? 'signup' : 'signin',
      reset: resetLinkFrom(location.hash),
      verify: verifyLinkFrom(location.hash),
      onSignedIn: () => {
        if (location.hash === '#new' || resetLinkFrom(location.hash) || verifyLinkFrom(location.hash)) history.replaceState(history.state, '', location.pathname + location.search);
        boot();
      },
    });
    return;
  }
  if (state === 'suspended') {
    h.textContent = T.suspendedTitle;
    gate.append(el('p', {}, T.suspendedBody));
    gate.append(signOutButton());
    return;
  }
  // offline, no-server
  h.textContent = state === 'offline' ? 'The Groddle site is not answering' : 'This needs the Groddle site';
  gate.append(el('p', {}, state === 'offline' ? 'Try again in a moment.' : 'Accounts live on the Groddle site, so this page only works there.'));
  const retry = el('button', { type: 'button', class: 'pc-button' }, 'Try again');
  retry.addEventListener('click', () => location.reload());
  gate.append(retry);
  void session;
}

function signOutButton() {
  const out = el('button', { type: 'button', class: 'pc-linkish pc-signout', 'data-phone-signout': '' }, T.signOut);
  out.addEventListener('click', async () => {
    out.disabled = true;
    stopPolling();
    try { await account.signOut(); } finally { boot(); }
  });
  return out;
}

async function boot() {
  showGate('checking');
  const session = await quietSession(account);
  const state = gateFor(session);
  if (state !== 'ready' || verifyLinkFrom(location.hash)) {
    showGate(state === 'ready' ? 'signed-out' : state, session);
    return;
  }
  if (await suspendedNow(account)) {
    showGate('suspended', session);
    return;
  }
  showHome(session);
}

// —— signed in ——

const TABS = ['reports', 'mail', 'friends', 'account'];
let homeSession = null;
let tabs = {};
let panels = {};
let active = 'reports';
let pollTimer = 0;

function badge(tab, n, label) {
  const b = tabs[tab]?.querySelector('.pc-badge');
  if (!b) return;
  b.textContent = n > 0 ? String(n) : '';
  b.hidden = !(n > 0);
  tabs[tab].setAttribute('aria-label', n > 0 ? `${T.tabs[tab]} (${label(n)})` : T.tabs[tab]);
}

function showHome(session) {
  homeSession = session;
  reports = createReportsApi({ baseUri: doc.baseURI, nonce: account.nonce });
  setState('ready');
  gate.hidden = true;
  home.hidden = false;
  home.replaceChildren();
  const hello = el('div', { class: 'pc-hello' });
  hello.append(el('h1', {}, T.hello(session.player?.name || '')), signOutButton());
  const bar = el('div', { class: 'pc-tabs', role: 'tablist', 'aria-label': 'Your Groddle Afternoon' });
  tabs = {};
  panels = {};
  for (const id of TABS) {
    const t = el('button', { type: 'button', role: 'tab', id: `pc-tab-${id}`, class: 'pc-tab', 'data-phone-tab': id, 'aria-controls': `pc-panel-${id}`, 'aria-selected': 'false' });
    t.append(el('span', {}, T.tabs[id]), el('span', { class: 'pc-badge', hidden: true }));
    t.addEventListener('click', () => select(id));
    tabs[id] = t;
    bar.append(t);
    panels[id] = el('section', { id: `pc-panel-${id}`, class: 'pc-panel', role: 'tabpanel', 'aria-labelledby': `pc-tab-${id}`, 'data-phone-panel': id, hidden: true });
  }
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = TABS.indexOf(active) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1);
    select(TABS[i % TABS.length]);
    tabs[active].focus();
  });
  home.append(hello, bar, ...TABS.map((id) => panels[id]));
  const linked = reportFromHash(location.hash);
  select('reports', { quiet: true });
  if (linked) openThread(linked);
  else loadReports();
  // The other two tabs' badges, without drawing them.
  loadMail({ draw: false });
  loadFriends({ draw: false });
  startPolling();
}

function select(id, { quiet = false } = {}) {
  active = id;
  for (const t of TABS) {
    tabs[t].setAttribute('aria-selected', String(t === id));
    tabs[t].tabIndex = t === id ? 0 : -1;
    panels[t].hidden = t !== id;
  }
  if (quiet) return;
  if (id === 'reports') loadReports();
  if (id === 'mail') loadMail();
  if (id === 'friends') loadFriends();
  if (id === 'account') loadAccount();
}

let accountModule = null;
const loadAccountModule = () => (accountModule ||= import('./account-tab.js?v=3f82164c').catch((err) => { accountModule = null; throw err; }));

async function loadAccount() {
  const panel = panels.account;
  if (!panel || panel.dataset.view === 'account') return;
  panel.dataset.view = 'loading';
  panel.replaceChildren(el('p', { class: 'pc-note' }, T.loading));
  try {
    const { mountPhoneAccount } = await loadAccountModule();
    mountPhoneAccount(panel, { account, session: homeSession, doc });
    panel.dataset.view = 'account';
  } catch {
    panel.dataset.view = 'failed';
    panel.replaceChildren(el('p', { class: 'pc-note' }, T.failed));
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (doc.hidden) return;
    try { const r = await reports.unread(); badge('reports', Number(r?.unread) || 0, REPORT_TEXT.tipUnread); } catch { /* next time */ }
    if (active === 'friends') loadFriends({ quietLoading: true });
  }, POLL_MS);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = 0;
}

function panelHead(panel, title, { back = null, action = null } = {}) {
  const head = el('div', { class: 'pc-panel-head' });
  if (back) {
    const b = el('button', { type: 'button', class: 'pc-back', 'aria-label': back.label }, '‹');
    b.addEventListener('click', back.go);
    head.append(b);
  }
  head.append(el('h2', { tabindex: '-1' }, title));
  if (action) head.append(action);
  panel.append(head);
  return head;
}

function loadingLine(panel) {
  panel.append(el('p', { class: 'pc-muted', 'data-phone-loading': '' }, T.loading));
}

function failedLine(panel, retry) {
  const p = el('p', { class: 'pc-muted' }, `${T.failed} `);
  const b = el('button', { type: 'button', class: 'pc-linkish' }, T.refresh);
  b.addEventListener('click', retry);
  p.append(b);
  panel.append(p);
}

// —— Reports ——

async function loadReports() {
  const panel = panels.reports;
  panel.dataset.view = 'list';
  panel.replaceChildren();
  const write = el('button', { type: 'button', class: 'pc-button', 'data-phone-new-report': '' }, REPORT_TEXT.newReport);
  write.addEventListener('click', () => newReport());
  panelHead(panel, REPORT_TEXT.sheet, { action: write });
  loadingLine(panel);
  let answer;
  try {
    answer = await reports.list();
  } catch {
    if (panel.dataset.view !== 'list') return;
    panel.querySelector('[data-phone-loading]')?.remove();
    failedLine(panel, loadReports);
    return;
  }
  if (panel.dataset.view !== 'list') return;
  panel.querySelector('[data-phone-loading]')?.remove();
  const tickets = Array.isArray(answer?.tickets) ? answer.tickets : [];
  badge('reports', unreadCount(tickets), REPORT_TEXT.tipUnread);
  if (!tickets.length) {
    panel.append(el('p', { class: 'pc-empty' }, REPORT_TEXT.none));
    return;
  }
  const list = el('ul', { class: 'pc-list', 'data-phone-reports': '' });
  for (const t of tickets) {
    const li = el('li');
    const b = el('button', { type: 'button', class: 'pc-row', 'data-ticket': t.id, ...(t.unread ? { 'data-unread': '' } : {}) });
    const top = el('span', { class: 'pc-row-top' });
    top.append(el('span', { class: 'pc-row-title' }, t.subject || 'Report'), el('span', { class: `pc-chip pc-chip-${t.status}` }, STATUS_WORDS[t.status] || t.status));
    // #261: the report's number first, as in the game's Reports window.
    b.append(top, el('span', { class: 'pc-row-line' }, numberedLine(t)));
    if (t.unread) b.append(el('span', { class: 'pc-dot', 'aria-label': REPORT_TEXT.unreadDot }));
    b.addEventListener('click', () => openThread(t.id));
    li.append(b);
    list.append(li);
  }
  panel.append(list);
}

function backToReports() {
  if (location.hash.startsWith('#report=')) history.replaceState(history.state, '', location.pathname + location.search);
  loadReports();
}

async function openThread(id) {
  const panel = panels.reports;
  panel.dataset.view = 'thread';
  panel.dataset.ticket = String(id);
  panel.replaceChildren();
  panelHead(panel, REPORT_TEXT.sheet, { back: { label: REPORT_TEXT.back, go: backToReports } });
  loadingLine(panel);
  let answer;
  try {
    answer = await reports.thread(id);
  } catch (err) {
    if (panel.dataset.ticket !== String(id)) return;
    panel.querySelector('[data-phone-loading]')?.remove();
    panel.append(el('p', { class: 'pc-muted' }, refusalWords(err, T.failed)));
    return;
  }
  drawThread(answer);
  // Opening it marked it read: the badge follows.
  reports.unread().then((r) => badge('reports', Number(r?.unread) || 0, REPORT_TEXT.tipUnread)).catch(() => {});
}

function drawThread(answer, status = '') {
  const panel = panels.reports;
  const t = answer?.ticket || {};
  panel.dataset.view = 'thread';
  panel.dataset.ticket = String(t.id || '');
  panel.replaceChildren();
  panelHead(panel, t.subject || 'Report', { back: { label: REPORT_TEXT.back, go: backToReports } });
  const meta = el('p', { class: 'pc-thread-meta' });
  meta.append(el('span', { class: `pc-chip pc-chip-${t.status}`, 'data-phone-status': t.status || '' }, STATUS_WORDS[t.status] || ''));
  // #261: the report's number beside its status.
  if (reportNumber(t)) meta.append(el('span', { class: 'pc-muted', 'data-phone-report-number': '' }, reportNumber(t)));
  panel.append(meta);
  const msgs = el('ol', { class: 'pc-messages', 'data-phone-messages': '' });
  const linkBodies = [];
  const pic = pictureSrc(answer?.picture);
  // #372: Edit as the game's window has it (js/ui/reports-sheet.js startEdit): your report's words, until the team reads it.
  const canEdit = canEditFirst(answer);
  (Array.isArray(answer?.messages) ? answer.messages : []).forEach((m, i) => {
    const li = el('li', { class: `pc-message pc-message-${m.author === 'admin' ? 'admin' : 'you'}`, 'data-edited': m.edited ? '1' : null });
    const head = el('div', { class: 'pc-message-head' });
    head.append(el('strong', {}, m.author === 'admin' ? REPORT_TEXT.admin : REPORT_TEXT.you), el('span', { class: 'pc-muted' }, `${whenWords(m.at)}${m.edited ? ` · ${REPORT_TEXT.edited}` : ''}`));
    const body = el('p', { class: 'pc-message-body' }, m.body);
    // Addresses become links once js/chat-links.js is in (linkMessages below), as in the game's Reports window.
    if (/https?:\/\//i.test(String(m.body || ''))) linkBodies.push([body, m.body]);
    li.append(head, body);
    if (i === 0 && canEdit) {
      const edit = el('button', { type: 'button', class: 'pc-linkish pc-message-edit', title: REPORT_TEXT.editHint, 'data-phone-edit': '' }, REPORT_TEXT.edit);
      edit.addEventListener('click', () => editFirst(t, m, li, body, edit));
      head.append(edit);
    }
    // The report's own picture under the report, then each message's own (G791; up to four), as
    // thumbnails that open the message's pictures over the page.
    const own = messagePictures(m).map((p) => ({ src: pictureSrc(p), width: Number(p.width) || 0, height: Number(p.height) || 0, alt: i === 0 ? REPORT_TEXT.reportPictureAlt : REPORT_TEXT.replyPictureAlt }));
    if (i === 0 && pic) own.unshift({ src: pic, width: Number(answer.picture.width) || 0, height: Number(answer.picture.height) || 0, alt: REPORT_TEXT.pictureAlt });
    if (own.length) {
      const row = el('div', { class: 'pc-thread-pictures', 'data-count': String(own.length) });
      own.forEach((p, n) => {
        const a = el('a', { href: p.src, target: '_blank', rel: 'noopener', class: 'pc-thread-picture', title: REPORT_TEXT.pictureOpen, 'data-phone-message-picture': String(n + 1) });
        a.append(el('img', { src: p.src, alt: p.alt, loading: 'lazy', width: p.width || '', height: p.height || '' }));
        pictureOpener(a, own, n);
        row.append(a);
      });
      li.append(row);
    }
    msgs.append(li);
  });
  linkMessages(msgs, linkBodies);
  panel.append(msgs);
  if (t.status === 'closed') panel.append(el('p', { class: 'pc-muted' }, REPORT_TEXT.closed));
  const form = el('form', { class: 'pc-form' });
  const label = el('label', { for: 'pc-reply-text' }, REPORT_TEXT.replyLabel);
  const box = el('textarea', { id: 'pc-reply-text', rows: '4', maxlength: String(REPORT_MAX) });
  const msg = el('p', { class: 'pc-status', role: 'status', 'aria-live': 'polite' }, status);
  const send = el('button', { type: 'submit', class: 'pc-button', 'data-phone-send-reply': '' }, REPORT_TEXT.replySend);
  const row = el('div', { class: 'pc-form-row' });
  row.append(send);
  // G791: a photo with the reply, as a new report takes one.
  const photo = photoPicker('pc-reply-photo', msg);
  if (t.status !== 'closed') {
    const close = el('button', { type: 'button', class: 'pc-linkish', 'data-phone-close-ticket': '' }, REPORT_TEXT.closeTicket);
    close.addEventListener('click', async () => {
      close.disabled = true;
      try { drawThread(await reports.close(t.id), REPORT_TEXT.closedDone); } catch (err) { msg.textContent = refusalWords(err); close.disabled = false; }
    });
    row.append(close);
  }
  form.append(label, box, photo.preview, photo.row, row, msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = box.value.trim();
    if (!text) { msg.textContent = REPORT_TEXT.replyEmpty; return; }
    send.disabled = true;
    msg.textContent = REPORT_TEXT.sending;
    await photo.settled();
    const urls = photo.urls();
    const url = urls.length > 1 ? urls : urls[0] || null;
    try {
      let answer;
      let words = REPORT_TEXT.replySent;
      try {
        answer = await reports.reply(t.id, text, url);
      } catch (err) {
        // A refused picture never costs the words.
        if (!url || !pictureRefused(err)) throw err;
        answer = await reports.reply(t.id, text, null);
        words = urls.length > 1 ? PICTURE_TEXT.replyWithout : REPORT_TEXT.replySentNoPicture;
      }
      drawThread(answer, words);
    } catch (err) {
      msg.textContent = refusalWords(err);
      send.disabled = false;
    }
  });
  panel.append(form);
}

/**
 * #372: the report's words in a box in their place, Save and Cancel under it (the game's window,
 * js/ui/reports-sheet.js startEdit / saveEdit). Read by the team meanwhile: the site refuses (409),
 * says so, and Edit goes.
 */
function editFirst(t, m, li, body, edit) {
  if (li.querySelector('[data-phone-edit-form]')) return;
  const form = el('form', { class: 'pc-form pc-edit-form', 'data-phone-edit-form': '' });
  const label = el('label', { for: 'pc-edit-text' }, REPORT_TEXT.editLabel);
  const box = el('textarea', { id: 'pc-edit-text', rows: '4', maxlength: String(REPORT_MAX), 'data-phone-edit-text': '' });
  box.value = String(m.body || '');
  const msg = el('p', { class: 'pc-status', role: 'status', 'aria-live': 'polite' }, REPORT_TEXT.editHint);
  const save = el('button', { type: 'submit', class: 'pc-button', 'data-phone-edit-save': '' }, REPORT_TEXT.editSave);
  const cancel = el('button', { type: 'button', class: 'pc-linkish', 'data-phone-edit-cancel': '' }, REPORT_TEXT.editCancel);
  const row = el('div', { class: 'pc-form-row' });
  row.append(save, cancel);
  form.append(label, box, row, msg);
  body.hidden = true;
  edit.hidden = true;
  li.append(form);
  box.focus();
  cancel.addEventListener('click', () => {
    form.remove();
    body.hidden = false;
    edit.hidden = false;
    edit.focus();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = box.value.trim();
    if (!text) { msg.textContent = REPORT_TEXT.editEmpty; box.focus(); return; }
    save.disabled = true;
    msg.textContent = REPORT_TEXT.editSaving;
    try {
      drawThread(await reports.edit(t.id, text), REPORT_TEXT.editDone);
    } catch (err) {
      if (err?.status === 409) {
        // Read meanwhile: the thread again, without Edit, and the site's words.
        try { drawThread(await reports.thread(t.id), refusalWords(err)); return; } catch { /* the words below */ }
      }
      msg.textContent = refusalWords(err);
      save.disabled = false;
    }
  });
}

/**
 * The links in a report's messages (#669 follow-up, 2026-11-25): js/chat-links.js loads the first time a thread has an
 * address in it (it is not counted in the page's first load, like the lightbox), then each such message is drawn again
 * with its addresses as links (text nodes only; a link to another site asks first).
 */
let chatLinksModule = null;
const loadChatLinks = () => (chatLinksModule ||= import('../chat-links.js?v=b717fac7').catch((err) => { chatLinksModule = null; throw err; }));
function linkMessages(list, bodies) {
  if (!bodies.length) return;
  loadChatLinks().then(({ appendLinkedText, bindChatLinks }) => {
    for (const [body, text] of bodies) {
      if (!body.isConnected) continue;
      body.replaceChildren();
      appendLinkedText(body, text, { doc });
    }
    if (!list.dataset.chatLinks) { list.dataset.chatLinks = '1'; bindChatLinks(list, { doc }); }
  }).catch(() => { /* the words stay plain text */ });
}
/** The pictures over the page (js/ui/picture-lightbox.js, plain DOM), loaded at the first tap on a picture. */
let lightboxModule = null;
const loadLightbox = () => (lightboxModule ||= import('../ui/picture-lightbox.js?v=e049f063').catch((err) => { lightboxModule = null; throw err; }));
/** G808: the rings module, loaded with the lightbox at the first tap on a photo about to go. */
let marksModule = null;
const loadMarks = () => (marksModule ||= import('../ui/picture-marks.js?v=85e99881').catch((err) => { marksModule = null; throw err; }));

/**
 * A picture link that opens `gallery` (each { src, width, height, alt }) at `index` over the page on
 * a plain tap or click; a modified click keeps the link's own tab (as lightboxLink does in the game).
 */
function pictureOpener(a, gallery, index, prepare = null) {
  a.addEventListener('click', (ev) => {
    if ((ev.button ?? 0) !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    Promise.all([loadLightbox(), prepare?.()]).then(([{ openLightbox }]) => {
      // Read once ready: a photo's rings (G808) come with it.
      const list = typeof gallery === 'function' ? gallery() : gallery;
      openLightbox({ doc, host: doc.body, src: list[index]?.src || a.getAttribute('href'), alt: list[index]?.alt || '', label: REPORT_TEXT.pictureLabel, opener: a, gallery: list, index });
    }).catch(() => { globalThis.open?.(a.getAttribute('href'), '_blank', 'noopener'); });
  });
}

/**
 * A photo picker (Add photos, several at once, up to four; thumbnails each with an x, each opening
 * the photos over the page): what a new report and a reply take. Each photo is read into the
 * report's JPEG (js/report-pictures.js convertPicture: any picture the browser opens, never the
 * file's own bytes); one that cannot be read is named in the line under the form.
 */
function photoPicker(id, msg) {
  let photos = [];
  let reading = 0;
  let job = Promise.resolve();
  const pick = el('input', { type: 'file', id, accept: REPORT_PICTURES.accept, multiple: true, class: 'pc-file' });
  const pickLabel = el('label', { for: id, class: 'pc-button pc-button-quiet' }, T.photo);
  const preview = el('ul', { class: 'pc-photo-preview', hidden: true, 'aria-label': REPORT_TEXT.trayLabel, 'data-phone-photo-preview': '' });
  // G808: each photo's rings (js/ui/picture-marks.js createMarkBook), made at the first open.
  let book = null;
  let markTag = null;
  const marksReady = () => loadMarks().then(({ createMarkBook, MARK_TEXT }) => {
    markTag = MARK_TEXT.tag;
    book ||= createMarkBook({ onChange: () => drawPreview() });
  });
  const gallery = () => photos.map((p, i) => ({ src: p.url, width: p.width, height: p.height, alt: PICTURE_TEXT.thumbAlt(i + 1), mark: book ? book.holder(p) : null }));
  pick.addEventListener('change', () => {
    const files = Array.from(pick.files || []);
    pick.value = '';
    if (!files.length) return;
    const { take, over } = takeForRoom(files, roomFor(photos.length + reading));
    const notes = over ? [take.length ? PICTURE_TEXT.leftOut(over) : PICTURE_TEXT.full] : [];
    reading += take.length;
    msg.textContent = take.length ? T.loading : notes.join(' ');
    drawPreview();
    job = job.then(async () => {
      for (const file of take) {
        try {
          const p = await convertPicture(file, { doc });
          if (photos.length < REPORT_PICTURES.max) photos = [...photos, p];
        } catch (err) {
          notes.push(pictureRefusal(err, file));
        }
        reading -= 1;
        drawPreview();
      }
      msg.textContent = notes.join(' ');
    }).catch(() => {});
  });
  function drawPreview() {
    const full = photos.length + reading >= REPORT_PICTURES.max;
    preview.hidden = photos.length === 0;
    pickLabel.textContent = photos.length ? T.photoMore : T.photo;
    pickLabel.toggleAttribute?.('data-disabled', full);
    pick.disabled = full;
    preview.replaceChildren(...photos.map((p, i) => {
      const li = el('li', { class: 'pc-photo-thumb', 'data-phone-photo-thumb': String(i + 1) });
      // G808: the thumbnail shows the photo with its rings drawn in.
      const look = book ? book.shown(p) : p;
      const a = el('a', { href: look.url, class: 'pc-photo-open', 'aria-label': PICTURE_TEXT.open(i + 1, photos.length), title: PICTURE_TEXT.open(i + 1, photos.length) });
      a.append(el('img', { src: look.url, alt: PICTURE_TEXT.thumbAlt(i + 1), width: p.width, height: p.height }));
      pictureOpener(a, gallery, i, marksReady);
      const remove = el('button', { type: 'button', class: 'pc-photo-remove', 'aria-label': PICTURE_TEXT.remove(i + 1), title: PICTURE_TEXT.remove(i + 1), 'data-phone-photo-remove': '' }, '×');
      remove.addEventListener('click', () => { photos = photos.filter((x) => x !== p); book?.drop(p); drawPreview(); });
      li.append(a, remove);
      const rings = book ? book.count(p) : 0;
      if (rings) li.append(el('span', { class: 'pc-photo-marks', 'data-phone-photo-marks': '' }, markTag(rings)));
      return li;
    }));
  }
  const row = el('div', { class: 'pc-form-row' });
  row.append(pickLabel, pick);
  return {
    row,
    preview,
    get photos() { return photos; },
    get photo() { return photos[0] || null; },
    /** What Send sends: each photo with its rings drawn in (G808). */
    urls: () => photos.map((p) => (book ? book.url(p) : p.url)),
    settled: () => job.then(() => book?.settled()),
  };
}

function newReport() {
  const panel = panels.reports;
  panel.dataset.view = 'new';
  panel.dataset.ticket = '';
  panel.replaceChildren();
  panelHead(panel, REPORT_TEXT.title, { back: { label: REPORT_TEXT.back, go: backToReports } });
  const form = el('form', { class: 'pc-form' });
  const label = el('label', { for: 'pc-report-text' }, REPORT_TEXT.label);
  const box = el('textarea', { id: 'pc-report-text', rows: '6', maxlength: String(REPORT_MAX), 'data-phone-report-text': '' });
  const hint = el('p', { class: 'pc-hint' }, T.photoHint);
  const msg = el('p', { class: 'pc-status', role: 'status', 'aria-live': 'polite' });
  const picker = photoPicker('pc-photo', msg);
  const send = el('button', { type: 'submit', class: 'pc-button', 'data-phone-send-report': '' }, REPORT_TEXT.send);
  form.append(label, box, picker.preview, picker.row, hint, send, msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = box.value.trim();
    if (!text) { msg.textContent = REPORT_TEXT.empty; return; }
    send.disabled = true;
    msg.textContent = REPORT_TEXT.sending;
    const context = phoneContext(globalThis);
    await picker.settled();
    const urls = picker.urls();
    const photo = urls.length > 1 ? urls : urls[0] || null;
    let sent;
    let words = REPORT_TEXT.sent;
    try {
      sent = await reports.create(text, context, photo);
    } catch (err) {
      if (photo && pictureRefused(err)) {
        try {
          sent = await reports.create(text, context, null);
          words = urls.length > 1 ? PICTURE_TEXT.sentWithout : REPORT_TEXT.sentNoPicture;
        } catch (again) {
          msg.textContent = refusalWords(again);
          send.disabled = false;
          return;
        }
      } else {
        msg.textContent = refusalWords(err);
        send.disabled = false;
        return;
      }
    }
    try {
      drawThread(await reports.thread(sent.id), words);
    } catch {
      loadReports();
    }
  });
  panel.append(form);
  box.focus({ preventScroll: true });
}

// —— Mail (read only) ——

let itemNames = null;

async function namesFor(rows) {
  if (itemNames || !rows.some((r) => r.item)) return itemNames;
  try {
    const res = await fetch(new URL('encyclopedia/items/data.json', doc.baseURI).href, { credentials: 'same-origin' });
    itemNames = itemNamesFrom(await res.json());
  } catch {
    itemNames = new Map();
  }
  return itemNames;
}

let letters = [];

async function loadMail({ draw = true } = {}) {
  const panel = panels.mail;
  if (draw) {
    panel.dataset.view = 'list';
    panel.replaceChildren();
    panelHead(panel, T.tabs.mail);
    loadingLine(panel);
  }
  let save;
  let playerMail = null;
  try {
    [save, playerMail] = await Promise.all([account.multiplayerSave({ peek: true }), account.playerMail().catch(() => null)]);
  } catch {
    if (!draw || panel.dataset.view !== 'list') return;
    panel.querySelector('[data-phone-loading]')?.remove();
    failedLine(panel, () => loadMail());
    return;
  }
  const box = mailboxFromSave(save);
  // G478: letters from other players the site holds that the save has not taken in yet.
  // #282: one the save took in and archived or deleted is not new again.
  letters = mergePlayerMail(mailRows(box), playerMail, Date.now(), takenMailIds(save));
  badge('mail', unreadLetters(letters), (n) => (n === 1 ? '1 new letter' : `${n} new letters`));
  if (!draw || panel.dataset.view !== 'list') return;
  await namesFor(letters);
  panel.querySelector('[data-phone-loading]')?.remove();
  panel.append(el('p', { class: 'pc-hint' }, T.mailNote));
  if (!box && !letters.length) {
    panel.append(el('p', { class: 'pc-empty' }, T.mailNoSave));
    return;
  }
  if (!letters.length) {
    panel.append(el('p', { class: 'pc-empty' }, T.mailEmpty));
    return;
  }
  const list = el('ul', { class: 'pc-list', 'data-phone-letters': '' });
  for (const r of letters) {
    const li = el('li');
    const b = el('button', { type: 'button', class: 'pc-row', 'data-letter': r.id, ...(r.unread ? { 'data-unread': '' } : {}) });
    const top = el('span', { class: 'pc-row-top' });
    top.append(el('span', { class: 'pc-row-title' }, r.sender), el('span', { class: 'pc-muted pc-row-when' }, whenWords(new Date(r.at).toISOString())));
    b.append(top, el('span', { class: 'pc-row-line' }, r.snippet || ' '));
    if (r.item || r.currants) b.append(el('span', { class: 'pc-row-extra' }, attachmentWords(r)));
    if (r.unread) b.append(el('span', { class: 'pc-dot', 'aria-label': 'New letter' }));
    b.addEventListener('click', () => openLetter(r.id));
    li.append(b);
    list.append(li);
  }
  panel.append(list);
}

function attachmentWords(r) {
  const parts = [];
  if (r.item) parts.push(T.mailItem(r.item.count, itemNames?.get(r.item.id) || itemWords(r.item.id)));
  if (r.currants) parts.push(T.mailCurrants(r.currants));
  return parts.join(' and ');
}

function openLetter(id) {
  const r = letters.find((x) => x.id === id);
  const panel = panels.mail;
  if (!r) { loadMail(); return; }
  panel.dataset.view = 'letter';
  panel.replaceChildren();
  panelHead(panel, T.mailFrom(r.sender), { back: { label: T.mailBack, go: () => loadMail() } });
  const art = el('article', { class: 'pc-letter', 'data-phone-letter': r.id });
  art.append(el('p', { class: 'pc-muted' }, new Date(r.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })));
  art.append(el('p', { class: 'pc-letter-body' }, r.text || ' '));
  if (r.item || r.currants) {
    const att = el('div', { class: 'pc-attachment' });
    att.append(el('h3', {}, T.mailAttached));
    if (r.item) {
      const line = el('p', { class: 'pc-item' });
      const icon = el('img', { src: `assets/sprites/icons/${encodeURIComponent(r.item.id)}.webp`, alt: '', width: '40', height: '40', loading: 'lazy' });
      icon.addEventListener('error', () => icon.remove());
      line.append(icon, el('span', {}, T.mailItem(r.item.count, itemNames?.get(r.item.id) || itemWords(r.item.id))));
      att.append(line);
    }
    if (r.currants) att.append(el('p', { class: 'pc-item' }, T.mailCurrants(r.currants)));
    att.append(el('p', { class: 'pc-hint' }, r.collected ? T.mailCollected : r.onItsWay ? T.mailOnItsWay : T.mailCollect));
    art.append(att);
  }
  panel.append(art);
  panel.querySelector('h2')?.focus({ preventScroll: true });
}

// —— Friends ——

async function loadFriends({ draw = true, quietLoading = false } = {}) {
  const panel = panels.friends;
  if (draw && !quietLoading) {
    panel.replaceChildren();
    panelHead(panel, T.tabs.friends);
    loadingLine(panel);
  }
  let answer;
  let online = null;
  try {
    [answer, online] = await Promise.all([account.buddies(), presence.online().catch(() => null)]);
  } catch {
    if (!draw) return;
    panel.replaceChildren();
    panelHead(panel, T.tabs.friends);
    failedLine(panel, () => loadFriends());
    return;
  }
  const v = friendsView(answer, online);
  badge('friends', v.online.length, (n) => `${n} playing now`);
  if (!draw) return;
  if (quietLoading && active !== 'friends') return;
  panel.replaceChildren();
  const again = el('button', { type: 'button', class: 'pc-linkish', 'data-phone-refresh-friends': '' }, T.refresh);
  again.addEventListener('click', () => loadFriends());
  panelHead(panel, T.tabs.friends, { action: again });
  if (v.empty) {
    panel.append(el('p', { class: 'pc-empty' }, T.friendsEmpty));
    return;
  }
  const section = (title, rows, line) => {
    const s = el('section', { class: 'pc-friends' });
    s.append(el('h3', {}, title));
    const ul = el('ul', { class: 'pc-list pc-people' });
    for (const r of rows) {
      const li = el('li', { class: 'pc-person', 'data-friend': r.id });
      li.append(el('span', { class: 'pc-person-name' }, r.name), el('span', { class: 'pc-muted' }, line(r)));
      ul.append(li);
    }
    s.append(ul);
    panel.append(s);
    return s;
  };
  const on = section(T.friendsOnline, v.online, (r) => r.where);
  on.dataset.phoneOnline = '';
  if (!v.live) on.append(el('p', { class: 'pc-hint' }, T.friendsNotLive));
  else if (!v.online.length) on.append(el('p', { class: 'pc-hint' }, T.friendsNobody));
  if (v.offline.length) section(T.friendsOffline, v.offline, () => (v.live ? T.offline : ''));
  if (v.addedYou.length) section(T.friendsAddedYou, v.addedYou, () => (v.live ? T.offline : ''));
}

if (doc?.getElementById('phone-app')) start();
