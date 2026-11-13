/**
 * Thornfad Layers' letters (register G678; rules and sources in js/thornfad-letters.js).
 *
 * Walk into the box by the locked door and a letter (or a heart) shows over your head; walk out
 * and it goes (give_letters on enter, remove_letters on exit, player_exit on leaving the street).
 * The art is Tiny Speck's letter_<x>_overlay (overlays-more.json, tools/overlays/build.mjs).
 *
 * Online, everyone on the street sees each other's letters, as in the footage: the letter rides
 * the emote message (realtime-client.js LETTER_WORDS, the client's 'overlay' event), letter_off
 * takes it down, and the word goes again when someone joins the street or the roster arrives
 * after the roll. Any letter word from another player is drawn over that Glitch, wherever it came
 * from.
 *
 * QA: ?autostart=1&questoffer=off&streetdemo=GCR12NU45AM12BB&streetx=930&streety=1240
 *   (stands in the box; &thornfadletter=E or =heart picks the letter). Canvas data:
 *   thornfadLetter (the letter over your head, '' for none), thornfadInside (1 in the box),
 *   thornfadRolls (letters given this visit), thornfadRemote (letters drawn over others).
 */

import { LETTER_BOX, LETTER_INDICATOR, inLetterBox, isThornfadLayers, letterOverlayKey, parseForcedLetter, rollStreetLetter } from '../thornfad-letters.js?v=1efc7d8d';
import { letterFromWord, letterWord, LETTER_WORD_OFF } from '../realtime-client.js?v=2663e2d3';
import { playOverlay } from '../overlays.js?v=219965d5';

export const THORNFAD_LETTERS_FEATURE_ID = 'thornfad-letters';
const DATA_MS = 250;

let active = false;
let inside = false;
let letter = null; // pc.letter: 'A'..'Z', 'heart', '1'; null = no pc.has_letter
let view = null;
let rolls = 0;
let lastData = 0;
let client = null;
let offs = [];
let unsent = false;
const remote = new Map(); // player id -> { letter, view }

function point(x, y, dy) {
  return { x: x + LETTER_INDICATOR.dx, y: y + dy };
}

/** The letter's overlay standing over `at()` (feet); null for '1' (no art: nothing shows). */
export function playLetter(engine, which, at, alive = null, dy = LETTER_INDICATOR.headDy) {
  const key = letterOverlayKey(which);
  if (!key || !engine?.PIXI) return null;
  return playOverlay(engine.PIXI, key, {
    layer: engine.fxLayer || engine.entityLayer,
    at: () => { const p = at(); return point(p.x, p.y, dy); },
    wh: LETTER_INDICATOR.wh,
    durationMs: 0,
    loop: true,
    zIndex: 950,
    alive,
  });
}

function publish(engine, force = false) {
  const now = Date.now();
  if (!force && now - lastData < DATA_MS) return;
  lastData = now;
  engine.setData('thornfadLetter', letter && letter !== '1' ? letter : '');
  engine.setData('thornfadInside', inside ? 1 : 0);
  engine.setData('thornfadRolls', rolls);
  engine.setData('thornfadRemote', remote.size);
}

function liveClient(engine) {
  return engine.mode === 'multiplayer' ? engine.query?.('realtimeClient') || null : null;
}

function send(engine) {
  const c = liveClient(engine);
  if (!c?.emote) return;
  unsent = !c.emote(letter && letter !== '1' ? letterWord(letter) : LETTER_WORD_OFF);
}

function dropView() {
  view?.stop?.();
  view = null;
}

/** give_letters: a letter only when you have none (pc.has_letter). */
function give(engine) {
  if (letter != null) return;
  letter = parseForcedLetter(engine.param?.('thornfadletter')) || rollStreetLetter();
  rolls += 1;
  dropView();
  view = playLetter(engine, letter, () => ({ x: engine.player?.x || 0, y: engine.player?.y || 0 }));
  if (letter !== '1') send(engine);
}

/** remove_letters / player_exit. */
function take(engine, tell = true) {
  const had = letter != null && letter !== '1';
  letter = null;
  dropView();
  if (had && tell) send(engine);
}

function dropRemote(id) {
  remote.get(id)?.view?.stop?.();
  remote.delete(id);
}

function clearRemote() {
  for (const id of [...remote.keys()]) dropRemote(id);
}

/** Another player's letter word (the client's 'overlay' event). */
export function onRemoteLetter(engine, { id, e }) {
  const which = letterFromWord(e);
  if (which === null) return;
  dropRemote(id);
  if (which) {
    const root = () => engine.query?.('remoteAvatar', id);
    if (root()) {
      const v = playLetter(engine, which, () => { const r = root(); return r ? { x: r.x, y: r.y } : { x: 0, y: 0 }; }, () => Boolean(root()), LETTER_INDICATOR.remoteDy);
      remote.set(id, { letter: which, view: v });
      v?.done?.then(() => { if (remote.get(id)?.view === v) remote.delete(id); });
    }
  }
  publish(engine, true);
}

/** Listen to the realtime client once it exists (and again if it changes). */
function watch(engine) {
  const c = liveClient(engine);
  if (c === client) return;
  for (const off of offs) off?.();
  offs = [];
  clearRemote();
  client = c;
  if (!c?.on) return;
  offs.push(c.on('overlay', (msg) => onRemoteLetter(engine, msg)));
  offs.push(c.on('left', ({ id }) => dropRemote(id)));
  // GSJS sent indicators again to whoever arrived: say your letter to the newcomer.
  offs.push(c.on('joined', () => { if (letter && letter !== '1') send(engine); }));
  offs.push(c.on('roster', () => { if (unsent && letter && letter !== '1') send(engine); }));
}

export const thornfadLettersFeature = {
  id: THORNFAD_LETTERS_FEATURE_ID,

  onStreetEnter(street, engine) {
    take(engine, false);
    clearRemote();
    inside = false;
    rolls = 0;
    unsent = false;
    active = isThornfadLayers(street?.tsid) && !engine.transientInstance?.() && !engine.homeContext?.().inHome;
    watch(engine);
    publish(engine, true);
  },

  onStreetClear(engine) {
    // player_exit: the letter goes with you off the street (others drop it on 'left').
    if (engine) take(engine, false);
    else { letter = null; dropView(); }
    clearRemote();
    inside = false;
    active = false;
  },

  onTick(_dtMs, _now, engine) {
    watch(engine);
    if (!active || !engine.started || !engine.player) {
      publish(engine);
      return;
    }
    const now = inLetterBox(engine.player.x, engine.player.y);
    if (now && !inside) give(engine);
    else if (!now && inside) take(engine);
    inside = now;
    publish(engine);
  },

  /** QA / tests. */
  _state() {
    return { active, inside, letter, rolls, remote: [...remote].map(([id, r]) => [id, r.letter]), box: LETTER_BOX.id };
  },
};
