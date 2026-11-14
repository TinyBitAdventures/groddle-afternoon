/**
 * Groddle Meadow's shrines stand where Tiny Speck's 2011-2012 street pictures show them (lane
 * meadow2012, 2026-11-14): tools/snap-placements/shrine-pictures.json (read off the pictures by eye)
 * seated on the floor by tools/snap-placements/shrine-pictures.mjs into js/shrine-spots-data.js;
 * street-ecology.js shrinePlacementRequest makes each a fixed point for game.js enterStreet, the
 * realtime builders and the level builder alike.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PLACEMENT_FOOTPRINTS,
  ecologyForStreet,
  frontDecoCovers,
  hiddenBehindFront,
  measuredShrineSpot,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  shrinePlacementRequest,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=0a7d05eb';
import { SHRINE_SPOTS } from '../public/js/shrine-spots-data.js?v=73006a8c';
import { platformYAt, platformsScreen, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';
import { NUDGE_PX, SEAT_PX, seatOnFloor } from '../tools/snap-placements/shrine-pictures.mjs';
import { placementRequests } from '../tools/build-realtime-objects.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const street = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));
setStreetEcologyCatalog(JSON.parse(read('public/assets/content/street-ecology.json')));
const index = JSON.parse(read('public/assets/streets/index.json')).streets;
const source = JSON.parse(read('tools/snap-placements/shrine-pictures.json')).streets;
const byLabel = Object.fromEntries(Object.entries(source).map(([tsid, row]) => [row.label, tsid]));

describe('shrine spots from the 2012 street pictures', () => {
  it('the data is current (tools/snap-placements/shrine-pictures.mjs --check)', () => {
    execFileSync(process.execPath, [join(root, 'tools/snap-placements/shrine-pictures.mjs'), '--check'], { stdio: 'pipe' });
    assert.equal(Object.keys(SHRINE_SPOTS).length, Object.keys(source).length);
  });

  it("every Groddle Meadow street with a shrine has its picture's spot; none without one", () => {
    for (const [tsid, row] of Object.entries(index)) {
      if (String(row.hubId) !== '58') continue;
      const pop = populationForStreet(tsid, ecologyForStreet(tsid));
      if (!pop.shrine) {
        assert.equal(SHRINE_SPOTS[tsid], undefined, row.label);
        continue;
      }
      assert.ok(SHRINE_SPOTS[tsid], `${row.label} has a shrine and a 2012 picture`);
    }
  });

  it('each spot is seated on a standable floor that holds the shrine, near where the picture shows it', () => {
    const moved = Object.keys(SHRINE_SPOTS).filter((tsid) => SHRINE_SPOTS[tsid][0] !== source[tsid].spot[0]).map((tsid) => source[tsid].label).sort();
    assert.deepEqual(moved, ['Balliure Heath', 'Broxhurst Green'], 'only the two the art in front would hide move along the floor');
    for (const [tsid, [x, y]] of Object.entries(SHRINE_SPOTS)) {
      const s = street(tsid);
      const [px, py] = source[tsid].spot;
      assert.ok(Math.abs(x - px) <= NUDGE_PX, source[tsid].label);
      assert.ok(Math.abs(y - py) <= SEAT_PX, source[tsid].label);
      assert.equal(hiddenBehindFront({ x, y }, 'shrine', frontDecoCovers(s)), false, `${source[tsid].label}: not behind the art in front`);
      assert.equal(seatOnFloor(platformsScreen(s), x, y, PLACEMENT_FOOTPRINTS.shrine), y);
      const floor = platformsScreen(s).filter((p) => p.pcPerm !== 1 && p.pcPerm !== null)
        .some((p) => { const fy = platformYAt(p, x, 0); return fy != null && Math.abs(fy - y) <= 1; });
      assert.ok(floor, `${source[tsid].label}: on a floor`);
      // Not in a doorway or on a signpost.
      for (const r of streetReservedSpots(s).filter((q) => !q.front && q.block)) {
        const b = r.block;
        assert.ok(!(x > b.l && x < b.r && y > b.t && y <= b.b + 2), `${source[tsid].label} in ${r.key}`);
      }
    }
  });

  it('at the height 2012 shows: Marylpole Mount on the floor, Twickenrill Grotto and Otterlane up top', () => {
    const at = (label) => SHRINE_SPOTS[byLabel[label]];
    assert.ok(at('Marylpole Mount')[1] > 950, 'Marylpole Mount: on the floor, not up on the rock');
    assert.ok(at('Twickenrill Grotto')[1] < 700, 'Twickenrill Grotto: up top, not in the cave');
    assert.ok(at('Otterlane')[1] < 600, 'Otterlane: on the mound');
    assert.ok(at('Louise Pasture')[1] < 800, 'Louise Pasture: on the mound behind the pit');
    assert.ok(at('Bonelington Hole')[1] > 1200, 'Bonelington Hole: in the cave');
  });

  it('the planner stands the shrine on its spot (game.js, the realtime builders, the level builder)', () => {
    for (const [tsid, [x, y]] of Object.entries(SHRINE_SPOTS)) {
      const s = street(tsid);
      const pop = populationForStreet(tsid, ecologyForStreet(tsid));
      assert.deepEqual(pop.shrineSpot, { x, y });
      assert.deepEqual(measuredShrineSpot(`L${tsid.slice(1)}`), { x, y });
      const plan = planStreetPlacements(platformsScreen(s), placementRequests(pop), { worldW: streetWidth(s), seed: tsid, reserved: streetReservedSpots(s) });
      assert.deepEqual([plan.groups.shrine[0].x, plan.groups.shrine[0].y, plan.groups.shrine.length], [x, y, 1], source[tsid].label);
      assert.deepEqual(plan.blocked || [], [], source[tsid].label);
      // Every other big thing keeps off it.
      for (const key of ['trees', 'vendor', 'gardens', 'rocks']) {
        for (const p of plan.groups[key] || []) assert.ok(Math.abs(p.x - x) >= 59 || Math.abs(p.y - y) > 147, `${source[tsid].label}: ${key} on the shrine`);
      }
    }
    const req = shrinePlacementRequest({ shrine: true });
    assert.deepEqual(req, { key: 'shrine', count: 1, clearance: 135 });
    assert.deepEqual(shrinePlacementRequest({ shrine: false, shrineSpot: { x: 1, y: 2 } }), { key: 'shrine', count: 0, clearance: 135 });
    for (const file of ['public/game.js', 'public/js/builder/validate.js', 'tools/build-realtime-objects.mjs', 'tools/build-realtime-quoins.mjs']) {
      const text = read(file);
      assert.match(text, /shrinePlacementRequest\(/, file);
      assert.doesNotMatch(text, /key: 'shrine', count:/, file);
    }
  });
});
