/**
 * #640 (Android, live): mining a Metal Rock showed the rock's answer in its bubble and a second,
 * generic notice at the top with the same swing ("You mine 5 Chunks of Metal Rock. -10 energy, ...").
 * Metal Rock alone: its line is longer than RESULT_FLOAT_MAX_CHARS, and the long-line branch of
 * game.js runVerbFinish raised every long line as a notice, bubble or not. Glitch sent the verb's
 * words to the Activity log (pc.sendActivity) and the rock talked back in its bubble
 * (include/mining.js 420-495). js/verb-result-route.js decides it now; resource nodes that answer
 * in a bubble (barnacle, peat, dirt, ice) log their lines too.
 * Run: node --test tests/verb-result-route-640.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESULT_FLOAT_MAX_CHARS, resultLineRoute } from '../public/js/verb-result-route.js?v=61b4fc9d';
import { runVerb } from '../public/content.js?v=79a980f7';
import { createMineRock } from '../public/js/mining.js?v=7ecaa572';
import { createInventory } from '../public/js/inventory.js?v=3be7988a';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** game.js runVerbFinish's question for a result: is the first line shown, or did the bubble answer? */
function routeOf(result) {
  const spoke = Boolean((result.ok || result.speech?.failed) && result.speech?.text);
  const line = result.msgs?.[0] || result.effects?.activityLine;
  const changed = ['energy', 'mood', 'img', 'xp'].some((k) => Number(result.effects?.[k])) || Object.values(result.effects?.items || {}).some(Number);
  return resultLineRoute({ ok: result.ok, changed, shown: !spoke || Boolean(result.toastWithSpeech), line, canFloat: true });
}

describe('#640: a verb the thing answers in its bubble raises no notice', () => {
  it('every rock, Metal Rock included, answers in its bubble and logs the swing, never a notice', () => {
    for (const cls of ['rock_metal_1', 'rock_dullite_1', 'rock_beryl_1', 'rock_sparkly_1']) {
      for (const roll of [0, 0.99]) {
        const rock = { classId: cls, state: { rock: createMineRock(cls) } };
        const r = runVerb(rock, 'mine', { pc: { energy: 500, mood: 50, imagination: 0, xp: 0 }, inv: createInventory({ pick: 1, fancy_pick: 1 }), learned: ['mining_1'], rng: () => roll });
        assert.equal(r.ok, true, cls);
        assert.ok(r.speech?.text, `${cls}: the rock answers`);
        assert.deepEqual(routeOf(r), { float: false, notice: false, log: 'gain' }, `${cls}: ${r.msgs[0]}`);
      }
    }
    // Why Metal Rock alone: its line is past the float length.
    const metal = runVerb({ classId: 'rock_metal_1', state: { rock: createMineRock('rock_metal_1') } }, 'mine', { pc: { energy: 500, mood: 50 }, inv: createInventory({ pick: 1, fancy_pick: 1 }), learned: ['mining_1'], rng: () => 0 });
    assert.ok(metal.msgs[0].length > RESULT_FLOAT_MAX_CHARS, metal.msgs[0]);
  });

  it('routes a result line: float, notice or the log alone', () => {
    assert.equal(RESULT_FLOAT_MAX_CHARS, 72);
    const long = 'x'.repeat(RESULT_FLOAT_MAX_CHARS + 1);
    assert.deepEqual(resultLineRoute({ ok: true, changed: true, shown: true, line: 'You harvest 3 Cherries.' }), { float: true, notice: false, log: 'gain' });
    assert.deepEqual(resultLineRoute({ ok: true, changed: true, shown: true, line: long }), { float: false, notice: true, log: 'activity' }, 'too long to float: a notice');
    assert.deepEqual(resultLineRoute({ ok: true, changed: true, shown: false, line: long }), { float: false, notice: false, log: 'gain' }, 'the bubble said it');
    assert.deepEqual(resultLineRoute({ ok: false, changed: false, shown: false, line: 'You try to pet a Piggy.' }), { float: false, notice: false, log: 'log' });
    assert.deepEqual(resultLineRoute({ ok: false, changed: false, shown: true, line: 'Not now.' }), { float: false, notice: true, log: 'activity' });
    assert.deepEqual(resultLineRoute({ ok: true, changed: true, shown: true, line: 'short', canFloat: false }), { float: false, notice: true, log: 'activity' });
    // game.js's `(!spoke || result.toastWithSpeech) && ...` is undefined under a bubble: never shown (the live check found it).
    assert.deepEqual(resultLineRoute({ ok: true, changed: true, shown: undefined, line: long }), { float: false, notice: false, log: 'gain' });
  });

  it('game.js and the resource nodes ask it', () => {
    const game = read('public/game.js');
    assert.match(game, /const route = resultLineRoute\(\{/);
    assert.doesNotMatch(game, /const RESULT_FLOAT_MAX_CHARS = /, 'one length, in js/verb-result-route.js');
    const nodes = read('public/js/features/resource-nodes-feature.js');
    assert.match(nodes, /const answers = Boolean\(entity\.target && talkbackFor\(result\)\);\n\s+for \(const line of result\.msgs \|\| \[\]\) \{\n\s+if \(answers && engine\.notify\?\.gain\) engine\.notify\.gain\(line\);/);
  });
});
