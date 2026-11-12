/**
 * TOUCH: the rest of the tutorial's keyboard words on a phone (the mobile QA, 2026-11-12): "Click
 * anywhere..." on every VOG and the Hall's captions, and the start card's Keys list.
 * Run: node --test tests/touch-words.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { touchWords } from '../public/js/touch-controls.js?v=c7c82611';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('touch words', () => {
  it('a phone taps where a computer clicks; a computer keeps the original', () => {
    assert.equal(touchWords('Click anywhere...', true), 'Tap anywhere...');
    assert.equal(touchWords('Click anywhere…', true), 'Tap anywhere…');
    assert.equal(touchWords('then click anywhere', true), 'then tap anywhere');
    assert.equal(touchWords('Click anywhere...', false), 'Click anywhere...');
    assert.equal(touchWords('Click anywhere...'), 'Click anywhere...');
  });
  it('the VOG overlays, the tutorial\'s VOG and the Hall use it', () => {
    assert.match(read('public/js/vog-overlay.js'), /advanceLabel\.textContent = touchWords\(VOG_ADVANCE_LABEL\);/);
    assert.match(read('public/js/features/newxp-feature.js'), /<small>\$\{touchWords\('Click anywhere…'\)\}<\/small>/);
    assert.match(read('public/js/features/mid-tower-feature.js'), /\$\{touchWords\(CLICK_ANYWHERE\)\}/);
  });
  it('a phone\'s start card has no Keys list, from the first paint', () => {
    assert.match(read('public/style.css'), /:root\.touch-phone \.start-keys \{ display: none; \}/);
    assert.match(read('public/game.js'), /if \(TOUCH_PHONE\) document\.documentElement\.classList\.add\('touch-phone'\);/);
  });
});
