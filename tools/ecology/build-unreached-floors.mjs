#!/usr/bin/env node
/**
 * Ticket 64: the floors on each street nobody can get to, so the planner
 * (js/street-ecology.js planStreetPlacements) never puts a rock, quoin, tree,
 * animal or Musicblock there. In the original these were set by hand where a
 * player reaches them (GSJS obey_physics false; the archived locations keep only
 * the item list, not the places), so ours have to be reachable too. Level 3 East
 * (Ilmenskie Caverns) has a whole-street floor line under the cave walk with no
 * way down to it: the rocks, quoins and a Musicblock went there.
 *
 * For every shipped street something arrives at (the arrive points of every
 * signpost arm and door leading to it, as tools/builder/calibrate.mjs), the
 * builder's reach graph (js/builder/reach-graph.js) runs from those arrivals
 * with each of UNREACHED_JUMPS (a plain jump and triple jumps up to about a Big 'Un's, rising
 * as one: G529), so only floors no jump of any kind gets to are listed. A swim street or a street whose
 * location events change physics is left out (the model is only approximate
 * there), and so is a street nothing arrives at.
 *
 * It writes the `unreachedFloors` section of public/assets/content/street-ecology.json
 * ({ [street tsid]: { [line id]: "x1-x2 x1-x2" } }, screen x, the stand points
 * no arrival reaches, merged into runs), which every caller of the planner
 * already loads (setStreetEcologyCatalog), game and realtime builders alike.
 *
 *   node tools/ecology/build-unreached-floors.mjs            # all streets (a few minutes, all cores)
 *   node tools/ecology/build-unreached-floors.mjs --check    # fails when the section is stale
 *   node tools/ecology/build-unreached-floors.mjs --only GLI1D3B2U5715LL --print
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { GAME_DIR } from '../repos.mjs';
import { reachStreet, streetBuff, STAND_STEP } from '../../public/js/builder/reach-graph.js?v=22368fd6';

/** Jump multiplier for the reach run: the best triple jump (movement.js rawTripleJumpMultiplier 1.8). */
export const UNREACHED_JUMP = 1.8;

/**
 * The jumps the reach runs try (G529): a plain jump, the gentlest triple jump (movement.js
 * rawTripleJumpMultiplier 1.2, a late third press) and the best (UNREACHED_JUMP). A floor is
 * unreached only when none of them gets there: the reach graph tries each jump at full strength
 * only, and a 500 px triple jump that hits a ceiling misses a ledge a plain jump lands on.
 */
export const UNREACHED_JUMPS = Object.freeze([1, 1.2, UNREACHED_JUMP]);

/**
 * PURE: one reach run's jump on a street: `multiplier` scaled by the street's multiplier_3_jump
 * as game.js streetPhysicsTripleJump does (0 on the streets with no triple jump: a plain jump
 * there), and whether it rises as a triple jump does (twice vy_max; without that flag the cap
 * held a 1.8x launch near 212 px instead of about 500, so floors were marked unreached too often).
 */
export function unreachedJump(buff, multiplier = UNREACHED_JUMP) {
  const tj = Number.isFinite(buff?.tripleJump) ? buff.tripleJump : 1;
  const m = 1 + (multiplier - 1) * tj;
  return { jump: (buff?.jump ?? 1) * m, tripleJump: m > 1 };
}

/** PURE: where two lists of [x1, x2] stand runs on one line overlap (stand points share a grid). */
export function overlapRuns(a, b) {
  const out = [];
  for (const [a1, a2] of a) {
    for (const [b1, b2] of b) {
      const lo = Math.max(a1, b1);
      const hi = Math.min(a2, b2);
      if (lo <= hi) out.push([lo, hi]);
    }
  }
  return out.sort((x, y) => x[0] - y[0]);
}
const ECOLOGY = join(GAME_DIR, 'public/assets/content/street-ecology.json');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** Why the model is only approximate on a street (calibrate.mjs approximateWhy). */
function approximate(street) {
  if (streetBuff(street).approximate) return true;
  return Object.values(street.events || {}).flat().some((a) => a?.type === 'physics');
}

/** PURE: a street's unreached runs { [line]: [[x1, x2]] } from its arrivals, or null when not modelled. */
export function unreachedFloorsOf(street, arrivals) {
  if (!arrivals.length || approximate(street)) return null;
  const seen = new Set();
  const arr = arrivals.filter((a) => {
    const k = `${Math.round(a.x)},${Math.round(a.y)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const b = streetBuff(street).buff;
  const seenJump = new Set();
  let left = null;
  for (const multiplier of UNREACHED_JUMPS) {
    const { jump, tripleJump } = unreachedJump(b, multiplier);
    const key = `${jump}:${tripleJump}`;
    if (seenJump.has(key)) continue;
    seenJump.add(key);
    const r = reachStreet(street, arr, { buff: { ...b, jump }, tripleJump });
    // Nothing stands: the arrivals are broken, not the floors (PHY-001); list nothing.
    if (!r.arrivals.some((a) => a.stands)) return null;
    const mine = {};
    for (const s of r.surfaces) {
      if (s.reached || s.line == null) continue;
      (mine[s.line] ||= []).push([Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)]);
    }
    if (!left) left = mine;
    else for (const line of Object.keys(left)) left[line] = mine[line] ? overlapRuns(left[line], mine[line]) : [];
  }
  const runs = {};
  const half = STAND_STEP / 2;
  for (const [line, list] of Object.entries(left || {})) {
    for (const [x1, x2] of list) (runs[line] ||= []).push(`${Math.round(x1 - half)}-${Math.round(x2 + half)}`);
  }
  // One string per line ("x1-x2 x1-x2"), so the catalog stays a line per floor.
  const out = Object.fromEntries(Object.entries(runs).map(([line, list]) => [line, list.join(' ')]));
  return Object.keys(out).length ? out : null;
}

const twin = (tsid) => String(tsid || '').slice(1);

function runJobs(jobs) {
  const out = [];
  for (const [tsid, path, arrivals] of jobs) {
    let floors = null;
    try { floors = unreachedFloorsOf(json(path), arrivals); } catch (err) { floors = null; out.push({ tsid, error: String(err?.message || err) }); continue; }
    out.push({ tsid, floors });
  }
  return out;
}

const RUN = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (!isMainThread && workerData?.unreachedFloors) {
  parentPort.postMessage(runJobs(workerData.jobs));
} else if (RUN) {
  const args = process.argv.slice(2);
  const arg = (name, dflt = null) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const check = args.includes('--check');
  const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
  const { shippedStreetFiles } = await import('../builder/validator-context.mjs');
  const { shippedArrivals } = await import('../builder/calibrate.mjs');
  const files = shippedStreetFiles();
  const { byStreet } = shippedArrivals(files);
  const jobs = files.filter(([t]) => !only || only.has(t)).map(([t, p]) => [t, p, byStreet.get(twin(t)) || []]);
  const n = Math.max(1, Math.min(Number(arg('--workers', cpus().length - 1)), jobs.length));
  const buckets = Array.from({ length: n }, () => []);
  jobs.sort((a, b) => b[2].length - a[2].length).forEach((j, i) => buckets[i % n].push(j));
  const results = (await Promise.all(buckets.map((b) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: b, unreachedFloors: true } });
    w.once('message', resolve);
    w.on('error', reject);
  })))).flat();
  const errors = results.filter((r) => r.error);
  if (errors.length) console.error(`errors: ${JSON.stringify(errors)}`);
  const section = {};
  for (const r of results.sort((a, b) => a.tsid.localeCompare(b.tsid))) if (r.floors) section[r.tsid] = r.floors;
  if (args.includes('--print') || only) {
    console.log(JSON.stringify(section, null, 1));
    process.exit(0);
  }
  const eco = json(ECOLOGY);
  const next = { ...eco, unreachedFloorsNote: 'Ticket 64: stand runs no arrival reaches (tools/ecology/build-unreached-floors.mjs); the planner puts nothing there.', unreachedFloors: section };
  const text = `${JSON.stringify(next, null, 2)}\n`;
  if (check) {
    if (readFileSync(ECOLOGY, 'utf8') !== text) {
      console.error('street-ecology.json unreachedFloors is stale: run node tools/ecology/build-unreached-floors.mjs');
      process.exit(1);
    }
    console.log(`unreachedFloors up to date (${Object.keys(section).length} streets)`);
  } else {
    writeFileSync(ECOLOGY, text);
    console.log(`wrote unreachedFloors for ${Object.keys(section).length} streets`);
  }
}
