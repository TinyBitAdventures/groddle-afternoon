/**
 * Heli Kitties (npc_kitty_chicken): pure rules. No Pixi, no DOM;
 * js/features/heli-kitties-feature.js binds them to the world.
 *
 * Source: glitch-GameServerJS items/npc_kitty_chicken.js (CC0), which extends
 * npc_chicken but deliberately switches most chicken verbs off. Its
 * butter_up, squeeze, talk_to, incubate, apply_youth, and set_free
 * conditions all return {state:null}, so a live Heli Kitty only offers Pet,
 * Name/Rename (include/animal_naming.js), and the Rook-only Revive/Apply Balm.
 * Those hidden verbs are listed in KITTY_SOURCE_HIDDEN_VERBS and never shown.
 */

import { moodMax } from './metabolics.js';
import { grantMoodXp } from './mood-xp.js';
export const KITTY_ID = 'npc_kitty_chicken';
export const KITTY_LABEL = 'Heli Kitty';
export const KITTY_PLURAL = 'Heli Kitties';
export const KITTY_DESCRIPTION = 'This kitty never needs to worry about landing on its feet.';
export const KITTY_NAMING_SKILL = 'animalkinship_5';
export const KITTY_CALM_SKILL = 'animalkinship_1';

/** Chicken verbs the kitty class overrides with conditions that return {state:null}. */
export const KITTY_SOURCE_HIDDEN_VERBS = Object.freeze([
  'butter_up',
  'squeeze',
  'talk_to',
  'incubate',
  'apply_youth',
  'set_free',
]);

/** verbs.pet: metabolics_lose_energy(4), metabolics_add_mood(10), stats_add_xp(4). */
export const KITTY_PET = Object.freeze({
  energy: 4,
  mood: 10,
  xp: 4,
  bubble: 'purrrrrr',
  bubbleMs: 2000,
  tooltip: 'Pet the kitty',
  /** 3sleepStart runs 26/30 s, then one 58/30 s sleep cycle, then endSleep (+10 ms). */
  sleepStartMs: Math.round(1000 * (26 / 30)),
  sleepMs: Math.round(1000 * (58 / 30)),
  get totalMs() {
    return Math.round(1000 * ((26 / 30) + 58 / 30)) + 10;
  },
  featCapPerKitty: 3,
});

/** Movement, scare, and pause tables (npc_walkable onCreate, onPause, fly, onPlayerCollision). */
export const KITTY_MOTION = Object.freeze({
  walkSpeedMin: 50, // npc_walkable_onCreate: randInt(50, 55)
  walkSpeedMax: 55,
  edgeInset: 100, // startMovingLimited: geo.l + 100 / geo.r - 100
  appearMs: Math.round((46 / 30) * 1000) + 500, // startMoving after the 3appear clip
  firstPauseMinMs: 3000,
  firstPauseMaxMs: 11000,
  pauseEveryMinMs: 6000,
  pauseEveryMaxMs: 14000,
  scareChance: 0.75,
  scareChanceSkilled: 0.25, // with Animal Kinship 1
  kickVy: -200, // apiKickTheChicken(vx, -200)
  kickVxMin: -100,
  kickVxMax: 100,
  landedResumeMs: 1000, // onPlatformLanding: startMoving after 1 s
  mewBubble: 'Mew!',
  mewBubbleMs: 1000,
  appearState: '3appear',
  leaveState: '3disappear',
});

/** kitty_pause_state_choices: [seconds, clip]. Blink is three times as likely. */
export const KITTY_PAUSE_CHOICES = Object.freeze([
  Object.freeze([5.0 / 30 + 1, '3blink']),
  Object.freeze([5.0 / 30 + 1, '3blink']),
  Object.freeze([5.0 / 30 + 1, '3blink']),
  Object.freeze([38.0 / 30, '3happy']),
  Object.freeze([(15.0 / 30) * 8, '3chew']),
  Object.freeze([(16.0 / 30) * 3 + 0.01, '3jump']),
  Object.freeze([9 / 30 + 0.25, '3hitBall']),
]);

/** responses.rooked: the only kitty-specific lines in the class (Rook attacks are out of scope). */
export const KITTY_ROOKED_LINES = Object.freeze([
  'Ouch! My tail! HELP ME!',
  "I've been rooked. What's the opposite of purring?",
  'HISS! Scratch! Nasty rook!',
  'Please help me.',
]);

export const KITTY_NAME_HOLD_S = 3600; // canName: another player may rename after an hour

export function randInt(min, max, rng = Math.random) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Pick a pause clip and its duration in ms. */
export function choosePause(rng = Math.random) {
  const choice = KITTY_PAUSE_CHOICES[Math.floor(rng() * KITTY_PAUSE_CHOICES.length) % KITTY_PAUSE_CHOICES.length];
  return { clip: choice[1], ms: Math.round(choice[0] * 1000) };
}

export function scareChance(learned = []) {
  return (learned || []).includes(KITTY_CALM_SKILL) ? KITTY_MOTION.scareChanceSkilled : KITTY_MOTION.scareChance;
}

/** onPlayerCollision: does this bump send the kitty flying? Sleeping kitties never startle. */
export function rollScare(kitty, learned = [], rng = Math.random) {
  if (!kitty || kitty.state === 'sleep' || kitty.state === 'sleepStart' || kitty.flying) return false;
  return rng() < scareChance(learned);
}

/** Fresh per-kitty runtime state. */
export function createKitty({ key = 'kitty:0', x = 0, y = 0, name = '', namer = '', namedOn = 0, rng = Math.random } = {}) {
  return {
    key,
    x,
    y,
    dir: 'left',
    speed: randInt(KITTY_MOTION.walkSpeedMin, KITTY_MOTION.walkSpeedMax, rng),
    state: 'appear',
    stateMs: 0,
    stateLimitMs: KITTY_MOTION.appearMs,
    nextPauseMs: randInt(KITTY_MOTION.firstPauseMinMs, KITTY_MOTION.firstPauseMaxMs, rng),
    flying: false,
    vx: 0,
    vy: 0,
    clip: '3appear',
    name: sanitizeKittyName(name),
    namer: String(namer || ''),
    namedOn: Number(namedOn) || 0,
    pets: 0,
  };
}

/** Kitty-visible verbs for the menu. */
export function kittyVerbs(kitty, { learned = [], energy = 0, playerId = 'player', nowS = 0 } = {}) {
  const verbs = [];
  verbs.push({
    id: 'pet',
    label: 'pet',
    tooltip: KITTY_PET.tooltip,
    enabled: !kitty.flying,
    reason: kitty.flying ? 'This kitty is up in the air.' : '',
    energy: KITTY_PET.energy,
  });
  const naming = canNameKitty(kitty, { learned, playerId, nowS });
  if (!kitty.name) {
    // verbs.name only appears once you are able to use it.
    if (naming.ok) verbs.push({ id: 'name', label: 'name', tooltip: 'Give this kitty a name', enabled: true });
  } else {
    verbs.push({
      id: 'rename',
      label: 'rename',
      tooltip: "Change this kitty's name",
      enabled: naming.ok,
      reason: naming.ok ? '' : naming.reason,
    });
  }
  return verbs;
}

/**
 * verbs.pet. Mutates pc. The kitty curls up for one sleep cycle, then flies on.
 * metabolics_lose_energy never fails: it takes whatever energy is left.
 */
export function petKitty(kitty, pc) {
  if (!kitty || kitty.flying) return { ok: false, reason: 'flying', msg: 'This kitty is up in the air.' };
  const energy = Math.min(KITTY_PET.energy, Math.max(0, pc.energy || 0));
  pc.energy = Math.max(0, (pc.energy || 0) - energy);
  const before = pc.mood || 0;
  pc.mood = Math.min(moodMax(pc), before + KITTY_PET.mood);
  const mood = pc.mood - before;
  // npc_kitty_chicken.js 757: stats_add_xp(4) takes the mood bonus.
  const xp = grantMoodXp(pc, KITTY_PET.xp);
  kitty.pets = (kitty.pets || 0) + 1;
  startSleep(kitty);
  return {
    ok: true,
    energy: -energy,
    mood,
    xp,
    bubble: KITTY_PET.bubble,
    feat: kitty.pets <= KITTY_PET.featCapPerKitty,
  };
}

export function startSleep(kitty) {
  kitty.state = 'sleepStart';
  kitty.clip = '3sleepStart';
  kitty.stateMs = 0;
  kitty.stateLimitMs = KITTY_PET.sleepStartMs;
}

/** include/animal_naming.js canName for an ordinary (non-POL) street. */
export function canNameKitty(kitty, { learned = [], playerId = 'player', nowS = 0 } = {}) {
  if (!(learned || []).includes(KITTY_NAMING_SKILL)) {
    return { ok: false, reason: 'Naming animals takes Animal Kinship V.' };
  }
  if (!kitty.name) return { ok: true };
  if (kitty.namer && kitty.namer === playerId) return { ok: true };
  if (!kitty.namedOn || nowS - kitty.namedOn > KITTY_NAME_HOLD_S) return { ok: true };
  return { ok: false, reason: 'Someone named this kitty less than an hour ago.' };
}

/** onInputBoxResponse: 32 characters, letters, digits, and spaces only. */
export function sanitizeKittyName(value) {
  return String(value || '').substr(0, 32).replace(/[^a-z0-9 ]/gi, '');
}

/** Apply a name. Returns the bubble line or a refusal. */
export function nameKitty(kitty, value, { learned = [], playerId = 'player', nowS = 0 } = {}) {
  const gate = canNameKitty(kitty, { learned, playerId, nowS });
  if (!gate.ok) return { ok: false, reason: gate.reason };
  const name = sanitizeKittyName(value);
  if (!name || name === kitty.name) return { ok: false, reason: 'unchanged' };
  const previous = kitty.name || '';
  kitty.name = name;
  kitty.namer = playerId;
  kitty.namedOn = nowS;
  return {
    ok: true,
    name,
    previous,
    bubble: `And they shall call me "${name}"`,
    counter: `animals_named:${KITTY_ID}`,
  };
}

/** getLabel: 'A Heli Kitty Named X'. */
export function kittyLabel(kitty) {
  return kitty?.name ? `A ${KITTY_LABEL} Named ${kitty.name}` : KITTY_LABEL;
}

/** fly(): a kick up and sideways; flying blocks petting until it lands. */
export function kickKitty(kitty, rng = Math.random) {
  kitty.vx = randInt(KITTY_MOTION.kickVxMin, KITTY_MOTION.kickVxMax, rng);
  kitty.vy = KITTY_MOTION.kickVy;
  kitty.dir = kitty.vx < 0 ? 'left' : 'right';
  kitty.flying = true;
  kitty.state = 'air';
  kitty.clip = '3fly';
  kitty.stateMs = 0;
  kitty.stateLimitMs = 0;
}

export const KITTY_GRAVITY = 380; // px/s²: a soft, rotor-assisted arc (the server's physics constant is not in GSJS)

/**
 * Advance a kitty. `surfaceY(x, y)` returns the walkable surface near y, or
 * null over a gap; `landY(x, y)` returns the first surface at or below y.
 * @returns {string[]} events: 'landed', 'woke'
 */
export function stepKitty(kitty, dtMs, world, rng = Math.random) {
  const events = [];
  const dt = Math.max(0, Number(dtMs) || 0);
  kitty.stateMs += dt;
  if (kitty.state === 'air') {
    const s = dt / 1000;
    kitty.vy += KITTY_GRAVITY * s;
    const nx = clamp(kitty.x + kitty.vx * s, world.geo.l + KITTY_MOTION.edgeInset, world.geo.r - KITTY_MOTION.edgeInset);
    const ny = kitty.y + kitty.vy * s;
    const ground = typeof world.landY === 'function' ? world.landY(nx, kitty.y) : world.groundY;
    kitty.x = nx;
    if (kitty.vy > 0 && ground != null && ny >= ground) {
      kitty.y = ground;
      kitty.flying = false;
      kitty.vx = 0;
      kitty.vy = 0;
      kitty.state = 'landed';
      kitty.clip = '3fly';
      kitty.stateMs = 0;
      kitty.stateLimitMs = KITTY_MOTION.landedResumeMs;
      events.push('landed');
    } else {
      kitty.y = ny;
    }
    return events;
  }
  if (kitty.state === 'sleepStart' && kitty.stateMs >= kitty.stateLimitMs) {
    kitty.state = 'sleep';
    kitty.clip = '3sleep';
    kitty.stateMs = 0;
    kitty.stateLimitMs = KITTY_PET.sleepMs + 10;
    return events;
  }
  if (kitty.state === 'sleep' && kitty.stateMs >= kitty.stateLimitMs) {
    events.push('woke');
    beginMove(kitty);
    return events;
  }
  if ((kitty.state === 'appear' || kitty.state === 'pause' || kitty.state === 'landed') && kitty.stateMs >= kitty.stateLimitMs) {
    beginMove(kitty);
    return events;
  }
  if (kitty.state !== 'move') return events;

  kitty.nextPauseMs -= dt;
  if (kitty.nextPauseMs <= 0) {
    const pause = choosePause(rng);
    if (rng() < 0.5) kitty.dir = kitty.dir === 'left' ? 'right' : 'left';
    kitty.state = 'pause';
    kitty.clip = pause.clip;
    kitty.stateMs = 0;
    kitty.stateLimitMs = pause.ms;
    kitty.nextPauseMs = randInt(KITTY_MOTION.pauseEveryMinMs, KITTY_MOTION.pauseEveryMaxMs, rng);
    return events;
  }
  const left = world.geo.l + KITTY_MOTION.edgeInset;
  const right = world.geo.r - KITTY_MOTION.edgeInset;
  const sign = kitty.dir === 'left' ? -1 : 1;
  let nx = kitty.x + (sign * kitty.speed * dt) / 1000;
  if (nx <= left || nx >= right) {
    nx = clamp(nx, left, right);
    kitty.dir = kitty.dir === 'left' ? 'right' : 'left';
  }
  if (typeof world.surfaceY === 'function') {
    const y = world.surfaceY(nx, kitty.y);
    if (y == null) {
      kitty.dir = kitty.dir === 'left' ? 'right' : 'left'; // onStuck
      return events;
    }
    kitty.y = y;
  }
  kitty.x = nx;
  return events;
}

function beginMove(kitty) {
  kitty.state = 'move';
  kitty.clip = '3fly';
  kitty.stateMs = 0;
  kitty.stateLimitMs = 0;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Street slot rows: names only (positions are live). */
export function normalizeKittySlot(slot = {}) {
  const out = {};
  const rows = slot?.names && typeof slot.names === 'object' ? slot.names : {};
  for (const [key, row] of Object.entries(rows)) {
    if (!/^kitty:\d{1,2}$/.test(key) || !row || typeof row !== 'object') continue;
    const name = sanitizeKittyName(row.name);
    if (!name) continue;
    out[key] = { name, namer: String(row.namer || '').slice(0, 40), namedOn: Math.max(0, Number(row.namedOn) || 0) };
  }
  return { names: out };
}

/** Planner count: archived Heli Kitty labels, capped at three per street like the other roaming animals. */
export function kittyCountFor(counts = {}) {
  const n = Math.floor(Number(counts?.[KITTY_ID]) || 0);
  return Math.max(0, Math.min(3, n));
}
