// G952: hand corrections to snap-measured barnacles stay few, named and applied (Austin 2026-11-17, Ivalo Trims).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BARNACLE_NUDGES, nudgedBarnacleSpots } from '../public/js/barnacle-nudges.js?v=159f11bf';
import { BARNACLE_SPOTS } from '../public/js/barnacle-spots-data.js?v=cea3daec';
import { measuredNodeSpots } from '../public/js/street-ecology.js?v=e5263244';

describe('G952 barnacle nudges', () => {
  it('every nudge names a measured barnacle, a small shift and a reason', () => {
    for (const [tsid, rows] of Object.entries(BARNACLE_NUDGES)) {
      for (const n of rows) {
        assert.ok(BARNACLE_SPOTS[tsid]?.some((r) => r[0] === n.x), `${tsid} has a measured barnacle at ${n.x}`);
        assert.ok(Math.abs(n.dx) > 0 && Math.abs(n.dx) <= 24, `${tsid} ${n.x}: a few px`);
        assert.match(n.why, /Austin \d{4}-\d{2}-\d{2}/);
      }
    }
  });
  it('Ivalo Trims: the left barnacle moves 12 px onto the trunk; the measured file is untouched', () => {
    const nudged = nudgedBarnacleSpots(BARNACLE_SPOTS);
    assert.equal(BARNACLE_SPOTS.GTJ34OO4UHV1NLQ[0][0], 466.5);
    assert.equal(nudged.GTJ34OO4UHV1NLQ[0][0], 478.5);
    assert.deepEqual(nudged.GTJ34OO4UHV1NLQ.slice(1), BARNACLE_SPOTS.GTJ34OO4UHV1NLQ.slice(1));
    const spots = measuredNodeSpots('GTJ34OO4UHV1NLQ')?.mortar_barnacle || [];
    assert.ok(spots.some((s) => s.x === 478.5), JSON.stringify(spots.slice(0, 2)));
  });
});
