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
 */
import { HIRES_DECOS, HIRES_DECOS_BIG } from './deco-hires-list.js';

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
