/**
 * MAPZOOM (ticket 76, Friendly: "maybe a zoomed in version where you can move it around to what you're
 * looking for"; Austin 2026-11-04, register G521): zoom and pan on the Map, in both skins. The client's
 * map was a fixed 760 x 460 with no zoom (HubMapDialog.as MAP_W / MAP_ACTUAL_W): the remake's own.
 *
 * - The math (js/map-zoom.js): a zoom about the pointer keeps the map point under it, the view never
 *   leaves the region's frame, 1x (fit) to 3x, a press that moves less than a few px is still a click.
 * - The wiring: game.js attaches it after each draw, keeps the view while the Map stays open on the same
 *   region, resets it on close, zooms in to a searched street and to the destination, and the world
 *   zoom's keys zoom the Map while it is open; the marks counter-scale in both skins' stylesheets.
 * - In Chrome (under the browser lock): a real hub drawn with the game's stylesheets, then the wheel, a
 *   drag that opens no street menu, a short click that does, and the buttons.
 *
 * Run: node --test tests/map-zoom.test.js
 */
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clampMapView,
  clampMapZoom,
  fitMapView,
  focusMapView,
  isMapDrag,
  MAP_DRAG_SLOP,
  MAP_FOCUS_ZOOM,
  MAP_ZOOM_MAX,
  mapInkScale,
  mapPointAt,
  mapViewBox,
  panMapBy,
  stepMapZoom,
  viewWithPointAt,
  wheelZoomFactor,
  zoomMapAt,
} from '../public/js/map-zoom.js?v=4c2ce0e3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const FRAME = [0, 0, 760, 460];
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

describe('MAPZOOM: the zoom math', () => {
  it('opens at fit: the whole frame, centred', () => {
    assert.deepEqual(fitMapView(FRAME), { zoom: 1, cx: 380, cy: 230 });
    assert.deepEqual(mapViewBox(FRAME, fitMapView(FRAME)), [0, 0, 760, 460]);
    assert.deepEqual(mapViewBox([-10, 4, 780, 470], fitMapView([-10, 4, 780, 470])), [-10, 4, 780, 470]);
  });

  it('zoom stays between fit and 3x', () => {
    assert.equal(MAP_ZOOM_MAX, 3);
    assert.equal(clampMapZoom(0.4), 1);
    assert.equal(clampMapZoom(9), 3);
    assert.equal(clampMapZoom('x'), 1);
    assert.equal(clampMapZoom(2.2), 2.2);
  });

  it('a zoom about the pointer keeps the map point under it', () => {
    for (const [px, py] of [[0.5, 0.5], [0.2, 0.7], [0.9, 0.1], [0.33, 0.33]]) {
      const before = mapPointAt(FRAME, fitMapView(FRAME), px, py);
      const v = zoomMapAt(FRAME, fitMapView(FRAME), 2, px, py);
      assert.equal(v.zoom, 2);
      const after = mapPointAt(FRAME, v, px, py);
      near(after.x, before.x);
      near(after.y, before.y);
      // Then on in from there, still about the same point.
      const v2 = zoomMapAt(FRAME, v, 3, px, py);
      const again = mapPointAt(FRAME, v2, px, py);
      near(again.x, before.x);
      near(again.y, before.y);
    }
    // Back out to fit lands on the whole frame, wherever the pointer is.
    assert.deepEqual(mapViewBox(FRAME, zoomMapAt(FRAME, { zoom: 3, cx: 100, cy: 80 }, 1, 0.9, 0.9)), FRAME);
  });

  it('the view never leaves the frame, however far it is pushed', () => {
    const corner = clampMapView(FRAME, { zoom: 2, cx: -500, cy: 9999 });
    assert.deepEqual(mapViewBox(FRAME, corner), [0, 230, 380, 230]);
    const other = clampMapView(FRAME, { zoom: 3, cx: 9999, cy: -9999 });
    const [x, y, w, h] = mapViewBox(FRAME, other);
    near(x + w, 760);
    near(y, 0);
    near(w, 760 / 3);
    near(h, 460 / 3);
    // At fit there is nowhere to go.
    assert.deepEqual(clampMapView(FRAME, { zoom: 1, cx: 0, cy: 0 }), fitMapView(FRAME));
    // An offset frame (one grown past the painting) clamps to itself.
    const off = [-20, -10, 800, 480];
    const [ox, oy] = mapViewBox(off, clampMapView(off, { zoom: 2, cx: -999, cy: -999 }));
    assert.deepEqual([ox, oy], [-20, -10]);
  });

  it('a drag pans by the map units under the pointer, and is clamped', () => {
    const v = { zoom: 2, cx: 380, cy: 230 };
    // The map is drawn 1140 x 690 px (1.5x): 100 px is 100 / 1140 of the 380-unit-wide view.
    const moved = panMapBy(FRAME, v, 100, -50, 1140, 690);
    near(moved.cx, 380 - (100 * 380) / 1140);
    near(moved.cy, 230 + (50 * 230) / 690);
    const far = panMapBy(FRAME, v, 99999, 99999, 1140, 690);
    assert.deepEqual(mapViewBox(FRAME, far).slice(0, 2), [0, 0]);
    // A drag keeps the map point it started on under the finger (viewWithPointAt), until the edge.
    const anchor = mapPointAt(FRAME, v, 0.5, 0.5);
    const held = viewWithPointAt(FRAME, 2, anchor.x, anchor.y, 0.6, 0.45);
    const p = mapPointAt(FRAME, held, 0.6, 0.45);
    near(p.x, anchor.x);
    near(p.y, anchor.y);
  });

  it('a press that barely moves is a click; past the slop it is a drag (a finger may wobble more)', () => {
    assert.deepEqual({ ...MAP_DRAG_SLOP }, { mouse: 4, pen: 6, touch: 10 });
    assert.equal(isMapDrag(0, 0), false);
    assert.equal(isMapDrag(3, 2), false, 'a 3.6 px wobble is still a click');
    assert.equal(isMapDrag(4, 2), true);
    assert.equal(isMapDrag(6, 5, 'touch'), false);
    assert.equal(isMapDrag(9, 6, 'touch'), true);
    assert.equal(isMapDrag(5, 0, 'pen'), false);
    assert.equal(isMapDrag(5, 0, 'unknown'), true, 'an unknown pointer counts as a mouse');
  });

  it('the wheel: a mouse notch about 1.2x, a trackpad pinch follows the fingers, never 2x at once', () => {
    near(wheelZoomFactor({ deltaY: -100 }), Math.exp(0.18));
    near(wheelZoomFactor({ deltaY: 100 }), Math.exp(-0.18));
    near(wheelZoomFactor({ deltaY: -10, ctrlKey: true }), Math.exp(0.1));
    near(wheelZoomFactor({ deltaY: -3, deltaMode: 1 }), Math.exp(48 * 0.0018));
    near(wheelZoomFactor({ deltaY: -9999 }), 2);
    near(wheelZoomFactor({ deltaY: 9999, ctrlKey: true }), 0.5);
    assert.equal(wheelZoomFactor({}), 1);
  });

  it('buttons and keys step 1.5x, land on the ends, and 0 is the whole region', () => {
    assert.equal(stepMapZoom(1, 'in'), 1.5);
    assert.equal(stepMapZoom(1.5, 'in'), 2.25);
    assert.equal(stepMapZoom(2.25, 'in'), 3);
    assert.equal(stepMapZoom(3, 'in'), 3);
    assert.equal(stepMapZoom(3, 'out'), 2);
    assert.equal(stepMapZoom(1.52, 'out'), 1);
    assert.equal(stepMapZoom(2.9, 'reset'), 1);
  });

  it('a found street or the destination: centred, zoomed to at least 2x', () => {
    assert.equal(MAP_FOCUS_ZOOM, 2);
    const v = focusMapView(FRAME, fitMapView(FRAME), 300, 200);
    assert.deepEqual(v, { zoom: 2, cx: 300, cy: 200 });
    assert.equal(focusMapView(FRAME, { zoom: 2.8, cx: 0, cy: 0 }, 300, 200).zoom, 2.8, 'closer already stays');
    // By the edge, as near the middle as the frame allows.
    assert.deepEqual(focusMapView(FRAME, fitMapView(FRAME), 10, 450), { zoom: 2, cx: 190, cy: 345 });
  });

  it('past 2x the names grow at half the rate, the GO buttons, star and icons past 1.25x, the lines past 1.5x', () => {
    assert.deepEqual(mapInkScale(1), { text: 1, mark: 1, line: 1 });
    assert.deepEqual(mapInkScale(1.25), { text: 1, mark: 1, line: 1 });
    near(mapInkScale(1.5).mark * 1.5, 1.375, 1e-9);
    assert.equal(mapInkScale(1.5).line, 1);
    near(mapInkScale(3).mark * 3, 2.125, 1e-9);
    near(mapInkScale(2).text, 1);
    near(mapInkScale(2).line, 1.75 / 2);
    near(mapInkScale(3).text * 3, 2.5, 1e-9);
    near(mapInkScale(3).line * 3, 2.25, 1e-9);
  });
});

describe('MAPZOOM: the wiring', () => {
  const game = read('public/game.js');
  const style = read('public/style.css');
  const classic = read('public/css/classic.css');
  const zoom = read('public/js/map-zoom.js');

  it('game.js attaches it after each draw, by region, and resets it when the Map closes', () => {
    assert.match(game, /import \{ createMapZoom \} from '\.\/js\/map-zoom\.js\?v=[0-9a-f]{8}';/);
    assert.match(game, /canvas\.style\.setProperty\('--map-aspect', `\$\{frame\[2\]\} \/ \$\{frame\[3\]\}`\);\n[^\n]*\n  mapZoomFor\(canvas\)\.attach\(canvas\.querySelector\('svg'\), targetHub\);/);
    assert.match(game, /mapPanelHubId = null;\n[^\n]*\n  mapZoom\?\.reset\(\);/);
    // fitMapCanvas sizes by the frame the region was drawn in, never a zoomed viewBox.
    assert.match(game, /const \[, , frameW, frameH\] = \(svgEl\?\.dataset\.frame \|\| svgEl\?\.getAttribute\('viewBox'\) \|\| ''\)\.split\(' '\)\.map\(Number\);/);
    assert.match(zoom, /const keep = key !== null && String\(nextKey\) === key && view;/);
    assert.match(zoom, /svg\.dataset\.frame = f\.join\(' '\);/);
  });

  it('a searched street and Show destination zoom in to it', () => {
    assert.match(game, /g\.classList\.add\('is-found'\);\n[^\n]*\n  focusMapOn\(canvas, tsid\);/);
    assert.match(game, /if \(find\) showFoundStreet\(canvas, find, view\);\n  else if \(focus\) focusMapOn\(canvas, focus\);/);
    assert.match(game, /openMap: \(hubId, opts\) => openMap\(hubId, opts\),/);
    assert.match(read('public/js/features/map-routes-feature.js'), /button\('Show destination', \(\) => engine\.openMap\?\.\(hubOf\(r\.destination\), \{ focus: r\.destination \}\)\);/);
  });

  it('= + - 0 zoom the Map while it is open; the world zoom keeps them everywhere else', () => {
    assert.match(game, /if \(e\.key === 'g' \|\| e\.key === 'G' \|\| isPlainKey\(e, 'm'\)\) closeMap\(\);\n[^\n]*\n      const mapZoomKey = zoomKeyAction\(e\);\n      if \(mapZoomKey && mapZoom\) \{\n        e\.preventDefault\(\);\n        keys\.delete\(e\.key\);\n        mapZoom\.step\(mapZoomKey\);\n      \}\n      return;/);
    // The world zoom's own branch is after the Map's early return, so it never runs with the Map open.
    assert.ok(game.indexOf('mapZoom.step(mapZoomKey)') < game.indexOf('stepWorldZoom(zoomKey);'));
  });

  it('a drag eats its click before any street, GO button or the route picker hears it', () => {
    assert.match(zoom, /doc\.addEventListener\('click', \(e\) => \{\n    if \(!suppressClick\) return;\n    suppressClick = false;\n    e\.stopImmediatePropagation\(\);/);
    assert.match(zoom, /if \(!isMapDrag\(e\.clientX - press\.x, e\.clientY - press\.y, press\.type\)\) return;/);
    // Safari's pinch (gesture events) and the iPad's touches are never counted twice.
    assert.match(zoom, /if \(safariPinch && e\.ctrlKey\) return;/);
    assert.match(zoom, /if \(pointers\.size >= 2\) return;/);
  });

  it('the marks counter-scale and the page never scrolls or zooms under the map (both skins)', () => {
    assert.match(style, /\.map-canvas \{ touch-action: none; user-select: none;/);
    assert.match(style, /\.map-seg\.travelable \{\n  stroke: var\(--c-yellow-91\);\n  stroke-width: calc\(7px \* var\(--map-line-k, 1\)\);/);
    assert.match(style, /\.map-label\.loaded \{\n[^}]*font-size: calc\(var\(--fs-xs\) \* var\(--map-text-k, 1\)\);/);
    assert.match(style, /\.hub-map-svg :is\(\.map-go-ring, \.map-you, \.map-icon > \*\) \{\n  transform-box: fill-box;\n  transform-origin: center;\n  transform: scale\(var\(--map-mark-k, 1\)\);/);
    // Ticket 81 (Safari): GO's word counter-scales by its font size about its anchor, never by a fill-box transform.
    const goText = style.match(/\n\.map-go-text \{[^}]*\}/)[0];
    assert.match(goText, /font-size: calc\(var\(--fs-xs\) \* var\(--map-mark-k, 1\)\);/);
    assert.doesNotMatch(goText, /transform/);
    assert.ok(![...style.matchAll(/^[^{}\n]*\.map-go-text[^{}\n]*\{[^}]*transform/gm)].length, 'no rule scales the word');
    assert.doesNotMatch(classic, /\.map-go-text[^{]*\{[^}]*(?:transform|font-size)/, 'Classic keeps the same word');
    assert.match(style, /\.hub-map-svg \.map-route-line \{ stroke-width: calc\(8px \* var\(--map-line-k, 1\)\); \}/);
    assert.match(style, /\.map-zoom-ctl \{\n  position: absolute;\n  right: var\(--sp-3\);\n  bottom: var\(--sp-3\);/);
    assert.match(classic, /#map-panel \.map-zoom-ctl > button \{ width: calc\(24 \* var\(--cu\)\);/);
    assert.match(classic, /#map-panel \.map-zoom-ctl > button > svg \{ width: calc\(12 \* var\(--cu\)\);/, 'over the skin\'s own .map-canvas svg size');
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

describe('MAPZOOM: wheel, drag, click and buttons on a real hub (Chrome)', { skip: !chromium && 'no playwright' }, () => {
  // The browser lock is waited for here, on its own budget: other browser tests in the same run (and
  // other lanes' Chrome) may hold it for minutes, and none of that counts against the test's steps.
  const LOCK_WAIT_MS = 30 * 60_000;
  let server = null;
  let chrome = null;
  beforeAll(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'map-zoom test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  afterAll(async () => {
    await chrome?.close();
    await server?.stop();
  });

  it('both skins', { timeout: 180_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const { browser } = chrome;
    const bad = [];
    for (const skin of ['modern', 'classic']) {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      const tab = await ctx.newPage();
      await tab.goto(`${base}/style.css`);
      await tab.setContent(`<!doctype html><html data-ui="${skin}"><head><link rel="stylesheet" href="/style.css">${skin === 'classic' ? '<link rel="stylesheet" href="/css/classic.css">' : ''}
<style>#game-root{position:relative;width:1000px;height:700px}#map-canvas{position:relative;width:912px;height:552px}</style></head>
<body><div id="game-root"><div id="map-panel"><div class="map-card map-hub"><div id="map-canvas" class="map-canvas"></div></div></div></div></body></html>`, { waitUntil: 'load' });
      const r = await tab.evaluate(async () => {
        const { buildHubMapView, renderHubMapSvg } = await import('/js/map-graph.js');
        const { createMapZoom } = await import('/js/map-zoom.js');
        const hub = await (await fetch('/assets/maps/hub-56-groddle-forest.json')).json();
        const streets = (await (await fetch('/assets/streets/index.json')).json()).streets;
        const canvas = document.getElementById('map-canvas');
        canvas.innerHTML = renderHubMapSvg(buildHubMapView({ ...hub, hubId: '56' }, '', streets));
        const clicks = [];
        canvas.querySelectorAll('.map-street.travelable').forEach((g) => g.addEventListener('click', () => clicks.push(g.dataset.tsid)));
        const z = createMapZoom(canvas);
        z.attach(canvas.querySelector('svg'), '56');
        window.__z = z;
        window.__clicks = clicks;
        const svg = canvas.querySelector('svg');
        const g = [...canvas.querySelectorAll('.map-street.travelable')].find((n) => {
          const b = n.querySelector('line.map-seg').getBoundingClientRect();
          const x = b.left + b.width / 2, y = b.top + b.height / 2;
          return x > 100 && x < 700 && y > 100 && y < 450 && document.elementFromPoint(x, y)?.closest('g.map-street') === n;
        });
        const b = g.querySelector('line.map-seg').getBoundingClientRect();
        return { vb: svg.getAttribute('viewBox'), x: b.left + b.width / 2, y: b.top + b.height / 2, ctl: canvas.querySelectorAll('.map-zoom-ctl button').length };
      });
      const vb = () => tab.evaluate(() => document.querySelector('#map-canvas svg').getAttribute('viewBox'));
      const zoomNow = () => tab.evaluate(() => window.__z.view().zoom);
      const clicks = () => tab.evaluate(() => window.__clicks.length);
      // Waits on a condition in the page (never a fixed sleep: a loaded machine is slow); false on timeout.
      const until = (fn, arg) => tab.waitForFunction(fn, arg, { timeout: 15_000 }).then(() => true, () => false);
      // The map at rest: the same viewBox over 8 frames running (a drag's glide runs about 0.6 s).
      const atRest = () => tab.evaluate(() => new Promise((done) => {
        const t0 = performance.now();
        let last = null;
        let same = 0;
        const tick = () => {
          const now = document.querySelector('#map-canvas svg').getAttribute('viewBox');
          same = now === last ? same + 1 : 0;
          last = now;
          if (same >= 8 || performance.now() - t0 > 15_000) done(same >= 8);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }));
      if (r.ctl !== 3) bad.push(`${skin}: ${r.ctl} buttons`);
      if (r.vb !== '0 0 760 460') bad.push(`${skin}: opens at ${r.vb}`);
      // A short click at fit reaches the street.
      await tab.mouse.click(r.x, r.y);
      if ((await clicks()) !== 1) bad.push(`${skin}: a click at fit`);
      // The wheel about the street: it stays under the pointer.
      await tab.mouse.move(r.x, r.y);
      await tab.mouse.wheel(0, -300);
      if (!(await until(() => window.__z.view().zoom > 1.5))) bad.push(`${skin}: the wheel did not zoom`);
      const still = await tab.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('g.map-street') != null, [r.x, r.y]);
      if (!still) bad.push(`${skin}: the street left the pointer`);
      // A drag from the street pans, and its click never reaches the street.
      const before = await vb();
      await tab.mouse.down();
      for (let i = 1; i <= 6; i++) await tab.mouse.move(r.x + i * 15, r.y + i * 8);
      await tab.mouse.up();
      if (!(await until((b) => document.querySelector('#map-canvas svg').getAttribute('viewBox') !== b, before))) bad.push(`${skin}: the drag did not pan`);
      if ((await clicks()) !== 1) bad.push(`${skin}: the drag clicked the street`);
      // The drag's glide carries the map on for a moment: a street picked while it moves is gone from
      // under the pointer by the press (the full suite's "wobbly click was lost", 2026-11-04).
      if (!(await atRest())) bad.push(`${skin}: the map never came to rest after the drag`);
      // A wobbly click (3 px) is a click.
      const s = await tab.evaluate(() => {
        for (const g of document.querySelectorAll('#map-canvas .map-street.travelable')) {
          const b = g.querySelector('line.map-seg').getBoundingClientRect();
          const x = b.left + b.width / 2, y = b.top + b.height / 2;
          if (x > 40 && x < 820 && y > 40 && y < 500 && document.elementFromPoint(x, y)?.closest('g.map-street') === g) return { x, y };
        }
        return null;
      });
      await tab.mouse.move(s.x, s.y);
      await tab.mouse.down();
      await tab.mouse.move(s.x + 2, s.y + 2);
      await tab.mouse.up();
      if (!(await until(() => window.__clicks.length === 2))) bad.push(`${skin}: a wobbly click was lost (${await clicks()} clicks)`);
      // The buttons: + to 3x (then it greys), Fit back to the whole region.
      for (let i = 0; i < 4; i++) await tab.click('#map-canvas .map-zoom-ctl [data-zoom="in"]', { force: true });
      if (!(await until(() => window.__z.view().zoom === 3))) bad.push(`${skin}: + reached ${await zoomNow()}`);
      if (!(await tab.isDisabled('#map-canvas .map-zoom-ctl [data-zoom="in"]'))) bad.push(`${skin}: + still on at 3x`);
      const ink = await tab.evaluate(() => getComputedStyle(document.querySelector('#map-canvas svg')).getPropertyValue('--map-text-k').trim());
      if (Math.abs(Number(ink) - 2.5 / 3) > 1e-3) bad.push(`${skin}: text scale ${ink}`);
      await tab.click('#map-canvas .map-zoom-ctl [data-zoom="fit"]');
      if (!(await until(() => document.querySelector('#map-canvas svg').getAttribute('viewBox') === '0 0 760 460'))) bad.push(`${skin}: Fit gave ${await vb()}`);
      await ctx.close();
    }
    assert.deepEqual(bad, []);
  });

  // Ticket 81 (Friendly, Safari): "while zooming/panning the GO text on the buttons moves around". The word
  // is measured here in Chrome (Safari is not run on this machine): its middle on its ring's, and its
  // size with the ring's, at fit and zoomed in, both skins.
  it('GO stays on its ring at every zoom (both skins)', { timeout: 120_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const bad = [];
    for (const skin of ['modern', 'classic']) {
      const ctx = await chrome.browser.newContext({ viewport: { width: 1000, height: 700 } });
      const tab = await ctx.newPage();
      await tab.goto(`${base}/style.css`);
      await tab.setContent(`<!doctype html><html data-ui="${skin}"><head><link rel="stylesheet" href="/style.css">${skin === 'classic' ? '<link rel="stylesheet" href="/css/classic.css">' : ''}
<style>#game-root{position:relative;width:1000px;height:700px}#map-canvas{position:relative;width:912px;height:552px}</style></head>
<body><div id="game-root"><div id="map-panel"><div class="map-card map-hub"><div id="map-canvas" class="map-canvas"></div></div></div></div></body></html>`, { waitUntil: 'load' });
      const rows = await tab.evaluate(async () => {
        const { buildHubMapView, renderHubMapSvg } = await import('/js/map-graph.js');
        const { createMapZoom } = await import('/js/map-zoom.js');
        const hub = await (await fetch('/assets/maps/hub-56-groddle-forest.json')).json();
        const streets = (await (await fetch('/assets/streets/index.json')).json()).streets;
        const canvas = document.getElementById('map-canvas');
        canvas.innerHTML = renderHubMapSvg(buildHubMapView({ ...hub, hubId: '56' }, '', streets));
        await document.fonts.ready;
        const z = createMapZoom(canvas);
        const svg = canvas.querySelector('svg');
        z.attach(svg, '56');
        const ring0 = svg.querySelector('g.map-hub-go circle.map-go-ring');
        const at = { x: Number(ring0.getAttribute('cx')), y: Number(ring0.getAttribute('cy')) };
        const out = [];
        for (const zoom of [1, 1.5, 2, 3]) {
          if (zoom > 1) z.focus(at.x, at.y, zoom, { animate: false });
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
          for (const g of svg.querySelectorAll('g.map-hub-go')) {
            const ring = g.querySelector('.map-go-ring').getBoundingClientRect();
            const word = g.querySelector('.map-go-text').getBoundingClientRect();
            if (!ring.width || !word.width) continue;
            out.push({
              zoom: Math.round(z.view().zoom * 100) / 100,
              hub: g.dataset.hub,
              // The word's middle from the ring's, in ring sizes.
              dx: ((word.left + word.width / 2) - (ring.left + ring.width / 2)) / ring.height,
              dy: ((word.top + word.height / 2) - (ring.top + ring.height / 2)) / ring.height,
              size: word.height / ring.height,
              ring: ring.width,
            });
          }
        }
        return out;
      });
      const zooms = [...new Set(rows.map((r) => r.zoom))];
      if (zooms.length < 4) bad.push(`${skin}: zoomed to ${zooms.join(', ')}`);
      const spread = (key) => Math.max(...rows.map((r) => r[key])) - Math.min(...rows.map((r) => r[key]));
      for (const r of rows) {
        // On the ring's middle (its box takes in the line height and the small nudge down), at every zoom.
        if (Math.abs(r.dx) > 0.03 || Math.abs(r.dy) > 0.06) bad.push(`${skin} ${r.zoom}x hub ${r.hub}: GO off by ${r.dx.toFixed(3)}, ${r.dy.toFixed(3)} of the ring`);
      }
      // It never moves against its ring as the map zooms, and grows and shrinks with it.
      if (spread('dx') > 0.01 || spread('dy') > 0.01) bad.push(`${skin}: GO moved against its ring by ${spread('dx').toFixed(3)}, ${spread('dy').toFixed(3)}`);
      if (spread('size') > 0.03) bad.push(`${skin}: GO's size against its ring ran ${Math.min(...rows.map((r) => r.size)).toFixed(3)} to ${Math.max(...rows.map((r) => r.size)).toFixed(3)}`);
      await ctx.close();
    }
    assert.deepEqual(bad, []);
  });
});

describe('MAPZOOM: the hold-? sheet says so', () => {
  it('a Map Zoom row beside Show Map', async () => {
    const { hotkeySections, hotkeyText } = await import('../public/js/client-hotkeys.js?v=1d3b39fe');
    const rows = hotkeySections().find((s) => s.title === 'Interface').rows;
    const at = rows.findIndex(([label]) => label === 'Show Map');
    assert.equal(rows[at + 1][0], 'Map Zoom');
    assert.equal(hotkeyText(rows[at + 1][1]), '= or - or 0');
    assert.match(rows[at + 1][2], /While the Map is open/);
  });
});

describe('MAPZOOM: the buttons take the clearest corner', () => {
  it('a GO button in the bottom right sends them to the bottom left; a tie keeps the bottom right', async () => {
    const { pickMapZoomCorner, MAP_ZOOM_CORNERS } = await import('../public/js/map-zoom.js?v=4c2ce0e3');
    assert.deepEqual([...MAP_ZOOM_CORNERS], ['br', 'bl', 'tr', 'tl']);
    const box = [0, 0, 800, 480];
    const size = { w: 28, h: 86, m: 8 };
    assert.deepEqual(pickMapZoomCorner(box, size, []), { corner: 'br', row: false, cost: 0 });
    const goBR = { x0: 760, y0: 420, x1: 800, y1: 460, weight: 10 };
    assert.equal(pickMapZoomCorner(box, size, [goBR]).corner, 'bl');
    // A ring that ends where the buttons start: clear without room, under them with 4 px of it.
    const touching = { x0: 730, y0: 400, x1: 764, y1: 430, weight: 10 };
    assert.equal(pickMapZoomCorner(box, size, [touching]).corner, 'br');
    assert.equal(pickMapZoomCorner(box, size, [touching], 4).corner, 'bl');
    const nameBL = { x0: 0, y0: 400, x1: 60, y1: 412, weight: 3 };
    assert.equal(pickMapZoomCorner(box, size, [goBR, nameBL]).corner, 'tr');
    // Every corner busy stacked: in a row along an edge (Muufo, a GO button in each corner).
    const goTR = { x0: 770, y0: 10, x1: 798, y1: 40, weight: 10 };
    const goTL = { x0: 5, y0: 10, x1: 30, y1: 40, weight: 10 };
    const goBL = { x0: 2, y0: 380, x1: 34, y1: 412, weight: 10 };
    assert.deepEqual(pickMapZoomCorner(box, size, [goBR, goBL, goTR, goTL]), { corner: 'bl', row: true, cost: 0 });
    // Busy every way: the least covered (a name beats a GO button).
    const all = [0, 400, 800].flatMap((x) => [0, 240, 480].map((y) => ({ x0: x - 100, y0: y - 100, x1: x + 100, y1: y + 100, weight: 10 })));
    assert.deepEqual(pickMapZoomCorner(box, size, [...all.slice(1), { x0: 0, y0: 0, x1: 120, y1: 120, weight: 3 }]), { corner: 'tl', row: false, cost: 3 });
  });

  it('game.js places them once the map has its size; both skins move them', () => {
    assert.match(read('public/game.js'), /mapZoom\?\.placeControls\(\);\n  fitMapExtras\(card\);\n  if \(!mapFitObserver\)/);
    assert.match(read('public/style.css'), /\.map-zoom-ctl\[data-corner\^="t"\] \{ top: var\(--sp-3\); bottom: auto; \}\n\.map-zoom-ctl\[data-corner\$="l"\] \{ left: var\(--sp-3\); right: auto; \}/);
    assert.match(read('public/css/classic.css'), /#map-panel \.map-zoom-ctl\[data-corner\$="l"\] \{ left: calc\(8 \* var\(--cu\)\); right: auto; \}/);
  });
});
