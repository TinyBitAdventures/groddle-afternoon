/**
 * How your own animals wander (ticket 99, 2026-11-04: "I captured 3 pigs, and released them in my
 * yard. After I put up the Pig Stick, they all walked together in the exact same space, so it
 * looked like one piggy ... I hatched one butterfly, and then another ... they are also stacked
 * (glued together) and interacting with them doesn't make them pause"). Pure: no DOM, no Pixi, no
 * engine (tests/yard-wander.test.js).
 *
 * Released, hatched and grown Piggies, Chickens and Butterflies (animal-husbandry-feature extras,
 * and their copies on a visit, yard-verbs-mp-feature) used to share one walk: the same speed and
 * heading for every animal (from the length of its id, "a1".."a9" all 2), the same flight phase for
 * every Butterfly, and with a Magic Stick placed the same window for all, so animals clamped to its
 * edge stood on one spot and walked as one from then on.
 *
 * In the original each animal walked on its own (npc_piggy.js onCreate 1442: npc_walk_speed
 * randInt(30, 55); parent_startMoving 2605-2700: inside a Magic Stick's move_limits it walks to a
 * random x, randInt(left, x - 25) going left or randInt(x + 25, right) going right, and turns round
 * when it gets there, onPathing 1687-1692; startMoving 1226-1245 roots every randInt(2, 6) s by a
 * stick, randInt(3, 10) s without: onRooting 1140-1155 stands 5 s looking at you 30% of the time,
 * else sniffs 3 s; npc_chicken.js onPause 1216-1277: stands or pecks 2-4 s, startMovingLimited
 * 1765-1840 inside a stick's limits; npc_butterfly.js flyAround 885-946: each one flies at random in
 * the 200 px band over the floor, inside its stick's limits). A player at an animal stops that one
 * (npc.js onInteractionStarting, npc_butterfly.js onWaitStart 1513-1522 apiStopMoving; a piggy
 * walks on 5 s after a pet or nibble, npc_piggy.js 682, 903).
 *
 * Here each animal has its own walk, rolled from a seed of its id and class (the same on every page,
 * across reloads, for you and for a visitor): its own speed, starting place and heading, legs to
 * random places inside its window with the source's turn at the end of each, and the source's
 * pauses between them. The walk is one round that repeats and starts at its own offset, so two
 * animals never share a path. Its window is its Magic Stick's (the stick's x, distance each way),
 * else its own spot (where it was released or hatched, homeX) with a seeded nudge, the remake's
 * 110 px each way. The path's clock is the wall clock (path time from GAME_EPOCH_MS), so every
 * viewer draws it at the same place.
 *
 * Drawing (followYardPath): the sprite is drawn on its path, and when it is away from it (loaded
 * from an old stacked save, just released, just let go after a pet, the stick moved) it walks there
 * at a little over its own pace instead of jumping, so a stacked yard spreads out calmly. A player
 * at the animal (its verb menu open or a verb on it) holds that one animal only, and it stands a
 * moment longer after (YARD_LINGER_MS); then it walks back onto its path.
 */

import { GAME_EPOCH_MS } from './game-day.js?v=f88e6e16';
import { chickenPauseRoll, seededRandom } from './street-creatures.js?v=cef735cd';

/** Speeds (px/s), pauses and windows per class. */
export const YARD_WANDER = Object.freeze({
  // npc_piggy.js 1442 randInt(30, 55); onRooting 1140-1155: 30% look 5 s, else sniff 3 s.
  npc_piggy: Object.freeze({ speed: Object.freeze([30, 55]), pauses: Object.freeze([[0.3, 5000], [1, 3000]]) }),
  // npc_chicken.js 1016 walks 45 px/s; the remake's Chickens walk 30 (js/street-creatures.js CREATURE_PATHS).
  npc_chicken: Object.freeze({ speed: Object.freeze([30, 45]), pauses: 'chicken' }),
  // npc_butterfly.js flyAround: flies on at random; the remake's flyers drift 39 px/s and hover a moment.
  npc_butterfly: Object.freeze({ speed: Object.freeze([30, 50]), pauses: Object.freeze([[1, 900, 2400]]), lift: Object.freeze([70, 120]), bob: 14 }),
});

/** The remake's own window without a stick (animal-husbandry-feature stepExtra: 110 px each way of its spot). */
export const YARD_RANGE = 110;
/** How far a stickless window's middle moves from the spot (seeded), so animals released on one spot spread. */
export const YARD_NUDGE = 45;
/** Kept off the street's ends (stepExtra's 30 px). */
export const YARD_EDGE = 30;
/** Legs in one round of a walk (then it walks back to where the round began). */
export const YARD_LEGS = 12;
/** The source's turn: the next place is at least this far on (npc_piggy.js 2675 x - 25, 2697 x + 25). */
export const YARD_MIN_STEP = 25;
/** After a player was at it, it stands this long before walking on (npc_piggy.js 682, 903: 5 s). */
export const YARD_LINGER_MS = Object.freeze({ npc_piggy: 5000, npc_chicken: 2500, npc_butterfly: 1500 });
/** Back onto its path at this times its own pace (calm, not a jump). */
export const YARD_CATCH_UP = 1.6;
/** Farther than this from its path, it is put there (a stick placed across the street). */
export const YARD_SNAP_PX = 1400;
/** Spawn spots: another animal of the class within this many px is "on top of" it. */
export const YARD_SPAWN_GAP = 40;

/** Which animals a placed Magic Stick holds (js/animal-husbandry.js MAGIC_STICKS). */
export const STICK_ANIMAL = Object.freeze({
  magic_pig_stick: 'npc_piggy',
  magic_chicken_stick: 'npc_chicken',
  magic_butterfly_stick: 'npc_butterfly',
});

/** The placed stick ({ classTsid, x, distance }) that holds this class, or null. */
export function stickForClass(sticks, classId) {
  return (Array.isArray(sticks) ? sticks : []).find((k) => k && STICK_ANIMAL[k.classTsid] === classId && Number.isFinite(Number(k.x))) || null;
}

function mod(a, n) {
  return ((a % n) + n) % n;
}

/** FNV-1a over a string: a 32-bit seed. */
export function hashSeed(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0 || 1;
}

/** One animal's seed: its id and class, the same on every page (owner and visitors). */
export function yardSeed(id, classId) {
  return hashSeed(`yard:${classId}:${id}`);
}

/**
 * The x window an animal wanders in: its stick's (x ± distance), else its spot's (homeX + a seeded
 * nudge, ± YARD_RANGE). Kept inside the street, shifted rather than shrunk where it meets an end
 * (npc_piggy.js parent_startMoving 2628-2655 shifts the limits into the level).
 */
export function yardWindow({ id = '', classId = '', homeX = 0, stick = null, worldW = 0 } = {}) {
  let center;
  let range;
  if (stick && Number.isFinite(Number(stick.x))) {
    center = Number(stick.x);
    range = Math.max(20, Number(stick.distance) || 250);
  } else {
    const nudge = (seededRandom(yardSeed(id, classId) ^ 0x9e3779b9)() * 2 - 1) * YARD_NUDGE;
    center = (Number(homeX) || 0) + nudge;
    range = YARD_RANGE;
  }
  let left = center - range;
  let right = center + range;
  const maxX = Number(worldW) > 2 * YARD_EDGE ? Number(worldW) - YARD_EDGE : Infinity;
  if (right - left > maxX - YARD_EDGE) {
    left = YARD_EDGE;
    right = maxX;
  } else if (left < YARD_EDGE) {
    right += YARD_EDGE - left;
    left = YARD_EDGE;
  } else if (right > maxX) {
    left -= right - maxX;
    right = maxX;
  }
  return { left: Math.round(left), right: Math.round(right) };
}

function pauseRoll(classId, rng) {
  const spec = YARD_WANDER[classId] || YARD_WANDER.npc_piggy;
  if (spec.pauses === 'chicken') return chickenPauseRoll(rng).holdMs;
  const roll = rng();
  const row = spec.pauses.find((p) => roll < p[0]) || spec.pauses[spec.pauses.length - 1];
  return row.length > 2 ? Math.round(row[1] + rng() * (row[2] - row[1])) : row[1];
}

const planCache = new Map();

/**
 * One animal's walk inside [left, right], as a round that repeats: YARD_LEGS legs, each to a random
 * place at least YARD_MIN_STEP on in its heading (turning round where there is no room) and a
 * pause, then back to where it began. Returns { ms, speed, offset, lift, phase, segs } with segs
 * { at, ms, x, tx, pose: 'walk'|'stand' } (a Chicken's stand also has idle: its state) and speed in px/ms.
 */
export function yardPlan({ id = '', classId = 'npc_piggy', left = 0, right = 220 } = {}) {
  const key = `${classId}|${id}|${left}|${right}`;
  const hit = planCache.get(key);
  if (hit) return hit;
  const spec = YARD_WANDER[classId] || YARD_WANDER.npc_piggy;
  const rng = seededRandom(yardSeed(id, classId));
  const speed = (spec.speed[0] + rng() * (spec.speed[1] - spec.speed[0])) / 1000;
  const lo = Math.min(left, right);
  const hi = Math.max(left, right);
  const x0 = lo + rng() * (hi - lo);
  let dir = rng() < 0.5 ? -1 : 1;
  const lift = spec.lift ? spec.lift[0] + rng() * (spec.lift[1] - spec.lift[0]) : 0;
  const phase = rng() * Math.PI * 2;
  const segs = [];
  let at = 0;
  let x = x0;
  for (let k = 0; k < YARD_LEGS; k += 1) {
    if (dir < 0 && x - YARD_MIN_STEP <= lo) dir = 1;
    else if (dir > 0 && x + YARD_MIN_STEP >= hi) dir = -1;
    const tx = dir < 0
      ? lo + rng() * Math.max(0, x - YARD_MIN_STEP - lo)
      : x + YARD_MIN_STEP + rng() * Math.max(0, hi - x - YARD_MIN_STEP);
    const nx = Math.min(hi, Math.max(lo, tx));
    const walk = Math.abs(nx - x) / speed;
    segs.push({ at, ms: walk, x, tx: nx, pose: 'walk' });
    at += walk;
    x = nx;
    // A Chicken's pause keeps the state the same roll picked (npc_chicken.js pause_state_choices,
    // js/chicken-idles.js); the numbers drawn, and so the walk, are what they were.
    const roll = spec.pauses === 'chicken' ? chickenPauseRoll(rng) : null;
    const hold = roll ? roll.holdMs : pauseRoll(classId, rng);
    segs.push(roll ? { at, ms: hold, x, tx: x, pose: 'stand', idle: roll.pose } : { at, ms: hold, x, tx: x, pose: 'stand' });
    at += hold;
    // onPathing 1687-1692: at its place it turns round and sets off again.
    dir = -dir;
  }
  const back = Math.abs(x0 - x) / speed;
  segs.push({ at, ms: back, x, tx: x0, pose: 'walk' });
  at += back;
  const offset = Math.floor(rng() * at);
  const plan = Object.freeze({ ms: at, speed, offset, lift, phase, segs: Object.freeze(segs) });
  if (planCache.size > 512) planCache.clear();
  planCache.set(key, plan);
  return plan;
}

/** Path time now (ms since the game's epoch): the same clock on every page. */
export function yardPathTime(nowMs = Date.now()) {
  return Number(nowMs) - GAME_EPOCH_MS;
}

/**
 * Where an animal is on its walk at path time t: { x, dir, pose, lift, bob } (lift and bob for a
 * Butterfly: px over the floor, and its bob now). `animal` is { id, classId, homeX, stick, worldW }.
 */
export function yardWanderAt(animal, t) {
  const win = yardWindow(animal);
  const plan = yardPlan({ id: animal.id, classId: animal.classId, left: win.left, right: win.right });
  const spec = YARD_WANDER[animal.classId] || {};
  const tc = mod((Number(t) || 0) + plan.offset, plan.ms || 1);
  let seg = plan.segs[0];
  for (const g of plan.segs) {
    if (g.at > tc) break;
    seg = g;
  }
  const u = seg.ms > 0 ? Math.min(1, (tc - seg.at) / seg.ms) : 1;
  const x = seg.x + (seg.tx - seg.x) * u;
  // Standing, it faces the way it walked in (the next leg turns it).
  const i = plan.segs.indexOf(seg);
  const walkSeg = seg.pose === 'walk' ? seg : plan.segs[i - 1] || seg;
  const dir = walkSeg.tx >= walkSeg.x ? 1 : -1;
  const bob = spec.bob ? Math.sin(((Number(t) || 0) / 1000) * 1.3 + plan.phase) * spec.bob : 0;
  const at = { x, dir, pose: seg.pose, lift: plan.lift, bob, speed: plan.speed };
  // A Chicken standing: which of the original's states, and how far into it.
  if (seg.idle) {
    at.idle = seg.idle;
    at.poseMs = tc - seg.at;
  }
  return at;
}

/**
 * A spot for a new animal near x that is not on top of another of its class (`others`: their xs):
 * x itself if free, else the nearest of x ± 45, ± 90, ... that is, inside [min, max].
 */
export function freeYardSpot(x, others = [], { gap = YARD_SPAWN_GAP, min = 60, max = Infinity } = {}) {
  const taken = (others || []).map(Number).filter(Number.isFinite);
  const clamp = (v) => Math.round(Math.min(max, Math.max(min, v)));
  const free = (v) => taken.every((o) => Math.abs(o - v) >= gap);
  const step = gap + 5;
  for (let k = 0; k <= 12; k += 1) {
    for (const side of k ? [1, -1] : [0]) {
      const v = clamp(x + side * k * step);
      if (free(v)) return v;
    }
  }
  return clamp(x);
}

/**
 * Move a sprite along its walk for one frame (both renderers call it). `drive` is the animal's
 * runtime record ({ holdUntil, wasHeld }, kept between frames); `opts`:
 *   animal   { id, classId, homeX, stick, worldW }
 *   nowMs    the wall clock now, dtMs the frame
 *   held     a player is at it now (its menu open, a verb on it, its own action playing)
 *   groundAt (x, y) => the floor's y at x
 * Returns { x, y, dir, pose, moving } as drawn (and, for a Chicken standing on its path, idle and
 * poseMs: its state and how far in), and sets spr.x, spr.y and the facing (spr.scale.x, walk art
 * facing right: unflipped going right).
 */
export function followYardPath(spr, drive, { animal, nowMs = Date.now(), dtMs = 16.67, held = false, groundAt = () => 0 } = {}) {
  const linger = YARD_LINGER_MS[animal.classId] || 2000;
  const fly = animal.classId === 'npc_butterfly';
  const curY = Number(spr.y) || 0;
  if (held || nowMs < (Number(drive.holdUntil) || 0)) {
    if (held) drive.holdUntil = nowMs + linger;
    return { x: spr.x, y: curY, dir: Math.sign(spr.scale?.x) || 1, pose: 'stand', moving: false };
  }
  const at = yardWanderAt(animal, yardPathTime(nowMs));
  const dx = at.x - spr.x;
  const step = at.speed * Math.max(0, dtMs);
  let x;
  let dir = at.dir;
  let pose = at.pose;
  if (!Number.isFinite(spr.x) || Math.abs(dx) > YARD_SNAP_PX) {
    x = at.x;
  } else if (Math.abs(dx) <= step * 1.05 + 0.5) {
    x = at.x;
  } else {
    // Off its path: walk there at a little over its own pace.
    x = spr.x + Math.sign(dx) * Math.min(Math.abs(dx), step * YARD_CATCH_UP);
    dir = dx >= 0 ? 1 : -1;
    pose = 'walk';
  }
  const floor = groundAt(x, curY);
  let y;
  if (fly) {
    const want = floor - at.lift + at.bob;
    // Eased, so a new height (a hold let go, a step in the floor) is flown to, not jumped to.
    y = Number.isFinite(Number(spr.y)) ? curY + (want - curY) * Math.min(1, 0.08 * (dtMs / 16.67)) : want;
  } else {
    y = floor + 2;
  }
  spr.x = x;
  spr.y = y;
  if (spr.scale && Number.isFinite(spr.baseScale)) spr.scale.x = Math.abs(spr.baseScale) * (dir >= 0 ? 1 : -1);
  const out = { x, y, dir, pose, moving: pose === 'walk' };
  if (pose !== 'walk' && at.idle) {
    out.idle = at.idle;
    out.poseMs = at.poseMs;
  }
  return out;
}
