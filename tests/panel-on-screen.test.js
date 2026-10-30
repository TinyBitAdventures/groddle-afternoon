/**
 * engine.busy() counts a panel only when it is drawn (game.js panelOnScreen).
 * The Account panel sits inside a hidden shade with no hidden attribute of its
 * own, and counting it kept the game busy for good on the Groddle site, where
 * every game has one (found by the G338 lane, 2026-10-26).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const src = readFileSync(join(ROOT, 'game.js'), 'utf8');
const body = src.match(/function panelOnScreen\(\) \{[\s\S]*?\n\}/)[0];

function load(nodes) {
  const document = { querySelectorAll: () => nodes };
  // The side sheets (js/ui/panel-shell.js SIDE_SHEET_IDS) sit beside the world and never count.
  return new Function('document', 'SIDE_SHEET_IDS', `${body}; return panelOnScreen;`)(document, ['quest-panel', 'make-panel']);
}
const drawn = { getClientRects: () => [{}] };
const notDrawn = { getClientRects: () => [] };

describe('panelOnScreen', () => {
  it('a panel inside a hidden shade does not count', () => {
    assert.equal(load([notDrawn])(), false);
  });
  it('a panel on screen counts', () => {
    assert.equal(load([notDrawn, drawn])(), true);
  });
  it('a side sheet on screen does not count (Quests, Make: the avatar walks beside them)', () => {
    assert.equal(load([{ id: 'make-panel', ...drawn }])(), false);
    assert.equal(load([{ id: 'make-panel', ...drawn }, { id: 'map-panel', ...drawn }])(), true);
  });
  it('busy() asks it instead of the bare selector', () => {
    assert.match(src, /\(!ignoreHome && homeIsInstanced\(\)\) \|\|\n\s+\/\/ Any open panel[^\n]*\n\s+panelOnScreen\(\)/);
  });
});
