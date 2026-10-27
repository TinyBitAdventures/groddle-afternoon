/**
 * 3x pack icons (js/icon-hires.js).
 * Run: node --test tests/icon-hires.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HIRES_ICONS, hiresIconUrl } from '../public/js/icon-hires.js?v=g373-1';

const icons = join(dirname(fileURLToPath(import.meta.url)), '../public/assets/sprites/icons');
const pngSize = (file) => {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

describe('3x pack icons', () => {
  it('maps icon URLs to their @3x file only when one exists', () => {
    assert.equal(hiresIconUrl('assets/sprites/icons/apple.png'), 'assets/sprites/icons/apple@3x.png');
    assert.equal(hiresIconUrl('assets/sprites/icons/apple.png?v=2'), 'assets/sprites/icons/apple@3x.png?v=2');
    assert.equal(hiresIconUrl('assets/sprites/icons/furniture_bed.png'), 'assets/sprites/icons/furniture_bed@3x.png');
    assert.equal(hiresIconUrl('assets/sprites/icons/batterfly_bar.png'), null);
    assert.equal(hiresIconUrl('assets/decos/apple.png'), null);
  });

  it('every @3x file is exactly three times its 1x icon', () => {
    assert.ok(HIRES_ICONS.size >= 771);
    for (const id of HIRES_ICONS) {
      const one = join(icons, `${id}.png`);
      const three = join(icons, `${id}@3x.png`);
      assert.ok(existsSync(one) && existsSync(three), id);
      const a = pngSize(one);
      const b = pngSize(three);
      assert.deepEqual(b, { w: a.w * 3, h: a.h * 3 }, id);
    }
  });

  it('every id in the render plan is listed', () => {
    const plan = JSON.parse(readFileSync(join(icons, '../../../../tools/icon-hires/plan.json'), 'utf8'));
    for (const id of Object.keys(plan)) assert.ok(HIRES_ICONS.has(id), id);
  });

  it('lists every @3x file that has a 1x icon (hires.py --list), the 38 lost artifacts too (G174)', () => {
    const onDisk = readdirSync(icons).filter((f) => f.endsWith('@3x.png') && existsSync(join(icons, f.replace('@3x', '')))).map((f) => f.slice(0, -7)).sort();
    assert.deepEqual([...HIRES_ICONS].sort(), onDisk);
    // f09f3a82: the 2012-12 artifacts never archived show the Large Petrified Rock's art.
    for (const id of ['artifact_bee_key', 'artifact_top_hat', 'artifact_twenty_nine_cornered_hat']) assert.ok(HIRES_ICONS.has(id), id);
    assert.equal(hiresIconUrl('assets/sprites/icons/artifact_bee_key.png'), 'assets/sprites/icons/artifact_bee_key@3x.png');
  });
});
