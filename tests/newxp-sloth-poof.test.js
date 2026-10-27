// G303: the sloth's puff in training1 (newxp_training1.js 693-707 slothRemove: deleteWithPoof(-50, 250))
// lands on the sloth, as it did over npc_sloth.swf's drawn rect, not about 250 px under the remake's art.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLOTH_POOF_ART, slothPoofBase } from '../public/js/features/newxp-feature.js?v=g366-1';
import { itemstackOverlayPoint, standPlacement } from '../public/js/overlay-art.js';
import { training1Layout } from '../public/js/newxp.js';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../public');
const manifest = JSON.parse(readFileSync(join(PUBLIC, 'assets/sprites/overlays/overlays.json'), 'utf8'));
const puff = manifest.proto_puff;

/** proto_puff's drawn box for deleteWithPoof(dx, dy) from base { x, top } (bottom centre on the point). */
function puffBox(base, dx, dy) {
  const at = itemstackOverlayPoint(base.x, base.top, { dx, dy });
  const p = standPlacement(puff, at.x, at.y);
  return { left: p.left, right: p.left + p.width, top: p.top, bottom: p.top + p.height };
}

describe('the sloth puff (G303)', () => {
  it('in the source: the flipped sloth (11-117 px left of x, 10-134 up) sits inside the puff', () => {
    // The SWF's drawn top is 221 px above the stack's y; delta_x is not flipped (item.js 490-508).
    const box = puffBox({ x: 0, top: -221 }, -50, 250);
    assert.ok(box.top <= -134 && box.bottom >= -10, `puff y ${box.top}..${box.bottom}`);
    assert.ok(box.left <= -117 && box.right >= -11, `puff x ${box.left}..${box.right}`);
    assert.equal(SLOTH_POOF_ART.topAboveFeet, 221 - 10);
    assert.equal(SLOTH_POOF_ART.regFromMiddle, (11 + 117) / 2);
  });

  it('in the remake: the same puff covers sloth.png, either way it faces', () => {
    const { x, y } = training1Layout().sloth;
    // sloth.png 124 x 98 at anchor (0.35, 0.1) (newxp-feature.js training1).
    const art = { left: x - 0.35 * 124, right: x + 0.65 * 124, top: y - 0.1 * 98, bottom: y + 0.9 * 98 };
    for (const facing of [1, -1]) {
      const base = slothPoofBase(art, facing);
      const box = puffBox(base, base.dx, 250);
      assert.ok(box.top <= art.top && box.bottom >= art.bottom, `facing ${facing}: puff y ${box.top}..${box.bottom}`);
      assert.ok(box.left <= art.left && box.right >= art.right, `facing ${facing}: puff x ${box.left}..${box.right}`);
      // 14 px behind the sloth's middle, as in the source (-50 against a middle 64 px from x).
      const middle = (art.left + art.right) / 2;
      assert.equal(base.x + base.dx, middle - facing * 14);
      assert.equal(base.top + 250 - art.bottom, 250 - SLOTH_POOF_ART.topAboveFeet);
    }
    // The old anchor: the display top of the cut art plus 250 left the puff's point 250 px under its top.
    const old = itemstackOverlayPoint(x, art.top, { dx: -50, dy: 250 });
    assert.ok(old.y - art.bottom > 140);
  });
});
