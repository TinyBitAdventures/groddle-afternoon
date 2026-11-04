/**
 * Who's around, in the game (Austin 2026-11-04: "show panel with active players"; the panel itself is the
 * website's /chat/, groddle-afternoon-site): the Social drawer's presence pill says how many players are
 * online now ("12 online"), counted by the realtime server as the panel would show them to you
 * (groddle-afternoon-server presence.go: not you, nobody with "Appear offline" on, nobody either of you
 * blocks). The remake's own: Glitch had only the buddy list and the street's own players.
 *
 * - Once online the game asks for the count (presence_watch) and the server says when it changes
 *   (presence_count).
 * - Idle: the server calls a player idle after five minutes without doing anything; walking, chatting and
 *   the rest count, and so does a key or a click anywhere in the game ({"t":"active"}, at most every
 *   ACTIVE_EVERY_MS), so someone reading or sorting their pack is not idle.
 * - "Appear offline" (Menu, Account; js/account-forms.js mountPresenceSetting) is the account's: the
 *   ticket's hello says it, and presence_you when it is switched (here or on the website).
 *
 * Multiplayer only: solo sends nothing and shows nothing.
 *
 * QA: canvas data presenceCount, presenceOff; window.groddlePresence.
 */
export const PRESENCE_MP_FEATURE_ID = 'presence-mp';

/** The most often a key or a click tells the server you are there. */
export const ACTIVE_EVERY_MS = 30 * 1000;

/** PURE: whether an input at `now` should be sent, given the last one sent at `last`. */
export function activeDue(now, last, every = ACTIVE_EVERY_MS) {
  return !Number.isFinite(last) || now - last >= every;
}

let session = null;

function createSession(engine, client) {
  const social = engine.social || null;
  let count = null;
  let off = client.me?.off === true;
  let activeAt = -Infinity;
  const listeners = new Set();
  const publish = () => {
    engine.setData?.('presenceCount', count === null ? '' : String(count));
    engine.setData?.('presenceOff', off ? '1' : '0');
    social?.setOnline?.(count);
    for (const fn of listeners) {
      try { fn({ count, off }); } catch (e) { console.warn('presence', e); }
    }
  };
  const watch = () => {
    if (client.state === 'online') client.send('presence_watch', {});
  };
  client.on('hello', (me) => {
    off = me?.off === true;
    watch();
    publish();
  });
  client.on('state', ({ state }) => {
    if (state !== 'online' && count !== null) {
      count = null;
      publish();
    }
  });
  client.on('msg:presence_count', (m) => {
    const n = Math.max(0, Math.floor(Number(m?.n)) || 0);
    if (n === count) return;
    count = n;
    publish();
  });
  client.on('msg:presence_you', (m) => {
    off = m?.off === true;
    publish();
  });
  const input = () => {
    const now = Date.now();
    if (client.state !== 'online' || !activeDue(now, activeAt)) return;
    activeAt = now;
    client.send('active', {});
  };
  document.addEventListener?.('keydown', input, true);
  document.addEventListener?.('pointerdown', input, true);
  watch();
  publish();
  return {
    client,
    get count() { return count; },
    get off() { return off; },
    /** The Account panel's switch said so (the site tells the server; presence_you comes back too). */
    setOff(v) {
      off = Boolean(v);
      publish();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Tests: one input. */
    _input: input,
  };
}

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client) return null;
  session = createSession(engine, client);
  globalThis.groddlePresence = session;
  return session;
}

export const presenceMpFeature = {
  id: PRESENCE_MP_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (session || engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine);
  },

  /** The Account panel: { off } now, and setOff after a switch. */
  presenceState(engine) {
    const s = ensure(engine);
    return s ? { off: s.off, setOff: (v) => s.setOff(v), onChange: (fn) => s.onChange(fn) } : null;
  },
};
