import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  packPagerState,
  packPageStep,
  packPageTarget,
} from '../public/js/pack-pager.js';

const here = dirname(fileURLToPath(import.meta.url));

test('pack pager detects both ends with a small tolerance', () => {
  assert.deepEqual(packPagerState({
    scrollLeft: 0,
    clientWidth: 1043,
    scrollWidth: 1450,
  }), {
    overflow: true,
    max: 407,
    left: 0,
    canBack: false,
    canForward: true,
  });
  assert.equal(packPagerState({
    scrollLeft: 406,
    clientWidth: 1043,
    scrollWidth: 1450,
  }).canForward, false);
  assert.equal(packPagerState({
    scrollLeft: 0,
    clientWidth: 1043,
    scrollWidth: 1043,
  }).overflow, false);
});

test('pack pager advances by whole slots and clamps the final page', () => {
  assert.equal(packPageStep(100, 48), 96);
  assert.equal(packPageTarget({
    scrollLeft: 0,
    clientWidth: 100,
    scrollWidth: 310,
  }, 1, 48), 96);
  assert.equal(packPageTarget({
    scrollLeft: 192,
    clientWidth: 100,
    scrollWidth: 310,
  }, 1, 48), 210);
  assert.equal(packPageTarget({
    scrollLeft: 18,
    clientWidth: 100,
    scrollWidth: 310,
  }, -1, 48), 0);
});

test('pack chrome ships discoverable controls and non-clipping scroll behavior', () => {
  const html = readFileSync(join(here, '../public/index.html'), 'utf8');
  const css = readFileSync(join(here, '../public/style.css'), 'utf8');
  const game = readFileSync(join(here, '../public/game.js'), 'utf8');
  assert.match(html, /data-pack-pager="items"[\s\S]*?aria-label="Previous items"/);
  assert.match(html, /data-pack-pager="tools"[\s\S]*?aria-label="More tools"/);
  assert.match(css, /\.pack-row-shell\.has-overflow[\s\S]*?22px/);
  assert.match(css, /\.pack-slots\s*\{[\s\S]*?overflow-x:\s*auto/);
  assert.match(game, /function setupPackPager/);
  assert.match(game, /data-pack-scroll/);
  assert.match(game, /event\.preventDefault\(\)/);
  assert.match(game, /\`\$\{prefix\}ScrollMax\`/);
});
