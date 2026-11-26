// G935 (#467): Glitch's region map moved the You star along the street you are on by your share of it,
// every frame while the map was open (HubMapDialog.as 594-633), and drew the streets you are not on at
// 0.7 (MapStreet.as 16, 46). The remake drew the star once at the street's midpoint.
// Run: node --test tests/g935-map-you-follows.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STREET_ROTATION_BUFFER, hubYouPoints, renderHubMapSvg, youOnStreet } from '../public/js/map-graph.js?v=803cc6cd';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('the You star on the region map (G935, #467)', () => {
  it('stands along the street by your share of it, left end at the first point', () => {
    const s = { x1: 100, y1: 200, x2: 300, y2: 100 };
    assert.deepEqual(youOnStreet(s, { xShare: 0 }), { x: 100, y: 200 });
    assert.deepEqual(youOnStreet(s, { xShare: 1 }), { x: 300, y: 100 });
    assert.deepEqual(youOnStreet(s, { xShare: 0.5 }), { x: 200, y: 150 });
    assert.deepEqual(youOnStreet(s, { xShare: 1.4 }), { x: 300, y: 100 }, 'never off the line');
    assert.equal(youOnStreet({ x1: 'a' }, { xShare: 0.5 }), null);
  });

  it('a street drawn upright whose level is taller than wide goes by height, its bottom at the second point', () => {
    const down = { x1: 50, y1: 0, x2: 50, y2: 100 };
    assert.equal(STREET_ROTATION_BUFFER, 5);
    assert.deepEqual(youOnStreet(down, { xShare: 0.1, yShare: 1, tall: true }), { x: 50, y: 100 }, 'the bottom of the level');
    assert.deepEqual(youOnStreet(down, { xShare: 0.1, yShare: 0, tall: true }), { x: 50, y: 0 }, 'the top');
    assert.deepEqual(youOnStreet(down, { xShare: 0.1, yShare: 0, tall: false }), { x: 50, y: 10 }, 'a wide level: by x, as Glitch');
    const up = { x1: 50, y1: 100, x2: 50, y2: 0 };
    assert.deepEqual(youOnStreet(up, { xShare: 0.25, yShare: 1, tall: true }), { x: 50, y: 75 }, 'only about 90 degrees counts (-90 goes by x)');
  });

  it('the map draws it there when told (view.youAt), else at the midpoint, and game.js moves it every frame', () => {
    const view = { mapW: 760, mapH: 460, hubName: 'Test', streets: [{ tsid: 'A', name: 'A', x1: 100, y1: 100, x2: 300, y2: 100, mx: 200, my: 100, loaded: true, current: true, label: 'A' }], hubs: [] };
    assert.match(renderHubMapSvg(view), new RegExp(`class="map-you" points="${hubYouPoints(200, 100)}"`));
    assert.match(renderHubMapSvg({ ...view, youAt: { x: 120, y: 100 } }), new RegExp(`class="map-you" points="${hubYouPoints(120, 100)}"`));
    const game = read('public/game.js');
    assert.match(game, /tickNotices\(\);\n  followMapYou\(\);\n/, 'once a frame');
    assert.match(game, /youOnStreet\(seg, \{ xShare: player\.x \/ w, yShare: h > 0 \? player\.y \/ h : 1, tall: h > w \}\)/);
    assert.match(game, /mapYouSeg = youSeg && findCurrentStreet\(currentStreetTsid, \[youSeg\]\) \? youSeg : null;/, 'only on the street you stand on');
  });

  it('the streets you are not on at 0.7, 0.85 under the pointer, the one you are on whole', () => {
    const css = read('public/style.css');
    assert.match(css, /\.map-seg\.travelable \{\n  stroke: var\(--c-yellow-91\);\n  stroke-width: calc\(7px \* var\(--map-line-k, 1\)\);\n  opacity: 0\.7;\n\}/);
    // #571: a street's name under the pointer lights its road the same way (.is-hot).
    assert.match(css, /\.map-street\.travelable:hover \.map-seg\.travelable,\n\.map-street\.travelable\.is-hot \.map-seg\.travelable \{[^}]*opacity: 0\.85;/);
    const current = css.slice(css.indexOf('.map-seg.current {'), css.indexOf('}', css.indexOf('.map-seg.current {')));
    assert.doesNotMatch(current, /opacity/);
  });
});
