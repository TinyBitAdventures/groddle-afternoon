/**
 * The Classic pack's keyboard (public/js/classic/classic-pack.js; PackDisplayManager.as 247-577):
 * arrows (A, D) along the row with wrap, Up (W) into a bag, Down (S) out, Esc leaves. B stays
 * Badges: one key map for both skins (Austin 2026-10-30).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stepIndex, packKey } from '../public/js/classic/classic-pack.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Classic pack keys', () => {
  it('moves along the row and wraps', () => {
    assert.equal(stepIndex(0, 5, 1), 1);
    assert.equal(stepIndex(4, 5, 1), 0);
    assert.equal(stepIndex(0, 5, -1), 4);
    assert.equal(stepIndex(-1, 5, 1), 0);
    assert.equal(stepIndex(-1, 5, -1), 4);
    assert.equal(stepIndex(0, 0, 1), -1);
  });

  it('the client\'s keys, and not B', () => {
    assert.deepEqual(['ArrowLeft', 'a', 'ArrowRight', 'D', 'ArrowUp', 'w', 'ArrowDown', 's', 'Escape', 'b', 'Enter'].map(packKey), ['prev', 'prev', 'next', 'next', 'in', 'in', 'out', 'out', 'leave', null, null]);
  });

  it('the other slots dim round the focused one; no slide-down (the tray sits over the row)', () => {
    const css = readFileSync(join(root, 'public/css/classic.css'), 'utf8');
    assert.match(css, /\.pack-bar\.is-classic-focus \.pack-slot:not\(:focus\):not\(:focus-within\) \{ opacity: 0\.5; \}/);
    assert.doesNotMatch(css, /pack-bag\.is-open\) \.pack-row \{ transform/);
  });
});
