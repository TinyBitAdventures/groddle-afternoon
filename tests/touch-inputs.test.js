/**
 * TOUCH: typing fields on a phone are 16 px, so iOS does not zoom the page into them (the mobile QA,
 * 2026-11-12: chat and pack search were 13 px and the zoom stayed).
 * Run: node --test tests/touch-inputs.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

describe('typing fields on a phone', () => {
  it('are 16 px (--fs-lg is 1rem)', () => {
    assert.match(css, /--fs-lg: 1rem;/);
    assert.match(css, /:root\.touch-phone :is\(input:not\(\[type="range"\], \[type="checkbox"\], \[type="radio"\], \[type="button"\], \[type="submit"\]\), textarea, select\) \{ font-size: var\(--fs-lg\) !important; \}/);
  });
});
