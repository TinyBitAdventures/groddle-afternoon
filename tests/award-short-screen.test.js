/**
 * The award screen on a short screen (the mobile QA, 2026-11-12: a phone held sideways, 343 px): the
 * card's button sat under the bottom edge and nothing scrolled.
 * Run: node --test tests/award-short-screen.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

describe('the award screen on a short screen', () => {
  it('half-size art, scrolling from the top', () => {
    const at = css.indexOf('/* A short screen (the mobile QA, 2026-11-12: a phone held sideways, 343 px): the card\'s button');
    assert.ok(at > css.indexOf('[data-ui="modern"] .award-screen[data-paged="true"] {'));
    const block = css.slice(at, css.indexOf('}\n}', at) + 3);
    assert.match(block, /@media \(max-height: 500px\) \{/);
    assert.match(block, /--moment-burst: 96px; --moment-art: 80px; --moment-art-book: 72px;/);
    assert.match(block, /place-items: start center; overflow-y: auto; overscroll-behavior: contain;/);
  });
});
