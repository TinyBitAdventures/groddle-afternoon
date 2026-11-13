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
 */
import { HUB_MAP_BACKGROUNDS } from './hub-map-backgrounds.js?v=2b2d6468';

/** How many regions' paintings are held at once (the latest previews, your own region among them). */
export const MAP_BG_PRELOAD_CAP = 4;
/** How long the pointer rests on a region before its painting is fetched (a sweep across the map fetches none). */
export const MAP_BG_HOVER_MS = 150;

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
 * then a swap), the file a preload fetched.
 */
export function prepareMapBg(view, { dpr = 1, fitScale = 0 } = {}) {
  if (!view?.bgSoft) return view;
  if (view.bgSoftHi && mapBgWantsHi(dpr, fitScale)) view.bgSoft = view.bgSoftHi;
  return view;
}

/**
 * The paintings fetched ahead of a click. files(hubId) -> { url, thumb } (unkeyed; mapBgFiles);
 * onPreload(hubId) runs each time a region is fetched (game.js warms its map data too).
 *   preload(hubId)                 fetch now (your region, a station's region)
 *   preview(hubId, { now })        a card showed: fetch after hoverMs, or now (a tap); '' puts a pending one away
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
    ready: (url) => loaded.has(String(url || '')),
    markReady: (url) => {
      if (url) loaded.add(String(url));
    },
    held: () => [...entries.keys()],
    entry: (hubId) => entries.get(String(hubId ?? '')) || null,
    pending: () => waiting?.hubId || '',
  };
}
