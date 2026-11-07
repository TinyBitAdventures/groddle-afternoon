/**
 * Administrators delete a channel line from inside the game (register G567, Austin 2026-11-07), as the
 * website's /chat/ line menu does (groddle-afternoon-site community/chat-menus.js Delete line). The
 * remake's own: Glitch's channels had no deletion.
 *
 * - Who: the site's groddle/v1/me says "admin" for an account with manage_options (src/Player.php);
 *   js/online-boot.js carries it into the boot data (GRODDLE_MP_BOOT.admin). It only decides whether
 *   the button is drawn: the delete goes to the site's DELETE chat/channels/<key>/lines/<lid>
 *   (src/ChatHistory.php deleteLine), whose route checks manage_options again, so a player who sets
 *   the flag by hand is refused (403) and nothing is deleted.
 * - What: a line of Global Chat, Live Help or the Trade Channel, or a reply in one of their threads (the
 *   channels /chat/ deletes in: its chat-pure.js deletableKey). Never Local, the party, a group's chat
 *   or an IM (IMs are private: nothing here reads them).
 * - How: the Social drawer (js/ui/social-drawer.js, MODERATION) gives such a line a small Delete line
 *   button beside its reply button, shown as that one is (hover, the keyboard, always a little on touch),
 *   in both interfaces; it opens a confirm menu (js/ui/context-menu.js, the game's menu, no
 *   window.confirm) with Cancel focused. Picking Delete for everyone asks the site; the realtime server's
 *   chat_deleted then takes the line (and its thread's replies with it) away for everyone
 *   (features/groups-feature.js, features/chat-threads-feature.js).
 */
import { parseKey } from './chat-reactions.js?v=d65d555b';

/** The words (no em-dashes: tests/chat-admin.test.js). */
export const DELETE_TEXT = Object.freeze({
  button: 'Delete line',
  buttonLabel: (name) => (name ? `Delete ${name}'s line for everyone` : 'Delete your line for everyone'),
  title: 'Delete this line for everyone?',
  confirm: 'Delete for everyone',
  confirmTip: 'It disappears from the game and the website, and does not come back.',
  cancel: 'Cancel',
  cancelTip: 'Keep the line.',
  deleted: 'Line deleted for everyone.',
  failed: 'That didn\'t work. Try again in a moment.',
});

/** The confirm menu's rows; Cancel is the one focused (DELETE_CONFIRM_FOCUS). */
export const DELETE_CONFIRM_FOCUS = 1;
export function deleteConfirmRows() {
  return [
    { id: 'confirm', label: DELETE_TEXT.confirm, tip: DELETE_TEXT.confirmTip },
    { id: 'cancel', label: DELETE_TEXT.cancel, tip: DELETE_TEXT.cancelTip },
  ];
}

/** PURE: the site's channel key ('global', 'help', 'trade') of a drawer conversation whose lines an administrator may delete, or ''. */
export function deletableChannel(chatId) {
  const c = String(chatId || '');
  return c === 'global' || c === 'help' || c === 'trade' ? c : '';
}

/** PURE: a channel line's lid from its key ("l:<lid>"), else 0 (an IM line's key is never one). */
export function lineLidOf(rk) {
  const k = parseKey(rk);
  return k?.kind === 'line' && k.line > 0 ? k.line : 0;
}

/** PURE: whether the drawer draws Delete line on a line: an administrator, a deletable channel, a kept line. */
export function mayDelete({ admin = false, chatId = '', line = null } = {}) {
  return admin === true && deletableChannel(chatId) !== '' && Boolean(line) && !line.note && !line.sep && lineLidOf(line.rk) > 0;
}
