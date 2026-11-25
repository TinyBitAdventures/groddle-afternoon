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

import { STREET_GROUND_LINES } from './street-ground-lines.js?v=ded4ee4e';

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
/**
 * ZOOM (2026-10-30): the world zoom's close end, "Original": the 2012 client's
 * largest view, LayoutModel.as 12-13 max_vp_w 1000 x max_vp_h 600, magnified to
 * fill the window as the old remake's 960 px view did. The floors still hold
 * (never under 960 x 408), so on a very wide window Original shows a little more.
 */
export const ORIGINAL_VIEW_W = 1000;
export const ORIGINAL_VIEW_H = 600;
/**
 * TOUCH PORTRAIT (Austin 2026-11-12, an iPhone held upright): the narrowest view an upright phone
 * shows (phoneStage). Under it a short scene (a room, a home) keeps a band above the canvas
 * instead of magnifying to a keyhole.
 */
export const PHONE_PORTRAIT_MIN_VIEW_W = 560;
/**
 * SKY FILL (Austin's iPhone 2026-11-24, the Home Screen app upright, in his back yard: "Go ahead and
 * fill the top part for my screen"): the narrowest view an upright phone shows in the house and on a
 * Tower floor (a scene's `phoneMinViewW`, js/features/homes-feature.js interiorBackground). They are
 * short (the house and its yard 738 px, a Tower floor 691) and the camera follows the avatar along
 * them, so they magnify a little more than other short scenes: at 402 x 874 in the Home Screen app
 * both reach up to the strip (the yard 444 px wide, a Tower floor 420), with no band left over them.
 */
export const PHONE_HOME_MIN_VIEW_W = 420;
/** The remake's smallest view: its old fixed 408 px, inside the source's 400-600. */
export const VIEW_FLOOR_H = 408;
/**
 * PHONE ZOOM RANGE (Austin 2026-11-13 on his iPhone: "the max zoom in is really blurry. Maybe we
 * reset the range so that max zoomed in on the phone scaled to like 56% zoomed in"): the share of
 * the way from the phone's own view to a VIEW_FLOOR_H view filling the screen that the closest
 * phone zoom (closeup 1) goes, geometrically. 1 was the old closest; at 0.56 the old 0.56 is the new
 * closest. Tune here: the slider and the pinch span whatever this leaves.
 */
export const PHONE_CLOSEST_SHARE = 0.56;
/**
 * LANDSCAPE PHONE ZOOM (Austin 2026-11-13: phones play both ways up; "the landscape zoom starts at
 * portrait's 56% closest share, tunable"): the same share for a sideways phone (landscapePhoneStage),
 * its own name so it can differ from portrait's. 0.56 brings a 874 x 402 iPhone from its whole view
 * (1174 x 408 world px, the avatar 86 CSS px) to about 1.55 times as close (the avatar 133 px).
 */
export const LANDSCAPE_PHONE_CLOSEST_SHARE = 0.56;
/** Before the page can be measured (boot, tests): the smallest view. */
export const DEFAULT_VP_H = VIEW_FLOOR_H;

/**
 * Remake-built streets whose art was drawn for one view height (none now:
 * Symphonious Maximus held 408 for its parallax peaks until it was laid out
 * from its full-street template with peaks that move with the street).
 */
export const HELD_VIEW_H = Object.freeze({});

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
 * PURE (#149): whether the zoom changes this stage at all: false when Wide (0) and Original (1)
 * come out at the same scale, as on a street whose narrowest layer is no wider than the Original
 * view (sceneViewWidthCap; the original capped its viewport the same way, TSMainView.as 514).
 * Takes stageFor's arguments without `zoom`.
 */
export function zoomMovesStage(args = {}) {
  if (finite(args.pinnedHeight) > 0) return false;
  const wide = stageFor({ ...args, zoom: 0 }).scale;
  const close = stageFor({ ...args, zoom: 1 }).scale;
  return Math.abs(close - wide) > Math.max(close, wide) * 0.005;
}

/**
 * PURE (PHONE ZOOM): how much closer the closest phone zoom draws than the phone's own view, for
 * stageFor's arguments (1 when it cannot magnify: a pinned page, a room already at the closest).
 * Upright (phoneStage) and sideways (landscapePhoneStage) alike.
 */
export function phoneZoomSpan(args = {}) {
  if (!args.phone || finite(args.pinnedHeight) > 0) return 1;
  const near = stageFor({ ...args, closeup: 1 });
  const far = stageFor({ ...args, closeup: 0 });
  if (!near.phone || !far.phone || !(far.scale > 0)) return 1;
  return near.scale / far.scale;
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
 *   (homes, short rooms, a street whose narrowest layer is narrower than the
 *   window's view, #580), never past the floors. `sceneBorders` keeps the
 *   scale instead and shows plain borders at the sides (computerStage, #337);
 *   the game no longer asks for it (#580). Phones keep the magnifying rule.
 * - The canvas fills the room exactly, so the page never scrolls; only a view
 *   held at VIEW_HOLD_H (a portrait phone, where the width floor wins) leaves
 *   a band above.
 *
 * - ZOOM: `zoom` (0 to 1, js/world-zoom.js, a device preference) moves the scale
 *   from that rule (0, "Wide", the default) to the same rule with the view
 *   capped at ORIGINAL_VIEW_W x ORIGINAL_VIEW_H (1, "Original"), geometrically,
 *   so each step magnifies by the same share at any window size. Both ends keep
 *   the floors and the scene rule, so every value between does too.
 *
 * - HOUSE FIT (G796 follow-up, Austin 2026-11-22): `fitViewH` (world px, a home street's
 *   house: js/home-house.js houseFitViewH) is the least view the scene asks for. A computer's
 *   stage (and a sideways phone's, built on it) zooms out until the view holds it, at every zoom
 *   level, never past the scene's own height or width (the scene rule above still fills the
 *   window). Glitch zoomed its viewport out for the house the same way, scale = loc_vp_h /
 *   h_needed, though only while the house was being changed (ChassisManager.as scaleVP 189-247).
 *   An upright phone already shows the scene's whole height and keeps its own rule.
 *
 * - GROUND LINE (G1146, report #617): `groundLine` (world px from the scene's top, sceneGroundLine)
 *   is how far down the street's ground art covers its whole width. An upright phone fits the scene
 *   down to there instead of the scene's bottom (phoneStage); the camera keeps every phone above it
 *   (phoneGroundWorldHeight). Computers ignore it.
 *
 * - SCENE BOTTOM (G1157): `groundFit` ({ bottom, floorY, coverCss, clearance }, game.js stageArgs;
 *   computers only, not a home street's house fit) is where the computer's camera stops the canvas
 *   (sceneBottomLine: the scene's bottom, or its ground line where that is higher) and the feet's
 *   room over the pack row. A scene shorter than the canvas magnifies until the canvas ends there
 *   (groundFitScale), as Glitch held its viewport to the location's height (TSMainView.as 1257) and
 *   never showed below its bottom; the floors still hold.
 *
 * width/height: the CSS room for the canvas (the game area under the top bar).
 * pinnedHeight: `viewh` (QA): the old layout, a LOCATION_VIEW_W view scaled to
 * the page width with that location height (the canvas may then outgrow the
 * window, as before); zoom does not apply to it.
 */
export function stageFor({
  width,
  height,
  packReserve = MIN_PACK_HEIGHT,
  sceneWidth,
  sceneHeight,
  pinnedHeight,
  zoom = 0,
  phone = false,
  closeup = 0,
  sceneBorders = false,
  fitViewH,
  groundLine,
  groundFit,
  topBand,
  minViewW,
  sceneDrop,
  streetBand = false,
  fullHeight,
} = {}) {
  const W = finite(width);
  const H = finite(height);
  const pack = finite(packReserve, MIN_PACK_HEIGHT);
  const pinned = finite(pinnedHeight);
  // STREET BAND (#654): the phone's own stage for the whole room (`fullHeight`), cut to the band.
  if (streetBand && phone && !(pinned > 0) && W > 0 && H > 0) {
    const full = stageFor({ width: W, height: Math.max(H, finite(fullHeight, H)), packReserve: pack, sceneWidth, sceneHeight, zoom, phone, closeup, fitViewH, groundLine, topBand, minViewW });
    return streetBandStage(full, { width: W, height: H, packReserve: pack, sceneDrop });
  }
  if (phone && !(pinned > 0) && W > 0 && H > W) return phoneStage({ width: W, height: H, packReserve: pack, sceneWidth, sceneHeight, closeup, groundLine, topBand, minViewW, sceneDrop });
  if (phone && !(pinned > 0) && W > 0 && H > 0) return landscapePhoneStage({ width: W, height: H, packReserve: pack, sceneWidth, sceneHeight, zoom, closeup, fitViewH });
  return computerStage({ width: W, height: H, packReserve: pack, sceneWidth, sceneHeight, pinnedHeight: pinned, zoom, borders: sceneBorders, fitViewH, groundFit });
}

/**
 * PURE: stageFor's rule for a computer's window (and the pinned QA page), without the phone stages.
 *
 * NARROW STREETS (#337, G759): with `borders` (a street's own layers: game.js stageArgs), a street
 * narrower than the view (sceneViewWidthCap: its narrowest layer) is not magnified to fill the
 * window. It draws at the scale any other street gets here, the view is capped at the street's
 * width (never under LOCATION_VIEW_W) and the canvas is that much narrower (cssWidth < width,
 * `bordered`), centred, with a plain border at each side (style.css NARROW STREETS). Semsan Simile
 * (its far layer 960 wide) drew 1.76 times bigger than its neighbours in a 1687 px window.
 * Report #580 (Sarda Rapt: its sky 1050 px wide on a 1500 px street) read the borders as black bars
 * on a street you can pan, and Glitch's view never grew past the narrowest layer (TSMainView.as 514,
 * max_vp_w = Math.min(max_vp_w, layer.w)): the game asks for no borders now (game.js stageArgs), so
 * such a street magnifies just enough to fill the window; every other street keeps the zoom's scale.
 */
function computerStage({ width: W, height: H, packReserve: pack, sceneWidth, sceneHeight, pinnedHeight: pinned, zoom, borders = false, fitViewH, fitMinShare = 0, groundFit }) {
  if (pinned > 0 || !(W > 0) || !(H > 0)) {
    const viewW = LOCATION_VIEW_W;
    const viewH = locationViewHeightFor({ forced: pinned > 0 ? pinned : NaN, sceneHeight });
    const scale = W > 0 ? W / viewW : 1;
    return { scale, viewW, viewH, canvasH: viewH + pack, cssWidth: viewW * scale, cssHeight: (viewH + pack) * scale, pinned: pinned > 0 };
  }
  const floorH = VIEW_FLOOR_H + pack;
  const sw = finite(sceneWidth) > 0 ? Math.max(LOCATION_VIEW_W, finite(sceneWidth)) : Infinity;
  const sh = finite(sceneHeight) > 0 ? Math.max(VIEW_FLOOR_H, finite(sceneHeight)) : Infinity;
  const border = Boolean(borders) && Number.isFinite(sw);
  // SCENE BOTTOM (G1157): close enough that the canvas ends at the scene's bottom line.
  const bottomScale = groundFit ? groundFitScale({ height: H, ...groundFit }) : 0;
  const ruleScale = (capW, capH) => {
    let s = W < LOCATION_VIEW_W || H < floorH
      ? Math.min(W / LOCATION_VIEW_W, H / floorH)
      : Math.max(1, W / capW, H / (capH + pack));
    s = Math.max(s, border ? 0 : W / sw, H / (sh + pack), bottomScale);
    return Math.min(s, W / LOCATION_VIEW_W, H / floorH);
  };
  const z = Math.min(1, Math.max(0, finite(zoom, 0)));
  let scale = ruleScale(VIEW_MAX_W, VIEW_CEIL_H);
  if (z > 0) scale *= (ruleScale(ORIGINAL_VIEW_W, ORIGINAL_VIEW_H) / scale) ** z;
  // HOUSE FIT: out until the view holds `fitViewH`, never past the scene's own height or width.
  const fit = Math.min(finite(fitViewH), sh, VIEW_HOLD_H);
  // fitMinShare (a sideways phone): the fit may zoom out to that share of the usual scale and no
  // further, so the player stays a size you can see (Austin 2026-11-22: cap it); a tall house's top
  // may then run off a short screen.
  if (fit > 0) scale = Math.max(Math.min(scale, Math.max(H / (fit + pack), border ? 0 : W / sw)), scale * Math.min(1, Math.max(0, finite(fitMinShare, 0))));
  const fullW = Math.round(W / scale);
  const bordered = border && fullW > Math.round(sw);
  const viewW = bordered ? Math.round(sw) : fullW;
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
    cssWidth: bordered ? viewW * scale : W,
    cssHeight: held ? (viewH + pack) * scale : H,
    pinned: false,
    ...(bordered ? { bordered: true } : {}),
  };
}

/** G880: the band's colour over a scene with no dark colour of its own (the narrow street's border, style.css --c-grey-29). */
export const SHORT_SCENE_BAND = '#2a2a2a';
/** G880: the most a scene's own top colour may light (relative luminance, 0 to 1) and still fill the band. */
export const SHORT_SCENE_BAND_MAX_LUMA = 0.05;

/**
 * PURE (G880, Austin 2026-11-16): the colour of the band an upright phone leaves above a scene
 * shorter than the screen. Dark everywhere: a scene whose own top colour is dark keeps it (a Tower
 * floor's timber wall, the Back Alley's forest, G863), every other one (a street's light sky, #348,
 * the ground floor's yard, a sunny quest room) gets SHORT_SCENE_BAND. `skyTop` is a #rrggbb.
 */
export function shortSceneBand(skyTop) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(skyTop || ''));
  if (!m) return SHORT_SCENE_BAND;
  const lin = (h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luma = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  return luma <= SHORT_SCENE_BAND_MAX_LUMA ? String(skyTop).toLowerCase() : SHORT_SCENE_BAND;
}

/** SKY FILL: how far (CSS px) the band's colour fades down over the canvas's top edge on an upright phone. */
export const STAGE_SKY_FADE = 28;

/**
 * PURE (SKY FILL, Austin's iPhone 2026-11-24, the Home Screen app upright, his back yard: "Go ahead
 * and fill the top part for my screen"): the colour of the band over a scene shorter than the screen.
 * On an upright phone (`phone`) it is the scene's own sky carried on up, its colour at the canvas's
 * top edge (a street's gradient where the camera has it, js/street-render.js viewSkyTop; a yard's or
 * a room's top colour), so the band reads as more sky, the way Glitch's gradient carried its end
 * colour on past the layer (SpreadMethod.PAD, G1167). A scene with no colour of its own keeps
 * SHORT_SCENE_BAND. Elsewhere (a computer's narrow window) G880's dark band stands (shortSceneBand).
 * `skyTop` is a #rrggbb or 0xrrggbb number. Where game.js can read the canvas's top edge back
 * (WebGL) the band takes what is drawn there (stageEdgeColour); this is the colour until then, and
 * the canvas's clear colour.
 */
export function stageBandColour(skyTop, { phone = false } = {}) {
  const css = typeof skyTop === 'number' && Number.isFinite(skyTop) ? `#${(skyTop >>> 0).toString(16).padStart(6, '0').slice(-6)}` : String(skyTop || '');
  if (!phone) return shortSceneBand(css);
  return /^#[0-9a-f]{6}$/i.test(css) ? css.toLowerCase() : SHORT_SCENE_BAND;
}

/**
 * PURE (SKY FILL): the colour most of a canvas row shows, as #rrggbb, or null for an empty row.
 * `row` is RGBA bytes `width` px wide (a WebGL read-back of the canvas's top edge, game.js
 * sampleStageSkyEdge). `samples` columns spread over the row are grouped by colour (16 levels a
 * channel) and the biggest group's average wins, so a tree's crown or a sign cut by the scene's top
 * does not tint the band: a scene whose far layer is opaque art (a Towers hall, a cave) carries that
 * art's colour on up, where its sky gradient never shows.
 */
export function stageEdgeColour(row, width, samples = 32) {
  const w = Math.floor(finite(width, 0));
  if (!row || !(w > 0) || row.length < w * 4) return null;
  const n = Math.max(1, Math.min(w, Math.floor(finite(samples, 32))));
  const groups = new Map();
  let best = null;
  for (let i = 0; i < n; i += 1) {
    const x = Math.min(w - 1, Math.floor(((i + 0.5) * w) / n));
    const o = x * 4;
    const [r, g, b] = [row[o], row[o + 1], row[o + 2]];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const at = groups.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    at.n += 1;
    at.r += r;
    at.g += g;
    at.b += b;
    groups.set(key, at);
    if (!best || at.n > best.n) best = at;
  }
  const hex = (v) => Math.round(v / best.n).toString(16).padStart(2, '0');
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}

/** SKY FILL: how far (world px) the camera's top edge moves, up or down or by a zoom, before the band's colour is read again. */
export const STAGE_EDGE_MOVE = 24;
/** SKY FILL: the fewest milliseconds between two read-backs of the canvas's top edge. */
export const STAGE_EDGE_GAP_MS = 1000;
/** SKY FILL: after a scene arrives, one more read once its art has had time to load. */
export const STAGE_EDGE_SETTLE_MS = 1500;

/**
 * SKY FILL (coordinator 2026-11-24: a read-back is a GPU sync that can hitch a phone's frame, so read
 * only when something changed): when game.js may read the canvas's top edge back. A read is due on a
 * scene's first drawn frame, once more STAGE_EDGE_SETTLE_MS after it (art still loading), after a
 * resize, and when the camera's top edge has moved STAGE_EDGE_MOVE world px up or down (a zoom moves
 * it too) or half a view sideways since the last read; never twice within STAGE_EDGE_GAP_MS, and
 * never while nothing has moved. Each read is kept per scene and camera band, so coming back to a
 * band reuses its colour without reading. Pure apart from its own state; `now` is passed in.
 *
 *   const s = stageEdgeSampler();
 *   s.arrive(scene)                                     a new scene, or a resize (s.arrive(scene, true))
 *   s.next({ scene, camX, camY, scale, viewW, now })    { read: true } | { colour } (cached) | null
 *   s.record(colour)                                    the colour read for the band next() asked about
 */
export function stageEdgeSampler({ move = STAGE_EDGE_MOVE, gapMs = STAGE_EDGE_GAP_MS, settleMs = STAGE_EDGE_SETTLE_MS } = {}) {
  const cache = new WeakMap();
  let scene = null;
  let last = null;
  let lastAt = -Infinity;
  let arrivedAt = NaN;
  let pending = false;
  let arrival = false;
  let settle = false;
  let asked = null;
  const bandKey = ({ camX, camY, scale, viewW }) => `${Math.round(camY / move)}|${Math.round(camX / Math.max(1, viewW / 2))}|${Math.round(viewW)}|${Number(scale).toFixed(3)}`;
  const store = (key, colour) => {
    if (!scene || typeof scene !== 'object') return;
    let map = cache.get(scene);
    if (!map) cache.set(scene, (map = new Map()));
    map.set(key, colour);
  };
  return {
    arrive(next, resized = false) {
      const same = next === scene;
      if (!resized || !same) arrivedAt = NaN;
      // A resize keeps a settle read still to come; a new scene starts its own.
      settle = !resized || !same || settle;
      arrival = !resized || !same;
      scene = next;
      pending = true;
    },
    next({ scene: at, camX = 0, camY = 0, scale = 1, viewW = 1, now = 0 } = {}) {
      if (!at || at !== scene) return null;
      if (!Number.isFinite(arrivedAt) && settle) arrivedAt = now;
      const settleDue = settle && now - arrivedAt >= settleMs;
      const view = { camX, camY, scale, viewW };
      // A zoom changes the view's width (and moves its top edge); up or down past `move`, or half a view sideways.
      const moved = last && (Math.abs(camY - last.camY) > move || Math.abs(camX - last.camX) > viewW / 2 || Math.abs(viewW - last.viewW) > move);
      if (!pending && !moved && !settleDue) return null;
      const key = bandKey(view);
      const cached = !pending && !settleDue ? cache.get(scene)?.get(key) : undefined;
      if (cached !== undefined) {
        last = view;
        return { colour: cached };
      }
      // A scene's arrival read waits for no gap; the rest (a resize too) keep STAGE_EDGE_GAP_MS apart.
      if (!(pending && arrival) && now - lastAt < gapMs) return null;
      asked = { key, view, settleDue };
      return { read: true };
    },
    record(colour, now = 0) {
      if (!asked) return;
      store(asked.key, colour);
      last = asked.view;
      lastAt = now;
      pending = false;
      arrival = false;
      if (asked.settleDue) settle = false;
      asked = null;
    },
    /** QA: what the sampler holds. */
    get state() { return { pending, arrival, settle, last, lastAt }; },
  };
}

/**
 * PURE (TOUCH PORTRAIT): the stage of an upright phone (the phone gate's phone, a window taller
 * than wide). The width floor that keeps a computer's view 960 px wide drew a portrait iPhone's
 * street as a 0.41x strip under a 400 px band of sky (Austin 2026-11-12). Here the scene's height
 * fits the screen's instead: the view is the scene's own height (VIEW_FLOOR_H to VIEW_HOLD_H, the
 * whole of nearly every street), the canvas fills the window and the view is as wide as that
 * leaves (675 px on a 393 x 659 iPhone, against 1156 x 408 sideways). A scene so short the view
 * would be narrower than PHONE_PORTRAIT_MIN_VIEW_W holds that width and keeps a band above, as a
 * tall window always did; a scene narrower than the view magnifies to fill it. Zoom does not
 * apply (the Wide and Original ends come out the same).
 *
 * PHONE ZOOM: `closeup` (0 to 1, js/world-zoom.js phoneZoom, a pinch) magnifies from that view
 * (0) toward the closest the floors allow (a VIEW_FLOOR_H view filling the screen's height),
 * geometrically like the world zoom, and 1 stops PHONE_CLOSEST_SHARE of the way there (closer drew
 * the art soft: the phone draws 1 backing px per world px, js/render-density.js); the camera then
 * scrolls the street up and down as a computer's does. Fewer world px are drawn, never bigger
 * textures.
 *
 * GROUND LINE (G1146, report #617): with `groundLine`, the scene's height counts only down to it.
 * The canvas runs the pack reserve (132 world px) past the view, which the phone's short pack row
 * leaves mostly open, so fitting the scene's bottom showed 130 px or more of the bare fill under
 * the street's ground (Briarset Croft); fitting the line magnifies about 1.1 times there.
 *
 * TOP BAND (#653 follow-up, Austin's iPhone 2026-11-24, the Home Screen app upright: "I think we cut
 * off too much space up top"): `topBand` (CSS px) is the dark strip over the screen's top (style.css
 * --stage-top: the status bar plus the fog's clearance, set only in the iOS Home Screen app). The
 * app's screen is taller than a Safari tab's, so the width floor held nearly every street and left a
 * band down to about 130 px on a 402 x 874 iPhone, the pills over the dark and no street above them.
 * With a strip, the width floor eases by the strip's share of the screen (560 x (H - band) / H, about
 * 505 px there) so a held scene magnifies until its canvas reaches up to the strip's bottom edge: the
 * street runs up under the pills. A scene too short for that (a room, a home) still keeps a band, a
 * shorter one. 0 (a Safari tab, Android, sideways, computers): nothing changes.
 *
 * SKY FILL (Austin's iPhone 2026-11-24): `minViewW` lowers the width floor for a home place (the
 * house and its yard, a Tower floor: PHONE_HOME_MIN_VIEW_W), so they reach up to the strip; it never
 * raises it. What band is left over a short scene shows the scene carried on up (stageBandColour).
 */
export function phoneStage({ width, height, packReserve = MIN_PACK_HEIGHT, sceneWidth, sceneHeight, closeup = 0, groundLine, topBand = 0, minViewW, sceneDrop = 0 } = {}) {
  const W = finite(width);
  const H = finite(height);
  const pack = finite(packReserve, MIN_PACK_HEIGHT);
  // SKY FILL: a home place's own floor (PHONE_HOME_MIN_VIEW_W), never wider than the usual one.
  const minW = Math.min(PHONE_PORTRAIT_MIN_VIEW_W, finite(minViewW) > 0 ? finite(minViewW) : PHONE_PORTRAIT_MIN_VIEW_W);
  const sh = finite(sceneHeight);
  let fitH = Math.min(VIEW_HOLD_H, Math.max(VIEW_FLOOR_H, sh > 0 ? Math.floor(sh) : VIEW_HOLD_H));
  // GROUND LINE (G1146): the canvas (the view and the pack reserve under it) ends at the street's
  // ground line, not past its bottom, so the scene magnifies a little to fill the screen.
  const line = finite(groundLine);
  if (line > 0) fitH = Math.min(fitH, Math.max(VIEW_FLOOR_H, Math.floor(line) - pack));
  const band = Math.min(H / 2, Math.max(0, finite(topBand, 0)));
  // SKY FILL: under a strip the home floor works only through the strip's rule below, so a home place
  // stops at the strip's bottom edge and is not magnified on past it, behind the strip.
  let scale = Math.min(H / (fitH + pack), W / (band > 0 ? PHONE_PORTRAIT_MIN_VIEW_W : minW));
  // TOP BAND (#653 follow-up): under a strip the held canvas reaches up to it, the width floor eased by the strip's share.
  if (band > 0) scale = Math.max(scale, Math.min((H - band) / (fitH + pack), W / (minW * (H - band) / H)));
  const sw = finite(sceneWidth);
  if (sw > 0) scale = Math.max(scale, W / sw);
  const top = H / (VIEW_FLOOR_H + pack);
  scale = Math.min(scale, top);
  const c = Math.min(1, Math.max(0, finite(closeup, 0)));
  if (c > 0 && top > scale) scale *= (top / scale) ** (c * PHONE_CLOSEST_SHARE);
  const viewW = Math.round(W / scale);
  const room = Math.floor(H / scale + 1e-6) - pack;
  // #681: a short scene's canvas grows up by the camera's drop (phoneSceneDrop), at the same scale.
  const drop = Math.max(0, Math.ceil(finite(sceneDrop, 0)));
  const viewH = Math.max(VIEW_FLOOR_H, Math.min(room, fitH + drop));
  const held = viewH < room;
  return { scale, viewW, viewH, canvasH: viewH + pack, cssWidth: W, cssHeight: held ? (viewH + pack) * scale : H, pinned: false, phone: true };
}

/**
 * PURE (#681, Austin's ruling 2026-11-25): how far (world px) an upright phone's held canvas grows up
 * over a short scene. There the camera drops below the scene's bottom so the feet on its deepest floor
 * stay over the stick, Act and Jump (game.js activeCameraWorldHeight: phoneFeetWorldHeight), and the
 * canvas, capped at the scene's height, then started part way down the scene: the top of the Greedy
 * Street Spirit's room sat under the band. Grown by that drop, the canvas shows the scene whole from
 * its top and the band fills only above it. `stage` is phoneStage's (not sideways, not pinned, held
 * under the window's `height`), `sceneBottom` the scene's bottom or ground line (sceneBottomLine), and
 * `cameraWorldH` the camera's world height for that stage. A scene taller than the canvas (a tall or
 * held street the camera scrolls) never grows: 0.
 */
export function phoneSceneDrop({ stage, height, sceneBottom, cameraWorldH } = {}) {
  if (!stage?.phone || stage.landscape || stage.pinned) return 0;
  const H = finite(height);
  if (!(H > 0) || !(stage.cssHeight < H - 0.5)) return 0;
  const bottom = finite(sceneBottom);
  if (!(bottom > 0) || bottom > finite(stage.canvasH) + 1) return 0;
  const drop = finite(cameraWorldH) - finite(stage.viewH);
  return drop > 0.5 ? Math.ceil(drop) : 0;
}

/**
 * PURE (G1178, report #625): the canvas's room beside a window docked on a phone, in CSS px. Glitch
 * docked the house's Customize window and fitted the viewport into what it left (ChassisManager.as
 * scaleVP 189-247: avail_w = loc_vp_w - WIDTH_OF_CONFIG_UI). `dock` is { side: 'bottom' | 'left',
 * css } (the window's height upright, its width sideways), or null for the whole room. The stage is
 * worked out for the room left (stageFor), the canvas laid at `left` from the room's left edge and
 * on its top.
 * @returns {{ width: number, height: number, left: number }}
 */
export function stageRoomBeside(width, height, dock) {
  const W = finite(width, 0);
  const H = finite(height, 0);
  const css = Math.max(0, finite(dock?.css, 0));
  if (!(css > 0)) return { width: W, height: H, left: 0 };
  if (dock.side === 'bottom') return { width: W, height: Math.max(1, H - css), left: 0 };
  if (dock.side === 'left') return { width: Math.max(1, W - css), height: H, left: Math.min(css, W - 1) };
  return { width: W, height: H, left: 0 };
}

/**
 * PURE (#654, Austin's ruling 2026-11-25): the canvas's room inside an upright phone's street band.
 * The band ({ top, bottom } in the root's px, js/ui/phone-layout.js streetBandOf) runs from under the
 * top bar to over the stick, Act, Jump and the pack row, so neither bar stands over the street:
 * Glitch drew its location viewport under the header and over the pack (TSMainView.as resizeToStage
 * 1229-1257: loc_vp_h is the stage less the header and the pack). `room` is stageRoomBeside's; a
 * window docked at the bottom (a sheet, an open bag) ends the band at its top edge too. With no band
 * (sideways, computers, Classic) the room is as given, at the top. The stage is worked out for the
 * room (stageFor) and the canvas laid `top` px down the root.
 * @returns {{ width: number, height: number, left: number, top: number }}
 */
export function stageRoomInBand(room, band) {
  const r = { width: finite(room?.width, 0), height: finite(room?.height, 0), left: finite(room?.left, 0) };
  const t = finite(band?.top);
  const b = finite(band?.bottom);
  if (!(b > t)) return { ...r, top: 0 };
  const foot = Math.min(b, r.height);
  const top = Math.max(0, Math.min(t, foot - 1));
  return { ...r, top, height: Math.max(1, foot - top) };
}

/**
 * PURE (#654, Austin's ruling 2026-11-25): an upright phone's stage cut to its street band. `full` is
 * the stage the phone takes for its whole room (phoneStage, or landscapePhoneStage beside a docked
 * window), worked out as before; `height` is the band's (stageRoomInBand). The scale stays the whole
 * room's, so the avatar is as big as it was and a pinch reaches as close (Glitch's viewport kept its
 * scale and its camera scrolled a street taller than it, CameraMan.as): only the view gets shorter,
 * the camera scrolling the street up and down in it. The pack reserve's rows (132 world px) are
 * street the canvas shows, the pack row standing under the canvas now, not over its foot. A scene
 * shorter than the band is held in it, on its foot, as before (`sceneDrop`, #681).
 */
export function streetBandStage(full, { width, height, packReserve = MIN_PACK_HEIGHT, sceneDrop = 0 } = {}) {
  const W = finite(width);
  const H = finite(height);
  const pack = finite(packReserve, MIN_PACK_HEIGHT);
  const scale = finite(full?.scale);
  if (!(scale > 0) || !(W > 0) || !(H > 0)) return full;
  const room = Math.floor(H / scale + 1e-6) - pack;
  const drop = Math.max(0, Math.ceil(finite(sceneDrop, 0)));
  const viewH = Math.max(1, Math.min(room, finite(full.viewH, room) + drop));
  const held = viewH < room;
  return {
    scale,
    viewW: Math.round(W / scale),
    viewH,
    canvasH: viewH + pack,
    cssWidth: W,
    cssHeight: held ? (viewH + pack) * scale : H,
    pinned: false,
    phone: true,
    streetBand: true,
    ...(full.landscape ? { landscape: true } : {}),
  };
}

/**
 * The least share of a sideways phone's usual scale the house fit (G796) may zoom out to: 0.72x
 * on a 844x390 phone would fall to 0.38x for the Firebog House, the avatar about 45 CSS px tall;
 * capped it stays at about 0.5x (Austin 2026-11-22: cap it).
 */
export const LANDSCAPE_PHONE_FIT_MIN_SHARE = 0.7;

/**
 * PURE (LANDSCAPE PHONE, Austin 2026-11-13: phones play upright and sideways): the stage of a phone
 * held sideways (the phone gate's phone, a window at least as wide as tall). Level 0 is exactly the
 * computer rule it always took (a 408 px tall view filling the short side: 1174 x 408 world px on a
 * 874 x 402 iPhone), so the whole-street view is never narrower than before. That rule already sits
 * on the view's height floor, so the computer zoom (Wide to Original) draws the same there and
 * pinching did nothing (phoneZoomSpan 1).
 *
 * PHONE ZOOM: `closeup` (0 to 1, js/world-zoom.js phoneZoom, the pinch and the Menu's slider)
 * magnifies from that view toward the scale the same phone reaches upright with a VIEW_FLOOR_H view
 * filling its long side (phoneStage's closest end), geometrically, and 1 stops
 * LANDSCAPE_PHONE_CLOSEST_SHARE of the way there, so the avatar comes out about as big at the closest
 * level either way up. Closer than the floor rule, the view is shorter than VIEW_FLOOR_H (the room
 * the screen leaves over the pack reserve) and the camera scrolls the street up and down, as it
 * does upright. Fewer world px are drawn, never bigger textures.
 */
export function landscapePhoneStage({ width, height, packReserve = MIN_PACK_HEIGHT, sceneWidth, sceneHeight, zoom = 0, closeup = 0, fitViewH } = {}) {
  const W = finite(width);
  const H = finite(height);
  const pack = finite(packReserve, MIN_PACK_HEIGHT);
  const base = computerStage({ width: W, height: H, packReserve: pack, sceneWidth, sceneHeight, pinnedHeight: NaN, zoom, fitViewH, fitMinShare: LANDSCAPE_PHONE_FIT_MIN_SHARE });
  const c = Math.min(1, Math.max(0, finite(closeup, 0)));
  const top = Math.max(W, H) / (VIEW_FLOOR_H + pack);
  if (!(c > 0) || !(top > base.scale) || !(W > 0) || !(H > 0)) return { ...base, phone: true, landscape: true };
  const scale = base.scale * (top / base.scale) ** (c * LANDSCAPE_PHONE_CLOSEST_SHARE);
  const viewW = Math.round(W / scale);
  const viewH = Math.max(1, Math.min(base.viewH, Math.floor(H / scale + 1e-6) - pack));
  return { scale, viewW, viewH, canvasH: viewH + pack, cssWidth: W, cssHeight: H, pinned: false, phone: true, landscape: true };
}

/**
 * PURE (G673, "Zoomed in on a phone, your Glitch sits high in the view"): the camera anchor on a
 * phone. The desktop camera puts the feet at `anchor` (0.75, yCamOffsetAnchor) of the location view,
 * the canvas less the 132 world px pack reserve, which the computer's pack (about 104 CSS px at 1:1)
 * roughly covers: the original's loc_vp_h was the stage less the pack it showed (TSMainView.as
 * resizeToStage 1229-1257). A phone's pack row is shorter (packCoverCss, about 64 CSS px) and stays
 * that size while the zoom magnifies the reserve (120 CSS px at portrait's closest, 152 sideways),
 * so zoomed in the feet sat at 0.75 of a view that ended far above the real pack: 46% down a
 * sideways screen. Here the anchor is `anchor` of the room over the real pack instead (in view px:
 * viewH + packReserve - packCoverCss / scale), never higher than the desktop anchor, never so low
 * the feet come nearer the real pack than `clearance` (js/movement.js MIN_GROUND_CLEARANCE), and at
 * most 0.95 of the view. No measured pack (hidden, not laid out): the anchor as given.
 */
export function phoneCameraAnchor({ anchor = 0.75, viewH, packReserve = MIN_PACK_HEIGHT, packCoverCss, scale, clearance = 40, floorCoverCss } = {}) {
  const base = finite(anchor, 0.75);
  const view = finite(viewH);
  const cover = finite(packCoverCss);
  const s = finite(scale);
  if (!(view > 0) || !(s > 0)) return base;
  let out = base;
  if (cover >= 0) {
    const room = view + finite(packReserve, MIN_PACK_HEIGHT) - cover / s;
    const feet = Math.min(base * room, room - finite(clearance, 40));
    out = Math.min(0.95, Math.max(base, feet / view));
  }
  // G1229 (#654): never so low the feet come under the phone's controls (floorCoverCss, phoneFeetWorldHeight).
  const floorCover = finite(floorCoverCss);
  if (floorCover > 0) {
    const free = view + finite(packReserve, MIN_PACK_HEIGHT) - floorCover / s - finite(clearance, 40);
    if (free > 0) out = Math.min(out, free / view);
  }
  return out;
}

/**
 * PURE (G1229, report #654: an Android phone, Kala Close): the camera's world height on a phone, so
 * the feet on the deepest floor (`floorY`) can always stand `clearance` over the free street area's
 * floor: the canvas's bottom `floorCoverCss` CSS px are the touch controls and the pack row (upright
 * the stick, Act and Jump stand over the row; js/ui/phone-layout.js streetFloorOf). The street-bottom
 * clamp (phoneGroundWorldHeight, G1146) keeps only the pack row's room under the feet, so on a street
 * whose lowest floor sits close over its bottom the avatar stood under the stick, Act and the pack.
 * Where both cannot hold, the feet win: the camera goes as low as they need, past the street's bottom
 * (its ground fill shows there). Never higher than `worldHeight`.
 */
export function phoneFeetWorldHeight({ worldHeight, floorY, packReserve = MIN_PACK_HEIGHT, floorCoverCss, scale, clearance = 40 } = {}) {
  const world = finite(worldHeight);
  const floor = finite(floorY);
  const cover = finite(floorCoverCss);
  const s = finite(scale);
  if (!(world > 0) || !Number.isFinite(floor) || !(cover > 0) || !(s > 0)) return world;
  return Math.max(world, floor + finite(clearance, 40) + cover / s - finite(packReserve, MIN_PACK_HEIGHT));
}

/**
 * The least ground (world px) a phone's camera keeps under the feet, over the pack row or the
 * canvas's bottom, where the street's ground art ends sooner than MIN_GROUND_CLEARANCE under them.
 */
export const PHONE_GROUND_MIN_CLEARANCE = 12;

/**
 * PURE (G1146, report #617, Austin's pick 2026-11-22): the ground line of a street layer (world px
 * from its top; tools/ground-line/build.mjs, js/street-ground-lines.js), or NaN when the scene has
 * none (homes, a street whose art runs on well past its bottom). A room may name its own on its
 * scene (`groundLine`, G1148: Top of Tree).
 */
export function sceneGroundLine(layer, lines = STREET_GROUND_LINES) {
  const own = finite(layer?.groundLine);
  if (own > 0) return own;
  const line = finite(lines?.[layer?.street?.tsid]);
  return line > 0 ? line : NaN;
}

/**
 * PURE (G1157): where a computer's camera stops the canvas's bottom on a scene (world px from its
 * top): the scene's bottom (an imported street's own height, sourceWorldH, not the camera's padding
 * under its deepest floor; a room's worldH), or its ground line (sceneGroundLine) where that is
 * higher. NaN with no scene.
 */
export function sceneBottomLine(layer, lines = STREET_GROUND_LINES) {
  if (!layer) return NaN;
  const bottom = finite(layer.sourceWorldH, finite(layer.worldH));
  const line = sceneGroundLine(layer, lines);
  if (!(bottom > 0)) return line;
  return line > 0 ? Math.min(bottom, line) : bottom;
}

/**
 * PURE (G1157): the deepest floor the feet can reach (screen y): the deepest platform line, and the
 * fallback ground (`groundY`, game.js GROUND_Y: resolveGround's floor where no line is under the
 * feet) unless a standable line (pc_perm not 0 or 1) runs the scene's whole width (`worldW`) over
 * it. A room with no groundY of its own puts that ground 80 px over its bottom (game.js enterScene),
 * under An Autumn Day's real floor, where no one can stand.
 */
export function reachableFloorY(platforms, groundY, worldW) {
  const ground = finite(groundY, 0);
  const W = finite(worldW, Infinity);
  let deepest = 0;
  let covered = false;
  for (const p of Array.isArray(platforms) ? platforms : []) {
    const y = Math.max(finite(p?.y1, 0), finite(p?.y2, 0));
    deepest = Math.max(deepest, y);
    const standable = !(finite(p?.pc_perm) >= 0);
    if (standable && y <= ground && Math.min(p.x1, p.x2) <= 0 && Math.max(p.x1, p.x2) >= W) covered = true;
  }
  return covered ? deepest : Math.max(deepest, ground);
}

/**
 * PURE (G1157): the least stage scale (CSS px per world px) at which a canvas `height` CSS px tall
 * ends at the scene's bottom line (`bottom`, sceneBottomLine) with the camera at the scene's top, or
 * over the feet's room on the deepest floor (`floorY`) and the pack row's cover (`coverCss`), as
 * phoneGroundWorldHeight lets the camera stop: a canvas no taller than that never shows under the
 * line. 0 with no bottom.
 */
export function groundFitScale({ height, bottom, floorY, coverCss, clearance = 40 } = {}) {
  const H = finite(height);
  const line = finite(bottom);
  if (!(H > 0) || !(line > 0)) return 0;
  let s = H / line;
  const floor = finite(floorY);
  if (Number.isFinite(floor)) {
    const room = Math.min(finite(clearance, 40), Math.max(PHONE_GROUND_MIN_CLEARANCE, line - floor));
    const cover = Math.max(0, finite(coverCss, 0));
    if (floor + room > 0 && H > cover) s = Math.min(s, (H - cover) / (floor + room));
  }
  return s;
}

/**
 * PURE (G1146, report #617): the camera's world height on a phone (movement.js cameraTargetY's
 * worldHeight), so the canvas's bottom (the camera's view plus the pack reserve under it) stops at
 * the street's ground line: how far down its ground art covers the whole width. Glitch's camera
 * never went past a street's bottom (CameraMan.as 451-453) and its 600 px view seldom reached it;
 * a phone shows the whole height upright, and scrolled to the bottom sideways, with the pack
 * reserve open under the short pack row, so it showed the bare strip under the ground's last
 * pieces (Briarset Croft, Grimssea Bottom).
 *
 * The feet still keep their room over the real pack row (packCoverCss, as phoneCameraAnchor; none
 * when the row is not shown): `clearance` (MIN_GROUND_CLEARANCE), or only as much ground as the art
 * has under the deepest floor (`floorY`) when that is less, never under PHONE_GROUND_MIN_CLEARANCE.
 * So where the art ends close under the floor the camera stops as low as the pack row needs.
 * Never lower than `worldHeight` (the camera's usual height). No line: `worldHeight` as given.
 *
 * G1157: a computer's camera keeps the same rule with sceneBottomLine for the line (game.js
 * activeCameraWorldHeight), so its canvas never shows below a street's or room's bottom either.
 */
export function phoneGroundWorldHeight({ worldHeight, groundLine, floorY, packReserve = MIN_PACK_HEIGHT, packCoverCss, scale, clearance = 40 } = {}) {
  const world = finite(worldHeight);
  const line = finite(groundLine);
  if (!(world > 0) || !(line > 0)) return world;
  const pack = finite(packReserve, MIN_PACK_HEIGHT);
  const floor = finite(floorY);
  const s = finite(scale);
  const coverCss = finite(packCoverCss);
  const cover = coverCss > 0 && s > 0 ? coverCss / s : 0;
  let bottom = line;
  if (Number.isFinite(floor)) {
    const room = Math.min(finite(clearance, 40), Math.max(PHONE_GROUND_MIN_CLEARANCE, line - floor));
    bottom = Math.max(bottom, floor + room + cover);
  }
  return Math.min(world, bottom - pack);
}
