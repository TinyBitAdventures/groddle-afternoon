/**
 * The Community boards' notices in the game's Activity (Austin 2026-11-04: a reply to your thread or
 * a post that quotes you shows in Activity while you play online). The site keeps them
 * (groddle-afternoon-site src/Community.php: POST community/notices/game hands each over once);
 * features/community-mp-feature.js asks now and then and logs them. Multiplayer only: solo has no
 * account and no boards.
 *
 * Pure: what an Activity line says and its markup (a link to the post on the website, opened in a
 * new tab so the game stays).
 */

/** How often the game asks (ms), and how long after it starts. */
export const NOTICE_POLL_MS = 120000;
export const NOTICE_FIRST_MS = 20000;

/** Notices one answer logs at most (the rest wait for the next ask). */
export const NOTICE_MAX = 5;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** PURE: a notice as the site sent it, checked, or null. */
export function normalCommunityNotice(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = Math.floor(Number(raw.id));
  const text = typeof raw.text === 'string' ? raw.text.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  const url = typeof raw.url === 'string' && /^\/chat\/[a-z-]+\/\d+(?:-[a-z0-9-]+)?\/(?:\?page=\d+)?(?:#post-\d+)?$/.test(raw.url) ? raw.url : '';
  if (!(id > 0) || !text || !url) return null;
  return { id, text, url };
}

/** PURE: the Activity line's markup: the words (escaped) and a "Read it" link to the post. */
export function communityNoticeHtml(n) {
  return `${esc(n.text)} <a class="chat-link" data-chat-link="home" href="${esc(n.url)}" target="_blank" rel="noopener">Read it</a>`;
}

/** PURE: the notices an answer brings, checked and capped. */
export function communityNoticesFrom(answer) {
  const list = Array.isArray(answer?.notices) ? answer.notices : [];
  return list.map(normalCommunityNotice).filter(Boolean).slice(0, NOTICE_MAX);
}
