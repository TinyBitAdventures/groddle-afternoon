/**
 * The Butler's IMs between real players (register G367; rules and copy in
 * js/butler-im.js, the server's half in groddle-afternoon-server butler_im.go).
 * Multiplayer only: in solo this feature does nothing and saves nothing.
 *
 * - Your game tells the server you have a Butler (butler_watch), with your
 *   quit / resume choice and whether it should tell you what visitors say.
 * - While you are away from your home street (anywhere else, or in your house
 *   or Tower), your Butler IMs you who comes onto it ("$pc is on your Home
 *   Street.") and what they say there ("$pc said '…'"). Its IMs come 0.5 to
 *   1 s later (sendIM) into a chat named after it in the Social drawer (both
 *   skins), with an arrival also as a notice.
 * - You IM it back in that chat, or with "/butler <command>" in Local chat
 *   from anywhere: announce / a <message> (it says the message to everybody
 *   on your home street), tell / t <message> (to the most recent visitor),
 *   who / w, quit / q, resume / r, help / h. "/butler" alone opens the chat
 *   with its click response and the help hint (main.js doChatCommand 1906-1910).
 * - What it says on your street shows over it and in Local chat, for the
 *   visitors there (neighbours-mp-feature draws your Butler on their copy of
 *   your street) and for you when you are there.
 * - Your Butler gets "Tell me what visitors say" / "Stop telling me things
 *   visitors say" (bag_butler.js eavesdrop / stop_eavesdropping), shown while
 *   its notifications are on, as in the source.
 * - A player you block (or who blocks you) is never reported or spoken to
 *   (the server's rule; this feature also drops a report about a hidden one).
 *
 * QA: canvas data butlerImWatch (the watch sent), butlerImLast (its last IM),
 * butlerImSaid (the last line a Butler said on the street you stand on);
 * window.groddleButlerIm in multiplayer.
 */

import { butlerApi } from './butler-feature.js?v=6e979752';
import { BUTLER_STRINGS } from '../butler.js?v=86316578';
import { BUTLER_IM_TEXT, BUTLER_IM_VERBS, HELP_AGAIN_MS, imDelayMs, imLine, normalizeImPrefs, parseButlerIm } from '../butler-im.js?v=44783638';
import { filterText } from '../word-filter.js?v=9a7a7ebb';

export const BUTLER_IM_FEATURE_ID = 'butler-im';
/** The Butler's chat in the Social drawer. */
export const BUTLER_TAB = 'butler';
const WATCH_CHECK_MS = 1000;
const OFFLINE = 'You are offline, so your Butler cannot hear you.';

let prefs = normalizeImPrefs(null);
let mp = false;
let session = null;

function createSession(engine, client) {
  const social = engine.social || null;
  /** The watch the server has from this socket ('' until sent). */
  let watched = '';
  let watchAt = 0;
  let afterHelp = false;
  let lastNoticeAt = 0;
  let last = '';
  let said = '';
  const timers = new Set();

  const name = () => butlerApi.label?.() || 'Butler';
  const me = () => client.me?.name || 'You';

  function publish() {
    engine.setData?.('butlerImWatch', watched);
    engine.setData?.('butlerImLast', last);
    engine.setData?.('butlerImSaid', said);
  }

  function ensureTab() {
    if (!social) return false;
    const n = name();
    social.channel(BUTLER_TAB, { label: n, prefix: '/butler ', placeholder: `IM ${n} (try help)`, inputLabel: `IM ${n}`, order: 25, section: 'private', note: 'Butler', empty: `${n} will IM you here while you are away from home.` });
    return true;
  }

  /** When the last IM queued shows: each comes after the one before it. */
  let lastImAt = 0;
  /** sendIM: the Butler's IM, 0.5 to 1 s later (ours: never before an earlier one). */
  function butlerIm(text, { toast = false } = {}) {
    if (!text) return;
    const now = Date.now();
    lastImAt = Math.max(now + imDelayMs(), lastImAt + 1);
    const t = setTimeout(() => {
      timers.delete(t);
      last = text;
      if (ensureTab()) social.push(BUTLER_TAB, { name: name(), text });
      else engine.pushActivity?.(`${name()}: ${text}`);
      if (toast) engine.toast?.(`${name()}: ${text}`, 4200);
      publish();
    }, lastImAt - now);
    timers.add(t);
  }

  function ownLine(text) {
    // The owner's own line shows through the word filter (the remake's own addition); the server filters what the Butler says.
    if (ensureTab()) social.push(BUTLER_TAB, { name: me(), text: filterText(text), mine: true });
  }

  function watchState() {
    const on = butlerApi.owned?.() === true;
    return on ? { on, notify: prefs.notify, listen: prefs.listen } : { on: false };
  }

  /** Tell the server about the Butler when it changed, or after a new socket. */
  function watch(force = false) {
    if (client.state !== 'online') {
      watched = '';
      return false;
    }
    const w = watchState();
    const sig = JSON.stringify(w);
    if (!force && sig === watched) return true;
    // Nothing to say before there is a Butler to speak of.
    if (!w.on && !watched) return true;
    if (!client.send('butler_watch', w)) return false;
    watched = sig;
    publish();
    return true;
  }

  client.on('state', ({ state }) => {
    if (state !== 'online') watched = '';
  });
  client.on('hello', () => {
    watched = '';
    watch(true);
  });

  client.on('msg:butler_im', (msg) => {
    if (msg?.kind === 'no_butler') {
      watched = '';
      watch(true);
      return;
    }
    const from = Number(msg?.from?.id) || 0;
    if (from && engine.query?.('realtimeHidden', from)) return;
    let helpAgain = false;
    if (msg?.kind === 'visitor' || msg?.kind === 'speech') {
      helpAgain = msg.kind === 'visitor' && Date.now() - lastNoticeAt > HELP_AGAIN_MS;
      lastNoticeAt = Date.now();
    }
    butlerIm(imLine(msg, { helpAgain }), { toast: msg?.kind === 'visitor' });
  });

  // sendBubbleAndChat on a home street: over the Butler, and a Local line under its name.
  client.on('msg:butler_said', (msg) => {
    const owner = Number(msg?.owner) || 0;
    const text = String(msg?.text || '').slice(0, 300);
    if (!owner || !text || engine.query?.('realtimeHidden', owner)) return;
    let speaker = '';
    if (owner === Number(client.me?.id)) speaker = butlerApi.streetSay?.(engine, text) ? name() : '';
    else speaker = engine.query?.('visitorButlerSay', owner, text, engine) || '';
    engine.chatLine?.(speaker || 'Butler', text);
    said = `${owner}:${text}`;
    publish();
  });

  /** An IM to the Butler ("/butler …", or a line typed in its chat). */
  function command(rest) {
    const text = String(rest || '').replace(/\s+/g, ' ').trim();
    ensureTab();
    if (!text) {
      // main.js 1906-1910: the IM opens with a click response and the help hint.
      social?.select?.(BUTLER_TAB);
      if (social && !social.isOpen?.()) social.open?.({ tab: BUTLER_TAB });
      const list = BUTLER_STRINGS.normalClickResponseList;
      butlerIm(list[Math.floor(Math.random() * list.length) % list.length] + BUTLER_IM_TEXT.clickHelpAddition);
      return true;
    }
    ownLine(text);
    const p = parseButlerIm(text, { afterHelp });
    afterHelp = p.kind === 'help';
    switch (p.kind) {
      case 'quit':
      case 'resume':
        prefs = { ...prefs, notify: p.kind === 'resume' };
        engine.save?.();
        watch();
        butlerIm(p.text);
        break;
      case 'who':
        if (!watch() || !client.send('butler_who', {})) butlerIm(OFFLINE);
        break;
      case 'announce':
      case 'tell':
        if (!watch() || !client.send(p.kind === 'tell' ? 'butler_tell' : 'butler_announce', { text: p.text })) butlerIm(OFFLINE);
        break;
      default:
        butlerIm(p.text);
    }
    return true;
  }

  // The Butler's own verbs that only multiplayer has.
  butlerApi.setMpVerbs?.({
    list(eng) {
      if (eng?.mode !== 'multiplayer' || !prefs.notify) return [];
      const v = prefs.listen ? BUTLER_IM_VERBS.stop : BUTLER_IM_VERBS.eavesdrop;
      return [{ id: v.id, label: v.label, tooltip: v.tooltip, enabled: true }];
    },
    run(eng, id) {
      if (id !== BUTLER_IM_VERBS.eavesdrop.id && id !== BUTLER_IM_VERBS.stop.id) return null;
      prefs = { ...prefs, listen: id === BUTLER_IM_VERBS.eavesdrop.id };
      eng.save?.();
      watch();
      const line = prefs.listen ? BUTLER_IM_TEXT.speechNotificationsOn : BUTLER_IM_TEXT.speechNotificationsOff;
      if (!butlerApi.streetSay?.(eng, line)) eng.pushActivity?.(`${name()}: ${line}`);
      return true;
    },
  });

  watch(true);
  publish();
  return {
    client,
    command,
    watch,
    /** G478: a line of the Butler's own (mail came: butler_data.js ownerMail), when its IMs are on. */
    notice(text) {
      if (butlerApi.owned?.() !== true || !prefs.notify) return false;
      butlerIm(text);
      return true;
    },
    tick(now) {
      if (now < watchAt) return;
      watchAt = now + WATCH_CHECK_MS;
      watch();
    },
    get prefs() { return { ...prefs }; },
  };
}

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer') return null;
  const client = engine.query?.('realtimeClient');
  if (!client) return null;
  session = createSession(engine, client);
  globalThis.groddleButlerIm = session;
  return session;
}

export const butlerImFeature = {
  id: BUTLER_IM_FEATURE_ID,

  init(engine) {
    mp = engine?.mode === 'multiplayer';
  },

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine)?.tick(performance.now());
  },

  /** G478 (player-mail-feature): the Butler IMs "You have mail." when a letter arrives. */
  butlerImNotice(text, engine) {
    const s = ensure(engine);
    return s ? s.notice(String(text || '')) : null;
  },

  /** slash-commands-feature's /butler in multiplayer: an IM to your Butler. */
  butlerImCommand(rest, engine) {
    const s = ensure(engine);
    if (!s || butlerApi.owned?.() !== true) return null;
    return s.command(rest);
  },

  save() {
    return mp ? { ...prefs } : undefined;
  },

  restore(slice, engine) {
    mp = engine?.mode === 'multiplayer';
    prefs = normalizeImPrefs(mp ? slice : null);
  },
};
