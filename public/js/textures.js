/**
 * Image textures by URL for Pixi 8.
 *
 * Pixi 8's Texture.from(url) only reads the Assets cache; it never starts a
 * load. The game builds sprites synchronously from URLs everywhere (sheets
 * are cut before their image arrives), so this module hands out a Texture at
 * once and fills its TextureSource in place when the image has decoded:
 * Textures cut from it keep their frames, sprites resize, and the GPU copy is
 * re-uploaded on the source's resize event.
 *
 * - textureFromUrl(url) / sourceFromUrl(url): cached per URL, never null.
 * - loadTexture(url) resolves once loaded (rejects on a failed load).
 * - isLoaded / onLoaded / whenLoaded work on a Texture or TextureSource;
 *   sources not made here (canvases, render textures) count as loaded.
 * - A URL with `@3x` in its file name gets resolution 3 (logical size
 *   unchanged), like Pixi's own resolver; addUrlRoute() registers the 3x
 *   routes for pack icons and sprite sheets (js/icon-hires.js,
 *   js/sprite-hires.js).
 * - `{ raw: true }` skips the routes (a sheet a loader upgrades itself), except routes added with
 *   `{ raw: true }`: those move where a file lives rather than pick its resolution (a level builder
 *   draft's new art, served from /builder-art/), so they apply to every URL.
 * - SVG files and data URLs are rasterised to a canvas, at { width, height }
 *   or { scale } when given (Pixi 7's SVGResource options).
 * - Image sources are garbage collected on the GPU by Pixi when unused for a
 *   while (ImageSource.autoGarbageCollect); the decoded image stays here.
 */

/** @type {Map<string, any>} url -> TextureSource */
const sources = new Map();
/** @type {Map<string, any>} url -> Texture */
const textures = new Map();
/** @type {Map<string, (url: string) => string|null>} */
const routes = new Map();
/** The routes that apply to raw URLs too (addUrlRoute's `raw`). */
const rawRoutes = new Set();

const LOAD = Symbol('groddleLoad');

function pixi() {
  return globalThis.PIXI;
}

/**
 * Register a URL rewrite (e.g. a 3x route); later routes see earlier results. `raw: true` makes
 * it apply to `{ raw: true }` loads as well (a file that lives somewhere else, not a resolution).
 */
export function addUrlRoute(name, fn, { raw = false } = {}) {
  routes.set(name, fn);
  if (raw) rawRoutes.add(name);
  else rawRoutes.delete(name);
}



/** The URL actually loaded for `url` after routes (a raw load: only the routes added with `raw`). */
export function routeUrl(url, { raw = false } = {}) {
  let out = String(url);
  for (const [name, fn] of routes) {
    if (raw && !rawRoutes.has(name)) continue;
    const next = fn(out);
    if (next) out = next;
  }
  return out;
}

/** Resolution from an `@2x` / `@3x` / `@0.5x` file name, else 1. */
export function resolutionOfUrl(url) {
  const path = String(url).split('?')[0];
  const m = /@(\d+(?:\.\d+)?)x(?=\.[a-z0-9]+$)/i.exec(path);
  return m ? Number(m[1]) : 1;
}

function isSvg(url) {
  const s = String(url);
  return /^data:image\/svg\+xml/i.test(s) || /\.svg$/i.test(s.split('?')[0]);
}

let placeholder = null;
function placeholderCanvas() {
  if (!placeholder) {
    placeholder = globalThis.document?.createElement('canvas');
    if (placeholder) {
      placeholder.width = 1;
      placeholder.height = 1;
      // WebGPU's copyExternalImageToTexture refuses a canvas with no context.
      placeholder.getContext('2d');
    }
  }
  return placeholder;
}

function decodeImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(url)) img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (typeof img.decode === 'function') img.decode().then(() => resolve(img), () => resolve(img));
      else resolve(img);
    };
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

async function rasteriseSvg(url, { width, height, scale } = {}) {
  const img = await decodeImage(url);
  const w = Math.max(1, Math.round(width || (img.naturalWidth || img.width) * (scale || 1)));
  const h = Math.max(1, Math.round(height || (img.naturalHeight || img.height) * (scale || 1)));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas;
}

/**
 * A raster image decoded and drawn at width x height (a far street layer's sharp copy, sized for a
 * nearer placement, loaded at the far need: js/deco-hires.js sharpDeco). The GPU only ever holds
 * the smaller copy.
 */
async function resizeImage(url, { width, height }) {
  const img = await decodeImage(url);
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(img, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
    } catch {
      // Older engines: the canvas below.
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function createSource(url, opts) {
  const PIXI = pixi();
  const resolution = opts.resolution || resolutionOfUrl(url);
  const source = new PIXI.ImageSource({
    resource: placeholderCanvas(),
    label: url,
    resolution,
    alphaMode: 'premultiply-alpha-on-upload',
    scaleMode: opts.scaleMode || 'linear',
  });
  const state = { url, loaded: false, failed: false, promise: null };
  source[LOAD] = state;
  state.promise = (isSvg(url) ? rasteriseSvg(url, opts) : opts.width > 0 && opts.height > 0 ? resizeImage(url, opts) : decodeImage(url)).then(
    (image) => {
      if (source.destroyed) return source;
      source.resource = image;
      const w = (image.naturalWidth || image.width) / resolution;
      const h = (image.naturalHeight || image.height) / resolution;
      if (!source.resize(w, h, resolution)) source.update();
      state.loaded = true;
      source.emit('loaded', source);
      return source;
    },
    (err) => {
      state.failed = true;
      source.emit('error', err, source);
      throw err;
    }
  );
  // Callers that never ask stay quiet about a missing file (Pixi 7 did too).
  state.promise.catch(() => {});
  return source;
}

/** The TextureSource for an image URL (shared, filled in when loaded). */
export function sourceFromUrl(url, opts = {}) {
  const key = routeUrl(url, { raw: Boolean(opts.raw) });
  let source = sources.get(key);
  if (!source || source.destroyed) {
    source = createSource(key, opts);
    sources.set(key, source);
  }
  return source;
}

/** The whole-image Texture for a URL (shared, sized when loaded). */
export function textureFromUrl(url, opts = {}) {
  const key = routeUrl(url, { raw: Boolean(opts.raw) });
  let texture = textures.get(key);
  if (!texture || texture.destroyed) {
    // dynamic: sprites re-read the size and UVs when the image arrives.
    texture = new (pixi().Texture)({ source: sourceFromUrl(url, opts), label: key, dynamic: true });
    textures.set(key, texture);
  }
  return texture;
}

/**
 * A Texture over part of a source (a sheet frame), or all of it. Frames of a
 * URL source are dynamic, so sprites pick up the real UVs once it loads.
 * @param {any} source a TextureSource (or Texture)
 * @param {any} [frame] a Rectangle in the source's logical units
 * @param {{ orig?: any, trim?: any }} [layout] Pixi's orig and trim: a frame drawn smaller than its cell keeps the cell's size and placement
 */
export function frameTexture(source, frame, layout = {}) {
  const s = sourceOf(source);
  const texture = new (pixi().Texture)({ source: s, frame, ...(layout.orig ? { orig: layout.orig } : {}), ...(layout.trim ? { trim: layout.trim } : {}), dynamic: Boolean(s?.[LOAD]) });
  const url = s?.[LOAD]?.url;
  if (url && frameTracker?.match(url)) {
    let set = frameSets.get(s);
    if (!set) frameSets.set(s, (set = new Set()));
    set.add(texture);
    texture.once('destroy', () => set.delete(texture));
    frameTracker.added?.(s, texture);
  }
  return texture;
}

/** @type {WeakMap<any, Set<any>>} source -> frame Textures cut by frameTexture */
const frameSets = new WeakMap();
/** @type {{ match: (url: string) => boolean, added?: (source: any, texture: any) => void } | null} */
let frameTracker = null;

/**
 * Keep the frame Textures cut from URL sources whose URL passes `match`, so
 * they can be moved to other sources later (js/sprite-hires.js points the
 * frames of a sheet whose 3x is split into parts at the right part). `added`
 * runs for each new frame of a tracked source.
 */
export function trackFrameTextures(tracker) {
  frameTracker = tracker || null;
}

/** The live frame Textures frameTexture cut from a tracked source. */
export function framesOf(textureOrSource) {
  return [...(frameSets.get(sourceOf(textureOrSource)) || [])];
}

/** textureFromUrl, resolved once the image is in (rejects when it fails). */
export function loadTexture(url, opts = {}) {
  const texture = textureFromUrl(url, opts);
  return whenLoaded(texture).then(() => texture);
}

/** Preload several URLs; failures resolve to null. */
export function loadTextures(urls, opts = {}) {
  return Promise.all(urls.map((url) => loadTexture(url, opts).catch(() => null)));
}

/** The cached Texture for a URL, or null when it was never requested. */
export function cachedTexture(url) {
  return textures.get(routeUrl(url)) || null;
}

/** Forget a URL (Pixi 7's Texture.removeFromCache); does not destroy it. */
export function forgetTexture(url) {
  const key = routeUrl(url);
  textures.delete(key);
  sources.delete(key);
}

const sourceOf = (t) => t?.source ?? t;

/** The URL a TextureSource was loaded from by this module, or null. */
export function sourceUrl(textureOrSource) {
  return sourceOf(textureOrSource)?.[LOAD]?.url || null;
}

/** Has the image arrived? Non-URL sources (canvas, render textures) are always loaded. */
export function isLoaded(textureOrSource) {
  const source = sourceOf(textureOrSource);
  if (!source || source.destroyed) return false;
  const state = source[LOAD];
  return state ? state.loaded : true;
}

/** Did the image fail to load? */
export function isFailed(textureOrSource) {
  return Boolean(sourceOf(textureOrSource)?.[LOAD]?.failed);
}

/** Resolves when loaded (at once for non-URL sources); rejects on failure. */
export function whenLoaded(textureOrSource) {
  const source = sourceOf(textureOrSource);
  const state = source?.[LOAD];
  if (!state) return Promise.resolve(source);
  return state.promise;
}

/** Run fn now if loaded, else once when it loads (never on failure). */
export function onLoaded(textureOrSource, fn) {
  if (!textureOrSource) return;
  if (isLoaded(textureOrSource)) {
    fn();
    return;
  }
  whenLoaded(textureOrSource).then(() => fn(), () => {});
}

/** Run fn once if the image fails to load. */
export function onFailed(textureOrSource, fn) {
  if (!textureOrSource) return;
  whenLoaded(textureOrSource).catch((err) => fn(err));
}

/**
 * Ticket 21 (Safari reloaded the page for its memory in Naraka, or just after): this module keeps
 * every image it ever loaded, decoded, and Pixi frees only the GPU copy (20 s unused). After a dozen
 * streets that was some 500 street decos and 480 megapixels, 1.9 GB as decoded pixels, carried into
 * every street after, so a long session reached Safari's limit about the time a player croaked.
 * An image whose URL passes `match` that has had no GPU copy for `idleMs` (none of the streets
 * since drew it) is forgotten here: whatever still holds it (a culled deco on this street) keeps
 * it and draws it as before, and a later textureFromUrl loads it again from the HTTP cache.
 * `onGpu` is the renderer's managed sources (a Set). Returns how many were forgotten.
 */
export function releaseIdleImages({ match, onGpu, now = Date.now(), idleMs = 30000 } = {}) {
  if (!(match instanceof RegExp) || !onGpu) return 0;
  let released = 0;
  for (const [url, source] of [...sources]) {
    const state = source[LOAD];
    if (!state?.loaded || source.destroyed || !match.test(url)) continue;
    if (onGpu.has(source)) {
      state.offGpuSince = 0;
      continue;
    }
    if (!state.offGpuSince) {
      state.offGpuSince = now;
      continue;
    }
    if (now - state.offGpuSince < idleMs) continue;
    sources.delete(url);
    if (textures.get(url)?.source === source) textures.delete(url);
    released += 1;
  }
  return released;
}

/**
 * #284 (an iPhone tab killed on a street trip): Pixi frees a GPU copy only after 20 s unused, so for
 * 20 s after a trip the GPU held the street left behind as well as the new one and its colour bakes
 * (2.1 GB in WebKit at iPhone size on the way into Froughtful Fen). Unload now the GPU copies of the
 * images whose URL passes `match` among `managed` (the renderer's managed sources): what still draws
 * them uploads them again from the decoded image this module keeps. Returns how many were unloaded.
 */
export function unloadGpuCopies({ match, managed } = {}) {
  if (!(match instanceof RegExp) || !managed) return 0;
  let unloaded = 0;
  for (const source of [...managed]) {
    const url = source?.[LOAD]?.url;
    if (!url || source.destroyed || !match.test(url) || typeof source.unload !== 'function') continue;
    source.unload();
    unloaded += 1;
  }
  return unloaded;
}

/**
 * MEMQA (ticket 21): the loaded URL images by folder (assets/<a>/<b>), largest first: count and
 * megapixels, and how many of them are in `onGpu` (a Set of the renderer's managed sources: Pixi frees
 * a GPU copy unused for 20 s; the image stays here).
 */
export function textureFolders(limit = 12, onGpu = null) {
  const rows = new Map();
  for (const source of sources.values()) {
    if (!source[LOAD]?.loaded || source.destroyed) continue;
    const m = /assets\/([^/]+(?:\/[^/]+)?)\//.exec(source[LOAD].url);
    const key = m ? m[1] : 'other';
    const row = rows.get(key) || { folder: key, images: 0, mpx: 0, onGpu: 0 };
    row.images += 1;
    row.mpx += (source.pixelWidth * source.pixelHeight) / 1e6;
    if (onGpu?.has(source)) row.onGpu += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.mpx - a.mpx).slice(0, limit).map((r) => ({ ...r, mpx: +r.mpx.toFixed(1) }));
}

/** Loaded-image stats for QA (count and decoded pixels of URL images). */
export function textureStats() {
  let loaded = 0;
  let pixels = 0;
  for (const source of sources.values()) {
    if (!source[LOAD]?.loaded || source.destroyed) continue;
    loaded++;
    pixels += source.pixelWidth * source.pixelHeight;
  }
  return { urls: sources.size, loaded, mpx: +(pixels / 1e6).toFixed(1) };
}
