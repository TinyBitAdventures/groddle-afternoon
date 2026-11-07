/**
 * Ticket 21 (Friendly, Safari 26, 2026-11-03): "many streets are hidden still at the bottom, and some
 * GO buttons are as well, like bottom left inside Ilmenskie Caverns"; the Shortcuts and the destination
 * squeezed the map, the Shortcuts needed a scrollbar, and the region box's search was hard to notice.
 *
 * - Safari sized the map's height: 100% SVG (a percentage height in a flex item) by its width and the
 *   canvas clipped its bottom: at 1536 x 702 WebKit cut 321 street lines and 73 GO buttons over 53 of
 *   54 hubs. The drawing now fills the canvas absolutely and the canvas keeps the hub's shape
 *   (aspect-ratio from the frame), giving way on a short window, so the whole hub always scales in.
 * - The frame (viewBox) takes in every street line and name as well as the GO buttons.
 * - The Shortcuts line and the route card share one row; the Shortcuts open over the map at full size.
 * - The region box is a search box: a magnifier, and focused it empties to "Search a region or street"
 *   (the client's LocationSearchMap: its magnifier and "Search", HubMapDialog.as 197-202).
 *
 * Ticket 76 (Friendly, Safari 26.5, 1440 x 707): the map "is much better now, but still hard for
 * readability as its shrunken down a bit". MAPSIZE (Austin 2026-11-04): the Map grows with the window
 * (map-graph.js mapFitSize, game.js fitMapCanvas), at least the client's 760 x 460 where there is
 * room, up to 1.5 times it. Zoom and pan inside the Map are not part of it.
 *
 * MAPFRAME (Austin 2026-11-04, a route set at 1000 x 636): a band of plain colour ran above the painting
 * and beside it, and a route card wrapped to three lines over the map. The frame is now the painting
 * (GO buttons step in, their signs slide along, names keep inside), the card takes the map's width, the
 * route is one line beside the Shortcuts and the region's line shares one quiet row with the keys.
 *
 * Run: node --test tests/map-fit.test.js
 */
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildHubMapView,
  goLabelY,
  goSignX,
  hubMapFrame,
  labelQuad,
  layoutHubMapMarks,
  listHubsFromIndex,
  MAP_FIT_MAX_SCALE,
  mapFitSize,
  quadBox,
  renderHubMapSvg,
} from '../public/js/map-graph.js?v=6319325d';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('ticket 21: the Map always shows the whole hub', () => {
  it('every public hub frame takes in every street line, street name and GO button', () => {
    const idx = JSON.parse(read('public/assets/maps/index.json'));
    const streets = JSON.parse(read('public/assets/streets/index.json')).streets;
    const hubs = listHubsFromIndex(idx);
    assert.ok(hubs.length >= 50, `${hubs.length} hubs`);
    const cut = [];
    for (const h of hubs) {
      const data = { ...JSON.parse(read(join('public', idx.hubs[h.hubId].file))), hubId: h.hubId };
      const view = buildHubMapView(data, '', streets);
      const [fx, fy, fw, fh] = renderHubMapSvg(view).match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
      const out = (x0, y0, x1, y1) => x0 < fx || y0 < fy || x1 > fx + fw || y1 > fy + fh;
      for (const s of view.streets) {
        if (!s.hidden && out(Math.min(s.x1, s.x2) - 2.5, Math.min(s.y1, s.y2) - 2.5, Math.max(s.x1, s.x2) + 2.5, Math.max(s.y1, s.y2) + 2.5)) cut.push(`${view.hubName}: line ${s.name}`);
      }
      for (const l of layoutHubMapMarks(view).labels) {
        const b = quadBox(labelQuad(l.x, l.y, l.w, l.h, l.rot));
        if (out(b.x0, b.y0, b.x1, b.y1)) cut.push(`${view.hubName}: name ${l.name}`);
      }
      for (const g of view.hubs) if (out(g.x - 22, g.y - 22, g.x + 22, g.y + 22)) cut.push(`${view.hubName}: GO ${g.label}`);
    }
    assert.deepEqual(cut, []);
  });

  it('hubMapFrame grows for extra boxes and keeps the painted map otherwise', () => {
    assert.deepEqual(hubMapFrame([], 760, 460), [0, 0, 760, 460]);
    assert.deepEqual(hubMapFrame([], 760, 460, [{ x0: 10, y0: -30, x1: 40, y1: 5 }]), [0, -32, 760, 492]);
  });

  it('the drawing fills the canvas box, which keeps the frame shape and gives way (both skins)', () => {
    const css = read('public/style.css');
    assert.match(css, /\.map-canvas > \.hub-map-svg \{\n  position: absolute;\n  inset: 0;\n\}/);
    assert.match(css, /\.map-card\.map-hub > \.map-canvas \{\n  flex: 0 1 auto;\n  height: auto;\n  aspect-ratio: var\(--map-aspect, 760 \/ 460\);\n  min-height: min\(200px, 34vh\);\n  max-height: none;/);
    const classic = read('public/css/classic.css');
    assert.match(classic, /#map-panel \.map-canvas \{ flex: 0 1 auto; height: auto; aspect-ratio: var\(--map-aspect, 760 \/ 460\);/);
    const game = read('public/game.js');
    assert.match(game, /canvas\.style\.setProperty\('--map-aspect', `\$\{frame\[2\]\} \/ \$\{frame\[3\]\}`\)/);
  });

  it('the Shortcuts and the route card share one row, and the Shortcuts open over the map', () => {
    const game = read('public/js/map-extras.js');
    assert.match(game, /bar\.className = 'map-bar';/);
    assert.match(game, /bar\.append\(details\);\n  if \(route\) bar\.append\(route\);/);
    assert.match(game, /if \(open && !open\.contains\(e\.target\)\) open\.open = false;/, 'a click elsewhere on the Map shuts them');
    const css = read('public/style.css');
    assert.match(css, /\.map-extras-grid \{\n  position: absolute;\n  top: calc\(100% \+ 4px\);/);
    assert.doesNotMatch(css, /\.map-extras-grid \{[^}]*max-height: 150px/, 'no small scrolling box');
  });

  it('the region box is a search box: a magnifier, and empty with its placeholder while focused', () => {
    const game = read('public/game.js');
    assert.match(game, /createCombobox\(hubSelect, \{ placeholder: 'Search a region or street', label: 'Regions and streets', search: true \}\)/);
    const combo = read('public/js/combobox.js');
    assert.match(combo, /if \(opts\.search && !free\) input\.value = '';/);
    assert.match(combo, /mag\.className = 'combo-mag';/);
    assert.match(combo, /if \(restore && !free\) input\.value = source\.currentLabel\(\);/, 'leaving it shows the region again');
    assert.match(read('public/style.css'), /\.combo-search \.combo-input \{ padding-left: 1\.95rem; \}/);
  });

  it('ticket 76: it empties for a search on every press or typed letter, not only a fresh focus', () => {
    const combo = read('public/js/combobox.js');
    // Focused with its list shut (the chevron shut it and put the region back), a click sends no focus.
    assert.match(combo, /const emptyForSearch = \(\) => \{\n\s+if \(!opts\.search \|\| free \|\| !list\.hidden \|\| document\.activeElement !== input\) return false;\n\s+input\.value = '';/);
    assert.match(combo, /input\.addEventListener\('pointerdown', \(\) => \{ if \(emptyForSearch\(\)\) open\(''\); \}\);/);
    assert.match(combo, /if \(e\.key\.length === 1 && !e\.metaKey && !e\.ctrlKey && !e\.altKey && input\.value === source\.currentLabel\(\)\) emptyForSearch\(\);/);
  });
});

describe('ticket 76: the Map grows with the window (MAPSIZE)', () => {
  // Measured in Chrome and WebKit (Modern, Groddle Meadow, MAPFRAME): the head, the Shortcuts and route
  // row and the line under the map take 130 px (106 compact, a little less air), the card's sides 34 px;
  // the map's floor is 180 px. Before MAPFRAME: 165 (114), and 247 with a route set. The room: under the top bar (50 px) and over the pack, left of the Social drawer
  // (316 px open, 60 px as the rail). Before, the card was 820 px wide (a 786 px canvas) and 88% tall.
  const MODERN = { chromeW: 34, chromeH: 130, compactChromeH: 106, minH: 180 };
  const WINDOWS = [
    { name: '1440x707 (Friendly)', availW: 1440 - 8 - 316, availH: 707 - 72 - 50, before: [786, 391] },
    { name: '1280x720', availW: 1280 - 8 - 60, availH: 720 - 72 - 50, before: [786, 403] },
    { name: '1920x1080', availW: 1920 - 8 - 316, availH: 1080 - 72 - 50, before: [786, 465] },
    { name: '1024x600', availW: 1024 - 8 - 60, availH: 600 - 72 - 50, before: [786, 297] },
  ];
  const frames = () => {
    const idx = JSON.parse(read('public/assets/maps/index.json'));
    const streets = JSON.parse(read('public/assets/streets/index.json')).streets;
    return listHubsFromIndex(idx).map((h) => {
      const data = { ...JSON.parse(read(join('public', idx.hubs[h.hubId].file))), hubId: h.hubId };
      const [, , w, hh] = renderHubMapSvg(buildHubMapView(data, '', streets)).match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
      return { name: h.hubName, w, h: hh };
    });
  };

  it('the sizing rule: the room less the window, the frame shape, 1 to 1.5 times the client', () => {
    assert.equal(MAP_FIT_MAX_SCALE, 1.5);
    assert.equal(mapFitSize({ availW: 0, availH: 500, frameW: 760, frameH: 460 }), null);
    assert.equal(mapFitSize({ availW: 900, availH: 500, frameW: 0, frameH: 460 }), null);
    // Room to spare: the full layout, capped at 1.5.
    assert.deepEqual(mapFitSize({ availW: 2400, availH: 1600, chromeW: 34, chromeH: 165, compactChromeH: 114, frameW: 760, frameH: 460 }), { w: 1140, h: 690, scale: 1.5, compact: false });
    // Just room for the client's size with the key hint: it stays.
    const full = mapFitSize({ availW: 1200, availH: 165 + 460, chromeW: 34, chromeH: 165, compactChromeH: 114, frameW: 760, frameH: 460 });
    assert.deepEqual([full.w, full.h, full.compact], [760, 460, false]);
    // Short of it: the hint folds away and the map takes its room.
    const short = mapFitSize({ availW: 1200, availH: 600, chromeW: 34, chromeH: 165, compactChromeH: 114, frameW: 760, frameH: 460 });
    assert.equal(short.compact, true);
    assert.equal(short.h, 600 - 114);
    // Width-bound: the width less the sides, the shape kept.
    const narrow = mapFitSize({ availW: 600, availH: 900, chromeW: 34, chromeH: 165, frameW: 760, frameH: 460 });
    assert.deepEqual([narrow.w, narrow.h], [566, Math.floor(460 * (566 / 760))]);
    // Never under the floor.
    assert.equal(mapFitSize({ availW: 600, availH: 250, chromeW: 34, chromeH: 165, compactChromeH: 114, frameW: 760, frameH: 460, minH: 180 }).h, 180);
  });

  it('at 1440 x 707 every region draws at least the client size (Groddle Meadow too, its frame no longer 492 tall)', () => {
    const win = WINDOWS[0];
    const small = [];
    for (const f of frames()) {
      const fit = mapFitSize({ ...MODERN, availW: win.availW, availH: win.availH, frameW: f.w, frameH: f.h });
      if (fit.scale < 1) small.push(`${f.name} ${fit.scale.toFixed(2)}`);
      else assert.ok(fit.w >= 760 && fit.h >= 460, `${f.name} ${fit.w}x${fit.h}`);
    }
    assert.deepEqual(small, []);
  });

  it('every region, at every window tried, is larger than before and fits the room', () => {
    for (const win of WINDOWS) {
      for (const f of frames()) {
        const fit = mapFitSize({ ...MODERN, availW: win.availW, availH: win.availH, frameW: f.w, frameH: f.h });
        const before = Math.min(win.before[0] / f.w, win.before[1] / f.h);
        assert.ok(fit.scale > before, `${win.name} ${f.name}: ${fit.scale} vs ${before}`);
        assert.ok(fit.w + MODERN.chromeW <= win.availW, `${win.name} ${f.name} width`);
        assert.ok(fit.h + (fit.compact ? MODERN.compactChromeH : MODERN.chromeH) <= win.availH, `${win.name} ${f.name} height`);
        assert.ok(fit.scale <= MAP_FIT_MAX_SCALE);
      }
    }
    // 1920 x 1080 reaches the cap; 1024 x 600 folds the hint.
    const gf = { frameW: 760, frameH: 460 };
    assert.equal(mapFitSize({ ...MODERN, ...WINDOWS[2], ...gf }).scale, 1.5);
    assert.equal(mapFitSize({ ...MODERN, ...WINDOWS[3], ...gf }).compact, true);
  });

  it('the game measures the room and the window and sizes the map on open, resize and any change of size', () => {
    const game = read('public/game.js');
    assert.match(game, /arrangeMapCards\(panel\);\n  panel\.hidden = false;\n  fitMapCanvas\(panel\);/);
    assert.match(game, /const availW = panel\.clientWidth - px\(ps\.paddingLeft\) - px\(ps\.paddingRight\);/);
    assert.match(game, /const chromeH = card\.offsetHeight - canvas\.offsetHeight;/);
    assert.match(game, /const next = mapFitSize\(\{ availW, availH, chromeW, chromeH, compactChromeH, frameW, frameH, minH \}\);/);
    // MAPFRAME: measured across the whole room first, then again at the map's own width until it holds.
    assert.match(game, /let trialW = availW;\n    for \(let pass = 0; pass < 5; pass\+\+\) \{\n      card\.style\.setProperty\('--map-card-w', `\$\{Math\.floor\(trialW\)\}px`\);/);
    assert.match(game, /const cardW = fit\.w \+ chromeW;\n      card\.style\.setProperty\('--map-card-w', `\$\{cardW\}px`\);\n      card\.style\.setProperty\('--map-fit-w', `\$\{fit\.w\}px`\);/);
    assert.match(game, /if \(Math\.abs\(cardW - trialW\) < 1\) break;/);
    assert.match(game, /card\.style\.setProperty\('--map-fit-h', `\$\{fit\.h\}px`\);/);
    assert.match(game, /mapFitObserver\.observe\(panel\);\n\s+mapFitObserver\.observe\(card\);/);
    assert.match(game, /globalThis\.addEventListener\?\.\('resize', again\);/);
    // A 1x screen takes the Retina painting once the map draws past 760 x 460 (no blurry art).
    assert.match(game, /if \(soft && fit\.scale \* \(Number\(globalThis\.devicePixelRatio\) \|\| 1\) > 1\.01\) soft\.setAttribute\('href', soft\.dataset\.hi\);/);
    assert.match(read('public/js/map-graph.js'), /data-hi="\$\{escapeXml\(keyedArt\(view\.bgSoftHi\)\)\}"/);
  });

  it('the room is between the top bar and the pack, inside the side sheets and the Social drawer (both skins)', () => {
    const css = read('public/style.css');
    assert.match(css, /\[data-ui="modern"\] #map-panel\.ui-sheet-center \{\n  padding: calc\(var\(--hud-h\) \+ 6px\) max\(var\(--hud-inset\), var\(--inset-r, 0px\)\) 0 max\(var\(--hud-inset\), var\(--inset-l, 0px\)\);/);
    assert.match(css, /\.map-card\.map-hub\[data-map-fit\] \{\n[^}]*width: min\(max\(var\(--map-card-min\), var\(--map-card-w, 820px\)\), 100%\);/, 'the map\'s own width');
    assert.match(css, /\.map-card\.map-hub \{\n  --map-card-min: 520px;/);
    assert.match(css, /\.map-card\.map-hub\[data-map-fit="on"\] > \.map-canvas \{\n  flex: 0 1 auto;\n  align-self: center;\n  width: var\(--map-fit-w, 100%\);\n  height: var\(--map-fit-h\);/);
    assert.match(css, /\.map-card\.map-hub\[data-map-compact="1"\] > \.map-hint \{ display: none; \}/);
    const classic = read('public/css/classic.css');
    assert.match(classic, /#map-panel:not\(\[hidden\]\) \{ padding: calc\(10 \* var\(--cu\)\) calc\(20 \* var\(--cu\)\); grid-template: minmax\(0, 1fr\) \/ minmax\(0, 1fr\); \}/);
    assert.match(classic, /#map-panel > \.map-card\[data-map-fit\] \{ width: min\(max\(calc\(764 \* var\(--cu\)\), var\(--map-card-w, 0px\)\), 100%\); \}/);
    assert.match(classic, /#map-panel > \.map-card\[data-map-fit="on"\] > \.map-canvas \{ flex: 0 1 auto; align-self: center; width: var\(--map-fit-w, 100%\); height: var\(--map-fit-h\);/);
  });
});

describe('MAPFRAME: the map is its painting, and the window around it is two short rows and one line', () => {
  const regions = () => {
    const idx = JSON.parse(read('public/assets/maps/index.json'));
    const streets = JSON.parse(read('public/assets/streets/index.json')).streets;
    return listHubsFromIndex(idx).map((h) => buildHubMapView({ ...JSON.parse(read(join('public', idx.hubs[h.hubId].file))), hubId: h.hubId }, '', streets));
  };

  it('every public region\'s frame is exactly its painting: no plain band above, below or beside it', () => {
    const grown = [];
    for (const view of regions()) {
      const vb = renderHubMapSvg(view).match(/viewBox="([^"]+)"/)[1];
      if (vb !== `0 0 ${view.mapW || 760} ${view.mapH || 460}`) grown.push(`${view.hubName} ${vb}`);
    }
    assert.deepEqual(grown, []);
  });

  it('a GO button at the edge steps in, its sign slides along, and a name keeps inside', () => {
    const view = buildHubMapView({ hubId: '1', streets: [], hubs: [{ hub_id: 2, label: 'To: Groddle Meadow', x: 10, y: 455 }, { hub_id: 3, label: 'To: Ix', x: 400, y: 200 }] }, '', {});
    assert.deepEqual([view.hubs[0].x, view.hubs[0].y], [26, 434], 'the ring is whole inside the painting');
    assert.deepEqual([view.hubs[1].x, view.hubs[1].y], [400, 200], 'one away from the edge stays put');
    // "To: Groddle Meadow" is about 112 units wide: centred under x 26 it would start at -30.
    assert.equal(goSignX(view.hubs[0], 760), 18 * 2.9 + 4 + 2);
    assert.equal(goSignX(view.hubs[1], 760), 400);
    assert.equal(goSignX({ x: 740, label: 'To: Ix' }, 760), 760 - (6 * 2.9 + 4) - 2);
    assert.equal(goLabelY({ y: 422 }, 460), 392, 'a sign that would touch the bottom goes over its button');
    const svg = renderHubMapSvg(view);
    assert.match(svg, /<text class="map-go-sub" x="58.2" y="404" text-anchor="middle">To: Groddle Meadow<\/text>/);
    assert.match(svg, /viewBox="0 0 760 460"/);
    // The name layout treats the painting's edge as worse than any overlap (Rushlane Steading's name
    // ran 30 units over Groddle Meadow's top).
    assert.match(read('public/js/map-graph.js'), /if \(box\.x0 < 2 \|\| box\.y0 < 2 \|\| box\.x1 > mapW - 2 \|\| box\.y1 > mapH - 2\) score \+= 5000;/);
  });

  it('the route is one line beside the Shortcuts, its whole text in its tip, and a click opens it out', () => {
    const css = read('public/style.css');
    assert.match(css, /\.map-bar > \.map-extras:not\(:only-child\) \{ flex: 1 1 6\.5rem; min-width: 6\.5rem; max-width: 36%; \}/);
    assert.match(css, /\.map-bar > \[data-map-route\] \{ flex: 3 1 0; min-width: max-content;/);
    assert.match(css, /\.map-bar > \[data-map-route\]:not\(:has\(> \.map-route-rooms\)\) \{ flex-wrap: nowrap; \}/, 'the room picker still has its own line');
    assert.match(css, /\.map-bar > \[data-map-route\] \.map-route-body \{ width: 0; min-width: 5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; \}/);
    // #104: opened, the line takes its own row under the buttons and scrolls past four lines.
    assert.match(css, /\.map-bar > \[data-map-route\]:has\(> \.map-route-body\[data-open\]\) \{ flex-wrap: wrap; \}/);
    assert.match(css, /\.map-bar > \[data-map-route\] \.map-route-body\[data-open\] \{ order: 2; flex: 1 0 100%; white-space: normal; max-height: 6\.6em; overflow-y: auto; \}/);
    assert.match(css, /\.map-bar > \[data-map-route\] \.map-route-body br \{ display: none; \}/);
    const feature = read('public/js/features/map-routes-feature.js');
    assert.match(feature, /bodyEl\.title = \[head, \.\.\.lines\]\.filter\(Boolean\)\.join\('\\n'\);/);
    assert.match(feature, /routeLineOpen = !routeLineOpen;/);
    assert.match(feature, /bodyEl\.setAttribute\('aria-expanded', String\(routeLineOpen\)\);/);
  });

  it('Modern: the region\'s line goes under the map and shares its row with the keys', () => {
    const css = read('public/style.css');
    assert.match(css, /\[data-ui="modern"\] #map-panel \.map-card\.map-hub > \.map-sub \{\n  order: 1;[^}]*white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n\}/);
    assert.match(css, /\[data-ui="modern"\] #map-panel \.map-card\.map-hub\[data-map-compact="1"\] > \.map-hint \{\n  position: absolute;\n  right: var\(--space-4\);\n  bottom: 0;\n  display: block;/);
    assert.match(read('public/game.js'), /sub\.title = sub\.textContent;/);
    // Classic keeps its head, its region line under it and the client's 764 wide window.
    assert.doesNotMatch(read('public/css/classic.css'), /\.map-sub \{[^}]*order:/);
  });
});

/**
 * SHORTCUTS (Austin 2026-11-04, Groddle Meadow at 1000 x 700, a route set, Teleportation II with no
 * points): each point row was three columns (its words, "Set this location as Teleport Point",
 * Teleport), which squeezed the words to 31 px, one word a line and broken mid-word; the cards sat in
 * rows as tall as the Teleportation card, leaving a hole under the home card, and the last row ran past
 * the Map's bottom edge, cut off (the box was capped at 72% of the window, not at the Map).
 * Laid out for real in Chrome (under the browser lock): the game's stylesheets, the Teleportation
 * feature's own card and js/map-extras.js, in both skins.
 */
let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

describe('SHORTCUTS: the Map\'s Shortcuts pack, never cut a card, and Teleportation rows read (Chrome)', { skip: !chromium && 'no playwright' }, () => {
  const card = (cls, title, body) => `<section class="${cls}"><div><strong>${title}</strong><span>${body}</span></div></section>`;
  const pills = (names) => names.map((n) => `<button type="button" class="content-action-btn">${n}</button>`).join('');
  const page = (skin, canvasH) => `<!doctype html><html data-ui="${skin}"><head>
<link rel="stylesheet" href="/style.css">${skin === 'classic' ? '<link rel="stylesheet" href="/css/classic.css">' : ''}
<style>#game-root{position:relative;width:1000px;height:700px}#map-panel{position:absolute;inset:0}#map-panel .map-canvas{height:${canvasH}px!important;aspect-ratio:auto!important;flex:none!important}</style></head>
<body><div id="game-root"><div id="map-panel" class="map-panel ui-sheet ui-sheet-center"><div class="map-card map-hub ui-sheet-card">
<div class="map-head ui-sheet-head"><h2 class="ui-sheet-title">Groddle Meadow</h2></div>
<p class="map-sub">40 streets · 40 playable here</p>
<section class="map-home-card"><div><strong>Your Firebog home</strong><span>Your mailbox is quiet · remembers where to return</span></div><button type="button" class="content-action-btn">Teleport home</button></section>
<section class="map-feature-card" data-map-title="Puzzle streets"><strong>Puzzle streets</strong><div>${pills(['Griinolyza', 'Amberlyza', 'Purplysa', 'Blooian', 'Fernucopia', 'Piryan', 'Orangian', 'Piano Party'])}</div></section>
<section class="map-feature-card" data-map-title="Lost puzzle levels"><strong>Lost puzzle levels</strong><div>${pills(['Constellation', 'Beam Me Down (ticket: 0)'])}</div></section>
${card('map-feature-card', 'Street projects here', 'Build Twickenrill Grotto (open) · Build Twickenrill Grotto (open)')}
<div class="map-route-card" data-map-route><div class="map-route-body"><b>To: Forest Community Machine Room</b></div><div class="map-route-actions"><button type="button">Clear route</button></div></div>
<div id="map-canvas" class="map-canvas"></div>
<p class="map-hint"><kbd>M</kbd> map</p>
</div></div></div></body></html>`;

  async function layout(browser, base, { skin, rank, points = 0, canvasH = 340, confirm = false }) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const tab = await ctx.newPage();
    await tab.goto(`${base}/style.css`);
    await tab.setContent(page(skin, canvasH), { waitUntil: 'load' });
    return tab.evaluate(async ({ rank, points, confirm }) => {
      const { arrangeMapCards } = await import('/js/map-extras.js');
      const { teleportationFeature } = await import('/js/features/teleportation-feature.js');
      const learnedSkills = ['meditativearts_1', ...Array.from({ length: rank }, (_, i) => `teleportation_${i + 1}`)];
      const engine = {
        learnedSkills, streetTsid: 'GLI334UG2UD1IKQ', street: { label: 'Waylon Way', hubId: '58', hubName: 'Groddle Meadow' }, player: { x: 0, y: 0 },
        pc: { energy: 100 }, homeContext: () => ({ inHome: false }), transientInstance: () => null, param: () => null, setData: () => {},
      };
      const targets = {};
      for (let id = 1; id <= points; id++) targets[id] = { tsid: 'GCR101UN0NJ1QPQ', label: 'Middle Arbor', hubName: 'Groddle Meadow' };
      teleportationFeature.restore({ targets });
      const panel = document.getElementById('map-panel');
      const mapCard = panel.querySelector('.map-card');
      for (const el of teleportationFeature.mapCards(engine)) {
        el.classList.add('map-feature-card');
        mapCard.insertBefore(el, panel.querySelector('.map-canvas'));
      }
      arrangeMapCards(panel);
      panel.querySelector('.map-extras').open = true;
      const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
      await document.fonts.ready;
      await settle();
      if (confirm) { panel.querySelector('[data-teleport-set="1"]').click(); await settle(); }
      const grid = panel.querySelector('.map-extras-grid');
      const g = grid.getBoundingClientRect();
      const cardBottom = mapCard.getBoundingClientRect().bottom;
      const cards = [...grid.children].map((el) => { const b = el.getBoundingClientRect(); return { t: el.querySelector('strong')?.textContent, top: b.top, bottom: b.bottom, left: b.left, right: b.right }; });
      const rows = [...grid.querySelectorAll('.tp-map-card li')].filter((li) => li.offsetParent).map((li) => {
        const info = li.querySelector(':scope > div').getBoundingClientRect();
        const span = li.querySelector('span');
        const lines = Math.round(span.getBoundingClientRect().height / parseFloat(getComputedStyle(span).lineHeight));
        const btns = [...li.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
        return { infoW: info.width, lines, wrap: getComputedStyle(span).overflowWrap, buttonsClear: btns.every((b) => b.top >= info.bottom - 1 || b.left >= info.right - 1), sameLine: Math.abs(btns[0].top + btns[0].height / 2 - (btns[1].top + btns[1].height / 2)) < 2 };
      });
      const scrolls = grid.scrollHeight > grid.clientHeight + 1;
      const moreBefore = grid.dataset.more;
      const dbg = `${grid.scrollHeight}/${grid.clientHeight}/${getComputedStyle(grid).maxHeight}`;
      grid.scrollTop = grid.scrollHeight;
      grid.dispatchEvent(new Event('scroll'));
      const lastVisible = Math.max(...[...grid.children].map((el) => el.getBoundingClientRect().bottom)) <= grid.getBoundingClientRect().bottom + 1;
      return { dbg, gridBottom: g.bottom, gridTop: g.top, cardBottom, cards, rows, scrolls, moreBefore, moreAfter: grid.dataset.more, lastVisible, confirmShown: Boolean(panel.querySelector('[data-teleport-confirm]')) };
    }, { rank, points, confirm }).finally(() => ctx.close());
  }

  describe('in Chrome', () => {
    // The browser lock is waited for here, on its own budget: other browser tests in the same run (and
    // other lanes' Chrome) may hold it for minutes, and none of that counts against the test's steps.
    const LOCK_WAIT_MS = 30 * 60_000;
    let server = null;
    let chrome = null;
    beforeAll(async () => {
      const { openBrowser } = await import('../tools/qa/browser.mjs');
      const { startServer } = await import('../tools/qa/serve.mjs');
      chrome = await openBrowser({ label: 'map-fit shortcuts test', waitMs: LOCK_WAIT_MS });
      server = await startServer({ root: join(root, 'public') });
    }, { timeout: LOCK_WAIT_MS + 60_000 });
    afterAll(async () => {
      await chrome?.close();
      await server?.stop();
    });

    it('both skins, Teleportation I-III, 0 to 3 points and the question, a tall and a short Map', { timeout: 300_000 }, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const { browser } = chrome;
      const bad = [];
      for (const skin of ['modern', 'classic']) {
        for (const [rank, points, confirm, canvasH] of [[2, 0, false, 340], [2, 1, false, 340], [2, 2, false, 340], [2, 0, true, 340], [1, 0, false, 340], [3, 0, false, 340], [3, 0, false, 120], [2, 0, false, 60]]) {
          const r = await layout(browser, base, { skin, rank, points, confirm, canvasH });
          const key = `${skin} T${rank} ${points} points${confirm ? ' asking' : ''} map ${canvasH}`;
          if (r.gridBottom > r.cardBottom + 0.5) bad.push(`${key}: the box runs ${Math.round(r.gridBottom - r.cardBottom)} px past the Map`);
          if (!r.scrolls && r.cards.some((c) => c.bottom > r.gridBottom + 1)) bad.push(`${key}: a card is cut and the box does not scroll`);
          if (r.scrolls && (r.moreBefore !== '1' || r.moreAfter !== '0' || !r.lastVisible)) bad.push(`${key}: scrolls without its fade, or the last card never shows (${r.moreBefore}/${r.moreAfter}/${r.lastVisible} ${r.dbg})`);
          if (confirm !== r.confirmShown) bad.push(`${key}: the question`);
          for (const row of r.rows) {
            if (row.infoW < 150) bad.push(`${key}: a point's words are ${Math.round(row.infoW)} px wide`);
            if (row.lines > 3) bad.push(`${key}: a point's line takes ${row.lines} lines`);
            if (row.wrap === 'anywhere') bad.push(`${key}: words break mid-word`);
            if (!row.buttonsClear || !row.sameLine) bad.push(`${key}: the buttons sit over the words or apart`);
          }
          if (!confirm && r.rows.length !== Math.min(rank, 3)) bad.push(`${key}: ${r.rows.length} rows`);
          // Packed: no card has a hole above it in its column bigger than the gap.
          for (const c of r.cards) {
            const above = r.cards.filter((o) => o !== c && o.bottom <= c.top + 1 && o.left < c.right - 1 && c.left < o.right - 1);
            const floor = above.length ? Math.max(...above.map((o) => o.bottom)) : r.gridTop;
            if (c.top - floor > 24) bad.push(`${key}: a ${Math.round(c.top - floor)} px hole above ${c.t}`);
          }
        }
      }
      assert.deepEqual(bad, []);
    });
  });

  it('the wiring: packed rows, the box capped at the Map, the fade, and the point row', () => {
    const css = read('public/style.css');
    assert.match(css, /max-height: var\(--map-extras-room, min\(72vh, 520px\)\);/);
    assert.match(css, /\.map-extras-grid\[data-packed\] \{ grid-auto-rows: 1px; grid-auto-flow: row dense; row-gap: 0; \}/);
    const mod = read('public/js/map-extras.js');
    assert.match(mod, /el\.style\.gridRowEnd = `span \$\{Math\.max\(1, Math\.ceil\(el\.offsetHeight \+ gap\)\)\}`;/);
    assert.match(mod, /const room = Math\.floor\(card\.getBoundingClientRect\(\)\.bottom - grid\.getBoundingClientRect\(\)\.top - 8\);/);
    assert.match(read('public/game.js'), /\n  fitMapExtras\(card\);\n  if \(!mapFitObserver\)/, 'a resize packs and caps it again');
    const tp = read('public/js/features/teleportation-feature.js');
    assert.match(tp, /\.tp-map-card li\{display:flex;flex-wrap:wrap;/);
    assert.match(tp, /actions\.append\(set, go\);\n    row\.append\(info, actions\);/);
    assert.doesNotMatch(tp, /overflow-wrap:anywhere/);
  });
});
