/**
 * #532: a Gas Plant Bean on a Groddle Meadow patch (Ritzrock Rise) was refused with "That bean will
 * not grow here." though a Gas Plant stood on the street. Gas Plant Beans grow only in certain hubs
 * (patch.js can_plant_mappings), so the refusal is right; it now says why, for the bean's kind, in
 * Glitch's words: patch.js 259 and the bean's own line (items/bean_*.js 178).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEASONED_BEANS, plantChoices, wrongBeanLine } from '../public/js/patches.js?v=3068579c';

const root = join(import.meta.dirname, '..');
const gsjs = (f) => readFileSync(join(root, '..', 'glitch-GameServerJS', 'items', f), 'utf8');
const MEADOW = 58;

describe('#532 a bean that will not grow here says why', () => {
  it('a Gas Plant Bean in Groddle Meadow', () => {
    const [row] = plantChoices({ bean_gas: 1 }, 'patch', MEADOW);
    assert.equal(row.ok, false);
    assert.equal(row.reason, 'That bean will not grow here. Gas Plant Beans can only be planted in certain regions. Like attracts like.');
  });

  it("each kind's line is its bean file's, the head is patch.js's", () => {
    assert.ok(gsjs('patch.js').includes("'reason': \"That bean will not grow here.\""));
    for (const cls of Object.keys(SEASONED_BEANS)) {
      const raw = /out\.push\(\[2, "((?:[^"\\]|\\.)*)"\]\);/.exec(gsjs(`${cls}.js`))[1];
      const tip = raw.replace(/\\(.)/g, '$1').replace(/<[^>]+>/g, '');
      const line = wrongBeanLine(cls, 'patch');
      if (cls === 'bean_egg') assert.equal(line, `That bean will not grow here. ${tip}`);
      else assert.equal(line, `That bean will not grow here. ${tip.replace(/^Beans/, `${SEASONED_BEANS[cls].label}s`)}`, cls);
    }
  });

  it('a Dark Patch takes only Egg Plant Beans', () => {
    assert.equal(wrongBeanLine('bean_gas', 'patch_dark'), 'That bean will not grow here. Only Egg Plant Beans grow in a Dark Patch.');
  });

  it("the Plant row's reason is the choice's, with nothing added", () => {
    const src = readFileSync(join(root, 'public/js/patches.js'), 'utf8');
    assert.match(src, /if \(!choice\.ok\) Object\.assign\(row, \{ enabled: false, reason: choice\.reason \}\);/);
  });
});
