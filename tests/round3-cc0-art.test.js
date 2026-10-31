/**
 * Round 3 level review (research/coverage/round3-levels-2026-10-29/review.md): rooms that drew
 * their own stand-ins now use Tiny Speck's CC0 art, and the mechanics around it are unchanged.
 * - Radiant Glare: the `rainbow` deco (quest02.swf, byte-identical to groddle1.swf's) replaces
 *   the drawn bands, fitted to the arch you walk on.
 * - Le Voyage Violet: the washing is hanging_clothes_1..6 on hanging_clothes_line and the moon is
 *   `moon` (abbasid1.swf / quest02.swf decos), in place of drawn garments and a drawn crescent.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FLOORS, RAINBOW_ART, radiantLayout, rainbowY } from '../public/js/quest-rooms/radiant-glare.js?v=b878eda8';
import { MOON, WASHING, WASHING_LINE } from '../public/js/purple-journey-scene.js?v=425b0b98';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const decoPlan = () => new Map(read('tools/deco-pipeline/plan.json').split('\n')
  .filter((l) => l.startsWith('{"name"'))
  .map((l) => JSON.parse(l.replace(/,$/, '')))
  .map((r) => [r.name, r]));

describe('Radiant Glare: the CC0 rainbow', () => {
  it('draws the shipped rainbow deco, not vector bands', () => {
    const src = read('public/js/quest-rooms/radiant-glare.js');
    assert.equal(RAINBOW_ART.name, 'rainbow');
    assert.match(src, /kit\.deco\(PIXI, a\.name, a\.x, FLOORS\.glare - a\.up/);
    assert.doesNotMatch(src, /const bands = \[/);
    assert.doesNotMatch(src, /rainbowY\(x\) \+ 6 \+ i \* 9/);
    assert.ok(existsSync(join(root, 'public/assets/decos/groddle/rainbow.webp')));
    const row = decoPlan().get('rainbow');
    assert.equal(row.mode, 'swf');
    assert.equal(row.swf, 'bundle:groddle1.swf#rainbow');
  });

  it('keeps the arch you walk on under the art and the EXIT under the arch', () => {
    const plan = decoPlan().get('rainbow');
    const [fw, fh] = plan.size2;
    const left = RAINBOW_ART.x;
    const right = left + fw * RAINBOW_ART.scale;
    const top = FLOORS.glare - RAINBOW_ART.up;
    // The walking line runs from x 200 to 900, inside the art's width and below its top edge.
    assert.ok(left < 200 && right > 900, `${left}..${right}`);
    for (let x = 200; x <= 900; x += 50) assert.ok(rainbowY(x) >= top, `x ${x}`);
    // Its crown is the top of the bands: within the art's top 30 px.
    assert.ok(rainbowY(550) - top < 30);
    assert.ok(top + fh * RAINBOW_ART.scale > FLOORS.glare - 80);
    const { door } = radiantLayout();
    assert.ok(door.x > left && door.x < right);
  });
});

describe('Le Voyage Violet: the CC0 washing and moon', () => {
  it('hangs the six recovered garments on the recovered line', () => {
    const plan = decoPlan();
    assert.deepEqual(WASHING, [1, 2, 3, 4, 5, 6].map((n) => `hanging_clothes_${n}`));
    for (const name of WASHING) {
      assert.ok(existsSync(join(root, `public/assets/decos/groddle/${name}.webp`)), name);
      assert.equal(plan.get(name).swf, `bundle:abbasid1.swf#${name}`);
    }
    assert.equal(WASHING_LINE, 'hanging_clothes_line');
    assert.equal(plan.get(WASHING_LINE).swf, 'bundle:abbasid1.swf#hanging_clothes_line');
    assert.equal(MOON, 'moon');
    assert.equal(plan.get(MOON).swf, 'bundle:zutto1.swf#moon');
    for (const name of [WASHING_LINE, MOON]) assert.ok(existsSync(join(root, `public/assets/decos/groddle/${name}.webp`)), name);
  });

  it('no longer draws garments or the crescent', () => {
    const src = read('public/js/purple-journey-scene.js');
    for (const gone of ['function garment(', 'function crescent(', "kind === 'shirt'", 'quadraticCurveTo((x1 + x2) / 2']) {
      assert.ok(!src.includes(gone), gone);
    }
    assert.match(src, /deco\(PIXI, WASHING_LINE,/);
    assert.match(src, /deco\(PIXI, name,/);
    assert.match(src, /deco\(PIXI, MOON,/);
  });
});
