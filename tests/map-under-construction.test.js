/**
 * Ticket 66 (Friendly, 2026-11-03): the Map should show which streets are under construction
 * before you try to go. v0.14.0 already greys Set as Destination and Teleport Here on them
 * (tests/closed-roads-map.test.js); now the street itself is drawn set apart and its name dimmed,
 * as the client drew a locked street (MapStreet.as 16-20, 53-55, 125: STREET_LOCKED 'SL';
 * location.js 2880-2935 not_a_destination).
 * #626 (G1179): the dashed stripes read as Glitch's unvisited dots on a phone, so built streets not
 * yet walked looked like projects. The construction look is now an unbroken blue road on a dark
 * edge with a road-works diamond at its middle (blue: the route you set is orange), and the Map's key
 * line names the dots and the blue.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHubMapSvg } from '../public/js/map-graph.js?v=803cc6cd';
import { hubMapSubtitle } from '../public/js/panel-copy.js?v=f854d1dd';

const root = join(import.meta.dirname, '..');
const street = (tsid, name, extra = {}) => ({ tsid, name, label: name, loaded: true, loadedTsid: tsid, x1: 100, y1: 100, x2: 300, y2: 120, mx: 200, my: 110, ...extra });

describe('ticket 66: streets under construction on the Map', () => {
  it('draws a street being built set apart, a dimmed name and a tooltip', () => {
    const svg = renderHubMapSvg({ mapW: 760, mapH: 460, hubs: [], streets: [street('GA1', 'Camsteeple Strat', { building: true }), street('GA2', 'Switchback', { x1: 300, y1: 300, x2: 500, y2: 320, mx: 400, my: 310 })] });
    assert.match(svg, /<g class="map-street travelable building" data-tsid="GA1"[^>]*data-building="1"><title>Camsteeple Strat: under construction<\/title>/);
    assert.match(svg, /<line class="map-seg-edge"[^>]*\/><line class="map-seg travelable building"/);
    assert.match(svg, /class="map-label loaded building"[^>]*>Camsteeple Strat</);
    assert.match(svg, /<g class="map-street travelable" data-tsid="GA2"/, 'an open street is drawn as before');
    assert.doesNotMatch(svg.split('data-tsid="GA2"')[1].split('</g>')[0], /edge|building/);
  });

  it('the street you are on is never marked, and the Map asks the street-jobs feature', () => {
    const svg = renderHubMapSvg({ mapW: 760, mapH: 460, hubs: [], streets: [street('GA1', 'Here', { building: true, current: true })] });
    assert.doesNotMatch(svg, /map-seg-edge|map-project-mark/);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /st\.building = Boolean\(features\.query\('streetUnderConstruction', st\.loadedTsid \|\| st\.tsid, engine\)\)/);
    const css = readFileSync(join(root, 'public/style.css'), 'utf8');
    assert.match(css, /\.map-label\.loaded\.building \{ opacity: 0\.5; \}/);
  });
});

describe('#626 (G1179): the construction look cannot be taken for Glitch\'s dots', () => {
  const css = readFileSync(join(root, 'public/style.css'), 'utf8');
  const rule = (sel) => new RegExp(`\n${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`).exec(css)?.[1] || '';

  it('the road is one unbroken blue line on a dark edge, never dashed or dotted, and not the route\'s orange', () => {
    const road = rule('.map-seg.travelable.building');
    assert.match(road, /stroke: var\(--c-blue-74\);/);
    assert.match(readFileSync(join(root, 'public/js/features/map-routes-feature.js'), 'utf8'), /const MAP_ROUTE_CSS = '#ff9326';/, 'the route stays orange');
    assert.doesNotMatch(road, /dasharray/);
    const edge = rule('.map-seg-edge');
    assert.match(edge, /stroke: var\(--c-navy-26\);/);
    assert.doesNotMatch(edge, /dasharray/);
    assert.doesNotMatch(css, /map-seg-stripes/, 'the dashed stripes are gone');
    // Glitch's dots stay as they were (tests/map-unvisited-road.test.js checks their spacing).
    assert.match(css, /\.map-seg\.travelable\.unvisited,\n\.map-seg-ring \{\n  stroke-dasharray: 0 calc\(8px/);
  });

  it('each street being built wears a road-works diamond at its middle; a dotted street does not', () => {
    const svg = renderHubMapSvg({ mapW: 760, mapH: 460, hubs: [], streets: [
      street('GA1', 'Camsteeple Strat', { building: true, unvisited: true }),
      street('GA2', 'Never Been', { unvisited: true, x1: 300, y1: 300, x2: 500, y2: 320, mx: 400, my: 310 }),
    ] });
    assert.equal((svg.match(/class="map-project-mark"/g) || []).length, 1);
    assert.match(svg, /<g class="map-project-mark" data-segment="GA1" transform="translate\(200 110\)"><polygon class="map-project-sign" points="0,-8 8,0 0,8 -8,0"\/>/);
    assert.match(svg, /<g class="map-street travelable unvisited" data-tsid="GA2"/);
    assert.match(rule('.map-project-mark'), /pointer-events: none/);
  });

  it('the Map\'s key line names the dots and the blue when the map shows them', () => {
    const plain = { streets: [{ loaded: true }, { loaded: false }] };
    assert.match(hubMapSubtitle(plain, { touch: true }), / · red star = you$/, 'no key words for what is not drawn');
    const both = { streets: [{ loaded: true, unvisited: true }, { loaded: true, building: true, unvisited: true }, { loaded: true, current: true }] };
    assert.match(hubMapSubtitle(both, { touch: true }), / · red star = you · dots = not visited yet · blue = being built$/);
    const onlyBuilding = { streets: [{ loaded: true, building: true, unvisited: true }] };
    assert.doesNotMatch(hubMapSubtitle(onlyBuilding), /dots/, 'a street being built is never dotted');
    assert.doesNotMatch(hubMapSubtitle({ streets: [{ loaded: true, current: true, building: true, unvisited: true }] }), /blue|dots/, 'the street you are on is neither');
    assert.doesNotMatch(hubMapSubtitle(both), /—/);
  });
});
