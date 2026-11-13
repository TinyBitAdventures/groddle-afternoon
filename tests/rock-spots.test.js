/**
 * The placements audit (2026-11-12): Glitch's rocks were set by hand (rock_metal_1.js etc.
 * obey_physics false) in three shapes a kind, drawn 1:1, and the planner put 31% of them at a
 * height where the street never had one, never on its upper floors, and every big thing on any
 * slope. Now:
 * - rocks stand where players' 2012 snaps show them, in the shape they show
 *   (tools/snap-placements/nodes.py, assets/content/node-spots.json, js/node-spots-data.js);
 * - a planned rock takes a shape in Glitch's proportions (street-ecology.js rockShapeFor);
 * - every reachable floor height is planned (buildPlatformCandidates), big things keep off slopes
 *   over BIG_THING_MAX_SLOPE while any other spot is left, and Dirt Piles, Ice Nubbins, Dust Traps,
 *   Paper Trees and Visiting Stones never hang an end over air (STEADY_FLOOR_GROUPS).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { imageSize } from '../tools/image-size.mjs';
import { ROCK_CATALOG, ROCK_SHAPES, ROCK_SHAPE_SHEETS, rockShapeSheet } from '../public/js/mining.js?v=b62c7722';
import {
  BIG_THING_GROUPS,
  BIG_THING_MAX_SLOPE,
  MEASURED_NODE_SPOTS,
  PLACEMENT_FOOTPRINTS,
  ROCK_SHAPE_SHARES,
  ROCK_SHAPE_WIDTHS,
  STEADY_FLOOR_GROUPS,
  buildPlatformCandidates,
  ecologyForStreet,
  footOverAir,
  measuredNodeSpots,
  planStreetPlacements,
  populationForStreet,
  rockPlacementRequest,
  rockShapeFor,
  rockSpawnPlan,
  setStreetEcologyCatalog,
} from '../public/js/street-ecology.js?v=0f046853';
import { ROCK_BERYL_SPOTS, ROCK_DULLITE_SPOTS, ROCK_METAL_SPOTS, ROCK_SPARKLY_SPOTS } from '../public/js/node-spots-data.js?v=8d619d0b';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS/items');
const spotsFile = JSON.parse(read('public/assets/content/node-spots.json'));
const catalog = JSON.parse(read('public/assets/content/street-ecology.json'));
const KINDS = ['rock_metal_1', 'rock_beryl_1', 'rock_dullite_1', 'rock_sparkly_1'];
const floor = (id, x1, x2, y1, y2 = y1) => ({ id, x1, y1, x2, y2, pcPerm: -1, itemPerm: -1 });

describe('rock shapes', () => {
  it('are one rock to mine: the _2 and _3 classes differ from _1 only in their art and listing', { skip: !existsSync(GSJS) && 'no GameServerJS' }, () => {
    for (const kind of ['metal', 'beryl', 'dullite', 'sparkly']) {
      const strip = (n) => read0(join(GSJS, `rock_${kind}_${n}.js`)).replaceAll(`rock_${kind}_${n}`, 'X')
        .split('\n').filter((l) => !/'thumb'|asset_swf_v|'position'|has_infopage|proxy_item|is_routable|"natural-resources"/.test(l)).join('\n');
      for (const n of [2, 3]) {
        assert.equal(strip(n), strip(1), `rock_${kind}_${n}`);
        assert.match(read0(join(GSJS, `rock_${kind}_${n}.js`)), new RegExp(`var proxy_item = "rock_${kind}_1";`));
      }
    }
  });

  it('draw Tiny Speck\'s five-frame sheets at the sizes the game slices', () => {
    for (const kind of KINDS) {
      for (const shape of [1, 2, 3]) {
        const sheet = rockShapeSheet(kind, shape);
        const size = imageSize(join(root, 'public', sheet.worldSheet));
        assert.deepEqual([size.w, size.h], [sheet.frameWidth * 5, sheet.frameHeight], `${kind} ${shape}`);
      }
      assert.equal(rockShapeSheet(kind, 1), ROCK_CATALOG[kind]);
      assert.equal(Object.keys(ROCK_SHAPES[kind]).join(), '2,3');
    }
    assert.equal(Object.keys(ROCK_SHAPE_SHEETS).length, 8);
    const game = read('public/game.js');
    assert.match(game, /spawnMineRocks\(currentStreetPopulation\.rockClasses, rockSpawnPlan\(currentStreetPopulation, placement\('rocks'\), data\.tsid\)\);/);
    assert.match(game, /rockPlacementRequest\(currentStreetPopulation\),/);
  });

  it('a planned rock takes a shape in the snaps\' proportions, a narrower one where its floor is short', () => {
    for (const kind of KINDS) {
      const shares = ROCK_SHAPE_SHARES[kind];
      const total = shares.reduce((a, b) => a + b, 0);
      const got = [0, 0, 0];
      for (let i = 0; i < 6000; i += 1) got[rockShapeFor(`G${i}`, i % 7, kind) - 1] += 1;
      got.forEach((n, i) => assert.ok(Math.abs(n / 6000 - shares[i] / total) < 0.03, `${kind} ${got} vs ${shares}`));
      // the same rock is the same shape every time (every page and the server's layout agree)
      assert.equal(rockShapeFor('GA5809MJM7T2N18', 2, kind), rockShapeFor('GA5809MJM7T2N18', 2, kind));
      // a _3 never stands on a floor narrower than its art
      for (let i = 0; i < 400; i += 1) {
        const s = rockShapeFor(`H${i}`, i, kind, 125);
        assert.ok(ROCK_SHAPE_WIDTHS[kind][s - 1] <= 125 || s === [1, 2, 3].reduce((a, b) => (ROCK_SHAPE_WIDTHS[kind][b - 1] < ROCK_SHAPE_WIDTHS[kind][a - 1] ? b : a)), `${kind} ${s}`);
      }
    }
  });
});

describe('rocks the snaps show', () => {
  setStreetEcologyCatalog(catalog);

  it('are what the game reads (js/node-spots-data.js matches the JSON)', () => {
    const mods = { rock_metal_1: ROCK_METAL_SPOTS, rock_beryl_1: ROCK_BERYL_SPOTS, rock_dullite_1: ROCK_DULLITE_SPOTS, rock_sparkly_1: ROCK_SPARKLY_SPOTS };
    for (const kind of KINDS) {
      assert.deepEqual(JSON.parse(JSON.stringify(mods[kind])), spotsFile.classes[kind].streets, kind);
      assert.equal(MEASURED_NODE_SPOTS[kind].streets, mods[kind]);
    }
  });

  it('cover the snapped rock streets, never more of a kind than the street\'s file names, in all three shapes', () => {
    let total = 0;
    const shapes = [0, 0, 0];
    const streets = new Set();
    for (const kind of KINDS) {
      for (const [tsid, rows] of Object.entries(spotsFile.classes[kind].streets)) {
        const count = catalog.streets[tsid]?.counts?.[kind] || 0;
        assert.ok(rows.length <= count, `${tsid} ${kind} ${rows.length} > ${count}`);
        for (const [x, y, shape] of rows) {
          assert.ok(Number.isFinite(x) && Number.isFinite(y) && [1, 2, 3].includes(shape), `${tsid} ${x},${y},${shape}`);
          shapes[shape - 1] += 1;
        }
        total += rows.length;
        streets.add(tsid);
      }
    }
    assert.ok(total >= 650 && streets.size >= 170, `${total} rocks on ${streets.size} streets`);
    // 60% of Glitch's rocks are the _2 and _3 shapes (the audit's 698: 416).
    assert.ok((shapes[1] + shapes[2]) / total > 0.5, String(shapes));
  });

  it('Evi Effect: the Dullite Rock stands on the cliff top where the snap shows it, in its flat _3 shape', () => {
    const EVI = 'GHV1H1EHOF32UJM';
    const pop = populationForStreet(EVI, ecologyForStreet(EVI));
    const plan = rockSpawnPlan(pop, [], EVI);
    const dullite = plan.find((r) => r.classTsid === 'rock_dullite_1');
    assert.ok(dullite.measured);
    assert.ok(Math.abs(dullite.x - 1646) < 12 && Math.abs(dullite.y - 670) < 12, `${dullite.x},${dullite.y}`);
    assert.equal(dullite.shape, 3);
    assert.ok(measuredNodeSpots(EVI).rock_dullite_1.length >= 1);
  });

  it('seat before anything is planned, keep every other thing off them, and keep their indexes', () => {
    const pop = {
      rockClasses: ['rock_metal_1', 'rock_metal_1', 'rock_beryl_1'],
      resourceSpots: { rock_metal_1: [{ x: 900, y: 600, variant: 'rock_metal_3' }] },
    };
    const req = rockPlacementRequest(pop);
    assert.deepEqual(req, { key: 'rocks', count: 3, clearance: 74, fixed: [{ x: 900, y: 600, w: 168, h: 92 }] });
    const lines = [floor('ground', 0, 2000, 1000), floor('deck', 700, 1100, 600)];
    const plan = planStreetPlacements(lines, [{ key: 'trees', count: 3, clearance: 135 }, req], { worldW: 2000, seed: 'fixed', unreached: null });
    assert.equal(plan.groups.rocks.length, 3);
    assert.equal(plan.groups.rocks[0].fixed, true);
    for (const t of plan.groups.trees) assert.ok(Math.abs(t.x - 900) > 170 || Math.abs(t.y - 600) > 40, `tree at ${t.x},${t.y}`);
    const rows = rockSpawnPlan(pop, plan.groups.rocks, 'fixed');
    assert.deepEqual(rows.map((r) => [r.index, r.classTsid, r.measured]), [[0, 'rock_metal_1', true], [1, 'rock_metal_1', false], [2, 'rock_beryl_1', false]]);
    assert.deepEqual([rows[0].x, rows[0].y, rows[0].shape], [900, 600, 3]);
    assert.ok(rows.slice(1).every((r) => Number.isFinite(r.x) && [1, 2, 3].includes(r.shape)));
  });
});

describe('the planner\'s floors', () => {
  it('plans every reachable height, not only the lowest 54% of a street\'s floors', () => {
    const lines = [floor('ground', 0, 2000, 1000), floor('high', 200, 900, 300)];
    const c = buildPlatformCandidates(lines, { worldW: 2000, seed: 'h' });
    assert.ok(c.some((s) => s.id.startsWith('high:')));
    assert.doesNotMatch(read('public/js/street-ecology.js'), /lowerThreshold/);
  });

  it('keeps big things off slopes over 0.3 while a flatter spot is left, and says when none is', () => {
    assert.equal(BIG_THING_MAX_SLOPE, 0.3);
    assert.deepEqual([...BIG_THING_GROUPS], ['trees', 'rocks', 'vendor', 'shrine', 'piggies', 'chickens', 'furnitureMailbox']);
    const lines = [floor('ramp', 0, 1400, 1400, 600), floor('flat', 1500, 2000, 1000)];
    const plan = planStreetPlacements(lines, [{ key: 'vendor', count: 1, clearance: 120 }, { key: 'rocks', count: 1, clearance: 74 }], { worldW: 2100, seed: 's', unreached: null });
    assert.ok(plan.groups.vendor[0].id.startsWith('flat:'));
    assert.deepEqual(plan.steep, []);
    const steepOnly = planStreetPlacements([floor('ramp', 0, 1400, 1400, 600)], [{ key: 'shrine', count: 1, clearance: 120 }], { worldW: 1500, seed: 's', unreached: null });
    assert.equal(steepOnly.groups.shrine.length, 1, 'never left out');
    assert.deepEqual(steepOnly.steep.map((s) => s.key), ['shrine']);
  });

  it('never hangs a Dirt Pile, Ice Nubbin, Dust Trap, Paper Tree or Visiting Stone over an edge', () => {
    for (const key of ['resource:dirt_pile', 'resource:ice_knob', 'resource:dust_trap', 'resource:paper_tree', 'furnitureStone']) {
      assert.ok(PLACEMENT_FOOTPRINTS[key] > 0 && STEADY_FLOOR_GROUPS[key]?.edgeDrop === 12, key);
      // a short ledge over the floor, and a step narrower than the thing beside the drop
      const w = PLACEMENT_FOOTPRINTS[key];
      const lines = [floor('ledge', 300, 300 + w * 1.2, 500), floor('ground', 0, 2400, 1000), floor('step', 1200, 1200 + w * 0.8, 900)];
      const plan = planStreetPlacements(lines, [{ key, count: 3, clearance: 60 }], { worldW: 2500, seed: key, unreached: null });
      for (const p of plan.groups[key]) {
        assert.ok(p.id.startsWith('ground:'), `${key} on ${p.id}`);
        assert.ok(footOverAir(lines, p, w / 2) <= 12, `${key} ${p.x}`);
      }
    }
  });
});

function read0(path) {
  return readFileSync(path, 'utf8');
}
