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
} from './street-model.js?v=23b926e5';
import { availableStreetTsids } from './street-loader.js?v=d6cbbd5c';
import { frameTexture, isLoaded, onFailed, onLoaded, textureFromUrl } from './textures.js?v=01a295a1';
import { admitSharp, decoUrl, isSharpDeco, maxTextureSizeOf, sharpDeco } from './deco-hires.js?v=a65f2d79';
import { LADDER_TILE_Z, ladderTilePieces } from './ladder-tiling.js?v=4f9e07fa';
import { attachAnim, isAnimatedDeco, setAnimSource, setDecoTexture, syncAnim } from './deco-anim.js?v=b3fc64f2';
import { drawnLayerOffset, layerScreenDir } from './camera-feel.js?v=e668afc5';

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
});
const PLACEHOLDER = 0x5a7a4a;
/** Original engine art from TSEngineAssets (SignpostView.as). */
const SIGNPOST = {
  post: 'assets/ui/signpost/signpost_post.png',
  arm: 'assets/ui/signpost/signpost_arm.png',
  shadow: 'assets/ui/signpost/signpost_shadow.png',
  /** Original holder.scale = 0.8 */
  scale: 0.8,
};

/** SignpostView: CSS signpost fontSize 14, rendered at 2.8x, arm_padd_x 8. */
const SIGN_FONT_SIZE = 14;
const SIGN_TEXT_RESOLUTION = 3;
const SIGN_ARM_PAD_X = 8;
const SIGN_GLOW_COLOUR = 0x53e5ff;
const SIGN_LABEL_STYLE = Object.freeze({
  fontFamily: 'Trebuchet MS, Georgia, serif',
  fontSize: SIGN_FONT_SIZE,
  fontWeight: '700',
  // The glow's strength 3 is approximated by a soft stroke under a blur.
  stroke: { color: 'rgba(255,255,255,0.45)', width: 3 },
  lineJoin: 'round',
  dropShadow: { alpha: 0.6, blur: 2, color: 0xffffff, distance: 0 },
  padding: 3,
});

/** makeSign: an arm fits its label plus 8px either side (holder units). */
export function signArmWidth(PIXI, labelText) {
  const metrics = PIXI.CanvasTextMetrics.measureText(String(labelText), new PIXI.TextStyle(SIGN_LABEL_STYLE));
  return Math.ceil(metrics.width + 2 * SIGN_ARM_PAD_X);
}

/** @type {Set<string>|null} */
let decoManifest = null;
/** @type {Record<string, import('pixi.js').Texture>|null} */
let signTextures = null;

/**
 * Preload original signpost PNGs (post / arm / shadow).
 * @param {typeof PIXI} PIXI
 */
export async function loadSignpostTextures(PIXI) {
  if (signTextures) return signTextures;
  signTextures = {};
  await Promise.all(
    Object.entries(SIGNPOST)
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
      )
  );
  return signTextures;
}

/**
 * Build a SignpostView-style post with alternating wooden arms + labels.
 * Mirrors SignpostView.as (post, shadow, arms left/right at ±5.5°, scale 0.8).
 * @param {typeof PIXI} PIXI
 * @param {object} signpost
 * @param {{ x: number, y: number }} pos screen
 */
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
    shadow.anchor.set(0.5, 1);
    shadow.y = 6;
    shadow.alpha = 0.75;
    shadow.label = 'sign-shadow';
    holder.addChild(shadow);
  }
  // Post (not brightened on hover — only arms + text)
  let postH = 200;
  if (tex.post && !tex.post.source?.destroyed) {
    const post = new PIXI.Sprite(tex.post);
    post.anchor.set(0.5, 1);
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

  // Collect visible connections (all, with preferred loaded one first for label emphasis)
  const connects = (signpost.connects || []).filter((c) => c && (c.label || c.tsid));
  const available = availableStreetTsids();
  // Show up to 4 arms like typical posts
  const shown = connects.slice(0, 4);
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
    // down, with a soft white glow (StaticFilters.white1pxSignpost_GlowA).
    const baseFill = isLoaded ? 0x2a1a08 : 0x4a3a28;
    const label = new PIXI.Text({ text: labelText, style: { ...SIGN_LABEL_STYLE, fill: baseFill } });
    label.resolution = SIGN_TEXT_RESOLUTION;
    label.anchor.set(0.5, 0.5);
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
    g.signHoverParts.labels.push(label);
    g.signHoverParts.baseLabelFills.push(baseFill);
    g.signBoards.push({
      index: visibleI,
      connection: conn,
      arm: armSprite,
      glow,
      label,
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
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: 12,
      fill: 0x3a2a18,
      fontWeight: '700',
    } });
    empty.anchor.set(0.5, 1);
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

/**
 * Glow the hovered destination board (SignpostView: tsSprite_GlowA on the sign).
 * @param {PIXI.Container} g  signpost container from buildSignpostSprite
 * @param {boolean} on
 * @param {number|null} [boardIndex] individual arm index; null affects every arm
 */
export function setSignpostHover(g, on, boardIndex = null) {
  if (!g || g.destroyed) return;
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
 * Hit-test one destination board in world/Pixi coordinates. The post and other
 * arms deliberately do not count, matching the original per-destination UI.
 * @param {any[]} signViews
 * @param {number} worldX
 * @param {number} worldY
 */
export function signpostBoardAt(signViews, worldX, worldY) {
  for (const view of [...(signViews || [])].reverse()) {
    if (!view || view.destroyed) continue;
    const scale = Number(view.signScale) || 1;
    const holderX = (Number(worldX) - (Number(view.x) || 0)) / scale;
    const holderY = (Number(worldY) - (Number(view.y) || 0)) / scale;
    for (const board of [...(view.signBoards || [])].reverse()) {
      const dx = holderX - (Number(board.x) || 0);
      const dy = holderY - (Number(board.y) || 0);
      const rotation = Number(board.rotation) || 0;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const localX = dx * cos + dy * sin;
      const localY = -dx * sin + dy * cos;
      const hit = board.hitArea;
      if (
        hit &&
        localX >= hit.x &&
        localX <= hit.x + hit.width &&
        localY >= hit.y &&
        localY <= hit.y + hit.height
      ) {
        return {
          view,
          board,
          index: board.index,
          connection: board.connection,
        };
      }
    }
  }
  return null;
}

/** Load list of available deco basenames (no .png). */
export async function loadDecoManifest() {
  if (decoManifest) return decoManifest;
  try {
    const res = await fetch('assets/decos/manifest.json?v=puzzles-1');
    if (res.ok) {
      const list = await res.json();
      decoManifest = new Set(list);
      return decoManifest;
    }
  } catch { /* */ }
  decoManifest = new Set();
  return decoManifest;
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

function colourFilter(PIXI, filters) {
  const matrix = filters ? glitchLayerMatrix(filters) : null;
  if (!matrix) return null;
  const cm = new PIXI.ColorMatrixFilter();
  cm.matrix = matrix;
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
    const res = blurBakeResolution(size, renderer.resolution);
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

/** Render one deco texture through the layer's colour matrix. */
function bakeRecolour(PIXI, renderer, base, colour) {
  trimTexturePool(PIXI);
  const holder = new PIXI.Sprite(frameTexture(base));
  holder.filters = [colour];
  const texture = renderer.generateTexture({
    target: holder,
    frame: new PIXI.Rectangle(0, 0, base.width, base.height),
    resolution: base.resolution,
  });
  holder.texture.destroy();
  holder.filters = null;
  holder.destroy();
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
    entry = { id, base, colour, texture: bakeRecolour(PIXI, renderer, base, colour), users: new Set(), seen: now, bytes: recolourBudgetBytes(base) };
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
  entry.texture = bakeRecolour(PIXI, renderer, entry.base, entry.colour);
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
 * The client's camera never left the street, so it could clamp. The remake's
 * camera runs past the declared bottom to frame low platforms above the pack
 * (cameraWorldHeightForGround), so the slide continues on the same line: a
 * clamp froze same-size layers such as Hechey Track's `middleplus` dirt while
 * the ground kept moving, opening gaps of sky under the grass.
 *
 * The client floored each layer's slide to a whole pixel on its own. At the remake's Retina
 * densities that is a 2-2.5 device px step on a different frame for every layer, so the layers
 * wobbled against each other while the camera eased to a stop (FEEL, js/camera-feel.js). The
 * offset is exact here; updateParallax snaps it to device pixels only when the camera rests.
 */
export function parallaxLayerOffset(layer, camX, camY, vpW, vpH, streetW, streetH) {
  const maxX = streetW - vpW;
  const maxY = streetH - vpH;
  const percX = maxX > 0 ? camX / maxX : 1;
  const percY = maxY > 0 ? camY / maxY : 1;
  return {
    x: camX + percX * (vpW - layer.w),
    y: camY + percY * (vpH - layer.h),
  };
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

/** A 1 x 32 ramp of one colour from clear to opaque. */
function fadeTexture(PIXI, colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const hex = `#${colour.toString(16).padStart(6, '0')}`;
  const grad = ctx.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, `${hex}00`);
  grad.addColorStop(1, `${hex}ff`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1, 32);
  return PIXI.Texture.from(canvas);
}

/**
 * Fill the strip under a street's bottom edge (street art ends at bounds.b;
 * the camera can show up to MIN_GROUND_CLEARANCE below it, and the canvas
 * runs on under the overlaid pack). The middleground's last row is stretched
 * down and fades into a fill of its average colour, so the ground carries on
 * instead of showing the sky gradient's bottom colour.
 */
function buildGroundSkirt(PIXI, renderer, root, lc, W, sourceH, depthPx, fallback) {
  const depth = Math.ceil(depthPx);
  if (!lc || depth <= 0 || W <= 0) return;
  const ROWS = 3;
  const CHUNK = 4096;
  const build = () => {
    if (lc.destroyed || root.destroyed) return;
    const strip = new PIXI.Container();
    strip.zIndex = lc.zIndex - 1;
    const fill = new PIXI.Graphics();
    strip.addChild(fill);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let x0 = 0; x0 < W; x0 += CHUNK) {
      const w = Math.min(CHUNK, Math.ceil(W - x0));
      const rt = PIXI.RenderTexture.create({ width: w, height: ROWS });
      // Pixi 8 drops the filters of the container it renders (and makes it a
      // render group), so render the layer inside a throwaway parent: its live
      // colour filter and local transform apply as they did in Pixi 7.
      const parent = lc.parent;
      const index = parent ? parent.getChildIndex(lc) : -1;
      const shell = new PIXI.Container();
      shell.addChild(lc);
      // Decos culled for the camera still belong in the strip.
      const culled = lc.children.filter((child) => child.culled);
      for (const child of culled) child.culled = false;
      renderer.render({ container: shell, target: rt, transform: new PIXI.Matrix(1, 0, 0, 1, -x0, -(sourceH - ROWS)), clear: true });
      for (const child of culled) child.culled = true;
      if (parent) parent.addChildAt(lc, index);
      shell.destroy();
      try {
        const { pixels: px } = renderer.extract.pixels(rt);
        for (let i = 0; i < px.length; i += 16) {
          const a = px[i + 3];
          if (a < 200) continue;
          // Pixi 7's extract un-premultiplied first; this keeps its averaged colour.
          r += (px[i] * 255 / a) * 255 / a;
          g += (px[i + 1] * 255 / a) * 255 / a;
          b += (px[i + 2] * 255 / a) * 255 / a;
          n += 1;
        }
      } catch { /* extract can fail on a lost context: the stretch still draws */ }
      const spr = new PIXI.Sprite(frameTexture(rt.source, new PIXI.Rectangle(0, ROWS - 1, w, 1)));
      spr.x = x0;
      spr.y = sourceH - 1;
      spr.width = w;
      spr.height = depth + 1;
      strip.addChild(spr);
    }
    const colour = n
      ? (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)
      : fallback;
    fill.rect(0, sourceH - 1, W, depth + 1).fill(colour);
    const fade = new PIXI.Sprite(fadeTexture(PIXI, colour));
    fade.x = 0;
    fade.y = sourceH - 1;
    fade.width = W;
    fade.height = Math.min(depth + 1, 36);
    strip.addChild(fade);
    const solid = new PIXI.Graphics();
    solid.rect(0, sourceH + 35, W, Math.max(0, depth - 35)).fill(colour);
    strip.addChild(solid);
    root.addChild(strip);
    root.groundSkirt = { depth, colour };
  };
  const sprites = [];
  lc.children.forEach(function walk(child) {
    if (child instanceof PIXI.Sprite) sprites.push(child);
    (child.children || []).forEach(walk);
  });
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
 *   renderer?: import('pixi.js').Renderer
 * }} [opts]
 */
export function buildStreetView(street, PIXI, opts = {}) {
  const decoBase = opts.decoBase || DECO_BASE;
  const available = opts.available || decoManifest || new Set();
  const root = new PIXI.Container();
  root.sortableChildren = true;
  const recolourCache = { PIXI, textures: new Map(), entries: new Map(), bytes: 0, evictions: 0, rebakes: 0, lastEvict: 0 };
  root.recolourCache = recolourCache;
  /** Ladder tiles drawn from the street's ladders' `tiling` (addLadderTiles). */
  root.ladderTiles = 0;
  /** Blurred layers' tiles (bakeBlurredLayer): counts for QA in root.blurStats. */
  const blurState = {
    PIXI, renderer: opts.renderer, layers: [], tiles: 0, bytes: 0, peakBytes: 0,
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

  // The location's own sky gradient, fixed to the viewport (positioned by
  // updateParallax). Streets without one keep the painted fallback below.
  let skyView = null;
  if (street.gradient?.top && street.gradient?.bottom) {
    skyView = new PIXI.Sprite(gradientTexture(PIXI, street.gradient.top, street.gradient.bottom));
    skyView.zIndex = -1100;
    root.addChild(skyView);
  }

  // Sky / depth backdrop (not solid ground strip alone)
  const sky = new PIXI.Graphics();
  const themeTop = 0x8eb8d8;
  const themeMid = 0xb5d4a0;
  const themeBot = 0x6b8f3c;
  sky.rect(0, 0, W, sourceH * 0.45).fill(themeTop);
  sky.rect(0, sourceH * 0.4, W, sourceH * 0.35).fill(themeMid);
  sky.rect(0, sourceH * 0.7, W, Math.max(sourceH * 0.35, H - sourceH * 0.7)).fill(themeBot);
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
  const sharpPick = (url, far = false, blur = 0) => (renderer
    ? sharpDeco(url, renderer.resolution || 1, {
      bigTextures: bigTextures(),
      far,
      blurDensity: blur > 0 ? blurBakeResolution(blur, renderer.resolution) : 0,
    })
    : null);
  const decoArt = (deco, available) => (available.has(deco.sprite) ? deco.sprite : DECO_TWINS[deco.sprite] || deco.sprite);
  /** Placements that play their deco's timeline (js/deco-anim.js), all on one clock from now. */
  const animClock = performance.now();
  const animViews = [];
  const animates = (deco, art) => Boolean(PIXI.AnimatedSprite) && isAnimatedDeco(deco, art);
  /** The far and blurred sharp copies this street can afford at the renderer's resolution now. */
  const farSharp = () => {
    const picks = [];
    const mz = (street.layers || []).findIndex((layer) => layer.id === 'middleground');
    const mlz = mz < 0 ? null : (street.layers[mz].z ?? mz);
    (street.layers || []).forEach((layer, li) => {
      if (!layerIsDrawn(layer)) return;
      const far = mlz !== null && (layer.z ?? li) < mlz;
      const blur = flashBlurSize(layer.filters?.blur);
      if (!far && !blur) return;
      for (const deco of layer.decos || []) {
        const url = `${decoBase}${decoArt(deco, available)}.png`;
        if (isSharpDeco(url) && !animates(deco, decoArt(deco, available))) picks.push(sharpPick(url, far, blur));
      }
    });
    return admitSharp(picks);
  };
  let farAdmitted = farSharp();
  const sharpTexture = (pick) => textureFromUrl(pick.url, pick.kind === 'svg'
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
      const pos = parallax || /^T_/.test(String(layer.id || ''))
        ? { x: deco.x, y: deco.y }
        : worldToScreen(street, deco.x, deco.y);
      const sprite = available.has(deco.sprite) ? deco.sprite : DECO_TWINS[deco.sprite] || deco.sprite;
      if (!available.has(sprite)) {
        missingSprites.add(deco.sprite);
        // skip tiny missing decorations to reduce noise; keep platform-like names as placeholders
        if (/platform|dirt|mound|crosssection|patch|trunk|ladder/i.test(deco.sprite)) {
          lc.addChild(makePlaceholder(PIXI, deco, pos));
        }
        continue;
      }
      const url = `${decoBase}${sprite}.png`;
      const farUrl = far ? decoUrl(url) : null;
      // A playing deco draws its strip (the still until it loads), never a sharp copy.
      const animated = animates(deco, sprite);
      const sharp = !animated && isSharpDeco(url);
      let pick = sharp ? sharpPick(url, far, blur) : null;
      if (pick && (far || blur) && !farAdmitted.has(pick.url)) pick = null;
      const tex = pick ? sharpTexture(pick) : farUrl ? textureFromUrl(farUrl, { raw: true }) : textureFromUrl(url);
      const spr = animated ? new PIXI.AnimatedSprite([tex]) : new PIXI.Sprite(tex);
      spr.anchor.set(0.5, 1);
      // h_flip mirrors the deco about its registration point.
      const sizeDeco = () => {
        // The street may be gone before a slow texture arrives.
        if (spr.destroyed) return;
        if (deco.w > 0) spr.width = deco.w;
        if (deco.h > 0) spr.height = deco.h;
        if (deco.flip) spr.scale.x = -Math.abs(spr.scale.x);
      };
      sizeDeco();
      if (!isLoaded(tex)) onLoaded(tex.source, sizeDeco);
      if (deco.hidden) spr.visible = false;
      spr.x = pos.x;
      spr.y = pos.y;
      spr.zIndex = deco.z || 0;
      if (deco.r) spr.angle = deco.r;
      spr.glitchDecoId = deco.id || '';
      spr.glitchDecoName = deco.name || '';
      if (spr.glitchDecoId) decoViews.set(spr.glitchDecoId, spr);
      lc.addChild(spr);
      if (sharp && !blur) sharpViews.push({ spr, url, far, pick, size: sizeDeco });
      if (animated) {
        attachAnim(PIXI, spr, sprite, {
          clock: animClock,
          resolution: renderer?.resolution || 1,
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
    const ground = layerContainers.find((lc) => lc.label === 'middleground');
    const fallback = parseInt(String(street.gradient?.bottom || '6b8f3c').replace(/^#/, ''), 16) || 0x6b8f3c;
    buildGroundSkirt(PIXI, opts.renderer, root, ground, W, sourceH, skirtDepth, fallback);
  }
  root.decoDrawn = drawn;
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
    let lastResolution = renderer.resolution;
    let timer = null;
    const onResize = () => {
      if (renderer.resolution === lastResolution) return;
      lastResolution = renderer.resolution;
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
  root.cullDecos = (camX, camY, vpW, vpH, force = false) => {
    const now = performance.now();
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
   * moving layers keep their exact share (js/camera-feel.js).
   */
  root.updateParallax = (camX, camY, vpW, vpH, skyH = vpH, snap = null) => {
    const slidesX = W - vpW > 0;
    const slidesY = sourceH - vpH > 0;
    for (const lc of root.parallaxLayers) {
      const layer = lc.parallaxLayer;
      const at = parallaxLayerOffset(layer, camX, camY, vpW, vpH, W, sourceH);
      const x = drawnLayerOffset(at.x, camX, snap?.x || 0, slidesX ? layerScreenDir(snap?.dx, vpW, layer.w) : 0, lc.screenX);
      const y = drawnLayerOffset(at.y, camY, snap?.y || 0, slidesY ? layerScreenDir(snap?.dy, vpH, layer.h) : 0, lc.screenY);
      if (lc.x !== x || lc.y !== y) lastCull = null;
      lc.x = x;
      lc.y = y;
      // Where it lands on screen this frame: the next frame's settle never steps back past it.
      lc.screenX = x - camX;
      lc.screenY = y - camY;
    }
    if (skyView) {
      skyView.x = camX;
      skyView.y = camY;
      skyView.width = vpW;
      skyView.height = skyH;
    }
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
  const signViews = [];
  for (const s of street.signposts || []) {
    const pos = worldToScreen(street, s.x, s.y);
    const g = buildSignpostSprite(PIXI, s, pos);
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

export { signpostNear, pickConnection, platformsScreen, worldToScreen };
