/**
 * One-way roads (player report 82): tools/routes/build-one-way.mjs finds the signposts a player
 * cannot reach from where another signpost drops them, and js/map-routes.js findRoute keeps
 * routes off them. The Other Drop only goes down: from its floor, Eastern Approach's signpost is
 * 1,100 px up with no ladder, yet 975 destinations routed that way.
 */
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createRouteState,
  enterStreet,
  findRoute,
  floorBeneath,
  oneWayRoads,
  routeGraph,
  startCut,
  subwayRides,
} from '../public/js/map-routes.js?v=c7e7dc80';
import { SUBWAY_STREETS } from '../public/js/street-jobs.js?v=ba02a385';
import { mapRoutesFeature } from '../public/js/features/map-routes-feature.js?v=9dba0500';
import { createFeatureHost } from '../public/js/feature-host.js?v=06bb8b74';
import { applyStreetIndex } from '../public/js/street-loader.js?v=18b181ad';
import { buildOneWay } from '../tools/routes/build-one-way.mjs';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(spike, 'public');
const read = (p) => readFileSync(p, 'utf8');
const INDEX = JSON.parse(read(join(PUBLIC, 'assets/streets/index.json')));
const GRAPH_JSON = JSON.parse(read(join(PUBLIC, 'assets/content/signpost-graph.json')));
const ONE_WAY_JSON = JSON.parse(read(join(PUBLIC, 'assets/content/one-way-roads.json')));
const { graph: GRAPH, locked: LOCKED } = routeGraph(GRAPH_JSON);
const ONE_WAY = oneWayRoads(ONE_WAY_JSON);
const RIDES = subwayRides(SUBWAY_STREETS);
const street = (tsid) => JSON.parse(read(join(PUBLIC, INDEX.streets[tsid].file)));

const OTHER_DROP = 'GLI1D5DO1671QPA';
const EASTERN_APPROACH = 'GIF2IUQJQ571TFL';
const LEVEL_4_EAST = 'GLI1D2QFT571VQT';
const ARJUN_PLUNGE = 'GA91JU4QQ712DJN';
const FOLLYBOTTOM = 'GCR101SU5VL1P09';
const DROP = street(OTHER_DROP);
/** Street coordinates: the floor (report 82's player stood at screen y 3867, street y 1867) and the top ledge. */
const BOTTOM = { x: -800, y: 1867 };
const TOP = { x: -845, y: -1708 };
const toScreen = (p) => ({ x: p.x - DROP.bounds.l, y: p.y - DROP.bounds.t });

describe('report 82: tools/routes/build-one-way.mjs', () => {
  let built;
  before(() => {
    built = buildOneWay();
  });

  it('one-way-roads.json is current (--check)', () => {
    const out = execFileSync(process.execPath, [join(spike, 'tools/routes/build-one-way.mjs'), '--check'], { encoding: 'utf8', stdio: 'pipe' });
    assert.match(out, /one-way roads current: \d+ streets read, 1 with roads out of reach/);
  });

  it('finds one street with one-way roads: The Other Drop, up to Eastern Approach from either floor signpost', () => {
    assert.deepEqual(Object.keys(built.result), [OTHER_DROP]);
    assert.deepEqual(ONE_WAY_JSON.streets[OTHER_DROP].cut, { [ARJUN_PLUNGE]: [EASTERN_APPROACH], [LEVEL_4_EAST]: [EASTERN_APPROACH] });
    // Dropped in at the top from Eastern Approach, every signpost is in reach.
    assert.equal(ONE_WAY_JSON.streets[OTHER_DROP].cut[EASTERN_APPROACH], undefined);
    assert.deepEqual(Object.keys(ONE_WAY_JSON.streets[OTHER_DROP].reach), [EASTERN_APPROACH]);
  });

  it('reads the street the way the data says: no ladders, and its floor far under the next ledge', () => {
    assert.equal(DROP.stats.ladderCount, 0);
    assert.equal((DROP.walls || []).length, 0);
    const ys = DROP.platforms.flatMap((p) => [p.y1, p.y2]).filter((y) => y < 1700).sort((a, b) => b - a);
    assert.ok(1712 - ys[0] > 1000, `the next floor up is ${1712 - ys[0]} px above the floor`);
  });

  it('swimming streets are two-way (their strokes climb without end), and so are streets with location events', () => {
    // Agni Abyss and Hetuhila (Jal / Samudra) were false alarms in a sweep with a plain jump.
    assert.ok(built.verdicts.some((v) => v.startsWith('GUV1RBFLU8A3LR9 ') && /swimming, two-way/.test(v)));
    assert.ok(built.verdicts.some((v) => v.startsWith('GUVSBGGQCHC386B ') && /swimming, two-way/.test(v)));
    assert.ok(built.verdicts.some((v) => v.startsWith('GA9TCL1H7LD37DC ') && /location events, two-way/.test(v)), 'Bilicious Blues');
  });

  it('the other streets a rough sweep flagged stay two-way at the best jump there is (a running Big \'Un Triple Jump)', () => {
    // The Drop, Larceny Ladder, Mada Tamaha, Guillermo Gamera Way, Ruta Asuncion.
    for (const tsid of ['GHH12E1QP611OPA', 'GCR12SD8J4K1PCV', 'GA524M0OMOE2OGT', 'GM4109NI2R640', 'GM410TMR0S2S1']) {
      assert.equal(built.result[tsid], undefined, INDEX.streets[tsid].label);
    }
    // With a plain jump The Drop's 390 px rise would cut Level 3 West too: a doubt keeps it two-way.
    const plain = buildOneWay({ jump: 1 });
    assert.ok(plain.result.GHH12E1QP611OPA?.cut, 'The Drop is one-way for a plain jump');
  });
});

describe('report 82: where you stand on The Other Drop', () => {
  it('floorBeneath finds the floor under a point, startCut the roads out of reach from it', () => {
    const floor = floorBeneath(DROP.platforms, BOTTOM.x, BOTTOM.y);
    assert.ok(floor);
    assert.ok(!ONE_WAY[OTHER_DROP].reach[EASTERN_APPROACH].includes(floor));
    assert.deepEqual(startCut(ONE_WAY[OTHER_DROP], DROP.platforms, BOTTOM.x, BOTTOM.y), [EASTERN_APPROACH]);
    assert.deepEqual(startCut(ONE_WAY[OTHER_DROP], DROP.platforms, TOP.x, TOP.y), []);
    // Falling from the top: the floor you will land on.
    assert.deepEqual(startCut(ONE_WAY[OTHER_DROP], DROP.platforms, BOTTOM.x, 1500), [EASTERN_APPROACH]);
    // Nothing known: two-way.
    assert.deepEqual(startCut(undefined, DROP.platforms, BOTTOM.x, BOTTOM.y), []);
    assert.deepEqual(startCut(ONE_WAY[OTHER_DROP], DROP.platforms, NaN, BOTTOM.y), []);
  });
});

describe('report 82: findRoute', () => {
  const opts = { locked: LOCKED, rides: RIDES, oneWay: ONE_WAY };
  const cutBottom = startCut(ONE_WAY[OTHER_DROP], DROP.platforms, BOTTOM.x, BOTTOM.y);

  it('from the floor of The Other Drop no route goes up, and every destination that routed before still routes', () => {
    let before = 0;
    let up = 0;
    for (const to of Object.keys(GRAPH)) {
      if (to === OTHER_DROP) continue;
      const old = findRoute(GRAPH, OTHER_DROP, to, { locked: LOCKED, rides: RIDES });
      if (!old) continue;
      before++;
      if (old[1] === EASTERN_APPROACH) up++;
      const path = findRoute(GRAPH, OTHER_DROP, to, { ...opts, startCut: cutBottom });
      assert.ok(path, `${INDEX.streets[to]?.label || to} no longer routes`);
      assert.notEqual(path[1], EASTERN_APPROACH, INDEX.streets[to]?.label || to);
      assert.equal(new Set(path).size, path.length, 'a street once per route');
    }
    assert.ok(before > 1300, `${before} destinations`);
    assert.ok(up > 900, `${up} went up before`);
  });

  it('the report: the way to Follybottom Stritt from the floor goes through Level 4 East, not Eastern Approach', () => {
    assert.equal(findRoute(GRAPH, OTHER_DROP, FOLLYBOTTOM, { locked: LOCKED, rides: RIDES })[1], EASTERN_APPROACH, 'before');
    const path = findRoute(GRAPH, OTHER_DROP, FOLLYBOTTOM, { ...opts, startCut: cutBottom });
    assert.equal(path[1], LEVEL_4_EAST);
    assert.equal(path.at(-1), FOLLYBOTTOM);
  });

  it('from the top ledge, or with no position, Eastern Approach is one signpost away', () => {
    assert.deepEqual(findRoute(GRAPH, OTHER_DROP, EASTERN_APPROACH, { ...opts, startCut: [] }), [OTHER_DROP, EASTERN_APPROACH]);
    assert.deepEqual(findRoute(GRAPH, OTHER_DROP, EASTERN_APPROACH, opts), [OTHER_DROP, EASTERN_APPROACH]);
  });

  it('passing through: down The Other Drop from Eastern Approach, never up it from Level 4 East or Arjun Plunge', () => {
    assert.deepEqual(findRoute(GRAPH, EASTERN_APPROACH, LEVEL_4_EAST, opts), [EASTERN_APPROACH, OTHER_DROP, LEVEL_4_EAST]);
    for (const from of [LEVEL_4_EAST, ARJUN_PLUNGE]) {
      const path = findRoute(GRAPH, from, EASTERN_APPROACH, opts);
      assert.ok(path);
      const i = path.indexOf(OTHER_DROP);
      assert.ok(i < 0 || path[i + 1] !== EASTERN_APPROACH, path.join(' > '));
    }
  });

  it('every cut road can still be reached another way from where the cut leaves you', () => {
    for (const [tsid, entry] of Object.entries(ONE_WAY)) {
      for (const [from, list] of Object.entries(entry.cut)) {
        for (const to of list) {
          assert.ok(findRoute(GRAPH, tsid, to, { ...opts, startCut: list }), `${tsid}: from ${from} to ${to}`);
        }
      }
    }
  });

  it('no route anywhere takes a cut road', () => {
    const keys = Object.keys(GRAPH);
    for (let i = 0; i < keys.length; i += 17) {
      for (const to of [EASTERN_APPROACH, 'GLI2V0UN7RD1T2J', FOLLYBOTTOM]) {
        const path = findRoute(GRAPH, keys[i], to, opts);
        if (!path) continue;
        for (let k = 1; k + 1 < path.length; k++) {
          assert.ok(!ONE_WAY[path[k]]?.cut?.[path[k - 1]]?.includes(path[k + 1]), path.join(' > '));
        }
      }
    }
  });

  it('a subway ride or a door into a one-way street is an arrival the file does not know: two-way', () => {
    const toy = { A: ['D'], D: ['A', 'B', 'T'], B: ['D'], T: ['D'] };
    const ways = { D: { cut: { A: ['T'] }, reach: {} } };
    assert.deepEqual(findRoute(toy, 'A', 'T', { oneWay: ways }), null, 'in from A, T is out of reach');
    assert.deepEqual(findRoute(toy, 'B', 'T', { oneWay: ways }), ['B', 'D', 'T']);
    assert.deepEqual(findRoute({ ...toy, A: [] }, 'A', 'T', { oneWay: ways, rides: { A: ['D'] } }), ['A', 'D', 'T'], 'a ride in from A');
  });
});

describe('report 82: enterStreet and the feature', () => {
  it('a route saved before one-way roads were known is planned again on the floor', () => {
    const route = { destination: FOLLYBOTTOM, path: [ARJUN_PLUNGE, OTHER_DROP, EASTERN_APPROACH, 'GLI32G3NUTD100I', FOLLYBOTTOM], source: 'player', setAt: 1 };
    const state = { ...createRouteState(), route };
    const cut = startCut(ONE_WAY[OTHER_DROP], DROP.platforms, BOTTOM.x, BOTTOM.y);
    const res = enterStreet(state, GRAPH, OTHER_DROP, { locked: LOCKED, rides: RIDES, oneWay: ONE_WAY, startCut: cut });
    assert.deepEqual(res.events, ['rerouted']);
    assert.equal(res.state.route.path[1], LEVEL_4_EAST);
    // At the top it is still the way.
    const top = enterStreet(state, GRAPH, OTHER_DROP, { locked: LOCKED, rides: RIDES, oneWay: ONE_WAY, startCut: [] });
    assert.deepEqual(top.events, []);
  });

  function engineOn(at) {
    const data = {};
    const screen = toScreen(at);
    let host = null;
    const engine = {
      started: true,
      streetTsid: OTHER_DROP,
      player: { x: screen.x, y: screen.y, vx: 0, vy: 0 },
      signViews: [],
      interactables: [],
      data,
      param: () => null,
      setData: (k, v) => { data[k] = v; },
      save() {},
      homeContext: () => ({ inHome: false }),
      transientInstance: () => false,
      pushActivity() {},
      query: (hook, ...args) => host.query(hook, ...args),
    };
    host = createFeatureHost([mapRoutesFeature]);
    return engine;
  }

  beforeEach(() => {
    applyStreetIndex(INDEX);
    mapRoutesFeature._reset();
    mapRoutesFeature._setGraph(GRAPH_JSON);
    mapRoutesFeature._setOneWay(ONE_WAY_JSON);
  });

  it('Set a destination on the floor of The Other Drop: Next is Level 4 East; on the top ledge: Eastern Approach', () => {
    const low = engineOn(BOTTOM);
    mapRoutesFeature.onStreetEnter(DROP, low);
    const res = mapRoutesFeature.mapRoute('set', { to: FOLLYBOTTOM, source: 'player' }, low);
    assert.equal(res.ok, true);
    assert.equal(res.route.path[1], LEVEL_4_EAST);
    assert.equal(low.data.routeNext, 'Level 4 East');

    mapRoutesFeature._reset();
    const high = engineOn(TOP);
    mapRoutesFeature.onStreetEnter(DROP, high);
    const up = mapRoutesFeature.mapRoute('set', { to: FOLLYBOTTOM, source: 'player' }, high);
    assert.equal(up.route.path[1], EASTERN_APPROACH);
  });

  /** Fall from where the engine stands to `at`: a few frames in the air, then on the floor there. */
  function fallTo(engine, at, frames = 30) {
    const s = toScreen(at);
    Object.assign(engine.player, { onGround: false, airFrames: frames });
    mapRoutesFeature.onTick(16, 1000, engine);
    Object.assign(engine.player, { x: s.x, y: s.y, onGround: true, airFrames: 0 });
    mapRoutesFeature.onTick(16, 1016, engine);
  }

  it('a fall from the top ledge to the floor plans the route again: Next goes from Eastern Approach to Level 4 East', () => {
    const engine = engineOn(TOP);
    engine.player.onGround = true;
    mapRoutesFeature.onStreetEnter(DROP, engine);
    const set = mapRoutesFeature.mapRoute('set', { to: FOLLYBOTTOM, source: 'player' }, engine);
    assert.equal(set.route.path[1], EASTERN_APPROACH);
    assert.equal(engine.data.routeNext, 'Eastern Approach');
    // A hop on the ledge lands where Eastern Approach is still in reach: the route stays.
    fallTo(engine, TOP);
    assert.equal(engine.data.routeNext, 'Eastern Approach');
    assert.equal(mapRoutesFeature._state().route.path[1], EASTERN_APPROACH);
    fallTo(engine, BOTTOM);
    assert.equal(engine.data.routeLast, 'landed:rerouted');
    assert.equal(mapRoutesFeature._state().route.path[1], LEVEL_4_EAST);
    assert.equal(mapRoutesFeature._state().route.destination, FOLLYBOTTOM);
    assert.equal(engine.data.routeNext, 'Level 4 East');
  });

  it('only a real landing re-plans: a slope flicker (3 frames off the floor or fewer) and standing still do not', () => {
    const engine = engineOn(TOP);
    engine.player.onGround = true;
    mapRoutesFeature.onStreetEnter(DROP, engine);
    mapRoutesFeature.mapRoute('set', { to: FOLLYBOTTOM, source: 'player' }, engine);
    // Moved to the floor without a fall (a teleport within the street): no landing, no re-plan.
    Object.assign(engine.player, toScreen(BOTTOM));
    for (let i = 0; i < 5; i++) mapRoutesFeature.onTick(16, 1000 + i * 16, engine);
    assert.equal(mapRoutesFeature._state().route.path[1], EASTERN_APPROACH);
    fallTo(engine, BOTTOM, 3);
    assert.equal(mapRoutesFeature._state().route.path[1], EASTERN_APPROACH);
    fallTo(engine, BOTTOM, 4);
    assert.equal(mapRoutesFeature._state().route.path[1], LEVEL_4_EAST);
  });

  it('on a two-way street a landing never looks at where you stand', () => {
    const engine = engineOn(BOTTOM);
    // The street after Eastern Approach on the way to Follybottom Stritt: two-way.
    engine.streetTsid = 'GLI32G3NUTD100I';
    mapRoutesFeature.onStreetEnter(street(engine.streetTsid), engine);
    mapRoutesFeature.mapRoute('set', { to: FOLLYBOTTOM, source: 'player' }, engine);
    const before = JSON.stringify(mapRoutesFeature._state().route);
    assert.ok(mapRoutesFeature._state().route);
    let reads = 0;
    const real = engine.player;
    engine.player = new Proxy(real, { get: (t, k) => { if (k === 'x' || k === 'y') reads++; return t[k]; } });
    fallTo(engine, BOTTOM);
    assert.equal(JSON.stringify(mapRoutesFeature._state().route), before);
    assert.equal(engine.data.routeLast?.startsWith('landed:') ?? false, false);
    assert.equal(reads, 0, 'no floor lookup off the one-way streets');
  });

  it('fetches one-way-roads.json with the graph, and without it every road is two-way', () => {
    const feature = read(join(PUBLIC, 'js/features/map-routes-feature.js'));
    assert.match(feature, /const ONE_WAY_URL = 'assets\/content\/one-way-roads\.json';/);
    mapRoutesFeature._setOneWay(null);
    const low = engineOn(BOTTOM);
    mapRoutesFeature.onStreetEnter(DROP, low);
    assert.equal(mapRoutesFeature.mapRoute('set', { to: FOLLYBOTTOM, source: 'player' }, low).route.path[1], EASTERN_APPROACH);
  });
});
