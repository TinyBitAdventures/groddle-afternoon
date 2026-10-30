/**
 * Enter at a garden tends it (bug report #5, 2026-10-30: "pressing enter at a crop garden only
 * brings up the crop garden and not the stuff in it"). The client's Enter on a garden you own
 * started tending (TSFrontController.as 3727-3733, GardenManager.as startEditing): the first
 * plot glows, the arrows move between plots (GardenView.as onKeyDown 588-672), Enter acts on the
 * plot and Esc stops. The remake opened the garden's own menu (Water all) instead.
 * Run: node --test tests/garden-tend.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstTendKey, plotIdForKey, plotKeyForId, stepPlotId, stepTendKey, tendKeyAction } from '../public/js/garden-tend.js?v=beb9a657';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

describe('tending a garden from the keyboard', () => {
  it('maps the client plot ids (row 0 at the front) onto the remake keys (r 1 at the back)', () => {
    assert.equal(plotKeyForId(0, 4, 2), '1-2');
    assert.equal(plotKeyForId(3, 4, 2), '4-2');
    assert.equal(plotKeyForId(4, 4, 2), '1-1');
    assert.equal(plotKeyForId(7, 4, 2), '4-1');
    for (let id = 0; id < 8; id++) assert.equal(plotIdForKey(plotKeyForId(id, 4, 2), 4, 2), id);
    // GardenView.as is_tending 718: plot 0, the front row's left end.
    assert.equal(firstTendKey(4, 2), '1-2');
    assert.equal(firstTendKey(3, 2), '1-2');
  });

  it('steps between plots with the client\'s wraps (GardenView.as 594-656), every plot reached', () => {
    const walk = (dir, cols, rows) => {
      const seen = [0];
      for (let id = stepPlotId(0, dir, cols, rows); id !== 0 && seen.length < 20; id = stepPlotId(id, dir, cols, rows)) seen.push(id);
      return seen;
    };
    assert.deepEqual(walk('right', 4, 2), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(walk('left', 4, 2), [0, 7, 6, 5, 4, 3, 2, 1]);
    assert.deepEqual(walk('up', 4, 2), [0, 4, 3, 7, 2, 6, 1, 5]);
    assert.deepEqual(walk('down', 4, 2), [0, 5, 1, 6, 2, 7, 3, 4]);
    for (const dir of ['up', 'down', 'left', 'right']) assert.equal(new Set(walk(dir, 3, 2)).size, 6, `3x2 herb garden ${dir}`);
    assert.equal(stepTendKey('3-2', 'up', 4, 2), '3-1');
  });

  it('answers the arrows, WASD, Enter and E, and leaves modified keys alone', () => {
    assert.equal(tendKeyAction({ key: 'ArrowLeft' }), 'left');
    assert.equal(tendKeyAction({ key: 'W' }), 'up');
    assert.equal(tendKeyAction({ key: 's' }), 'down');
    assert.equal(tendKeyAction({ key: 'd' }), 'right');
    assert.equal(tendKeyAction({ key: 'Enter' }), 'tend');
    assert.equal(tendKeyAction({ key: 'e' }), 'tend');
    assert.equal(tendKeyAction({ key: 'q' }), null);
    assert.equal(tendKeyAction({ key: 'ArrowLeft', metaKey: true }), null);
  });

  it('game.js: Enter and the chooser tend a garden, its plots take the keys, Esc and a click off stop it', () => {
    assert.match(game, /if \(t && !nearestFirst && \/\^garden_\(new\|plot\)\$\/\.test\(t\.classId\) && startGardenTend\(t\.state\?\.gardenEntity \|\| t\)\) return;/);
    assert.match(game, /if \(choice\.target\?\.classId === 'garden_new' && startGardenTend\(choice\.target\)\) return;/);
    assert.match(game, /if \(gardenTend && !menuTarget && !panelOnScreen\(\) && gardenTendKey\(e\)\) return;/);
    assert.match(game, /if \(gardenTend\) \{\n\s+stopGardenTend\(\);\n\s+return;\n\s+\}/);
    assert.match(game, /else if \(best !== gardenTend\.entity\) stopGardenTend\(\);/);
    assert.match(game, /interactDistance\(entity, player\.x, player\.y\) > 200\) \{\n\s+stopGardenTend\(\);/);
  });
});
