/**
 * Meditation with the Focusing Orb: pure rules, no Pixi or DOM.
 *
 * Source (GSJS, CC0):
 * - items/focusing_orb.js: verbs meditate / focus_energy / focus_mood /
 *   levitate / radiate, start*Meditation, end*Meditation, getTankMultiplier,
 *   getSkillMultiplier, onTick chatter, cooldown formulas.
 * - items/catalog_skill_packages.js: meditative_arts, focused_meditation,
 *   levitation, transcendental_radiation.
 * - players/inc_skill_packages.js runSkillPackage: a session lasts
 *   randInt(duration/1000, duration_max/1000) seconds.
 * - players/player.js: any action other than the meditation verbs interrupts
 *   (moving cancels); get_meditation_bonus() daily limit = 1 x max energy.
 * - players/inc_stats.js stats_add_meditation_today: reaching the daily top
 *   applies the `zen` buff until the next game day (no more meditation energy).
 * - items/catalog_buffs.js: meditation_cooldown, levitation_by_meditation
 *   (5 s, jetpack, gravity 0.85; on removal a 20 s meditation_cooldown), zen.
 *
 * Source gap: the exported GSJS never calls stats_add_meditation_today (the
 * engine side that fed it is missing), so the remake counts the energy each
 * meditation actually adds against the documented daily top.
 */

export const ORB_CLASS = 'focusing_orb';

export const ORB_ITEM = Object.freeze({
  classTsid: ORB_CLASS,
  label: 'Focusing Orb',
  desc: 'An iridescent focusing orb. It calms your swirly thoughts, helps you meditate, levitate and fight the enemies of the imagination.',
  baseCost: 1200,
  stackMax: 1,
  isTool: true,
});

/** Overlay art: 640x80 sheet, 16x2 cells of 40x40, 31 populated frames. */
export const ORB_TOOL_SHEET = Object.freeze({
  url: 'assets/sprites/meditation/focusing_orb-tool.png',
  frameW: 40,
  frameH: 40,
  cols: 16,
  frames: 31,
  // pc_overlay for the meditating player: 80x80, delta_y -8.
  displaySize: 80,
  deltaY: -8,
});

/** items/catalog_skill_packages.js, keyed by the highest owned rank. */
export const MEDITATIVE_ARTS_PACKAGE = Object.freeze({
  meditativearts_1: { rank: 1, duration: 4000, durationMax: 16000, moodBonus: 1, bonusAmount: 4 },
  meditativearts_2: { rank: 2, duration: 8000, durationMax: 20000, moodBonus: 1, bonusAmount: 7 },
  meditativearts_3: { rank: 3, duration: 10000, durationMax: 30000, moodBonus: 2, bonusAmount: 10 },
});

/** focused_meditation package; also keyed by Meditative Arts rank in the source. */
export const FOCUSED_MEDITATION_PACKAGE = Object.freeze({
  meditativearts_1: { rank: 1, duration: 2000, durationMax: 11000, bonusAmount: 4 },
  meditativearts_2: { rank: 2, duration: 5000, durationMax: 17000, bonusAmount: 7 },
  meditativearts_3: { rank: 3, duration: 8000, durationMax: 25000, bonusAmount: 10 },
});

export const LEVITATION_PACKAGE = Object.freeze({
  skill: 'levitation_1',
  durationMs: 5000,
  energyCost: 20,
  // conditions: energy must exceed 20 + round(max_energy * 0.008)
  minEnergyBase: 20,
  minEnergyTankFraction: 0.008,
  // levitation_by_meditation physics (without the levitation_physics upgrade)
  physics: { jetpack: true, gravity: 0.85 },
  cooldownAfterSeconds: 20,
});

export const TRANSCENDENTAL_RADIATION_PACKAGE = Object.freeze({
  transcendental_radiation_1: { rank: 1, duration: 6000, durationMax: 18000, bonusAmount: 6 },
  transcendental_radiation_2: { rank: 2, duration: 9000, durationMax: 21000, bonusAmount: 10 },
  transcendental_radiation_3: { rank: 3, duration: 12000, durationMax: 30000, bonusAmount: 15 },
});

export const MEDITATION_SKILLS = Object.freeze({
  meditate: 'meditativearts_1',
  focus: 'focused_meditation_1',
  levitate: 'levitation_1',
  radiate: 'transcendental_radiation_1',
});

/** Street TSIDs (L production + G archived alias) where wintry_place_meditation counts. */
export const WINTRY_PLACE_TSIDS = Object.freeze([
  'LM413ATO8PR54',
  'LLI11ITO8SBS6',
  'LM11E7ODKHO1QJE',
  'GM413ATO8PR54',
  'GLI11ITO8SBS6',
  'GM11E7ODKHO1QJE',
]);

/**
 * The meditation music_map keys (inc_data_sounds.js:131-134) by title:
 * Round_Two_in_Seven_2 is the archive.org ringtone of the same name, and
 * meditation_korg / meditation_wurly are the downloads page's Korg and Wurly
 * variations. meditation_ac15 is lost; the AC30 variation stands in.
 */
export const MEDITATION_MUSIC = Object.freeze({
  MEDITATIVE_ARTS_01: 'assets/audio/sfx/MEDITATIVE_ARTS_01.mp3',
  MEDITATIVE_ARTS_02: 'assets/audio/ambient/meditation1_1344997850.mp3',
  FOCUSED_MEDITATION_ENERGY: 'assets/audio/ambient/meditation2_1344997844.mp3',
  FOCUSED_MEDITATION_MOOD: 'assets/audio/ambient/meditation3_1344997842.mp3',
});

export const MEDITATION_TEXT = Object.freeze({
  start: ['Ah ... meditation.', 'R-e-l-a-x-i-n-g.'],
  tick2: ['Ommmmmmmmm ...', 'Calm blue ocean.', 'You are feeling focused.'],
  tick5: ['The universe is a peaceful place.', 'I am safe.', 'This is beautiful.', 'Other people are not so strange.'],
  tick11: ['Ah. A thought. I gently label it: "thinking" and move on.', 'Good, good.', 'I feel the heart of the giants.'],
  end: ['Darn. Got distracted.', 'Whoops. There it goes.', 'Ah, lost it.'],
  failed: "Awww, that didn't work!",
  scattered: 'You are too scattered to meditate right now.',
  scatteredLevitate: 'You are too scattered to levitate right now.',
  scatteredRadiate: 'You are too scattered to radiate right now.',
  needSkill: 'You need to know Meditative Arts to use this.',
  zen: 'You have achieved zen and cannot gain any more energy today.',
  levitateUnfair: "I'd say, doing that would give you an unfair advantage.",
  levitateEnergy: 'You need more energy to do this.',
  radiateAlone: "There's nobody near enough for you to radiate.",
  zenReached: 'You have achieved zen. Meditation will not restore any more energy today.',
});

const DEFAULT_TANK = 100;

function pick(list, rng = Math.random) {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/** GSJS randInt(min, max): inclusive integer. */
export function randInt(min, max, rng = Math.random) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return lo + Math.min(hi - lo, Math.floor(rng() * (hi - lo + 1)));
}

function has(learned, id) {
  return Array.isArray(learned) && learned.includes(id);
}

/** Highest Meditative Arts rank (0 when unlearned). */
export function meditativeArtsRank(learned = []) {
  if (has(learned, 'meditativearts_3')) return 3;
  if (has(learned, 'meditativearts_2')) return 2;
  if (has(learned, 'meditativearts_1')) return 1;
  return 0;
}

function packageFor(table, learned) {
  const rank = meditativeArtsRank(learned);
  return rank ? table[`meditativearts_${rank}`] : null;
}

/** focusing_orb.getSkillMultiplier */
export function skillMultiplier(learned = []) {
  const rank = meditativeArtsRank(learned);
  return rank === 3 ? 1.5 : rank === 2 ? 1.25 : 1.0;
}

/** focusing_orb.getTankMultiplier piecewise table: [min, max, minMult, maxMult]. */
export const TANK_MULTIPLIER_BANDS = Object.freeze([
  [100, 200, 0.75, 0.6],
  [200, 300, 0.6, 0.52],
  [300, 400, 0.52, 0.48],
  [400, 500, 0.48, 0.44],
  [500, 750, 0.44, 0.4],
  [750, 1000, 0.4, 0.36],
  [1000, 1250, 0.36, 0.33],
  [1250, 1500, 0.33, 0.3],
  [1500, 1750, 0.3, 0.27],
  [1750, 2000, 0.27, 0.24],
  [2000, 2500, 0.24, 0.21],
  [2500, 3000, 0.21, 0.18],
  [3000, 4000, 0.18, 0.16],
  [4000, 5000, 0.16, 0.14],
  [5000, 6000, 0.14, 0.13],
  [6000, 7000, 0.13, 0.12],
  [7000, 8000, 0.12, 0.11],
  [8000, 9000, 0.11, 0.1],
  [9000, 10000, 0.1, 0.09],
]);

export function tankMultiplier(tank = DEFAULT_TANK) {
  if (tank > 10000) return 0.09 / 100;
  let band = null;
  for (const row of TANK_MULTIPLIER_BANDS) {
    const [lo, hi] = row;
    if (lo === 100 ? tank >= lo && tank <= hi : tank > lo && tank <= hi) {
      band = row;
      break;
    }
  }
  // Below 100 the source falls through to its 1.0 -> 0.0 default band (100..10000).
  const [lo, hi, minM, maxM] = band || [100, 10000, 1.0, 0.0];
  const percent = (tank - lo) / (hi - lo);
  return (minM - percent * (minM - maxM)) / 100;
}

/** Energy/mood per second meditating (before the full-effect bonus). */
export function perSecondGain(kind, learned = [], tank = DEFAULT_TANK) {
  const skill = kind === 'focused' ? 2.0 : skillMultiplier(learned);
  return tankMultiplier(tank) * tank * skill;
}

export function standingCooldownSeconds(tank = DEFAULT_TANK) {
  return Math.max(20, tank / 50);
}

export function focusedCooldownSeconds(tank = DEFAULT_TANK) {
  return Math.max(30, tank / 40);
}

/** players/player.js get_meditation_bonus() x max energy (no upgrades in the remake). */
export function dailyEnergyLimit(tank = DEFAULT_TANK, upgrades = []) {
  const bonus = upgrades.includes('meditative_arts_daily_limit_2')
    ? 1.5
    : upgrades.includes('meditative_arts_daily_limit_1')
      ? 1.25
      : 1;
  return bonus * tank;
}

export function levitationMinEnergy(tank = DEFAULT_TANK) {
  return LEVITATION_PACKAGE.minEnergyBase + Math.round(tank * LEVITATION_PACKAGE.minEnergyTankFraction);
}

export function createMeditationState(seed = {}) {
  return normalizeMeditationState(seed);
}

export function normalizeMeditationState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  return {
    version: 1,
    cooldownUntil: num(s.cooldownUntil),
    dayKey: typeof s.dayKey === 'string' ? s.dayKey : '',
    energyToday: num(s.energyToday),
    totalSeconds: num(s.totalSeconds),
    sessions: Math.floor(num(s.sessions)),
    fullSessions: Math.floor(num(s.fullSessions)),
    levitations: Math.floor(num(s.levitations)),
    levitateUntil: num(s.levitateUntil),
  };
}

/** Roll the daily counters over at a new game day. */
export function rollMeditationDay(state, dayKey) {
  const s = normalizeMeditationState(state);
  if (dayKey && s.dayKey !== dayKey) {
    s.dayKey = dayKey;
    s.energyToday = 0;
  }
  return s;
}

export function hasZen(state, dayKey, tank = DEFAULT_TANK) {
  const s = normalizeMeditationState(state);
  if (dayKey && s.dayKey !== dayKey) return false;
  return s.energyToday >= dailyEnergyLimit(tank);
}

export function onCooldown(state, now = Date.now()) {
  return normalizeMeditationState(state).cooldownUntil > now;
}

export function isLevitating(state, now = Date.now()) {
  return normalizeMeditationState(state).levitateUntil > now;
}

/**
 * Orb verbs for the pack popover, in source sort order. `state:null` verbs are
 * hidden (the source returns {state:null}); disabled verbs carry the reason.
 * @param {object} state
 * @param {{ learned?: string[], now?: number, dayKey?: string, energy?: number,
 *   tank?: number, meditating?: boolean, unfairPlace?: boolean, nearbyPlayers?: number }} ctx
 */
export function listOrbVerbs(state, ctx = {}) {
  const s = normalizeMeditationState(state);
  const learned = ctx.learned || [];
  const now = ctx.now ?? Date.now();
  const tank = ctx.tank || DEFAULT_TANK;
  const cooling = s.cooldownUntil > now;
  const verbs = [];
  const push = (id, label, tooltip, enabled, reason = '') =>
    verbs.push({ id, label, tooltip, enabled, reason });

  if (has(learned, MEDITATION_SKILLS.levitate)) {
    let reason = '';
    if (ctx.unfairPlace) reason = MEDITATION_TEXT.levitateUnfair;
    else if (cooling || s.levitateUntil > now) reason = MEDITATION_TEXT.scatteredLevitate;
    else if ((ctx.energy ?? 0) <= levitationMinEnergy(tank)) reason = MEDITATION_TEXT.levitateEnergy;
    push('levitate', 'Imagine levitation',
      `Gives a short burst of levitation using spacebar. Costs ${LEVITATION_PACKAGE.energyCost} energy`,
      !reason, reason);
  }
  if (has(learned, MEDITATION_SKILLS.focus)) {
    let reason = '';
    if (hasZen(s, ctx.dayKey, tank)) reason = MEDITATION_TEXT.zen;
    else if (cooling) reason = MEDITATION_TEXT.scattered;
    push('focus_energy', 'Focus energy', 'Increase your energy', !reason, reason);
    push('focus_mood', 'Focus mood', 'Increase your mood', !cooling, cooling ? MEDITATION_TEXT.scattered : '');
  }
  if (has(learned, MEDITATION_SKILLS.radiate)) {
    let reason = '';
    if (cooling) reason = MEDITATION_TEXT.scatteredRadiate;
    else if (!(ctx.nearbyPlayers > 0)) reason = MEDITATION_TEXT.radiateAlone;
    push('radiate', 'Radiate', 'Help your neighbors', !reason, reason);
  }
  {
    let reason = '';
    if (!has(learned, MEDITATION_SKILLS.meditate)) reason = MEDITATION_TEXT.needSkill;
    else if (cooling) reason = MEDITATION_TEXT.scattered;
    push('meditate', 'Meditate', 'Focus on the orb', !reason, reason);
  }
  if (ctx.meditating) {
    for (const verb of verbs) {
      if (verb.enabled) {
        verb.enabled = false;
        verb.reason = 'You are already meditating.';
      }
    }
  }
  return verbs;
}

/**
 * Begin a standing (meditate) or focused (focus_energy / focus_mood) session.
 * @returns {{ ok: boolean, error?: string, session?: object, line?: string, music?: string }}
 */
export function startMeditation(state, verbId, ctx = {}) {
  const s = normalizeMeditationState(state);
  const learned = ctx.learned || [];
  const now = ctx.now ?? Date.now();
  const rng = ctx.rng || Math.random;
  const verb = listOrbVerbs(s, { ...ctx, now }).find((v) => v.id === verbId);
  if (!verb || !['meditate', 'focus_energy', 'focus_mood'].includes(verbId)) {
    return { ok: false, error: MEDITATION_TEXT.failed };
  }
  if (!verb.enabled) return { ok: false, error: verb.reason };
  const kind = verbId === 'meditate' ? 'standing' : 'focused';
  const pkg = packageFor(kind === 'standing' ? MEDITATIVE_ARTS_PACKAGE : FOCUSED_MEDITATION_PACKAGE, learned);
  if (!pkg) return { ok: false, error: MEDITATION_TEXT.failed };
  const durationMs = ctx.maxLuck
    ? pkg.durationMax
    : randInt(pkg.duration / 1000, pkg.durationMax / 1000, rng) * 1000;
  const focus = verbId === 'focus_mood' ? 'mood' : verbId === 'focus_energy' ? 'energy' : 'both';
  const music = kind === 'standing'
    ? (rng() < 0.5 ? MEDITATION_MUSIC.MEDITATIVE_ARTS_01 : MEDITATION_MUSIC.MEDITATIVE_ARTS_02)
    : focus === 'energy'
      ? MEDITATION_MUSIC.FOCUSED_MEDITATION_ENERGY
      : MEDITATION_MUSIC.FOCUSED_MEDITATION_MOOD;
  return {
    ok: true,
    session: {
      kind,
      focus,
      startedAt: now,
      durationMs,
      durationMaxMs: pkg.durationMax,
      bonusAmount: pkg.bonusAmount,
      ticks: 0,
    },
    line: pick(MEDITATION_TEXT.start, rng),
    music,
  };
}

/** onTick chatter for whole elapsed seconds; null when that second is quiet. */
export function meditationChatter(tick, rng = Math.random) {
  if (tick === 2) return pick(MEDITATION_TEXT.tick2, rng);
  if (tick === 5) return pick(MEDITATION_TEXT.tick5, rng);
  if (tick === 11) return pick(MEDITATION_TEXT.tick11, rng);
  return null;
}

/**
 * End a session (timer or interruption) and work out the rewards.
 * Mutates nothing: returns the next state plus effects for the caller.
 * @param {object} state
 * @param {object} session  from startMeditation
 * @param {{ now?: number, learned?: string[], tank?: number, dayKey?: string,
 *   streetTsid?: string, rng?: () => number, energy?: number, mood?: number,
 *   moodMax?: number }} ctx
 */
export function finishMeditation(state, session, ctx = {}) {
  let s = rollMeditationDay(state, ctx.dayKey);
  const now = ctx.now ?? Date.now();
  const tank = ctx.tank || DEFAULT_TANK;
  const learned = ctx.learned || [];
  const rng = ctx.rng || Math.random;
  const elapsed = Math.max(0, now - session.startedAt);
  const seconds = Math.ceil(elapsed / 1000);
  const actualMs = seconds * 1000;
  const full = session.durationMs <= actualMs;
  const maxRelax = session.durationMaxMs === actualMs;
  const zen = hasZen(s, ctx.dayKey, tank);

  let energy = 0;
  let mood = 0;
  let img = 0;
  const base = perSecondGain(session.kind, learned, tank) * seconds;
  if (session.kind === 'standing') {
    energy = base;
    mood = base;
    if (zen) energy = 0;
    if (full) {
      const bonus = (session.bonusAmount / 100) * energy;
      if (energy) energy += bonus;
      if (mood) mood += bonus;
      img += bonus;
    }
  } else {
    if (session.focus === 'energy') energy = base;
    else mood = base;
    if (full) {
      const moodBonus = (session.bonusAmount / 100) * mood;
      const energyBonus = (session.bonusAmount / 100) * energy;
      if (energy) {
        energy += energyBonus;
        img += energyBonus;
      }
      if (mood) {
        mood += moodBonus;
        img += moodBonus;
      }
    }
    if (zen) energy = 0;
  }

  // metabolics_add_* clamp to the tank; meditation energy also respects the daily top.
  const energyRoom = Math.max(0, tank - (ctx.energy ?? 0));
  const dailyRoom = Math.max(0, dailyEnergyLimit(tank) - s.energyToday);
  const energyGained = Math.min(Math.round(energy), energyRoom, Math.floor(dailyRoom));
  const moodGained = Math.min(Math.round(mood), Math.max(0, (ctx.moodMax || 100) - (ctx.mood ?? 0)));
  const imgGained = Math.round(img);

  const prevSeconds = s.totalSeconds;
  s = {
    ...s,
    energyToday: s.energyToday + energyGained,
    totalSeconds: s.totalSeconds + seconds,
    sessions: s.sessions + 1,
    fullSessions: s.fullSessions + (full ? 1 : 0),
    cooldownUntil:
      now + 1000 * (session.kind === 'standing' ? standingCooldownSeconds(tank) : focusedCooldownSeconds(tank)),
  };
  const reachedZen = !zen && hasZen(s, ctx.dayKey, tank);

  let message = `${pick(MEDITATION_TEXT.end, rng)} That was relaxing.`;
  if (session.kind === 'standing') {
    message += ` +${moodGained} mood, +${energyGained} energy, +${imgGained} iMG`;
  } else if (session.focus === 'energy') {
    message += ` +${energyGained} energy, +${imgGained} iMG`;
  } else {
    message += ` +${moodGained} mood, +${imgGained} iMG`;
  }

  // Quest counters / flags and the focusing_orb:meditation_time badge (minutes).
  const events = [];
  if (seconds > 0) events.push({ counter: 'meditation_seconds', amount: seconds });
  const minutes = Math.floor(s.totalSeconds / 60) - Math.floor(prevSeconds / 60);
  if (minutes > 0) events.push({ counter: 'focusing_orb:meditation_time', amount: minutes });
  if (session.kind === 'focused' && (energyGained >= 24 || moodGained >= 24)) {
    events.push({ counter: 'meditation_gain_24', amount: 1 });
  }
  if (moodGained >= 50) events.push({ counter: 'meditation_mood_50', amount: 1 });
  const wintryAllowed = session.kind === 'standing' || session.focus === 'energy';
  if (wintryAllowed && WINTRY_PLACE_TSIDS.includes(ctx.streetTsid) && seconds > 0) {
    events.push({ counter: 'meditation_seconds_wintry', amount: seconds });
  }

  return {
    ok: true,
    state: s,
    seconds,
    full,
    maxRelax,
    energy: energyGained,
    mood: moodGained,
    img: imgGained,
    zen,
    reachedZen,
    sound: full ? 'MEDITATION_SUCCESS' : 'HORRIBLE_SOUND',
    message,
    events,
  };
}

/**
 * imagine levitation: spend energy, start the 5 s jetpack buff.
 * @returns {{ ok: boolean, error?: string, state?: object, energyCost?: number, until?: number, message?: string }}
 */
export function startLevitation(state, ctx = {}) {
  const s = normalizeMeditationState(state);
  const now = ctx.now ?? Date.now();
  const verb = listOrbVerbs(s, { ...ctx, now }).find((v) => v.id === 'levitate');
  if (!verb) return { ok: false, error: MEDITATION_TEXT.failed };
  if (!verb.enabled) return { ok: false, error: verb.reason };
  const until = now + LEVITATION_PACKAGE.durationMs;
  return {
    ok: true,
    state: { ...s, levitateUntil: until, levitations: s.levitations + 1 },
    energyCost: LEVITATION_PACKAGE.energyCost,
    until,
    message: `You imagined levitation with a Focusing Orb. -${LEVITATION_PACKAGE.energyCost} energy`,
  };
}

/** levitation_by_meditation on_remove: 20 s meditation_cooldown. */
export function endLevitation(state, now = Date.now()) {
  const s = normalizeMeditationState(state);
  return {
    ...s,
    levitateUntil: 0,
    cooldownUntil: Math.max(s.cooldownUntil, now + LEVITATION_PACKAGE.cooldownAfterSeconds * 1000),
  };
}
