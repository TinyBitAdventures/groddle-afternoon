/**
 * PURE: the Classic interface's screen frame (classic-spec layout.md), no DOM.
 *
 * The 2012 client (TSMainView.as 1219-1303, LayoutModel.as 7-38, RightSideView.as
 * 51-53, 925-926, 1137, 1243-1245) drew a 40 px header, a 20 px gutter, the world
 * viewport (500 x 400 to 1000 x 600), the pack band under it (132 + 6) and a right
 * column of the contact strip (48 closed, 165 open) plus a 265 px chat column,
 * all on the #e6ecee stage, nothing scaled (Flash NO_SCALE).
 *
 * The remake fills the window (Austin 2026-10-30, open question 2), so Classic
 * puts that chrome around #game-root at one scale `u` shared with the world, and
 * the game's own stage rule (stageFor, js/location-view.js) sizes the world in
 * what is left, unchanged: same caps, same floors, same 132 px pack reserve at
 * the canvas's foot, which Classic paints as the pack band.
 *
 *   columns  gutter 20u | world (the rest) | right column 313u (430u open) | gutter 20u
 *   rows     header 40u | world (the rest)
 *
 * u is closed form, so there is no resize loop: the largest scale at which the
 * world still magnifies exactly with the chrome,
 *   u = max(1, min(W / (960 + C), H / (540 + 40), max(W / (1680 + C), H / (852 + 40))))
 * where C is the horizontal chrome (353 with the strip closed), 852 = 720 + 132
 * (the view's ceiling and the pack reserve) and 540 = 408 + 132 (its floor): the
 * first two keep the world cell over the floors, so stageFor on the cell then
 * returns scale u (tested over a sweep of windows). The chrome never draws under 1:1; below the floors the world
 * shrinks and the chrome stays 1:1.
 *
 * Narrow windows (Austin, open question 3): when the full column would push the
 * world under its 960 px floor (under 1313 px wide with the strip closed), the
 * chat column folds to a 48u rail of unread badges, and the column opens over
 * the world from the rail (`railPane`).
 *
 * "Original window size" (open question 2, a Preferences toggle): u = 1 and the
 * world cell is capped at 1000 x 732 (a 1000 x 600 view plus the pack reserve),
 * the whole block centred as the original's gutter = max(20, (W - block) / 2).
 *
 * World zoom (js/world-zoom.js, ZOOM): past Wide the world magnifies and the chrome with
 * it, still at one u. The stage's zoom has no closed form here, so classicZoomScale finds
 * the u at which stageFor on the cell returns u itself (stageFor's scale only falls as u
 * grows, so there is one). css/classic.css takes that u from --cu-zoom
 * (js/classic/classic-zoom.js sets it); at Wide the CSS rule above stands alone.
 * "Original window size" is the 2012 picture at 1:1 and ignores the zoom.
 *
 * Classic is desktop only (open question 11): under 960 x 540 the page shows
 * Modern (classicAllowed).
 *
 * Anchors (layout.md §2, frame 1 at the full 1000 x 600 viewport) are the
 * original's page coordinates less the viewport's (20, 40), in u, measured from
 * the world view's top-left, or from its right or bottom edge where the
 * original pinned them there, so they follow a view of any size.
 */
import { stageFor, MIN_PACK_HEIGHT, LOCATION_VIEW_W, VIEW_MAX_W, VIEW_CEIL_H, VIEW_FLOOR_H } from '../location-view.js?v=g476-1';

export const CLASSIC_MIN_W = 960;
export const CLASSIC_MIN_H = 540;

/** The original's constants (LayoutModel.as 7-19, RightSideView.as 925, 1137, ContactList.as 33-42). */
export const FRAME = Object.freeze({
  header: 40,
  gutter: 20,
  contactClosed: 48,
  contactOpen: 165,
  chatColumn: 265, // 264 column + 1 rule (RightSideView.as 53)
  rail: 48,
  packGap: 6,
  chatFoot: 16, // the chat column stops 16 above the stage's foot (vpH + 122 of the 138 band)
  originalView: Object.freeze({ w: 1000, h: 600 }),
});

/** Classic shows on a window at least this big; smaller shows Modern. */
export function classicAllowed(width, height) {
  return Number(width) >= CLASSIC_MIN_W && Number(height) >= CLASSIC_MIN_H;
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Right column width in u: the strip plus the chat column, or the rail. */
export function rightColumnWidth({ contactsOpen = false, rail = false } = {}) {
  if (rail) return FRAME.rail;
  return (contactsOpen ? FRAME.contactOpen : FRAME.contactClosed) + FRAME.chatColumn;
}

/** Horizontal chrome in u (both gutters and the right column). */
export const chromeWidth = (opts) => 2 * FRAME.gutter + rightColumnWidth(opts);

/** True when the full right column would push the world under its 960 px floor at 1:1. */
export function railFor(width, { contactsOpen = false } = {}) {
  return num(width) - chromeWidth({ contactsOpen }) < LOCATION_VIEW_W;
}

/**
 * The chrome scale for a window (closed form; see the top of the file).
 * @param {number} width @param {number} height
 * @param {{ chrome?: number, packReserve?: number }} [o] chrome: horizontal chrome in u
 */
export function classicScale(width, height, { chrome = chromeWidth(), packReserve = MIN_PACK_HEIGHT } = {}) {
  const W = num(width);
  const H = num(height);
  if (!(W > 0) || !(H > 0)) return 1;
  const grow = Math.max(W / (VIEW_MAX_W + chrome), H / (VIEW_CEIL_H + packReserve + FRAME.header));
  const fits = Math.min(W / (LOCATION_VIEW_W + chrome), H / (VIEW_FLOOR_H + packReserve + FRAME.header));
  return Math.max(1, Math.min(fits, grow));
}

/**
 * The chrome scale with the world zoomed (0 Wide .. 1 Original): the u, at least 1, at which
 * stageFor on the world cell (W - chrome u by H - 40u) returns u. At zoom 0 this is classicScale.
 */
export function classicZoomScale(width, height, { chrome = chromeWidth(), packReserve = MIN_PACK_HEIGHT, zoom = 0 } = {}) {
  const W = num(width);
  const H = num(height);
  if (!(W > 0) || !(H > 0)) return 1;
  const gap = (u) => stageFor({ width: W - chrome * u, height: H - FRAME.header * u, packReserve, zoom }).scale - u;
  if (gap(1) <= 0) return 1;
  let lo = 1;
  let hi = Math.max(2, W / LOCATION_VIEW_W, H / VIEW_FLOOR_H);
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (gap(mid) > 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Frame-1 anchors in u. x from the view's left (or `r`: the right edge's distance in from the view's),
 * y from its top (or `b`: the bottom edge's distance above the view's foot; negative is below it).
 * Sources are layout.md §2's table rows.
 */
export const ANCHORS = Object.freeze({
  ear: { x: -20, y: -40, w: 122, h: 125 }, // PlayerInfoUI.as 114-133
  face: { x: -7, y: -24, w: 73, h: 73 }, // 136-137 (13, 16)
  name: { x: 29.5, y: -37, w: 0, h: 0 }, // centred on the face, y 3 (672-694)
  cloud: { x: 64, y: -14, w: 25, h: 21 }, // 142-143 (84, 26)
  imgButton: { x: 93, y: -36, w: 52, h: 41 }, // ImaginationButton.as 46-60 (113, 4)
  bolt: { x: -1, y: 50, w: 9, h: 15 }, // 160-163 (19, 90)
  arc: { x: 7, y: 2, w: 77, h: 64 }, // 166-167 (27, 42)
  energyText: { x: 96, y: 3, w: 0, h: 0 }, // 177-178 (116, 43)
  buffs: { x: 162, y: 20, w: 26, h: 26 }, // BuffViewManager.as 32, 118 (≈182, 60); 26 per buff, gap 5
  location: { r: 0, y: -20, w: 192, h: 0 }, // right edge on the view's, centred in the header
  prompts: { r: 30, b: 30, w: 300, h: 0 }, // PromptView.as 39, 417-420 (690..990, grows up from 610)
  growl: { x: 10, b: 15, w: -20, h: 0 }, // GrowlQueue.as 25-26, 122-127 (x 30, bottom 625, 980 wide: view - 20)
  currants: { x: -20, b: 36, w: 36, h: 36 }, // YouDisplayManager.as 122-130, 464 (0, 568)
  packTabs: { x: 4, b: 0, w: 0, h: 17 }, // YouDisplayManager.as 140, 479 (24, 623)
  packSearch: { x: -17, b: -4, w: 29, h: 29 }, // PackTabberUI.as 384-397 (3, 615)
  packRow: { x: 5, b: -63, w: 876, h: 53 }, // PackDisplayManager.as 63, 1513-1519 (25, 650): 10 below the view
});

function anchorRect(a, view, u) {
  const w = a.w < 0 ? view.w + a.w * u : a.w * u;
  const x = a.r != null ? view.x + view.w - a.r * u - w : view.x + a.x * u;
  const y = a.b != null ? view.y + view.h - a.b * u - a.h * u : view.y + a.y * u;
  return { x, y, w, h: a.h * u };
}

/**
 * The Classic frame for a window, in CSS px.
 * @param {{ width: number, height: number, size?: 'fill'|'original', contactsOpen?: boolean,
 *   packReserve?: number, sceneWidth?: number, sceneHeight?: number, zoom?: number }} o
 */
export function classicLayout({
  width,
  height,
  size = 'fill',
  contactsOpen = false,
  packReserve = MIN_PACK_HEIGHT,
  sceneWidth,
  sceneHeight,
  zoom = 0,
} = {}) {
  const W = num(width);
  const H = num(height);
  const original = size === 'original';
  const rail = railFor(W, { contactsOpen });
  const rightU = rightColumnWidth({ contactsOpen, rail });
  const chrome = 2 * FRAME.gutter + rightU;
  const z = original ? 0 : Math.min(1, Math.max(0, num(zoom)));
  const u = original ? 1 : z > 0 ? classicZoomScale(W, H, { chrome, packReserve, zoom: z }) : classicScale(W, H, { chrome, packReserve });
  const header = FRAME.header * u;
  const rightW = rightU * u;
  let cellW = Math.max(0, W - chrome * u);
  let cellH = Math.max(0, H - header);
  let gutterL = FRAME.gutter * u;
  if (original) {
    cellW = Math.min(cellW, FRAME.originalView.w);
    cellH = Math.min(cellH, FRAME.originalView.h + packReserve);
    gutterL = Math.max(FRAME.gutter, Math.round((W - (rightW + cellW)) / 2));
  }
  const gutterR = Math.max(0, W - gutterL - cellW - rightW);
  const cell = { x: gutterL, y: header, w: cellW, h: cellH };
  const stage = stageFor({ width: cellW, height: cellH, packReserve, sceneWidth, sceneHeight, zoom: z });
  const view = { x: cell.x, y: cell.y, w: stage.viewW * stage.scale, h: stage.viewH * stage.scale };
  const band = { x: cell.x, y: view.y + view.h, w: cell.w, h: packReserve * stage.scale };
  const colX = cell.x + cell.w;
  const colH = Math.max(0, H - header - FRAME.chatFoot * u);
  const column = { x: colX, y: header, w: rightW, h: colH };
  const strip = rail ? null : { x: colX, y: header, w: (contactsOpen ? FRAME.contactOpen : FRAME.contactClosed) * u, h: colH };
  const chat = rail ? null : { x: colX + strip.w, y: header, w: (FRAME.chatColumn - 1) * u, h: colH };
  // The rail's column opens over the world, its right edge on the rail.
  const railPane = rail ? { x: colX - (FRAME.chatColumn - 1) * u, y: header, w: (FRAME.chatColumn - 1) * u, h: colH } : null;
  const anchors = {};
  for (const [k, a] of Object.entries(ANCHORS)) anchors[k] = anchorRect(a, view, u);
  // The header cluster (bug, help, volume, date) centres on the chat column (GameHeaderUI.as 33-117);
  // with the rail it sits at the right of the header.
  anchors.headerCluster = chat
    ? { x: chat.x + chat.w / 2, y: header / 2, w: 0, h: 0 }
    : { x: colX + rightW, y: header / 2, w: 0, h: 0 };
  // The contact strip's tab, 12 x 60, half over the world's right edge, centred on the 600 view (ContactList.as 112, 281).
  anchors.contactTab = { x: colX - 12 * u, y: view.y + (view.h - 60 * u) / 2, w: 12 * u, h: 60 * u };
  // Panes sit 12 in from the chat column's top-left, 240 wide (RightSideView.as 931-932).
  anchors.panes = chat ? { x: chat.x + 12 * u, y: header + 12 * u, w: 240 * u, h: Math.max(0, colH - 24 * u) } : null;
  return {
    u,
    size: original ? 'original' : 'fill',
    zoom: z,
    rail,
    contactsOpen: Boolean(contactsOpen),
    width: W,
    height: H,
    header,
    gutterL,
    gutterR,
    rightW,
    cell,
    stage,
    view,
    band,
    column,
    strip,
    chat,
    railPane,
    anchors,
    /** The #wrap grid under Classic (CSS px). */
    grid: {
      columns: `${px(gutterL)} ${px(cellW)} ${px(rightW)} ${px(gutterR)}`,
      rows: `${px(header)} ${px(cellH)}`,
    },
  };
}

const px = (v) => `${Math.round(v * 100) / 100}px`;

/**
 * The frame as CSS custom properties for #wrap (classic.css reads them).
 * @param {ReturnType<typeof classicLayout>} L
 */
export function classicCssVars(L) {
  return {
    '--classic-u': String(Math.round(L.u * 10000) / 10000),
    '--classic-header': px(L.header),
    '--classic-gutter-l': px(L.gutterL),
    '--classic-gutter-r': px(L.gutterR),
    '--classic-right': px(L.rightW),
    '--classic-cell-w': px(L.cell.w),
    '--classic-cell-h': px(L.cell.h),
    '--classic-view-h': px(L.view.h),
    '--classic-band-h': px(L.band.h),
  };
}

