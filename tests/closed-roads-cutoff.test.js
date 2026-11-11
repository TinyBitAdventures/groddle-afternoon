// Ticket 50 (calais, 2026-11-03): "Harbinger Health will strand you with no way to get back to the
// Subway in Somewhat Sump". Austin, the same night on Wintry Place: a closed road out of a cold street.
// A fresh world closed the road into Somewhat Sump (project 61, Build Somewhat Sump, offered on
// Harbinger Heath), but the subway still came up there: ride in, walk out, and no road led back.
// Glitch's subway ran to streets that stood (all 684 project streets are jobs_is_locked false in the
// location dump), so station streets count as built; a street you stand on opens its roads
// (noteArrival); and when closed roads further on still cut you off, the fewest of them open
// (openWayHome). Map routes never go through a closed road (js/map-routes.js findRoute).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SUBWAY_STREETS, closedStreets, initializeStreetJobs, noteArrival, normalizeStreetJobState, openWayHome, roadClosure, wayHomeTerms } from '../public/js/street-jobs.js?v=94f8d250';
import { routeGraph } from '../public/js/map-routes.js?v=c7e7dc80';
import { TELEPORTERS } from '../public/js/hidden-floors.js?v=732a2610';
import { WINTRY_PORTAL_TELEPORTERS, WINTRY_PLACE_TSID } from '../public/js/wintry-portal.js?v=1437deda';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const catalog = JSON.parse(read('public/assets/content/street-jobs.json'));
const json = JSON.parse(read('public/assets/content/signpost-graph.json'));
const index = JSON.parse(read('public/assets/streets/index.json'));
const SUMP = 'GLI57DI72HI153U';
const HEATH = 'GTJ102GGGJK1VDO';
const NEWCOT = 'GCRHJHOFQNL1PHP';
const HOME = index.default;
const opts = { exemptFrom: [HOME] };
const fresh = () => {
  const state = normalizeStreetJobState({});
  initializeStreetJobs(state, [HOME]);
  return state;
};
const locations = join(root, '../streets/mnt/stos/location_data');
const G = (t) => String(t || '').replace(/^L/, 'G');

// The feature's ways (street-jobs-feature loadWays): roads a closure holds, and ways none does.
const graph = routeGraph(json).graph;
const free = {};
for (const a of SUBWAY_STREETS) for (const b of SUBWAY_STREETS) if (a !== b) (free[a] ||= []).push(b);
for (const t of [...TELEPORTERS, ...WINTRY_PORTAL_TELEPORTERS]) (free[G(t.from)] ||= []).push(G(t.to));
const homes = [HOME, ...SUBWAY_STREETS];

function world(shut) {
  const fwd = {};
  const rev = {};
  const revFree = {};
  const link = (a, b, open) => {
    if (open) {
      (fwd[a] ||= []).push(b);
      (rev[b] ||= []).push(a);
    }
    (revFree[b] ||= []).push(a);
  };
  for (const [a, list] of Object.entries(graph)) for (const b of list) link(a, b, !shut.has(b));
  for (const [a, list] of Object.entries(free)) for (const b of list) link(a, b, true);
  const bfs = (adj, from) => {
    const seen = new Set(from);
    for (const q = [...from]; q.length;) for (const n of adj[q.shift()] || []) if (!seen.has(n)) (seen.add(n), q.push(n));
    return seen;
  };
  const reach = bfs(fwd, [HOME]);
  const back = bfs(rev, homes);
  const backFree = bfs(revFree, homes);
  // Streets a player can get to that a closure (not the map itself) cuts off from home.
  return { reach, cut: [...reach].filter((t) => backFree.has(t) && !back.has(t)) };
}

describe('ticket 50 and Wintry Place: a road closure never cuts a player off', () => {
  it('every subway street is open on a fresh world, Somewhat Sump with it', () => {
    assert.equal(SUBWAY_STREETS.length, 12);
    assert.ok(SUBWAY_STREETS.includes(SUMP));
    const state = fresh();
    const shut = new Set(closedStreets(state, catalog, opts));
    for (const t of SUBWAY_STREETS) assert.equal(shut.has(t), false, t);
    assert.equal(roadClosure(state, catalog, SUMP, [SUMP], opts), null, 'Harbinger Heath\'s road back to the Sump is open');
    assert.equal(catalog.jobs['61'].street, SUMP);
    assert.deepEqual(catalog.jobs['61'].connecting, [HEATH]);
  });

  it('a street you arrive on by any way opens its roads, once', () => {
    const state = fresh();
    const [shut] = closedStreets(state, catalog, opts);
    assert.ok(roadClosure(state, catalog, shut, [shut], opts));
    assert.equal(noteArrival(state, catalog, `L${shut.slice(1)}`, opts), true);
    assert.equal(roadClosure(state, catalog, shut, [shut], opts), null);
    assert.equal(noteArrival(state, catalog, shut, opts), false, 'once');
    assert.equal(noteArrival(state, catalog, HOME, opts), false, 'an open street changes nothing');
  });

  it('a fresh world: every station reachable, Wintry Place has its way home, nothing cut off', () => {
    const shut = new Set(closedStreets(fresh(), catalog, opts));
    const { reach, cut } = world(shut);
    for (const t of SUBWAY_STREETS) assert.ok(reach.has(t), t);
    assert.ok(shut.has(NEWCOT), 'Newcot Close is still being built');
    assert.ok(reach.has(WINTRY_PLACE_TSID), 'in by the Northwest Passage portal');
    assert.deepEqual(cut, []);
  });

  it('every closure the catalog can make on its own: a cut-off street gets its way home opened', () => {
    const jobStreets = [...new Set(Object.values(catalog.jobs).filter((j) => j.kind === 'street').map((j) => j.street))];
    let cuts = 0;
    for (const only of jobStreets) {
      const state = fresh();
      state.grandfathered.push(...jobStreets.filter((t) => t !== only));
      const shut = new Set(closedStreets(state, catalog, opts));
      if (!shut.size) continue;
      const { reach, cut } = world(shut);
      for (const t of SUBWAY_STREETS) assert.ok(reach.has(t), `${only}: station ${t}`);
      for (const here of cut) {
        cuts += 1;
        const s = structuredClone(state);
        const opened = openWayHome(s, catalog, { graph, free, here, homes, opts });
        assert.ok(opened.length, `${only}: ${here} gets a way`);
        assert.ok(!world(new Set(closedStreets(s, catalog, opts))).cut.includes(here), `${only}: ${here} home again`);
      }
    }
    // Footlands Heath, Strucote Stacks and Tower St South each cut a corner off on their own (a one-way way in).
    assert.ok(cuts > 0 && cuts < 20, `${cuts}`);
  });

  it('openWayHome opens nothing where an open way exists, and the fewest closed roads where none does', () => {
    const toy = { GA: ['GB', 'GC'], GB: ['GA', 'GH'], GC: ['GA', 'GD'], GD: ['GC', 'GH'], GH: ['GB', 'GD'] };
    const cat = { jobs: { 1: { kind: 'street', street: 'GB', connecting: ['GA'], phases: [] }, 2: { kind: 'street', street: 'GC', connecting: ['GA'], phases: [] }, 3: { kind: 'street', street: 'GD', connecting: ['GC'], phases: [] } } };
    const st = normalizeStreetJobState({ initialized: true });
    assert.deepEqual(openWayHome(st, cat, { graph: toy, here: 'GA', homes: ['GH'] }), ['GB'], 'one closure (GB), not two (GC, GD)');
    assert.deepEqual(openWayHome(st, cat, { graph: toy, here: 'GA', homes: ['GH'] }), [], 'already open');
    assert.deepEqual(openWayHome(st, cat, { graph: toy, here: 'GH', homes: ['GH'] }), []);
  });

  it('report #162: without papers the subway is no way home, and the road to the starter street opens', () => {
    // The rails among the free ways, as the feature keeps them.
    const rails = {};
    for (const a of SUBWAY_STREETS) for (const b of SUBWAY_STREETS) if (a !== b) (rails[a] ||= []).push(b);
    const rider = wayHomeTerms({ starter: HOME, free, rails, papers: true });
    assert.deepEqual(rider.homes, homes);
    assert.equal(rider.free, free);
    const walker = wayHomeTerms({ starter: HOME, free, rails, papers: false });
    assert.deepEqual(walker.homes, [HOME]);
    for (const t of SUBWAY_STREETS) assert.ok(!(walker.free[t] || []).some((to) => SUBWAY_STREETS.includes(to)), `${t}: no rails`);
    for (const t of [...TELEPORTERS, ...WINTRY_PORTAL_TELEPORTERS]) assert.ok(walker.free[G(t.from)].includes(G(t.to)), 'teleporters stay');

    // Piano Party, where the Map's puzzle card sets a player down, on a fresh world's roads.
    const PIANO = 'GA96OS42D6F3M9P';
    const walk = (state, ways) => {
      const shut = new Set(closedStreets(state, catalog, opts));
      const seen = new Set([PIANO]);
      const queue = [PIANO];
      while (queue.length) {
        const at = queue.shift();
        for (const to of [...(graph[at] || []).filter((n) => !shut.has(n)), ...(ways[at] || [])]) if (!seen.has(to)) { seen.add(to); queue.push(to); }
      }
      return seen;
    };
    assert.ok(!walk(fresh(), walker.free).has(HOME), 'cut off by road on a fresh world');
    // As it was: a way to the nearest station, which turns a player without papers back.
    const old = fresh();
    const toStation = openWayHome(old, catalog, { graph, free, here: PIANO, homes, opts });
    assert.ok(toStation.length > 0);
    assert.ok(SUBWAY_STREETS.some((t) => walk(old, walker.free).has(t)), 'a station in reach');
    assert.ok(!walk(old, walker.free).has(HOME), 'and still no road home');
    // Now: the roads on the way to the starter street open.
    const now = fresh();
    const opened = openWayHome(now, catalog, { graph, free: walker.free, here: PIANO, homes: walker.homes, opts });
    assert.ok(opened.length > 0);
    assert.ok(walk(now, walker.free).has(HOME), 'home by road');
    // With papers nothing more opens than before.
    const ridden = fresh();
    assert.deepEqual(openWayHome(ridden, catalog, { graph, free: rider.free, here: PIANO, homes: rider.homes, opts }), toStation);

    const feature = read('public/js/features/street-jobs-feature.js');
    assert.match(feature, /const papers = \(engine\.unlockedAchievements \|\| \[\]\)\.includes\(PAPERS_BADGE\);/);
    assert.match(feature, /wayHomeTerms\(\{ starter: streetIndex\?\.default, free: w\.free, rails: w\.rails, papers \}\)/);
    assert.match(feature, /openWayHome\(state, catalog, \{ graph: w\.graph, free: terms\.free, here: engine\.streetTsid, homes: terms\.homes, opts: opts\(\) \}\)/);
  });

  it('the feature keeps a way home on every arrival', () => {
    const feature = read('public/js/features/street-jobs-feature.js');
    assert.match(feature, /if \(!demo && noteArrival\(state, catalog, engine\.streetTsid, opts\(\)\)\) engine\.save\(\);\n      if \(!demo && !engine\.param\('jobdemo'\)\) keepWayHome\(engine, mine\);/);
    assert.match(feature, /for \(const t of \[\.\.\.TELEPORTERS, \.\.\.WINTRY_PORTAL_TELEPORTERS\]\) add\(g\(t\.from\), g\(t\.to\)\);/);
  });

  it('the source had Somewhat Sump built', { skip: !existsSync(locations) && 'needs the location XML beside the repo' }, () => {
    const xml = readFileSync(join(locations, 'LLI57DI72HI153U.xml'), 'utf8').split('\n');
    assert.match(xml[109], /<bool id="jobs_is_locked">false<\/bool>/);
  });
});
