/**
 * #480: a Warm and Smuggly run from Kajuu (Appam Almost) was sent to Groddle Meadow, which the roads
 * as they stand reach only by subway, and the subway refuses anyone carrying the package
 * (subway_gate.js 72-76, js/subway.js gateRefusal 'dubious'); teleports refuse too
 * (inc_teleportation.js 165). Glitch had every street walkable, so contraband.js picked from its
 * lists unchecked. Now the pick is on foot from the run's start (street-jobs-feature
 * streetsWalkable: closed roads stay closed, no subway ride, no Teleporter), the default list is
 * filtered the same way, a street with nothing on foot has no run to give, and the run's Map route
 * never rides the subway (map-routes.js routeRides).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_DESTINATIONS, DESTINATIONS, SMUGGLER_STREETS, chooseDestination, destinationPool, sourceKey } from '../public/js/smuggling.js?v=2fde7da3';
import { applyStreetIndex, resolveIndexTsid } from '../public/js/street-loader.js?v=10376267';
import { streetJobsFeature } from '../public/js/features/street-jobs-feature.js?v=c83e3d2b';
import { NO_RIDE_SOURCES, createRouteState, isRide, planRoute, routeRides, subwayRides } from '../public/js/map-routes.js?v=52140ba2';
import { SUBWAY_STREETS } from '../public/js/street-jobs.js?v=76471e42';
import { loadStreetGraph, roadsFor } from '../public/js/street-graph.js?v=d767f3a2';

const PUB = join(import.meta.dirname, '..', 'public');
const read = (rel) => readFileSync(join(PUB, rel), 'utf8');
const APPAM_ALMOST = 'LHV17CFO5V327AJ';
const HAYDEN_SEEK = 'LLIF3AQTOFE19OR';
const seq = (n) => Array.from({ length: n }, (_, i) => () => (i + 0.5) / n);
const g = (t) => resolveIndexTsid(`G${sourceKey(t).slice(1)}`);

describe('#480 pure', () => {
  it('the pool is the start\'s own reachable list, else the reachable defaults, else empty', () => {
    const own = DESTINATIONS[HAYDEN_SEEK][0];
    assert.deepEqual(destinationPool(HAYDEN_SEEK, { open: (t) => t === own }), [own]);
    assert.deepEqual(destinationPool(HAYDEN_SEEK, { open: (t) => t === DEFAULT_DESTINATIONS[2] }), [DEFAULT_DESTINATIONS[2]]);
    assert.deepEqual(destinationPool(HAYDEN_SEEK, { open: () => false }), []);
    assert.equal(chooseDestination(HAYDEN_SEEK, { open: () => false }), null);
  });

  it('a smuggling route takes no subway ride; other routes still do', () => {
    const rides = subwayRides(['A', 'B']);
    assert.ok(NO_RIDE_SOURCES.includes('smuggling'));
    assert.equal(routeRides(rides, 'smuggling'), null);
    assert.equal(routeRides(rides, 'player'), rides);
    assert.equal(routeRides(rides, ''), rides);
  });
});

describe('#480 a fresh world: every destination a run can pick is reachable on foot from its start', () => {
  const realFetch = globalThis.fetch;
  const engine = {
    mode: 'solo',
    streetTsid: `G${APPAM_ALMOST.slice(1)}`,
    questState: { active: {}, done: {} },
    param: () => null,
    setData() {},
    save() {},
    updateHud() {},
    query: (hook) => (hook === 'closedRoads' ? streetJobsFeature.closedRoads(engine) : null),
  };
  let graph = null;

  before(async () => {
    globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(read(String(url).split('?')[0])) });
    applyStreetIndex(JSON.parse(read('assets/streets/index.json')));
    streetJobsFeature.init(engine);
    streetJobsFeature.restore({}, engine);
    for (let i = 0; i < 300 && !streetJobsFeature.streetsWalkable(g(HAYDEN_SEEK), engine); i += 1) await new Promise((r) => setTimeout(r, 10));
    await loadStreetGraph();
    graph = roadsFor(engine);
  });
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('the reported run: from Appam Almost no Groddle Meadow street is on foot, though the subway reaches them', () => {
    const walk = streetJobsFeature.streetsWalkable(g(APPAM_ALMOST), engine);
    const reach = streetJobsFeature.streetsReachable({ ...engine, streetTsid: g(APPAM_ALMOST) });
    assert.ok(walk instanceof Set && reach instanceof Set);
    const meadow = DEFAULT_DESTINATIONS.slice(0, 4).map(g);
    assert.ok(meadow.some((t) => reach.has(t)), 'reached by the subway');
    assert.ok(!meadow.some((t) => walk.has(t)), 'not on foot');
    const open = (t) => walk.has(g(t));
    assert.equal(chooseDestination(APPAM_ALMOST, { resolve: resolveIndexTsid, open, rng: () => 0 }), null, 'no run to give there');
  });

  it('each give Smuggler\'s picks are walkable, and the run\'s route there keeps to the roads', () => {
    const rides = routeRides(subwayRides(SUBWAY_STREETS), 'smuggling');
    let runs = 0;
    for (const from of SMUGGLER_STREETS) {
      const walk = streetJobsFeature.streetsWalkable(g(from), engine);
      assert.ok(walk instanceof Set, from);
      const open = (t) => walk.has(g(t));
      for (const rng of seq(30)) {
        const pick = chooseDestination(from, { resolve: resolveIndexTsid, open, rng });
        if (!pick) continue;
        runs += 1;
        assert.ok(walk.has(g(pick)), `${from} -> ${pick}`);
        const res = planRoute(createRouteState(), graph, { from: g(from), to: g(pick), source: 'smuggling', rides });
        assert.ok(res.ok && res.route.path, `${from} -> ${pick}: a road route`);
        const allRides = subwayRides(SUBWAY_STREETS);
        for (let i = 1; i < res.route.path.length; i += 1) assert.ok(!isRide(graph, allRides, res.route.path[i - 1], res.route.path[i]), `${from} -> ${pick} rides at ${i}`);
      }
    }
    assert.ok(runs > 0, 'some Smuggler has a run to give in a fresh world');
  });

  it('the feature asks for the walk from the run\'s start and the route feature drops the rides for a smuggling route', () => {
    const smug = read('js/features/smuggling-feature.js');
    assert.match(smug, /engine\.query\?\.\('streetsWalkable', start, engine\)/);
    assert.doesNotMatch(smug, /'streetsReachable'/);
    assert.match(smug, /openTest\(engine, state\.run\.from\)/);
    assert.match(smug, /if \(!destination && open\) return false;/);
    assert.match(smug, /SMUGGLER\.hitW \/ 2 \+ 20 && !nowhereToGo\(engine\)\) \{/, 'no walkable run: the Smuggler stays hidden');
    const routes = read('js/features/map-routes-feature.js');
    assert.match(routes, /rides: ridesFor\(engine, opts\.source \|\| 'player'\)/);
    assert.match(routes, /const ridesFor = \(engine, source\) => routeRides\(rides, source, gateFor\(engine\)\);/);
    assert.equal((routes.match(/rides: ridesNow\(engine\)/g) || []).length, 3, 'both replans and the route card (legStep, #538)');
  });
});
