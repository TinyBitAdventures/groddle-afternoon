/**
 * TOUCH: no hover tooltips on a screen with no hover (the mobile QA, 2026-11-12: after tapping the pack's
 * search, "Search pack · Shift F" stayed on screen through later taps).
 * Run: node --test tests/touch-no-tooltips.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('tooltips on a touch screen', () => {
  it('the top bar\'s tooltips skip touch and hover-less screens', () => {
    const src = read('public/js/ui/topbar.js');
    assert.match(src, /const noHover = \(\) => Boolean\(globalThis\.matchMedia\?\.\('\(hover: none\)'\)\.matches\);/);
    assert.match(src, /scope\.addEventListener\('pointerover', \(e\) => \{\s*if \(e\.pointerType === 'touch' \|\| noHover\(\)\) return;/);
    assert.match(src, /scope\.addEventListener\('focusin', \(e\) => \{\s*if \(noHover\(\)\) return;/);
  });
  it('so do the pack row\'s', () => {
    const src = read('public/js/ui/pack-row.js');
    assert.match(src, /band\.addEventListener\('pointerover', \(e\) => \{ if \(e\.pointerType === 'touch' \|\| noHover\(\)\) return;/);
    assert.match(src, /band\.addEventListener\('focusin', \(e\) => \{ if \(noHover\(\)\) return;/);
  });
});
