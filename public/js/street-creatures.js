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
 * Street Piggies walk a shared path the same way (G334, Austin 2026-11-07): to and fro round their
 * spot with the original's rooting stops, rolled from a seed every page shares (piggyWalkAt,
 * features/street-objects-feature.js). Their ids are pig:<i> (js/street-objects.js), and a Piggy's
 * moods and food walks stay in features/animal-mood-feature.js, which holds it off its path meanwhile.
 *
 * What is shared besides the path: a Chicken's egg and who owns it (incubatingEgg, with incubBy
 * when it is someone else's, so only the owner's game hatches it), how many times anyone squeezed,
 * massaged or milked it today (sharedSqueezes, sharedMassages, sharedMilks, for the label), and a
 * Batterfly's food counter (foodCounter). Each player's daily uses stay in their save, as in solo;
 * the server keeps its own count of them too and refuses past the limit.
 */

import { GAME_EPOCH_MS } from './game-day.js?v=cf9afac0';
import { INCUBATION } from './animal-husbandry.js?v=d4045cd5';
import { isStandable } from './street-model.js?v=b6cb6a4e';
import { ANIMAL_BODY, TREE_FOOTPRINT } from './street-ecology.js?v=9adea14d';
import { KITTY_MOTION, KITTY_PAUSE_CHOICES } from './heli-kitties.js?v=addb573f';
import { CRAB_WALK } from './crabs.js?v=cd5dd7a6';
import { FIRE_DRAGON_WALK } from './fire-dragon.js?v=b7f3d751';
import { walkSurfaceY } from './walk-surface.js?v=106bfdc5';
import { EAT_PAUSE_MS } from './animal-mood.js?v=a49495fc';
import { CHICKEN_PAUSE_STATES } from './chicken-idles.js?v=eef0279b';

export const CREATURE_KINDS = Object.freeze(['chicken', 'butterfly', 'batterfly']);

/** The remake's solo paths (game.js, at 60 frames a second), now on the shared clock. */
export const CREATURE_PATHS = Object.freeze({
  chicken: Object.freeze({ speed: 30, range: 100 }),
  // game.js spawnPiggies: 0.45 px a frame, ANIMAL_PATROL.piggies 90 px each way.
  pig: Object.freeze({ speed: 27, range: 90 }),
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
  // A street's Heli Kitties and Crab (slice 2 of research/plans/street-animals-shared.md): their
  // features' spawn index (heli-kitties-feature kittyKey, crabs-feature crabKey).
  if (target.classId === 'npc_kitty_chicken' && target.featureId === 'heli-kitties') {
    const m = /^kitty:(\d{1,2})$/.exec(String(target.kittyKey || ''));
    return m ? { id: creatureId('kitty', Number(m[1])), kind: 'kitty', index: Number(m[1]) } : null;
  }
  if (target.classId === 'npc_fire_dragon' && target.featureId === 'fire-dragon') {
    const m = /^dragon:(\d{1,2})$/.exec(String(target.dragonKey || ''));
    return m ? { id: creatureId('dragon', Number(m[1])), kind: 'dragon', index: Number(m[1]) } : null;
  }
  if (target.classId === 'npc_crab' && target.featureId === 'crabs') {
    const m = /^crab:(\d{1,2})$/.exec(String(target.crabKey || ''));
    return m ? { id: creatureId('crab', Number(m[1])), kind: 'crab', index: Number(m[1]) } : null;
  }
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
 * straight back (onPathing 1168-1186). Each pause's pose is the source's own state, which plays
 * once and holds its last frame (js/chicken-idles.js: the sheets were in Tiny Speck's art all
 * along; until 2026-11-10 an idle held one still and pecking_twice played pecking_once). The
 * times and the order of the rolls are unchanged, so a shared walk is where it always was.
 */
export const CHICKEN_PAUSE = Object.freeze({
  everyMs: Object.freeze([6000, 14000]),
  choices: Object.freeze(CHICKEN_PAUSE_STATES.map(([s, state]) => Object.freeze([s * 1000, state]))),
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
 * A shared Chicken at path time t (ms): x, heading and pose ('walk' or a pause's state, CHICKEN_PAUSE)
 * on its chickenPlan round, and poseMs: how far into that pose it is, so every page shows the same
 * frame of it. A pause that turns it shows the new heading when it walks on.
 */
export function chickenWalkAt(home, t, seed = 1) {
  const plan = chickenPlan(home, seed);
  const baseX = home?.baseX ?? 0;
  if (!(plan.ms > 0)) return { ...loopAt(baseX, plan.r, 0), pose: 'walk', poseMs: 0 };
  const tc = mod(Number(t) || 0, plan.ms);
  let seg = plan.segs[0];
  for (const g of plan.segs) {
    if (g.at > tc) break;
    seg = g;
  }
  if (seg.pose !== 'walk') return { ...loopAt(baseX, plan.r, seg.s), pose: seg.pose, poseMs: tc - seg.at };
  return { ...loopAt(baseX, plan.r, mod(seg.s + plan.v * (tc - seg.at), 4 * plan.r)), pose: 'walk', poseMs: tc - seg.at };
}

/**
 * A street Piggy's rooting (npc_piggy.js startMoving 1226-1245, onRooting 1131-1160, stopSniffing
 * 1267-1271; animal-mood-feature PIGGY_ROOTING, its solo twin): randInt(3, 10) s into each walk it
 * stops; three times in ten it looks at the screen for 5 s and walks on the same way, else it sniffs
 * for 3 s and turns round. One about to stop by a tree's trunk walks on until it is clear of it (lane
 * PIGSTUCK: never stands in a tree).
 */
export const PIGGY_ROOT = Object.freeze({ walkS: Object.freeze([3, 10]), lookChance: 0.3, lookMs: 5000, sniffMs: 3000, trunkWaitMs: 400, trunkTries: 25 });

/** The rootings in one round of a shared Piggy's walk (piggyPlan). */
export const PIGGY_PLAN_ROOTS = 12;

/**
 * A shared Piggy's walk with its rooting, as one round that repeats (as chickenPlan): every page
 * with the same home and seed gets the same round. home.trunks: the x of each tree on the street
 * that it should not stop at, home.trunkPx how near counts. Returns { ms, r, v, segs }; a seg's pose
 * is 'walk', 'look' or 'sniff'.
 */
export function piggyPlan({ baseX = 0, range = CREATURE_PATHS.pig.range, speed = CREATURE_PATHS.pig.speed, dir = 1, trunks = [], trunkPx = 0 } = {}, seed = 1) {
  const r = Math.max(1, range);
  const key = `pig|${baseX}|${r}|${speed}|${dir < 0 ? -1 : 1}|${seed}|${trunkPx}|${trunks.join(',')}`;
  const hit = planCache.get(key);
  if (hit) return hit;
  const v = speed / 1000;
  const loop = 4 * r;
  const rng = seededRandom(seed);
  const start = dir < 0 ? 2 * r : 0;
  const segs = [];
  const { walkS, lookChance, lookMs, sniffMs, trunkWaitMs, trunkTries } = PIGGY_ROOT;
  const byTrunk = (s) => {
    const x = loopAt(baseX, r, s).x;
    return trunks.some((t) => Math.abs(t - x) < trunkPx);
  };
  let at = 0;
  let s = start;
  for (let k = 0; k < PIGGY_PLAN_ROOTS; k += 1) {
    let walk = (walkS[0] + Math.floor(rng() * (walkS[1] - walkS[0] + 1))) * 1000;
    for (let i = 0; i < trunkTries && byTrunk(mod(s + v * walk, loop)); i += 1) walk += trunkWaitMs;
    const look = rng() < lookChance;
    segs.push({ at, ms: walk, s, pose: 'walk' });
    at += walk;
    s = mod(s + v * walk, loop);
    const hold = look ? lookMs : sniffMs;
    segs.push({ at, ms: hold, s, pose: look ? 'look' : 'sniff' });
    at += hold;
    if (!look) s = loopTurn(r, s);
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

/** A shared Piggy at path time t (ms): x, heading and pose ('walk', 'look', 'sniff') on its round. */
export function piggyWalkAt(home, t, seed = 1) {
  const plan = piggyPlan(home, seed);
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

/**
 * A street Piggy's walk to food and home, the same for everyone online (slice 1 of
 * research/plans/street-animals-shared.md). In the original the server walked the one npc_piggy
 * item to the food (npc_animal goForFood: apiFindPath(item.x, item.y, 0, 'onFoodPathing'),
 * npc_piggy.js 1404, 1428, 1986-2002), it chewed, idled 3 s (onFoodPathing 1482-1533) and walked on,
 * and every client drew it there. Now the realtime server (groddle-afternoon-server objects_pigs.go
 * startTrip) decides each walk: when a twice-daily tick, food dropped for everyone or a fruiting tree
 * a player worked sends a hungry Piggy, the Piggy's state carries a trip: from x0 (where its path had
 * it) to x1 (beside the tree's foot, or on the stack) in leg ms at the source's middle walk speed
 * (npc_walk_speed randInt(30, 55), onCreate 1442), eat ms at the food, and back to x0 in leg ms. The
 * trip runs on the path's clock (c0: the clock when it set off), so a player at it, a landed verb
 * and the Rook freeze it where it is, for everyone, as they freeze its path; its path stands still
 * meanwhile and runs on from x0 when it is back. The server eats the food on arrival and says "ate".
 * PIGGY_TRIP is what both sides use: speed px a second, the pause, and where it stops (beside a
 * tree's foot: half the footprint and half its body; each Piggy a body and 8 px apart, lane PIGSTUCK).
 */
export const PIGGY_TRIP = Object.freeze({
  speed: 42,
  eatMs: EAT_PAUSE_MS,
  treeStop: TREE_FOOTPRINT / 2 + ANIMAL_BODY.piggies / 2,
  gap: ANIMAL_BODY.piggies + 8,
  body: ANIMAL_BODY.piggies,
});

/**
 * A trip as the server sent it ({ x0, x1, c0, leg, eat }, c0 in server ms), with c0 on the client's
 * path time (ms since the game's epoch, as pathTime), or null when there is none or it is malformed.
 */
export function tripFrom(s) {
  if (!s || typeof s !== 'object') return null;
  const x0 = Number(s.x0);
  const x1 = Number(s.x1);
  const c0 = Number(s.c0);
  const leg = Math.max(0, Math.round(Number(s.leg) || 0));
  const eat = Math.max(0, Math.round(Number(s.eat) || 0));
  if (![x0, x1, c0].every(Number.isFinite) || c0 <= 0 || leg > 3600000 || eat > 3600000) return null;
  return { x0, x1, c0: c0 - GAME_EPOCH_MS, leg, eat, ms: 2 * leg + eat };
}

/**
 * A Piggy on its trip at path time t (pathTime): { x, dir, pose, phase } while the trip lasts
 * (phase go, eat, home; pose walk or eat), else null (it is on its path: tripBaseTime).
 */
export function piggyTripAt(trip, t) {
  if (!trip) return null;
  const e = Number(t) - trip.c0;
  if (!(e >= 0) || e >= trip.ms) return null;
  const toward = trip.x1 >= trip.x0 ? 1 : -1;
  if (e < trip.leg) return { x: trip.x0 + (trip.x1 - trip.x0) * (e / trip.leg), dir: toward, pose: 'walk', phase: 'go' };
  if (e < trip.leg + trip.eat) return { x: trip.x1, dir: toward, pose: 'eat', phase: 'eat' };
  return { x: trip.x1 + (trip.x0 - trip.x1) * ((e - trip.leg - trip.eat) / trip.leg), dir: -toward, pose: 'walk', phase: 'home' };
}

/** The path time its path is at, with a trip: stood still from the trip's start until it is back. */
export function tripBaseTime(trip, t) {
  if (!trip || !(Number(t) >= trip.c0)) return Number(t);
  return Number(t) < trip.c0 + trip.ms ? trip.c0 : Number(t) - trip.ms;
}

/** A street Piggy at path time t: on its trip when it has one, else on its walk (piggyWalkAt). */
export function piggyAt(home, t, seed = 1, trip = null) {
  return piggyTripAt(trip, t) || { ...piggyWalkAt(home, tripBaseTime(trip, t), seed), phase: '' };
}

/**
 * Heli Kitties and Crabs walk the whole run of their floor (slice 2 of
 * research/plans/street-animals-shared.md). In the original one npc_kitty_chicken or npc_crab item
 * walked the street for everyone (npc_kitty_chicken.js startMoving, onPathing 1103-1113; npc_crab's
 * npc_walkable roam) and turned where the floor ended (onStuck). Online every page now walks each on
 * one path from the server's clock and the spot the server gives (the snapshot's spots), with the
 * source's pauses rolled from a seed every page shares, so two players see it in the same place.
 *
 * walkerSpan is the run of floor it can walk from its spot: the walk surface (js/walk-surface.js,
 * the same reach the solo walk uses: a Heli Kitty 40 px up and 70 down, a Crab 24 and 40) followed a
 * few px at a time either way until it ends, and never nearer the street's ends than `edge` (the
 * source's startMovingLimited geo.l + 100, npc_walkable). The same lines give the same span on every page.
 */
export const WALKER_REACH = Object.freeze({
  kitty: Object.freeze({ up: 40, down: 70, edge: KITTY_MOTION.edgeInset }),
  crab: Object.freeze({ up: 24, down: 40, edge: CRAB_WALK.edge }),
  dragon: Object.freeze({ up: 24, down: 40, edge: FIRE_DRAGON_WALK.edge }),
});

const spanCache = new WeakMap();

export function walkerSpan(platforms, x, y, { worldW = 0, up = 40, down = 70, edge = 100, step = 2 } = {}) {
  const lo = Math.min(Number(x), Math.max(0, Number(edge) || 0));
  const hi = Math.max(Number(x), (Number(worldW) || 0) - (Number(edge) || 0));
  const key = `${x}|${y}|${worldW}|${up}|${down}|${edge}|${step}`;
  let row = platforms && typeof platforms === 'object' ? spanCache.get(platforms) : null;
  if (row?.has(key)) return row.get(key);
  const y0 = walkSurfaceY(platforms, x, y, { up, down });
  let span = { l: Number(x), r: Number(x) };
  if (y0 != null) {
    const walk = (sign, stop) => {
      let px = Number(x);
      let py = y0;
      for (;;) {
        const nx = px + sign * step;
        if (sign < 0 ? nx < stop : nx > stop) return px;
        const ny = walkSurfaceY(platforms, nx, py, { up, down });
        if (ny == null) return px;
        px = nx;
        py = ny;
      }
    };
    span = { l: walk(-1, lo), r: walk(1, hi) };
  }
  if (platforms && typeof platforms === 'object') {
    if (!row) spanCache.set(platforms, (row = new Map()));
    if (row.size > 64) row.clear();
    row.set(key, span);
  }
  return span;
}

/** A place x heading dir on the to-and-fro loop over baseX - r .. baseX + r (loopAt's s). */
function loopStart(baseX, r, x, dir) {
  const off = Math.max(-r, Math.min(r, x - baseX));
  if (dir < 0) return 2 * r - off;
  return off >= 0 ? off : 4 * r + off;
}

/** The pauses in one round of a shared Heli Kitty's walk (kittyPlan). */
export const KITTY_PLAN_PAUSES = 8;

/**
 * A shared Heli Kitty's walk, as one round that repeats (as chickenPlan): edge to edge over its span
 * at its walk speed (npc_walkable_onCreate randInt(50, 55)), stopping first after randInt(3, 11) s of
 * walking and then every randInt(6, 14) s for a pause from kitty_pause_state_choices (a blink, a
 * happy wiggle, a chew, a hop or a swat at a ball), turning round half the time (stepKitty, its solo
 * twin). home: { l, r } its span, x0 its spot, dir the way it sets off. Segs' pose is 'walk' or a clip.
 */
export function kittyPlan({ l = 0, r = 0, x0 = 0, dir = -1 } = {}, seed = 1) {
  const key = `kitty|${l}|${r}|${x0}|${dir < 0 ? -1 : 1}|${seed}`;
  const hit = planCache.get(key);
  if (hit) return hit;
  const rng = seededRandom(seed);
  const randInt = (a, b) => Math.floor(rng() * (b - a + 1)) + a;
  const speed = randInt(KITTY_MOTION.walkSpeedMin, KITTY_MOTION.walkSpeedMax);
  const half = Math.max(0.5, (r - l) / 2);
  const baseX = (l + r) / 2;
  const loop = 4 * half;
  const v = speed / 1000;
  const start = loopStart(baseX, half, x0, dir);
  let walk = randInt(KITTY_MOTION.firstPauseMinMs, KITTY_MOTION.firstPauseMaxMs);
  const segs = [];
  let at = 0;
  let s = start;
  for (let k = 0; k < KITTY_PLAN_PAUSES; k += 1) {
    segs.push({ at, ms: walk, s, pose: 'walk' });
    at += walk;
    s = mod(s + v * walk, loop);
    const choice = KITTY_PAUSE_CHOICES[Math.floor(rng() * KITTY_PAUSE_CHOICES.length) % KITTY_PAUSE_CHOICES.length];
    const ms = Math.round(choice[0] * 1000);
    segs.push({ at, ms, s, pose: choice[1] });
    at += ms;
    if (rng() < 0.5) s = loopTurn(half, s);
    walk = randInt(KITTY_MOTION.pauseEveryMinMs, KITTY_MOTION.pauseEveryMaxMs);
  }
  const back = mod(start - s, loop) / v;
  segs.push({ at, ms: back, s, pose: 'walk' });
  at += back;
  const plan = Object.freeze({ ms: at, r: half, baseX, v, speed, segs });
  if (planCache.size > 256) planCache.clear();
  planCache.set(key, plan);
  return plan;
}

/** A shared Heli Kitty at path time t: x, heading and pose ('walk' or its pause's clip). */
export function kittyWalkAt(home, t, seed = 1) {
  const plan = kittyPlan(home, seed);
  if (!(plan.ms > 0)) return { ...loopAt(plan.baseX, plan.r, 0), pose: 'walk' };
  const tc = mod(Number(t) || 0, plan.ms);
  let seg = plan.segs[0];
  for (const g of plan.segs) {
    if (g.at > tc) break;
    seg = g;
  }
  if (seg.pose !== 'walk') return { ...loopAt(plan.baseX, plan.r, seg.s), pose: seg.pose };
  return { ...loopAt(plan.baseX, plan.r, mod(seg.s + plan.v * (tc - seg.at), 4 * plan.r)), pose: 'walk' };
}

/** The roams in one round of a shared Crab's walk (crabPlan). */
export const CRAB_PLAN_MOVES = 10;

/**
 * A shared Crab's roam, as one round that repeats: as npc_walkable (crabs-feature, its solo twin) it
 * stands 1.5 s, then walks 250 or 400 px the way it is going (crabRoamTarget, never past its span),
 * turns and stands 10 s; where its floor ends it turns and stands 1 s (onStuck). Each stand plays
 * idle1 or idle2. After CRAB_PLAN_MOVES roams it walks back to its spot, so the next round carries on
 * from there. home: { l, r } its span and x0 its spot. Segs: { at, ms, x, to, pose } (walk: x to to).
 */
export function crabPlan({ l = 0, r = 0, x0 = 0 } = {}, seed = 1) {
  const key = `crab|${l}|${r}|${x0}|${seed}`;
  const hit = planCache.get(key);
  if (hit) return hit;
  const rng = seededRandom(seed);
  const speed = CRAB_WALK.speedMin + Math.floor(rng() * (CRAB_WALK.speedMax - CRAB_WALK.speedMin + 1));
  const v = speed / 1000;
  const idle = () => (rng() < 0.5 ? 'idle1' : 'idle2');
  const segs = [];
  let at = 0;
  let x = x0;
  let goDir = -1;
  const stand = (ms) => {
    segs.push({ at, ms, x, to: x, pose: idle() });
    at += ms;
  };
  stand(1500);
  for (let k = 0; k < CRAB_PLAN_MOVES; k += 1) {
    const list = goDir < 0 ? CRAB_WALK.left : CRAB_WALK.right;
    let d = list[Math.floor(rng() * list.length) % list.length];
    if (d < 0 && x + d < l) d = l - x;
    else if (d > 0 && x + d > r) d = r - x;
    goDir = -goDir;
    if (Math.abs(d) < 0.5) {
      stand(CRAB_WALK.stuckWaitMs);
      continue;
    }
    const ms = Math.abs(d) / v;
    segs.push({ at, ms, x, to: x + d, pose: 'walk' });
    at += ms;
    x += d;
    stand(CRAB_WALK.arriveWaitMs);
  }
  if (Math.abs(x - x0) >= 0.5) {
    const ms = Math.abs(x0 - x) / v;
    segs.push({ at, ms, x, to: x0, pose: 'walk' });
    at += ms;
  }
  const plan = Object.freeze({ ms: at, v, speed, segs });
  if (planCache.size > 256) planCache.clear();
  planCache.set(key, plan);
  return plan;
}

/** A shared Crab at path time t: x, heading and pose ('walk', 'idle1', 'idle2'). */
export function crabWalkAt(home, t, seed = 1) {
  const plan = crabPlan(home, seed);
  if (!(plan.ms > 0)) return { x: home?.x0 ?? 0, dir: -1, pose: 'idle1' };
  const tc = mod(Number(t) || 0, plan.ms);
  let seg = plan.segs[0];
  for (const g of plan.segs) {
    if (g.at > tc) break;
    seg = g;
  }
  if (seg.pose !== 'walk') return { x: seg.x, dir: -1, pose: seg.pose };
  const f = seg.ms > 0 ? Math.min(1, (tc - seg.at) / seg.ms) : 1;
  return { x: seg.x + (seg.to - seg.x) * f, dir: seg.to >= seg.x ? 1 : -1, pose: 'walk' };
}

/**
 * A Pocket Salmon's swim (resource-nodes-feature placeSalmon, its solo twin): to and fro `range` px
 * either side of its spot at 0.042 px/ms, playing its turn clip at each end (turnRight: 11 frames
 * at 0.42 a 60 fps frame, about 437 ms), bobbing 7 px. Online (slice 3 of
 * research/plans/street-animals-shared.md) it is this pure function of the server's clock, so every
 * page has each Salmon in the same place. start: { offset0, dir0, range, phase } from its key's
 * hash; t: path time (ms). Returns { offset, dir, turning, bob }.
 */
export const SALMON_SWIM = Object.freeze({ speed: 0.042, turnMs: Math.round((11 / 0.42) * (1000 / 60)), bob: 7, bobRate: 1.7 });

export function salmonSwimAt({ offset0 = 0, dir0 = 1, range = 130, phase = 0 } = {}, t = 0) {
  const { speed: v, turnMs: T } = SALMON_SWIM;
  const R = Math.max(1, range);
  const leg = (2 * R) / v;
  const P = 2 * leg + 2 * T;
  const o = Math.max(-R, Math.min(R, offset0));
  const u0 = dir0 > 0 ? (o + R) / v : leg + T + (R - o) / v;
  const u = mod(u0 + (Number(t) || 0), P);
  const bob = Math.sin((Number(t) || 0) / 1000 * SALMON_SWIM.bobRate + phase) * SALMON_SWIM.bob;
  if (u < leg) return { offset: -R + v * u, dir: 1, turning: false, bob };
  if (u < leg + T) return { offset: R, dir: -1, turning: true, bob };
  if (u < 2 * leg + T) return { offset: R - v * (u - leg - T), dir: -1, turning: false, bob };
  return { offset: -R, dir: 1, turning: true, bob };
}

/** The roams in one round of a shared Fire Dragon's walk (dragonPlan). */
export const DRAGON_PLAN_MOVES = 10;

/**
 * A shared Fire Dragon's roam (slice 3 of research/plans/street-animals-shared.md; the made animal's
 * own walk, js/fire-dragon.js and fire-dragon-feature, its solo twin): it stands 1.5 to 3.5 s, then
 * walks 220 to 380 px the way it is going at 55 to 65 px/s (never past its span), turns and stands 3
 * to 8 s; where its floor ends it turns and stands 1 s. Rolled from a seed every page shares, as one
 * round that comes back to its spot. Segs as crabPlan's, pose 'walk' or 'stand'.
 */
export function dragonPlan({ l = 0, r = 0, x0 = 0 } = {}, seed = 1) {
  const key = `dragon|${l}|${r}|${x0}|${seed}`;
  const hit = planCache.get(key);
  if (hit) return hit;
  const W = FIRE_DRAGON_WALK;
  const rng = seededRandom(seed);
  const speed = W.speedMin + Math.floor(rng() * (W.speedMax - W.speedMin + 1));
  const v = speed / 1000;
  const segs = [];
  let at = 0;
  let x = x0;
  let goDir = rng() < 0.5 ? -1 : 1;
  const stand = (ms) => {
    segs.push({ at, ms, x, to: x, pose: 'stand' });
    at += ms;
  };
  stand(Math.round(1500 + rng() * 2000));
  for (let k = 0; k < DRAGON_PLAN_MOVES; k += 1) {
    const range = goDir < 0 ? W.left : W.right;
    let d = Math.round(range[0] + rng() * (range[1] - range[0]));
    if (d < 0 && x + d < l) d = Math.min(0, l - x);
    else if (d > 0 && x + d > r) d = Math.max(0, r - x);
    goDir = -goDir;
    if (Math.abs(d) < 0.5) {
      stand(W.stuckWaitMs);
      continue;
    }
    const ms = Math.abs(d) / v;
    segs.push({ at, ms, x, to: x + d, pose: 'walk' });
    at += ms;
    x += d;
    stand(Math.round(W.restMin + rng() * (W.restMax - W.restMin)));
  }
  if (Math.abs(x - x0) >= 0.5) {
    const ms = Math.abs(x0 - x) / v;
    segs.push({ at, ms, x, to: x0, pose: 'walk' });
    at += ms;
  }
  const plan = Object.freeze({ ms: at, v, speed, segs });
  if (planCache.size > 256) planCache.clear();
  planCache.set(key, plan);
  return plan;
}

/** A shared Fire Dragon at path time t: x, heading and pose ('walk' or 'stand'). */
export function dragonWalkAt(home, t, seed = 1) {
  const plan = dragonPlan(home, seed);
  if (!(plan.ms > 0)) return { x: home?.x0 ?? 0, dir: 1, pose: 'stand' };
  const tc = mod(Number(t) || 0, plan.ms);
  let seg = plan.segs[0];
  let dir = 1;
  for (const g of plan.segs) {
    if (g.at > tc) break;
    seg = g;
    if (g.pose === 'walk') dir = g.to >= g.x ? 1 : -1;
  }
  if (seg.pose !== 'walk') return { x: seg.x, dir, pose: 'stand' };
  const f = seg.ms > 0 ? Math.min(1, (tc - seg.at) / seg.ms) : 1;
  return { x: seg.x + (seg.to - seg.x) * f, dir: seg.to >= seg.x ? 1 : -1, pose: 'walk' };
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
export const PATH_STEP = Object.freeze({ chicken: 0.8, pig: 0.8, fly: 1.2 });

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
  const path = { lag: Math.max(0, Number(s?.lag) || 0), holdEnd: hold > 0 ? base + hold : 0 };
  // A street Piggy on its way to food (PIGGY_TRIP): the server's trip, on the path's clock.
  const trip = tripFrom(s?.trip);
  if (trip) path.trip = trip;
  return path;
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
/**
 * A street animal's name from the server (objects_pigs.go nameAnimal; items/include/animal_naming.js):
 * userName, namer and namedOn in the shape js/animal-husbandry.js canNameAnimal reads, the namer
 * 'player' when it is this player (me, the realtime id), else 'p<id>'. No name: none here either.
 */
export function applyAnimalName(state, s, now = Date.now(), me = 0) {
  if (!state) return state;
  const name = typeof s?.name === 'string' ? s.name.slice(0, 32) : '';
  if (name) {
    const namer = Math.floor(Number(s.namer) || 0);
    state.userName = name;
    state.namer = me && namer === Number(me) ? 'player' : `p${namer}`;
    state.namedOn = Math.floor((now - Math.max(0, Number(s.named) || 0)) / 1000);
  } else {
    delete state.userName;
    delete state.namer;
    delete state.namedOn;
  }
  return state;
}

export function applyCreatureState(classId, state, s, { me = 0, now = Date.now() } = {}) {
  if (!state) return state;
  if (classId === 'npc_chicken' || classId === 'npc_butterfly' || classId === 'npc_batterfly') applyAnimalName(state, s, now, me);
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
