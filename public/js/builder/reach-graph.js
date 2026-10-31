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
const COL = 64;
const COL_PAD = 24;

export const REACH_LIMITS = Object.freeze([
  'Plain jump only: no triple jump, no coyote time, no jump buffer. Reachable means reachable by a new player.',
  'Sampled, not exhaustive: in the air the avatar only holds toward one side, so a path that needs a reversal in the air can be missed.',
  'Fixed 60 fps steps; a slow frame bends arcs a little (the 8 px tight-jump margin covers it).',
  'A running jump starts at full speed from any spot, even one with no room for a run-up; a tight jump is judged by height only.',
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
export function jumpArc(world, from, { dir = 0, run = false, record = false } = {}) {
  const max = WALK_MAX * world.buff.speed;
  return runArc(world, { x: from.x, y: from.y, vx: run ? dir * max : 0, vy: JUMP_SPEED * world.buff.jump, onGround: false }, { dir, record, launch: true });
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
  }
  node(x, y, line, kind = 's') {
    this.x.push(x);
    this.y.push(y);
    this.line.push(line);
    this.kind.push(kind);
    return this.x.length - 1;
  }
  edge(a, b, margin = Infinity) {
    if (a === b || a < 0 || b < 0) return;
    this.from.push(a);
    this.to.push(b);
    this.margin.push(margin);
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
  /** Widest path: the best bottleneck margin from the sources to every node. */
  widest(sources) {
    const n = this.x.length;
    const best = new Float64Array(n).fill(-1);
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
        const w = Math.min(m, this.margin[g.eid[k]]);
        if (w > best[b]) { best[b] = w; push(b, w); }
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
  const addLanding = (start, r) => {
    if (!r.landed) return;
    const n = r.node ?? landingNode(r.landed.x, r.landed.y);
    if (n >= 0 && n !== start) g.edge(start, n, marginOf(start, r));
  };
  // 2. Jumps from every 16 px and from each end.
  lineNodes.forEach((ln) => {
    if (!ln) return;
    const every = Math.max(1, Math.round(JUMP_STEP / STAND_STEP));
    for (let k = 0; k < ln.count; k += 1) {
      if (k % every !== 0 && k !== ln.count - 1) continue;
      const s = ln.first + k;
      const from = { x: g.x[s], y: g.y[s] };
      addLanding(s, jumpArc(world, from, { dir: 0 }));
      for (const dir of [-1, 1]) {
        addLanding(s, jumpArc(world, from, { dir }));
        addLanding(s, jumpArc(world, from, { dir, run: true }));
      }
    }
  });
  // Walking off free ends, at a run and at a step, with the air jump tried every 4th frame.
  const max = WALK_MAX * world.buff.speed;
  for (const [end, side] of dangling) {
    for (const speed of [max, 1]) {
      const start = { x: g.x[end], y: g.y[end], vx: side * speed, vy: 0, onGround: true };
      const fall = runArc(world, start, { dir: speed === max ? side : 0 });
      addLanding(end, fall);
      const airFrames = Math.min(fall.frames, 60);
      for (let f = 0; f < airFrames; f += 4) {
        addLanding(end, runArc(world, start, { dir: side, airJumpAt: f }));
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
        if (Math.abs(g.x[n] - wall.x) < 28 && g.y[n] >= wall.yTop - 28 && g.y[n] <= wall.yBot + 64) g.edge(n, L);
      }
    }
    const deck = ladderTopDeck(world.col(wall.x), wall.x, wall.yTop + 4, wall.yBot);
    if (deck != null) {
      const n = landingNode(wall.x, deck);
      if (n >= 0) g.edge(L, n);
    }
    addLanding(L, runArc(world, { x: wall.x, y: wall.yBot, vx: 0, vy: 0, onGround: false }));
    const jumpV = JUMP_SPEED * world.buff.jump;
    const heights = [];
    for (let y = wall.yBot - 24; y > wall.yTop + 4; y -= 48) heights.push(y);
    // The top, where game.js holds a climber with no deck (yTop + 4).
    heights.push(wall.yTop + 4);
    for (const y of heights) {
      for (const side of [-1, 1]) {
        addLanding(L, runArc(world, { x: wall.x, y, vx: side * max * OFF_LADDER_RATIO, vy: jumpV / 10, onGround: false }, { dir: side }));
      }
      for (const dir of [-1, 0, 1]) addLanding(L, runArc(world, { x: wall.x, y, vx: 0, vy: jumpV, onGround: false }, { dir }));
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
    // The tightest of the arrivals' best routes to it (-1 when none reaches it).
    t.margin = -1;
    widest.forEach((w, i) => {
      if (!w || !t.reachedFrom[i]) return;
      const m = t.nodes.reduce((x, n) => Math.max(x, w[n]), -1);
      t.margin = t.margin < 0 ? m : Math.min(t.margin, m);
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
