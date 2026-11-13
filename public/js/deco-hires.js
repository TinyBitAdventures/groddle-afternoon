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
import { HIRES_DECOS, HIRES_DECOS_BIG } from './deco-hires-list.js?v=60fcf361';
import { NEW_DECOS, NEW_DECOS_HIRES } from './deco-new-list.js?v=bf75b325';

/** A published zone's new art (gz_ decos, js/deco-new-list.js): drawn like library decos. */
export { NEW_DECOS };
import { SHARP_DECOS } from './deco-sharp-list.js?v=28262069';

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
  const three = hires && (HIRES_DECOS.has(name) || NEW_DECOS_HIRES.has(name) || (bigTextures && HIRES_DECOS_BIG.has(name)));
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

/** The renderer installHiresDecos was given: quest rooms (js/quest-rooms/kit.js) pick sharp copies at its density. */
let routeRenderer = () => null;

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
  routeRenderer = renderer;
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
 * Bytes one street may add for the sharp copies of decos on layers behind the middleground and on
 * blurred layers (over the 2x/3x files they replace; 4 per pixel). Those layers are big and often
 * all on screen, so the copies that would be magnified most go first (admitSharp).
 */
export const FAR_SHARP_BUDGET_BYTES = 96 * 1024 * 1024;

/**
 * The slack a street's far copies may take (js/street-render.js farSharp): SHARP_SLACK first, then
 * coarser in eighth-octave steps up to twice it, until every far and blurred copy the street wants
 * fits FAR_SHARP_BUDGET_BYTES (the last step admits the most magnified first, as before). Every
 * far copy then draws at one density, and none is left at its 2x file while another takes 20 MB:
 * Ilmenskie at R 4 wanted 202 MB at SHARP_SLACK and fits at 2.06 (78 MB, all 26 copies).
 */
export const FAR_SLACKS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => SHARP_SLACK * 2 ** (k / 8)));

/**
 * The sharp copy of a deco PNG URL to draw at `scale` backing px per view px, or null when the
 * file decoUrl's route picks (2x, or 3x above HIRES_DECO_SCALE; always 2x behind the
 * middleground) is already enough. The list's s, sf and sb are the largest view px per logical px
 * over a deco's near, far and blurred placements that need it; 0 means that kind of layer keeps
 * the usual file.
 * - near: `scale` / SHARP_SLACK texels per view px, over the 2x or 3x file;
 * - `far: true` (behind the middleground): `scale` / `farSlack` (SHARP_SLACK unless the street's
 *   budget asks for less, FAR_SLACKS), over the 2x file those layers load. A WebP sized for a
 *   nearer placement loads downscaled to that need (`?r=` in its URL, width x height): a far
 *   layer never holds texels it cannot show;
 * - `blurDensity` (a blurred layer: js/street-render.js blurBakeResolution): its bake's texels per
 *   view px, which keeps nothing finer;
 * - `per` (a home street or back-yard landscape, js/features/homes-feature.js, or a quest room's
 *   deco, js/quest-rooms/kit.js): this placement's own view px per logical px, in place of the
 *   list's s, sf or sb; near rules otherwise. Every home look and quest room placement that needs
 *   a copy is in the list (its sh).
 * Returns { url, kind, bytes, need, base, w, h } (w x h the logical size) and for svg or a downscaled
 * far WebP { width, height, resolution }:
 * - webp: <name>@<res>x.webp (resolution from the name, logical size unchanged)
 * - svg: <name>.svg?r=<res>, rasterised at width x height (js/textures.js textureFromUrl(url,
 *   { raw: true, width, height, resolution })); res is the need rounded up to an SVG_STEP and
 *   capped at maxSide on the longest side and SVG_MAX_PIXELS.
 * @param {string} url
 * @param {number} scale renderer.resolution
 * @param {{ maxSide?: number, bigTextures?: boolean, far?: boolean, farSlack?: number, blurDensity?: number, per?: number }} [opts]
 */
export function sharpDeco(url, scale, { maxSide = SVG_MAX_SIDE, bigTextures = false, far = false, farSlack = SHARP_SLACK, blurDensity = 0, per: own = 0 } = {}) {
  const m = DECO_PNG.exec(String(url || ''));
  if (!m) return null;
  const [, dir, name] = m;
  const row = SHARP_DECOS.get(name);
  if (!row) return null;
  const [kind, s, w, h, res, sf = 0, sb = 0] = row;
  const R = Number(scale) || 1;
  const three = !far && wantsHiresDecos(R) && (HIRES_DECOS.has(name) || (bigTextures && HIRES_DECOS_BIG.has(name)));
  const base = three ? 1.5 : 1;
  const per = own > 0 ? own : blurDensity > 0 ? sb : far ? sf : s;
  if (!per) return null;
  const need = blurDensity > 0 ? blurDensity * per : (R * per) / (far && !own ? Math.max(SHARP_SLACK, farSlack) : SHARP_SLACK);
  if (need <= base) return null;
  const stepUp = SVG_STEP ** Math.ceil(Math.log(need) / Math.log(SVG_STEP) - 1e-9);
  if (kind === 'webp') {
    if (!(res > base)) return null;
    // A far placement's need below the file's own density: the file, downscaled when loaded.
    const down = far && !own && !blurDensity ? Math.round(Math.max(base, stepUp) * 1000) / 1000 : 0;
    if (down > base && down < res) {
      const width = Math.max(1, Math.round(w * down));
      const height = Math.max(1, Math.round(h * down));
      return { url: `${dir}${name}@${res}x.webp?r=${down}`, kind, width, height, resolution: width / w, bytes: width * height * 4, need, base, w, h };
    }
    return { url: `${dir}${name}@${res}x.webp`, kind, bytes: Math.round(w * res) * Math.round(h * res) * 4, need, base, w, h };
  }
  let r = stepUp;
  r = Math.min(r, Math.min(maxSide, SVG_MAX_SIDE) / Math.max(w, h), Math.sqrt(SVG_MAX_PIXELS / (w * h)));
  if (r <= base) return null;
  r = Math.round(r * 1000) / 1000;
  const width = Math.max(1, Math.round(w * r));
  const height = Math.max(1, Math.round(h * r));
  return { url: `${dir}${name}.svg?r=${r}`, kind, width, height, resolution: width / w, bytes: width * height * 4, need, base, w, h };
}

/**
 * Which of a street's far and blurred sharp copies to load: the most magnified first (need over
 * the file it replaces), each once per URL, while the bytes they add stay within `budget`.
 * @param {{ url: string, bytes: number, need: number, base: number, w: number, h: number }[]} picks
 * @returns {Set<string>} admitted pick URLs
 */
export function admitSharp(picks, budget = FAR_SHARP_BUDGET_BYTES) {
  const unique = new Map();
  for (const p of picks) if (p && !unique.has(p.url)) unique.set(p.url, p);
  const order = [...unique.values()].sort((a, b) => b.need / b.base - a.need / a.base || a.bytes - b.bytes);
  const out = new Set();
  let spent = 0;
  for (const p of order) {
    const cost = Math.max(0, p.bytes - Math.round(p.w * p.base) * Math.round(p.h * p.base) * 4);
    if (spent + cost > budget) continue;
    spent += cost;
    out.add(p.url);
  }
  return out;
}

/**
 * A quest-room deco's sharp copy (js/quest-rooms/kit.js deco): the placement draws the deco at
 * `per` view px per logical px, so it takes the copy sharpDeco picks for that at the renderer's
 * density now, as a street's middleground does; null keeps the usual 2x/3x file (always before
 * the renderer starts, and at a phone's 1 for a deco drawn at about half its 2x file).
 * Returns { url, opts } for js/textures.js textureFromUrl.
 * @param {string} url the deco's .png URL
 * @param {number} per
 */
export function sharpRoomDeco(url, per) {
  const r = routeRenderer();
  if (!r || !(per > 0)) return null;
  const pick = sharpDeco(url, r.resolution || 1, { per, bigTextures: (maxTextureSizeOf(r) || 4096) >= 8192 });
  if (!pick) return null;
  return {
    url: pick.url,
    opts: pick.kind === 'svg' ? { raw: true, width: pick.width, height: pick.height, resolution: pick.resolution } : { raw: true },
  };
}
