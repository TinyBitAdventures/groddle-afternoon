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

test('the one-row pack pages only when it overflows, and never clips a slot', () => {
  const html = readFileSync(join(here, '../public/play/index.html'), 'utf8');
  const css = readFileSync(join(here, '../public/style.css'), 'utf8');
  const view = readFileSync(join(here, '../public/js/ui/pack-row.js'), 'utf8');
  // One pager after the stacks (the mock): hidden until the row overflows, a page on and back to the start.
  assert.match(html, /id="pack-items"[\s\S]*?<button type="button" class="pack-pager" id="pack-pager" data-pack-scroll="1" aria-label="More items"[^>]*hidden>/);
  assert.match(css, /\.pack-slots\.pack-items \{[^}]*overflow-x: auto;/);
  assert.match(css, /\.pack-pager\[hidden\]/);
  assert.match(view, /if \(pager\) pager\.hidden = !state\.overflow;/);
  assert.match(view, /const target = state\.canForward \? packPageTarget\(box, 1, slotStep\(box\)\) : 0;/);
  // A vertical wheel scrolls the row sideways while it overflows.
  assert.match(view, /event\.preventDefault\(\);\s+box\.scrollBy\(\{ left: event\.deltaY/);
  assert.match(view, /setData\(`packItem\$\{key\}`, value\)/);
});
