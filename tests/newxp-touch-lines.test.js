/**
 * TOUCH: the tutorial's instruction overlays speak touch on a phone (js/newxp.js TOUCH_LINES).
 * Austin's iPhone (2026-11-12) read "Use Arrow Keys to move! (or W,A,S,D Keys if you prefer)"
 * with no keys to press. A keyboard keeps the original's words (LINES, the overlay art's).
 * Run: node --test tests/newxp-touch-lines.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES, TOUCH_LINES, instructionFor } from '../public/js/newxp.js?v=91b8f176';
import { touchPrompt } from '../public/js/touch-controls.js?v=b6071ea4';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const feature = readFileSync(join(root, 'public/js/features/newxp-feature.js'), 'utf8');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const INSTRUCTIONS = ['moveInstructions', 'buttonInstructions', 'jumpInstructions', 'jumpAcrossInstructions', 'climbInstructions', 'interactInstructions'];

describe('tutorial instructions on a phone', () => {
  it('every instruction overlay has touch words, and none of them name a key', () => {
    assert.deepEqual(Object.keys(TOUCH_LINES).sort(), [...INSTRUCTIONS].sort());
    for (const k of INSTRUCTIONS) {
      assert.ok(LINES[k], k);
      assert.doesNotMatch(TOUCH_LINES[k], /Arrow Keys|W,A,S,D|Space Bar|Up\/Down Keys|\bEnter\b/, k);
      assert.doesNotMatch(TOUCH_LINES[k], /—/, `${k}: no em-dash`);
    }
  });
  it('a phone gets the touch line, a keyboard the original', () => {
    assert.equal(instructionFor(LINES.moveInstructions, { touch: true }), TOUCH_LINES.moveInstructions);
    assert.equal(instructionFor(LINES.moveInstructions), LINES.moveInstructions);
    assert.equal(instructionFor(LINES.moveInstructions, { touch: false }), 'Use Arrow Keys to move!<br>(or W,A,S,D Keys if you prefer)');
    assert.match(TOUCH_LINES.moveInstructions, /^Tap the ground to walk there!/);
    assert.match(TOUCH_LINES.jumpInstructions, /Jump/);
    assert.match(TOUCH_LINES.climbInstructions, /ladder/);
  });
  it('any other text passes through', () => {
    assert.equal(instructionFor('Go and get that quoin.', { touch: true }), 'Go and get that quoin.');
  });
  it('the overlay asks the phone gate', () => {
    assert.match(feature, /const text = instructionFor\(keysText, \{ touch: globalThis\.GRODDLE_DEVICE === 'phone' \}\);/);
  });
});

describe('the world hint chips on a phone', () => {
  it('Enter and Up are a tap, a ladder climb is the stick and Jump, the rest pass through', () => {
    assert.deepEqual(touchPrompt({ key: 'Enter', label: 'Fruit Tree', x: 1, y: 2 }), { key: 'Tap', label: 'Fruit Tree', x: 1, y: 2 });
    assert.deepEqual(touchPrompt({ key: '↑', label: 'climb', x: 1, y: 2 }), { key: 'Tap', label: 'climb', x: 1, y: 2 });
    assert.deepEqual(touchPrompt({ key: '↑↓', label: 'climb · Space jump', x: 1, y: 2 }), { key: '', label: 'Stick climbs · Jump', x: 1, y: 2 });
    assert.deepEqual(touchPrompt({ key: '2', label: 'Gregarious Grange', x: 1, y: 2 }), { key: '2', label: 'Gregarious Grange', x: 1, y: 2 });
    assert.equal(touchPrompt(null), null);
  });
  it('game.js asks only on a phone', () => {
    assert.match(game, /settlePrompt\(TOUCH_PHONE \? touchPrompt\(want\) : want, performance\.now\(\)\);/);
  });
});
