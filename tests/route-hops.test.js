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

import { SIGN_ARMS, createRouteState, doorToward, findRoute, isRide, planRoute, routeGraph, signpostToward, subwayRides } from '../public/js/map-routes.js?v=52140ba2';
import { SUBWAY_STREETS, closedStreets, initializeStreetJobs, normalizeStreetJobState } from '../public/js/street-jobs.js?v=76471e42';
import { stationByTsid } from '../public/js/subway.js?v=ea6921ff';
import { reachRoutes, reachStreet, streetTargets } from '../public/js/builder/reach-graph.js?v=687006d3';
import { pickSignHop } from '../public/js/features/map-routes-feature.js?v=54390eef';
import { postReachY } from '../public/js/street-model.js?v=a9a05f9d';
import { applyWorld } from '../public/js/street-jobs-mp.js?v=1ccfc0c0';
import { streetGraph } from '../public/js/street-graph.js?v=d767f3a2';
import { SIGN_MAX_ARMS } from '../public/js/street-render.js?v=c3c73838';
import { obtainableItems } from '../tools/job-obtainable.mjs';

const root = join(import.meta.dirname, '..');
const PUB = join(root, 'public');
const json = (rel) => JSON.parse(readFileSync(join(PUB, rel), 'utf8'));
const index = json('assets/streets/index.json');
const catalog = json('assets/content/street-jobs.json');
const GRAPH_JSON = json('assets/content/signpost-graph.json');
const { graph, locked, keyOf } = routeGraph(GRAPH_JSON);
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

  it('a locked door only with its key, and only when nothing else gets there, the subway included', () => {
    const held = (g) => streetGraph(g, { keys: [1] });
    const g = { a: ['b', 'c'], b: ['d'], c: [], d: [] };
    const rides = { a: ['c'], c: ['a', 'd'], d: ['c'] };
    const keyed = { 'b>d': 1 };
    // No ride offered and no other road: the door, with its key.
    assert.deepEqual(findRoute(held(g), 'a', 'd', { locked: keyed }), ['a', 'b', 'd']);
    // Without the key: no way (Austin 2026-11-25).
    assert.equal(findRoute(g, 'a', 'd', { locked: keyed }), null);
    // A ride gets there with no key: the ride, though the door is fewer hops.
    assert.deepEqual(findRoute(held({ a: ['b'], b: ['d'], c: [], d: [] }), 'a', 'd', { locked: keyed, rides }), ['a', 'c', 'd']);
    // A road beats the ride, as before.
    assert.deepEqual(findRoute(held({ a: ['d', 'b'], b: ['d'], c: [], d: [] }), 'a', 'd', { locked: keyed, rides }), ['a', 'd']);
    // The ride and the door both: the door is still there when nothing else is, with its key.
    assert.deepEqual(findRoute(held({ a: ['b'], b: ['e'], e: ['f'], c: [], d: [], f: [] }), 'a', 'f', { locked: { 'b>e': 1 }, rides }), ['a', 'b', 'e', 'f']);
  });
});

describe("Austin's route: Thicket to Hazy Gate 3 (Set a destination on the Map)", () => {
  const shut = () => shutIn(fresh());
  const route = () => findRoute(streetGraph(graph, { closed: shut() }), THICKET, HAZY_GATE_3, { locked, rides: RIDES });

  it('a fresh world rides the subway to Onto Parada and walks the roads opened from the start', () => {
    assert.deepEqual(route().map(label), ['Thicket', "Pasha's Place", 'Groddle Forest Junction', 'Onto Parada', 'Konemaen Jaunt', 'Simo Steer', 'Kala Close', 'Shinso Ello', 'Ramyeon Kon', 'Teobocci Shasha', 'Glutton Greens', 'Shim Shiri', 'Yellow Yawning', 'Hazy Gate 3']);
    assert.ok(findRoute(streetGraph(graph, { closed: shut(), locked: keyOf, keys: [7] }), THICKET, HAZY_GATE_3).includes(OPPIDAN), 'without the subway only Level 2 West\'s locked door gets there, with its key');
    assert.equal(findRoute(streetGraph(graph, { closed: shut() }), THICKET, HAZY_GATE_3, { locked: keyOf }), null, 'and with no key, no way (Austin 2026-11-25)');
    const res = planRoute(createRouteState(), streetGraph(graph, { closed: shut() }), { from: THICKET, to: HAZY_GATE_3, locked, rides: RIDES });
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
    assert.match(feature, /if \(placeTransportGlow\(engine, next, key\)\) return;\n\s+if \(underground\(engine\)\) \{\n\s+placeSubwayGlow\(engine, next, key\);\n\s+return;\n\s+\}\n\s+if \(isRide\(roads\(engine\), ridesNow\(engine\), routeStreet\(engine\), next\) && placeSubwayGlow\(engine, next, key\)\) return;\n\s+if \(placeSignGlow\(engine, next, key\)\) return;/);
    // #480: a smuggling route drops the rides; R24: so does any route the gate would refuse (subway.js gateFor).
    assert.match(feature, /const ridesNow = \(engine\) => ridesFor\(engine, state\.route\?\.source\);/);
    assert.match(feature, /rides: ridesFor\(engine, opts\.source \|\| 'player'\),/);
    // #500: the route's own hop through a post still travels at once (no walk first: armWhenThere is the world click's).
    assert.match(feature, /if \(engine\.travel\) engine\.travel\(step\.next, \{ label: c\.label \|\| label\(step\.next\), arrive: c\.arrive \}\);/);
    assert.doesNotMatch(feature, /armWhenThere/);
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
      const path = findRoute(streetGraph(graph, { closed: shut }), HOME, to, { locked });
      if (!path) continue;
      routes += 1;
      assertWalkable(path, `to ${label(to)}`);
    }
    assert.ok(routes >= 60, `${routes} routes`);
  });
});

describe('#516: two posts to one neighbour, the GPS walks to the one on your floor (pickSignHop)', () => {
  // Strucote Stacks to Northwest Passage: the walk went to the first post in the file, a floor
  // below the player, and ended under it. Every pair is checked from every way into its street.
  const pairs = [];
  for (const t of Object.keys(index.streets)) {
    const s = street(t);
    const by = new Map();
    for (const p of s.signposts || []) {
      if (p.hidden) continue;
      for (const c of (p.connects || []).filter((c) => c && !c.hidden)) by.set(c.tsid.slice(1), [...(by.get(c.tsid.slice(1)) || []), p.id]);
    }
    for (const [to, ids] of by) if (ids.length > 1) pairs.push({ t, to, ids });
  }
  /** Where each street's arrivals set you down (every visible board into it). */
  const arrivals = new Map();
  for (const t of Object.keys(index.streets)) {
    for (const p of street(t).signposts || []) {
      if (p.hidden) continue;
      for (const c of p.connects || []) {
        if (!c?.arrive || c.hidden) continue;
        const list = arrivals.get(c.tsid.slice(1)) || [];
        if (!list.some((a) => a.x === c.arrive.x && a.y === c.arrive.y)) list.push({ x: c.arrive.x, y: c.arrive.y, from: label(t) });
        arrivals.set(c.tsid.slice(1), list);
      }
    }
  }
  const postsOf = (t, ids) => {
    const targets = streetTargets(street(t));
    return ids.map((id) => targets.find((g) => g.id === id));
  };

  it('24 such pairs on 15 streets', () => {
    assert.equal(pairs.length, 24);
    assert.equal(new Set(pairs.map((p) => p.t)).size, 15);
  });

  it('standing by either post, the GPS picks that post', () => {
    for (const { t, to, ids } of pairs) {
      const posts = postsOf(t, ids);
      posts.forEach((p, i) => {
        for (const dx of [-300, 0, 300]) assert.equal(pickSignHop(posts, { x: p.x + dx, y: p.y }), i, `${label(t)} to ${to}: by ${ids[i]}`);
      });
    }
  });

  it('from every arrival on those streets, the picked post can be reached, and it is the one on your floor when there is one', () => {
    let firstWasWrong = 0;
    let reachable = 0;
    for (const t of new Set(pairs.map((p) => p.t))) {
      const ins = arrivals.get(t.slice(1)) || [];
      const reach = reachStreet(street(t), ins);
      ins.forEach((at, a) => {
        for (const { to, ids } of pairs.filter((p) => p.t === t)) {
          const posts = postsOf(t, ids);
          const i = pickSignHop(posts, at);
          const what = `${label(t)} from ${at.from} (${at.x},${at.y}) to ${to}: ${ids[i]}`;
          const reached = (id) => reach.targets.find((g) => g.id === id)?.reachedFrom[a];
          if (ids.some(reached)) {
            assert.ok(reached(ids[i]), `${what} can be reached`);
            reachable += 1;
          }
          const onFloor = posts.map((p) => postReachY(p.y, p.h, at.y));
          if (onFloor.some(Boolean)) assert.ok(onFloor[i], `${what} is on the arrival's floor`);
          if (onFloor.some(Boolean) && !onFloor[0]) firstWasWrong += 1;
        }
      });
    }
    assert.ok(reachable >= 60, `${reachable} arrivals with a post they can reach`);
    assert.ok(firstWasWrong >= 10, `the first post in the file was a floor away ${firstWasWrong} times`);
  });

  it('Strucote Stacks from Northwest Passage (upper floor): back by the upper post, signpost_6', () => {
    const t = pairs.find((p) => label(p.t) === 'Strucote Stacks' && label(`G${p.to}`) === 'Northwest Passage');
    assert.deepEqual(t.ids, ['signpost_2', 'signpost_6']);
    const posts = postsOf(t.t, t.ids);
    assert.equal(pickSignHop(posts, { x: 3750, y: 631 }), 1);
    assert.equal(pickSignHop(posts, { x: 3700, y: 1275 }), 0, 'the ground floor keeps signpost_2');
  });

  it('a post below beats one above when neither is on your floor (you can drop, not always climb)', () => {
    const posts = [{ x: 0, y: 200, h: 200 }, { x: 0, y: 1400, h: 200 }];
    assert.equal(pickSignHop(posts, { x: 0, y: 700 }), 1);
    assert.equal(pickSignHop(posts, { x: 0, y: 2000 }), 1, 'both above: the nearer');
    assert.equal(pickSignHop([posts[0]], { x: 0, y: 2000 }), 0);
    assert.equal(pickSignHop([], { x: 0, y: 0 }), -1);
    assert.equal(pickSignHop(posts, null), 0, 'no avatar: the first, as the client');
  });
});
