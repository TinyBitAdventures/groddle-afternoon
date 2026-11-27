/**
 * A teleport within the street you are on (Glitch's pc.teleportToLocation to the location the
 * player is already in, players/player.js 555-680): no loading card, no travel gate, you stand at
 * the new spot. The walk-in teleporters that land on their own street (features/hidden-floors-feature.js
 * `same` rows: Mada Tamaha's and Level 3 West's pits) and the Random Holes
 * (features/random-holes-feature.js) all go through here.
 *
 * Online, nothing more is sent: realtime-feature's tick sends where you stand as the next move frame
 * (realtime-client.js move), the server relays it as `moved`, and every other player on the street
 * draws you there (a step over realtime-client.js SNAP_DISTANCE is drawn there at once, a shorter
 * one glides there within one frame's interval).
 */

/** Stands the avatar at (x, y) (screen space, feet), stopped and in the air, and moves the camera there. */
export function teleportWithinStreet(engine, x, y) {
  const p = engine?.player;
  if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  p.onGround = false;
  engine.snapCamera?.();
  return true;
}
