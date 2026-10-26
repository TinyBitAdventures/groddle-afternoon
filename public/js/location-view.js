/**
 * The street (location) viewport grows with the window, like the original
 * client (VIEWHEIGHT = "grow", Austin 2026-10-26).
 *
 * Sources (tinyspeck glitch-client, CC0):
 * - LayoutModel.as 10: min_vp_h 400; 13: max_vp_h 600.
 * - TSMainView.as resizeToStage 1229-1257: loc_vp_h = stage height less the
 *   header (min_header_h 40), the pack (MIN_PACK_HEIGHT) and 6 px, clamped to
 *   [min_vp_h, max_vp_h], then held to the location's smallest layer height.
 *   It ran on every stage resize, so the view followed the window live.
 * - TSEngineConstants.as 18: MIN_PACK_HEIGHT 132.
 * - CameraMan.as 121-138 and 285: the camera centres on the avatar less
 *   y_cam_offset (PhysicsSetting.as 23: 150), and the getter scales that
 *   offset by loc_vp_h / max_vp_h. So the avatar keeps the same share of the
 *   view at every height (0.5 + 150 / 600 = 0.75): 300 px down a 400 px
 *   view, 450 px down a 600 px one (js/movement.js cameraTargetY).
 *
 * The remake scales its 960 px wide view to the page width, so the window's
 * room is measured in view pixels: the CSS height left under the top bar,
 * divided by the canvas's CSS-per-view-pixel scale. The pack overlays the
 * bottom MIN_PACK_HEIGHT of the canvas (the camera never frames the avatar
 * there), so the canvas is the location view plus that allowance.
 *
 * Remake choices: the smallest view is the remake's old fixed 408 px (a 540 px
 * canvas), 8 px over min_vp_h, so small windows keep exactly the framing
 * every street, room and shot was tuned for (a house's whole wall, the rook
 * orb's headroom). A scene shorter than the window's view holds the view to
 * its own height as the smallest-layer rule did, but never under that floor
 * (the camera already frames short rooms against it and runs the ground
 * skirt below them). `viewh` (QA) pins the window's share.
 */

export const MIN_VP_H = 400;
export const MAX_VP_H = 600;
export const MIN_PACK_HEIGHT = 132;
/** The remake's view width in view pixels (the canvas scales it to the page). */
export const LOCATION_VIEW_W = 960;
/** The remake's smallest view: its old fixed 408 px, inside the source's 400-600. */
export const VIEW_FLOOR_H = 408;
/** Before the page can be measured (boot, tests): the smallest view. */
export const DEFAULT_VP_H = VIEW_FLOOR_H;

/**
 * Remake-built streets whose art was drawn for one view height. Symphonious
 * Maximus sizes its parallax peaks for the 408 px view (js/symphonious-maximus.js
 * 377-410, layerHeightFor); taller views show the peaks' cut-off feet over the
 * floor while you climb, so the street holds the view at 408.
 */
export const HELD_VIEW_H = Object.freeze({ GUVR3SGQ6EF3400: 408 });

const finite = (value, fallback = NaN) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * The location view height (view pixels) for the room the window leaves.
 * availableHeight: CSS px from the top of the game area to the window's
 * bottom, less the page's own margin under it. displayWidth: the canvas's CSS
 * width. sceneHeight: the current street or room's own height (optional).
 * forced: a QA height for the window's share (optional).
 */
export function locationViewHeightFor({
  availableHeight,
  displayWidth,
  viewWidth = LOCATION_VIEW_W,
  packReserve = MIN_PACK_HEIGHT,
  sceneHeight,
  forced,
} = {}) {
  let view;
  const pinned = finite(forced);
  if (pinned > 0) {
    view = pinned;
  } else {
    const avail = finite(availableHeight);
    const width = finite(displayWidth);
    const vw = finite(viewWidth, LOCATION_VIEW_W);
    view = avail > 0 && width > 0 && vw > 0
      ? avail * (vw / width) - finite(packReserve, MIN_PACK_HEIGHT)
      : DEFAULT_VP_H;
  }
  view = Math.min(MAX_VP_H, Math.max(VIEW_FLOOR_H, Math.floor(view)));
  const scene = finite(sceneHeight);
  if (scene > 0) view = Math.min(view, Math.max(VIEW_FLOOR_H, Math.floor(scene)));
  return view;
}

/** The whole canvas height for a location view: the view plus the pack allowance. */
export function canvasHeightFor(locationViewHeight, packReserve = MIN_PACK_HEIGHT) {
  return finite(locationViewHeight, DEFAULT_VP_H) + finite(packReserve, MIN_PACK_HEIGHT);
}

/**
 * The scene height that holds the view (TSMainView: the smallest of the
 * location's height and its layers' heights). Imported streets carry both;
 * authored rooms only their own world height.
 */
export function sceneViewCap(layer) {
  if (!layer) return NaN;
  let h = finite(layer.sourceWorldH, finite(layer.worldH));
  const street = layer.street;
  const held = finite(HELD_VIEW_H[street?.tsid]);
  if (held > 0) h = Number.isFinite(h) ? Math.min(h, held) : held;
  if (street && Array.isArray(street.layers)) {
    for (const l of street.layers) {
      const lh = finite(l?.h);
      if (lh > 0) h = Number.isFinite(h) ? Math.min(h, lh) : lh;
    }
  }
  return h > 0 ? h : NaN;
}
