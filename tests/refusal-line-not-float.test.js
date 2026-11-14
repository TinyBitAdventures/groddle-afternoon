/**
 * Austin 2026-11-13 (live v0.37.1, Groddle Meadow): milking a Butterfly with no massage today drew
 * "What? No warmup? No preamble? ..." as one screen-wide float, off both edges. The source puts that
 * line in the verb message and sends it as activity (npc_butterfly.js 743-746 buildVerbMessage,
 * pc.sendActivity), so content.js now writes every refused care verb as "You try to ... <line>"
 * (the notice, which wraps, and the log), and game.js never floats a result line longer than
 * RESULT_FLOAT_MAX_CHARS.
 * Run: node --test tests/refusal-line-not-float.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runVerb } from '../public/content.js?v=de8f27e6';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const NO_WARMUP = 'What? No warmup? No preamble? You just walk up to a butterfly with your clammy hands and try to milk it? You have a lot to learn about charming butterflies.';

describe('a refused care verb says why in the activity line, not a float', () => {
  it('milk with no massage (needs_massage)', () => {
    const r = runVerb({ classId: 'npc_butterfly', state: {} }, 'milk', { pc: { energy: 100, mood: 50, level: 1 }, inv: {} });
    assert.equal(r.ok, false);
    assert.equal(r.msgs[0], `You try to milk a Butterfly. ${NO_WARMUP}`);
    assert.equal(r.effects.activityLine, r.msgs[0]);
    assert.equal(r.msgs.length, 1, 'no second line to float');
  });
  it('too tired (energy) on every care verb', () => {
    for (const [classId, verb, tried] of [
      ['npc_butterfly', 'massage', 'You try to massage a Butterfly.'],
      ['npc_chicken', 'squeeze', 'You try to squeeze a Chicken.'],
      ['npc_piggy', 'pet', 'You try to pet a Piggy.'],
    ]) {
      const r = runVerb({ classId, state: {} }, verb, { pc: { energy: 0, mood: 50, level: 1 }, inv: { butterfly_lotion: 1 } });
      assert.equal(r.ok, false, `${classId} ${verb}`);
      assert.ok(r.msgs[0].startsWith(`${tried} `), r.msgs[0]);
      assert.equal(r.msgs.length, 1, `${classId} ${verb}: ${JSON.stringify(r.msgs)}`);
    }
  });
});

describe('game.js floats only short result lines', () => {
  it('a long first line is a notice and an activity line; a long later line a notice', () => {
    assert.match(game, /const RESULT_FLOAT_MAX_CHARS = 72;/);
    assert.match(game, /const longLine = String\(toastLine\)\.length > RESULT_FLOAT_MAX_CHARS;\n\s+if \(result\.ok && verbChangedSomething\(result\.effects\) && !longLine/);
    assert.match(game, /if \(String\(m\)\.length > RESULT_FLOAT_MAX_CHARS\) \{\n\s+toast\(m, 5200\);\n\s+return;/);
  });
});

describe('a butterfly miss says what Glitch said', () => {
  it('massage and milk misses use npc_butterfly.js 1195 and 1363, not our own fallback', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../public/js/animal-kinship.js', import.meta.url), 'utf8');
    assert.match(src, /'npc_butterfly:massage': "Oh no, that didn't work!",/);
    assert.match(src, /'npc_butterfly:milk': "Oh no, that didn't work\. Try again\?",/);
  });
});
