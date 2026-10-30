/**
 * Reach: a thing on another level, behind a floor, is not in reach.
 *
 * The original client (glitch-client, com/tinyspeck/engine) offered Enter and
 * Up only what the avatar touched:
 * - control/engine/PhysicsController.as 636-647: each frame the avatar's
 *   circle (AvatarPhysicsHandler.as 495-498, centred half the avatar's height
 *   over the feet) is tested against each itemstack's circle
 *   (LocationItemstackView.as 824-831 setPhysicsProps, at least 100 x 100);
 * - view/renderer/MiddleGroundRenderer.as 1091-1124 and 1158-1167: of those,
 *   only the ones whose hit_target overlaps the avatar's hit box
 *   (AbstractAvatarView.as 139-149: 66 x 123, 10 px under the feet) glow and
 *   go into _interaction_spV, the set Enter and the chooser use
 *   (LocationInputHandler.as 209-238).
 * The remake's Enter reach is looser (100 px from the feet to the thing's
 * box), so a plant in a cave under the floor you stand on came within reach
 * (bug report, Gentle Island Exit). A thing is out of reach when a platform
 * line lies between the avatar's body and the nearest part of the thing:
 * the floor under your feet when it is below you, the floor it stands on when
 * it is above you. Steps, slopes and ledges you could walk off are not
 * between, so a piggy just above or below a step stays in reach.
 *
 * Clicks: with dont_move_for_item_menu on (FlashVarModel.as 210) a click
 * opened the menu at once (LocationInputHandler.as 873-886), and the server
 * then refused a verb over 300 px away (main.js doVerb 2939-2967, "Get
 * closer"), the client walking the avatar over and retrying
 * (TSFrontController.as 435-452, 633 "Could not get close enough :(").
 * The remake has no walk-over, so a click on a thing behind a floor says the
 * client's line instead of opening the menu.
 *
 * Pure geometry, screen space (y down), like street-model.js platformsScreen.
 */

/** The client's line when the avatar could not get to a thing (TSFrontController.as 633). */
export const OUT_OF_REACH_LINE = 'Could not get close enough :(';

/**
 * How far up a thing's box the reach line ends: a thing stands on its floor
 * (trees and animals sit 2 px into it), so the line aims just over that floor.
 */
export const STAND_LIFT = 8;

/**
 * The point of a thing's box nearest the avatar's body, kept STAND_LIFT over
 * the box's bottom (unless the thing is airborne: a flying butterfly stands on
 * nothing).
 * @param {{ left:number, top:number, right:number, bottom:number }} box
 * @param {number} bx  body x
 * @param {number} by  body y
 * @param {{ airborne?: boolean }} [opts]
 */
export function reachPoint(box, bx, by, { airborne = false } = {}) {
  const floorY = airborne ? box.bottom : Math.max(box.top, box.bottom - STAND_LIFT);
  return {
    x: Math.min(Math.max(bx, box.left), box.right),
    y: Math.min(Math.max(by, box.top), floorY),
  };
}

/** A platform line's y at x (no end margin), or null off its ends. */
function lineYAt(p, x) {
  const minX = Math.min(p.x1, p.x2);
  const maxX = Math.max(p.x1, p.x2);
  if (x < minX || x > maxX) return null;
  const dx = p.x2 - p.x1;
  if (Math.abs(dx) < 1e-6) return Math.min(p.y1, p.y2);
  return p.y1 + ((x - p.x1) / dx) * (p.y2 - p.y1);
}

/**
 * The first platform line strictly between (ax, ay) and (bx, by), or null.
 * Lines switched off (pc_perm 0) never separate. "Strictly": the sight line
 * has to pass from one side of the line to the other by more than `margin`
 * px, so a point on a floor is not behind it.
 * `skip(p)` leaves a line out (behindFloor: the lines through the avatar's own body).
 * @param {{ x1:number,y1:number,x2:number,y2:number,pcPerm?:number|null }[]} platforms
 */
export function floorBetween(platforms, ax, ay, bx, by, margin = 1, skip = null) {
  if (!Array.isArray(platforms) || !platforms.length) return null;
  const vertical = Math.abs(bx - ax) < 0.5;
  const segY = (x) => (vertical ? ay : ay + ((x - ax) / (bx - ax)) * (by - ay));
  for (const p of platforms) {
    if (!p || p.pcPerm === 0) continue;
    if (skip && skip(p)) continue;
    if (vertical) {
      const y = lineYAt(p, ax);
      if (y == null) continue;
      if (y > Math.min(ay, by) + margin && y < Math.max(ay, by) - margin) return p;
      continue;
    }
    const lo = Math.max(Math.min(ax, bx), Math.min(p.x1, p.x2));
    const hi = Math.min(Math.max(ax, bx), Math.max(p.x1, p.x2));
    if (lo > hi) continue;
    const y0 = lineYAt(p, lo);
    const y1 = lineYAt(p, hi);
    if (y0 == null || y1 == null) continue;
    const d0 = segY(lo) - y0;
    const d1 = segY(hi) - y1;
    if ((d0 < -margin && d1 > margin) || (d0 > margin && d1 < -margin)) return p;
  }
  return null;
}

/**
 * Whether a floor separates the avatar from a thing.
 * @param {object[]} platforms  screen-space platform lines
 * @param {{ x:number, y:number }} body  the avatar's body point (feet less half its height)
 * @param {{ left:number, top:number, right:number, bottom:number }|null} box  the thing's box
 * @param {{ x:number, y:number }} [at]  the thing's foot point when it has no box
 * @param {{ airborne?: boolean, feetY?: number }} [opts]  feetY: a line crossing the avatar
 *   between its feet and its body point runs through the avatar itself (a shelf at chest
 *   height over a slope), so it is not between the avatar and anything
 */
export function behindFloor(platforms, body, box, at = null, opts = {}) {
  if (!body || !Array.isArray(platforms) || !platforms.length) return false;
  let pt;
  if (box) pt = reachPoint(box, body.x, body.y, opts);
  else if (at) pt = { x: at.x, y: opts.airborne ? at.y : at.y - STAND_LIFT };
  else return false;
  const feetY = Number.isFinite(opts.feetY) ? opts.feetY : null;
  const skip = feetY == null ? null : (p) => {
    const y = lineYAt(p, body.x);
    return y != null && y > body.y && y < feetY - 2;
  };
  return Boolean(floorBetween(platforms, body.x, body.y, pt.x, pt.y, 1, skip));
}
