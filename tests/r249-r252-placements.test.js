/**
 * Player reports #249, #250 and #252 (filed on v0.34.0):
 * - #249 Vuoksi Vale: a Jellisac hung on a ledge in mid-air; in Glitch every one sat in the dark holes
 *   in the rock faces.
 * - #250 Ratin Jot Jog: a Peat Bog lay along the big root's 0.5 slope, 211 px over the floor, its low
 *   end 38 px over air.
 * - #252 Chakra Phool Herb Gardens: the small planter boxes were decos with nothing to do; Glitch had
 *   herbs growing in every box.
 * Now Jellisacs and Peat Bogs have spots measured on players' snaps (assets/content/node-spots.json,
 * js/node-spots-data.js, tools/snap-placements/nodes.py) like the Mortar Barnacles (#210), the planned
 * rest keep to steady floors with both ends over a floor, and each Herb Gardens street has one herb bed
 * in each of its planter boxes, the two old beds' plots (and crops) kept. None of this needs the snaps.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { groundBeneath, platformsScreen, streetHeight, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';
import {
  GARDEN_BOX_STREETS,
  LEGACY_BOX_BEDS,
  PLACEMENT_FOOTPRINTS,
  PLANNED_NODE_CAPS,
  STEADY_FLOOR_GROUPS,
  ecologyForStreet,
  footOverAir,
  measuredNodeSpots,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetGardenBoxBeds,
  streetGardenBoxes,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=f27417a8';
import { resourcePlacementGroups, resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=451781d3';
import { JELLISAC_SPOTS, PEAT_SPOTS } from '../public/js/node-spots-data.js?v=4984e395';
import { bedKind, createGarden, fitGardenToBed, plantPlot } from '../public/js/garden.js?v=17d048df';
import { bedKey, parsePlotId } from '../public/js/shared-gardens.js?v=c1f90bc0';
import { normalizeGardenSnapshot } from '../public/js/player-save.js?v=03381399';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const catalog = read('public/assets/content/street-ecology.json');
const spotsFile = read('public/assets/content/node-spots.json');
const index = read('public/assets/streets/index.json');
const street = (tsid) => read(`public/assets/streets/${tsid}.json`);
setStreetEcologyCatalog(catalog);

const VUOKSI = 'GTJ135JKNQU113D';
const RATIN = 'GIFDIDJT0GU1CR8';
const CHAKRA = 'GA95U14319524O9';

describe('reports #249, #250: the measured Jellisac and Peat Bog spots', () => {
  it('have the documented shape, on real streets, inside each street and within its count', () => {
    assert.match(spotsFile.source, /eleven giants/i);
    assert.match(spotsFile.source, /no pixels/i);
    for (const [cls, variants] of [['jellisac', 4], ['peat_1', 3]]) {
      const tsids = Object.keys(spotsFile.classes[cls].streets);
      assert.ok(tsids.length >= 30, `${cls}: ${tsids.length} streets`);
      for (const tsid of tsids) {
        assert.ok(index.streets[tsid], tsid);
        const data = street(tsid);
        const count = ecologyForStreet(tsid).counts[cls];
        const spots = spotsFile.classes[cls].streets[tsid];
        assert.ok(spots.length >= 1 && spots.length <= count, `${cls} ${tsid} ${spots.length} of ${count}`);
        for (const [x, y, v] of spots) {
          assert.ok(x > 0 && x < streetWidth(data) && y > 0 && y <= streetHeight(data), `${cls} ${tsid} ${x},${y}`);
          assert.ok(Number.isInteger(v) && v >= 1 && v <= variants, `${cls} ${tsid} variant ${v}`);
        }
      }
    }
  });

  it('are what the game reads (js/node-spots-data.js matches the JSON)', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(JELLISAC_SPOTS)), spotsFile.classes.jellisac.streets);
    assert.deepEqual(JSON.parse(JSON.stringify(PEAT_SPOTS)), spotsFile.classes.peat_1.streets);
  });

  it('put Vuoksi Vale\'s Jellisacs where the snaps show them, in the holes above the floor', () => {
    const spots = measuredNodeSpots(VUOKSI).jellisac;
    assert.ok(spots.length >= 5, `${spots.length} measured`);
    const pop = populationForStreet(VUOKSI, ecologyForStreet(VUOKSI));
    const plan = resourceSpawnPlan(pop, () => []).filter((row) => row.classTsid === 'jellisac');
    assert.deepEqual(plan.map((row) => row.key).slice(0, spots.length), spots.map((_, i) => `jellisac:${i}`));
    for (const row of plan) {
      assert.equal(row.wall, true);
      assert.match(row.variant, /^jellySack[1-4]$/);
    }
    // The ledge spot the report names (x 3298) is gone.
    assert.ok(!plan.some((row) => Math.abs(row.x - 3298) < 30), 'no Jellisac at the ledge');
  });

  it('lay Ratin Jot Jog\'s Peat Bogs where the snaps show them, never on the root', () => {
    const spots = measuredNodeSpots(RATIN).peat_1;
    assert.equal(spots.length, 2);
    const lines = platformsScreen(street(RATIN));
    for (const s of spots) {
      assert.match(s.variant, /^peat[1-3]$/);
      // Lying on a floor: one is right under the cell's foot.
      const floor = groundBeneath(lines, s.x, s.y - 20, 0);
      assert.ok(floor && Math.abs(floor.y - s.y) <= 16, `${s.x},${s.y}: floor ${floor?.y}`);
    }
    const pop = populationForStreet(RATIN, ecologyForStreet(RATIN));
    assert.ok(!resourcePlacementGroups(pop).some((g) => g.key === 'resource:peat_1'), 'no Peat Bog is planned there');
  });
});

describe('reports #249, #250: the ones the snaps do not show', () => {
  it('have footprints, steady-floor rules and caps', () => {
    assert.equal(PLACEMENT_FOOTPRINTS['resource:peat_1'], 180);
    assert.equal(PLACEMENT_FOOTPRINTS['resource:jellisac'], 60);
    assert.deepEqual({ ...STEADY_FLOOR_GROUPS['resource:peat_1'] }, { maxSlope: 0.15, ledgeRun: 0, edgeDrop: 12 });
    assert.deepEqual({ ...STEADY_FLOOR_GROUPS['resource:jellisac'] }, { maxSlope: 0.25, ledgeRun: 240, edgeDrop: 12 });
    assert.equal(PLANNED_NODE_CAPS.jellisac, 4);
    assert.equal(PLANNED_NODE_CAPS.peat_1, 3);
    assert.equal(PLANNED_NODE_CAPS.mortar_barnacle, 6);
  });

  it('measure an end over air (footOverAir)', () => {
    const lines = [{ id: 'f', x1: 0, y1: 500, x2: 400, y2: 500 }];
    assert.equal(footOverAir(lines, { x: 200, y: 500 }, 90), 0);
    assert.equal(footOverAir(lines, { x: 350, y: 500 }, 90), Infinity, 'the right end is past the floor');
    const ramp = [{ id: 'r', x1: 0, y1: 600, x2: 400, y2: 400 }];
    assert.ok(footOverAir(ramp, { x: 200, y: 500 }, 90) >= 44, 'the low end of a 0.5 slope');
  });

  it('never lay a Peat Bog on a 0.5 root or with an end past a ledge; it lies flat on a ledge or the floor', () => {
    const lines = [
      { id: 'root', x1: 100, y1: 700, x2: 700, y2: 400 },
      { id: 'ledge', x1: 900, y1: 500, x2: 1150, y2: 500 },
      { id: 'lip', x1: 1300, y1: 450, x2: 1420, y2: 450 },
      { id: 'floor', x1: 0, y1: 900, x2: 1600, y2: 900 },
    ];
    const plan = planStreetPlacements(lines, [{ key: 'resource:peat_1', count: 6, clearance: 60 }], { worldW: 1600, seed: 'r250', unreached: null });
    const spots = plan.groups['resource:peat_1'];
    assert.ok(spots.length >= 3);
    for (const s of spots) {
      assert.ok(!s.id.startsWith('root:') && !s.id.startsWith('lip:'), `peat on ${s.id}`);
      assert.ok(footOverAir(lines, s, 90) <= 12, `${s.id} end over air`);
    }
    assert.deepEqual(plan.fallbacks, []);
  });

  it('plan at most the cap on a street with no snap, keeping the file count', () => {
    for (const [cls, cap] of [['jellisac', 4], ['peat_1', 3]]) {
      const tsid = Object.keys(catalog.streets).find((t) => (catalog.streets[t]?.counts?.[cls] || 0) > cap + 1 && !measuredNodeSpots(t)?.[cls]);
      if (!tsid) continue;
      const pop = populationForStreet(tsid, ecologyForStreet(tsid));
      assert.equal(pop.resourceCounts[cls], catalog.streets[tsid].counts[cls]);
      assert.equal(pop.resourceNodeClasses.filter((id) => id === cls).length, cap, `${cls} ${tsid}`);
    }
  });
});

describe('report #252: a herb bed in every planter box', () => {
  it('the three Herb Gardens streets have as many boxes as their location files have Gardens', () => {
    const want = { GA95U14319524O9: 8, GA97L62229522GS: 5, GA99U5PI39524GN: 7 };
    assert.deepEqual([...GARDEN_BOX_STREETS].sort(), Object.keys(want).sort());
    for (const [tsid, n] of Object.entries(want)) {
      assert.equal(ecologyForStreet(tsid).counts.garden, n);
      const data = street(tsid);
      assert.equal(streetGardenBoxes(data).length, n, tsid);
      const pop = populationForStreet(tsid, ecologyForStreet(tsid));
      assert.equal(pop.gardens, 0, 'none planned');
      assert.equal(pop.gardenBoxes, n, 'the cap of two lifted');
      const beds = streetGardenBoxBeds(data, pop);
      assert.equal(beds.length, n);
      assert.equal(new Set(beds.map((b) => b.bed)).size, n, 'one key each');
      for (const b of beds) {
        assert.equal(b.gardenType, 'herb');
        assert.match(b.bed, /^herb[2-9]?$/);
        assert.equal(bedKind(b.bed), 'herb');
        // The bed stands in its box: centred on it, its front plots on the soil above the rim.
        assert.equal(b.x, b.box.x);
        assert.ok(b.y < b.box.y - 15 && b.y > b.box.y - b.box.h, `${tsid} ${b.bed} y ${b.y} in box ${b.box.y - b.box.h}..${b.box.y}`);
        assert.deepEqual([b.rows, b.cols], b.box.sprite.match(/(\d)x(\d)$/).slice(1).map(Number), 'rows x cols, as the snaps show');
      }
      // The old beds' keys go to boxes that hold every one of their plots.
      for (const legacy of LEGACY_BOX_BEDS) {
        const b = beds.find((row) => row.bed === legacy.bed);
        assert.ok(b && b.cols >= legacy.cols && b.rows >= legacy.rows, `${tsid} ${legacy.bed}`);
      }
      // The boxes are kept clear: nothing else is planned in one.
      assert.equal(streetReservedSpots(data).filter((p) => p.key.startsWith('garden-box:')).length, n);
    }
    // Nowhere else: Egret Taun Towers, floor 2 has four boxes and no Gardens.
    assert.deepEqual(streetGardenBoxBeds(street('GUVMHGV3U2V2J7M'), populationForStreet('GUVMHGV3U2V2J7M', ecologyForStreet('GUVMHGV3U2V2J7M'))), []);
  });

  it('the old herb2 and herb beds\' crops stay, in their boxes (fitGardenToBed)', () => {
    const now = 1_000_000;
    const old = createGarden({ cols: 4, rows: 2, gardenType: 'herb', bed: 'herb2', now });
    old.plots['4-2'] = { ...old.plots['4-2'], state: 'crop', seed: 'herb_seed_rubeweed' };
    old.plots['1-1'] = { ...old.plots['1-1'], state: 'seeds', seed: 'herb_seed_rubeweed', wet: true, wetAt: now };
    const saved = normalizeGardenSnapshot(JSON.parse(JSON.stringify(old)));
    assert.equal(fitGardenToBed(saved, 4, 3, now), true);
    assert.deepEqual([saved.cols, saved.rows], [4, 3]);
    assert.equal(Object.keys(saved.plots).length, 12);
    assert.equal(saved.plots['4-2'].state, 'crop');
    assert.equal(saved.plots['1-1'].state, 'seeds');
    assert.equal(saved.plots['4-3'].state, 'clean');
    // A smaller box never drops a plot holding something; bare plots past it go.
    const g = createGarden({ cols: 4, rows: 2, gardenType: 'herb', now });
    g.plots['4-1'] = { ...g.plots['4-1'], state: 'shoots', seed: 'herb_seed_rubeweed' };
    fitGardenToBed(g, 3, 1, now);
    assert.deepEqual([g.cols, g.rows], [4, 1]);
    assert.equal(g.plots['4-1'].state, 'shoots');
    assert.equal(g.plots['1-2'], undefined);
    assert.equal(fitGardenToBed(g, 4, 1, now), false);
  });

  it('a box bed takes herb seeds only', () => {
    const g = createGarden({ cols: 3, rows: 1, gardenType: 'herb', bed: 'herb5' });
    const inv = { seed_spinach: 1 };
    const pc = { energy: 100, mood: 100 };
    const r = plantPlot(g, '1-1', inv, pc, 'seed_spinach');
    assert.equal(g.plots['1-1'].state, 'clean', JSON.stringify(r));
  });

  it('herb3..herb9 are bed keys the server, the plot ids and the save know', () => {
    assert.equal(bedKey('herb7'), 'herb7');
    assert.equal(bedKey('herb10'), 'default');
    assert.deepEqual(parsePlotId('herb8:3-1'), { bed: 'herb8', key: '3-1' });
    const go = readFileSync(serverPath('gardens.go'), 'utf8');
    assert.match(go, /herb\[2-9\]\?/);
  });

  it('game.js draws each box bed in its box (style none: the box is the bed)', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /streetGardenBoxBeds\(data, currentStreetPopulation\)\.forEach\(\(bed\) => \{\n\s*spawnGarden\(\{ x: bed\.x, y: bed\.y, cols: bed\.cols, rows: bed\.rows, gardenType: bed\.gardenType, bed: bed\.bed, style: 'none' \}\);/);
  });

  it('the server keeps every box bed (data/gardens.json)', { skip: skipWithoutServer }, () => {
    const data = JSON.parse(readFileSync(serverPath('data', 'gardens.json'), 'utf8'));
    const beds = data.streets[CHAKRA];
    assert.equal(beds.length, 8);
    const pop = populationForStreet(CHAKRA, ecologyForStreet(CHAKRA));
    const want = streetGardenBoxBeds(street(CHAKRA), pop).map((b) => [b.bed, b.cols, b.rows, Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10]);
    assert.deepEqual(beds, want);
  });
});

describe('reports #249, #250: the measuring tool', () => {
  const py = spawnSync('python3.11', ['-c', 'print(1)'], { encoding: 'utf8' });
  const skip = py.status === 0 ? false : 'python3.11 not installed';
  const tool = join(root, 'tools/snap-placements/nodes.py');

  it('skips cleanly without the snaps and writes nothing', { skip }, () => {
    const before = readFileSync(join(root, 'public/assets/content/node-spots.json'), 'utf8');
    const run = spawnSync('python3.11', ['-I', tool, '--snaps', join(root, 'no-such-snaps-dir')], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /no snaps/);
    assert.equal(readFileSync(join(root, 'public/assets/content/node-spots.json'), 'utf8'), before);
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
