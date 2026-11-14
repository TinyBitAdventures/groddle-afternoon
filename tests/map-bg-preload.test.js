/**
 * MAPLOAD (Austin 2026-11-13): a region's map is ready when the World map opens it. Its painting
 * (js/hub-map-backgrounds.js) is fetched ahead of the click, at the size the Map draws on this screen
 * (js/map-bg-preload.js): when a region's card shows on the World view (a resting pointer, keyboard
 * focus, a phone's first tap), your own region when the World view opens, a station's region when its
 * menu opens. While a painting still loads, the region's thumb from the world map stands in for it,
 * softened, and the painting fades in over it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUB_MAP_BACKGROUNDS } from '../public/js/hub-map-backgrounds.js?v=d6a23c90';
import { WORLD_MAP } from '../public/js/map-views-data.js?v=bf881f35';
import { bindWorldMap } from '../public/js/map-views.js?v=00dfaf00';
import { MAP_THUMB_SOFT, buildHubMapView, renderHubMapSvg } from '../public/js/map-graph.js?v=31437f5b';
import {
  MAP_BG_FADE_MS,
  MAP_BG_GIVE_UP_MS,
  MAP_BG_HOVER_MS,
  MAP_BG_PRELOAD_CAP,
  createMapBgPreloader,
  mapBgFile,
  mapBgFiles,
  mapBgWantsHi,
  prepareMapBg,
  prepareSubwayPaper,
  prepareWorldCharts,
  subwayPaperFile,
  watchMapBg,
  worldChartFiles,
} from '../public/js/map-bg-preload.js?v=f2edd389';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hub = (id) => JSON.parse(read(`public/assets/maps/hubs/hub-${id}.json`));
const INDEX = JSON.parse(read('public/assets/maps/index.json'));
const STREETS = JSON.parse(read('public/assets/streets/index.json')).streets;

/** Timers run by hand: { setTimeout, clearTimeout, run(ms) advances the clock }. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const queue = new Map();
  return {
    setTimeout(fn, ms) {
      const id = next++;
      queue.set(id, { fn, at: now + (Number(ms) || 0) });
      return id;
    },
    clearTimeout(id) {
      queue.delete(id);
    },
    run(ms) {
      now += ms;
      for (const [id, t] of [...queue].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at > now) continue;
        queue.delete(id);
        t.fn();
      }
    },
    get size() {
      return queue.size;
    },
  };
}

/** An Image that loads when told to: images[], each with .src, .aborted, .load(), .fail(). */
function fakeImages() {
  const images = [];
  const make = () => {
    const img = {
      src: '',
      aborted: false,
      decoding: '',
      onload: null,
      onerror: null,
      removeAttribute(k) {
        if (k === 'src') {
          this.aborted = true;
          this.src = '';
        }
      },
      load() {
        this.onload?.();
      },
      fail() {
        this.onerror?.();
      },
    };
    images.push(img);
    return img;
  };
  return { images, make, bySrc: (s) => images.find((i) => i.src === s) };
}

const files = (hubId) => mapBgFiles(hubId, { dpr: 2, mapIndex: INDEX });

describe('which painting the Map draws on this screen (MAPLOAD)', () => {
  it('the Retina file on a Retina screen, or on a 1x screen once the Map drew past 760 x 460 (fitMapCanvas)', () => {
    assert.equal(mapBgWantsHi(2, 0), true);
    assert.equal(mapBgWantsHi(3, 0.4), true);
    assert.equal(mapBgWantsHi(1, 1), false, 'the 760 x 460 frame at 1x');
    assert.equal(mapBgWantsHi(1, 1.2), true);
    assert.equal(mapBgWantsHi(undefined, undefined), false);
    assert.equal(mapBgFile('76', { dpr: 1, fitScale: 0.9 }), 'assets/maps/art/bg/alakol.webp');
    assert.equal(mapBgFile('76', { dpr: 1, fitScale: 1.3 }), 'assets/maps/art/bg/alakol@2x.webp');
    assert.equal(mapBgFile('76', { dpr: 3 }), 'assets/maps/art/bg/alakol@2x.webp');
    assert.equal(mapBgFile('77', { dpr: 2 }), '', 'a region without a painting');
    assert.equal(mapBgFile('', { dpr: 2 }), '');
  });

  it('every region the world map offers has a painting and a thumb', () => {
    for (const id of Object.keys(WORLD_MAP.regions)) {
      const f = mapBgFiles(id, { dpr: 1, mapIndex: INDEX });
      assert.equal(f.url, HUB_MAP_BACKGROUNDS[id].x1, id);
      assert.match(f.thumb, /^assets\/maps\/art\/thumbs\/sm_[a-z]+\.jpg$/, id);
    }
    assert.equal(mapBgFiles('76', {}).thumb, '', 'no thumb before the map index is in');
  });

  it('prepareMapBg takes the Retina file at once when the Map last drew past 760 x 460 (no 1x load and swap)', () => {
    const big = prepareMapBg(buildHubMapView(hub(76), '', STREETS), { dpr: 1, fitScale: 1.25 });
    assert.equal(big.bgSoft, 'assets/maps/art/bg/alakol@2x.webp');
    assert.doesNotMatch(renderHubMapSvg(big), /data-hi=/, 'nothing left for fitMapCanvas to swap');
    const small = prepareMapBg(buildHubMapView(hub(76), '', STREETS), { dpr: 1, fitScale: 0.8 });
    assert.equal(small.bgSoft, 'assets/maps/art/bg/alakol.webp');
    assert.match(renderHubMapSvg(small), /data-hi="assets\/maps\/art\/bg\/alakol@2x\.webp"/);
    // A region without a painting is left as it is.
    const bare = buildHubMapView(hub(77), '', STREETS);
    assert.equal(prepareMapBg(bare, { dpr: 2 }).bgWait, undefined);
  });
});

describe('the preloader (js/map-bg-preload.js)', () => {
  it('fetches a region\'s painting and thumb under the keyed URLs the Map draws', () => {
    const im = fakeImages();
    const warmed = [];
    const had = globalThis.groddleDataUrl;
    globalThis.groddleDataUrl = (u) => `${u}?v=k1`;
    try {
      const pre = createMapBgPreloader({ files, makeImage: im.make, onPreload: (id) => warmed.push(id) });
      const e = pre.preload('76');
      assert.equal(e.url, 'assets/maps/art/bg/alakol@2x.webp?v=k1');
      assert.deepEqual(im.images.map((i) => i.src), ['assets/maps/art/bg/alakol@2x.webp?v=k1', 'assets/maps/art/thumbs/sm_alakol.jpg?v=k1']);
      assert.equal(im.images[0].decoding, 'async');
      assert.deepEqual(warmed, ['76'], 'the region\'s map data is warmed too (game.js)');
      assert.equal(pre.ready(e.url), false);
      im.images[0].load();
      assert.equal(pre.ready(e.url), true);
      assert.equal(pre.entry('76').state, 'ready');
      // Asked again: nothing new is fetched.
      pre.preload('76');
      assert.equal(im.images.length, 2);
      assert.equal(pre.preload('77'), null, 'a region without a painting');
      assert.equal(pre.preload(''), null);
    } finally {
      if (had) globalThis.groddleDataUrl = had;
      else delete globalThis.groddleDataUrl;
    }
  });

  it(`holds ${MAP_BG_PRELOAD_CAP} regions at most: the oldest goes, a download still running stops`, () => {
    assert.equal(MAP_BG_PRELOAD_CAP, 4);
    const im = fakeImages();
    const pre = createMapBgPreloader({ files, makeImage: im.make });
    for (const id of ['76', '58', '56', '64']) pre.preload(id);
    im.bySrc(HUB_MAP_BACKGROUNDS['76'].x2).load();
    pre.preload('58'); // asked again: the newest now
    assert.deepEqual(pre.held(), ['76', '56', '64', '58']);
    pre.preload('85');
    assert.deepEqual(pre.held(), ['56', '64', '58', '85']);
    // 76 had loaded: let go, not stopped; its URL stays known.
    assert.equal(im.bySrc(HUB_MAP_BACKGROUNDS['76'].x2).aborted, false);
    assert.equal(pre.ready(HUB_MAP_BACKGROUNDS['76'].x2), true);
    pre.preload('86');
    assert.deepEqual(pre.held(), ['64', '58', '85', '86']);
    const stopped = im.images.filter((i) => i.aborted);
    assert.equal(stopped.length, 2, 'the painting and the thumb of 56, still loading, are stopped');
    // A late load event of a region let go changes nothing.
    stopped[0].load();
    assert.equal(pre.ready(HUB_MAP_BACKGROUNDS['56'].x2), false);
    // Sweeping all 47 never holds more than the cap.
    for (const id of Object.keys(WORLD_MAP.regions)) pre.preload(id);
    assert.equal(pre.held().length, MAP_BG_PRELOAD_CAP);
  });

  it('a failed painting is fetched again next time; one known loaded skips the thumb', () => {
    const im = fakeImages();
    const pre = createMapBgPreloader({ files, makeImage: im.make });
    pre.preload('76');
    im.images[0].fail();
    assert.equal(pre.entry('76').state, 'failed');
    pre.preload('76');
    assert.equal(im.images.length, 4, 'painting and thumb again');
    const pre2 = createMapBgPreloader({ files, makeImage: im.make });
    pre2.markReady(HUB_MAP_BACKGROUNDS['58'].x2);
    pre2.preload('58');
    assert.equal(pre2.entry('58').state, 'ready');
    assert.equal(im.images.at(-1).src, HUB_MAP_BACKGROUNDS['58'].x2, 'the painting only (kept warm), no thumb');
  });

  it(`a card's preview waits ${MAP_BG_HOVER_MS} ms for a resting pointer; a tap fetches at once; '' puts it away`, () => {
    const im = fakeImages();
    const t = fakeTimers();
    const pre = createMapBgPreloader({ files, makeImage: im.make, timers: t });
    pre.preview('76');
    assert.equal(pre.pending(), '76');
    assert.equal(im.images.length, 0);
    t.run(MAP_BG_HOVER_MS - 10);
    pre.preview('58'); // the pointer moved on before it rested
    t.run(MAP_BG_HOVER_MS - 10);
    assert.equal(im.images.length, 0);
    t.run(20);
    assert.deepEqual(pre.held(), ['58']);
    assert.equal(pre.pending(), '');
    pre.preview('56');
    pre.preview('');
    t.run(MAP_BG_HOVER_MS * 2);
    assert.deepEqual(pre.held(), ['58'], 'the card went before the pointer rested');
    pre.preview('64', { now: true });
    assert.deepEqual(pre.held(), ['58', '64']);
  });
});

/** Just enough of the drawn world map for bindWorldMap. */
function fakeWorldCanvas(ids) {
  const el = (cls, attrs = {}) => {
    const classes = new Set(cls.split(' ').filter(Boolean));
    const listeners = {};
    return {
      attrs,
      innerHTML: '',
      classList: {
        contains: (c) => classes.has(c),
        toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
        remove: (c) => classes.delete(c),
        add: (c) => classes.add(c),
      },
      getAttribute: (k) => attrs[k] ?? null,
      addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
      fire(type, e = {}) {
        for (const fn of listeners[type] || []) fn({ target: this, preventDefault() {}, ...e });
      },
      matches: () => false,
    };
  };
  const groups = ids.map((id) => el('world-region is-open', { 'data-hub': id }));
  const layer = el('world-card-layer');
  const svg = el('world-map-svg');
  svg.querySelector = (sel) => {
    if (sel === '.world-card-layer') return layer;
    if (sel === '.world-you') return null;
    const m = /data-hub="([^"]+)"/.exec(sel);
    return m ? groups.find((g) => g.attrs['data-hub'] === m[1]) || null : null;
  };
  svg.querySelectorAll = () => groups;
  const canvas = { dataset: {}, querySelector: () => svg };
  return { canvas, groups };
}

describe('the preview triggers (bindWorldMap onPreview, game.js)', () => {
  it('a hover shows the card and previews its region; leaving puts it away; the click opens it', () => {
    const { canvas, groups } = fakeWorldCanvas(['76', '58']);
    const seen = [];
    const opened = [];
    bindWorldMap(canvas, { onOpen: (id) => opened.push(id), onPreview: (id, how) => seen.push(how ? `${id}:${how}` : `${id}`) });
    groups[0].fire('pointerenter', { pointerType: 'mouse' });
    assert.equal(canvas.dataset.worldCard, '76');
    groups[0].fire('pointerleave', { pointerType: 'mouse' });
    groups[1].fire('pointerenter', { pointerType: 'mouse' });
    groups[1].fire('click');
    assert.deepEqual(seen, ['76:pointer', '', '58:pointer']);
    assert.deepEqual(opened, ['58']);
  });

  it('on a phone the first tap shows the card and previews at once (tap); the second opens the map', () => {
    const { canvas, groups } = fakeWorldCanvas(['76']);
    const seen = [];
    const opened = [];
    bindWorldMap(canvas, { touch: true, onOpen: (id) => opened.push(id), onPreview: (id, how) => seen.push(`${id}:${how}`) });
    groups[0].fire('pointerdown', { pointerType: 'touch' });
    groups[0].fire('pointerenter', { pointerType: 'touch' });
    groups[0].fire('click');
    assert.deepEqual(seen, ['76:tap']);
    assert.deepEqual(opened, []);
    groups[0].fire('click');
    assert.deepEqual(opened, ['76']);
    assert.deepEqual(seen, ['76:tap'], 'no second preview');
  });

  it('game.js: a card previews (a tap at once), the World view fetches your region, a station\'s menu its region', () => {
    const game = read('public/game.js');
    assert.match(game, /onPreview: \(id, how\) => mapBgLoader\.preview\(id, \{ now: how === 'tap' \}\)/);
    assert.match(game, /fitMapCanvas\(panel\);\n  \/\/ MAPLOAD: [^\n]*\n  if \(which === 'world'\) mapBgLoader\.preload\(spot\.hubId\);\n  warmSubwayPaper\(\);\n  \/\/ G663: [^\n]*\n  if \(!TOUCH_PHONE\) warmWorldCharts\(\);\n\}/, 'after the fit, which picks the size');
    assert.match(game, /openMapStreetMenu\(canvas, e, street, \{ here: st\.surfaceStreetTsid === currentStreetTsid \}\);\n[^\n]*\n        mapBgLoader\.preload\(st\.surfaceHubId\);/);
    // The files at the size the Map draws (fitMapCanvas keeps its scale), the map data warmed beside them.
    assert.match(game, /files: \(hubId\) => mapBgFiles\(hubId, \{ dpr: globalThis\.devicePixelRatio, fitScale: mapFitScale, mapIndex: mapIndexCache \}\)/);
    assert.match(game, /onPreload: \(hubId\) => loadHubMapData\(hubId\)\.catch\(\(\) => \{\}\)/);
    assert.match(game, /soft\.setAttribute\('href', soft\.dataset\.hi\);\n    \}\n    mapFitScale = fit\.scale;/);
    // The region map is drawn from the same cache: prepared before it is drawn.
    const prep = game.indexOf('prepareMapBg(view, { loader: mapBgLoader, dpr: globalThis.devicePixelRatio, fitScale: mapFitScale });');
    const drawn = game.indexOf('canvas.innerHTML = renderHubMapSvg(view);');
    assert.ok(prep > game.indexOf('async function openMap(') && drawn > prep, 'prepared, then drawn');
  });
});

describe('the thumb while the painting loads, then the swap', () => {
  const STYLE = read('public/style.css');

  it('prepareMapBg waits on the thumb unless the painting is known loaded', () => {
    const pre = createMapBgPreloader({ files, makeImage: fakeImages().make });
    const view = prepareMapBg(buildHubMapView(hub(58), '', STREETS), { loader: pre, dpr: 2 });
    assert.equal(view.bgWait, true);
    pre.markReady(HUB_MAP_BACKGROUNDS['58'].x2);
    assert.equal(prepareMapBg(buildHubMapView(hub(58), '', STREETS), { loader: pre, dpr: 2 }).bgWait, false);
    // A region whose hub data names no thumb draws as before.
    const noThumb = { ...hub(58), thumbLocal: '' };
    assert.equal(prepareMapBg(buildHubMapView(noThumb, '', STREETS), { loader: createMapBgPreloader(), dpr: 2 }).bgWait, false);
  });

  it('the map draws the region\'s thumb in the painting\'s frame, softened, under the painting and everything on it', () => {
    const view = buildHubMapView(hub(58), '', STREETS);
    view.bgWait = true;
    const svg = renderHubMapSvg(view);
    const thumbAt = svg.indexOf('<g class="map-bg-wait"');
    const bgAt = svg.indexOf('<image class="map-bg map-bg-soft is-waiting"');
    assert.ok(thumbAt > 0 && bgAt > thumbAt, 'thumb, then the painting over it');
    assert.match(svg, /<image class="map-bg-thumb" href="assets\/maps\/art\/thumbs\/sm_groddlemeadow\.jpg" x="0" y="0" width="760" height="460" preserveAspectRatio="none" filter="url\(#mapThumbSoft\)"\/>/);
    assert.match(svg, /<image class="map-bg map-bg-soft is-waiting" href="assets\/maps\/art\/bg\/groddlemeadow\.webp"[^>]* x="0" y="0" width="760" height="460" preserveAspectRatio="none"\/>/, 'the same frame: nothing moves at the swap');
    assert.match(svg, new RegExp(`<filter id="mapThumbSoft" x="0" y="0" width="1" height="1"[^>]*><feGaussianBlur stdDeviation="${MAP_THUMB_SOFT}" result="soft"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="soft"/></feMerge></filter>`));
    assert.match(svg, /<g class="map-bg-wait" pointer-events="none">/);
    for (const cls of ['class="map-seg', 'class="map-label', 'class="map-hub-go"']) assert.ok(svg.indexOf(cls) > bgAt, `${cls} draws at once, on top`);
    // Known loaded: drawn exactly as before.
    view.bgWait = false;
    const plain = renderHubMapSvg(view);
    assert.doesNotMatch(plain, /map-bg-wait|map-bg-thumb|is-waiting|mapThumbSoft/);
    assert.match(plain, /<image class="map-bg map-bg-soft" href=/);
  });

  it('style.css hides a waiting painting and fades it in (no fade with reduced motion)', () => {
    assert.match(STYLE, /\.hub-map-svg \.map-bg-soft \{ transition: opacity 0\.35s ease; \}/);
    assert.equal(MAP_BG_FADE_MS, 350, 'the thumb goes after the same fade');
    assert.match(STYLE, /\.hub-map-svg \.map-bg-soft\.is-waiting \{ opacity: 0; \}/);
    assert.match(STYLE, /@media \(prefers-reduced-motion: reduce\) \{\n  \.hub-map-svg \.map-bg-soft \{ transition: none; \}\n\}/);
    assert.match(read('public/game.js'), /canvas\.innerHTML = renderHubMapSvg\(view\);\n(?:  [^\n]*\n){0,3}  watchMapBg\(canvas, \{ loader: mapBgLoader \}\);/);
  });

  /** A drawn region map: the painting <image> (waiting or not) and the thumb group. */
  function fakeMapCanvas({ waiting = true, href = 'assets/maps/art/bg/groddlemeadow@2x.webp' } = {}) {
    const classes = new Set(['map-bg', 'map-bg-soft', ...(waiting ? ['is-waiting'] : [])]);
    const listeners = {};
    const img = {
      attrs: { href },
      classList: { contains: (c) => classes.has(c), remove: (c) => classes.delete(c) },
      getAttribute: (k) => img.attrs[k] ?? null,
      setAttribute: (k, v) => (img.attrs[k] = v),
      addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
      fire: (type) => (listeners[type] || []).forEach((fn) => fn({})),
    };
    const thumb = waiting ? { removed: false, remove() { this.removed = true; } } : null;
    const canvas = {
      dataset: {},
      querySelector: (sel) => (sel === 'image.map-bg-soft' ? img : sel === '.map-bg-wait' ? thumb : null),
    };
    return { canvas, img, thumb, classes };
  }

  it('watchMapBg: the painting arrives, fades in over the thumb, the thumb goes after the fade, its URL is known', () => {
    const t = fakeTimers();
    const pre = createMapBgPreloader();
    const { canvas, img, thumb, classes } = fakeMapCanvas();
    watchMapBg(canvas, { loader: pre, timers: t });
    assert.equal(canvas.dataset.mapBg, 'wait');
    img.fire('load');
    assert.equal(classes.has('is-waiting'), false, 'fading in');
    assert.equal(canvas.dataset.mapBg, 'ready');
    assert.equal(pre.ready('assets/maps/art/bg/groddlemeadow@2x.webp'), true);
    assert.equal(thumb.removed, false, 'the thumb stays under the fade');
    t.run(MAP_BG_FADE_MS + 50);
    assert.equal(thumb.removed, true);
    t.run(MAP_BG_GIVE_UP_MS);
    assert.equal(canvas.dataset.mapBg, 'ready', 'the give-up timer was put away');
  });

  it('watchMapBg: a failed file keeps the thumb; the Retina twin\'s load still shows it; no load event at all shows it late', () => {
    const t = fakeTimers();
    const a = fakeMapCanvas();
    watchMapBg(a.canvas, { timers: t });
    a.img.fire('error');
    assert.equal(a.canvas.dataset.mapBg, 'failed');
    assert.equal(a.classes.has('is-waiting'), true);
    t.run(MAP_BG_FADE_MS * 2);
    assert.equal(a.thumb.removed, false);
    a.img.setAttribute('href', 'assets/maps/art/bg/groddlemeadow@2x.webp');
    a.img.fire('load');
    assert.equal(a.classes.has('is-waiting'), false);
    const b = fakeMapCanvas();
    watchMapBg(b.canvas, { timers: t });
    t.run(MAP_BG_GIVE_UP_MS);
    assert.equal(b.canvas.dataset.mapBg, 'late');
    assert.equal(b.classes.has('is-waiting'), false);
  });

  it('watchMapBg: a painting known loaded draws at once (cached); a region with none clears the QA mark', () => {
    const t = fakeTimers();
    const pre = createMapBgPreloader();
    const c = fakeMapCanvas({ waiting: false });
    watchMapBg(c.canvas, { loader: pre, timers: t });
    assert.equal(c.canvas.dataset.mapBg, 'cached');
    assert.equal(t.size, 0, 'nothing to wait for');
    c.img.fire('load');
    assert.equal(pre.ready('assets/maps/art/bg/groddlemeadow@2x.webp'), true);
    assert.equal(c.canvas.dataset.mapBg, 'cached', 'it never waited');
    const none = { dataset: { mapBg: 'wait' }, querySelector: () => null };
    assert.equal(watchMapBg(none), null);
    assert.equal(none.dataset.mapBg, undefined);
  });
});

describe('the Subway view\'s paper is fetched ahead too (2026-11-13)', () => {
  const X1 = 'assets/maps/art/subway/subway-map-paper.webp';
  const X2 = 'assets/maps/art/subway/subway-map-paper@2x.webp';

  it('the size the Map draws on this screen, as a region\'s painting (devicePixelRatio, a 1x Map past 760 x 460)', () => {
    assert.equal(subwayPaperFile({ dpr: 1, fitScale: 1 }), X1);
    assert.equal(subwayPaperFile({ dpr: 1, fitScale: 0.8 }), X1);
    assert.equal(subwayPaperFile({ dpr: 1, fitScale: 1.3 }), X2, 'a 1x screen drawing the Map at 1.3x');
    assert.equal(subwayPaperFile({ dpr: 2 }), X2);
    assert.equal(subwayPaperFile({ dpr: 3, fitScale: 0.4 }), X2, 'a phone');
  });

  it('prepareSubwayPaper waits (to fade in) unless the file is known loaded, and names the Retina twin', () => {
    const pre = createMapBgPreloader({ makeImage: fakeImages().make });
    assert.deepEqual(prepareSubwayPaper({ loader: pre, dpr: 1, fitScale: 1 }), { href: X1, hi: X2, wait: true });
    pre.markReady(X1);
    assert.deepEqual(prepareSubwayPaper({ loader: pre, dpr: 1, fitScale: 1 }), { href: X1, hi: X2, wait: false });
    assert.equal(prepareSubwayPaper({ loader: pre, dpr: 2 }).href, X2);
    assert.equal(prepareSubwayPaper({ loader: pre, dpr: 2 }).wait, true, 'the Retina file is its own download');
  });

  it('warm fetches it once under its keyed URL, outside the regions\' cap, and knows it once loaded', () => {
    const im = fakeImages();
    const had = globalThis.groddleDataUrl;
    globalThis.groddleDataUrl = (u) => `${u}?v=k2`;
    try {
      const pre = createMapBgPreloader({ files, makeImage: im.make });
      assert.equal(pre.warm(X2), `${X2}?v=k2`);
      assert.equal(pre.warm(X2), `${X2}?v=k2`);
      assert.deepEqual(im.images.map((i) => i.src), [`${X2}?v=k2`], 'asked twice, fetched once');
      assert.deepEqual(pre.warming(), [`${X2}?v=k2`]);
      for (const id of ['76', '58', '56', '64', '85']) pre.preload(id);
      assert.equal(im.images[0].aborted, false, 'the regions coming and going never stop it');
      im.images[0].load();
      assert.equal(pre.ready(`${X2}?v=k2`), true);
      assert.deepEqual(pre.warming(), []);
      assert.equal(prepareSubwayPaper({ loader: pre, dpr: 2 }).wait, false, 'drawn at once, no fade');
      const n = im.images.length;
      pre.warm(X2);
      assert.equal(im.images.length, n, 'known loaded: nothing fetched');
      // A failed fetch is tried again next time.
      pre.warm(X1);
      im.bySrc(`${X1}?v=k2`).fail();
      pre.warm(X1);
      assert.equal(im.images.filter((i) => i.src === `${X1}?v=k2`).length, 2);
      assert.equal(pre.warm(''), '');
    } finally {
      if (had) globalThis.groddleDataUrl = had;
      else delete globalThis.groddleDataUrl;
    }
  });

  it('game.js: when the Map opens (region, World and Subway views) and when its Subway button is hovered or focused', () => {
    const game = read('public/game.js');
    assert.match(game, /function warmSubwayPaper\(\) \{\n  return mapBgLoader\.warm\(subwayPaperFile\(\{ dpr: globalThis\.devicePixelRatio, fitScale: mapFitScale \}\)\);/);
    // After the fit, which picks the size: the region path and the other views.
    assert.match(game, /fitMapCanvas\(panel\);\n  if \(find\) showFoundStreet\(canvas, find, view\);\n  else if \(focus\) focusMapOn\(canvas, focus\);\n  warmSubwayPaper\(\);\n  \/\/ G663: [^\n]*\n  if \(!TOUCH_PHONE\) warmWorldCharts\(\);\n\}/);
    assert.match(game, /if \(which === 'world'\) mapBgLoader\.preload\(spot\.hubId\);\n  warmSubwayPaper\(\);\n  \/\/ G663: [^\n]*\n  if \(!TOUCH_PHONE\) warmWorldCharts\(\);\n\}/);
    assert.match(game, /closest\?\.\('\[data-map-view="subway"\]'\)\) warmSubwayPaper\(\);/);
    assert.match(game, /bar\.addEventListener\('pointerover', warmOn\);\n    bar\.addEventListener\('focusin', warmOn\);/);
    // The view draws the size this screen takes, and fades the paper in when it was not ready.
    assert.match(game, /const paper = prepareSubwayPaper\(\{ loader: mapBgLoader, dpr: globalThis\.devicePixelRatio, fitScale: mapFitScale \}\);\n    canvas\.innerHTML = renderSubwayMapSvg\(\{ direction: subwayMapDirection, here, paper \}\);/);
    const view = game.slice(game.indexOf('function showMapView('), game.indexOf('function mapZoomFor('));
    assert.ok(view.indexOf('watchMapBg(canvas, { loader: mapBgLoader });') > view.indexOf('renderSubwayMapSvg('));
    const css = read('public/style.css');
    assert.match(css, /\.subway-map-svg \.map-bg-soft\.is-waiting \{ opacity: 0; \}/);
    assert.match(css, /prefers-reduced-motion: reduce\) \{\n  \.subway-map-svg \.map-bg-soft \{ transition: none; \}/);
  });
});

describe('the World view\'s two charts are fetched ahead too, the pair this screen draws (2026-11-13)', () => {
  const X1 = [WORLD_MAP.locked, WORLD_MAP.unlocked];
  const X2 = [WORLD_MAP.lockedHi, WORLD_MAP.unlockedHi];

  it('the 760 x 460 pair on a 1x screen, the Retina pair on a Retina screen or a 1x Map drawn past 760 x 460', () => {
    assert.deepEqual(X2, ['assets/maps/art/world/world_map_locked@2x.webp', 'assets/maps/art/world/world_map_unlocked@2x.webp']);
    assert.deepEqual(worldChartFiles({ dpr: 1, fitScale: 1 }), X1);
    assert.deepEqual(worldChartFiles({ dpr: 1, fitScale: 0.8 }), X1);
    assert.deepEqual(worldChartFiles({ dpr: 1, fitScale: 1.3 }), X2, 'a 1x screen drawing the Map at 1.3x');
    assert.deepEqual(worldChartFiles({ dpr: 2 }), X2);
    assert.deepEqual(worldChartFiles({ dpr: 3, fitScale: 0.4 }), X2, 'a phone');
    assert.deepEqual(prepareWorldCharts({ dpr: 1, fitScale: 1 }), { locked: X1[0], unlocked: X1[1], lockedHi: X2[0], unlockedHi: X2[1] });
    assert.deepEqual(prepareWorldCharts({ dpr: 1, fitScale: 1.3 }), { locked: X2[0], unlocked: X2[1], lockedHi: X2[0], unlockedHi: X2[1] });
  });

  it('game.js: warmed when the Map opens and when its World button is hovered or focused; the view draws the prepared pair', () => {
    const game = read('public/game.js');
    assert.match(game, /function warmWorldCharts\(\) \{\n  return worldChartFiles\(\{ dpr: globalThis\.devicePixelRatio, fitScale: mapFitScale \}\)\.map\(\(f\) => mapBgLoader\.warm\(f\)\);/);
    assert.match(game, /closest\?\.\('\[data-map-view="world"\]'\)\) warmWorldCharts\(\);/);
    assert.match(game, /const charts = prepareWorldCharts\(\{ dpr: globalThis\.devicePixelRatio, fitScale: mapFitScale \}\);\n    canvas\.innerHTML = renderWorldMapSvg\(regions, \{ youHubId: spot\.hubId, charts \}\);/);
    // Both swaps take every Retina twin on the map (a region's painting, the Subway paper, both charts).
    assert.match(game, /for \(const soft of canvas\.querySelectorAll\('image\[data-hi\]'\)\) soft\.setAttribute\('href', soft\.dataset\.hi\);/);
    assert.match(read('public/js/map-zoom.js'), /for \(const soft of svg\.querySelectorAll\('image\[data-hi\]'\)\) soft\.setAttribute\('href', soft\.dataset\.hi\);/);
  });
});
