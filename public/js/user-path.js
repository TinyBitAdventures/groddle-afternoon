/**
 * MAPWALK: a walk you start yourself, as the 2012 client walked one (pure: no Pixi, no DOM).
 * game.js steers the avatar with it (startUserWalk, avatarWalkSteer); the street map
 * (js/ui/street-minimap.js) starts it.
 *
 * Source (glitch-client, Tiny Speck, CC0):
 * - MiniMapView.as mouseUpHandler 430-460: a click on the map is a world point; a signpost,
 *   another player's dot or a tracked item is that thing. Nothing unless the main view has
 *   focus (focused_component is TSMainView).
 * - TSFrontController.as startUserInitiatedPath 1874-1880: nothing while a walk the server
 *   started is running (avatar_gs_path_pt).
 * - AvatarController.as beginPath 230-330: the goal is one x. A signpost (and a point) is its
 *   own x; a player (PCView) and an item (LocationItemstackView) stop short on your side by
 *   half the way there, at most 70 px (max_offset). It takes you off a ladder (getOffLadder).
 * - AvatarPhysicsHandler.as updateAvatarVelocities 320-360: the path only holds left or right
 *   at walk speed, as the arrow keys would. No jumps, no ladders, no route: a goal up on a
 *   ledge walks you to the x under it.
 * - What ends it: arriving within path_end_allowance (20 px, PhysicsModel.as 26;
 *   AvatarController.onGameLoop 494-520), any arrow or WASD key or Space (onRightOrLeftKey,
 *   onUpKey, onDownKey, onSpaceKey: endPath), a wall (APH 720-722 hasHitWall:
 *   cancelAllAvatarPaths), the street's ends (APH 474-476), a new street (NetController 1458).
 *   No timer: the remake's walls stop the feet without a hit flag, so a few frames with no
 *   headway stand in for hasHitWall.
 * - On arrival at another player you are beside, the client opened their menu
 *   (AvatarController.endPath 156-165: startInteractionWith the PCView).
 */

/** PhysicsModel.path_end_allowance (gs_path_end_allowance is 10). */
export const PATH_END_ALLOWANCE = 20;
/** beginPath's max_offset for a player or an item. */
export const PATH_MAX_OFFSET = 70;
/** Frames in a row with no headway that count as walking into a wall (or the street's end). */
export const PATH_STALL_FRAMES = 6;
/** Less than this much x in a frame is no headway. */
export const PATH_STALL_PX = 0.25;

/**
 * PURE: the x a walk heads for (beginPath 248-263). `goal` is { kind: 'sign'|'player'|'item'|
 * 'point', x }; `fromX` is where you stand.
 */
export function pathGoalX(goal, fromX) {
  const x = Number(goal?.x);
  if (!Number.isFinite(x)) return null;
  if (goal.kind !== 'player' && goal.kind !== 'item') return x;
  const from = Number(fromX) || 0;
  const offset = Math.min(Math.abs(from - x) * 0.5, PATH_MAX_OFFSET);
  return from < x ? x - offset : x + offset;
}

/** A walk you start: { x, kind, id, y, tsid, lastX, stall }. */
export function createUserPath(goal, { fromX, tsid = '', worldW = Infinity } = {}) {
  const gx = pathGoalX(goal, fromX);
  if (gx == null) return null;
  return {
    user: true,
    x: Math.max(0, Math.min(worldW, gx)),
    kind: String(goal.kind || 'point'),
    id: goal.id == null ? '' : String(goal.id),
    y: Number.isFinite(Number(goal.y)) ? Number(goal.y) : null,
    tsid,
    lastX: Number(fromX) || 0,
    stall: 0,
  };
}

/**
 * PURE (but for the path's own stall count): one frame of a walk you started. Returns
 * { dir: -1|0|1, end: null|'arrived'|'key'|'jump'|'wall'|'street' }.
 * @param {object} path createUserPath's
 * @param {{ x: number, moving?: boolean, jump?: boolean, tsid?: string }} now
 */
export function stepUserPath(path, { x, moving = false, jump = false, tsid = '' } = {}) {
  if (!path) return { dir: 0, end: 'gone' };
  if (path.tsid !== tsid) return { dir: 0, end: 'street' };
  if (moving) return { dir: 0, end: 'key' };
  if (jump) return { dir: 0, end: 'jump' };
  const dx = path.x - x;
  if (Math.abs(dx) < PATH_END_ALLOWANCE) return { dir: 0, end: 'arrived' };
  if (Math.abs(x - path.lastX) < PATH_STALL_PX) path.stall += 1;
  else path.stall = 0;
  path.lastX = x;
  if (path.stall >= PATH_STALL_FRAMES) return { dir: 0, end: 'wall' };
  return { dir: dx < 0 ? -1 : 1, end: null };
}
