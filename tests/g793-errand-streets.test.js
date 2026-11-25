/**
 * G793: no errand sends you to a street no road reaches yet. Glitch had every street open; the
 * remake keeps street-project streets closed in a fresh world. The quests hold (js/quest-reach.js,
 * "On hold") and the smuggler's Contraband picks only streets you can reach (9819580e63, v0.32.0,
 * tests/smuggling-open-streets.test.js). The other street-picking errands, checked here:
 *  - the Funpickle's Broken Teleporter (features/funpickle-feature.js, teleportation_random_teleport):
 *    it asked the travel gate without saying it was a teleport, so a closed street passed the pick
 *    and the jump was then refused; it skips them now, as Glitch skipped a job-locked street
 *    (players/inc_teleportation.js 574 jobs_is_street_locked);
 *  - Notice the Unnoticeable's haunts (js/ghost-quest.js: streetsReachable), Ancestral Nostalgia's
 *    boot street (features/juju-bandits-feature.js: openForEveryone), the lonely Street Spirit
 *    (features/spirit-loneliness-feature.js: spirits you have met, routes round closed roads), and
 *    every errand that sets a map route to several streets (vendor turn-ins, the shrine and vendor
 *    finders: map-routes.js findRoute, an open one wins, G780) already ask the roads.
 *  - The AFLC Frog, the Butler, Rube and the Rook come to the street you are on; a quest room's
 *    exits and the hell quest's path are fixed by the source.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickRandomTeleport } from '../public/js/funpickle.js?v=95796317';
import { applyStreetIndex } from '../public/js/street-loader.js?v=10376267';
import { streetJobsFeature } from '../public/js/features/street-jobs-feature.js?v=d32ec0b3';

const PUB = new URL('../public/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, PUB), 'utf8');

describe('G793: the Broken Teleporter lands only on a street a road reaches', () => {
  const realFetch = globalThis.fetch;
  const engine = {
    started: true,
    mode: 'solo',
    streetTsid: 'GLI2V0UN7RD1T2J',
    questState: { active: {}, done: {} },
    param: () => null,
    setData() {},
    save() {},
    updateHud() {},
  };
  let closed = null;
  let index = null;
  before(async () => {
    globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(read(String(url).split('?')[0])) });
    index = JSON.parse(read('assets/streets/index.json'));
    applyStreetIndex(index);
    streetJobsFeature.init(engine);
    streetJobsFeature.restore({}, engine);
    for (let i = 0; i < 300 && !closed?.length; i += 1) {
      closed = streetJobsFeature.closedRoads(engine);
      if (!closed?.length) await new Promise((r) => setTimeout(r, 10));
    }
  });
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('the gate refuses a closed street only when it is told the way is a teleport', () => {
    const shut = closed.find((t) => index.streets[t]);
    assert.ok(shut, 'a fresh world has closed streets');
    assert.equal(streetJobsFeature.travelGate(shut, engine, {}), null);
    assert.equal(streetJobsFeature.travelGate(shut, engine, { via: 'teleport' })?.ok, false);
  });

  it('with the teleport gate, every random pick is an open street', () => {
    const shut = new Set(closed);
    const ok = (t) => t !== engine.streetTsid && streetJobsFeature.travelGate(t, engine, { via: 'teleport' })?.ok !== false;
    let n = 0;
    for (let i = 0; i < 60; i += 1) {
      let s = i + 1;
      const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const t = pickRandomTeleport(index.streets, rng, ok);
      if (!t) continue;
      n += 1;
      assert.ok(!shut.has(t), t);
    }
    assert.ok(n > 30);
  });

  it('the feature asks the gate as a teleport', () => {
    const src = read('js/features/funpickle-feature.js');
    assert.match(src, /engine\.travelGate\?\.\(t, \{ via: 'teleport' \}\)\?\.ok !== false/);
  });
});

describe('G793: the other street-picking errands already ask the roads', () => {
  it('Contraband, the haunts, the nostalgia boot street, the lonely spirit, map routes', () => {
    // #480: Contraband asks the roads on foot from the run's start (streetsWalkable: closed roads closed, no subway or Teleporter).
    assert.match(read('js/features/smuggling-feature.js'), /engine\.query\?\.\('streetsWalkable', start, engine\)/);
    assert.match(read('game.js'), /reachable: features\.query\('streetsReachable', engine\) \|\| null/);
    assert.match(read('js/features/juju-bandits-feature.js'), /engine\.query\?\.\('openForEveryone', engine\)/);
    // R11 (G969): the lonely spirit and map routes walk the street graph, which holds the closed roads.
    assert.match(read('js/features/spirit-loneliness-feature.js'), /routeDistances\(roadsFor\(engine\), from\)/);
    assert.match(read('js/features/map-routes-feature.js'), /const roads = \(engine\) => roadsFor\(engine\);/);
    assert.match(read('js/street-graph.js'), /engine\.query\?\.\('closedRoads', engine\)/);
  });
});
