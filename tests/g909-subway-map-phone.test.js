// G909 (#437, an upright phone with a 360 x 365 view): the station sign's Subway System map was wider
// than the screen (the card sized to its widest row, the close button off the edge) and could not be
// zoomed or panned. Glitch's HubMapDialog was a fixed 760 x 460 with no zoom (HubMapDialog.as 58-61);
// the remake draws the card inside the screen and gives the map the Map's own zoom and pan
// (js/map-zoom.js: two fingers, a drag, the wheel, + - Fit). Esc still closes it (G874).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clampMapView, fitMapView, mapViewBox, viewWithPointAt } from '../public/js/map-zoom.js?v=4f0762b2';
import { renderSubwayMapSvg } from '../public/js/map-views.js?v=7ff57fbc';

const root = join(import.meta.dirname, '..');
const feature = readFileSync(join(root, 'public/js/features/subway-feature.js'), 'utf8');
const client = join(root, '../glitch-client/com/tinyspeck/engine/view/gameoverlay/maps/HubMapDialog.as');
const open = feature.slice(feature.indexOf('function openMap(engine'), feature.indexOf('function mapSvg('));

describe('G909: the Subway System map on a phone (#437)', () => {
  it('the card is held to the screen: one grid track the width of the screen, the head wraps upright', () => {
    assert.match(feature, /\.subway-map \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    assert.match(feature, /@media \(max-width: 720px\), \(max-height: 560px\) \{[\s\S]*?\.subway-map-card \{ max-width: 100%; max-height: 100%;/);
    assert.match(feature, /@media \(max-width: 520px\) \{\s*\.subway-map-head \{ flex-wrap: wrap;/);
    // A finger-sized close (44 px) on a phone.
    assert.match(feature, /\.subway-map-close \{ min-width: 2\.75rem; min-height: 2\.75rem; \}/);
  });

  it('the map zooms and pans with js/map-zoom.js, kept on one host across opens and reset on each', () => {
    assert.match(feature, /import \{ createMapZoom \} from '\.\.\/map-zoom\.js[^']*';/);
    assert.match(open, /mapZoom = createMapZoom\(mapZoomHost\);/);
    assert.match(open, /mapZoom\?\.reset\(\);/);
    assert.match(open, /mapZoom\.attach\(svgHost\.querySelector\('svg'\), 'subway'\);/);
    assert.match(feature, /\.subway-map-zoom \{ position: relative; overflow: hidden; touch-action: none;/);
  });

  it("the map's frame is its viewBox: fit shows it all, a zoom stays inside it", () => {
    // G1127 (#606): the station's map is the Map's Subway view, on Glitch's own 760 x 460 frame.
    assert.match(feature, /function mapSvg\(station, direction\) \{[\s\S]*?return renderSubwayMapSvg\(\{/);
    const vb = /<svg viewBox="([\d. ]+)"/.exec(renderSubwayMapSvg({ interactive: false }))[1].split(' ').map(Number);
    assert.deepEqual(vb, [0, 0, 760, 460]);
    assert.deepEqual(mapViewBox(vb, fitMapView(vb)), vb);
    // Two fingers spread to 2x over the top left corner: the view never leaves the paper.
    const v = viewWithPointAt(vb, 2, 0, 0, 0.1, 0.1);
    const [x, y, w, h] = mapViewBox(vb, v);
    assert.equal(w, 380);
    assert.ok(x >= 0 && y >= 0 && x + w <= 760 && y + h <= 460);
    assert.equal(clampMapView(vb, { zoom: 9, cx: 0, cy: 0 }).zoom, 3);
  });

  it('Esc still closes it (G874)', () => {
    assert.match(open, /if \(e\.key !== 'Escape'\) return;\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*close\.click\(\);/);
  });

  it("Glitch's map was a fixed 760 x 460 (HubMapDialog.as 58-61)", { skip: !existsSync(client) && 'needs glitch-client beside the repo' }, () => {
    const as = readFileSync(client, 'utf8');
    assert.match(as, /MAP_W:int = 760;/);
    assert.match(as, /MAP_H:int = 460;/);
  });
});
