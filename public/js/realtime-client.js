/**
 * The realtime connection for multiplayer (phase 3, Austin's plan of
 * 2026-10-25): who else is on this street, where they stand, chat and emotes.
 * Pure: no DOM, no Pixi, so tests drive it with a fake WebSocket, a fake
 * ticket source and fake timers (tests/realtime-client.test.js). The feature
 * that draws other players and the chat (js/features/realtime-feature.js)
 * is the only user, and only in multiplayer.
 *
 * The protocol is the header comment of realtime/hub.go: a ticket from Minn
 * (groddle/v1/realtime, single use) is the first frame, then join / move /
 * chat / emote / leave / ping. Close codes: 4001 this character connected
 * somewhere else (never reconnect), 4003 bad or used ticket (fetch a new one
 * and retry), 4008 too slow (reconnect).
 *
 * States: 'idle' (not started), 'connecting', 'online', 'offline' (retrying
 * with backoff), 'replaced' (4001, stopped), 'signed-out' (the ticket route
 * said 401, stopped), 'off' (503: the site has no realtime, stopped),
 * 'stopped' (stop() was called).
 */

export const CLOSE_REPLACED = 4001;
export const CLOSE_TICKET = 4003;
export const CLOSE_SLOW = 4008;
/** Our own close for a socket that went quiet (no frame for QUIET_MS). */
export const CLOSE_QUIET = 4000;

/** Moves go out at most this often (the server drops beyond 20/s). */
export const MOVE_EVERY_MS = 100;
export const PING_EVERY_MS = 20000;
/** No frame at all for this long: the socket is dead even if it never closed. */
export const QUIET_MS = 50000;
export const BACKOFF_MIN_MS = 1000;
export const BACKOFF_MAX_MS = 30000;
/** The server's limits (hub.go maxChat; maxLook is 4096 bytes of JSON). */
export const MAX_CHAT = 200;
export const MAX_LOOK_BYTES = 4096;

/** Emotes a player can send: the Glitch emotion animations (avatar-anims.js EMOTIONS). */
export const EMOTES = Object.freeze(['happy', 'surprise', 'angry']);

/**
 * Avatar sheet states travel as the server's anim words (lower case, digits
 * and _, at most 24). Every state avatar-anims.js avatarAnimState returns is
 * already one except climbPause.
 */
const ANIM_WORDS = Object.freeze({ climbPause: 'climb_pause' });
const ANIM_STATES = Object.freeze(Object.fromEntries(Object.entries(ANIM_WORDS).map(([s, w]) => [w, s])));
const KNOWN_STATES = new Set(['stand', 'idle0', 'idle1', 'idle2', 'idle3', 'idle4', 'afk', 'wake', 'walk1x', 'walk2x', 'climb', 'climbPause', 'lift', 'fall', 'land', 'hit1', 'hit2', 'happy', 'surprise', 'angry']);

/** The wire word for an avatar state (unknown states stand). */
export function encodeAnim(state) {
  const s = KNOWN_STATES.has(state) ? state : 'stand';
  return ANIM_WORDS[s] || s;
}

/** The avatar state a wire word names (unknown words stand). */
export function decodeAnim(word) {
  const s = ANIM_STATES[word] || word;
  return KNOWN_STATES.has(s) ? s : 'stand';
}

/** The socket URL for the ticket's path, on the page's own host (wss on https). */
export function socketUrl(path, baseUri) {
  const url = new URL(path || '/ws', baseUri);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

/** A look the server will pass on (JSON of at most MAX_LOOK_BYTES), else null. */
export function fitLook(look) {
  if (look == null) return null;
  try {
    const json = JSON.stringify(look);
    return json && new TextEncoder().encode(json).length <= MAX_LOOK_BYTES ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

/** Retry delay after `attempt` failures in a row: doubling from BACKOFF_MIN_MS, capped, with +-25% jitter. */
export function backoffMs(attempt, random = Math.random) {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.75 + 0.5 * random()));
}

const sameMove = (a, b) => Boolean(a && b) && a.x === b.x && a.y === b.y && a.dir === b.dir && a.anim === b.anim;
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

/**
 * @param {object} opts
 * @param {() => Promise<{ ticket: string, path?: string }>} opts.ticket
 *   a fresh ticket (minn-account.js realtimeTicket); throws with .status
 *   401 (signed out), 503 (no realtime here), anything else to retry.
 * @param {string} opts.baseUri the page's base URI, for the socket host
 * @param {typeof WebSocket} [opts.WebSocket]
 * @param {(fn: () => void, ms: number) => any} [opts.setTimeout]
 * @param {(id: any) => void} [opts.clearTimeout]
 * @param {() => number} [opts.now] ms clock
 * @param {() => number} [opts.random] for the backoff jitter
 */
export function createRealtimeClient({
  ticket,
  baseUri,
  WebSocket: WS = globalThis.WebSocket,
  setTimeout: later = globalThis.setTimeout?.bind(globalThis),
  clearTimeout: cancel = globalThis.clearTimeout?.bind(globalThis),
  now = () => Date.now(),
  random = Math.random,
} = {}) {
  const listeners = new Map();
  let state = 'idle';
  let ws = null;
  let me = null;
  let attempt = 0;
  let ticketRetries = 0;
  let retryTimer = null;
  let pingTimer = null;
  let moveTimer = null;
  let lastFrameAt = 0;
  let generation = 0;
  /** The street we want to be on and how we stand there (re-sent after every reconnect). */
  let want = null;
  /** True between sending join and the server's street answer: other streets' frames are dropped. */
  let awaitingStreet = false;
  let street = '';
  const players = new Map();
  let lastMove = null;
  let lastMoveAt = -Infinity;
  let pendingMove = null;
  let closeCode = 0;

  function emit(type, detail) {
    for (const fn of listeners.get(type) || []) {
      try { fn(detail); } catch (err) { console.warn('[realtime]', type, err); }
    }
  }

  function setState(next, extra = {}) {
    if (state === next) return;
    state = next;
    emit('state', { state, attempt, ...extra });
  }

  function clearTimers() {
    if (retryTimer != null) cancel?.(retryTimer);
    if (pingTimer != null) cancel?.(pingTimer);
    if (moveTimer != null) cancel?.(moveTimer);
    retryTimer = pingTimer = moveTimer = null;
    pendingMove = null;
  }

  function resetStreet() {
    const had = players.size > 0 || street !== '';
    players.clear();
    street = '';
    if (had) emit('roster', { street, players: [] });
  }

  function send(msg) {
    if (!ws || state !== 'online' || ws.readyState !== 1) return false;
    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  function scheduleRetry(delay) {
    if (retryTimer != null) cancel?.(retryTimer);
    retryTimer = later(() => {
      retryTimer = null;
      connect();
    }, delay);
  }

  function stopFor(next) {
    generation += 1;
    clearTimers();
    if (ws) {
      const old = ws;
      ws = null;
      try { old.close(1000, 'bye'); } catch { /* already closed */ }
    }
    resetStreet();
    setState(next);
  }

  function retryLater() {
    setState('offline');
    scheduleRetry(backoffMs(attempt, random));
    attempt += 1;
  }

  async function connect() {
    if (['replaced', 'signed-out', 'off', 'stopped'].includes(state)) return;
    const gen = ++generation;
    setState('connecting');
    let t;
    try {
      t = await ticket();
    } catch (err) {
      if (gen !== generation) return;
      if (err?.status === 401) return stopFor('signed-out');
      if (err?.status === 503) return stopFor('off');
      return retryLater();
    }
    if (gen !== generation) return;
    let socket;
    try {
      socket = new WS(socketUrl(t?.path, baseUri));
    } catch {
      return retryLater();
    }
    ws = socket;
    closeCode = 0;
    socket.onopen = () => {
      if (ws !== socket) return;
      lastFrameAt = now();
      socket.send(JSON.stringify({ t: 'auth', ticket: t.ticket }));
    };
    socket.onmessage = (event) => {
      if (ws !== socket) return;
      lastFrameAt = now();
      let msg;
      try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg && typeof msg.t === 'string') handle(msg);
    };
    socket.onclose = (event) => {
      if (ws !== socket) return;
      ws = null;
      closed(Number(event?.code) || 1006);
    };
    socket.onerror = () => { /* onclose follows */ };
  }

  function closed(code) {
    closeCode = code;
    if (pingTimer != null) cancel?.(pingTimer);
    if (moveTimer != null) cancel?.(moveTimer);
    pingTimer = moveTimer = null;
    pendingMove = null;
    lastMove = null;
    resetStreet();
    me = null;
    if (code === CLOSE_REPLACED) return setState('replaced', { code });
    if (state === 'stopped') return;
    if (code === CLOSE_TICKET && ticketRetries < 2) {
      // A used or expired ticket: a new one straight away (twice, then back off).
      ticketRetries += 1;
      setState('connecting', { code });
      scheduleRetry(0);
      return;
    }
    retryLater();
  }

  function sendJoin() {
    if (!want) return;
    awaitingStreet = true;
    resetStreet();
    send({ t: 'join', street: want.street, x: want.x, y: want.y, dir: want.dir, anim: want.anim, look: want.look ?? undefined });
    lastMove = { x: want.x, y: want.y, dir: want.dir, anim: want.anim };
    lastMoveAt = now();
  }

  function pingLoop() {
    if (pingTimer != null) cancel?.(pingTimer);
    pingTimer = later(() => {
      pingTimer = null;
      if (state !== 'online' || !ws) return;
      if (now() - lastFrameAt >= QUIET_MS) {
        const socket = ws;
        ws = null;
        try { socket.close(CLOSE_QUIET, 'quiet'); } catch { /* gone */ }
        closed(CLOSE_QUIET);
        return;
      }
      send({ t: 'ping' });
      pingLoop();
    }, PING_EVERY_MS);
  }

  function handle(msg) {
    switch (msg.t) {
      case 'hello':
        me = { id: Number(msg.you?.id), name: String(msg.you?.name || '') };
        attempt = 0;
        ticketRetries = 0;
        setState('online');
        emit('hello', me);
        pingLoop();
        sendJoin();
        return;
      case 'street':
        if (!want || msg.street !== want.street) return;
        awaitingStreet = false;
        street = msg.street;
        players.clear();
        for (const p of Array.isArray(msg.players) ? msg.players : []) if (p && p.id !== me?.id) players.set(Number(p.id), normPlayer(p));
        emit('roster', { street, players: [...players.values()] });
        return;
      case 'joined': {
        if (awaitingStreet || !msg.player || msg.player.id === me?.id) return;
        const p = normPlayer(msg.player);
        players.set(p.id, p);
        emit('joined', p);
        emit('roster', { street, players: [...players.values()] });
        return;
      }
      case 'left': {
        if (awaitingStreet) return;
        const id = Number(msg.id);
        if (!players.delete(id)) return;
        emit('left', { id });
        emit('roster', { street, players: [...players.values()] });
        return;
      }
      case 'moved': {
        if (awaitingStreet) return;
        const p = players.get(Number(msg.id));
        if (!p) return;
        p.x = Number(msg.x) || 0;
        p.y = Number(msg.y) || 0;
        p.dir = msg.dir < 0 ? -1 : 1;
        p.anim = decodeAnim(msg.anim);
        emit('moved', p);
        return;
      }
      case 'said': {
        const mine = Number(msg.id) === me?.id;
        if (awaitingStreet && !mine) return;
        emit('said', { id: Number(msg.id), name: String(msg.name || ''), text: String(msg.text || ''), at: Number(msg.at) || now(), mine });
        return;
      }
      case 'emoted': {
        if (awaitingStreet) return;
        const p = players.get(Number(msg.id));
        if (!p || !EMOTES.includes(msg.e)) return;
        emit('emoted', { id: p.id, e: msg.e, player: p });
        return;
      }
      case 'error':
        emit('error', { code: String(msg.code || ''), message: String(msg.message || '') });
        return;
      default:
        // pong and anything newer than this client.
    }
  }

  function normPlayer(p) {
    return {
      id: Number(p.id),
      name: String(p.name || 'A Glitch'),
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      dir: p.dir < 0 ? -1 : 1,
      anim: decodeAnim(p.anim),
      look: p.look && typeof p.look === 'object' ? p.look : null,
    };
  }

  function flushMove() {
    moveTimer = null;
    const m = pendingMove;
    pendingMove = null;
    if (!m || sameMove(m, lastMove)) return;
    if (send({ t: 'move', ...m })) {
      lastMove = m;
      lastMoveAt = now();
    }
  }

  return {
    get state() { return state; },
    get me() { return me; },
    get street() { return street; },
    get players() { return [...players.values()]; },
    /** How many are on this street counting you (0 when not on one). */
    get here() { return street ? players.size + 1 : 0; },
    get closeCode() { return closeCode; },
    /** Failed connects in a row (0 once online). */
    get attempt() { return attempt; },

    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },

    start() {
      if (state !== 'idle' && state !== 'stopped') return;
      state = 'idle';
      attempt = 0;
      ticketRetries = 0;
      connect();
    },

    /**
     * Connect again now, from any state (Play here after 4001 takes the
     * character back from the other window). The street wanted is kept.
     */
    restart() {
      stopFor('stopped');
      state = 'idle';
      attempt = 0;
      ticketRetries = 0;
      connect();
    },

    /** Close for good (page leaving). */
    stop() {
      if (ws && state === 'online') send({ t: 'leave' });
      stopFor('stopped');
    },

    /**
     * Stand on a street (sent now when online, and again after any
     * reconnect). look is the avatar appearance others draw.
     */
    join({ street: tsid, x = 0, y = 0, dir = 1, anim = 'stand', look = null }) {
      want = { street: String(tsid || ''), x: round1(x), y: round1(y), dir: dir < 0 ? -1 : 1, anim: encodeAnim(anim), look: fitLook(look) };
      if (!want.street) {
        want = null;
        return false;
      }
      if (moveTimer != null) cancel?.(moveTimer);
      moveTimer = null;
      pendingMove = null;
      if (state === 'online') sendJoin();
      return true;
    },

    /** Off every street (a private instance, home), still connected. */
    leave() {
      if (!want) return;
      want = null;
      awaitingStreet = false;
      if (moveTimer != null) cancel?.(moveTimer);
      moveTimer = null;
      pendingMove = null;
      lastMove = null;
      send({ t: 'leave' });
      resetStreet();
    },

    /** The street joined (or asked for), or ''. */
    get wanted() { return want?.street || ''; },

    /**
     * Where the player is now; call it every frame. Sends only changes, at
     * most every MOVE_EVERY_MS, and always the last one (a trailing send).
     */
    move({ x, y, dir = 1, anim = 'stand' }) {
      if (!want) return false;
      const m = { x: round1(x), y: round1(y), dir: dir < 0 ? -1 : 1, anim: encodeAnim(anim) };
      want.x = m.x;
      want.y = m.y;
      want.dir = m.dir;
      want.anim = m.anim;
      if (state !== 'online') return false;
      if (sameMove(m, lastMove)) {
        pendingMove = null;
        return false;
      }
      const wait = lastMoveAt + MOVE_EVERY_MS - now();
      if (wait <= 0 && moveTimer == null) {
        if (send({ t: 'move', ...m })) {
          lastMove = m;
          lastMoveAt = now();
          return true;
        }
        return false;
      }
      pendingMove = m;
      if (moveTimer == null) moveTimer = later(flushMove, Math.max(0, wait));
      return false;
    },

    /** Say a line to the street; false when it could not go (offline, no street, empty). */
    chat(text) {
      const line = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT);
      if (!line || !want || !street) return false;
      return send({ t: 'chat', text: line });
    },

    emote(e) {
      if (!EMOTES.includes(e) || !want || !street) return false;
      return send({ t: 'emote', e });
    },
  };
}

/**
 * Smooth motion for another player: samples stamped with the local receive
 * time, drawn INTERP_DELAY_MS behind so there is always a pair to blend.
 */
export const INTERP_DELAY_MS = 150;
/** A move this far from the last one is a teleport: no sliding across the street. */
export const SNAP_DISTANCE = 600;

export function createTrack(sample, t) {
  return { samples: [{ ...sample, t }] };
}

/**
 * Add a sample. After a pause (the sender stopped sending while standing)
 * the last sample is re-stamped just behind this one, so the walk starts
 * from where they stood instead of jumping.
 */
export function pushSample(track, sample, t) {
  const list = track.samples;
  const last = list[list.length - 1];
  if (last && t - last.t > MOVE_EVERY_MS * 2.5) list.push({ ...last, t: t - MOVE_EVERY_MS });
  list.push({ ...sample, t });
  // Keep a second of history (and always the last two).
  while (list.length > 2 && list[1].t < t - 1000) list.shift();
}

/** Where to draw at `t` (local ms): { x, y, dir, anim }. */
export function sampleTrack(track, t) {
  const list = track.samples;
  const at = t - INTERP_DELAY_MS;
  if (!list.length) return null;
  if (at <= list[0].t) return { ...list[0] };
  for (let i = 1; i < list.length; i++) {
    const b = list[i];
    if (at > b.t) continue;
    const a = list[i - 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) > SNAP_DISTANCE) return { ...(at >= b.t ? b : a) };
    const k = b.t === a.t ? 1 : (at - a.t) / (b.t - a.t);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dir: k < 0.5 ? a.dir : b.dir, anim: k < 0.5 ? a.anim : b.anim };
  }
  const last = list[list.length - 1];
  return { x: last.x, y: last.y, dir: last.dir, anim: last.anim };
}
