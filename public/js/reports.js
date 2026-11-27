/**
 * TICKETS: a multiplayer player's bug reports as threads with the
 * administrators (groddle-afternoon-site src/Tickets.php, TicketStore.php).
 * The pure rules the Reports sheet (js/ui/reports-sheet.js) draws from, and
 * its calls to groddle/v1/tickets, signed in, with the session's REST nonce
 * (a stale one is fetched again once, as js/minn-account-core.js does).
 *
 * A ticket: { id, status: open|answered|working|closed, subject, createdAt, updatedAt,
 * lastMessageAt, lastAuthor: player|admin, unread, adminReplied, readByTeamAt }; a message: { id, author:
 * player|admin, body, at, edited, pictures: [{ url, width, height }], picture: the first of them|null }.
 * Who wrote is a role: an administrator is never named.
 *
 * Ticket 49 (2026-11-02, a player's two ideas): Working on it is a status an
 * administrator sets (its own chip), and the report's first message can be
 * edited until an administrator has read it (a thread's editable; the site
 * answers 409 groddle_ticket_read once they have).
 *
 * A new report may carry a picture of the game (Austin 2026-10-30): Attach a
 * picture of the game, ticked by default, sends the game's canvas as a JPEG
 * (REPORT_PICTURE; the feature's capturePicture). The canvas is the street:
 * you, other players' avatars, the name plates and speech bubbles drawn over
 * them. With Include the game's UI (ticked by default, 2026-11-01) the picture
 * is the whole game window, its HUD and open windows drawn over the canvas,
 * with chat, mail and Activity blanked and the Reports window left out.
 * The site checks it again (src/ReportPicture.php) and shows it only to you
 * and the administrators (src/TicketPictures.php).
 *
 * G791 (#216, #281: a bug gone before the report window opened): a reply can
 * carry a picture too, and a picture can be taken on purpose (Take a picture
 * in the window, or Shift+R anywhere in the game); it waits for your next
 * reply or new report. The site keeps a reply's picture per message (a
 * message's picture, /report-pictures/<report>/<message>), with a new
 * report's limits.
 *
 * Several pictures a message (Austin 2026-11-15): a new report or a reply
 * carries up to four (js/report-pictures.js: any picture the browser opens,
 * dropped, pasted, picked or taken, made into the same JPEG), sent as
 * "pictures"; each message lists its own (/report-pictures/<report>/<message>/<n>).
 *
 * Reactions on a report's messages (Austin 2026-11-18): api.react; the rules are js/report-reactions.js.
 */

import { minnUrls } from './minn-account-core.js?v=5baee954';

/** The sheet's words. The form welcomes feedback, suggestions and bugs alike (the original's BootError.as 280-290 asked only for bugs). */
/** The optional extensions line's length, as the site keeps it (BugReports.php CONTEXT 'extensions'). */
export const REPORT_EXTENSIONS_MAX = 200;

export const REPORT_TEXT = Object.freeze({
  tip: 'Feedback, ideas and bugs',
  tipUnread: (n) => (n === 1 ? 'Feedback, ideas and bugs (1 new reply)' : `Feedback, ideas and bugs (${n} new replies)`),
  sheet: 'Reports',
  newReport: 'Write to us',
  back: 'Back to your reports',
  title: 'We\'d love to hear from you!',
  label: 'Tell us anything: feedback, a suggestion, or a bug you found.',
  send: 'Send',
  close: 'Close',
  sending: 'Sending…',
  sent: 'Thanks! Your message was sent.',
  empty: 'Write your feedback, suggestion or bug first.',
  failed: 'That didn\'t send. Try again in a moment.',
  none: 'You have not written to us yet. Feedback, ideas and bugs are all welcome: start with Write to us.',
  loading: 'Loading your reports…',
  loadFailed: 'Your reports did not load. Try again in a moment.',
  you: 'You',
  admin: 'Administrator',
  replyLabel: 'Reply',
  replyEmpty: 'Write your reply first.',
  replySend: 'Send reply',
  replySent: 'Reply sent.',
  closeTicket: 'Close report',
  closed: 'This report is closed. Write a reply to open it again.',
  closedDone: 'Report closed.',
  unreadDot: 'New reply',
  edit: 'Edit',
  editLabel: 'Change your report',
  editSave: 'Save',
  editCancel: 'Cancel',
  editSaving: 'Saving…',
  editDone: 'Your report was changed.',
  editEmpty: 'Write your report first.',
  edited: 'edited',
  editHint: 'You can change this until an administrator reads it.',
  meta: (n) => (n === 0 ? 'No reports yet' : n === 1 ? '1 report' : `${n} reports`),
  // #744: the list comes a page at a time (the site's TicketStore::LIST_MAX); Older reports at its end loads the next.
  metaMore: (n) => `${n} reports so far, more at the end of the list`,
  older: 'Older reports',
  olderLoading: 'Loading older reports…',
  olderFailed: 'Your older reports did not load. Try again in a moment.',
  // Ticket 58: a search box over your own reports' subjects.
  filterLabel: 'Search your reports',
  filterPlaceholder: 'Search your reports',
  filterNone: 'None of your reports match that. The search looks at each report\'s first line.',
  filterMeta: (shown, n) => `${shown} of ${n} reports`,
  // Ticket 115: the list's status tabs.
  tabsLabel: 'Your reports by status',
  tabAll: 'All',
  tabNone: 'None of your reports have this status right now.',
  tabUnread: (n) => (n === 1 ? '1 new reply' : `${n} new replies`),
  tabCount: (n) => (n === 1 ? '1 report' : `${n} reports`),
  picture: 'Attach a picture of the game',
  pictureHint: 'It shows the street as you see it, with other players, their names and speech bubbles. Not your chat or these windows.',
  pictureNone: 'The game view could not be drawn, so no picture goes with this one.',
  // 18(b), Austin 2026-11-01: the picture shows the game's windows too, unless this is unticked.
  pictureUi: 'Include the game\'s UI',
  // #585 (Austin 2026-11-21): an optional line, sent with the report as context.extensions.
  extensions: 'Browser extensions you use (optional)',
  extensionsHint: 'Ad blockers, dark modes, style changers. They can hide parts of the game.',
  pictureHintUi: 'It shows the game as you see it: the street, other players and their names, and the windows you have open. Chat, mail and Activity are blanked out. This window is never in it.',
  pictureDrawing: 'Drawing the picture…',
  pictureAlt: 'The game when you reported it',
  pictureOpen: 'Open the picture full size',
  // Austin 2026-11-03: the picture opens over the game (js/ui/picture-lightbox.js), named for screen readers.
  pictureLabel: 'Report picture',
  sentNoPicture: 'Thanks! Your message was sent, without the picture.',
  // #225 (Friendly, 2026-11-12): a report an administrator replied to keeps a tag, closed or not.
  replied: 'Has a reply',
  repliedHint: 'An administrator replied to this report',
  // Read by the team (Austin 2026-11-12): an administrator has opened it since your last message.
  readByTeam: 'Read by the team',
  readByTeamHint: 'An administrator has opened this report since your last message',
  // #261 (Friendly, 2026-11-13): each report's number, so a reply or a note can refer to it.
  number: (id) => `Report #${id}`,
  // G791 (#216, #281): a picture with a reply, and one taken on purpose.
  take: 'Take a picture',
  takeAgain: 'Take another',
  takeHint: 'This window closes so you can show us the problem, then take the picture. Shift+R takes one any time in the game.',
  takeReply: 'These pictures go with your next reply or report.',
  takeTaken: 'Picture taken. It goes with your next report or reply: open Reports with R.',
  takeFailed: 'The game could not be drawn, so no picture was taken.',
  takeDrawing: 'Taking the picture…',
  shutterTitle: 'Show us the problem, then take the picture.',
  shutterTake: 'Take the picture',
  shutterCancel: 'Cancel',
  replyPictureAlt: 'The picture you sent with this reply',
  replySentNoPicture: 'Reply sent, without the picture.',
  // Several pictures a message (Austin 2026-11-15).
  trayLabel: 'Pictures going with your message',
  reportPictureAlt: 'A picture you sent with this report',
  // Reactions on a message (Austin 2026-11-18).
  reactFailed: 'That reaction didn\'t go. Try again in a moment.',
});

/**
 * The picture of the game: the canvas downscaled to at most maxWidth, as a
 * JPEG at quality (then lower, then narrower) until it fits maxBytes. The
 * site's own limits are src/ReportPicture.php (1280x1280, 300 KiB, JPEG).
 */
export const REPORT_PICTURE = Object.freeze({
  maxWidth: 1280,
  maxHeight: 1280,
  widths: Object.freeze([1280, 1024, 800]),
  qualities: Object.freeze([0.8, 0.7, 0.6]),
  maxBytes: 307200,
  type: 'image/jpeg',
});

/** A w x h view drawn at most maxWidth wide and maxHeight tall, the shape kept: [w, h] in whole pixels. */
export function pictureSize(w, h, maxWidth = REPORT_PICTURE.maxWidth, maxHeight = REPORT_PICTURE.maxHeight) {
  const W = Math.max(0, Number(w) || 0);
  const H = Math.max(0, Number(h) || 0);
  if (!W || !H) return [0, 0];
  const s = Math.min(1, maxWidth / W, maxHeight / H);
  return [Math.max(1, Math.round(W * s)), Math.max(1, Math.round(H * s))];
}

/** The bytes a base64 string decodes to. */
export function base64Size(b64) {
  const s = String(b64 || '');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - pad);
}

/** Whether a refusal was the picture's (the report itself would go without it). */
export function pictureRefused(err) {
  return typeof err?.code === 'string' && err.code.startsWith('groddle_report_picture');
}

/** A thread's picture address from the site (src/TicketPictures.php), or a message's (G791: /<report>/<message>, then /<n>), or ''. */
export function pictureSrc(picture) {
  const url = typeof picture?.url === 'string' ? picture.url : '';
  return /^\/report-pictures\/\d{1,12}(?:\/\d{1,12}(?:\/[1-9])?)?$/.test(url) ? url : '';
}

/** A message's pictures as the site lists them (up to four), else G791's one; only the ones with a picture address. */
export function messagePictures(m) {
  const list = Array.isArray(m?.pictures) ? m.pictures : m?.picture ? [m.picture] : [];
  return list.filter((p) => pictureSrc(p)).slice(0, 4);
}

/**
 * The body's pictures: none, one as "picture" (every site takes it), or several as "pictures"
 * with the first again as "picture" for a site from before 2026-11-15, which keeps that one.
 */
export function picturesBody(pictures) {
  const list = (Array.isArray(pictures) ? pictures : [pictures]).filter((p) => typeof p === 'string' && p);
  if (!list.length) return {};
  return list.length === 1 ? { picture: list[0] } : { pictures: list, picture: list[0] };
}

/**
 * G791: whether a keydown is Shift+R, a picture of the game for the next report or reply. Not
 * while typing in a box (there it is a capital R), and never with Ctrl, Alt or Cmd.
 */
export function isPictureKey(e) {
  if (!e || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return false;
  if (String(e.key || '').toLowerCase() !== 'r' && e.code !== 'KeyR') return false;
  const t = e.target;
  const tag = String(t?.tagName || '').toUpperCase();
  return !(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable);
}

/** The status chip's words. */
export const STATUS_WORDS = Object.freeze({ open: 'Open', answered: 'Answered', working: 'Working on it', closed: 'Closed' });

/**
 * Ticket 115 (Friendly, 2026-11-06): the list's tabs, All and then each status the site keeps
 * (src/TicketStore.php STATUSES), named as the chips name them.
 */
export const REPORT_TABS = Object.freeze(['all', 'open', 'answered', 'working', 'closed']);

/** A tab's name: All, or the status chip's words. */
export function tabLabel(tab) {
  return tab === 'all' ? REPORT_TEXT.tabAll : STATUS_WORDS[tab] || String(tab);
}

/** Whether a report shows under a tab. */
export function inTab(t, tab) {
  return tab === 'all' || t?.status === tab;
}

/** Per tab, how many reports it holds and how many of them have a reply you have not read. */
export function tabCounts(tickets) {
  const out = Object.fromEntries(REPORT_TABS.map((tab) => [tab, { count: 0, unread: 0 }]));
  for (const t of Array.isArray(tickets) ? tickets : []) {
    for (const tab of REPORT_TABS) {
      if (!inTab(t, tab)) continue;
      out[tab].count += 1;
      if (t.unread === true) out[tab].unread += 1;
    }
  }
  return out;
}

/** The player's order after unread: a report answered first, then open, working on it, closed. */
export const STATUS_ORDER = Object.freeze(['answered', 'open', 'working', 'closed']);

/**
 * Ticket 115: the list's order, the site's own (src/TicketStore.php listFor, the administrators'
 * listAll turned to the player's side): a reply you have not read first, then by STATUS_ORDER, the
 * newest news first in each (ties keep the order the site sent). A new array; never sorted in place.
 */
export function sortReports(tickets) {
  const rank = (t) => {
    const i = STATUS_ORDER.indexOf(t?.status);
    return i < 0 ? STATUS_ORDER.length : i;
  };
  const when = (t) => Date.parse(String(t?.updatedAt || t?.lastMessageAt || '')) || 0;
  return (Array.isArray(tickets) ? tickets : []).slice().sort((a, b) => (b.unread === true) - (a.unread === true) || rank(a) - rank(b) || when(b) - when(a));
}

/** Whether a thread's first message can still be edited: the site says so, and it is yours. */
export function canEditFirst(thread) {
  const first = Array.isArray(thread?.messages) ? thread.messages[0] : null;
  return thread?.editable === true && first?.author === 'player';
}

/** As the site keeps them (src/BugReports.php MAX_MESSAGE). */
export const REPORT_MAX = 4000;

/** How often the bug icon asks for new replies while the game is online (ms). */
export const UNREAD_POLL_MS = 60000;

/**
 * #744: a later page of the list added after the rows already here, each report once (one the
 * game already holds, opened from a link or just sent, keeps its place). A new array.
 */
export function appendReports(rows, page) {
  const out = Array.isArray(rows) ? rows.slice() : [];
  const have = new Set(out.map((t) => t?.id));
  for (const t of Array.isArray(page) ? page : []) {
    if (!t || have.has(t.id)) continue;
    have.add(t.id);
    out.push(t);
  }
  return out;
}

/** #744: GET tickets for the page from offset (the rows the site has given so far; the first page asks plain). */
export function listPath(offset = 0) {
  const n = Math.floor(Number(offset));
  return Number.isFinite(n) && n > 0 ? `tickets?offset=${n}` : 'tickets';
}

/** How many tickets carry a reply the player has not read. */
export function unreadCount(tickets) {
  return (Array.isArray(tickets) ? tickets : []).filter((t) => t && t.unread === true).length;
}

/** Ticket 58: the search box shows once you have this many reports. */
export const REPORT_FILTER_MIN = 5;

const fold = (x) => String(x ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Ticket 58: whether a report matches the search box: every word of the query is in
 * its subject (the first line of what you wrote) or its status words, any case and
 * accents; "#58" or "58" also finds report 58.
 */
export function matchesReport(t, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${fold(t?.subject)} ${fold(STATUS_WORDS[t?.status] || t?.status)}${showsReplied(t) ? ` ${fold(REPORT_TEXT.replied)}` : ''}${readByTeamAt(t) ? ` ${fold(REPORT_TEXT.readByTeam)}` : ''}`;
  const id = String(Number(t?.id) || '');
  return words.every((w) => hay.includes(w) || (id && w.replace(/^#/, '') === id));
}

/**
 * #225 (Friendly, 2026-11-12): whether a report's row carries the Has a reply tag. The site's
 * adminReplied (an administrator wrote in it at some point) stays after the report closes, so a
 * closed report that was answered reads apart from one closed with no reply. Answered already
 * says so in its chip, so it has no tag.
 */
export function showsReplied(t) {
  return t?.adminReplied === true && t.status !== 'answered';
}

/**
 * Read by the team (Austin 2026-11-12, players asked whether we see their reports): when an
 * administrator first opened the report after your latest message, as the site gives it
 * (src/TicketStore.php readByTeamAt), or ''. Only while you wrote last: once an administrator
 * answers, the reply (Answered, the new reply dot, Has a reply) says it, so the two never show
 * together. A message from you clears it until an administrator opens the report again. Any
 * status, closed too: closing a report never hides it from the team.
 */
export function readByTeamAt(t) {
  if (t?.lastAuthor !== 'player' || t.status === 'answered') return '';
  const at = typeof t.readByTeamAt === 'string' ? t.readByTeamAt : '';
  return at && Number.isFinite(Date.parse(at)) ? at : '';
}

/** A read time: the clock time on the day it is now ("2:14 PM"), else the date ("Nov 3", with the year when not this one). */
export function readWhen(iso, now = Date.now()) {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const n = new Date(now);
  if (d.toDateString() === n.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== n.getFullYear() ? 'numeric' : undefined });
}

/** The marker's words, "Read by the team · 2:14 PM", or '' when the report has none. */
export function readByTeamWords(t, now = Date.now()) {
  const at = readByTeamAt(t);
  if (!at) return '';
  const when = readWhen(at, now);
  return when ? `${REPORT_TEXT.readByTeam} · ${when}` : REPORT_TEXT.readByTeam;
}

/** The report a #report=<id> link names (the reply email's link), or 0. */
export function reportFromHash(hash) {
  const m = /^#report=(\d{1,12})$/.exec(String(hash || ''));
  return m ? Number(m[1]) : 0;
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date. */
export function whenWords(iso, now = Date.now()) {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: d > 300 ? 'numeric' : undefined });
}

/** The list line under a ticket's subject. */
export function ticketLine(t, now = Date.now()) {
  const who = t?.lastAuthor === 'admin' ? 'Administrator replied' : 'You wrote';
  const when = whenWords(t?.lastMessageAt, now);
  return when ? `${who} ${when}` : who;
}

/** #261: a report's number as the player reads it ("Report #266"), or '' without a real id. */
export function reportNumber(t) {
  const id = Number(t?.id);
  return Number.isInteger(id) && id > 0 ? REPORT_TEXT.number(id) : '';
}

/** #261: the row's and the thread's second line: the report's number, then ticketLine. */
export function numberedLine(t, now = Date.now()) {
  return [reportNumber(t), ticketLine(t, now)].filter(Boolean).join(' · ');
}

/** A refusal's words (the site's own message when it gave one). */
export function refusalWords(err, fallback = REPORT_TEXT.failed) {
  return typeof err?.data?.message === 'string' && err.data.message ? err.data.message : fallback;
}

const NONCE = /^[0-9a-f]{10}$/;

/**
 * The ticket routes, signed in. Each call answers the site's JSON or throws
 * an Error with { status, code, data } (data.message is the site's words).
 * @param {{ baseUri: string, fetch?: typeof fetch, nonce?: string }} opts
 */
export function createReportsApi({ baseUri, fetch: fetchFn = globalThis.fetch?.bind(globalThis), nonce: given = '' } = {}) {
  const urls = minnUrls(baseUri);
  let nonce = NONCE.test(String(given)) ? String(given) : '';

  async function refresh() {
    try {
      const r = await fetchFn(urls.nonce, { credentials: 'same-origin', cache: 'no-store' });
      const t = String(await r.text()).trim();
      if (r.ok && NONCE.test(t)) { nonce = t; return true; }
    } catch { /* offline: the caller's answer stands */ }
    return false;
  }

  async function call(path, { method = 'GET', body } = {}) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetchFn(urls.api + path, {
          method,
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { ...(nonce ? { 'X-WP-Nonce': nonce } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        throw Object.assign(new Error('offline'), { status: 0, code: 'offline', data: { message: 'The Groddle site is not answering. Try again in a moment.' } });
      }
      const fresh = res.headers?.get?.('X-WP-Nonce');
      if (fresh) nonce = fresh;
      let data = null;
      try { data = await res.json(); } catch { /* not JSON */ }
      if (res.status === 403 && data?.code === 'rest_cookie_invalid_nonce' && attempt === 0 && (await refresh())) continue;
      if (!res.ok) throw Object.assign(new Error(data?.message || `failed (${res.status})`), { status: res.status, code: data?.code || '', data });
      return data;
    }
  }

  return {
    /** { tickets, unread, more }: a page from offset (#744; a site from before paging sends no more). */
    list: (offset = 0) => call(listPath(offset)),
    /** { unread } */
    unread: () => call('tickets/unread'),
    /** { ticket, messages, picture }; marks it read. */
    thread: (id) => call(`tickets/${Number(id)}`),
    /** { status: sent, id, ticket }; pictures: a JPEG data URL or a list of up to four, or nothing. */
    create: (message, context = {}, pictures = null) => call('tickets', { method: 'POST', body: { message, context, ...picturesBody(pictures) } }),
    /** { ticket, messages }; pictures (G791): a JPEG data URL or a list of up to four, or nothing. */
    reply: (id, message, pictures = null) => call(`tickets/${Number(id)}/messages`, { method: 'POST', body: { message, ...picturesBody(pictures) } }),
    /** { ticket, messages } */
    close: (id) => call(`tickets/${Number(id)}/close`, { method: 'POST' }),
    /** { ticket, messages, editable }: new words for the report's first message, until an administrator reads it. */
    edit: (id, message) => call(`tickets/${Number(id)}/edit`, { method: 'POST', body: { message } }),
    /** { message, reactions }: one of the chat's reactions on (or off) a message of your report (Austin 2026-11-18). */
    react: (id, message, e, on) => call(`tickets/${Number(id)}/messages/${Number(message)}/reactions`, { method: 'POST', body: { e, on: Boolean(on) } }),
    /** { ticket, unread }: the new reply dot back on a report an administrator wrote in last (the list's menu, js/ui/report-row-menu.js). */
    markUnread: (id) => call(`tickets/${Number(id)}/unread`, { method: 'POST' }),
  };
}
