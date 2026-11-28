/**
 * Solo street projects scale by distance from the start (report #425, register G882; Austin
 * 2026-11-16: fewer resources and fewer skills near the start, more further out; online stays
 * exactly as it is). Glitch had no solo form: every project was sized for a whole server
 * (quests/job_*.js `num`), and the remake's solo board divided every amount by SOLO_DIVISOR 50
 * (js/street-jobs.js). A street next to Hechey Track asked as much as one at the far end of Ur, and
 * most of its work asks named skills a new player has not learned yet.
 *
 * Distance: signposts walked from the starter street (assets/streets/index.json `default`, Hechey
 * Track, where the tutorial lets you out) to the street a project builds or upgrades, over the
 * signpost graph's signposts and doors (assets/content/signpost-graph.json, as quest-instance.js
 * streetsReachingUr reads it), in the direction you walk them. Road closures, the subway and
 * teleports do not count: the measure is the world's geography, so it never moves as you build.
 * Every one of the 689 project streets is reached; one that is not falls back to the last row.
 *
 * The curve (SOLO_CURVE, tune it here): a project's solo amounts are ceil(num / divisor), never
 * less than 1, and its phase rewards divide by the same divisor (settlePhase, jobRewardsText), so a
 * smaller basket pays as a smaller share always did. A work ask's skill drops `skillDrop` levels
 * (Soil Appreciation III with 2 dropped asks Soil Appreciation I); dropped to nothing, the work
 * takes its tool alone. The rows are first match by `hops` (at most).
 *
 * Multiplayer never sees any of it: the feature puts `job.solo` on the catalog only when the game
 * runs solo (features/street-jobs-feature.js applySoloScale), the realtime server's data is built
 * from the raw catalog (tools/build-realtime-projects.mjs), and without `job.solo` every rule in
 * js/street-jobs.js is what it was (tests/street-jobs-solo-scale.test.js).
 */

import { hopsOverEveryRoad } from './street-graph.js?v=16013e6e';

/** A skillDrop that waives every level (no project skill goes above VI). */
export const SKILLS_WAIVED = 99;

export const SOLO_CURVE = Object.freeze([
  // Groddle Forest.
  Object.freeze({ hops: 4, divisor: 500, skillDrop: SKILLS_WAIVED }),
  // Groddle Heights, Groddle Meadow, most of Shimla Mirch.
  Object.freeze({ hops: 8, divisor: 300, skillDrop: SKILLS_WAIVED }),
  // The edge of Shimla Mirch, Ilmenskie Deeps.
  Object.freeze({ hops: 11, divisor: 200, skillDrop: 2 }),
  // Chakra Phool, Alakol, Jethimadh.
  Object.freeze({ hops: 15, divisor: 120, skillDrop: 1 }),
  // The near halves of Tamila, Xalanga, Kalavana, Bortola and Kajuu.
  Object.freeze({ hops: 19, divisor: 80, skillDrop: 1 }),
  // Everything further out: the amounts solo always had (SOLO_DIVISOR).
  Object.freeze({ hops: Infinity, divisor: 50, skillDrop: 0 }),
]);

const g = (t) => {
  const s = String(t || '');
  return s.startsWith('L') ? `G${s.slice(1)}` : s;
};

/**
 * Signposts walked from `start` to every street (G tsids): a breadth-first walk over the graph's
 * signposts and doors, each way in the direction it goes, built or not. Returns { tsid: hops }.
 * The walk is the street graph's (js/street-graph.js hopsOverEveryRoad, R11 G969); `graph` is the
 * street graph or signpost-graph.json.
 */
export const hopsFromStart = (graph, start) => hopsOverEveryRoad(graph, start);

/** The curve's row for a distance (unknown: the last row). { hops, divisor, skillDrop }. */
export function soloTerms(hops, curve = SOLO_CURVE) {
  const h = Number.isFinite(Number(hops)) && hops !== null && hops !== '' ? Math.max(0, Number(hops)) : Infinity;
  const row = curve.find((r) => h <= r.hops) || curve[curve.length - 1];
  return { hops: Number.isFinite(h) ? h : null, divisor: row.divisor, skillDrop: row.skillDrop };
}

/** 'soil_appreciation_3' with 2 dropped: 'soil_appreciation_1'; dropped to nothing: ''. */
export function soloSkill(skill, drop = 0) {
  const id = String(skill || '');
  const d = Math.max(0, Math.floor(Number(drop) || 0));
  if (!id || !d) return id;
  const m = id.match(/^(.*)_(\d+)$/);
  if (!m) return '';
  const level = Number(m[2]) - d;
  return level >= 1 ? `${m[1]}_${level}` : '';
}

/**
 * Put each street build and upgrade's distance (`job.hops`, from `hops`, hopsFromStart's answer)
 * on the catalog, and its solo terms (`job.solo`) when `on`; `on` false takes the terms off again
 * (a session that goes online). Restorations, halls and other features' projects keep their own.
 */
export function applySoloScale(catalog, hops, on, curve = SOLO_CURVE) {
  for (const job of Object.values(catalog?.jobs || {})) {
    if (job?.kind !== 'street' && job?.kind !== 'upgrade') continue;
    if (hops) {
      const h = hops[g(job.street)];
      if (Number.isFinite(h)) job.hops = h;
      else delete job.hops;
    }
    if (on) job.solo = soloTerms(job.hops, curve);
    else delete job.solo;
  }
  return catalog;
}

/**
 * The board's line for a solo project: its amounts, and how its distance eases them. Null when the
 * project has no solo terms (online, a restoration).
 */
export function soloAmountsLine(job) {
  const s = job?.solo;
  if (!s) return null;
  const head = `Solo amounts: 1/${s.divisor} of the original multiplayer totals`;
  const last = SOLO_CURVE[SOLO_CURVE.length - 1];
  if (s.divisor === last.divisor && !s.skillDrop) return `${head}.`;
  const where = Number.isFinite(s.hops) ? `, as ${job.label || 'this street'} is ${s.hops === 1 ? '1 street' : `${s.hops} streets`} from the start` : ', as it is near the start';
  const skills = s.skillDrop >= SKILLS_WAIVED ? ' Its work needs no skills.' : s.skillDrop ? ` Its work skills are ${s.skillDrop === 1 ? 'a level' : `${s.skillDrop} levels`} lower.` : '';
  return `${head}${where}.${skills}`;
}

/** The Projects panel's line for solo (projects-tracker.js PROJECTS_TEXT.solo). */
export const SOLO_PANEL_LINE = `Solo amounts: 1/${SOLO_CURVE[SOLO_CURVE.length - 1].divisor} of the original totals, down to 1/${SOLO_CURVE[0].divisor} near the start.`;
