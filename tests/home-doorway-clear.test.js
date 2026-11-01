/**
 * PORCH (Austin 2026-11-01, "my house front is crowded"): the home street's own scenery keeps
 * its doorway clear. The planted border in front of the house (the street style's `trim`) and
 * the grass and plants along the yard (`near`) never stand over a house's door and its mat, on
 * every street style, house style and street width, nor over a Tower's door. Cultivations a
 * player planted are not scenery and are never moved. The same rule as a public street's doors
 * (DOORCLEAR, street-ecology streetReservedSpots).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME_LIMITS } from '../public/js/homes-catalog.js?v=29713fa8';
import { createCultivationState, homeStreetLayout } from '../public/js/home-cultivation.js?v=1cfff492';
import { EXTERIOR_STYLES, streetLook } from '../public/js/home-styles.js?v=f591561f';
import {
  DOORWAY_GAP,
  HOUSE_STYLE_KEYS,
  houseDoorway,
  houseFixtureX,
  landscapeNearSpots,
  streetNearSkip,
  streetTrimSpots,
  towerDoorway,
} from '../public/js/features/homes-feature.js?v=cda270f0';

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

  it('no planted border sprite reaches the doorway, and the border still hides the For Sale sign', () => {
    let checked = 0;
    for (const row of built) {
      const look = streetLook(row.key);
      for (const style of HOUSE_STYLE_KEYS) {
        for (let yardLeft = 0; yardLeft <= maxLeft; yardLeft += 1) {
          const layout = homeStreetLayout(createCultivationState({ yardLeft }));
          const door = houseDoorway(layout, style);
          const { left, signX } = houseFixtureX(layout, style);
          const spots = streetTrimSpots(look, layout, style);
          for (const s of spots) {
            checked += 1;
            assert.ok(s.x + s.half <= door.x1 - DOORWAY_GAP, `${row.key} ${style} ${s.meta.s} at ${Math.round(s.x)} reaches the doorway ${door.x1}`);
          }
          if (spots.length) assert.ok(spots.some((s) => s.x - s.half <= signX && s.x + s.half >= left), `${row.key} ${style}: something stands at the sign`);
        }
      }
    }
    assert.ok(checked > 500, `swept ${checked} border sprites`);
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
