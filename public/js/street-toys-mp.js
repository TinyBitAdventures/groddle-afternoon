/**
 * The street toys online (register G679): Lotha Harte's notes and heart and Icicle Dangles' lights
 * are the street's, shared with everyone there, as they were in Glitch
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
 * dropped, sees what the others see. Pure: street-toys-feature fires what these answer.
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
 * (prev): { toys, lit } for Lotha Harte, { toys, lights } for Icicle Dangles. Null when the message
 * says nothing usable.
 */
export function toyServerState(msg, prev = null) {
  if (!msg || typeof msg !== 'object') return prev;
  if (msg.t === 'toy_state') {
    if (msg.toys === 'lotha') return { toys: 'lotha', lit: msg.lit === true };
    if (msg.toys === 'dangles') return { toys: 'dangles', lights: bools(msg.lights) };
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
  }
  return next;
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
