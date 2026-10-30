/**
 * A source line with <null id="platform_pc_perm"/> is hard both ways (PlatformLine.as
 * pc_solid_from_top / pc_solid_from_bottom 341-347): stood on from above, and a rising
 * head stops under it. Tiny Speck drew them over tunnels and tubes; in Flipside's swiss
 * pipe a jump went out through the roof (Austin 2026-10-29). Hand-built lines (no
 * pc_perm) stay plain floors, and Penumbra, rebuilt from video, uses -1 floors.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { avatarHeadReach, headCeiling, isSolidFromBelow, isStandable, platformYAt, platformsScreen } from '../public/js/street-model.js?v=g478-1';

const street = (path) => JSON.parse(readFileSync(new URL(`../public/assets/streets/${path}`, import.meta.url), 'utf8'));

describe('null pc_perm lines are ceilings and floors', () => {
  it('maps a source null to null, a missing pc_perm to undefined', () => {
    const s = { bounds: { l: 0, t: 0, r: 100, b: 100 }, platforms: [
      { id: 'a', x1: 0, y1: 50, x2: 100, y2: 50, pc_perm: null },
      { id: 'b', x1: 0, y1: 60, x2: 100, y2: 60 },
      { id: 'c', x1: 0, y1: 70, x2: 100, y2: 70, pc_perm: -1 },
      { id: 'd', x1: 0, y1: 80, x2: 100, y2: 80, pc_perm: 1 },
    ] };
    const [a, b, c, d] = platformsScreen(s);
    assert.equal(a.pcPerm, null);
    assert.equal(b.pcPerm, undefined);
    assert.deepEqual([a, b, c, d].map(isSolidFromBelow), [true, false, false, true]);
    assert.deepEqual([a, b, c, d].map(isStandable), [true, true, true, false]);
  });

  it('a jump inside Flipside\'s swiss pipe stops at its roof', () => {
    const flipside = street('GM410QQ0CHARO.json');
    const lines = platformsScreen(flipside);
    const roof = lines.find((p) => p.id === '_pl1257651945319');
    assert.equal(roof.pcPerm, null);
    // Feet on the pipe's floor (screen y 1950), x 1450 under the roof: a rise to 1852 crosses it.
    const feet = headCeiling(lines, 1450, 1950, 1450, 1852, 80);
    assert.ok(feet != null && feet > 1852 && feet < 1950, String(feet));
  });

  it('Penumbra, rebuilt from video, has plain floors', () => {
    const penumbra = street('GIFM2QAIQ1C31JV.json');
    assert.ok(penumbra.platforms.length > 0);
    assert.ok(penumbra.platforms.every((p) => p.pc_perm === -1));
  });
});

/**
 * The head stops where the 2012 client's head circle did (AvatarPhysicsHandler
 * calcCircleGap + ColliderAvatar radius 15 + line radius 1): 111 px over the feet
 * at scale 1. The remake stopped it at 80 px (the circle gap alone), so in the
 * swiss pipe the avatar's ~131 px drawn head and hair rose 45 px over the pipe's
 * painted top (Austin 2026-10-30); at the client's reach it is ~14 px.
 */
describe('the head reaches as high as the client\'s head circle', () => {
  it('is the client formula: 110 x scale + 1 over the feet, centre 16 under that', () => {
    assert.deepEqual(avatarHeadReach(1), { centre: 95, reach: 111 });
    const small = avatarHeadReach(0.41);
    assert.ok(Math.abs(small.reach - (110 * 0.41 + 1)) < 1e-9 && Math.abs(small.centre - (small.reach - 16)) < 1e-9);
    assert.deepEqual(avatarHeadReach(0), avatarHeadReach(1), 'no scale is scale 1');
  });

  const flipside = street('GM410QQ0CHARO.json');
  const lines = platformsScreen(flipside);
  const floor = 1950; // pl1257582196548, world y -50
  const roofAt = (x) => Math.max(...lines.filter((p) => isSolidFromBelow(p)).map((p) => platformYAt(p, x, 0) ?? -Infinity));
  /** A plain jump stepped as game.js physics() does (vy -9.6, +0.42 a frame), head against the lines. */
  const peak = (x, head) => {
    let y = floor;
    let vy = -9.6;
    let top = y;
    for (let i = 0; i < 80; i++) {
      vy += 0.42;
      const prev = y;
      y += vy;
      const stop = headCeiling(lines, x, prev, x, y, head);
      if (stop != null) {
        y = stop;
        if (vy < 0) vy = 0;
      }
      if (y >= floor) { y = floor; break; }
      top = Math.min(top, y);
    }
    return top;
  };

  it('inside the swiss pipe the head stops 111 px over the feet: a 14 px hop, not 45', () => {
    const x = 1450;
    const roof = roofAt(x);
    assert.ok(Math.abs(floor - roof - 124.6) < 0.5, `roof ${roof}`);
    assert.ok(Math.abs(peak(x, avatarHeadReach(1)) - (roof + 111)) < 0.01);
    assert.ok(Math.abs(floor - peak(x, avatarHeadReach(1)) - 13.6) < 0.5);
    assert.ok(Math.abs(floor - peak(x, 80) - 44.6) < 0.5, 'the old 80 px head');
  });

  it('the roof has no hole where its two lines meet (x 1401)', () => {
    const roof = roofAt(1401);
    for (const x of [1399.5, 1400, 1401, 1402, 1402.5]) {
      const top = peak(x, avatarHeadReach(1));
      assert.ok(Math.abs(top - (roof + 111)) < 1, `x ${x}: feet ${top}`);
    }
    // A lone underside's end still lets a head slip past beside it.
    const lone = { id: 'u', x1: 100, y1: 500, x2: 300, y2: 500, pcPerm: 1 };
    assert.equal(headCeiling([lone], 99, 620, 101, 600), null);
  });

  it('a roof between the head circle\'s centre and its top keeps the feet down; under the centre it lets the head through', () => {
    const line = (h) => [{ id: 'r', x1: 0, y1: 1000 - h, x2: 200, y2: 1000 - h, pcPerm: 1 }];
    assert.equal(headCeiling(line(100), 100, 1000, 100, 990), 1000, '100 px over the feet: no rise');
    assert.equal(headCeiling(line(90), 100, 1000, 100, 990), null, '90 px: the circle is already over it');
    assert.equal(headCeiling(line(130), 100, 1000, 100, 980), 1000 - 130 + 111);
  });

  it('open ground: a full jump where nothing is overhead', () => {
    assert.ok(floor - peak(3000, avatarHeadReach(1)) > 100);
  });
});

