/**
 * Graves online (register G1022, report #505): a croak's Graveside Marker is the street's, so
 * another player walking past may mourn or celebrate it, and the dead player gets what Glitch gave
 * them for it (a Hell quest offer or a Diabolical Drink Ticket). Pure: no DOM, no Pixi, no socket.
 *
 * Source (tinyspeck/glitch-GameServerJS, CC0): players/player.js croak() 1305-1309 puts the marker
 * on the location, owned by the player; items/graveside_marker.js celebrate 37-86 / mourn 88-137
 * (any player there, once per grave, the first wins, 5 favor with the grave's Giant unless it is
 * the generic one, then this.owner.recognizeDeath), inspect 139-180 ("<owner> croaked at this
 * spot, on <game time>. R.I.P." and who recognized it), onCreate 199-202 and onFade 211-213 (fades
 * after 45 minutes, gone 15 minutes later); player.js recognizeDeath 1430-1477 for the owner, at
 * once or at their next login (200-204).
 *
 * The realtime server keeps the graves and decides who was first (groddle-afternoon-server
 * graves.go, protocol in its header):
 *
 *   send  {t:'grave_set', croak, street, x, y, giant, age, state, by}   the owner's game
 *         {t:'grave_clear'}                                            the owner resurrected
 *         {t:'grave_act', owner, verb}                                 another player's mourn / celebrate
 *   get   {t:'graves', street, graves:[Grave]} {t:'grave', street, grave} {t:'grave_gone', street, owner}
 *         {t:'grave_done', owner, verb, ok, name, giant, favor | text}  the recognizer's answer
 *         {t:'grave_mourned', verb, by, croak}                         to the owner
 */

import { GRAVE_MARKER_FADE_MS, HELL_SPRITES, graveMarkerLabel, graveRecognitionText } from './hell.js?v=0dba5774';
import { formatDametime } from './game-day.js?v=57fecfcb';
import { UNNAMED_PLAYER } from './player-names.js?v=f9b78094';

export const GRAVE_SET = 'grave_set';
export const GRAVE_CLEAR = 'grave_clear';
export const GRAVE_ACT = 'grave_act';

const STATES = ['none', 'mourn', 'celebrate'];
const GIANTS = new Set(HELL_SPRITES.graveside.giants);

/** graveside_marker.js conditions 48-58 and 99-109, handler 79-81. */
export const GRAVE_TEXT = Object.freeze({
  self: 'You have already recognized the passing of this Glitch.',
  other: 'Someone else has already recognized the passing of this Glitch.',
  celebrateTip: 'Celebrate the full and meaningful life of this Glitch',
  mournTip: 'Mourn the untimely demise of this Glitch',
  inspectTip: 'Read the tiny little sign for more info',
  subtitle: 'Someone died here.',
});

const sameTsid = (a, b) => Boolean(a) && Boolean(b) && String(a).slice(1) === String(b).slice(1);
const cleanName = (s, fallback = '') => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return t || fallback;
};

/** A message is about this street (either TSID prefix). */
export function graveMessageFor(msg, tsid) {
  return Boolean(msg && typeof msg === 'object' && sameTsid(msg.street, tsid));
}

/**
 * One grave as the server sends it, checked, with the local time of the croak (`croakedAt`,
 * from its age on arrival, so each game fades it on its own clock). Null when unusable.
 */
export function normalizeGrave(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const owner = Math.floor(Number(raw.owner));
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!(owner > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const age = Math.max(0, Number(raw.age) || 0);
  const giant = GIANTS.has(String(raw.giant)) ? String(raw.giant) : 'generic';
  const state = STATES.includes(raw.state) ? raw.state : 'none';
  return { owner, name: cleanName(raw.name, UNNAMED_PLAYER), x, y, giant, state, by: state === 'none' ? '' : cleanName(raw.by), croakedAt: now - age };
}

/**
 * The street's graves this game knows, by owner, kept from the messages (`me`: your own id, whose
 * grave your game draws itself). Returns the map after the message (a new one when it changed).
 */
export function applyGraveMessage(map, msg, { street = '', me = 0, now = Date.now() } = {}) {
  if (!msg || !graveMessageFor(msg, street)) return map;
  if (msg.t === 'graves') {
    const next = new Map();
    for (const raw of Array.isArray(msg.graves) ? msg.graves : []) {
      const g = normalizeGrave(raw, now);
      if (g && g.owner !== me) next.set(g.owner, g);
    }
    return next;
  }
  if (msg.t === 'grave') {
    const g = normalizeGrave(msg.grave, now);
    if (!g || g.owner === me) return map;
    const next = new Map(map);
    next.set(g.owner, g);
    return next;
  }
  if (msg.t === 'grave_gone') {
    const owner = Math.floor(Number(msg.owner));
    if (!map.has(owner)) return map;
    const next = new Map(map);
    next.delete(owner);
    return next;
  }
  return map;
}

/** onFade: half seen after 45 minutes (the server removes it at 60). */
export function graveAlpha(grave, now = Date.now()) {
  return now - (grave?.croakedAt ?? now) >= GRAVE_MARKER_FADE_MS ? 0.5 : 1;
}

/** The sprite sheet frame for a grave's state (none, mourn, celebrate). */
export function graveFrame(grave) {
  return Math.max(0, HELL_SPRITES.graveside.states.indexOf(grave?.state || 'none'));
}

export function graveLabel(grave) {
  return graveMarkerLabel(grave?.name || UNNAMED_PLAYER);
}

/**
 * The verbs on another player's grave, in the source's order (sort_on 50, 51, 52). `meName`: your
 * name, to tell "you already did" from "someone else did"; `pending`: your answer is on its way.
 */
export function graveVerbs(grave, { meName = '', pending = false } = {}) {
  const done = grave?.state && grave.state !== 'none';
  const reason = done ? (meName && grave.by === meName ? GRAVE_TEXT.self : GRAVE_TEXT.other) : '';
  const enabled = !done && !pending;
  return [
    { id: 'celebrate', label: 'celebrate', enabled, tooltip: GRAVE_TEXT.celebrateTip, reason },
    { id: 'mourn', label: 'mourn', enabled, tooltip: GRAVE_TEXT.mournTip, reason },
    { id: 'inspect', label: 'inspect', enabled: true, tooltip: GRAVE_TEXT.inspectTip, reason: '' },
  ];
}

/** inspect 165-173: the little sign. */
export function graveInspectText(grave) {
  let text = `${grave?.name || UNNAMED_PLAYER} croaked at this spot, on ${formatDametime(grave?.croakedAt ?? Date.now())}. R.I.P.`;
  if (grave?.state === 'mourn') text += ` They were mourned by ${grave.by || UNNAMED_PLAYER}.`;
  else if (grave?.state === 'celebrate') text += ` Their life was celebrated by ${grave.by || UNNAMED_PLAYER}.`;
  return text;
}

/** The server's answer to your mourn or celebrate, checked. */
export function normalizeGraveDone(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const verb = msg.verb === 'mourn' || msg.verb === 'celebrate' ? msg.verb : null;
  if (!verb) return null;
  const owner = Math.floor(Number(msg.owner)) || 0;
  if (msg.ok !== true) return { ok: false, owner, verb, text: String(msg.text || GRAVE_TEXT.other).replace(/\s+/g, ' ').trim().slice(0, 200) };
  const giant = GIANTS.has(String(msg.giant)) ? String(msg.giant) : 'generic';
  const favor = giant === 'generic' ? 0 : Math.max(0, Math.min(5, Math.floor(Number(msg.favor) || 0)));
  return { ok: true, owner, verb, name: cleanName(msg.name, UNNAMED_PLAYER), giant, favor };
}

/** The recognizer's activity line (handler 66-76 / 117-127), with the favor that landed. */
export function graveDoneText(done, favorGained = done?.favor || 0) {
  return graveRecognitionText(done.verb, done.name, done.giant, favorGained);
}

/** The owner's word from the server: { type, recognizer, croak } or null. */
export function normalizeGraveMourned(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const type = msg.verb === 'mourn' || msg.verb === 'celebrate' ? msg.verb : null;
  const croak = Math.floor(Number(msg.croak));
  if (!type || !(croak > 0)) return null;
  return { type, recognizer: cleanName(msg.by, UNNAMED_PLAYER), croak };
}

/**
 * What the owner's game sends for its grave (hellState from js/hell.js, `street` the shared street
 * it croaked on, '' when that was a private place: then nothing is shared). Null: nothing to send.
 */
export function graveSetMessage(hellState, street, now = Date.now()) {
  const g = hellState?.graveMarker;
  if (!hellState?.isDead || !g || !street || !sameTsid(street, g.tsid)) return null;
  return {
    croak: hellState.visitId,
    street: String(street),
    x: Math.round(Number(g.x) || 0),
    y: Math.round(Number(g.y) || 0),
    giant: GIANTS.has(g.giant) ? g.giant : 'generic',
    age: Math.max(0, Math.round(now - (Number(g.createdAt) || now))),
    state: STATES.includes(g.state) ? g.state : 'none',
    by: g.state && g.state !== 'none' ? cleanName(g.recognizer) : '',
  };
}
