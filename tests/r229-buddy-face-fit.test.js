/**
 * Report #229 (live, Friendly): the buddies' faces in the Social drawer's round avatars were cropped
 * by the circle. The picture is the site's player tile (/players/<id>/tile, 200x288 at 2x, the head
 * at the top); it was drawn at 150% of the 32 px circle, so the head came out 33 px wide and its chin
 * ran past the bottom. At 120% the whole head sits inside, its middle on the circle's.
 * Run: node --test tests/r229-buddy-face-fit.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const css = readFileSync(join(import.meta.dirname, '..', 'public', 'style.css'), 'utf8');

function decls(selector) {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, selector);
  return css.slice(at, css.indexOf('}', at));
}

/**
 * The head's outline in a player tile (a default-look tile from the local site, 2026-11-12): for tile
 * rows 36 to 150 (of 288), the leftmost and rightmost opaque columns (of 200), hat and hair included.
 */
const HEAD = [[36, 94, 130], [42, 60, 144], [48, 52, 150], [60, 45, 154], [66, 41, 162], [78, 35, 163],
  [84, 34, 165], [96, 32, 153], [114, 32, 155], [126, 36, 150], [138, 52, 124], [150, 65, 104]];
const TILE_W = 200;

describe('report 229: a buddy face fits its circle', () => {
  const circle = Number(decls('.social-buddies .social-av').match(/width: (\d+)px/)[1]);
  const img = decls('.social-face img');
  const widthPct = Number(img.match(/width: (\d+)%/)[1]);
  const topPct = Number(img.match(/top: (-?\d+)%/)[1]);

  it('draws the tile at 120% of the circle, centred, 6% up', () => {
    assert.equal(circle, 32);
    assert.equal(widthPct, 120);
    assert.equal(topPct, -6);
    assert.match(img, /left: 50%;/);
    assert.match(img, /transform: translateX\(-50%\);/);
    assert.match(decls('.social-face'), /overflow: hidden; border-radius: var\(--radius-round\)/);
  });

  it('every row of the head lies inside the circle', () => {
    const scale = (circle * widthPct) / 100 / TILE_W;
    const left = circle / 2 - (TILE_W * scale) / 2;
    const top = (circle * topPct) / 100;
    const r = circle / 2;
    for (const [row, x1, x2] of HEAD) {
      const y = top + row * scale;
      const dy = y - r;
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      for (const x of [x1, x2]) {
        const dx = Math.abs(left + x * scale - r);
        assert.ok(dx <= half + 0.01, `tile row ${row}, column ${x}: ${dx.toFixed(1)} px from the middle, room ${half.toFixed(1)}`);
      }
    }
  });

  it('the head is still most of the circle (not a dot)', () => {
    const scale = (circle * widthPct) / 100 / TILE_W;
    const wide = (165 - 32) * scale;
    assert.ok(wide >= circle * 0.75, `head ${wide.toFixed(1)} px of ${circle}`);
  });
});
