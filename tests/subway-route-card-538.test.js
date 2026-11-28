/**
 * #538 (R34, a remake extension wired into one view only): Map routes ride the subway (our own
 * addition, js/map-routes.js subwayRides), but the route card knew streets only. At a station it named
 * the street after the ride, in the train and at a stop the route did not use it said "Return to world
 * for directions", and back down the far station's steps it named the street after that while the
 * arrow pointed at the steps. map-routes.js legStep is the one model every view reads: the surface
 * street names the station its entrance goes down to, the platform names the line to board (or the
 * street up the steps), the train names the stop to get off at.
 * Run: node --test tests/subway-route-card-538.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gpsText, legStep, planRoute, rideLine, routeGraph, subwayRides } from '../public/js/map-routes.js?v=e9f5e3da';
import { SUBWAY_STREETS } from '../public/js/street-jobs.js?v=17f103d0';
import { CAR_TSID, STATIONS, SUBWAY_LINE, findStation, stationByTsid } from '../public/js/subway.js?v=ea6921ff';
import { mapRoutesFeature } from '../public/js/features/map-routes-feature.js?v=35ee8c3f';
import { createFeatureHost } from '../public/js/feature-host.js?v=100f3193';
import { applyStreetIndex } from '../public/js/street-loader.js?v=23555e53';

const PUB = join(import.meta.dirname, '..', 'public');
const json = (rel) => JSON.parse(readFileSync(join(PUB, rel), 'utf8'));
const INDEX = json('assets/streets/index.json');
const GRAPH_JSON = json('assets/content/signpost-graph.json');
const { graph } = routeGraph(GRAPH_JSON);
const label = (t) => INDEX.streets[t]?.label || t;
const RIDES = subwayRides(SUBWAY_STREETS);
const LINES = { forwards: SUBWAY_LINE.forwards_name, backwards: SUBWAY_LINE.backwards_name };
const OPTS = { rides: RIDES, stations: STATIONS, lines: LINES, label };

const JUTUAN = findStation('Jutuan Central');
const SUMP = findStation('Somewhat Sump');
const GFJ = findStation('Groddle Forest Junction');
const GRANGE = findStation('Gregarious Grange');
const surface = (st) => st.surfaceStreetTsid;
const ADANAC = 'GLI2V30ECRD1GAU';
const BLUE_MOUNTAIN_BORE = 'GLIE7307LTG11T2';

const card = (route, where) => gpsText(route, legStep(route, graph, where, OPTS), label);

describe('#538 the route card reads the subway leg in every view (legStep)', () => {
  const { route } = planRoute({}, graph, { from: surface(JUTUAN), to: BLUE_MOUNTAIN_BORE, rides: RIDES });

  it('the route rides Jutuan Central to Groddle Forest Junction, then walks', () => {
    assert.deepEqual(route.path, [surface(JUTUAN), surface(GFJ), ADANAC, BLUE_MOUNTAIN_BORE]);
  });

  it('on the street: the station its subway entrance goes down to', () => {
    assert.equal(card(route, { street: surface(JUTUAN) }).next, 'Next: Jutuan Central Subway Station');
  });

  it('on the platform: the line to board, the one with fewer stops', () => {
    // Red Line (next_stop): Jutuan Central, Onto Parada, Somewhat Sump, Groddle Forest Junction.
    assert.deepEqual(rideLine(STATIONS, JUTUAN, GFJ), { direction: 'forwards', stops: 3 });
    assert.equal(card(route, { station: JUTUAN }).next, 'Next: Subway Red Line');
    // Blue Line (previous_stop): Jutuan Central, Eastern Approach, Gregarious Grange.
    const toGrange = planRoute({}, graph, { from: surface(JUTUAN), to: surface(GRANGE), rides: RIDES }).route;
    assert.deepEqual(toGrange.path, [surface(JUTUAN), surface(GRANGE)]);
    assert.equal(card(toGrange, { station: JUTUAN }).next, 'Next: Subway Blue Line');
  });

  it('in the train: the stop to get off at, at every stop on the way, with no arrow', () => {
    for (const stop of [JUTUAN, findStation('Onto Parada'), SUMP, null]) {
      const text = card(route, { car: true, stop });
      assert.equal(text.next, 'Next: Groddle Forest Junction', stop?.name || 'no stop known');
      assert.equal(text.offPath, undefined);
      assert.equal(text.noArrow, true);
    }
  });

  it('off at the route\'s stop: the street up the steps, then the street after it', () => {
    assert.equal(card(route, { station: GFJ }).next, 'Next: Groddle Forest Junction');
    assert.equal(card(route, { street: surface(GFJ) }).next, 'Next: Adanac');
    // Back down the steps: the steps still lead up to Groddle Forest Junction (not "Next: Adanac").
    assert.equal(card(route, { station: GFJ }).next, 'Next: Groddle Forest Junction');
  });

  it('the destination\'s own station names its street, not "You Have Arrived!"', () => {
    const toGrange = planRoute({}, graph, { from: surface(JUTUAN), to: surface(GRANGE), rides: RIDES }).route;
    assert.equal(card(toGrange, { car: true, stop: findStation('Eastern Approach') }).next, 'Next: Gregarious Grange');
    const text = card(toGrange, { station: GRANGE });
    assert.equal(text.next, 'Next: Gregarious Grange');
    assert.equal(text.arrived, false);
  });

  it('a route with no subway leg reads as before', () => {
    const walk = planRoute({}, graph, { from: surface(GFJ), to: BLUE_MOUNTAIN_BORE, rides: RIDES }).route;
    assert.equal(card(walk, { street: surface(GFJ) }).next, 'Next: Adanac');
  });
});

describe('#538 the route feature walks a route through the subway', () => {
  let engine;
  let stop = null;
  before(() => {
    applyStreetIndex(INDEX);
    mapRoutesFeature._reset();
    mapRoutesFeature._setGraph(GRAPH_JSON);
    mapRoutesFeature._setOneWay(null);
    const data = {};
    engine = {
      started: true,
      // R24: a route rides only when the gate would let you through: this player has Your Papers.
      unlockedAchievements: ['you_have_papers'],
      streetTsid: surface(JUTUAN),
      data,
      interactables: [],
      setData: (k, v) => { data[k] = v; },
      save() {},
      homeContext: () => ({ inHome: false }),
      transientInstance: () => false,
      questState: { active: {} },
      // subway-feature mapStreet: a station's own street, in the train the stop it last stood at.
      query: (hook) => {
        const at = stationByTsid(engine.streetTsid) || (engine.streetTsid === CAR_TSID ? stop : null);
        return hook === 'mapStreet' && at ? { tsid: at.surfaceStreetTsid, hubId: at.surfaceHubId } : null;
      },
    };
    createFeatureHost([mapRoutesFeature]);
  });
  after(() => {
    mapRoutesFeature._reset();
    mapRoutesFeature._setGraph(null);
  });

  const go = (tsid, at = null) => {
    stop = at;
    engine.streetTsid = tsid;
    mapRoutesFeature.onStreetEnter({ tsid }, engine);
    return [engine.data.routeStatus, engine.data.routeNext];
  };

  it('each step names what comes next', () => {
    assert.equal(mapRoutesFeature.mapRoute('set', { to: BLUE_MOUNTAIN_BORE }, engine).ok, true);
    assert.deepEqual(go(surface(JUTUAN)), ['on', 'Jutuan Central Subway Station']);
    assert.deepEqual(go(JUTUAN.streetTsid), ['on', 'Subway Red Line']);
    assert.deepEqual(go(CAR_TSID, JUTUAN), ['on', 'Groddle Forest Junction']);
    assert.deepEqual(go(CAR_TSID, SUMP), ['on', 'Groddle Forest Junction'], 'between stops, not "Return to world for directions"');
    assert.deepEqual(go(GFJ.streetTsid), ['on', 'Groddle Forest Junction'], 'off at the stop: up the steps');
    assert.deepEqual(go(surface(GFJ)), ['on', 'Adanac']);
    assert.deepEqual(go(GFJ.streetTsid), ['on', 'Groddle Forest Junction'], 'back down: the steps still');
  });

  it('a route set on a platform starts from the station\'s street', () => {
    mapRoutesFeature.mapRoute('clear', {}, engine);
    go(JUTUAN.streetTsid);
    const res = mapRoutesFeature.mapRoute('set', { to: BLUE_MOUNTAIN_BORE }, engine);
    assert.equal(res.route.path[0], surface(JUTUAN));
    assert.equal(engine.data.routeNext, 'Subway Red Line');
    assert.equal(mapRoutesFeature.mapRoute('find', { to: BLUE_MOUNTAIN_BORE }, engine).hops, 3);
  });

  it('off at a stop the route does not use: a new route from that station\'s street', () => {
    mapRoutesFeature.mapRoute('set', { to: BLUE_MOUNTAIN_BORE, from: surface(JUTUAN) }, engine);
    const [status, next] = go(SUMP.streetTsid);
    assert.equal(status, 'on', 'not "Return to world for directions"');
    assert.equal(mapRoutesFeature.mapRoute('get', null, engine).path[0], surface(SUMP));
    assert.ok(['Subway Red Line', 'Subway Blue Line', 'Somewhat Sump'].includes(next), next);
  });
});
