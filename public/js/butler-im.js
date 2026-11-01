/**
 * The Butler's IMs between real players (register G367): pure rules and copy.
 * features/butler-im-feature.js runs them in multiplayer; the realtime server
 * (groddle-afternoon-server butler_im.go) relays.
 *
 * Source (GameServerJS):
 *  - items/include/butler_data.js doFarCommand 1127-1296: the owner IMs the
 *    Butler from afar: tell / t (tellRecentRe 1179), announce / a (announceRe
 *    1180), who / w (whoRe 1181), quit (parseQuit 1717-1732), resume
 *    (parseResume 1734-1749), help (helpRe 1186, getHelpText 1052-1069,
 *    showCommandHelp 1072-1123: after "help" the next line is a topic, and
 *    "help announce" gives that command's help instead of doing it).
 *  - notifyOwner 2390-2406 and bag_butler.js onPlayerEnter 4198-4240: the
 *    Butler IMs an owner who is away about visitors and what they say;
 *    clickHelpAddition rides on an arrival notice when ten minutes have
 *    passed since the last notice (4206-4209).
 *  - bag_butler.js sendIM 5397-5407: each IM comes 0.5 to 1 s later, "for
 *    realism".
 *  - bag_butler.js eavesdrop / stop_eavesdropping 263-330: the owner's verbs
 *    on the Butler, with speechNotificationsOn / Off.
 *  - main.js doChatCommand 1906-1910: "/butler" opens the IM with the
 *    Butler's click response and clickHelpAddition.
 *
 * Ours: the IM window is a chat tab named after the Butler in the Social drawer
 * (both skins), and "/butler <command>" in Local chat does the same from
 * anywhere. The help lists only the far commands the remake carries out (the
 * source's also offered dance, jump and zombie from afar, which a visitor
 * would have to see). An IM the remake cannot place gets helpUnknown with
 * clickHelpAddition.
 */

/** butler_strings.js (line numbers there). */
export const BUTLER_IM_TEXT = Object.freeze({
  clickHelpAddition: " You can type 'help' for hints about what I can do!", // :64
  helpIntro: 'What would you like help with? ', // :70
  // :74 helpOptionsOwnerAway, the commands the remake does from afar.
  helpOptions: "Commands: 'tell' (t), 'announce' (a), 'who' (w), 'quit' (q), 'resume' (r).",
  helpTellOwner: "When you are away from home, you can IM 'tell him', 'tell her', or 'tell them' followed by a message and I will say the message to the most recent visitor.", // :87
  helpAnnounce: "When you are away from home, you can IM 'announce' followed by a message and I will say the message to everybody on the street.", // :89
  helpWho: "When you are away from home, you can IM 'who' and I will tell you who is on your street.", // :90
  helpUnknown: "I'm very sorry, but I can't help you.", // :92
  helpStop: 'If you say quit after I tell you about a visitor, I will stop telling you when visitors arrive.', // :93
  helpResume: 'If you say resume when I have stopped sending you IMs about visitors, I will start sending IMs again.', // :94
  farCommandTellFail: "I'm sorry, there is nobody here any more.", // :101
  farCommandTellNoMessage: "I'm sorry, did you give me a message? I couldn't quite hear it. (Say 'help' if you're confused.)", // :102
  notificationsOff: "Ok, I'll stop IMing you when visitors arrive. Say 'resume' (r) if you want me to start again.", // :112
  notificationsOn: "Ok, I'll IM you when a visitor arrives and you're away. Say 'quit' (q) if you want me to stop doing that.", // :113
  visitorNotifyOwnerHere: '$pc is on your Home Street.', // :247
  visitorSpeechReport: "$pc said '$param'", // :250
  speechNotificationsOn: "I will tell you everything your visitors say when you're not here.", // :253
  speechNotificationsOff: 'I will not tell you what your visitors say.', // :254
  whoMessage: 'People on your home street right now: $param', // :286
  whoMessageNone: 'There is nobody on your home street right now.', // :287
  confirmTell: 'Ok, I said "$param" in local chat.', // :288
  confirmAnnounce: 'Ok, I announced "$param".', // :289
});

/** The owner's verbs on the Butler (bag_butler.js 263-330). */
export const BUTLER_IM_VERBS = Object.freeze({
  eavesdrop: Object.freeze({ id: 'eavesdrop', label: 'Tell me what visitors say', tooltip: 'Ask the Butler to tell you what your visitors are saying' }),
  stop: Object.freeze({ id: 'stop_eavesdropping', label: 'Stop telling me things visitors say', tooltip: 'Ask the Butler to stop telling you what your visitors are saying' }),
});

/** sendIM's delay (bag_butler.js:5402 randInt(500, 1000)). */
export function imDelayMs(rand = Math.random) {
  return 500 + Math.floor(rand() * 501);
}

/** An arrival notice adds clickHelpAddition after this long without a notice (bag_butler.js:4207). */
export const HELP_AGAIN_MS = 10 * 60 * 1000;

/** getTextString's $pc / $param. */
export function imText(key, { pc = '', param = '' } = {}) {
  return String(BUTLER_IM_TEXT[key] || '').replace(/\$pc/g, pc).replace(/\$param/g, param);
}

const TELL_RE = /^\s*(tell|say|t)\s+(him\s+|her\s+|them\s+)?/i; // butler_data.js:1179
const TELL_BARE_RE = /^\s*(tell|say|t)\s*$/i;
const ANNOUNCE_RE = /^\s*(\bannounce\b|\ba\b)\s*/i; // :1180
const WHO_RE = /^\s*(\bwho\b|\bw\b)\s*(\?)?$/i; // :1181
const HELP_RE = /\b(help|commands)\b\s*/i; // :1885
const HELP_BARE_RE = /^\s*(h|\?)\s*$/i; // :1886
const HELP_PREFIX_RE = /^\s*(h|\?)\s+/i; // :1911

function isQuit(t) {
  return /^\s*(quit|escape|cancel|esc|stop|don't)/i.test(t) || /^\s*q\s*$/i.test(t);
}
function isResume(t) {
  return /^\s*(resume|start)/i.test(t) || /^\s*r\s*$/i.test(t);
}

/** showCommandHelp for the far commands, or '' (butler_data.js 1072-1123). */
export function commandHelp(text) {
  const t = String(text || '');
  if (/^\s*(\bannounce\b|\ba\b)\s*/i.test(t)) return BUTLER_IM_TEXT.helpAnnounce;
  if (/^\s*(\bwho\b|w)\s*(\?)?$/i.test(t)) return BUTLER_IM_TEXT.helpWho;
  if (/^\s*(tell|say|t)\b/i.test(t)) return BUTLER_IM_TEXT.helpTellOwner;
  if (isQuit(t)) return BUTLER_IM_TEXT.helpStop;
  if (isResume(t)) return BUTLER_IM_TEXT.helpResume;
  return '';
}

/**
 * What one IM to the Butler asks. `afterHelp`: the last IM was "help", so a
 * command named now gets its help (waiting_for_response "help").
 * Returns { kind, text? }: kind announce | tell | who | quit | resume (the
 * server or the game does it), reply (the Butler answers with text), help
 * (the list; the next IM is a topic).
 */
export function parseButlerIm(raw, { afterHelp = false } = {}) {
  const txt = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!txt) return { kind: 'reply', text: BUTLER_IM_TEXT.helpIntro.trim() + ' ' + BUTLER_IM_TEXT.helpOptions };
  if (afterHelp) {
    const h = commandHelp(txt);
    if (h) return { kind: 'reply', text: h };
  }
  // Ours: a tell or an announce with its message is done even when the message says "help"
  // (the source's helpRe came first, so "announce I need help" got the help instead).
  const tell = TELL_RE.test(txt) ? txt.replace(TELL_RE, '').trim() : '';
  if (tell) return { kind: 'tell', text: tell };
  const announce = ANNOUNCE_RE.test(txt) ? txt.replace(ANNOUNCE_RE, '').trim() : '';
  if (announce) return { kind: 'announce', text: announce };
  if (HELP_BARE_RE.test(txt) || txt.replace(HELP_RE, '') === '') {
    return { kind: 'help', text: BUTLER_IM_TEXT.helpIntro + BUTLER_IM_TEXT.helpOptions };
  }
  if (HELP_RE.test(txt) || HELP_PREFIX_RE.test(txt)) {
    const topic = txt.replace(HELP_RE, '').replace(HELP_PREFIX_RE, '');
    return { kind: 'reply', text: commandHelp(topic) || BUTLER_IM_TEXT.helpUnknown };
  }
  if (isQuit(txt)) return { kind: 'quit', text: BUTLER_IM_TEXT.notificationsOff };
  if (isResume(txt)) return { kind: 'resume', text: BUTLER_IM_TEXT.notificationsOn };
  if (WHO_RE.test(txt)) return { kind: 'who' };
  // farCommandTellNoMessage (1204, 1264): tell or announce with nothing to say.
  if (TELL_BARE_RE.test(txt) || TELL_RE.test(txt) || ANNOUNCE_RE.test(txt)) return { kind: 'reply', text: BUTLER_IM_TEXT.farCommandTellNoMessage };
  return { kind: 'reply', text: BUTLER_IM_TEXT.helpUnknown + BUTLER_IM_TEXT.clickHelpAddition };
}

/** The Butler's line for a butler_im message from the server, or '' (none to show). */
export function imLine(msg, { helpAgain = false } = {}) {
  const from = String(msg?.from?.name || 'Someone').slice(0, 64);
  switch (msg?.kind) {
    case 'visitor': return imText('visitorNotifyOwnerHere', { pc: from }) + (helpAgain ? BUTLER_IM_TEXT.clickHelpAddition : '');
    case 'speech': return imText('visitorSpeechReport', { pc: from, param: String(msg.text || '').slice(0, 200) });
    case 'announced': return imText('confirmAnnounce', { param: String(msg.text || '') });
    case 'told': return imText('confirmTell', { param: String(msg.text || '') });
    case 'tell_fail': return BUTLER_IM_TEXT.farCommandTellFail;
    case 'who': {
      const names = (Array.isArray(msg.names) ? msg.names : []).map((n) => String(n).slice(0, 64)).filter(Boolean);
      return names.length ? imText('whoMessage', { param: names.join(', ') }) : BUTLER_IM_TEXT.whoMessageNone;
    }
    default: return '';
  }
}

/** The Butler IM prefs saved with the game: notifications (quit / resume) and eavesdropping. */
export function normalizeImPrefs(slice) {
  const s = slice && typeof slice === 'object' ? slice : {};
  return { v: 1, notify: s.notify !== false, listen: s.listen !== false };
}
