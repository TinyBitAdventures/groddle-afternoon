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
  quadBox,
  renderHubMapSvg,
} from '../public/js/map-graph.js?v=5b1575ad';

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
