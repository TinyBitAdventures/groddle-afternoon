/**
 * Every hop of a Map route is one a player can take (Austin, 2026-11-03: "this path is impossible").
 * The route from Thicket to Hazy Gate 3 went Level 2 West -> Oppidan Avenue through a door that
 * needs the Yellow-Teal Square Key (key_id 7), which nothing gave then. tools/build-signpost-graph.mjs
 * leaves a door whose key nothing gives out (`sealed`, tools/job-obtainable.mjs): none since Dust
 * Traps drop Keys 7-10 and 12 (our design, js/resource-nodes.js), and a route takes a locked door only
 * when nothing else gets there, the subway included. Here every way the route graph holds is checked
 * against the street files: a visible signpost board the post draws, or a visible door with one
 * destination that opens without a key or with a key a player can get.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SIGN_ARMS, doorToward, findRoute, isRide, planRoute, createRouteState, routeGraph, signpostToward, subwayRides } from '../public/js/map-routes.js?v=c7e7dc80';
import { SUBWAY_STREETS, closedStreets, initializeStreetJobs, normalizeStreetJobState } from '../public/js/street-jobs.js?v=68562ef0';
import { stationByTsid } from '../public/js/subway.js?v=44d1a09f';
import { reachRoutes, reachStreet } from '../public/js/builder/reach-graph.js?v=22368fd6';
import { applyWorld } from '../public/js/street-jobs-mp.js?v=24a85415';
import { SIGN_MAX_ARMS } from '../public/js/street-render.js?v=881d705a';
import { obtainableItems } from '../tools/job-obtainable.mjs';

const root = join(import.meta.dirname, '..');
const PUB = join(root, 'public');
const json = (rel) => JSON.parse(readFileSync(join(PUB, rel), 'utf8'));
const index = json('assets/streets/index.json');
const catalog = json('assets/content/street-jobs.json');
const GRAPH_JSON = json('assets/content/signpost-graph.json');
const { graph, locked } = routeGraph(GRAPH_JSON);
const HOME = index.default;
const byLabel = (label) => Object.keys(index.streets).find((t) => index.streets[t].label === label);
const THICKET = byLabel('Thicket');
const HAZY_GATE_3 = byLabel('Hazy Gate 3');
const LEVEL_2_WEST = 'GHH1011JSO11ORS';
const OPPIDAN = 'GDOHDJ84BST2UI2';
const label = (t) => index.streets[t]?.label || t;
const RIDES = subwayRides(SUBWAY_STREETS);
const PUZZLES = json('assets/content/puzzle-triggers.json').streets;
/** A surface street's subway entrance: its archived door to a station (subway-feature prepareStreet). */
const entrance = (t) => (street(t).doors || []).find((d) => d?.connect && stationByTsid(d.connect.tsid || d.connect.street));

const streetCache = new Map();
const street = (t) => streetCache.get(t) || streetCache.set(t, json(index.streets[t].file)).get(t);
let have = new Set();

/** How a player takes the hop from `a` to `b`, or why not. */
function hop(a, b) {
  const s = street(a);
  if (signpostToward(s.signposts, b)) return { ok: true, by: 'sign' };
  const i = doorToward(s.doors, b);
  if (i < 0) return { ok: false, why: 'no drawn signpost board or door leads there' };
  const key = Number(s.doors[i].key_id) || 0;
  if (key && !have.has(`door_key_${key}`)) return { ok: false, why: `the door needs door_key_${key}, which nothing gives` };
  return { ok: true, by: key ? `door (key ${key})` : 'door' };
}
function assertWalkable(path, what) {
  assert.ok(path && path.length > 1, `${what}: a route`);
  for (let i = 0; i < path.length - 1; i++) {
    const h = hop(path[i], path[i + 1]);
    assert.ok(h.ok, `${what}: ${label(path[i])} -> ${label(path[i + 1])}: ${h.why}`);
  }
}
const fresh = () => {
  const state = normalizeStreetJobState({});
  initializeStreetJobs(state, [HOME]);
  return state;
};
const shutIn = (state) => new Set(closedStreets(state, catalog, { exemptFrom: [HOME] }));

before(async () => {
  have = (await obtainableItems()).items;
});

describe('every way in the route graph is one a player can take', () => {
  it('a post draws as many boards as the GPS looks at', () => {
    assert.equal(SIGN_ARMS, SIGN_MAX_ARMS);
  });

  it('every signpost and door link is a drawn board or a door that opens', () => {
    const bad = [];
    let links = 0;
    for (const [a, list] of Object.entries(graph)) {
      for (const b of list) {
        links += 1;
        const h = hop(a, b);
        if (!h.ok) bad.push(`${label(a)} -> ${label(b)}: ${h.why}`);
      }
    }
    assert.ok(links > 4800, `${links} links`);
    assert.deepEqual(bad, []);
  });

  it('every locked door has a key a player can get, so none is sealed: Level 2 West into Oppidan Avenue (Yellow-Teal Square Key)', () => {
    assert.deepEqual(GRAPH_JSON.sealed, {});
    assert.equal(GRAPH_JSON.doorKeys[`${LEVEL_2_WEST}>${OPPIDAN}`], 7);
    assert.ok(graph[LEVEL_2_WEST].includes(OPPIDAN));
    assert.equal(hop(LEVEL_2_WEST, OPPIDAN).ok, true);
    for (const [edge, key] of Object.entries(GRAPH_JSON.doorKeys)) assert.ok(have.has(`door_key_${key}`), `${edge}: key ${key} can be had`);
    assert.deepEqual([...new Set(Object.values(GRAPH_JSON.doorKeys))].sort((x, y) => x - y), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
  });

  it('a locked door only when nothing else gets there, the subway included', () => {
    const g = { a: ['b', 'c'], b: ['d'], c: [], d: [] };
    const rides = { a: ['c'], c: ['a', 'd'], d: ['c'] };
    const keyed = new Set(['b>d']);
    // No ride offered and no other road: the door.
    assert.deepEqual(findRoute(g, 'a', 'd', { locked: keyed }), ['a', 'b', 'd']);
    // A ride gets there with no key: the ride, though the door is fewer hops.
    assert.deepEqual(findRoute({ a: ['b'], b: ['d'], c: [], d: [] }, 'a', 'd', { locked: keyed, rides }), ['a', 'c', 'd']);
    // A road beats the ride, as before.
    assert.deepEqual(findRoute({ a: ['d', 'b'], b: ['d'], c: [], d: [] }, 'a', 'd', { locked: keyed, rides }), ['a', 'd']);
    // The ride and the door both: the door is still there when nothing else is.
    assert.deepEqual(findRoute({ a: ['b'], b: ['e'], e: ['f'], c: [], d: [], f: [] }, 'a', 'f', { locked: new Set(['b>e']), rides }), ['a', 'b', 'e', 'f']);
  });
});

describe("Austin's route: Thicket to Hazy Gate 3 (Set a destination on the Map)", () => {
  const shut = () => shutIn(fresh());
  const route = () => findRoute(graph, THICKET, HAZY_GATE_3, { blocked: shut(), locked, rides: RIDES });

  it('a fresh world rides the subway to Onto Parada and walks the roads opened from the start', () => {
    assert.deepEqual(route().map(label), ['Thicket', "Pasha's Place", 'Groddle Forest Junction', 'Onto Parada', 'Konemaen Jaunt', 'Simo Steer', 'Kala Close', 'Shinso Ello', 'Ramyeon Kon', 'Teobocci Shasha', 'Glutton Greens', 'Shim Shiri', 'Yellow Yawning', 'Hazy Gate 3']);
    assert.ok(findRoute(graph, THICKET, HAZY_GATE_3, { blocked: shut(), locked }).includes(OPPIDAN), 'without the subway only Level 2 West\'s locked door gets there');
    const res = planRoute(createRouteState(), graph, { from: THICKET, to: HAZY_GATE_3, blocked: shut(), locked, rides: RIDES });
    assert.equal(res.ok, true);
    assert.ok(!route().includes(OPPIDAN), 'not through Oppidan Avenue');
  });

  it('every hop is a subway ride from an entrance, or a way the GPS lights that a keyboard player can reach from where the last hop set them down', () => {
    const path = route();
    let arrive = null;
    const how = [];
    for (let i = 0; i < path.length - 1; i++) {
      const [a, b] = [path[i], path[i + 1]];
      const s = street(a);
      if (isRide(graph, RIDES, a, b)) {
        assert.ok(SUBWAY_STREETS.includes(a) && SUBWAY_STREETS.includes(b), `${label(a)} -> ${label(b)}: both subway stops`);
        assert.ok(entrance(a), `${label(a)} has its subway entrance`);
        const up = entrance(b);
        arrive = up ? { x: up.x, y: up.y } : null;
        how.push(`${label(a)} subway ${label(b)}`);
        continue;
      }
      // A Light Beam to the next street (puzzles-feature routeTo): the GPS lights it, not the post.
      const beam = (PUZZLES[a]?.triggers || []).find((t) => t.verb && t.dest === label(b));
      if (beam) {
        how.push(`${label(a)} beam ${label(b)}`);
        arrive = null;
        continue;
      }
      const h = hop(a, b);
      assert.ok(h.ok, `${label(a)} -> ${label(b)}: ${h.why}`);
      const sp = signpostToward(s.signposts, b);
      const exit = sp ? s.signposts[sp.sign] : s.doors[doorToward(s.doors, b)];
      if (arrive && !PUZZLES[a]) {
        const plan = reachRoutes(s, arrive).routes.find((r) => r.id === exit.id);
        assert.ok(plan?.steps, `${label(a)}: the way to ${label(b)} can be reached from where you come in`);
      }
      arrive = sp ? (sp && s.signposts[sp.sign].connects.filter((c) => c && !c.hidden)[sp.board]?.arrive) || null : exit.connect?.arrive || null;
      how.push(`${label(a)} ${sp ? 'sign' : 'door'} ${label(b)}`);
    }
    assert.ok(how.includes('Groddle Forest Junction subway Onto Parada'));
    assert.ok(how.includes('Shim Shiri beam Yellow Yawning'), 'Shim Shiri: the yellow Light Beam');
  });

  it("Shim Shiri's posts hang from the ceiling: no arrival reaches them, so each road on from there is its Light Beam", () => {
    const shim = byLabel('Shim Shiri');
    const s = street(shim);
    const beams = PUZZLES[shim].triggers.filter((t) => t.verb === 'beam_up');
    assert.equal(beams.length, 6);
    // Where the gut tubes set you down (Glutton Greens' gut_bottom: 3447, 0) and the floor under each beam.
    const arrivals = [{ x: 3447, y: 0 }, ...beams.map((b) => ({ x: b.x, y: b.y - 10 }))];
    const r = reachStreet(s, arrivals.map((a) => ({ ...a, from: 'x' })));
    for (const t of r.targets.filter((x) => x.kind === 'signpost')) assert.equal(t.reached, false, `${t.label}: out of reach`);
    for (const b of beams) assert.ok(graph[shim].includes(byLabel(b.dest)), `the route graph has Shim Shiri -> ${b.dest}`);
  });

  it('every verb way (a Light Beam) names a street the route graph links to, so the GPS can light it', () => {
    let n = 0;
    for (const [t, row] of Object.entries(PUZZLES)) {
      for (const tr of row.triggers || []) {
        if (!tr.verb || !tr.dest) continue;
        n += 1;
        assert.ok(graph[t]?.includes(byLabel(tr.dest)), `${label(t)} -> ${tr.dest}`);
      }
    }
    assert.equal(n, 6);
  });

  it('the GPS lights a Light Beam or a subway entrance before a post (map-routes-feature placeHighlight)', () => {
    const feature = readFileSync(join(PUB, 'js/features/map-routes-feature.js'), 'utf8');
    assert.match(feature, /if \(placeTransportGlow\(engine, next, key\)\) return;\n\s+if \(underground\(engine\)\) \{\n\s+placeSubwayGlow\(engine, next, key\);\n\s+return;\n\s+\}\n\s+if \(isRide\(graph, rides, routeStreet\(engine\), next\) && placeSubwayGlow\(engine, next, key\)\) return;\n\s+if \(placeSignGlow\(engine, next, key\)\) return;/);
    // Underground: the Red Button for a ride, the stairs once off at the route's stop.
    assert.match(feature, /const stairs = doorTargets\(engine\)\.find\(\(t\) => sameStreet\(t\.door\?\.connect\?\.street, routeStreet\(engine\)\)\);/);
    assert.match(readFileSync(join(PUB, 'js/features/puzzles-feature.js'), 'utf8'), /routeTo: t\.dest,\n\s+routeVerb: BEAM_UP_VERB,/);
  });

  it('the subway is only taken when no road gets there', () => {
    const toy = { GA: ['GB'], GB: ['GA', 'GC'], GC: ['GB'], GD: [] };
    const rides = subwayRides(['GA', 'GC', 'GD']);
    assert.deepEqual(findRoute(toy, 'GA', 'GC', { rides }), ['GA', 'GB', 'GC'], 'the road');
    assert.deepEqual(findRoute(toy, 'GA', 'GD', { rides }), ['GA', 'GD'], 'the ride');
    assert.equal(findRoute(toy, 'GA', 'GD'), null);
    assert.equal(isRide(toy, rides, 'GA', 'GD'), true);
    assert.equal(isRide(toy, rides, 'GA', 'GB'), false);
  });

  it('every street a fresh world reaches over roads has a route from the starter street that can be walked', () => {
    const shut = shutIn(fresh());
    let routes = 0;
    for (const to of Object.keys(index.streets)) {
      if (to === HOME) continue;
      const path = findRoute(graph, HOME, to, { blocked: shut, locked });
      if (!path) continue;
      routes += 1;
      assertWalkable(path, `to ${label(to)}`);
    }
    assert.ok(routes >= 60, `${routes} routes`);
  });
});
