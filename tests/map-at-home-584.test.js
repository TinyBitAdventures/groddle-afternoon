/**
 * #584: the Map opens at home. Glitch opened it in a house (locations/home.js
 * prep_geometry_callback clears no_map; HubMapDialog.as start opens the World Map in a POL).
 * Here it opens on the region your way out leads to, and a route set from home starts there.
 */
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_TEXT } from '../public/js/map-routes.js?v=52140ba2';
import { mapRoutesFeature } from '../public/js/features/map-routes-feature.js?v=c7a6b235';
import { createFeatureHost } from '../public/js/feature-host.js?v=100f3193';
import { applyStreetIndex } from '../public/js/street-loader.js?v=10376267';
import { findCurrentStreet, homeDoorMapSpot, pickMapSpot } from '../public/js/map-graph.js?v=803cc6cd';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const readJson = (rel) => JSON.parse(readFileSync(join(PUBLIC, rel), 'utf8'));
const GRAPH = readJson('assets/content/signpost-graph.json').streets;
const INDEX = readJson('assets/streets/index.json');
const mapIndex = readJson('assets/maps/index.json');
const hubHasMap = (id) => Boolean(mapIndex.hubs[id] && (mapIndex.hubs[id].streetCount > 0 || mapIndex.hubs[id].zone));
const streetOnHub = (id, tsid) => Boolean(findCurrentStreet(tsid, readJson(mapIndex.hubs[id].file.replace(/^\//, '')).streets || []));

const MAHATAM = 'GA5PV4T79OE2AOA';
const DHUMA = 'GA5REO5I9OE2KLS';

function fakeEngine(home) {
  const data = {};
  let host = null;
  const engine = {
    started: true,
    streetTsid: 'RH_HOME_INT',
    street: { tsid: 'RH_HOME_INT', label: 'Your House', bounds: { l: 0, t: 0 }, signposts: [] },
    player: { x: 300, y: 500 },
    signViews: [],
    interactables: [],
    questState: { active: {} },
    data,
    param: () => null,
    setData: (k, v) => { data[k] = v; },
    save() {},
    homeContext: () => home,
    transientInstance: () => false,
    toast() {},
    pushActivity() {},
    query: (hook, ...args) => host.query(hook, ...args),
  };
  host = createFeatureHost([mapRoutesFeature]);
  return engine;
}

describe('#584 the Map at home', () => {
  before(() => applyStreetIndex(INDEX));
  beforeEach(() => {
    mapRoutesFeature._reset();
    mapRoutesFeature._setGraph(GRAPH);
  });

  it('Map at home no longer opens the Home panel instead', () => {
    const src = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
    const open = src.slice(src.indexOf('async function openMap('), src.indexOf('async function openMap(') + 1200);
    assert.doesNotMatch(open, /homeIsInstanced\(\)\)\s*\{\s*openHomePanel\(\)/);
    assert.match(src, /homeIsInstanced\(\) \? homeDoorMapSpot\(homeReturnDestination\(\), STREET_INDEX\.streets\)/);
  });

  it('opens on the region the way out leads to', () => {
    const door = homeDoorMapSpot({ tsid: MAHATAM, label: 'Mahatam Audarika' }, INDEX.streets);
    assert.deepEqual(door, { tsid: MAHATAM, hubId: String(INDEX.streets[MAHATAM].hubId) });
    const spot = pickMapSpot([{ tsid: 'RH_HOME_INT', hubId: undefined }, door], hubHasMap, streetOnHub);
    assert.equal(spot.hubId, door.hubId);
    assert.equal(homeDoorMapSpot({ tsid: 'NOPE' }, INDEX.streets), null);
    assert.equal(homeDoorMapSpot(null, INDEX.streets), null);
  });

  it('a route set from home starts on the street the way out leads to', () => {
    const engine = fakeEngine({ inHome: true, wayOut: { tsid: MAHATAM, label: 'Mahatam Audarika' } });
    const res = mapRoutesFeature.mapRoute('set', { to: DHUMA, source: 'player' }, engine);
    assert.equal(res.ok, true, res.error);
    assert.equal(res.route.path[0], MAHATAM);
    assert.equal(res.route.destination, DHUMA);
  });

  it('with no way out known, home still says to return to the world', () => {
    const engine = fakeEngine({ inHome: true, wayOut: null });
    const res = mapRoutesFeature.mapRoute('set', { to: DHUMA, source: 'player' }, engine);
    assert.equal(res.ok, false);
    assert.equal(res.error, ROUTE_TEXT.fromHome);
  });
});
