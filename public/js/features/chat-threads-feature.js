/**
 * Threads on chat lines, online (rules and words in js/chat-threads.js, the drawer's buttons and the
 * thread view in js/ui/social-drawer.js, the server's groddle-afternoon-server threads.go and im.go, the
 * site's kept replies in groddle-afternoon-site src/ChatHistory.php).
 *
 * This feature connects the Social drawer's threads to the realtime socket:
 * - a reply typed in an open thread goes as thread_say (a channel or group line) or as im_send with
 *   "parent" (an IM line);
 * - opening a thread asks the server for the replies it keeps (thread_get); when it no longer holds
 *   that thread (known false: an old line, a restart) the site's kept replies are asked for instead;
 *   an IM thread's replies come from the conversation the server keeps (player-im-feature hands them
 *   over) and from the site;
 * - thread_said puts a new reply in its thread and the line's count up to date, channel_joined's
 *   history gives each line its count ("th");
 * - a reply's reactions are a line's (chat-reactions-feature: reacted by its lid; here a thread's
 *   replies bring their own).
 * - Blocks: a reply by a player you block is never shown (buddies-feature realtimeHidden).
 * - A reply an administrator deleted (chat_deleted with "parent", groddle-afternoon-server
 *   chatdelete.go) leaves its thread and the count goes down; a thread open on a deleted line closes.
 *
 * Multiplayer only: in solo this feature does nothing (the drawer has no threads).
 *
 * QA: canvas data threadLast (the last thing that happened); window.groddleThreads.
 */
import { THREAD_TEXT, replyFrame, siteKey, threadTarget } from '../chat-threads.js?v=42954351';
import { chatLine, shownName } from '../groups.js?v=c9635d96';
import { drawerLine, normalLine } from '../player-im.js?v=23463a96';
import { imKey, lineKey, normalReactions } from '../chat-reactions.js?v=d65d555b';
import { createMinnAccount } from '../minn-account.js?v=8f2741cd';

export const CHAT_THREADS_FEATURE_ID = 'chat-threads';

let session = null;

/** PURE: a server's or the site's channel reply as the drawer draws it, or null (none, or by someone hidden). */
export function replyLine(raw, { me = 0, hidden = () => false } = {}) {
  const l = chatLine(raw);
  if (!l || (l.id !== me && hidden(l.id))) return null;
  return { name: shownName(l), text: l.text, mine: l.id === me, at: l.at || Date.now(), playerId: l.id, rk: lineKey(l.lid) };
}

/**
 * PURE: a thread's count after one of its replies was deleted: the server's n and last when it sent
 * them (chatdelete.go), else one fewer than the thread had.
 */
export function deletedSummary(had, m) {
  if (m && m.n !== undefined) return { n: Math.max(0, Math.floor(Number(m.n)) || 0), last: m.last || null };
  return { n: Math.max(0, (Number(had?.n) || 0) - 1), last: had?.last || null };
}

function createSession(engine, client) {
  const social = engine.social;
  const th = social?.threads;
  if (!th) return null;
  const me = () => Number(client.me?.id) || 0;
  const myName = () => client.me?.name || 'You';
  const hidden = (id) => id !== me() && Boolean(engine.query?.('realtimeHidden', id));
  let account = null;
  let last = '';
  const note = (what) => {
    last = what;
    engine.setData?.('threadLast', what);
  };
  const site = () => {
    account ??= createMinnAccount({ baseUri: document.baseURI, nonce: globalThis.GRODDLE_MP_BOOT?.nonce || '' });
    return account;
  };
  /** A reply's reactions, as the line's own (the drawer draws its chips). */
  const reactionsOf = (rk, raw) => {
    if (rk && Array.isArray(raw)) social.reactions?.set(rk, normalReactions(raw, { hidden }));
  };
  const channelReplies = (list) => {
    const out = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const l = replyLine(raw, { me: me(), hidden });
      if (!l) continue;
      reactionsOf(l.rk, raw?.r);
      out.push(l);
    }
    return out;
  };

  async function fromSite(channel, parent) {
    const tk = lineKey(parent);
    const key = siteKey(channel);
    if (!key) return;
    try {
      const r = await site().chatThread(key, parent);
      th.addReplies(tk, channelReplies(r?.lines));
      // Made complete by the site: the count is what it has.
      th.setReplies(tk, th.get(tk)?.replies || []);
      note(`site:${tk}`);
    } catch {
      th.note(tk, THREAD_TEXT.failed);
      note(`failed:${tk}`);
    }
  }

  async function fromSiteIm(withId, parent) {
    const tk = imKey(withId, parent);
    try {
      const r = await site().imThread(withId, parent);
      if (r?.blocked) return void th.note(tk, THREAD_TEXT.failed);
      const name = social.label?.(`im:${withId}`) || '';
      const out = [];
      for (const raw of Array.isArray(r?.lines) ? r.lines : []) {
        const l = normalLine(raw);
        if (!l || (l.from !== me() && hidden(l.from))) continue;
        const d = drawerLine(l, { me: me(), myName: myName(), name, withId });
        reactionsOf(d.rk, raw?.r);
        out.push(d);
      }
      th.setReplies(tk, [...(th.get(tk)?.replies || []), ...out]);
      note(`site:${tk}`);
    } catch {
      th.note(tk, THREAD_TEXT.failed);
      note(`failed:${tk}`);
    }
  }

  th.connect({
    send(chat, tk, text) {
      const f = replyFrame(threadTarget(chat, tk), text);
      if (!f || client.state !== 'online') return false;
      const ok = client.send(f.t, f.payload);
      if (ok) note(`sent:${tk}`);
      return ok;
    },
    load(chat, tk) {
      const target = threadTarget(chat, tk);
      if (!target) return;
      if (target.kind === 'im') return void fromSiteIm(target.with, target.parent);
      if (client.state === 'online' && client.send('thread_get', { channel: target.channel, parent: target.parent })) return;
      fromSite(target.channel, target.parent);
    },
  });

  client.on('msg:thread', (m) => {
    const parent = Math.floor(Number(m?.parent)) || 0;
    if (!parent) return;
    if (m.known === false) return void fromSite(String(m.channel || ''), parent);
    th.setReplies(lineKey(parent), [...(th.get(lineKey(parent))?.replies || []), ...channelReplies(m.lines)]);
    note(`got:${lineKey(parent)}`);
  });
  client.on('msg:thread_said', (m) => {
    const parent = Math.floor(Number(m?.parent)) || 0;
    if (!parent) return;
    const tk = lineKey(parent);
    const l = replyLine(m.line, { me: me(), hidden });
    if (l) th.push(tk, l, hidden(Number(m?.last?.id)) ? null : { n: m.n, last: m.last });
    note(`said:${tk}`);
  });
  client.on('msg:channel_joined', (m) => {
    for (const l of Array.isArray(m?.history) ? m.history : []) if (l?.th) th.summary(lineKey(l.lid), l.th);
  });
  client.on('msg:chat_deleted', (m) => {
    const lid = Math.floor(Number(m?.lid)) || 0;
    const parent = Math.floor(Number(m?.parent)) || 0;
    if (!lid) return;
    if (parent) {
      const tk = lineKey(parent);
      const st = th.get(tk);
      if (st) {
        th.setReplies(tk, st.replies.filter((r) => r.rk !== lineKey(lid)), { loaded: st.loaded });
        th.summary(tk, deletedSummary(st, m));
      }
    } else if (th.current?.tk === lineKey(lid)) th.close();
    note(`deleted:${lineKey(lid)}`);
  });
  client.on('error', ({ code, message }) => {
    if (code !== 'thread') return;
    const open = th.current;
    if (open) th.note(open.tk, message || THREAD_TEXT.failed);
    else engine.toast?.(message || THREAD_TEXT.failed, 3200);
    note(`refused:${message}`);
  });

  return {
    client,
    /** QA: a thread as the drawer has it. */
    get: (tk) => th.get(tk),
    open: (chat, tk) => th.open(chat, tk),
    get last() {
      return last;
    },
  };
}

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client || !engine.social?.threads) return null;
  session = createSession(engine, client);
  if (session) globalThis.groddleThreads = session;
  return session;
}

export const chatThreadsFeature = {
  id: CHAT_THREADS_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (session || engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine);
  },
};
