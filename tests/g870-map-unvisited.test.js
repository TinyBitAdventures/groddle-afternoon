/**
 * #403 (G870): the Map dims the names of streets you have not been to, as Glitch did
 * (glitch-client MapStreet.as 20 TF_DIM_ALPHA .5, 125: !street.visited), so a Completist
 * hunter can see what is left. The street you are on counts as visited (MapHub.as 559).
 * game.js reads the visits (streetVisitsBefore: the street's visit slot or locations_visited).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHubMapSvg } from '../public/js/map-graph.js?v=803cc6cd';

const root = join(import.meta.dirname, '..');
const street = (tsid, name, extra = {}) => ({ tsid, name, label: name, loaded: true, loadedTsid: tsid, x1: 100, y1: 100, x2: 300, y2: 120, mx: 200, my: 110, ...extra });

describe('#403: unvisited streets on the Map', () => {
  it('an unvisited street\'s name is marked; a visited one, the one you are on and a closed one are not', () => {
    const svg = renderHubMapSvg({ mapW: 760, mapH: 460, hubs: [], streets: [
      street('GA1', 'Never Been', { unvisited: true }),
      street('GA2', 'Been There', { unvisited: false, x1: 300, y1: 300, x2: 500, y2: 320, mx: 400, my: 310 }),
      street('GA3', 'Right Here', { current: true, x1: 500, y1: 100, x2: 700, y2: 120, mx: 600, my: 110 }),
    ] });
    assert.match(svg, /class="map-label loaded unvisited"[^>]*>Never Been</);
    assert.match(svg, /class="map-label loaded"[^>]*>Been There</);
    assert.match(svg, /class="map-label current"[^>]*>Right Here</);
  });

  it('game.js marks each playable street from your visits, and the name is drawn at half', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /st\.unvisited = !\[st\.loadedTsid, st\.tsid\]\.some\(\(t\) => t && engine\.streetVisitsBefore\(t\) > 0\);/);
    assert.match(game, /app\.canvas\.dataset\.mapUnvisited = String\(unvisited\);/);
    const css = readFileSync(join(root, 'public/style.css'), 'utf8');
    assert.match(css, /\.map-label\.loaded\.unvisited \{ opacity: 0\.5; \}/);
  });
});
