/**
 * A street's Chickens, Butterflies and Batterflies in multiplayer: the rules the client needs to
 * share them with groddle-afternoon-server/objects_creatures.go. Pure: no DOM, no Pixi, no engine
 * (tests/street-creatures.test.js).
 *
 * In the original one npc_chicken, npc_butterfly or npc_batterfly item was the same animal for
 * everyone on the street. Online, every client now draws each street animal on the same path from
 * the server's clock, so two players see it in the same place without the server moving anything:
 *   - a Chicken walks to and fro across its spot (game.js spawnChickens: 100 px each way at
 *     0.5 px a frame, 30 px/s, the odd ones setting off left), stopping to stand or peck every
 *     6-14 s as the original did (chickenWalkAt, CHICKEN_PAUSE);
 *   - a resting Butterfly bobs on its perch (spawnButterflies: 0.04 a frame);
 *   - a flying Butterfly drifts across the whole street and back in from the far side
 *     (0.65 px a frame, 39 px/s, bobbing 14 px at 0.06 a frame), over the floor under it
 *     (flightFloor);
 *   - a Batterfly loops low over its spot (animal-husbandry-feature stepBatterfly), never lower
 *     over the floor under it than over its spot.
 * The server keeps when a path stood still: "lag" (ms held so far) and "hold" (ms it holds from
 * now), so the path's clock is the server's now minus lag, frozen while held. A verb that lands
 * holds it for everyone (the source stops an animal for the player at it, onWaitStart), and a
 * Chicken on an egg holds until it hatches.
 *
 * Carrying on from where it stopped (lane CHICKLOOP, Austin 2026-11-01: "I'm still seeing chickens
 * jump around. I think interacting with them messes with their loop"): the source's Chicken stops
 * where it stands while a player is at it and walks on from there (npc_chicken.js onWaitStart
 * 1635-1643 apiStopMoving, onWaitEnd 1626-1633 startMoving; its npc parts onInteractionStarting
 * 1986-1995, onInteractionEnding 1967-1973; squeeze 773-774 stopMoving, onSqueezeComplete
 * 1579-1585 startMoving). So the page:
 *   - keeps one clock for the street (clockOffset: the least delayed frame of the last 30 s, so a
 *     frame held up on the way no longer moves every animal back and forth);
 *   - keeps a hold's end on the server's clock (pathFrom), so an animal standing still stands
 *     still, whatever frame came in since;
 *   - draws a walker on its path, not a few px behind it (followPath: exact while the path moves
 *     at its walking pace, eased only to catch up after a real correction), so the place the menu
 *     stopped it is the place on its path;
 *   - tells the server where its screen stopped the animal ("at" on the wait, the path's clock), so
 *     the hold starts there for everyone, not a trip later (objects_creatures.go waitCreature).
 *
 * Ids are the spawn index, the same as the Rook's keys (js/rook-attack.js rookKeyFor):
 * chicken:<i>, butterfly:<i> (the resting ones, then the flyers), batterfly:<i> (husbandryKey).
 * Released and raised animals (husbandryAnimal) and the yard's stay each player's own.
 *
 * What is shared besides the path: a Chicken's egg and who owns it (incubatingEgg, with incubBy
 * when it is someone else's, so only the owner's game hatches it), how many times anyone squeezed,
 * massaged or milked it today (sharedSqueezes, sharedMassages, sharedMilks, for the label), and a
 * Batterfly's food counter (foodCounter). Each player's daily uses stay in their save, as in solo;
 * the server keeps its own count of them too and refuses past the limit.
 */

import { GAME_EPOCH_MS } from './game-day.js?v=edb00566';
import { INCUBATION } from './animal-husbandry.js?v=47d3c71c';
import { isStandable } from './street-model.js?v=505d8990';

export const CREATURE_KINDS = Object.freeze(['chicken', 'butterfly', 'batterfly']);

/** The remake's solo paths (game.js, at 60 frames a second), now on the shared clock. */
export const CREATURE_PATHS = Object.freeze({
  chicken: Object.freeze({ speed: 30, range: 100 }),
  rest: Object.freeze({ bob: 2.4, amp: 2 }),
  fly: Object.freeze({ speed: 39, bob: 3.6, amp: 14, margin: 40 }),
  batterfly: Object.freeze({ dx: 170 }),
});

/** Beyond this far from its path a sprite jumps there instead of easing (a flyer wrapping round). */
export const SNAP_PX = 260;

/** How long the street's clock remembers a frame (clockOffset), and how many frames at most. */
export const CLOCK_WINDOW_MS = 30000;
const CLOCK_SAMPLES = 64;

/**
 * The street's clock: server ms minus local ms. Each "objs" frame carries the server's "now"; a
 * frame that was held up on the way reads late, so the offset is the largest (the least delayed)
 * of the frames seen in the last CLOCK_WINDOW_MS. `samples` is the copy's list ([localMs, offset]
 * pairs), kept here. Returns the offset.
 */
export function clockOffset(samples, serverNow, localNow, windowMs = CLOCK_WINDOW_MS) {
  const off = Number(serverNow) - Number(localNow);
  if (!Number.isFinite(off)) return samples.length ? Math.max(...samples.map((s) => s[1])) : 0;
  samples.push([Number(localNow), off]);
  while (samples.length && (samples[0][0] < localNow - windowMs || samples.length > CLOCK_SAMPLES)) samples.shift();
  let best = -Infinity;
  for (const s of samples) if (s[1] > best) best = s[1];
  return best;
}

export function creatureId(kind, index) {
  return `${kind}:${index}`;
}

/** The street animal a target is (its id and kind), or null for anything else or your own animal. */
export function creatureOf(target) {
  if (!target || target.husbandryAnimal || target.packBaby) return null;
  if (target.classId === 'npc_batterfly') {
    const m = /^batterfly:(\d{1,2})$/.exec(String(target.husbandryKey || ''));
    return m ? { id: creatureId('batterfly', Number(m[1])), kind: 'batterfly', index: Number(m[1]) } : null;
  }
  if (target.featureId) return null;
  const kind = target.classId === 'npc_chicken' ? 'chicken' : target.classId === 'npc_butterfly' ? 'butterfly' : '';
  const i = Number(target.classIndex);
  if (!kind || !Number.isInteger(i) || i < 0 || i > 99) return null;
  return { id: creatureId(kind, i), kind, index: i };
}

/** The verbs that ask the server, per kind ("incubate:<egg>", "feed:<food>:<n>" by their base). */
export const CREATURE_VERBS = Object.freeze({
  chicken: Object.freeze(['squeeze', 'incubate']),
  butterfly: Object.freeze(['massage', 'milk']),
  batterfly: Object.freeze(['feed']),
});

/**
 * The street's clock as the client keeps it: offset is server ms minus local ms (clockOffset). An
 * animal's path time (ms) at local time `local`: frozen while it is held. holdEnd is on the
 * server's clock (pathFrom), so a held animal stands still whatever the offset does meanwhile.
 */
export function pathTime(path, local, offset = 0) {
  const lag = Math.max(0, Number(path?.lag) || 0);
  const holdEnd = Number(path?.holdEnd) || 0;
  // The server's path clock: (now < holdEnd ? holdEnd : now) - lag, where lag already counts the hold.
  return Math.max(local + offset, holdEnd) - lag - GAME_EPOCH_MS;
}

/** The path's clock as the server counts it (server ms minus lag), for the "at" of a wait. */
export function serverPathClock(path, local, offset = 0) {
  return Math.round(pathTime(path, local, offset) + GAME_EPOCH_MS);
}

function mod(a, n) {
  return ((a % n) + n) % n;
}

/** A Chicken's x and heading at path time t (ms): to and fro, range px each way of its spot. */
export function walkerAt({ baseX, range = CREATURE_PATHS.chicken.range, speed = CREATURE_PATHS.chicken.speed, dir = 1 }, t) {
  const r = Math.max(1, range);
  const s = mod((t / 1000) * speed + (dir < 0 ? 2 * r : 0), 4 * r);
  if (s < r) return { x: baseX + s, dir: 1 };
  if (s < 3 * r) return { x: baseX + 2 * r - s, dir: -1 };
  return { x: baseX + s - 4 * r, dir: 1 };
}

/**
 * A Chicken's pauses (lane CHICKWALK, Austin 2026-11-01: "Can you review the chickens? Their
 * walk/animation still isn't correct"). The original's Chicken, while players are on its street,
 * stops every 6-14 s (npc_chicken.js onPause 1216-1277: apiSetTimer('onPause', randInt(6000,
 * 14000)) 1272, from the start of the last pause), stands in one of pause_state_choices (1860-1869:
 * idle1, idle1, idle1, idle2, idle3 and pause for 4 s, pecking_twice for 3 s, pecking_once for
 * 2 s), turns round half the time (is_chance(0.5) turnAround, 1225-1228) and walks on
 * (startMoving after the pause's seconds, 1253-1256). At the end of its walk it turns and walks
 * straight back (onPathing 1168-1186). The remake has the walk and pecking_once sheets plus one
 * still: an idle holds idle1's first frame (game.js chickenStand, 'stand'), a peck plays
 * pecking_once ('peck').
 */
export const CHICKEN_PAUSE = Object.freeze({
  everyMs: Object.freeze([6000, 14000]),
  choices: Object.freeze([
    Object.freeze([4000, 'stand']),
    Object.freeze([4000, 'stand']),
    Object.freeze([4000, 'stand']),
    Object.freeze([4000, 'stand']),
    Object.freeze([4000, 'stand']),
    Object.freeze([4000, 'stand']),
    Object.freeze([3000, 'peck']),
    Object.freeze([2000, 'peck']),
  ]),
  turnChance: 0.5,
});

/** One onPause: how long it stands and how (pose), whether it turns round, and when the next one is. */
export function chickenPauseRoll(rng = Math.random) {
  const { choices, everyMs, turnChance } = CHICKEN_PAUSE;
  const [holdMs, pose] = choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))];
  const turn = rng() < turnChance;
  const nextMs = everyMs[0] + Math.min(everyMs[1] - everyMs[0], Math.floor(rng() * (everyMs[1] - everyMs[0] + 1)));
  return { holdMs, pose, turn, nextMs };
}

/** A small seeded random source (mulberry32): the same numbers on every player's page. */
export function seededRandom(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The pauses in one round of a shared Chicken's walk (chickenPlan). */
export const CHICKEN_PLAN_PAUSES = 8;

// A place on the to-and-fro loop (walkerAt's s, 0..4r) to its x and heading, and the same x heading the other way.
function loopAt(baseX, r, s) {
  if (s < r) return { x: baseX + s, dir: 1 };
  if (s < 3 * r) return { x: baseX + 2 * r - s, dir: -1 };
  return { x: baseX + s - 4 * r, dir: 1 };
}
function loopTurn(r, s) {
  if (s < r) return mod(2 * r - s, 4 * r);
  if (s < 3 * r) {
    const u = 2 * r - s;
    return u >= 0 ? u : 4 * r + u;
  }
  return mod(2 * r - (s - 4 * r), 4 * r);
}

const planCache = new Map();

/**
 * A shared Chicken's walk with the original's pauses, as one round that repeats: CHICKEN_PLAN_PAUSES
 * pauses rolled from `seed` (chickenPauseRoll on seededRandom), each after its 6-14 s, then a walk
 * on to where the round began (its spot, heading the way it set off), so the next round carries on
 * from there without a jump. Every page with the same home and seed gets the same round. Returns
 * { ms, r, v, segs }: segs are { at, ms, s, pose } (walk: from loop place s at v px/ms; a pause
 * stands at s).
 */
export function chickenPlan({ baseX = 0, range = CREATURE_PATHS.chicken.range, speed = CREATURE_PATHS.chicken.speed, dir = 1 } = {}, seed = 1) {
  const r = Math.max(1, range);
  const key = `${baseX}|${r}|${speed}|${dir < 0 ? -1 : 1}|${seed}`;
  const hit = planCache.get(key);
  if (hit) return hit;
  const v = speed / 1000;
  const loop = 4 * r;
  const rng = seededRandom(seed);
  const start = dir < 0 ? 2 * r : 0;
  const segs = [];
  let at = 0;
  let s = start;
  let held = 0;
  let next = chickenPauseRoll(rng).nextMs;
  for (let k = 0; k < CHICKEN_PLAN_PAUSES; k += 1) {
    const roll = chickenPauseRoll(rng);
    const walk = Math.max(0, next - held);
    segs.push({ at, ms: walk, s, pose: 'walk' });
    at += walk;
    s = mod(s + v * walk, loop);
    segs.push({ at, ms: roll.holdMs, s, pose: roll.pose });
    at += roll.holdMs;
    if (roll.turn) s = loopTurn(r, s);
    held = roll.holdMs;
    next = roll.nextMs;
  }
  // On to where the round began, the way it set off.
  const back = mod(start - s, loop) / v;
  segs.push({ at, ms: back, s, pose: 'walk' });
  at += back;
  const plan = Object.freeze({ ms: at, r, v, segs });
  if (planCache.size > 256) planCache.clear();
  planCache.set(key, plan);
  return plan;
}

/**
 * A shared Chicken at path time t (ms): x, heading and pose ('walk', 'stand', 'peck') on its
 * chickenPlan round. A pause that turns it shows the new heading when it walks on.
 */
export function chickenWalkAt(home, t, seed = 1) {
  const plan = chickenPlan(home, seed);
  const baseX = home?.baseX ?? 0;
  if (!(plan.ms > 0)) return { ...loopAt(baseX, plan.r, 0), pose: 'walk' };
  const tc = mod(Number(t) || 0, plan.ms);
  let seg = plan.segs[0];
  for (const g of plan.segs) {
    if (g.at > tc) break;
    seg = g;
  }
  if (seg.pose !== 'walk') return { ...loopAt(baseX, plan.r, seg.s), pose: seg.pose };
  return { ...loopAt(baseX, plan.r, mod(seg.s + plan.v * (tc - seg.at), 4 * plan.r)), pose: 'walk' };
}

/** The seed a street's Chicken rolls its pauses from: its spawn index and spot, the same on every page. */
export function chickenSeed(index, baseX) {
  return ((Math.imul((Number(index) || 0) + 1, 2654435761) ^ Math.round(Number(baseX) || 0)) >>> 0) || 1;
}

/**
 * The floor a flier keeps above (player report of 2026-11-01, a Butterfly under the ground on
 * Middle Arbor). The original flies a Butterfly in the 200 px above the street's floor
 * (npc_butterfly.js flyAround 886-969: floor = geo.ground_y or geo.b, apiStartFlyingInTheArea(l,
 * floor - 200, w, 200)) and a Batterfly in the 400 px above it (npc_batterfly.js flyAround
 * 1039-1052). That floor is one height for the whole street, and the remake's streets slope and
 * step (Middle Arbor climbs 260 px from right to left), so a flier at one height across the street
 * went into the ground where the floor rose. The remake keeps the band but measures it from the
 * floor under the flier:
 *   - the floor at x (floorUnder) is the walkable line (street-model.js isStandable) nearest the
 *     top among the lines at x no more than `band` (the original's 200 px) above the ground there
 *     (the lowest line within `ground` px): a hill drawn over a lower line counts, a branch or an
 *     upper ledge high over the ground does not. A line ending within `join` px of x is under it
 *     (street-ecology.js FLOOR_JOIN_PX: the source's floors meet with a few pixels between them);
 *   - each pixel then takes the highest floor within `reach` px either side, then the mean over
 *     `ease` px either side (ease <= reach), so the path rises before a step instead of at it and
 *     never comes below the floor within `ease` px of it (a flier's half width is under 50 px).
 * A gap with no floor (a pit, past the street's ends) takes the higher of the floors beside it.
 */
export const FLIGHT_FLOOR = Object.freeze({ band: 200, join: 6, ground: 24, reach: 120, ease: 60 });

/**
 * How high each planned flier flies over that floor, and how far its art reaches below its point
 * (the sprite's anchor to its bottom edge, at its drawn scale), for tests/flier-floor.test.js:
 *   - a street Butterfly (game.js spawnButterflies): 90 px up, 22 more for every second and third
 *     one (j % 3), bobbing 14 px; the fly-side sheet is 70x65 at ENTITY_SCALE.butterflyFly
 *     (1.35 x 0.52), anchored at its centre;
 *   - a Batterfly (animal-husbandry-feature buildBatterfly): 150 px up, looping 170 px each way and
 *     up to 60 px up and down (stepBatterfly); the profile sheet is 111x96 at 0.82, anchored at
 *     0.62 of its height.
 */
export const FLIER_LIFT = Object.freeze({
  butterfly: Object.freeze({ lift: 90, perRow: 22, amp: 14, halfW: 70 * 0.702 / 2, below: 65 * 0.702 / 2 }),
  batterfly: Object.freeze({ lift: 150, dx: 170, amp: 60, halfW: 111 * 0.82 / 2, below: 96 * 0.82 * 0.38 }),
});

/** A street Butterfly's height over the floor: the j-th flyer (game.js spawnButterflies). */
export function flyerLift(j) {
  const b = FLIER_LIFT.butterfly;
  return b.lift + (Math.abs(Math.trunc(Number(j) || 0)) % 3) * b.perRow;
}

function lineYAt(p, x) {
  const dx = p.x2 - p.x1;
  const cx = Math.max(p.x1, Math.min(p.x2, x));
  if (Math.abs(dx) < 1e-6) return Math.min(p.y1, p.y2);
  return p.y1 + ((cx - p.x1) / dx) * (p.y2 - p.y1);
}

function flightLines(platforms) {
  return (platforms || [])
    .filter((p) => p && [p.x1, p.y1, p.x2, p.y2].every(Number.isFinite) && isStandable(p))
    .map((p) => (p.x1 <= p.x2 ? p : { ...p, x1: p.x2, y1: p.y2, x2: p.x1, y2: p.y1 }));
}

/**
 * The floor under x, exactly (no smoothing; see FLIGHT_FLOOR), or null where there is none.
 * tests/flier-floor.test.js checks every flier against it.
 */
export function floorUnder(platforms, x, { lines = flightLines(platforms), ...opts } = {}) {
  const { band, join, ground } = { ...FLIGHT_FLOOR, ...opts };
  let lowest = -Infinity;
  const at = [];
  for (const p of lines) {
    if (x < p.x1 - ground || x > p.x2 + ground) continue;
    const y = lineYAt(p, x);
    if (y > lowest) lowest = y;
    if (x >= p.x1 - join && x <= p.x2 + join) at.push(y);
  }
  let top = null;
  for (const y of at) if (y >= lowest - band && (top == null || y < top)) top = y;
  return top;
}

/** floorUnder at every whole pixel 0..worldW (null over a gap). */
export function floorProfile(platforms, worldW, opts = {}) {
  const { join, ground } = { ...FLIGHT_FLOOR, ...opts };
  const lines = flightLines(platforms);
  const n = Math.max(1, Math.ceil(Number(worldW) || 0) + 1);
  // Lines by 64 px column, so each pixel reads only the lines near it.
  const col = 64;
  const cols = Array.from({ length: Math.ceil(n / col) + 1 }, () => []);
  const pad = Math.max(join, ground);
  for (const p of lines) {
    const a = Math.max(0, Math.floor((p.x1 - pad) / col));
    const b = Math.min(cols.length - 1, Math.floor((p.x2 + pad) / col));
    for (let c = a; c <= b; c += 1) cols[c].push(p);
  }
  const row = new Array(n);
  for (let x = 0; x < n; x += 1) row[x] = floorUnder(null, x, { ...opts, lines: cols[Math.floor(x / col)] });
  return row;
}

/** The smoothed floor fliers keep above, for a street (see FLIGHT_FLOOR), or null with no floor. */
export function flightFloor(platforms, worldW, opts = {}) {
  const { reach, ease } = { ...FLIGHT_FLOOR, ...opts };
  const raw = floorProfile(platforms, worldW, opts);
  const n = raw.length;
  if (!raw.some((y) => y != null)) return null;
  // The highest floor within reach either side (smaller y is higher): a sliding minimum.
  const r = Math.max(0, Math.round(reach));
  const env = new Array(n).fill(null);
  const queue = [];
  let head = 0;
  for (let k = 0; k < n + r; k += 1) {
    if (k < n && raw[k] != null) {
      while (queue.length > head && raw[queue[queue.length - 1]] >= raw[k]) queue.pop();
      queue.push(k);
    }
    const i = k - r;
    if (i < 0) continue;
    while (queue.length > head && queue[head] < i - r) head += 1;
    env[i] = queue.length > head ? raw[queue[head]] : null;
  }
  // A wide gap: the higher of the floors beside it.
  let last = null;
  const fromLeft = env.map((v) => (v == null ? last : (last = v)));
  last = null;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (env[i] != null) {
      last = env[i];
      continue;
    }
    const a = fromLeft[i];
    env[i] = a == null ? last : last == null ? a : Math.min(a, last);
  }
  // The mean over ease either side (ease <= reach keeps it under the floor).
  const e = Math.max(0, Math.min(r, Math.round(ease)));
  const sums = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) sums[i + 1] = sums[i] + env[i];
  const ys = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = Math.max(0, i - e);
    const b = Math.min(n - 1, i + e);
    ys[i] = (sums[b + 1] - sums[a]) / (b - a + 1);
  }
  return { step: 1, ys };
}

const floorCache = new WeakMap();

/** flightFloor, kept per platforms array (a street's lines; game.js and the features share it). */
export function flightFloorFor(platforms, worldW) {
  if (!platforms || typeof platforms !== 'object') return null;
  const hit = floorCache.get(platforms);
  if (hit && hit.worldW === worldW && hit.count === platforms.length) return hit.floor;
  const floor = flightFloor(platforms, worldW);
  floorCache.set(platforms, { worldW, count: platforms.length, floor });
  return floor;
}

/** The smoothed floor's y at x (clamped to the street's ends), or null without a floor. */
export function flightFloorAt(floor, x) {
  if (!floor?.ys?.length || !Number.isFinite(x)) return null;
  const { step, ys } = floor;
  const f = Math.max(0, Math.min(ys.length - 1, x / step));
  const i = Math.floor(f);
  const j = Math.min(ys.length - 1, i + 1);
  return ys[i] + (ys[j] - ys[i]) * (f - i);
}

/**
 * A flying Butterfly at path time t: across the street and back in from the far side, `lift` px
 * over the floor under it (flightFloor) when the street has one, else at baseY.
 */
export function flyerAt({ x0, baseY, worldW, phase0 = 0, floor = null, lift = FLIER_LIFT.butterfly.lift }, t) {
  const f = CREATURE_PATHS.fly;
  const span = Math.max(1, worldW + 2 * f.margin);
  const x = mod(x0 + f.margin + (t / 1000) * f.speed, span) - f.margin;
  const under = flightFloorAt(floor, x);
  const mid = under == null ? baseY : under - lift;
  return { x, y: mid + Math.sin(phase0 + (t / 1000) * f.bob) * f.amp, dir: 1 };
}

/** A resting Butterfly's y at path time t (it bobs where it sits). */
export function restAt({ groundY, phase0 = 0 }, t) {
  const r = CREATURE_PATHS.rest;
  return { y: groundY + 2 + Math.sin(phase0 + (t / 1000) * r.bob) * r.amp };
}

/**
 * A Batterfly's middle height at x: its own (150 px over the line it was placed on), but never
 * less than 150 px over the floor under it (flightFloor), so a loop over rising ground rises too.
 */
export function batterflyBaseY(baseY, floor, x) {
  const under = flightFloorAt(floor, x);
  if (under == null) return baseY;
  const over = under - FLIER_LIFT.batterfly.lift;
  return Number.isFinite(baseY) ? Math.min(baseY, over) : over;
}

/** A Batterfly at path time t: lazy loops in the lower part of the street (stepBatterfly). */
export function batterflyAt({ baseX, baseY, phase0 = 0, floor = null }, t) {
  const phase = phase0 + t / 1000;
  const x = baseX + Math.sin(phase * 0.35) * CREATURE_PATHS.batterfly.dx;
  return {
    x,
    y: batterflyBaseY(baseY, floor, x) + Math.sin(phase * 0.9) * 26 + Math.cos(phase * 0.21) * 34,
    dir: Math.cos(phase * 0.35) >= 0 ? 1 : -1,
  };
}

/** Ease a coordinate toward its path (dt in 60 fps frames); far off, jump. */
export function easeToward(current, target, dt = 1) {
  const d = target - current;
  if (!Number.isFinite(d) || Math.abs(d) > SNAP_PX || Math.abs(d) < 0.3) return target;
  return current + d * Math.min(1, 0.12 * Math.max(0, dt));
}

/**
 * The most a path moves in a frame (px at 60 fps), per kind: a Chicken walks 0.5 px a frame, a
 * flyer drifts 0.65 px and bobs under 0.9 px; a little over, for a slow frame's rounding.
 */
export const PATH_STEP = Object.freeze({ chicken: 0.8, fly: 1.2 });

/**
 * A sprite on its path: where the path moved no more than its walking pace this frame, the sprite
 * is on it (no trailing a few px behind, so it stops, turns and walks on where the path does).
 * Further off (the path was corrected, a hold began where another screen stopped it, the Rook let
 * it go) it goes its walking pace plus a tenth of the gap a frame, so it closes the gap and is on
 * its path again in a second or so (a plain ease would trail a walking path by 4 px for good), and
 * jumps when far off.
 */
export function followPath(current, target, dt = 1, step = PATH_STEP.chicken) {
  const d = target - current;
  const f = Math.max(1, Number(dt) || 1);
  if (!Number.isFinite(d) || Math.abs(d) > SNAP_PX || Math.abs(d) <= step * f) return target;
  return current + Math.sign(d) * Math.min(Math.abs(d), step * f + Math.abs(d) * Math.min(1, 0.1 * f));
}

/**
 * The path a target follows, from its server state (lag, hold) received at local time `at`: the
 * hold's end is kept on the server's clock, from the frame's own "now" when it had one
 * (`serverNow`), else from the street's clock offset then.
 */
export function pathFrom(s, at = Date.now(), offset = 0, serverNow = 0) {
  const hold = Math.max(0, Number(s?.hold) || 0);
  const base = Number(serverNow) > 0 ? Number(serverNow) : at + (Number(offset) || 0);
  return { lag: Math.max(0, Number(s?.lag) || 0), holdEnd: hold > 0 ? base + hold : 0 };
}

function count(v) {
  const n = Math.floor(Number(v) || 0);
  return n > 0 ? n : 0;
}

/**
 * Put the server's word on a street animal's saved state (s: its state as the server sent it,
 * null when fresh). Only the shared fields move; each player's own daily uses stay theirs. `me` is
 * this player's id: an egg someone else owns is marked incubBy, and this player's own egg is never
 * cleared here (their game hatches it at its own 60 s; the server's "hatched" or "lost" settles it).
 */
export function applyCreatureState(classId, state, s, { me = 0, now = Date.now() } = {}) {
  if (!state) return state;
  if (classId === 'npc_chicken') {
    state.sharedSqueezes = count(s?.sq);
    const inc = s?.inc && typeof s.inc === 'object' ? s.inc : null;
    if (inc && INCUBATION.hatches[inc.egg]) {
      const left = Math.max(0, Math.min(INCUBATION.completeMs, Number(inc.in) || 0));
      state.incubatingEgg = inc.egg;
      state.incubationStartedAt = now - (INCUBATION.completeMs - left);
      if (Number(inc.by) && Number(inc.by) !== Number(me)) state.incubBy = Number(inc.by);
      else delete state.incubBy;
    } else if (state.incubBy) {
      // Someone else's egg hatched or was lost: the Chicken is free again.
      delete state.incubatingEgg;
      delete state.incubationStartedAt;
      delete state.incubationHalfwaySaid;
      delete state.incubBy;
    }
  } else if (classId === 'npc_butterfly') {
    state.sharedMassages = count(s?.ms);
    state.sharedMilks = count(s?.mk);
  } else if (classId === 'npc_batterfly') {
    state.foodCounter = count(s?.food);
  }
  return state;
}

/** The label a street animal shows online: the street's count when others did more than you. */
export function sharedCreatureLabel(classId, state = {}) {
  if (classId === 'npc_chicken') {
    if (state.incubBy && state.incubatingEgg) return 'Sitting on an egg';
    const n = Math.max(count(state.squeezeUsesToday), count(state.sharedSqueezes));
    return n ? `Squeezed ${n}× today · still suspicious` : '';
  }
  if (classId === 'npc_butterfly') {
    const milked = Math.max(count(state.milkUsesToday), count(state.sharedMilks));
    if (milked) return `Milked ${milked}× today · resting in higher planes`;
    const massaged = Math.max(count(state.massageUsesToday), count(state.sharedMassages));
    return massaged ? `Massaged ${massaged}× today · ready for milking` : '';
  }
  return '';
}

/** npc_batterfly.js feed 803-824: which reply set a Guano count says. */
export function batterflyResponseFor(guano) {
  const n = count(guano);
  if (n >= 3) return 'feed_drops_3';
  if (n === 2) return 'feed_drops_2';
  if (n === 1) return 'feed_drops_1';
  return 'feed_no_guano';
}

/** The bonus Guano cards the server reads a feed's Guano from (perks). */
export function batterflyPerks(upgrades = []) {
  const owned = new Set(upgrades || []);
  const out = [];
  if (owned.has('batterfly_bonus_guano')) out.push('guano1');
  if (owned.has('batterfly_bonus_guano_2')) out.push('guano2');
  return out;
}
