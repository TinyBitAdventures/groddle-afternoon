/**
 * The start card on a short screen (the mobile QA, 2026-11-12: an iPhone SE sideways, 568 x 320): Skip
 * to Ur and Customize look first sat under the pack row, where a tap hit the pack.
 * Run: node --test tests/start-card-short-screen.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

describe('the start card on a short screen', () => {
  it('takes the height under the top bar, with the pack and street name waiting', () => {
    const at = css.indexOf('/* A short screen (the mobile QA, 2026-11-12: an iPhone SE sideways');
    assert.ok(at > 0);
    const block = css.slice(at, css.indexOf('}\n}', at) + 3);
    assert.match(block, /@media \(max-height: 500px\) \{/);
    assert.match(block, /\[data-ui="modern"\] #overlay \{ padding-top: calc\(var\(--hud-h\) \+ var\(--sp-4\)\); padding-bottom: var\(--sp-4\); \}/);
    assert.match(block, /#game-root:has\(> #overlay:not\(\.hidden\)\) :is\(\.pack-bar, \.street-nameplate\) \{ visibility: hidden; \}/);
    // After the narrow-frame rule it overrides.
    assert.ok(at > css.indexOf('[data-ui="modern"] #overlay { padding: calc(var(--hud-h) * 2 + var(--sp-6)) var(--sp-4) 72px; }'));
  });
});
