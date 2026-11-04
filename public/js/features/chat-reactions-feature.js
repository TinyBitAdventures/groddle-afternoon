/**
 * Reactions on chat lines, online (rules and words in js/chat-reactions.js, the drawer's buttons and
 * chips in js/ui/reaction-strip.js, the server's groddle-afternoon-server reactions.go and im.go).
 *
 * This feature connects the Social drawer to the realtime socket: a pick or a chip asks the server
 * (react for a Local, party, channel or group line by its id, im_react for an IM line), and what the
 * server says a line's reactions are now (reacted, im_reacted, a channel's history on joining, the IMs
 * kept for you, a new IM line) goes to the drawer, which redraws that line's chips in place.
 *
 * - Your own Local line is in the drawer as you said it; when the server says it back with its id the
 *   drawer's line takes that id (social.claimLine), so others' reactions on it show.
 * - Blocks: the server leaves out reactions by players you block; so does this, again, as the game hides
 *   their chat (buddies-feature realtimeHidden).
 * - Solo has no reactions: its Local lines are your own and the Feat companions', and nobody is there to
 *   hear one. Speech bubbles over avatars never show reactions.
 *
 * QA: canvas data socialReactions (how many lines have reactions); window.groddleReactions.
 */
import { imKey, lineKey, normalReactions, reactFrame } from '../chat-reactions.js?v=d65d555b';

export const CHAT_REACTIONS_FEATURE_ID = 'chat-reactions';

/** What the toast says when a pick cannot go (the socket is down). */
export const REACT_OFFLINE = 'Reactions need you online. Try again in a moment.';

let session = null;

function createSession(engine, client) {
  const social = engine.social;
  const rx = social?.reactions;
  if (!rx) return null;
  const me = () => Number(client.me?.id) || 0;
  const hidden = (id) => id !== me() && Boolean(engine.query?.('realtimeHidden', id));
  let last = '';
  const set = (rk, raw) => {
    if (!rk) return;
    rx.set(rk, normalReactions(raw, { hidden }));
  };

  rx.connect({
    me,
    send(rk, key, on) {
      const f = reactFrame(rk, key, on);
      if (!f) return false;
      if (client.state !== 'online' || !client.send(f.t, f.payload)) {
        engine.toast?.(REACT_OFFLINE, 2600);
        return false;
      }
      last = `${f.t}:${rk}:${key}:${on ? 'on' : 'off'}`;
      engine.setData?.('reactLast', last);
      return true;
    },
  });

  // Your own Local line, said back with its id.
  client.on('said', ({ mine, lid, text }) => {
    if (mine && lid) social.claimLine?.('local', text, lineKey(lid));
  });
  client.on('msg:reacted', (m) => set(lineKey(m?.line), m?.r));
  client.on('msg:im_reacted', (m) => set(imKey(m?.with, m?.line), m?.r));
  client.on('msg:channel_joined', (m) => {
    for (const l of Array.isArray(m?.history) ? m.history : []) set(lineKey(l?.lid), l?.r || []);
  });
  client.on('msg:im_state', (m) => {
    for (const c of Array.isArray(m?.convs) ? m.convs : []) {
      for (const l of Array.isArray(c?.lines) ? c.lines : []) set(imKey(c?.with?.id, l?.id), l?.r || []);
    }
  });
  client.on('msg:im', (m) => {
    if (Array.isArray(m?.line?.r)) set(imKey(m?.with?.id, m.line.id), m.line.r);
  });
  client.on('error', ({ code, message }) => {
    if (code === 'react') engine.toast?.(message || 'That reaction did not go.', 2600);
  });

  return {
    client,
    /** QA: a line's reactions as the drawer has them. */
    get: (rk) => rx.get(rk),
    get last() {
      return last;
    },
  };
}

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client || !engine.social?.reactions) return null;
  session = createSession(engine, client);
  if (session) globalThis.groddleReactions = session;
  return session;
}

export const chatReactionsFeature = {
  id: CHAT_REACTIONS_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (session || engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine);
  },
};
