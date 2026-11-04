// Build public/assets/content/one-way-roads.json: the signposts a player cannot reach from where
// another signpost drops them on a street, so a route never sends you up a street that only goes
// down (player report 82: from the bottom of The Other Drop, 975 destinations went up through
// Eastern Approach, 1,100 px above the floor with no ladder).
//
// How a street is read (generous on purpose: a doubt keeps the road two-way):
// - Floors: every line the avatar stands on (street-model.js isStandable), sampled every 20 px.
// - A move from one floor point to another: a jump that rises at most the highest jump there is
//   on that street's physics (a running Big 'Un Triple Jump, 1.8x, avatar-step.js flatJump: 500 px
//   on normal physics), or any drop, as far sideways as full walking speed carries the avatar in
//   the air for that rise or drop, plus a body width. Walls in the way and ceilings are ignored.
// - Ladders and climbable walls (street-model.js climbWallsWorld): reached from any floor point
//   beside them that can jump to their foot or drop onto them, and left onto any floor beside
//   them up to a jump over their top.
// - A signpost is reached from a floor point beside it (its width plus a margin) no more than a
//   jump below its foot, or anywhere above it.
// - Where the avatar arrives: the source's arrival point on the signpost that leads here
//   (connects[].arrive), dropped onto the floor under it.
// - Streets left two-way without a look: swimming streets (jetpack physics: strokes climb without
//   end), streets with location events or event boxes (platforms switched by scripts, bounce
//   shrooms, teleports), streets with fewer than two signposts.
//
// Output, for each street with a road that cannot be reached from some arrival:
//   streets[street].cut[from] = [to, ...]   arriving from `from`, the signposts to `to` are out of reach
//   streets[street].reach[to] = [platform ids]  the floors from which the signpost to `to` is reached
//     (the Map's route start: js/map-routes.js startCut looks up the floor under the player)
//
// Usage: node tools/routes/build-one-way.mjs           write it
//        node tools/routes/build-one-way.mjs --check   exit 1 if the file is stale (tests/one-way-roads.test.js)
//        node tools/routes/build-one-way.mjs --report  print the verdicts (swimming, events, one-way)
//        node tools/routes/build-one-way.mjs --jump=1  the same for a smaller best jump (1 = a plain jump)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { flatJump, NORMAL_BUFF, WALK_MAX, JUMP_SPEED, avatarFall } from '../../public/js/avatar-step.js?v=de5b3a16';
import { isStandable, climbWallsWorld } from '../../public/js/street-model.js?v=505d8990';
import { physicsMultipliers } from '../../public/js/location-events.js?v=05663361';

const check = process.argv.includes('--check');
const report = process.argv.includes('--report');
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pub = join(root, 'public');
const index = JSON.parse(readFileSync(join(pub, 'assets/streets/index.json'), 'utf8'));
const keys = new Set(Object.keys(index.streets));

/** A running Big 'Un Triple Jump at its best (movement.js rawTripleJumpMultiplier 1.5 + 0.3, upgrade 1). */
export const BEST_JUMP = 1.8;
const STEP = 20;
/** About an avatar's width: the sideways slack on every move and around a signpost. */
const BODY = 40;
const SIGN_MARGIN = 60;

function resolve(tsid) {
  if (!tsid) return null;
  if (keys.has(tsid)) return tsid;
  const alt = tsid.startsWith('L') ? `G${tsid.slice(1)}` : tsid.startsWith('G') ? `L${tsid.slice(1)}` : null;
  return alt && keys.has(alt) ? alt : null;
}

/** The street's movement multipliers (location-events.js physicsMultipliers), as avatar-step.js takes them. */
export function streetBuff(street) {
  const setting = street.physics?.setting;
  if (!setting) return { ...NORMAL_BUFF };
  const m = physicsMultipliers(setting);
  return {
    ...NORMAL_BUFF,
    speed: m.speed,
    jump: m.jump,
    gravity: m.gravity,
    vyMax: m.vyMax,
    airDrag: m.airDrag,
    airFriction: m.airFriction,
    jetpack: m.jetpack,
    tripleJump: m.tripleJump,
  };
}

/**
 * The best jump's flight on these physics: its apex, and for a landing `dy` px above (or below,
 * negative) the take-off how many frames it can stay in the air on the way there.
 */
export function flight(buff, jump = BEST_JUMP) {
  // A street's multiplier_3_jump scales the triple jump's boost (game.js streetPhysicsTripleJump); never below 1 here.
  const multiplier = 1 + (jump - 1) * Math.max(1, buff.tripleJump ?? 1);
  const apex = flatJump(multiplier, buff, { triple: true }).apex;
  const body = { vx: 0, vy: JUMP_SPEED * (buff.jump ?? 1) * multiplier, onGround: false, tripleJumping: true };
  const ys = [];
  let y = 0;
  for (let f = 0; f < 6000; f += 1) {
    avatarFall(body, buff, 1);
    if (body.vy >= 0) body.tripleJumping = false;
    y += body.vy;
    ys.push(y);
    if (y > 20000) break;
  }
  const speed = WALK_MAX * (buff.speed ?? 1);
  // Frames until the descent passes `dy` above the take-off (screen y up is negative).
  const framesTo = (dy) => {
    let f = 0;
    let rising = true;
    for (let i = 0; i < ys.length; i++) {
      if (i > 0 && ys[i] > ys[i - 1]) rising = false;
      if (!rising && ys[i] >= -dy) return i + 1;
      f = i + 1;
    }
    return f;
  };
  return { apex, reach: (dy) => (dy > apex ? -1 : speed * framesTo(dy) + BODY) };
}

/** A street's standable floors as left-to-right lines with sampled points. */
export function floors(street) {
  const out = [];
  for (const p of street.platforms || []) {
    if (!isStandable(p)) continue;
    const a = p.x1 <= p.x2;
    const x1 = a ? p.x1 : p.x2;
    const x2 = a ? p.x2 : p.x1;
    const y1 = a ? p.y1 : p.y2;
    const y2 = a ? p.y2 : p.y1;
    const n = Math.max(1, Math.ceil((x2 - x1) / STEP));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = x1 + ((x2 - x1) * i) / n;
      pts.push([x, x2 === x1 ? (y1 + y2) / 2 : y1 + ((y2 - y1) * (x - x1)) / (x2 - x1)]);
    }
    out.push({ id: p.id, x1, x2, y1, y2, top: Math.min(y1, y2), bottom: Math.max(y1, y2), pts });
  }
  return out;
}

const yAt = (f, x) => (f.x2 === f.x1 ? (f.y1 + f.y2) / 2 : f.y1 + ((f.y2 - f.y1) * (x - f.x1)) / (f.x2 - f.x1));

/** The floor the avatar lands on from (x, y): the highest one at or under its feet, else the lowest there. */
export function floorUnder(list, x, y) {
  let best = -1;
  let lowest = -1;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (x < f.x1 - 4 || x > f.x2 + 4) continue;
    const fy = yAt(f, Math.max(f.x1, Math.min(f.x2, x)));
    if (fy >= y - 10 && (best < 0 || fy < yAt(list[best], Math.max(list[best].x1, Math.min(list[best].x2, x))))) best = i;
    if (lowest < 0 || fy > yAt(list[lowest], Math.max(list[lowest].x1, Math.min(list[lowest].x2, x)))) lowest = i;
  }
  if (best >= 0) return best;
  if (lowest >= 0) return lowest;
  // No floor at that x: the nearest floor point.
  let near = -1;
  let nd = Infinity;
  list.forEach((f, i) => f.pts.forEach(([px, py]) => {
    const d = Math.hypot(px - x, py - y);
    if (d < nd) {
      nd = d;
      near = i;
    }
  }));
  return near;
}

/** Floor-to-floor and ladder links: adjacency over floors 0..n-1 and climbs n..n+m-1. */
export function links(list, climbs, fl) {
  const n = list.length;
  const adj = Array.from({ length: n + climbs.length }, () => new Set());
  const can = (xa, ya, xb, yb) => {
    const r = fl.reach(ya - yb);
    return r >= 0 && Math.abs(xa - xb) <= r;
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const A = list[i];
      const B = list[j];
      // Quick reject: B wholly higher than any jump from A, or further sideways than the longest
      // flight between them (the deepest drop flies furthest).
      if (B.bottom < A.top - fl.apex) continue;
      const gap = Math.max(0, B.x1 - A.x2, A.x1 - B.x2);
      if (gap > 0 && !(fl.reach(A.top - B.bottom) >= gap)) continue;
      let ok = false;
      for (const [xa, ya] of A.pts) {
        for (const [xb, yb] of B.pts) {
          if (can(xa, ya, xb, yb)) {
            ok = true;
            break;
          }
        }
        if (ok) break;
      }
      if (ok) adj[i].add(j);
    }
  }
  climbs.forEach((c, k) => {
    const node = n + k;
    const top = c.y;
    const bot = c.y + c.h;
    for (let i = 0; i < n; i++) {
      let on = false;
      let off = false;
      for (const [x, y] of list[i].pts) {
        // Onto it: jump to any height of it within reach, or drop onto it.
        if (!on) {
          const target = Math.max(top, Math.min(bot, y));
          if (bot >= y - fl.apex && can(x, y, c.x, target)) on = true;
        }
        // Off it onto this floor: from any height of it.
        if (!off) {
          const from = Math.max(top, Math.min(bot, y));
          if (can(c.x, from, x, y)) off = true;
        }
        if (on && off) break;
      }
      if (on) adj[i].add(node);
      if (off) adj[node].add(i);
    }
  });
  return adj;
}

export function reachFrom(adj, start) {
  const seen = new Set([start]);
  const queue = [start];
  for (let q = 0; q < queue.length; q++) for (const j of adj[queue[q]]) if (!seen.has(j)) {
    seen.add(j);
    queue.push(j);
  }
  return seen;
}

const streetCache = new Map();
function loadStreet(key) {
  if (!streetCache.has(key)) streetCache.set(key, JSON.parse(readFileSync(join(pub, index.streets[key].file), 'utf8')));
  return streetCache.get(key);
}

/** Visible signpost boards: { sign, to } with `to` the street key. */
function roads(street, key) {
  const out = [];
  for (const sign of street.signposts || []) {
    if (!sign || sign.hidden) continue;
    for (const c of sign.connects || []) {
      if (!c || c.hidden) continue;
      const to = resolve(c.tsid);
      if (to && to !== key) out.push({ sign, to, arrive: c.arrive });
    }
  }
  return out;
}

/**
 * Every street's verdict. `jump` overrides BEST_JUMP (the --jump=N report, to see which roads a
 * smaller jump would cut).
 */
export function buildOneWay({ jump = BEST_JUMP } = {}) {
  // Every street a visible signpost leads from, by the street it leads to.
  const arrivals = new Map();
  for (const key of Object.keys(index.streets)) {
    for (const r of roads(loadStreet(key), key)) {
      if (!arrivals.has(r.to)) arrivals.set(r.to, new Set());
      arrivals.get(r.to).add(key);
    }
  }
  const result = {};
  const verdicts = [];
  let looked = 0;
  for (const key of Object.keys(index.streets).sort()) {
    const street = loadStreet(key);
    const here = roads(street, key);
    const exits = [...new Set(here.map((r) => r.to))];
    if (exits.length < 2) continue;
    const buff = streetBuff(street);
    if (buff.jetpack) {
      verdicts.push(`${key} ${street.label}: swimming, two-way`);
      continue;
    }
    if (street.events || street.eventBoxes) {
      verdicts.push(`${key} ${street.label}: location events, two-way`);
      continue;
    }
    const list = floors(street);
    if (!list.length) continue;
    looked++;
    const fl = flight(buff, jump);
    const climbs = climbWallsWorld(street);
    const adj = links(list, climbs, fl);
    // Which floor points stand at each signpost.
    const atSign = (sign) => {
      const half = (Number(sign.w) || 100) / 2 + SIGN_MARGIN;
      const top = sign.y - (Number(sign.h) || 200);
      const out = new Set();
      list.forEach((f, i) => {
        for (const [x, y] of f.pts) {
          if (Math.abs(x - sign.x) > half) continue;
          // At or above its foot (dropping past it), or close enough below to jump to its boards.
          if (y <= sign.y + 30 || y - fl.apex <= top + 60) {
            out.add(i);
            break;
          }
        }
      });
      return out;
    };
    const exitFloors = new Map(exits.map((to) => [to, new Set(here.filter((r) => r.to === to).flatMap((r) => [...atSign(r.sign)]))]));
    // Arrivals: from each street that links here, its arrival point.
    const cut = {};
    for (const from of [...(arrivals.get(key) || [])].sort()) {
      const back = roads(loadStreet(from), from).find((r) => r.to === key);
      // connects[].arrive is where game.js travelTo puts the avatar: screen pixels (street-model.js
      // worldToScreen), so back to world. With none, the signpost here that leads back there.
      const spot = back?.arrive && Number.isFinite(back.arrive.x) && Number.isFinite(back.arrive.y)
        ? { x: back.arrive.x + street.bounds.l, y: back.arrive.y + street.bounds.t }
        : here.find((r) => r.to === from)?.sign;
      if (!spot || !Number.isFinite(spot.x) || !Number.isFinite(spot.y)) continue;
      const start = floorUnder(list, spot.x, spot.y);
      if (start < 0) continue;
      const seen = reachFrom(adj, start);
      const out = exits.filter((to) => to !== from && exitFloors.get(to).size && ![...exitFloors.get(to)].some((i) => seen.has(i)));
      if (out.length) cut[from] = out.sort();
    }
    if (!Object.keys(cut).length) continue;
    // From each floor, which cut signposts are reached (for a route that starts on this street).
    const cutTo = [...new Set(Object.values(cut).flat())].sort();
    const reach = {};
    for (const to of cutTo) {
      const ids = [];
      for (let i = 0; i < list.length; i++) if ([...exitFloors.get(to)].some((e) => reachFrom(adj, i).has(e))) ids.push(list[i].id);
      reach[to] = ids.sort();
    }
    result[key] = { label: street.label, cut, reach };
    const name = (k) => index.streets[k]?.label || k;
    verdicts.push(`${key} ${street.label}: ONE-WAY ${Object.entries(cut).map(([f, t]) => `from ${name(f)} not to ${t.map(name).join(', ')}`).join('; ')} (best jump ${fl.apex.toFixed(0)} px)`);
  }

  const cuts = Object.values(result).reduce((n, s) => n + Object.values(s.cut).reduce((m, t) => m + t.length, 0), 0);
  const summary = `${looked} streets read, ${Object.keys(result).length} with roads out of reach from some arrival (${cuts} arrival-road pairs)`;
  return { result, verdicts, summary };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const jumpArg = process.argv.find((a) => a.startsWith('--jump='));
  const { result, verdicts, summary } = buildOneWay(jumpArg ? { jump: Number(jumpArg.slice(7)) } : {});
  const file = join(pub, 'assets/content/one-way-roads.json');
  const text = `${JSON.stringify({ source: "tools/routes/build-one-way.mjs from assets/streets/*.json floors, ladders, walls, signposts and arrival points, with each street's physics", jump: BEST_JUMP, streets: result })}\n`;
  if (report || jumpArg) {
    for (const v of verdicts) console.log(v);
    console.log(summary);
  } else if (check) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (current !== text) {
      console.error(`stale: ${file} (rebuild with node tools/routes/build-one-way.mjs; would be ${summary})`);
      process.exit(1);
    }
    console.log(`one-way roads current: ${summary}`);
  } else {
    writeFileSync(file, text);
    console.log(`one-way roads: ${summary} -> ${file}`);
  }
}
