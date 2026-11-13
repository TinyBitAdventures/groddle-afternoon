/**
 * Keep-clear fixtures and walking animals (lane DOORCLEAR, 2026-10-31).
 *
 * Austin, live v0.8.0, Groddle Forest Junction: a fruit tree planted on the
 * subway steps (door_1, door_asset_subway_forest_heights_1, 294 x 294 at
 * 4099, 1063) half hid the way down, and a Chicken stood on the tip of a short
 * branch up in the great tree, walking off its ends. js/street-ecology.js now
 * reserves every street's doors, ladder feet and signposts
 * (streetReservedSpots, one helper for game.js enterStreet, the realtime data
 * builders and the level builder): big scenery never covers one, nothing else
 * stands in a doorway. Walking animals need a floor as long as their walk and
 * keep off perches while any floor has room; resting Butterflies need a branch
 * at least their own size.
 *
 * Census, every shared street laid out as the server's data is (2026-10-31):
 * before, 36 big things on doors (12 trees, 16 rocks, 4 vendors, 3 shrines, 1
 * garden), 146 on ladder feet, 66 small things in doorways; 658 of 1,547
 * Chickens and 34 Piggies perched, 496 Chickens and 156 Piggies on floors
 * shorter than their walk, 13 resting Butterflies on stubs. After: none, with
 * no fallbacks.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isStandable, platformYAt, platformsScreen, streetWidth, worldToScreen } from '../public/js/street-model.js?v=b6cb6a4e';
import {
  ANIMAL_PATROL,
  LADDER_FOOT_PX,
  PLACEMENT_FOOTPRINTS,
  PLACEMENT_HEIGHTS,
  animalPatrolRange,
  blockingFixture,
  buildPlatformCandidates,
  ecologyForStreet,
  footAtWalkway,
  frontCoverShare,
  frontDecoCovers,
  frontDecoWalkways,
  hiddenBehindFront,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=cc49deed';
import { placementRequests } from '../tools/build-realtime-objects.mjs';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=18b181ad';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
const FOREST_JUNCTION = 'GLI3272LOTD1B1F';
const SCENERY = Object.keys(PLACEMENT_HEIGHTS);
const WALKERS = Object.keys(ANIMAL_PATROL);
const floor = (id, x1, x2, y) => ({ id, x1, y1: y, x2, y2: y, pcPerm: -1, itemPerm: -1 });
const roof = { id: 'roof', x1: 40, y1: 0, x2: 2960, y2: 0, pcPerm: 1, itemPerm: 1 };

setStreetEcologyCatalog(catalog);
// As the realtime builders and a multiplayer page load streets (the signposts a player sees).
setZoneStreetsShown(false);
applyStreetIndex(index);
const loaded = (tsid) => loadStreetDataFromFs(tsid, streetsDir);

function layoutOf(data) {
  const pop = populationForStreet(data.tsid, ecologyForStreet(data.tsid), { starter: data.tsid === index.default });
  const reserved = streetReservedSpots(data);
  const plan = planStreetPlacements(platformsScreen(data), placementRequests(pop), { worldW: streetWidth(data), seed: data.tsid, reserved });
  return { pop, plan, reserved };
}

/** What covers what: big scenery by its box, the rest by the doorways (the planner's own rule). */
function offences(plan, reserved) {
  const out = [];
  for (const [key, points] of Object.entries(plan.groups)) {
    if (key === 'player') continue;
    const big = SCENERY.includes(key);
    for (const p of points) {
      // A rock the 2012 snaps show (`fixed`, rockPlacementRequest) stands where Glitch had it, by a signpost or not.
      if (p.fixed) continue;
      const hit = blockingFixture(p, reserved, big ? { footprint: PLACEMENT_FOOTPRINTS[key], height: PLACEMENT_HEIGHTS[key] } : {});
      if (hit) out.push(`${key} at ${Math.round(p.x)},${Math.round(p.y)} covers ${hit.key}`);
    }
  }
  return out;
}

describe('the keep-clear spots (streetReservedSpots)', () => {
  const data = street(FOREST_JUNCTION);
  const spots = streetReservedSpots(data);

  it('take doors as they are: screen space, bottom-centre, the art\'s own size', () => {
    const door = spots.find((s) => s.key === 'door:door_1');
    assert.deepEqual(door, {
      x: 4099, y: 1063, key: 'door:door_1', clearance: 147, doorway: true,
      block: { l: 3952, r: 4246, t: 769, b: 1063 },
    });
    // The door's floor point is on the street's floor there (screen space, unlike the signposts' world x, y).
    const under = platformsScreen(data).filter(isStandable).map((line) => platformYAt(line, 4099, 0.01)).filter((y) => y != null);
    assert.ok(under.some((y) => Math.abs(y - 1063) <= 30), JSON.stringify(under));
  });

  it('take signposts and ladder feet from world space', () => {
    data.signposts.forEach((post, i) => {
      const at = worldToScreen(data, post.x, post.y);
      const spot = spots.find((s) => s.key === `signpost:${i}`);
      assert.deepEqual([spot.x, spot.y, spot.clearance], [at.x, at.y, 100]);
      assert.deepEqual(spot.block, { l: at.x - post.w / 2, r: at.x + post.w / 2, t: at.y - post.h, b: at.y });
    });
    for (const ladder of data.ladders) {
      const foot = worldToScreen(data, ladder.x, ladder.y);
      const spot = spots.find((s) => s.key === `ladder:${ladder.id}`);
      assert.deepEqual([spot.x, spot.y, spot.clearance], [foot.x, foot.y, 25]);
      assert.deepEqual(spot.block, { l: foot.x - 25, r: foot.x + 25, t: foot.y - LADDER_FOOT_PX, b: foot.y });
      assert.equal(spot.doorway, undefined);
    }
    // Ticket 89: the front decos (frontDecoCovers) ride along, marked `front`, and keep nothing clear.
    assert.equal(spots.filter((s) => !s.front).length, data.signposts.length + data.doors.length + data.ladders.length);
    assert.ok(spots.filter((s) => s.front).every((s) => s.block && !s.clearance && !s.doorway));
  });

  it('leave out hidden doors, which are never drawn', () => {
    const s = { bounds: { l: 0, r: 2000, t: -1000, b: 0 }, doors: [{ id: 'a', x: 500, y: 900, w: 100, h: 200 }, { id: 'b', x: 900, y: 900, w: 100, h: 200, hidden: true }] };
    assert.deepEqual(streetReservedSpots(s).map((p) => p.key), ['door:a']);
  });

  it('are the one list game.js, the realtime builders and the level builder plan with', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /const reserved = streetReservedSpots\(data\);[\s\S]{0,400}reserved\.push\(\{ x: opts\.spawnX[\s\S]{0,200}currentStreetPlacement = planStreetPlacements\(/);
    for (const tool of ['build-realtime-objects', 'build-realtime-quoins', 'build-realtime-rook']) {
      const src = readFileSync(join(root, `tools/${tool}.mjs`), 'utf8');
      assert.match(src, /const reserved = streetReservedSpots\(data\);/, tool);
      assert.doesNotMatch(src, /signpost:\$\{/, tool);
    }
    assert.match(readFileSync(join(root, 'public/js/builder/editor-zone.js'), 'utf8'), /const reserved = streetReservedSpots\(street\);/);
    assert.match(readFileSync(join(root, 'public/js/builder/validate.js'), 'utf8'), /reserved: streetReservedSpots\(s\)/);
  });
});

describe('the planner keeps doors clear', () => {
  const door = { x: 1000, y: 1000, key: 'door:d', clearance: 150, doorway: true, block: { l: 850, r: 1150, t: 700, b: 1000 } };

  it('puts a tree beside a door, not on it, and keeps small things out of the doorway', () => {
    const lines = [roof, floor('ground', 700, 2400, 1000)];
    const plan = planStreetPlacements(lines, [
      { key: 'trees', count: 3, clearance: 135 },
      { key: 'quoins', count: 10, clearance: 28 },
    ], { worldW: 3000, seed: 'door', reserved: [door] });
    assert.equal(plan.groups.trees.length, 3);
    assert.equal(plan.groups.quoins.length, 10);
    for (const t of plan.groups.trees) assert.ok(t.x - 90 >= 1150 || t.x + 90 <= 850, String(t.x));
    for (const q of plan.groups.quoins) assert.ok(q.x <= 850 || q.x >= 1150, String(q.x));
    assert.deepEqual(plan.blocked, []);
  });

  it('never drops a tree: with nowhere else, it stands at the door and the plan says so', () => {
    const lines = [roof, floor('ground', 800, 1200, 1000)];
    const plan = planStreetPlacements(lines, [{ key: 'trees', count: 1, clearance: 135 }], { worldW: 3000, seed: 'door', reserved: [door] });
    assert.equal(plan.groups.trees.length, 1);
    assert.deepEqual(plan.blocked, [{ key: 'trees', index: 0, fixture: 'door:d' }]);
  });

  it('lets a tree stand on a branch above a door (its box clears the door\'s)', () => {
    assert.equal(blockingFixture({ x: 1000, y: 690 }, [door], { footprint: 180, height: 210 }), null);
    assert.equal(blockingFixture({ x: 1000, y: 1150 }, [door], { footprint: 180, height: 210 }), door, 'a canopy over the doorstep');
    assert.equal(blockingFixture({ x: 1000, y: 1041 }, [door]), null, 'below the doorstep');
    assert.equal(blockingFixture({ x: 1000, y: 1030 }, [door]), door, 'on the doorstep');
  });
});

describe('walking animals', () => {
  it('walk as far as game.js lets them, and no further than their floor', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.deepEqual({ ...ANIMAL_PATROL }, { piggies: 90, chickens: 100 });
    assert.match(game, /spr\.range = ANIMAL_PATROL\.piggies;/);
    assert.match(game, /spr\.range = ANIMAL_PATROL\.chickens;/);
    assert.match(game, /if \(p\) \{ spr\.x = p\.x; spr\.y = p\.y \+ 2; spr\.baseX = p\.x; spr\.range = animalPatrolRange\('piggies', p\.room\); \}/);
    assert.match(game, /if \(p\) \{ spr\.x = p\.x; spr\.y = p\.y \+ 2; spr\.baseX = p\.x; spr\.range = animalPatrolRange\('chickens', p\.room\); \}/);
    assert.equal(animalPatrolRange('chickens', 238), 100);
    assert.equal(animalPatrolRange('chickens', 1000), 100);
    assert.equal(animalPatrolRange('chickens', 98), 30);
    assert.equal(animalPatrolRange('piggies', 40), 0);
    assert.equal(animalPatrolRange('piggies', undefined), 90);
    assert.equal(animalPatrolRange('butterflies', 500), 0);
  });

  it('a Chicken keeps to a long floor over a branch; a resting Butterfly may take the branch, not a stub', () => {
    const lines = [roof, floor('ground', 40, 2960, 1000), floor('branch', 1400, 1600, 600), floor('stub', 2000, 2030, 600)];
    const plan = planStreetPlacements(lines, [
      { key: 'chickens', count: 4, clearance: 86 },
      { key: 'butterflies', count: 6, clearance: 62 },
    ], { worldW: 3000, seed: 'walk' });
    assert.ok(plan.groups.chickens.every((p) => p.y === 1000 && p.room >= 238), JSON.stringify(plan.groups.chickens));
    assert.ok(plan.groups.butterflies.every((p) => p.room >= 48), JSON.stringify(plan.groups.butterflies));
    assert.ok(plan.groups.butterflies.every((p) => !p.id.startsWith('stub:')));
  });
});

describe('every shared street', () => {
  const streets = Object.keys(index.streets).filter((tsid) => !/^GZ/.test(tsid)).sort(); // as tools/build-realtime-objects.mjs (zone streets are solo only)

  it('Groddle Forest Junction: the subway steps are clear and its Chickens stay on the floor', async () => {
    const data = await loaded(FOREST_JUNCTION);
    const { plan, reserved } = layoutOf(data);
    assert.deepEqual(offences(plan, reserved), []);
    for (const t of plan.groups.trees) assert.ok(t.x + 90 <= 3952 || t.x - 90 >= 4246, `tree at ${t.x}`);
    const byId = new Map(buildPlatformCandidates(platformsScreen(data), { worldW: streetWidth(data), seed: data.tsid }).map((c) => [c.id, c]));
    // Before: two Chickens up the great tree at 2358, 695 (a 24 px stub) and 3539, 695.
    for (const c of plan.groups.chickens) {
      const at = byId.get(c.id);
      assert.ok(at.room >= 238 && at.under < 238, `${c.id} room ${at.room} under ${at.under}`);
    }
  });

  it('no big scenery covers a door, a ladder foot or a signpost, nothing stands in a doorway, and the animals have their floor', async () => {
    let doors = 0;
    let animals = 0;
    const bad = [];
    for (const tsid of streets) {
      let data;
      try { data = await loaded(tsid); } catch { continue; }
      const { pop, plan, reserved } = layoutOf(data);
      doors += reserved.filter((s) => s.doorway).length;
      assert.equal(plan.groups.trees.length, pop.treeClasses.length, tsid);
      bad.push(...offences(plan, reserved).map((o) => `${tsid} ${o}`));
      bad.push(...plan.blocked.map((b) => `${tsid} blocked ${JSON.stringify(b)}`));
      bad.push(...plan.fallbacks.map((f) => `${tsid} fallback ${JSON.stringify(f)}`));
      for (const key of [...WALKERS, 'butterflies']) {
        for (const p of plan.groups[key] || []) {
          animals += 1;
          if (p.room < PLACEMENT_FOOTPRINTS[key]) bad.push(`${tsid} ${key} on a stub (${p.room})`);
        }
      }
      for (const p of plan.perches) if (WALKERS.includes(p.key)) bad.push(`${tsid} ${p.key} perched`);
    }
    assert.deepEqual(bad, []);
    assert.ok(doors >= 240, String(doors));
    // Ticket 25: Butterflies all fly now (no resting ones on a floor), so fewer animals are planned on floors.
    assert.ok(animals >= 2500, String(animals));
  });

  it('the server data keeps the doors clear', { skip: skipWithoutServer }, async () => {
    const data = JSON.parse(readFileSync(serverPath('data/objects.json'), 'utf8'));
    let checked = 0;
    for (const [tsid, row] of Object.entries(data.streets)) {
      const reserved = streetReservedSpots(await loaded(tsid));
      if (!reserved.some((s) => s.doorway)) continue;
      // Rows hold the feet (spot y + 2).
      for (const [, , x, y] of row.trees || []) assert.equal(blockingFixture({ x, y: y - 2 }, reserved, { footprint: 180, height: 210 }), null, `${tsid} tree ${x},${y}`);
      for (const [, , x, y] of row.rocks || []) assert.equal(blockingFixture({ x, y }, reserved, { footprint: 100, height: 110 }), null, `${tsid} rock ${x},${y}`);
      for (const [, x, y] of row.pigs || []) assert.equal(blockingFixture({ x, y: y - 2 }, reserved), null, `${tsid} pig ${x},${y}`);
      checked += 1;
    }
    assert.ok(checked >= 50, String(checked)); // 59 on 2026-10-31
  });
});

describe('ticket 89: nothing is planted behind a deco drawn in front of the street', () => {
  const FLIPSIDE = 'GM410QQ0CHARO';
  const streets = Object.keys(index.streets).filter((tsid) => !/^GZ/.test(tsid)).sort();

  it('reads the front layers as wide as the street, not their see-through shadows', () => {
    const fronts = frontDecoCovers(street(FLIPSIDE));
    // middleplus cl2_swissPipe_02_front (457 x 165 at 1417, 1972): the pipe the Spice Plant stood in.
    assert.ok(fronts.some((f) => f.block.l === 1417 - 228.5 && f.block.t === 1972 - 165), JSON.stringify(fronts.map((f) => f.block)));
    const s = { bounds: { l: -1000, r: 1000, t: -1000, b: 0 }, layers: [
      { name: 'middleplus', z: 1, w: 2000, decos: [{ sprite: 'groddle_shadow_spot_1', x: 500, y: 900, w: 800, h: 300 }, { sprite: 'rock', x: 900, y: 900, w: 300, h: 200 }] },
      { name: 'foreground', z: 2, w: 2400, decos: [{ sprite: 'bush', x: 500, y: 900, w: 400, h: 300 }] },
      { name: 'middleground', z: 0, w: 2000, decos: [{ sprite: 'rock', x: 0, y: -100, w: 300, h: 200 }] },
    ] };
    assert.deepEqual(frontDecoCovers(s).map((f) => f.key), ['front:middleplus:1']);
    assert.equal(hiddenBehindFront({ x: 900, y: 900 }, 'trees', frontDecoCovers(s)), true);
    assert.equal(hiddenBehindFront({ x: 1200, y: 900 }, 'trees', frontDecoCovers(s)), false);
  });

  it('Flipside plants its Spice Plants where they show, and every shared street does', async () => {
    const { plan, reserved } = layoutOf(street(FLIPSIDE));
    const fronts = reserved.filter((r) => r.front);
    for (const p of plan.groups.trees) assert.equal(hiddenBehindFront(p, 'trees', fronts), false, `${Math.round(p.x)},${Math.round(p.y)}`);
    const hidden = [];
    for (const tsid of streets) {
      let data;
      try { data = await loaded(tsid); } catch { continue; }
      const { plan: pl, reserved: rs } = layoutOf(data);
      const fr = rs.filter((r) => r.front);
      if (!fr.length) continue;
      // Rocks the snaps show (`fixed`) were drawn there in 2012, so they show (the front deco check is the planner's guess).
      for (const key of ['trees', 'rocks', 'piggies']) for (const p of pl.groups[key] || []) if (!p.fixed && hiddenBehindFront(p, key, fr)) hidden.push(`${tsid} ${key} ${Math.round(p.x)},${Math.round(p.y)}`);
    }
    // Census of the server's data (2026-11-04): before, 229 trees, rocks and Piggies mostly behind a front deco; after, none.
    assert.deepEqual(hidden, []);
  });
});

describe('ticket 118: rooted scenery keeps off a front deco players walk along', () => {
  const FLIPSIDE = 'GM410QQ0CHARO';
  const streets = Object.keys(index.streets).filter((tsid) => !/^GZ/.test(tsid)).sort();
  const line = (id, x1, y1, x2, y2) => ({ id, x1, y1, x2, y2, pcPerm: -1, itemPerm: -1 });
  const pipe = { key: 'front:m:0', front: true, x: 600, y: 972, block: { l: 400, r: 800, t: 807, b: 972 } };
  const ground = line('ground', 0, 950, 2000, 950);

  it('finds a deco whose top is a floor, not one the floor runs on past or that has no floor behind it', () => {
    assert.deepEqual(frontDecoWalkways([ground, line('top', 410, 815, 790, 815)], [pipe]), [pipe]);
    // The floor goes on past the deco: a shelf of its own.
    assert.deepEqual(frontDecoWalkways([ground, line('shelf', 300, 815, 790, 815)], [pipe]), []);
    // A floor well below the deco's top: nothing to walk along on top of it.
    assert.deepEqual(frontDecoWalkways([ground, line('low', 410, 880, 790, 880)], [pipe]), []);
    // The only floor there: nothing lower for the deco to stand on.
    assert.deepEqual(frontDecoWalkways([line('top', 410, 815, 790, 815)], [pipe]), []);
    assert.deepEqual(frontDecoWalkways([ground, line('top', 410, 815, 790, 815)], []), []);
  });

  it('Flipside: the pipe is one, and no tree stands on it or with its foot behind it', () => {
    const data = street(FLIPSIDE);
    const { plan, reserved } = layoutOf(data);
    const walkways = frontDecoWalkways(platformsScreen(data), reserved.filter((r) => r.front));
    // middleplus cl2_swissPipe_02_front (457 x 165 at 1417, 1972), floors along it 1198 to 1616.
    assert.ok(walkways.some((w) => w.block.l === 1417 - 228.5 && w.block.t === 1972 - 165), JSON.stringify(walkways));
    assert.equal(plan.groups.trees.length, 7);
    for (const p of plan.groups.trees) {
      assert.equal(footAtWalkway(p, PLACEMENT_FOOTPRINTS.trees, walkways), false, `${Math.round(p.x)},${Math.round(p.y)}`);
      assert.equal(p.y, 1950); // Every Spice Plant on the street's real floor.
    }
  });

  it('the avatar still walks the pipe, and a tree takes such a spot when nothing else is left', () => {
    const data = street(FLIPSIDE);
    assert.ok(platformsScreen(data).some((l) => isStandable(l) && l.x1 === 1198 && l.y1 === 1813), 'the pipe top stays a floor');
    const plan = planStreetPlacements([line('top', 410, 815, 790, 815), line('under', 410, 950, 790, 950)], [{ key: 'trees', count: 2, clearance: 100 }], { worldW: 2000, reserved: [pipe] });
    assert.equal(plan.groups.trees.length, 2);
  });

  it('no planned tree, rock, garden, vendor or shrine on any shared street is at one', async () => {
    const offenders = [];
    let withWalkway = 0;
    for (const tsid of streets) {
      let data;
      try { data = await loaded(tsid); } catch { continue; }
      const { plan, reserved } = layoutOf(data);
      const walkways = frontDecoWalkways(platformsScreen(data), reserved.filter((r) => r.front));
      if (!walkways.length) continue;
      withWalkway += 1;
      for (const key of SCENERY) for (const p of plan.groups[key] || []) if (!p.fixed && footAtWalkway(p, PLACEMENT_FOOTPRINTS[key], walkways)) offenders.push(`${tsid} ${key} ${Math.round(p.x)},${Math.round(p.y)}`);
    }
    // Census of the server's data (2026-11-06): 16 streets have one; before, 4 things stood at one (Flipside's plant, 3 others).
    assert.ok(withWalkway >= 10, String(withWalkway));
    assert.deepEqual(offenders, []);
  });
});

describe('a shrine or vendor is never planned behind the rock a cave draws in front', () => {
  const MEGNA = 'GA912TJ0KF328Q3';
  const tile = (x, y, w, h, r = 0) => ({ sprite: 'cave_gr_tiling_piece', x, y, w, h, r });
  const cave = (decos) => ({ bounds: { l: -1000, r: 1000, t: -1000, b: 0 }, layers: [{ name: 'Middleplus', z: 1, w: 2000, decos }] });

  it('counts small and turned tiles together, as a fill, never as a walkway', () => {
    // Four 100 x 80 tiles, none over 60% of a shrine's 118 x 147 box alone, together all of it.
    const fronts = frontDecoCovers(cave([tile(950, 1000, 100, 80), tile(1050, 1000, 100, 80), tile(950, 920, 100, 80), tile(1050, 920, 100, 80)]));
    assert.equal(fronts.length, 4);
    assert.ok(fronts.every((f) => f.fill));
    assert.equal(frontCoverShare({ x: 1000, y: 1000 }, 118, 147, fronts), 1);
    assert.equal(hiddenBehindFront({ x: 1000, y: 1000 }, 'shrine', fronts), true);
    assert.equal(hiddenBehindFront({ x: 1300, y: 1000 }, 'shrine', fronts), false);
    assert.deepEqual(frontDecoWalkways([{ id: 'a', x1: 900, y1: 840, x2: 1100, y2: 840, pcPerm: -1, itemPerm: -1 }], fronts), []);
    // A tile turned 90 degrees about its bottom centre stands to the side of it, w and h swapped.
    const [turned] = frontDecoCovers(cave([tile(1000, 1000, 184, 89, 90)]));
    assert.deepEqual(Object.fromEntries(Object.entries(turned.block).map(([k, v]) => [k, Math.round(v)])), { l: 1000, r: 1089, t: 908, b: 1092 });
    assert.ok(frontCoverShare({ x: 1045, y: 1090 }, 60, 160, [turned]) > 0.9);
    assert.equal(frontCoverShare({ x: 955, y: 1090 }, 60, 160, [turned]), 0);
    // A layer as wide as the street but shorter moves with the camera (Sylvan Grove's middleplus, 850 on 1000).
    assert.deepEqual(frontDecoCovers({ ...cave([tile(1000, 1000, 300, 300)]), layers: [{ name: 'middleplus', z: 1, w: 2000, h: 850, decos: [tile(1000, 1000, 300, 300)] }] }), []);
    // Tiles too small to matter, see-through overlays and hidden decos hide nothing.
    assert.deepEqual(frontDecoCovers(cave([tile(1000, 1000, 24, 25), { sprite: 'cave_light_overlay', x: 1000, y: 1000, w: 400, h: 400 }, { ...tile(1000, 1000, 300, 300), hidden: true }])), []);
  });

  it('Megna Burrow puts its shrine where it shows, off the slope through the rock', async () => {
    const data = await loaded(MEGNA);
    const { plan, reserved, pop } = layoutOf(data);
    assert.equal(pop.shrine, true);
    const fronts = reserved.filter((r) => r.front);
    const [shrine] = plan.groups.shrine;
    // Before: on plat_1307035601041 at screen 3362, 857, the slope up through the middleplus rock, 100% covered.
    assert.equal(frontCoverShare({ x: 3362, y: 857 }, 118, 147, fronts), 1);
    assert.ok(frontCoverShare(shrine, 118, 147, fronts) < 0.6, `${Math.round(shrine.x)},${Math.round(shrine.y)}`);
    for (const key of ['vendor', 'trees', 'rocks']) for (const p of plan.groups[key] || []) assert.equal(hiddenBehindFront(p, key, fronts), false, `${key} ${Math.round(p.x)},${Math.round(p.y)}`);
  });

  it('every street keeps its shrine and vendor out from behind the front decos', async () => {
    const hidden = [];
    for (const tsid of Object.keys(index.streets).filter((t) => !/^GZ/.test(t)).sort()) {
      let data;
      try { data = await loaded(tsid); } catch { continue; }
      const { plan, reserved } = layoutOf(data);
      const fronts = reserved.filter((r) => r.front);
      if (!fronts.length) continue;
      for (const key of ['shrine', 'vendor']) for (const p of plan.groups[key] || []) if (hiddenBehindFront(p, key, fronts)) hidden.push(`${tsid} ${key}`);
    }
    // Census (2026-11-08): before, 146 shrines and vendors mostly behind front decos (Megna Burrow's
    // shrine and vendor, Gimbap Bop's shrine behind a tree trunk); after, none.
    assert.deepEqual(hidden, []);
  });
});
