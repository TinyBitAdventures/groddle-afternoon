/**
 * G354: Esc closes a feature's dialog opened from the Menu (Buddies, House Keys,
 * Groups, Auctions, Report a bug): focus stays on the menu button, so game.js
 * hands the topmost shown aria-modal dialog an Escape before its own panels.
 * An emergency quest offer still ignores Escape (QuestConversationUI.as 154-155).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const game = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/game.js'), 'utf8');

describe('Esc and feature dialogs (G354)', () => {
  it('relays Escape to the topmost shown aria-modal dialog before the game panels', () => {
    // LAYERS3: a plain panel opened over another window (js/window-stack.js) closes first.
    const at = game.indexOf("    if (e.key === 'Escape') {\n      if (escapeTopPanel()) return;\n      if (escapeOpenFeatureDialog()) return;\n      if (isMailboxOpen()) {");
    assert.ok(at > 0, 'the relay comes first in the main Escape branch, after the topmost panel');
    assert.match(game, /function escapeOpenFeatureDialog\(\) \{[\s\S]*?querySelectorAll\('\[role="dialog"\]\[aria-modal="true"\]'\)[\s\S]*?dispatchEvent\(new KeyboardEvent\('keydown', \{ key: 'Escape', bubbles: true, cancelable: true \}\)\)/);
  });

  it('never relays its own Escape twice', () => {
    const handler = game.slice(game.indexOf("window.addEventListener('keydown', (e) => {\n    if (e.target?.matches?.('input"));
    const guard = handler.indexOf('if (relayingEscape) return;');
    assert.ok(guard > 0 && guard < handler.indexOf('keys.add(e.key)'), 'the guard runs before any key is held');
  });

  it('leaves an emergency offer deaf to Escape, as the source did', () => {
    assert.match(game, /questDialogueState\?\.urgent === true && !questDialogueState\.inLog && opts\.cancel !== true && opts\.force !== true/);
  });
});
