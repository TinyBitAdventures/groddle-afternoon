// #602: Mart's Way 1 and Dust Path 1C showed a strip of dirt in the air at the top left. It is
// Tiny Speck's own heights_topper_wide_1 (at -1025, -1021: wholly over the street's top, -1000),
// which Glitch never showed (CameraMan kept the view inside the bounds, and Tiny Speck's street
// picture LA51DET7GF42FKO_main has none). An upright phone's camera rises over the top (G928) and
// the loading strips draw a little over it, so the renderer leaves such decos out.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decoWhollyAboveTop } from '../public/js/street-render.js?v=91152d38';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const street = (tsid) => JSON.parse(readFileSync(join(ROOT, `assets/streets/${tsid}.json`), 'utf8'));

describe('decos parked over the street top (#602)', () => {
  for (const [tsid, label] of [['GA5ASS2OEH42TSV', "Mart's Way 1"], ['GA51DET7GF42FKO', 'Dust Path 1C']]) {
    it(`${label}: only the floating strip of dirt is left out`, () => {
      const data = street(tsid);
      assert.equal(data.label, label);
      const mg = data.layers.find((l) => l.id === 'middleground');
      const out = mg.decos.filter((d) => decoWhollyAboveTop(d, data.bounds.t));
      assert.deepEqual(out.map((d) => [d.sprite, d.x, d.y]), [['heights_topper_wide_1', -1025, -1021]]);
    });
  }

  it('a deco reaching into the street, or turned down into it, is kept', () => {
    assert.equal(decoWhollyAboveTop({ x: 0, y: -999, w: 100, h: 80 }, -1000), false);
    assert.equal(decoWhollyAboveTop({ x: 0, y: -1001, w: 100, h: 80 }, -1000), true);
    // Turned 90 degrees about its bottom centre, a 300 x 20 deco reaches 150 px down.
    assert.equal(decoWhollyAboveTop({ x: 0, y: -1050, w: 300, h: 20, r: 90 }, -1000), false);
    assert.equal(decoWhollyAboveTop({ x: 0, y: -1001, w: 0, h: 0 }, -1000), false, 'no size: left alone');
    assert.equal(decoWhollyAboveTop({ x: 0, y: -1100, w: 10, h: 10 }, undefined), false, 'no bounds: left alone');
  });

  it('the renderer skips them for the middleground only', () => {
    const src = readFileSync(join(ROOT, 'js/street-render.js'), 'utf8');
    assert.match(src, /if \(!localLayer && street\.bounds && decoWhollyAboveTop\(deco, street\.bounds\.t\)\) continue;/);
  });
});
