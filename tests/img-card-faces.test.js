/**
 * The Upgrades hand's cards on iOS (the mobile QA, 2026-11-12): WebKit flattened the flip, so every
 * card showed its back over its front, mirrored ("emiT nolfeT s'tI"). Each face also hides while it is
 * turned away, switching at the half turn, so no engine depends on backface-visibility alone.
 * Run: node --test tests/img-card-faces.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'public/js/features/imagination-feature.js'), 'utf8');

describe('the upgrade cards\' faces', () => {
  it('the face turned away is hidden, switching at the half turn', () => {
    assert.match(src, /\.img-card:not\(\.flipped\) \.img-back,\.img-card\.flipped \.img-front\{visibility:hidden\}/);
    const flip = Number(src.match(/\.img-card\{[^}]*transition:transform \.(\d+)s/)[1]) / 10;
    const at = Number(src.match(/\.img-face\{transition:visibility 0s linear \.(\d+)s\}/)[1]) / 100;
    assert.equal(at, flip / 2);
  });
});
