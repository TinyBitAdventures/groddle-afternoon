/**
 * Signposts at the top of a ladder with no deck to stand on.
 *
 * The original never let a climber use a signpost: the client gives an avatar
 * on a ladder no interaction sprites (MiddleGroundRenderer._findInteractionSprites
 * returns while apo.onLadder; LocationInputHandler._beginInteractionAfterEnterKey
 * and AvatarController._beginInteractionAfterUpKey skip the ladder too). Exits
 * like that were Collision-triggered Teleporters (items/teleporter.js
 * onPlayerCollision -> pc.teleportToLocation), whose hitbox and target lived in
 * item instanceProps the location dump does not have. The signpost beside the
 * teleporter carries the same link for the map, so it stands in for it here:
 * climbing to the ladder's top takes its link, as through a door.
 *
 * Groddle Ladder (GM4115NJ46G8M): the L*.xml lists two Collision-triggered
 * Teleporters, and signpost_3 (x 950, y -2850) sits at the top of the
 * 2,900 px spine ladder (top y -2979) with no platform above y -83, leading to
 * The Great Hole to Ix. The Great Hole's own way back is a post buried under
 * its floor (street-model.js isBuriedSignpost).
 *
 * Pure data rules (world space, as in the street JSON); no DOM or Pixi.
 */

import { isStandable } from './street-model.js?v=23b926e5';

/** How far beside the post a floor still counts as standing at it. */
const DECK_REACH_X = 30;
/** How far below the post's foot a floor still counts as its deck. */
const DECK_BELOW = 150;

const cache = new WeakMap();

function standable(p) {
  return Boolean(p) && isStandable(p);
}

/**
 * The ladder whose top climbs into this signpost when there is no deck to
 * stand on beside it, or null.
 * @param {object} street street JSON (world space)
 * @param {object} signpost
 */
export function ladderTopSignpostLadder(street, signpost) {
  if (!street || !signpost) return null;
  if (!(signpost.connects || []).some((c) => c && !c.hidden)) return null;
  const x = Number(signpost.x);
  const y = Number(signpost.y);
  const w = Number(signpost.w) || 100;
  const h = Number(signpost.h) || 200;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // Buried under the floor is the other stand-in (street-model.js isBuriedSignpost).
  if (y > (street.bounds?.b ?? 0) - 20) return null;
  for (const p of street.platforms || []) {
    if (!standable(p)) continue;
    if (Math.max(p.x1, p.x2) < x - w / 2 - DECK_REACH_X || Math.min(p.x1, p.x2) > x + w / 2 + DECK_REACH_X) continue;
    const py = (p.y1 + p.y2) / 2;
    if (py >= y - h && py <= y + DECK_BELOW) return null;
  }
  let best = null;
  for (const ladder of street.ladders || []) {
    if (!ladder || !Number.isFinite(ladder.h) || ladder.h <= 0) continue;
    if (Math.abs(ladder.x - x) > w / 2 + 20) continue;
    const top = ladder.y - ladder.h;
    // Its top reaches the post's face, and it climbs up from well below it.
    if (top < y - h - 40 || top > y + 40) continue;
    if (ladder.y < y + 100) continue;
    if (!best || Math.abs(ladder.x - x) < Math.abs(best.x - x)) best = ladder;
  }
  return best;
}

function indexStreet(street) {
  let hit = cache.get(street);
  if (hit && hit.signposts === street.signposts) return hit;
  const byLadder = new Map();
  const posts = new Set();
  const offWalk = new Set();
  for (const s of street.signposts || []) {
    // A buried post (street-model.js isBuriedSignpost) is the other teleporter stand-in.
    if (Number(s?.y) > (street.bounds?.b ?? 0) - 20) offWalk.add(s);
    const ladder = ladderTopSignpostLadder(street, s);
    if (!ladder) continue;
    posts.add(s);
    offWalk.add(s);
    if (ladder.id != null && !byLadder.has(ladder.id)) byLadder.set(ladder.id, s);
  }
  hit = { signposts: street.signposts, byLadder, posts, offWalk, walkable: null };
  cache.set(street, hit);
  return hit;
}

/** Every ladder-top signpost on a street, with its ladder. */
export function ladderTopSignposts(street) {
  if (!street) return [];
  return [...indexStreet(street).posts].map((signpost) => ({ signpost, ladder: ladderTopSignpostLadder(street, signpost) }));
}

export function isLadderTopSignpost(street, signpost) {
  return !!street && indexStreet(street).posts.has(signpost);
}

/** The signpost at the top of the ladder with this id (climb wall id), or null. */
export function ladderTopSignpostFor(street, ladderId) {
  if (!street || ladderId == null) return null;
  return indexStreet(street).byLadder.get(ladderId) || null;
}

/**
 * A climber is at the top: feet within `slack` px of the climb wall's top
 * (screen space; game.js holds a deckless climber at yTop + 4).
 */
export function climberAtLadderTop(wall, feetY, slack = 8) {
  return !!wall && Number.isFinite(feetY) && feetY <= wall.yTop + slack;
}

/**
 * The street as walk-up signpost lookups should see it: ladder-top posts are
 * reached only by climbing and buried ones only by falling, so neither
 * prompts, and T beside them (proximity is by x alone: the ladder's foot, the
 * Great Hole's rim) never takes their link.
 */
export function walkUpSignpostStreet(street) {
  if (!street) return street;
  const hit = indexStreet(street);
  if (!hit.offWalk.size) return street;
  if (!hit.walkable) hit.walkable = { ...street, signposts: (street.signposts || []).filter((s) => !hit.offWalk.has(s)) };
  return hit.walkable;
}
