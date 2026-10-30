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
 * Since g458 the stage fits the window in both axes (stageFor, below): the
 * world is drawn near 1:1 and a bigger window shows more of it, as the
 * original did up to 1000 x 600. The pack overlays the bottom MIN_PACK_HEIGHT
 * of the canvas (the camera never frames the avatar there), so the canvas is
 * the location view plus that allowance. locationViewHeightFor is the older
 * rule for a 960 px view scaled to the page width; `viewh` (QA, the
 * restoration and landing shots) still lays the stage out that way.
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
/** The remake's old fixed view width, now the narrowest view (stageFor). */
export const LOCATION_VIEW_W = 960;
/** The widest view before the stage magnifies instead (stageFor). */
export const VIEW_MAX_W = 1680;
/**
 * The tallest view before the stage magnifies instead: 1.2x the source's
 * max_vp_h, so 1440 x 900 still draws 1:1. Streets are 1000 px or taller
 * (all but 38 of 1,463 imported), and a shorter scene holds the view.
 */
export const VIEW_CEIL_H = 720;
/**
 * Where a narrow, tall window (where the 960 px width floor wins) stops
 * growing the view and leaves a band above the canvas instead: streets are
 * 1000 px tall or more (all but 38 of 1,463 imported).
 */
export const VIEW_HOLD_H = 1000;
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

/** A street layer or room narrower than the view: its width (and its layers'), like sceneViewCap. */
export function sceneViewWidthCap(layer, worldWidth) {
  if (!layer) return finite(worldWidth);
  let w = finite(layer.worldW, finite(worldWidth));
  const street = layer.street;
  if (street && Array.isArray(street.layers)) {
    for (const l of street.layers) {
      const lw = finite(l?.w);
      if (lw > 0) w = Number.isFinite(w) ? Math.min(w, lw) : lw;
    }
  }
  return w > 0 ? w : NaN;
}

/**
 * The stage for a window (g458, Austin's UI audit): how many CSS px one world
 * px takes (scale) and the view that buys, in world px.
 *
 * - 1:1 by default, so a bigger window shows more world (the original showed
 *   up to 1000 x 600 at 1:1; 1280 x 800 now shows about 1280 x 600).
 * - Past VIEW_MAX_W x VIEW_CEIL_H the stage magnifies instead, so a large
 *   monitor does not draw the art tiny (2x/3x art keeps it sharp).
 * - Under LOCATION_VIEW_W x VIEW_FLOOR_H it shrinks, so the smallest view
 *   every room was tuned for always fits.
 * - A scene narrower or shorter than that view magnifies until it fills it
 *   (homes, short rooms), never past the floors.
 * - The canvas fills the room exactly, so the page never scrolls; only a view
 *   held at VIEW_HOLD_H (a portrait phone, where the width floor wins) leaves
 *   a band above.
 *
 * width/height: the CSS room for the canvas (the game area under the top bar).
 * pinnedHeight: `viewh` (QA): the old layout, a LOCATION_VIEW_W view scaled to
 * the page width with that location height (the canvas may then outgrow the
 * window, as before).
 */
export function stageFor({
  width,
  height,
  packReserve = MIN_PACK_HEIGHT,
  sceneWidth,
  sceneHeight,
  pinnedHeight,
} = {}) {
  const W = finite(width);
  const H = finite(height);
  const pack = finite(packReserve, MIN_PACK_HEIGHT);
  const pinned = finite(pinnedHeight);
  if (pinned > 0 || !(W > 0) || !(H > 0)) {
    const viewW = LOCATION_VIEW_W;
    const viewH = locationViewHeightFor({ forced: pinned > 0 ? pinned : NaN, sceneHeight });
    const scale = W > 0 ? W / viewW : 1;
    return { scale, viewW, viewH, canvasH: viewH + pack, cssWidth: viewW * scale, cssHeight: (viewH + pack) * scale, pinned: pinned > 0 };
  }
  const floorH = VIEW_FLOOR_H + pack;
  let scale = W < LOCATION_VIEW_W || H < floorH
    ? Math.min(W / LOCATION_VIEW_W, H / floorH)
    : Math.max(1, W / VIEW_MAX_W, H / (VIEW_CEIL_H + pack));
  const sw = finite(sceneWidth) > 0 ? Math.max(LOCATION_VIEW_W, finite(sceneWidth)) : Infinity;
  const sh = finite(sceneHeight) > 0 ? Math.max(VIEW_FLOOR_H, finite(sceneHeight)) : Infinity;
  scale = Math.max(scale, W / sw, H / (sh + pack));
  scale = Math.min(scale, W / LOCATION_VIEW_W, H / floorH);
  const viewW = Math.round(W / scale);
  const room = Math.floor(H / scale + 1e-6) - pack;
  // A scene a few px shorter than the floors leave shows its ground skirt (the camera frames it);
  // only a portrait window, where the width floor wins, is held (VIEW_HOLD_H).
  const viewH = Math.max(VIEW_FLOOR_H, Math.min(room, VIEW_HOLD_H));
  const held = viewH < room;
  return {
    scale,
    viewW,
    viewH,
    canvasH: viewH + pack,
    cssWidth: W,
    cssHeight: held ? (viewH + pack) * scale : H,
    pinned: false,
  };
}
