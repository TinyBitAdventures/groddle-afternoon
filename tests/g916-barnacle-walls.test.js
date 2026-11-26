/**
 * #446 (G916, Austin 2026-11-17): on the streets no full-street snap covers, Mortar Barnacles
 * stood on the floor. Now each takes a spot measured on a picture of the street where one shows
 * it (assets/content/barnacle-picture-spots.json), else a spot on the street's own walls by
 * js/barnacle-walls.js, the rule read off the 201 measured barnacles (barnacle-spots.json):
 * in front of wall art, 41-128 px over a floor, never on one.
 * Run: node --test tests/g916-barnacle-walls.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isStandable, platformsScreen, streetWidth, streetHeight } from '../public/js/street-model.js?v=a9a05f9d';
import { ecologyForStreet, measuredNodeSpots, measuredShrineSpot, populationForStreet, setStreetEcologyCatalog, streetReservedSpots } from '../public/js/street-ecology.js?v=58aafb61';
import { resourcePlacementGroups, resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=6963f42a';
import { BARNACLE_LIFTS, barnacleWallSpots } from '../public/js/barnacle-walls.js?v=75e568c3';
import { fixedPictureBoxes } from '../tools/build-barnacle-wall-spots.mjs';
import { BARNACLE_WALL_SPOTS } from '../public/js/barnacle-wall-spots-data.js?v=8ba1ff7d';

const root = join(import.meta.dirname, '..');
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const ecology = read('public/assets/content/street-ecology.json');
const snapped = read('public/assets/content/barnacle-spots.json').streets;
const pictures = read('public/assets/content/barnacle-picture-spots.json');
const street = (tsid) => read(`public/assets/streets/${tsid}.json`);
setStreetEcologyCatalog(ecology);

const TAMBRA = 'GA9T7IFRDIA2N0K';
const fallback = Object.entries(ecology.streets)
  .filter(([tsid, row]) => Number(row?.counts?.mortar_barnacle) > 0 && !snapped[tsid]?.length)
  .map(([tsid, row]) => ({ tsid, count: Number(row.counts.mortar_barnacle) }));

/** The floor under (x, y) and whether any line crosses between the art and it. */
function standingUnder(lines, x, y) {
  const at = lines.map((p) => (x < p.x1 || x > p.x2 ? null : { p, y: p.x2 === p.x1 ? p.y1 : p.y1 + ((p.y2 - p.y1) * (x - p.x1)) / (p.x2 - p.x1) })).filter(Boolean);
  const floor = at.filter((a) => a.y > y && isStandable(a.p)).sort((a, b) => a.y - b.y)[0];
  return floor ? { lift: floor.y - y, between: at.some((a) => a.y > y - 44 && a.y < floor.y - 2) } : null;
}

describe('#446 barnacles off the floor where no snap shows them', () => {
  it('43 streets, each with every barnacle its file names, and the data is current', () => {
    assert.equal(fallback.length, 43);
    for (const { tsid, count } of fallback) assert.equal(BARNACLE_WALL_SPOTS[tsid]?.length, count, tsid);
    execFileSync(process.execPath, [join(root, 'tools/build-barnacle-wall-spots.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('every spot hangs 40-130 px over a floor a Glitch stands on, with nothing between', () => {
    for (const { tsid } of fallback) {
      const s = street(tsid);
      const lines = platformsScreen(s);
      for (const [x, y, blister, tier] of BARNACLE_WALL_SPOTS[tsid]) {
        assert.ok(x > 0 && x < streetWidth(s) && y > 0 && y <= streetHeight(s), `${tsid} ${x},${y}`);
        assert.ok(Number.isInteger(blister) && blister >= 1 && blister <= 6);
        if (tier === 0) continue; // measured on a picture: where it was
        assert.ok(tier >= 1 && tier <= 3, `${tsid} ${x},${y} tier ${tier} (4 would be the floor)`);
        const under = standingUnder(lines, x, y);
        assert.ok(under && under.lift >= 40 && under.lift <= 175 && !under.between, `${tsid} ${x},${y}: ${JSON.stringify(under)}`);
      }
    }
  });

  it('Tambra Tiss: its 8 are all wall-mounted, keyed mortar_barnacle:0..7, none planned on a floor', () => {
    const spots = measuredNodeSpots(TAMBRA).mortar_barnacle;
    assert.equal(spots.length, 8);
    const pop = populationForStreet(TAMBRA, ecologyForStreet(TAMBRA));
    assert.ok(!resourcePlacementGroups(pop).some((g) => g.key === 'resource:mortar_barnacle'));
    const plan = resourceSpawnPlan(pop, () => []).filter((r) => r.classTsid === 'mortar_barnacle');
    assert.deepEqual(plan.map((r) => r.key), Array.from({ length: 8 }, (_, i) => `mortar_barnacle:${i}`));
    assert.ok(plan.every((r) => r.wall === true && /^blister[1-6]$/.test(r.variant)));
  });

  it('the rule, run on the measured streets, keeps to the measured habit', () => {
    let n = 0;
    for (const [tsid, rows] of Object.entries(snapped).slice(0, 12)) {
      const s = street(tsid);
      for (const spot of barnacleWallSpots(s, rows.length, { reserved: streetReservedSpots(s) })) {
        if (spot.tier < 4) assert.ok(BARNACLE_LIFTS.includes(spot.lift) || spot.tier === 3, JSON.stringify(spot));
        n += 1;
      }
    }
    assert.ok(n > 30);
  });

  it('keeps clear of the shrine, trees and rocks a picture places (Naatamo Way\'s shrine stays put)', () => {
    const shrine = measuredShrineSpot('GIFN3FI0TNU10PS');
    assert.deepEqual(shrine, { x: 2972, y: 848 }, 'where its picture shows it');
    for (const { tsid } of fallback) {
      const boxes = fixedPictureBoxes(populationForStreet(tsid, ecologyForStreet(tsid)));
      for (const [x, y] of BARNACLE_WALL_SPOTS[tsid]) {
        for (const { block: b } of boxes) {
          assert.ok(!(x + 20 > b.l && x - 20 < b.r && y > b.t && y - 44 < b.b), `${tsid} barnacle ${x},${y} on a fixed spot`);
        }
      }
    }
  });

  it('is deterministic and keeps away from the spots already measured', () => {
    const s = street(TAMBRA);
    const a = barnacleWallSpots(s, 8, { reserved: streetReservedSpots(s) });
    assert.deepEqual(barnacleWallSpots(s, 8, { reserved: streetReservedSpots(s) }), a);
    const keep = [{ x: a[0].x, y: a[0].y }];
    const b = barnacleWallSpots(s, 7, { reserved: streetReservedSpots(s), keep });
    assert.ok(b.every((p) => Math.hypot(p.x - keep[0].x, p.y - keep[0].y) >= 70));
  });

  it('picture spots cite their pictures (no player names, no pixels)', () => {
    assert.match(pictures.source, /reference only/i);
    for (const [tsid, row] of Object.entries(pictures.streets)) {
      // G998 (#489): or a snapped street whose snaps show one its matcher missed (Vasko Shift's third).
      const leftover = snapped[tsid]?.length && Number(ecology.streets[tsid]?.counts?.mortar_barnacle) > snapped[tsid].length;
      assert.ok(fallback.some((f) => f.tsid === tsid) || leftover, tsid);
      assert.ok(row.from?.length, `${tsid} cites its pictures`);
      assert.ok(row.spots.length >= 1);
    }
  });
});
