/**
 * Live report 212 (2026-11-12, Friendly): "when your time runs out in ancestral lands, you get
 * sometimes placed in a region that doesn't have street projects done, and you cannot get out."
 * do_baqala_boot (GSJS players/inc_special_locations.js 199-226) picks one of 26 streets in Kajuu,
 * Andra, Tamila and Besara; every one of them is a street project, so on a fresh world all 26 sit
 * past roads still being built. The kick now keeps Glitch's pick only when the starter street
 * reaches it by open roads, and otherwise sets you down on the open-world street nearest it.
 *
 * 1. On a fresh world none of the 26 is open (the bug's cause), and for each the nearest open
 *    street (quest-reach nearestReached) is reachable from Hechey Track.
 * 2. openBootTarget: an open pick stands; a closed one moves (to one of the 26 at its arrival
 *    point, else to the street's own arrival); no answer keeps the pick.
 * 3. The wiring: juju-bandits-feature asks street-jobs-feature's openStreetNear, which grows the
 *    open world from the starter street only (never from a pocket you stand in).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { closedStreets, normalizeStreetJobState } from '../public/js/street-jobs.js?v=94f8d250';
import { nearestReached, reachableStreets } from '../public/js/quest-reach.js?v=6cec222d';
import { routeGraph } from '../public/js/map-routes.js?v=c7e7dc80';
import { openBootTarget, pickBootTarget } from '../public/js/ancestral-nostalgia.js?v=3d97122d';
import { NOSTALGIA_BOOT_STREETS } from '../public/js/ancestral-nostalgia-data.js?v=0adb9184';
import { SAVANNA_HUBS } from '../public/js/juju-bandits.js?v=6cf92f4f';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const catalog = json('public/assets/content/street-jobs.json');
const index = json('public/assets/streets/index.json');
const { graph } = routeGraph(json('public/assets/content/signpost-graph.json'));

const fresh = normalizeStreetJobState({ initialized: true });
const shut = new Set(closedStreets(fresh, catalog, { exemptFrom: [index.default] }));
const reach = reachableStreets({ graph, shut, starts: [index.default] });
// The kick never lands in the Savanna it sends you from (Xalanga's Languid Line S is the nearest open street to Andra's six).
const skip = (t) => SAVANNA_HUBS.includes(String(index.streets[t]?.hubId));

describe('1. a fresh world: the 26 boot streets are all past closed roads', () => {
  it('none of them is reachable from the starter street', () => {
    assert.equal(NOSTALGIA_BOOT_STREETS.length, 26);
    for (const row of NOSTALGIA_BOOT_STREETS) assert.equal(reach.has(row.tsid), false, row.label);
  });

  it('each has an open-world street near it, reachable and outside the Savanna', () => {
    for (const row of NOSTALGIA_BOOT_STREETS) {
      const near = nearestReached({ graph, reach, from: row.tsid, skip });
      assert.ok(near, `${row.label}: no open street joins it`);
      assert.ok(reach.has(near), `${row.label} -> ${near}`);
      assert.ok(index.streets[near], `${near} is a real street`);
      assert.equal(skip(near), false, `${row.label} -> ${index.streets[near].label} is in the Savanna`);
    }
  });

  it('without the skip, Andra\'s nearest open street would be in Xalanga (a Savanna hub)', () => {
    const near = nearestReached({ graph, reach, from: NOSTALGIA_BOOT_STREETS.find((r) => r.hubId === '89').tsid });
    assert.equal(skip(near), true);
  });

  it('an open street is its own nearest', () => {
    assert.equal(nearestReached({ graph, reach, from: index.default }), index.default);
    assert.equal(nearestReached({ graph, reach: null, from: index.default }), null);
  });
});

describe('2. openBootTarget', () => {
  const pick = pickBootTarget(NOSTALGIA_BOOT_STREETS, { streetRoll: 0.6, arrivalRoll: 0 });

  it('keeps an open pick, and the pick when the roads are unknown', () => {
    assert.equal(openBootTarget(pick, pick.tsid, NOSTALGIA_BOOT_STREETS), pick);
    assert.equal(openBootTarget(pick, null, NOSTALGIA_BOOT_STREETS), pick);
  });

  it('moves a closed pick to another of the 26 at its own arrival point', () => {
    const other = NOSTALGIA_BOOT_STREETS[0];
    const out = openBootTarget(pick, other.tsid, NOSTALGIA_BOOT_STREETS, { arrivalRoll: 0 });
    assert.deepEqual(out, { tsid: other.tsid, label: other.label, arrive: { x: other.arrivals[0][0], y: other.arrivals[0][1] }, movedFrom: pick.tsid });
  });

  it('moves a closed pick to any open street, landing at that street\'s own arrival', () => {
    const near = nearestReached({ graph, reach, from: pick.tsid, skip });
    const out = openBootTarget(pick, near, NOSTALGIA_BOOT_STREETS);
    assert.equal(out.tsid, near);
    assert.equal(out.arrive, null);
    assert.ok(reach.has(out.tsid));
  });
});

describe('3. the wiring', () => {
  const juju = read('public/js/features/juju-bandits-feature.js');
  const jobs = read('public/js/features/street-jobs-feature.js');
  it('the kick asks for the open street nearest Glitch\'s pick (a forced QA destination stays)', () => {
    assert.match(juju, /engine\.query\?\.\('openStreetNear', pick\.tsid, engine, \{ skipHubs: SAVANNA_HUBS \}\)/);
    assert.match(juju, /if \(!pick \|\| rows\.length\) return pick;/);
  });
  it('the open world grows from the starter street only', () => {
    assert.match(jobs, /openStreetNear\(tsid, engine, options\) \{\n\s+return openStreetNear\(tsid, engine, options\);/);
    assert.match(jobs, /starts: \[streetIndex\.default\] \}\)/);
  });
});
