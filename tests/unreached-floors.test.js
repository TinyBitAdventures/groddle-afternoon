/**
 * Ticket 64 (Friendly, 2026-11-03): Level 3 East (Ilmenskie Caverns) had quoins,
 * rocks and a Musicblock on the floor line under the whole cave walk, where no one
 * can get. The original set those by hand where players reach them (the archived
 * locations keep only the item list), so the planner (js/street-ecology.js
 * planStreetPlacements) now skips every floor run no arrival reaches: the
 * catalog's unreachedFloors section, built by tools/ecology/build-unreached-floors.mjs
 * with the level builder's reach graph (js/builder/reach-graph.js).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';
import {
  hiddenBehindFloor,
  inUnreachedRun,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
  unreachedFloorsFor,
} from '../public/js/street-ecology.js?v=c8d6fa5b';
import { placementRequests, streetEcology } from '../tools/build-realtime-quoins.mjs';
import { UNREACHED_JUMP, UNREACHED_JUMPS, overlapRuns, unreachedFloorsOf, unreachedJump } from '../tools/ecology/build-unreached-floors.mjs';
import { NORMAL_BUFF, jumpApex } from '../public/js/avatar-step.js?v=43b1182e';
import { jumpArc, streetWorld } from '../public/js/builder/reach-graph.js?v=d03eeab1';
import { shippedArrivals } from '../tools/builder/calibrate.mjs';
import { shippedStreetFiles } from '../tools/builder/validator-context.mjs';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const catalog = JSON.parse(read('public/assets/content/street-ecology.json'));
setStreetEcologyCatalog(catalog);
const street = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));
const LEVEL_3_EAST = 'GLI1D3B2U5715LL';
const UNDER_FLOOR = 'pl1276112657130';

function plan(tsid, opts = {}) {
  const data = street(tsid);
  const population = populationForStreet(tsid, streetEcology(tsid), {});
  const lines = platformsScreen(data);
  return { data, lines, plan: planStreetPlacements(lines, placementRequests(population), { worldW: streetWidth(data), seed: tsid, reserved: streetReservedSpots(data), ...opts }) };
}

/** The line a planned spot stands on. */
function lineAt(lines, p) {
  return lines.find((l) => p.x >= l.x1 - 0.5 && p.x <= l.x2 + 0.5 && Math.abs(l.y1 + (l.y2 - l.y1) * ((p.x - l.x1) / ((l.x2 - l.x1) || 1)) - p.y) < 1.5);
}

describe('ticket 64: nothing is planned on a floor nobody reaches', () => {
  it('Level 3 East: the floor under the cave walk is listed, end to end', () => {
    const u = unreachedFloorsFor(LEVEL_3_EAST);
    assert.ok(u?.[UNDER_FLOOR], 'the under-floor line is unreached');
    const [lo, hi] = u[UNDER_FLOOR][0];
    assert.ok(lo <= 30 && hi >= 3970, `${lo}-${hi} covers the 4000 px street`);
    assert.equal(Object.keys(u).length, 1, 'every other line of the cave walk is reached');
  });

  it('Level 3 East: its rocks, quoins, apples and Musicblock go on the walk now, not under it', () => {
    const before = plan(LEVEL_3_EAST, { unreached: null });
    const under = (r) => Object.entries(r.plan.groups).flatMap(([g, pts]) => pts.filter((p) => lineAt(r.lines, p)?.id === UNDER_FLOOR).map(() => g));
    // Since every floor height is planned (the placements audit, 2026-11-12) the Musicblock finds the walk
    // by itself; the rocks and quoins would still go under it.
    assert.ok(under(before).includes('rocks') && under(before).includes('quoins'), 'the old plan had them under the walk (the report)');
    const after = plan(LEVEL_3_EAST);
    assert.deepEqual(under(after), []);
    for (const g of ['rocks', 'quoins', 'musicblocks']) assert.equal(after.plan.groups[g].length, before.plan.groups[g].length, `${g}: all still placed`);
  });

  it('sweep: on every street with unreached floors, no planned spot is on one', () => {
    const bad = [];
    for (const tsid of Object.keys(catalog.unreachedFloors)) {
      const u = unreachedFloorsFor(tsid);
      const r = plan(tsid);
      for (const [g, pts] of Object.entries(r.plan.groups)) {
        for (const p of pts) if (inUnreachedRun(u, lineAt(r.lines, p), p.x)) bad.push(`${tsid} ${g} ${Math.round(p.x)},${Math.round(p.y)}`);
      }
    }
    assert.deepEqual(bad, []);
    assert.ok(Object.keys(catalog.unreachedFloors).length > 100, 'the sweep covers the streets the builder listed');
  });

  it('the stored runs are what the reach graph gives (a sample; the full run is --check)', () => {
    const files = new Map(shippedStreetFiles());
    const { byStreet } = shippedArrivals([...files]);
    for (const tsid of [LEVEL_3_EAST, 'GA53N05IG9S2BLR', 'GCR1356LOEM1NUI']) {
      const got = unreachedFloorsOf(street(tsid), byStreet.get(tsid.slice(1)) || []);
      assert.deepEqual(got, catalog.unreachedFloors[tsid], tsid);
    }
  });

  it('a street whose every floor is listed still gets its things (the data is ignored there)', () => {
    const lines = [{ id: 'a', x1: 0, y1: 500, x2: 2000, y2: 500 }];
    const all = planStreetPlacements(lines, [{ key: 'rocks', count: 3, clearance: 74 }], { worldW: 2000, seed: 'x', unreached: { a: [[0, 2000]] } });
    assert.equal(all.groups.rocks.length, 3);
    const part = planStreetPlacements(lines, [{ key: 'quoins', count: 6, clearance: 28 }], { worldW: 2000, seed: 'x', unreached: { a: [[0, 600]] } });
    assert.ok(part.groups.quoins.every((p) => p.x > 600), 'a partly reached line keeps only its reached part');
  });

  it('a tree, rock or Piggy is not set behind a floor from beside it while another spot is free (Unnu Slight)', () => {
    const r = plan('GIFUNGIBHQ1243A');
    for (const key of ['trees', 'rocks', 'piggies']) {
      for (const p of r.plan.groups[key] || []) assert.equal(hiddenBehindFloor(r.lines, p, key), false, `${key} ${Math.round(p.x)},${Math.round(p.y)}`);
    }
    // The spot the Piggy would have had: under the ledge over x 1439-1518.
    assert.equal(hiddenBehindFloor(r.lines, { x: 1491.3, y: 1507 }, 'piggies'), true);
  });

  it('the ecology builder keeps the section, and the realtime builders read it through the catalog', () => {
    assert.match(read('build-street-ecology.mjs'), /before\.unreachedFloors/);
    assert.match(read('public/js/street-ecology.js'), /tsid = seed, unreached = unreachedFloorsFor\(tsid\)/);
    for (const f of ['tools/build-realtime-objects.mjs', 'tools/build-realtime-quoins.mjs', 'tools/build-realtime-rook.mjs']) {
      assert.match(read(f), /setStreetEcologyCatalog\(/, f);
    }
  });
});

describe('G529: the reach runs jump as a triple jump does', () => {
  it('a 1.8x launch rises at twice vy_max (about 500 px), not capped near 212', () => {
    assert.ok(Math.abs(jumpApex(UNREACHED_JUMP) - 212) < 2, 'the old run: capped');
    assert.ok(jumpApex(UNREACHED_JUMP, undefined, { triple: true }) > 495, 'as a triple jump');
    // Level 3 East, from its first arrival's floor: the arc's rise with and without the flag.
    const data = street(LEVEL_3_EAST);
    const buff = { ...NORMAL_BUFF, jump: UNREACHED_JUMP };
    const rise = (tripleJump) => {
      const world = streetWorld(data, { buff, tripleJump });
      const from = { x: 2000, y: world.ground(2000, -5000, 1) };
      return from.y - jumpArc(world, from).minY;
    };
    const plain = rise(false);
    const triple = rise(true);
    assert.ok(plain < 215, `plain-jump model: ${plain}`);
    assert.ok(triple > plain + 50, `as a triple jump: ${triple} (the cave roof may stop it short of 500)`);
  });

  it('every jump is tried: plain, the gentlest triple and the best; a street with no triple jump only jumps plain', () => {
    assert.deepEqual([...UNREACHED_JUMPS], [1, 1.2, 1.8]);
    assert.deepEqual(unreachedJump({ jump: 1, tripleJump: 1 }), { jump: 1.8, tripleJump: true });
    assert.deepEqual(unreachedJump({ jump: 1, tripleJump: 1 }, 1), { jump: 1, tripleJump: false });
    assert.deepEqual(unreachedJump({ jump: 1, tripleJump: 0 }), { jump: 1, tripleJump: false }, 'multiplier_3_jump 0');
    assert.deepEqual(overlapRuns([[0, 100], [200, 300]], [[50, 250]]), [[50, 100], [200, 250]]);
    assert.deepEqual(overlapRuns([[0, 100]], [[101, 200]]), []);
  });

  it('the rebuilt catalog lists fewer floors (236 streets before G529)', () => {
    assert.ok(Object.keys(catalog.unreachedFloors).length < 200, `${Object.keys(catalog.unreachedFloors).length} streets`);
  });
});
