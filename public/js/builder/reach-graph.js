/**
 * LEVEL BUILDER (spec 7.4): reachability. Where a new player can get to on a street, stepped
 * frame by frame with the game's own movement (js/avatar-step.js, the frame game.js physics()
 * runs), so the validator and the game never disagree about a jump.
 *
 * Model, in screen space (platformsScreen, barriersScreen, wallsScreen):
 * 1. Stand points every 8 px along every standable line. Points on one line are joined by walking
 *    unless a wall stops the body; line ends that meet another line within 4 px across and 16 px
 *    up or down (the ground resolve's step) are joined too.
 * 2. Jump and fall edges from stand points every 16 px and from line ends: a straight-up jump, a
 *    standing jump and a running jump holding toward each side, a walk off each free line end (at
 *    a run and at a step) with the one air jump tried every 4th frame. Each arc runs the shared
 *    stepper for at most 240 frames; a landing joins the nearest stand point.
 * 3. Ladders: any stand point in grabbing reach mounts; from the ladder the avatar reaches its
 *    top deck (ladderTopDeck), drops off the bottom, hops off sideways and jumps off at heights
 *    every 48 px.
 * 4. Breadth-first search from each arrival; the reverse graph from the exits finds traps; a
 *    widest-path search keeps each route's tightest margin.
 *
 * Limits (also in every report header, REACH_LIMITS): plain jump only (no triple jump, no coyote
 * time, no jump buffer); mid-air steering is "hold toward" only; fixed 60 fps steps; items, NPCs
 * and players are not colliders; event-toggled lines are ignored.
 *
 * Pure: no DOM, no Pixi.
 */
import { platformsScreen, barriersScreen, wallsScreen, isStandable, platformYAt, resolveGround, ladderTopDeck, worldToScreen, streetWidth, streetHeight, navigableSignposts, isBuriedSignpost, blockBarrierCrossing } from '../street-model.js?v=23b926e5';
import { stepAvatar, avatarGround, steerX, NORMAL_BUFF, JUMP_SPEED, WALK_MAX, OFF_LADDER_RATIO } from '../avatar-step.js?v=c04c7c76';
import { ladderTopSignpostLadder } from '../ladder-top-signposts.js?v=f609fb2f';
import { physicsMultipliers } from '../location-events.js?v=61e0c5d3';

export const STAND_STEP = 8;
export const JUMP_STEP = 16;
export const MAX_FRAMES = 240;
export const JOIN_X = 4;
export const JOIN_Y = 16;
/** A signpost is in reach from a stand point this close across (stricter than signpostNear's 140). */
export const POST_REACH_X = 120;
/** ...whose feet are between the post's top and this far under its foot. */
export const POST_BELOW = 60;
export const DOOR_REACH_X = 60;
export const TIGHT_MARGIN = 8;
/**
 * P7: a keyboard player's timing. A jump onto another floor is tried again from eight takeoffs
 * spread over 12 px either side (LANDING_TRIES: about 2.7 frames early or late at a full run of
 * 4.4 px a frame), and an air jump after walking off a ledge with the press 1 to 3 frames early or
 * late (AIR_JUMP_TRIES). A landing that fewer than LANDING_SHARE of the tries make is one a
 * keyboard player often misses: a tight jump (PHY-006). Calibrated in the real game (spec 14.1 P7).
 */
export const LANDING_TRIES = Object.freeze([-12, -8.5, -5, -1.5, 1.5, 5, 8.5, 12]);
export const AIR_JUMP_TRIES = Object.freeze([-3, -2, -1, 1, 2, 3]);
export const LANDING_SHARE = 0.6;
/** Room for a run-up that counts as unlimited (a full-speed run needs about 20 px). */
const RUN_ROOM_FREE = 400;
const COL = 64;
const COL_PAD = 24;

export const REACH_LIMITS = Object.freeze([
  'Plain jump only: no triple jump, no coyote time, no jump buffer. Reachable means reachable by a new player.',
  'Sampled, not exhaustive: in the air the avatar only holds toward one side, so a path that needs a reversal in the air can be missed.',
  'Fixed 60 fps steps; a slow frame bends arcs a little (the 8 px tight-jump margin covers it).',
  'A running jump starts at the speed the floor behind it gives room for. A tight jump is judged by the height to spare and, for a jump onto another floor, by the share of a keyboard player\'s tries that land: takeoffs up to 12 px early or late, an air jump 1 to 3 frames early or late (a plain walk-off and a ladder hop by height only).',
  'Items, NPCs and other players are not colliders; lines events switch on or off are taken as the file has them.',
]);

/** PURE: the movement multipliers a street plays with (its per-street physics, else normal). */
export function streetBuff(street) {
  if (!street?.physics?.setting) return { buff: NORMAL_BUFF, scale: 1, approximate: false };
  const m = physicsMultipliers(street.physics.setting);
  return {
    buff: { speed: m.speed, jump: m.jump, gravity: m.gravity, vyMax: m.vyMax > 0 ? m.vyMax : null, accel: m.accel, airAccel: m.airAccel, friction: m.friction, airDrag: m.airDrag, jetpack: m.jetpack, tripleJump: m.tripleJump },
    scale: m.scale,
    // A swim street (jetpack) strokes on every airborne press: far more reach than the model has.
    approximate: m.jetpack === true,
  };
}

/** The physics world of one street: lines in columns, walls, ladders, the shared stepper. */
export function streetWorld(street, { buff = null, scale = null } = {}) {
  const b = streetBuff(street);
  const lines = platformsScreen(street);
  const W = streetWidth(street);
  const H = streetHeight(street);
  const ncol = Math.max(1, Math.ceil(W / COL) + 1);
  const cols = Array.from({ length: ncol }, () => []);
  for (const p of lines) {
    const a = Math.max(0, Math.floor((Math.min(p.x1, p.x2) - COL_PAD) / COL));
    const z = Math.min(ncol - 1, Math.floor((Math.max(p.x1, p.x2) + COL_PAD) / COL));
    for (let i = a; i <= z; i += 1) cols[i].push(p);
  }
  const bottom = lines.reduce((m, p) => Math.max(m, p.y1, p.y2), 0);
  const col = (x) => cols[Math.max(0, Math.min(ncol - 1, Math.floor(x / COL)))];
  // The world's floor: where no standable line is within 8 px across, the game's ground resolve
  // stands the avatar at the lowest line's height (avatar-step.js avatarGround), so a seam or a
  // missing stretch of floor is walked over. Those stretches are virtual lines in the graph only.
  const covered = lines.filter(isStandable).map((p) => [Math.min(p.x1, p.x2) - 8, Math.max(p.x1, p.x2) + 8]).sort((a, b) => a[0] - b[0]);
  const floors = [];
  let at = 24;
  for (const [a, z] of covered) {
    if (a > at + 1) floors.push([at, a - 1]);
    at = Math.max(at, z + 1);
  }
  if (at < W - 24) floors.push([at, W - 24]);
  const graphLines = [...lines];
  if (lines.length) {
    for (const [a, z] of floors) graphLines.push({ id: `floor@${Math.round(a)}`, x1: a, y1: bottom, x2: z, y2: bottom, pcPerm: -1, virtual: true });
  }
  graphLines.forEach((p, i) => { p.index = i; });
  const gcols = Array.from({ length: ncol }, () => []);
  for (const p of graphLines) {
    const a = Math.max(0, Math.floor((Math.min(p.x1, p.x2) - COL_PAD) / COL));
    const z = Math.min(ncol - 1, Math.floor((Math.max(p.x1, p.x2) + COL_PAD) / COL));
    for (let i = a; i <= z; i += 1) gcols[i].push(p);
  }
  const gcol = (x) => gcols[Math.max(0, Math.min(ncol - 1, Math.floor(x / COL)))];
  const world = {
    street,
    lines,
    graphLines,
    gcol,
    bottom,
    W,
    H,
    col,
    barriers: barriersScreen(street),
    walls: wallsScreen(street),
    buff: buff || b.buff,
    scale: scale || b.scale,
    approximate: b.approximate,
    ground: (x, y, vy) => avatarGround(col(x), x, y, vy, { street, bottom }),
  };
  return world;
}

/**
 * PURE: one arc with the shared stepper. `body` starts as given; `dir` is the held side each
 * frame (-1, 0, 1); `airJumpAt` (frames after leaving the floor) gives the one air jump. With
 * `onLand(x, y)` (the stand point there, or -1) a landing on ground that is no line walks on.
 * Returns { points?, landed: {x, y} | null, minY, frames, node? }.
 */
export function runArc(world, body, { dir = 0, airJumpAt = -1, record = false, maxFrames = MAX_FRAMES, launch = false, onLand = null } = {}) {
  const b = { x: body.x, y: body.y, vx: body.vx || 0, vy: body.vy || 0, onGround: Boolean(body.onGround) };
  const points = record ? [{ x: b.x, y: b.y }] : null;
  let minY = b.y;
  let air = 0;
  let left = !b.onGround;
  const jumpV = JUMP_SPEED * world.buff.jump;
  for (let f = 0; f < maxFrames; f += 1) {
    // `launch`: frame 0 is the jump frame, steered on the floor before the jump leaves it.
    b.vx = steerX(b.vx, dir, b.onGround || (launch && f === 0), world.buff);
    if (!b.onGround) {
      if (air === airJumpAt) b.vy = jumpV;
      air += 1;
    }
    stepAvatar(b, { buff: world.buff, platforms: world.col(b.x), barriers: world.barriers, worldW: world.W, bodyScale: world.scale, ground: world.ground });
    if (record) points.push({ x: b.x, y: b.y });
    if (b.y < minY) minY = b.y;
    if (!b.onGround) left = true;
    if (b.onGround && left) {
      // `onLand` names the stand point; ground that is no line (a seam the game bridges) walks on.
      const land = onLand || world.onLand;
      const node = land ? land(b.x, b.y) : 0;
      if (node >= 0) return { points, landed: { x: b.x, y: b.y }, minY, frames: f + 1, node };
      left = false;
    }
    if (b.y > world.H + 400) break;
  }
  return { points, landed: null, minY, frames: maxFrames };
}

/** PURE: a jump from a standing spot (the jump frame steers on the floor, as handleInput does). */
export function jumpArc(world, from, { dir = 0, run = false, speed = null, record = false } = {}) {
  const max = WALK_MAX * world.buff.speed;
  // `speed`: a running jump's speed at takeoff, when the run-up was shorter than a full run (P7).
  const vx = run ? dir * (speed == null ? max : Math.min(max, speed)) : 0;
  return runArc(world, { x: from.x, y: from.y, vx, vy: JUMP_SPEED * world.buff.jump, onGround: false }, { dir, record, launch: true });
}

/**
 * PURE (P7): the speed a run from a standstill reaches over `room` px of floor, stepped with the
 * game's own steering (steerX on the floor, then the move).
 */
export function runUpSpeed(buff, room) {
  let v = 0;
  let x = 0;
  for (let f = 0; f < 120; f += 1) {
    const next = steerX(v, 1, true, buff);
    if (x + next > room) break;
    v = next;
    x += v;
    if (v >= WALK_MAX * buff.speed) break;
  }
  return v;
}

/**
 * PURE: the jump-arc overlay (spec 6.7): from the floor under a point, a plain and a running jump
 * each way, drawn with the validator's stepper. Returns [{ kind, dir, points, landed }].
 */
export function jumpArcs(street, at, world = streetWorld(street)) {
  // The floor at or under the point (the nearest standable line below it).
  let floor = null;
  for (const p of world.col(at.x)) {
    if (!isStandable(p)) continue;
    const y = platformYAt(p, at.x, 0);
    if (y != null && y >= at.y - 2 && (floor == null || y < floor)) floor = y;
  }
  const from = { x: at.x, y: floor ?? at.y };
  const out = [];
  for (const dir of [-1, 1]) {
    for (const run of [false, true]) {
      const r = jumpArc(world, from, { dir, run, record: true });
      out.push({ kind: run ? 'running' : 'plain', dir, points: r.points, landed: r.landed, from });
    }
  }
  return out;
}

// —— The graph ——

class Graph {
  constructor() {
    this.x = [];
    this.y = [];
    this.line = [];
    this.kind = []; // 's' stand point, 'l' ladder
    this.from = [];
    this.to = [];
    this.margin = [];
    this.detail = [];
  }
  node(x, y, line, kind = 's') {
    this.x.push(x);
    this.y.push(y);
    this.line.push(line);
    this.kind.push(kind);
    return this.x.length - 1;
  }
  edge(a, b, margin = Infinity, detail = null) {
    if (a === b || a < 0 || b < 0) return;
    this.from.push(a);
    this.to.push(b);
    this.margin.push(margin);
    this.detail.push(detail);
  }
  /** CSR adjacency, forward and reversed. */
  freeze() {
    const n = this.x.length;
    const build = (src, dst) => {
      const start = new Int32Array(n + 1);
      for (const a of src) start[a + 1] += 1;
      for (let i = 0; i < n; i += 1) start[i + 1] += start[i];
      const fill = start.slice(0, n);
      const adj = new Int32Array(src.length);
      const eid = new Int32Array(src.length);
      for (let e = 0; e < src.length; e += 1) {
        const k = fill[src[e]]++;
        adj[k] = dst[e];
        eid[k] = e;
      }
      return { start, adj, eid };
    };
    this.fwd = build(this.from, this.to);
    this.rev = build(this.to, this.from);
    return this;
  }
  bfs(sources, dir = 'fwd') {
    const g = this[dir];
    const seen = new Uint8Array(this.x.length);
    const queue = [];
    for (const s of sources) if (s >= 0 && !seen[s]) { seen[s] = 1; queue.push(s); }
    for (let q = 0; q < queue.length; q += 1) {
      const a = queue[q];
      for (let k = g.start[a]; k < g.start[a + 1]; k += 1) {
        const b = g.adj[k];
        if (!seen[b]) { seen[b] = 1; queue.push(b); }
      }
    }
    return seen;
  }
  /** Widest path: the best bottleneck margin from the sources to every node (and that bottleneck's edge, in `.edge`). */
  widest(sources) {
    const n = this.x.length;
    const best = new Float64Array(n).fill(-1);
    const neck = new Int32Array(n).fill(-1);
    best.edge = neck;
    const heap = [];
    const push = (v, m) => {
      heap.push([m, v]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] >= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] > heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] > heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    for (const s of sources) if (s >= 0) { best[s] = Infinity; push(s, Infinity); }
    const g = this.fwd;
    while (heap.length) {
      const [m, a] = pop();
      if (m < best[a]) continue;
      for (let k = g.start[a]; k < g.start[a + 1]; k += 1) {
        const b = g.adj[k];
        const e = g.eid[k];
        const w = Math.min(m, this.margin[e]);
        if (w > best[b]) {
          best[b] = w;
          neck[b] = this.margin[e] <= m ? e : neck[a];
          push(b, w);
        }
      }
    }
    return best;
  }
}

/**
 * PURE: build the reach graph of a street. Returns { world, graph, lineNodes, ladders } where
 * lineNodes[i] = { first, count, x0 } for screen line i (null when not standable).
 */
export function buildReachGraph(street, opts = {}) {
  const world = opts.world || streetWorld(street, opts);
  const { graphLines: lines, W, barriers } = world;
  const g = new Graph();
  const lineNodes = lines.map(() => null);
  const lo = 24;
  const hi = W - 24;
  // 1. Stand points.
  lines.forEach((p, i) => {
    if (!isStandable(p)) return;
    const a = Math.max(lo, p.x1);
    const z = Math.min(hi, p.x2);
    if (z < a) return;
    const first = g.x.length;
    let count = 0;
    for (let x = a; ; x += STAND_STEP) {
      let xx = Math.min(x, z);
      // Nobody stands on a wall's own x (blockBarrierCrossing stops a body 1 px short of it).
      const wall = barriers.find((w) => Math.abs(w.x - xx) < 1.5 && w.yTop < platformYAt(p, xx, 4) && w.yBot > platformYAt(p, xx, 4) - 80);
      if (wall) xx += xx > (a + z) / 2 ? -1.5 : 1.5;
      g.node(xx, platformYAt(p, xx, 4), i);
      count += 1;
      if (x >= z) break;
    }
    lineNodes[i] = { first, count, x0: a, x1: z };
  });
  const nearestOn = (i, x) => {
    const ln = lineNodes[i];
    if (!ln) return -1;
    const k = Math.max(0, Math.min(ln.count - 1, Math.round((x - ln.x0) / STAND_STEP)));
    return ln.first + k;
  };
  /** The stand point a body landed on: a standable line under its feet within 2 px. */
  const landingNode = (x, y) => {
    let best = -1;
    let bestD = 3;
    for (const p of world.gcol(x)) {
      if (!isStandable(p)) continue;
      const ly = platformYAt(p, x, 4);
      if (ly == null) continue;
      const d = Math.abs(ly - y);
      if (d < bestD) {
        const idx = p.index;
        const n = nearestOn(idx, x);
        if (n >= 0) { bestD = d; best = n; }
      }
    }
    return best;
  };
  // Walking along a line, stopped by walls.
  lineNodes.forEach((ln) => {
    if (!ln) return;
    for (let k = 0; k + 1 < ln.count; k += 1) {
      const a = ln.first + k;
      const b = a + 1;
      const ya = g.y[a];
      if (blocked(barriers, g.x[a], g.x[b], ya, world)) { /* wall */ } else g.edge(a, b);
      if (blocked(barriers, g.x[b], g.x[a], g.y[b], world)) { /* wall */ } else g.edge(b, a);
    }
  });
  // Joined line ends.
  const dangling = [];
  lineNodes.forEach((ln, i) => {
    if (!ln) return;
    for (const [end, side] of [[ln.first, -1], [ln.first + ln.count - 1, 1]]) {
      const ex = g.x[end];
      const ey = g.y[end];
      let joined = false;
      for (const q of world.gcol(ex)) {
        const j = q.index;
        if (j === i || !lineNodes[j]) continue;
        const qy = platformYAt(q, ex + side * JOIN_X, JOIN_X);
        if (qy == null || Math.abs(qy - ey) > JOIN_Y) continue;
        const n = nearestOn(j, ex + side * JOIN_X);
        if (n < 0 || Math.abs(g.x[n] - ex) > STAND_STEP + JOIN_X) continue;
        // Going down a step is a fall the walk-off finds; up to 16 px the ground resolve steps up.
        g.edge(end, n);
        g.edge(n, end);
        if (qy >= ey - 2 && side * (Math.max(q.x1, q.x2) - ex) > 0 && Math.abs(qy - ey) <= 4) joined = true;
      }
      if (!joined) dangling.push([end, side]);
      // A stretch of the world's floor meets real lines: walking on from it, the ground resolve
      // stands the avatar on the lowest line there, however high (avatarGround); walking off that
      // line drops back to the floor.
      if (lines[i].virtual) {
        let low = null;
        for (const q of world.gcol(ex + side * 9)) {
          if (q.virtual || !lineNodes[q.index]) continue;
          const qy = platformYAt(q, ex + side * 9, 8);
          if (qy != null && (!low || qy > low.y)) low = { q, y: qy };
        }
        if (low) {
          const n = nearestOn(low.q.index, ex + side * 9);
          g.edge(end, n);
          g.edge(n, end);
        }
      }
    }
  });
  const marginOf = (start, r) => {
    const sy = g.y[start];
    const ly = r.landed.y;
    // Rising: how much higher the apex went than the landing.
    return ly < sy - 1 ? ly - r.minY : Infinity;
  };
  world.onLand = landingNode;
  // P7: room to run up behind each stand point, each way (to a wall, or to a free line end; a
  // joined end runs on), and the speed a run that long reaches.
  const joinedEnd = new Set();
  lineNodes.forEach((ln) => {
    if (!ln) return;
    const free = new Set(dangling.filter(([e]) => e === ln.first || e === ln.first + ln.count - 1).map(([e, side]) => `${e}:${side}`));
    if (!free.has(`${ln.first}:-1`)) joinedEnd.add(`${ln.first}:-1`);
    if (!free.has(`${ln.first + ln.count - 1}:1`)) joinedEnd.add(`${ln.first + ln.count - 1}:1`);
  });
  const roomBack = new Float64Array(g.x.length); // room behind a node for a run to the right
  const roomFwd = new Float64Array(g.x.length); // room behind a node for a run to the left
  lineNodes.forEach((ln) => {
    if (!ln) return;
    for (let k = 0; k < ln.count; k += 1) {
      const n = ln.first + k;
      if (k === 0) roomBack[n] = joinedEnd.has(`${n}:-1`) ? RUN_ROOM_FREE : 0;
      else roomBack[n] = blocked(barriers, g.x[n - 1], g.x[n], g.y[n - 1], world) ? 0 : Math.min(RUN_ROOM_FREE, roomBack[n - 1] + Math.abs(g.x[n] - g.x[n - 1]));
    }
    for (let k = ln.count - 1; k >= 0; k -= 1) {
      const n = ln.first + k;
      if (k === ln.count - 1) roomFwd[n] = joinedEnd.has(`${n}:1`) ? RUN_ROOM_FREE : 0;
      else roomFwd[n] = blocked(barriers, g.x[n + 1], g.x[n], g.y[n + 1], world) ? 0 : Math.min(RUN_ROOM_FREE, roomFwd[n + 1] + Math.abs(g.x[n + 1] - g.x[n]));
    }
  });
  const speedCache = new Map();
  const runSpeed = (room) => {
    const k = Math.round(room);
    if (!speedCache.has(k)) speedCache.set(k, runUpSpeed(world.buff, k));
    return speedCache.get(k);
  };
  /** A running jump's speed from screen x on line i, each way (the room behind it on that line). */
  const roomAt = (s, dir, dx = 0) => Math.max(0, (dir > 0 ? roomBack[s] : roomFwd[s]) + dir * dx);
  /** P7: whether a try landed where the jump it varies did: that floor, or one level with it near there (not the floor it left). */
  const sameLanding = (t, want, startLine) => {
    const n = t.landed ? (t.node ?? landingNode(t.landed.x, t.landed.y)) : -1;
    if (n < 0) return false;
    if (g.line[n] === g.line[want]) return true;
    return g.line[n] !== startLine && Math.abs(g.y[n] - g.y[want]) <= 4 && Math.abs(g.x[n] - g.x[want]) <= 48;
  };
  /**
   * P7: the share of LANDING_TRIES takeoffs around stand point `s` that land where `r` did (a
   * takeoff past the end of the floor it starts on is taken at that end: a player can stand no
   * further, and the game's 90 ms coyote time forgives a late press there). When both widest tries
   * land, the rest are taken to; under LANDING_SHARE, takeoffs 4 and 8 px either side are tried
   * as well and the best spot counts.
   */
  const landingShare = (s, spec, r) => {
    const line = g.line[s];
    const ln = lineNodes[line];
    const p = lines[line];
    const want = r.node;
    const lands = (x0) => {
      const x = Math.max(ln.x0, Math.min(ln.x1, x0));
      const y = platformYAt(p, x, 4);
      if (y == null) return false;
      const speed = spec.run ? runSpeed(roomAt(s, spec.dir, x - g.x[s])) : null;
      return sameLanding(jumpArc(world, { x, y }, { dir: spec.dir, run: spec.run, speed }), want, line);
    };
    const share = (x) => {
      const ends = [LANDING_TRIES[0], LANDING_TRIES[LANDING_TRIES.length - 1]];
      if (ends.every((o) => lands(x + o))) return 1;
      return LANDING_TRIES.reduce((k, o) => k + (lands(x + o) ? 1 : 0), 0) / LANDING_TRIES.length;
    };
    let best = share(g.x[s]);
    for (const shift of [-4, 4, -8, 8]) {
      if (best >= LANDING_SHARE) break;
      const x = g.x[s] + shift;
      if (x < ln.x0 || x > ln.x1) continue;
      best = Math.max(best, share(x));
    }
    return best;
  };
  /** P7: the share of AIR_JUMP_TRIES presses around frame `f` that land where `r` did, walking off `start`. */
  const airJumpShare = (end, start, f, side, r) => {
    let k = 0;
    for (const d of AIR_JUMP_TRIES) {
      const at = f + d;
      if (at < 0) { k += 1; continue; }
      if (sameLanding(runArc(world, start, { dir: side, airJumpAt: at }), r.node, g.line[end])) k += 1;
    }
    return k / AIR_JUMP_TRIES.length;
  };
  const addLanding = (start, r, spec = null) => {
    if (!r.landed) return;
    const n = r.node ?? landingNode(r.landed.x, r.landed.y);
    if (n < 0 || n === start) return;
    r.node = n;
    const mv = marginOf(start, r);
    // A landing on another floor: the share of a keyboard player's tries that make it (P7).
    // Same-floor hops need none; a plain walk-off is steered all the way down, so it needs none.
    let share = null;
    if (g.kind[start] === 's' && g.line[n] !== g.line[start]) {
      if (spec?.kind === 'air') share = airJumpShare(start, spec.start, spec.airJumpAt, spec.dir, r);
      else if (spec?.kind === 'jump') share = landingShare(start, spec, r);
    }
    const score = Math.min(mv / TIGHT_MARGIN, share == null ? Infinity : share / LANDING_SHARE);
    // Each scored edge keeps how it was made (PHY-006's message); with keepSpecs every jump does,
    // so a route can be played back in the game (tools/builder/playtest.mjs).
    const keep = score !== Infinity || opts.keepSpecs;
    g.edge(start, n, score, keep ? {
      kind: spec?.kind || 'fall', from: start, x: g.x[start], y: g.y[start], to: n, lx: r.landed.x, ly: r.landed.y, rise: mv, share,
      air: spec?.kind === 'air', run: Boolean(spec?.run), dir: spec?.dir ?? 0, line: lines[g.line[n]]?.id ?? null,
      ...(spec?.kind === 'air' || spec?.kind === 'fall' ? { airJumpAt: spec.airJumpAt ?? null, vx: spec.start?.vx ?? null } : {}),
      ...(spec?.run ? { vx: spec.dir * runSpeed(roomAt(start, spec.dir)) } : {}),
      ...(spec?.kind === 'hop' ? { hopY: spec.y ?? null, jump: Boolean(spec.jump) } : {}),
    } : null);
  };
  // 2. Jumps from every 16 px and from each end.
  lineNodes.forEach((ln) => {
    if (!ln) return;
    const every = Math.max(1, Math.round(JUMP_STEP / STAND_STEP));
    for (let k = 0; k < ln.count; k += 1) {
      if (k % every !== 0 && k !== ln.count - 1) continue;
      const s = ln.first + k;
      const from = { x: g.x[s], y: g.y[s] };
      addLanding(s, jumpArc(world, from, { dir: 0 }), { kind: 'jump', dir: 0, run: false });
      for (const dir of [-1, 1]) {
        addLanding(s, jumpArc(world, from, { dir }), { kind: 'jump', dir, run: false });
        // A running jump at the speed the floor behind gives room for (P7; P2 started every one at full speed).
        addLanding(s, jumpArc(world, from, { dir, run: true, speed: runSpeed(roomAt(s, dir)) }), { kind: 'jump', dir, run: true });
      }
    }
  });
  // Walking off free ends, at a run and at a step, with the air jump tried every 4th frame.
  const max = WALK_MAX * world.buff.speed;
  for (const [end, side] of dangling) {
    for (const speed of [max, 1]) {
      const start = { x: g.x[end], y: g.y[end], vx: side * speed, vy: 0, onGround: true };
      const fall = runArc(world, start, { dir: speed === max ? side : 0 });
      addLanding(end, fall, { kind: 'fall', start, dir: speed === max ? side : 0 });
      const airFrames = Math.min(fall.frames, 60);
      for (let f = 0; f < airFrames; f += 4) {
        addLanding(end, runArc(world, start, { dir: side, airJumpAt: f }), { kind: 'air', start, airJumpAt: f, dir: side });
      }
    }
  }
  // 3. Ladders.
  const ladders = [];
  for (const wall of world.walls) {
    const L = g.node(wall.x, wall.yBot, -1, 'l');
    ladders.push({ id: wall.id, node: L, wall });
    // Grab it: Up or Down within 28 px across, between 28 px over its top and 64 px under its foot.
    for (const p of world.gcol(wall.x)) {
      const i = p.index;
      const ln = lineNodes[i];
      if (!ln) continue;
      for (let k = 0; k < ln.count; k += 1) {
        const n = ln.first + k;
        if (Math.abs(g.x[n] - wall.x) < 28 && g.y[n] >= wall.yTop - 28 && g.y[n] <= wall.yBot + 64) g.edge(n, L, Infinity, opts.keepSpecs ? { kind: 'mount', ladder: wall.id, x: wall.x } : null);
      }
    }
    const deck = ladderTopDeck(world.col(wall.x), wall.x, wall.yTop + 4, wall.yBot);
    if (deck != null) {
      const n = landingNode(wall.x, deck);
      if (n >= 0) g.edge(L, n, Infinity, opts.keepSpecs ? { kind: 'deck', ladder: wall.id, x: wall.x, ly: deck } : null);
    }
    addLanding(L, runArc(world, { x: wall.x, y: wall.yBot, vx: 0, vy: 0, onGround: false }), { kind: 'hop', dir: 0 });
    const jumpV = JUMP_SPEED * world.buff.jump;
    const heights = [];
    for (let y = wall.yBot - 24; y > wall.yTop + 4; y -= 48) heights.push(y);
    // The top, where game.js holds a climber with no deck (yTop + 4).
    heights.push(wall.yTop + 4);
    for (const y of heights) {
      for (const side of [-1, 1]) {
        addLanding(L, runArc(world, { x: wall.x, y, vx: side * max * OFF_LADDER_RATIO, vy: jumpV / 10, onGround: false }, { dir: side }), { kind: 'hop', dir: side, y });
      }
      for (const dir of [-1, 0, 1]) addLanding(L, runArc(world, { x: wall.x, y, vx: 0, vy: jumpV, onGround: false }, { dir }), { kind: 'hop', dir, y, jump: true });
    }
  }
  g.freeze();
  return { world, graph: g, lineNodes, ladders, nearestOn, landingNode };
}

/** A barrier stops a walk from xa to xb at feet y (the stepper's own rule, blockBarrierCrossing). */
function blocked(barriers, xa, xb, y, world) {
  if (!barriers.length) return false;
  return Math.abs(blockBarrierCrossing(barriers, xa, xb, y, 80 * (world.scale || 1)) - xb) > 0.5;
}

// —— Targets and arrivals ——

/** PURE: a street's exits in screen space: walk-up signposts, ladder-top and buried posts, doors. */
export function streetTargets(street) {
  const out = [];
  for (const s of navigableSignposts(street.signposts)) {
    const p = worldToScreen(street, s.x, s.y);
    const ladder = ladderTopSignpostLadder(street, s);
    const label = (s.connects || []).filter((c) => !c.hidden).map((c) => c.label).join(', ');
    out.push({ kind: 'signpost', id: s.id, x: p.x, y: p.y, w: s.w || 100, h: s.h || 200, label, ladder: ladder ? ladder.id : null, buried: isBuriedSignpost(street, s) });
  }
  for (const d of street.doors || []) {
    if (d.hidden) continue;
    out.push({ kind: 'door', id: d.id, x: d.x, y: d.y, w: d.w || 80, h: d.h || 200, label: d.connect?.label || '' });
  }
  return out;
}

/**
 * PURE: reach a street from its arrivals ([{ x, y, from }], screen space). Returns the graph's
 * findings in raw form: per arrival whether it stands, per target which arrivals reach it and
 * its tightest margin, the reached surfaces, traps and ladders without decks.
 */
export function reachStreet(street, arrivals, opts = {}) {
  const built = buildReachGraph(street, opts);
  const { world, graph: g, lineNodes, ladders, landingNode } = built;
  const targets = streetTargets(street);
  // Arrivals: drop from the point to the floor under it.
  const arr = arrivals.map((a) => {
    const snapped = resolveGround(world.col(a.x), a.x, a.y, 0, 12);
    const r = runArc(world, { x: a.x, y: a.y, vx: 0, vy: 0, onGround: false }, { maxFrames: 240 });
    let node = r.landed ? landingNode(r.landed.x, r.landed.y) : -1;
    if (node < 0 && snapped) node = landingNode(a.x, snapped.y);
    return { ...a, floor: Boolean(snapped), node, landed: r.landed };
  });
  // Nodes at each target.
  const ladderNode = new Map(ladders.map((l) => [l.id, l.node]));
  for (const t of targets) {
    const nodes = [];
    if (t.ladder != null && ladderNode.has(t.ladder)) nodes.push(ladderNode.get(t.ladder));
    const reachX = t.kind === 'door' ? t.w / 2 + DOOR_REACH_X : POST_REACH_X;
    const top = t.buried ? -Infinity : t.y - t.h;
    const bottom = t.buried ? Infinity : t.y + POST_BELOW;
    for (let n = 0; n < g.x.length; n += 1) {
      if (g.kind[n] !== 's') continue;
      if (Math.abs(g.x[n] - t.x) <= (t.buried ? 110 : reachX) && g.y[n] >= top && g.y[n] <= bottom) nodes.push(n);
    }
    t.nodes = nodes;
  }
  const exitNodes = targets.flatMap((t) => t.nodes);
  const fromAll = g.bfs(arr.map((a) => a.node));
  const toExit = g.bfs(exitNodes, 'rev');
  const per = arr.map((a) => (a.node >= 0 ? g.bfs([a.node]) : new Uint8Array(g.x.length)));
  // Each arrival's best route: a tight jump on the only way from one arrival is tight (PHY-006).
  const widest = arr.map((a) => (a.node >= 0 ? g.widest([a.node]) : null));
  for (const t of targets) {
    t.reachedFrom = arr.map((a, i) => t.nodes.some((n) => per[i][n]));
    t.reached = t.reachedFrom.some(Boolean);
    // The tightest of the arrivals' best routes to it (-1 when none reaches it), as a share of
    // the tight-jump limits (under 1 is tight: PHY-006), with that route's tightest jump.
    t.margin = -1;
    t.tight = null;
    widest.forEach((w, i) => {
      if (!w || !t.reachedFrom[i]) return;
      let m = -1;
      let at = -1;
      for (const n of t.nodes) if (w[n] > m) { m = w[n]; at = n; }
      if (t.margin < 0 || m < t.margin) {
        t.margin = m;
        const e = at >= 0 ? w.edge[at] : -1;
        t.tight = e >= 0 ? g.detail[e] : null;
      }
    });
    // The stand point nearest the target that the first arrival missing it reaches (any arrival
    // when all reach it), for the message.
    const miss = t.reachedFrom.findIndex((x) => !x);
    const seen = miss >= 0 ? per[miss] : fromAll;
    let best = -1;
    let bestD = Infinity;
    for (let n = 0; n < g.x.length; n += 1) {
      if (!seen[n] || g.kind[n] !== 's') continue;
      const d = Math.abs(g.x[n] - t.x) + 2 * Math.abs(g.y[n] - t.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    t.closest = best >= 0 ? { x: Math.round(g.x[best]), y: Math.round(g.y[best]), rise: Math.round(g.y[best] - t.y) } : null;
  }
  // Surfaces: per standable line, runs of reached and unreached stand points.
  const surfaces = [];
  const traps = [];
  const unreached = [];
  lineNodes.forEach((ln, i) => {
    if (!ln) return;
    const p = world.graphLines[i];
    let run = null;
    let anyReached = false;
    let trapped = 0;
    for (let k = 0; k < ln.count; k += 1) {
      const n = ln.first + k;
      const r = Boolean(fromAll[n]);
      anyReached ||= r;
      if (r && exitNodes.length && !toExit[n]) trapped += 1;
      if (!run || run.reached !== r) {
        if (run) surfaces.push(run);
        run = { line: p.id, reached: r, x1: g.x[n], y1: g.y[n], x2: g.x[n], y2: g.y[n] };
      } else {
        run.x2 = g.x[n];
        run.y2 = g.y[n];
      }
    }
    if (run) surfaces.push(run);
    if (p.virtual) { /* the world's floor: drawn, never listed */ } else if (!anyReached) unreached.push({ line: p.id, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 });
    if (trapped && !p.virtual) traps.push({ line: p.id, x: Math.round((Math.max(ln.x0, p.x1) + Math.min(ln.x1, p.x2)) / 2), y: Math.round((p.y1 + p.y2) / 2), points: trapped });
  });
  // Ladders: a floor at the foot and a deck at the top (unless a post stands at its top).
  const topPosts = new Set(targets.filter((t) => t.ladder != null).map((t) => t.ladder));
  const deckless = [];
  for (const l of ladders) {
    // A floor the climber can grab it from: Up within 64 px under its foot (findClimbWallNear).
    const foot = world.col(l.wall.x).some((p) => {
      if (!isStandable(p)) return false;
      const y = platformYAt(p, l.wall.x, 4);
      return y != null && y >= l.wall.yBot - 16 && y <= l.wall.yBot + 64;
    });
    const deck = topPosts.has(l.id) ? true : ladderTopDeck(world.col(l.wall.x), l.wall.x, l.wall.yTop + 4, l.wall.yBot) != null;
    if (!foot || !deck) deckless.push({ id: l.id, x: l.wall.x, yTop: l.wall.yTop, yBot: l.wall.yBot, foot: Boolean(foot), deck: Boolean(deck) });
  }
  return {
    approximate: world.approximate,
    nodes: g.x.length,
    edges: g.from.length,
    arrivals: arr.map(({ x, y, from, floor, node }) => ({ x, y, from, floor, stands: node >= 0, reached: node >= 0 })),
    targets: targets.map(({ nodes, ...t }) => t),
    surfaces,
    traps,
    unreached,
    deckless,
  };
}

/**
 * PURE (P7): a way a keyboard player can take from an arrival to each of a street's exits, as
 * steps to play back in the game (tools/builder/playtest.mjs): `walk` to x; `jump` (dir -1, 0, 1;
 * `run` with a run-up) from x; `fall` off a ledge's end; `air` (walk off, then jump `airJumpAt`
 * frames into the fall); `mount` a ladder and climb to its `deck`; `hop` off a ladder. Routes
 * prefer walking and comfortable jumps (a tight one, PHY-006, costs more). Returns
 * { start: {x, y} | null, routes: [{ id, kind, x, y, steps | null }] }.
 */
export function reachRoutes(street, arrival, opts = {}) {
  const built = buildReachGraph(street, { ...opts, keepSpecs: true });
  const { world, graph: g, landingNode } = built;
  const snapped = resolveGround(world.col(arrival.x), arrival.x, arrival.y, 0, 12);
  const r = runArc(world, { x: arrival.x, y: arrival.y, vx: 0, vy: 0, onGround: false }, { maxFrames: 240 });
  let start = r.landed ? landingNode(r.landed.x, r.landed.y) : -1;
  if (start < 0 && snapped) start = landingNode(arrival.x, snapped.y);
  const targets = streetTargets(street);
  if (start < 0) return { start: null, routes: targets.map((t) => ({ id: t.id, kind: t.kind, x: t.x, y: t.y, steps: null })) };
  // Dijkstra: walking costs its length (1 a 200 px), a jump to another floor 1, a tight one 6.
  const n = g.x.length;
  const cost = new Float64Array(n).fill(Infinity);
  const via = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  cost[start] = 0;
  const heap = [[0, start]];
  const fwd = g.fwd;
  while (heap.length) {
    let bi = 0;
    for (let i = 1; i < heap.length; i += 1) if (heap[i][0] < heap[bi][0]) bi = i;
    const [c, a] = heap[bi];
    heap[bi] = heap[heap.length - 1];
    heap.pop();
    if (done[a]) continue;
    done[a] = 1;
    for (let k = fwd.start[a]; k < fwd.start[a + 1]; k += 1) {
      const b = fwd.adj[k];
      const e = fwd.eid[k];
      const d = g.detail[e];
      // A hop along one floor is never needed where walking does: it costs more than any walk.
      const w = d ? (g.margin[e] < 1 ? 6 : g.line[a] === g.line[b] && g.kind[a] === 's' ? 30 : 1) : Math.abs(g.x[b] - g.x[a]) / 200 + 0.01;
      if (c + w < cost[b]) {
        cost[b] = c + w;
        via[b] = e;
        heap.push([c + w, b]);
      }
    }
  }
  const ladderNode = new Map(built.ladders.map((l) => [l.id, l.node]));
  const routes = targets.map((t) => {
    const reachX = t.kind === 'door' ? t.w / 2 + DOOR_REACH_X : POST_REACH_X;
    let best = -1;
    for (let i = 0; i < n; i += 1) {
      if (g.kind[i] !== 's' || !Number.isFinite(cost[i])) continue;
      if (Math.abs(g.x[i] - t.x) <= (t.buried ? 110 : reachX) && (t.buried || (g.y[i] >= t.y - t.h && g.y[i] <= t.y + POST_BELOW))) {
        if (best < 0 || cost[i] + Math.abs(g.x[i] - t.x) / 200 < cost[best] + Math.abs(g.x[best] - t.x) / 200) best = i;
      }
    }
    if (best < 0 && t.ladder != null && Number.isFinite(cost[ladderNode.get(t.ladder)])) best = ladderNode.get(t.ladder);
    if (best < 0) return { id: t.id, kind: t.kind, x: t.x, y: t.y, steps: null };
    const edges = [];
    for (let v = best; v !== start && via[v] >= 0; v = g.from[via[v]]) edges.push(via[v]);
    edges.reverse();
    const steps = [];
    for (const e of edges) {
      const d = g.detail[e];
      const b = g.to[e];
      if (!d) {
        const last = steps[steps.length - 1];
        if (last?.kind === 'walk') { last.x = g.x[b]; last.y = g.y[b]; } else steps.push({ kind: 'walk', x: g.x[b], y: g.y[b] });
        continue;
      }
      steps.push({ ...d, from: undefined, to: undefined, x: d.x ?? g.x[g.from[e]], y: d.y ?? g.y[g.from[e]], toX: g.x[b], toY: g.y[b] });
    }
    // End beside the exit.
    if (g.kind[best] === 's') steps.push({ kind: 'walk', x: Math.max(g.x[best] - 20, Math.min(g.x[best] + 20, t.x)), y: g.y[best] });
    return { id: t.id, kind: t.kind, x: t.x, y: t.y, steps };
  });
  return { start: { x: g.x[start], y: g.y[start] }, routes };
}
