/**
 * Game of Crowns (it_game): hold the crown for 60 seconds to win.
 *
 * Sources (GSJS):
 * - players/inc_games.js games_it_game_splash: the rules card text.
 * - games_tag_player / games_is_it: touching the crown holder steals the
 *   crown unless it is locked; the new holder is locked for 1 s.
 * - games_it_game_is_started: only time below the play line (y >= -1390)
 *   counts; games_it_game_gate pauses the clock when the holder goes back up.
 * - games_end_it_game: the holder wins at 60 s; winner +200 xp +50 currants,
 *   it_game:won / it_game:lost / it_game:seconds_with_crown counters.
 * - items/crown_game_lock.js: touching a Crown Game Lock locks the crown for
 *   4 s (if you hold it), shows "+4 seconds", and respawns after 12 s.
 * - config_prod.js shared_instances.it_game: 4-5 players, can retry.
 * - The arena is the archived instance GHFFV931FRF3TMS (template
 *   LHV2H026E492IAF) with 4 Crown Game Locks and 8 Race Start Positions;
 *   those objrefs carry no coordinates, so spawns and locks are placed on the
 *   recovered platforms.
 */

export const CROWNS_ID = 'it_game';
export const CROWNS_TITLE = 'Game of Crowns';
export const CROWNS_TICKET = 'race_ticket_it_game';
export const CROWNS_STREET = 'GHFFV931FRF3TMS';
export const CROWNS_TEMPLATE = 'LHV2H026E492IAF';
export const CROWNS_WIN_MS = 60_000;
export const CROWNS_PLAY_LINE_WORLD_Y = -1390;
export const CROWNS_TAG_LOCK_MS = 1_000;
export const CROWNS_PICKUP_LOCK_MS = 4_000;
export const CROWNS_LOCK_RESPAWN_MS = 12_000;
export const CROWNS_LOCK_COUNT = 4;
export const CROWNS_WIN_REWARD = Object.freeze({ xp: 200, currants: 50 });
export const CROWNS_PLAYERS = Object.freeze({ min: 4, max: 5 });
export const CROWNS_COUNTDOWN_MS = 4_000;
export const CROWNS_TAG_DISTANCE = 46;
/** A tag also needs the two within 70 px up or down (crowns-feature tick). */
export const CROWNS_TAG_REACH_Y = 70;
/** A Crown Game Lock is touched within 30 px across and 50 px up or down. */
export const CROWNS_LOCK_REACH = Object.freeze({ x: 30, y: 50 });

/**
 * The four starts on the waiting ledges above the play line (screen coords),
 * one per seat of a 4 player ticket (2012-08-10 @glitchlog: "GoC tickets are
 * now 4 player"); the source's 8 Race Start Positions carry no coordinates.
 */
export const CROWNS_START_POINTS = Object.freeze([
  Object.freeze({ x: 1180, y: 243 }),
  Object.freeze({ x: 1800, y: 245 }),
  Object.freeze({ x: 660, y: 275 }),
  Object.freeze({ x: 2330, y: 259 }),
]);

/** The four Crown Game Locks on ledges below the play line (screen coords). */
export const CROWNS_LOCK_POINTS = Object.freeze([
  Object.freeze({ x: 255, y: 1230 }),
  Object.freeze({ x: 1030, y: 1576 }),
  Object.freeze({ x: 1640, y: 1040 }),
  Object.freeze({ x: 2400, y: 1034 }),
]);

/**
 * GHFFV931FRF3TMS location XML <ladders> (x centre, y bottom, h up), lost by
 * the street importer.
 */
export const CROWNS_LADDERS = Object.freeze([
  { id: 'ladder_1312251969412', x: 474, y: -246, h: 456 },
  { id: 'ladder_1313202748828', x: 547, y: -861, h: 317 },
  { id: 'ladder_1312251969466', x: -217, y: -248, h: 595 },
  { id: 'ladder_1312251969444', x: 1120, y: -489, h: 557 },
  { id: 'ladder_1312251969470', x: -991, y: -265, h: 383 },
]);

export const CROWNS_TEXT = Object.freeze({
  rules: Object.freeze([
    'Tag the player with the crown to steal it',
    "The crown can't be stolen when locked",
    'Only time below the "play line" counts',
  ]),
  headline: 'Hold the crown for 60 seconds to win',
  youreIt: (remaining) => `You're it! Keep it for ${remaining} seconds, and win!`,
  youreItAbove: "You're it! Go through the play line to start the timer!",
  stayIt: 'Stay it for 60 seconds, and you win!',
  notIt: "You're no longer it! Get it back before they win!",
  notItAbove: "You're no longer it! Get it back and go through the play line to win!",
  exited: 'You exited the play area! Go back through the play line to start the timer.',
  lockGot: '+4 seconds',
});

/* ------------------------------------------------------------------ */
/* Game state                                                         */
/* ------------------------------------------------------------------ */

export function createCrownsGame(seed = {}) {
  const now = Math.max(0, Number(seed.now) || Date.now());
  const players = {};
  for (const row of seed.players || []) {
    if (!row?.id) continue;
    players[row.id] = {
      id: String(row.id),
      name: String(row.name || row.id).slice(0, 40),
      crownMs: Math.max(0, Math.min(CROWNS_WIN_MS - 1, Number(row.crownMs) || 0)),
      below: false,
      lockUntil: 0,
    };
  }
  const ids = Object.keys(players);
  const roll = Number.isFinite(seed.itRoll) ? seed.itRoll : Math.random();
  const itId = seed.itId && players[seed.itId] ? seed.itId : ids[Math.min(ids.length - 1, Math.floor(roll * ids.length))];
  return {
    status: 'staging',
    createdAt: now,
    startAt: 0,
    finishedAt: 0,
    players,
    itId: itId || null,
    winner: null,
    lastTick: 0,
    locks: [],
  };
}

export function beginCrownsCountdown(game, now = Date.now()) {
  if (!game || game.status !== 'staging') return false;
  game.status = 'countdown';
  game.startAt = now + CROWNS_COUNTDOWN_MS;
  return true;
}

export function crownsCountdownCue(game, now = Date.now()) {
  if (!game || game.status !== 'countdown') return '';
  const remaining = game.startAt - now;
  if (remaining <= 0) return 'GO!';
  if (remaining > 3_000) return 'READY?';
  return String(Math.max(1, Math.ceil(remaining / 1_000)));
}

export function crownsLocked(game, id, now = Date.now()) {
  return Boolean(game?.players?.[id] && game.players[id].lockUntil > now);
}

export function crownRemainingMs(game, id) {
  const p = game?.players?.[id];
  return p ? Math.max(0, CROWNS_WIN_MS - p.crownMs) : CROWNS_WIN_MS;
}

/** Seconds left on the holder's crown clock, rounded up like the overlay. */
export function crownRemainingSeconds(game, id) {
  return Math.ceil(crownRemainingMs(game, id) / 1000);
}

/**
 * Advance the clock. `below` maps player id → whether that player stands
 * below the play line right now. Returns the events since the last tick.
 */
export function tickCrowns(game, now = Date.now(), below = {}) {
  const events = [];
  if (!game) return events;
  if (game.status === 'countdown' && now >= game.startAt) {
    game.status = 'running';
    game.lastTick = game.startAt;
    events.push({ type: 'started', itId: game.itId });
  }
  if (game.status === 'running') {
    // The elapsed interval counts with the holder's position at its start.
    const dt = Math.max(0, now - (game.lastTick || now));
    game.lastTick = now;
    const it = game.players[game.itId];
    if (it && it.below) {
      it.crownMs = Math.min(CROWNS_WIN_MS, it.crownMs + dt);
      if (it.crownMs >= CROWNS_WIN_MS) {
        game.status = 'finished';
        game.finishedAt = now;
        game.winner = it.id;
        events.push({ type: 'won', winner: it.id });
      }
    }
  }
  for (const [id, p] of Object.entries(game.players)) {
    const isBelow = Boolean(below[id]);
    if (game.status === 'running' && isBelow !== p.below) {
      events.push({ type: isBelow ? 'entered_play' : 'exited_play', id, isIt: id === game.itId });
    }
    p.below = isBelow;
  }
  return events;
}

/** `tagger` touched `other`; whoever holds an unlocked crown loses it. */
export function tagCrowns(game, a, b, now = Date.now()) {
  if (!game || game.status !== 'running' || a === b) return null;
  const pa = game.players[a];
  const pb = game.players[b];
  if (!pa || !pb) return null;
  let from = null;
  let to = null;
  if (game.itId === a && !crownsLocked(game, a, now)) {
    from = a;
    to = b;
  } else if (game.itId === b && !crownsLocked(game, b, now)) {
    from = b;
    to = a;
  }
  if (!from) return null;
  game.itId = to;
  game.players[to].lockUntil = now + CROWNS_TAG_LOCK_MS;
  return { type: 'crown_passed', from, to };
}

/** Lay out the Crown Game Locks (positions in screen space). */
export function placeCrownLocks(game, points = []) {
  if (!game) return [];
  game.locks = points.slice(0, CROWNS_LOCK_COUNT).map((pt, index) => ({
    index,
    x: Math.round(pt.x),
    y: Math.round(pt.y),
    respawnAt: 0,
  }));
  return game.locks;
}

export function crownLockReady(lock, now = Date.now()) {
  return Boolean(lock && lock.respawnAt <= now);
}

/** crown_game_lock.js onPlayerCollision: consume, maybe lock the crown. */
export function pickupCrownLock(game, playerId, index, now = Date.now()) {
  const lock = game?.locks?.[index];
  if (!lock || game.status !== 'running' || !game.players[playerId] || !crownLockReady(lock, now)) {
    return { ok: false };
  }
  lock.respawnAt = now + CROWNS_LOCK_RESPAWN_MS;
  const locked = game.itId === playerId;
  if (locked) {
    // games_it_game_lock(): restart a 4 s lock (a new pickup resets the timer).
    game.players[playerId].lockUntil = now + CROWNS_PICKUP_LOCK_MS;
  }
  return { ok: true, locked, text: CROWNS_TEXT.lockGot };
}

export function crownsResult(game, youId = 'you') {
  if (!game || game.status !== 'finished') return null;
  const won = game.winner === youId;
  return {
    won,
    winner: game.winner,
    winnerName: game.players[game.winner]?.name || '',
    reward: won ? { ...CROWNS_WIN_REWARD } : { xp: 0, currants: 0 },
    secondsWithCrown: Math.floor((game.players[youId]?.crownMs || 0) / 1000),
  };
}

/** Scoreboard rows: most crown time first. */
export function crownsStandings(game) {
  return Object.values(game?.players || {})
    .map((p) => ({ id: p.id, name: p.name, seconds: Math.floor(p.crownMs / 1000), it: p.id === game.itId }))
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ */
/* Navigation graph for the stand-in players                          */
/* ------------------------------------------------------------------ */

const NAV = Object.freeze({ runSpeed: 4.4, jumpVelocity: 9.6, gravity: 0.42, spacing: 90 });

function yAt(p, x) {
  const dx = p.x2 - p.x1;
  if (Math.abs(dx) < 1e-6) return Math.min(p.y1, p.y2);
  return p.y1 + ((x - p.x1) / dx) * (p.y2 - p.y1);
}

function outside(x, p) {
  return x < Math.min(p.x1, p.x2) - 8 || x > Math.max(p.x1, p.x2) + 8;
}

function jumpable(dx, rise, margin = 0.85, jumpScale = 1) {
  const g = NAV.gravity;
  const v = NAV.jumpVelocity * jumpScale;
  if (rise > ((v * v) / (2 * g)) * margin) return false;
  const disc = v * v - 2 * g * rise;
  if (disc < 0) return false;
  const frames = (v + Math.sqrt(disc)) / g;
  return Math.abs(dx) <= frames * NAV.runSpeed * margin;
}

/**
 * Nodes every ~90 px along each walkable platform; edges for walking along a
 * platform, jumping up or across to another, and dropping off an end.
 * Climb walls add vertical edges.
 */
export function buildNavGraph(platforms = [], walls = [], opts = {}) {
  const js = opts.jumpScale || 1;
  const nodes = [];
  const byPlatform = [];
  platforms.forEach((p, pi) => {
    const len = Math.abs(p.x2 - p.x1);
    if (len < 24) {
      byPlatform.push([]);
      return;
    }
    const ids = [];
    const count = Math.max(1, Math.round(len / NAV.spacing));
    for (let i = 0; i <= count; i += 1) {
      const x = Math.min(p.x1, p.x2) + 10 + ((len - 20) * i) / count;
      ids.push(nodes.length);
      nodes.push({ id: nodes.length, x: Math.round(x), y: Math.round(yAt(p, x)), platform: pi, end: i === 0 ? -1 : i === count ? 1 : 0 });
    }
    byPlatform.push(ids);
  });
  const edges = nodes.map(() => []);
  const link = (a, b, mode, cost) => edges[a].push({ to: b, mode, cost });
  for (const ids of byPlatform) {
    for (let i = 1; i < ids.length; i += 1) {
      const a = nodes[ids[i - 1]];
      const b = nodes[ids[i]];
      const cost = Math.hypot(b.x - a.x, b.y - a.y) / NAV.runSpeed;
      link(a.id, b.id, 'walk', cost);
      link(b.id, a.id, 'walk', cost);
    }
  }
  for (const a of nodes) {
    for (const b of nodes) {
      if (a.platform === b.platform) continue;
      const dx = b.x - a.x;
      const rise = a.y - b.y;
      if (Math.abs(dx) > 240) continue;
      if (rise > 0) {
        if (jumpable(dx, rise, 0.85, js)) link(a.id, b.id, 'jump', 18 + Math.abs(dx) / NAV.runSpeed + rise / 6);
      } else if (rise < -8) {
        // Run off a ledge end outward, or jump and land lower down.
        const fallFrames = Math.sqrt((2 * -rise) / NAV.gravity);
        if (a.end !== 0 && Math.sign(dx) === a.end && Math.abs(dx) >= 16 && Math.abs(dx) <= 20 + fallFrames * NAV.runSpeed * 0.8) {
          link(a.id, b.id, 'drop', 12 + Math.abs(dx) / NAV.runSpeed + Math.sqrt(-rise));
        } else if (Math.abs(dx) > 30 && outside(b.x, platforms[a.platform]) && jumpable(dx, rise, 0.85, js)) {
          // A jump down must clear the take-off ledge (one-way from above).
          link(a.id, b.id, 'jump', 20 + Math.abs(dx) / NAV.runSpeed + Math.sqrt(-rise));
        }
      } else if (Math.abs(dx) > 30 && jumpable(dx, 0, 0.85, js)) {
        link(a.id, b.id, 'jump', 18 + Math.abs(dx) / NAV.runSpeed);
      }
    }
  }
  // Ladders: rungs every ~80 px; step on from a ledge, climb, or jump off
  // sideways at any rung (game.js stopClimb jump-off) onto a ledge in reach.
  const ground = nodes.slice();
  for (const w of walls) {
    const rungs = [];
    const count = Math.max(1, Math.round((w.yBot - w.yTop) / 80));
    for (let i = 0; i <= count; i += 1) {
      const y = Math.round(w.yBot - ((w.yBot - w.yTop) * i) / count);
      const id = nodes.length;
      nodes.push({ id, x: Math.round(w.x), y, platform: -1, end: 0, wall: w.id || true });
      edges.push([]);
      rungs.push(id);
    }
    for (let i = 1; i < rungs.length; i += 1) {
      const cost = (nodes[rungs[i - 1]].y - nodes[rungs[i]].y) / 2.35;
      link(rungs[i - 1], rungs[i], 'climb', cost);
      link(rungs[i], rungs[i - 1], 'climb', cost);
    }
    for (const r of rungs) {
      const rung = nodes[r];
      for (const n of ground) {
        const dx = n.x - rung.x;
        const dy = n.y - rung.y;
        if (Math.abs(dx) < 70 && Math.abs(dy) < 34) {
          link(n.id, r, 'climb', 6 + Math.abs(dx) / NAV.runSpeed);
          link(r, n.id, 'climb', 6 + Math.abs(dx) / NAV.runSpeed);
        } else if (Math.abs(dx) >= 24 && Math.abs(dx) <= 240 && jumpable(dx, -dy, 0.85, js)) {
          link(r, n.id, 'jump', 20 + Math.abs(dx) / NAV.runSpeed);
        }
      }
    }
  }
  return { nodes, edges };
}

export function nearestNavNode(graph, x, y, filter = null) {
  let best = null;
  let bestD = Infinity;
  for (const n of graph.nodes) {
    if (filter && !filter(n)) continue;
    const d = Math.hypot(n.x - x, (n.y - y) * 1.6);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

function dijkstra(graph, from) {
  const dist = new Map([[from.id, 0]]);
  const prev = new Map();
  const open = new Set([from.id]);
  const done = new Set();
  while (open.size) {
    let cur = null;
    let curD = Infinity;
    for (const id of open) {
      const d = dist.get(id);
      if (d < curD) {
        curD = d;
        cur = id;
      }
    }
    open.delete(cur);
    done.add(cur);
    for (const edge of graph.edges[cur]) {
      if (done.has(edge.to)) continue;
      const nd = curD + edge.cost;
      if (nd < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nd);
        prev.set(edge.to, { id: cur, mode: edge.mode });
        open.add(edge.to);
      }
    }
  }
  return { dist, prev };
}

function rebuild(graph, from, toId, prev) {
  const out = [];
  let id = toId;
  while (id !== from.id) {
    const step = prev.get(id);
    const n = graph.nodes[id];
    out.unshift({ x: n.x, y: n.y, mode: step.mode });
    id = step.id;
  }
  out.unshift({ x: from.x, y: from.y, mode: 'start' });
  return out;
}

/** Dijkstra over the nav graph: [{ x, y, mode }] from `from` to `to`. */
export function findNavPath(graph, from, to) {
  if (!graph || !from || !to) return [];
  const { dist, prev } = dijkstra(graph, from);
  return dist.has(to.id) ? rebuild(graph, from, to.id, prev) : [];
}

/**
 * Path to the reachable node closest to (x, y): one-way drops can strand a
 * chaser below its quarry, so it closes in as far as the arena allows.
 */
export function findNavPathToward(graph, from, x, y) {
  if (!graph || !from) return [];
  const { dist, prev } = dijkstra(graph, from);
  let best = null;
  let bestD = Infinity;
  for (const id of dist.keys()) {
    const n = graph.nodes[id];
    const d = Math.hypot(n.x - x, (n.y - y) * 1.6);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best == null || best === from.id ? [] : rebuild(graph, from, best, prev);
}

/** World → screen y of the play line for an imported street. */
export function playLineScreenY(street) {
  return CROWNS_PLAY_LINE_WORLD_Y - (street?.bounds?.t ?? -2000);
}
