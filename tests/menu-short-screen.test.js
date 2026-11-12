/**
 * The Menu on a short screen (the mobile QA, 2026-11-12): its Settings (Zoom, night tint, the street
 * map) ran past the bottom and under the pack row, and it did not scroll. It stops above the pack
 * row and scrolls; on a phone its rows are 44 px.
 * Run: node --test tests/menu-short-screen.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

describe('the Menu on a short screen', () => {
  it('stops above the pack row and scrolls', () => {
    assert.match(css, /@media \(max-height: 760px\) \{\s*\[data-ui="modern"\] \.top-bar \.more-list \{\s*max-height: calc\(100dvh - var\(--hud-h\) - 16px - 80px\);\s*overflow-y: auto; overscroll-behavior: contain;/);
  });
  it('a phone\'s rows are thumb targets', () => {
    assert.match(css, /:root\.touch-phone\[data-ui="modern"\] \.top-bar \.more-list \.chrome-btn \{ min-height: 44px; \}/);
  });
});
