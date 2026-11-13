/**
 * Player report #210 (Froughtful Fen, GTJ103U2KJK1BLG): Mortar Barnacles stood on floor lines, a
 * 45 degree ramp and short ledges. Tiny Speck set them by hand (mortar_barnacle.js obey_physics
 * false), mostly on walls; the location files only count them. Now:
 * - a street whose players' snaps show its barnacles has measured spots
 *   (assets/content/barnacle-spots.json, js/barnacle-spots-data.js, tools/snap-placements/barnacles.py)
 *   and draws them there, wall-mounted, in the variant the snap shows;
 * - the rest are planned on a steady floor (STEADY_FLOOR_GROUPS: no ramp over 0.4, no short ledge
 *   over another floor, a 60 px footprint), at most PLANNED_NODE_CAPS of them;
 * - node keys stay `mortar_barnacle:<i>` for i < the street's count, so saved nodes keep theirs.
 * None of this needs the snaps (research/eleven-snaps is not public).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { groundBeneath, platformsScreen, streetHeight, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';
import {
  PLACEMENT_FOOTPRINTS,
  PLANNED_NODE_CAPS,
  STEADY_FLOOR_GROUPS,
  ecologyForStreet,
  measuredNodeSpots,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  steadyFloor,
} from '../public/js/street-ecology.js?v=080b2e56';
import {
  prepareStreetResourceNodes,
  resourcePlacementGroups,
  resourceSpawnPlan,
} from '../public/js/features/resource-nodes-feature.js?v=b79bd649';
import { BARNACLE_SPOTS } from '../public/js/barnacle-spots-data.js?v=cea3daec';

const root = join(import.meta.dirname, '..');
const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const catalog = read('public/assets/content/street-ecology.json');
const spotsFile = read('public/assets/content/barnacle-spots.json');
const index = read('public/assets/streets/index.json');
const street = (tsid) => read(`public/assets/streets/${tsid}.json`);
setStreetEcologyCatalog(catalog);

const FEN = 'GTJ103U2KJK1BLG';
const BARNACLE = 'resource:mortar_barnacle';

describe('player report #210: the measured barnacle spots', () => {
  it('has the documented shape, on real streets, inside each street and within its count', () => {
    assert.match(spotsFile.source, /eleven giants/i);
    assert.match(spotsFile.source, /no pixels/i);
    const tsids = Object.keys(spotsFile.streets);
    assert.ok(tsids.length >= 30, `${tsids.length} streets`);
    for (const tsid of tsids) {
      assert.match(tsid, /^G[A-Z0-9]+$/, tsid);
      const data = street(tsid);
      const count = ecologyForStreet(tsid).counts.mortar_barnacle;
      const spots = spotsFile.streets[tsid];
      assert.ok(spots.length >= 1 && spots.length <= count, `${tsid} ${spots.length} of ${count}`);
      for (const [x, y, blister] of spots) {
        assert.ok(x > 0 && x < streetWidth(data), `${tsid} x ${x}`);
        assert.ok(y > 0 && y <= streetHeight(data), `${tsid} y ${y}`);
        assert.ok(Number.isInteger(blister) && blister >= 1 && blister <= 6, `${tsid} blister ${blister}`);
      }
      // Two spots are two barnacles, never one seen twice.
      for (let i = 0; i < spots.length; i += 1) {
        for (let j = i + 1; j < spots.length; j += 1) {
          assert.ok(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]) > 20, `${tsid} ${i} ${j}`);
        }
      }
      assert.ok(index.streets[tsid], tsid);
    }
  });

  it('is what the game reads (js/barnacle-spots-data.js matches the JSON)', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(BARNACLE_SPOTS)), spotsFile.streets);
  });

  it('puts all 11 of Froughtful Fen\'s on the walls the snaps show, above the floor', () => {
    const spots = measuredNodeSpots(FEN).mortar_barnacle;
    assert.equal(spots.length, 11);
    const pop = populationForStreet(FEN, ecologyForStreet(FEN));
    assert.equal(pop.resourceNodeClasses.filter((id) => id === 'mortar_barnacle').length, 11);
    // None is planned: the planner never sees a barnacle group here.
    assert.ok(!resourcePlacementGroups(pop).some((g) => g.key === BARNACLE));
    const plan = resourceSpawnPlan(pop, (key) => {
      if (key === BARNACLE) throw new Error('no barnacle is planned on Froughtful Fen');
      return [];
    }).filter((row) => row.classTsid === 'mortar_barnacle');
    assert.deepEqual(plan.map((row) => row.key), Array.from({ length: 11 }, (_, i) => `mortar_barnacle:${i}`));
    const lines = platformsScreen(street(FEN));
    let onHuts = 0;
    for (const [i, row] of plan.entries()) {
      assert.equal(row.wall, true);
      assert.deepEqual([row.x, row.y], [spots[i].x, spots[i].y]);
      assert.match(row.variant, /^blister[1-6]$/);
      // The floor under the barnacle's cell is well below it: it hangs on a wall, not on a line.
      const floor = groundBeneath(lines, row.x, row.y, 0);
      assert.ok(floor && floor.y - row.y >= 50, `${row.key} at ${row.x},${row.y}: floor ${floor?.y}`);
      if (row.x > 4000 && row.x < 4800) {
        // The decks under the huts run at y 283-305; the barnacles hang 55-110 px over them.
        assert.ok(row.y < 260 && floor.y - row.y >= 55, `${row.key} on a beehive hut over the decks`);
        onHuts += 1;
      }
    }
    assert.equal(onHuts, 4, 'the four on the big huts at x 4100-4720');
  });
});

describe('player report #210: barnacles the snaps do not show', () => {
  it('plans only the ones without a spot, keeping every key', () => {
    const pop = {
      resourceNodeClasses: ['mortar_barnacle', 'mortar_barnacle', 'mortar_barnacle', 'mortar_barnacle', 'jellisac'],
      resourceSpots: { mortar_barnacle: [{ x: 500, y: 300, variant: 'blister3' }, { x: 900, y: 250, variant: 'blister1' }] },
    };
    assert.deepEqual(resourcePlacementGroups(pop).map((g) => [g.key, g.count]), [[BARNACLE, 2], ['resource:jellisac', 1]]);
    const plan = resourceSpawnPlan(pop, (key) => (key === BARNACLE ? [{ x: 100, y: 800 }, { x: 1300, y: 800 }] : [{ x: 700, y: 800 }]));
    assert.deepEqual(plan, [
      { key: 'mortar_barnacle:0', classTsid: 'mortar_barnacle', x: 500, y: 300, wall: true, variant: 'blister3' },
      { key: 'mortar_barnacle:1', classTsid: 'mortar_barnacle', x: 900, y: 250, wall: true, variant: 'blister1' },
      { key: 'mortar_barnacle:2', classTsid: 'mortar_barnacle', x: 100, y: 800 },
      { key: 'mortar_barnacle:3', classTsid: 'mortar_barnacle', x: 1300, y: 800 },
      { key: 'jellisac:0', classTsid: 'jellisac', x: 700, y: 800 },
    ]);
  });

  it('caps the planned ones on a street with no snap (Kiehiman Course names 13)', () => {
    const tsid = 'GIF15S7VPRV1DIP';
    assert.equal(measuredNodeSpots(tsid), null);
    const pop = populationForStreet(tsid, ecologyForStreet(tsid));
    assert.equal(pop.resourceCounts.mortar_barnacle, 13, 'the file count is kept');
    assert.equal(pop.resourceNodeClasses.filter((id) => id === 'mortar_barnacle').length, PLANNED_NODE_CAPS.mortar_barnacle);
    assert.equal(PLANNED_NODE_CAPS.mortar_barnacle, 6);
    // The other standing nodes keep every one the file names (G399).
    assert.equal(PLANNED_NODE_CAPS.ice_knob, undefined);
  });

  it('keeps a planned barnacle off steep ramps and short ledges over another floor', () => {
    assert.equal(PLACEMENT_FOOTPRINTS[BARNACLE], 60);
    const rule = STEADY_FLOOR_GROUPS[BARNACLE];
    assert.deepEqual({ ...rule }, { maxSlope: 0.4, ledgeRun: 240 });
    assert.equal(steadyFloor({ slope: 1, under: 0, run: 900 }, rule), false, 'a 45 degree ramp');
    assert.equal(steadyFloor({ slope: 0.05, under: 1200, run: 120 }, rule), false, 'a short ledge over a floor');
    assert.equal(steadyFloor({ slope: 0.05, under: 1200, run: 600 }, rule), true, 'a long upper deck');
    assert.equal(steadyFloor({ slope: 0.3, under: 0, run: 140 }, rule), true, 'a gentle slope with nothing under it');
    const lines = [
      { id: 'ramp', x1: 200, y1: 900, x2: 500, y2: 600 },
      { id: 'ledge', x1: 900, y1: 600, x2: 1050, y2: 600 },
      { id: 'floor', x1: 600, y1: 900, x2: 1400, y2: 900 },
    ];
    const plan = planStreetPlacements(lines, [{ key: BARNACLE, count: 8, clearance: 42 }, { key: 'apples', count: 12, clearance: 30 }], { worldW: 1600, seed: 'r210', unreached: null });
    assert.ok(plan.groups[BARNACLE].length >= 3);
    for (const spot of plan.groups[BARNACLE]) assert.ok(spot.id.startsWith('floor:'), `barnacle on ${spot.id}`);
    // Apples keep the plain rule (and the ramp and ledge are there for them; Ice Nubbins have the steady rule
    // since the placements audit, 2026-11-12).
    assert.ok(plan.groups.apples.some((spot) => !spot.id.startsWith('floor:')));
  });

  it('never plans one on Froughtful Fen\'s ramp or deck ledges when it has no spots', () => {
    const lines = platformsScreen(street(FEN));
    const plan = planStreetPlacements(lines, [{ key: 'player', count: 1, clearance: 190 }, { key: BARNACLE, count: 11, clearance: 42 }], {
      worldW: streetWidth(street(FEN)),
      seed: FEN,
    });
    assert.ok(plan.groups[BARNACLE].length >= 6);
    for (const spot of plan.groups[BARNACLE]) {
      const under = lines.filter((p) => spot.x >= Math.min(p.x1, p.x2) && spot.x <= Math.max(p.x1, p.x2)
        && Math.abs(p.y1 + ((spot.x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1) - spot.y) < 0.5);
      assert.ok(under.length, `${spot.id} on a line`);
      assert.ok(under.some((p) => Math.abs(p.y2 - p.y1) / Math.abs(p.x2 - p.x1) <= 0.4), `${spot.id} slope`);
    }
  });
});

describe('player report #210: saved nodes', () => {
  it('keep their keys and stock on a street that gained measured spots; the snap\'s variant is drawn', () => {
    const pop = populationForStreet(FEN, ecologyForStreet(FEN));
    const plan = resourceSpawnPlan(pop, () => []).filter((row) => row.classTsid === 'mortar_barnacle');
    const slot = { nodes: {} };
    for (let i = 0; i < 11; i += 1) slot.nodes[`mortar_barnacle:${i}`] = { classTsid: 'mortar_barnacle', units: 1 + (i % 4), variant: 'blister6', regrowAt: 0 };
    const saved = JSON.parse(JSON.stringify(slot));
    const out = prepareStreetResourceNodes(saved, plan, { tsid: FEN, now: 1000 });
    assert.equal(out.length, 11);
    out.forEach((row, i) => {
      assert.equal(row.node.units, 1 + (i % 4), `${row.key} keeps its stock`);
      assert.equal(row.node.variant, row.variant);
      assert.equal(saved.nodes[row.key], row.node);
    });
    // A fresh node starts in the measured variant too.
    const fresh = prepareStreetResourceNodes({}, plan.slice(0, 1), { tsid: FEN, now: 1000 });
    assert.equal(fresh[0].node.variant, plan[0].variant);
  });
});

describe('player report #210: the measuring tool', () => {
  const py = spawnSync('python3.11', ['-c', 'print(1)'], { encoding: 'utf8' });
  const skip = py.status === 0 ? false : 'python3.11 not installed';
  const tool = join(root, 'tools/snap-placements/barnacles.py');

  it('skips cleanly without the snaps and writes nothing', { skip }, () => {
    const before = readFileSync(join(root, 'public/assets/content/barnacle-spots.json'), 'utf8');
    const run = spawnSync('python3.11', ['-I', tool, '--snaps', join(root, 'no-such-snaps-dir')], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /no snaps/);
    assert.equal(readFileSync(join(root, 'public/assets/content/barnacle-spots.json'), 'utf8'), before);
  });

  it('agrees with the data module it wrote (--check)', { skip }, () => {
    const run = spawnSync('python3.11', ['-I', tool, '--check'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  });

  it('is in the repo, the snaps are not', () => {
    assert.ok(existsSync(tool));
    assert.ok(!existsSync(join(root, 'public/assets/eleven-snaps')));
  });
});
