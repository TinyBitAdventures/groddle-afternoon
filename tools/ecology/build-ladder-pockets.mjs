#!/usr/bin/env node
/**
 * Register G1086 (#573, Jacob's Climb): ladder pockets, the floors you can't leave on foot but
 * can by a jump and a fresh Up in the air onto a ladder whose foot hangs over them. Glitch's grab
 * reached 113 px over the feet (street-model.js LADDER_GRAB_BELOW, its hit box) and Up took a
 * ladder in the air (AvatarController.as onUpKey; js/movement.js ladderMount), so Tiny Speck's
 * ladders that hang higher than that over the floor are taken with a jump. Nothing says so: a
 * player who climbed down one and pressed Up at its foot found no way back. The game keeps the
 * geometry and the grab, and shows how out once a visit (features/slash-commands-feature.js).
 *
 * A pocket, at each of the three plain jumps (build-street-traps.mjs TRAP_JUMPS), on the
 * builder's reach graph (js/builder/reach-graph.js) without and with its jump grab: the stand
 * points you walk (or jump) to from under a ladder whose foot is out of the grab and back, that
 * can't reach an exit or that ladder without the jump, when a standing jump there puts the feet
 * within the grab, and within view of the ladder (POCKET_NEAR_X/Y). Where no jump reaches it the
 * floor is a real trap, listed in js/street-traps-data.js for /stuck's hint, and not here. A
 * pocket can also be a trap at that jump (the ladder leads to more floors with no way off the
 * street: Jacob's Climb for a new character); both hints then show, this one first. Only streets
 * with a ladder hanging more than LADDER_GRAB_BELOW over a floor are run, and the puzzle, swim,
 * event-physics and no-arrival streets build-street-traps.mjs leaves out are left out (--list
 * names them).
 *
 * Writes public/js/ladder-pockets-data.js, in street-traps-data.js's shape (a line's highest
 * jump it is a pocket at, or [jump, x1, x2] runs), so the hint reads it with trapLinesOn.
 *
 *   node tools/ecology/build-ladder-pockets.mjs            # all streets
 *   node tools/ecology/build-ladder-pockets.mjs --check    # fails when the file is stale
 *   node tools/ecology/build-ladder-pockets.mjs --list     # every ladder hanging out of reach: pocket, trap or neither
 *   node tools/ecology/build-ladder-pockets.mjs --only GCR13L1JQEM1OSG --print
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { GAME_DIR } from '../repos.mjs';
import { buildReachGraph, streetBuff, streetWorld, streetTargets, jumpArc, runArc, MAX_FRAMES, DOOR_REACH_X, POST_REACH_X, POST_BELOW } from '../../public/js/builder/reach-graph.js?v=b7f3033e';
import { isStandable, platformYAt, resolveGround, LADDER_GRAB_BELOW } from '../../public/js/street-model.js?v=a9a05f9d';
import { TRAP_JUMPS, trapEntry } from './build-street-traps.mjs';

const OUT = join(GAME_DIR, 'public/js/ladder-pockets-data.js');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const twin = (tsid) => String(tsid || '').slice(1);
/** The reach graph's mount reach across a ladder (buildReachGraph: |x - ladder x| < 28). */
const MOUNT_X = 28;
/**
 * The hint names "the ladder", so it shows only where the ladder is in view: within this far
 * across and up or down from the floor under its foot (the camera keeps the avatar near the middle
 * of a 1280 x 720 view). Kymi Abyss's pit, for a new character, is a pocket hundreds of px wide.
 */
const POCKET_NEAR_X = 480;
const POCKET_NEAR_Y = 240;

/** PURE: the first floor under a ladder's foot at x (what you land on dropping off it there), or null. */
function floorUnder(world, x, yBot) {
  let floor = null;
  for (const p of world.col(x)) {
    if (!isStandable(p)) continue;
    const y = platformYAt(p, x, 0);
    if (y != null && y >= yBot - 2 && (floor == null || y < floor.y)) floor = { y, line: p.id };
  }
  return floor;
}

/**
 * PURE: the ladders on a street with a floor under their foot, within the mount reach across,
 * more than LADDER_GRAB_BELOW down (screen space): { id, x, yBot, yTop, floor, line, gap }, the
 * floor straight under it (else the nearest such one across).
 */
export function highLadders(street, world = streetWorld(street)) {
  const out = [];
  for (const w of world.walls) {
    let best = null;
    for (let dx = 0; dx < MOUNT_X; dx += 4) {
      for (const x of dx ? [w.x - dx, w.x + dx] : [w.x]) {
        const f = floorUnder(world, x, w.yBot);
        if (f && f.y - w.yBot > LADDER_GRAB_BELOW && !best) best = { floor: f.y, line: f.line, fx: x };
      }
    }
    if (best) out.push({ id: w.id, x: w.x, yBot: w.yBot, yTop: w.yTop, ...best, gap: Math.round(best.floor - w.yBot) });
  }
  return out;
}

function skipped(street) {
  if (streetBuff(street).approximate) return true;
  return Object.values(street.events || {}).flat().some((a) => a?.type === 'physics');
}

function dedupe(arrivals) {
  const seen = new Set();
  return arrivals.filter((a) => {
    const k = `${Math.round(a.x)},${Math.round(a.y)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The arrivals' and the exits' nodes in a built graph (reach-graph.js reachStreet's own rules). */
function endpoints(street, built, arrivals) {
  const { world, graph: g, ladders, landingNode } = built;
  const arr = arrivals.map((a) => {
    const snapped = resolveGround(world.col(a.x), a.x, a.y, 0, 12);
    const r = runArc(world, { x: a.x, y: a.y, vx: 0, vy: 0, onGround: false }, { maxFrames: MAX_FRAMES });
    let node = r.landed ? landingNode(r.landed.x, r.landed.y) : -1;
    if (node < 0 && snapped) node = landingNode(a.x, snapped.y);
    return node;
  }).filter((n) => n >= 0);
  const ladderNode = new Map(ladders.map((l) => [l.id, l.node]));
  const exits = [];
  for (const t of streetTargets(street)) {
    if (t.ladder != null && ladderNode.has(t.ladder)) exits.push(ladderNode.get(t.ladder));
    const reachX = t.kind === 'door' ? t.w / 2 + DOOR_REACH_X : POST_REACH_X;
    const top = t.buried ? -Infinity : t.y - t.h;
    const bottom = t.buried ? Infinity : t.y + POST_BELOW;
    for (let n = 0; n < g.x.length; n += 1) {
      if (g.kind[n] === 's' && Math.abs(g.x[n] - t.x) <= (t.buried ? 110 : reachX) && g.y[n] >= top && g.y[n] <= bottom) exits.push(n);
    }
  }
  return { arr, exits };
}

/** PURE: per line of a graph, the runs [x1, x2] of the stand points `mark` holds, and whether it holds them all. */
function lineRuns(g, lineNodes, lines, mark) {
  const out = {};
  lineNodes.forEach((ln, i) => {
    if (!ln || lines[i].virtual) return;
    const runs = [];
    let prev = false;
    let count = 0;
    for (let k = 0; k < ln.count; k += 1) {
      const n = ln.first + k;
      const on = Boolean(mark[n]);
      if (on) {
        count += 1;
        if (prev) runs[runs.length - 1][1] = Math.round(g.x[n]);
        else runs.push([Math.round(g.x[n]), Math.round(g.x[n])]);
      }
      prev = on;
    }
    if (count) out[lines[i].id] = { runs, whole: count >= ln.count };
  });
  return out;
}

/**
 * PURE: a street's ladder pockets and, per ladder hanging out of reach, what is under it, at
 * each of TRAP_JUMPS. A stand point is in a pocket when you can get there, can't walk (or jump,
 * or take a ladder in reach) to an exit or back onto the high ladder, and can walk to a spot
 * under it where a jump puts the feet within the grab. Per ladder, `under[jump]`: 'pocket',
 * 'trap' (no way out at all, even with the jump: js/street-traps-data.js and /stuck),
 * 'free' (you walk off or take it back some other way) or 'unreached'; `jumpRise[jump]`: how
 * high a standing jump lifts the feet there, against the `gap` - LADDER_GRAB_BELOW it needs.
 * Returns { lines: { [line]: entry } | null, ladders: [...] }.
 */
export function ladderPocketsOf(street, arrivals) {
  const high = highLadders(street);
  const left = (why) => ({ lines: null, ladders: high.map((l) => ({ id: l.id, line: l.line, gap: l.gap, need: l.gap - LADDER_GRAB_BELOW, left: why })) });
  if (!high.length) return { lines: null, ladders: [] };
  if (!arrivals.length) return left('no arrivals');
  if (skipped(street)) return left('event or swim physics');
  const arrIn = dedupe(arrivals);
  const base = streetBuff(street).buff;
  const found = {};
  const ladders = high.map((l) => ({ id: l.id, line: l.line, gap: l.gap, need: l.gap - LADDER_GRAB_BELOW, under: {}, jumpRise: {} }));
  for (const jump of TRAP_JUMPS) {
    const buff = { ...base, jump: (base.jump ?? 1) * jump };
    const plain = buildReachGraph(street, { buff });
    const grab = buildReachGraph(street, { buff, jumpGrab: true });
    const gp = plain.graph;
    const gg = grab.graph;
    if (gp.x.length !== gg.x.length) throw new Error(`graphs differ (${gp.x.length} vs ${gg.x.length} nodes)`);
    const { arr, exits } = endpoints(street, grab, arrIn);
    if (!arr.length || !exits.length) return left(arr.length ? 'no exits' : 'no arrival stands');
    const reached = gg.bfs(arr);
    const outPlain = gp.bfs(exits, 'rev');
    const outGrab = gg.bfs(exits, 'rev');
    const pocket = new Uint8Array(gp.x.length);
    const lNode = new Map(plain.ladders.map((l) => [l.id, l.node]));
    high.forEach((l, i) => {
      const L = lNode.get(l.id);
      const backPlain = gp.bfs([L], 'rev');
      // Stand points under it (within the mount reach across) and, of those, the ones a jump grabs from.
      const under = [];
      const foot = [];
      for (let n = 0; n < gp.x.length; n += 1) {
        if (gp.kind[n] !== 's' || Math.abs(gp.x[n] - l.x) >= MOUNT_X || gp.y[n] <= l.yBot + LADDER_GRAB_BELOW) continue;
        const f = floorUnder(grab.world, gp.x[n], l.yBot);
        if (!f || Math.abs(f.y - gp.y[n]) > 2) continue;
        under.push(n);
        if (jumpArc(grab.world, { x: gp.x[n], y: gp.y[n] }).minY <= l.yBot + LADDER_GRAB_BELOW) foot.push(n);
      }
      const rise = Math.round(l.floor - jumpArc(grab.world, { x: l.fx, y: l.floor }).minY);
      ladders[i].jumpRise[jump] = rise;
      const hit = under.filter((n) => reached[n]);
      let kind = 'unreached';
      if (hit.length) {
        const stuck = hit.filter((n) => !outPlain[n] && !backPlain[n]);
        if (!stuck.length) kind = 'free';
        else if (foot.some((n) => stuck.includes(n))) kind = 'pocket';
        else kind = stuck.some((n) => !outGrab[n]) ? 'trap' : 'free';
      }
      ladders[i].under[jump] = kind;
      if (kind !== 'pocket') return;
      // The pocket: the stand points you walk (or jump) to from its foot and back, with no way
      // out or back up but the jump. A floor you only fall into it from is not in it: its own
      // way up, or /stuck's hint, is somewhere else (Jacob's Climb's floor outside the wall).
      const toFoot = gp.bfs(foot, 'rev');
      const fromFoot = gp.bfs(foot);
      for (let n = 0; n < gp.x.length; n += 1) {
        if (gp.kind[n] !== 's' || Math.abs(gp.x[n] - l.x) > POCKET_NEAR_X || Math.abs(gp.y[n] - l.floor) > POCKET_NEAR_Y) continue;
        if (reached[n] && toFoot[n] && fromFoot[n] && !outPlain[n] && !backPlain[n]) pocket[n] = 1;
      }
      // Whether the ladder leads on to a way off the street (else /stuck is the way, after it).
      ladders[i].exit ??= {};
      ladders[i].exit[jump] = outGrab[lNode.get(l.id)] === 1;
    });
    for (const [line, r] of Object.entries(lineRuns(gp, plain.lineNodes, plain.world.graphLines, pocket))) {
      (found[line] ||= []).push({ jump, whole: r.whole, runs: r.runs });
    }
  }
  const lines = {};
  for (const [line, f] of Object.entries(found)) lines[line] = trapEntry(f);
  return { lines: Object.keys(lines).length ? lines : null, ladders };
}

function runJobs(jobs) {
  return jobs.map(([tsid, path, arrivals, puzzle]) => {
    try {
      const s = json(path);
      if (puzzle) return { tsid, label: s.label, lines: null, ladders: highLadders(s).map((l) => ({ id: l.id, line: l.line, gap: l.gap, need: l.gap - LADDER_GRAB_BELOW, left: 'puzzle street' })) };
      return { tsid, label: s.label, ...ladderPocketsOf(s, arrivals) };
    } catch (err) {
      return { tsid, lines: null, ladders: [], error: String(err?.message || err) };
    }
  });
}

/** PURE: the generated module's text. */
export function renderPockets(section) {
  const rows = Object.keys(section).sort().map((tsid) => {
    const lines = Object.keys(section[tsid]).sort().map((line) => `${JSON.stringify(line)}:${JSON.stringify(section[tsid][line])}`).join(',');
    return `  ${JSON.stringify(tsid)}: {${lines}},`;
  });
  return `// GENERATED by tools/ecology/build-ladder-pockets.mjs: don't edit.
// Floors left only by a jump and Up onto a ladder hanging out of reach over them (G1086):
// { [street tsid]: { [line id]: the highest jump multiplier it is a pocket at, or [jump, x1, x2] runs } }.
export const LADDER_POCKETS = Object.freeze({
${rows.join('\n')}
});
`;
}

const RUN = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (!isMainThread && workerData?.ladderPockets) {
  parentPort.postMessage(runJobs(workerData.jobs));
} else if (RUN) {
  const args = process.argv.slice(2);
  const arg = (name, dflt = null) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
  const { shippedStreetFiles } = await import('../builder/validator-context.mjs');
  const { shippedArrivals } = await import('../builder/calibrate.mjs');
  const puzzles = new Set(Object.keys(json(join(GAME_DIR, 'public/assets/content/puzzle-triggers.json')).streets || {}).map(twin));
  const files = shippedStreetFiles();
  const { byStreet } = shippedArrivals(files);
  // Only streets with a ladder hanging out of reach (cheap), then the reach graph on those.
  const jobs = files.filter(([t, p]) => (!only || only.has(t)) && highLadders(json(p)).length)
    .map(([t, p]) => [t, p, byStreet.get(twin(t)) || [], puzzles.has(twin(t))]);
  const n = Math.max(1, Math.min(Number(arg('--workers', cpus().length - 1)), jobs.length));
  const buckets = Array.from({ length: n }, () => []);
  jobs.sort((a, b) => b[2].length - a[2].length).forEach((j, i) => buckets[i % n].push(j));
  const results = (await Promise.all(buckets.map((b) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: b, ladderPockets: true } });
    w.once('message', resolve);
    w.on('error', reject);
  })))).flat();
  const errors = results.filter((r) => r.error);
  if (errors.length) console.error(`errors: ${JSON.stringify(errors)}`);
  const section = {};
  for (const r of results) if (r.lines) section[r.tsid] = r.lines;
  if (args.includes('--list')) {
    const rows = results.flatMap((r) => r.ladders.map((l) => ({ tsid: r.tsid, label: r.label, ...l })));
    console.log(JSON.stringify(rows));
    process.exit(0);
  }
  if (args.includes('--print') || only) {
    console.log(JSON.stringify(section, null, 1));
    process.exit(0);
  }
  const text = renderPockets(section);
  if (args.includes('--check')) {
    if (readFileSync(OUT, 'utf8') !== text) {
      console.error('public/js/ladder-pockets-data.js is stale: run node tools/ecology/build-ladder-pockets.mjs');
      process.exit(1);
    }
    console.log(`ladder pockets are current (${Object.keys(section).length} streets)`);
  } else {
    writeFileSync(OUT, text);
    console.log(`${Object.keys(section).length} streets with ladder pockets -> public/js/ladder-pockets-data.js`);
  }
}
