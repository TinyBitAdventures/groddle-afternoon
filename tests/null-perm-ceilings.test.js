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
import { headCeiling, isSolidFromBelow, isStandable, platformsScreen } from '../public/js/street-model.js?v=g442-6';

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
