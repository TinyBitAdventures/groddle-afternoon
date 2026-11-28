/**
 * G940 (report #469): street gardens follow players' 2012 full-street snaps (Austin 2026-11-17).
 * tools/snap-placements/gardens.py measures each bed (its foot, plots across and deep, crop or herb,
 * bed art) and the scarecrow into assets/content/garden-spots.json and js/garden-spots-data.js;
 * street-ecology.js gardenPlacementRequest seats the beds as fixed points (every Garden the
 * location file names: the cap of two lifted), garden.js streetGardenBeds lays them out and keys
 * them, and vendor-npcs.js seats the scarecrow where its snap shows it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ecologyForStreet,
  gardenPlacementRequest,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=e5263244';
import { platformYAt, platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import { GARDEN_SPOTS } from '../public/js/garden-spots-data.js?v=3c5d4164';
import { CROP_GARDEN_STREETS_2012, gardenBedWidth, isCropGardenStreet, measuredGardenBeds, measuredGardenVendor, pictureGardenBeds } from '../public/js/garden-beds.js?v=2ac6a12c';
import { BED_KEY_RE, SEED_CATALOG, bedKind, createGarden, harvestLostBeds, streetGardenBeds } from '../public/js/garden.js?v=fefa7bcd';
import { bedKey, parsePlotId, plotId } from '../public/js/shared-gardens.js?v=464472e5';
import { VENDOR_PLACEMENT_KEY, vendorNpcPlacementGroups, vendorNpcsFor } from '../public/js/vendor-npcs.js?v=90b0c123';
import { normalizeWorldSnapshot } from '../public/js/player-save.js?v=5e05161a';
import { placementRequests } from '../tools/build-realtime-objects.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const ecology = JSON.parse(read('public/assets/content/street-ecology.json'));
setStreetEcologyCatalog(ecology);
const street = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));
const measured = JSON.parse(read('public/assets/content/garden-spots.json')).streets;
const MIDDLE_ARBOR = 'GCR101UN0NJ1QPQ';
const gardenStreets = Object.entries(ecology.streets).filter(([, r]) => (r?.counts?.garden || 0) > 0).map(([t]) => t);
const plan = (tsid, pop) => {
  const s = street(tsid);
  return planStreetPlacements(platformsScreen(s), placementRequests(pop), { worldW: streetWidth(s), seed: tsid, reserved: streetReservedSpots(s) });
};

describe('G940: street gardens where the 2012 snaps show them', () => {
  it('the data is current (tools/snap-placements/gardens.py --check) and cites each snap', () => {
    execFileSync('python3.11', ['-I', join(root, 'tools/snap-placements/gardens.py'), '--check'], { stdio: 'pipe' });
    assert.deepEqual(Object.keys(GARDEN_SPOTS).sort(), Object.keys(measured).sort());
    for (const [tsid, row] of Object.entries(measured)) {
      assert.match(row.snap, /^[^/]+\/(zoi|mackenzie|cleops|shellos)\/.+_\1\.png$/, row.label);
      assert.equal(row.how.length, row.beds.length, row.label);
      assert.deepEqual(GARDEN_SPOTS[tsid].beds, row.beds, row.label);
    }
    // Reference only: no snap pixel in the repo.
    const tracked = execFileSync('git', ['ls-files', '--', '*_zoi.png', '*_mackenzie.png', '*_cleops.png', '*_shellos.png'], { cwd: root, encoding: 'utf8' });
    assert.equal(tracked.trim(), '');
  });

  it('each measured street has as many beds as its location file names Gardens, and its 2012 plot count', () => {
    for (const [tsid, row] of Object.entries(measured)) {
      assert.equal(row.beds.length, ecology.streets[tsid].counts.garden, row.label);
      if (row.plots2012) assert.equal(row.beds.reduce((n, b) => n + b[2] * b[3], 0), row.plots2012, row.label);
    }
    // Middle Arbor (report #469): three beds by 'All may plant', one past the mailbox, four by 'Free to plant'.
    const xs = measured[MIDDLE_ARBOR].beds.map((b) => b[0]);
    assert.equal(xs.filter((x) => x < 1300).length, 3);
    assert.equal(xs.filter((x) => x > 1900 && x < 2100).length, 1);
    assert.equal(xs.filter((x) => x > 3300 && x < 5000).length, 4);
    assert.ok(Math.abs(measuredGardenVendor(MIDDLE_ARBOR).x - 4140) < 20);
  });

  it('every bed stands on a floor inside its street, and no two beds overlap', () => {
    for (const [tsid, row] of Object.entries(measured)) {
      const s = street(tsid);
      const W = s.bounds.r - s.bounds.l;
      const floors = platformsScreen(s);
      const boxes = measuredGardenBeds(tsid).map((b) => ({ ...b, w: gardenBedWidth(b) }));
      for (const b of boxes) {
        assert.ok(b.x - b.w / 2 > 0 && b.x + b.w / 2 < W, `${row.label} bed at ${b.x}`);
        // Glitch drew a bed on the ground art behind the walk line: its foot 11 to 32 px above the floor.
        const near = floors.map((p) => platformYAt(p, b.x, 0)).filter((y) => y != null && y - b.y >= 0 && y - b.y <= 40);
        assert.ok(near.length, `${row.label}: a floor just in front of the bed at ${b.x},${b.y}`);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const c = boxes[j];
          if (Math.abs(a.y - c.y) > 60) continue;
          assert.ok(Math.abs(a.x - c.x) >= (a.w + c.w) / 2, `${row.label}: beds ${i} and ${j} overlap`);
        }
      }
    }
  });

  it('the cap of two is lifted: every garden street plans all its Gardens, the measured ones fixed where measured', () => {
    for (const tsid of gardenStreets) {
      const row = ecology.streets[tsid];
      const pop = populationForStreet(tsid, ecologyForStreet(tsid));
      const want = /Herb Gardens$/.test(row.label) ? 0 : row.counts.garden; // report #252: the planter boxes hold those
      assert.equal(pop.gardens, want, row.label);
      const req = gardenPlacementRequest(pop);
      assert.equal(req.count, want, row.label);
      // G1085: the two streets no snap shows are seated from Tiny Speck's picture (PICTURE_GARDEN_SPOTS).
      assert.equal((req.fixed || []).length, measured[tsid] || pictureGardenBeds(tsid) ? want : 0, row.label);
      if (!want) continue;
      const pts = plan(tsid, pop).groups.gardens;
      assert.equal(pts.length, want, row.label);
      (measuredGardenBeds(tsid) || []).forEach((b, i) => assert.deepEqual([pts[i].x, pts[i].y], [b.x, b.y], `${row.label} bed ${i}`));
    }
  });

  it('beds are the size and kind the snap shows; planned beds on the 2012 crop streets are crop beds; Hechey Track keeps crop and herb', () => {
    const pop = populationForStreet(MIDDLE_ARBOR, ecologyForStreet(MIDDLE_ARBOR));
    const beds = streetGardenBeds(MIDDLE_ARBOR, plan(MIDDLE_ARBOR, pop).groups.gardens, pop);
    assert.deepEqual(beds.map((b) => `${b.bed} ${b.cols}x${b.rows} ${b.gardenType}`), [
      'default 4x3 default', 'default2 2x2 default', 'default3 3x3 default', 'default4 2x1 default',
      'default5 3x2 default', 'default6 4x3 default', 'default7 3x3 default', 'default8 3x3 default',
    ]);
    assert.ok(beds.every((b) => b.style === 'none'));
    // Zog's 2012 counts: crop plots only on these streets; Kipacre Greens has no snap, its seven (from Tiny Speck's picture, G1085) are crops.
    assert.ok(CROP_GARDEN_STREETS_2012.every(isCropGardenStreet));
    const kipacre = 'GCR202JSVIN1STL';
    const kpop = populationForStreet(kipacre, ecologyForStreet(kipacre));
    const kbeds = streetGardenBeds(kipacre, plan(kipacre, kpop).groups.gardens, kpop);
    assert.equal(kbeds.length, 7);
    // Sized from its June 2012 loading picture: 49 plots, Zog's count.
    assert.ok(kbeds.every((b) => b.gardenType === 'default'));
    assert.equal(kbeds.reduce((n, b) => n + b.cols * b.rows, 0), 49);
    assert.equal(new Set(kbeds.map((b) => b.bed)).size, 7);
    const hechey = 'GLI2V0UN7RD1T2J';
    const hpop = populationForStreet(hechey, ecologyForStreet(hechey), { starter: true });
    assert.deepEqual(streetGardenBeds(hechey, [{ x: 100, y: 500 }, { x: 900, y: 500 }], hpop).map((b) => [b.bed, b.gardenType, b.cols, b.rows, b.y]),
      [['default', 'default', 4, 2, 502], ['herb', 'herb', 3, 2, 502]]);
  });

  it('crop bed keys default2..default12 are street bed keys in the save, the plot ids and the bed kinds', () => {
    for (const k of ['default', 'default2', 'default8', 'default12', 'herb', 'herb9']) {
      assert.match(k, BED_KEY_RE);
      assert.equal(bedKey(k), k);
      assert.deepEqual(parsePlotId(plotId(k, '3-2')), { bed: k, key: '3-2' });
    }
    for (const k of ['default1', 'default13', 'herb10']) assert.doesNotMatch(k, BED_KEY_RE);
    assert.equal(bedKind('default7'), 'default');
    const world = normalizeWorldSnapshot({ streets: { [MIDDLE_ARBOR]: { gardens: { default8: { gardenType: 'default', cols: 3, rows: 3, plots: {} } } } } });
    assert.equal(world.streets[MIDDLE_ARBOR].gardens.default8.cols, 3);
  });

  it('solo: a saved bed the street no longer has (its old herb bed) is harvested into the pack once, the full crop', () => {
    const herb = createGarden({ gardenType: 'herb', cols: 3, rows: 2 });
    Object.assign(herb.plots['1-1'], { state: 'seeds', seed: 'herb_seed_rubeweed' });
    Object.assign(herb.plots['2-1'], { state: 'crop', seed: 'herb_seed_rubeweed' });
    Object.assign(herb.plots['3-1'], { state: 'dirty' });
    const crop = createGarden({ cols: 4, rows: 2 });
    Object.assign(crop.plots['1-1'], { state: 'shoots', seed: 'seed_spinach' });
    const gardens = { default: crop, herb, notabed: { plots: {} } };
    const out = harvestLostBeds(gardens, new Set(['default', 'default2']));
    assert.deepEqual(out, { items: { [SEED_CATALOG.herb_seed_rubeweed.cropId]: 2 * SEED_CATALOG.herb_seed_rubeweed.produces }, beds: ['herb'] });
    assert.deepEqual(Object.keys(gardens).sort(), ['default', 'notabed']);
    assert.deepEqual(harvestLostBeds(gardens, new Set(['default'])), { items: {}, beds: [] }, 'once');
    const game = read('public/game.js');
    assert.match(game, /if \(GAME_MODE !== 'multiplayer'\) harvestLostStreetBeds\(\);/);
    assert.match(game, /for \(const \[id, n\] of got\) addItem\(inv, id, n\);/);
  });

  it('the scarecrow stands where the snap shows it, at its index, seated late', () => {
    for (const [tsid, row] of Object.entries(measured)) {
      if (!row.vendor) continue;
      const vendors = vendorNpcsFor(ecology, tsid);
      assert.ok(vendors?.npc_gardening_vendor, row.label);
      const [group] = vendorNpcPlacementGroups(vendors, { npc_gardening_vendor: measuredGardenVendor(tsid) });
      assert.equal(group.key, VENDOR_PLACEMENT_KEY);
      assert.equal(group.late, true);
      assert.deepEqual(group.fixed, [{ x: row.vendor[0], y: row.vendor[1], index: 0 }]);
      const s = street(tsid);
      const pop = populationForStreet(tsid, ecologyForStreet(tsid));
      const p = planStreetPlacements(platformsScreen(s), [...placementRequests(pop), group], { worldW: streetWidth(s), seed: tsid, reserved: streetReservedSpots(s) });
      assert.deepEqual([p.groups[VENDOR_PLACEMENT_KEY][0].x, p.groups[VENDOR_PLACEMENT_KEY][0].y], row.vendor, row.label);
    }
    // No spot: planned, as before.
    assert.deepEqual(vendorNpcPlacementGroups({ npc_gardening_vendor: 1 }), [{ key: VENDOR_PLACEMENT_KEY, count: 1, clearance: 140 }]);
  });
});
