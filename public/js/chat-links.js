/**
 * Links in chat lines (Austin 2026-11-04: "https://groddleafternoon.com/contribute/ shows as plain
 * text"). Glitch made the addresses in a chat line links (StringUtil.as linkify 66-90, called for chat
 * lines in RightSideManager.as 319 and the feed in FeedChatElement.as 228): http://, https:// and
 * www. forms, opened in a new window, with a trailing ? ! or . left out of the link. Speech bubbles
 * over avatars were never linked (ChatBubble), and they are not here either (drawn on the canvas).
 *
 * The remake's rules, safety first:
 * - Only http: and https: links. Bare www.<host> and groddleafternoon.com forms become https://.
 *   Nothing else is ever a link (javascript:, data:, file:, mailto: and the rest stay words), and an
 *   address glued to a word or a scheme ("xhttps://", "javascript:https://") is not one either.
 * - An address with a user name or password ("https://groddleafternoon.com@elsewhere.net") stays
 *   words: the part before the @ is what fools a reader.
 * - Trailing punctuation is left out (. , ! ? ; : quotes, and a ) or ] the address did not open).
 * - At most LINK_MAX characters; a longer address stays words.
 * - The DOM is built with text nodes and textContent only, never HTML from the line.
 * - Every link opens in a new tab (target _blank, rel "noopener noreferrer nofollow ugc"). A link to
 *   this game's own site opens at once; any other first asks, naming the real host the link goes to
 *   ("This link goes to example.com. Open it?"), so the words of a line cannot pass one site off as
 *   another (the host is the browser's own reading of the address, punycode for look-alike letters).
 *
 * linkSegments(text) is the pure part (tests/chat-links.test.js); appendLinkedText(parent, text)
 * draws a line; bindChatLinks(root) answers clicks on the links under root.
 */

/** The longest address that becomes a link. */
export const LINK_MAX = 400;
export const LINK_REL = 'noopener noreferrer nofollow ugc';
/** The game's own site: links here open without asking. */
export const HOME_HOSTS = Object.freeze(['groddleafternoon.com', 'www.groddleafternoon.com']);
/** The local copy (dev only: it is a home host only while the page itself is served from it). */
export const DEV_HOSTS = Object.freeze(['groddle.localhost']);

/** The characters an address may hold (RFC 3986's, ASCII only). */
const URL_CHARS = "A-Za-z0-9\\-._~:/?#\\[\\]@!$&'()*+,;=%";
/**
 * A candidate: a scheme, a www. or the bare home host, at the start or after a character that is not
 * part of a word, an address or a scheme, then address characters.
 */
const CANDIDATE = new RegExp(`(^|[^A-Za-z0-9_@.\\-/:%+])((?:https?:\\/\\/|www\\.|groddleafternoon\\.com(?![A-Za-z0-9-]))[${URL_CHARS}]*)`, 'gi');
const TRAILING = new Set(['.', ',', '!', '?', ';', ':', "'", '"', '*']);
const HOST_OK = /^(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})|localhost|\d{1,3}(?:\.\d{1,3}){3})$/;

const count = (s, ch) => s.split(ch).length - 1;

/** PURE: the address without the punctuation after it ("site.com)." in "(see site.com)." is "site.com"). */
export function trimTrailing(raw) {
  let s = String(raw || '');
  for (;;) {
    const c = s.at(-1);
    if (c === undefined) break;
    if (TRAILING.has(c)) s = s.slice(0, -1);
    else if (c === ')' && count(s, ')') > count(s, '(')) s = s.slice(0, -1);
    else if (c === ']' && count(s, ']') > count(s, '[')) s = s.slice(0, -1);
    else break;
  }
  return s;
}

/**
 * PURE: what an address is as a link, or null when it may not be one:
 * { href (the browser's reading, https:// added to a bare form), host (what the confirm names), home }.
 * `homeHosts`: the hosts that open without asking.
 */
export function readLink(raw, { homeHosts = HOME_HOSTS } = {}) {
  const typed = String(raw || '');
  if (!typed || typed.length > LINK_MAX) return null;
  const scheme = /^(https?):\/\//i.exec(typed);
  const bare = !scheme;
  if (bare && !/^(?:www\.|groddleafternoon\.com(?![A-Za-z0-9-]))/i.test(typed)) return null;
  let u;
  try {
    u = new URL(bare ? `https://${typed}` : typed);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  const hostname = u.hostname.toLowerCase();
  if (!HOST_OK.test(hostname)) return null;
  // A bare form names its host itself: "groddleafternoon.com.example" is not the home host, so it stays words.
  if (bare && !/^www\./i.test(typed) && hostname !== 'groddleafternoon.com') return null;
  const home = homeHosts.includes(hostname);
  return { href: u.href, host: u.host.toLowerCase(), home };
}

/**
 * PURE: a line cut into words and links, in order: [{ text }] and [{ text, href, host, home }]
 * (`text` is what was typed, shown as it was). Words that are next to each other are one piece.
 */
export function linkSegments(text, { homeHosts = HOME_HOSTS } = {}) {
  const s = String(text ?? '');
  const out = [];
  const words = (w) => {
    if (!w) return;
    const last = out.at(-1);
    if (last && !last.href) last.text += w;
    else out.push({ text: w });
  };
  let at = 0;
  CANDIDATE.lastIndex = 0;
  for (let m = CANDIDATE.exec(s); m; m = CANDIDATE.exec(s)) {
    const start = m.index + m[1].length;
    const raw = trimTrailing(m[2]);
    const link = raw ? readLink(raw, { homeHosts }) : null;
    if (!link) {
      // Not a link: look again just after the start (a later scheme inside it gets its turn).
      CANDIDATE.lastIndex = start + 1;
      continue;
    }
    words(s.slice(at, start));
    out.push({ text: raw, ...link });
    at = start + raw.length;
    CANDIDATE.lastIndex = at;
  }
  words(s.slice(at));
  return out;
}

/** The hosts that open without asking on this page: the live site's, and the local copy's while it is the page's own. */
export function homeHostsFor(pageHost = globalThis.location?.hostname || '') {
  const h = String(pageHost || '').toLowerCase();
  return DEV_HOSTS.includes(h) ? [...HOME_HOSTS, h] : [...HOME_HOSTS];
}

/** PURE: the confirm's words for a link to another site. */
export function leaveText(host) {
  return `This link goes to ${host}. Open it?`;
}

/**
 * Appends a chat line's words to `parent`, its addresses as links (text nodes and textContent only).
 * Returns the number of links made.
 */
export function appendLinkedText(parent, text, { doc = globalThis.document, homeHosts = homeHostsFor() } = {}) {
  let n = 0;
  for (const seg of linkSegments(text, { homeHosts })) {
    if (!seg.href) {
      parent.append(doc.createTextNode(seg.text));
      continue;
    }
    const a = doc.createElement('a');
    a.setAttribute('href', seg.href);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', LINK_REL);
    a.setAttribute('class', 'chat-link');
    a.setAttribute('data-chat-link', seg.home ? 'home' : 'away');
    a.setAttribute('data-host', seg.host);
    if (!seg.home) a.setAttribute('title', `Opens ${seg.host}`);
    a.textContent = seg.text;
    parent.append(a);
    n += 1;
  }
  return n;
}

/**
 * Makes the addresses in `root`'s text links, in place (an Activity entry that repeats what someone
 * said, drawn from the game's own markup): only its text nodes are read and split, never its HTML,
 * and text already inside a link is left alone. Returns the number of links made.
 */
export function linkifyTextNodes(root, { doc = globalThis.document, homeHosts = homeHostsFor() } = {}) {
  let n = 0;
  const walk = (node) => {
    for (const child of [...(node.childNodes || [])]) {
      if (child.nodeType === 3) {
        const text = child.nodeValue || '';
        if (!/https?:\/\/|www\.|groddleafternoon\.com/i.test(text)) continue;
        const holder = doc.createElement('span');
        const made = appendLinkedText(holder, text, { doc, homeHosts });
        if (!made) continue;
        n += made;
        child.replaceWith(...holder.childNodes);
      } else if (child.nodeType === 1 && child.tagName !== 'A' && child.tagName !== 'BUTTON') walk(child);
    }
  };
  walk(root);
  return n;
}

let asking = null;

/** The confirm for a link to another site, if one is up. */
export function closeLinkConfirm() {
  const box = asking;
  asking = null;
  box?.cleanup?.();
  box?.node?.remove?.();
}

function placeNear(box, link, win) {
  const r = link.getBoundingClientRect?.();
  const vw = win.innerWidth || 0;
  const vh = win.innerHeight || 0;
  const bw = box.offsetWidth || 260;
  const bh = box.offsetHeight || 90;
  let left = r ? r.left : 12;
  let top = r ? r.bottom + 6 : 12;
  if (left + bw > vw - 8) left = Math.max(8, vw - bw - 8);
  if (top + bh > vh - 8 && r) top = Math.max(8, r.top - bh - 6);
  box.style.left = `${Math.round(left)}px`;
  box.style.top = `${Math.round(top)}px`;
}

/**
 * The small confirm beside a link to another site. Its Open is itself a link to the same address
 * (so the browser opens it as any link, never as a pop-up); Cancel, Escape or a click elsewhere close it.
 */
export function openLinkConfirm(link, { doc = globalThis.document, win = globalThis, keys = false } = {}) {
  closeLinkConfirm();
  const href = link.getAttribute('href');
  const host = link.getAttribute('data-host');
  if (!href || !host) return null;
  const node = doc.createElement('div');
  node.className = 'chat-link-confirm';
  node.setAttribute('role', 'alertdialog');
  node.setAttribute('aria-modal', 'false');
  node.setAttribute('data-chat-link-confirm', '');
  const id = `chat-link-confirm-${Date.now().toString(36)}`;
  const p = doc.createElement('p');
  p.id = id;
  p.className = 'chat-link-confirm-text';
  // The host on its own, so it reads apart from the words around it.
  p.append(doc.createTextNode('This link goes to '));
  const b = doc.createElement('b');
  b.textContent = host;
  p.append(b, doc.createTextNode('. Open it?'));
  node.setAttribute('aria-labelledby', id);
  const row = doc.createElement('div');
  row.className = 'chat-link-confirm-row';
  const open = doc.createElement('a');
  open.className = 'chat-link-confirm-open';
  open.setAttribute('href', href);
  open.setAttribute('target', '_blank');
  open.setAttribute('rel', LINK_REL);
  open.setAttribute('data-chat-link-open', '');
  open.textContent = 'Open';
  const cancel = doc.createElement('button');
  cancel.type = 'button';
  cancel.className = 'chat-link-confirm-cancel';
  cancel.setAttribute('data-chat-link-cancel', '');
  cancel.textContent = 'Cancel';
  row.append(open, cancel);
  node.append(p, row);
  (doc.getElementById('game-root') || doc.body).append(node);
  placeNear(node, link, win);
  const back = () => {
    if (keys) link.focus?.({ preventScroll: true });
  };
  open.addEventListener('click', () => {
    // The browser follows the link (a new tab); the confirm goes.
    win.setTimeout?.(() => closeLinkConfirm(), 0);
  });
  cancel.addEventListener('click', () => {
    closeLinkConfirm();
    back();
  });
  // Keys in the confirm stay in it (they never walk the avatar); Escape closes it.
  node.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLinkConfirm();
      back();
    }
  });
  const onDocKey = (e) => {
    if (e.key !== 'Escape' || node.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    closeLinkConfirm();
  };
  const onDocDown = (e) => {
    if (node.contains(e.target) || e.target === link) return;
    closeLinkConfirm();
  };
  doc.addEventListener('keydown', onDocKey, true);
  doc.addEventListener('pointerdown', onDocDown, true);
  asking = {
    node,
    link,
    cleanup: () => {
      doc.removeEventListener('keydown', onDocKey, true);
      doc.removeEventListener('pointerdown', onDocDown, true);
    },
  };
  if (keys) open.focus?.({ preventScroll: true });
  return node;
}

/** Whether the confirm is up (for `link`, when given). */
export function linkConfirmOpen(link = null) {
  return Boolean(asking?.node && asking.node.isConnected !== false && (!link || asking.link === link));
}

/**
 * Answers clicks on chat links under `root`: a link home opens as it is (a new tab); a link anywhere
 * else is held for the confirm, from a click, a middle click, a modified click or Enter.
 */
export function bindChatLinks(root, { doc = globalThis.document, win = globalThis } = {}) {
  if (!root?.addEventListener) return false;
  const hold = (e) => {
    const a = e.target?.closest?.('a[data-chat-link]');
    if (!a || !root.contains(a)) return;
    // A link home, and anything that is not a chat link of ours, the browser follows.
    if (a.getAttribute('data-chat-link') === 'home') return;
    e.preventDefault();
    e.stopPropagation();
    if (linkConfirmOpen(a)) return;
    openLinkConfirm(a, { doc, win, keys: e.type === 'click' && e.detail === 0 });
  };
  root.addEventListener('click', hold);
  // A middle click opens a tab without a click event: hold it too.
  root.addEventListener('auxclick', (e) => {
    if (e.button === 1) hold(e);
  });
  // A press on a link never takes the keyboard from the world (as the drawer's other buttons).
  root.addEventListener('pointerdown', (e) => {
    if (e.button === 0 && e.target?.closest?.('a[data-chat-link]')) e.preventDefault?.();
  });
  return true;
}
