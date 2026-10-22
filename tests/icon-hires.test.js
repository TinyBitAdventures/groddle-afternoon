/**
 * 3x pack icons (js/icon-hires.js).
 * Run: node --test tests/icon-hires.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HIRES_ICONS, hiresIconUrl } from '../public/js/icon-hires.js';

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
});
