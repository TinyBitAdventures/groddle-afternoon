/**
 * The Group Hall lot (street-projects audit 2026-11-11, gap 1): the roped-off plot with its
 * house-and-hammer sign that offered a group hall on a public street, drawn from Tiny Speck's own
 * art (CC0). Pure data and helpers; features/street-jobs-feature.js draws it and runs its verb.
 *
 * Source (glitch-GameServerJS and glitch-items, CC0):
 * - items/group_hall_lot_marker.js: label "Group Location Marker" (3), description "If you're up
 *   for it, you can build a Group Location here!" (8), in_background (134), verb talk_to "talk to",
 *   tooltip "Build a new Group Hall", enabled while it has a job to offer (hasJobs, 39-61), getAssetInfo box {x:-311, y:-115, w:621, h:115} (119).
 * - items/include/jobs.js canOffer 104-106: only the lot offers a group hall (job type 3); the Street
 *   Spirit offers types 1, 2 and 4. offerJobs 124-158: a given job first, else the first open one.
 * - quests/quest.js 1830-1840: a finished hall hides the lot (setAndBroadcastState 'visible:false').
 * - group_hall_lot_marker.swf (one frame, no states): DefineShape4 1, the roped plot, at (0, 0);
 *   DefineSprite 3 "interaction_target", the sign, at (1483, 135) twips. The client hit-tests an
 *   item by its interaction_target, so the sign is what you click. Rendered by
 *   tools/group-hall-lot-art/build.mjs.
 * - The archived location objects (streets/mnt/stos/location_data, L*.xml) list one "Group Hall Lot
 *   Marker" on Estevan Hummock, Bailestorth Shin, Waylon Way, Archimedes Acres, Welldale,
 *   Hellenturret Pass, Evanfell Craine, Doon Way and Fairgower Lane: the connecting streets of nine
 *   of the catalog's ten halls. The tenth, Addingfoot Trip, was built before the snapshot (the lot is
 *   on it, roped and queued, in the GlitchAddict video PUzIKuL2tPo "New Group Halls"), so its lot
 *   was already hidden. The markers' x/y were on item records that were never archived (as the
 *   Qurazy markers', tools/build-qurazy-markers.mjs), so the street's placement plan picks a floor
 *   run as wide as the rope.
 */

/** The item class (its band, verbs and target classId). */
export const LOT_CLASS = 'group_hall_lot_marker';

/**
 * Where js/street-ecology.js's placement plan finds the lot: a floor run the rope's width, kept off
 * signposts, doors and ladder feet as big scenery is (height: the stage's 115 px, getAssetInfo h).
 */
export const LOT_PLACEMENT = Object.freeze({ key: 'group-hall-lot', count: 1, clearance: 320, footprint: 600, height: 115 });

/**
 * The two pieces in 1x px, each piece's top-left from the item's origin (the stage's bottom
 * centre, where the sign's post meets the ground). Stage 12420 x 2292 twips = 621 x 114.6 px.
 * origin = (310.5, 114.6); plot (0, 0) 621 x 96.4; sign (74.15, 6.75) 85.9 x 107.85.
 */
export const LOT_ART = Object.freeze({
  originX: 310.5,
  originY: 114.6,
  plot: Object.freeze({ url: 'assets/sprites/street-jobs/group_hall_lot_plot@3x.webp', x: -310.5, y: -114.6, w: 621, h: 96.4 }),
  sign: Object.freeze({ url: 'assets/sprites/street-jobs/group_hall_lot_sign@3x.webp', x: -236.35, y: -107.85, w: 85.9, h: 107.85 }),
});

/** The sign's centre from the origin (its post's foot is at y 0): the hit box and the bubble go there. */
export const LOT_SIGN_X = LOT_ART.sign.x + LOT_ART.sign.w / 2;

/**
 * Half-widths of the street's planned things that would hide the sign (the planner's own groups,
 * drawn in front of the background band): the sign is what you click, so it must stay clear.
 */
export const LOT_SIGN_BLOCKERS = Object.freeze({ shrine: 70, vendor: 60, trees: 55, rocks: 55, gardens: 140 });

/** Is the sign clear when the lot stands at x facing `side` (1 as drawn, -1 mirrored)? */
function signClear(x, y, side, planned) {
  const half = LOT_ART.sign.w / 2;
  const sx = x + side * LOT_SIGN_X;
  return !Object.entries(LOT_SIGN_BLOCKERS).some(([key, w]) =>
    (planned[key] || []).some((b) => Math.abs(b.x - sx) < w + half && Math.abs(b.y - y) < 90));
}

/**
 * Where the lot stands and which way it faces. The lot goes in last (the placement plan's feature
 * groups follow the shared layout), so it takes the room that is left, and the plan only spaces
 * points: the sign, what you click, can land behind the shrine or a tree. So the lot slides along
 * its floor run (the plan point's `room`: that much floor is free on both sides) to the nearest x
 * where the sign is clear, as drawn (the sign at the left end) or, failing that, with the rope
 * mirrored and the sign at the right end (the sign's own art is never mirrored).
 * `planned`: { key: [{ x, y }] } from engine.placement. Returns { x, side }.
 */
export function lotFit(point, planned = {}) {
  const slack = Math.max(0, Math.min(400, ((Number(point.room) || 0) - LOT_ART.plot.w) / 2));
  for (let step = 0; step <= slack; step += 10) {
    for (const dx of step ? [step, -step] : [0]) {
      for (const side of [1, -1]) if (signClear(point.x + dx, point.y, side, planned)) return { x: point.x + dx, side };
    }
  }
  return { x: point.x, side: 1 };
}

/** The floor's y under x on the line nearest `nearY` (platforms: { x1, y1, x2, y2 }), else nearY. */
export function floorYAt(platforms, x, nearY) {
  let best = null;
  for (const pl of platforms || []) {
    const lo = Math.min(pl.x1, pl.x2);
    const hi = Math.max(pl.x1, pl.x2);
    if (x < lo || x > hi || hi === lo) continue;
    const y = pl.y1 + ((pl.y2 - pl.y1) * (x - pl.x1)) / (pl.x2 - pl.x1);
    if (Math.abs(y - nearY) > 40) continue;
    if (best == null || Math.abs(y - nearY) < Math.abs(best - nearY)) best = y;
  }
  return best ?? nearY;
}

/** The lot's words, from the item file (group_hall_lot_marker.js file:line). */
export const LOT_TEXT = Object.freeze({
  label: 'Group Location Marker', // 3
  desc: "If you're up for it, you can build a Group Location here!", // 8
  verb: 'talk to', // 40
  tooltip: 'Build a new Group Hall', // 48
});

/** The street's group hall jobs (catalog.byStreet after mergeHalls), in board order. */
export function lotJobIds(catalog, tsid) {
  const g = String(tsid || '').replace(/^L/, 'G');
  return (catalog?.byStreet?.[g] || []).filter((id) => catalog.jobs?.[id]?.kind === 'hall');
}

/**
 * The job the lot offers from status rows ({ jobId, status } best first, street-jobs.js streetJobs),
 * or null when the lot is hidden: no hall here, or every hall here finished (quest.js 1838).
 */
export function lotHeadline(rows, catalog) {
  const halls = (rows || []).filter((r) => catalog?.jobs?.[r.jobId]?.kind === 'hall');
  return halls.find((r) => r.status !== 'done' && r.status !== 'built') || null;
}

/** The lot's verb (talk_to): enabled while it has a hall to offer (hasJobs: open or under way). */
export function lotVerb(head) {
  const on = Boolean(head && (head.status === 'open' || head.status === 'active'));
  return { id: 'talk_to', label: LOT_TEXT.verb, enabled: on, tooltip: LOT_TEXT.tooltip, durationMs: 0 };
}
