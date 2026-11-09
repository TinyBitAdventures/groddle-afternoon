/**
 * What a moderator's purge does to open windows (Austin 2026-11-09: "If someone spams folks over IM we
 * need to be able to both block them and remove the spam from people's chat windows"). The remake's
 * own: Glitch had nothing like it. Pure rules; features/chat-purge-feature.js runs them on the Social
 * drawer, and groups-feature and player-im-feature on their own lines.
 *
 * - chat_purged {player, since} (groddle-afternoon-server moderation.go): every line that player said
 *   since then leaves every pane (channels, groups, Local, the party, IMs, threads). The frame names a
 *   player, never a line: nobody, the moderator included, reads the IMs a purge takes away.
 * - No IM is ever reported: no IM's words reach a moderator, an administrator or Grok Bot (the
 *   privacy policy promises only an IM's two players read it). IM spam is handled from content-free
 *   counts, the players' own blocks, the IM pause and this purge.
 */

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
