/**
 * The vendor NPCs walk their streets (register G680; the review research/refs-review-2026-11-10
 * C: "the six named vendors walk"). Pure: no Pixi, no DOM (tests/vendor-walk.test.js); the world
 * side is features/vendor-npcs-feature.js.
 *
 * The original's movement, per class (glitch-GameServerJS items/):
 *   - Tool Vendor, npc_tool_vendor.js: npc_walkable walk_type "roam" (24). parent_onCreate
 *     508-517: speed randInt(50, 55), go_dir 'left', startMoving at once. startMoving 252-316:
 *     250 or 400 px the way it is going, never nearer the street's ends than 100 px; a walk of 0
 *     (or no path) is onStuck 239-243: turn round, walk again after 1 s. Its own onPathing 211-233:
 *     on arriving it stands (idle_stand) and walks again after 10 s WITHOUT turning, so it roams
 *     one way until the end of its floor stops it; setting off the other way plays turn_left or
 *     turn_right first.
 *   - Meal Vendor, npc_cooking_vendor.js: the same roam (onPathing 214-229, no turn on arriving);
 *     stopMoving 235-245 plays walk_left_end or walk_right_end, then idle_stand after 1 s
 *     (idle 201-203); it walks again 10 s after arriving.
 *   - Uncle Friendly and Helga, npc_jabba1.js / npc_jabba2.js: walk_type says "edge_to_edge" but
 *     their own startMoving 296-315 replaces it: 250 or 400 px, always the other way from the last
 *     walk (dir 'right' at onCreate 228-247, so the first walk goes left), at speed 50 (237).
 *     onPathing 255-278 plays 'turn' when the way changes (every walk). stopMoving 317-332:
 *     walk_end for 2 s, then impatient for 4 s, then the next walk. Their source walks are not
 *     kept off the street's ends; the remake keeps them on their run of floor.
 *   - Sno Cone Vending Machine, npc_sno_cone_vending_machine.js: speed 100 (onCreate 294-310);
 *     idle_stand for 5 s (idle_onRun 260-265), then 250 or 400 px the way it is going, kept 100 px
 *     off the ends (startMoving 327-346); arriving it plays walk_end and turns round (stopMoving
 *     348-352), so it goes to and fro. Its source, stuck at an end, turned twice (onStuck 322-325
 *     then stopMoving again from idle_onEnter 236-243) and stayed facing the end for good; the
 *     remake turns it once.
 *   - Gardening Tools Vendor (the scarecrow), npc_gardening_vendor.js: has walk art and a speed
 *     (onCreate 203-218) but nothing ever calls its startMoving (271-291; onPlayerEnter 252-264
 *     returns first), so it stood still in Glitch and stands still here. It waves (attract, 5 s)
 *     at a player who comes up (attract 190-201).
 * All of them stop while a player is at them (npc.js onInteractionStarting -> onWaitStart, the
 * walkables' stopMoving) and walk on 1.5 s after the last one leaves (onWaitEnd: startMoving after
 * 1500 ms).
 *
 * A walk is one seeded round that repeats (as js/street-creatures.js crabPlan): VENDOR_PLAN_MOVES
 * walks by the class's rules, then walks home to its spot by the same rules, so the next round
 * carries on from there. The clock is the wall clock from GAME_EPOCH_MS less the time this page
 * held it, so every page with the same spot (the shared street planner) has the vendor in the same
 * place until someone stops it.
 */

import { seededRandom } from './street-creatures.js?v=079038c2';

/** Walk rules per class (see the header for the source lines). null: it stands still. */
export const VENDOR_WALK = Object.freeze({
  npc_tool_vendor: Object.freeze({
    kind: 'roam', speed: Object.freeze([50, 55]), left: Object.freeze([-400, -250]), right: Object.freeze([250, 400]),
    firstDir: -1, arriveMs: 10000, stuckMs: 1000, turnOnArrive: false, firstStandMs: 1500,
  }),
  npc_cooking_vendor: Object.freeze({
    kind: 'roam', speed: Object.freeze([50, 55]), left: Object.freeze([-400, -250]), right: Object.freeze([250, 400]),
    firstDir: -1, arriveMs: 10000, endMs: 1000, stuckMs: 1000, turnOnArrive: false, firstStandMs: 1500,
  }),
  npc_jabba1: Object.freeze({
    kind: 'alternate', speed: Object.freeze([50, 50]), left: Object.freeze([-400, -250]), right: Object.freeze([250, 400]),
    firstDir: -1, endMs: 2000, impatientMs: 4000, stuckMs: 1000, firstStandMs: 1500,
  }),
  npc_jabba2: Object.freeze({
    kind: 'alternate', speed: Object.freeze([50, 50]), left: Object.freeze([-400, -250]), right: Object.freeze([250, 400]),
    firstDir: -1, endMs: 2000, impatientMs: 4000, stuckMs: 1000, firstStandMs: 1500,
  }),
  npc_sno_cone_vending_machine: Object.freeze({
    kind: 'roam', speed: Object.freeze([100, 100]), left: Object.freeze([-400, -250]), right: Object.freeze([250, 400]),
    firstDir: 1, arriveMs: 5000, stuckMs: 5000, turnOnArrive: true, firstStandMs: 5000,
  }),
  npc_gardening_vendor: null,
});

/** onWaitEnd: apiSetTimer('startMoving', 1500) after the last player leaves. */
export const VENDOR_RESUME_MS = 1500;
/** Same reach as a Heli Kitty (npc_walkable): its floor followed 40 px up and 70 down, 100 px off the ends. */
export const VENDOR_REACH = Object.freeze({ up: 40, down: 70, edge: 100 });
/** Walks in one round before it walks home (vendorPlan). */
export const VENDOR_PLAN_MOVES = 10;

/**
 * The poses' art: which strip each pose plays (js/vendor-npcs.js VENDOR_NPC_ART and
 * VENDOR_NPC_MOTION_ART states) and the way the art faces. `rest` is the way the idle and talk art
 * faces; `mirror` says whether the art may be flipped to face the other way (the Tool Vendor's
 * beak, Uncle Friendly's and Helga's tails; never the Sno Cone machine's lettering, the Meal
 * Vendor's cart or the scarecrow, who face the screen). walk/turn/end give the strip for walking
 * right (1) and left (-1); a strip given once for the right is flipped for the left. turn is keyed
 * by the way it turns to.
 */
export const VENDOR_POSES = Object.freeze({
  npc_tool_vendor: Object.freeze({
    rest: 1, mirror: true,
    walk: Object.freeze({ 1: 'walk', '-1': 'walk_left' }),
    turn: Object.freeze({ 1: 'turn_right', '-1': 'turn_left' }),
  }),
  npc_cooking_vendor: Object.freeze({
    rest: -1, mirror: false,
    walk: Object.freeze({ 1: 'walk_right', '-1': 'walk_left' }),
    end: Object.freeze({ 1: 'walk_right_end', '-1': 'walk_left_end' }),
  }),
  // The jabbas' walk_reverse / walk_left strips are their walk drawn the other way (the crops mirror
  // about the cell's centre), so the left walk is the walk flipped; turn goes right to left.
  npc_jabba1: Object.freeze({ rest: 1, mirror: true, walk: Object.freeze({ 1: 'walk' }), turn: Object.freeze({ '-1': 'turn' }), end: Object.freeze({ 1: 'walk_end' }), impatient: 'impatient' }),
  npc_jabba2: Object.freeze({ rest: 1, mirror: true, walk: Object.freeze({ 1: 'walk' }), turn: Object.freeze({ '-1': 'turn' }), end: Object.freeze({ 1: 'walk_end' }), impatient: 'impatient' }),
  npc_sno_cone_vending_machine: Object.freeze({
    rest: 1, mirror: false,
    walk: Object.freeze({ 1: 'walk_right', '-1': 'walk_left' }),
    end: Object.freeze({ 1: 'walk_end', '-1': 'walk_end' }),
    attract: 'attract',
  }),
  npc_gardening_vendor: Object.freeze({ rest: 1, mirror: false, attract: 'attract' }),
});

/** Strip frames at 30 a second (sprite-sheets pixiSpeed(30)): a turn plays out before the walk. */
export const VENDOR_CLIP_FPS = 30;

function mod(a, n) {
  return ((a % n) + n) % n;
}

/** A directional entry ({1: s, -1: s}) for a heading: its own strip, or the other's flipped. */
function sided(entry, dir) {
  if (!entry) return null;
  if (typeof entry === 'string') return { state: entry, flip: false };
  const own = entry[dir];
  if (own) return { state: own, flip: false };
  const other = entry[-dir];
  return other ? { state: other, flip: true } : null;
}

/**
 * The strip a pose plays for a class facing `dir`, and whether the sprite is flipped
 * (scale.x -1). idle, talk, impatient and attract face the rest way, flipped to face the other way
 * where the art allows it. Null when the class has no art for the pose.
 * @param {string} classTsid
 * @param {string} pose walk | turn | end | impatient | idle | talk | attract
 * @param {number} dir 1 right, -1 left (for turn: the way it turns to)
 */
export function vendorClip(classTsid, pose, dir = 1) {
  const art = VENDOR_POSES[classTsid];
  if (!art) return null;
  const d = dir < 0 ? -1 : 1;
  if (pose === 'walk' || pose === 'turn' || pose === 'end') {
    const hit = sided(art[pose], d);
    if (!hit) return null;
    return { state: hit.state, flip: hit.flip && art.mirror };
  }
  const state = pose === 'idle' || pose === 'talk' ? pose : art[pose];
  if (!state) return null;
  return { state, flip: Boolean(art.mirror) && d !== art.rest };
}

/** How long a strip plays once (ms) at VENDOR_CLIP_FPS. */
export function clipMs(frames) {
  return Math.round((Math.max(1, Number(frames) || 1) * 1000) / VENDOR_CLIP_FPS);
}

const planCache = new Map();

/**
 * One round of a vendor's walk. home: { l, r } the run of floor it may walk (js/street-creatures.js
 * walkerSpan with VENDOR_REACH), x0 its spot. clips: { turn: { 1, -1 }, end } how long its turn
 * strips (by the way it turns to) and the Sno Cone machine's walk_end play (missing: on the spot). Returns { ms, speed, dir0, segs } or null for a class that
 * stands; segs are { at, ms, x, to, pose, dir } (walk: x to to; a turn faces dir when it ends).
 */
export function vendorPlan(classTsid, { l = 0, r = 0, x0 = 0 } = {}, seed = 1, clips = {}) {
  const rule = VENDOR_WALK[classTsid];
  if (!rule) return null;
  const art = VENDOR_POSES[classTsid] || {};
  const turnMs = clips.turn || {};
  const key = `${classTsid}|${l}|${r}|${x0}|${seed}|${turnMs[1] || 0}|${turnMs[-1] || 0}|${clips.end || 0}`;
  const hit = planCache.get(key);
  if (hit) return hit;
  const rng = seededRandom(seed);
  const pick = (list) => list[Math.floor(rng() * list.length) % list.length];
  const speed = rule.speed[0] + Math.floor(rng() * (rule.speed[1] - rule.speed[0] + 1));
  const v = speed / 1000;
  const segs = [];
  let at = 0;
  let x = Number(x0) || 0;
  let goDir = rule.firstDir;
  // The way it faces: a jabba's first walk is a turn from dir 'right'; a roamer faces its art's way.
  let facing = rule.kind === 'alternate' ? 1 : art.rest || 1;
  const dir0 = facing;
  const push = (ms, pose, to = x) => {
    if (!(ms > 0)) return;
    segs.push({ at, ms, x, to, pose, dir: facing });
    at += ms;
  };
  const standAfter = () => {
    if (rule.kind === 'alternate') {
      push(rule.endMs, 'end');
      push(rule.impatientMs, 'impatient');
      return;
    }
    if (rule.endMs) {
      push(rule.endMs, 'end');
      push(rule.arriveMs - rule.endMs, 'idle');
    } else if (rule.turnOnArrive && art.end) {
      // npc_sno_cone_vending_machine stopMoving: walk_end, then idle_stand for the rest of its 5 s.
      const endMs = Math.min(rule.arriveMs, Number(clips.end) || 0);
      push(endMs, 'end');
      push(rule.arriveMs - endMs, 'idle');
    } else {
      push(rule.arriveMs, 'idle');
    }
  };
  const walkTo = (d) => {
    const dir = d < 0 ? -1 : 1;
    if (dir !== facing) {
      facing = dir;
      push(Number(turnMs[dir]) || 0, 'turn');
    }
    push(Math.abs(d) / v, 'walk', x + d);
    x += d;
  };
  // One startMoving: how far it would go now, kept on its run of floor (0: it is stuck there).
  const nextDistance = (homeward = null) => {
    const dir = homeward ?? goDir;
    let d = pick(dir < 0 ? rule.left : rule.right);
    if (homeward != null) d = dir * Math.min(Math.abs(d), Math.abs(x0 - x));
    if (d < 0 && x + d < l) d = l - x;
    else if (d > 0 && x + d > r) d = r - x;
    return Math.abs(d) < 0.5 ? 0 : d;
  };
  push(rule.firstStandMs, 'idle');
  let moves = 0;
  let guard = 0;
  while (moves < VENDOR_PLAN_MOVES && guard < VENDOR_PLAN_MOVES * 4) {
    guard += 1;
    const d = nextDistance();
    if (!d) {
      // onStuck: turn round, startMoving after 1 s (the Sno Cone machine: back to its 5 s idle).
      goDir = -goDir;
      push(rule.stuckMs, 'idle');
      continue;
    }
    walkTo(d);
    moves += 1;
    if (rule.kind === 'alternate' || rule.turnOnArrive) goDir = -goDir;
    standAfter();
  }
  // Home to its spot by the same steps, so the next round carries on from there.
  guard = 0;
  while (Math.abs(x - x0) >= 0.5 && guard < 40) {
    guard += 1;
    const d = nextDistance(x0 > x ? 1 : -1);
    if (!d) break;
    walkTo(d);
    standAfter();
  }
  // Face the way the round began, so a jabba's mirrored pose does not flip at the seam.
  if (facing !== dir0) {
    facing = dir0;
    push(Number(turnMs[dir0]) || 1, 'turn');
  }
  const plan = Object.freeze({ ms: at, speed, dir0, segs: Object.freeze(segs) });
  if (planCache.size > 128) planCache.clear();
  planCache.set(key, plan);
  return plan;
}

/**
 * Where a vendor is at path time t (ms): x, the way it faces (dir), its pose (idle, walk, turn,
 * end, impatient) and poseMs, how far into the pose it is, so every page shows the same frame.
 */
export function vendorWalkAt(plan, t, x0 = 0) {
  if (!plan || !(plan.ms > 0)) return { x: x0, dir: 1, pose: 'idle', poseMs: 0 };
  const tc = mod(Number(t) || 0, plan.ms);
  let lo = 0;
  let hi = plan.segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (plan.segs[mid].at <= tc) lo = mid;
    else hi = mid - 1;
  }
  const seg = plan.segs[lo];
  const poseMs = tc - seg.at;
  if (seg.pose !== 'walk') return { x: seg.x, dir: seg.dir, pose: seg.pose, poseMs };
  const f = seg.ms > 0 ? Math.min(1, poseMs / seg.ms) : 1;
  return { x: seg.x + (seg.to - seg.x) * f, dir: seg.dir, pose: 'walk', poseMs };
}

/**
 * The page's own clock for a vendor (ms): the wall clock less the time this page held it.
 * hold: { lag, since, until }: lag is the ms held before, since when the current hold began (0: not
 * held) and until when it lets go (0: still held). The clock stands still from since to until.
 */
export function vendorClock(hold, now, epoch = 0) {
  let lag = Math.max(0, Number(hold?.lag) || 0);
  const since = Number(hold?.since) || 0;
  const until = Number(hold?.until) || 0;
  let at = now;
  if (since > 0) {
    if (!until || now < until) at = Math.min(now, since);
    else lag += until - since;
  }
  return at - epoch - lag;
}

/** Start holding (a player is at it). A hold that was letting go holds on from where it stood. */
export function holdVendor(hold, now) {
  if (hold.since && hold.until && now >= hold.until) {
    hold.lag = (Number(hold.lag) || 0) + hold.until - hold.since;
    hold.since = 0;
  }
  if (!hold.since) hold.since = now;
  hold.until = 0;
  return hold;
}

/** Let go: it stands VENDOR_RESUME_MS more (onWaitEnd), then its walk carries on from where it stopped. */
export function releaseVendor(hold, now, resumeMs = VENDOR_RESUME_MS) {
  if (hold.since && !hold.until) hold.until = now + resumeMs;
  return hold;
}

/** Whether a vendor is standing for a player (held, or in its 1.5 s before walking on). */
export function vendorHeld(hold, now) {
  return Boolean(hold?.since) && (!hold.until || now < hold.until);
}

/** The way a held vendor faces: toward the player, where its art can turn (vendorClip flip). */
export function faceToward(x, playerX, current = 1) {
  const d = Number(playerX) - Number(x);
  if (!Number.isFinite(d) || Math.abs(d) < 4) return current < 0 ? -1 : 1;
  return d < 0 ? -1 : 1;
}
