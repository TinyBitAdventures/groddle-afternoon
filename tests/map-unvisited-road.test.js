/**
 * #526: the Map draws a street you have not been to as a row of dots, not a road, as Glitch
 * did (glitch-client MapStreet.as 51-63: no road when !street.visited, showDots 142-155:
 * black dots of radius 2.5 every 2 x 2.5 + 3, at 0.4 of the street's alpha). The street you
 * are on counts as visited (MapHub.as 559-562). One SVG for Modern and Classic and every
 * painted map (map-graph.js renderHubMapSvg).
 * Run: node --test tests/map-unvisited-road.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHubMapSvg } from '../public/js/map-graph.js?v=803cc6cd';

const root = join(import.meta.dirname, '..');
const street = (tsid, name, extra = {}) => ({ tsid, name, label: name, loaded: true, loadedTsid: tsid, x1: 100, y1: 100, x2: 300, y2: 120, mx: 200, my: 110, ...extra });
const svgOf = (streets, extra = {}) => renderHubMapSvg({ mapW: 760, mapH: 460, hubs: [], streets, ...extra });

describe('#526: unvisited streets are dotted on the Map', () => {
  it('an unvisited street\'s road is dotted; a visited one, the one you are on and a closed one are not', () => {
    const svg = svgOf([
      street('GA1', 'Never Been', { unvisited: true }),
      street('GA2', 'Been There', { unvisited: false, x1: 300, y1: 300, x2: 500, y2: 320, mx: 400, my: 310 }),
      street('GA3', 'Right Here', { current: true, unvisited: true, x1: 500, y1: 100, x2: 700, y2: 120, mx: 600, my: 110 }),
      street('GA4', 'Far Off', { loaded: false, x1: 100, y1: 400, x2: 300, y2: 420, mx: 200, my: 410 }),
    ]);
    assert.match(svg, /<g class="map-street travelable unvisited" data-tsid="GA1"[^>]*><line class="map-seg-ring"[^>]*\/><line class="map-seg travelable unvisited"/);
    assert.equal((svg.match(/map-seg-ring/g) || []).length, 1, 'only the unvisited road wears the ring');
    assert.match(svg, /<g class="map-street travelable" data-tsid="GA2"[^>]*><line class="map-seg travelable"/);
    assert.match(svg, /<g class="map-street current" data-tsid="GA3"[^>]*><line class="map-seg current"/, 'where you are counts as visited');
    assert.match(svg, /<line class="map-seg dim"[^>]*data-tsid="GA4"/);
    assert.equal((svg.match(/unvisited/g) || []).length, 3, 'GA1 road, group and name only');
    // Still a street you can pick: the hit line and the menu stay.
    assert.match(svg, /data-tsid="GA1"[^>]*data-ctx="map-street"[^>]*>(?:(?!<\/g>).)*map-seg-hit/);
  });

  it('a street under construction keeps its own orange road, never dotted (#626); its name still dims', () => {
    const svg = svgOf([street('GA1', 'Camsteeple Strat', { unvisited: true, building: true })]);
    assert.match(svg, /<line class="map-seg-edge"[^>]*\/><line class="map-seg travelable building"/);
    assert.doesNotMatch(svg, /map-seg[^"]*unvisited/);
    assert.doesNotMatch(svg, /map-seg-ring/);
    assert.match(svg, /class="map-label loaded building unvisited"/);
  });

  it('on a painted map too', () => {
    const svg = svgOf([street('GA1', 'Never Been', { unvisited: true })], { bgLocal: 'assets/maps/x.webp' });
    assert.match(svg, /<line class="map-seg travelable unvisited"/);
  });

  it('the dots are Glitch\'s spacing: black, radius 2.5 every 8, first one 2.5 in; darker than its 0.28, on a pale ring (#571)', () => {
    const css = readFileSync(join(root, 'public/style.css'), 'utf8');
    const dash = /\.map-seg\.travelable\.unvisited,\n\.map-seg-ring \{([^}]*)\}/.exec(css)?.[1] || '';
    assert.match(dash, /stroke-dasharray: 0 calc\(8px \* var\(--map-line-k, 1\)\);/);
    assert.match(dash, /stroke-dashoffset: calc\(-2\.5px \* var\(--map-line-k, 1\)\);/);
    const rule = /\n\.map-seg\.travelable\.unvisited \{([^}]*)\}/.exec(css)?.[1] || '';
    assert.match(rule, /stroke: var\(--c-black\);/);
    assert.match(rule, /stroke-width: calc\(5px \* var\(--map-line-k, 1\)\);/);
    assert.ok(Number(/opacity: ([\d.]+);/.exec(rule)?.[1]) >= 0.6, 'dots dark enough to read (Glitch: 0.28)');
    const ring = /\n\.map-seg-ring \{(\n  stroke: [^}]*)\}/.exec(css)?.[1] || '';
    assert.match(ring, /stroke: var\(--c-cream-91\);/);
    assert.match(ring, /stroke-width: calc\(8px \* var\(--map-line-k, 1\)\);/, 'a ring wider than the dot');
    assert.match(ring, /pointer-events: none;/);
    const hover = /\.map-street\.travelable\.unvisited:hover \.map-seg\.travelable\.unvisited,[^{]*\{([^}]*)\}/.exec(css)?.[1] || '';
    assert.ok(Number(/opacity: ([\d.]+);/.exec(hover)?.[1]) > Number(/opacity: ([\d.]+);/.exec(rule)?.[1]));
    assert.match(hover, /stroke: var\(--c-black\);/, 'hovering keeps the dots, not the yellow road');
    // .map-seg rounds the line's caps, which turns each zero-length dash into a dot.
    assert.match(/\n\.map-seg \{([^}]*)\}/.exec(css)?.[1] || '', /stroke-linecap: round;/);
    // The hover rule comes after the plain travelable hover so it wins.
    assert.ok(css.indexOf('.map-street.travelable.unvisited:hover') > css.indexOf('.map-street.travelable:hover .map-seg.travelable'));
  });
});

describe('#571: a street\'s name picks the street', () => {
  it('a playable street\'s name carries its road\'s segment; a far-off one\'s does not', () => {
    const svg = svgOf([
      street('GA1', 'Never Been', { unvisited: true }),
      street('GA4', 'Far Off', { loaded: false, x1: 100, y1: 400, x2: 300, y2: 420, mx: 200, my: 410 }),
    ]);
    assert.match(svg, /<text class="map-label loaded unvisited" data-segment="GA1"/);
    assert.match(svg, /<text class="map-label dim" x=/);
    assert.match(svg, /<g class="map-street travelable unvisited"[^>]*data-segment="GA1"/);
  });

  it('the name is clickable and the Map forwards its click, right-click and hover to the road', () => {
    const css = readFileSync(join(root, 'public/style.css'), 'utf8');
    assert.match(css, /\.map-label\[data-segment\] \{ pointer-events: auto; cursor: pointer; \}/);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /querySelectorAll\('\.map-label\[data-segment\]'\)/);
    assert.match(game, /road\.dispatchEvent\(new MouseEvent\(type,/);
    assert.match(game, /road\.classList\.add\('is-hot'\)/);
    assert.match(css, /\.map-street\.travelable\.is-hot \.map-seg\.travelable \{/);
  });
});
