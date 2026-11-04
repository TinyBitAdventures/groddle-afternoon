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
 * Run: node --test tests/map-fit.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildHubMapView,
  hubMapFrame,
  labelQuad,
  layoutHubMapMarks,
  listHubsFromIndex,
  MAP_FIT_MAX_SCALE,
  mapFitSize,
  quadBox,
  renderHubMapSvg,
} from '../public/js/map-graph.js?v=750beb4a';

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
    const game = read('public/game.js');
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
  // Measured in Chrome and WebKit (Modern, Groddle Forest): the head, the region line and the Shortcuts
  // row take 165 px (114 compact, the key hint folded away), the card's sides 34 px; the map's floor
  // is 180 px. The room: under the top bar (50 px) and over the pack, left of the Social drawer
  // (316 px open, 60 px as the rail). Before, the card was 820 px wide (a 786 px canvas) and 88% tall.
  const MODERN = { chromeW: 34, chromeH: 165, compactChromeH: 114, minH: 180 };
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

  it('at 1440 x 707 every region draws at least the client size, but Groddle Meadow (its GO signs make it 492 tall)', () => {
    const win = WINDOWS[0];
    const small = [];
    for (const f of frames()) {
      const fit = mapFitSize({ ...MODERN, availW: win.availW, availH: win.availH, frameW: f.w, frameH: f.h });
      if (fit.scale < 1) small.push(`${f.name} ${fit.scale.toFixed(2)}`);
      else assert.ok(fit.w >= 760 && fit.h >= 460, `${f.name} ${fit.w}x${fit.h}`);
    }
    assert.deepEqual(small, ['Groddle Meadow 0.96']);
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
    const gf = { frameW: 788, frameH: 466 };
    assert.equal(mapFitSize({ ...MODERN, ...WINDOWS[2], ...gf }).scale, 1.5);
    assert.equal(mapFitSize({ ...MODERN, ...WINDOWS[3], ...gf }).compact, true);
  });

  it('the game measures the room and the window and sizes the map on open, resize and any change of size', () => {
    const game = read('public/game.js');
    assert.match(game, /arrangeMapCards\(panel\);\n  panel\.hidden = false;\n  fitMapCanvas\(panel\);/);
    assert.match(game, /const availW = panel\.clientWidth - px\(ps\.paddingLeft\) - px\(ps\.paddingRight\);/);
    assert.match(game, /const chromeH = card\.offsetHeight - canvas\.offsetHeight;/);
    assert.match(game, /const next = mapFitSize\(\{ availW, availH, chromeW, chromeH, compactChromeH, frameW, frameH, minH \}\);/);
    assert.match(game, /card\.style\.setProperty\('--map-card-w', `\$\{fit\.w \+ chromeW\}px`\);/);
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
    assert.match(css, /\.map-card\.map-hub\[data-map-fit\] \{\n[^}]*width: min\(max\(820px, var\(--map-card-w, 820px\)\), 96%\);/, 'never narrower than before');
    assert.match(css, /\.map-card\.map-hub\[data-map-fit="on"\] > \.map-canvas \{\n  flex: 0 1 auto;\n  height: var\(--map-fit-h\);/);
    assert.match(css, /\.map-card\.map-hub\[data-map-compact="1"\] > \.map-hint \{ display: none; \}/);
    const classic = read('public/css/classic.css');
    assert.match(classic, /#map-panel:not\(\[hidden\]\) \{ padding: calc\(10 \* var\(--cu\)\) calc\(20 \* var\(--cu\)\); grid-template: minmax\(0, 1fr\) \/ minmax\(0, 1fr\); \}/);
    assert.match(classic, /#map-panel > \.map-card\[data-map-fit\] \{ width: min\(max\(calc\(764 \* var\(--cu\)\), var\(--map-card-w, 0px\)\), 100%\); \}/);
    assert.match(classic, /#map-panel > \.map-card\[data-map-fit="on"\] > \.map-canvas \{ flex: 0 1 auto; height: var\(--map-fit-h\);/);
  });
});
