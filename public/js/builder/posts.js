/**
 * LEVEL BUILDER (spec 7.3 PHY-001, PHY-009; 8.2 arrivals --posts; P7): signposts and the floor
 * they stand on. Pure: no DOM, no Pixi; the CLI, the editor and the validator share it.
 *
 * - postFloor: the floor line a signpost stands on (the nearest standable line within 80 px of its
 *   foot, as location-navigation.js platformYNear finds an arrival's ground; else the first floor
 *   under it).
 * - postOffFloor: whether it floats over that floor or sinks into it. A post the builder made
 *   stands on the line (CLI connect and link-world, the editor's S tool); Tiny Speck's posts on a
 *   forked street stand 1 to 47 px over theirs (2,715 posts: median 16, p99 47), so a fork is
 *   allowed that.
 * - settlePostOps: signpost.set ops that stand off-floor posts on their floor again.
 * - carryPostOps: when a line moves, the posts standing on it move with it.
 * - arrivalOps: every arm into the zone's streets worked out again where the post leading back
 *   now stands (was cli.mjs's; the editor uses it after carrying or settling posts).
 */
import { isStandable, platformsScreen, isBuriedSignpost } from '../street-model.js?v=23b926e5';
import { applyOps } from './ops.js?v=acf30407';
import { arriveFor } from './geometry-handles.js?v=d39231a4';

/** How far (px) a post's foot may be from its floor before it is off it: over it, and sunk into it. */
export const POST_FLOOR = Object.freeze({ reach: 80, built: Object.freeze({ over: 4, under: 4 }), forked: Object.freeze({ over: 48, under: 8 }) });

const forked = (street) => /\(fork of /.test(String(street?.source || ''));

/** PURE: a line's screen y at screen x, or null when x is off its span (2 px slack). */
function lineYAt(p, x) {
  const lo = Math.min(p.x1, p.x2);
  const hi = Math.max(p.x1, p.x2);
  if (x < lo - 2 || x > hi + 2) return null;
  return hi === lo ? Math.min(p.y1, p.y2) : p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1);
}

/**
 * PURE: the floor a signpost stands on: { line, y (world), gap } where gap is how far its foot is
 * over the floor (negative: sunk into it), or null when no standable line spans its x.
 */
export function postFloor(street, post) {
  if (!street?.bounds || !post) return null;
  const x = post.x - street.bounds.l;
  const y = post.y - street.bounds.t;
  let near = null;
  let under = null;
  for (const p of platformsScreen(street)) {
    if (!isStandable(p)) continue;
    const py = lineYAt(p, x);
    if (py == null) continue;
    const d = Math.abs(py - y);
    if (d <= POST_FLOOR.reach && (!near || d < near.d)) near = { p, py, d };
    if (py >= y && (!under || py < under.py)) under = { p, py };
  }
  const hit = near || under;
  if (!hit) return null;
  return { line: hit.p.id ?? null, y: Math.round(hit.py + street.bounds.t), gap: Math.round((hit.py - y) * 10) / 10 };
}

/**
 * PURE: why a signpost is off its floor ({ why: 'floats' | 'sunk' | 'none', gap, floor }), or null
 * when it stands on it. Buried posts (Tiny Speck's holes, street-model.js isBuriedSignpost) are left alone.
 */
export function postOffFloor(street, post) {
  if (!street?.bounds || !post || isBuriedSignpost(street, post)) return null;
  const floor = postFloor(street, post);
  if (!floor) return { why: 'none', gap: null, floor: null };
  const tol = forked(street) ? POST_FLOOR.forked : POST_FLOOR.built;
  if (floor.gap > tol.over) return { why: 'floats', gap: floor.gap, floor };
  if (floor.gap < -tol.under) return { why: 'sunk', gap: floor.gap, floor };
  return null;
}

/** PURE: words for an off-floor post. */
export function offFloorWords(post, off) {
  if (off.why === 'none') return `Signpost ${post.id} has no floor under it.`;
  return off.why === 'floats'
    ? `Signpost ${post.id} floats ${Math.round(off.gap)} px over its floor (${off.floor.line}).`
    : `Signpost ${post.id} stands ${Math.round(-off.gap)} px under its floor (${off.floor.line}).`;
}

/**
 * PURE: signpost.set ops that stand each off-floor post on its floor (`ids` limits it to some
 * posts, which are then settled even when within the fork allowance). Answers { ops, posts:
 * ["<street>/<post>"], none: [posts with no floor under them] }.
 */
export function settlePostOps(zone, { street = null, ids = null } = {}) {
  const ops = [];
  const posts = [];
  const none = [];
  for (const row of zone?.streets || []) {
    if (street && row.key !== street) continue;
    for (const post of row.street?.signposts || []) {
      if (ids && !ids.includes(post.id)) continue;
      const off = postOffFloor(row.street, post);
      const floor = off ? off.floor : (ids ? postFloor(row.street, post) : null);
      if (off?.why === 'none' || (ids && !floor)) {
        none.push(`${row.key}/${post.id}`);
        continue;
      }
      if (!floor || floor.y === post.y) continue;
      ops.push({ op: 'signpost.set', street: row.key, id: post.id, set: { y: floor.y } });
      posts.push(`${row.key}/${post.id}`);
    }
  }
  return { ops, posts, none };
}

/**
 * PURE: when a platform changes (`set`: its new x1, y1, x2, y2), the signposts standing on it
 * (on the floor by postOffFloor, with that line as their floor) move with it, keeping their height
 * over it. A post whose x is off the line's new span stays. Answers signpost.set ops.
 */
export function carryPostOps(street, key, platformId, set) {
  const old = (street?.platforms || []).find((p) => p.id === platformId);
  if (!old || !street?.bounds) return [];
  const next = { ...old, ...set };
  const ops = [];
  for (const post of street.signposts || []) {
    const floor = postFloor(street, post);
    if (!floor || floor.line !== platformId || postOffFloor(street, post)) continue;
    const y = lineYAt({ x1: next.x1, y1: next.y1, x2: next.x2, y2: next.y2 }, post.x);
    const was = lineYAt(old, post.x);
    if (y == null || was == null) continue;
    const ny = Math.round(post.y + (y - was));
    if (ny !== post.y) ops.push({ op: 'signpost.set', street: key, id: post.id, set: { y: ny } });
  }
  return ops;
}

/**
 * PURE: every arm that leads to one of the zone's streets (its own arms, and edits[] on shipped
 * streets) with its arrival worked out again where the target's signpost leading back now stands
 * (arriveFor, as build-street-navigation.mjs does). `street` limits it to the arms on one street,
 * `into` to the arms that land on one street. Answers { ops, arms: ["<street>/<post>/<n>" | "edit/<n>"] }.
 */
export function arrivalOps(zone, { street = null, into = null } = {}) {
  const byTsid = new Map((zone.streets || []).map((r) => [r.street?.tsid, r]));
  const same = (a, b) => (a?.x ?? null) === (b?.x ?? null) && (a?.y ?? null) === (b?.y ?? null);
  const ops = [];
  const arms = [];
  for (const row of zone.streets || []) {
    if (street && row.key !== street) continue;
    for (const post of row.street.signposts || []) {
      (post.connects || []).forEach((c, at) => {
        const target = byTsid.get(c.tsid);
        if (!target || (into && target.key !== into)) return;
        const arrive = arriveFor(target.street, row.street.tsid);
        if (!arrive || same(arrive, c.arrive)) return;
        ops.push({ op: 'connect.set', street: row.key, signpost: post.id, at, set: { arrive } });
        arms.push(`${row.key}/${post.id}/${at}`);
      });
    }
  }
  (zone.edits || []).forEach((e, at) => {
    if (street || e.op !== 'add-connect' || !e.connect) return;
    const target = byTsid.get(e.connect.tsid);
    if (!target || (into && target.key !== into)) return;
    const arrive = arriveFor(target.street, e.tsid);
    if (!arrive || same(arrive, e.connect.arrive)) return;
    ops.push({ op: 'edit.remove', at }, { op: 'edit.add', at, edit: { ...e, connect: { ...e.connect, arrive } } });
    arms.push(`edit/${at}`);
  });
  return { ops, arms };
}

/**
 * PURE: what follows a batch of edits on one street: the posts standing on a platform the batch
 * moves go with it, and the arms landing on that street are worked out again. Answers
 * { ops (the batch's own, then the carried posts, then the arms), carried, arms }.
 */
export function followPostOps(zone, ops) {
  const work = JSON.parse(JSON.stringify(zone));
  const carried = [];
  const extra = [];
  const streets = new Set();
  for (const op of ops) {
    if (op?.op !== 'platform.set' || !op.set) continue;
    const row = (work.streets || []).find((r) => r.key === op.street);
    if (!row) continue;
    for (const c of carryPostOps(row.street, op.street, op.id, op.set)) {
      if (ops.some((o) => o.op === 'signpost.set' && o.street === c.street && o.id === c.id)) continue;
      extra.push(c);
      carried.push(`${c.street}/${c.id}`);
    }
    streets.add(op.street);
  }
  if (!extra.length) return { ops, carried, arms: [] };
  applyOps(work, [...ops, ...extra]);
  const arrive = [];
  const arms = [];
  for (const key of streets) {
    const a = arrivalOps(work, { into: key });
    arrive.push(...a.ops);
    arms.push(...a.arms);
  }
  return { ops: [...ops, ...extra, ...arrive], carried, arms };
}
