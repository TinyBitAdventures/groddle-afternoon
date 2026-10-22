/**
 * Rook attacks: pure rules (no Pixi, no DOM). The feature module
 * js/features/rook-attack-feature.js binds them to the street.
 *
 * Source anchors (glitch-GameServerJS):
 * - groups/rook_attack.js: phases build_up / angry / stunned / dead, max_stun
 *   1000, angry_time 180, max_stun_failures 5, wing beat every 10 min (2 min
 *   after the first stun attempt), angry1 -> angry2 after 60 s -> angry3 after
 *   30 s ("ATTACK IMMINENT!"), 2-minute stun recovery, clear 15 s after death,
 *   default health 1000 (config_prod rook_attack_strength 5000 is the hub-wide
 *   prod strength), admin.js schedule default 60/60 minutes.
 * - locations/inc_rook.js: overlay copy and colours (#900020 crimson, #008080
 *   teal at 0.7 alpha: 0.5 s in, 3.25 s hold, 0.5 s out), Focusing Orb stun
 *   table (1/2/3/4/5/6-8 joiners -> 25/40/60/85/130/200 stun, initiator XP
 *   10/20/20/30/30/50, everyone in the orb +25 iMG), a solo orb fails for
 *   +5 iMG and -5 mood, 9+ joiners break the orb, wing beat costs every player
 *   20 energy and 20 mood (Rook Armor: half energy, no mood), defeat pays
 *   damage*2+50 iMG to attackers and 50 to witnesses.
 * - items/include/rook.js: each rookable item has a 50% chance per wing beat;
 *   revive is a 10 s skill package (catalog_skill_packages rook_revive) that
 *   costs 25 energy and 25 mood for 25 iMG and needs three healers; the third
 *   gets +25 iMG and 10 favor with every Giant plus the fully revived rainbow.
 * - items/potion_rook_balm.js: 5-point tool, pour 2.5 s within 200 px, a full
 *   revive (force_full_revive: +200 iMG). Recipe 243 (cauldron, Potionmaking
 *   II): 1 Essence of Rookswort + 3 White Gas + 1 Krazy Salts.
 * - items/essence_of_rookswort.js: Rook Armor buff (300 s, buffs.json) only
 *   during an attack; achievements/rook_ranger.js counter
 *   essence_of_rookswort:defeated_rook.
 * - items/include/shrines.js + npc_shrine_*.js: prime (10 energy, 10 s, only
 *   while stunned), strike damage = 10% of offered base cost (250 per own
 *   emblem), XP = damage, 3 s between strikes, priming pays total/2.
 * - items/include/trants.js onRooked: all fruit removed, health -2 (a health-1
 *   tree dies), pet/water blocked while rooked.
 * - items/npc_forehorseman.js: frantic state, flips every 5 s, a 3 s bubble
 *   one second after each flip from seven speak_choices.
 *
 * Solo adaptations (the remake has one player and a 100-energy tank; the
 * source fight was tuned for a crowd of level-12+ Glitches), all in ROOK_SOLO:
 * - Metabolic costs scale by 0.2 (source 50/25/20/10 -> 10/5/4/2).
 * - Stun joiners are the street itself: un-rooked critters and trees (nearest
 *   first) plus the street's shrine join the orb one at a time, up to 8.
 *   Martial Imagination / Piety are not required ("or team up with someone
 *   who does").
 * - Shrine strikes hit with a ten-Glitch crowd (x10) and at least 100.
 * - One player may give all three revive doses.
 * - After three wing beats the Rook leaves on its own; recovery from a stun
 *   re-arms the 10-minute wing beat so an abandoned fight still ends.
 * - A tree at health 1 stays at 1 instead of dying.
 * - A 30 s herald (the Forehorseman plus the 2011 "Der Rook iz Coming!"
 *   warning fades, compressed from their ~45 s cadence) precedes the attack.
 */

export const ROOK_SOURCE = Object.freeze({
  maxStun: 1000,
  defaultHealth: 1000,
  prodStrength: 5000,
  angryTimeS: 180,
  maxStunFailures: 5,
  wingBeatS: 600,
  angryWingBeatS: 120,
  angry2AfterS: 60,
  angry3AfterS: 30,
  stunRecoveryS: 120,
  clearAfterDeathS: 15,
  scheduleMinMin: 60,
  scheduleMaxMin: 60,
  orbWindowMs: 15000,
  orbMaxJoiners: 9,
  stunEnergy: 50,
  stunAssistXp: 25,
  failXp: 5,
  failMood: 5,
  wingBeatEnergy: 20,
  wingBeatMood: 20,
  rookChance: 0.5,
  witnessXp: 50,
  defeatBaseXp: 50,
  defeatDamageMultiplier: 2,
  reviveMs: 10000,
  reviveEnergy: 25,
  reviveMood: 25,
  reviveXp: 25,
  reviveHealers: 3,
  reviveFinalBonusXp: 25,
  reviveFinalFavor: 10,
  balmPourMs: 2500,
  balmBonusXp: 200,
  balmPoints: 5,
  balmRange: 200,
  armorS: 300,
  primeEnergy: 10,
  primeMs: 10000,
  strikeCooldownMs: 3000,
  strikeBaseCostRate: 0.1,
  strikeEmblem: 250,
  trantHealthLoss: 2,
  forehorsemanFlipMs: 5000,
  forehorsemanSpeakDelayMs: 1000,
  forehorsemanBubbleMs: 3000,
  overlayInS: 0.5,
  overlayHoldS: 3.25,
  overlayOutS: 0.5,
  overlayAlpha: 0.7,
});

export const ROOK_SOLO = Object.freeze({
  metabolicScale: 0.2,
  heraldMs: 30000,
  heraldWarnEveryMs: 15000,
  maxWingBeats: 3,
  joinIntervalMs: 1200,
  maxJoiners: 8,
  shrineJoins: true,
  strikeCrowd: 10,
  strikeFloor: 100,
  departMs: 6000,
});

export const ROOK_COLORS = Object.freeze({ crimson: 0x900020, teal: 0x008080, herald: 0x0a0610 });

export const ROOK_TEXT = Object.freeze({
  herald: Object.freeze({ txt: '¡Der Rook iz Coming!', sub: '' }),
  attack: Object.freeze({ txt: 'ROOK ATTACK!', sub: '' }),
  firstStun: Object.freeze({ txt: 'FIRST STUN ATTEMPT!', sub: 'Completely stun the Rook within 2 minutes or it will attack!' }),
  stunned: Object.freeze({ txt: 'STUNNED!', sub: 'The rook is now vulnerable to shrine attacks!' }),
  imminent: Object.freeze({ txt: 'ATTACK IMMINENT!', sub: 'The Rook is about to attack!' }),
  defeated: Object.freeze({ txt: 'THE ROOK IS DEFEATED!', sub: 'You have driven back the horror of the Rook, at least for now.' }),
  departed: Object.freeze({ txt: 'THE ROOK FLIES OFF', sub: 'Sated for now. Revive what it left behind.' }),
  stunnedNote: 'The rook has been stunned. Now is your chance to fight back!',
  stunTooltip: 'Begin a stun attack against the Rook. Costs $energy_cost energy',
  stunWait: "You'll have to wait until the right time to unleash the awesome power of Martial Imagination.",
  stunTired: 'You are too tired to keep fighting.',
  stunStarted: (energy) => `You initiated a stun attack with the Focusing Orb. You lose ${energy} energy.`,
  stunFailed: (xp, mood) => `You failed to attack the Rook. You need other players to join in. You gain ${xp} iMG${mood ? ` but you lose ${mood} mood` : ''}.`,
  stunInitiatorXp: (xp) => `You received ${xp} iMG for your successful attack against the Rook`,
  stunStruck: (damage, xp) => `You struck back against the Rook for ${damage} points of stun. You got ${xp} iMG.`,
  primeTooltip: 'Prime the shrine as a weapon against the rook. Costs $energy_cost energy',
  primeNotRooked: 'You can prime a shrine only in the presence of enemies of imagination.',
  primeNotStunned: 'You must stun the Rook using your Focusing Orb before it is vulnerable to shrine attacks.',
  donateBlocked: 'Interference from the Rook is blocking donations.',
  strikeNeedsPrime: 'This shrine must be primed in order to attack the Rook.',
  strikeHit: (damage, xp) => `You struck back against the Rook, causing ${damage} damage. You got ${xp} iMG.`,
  primeDone: (xp, damage) => `You have finished priming the shrine for attack.${xp ? ` You got ${xp} iMG for the ${damage} damage dealt to the Rook.` : ''}`,
  defeatHelp: (xp) => `You helped defeat the Rook. You got ${xp} iMG for your contributions.`,
  defeatWitness: (xp) => `You got ${xp} iMG for witnessing the defeat of the Rook.`,
  reviveTooltip: 'Help this $itemclass escape the effects of The Rook. Costs $energy_cost energy',
  reviveFull: (label) => `Enough doses are already reviving this ${label}.`,
  balmTooltip: 'Instantly revive a rooked plant or animal',
  balmNothing: 'There is nothing here to apply this to.',
  armorWait: 'Maybe you should save this for a Rook attack.',
  armorActive: 'You are already under the effects of Essence of Rookswort.',
  armorOn: 'Your loins are now exceptionally girded. You will lose less energy and mood from doing battle with the Rook.',
});

/** Stun feed lines (groups/rook_attack.js completeStun). */
export function stunFeedText(label, assists, damage, stunTotal, maxStun = ROOK_SOURCE.maxStun) {
  const assistText = assists > 0 ? `and ${assists} ${assists === 1 ? 'other' : 'others'}` : '';
  const attempt = damage > 0
    ? `led an attack against the Rook, stunning it for ${damage} points`
    : 'attempted to stun the Rook, but failed.';
  let text = `${label} ${assistText} ${attempt}`.replace(/\s+/g, ' ');
  if (damage > 0) {
    text += stunTotal < maxStun ? `. ${maxStun - stunTotal} remaining to stun the Rook.` : ', stunning it.';
  }
  return text;
}

/** Damage feed lines (groups/rook_attack.js completeAttack). */
export function damageFeedText(label, damage, health) {
  return health > 0
    ? `${label} attacked the Rook for ${damage} damage. ${health} health remaining.`
    : `${label} attacked the Rook for ${damage} damage, defeating it.`;
}

export const FOREHORSEMAN_LINES = Object.freeze([
  'The end is neiiiiiiiighgh!',
  'Hark: the Giants awaken!',
  'All things are evanescent!!!',
  'The tranquil extinction is the Bliss.',
  'They did not mourn you before you were born …',
  'Bbbbrbrrbrrrr-eehhhhhh-frdph-drdphfff-rrrr.',
  "I can't believe this is happening!!",
]);

/** Classes that include items/include/rook.js (players excluded: rook_wrath was retired). */
export const ROOKABLE_CLASSES = Object.freeze([
  'trant_fruit',
  'trant_egg',
  'trant_bean',
  'trant_bubble',
  'trant_spice',
  'trant_gas',
  'wood_tree',
  'paper_tree',
  'npc_piggy',
  'npc_chicken',
  'npc_butterfly',
  'npc_kitty_chicken',
]);
const ROOKABLE = new Set(ROOKABLE_CLASSES);

export function isRookableClass(classId) {
  return ROOKABLE.has(String(classId || ''));
}

export function isTreeClass(classId) {
  const id = String(classId || '');
  return id.startsWith('trant_') || id === 'wood_tree' || id === 'paper_tree';
}

/** Metabolic cost after the solo 100-energy-tank scale (and Rook Armor). */
export function soloCost(sourceValue, { armor = false, armorRule = 'half' } = {}) {
  let value = sourceValue;
  if (armor) value = armorRule === 'none' ? 0 : value / 2;
  return Math.max(0, Math.round(value * ROOK_SOLO.metabolicScale));
}

/** Focusing Orb stun table (locations/inc_rook.js doOrbAttack). */
export function stunTableFor(joiners) {
  const n = Math.max(0, Math.floor(Number(joiners) || 0));
  let damage = 0;
  let xp = 0;
  if (n === 1) [xp, damage] = [10, 25];
  else if (n === 2) [xp, damage] = [20, 40];
  else if (n === 3) [xp, damage] = [20, 60];
  else if (n === 4) [xp, damage] = [30, 85];
  else if (n === 5) [xp, damage] = [30, 130];
  else if (n >= 6 && n <= 8) [xp, damage] = [50, 200];
  return { joiners: n, damage, xp, broke: n >= ROOK_SOURCE.orbMaxJoiners, failed: n < 1 || n > 8 };
}

/** Orb overlay state + scale (updateOrbMessages). */
export function orbLookFor(joiners) {
  const n = Math.max(0, Math.floor(Number(joiners) || 0));
  let state = 'orbBreak';
  if (n === 0) state = 'orb1';
  else if (n < 3) state = 'orb2';
  else if (n < 6) state = 'orb3';
  else if (n < 9) state = 'orb4';
  return { state, scale: Math.min(1 + n / 6, 2) };
}

// ---------------------------------------------------------------------------
// Save + schedule
// ---------------------------------------------------------------------------

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function normalizeRookSave(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const stats = s.stats && typeof s.stats === 'object' ? s.stats : {};
  return {
    nextAttackAt: num(s.nextAttackAt, 0),
    lastStreet: typeof s.lastStreet === 'string' ? s.lastStreet : '',
    active: s.active && typeof s.active === 'object' && typeof s.active.tsid === 'string' ? normalizeAttack(s.active) : null,
    armorUntil: num(s.armorUntil, 0),
    balmPoints: Math.max(0, Math.min(ROOK_SOURCE.balmPoints, Math.floor(num(s.balmPoints, 0)))),
    stats: {
      attacks: Math.max(0, Math.floor(num(stats.attacks))),
      defeats: Math.max(0, Math.floor(num(stats.defeats))),
      departures: Math.max(0, Math.floor(num(stats.departures))),
      stuns: Math.max(0, Math.floor(num(stats.stuns))),
      strikes: Math.max(0, Math.floor(num(stats.strikes))),
      revives: Math.max(0, Math.floor(num(stats.revives))),
      fullRevives: Math.max(0, Math.floor(num(stats.fullRevives))),
      balms: Math.max(0, Math.floor(num(stats.balms))),
    },
  };
}

/** Minutes between attacks (groups/rook_attack.js setAttackTimer; admin default 60/60). */
export function attackDelayMs(rng = Math.random) {
  const min = ROOK_SOURCE.scheduleMinMin;
  const max = ROOK_SOURCE.scheduleMaxMin;
  const minutes = Math.floor(min + (max - min) * rng());
  return minutes * 60 * 1000;
}

export function scheduleNextAttack(save, now, rng = Math.random) {
  save.nextAttackAt = now + attackDelayMs(rng);
  return save.nextAttackAt;
}

/** isRookable: not an instance/POL/home/game, and the street has a shrine. */
export function streetIsRookable({ hasShrine = false, instance = false, home = false } = {}) {
  return Boolean(hasShrine) && !instance && !home;
}

// ---------------------------------------------------------------------------
// The attack state machine
// ---------------------------------------------------------------------------

const PHASES = new Set(['herald', 'build_up', 'angry', 'stunned', 'dead', 'departed']);
const TIMER_KEYS = ['heraldWarnAt', 'attackAt', 'angry2At', 'angry3At', 'wingBeatAt', 'recoveryAt', 'clearAt'];

function normalizeAttack(a) {
  const out = {
    tsid: String(a.tsid),
    phase: PHASES.has(a.phase) ? a.phase : 'build_up',
    startedAt: num(a.startedAt),
    health: Math.max(0, Math.floor(num(a.health, ROOK_SOURCE.defaultHealth))),
    maxHealth: Math.max(1, Math.floor(num(a.maxHealth, ROOK_SOURCE.defaultHealth))),
    stun: Math.max(0, Math.floor(num(a.stun))),
    maxStun: Math.max(1, Math.floor(num(a.maxStun, ROOK_SOURCE.maxStun))),
    angryState: typeof a.angryState === 'string' ? a.angryState : '',
    angryStart: num(a.angryStart),
    stunFailures: Math.max(0, Math.floor(num(a.stunFailures))),
    wingBeats: Math.max(0, Math.floor(num(a.wingBeats))),
    damageDealt: Math.max(0, Math.floor(num(a.damageDealt))),
    stunsLanded: Math.max(0, Math.floor(num(a.stunsLanded))),
    heraldWarnings: Math.max(0, Math.floor(num(a.heraldWarnings))),
    firstAttemptAt: num(a.firstAttemptAt),
  };
  for (const key of TIMER_KEYS) out[key] = a[key] == null ? null : num(a[key], null);
  return out;
}

export function createRookAttack({ tsid, now, health = ROOK_SOURCE.defaultHealth, heraldMs = ROOK_SOLO.heraldMs } = {}) {
  const herald = heraldMs > 0;
  return normalizeAttack({
    tsid,
    phase: herald ? 'herald' : 'build_up',
    startedAt: now,
    health,
    maxHealth: health,
    heraldWarnAt: herald ? now : null,
    attackAt: herald ? now + heraldMs : null,
    wingBeatAt: herald ? null : now + ROOK_SOURCE.wingBeatS * 1000,
  });
}

/** startAttack: the herald ends, the Rook arrives in build_up. */
function beginBuildUp(a, at) {
  a.phase = 'build_up';
  a.attackAt = null;
  a.heraldWarnAt = null;
  a.health = a.maxHealth;
  a.stun = 0;
  a.wingBeatAt = at + ROOK_SOURCE.wingBeatS * 1000;
}

function scheduleWingBeat(a, at, delayS) {
  const next = at + delayS * 1000;
  if (a.wingBeatAt == null || next < a.wingBeatAt) a.wingBeatAt = next;
}

function doAngry(a, at) {
  a.phase = 'angry';
  a.angryState = 'angry1';
  a.angryStart = at;
  scheduleWingBeat(a, at, ROOK_SOURCE.angryWingBeatS);
  a.angry2At = at + ROOK_SOURCE.angry2AfterS * 1000;
  a.angry3At = null;
}

function doStunned(a, at) {
  a.phase = 'stunned';
  a.stun = a.maxStun;
  a.angryState = '';
  a.wingBeatAt = null;
  a.angry2At = null;
  a.angry3At = null;
  a.recoveryAt = at + ROOK_SOURCE.stunRecoveryS * 1000;
}

/** Can a stun attack start now (locations/inc_rook.js canStun)? */
export function canStun(a) {
  return Boolean(a) && (a.phase === 'build_up' || a.phase === 'angry');
}

/** Is the Rook open to shrine strikes (canAttack)? */
export function canStrike(a) {
  return Boolean(a) && a.phase === 'stunned' && a.health > 0;
}

/** Is the Rook over the street (any phase after the herald, before it leaves)? */
export function rookPresent(a) {
  return Boolean(a) && ['build_up', 'angry', 'stunned', 'dead'].includes(a.phase);
}

/**
 * Advance every due timer in time order; returns the events that fired.
 * Events: herald_warning, attack_start, angry2, angry3, wing_beat, depart,
 * stun_recovery, clear.
 */
export function stepRookAttack(a, now) {
  const events = [];
  if (!a) return events;
  for (let guard = 0; guard < 64; guard += 1) {
    let key = null;
    let at = Infinity;
    for (const k of TIMER_KEYS) {
      if (a[k] != null && a[k] <= now && a[k] < at) {
        key = k;
        at = a[k];
      }
    }
    if (!key) break;
    a[key] = null;
    if (key === 'heraldWarnAt') {
      if (a.phase !== 'herald') continue;
      a.heraldWarnings += 1;
      events.push({ type: 'herald_warning', at, n: a.heraldWarnings });
      const next = at + ROOK_SOLO.heraldWarnEveryMs;
      if (a.attackAt != null && next < a.attackAt) a.heraldWarnAt = next;
    } else if (key === 'attackAt') {
      beginBuildUp(a, at);
      events.push({ type: 'attack_start', at });
    } else if (key === 'angry2At') {
      if (a.phase !== 'angry' || a.angryState !== 'angry1') continue;
      a.angryState = 'angry2';
      a.angry3At = at + ROOK_SOURCE.angry3AfterS * 1000;
      events.push({ type: 'angry2', at });
    } else if (key === 'angry3At') {
      if (a.phase !== 'angry' || a.angryState !== 'angry2') continue;
      a.angryState = 'angry3';
      events.push({ type: 'angry3', at });
    } else if (key === 'wingBeatAt') {
      if (!(a.phase === 'build_up' || a.phase === 'angry')) continue;
      a.wingBeats += 1;
      a.stun = 0;
      a.stunFailures = 0;
      a.phase = 'build_up';
      a.angryState = '';
      a.angry2At = null;
      a.angry3At = null;
      events.push({ type: 'wing_beat', at, n: a.wingBeats });
      if (a.wingBeats >= ROOK_SOLO.maxWingBeats) {
        a.phase = 'departed';
        a.wingBeatAt = null;
        a.clearAt = at + ROOK_SOLO.departMs;
        events.push({ type: 'depart', at });
      } else {
        a.wingBeatAt = at + ROOK_SOURCE.wingBeatS * 1000;
      }
    } else if (key === 'recoveryAt') {
      if (a.phase !== 'stunned') continue;
      a.phase = 'build_up';
      a.stun = 0;
      a.wingBeatAt = at + ROOK_SOURCE.wingBeatS * 1000;
      events.push({ type: 'stun_recovery', at });
    } else if (key === 'clearAt') {
      events.push({ type: 'clear', at, defeated: a.phase === 'dead' });
      a.phase = a.phase === 'dead' ? 'dead' : 'departed';
      a.cleared = true;
      break;
    }
  }
  return events;
}

/**
 * Resolve one Focusing Orb release with `joiners` helpers (doOrbAttack +
 * completeStun). Mutates the attack; returns what to show and pay.
 */
export function resolveStun(a, joiners, now, label = 'Ur') {
  if (!canStun(a)) return { ok: false, reason: ROOK_TEXT.stunWait };
  const firstAttempt = a.phase === 'build_up';
  const table = stunTableFor(joiners);
  if (table.failed && !table.broke) {
    // A lone orb never reaches doStun: no anger, no failure count.
    return { ok: true, failed: true, firstAttempt, damage: 0, xp: ROOK_SOURCE.failXp, text: stunFeedText(label, 0, 0, a.stun, a.maxStun) };
  }
  let damage = table.damage;
  a.stun += damage;
  let stunned = false;
  if (a.stun >= a.maxStun) {
    damage -= a.stun - a.maxStun;
    doStunned(a, now);
    stunned = true;
  } else if (a.phase !== 'angry') {
    doAngry(a, now);
  }
  if (!a.firstAttemptAt) a.firstAttemptAt = now;
  if (damage === 0) {
    a.stunFailures += 1;
    if (a.stunFailures >= ROOK_SOURCE.maxStunFailures) scheduleWingBeat(a, now, 1);
  } else {
    a.stunsLanded += 1;
  }
  return {
    ok: true,
    failed: damage === 0,
    broke: table.broke,
    firstAttempt,
    stunned,
    damage,
    xp: damage > 0 ? table.xp : ROOK_SOURCE.failXp,
    assistXp: damage > 0 ? ROOK_SOURCE.stunAssistXp : 0,
    text: stunFeedText(label, table.joiners, damage, Math.min(a.stun, a.maxStun), a.maxStun),
  };
}

/** Shrine strike damage (launchAttack) with the solo crowd multiplier and floor. */
export function strikeDamageFor({ baseCost = 0, count = 1, emblem = false, solo = true, primeBonus = 0 } = {}) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  let source = Math.floor(emblem ? ROOK_SOURCE.strikeEmblem * n : Math.max(0, Number(baseCost) || 0) * n * ROOK_SOURCE.strikeBaseCostRate);
  // shrines.js launchAttack 1040-1046: Shrine On I / II, the priming player's
  // card, add round(25% / 50%) of the damage.
  if (source > 0 && primeBonus > 0) source += Math.round(source * primeBonus);
  if (!solo) return source;
  return Math.max(ROOK_SOLO.strikeFloor, source * ROOK_SOLO.strikeCrowd);
}

/** Shrine laser size (shrine_laser_beam_1/2/3). */
export function strikeBeamFor(damage, emblem = false) {
  if (emblem) return 3;
  return damage >= 100 ? 2 : 1;
}

/** completeAttack: apply capped damage; the Rook dies at 0 and clears 15 s later. */
export function applyStrike(a, damage, now, label = 'Ur') {
  if (!canStrike(a)) return { ok: false, reason: ROOK_TEXT.strikeNeedsPrime };
  const dealt = Math.max(0, Math.min(Math.floor(damage), a.health));
  a.health -= dealt;
  a.damageDealt += dealt;
  const dead = a.health <= 0;
  if (dead) {
    a.health = 0;
    a.phase = 'dead';
    a.recoveryAt = null;
    a.clearAt = now + ROOK_SOURCE.clearAfterDeathS * 1000;
  }
  return { ok: true, damage: dealt, dead, text: damageFeedText(label, dealt, a.health) };
}

/** iMG at defeat (rookStateChange 'dead'). */
export function defeatXpFor(a) {
  const dealt = Math.max(0, Math.floor(a?.damageDealt || 0));
  return dealt > 0 ? dealt * ROOK_SOURCE.defeatDamageMultiplier + ROOK_SOURCE.defeatBaseXp : ROOK_SOURCE.witnessXp;
}

/** Seconds left on the visible pressure clock (angry: until the wing beat; stunned: recovery). */
export function rookClockS(a, now) {
  if (!a) return 0;
  const until = a.phase === 'stunned' ? a.recoveryAt : a.phase === 'herald' ? a.attackAt : a.wingBeatAt;
  return until == null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

// ---------------------------------------------------------------------------
// Rooked things on a street
// ---------------------------------------------------------------------------

export function normalizeRookedSlot(slot = {}) {
  const out = { rooked: {}, pendingBeats: Math.max(0, Math.floor(num(slot?.pendingBeats))) };
  for (const [key, row] of Object.entries(slot?.rooked || {})) {
    if (!row || typeof row !== 'object' || !isRookableClass(row.classId)) continue;
    out.rooked[key] = {
      classId: row.classId,
      doses: Math.max(0, Math.min(ROOK_SOURCE.reviveHealers - 1, Math.floor(num(row.doses)))),
      at: num(row.at),
    };
  }
  return out;
}

/** One wing beat over the street: each un-rooked target has the source 50% chance. */
export function rollWingBeat(slot, targets, now, rng = Math.random, chance = ROOK_SOURCE.rookChance) {
  const hit = [];
  for (const t of targets) {
    if (!t?.key || !isRookableClass(t.classId) || slot.rooked[t.key]) continue;
    if (rng() < chance) {
      slot.rooked[t.key] = { classId: t.classId, doses: 0, at: now };
      hit.push(t.key);
    }
  }
  return hit;
}

export function forceRook(slot, target, now) {
  if (!target?.key || !isRookableClass(target.classId)) return false;
  if (!slot.rooked[target.key]) slot.rooked[target.key] = { classId: target.classId, doses: 0, at: now };
  return true;
}

/**
 * One revive dose (doReviveComplete). Solo: the same player may give all three.
 * Returns the response pool key and whether the target is now unrooked.
 */
export function applyReviveDose(slot, key, { balm = false } = {}) {
  const row = slot.rooked[key];
  if (!row) return { ok: false };
  let xp = ROOK_SOURCE.reviveXp + (balm ? ROOK_SOURCE.balmBonusXp : 0);
  const doses = row.doses + 1;
  const done = balm || doses >= ROOK_SOURCE.reviveHealers;
  if (done) {
    delete slot.rooked[key];
    xp += ROOK_SOURCE.reviveFinalBonusXp;
    return { ok: true, done: true, doses: ROOK_SOURCE.reviveHealers, xp, favor: ROOK_SOURCE.reviveFinalFavor, response: 'revived_3rd_time' };
  }
  row.doses = doses;
  return { ok: true, done: false, doses, xp, favor: 0, response: doses === 1 ? 'revived_1st_time' : 'revived_2nd_time' };
}

/** items/include/trants.js onRooked: fruit gone, health -2 (solo: never below 1). */
export function rookTrantState(state) {
  if (!state || typeof state !== 'object') return state;
  if ('fruitCount' in state) state.fruitCount = 0;
  if (Number.isFinite(state.health)) {
    const loss = state.health === 2 ? 1 : ROOK_SOURCE.trantHealthLoss;
    state.health = Math.max(1, state.health - loss);
  }
  return state;
}

/** A response line for a rookable class, `{pc_label}` filled with the player's name. */
export function rookResponse(classId, pool, rng = Math.random, label = 'Ur') {
  const lines = ROOK_RESPONSES[classId]?.[pool];
  if (!lines?.length) return '';
  const line = lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))];
  return line
    .replace(/\{pc_label\}/g, label)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/**
 * Orb joiners in arrival order: nearest un-rooked rookables first, the shrine
 * (solo) last. `candidates` = [{ key, x, rooked }]; returns keys.
 */
export function orbJoinOrder(candidates, originX, { shrineKey = '' } = {}) {
  const list = candidates
    .filter((c) => c && c.key && !c.rooked && Number.isFinite(c.x))
    .sort((a, b) => Math.abs(a.x - originX) - Math.abs(b.x - originX))
    .map((c) => c.key);
  if (shrineKey && ROOK_SOLO.shrineJoins) list.push(shrineKey);
  return list.slice(0, ROOK_SOLO.maxJoiners);
}

/** Balm points: a tube holds 5 pours; the next tube loads when one empties. */
export function useBalmPoint(save, balmCount) {
  if (save.balmPoints <= 0) {
    if (balmCount <= 0) return { ok: false, consumeItem: false };
    save.balmPoints = ROOK_SOURCE.balmPoints;
  }
  save.balmPoints -= 1;
  const consumeItem = save.balmPoints <= 0;
  return { ok: true, consumeItem, remaining: save.balmPoints };
}

export const ROOK_RESPONSES = Object.freeze({
  trant_fruit: Object.freeze({
    rooked: Object.freeze([
      "ARGH!",
      "ROOKED!",
      "THE ROOK! AAAIIIIIIIII!!!",
      "HELP!",
      "PAIN! IN PAIN! HELP!",
    ]),
    revived_1st_time: Object.freeze([
      "Ah. But more? Please? Ow.",
      "Twice more?",
      "Help more?",
      "Someone else? Help?",
    ]),
    revived_2nd_time: Object.freeze([
      "Almost.",
      "Once more?",
      "Nearly unrooked.",
    ]),
    revived_3rd_time: Object.freeze([
      "Yay, {pc_label}!",
      "Ta, {pc_label}!",
      "{pc_label}! MWAH!",
    ]),
  }),
  trant_egg: Object.freeze({
    rooked: Object.freeze([
      "O! I am blighted by yonder rook! Help me! HELP!",
      "Death! It comes on mighty wings! Only you can help!",
      "Aid me, little one! I fear my life is… Irk! Help!",
      "Rooked! I've been… urrrrrgh… the… pain. In my EGGS!",
      "Eggs, scrambled! Rotting! The rook! Help me! Revive me!",
    ]),
    revived_1st_time: Object.freeze([
      "Blighted yet still! I need two more glitchling revivals! Two more!",
      "Be kind but once more? Or, actually twice? Or get a friend to?",
      "Sorry to be a pain, but I'm still dying. Please. Send help. More help.",
      "Still the pain sears my eggy veins! Revive more, apace!",
    ]),
    revived_2nd_time: Object.freeze([
      "Almost… revived. Just one more dose? From someone?",
      "So close to eggy perfection! A single dose of revivalry more?",
      "I feel myself almost revived! Aid me but once more!",
    ]),
    revived_3rd_time: Object.freeze([
      "I am indebted to you, {pc_label}. Revived! All is felicitous!",
      "A glorious, propitious happenstance! Saved from the rook by {pc_label}!",
    ]),
  }),
  trant_bean: Object.freeze({
    rooked: Object.freeze([
      "The rook! It's sapping my life! Arrrrrrgh!!!!",
      "There's a shooting pain in my roots! Revive me!",
      "I've bean rooked! Ha ha - no, seriously, I'm dying. HELP.",
      "Bean… rooked… Life… sapping… away… Help… Help…",
      "I be…leaf… the rook… got me. Dying. Help me…",
    ]),
    revived_1st_time: Object.freeze([
      "Trunk you. Marginally better. I still need more though.",
      "Ah in touch with my roots once more. But please. More reviving.",
      "Still the rook blights me. Another dose of reviving? Anyone?",
      "Still sapped by the rookness. One revival more? Well, two?",
    ]),
    revived_2nd_time: Object.freeze([
      "I've bean better. Ha ha. No, really, can you make me better, still?",
      "Better. Almost completely. Once more will unrook me.",
      "My roots are tingling. One more reviving dose should do it.",
    ]),
    revived_3rd_time: Object.freeze([
      "I am unrooked!!! Trunks be to {pc_label}!",
      "{pc_label} rooted for me (ha!), and now I am unrooked!!",
      "Thanks to {pc_label}, my sap is rising once more.",
    ]),
  }),
  trant_bubble: Object.freeze({
    rooked: Object.freeze([
      "The rook! Pop! Pop POP! Fizzling! In my brainbubbles! Make it stop!",
      "ROOKED! The rook! The rook! Shut down operations! SAVE ME!",
      "Just like I said! Like I said! End times! Rook is come! THE ROOK!",
      "Fizzing! Fizzing in my bubbles! Explodifying! Save me! I can help!",
      "First comes the rook! Then the rest! Argh! The pain! Help! Pop POP!",
    ]),
    revived_1st_time: Object.freeze([
      "What? Where am I? Get away! THE ROO… oh, it's you. Need more.",
      "Still… the fizzing… more reviving. From someone TRUSTWORTHY.",
      "Explosions in brain. Rook got in. Get it out with more reviving. OUT!",
    ]),
    revived_2nd_time: Object.freeze([
      "The flapping is fading. Explosions are dying. Just a little more help?",
      "Noise. In brain. Fading. Once more? If I can trust you?",
      "Shhh. Yes. I hear that? Almost? One more revival? Then. Then…",
    ]),
    revived_3rd_time: Object.freeze([
      "Yes. Good comrade {pc_label} - enemy of the rook. I recognise you.",
      "{pc_label}! My thanks. Perhaps you are not one of them after all.",
      "You have come good, {pc_label}. The rook has not won. This time.",
    ]),
  }),
  trant_spice: Object.freeze({
    rooked: Object.freeze([
      "The rook! THE ROOK, I SAY! Help! For the love of Spriggan!",
      "I've been rooked! ME! Don't they know who I… ARRRGH! Help!",
      "My precious! Thank Spriggan you're here! Save me! SAVE M…",
      "Oh, I hoped you'd come! The rook! I've been rook! QUICK!",
      "ARGH! My precious spices! Turning to dust! Leaves! Quaking! HELP!",
    ]),
    revived_1st_time: Object.freeze([
      "Oh, that's … well, only a little better actually. Please. More?",
      "Perhaps if you had a friend? A little extra help they could tender?",
      "Argh, spices, fading. Essence, draining. More help? Yes?",
      "Be kind to old spicy. Revive me more. Twice more?",
    ]),
    revived_2nd_time: Object.freeze([
      "Almost there, little precious. Just a gentle reviving touch more…",
      "Once more with the healing touch of revival. Someone? Anyone?",
      "I need just one little nudge more, and I will be fully revived.",
    ]),
    revived_3rd_time: Object.freeze([
      "Yes {pc_label}! This is why you have ALWAYS been my favorite.",
      "Derooked by such a winsome little glitch, {pc_label}? You spoil me.",
      "Back to my magnificent spicy self, {pc_label}! And all thanks to you.",
    ]),
  }),
  trant_gas: Object.freeze({
    rooked: Object.freeze([
      "NOT GOOD, man! This is some bad, bad rooking! Help me!",
      "ARGH! The ROOK! It's all up in my gassy brain! Get it OUT, man!",
      "Gas! Putrefying! The rook, man! He's POISONING me!",
      "Wing beats! Crazy eyes! The rook, man, THE ROOK! Save me!",
      "Get this rook outta my head, brother?! This is a bad, bad tr… HELP!",
    ]),
    revived_1st_time: Object.freeze([
      "Yes. Seriously, friend, I need more assistance though. Two times.",
      "Good. Better. But keep it coming. Bring help.",
      "Twice more, I'll be revived. Yes. Good to know you got friends, man.",
    ]),
    revived_2nd_time: Object.freeze([
      "Just a little bit more, and I'll be sailing away on my gas-cloud, man.",
      "One more little hand up, friend. That's all I need.",
      "Almost back to normality friend. Wherever that is. Almost there.",
    ]),
    revived_3rd_time: Object.freeze([
      "You know what, {pc_label}? You did something good today.",
      "Yes! {pc_label} revived me. I can see straight, man! Well, ish…",
      "WOAH, {pc_label}! You made an old gassy tree very unrooky, dude.",
    ]),
  }),
  wood_tree: Object.freeze({
    rooked: Object.freeze([
      "Rooked! Can't… stand… going… floppy…",
      "Argh! Rooked! Help! Losing rigidity! This has never happened before!",
      "Please! Help me! Help! Can't… stand… proud… much… longarrrghhhh",
      "Help! I've been ROOK! Life being sucked from the roots. Can't… go…",
      "Wood! Drooping! Trunk! Flopping! Dignity! Gone! Rook! Killing! HELP!",
    ]),
    revived_1st_time: Object.freeze([
      "Still… so weak… just… please… more? A little? More?",
      "Need… firming… up… still…Help? More? Twice more?…",
      "Rigidity… all gone… need more help… Someone? Anyone?",
    ]),
    revived_2nd_time: Object.freeze([
      "Almost back to full wood. Just one more stroke of revival… please?",
      "Nearly there. Nearly. One more tiny hand to revive me?",
      "A little touch more will revive me? Could you? Wood? You?",
    ]),
    revived_3rd_time: Object.freeze([
      "BEHOLD! Thanks to {pc_label}, wood has been restored!",
      "Thanks to you, {pc_label} - true saviour of the wood.",
      "Firm, upstanding, strong, proud. And that's just you, {pc_label}!",
    ]),
  }),
  npc_piggy: Object.freeze({
    rooked: Object.freeze([
      "Oooh. Dude, this sucks. Someone help me! Like, seriously!",
      "Gnarly Rook action! Achy hooves, tender loins! Help.",
      "Oh man, this Rook thing is totally bogus.",
      "Bro', my tiny shanks are porked. Do something, dude!",
      "Seriously bummed out, dude. Been rooked. Help.",
    ]),
    revived_1st_time: Object.freeze([
      "Ah, that's, like, marginally better. Need more though.",
      "Woah. Little perkier. But I need more reviving, dude. More.",
      "Rook. Too strong. Need more reviving. Someone else too, maybe?",
      "Danke, dude. Still far from awesome, though. Try a powder?",
      "Good, but gonna need that, but, like, three times over, man.",
    ]),
    revived_2nd_time: Object.freeze([
      "MAN that's better. But not quite there. Just a little more, dude?",
      "Totally shaking off that rook. But still shaky. Little more help?",
      "I am returning to piggy-awesomeness. One more little revive?",
    ]),
    revived_3rd_time: Object.freeze([
      "YAY! Like, totally revived from my gnarly rooking, thanks to {pc_label}.",
      "Zoink! {pc_label} saved the day! I am now totally unrookified, man!",
      "You're the GLITCH, {pc_label}! I'm totally revived. Party on!",
    ]),
  }),
  npc_chicken: Object.freeze({
    rooked: Object.freeze([
      "I told you! I told you this would happen. I've been rooked. HELP!!!",
      "Don't just stand there! Help why don't you?! I'm ROOKED here!",
      "ROOKED!!! FOR THE LOVE OF THE GIANT DO SOMETHING!",
      "My gizzards are falling out! HELP! Revive me!",
      "My wings! So hot! So crispy! HELP ME!",
    ]),
    revived_1st_time: Object.freeze([
      "A little better but still it hurts! Please? Anyone else who can help?",
      "Oy oy oy. Still, the pain it comes. More reviving?",
      "A little revived, but if you could spare a little more? Maybe? Anyone?",
      "I ask you: all those eggs we've incubated? You can't help a little more?",
    ]),
    revived_2nd_time: Object.freeze([
      "Getting there, but just a little more help for a loyal chicken?",
      "That's it? You're  done? You can't maybe just revive me a little more?",
      "Oh, the pain in my poor beak, it still remains. A little more help?",
    ]),
    revived_3rd_time: Object.freeze([
      "Thanks be to {pc_label} for reviving me. It's about time.",
      "You're a good Glitch, {pc_label}. You give them all a good name.",
      "The chickens thank you, {pc_label}. You, we like.",
    ]),
  }),
  npc_butterfly: Object.freeze({
    rooked: Object.freeze([
      "Noooooo. I h8 teh rux!!!!!1!! Revive meeeeeee!",
      "Pls halp. Pls. Need revives! Pls!!!",
      "OMG ROOK. PLS HALP.",
      "OMGiant teh RUX! It HURTZ. Pls. Pls halp.",
      "Hurty hurty hurty hurty rux. Pls make bettr?",
    ]),
    revived_1st_time: Object.freeze([
      "Thnx! Am still hurty. More revives? And more-more?",
      "Eugh. Bettr? But not? Pls halp more?",
      "Teh rux 2 hurtee 4 me. Pls 2 revive moar?",
      "I is +good. But not ++good. More reviving, pls?",
      "2x moar revives? Pls? So sicky. Stupid rux.",
    ]),
    revived_2nd_time: Object.freeze([
      "i <3 u. U mades me almost bettr. 1 more times?",
      "I h8 rux. I still hurtz. Moar?",
      "OMG. I &lt;3 ur revinin. Pls do again? Someone? Pls?",
    ]),
    revived_3rd_time: Object.freeze([
      "YAYZ!!!!!1!!! {pc_label} SAVED ME FROM TEH RUX! LOL!",
      "OMGiant I &lt;3 u {pc_label}!!!!!! Thnx!",
      "UR teh AWESUM! Thnx {pc_label}. I r unruxed! ROFL!",
    ]),
  }),
  npc_kitty_chicken: Object.freeze({
    rooked: Object.freeze([
      "Ouch! My tail! HELP ME!",
      "I've been rooked. What's the opposite of purring?",
      "HISS! Scratch! Nasty rook!",
      "Please help me.",
    ]),
    revived_1st_time: Object.freeze([
      "A little better but still it hurts! Please? Anyone else who can help?",
      "Oy oy oy. Still, the pain it comes. More reviving?",
      "A little revived, but if you could spare a little more? Maybe? Anyone?",
      "I ask you: all those eggs we've incubated? You can't help a little more?",
    ]),
    revived_2nd_time: Object.freeze([
      "Getting there, but just a little more help for a loyal chicken?",
      "That's it? You're  done? You can't maybe just revive me a little more?",
      "Oh, the pain in my poor beak, it still remains. A little more help?",
    ]),
    revived_3rd_time: Object.freeze([
      "Thanks be to {pc_label} for reviving me. It's about time.",
      "You're a good Glitch, {pc_label}. You give them all a good name.",
      "The chickens thank you, {pc_label}. You, we like.",
    ]),
  }),
});
