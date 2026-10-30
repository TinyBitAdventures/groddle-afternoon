/**
 * TICKETS: a multiplayer player's bug reports as threads with the
 * administrators (groddle-afternoon-site src/Tickets.php, TicketStore.php).
 * The pure rules the Reports sheet (js/ui/reports-sheet.js) draws from, and
 * its calls to groddle/v1/tickets, signed in, with the session's REST nonce
 * (a stale one is fetched again once, as js/minn-account.js does).
 *
 * A ticket: { id, status: open|answered|closed, subject, createdAt, updatedAt,
 * lastMessageAt, lastAuthor: player|admin, unread }; a message: { id, author:
 * player|admin, body, at }. Who wrote is a role: an administrator is never named.
 */

import { minnUrls } from './minn-account.js?v=81339760';

/** The sheet's words (the new-report form keeps the original's, BootError.as 280-290). */
export const REPORT_TEXT = Object.freeze({
  tip: 'Report a bug',
  tipUnread: (n) => (n === 1 ? 'Report a bug (1 new reply)' : `Report a bug (${n} new replies)`),
  sheet: 'Reports',
  newReport: 'New report',
  back: 'Back to your reports',
  title: 'Thanks for reporting a bug!',
  label: 'Please describe the problem you are having:',
  send: 'Send',
  close: 'Close',
  sending: 'Sending…',
  sent: 'Thanks! Your report was sent.',
  empty: 'Please describe the problem you are having.',
  failed: 'That didn\'t send. Try again in a moment.',
  none: 'You have not sent a report yet. Found a bug? Tell us with New report.',
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
  meta: (n) => (n === 0 ? 'No reports yet' : n === 1 ? '1 report' : `${n} reports`),
});

/** The status chip's words. */
export const STATUS_WORDS = Object.freeze({ open: 'Open', answered: 'Answered', closed: 'Closed' });

/** As the site keeps them (src/BugReports.php MAX_MESSAGE). */
export const REPORT_MAX = 2000;

/** How often the bug icon asks for new replies while the game is online (ms). */
export const UNREAD_POLL_MS = 60000;

/** How many tickets carry a reply the player has not read. */
export function unreadCount(tickets) {
  return (Array.isArray(tickets) ? tickets : []).filter((t) => t && t.unread === true).length;
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
    /** { tickets, unread } */
    list: () => call('tickets'),
    /** { unread } */
    unread: () => call('tickets/unread'),
    /** { ticket, messages }; marks it read. */
    thread: (id) => call(`tickets/${Number(id)}`),
    /** { status: sent, id, ticket } */
    create: (message, context = {}) => call('tickets', { method: 'POST', body: { message, context } }),
    /** { ticket, messages } */
    reply: (id, message) => call(`tickets/${Number(id)}/messages`, { method: 'POST', body: { message } }),
    /** { ticket, messages } */
    close: (id) => call(`tickets/${Number(id)}/close`, { method: 'POST' }),
  };
}
