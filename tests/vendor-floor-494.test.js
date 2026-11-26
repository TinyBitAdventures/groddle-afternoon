/**
 * #494: the Meal Vendor floated on Level 2 East (GLI101QQRA211SM). Its walk is a round set by the
 * game clock (js/vendor-walk.js vendorWalkAt), so the page's first frame puts it far from its spot;
 * stepNpc then looked for a floor within 40 up and 70 down of the spot's height
 * (walkSurfaceY), found none and kept that height. It now follows its floor's line from where it
 * last stood (walk-surface.js followFloorY), as walkerSpan found the run it walks. The same jump
 * came with the shared paths that snap (street-creatures.js followPath SNAP_PX): Crabs, the Fire
 * Dragon, Heli Kitties, foxes on a far leg and game.js followWalkFloor (Piggies, Chickens).
 *
 * Run: node --test tests/vendor-floor-494.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isItemSolid, platformYAt, platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import { ecologyForStreet, planStreetPlacements, populationForStreet, setStreetEcologyCatalog, streetReservedSpots } from '../public/js/street-ecology.js?v=f1c11a2d';
import { chickenSeed, walkerSpan } from '../public/js/street-creatures.js?v=563717d8';
import { VENDOR_PLACEMENT_KEY, vendorNpcList, vendorNpcPlacementGroups, vendorNpcsFor } from '../public/js/vendor-npcs.js?v=90b0c123';
import { measuredGardenVendor } from '../public/js/garden-beds.js?v=2ac6a12c';
import { VENDOR_REACH, VENDOR_WALK, vendorPlan, vendorWalkAt } from '../public/js/vendor-walk.js?v=8f1791d7';
import { followFloorY, walkSurfaceY } from '../public/js/walk-surface.js?v=f21ce37b';
import { placementRequests } from '../tools/build-realtime-objects.mjs';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=10376267';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const streetsDir = join(root, 'public/assets/streets');
const index = JSON.parse(read('public/assets/streets/index.json'));
const ecology = JSON.parse(read('public/assets/content/street-ecology.json'));
setStreetEcologyCatalog(ecology);
setZoneStreetsShown(false);
applyStreetIndex(index);

const LEVEL_2_EAST = 'GLI101QQRA211SM';
const SAMPLES = 48;

/** Whether some item-solid line is at y under x (the floor under the walker). */
const onFloor = (platforms, x, y) => platforms.some((p) => isItemSolid(p) && Math.abs((platformYAt(p, x, 0) ?? Infinity) - y) < 0.5);

async function vendorsOf(tsid) {
  const data = await loadStreetDataFromFs(tsid, streetsDir);
  const platforms = platformsScreen(data);
  const pop = populationForStreet(tsid, ecologyForStreet(tsid), { starter: tsid === index.default });
  const row = vendorNpcsFor(ecology, tsid);
  const requests = [...placementRequests(pop), ...vendorNpcPlacementGroups(row, { npc_gardening_vendor: measuredGardenVendor(tsid) })];
  const plan = planStreetPlacements(platforms, requests, { worldW: streetWidth(data), seed: tsid, reserved: streetReservedSpots(data) });
  const points = plan.groups[VENDOR_PLACEMENT_KEY] || [];
  return { platforms, worldW: streetWidth(data), vendors: vendorNpcList(row).map((classTsid, i) => ({ classTsid, point: points[i], i })).filter((v) => v.point) };
}

describe('#494 followFloorY', () => {
  // A floor that climbs 300 px over 600 px, and a shelf under its far end.
  const slope = { id: 'slope', x1: 0, y1: 1000, x2: 600, y2: 700, pcPerm: -1, itemPerm: -1 };
  const shelf = { id: 'shelf', x1: 400, y1: 1000, x2: 700, y2: 1000, pcPerm: -1, itemPerm: -1 };
  const platforms = [slope, shelf];
  it('a jump up the slope lands on the slope, where the plain lookup finds none or the shelf', () => {
    assert.equal(walkSurfaceY([slope], 500, 1000, VENDOR_REACH), null);
    assert.equal(walkSurfaceY(platforms, 500, 1000, VENDOR_REACH), 1000);
    assert.equal(followFloorY(platforms, 0, 1000, 500, VENDOR_REACH), 750);
    assert.equal(followFloorY(platforms, 500, 750, 0, VENDOR_REACH), 1000);
  });
  it('a small step is the plain lookup, and a gap on the way is null', () => {
    assert.equal(followFloorY(platforms, 100, 950, 101, VENDOR_REACH), walkSurfaceY(platforms, 101, 950, VENDOR_REACH));
    assert.equal(followFloorY([{ id: 'a', x1: 0, y1: 500, x2: 100, y2: 500, pcPerm: -1, itemPerm: -1 }, { id: 'b', x1: 200, y1: 500, x2: 300, y2: 500, pcPerm: -1, itemPerm: -1 }], 50, 500, 250), null);
  });
});

describe('#494 every vendor walks on its floor', () => {
  it('at any clock time a page starts at, a walking vendor stands on the floor under it', async () => {
    const before = {};
    let checked = 0;
    for (const tsid of Object.keys(ecology.vendors).sort()) {
      if (!index.streets[tsid]) continue;
      const { platforms, worldW, vendors } = await vendorsOf(tsid);
      for (const { classTsid, point, i } of vendors) {
        if (!VENDOR_WALK[classTsid]) continue;
        // features/vendor-npcs-feature.js spawn: its run of floor and its seeded round.
        const span = walkerSpan(platforms, point.x, point.y, { worldW, ...VENDOR_REACH });
        const plan = vendorPlan(classTsid, { l: span.l, r: span.r, x0: point.x }, chickenSeed(i, point.x));
        for (let k = 0; k < SAMPLES; k += 1) {
          const t = Math.round((plan.ms * k) / SAMPLES);
          const { x } = vendorWalkAt(plan, t, point.x);
          // A page that opens at t: its first frame jumps from the spot to x (stepNpc).
          const y = followFloorY(platforms, point.x, point.y, x, VENDOR_REACH);
          assert.ok(y != null && onFloor(platforms, x, y), `${tsid} ${classTsid} t=${t} x=${Math.round(x)} y=${y}`);
          checked += 1;
          const old = walkSurfaceY(platforms, x, point.y, VENDOR_REACH) ?? point.y;
          if (Math.abs(old - y) >= 0.5) before[tsid] = (before[tsid] || 0) + 1;
        }
      }
    }
    assert.ok(checked >= SAMPLES * 5, `${checked} samples`);
    // Before: the lookup from the spot's height put Level 2 East's Meal Vendor off its floor at
    // part of its round (it kept the spot's height in the air, or took another line).
    assert.ok(before[LEVEL_2_EAST] > 0, JSON.stringify(before));
  });

  it('the feature follows the floor from where it last stood', () => {
    const feature = read('public/js/features/vendor-npcs-feature.js');
    assert.match(feature, /followFloorY\(engine\.platforms, npc\.floorX, npc\.feetY, spr\.x, VENDOR_REACH\)/);
    assert.match(feature, /floorX: point\.x/);
  });

  it('the shared paths that snap follow their floor too', () => {
    for (const f of ['public/js/features/crabs-feature.js', 'public/js/features/fire-dragon-feature.js', 'public/js/features/foxes-feature.js', 'public/js/features/heli-kitties-feature.js', 'public/game.js']) {
      assert.match(read(f), /followFloorY\(/, f);
    }
  });
});
