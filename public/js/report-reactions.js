/**
 * Reactions on a bug report's messages (Austin 2026-11-18: "In bug reports can we add a similar emoji
 * response, like we have in live chat? Both for users and on console."; the remake's own, as the
 * chat's are). The set is the chat's (js/chat-reactions.js REACTIONS, the site's data/reactions.json),
 * on any message of your own report (js/ui/reports-sheet.js draws them with the chat's
 * js/ui/reaction-strip.js); an administrator reacts from the console. A message from the site carries
 * "reactions": [{ e, by: [{ id, name, you }], mine }] (groddle-afternoon-site src/TicketReactions.php);
 * a reaction sends no email and is no news (no status, unread or lastMessageAt change). The call is
 * js/reports.js api.react. Kept out of js/reports.js so the phone companion, which loads that, stays small.
 */

import { normalReactions } from './chat-reactions.js?v=e2c21ad4';

/** A report message's reaction key for js/ui/reaction-strip.js ("t:<report>:<message>"), '' without both ids. */
export function reportReactionKey(ticketId, messageId) {
  const t = Math.floor(Number(ticketId));
  const m = Math.floor(Number(messageId));
  return t > 0 && m > 0 ? `t:${t}:${m}` : '';
}

/** PURE: what a report reaction key names: { ticket, message }, or null. */
export function parseReportReactionKey(rk) {
  const m = /^t:(\d{1,12}):(\d{1,12})$/.exec(String(rk || ''));
  return m ? { ticket: Number(m[1]), message: Number(m[2]) } : null;
}

/** PURE: a message's reactions from the site as the chat's chips read them ([{ key, by: [{ id, name }] }]). */
export function reportReactions(raw) {
  return normalReactions(raw);
}

/** PURE: your id among a thread's reactions (the site marks you "you"), or 0 while you have none. */
export function reactorOf(messages) {
  for (const m of Array.isArray(messages) ? messages : []) {
    for (const r of Array.isArray(m?.reactions) ? m.reactions : []) {
      const b = (Array.isArray(r?.by) ? r.by : []).find((x) => x?.you === true);
      const id = Math.floor(Number(b?.id));
      if (id > 0) return id;
    }
  }
  return 0;
}
