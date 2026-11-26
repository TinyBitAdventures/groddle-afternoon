/** G891: a Sloth hanging in its tree: its collision box (the walk-under peek) and its reach from the path below. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SLOTH_COLLISION, slothGeometry, slothPeekBox, touchesSloth } from '../public/js/features/resource-nodes-feature.js?v=abc828a8';
import { SLOTH_SPOTS } from '../public/js/sloth-spots-data.js?v=7396e9db';
import { slothSpotFromRow } from '../public/js/sloth-trees.js?v=a3299191';
import { platformsScreen, platformYAt } from '../public/js/street-model.js?v=a9a05f9d';
import { avatarHitBox, behindFloor } from '../public/js/reach.js?v=456da8a8';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const geoOf = (tsid, i) => {
  const spot = slothSpotFromRow(SLOTH_SPOTS[tsid][i]);
  return slothGeometry({ x: spot.x, y: spot.y, sloth: spot });
};
/** Every floor line's y at x, top to bottom. */
const floorsAt = (platforms, x) => platforms.map((p) => platformYAt(p, x, 0)).filter((y) => y != null).sort((a, b) => a - b);

describe('a Sloth in its tree (G891)', () => {
  it('collides as npc_sloth.js did: 300 x 200 over its point, the bottom_extender down to the floor', () => {
    const geo = geoOf('GA55645B8O528MI', 0);
    assert.deepEqual(slothPeekBox(geo), { left: geo.origin.x - 150, right: geo.origin.x + 150, top: geo.origin.y - 200, bottom: geo.floor });
    assert.equal(SLOTH_COLLISION.w, 300);
  });

  it('peeks at a player walking the path under it, not one on a floor below that or off to the side', () => {
    // Jonna Jinx's first tree stands on a ledge (floor 681 under the sloth), with the street's lower path under it.
    const tsid = 'GA55645B8O528MI';
    const geo = geoOf(tsid, 0);
    const platforms = platformsScreen(street(tsid));
    const floors = floorsAt(platforms, geo.grip.x);
    const under = floors.find((y) => Math.abs(y - geo.floor) <= 2);
    const lower = floors.find((y) => y > geo.floor + 130);
    assert.ok(under != null && lower != null, `floors ${floors}`);
    assert.equal(touchesSloth(geo.grip.x, under, geo), true);
    assert.equal(touchesSloth(geo.origin.x - 170, under, geo), true, 'the box is 300 wide, and the avatar 66');
    assert.equal(touchesSloth(geo.origin.x + 200, under, geo), false);
    assert.equal(touchesSloth(geo.grip.x, lower, geo), false);
  });

  it('every Sloth is in reach from the floor under it, and not from far below', () => {
    let checked = 0;
    for (const [tsid, rows] of Object.entries(SLOTH_SPOTS)) {
      const platforms = platformsScreen(street(tsid));
      rows.forEach((row, i) => {
        const geo = geoOf(tsid, i);
        const x = geo.grip.x;
        const feet = geo.floor;
        const hitBox = avatarHitBox(x, feet);
        const body = { x, y: feet - 60 };
        // Standing on the floor under it, the target's box reaches down to the feet: no floor between.
        assert.equal(behindFloor(platforms, body, geo.box, null, { airborne: true, feetY: feet, hitBox }), false, `${tsid} ${i}`);
        assert.equal(touchesSloth(x, feet, geo), true, `${tsid} ${i} peeks`);
        checked += 1;
      });
    }
    assert.equal(checked, 84);
  });
});
