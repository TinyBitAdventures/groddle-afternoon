/**
 * Austin's ruling 2026-11-11 ("Pick only open streets"): a player got Contraband for Soggy Bottoms
 * (East Spice's give Smuggler, contraband.js destinations), a street no project has built yet. Glitch
 * had every street open; the remake keeps 684 street-project streets closed in a fresh world, and 47
 * of the map's 49 destinations stand on them. Now the pick takes only streets the player can reach
 * (street-jobs-feature streetsReachable, else closedRoads), falls back to open defaults, and a run
 * already bound for a closed street (an older save) moves to an open one and says so.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CONTRABAND,
  DEFAULT_DESTINATIONS,
  DESTINATIONS,
  SMUGGLER_STREETS,
  SMUGGLING_QUEST,
  TEXT,
  chooseDestination,
  redirectDestination,
  sourceKey,
} from '../public/js/smuggling.js?v=ab6ee12a';
import { applyStreetIndex, resolveIndexTsid } from '../public/js/street-loader.js?v=18b181ad';
import { streetJobsFeature } from '../public/js/features/street-jobs-feature.js?v=d64e99e7';
import { smugglingFeature } from '../public/js/features/smuggling-feature.js?v=b0763a5f';
import { createInventory, addItem } from '../public/js/inventory.js?v=f49c8998';

const PUB = join(import.meta.dirname, '..', 'public');
const read = (rel) => readFileSync(join(PUB, rel), 'utf8');
const EAST_SPICE = 'LM413SQ6LRN58';
const SOGGY_BOTTOMS = 'LTJ11KEKAKO196V';
const HECHEY = 'LLI2V0UN7RD1T2J';
const seq = (n) => Array.from({ length: n }, (_, i) => () => (i + 0.5) / n);

describe('smuggling destinations: only open streets (pure)', () => {
  it('Soggy Bottoms is East Spice\'s first destination (the reported parcel)', () => {
    assert.equal(DESTINATIONS[EAST_SPICE][0], SOGGY_BOTTOMS);
  });

  it('picks an open street from the start\'s list when one is open', () => {
    const openOne = DESTINATIONS[EAST_SPICE][3];
    for (const rng of seq(20)) {
      assert.equal(chooseDestination(EAST_SPICE, { open: (t) => t === openOne || DEFAULT_DESTINATIONS.includes(t), rng }), openOne);
    }
  });

  it('falls back to open defaults when the start\'s whole list is closed', () => {
    const open = (t) => !DESTINATIONS[EAST_SPICE].includes(t);
    for (const rng of seq(50)) {
      const pick = chooseDestination(EAST_SPICE, { open, rng });
      assert.ok(DEFAULT_DESTINATIONS.includes(pick) && open(pick), pick);
      assert.notEqual(pick, SOGGY_BOTTOMS);
    }
  });

  it('keeps the source pick only when nothing at all is open, and with no test changes nothing', () => {
    assert.ok(DESTINATIONS[EAST_SPICE].includes(chooseDestination(EAST_SPICE, { open: () => false, rng: () => 0 })));
    assert.equal(chooseDestination(EAST_SPICE, { rng: () => 0 }), SOGGY_BOTTOMS);
  });

  it('redirects a run bound for a closed street, and leaves an open or unknown one alone', () => {
    const run = { from: EAST_SPICE, destination: SOGGY_BOTTOMS };
    const open = (t) => t === HECHEY;
    assert.equal(redirectDestination(run, { open, rng: () => 0 }), HECHEY);
    assert.equal(redirectDestination(run, { open: null }), null, 'reach unknown: the run stands');
    assert.equal(redirectDestination({ ...run, destination: HECHEY }, { open }), null, 'already open');
    assert.equal(redirectDestination(run, { open: () => false }), null, 'nowhere open: it waits');
    assert.doesNotMatch(TEXT.redirected('Soggy Bottoms', 'Hechey Track'), /—|–/);
  });
});

describe('smuggling destinations: a fresh world', () => {
  const realFetch = globalThis.fetch;
  let reach = null;
  let closed = null;
  const engine = {
    mode: 'solo',
    streetTsid: `G${EAST_SPICE.slice(1)}`,
    questState: { active: {}, done: {} },
    param: () => null,
    setData() {},
    save() {},
    updateHud() {},
  };
  const has = (t) => reach.has(`G${sourceKey(t).slice(1)}`);

  before(async () => {
    globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(read(String(url).split('?')[0])) });
    applyStreetIndex(JSON.parse(read('assets/streets/index.json')));
    streetJobsFeature.init(engine);
    streetJobsFeature.restore({}, engine);
    for (let i = 0; i < 300 && !reach; i += 1) {
      reach = streetJobsFeature.streetsReachable(engine);
      if (!reach) await new Promise((r) => setTimeout(r, 10));
    }
    closed = new Set(streetJobsFeature.closedRoads(engine));
  });
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('Soggy Bottoms is closed in a fresh world, so the reported parcel could not be delivered', () => {
    assert.ok(reach instanceof Set);
    assert.ok(closed.has(`G${SOGGY_BOTTOMS.slice(1)}`));
    assert.ok(!has(SOGGY_BOTTOMS));
  });

  it('every give Smuggler now hands out a street the player can reach', () => {
    for (const from of SMUGGLER_STREETS) {
      for (const rng of seq(40)) {
        const pick = chooseDestination(from, { resolve: resolveIndexTsid, open: has, rng });
        assert.ok(pick && has(pick), `${from} -> ${pick}`);
      }
    }
  });

  it('the feature: an older save carrying Contraband to Soggy Bottoms moves to an open street and says so', () => {
    const activity = [];
    const routes = [];
    const inv = createInventory();
    addItem(inv, CONTRABAND, 1);
    const qs = { active: { [SMUGGLING_QUEST]: { progress: {} } }, done: {} };
    const game = {
      ...engine,
      questState: qs,
      inv,
      player: { x: 0, y: 0, onGround: true },
      pushActivity: (t) => activity.push(t),
      query: (hook, ...args) => {
        if (hook === 'streetsReachable') return streetJobsFeature.streetsReachable(game);
        if (hook === 'closedRoads') return streetJobsFeature.closedRoads(game);
        if (hook === 'mapRoute') {
          if (args[0] === 'get') return { source: 'smuggling', path: null };
          routes.push(args[1]);
        }
        return null;
      },
    };
    smugglingFeature._reset();
    smugglingFeature.restore({ run: { from: EAST_SPICE, destination: SOGGY_BOTTOMS, startedAt: 1 } });
    smugglingFeature.onTick(16, Date.now(), game);
    const dest = smugglingFeature._state().state.run.destination;
    assert.notEqual(dest, SOGGY_BOTTOMS);
    assert.ok(has(dest), dest);
    assert.equal(activity.length, 1);
    assert.match(activity[0], /^Change of plans: the road to Soggy Bottoms isn't built yet, so your contact will meet you on .+ instead\.$/);
    assert.deepEqual(routes.map((r) => r.to), [dest], 'the map route follows the new destination');
    // Once open, it stays put.
    smugglingFeature.onTick(16, Date.now() + 5000, game);
    assert.equal(smugglingFeature._state().state.run.destination, dest);
    assert.equal(activity.length, 1);
    smugglingFeature._reset();
  });
});
