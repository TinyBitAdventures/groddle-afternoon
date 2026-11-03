/**
 * IMs between players: pure rules and copy. features/player-im-feature.js runs them in
 * multiplayer; the realtime server (groddle-afternoon-server im.go) decides who may IM whom,
 * filters the words and keeps the lines for a player who is offline.
 *
 * Source:
 *  - GameServerJS main.js doSendIM 4263-4380: im_send in, im_recv to the other player; refused
 *    for 'self', 'ignoring you', 'on your ignore list' and 'offline', which the client said as
 *    "<Name> is <reason>" (glitch-client RightSideManager.as onIMSend 591-621, :600), with
 *    CLICK_FAILURE (:621). Both players count talked_to (4376-4377: Chatterbox, Gumflapper,
 *    Garrulous Prolixificator and Coat of Open Arms count the players talked to).
 *  - The player menu's IM (InteractionMenuController.as 566-571: label 'IM', tooltip 'Chat with
 *    this person directly.', sort_on 9999, only for a player online and not blocked either
 *    way, 523-529); the buddy list opened that menu (ContactElement.as:270), a profile had 'Send
 *    them an IM' (PlayerInfoDialog.as 172-175).
 *  - An IM that opens a new pane plays INCOMING_CHAT_NEW (RightSideView.as:527), a line in one
 *    already open INCOMING_CHAT (535-542); a line from someone ignored is dropped (RightSideManager.as:219).
 *
 * Ours (Austin 2026-11-02): an IM to a player who is offline waits for them on the server (the
 * source refused it), so the input stays and says so ("<Name> is offline: they'll get it when
 * they're back"); the server keeps each conversation's last lines, so a reload shows them (the
 * client kept 150 a chat in Flash local storage, ChatHistory.as). The conversation is a chat in
 * the Social drawer's Chats list, under Private, noted Buddy or Player.
 */

/** A conversation's id in the Social drawer: im:<player id>. */
export const IM_PREFIX = 'im:';

export const IM_TEXT = Object.freeze({
  verb: 'IM', // InteractionMenuController.as:567
  tooltip: 'Chat with this person directly.', // :569
  buddyNote: 'Buddy',
  playerNote: 'Player',
  close: 'Close',
  closeLabel: (name) => `Close the IM with ${name}`,
  placeholder: (name) => `Message ${name}`,
  inputLabel: (name) => `IM ${name}`,
  empty: (name) => `Say hi to ${name}. Only the two of you see this.`,
  offline: (name) => `${name} is offline: they'll get it when they're back.`,
  notSent: 'You are offline, so that IM did not go.',
  someone: 'Someone',
});

/** The source's reasons, said as "<Name> is <reason>." (RightSideManager.as:600); ours after them. */
export const IM_REFUSALS = Object.freeze({
  self: () => 'You can\'t IM yourself.',
  'ignoring you': (name) => `${name} is ignoring you.`,
  'on your ignore list': (name) => `${name} is on your ignore list.`,
  offline: (name) => `${name} is offline.`,
  full: (name, message) => message || `${name} has plenty of your IMs to read already.`,
  slow_down: () => 'Slow down a little.',
});

/** The sounds (sound-keys.json, recovered "new chat window.mp3" and "private message.mp3"). */
export const IM_SOUND_NEW = 'INCOMING_CHAT_NEW';
export const IM_SOUND = 'INCOMING_CHAT';
export const IM_SOUND_FAIL = 'CLICK_FAILURE';

/** The player menu's verb id. */
export const IM_VERB_ID = 'player_im';

/** PURE: a player's conversation id, '' for no player. */
export function imId(playerId) {
  const n = Math.floor(Number(playerId));
  return n > 0 ? `${IM_PREFIX}${n}` : '';
}

/** PURE: the player a conversation id names, 0 for none. */
export function imPeer(id) {
  const s = String(id || '');
  if (!s.startsWith(IM_PREFIX)) return 0;
  const n = Number(s.slice(IM_PREFIX.length));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * PURE: the IM a link asks for: a player's page on the site links "Send them an IM" (the client's
 * PlayerInfoDialog.as 172-175) to /play/online/#im=<id>&name=<name>. null for anything else.
 */
export function imLinkFrom(hash) {
  const m = /^#im=(\d{1,12})(?:&name=([^&]*))?$/.exec(String(hash || ''));
  if (!m) return null;
  let name = '';
  try { name = decodeURIComponent(m[2] || ''); } catch { name = ''; }
  return { id: Number(m[1]), name: cleanName(name) };
}

/** PURE: a name from the server or a list, one line, at most 40 characters. */
export function cleanName(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

/** PURE: a line the server sent, or null: { id, from, text, at }. */
export function normalLine(l) {
  const id = Math.floor(Number(l?.id));
  const from = Math.floor(Number(l?.from));
  const text = String(l?.text ?? '').slice(0, 400);
  if (!(id > 0) || !(from > 0) || !text) return null;
  return { id, from, text, at: Number(l?.at) || 0 };
}

/** PURE: the conversations of an im_state: [{ id, name, online, lines, unread }], bad ones left out. */
export function normalState(msg) {
  const out = [];
  for (const c of Array.isArray(msg?.convs) ? msg.convs : []) {
    const id = Math.floor(Number(c?.with?.id));
    if (!(id > 0)) continue;
    const lines = (Array.isArray(c.lines) ? c.lines : []).map(normalLine).filter(Boolean).sort((a, b) => a.id - b.id);
    out.push({ id, name: cleanName(c.with.name), online: c.with.online === true, lines, unread: Math.max(0, Math.floor(Number(c.unread)) || 0) });
  }
  return out;
}

/** PURE: a server line as the drawer draws it ({ name, text, mine, at }). */
export function drawerLine(line, { me = 0, myName = 'You', name = '' } = {}) {
  const mine = Number(line.from) === Number(me);
  // RIGHTCLICK: the other player's id, so their name in the conversation opens their menu.
  return { name: mine ? myName : name || IM_TEXT.someone, text: line.text, mine, at: line.at || Date.now(), playerId: mine ? 0 : Number(line.from) || 0 };
}

/** PURE: what a refusal says in the conversation. */
export function refusalText(reason, name, message = '') {
  const fn = IM_REFUSALS[String(reason || '')];
  const who = cleanName(name) || 'That player';
  return fn ? fn(who, message) : String(message || 'That IM did not go.');
}

/** PURE: the note by the name in the Chats list. */
export function imNote(isBuddy) {
  return isBuddy ? IM_TEXT.buddyNote : IM_TEXT.playerNote;
}

/** PURE: the IM verb on another player's menu, or null (no id, or a block either way: InteractionMenuController.as 523). */
export function imVerb({ id, blocked = false } = {}) {
  if (!(Number(id) > 0) || blocked) return null;
  return { id: IM_VERB_ID, label: IM_TEXT.verb, tooltip: IM_TEXT.tooltip, enabled: true, reason: '', durationMs: 0, sort: 9999 };
}

/** PURE: the drawer's options for a conversation (social.channel). */
export function channelOpts(name, { buddy = false, header = null } = {}) {
  const n = cleanName(name) || IM_TEXT.someone;
  return {
    label: n,
    section: 'private',
    note: imNote(buddy),
    placeholder: IM_TEXT.placeholder(n),
    inputLabel: IM_TEXT.inputLabel(n),
    empty: IM_TEXT.empty(n),
    order: 26,
    ...(header ? { header } : {}),
  };
}
