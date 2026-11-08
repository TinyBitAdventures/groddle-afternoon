/**
 * Big scenery needs a floor under it (lane PERCH, 2026-10-31). Groddle Forest
 * Junction's bean tree stood on a 24 px branch stub halfway up the great trunk
 * (plat_1319844128815), a tree in a tree. js/street-ecology.js now gives trees,
 * gardens, the vendor, the shrine and rocks a footprint from their art
 * (PLACEMENT_FOOTPRINTS), measures floors as runs of joined lines
 * (floorRunSpans), keeps big things off perches while the floor has room
 * (PERCH_DROP_PX), and still places everything when a street has too little
 * room (plan.fallbacks). Streets whose archived file holds no ecology
 * (`exact` rows) plan exactly as before. Lane DOORCLEAR (2026-10-31) gave the
 * walking animals their walk as a footprint and resting Butterflies their size
 * (tests/keep-clear.test.js has the doors and the animals' census).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';
import {
  PERCH_DROP_PX,
  PLACEMENT_FOOTPRINTS,
  TREE_FOOTPRINT,
  buildPlatformCandidates,
  ecologyForStreet,
  floorRunSpans,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=78a1d522';
import { placementRequests } from '../tools/build-realtime-objects.mjs';
import { adoptedPlan } from '../public/js/features/patches-feature.js?v=e5ac130e';
import { createPlot } from '../public/js/patches.js?v=796732fb';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
const lineOf = (spot) => spot.id.slice(0, spot.id.lastIndexOf(':'));
const BIG = Object.keys(PLACEMENT_FOOTPRINTS);
// The animals' room is their walk (or perch), not scenery: `footprints: false` leaves it on.
const SCENERY = BIG.filter((key) => !['piggies', 'chickens', 'butterflies'].includes(key));
const floor = (id, x1, x2, y, extra = {}) => ({ id, x1, y1: y, x2, y2: y, pcPerm: -1, itemPerm: -1, ...extra });

function layoutOf(data, { footprints = true } = {}) {
  const pop = populationForStreet(data.tsid, ecologyForStreet(data.tsid), { starter: data.tsid === index.default });
  let requests = placementRequests(pop);
  if (!footprints) requests = requests.map((r) => (SCENERY.includes(r.key) ? { ...r, footprint: 0 } : r));
  const reserved = streetReservedSpots(data);
  return { pop, plan: planStreetPlacements(platformsScreen(data), requests, { worldW: streetWidth(data), seed: data.tsid, reserved }) };
}

describe('the footprints', () => {
  it('come from the drawn art', () => {
    // Trants 127-267 px wide at 210 px tall, their feet up to 171 px (trant_egg); gardens 280 / 227;
    // the vendor 422 px x 0.25; a shrine cell 151 px x 0.78; rocks 92-114 px at 0.85; a Piggy's feet and
    // body (60) and a Chicken's (38) each with its patrol both ways (lane DOORCLEAR); a resting Butterfly's cell.
    assert.equal(TREE_FOOTPRINT, 180);
    assert.deepEqual({ ...PLACEMENT_FOOTPRINTS }, { trees: 180, gardens: 280, vendor: 106, shrine: 118, rocks: 100, piggies: 240, chickens: 238, butterflies: 48 });
    assert.equal(PERCH_DROP_PX, 150);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /trantDisplayScale\(tex, \{ targetH: 210, maxScale: 1 \}\)/);
    assert.match(game, /const body = new PIXI\.Sprite\(textureFromUrl\('assets\/decos\/groddle\/vendor\.png'\)\);\s*body\.anchor\.set\(0\.5, 1\);\s*body\.scale\.set\(0\.25\);/);
    assert.match(game, /const def = \{ fw: 151, fh: 188, cols: 6, rows: 4 \};/);
  });
});

describe('the floor a big thing needs', () => {
  // A ceiling line up top keeps both floors in the planner's lower band.
  const roof = { id: 'roof', x1: 40, y1: 0, x2: 1960, y2: 0, pcPerm: 1, itemPerm: 1 };

  it('turns down a branch stub over the floor', () => {
    const lines = [roof, floor('ground', 40, 1960, 1000), floor('stub', 990, 1014, 700), floor('top', 40, 200, 100)];
    const stub = buildPlatformCandidates(lines, { worldW: 2000, seed: 's' }).find((c) => c.id.startsWith('stub:'));
    assert.ok(stub, 'the stub is a candidate (it still takes a quoin)');
    assert.equal(stub.room, 24);
    const plan = planStreetPlacements(lines, [
      { key: 'trees', count: 5, clearance: 135 },
      { key: 'shrine', count: 1, clearance: 135 },
      { key: 'rocks', count: 4, clearance: 74 },
    ], { worldW: 2000, seed: 's' });
    for (const key of ['trees', 'shrine', 'rocks']) {
      assert.ok(plan.groups[key].every((spot) => lineOf(spot) === 'ground'), key);
    }
    assert.deepEqual(plan.fallbacks, []);
  });

  it('keeps big things off a wide branch while the floor below has room', () => {
    const lines = [roof, floor('ground', 40, 1960, 1000), floor('branch', 700, 1300, 760), floor('top', 40, 200, 100)];
    const branch = buildPlatformCandidates(lines, { worldW: 2000, seed: 'b' }).filter((c) => c.id.startsWith('branch:'));
    assert.ok(branch.length && branch.every((c) => c.under >= 1900), 'the branch is a perch over the ground');
    const plan = planStreetPlacements(lines, [{ key: 'trees', count: 3, clearance: 135 }], { worldW: 2000, seed: 'b' });
    assert.ok(plan.groups.trees.every((spot) => lineOf(spot) === 'ground'));
    assert.deepEqual(plan.perches, []);
  });

  it('lets a cliff top with nothing under it hold trees', () => {
    const lines = [roof, floor('low', 40, 900, 1000), floor('cliff', 905, 1960, 700), floor('top', 40, 200, 100)];
    const cliff = buildPlatformCandidates(lines, { worldW: 2000, seed: 'c' }).filter((c) => c.id.startsWith('cliff:'));
    assert.ok(cliff.every((c) => c.under === 0));
    const plan = planStreetPlacements(lines, [{ key: 'trees', count: 6, clearance: 135 }], { worldW: 2000, seed: 'c' });
    assert.ok(plan.groups.trees.some((spot) => lineOf(spot) === 'cliff'));
    assert.deepEqual(plan.fallbacks, []);
  });

  it('measures a floor of short lines joined end to end as one run', () => {
    // Twelve 40 px pieces, each starting within a few px of the last one's end, rising and falling a little.
    const pieces = [];
    for (let i = 0; i < 12; i += 1) {
      const x1 = 600 + i * 42;
      pieces.push({ id: `seg${i}`, x1, y1: 1000 + (i % 3) * 2, x2: x1 + 40, y2: 1000 + ((i + 1) % 3) * 2, pcPerm: -1, itemPerm: -1 });
    }
    const lines = [roof, ...pieces, floor('top', 40, 200, 100)];
    const spans = floorRunSpans(pieces);
    assert.deepEqual(spans.get(pieces[0]), [[600, 1102]]);
    assert.equal(spans.get(pieces[0]), spans.get(pieces[11]), 'one run');
    const plan = planStreetPlacements(lines, [{ key: 'trees', count: 1, clearance: 135 }], { worldW: 2000, seed: 'j' });
    assert.equal(plan.groups.trees.length, 1);
    assert.deepEqual(plan.fallbacks, []);
    const spot = plan.groups.trees[0];
    assert.ok(spot.x - 600 >= TREE_FOOTPRINT / 2 && 1102 - spot.x >= TREE_FOOTPRINT / 2, String(spot.x));
    // Pieces 10 px apart are not a run.
    const apart = pieces.map((p, i) => ({ ...p, x1: 600 + i * 50, x2: 640 + i * 50 }));
    assert.notEqual(floorRunSpans(apart).get(apart[0]), floorRunSpans(apart).get(apart[1]));
    // A line whose end rests on another's middle joins it.
    const t = [floor('long', 0, 400, 1000), floor('spur', 400, 500, 1003), floor('rest', 200, 260, 1004)];
    assert.deepEqual(floorRunSpans(t).get(t[2]), [[0, 500]]);
  });

  it('still places everything on a street too cramped for it, on the roomiest spots, and says so', () => {
    const ledges = [roof, floor('top', 40, 120, 100)];
    for (let i = 0; i < 8; i += 1) ledges.push(floor(`ledge${i}`, 100 + i * 220, 100 + i * 220 + (i === 3 ? 150 : 90), 1000));
    const plan = planStreetPlacements(ledges, [
      { key: 'trees', count: 3, clearance: 135 },
      { key: 'quoins', count: 4, clearance: 28 },
    ], { worldW: 2000, seed: 'f' });
    assert.equal(plan.groups.trees.length, 3, 'no tree is dropped');
    assert.equal(plan.groups.quoins.length, 4);
    assert.equal(plan.fallbacks.length, 3);
    assert.deepEqual(plan.fallbacks.map((f) => [f.key, f.index, f.footprint]), [['trees', 0, 180], ['trees', 1, 180], ['trees', 2, 180]]);
    // The first takes the roomiest spot: the widest ledge (150 px, sampled at 37.5 and 112.5 px).
    const roomiest = Math.max(...buildPlatformCandidates(ledges, { worldW: 2000, seed: 'f' }).map((c) => c.room));
    assert.equal(roomiest, 75);
    assert.equal(lineOf(plan.groups.trees[0]), 'ledge3');
    assert.deepEqual(plan.fallbacks.map((f) => f.room), [75, 75, 45]);
  });

  it('leaves the arrival and small things alone', () => {
    const lines = [roof, floor('ground', 40, 1960, 1000), floor('stub', 990, 1014, 700), floor('top', 40, 200, 100)];
    const all = buildPlatformCandidates(lines, { worldW: 2000, seed: 'q' }).length;
    const requests = [
      { key: 'player', count: 1, clearance: 190 },
      { key: 'quoins', count: all - 1, clearance: 28 },
    ];
    const a = planStreetPlacements(lines, requests, { worldW: 2000, seed: 'q' });
    const stubbed = [...a.groups.player, ...a.groups.quoins].filter((spot) => lineOf(spot) === 'stub');
    assert.equal(stubbed.length, 1, 'the arrival or a quoin may still take the stub');
    assert.deepEqual(a.fallbacks, []);
  });
});

describe('the archived streets', () => {
  setStreetEcologyCatalog(catalog);
  const streets = Object.keys(index.streets).filter((tsid) => !/^GZ/.test(tsid)).sort();

  it('Groddle Forest Junction: no tree in a tree', () => {
    const data = street('GLI3272LOTD1B1F');
    const { pop, plan } = layoutOf(data);
    assert.equal(plan.groups.trees.length, pop.treeClasses.length);
    assert.ok(plan.groups.trees.every((spot) => lineOf(spot) !== 'plat_1319844128815'));
    const byId = new Map(buildPlatformCandidates(platformsScreen(data), { worldW: streetWidth(data), seed: data.tsid }).map((c) => [c.id, c]));
    for (const spot of plan.groups.trees) {
      const c = byId.get(spot.id);
      assert.ok(c.room >= TREE_FOOTPRINT && c.under < TREE_FOOTPRINT, `${spot.id} room ${c.room} under ${c.under}`);
    }
  });

  it('places every big thing on its own footprint of floor, and drops none', () => {
    let placed = 0;
    let perched = 0;
    const perchedBy = {};
    for (const tsid of streets) {
      let data;
      try { data = street(tsid); } catch { continue; }
      if (!Array.isArray(data.platforms)) continue;
      const { pop, plan } = layoutOf(data);
      assert.equal(plan.groups.trees.length, pop.treeClasses.length, tsid);
      assert.deepEqual(plan.fallbacks, [], tsid);
      placed += BIG.reduce((n, key) => n + (plan.groups[key]?.length || 0), 0);
      perched += plan.perches.length;
      for (const p of plan.perches) perchedBy[p.key] = (perchedBy[p.key] || 0) + 1;
    }
    assert.ok(placed > 5000, String(placed));
    // Perches only where a street's floors are full: 6 trees, 17 shrines, 167 rocks on 2026-10-31;
    // with doors, ladder feet and signposts kept clear (lane DOORCLEAR) 4 trees, 26 shrines, 192 rocks, 3 vendors;
    // with every rock the files name (G399, 51 more, up to 16 a street) 15 more of the rocks perch: 212 rocks, 4 vendors.
    assert.ok(perched <= 250, JSON.stringify(perchedBy));
    // A walking animal never perches while a floor has room: none do (38 Piggies, 658 Chickens before).
    assert.equal((perchedBy.piggies || 0) + (perchedBy.chickens || 0), 0, JSON.stringify(perchedBy));
  });

  it('plans streets whose archived file holds no scenery exactly as without scenery footprints', () => {
    const exact = streets.filter((tsid) => ecologyForStreet(tsid)?.exact === true);
    assert.ok(exact.length >= 130, String(exact.length));
    for (const tsid of exact) {
      const data = street(tsid);
      const { pop, plan } = layoutOf(data);
      assert.equal(pop.treeClasses.length + pop.rockClasses.length + pop.gardens + Number(pop.vendor) + Number(pop.shrine), 0, tsid);
      assert.deepEqual(plan.groups, layoutOf(data, { footprints: false }).plan.groups, tsid);
    }
  });

  it('the server data keeps every tree on room to stand', { skip: skipWithoutServer }, () => {
    const data = JSON.parse(readFileSync(serverPath('data/objects.json'), 'utf8'));
    let trees = 0;
    for (const [tsid, row] of Object.entries(data.streets)) {
      if (!row.trees?.length) continue;
      const s = street(tsid);
      const byXY = new Map(buildPlatformCandidates(platformsScreen(s), { worldW: streetWidth(s), seed: tsid })
        .map((c) => [`${Math.round(c.x * 10) / 10},${Math.round((c.y + 2) * 10) / 10}`, c]));
      for (const [, , x, y] of row.trees) {
        const c = byXY.get(`${x},${y}`);
        assert.ok(c && c.room >= TREE_FOOTPRINT, `${tsid} tree at ${x},${y}`);
        trees += 1;
      }
    }
    assert.ok(trees > 1800, String(trees));
  });
});

describe('a dead street tree\'s plot', () => {
  it('moves with its tree to the street\'s current layout, and the save follows', () => {
    const slot = {
      plots: { 'tree:1': createPlot('trant_bean_dead', { now: 1 }), 'soil:0': createPlot('patch', { now: 1 }) },
      adopted: { 'tree:1': { x: 2358, y: 695 }, 'soil:0': { x: 50, y: 60 } },
    };
    const spots = [{ x: 100, y: 1000 }, { x: 877.3, y: 1140.9 }];
    const plan = adoptedPlan(slot, (i) => spots[i]);
    assert.deepEqual(plan.find((p) => p.key === 'tree:1'), { key: 'tree:1', classTsid: 'trant_bean_dead', x: 877, y: 1139, adopted: true });
    assert.deepEqual(slot.adopted['tree:1'], { x: 877, y: 1139 });
    assert.deepEqual(slot.adopted['soil:0'], { x: 50, y: 60 }, 'only tree:<i> plots follow a tree');
    // No planned spot for that tree (fewer trees, or a street without the planner): the saved spot stays.
    const kept = { plots: { 'tree:4': createPlot('patch', { now: 1 }) }, adopted: { 'tree:4': { x: 10, y: 20 } } };
    assert.deepEqual(adoptedPlan(kept, () => undefined).map((p) => [p.x, p.y]), [[10, 20]]);
  });
});
