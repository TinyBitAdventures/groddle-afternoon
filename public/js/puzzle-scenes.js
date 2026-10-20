/**
 * Two puzzle levels whose streets were never archived, rebuilt as feature
 * scenes (pure data and rules; features/puzzle-scenes-feature.js draws them).
 *
 * - Constellation ("lvl_constellation_connect_dots", LHFNN2C4NC73G1P in the
 *   map data, no geometry): reference video -iW1b8ix3W8 shows the avatar on a
 *   cloud bank under a star field, clicking stars one after another; each
 *   click draws a line from the last star, and the closed outline is a piggy
 *   whose eye lights up as a moon. The star placement here is a fresh piggy
 *   (no video pixels): click its stars in order around the outline.
 * - Beam Me Down (Paradise, template LHF12N7BER53E0U, not archived): video
 *   JyE3RpWp9nc starts on a cloud ("Everyone's friendly here!"), drops the
 *   avatar past green flying saucers whose tractor beams slow the fall and
 *   hold quoins (+4 iMG, mood, energy, currants), and ends on a cloud floor at
 *   "Bravo! You made it!" with an EXIT door (+138 iMG). Saucer art is the CoU
 *   tower_quest ufo_1 (CC0).
 */

export const SCENE_PREFIX = 'PUZZLESCENE_';
export const sceneTsid = (id) => `${SCENE_PREFIX}${String(id).toUpperCase()}`;
export const isPuzzleSceneTsid = (tsid) => String(tsid || '').startsWith(SCENE_PREFIX);
export const sceneIdFromTsid = (tsid) => (isPuzzleSceneTsid(tsid) ? String(tsid).slice(SCENE_PREFIX.length).toLowerCase() : null);

/** Deterministic pseudo-random sequence (field stars, quoin types). */
export function seeded(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Constellation                                                      */
/* ------------------------------------------------------------------ */

/**
 * The piggy, nose to tail and round under its belly back to the nose, laid
 * out to fit what the location camera shows with the HUD panel open (about
 * 711x306 above the feet): the whole sky at once, as in the video.
 */
const fit = ([x, y]) => Object.freeze({ x: Math.round(40 + (x - 250) * 0.62), y: Math.round(16 + (y - 220) * 0.52) });
export const PIGGY_STARS = Object.freeze([
  [292, 352], [368, 318], [426, 226], [478, 312], [642, 286], [858, 272],
  [1056, 300], [1158, 246], [1132, 372], [1112, 520], [1084, 622], [980, 560],
  [760, 584], [562, 560], [482, 634], [452, 520], [334, 474], [286, 430],
].map(fit));
export const PIGGY_EYE = fit([392, 378]);

export const CONSTELLATION = Object.freeze({
  id: 'constellation',
  name: 'Constellation',
  width: 700,
  height: 340,
  floorY: 306,
  avatarScale: 0.42,
  spawn: Object.freeze({ x: 640, y: 306 }),
  exit: Object.freeze({ x: 62, y: 306 }),
  stars: PIGGY_STARS,
  eye: PIGGY_EYE,
  hitRadius: 17,
  starSize: 21,
  fieldCount: 46,
  objective: 'Click the stars in order to draw the shape in the sky',
  completion: 'The piggy in the sky winks at you!',
  reward: Object.freeze({ xp: 150, mood: 50 }),
});

/** Field stars that never crowd the constellation's own (seeded). */
export function fieldStars(scene = CONSTELLATION, seed = 7) {
  const rnd = seeded(seed);
  const out = [];
  let guard = 0;
  while (out.length < scene.fieldCount && guard < 5000) {
    guard += 1;
    const x = 12 + rnd() * (scene.width - 24);
    const y = 8 + rnd() * (scene.floorY - 76);
    const near = (p) => Math.hypot(p.x - x, p.y - y) < 30;
    if (scene.stars.some(near) || near(scene.eye) || out.some((p) => Math.hypot(p.x - x, p.y - y) < 26)) continue;
    out.push({ x: Math.round(x), y: Math.round(y), size: 0.45 + rnd() * 0.35 });
  }
  return out;
}

export function createConstellationRun() {
  return { connected: [], misses: 0, complete: false };
}

/**
 * A click in the sky. The first click must be star 0 (it pulses); each next
 * must be the following star; the last closes the loop back to star 0.
 * @returns {{ result: 'connect'|'close'|'miss'|'empty'|'done', index?: number }}
 */
export function clickConstellation(run, scene, x, y) {
  if (run.complete) return { result: 'done' };
  const r = scene.hitRadius;
  const hit = scene.stars.findIndex((s) => Math.hypot(s.x - x, s.y - y) <= r);
  if (hit < 0) return { result: 'empty' };
  const next = run.connected.length;
  if (next === scene.stars.length && hit === 0) {
    run.complete = true;
    return { result: 'close', index: 0 };
  }
  if (hit === next % scene.stars.length && next < scene.stars.length) {
    run.connected.push(hit);
    return { result: 'connect', index: hit };
  }
  run.misses += 1;
  return { result: 'miss', index: hit };
}

/** Which star to hint: the next one after a miss or a long pause. */
export function nextStarIndex(run, scene) {
  if (run.complete) return -1;
  return run.connected.length >= scene.stars.length ? 0 : run.connected.length;
}

/* ------------------------------------------------------------------ */
/* Beam Me Down                                                       */
/* ------------------------------------------------------------------ */

// Each saucer sits just under the last beam's foot and within a beam's width
// of it: the location camera shows little below the avatar, so the next beam
// must already be where a steering faller will land.
const SAUCERS = [
  [640, 760], [760, 1380], [620, 2000], [780, 2620], [900, 3240], [760, 3860], [640, 4480],
];

export const BEAM_ME_DOWN = Object.freeze({
  id: 'beam_me_down',
  name: 'Beam Me Down',
  width: 1400,
  height: 5200,
  floorY: 5100,
  avatarScale: 0.6,
  spawn: Object.freeze({ x: 330, y: 420 }),
  startCloud: Object.freeze({ x0: 170, x1: 470, y: 420 }),
  exit: Object.freeze({ x: 1000, y: 5100 }),
  beamLength: 540,
  beamTop: 150,
  beamBottom: 300,
  saucers: SAUCERS.map(([x, y]) => Object.freeze({ x, y })),
  quoinTypes: Object.freeze(['xp', 'mood', 'energy', 'currants']),
  quoinAmount: 4,
  objective: 'Drop through the saucers’ beams and gather what they hold',
  completion: 'Bravo! You made it!',
  reward: Object.freeze({ xp: 138 }),
  sign: 'Everyone’s friendly here!',
});

/** Tractor beam under a saucer: a cone from beamTop wide to beamBottom wide. */
export function beamAt(scene, x, y) {
  for (const s of scene.saucers) {
    const top = s.y + 30;
    const t = (y - top) / scene.beamLength;
    if (t < 0 || t > 1) continue;
    const half = (scene.beamTop + (scene.beamBottom - scene.beamTop) * t) / 2;
    if (Math.abs(x - s.x) <= half) return s;
  }
  return null;
}

/** Quoins hang down each beam, three apiece, types in rotation. */
export function beamQuoins(scene = BEAM_ME_DOWN) {
  const out = [];
  scene.saucers.forEach((s, i) => {
    for (let k = 0; k < 3; k += 1) {
      const t = 0.3 + k * 0.28;
      out.push({
        id: `b${i + 1}_${k + 1}`,
        x: Math.round(s.x + (k - 1) * 0.18 * (scene.beamTop + (scene.beamBottom - scene.beamTop) * t)),
        y: Math.round(s.y + 30 + scene.beamLength * t),
        type: scene.quoinTypes[(i + k) % scene.quoinTypes.length],
        amount: scene.quoinAmount,
      });
    }
  });
  return out;
}

/** Movement multipliers inside / outside a beam (slow, floaty fall in the light). */
export function beamPhysics(inBeam) {
  return inBeam ? { speed: 1.1, jump: 1, gravity: 0.1, vyMax: 0.22 } : { speed: 1.1, jump: 1, gravity: 0.8, vyMax: 0.85 };
}

export const SCENES = Object.freeze({ constellation: CONSTELLATION, beam_me_down: BEAM_ME_DOWN });

/** Saved slice: { done: { id: n }, returnTo }. */
export function normalizeSceneSave(seed) {
  const out = { done: {}, returnTo: null };
  if (!seed || typeof seed !== 'object') return out;
  for (const [k, v] of Object.entries(seed.done || {})) if (SCENES[k] && Number(v) > 0) out.done[k] = Math.floor(Number(v));
  const r = seed.returnTo;
  if (r && typeof r.tsid === 'string' && !isPuzzleSceneTsid(r.tsid)) out.returnTo = { tsid: r.tsid, x: Number(r.x) || 0, y: Number(r.y) || 0 };
  return out;
}
