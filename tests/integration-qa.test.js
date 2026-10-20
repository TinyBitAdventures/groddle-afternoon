// Regressions found by the integration playtest (tools/playtest.mjs): places
// where two features meet inside game.js, checked against the source text.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

function fnBody(name) {
  const start = game.search(new RegExp(`\\n(async )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} exists`);
  const next = game.slice(start + 1).search(/\n(async )?function /);
  return game.slice(start, next < 0 ? undefined : start + 1 + next);
}

test.describe('integration playtest regressions', () => {
  test('F eats an apple through the pack path (Naraka gate, fullness, food memory, quests)', () => {
    const body = fnBody('eatApple');
    assert.match(body, /usePackItem\('apple'\)/);
    assert.doesNotMatch(body, /useItem\(inv/);
  });

  test('toasts expire on the wall clock, not counted frames', () => {
    assert.match(fnBody('toast'), /state\.toastTimer = performance\.now\(\) \+ ms/);
    assert.match(game, /state\.toastTimer > 0 && performance\.now\(\) >= state\.toastTimer/);
    assert.doesNotMatch(game, /state\.toastTimer -= /);
  });

  test('chrome buttons wrap instead of running off wide screens', () => {
    const wide = /@media \(min-width: 1101px\) \{([\s\S]*?)\n\}/.exec(css)[1];
    assert.match(wide, /\.top-actions \{[^}]*flex-wrap: wrap/);
    assert.doesNotMatch(wide, /\.top-actions \{ flex-wrap: nowrap; \}/);
  });

  test('phone-sized modals keep their header and close button inside the game root', () => {
    assert.match(css, /\.glitch-modal-card \{[^}]*max-height: min\(78vh, 640px, calc\(100% - 12px\)\)/);
    assert.match(css, /\.home-card,\n\.mail-card \{[^}]*width: min\(920px, 100%\)/);
  });
});
