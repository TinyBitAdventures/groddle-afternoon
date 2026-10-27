/**
 * Multiplayer street projects (G346): the street projects every player on a
 * street builds together, for the realtime server (groddle-afternoon-server
 * projects.go, go:embed data/projects.json). Written from the game's own
 * catalog (public/assets/content/street-jobs.json, build-street-jobs.mjs)
 * and the amounts js/street-jobs.js works out, so the Job Board and the
 * server never disagree about what a phase needs.
 *
 * What it carries, per playable street-building and street-upgrade job:
 *  - where it is offered (the board's streets: catalog.byStreet), the street
 *    it builds or upgrades, the streets its road opens from, and its phases
 *    in order with each one's delay (locations/inc_jobs.js in_order,
 *    delay_seconds);
 *  - per phase class: the requirements with the remake's amounts
 *    (soloNeed: ceil(num / divisor), at least 1), bucket and group
 *    (quest.js getCurrentReqGroup), base cost, type and item class; the
 *    class rewards, the performance rewards and their drop tables, and
 *    performance_percent / performance_cutoff (quest.js getWinners 1617-1633);
 *  - the drop tables (items/catalog_drop_tables.js, as the catalog has them)
 *    and each upgrade's option ids (the vote, quest.js getOptions).
 * Restorations (homes, kind 'restore', lane HOMES3): each worn-out
 * cultivation's project (catalog.restorations: its phases) with its classes at
 * divisor 1 (the source amounts, as solo's homes-feature restoreJob); the
 * server makes each home's project from the site's word on the owner's save
 * (home_projects.go), so there is no job row here, only the proto's phases.
 * Group halls (G331, kind 'hall', the catalog's `halls`) are, with what
 * claiming one costs (claim, currants at the remake's amount) and how many
 * minutes the claimed phase has (minutes).
 *
 * Run from the game repo root:
 *   node tools/build-realtime-projects.mjs           writes the server repo's data/projects.json
 *   node tools/build-realtime-projects.mjs --check   exits 1 when it is stale
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireServer, serverPath } from './repos.mjs';
import { SOLO_DIVISOR, STREET_JOB_COOLDOWN_MS, WORK_UNIT_MS, jobDivisor, soloNeed } from '../public/js/street-jobs.js?v=jobs-3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CATALOG = join(root, 'public/assets/content/street-jobs.json');
export const OUT_SERVER = serverPath('data', 'projects.json');

const whole = (v) => Math.max(0, Math.floor(Number(v) || 0));

/** One phase class as the server reads it, its amounts over divisor (soloNeed). */
function classRow(def, divisor) {
  const r = def.rewards || {};
  const perf = def.performance || {};
  return {
    reqs: def.requirements.map((q) => ({
      id: q.id,
      b: String(q.bucket || '1'),
      g: whole(q.group) || 1,
      type: q.type,
      ...(q.type === 'item' ? { c: q.classId } : {}),
      need: soloNeed(q.num, divisor),
      cost: whole(q.baseCost),
    })),
    rewards: {
      ...(r.xp ? { xp: r.xp } : {}),
      ...(r.currants ? { currants: r.currants } : {}),
      ...(r.mood ? { mood: r.mood } : {}),
      ...(r.energy ? { energy: r.energy } : {}),
      ...(r.favor?.length ? { favor: r.favor.map((f) => ({ giant: f.giant, points: f.points })) } : {}),
    },
    perf: {
      ...(perf.xp ? { xp: perf.xp } : {}),
      ...(perf.mood ? { mood: perf.mood } : {}),
      ...(perf.energy ? { energy: perf.energy } : {}),
      ...(perf.dropTables?.length ? { drops: [...perf.dropTables] } : {}),
    },
    pct: whole(def.performancePercent),
    cut: whole(def.performanceCutoff),
  };
}

/** The server's table from the game's catalog. */
export function projectTable(catalog = JSON.parse(readFileSync(CATALOG, 'utf8'))) {
  const jobs = {};
  const classes = {};
  const offer = {};
  for (const [tsid, ids] of Object.entries(catalog.byStreet || {})) {
    for (const id of ids) (offer[id] ||= []).push(tsid);
  }
  const keep = Object.entries(catalog.jobs || {})
    .filter(([, job]) => job.kind === 'street' || job.kind === 'upgrade')
    .map(([id, job]) => [id, job, catalog.classes, offer[id]]);
  // Group halls (G331, multiplayer only): catalog.halls, offered on the one street each comes from.
  const halls = catalog.halls || {};
  for (const [id, job] of Object.entries(halls.jobs || {})) {
    if (job.kind === 'hall' && !job.blockers?.length) keep.push([id, job, halls.classes || {}, job.connecting]);
  }
  keep.sort(([a], [b]) => (Number(a) - Number(b)) || a.localeCompare(b));
  for (const [id, job, defs, offeredAt] of keep) {
    const divisor = jobDivisor(job);
    const phases = job.phases.map((p) => ({ c: p.classTsid, delay: whole(p.delaySeconds) }));
    if (!phases.length || phases.some((p) => !defs?.[p.c])) continue;
    const row = {
      kind: job.kind,
      street: job.street,
      offer: [...new Set(offeredAt || [])].sort(),
      phases,
    };
    if (job.kind === 'street') row.connecting = [...job.connecting];
    if (job.kind === 'upgrade') row.options = (catalog.upgrades?.[job.street]?.options || []).map((o) => String(o.id));
    if (job.kind === 'hall') {
      // quest.js claimJob 1297-1338: the claim's currants (the remake's amount, as every other requirement), and
      // the minutes the claimed phase has (duration, onJobTimeout 1356-1380).
      row.claim = (job.claim || []).filter((q) => q.type === 'currants').reduce((sum, q) => sum + soloNeed(q.num, divisor), 0);
      row.minutes = whole(job.duration);
    }
    jobs[id] = row;
    for (const p of phases) {
      const key = `${p.c}/${divisor}`;
      if (classes[key]) continue;
      classes[key] = classRow(defs[p.c], divisor);
    }
    row.divisor = divisor;
  }
  // Restorations: proto -> phases, and their classes at divisor 1.
  const restorations = {};
  for (const [proto, rest] of Object.entries(catalog.restorations || {}).sort(([a], [b]) => a.localeCompare(b))) {
    const phases = (rest.phases || []).map((p) => ({ c: p.classTsid, delay: whole(p.delaySeconds) }));
    if (!phases.length || phases.some((p) => !catalog.classes?.[p.c])) continue;
    restorations[proto] = { phases };
    for (const p of phases) {
      const key = `${p.c}/1`;
      if (!classes[key]) classes[key] = classRow(catalog.classes[p.c], 1);
    }
  }
  const drops = {};
  for (const [id, table] of Object.entries(catalog.drops || {})) drops[id] = table.drops;
  return {
    _doc: 'Generated by tools/build-realtime-projects.mjs from the game\'s public/assets/content/street-jobs.json (do not edit). jobs: street-building, street-upgrade and group hall projects (offer: the streets whose board offers it; a hall\'s claim currants and minutes); classes: "<phase class>/<divisor>" with the remake\'s amounts; restorations: a worn-out cultivation\'s phases (classes at divisor 1); drops: the performance drop tables.',
    divisor: SOLO_DIVISOR,
    workUnitMs: WORK_UNIT_MS,
    cooldownMs: STREET_JOB_COOLDOWN_MS,
    jobs,
    classes,
    restorations,
    drops,
  };
}

export function projectJson(catalog) {
  const t = projectTable(catalog);
  // One job or class a line, so a diff of the generated file stays readable.
  const lines = [];
  lines.push(`{"_doc":${JSON.stringify(t._doc)},"divisor":${t.divisor},"workUnitMs":${t.workUnitMs},"cooldownMs":${t.cooldownMs},`);
  const block = (name, obj, last) => {
    const keys = Object.keys(obj);
    lines.push(`"${name}":{`);
    keys.forEach((k, i) => lines.push(`${JSON.stringify(k)}:${JSON.stringify(obj[k])}${i < keys.length - 1 ? ',' : ''}`));
    lines.push(`}${last ? '' : ','}`);
  };
  block('jobs', t.jobs);
  block('classes', t.classes);
  block('restorations', t.restorations);
  block('drops', t.drops, true);
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  requireServer();
  const text = projectJson();
  if (process.argv.includes('--check')) {
    let have = '';
    try { have = readFileSync(OUT_SERVER, 'utf8'); } catch { /* missing */ }
    if (have !== text) {
      console.error(`${OUT_SERVER} is stale: run node tools/build-realtime-projects.mjs`);
      process.exit(1);
    }
    process.exit(0);
  }
  mkdirSync(dirname(OUT_SERVER), { recursive: true });
  writeFileSync(OUT_SERVER, text);
  const t = JSON.parse(text);
  console.log(`street projects: ${Object.keys(t.jobs).length} jobs, ${Object.keys(t.classes).length} phase classes, ${Object.keys(t.restorations).length} restorations, ${Object.keys(t.drops).length} drop tables`);
}
