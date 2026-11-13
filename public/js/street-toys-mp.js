/**
 * The street toys online (register G679): Lotha Harte's notes and heart, Icicle Dangles' lights and
 * Koulato Cluster's firefly jars are the street's, shared with everyone there, as they were in Glitch
 * (the location kept the flags and loc.* variables, deco_show/deco_hide went to every player and were
 * replayed to each arrival, play_sound all_players reached everyone: GameServerJS
 * locations/inc_events.js events_broadcast, inc_geo.js geo_deco_toggle_visibility). The realtime
 * server keeps that state (groddle-afternoon-server streettoys.go, protocol in its header):
 *
 *   send  {t:'toy_click', toy}                  a click on a toy (the reach is checked here first)
 *   get   {t:'toy_state', street, toys, …}      after each join: the state to catch up to
 *         {t:'toy_played', street, toy, by, events, …}  what the street runs, to everyone there
 *
 * Each game runs the events it is sent on the street's own scripts and, every frame, brings its own
 * flags to the last state it was told (catchUp*), so a player arriving mid-state, or one whose socket
 * dropped, sees what the others see. Pure: the features (street-toys-feature, koulato-jars-feature)
 * fire what these answer.
 */

export const TOY_CLICK = 'toy_click';

const sameTsid = (a, b) => Boolean(a) && Boolean(b) && String(a).slice(1) === String(b).slice(1);

/** A toy message is for this street (either TSID prefix). */
export function toyMessageFor(msg, tsid) {
  return Boolean(msg && typeof msg === 'object' && sameTsid(msg.street, tsid));
}

/** The event names a toy_played message carries (only plain words). */
export function toyEvents(msg) {
  return (Array.isArray(msg?.events) ? msg.events : []).filter((e) => typeof e === 'string' && /^[a-z0-9_]{1,40}$/.test(e));
}

const bools = (list, n = 3) => Array.from({ length: n }, (_, i) => Boolean(Array.isArray(list) && list[i]));

/**
 * The server's state as this game keeps it, from a toy_state, or a toy_played over the last one
 * (prev): { toys, lit } for Lotha Harte, { toys, lights } for Icicle Dangles, { toys, arrivals, out,
 * jars } for Koulato Cluster. Null when the message says nothing usable.
 */
export function toyServerState(msg, prev = null) {
  if (!msg || typeof msg !== 'object') return prev;
  if (msg.t === 'toy_state') {
    if (msg.toys === 'lotha') return { toys: 'lotha', lit: msg.lit === true };
    if (msg.toys === 'dangles') return { toys: 'dangles', lights: bools(msg.lights) };
    if (msg.toys === 'koulato') {
      const n = Math.floor(Number(msg.arrivals));
      return { toys: 'koulato', arrivals: Number.isFinite(n) && n > 0 ? n : 0, out: msg.out === true, jars: bools(msg.jars) };
    }
    return prev;
  }
  if (msg.t !== 'toy_played' || !prev) return prev;
  const events = toyEvents(msg);
  const next = { ...prev };
  if (prev.toys === 'lotha') {
    if (events.includes('correct_order')) next.lit = true;
    if (events.includes('light_fade')) next.lit = false;
  } else if (prev.toys === 'dangles') {
    next.lights = [...prev.lights];
    for (const e of events) {
      const m = /^shroom_light_([123])_(on|off)$/.exec(e);
      if (m) next.lights[Number(m[1]) - 1] = m[2] === 'on';
    }
  } else if (prev.toys === 'koulato') {
    if (typeof msg.out === 'boolean') next.out = msg.out;
    if (Array.isArray(msg.lit)) next.jars = bools(msg.lit);
    const n = Math.floor(Number(msg.arrivals));
    if (Number.isFinite(n) && n >= 0) next.arrivals = n;
  }
  return next;
}

/**
 * The server's last word on the street this player's socket stands on. A join's toy_state can come
 * before the game has entered the street (the socket joins while the street loads), so each feature
 * keeps one of these from its first frame online and reads it on arrival (stateFor). roster(msg) on
 * each roster (a new street's comes before its toy_state) forgets another street's word.
 */
export function createToyTracker() {
  let street = '';
  let state = null;
  return {
    roster(msg) {
      if (!msg?.street || toyMessageFor(msg, street)) return;
      street = String(msg.street);
      state = null;
    },
    take(msg) {
      if (msg?.t === 'toy_state') {
        street = String(msg.street || '');
        state = toyServerState(msg, null);
      } else if (msg?.t === 'toy_played' && toyMessageFor(msg, street)) state = toyServerState(msg, state);
      return state;
    },
    stateFor: (tsid) => (toyMessageFor({ street }, tsid) ? state : null),
  };
}

/**
 * Lotha Harte: the events that bring this game's heart (shown: correct_order run here and not yet
 * light_fade) to the server's. correct_order's own 22 s light_fade is the server's to send, so the
 * caller cancels the local one (cancel).
 */
export function catchUpLotha(server, shown) {
  if (!server || server.toys !== 'lotha') return null;
  if (server.lit && !shown) return { fire: ['correct_order'], cancel: ['light_fade'], shown: true };
  if (!server.lit && shown) return { fire: ['light_fade'], cancel: [], shown: false };
  return null;
}

/**
 * Icicle Dangles: for each light the server shows otherwise than this game (flag lightN_on is set
 * while the light is out), the lock to clear (flag lightN) and the event to run.
 */
export function catchUpDangles(server, flag) {
  if (!server || server.toys !== 'dangles') return [];
  const out = [];
  server.lights.forEach((on, i) => {
    const n = i + 1;
    const outHere = Boolean(flag(`light${n}_on`));
    if (on === !outHere) return;
    out.push({ clear: `light${n}`, fire: `shroom_light_${n}_${on ? 'on' : 'off'}` });
  });
  return out;
}

/**
 * Koulato Cluster: the events that bring this game's jars (jarsOn: flag jars_on; lit: the jars lit
 * here) to the server's: place_jars or put away (turn_off, hide_all), then each jar on or off.
 * Answers { fire: [...], lit }.
 */
export function catchUpKoulato(server, jarsOn, lit) {
  if (!server || server.toys !== 'koulato') return { fire: [], lit };
  const fire = [];
  let now = [...lit];
  if (server.out && !jarsOn) {
    fire.push('place_jars');
    now = [false, false, false];
  } else if (!server.out && jarsOn) {
    fire.push('turn_off', 'hide_all');
    now = [false, false, false];
  }
  if (server.out) {
    server.jars.forEach((on, i) => {
      if (on === now[i]) return;
      fire.push(`jar${i + 1}_${on ? 'on' : 'off'}`);
      now[i] = on;
    });
  }
  return { fire, lit: now };
}

/**
 * The completion's jars this game puts down itself: the ones the server could not share ("own") for
 * this player (me). Each { n }: the caller drops it at JAR_BOXES[n - 1].drop.
 */
export function ownJars(msg, me) {
  if (!Array.isArray(msg?.jars) || me == null) return [];
  return msg.jars
    .filter((j) => j && j.own === true && Number(j.id) === Number(me) && [1, 2, 3].includes(Number(j.n)))
    .map((j) => ({ n: Number(j.n) }));
}
