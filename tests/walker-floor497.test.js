// #497 (Nightshade Woods): Piggies walked a little below the front grass edge, only their top half
// showing. Online a shared Piggy's x snaps to its path (a hidden tab, a reload: followPath SNAP_PX)
// while its feet looked for a line only 24 px either way; on a slope that left the old y, inside the
// ground, for good. A walker that lost its line now stands on the nearest line at once.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { walkerFloorY, WALKER_REACH_PX } from '../public/js/walk-surface.js?v=76def2f6';
import { platformYAt } from '../public/js/street-model.js?v=a9a05f9d';

const root = join(import.meta.dirname, '..');
const street = JSON.parse(readFileSync(join(root, 'public/assets/streets/GCR11JA67NJ15N3.json'), 'utf8'));
// Screen space as game.js keeps streetPlatforms: x - l, y - t.
const { l, t } = street.bounds;
const plats = street.platforms.map((p) => ({ ...p, x1: p.x1 - l, x2: p.x2 - l, y1: p.y1 - t, y2: p.y2 - t }));
const ground = (x) => Math.max(...plats.map((p) => platformYAt(p, x, 0)).filter((y) => y != null && y > 900));

describe('#497 a walking animal stays on its line', () => {
  it('follows its line, a step over a few frames', () => {
    const x = 1000 - l;
    const y = ground(x);
    assert.equal(walkerFloorY(plats, x, y, 1), y);
    assert.equal(walkerFloorY(plats, x, y + 10, 1), y + 10 - 1.5);
  });

  it('stands on its line again after a snap across a Nightshade Woods slope', () => {
    // From x -53 (line -60) to x 226 (line -26): the line is 34 px lower there, beyond the reach.
    const from = -53 - l;
    const to = 226 - l;
    const y0 = ground(from);
    assert.ok(Math.abs(ground(to) - y0) > WALKER_REACH_PX);
    // The other way round: from the low end to the high end the old y was under the ground.
    assert.equal(walkerFloorY(plats, from, ground(to), 1), y0);
    assert.equal(walkerFloorY(plats, to, y0, 1), ground(to));
  });

  it('every x on the street: a walker set anywhere 25-80 px off the line is back on it in one frame', () => {
    for (let x = 0; x <= 6000; x += 50) {
      const y = ground(x);
      if (!Number.isFinite(y)) continue;
      for (const off of [-80, -25, 25, 80]) {
        // Away from the upper shelf (704-1000), the only other line on the street.
        if (x + l >= 690 && x + l <= 1010) continue;
        const got = walkerFloorY(plats, x, y + off, 1);
        assert.equal(got, Math.abs(off) > WALKER_REACH_PX ? y : y + off - Math.sign(off) * 1.5, `x ${x + l} off ${off}`);
      }
    }
  });

  it('keeps its y where there is no line at x at all', () => {
    assert.equal(walkerFloorY([], 10, 123, 1), 123);
  });

  it('game.js walkers (Piggies, Chickens) go through it', () => {
    const g = readFileSync(join(root, 'public/game.js'), 'utf8');
    // #494 follows the floor from where it stood; #497 is its fallback when that loses the line.
    assert.match(g, /function followWalkFloor\(spr, dt = 1\) \{[\s\S]*?if \(!Number\.isFinite\(y\)\) \{\n    spr\.y = walkerFloorY\(streetPlatforms, spr\.x, spr\.y, dt\);/);
  });
});
