/**
 * R24: a Map route rides the subway only when the gate would let this player through. A player
 * in Kaavin Kit asked the Map for the way back to Groddle Forest; it routed her by subway, and the
 * gate turned her back for want of Your Papers (js/subway.js gateRefusal). Glitch's routes never
 * rode the subway (a remake addition, Austin 2026-11-03); the gate's rule is Glitch's
 * (items/subway_gate.js push: the you_have_papers badge first, then the dont_get_caught buff).
 * The gate and the route planner now ask one function (subway.js gateFor), the route plans again
 * when the answer changes, and where only the subway gets there the Map says where papers come from.
 * Run: node --test tests/subway-gate-routes-r24.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTE_TEXT, createRouteState, isRide, planRoute, routeGraph, routeRides, subwayRides } from '../public/js/map-routes.js?v=084dc311';
import { SUBWAY_STREETS } from '../public/js/street-jobs.js?v=e175c7e5';
import { DUBIOUS_BUFF, PAPERS_BADGE, TEXT, gateFor, gateRefusal, gateTerms } from '../public/js/subway.js?v=ea6921ff';
import { mapRoutesFeature } from '../public/js/features/map-routes-feature.js?v=49887e5c';
import { createFeatureHost } from '../public/js/feature-host.js?v=100f3193';
import { applyStreetIndex } from '../public/js/street-loader.js?v=b8ea30df';

const PUB = join(import.meta.dirname, '..', 'public');
const json = (rel) => JSON.parse(readFileSync(join(PUB, rel), 'utf8'));
const read = (rel) => readFileSync(join(PUB, rel), 'utf8');
const INDEX = json('assets/streets/index.json');
const GRAPH_JSON = json('assets/content/signpost-graph.json');
const { graph } = routeGraph(GRAPH_JSON);
const RIDES = subwayRides(SUBWAY_STREETS);
const byLabel = (l) => Object.keys(INDEX.streets).find((t) => INDEX.streets[t].label === l);
const KAAVIN_KIT = byLabel('Kaavin Kit');
const MIDDLE_ARBOR = byLabel('Middle Arbor');
const rideLegs = (path, g = graph) => (path || []).filter((t, i) => i > 0 && isRide(g, RIDES, path[i - 1], t)).length;
const PAPERS_ONLY = `${ROUTE_TEXT.subwayPapers} ${TEXT.papersAtHall}`;

describe('R24 the gate and the route planner ask one rule', () => {
  it('gateFor is the gate\'s refusal for this player: papers first, then the dubious buff', () => {
    assert.equal(gateFor({}).code, 'papers');
    assert.equal(gateFor({ unlockedAchievements: [PAPERS_BADGE] }), null);
    assert.equal(gateFor({ unlockedAchievements: [PAPERS_BADGE], hasBuff: (id) => id === DUBIOUS_BUFF }).code, 'dubious');
    assert.deepEqual(gateTerms({ unlockedAchievements: [PAPERS_BADGE] }), { hasPapers: true, dubious: false });
    assert.deepEqual(gateFor({ unlockedAchievements: [] }), gateRefusal({ hasPapers: false }));
  });

  it('the gate and the routes both read gateFor', () => {
    assert.match(read('js/features/subway-feature.js'), /const refusal = gateFor\(engine\);/);
    const routes = read('js/features/map-routes-feature.js');
    assert.match(routes, /const ridesFor = \(engine, source\) => routeRides\(rides, source, gateFor\(engine\)\);/);
    assert.doesNotMatch(routes, /\{ rides, oneWay/, 'no route with every ride whatever the gate says');
    assert.match(read('js/features/street-jobs-feature.js'), /const papers = gateTerms\(engine\)\.hasPapers;/);
  });

  it('no papers (or the dubious buff): no rides; papers: rides', () => {
    assert.equal(routeRides(RIDES, 'player', gateRefusal({ hasPapers: false })), null);
    assert.equal(routeRides(RIDES, 'player', gateRefusal({ hasPapers: true, dubious: true })), null);
    assert.equal(routeRides(RIDES, 'player', gateRefusal({ hasPapers: true })), RIDES);
    assert.equal(routeRides(RIDES, 'smuggling', null), null, '#480 still');
  });

  it('only the subway gets there and the gate refuses: the Map says so instead of a route', () => {
    const toy = { GA: ['GB'], GB: ['GA'], GD: [] };
    const rides = subwayRides(['GA', 'GD']);
    const refused = { rides, text: PAPERS_ONLY };
    const res = planRoute(createRouteState(), toy, { from: 'GA', to: 'GD', rides: null, refused });
    assert.equal(res.ok, false);
    assert.equal(res.subway, true);
    assert.equal(res.error, 'The only way there is the subway, and the gate needs your papers. You can get Your Papers at the Bureaucratic Hall on Gregarious Grange.');
    assert.doesNotMatch(res.error, /—/);
    // A road there: it walks, whatever the gate says.
    assert.deepEqual(planRoute(createRouteState(), toy, { from: 'GA', to: 'GB', rides: null, refused }).route.path, ['GA', 'GB']);
    // Papers: the ride.
    assert.deepEqual(planRoute(createRouteState(), toy, { from: 'GA', to: 'GD', rides }).route.path, ['GA', 'GD']);
  });
});

describe('R24 the route feature (Kaavin Kit to Groddle Forest)', () => {
  let engine;
  let log;
  let now = 10000;
  const tick = () => mapRoutesFeature.onTick(16, (now += 500), engine);
  before(() => {
    applyStreetIndex(INDEX);
    createFeatureHost([mapRoutesFeature]);
  });
  beforeEach(() => {
    mapRoutesFeature._reset();
    mapRoutesFeature._setGraph(GRAPH_JSON);
    mapRoutesFeature._setOneWay(null);
    log = { toasts: [] };
    const data = {};
    const buffs = new Set();
    engine = {
      started: true,
      unlockedAchievements: [],
      inv: {},
      hasBuff: (id) => buffs.has(id),
      buffs,
      streetTsid: KAAVIN_KIT,
      data,
      interactables: [],
      setData: (k, v) => { data[k] = v; },
      save() {},
      toast: (t) => log.toasts.push(t),
      homeContext: () => ({ inHome: false }),
      transientInstance: () => false,
      questState: { active: {} },
      query: () => null,
    };
  });
  after(() => {
    mapRoutesFeature._reset();
    mapRoutesFeature._setGraph(null);
  });

  it('with all roads open the ride is shorter, so with papers the route rides', () => {
    engine.unlockedAchievements = [PAPERS_BADGE];
    const res = mapRoutesFeature.mapRoute('set', { to: MIDDLE_ARBOR, source: 'player' }, engine);
    assert.equal(res.ok, true);
    assert.ok(rideLegs(res.route.path) >= 1, res.route.path.join('>'));
  });

  it('no papers: the route walks, no ride legs', () => {
    const res = mapRoutesFeature.mapRoute('set', { to: MIDDLE_ARBOR, source: 'player' }, engine);
    assert.equal(res.ok, true);
    assert.equal(rideLegs(res.route.path), 0, res.route.path.join('>'));
    assert.equal(res.route.path.at(-1), MIDDLE_ARBOR);
  });

  it('carrying contraband (the dubious buff), even with papers: no ride legs', () => {
    engine.unlockedAchievements = [PAPERS_BADGE];
    engine.buffs.add(DUBIOUS_BUFF);
    const res = mapRoutesFeature.mapRoute('set', { to: MIDDLE_ARBOR, source: 'player' }, engine);
    assert.equal(rideLegs(res.route.path), 0);
  });

  it('the vendor finder\'s nearest asks the same rule', () => {
    const walk = mapRoutesFeature.mapRoute('find', { to: [MIDDLE_ARBOR] }, engine);
    engine.unlockedAchievements = [PAPERS_BADGE];
    const ride = mapRoutesFeature.mapRoute('find', { to: [MIDDLE_ARBOR] }, engine);
    assert.ok(walk.hops > ride.hops, `${walk.hops} walked, ${ride.hops} with the subway`);
  });

  it('a route that rides plans again on foot when the papers are gone (a save from before), and rides again with them', () => {
    engine.unlockedAchievements = [PAPERS_BADGE];
    mapRoutesFeature.mapRoute('set', { to: MIDDLE_ARBOR, source: 'player' }, engine);
    tick();
    assert.ok(rideLegs(mapRoutesFeature._state().route.path) >= 1);
    engine.unlockedAchievements = [];
    tick();
    assert.equal(rideLegs(mapRoutesFeature._state().route.path), 0);
    assert.equal(engine.data.routeGate, 'papers:replanned');
    engine.unlockedAchievements = [PAPERS_BADGE];
    tick();
    assert.ok(rideLegs(mapRoutesFeature._state().route.path) >= 1);
    assert.equal(engine.data.routeGate, 'open:replanned');
  });

  it('no road there without the subway and no papers: the papers message, and no route', () => {
    const [a, b] = SUBWAY_STREETS;
    mapRoutesFeature._setGraph({ [a]: [], [b]: [] });
    engine.streetTsid = a;
    const res = mapRoutesFeature.mapRoute('set', { to: b, source: 'player' }, engine);
    assert.equal(res.ok, false);
    assert.equal(res.error, PAPERS_ONLY);
    assert.equal(mapRoutesFeature._state().route, null);
    // A Card-Carrying Qualification already earned: the gate's own next step (subway.js papersHint).
    engine.unlockedAchievements = ['card_carrying_qualification'];
    engine.inv = { your_papers: 1 };
    assert.equal(mapRoutesFeature.mapRoute('set', { to: b, source: 'player' }, engine).error, `${ROUTE_TEXT.subwayPapers} ${TEXT.papersIncomplete}`);
    // The dubious buff says why in its own words.
    engine.unlockedAchievements = [PAPERS_BADGE];
    engine.buffs.add(DUBIOUS_BUFF);
    assert.equal(mapRoutesFeature.mapRoute('set', { to: b, source: 'player' }, engine).error, ROUTE_TEXT.subwayDubious);
    engine.buffs.clear();
    const ok = mapRoutesFeature.mapRoute('set', { to: b, source: 'player' }, engine);
    assert.deepEqual(ok.route.path, [a, b]);
    // Papers lost with that route set: the Map says so and the route goes.
    tick();
    engine.unlockedAchievements = [];
    tick();
    assert.equal(mapRoutesFeature._state().route, null);
    assert.equal(engine.data.routeGate, 'papers:subway-only');
    assert.equal(log.toasts.at(-1), PAPERS_ONLY);
  });
});
