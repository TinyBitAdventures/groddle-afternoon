/**
 * IMs between players (rules and copy in js/player-im.js; the server's half is
 * groddle-afternoon-server im.go). Multiplayer only: in solo this feature does nothing,
 * draws nothing and saves nothing.
 *
 * - Each conversation is a chat in the Social drawer's Chats list (both skins), id im:<player>,
 *   under Private with the note Buddy or Player, its unread count and badge, "Message <name>" in
 *   the input, and Close in its head (it leaves your list until the next line).
 * - Open one from another player's menu (IM, as the source's player menu:
 *   InteractionMenuController.as 566-571), from the Buddies tab or Menu, Buddies (IM by each
 *   buddy; the source opened the player menu from the buddy list, ContactElement.as:270), from
 *   a player's page on the site ("Send them an IM", PlayerInfoDialog.as 172-175: a link to
 *   /play/online/#im=<id>&name=<name>), or when an IM comes (the source opened the pane,
 *   RightSideView.as 524-527).
 * - Your line shows when the server sends it back, through its word filter (NCMsgHandler.as
 *   do_IM_SEND 1395-1408). To someone offline it waits on the server and the conversation says
 *   "<Name> is offline: they'll get it when they're back". A refusal says the source's
 *   "<Name> is <reason>" (RightSideManager.as:600) with CLICK_FAILURE.
 * - The server keeps the last lines of each conversation (im.go): they come back after a
 *   reload (im_state), unread counts with them; reading one tells the server (im_read).
 * - An IM from someone you block is never shown (RightSideManager.as:219; the server refuses it
 *   too). INCOMING_CHAT_NEW when an IM opens a new conversation, INCOMING_CHAT for the next lines.
 * - Each IM counts talked_to for both players (main.js 4376-4377: Chatterbox and its kin).
 *
 * QA: canvas data imConvs (id:unread,...), imLast (the last thing that happened);
 * window.groddleIm in multiplayer (open(id, name), send(id, text), convs()).
 */

import {
  IM_SOUND,
  IM_SOUND_FAIL,
  IM_SOUND_NEW,
  IM_TEXT,
  IM_VERB_ID,
  channelOpts,
  cleanName,
  drawerLine,
  imId,
  imLinkFrom,
  imPeer,
  imVerb,
  normalLine,
  normalState,
  refusalText,
} from '../player-im.js?v=b301574b';

export const PLAYER_IM_FEATURE_ID = 'player-im';

let session = null;
let guard = false;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

function createSession(engine, client) {
  const social = engine.social || null;
  /** player id -> { id, name, online, lines: [server lines], unread (the server's), offlineSaid } */
  const convs = new Map();
  const heads = new Map();
  /** talked_to counted this session (a group_count counts players, not lines). */
  const talked = new Set();
  let last = '';

  const me = () => Number(client.me?.id) || 0;
  const myName = () => client.me?.name || 'You';
  const hidden = (id) => Boolean(engine.query?.('realtimeHidden', id));
  const buddies = () => engine.query?.('buddyNames') || [];
  const isBuddy = (id) => buddies().some((b) => Number(b.id) === Number(id));

  function nameOf(id, fallback = '') {
    const c = convs.get(id);
    return cleanName(fallback) || c?.name || cleanName(buddies().find((b) => Number(b.id) === id)?.name)
      || cleanName((client.players || []).find?.((p) => Number(p.id) === id)?.name) || IM_TEXT.someone;
  }

  function publish() {
    engine.setData?.('imConvs', [...convs.values()].map((c) => `${c.id}:${social?.unread?.(imId(c.id)) ?? c.unread}`).join(','));
    engine.setData?.('imLast', last);
  }

  function note(what) {
    last = what;
    publish();
  }

  function headFor(id) {
    let h = heads.get(id);
    if (!h) {
      h = el('div', { class: 'social-chan-head', 'data-im-head': String(id) });
      const close = el('button', { type: 'button', 'data-im-close': String(id) }, IM_TEXT.close);
      close.addEventListener('click', () => closeConv(id));
      h.append(close);
      heads.set(id, h);
    }
    h.querySelector('[data-im-close]')?.setAttribute('aria-label', IM_TEXT.closeLabel(nameOf(id)));
    return h;
  }

  function conv(id, name = '') {
    let c = convs.get(id);
    if (!c) {
      c = { id, name: '', online: false, lines: [], unread: 0, offlineSaid: false };
      convs.set(id, c);
    }
    const n = cleanName(name);
    if (n) c.name = n;
    if (!c.name) c.name = nameOf(id);
    return c;
  }

  /** Hands a conversation to the drawer (made or renamed); true when it was new there. */
  function handOver(c) {
    if (!social) return false;
    const cid = imId(c.id);
    const fresh = !social.has(cid);
    social.channel(cid, channelOpts(c.name, { buddy: isBuddy(c.id), header: headFor(c.id) }));
    return fresh;
  }

  function linesFor(c) {
    return c.lines.map((l) => drawerLine(l, { me: me(), myName: myName(), name: c.name, withId: c.id }));
  }

  function countTalk(id) {
    if (talked.has(id)) return;
    talked.add(id);
    engine.achievement?.(`talked_to:${id}`, 1);
  }

  /** im_state: your conversations as the server keeps them (after each new socket). */
  function onState(msg) {
    const list = normalState(msg).filter((c) => !hidden(c.id));
    const keep = new Set(list.map((c) => c.id));
    for (const s of list) {
      const c = conv(s.id, s.name);
      c.lines = s.lines;
      c.online = s.online;
      c.unread = s.unread;
      handOver(c);
      social?.setLines(imId(c.id), linesFor(c));
      social?.setUnread?.(imId(c.id), s.unread);
      if (s.unread && s.lines.some((l) => l.from === c.id)) countTalk(c.id);
    }
    // A conversation the server no longer has goes, unless it is the one you are writing in.
    for (const id of [...convs.keys()]) {
      if (keep.has(id) || (social?.showing === imId(id) && !convs.get(id).lines.length)) continue;
      convs.delete(id);
      heads.delete(id);
      social?.drop(imId(id));
    }
    note(`state:${list.length}`);
  }

  /** im: a line, yours (sent back) or theirs. */
  function onLine(msg) {
    const id = Math.floor(Number(msg?.with?.id));
    const line = normalLine(msg?.line);
    if (!(id > 0) || !line || hidden(id)) return;
    const c = conv(id, msg.with.name);
    if (c.lines.some((l) => l.id === line.id)) return;
    c.lines.push(line);
    while (c.lines.length > 200) c.lines.shift();
    c.online = msg.with.online === true;
    const mine = line.from === me();
    const fresh = handOver(c);
    social?.push(imId(id), drawerLine(line, { me: me(), myName: myName(), name: c.name, withId: id }));
    countTalk(id);
    if (mine) {
      if (!c.online && !c.offlineSaid) {
        c.offlineSaid = true;
        social?.push(imId(id), { note: true, text: IM_TEXT.offline(c.name) });
      }
      if (c.online) c.offlineSaid = false;
      note(`sent:${id}`);
    } else {
      c.offlineSaid = false;
      c.unread = Math.max(0, Math.floor(Number(msg.unread)) || 0);
      engine.playSound?.(fresh ? IM_SOUND_NEW : IM_SOUND, { volume: 0.5 });
      if (fresh && social && !social.isOpen?.()) engine.toast?.(`${c.name}: ${line.text}`, 3600);
      note(`got:${id}`);
    }
    publish();
  }

  function onRefused(msg) {
    const id = Math.floor(Number(msg?.with)) || 0;
    const reason = String(msg?.reason || '');
    const c = id > 0 ? conv(id) : null;
    const text = refusalText(reason, c?.name || '', String(msg?.message || ''));
    engine.playSound?.(IM_SOUND_FAIL, { volume: 0.4 });
    if (c && social) {
      handOver(c);
      social.push(imId(id), { note: true, text });
    } else engine.toast?.(text, 2800);
    note(`no:${reason}`);
  }

  /** Opens the conversation with a player in the drawer, with the keyboard in its input. */
  function open(id, name = '', { focus = true } = {}) {
    id = Math.floor(Number(id));
    if (!(id > 0) || id === me() || !social) return false;
    if (hidden(id)) {
      // Someone you block (a player's page's IM link, a name in an old line): the server's
      // refusal in the source's words (main.js:4350, RightSideManager.as:600), and no conversation.
      engine.playSound?.(IM_SOUND_FAIL, { volume: 0.4 });
      engine.toast?.(refusalText('on your ignore list', nameOf(id, name)), 2800);
      note('no:on your ignore list');
      return true;
    }
    const c = conv(id, name);
    handOver(c);
    social.select(imId(id));
    if (!social.isOpen()) social.open();
    if (focus) social.focusInput?.();
    note(`open:${id}`);
    return true;
  }

  function send(id, text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t || !(id > 0)) return false;
    if (client.state !== 'online' || !client.send('im_send', { to: id, text: t })) {
      if (social) social.push(imId(id), { note: true, text: IM_TEXT.notSent });
      return true;
    }
    return true;
  }

  function closeConv(id) {
    client.send('im_close', { with: id });
    convs.delete(id);
    heads.delete(id);
    social?.drop(imId(id));
    note(`closed:${id}`);
  }

  // A line typed in a conversation goes to that player (before the game's own submit handler;
  // slash commands stay the game's).
  const dock = document.getElementById?.('local-chat-dock');
  const input = document.getElementById?.('local-chat-input');
  dock?.addEventListener('submit', (e) => {
    const id = imPeer(social?.showing);
    if (!id || !input) return;
    const text = String(input.value || '');
    if (text.trim().startsWith('/')) return;
    e.preventDefault?.();
    e.stopPropagation?.();
    input.value = '';
    send(id, text);
  }, true);

  client.on('hello', () => {
    for (const c of convs.values()) c.offlineSaid = false;
    client.send('im_sync', {});
  });
  client.on('msg:im_state', onState);
  client.on('msg:im', onLine);
  client.on('msg:im_no', onRefused);
  if (client.state === 'online') client.send('im_sync', {});

  publish();
  return {
    client,
    open,
    send,
    close: closeConv,
    convs: () => [...convs.values()].map((c) => ({ id: c.id, name: c.name, online: c.online, unread: c.unread, lines: c.lines.length })),
    /** Tells the server a conversation was read once the drawer has shown it (its count went to 0). */
    tick() {
      if (!social || client.state !== 'online') return;
      // A player's page's "Send them an IM" (/play/online/#im=<id>&name=<name>): once, when online.
      const link = imLinkFrom(globalThis.location?.hash);
      if (link) {
        try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* the link stays */ }
        open(link.id, link.name);
      }
      for (const c of convs.values()) {
        if (c.unread > 0 && social.unread(imId(c.id)) === 0) {
          c.unread = 0;
          client.send('im_read', { with: c.id });
          publish();
        }
      }
      // A player blocked since: their conversation goes.
      for (const id of [...convs.keys()]) if (hidden(id)) {
        convs.delete(id);
        heads.delete(id);
        social.drop(imId(id));
      }
    },
    verb(target) {
      return imVerb({ id: target.playerId, blocked: hidden(Number(target.playerId)) });
    },
  };
}

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client || !engine.social) return null;
  session = createSession(engine, client);
  globalThis.groddleIm = session;
  return session;
}

/** When the last read check ran (onTick's clock): twice a second is plenty. */
let tickAt = -Infinity;

export const playerImFeature = {
  id: PLAYER_IM_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    const s = ensure(engine);
    if (!s || (Number(now) >= tickAt && Number(now) - tickAt < 500)) return;
    tickAt = Number(now) || 0;
    s.tick();
  },

  /** Another player's Glitch: IM (InteractionMenuController.as 566-571). */
  verbOverride(target, engine) {
    if (guard || !session || target?.classId !== 'pc_remote' || !target.playerId || engine?.mode !== 'multiplayer') return null;
    const mine = session.verb(target);
    if (!mine) return null;
    guard = true;
    let base;
    try {
      base = engine.targetVerbs?.(target) || [];
    } finally {
      guard = false;
    }
    return [...base.filter((v) => v.id !== IM_VERB_ID), mine];
  },

  runVerbOverride(target, verbId) {
    if (verbId !== IM_VERB_ID || !session || !target?.playerId) return null;
    return session.open(Number(target.playerId), target.label || target.name || '');
  },

  /** buddies-feature (the Buddies tab and Menu, Buddies): IM a buddy, online or not. */
  imOpen(id, name, engine) {
    const s = ensure(engine);
    return s ? s.open(id, name) : null;
  },

  /** Whether IMs are on (multiplayer with the realtime server): the Buddies rows show IM. */
  imReady(engine) {
    return ensure(engine) ? true : null;
  },
};
