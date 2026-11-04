/**
 * Every hop of a Map route is one a player can take (Austin, 2026-11-03: "this path is impossible").
 * The route from Thicket to Hazy Gate 3 went Level 2 West -> Oppidan Avenue through a door that
 * needs the Yellow-Teal Square Key (key_id 7). Door Keys 7-12 had no source in Glitch
 * (items/door_key_7..12.js are in no drop table, store or reward; Dust Traps drop 1-6,
 * catalog_drop_tables.js dust_trap) and have none in the remake (tools/job-obtainable.mjs), so
 * tools/build-signpost-graph.mjs leaves such doors out (`sealed`) and routes, the Map's rooms and the
 * quest hold's reachability all go without them. Here every way the route graph holds is checked
 * against the street files: a visible signpost board the post draws, or a visible door with one
 * destination that opens without a key or with a key a player can get.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SIGN_ARMS, doorToward, findRoute, planRoute, createRouteState, routeGraph, signpostToward } from '../public/js/map-routes.js?v=86a4df52';
import { closedStreets, initializeStreetJobs, normalizeStreetJobState } from '../public/js/street-jobs.js?v=7381e03e';
import { applyWorld } from '../public/js/street-jobs-mp.js?v=8fa46a7d';
import { SIGN_MAX_ARMS } from '../public/js/street-render.js?v=9349c0e5';
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

  it('a door no key opens is not a way: Level 2 West into Oppidan Avenue (Yellow-Teal Square Key)', () => {
    assert.equal(GRAPH_JSON.sealed[`${LEVEL_2_WEST}>${OPPIDAN}`], 7);
    assert.equal(graph[LEVEL_2_WEST].includes(OPPIDAN), false);
    assert.equal(hop(LEVEL_2_WEST, OPPIDAN).ok, false);
    for (const [edge, key] of Object.entries(GRAPH_JSON.sealed)) {
      assert.equal(have.has(`door_key_${key}`), false, `${edge}: key ${key} has no source`);
      const [a, b] = edge.split('>');
      assert.equal(GRAPH_JSON.doors[a]?.includes(b) || false, false, edge);
    }
    for (const [edge, key] of Object.entries(GRAPH_JSON.doorKeys)) assert.ok(have.has(`door_key_${key}`), `${edge}: key ${key} can be had`);
    assert.deepEqual([...new Set(Object.values(GRAPH_JSON.sealed))].sort((x, y) => x - y), [7, 8, 9, 10, 12]);
  });
});

describe("Austin's route: Thicket to Hazy Gate 3", () => {
  it('a fresh world has no way there yet: Path not found, and the roads still being built', () => {
    const shut = shutIn(fresh());
    assert.equal(findRoute(graph, THICKET, HAZY_GATE_3, { blocked: shut, locked }), null);
    const res = planRoute(createRouteState(), graph, { from: THICKET, to: HAZY_GATE_3, blocked: shut, locked });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'Path not found');
    assert.ok(res.through.length > 0, 'the closed roads in the way');
  });

  it('with every project built the route goes round the sealed door, and every hop can be taken', () => {
    const path = findRoute(graph, THICKET, HAZY_GATE_3, { locked });
    assert.ok(!path.includes(OPPIDAN), 'not through Oppidan Avenue');
    assertWalkable(path, 'all built');
    assert.deepEqual(path.slice(-5).map(label), ['Teobocci Shasha', 'Glutton Greens', 'Shim Shiri', 'Yellow Yawning', 'Hazy Gate 3'], 'into Moshi Moshi Oshilatis by the dinosaur door, Xalanga by Yellow Yawning');
  });

  it('once Tlemcen, Heckes and Viscid Pud stand, the walk from Somewhat Sump (a subway stop) can be taken hop by hop', () => {
    const state = fresh();
    const ids = ['163', '167', '178'];
    assert.deepEqual(ids.map((id) => catalog.jobs[id].label), ['Tlemcen', 'Heckes', 'Viscid Pud']);
    applyWorld(state, catalog, { built: Object.fromEntries(ids.map((id) => [id, { at: 5 }])) });
    const path = findRoute(graph, byLabel('Somewhat Sump'), HAZY_GATE_3, { blocked: shutIn(state), locked });
    assertWalkable(path, 'three projects built');
    assert.ok(path.includes(byLabel('Viscid Pud')) && path.includes(byLabel('Khanda Jarra')));
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
