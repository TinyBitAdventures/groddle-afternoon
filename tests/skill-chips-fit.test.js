/**
 * The Skills panel's filter chips (All, Ready, Learning, Learned, Locked, each with a count)
 * were `flex: 1; min-width: 0` with nowrap text in a ~330 px panel: they shrank under their
 * labels and "Learned 24" spilled past its border (3 px at 1280, 11 px at 1024). They now wrap,
 * three then two, and never shrink under their text.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(import.meta.dirname, '../public/style.css'), 'utf8');
const rule = (sel) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`))?.[1] || '';

describe('skill filter chips fit their labels', () => {
  it('the row wraps', () => {
    assert.match(rule('.skill-tree-filters'), /flex-wrap:\s*wrap/);
  });
  it('a chip is never narrower than its label and count', () => {
    const chip = rule('.skill-tree-chip');
    assert.match(chip, /min-width:\s*max-content/);
    assert.doesNotMatch(chip, /min-width:\s*0\b/);
    assert.match(chip, /flex:\s*1 0 28%/, 'three to a row');
  });
});
