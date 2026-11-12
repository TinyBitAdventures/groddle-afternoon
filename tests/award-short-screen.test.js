/**
 * The award screen on a phone (the mobile QA and Austin's iPhone, 2026-11-12): upright, the card sat
 * right and ran off a 402 px screen; sideways (about 320 px tall) its button sat under the bottom edge
 * and nothing scrolled. The card now takes one column the screen's width and always fits the screen,
 * only its body text scrolling.
 * Run: node --test tests/award-short-screen.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

describe('the award screen on a phone', () => {
  it('one column the screen\'s width, the card no wider than it', () => {
    const at = css.indexOf('[data-ui="modern"] .award-screen[data-paged="true"] {\n  place-items: center;');
    assert.ok(at > 0);
    const rule = css.slice(at, css.indexOf('}', at));
    assert.match(rule, /grid-template-columns: minmax\(0, 1fr\);/);
    const card = css.slice(css.indexOf('[data-ui="modern"] .award-screen[data-paged="true"] .award-card {\n  position: relative;'));
    assert.match(card.slice(0, card.indexOf('}')), /width: var\(--moment-w\);\n  max-width: 100%;/);
  });
  it('the card fits the screen and only its body scrolls', () => {
    const at = css.indexOf('/* The card always fits the screen (Austin\'s iPhone, 2026-11-12)');
    assert.ok(at > css.indexOf('[data-ui="modern"] .award-screen[data-paged="true"] .award-next {'), 'after the button rules, so it wins');
    const block = css.slice(at, css.indexOf('/* —— HUB: Imagination hub —— */', at));
    assert.match(block, /display: flex; flex-direction: column;\n  max-height: calc\(100% - var\(--moment-burst\) \* 0\.5\);/);
    assert.match(block, /\.award-card > \* \{ flex-shrink: 0; \}/);
    assert.match(block, /flex: 0 1 auto; min-height: 0; overflow-y: auto;/);
  });
  it('a short screen: smaller art, tighter spacing, no room kept for the HUD', () => {
    const at = css.indexOf('/* A short screen (the mobile QA, 2026-11-12: a phone held sideways, 343 px; Austin\'s iPhone');
    assert.ok(at > 0);
    const block = css.slice(at, css.indexOf('}\n}', at) + 3);
    assert.match(block, /@media \(max-height: 500px\) \{/);
    assert.match(block, /--moment-burst: 72px; --moment-art: 60px; --moment-art-book: 54px;/);
    assert.match(block, /padding: var\(--space-2\) var\(--space-4\);/);
    assert.doesNotMatch(block, /overflow-y: auto; overscroll-behavior: contain;\n    padding-top/);
  });
});
