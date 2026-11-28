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
 * - R30 (#577/#578): a picture from this cache is shared by every module that asked for its URL, so
 *   none of them may free it with `.destroy()` (tests/r30-cached-frees.test.js holds the line). A
 *   module that wants to free a sheet when done takes it with holdSource / holdTexture /
 *   loadHeldTexture and gives it back with releaseTexture, which frees it only once every hold is
 *   given back and nobody took it through the plain calls. A freed picture is never handed out again:
 *   the next ask loads it afresh.
 * - #768: a picture whose request never answers (no load, no error) counts as failed after its time
 *   limit (js/load-retry.js loadTimeoutFor: 20 s, doubled each try) and is asked for again by itself
 *   after RETRY_WAIT_MS, so a house built once still fills in.
 */

import { isLoadTimeout, loadTimeoutFor, RETRY_WAITS_MS, timeLimit } from './load-retry.js?v=24823577';

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

/** An image decoded from `url`; `signal` (timeLimit's) stops the request when it stalls (#768). */
function decodeImage(url, signal) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(url)) img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (typeof img.decode === 'function') img.decode().then(() => resolve(img), () => resolve(img));
      else resolve(img);
    };
    img.onerror = () => reject(new Error(`could not load ${url}`));
    signal?.addEventListener?.('abort', () => {
      img.onload = null;
      img.onerror = null;
      // Drops the request; the next try asks again.
      try { img.src = ''; } catch { /* an image double without a src setter */ }
      reject(signal.reason || new Error(`stopped loading ${url}`));
    }, { once: true });
    img.src = url;
  });
}

async function rasteriseSvg(url, { width, height, scale } = {}, signal) {
  const img = await decodeImage(url, signal);
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
async function resizeImage(url, { width, height }, signal) {
  const img = await decodeImage(url, signal);
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

/** #583: the longest texture side the GPU takes (game.js sets it from the renderer); Infinity until then. */
let sideLimit = Infinity;

/**
 * #583: tell this module the renderer's MAX_TEXTURE_SIZE. An image longer than it is drawn smaller
 * on load, its logical size kept (a lower resolution), instead of reaching the GPU too big to
 * upload and drawing nothing: the Grinders' work sheets are one row of 83 frames, 12450 px at 3x,
 * a blank bubble on a phone that takes 4096 or 8192.
 */
export function setTextureSideLimit(n) {
  sideLimit = Number(n) > 0 ? Number(n) : Infinity;
}

/** #583: the pixel size an image of w x h is kept at so its longer side fits `limit`, and the factor. */
export function fitTextureSide(w, h, limit = sideLimit) {
  const big = Math.max(Number(w) || 0, Number(h) || 0);
  if (!(big > limit)) return { w, h, k: 1 };
  const k = limit / big;
  return { w: Math.max(1, Math.floor(w * k)), h: Math.max(1, Math.floor(h * k)), k };
}

/** #583: the decoded image, or a copy small enough for the GPU (fitTextureSide). */
async function withinSideLimit(image) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const fit = fitTextureSide(w, h);
  if (fit.k === 1) return image;
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(image, { resizeWidth: fit.w, resizeHeight: fit.h, resizeQuality: 'high' });
    } catch {
      // Older engines: the canvas below.
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = fit.w;
  canvas.height = fit.h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, fit.w, fit.h);
  return canvas;
}

/**
 * #662 (a street's piece of art stayed blank all session, Safari on an Apple GPU): one dropped
 * request or failed decode used to leave a source on its 1x1 placeholder for good, since the cache
 * only made a new one for a destroyed source. A failed source is loaded again, in place, the next
 * time it is asked for (cachedSource), once RETRY_WAIT_MS[attempts - 1] has passed since it failed,
 * at most LOAD_ATTEMPTS times in all, so a file that is really missing is not asked for forever.
 * In place: every sprite and frame already cut from it shows the picture when it lands (the
 * source's resize, as on a first load). Each failure is counted by path for the bug report.
 */
export const LOAD_ATTEMPTS = 4;
export const RETRY_WAIT_MS = RETRY_WAITS_MS;

/** #662: failed image loads by path (no query, no data or blob contents): { count, loaded }. */
const imageFailures = new Map();
const MAX_FAILURE_PATHS = 40;

/** #662: a URL as a bare path for the report (never a data: or blob: URL's contents, never a query). */
function failurePath(url) {
  const u = String(url || '');
  if (/^data:/i.test(u)) return `data:${(/^data:([^;,]*)/i.exec(u) || [])[1] || ''}`;
  if (/^blob:/i.test(u)) return 'blob:';
  return u.replace(/^[a-z]+:\/\/[^/]+\//i, '').replace(/^\//, '').replace(/[?#].*$/, '').slice(0, 120);
}

function noteImageFailure(state) {
  const path = failurePath(state.asked || state.url);
  const row = imageFailures.get(path) || { count: 0, loaded: false };
  row.count += 1;
  row.loaded = false;
  imageFailures.delete(path);
  imageFailures.set(path, row);
  if (imageFailures.size > MAX_FAILURE_PATHS) imageFailures.delete(imageFailures.keys().next().value);
}

function noteImageRecovered(state) {
  const row = imageFailures.get(failurePath(state.asked || state.url));
  if (row) row.loaded = true;
}

/** #662: the failed image loads so far, newest last: [{ path, count, loaded }]. */
export function imageFailureStats() {
  return [...imageFailures].map(([path, row]) => ({ path, count: row.count, loaded: row.loaded }));
}

/**
 * #662: one line for a bug report's errors, or '' when every image loaded:
 * "images failed: assets/decos/x.png x2 (loaded later), assets/y.png x4". Newest last, at most `max` chars.
 */
export function imageFailureLine(max = 300) {
  const rows = imageFailureStats();
  if (!rows.length) return '';
  const parts = rows.map((r) => `${r.path} x${r.count}${r.loaded ? ' (loaded later)' : ''}`);
  let line = `images failed: ${parts.join(', ')}`;
  while (line.length > max && parts.length > 1) {
    parts.shift();
    line = `images failed: ... ${parts.join(', ')}`;
  }
  return line.slice(0, max);
}

/** #662: forget the failure counts (tests). */
export function resetImageFailures() {
  imageFailures.clear();
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
  // holds: holdSource/holdTexture takers not yet released; shared: handed out by a plain call (never freed).
  // attempts, failedAt: #662's retry (startLoad, retryIfDue); run, startedAt, timeoutMs: #768's time limit.
  const state = { url, opts, resolution, loaded: false, failed: false, promise: null, holds: 0, shared: false, own: false, attempts: 0, failedAt: 0, run: null, startedAt: 0, timeoutMs: 0 };
  source[LOAD] = state;
  startLoad(source, state);
  return source;
}

/**
 * Load (or, #662, load again) a source's image and fill it in place. `state` is passed in, never read
 * back off the source: a test double for the source (the tests' fake Pixi) may answer every symbol key with
 * itself, and the load's own promise would then go without its catch (an unhandled rejection).
 */
function startLoad(source, state) {
  const { url, opts, resolution } = state;
  state.attempts += 1;
  state.failed = false;
  // #768: a try that neither loads nor fails within its limit fails as stalled (and is tried again below).
  const ms = loadTimeoutFor(state.attempts);
  const run = timeLimit((signal) => (isSvg(url) ? rasteriseSvg(url, opts, signal) : opts.width > 0 && opts.height > 0 ? resizeImage(url, opts, signal) : decodeImage(url, signal)), { ms });
  state.run = run;
  state.startedAt = Date.now();
  state.timeoutMs = ms;
  // A try given up on (#768 stalled, a newer one started) changes nothing when it settles late.
  const current = () => state.run === run;
  state.promise = run.then(
    (decoded) => withinSideLimit(decoded).catch(() => decoded).then((image) => {
      if (source.destroyed || !current()) return source;
      source.resource = image;
      // The logical size is the file's; an image kept smaller (#583) is a lower resolution of it.
      const w = (decoded.naturalWidth || decoded.width) / resolution;
      const h = (decoded.naturalHeight || decoded.height) / resolution;
      const res = image === decoded ? resolution : resolution * ((image.width || 1) / (decoded.naturalWidth || decoded.width || 1));
      if (!source.resize(w, h, res)) source.update();
      state.loaded = true;
      if (state.attempts > 1) noteImageRecovered(state);
      source.emit('loaded', source);
      return source;
    }),
    (err) => {
      if (!current()) throw err;
      state.run = null;
      state.failed = true;
      state.failedAt = Date.now();
      noteImageFailure(state);
      source.emit('error', err, source);
      // #768: nobody may ask again (a house is built once), so a stalled picture asks again itself.
      if (isLoadTimeout(err) && state.attempts < LOAD_ATTEMPTS) {
        const t = setTimeout(() => retryIfDue(source, Date.now(), { force: true }), RETRY_WAIT_MS[Math.min(state.attempts, RETRY_WAIT_MS.length) - 1] ?? 0);
        t?.unref?.();
      }
      throw err;
    }
  );
  // Callers that never ask stay quiet about a missing file (Pixi 7 did too).
  state.promise.catch(() => {});
}

/**
 * #662: a failed source is loaded again when asked for, after its wait, while attempts are left.
 * #768: one still loading past its time limit (its timer held back, a tab in the background) is
 * given up on and asked for again at once: the stall was its wait. `force`: the stalled try's own
 * timer, already past its wait.
 */
function retryIfDue(source, now = Date.now(), { force = false } = {}) {
  const state = source?.[LOAD];
  // Only a state this module made (a plain object with a number of attempts).
  if (!state || typeof state.attempts !== 'number' || source.destroyed === true) return false;
  if (state.loaded !== true && state.failed === false && state.run && typeof state.run.expire === 'function' && now - state.startedAt >= state.timeoutMs) {
    // Out of tries: its rejection marks it failed as any other.
    if (state.attempts >= LOAD_ATTEMPTS) {
      state.run.expire();
      return false;
    }
    state.run.expire();
    // The stalled try's failure is noted here, not when its rejection lands (it is no longer current).
    state.run = null;
    state.failed = true;
    state.failedAt = now;
    noteImageFailure(state);
    startLoad(source, state);
    return true;
  }
  // Failed for sure.
  if (state.failed !== true || state.attempts >= LOAD_ATTEMPTS) return false;
  const wait = RETRY_WAIT_MS[Math.min(state.attempts, RETRY_WAIT_MS.length) - 1] ?? 0;
  if (!force && now - state.failedAt < wait) return false;
  startLoad(source, state);
  return true;
}

/** The cached source for a URL, made when missing or freed (R30: a destroyed one is never handed out). */
function cachedSource(url, opts) {
  const key = routeUrl(url, { raw: Boolean(opts.raw) });
  let source = sources.get(key);
  if (!source || source.destroyed) {
    source = createSource(key, opts);
    // The URL as the game named it, before a route picked a 3x copy (js/sprite-feet.js reads it).
    source[LOAD].asked = String(url);
    sources.set(key, source);
  } else {
    retryIfDue(source);
  }
  return source;
}

/** The cached whole-image Texture for a URL; one over a freed source counts as missing (R30). */
function cachedWhole(url, opts) {
  const key = routeUrl(url, { raw: Boolean(opts.raw) });
  let texture = textures.get(key);
  if (!texture || texture.destroyed || !texture.source || texture.source.destroyed) {
    // dynamic: sprites re-read the size and UVs when the image arrives.
    texture = new (pixi().Texture)({ source: cachedSource(url, opts), label: key, dynamic: true });
    textures.set(key, texture);
  } else {
    retryIfDue(texture.source);
  }
  return texture;
}

/** The TextureSource for an image URL (shared, filled in when loaded). Never destroy it: see releaseTexture. */
export function sourceFromUrl(url, opts = {}) {
  const source = cachedSource(url, opts);
  source[LOAD].shared = true;
  return source;
}

/** The whole-image Texture for a URL (shared, sized when loaded). Never destroy it: see releaseTexture. */
export function textureFromUrl(url, opts = {}) {
  const texture = cachedWhole(url, opts);
  texture.source[LOAD].shared = true;
  return texture;
}

/**
 * R30: sourceFromUrl for a module that frees the sheet when done with it: give it back once with
 * releaseTexture. Two holders of one URL share one source, freed when both have given it back.
 */
export function holdSource(url, opts = {}) {
  const source = cachedSource(url, opts);
  source[LOAD].holds += 1;
  return source;
}

/** R30: textureFromUrl with a hold on its source (holdSource); give it back with releaseTexture. */
export function holdTexture(url, opts = {}) {
  const texture = cachedWhole(url, opts);
  texture.source[LOAD].holds += 1;
  return texture;
}

/** R30: holdTexture, resolved once loaded (rejects when it fails; the hold is still to be given back). */
export function loadHeldTexture(url, opts = {}) {
  const texture = holdTexture(url, opts);
  return whenLoaded(texture).then(() => texture);
}

/** R30: what releaseTexture did, for QA (groddleQA). */
const releases = { destroyed: 0, held: 0, shared: 0, unknown: 0 };
export function releaseStats() {
  return { ...releases };
}

/**
 * R30 (#577/#578): the one way to free a picture this module loaded. Gives back one hold
 * (holdSource / holdTexture / loadHeldTexture / loadOwnTexture) on the texture's source. Once no hold
 * is left the source is forgotten here and destroyed, unless a plain sourceFromUrl / textureFromUrl /
 * loadTexture caller also has it: they keep it for good, so it stays (an item overlay once freed the
 * pick you swing that way, and the next frame threw). Frames the caller cut from it are its own to
 * destroy (destroy(false)). Returns 'destroyed', 'held' (other holds left), 'shared' (kept for the
 * plain callers), 'gone' (already destroyed) or 'unknown' (not this module's: nothing is done).
 */
export function releaseTexture(textureOrSource) {
  const source = sourceOf(textureOrSource);
  const state = source?.[LOAD];
  if (!state) {
    releases.unknown += 1;
    return 'unknown';
  }
  if (source.destroyed) return 'gone';
  if (state.holds > 0) state.holds -= 1;
  if (state.holds > 0) {
    releases.held += 1;
    return 'held';
  }
  if (state.shared) {
    releases.shared += 1;
    return 'shared';
  }
  if (sources.get(state.url) === source) sources.delete(state.url);
  if (textures.get(state.url)?.source === source) textures.delete(state.url);
  source.destroy();
  releases.destroyed += 1;
  return 'destroyed';
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

/**
 * #577/#578 (R30): a Texture over a TextureSource of its own, not the one shared per URL, for a
 * module that destroys what it loaded when done with it (js/item-overlay.js). Destroying the shared
 * source broke every other holder of that URL: a sheet's frames another module had cut (the pick
 * you swing at a rock) then drew a destroyed source and the render threw. Resolves once loaded.
 */
export function loadOwnTexture(url, opts = {}) {
  const key = routeUrl(url, { raw: Boolean(opts.raw) });
  const source = createSource(key, opts);
  source[LOAD].asked = String(url);
  // Its one holder frees it with releaseTexture; it is never in the cache, so nobody else has it.
  source[LOAD].own = true;
  source[LOAD].holds = 1;
  const texture = new (pixi().Texture)({ source, label: key, dynamic: true });
  return whenLoaded(texture).then(() => texture);
}

/** Preload several URLs; failures resolve to null. */
export function loadTextures(urls, opts = {}) {
  return Promise.all(urls.map((url) => loadTexture(url, opts).catch(() => null)));
}

/** The cached Texture for a URL, or null when it was never requested or has been freed (R30). */
export function cachedTexture(url) {
  const texture = textures.get(routeUrl(url));
  if (!texture || texture.destroyed || !texture.source || texture.source.destroyed) return null;
  if (texture.source[LOAD]) texture.source[LOAD].shared = true;
  return texture;
}

/** Forget a URL (Pixi 7's Texture.removeFromCache); does not destroy it (releaseTexture frees). */
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

/** The URL the game asked for (before js/sprite-hires.js and friends routed it), or null. */
export function askedUrl(textureOrSource) {
  const state = sourceOf(textureOrSource)?.[LOAD];
  return state ? state.asked || state.url : null;
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

const UPLOAD_GUARD = Symbol('groddleUploadGuard');
/** #312 (G708): how many times one image is sent to the GPU again after a failed upload. */
export const UPLOAD_RETRIES = 3;

/**
 * #312 (G708): on an iPhone two rocks drew as opaque black boxes the size of their frame. WebGL
 * samples a texture that never got its pixels as opaque black (an incomplete texture), and Pixi
 * never sends an image again once it has tried. A long phone session runs the GPU close to the
 * memory WebKit allows (G663), so an upload can fail with OUT_OF_MEMORY: the rock sheets were the
 * newest art (Yan Jaggery had just opened), so the first to be uploaded after the memory ran out.
 * This checks each image upload's GL error and, on one, frees what Pixi's texture GC can and
 * unloads the source, so its next draw uploads it again (UPLOAD_RETRIES at most). getError waits
 * for the GPU, so the game turns it on for phones only. Returns the stats object (checked, failed,
 * retried, gaveUp), or null when the renderer is not WebGL.
 */
export function guardImageUploads(renderer, { retries = UPLOAD_RETRIES, later = (fn) => setTimeout(fn, 0) } = {}) {
  const sys = renderer?.texture;
  const gl = renderer?.gl;
  if (!sys || !gl || typeof gl.getError !== 'function' || typeof sys.onSourceUpdate !== 'function') return null;
  if (sys[UPLOAD_GUARD]) return sys[UPLOAD_GUARD];
  const stats = { checked: 0, failed: 0, retried: 0, gaveUp: 0, last: '' };
  const tries = new WeakMap();
  const upload = sys.onSourceUpdate;
  // An instance property: Pixi's initSource listens with this.onSourceUpdate, so sources first
  // drawn from now on (every street's art) report here.
  sys.onSourceUpdate = function guardedUpload(source) {
    const out = upload.call(this, source);
    if (!source?.[LOAD]?.loaded || source.destroyed) return out;
    stats.checked += 1;
    const err = gl.getError();
    if (err === gl.NO_ERROR || gl.isContextLost?.()) return out;
    stats.failed += 1;
    stats.last = `${source[LOAD].url} 0x${err.toString(16)}`;
    const n = (tries.get(source) || 0) + 1;
    tries.set(source, n);
    if (n > retries) {
      stats.gaveUp += 1;
      return out;
    }
    later(() => {
      try {
        renderer.textureGC?.run?.();
      } catch { /* nothing to free */ }
      if (source.destroyed) return;
      source.unload();
      stats.retried += 1;
    });
    return out;
  };
  sys[UPLOAD_GUARD] = stats;
  return stats;
}
