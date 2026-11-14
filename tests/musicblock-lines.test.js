/**
 * #311 (The Catface): picking up a Musicblock shows three lines over it (the activity line, the
 * "acquired" line and "Tunes n/5"); the top two faded after 55 frames (about 0.25 s at full
 * strength, gone in under a second) while the first lasted 110. Glitch's pickup had none of these
 * (musicblock_*.js only sendActivity and the tune), so they match the remake's own first line.
 * Run: node --test tests/musicblock-lines.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

describe('#311 a verb result\'s lines last alike', () => {
  it('the first line lives 110 frames', () => {
    assert.match(game, /toastLine, 0xfff4d6, \{ life: 110 \}\);/);
  });
  it("the result's later lines live as long", () => {
    assert.match(game, /resultFloatY\(target, spoke \|\| Boolean\(reactionText\)\) - i \* 16, m, 0xfff4d6, \{ life: 110 \}\);/);
  });
  it('the Musicblock "Tunes n/m" line lives as long', () => {
    const at = game.indexOf('`Tunes ${picked.collection.owned}/${picked.collection.total}`');
    assert.ok(at > 0);
    assert.match(game.slice(at, at + 300), /0xc6a2ff,[\s\S]*?\{ life: 110 \}\s*\);/);
  });
});
