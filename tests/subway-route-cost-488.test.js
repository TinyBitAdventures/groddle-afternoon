/**
 * #488 (G1002, Austin 2026-11-18): a route rides the subway when walking would take more than
 * SUBWAY_RIDE_STREETS (5, a tunable guess) streets longer than the walk the ride leaves; a short
 * walk still beats a ride. Replaces the 2026-11-03 rule (the subway only when no road gets there),
 * which sent a route from Chakra Phool to Torpan Cleft (Alakol) 19 streets round by Groddle Meadow
 * once Chakra Phool's roads were built. Smuggling routes still never ride (#480, routeRides); the
 * gate still asks for Your Papers (js/subway.js gateRefusal).
 * Run: node --test tests/subway-route-cost-488.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUBWAY_RIDE_STREETS, findRoute, loadStreetGraph, roadsFor, streetGraph, worldRoads } from '../public/js/street-graph.js?v=d767f3a2';
import { createRouteState, isRide, planRoute, routeRides, subwayRides } from '../public/js/map-routes.js?v=52140ba2';
import { SUBWAY_STREETS } from '../public/js/street-jobs.js?v=76471e42';
import { applyStreetIndex } from '../public/js/street-loader.js?v=10376267';
import { streetJobsFeature } from '../public/js/features/street-jobs-feature.js?v=782d36a0';
import { gateRefusal } from '../public/js/subway.js?v=ea6921ff';

const PUB = join(import.meta.dirname, '..', 'public');
const read = (rel) => readFileSync(join(PUB, rel), 'utf8');
const line = (n) => Array.from({ length: n }, (_, i) => `G${String.fromCharCode(65 + i)}`);

/** A straight road of `n` streets, its ends also subway stops. */
function toy(n) {
  const s = line(n);
  const roads = Object.fromEntries(s.map((t, i) => [t, [s[i - 1], s[i + 1]].filter(Boolean)]));
  return { roads, ends: [s[0], s[n - 1]], rides: subwayRides([s[0], s[n - 1]]) };
}

describe('#488 a ride costs SUBWAY_RIDE_STREETS streets', () => {
  it('is one named guess of 5, marked as ours', () => {
    assert.equal(SUBWAY_RIDE_STREETS, 5);
    assert.match(read('js/street-graph.js'), /A tunable guess, ours: Glitch found its paths in the\s*\n \* game server \(apiFindGlobalPathX\), whose weights are lost\.\s*\n \*\/\s*\nexport const SUBWAY_RIDE_STREETS = 5;/);
  });

  it('walks up to 5 streets (a tie walks), rides past that', () => {
    for (const [walk, rides] of [[3, false], [5, false], [6, true], [12, true]]) {
      const { roads, ends, rides: r } = toy(walk + 1);
      const path = findRoute(roads, ends[0], ends[1], { rides: r });
      assert.equal(path.length === 2, rides, `walk ${walk}: ${path.join('>')}`);
    }
  });

  it('counts the walk the ride leaves: it rides only when that and the ride come to less than the walk', () => {
    // GA..GJ a road of 10; the subway from GA to GG.
    const s = line(10);
    const roads = Object.fromEntries(s.map((t, i) => [t, [s[i - 1], s[i + 1]].filter(Boolean)]));
    const rides = subwayRides(['GA', 'GG']);
    assert.deepEqual(findRoute(roads, 'GA', 'GJ', { rides }), ['GA', 'GG', 'GH', 'GI', 'GJ']); // 9 walked vs 5 + 3
    assert.deepEqual(findRoute(roads, 'GA', 'GF', { rides }), ['GA', 'GB', 'GC', 'GD', 'GE', 'GF']); // 5 walked vs 5 + 1
  });

  it('no rides: the shortest walk, as before; a smuggling route has none', () => {
    const { roads, ends, rides } = toy(10);
    assert.equal(findRoute(roads, ends[0], ends[1]).length, 10);
    assert.equal(findRoute(roads, ends[0], ends[1], { rides: routeRides(rides, 'smuggling') }).length, 10);
    assert.equal(findRoute(roads, ends[0], ends[1], { rides: routeRides(rides, 'player') }).length, 2);
  });

  it('a locked door is still the last resort: a ride, even a long one, comes first', () => {
    const roads = { GA: ['GB', 'GX'], GB: ['GA', 'GC'], GC: ['GB'], GX: ['GA', 'GY'], GY: ['GX', 'GZ'], GZ: ['GY'] };
    const g = streetGraph({ streets: roads, doors: {}, doorKeys: {} }, { keys: [7] });
    const locked = { 'GA>GX': 7 };
    const rides = subwayRides(['GC', 'GZ']);
    assert.deepEqual(findRoute(g, 'GA', 'GZ', { locked, rides }), ['GA', 'GB', 'GC', 'GZ']);
    assert.deepEqual(findRoute(g, 'GA', 'GZ', { locked }), ['GA', 'GX', 'GY', 'GZ']);
    // Austin 2026-11-25: without the key, no ride and no door.
    assert.equal(findRoute(streetGraph({ streets: roads, doors: {}, doorKeys: {} }), 'GA', 'GZ', { locked }), null);
  });

  it('papers are still the gate\'s', () => {
    assert.equal(gateRefusal({ hasPapers: false }).code, 'papers');
  });
});

describe('#488 the reported route (Chakra Phool to Torpan Cleft, Alakol)', () => {
  const TORPAN_CLEFT = 'GCR241CP4Q129I1';
  const PIELIS_PASS = 'GTJ1057EEQU17G1';
  const JUTUAN_CENTRAL = SUBWAY_STREETS.find((t) => JSON.parse(read('assets/streets/index.json')).streets[t]?.label === 'Jutuan Central');
  const realFetch = globalThis.fetch;
  const engine = {
    mode: 'solo',
    streetTsid: PIELIS_PASS,
    questState: { active: {}, done: {} },
    param: () => null,
    setData() {},
    save() {},
    updateHud() {},
    query: (hook) => (hook === 'closedRoads' ? streetJobsFeature.closedRoads(engine) : null),
  };
  const rides = subwayRides(SUBWAY_STREETS);
  let fresh = null;
  let built = null;
  const rode = (g, path) => path.some((t, i) => i > 0 && isRide(g, rides, path[i - 1], t));

  before(async () => {
    globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(read(String(url).split('?')[0])) });
    applyStreetIndex(JSON.parse(read('assets/streets/index.json')));
    streetJobsFeature.init(engine);
    streetJobsFeature.restore({}, engine);
    for (let i = 0; i < 300 && !streetJobsFeature.streetsWalkable(JUTUAN_CENTRAL, engine); i += 1) await new Promise((r) => setTimeout(r, 10));
    await loadStreetGraph();
    fresh = roadsFor(engine);
    // The reporter's world: Chakra Phool's roads built (no street under construction).
    built = streetGraph(worldRoads(), {});
  });
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('a fresh world: from Jutuan Central the route rides to Torpan Cleft', () => {
    const res = planRoute(createRouteState(), fresh, { from: JUTUAN_CENTRAL, to: TORPAN_CLEFT, source: 'player', rides });
    assert.ok(res.ok && res.route.path, res.error);
    assert.ok(rode(fresh, res.route.path), res.route.path.join('>'));
    assert.equal(res.route.path.length, 2);
  });

  it('roads built: from Pielis Pass it rides from Jutuan Central, where the 2026-11-03 rule walked 19 streets', () => {
    const walk = findRoute(built, PIELIS_PASS, TORPAN_CLEFT);
    assert.ok(walk.length - 1 >= 19, `walk ${walk.length - 1}`);
    const res = planRoute(createRouteState(), built, { from: PIELIS_PASS, to: TORPAN_CLEFT, source: 'player', rides });
    assert.ok(res.ok && res.route.path, res.error);
    assert.ok(rode(built, res.route.path), res.route.path.join('>'));
    assert.ok(res.route.path.includes(JUTUAN_CENTRAL));
    assert.ok(res.route.path.length <= 5, res.route.path.join('>'));
    // A smuggling run keeps to the roads (#480).
    const smug = planRoute(createRouteState(), built, { from: PIELIS_PASS, to: TORPAN_CLEFT, source: 'smuggling', rides: routeRides(rides, 'smuggling') });
    assert.deepEqual(smug.route.path, walk);
  });

  it('a short walk still beats a ride: Groddle Forest Junction to Eastern Approach (3) and Gregarious Grange (5, a tie)', () => {
    const idx = JSON.parse(read('assets/streets/index.json')).streets;
    const at = (label) => SUBWAY_STREETS.find((t) => idx[t]?.label === label);
    for (const [to, n] of [['Eastern Approach', 3], ['Gregarious Grange', 5]]) {
      const path = findRoute(fresh, at('Groddle Forest Junction'), at(to), { rides });
      assert.equal(path.length - 1, n, path.join('>'));
      assert.equal(rode(fresh, path), false, to);
    }
  });
});
