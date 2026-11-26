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
 * lays it out for both solo and the realtime server) with a planned flier of a kind: a Butterfly or
 * Batterfly flies anywhere over the street (flierAt, lane flyk), so at every x it may reach, at the
 * bottom of its band, its art's bottom edge against the exact floor (floorUnder) under every pixel
 * of its width.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  FLIER_LIFT,
  FLIGHT_FLOOR,
  FLY_WANDER,
  flierAt,
  flierPlan,
  flierRange,
  flierSeed,
  flightFloor,
  flightFloorAt,
  flightFloorFor,
  floorProfile,
  floorUnder,
} from '../public/js/street-creatures.js?v=3e018c03';
import { setCreatureEcology, streetObjectLayout } from '../tools/build-realtime-objects.mjs';
import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=10376267';
import { flightGroundFor, setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=f1c11a2d';
import { platformsScreen, streetWidth, isItemSolid } from '../public/js/street-model.js?v=a9a05f9d';
import { nearestSurfaceY } from '../public/js/walk-surface.js?v=3c919d5b';

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

/** The planned flier kinds on a street (spawnButterflies' flyers, the Batterflies). */
function kindsOf(layout) {
  const kinds = [];
  if (layout.butterflies.some((row) => row[3])) kinds.push('butterfly');
  if (layout.batterflies.length) kinds.push('batterfly');
  return kinds;
}

/** The lowest a flier of this kind flies at each x it may reach (flierAt: the bottom of its band): [{ x, y }]. */
function lowPoints(kind, floor, worldW) {
  const out = [];
  const [lo, hi] = flierRange(kind, worldW);
  for (let x = lo; x <= hi; x += 2) {
    const under = flightFloorAt(floor, x);
    if (under != null) out.push({ x, y: under - FLY_WANDER[kind].low });
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
    assert.match(game, /npc_butterfly__x1_fly-side_png_1354829525\.webp',\n\s+fw: 70, fh: 65,/);
    assert.match(game, /b\.anchor\.set\(0\.5, 0\.5\);\n\s+b\.baseScale = ENTITY_SCALE\.butterflyFly;/);
    const husbandry = read('public/js/features/animal-husbandry-feature.js');
    assert.match(husbandry, /profile: Object\.freeze\(\{ path: `\$\{DIR\}npc_batterfly_profile\.webp`, fw: 111, fh: 96,/);
    assert.match(husbandry, /spr\.anchor\.set\(0\.5, 0\.62\);\n\s+spr\.scale\.set\(0\.82\);/);
    // Its art stays inside the street at the band's ends (FLY_WANDER edge) and above its bottom.
    for (const kind of ['butterfly', 'batterfly']) {
      assert.ok(FLY_WANDER[kind].edge >= FLIER_LIFT[kind].halfW && FLY_WANDER[kind].low >= FLIER_LIFT[kind].below, kind);
    }
    // The original's bands: 200 px over the floor for a Butterfly, 400 for a Batterfly.
    assert.equal(FLY_WANDER.butterfly.high, FLIGHT_FLOOR.band);
    assert.equal(FLY_WANDER.batterfly.high, 400);
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
    const plain = flierAt({ seed: 3, worldW: 1000, floor: null, groundY: 500 }, 0);
    assert.equal(plain.y, 500 - plain.h);
    // One floor per street's lines (kept per array).
    assert.equal(flightFloorFor(platforms, 2000), flightFloorFor(platforms, 2000));
  });

  it('on Middle Arbor the Butterfly flies over the high end of the street instead of under it', () => {
    const street = streets.find((s) => s.tsid === MIDDLE_ARBOR);
    assert.ok(street, 'Middle Arbor has a flying Butterfly');
    const platforms = platformsScreen(street.data);
    const worldW = streetWidth(street.data);
    // At one height (the spot's) it was once 130 px below the floor at the left end; the flight
    // floor keeps it over the street wherever it flies, in the original's 200 px band.
    const [, sx, sy] = street.layout.butterflies.find((row) => row[3]);
    assert.ok(Number.isFinite(sy));
    const floor = flightFloor(platforms, worldW, { groundY: flightGroundFor(street.data) });
    const home = { kind: 'butterfly', seed: flierSeed('butterfly', 0, sx), worldW, floor, groundY: sy };
    const plan = flierPlan(home);
    let left = Infinity;
    for (let t = 0; t < plan.ms; t += 500) {
      const p = flierAt(home, t);
      left = Math.min(left, p.x);
      const under = floorUnder(platforms, p.x);
      if (under == null) continue;
      assert.ok(p.y + FLIER_LIFT.butterfly.below <= under, `${p.x}: ${p.y}`);
      assert.ok(under - p.y <= FLIGHT_FLOOR.band + 60, `${p.x}: ${p.y} over ${under}`);
    }
    assert.ok(left < 1000, `it reaches the high left end (${left})`);
  });

  it('every street\'s Butterflies and Batterflies, on their whole paths, stay above the floor under them', () => {
    let butterflies = 0;
    let batterflies = 0;
    const below = [];
    for (const street of streets) {
      const platforms = platformsScreen(street.data);
      const worldW = streetWidth(street.data);
      // As the game flies it: over the location's ground_y where the lines are lower (#704).
      const floor = flightFloor(platforms, worldW, { groundY: flightGroundFor(street.data) });
      const row = floorProfile(platforms, worldW);
      for (const kind of kindsOf(street.layout)) {
        if (kind === 'butterfly') butterflies += 1;
        else batterflies += 1;
        const size = FLIER_LIFT[kind];
        let worst = null;
        for (const p of lowPoints(kind, floor, worldW)) {
          const under = floorUnderWidth(row, p.x, size.halfW);
          if (under == null) continue;
          const dip = p.y + size.below - under;
          if (dip > 0 && (!worst || dip > worst.dip)) worst = { x: Math.round(p.x), dip: Math.round(dip) };
        }
        if (worst) below.push(`${street.label} (${street.tsid}) ${kind}: ${worst.dip} px under the floor at x ${worst.x}`);
      }
    }
    assert.ok(butterflies >= 700, `${butterflies} Butterfly streets swept`);
    assert.ok(batterflies >= 50, `${batterflies} Batterfly streets swept`);
    assert.deepEqual(below, []);
  });

  it('the shared path (online) and the solo step draw a flier over the same floor', () => {
    const game = read('public/game.js');
    assert.match(game, /floor: flightFloorFor\(streetPlatforms, WORLD_W, flightGroundFor\(currentStreet\)\),/);
    assert.match(game, /const p = flierAt\(b\._flight, b\._flyClock\);/);
    const shared = read('public/js/features/street-objects-feature.js');
    assert.match(shared, /floor: flightFloorFor\(engine\.platforms, worldW, flightGroundFor\(engine\.street\)\),/);
    assert.match(shared, /const home = \{ \.\.\.placed, floor: flightFloorFor\(engine\.platforms, Number\(engine\.worldW\) \|\| 2000, flightGroundFor\(engine\.street\)\) \};/);
    assert.match(shared, /pointAt = \(\) => flierAt\(home, pathTime\(t\.sharedPath, Date\.now\(\), copy\.offset\)\);/);
    const husbandry = read('public/js/features/animal-husbandry-feature.js');
    assert.match(husbandry, /floor: flightFloorFor\(engine\?\.platforms, worldW, flightGroundFor\(engine\?\.street\)\),/);
    assert.match(husbandry, /flierAt\(entity\.home, entity\.clock\)/);
    // Never under the floor, however far the floor rises across the street.
    const platforms = [{ x1: 0, y1: 900, x2: 400, y2: 600 }, { x1: 400, y1: 600, x2: 1200, y2: 600 }];
    const floor = flightFloor(platforms, 1200);
    const home = { kind: 'batterfly', seed: flierSeed('batterfly', 0, 300), worldW: 1200, floor, groundY: 760 };
    for (let t = 0; t < 600_000; t += 997) {
      const p = flierAt(home, t);
      assert.ok(p.y + FLIER_LIFT.batterfly.below <= floorUnder(platforms, p.x), `${t}: ${p.y}`);
    }
  });
});
