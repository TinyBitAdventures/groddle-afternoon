/**
 * The phone companion page (play/phone/, Austin 2026-10-31). Phones and
 * touch-only tablets land here from /play/online/ and /play/ (their
 * #phone-gate script), because the game is more than a phone tab holds. It
 * signs the player in with the game's own forms (js/account-forms.js, the
 * /play/online/ gate's flow: js/online-session.js quietSession, suspendedNow),
 * then shows three tabs over the routes the game already uses
 * (js/phone/companion-data.js): Reports (read, reply, close, write a new one
 * with a photo), Mail (read only) and Friends (who is playing and where).
 * It never loads Pixi, game.js or the game's assets.
 *
 * Deep links the game's emails use keep working: #report=<id> opens that
 * report, #new the New player form, #verify=<token> and #reset=<key>&login=
 * finish a sign-up or a password reset.
 *
 * QA hooks: <main id="phone-app" data-phone="checking|signed-out|ready|...">,
 * [data-phone-tab=reports|mail|friends] with .pc-badge, panels
 * [data-phone-panel=...] with data-view, [data-phone-signout],
 * [data-phone-full], [data-ticket=<id>], [data-letter=<id>],
 * [data-friend=<id>], #pc-report-text, #pc-photo, #pc-reply-text.
 */

import { createMinnAccountCore } from '../minn-account-core.js?v=63758d34';
import { mountAccountForms, resetLinkFrom, verifyLinkFrom } from '../account-forms.js?v=318b6815';
import { gateFor, quietSession, suspendedNow } from '../online-session.js?v=6f1348c8';
import { REPORT_MAX, REPORT_TEXT, STATUS_WORDS, createReportsApi, pictureRefused, pictureSrc, refusalWords, reportFromHash, ticketLine, unreadCount, whenWords } from '../reports.js?v=751c111c';
import { DEVICE_KEY, PHONE_TEXT as T, POLL_MS, createPresenceApi, fitPhoto, friendsView, fullGameHref, itemNamesFrom, itemWords, mailRows, mailboxFromSave, mergePlayerMail, phoneContext, unreadLetters } from './companion-data.js?v=d05fd33d';

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

function storeGet() {
  try { return localStorage.getItem(DEVICE_KEY) || ''; } catch { return ''; }
}

function storeSet(value) {
  try {
    if (value) localStorage.setItem(DEVICE_KEY, value);
    else localStorage.removeItem(DEVICE_KEY);
  } catch { /* private windows: this visit only */ }
}

/** The note under the panels: played on a computer, the home page, and the way into the game anyway. */
function mountNote(host) {
  const note = el('aside', { class: 'pc-note', 'aria-label': 'About this page' });
  const p = el('p');
  p.append(el('strong', {}, T.computer), ` ${T.computerMore} `);
  p.append(el('a', { href: './' }, T.home));
  note.append(p);
  const full = el('p', { class: 'pc-full' });
  if (storeGet() === 'full') {
    // Opened by hand on a device that chose the game: offer the way back.
    const back = el('button', { type: 'button', class: 'pc-linkish', 'data-phone-use-page': '' }, T.useThisPage);
    back.addEventListener('click', () => { storeSet(''); mountFull(full); });
    full.append(el('span', {}, `${T.fullRemembered} `), back);
  } else {
    mountFull(full);
  }
  note.append(full);
  host.append(note);
}

function mountFull(host) {
  const href = fullGameHref(location.search);
  const a = el('a', { href, 'data-phone-full': '' }, T.full);
  a.addEventListener('click', () => storeSet('full'));
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

const TABS = ['reports', 'mail', 'friends'];
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
    b.append(top, el('span', { class: 'pc-row-line' }, ticketLine(t)));
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
  panel.append(meta);
  const msgs = el('ol', { class: 'pc-messages', 'data-phone-messages': '' });
  const pic = pictureSrc(answer?.picture);
  (Array.isArray(answer?.messages) ? answer.messages : []).forEach((m, i) => {
    const li = el('li', { class: `pc-message pc-message-${m.author === 'admin' ? 'admin' : 'you'}` });
    const head = el('div', { class: 'pc-message-head' });
    head.append(el('strong', {}, m.author === 'admin' ? REPORT_TEXT.admin : REPORT_TEXT.you), el('span', { class: 'pc-muted' }, whenWords(m.at)));
    li.append(head, el('p', { class: 'pc-message-body' }, m.body));
    if (i === 0 && pic) {
      const a = el('a', { href: pic, target: '_blank', rel: 'noopener', class: 'pc-thread-picture', title: REPORT_TEXT.pictureOpen });
      a.append(el('img', { src: pic, alt: REPORT_TEXT.pictureAlt, loading: 'lazy', width: answer.picture.width || '', height: answer.picture.height || '' }));
      li.append(a);
    }
    msgs.append(li);
  });
  panel.append(msgs);
  if (t.status === 'closed') panel.append(el('p', { class: 'pc-muted' }, REPORT_TEXT.closed));
  const form = el('form', { class: 'pc-form' });
  const label = el('label', { for: 'pc-reply-text' }, REPORT_TEXT.replyLabel);
  const box = el('textarea', { id: 'pc-reply-text', rows: '4', maxlength: String(REPORT_MAX) });
  const msg = el('p', { class: 'pc-status', role: 'status', 'aria-live': 'polite' }, status);
  const send = el('button', { type: 'submit', class: 'pc-button', 'data-phone-send-reply': '' }, REPORT_TEXT.replySend);
  const row = el('div', { class: 'pc-form-row' });
  row.append(send);
  if (t.status !== 'closed') {
    const close = el('button', { type: 'button', class: 'pc-linkish', 'data-phone-close-ticket': '' }, REPORT_TEXT.closeTicket);
    close.addEventListener('click', async () => {
      close.disabled = true;
      try { drawThread(await reports.close(t.id), REPORT_TEXT.closedDone); } catch (err) { msg.textContent = refusalWords(err); close.disabled = false; }
    });
    row.append(close);
  }
  form.append(label, box, row, msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = box.value.trim();
    if (!text) { msg.textContent = REPORT_TEXT.replyEmpty; return; }
    send.disabled = true;
    msg.textContent = REPORT_TEXT.sending;
    try {
      drawThread(await reports.reply(t.id, text), REPORT_TEXT.replySent);
    } catch (err) {
      msg.textContent = refusalWords(err);
      send.disabled = false;
    }
  });
  panel.append(form);
}

/** A picked photo drawn into a JPEG the size a report keeps. */
async function photoFrom(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = doc.createElement('canvas');
    const ctx = canvas.getContext('2d');
    return fitPhoto(img.naturalWidth, img.naturalHeight, (w, h, q) => {
      canvas.width = w;
      canvas.height = h;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', q);
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
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
  let photo = null;
  const pick = el('input', { type: 'file', id: 'pc-photo', accept: 'image/*', class: 'pc-file' });
  const pickLabel = el('label', { for: 'pc-photo', class: 'pc-button pc-button-quiet' }, T.photo);
  const preview = el('div', { class: 'pc-photo-preview', hidden: true, 'data-phone-photo-preview': '' });
  const hint = el('p', { class: 'pc-hint' }, T.photoHint);
  const msg = el('p', { class: 'pc-status', role: 'status', 'aria-live': 'polite' });
  pick.addEventListener('change', async () => {
    const file = pick.files?.[0];
    pick.value = '';
    if (!file) return;
    msg.textContent = T.loading;
    photo = await photoFrom(file);
    msg.textContent = photo ? '' : T.photoFailed;
    drawPreview();
  });
  function drawPreview() {
    preview.replaceChildren();
    preview.hidden = !photo;
    pickLabel.textContent = photo ? T.photoChange : T.photo;
    if (!photo) return;
    const remove = el('button', { type: 'button', class: 'pc-linkish', 'data-phone-photo-remove': '' }, T.photoRemove);
    remove.addEventListener('click', () => { photo = null; drawPreview(); });
    preview.append(el('img', { src: photo.url, alt: T.photoAlt, width: photo.width, height: photo.height }), remove);
  }
  const send = el('button', { type: 'submit', class: 'pc-button', 'data-phone-send-report': '' }, REPORT_TEXT.send);
  const photoRow = el('div', { class: 'pc-form-row' });
  photoRow.append(pickLabel, pick);
  form.append(label, box, photoRow, preview, hint, send, msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = box.value.trim();
    if (!text) { msg.textContent = REPORT_TEXT.empty; return; }
    send.disabled = true;
    msg.textContent = REPORT_TEXT.sending;
    const context = phoneContext(globalThis);
    let sent;
    let words = REPORT_TEXT.sent;
    try {
      sent = await reports.create(text, context, photo?.url || null);
    } catch (err) {
      if (photo && pictureRefused(err)) {
        try {
          sent = await reports.create(text, context, null);
          words = REPORT_TEXT.sentNoPicture;
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
  letters = mergePlayerMail(mailRows(box), playerMail);
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
