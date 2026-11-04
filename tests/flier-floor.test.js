/**
 * No planned flier is ever drawn below the walkable floor under it, on any street (player report of
 * 2026-11-01: a Butterfly half under the ground at the edge of Middle Arbor, after every street
 * Butterfly took to the air that morning).
 *
 * The original flies a Butterfly in the 200 px above the street's floor (npc_butterfly.js flyAround
 * 886-969) and a Batterfly in the 400 px above it (npc_batterfly.js flyAround 1039-1052), both from
 * one floor height for the whole street (geo.ground_y). The remake measures that band from the
 * floor under the flier (js/street-creatures.js flightFloor), because its streets slope and step:
 * Middle Arbor's floor climbs 260 px from its right end to its left, and a Butterfly at one height
 * went into the ground over the high end.
 *
 * The sweep: every street a player can reach (the street index, as tools/build-realtime-objects.mjs
 * lays it out for both solo and the realtime server), each planned flier on its whole path (a
 * Butterfly across the street and its margins at its worst bob; a Batterfly over its 340 px loop at
 * its lowest dip), its art's bottom edge against the exact floor (floorUnder) under every pixel of
 * its width.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CREATURE_PATHS,
  FLIER_LIFT,
  FLIGHT_FLOOR,
  batterflyAt,
  batterflyBaseY,
  flightFloor,
  flightFloorAt,
  flightFloorFor,
  floorProfile,
  floorUnder,
  flyerAt,
  flyerLift,
} from '../public/js/street-creatures.js?v=e4f7ed66';
import { setCreatureEcology, streetObjectLayout } from '../tools/build-realtime-objects.mjs';
import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=33d2b8bc';
import { setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=2c82c072';
import { platformsScreen, streetWidth, isItemSolid } from '../public/js/street-model.js?v=505d8990';
import { nearestSurfaceY } from '../public/js/walk-surface.js?v=c982983e';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const MIDDLE_ARBOR = 'GCR101UN0NJ1QPQ';

/** The highest floor under [x - halfW, x + halfW] (smaller y is higher), or null. */
function floorUnderWidth(row, x, halfW) {
  let m = null;
  const lo = Math.max(0, Math.floor(x - halfW));
  const hi = Math.min(row.length - 1, Math.ceil(x + halfW));
  for (let i = lo; i <= hi; i += 1) if (row[i] != null && (m == null || row[i] < m)) m = row[i];
  return m;
}

/**
 * Every planned flier on a street: the street Butterflies (spawnButterflies' flyers, index j among
 * them) and Batterflies (their home as animal-husbandry-feature batterflyHome makes it).
 */
function fliersOf(data, layout, platforms) {
  const fliers = [];
  let j = 0;
  for (const [, x, y, fly] of layout.butterflies) {
    if (!fly) continue;
    fliers.push({ kind: 'butterfly', j, x, y });
    j += 1;
  }
  for (const [i, x, y] of layout.batterflies) {
    const ground = nearestSurfaceY(platforms, x, y, isItemSolid) ?? y;
    fliers.push({ kind: 'batterfly', i, x, baseY: ground - FLIER_LIFT.batterfly.lift });
  }
  return fliers;
}

/** The lowest points of a flier's path, as the clients draw it: [{ x, y }]. */
function lowPoints(flier, floor, worldW) {
  const out = [];
  if (flier.kind === 'butterfly') {
    const f = CREATURE_PATHS.fly;
    const lift = flyerLift(flier.j);
    const home = { x0: flier.x, baseY: flier.y - lift, worldW, phase0: flier.j, floor, lift };
    const lapMs = ((worldW + 2 * f.margin) / f.speed) * 1000;
    // Every 4 px of the lap; the bob is at its lowest somewhere over each spot on some lap.
    for (let t = 0; t < lapMs; t += (4 / f.speed) * 1000) {
      const p = flyerAt(home, t);
      const bob = Math.sin(flier.j + (t / 1000) * f.bob) * f.amp;
      out.push({ x: p.x, y: p.y - bob + f.amp });
    }
    return out;
  }
  const b = FLIER_LIFT.batterfly;
  for (let dx = -b.dx; dx <= b.dx; dx += 2) {
    const x = flier.x + dx;
    out.push({ x, y: batterflyBaseY(flier.baseY, floor, x) + b.amp });
  }
  return out;
}

let streets = [];

before(async () => {
  setZoneStreetsShown(false);
  const index = JSON.parse(read('public/assets/streets/index.json'));
  applyStreetIndex(index);
  const ecology = JSON.parse(read('public/assets/content/street-ecology.json'));
  setStreetEcologyCatalog(ecology);
  setCreatureEcology(ecology);
  for (const tsid of Object.keys(index.streets).sort()) {
    let data;
    try {
      data = await loadStreetDataFromFs(tsid, join(root, 'public/assets/streets'));
    } catch {
      continue;
    }
    const layout = streetObjectLayout(data, { starter: tsid === STREET_INDEX.default });
    if (!layout.butterflies.some((row) => row[3]) && !layout.batterflies.length) continue;
    streets.push({ tsid, label: data.label || tsid, data, layout });
  }
});

describe('fliers keep above the floor under them', () => {
  it('the sprite sizes the sweep uses are the ones the game draws', () => {
    const game = read('public/game.js');
    assert.match(game, /const SCALE = 1\.35;/);
    assert.match(game, /butterflyFly: SCALE \* 0\.52,/);
    assert.match(game, /npc_butterfly__x1_fly-side_png_1354829525\.png',\n\s+fw: 70, fh: 65,/);
    assert.match(game, /b\.anchor\.set\(0\.5, 0\.5\);\n\s+b\.baseScale = ENTITY_SCALE\.butterflyFly;/);
    assert.match(game, /b\.lift = flyerLift\(i\);/);
    const husbandry = read('public/js/features/animal-husbandry-feature.js');
    assert.match(husbandry, /profile: Object\.freeze\(\{ path: `\$\{DIR\}npc_batterfly_profile\.webp`, fw: 111, fh: 96,/);
    assert.match(husbandry, /spr\.anchor\.set\(0\.5, 0\.62\);\n\s+spr\.scale\.set\(0\.82\);/);
    assert.match(husbandry, /baseY: ground - 150,/);
    assert.match(husbandry, /const dy = Math\.sin\(entity\.phase \* 0\.9\) \* 26 \+ Math\.cos\(entity\.phase \* 0\.21\) \* 34;/);
    assert.equal(FLIER_LIFT.butterfly.amp, CREATURE_PATHS.fly.amp);
    assert.equal(FLIER_LIFT.batterfly.dx, CREATURE_PATHS.batterfly.dx);
    // The smoothing keeps a flier's whole width over the floor (FLIGHT_FLOOR).
    for (const kind of Object.values(FLIER_LIFT)) assert.ok(kind.halfW <= FLIGHT_FLOOR.ease && FLIGHT_FLOOR.ease <= FLIGHT_FLOOR.reach, JSON.stringify(kind));
  });

  it('a flier follows a sloping floor up and down, and rises before a step', () => {
    const platforms = [
      { x1: 0, y1: 700, x2: 1000, y2: 900 },
      { x1: 1000, y1: 900, x2: 1400, y2: 900 },
      { x1: 1400, y1: 600, x2: 2000, y2: 600 },
    ];
    const floor = flightFloor(platforms, 2000);
    for (let x = 0; x <= 2000; x += 1) {
      const under = floorUnder(platforms, x);
      // Just past the step the old ground is still near, and the new one is no floor yet.
      if (under == null) {
        assert.ok(x > 1406 && x <= 1424, String(x));
        continue;
      }
      assert.ok(flightFloorAt(floor, x) <= under + 1e-9, `${x}: ${flightFloorAt(floor, x)} vs ${under}`);
    }
    // On the slope it is the slope, a little higher for the smoothing (120 px of a 1 in 5 slope).
    assert.ok(flightFloorAt(floor, 500) <= 800 && flightFloorAt(floor, 500) > 770, String(flightFloorAt(floor, 500)));
    // The exact floor, pixel by pixel, is floorUnder.
    assert.deepEqual(floorProfile(platforms, 2000).slice(495, 505), Array.from({ length: 10 }, (_, i) => floorUnder(platforms, 495 + i)));
    // Before the 300 px step it is already up.
    assert.ok(flightFloorAt(floor, 1360) < 700, String(flightFloorAt(floor, 1360)));
    // A branch high over the ground is not the floor; a hill top drawn over a lower line is.
    const tiers = [
      { x1: 0, y1: 900, x2: 2000, y2: 900 },
      { x1: 400, y1: 500, x2: 700, y2: 500 },
      { x1: 1200, y1: 780, x2: 1500, y2: 780 },
    ];
    assert.equal(floorUnder(tiers, 550), 900);
    assert.equal(floorUnder(tiers, 1300), 780);
    // A ceiling (pc_perm 1) is no floor.
    assert.equal(floorUnder([{ x1: 0, y1: 900, x2: 100, y2: 900 }, { x1: 0, y1: 850, x2: 100, y2: 850, pcPerm: 1 }], 50), 900);
    // No lines, no floor: the flier keeps its height.
    assert.equal(flightFloor([], 1000), null);
    assert.equal(flyerAt({ x0: 100, baseY: 500, worldW: 1000, floor: null }, 0).y, 500);
    // One floor per street's lines (kept per array).
    assert.equal(flightFloorFor(platforms, 2000), flightFloorFor(platforms, 2000));
  });

  it('on Middle Arbor the Butterfly flies over the high end of the street instead of under it', () => {
    const street = streets.find((s) => s.tsid === MIDDLE_ARBOR);
    assert.ok(street, 'Middle Arbor has a flying Butterfly');
    const platforms = platformsScreen(street.data);
    const worldW = streetWidth(street.data);
    const [flier] = fliersOf(street.data, street.layout, platforms);
    // At one height (the spot's, as before) it was 130 px below the floor at the left end.
    const oneHeight = flier.y - flyerLift(0) + FLIER_LIFT.butterfly.amp + FLIER_LIFT.butterfly.below;
    assert.ok(oneHeight > floorUnder(platforms, 100) + 100, `${oneHeight} vs ${floorUnder(platforms, 100)}`);
    const floor = flightFloor(platforms, worldW);
    for (const x of [100, 1000, 2000, 3253, 5000, 5900]) {
      const y = flyerAt({ x0: x, baseY: 0, worldW, floor, lift: flyerLift(0) }, 0).y;
      assert.ok(y + FLIER_LIFT.butterfly.amp + FLIER_LIFT.butterfly.below <= floorUnder(platforms, x), `${x}: ${y}`);
      // and stays in the original's 200 px band over the floor
      assert.ok(floorUnder(platforms, x) - y < FLIGHT_FLOOR.band, `${x}: ${y}`);
    }
  });

  it('every street\'s Butterflies and Batterflies, on their whole paths, stay above the floor under them', () => {
    let butterflies = 0;
    let batterflies = 0;
    const below = [];
    for (const street of streets) {
      const platforms = platformsScreen(street.data);
      const worldW = streetWidth(street.data);
      const floor = flightFloor(platforms, worldW);
      const row = floorProfile(platforms, worldW);
      for (const flier of fliersOf(street.data, street.layout, platforms)) {
        if (flier.kind === 'butterfly') butterflies += 1;
        else batterflies += 1;
        const size = FLIER_LIFT[flier.kind];
        let worst = null;
        for (const p of lowPoints(flier, floor, worldW)) {
          const under = floorUnderWidth(row, p.x, size.halfW);
          if (under == null) continue;
          const dip = p.y + size.below - under;
          if (dip > 0 && (!worst || dip > worst.dip)) worst = { x: Math.round(p.x), dip: Math.round(dip) };
        }
        if (worst) below.push(`${street.label} (${street.tsid}) ${flier.kind} ${flier.j ?? flier.i}: ${worst.dip} px under the floor at x ${worst.x}`);
      }
    }
    assert.ok(butterflies >= 1500, `${butterflies} flying Butterflies swept`);
    assert.ok(batterflies >= 50, `${batterflies} Batterflies swept`);
    assert.deepEqual(below, []);
  });

  it('the shared path (online) and the solo step draw a flier over the same floor', () => {
    const game = read('public/game.js');
    assert.match(game, /b\._flightFloor = flightFloorFor\(streetPlatforms, WORLD_W\);/);
    assert.match(game, /const mid = under == null \? b\.baseY : under - \(b\.lift \?\? 90\);/);
    const shared = read('public/js/features/street-objects-feature.js');
    assert.match(shared, /floor: flightFloorFor\(engine\.platforms, worldW\),\n\s+lift: flyerLift\(j\),/);
    assert.match(shared, /const home = \{ \.\.\.placed, floor: flightFloorFor\(engine\.platforms, Number\(engine\.worldW\) \|\| 2000\) \};/);
    const husbandry = read('public/js/features/animal-husbandry-feature.js');
    assert.match(husbandry, /spr\.y = batterflyBaseY\(entity\.baseY, flightFloorFor\(engine\?\.platforms, engine\?\.worldW\), nx\) \+ dy;/);
    // A Batterfly's shared path and its solo loop agree.
    const platforms = [{ x1: 0, y1: 900, x2: 400, y2: 600 }, { x1: 400, y1: 600, x2: 1200, y2: 600 }];
    const floor = flightFloor(platforms, 1200);
    for (let t = 0; t < 30000; t += 997) {
      const p = batterflyAt({ baseX: 300, baseY: 760, phase0: 1, floor }, t);
      const phase = 1 + t / 1000;
      const dy = Math.sin(phase * 0.9) * 26 + Math.cos(phase * 0.21) * 34;
      assert.ok(Math.abs(p.y - (batterflyBaseY(760, floor, p.x) + dy)) < 1e-9);
      // Never under the floor, however far the floor rises across its loop.
      assert.ok(p.y + FLIER_LIFT.batterfly.below <= floorUnder(platforms, p.x), `${t}: ${p.y}`);
    }
  });
});
