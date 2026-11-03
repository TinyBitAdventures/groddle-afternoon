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

/**
 * Ticket 61: the piggy (its stars, the lines and the eye) is one layer the feature fits
 * into the part of the view no window covers (fitSky); SKY_BOX is its box in scene pixels,
 * the stars and the eye with room for a star's glow. The field stars are then scattered
 * over the clear sky around it (fieldStarsIn). The EXIT door's box is kept clear of both.
 */
export const SKY_BOX = (() => {
  const pts = [...PIGGY_STARS, PIGGY_EYE];
  const pad = 22;
  const x0 = Math.min(...pts.map((p) => p.x)) - pad;
  const y0 = Math.min(...pts.map((p) => p.y)) - pad;
  return Object.freeze({ x: x0, y: y0, w: Math.max(...pts.map((p) => p.x)) + pad - x0, h: Math.max(...pts.map((p) => p.y)) + pad - y0 });
})();
export function doorBox(scene = CONSTELLATION, pad = 12) {
  return { x: scene.exit.x - 34 - pad, y: scene.exit.y - 108 - pad, w: 68 + 2 * pad, h: 108 + 2 * pad };
}

/** Field stars that never crowd the constellation's own (seeded). */
export function fieldStars(scene = CONSTELLATION, seed = 7) {
  const rnd = seeded(seed);
  const out = [];
  let guard = 0;
  const door = doorBox(scene);
  while (out.length < scene.fieldCount && guard < 5000) {
    guard += 1;
    const x = 12 + rnd() * (scene.width - 24);
    const y = 8 + rnd() * (scene.floorY - 76);
    const near = (p) => Math.hypot(p.x - x, p.y - y) < 30;
    // Ticket 61: none behind the EXIT door either (a star half hidden by it read as a lost one).
    if (x > door.x && x < door.x + door.w && y > door.y) continue;
    if (scene.stars.some(near) || near(scene.eye) || out.some((p) => Math.hypot(p.x - x, p.y - y) < 26)) continue;
    out.push({ x: Math.round(x), y: Math.round(y), size: 0.45 + rnd() * 0.35 });
  }
  return out;
}

/**
 * Ticket 61: where the sky layer goes so no star is under a window. `area` is the part of
 * the view the sky may use and `obstacles` what covers it (both in scene pixels: the HUD
 * pills, the minimap, the side panels, the EXIT door); the largest clear rectangle (on a
 * `step` grid) takes `box` at the biggest scale that fits, at most `maxScale`, centred.
 * Returns { scale, x, y, rect } (a point p of the box draws at x + (p.x - box.x) * scale).
 */
export function fitSky({ box = SKY_BOX, area, obstacles = [], step = 8, maxScale = 1, minScale = 0.5 } = {}) {
  if (!area || area.w <= 0 || area.h <= 0) return { scale: 1, x: box.x, y: box.y, rect: null };
  const cols = Math.max(1, Math.floor(area.w / step));
  const rows = Math.max(1, Math.floor(area.h / step));
  const blocked = (c, r) => {
    const x0 = area.x + c * step;
    const y0 = area.y + r * step;
    return obstacles.some((o) => x0 < o.x + o.w && x0 + step > o.x && y0 < o.y + o.h && y0 + step > o.y);
  };
  // Largest rectangle of clear cells: a histogram per row (the classic stack method),
  // scored by the area the box would get at its fitting scale.
  const heights = new Array(cols).fill(0);
  let best = null;
  const score = (w, h) => Math.min(maxScale, (w * step) / box.w, (h * step) / box.h);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) heights[c] = blocked(c, r) ? 0 : heights[c] + 1;
    const stack = [];
    for (let c = 0; c <= cols; c += 1) {
      const h = c < cols ? heights[c] : 0;
      let start = c;
      while (stack.length && stack[stack.length - 1][1] >= h) {
        const [at, hh] = stack.pop();
        const w = c - at;
        const sc = score(w, hh);
        if (hh > 0 && (!best || sc > best.sc + 1e-9 || (Math.abs(sc - best.sc) < 1e-9 && w * hh > best.w * best.h))) {
          best = { sc, c0: at, r0: r - hh + 1, w, h: hh };
        }
        start = at;
      }
      stack.push([start, h]);
    }
  }
  if (!best) return { scale: 1, x: box.x, y: box.y, rect: null };
  const rect = { x: area.x + best.c0 * step, y: area.y + best.r0 * step, w: best.w * step, h: best.h * step };
  const scale = Math.max(minScale, best.sc);
  return {
    scale,
    x: Math.round(rect.x + (rect.w - box.w * scale) / 2),
    y: Math.round(rect.y + (rect.h - box.h * scale) / 2),
    rect,
  };
}

/**
 * Ticket 61: field stars over the clear sky of `area` (scene pixels), none under an
 * obstacle, none within 30 px of `avoid` (the fitted piggy's stars and eye) or 26 px of
 * each other; as many as the original field's density gives (46 over the 700 x 230 sky).
 */
export function fieldStarsIn(area, obstacles = [], avoid = [], seed = 7) {
  if (!area || area.w <= 0 || area.h <= 0) return [];
  const rnd = seeded(seed);
  const want = Math.max(12, Math.min(90, Math.round((CONSTELLATION.fieldCount * area.w * area.h) / (700 * 230))));
  const out = [];
  let guard = 0;
  while (out.length < want && guard < 6000) {
    guard += 1;
    const x = area.x + 8 + rnd() * (area.w - 16);
    const y = area.y + 8 + rnd() * (area.h - 16);
    const size = 0.45 + rnd() * 0.35;
    const r = 11 * size;
    if (obstacles.some((o) => x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h)) continue;
    if (avoid.some((p) => Math.hypot(p.x - x, p.y - y) < 30) || out.some((p) => Math.hypot(p.x - x, p.y - y) < 26)) continue;
    out.push({ x: Math.round(x), y: Math.round(y), size });
  }
  return out;
}

/** A sky point drawn through a fitSky transform. */
export function skyPoint(fit, p, box = SKY_BOX) {
  return { x: fit.x + (p.x - box.x) * fit.scale, y: fit.y + (p.y - box.y) * fit.scale };
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
