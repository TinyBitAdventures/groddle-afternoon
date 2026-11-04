/**
 * The phone companion's data (play/phone/, Austin 2026-10-31: the game is too
 * much for a phone tab, so phones get reports, mail and friends instead). Pure
 * rules and the calls it makes, kept apart from the page (js/phone/companion.js)
 * so tests drive them directly. Every call is one the game already makes:
 *
 * - Reports: js/reports.js createReportsApi (groddle/v1/tickets: list, unread,
 *   thread, create with an optional picture, reply, close). On a phone the
 *   picture is a photo the player picks, made into a JPEG the size the site
 *   keeps (REPORT_PICTURE; src/ReportPicture.php checks it again).
 * - Mail: the multiplayer save (groddle/v1/save through js/minn-account.js),
 *   read only: the letters are the save's mailbox (js/player-save.js systems.
 *   mailbox, js/mailbox.js rules), plus the letters from other players the
 *   site holds that the save has not taken in yet (groddle/v1/mail, G478:
 *   groddle-afternoon-site src/LedgerMail.php; mergePlayerMail). Nothing here
 *   writes the save or the site; collecting a letter's things stays in the game.
 * - Friends: groddle/v1/buddies (the lists) and groddle/v1/buddies/online (who
 *   of them plays now and where; groddle-afternoon-site src/BuddiesOnline.php).
 *   The companion never opens the realtime socket: it would take over the
 *   player's game on another device.
 */

import { REPORT_PICTURE, base64Size, pictureSize } from '../reports.js?v=ec8320ce';
import { listMailboxMessages, mailSender, normalizeMailboxState } from '../mailbox.js?v=1d97704f';
import { addedYouOnly, normalizeList } from '../buddies.js?v=df41a3bb';
import { letterRow } from '../player-mail.js?v=37933726';

/** localStorage: "full" opens the game on this device anyway; "companion" always opens this page (play/index.html #phone-gate). */
export const DEVICE_KEY = 'groddle-play-device';

/** How often the badges ask again while the page is in view (ms). */
export const POLL_MS = 60000;

/** The page's words (plain, no em dashes). */
export const PHONE_TEXT = Object.freeze({
  title: 'Groddle Afternoon',
  hello: (name) => (name ? `Hello, ${name}` : 'Hello'),
  signOut: 'Sign out',
  signedOutTitle: 'Your Groddle Afternoon, on your phone',
  signedOutBody: 'Sign in to read your reports, your mail and see which friends are playing.',
  checking: 'Checking whether you are signed in…',
  tabs: { reports: 'Reports', mail: 'Mail', friends: 'Friends' },
  computer: 'Groddle Afternoon is played on a computer with a keyboard.',
  computerMore: 'Here you can keep up with your reports, letters and friends.',
  home: 'Visit the home page',
  full: 'Load the full game anyway',
  fullHint: 'It may be too big for this device and close the tab.',
  fullRemembered: 'This device opens the full game.',
  useThisPage: 'Use this page instead',
  refresh: 'Refresh',
  loading: 'Loading…',
  failed: 'That did not load. Try again in a moment.',
  photo: 'Add a photo',
  photoChange: 'Choose another photo',
  photoRemove: 'Remove the photo',
  photoHint: 'A photo or screenshot helps us see the problem. Only you and the administrators see it.',
  photoFailed: 'That photo could not be read, so it will not go with this one.',
  photoAlt: 'The photo going with your report',
  mailNote: 'Reading here changes nothing in your game. Collect items at your mailbox there.',
  mailEmpty: 'No letters yet.',
  mailNoSave: 'Your mailbox opens once you have played online on a computer.',
  mailFrom: (who) => `From ${who}`,
  mailBack: 'Back to your mail',
  mailItem: (n, name) => (n > 1 ? `${n} × ${name}` : name),
  mailCurrants: (n) => (n === 1 ? '1 currant' : `${n.toLocaleString('en-US')} currants`),
  mailCollect: 'Collect it at your mailbox in the game.',
  mailCollected: 'Collected.',
  mailOnItsWay: 'The Frog is still bringing this one in the game.',
  mailAttached: 'With this letter',
  friendsOnline: 'Playing now',
  friendsOffline: 'Buddies',
  friendsAddedYou: 'Added you',
  friendsEmpty: 'No buddies yet. In the game, click another player and choose Add to Friends.',
  friendsNobody: 'None of your buddies is playing right now.',
  friendsNotLive: 'Who is playing could not be checked just now.',
  secretPlace: 'A secret place',
  offline: 'Offline',
  suspendedTitle: 'Account suspended',
  suspendedBody: 'This account is suspended.',
});

/** Where "Load the full game anyway" goes: the page the player came from (play/ for solo), else the online game. */
export function fullGameHref(search = '') {
  return new URLSearchParams(String(search || '')).get('from') === 'solo' ? 'play/' : 'play/online/';
}

/** What a phone report carries besides the words (src/BugReports.php CONTEXT keys). */
export function phoneContext(env = globalThis) {
  return {
    street: '',
    streetName: '',
    x: '',
    y: '',
    build: 'phone',
    page: String(env.location?.pathname || ''),
    agent: String(env.navigator?.userAgent || '').slice(0, 300),
    screen: env.innerWidth ? `${env.innerWidth}x${env.innerHeight}` : '',
    errors: [],
  };
}

/**
 * The sizes to try for a photo, largest first: each width (the shape kept, at
 * most REPORT_PICTURE's box) with each quality, until one fits maxBytes.
 * @returns {{ width: number, height: number, quality: number }[]}
 */
export function photoAttempts(w, h, limits = REPORT_PICTURE) {
  const out = [];
  for (const max of limits.widths) {
    const [width, height] = pictureSize(w, h, Math.min(max, limits.maxWidth), limits.maxHeight);
    if (!width || !height) return [];
    for (const quality of limits.qualities) out.push({ width, height, quality });
  }
  return out;
}

/**
 * A picked photo as the report's JPEG: { url, width, height, bytes } or null.
 * draw(width, height, quality) returns a JPEG data URL (the page's canvas).
 */
export function fitPhoto(w, h, draw, limits = REPORT_PICTURE) {
  for (const a of photoAttempts(w, h, limits)) {
    const url = draw(a.width, a.height, a.quality);
    if (typeof url !== 'string' || !url.startsWith('data:image/jpeg;base64,')) return null;
    const bytes = base64Size(url.slice(url.indexOf(',') + 1));
    if (bytes <= limits.maxBytes) return { url, width: a.width, height: a.height, bytes };
  }
  return null;
}

/** The mailbox in a multiplayer save (groddle/v1/save's answer), or null when the character has none yet. */
export function mailboxFromSave(save) {
  const raw = save?.data?.entries?.playerState;
  if (typeof raw !== 'string' || !raw) return null;
  let state;
  try { state = JSON.parse(raw); } catch { return null; }
  const box = state?.systems?.mailbox;
  return box && typeof box === 'object' ? normalizeMailboxState(box) : null;
}

/** "Cherry" for cherry, "All Spice" for all_spice: an item's name when the catalog has none. */
export function itemWords(id) {
  return String(id || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()) || 'An item';
}

/**
 * The inbox as the page lists it, newest first: letters delivered by now,
 * not archived, not sent by the player.
 */
export function mailRows(state, now = Date.now()) {
  if (!state) return [];
  return listMailboxMessages(state, { now }).map((m) => ({
    id: m.id,
    sender: mailSender(m.sender),
    text: m.text,
    snippet: snippetOf(m.text),
    at: m.deliveryAt || m.sentAt,
    unread: !m.read,
    item: m.attachment ? { id: m.attachment.classTsid, count: m.attachment.count } : null,
    currants: m.currants,
    collected: m.attachmentsClaimed === true,
    onItsWay: m.express === true && m.inMailbox !== true,
  }));
}

/**
 * G478: the inbox rows plus the site's letters from other players (and ones
 * that came back) the save has not taken in yet, newest first; a letter the
 * save has is marked collected when the site says so. `answer` is
 * groddle/v1/mail's (null when it could not be read: the save's rows stand).
 */
export function mergePlayerMail(rows, answer, now = Date.now()) {
  const out = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : [];
  const byId = new Map(out.map((r) => [r.id, r]));
  for (const letter of Array.isArray(answer?.letters) ? answer.letters : []) {
    const m = letterRow(letter, { sessionStart: now });
    if (!m || m.deliveryAt > now) continue;
    const have = byId.get(m.id);
    if (have) {
      if (letter.collected) have.collected = true;
      continue;
    }
    const row = {
      id: m.id,
      sender: mailSender(m.sender),
      text: m.text,
      snippet: snippetOf(m.text),
      at: m.deliveryAt || m.sentAt,
      unread: true,
      item: m.attachment ? { id: m.attachment.classTsid, count: m.attachment.count } : null,
      currants: m.currants,
      collected: m.attachmentsClaimed === true,
      onItsWay: false,
    };
    out.push(row);
    byId.set(row.id, row);
  }
  return out.sort((a, b) => b.at - a.at);
}

/** A letter's first words for the list: one line, cut at a word with an ellipsis. */
export function snippetOf(text, max = 90) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s.,;:!?]+$/, '')}…`;
}

/** Unread letters in the inbox. */
export function unreadLetters(rows) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r.unread).length;
}

/** "Gregarious Grange, Groddle Meadow", or A secret place. */
export function whereWords(p) {
  if (!p?.street) return PHONE_TEXT.secretPlace;
  return p.hub ? `${p.street}, ${p.hub}` : p.street;
}

/**
 * The Friends panel: who of the lists is playing (with where), the other
 * buddies, and who added the player without being added back.
 * @param {object} answer groddle/v1/buddies
 * @param {{ live: boolean, online: { id: number, name: string, street: string, hub: string }[] } | null} presence groddle/v1/buddies/online
 */
export function friendsView(answer, presence) {
  const list = normalizeList(answer);
  const live = presence?.live === true;
  const on = new Map((live && Array.isArray(presence.online) ? presence.online : []).filter((p) => Number(p?.id) > 0).map((p) => [Number(p.id), p]));
  const online = [];
  const seen = new Set();
  for (const b of [...list.buddies, ...list.reverse]) {
    const p = on.get(b.id);
    if (!p || seen.has(b.id)) continue;
    seen.add(b.id);
    online.push({ id: b.id, name: b.name, where: whereWords(p) });
  }
  online.sort((a, b) => a.name.localeCompare(b.name));
  const offline = list.buddies.filter((b) => !seen.has(b.id)).map((b) => ({ id: b.id, name: b.name, mutual: b.mutual }));
  const addedYou = addedYouOnly(list).filter((b) => !seen.has(b.id)).map((b) => ({ id: b.id, name: b.name, isNew: b.isNew }));
  return { live, online, offline, addedYou, empty: list.buddies.length === 0 && list.reverse.length === 0 };
}

const NONCE = /^[0-9a-f]{10}$/;

/**
 * The one call the game had no client for: groddle/v1/buddies/online, signed
 * in with the account's nonce (a stale one is fetched again once, as
 * js/minn-account.js does). Answers { live, online } or throws with .status.
 */
export function createPresenceApi({ account, fetch: fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  let nonce = '';
  const current = () => (NONCE.test(String(account?.nonce || '')) ? account.nonce : nonce);
  async function refresh() {
    try {
      const r = await fetchFn(account.urls.nonce, { credentials: 'same-origin', cache: 'no-store' });
      const t = String(await r.text()).trim();
      if (r.ok && NONCE.test(t)) { nonce = t; return true; }
    } catch { /* offline: the answer stands */ }
    return false;
  }
  return {
    async online() {
      for (let attempt = 0; ; attempt++) {
        const n = attempt === 0 ? current() : nonce;
        let res;
        try {
          res = await fetchFn(`${account.urls.api}buddies/online`, { credentials: 'same-origin', cache: 'no-store', headers: n ? { 'X-WP-Nonce': n } : {} });
        } catch {
          throw Object.assign(new Error('offline'), { status: 0, code: 'offline' });
        }
        let data = null;
        try { data = await res.json(); } catch { /* not JSON */ }
        if (res.status === 403 && data?.code === 'rest_cookie_invalid_nonce' && attempt === 0 && (await refresh())) continue;
        if (!res.ok) throw Object.assign(new Error(data?.message || `failed (${res.status})`), { status: res.status, code: data?.code || '' });
        return { live: data?.live === true, online: Array.isArray(data?.online) ? data.online : [] };
      }
    },
  };
}

/** The item catalog's names (encyclopedia/items/data.json, written by tools/catalog/build.mjs), fetched only for letters that carry an item. */
export function itemNamesFrom(catalog) {
  const out = new Map();
  for (const it of Array.isArray(catalog?.items) ? catalog.items : []) {
    if (it && typeof it.id === 'string' && typeof it.name === 'string') out.set(it.id, it.name);
  }
  return out;
}
