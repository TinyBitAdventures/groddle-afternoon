/**
 * Street decos as WebP at 2x and 3x (tools/deco-pipeline, register row G31).
 *
 * The game asks for `assets/decos/groddle/<name>.png` everywhere (street-render, features, quest
 * rooms, game.js). Those PNGs no longer ship: every deco is `<name>.webp`, the 2x art at the old
 * PNG's pixel size, and the decos in js/deco-hires-list.js also have `<name>@1.5x.webp`, Tiny
 * Speck's SWF rendered at 3x. A deco's logical size stays the old PNG's pixel size, so the 3x file
 * has resolution 1.5 (js/textures.js reads it from the name) and sprites, frames and natural sizes
 * are unchanged.
 *
 * Which file: decos are 2x art drawn at about half their pixel size, so the 2x file gives two
 * texels per world pixel. The renderer draws the 960px view at `renderer.resolution` backing
 * pixels per world pixel (device pixel ratio x the view's zoom, js/render-density.js). Up to 2.25
 * the 2x file is plenty (DPR 1 and most DPR 1.5 windows); above it (Retina) the 3x file is used.
 *
 * Sharp decos (js/deco-sharp-list.js, tools/deco-pipeline/sharp.py): some streets draw a deco far
 * larger than its PNG (Guillermo Gamera Way's chimney_yellow_front_01: 268 x 887 view px from a
 * 114 x 382 logical deco). Those ship an SVG, rasterised at the screen's need, or a WebP sized to
 * the largest placement; js/street-render.js asks sharpDeco() for them on the layers that are
 * drawn sharp (middleground and in front of it, unblurred).
 */
import { HIRES_DECOS, HIRES_DECOS_BIG } from './deco-hires-list.js?v=g415-1';
import { SHARP_DECOS } from './deco-sharp-list.js?v=g416-1';

const DECO_PNG = /^(.*?(?:^|\/)assets\/decos\/groddle\/)([^/?#]+)\.png([?#].*)?$/;

/** Effective scale (backing pixels per world pixel) above which the 3x files are used. */
export const HIRES_DECO_SCALE = 2.25;
/** Hysteresis: once on 3x, stay there until the scale drops below this. */
export const HIRES_DECO_SCALE_OFF = 2.05;

/**
 * The URL to load for a deco PNG URL, or null for any other URL.
 * @param {string} url
 * @param {{ hires?: boolean, bigTextures?: boolean }} [opts]
 */
export function decoUrl(url, { hires = false, bigTextures = true } = {}) {
  const m = DECO_PNG.exec(String(url || ''));
  if (!m) return null;
  const [, dir, name, query = ''] = m;
  const three = hires && (HIRES_DECOS.has(name) || (bigTextures && HIRES_DECOS_BIG.has(name)));
  return `${dir}${name}${three ? '@1.5x' : ''}.webp${query}`;
}

/** Should decos load at 3x for this effective scale (previous choice for hysteresis)? */
export function wantsHiresDecos(scale, previous = false) {
  const s = Number(scale) || 1;
  return previous ? s >= HIRES_DECO_SCALE_OFF : s > HIRES_DECO_SCALE;
}

/** The GPU's largest 2D texture side for a Pixi 8 renderer (WebGL 2 or WebGPU), or null. */
export function maxTextureSizeOf(renderer) {
  try {
    const gl = renderer?.gl;
    if (gl) return gl.getParameter(gl.MAX_TEXTURE_SIZE) || null;
    return renderer?.gpu?.device?.limits?.maxTextureDimension2D || null;
  } catch {
    return null;
  }
}

/**
 * Route every deco PNG URL in js/textures.js to its WebP, at 3x when the screen needs it.
 * `renderer()` returns the Pixi renderer (or nothing yet): its resolution is the effective scale
 * (device pixel ratio when there is none), and 3x files over 4096 px only load where the GPU takes
 * 8192 px textures. Decided per URL, so streets built after a resize pick up the change; textures
 * already made keep theirs.
 * @param {{ addUrlRoute: Function }} textures the js/textures.js module
 * @param {{ renderer?: () => any }} [opts]
 */
export function installHiresDecos(textures, { renderer = () => null } = {}) {
  let hires = false;
  let maxSize = null;
  const route = (url) => {
    if (!DECO_PNG.test(String(url || ''))) return null;
    const r = renderer();
    if (r && maxSize === null) maxSize = maxTextureSizeOf(r) || 4096;
    const scale = r?.resolution || globalThis.devicePixelRatio || 1;
    hires = wantsHiresDecos(scale, hires);
    return decoUrl(url, { hires, bigTextures: (maxSize || 4096) >= 8192 });
  };
  if (typeof textures?.addUrlRoute === 'function') textures.addUrlRoute('hires-decos', route);
  return route;
}

/**
 * A file is enough while it gives scale / SHARP_SLACK texels per view px: 4/3, what a 3x deco drawn
 * at half its PNG size gets at the renderer's top density (3 texels at 4), so sharp copies are as
 * sharp as the rest of the scenery and no bigger.
 */
export const SHARP_SLACK = 4 / 3;
/** SVG rasters step by 2^(1/4) in resolution, so a window drag does not redraw them at every size. */
export const SVG_STEP = 2 ** 0.25;
/** Largest SVG raster: 4096 px on a side and 8 Mpx (32 MB of RGBA), whatever the screen asks for. */
export const SVG_MAX_SIDE = 4096;
export const SVG_MAX_PIXELS = 8e6;

/** Is this deco URL one with a sharp copy? */
export function isSharpDeco(url) {
  const m = DECO_PNG.exec(String(url || ''));
  return Boolean(m && SHARP_DECOS.has(m[2]));
}

/**
 * The sharp copy of a deco PNG URL to draw at `scale` backing px per view px, or null when the
 * file decoUrl's route picks (2x, or 3x above HIRES_DECO_SCALE) is already enough. Every
 * placement of a listed deco is covered: s is the largest near placement's view px per logical px.
 * - webp: { url: <name>@<res>x.webp, kind } (resolution from the name, logical size unchanged)
 * - svg: { url: <name>.svg?r=<res>, kind, width, height, resolution }: rasterise at width x height
 *   (js/textures.js textureFromUrl(url, { raw: true, width, height, resolution })); res is the need
 *   rounded up to an SVG_STEP and capped at maxSide on the longest side and SVG_MAX_PIXELS.
 * @param {string} url
 * @param {number} scale renderer.resolution
 * @param {{ maxSide?: number, bigTextures?: boolean }} [opts]
 */
export function sharpDeco(url, scale, { maxSide = SVG_MAX_SIDE, bigTextures = false } = {}) {
  const m = DECO_PNG.exec(String(url || ''));
  if (!m) return null;
  const [, dir, name] = m;
  const row = SHARP_DECOS.get(name);
  if (!row) return null;
  const [kind, s, w, h, res] = row;
  const R = Number(scale) || 1;
  const three = wantsHiresDecos(R) && (HIRES_DECOS.has(name) || (bigTextures && HIRES_DECOS_BIG.has(name)));
  const base = three ? 1.5 : 1;
  const need = (R * s) / SHARP_SLACK;
  if (need <= base) return null;
  if (kind === 'webp') return res > base ? { url: `${dir}${name}@${res}x.webp`, kind } : null;
  let r = SVG_STEP ** Math.ceil(Math.log(need) / Math.log(SVG_STEP) - 1e-9);
  r = Math.min(r, Math.min(maxSide, SVG_MAX_SIDE) / Math.max(w, h), Math.sqrt(SVG_MAX_PIXELS / (w * h)));
  if (r <= base) return null;
  r = Math.round(r * 1000) / 1000;
  const width = Math.max(1, Math.round(w * r));
  const height = Math.max(1, Math.round(h * r));
  return { url: `${dir}${name}.svg?r=${r}`, kind, width, height, resolution: width / w };
}
