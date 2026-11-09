/**
 * Reporting an IM, and what a moderator's purge or deleted line does to open windows (Austin
 * 2026-11-09: "Put Grok Bot in charge of keeping the game safe"; Grok Bot and the administrators see
 * an IM's words only when a recipient reports it). The remake's own: Glitch had no report on an IM.
 * Pure rules and copy; features/im-report-feature.js runs them in multiplayer.
 *
 * - Report: a line the other player sent you in an IM (the drawer's small flag button on it, both
 *   skins), or the conversation (its head's Report, which reports their newest line). The window asks
 *   for an optional note and offers "Block them too". The site keeps the line and the conversation
 *   around it from its own copy (groddle-afternoon-site src/ModReports.php); the game sends its own
 *   copy (at most REPORT_LINES lines) only for a line said a moment ago that has not reached the site.
 *   The reported player is not told. IMs sent before reports began stay private (the site refuses).
 * - chat_purged {player, since} (groddle-afternoon-server moderation.go): every line that player said
 *   since then leaves every pane (channels, groups, Local, the party, IMs, threads); im_deleted
 *   {with, line, at}: one reported IM line leaves both players' conversation.
 */

import { parseKey } from './chat-reactions.js?v=d65d555b';

export const REPORT_LINES = 20;
export const REPORT_NOTE_MAX = 500;

/** The words (no em-dashes; plain words). */
export const REPORT_TEXT = Object.freeze({
  button: 'Report',
  buttonLabel: (name) => `Report this IM from ${name || 'this player'}`,
  headButton: 'Report',
  headLabel: (name) => `Report ${name || 'this player'}'s IMs`,
  title: 'Report this IM',
  intro: (name) => `Our moderators will see this line and the conversation around it. ${name || 'They'} won't be told.`,
  noteLabel: 'Anything we should know? (optional)',
  notePlaceholder: 'What happened',
  block: (name) => `Block ${name || 'them'} too`,
  send: 'Send report',
  cancel: 'Cancel',
  sending: 'Sending…',
  sent: 'Thanks for telling us. A moderator will look at it.',
  already: 'You reported that line already. Thanks.',
  nothing: (name) => `${name || 'They'} haven't sent you anything to report here.`,
  failed: 'That report did not go. Try again in a moment.',
});

/** PURE: the IM line a drawer row is (its key and the conversation), or null. { with, line }. */
export function imLineOf(chatId, line) {
  const m = /^im:(\d+)$/.exec(String(chatId || ''));
  const k = parseKey(line?.rk);
  if (!m || !k || k.kind !== 'im' || k.with !== Number(m[1])) return null;
  return { with: k.with, line: k.line };
}

/** PURE: whether the drawer draws Report on a line: an IM line from the other player (never yours, a note or a separator). */
export function mayReport(chatId, line) {
  return Boolean(line) && !line.mine && !line.note && !line.sep && imLineOf(chatId, line) !== null;
}

/** PURE: the newest line the other player sent in a conversation's kept lines, or null. */
export function newestFrom(lines, withId) {
  const list = Array.isArray(lines) ? lines : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const l = list[i];
    if (Number(l?.from) === Number(withId) && Number(l?.id) > 0) return l;
  }
  return null;
}

/** PURE: a note as the site takes it: one plain line, at most REPORT_NOTE_MAX characters. */
export function reportNote(text) {
  return [...String(text || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, REPORT_NOTE_MAX).join('');
}

/**
 * PURE: the report the site takes (POST mod/report/im). `lines` is the game's copy of the conversation
 * (server lines { id, from, text, at }): only the two players' lines, at most REPORT_LINES, ending a few
 * lines after the reported one. Null when the line is not one the other player sent.
 */
export function reportBody({ withId, me, line, lines = [], note = '' } = {}) {
  const w = Math.floor(Number(withId));
  const l = (Array.isArray(lines) ? lines : []).find((x) => Number(x?.id) === Number(line?.id) && Number(x?.at) === Number(line?.at)) || line;
  if (!(w > 0) || !l || Number(l.from) !== w || !(Number(l.id) > 0) || !(Number(l.at) > 0)) return null;
  const mine = (x) => Number(x?.from) === w || Number(x?.from) === Number(me);
  const clean = (Array.isArray(lines) ? lines : []).filter((x) => mine(x) && Number(x.id) > 0 && Number(x.at) > 0 && !x.parent)
    .map((x) => ({ id: Math.floor(Number(x.id)), from: Math.floor(Number(x.from)), text: String(x.text || ''), at: Math.floor(Number(x.at)) }));
  const i = clean.findIndex((x) => x.id === Number(l.id) && x.at === Number(l.at));
  const window = i < 0 ? [] : clean.slice(Math.max(0, i - (REPORT_LINES - 6)), i + 6).slice(0, REPORT_LINES);
  return { with: w, line: Math.floor(Number(l.id)), at: Math.floor(Number(l.at)), note: reportNote(note), lines: window };
}

/** PURE: what the player is told after the site answers (status) or refuses (an error with a message). */
export function reportResultText(answer, error = null) {
  if (error) return String(error?.message || REPORT_TEXT.failed);
  return answer?.status === 'already' ? REPORT_TEXT.already : REPORT_TEXT.sent;
}

/** PURE: whether a line (a drawer, channel or IM line) goes in a purge of player since `since` (ms). */
export function purged(line, { player, since = 0, me = 0 } = {}) {
  const p = Math.floor(Number(player));
  if (!(p > 0) || !line) return false;
  const by = Number(line.playerId ?? line.from ?? line.id);
  const who = by === p || (line.mine === true && Number(me) === p);
  return who && (Number(line.at) || 0) >= (Number(since) || 0);
}

/** PURE: lines without the purged ones (the same array when none went). */
export function withoutPurged(lines, opts) {
  const list = Array.isArray(lines) ? lines : [];
  const kept = list.filter((l) => !purged(l, opts));
  return kept.length === list.length ? list : kept;
}

/** PURE: a chat_purged frame's { player, since }, or null. */
export function purgeOf(msg) {
  const player = Math.floor(Number(msg?.player));
  const since = Math.max(0, Math.floor(Number(msg?.since)) || 0);
  return player > 0 ? { player, since } : null;
}
