/**
 * PORCH (Austin 2026-11-01, "my house front is crowded"): the home street's own scenery keeps
 * its doorway clear. The planted border in front of the house (the street style's `trim`) and
 * the grass and plants along the yard (`near`) never stand over a house's door and its mat, on
 * every street style, house style and street width, nor over a Tower's door. Cultivations a
 * player planted are not scenery and are never moved. The same rule as a public street's doors
 * (DOORCLEAR, street-ecology streetReservedSpots).
 *
 * PLANTS (Austin 2026-11-01, "Plants by the house, thin out the ones covering the door"): the
 * border no longer hides a For Sale sign (the house decos ship without it since FORSALE), so it
 * keeps off the whole house front (houseFront: the door, its mat or path, the windows, Meadow's
 * flower bed and bench, Firebog's mushrooms, Uralia's pots) and is thinned to what fits at the
 * corner. A neighbour's house keeps its front clear the same way (no bush over it).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME_LIMITS } from '../public/js/homes-catalog.js?v=7aa9beb0';
import { createCultivationState, homeStreetLayout } from '../public/js/home-cultivation.js?v=f34fd6c9';
import { EXTERIOR_STYLES, streetLook } from '../public/js/home-styles.js?v=f591561f';
import { NEIGHBOURS, neighbourLayout } from '../public/js/neighbours.js?v=862857f9';
import { SCENE_STYLES, propPlan } from '../public/js/features/neighbour-scene.js?v=57b32c01';
import {
  DOORWAY_GAP,
  HOUSE_STYLE_KEYS,
  houseDoorway,
  houseFixtureX,
  houseFront,
  landscapeNearSpots,
  streetNearSkip,
  streetTrimSpots,
  towerDoorway,
} from '../public/js/features/homes-feature.js?v=5045af58';

const read = (rel) => readFileSync(join(import.meta.dirname, '..', 'public', 'js', rel), 'utf8');
const maxLeft = HOME_LIMITS.MAX_FRONTYARD_LEFT_SEGMENTS - HOME_LIMITS.START_FRONTYARD_LEFT_SEGMENTS;
const maxRight = HOME_LIMITS.MAX_FRONTYARD_RIGHT_SEGMENTS - HOME_LIMITS.START_FRONTYARD_RIGHT_SEGMENTS;
const built = EXTERIOR_STYLES.filter((row) => row.built);
const over = (x, half, zone) => x + half > zone.x1 && x - half < zone.x2;

describe('the home street keeps its doorways clear of scenery (PORCH)', () => {
  it('the doorway covers the door and its mat on every house', () => {
    const layout = homeStreetLayout(createCultivationState({}));
    for (const style of HOUSE_STYLE_KEYS) {
      const door = houseDoorway(layout, style);
      const { doorX } = houseFixtureX(layout, style);
      assert.ok(door.x1 < doorX && door.x2 > doorX, `${style}: the door's hit area is inside`);
      assert.ok(door.x2 - door.x1 >= 100, `${style}: wide enough for the mat`);
    }
  });

  it('the house front spans the doorway and the house art along its foot', () => {
    const layout = homeStreetLayout(createCultivationState({}));
    for (const style of HOUSE_STYLE_KEYS) {
      const front = houseFront(layout, style);
      const door = houseDoorway(layout, style);
      const { left, signX } = houseFixtureX(layout, style);
      assert.ok(front.x1 < door.x1 && front.x2 > door.x2, `${style}: the doorway is inside the front`);
      assert.ok(front.x1 > left && front.x1 - left < 80, `${style}: from the wall's left corner`);
      assert.ok(front.x2 - front.x1 > 250, `${style}: across the whole front`);
      assert.ok(signX < front.x1, `${style}: the Mailbox's corner stays outside`);
    }
  });

  it('no planted border sprite stands on the house front or past the yard edge, and the border is thinned', () => {
    let checked = 0;
    let kept = 0;
    let listed = 0;
    for (const row of built) {
      const look = streetLook(row.key);
      for (const style of HOUSE_STYLE_KEYS) {
        for (let yardLeft = 0; yardLeft <= maxLeft; yardLeft += 1) {
          const layout = homeStreetLayout(createCultivationState({ yardLeft }));
          const door = houseDoorway(layout, style);
          const front = houseFront(layout, style);
          const spots = streetTrimSpots(look, layout, style);
          listed += look.trim.length;
          kept += spots.length;
          assert.ok(spots.length < look.trim.length, `${row.key} ${style}: thinned (${spots.length} of ${look.trim.length})`);
          for (const s of spots) {
            checked += 1;
            assert.ok(s.x + s.half <= door.x1 - DOORWAY_GAP, `${row.key} ${style} ${s.meta.s} at ${Math.round(s.x)} reaches the doorway ${door.x1}`);
            assert.ok(s.x + s.half <= front.x1 - DOORWAY_GAP, `${row.key} ${style} ${s.meta.s} at ${Math.round(s.x)} stands on the house front ${front.x1}`);
            assert.ok(s.x - s.half >= layout.lotLeft + 40, `${row.key} ${style} ${s.meta.s} past the yard edge`);
          }
          for (let a = 0; a < spots.length; a += 1) {
            // Each next one stands left of the one before it, side by side, not stacked.
            for (let b = a + 1; b < spots.length; b += 1) assert.ok(spots[b].x + spots[b].half <= spots[a].x - spots[a].half + 0.5, `${row.key} ${style}: side by side, not stacked`);
          }
        }
      }
    }
    assert.ok(checked > 200, `swept ${checked} border sprites`);
    assert.ok(kept * 2 < listed + 20, `about half the border is left (${kept} of ${listed})`);
  });

  it('a neighbour\'s house front stays clear: no bush over it, props away from it', () => {
    for (const n of NEIGHBOURS) {
      assert.equal(n.house.cover, undefined, `${n.id}: no bush planted over the house`);
      const l = neighbourLayout(n);
      const front = { x1: l.houseX - l.houseW / 2, x2: l.houseX + l.houseW / 2 };
      for (const p of propPlan(n)) assert.ok(p.x < front.x1 - 100 || p.x > front.x2 + 100, `${n.id} ${p.name} at ${p.x} by the house`);
      assert.ok(SCENE_STYLES[n.style], n.id);
    }
    const src = read('features/neighbour-scene.js');
    assert.doesNotMatch(src, /h\.cover|coverX/, 'the scene plants nothing over the house');
  });

  it('no grass or plant grows over a house doorway or a Tower door, at any width', () => {
    let checked = 0;
    for (const row of built) {
      const look = streetLook(row.key);
      const seed = look.seed || row.key;
      for (let yardLeft = 0; yardLeft <= maxLeft; yardLeft += 2) {
        for (const yardRight of [0, maxRight]) {
          const state = createCultivationState({ yardLeft, yardRight });
          const layout = homeStreetLayout(state);
          // A Tower anywhere along the right yard (every 37 px), and none.
          const towers = [null];
          for (let x = layout.lotRight + 200; x < layout.width - 200; x += 37) towers.push(x);
          for (const towerX of towers) {
            const spots = landscapeNearSpots(look, seed, layout.width, streetNearSkip(layout, { towerX }));
            for (const s of spots) {
              checked += 1;
              for (const style of HOUSE_STYLE_KEYS) assert.ok(!over(s.x, s.half, houseDoorway(layout, style)), `${row.key} ${s.row.s} on the ${style} doorway`);
              if (towerX != null) assert.ok(!over(s.x, s.half, towerDoorway(towerX)), `${row.key} ${s.row.s} at ${Math.round(s.x)} on the Tower door at ${towerX}`);
            }
          }
        }
      }
    }
    assert.ok(checked > 10000, `swept ${checked} plants`);
  });

  it('draws the street from those spots (the house, the Tower and a visitor alike)', () => {
    const src = read('features/homes-feature.js');
    assert.match(src, /for \(const spot of streetTrimSpots\(style, layout, houseStyle\)\)/);
    assert.match(src, /skipNear: streetNearSkip\(layout, \{ towerX: towerFootX\(cult\) \}\)/);
    assert.match(src, /for \(const spot of landscapeNearSpots\(style, seed, width, skipNear\)\)/);
  });
});
