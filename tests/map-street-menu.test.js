/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit later batch item 4): the Map's street menu (Set
 * as Destination, Teleport Here: glitch-client InteractionMenuController.as 130-275) is the shared
 * menu (js/ui/context-menu.js) with key caps, the footer line and both skins' art; a left click
 * and a right-click on a street open it at the pointer, a street under construction still greys
 * both rows with its note, and a right-click on your own street shows it greyed with "You are
 * already here." (a left click there still only says so).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderHubMapSvg } from '../public/js/map-graph.js?v=e327f8ec';

const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const menu = game.slice(game.indexOf('function openMapStreetMenu('), game.indexOf('function routeThroughConstruction('));
const clicks = game.slice(game.indexOf("canvas.querySelectorAll('.map-street.travelable')"), game.indexOf("canvas.querySelectorAll('.map-hub-go')"));

describe('the Map\'s street menu on the shared menu', () => {
  it('one shared menu (#map-street-menu), its rows the two the street had', () => {
    assert.match(game, /createContextMenu\(\{ doc: document, host: document\.getElementById\('game-root'\), id: 'map-street-menu', className: 'map-ctx-menu', rowData: 'mapRow', setData: setCanvasData \}\)/);
    assert.match(menu, /id: 'destination',\n\s+label: 'Set as Destination',/);
    assert.match(menu, /label: tp\.ok && tp\.energyCost \? `Teleport Here · \$\{tp\.energyCost\} energy` : 'Teleport Here',/);
    assert.match(menu, /features\.query\('mapTeleport', 'check', street, engine\)/);
    assert.match(menu, /features\.query\('mapTeleport', 'go', street, engine\);/);
    assert.match(menu, /owner: `map:\$\{street\.tsid\}`/);
    assert.doesNotMatch(menu, /document\.createElement\('button'\)/, 'no hand-built buttons any more');
    assert.doesNotMatch(css, /\.map-street-menu \{/, 'the old menu\'s own CSS is gone: both skins draw .ctx-menu');
  });

  it('a street under construction: Set as Destination greyed with its note (ticket 37), Teleport Here asks the feature', () => {
    assert.match(menu, /const building = here \? null : features\.query\('streetUnderConstruction', street\.tsid, engine\);/);
    assert.match(menu, /disabled: here \|\| Boolean\(building\),\n\s+reason: here \? MAP_ALREADY_HERE : building \? building\.note : '',/);
    assert.match(menu, /disabled: !tp\.ok,\n\s+reason: tp\.ok \? '' : tp\.error \|\| '',/);
  });

  it('your own street: both rows greyed, "You are already here."', () => {
    assert.match(game, /const MAP_ALREADY_HERE = 'You are already here\.';/);
    assert.match(menu, /const tp = here\n\s+\? \{ ok: false, error: MAP_ALREADY_HERE \}/);
  });

  it('a left click and a right-click on a street open it at the pointer; a left click on yours still only says so', () => {
    assert.match(menu, /at: \{ x: event\.clientX, y: event\.clientY \},/);
    assert.match(clicks, /g\.addEventListener\('click', \(e\) => \{[\s\S]{0,900}openMapStreetMenu\(canvas, e, \{ tsid: plan\.toTsid/);
    assert.match(clicks, /g\.addEventListener\('contextmenu', \(e\) => \{\n\s+e\.preventDefault\(\);/);
    assert.match(clicks, /g\.addEventListener\('click', \(\) => toast\(MAP_ALREADY_HERE\)\);/);
    assert.match(clicks, /\{ here: true \}\);/);
  });

  it('closing the Map closes it; QA keys', () => {
    assert.match(game, /function closeMap\(\) \{\n\s+const panel = document\.getElementById\('map-panel'\);\n\s+if \(panel\) panel\.hidden = true;\n\s+if \(mapCtxMenu\?\.isOpen\(\)\) mapCtxMenu\.close\(\{ focus: false \}\);/);
    assert.match(menu, /app\.canvas\.dataset\.mapStreetMenu = `\$\{street\.tsid\}:\$\{here \? 'here' : tp\.ok \? 'teleport' : 'route'\}`/);
  });

  it('each street on the drawn map is marked as having a menu of ours ([data-ctx])', () => {
    const svg = renderHubMapSvg({ hubName: 'Test', streets: [{ tsid: 'GA1', label: 'Alpha', loaded: true, current: true, x1: 0, y1: 0, x2: 10, y2: 0 }, { tsid: 'GA2', label: 'Beta', loaded: true, x1: 10, y1: 0, x2: 20, y2: 0 }], width: 100, height: 100 });
    assert.equal((svg.match(/<g class="map-street [^"]*"[^>]*data-ctx="map-street"/g) || []).length, 2);
  });
});
