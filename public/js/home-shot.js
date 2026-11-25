/**
 * The whole home location as one picture (G1284, report #669, Austin 2026-11-25: "can we expand
 * the snapshot feature to take a photo of the entire house like in Glitch?"). Pure rules: no Pixi,
 * no DOM. js/home-shot-render.js draws what these plan; features/homes-feature.js says what the
 * home holds (homeShotSource); features/snaps-feature.js takes it as a Snap.
 *
 * What Glitch did (glitch-client, CC0):
 * - The player's camera snapped the viewport only: CameraMan.as snap() 492-515 asks
 *   getSnapshot(SNAPSHOT_TYPE_USER), and LocationRenderer.as getSnapshot 594-615 moves the view to
 *   the location's centre only "if not a user snap (users snap just show the viewport)".
 * - The whole home was a separate, automatic picture: TSFrontController.as saveHomeImg 1515-1546,
 *   only while the player is at home (pc.home_info.playerIsAtHome), getSnapshot(SNAPSHOT_TYPE_NORMAL,
 *   location.mg.w): the whole location at its own width, drawn off the camera, and 3 s later
 *   APICall.as homeImage 354-370 posted it 720 wide to simple/homes.setImage. It was taken after
 *   decorating (HandOfDecorator.as 952), a house change (ChassisManager.as 552, 2 s later),
 *   cultivation (CultManager.as 201) and arriving home in the new-player flow (TSMainView.as 1777).
 *
 * The camera option is a remake addition (inventions: camera-whole-house): Glitch's camera never
 * snapped the whole house. It renders the whole place the way saveHomeImg did (off the camera, the
 * full location), every floor stacked as Glitch's house location stacked them: the top floor at
 * the top, each floor's frame shared with the one above (inc_homes.js homes_rebuild_floor). As a
 * player's 2012 picture of a whole house shows (report #669, Austin 2026-11-25, G1289), it starts
 * at the top floor's top frame and ends at the ground floor's floor frame: no attic, no earth.
 *
 * Remake: each floor is its own room (js/home-floors.js), so a floor the player is not on is drawn
 * from what the home keeps (its walls, floor, furniture, Doors, the machines and the Crafty Bot
 * there, G1290, and the owner's own stacks there); the floor the player stands on is the live
 * scene, players and all.
 */

/** The words the option and its refusals use (the remake's own: Glitch's camera had no such option). */
export const HOME_SHOT_COPY = Object.freeze({
  house: 'Snap the whole house',
  tower: 'Snap the whole Tower',
  street: 'Snap the whole street',
  keyHint: 'Shift+Enter',
  refusedAway: 'You can only snap the whole house in your own home.',
  refusedVisit: 'You can only snap the whole house in your own home, not on a visit.',
  refusedBusy: 'Finish what you are doing first, then snap the whole house.',
  failed: 'The whole house could not be drawn. Try again in a moment.',
});

/** The kinds of picture: the house (every floor), the Tower (every floor), the home street. */
export const HOME_SHOT_KINDS = Object.freeze(['house', 'tower', 'street']);

/**
 * PURE: what the whole-place option does here. `ctx` is engine.homeContext() ({ inHome, owned,
 * room }), `tower` true on a Tower floor, `visiting` true on another player's home (MPVISIT).
 * Returns { kind, label } in your own home, { refused } on a visit (Austin's call: own home only),
 * or null anywhere else (the option is not offered).
 */
export function homeShotState({ ctx = null, tower = false, visiting = false } = {}) {
  if (visiting) return { refused: HOME_SHOT_COPY.refusedVisit };
  if (!ctx?.inHome) return null;
  if (!ctx.owned) return { refused: HOME_SHOT_COPY.refusedVisit };
  if (ctx.room === 'street') return { kind: 'street', label: HOME_SHOT_COPY.street };
  if (ctx.room === 'interior') return tower ? { kind: 'tower', label: HOME_SHOT_COPY.tower } : { kind: 'house', label: HOME_SHOT_COPY.house };
  return null;
}

/**
 * PURE: the bands of a stacked picture. `floors` lists each floor, ground floor first:
 * { index, frameTop, bound, pitch } in that floor's own room y (home-wallpaper.js roomPieces:
 * frameTop the top frame's top, bound the floor frame's foot, pitch one storey: the wall's 458 px
 * and a frame). G1289 (#669, Austin 2026-11-25): the floors stack as in Glitch's whole-house
 * picture, the top floor from its top frame (no attic over it) and the ground floor down to its
 * floor frame (no earth under it); each floor shows its storey down to its bound (the frame under
 * it, which is the top frame of the floor below). A floor with no frameTop starts at `top`.
 * Returns { bands: [{ index, y0, y1, dy }], h }, the bands top floor first and dy each band's
 * place in the picture (from 0), or null with no floors.
 */
export function homeShotBands(floors = []) {
  const list = (Array.isArray(floors) ? floors : []).filter((f) => f && [f.bound, f.pitch].every(Number.isFinite) && (Number.isFinite(f.frameTop) || Number.isFinite(f.top)));
  if (!list.length) return null;
  const last = list.length - 1;
  const bands = [];
  let dy = 0;
  for (let i = last; i >= 0; i -= 1) {
    const f = list[i];
    const y0 = i === last ? (Number.isFinite(f.frameTop) ? f.frameTop : f.top) : f.bound - f.pitch;
    const y1 = f.bound;
    bands.push({ index: f.index ?? i, y0, y1, dy });
    dy += y1 - y0;
  }
  return { bands, h: dy };
}

/**
 * PURE: the scale a whole-place picture is drawn at. With `width` (an automatic picture of a set
 * width, as saveHomeImg's 720) that width over the place's; else the screen's own resolution (a
 * Snap at full resolution, G1240), no more than fits the site's largest Snap (maxW x maxH, 1920 x
 * 1200) and never under `min`.
 */
export function homeShotScale({ w, h, resolution = 1, width = 0, maxW = 1920, maxH = 1200, min = 0.05 } = {}) {
  const W = Number(w);
  const H = Number(h);
  if (!(W > 0) || !(H > 0)) return 0;
  if (Number(width) > 0) return Number(width) / W;
  const r = Number(resolution) > 0 && Number.isFinite(Number(resolution)) ? Number(resolution) : 1;
  return Math.max(min, Math.min(r, maxW / W, maxH / H));
}

/** PURE: the picture's pixel size for a place w x h at `scale` (the image is the place at that scale). */
export function homeShotSize(w, h, scale) {
  return { w: Math.max(1, Math.round(Number(w) * scale)), h: Math.max(1, Math.round(Number(h) * scale)) };
}

/**
 * PURE: where each band lands in the picture, in pixels: { index, y, h } with each band starting
 * where the one above ended, so the floors meet with no gap or overlap and fill the height.
 */
export function homeShotRows(bands, scale) {
  return (bands || []).map((b) => {
    const y = Math.round(b.dy * scale);
    const end = Math.round((b.dy + b.y1 - b.y0) * scale);
    return { index: b.index, y, h: Math.max(1, end - y) };
  });
}
