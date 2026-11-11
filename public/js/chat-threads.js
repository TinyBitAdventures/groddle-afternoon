/**
 * Threads on chat lines (the remake's own addition, Austin 2026-11-04: "Is it possible to have threaded
 * conversations on an individual chat?"). Glitch's chat panes were a flat log; its forums had threads.
 *
 * Online only, through the realtime server (groddle-afternoon-server threads.go; IMs im.go im_send with
 * "parent"), kept for good on the site (groddle-afternoon-site src/ChatHistory.php). Any line of Global
 * Chat, Live Help, the Trade Channel, a group's chat or an IM conversation can take replies: they never
 * show in the conversation's own log; the line shows how many it has and who replied last, and opening
 * it shows them in the Social drawer with the input sending there. A thread is named by its line's
 * reaction key (js/chat-reactions.js): "l:<lid>" for a channel or group line, "im:<player>:<line id>"
 * for an IM line. A reply is never a thread of its own.
 */
import { parseKey } from './chat-reactions.js?v=38460172';

/** The words the threads use. */
export const THREAD_TEXT = Object.freeze({
  reply: 'Reply in thread',
  replyLabel: (name) => `Reply in a thread to ${name || 'this'}${name ? "'s message" : ' message'}`,
  head: 'Thread',
  back: 'Back',
  backLabel: (label) => `Back to ${label || 'the chat'}`,
  empty: 'No replies yet. Start the thread below.',
  loading: 'Loading replies…',
  failed: "The replies didn't load. Try again in a moment.",
  placeholder: 'Reply in thread',
  inputLabel: 'Reply in thread',
  offline: 'Replies need you online. Try again in a moment.',
  count: (n) => `${n} ${n === 1 ? 'reply' : 'replies'}`,
});

/** PURE: "3 replies · Ada" (the line's button), '' for none. */
export function summaryText(sum) {
  const n = Math.max(0, Math.floor(Number(sum?.n)) || 0);
  if (!n) return '';
  const last = String(sum?.last?.name || '').trim();
  return last ? `${THREAD_TEXT.count(n)} · ${last}` : THREAD_TEXT.count(n);
}

/** PURE: a server's or the site's summary ({ n, last: { id, name } }) made safe, null for none. */
export function normalSummary(th) {
  const n = Math.floor(Number(th?.n));
  if (!(n > 0)) return null;
  const id = Math.floor(Number(th?.last?.id)) || 0;
  return { n, last: { id: id > 0 ? id : 0, name: String(th?.last?.name || '').slice(0, 40) } };
}

/**
 * PURE: what a thread key in a conversation addresses: { kind: 'channel', channel, parent } (the chat as
 * the server names it: global, help, trade, group:<id>) or { kind: 'im', with, parent }; null otherwise.
 */
export function threadTarget(chatId, tk) {
  const k = parseKey(tk);
  const chat = String(chatId || '');
  if (!k) return null;
  if (k.kind === 'im') return chat === `im:${k.with}` ? { kind: 'im', with: k.with, parent: k.line } : null;
  if (chat === 'global' || chat === 'help' || chat === 'trade' || /^group:[1-9]\d{0,18}$/.test(chat)) return { kind: 'channel', channel: chat, parent: k.line };
  return null;
}

/** PURE: the frame that sends a reply, or null for a bad target or no words. */
export function replyFrame(target, text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!target || !t) return null;
  if (target.kind === 'im') return { t: 'im_send', payload: { to: target.with, text: t, parent: target.parent } };
  return { t: 'thread_say', payload: { channel: target.channel, parent: target.parent, text: t } };
}

/** PURE: the site's key for a channel (ChatHistory: global, help, trade, group-<id>), '' for none. */
export function siteKey(channel) {
  const c = String(channel || '');
  if (c === 'global' || c === 'help' || c === 'trade') return c;
  const m = /^group:([1-9]\d{0,18})$/.exec(c);
  return m ? `group-${m[1]}` : '';
}

/** PURE: replies merged by key (rk), oldest first, each once, at most max. */
export function mergeReplies(have, more, max = 200) {
  const seen = new Set();
  const out = [];
  for (const l of [...(have || []), ...(more || [])]) {
    const k = String(l?.rk || '') || `${l?.at}:${l?.playerId}:${l?.text}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  out.sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
  return out.length > max ? out.slice(out.length - max) : out;
}
