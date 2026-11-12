/**
 * TOUCH: on a phone the page itself never zooms, reloads or selects under the game's UI (the mobile QA,
 * 2026-11-12: only the canvas had touch-action none; a double tap or pinch on the HUD, pack or panels
 * could zoom the page, a pull down reload it on Chrome for Android, a long press select HUD words or
 * open the iOS callout).
 * Run: node --test tests/touch-gestures.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

describe('page gestures on a phone', () => {
  it('no overscroll (pull to refresh), pans only (no pinch or double tap zoom), no selection or callout', () => {
    assert.match(css, /:root\.touch-phone, :root\.touch-phone body \{ overscroll-behavior: none; \}/);
    assert.match(css, /:root\.touch-phone body \{ touch-action: pan-x pan-y; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;/);
  });
  it('typing fields and the logs still select', () => {
    assert.match(css, /:root\.touch-phone :is\(input, textarea, select, \[contenteditable="true"\], \[contenteditable=""\], \.activity-log, \.social-log, #local-chat-log\) \{ -webkit-user-select: text; user-select: text;/);
  });
});
