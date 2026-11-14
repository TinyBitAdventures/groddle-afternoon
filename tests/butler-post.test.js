/**
 * PORCH (Austin 2026-11-01, "my house front is crowded"): the Butler hovered at the door. The
 * source posts it at target_loc 660, "to the right of the door" (bag_butler.js 4820-4823), and
 * strolls it up to 300 px either side, 200 px off the street's ends (startMoving 5507-5521);
 * createButler (inc_butler.js 1-42) sets no target_loc. The remake had posted it where its box
 * stood (300), just past the Magic Rock. It now keeps the source's post, solo and for visitors.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUTLER, butlerPostRx, createButler, createButlerState, normalizeButlerState } from '../public/js/butler.js?v=a660e585';
import { HOME_LIMITS } from '../public/js/homes-catalog.js?v=10ac34b6';
import { createCultivationState, homeStreetLayout } from '../public/js/home-cultivation.js?v=a3135ffd';
import { BUTLER_BOX, STREET_ROCK } from '../public/js/home-street-fixtures.js?v=bad831a1';
import { HOUSE_STYLE_KEYS, houseDoorway } from '../public/js/features/homes-feature.js?v=b83d2301';

const ROOT = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(ROOT, 'public', 'js', rel), 'utf8');

describe('the Butler keeps the source\'s post (PORCH)', () => {
  it('posts at 660 right of the house unless set post moved it', () => {
    assert.equal(BUTLER.POST_RX, 660);
    assert.equal(butlerPostRx(null), 660);
    assert.equal(butlerPostRx(undefined), 660);
    assert.equal(butlerPostRx('x'), 660);
    assert.equal(butlerPostRx(300), 660, 'a post from before PORCH (the box spot) reads as none');
    assert.equal(butlerPostRx(-140.4), -140, 'set post keeps yours');
    assert.equal(butlerPostRx(301), 301);
    const s = createButlerState();
    createButler(s, { now: 1, rand: () => 0 });
    assert.equal(s.post, null, 'createButler sets no target_loc');
    assert.equal(normalizeButlerState(JSON.parse(JSON.stringify(s))).post, null);
  });

  it('strolls 300 px either side of it, clear of the doorway, the Magic Rock and the Butler Box, on every street', () => {
    const maxLeft = HOME_LIMITS.MAX_FRONTYARD_LEFT_SEGMENTS - HOME_LIMITS.START_FRONTYARD_LEFT_SEGMENTS;
    const maxRight = HOME_LIMITS.MAX_FRONTYARD_RIGHT_SEGMENTS - HOME_LIMITS.START_FRONTYARD_RIGHT_SEGMENTS;
    for (let yardLeft = 0; yardLeft <= maxLeft; yardLeft += 1) {
      for (const yardRight of [0, maxRight]) {
        const layout = homeStreetLayout(createCultivationState({ yardLeft, yardRight }));
        const post = Math.max(BUTLER.WANDER_EDGE, Math.min(layout.width - BUTLER.WANDER_EDGE, layout.houseX + butlerPostRx(null)));
        const left = Math.max(BUTLER.WANDER_EDGE, post - BUTLER.WANDER_RANGE);
        const right = Math.min(layout.width - BUTLER.WANDER_EDGE, post + BUTLER.WANDER_RANGE);
        assert.ok(right - left >= 500, `a wide walk: ${left}..${right}`);
        for (const style of HOUSE_STYLE_KEYS) assert.ok(left > houseDoorway(layout, style).x2 + 100, `${style}: off the doorway`);
        assert.ok(left - 30 > layout.houseX + STREET_ROCK.houseDx + STREET_ROCK.half, 'past the Magic Rock');
        assert.ok(left > layout.houseX + BUTLER_BOX.houseDx + BUTLER_BOX.half, 'past where the Butler Box stood');
      }
    }
  });

  it('follows the source', () => {
    const gsjs = join(ROOT, '../glitch-GameServerJS/items/bag_butler.js');
    if (existsSync(gsjs)) {
      const src = readFileSync(gsjs, 'utf8');
      assert.match(src, /this\.target_loc = 660; \/\/ to the right of the door/);
      assert.match(src, /var left = this\.container\.geo\.l\+200;[\s\S]{0,200}if \(left < \(target - 300\)\)/);
    }
  });

  it('is wired: the owner\'s Butler and the one a visitor meets stand at the same post', () => {
    const own = read('features/butler-feature.js');
    assert.match(own, /l\.houseX \+ butlerPostRx\(st\.post\)/);
    assert.match(own, /createButler\(st, \{ now: now\(\) \}\);/);
    assert.doesNotMatch(own, /st\.post \?\? BOX_RX/);
    assert.match(read('features/neighbours-mp-feature.js'), /layout\.houseX \+ butlerPostRx\(b\.post\)/);
  });
});

describe('report 174: the Butler can be clicked in the doorway', () => {
  it("its click box is the pose's own, smaller than the house door's", async () => {
    const { butlerHitSize } = await import('../public/js/features/butler-feature.js?fresh=butler-hit');
    const rig = JSON.parse(readFileSync(new URL('../public/assets/butler-rig/butler.json', import.meta.url), 'utf8'));
    const stand = butlerHitSize(rig, 'idle0');
    assert.deepEqual(stand, { w: 76, h: 107 });
    // homes-feature.js: the door's hit area is 92 by 150; a click takes the smallest box under it.
    assert.ok(stand.w * stand.h < 92 * 150);
    // The canvas that fits every pose is far bigger; that is what lost to the door.
    const all = Object.values(rig.box).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
    assert.ok((all[2] - all[0]) * (all[3] - all[1]) > 92 * 150);
    assert.equal(butlerHitSize(rig, 'no_such_clip').w, stand.w);
    const src = readFileSync(new URL('../public/js/features/butler-feature.js', import.meta.url), 'utf8');
    assert.match(src, /v\.clip = clip;\n  fitHitBox\(v, clip\);/);
  });
});
