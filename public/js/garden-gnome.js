/**
 * The Garden Gnome's rules (G435, items/npc_garden_gnome.js). No DOM: the feature draws it.
 *
 * - Place: in your own home only (pols_is_pol and pols_is_owner, 102-144): the home street, the
 *   house and a Tower floor. The source's other case, 300 px from the door of your house on a public
 *   street (houses_get_entrances), has no counterpart: the remake's homes have no such door.
 * - Teach: three phrases at most (343-414), each up to 150 characters (520-576), chat-filtered when
 *   said (talk_onRun 611-619). Flip faces it the other way (221-265). Pick up puts it back (292-319).
 * - A bump: one player's first in 60 s turns it towards them and hops; a later one has a 25% chance
 *   of a blink (idle0_onMsg 452-484). After a hop it says a random phrase if it knows any, for
 *   1.5 s + 30 ms a character, looks 1.5 s, settles 1.2 s (431-444, 503-518, 595-619).
 * - Frames: npc_garden_gnome.swf's own labels at 24 fps (js/garden-gnome-art.js, tools/gnome-art):
 *   each state shows its label (gnomeCell); hopLoop and talk repeat, the others play once and
 *   hold. hop_onExit (427-429) broadcasts hopEnd as the hop gives way to talk or idle0, so the
 *   landing plays out once before the next label (gnomeVisual).
 */

export const GNOME_CLASS = 'npc_garden_gnome';
export const GNOME_MAX_PHRASES = 3;
export const GNOME_PHRASE_MAX = 150;
export const GNOME_HIT_BOX = Object.freeze({ w: 400, h: 150 }); // onCreate 555 apiSetHitBox
export const GNOME_TIMES = Object.freeze({
  bumpMemoryMs: 60000, // idle0_onMsg: time() - colliders <= 60
  blinkChance: 0.25,
  blinkMs: 1000,
  hopStartMs: 100,
  hopLoopMs: 800,
  lookMs: 1500,
  settleMs: 1200,
  resetDirectionMs: 20000,
  boomMs: 5000,
  bubblePadMs: 250,
});

export const GNOME_TEXT = Object.freeze({
  placeTip: 'Place it here',
  placeOnly: 'The Gnome can only be placed in your house, yard or on your home street.',
  useInstead: 'Use Place to set the Gnome down.',
  teachTip: 'Teach me a new phrase',
  flipTip: 'Flip me to face the other direction',
  pickupTip: 'Put it in your pack',
  bagFull: 'Your bag is full!',
  full: "I can't learn any more phrases. Pick one for me to forget!",
  some: 'Teach me a new phrase or pick one for me to forget!',
  none: 'Want to teach me a new phrase?',
  teachOk: 'OK',
  teachWitty: 'I have a witty phrase.',
  nevermind: 'Nevermind!',
  forgot: 'Ok, forgot that one.',
  inputTitle: 'Teach Me',
  inputLabel: 'A witty phrase:',
  boom: (phrase) => `BOOM! Now I know how to say: "${phrase}"`,
});

const clean = (v) => String(v ?? '').slice(0, GNOME_PHRASE_MAX);

/** Saved phrases, cleaned: strings with something in them, three at most. */
export function cleanPhrases(list) {
  return (Array.isArray(list) ? list : []).map(clean).filter((p) => p.trim()).slice(0, GNOME_MAX_PHRASES);
}

/** What a gnome keeps wherever it is, in the pack or set down. */
export function normalizeGnome(seed = {}) {
  return { facingLeft: seed?.facingLeft !== false, phrases: cleanPhrases(seed?.phrases) };
}

/** A gnome set down: where, plus what it keeps. */
export function normalizePlaced(seed = {}) {
  return {
    ...normalizeGnome(seed),
    id: String(seed?.id || '').slice(0, 40),
    place: String(seed?.place || '').slice(0, 40),
    x: Math.round(Number(seed?.x) || 0),
    y: Math.round(Number(seed?.y) || 0),
  };
}

export function normalizeGnomeSlice(seed = {}) {
  const placed = (Array.isArray(seed?.placed) ? seed.placed : []).map(normalizePlaced).filter((g) => g.id && g.place);
  const packed = (Array.isArray(seed?.packed) ? seed.packed : []).map(normalizeGnome);
  return { placed, packed };
}

/** The place in your own home you stand in, or null: a home street, a house floor, a Tower floor. */
export function gnomePlaceFor(scene, { inHome = false, visiting = false } = {}) {
  if (!inHome || visiting || !scene) return null;
  if (scene.room === 'street') return 'street';
  if (scene.room !== 'interior') return null;
  if (scene.tower != null) return `tower:${scene.tower}`;
  return scene.houseFloor ? `house:${scene.houseFloor}` : 'house';
}

/** The Place verb's state: conditions 113-140. */
export function placeState(place) {
  return place ? { enabled: true, reason: '' } : { enabled: false, reason: GNOME_TEXT.placeOnly };
}

/** The Teach menu (teach handler 362-411): its line and choices. */
export function teachMenu(phrases = []) {
  const forget = phrases.map((p, i) => ({
    value: `forget-${i}`,
    label: `Forget "${p.length > 20 ? `${p.slice(0, 20)}...` : p}"`,
  }));
  const nevermind = { value: 'nevermind', label: GNOME_TEXT.nevermind };
  if (phrases.length >= GNOME_MAX_PHRASES) return { text: GNOME_TEXT.full, choices: [...forget, nevermind] };
  if (phrases.length) return { text: GNOME_TEXT.some, choices: [{ value: 'teach', label: GNOME_TEXT.teachWitty }, ...forget, nevermind] };
  return { text: GNOME_TEXT.none, choices: [{ value: 'teach', label: GNOME_TEXT.teachOk }, nevermind] };
}

/** onInputBoxResponse 568-576. Returns the phrase learned, or null. */
export function learnPhrase(gnome, value) {
  const phrase = clean(value);
  if (!phrase.trim() || gnome.phrases.length >= GNOME_MAX_PHRASES) return null;
  gnome.phrases.push(phrase);
  return phrase;
}

/** onConversation's forget. */
export function forgetPhrase(gnome, index) {
  if (!Number.isInteger(index) || index < 0 || index >= gnome.phrases.length) return false;
  gnome.phrases.splice(index, 1);
  return true;
}

/** How long a phrase is said (talk_onRun 614: 30 ms a character + 1.5 s). */
export const phraseMs = (phrase) => 1500 + String(phrase).length * 30;

/** The way it looks with `dir`: the art faces left as drawn, and the source calls that 'right' (461: "the asset is backwards"). */
export const gnomeScaleX = (dir) => (dir === 'left' ? -1 : 1);

/** A gnome's moment-to-moment state (not saved): idle0, idleBlink, hopStart, hopLoop, talk, look, lookSettle. */
export function createGnomeRuntime(gnome) {
  return {
    state: 'idle0',
    until: 0,
    dir: gnome.facingLeft ? 'left' : 'right',
    hopDir: gnome.facingLeft ? 'left' : 'right',
    hopAt: 0,
    resetAt: 0,
    colliders: {},
    inside: false,
  };
}

/** onResetDirection 590-593: back to its own way, by a hop (only from idle0: hop_onEnter 416-425). */
export function resetDirection(gnome, rt, now) {
  rt.hopDir = gnome.facingLeft ? 'left' : 'right';
  rt.resetAt = 0;
  return startHop(rt, now);
}

function startHop(rt, now) {
  if (rt.state !== 'idle0') return false;
  rt.state = 'hopStart';
  rt.until = now + GNOME_TIMES.hopStartMs;
  return true;
}

/**
 * player_collision (idle0_onMsg 452-484, idleBlink_onMsg 492-501). Returns 'hop', 'blink' or null.
 * `playerKey` is whoever bumped it, `playerX` where.
 */
export function bumpGnome(gnome, rt, { playerKey = 'me', playerX = 0, x = 0, now = 0, rng = Math.random } = {}) {
  if (rt.state === 'idleBlink') {
    rt.state = 'idle0';
    rt.until = 0;
  }
  if (rt.state !== 'idle0') return null;
  const last = rt.colliders[playerKey];
  if (last != null && now - last <= GNOME_TIMES.bumpMemoryMs) {
    if (rng() < GNOME_TIMES.blinkChance) {
      rt.state = 'idleBlink';
      rt.until = now + GNOME_TIMES.blinkMs;
      return 'blink';
    }
    return null;
  }
  rt.colliders[playerKey] = now;
  // "*sigh* intentionally swapped because the asset is backwards" (461-466).
  rt.hopDir = playerX < x ? 'right' : 'left';
  const own = gnome.facingLeft ? 'left' : 'right';
  if (rt.hopDir !== own) rt.resetAt = now + GNOME_TIMES.resetDirectionMs;
  startHop(rt, now);
  return 'hop';
}

/** Advances the states. Returns { say: phrase } the moment it starts talking, else null. */
export function tickGnome(gnome, rt, now, rng = Math.random) {
  if (rt.resetAt && now >= rt.resetAt) resetDirection(gnome, rt, now);
  if (!rt.until || now < rt.until) return null;
  switch (rt.state) {
    case 'idleBlink':
      rt.state = 'idle0';
      rt.until = 0;
      return null;
    case 'hopStart':
      rt.dir = rt.hopDir;
      rt.state = 'hopLoop';
      rt.until = now + GNOME_TIMES.hopLoopMs;
      return null;
    case 'hopLoop': {
      if (!gnome.phrases.length) {
        rt.state = 'idle0';
        rt.until = 0;
        return null;
      }
      const phrase = gnome.phrases[Math.min(gnome.phrases.length - 1, Math.floor(rng() * gnome.phrases.length))];
      rt.state = 'talk';
      rt.until = now + phraseMs(phrase);
      return { say: phrase, ms: phraseMs(phrase) + GNOME_TIMES.bubblePadMs };
    }
    case 'talk':
      rt.state = 'look';
      rt.until = now + GNOME_TIMES.lookMs;
      return null;
    case 'look':
      rt.state = 'lookSettle';
      rt.until = now + GNOME_TIMES.settleMs;
      return null;
    case 'lookSettle':
      rt.state = 'idle0';
      rt.until = 0;
      return null;
    default:
      rt.until = 0;
      return null;
  }
}

/** The SWF frame (0-based) a label shows `elapsedMs` after it began: looping labels repeat, the rest hold their last frame. */
export function gnomeFrameIndex(art, label, elapsedMs) {
  const [first, count] = art.labels[label] || art.labels.idle0;
  const step = Math.max(0, Math.floor((Math.max(0, elapsedMs) * art.fps) / 1000));
  return first + (art.loops.includes(label) ? step % count : Math.min(count - 1, step));
}

/** The sheet cell for that frame (the sheet holds each different drawing once). */
export const gnomeCell = (art, label, elapsedMs) => art.frames[gnomeFrameIndex(art, label, elapsedMs)];

/**
 * What the gnome shows: { label, state, at }. It follows the runtime state, except that when a
 * hop's loop ends hopEnd plays through once first (hop_onExit 427-429), then the state it gave way to.
 */
export function gnomeVisual(vis, state, now, art) {
  if (!vis) return { label: state, state, at: now };
  if (vis.label === 'hopEnd') {
    if (now - vis.at < (art.labels.hopEnd[1] * 1000) / art.fps) {
      vis.state = state;
      return vis;
    }
    return { label: state, state, at: now };
  }
  if (state === vis.state) return vis;
  if (vis.state === 'hopLoop') return { label: 'hopEnd', state, at: now };
  return { label: state, state, at: now };
}

/** Whether a player at (px, py) stands in its 400 x 150 hit box. */
export function inGnomeBox(g, px, py) {
  return Math.abs(px - g.x) <= GNOME_HIT_BOX.w / 2 && Math.abs(py - g.y) <= GNOME_HIT_BOX.h;
}
