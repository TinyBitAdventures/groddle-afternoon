/**
 * Side sheets on a short screen (the mobile QA, 2026-11-12: a phone held sideways, 343 px tall): a
 * sheet that stopped above the pack row was 213 px tall and showed one quest, half a vendor tile, and
 * the vendor's count row under its tabs. Up to 500 px tall the sheet runs to the floor and the pack
 * row steps right of it (js/ui/pack-row.js packRowClearance).
 * Run: node --test tests/sheets-short-screen.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packRowClearance } from '../public/js/ui/pack-row.js?v=65c0f180';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

describe('side sheets on a short screen', () => {
  it('run to the floor, after the rule that stops them above the pack', () => {
    const base = css.indexOf('  max-height: calc(100% - var(--hud-h) - 6px - var(--pack-live-height, 72px) - 8px);');
    const at = css.indexOf('/* A short screen (the mobile QA, 2026-11-12: a phone held sideways, 343 px)');
    assert.ok(base > 0 && at > base);
    const block = css.slice(at, css.indexOf('}\n}', at) + 3);
    assert.match(block, /@media \(max-height: 500px\) \{[\s\S]*#game-root \.ui-sheet:not\(\.ui-sheet-center\),[\s\S]*#skills-panel,[\s\S]*\{ max-height: calc\(100% - var\(--hud-h\) - 6px - 8px\); \}/);
  });
  it('the pack row steps aside for a sheet that reaches below its top', () => {
    assert.deepEqual(packRowClearance({ rowTop: 279, left: { inset: 336, bottom: 335 } }), { left: 336, right: 0 });
    assert.deepEqual(packRowClearance({ rowTop: 279, left: { inset: 336, bottom: 263 } }), { left: 0, right: 0 });
  });
});
