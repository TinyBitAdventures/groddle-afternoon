/**
 * G888: streets with no road back to Ur, and the exit that stands on one when nothing runs there.
 *
 * Austin 2026-11-16: "For the stuck quests, maybe we should do something more generic. Can we do a
 * 'is quest active' check? If the quest isn't active there should be a visible exit that appears
 * which takes you back to a normal street." G886 and G887 fixed dead ends one kind at a time (quest
 * rooms, practice streets, colour levels) with hand lists and an automatic move out. This is the
 * one rule for all of them:
 * - A dead end is any street of the index whose roads (signpost-graph.json signposts and doors,
 *   plus the ways out a feature runs itself, its `urRoads`) never lead to Hechey Track
 *   (js/quest-instance.js streetsReachingUr): quest rooms, practice streets, colour levels, Umbra
 *   and Penumbra, Old Groddle Forest (hub 28) and the other link-only streets, and any street added
 *   later, with no list to keep. Homes, scenes and builder drafts are never one.
 * - Active: something already runs there and owns the way out (a quest room's run, a colour level
 *   taken from the Map card, the tutorial, a held instance, a ride, the dead in Naraka). Each owner
 *   answers its own `deadEndRun(engine)` through the feature host (features/dead-ends-feature.js
 *   deadEndActive).
 * - A dead end with nothing active shows the exit: Tiny Speck's CC0 wooden arrow (sign_arrow_1,
 *   as the practice streets' EXIT, js/practice-streets.js) with the word EXIT on it, a wall sign
 *   hung near where you arrived. It works as a door: its Enter verb (not walking into it, so no
 *   one exploring leaves by accident) takes you to your last ordinary street (quest-instances-feature safeWayOut, js/quest-instance.js strayWayOut).
 *
 * Source: Glitch never left anyone on one of these. Instances were entered through their quest
 * and left by their exit (players/inc_instances.js instances_exit / instances_get_exit), and the
 * practice streets' EXIT teleporter took you back whatever the quest
 * (locations/inc_skillquest.js onTeleporterCollision 27-40). The sign on every dead end is the
 * remake's own (the remake keeps these instance copies as plain streets anyone can reach by a link
 * or a save); G978 (Austin 2026-11-17): a wall sign as the source's, no post.
 */

import { STRAY_FALLBACK_TSID, streetsReachingUr } from './quest-instance.js?v=bb5d53fd';

/** The exit's art and words (the arrow and its word as js/practice-streets.js EZ_EXIT_SIGN). */
export const DEAD_END_EXIT = Object.freeze({
  sprite: 'sign_arrow_1',
  art: 'assets/decos/groddle/sign_arrow_1.webp',
  // The arrow board at 0.85 of its 140 x 93, hung on the wall as the practice streets' EXIT hangs
  // (EZ_EXIT_SIGN's foot at y -165 over the floor at -92: 73 px, 62 at 0.85).
  w: 119,
  h: 79,
  hang: 62,
  word: 'EXIT',
  wordSize: 19,
  // The word sits on the shaft, left of the board's centre (practice-streets.js practiceExitSign: -8 at full size).
  wordDx: -7,
  // How far from where you arrived it stands, tried in this order (toward the nearer street end
  // first), on a floor within `step` px of your feet; else right where you stand.
  offsets: Object.freeze([170, -170, 290, -290, 110, -110]),
  step: 60,
});

export const DEAD_END_TEXT = Object.freeze({
  label: 'Exit',
  verb: 'Enter',
  tip: (name) => (name ? `Back to ${name}` : 'Back to a street with roads to Ur'),
  subtitle: (name) => (name ? `The way out, back to ${name}` : 'The way out, back to a street with roads to Ur'),
});

const gKey = (tsid) => {
  const s = String(tsid || '');
  return s.startsWith('L') ? `G${s.slice(1)}` : s;
};

/** A tsid shaped like a street of the index (G or L and the rest), not a home, scene or draft id. */
export const indexShaped = (tsid) => /^[GL][A-Z0-9]{8,}$/.test(String(tsid || ''));

/**
 * The streets whose roads lead to Ur: the signpost graph plus `roads` ({ from, to } rows: the ways
 * out a feature runs itself, a hidden floor's teleporter), a G-keyed Set, or null without a graph.
 */
export function urReach(graph, roads = []) {
  return streetsReachingUr(graph, STRAY_FALLBACK_TSID, roads);
}

/** A dead end: a street of the index (`known`) that `reach` (urReach) does not hold. Unknown until the graph is in. */
export function isDeadEndTsid(tsid, reach, { known = indexShaped } = {}) {
  if (!reach || !indexShaped(tsid) || !known(tsid)) return false;
  return !reach.has(gKey(tsid));
}

/** The floor line's y at x (screen space), or null off it. */
function lineY(p, x) {
  const lo = Math.min(p.x1, p.x2);
  const hi = Math.max(p.x1, p.x2);
  if (x < lo || x > hi) return null;
  const dx = p.x2 - p.x1;
  if (Math.abs(dx) < 1e-6) return Math.min(p.y1, p.y2);
  return p.y1 + ((x - p.x1) / dx) * (p.y2 - p.y1);
}

/** A line the avatar stands on (street-model.js isItemFloor: pc_perm and item_perm neither 1 nor 0). */
function floorLine(p) {
  const pc = p?.pcPerm !== undefined ? p.pcPerm : p?.pc_perm;
  let item = p?.itemPerm !== undefined ? p.itemPerm : p?.item_perm;
  if (item === undefined) item = pc;
  return pc !== 1 && pc !== 0 && item !== 1 && item !== 0;
}

/**
 * The floor at x for feet at y: the first one at or under the feet (within `below` px), else the
 * nearest one over them (within `above` px, a step up); else null.
 */
export function floorAt(platforms, x, y, { above = 120, below = 420 } = {}) {
  let under = null;
  let over = null;
  for (const p of platforms || []) {
    if (!p || !floorLine(p)) continue;
    const at = lineY(p, x);
    if (at == null || at < y - above || at > y + below) continue;
    if (at >= y - 8) {
      if (under == null || at < under) under = at;
    } else if (over == null || at > over) over = at;
  }
  return under ?? over;
}

/**
 * Where the exit stands (screen space, its foot on a floor): near `arrival` (where you arrived),
 * first toward the nearer street end so a walk into the street does not run into it, on a floor
 * within reach of the arrival's height; else right at the arrival. With no arrival, the left end.
 * `width` is the street's screen width. Answers { x, y, side } (side -1: it points left).
 */
export function deadEndExitSpot({ platforms = [], arrival = null, width = 0 } = {}) {
  const w = Math.max(240, Number(width) || 0);
  const lo = 70;
  const hi = w - 70;
  const a = arrival && Number.isFinite(arrival.x) && Number.isFinite(arrival.y)
    ? { x: arrival.x, y: arrival.y }
    : null;
  if (!a) {
    const x = lo + 50;
    const y = floorAt(platforms, x, -Infinity, { above: 0, below: Infinity });
    return { x, y: y ?? 0, side: -1 };
  }
  const toward = a.x < w / 2 ? -1 : 1;
  for (const off of DEAD_END_EXIT.offsets) {
    const x = Math.round(a.x + off * toward);
    if (x < lo || x > hi) continue;
    const y = floorAt(platforms, x, a.y, { above: DEAD_END_EXIT.step, below: DEAD_END_EXIT.step });
    if (y == null) continue;
    return { x, y: Math.round(y), side: Math.sign(off * toward) };
  }
  // A ledge too small for it beside you (a puzzle street's floating block): on yours, under your feet.
  const x = Math.round(Math.min(hi, Math.max(lo, a.x)));
  return { x, y: Math.round(floorAt(platforms, x, a.y) ?? a.y), side: toward };
}
