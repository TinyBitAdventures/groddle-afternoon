/**
 * MAPLOAD (Austin 2026-11-13): a region's map is ready when the World map opens it.
 *
 * A region map draws its painting (js/hub-map-backgrounds.js, tools/map-backgrounds/build.mjs: 760 x 460
 * and 1520 x 920 WebP) as an SVG <image> (js/map-graph.js renderHubMapSvg). There is no image cache of
 * the game's own in that path: the browser fetches the file when the map is drawn and keeps it in its
 * image cache under the keyed URL (js/data-urls.js). On a slow line a click into a region showed its
 * streets on an empty box for seconds. This module warms that same cache ahead of the click: an Image
 * for the very URL the Map will draw (the size it picks on this screen, with its content key), so the
 * <image> finds it there.
 *
 * When (game.js): a region's card shows on the World view, after the pointer rests on it (hover, or
 * keyboard focus) or at once on the first tap of a phone (js/map-views.js bindWorldMap onPreview); your
 * own region when the World view opens; a station's region when its menu opens on the Subway view. At
 * most MAP_BG_PRELOAD_CAP regions are held, the oldest let go (a download still running is stopped):
 * never all 47 at once (a 1520 x 920 painting is 5.6 MB once decoded, on a phone).
 *
 * While a painting still loads, the map draws the region's own 150 x 91 thumb from Tiny Speck's world
 * map (glitch-overlays/world_map.fla z_hub_maps_small, the map index's thumbLocal, the hover cards'
 * picture) in its place, scaled up and softened (prepareMapBg sets view.bgWait for renderHubMapSvg). The
 * painting was made from that thumb and frames the same view (tools/map-backgrounds/build.mjs), so when
 * it arrives it fades in over it with nothing moving (watchMapBg; style.css .map-bg-soft).
 *
 * The Subway view's paper (2026-11-13, js/map-views.js SUBWAY_PAPER) is fetched the same way, so the
 * view never opens on the bare sage: when the Map opens, and when the pointer or keyboard focus comes
 * to its Subway button (game.js warmSubwayPaper, loader.warm). It is one picture, held apart from the
 * regions' cap. Opened before it arrives (the Subway Map sign's view), it fades in over the sage.
 *
 * The World view's two charts (2026-11-13, js/map-views.js worldCharts: Tiny Speck's 760 x 460 charts
 * and their sharpened 1520 x 920 twins) are warmed the same way, the pair this screen draws: when the
 * Map opens and when the pointer or keyboard focus comes to its World button (game.js warmWorldCharts).
 */
import { HUB_MAP_BACKGROUNDS } from './hub-map-backgrounds.js?v=d6a23c90';
import { WORLD_MAP } from './map-views-data.js?v=bf881f35';
import { SUBWAY_PAPER, subwayPaper, worldCharts } from './map-views.js?v=75d5f9a0';

/** How many regions' paintings are held at once (the latest previews, your own region among them). */
export const MAP_BG_PRELOAD_CAP = 4;
/** How long the pointer rests on a region before its painting is fetched (a sweep across the map fetches none). */
export const MAP_BG_HOVER_MS = 150;
/** The painting's fade over the thumb (style.css .hub-map-svg .map-bg-soft transition); the thumb goes after it. */
export const MAP_BG_FADE_MS = 350;
/** With no load event by then, the painting shows anyway (whatever of it has arrived). */
export const MAP_BG_GIVE_UP_MS = 20000;

/** An art URL with its content key (js/data-urls.js groddleDataUrl); as it is in Node and on a page without the map. */
const keyedArt = (url) => (typeof globalThis.groddleDataUrl === 'function' ? globalThis.groddleDataUrl(url) : url);

/**
 * Does the Map draw the Retina painting? On a Retina screen always (map-graph.js buildHubMapView), on a
 * 1x screen once it draws larger than 760 x 460 (game.js fitMapCanvas: scale x dpr past 1.01).
 */
export function mapBgWantsHi(dpr = 1, fitScale = 0) {
  const d = Number(dpr) || 1;
  return d > 1 || (Number(fitScale) || 0) * d > 1.01;
}

/** The painting the Map will draw for a region on this screen, unkeyed ('' when it has none). */
export function mapBgFile(hubId, { dpr = 1, fitScale = 0, backgrounds = HUB_MAP_BACKGROUNDS } = {}) {
  const soft = backgrounds[String(hubId ?? '')];
  if (!soft) return '';
  return mapBgWantsHi(dpr, fitScale) ? soft.x2 : soft.x1;
}

/** A region's painting and its thumb (the map index's thumbLocal), unkeyed. */
export function mapBgFiles(hubId, { dpr = 1, fitScale = 0, mapIndex = null, backgrounds = HUB_MAP_BACKGROUNDS } = {}) {
  return {
    url: mapBgFile(hubId, { dpr, fitScale, backgrounds }),
    thumb: String(mapIndex?.hubs?.[String(hubId ?? '')]?.thumbLocal || ''),
  };
}

/**
 * Before a region map is drawn (game.js openMap): the painting at the size this screen draws (the
 * Retina file at once when the Map last drew past 760 x 460 on a 1x screen, rather than the 1x file and
 * then a swap), and view.bgWait when it is not known to be loaded and a thumb can stand in for it.
 */
export function prepareMapBg(view, { loader = null, dpr = 1, fitScale = 0, keyed = keyedArt } = {}) {
  if (!view?.bgSoft) return view;
  if (view.bgSoftHi && mapBgWantsHi(dpr, fitScale)) view.bgSoft = view.bgSoftHi;
  view.bgWait = Boolean(view.thumbLocal) && !loader?.ready(keyed(view.bgSoft));
  return view;
}

/** The Subway view's paper at the size the Map draws on this screen, unkeyed (mapBgWantsHi, as a region's painting). */
export function subwayPaperFile({ dpr = 1, fitScale = 0, paper = SUBWAY_PAPER } = {}) {
  return mapBgWantsHi(dpr, fitScale) ? paper.x2 : paper.x1;
}

/**
 * Before the Subway view is drawn (game.js showMapView): js/map-views.js renderSubwayMapSvg's `paper`,
 * the size this screen draws, waiting (hidden, to fade in) unless it is known to be loaded.
 */
export function prepareSubwayPaper({ loader = null, dpr = 1, fitScale = 0, keyed = keyedArt, paper = SUBWAY_PAPER } = {}) {
  const href = subwayPaperFile({ dpr, fitScale, paper });
  return { ...subwayPaper({ dpr, paper }), href, wait: !loader?.ready(keyed(href)) };
}

/** The World view's two charts at the size the Map draws on this screen, unkeyed (mapBgWantsHi, as a region's painting). */
export function worldChartFiles({ dpr = 1, fitScale = 0, world = WORLD_MAP } = {}) {
  const c = worldCharts({ hi: mapBgWantsHi(dpr, fitScale), world });
  return [c.locked, c.unlocked];
}

/**
 * Before the World view is drawn (game.js showMapView): js/map-views.js renderWorldMapSvg's `charts`,
 * the Retina pair at once when this screen draws it (a 1x screen whose Map last drew past 760 x 460).
 */
export function prepareWorldCharts({ dpr = 1, fitScale = 0, world = WORLD_MAP } = {}) {
  return worldCharts({ hi: mapBgWantsHi(dpr, fitScale), world });
}

/**
 * The paintings fetched ahead of a click. files(hubId) -> { url, thumb } (unkeyed; mapBgFiles);
 * onPreload(hubId) runs each time a region is fetched (game.js warms its map data too).
 *   preload(hubId)                 fetch now (your region, a station's region)
 *   preview(hubId, { now })        a card showed: fetch after hoverMs, or now (a tap); '' puts a pending one away
 *   warm(file)                     fetch one picture outside the regions (the Subway paper), never let go; its keyed URL
 *   ready(url) / markReady(url)    a keyed painting URL known to have loaded (preloaded or drawn by the Map)
 *   held() / pending()             the hub ids held, oldest first, and the one waiting on the pointer (QA, tests)
 */
export function createMapBgPreloader({
  cap = MAP_BG_PRELOAD_CAP,
  hoverMs = MAP_BG_HOVER_MS,
  files = () => ({ url: '', thumb: '' }),
  onPreload = null,
  keyed = keyedArt,
  makeImage = () => new Image(),
  timers = globalThis,
} = {}) {
  /** hub id -> { hubId, url, thumb, state, img, thumbImg }, oldest first. */
  const entries = new Map();
  /** Every keyed painting URL known to have loaded: strings only, so it may grow past the cap. */
  const loaded = new Set();
  let waiting = null;

  const fetchImage = (url, done) => {
    const img = makeImage();
    img.decoding = 'async';
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = url;
    return img;
  };

  /** Let a region go; a download still running stops (an image without a source fetches nothing). */
  const drop = (id) => {
    const e = entries.get(id);
    if (!e) return;
    entries.delete(id);
    for (const img of [e.img, e.thumbImg]) {
      if (!img) continue;
      img.onload = null;
      img.onerror = null;
      if (e.state === 'loading') img.removeAttribute?.('src');
    }
  };

  function preload(hubId) {
    const id = String(hubId ?? '');
    if (!id) return null;
    const f = files(id) || {};
    const url = f.url ? keyed(f.url) : '';
    if (!url) return null;
    let e = entries.get(id);
    if (e && e.url === url && e.state !== 'failed') {
      entries.delete(id);
      entries.set(id, e);
      return e;
    }
    drop(id);
    const known = loaded.has(url);
    e = { hubId: id, url, thumb: f.thumb ? keyed(f.thumb) : '', state: known ? 'ready' : 'loading', img: null, thumbImg: null };
    entries.set(id, e);
    const mine = e;
    e.img = fetchImage(url, (ok) => {
      if (entries.get(id) !== mine) return;
      mine.state = ok ? 'ready' : 'failed';
      if (ok) loaded.add(url);
    });
    // The thumb too (a few KB), so a click before the painting arrives has it to draw.
    if (e.thumb && !known) e.thumbImg = fetchImage(e.thumb, () => {});
    while (entries.size > cap) drop(entries.keys().next().value);
    onPreload?.(id);
    return e;
  }

  /** keyed URL -> its Image while it downloads (held, so it is not collected half way). */
  const warming = new Map();
  function warm(file) {
    const url = file ? keyed(file) : '';
    if (!url || loaded.has(url) || warming.has(url)) return url;
    warming.set(url, fetchImage(url, (ok) => {
      warming.delete(url);
      if (ok) loaded.add(url);
    }));
    return url;
  }

  function preview(hubId, { now = false } = {}) {
    if (waiting) {
      timers.clearTimeout(waiting.timer);
      waiting = null;
    }
    const id = String(hubId ?? '');
    if (!id) return;
    if (now || !(hoverMs > 0)) {
      preload(id);
      return;
    }
    const w = { hubId: id, timer: null };
    w.timer = timers.setTimeout(() => {
      if (waiting === w) waiting = null;
      preload(id);
    }, hoverMs);
    waiting = w;
  }

  return {
    preload,
    preview,
    warm,
    warming: () => [...warming.keys()],
    ready: (url) => loaded.has(String(url || '')),
    markReady: (url) => {
      if (url) loaded.add(String(url));
    },
    held: () => [...entries.keys()],
    entry: (hubId) => entries.get(String(hubId ?? '')) || null,
    pending: () => waiting?.hubId || '',
  };
}

/**
 * After a region map is drawn (game.js openMap): when its painting arrives it fades in over the thumb
 * (the is-waiting class comes off), and the thumb goes once the fade is over; its URL is noted as
 * loaded either way. A failed painting leaves the thumb in its place. QA: the map canvas's data mapBg,
 * "cached" (known loaded: drawn at once, no thumb), "wait" (on the thumb), then "ready" (it arrived
 * and faded in), "late" (shown after MAP_BG_GIVE_UP_MS without a load event) or "failed" (the thumb
 * stays; a later load still shows it); none on a region without a painting. The Subway view's paper is
 * watched the same way (image.map-bg-soft, no thumb: the sage stays under it).
 */
export function watchMapBg(canvas, { loader = null, timers = globalThis, fadeMs = MAP_BG_FADE_MS, giveUpMs = MAP_BG_GIVE_UP_MS } = {}) {
  const img = canvas?.querySelector?.('image.map-bg-soft');
  if (!img) {
    if (canvas?.dataset) delete canvas.dataset.mapBg;
    return null;
  }
  const thumb = canvas.querySelector('.map-bg-wait');
  const wasWaiting = img.classList.contains('is-waiting');
  canvas.dataset.mapBg = wasWaiting ? 'wait' : 'cached';
  let shown = !wasWaiting;
  let giveUp = null;
  const show = (state) => {
    if (shown) return;
    shown = true;
    canvas.dataset.mapBg = state;
    if (giveUp) timers.clearTimeout(giveUp);
    img.classList.remove('is-waiting');
    if (thumb) timers.setTimeout(() => thumb.remove(), fadeMs + 50);
  };
  img.addEventListener('load', () => {
    loader?.markReady(img.getAttribute('href'));
    show('ready');
  });
  // Not final: the Map can swap the file for its Retina twin (fitMapCanvas), whose load still shows it.
  img.addEventListener('error', () => {
    if (!shown) canvas.dataset.mapBg = 'failed';
  });
  if (wasWaiting) giveUp = timers.setTimeout(() => show('late'), giveUpMs);
  return img;
}
