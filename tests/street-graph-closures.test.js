/**
 * Root R11, register G969 (Austin 2026-11-17): closed roads are part of the street graph itself.
 * There was one closed-street list but every walker applied it on its own: three took it as an
 * optional argument (map-routes findRoute `blocked`, quest-reach reachableStreets `shut`, the
 * lonely spirit's pathLengths `closed`, which its QA path left out) and one ignored it (the
 * Contraband's routeTo), so each feature learned the rule when a player hit it (#145, #162, #339,
 * #355; G579, G618, G653, G645, G573, G761, G780, G793, G818, G887). Glitch hid a closed street's
 * signpost arms and locked its doors (locations/inc_jobs.js jobs_modify_connections), so its path
 * finding never saw one.
 *
 * This test fails when game code walks the raw signpost graph, builds a graph without closures,
 * hands a walker closures beside the graph, or walks every road (built or not) from a module that
 * has no reason to.
 * Run: node --test tests/street-graph-closures.test.js
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  _useStreetGraph,
  closedOnTheWay,
  fewestClosures,
  findRoute,
  hopsOverEveryRoad,
  isClosed,
  nearestOpenStreet,
  openRoads,
  reachableStreets,
  roadsFor,
  routeDistances,
  streetGraph,
  streetsLeadingTo,
  worldRoads,
} from '../public/js/street-graph.js?v=16013e6e';
import { createRouteState, enterStreet, planRoute, routeStep } from '../public/js/map-routes.js?v=e9f5e3da';

const root = join(import.meta.dirname, '..');
const PUB = join(root, 'public');

/** Every game script: public/game.js and public/js/** (no vendored code, no generated key table). */
function gameSources() {
  const out = [['game.js', readFileSync(join(PUB, 'game.js'), 'utf8')]];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== 'vendor') walk(full);
      } else if (/\.m?js$/.test(name)) out.push([relative(PUB, full), readFileSync(full, 'utf8')]);
    }
  };
  walk(join(PUB, 'js'));
  return out.filter(([rel]) => rel !== 'js/data-versions.js');
}
/** Code without comments, so a doc comment may name what the code may not do. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const SOURCES = gameSources().map(([rel, src]) => [rel, code(src)]);
const OWNER = 'js/street-graph.js';

/** Files that call `name(` (not a definition, not an import list). */
function callers(name) {
  const call = new RegExp(`(?<![\\w.])${name}\\(`);
  const def = new RegExp(`function\\s+${name}\\(|const\\s+${name}\\s*=`);
  return SOURCES.filter(([rel, src]) => rel !== OWNER && call.test(src.replace(new RegExp(def.source, 'g'), ''))).map(([rel]) => rel).sort();
}

// A toy world: A - B - C, and a longer way A - D - E - C round B; a door from E into F.
const TOY = { streets: { GA: ['GB', 'GD'], GB: ['GA', 'GC'], GC: ['GB', 'GE'], GD: ['GA', 'GE'], GE: ['GD', 'GC'], GF: ['GE'] }, doors: { GE: ['GF'] } };

describe('R11: game code walks streets only through the street graph', () => {
  it('only js/street-graph.js names or fetches the signpost graph', () => {
    const hits = SOURCES.filter(([rel, src]) => rel !== OWNER && /signpost-graph(\.json)?['"`?]/.test(src)).map(([rel]) => rel);
    assert.deepEqual(hits, [], 'fetch the street graph with loadStreetGraph / loadRoadsFor, never the JSON itself');
  });

  it('no game code reads raw adjacency (graph[street], graph.streets, graph.doors) or joins the JSON itself', () => {
    const raw = /\bgraph\??\.?\[|\bgraph\??\.(streets|doors|doorKeys)\b|\.streets\[at\]|\.doors\?*\.\[at\]/;
    const hits = SOURCES.filter(([rel, src]) => rel !== OWNER && raw.test(src)).map(([rel]) => rel);
    assert.deepEqual(hits, [], 'ask the street graph (openRoads, findRoute, reachableStreets, routeDistances)');
    assert.deepEqual(callers('routeGraph'), [], 'routeGraph is the street graph\'s own join');
    assert.deepEqual(callers('doorRooms'), [], 'the rooms come with the street graph (graph.rooms)');
  });

  it('every street graph game code builds carries its closures', () => {
    const bare = [];
    for (const [rel, src] of SOURCES) {
      if (rel === OWNER) continue;
      for (const m of src.matchAll(/(?<![\w.])streetGraph\(([^;]*?)\)/g)) if (!/closed:/.test(m[1])) bare.push(`${rel}: ${m[0]}`);
    }
    assert.deepEqual(bare, [], 'streetGraph(source, { closed }) in game code, or roadsFor(engine)');
    // The test hook that swaps the game's graph is only ever a feature's _setGraph.
    for (const rel of callers('_useStreetGraph')) assert.match(SOURCES.find(([r]) => r === rel)[1], /_setGraph\(g\) \{\n\s+_useStreetGraph\(g\);/, rel);
  });

  it('no walker is handed closed roads beside the graph', () => {
    const loose = [];
    const walkers = ['findRoute', 'planRoute', 'enterStreet', 'reachableStreets', 'routeDistances', 'fewestClosures', 'closedOnTheWay', 'nearestOpenStreet'];
    for (const [rel, src] of SOURCES) {
      for (const w of walkers) {
        for (const m of src.matchAll(new RegExp(`(?<![\\w.])${w}\\(([^;]*)`, 'g'))) if (/\b(blocked|shut):/.test(m[1])) loose.push(`${rel}: ${w}`);
      }
    }
    assert.deepEqual(loose, []);
    // And at run time the walkers refuse them.
    const g = streetGraph(TOY);
    assert.throws(() => findRoute(g, 'GA', 'GC', { blocked: ['GB'] }), /closed roads live in the street graph/);
    assert.throws(() => reachableStreets(g, { starts: ['GA'], shut: ['GB'] }), /closed roads live in the street graph/);
    assert.throws(() => planRoute(createRouteState(), g, { from: 'GA', to: 'GC', blocked: ['GB'] }), /closed roads live in the street graph/);
  });

  it('the retired walkers are gone (each walked the graph with or without the closures by choice)', () => {
    const gone = [
      ['js/smuggling.js', /export function routeTo\(/],
      ['js/quest-reach.js', /function (reachableStreets|nearestReached|closuresInTheWay)\(/],
      ['js/features/spirit-loneliness-feature.js', /function closedSet\(|closed\.has\(next\)/],
      ['js/features/newxp-feature.js', /queue\.push|EXIT_GRAPH_URL/],
      ['js/street-jobs.js', /deque/],
      ['js/street-jobs-solo.js', /queue/],
      ['js/quest-instance.js', /queue/],
      ['js/map-routes.js', /function bfs\(|queue/],
    ];
    for (const [rel, re] of gone) assert.doesNotMatch(SOURCES.find(([r]) => r === rel)[1], re, rel);
  });

  it('walks that count every road, built or not, are called only where that is the point', () => {
    // Which projects to build on the way (the way home, ticket 50 and #162; the On hold note); the
    // Map's "No road there yet". The Ancestral Lands kick no longer walks to the open street nearest
    // its pick (report 212): it picks among the open ones or lands on the starter street (R11).
    assert.deepEqual(callers('fewestClosures'), ['js/features/street-jobs-feature.js', 'js/street-jobs.js']);
    assert.deepEqual(callers('nearestOpenStreet'), []);
    assert.deepEqual(callers('closedOnTheWay'), ['js/map-routes.js']);
    // The world's geography: the solo distance curve (#425) and the dead ends (G887, G888).
    assert.deepEqual(callers('hopsOverEveryRoad'), ['js/street-jobs-solo.js']);
    assert.deepEqual(callers('hopsFromStart'), ['js/features/street-jobs-feature.js']);
    assert.deepEqual(callers('streetsLeadingTo'), ['js/quest-instance.js']);
    assert.deepEqual(callers('streetsReachingUr'), ['js/dead-ends.js', 'js/features/quest-instances-feature.js']);
    assert.deepEqual(callers('urReach'), ['js/features/dead-ends-feature.js']);
    // The graph with no closures: those walks, the Map's rooms list, and the closures' owner.
    assert.deepEqual(callers('worldRoads'), [
      'js/features/dead-ends-feature.js',
      'js/features/map-routes-feature.js',
      'js/features/quest-instances-feature.js',
      'js/features/street-jobs-feature.js',
    ]);
    const jobs = SOURCES.find(([r]) => r === 'js/features/street-jobs-feature.js')[1];
    assert.match(jobs, /streetGraph\(roads, \{ closed: closedNowHere \}\)/, 'street jobs gives the graph its own closures');
    assert.match(SOURCES.find(([r]) => r === 'js/features/map-routes-feature.js')[1], /return \(worldRoads\(\)\?\.rooms \|\| \[\]\)/);
  });

  it('the features that walk streets ask the street graph for routes, reach and distances', () => {
    const uses = {
      'js/features/map-routes-feature.js': /const roads = \(engine\) => roadsFor\(engine\);/,
      'js/features/smuggling-feature.js': /const graph = roadsFor\(engine\);[\s\S]*return findRoute\(graph, from, to\);/,
      'js/features/spirit-loneliness-feature.js': /routeDistances\(roadsFor\(engine\), from\)/,
      'js/features/newxp-feature.js': /const graph = await loadRoadsFor\(engine\);/,
      'js/features/street-jobs-feature.js': /reachableStreets\(waysReady\.graph, \{ free: waysReady\.free, starts \}\)/,
    };
    for (const [rel, re] of Object.entries(uses)) assert.match(SOURCES.find(([r]) => r === rel)[1], re, rel);
  });
});

describe('R11: every walk sees the closures without being asked', () => {
  const g = streetGraph(TOY, { closed: ['GB'] });

  it('routes go round a closed street and never end on one', () => {
    assert.deepEqual(findRoute(streetGraph(TOY), 'GA', 'GC'), ['GA', 'GB', 'GC'], 'open: the short way');
    assert.deepEqual(findRoute(g, 'GA', 'GC'), ['GA', 'GD', 'GE', 'GC']);
    assert.equal(findRoute(g, 'GA', 'GB'), null);
    assert.deepEqual(findRoute(g, 'GA', ['GB', 'GE']), ['GA', 'GD', 'GE'], 'the nearest open one of several');
    assert.equal(findRoute(g, 'LA', 'LC').length, 4, 'either TSID form');
  });

  it('the Map plans, reroutes and steps on the graph\'s closures (autopilot follows the same path)', () => {
    const res = planRoute(createRouteState(), g, { from: 'GA', to: 'GC' });
    assert.deepEqual(res.route.path, ['GA', 'GD', 'GE', 'GC']);
    const shut = planRoute(createRouteState(), g, { from: 'GA', to: 'GB' });
    assert.equal(shut.ok, false);
    assert.equal(shut.error, 'No road there yet');
    const through = planRoute(createRouteState(), streetGraph(TOY, { closed: ['GB', 'GE'] }), { from: 'GA', to: 'GC' });
    assert.deepEqual(through.through, ['GB'], 'which street is still being built on the way');
    // Off the path on B's far side: the reroute from C to A goes round B too.
    const off = enterStreet({ route: { destination: 'GA', path: ['GX', 'GA'] } }, g, 'GC');
    assert.deepEqual(off.state.route.path, ['GC', 'GE', 'GD', 'GA']);
    assert.equal(routeStep(res.route, g, 'GD').next, 'GE');
  });

  it('reach, distances and the roads out leave a closed street out (doors too)', () => {
    assert.equal(reachableStreets(g, { starts: ['GA'] }).has('GB'), false);
    assert.equal(reachableStreets(g, { starts: ['GA'] }).has('GF'), true, 'through the door');
    assert.equal(reachableStreets(streetGraph(TOY, { closed: ['GF'] }), { starts: ['GA'] }).has('GF'), false, 'a door into a closed street is closed');
    assert.equal(routeDistances(g, 'GA').get('GC'), 3);
    assert.equal(routeDistances(g, 'GA').has('GB'), false);
    assert.deepEqual(openRoads(g, 'GA'), ['GD']);
    assert.equal(isClosed(g, 'LB'), true);
  });

  it('closures may be live: the graph reads them when a walk starts', () => {
    let shut = ['GB'];
    const live = streetGraph(TOY, { closed: () => shut });
    assert.equal(findRoute(live, 'GA', 'GC').length, 4);
    shut = [];
    assert.equal(findRoute(live, 'GA', 'GC').length, 3, 'built: the short way again');
  });

  it('the planners know the closures too: the fewest projects on the way, the nearest open street', () => {
    assert.deepEqual(fewestClosures(streetGraph(TOY, { closed: ['GB', 'GE'] }), { starts: ['GA'], targets: ['GC'] }), [{ street: 'GB', board: 'GA' }]);
    assert.deepEqual(fewestClosures(g, { starts: ['GA'], targets: ['GC'] }), [], 'an open way already gets there');
    const reach = reachableStreets(streetGraph(TOY, { closed: ['GD', 'GB'] }), { starts: ['GA'] });
    assert.equal(nearestOpenStreet(g, { reach, from: 'GE' }), 'GA');
    assert.deepEqual(closedOnTheWay(g, 'GA', 'GB'), { closed: true });
  });

  it('the geography walks count every road, so they never move as you build', () => {
    assert.equal(hopsOverEveryRoad(g, 'GA').GC, 2);
    assert.equal(streetsLeadingTo(g, 'GA').has('GB'), true);
  });
});

describe('R11: the game\'s graph takes each engine\'s closures', () => {
  afterEach(() => _useStreetGraph(null));

  it('roadsFor(engine) walks round what the engine\'s closedRoads says, live', () => {
    _useStreetGraph(TOY);
    let closed = ['GB'];
    const engine = { query: (hook) => (hook === 'closedRoads' ? closed : null) };
    const roads = roadsFor(engine);
    assert.deepEqual(findRoute(roads, 'GA', 'GC'), ['GA', 'GD', 'GE', 'GC']);
    closed = [];
    assert.deepEqual(findRoute(roads, 'GA', 'GC'), ['GA', 'GB', 'GC']);
    assert.equal(roadsFor(engine), roads, 'one view per engine');
    assert.equal(roadsFor(null), null, 'no engine, no graph: worldRoads() is the named way to every road');
    assert.equal(findRoute(worldRoads(), 'GA', 'GC').length, 3);
  });
});
