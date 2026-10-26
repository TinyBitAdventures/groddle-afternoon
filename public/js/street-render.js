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
} from './street-model.js';
import { availableStreetTsids } from './street-loader.js';
import { frameTexture, isLoaded, onFailed, onLoaded, textureFromUrl } from './textures.js';
import { decoUrl } from './deco-hires.js';

const DECO_BASE = 'assets/decos/groddle/';
/**
 * Street names for a deco whose art ships under its SWF's own name. The old
 * grass_texture3 and house_back_medium_05 PNGs (Children of Ur exports, no SWF
 * by those names) are pixel for pixel grass_texture_3 and house_back_medium05,
 * whose CC0 glitch-locations SWFs the deco pipeline renders (G317).
 */
export const DECO_TWINS = Object.freeze({ grass_texture3: 'grass_texture_3', house_back_medium_05: 'house_back_medium05' });
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
  return cm;
}

/** Resolution of the one-time texture a blurred layer is baked into. */
const BLURRED_LAYER_RESOLUTION = 0.5;

/**
 * Blurred layers are static, so bake colour + blur into one half-resolution
 * texture once every deco texture has loaded, instead of re-blurring a
 * street-wide layer every frame. The texture covers the layer's full local
 * bounds: Pixi's cacheAsBitmap clips filters to the screen, which baked only
 * the part visible at load time and let its cut edges slide with parallax.
 * Flash's BlurFilter(blur, blur, LOW) is one box pass; a light two-pass Pixi
 * blur at half strength matches it.
 */
function bakeBlurredLayer(PIXI, renderer, lc, blur, colour) {
  const bases = new Set();
  for (const child of lc.children) {
    const base = child.texture?.source;
    if (base && !isLoaded(base)) bases.add(base);
  }
  const bake = () => {
    if (lc.destroyed || !lc.children.length) return;
    const pad = Math.ceil(blur * 2);
    const bounds = lc.getLocalBounds();
    const region = new PIXI.Rectangle(
      Math.floor(bounds.x - pad),
      Math.floor(bounds.y - pad),
      Math.ceil(bounds.width + pad * 2),
      Math.ceil(bounds.height + pad * 2)
    );
    const holder = new PIXI.Container();
    holder.filters = [...(colour ? [colour] : []), new PIXI.BlurFilter({ strength: blur * 0.5, quality: 2 })];
    const moved = lc.removeChildren();
    for (const child of moved) {
      child.culled = false;
      child.x -= region.x;
      child.y -= region.y;
      holder.addChild(child);
    }
    holder.sortableChildren = true;
    const texture = renderer.generateTexture({
      target: holder,
      frame: new PIXI.Rectangle(0, 0, region.width, region.height),
      resolution: BLURRED_LAYER_RESOLUTION,
    });
    trimTexturePool(PIXI);
    holder.destroy({ children: true });
    const baked = new PIXI.Sprite(texture);
    baked.x = region.x;
    baked.y = region.y;
    lc.filters = null;
    lc.addChild(baked);
    lc.bakedLayer = baked;
  };
  if (!bases.size) {
    bake();
    return;
  }
  let pending = bases.size;
  const done = () => {
    pending -= 1;
    if (pending === 0) bake();
  };
  for (const base of bases) {
    onLoaded(base, done);
    onFailed(base, done);
  }
}

/**
 * Most memory one street may spend on recoloured deco textures, counted at the decos' logical
 * size (4 bytes per 2x-art pixel): a 3x deco (js/deco-hires.js) costs 2.25 times this on the GPU,
 * but takes no more of the budget, so Retina screens keep every layer baked instead of falling
 * back to a live filter.
 */
export const RECOLOUR_BUDGET_BYTES = 192 * 1024 * 1024;

/** Budget bytes for a deco texture: its logical size, whatever resolution its file has. */
export function recolourBudgetBytes(base) {
  return Math.ceil(base.width) * Math.ceil(base.height) * 4;
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
      const base = spr.texture.source;
      if (!isLoaded(spr.texture) || cache.textures.has(`${key}|${base.uid}`) || fresh.has(base)) continue;
      fresh.add(base);
      bytes += recolourBudgetBytes(base);
    }
    if (cache.bytes + bytes > RECOLOUR_BUDGET_BYTES) return;
    cache.bytes += bytes;
    const now = performance.now();
    for (const spr of sprites) {
      if (!isLoaded(spr.texture)) continue;
      const original = spr.texture;
      const base = original.source;
      const id = `${key}|${base.uid}`;
      let entry = cache.entries.get(id);
      if (!entry) {
        entry = { id, base, colour, texture: bakeRecolour(PIXI, renderer, base, colour), users: new Set(), seen: now, bytes: recolourBudgetBytes(base) };
        cache.entries.set(id, entry);
        cache.textures.set(id, entry.texture);
      }
      entry.users.add(spr);
      spr.recolour = { entry, original };
      spr.texture = entry.texture;
    }
    lc.filters = null;
    lc.recoloured = true;
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

/** Bake a freed recoloured texture again for a deco coming into view. */
function ensureRecoloured(PIXI, renderer, cache, spr) {
  const entry = spr.recolour?.entry;
  if (!entry || entry.texture) return;
  entry.texture = bakeRecolour(PIXI, renderer, entry.base, entry.colour);
  cache.textures.set(entry.id, entry.texture);
  cache.rebakes += 1;
  for (const user of entry.users) if (!user.destroyed) user.texture = entry.texture;
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
    for (const user of entry.users) if (!user.destroyed) user.texture = user.recolour.original;
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
 */
export function parallaxLayerOffset(layer, camX, camY, vpW, vpH, streetW, streetH) {
  const maxX = streetW - vpW;
  const maxY = streetH - vpH;
  const percX = maxX > 0 ? camX / maxX : 1;
  const percY = maxY > 0 ? camY / maxY : 1;
  return {
    x: camX + Math.floor(percX * (vpW - layer.w)),
    y: camY + Math.floor(percY * (vpH - layer.h)),
  };
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

/** Cull one layer's sprites against the camera; returns how many are culled. */
function cullLayer(lc, camX, camY, vpW, vpH, rebake) {
  if (lc.destroyed || !lc.visible) return 0;
  const x0 = camX - lc.x - CULL_MARGIN;
  const y0 = camY - lc.y - CULL_MARGIN;
  const x1 = x0 + vpW + CULL_MARGIN * 2;
  const y1 = y0 + vpH + CULL_MARGIN * 2;
  let culled = 0;
  for (const child of lc.children) {
    if (!child.texture || child.bakedLayerSprite) continue;
    const b = decoBox(child);
    if (!b) continue;
    const out = b.x1 < x0 || b.x0 > x1 || b.y1 < y0 || b.y0 > y1;
    if (!out && child.recolour && !child.recolour.entry.texture) rebake(child);
    child.culled = out;
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
  const recolourCache = { textures: new Map(), entries: new Map(), bytes: 0, evictions: 0, rebakes: 0, lastEvict: 0 };
  root.recolourCache = recolourCache;
  // Decos are destroyed with the view but not their textures; free the copies.
  root.once('destroyed', () => {
    for (const texture of recolourCache.textures.values()) texture.destroy(true);
    recolourCache.textures.clear();
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
  const middleZ = (street.layers || []).findIndex((layer) => layer.id === 'middleground');
  const middleLayerZ = middleZ < 0 ? null : (street.layers[middleZ].z ?? middleZ);
  const layerContainers = [];
  const decoViews = new Map();
  const missingSprites = new Set();
  let drawn = 0;

  for (let li = 0; li < (street.layers || []).length; li++) {
    const layer = street.layers[li];
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
      const tex = farUrl ? textureFromUrl(farUrl, { raw: true }) : textureFromUrl(url);
      const spr = new PIXI.Sprite(tex);
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
      drawn += 1;
    }
    const blur = Number(layer.filters?.blur) || 0;
    if (blur > 0 && opts.renderer) bakeBlurredLayer(PIXI, opts.renderer, lc, blur, colour);
    else if (colour && opts.renderer) bakeLayerColour(PIXI, opts.renderer, lc, colour, recolourCache);
    root.addChild(lc);
    layerContainers.push(lc);
  }
  const skirtDepth = H - sourceH + Math.max(0, Number(opts.skirtBelow) || 0);
  if (skirtDepth > 0 && opts.renderer) {
    const ground = layerContainers.find((lc) => lc.label === 'middleground');
    const fallback = parseInt(String(street.gradient?.bottom || '6b8f3c').replace(/^#/, ''), 16) || 0x6b8f3c;
    buildGroundSkirt(PIXI, opts.renderer, root, ground, W, sourceH, skirtDepth, fallback);
  }
  root.decoDrawn = drawn;
  root.decoViews = decoViews;
  root.parallaxLayers = layerContainers.filter((lc) => lc.parallaxLayer);
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
    }
    if (!force && lastCull && Math.abs(lastCull.x - camX) < CULL_MARGIN / 4 && Math.abs(lastCull.y - camY) < CULL_MARGIN / 4 && lastCull.w === vpW && lastCull.h === vpH) return;
    lastCull = { x: camX, y: camY, w: vpW, h: vpH };
    let culled = 0;
    const rebake = (spr) => ensureRecoloured(PIXI, opts.renderer, recolourCache, spr);
    for (const lc of layerContainers) culled += cullLayer(lc, camX, camY, vpW, vpH, rebake);
    root.culledDecos = culled;
  };
  /** Call once per frame with the camera's top-left in screen space. */
  root.updateParallax = (camX, camY, vpW, vpH, skyH = vpH) => {
    for (const lc of root.parallaxLayers) {
      const at = parallaxLayerOffset(lc.parallaxLayer, camX, camY, vpW, vpH, W, sourceH);
      if (lc.x !== at.x || lc.y !== at.y) lastCull = null;
      lc.x = at.x;
      lc.y = at.y;
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
