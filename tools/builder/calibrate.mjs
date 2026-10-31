#!/usr/bin/env node
/**
 * LEVEL BUILDER (spec 7.4): the validator's calibration run over every shipped street.
 *
 *   node tools/builder/calibrate.mjs                 # all 1,460 streets, writes tools/builder/calibration.json
 *   node tools/builder/calibrate.mjs --only GLI2V0UN7RD1T2J,GA5101HF7F429V5 --print
 *   node tools/builder/calibrate.mjs --sample 20 --seed 7   # print 20 findings picked at random
 *
 * Arrivals come from the shipped connects: every signpost arm and door in any street whose target
 * is this street and that carries an `arrive`. Each street runs with its own per-street physics;
 * swim (jetpack) streets and streets whose location events change physics (bounces, gravity
 * flips, js/features/location-events-feature.js) are marked approximate: the model runs normal
 * (or the street's own) physics only, so their findings are kept apart from the sample. Every PHY-003, PHY-004 and PHY-005 finding goes
 * into calibration.json, with PHY-001 and PHY-008 counted. A street nothing arrives at is skipped
 * and counted. Runs on all cores (worker threads).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { GAME_DIR } from '../repos.mjs';
import { shippedStreetFiles } from './validator-context.mjs';
import { validateShippedStreet } from '../../public/js/builder/validate.js?v=955b2e0f';
import { streetBuff, REACH_LIMITS } from '../../public/js/builder/reach-graph.js?v=6f7512af';
import { plainApex } from '../../public/js/builder/validate.js?v=955b2e0f';

/** The 2012 client's plain jump peaked about 134 px (hidden-floors.js); the remake's 105. */
export const CLIENT_2012_APEX = 134;
/** The jump multiplier that gives a 134 px apex with the remake's steps. */
export function jumpFor(apex) {
  let lo = 1;
  let hi = 2;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (plainApex({ jump: mid }) < apex) lo = mid; else hi = mid;
  }
  return hi;
}

const OUT = join(GAME_DIR, 'tools/builder/calibration.json');
const KEEP = new Set(['PHY-003', 'PHY-004', 'PHY-005']);
const COUNT = new Set(['PHY-001', 'PHY-002', 'PHY-006', 'PHY-007', 'PHY-008']);

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
let JUMP_2012 = 1;
const twin = (tsid) => String(tsid || '').slice(1);

/** Map street id (without its L/G letter) -> arrivals [{x, y, from}] from every shipped connect. */
export function shippedArrivals(files) {
  const out = new Map();
  const push = (target, a) => {
    const k = twin(target);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(a);
  };
  let missing = 0;
  for (const [tsid, path] of files) {
    const s = json(path);
    for (const post of s.signposts || []) {
      for (const c of post.connects || []) {
        if (c.hidden) continue;
        if (c.arrive && Number.isFinite(c.arrive.x) && Number.isFinite(c.arrive.y)) push(c.tsid, { x: c.arrive.x, y: c.arrive.y, from: `${tsid}/${post.id}` });
        else missing += 1;
      }
    }
    for (const d of s.doors || []) {
      const c = d.connect;
      if (!c || d.hidden) continue;
      if (c.arrive && Number.isFinite(c.arrive.x)) push(c.street || c.tsid, { x: c.arrive.x, y: c.arrive.y, from: `${tsid}/${d.id}` });
      else missing += 1;
    }
  }
  return { byStreet: out, missing };
}

/** Why the model is only approximate on a street: 'jetpack', 'events' (physics events), or false. */
export function approximateWhy(street) {
  if (streetBuff(street).approximate) return 'jetpack';
  const actions = Object.values(street.events || {}).flat();
  if (actions.some((a) => a?.type === 'physics')) return 'events';
  return false;
}

function runStreet(tsid, path, arrivals) {
  const street = json(path);
  const t0 = performance.now();
  if (!arrivals.length) return { tsid, label: street.label, skipped: 'no arrivals', ms: 0 };
  // Duplicates (two arms landing on one spot) add nothing.
  const seen = new Set();
  const arr = arrivals.filter((a) => {
    const k = `${Math.round(a.x)},${Math.round(a.y)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  let r;
  try {
    r = validateShippedStreet(street, arr);
  } catch (err) {
    return { tsid, label: street.label, error: String(err?.message || err), ms: Math.round(performance.now() - t0) };
  }
  const counts = {};
  for (const f of r.findings) counts[f.rule] = (counts[f.rule] || 0) + 1;
  // Which kept findings the 2012 jump (134 px) would not have had: the 105 vs 134 px gap.
  const kept = r.findings.filter((f) => KEEP.has(f.rule));
  if (kept.length) {
    const b = streetBuff(street).buff;
    const again = validateShippedStreet(street, arr, { buff: { ...b, jump: (b.jump ?? 1) * JUMP_2012 } });
    const still = new Set(again.findings.map((f) => `${f.rule}|${f.at}`));
    const why = approximateWhy(street);
    for (const f of kept) f.data = { ...f.data, jump2012: still.has(`${f.rule}|${f.at}`) ? 'also' : 'reaches', ...(why ? { approximate: why } : {}) };
  }
  return {
    tsid,
    label: street.label,
    hub: street.hubName || '',
    arrivals: arr.length,
    approximate: approximateWhy(street),
    physics: Boolean(street.physics),
    nodes: r.reach.nodes,
    ms: Math.round(performance.now() - t0),
    counts,
    findings: kept.map((f) => ({ ...f, street: tsid, label: street.label })),
  };
}

JUMP_2012 = jumpFor(CLIENT_2012_APEX);
const RUN = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (!isMainThread) {
  const { jobs } = workerData;
  for (const [tsid, path, arrivals] of jobs) parentPort.postMessage(runStreet(tsid, path, arrivals));
  parentPort.postMessage({ done: true });
} else if (RUN) {
  const args = process.argv.slice(2);
  const arg = (name, dflt = null) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const sample = Number(arg('--sample', 0));
  if (sample) {
    const cal = json(OUT);
    let s = Number(arg('--seed', 7));
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pool = cal.findings.filter((f) => !f.data.approximate);
    const picked = [];
    while (picked.length < sample && pool.length) picked.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    console.log(JSON.stringify(picked, null, 1));
    process.exit(0);
  }
  const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
  const t0 = performance.now();
  const files = shippedStreetFiles();
  const { byStreet, missing } = shippedArrivals(files);
  const jobs = files.filter(([t]) => !only || only.has(t)).map(([t, p]) => [t, p, byStreet.get(twin(t)) || []]);
  const n = Math.max(1, Math.min(Number(arg('--workers', cpus().length - 1)), jobs.length));
  const buckets = Array.from({ length: n }, () => []);
  // Big files first, round robin, so no worker ends with the heaviest streets.
  jobs.sort((a, b) => b[2].length - a[2].length).forEach((j, i) => buckets[i % n].push(j));
  const results = [];
  await Promise.all(buckets.map((b) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: b } });
    w.on('message', (m) => {
      if (m.done) resolve();
      else {
        results.push(m);
        if (results.length % 100 === 0) process.stderr.write(`${results.length}/${jobs.length}\n`);
      }
    });
    w.on('error', reject);
  })));
  results.sort((a, b) => a.tsid.localeCompare(b.tsid));
  const wall = Math.round(performance.now() - t0);
  const findings = results.flatMap((r) => r.findings || []);
  const totals = {};
  for (const r of results) for (const [k, v] of Object.entries(r.counts || {})) totals[k] = (totals[k] || 0) + v;
  const summary = {
    streets: results.length,
    checked: results.filter((r) => !r.skipped && !r.error).length,
    skippedNoArrivals: results.filter((r) => r.skipped).length,
    errors: results.filter((r) => r.error).map((r) => ({ tsid: r.tsid, error: r.error })),
    approximate: Object.fromEntries(['jetpack', 'events'].map((k) => [k, results.filter((r) => r.approximate === k).map((r) => r.tsid)])),
    inModel: Object.fromEntries([...KEEP].map((k) => [k, findings.filter((f) => f.rule === k && !f.data.approximate).length])),
    inModelJump2012Reaches: findings.filter((f) => !f.data.approximate && f.data.jump2012 === 'reaches').length,
    connectsWithoutArrive: missing,
    wallMs: wall,
    workers: n,
    cpuMs: results.reduce((m, r) => m + (r.ms || 0), 0),
    slowest: [...results].sort((a, b) => (b.ms || 0) - (a.ms || 0)).slice(0, 5).map((r) => ({ tsid: r.tsid, label: r.label, ms: r.ms })),
    totals,
    kept: Object.fromEntries([...KEEP].map((k) => [k, findings.filter((f) => f.rule === k).length])),
    counted: Object.fromEntries([...COUNT].map((k) => [k, totals[k] || 0])),
    jump2012: { multiplier: Math.round(JUMP_2012 * 10000) / 10000, reaches: findings.filter((f) => f.data.jump2012 === 'reaches').length, also: findings.filter((f) => f.data.jump2012 === 'also').length },
  };
  if (args.includes('--print') || only) {
    console.log(JSON.stringify({ summary, findings }, null, 1));
  } else {
    const out = {
      format: 'groddle-builder-calibration/1',
      note: 'The validator (public/js/builder/validate.js) over every shipped street, arrivals from shipped connects (spec 7.4). Regenerate: node tools/builder/calibrate.mjs',
      limits: REACH_LIMITS,
      summary,
      streets: results.filter((r) => !r.skipped).map(({ findings: _f, ...r }) => r),
      skipped: results.filter((r) => r.skipped).map((r) => r.tsid),
      findings,
    };
    // One street or finding a line (as deco-catalog.json), so diffs between runs read well.
    const rows = (k) => `"${k}":[\n${out[k].map((r) => JSON.stringify(r)).join(',\n')}\n]`;
    const head = Object.entries(out).filter(([k]) => !['streets', 'skipped', 'findings'].includes(k)).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
    writeFileSync(OUT, `{${head.join(',\n')},\n"skipped":${JSON.stringify(out.skipped)},\n${rows('streets')},\n${rows('findings')}}\n`);
    console.log(JSON.stringify(summary, null, 1));
  }
}
