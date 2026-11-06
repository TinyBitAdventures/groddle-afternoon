/**
 * Ticket 66 (Friendly, 2026-11-03): the Map should show which streets are under construction
 * before you try to go. v0.14.0 already greys Set as Destination and Teleport Here on them
 * (tests/closed-roads-map.test.js); now the street itself is drawn fainter with construction
 * stripes and its name dimmed, as the client drew a locked street (MapStreet.as 16-20, 53-55,
 * 125: STREET_LOCKED 'SL'; location.js 2880-2935 not_a_destination).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHubMapSvg } from '../public/js/map-graph.js?v=f181bdc8';

const root = join(import.meta.dirname, '..');
const street = (tsid, name, extra = {}) => ({ tsid, name, label: name, loaded: true, loadedTsid: tsid, x1: 100, y1: 100, x2: 300, y2: 120, mx: 200, my: 110, ...extra });

describe('ticket 66: streets under construction on the Map', () => {
  it('draws a street being built fainter, with stripes, a dimmed name and a tooltip', () => {
    const svg = renderHubMapSvg({ mapW: 760, mapH: 460, hubs: [], streets: [street('GA1', 'Camsteeple Strat', { building: true }), street('GA2', 'Switchback', { x1: 300, y1: 300, x2: 500, y2: 320, mx: 400, my: 310 })] });
    assert.match(svg, /<g class="map-street travelable building" data-tsid="GA1"[^>]*data-building="1"><title>Camsteeple Strat: under construction<\/title>/);
    assert.match(svg, /<line class="map-seg travelable building"[^>]*\/><line class="map-seg-stripes"/);
    assert.match(svg, /class="map-label loaded building"[^>]*>Camsteeple Strat</);
    assert.match(svg, /<g class="map-street travelable" data-tsid="GA2"/, 'an open street is drawn as before');
    assert.doesNotMatch(svg.split('data-tsid="GA2"')[1].split('</g>')[0], /stripes|building/);
  });

  it('the street you are on is never marked, and the Map asks the street-jobs feature', () => {
    const svg = renderHubMapSvg({ mapW: 760, mapH: 460, hubs: [], streets: [street('GA1', 'Here', { building: true, current: true })] });
    assert.doesNotMatch(svg, /map-seg-stripes/);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /st\.building = Boolean\(features\.query\('streetUnderConstruction', st\.loadedTsid \|\| st\.tsid, engine\)\)/);
    const css = readFileSync(join(root, 'public/style.css'), 'utf8');
    assert.match(css, /\.map-seg-stripes \{[^}]*stroke-dasharray/);
    assert.match(css, /\.map-label\.loaded\.building \{ opacity: 0\.5; \}/);
  });
});
