/**
 * Austin 2026-11-12: a player still in the tutorial (the clouds, the training rooms, Gentle Island)
 * sees no street project status. newxp-feature marks <body class="nx-tutorial"> while the tutorial
 * is active, and the featured line in the street name bubble and its Feat panel row hide under it.
 * Run: node --test tests/featured-hidden-in-tutorial.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const pub = join(import.meta.dirname, '..', 'public');
const newxp = readFileSync(join(pub, 'js/features/newxp-feature.js'), 'utf8');
const featured = readFileSync(join(pub, 'js/ui/featured-project.js'), 'utf8');

describe('no project status in the tutorial', () => {
  it('marks the page while the tutorial is active, wherever it publishes its status', () => {
    const marks = newxp.match(/document\.body\?\.classList\.toggle\('nx-tutorial', active\(\)\)/g) || [];
    assert.equal(marks.length, 2, 'both places that publish newxpStatus');
  });

  it('hides the featured line and row under that mark', () => {
    assert.match(featured, /body\.nx-tutorial \.featured-line, body\.nx-tutorial \.featured-row \{ display: none; \}/);
  });
});
