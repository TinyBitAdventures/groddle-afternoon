/**
 * Build a multi-layer Pixi street view from original street JSON + CoU deco PNGs.
 */

import {
  worldToScreen,
  streetWidth,
  streetHeight,
  platformsScreen,
  signpostNear,
  pickConnection,
} from './street-model.js?v=a9a05f9d';
import { availableStreetTsids } from './street-loader.js?v=10376267';
import { frameTexture, isLoaded, onFailed, onLoaded, textureFromUrl } from './textures.js?v=b8e38103';
import { admitSharp, decoUrl, FAR_SLACKS, isSharpDeco, maxTextureSizeOf, sharpDeco, NEW_DECOS } from './deco-hires.js?v=34f36d77';
import { LADDER_TILE_Z, ladderTilePieces } from './ladder-tiling.js?v=4f9e07fa';
import { attachAnim, isAnimatedDeco, setAnimSource, setDecoTexture, syncAnim } from './deco-anim.js?v=de95df20';
import { drawnLayerOffset, layerScreenDir } from './camera-feel.js?v=e668afc5';
import { ensureDepthStencil, readbackPixels } from './render-probe.js?v=519c86ef';
import { QUAD_SPAN, quadSpans, wideRect } from './wide-quads.js?v=f34556e6';
import { anchorBottomCentre } from './sprite-feet.js?v=6358a697';
import { blurFix, blurredDecoCanvas } from './deco-blur.js?v=4f5d88ea';
import { signWords } from './deco-sign.js?v=e98e50f9';
import { loadWorldFont, WORLD_FONT_FAMILY } from './world-text.js?v=6b49f88c';
import { buildDoorSprite } from './door-view.js?v=5aa64a59';
import { visibleDoors } from './doors.js?v=f815e7c8';

const DECO_BASE = 'assets/decos/groddle/';
/**
 * Street names for a deco whose art ships under its SWF's own name. The old
 * grass_texture3 and house_back_medium_05 PNGs (Children of Ur exports, no SWF
 * by those names) are pixel for pixel grass_texture_3 and house_back_medium05,
 * whose CC0 glitch-locations SWFs the deco pipeline renders (G317).
 * Lapulapu Caverns' ladder tiling names corey3's basicWood tiles without the
 * `groddle_` prefix its bundle (corey3.swf) gives them (tools/build-ladder-tiles.py).
 */
export const DECO_TWINS = Object.freeze({
  grass_texture3: 'grass_texture_3',
  house_back_medium_05: 'house_back_medium05',
  ladder_tile_center_00_basicWood: 'groddle_ladder_tile_center_00_basicWood',
  ladder_tile_cap_1_basicWood: 'groddle_ladder_tile_cap_1_basicWood',
  // G1153: Hauki Seeks Manor's and Hakusan Heaps Towers' lifts name the noBG cut of the lift art,
  // which the deco pipeline never rendered; the lift art itself (door and plate) stands in.
  signpost_asset_elevator_noBG: 'signpost_asset_elevator',
  // unnnn's painting is a photo of a real person and is held (tools/deco-pipeline/recover.py HELD);
  // the demon holds up the same deco's wooden frame instead, empty, its plaque blank (CUTS, ours).
  rook_hall_placeholder_painting: 'rook_hall_placeholder_painting_frame',
});
const PLACEHOLDER = 0x5a7a4a;
/** Original engine art from TSEngineAssets (SignpostView.as). */
const SIGNPOST = {
  post: 'assets/ui/signpost/signpost_post.webp',
  arm: 'assets/ui/signpost/signpost_arm.webp',
  shadow: 'assets/ui/signpost/signpost_shadow.webp',
  // G1186: a QUARTER signpost's board and its block grid (TSEngineAssets signpost_quarter_arm.png,
  // signpost_quarter_grid.png, CC0).
  quarterArm: 'assets/ui/quarter/signpost_quarter_arm.webp',
  quarterGrid: 'assets/ui/quarter/signpost_quarter_grid.webp',
  /** Original holder.scale = 0.8 */
  scale: 0.8,
};

/** SignpostView: CSS signpost fontSize 14, rendered at 2.8x, arm_padd_x 8. */
const SIGN_FONT_SIZE = 14;
const SIGN_TEXT_RESOLUTION = 3;
const SIGN_ARM_PAD_X = 8;
const SIGN_GLOW_COLOUR = 0x53e5ff;
/**
 * The label's colour. The client's `signpost` CSS class is lost, but every snap of a 2012
 * signpost (research/flickr-2026-10-27 Louise Pasture: "Estevan Meadows", "Ritzrock Rise")
 * shows warm white bold words on the dark arm. The remake drew them dark brown (0x2a1a08) on
 * that dark brown arm, under a white halo: hard to read, and on the home street's friends'
 * signpost, with no halo, nearly invisible (Austin 2026-10-31). Warm white on the arm is about
 * 12:1. A destination the remake has not built yet stays a dimmer parchment (about 8:1).
 */
export const SIGN_TEXT_FILL = 0xfdf8ee;
export const SIGN_TEXT_FILL_UNBUILT = 0xd9ccb6;
/**
 * The words' font (G898, #429). The client's `signpost` CSS class is lost; the remake asked for
 * 'Trebuchet MS, Georgia, serif', and a phone without Trebuchet MS (Android) drew a bold serif.
 * Now the world's one font (R17, js/world-text.js): the UI's self-hosted Nunito, loaded before any
 * arm is drawn (loadSignFont), then a plain sans-serif.
 */
export const SIGN_FONT_FAMILY = WORLD_FONT_FAMILY;
const SIGN_LABEL_STYLE = Object.freeze({
  fontFamily: SIGN_FONT_FAMILY,
  fontSize: SIGN_FONT_SIZE,
  fontWeight: '700',
  fill: SIGN_TEXT_FILL,
  lineJoin: 'round',
  // StaticFilters.white1pxSignpost_GlowA: white, alpha .4, blur 2, strength 3.
  dropShadow: { alpha: 0.4, blur: 2, color: 0xffffff, distance: 0 },
  padding: 3,
});

/**
 * One arm's words as SignpostView draws them (createSignTextField): every signpost board, the
 * street's and the home street's friends' signpost alike, uses this.
 * @param {typeof PIXI} PIXI
 * @param {string} text
 * @param {number} [fill]
 */
export function signLabel(PIXI, text, fill = SIGN_TEXT_FILL) {
  // Mipmapped (G898): the 3x words shrink to a phone's 1x canvas (js/render-density.js) smoothly
  // instead of dropping pixels, which broke up the strokes on a tilted arm.
  const label = new PIXI.Text({ text: String(text), style: { ...SIGN_LABEL_STYLE, fill }, autoGenerateMipmaps: true });
  label.resolution = SIGN_TEXT_RESOLUTION;
  label.anchor.set(0.5, 0.5);
  return label;
}

/** makeSign: an arm fits its label plus 8px either side (holder units). */
export function signArmWidth(PIXI, labelText) {
  const metrics = PIXI.CanvasTextMetrics.measureText(String(labelText), new PIXI.TextStyle(SIGN_LABEL_STYLE));
  return Math.ceil(metrics.width + 2 * SIGN_ARM_PAD_X);
}

/** signpost_post.png is 246 tall: where buildSignpostSprite puts its first arm once the post has loaded. */
export const SIGN_POST_H = 246;
/** The post's ground width (signpost_post.png 43 wide at the 0.8 holder scale), in world px. */
export const SIGN_POST_W = Math.round(43 * SIGNPOST.scale);
/** The holder scale every signpost is drawn at (SignpostView.as holder.scale = 0.8). */
export const SIGN_SCALE = SIGNPOST.scale;
/** The first arm's centre above the post's foot, in holder units (buildSignpostSprite: -postH + 32). */
export const SIGN_FIRST_ARM_Y = -SIGN_POST_H + 32;

/**
 * A signpost with one arm, drawn as a street's (buildSignpostSprite, SignpostView.as: the shadow,
 * the post, the arm at the first slot with its words, all at the 0.8 holder scale), for a scene
 * that places its own post: the home street's way out (homes-feature). `left` points the arm left
 * (makeSign left_side: the arm mirrored, tilted 5.5 degrees). Returns a container whose origin is
 * the post's foot; `armWidth` is the arm's length in world px. No new art: Tiny Speck's PNGs.
 * @param {typeof PIXI} PIXI
 * @param {string} text
 * @param {{ left?: boolean, fill?: number }} [opts]
 */
export function oneArmSignpost(PIXI, text, { left = true, fill = SIGN_TEXT_FILL } = {}) {
  const box = new PIXI.Container();
  const holder = new PIXI.Container();
  holder.scale.set(SIGNPOST.scale);
  box.addChild(holder);
  const shadow = new PIXI.Sprite(textureFromUrl(SIGNPOST.shadow));
  anchorBottomCentre(shadow, 'deco');
  shadow.y = 6;
  shadow.alpha = 0.75;
  shadow.label = 'sign-shadow';
  const post = new PIXI.Sprite(textureFromUrl(SIGNPOST.post));
  anchorBottomCentre(post, 'deco');
  post.label = 'sign-post';
  holder.addChild(shadow, post);
  const arm = new PIXI.Container();
  arm.y = SIGN_FIRST_ARM_Y;
  arm.x = left ? -2 : 2;
  arm.rotation = ((left ? 5.5 : -5.5) * Math.PI) / 180;
  arm.label = 'sign-arm-holder';
  const w = signArmWidth(PIXI, text);
  const board = new PIXI.Sprite(textureFromUrl(SIGNPOST.arm));
  board.anchor.set(0, 0.5);
  board.width = w;
  board.height = 30;
  if (left) board.scale.x *= -1;
  board.label = 'sign-arm';
  const label = signLabel(PIXI, text, fill);
  label.x = left ? -w / 2 : w / 2;
  label.y = -1;
  label.label = 'sign-label';
  arm.addChild(board, label);
  holder.addChild(arm);
  // FRIENDPOST: the arm is a board of its own, as a street post's are (hover glow, click, number key 1).
  addSignBoard(PIXI, box, arm, { width: w, left, key: 1, arm: board, label });
  box.armWidth = Math.round(w * SIGNPOST.scale);
  box.signText = String(text);
  return box;
}

/** @type {Set<string>|null} */
let decoManifest = null;
/** @type {Record<string, import('pixi.js').Texture>|null} */
let signTextures = null;

/**
 * G898: the signposts' Nunito is in before any arm is measured or drawn: canvas text never redraws
 * when a font arrives later. The world font's own loader (R17, js/world-text.js loadWorldFont):
 * true once loaded, false without document.fonts, on an error or after its wait (that street keeps
 * the fallback; the next asks again).
 */
export function loadSignFont(wait) {
  return loadWorldFont(wait);
}

/**
 * Preload original signpost PNGs (post / arm / shadow) and the words' font (G898).
 * @param {typeof PIXI} PIXI
 */
export async function loadSignpostTextures(PIXI) {
  if (signTextures) {
    await loadSignFont();
    return signTextures;
  }
  signTextures = {};
  await Promise.all([
    loadSignFont(),
    ...Object.entries(SIGNPOST)
      .filter(([k]) => k !== 'scale')
      .map(
        ([key, url]) =>
          new Promise((resolve) => {
            const tex = textureFromUrl(url);
            const done = () => {
              signTextures[key] = tex;
              resolve();
            };
            if (isLoaded(tex.source)) done();
            else {
              onLoaded(tex.source, done);
              onFailed(tex.source, done);
              // safety
              setTimeout(done, 2000);
            }
          })
      ),
  ]);
  return signTextures;
}

/**
 * Build a SignpostView-style post with alternating wooden arms + labels.
 * Mirrors SignpostView.as (post, shadow, arms left/right at ±5.5°, scale 0.8).
 * @param {typeof PIXI} PIXI
 * @param {object} signpost
 * @param {{ x: number, y: number }} pos screen
 */
/** Blurred copies by deco, size and file (several placements of one deco often share all three). */
const lostBlurCache = new Map();

/**
 * G1174 (js/deco-blur.js): the deco drawn at its placed size with the blur its squash lost, on a
 * padded canvas; the padding is kept round the registration point (bottom centre of the w x h box).
 */
function applyLostBlur(PIXI, spr, tex, deco, fix, sizeDeco) {
  if (spr.destroyed) return;
  const image = tex?.source?.resource;
  if (!image || typeof document === 'undefined') return;
  const key = `${deco.sprite}|${deco.w}|${deco.h}|${tex.source.uid ?? ''}`;
  let blurred = lostBlurCache.get(key);
  if (!blurred || blurred.destroyed) {
    try {
      blurred = PIXI.Texture.from(blurredDecoCanvas(image, deco.w, deco.h, fix).canvas);
    } catch {
      return;
    }
    lostBlurCache.set(key, blurred);
  }
  spr.texture = blurred;
  spr.blurPad = { px: fix.px, py: fix.py };
  spr.anchor.set(0.5, (fix.py + deco.h) / (deco.h + 2 * fix.py));
  sizeDeco();
}

function buildSignpostSprite(PIXI, signpost, pos) {
  const g = new PIXI.Container();
  g.x = pos.x;
  g.y = pos.y;
  g.zIndex = 8000;
  g.eventMode = 'none';
  /** @type {{ arms: any[], labels: any[], baseLabelFills: number[] }} */
  g.signHoverParts = { arms: [], labels: [], baseLabelFills: [] };
  g.signBoards = [];
  g.signScale = SIGNPOST.scale;

  const holder = new PIXI.Container();
  holder.scale.set(SIGNPOST.scale);
  g.addChild(holder);

  const tex = signTextures || {};
  // Shadow
  if (tex.shadow && !tex.shadow.source?.destroyed) {
    const shadow = new PIXI.Sprite(tex.shadow);
    anchorBottomCentre(shadow, 'deco');
    shadow.y = 6;
    shadow.alpha = 0.75;
    shadow.label = 'sign-shadow';
    holder.addChild(shadow);
  }
  // Post (not brightened on hover — only arms + text)
  let postH = 200;
  if (tex.post && !tex.post.source?.destroyed) {
    const post = new PIXI.Sprite(tex.post);
    anchorBottomCentre(post, 'deco');
    post.y = 0;
    post.label = 'sign-post';
    holder.addChild(post);
    postH = post.height || 200;
  } else {
    const post = new PIXI.Graphics();
    post.roundRect(-8, -200, 16, 200, 3).fill(0x5a3a22);
    post.roundRect(-10, -12, 20, 14, 3).fill(0x6b4423);
    post.label = 'sign-post';
    holder.addChild(post);
    postH = 200;
  }

  if (signpost.quarter && typeof signpost.quarter === 'object') {
    addQuarterBoard(PIXI, g, holder, signpost, postH, tex);
    g.signpost = signpost;
    return g;
  }

  // Collect visible connections (all, with preferred loaded one first for label emphasis)
  const connects = (signpost.connects || []).filter((c) => c && (c.label || c.tsid));
  const available = availableStreetTsids();
  // SignpostView.as 229-247 draws every visible connect, one arm under the other (five on the
  // Sabudana Drama Towers posts); the number keys pick one (signpostArmKey), so nine at most.
  const shown = connects.slice(0, SIGN_MAX_ARMS);
  shown.forEach((conn, visibleI) => {
    const leftSide = Boolean(visibleI % 2);
    const armHolder = new PIXI.Container();
    const armY = -postH + visibleI * 28 + 32;
    armHolder.y = armY;
    armHolder.rotation = ((leftSide ? 5.5 : -5.5) * Math.PI) / 180;
    armHolder.x = leftSide ? -2 : 2;
    armHolder.label = 'sign-arm-holder';

    const labelText = conn.label || conn.tsid || 'Somewhere';
    const isLoaded = (() => {
      try {
        return !!pickConnection({ connects: [conn] }, available);
      } catch {
        return false;
      }
    })();

    // SignpostView.createSignTextField: 14px text drawn at 2.8x then scaled
    // down, warm white with a soft white glow (signLabel).
    const baseFill = isLoaded ? SIGN_TEXT_FILL : SIGN_TEXT_FILL_UNBUILT;
    const label = signLabel(PIXI, labelText, baseFill);
    const fitW = signArmWidth(PIXI, labelText);

    let armW = fitW;
    let armSprite = null;
    let glow = null;
    holder.addChild(armHolder);
    if (tex.arm && !tex.arm.source?.destroyed) {
      const armH = Math.max(22, tex.arm.height || 30);
      const makeArm = () => {
        const arm = new PIXI.Sprite(tex.arm);
        arm.anchor.set(0, 0.5);
        arm.width = fitW;
        arm.height = armH;
        if (leftSide) arm.scale.x *= -1;
        return arm;
      };
      // Hover is a cyan glow round the whole sign (StaticFilters.tsSprite_GlowA,
      // blur 15). A tint would only darken the brown arm, so this is a blurred
      // solid shape behind it.
      glow = new PIXI.Graphics();
      glow.roundRect(leftSide ? -fitW : 0, -armH / 2, fitW, armH, 4).fill({ color: SIGN_GLOW_COLOUR, alpha: 1 });
      glow.filters = [new PIXI.BlurFilter({ strength: 7, quality: 3 })];
      glow.visible = false;
      glow.label = 'sign-glow';
      armHolder.addChild(glow);
      const arm = makeArm();
      arm.label = 'sign-arm';
      armSprite = arm;
      armHolder.addChild(arm);
    } else {
      const arm = new PIXI.Graphics();
      arm.roundRect(leftSide ? -fitW : 0, -12, fitW, 24, 3).fill(0xd4b896).stroke({ width: 1, color: 0x8a6a40, alpha: 0.8 });
      arm.label = 'sign-arm';
      armSprite = arm;
      armHolder.addChild(arm);
    }
    if (armSprite) g.signHoverParts.arms.push(armSprite);

    label.x = leftSide ? -armW * 0.5 : armW * 0.5;
    label.y = -1;
    label.label = 'sign-label';
    label._baseFill = baseFill;
    armHolder.addChild(label);
    // Austin 2026-11-01: arms are numbered 1 to N from the top; at the post each shows its key
    // just past its tip (setSignpostKeys), and that number key takes it.
    const keyCap = signKeyCap(PIXI, visibleI + 1);
    keyCap.x = leftSide ? -armW - SIGN_KEY_GAP - SIGN_KEY_W / 2 : armW + SIGN_KEY_GAP + SIGN_KEY_W / 2;
    keyCap.visible = false;
    armHolder.addChild(keyCap);
    g.signHoverParts.labels.push(label);
    g.signHoverParts.baseLabelFills.push(baseFill);
    g.signBoards.push({
      index: visibleI,
      connection: conn,
      arm: armSprite,
      glow,
      label,
      keyCap,
      key: String(visibleI + 1),
      baseFill,
      x: armHolder.x,
      y: armHolder.y,
      rotation: armHolder.rotation,
      hitArea: {
        x: leftSide ? -armW : 0,
        y: -15,
        width: armW,
        height: 30,
      },
    });
  });

  if (!shown.length) {
    const empty = new PIXI.Text({ text: 'Signpost', style: {
      fontFamily: SIGN_FONT_FAMILY,
      fontSize: 12,
      fill: 0x3a2a18,
      fontWeight: '700',
    } });
    anchorBottomCentre(empty, 'text');
    empty.y = -postH - 8;
    empty.label = 'sign-label';
    empty._baseFill = 0x3a2a18;
    holder.addChild(empty);
    g.signHoverParts.labels.push(empty);
    g.signHoverParts.baseLabelFills.push(0x3a2a18);
  }

  g.signpost = signpost;
  return g;
}

/** SignpostView.as 211-238: the QUARTER board is 85 tall and at least 150 wide (holder units). */
export const QUARTER_ARM_H = 85;
export const QUARTER_ARM_MIN_W = 150;

/**
 * G1186: a QUARTER signpost (SignpostView.as render 211-238, QuarterInfo.as): one board on the
 * right of the post, signpost_quarter_arm at 85 tall and at least 150 wide, its centre 50 under
 * the post's top, tilted as a right arm (makeSign: 2 px out, -5.5 degrees), with the quarter's
 * name (info.label) and the signpost_quarter_grid scaled as the board was and centred on it. The
 * client drew the grid over the words; here the words go over the grid so they stay readable.
 * A click takes the board's connect (the client opened LocationSelectorDialog's grid of blocks;
 * this quarter has one block). Exported for tests.
 */
export function addQuarterBoard(PIXI, g, holder, signpost, postH, tex = {}) {
  const info = signpost.quarter;
  const conn = (signpost.connects || []).find((c) => c && (c.label || c.tsid)) || null;
  const words = String(info.label || conn?.label || 'Quarter');
  const armHolder = new PIXI.Container();
  armHolder.x = 2;
  armHolder.y = -postH + 50;
  armHolder.rotation = (-5.5 * Math.PI) / 180;
  armHolder.label = 'sign-arm-holder';
  holder.addChild(armHolder);
  const label = signLabel(PIXI, words);
  label.style.wordWrap = true;
  label.style.wordWrapWidth = QUARTER_ARM_MIN_W - 2 * SIGN_ARM_PAD_X;
  label.style.align = 'center';
  const w = Math.max(QUARTER_ARM_MIN_W, Math.ceil(Math.min(label.width, QUARTER_ARM_MIN_W) + 2 * SIGN_ARM_PAD_X));
  const h = QUARTER_ARM_H;
  const glow = new PIXI.Graphics();
  glow.roundRect(0, -h / 2, w, h, 6).fill({ color: SIGN_GLOW_COLOUR, alpha: 1 });
  if (PIXI.BlurFilter) glow.filters = [new PIXI.BlurFilter({ strength: 7, quality: 3 })];
  glow.visible = false;
  glow.label = 'sign-glow';
  armHolder.addChild(glow);
  let arm;
  if (tex.quarterArm && !tex.quarterArm.source?.destroyed) {
    arm = new PIXI.Sprite(tex.quarterArm);
    arm.anchor.set(0, 0.5);
    arm.width = w;
    arm.height = h;
  } else {
    arm = new PIXI.Graphics();
    arm.roundRect(0, -h / 2, w, h, 4).fill(0x4a3420);
  }
  arm.label = 'sign-arm';
  armHolder.addChild(arm);
  if (tex.quarterGrid && !tex.quarterGrid.source?.destroyed) {
    // The grid at the board's smaller scale (85 / 195 tall: the arm PNG is 263 x 195), centred.
    const grid = new PIXI.Sprite(tex.quarterGrid);
    const k = Math.min(w / 263, h / 195);
    grid.anchor.set(0.5, 0.5);
    grid.scale.set(k);
    grid.x = w / 2;
    grid.alpha = 0.85;
    grid.label = 'sign-quarter-grid';
    armHolder.addChild(grid);
  }
  label.x = w / 2;
  label.y = -1;
  label.label = 'sign-label';
  label._baseFill = SIGN_TEXT_FILL;
  armHolder.addChild(label);
  const keyCap = signKeyCap(PIXI, 1);
  keyCap.x = w + SIGN_KEY_GAP + SIGN_KEY_W / 2;
  keyCap.visible = false;
  armHolder.addChild(keyCap);
  g.signHoverParts.arms.push(arm);
  g.signHoverParts.labels.push(label);
  g.signHoverParts.baseLabelFills.push(SIGN_TEXT_FILL);
  g.signQuarter = { label: words, width: w };
  if (conn) {
    g.signBoards.push({
      index: 0,
      connection: conn,
      arm,
      glow,
      label,
      keyCap,
      key: '1',
      baseFill: SIGN_TEXT_FILL,
      x: armHolder.x,
      y: armHolder.y,
      rotation: armHolder.rotation,
      hitArea: { x: 0, y: -h / 2, width: w, height: h },
    });
  }
  return armHolder;
}

/**
 * G1153: where a lift's art takes a click, from its foot in world px: the door and the plate
 * (signpost_asset_elevator.webp's opaque box, 117-509 x 451-833 of 784 x 844, drawn 392 x 422).
 */
export const SIGN_DECO_HIT = Object.freeze({ x: -140, y: -200, width: 202, height: 200 });

/**
 * G1153: a signpost whose location XML names a deco is drawn as that deco, with no post or arms.
 * The tower lobbies' lifts are signposts (signpost_asset_elevator, 392 x 422); SignpostView.as
 * render 155-178 put the deco in deco_holder and bailed on the post, and a click on it opened the
 * lift's floor chooser (TSFrontController.startInteractionWith 3586-3592, LocationSelectorDialog),
 * whose apartment style wrote the floor on the plate (showNumber: the lobby is L). Here each floor
 * is still a board (one number key each), every board the whole lift, and the game opens the
 * floors as a menu (game.js openSignpostArmsMenu). `art` is the deco's texture, or null when the
 * street already draws the same art at the post (Hauki Seeks Manor's lobby deco); `plate` the
 * plate's words (the floors draw their own number: features/tower-floors-feature.js).
 * @param {typeof PIXI} PIXI
 * @param {object} signpost
 * @param {{ x: number, y: number }} pos screen (the deco's foot)
 * @param {{ art?: any, plate?: string }} [opts]
 */
export function buildSignDecoView(PIXI, signpost, pos, { art = null, plate = '' } = {}) {
  const g = new PIXI.Container();
  g.x = pos.x;
  g.y = pos.y;
  g.zIndex = 8000;
  g.eventMode = 'none';
  g.label = 'sign-deco';
  g.signDeco = true;
  g.signScale = 1;
  g.signHoverParts = { arms: [], labels: [], baseLabelFills: [] };
  g.signBoards = [];
  const hit = SIGN_DECO_HIT;
  // Hover: the lift glows as the client's interaction target did (tsSprite_GlowA).
  const glow = new PIXI.Graphics();
  glow.roundRect(hit.x, hit.y, hit.width, hit.height, 18).fill({ color: SIGN_GLOW_COLOUR, alpha: 0.55 });
  if (PIXI.BlurFilter) glow.filters = [new PIXI.BlurFilter({ strength: 14, quality: 3 })];
  glow.visible = false;
  glow.label = 'sign-deco-glow';
  g.addChild(glow);
  g.signDecoGlow = glow;
  if (art) {
    const spr = new PIXI.Sprite(art);
    anchorBottomCentre(spr, 'deco');
    const size = () => {
      if (spr.destroyed) return;
      if (signpost.deco?.w > 0) spr.width = signpost.deco.w;
      if (signpost.deco?.h > 0) spr.height = signpost.deco.h;
    };
    size();
    if (!isLoaded(art)) onLoaded(art.source, size);
    spr.label = 'sign-deco-art';
    g.addChild(spr);
    g.signDecoArt = spr;
  }
  if (plate) {
    const t = new PIXI.Text({ text: String(plate), style: { fontFamily: WORLD_FONT_FAMILY, fontSize: 40, fontWeight: '900', fill: SIGN_DECO_PLATE_FILL } });
    t.resolution = 3;
    t.anchor.set(0.5, 0.5);
    t.x = SIGN_DECO_PLATE.dx;
    t.y = -SIGN_DECO_PLATE.dy;
    t.label = 'sign-deco-plate';
    g.addChild(t);
  }
  const connects = (signpost.connects || []).filter((c) => c && (c.label || c.tsid)).slice(0, SIGN_MAX_ARMS);
  connects.forEach((conn, i) => {
    g.signBoards.push({
      index: i,
      connection: conn,
      arm: null,
      glow: null,
      label: null,
      keyCap: null,
      key: String(i + 1),
      baseFill: SIGN_TEXT_FILL,
      x: 0,
      y: 0,
      rotation: 0,
      hitArea: { ...hit },
    });
  });
  g.signpost = signpost;
  return g;
}

/**
 * The lift plate's centre from the lift's foot (signpost_asset_elevator.webp's plate, 117-212 x
 * 562-696 of 784 x 844: -114, -108; tower-floors.js TOWER_LIFT_PLATE) and its paint. The 2012
 * Gregarious Towers lobby template's L is about 29 px tall on the 67 px plate.
 */
const SIGN_DECO_PLATE = Object.freeze({ dx: -114, dy: 108 });
const SIGN_DECO_PLATE_FILL = 0xe9cf86;

/**
 * G1153: whether the street's middleground already draws a signpost's deco art at the post (within
 * 4 px): Hauki Seeks Manor's lobby places signpost_asset_elevator as a deco too (57,-129, its lift
 * signpost at 58,-127), so the lift is not drawn twice.
 */
export function signDecoDrawn(street, signpost) {
  const want = signpost?.deco?.sprite;
  if (!want) return false;
  const art = (name) => DECO_TWINS[name] || name;
  const layer = (street?.layers || []).find((l) => l.id === 'middleground' || l.name === 'middleground');
  return (layer?.decos || []).some((d) => art(d.sprite) === art(want) && Math.abs(d.x - signpost.x) <= 4 && Math.abs(d.y - signpost.y) <= 4);
}

/**
 * G1154: a signpost's wood takes its layer's colour filter (`colour`: colourFilter of the
 * middleground's filters, null for none), as the client's posts, children of the middleground,
 * took that layer's filters: on a dark street (Lotha Harte, Kristel Kaos) the post and arms are
 * near black. The words stay as they are (the 2012 Lotha Harte street template shows white words
 * on the dark arms). An arm's hover glow takes it after its blur (#721): the client's street filter
 * sat on SignpostView's holder (ApplyLayerFiltersToViewCmd.as 47), round the arms and the glow on
 * each arm (SignpostView.as 367 tsSprite_GlowA), so in a greyscale region (Brillah) the glow is grey.
 * The route glow (map-routes-feature placeSignGlow) is ours and stays yellow. A lift drawn as its
 * deco takes it on its art, plate and glow. One filter, shared by the parts.
 * @param {PIXI.Container} g  a view from buildSignpostSprite or buildSignDecoView
 * @param {any} colour
 * @returns {number} how many parts took it
 */
export function colourSignpost(g, colour) {
  if (!g || !colour) return 0;
  let n = 0;
  const walk = (node) => {
    for (const child of node.children || []) {
      if (SIGN_WOOD.has(child.label)) {
        child.filters = [colour];
        n += 1;
      } else if (SIGN_GLOWS.has(child.label)) {
        child.filters = [...(child.filters || []).filter((f) => f !== colour), colour];
        n += 1;
      } else if (child.children?.length) walk(child);
    }
  };
  walk(g);
  g.signColour = colour;
  return n;
}
/** The parts of a signpost that are painted wood (colourSignpost). */
const SIGN_WOOD = new Set(['sign-shadow', 'sign-post', 'sign-arm', 'sign-deco-art', 'sign-deco-plate']);
/** The hover glows, which take the colour after their blur (colourSignpost, #721). */
const SIGN_GLOWS = new Set(['sign-glow', 'sign-deco-glow']);

/** The most arms a post draws: one for each number key. */
export const SIGN_MAX_ARMS = 9;
/** An arm's key cap, in holder units: its size and its gap from the arm's tip. */
const SIGN_KEY_W = 18;
const SIGN_KEY_GAP = 3;

/** The small key past an arm's tip (the top bar's key caps, in the signpost's wood colours). */
function signKeyCap(PIXI, n) {
  const cap = new PIXI.Container();
  cap.label = 'sign-key';
  const box = new PIXI.Graphics();
  box.roundRect(-SIGN_KEY_W / 2, -SIGN_KEY_W / 2, SIGN_KEY_W, SIGN_KEY_W, 4)
    .fill({ color: 0xfdf8ee, alpha: 0.95 })
    .stroke({ width: 1.5, color: 0x5a3a22, alpha: 0.9 });
  const text = new PIXI.Text({ text: String(n), style: { fontFamily: SIGN_FONT_FAMILY, fontSize: 13, fontWeight: '700', fill: 0x3a2a18 } });
  text.resolution = SIGN_TEXT_RESOLUTION;
  text.anchor.set(0.5, 0.5);
  text.y = 0.5;
  cap.addChild(box, text);
  // Drawn once into a 3x texture: a thin vector outline re-rasterized at a fractional spot every
  // frame the camera moves made the box edge shimmer; a baked texture glides smoothly between pixels.
  if (typeof cap.cacheAsTexture === 'function') cap.cacheAsTexture({ resolution: SIGN_TEXT_RESOLUTION, antialias: true });
  return cap;
}

/**
 * Show or hide a post's arm keys (the post the avatar stands at: game.js showSignpostKeys).
 * @param {PIXI.Container} g  signpost container from buildSignpostSprite
 * @param {boolean} on
 */
export function setSignpostKeys(g, on) {
  if (!g || g.destroyed) return;
  for (const board of g.signBoards || []) {
    if (board.keyCap && !board.keyCap.destroyed) board.keyCap.visible = Boolean(on);
  }
  g.signKeysShown = Boolean(on);
}

/**
 * FRIENDPOST (Austin 2026-11-02: "you can't actually click on the individual signs themselves"):
 * one arm of a post a scene draws itself (the home street's signpost: homes-feature's Back to Ur,
 * home-street-mp-feature's friends) becomes a board as buildSignpostSprite's are, so the same
 * hover glow, click and number key reach it. SignpostView.as makeSign 290-329 made every arm its
 * own SignpostSignView (mouseChildren off, hand cursor), and LocationInputHandler.as 396-399 took a
 * click on one as that arm. `view` is the container the hit test reads (origin the post's foot,
 * holder scale SIGN_SCALE); `armHolder` the arm's container, already placed and tilted. The game
 * runs a scene board's verb (`verbId`, else the target's first) on the target whose sprite is
 * `view`, or on `target` when the feature sets one (game.js takeSceneArm).
 * @param {typeof PIXI} PIXI
 * @param {PIXI.Container} view
 * @param {PIXI.Container} armHolder
 * @param {{ width: number, left?: boolean, key: number|string, arm?: any, label?: any, verbId?: string, tip?: string }} opts
 */
export function addSignBoard(PIXI, view, armHolder, { width, left = false, key, arm = null, label = null, verbId = '', tip = '' }) {
  const armH = 30;
  const glow = new PIXI.Graphics();
  glow.roundRect(left ? -width : 0, -armH / 2, width, armH, 4).fill({ color: SIGN_GLOW_COLOUR, alpha: 1 });
  if (PIXI.BlurFilter) glow.filters = [new PIXI.BlurFilter({ strength: 7, quality: 3 })];
  glow.visible = false;
  glow.label = 'sign-glow';
  armHolder.addChildAt(glow, 0);
  const keyCap = signKeyCap(PIXI, key);
  keyCap.x = left ? -width - SIGN_KEY_GAP - SIGN_KEY_W / 2 : width + SIGN_KEY_GAP + SIGN_KEY_W / 2;
  keyCap.visible = false;
  armHolder.addChild(keyCap);
  view.signScale = SIGNPOST.scale;
  if (!Array.isArray(view.signBoards)) view.signBoards = [];
  const board = {
    index: view.signBoards.length,
    key: String(key),
    scene: true,
    verbId,
    tip,
    target: null,
    arm,
    glow,
    label,
    keyCap,
    x: armHolder.x,
    y: armHolder.y,
    rotation: armHolder.rotation,
    hitArea: { x: left ? -width : 0, y: -armH / 2, width, height: armH },
  };
  view.signBoards.push(board);
  return board;
}

/**
 * Glow the hovered destination board (SignpostView: tsSprite_GlowA on the sign).
 * @param {PIXI.Container} g  signpost container from buildSignpostSprite
 * @param {boolean} on
 * @param {number|null} [boardIndex] individual arm index; null affects every arm
 */
export function setSignpostHover(g, on, boardIndex = null) {
  if (!g || g.destroyed) return;
  // G1153: a lift drawn as its deco glows whole (its boards are all the lift).
  if (g.signDecoGlow && !g.signDecoGlow.destroyed) g.signDecoGlow.visible = Boolean(on);
  const boards = g.signBoards || [];
  for (const board of boards) {
    const active = Boolean(on && (boardIndex == null || board.index === boardIndex));
    if (board.glow && !board.glow.destroyed) board.glow.visible = active;
    // Graphics fallback arms have no glow copy, so they warm up instead.
    const arm = board.arm;
    if (!board.glow && arm && !arm.destroyed && arm.tint !== undefined) arm.tint = active ? 0xfff0c8 : 0xffffff;
  }
}

/**
 * G1310 (Austin 2026-11-25): the parts of a post that glow while it is in reach on a computer, as
 * the client glowed the whole SignpostView (MiddleGroundRenderer.as glowSignPosts, SignpostView.as
 * glow 612-617: tsSprite_GlowA on its interaction_target, the post with its arms, or a lift's deco).
 * The post, each arm and a lift's art: sprites with art to trace (game.js draws their rims), not
 * the shadow, the words, the key caps or a Graphics arm drawn while the art is missing.
 * @param {PIXI.Container} g  a view from buildSignpostSprite, buildSignDecoView or a scene's post
 * @returns {any[]}
 */
export function signpostGlowParts(g) {
  const out = [];
  const walk = (node) => {
    for (const child of node?.children || []) {
      if (!child || child.destroyed || child.label === 'hover-outline') continue;
      if (SIGN_GLOW_PARTS.has(child.label)) {
        if (child.texture && child.texture.width > 1) out.push(child);
      } else if (child.children?.length) walk(child);
    }
  };
  if (g && !g.destroyed) walk(g);
  return out;
}
const SIGN_GLOW_PARTS = new Set(['sign-post', 'sign-arm', 'sign-deco-art']);

/**
 * Hit-test one destination board in world/Pixi coordinates. The post and other
 * arms deliberately do not count, matching the original per-destination UI.
 * SIGNTAP: `pad` (world px, a phone's tap) also takes a point that far outside a
 * board, the nearest board winning; 0 (a pointer) is the board's own box only.
 * @param {any[]} signViews
 * @param {number} worldX
 * @param {number} worldY
 * @param {{ pad?: number }} [opts]
 */
export function signpostBoardAt(signViews, worldX, worldY, { pad = 0 } = {}) {
  const reach = Math.max(0, Number(pad) || 0);
  let best = null;
  for (const view of [...(signViews || [])].reverse()) {
    if (!view || view.destroyed) continue;
    const scale = Number(view.signScale) || 1;
    const holderX = (Number(worldX) - (Number(view.x) || 0)) / scale;
    const holderY = (Number(worldY) - (Number(view.y) || 0)) / scale;
    const slack = reach / scale;
    for (const board of [...(view.signBoards || [])].reverse()) {
      const dx = holderX - (Number(board.x) || 0);
      const dy = holderY - (Number(board.y) || 0);
      const rotation = Number(board.rotation) || 0;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const localX = dx * cos + dy * sin;
      const localY = -dx * sin + dy * cos;
      const hit = board.hitArea;
      if (!hit) continue;
      // How far outside the board the point is (0 inside), in the board's own px.
      const ox = Math.max(hit.x - localX, 0, localX - (hit.x + hit.width));
      const oy = Math.max(hit.y - localY, 0, localY - (hit.y + hit.height));
      const off = Math.hypot(ox, oy);
      if (off === 0) {
        return {
          view,
          board,
          index: board.index,
          connection: board.connection,
        };
      }
      if (off <= slack && (!best || off * scale < best.off)) best = { off: off * scale, view, board };
    }
  }
  return best ? { view: best.view, board: best.board, index: best.board.index, connection: best.board.connection } : null;
}

/** Load list of available deco basenames (no .png). Kept once in; a failed load is tried again next time. */
export async function loadDecoManifest() {
  if (decoManifest) return decoManifest;
  try {
    const res = await fetch('assets/decos/manifest.json?v=puzzles-1');
    if (res.ok) {
      const list = await res.json();
      // A published zone's new art (gz_, js/deco-new-list.js) is drawn like the library's.
      decoManifest = new Set([...list, ...NEW_DECOS]);
      return decoManifest;
    }
  } catch { /* */ }
  // Sibling audit B8: a failed load is tried again on the next street. The fallback (only the new
  // zone art) stands for this street alone; kept, it left every street bare for the session.
  return new Set(NEW_DECOS);
}

// —— Glitch layer colour treatment (the production client's path) ——
// quasimondo ColorMatrix luminance weights (com/quasimondo/geom/ColorMatrix.as).
const LUM_R = 0.212671;
const LUM_G = 0.71516;
const LUM_B = 0.072169;
const IDENTITY = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** Flash-style 4x5 matrix multiply (quasimondo concat): other applied after current. */
function multiplyMatrix(current, other) {
  const out = new Array(20);
  let i = 0;
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      out[i + x] =
        other[i] * current[x] +
        other[i + 1] * current[x + 5] +
        other[i + 2] * current[x + 10] +
        other[i + 3] * current[x + 15] +
        (x === 4 ? other[i + 4] : 0);
    }
    i += 5;
  }
  return out;
}

/**
 * The client's layer matrix. FlashVarModel.alt_color_matrix is on by default,
 * so ColorMatrix.getFilter builds it with quasimondo's ColorMatrix: colorize
 * (tint, amount/100), adjustContrast(contrast/100), adjustSaturation
 * (saturation/100 + 1), adjustBrightness(brightness), each applied after the
 * last, offsets in Flash's 0-255 units. The other branch (ColorMatrix.tint,
 * whose comma expression drops the blue-to-blue term) only ran with that flag
 * off: Le Misérable's purple and teal panel lights (layer tints 0x9F3DD4 and
 * 0x33CCCC, recording j9xJLETQzi4) would have drawn dark red and green.
 * @param {{ brightness?: number, contrast?: number, saturation?: number, tintColor?: number, tintAmount?: number }} f
 * @returns {number[]|null}
 */
export function glitchLayerMatrix(f = {}) {
  const brightness = Number(f.brightness) || 0;
  const contrast = Number(f.contrast) || 0;
  const saturation = Number(f.saturation) || 0;
  const tintAmount = Number(f.tintAmount) || 0;
  const tintColor = Number(f.tintColor) || 0;
  if (!brightness && !contrast && !saturation && !tintAmount) return null;
  let m = IDENTITY.slice();
  if (tintAmount) {
    // colorize(rgb, amount)
    const a = tintAmount / 100;
    const r = ((tintColor >> 16) & 0xff) / 255;
    const g = ((tintColor >> 8) & 0xff) / 255;
    const b = (tintColor & 0xff) / 255;
    const inv = 1 - a;
    m = multiplyMatrix(m, [
      inv + a * r * LUM_R, a * r * LUM_G, a * r * LUM_B, 0, 0,
      a * g * LUM_R, inv + a * g * LUM_G, a * g * LUM_B, 0, 0,
      a * b * LUM_R, a * b * LUM_G, inv + a * b * LUM_B, 0, 0,
      0, 0, 0, 1, 0,
    ]);
  }
  if (contrast) {
    // adjustContrast(contrast / 100)
    const c = contrast / 100 + 1;
    const o = 128 * (1 - c);
    m = multiplyMatrix(m, [c, 0, 0, 0, o, 0, c, 0, 0, o, 0, 0, c, 0, o, 0, 0, 0, 1, 0]);
  }
  if (saturation) {
    // adjustSaturation(saturation / 100 + 1)
    const sv = saturation / 100 + 1;
    const inv = 1 - sv;
    const ir = inv * LUM_R;
    const ig = inv * LUM_G;
    const ib = inv * LUM_B;
    m = multiplyMatrix(m, [ir + sv, ig, ib, 0, 0, ir, ig + sv, ib, 0, 0, ir, ig, ib + sv, 0, 0, 0, 0, 0, 1, 0]);
  }
  if (brightness) {
    // adjustBrightness(brightness): a 0-255 offset
    m = multiplyMatrix(m, [1, 0, 0, 0, brightness, 0, 1, 0, 0, brightness, 0, 0, 1, 0, brightness, 0, 0, 0, 1, 0]);
  }
  // Pixi's ColorMatrixFilter takes offsets in normalized 0-1 units.
  m[4] /= 255; m[9] /= 255; m[14] /= 255; m[19] /= 255;
  return m;
}

/**
 * PURE: one pixel through Flash's ColorMatrixFilter, premultiplied in and out (channels 0-1, the
 * matrix's offset column in 0-1 units, as glitchLayerMatrix returns it). The AS3 reference: "The
 * calculations are performed on unmultiplied color values", each result is
 * `a[0]*srcR + a[1]*srcG + a[2]*srcB + a[3]*srcA + a[4]` with the offset in -255..255 on 0-255
 * channels, and Flash keeps every channel in a byte, so each result is clamped to 0-1 before the
 * colour is multiplied by its alpha again (G1171). The flashColorMatrixFilter shaders do the same.
 * @param {number[]} m 4x5 row-major matrix
 * @param {number[]} px premultiplied [r, g, b, a], 0-1
 * @returns {number[]} premultiplied [r, g, b, a], 0-1
 */
export function flashColorMatrixPixel(m, px) {
  let [r, g, b, a] = px;
  if (a > 0) {
    r /= a;
    g /= a;
    b /= a;
  }
  const out = [0, 5, 10, 15].map((i) => Math.min(1, Math.max(0, m[i] * r + m[i + 1] * g + m[i + 2] * b + m[i + 3] * a + m[i + 4])));
  return [out[0] * out[3], out[1] * out[3], out[2] * out[3], out[3]];
}

const COLOUR_MATRIX_GL = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uColorMatrix[20];
void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  if (c.a > 0.0) {
    c.rgb /= c.a;
  }
  vec4 result;
  result.r = uColorMatrix[0] * c.r + uColorMatrix[1] * c.g + uColorMatrix[2] * c.b + uColorMatrix[3] * c.a + uColorMatrix[4];
  result.g = uColorMatrix[5] * c.r + uColorMatrix[6] * c.g + uColorMatrix[7] * c.b + uColorMatrix[8] * c.a + uColorMatrix[9];
  result.b = uColorMatrix[10] * c.r + uColorMatrix[11] * c.g + uColorMatrix[12] * c.b + uColorMatrix[13] * c.a + uColorMatrix[14];
  result.a = uColorMatrix[15] * c.r + uColorMatrix[16] * c.g + uColorMatrix[17] * c.b + uColorMatrix[18] * c.a + uColorMatrix[19];
  result = clamp(result, 0.0, 1.0);
  finalColor = vec4(result.rgb * result.a, result.a);
}`;

const COLOUR_MATRIX_WGSL = `struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};
struct ColorMatrixUniforms {
  uColorMatrix:array<vec4<f32>, 5>,
};
@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> colorMatrixUniforms: ColorMatrixUniforms;
struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
fn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32> {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
  return VSOutput(filterVertexPosition(aPosition), aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw));
}
@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var c = textureSample(uTexture, uSampler, uv);
  if (c.a > 0.0) {
    c = vec4<f32>(c.rgb / c.a, c.a);
  }
  let cm = colorMatrixUniforms.uColorMatrix;
  var result = vec4<f32>(
    cm[0][0] * c.r + cm[0][1] * c.g + cm[0][2] * c.b + cm[0][3] * c.a + cm[1][0],
    cm[1][1] * c.r + cm[1][2] * c.g + cm[1][3] * c.b + cm[2][0] * c.a + cm[2][1],
    cm[2][2] * c.r + cm[2][3] * c.g + cm[3][0] * c.b + cm[3][1] * c.a + cm[3][2],
    cm[3][3] * c.r + cm[4][0] * c.g + cm[4][1] * c.b + cm[4][2] * c.a + cm[4][3],
  );
  result = clamp(result, vec4<f32>(0.0), vec4<f32>(1.0));
  return vec4<f32>(result.rgb * result.a, result.a);
}`;

let colourMatrixPrograms = null;
/**
 * Flash's ColorMatrixFilter (flashColorMatrixPixel) as a Pixi filter, for every layer colour:
 * the street layers, their recolour and blur bakes, signposts, the avatars and entities under the
 * middleground's filter. Pixi 8's ColorMatrixFilter re-applies alpha to the unclamped colour, so a
 * see-through cloud a brightening layer pushes past white kept the overshoot and drew whiter and
 * more solid than in 2012 (G1171: Gummadi Gad's clouds 241,255,255 against the template's
 * 208,224,255). Opaque art is unchanged (the render target clamps it the same). `matrix` reads
 * and sets the 20 numbers, as on Pixi's filter.
 * @param {any} PIXI
 * @param {number[]} matrix 4x5, offsets 0-1
 */
export function flashColorMatrixFilter(PIXI, matrix) {
  if (!colourMatrixPrograms || colourMatrixPrograms.PIXI !== PIXI) {
    colourMatrixPrograms = {
      PIXI,
      gl: PIXI.GlProgram.from({ vertex: PIXI.defaultFilterVert, fragment: COLOUR_MATRIX_GL, name: 'flash-color-matrix' }),
      gpu: PIXI.GpuProgram.from({ vertex: { source: COLOUR_MATRIX_WGSL, entryPoint: 'mainVertex' }, fragment: { source: COLOUR_MATRIX_WGSL, entryPoint: 'mainFragment' } }),
    };
  }
  const uniforms = new PIXI.UniformGroup({ uColorMatrix: { value: IDENTITY.slice(), type: 'f32', size: 20 } });
  const filter = new PIXI.Filter({
    glProgram: colourMatrixPrograms.gl,
    gpuProgram: colourMatrixPrograms.gpu,
    resources: { colorMatrixUniforms: uniforms },
  });
  Object.defineProperty(filter, 'matrix', {
    get: () => uniforms.uniforms.uColorMatrix,
    set: (m) => {
      uniforms.uniforms.uColorMatrix = Array.from(m);
      uniforms.update();
    },
  });
  filter.flashColorMatrix = true;
  if (matrix) filter.matrix = matrix;
  return filter;
}

/**
 * A layer's colour filter (Layer.filtersA, ColorMatrix.getFilter): Flash's colour matrix with the
 * layer's `filters`, or null when they leave the colour alone.
 */
export function colourFilter(PIXI, filters) {
  const matrix = filters ? glitchLayerMatrix(filters) : null;
  if (!matrix) return null;
  const cm = flashColorMatrixFilter(PIXI, matrix);
  cm.glitchFilters = filters;
  return cm;
}

/**
 * The client's layer blur: Layer.as keeps `blur` as an int and gives every deco on the layer
 * BlurFilter(blur, blur, LOW), one box pass each way `blur` stage pixels wide, so 2.186 is 2, and
 * a blur of 1 (or 1.61) draws nothing ("a blur of 1 or less means that the original image is
 * copied as is", the AS3 reference; Ruffle skips those passes). Returns the box width in layer
 * pixels, or 0 for no blur.
 */
export function flashBlurSize(blur) {
  const n = Math.trunc(Number(blur) || 0);
  return n > 1 ? Math.min(n, 255) : 0;
}

/**
 * Weights of one box pass `size` texels wide, centre first: whole texels out to the radius
 * (size - 1) / 2, the last one a fraction, summing to `size` (Ruffle's blur.wgsl). The bake's
 * shader computes the same weights; this copy is for the tests.
 */
export function boxBlurWeights(size) {
  if (!(size > 1)) return [1];
  const r = (size - 1) / 2;
  const out = [1];
  for (let k = 1; r - k + 1 > 0; k += 1) out.push(Math.min(1, r - k + 1));
  return out;
}

/**
 * Texels per layer pixel for a blurred layer's tiles. Flash drew the layers at one pixel per
 * layer pixel and then blurred them, so a box `size` pixels wide leaves nothing finer than about
 * size / 4 pixels: the bake follows the screen's density (renderer.resolution, up to 2) for
 * light blurs and drops to half density for heavy ones, in steps of 2 so tile edges land on
 * whole texels.
 */
export function blurBakeResolution(size, rendererResolution = 1) {
  const want = Math.min(Number(rendererResolution) || 1, 4 / size);
  return want >= 2 ? 2 : want >= 1 ? 1 : 0.5;
}

/** Layer pixels per side of one blurred-layer tile. */
export const BLUR_TILE = 512;
/**
 * Baked blur tiles a street keeps even when they are far off screen: a rebake draws the decos'
 * art again, and re-uploading a 5000 x 1920 blur_landscape_piece cost a 100 ms frame on Dasas
 * Terrace. Past it, tiles culled for RECOLOUR_EVICT_MS are freed, least recently seen first.
 */
export const BLUR_TILE_KEEP_BYTES = 96 * 1024 * 1024;
/** Most memory one street may hold in baked blur tiles: past it, culled tiles go at once. */
export const BLUR_TILE_BUDGET_BYTES = 160 * 1024 * 1024;

/** Layer pixels of clear margin a tile bake needs around its tile for a box `size` wide. */
export function blurTilePad(size) {
  // The box reaches (size - 1) / 2 pixels; one more keeps the RT edge out of reach, and an even
  // count keeps a half-density crop on whole texels.
  return 2 * Math.ceil((Math.ceil(size / 2) + 1) / 2);
}

/**
 * Split a blurred layer into tiles: each BLUR_TILE cell that some deco (grown by `pad`) reaches,
 * cropped to those decos' boxes and snapped to even pixels. `items` keeps the decos in layer
 * order, so a tile draws them in the same z order as the layer.
 * @param {{ x0: number, y0: number, x1: number, y1: number }[]} boxes one per layer child
 */
export function planBlurTiles(boxes, pad, tile = BLUR_TILE) {
  const cells = new Map();
  boxes.forEach((b, index) => {
    if (!b) return;
    const x0 = b.x0 - pad;
    const y0 = b.y0 - pad;
    const x1 = b.x1 + pad;
    const y1 = b.y1 + pad;
    for (let tx = Math.floor(x0 / tile); tx <= Math.floor(x1 / tile); tx += 1) {
      for (let ty = Math.floor(y0 / tile); ty <= Math.floor(y1 / tile); ty += 1) {
        const key = `${tx},${ty}`;
        let cell = cells.get(key);
        if (!cell) cells.set(key, (cell = { tx, ty, items: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }));
        cell.items.push(index);
        cell.x0 = Math.min(cell.x0, x0);
        cell.y0 = Math.min(cell.y0, y0);
        cell.x1 = Math.max(cell.x1, x1);
        cell.y1 = Math.max(cell.y1, y1);
      }
    }
  });
  const even = (v, up) => 2 * (up ? Math.ceil(v / 2) : Math.floor(v / 2));
  const out = [];
  for (const cell of cells.values()) {
    const x = even(Math.max(cell.tx * tile, cell.x0), false);
    const y = even(Math.max(cell.ty * tile, cell.y0), false);
    const w = even(Math.min((cell.tx + 1) * tile, cell.x1), true) - x;
    const h = even(Math.min((cell.ty + 1) * tile, cell.y1), true) - y;
    if (w > 0 && h > 0) out.push({ x, y, w, h, items: cell.items });
  }
  return out;
}

const BOX_BLUR_GL = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
// highp like the default filter vertex shader, which declares uInputSize too (they must match).
uniform highp vec4 uInputSize;
uniform highp vec4 uInputPixel;
uniform highp vec4 uInputClamp;
uniform vec2 uDirection;
uniform float uSize;
void main(void) {
  // uSize is the box width in layer pixels; the filter texture holds uInputPixel.x / uInputSize.x
  // texels per layer pixel.
  float r = (uSize * uInputPixel.x / uInputSize.x - 1.0) * 0.5;
  vec2 stepUv = uDirection * uInputPixel.zw;
  vec4 sum = texture(uTexture, vTextureCoord);
  float total = 1.0;
  for (int i = 1; i <= 8; i++) {
    float k = float(i);
    float w = clamp(r - k + 1.0, 0.0, 1.0);
    if (w <= 0.0) break;
    sum += texture(uTexture, clamp(vTextureCoord + stepUv * k, uInputClamp.xy, uInputClamp.zw)) * w;
    sum += texture(uTexture, clamp(vTextureCoord - stepUv * k, uInputClamp.xy, uInputClamp.zw)) * w;
    total += 2.0 * w;
  }
  finalColor = sum / total;
}`;

const BOX_BLUR_WGSL = `struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};
struct BoxUniforms {
  uDirection:vec2<f32>,
  uSize:f32,
};
@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> boxUniforms: BoxUniforms;
struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
fn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32> {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
  return VSOutput(filterVertexPosition(aPosition), aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw));
}
@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let r = (boxUniforms.uSize * gfu.uInputPixel.x / gfu.uInputSize.x - 1.0) * 0.5;
  let stepUv = boxUniforms.uDirection * gfu.uInputPixel.zw;
  var sum = textureSampleLevel(uTexture, uSampler, uv, 0.0);
  var total = 1.0;
  for (var i = 1; i <= 8; i++) {
    let k = f32(i);
    let w = clamp(r - k + 1.0, 0.0, 1.0);
    if (w <= 0.0) { break; }
    sum += textureSampleLevel(uTexture, uSampler, clamp(uv + stepUv * k, gfu.uInputClamp.xy, gfu.uInputClamp.zw), 0.0) * w;
    sum += textureSampleLevel(uTexture, uSampler, clamp(uv - stepUv * k, gfu.uInputClamp.xy, gfu.uInputClamp.zw), 0.0) * w;
    total += 2.0 * w;
  }
  return sum / total;
}`;

let boxPrograms = null;
/**
 * One pass of Flash's LOW-quality BlurFilter: a box `size` layer pixels wide along one axis. The
 * shader reaches 8 texels a side, a box 17 texels wide: blurBakeResolution keeps the streets'
 * blurs (2 to 10) at 5 texels or fewer.
 */
export function flashBoxBlurFilter(PIXI, size, horizontal) {
  if (!boxPrograms || boxPrograms.PIXI !== PIXI) {
    boxPrograms = {
      PIXI,
      gl: PIXI.GlProgram.from({ vertex: PIXI.defaultFilterVert, fragment: BOX_BLUR_GL, name: 'flash-box-blur' }),
      gpu: PIXI.GpuProgram.from({ vertex: { source: BOX_BLUR_WGSL, entryPoint: 'mainVertex' }, fragment: { source: BOX_BLUR_WGSL, entryPoint: 'mainFragment' } }),
    };
  }
  return new PIXI.Filter({
    glProgram: boxPrograms.gl,
    gpuProgram: boxPrograms.gpu,
    resources: {
      boxUniforms: new PIXI.UniformGroup({
        uDirection: { value: horizontal ? [1, 0] : [0, 1], type: 'vec2<f32>' },
        uSize: { value: size, type: 'f32' },
      }),
    },
    // Even, like the tiles' pad: an odd padding at half density put the filter's texture half a
    // texel off the tile's and resampled it.
    padding: blurTilePad(size),
    resolution: 'inherit',
  });
}

/** A layer child's box in layer coordinates (sprites by their texture, anything else by its bounds). */
function childBox(PIXI, child) {
  if (child instanceof PIXI.Sprite) return decoBox(child);
  const b = child.getLocalBounds();
  if (!(b.width > 0 && b.height > 0)) return null;
  return { x0: child.x + b.x, y0: child.y + b.y, x1: child.x + b.x + b.width, y1: child.y + b.y + b.height };
}

/**
 * Blurred layers are static, so bake colour + blur once instead of filtering a street-wide layer
 * every frame. Each deco stays at its own art's sharpness: the layer is cut into BLUR_TILE tiles
 * (only where decos are), and a tile is baked at blurBakeResolution, padded so the box reaches
 * across tile edges, when the camera first comes near it (cullDecos), and freed again once it has
 * been far off screen for RECOLOUR_EVICT_MS and the street holds more than BLUR_TILE_KEEP_BYTES. Bakes cover the decos' own boxes, so tall art is not
 * clipped (Pixi's cacheAsBitmap clipped filters to the screen and let the cut edges slide with
 * parallax). A layer that is ready before anything culls it (a strip render) bakes every tile.
 * The old single bake of the whole layer at half resolution, scaled up on screen, smeared a
 * blur of 1 (none in the client) into unreadable signs (Surveyor's Stroll's clipboard).
 * Decos that play (G435, js/deco-anim.js) stay out of the tiles, since a bake is one frame and the
 * client blurred its layers live: each is drawn live through the layer's colour and box blur at the
 * bake's density (cheap: the blur leaves nothing finer anyway), and the baked decos are split into
 * bands at them (decos under the first, between two, over the last), each band its own tiles, so
 * the layer keeps its z order. Vivara's stars_fade (on a blur 7 layer) twinkles this way.
 */
function bakeBlurredLayer(lc, size, colour, state) {
  const { PIXI, renderer } = state;
  const bases = new Set();
  for (const child of lc.children) {
    const base = child.texture?.source;
    if (base && !isLoaded(base)) bases.add(base);
  }
  const ready = () => {
    if (lc.destroyed || !lc.children.length) return;
    const t0 = performance.now();
    const res = blurBakeResolution(size, streetBakeResolution(renderer, state.cap));
    const pad = blurTilePad(size);
    const decos = lc.removeChildren();
    // Decos that play (js/deco-anim.js) cannot sit in a bake: they stay live, drawn through the
    // layer's colour and blur at the bake's density, and the baked decos are cut into bands at
    // them (under, between, over) so the layer's z order holds.
    const order = decos.map((child, i) => ({ child, i })).sort((a, b) => (a.child.zIndex || 0) - (b.child.zIndex || 0) || a.i - b.i);
    const live = [];
    const bands = [[]];
    for (const { child } of order) {
      if (child.decoAnim) {
        live.push(child);
        bands.push([]);
      } else {
        bands[bands.length - 1].push(child);
      }
    }
    // The decos stay in the layer, hidden, so features that find one by id (location events,
    // newxp sign labels) still see its parent chain; a tile redraws when one of its decos is
    // shown, hidden, faded or tinted (refreshBlurTiles).
    const parked = new PIXI.Container();
    parked.visible = false;
    parked.label = 'blur-decos';
    for (const child of decos) {
      if (child.decoAnim) continue;
      child.culled = false;
      parked.addChild(child);
    }
    const layer = {
      lc,
      size,
      res,
      pad,
      parked,
      filters: [...(colour ? [colour] : []), flashBoxBlurFilter(PIXI, size, true), flashBoxBlurFilter(PIXI, size, false)],
      tiles: [],
    };
    bands.forEach((band, k) => {
      const boxes = band.map((child) => childBox(PIXI, child));
      for (const plan of planBlurTiles(boxes, pad)) {
        const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
        spr.x = plan.x;
        spr.y = plan.y;
        spr.visible = false;
        if (live.length) spr.zIndex = 2 * k;
        const tile = { ...plan, items: plan.items.map((i) => band[i]), layer, sprite: spr, texture: null, bytes: 0, seen: 0 };
        spr.blurTile = tile;
        layer.tiles.push(tile);
        lc.addChild(spr);
      }
    });
    if (live.length) {
      const liveFilters = [...(colour ? [colourFilter(PIXI, colour.glitchFilters)] : []), flashBoxBlurFilter(PIXI, size, true), flashBoxBlurFilter(PIXI, size, false)];
      for (const filter of liveFilters) filter.resolution = res;
      layer.live = live;
      live.forEach((child, k) => {
        child.zIndex = 2 * k + 1;
        child.filters = liveFilters;
        lc.addChild(child);
      });
    }
    lc.addChild(parked);
    lc.filters = null;
    lc.blurLayer = layer;
    // Upload the decos' art now, while the street loads, as the old whole-layer bake did: a
    // first upload in a tile bake mid-walk cost a 100 ms frame on Dasas Terrace.
    const sources = new Set(decos.filter((child) => !child.decoAnim).map((child) => child.texture?.source).filter((source) => source && isLoaded(source)));
    for (const source of sources) {
      try {
        renderer.texture?.initSource?.(source);
      } catch { /* a lost context uploads on first draw instead */ }
    }
    state.layers.push(layer);
    state.tiles += layer.tiles.length;
    state.planMs += performance.now() - t0;
    state.dirty = true;
    // Nothing has culled this street yet (a one-off render): bake it all now.
    setTimeout(() => {
      if (state.culled || lc.destroyed) return;
      state.eager += 1;
      for (const tile of layer.tiles) bakeBlurTile(tile, state);
    }, 250);
  };
  if (!bases.size) {
    ready();
    return;
  }
  let pending = bases.size;
  const done = () => {
    pending -= 1;
    if (pending === 0) ready();
  };
  for (const base of bases) {
    onLoaded(base, done);
    onFailed(base, done);
  }
}

/** Bake one blur tile: its decos through the layer's colour and box blur, cropped to the tile. */
function bakeBlurTile(tile, state) {
  if (tile.texture || tile.sprite.destroyed) return;
  const { PIXI, renderer } = state;
  const t0 = performance.now();
  const { pad, res, filters, parked } = tile.layer;
  const inner = new PIXI.Container();
  inner.sortableChildren = true;
  inner.x = pad - tile.x;
  inner.y = pad - tile.y;
  for (const child of tile.items) inner.addChild(child);
  const holder = new PIXI.Container();
  holder.addChild(inner);
  holder.filters = filters;
  const baked = renderer.generateTexture({
    target: holder,
    frame: new PIXI.Rectangle(0, 0, tile.w + pad * 2, tile.h + pad * 2),
    resolution: res,
  });
  for (const child of tile.items) parked.addChild(child);
  tile.look = tileLook(tile);
  holder.filters = null;
  holder.destroy({ children: true });
  trimTexturePool(PIXI);
  // The padding stays in the texture: the crop's linear sampling reads the neighbour's blur.
  tile.texture = new PIXI.Texture({ source: baked.source, frame: new PIXI.Rectangle(pad, pad, tile.w, tile.h) });
  tile.bytes = baked.source.pixelWidth * baked.source.pixelHeight * 4;
  tile.sprite.texture = tile.texture;
  tile.sprite.visible = true;
  tile.seen = performance.now();
  state.bytes += tile.bytes;
  state.peakBytes = Math.max(state.peakBytes, state.bytes);
  state.bakes += 1;
  state.bakeMs += performance.now() - t0;
  if (state.bytes > BLUR_TILE_BUDGET_BYTES) evictBlurTiles(state, tile.seen, true);
}

/** What a tile's bake depends on beyond its decos' places: their visibility, alpha and tint. */
function tileLook(tile) {
  let look = 0;
  for (const child of tile.items) {
    look = (look * 31 + (child.visible ? 1 + Math.round(child.alpha * 255) : 0)) % 2147483647;
    look = (look * 31 + (child.tint ?? 0xffffff)) % 2147483647;
  }
  return look;
}

/** Bake again any tile near the camera whose decos changed since its bake (a location event). */
function refreshBlurTiles(state) {
  for (const layer of state.layers) {
    for (const tile of layer.tiles) {
      if (!tile.texture || tile.sprite.culled || tileLook(tile) === tile.look) continue;
      freeBlurTile(tile, state);
      state.redraws += 1;
      bakeBlurTile(tile, state);
    }
  }
}

function freeBlurTile(tile, state) {
  if (!tile.sprite.destroyed) {
    tile.sprite.texture = state.PIXI.Texture.EMPTY;
    tile.sprite.visible = false;
  }
  tile.texture.destroy(true);
  tile.texture = null;
  state.bytes -= tile.bytes;
  tile.bytes = 0;
}

/**
 * MINIMAP (#561): the street map draws every layer of the whole street at once, but a blurred
 * layer's tiles are baked only as the camera nears them (and freed once far off), and an unbaked
 * tile draws nothing: the map showed the far forest only around where you had been, the sky's
 * gradient in a sharp-edged box everywhere else (Ramyeon Kon). Bake every tile that has no
 * texture now (`bake`), for a snapshot taken with the layers unculled; the returned function,
 * called once the snapshot is done and the cull put back, frees again (`free`) those of them
 * that are culled, so the street's tile memory stays what the camera needs.
 */
export function bakeMissingBlurTiles(state, bake = bakeBlurTile, free = freeBlurTile) {
  const fresh = [];
  for (const layer of state?.layers || []) {
    for (const tile of layer.tiles || []) {
      if (tile.texture || tile.sprite?.destroyed) continue;
      bake(tile, state);
      if (tile.texture) fresh.push(tile);
    }
  }
  return () => {
    for (const tile of fresh) if (tile.texture && tile.sprite?.culled) free(tile, state);
  };
}

/**
 * Which baked blur tiles to free, least recently seen first, while the street holds more than
 * `keep` bytes: tiles culled for RECOLOUR_EVICT_MS, or with `squeeze` (over `budget`) any culled
 * tile, down to the budget. A tile near the camera is never freed.
 * @param {{ texture: any, culled: boolean, seen: number, bytes: number }[]} tiles
 */
export function pickBlurTilesToFree(tiles, { now, bytes = 0, keep = BLUR_TILE_KEEP_BYTES, budget = BLUR_TILE_BUDGET_BYTES, squeeze = false }) {
  const floor = squeeze ? budget : keep;
  if (bytes <= floor) return [];
  const idle = tiles
    .filter((tile) => tile.texture && tile.culled && (squeeze || now - tile.seen >= RECOLOUR_EVICT_MS))
    .sort((a, b) => a.seen - b.seen);
  const out = [];
  let left = bytes;
  for (const tile of idle) {
    if (left <= floor) break;
    out.push(tile);
    left -= tile.bytes;
  }
  return out;
}

/** Free the blur tiles pickBlurTilesToFree picks; `squeeze` when the street is over budget. */
function evictBlurTiles(state, now, squeeze = false) {
  const tiles = [];
  for (const layer of state.layers) {
    for (const tile of layer.tiles) tiles.push({ tile, texture: tile.texture, culled: tile.sprite.culled, seen: tile.seen, bytes: tile.bytes });
  }
  for (const pick of pickBlurTilesToFree(tiles, { now, bytes: state.bytes, squeeze })) {
    freeBlurTile(pick.tile, state);
    state.evictions += 1;
  }
}

/**
 * Most memory one street may spend on recoloured deco textures, counted at the decos' logical
 * size (4 bytes per 2x-art pixel): a 3x deco (js/deco-hires.js) costs 2.25 times this on the GPU,
 * but takes no more of the budget, so Retina screens keep every layer baked instead of falling
 * back to a live filter.
 */
export const RECOLOUR_BUDGET_BYTES = 192 * 1024 * 1024;

/**
 * Budget bytes for a deco texture: its logical size, whatever resolution its file has, or its
 * pixels when it has fewer (a deco's frame strip drawn below 1 texel per logical px, G435, whose
 * logical size is every frame side by side at the still's size).
 */
export function recolourBudgetBytes(base) {
  const logical = Math.ceil(base.width) * Math.ceil(base.height) * 4;
  const pixels = base.pixelWidth > 0 && base.pixelHeight > 0 ? base.pixelWidth * base.pixelHeight * 4 : logical;
  return Math.min(logical, pixels);
}

/** A recoloured texture nobody has been near for this long is freed. */
export const RECOLOUR_EVICT_MS = 12000;

let poolTrim = null;
/**
 * Bakes leave their filter scratch textures (often 2048x4096) in Pixi's
 * TexturePool for good; free the idle ones once a burst of bakes is done.
 */
function trimTexturePool(PIXI) {
  if (poolTrim || !PIXI.TexturePool?.clear) return;
  poolTrim = setTimeout(() => {
    poolTrim = null;
    PIXI.TexturePool.clear(true);
  }, 250);
}

/**
 * The resolution a recoloured copy is baked at: its art's, but no more than the device's render
 * cap (`cap`, js/render-density.js resolutionCap). A phone draws at 1 backing px per view px, so a
 * 2x deco's copy at 2 held four times the pixels it can show (#284: Froughtful Fen's copies took
 * 237 MB of GPU memory at iPhone size, 53 MB at 1). A computer's cap is 4: its copies are as before.
 */
export function recolourBakeResolution(artResolution, cap = Infinity) {
  const art = Number(artResolution) > 0 ? Number(artResolution) : 1;
  const top = Number(cap) >= 1 ? Number(cap) : Infinity;
  return Math.min(art, top);
}

/**
 * PHONE ZOOM SHARPNESS (Austin 2026-11-13): the resolution a street's own bakes and rasters are made
 * at (blurred layers, the ground skirt, edge mirrors, sharp deco copies, animated decos): the
 * renderer's, but no more than the street's bake cap (buildStreetView opts.bakeResolutionCap, the
 * device's render cap). These textures span the whole street, so they grow with the square of the
 * resolution; a zoomed-in phone raises its renderer's resolution for the screen (js/render-density.js
 * phoneZoomResolution) but keeps these at its cap of 1 (WebKit at iPhone size: Ferncaster End to
 * Froughtful Fen peaked at 1.6-1.8 GB with them following, over the 1.5 GB a tab can take). A
 * computer's cap (4) is never under its resolution: unchanged there.
 */
export function streetBakeResolution(renderer, cap = Infinity) {
  const r = Number(renderer?.resolution) > 0 ? Number(renderer.resolution) : 1;
  const top = Number(cap) >= 1 ? Number(cap) : Infinity;
  return Math.min(r, top);
}

/**
 * Render one deco texture through the layer's colour matrix, at recolourBakeResolution. The decos
 * draw the copy, so the original's GPU copy goes at once (#284): Pixi's texture GC kept it 20 s,
 * so a street whose every layer is coloured (Froughtful Fen) held its art twice on arrival. A
 * rebake uploads it again from the image js/textures.js keeps; only an image source is unloaded
 * (a render texture has no other copy).
 */
function bakeRecolour(PIXI, renderer, base, colour, cap = Infinity) {
  trimTexturePool(PIXI);
  const holder = new PIXI.Sprite(frameTexture(base));
  holder.filters = [colour];
  const texture = renderer.generateTexture({
    target: holder,
    frame: new PIXI.Rectangle(0, 0, base.width, base.height),
    resolution: recolourBakeResolution(base.resolution, cap),
  });
  holder.texture.destroy();
  holder.filters = null;
  holder.destroy();
  if (PIXI.ImageSource && base instanceof PIXI.ImageSource && !base.destroyed) base.unload();
  return texture;
}

/**
 * Static deco layers take the client's colour matrix once per texture instead
 * of a full-screen filter pass per layer every frame (14-20 passes on the
 * busiest streets, at the screen's full density). The matrix is affine, so
 * recolouring each deco before compositing gives the same pixels as filtering
 * the composited layer wherever it is opaque, at the texture's own resolution.
 * Layers holding anything but sprites, or past the street's memory budget,
 * keep the live filter. Each recoloured texture remembers its decos, so
 * cullDecos can free it while they are all far off screen and bake it again
 * (see evictRecolours / ensureRecoloured) when one comes back.
 * A deco that plays (js/deco-anim.js) is recoloured by its whole strip, once, and draws its frames
 * from that copy (setDecoTexture; recolourAnim when the strip arrives after the bake).
 * @param {{ textures: Map<string, any>, entries: Map<string, any>, bytes: number }} cache per street
 */
function bakeLayerColour(PIXI, renderer, lc, colour, cache) {
  const sprites = lc.children;
  if (!sprites.length || sprites.some((child) => !(child instanceof PIXI.Sprite))) return;
  const key = colour.matrix.join(',');
  const bake = () => {
    if (lc.destroyed) return;
    let bytes = 0;
    const fresh = new Set();
    for (const spr of sprites) {
      const base = lookOf(spr).source;
      if (!isLoaded(lookOf(spr)) || cache.textures.has(`${key}|${base.uid}`) || fresh.has(base)) continue;
      fresh.add(base);
      bytes += recolourBudgetBytes(base);
    }
    if (cache.bytes + bytes > RECOLOUR_BUDGET_BYTES) return;
    cache.bytes += bytes;
    const now = performance.now();
    for (const spr of sprites) {
      const original = lookOf(spr);
      if (!isLoaded(original)) continue;
      recolourDeco(PIXI, renderer, cache, spr, original, colour, key, now);
    }
    lc.filters = null;
    lc.recoloured = { colour, key };
  };
  const pending = new Set(sprites.map((spr) => spr.texture.source).filter((base) => !isLoaded(base)));
  if (!pending.size) {
    bake();
    return;
  }
  let left = pending.size;
  const done = () => {
    left -= 1;
    if (left === 0) bake();
  };
  for (const base of pending) {
    onLoaded(base, done);
    onFailed(base, done);
  }
}

/** The whole texture a deco's look comes from: a playing deco's strip, else its texture. */
function lookOf(spr) {
  return spr.decoAnim?.ready ? spr.decoAnim.original : spr.texture;
}

/** Point a deco at the layer colour's bake of `original` (baked here once per texture). */
function recolourDeco(PIXI, renderer, cache, spr, original, colour, key, now) {
  const base = original.source;
  const id = `${key}|${base.uid}`;
  let entry = cache.entries.get(id);
  if (!entry) {
    entry = { id, base, colour, texture: bakeRecolour(PIXI, renderer, base, colour, cache.resolutionCap), users: new Set(), seen: now, bytes: recolourBudgetBytes(base) };
    cache.entries.set(id, entry);
    cache.textures.set(id, entry.texture);
  }
  spr.recolour?.entry.users.delete(spr);
  entry.users.add(spr);
  spr.recolour = { entry, original };
  if (!entry.texture) ensureRecoloured(PIXI, renderer, cache, spr);
  else setDecoTexture(PIXI, spr, entry.texture);
}

/**
 * A playing deco's strip arrived on a recoloured layer: bake the strip through the layer's colour
 * (within the street's budget), else it stays on its recoloured still. Returns true when handled.
 */
function recolourAnim(PIXI, renderer, cache, spr, lc) {
  const rc = lc.recoloured;
  if (!rc || !renderer || lc.destroyed) return false;
  const base = spr.decoAnim.original.source;
  if (!cache.textures.has(`${rc.key}|${base.uid}`)) {
    const bytes = recolourBudgetBytes(base);
    if (cache.bytes + bytes > RECOLOUR_BUDGET_BYTES) {
      spr.decoAnim.ready = false;
      return true;
    }
    cache.bytes += bytes;
  }
  recolourDeco(PIXI, renderer, cache, spr, spr.decoAnim.original, rc.colour, rc.key, performance.now());
  return true;
}

/** Bake a freed recoloured texture again for a deco coming into view. */
function ensureRecoloured(PIXI, renderer, cache, spr) {
  const entry = spr.recolour?.entry;
  if (!entry || entry.texture) return;
  entry.texture = bakeRecolour(PIXI, renderer, entry.base, entry.colour, cache.resolutionCap);
  cache.textures.set(entry.id, entry.texture);
  cache.rebakes += 1;
  for (const user of entry.users) if (!user.destroyed) setDecoTexture(PIXI, user, entry.texture);
}

/**
 * Point a deco at another copy of its art (a sharp copy at another resolution). A recoloured
 * deco keeps its colour: its shared bake is redone from the new copy.
 */
function swapDecoTexture(PIXI, renderer, cache, spr, texture) {
  const rc = spr.recolour;
  if (!rc) {
    spr.texture = texture;
    return;
  }
  rc.original = texture;
  const entry = rc.entry;
  if (entry.base !== texture.source) {
    entry.base = texture.source;
    if (entry.texture) {
      entry.texture.destroy(true);
      entry.texture = null;
      cache.textures.delete(entry.id);
    }
  }
  if (!entry.texture) ensureRecoloured(PIXI, renderer, cache, spr);
  else spr.texture = entry.texture;
}

/** The recolour cache's entries, the baked ones and their GPU bytes (at their real resolution). */
export function recolourStats(cache) {
  let baked = 0;
  let gpuBytes = 0;
  for (const entry of cache.entries.values()) {
    if (!entry.texture) continue;
    baked += 1;
    const src = entry.texture.source;
    gpuBytes += (src?.pixelWidth || 0) * (src?.pixelHeight || 0) * 4;
  }
  return { entries: cache.entries.size, baked, gpuMB: +(gpuBytes / 1048576).toFixed(1), budgetMB: +(cache.bytes / 1048576).toFixed(1), evictions: cache.evictions, rebakes: cache.rebakes };
}

/** Free recoloured textures whose decos have all been culled for a while. */
function evictRecolours(cache, now) {
  for (const entry of cache.entries.values()) {
    if (!entry.texture) continue;
    let near = false;
    for (const user of entry.users) {
      if (!user.destroyed && !user.culled) {
        near = true;
        break;
      }
    }
    if (near) {
      entry.seen = now;
      continue;
    }
    if (now - entry.seen < RECOLOUR_EVICT_MS) continue;
    // The decos are culled: park them on their (shared) original texture.
    for (const user of entry.users) if (!user.destroyed) setDecoTexture(cache.PIXI, user, user.recolour.original);
    entry.texture.destroy(true);
    entry.texture = null;
    cache.textures.delete(entry.id);
    cache.evictions += 1;
  }
}

/**
 * PURE (#348): the colour at the top of a street's sky, as CSS: its gradient's top colour, or the
 * painted fallback sky's top (0x8eb8d8) on a street without one. A view held under the window's
 * height (a portrait phone on a short street) paints the band above the canvas with it.
 */
export function stageSkyColour(street) {
  const top = String(street?.gradient?.top || '').replace(/^(#|0x)/i, '');
  return /^[0-9a-f]{6}$/i.test(top) ? `#${top.toLowerCase()}` : '#8eb8d8';
}

/**
 * PURE (G1167): the layer a street's sky gradient is painted on, the backmost drawn layer, as an
 * index into street.layers (-1 when it has none). Glitch drew the gradient into the graphics of the
 * first LayerRenderer (LocationView.as 101-106 fastUpdateGradient: _layerRenderers[0], the layers
 * sorted by z, LocationViewBuilder 82-89), at that layer's own w x h (DrawUtil.drawBGForLoc), so it
 * moved with that layer's parallax. Hidden layers never draw (layerIsDrawn); a tie keeps the first.
 */
export function skyGradientLayerIndex(layers) {
  let best = -1;
  let bestZ = Infinity;
  (layers || []).forEach((layer, i) => {
    if (!layerIsDrawn(layer)) return;
    const z = layer.z ?? i;
    if (z < bestZ) {
      best = i;
      bestZ = z;
    }
  });
  return best;
}

/**
 * PURE (G1167): where the sky gradient runs, in the street view's coordinates. `layerTop` is the
 * backmost layer's top (its container's y after updateParallax) and `layerH` its height; the view
 * is `viewTop` to `viewTop + viewH` (the canvas, the pack's band included).
 *
 * Glitch: DrawUtil.drawVerticalGradientBG fills 0..h of the layer, the top colour at the layer's
 * top and the bottom colour at its bottom (createGradientBox(w, h, PI/2), ratios 0..255). The view
 * never showed past it: TSMainView.resizeToStage 1245-1257 held the view to the smallest layer's
 * height and LocationRenderer.recomputeParallax kept every layer over the view. The remake's view
 * can show past it (an upright phone's camera over the street's top, the pack's band under the
 * view, the 408 px view floor on a shorter scene): the gradient's own end colours carry on there
 * (Flash's SpreadMethod.PAD), the top colour above the layer and the bottom colour below it.
 *
 * Returns the gradient's span `{ y, h }`, the top colour's cap `{ y, h }` (null when the view does
 * not reach above the layer) and the bottom colour's base `{ y, h }` (the whole view, under both).
 * The cap is at least `capMin` tall, reaching down under the gradient, so it is never a long thin
 * quad (js/wide-quads.js: the GPU can drop half of one).
 */
export function skyGradientPlacement(layerTop, layerH, viewTop, viewH, capMin = 0) {
  const top = Number(layerTop) || 0;
  const h = Math.max(1, Number(layerH) || 1);
  const vTop = Number(viewTop) || 0;
  const vH = Math.max(0, Number(viewH) || 0);
  let cap = null;
  if (vTop < top) {
    const y = Math.min(vTop, top - Math.max(0, capMin));
    cap = { y, h: top - y + 1 };
  }
  return { gradient: { y: top, h }, cap, base: { y: vTop, h: vH } };
}

/**
 * PURE (Austin's iPhone 2026-11-24): the part of a view (top `viewTop`, `viewH` tall) below the
 * street's bottom `streetH`, `{ y, h }`, or null when the view does not reach it. Painted in the
 * street's ground colour behind every layer, so a camera past the bottom never shows the sky's.
 */
export function groundBelowSpan(streetH, viewTop, viewH) {
  const top = Math.max(Number(viewTop) || 0, Number(streetH) || 0);
  const h = (Number(viewTop) || 0) + Math.max(0, Number(viewH) || 0) - top;
  return h > 0 ? { y: top, h } : null;
}

/**
 * PURE (G1167): the sky's colour at street-view y, as 0xrrggbb: the gradient's top colour above the
 * layer, its bottom colour below, a straight blend between (what Flash's linear fill draws).
 */
export function skyColourAt(top, bottom, layerTop, layerH, y) {
  const a = parseInt(String(top).replace(/^(#|0x)/i, ''), 16) || 0;
  const b = parseInt(String(bottom).replace(/^(#|0x)/i, ''), 16) || 0;
  const t = Math.min(1, Math.max(0, (y - layerTop) / Math.max(1, layerH)));
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    out |= Math.round(ca + (cb - ca) * t) << shift;
  }
  return out;
}

/** Vertical sky gradient texture from the location's top/bottom colours. */
function gradientTexture(PIXI, top, bottom) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, `#${top}`);
  grad.addColorStop(1, `#${bottom}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  return PIXI.Texture.from(canvas);
}

/**
 * Parallax offset for a non-middleground layer (client LocationRenderer
 * recomputeParallax): the layer slides from its left/top edge to its
 * right/bottom edge as the camera crosses the street.
 *
 * The client's camera never left the street (CameraMan.as 451-453 bounds it at the location's
 * bottom). The remake's camera runs past the declared bottom (and above the top, topSlack) to
 * frame low platforms above the pack (cameraWorldHeightForGround). Past either edge every layer
 * holds still against the ground, where the slide left it at the edge: the slide is taken at the
 * camera clamped to the street (0..maxY) and the layer stays put in world space. A same-size
 * layer (Hechey Track's `middleplus` dirt) is at 0 either way. #483: carrying the slide on along
 * the same line slid Sylvan Grove's 850 px front dirt (on a 1000 px street) down off the grass
 * and showed sky between the ground and the bottom rock strip; a layer taller than its street
 * rose off the bottom the same way. The ground skirt (skirtGroundOffset) draws each layer at
 * H - h, where this leaves it.
 *
 * The client floored each layer's slide to a whole pixel on its own. At the remake's Retina
 * densities that is a 2-2.5 device px step on a different frame for every layer, so the layers
 * wobbled against each other while the camera eased to a stop (FEEL, js/camera-feel.js). The
 * offset is exact here; updateParallax snaps it to device pixels only when the camera rests.
 */
export function parallaxLayerOffset(layer, camX, camY, vpW, vpH, streetW, streetH) {
  const maxX = streetW - vpW;
  const maxY = streetH - vpH;
  return {
    x: maxX > 0 ? camX + (camX / maxX) * (vpW - layer.w) : parallaxRestX(layer.w, streetW),
    y: maxY > 0 ? parallaxSlideY(camY, maxY, vpH, layer.h) : parallaxRestY(layer.h, streetH),
  };
}

/** The slide down a street taller than the view (maxY > 0), held at the street's top and bottom (#483). */
function parallaxSlideY(camY, maxY, vpH, layerH) {
  const at = Math.min(maxY, Math.max(0, camY));
  return at + (at / maxY) * (vpH - layerH);
}

/**
 * PURE (report #209, Grimssea Hollow): where a layer sits on a street narrower than the view.
 * The camera cannot slide, so game.js centres the street (cameraTargetForPlayer: camX = -spare/2)
 * with the middleground at 0. Each layer is centred on the street, as the slide puts it with the
 * camera mid-street ((W - w) / 2), so a street-sized layer stays on the middleground at 0. The
 * old rule (percX 1, the view's right edge) drew Grimssea's bark and shelves spare/2 to the right
 * of the ladders and platforms.
 */
export function parallaxRestX(layerW, streetW) {
  return (streetW - layerW) / 2;
}

/**
 * PURE (report #209): the same on a street shorter than the view. The camera sits at (or near) the
 * street's top and shows all of it, so each layer's bottom sits on the street's bottom (H - h), where
 * the slide leaves it with the camera at the bottom; a street-sized layer stays at 0. The old rule
 * (percY 1 against the view's bottom edge) carried a layer down by the spare and moved it with the camera.
 */
export function parallaxRestY(layerH, streetH) {
  return streetH - layerH;
}

/**
 * Whether a street layer draws in front of the avatars. The client sorts a location's layers
 * by z (LocationViewBuilder.buildLocationView 82-89, SortTools.layerZSort) and adds one
 * LayerRenderer per layer to the LocationRenderer in that order (LocationViewBuilder 104-107).
 * Avatars, NPCs and items live inside the MiddleGroundRenderer, above every middleground deco
 * (LayerRenderer.setupEndShapes 63-76 and addDeco 200-211 put decos under the DECO marker;
 * MiddleGroundRenderer.setupEndShapes 111-171 adds the item and avatar holders after it), so
 * each layer whose z is above the middleground's covers them, and the rest sit behind.
 */
export function layerDrawsInFront(layer, index, middleLayerZ) {
  if (!layer || layer.id === 'middleground' || middleLayerZ === null || middleLayerZ === undefined) return false;
  return (layer.z ?? index) > middleLayerZ;
}

/** Layers the editors hid never draw: the regular client splices them (Location.as 541-542). */
export function layerIsDrawn(layer) {
  return !!layer && (layer.id === 'middleground' || layer.hidden !== true);
}

/**
 * PURE (#602): a middleground deco whose whole box (w x h from its bottom centre, turned r degrees
 * about it) lies over the street's top. Glitch never showed one: CameraMan kept the view inside the
 * location's bounds and Tiny Speck's street pictures stopped at the top too (Dust Path 1C's
 * LA51DET7GF42FKO_main). Tiny Speck parked spare art there, such as the heights_topper_wide_1 strip
 * of dirt at -1025, -1021 on 14 Baqala streets (Mart's Way 1, Dust Path 1C). An upright phone's
 * camera rises over the top by the top bar's height (game.js cameraTopSlack, G928) and the loading
 * strips draw a little over it, so the remake leaves these out. `top` is the street's bounds.t.
 */
export function decoWhollyAboveTop(deco, top) {
  if (!deco || !Number.isFinite(top)) return false;
  const w = Math.abs(Number(deco.w) || 0);
  const h = Math.abs(Number(deco.h) || 0);
  const y = Number(deco.y);
  if (!Number.isFinite(y) || !(w > 0 || h > 0)) return false;
  const r = ((Number(deco.r) || 0) * Math.PI) / 180;
  const c = Math.cos(r);
  const sn = Math.sin(r);
  let low = -Infinity;
  for (const [px, py] of [[-w / 2, 0], [w / 2, 0], [-w / 2, -h], [w / 2, -h]]) low = Math.max(low, y + px * sn + py * c);
  return low < top;
}

/** Above every other deco of its layer: the client stacked a signed deco on top (LayerRenderer.as addDeco). */
export const SIGN_DECO_Z = 100000;

/**
 * #570: a signed deco's words as a child of its sprite (so they show, hide, fade and turn with it,
 * DecoRenderer.as 287-322): centred on the deco's middle, wrapped at its width, never stretched by
 * the sprite's size or mirrored by its flip (scaled back each frame, as the art's size can arrive
 * late). The deco goes on top of its layer. False when it has none to print.
 */
function addSignWords(PIXI, spr, deco) {
  const words = signWords(deco);
  if (!words) return false;
  const label = new PIXI.Text({ text: words.text, style: words.style });
  label.resolution = 2;
  label.anchor.set(0.5);
  label.eventMode = 'none';
  label.onRender = () => {
    const sx = spr.scale.x || 1;
    const sy = spr.scale.y || 1;
    label.scale.set(1 / sx, 1 / sy);
    label.y = -(spr.texture?.orig?.height || spr.texture?.height || 0) / 2;
  };
  label.onRender();
  spr.addChild(label);
  spr.signWords = label;
  spr.zIndex = SIGN_DECO_Z + (deco.z || 0);
  return true;
}

function makePlaceholder(PIXI, deco, pos) {
  const g = new PIXI.Graphics();
  const w = deco.w || 48;
  const h = deco.h || 32;
  g.roundRect(-w / 2, -h, w, h, 3).fill({ color: PLACEHOLDER, alpha: 0.45 });
  g.x = pos.x;
  g.y = pos.y;
  g.zIndex = deco.z || 0;
  return g;
}

/**
 * The ground skirt (Austin 2026-11-02, "a nicer fill"). The 2012 client never showed below a
 * street: CameraMan.as 451-453 bounds the camera at limit_b = loc.b - loc_vp_h/2, and its
 * viewport stopped above a separate pack strip (TSMainView.as 1229-1243), as Classic still lays
 * out. The Modern UI's world fills the window and the pack floats over it, so the canvas shows
 * below bounds.b. That strip is filled with the street's own bottom band, mirrored down from the
 * bottom edge (then laid on alternately the right way up and mirrored again, so its rows always
 * meet) and darkening into one colour, so it reads as more ground. Before, the bottom row was
 * stretched down, which drew vertical streaks over a flat band (Cebarkul).
 *
 * The band is short: a 160 px band took in the grass on top of Cebarkul's lowest ledge, its owl
 * and the eyes in its burrows, and the mirror read as a lake's reflection, not as soil (72 still
 * caught the grass).
 */
export const SKIRT_BAND = 56;
/** The darkening runs this deep below the edge; under it the fade colour carries on alone. */
export const SKIRT_FADE_DEPTH = 140;
/** How dark the band's average gets at the skirt's bottom (the street's own ground, deeper). */
export const SKIRT_DEEP_SHADE = 0.55;

/**
 * FLICKER (js/wide-quads.js): `texture` as frame views no longer than a quad as thick as it may
 * run (quadSpans): [{ texture, dx }], dx the piece's x in `texture`. One street-wide band copy
 * or fill lost half its quad on the GPU (the bottom-right wedge on Switchback). New views go on
 * `views`, freed with the strip.
 */
function quadPieceViews(PIXI, texture, views) {
  const spans = quadSpans(0, texture.width, texture.height);
  if (spans.length <= 1) return [{ texture, dx: 0 }];
  return spans.map((s) => {
    const view = new PIXI.Texture({ source: texture.source, frame: new PIXI.Rectangle(texture.frame.x + s.x, texture.frame.y, s.w, texture.height) });
    views.push(view);
    return { texture: view, dx: s.x };
  });
}

/** PURE: how many world px above the street's bottom are mirrored below it (SKIRT_BAND, never more than the skirt or the street). */
export function skirtBandHeight(depth, sourceH) {
  const d = Math.ceil(Number(depth) || 0);
  if (d <= 0) return 0;
  return Math.max(0, Math.min(SKIRT_BAND, d, Math.floor(Number(sourceH) || 0)));
}

/**
 * PURE: the copies of the band down the skirt, from the edge: [{ y, flip }], y the copy's top.
 * The first is mirrored (its bottom row meets the edge), the next the right way up (meeting the
 * first's bottom row), and so on, until the skirt's depth is covered.
 */
export function skirtTiles(depth, band) {
  const d = Math.ceil(Number(depth) || 0);
  const b = Math.floor(Number(band) || 0);
  if (d <= 0 || b <= 0) return [];
  const out = [];
  for (let k = 0; k * b < d; k++) out.push({ y: k * b, flip: k % 2 === 0 });
  return out;
}

/** A layer that slides this far or less against the ground over the whole street goes into the band. */
export const SKIRT_SLIDE_MAX = 160;

/**
 * PURE: where a layer is drawn in the band, or null when it is left out. The middleground and
 * layers with no canvas size use street coordinates, and a parallax layer the street's own size
 * has a zero offset at every camera (parallaxLayerOffset: camX + camX/(W-vpW) x (vpW - W) = 0, and
 * (W - W) / 2 = 0 on a street narrower than the view, parallaxRestX):
 * both are fixed to the ground (Hechey Track's `middleplus` dirt, The Great Hole to Ix's).
 * A layer of another size slides against the ground by W - w over the whole street, and its
 * bottom meets the street's bottom when the camera is at the bottom (y = H - h). One close to the
 * street's size (SKIRT_SLIDE_MAX: Matsya's dark front rocks, 100 px) is drawn where it is with the
 * camera mid-street, so the mirror is off by at most half that slide at the street's ends; it
 * has to be in, or the light layer it hides would show in the mirror. One that slides further
 * (a 6500 px foreground of tall trees on a 6000 px street) is left out: a still copy of it would
 * come apart from it at the seam, and its own art goes on drawing over the skirt.
 */
export function skirtGroundOffset(layer, W, sourceH) {
  if (!layer) return null;
  if (layer.id === 'middleground' || !(layer.w > 0 && layer.h > 0)) return { x: 0, y: 0 };
  const slideX = W - layer.w;
  const slideY = sourceH - layer.h;
  if (Math.abs(slideX) < 1 && Math.abs(slideY) < 1) return { x: 0, y: 0 };
  if (Math.abs(slideX) > SKIRT_SLIDE_MAX || Math.abs(slideY) > SKIRT_SLIDE_MAX / 2) return null;
  return { x: slideX / 2, y: slideY };
}

/**
 * PURE: where a layer is drawn in the band, or null when it is left out: skirtGroundOffset, and
 * (ticket 21) a layer behind the avatars that slides further than that is in too, at its bottom
 * with the camera mid-street. What shows through the ground at the street's bottom edge is that
 * art (Valuka Himsa's red rock, 200 to 800 px narrower than the street, under a ground layer with
 * gaps), so the mirror leaves it out at its peril: a mirror of the ground layers alone was a flat
 * dark block under a hard line. Its copy can be off by half its slide at the street's ends, but it
 * sits under the ground, fades within SKIRT_FADE_DEPTH and never draws over anything. A layer in
 * front that slides far stays out (its own art goes on drawing over the skirt).
 */
export function skirtBandOffset(layer, W, sourceH, inFront = false) {
  const at = skirtGroundOffset(layer, W, sourceH);
  if (at || inFront || !layer) return at;
  return { x: (W - layer.w) / 2, y: sourceH - layer.h };
}

const channels = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const luma = (c) => {
  const [r, g, b] = channels(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** PURE: a colour scaled towards black (k 1 keeps it, 0 is black). */
export function shadeColour(colour, k) {
  const [r, g, b] = channels(colour).map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return (r << 16) | (g << 8) | b;
}

/**
 * PURE: the colour the skirt fades into. The street's gradient bottom when it is darker than its
 * ground (Naraka's black and dark red, a deep sea), else the band's average darkened
 * (SKIRT_DEEP_SHADE): a pale sky bottom under the ground read as the band of sky colour that
 * 989 streets once showed there. No band average (the read failed or found nothing opaque): the
 * gradient bottom darkened (G844), else the fallback, the meadow green (black stays black, ticket 39).
 */
export function skirtFadeColour(bandAverage, gradientBottom, fallback) {
  const sky = Number.isFinite(gradientBottom) ? gradientBottom : null;
  // G844 (#393): a band read that found nothing opaque (a GPU whose off-screen draws come back
  // empty) faded to the raw pale sky; the sky darkened as a band of it would be (black stays black).
  if (!Number.isFinite(bandAverage) && sky !== null) return shadeColour(sky, SKIRT_DEEP_SHADE);
  if (!Number.isFinite(bandAverage)) return Number.isFinite(fallback) ? fallback : 0x6b8f3c;
  const deep = shadeColour(bandAverage, SKIRT_DEEP_SHADE);
  return sky !== null && luma(sky) <= luma(deep) ? sky : deep;
}

/**
 * PURE: the overlays over the mirrored ground, from the seam (at 0) to SKIRT_FADE_DEPTH (at 1):
 * `shade` is a thin black line that softens the mirror line, `fade` the fade colour's opacity,
 * eased so the mirrored ground stays readable at the seam and is gone at the foot.
 */
export function skirtFadeStops() {
  return {
    shade: [{ at: 0, alpha: 0.26 }, { at: 0.02, alpha: 0.12 }, { at: 0.06, alpha: 0 }],
    fade: [{ at: 0, alpha: 0.28 }, { at: 0.12, alpha: 0.55 }, { at: 0.3, alpha: 0.78 }, { at: 0.55, alpha: 0.92 }, { at: 1, alpha: 1 }],
  };
}

/**
 * PURE: the fade over the street's own art below the edge (the middleground's solid copy and the
 * front layers), from where it starts (at 0) to SKIRT_FADE_DEPTH (at 1). Hechey Track's dirt
 * (middleplus) hangs 90 to 210 px below the edge and stopped there in straight lines over the
 * skirt, which is already near its fade colour that deep: a darker box with hard edges
 * (Austin 2026-11-07). None at the edge, so art that crosses it carries on unbroken, then as
 * dark as the skirt's own fade from about halfway down, so where the art ends no edge shows.
 */
export function skirtArtFadeStops() {
  return [{ at: 0, alpha: 0 }, { at: 0.12, alpha: 0.3 }, { at: 0.3, alpha: 0.7 }, { at: 0.55, alpha: 0.92 }, { at: 1, alpha: 1 }];
}

/**
 * The fade (skirtArtFadeStops, then the plain colour) as a texture `w` x `h` with only the
 * opacity of `art` (the art below the edge, `w` x `h`, `start` rows above the fade's start): laid
 * over that art, it darkens the art and nothing beside it (an avatar behind a front layer, the
 * skirt between the art).
 */
function edgeFadeTexture(PIXI, renderer, art, w, h, start, colour, ramp, res) {
  // Pixi's sprite mask keeps its red channel (MaskFilter: masky.r), not its opacity: the art goes
  // white first, at its own opacity.
  const white = PIXI.RenderTexture.create({ width: w, height: h, resolution: res });
  const blank = new PIXI.Container();
  const shape = new PIXI.Sprite(art);
  shape.width = w;
  shape.height = h;
  const whiten = new PIXI.ColorMatrixFilter();
  whiten.matrix = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0];
  whiten.resolution = res;
  shape.filters = [whiten];
  blank.addChild(shape);
  renderer.render({ container: blank, target: white, clear: true });
  blank.destroy({ children: true });
  whiten.destroy();
  const out = PIXI.RenderTexture.create({ width: w, height: h, resolution: res });
  const holder = new PIXI.Container();
  const tint = new PIXI.Container();
  const fade = new PIXI.Sprite(ramp);
  fade.x = 0;
  fade.y = start;
  fade.width = w;
  fade.height = SKIRT_FADE_DEPTH;
  tint.addChild(fade);
  const solidTop = start + SKIRT_FADE_DEPTH;
  if (solidTop < h) tint.addChild(new PIXI.Graphics().rect(0, solidTop, w, h - solidTop).fill(colour));
  const mask = new PIXI.Sprite(white);
  tint.mask = mask;
  holder.addChild(tint, mask);
  renderer.render({ container: holder, target: out, clear: true });
  holder.destroy({ children: true });
  white.destroy(true);
  return out;
}

/** Opacity under which a pixel of the middleground's art below the edge is dropped, and over which it is kept whole. */
export const SKIRT_SOLID_ALPHA = [0.8, 0.88];

/**
 * PURE: what a pixel of the middleground's art below the edge keeps of its opacity `a` (0..1):
 * none under SKIRT_SOLID_ALPHA[0], all over [1], a ramp between, with its colour unchanged.
 * Estevan Meadows' ground slabs hang aprons of 0.4 (0.64 and 0.78 where two or three overlap);
 * Hobak Habitat's rock fills are 0.9.
 */
export function skirtSolidAlpha(a) {
  const [lo, hi] = SKIRT_SOLID_ALPHA;
  return Math.min(1, Math.max(0, (Number(a) - lo) / (hi - lo)));
}

// skirtSolidAlpha as a filter (premultiplied in and out). Pixi's ColorMatrixFilter cannot do it:
// it multiplies the colour by its unclamped alpha row, so a steep ramp brightened solid pixels.
const SOLID_GL = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uSolid;
void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  float k = clamp((c.a - uSolid.x) / (uSolid.y - uSolid.x), 0.0, 1.0);
  finalColor = c.a > 0.0 ? c * (k / c.a) : vec4(0.0);
}`;

const SOLID_WGSL = `struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};
struct SolidUniforms {
  uSolid:vec2<f32>,
};
@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> solidUniforms: SolidUniforms;
struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
fn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32> {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
  return VSOutput(filterVertexPosition(aPosition), aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw));
}
@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = textureSampleLevel(uTexture, uSampler, uv, 0.0);
  let k = clamp((c.a - solidUniforms.uSolid.x) / (solidUniforms.uSolid.y - solidUniforms.uSolid.x), 0.0, 1.0);
  if (c.a <= 0.0) { return vec4<f32>(0.0); }
  return c * (k / c.a);
}`;

let solidPrograms = null;
function skirtSolidFilter(PIXI, resolution) {
  if (!solidPrograms || solidPrograms.PIXI !== PIXI) {
    solidPrograms = {
      PIXI,
      gl: PIXI.GlProgram.from({ vertex: PIXI.defaultFilterVert, fragment: SOLID_GL, name: 'skirt-solid' }),
      gpu: PIXI.GpuProgram.from({ vertex: { source: SOLID_WGSL, entryPoint: 'mainVertex' }, fragment: { source: SOLID_WGSL, entryPoint: 'mainFragment' } }),
    };
  }
  return new PIXI.Filter({
    glProgram: solidPrograms.gl,
    gpuProgram: solidPrograms.gpu,
    resources: { solidUniforms: new PIXI.UniformGroup({ uSolid: { value: [...SKIRT_SOLID_ALPHA], type: 'vec2<f32>' } }) },
    padding: 0,
    resolution,
  });
}

/** A 1 x 64 ramp of one colour at the given stops' opacities. */
function rampTexture(PIXI, colour, stops) {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const [r, g, b] = channels(colour);
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  for (const s of stops) grad.addColorStop(s.at, `rgba(${r},${g},${b},${s.alpha})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1, 64);
  return PIXI.Texture.from(canvas);
}

/** Rows above the edge the middleground's solid copy starts at (see buildGroundSkirt). */
const SOLID_OVERLAP = 2;

/** The mirrored band's texture budget: its resolution drops for a very wide street. */
const SKIRT_BYTES = 24 * 1024 * 1024;

/**
 * Fill the strip under a street's bottom edge (street art ends at bounds.b; the camera can show
 * up to MIN_GROUND_CLEARANCE below it, and the canvas runs on under the overlaid pack). The
 * ground layers' bottom band (skirtBandOffset) is rendered once into one texture per chunk
 * (QUAD_SPAN px, fewer on a small GPU), laid down the skirt (skirtTiles), shaded at the seam and faded
 * into skirtFadeColour, then that colour runs on to the skirt's foot. The strip sits over the
 * middleground with the middleground's solid art below bounds.b copied back on top (its
 * see-through art there is covered), and the front layers' art below bounds.b (The Great Hole to
 * Ix's dirt and trunks) still draws over it. That art, the copy and the front layers', darkens
 * into the same colour as it goes down (skirtArtFadeStops, from `floorBelow` under the edge: the
 * deepest walkable ground there, if any), so where it ends it meets the skirt without an edge.
 * G582: `rightPad` runs the skirt on past the street's right end, the band mirrored there (its
 * last `rightPad` px flipped about the edge), for the strip the camera shows past the end while it
 * keeps the end left of the Social drawer's rail (game.js syncCameraSafeArea).
 */
function buildGroundSkirt(PIXI, renderer, root, grounds, W, sourceH, depthPx, gradientBottom, fallback, fronts = [], floorBelow = 0, rightPad = 0) {
  const depth = Math.ceil(depthPx);
  const main = grounds.find((lc) => lc.label === 'middleground') || grounds[0];
  if (!main || depth <= 0 || W <= 0) return;
  const band = skirtBandHeight(depth, sourceH);
  const fadeStart = Math.max(0, Math.ceil(Number(floorBelow) || 0));
  // What the last build made (G1166: a restored WebGL context empties its render textures, so the
  // skirt is torn down and built again, groundSkirtRebuild).
  let made = null;
  const build = () => {
    if (root.destroyed || grounds.some((lc) => lc.destroyed) || fronts.some((lc) => lc.destroyed)) return;
    const t0 = performance.now();
    const strip = new PIXI.Container();
    // Over the middleground and under the avatars: the middleground's own art below bounds.b
    // comes back on top as an opaque-only copy (skirtSolidAlpha), so its see-through parts are
    // covered (Estevan Meadows' flat ground slabs hang half-clear aprons there, which showed as
    // pale boxes over the darkened skirt) and its solid parts look as they did. The front layers
    // (game.js syncStreetFront) still draw over the strip (The Great Hole to Ix's dirt and
    // trunks); the back layers' art down there stays hidden (Matsya's light glow).
    strip.zIndex = main.inFront ? -1 : main.zIndex + 1;
    strip.label = 'ground-skirt';
    const textures = [];
    // Frame views of those textures (quadPieceViews, the edge mirror's flips): freed first.
    const views = [];
    const maxTex = maxTextureSizeOf(renderer) || 4096;
    // How far the middleground's art runs below the edge (in view: the skirt's depth at most).
    const mainBox = main.getLocalBounds();
    const below = Math.max(0, Math.min(depth, Math.ceil(mainBox.maxY - sourceH)));
    let res = Math.min(2, streetBakeResolution(renderer, root.bakeResolutionCap));
    while (res > 0.5 && W * (band + below) * res * res * 4 > SKIRT_BYTES) res /= 1.25;
    const chunkW = Math.max(256, Math.min(QUAD_SPAN, Math.floor(maxTex / res)));
    // Pixi 8 drops the filters of the container it renders (and makes it a render group), so
    // the layers render inside a throwaway parent: their colour filters apply as on screen.
    // Each goes back to its parent at its index, at its own position.
    const homes = grounds.map((lc) => ({ lc, parent: lc.parent, index: lc.parent ? lc.parent.getChildIndex(lc) : -1, x: lc.x, y: lc.y }));
    const shell = new PIXI.Container();
    shell.sortableChildren = true;
    for (const h of homes) {
      shell.addChild(h.lc);
      const at = h.lc.skirtAt || { x: 0, y: 0 };
      h.lc.x = at.x;
      h.lc.y = at.y;
    }
    // A blurred layer draws baked tiles, made as the camera nears them (or 250 ms after load):
    // bake the ones the band crosses now.
    for (const lc of grounds) {
      const blurred = lc.blurLayer;
      if (!blurred || !root.blurStats) continue;
      // The band in the layer's own coordinates.
      const y1 = sourceH - (lc.skirtAt?.y || 0);
      for (const tile of blurred.tiles) {
        if (tile.y < y1 && tile.y + tile.h > y1 - Math.max(band, 24)) bakeBlurTile(tile, root.blurStats);
      }
    }
    // Decos culled for the camera still belong in the band (and in the front layers' fades).
    const culled = [];
    for (const lc of new Set([...grounds, ...fronts])) for (const child of lc.children) if (child.culled) culled.push(child);
    for (const child of culled) child.culled = false;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    const mirrors = [];
    const solids = [];
    const top = sourceH - band;
    const solidFilter = below > 0 ? skirtSolidFilter(PIXI, res) : null;
    for (let x0 = 0; x0 < W; x0 += chunkW) {
      const w = Math.min(chunkW, Math.ceil(W - x0));
      if (band > 0) {
        const rt = ensureDepthStencil(renderer, PIXI.RenderTexture.create({ width: w, height: band, resolution: res }));
        renderer.render({ container: shell, target: rt, transform: new PIXI.Matrix(1, 0, 0, 1, -x0, -top), clear: true });
        textures.push(rt);
        const pieces = quadPieceViews(PIXI, rt, views);
        for (const tile of skirtTiles(depth, band)) for (const piece of pieces) {
          const spr = new PIXI.Sprite(piece.texture);
          spr.x = x0 + piece.dx;
          if (tile.flip) {
            // Upside down: the band's bottom row (the art right at the edge) meets the copy above.
            spr.scale.y = -1;
            spr.y = sourceH + tile.y + band;
          } else {
            spr.y = sourceH + tile.y;
          }
          mirrors.push(spr);
        }
      }
      if (below > 0) {
        // The middleground alone below the edge, then only its opaque pixels.
        const others = grounds.filter((lc) => lc !== main && lc.visible);
        for (const lc of others) lc.visible = false;
        // From SOLID_OVERLAP px above the edge: the copy's first rows sample past its texture's
        // top, and there they lie over the same art (identical where it is solid).
        const raw = ensureDepthStencil(renderer, PIXI.RenderTexture.create({ width: w, height: below + SOLID_OVERLAP, resolution: res }));
        renderer.render({ container: shell, target: raw, transform: new PIXI.Matrix(1, 0, 0, 1, -x0, -(sourceH - SOLID_OVERLAP)), clear: true });
        for (const lc of others) lc.visible = true;
        // Drawn from one filtered sprite, no mask: it needs no stencil of its own.
        const solid = PIXI.RenderTexture.create({ width: w, height: below + SOLID_OVERLAP, resolution: res });
        const holder = new PIXI.Container();
        const rawSprite = new PIXI.Sprite(raw);
        rawSprite.filters = [solidFilter];
        holder.addChild(rawSprite);
        renderer.render({ container: holder, target: solid, clear: true });
        holder.destroy({ children: true });
        raw.destroy(true);
        textures.push(solid);
        solids.push({ texture: solid, x: x0 });
      }
      // The band's average colour from an eighth-size copy (one small read per chunk). R29 (#517):
      // through the one readback (js/render-probe.js readbackPixels), which copies it from the
      // screen where reading a render texture back fails; neither read: the fallback colour draws.
      const sw = Math.max(1, Math.ceil(w / 8));
      const sh = Math.max(1, Math.ceil(Math.max(band, 24) / 8));
      const read = readbackPixels(PIXI, renderer, {
        width: sw,
        height: sh,
        resolution: 1,
        passes: [{ container: shell, transform: new PIXI.Matrix(1 / 8, 0, 0, 1 / 8, -x0 / 8, -(sourceH - Math.max(band, 24)) / 8) }],
        label: 'skirt',
      });
      const px = read?.pixels || [];
      for (let i = 0; i < px.length; i += 4) {
        const a = px[i + 3];
        if (a < 200) continue;
        // Premultiplied: back to the colour.
        r += px[i] * 255 / a;
        g += px[i + 1] * 255 / a;
        b += px[i + 2] * 255 / a;
        n += 1;
      }
    }
    solidFilter?.destroy();
    const chunkCount = mirrors.length ? textures.length - solids.length : 0;
    // G582: the band's last `pad` px, flipped about the street's right end, down the same tiles.
    const pad = Math.max(0, Math.min(Math.ceil(Number(rightPad) || 0), Math.floor(W)));
    if (pad > 0 && band > 0) {
      // Whole texels ending on the street's end (edgeMirrorTexels): a texture Pixi rounded down
      // would stop short of the end, flipped, and leave a gap there.
      const padW = wholeTexels(pad, res) / res;
      const rt = ensureDepthStencil(renderer, PIXI.RenderTexture.create({ width: padW, height: band, resolution: res }));
      renderer.render({ container: shell, target: rt, transform: new PIXI.Matrix(1, 0, 0, 1, -(W - padW), -top), clear: true });
      textures.push(rt);
      const pieces = quadPieceViews(PIXI, rt, views);
      for (const tile of skirtTiles(depth, band)) for (const piece of pieces) {
        const spr = new PIXI.Sprite(piece.texture);
        spr.scale.x = -1;
        spr.x = W + padW - piece.dx;
        if (tile.flip) {
          spr.scale.y = -1;
          spr.y = sourceH + tile.y + band;
        } else {
          spr.y = sourceH + tile.y;
        }
        mirrors.push(spr);
      }
    }
    const fullW = W + pad;
    for (const h of [...homes].sort((p, q) => p.index - q.index)) {
      h.lc.x = h.x;
      h.lc.y = h.y;
      if (h.parent) h.parent.addChildAt(h.lc, Math.min(h.index, h.parent.children.length));
    }
    shell.destroy();
    const average = n ? (Math.min(255, Math.round(r / n)) << 16) | (Math.min(255, Math.round(g / n)) << 8) | Math.min(255, Math.round(b / n)) : null;
    const colour = skirtFadeColour(average, gradientBottom, fallback);
    // Under the mirror: its clear pixels show the ground's colour, not the layers behind.
    const fadeDepth = Math.min(depth, SKIRT_FADE_DEPTH);
    // FLICKER (js/wide-quads.js): every fill, fade and copy in pieces no thinner than the GPU
    // always draws (one street-wide quad lost half of itself: the bottom-right wedge on Switchback).
    const base = wideRect(new PIXI.Graphics(), 0, sourceH, fullW, depth, average ?? colour);
    strip.addChild(base);
    for (const spr of mirrors) strip.addChild(spr);
    const stops = skirtFadeStops();
    const fadeTexture = rampTexture(PIXI, colour, stops.fade);
    const shadeTexture = rampTexture(PIXI, 0x000000, stops.shade);
    const ramps = (texture) => quadSpans(0, fullW, fadeDepth).map((s) => {
      const spr = new PIXI.Sprite(texture);
      spr.x = s.x;
      spr.y = sourceH;
      spr.width = s.w;
      spr.height = fadeDepth;
      return spr;
    });
    // Down past the last copy's foot (it can run up to a band past the skirt's depth).
    const deep = wideRect(new PIXI.Graphics(), 0, sourceH + fadeDepth, fullW, Math.max(0, depth + band - fadeDepth), colour);
    strip.addChild(...ramps(fadeTexture), ...ramps(shadeTexture), deep);
    // The middleground's solid copy, chunk by chunk, each in pieces.
    const placePieces = (texture, x, y, into) => {
      for (const piece of quadPieceViews(PIXI, texture, views)) {
        const spr = new PIXI.Sprite(piece.texture);
        spr.x = x + piece.dx;
        spr.y = y;
        into.addChild(spr);
      }
    };
    for (const chunk of solids) placePieces(chunk.texture, chunk.x, sourceH - SOLID_OVERLAP, strip);
    textures.push(fadeTexture, shadeTexture);
    // The art below the edge darkens into the colour as it goes down (skirtArtFadeStops).
    const artRamp = rampTexture(PIXI, colour, skirtArtFadeStops());
    textures.push(artRamp);
    let fadeBytes = 0;
    // A cover is a smooth darkening whose edge follows the art to a world px: one texel per px.
    const coverRes = Math.min(1, res);
    for (const chunk of solids) {
      const w = chunk.texture.width;
      const h = chunk.texture.height;
      const over = edgeFadeTexture(PIXI, renderer, chunk.texture, w, h, SOLID_OVERLAP + fadeStart, colour, artRamp, coverRes);
      textures.push(over);
      fadeBytes += w * h * coverRes * coverRes * 4;
      placePieces(over, chunk.x, sourceH - SOLID_OVERLAP, strip);
      chunk.cover = over;
    }
    // Pieces of the last `take` px of `texture` (`w` wide), flipped about x = `end` (the layer's
    // end): the edge mirror's flips.
    const flipPieces = (texture, w, take, end, y, into) => {
      const view = new PIXI.Texture({ source: texture.source, frame: new PIXI.Rectangle(w - take, 0, take, texture.height) });
      views.push(view);
      for (const piece of quadPieceViews(PIXI, view, views)) {
        const flip = new PIXI.Sprite(piece.texture);
        flip.scale.x = -1;
        flip.x = end + take - piece.dx;
        flip.y = y;
        into.addChild(flip);
      }
    };
    // EDGE MIRROR (G582): past the right end, the middleground's art below the edge and its fade
    // mirrored too (the last chunk's last `pad` px, flipped about the end), so under the edge the
    // dirt meets its reflection instead of stopping at the end over the skirt's flat colour.
    const lastSolid = solids[solids.length - 1];
    if (pad > 0 && lastSolid && lastSolid.x + lastSolid.texture.width >= W - 1) {
      for (const texture of [lastSolid.texture, lastSolid.cover].filter(Boolean)) {
        const tw = texture.width;
        flipPieces(texture, tw, Math.min(pad, tw), lastSolid.x + tw, sourceH - SOLID_OVERLAP, strip);
      }
    }
    // Each front layer's art below its bottom (in its own coordinates, where its bottom meets the
    // street's whenever the camera is low enough to show below the edge), rendered alone, gets a
    // cover of the fade in its shape, drawn just above it and moved with it (updateParallax).
    const faded = [];
    const covers = [];
    for (const lc of fronts) {
      const refY = lc.parallaxLayer ? lc.parallaxLayer.h : sourceH;
      const lw = Math.ceil(lc.parallaxLayer ? lc.parallaxLayer.w : W);
      const deepest = Math.min(depth, Math.ceil(lc.getLocalBounds().maxY - refY));
      if (deepest <= fadeStart + 2 || lw <= 0 || !lc.parent) continue;
      const blurred = lc.blurLayer;
      if (blurred && root.blurStats) {
        for (const tile of blurred.tiles) if (tile.y < refY + deepest && tile.y + tile.h > refY) bakeBlurTile(tile, root.blurStats);
      }
      let lres = 1;
      while (lres > 0.5 && lw * deepest * lres * lres * 4 > SKIRT_BYTES) lres /= 1.25;
      const lchunk = Math.max(256, Math.min(QUAD_SPAN, Math.floor(maxTex / lres)));
      const home = { parent: lc.parent, index: lc.parent.getChildIndex(lc), x: lc.x, y: lc.y };
      const alone = new PIXI.Container();
      alone.addChild(lc);
      lc.x = 0;
      lc.y = 0;
      const cover = new PIXI.Container();
      cover.label = `edge-fade-${lc.label}`;
      cover.zIndex = lc.zIndex + 5;
      for (let x0 = 0; x0 < lw; x0 += lchunk) {
        const w = Math.min(lchunk, lw - x0);
        const art = PIXI.RenderTexture.create({ width: w, height: deepest, resolution: lres });
        renderer.render({ container: alone, target: art, transform: new PIXI.Matrix(1, 0, 0, 1, -x0, -refY), clear: true });
        const over = edgeFadeTexture(PIXI, renderer, art, w, deepest, fadeStart, colour, artRamp, lres);
        art.destroy(true);
        textures.push(over);
        fadeBytes += w * deepest * lres * lres * 4;
        placePieces(over, x0, refY, cover);
        // EDGE MIRROR (G582): the last chunk's fade flipped past the layer's end, over its art's
        // reflection there (street-render attachEdgeMirrors).
        if (pad > 0 && x0 + w >= lw) flipPieces(over, w, Math.min(pad, w), x0 + w, refY, cover);
      }
      lc.x = home.x;
      lc.y = home.y;
      home.parent.addChildAt(lc, Math.min(home.index, home.parent.children.length));
      alone.destroy();
      cover.x = lc.x;
      cover.y = lc.y;
      home.parent.addChild(cover);
      lc.edgeFade = cover;
      covers.push(cover);
      faded.push(lc.label);
    }
    for (const child of culled) child.culled = true;
    root.addChild(strip);
    made = { strip, covers, views, textures };
    root.groundSkirt = {
      depth,
      band,
      colour,
      average,
      layers: grounds.map((lc) => lc.label),
      chunks: chunkCount,
      copies: mirrors.length,
      right: pad,
      below,
      resolution: Math.round(res * 100) / 100,
      bytes: Math.round(W * (band + below) * res * res * 4),
      // The art fade (skirtArtFadeStops): where it starts below the edge, the front layers it
      // covers, and its textures' bytes (the middleground copy's included).
      fadeStart,
      faded,
      fadeBytes: Math.round(fadeBytes),
      ms: Math.round(performance.now() - t0),
      builds: (root.groundSkirt?.builds || 0) + 1,
    };
  };
  /** Free what the last build made: views first (their sources go with the textures they frame). */
  const freeMade = ({ detach = false } = {}) => {
    if (!made) return;
    const { strip, covers, views, textures } = made;
    made = null;
    if (detach) {
      for (const cover of covers) {
        for (const lc of fronts) if (lc.edgeFade === cover) lc.edgeFade = null;
        if (!cover.destroyed) cover.destroy({ children: true });
      }
      if (!strip.destroyed) strip.destroy({ children: true });
    }
    for (const v of views) v.destroy(false);
    for (const t of textures) t.destroy(true);
  };
  root.once('destroyed', () => freeMade());
  /**
   * G714/G1166: after a lost and restored WebGL context the skirt's band, its solid copy and the
   * front layers' fades are render textures come back empty (two restores in Chrome left them
   * blank). Build them again from the art: first the colour copies the band crosses, which
   * dropBakes has just forgotten, so the band takes the layers' colours as on screen. False when
   * there is no skirt yet (its first build is still waiting on the art).
   */
  root.groundSkirtRebuild = () => {
    if (!made || root.destroyed) return false;
    freeMade({ detach: true });
    if (root.recolourCache) {
      for (const lc of new Set([...grounds, ...fronts])) {
        const edge = (fronts.includes(lc) && lc.parallaxLayer ? lc.parallaxLayer.h : sourceH) - (lc.skirtAt?.y || 0) - Math.max(band, 24);
        for (const b of layerArtBoxes(PIXI, lc)) {
          if (b.y1 > edge && b.child.recolour && !b.child.recolour.entry.texture) ensureRecoloured(PIXI, renderer, root.recolourCache, b.child);
        }
      }
    }
    build();
    return true;
  };
  const sprites = [];
  for (const lc of new Set([...grounds, ...fronts])) {
    lc.children.forEach(function walk(child) {
      if (child instanceof PIXI.Sprite) sprites.push(child);
      (child.children || []).forEach(walk);
    });
  }
  const pending = [...new Set(sprites.map((spr) => spr.texture.source).filter((base) => !isLoaded(base)))];
  // Let a pending colour bake swap textures first.
  const later = () => setTimeout(build, 0);
  if (!pending.length) {
    later();
    return;
  }
  let left = pending.length;
  const done = () => {
    left -= 1;
    if (left === 0) later();
  };
  for (const base of pending) {
    onLoaded(base, done);
    onFailed(base, done);
  }
}

/** EDGE MIRROR (G582): px a mirrored strip runs on past the furthest the camera can show past a layer's end. */
export const EDGE_MIRROR_MARGIN = 24;
/** EDGE MIRROR: how far below a layer's bottom its strips run (the ground skirt's depth, about). */
const EDGE_MIRROR_BELOW = 400;
/** EDGE MIRROR: how far a layer's end clip runs on its open sides and up and down. */
const EDGE_CLIP_FAR = 100000;
/** EDGE MIRROR: the street's mirrored strips' texture budget (their resolution drops to fit). */
export const EDGE_MIRROR_BYTES = 32 * 1024 * 1024;

/**
 * PURE (EDGE MIRROR, G582, Austin 2026-11-11 "mirror the street's edge"): how much of a layer's
 * own art the camera can show past each of its ends, plus `margin` (0 where it shows none). The
 * camera runs from 0 to the street's width less its location view (game.js cameraTargetForPlayer:
 * the view less the right-hand reserve, `maxInset` at most), or sits centred on a street narrower
 * than the view. Each parallax layer slides by parallaxLayerOffset, so past the street's end each
 * ends at its own place: by the reserve itself for the middleground, by more for a layer wider
 * than the street (the foreground), by less for a far one, and not at all for one narrower than
 * the view. On a street narrower than the view every layer is centred on the street
 * (parallaxRestX), so a layer shows (view - w) / 2 past each end. `parallax` false: a layer in
 * street coordinates (the middleground; `layerW` unused).
 * Capped at the layer's own width: a strip can only mirror the art there is.
 */
export function edgeMirrorWidths({ layerW, parallax = true, streetW, vpW, maxInset = 0, margin = EDGE_MIRROR_MARGIN }) {
  const W = Number(streetW) || 0;
  const view = Number(vpW) || 0;
  const lw = parallax ? Number(layerW) || 0 : W;
  if (!(lw > 0) || !(W > 0) || !(view > 0)) return { left: 0, right: 0 };
  const inset = Math.min(Math.max(0, Number(maxInset) || 0), view * 0.48);
  const cams = W >= view ? [0, Math.max(0, W - (view - inset))] : [-(view - W) / 2];
  const maxX = W - view;
  let left = 0;
  let right = 0;
  for (const cam of cams) {
    // The layer's left end on screen: parallaxLayerOffset less the camera.
    const lx = parallax ? (maxX > 0 ? (cam / maxX) * (view - lw) : parallaxRestX(lw, W) - cam) : -cam;
    left = Math.max(left, lx);
    right = Math.max(right, view - (lx + lw));
  }
  const fit = (gap) => (gap > 0.5 ? Math.min(Math.ceil(gap + Math.max(0, margin)), Math.floor(lw)) : 0);
  return { left: fit(left), right: fit(right) };
}

/** EDGE MIRROR: how far in from a layer's end its art may stop and still be mirrored about its own edge. */
export const EDGE_MIRROR_SNAP = 2;

/**
 * PURE (EDGE MIRROR): the column of a layer one end's strip mirrors, in the layer's coordinates.
 * 'right' takes the last `width` px and flips them about the layer's end (x = layerW), 'left' the
 * first `width` px about x = 0, so the art at the end meets its own reflection. Art that stops a
 * hair short of the end (Grimssea Hollow's bark, centred on a 1125 px street, starts at x = 0.5) is
 * flipped about its own edge instead (`end`, within EDGE_MIRROR_SNAP px), else the half pixel
 * there and its reflection left a 1 px gap down the whole street. The strip runs from the highest
 * art box crossing the column to the lowest, no lower than `bottom` (below a layer's bottom is the
 * ground skirt's). Returns { side, x0, y0, w, h, at, end } (`at`: the x of the copy drawn with
 * scale.x -1, `end`: the x it is flipped about) or null when no art crosses the column.
 */
export function edgeMirrorStrip(side, width, layerW, boxes, bottom = Infinity) {
  const w = Math.max(0, Math.floor(Number(width) || 0));
  if (!w || !(layerW > 0)) return null;
  const right = side === 'right';
  const c0 = right ? layerW - w : 0;
  const c1 = c0 + w;
  let y0 = Infinity;
  let y1 = -Infinity;
  let outer = right ? -Infinity : Infinity;
  for (const b of boxes || []) {
    if (!b || b.x1 <= c0 || b.x0 >= c1 || b.y1 <= b.y0) continue;
    y0 = Math.min(y0, b.y0);
    y1 = Math.max(y1, b.y1);
    outer = right ? Math.max(outer, b.x1) : Math.min(outer, b.x0);
  }
  y1 = Math.min(y1, bottom);
  if (!(y1 > y0)) return null;
  y0 = Math.floor(y0);
  y1 = Math.ceil(y1);
  const short = right ? layerW - outer : outer;
  const end = short > 0 && short <= EDGE_MIRROR_SNAP ? outer : right ? layerW : 0;
  return { side, x0: right ? end - w : end, y0, w, h: y1 - y0, at: right ? end + w : end, end };
}

/**
 * PURE (EDGE MIRROR, the right-end seam, Middle Arbor 2026-11-12): a strip's render texture in whole
 * texels, laid so its seam edge sits exactly on the layer's end. Pixi rounds a render texture to
 * whole pixels (TextureSource.resize: Math.round(width x resolution)) and sizes the sprite by that,
 * so at a resolution where w x res rounded down (sky 324 px at 1.52: 492.48 to 492) the strip came
 * out 0.32 px short; drawn flipped from `at` (its far side) it stopped short of the end and left a
 * thin gap all the way down the layer, the sky gradient showing through. The texels are rounded up
 * instead, and the column rendered is the last `width` px before the strip's `end` (right) or the
 * first after it (left; `end` is the layer's end, or its art's edge, edgeMirrorStrip), so the edge
 * texel is the art at the end whatever the rounding.
 * Returns { width, height, pixelWidth, pixelHeight, x0, at }: the texture's size (whole texels over
 * res), the layer x rendered at the texture's left edge, and the x of the sprite drawn with scale.x -1.
 */
export function edgeMirrorTexels(strip, layerW, res = 1) {
  const r = Number(res) > 0 ? Number(res) : 1;
  const pixelWidth = wholeTexels(strip.w, r);
  const pixelHeight = wholeTexels(strip.h, r);
  const width = pixelWidth / r;
  const height = pixelHeight / r;
  const right = strip.side === 'right';
  const end = Number.isFinite(strip.end) ? strip.end : right ? layerW : 0;
  return { width, height, pixelWidth, pixelHeight, x0: right ? end - width : end, at: right ? end + width : end };
}

/** PURE (EDGE MIRROR): the whole texels covering `size` px at `res` (a hair under an integer keeps it). */
export function wholeTexels(size, res = 1) {
  return Math.max(1, Math.ceil((Number(size) || 0) * (Number(res) > 0 ? Number(res) : 1) - 1e-6));
}

/**
 * EDGE MIRROR (#380, Austin 2026-11-15): art that looks like something to use (ladders, signposts,
 * doors, stairs, climbing trees and ropes) is left out of the reflection, so nothing past a
 * street's real end invites a walk there. #718: so are the ground hollows Jellisac Growths sit in
 * (ground_cutaway_hollow1-3): the growth is a node, never reflected, so a mirrored hollow read as
 * a socket with its Jellisac missing.
 */
export const EDGE_MIRROR_USABLE = /ladder|signpost|sign_|_sign|door|stairs|steps?(?:_|\d|$)|climb|elevator|portal|vine_rope|cutaway_hollow/i;

/** PURE (EDGE MIRROR, #380): a deco sprite (or a ladder's tiling) left out of the reflection. */
export function edgeMirrorLeavesOut(child) {
  if (!child) return false;
  if (child.glitchLadderId !== undefined) return true;
  return EDGE_MIRROR_USABLE.test(String(child.glitchDecoSprite || ''));
}

/** EDGE MIRROR (#380): the share of a strip's width, from the seam out, over which the walkable layers fade away. */
export const EDGE_MIRROR_FADE = 0.85;

/**
 * PURE (EDGE MIRROR, #380): how much of a walkable layer's reflection shows at `t` (0 at the street's
 * end, 1 at the strip's outer edge): all of it at the seam, so the art still meets itself there,
 * easing to none by EDGE_MIRROR_FADE of the way out. The far layers behind keep their reflection
 * whole, so the space past the end still reads as scenery.
 */
export function edgeMirrorKeep(t, fade = EDGE_MIRROR_FADE) {
  const x = Math.min(1, Math.max(0, (Number(t) || 0) / (fade > 0 ? fade : 1)));
  return 1 - x * x * (3 - 2 * x);
}

/** PURE (EDGE MIRROR, #380): the layers whose reflection fades: the middleground and every layer at or in front of it. */
export function edgeMirrorFades(lc, middleZ) {
  if (!lc) return false;
  if (lc.label === 'middleground' || lc.inFront) return true;
  return Number.isFinite(middleZ) && Number(lc.zIndex) >= middleZ;
}

/** EDGE MIRROR (#380): a 64 x 1 ramp, erase alpha 0 at its right end to 1 at its left (edgeMirrorKeep). */
function edgeMirrorFadeTexture(PIXI) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(64, 1);
  for (let i = 0; i < 64; i++) {
    // Column i: t runs 1 (left, the outer edge of a right strip) to 0 (right, the seam).
    const t = 1 - (i + 0.5) / 64;
    img.data[i * 4 + 3] = Math.round((1 - edgeMirrorKeep(t)) * 255);
  }
  ctx.putImageData(img, 0, 0);
  return PIXI.Texture.from(canvas);
}

/** PURE (EDGE MIRROR): the strips' render resolution: the renderer's (2 at most), lowered to fit `budget`. */
export function edgeMirrorResolution(strips, base = 1, budget = EDGE_MIRROR_BYTES) {
  let res = Math.min(2, Number(base) || 1);
  const px = (strips || []).reduce((n, s) => n + s.w * s.h, 0);
  while (res > 0.5 && px * res * res * 4 > budget) res /= 1.25;
  return res;
}

/** EDGE MIRROR: a layer's drawn art as boxes in its coordinates (blur tiles by their tile). */
function layerArtBoxes(PIXI, lc) {
  const boxes = [];
  for (const child of lc.children) {
    const tile = child.blurTile;
    if (tile) {
      boxes.push({ x0: tile.x, y0: tile.y, x1: tile.x + tile.w, y1: tile.y + tile.h, child });
      continue;
    }
    // Hidden decos, a blurred layer's parked originals, and the end clip.
    if (!child.visible || child.edgeClip) continue;
    const b = child instanceof PIXI.Sprite ? decoBox(child) : childBox(PIXI, child);
    if (b) boxes.push({ ...b, child });
  }
  return boxes;
}

/**
 * EDGE MIRROR: render one layer's strip column as on screen (its colour filter applied, its blur
 * tiles and recoloured copies there baked, nothing culled), the layer alone in a throwaway parent
 * (as buildGroundSkirt does), then put it back where it was.
 */
function renderEdgeStrip(PIXI, renderer, root, lc, strip, boxes, res, texels, fade = false) {
  const x0 = texels.x0;
  const x1 = x0 + texels.width;
  const y1 = strip.y0 + texels.height;
  const unculled = [];
  // #380: ladders, signposts, doors and the like stay out of the reflection.
  const hidden = [];
  for (const b of boxes) {
    if (b.x1 <= x0 || b.x0 >= x1 || b.y1 <= strip.y0 || b.y0 >= y1) continue;
    const child = b.child;
    if (child.visible && edgeMirrorLeavesOut(child)) {
      child.visible = false;
      hidden.push(child);
      continue;
    }
    if (child.blurTile && root.blurStats) bakeBlurTile(child.blurTile, root.blurStats);
    else if (child.recolour && !child.recolour.entry.texture && root.recolourCache) ensureRecoloured(PIXI, renderer, root.recolourCache, child);
    if (child.culled) {
      child.culled = false;
      unculled.push(child);
    }
  }
  const home = { parent: lc.parent, index: lc.parent ? lc.parent.getChildIndex(lc) : -1, x: lc.x, y: lc.y };
  const shell = new PIXI.Container();
  shell.addChild(lc);
  lc.x = 0;
  lc.y = 0;
  const rt = PIXI.RenderTexture.create({ width: texels.width, height: texels.height, resolution: res });
  try {
    renderer.render({ container: shell, target: rt, transform: new PIXI.Matrix(1, 0, 0, 1, -texels.x0, -strip.y0), clear: true });
  } finally {
    lc.x = home.x;
    lc.y = home.y;
    if (home.parent) home.parent.addChildAt(lc, Math.min(home.index, home.parent.children.length));
    shell.destroy();
    for (const child of unculled) child.culled = true;
    for (const child of hidden) child.visible = true;
  }
  if (fade) {
    // #380: the walkable layers fade out toward the strip's outer edge (edgeMirrorKeep), erased
    // from the texture once, so nothing past the street's end looks like ground to walk on.
    root.edgeMirrorFade ||= edgeMirrorFadeTexture(PIXI);
    const ramp = new PIXI.Sprite(root.edgeMirrorFade);
    ramp.blendMode = 'erase';
    ramp.width = texels.width;
    ramp.height = texels.height;
    // The ramp's seam end is its right: a right strip's seam is the texture's right edge, a left one's its left.
    if (strip.side === 'left') {
      ramp.scale.x = -Math.abs(ramp.scale.x);
      ramp.x = texels.width;
    }
    try {
      renderer.render({ container: ramp, target: rt, clear: false });
    } finally {
      ramp.destroy();
    }
  }
  return rt;
}

/**
 * EDGE MIRROR (G582, Austin 2026-11-11): the camera stops with a street's right end left of the
 * Modern skin's Social drawer (game.js syncCameraSafeArea), and the drawer is a floating card, so
 * the world past the end shows below and around it; on a street narrower than the view, past both
 * ends. Each layer gets its own strip there: its art at that end, as drawn, flipped about the
 * layer's own end, in a container beside the layer that moves with it (updateParallax), so the
 * seam holds at every camera position whatever each layer's parallax. Art only: entities, items,
 * signposts and platforms live elsewhere, and nothing past the end is walkable. One render texture
 * per layer end, made once the street's art has loaded and the view width is known, made again
 * when the view width (zoom, window) needs other widths or the renderer's resolution changes, and
 * freed with the street view. `insetShare` (a number, or a function read every frame): the most
 * of the view the camera reserves at the right (0 where nothing covers the world, as in Classic:
 * only a narrow street's ends then); a change rebuilds.
 */
export function attachEdgeMirrors(PIXI, renderer, root, layers, W, sourceH, insetShare = 0) {
  const state = { vpW: 0, share: 0, ready: false, timer: null, key: '', views: [], textures: [], strips: [], builds: 0, bytes: 0, res: 0, base: 0, ms: 0 };
  const shareNow = () => Math.max(0, Number(typeof insetShare === 'function' ? insetShare() : insetShare) || 0);
  state.share = shareNow();
  const free = () => {
    for (const view of state.views) {
      const lc = view.edgeOf;
      const clip = view.edgeClip;
      if (clip && !clip.destroyed) {
        if (lc && !lc.destroyed && lc.mask === clip) lc.mask = null;
        clip.destroy();
      }
      if (lc && lc.edgeMirror === view) lc.edgeMirror = null;
      if (!view.destroyed) view.destroy({ children: true });
    }
    for (const t of state.textures) t.destroy(true);
    state.views = [];
    state.textures = [];
    state.strips = [];
    state.bytes = 0;
  };
  const plan = (vpW) => layers
    .filter((lc) => !lc.destroyed && lc.visible && lc.parent)
    .map((lc) => {
      const parallax = Boolean(lc.parallaxLayer);
      const lw = parallax ? lc.parallaxLayer.w : W;
      const widths = edgeMirrorWidths({ layerW: lw, parallax, streetW: W, vpW, maxInset: vpW * state.share });
      // Art below the layer's bottom too (a front layer's dirt there fades into the skirt under
      // its edge-fade cover, mirrored with it in buildGroundSkirt), down to EDGE_MIRROR_BELOW.
      return { lc, lw, bottom: (parallax ? lc.parallaxLayer.h : sourceH) + EDGE_MIRROR_BELOW, ...widths };
    });
  const build = () => {
    state.timer = null;
    if (root.destroyed || !state.ready || !state.vpW) return;
    const plans = plan(state.vpW);
    const base = streetBakeResolution(renderer, root.bakeResolutionCap);
    const wanted = plans.filter((p) => p.left || p.right);
    const key = wanted.length ? `${base}|${wanted.map((p) => `${p.lc.label}:${p.left},${p.right}`).join(';')}` : 'none';
    state.base = base;
    if (key === state.key) return;
    const t0 = performance.now();
    free();
    state.key = key;
    const strips = [];
    for (const p of wanted) {
      const boxes = layerArtBoxes(PIXI, p.lc);
      for (const side of ['left', 'right']) {
        const s = edgeMirrorStrip(side, p[side], p.lw, boxes, p.bottom);
        if (s) strips.push({ ...s, plan: p, boxes });
      }
    }
    const res = edgeMirrorResolution(strips, base);
    const middleZ = layers.find((lc) => lc.label === 'middleground')?.zIndex ?? NaN;
    const views = new Map();
    for (const s of strips) {
      const lc = s.plan.lc;
      const texels = edgeMirrorTexels(s, s.plan.lw, res);
      let rt;
      try {
        rt = renderEdgeStrip(PIXI, renderer, root, lc, s, s.boxes, res, texels, edgeMirrorFades(lc, middleZ));
      } catch {
        continue;
      }
      state.textures.push(rt);
      state.bytes += texels.pixelWidth * texels.pixelHeight * 4;
      let view = views.get(lc);
      if (!view) {
        view = new PIXI.Container();
        view.label = `edge-mirror-${lc.label}`;
        // Over the layer: art overhanging its end (Groddle Forest Junction's cliff runs 120 px on)
        // is covered, so the reflection meets the art at the end itself.
        view.zIndex = lc.zIndex + 0.5;
        view.x = lc.x;
        view.y = lc.y;
        view.edgeOf = lc;
        lc.parent.addChild(view);
        lc.edgeMirror = view;
        views.set(lc, view);
        state.views.push(view);
      }
      const spr = new PIXI.Sprite(rt);
      spr.scale.x = -1;
      spr.x = texels.at;
      spr.y = s.y0;
      spr.edgeSide = s.side;
      spr.edgeLayerW = s.plan.lw;
      view.addChild(spr);
      state.strips.push({ layer: lc.label, side: s.side, w: s.w, h: s.h, y: s.y0, fades: edgeMirrorFades(lc, middleZ) });
    }
    // Art that overhangs a mirrored end (Groddle Forest Junction's dirt lip runs 133 px on, higher
    // than its reflection) would show over the reflection's clear pixels: those layers are clipped
    // at their end while a strip is on screen (edgeMirrorFrame), the 2012 client never showing
    // anything past a street's bounds.
    for (const [lc, view] of views) {
      const sides = new Set(view.children.map((spr) => spr.edgeSide));
      const lw = view.children[0].edgeLayerW;
      const boxes = strips.find((s) => s.plan.lc === lc).boxes;
      const over = boxes.some((b) => (sides.has('right') && b.x1 > lw + 0.5) || (sides.has('left') && b.x0 < -0.5));
      if (!over) continue;
      const x0 = sides.has('left') ? 0 : -EDGE_CLIP_FAR;
      const x1 = sides.has('right') ? lw : lw + EDGE_CLIP_FAR;
      const clip = new PIXI.Graphics();
      clip.rect(x0, -EDGE_CLIP_FAR, x1 - x0, EDGE_CLIP_FAR * 2).fill(0xffffff);
      clip.label = 'edge-clip';
      clip.edgeClip = true;
      clip.visible = false;
      lc.addChild(clip);
      view.edgeClip = clip;
    }
    state.res = res;
    state.builds += 1;
    state.ms = Math.round(performance.now() - t0);
  };
  const schedule = (ms) => {
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = setTimeout(build, ms);
  };
  /**
   * G714: after a lost and restored WebGL context the strips' render textures are empty: draw them
   * again. G1166: the plan's key is forgotten first, or build sees the same widths and keeps the
   * empty strips (two restores in Chrome left the world past a street's end bare).
   */
  root.edgeMirrorRebuild = () => {
    state.key = '';
    if (state.ready && state.vpW) schedule(0);
  };
  /** Once a frame from updateParallax: follow the layers, hide strips off screen, rebuild on a new width or resolution. */
  root.edgeMirrorFrame = (camX, vpW) => {
    const share = shareNow();
    if (vpW !== state.vpW || share !== state.share) {
      const first = !state.vpW;
      state.vpW = vpW;
      state.share = share;
      if (state.ready) schedule(first ? 0 : 250);
    } else if (state.ready && state.builds && state.timer === null && streetBakeResolution(renderer, root.bakeResolutionCap) !== state.base) {
      schedule(250);
    }
    for (const view of state.views) {
      const lc = view.edgeOf;
      if (!lc || lc.destroyed || view.destroyed) continue;
      view.x = lc.x;
      view.y = lc.y;
      view.visible = lc.visible;
      let shown = false;
      for (const spr of view.children) {
        // The layer's end on screen: the strip lies right of it (or left, at the left end).
        const end = view.x + (spr.edgeSide === 'right' ? spr.edgeLayerW : 0) - camX;
        spr.visible = spr.edgeSide === 'right' ? end < vpW + 1 : end > -1;
        shown = shown || spr.visible;
      }
      const clip = view.edgeClip;
      if (clip && !clip.destroyed) {
        const want = shown && lc.visible ? clip : null;
        if (lc.mask !== want) {
          clip.visible = Boolean(want);
          lc.mask = want;
        }
      }
    }
  };
  /** QA (game.js groddleQA.edgeMirrors): the strips, their resolution and bytes, builds and the last build's ms. */
  root.edgeMirrorStats = () => ({
    vpW: state.vpW,
    ready: state.ready,
    builds: state.builds,
    resolution: Math.round(state.res * 100) / 100,
    textures: state.textures.length,
    bytes: state.bytes,
    ms: state.ms,
    strips: state.strips.map((s) => ({ ...s })),
  });
  root.once('destroyed', () => {
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = null;
    free();
    root.edgeMirrorFade?.destroy(true);
    root.edgeMirrorFade = null;
  });
  // Wait for the layers' art (and, a turn later, their colour and blur bakes) as the skirt does.
  const sprites = [];
  for (const lc of layers) {
    lc.children.forEach(function walk(child) {
      if (child instanceof PIXI.Sprite) sprites.push(child);
      (child.children || []).forEach(walk);
    });
  }
  const pending = [...new Set(sprites.map((spr) => spr.texture?.source).filter((base) => base && !isLoaded(base)))];
  const ready = () => setTimeout(() => {
    state.ready = true;
    if (state.vpW) schedule(0);
  }, 0);
  if (!pending.length) {
    ready();
    return state;
  }
  let left = pending.length;
  const done = () => {
    left -= 1;
    if (left === 0) ready();
  };
  for (const base of pending) {
    onLoaded(base, done);
    onFailed(base, done);
  }
  return state;
}

/**
 * Draw every ladder's `tiling` into the middleground container (js/ladder-tiling.js): tile decos
 * at their own w x h, above the middleground decos, under the avatars, recoloured with the layer.
 * Returns how many tiles were added.
 */
function addLadderTiles(PIXI, lc, street, available, decoBase) {
  const art = (name) => (available.has(name) ? name : available.has(DECO_TWINS[name]) ? DECO_TWINS[name] : null);
  let added = 0;
  for (const ladder of street.ladders || []) {
    const pieces = ladderTilePieces(ladder, (name) => !!art(name));
    if (!pieces.length) continue;
    const foot = worldToScreen(street, ladder.x, ladder.y);
    for (const piece of pieces) {
      const tex = textureFromUrl(`${decoBase}${art(piece.sprite)}.png`);
      const spr = new PIXI.Sprite(tex);
      const size = () => {
        if (spr.destroyed) return;
        spr.width = piece.w;
        spr.height = piece.h;
      };
      size();
      if (!isLoaded(tex)) onLoaded(tex.source, size);
      spr.x = foot.x + piece.x;
      spr.y = foot.y + piece.y;
      spr.zIndex = LADDER_TILE_Z;
      spr.glitchLadderId = ladder.id || '';
      lc.addChild(spr);
      added += 1;
    }
  }
  return added;
}

/** Screen pixels past the view edge that still count as visible (pre-uploads). */
export const CULL_MARGIN = 256;

/** A deco's axis-aligned box in its layer's coordinates (sprites only). */
export function decoBox(spr) {
  // Skip anything without a measurable texture (a texture-less child or a
  // non-Texture `texture` field): one throw here blanked the whole street.
  const orig = spr.texture?.orig;
  if (!orig) return null;
  const w = orig.width;
  const h = orig.height;
  const sx = spr.scale.x;
  const sy = spr.scale.y;
  const ax = spr.anchor?.x ?? 0;
  const ay = spr.anchor?.y ?? 0;
  const xa = -ax * w * sx;
  const xb = (1 - ax) * w * sx;
  const ya = -ay * h * sy;
  const yb = (1 - ay) * h * sy;
  if (spr.rotation) {
    const r = Math.max(Math.hypot(xa, ya), Math.hypot(xb, ya), Math.hypot(xa, yb), Math.hypot(xb, yb));
    return { x0: spr.x - r, y0: spr.y - r, x1: spr.x + r, y1: spr.y + r };
  }
  return { x0: spr.x + Math.min(xa, xb), y0: spr.y + Math.min(ya, yb), x1: spr.x + Math.max(xa, xb), y1: spr.y + Math.max(ya, yb) };
}

/**
 * Cull one layer's sprites against the camera; returns how many are culled. A recoloured deco
 * or a blur tile coming into range is baked first (`rebake`).
 */
function cullLayer(lc, camX, camY, vpW, vpH, rebake, now) {
  if (lc.destroyed || !lc.visible) return 0;
  const x0 = camX - lc.x - CULL_MARGIN;
  const y0 = camY - lc.y - CULL_MARGIN;
  const x1 = x0 + vpW + CULL_MARGIN * 2;
  const y1 = y0 + vpH + CULL_MARGIN * 2;
  let culled = 0;
  for (const child of lc.children) {
    const tile = child.blurTile;
    if (tile) {
      const out = tile.x + tile.w < x0 || tile.x > x1 || tile.y + tile.h < y0 || tile.y > y1;
      if (!out) {
        if (!tile.texture) rebake(child);
        tile.seen = now;
      }
      child.culled = out;
      if (out) culled += 1;
      continue;
    }
    if (!child.texture) continue;
    const b = decoBox(child);
    if (!b) continue;
    const out = b.x1 < x0 || b.x0 > x1 || b.y1 < y0 || b.y0 > y1;
    if (!out && child.recolour && !child.recolour.entry.texture) rebake(child);
    child.culled = out;
    if (child.decoAnim) syncAnim(child, now);
    if (out) culled += 1;
  }
  return culled;
}

/**
 * @param {import('./street-model.js').StreetData} street
 * @param {typeof PIXI} PIXI
 * @param {{
 *   decoBase?: string,
 *   available?: Set<string>,
 *   debugPlatforms?: boolean,
 *   cameraBottomPadding?: number,
 *   bakeResolutionCap?: number,
 *   renderer?: import('pixi.js').Renderer
 * }} [opts]
 */
export function buildStreetView(street, PIXI, opts = {}) {
  const decoBase = opts.decoBase || DECO_BASE;
  const available = opts.available || decoManifest || new Set();
  const root = new PIXI.Container();
  root.sortableChildren = true;
  // #284: recoloured copies bake at most at the device's render cap (recolourBakeResolution).
  const recolourCache = { PIXI, textures: new Map(), entries: new Map(), bytes: 0, evictions: 0, rebakes: 0, lastEvict: 0, resolutionCap: Number(opts.bakeResolutionCap) || Infinity };
  root.recolourCache = recolourCache;
  /** QA (game.js groddleQA.recolourStats, #284): recoloured deco copies, how many are baked now and their GPU MB. */
  root.recolourStats = () => recolourStats(recolourCache);
  /** PHONE ZOOM SHARPNESS: the street's bakes stay at or under this (streetBakeResolution). */
  root.bakeResolutionCap = recolourCache.resolutionCap;
  /** Ladder tiles drawn from the street's ladders' `tiling` (addLadderTiles). */
  root.ladderTiles = 0;
  /** Blurred layers' tiles (bakeBlurredLayer): counts for QA in root.blurStats. */
  const blurState = {
    PIXI, renderer: opts.renderer, cap: recolourCache.resolutionCap, layers: [], tiles: 0, bytes: 0, peakBytes: 0,
    bakes: 0, bakeMs: 0, planMs: 0, evictions: 0, redraws: 0, eager: 0, culled: false, dirty: false,
  };
  root.blurStats = blurState;
  // Decos are destroyed with the view but not their textures; free the copies.
  root.once('destroyed', () => {
    for (const texture of recolourCache.textures.values()) texture.destroy(true);
    recolourCache.textures.clear();
    for (const layer of blurState.layers) {
      for (const tile of layer.tiles) tile.texture?.destroy(true);
      if (!layer.parked.destroyed) layer.parked.destroy({ children: true });
    }
    blurState.layers.length = 0;
    blurState.bytes = 0;
  });

  const W = streetWidth(street);
  const sourceH = streetHeight(street);
  const plats = platformsScreen(street);
  const deepestPlatformY = plats.reduce(
    (deepest, platform) => Math.max(deepest, platform.y1, platform.y2),
    sourceH
  );
  const cameraBottomPadding = Math.max(0, Number(opts.cameraBottomPadding) || 0);
  const H = Math.ceil(Math.max(sourceH, deepestPlatformY + cameraBottomPadding));

  // G1167: the location's own sky gradient, painted over the backmost layer at that layer's height
  // and moving with it (skyGradientPlacement, placed by updateParallax), its end colours carried on
  // past the layer: the bottom colour under the whole view, the top colour's cap above the layer.
  // Behind every layer and unfiltered, as Glitch drew it in that layer's own graphics. Streets
  // without one keep the painted fallback below.
  let skyView = null;
  /** @type {{ base: any, cap: any, gradient: any } | null} */
  let skyParts = null;
  if (street.gradient?.top && street.gradient?.bottom) {
    skyView = new PIXI.Container();
    skyView.zIndex = -1100;
    skyView.label = 'street-sky';
    const solid = (hex) => {
      const s = new PIXI.Sprite(PIXI.Texture.WHITE);
      s.tint = parseInt(String(hex).replace(/^(#|0x)/i, ''), 16) || 0;
      return s;
    };
    skyParts = {
      base: solid(street.gradient.bottom),
      cap: solid(street.gradient.top),
      gradient: new PIXI.Sprite(gradientTexture(PIXI, street.gradient.top, street.gradient.bottom)),
    };
    skyView.addChild(skyParts.base, skyParts.cap, skyParts.gradient);
    // Austin's iPhone 2026-11-24 (upright, Xhola Mades): under the pack row a band of the sky's
    // bottom colour (that street's yellow) showed below the dark earth. The bottom colour carried on
    // under the whole view, and on a low street the camera goes past the street's bottom further than
    // the ground skirt runs (c15c56d8680: the feet win over the street-bottom floor, #617/#654). Below
    // the street's bottom the view is ground: its own colour (the skirt's, once built; till then the
    // sky's bottom darkened, as skirtFadeColour does), behind every layer, the skirt and the art over
    // it. `groundBelow`: the game's views (the level builder's renders keep their picture).
    if (opts.groundBelow) {
      const bottom = parseInt(String(street.gradient.bottom).replace(/^(#|0x)/i, ''), 16);
      skyParts.ground = solid('000000');
      skyParts.ground.tint = skirtFadeColour(Number.NaN, Number.isFinite(bottom) ? bottom : null, 0x6b8f3c);
      skyParts.ground.label = 'ground-below';
      skyView.addChild(skyParts.ground);
    }
    root.addChild(skyView);
  }

  // Sky / depth backdrop (not solid ground strip alone)
  const sky = new PIXI.Graphics();
  const themeTop = 0x8eb8d8;
  const themeMid = 0xb5d4a0;
  const themeBot = 0x6b8f3c;
  // EDGE MIRROR: past the ends too, behind the mirrored strips.
  const skyPad = opts.edgeMirror ? 2048 : 0;
  // FLICKER (js/wide-quads.js): in pieces, as the ground skirt (a street-wide quad can lose half of itself).
  wideRect(sky, -skyPad, 0, W + skyPad * 2, sourceH * 0.45, themeTop);
  wideRect(sky, -skyPad, sourceH * 0.4, W + skyPad * 2, sourceH * 0.35, themeMid);
  wideRect(sky, -skyPad, sourceH * 0.7, W + skyPad * 2, Math.max(sourceH * 0.35, H - sourceH * 0.7), themeBot);
  sky.zIndex = -1000;
  if (!skyView) root.addChild(sky);

  // Soft horizon clouds
  const clouds = new PIXI.Graphics();
  for (let i = 0; i < 20; i++) {
    const x = 80 + i * (W / 18);
    const y = 40 + (i * 41) % 90;
    const r = 50 + (i * 17) % 40;
    clouds.ellipse(x, y, r, r * 0.45).fill({ color: 0xffffff, alpha: 0.55 });
  }
  clouds.zIndex = -900;
  if (!skyView) root.addChild(clouds);

  // Layers behind the middleground are distant parallax art, darkened or washed out by their
  // colour matrix: they load the 2x deco files even where js/deco-hires.js would pick 3x.
  // A deco takes its sharp copy when the screen needs more texels than that file has
  // (sharpDeco: SVG at the need, or a sized WebP): on the middleground and the layers in front of
  // it always, behind it and on blurred layers (at their bake's density) within the street's
  // FAR_SHARP_BUDGET_BYTES, most magnified first (admitSharp). Unblurred decos swap their copy
  // when the renderer's resolution changes (refreshSharpDecos); a blurred layer keeps the copy
  // its bake was made from.
  const renderer = opts.renderer;
  const bigTextures = () => (maxTextureSizeOf(renderer) || 4096) >= 8192;
  /** The far copies' slack this street affords at the renderer's resolution now (farSharp). */
  let farSlack = FAR_SLACKS[0];
  const sharpPick = (url, far = false, blur = 0, slack = farSlack) => (renderer
    ? sharpDeco(url, streetBakeResolution(renderer, recolourCache.resolutionCap), {
      bigTextures: bigTextures(),
      far,
      farSlack: slack,
      blurDensity: blur > 0 ? blurBakeResolution(blur, streetBakeResolution(renderer, recolourCache.resolutionCap)) : 0,
    })
    : null);
  const decoArt = (deco, available) => (available.has(deco.sprite) ? deco.sprite : DECO_TWINS[deco.sprite] || deco.sprite);
  /** Placements that play their deco's timeline (js/deco-anim.js), all on one clock from now. */
  const animClock = performance.now();
  const animViews = [];
  const animates = (deco, art) => Boolean(PIXI.AnimatedSprite) && isAnimatedDeco(deco, art);
  /**
   * The far and blurred sharp copies this street can afford at the renderer's resolution now: at
   * the finest far slack (FAR_SLACKS) where all of them fit the budget, else the coarsest, most
   * magnified first. Sets farSlack.
   */
  const farSharp = () => {
    const wanted = [];
    const mz = (street.layers || []).findIndex((layer) => layer.id === 'middleground');
    const mlz = mz < 0 ? null : (street.layers[mz].z ?? mz);
    (street.layers || []).forEach((layer, li) => {
      if (!layerIsDrawn(layer)) return;
      const far = mlz !== null && (layer.z ?? li) < mlz;
      const blur = flashBlurSize(layer.filters?.blur);
      if (!far && !blur) return;
      for (const deco of layer.decos || []) {
        if (deco.src) continue;
        const url = `${decoBase}${decoArt(deco, available)}.png`;
        if (isSharpDeco(url) && !animates(deco, decoArt(deco, available))) wanted.push([url, far, blur]);
      }
    });
    let admitted = new Set();
    for (const slack of FAR_SLACKS) {
      const picks = wanted.map(([url, far, blur]) => sharpPick(url, far, blur, slack));
      admitted = admitSharp(picks);
      farSlack = slack;
      if (picks.every((p) => !p || admitted.has(p.url))) break;
    }
    return admitted;
  };
  let farAdmitted = farSharp();
  // An SVG, or a far WebP downscaled to its need, draws at width x height; other WebPs as they are.
  const sharpTexture = (pick) => textureFromUrl(pick.url, pick.width
    ? { raw: true, width: pick.width, height: pick.height, resolution: pick.resolution }
    : { raw: true });
  /** @type {{ spr: any, url: string, pick: any, size: () => void }[]} */
  const sharpViews = [];
  const middleZ = (street.layers || []).findIndex((layer) => layer.id === 'middleground');
  const middleLayerZ = middleZ < 0 ? null : (street.layers[middleZ].z ?? middleZ);
  const layerContainers = [];
  const decoViews = new Map();
  const missingSprites = new Set();
  let drawn = 0;
  let signed = 0;
  // Layers above the middleground cover the avatars and entities (layerDrawsInFront). They
  // live in their own container with the root's coordinates; the game puts it above its
  // entity layer (game.js syncStreetFront) and it goes when the street view is destroyed.
  const front = new PIXI.Container();
  front.sortableChildren = true;
  front.label = 'street-front';
  root.frontView = front;
  root.once('destroyed', () => {
    if (!front.destroyed) front.destroy({ children: true });
  });

  for (let li = 0; li < (street.layers || []).length; li++) {
    const layer = street.layers[li];
    if (!layerIsDrawn(layer)) continue;
    const lc = new PIXI.Container();
    lc.sortableChildren = true;
    lc.zIndex = (layer.z ?? li) * 10;
    lc.label = layer.id;
    lc.skirtLayer = layer;
    // Every layer except the middleground is its own parallax canvas whose
    // decos use layer-local coordinates (needs the imported w/h).
    const parallax = layer.id !== 'middleground' && layer.w > 0 && layer.h > 0;
    lc.parallaxLayer = parallax ? { w: layer.w, h: layer.h } : null;
    // A parallax layer moves on its own every frame: as a render group its
    // children keep their transforms and only the group offset changes.
    if (parallax) lc.isRenderGroup = true;
    const colour = colourFilter(PIXI, layer.filters);
    if (colour) lc.filters = [colour];
    const far = middleLayerZ !== null && (layer.z ?? li) < middleLayerZ;
    // A blur under 2 is no blur in the client (flashBlurSize): those layers only recolour.
    const blur = flashBlurSize(layer.filters?.blur);

    for (const deco of layer.decos || []) {
      // Archived `middleground` decos use location/world coordinates, while
      // authored depth layers (`T_<timestamp>`) store registration points in
      // the layer's already-normalized 0..width / 0..height canvas space.
      // Applying worldToScreen twice pushed entire underground race layers
      // one street-width down/right, leaving only collision debug lines.
      const localLayer = parallax || /^T_/.test(String(layer.id || ''));
      // #602: spare art parked wholly over the street's top, which Glitch never showed.
      if (!localLayer && street.bounds && decoWhollyAboveTop(deco, street.bounds.t)) continue;
      const pos = localLayer
        ? { x: deco.x, y: deco.y }
        : worldToScreen(street, deco.x, deco.y);
      // #482: a reconstructed street's own art (the subway's stations and car, js/subway.js
      // stationDecos / carDecos) names its file outright, outside the deco library, and may
      // name a crop of it (`frame`: x, y, w, h in the file's own px).
      const own = Boolean(deco.src);
      const sprite = own ? deco.sprite : available.has(deco.sprite) ? deco.sprite : DECO_TWINS[deco.sprite] || deco.sprite;
      if (!own && !available.has(sprite)) {
        missingSprites.add(deco.sprite);
        // skip tiny missing decorations to reduce noise; keep platform-like names as placeholders
        if (/platform|dirt|mound|crosssection|patch|trunk|ladder/i.test(deco.sprite)) {
          lc.addChild(makePlaceholder(PIXI, deco, pos));
        }
        continue;
      }
      const url = own ? deco.src : `${decoBase}${sprite}.png`;
      const farUrl = far && !own ? decoUrl(url) : null;
      // A playing deco draws its strip (the still until it loads), never a sharp copy.
      const animated = !own && animates(deco, sprite);
      // G1174: a deco squashed below its stage gets back the blur its own SWF drew at its own size.
      const lostBlur = !own && !animated ? blurFix(sprite, deco.w, deco.h) : null;
      const sharp = !own && !animated && !lostBlur && isSharpDeco(url);
      let pick = sharp ? sharpPick(url, far, blur) : null;
      if (pick && (far || blur) && !farAdmitted.has(pick.url)) pick = null;
      let tex = pick ? sharpTexture(pick) : farUrl ? textureFromUrl(farUrl, { raw: true }) : textureFromUrl(url);
      if (own && deco.frame) tex = frameTexture(tex, new PIXI.Rectangle(...deco.frame));
      const spr = animated ? new PIXI.AnimatedSprite([tex]) : new PIXI.Sprite(tex);
      anchorBottomCentre(spr, 'deco');
      // h_flip mirrors the deco about its registration point.
      const sizeDeco = () => {
        // The street may be gone before a slow texture arrives.
        if (spr.destroyed) return;
        const pad = spr.blurPad || { px: 0, py: 0 };
        if (deco.w > 0) spr.width = deco.w + 2 * pad.px;
        if (deco.h > 0) spr.height = deco.h + 2 * pad.py;
        if (deco.flip) spr.scale.x = -Math.abs(spr.scale.x);
      };
      sizeDeco();
      if (!isLoaded(tex)) onLoaded(tex.source, sizeDeco);
      if (lostBlur) onLoaded(tex.source, () => applyLostBlur(PIXI, spr, tex, deco, lostBlur, sizeDeco));
      if (deco.hidden) spr.visible = false;
      spr.x = pos.x;
      spr.y = pos.y;
      spr.zIndex = deco.z || 0;
      if (deco.r) spr.angle = deco.r;
      spr.glitchDecoId = deco.id || '';
      spr.glitchDecoName = deco.name || '';
      spr.glitchDecoSprite = deco.sprite || '';
      if (spr.glitchDecoId) decoViews.set(spr.glitchDecoId, spr);
      // #570: a sign deco's words (js/deco-sign.js signWords), printed in it as the client did.
      if (opts.signWords !== false && addSignWords(PIXI, spr, deco)) signed += 1;
      lc.addChild(spr);
      if (sharp && !blur) sharpViews.push({ spr, url, far, pick, size: sizeDeco });
      if (animated) {
        attachAnim(PIXI, spr, sprite, {
          clock: animClock,
          resolution: streetBakeResolution(renderer, recolourCache.resolutionCap),
          far,
          blur,
          size: sizeDeco,
          onReady: (s) => (s.parent === lc && lc.recoloured ? recolourAnim(PIXI, renderer, recolourCache, s, lc) : false),
        });
        animViews.push(spr);
      }
      drawn += 1;
    }
    // Ladder tiling art (its own count, not a placed deco).
    if (layer.id === 'middleground') root.ladderTiles = addLadderTiles(PIXI, lc, street, available, decoBase);
    if (blur > 0 && opts.renderer) bakeBlurredLayer(lc, blur, colour, blurState);
    else if (colour && opts.renderer) bakeLayerColour(PIXI, opts.renderer, lc, colour, recolourCache);
    lc.inFront = layerDrawsInFront(layer, li, middleLayerZ);
    (lc.inFront ? front : root).addChild(lc);
    layerContainers.push(lc);
  }
  const skirtDepth = H - sourceH + Math.max(0, Number(opts.skirtBelow) || 0);
  if (skirtDepth > 0 && opts.renderer) {
    // The layers in the band and their places there (skirtBandOffset: ticket 21 adds the back layers).
    for (const lc of layerContainers) lc.skirtAt = skirtBandOffset(lc.skirtLayer, W, sourceH, lc.inFront);
    const grounds = layerContainers.filter((lc) => lc.skirtAt);
    // Ticket 39: black (000000) is a colour, not a missing one (Panka Surazu's skirt drew meadow green).
    const parsed = parseInt(String(street.gradient?.bottom || '').replace(/^#/, ''), 16);
    const fallback = Number.isFinite(parsed) ? parsed : 0x6b8f3c;
    // The front layers' art below the edge fades into the skirt, from under the deepest walkable
    // ground (four streets walk up to 50 px below their edge: Camsteeple Strat).
    const fronts = layerContainers.filter((lc) => lc.inFront);
    buildGroundSkirt(PIXI, opts.renderer, root, grounds, W, sourceH, skirtDepth, Number.isFinite(parsed) ? parsed : null, fallback, fronts, deepestPlatformY - sourceH, Math.max(0, Number(opts.skirtRight) || 0));
  }
  // EDGE MIRROR (G582): each layer's art mirrored past its ends, where the camera can show past them.
  if (opts.edgeMirror && opts.renderer) {
    attachEdgeMirrors(PIXI, opts.renderer, root, layerContainers, W, sourceH, opts.edgeMirror.insetShare || 0);
  }
  root.decoDrawn = drawn;
  root.signWordsDrawn = signed;
  /** Decos that play, for QA (canvas data-anim-decos): placed, strips in, playing, stopped off screen. */
  root.animStats = (detail = false) => {
    const live = animViews.filter((s) => !s.destroyed);
    const ready = live.filter((s) => s.decoAnim?.ready);
    const strips = new Set(ready.map((s) => s.decoAnim.url));
    return {
      placed: live.length,
      ready: ready.length,
      playing: ready.filter((s) => s.playing).length,
      stopped: ready.filter((s) => !s.playing).length,
      strips: strips.size,
      threeX: [...strips].filter((u) => /@1\.5x\.webp$/.test(u)).length,
      // Still on their first frame: strip not in yet, or a recoloured layer past its budget.
      still: [...new Set(live.filter((s) => !s.decoAnim?.ready).map((s) => s.decoAnim?.name))],
      // With `detail`: each deco, its frame and its box on the stage (QA crops).
      ...(detail ? {
        views: live.map((s) => {
          const b = s.getBounds?.();
          return { name: s.decoAnim?.name, playing: Boolean(s.playing), frame: s.currentFrame, box: b ? [b.x, b.y, b.width, b.height].map(Math.round) : null };
        }),
      } : {}),
    };
  };
  root.animViews = animViews;
  /** Sharp decos drawn from their SVG / sized WebP right now, for QA (canvas data-sharp-decos). */
  root.sharpStats = () => {
    const live = sharpViews.filter((v) => !v.spr.destroyed);
    return {
      listed: live.length,
      svg: live.filter((v) => v.pick?.kind === 'svg').length,
      webp: live.filter((v) => v.pick?.kind === 'webp').length,
      far: live.filter((v) => v.far && v.pick).length,
      farAdmitted: farAdmitted.size,
    };
  };
  /**
   * Pick each sharp deco's copy again for the renderer's resolution now (an SVG redrawn at the
   * new need, a sized WebP, or back to the 2x/3x file) and swap it in once loaded. Runs on the
   * renderer's resize event when the resolution changed.
   */
  root.refreshSharpDecos = () => {
    farAdmitted = farSharp();
    for (const view of sharpViews) {
      if (view.spr.destroyed) continue;
      let pick = sharpPick(view.url, view.far);
      if (pick && view.far && !farAdmitted.has(pick.url)) pick = null;
      if ((pick?.url || null) === (view.pick?.url || null)) continue;
      view.pick = pick;
      const tex = pick ? sharpTexture(pick) : view.far ? textureFromUrl(decoUrl(view.url), { raw: true }) : textureFromUrl(view.url);
      onLoaded(tex.source, () => {
        if (view.spr.destroyed || view.pick !== pick) return;
        swapDecoTexture(PIXI, renderer, recolourCache, view.spr, tex);
        view.size();
      });
    }
  };
  if (sharpViews.length && typeof renderer?.on === 'function') {
    const bakeRes = () => streetBakeResolution(renderer, recolourCache.resolutionCap);
    let lastResolution = bakeRes();
    let timer = null;
    const onResize = () => {
      if (bakeRes() === lastResolution) return;
      lastResolution = bakeRes();
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!root.destroyed) root.refreshSharpDecos();
      }, 250);
    };
    renderer.on('resize', onResize);
    root.once('destroyed', () => {
      clearTimeout(timer);
      renderer.off?.('resize', onResize);
    });
  }
  /** Labels of the layers drawn over the avatars, for QA (canvas data-street-front-layers). */
  root.frontLayers = layerContainers.filter((lc) => lc.inFront).map((lc) => lc.label);
  root.decoViews = decoViews;
  root.parallaxLayers = layerContainers.filter((lc) => lc.parallaxLayer);
  // MINIMAP (G370, js/ui/street-minimap.js snapshotStreetView): every layer, and the sky it leaves out.
  root.layerContainers = layerContainers;
  root.skyView = skyView;
  // G1167: the layer the sky gradient goes with (skyGradientLayerIndex). The middleground, or a
  // layer without its own size, does not slide: its span is the street's, 0 to sourceH.
  const skyLayer = (street.layers || [])[skyGradientLayerIndex(street.layers)];
  const skyLc = layerContainers.find((lc) => lc.skirtLayer === skyLayer && lc.parallaxLayer) || null;
  /**
   * G1167: put the sky for a view whose top-left is camX, camY, vpW x skyH (the canvas, the pack's
   * band included): the gradient on the backmost layer where updateParallax left it this frame.
   */
  root.placeSky = (camX, camY, vpW, skyH) => {
    if (!skyParts) return;
    const at = skyGradientPlacement(skyLc ? skyLc.y : 0, skyLc ? skyLc.parallaxLayer.h : sourceH, camY, skyH, vpW / 16);
    const put = (spr, span) => {
      spr.x = camX;
      spr.y = span.y;
      spr.width = vpW;
      spr.height = span.h;
    };
    put(skyParts.base, at.base);
    put(skyParts.gradient, at.gradient);
    // SKY FILL (js/location-view.js stageBandColour): the sky's colour at the view's top edge, which
    // the band over a short street on an upright phone carries on up.
    root.viewSkyTop = skyColourAt(street.gradient.top, street.gradient.bottom, at.gradient.y, at.gradient.h, camY);
    skyParts.cap.visible = Boolean(at.cap);
    if (at.cap) put(skyParts.cap, at.cap);
    // Below the street's bottom: ground, never the sky's bottom colour (groundBelow, above).
    if (skyParts.ground) {
      const span = groundBelowSpan(sourceH, camY, skyH);
      skyParts.ground.visible = Boolean(span);
      if (span) {
        if (Number.isFinite(root.groundSkirt?.colour)) skyParts.ground.tint = root.groundSkirt.colour;
        put(skyParts.ground, span);
      }
    }
  };
  /** QA (G1167): the gradient's layer and where it ran at the last placeSky. */
  root.skyStats = () => (skyParts ? {
    layer: skyLc ? skyLc.label : skyLayer?.id || null,
    y: skyParts.gradient.y,
    h: skyParts.gradient.height,
    cap: skyParts.cap.visible ? { y: skyParts.cap.y, h: skyParts.cap.height } : null,
  } : null);
  root.skyTop = stageSkyColour(street);
  // The client filters the whole middleground plane, so avatars and items on
  // it share the decos' treatment (Hell One's greyscale Glitches).
  const middleground = (street.layers || []).find((layer) => layer.id === 'middleground');
  root.middlegroundMatrix = glitchLayerMatrix(middleground?.filters || {});
  /**
   * Cull decos outside the camera (plus a margin) so Pixi skips them: fewer
   * draws, and their textures go unused so Pixi's texture GC can free them.
   * Call once per frame after updateParallax; it only re-tests once the
   * camera has moved a quarter of the margin.
   */
  let lastCull = null;
  let cullAgain = false;
  /**
   * G714 (#312): a lost and restored WebGL context (WebKit drops it under memory pressure or in a
   * background tab) gives back every image texture, which uploads again from its image, but a
   * render texture comes back empty: the layers' colour bakes and blur tiles, so a street's
   * decorations went and stayed gone. Forget every bake; the next cull bakes again what is near
   * the camera (the path a deco takes coming back into view), and the edge mirrors and the ground
   * skirt draw again (G1166).
   * Returns how many bakes it dropped.
   */
  root.dropBakes = () => {
    let dropped = 0;
    for (const entry of recolourCache.entries.values()) {
      if (!entry.texture) continue;
      for (const user of entry.users) if (!user.destroyed) setDecoTexture(PIXI, user, user.recolour.original);
      entry.texture.destroy(true);
      entry.texture = null;
      recolourCache.textures.delete(entry.id);
      dropped += 1;
    }
    for (const layer of blurState.layers) {
      for (const tile of layer.tiles) {
        if (!tile.texture) continue;
        freeBlurTile(tile, blurState);
        dropped += 1;
      }
    }
    root.edgeMirrorRebuild?.();
    // G1166: the ground skirt and the front layers' fades are render textures too.
    root.groundSkirtRebuild?.();
    cullAgain = true;
    return dropped;
  };
  /**
   * MINIMAP (#561, js/ui/street-minimap.js snapshotStreetView): ready the whole street for one
   * picture of it, with its layers unculled. Every blur tile is baked (bakeMissingBlurTiles), and
   * a recoloured deco whose copy was freed far from the camera gets it back (evictRecolours frees
   * it again on its next pass). Returns the function that frees the tiles baked only for it.
   */
  root.bakeForSnapshot = () => {
    for (const entry of recolourCache.entries.values()) {
      if (entry.texture) continue;
      const user = [...entry.users].find((u) => !u.destroyed);
      if (user) ensureRecoloured(PIXI, opts.renderer, recolourCache, user);
    }
    return bakeMissingBlurTiles(blurState);
  };
  root.cullDecos = (camX, camY, vpW, vpH, force = false) => {
    const now = performance.now();
    if (cullAgain) {
      cullAgain = false;
      force = true;
    }
    if (now - recolourCache.lastEvict > 2000) {
      recolourCache.lastEvict = now;
      evictRecolours(recolourCache, now);
      evictBlurTiles(blurState, now);
    }
    blurState.culled = true;
    if (blurState.layers.length) refreshBlurTiles(blurState);
    // A blurred layer was just tiled: place its first tiles now.
    if (blurState.dirty) {
      blurState.dirty = false;
      force = true;
    }
    if (!force && lastCull && Math.abs(lastCull.x - camX) < CULL_MARGIN / 4 && Math.abs(lastCull.y - camY) < CULL_MARGIN / 4 && lastCull.w === vpW && lastCull.h === vpH) return;
    lastCull = { x: camX, y: camY, w: vpW, h: vpH };
    let culled = 0;
    const rebake = (spr) => (spr.blurTile ? bakeBlurTile(spr.blurTile, blurState) : ensureRecoloured(PIXI, opts.renderer, recolourCache, spr));
    for (const lc of layerContainers) culled += cullLayer(lc, camX, camY, vpW, vpH, rebake, now);
    root.culledDecos = culled;
  };
  /**
   * Call once per frame with the camera's top-left in screen space. `snap` ({ x, y, dx, dy }: the
   * renderer resolution on an axis whose camera rests, 0 while it moves, and the camera's
   * direction of travel) settles each layer on a device pixel at rest without stepping back;
   * moving layers keep their exact share (js/camera-feel.js). `skyH` is the height the sky covers
   * (the canvas, the pack's band included: placeSky).
   */
  root.updateParallax = (camX, camY, vpW, vpH, skyH = vpH, snap = null) => {
    const slidesX = W - vpW > 0;
    const slidesY = sourceH - vpH > 0;
    for (const lc of root.parallaxLayers) {
      const layer = lc.parallaxLayer;
      const at = parallaxLayerOffset(layer, camX, camY, vpW, vpH, W, sourceH);
      const x = drawnLayerOffset(at.x, camX, snap?.x || 0, slidesX ? layerScreenDir(snap?.dx, vpW, layer.w) : 0, lc.screenX);
      // Held past the street's top or bottom (#483), it moves on screen with the ground.
      const heldY = camY < 0 || camY > sourceH - vpH;
      const dirY = !slidesY ? 0 : heldY ? -Math.sign(snap?.dy || 0) : layerScreenDir(snap?.dy, vpH, layer.h);
      const y = drawnLayerOffset(at.y, camY, snap?.y || 0, dirY, lc.screenY);
      if (lc.x !== x || lc.y !== y) lastCull = null;
      lc.x = x;
      lc.y = y;
      // Its art fade (buildGroundSkirt) goes with it.
      if (lc.edgeFade) {
        lc.edgeFade.x = x;
        lc.edgeFade.y = y;
      }
      // Where it lands on screen this frame: the next frame's settle never steps back past it.
      lc.screenX = x - camX;
      lc.screenY = y - camY;
    }
    root.placeSky(camX, camY, vpW, skyH);
    root.edgeMirrorFrame?.(camX, vpW);
  };

  // Collision geometry is normally invisible, as it was in the original
  // client. Keep an explicit opt-in overlay for geometry troubleshooting.
  if (opts.debugPlatforms === true) {
    const platG = new PIXI.Graphics();
    platG.zIndex = 5000;
    for (const p of plats) {
      platG.moveTo(p.x1, p.y1);
      platG.lineTo(p.x2, p.y2);
      platG.stroke({ width: 2, color: 0x3d2a14, alpha: 0.35 });
    }
    root.addChild(platG);
  }

  // Signposts — original post/arm/shadow art (TSEngineAssets → SignpostView.as)
  // G1153: a signpost with a deco (a tower lift) draws that art instead, unless the street
  // already draws the same art at the post (signDecoDrawn).
  const signDecoArt = (s) => {
    if (signDecoDrawn(street, s)) return null;
    const sprite = available.has(s.deco.sprite) ? s.deco.sprite : DECO_TWINS[s.deco.sprite] || s.deco.sprite;
    if (!available.has(sprite)) {
      missingSprites.add(s.deco.sprite);
      return null;
    }
    const url = `${decoBase}${sprite}.png`;
    const pick = isSharpDeco(url) ? sharpPick(url) : null;
    return pick ? sharpTexture(pick) : textureFromUrl(url);
  };
  const signViews = [];
  // G1154: the posts stand in the middleground and take its colour filter.
  const signColour = colourFilter(PIXI, (street.layers || []).find((l) => l.id === 'middleground' || l.name === 'middleground')?.filters);
  for (const s of street.signposts || []) {
    const pos = worldToScreen(street, s.x, s.y);
    const g = s.deco?.sprite ? buildSignDecoView(PIXI, s, pos, { art: signDecoArt(s), plate: s.plate || '' }) : buildSignpostSprite(PIXI, s, pos);
    colourSignpost(g, signColour);
    g.nav = pickConnection(s, availableStreetTsids());
    root.addChild(g);
    signViews.push(g);
  }

  root.street = street;
  root.platformsScreen = plats;
  root.signViews = signViews;
  root.worldW = W;
  root.worldH = H;
  root.sourceWorldH = sourceH;
  root.cameraBottomPadding = cameraBottomPadding;
  root.missingSprites = missingSprites;
  return root;
}

/**
 * R51 (#656, #645): everything a street draws, in one list. buildStreetView draws the `view`
 * kinds itself (its layers, their decos, the signposts); the `entities` kinds stand on the entity
 * layer with the avatars (the doors feature adds each door, js/door-view.js), each sprite marked
 * with its kind (`streetEntity`). The street's snapshots draw every kind here: the street map
 * (features/street-minimap-feature.js streetEntities keeps the entity layer's marked sprites)
 * and the loading strip (tools/loading-strips/render.html, buildStreetEntities below). Glitch's
 * own snapshot did the same: getSnapshot hid only the players and the itemstacks, and kept the
 * doors and signposts (LocationRenderer.as 618-660, hiding a door only when it is hidden).
 */
export const STREET_DRAWN = Object.freeze({
  view: Object.freeze(['layer', 'deco', 'signpost']),
  entities: Object.freeze(['door']),
});
/** The entity kinds a street's snapshot keeps (a sprite's `streetEntity`). */
export const STREET_ENTITY_KINDS = STREET_DRAWN.entities;

/** Mark a sprite on the entity layer as one of the street's own things (STREET_ENTITY_KINDS). */
export function markStreetEntity(sprite, kind) {
  if (sprite && STREET_ENTITY_KINDS.includes(kind)) sprite.streetEntity = kind;
  return sprite;
}

/**
 * PURE (R51): the street's entity-layer things, from its JSON: every shown door (js/doors.js
 * visibleDoors), as { kind, door }. Each kind is one of STREET_ENTITY_KINDS.
 */
export function streetEntityRows(street) {
  return visibleDoors(street).map((door) => ({ kind: 'door', door }));
}

/**
 * R51: the street's entity-layer things drawn as the game draws them (streetEntityRows), for a
 * picture of the street with no game running (the loading strip), sorted as the entity layer
 * sorts. `available` is the deco manifest.
 */
export function buildStreetEntities(PIXI, street, available = new Set()) {
  const layer = new PIXI.Container();
  layer.label = 'street-entities';
  layer.sortableChildren = true;
  for (const row of streetEntityRows(street)) {
    if (row.kind === 'door') layer.addChild(markStreetEntity(buildDoorSprite(PIXI, row.door, available).sprite, 'door'));
  }
  return layer;
}

export { signpostNear, pickConnection, platformsScreen, worldToScreen };
