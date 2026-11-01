/**
 * A street's Chickens, Butterflies and Batterflies in multiplayer: the rules the client needs to
 * share them with groddle-afternoon-server/objects_creatures.go. Pure: no DOM, no Pixi, no engine
 * (tests/street-creatures.test.js).
 *
 * In the original one npc_chicken, npc_butterfly or npc_batterfly item was the same animal for
 * everyone on the street. Online, every client now draws each street animal on the same path from
 * the server's clock, so two players see it in the same place without the server moving anything:
 *   - a Chicken walks to and fro across its spot (game.js spawnChickens: 100 px each way at
 *     0.5 px a frame, 30 px/s, the odd ones setting off left);
 *   - a resting Butterfly bobs on its perch (spawnButterflies: 0.04 a frame);
 *   - a flying Butterfly drifts across the whole street and back in from the far side
 *     (0.65 px a frame, 39 px/s, bobbing 14 px at 0.06 a frame);
 *   - a Batterfly loops low over its spot (animal-husbandry-feature stepBatterfly).
 * The server keeps when a path stood still: "lag" (ms held so far) and "hold" (ms it holds from
 * now), so the path's clock is the server's now minus lag, frozen while held. A verb that lands
 * holds it for everyone (the source stops an animal for the player at it, onWaitStart), and a
 * Chicken on an egg holds until it hatches.
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
import { INCUBATION } from './animal-husbandry.js?v=808076d1';

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
 * The street's clock as the client keeps it: offset is server ms minus local ms (from each "objs"
 * frame's "now"). An animal's path time (ms) at local time `local`: frozen while it is held.
 */
export function pathTime(path, local, offset = 0) {
  const lag = Math.max(0, Number(path?.lag) || 0);
  const holdEnd = Number(path?.holdEnd) || 0;
  // The server's path clock: (now < holdEnd ? holdEnd : now) - lag, where lag already counts the hold.
  return Math.max(local, holdEnd) + offset - lag - GAME_EPOCH_MS;
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

/** A flying Butterfly at path time t: across the street and back in from the far side. */
export function flyerAt({ x0, baseY, worldW, phase0 = 0 }, t) {
  const f = CREATURE_PATHS.fly;
  const span = Math.max(1, worldW + 2 * f.margin);
  const x = mod(x0 + f.margin + (t / 1000) * f.speed, span) - f.margin;
  return { x, y: baseY + Math.sin(phase0 + (t / 1000) * f.bob) * f.amp, dir: 1 };
}

/** A resting Butterfly's y at path time t (it bobs where it sits). */
export function restAt({ groundY, phase0 = 0 }, t) {
  const r = CREATURE_PATHS.rest;
  return { y: groundY + 2 + Math.sin(phase0 + (t / 1000) * r.bob) * r.amp };
}

/** A Batterfly at path time t: lazy loops in the lower part of the street (stepBatterfly). */
export function batterflyAt({ baseX, baseY, phase0 = 0 }, t) {
  const phase = phase0 + t / 1000;
  return {
    x: baseX + Math.sin(phase * 0.35) * CREATURE_PATHS.batterfly.dx,
    y: baseY + Math.sin(phase * 0.9) * 26 + Math.cos(phase * 0.21) * 34,
    dir: Math.cos(phase * 0.35) >= 0 ? 1 : -1,
  };
}

/** Ease a coordinate toward its path (dt in 60 fps frames); far off, jump. */
export function easeToward(current, target, dt = 1) {
  const d = target - current;
  if (!Number.isFinite(d) || Math.abs(d) > SNAP_PX || Math.abs(d) < 0.3) return target;
  return current + d * Math.min(1, 0.12 * Math.max(0, dt));
}

/** The path a target follows, from its server state (lag, hold) received at local time `at`. */
export function pathFrom(s, at = Date.now()) {
  const hold = Math.max(0, Number(s?.hold) || 0);
  return { lag: Math.max(0, Number(s?.lag) || 0), holdEnd: hold > 0 ? at + hold : 0 };
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
