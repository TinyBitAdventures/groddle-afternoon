/**
 * Ticket 245: a result's floating words drew under the speech balloon (the balloon is zIndex
 * 99999 on the FX layer, a float was 0), so a plot's "+1 Seed" beside its talkback was hidden.
 * Floats and a quoin's amount now draw over the balloon, and a plot's words start under the
 * balloon's tail rather than right where it hangs.
 * Run: node --test tests/float-over-speech.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FLOAT_TEXT_Z, SPEECH_BUBBLE_Z } from '../public/js/fx-z.js?v=18dda7e3';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

describe('floating words over the speech balloon', () => {
  it('a float sits above a balloon on the FX layer', () => {
    assert.ok(FLOAT_TEXT_Z > SPEECH_BUBBLE_Z);
  });

  it('game.js gives the balloon and every float those numbers', () => {
    const game = read('public/game.js');
    assert.match(game, /bubble\.zIndex = SPEECH_BUBBLE_Z;/);
    assert.doesNotMatch(game, /zIndex = 99999/);
    const fn = game.slice(game.indexOf('function floatText('), game.indexOf('function quoinGotText('));
    assert.match(fn, /float\.zIndex = FLOAT_TEXT_Z;\n\s+fxLayer\.addChild\(float\);/);
  });

  it("a quoin's amount and the camera's balloon follow the same order", () => {
    assert.match(read('public/js/features/quoin-shards-feature.js'), /fxRoot\.zIndex = FLOAT_TEXT_Z;/);
    assert.match(read('public/js/features/camera-mode-feature.js'), /bubble\.zIndex = SPEECH_BUBBLE_Z;/);
  });

  it("a plot's words start under its balloon while it talks, 50 px up otherwise", () => {
    const game = read('public/game.js');
    assert.match(game, /const RESULT_FLOAT_RISE = 50;\nconst RESULT_FLOAT_UNDER_SPEECH = 12;/);
    assert.match(game, /return target\.sprite\.y - \(speaking \? RESULT_FLOAT_UNDER_SPEECH : RESULT_FLOAT_RISE\);/);
    assert.match(game, /floatText\(target\.sprite\.x, resultFloatY\(target, spoke \|\| Boolean\(reactionText\)\), toastLine, 0xfff4d6, \{ life: 110 \}\)/);
    assert.match(game, /floatText\(target\.sprite\.x, resultFloatY\(target, spoke \|\| Boolean\(reactionText\)\) - i \* 16, m, 0xfff4d6\)/);
  });
});
