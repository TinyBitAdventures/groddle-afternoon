/**
 * The races' finish gate is Tiny Speck's own (groddle1.swf groddle_finishline_bar_back, _middle,
 * _close): the far post and the bar behind the racers, the near post in front of them.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FINISH_GATE } from '../public/js/race-render.js?v=5f946939';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = (p) => join(root, 'public', p);
const read = (p) => readFileSync(pub(p), 'utf8');

describe('race finish gate', () => {
  it('ships the three recovered pieces at 2x and 3x', () => {
    const manifest = JSON.parse(read('assets/decos/manifest.json'));
    for (const part of ['back', 'bar', 'close']) {
      const { name } = FINISH_GATE[part];
      assert.ok(manifest.includes(name), name);
      assert.ok(existsSync(pub(`assets/decos/groddle/${name}.webp`)), name);
      assert.ok(existsSync(pub(`assets/decos/groddle/${name}@1.5x.webp`)), `${name} 3x`);
    }
  });

  it('stands the near post nearer (lower) and to the right, the bar between their tops', () => {
    const { back, close, bar } = FINISH_GATE;
    assert.ok(close.dx - back.dx >= 55 && close.dx - back.dx <= 65);
    assert.ok(close.dy > 0 && back.dy < 0, 'the racers run between the posts');
    // The far post is 149 stage px tall: the bar's left end rides just under its top.
    assert.ok(Math.abs(back.dy - 149 - bar.dy) <= 3);
  });

  it('draws the near post over the avatar and no drawn posts are left', () => {
    const feature = read('js/features/races-feature.js');
    assert.match(feature, /finishFront\.zIndex = 60;/);
    assert.match(feature, /finishSprite\.zIndex = 9;/);
    assert.doesNotMatch(read('js/race-render.js'), /drawFinishPosts/);
    assert.doesNotMatch(feature, /drawFinishPosts/);
  });
});
