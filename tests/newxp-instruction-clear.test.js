/**
 * Lane clouds (Austin 2026-11-15): on a phone the tutorial's instruction keeps over the stick and
 * Jump, which is where the avatar stands, so "Tap the ground to walk there!" covered the Glitch it
 * spoke to (402x660 portrait and 874x402 landscape). instructionClearTop moves it above the head.
 * Run: node --test tests/newxp-instruction-clear.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { instructionClearTop } from '../public/js/newxp.js?v=0d81aa52';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const feature = readFileSync(join(root, 'public/js/features/newxp-feature.js'), 'utf8');

describe('the instruction keeps clear of the avatar', () => {
  // Portrait 402x660 as measured: instruction 398-448 across 83-319, avatar 370-445 across 190-235.
  const avatar = { top: 370, bottom: 445, left: 190, right: 235 };
  it('over the avatar it goes above the head', () => {
    const top = instructionClearTop({ top: 398, left: 83, width: 236, height: 50 }, avatar, { minTop: 56 });
    assert.equal(top, 370 - 10 - 50);
    assert.ok(top + 50 <= avatar.top);
  });
  it('with no room above it goes under the feet', () => {
    assert.equal(instructionClearTop({ top: 398, left: 83, width: 236, height: 50 }, { ...avatar, top: 90 }, { minTop: 56 }), 455);
  });
  it('clear of the avatar, or with no avatar, it stays put', () => {
    assert.equal(instructionClearTop({ top: 590, left: 550, width: 180, height: 46 }, { top: 305, bottom: 470, left: 600, right: 690 }), 590, 'desktop: under the feet already');
    assert.equal(instructionClearTop({ top: 398, left: 0, width: 100, height: 50 }, avatar), 398, 'beside it');
    assert.equal(instructionClearTop({ top: 398, left: 83, width: 236, height: 50 }, null), 398);
    assert.equal(instructionClearTop({ top: 398, left: 83, width: 236, height: 0 }, avatar), 398, 'not laid out yet');
  });
  it('positionBubbles asks it with the avatar\'s drawn box, not while the avatar waits hidden at the chain', () => {
    assert.match(feature, /const avatar = p && !rooted \?/);
    assert.match(feature, /instrTop = instructionClearTop\(\{ top: instrTop, left: r\.left \+ r\.width \/ 2 - w \/ 2, width: w, height: ui\.instr\.offsetHeight \}, avatar, \{ minTop: r\.top \+ 56 \}\);/);
  });
});
