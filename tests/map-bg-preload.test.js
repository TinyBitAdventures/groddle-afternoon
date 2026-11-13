/**
 * MAPLOAD (Austin 2026-11-13): a region's map is ready when the World map opens it. Its painting
 * (js/hub-map-backgrounds.js) is fetched ahead of the click, at the size the Map draws on this screen
 * (js/map-bg-preload.js): when a region's card shows on the World view (a resting pointer, keyboard
 * focus, a phone's first tap), your own region when the World view opens, a station's region when its
 * menu opens.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUB_MAP_BACKGROUNDS } from '../public/js/hub-map-backgrounds.js?v=2b2d6468';
import { WORLD_MAP } from '../public/js/map-views-data.js?v=8e7d7094';
import { bindWorldMap } from '../public/js/map-views.js?v=67e2a94a';
import { buildHubMapView, renderHubMapSvg } from '../public/js/map-graph.js?v=dc070b88';
import {
  MAP_BG_HOVER_MS,
  MAP_BG_PRELOAD_CAP,
  createMapBgPreloader,
  mapBgFile,
  mapBgFiles,
  mapBgWantsHi,
  prepareMapBg,
} from '../public/js/map-bg-preload.js?v=fbd98bc7';

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
    assert.equal(prepareMapBg(bare, { dpr: 2 }).bgSoft, '');
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
    assert.match(game, /fitMapCanvas\(panel\);\n  \/\/ MAPLOAD: [^\n]*\n  if \(which === 'world'\) mapBgLoader\.preload\(spot\.hubId\);\n\}/, 'after the fit, which picks the size');
    assert.match(game, /openMapStreetMenu\(canvas, e, street, \{ here: st\.surfaceStreetTsid === currentStreetTsid \}\);\n[^\n]*\n        mapBgLoader\.preload\(st\.surfaceHubId\);/);
    // The files at the size the Map draws (fitMapCanvas keeps its scale), the map data warmed beside them.
    assert.match(game, /files: \(hubId\) => mapBgFiles\(hubId, \{ dpr: globalThis\.devicePixelRatio, fitScale: mapFitScale, mapIndex: mapIndexCache \}\)/);
    assert.match(game, /onPreload: \(hubId\) => loadHubMapData\(hubId\)\.catch\(\(\) => \{\}\)/);
    assert.match(game, /soft\.setAttribute\('href', soft\.dataset\.hi\);\n    mapFitScale = fit\.scale;/);
    // The region map is drawn from the same cache: prepared before it is drawn.
    const prep = game.indexOf('prepareMapBg(view, { dpr: globalThis.devicePixelRatio, fitScale: mapFitScale });');
    const drawn = game.indexOf('canvas.innerHTML = renderHubMapSvg(view);');
    assert.ok(prep > game.indexOf('async function openMap(') && drawn > prep, 'prepared, then drawn');
  });
});
