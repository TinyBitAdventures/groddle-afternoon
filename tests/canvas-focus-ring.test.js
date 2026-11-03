import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');

test('the focusable world canvas draws no focus ring around the whole screen', () => {
  assert.match(game, /app\.canvas\.setAttribute\('role', 'application'\)/);
  assert.match(game, /app\.canvas\.tabIndex = 0/);
  assert.match(css, /#game-root > canvas\[role="application"\]:focus,\s*#game-root > canvas\[role="application"\]:focus-visible \{ outline: none; \}/);
});
