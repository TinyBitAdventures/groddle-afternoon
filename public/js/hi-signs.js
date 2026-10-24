/**
 * Hi signs (the "hi" emote) between you and your Butler: pure rules, the
 * recovered copy and numbers. js/features/hi-signs-feature.js draws them and
 * js/features/butler-feature.js holds the Butler's half of the state.
 *
 * Source map (GameServerJS, Dec 2012):
 *  - config_base.js 434-464: the eleven variants, their colours and names,
 *    hi_emote_base_mood 5, hi_emote_bonus_mood 10. config_prod.js 1353-1355:
 *    feature_hi_viral, feature_hi_records and feature_report_hi_records on.
 *  - players/inc_emotes.js: setHiEmoteVariant (3-47; a new variant resets
 *    the day's targets), setHiEmoteVariantRandomly (49-57),
 *    setHiEmoteVariantFromInfector (59-80), doEmote (82-315), the bonus
 *    with a Butler (317-333), maybe_set_evasion_record (366-475),
 *    make_and_store_evasion_record (477-514), doHiEmoteMissileHit (516-628).
 *    players/player.js 1054: doNewDay deletes your variant.
 *  - items/include/butler_emotes.js: the Butler's setHiEmoteVariant (3-26,
 *    stamps hi_emote_gt), doSayHi (45-128), doHiEmoteBonusWithOtherPlayer
 *    (130-147), doHiResponse (149-176), respondToHi (179-194),
 *    sayHiToButler (196-200). items/include/butler_hints.js 697-714
 *    sayHiHint. items/bag_butler.js 4053-4057: the Butler says hi when you
 *    walk into its far hit box after 10 s on the street; 4260-4267 a player
 *    leaving cancels its hi timers.
 *  - groups/hi_variants_tracker.js 125-165: the location's daily record
 *    holder is remembered for four game days (today and three before) and
 *    counted as daily_evasion_record:held at your next new day.
 *  - Client (glitch-client): LocationInputHandler.as 144-146/187-191 the "5"
 *    and "H" keys, Emotes.as 53-54 typing "hi" in chat, TSFrontController.as
 *    3165-3178 one hi per two seconds, AnnouncementController.as 621-811 the
 *    overlay, shards, missile and the bonus (2x overlay and two lightning
 *    bolts), MissileController.as / Missile.as the homing missile
 *    (ALGO_VERSION 10), LightningBolt.as the bolt.
 *
 * Solo: the one target is your Butler. Saying hi to other players, the bonus
 * between two players, the global variant leaderboard and spreader of the
 * day are left out (there are no other players).
 */

import { GAME_DAY_MS, GAME_EPOCH_MS } from './game-day.js?v=dametime-1';

/** config_base.js hi_emote_variants (in hi_overlay.as order). */
export const HI_VARIANTS = Object.freeze(['bats', 'birds', 'butterflies', 'cubes', 'flowers', 'hands', 'hearts', 'hi', 'pigs', 'rocketships', 'stars']);

/** config_base.js hi_emote_variants_color_map (the bonus bolts). */
export const HI_VARIANT_COLORS = Object.freeze({
  bats: '#353535',
  birds: '#9afe66',
  butterflies: '#ce42ab',
  cubes: '#45669c',
  flowers: '#50c7cf',
  hands: '#ffffff',
  hearts: '#840607',
  hi: '#f67e30',
  pigs: '#ef7e6c',
  rocketships: '#cb0303',
  stars: '#ffd205',
});

/** config_base.js hi_emote_variants_name_map. */
export const HI_VARIANT_NAMES = Object.freeze({
  bats: 'Bats',
  birds: 'Birds',
  butterflies: 'Butterflies',
  cubes: 'Cubes',
  flowers: 'Flowers',
  hands: 'Hands',
  hearts: 'Hearts',
  hi: 'HI',
  pigs: 'Pigs',
  rocketships: 'Rockets',
  stars: 'Stars',
});

export const HI = Object.freeze({
  /** config_base.js hi_emote_base_mood / hi_emote_bonus_mood. */
  BASE_MOOD: 5,
  BONUS_MOOD: 10,
  /** butler_emotes.js doSayHi: the plain Butler hi grants a literal 5. */
  BUTLER_HI_MOOD: 5,
  /** doEmote: a Butler within 400 px is the preferred target. */
  RADIUS: 400,
  /** doEmote / doSayHi: the bonus timers. */
  BONUS_DELAY_MS: 2000,
  /** TSFrontController.doEmote: one hi per two seconds. */
  THROTTLE_MS: 2000,
  /** doEmote announcement delta_y (overlay above the say-hier's feet). */
  OVERLAY_DY: -134,
  /** AnnouncementController.doEmoteHi: overlay duration, shard delay, missile start (delta_y + -26). */
  OVERLAY_MS: 2000,
  SHARD_DELAY_MS: 900,
  MISSILE_START_DY: -26,
  /** MissileController: aimed around the chest. */
  MISSILE_TARGET_DY: -60,
  /** doEmoteHiBonus: the 2x overlay sits 210 px above the midpoint for 2 s. */
  BONUS_OVERLAY_DY: -210,
  BONUS_OVERLAY_MS: 2000,
  /** LightningBolt.goWithDisposableSprites(0, 1.5, ..., -100, 0, 20). */
  BOLT_SECS: 1.5,
  BOLT_FADE_IN: 0.2,
  BOLT_FADE_OUT: 0.8,
  BOLT_FROM_DY: -100,
  BOLT_TO_DY: 20,
  /** pc_overlay "+N mood" texts (doMissilehit, doEmoteHiBonus). */
  MOOD_TEXT_MS: 2000,
  /** sayHiToButler 1500 ms → doHiResponse; doSayHi +750, respondToHi +1000. */
  BUTLER_RESPONSE_MS: 1500,
  BUTLER_SAY_HI_MS: 750,
  BUTLER_RESPOND_MS: 1000,
  /** respondToHi: sendBubbleAndChat(pc, response, true, 5000). */
  BUTLER_BUBBLE_MS: 5000,
  /** doSayHi: sayHiHint 5 s later; busy → retry in 10 s. */
  HINT_MS: 5000,
  HINT_RETRY_MS: 10_000,
  /** bag_butler.js onPlayerCollision "far": at least 10 s on this street. */
  STREET_SECS: 10,
  /** Hit box (bag_butler.js far_dist). */
  FAR_DIST: 550,
});

/** respondToHi / sayHiHint (verbatim; $pc / $variant filled in). */
export const HI_TEXT = Object.freeze({
  match: 'Neato, we match today!',
  responses: Object.freeze([
    'Oh, thank you $pc.',
    "Ah, you have $variant today. That's auspicious!",
    'I always like getting a hi from you.',
    "Challenge: say hi 5 times fast! Oh, wait... that's not a challenge at all.",
    "You're so friendly.",
    'Hello, Hi-master.',
  ]),
  hint: "Do you like saying 'Hi'? It's as easy as pressing '5' (when the focus is on the game, not in chat). Every day you get a new sign --- hands, bats, flowers, birds, cubes, etc. --- if you find someone with the same sign, you both get a bonus and you get honest mood out of it, once per day.",
});

/**
 * RightSideManager.as 232-235 (chatUpdate): a local chat line that is "hi",
 * in any case, gets no bubble over the speaker; the chat pane still shows
 * it. The line the server echoes back is trimmed (main.js 1702 utils.trim),
 * so " Hi " hides too, while "hi!", "hii" or "hi there" bubble as usual.
 * Saying the hi itself is Emotes.as 53-54 (hi-signs-feature.js onSubmit).
 */
export function hidesChatBubble(text) {
  return String(text ?? '').trim().toLowerCase() === 'hi';
}

/** Ids for the one player and the one Butler (the source keys by tsid). */
export const HI_PLAYER_ID = 'pc';
export const HI_BUTLER_ID = 'butler';

// ---------------------------------------------------------------------------
// Game days
// ---------------------------------------------------------------------------

/** The game day a timestamp falls in (is_same_day on current_gametime). */
export function hiDay(now = Date.now()) {
  return Math.floor((Number(now) - GAME_EPOCH_MS) / GAME_DAY_MS);
}

function sameDay(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && hiDay(a) === hiDay(b);
}

function pick(list, rand = Math.random) {
  return list[Math.min(list.length - 1, Math.max(0, Math.floor(rand() * list.length)))];
}

/** choose_one(config.hi_emote_variants). */
export function randomHiVariant(rand = Math.random) {
  return pick(HI_VARIANTS, rand);
}

export function isHiVariant(v) {
  return HI_VARIANTS.includes(v);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function stamps(src) {
  const out = {};
  for (const [k, v] of Object.entries(src && typeof src === 'object' ? src : {})) {
    const id = String(k).replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 40);
    const t = Math.floor(Number(v));
    if (id && Number.isFinite(t) && t > 0) out[id] = t;
  }
  return out;
}

function intOr(v, d) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : d;
}

/**
 * Your hi state (players/inc_emotes.js): today's variant and the game day it
 * was set, the Butlers you said hi to since it was set (hi_emote_daily_targets
 * .butlers, and yesterday's), how often you have said hi (counters emotes:hi),
 * the daily evasion records you hold until your next new day counts them
 * (the tracker's daily_evasion_records rows), and your best evasion.
 */
export function normalizePlayerHi(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const variant = isHiVariant(s.variant) ? s.variant : '';
  const records = (Array.isArray(s.records) ? s.records : [])
    .map((r) => ({ day: intOr(r?.day, NaN), tsid: String(r?.tsid || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40) }))
    .filter((r) => Number.isFinite(r.day) && r.tsid)
    .slice(-20);
  return {
    v: 1,
    variant,
    variantDay: variant ? intOr(s.variantDay, -1) : -1,
    butlers: stamps(s.butlers),
    butlersYesterday: stamps(s.butlersYesterday),
    count: Math.max(0, intOr(s.count, 0)),
    records,
    bestEvasion: Math.max(0, intOr(s.bestEvasion, 0)),
  };
}

/**
 * The Butler's hi state (butler_emotes.js): its variant, the game day it was
 * chosen (hi_emote_gt), whom it said hi to since (hi_emote_daily_targets.pcs,
 * and yesterday's) and the game day it last answered your hi
 * (hi_response_time.list[pc]).
 */
export function normalizeButlerHi(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const variant = isHiVariant(s.variant) ? s.variant : '';
  return {
    variant,
    gtDay: variant ? intOr(s.gtDay, -1) : -1,
    pcs: stamps(s.pcs),
    pcsYesterday: stamps(s.pcsYesterday),
    responseDay: intOr(s.responseDay, -1),
  };
}

/** Your variant today ('' once the game day it was set has passed: doNewDay deletes it). */
export function playerHiVariant(p, now = Date.now()) {
  if (!p?.variant) return '';
  return p.variantDay === hiDay(now) ? p.variant : '';
}

/** doNewDay: delete hi_emote_variant. */
export function expirePlayerHi(p, now = Date.now()) {
  if (p?.variant && p.variantDay !== hiDay(now)) {
    p.variant = '';
    p.variantDay = -1;
    return true;
  }
  return false;
}

/** setHiEmoteVariant (player): only when there is none today; resets the day's targets. */
export function setPlayerHiVariant(p, variant, now = Date.now()) {
  if (playerHiVariant(p, now)) return null;
  if (!isHiVariant(variant)) return null;
  p.variant = variant;
  p.variantDay = hiDay(now);
  p.butlersYesterday = p.butlers || {};
  p.butlers = {};
  return variant;
}

/** setHiEmoteVariant (Butler): stamps hi_emote_gt and resets whom it said hi to. */
export function setButlerHiVariant(b, variant, now = Date.now()) {
  if (!isHiVariant(variant)) return null;
  b.variant = variant;
  b.pcsYesterday = b.pcs || {};
  b.pcs = {};
  b.gtDay = hiDay(now);
  return variant;
}

// ---------------------------------------------------------------------------
// You say hi (doEmote)
// ---------------------------------------------------------------------------

/**
 * doEmote('hi') with your Butler as the only possible target. `butlerNear`:
 * a Butler within 400 px. Mutates both states. Returns what to show:
 *  - variant / gotRandomly: your sign (rolled now when you had none today)
 *  - butlerTarget: you have not said hi to this Butler since your sign was
 *    set, so a missile flies to it (no mood for you: shard mood_granted 0)
 *  - infectedButler: it had no sign and takes yours
 *  - bonus: same sign and it said hi to you since its sign was set → after
 *    2 s, +10 mood (doHiEmoteBonusWithButler)
 *  - respond: the Butler hears it (sayHiToButler) whether or not it was the target
 *  - counters: achievement counters (group:label, amount)
 *  - activity: the line for your activity log (feature_hi_viral), or ''
 */
export function playerSaysHi(p, b, { now = Date.now(), rand = Math.random, butlerNear = false, butlerLabel = 'Butler' } = {}) {
  const out = {
    variant: '',
    variantName: '',
    gotRandomly: false,
    butlerTarget: false,
    infectedButler: false,
    butlerVariant: '',
    bonus: false,
    bonusMood: 0,
    respond: false,
    counters: [],
    activity: '',
  };
  let variant = playerHiVariant(p, now);
  if (!variant) {
    out.gotRandomly = true;
    variant = setPlayerHiVariant(p, randomHiVariant(rand), now);
  }
  out.variant = variant;
  out.variantName = HI_VARIANT_NAMES[variant] || variant;
  // counters_increment("emotes", "hi"): a stat, not an achievement counter.
  p.count = (p.count || 0) + 1;
  if (butlerNear && b) {
    if (!p.butlers[HI_BUTLER_ID]) out.butlerTarget = true;
    if (out.butlerTarget) {
      p.butlers[HI_BUTLER_ID] = Math.floor(now);
      let target = b.variant;
      if (!target) {
        out.infectedButler = true;
        target = setButlerHiVariant(b, variant, now);
        out.counters.push([`infected_butler:${target}`, 1]);
      }
      out.butlerVariant = target;
      if (target === variant && HI_PLAYER_ID in b.pcs) out.bonus = true;
      if (out.bonus) out.bonusMood = HI.BONUS_MOOD;
      out.counters.push([`hi_variants_butler:${variant}`, 1]);
    } else {
      out.butlerVariant = b.variant;
    }
    out.respond = true;
  }
  out.activity = playerHiActivity(out, butlerLabel);
  return out;
}

/** doEmote's activity line for the one saying hi (no line when nothing happened). */
export function playerHiActivity(out, butlerLabel = 'Butler') {
  const name = out.variantName;
  let s = '';
  if (out.infectedButler && out.gotRandomly) s = `You got the daily hi sign "${name}", and passed it on to ${butlerLabel}!`;
  else if (out.infectedButler) s = `You just passed your hi sign to ${butlerLabel}, now they have "${name}"!`;
  else if (out.gotRandomly) s = `You got the daily hi sign "${name}"!`;
  if (out.bonus) {
    s = s ? `${s} Plus, you` : 'You';
    s += ` and ${butlerLabel} have the same hi sign "${name}". Bonus time!`;
  }
  return s;
}

/** doBonus, the bonus with a Butler: achievements_increment('hi_jackpot_butler', butler, 1). */
export function playerButlerBonusCounters() {
  return [[`hi_jackpot_butler:${HI_BUTLER_ID}`, 1]];
}

// ---------------------------------------------------------------------------
// The Butler says hi (doSayHi, doHiResponse, respondToHi)
// ---------------------------------------------------------------------------

/**
 * doSayHi(pc). `busy`: the Butler is still waiting on its last hi
 * (this.hi_target). Returns { said: false, reason } or { said: true,
 * variant, infectedPlayer, bonus, mood (granted now, with the missile),
 * bonusMood (after 2 s), counters }.
 */
export function butlerSaysHi(b, p, { now = Date.now(), rand = Math.random, busy = false } = {}) {
  if (!b.variant) setButlerHiVariant(b, randomHiVariant(rand), now);
  if (busy) return { said: false, reason: 'busy' };
  const last = b.pcs[HI_PLAYER_ID];
  if (last && sameDay(last, now)) return { said: false, reason: 'today' };
  // A new game day: a new sign for the Butler.
  if (b.gtDay !== hiDay(now)) setButlerHiVariant(b, randomHiVariant(rand), now);
  const out = { said: true, variant: b.variant, variantName: HI_VARIANT_NAMES[b.variant], infectedPlayer: false, bonus: false, mood: 0, bonusMood: 0, counters: [] };
  let target = playerHiVariant(p, now);
  if (!target) {
    out.infectedPlayer = true;
    target = setPlayerHiVariant(p, b.variant, now);
    // setHiEmoteVariantFromInfector (feature_hi_viral): a Butler infector.
    out.counters.push([`infected_by_butler:${target}`, 1]);
  }
  if (target === b.variant && HI_BUTLER_ID in p.butlers) out.bonus = true;
  // The bonus is base + bonus mood (15) after 2 s; otherwise 5 now.
  if (out.bonus) out.bonusMood = HI.BASE_MOOD + HI.BONUS_MOOD;
  else out.mood = HI.BUTLER_HI_MOOD;
  b.pcs[HI_PLAYER_ID] = Math.floor(now);
  return out;
}

/** doHiResponse: answer your hi once per game day (hi_response_time). */
export function butlerHiResponseDue(b, now = Date.now()) {
  const day = hiDay(now);
  if (b.responseDay === day) return false;
  b.responseDay = day;
  return true;
}

/** respondToHi: "Neato, we match today!" or one of the six lines. */
export function butlerHiResponse(b, p, { now = Date.now(), label = 'friend', rand = Math.random } = {}) {
  const variant = playerHiVariant(p, now);
  if (variant && variant === b.variant) return HI_TEXT.match;
  // The source prints the variant id itself ("rocketships", "hi").
  return pick(HI_TEXT.responses, rand).replace('$pc', label).replace('$variant', String(variant || 'undefined'));
}

/** sayHiHint: only to someone who has never said hi. */
export function hiHintDue(p) {
  return (p?.count || 0) <= 0;
}

// ---------------------------------------------------------------------------
// The missile (Missile.as, ALGO_VERSION 10)
// ---------------------------------------------------------------------------

export const MISSILE = Object.freeze({
  ALGO_VERSION: 10,
  PX_PER_SEC_ADD_IN: 40,
  PX_PER_SEC_START: 250,
  PX_PER_SEC_OVERAGE_START: 190,
  SECS_TIL_ACCEL: 1,
  SECS_TIL_MAX_INCREASE: 300,
  MAX_ADD_IN_PER_SEC: 1,
  BOB_SECS: 0.2,
  BOB_AMT: 15,
  SECS_TIL_COLLISION_DIST_INCREASE: 312,
  COLLISION_DIST_MIN: 25,
  COLLISION_DIST_MAX: 50,
  /** The client's walk speed (vx_max, px/s); the remake walks 4.4 px a frame at that. */
  CLIENT_VX_MAX: 335,
});

/**
 * A missile from (x, y). `accelerate`: the hi missiles (doEmote and doSayHi
 * both announce accelerate: true) speed up the longer they chase.
 */
export function createMissile({ x = 0, y = 0, accelerate = true, now = 0 } = {}) {
  return {
    x,
    y,
    accelerate,
    ms: 0,
    startedAt: now,
    pxPerSec: MISSILE.PX_PER_SEC_START,
    overage: MISSILE.PX_PER_SEC_OVERAGE_START,
    slow: 0,
    collision: MISSILE.COLLISION_DIST_MIN,
    lastTargetY: null,
    arrived: false,
  };
}

/** setMaxPxPerSec: the location's vx_max (vy_max when jetpacking) plus the overage. */
export function missileMaxSpeed(m, { vxMax = MISSILE.CLIENT_VX_MAX, vyMax = 0, jetpack = false } = {}) {
  const secs = Math.floor(m.ms / 1000);
  let max = (jetpack ? vyMax : vxMax) + m.overage;
  if (secs > MISSILE.SECS_TIL_MAX_INCREASE) max += (secs - MISSILE.SECS_TIL_MAX_INCREASE) * MISSILE.MAX_ADD_IN_PER_SEC;
  return max;
}

/**
 * onGameLoop + the tween toward the target, for one step of dtMs. Speeds are
 * the client's px/s; `scale` turns them into world px/s (the remake's walk
 * speed over the client's, so the chase keeps the source's balance).
 * `target` is { x, y } (aim point). Returns the missile (arrived when it
 * reached the target).
 */
export function stepMissile(m, dtMs, target, { vxMax = MISSILE.CLIENT_VX_MAX, vyMax = 0, jetpack = false, scale = 1 } = {}) {
  if (m.arrived) return m;
  const dt = Math.max(0, Number(dtMs) || 0);
  m.ms += dt;
  if (m.accelerate) {
    const secs = Math.floor(m.ms / 1000);
    const max = missileMaxSpeed(m, { vxMax, vyMax, jetpack });
    if (secs > MISSILE.SECS_TIL_COLLISION_DIST_INCREASE && m.collision < MISSILE.COLLISION_DIST_MAX) {
      m.collision = Math.max(MISSILE.COLLISION_DIST_MIN, Math.min(MISSILE.COLLISION_DIST_MAX, MISSILE.COLLISION_DIST_MIN + (secs - MISSILE.SECS_TIL_COLLISION_DIST_INCREASE)));
    }
    const perc = dt / 17;
    const addIn = secs > MISSILE.SECS_TIL_ACCEL ? (secs - MISSILE.SECS_TIL_ACCEL) * MISSILE.PX_PER_SEC_ADD_IN : 0;
    let pps = Math.min(max, MISSILE.PX_PER_SEC_START + addIn);
    // A target jumping up (y falling by more than 5 px since the last loop) slows it.
    const yChange = m.lastTargetY == null ? 0 : (target.y - m.lastTargetY) / Math.max(1e-6, scale);
    if (pps > vxMax && yChange < -5) {
      m.slow = Math.min(m.overage + 10, m.slow + 6 * perc);
    } else if (m.slow) {
      // The source multiplies by .97 * perc; held to its own ceiling so a
      // slow frame cannot grow it without bound.
      m.slow = Math.min(m.overage + 10, m.slow * (0.97 * perc));
    }
    pps = Math.max(pps - m.slow, MISSILE.PX_PER_SEC_START);
    m.pxPerSec = pps;
    m.lastTargetY = target.y;
  }
  const step = (m.pxPerSec * scale * dt) / 1000;
  const dx = target.x - m.x;
  const dy = target.y - m.y;
  const dist = Math.hypot(dx, dy);
  // hasArrived: the tween reached the target, within collision_dist of where it is now.
  if (dist <= Math.max(step, m.accelerate ? m.collision * scale : 0)) {
    m.x = target.x;
    m.y = target.y;
    m.arrived = true;
    return m;
  }
  m.x += (dx / dist) * step;
  m.y += (dy / dist) * step;
  return m;
}

/** Missile.hasArrived → doHiEmoteMissileHit: seconds the hi chased you (rounded). */
export function missileSeconds(m) {
  return Math.round((m?.ms || 0) / 1000);
}

/** The bob (startBob/doBob): ±15 px, a fifth of a second each way. */
export function missileBob(ms, phase = 0) {
  const t = (ms / 1000 + phase) / MISSILE.BOB_SECS;
  return Math.sin(t * Math.PI) * MISSILE.BOB_AMT;
}

// ---------------------------------------------------------------------------
// Evasion (doHiEmoteMissileHit, maybe_set_evasion_record)
// ---------------------------------------------------------------------------

/** doHiEmoteMissileHit achievements: seconds → badge (granted outright). */
export const HI_EVASION_BADGES = Object.freeze([
  Object.freeze({ secs: 11, id: 'hi_flyer' }),
  Object.freeze({ secs: 61, id: 'hi_speed_chase' }),
  Object.freeze({ secs: 151, id: 'hi_as_a_kite' }),
  Object.freeze({ secs: 311, id: 'hi_velocity' }),
]);

export const HI_EVASION = Object.freeze({
  MIN_RECORD_SECS: 10,
  MIN_FEEDBACK_SECS: 5,
  /** hi_variants_tracker.js daily_evasion_records_max_days: today and the previous 3. */
  RECORD_DAYS: 4,
});

export function evasionBadges(secs) {
  return HI_EVASION_BADGES.filter((b) => secs >= b.secs).map((b) => b.id);
}

/** A location's records: { alltime, daily, history } (each { pc, label, secs, when, version, day }). */
export function normalizeEvasionRecords(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const rec = (r) => (r && typeof r === 'object' && Number.isFinite(Number(r.secs))
    ? { pc: String(r.pc || HI_PLAYER_ID), label: String(r.label || ''), secs: Math.max(0, Math.floor(Number(r.secs))), when: intOr(r.when, 0), version: intOr(r.version, 0), day: intOr(r.day, -1) }
    : null);
  const history = {};
  for (const [k, v] of Object.entries(s.history && typeof s.history === 'object' ? s.history : {})) {
    const r = rec(v);
    if (r) history[String(k).slice(0, 20)] = r;
  }
  return { alltime: rec(s.alltime), daily: rec(s.daily), history };
}

/**
 * maybe_set_evasion_record + make_and_store_evasion_record for one location
 * (the slot mutates). Returns { status, msg } (status 'fail' when nothing was
 * set, tied or broken). The daily check runs after the all-time one and its
 * message wins, as in the source.
 */
export function maybeSetEvasionRecord(slot, { secs, label = '', now = Date.now(), version = MISSILE.ALGO_VERSION } = {}) {
  const day = hiDay(now);
  if (version < 10) return { status: 'fail', msg: `ignoring because version is less than 10. msg.version:${version}` };
  let alltime = slot.alltime;
  let daily = slot.daily;
  if (daily && daily.day !== day) {
    daily = null;
    slot.daily = null;
  }
  if (alltime) {
    if ((alltime.version || 0) < version) {
      slot.history ||= {};
      slot.history[`version_${alltime.version || 0}`] = alltime;
      slot.alltime = null;
      alltime = null;
    } else if (alltime.version > version) {
      return { status: 'fail', msg: `alltime_record.version:${alltime.version} > msg.version:${version}` };
    }
  }
  let ret = null;
  let alltimeChanged = false;
  if (!alltime) {
    alltimeChanged = true;
    ret = { status: 'set_alltime', msg: `${secs} seconds set the <b>ALL TIME</b> hi sign evasion record for this location!` };
  } else if (secs > alltime.secs) {
    alltimeChanged = true;
    ret = { status: 'broke_alltime', msg: `${secs} seconds broke the previous <b>ALL TIME</b> hi sign evasion record of ${alltime.secs} seconds for this location, set by ${alltime.label}!` };
  } else if (secs === alltime.secs) {
    alltimeChanged = true;
    ret = { status: 'tied_alltime', msg: `${secs} seconds tied the previous <b>ALL TIME</b> hi sign evasion record for this location, set by ${alltime.label}!` };
  }
  if (!daily) {
    ret = { status: 'set_daily', msg: `${secs} seconds set today's hi sign evasion record for this location!` };
  } else if (secs > daily.secs) {
    ret = { status: 'broke_daily', msg: `${secs} seconds broke today's hi sign evasion record of ${daily.secs} seconds for this location, set by ${daily.label}!` };
  } else if (secs === daily.secs) {
    ret = { status: 'tied_daily', msg: `${secs} seconds tied today's hi sign evasion record for this location, set by ${daily.label}!` };
  }
  if (ret) {
    const ob = { pc: HI_PLAYER_ID, label, secs, when: Math.floor(now / 1000), version, day };
    slot.daily = ob;
    if (alltimeChanged) slot.alltime = { ...ob };
    return { ...ret, stored: true, alltime: alltimeChanged };
  }
  return { status: 'fail', msg: 'no record set or anything' };
}

/** remember_pcs_daily_evasion_record: this location's holder today is you (one row per location per day). */
export function rememberDailyRecord(p, tsid, now = Date.now()) {
  const day = hiDay(now);
  const id = String(tsid || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);
  if (!id) return;
  p.records = (p.records || []).filter((r) => !(r.day === day && r.tsid === id));
  p.records.push({ day, tsid: id });
}

/**
 * calculate_pcs_daily_evasion_record_achieves at your new day: the records
 * you hold in the tracker's last four days count (and are dropped); older
 * rows have fallen off the tracker. Returns the count for
 * daily_evasion_record:held.
 */
export function countHeldDailyRecords(p, now = Date.now()) {
  const today = hiDay(now);
  const rows = p.records || [];
  const held = rows.filter((r) => r.day > today - HI_EVASION.RECORD_DAYS && r.day <= today).length;
  p.records = [];
  return held;
}

/** The evasion line (feature_report_hi_records): the record, else the seconds from 5 up. */
export function evasionActivity(secs, record, label = 'Your') {
  const plain = (s) => String(s).replace(/<\/?b>/g, '');
  if (record && record.status !== 'fail') return `${label} ${plain(record.msg)}`;
  if (secs >= HI_EVASION.MIN_FEEDBACK_SECS) return `You evaded that hi sign for ${secs} seconds!`;
  return '';
}

// ---------------------------------------------------------------------------
// Art (CC0 OGA hi_overlays sheets, 30 fps)
// ---------------------------------------------------------------------------

/**
 * hi_overlay.swf: per variant a sprite with a one-frame "1" state (the
 * missile icon) and a 65-frame "hi" state (the overlay), and "<variant>2x"
 * with a 37-frame "hi" state (the bonus). The OGA sheets keep each variant's
 * cell size; the 2x sheets share 149 x 114. [w, h, ax, ay]: the cell and
 * the centre of its "1" icon (measured; the overlay and missile hang on it,
 * where the client centres the icon).
 */
export const HI_ART_CELLS = Object.freeze({
  bats: [149, 114, 79.5, 65], birds: [146, 114, 79.5, 64], butterflies: [154, 120, 78, 66.5], cubes: [147, 122, 77.5, 67.5],
  flowers: [145, 118, 77.5, 66], hands: [135, 111, 78, 67], hearts: [143, 112, 78.5, 67.5], hi: [148, 116, 78, 67],
  pigs: [132, 112, 78, 66], rocketships: [153, 123, 77.5, 70.5], stars: [152, 121, 79.5, 67],
});
export const HI_ART = Object.freeze({ FPS: 30, HI_FRAMES: 65, BONUS_FRAMES: 37, BONUS_CELL: Object.freeze([149, 114, 79.5, 70]), BONUS_COLS: 6 });

export function hiArtUrl(variant, kind = 'hi') {
  const v = isHiVariant(variant) ? variant : 'hi';
  return `assets/sprites/hi-signs/hi_${v}_${kind === 'still' ? '1' : kind === 'bonus' ? '2x' : 'hi'}.webp`;
}

/** Sheet geometry for one variant's overlay ('hi'), missile icon ('still') or bonus ('bonus'). */
export function hiArtSheet(variant, kind = 'hi') {
  const v = isHiVariant(variant) ? variant : 'hi';
  if (kind === 'bonus') {
    const [w, h, ax, ay] = HI_ART.BONUS_CELL;
    return { url: hiArtUrl(v, 'bonus'), w, h, ax, ay, cols: HI_ART.BONUS_COLS, frames: HI_ART.BONUS_FRAMES };
  }
  const [w, h, ax, ay] = HI_ART_CELLS[v];
  if (kind === 'still') return { url: hiArtUrl(v, 'still'), w, h, ax, ay, cols: 1, frames: 1 };
  // The 'hi' sheets are 6 cells wide, hands and pigs 7 (each sheet is cols x rows of its cell).
  return { url: hiArtUrl(v, 'hi'), w, h, ax, ay, cols: v === 'hands' || v === 'pigs' ? 7 : 6, frames: HI_ART.HI_FRAMES };
}

/** '#ce42ab' → 0xce42ab. */
export function hiColor(variant) {
  return parseInt(String(HI_VARIANT_COLORS[variant] || '#ffffff').slice(1), 16);
}
