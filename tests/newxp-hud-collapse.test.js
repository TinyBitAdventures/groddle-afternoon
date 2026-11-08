/**
 * Tutorial HUD (Austin 2026-11-08): in Modern, parts the tutorial has not shown yet take no room, so the
 * pills shrink to what is shown and an empty one goes away; Classic keeps its frame (visibility rules).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'public/js/features/newxp-feature.js'), 'utf8');

test('Modern collapses the hidden parts and drops an empty stats pill', () => {
  assert.match(src, /:root\[data-ui="modern"\] body\.nx-hide-meta \.metabolics-cluster,:root\[data-ui="modern"\] body\.nx-hide-energy \.meta-pill\.energy,:root\[data-ui="modern"\] body\.nx-hide-mood \.meta-pill\.mood\{display:none\}/);
  assert.match(src, /:root\[data-ui="modern"\] body\.nx-hide-meta\.nx-hide-energy\.nx-hide-mood #hud-stats\{display:none\}/);
  assert.match(src, /:root\[data-ui="modern"\] body\.nx-hide-actions \.top-actions>:not\(#mute-btn\):not\(#sound-btn\)[^{]*\{display:none\}/);
});

test('the lone right pill stays on the right, and Classic keeps its visibility rules', () => {
  assert.match(src, /#hud-stats\{display:none\}\n:root\[data-ui="modern"\] body\.nx-hide-meta\.nx-hide-energy\.nx-hide-mood \.top-bar \.top-actions\{margin-left:auto\}/);
  assert.match(src, /body\.nx-hide-actions \.top-actions>:not\(#mute-btn\):not\(#sound-btn\),body\.nx-hide-actions \.quest-tracker\{visibility:hidden\}/);
});
