/** Source-authored Ticket to Paradise economy and reusable flight-course state. */

import { EXTRA_PARADISE_COURSES } from './paradise-courses.js?v=bb3d9051';
import { qrazyRewardForLevel } from './quoins.js?v=d4f4772b';

export const PARADISE_DURATION_MS = 4 * 60 * 1000;
export const PARADISE_DAILY_LIMIT = 11;

/**
 * Clean cloud-tunnel profiles derived from the supplied Cloud Rings recording.
 * The source rings are tall, thick cloud masses with a navigable central gap,
 * not thin geometric hoops.
 */
export const CLOUD_RING_PROFILES = Object.freeze([
  Object.freeze({ tint: 0xffc51f, shadowTint: 0xc87913, outerRx: 196, outerRy: 304, innerRx: 101, innerRy: 196 }),
  Object.freeze({ tint: 0xef9332, shadowTint: 0xb55b26, outerRx: 205, outerRy: 320, innerRx: 106, innerRy: 205 }),
  Object.freeze({ tint: 0xa886e2, shadowTint: 0x6754ad, outerRx: 198, outerRy: 310, innerRx: 102, innerRy: 199 }),
  Object.freeze({ tint: 0x62b7e4, shadowTint: 0x3879ae, outerRx: 208, outerRy: 324, innerRx: 108, innerRy: 208 }),
  Object.freeze({ tint: 0xd486d7, shadowTint: 0x8e529e, outerRx: 201, outerRy: 314, innerRx: 104, innerRy: 202 }),
]);

/**
 * The defining Radial Heights landmark, recovered from the source street
 * GHFQOLEIHN63P27. Coordinates and display size are the original screen-space
 * values; the texture is clean CC0 game art, not a frame from the recording.
 */
export const RADIAL_HEIGHTS_MOON = Object.freeze({
  asset: 'moon_asset_smile.svg',
  x: 885,
  y: 1094,
  width: 322,
  height: 322,
});

export const STARLIT_NIGHT_MOON = Object.freeze({
  plain: Object.freeze({
    asset: 'moon_asset_plain.svg',
    x: 1309,
    y: 257,
    width: 149,
    height: 149,
  }),
  smile: Object.freeze({
    asset: 'moon_asset_smile.svg',
    x: 1308,
    y: 258,
    width: 150,
    height: 150,
  }),
});

export const STARLIT_NIGHT_MOON_FADE_MS = 1500;
export const STARLIT_NIGHT_STAR_FADE_MS = 1000;

/**
 * The two source-authored `stars_2` layers from GHFCVOD2GN631RJ. These are
 * already screen-space coordinates in the recovered T_ layers.
 */
export const STARLIT_NIGHT_STAR_FIELDS = Object.freeze([
  Object.freeze({ x: 409, y: 260, width: 838, height: 234, depth: 'sky' }),
  Object.freeze({ x: 1095, y: 396, width: 838, height: 234, depth: 'sky' }),
  Object.freeze({ x: 424, y: 680, width: 838, height: 234, depth: 'sky' }),
  Object.freeze({ x: 1072, y: 864, width: 838, height: 234, depth: 'sky' }),
  Object.freeze({ x: 404, y: 473, width: 969, height: 271, depth: 'bg' }),
  Object.freeze({ x: 1018, y: 709, width: 969, height: 271, depth: 'bg' }),
  Object.freeze({ x: 78, y: 863, width: 969, height: 271, depth: 'bg' }),
  Object.freeze({ x: 1244, y: 241, width: 838, height: 234, depth: 'bg' }),
]);

export function starlitRevealAlpha(startedAt, now, duration = STARLIT_NIGHT_STAR_FADE_MS) {
  const start = Number(startedAt);
  if (!Number.isFinite(start) || start <= 0) return 0;
  const elapsed = Math.max(0, Number(now) - start);
  return Math.max(0, Math.min(1, elapsed / Math.max(1, Number(duration) || 1)));
}

export function starlitMoonPlainAlpha(startedAt, now) {
  const start = Number(startedAt);
  if (!Number.isFinite(start) || start <= 0) return 1;
  return 1 - starlitRevealAlpha(start, now, STARLIT_NIGHT_MOON_FADE_MS);
}

/**
 * Deterministic clean-cloud layout for one vertical tunnel.
 * @param {number} ringIndex
 * @param {number} puffCount
 */
export function cloudRingPuffLayout(ringIndex, puffCount = 32) {
  const profile =
    CLOUD_RING_PROFILES[Math.abs(Math.floor(Number(ringIndex) || 0)) % CLOUD_RING_PROFILES.length];
  const count = Math.max(16, Math.min(32, Math.floor(Number(puffCount) || 32)));
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    const wobble = 1 + Math.sin((index + ringIndex * 3) * 1.73) * 0.055;
    return Object.freeze({
      x: Math.cos(angle) * profile.outerRx * wobble,
      y: Math.sin(angle) * profile.outerRy * wobble,
      width: 104 + ((index * 23 + ringIndex * 17) % 32),
      height: 62 + ((index * 19 + ringIndex * 11) % 22),
      rotation: Math.sin(angle * 2 + ringIndex) * 0.11,
      alpha: 0.94 + (index % 3) * 0.025,
      tint: profile.tint,
      shadowTint: profile.shadowTint,
      textureVariant: (index + ringIndex) % 3 === 0 ? 2 : 1,
    });
  });
}

/**
 * Clean, source-video-derived Slip 'N Slide terrain. The recording establishes
 * the repeating snowy hills, but these authored points keep compression and
 * capture scaling out of the game itself.
 */
export const SLIP_N_SLIDE_TERRAIN = Object.freeze([
  Object.freeze({ x: 0, y: 716 }),
  Object.freeze({ x: 260, y: 654 }),
  Object.freeze({ x: 560, y: 754 }),
  Object.freeze({ x: 870, y: 584 }),
  Object.freeze({ x: 1190, y: 754 }),
  Object.freeze({ x: 1500, y: 622 }),
  Object.freeze({ x: 1810, y: 760 }),
  Object.freeze({ x: 2140, y: 604 }),
  Object.freeze({ x: 2470, y: 758 }),
  Object.freeze({ x: 2790, y: 610 }),
  Object.freeze({ x: 3090, y: 760 }),
  Object.freeze({ x: 3400, y: 660 }),
  Object.freeze({ x: 3600, y: 690 }),
]);

/**
 * Clean recovered K03 landmarks visible throughout the supplied course video.
 * Positions are authored for the reconstructed hill profile; dimensions come
 * from the original transparent CC0 PNGs, never the recording.
 */
export const SLIP_N_SLIDE_LANDMARKS = Object.freeze([
  Object.freeze({ id: 'welcome-snowman', sprite: 'k03_snowman_01', x: 325, width: 118, z: -7 }),
  Object.freeze({ id: 'first-cabin', sprite: 'k03_logcabin_01', x: 790, width: 142, z: -7 }),
  Object.freeze({ id: 'first-ice-spire', sprite: 'k03_icehill_01', x: 1040, width: 275, z: -42, groundOffset: 66, alpha: 0.88 }),
  Object.freeze({ id: 'first-pine-copse', sprite: 'k03_treegroup_01', x: 1420, width: 168, z: -22, groundOffset: 8 }),
  Object.freeze({ id: 'second-cabin', sprite: 'k03_logcabin_01', x: 1930, width: 136, z: -7 }),
  Object.freeze({ id: 'second-ice-spire', sprite: 'k03_icehill_02', x: 2240, width: 250, z: -42, groundOffset: 62, alpha: 0.84 }),
  Object.freeze({ id: 'second-pine-copse', sprite: 'k03_treegroup_01', x: 2660, width: 178, z: -22, groundOffset: 8 }),
  Object.freeze({ id: 'way-home-castle', sprite: 'k03_snowcastle_01', x: 3260, width: 345, z: -7, groundOffset: 18 }),
]);

export const SLIP_N_SLIDE_TREE_SPRITES = Object.freeze([
  'k03_tree01_snow_01',
  'k03_tree01_snow_02',
  'k03_tree02_snow_01',
  'k03_tree02_snow_02',
]);

function smoothStep(value) {
  const t = Math.max(0, Math.min(1, Number(value) || 0));
  return t * t * (3 - 2 * t);
}

export function slipTerrainY(x, points = SLIP_N_SLIDE_TERRAIN) {
  const safe = Array.isArray(points) && points.length >= 2 ? points : SLIP_N_SLIDE_TERRAIN;
  const px = Math.max(safe[0].x, Math.min(safe[safe.length - 1].x, Number(x) || 0));
  let right = 1;
  while (right < safe.length - 1 && px > safe[right].x) right += 1;
  const a = safe[right - 1];
  const b = safe[right];
  const span = Math.max(1, b.x - a.x);
  return a.y + (b.y - a.y) * smoothStep((px - a.x) / span);
}

export function slipTerrainSlope(x, sample = 4) {
  const distance = Math.max(1, Number(sample) || 4);
  return (slipTerrainY(Number(x) + distance) - slipTerrainY(Number(x) - distance)) /
    (distance * 2);
}

const reward = (type, amount, giantId = null) =>
  Object.freeze({ type, amount, giantId });

export const PARADISE_COURSES = Object.freeze({
  cloud_rings: Object.freeze({
    id: 'cloud_rings',
    name: 'Cloud Rings',
    ticketId: 'paradise_ticket_cloud_rings',
    templateTsid: 'LHFVPPKQSR53T1L',
    width: 3600,
    height: 960,
    spawn: Object.freeze({ x: 180, y: 690 }),
    exit: Object.freeze({ x: 3420, y: 690 }),
    pickupCount: 18,
    ringCount: 5,
    objective: 'Fly through all 5 cloud rings, then find the exit',
    completion: 'Every cloud ring is singing. The way home is open!',
    ringRewards: Object.freeze([720, 120, 954, 720, 1200]),
    rewards: Object.freeze([
      reward('xp', 120),
      reward('currants', 100),
      reward('energy', 100),
      reward('xp', 120),
      reward('mood', 100),
      reward('favor', 100, 'cosma'),
    ]),
    completionReward: reward('xp', 500),
  }),
  radial_heights: Object.freeze({
    id: 'radial_heights',
    name: 'Radial Heights',
    ticketId: 'paradise_ticket_radial_heights',
    templateTsid: 'LHFR8BRSVT33AE0',
    sourceStreetTsid: 'GHFQOLEIHN63P27',
    width: 2000,
    height: 2000,
    spawn: Object.freeze({ x: 1000, y: 1120 }),
    exit: Object.freeze({ x: 500, y: 1645 }),
    pickupCount: 53,
    ringCount: 0,
    objective: 'Follow the spiral and find all 53 stars',
    // source: the street's completion sign (GHFQOLEIHN63P27.xml groddle_sign_blank sign_txt)
    completion: "Good work, you've got all the stars!",
    rewards: Object.freeze([
      reward('xp', 12),
      reward('xp', 15),
      reward('currants', 10),
      reward('energy', 12),
      reward('mood', 10),
    ]),
    completionReward: reward('xp', 600),
  }),
  starlit_night: Object.freeze({
    id: 'starlit_night',
    name: 'Starlit Night',
    ticketId: 'paradise_ticket_starlit_night',
    templateTsid: 'LHFD3EU3SH2307J',
    sourceStreetTsid: 'GHFCVOD2GN631RJ',
    width: 1500,
    height: 900,
    spawn: Object.freeze({ x: 110, y: 700 }),
    exit: Object.freeze({ x: 1380, y: 700 }),
    pickupCount: 22,
    ringCount: 0,
    objective: 'Collect 22 quoins to light up the night sky',
    completion: 'Congratulations! You helped light up the night sky!',
    rewards: Object.freeze([
      reward('energy', 100),
      reward('xp', 120),
      reward('favor', 100, 'friendly'),
      reward('xp', 600),
      reward('currants', 100),
      reward('mood', 100),
    ]),
    completionReward: reward('xp', 300),
  }),
  slip_n_slide: Object.freeze({
    id: 'slip_n_slide',
    name: "Slip 'N Slide",
    ticketId: 'paradise_ticket_slip_n_slide',
    templateTsid: 'LHFQVU11DR53IKB',
    movement: 'slide',
    width: 3600,
    height: 900,
    spawn: Object.freeze({ x: 260, y: 654 }),
    exit: Object.freeze({ x: 3480, y: 682 }),
    pickupCount: 18,
    ringCount: 0,
    objective: 'Jump and slide through all 18 snowy stars',
    completion: 'You played the whole hill like a tune. The way home is open!',
    rewards: Object.freeze([
      reward('currants', 100),
      reward('xp', 120),
      reward('mood', 100),
      reward('xp', 120),
      reward('favor', 100, 'friendly'),
      reward('currants', 100),
      reward('xp', 360),
      reward('energy', 100),
      reward('currants', 100),
      reward('xp', 120),
      reward('energy', 100),
      reward('currants', 100),
      reward('xp', 360),
      reward('xp', 120),
      reward('energy', 100),
      reward('currants', 100),
      reward('xp', 360),
      reward('xp', 3000),
    ]),
    completionReward: reward('xp', 1098),
  }),
  // The nine reconstructed courses (Aerial Boost, Mountain Scaling, ...).
  ...EXTRA_PARADISE_COURSES,
});

export const PARADISE_TICKET_IDS = Object.freeze(
  Object.values(PARADISE_COURSES).map((course) => course.ticketId)
);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanCount(value, max = 999999) {
  return Math.max(0, Math.min(max, Math.floor(finite(value, 0))));
}

function cleanIndexes(value, max) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((entry) => Math.floor(finite(entry, -1)))
    .filter((entry) => entry >= 0 && entry < max))]
    .sort((a, b) => a - b);
}

export function paradiseDayKey(now = Date.now()) {
  const date = new Date(now);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '1970-01-01';
}

export function normalizeParadiseState(seed = {}, now = Date.now()) {
  const today = paradiseDayKey(now);
  const sameDay = String(seed?.dayKey || '') === today;
  const visits = {};
  const completions = {};
  for (const courseId of Object.keys(PARADISE_COURSES)) {
    visits[courseId] = cleanCount(seed?.visits?.[courseId]);
    completions[courseId] = cleanCount(seed?.completions?.[courseId]);
  }
  return {
    dayKey: today,
    ticketsToday: sameDay ? cleanCount(seed?.ticketsToday, PARADISE_DAILY_LIMIT) : 0,
    visits,
    completions,
  };
}

export function createParadiseState(seed = {}, now = Date.now()) {
  return normalizeParadiseState(seed, now);
}

export function resetParadiseDay(state, now = Date.now()) {
  Object.assign(state, normalizeParadiseState(state, now));
  return state;
}

/** Exact paradise_ticket.js price curve. */
export function paradiseTicketCost(quoinMultiplier = 1) {
  const original = Math.max(1, finite(quoinMultiplier, 1));
  const capped = Math.min(original, 100);
  const base = capped <= 40 ? 20 : 20 + Math.floor((capped - 40) / 4);
  return Math.round(base * original);
}

/** paradise_ticket.js verbs.activate conditions: the dead are refused first. */
export const PARADISE_HELL_BLOCK = "You can't just magically ascend from Hell!";

/**
 * paradise_ticket.js verbs.eat (every course ticket inherits it): 20 iMG
 * (stats_add_imagination, so spendable iMG only, never level XP) and 1 energy
 * per ticket eaten, plus one quip ("Yum!" listed twice so it is more common).
 */
export const PARADISE_TICKET_EAT = Object.freeze({
  imagination: 20,
  energy: 1,
  tooltip: 'Eat this to gain 20 iMG and 1 energy',
  quips: Object.freeze([
    'Yum!',
    'Hmm, slightly stale.',
    'Tastes like chicken!',
    'The paper got stuck in your teeth.',
    'Yum!',
    'You got a papercut on your tongue. Ouch!',
    'Mmm, not bad.',
    'Mmm, tasty.',
  ]),
});

/**
 * Eating has no conditions in the source (always enabled, Hell included).
 * metabolics_add_energy gives nothing to the dead or super pooped, so the
 * caller passes `energyAllowed: false` then; the iMG still lands.
 */
export function eatParadiseTicket({ count = 1, rng = Math.random, energyAllowed = true } = {}) {
  const n = Math.max(1, Math.floor(finite(count, 1)));
  const quips = PARADISE_TICKET_EAT.quips;
  const roll = Math.min(0.999999, Math.max(0, finite(rng(), 0)));
  return {
    count: n,
    imagination: PARADISE_TICKET_EAT.imagination * n,
    energy: energyAllowed ? PARADISE_TICKET_EAT.energy * n : 0,
    quip: quips[Math.floor(roll * quips.length)],
  };
}

export function quoteParadiseTicket(
  state,
  courseId,
  { imagination = 0, quoinMultiplier = 1, now = Date.now(), dead = false } = {}
) {
  const course = PARADISE_COURSES[courseId];
  if (!course) return { ok: false, reason: 'unknown_course', cost: 0, course: null };
  resetParadiseDay(state, now);
  const cost = paradiseTicketCost(quoinMultiplier);
  if (dead) return { ok: false, reason: 'dead', cost, course };
  if (state.ticketsToday >= PARADISE_DAILY_LIMIT) {
    return { ok: false, reason: 'daily_limit', cost, course };
  }
  if (finite(imagination, 0) < cost) {
    return { ok: false, reason: 'not_enough_imagination', cost, course };
  }
  return { ok: true, reason: 'ready', cost, course };
}

export function activateParadiseTicket(state, courseId, opts = {}) {
  const quote = quoteParadiseTicket(state, courseId, opts);
  if (!quote.ok) return quote;
  state.ticketsToday += 1;
  state.visits[courseId] = (state.visits[courseId] || 0) + 1;
  return {
    ...quote,
    ticketsToday: state.ticketsToday,
    visits: state.visits[courseId],
  };
}

export function createParadiseRun(courseId, {
  now = Date.now(),
  sourceLocation = null,
} = {}) {
  const course = PARADISE_COURSES[courseId];
  if (!course) return null;
  return {
    courseId,
    status: 'running',
    startedAt: now,
    expiresAt: now + PARADISE_DURATION_MS,
    sourceLocation: sourceLocation?.tsid
      ? {
          tsid: String(sourceLocation.tsid),
          x: finite(sourceLocation.x, 0),
          y: finite(sourceLocation.y, 0),
        }
      : null,
    collected: [],
    rings: [],
    rewardTotals: {},
    completionRewarded: false,
  };
}

export function paradiseRemainingMs(run, now = Date.now()) {
  if (!run || run.status !== 'running') return 0;
  return Math.max(0, finite(run.expiresAt, 0) - now);
}

export function expireParadiseRun(run, now = Date.now()) {
  if (!run || run.status !== 'running') {
    return { ok: false, reason: run?.status || 'missing', run };
  }
  if (paradiseRemainingMs(run, now) > 0) {
    return { ok: false, reason: 'time_remaining', run };
  }
  run.status = 'expired';
  return { ok: true, reason: 'expired', run };
}

function noteReward(run, rewardDef) {
  const key = rewardDef.type === 'favor' && rewardDef.giantId
    ? `favor:${rewardDef.giantId}`
    : rewardDef.type;
  run.rewardTotals[key] = (run.rewardTotals[key] || 0) + rewardDef.amount;
}

/**
 * A course reward as paid out. A Qurazy quoin pays the level-indexed iMG of
 * GSJS items/quoin.js:207-209 (config.qurazy_rewards[level - 1], no quoin
 * multiplier); it is paid as iMG and keeps `quoin: 'qurazy'` for its art.
 */
export function resolveParadiseReward(rewardDef, { level = 1 } = {}) {
  if (rewardDef?.type !== 'qurazy') return rewardDef;
  return Object.freeze({ type: 'xp', amount: qrazyRewardForLevel(level), giantId: null, quoin: 'qurazy' });
}

export function collectParadisePickup(run, index, now = Date.now(), { level = 1 } = {}) {
  const course = PARADISE_COURSES[run?.courseId];
  if (!run || !course) return { ok: false, reason: 'missing', run };
  if (paradiseRemainingMs(run, now) <= 0) {
    expireParadiseRun(run, now);
    return { ok: false, reason: 'expired', run };
  }
  const pickupIndex = Math.floor(finite(index, -1));
  if (pickupIndex < 0 || pickupIndex >= course.pickupCount) {
    return { ok: false, reason: 'invalid_pickup', run };
  }
  if (run.collected.includes(pickupIndex)) {
    return { ok: false, reason: 'already_collected', run };
  }
  const rewardDef = resolveParadiseReward(course.rewards[pickupIndex % course.rewards.length], { level });
  run.collected.push(pickupIndex);
  run.collected.sort((a, b) => a - b);
  noteReward(run, rewardDef);
  return { ok: true, reason: 'collected', reward: { ...rewardDef }, run };
}

export function passParadiseRing(run, index, now = Date.now()) {
  const course = PARADISE_COURSES[run?.courseId];
  if (!run || !course) return { ok: false, reason: 'missing', run };
  if (paradiseRemainingMs(run, now) <= 0) {
    expireParadiseRun(run, now);
    return { ok: false, reason: 'expired', run };
  }
  const ringIndex = Math.floor(finite(index, -1));
  if (ringIndex < 0 || ringIndex >= course.ringCount) {
    return { ok: false, reason: 'invalid_ring', run };
  }
  if (run.rings.includes(ringIndex)) {
    return { ok: false, reason: 'already_passed', run };
  }
  const rewardDef = reward('xp', course.ringRewards[ringIndex] || 120);
  run.rings.push(ringIndex);
  run.rings.sort((a, b) => a - b);
  noteReward(run, rewardDef);
  return { ok: true, reason: 'passed', reward: { ...rewardDef }, run };
}

export function paradiseObjectiveComplete(run) {
  const course = PARADISE_COURSES[run?.courseId];
  if (!run || !course) return false;
  return course.ringCount > 0
    ? run.rings.length >= course.ringCount
    : run.collected.length >= course.pickupCount;
}

export function paradiseRunProgress(run) {
  const course = PARADISE_COURSES[run?.courseId];
  if (!run || !course) {
    return { collected: 0, total: 0, rings: 0, ringTotal: 0, complete: false };
  }
  return {
    collected: cleanIndexes(run.collected, course.pickupCount).length,
    total: course.pickupCount,
    rings: cleanIndexes(run.rings, course.ringCount).length,
    ringTotal: course.ringCount,
    complete: paradiseObjectiveComplete(run),
  };
}

export function paradiseObjective(run) {
  const course = PARADISE_COURSES[run?.courseId];
  if (!course) return 'Activate a Ticket to Paradise';
  if (run.status === 'expired') return 'This Paradise has faded';
  if (run.status === 'complete') return course.completion;
  const progress = paradiseRunProgress(run);
  if (progress.complete) return 'The way home is open';
  if (course.ringCount) {
    return `${course.objective} · ${progress.rings}/${progress.ringTotal} rings`;
  }
  return `${course.objective} · ${progress.collected}/${progress.total}`;
}

export function finishParadiseRun(run, now = Date.now()) {
  const course = PARADISE_COURSES[run?.courseId];
  if (!run || !course) return { ok: false, reason: 'missing', run };
  if (run.status === 'complete') return { ok: false, reason: 'complete', run };
  if (run.status === 'expired') return { ok: false, reason: 'expired', run };
  if (paradiseRemainingMs(run, now) <= 0) {
    expireParadiseRun(run, now);
    return { ok: false, reason: 'expired', run };
  }
  if (!paradiseObjectiveComplete(run)) {
    return { ok: false, reason: 'objective_incomplete', run };
  }
  run.status = 'complete';
  const completionReward = run.completionRewarded ? null : { ...course.completionReward };
  if (completionReward) {
    noteReward(run, completionReward);
    run.completionRewarded = true;
  }
  return { ok: true, reason: 'complete', completionReward, run };
}
