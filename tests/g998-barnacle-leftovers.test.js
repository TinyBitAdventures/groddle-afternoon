/**
 * #489 (G998, Vasko Shift GTJ12PGU9KV1MGI): a Mortar Barnacle stood on the floor in front of a beehive
 * hut. The street's two snaps show three barnacles, all on the huts' edges; the matcher
 * (tools/snap-placements/barnacles.py) found two (the measured spots are right: both sit on the huts'
 * curved left edges, as the snaps show) and missed the third behind a tendril, so the planner put it
 * on the floor. Five snapped streets had one such leftover each. Now a snapped street's leftovers take
 * a spot read on a picture of it (barnacle-picture-spots.json: Vasko's third, read on its snaps), else
 * a spot on its walls by G916's rule (tools/build-barnacle-wall-spots.mjs BARNACLE_LEFTOVER_SPOTS),
 * after the measured spots, so those keep their keys (and the realtime server's ids).
 * Run: node --test tests/g998-barnacle-leftovers.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isStandable, platformsScreen } from '../public/js/street-model.js?v=a9a05f9d';
import { ecologyForStreet, measuredNodeSpots, populationForStreet, setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=1c840641';
import { resourcePlacementGroups, resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=6ec0d8c0';
import { nudgedBarnacleSpots } from '../public/js/barnacle-nudges.js?v=159f11bf';
import { BARNACLE_LEFTOVER_SPOTS } from '../public/js/barnacle-wall-spots-data.js?v=8ba1ff7d';

const root = join(import.meta.dirname, '..');
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const ecology = read('public/assets/content/street-ecology.json');
const snapped = read('public/assets/content/barnacle-spots.json').streets;
const street = (tsid) => read(`public/assets/streets/${tsid}.json`);
setStreetEcologyCatalog(ecology);

const VASKO = 'GTJ12PGU9KV1MGI';
const want = (tsid) => Number(ecology.streets[tsid]?.counts?.mortar_barnacle) || 0;
const leftover = Object.keys(snapped).filter((tsid) => snapped[tsid].length && want(tsid) > snapped[tsid].length).sort();

/** The floor under (x, y), as tests/g916-barnacle-walls.test.js measures it. */
function liftOverFloor(lines, x, y) {
  const at = lines.map((p) => (x < p.x1 || x > p.x2 ? null : { p, y: p.x2 === p.x1 ? p.y1 : p.y1 + ((p.y2 - p.y1) * (x - p.x1)) / (p.x2 - p.x1) })).filter(Boolean);
  const floor = at.filter((a) => a.y > y && isStandable(a.p)).sort((a, b) => a.y - b.y)[0];
  return floor ? floor.y - y : null;
}

describe('#489: a snapped street plans no barnacle on the floor', () => {
  it('the five snapped streets with a leftover each, all written', () => {
    assert.deepEqual(leftover, ['GTJ12PGU9KV1MGI', 'GTJ168OVQRV1TQA', 'GTJ16T2SURV19NT', 'GTJ1FR102AV17DP', 'GTJOCVQUMHV1K83']);
    assert.deepEqual(Object.keys(BARNACLE_LEFTOVER_SPOTS).sort(), leftover);
  });

  it('every snapped street: every barnacle its file names wall-mounted, the measured ones first', () => {
    const nudged = nudgedBarnacleSpots(snapped);
    for (const tsid of Object.keys(snapped)) {
      const n = want(tsid);
      if (!n) continue;
      const spots = measuredNodeSpots(tsid).mortar_barnacle;
      assert.ok(spots.length >= n, `${tsid}: ${spots.length} of ${n}`);
      nudged[tsid].forEach(([x, y], i) => assert.deepEqual([spots[i].x, spots[i].y], [x, y], `${tsid} measured ${i} keeps its key`));
      const pop = populationForStreet(tsid, ecologyForStreet(tsid));
      assert.ok(!resourcePlacementGroups(pop).some((g) => g.key === 'resource:mortar_barnacle'), `${tsid}: none planned on a floor`);
      const plan = resourceSpawnPlan(pop, () => []).filter((r) => r.classTsid === 'mortar_barnacle');
      assert.deepEqual(plan.map((r) => r.key), Array.from({ length: n }, (_, i) => `mortar_barnacle:${i}`), tsid);
      assert.ok(plan.every((r) => r.wall === true), tsid);
    }
  });

  it('Vasko Shift: the two measured on the huts\' left edges, the third on the right hut as both snaps show', () => {
    const spots = measuredNodeSpots(VASKO).mortar_barnacle;
    assert.deepEqual(spots.map((s) => [s.x, s.y, s.variant]), [[3326.5, 902, 'blister1'], [3786.5, 783, 'blister1'], [4141.5, 774, 'blister2']]);
    // The right hut: bottletree_body3 at middleground x 1463 (street x 3963), 596 wide.
    const s = street(VASKO);
    const hut = s.layers.find((l) => l.name === 'middleground').decos.filter((d) => d.sprite === 'bottletree_body3').find((d) => d.x === 1463);
    const left = hut.x - s.bounds.l - hut.w / 2;
    assert.ok(spots[2].x > left && spots[2].x < left + hut.w, `on the right hut (${left} to ${left + hut.w})`);
    // Not the old floor leftover in front of the left hut (3378, 979).
    assert.ok(!spots.some((p) => Math.abs(p.x - 3378) < 30 && Math.abs(p.y - 979) < 30));
  });

  it('a rule-placed leftover hangs 40-175 px over a floor, as G916\'s do', () => {
    for (const [tsid, rows] of Object.entries(BARNACLE_LEFTOVER_SPOTS)) {
      const lines = platformsScreen(street(tsid));
      for (const [x, y, blister, tier] of rows) {
        assert.ok(Number.isInteger(blister) && blister >= 1 && blister <= 6);
        if (tier === 0) continue; // read on a picture: where it was
        assert.ok(tier >= 1 && tier <= 3, `${tsid} ${x},${y} tier ${tier}`);
        const lift = liftOverFloor(lines, x, y);
        assert.ok(lift >= 40 && lift <= 175, `${tsid} ${x},${y}: ${lift} px over a floor`);
      }
    }
  });
});
