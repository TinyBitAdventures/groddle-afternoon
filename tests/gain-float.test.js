import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAIN_FLOAT, GAIN_FLOAT_MS, GAIN_FLOAT_SEC, gainFloatPose, gainFloatSinks } from '../public/js/gain-float.js?v=caf16853';
import { QUOIN_SHARD_FX } from '../public/js/quoin-shards.js?v=121156a0';
import { stackFloat, FLOAT_LINE_PX } from '../public/js/notify.js?v=c9d79ec5';

const here = import.meta.dirname;
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');
const client = join(here, '../../glitch-client/com/tinyspeck/engine');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

// Report #181: "the quick little graphics ... that tell you what and how much you earned are TOO quick".
// The quoin's amount was fixed in v0.30.0; every other floating amount (harvest, mining, petting,
// item gains, stat changes) was still 15 px words gone in 55 frames.
describe('a gain\'s floating amount stays up as long as Glitch\'s (report #181, StatBurst.as)', () => {
  it('shows 2.4 s: grows in 0.2 s, nods 0.3 s, holds 1.5 s, rises 40 px and fades over 0.4 s', () => {
    assert.equal(GAIN_FLOAT_SEC, 2.4);
    assert.equal(GAIN_FLOAT_MS, 2400);
    assert.ok(gainFloatPose(0.1).scale > 0.8 && gainFloatPose(0.1).scale < 1, 'growing');
    assert.equal(gainFloatPose(0.2).scale, 1);
    assert.ok(gainFloatPose(0.249).y < -1.9, 'nod up 2');
    assert.ok(gainFloatPose(0.349).y > 1.9, 'nod down to +2');
    near(gainFloatPose(0.51).y, 0, 'nod end');
    for (const t of [0.55, 1, 1.5, 1.99]) {
      const p = gainFloatPose(t);
      assert.deepEqual([p.scale, p.y, p.alpha, p.done], [1, 0, 1, false], `held at ${t}`);
    }
    const mid = gainFloatPose(2.2);
    assert.ok(mid.y < -30 && mid.y > -40 && mid.alpha > 0 && mid.alpha < 0.2, 'rising and fading');
    const end = gainFloatPose(2.41);
    assert.deepEqual([end.y, end.alpha, end.done], [-40, 0, true]);
    // The old float faded from its first frame and was gone in 55 frames (0.92 s).
    assert.ok(GAIN_FLOAT_SEC > (55 / 60) * 2.5);
  });

  it('a loss sinks 40 px as it fades, as StatBurst.as moved a negative value down', () => {
    assert.equal(gainFloatSinks('-2 energy'), true);
    assert.equal(gainFloatSinks('−1 Cherry'), true);
    assert.equal(gainFloatSinks('+3 mood'), false);
    assert.equal(gainFloatSinks('Harvested!'), false);
    assert.equal(gainFloatPose(2.41, { sink: true }).y, 40);
  });

  it('reduced motion: shown at once for the same time, faded in place', () => {
    assert.deepEqual(gainFloatPose(0, { still: true }), { scale: 1, y: 0, alpha: 1, done: false });
    assert.equal(gainFloatPose(1.99, { still: true }).alpha, 1);
    const end = gainFloatPose(2.41, { still: true });
    assert.deepEqual([end.y, end.alpha, end.done], [0, 0, true]);
  });

  it('longer words (opts.life) may hold longer, never shorter', () => {
    assert.equal(gainFloatPose(2.41, { holdSec: 0.5 }).done, true);
    assert.equal(gainFloatPose(2.41, { holdSec: 3 }).done, false);
  });

  it('15 px: Glitch\'s 18 px scaled as the quoin\'s 24 became 20', () => {
    assert.equal(GAIN_FLOAT.glitchText, 18);
    assert.equal(GAIN_FLOAT.stageScale, QUOIN_SHARD_FX.text / 24);
    assert.equal(GAIN_FLOAT.text, Math.round(GAIN_FLOAT.glitchText * GAIN_FLOAT.stageScale));
  });

  it('uses the client numbers', { skip: !existsSync(client) && 'glitch-client not beside the spike' }, () => {
    const sb = readFileSync(join(client, 'port/StatBurst.as'), 'utf8');
    assert.match(sb, /private var end_text_size:Number = 18;/);
    assert.match(sb, /const final_y_delta:int = val > 0 \? -40 : 40;/);
    assert.match(sb, /const move_by:int = 2;\n\s+const move_in:Number = \.05;/);
    assert.match(sb, /\{text_perc:1, time:\.2, delay:\.2,/);
    assert.match(sb, /\{y:val_tf\.y\+final_y_delta, alpha:0, delay:1\.5, time:\.4,/);
    assert.equal(GAIN_FLOAT.textInSec, 0.2);
    assert.equal(GAIN_FLOAT.textBobPx, 2);
    assert.equal(GAIN_FLOAT.textBobSec, 0.05);
    assert.equal(GAIN_FLOAT.textHoldSec, 1.5);
    assert.equal(GAIN_FLOAT.textOutSec, 0.4);
    assert.equal(GAIN_FLOAT.textRise, 40);
  });

  it('an amount raised 1 s after another at the same spot sits a line above it', () => {
    const recent = [{ x: 100, y: 200, t: 0 }];
    assert.equal(stackFloat(recent, 100, 200, 1000, { ms: GAIN_FLOAT_MS }), 200 - FLOAT_LINE_PX);
  });

  it('game.js floatText draws every amount from the shared timing and size', () => {
    const game = read('public/game.js');
    const fn = game.slice(game.indexOf('function floatText('), game.indexOf('function quoinGotText('));
    assert.match(fn, /fontSize: GAIN_FLOAT\.text,/);
    assert.match(fn, /float\._gainFloat = \{ t: 0, y: placed, sink: gainFloatSinks\(words\), still: Boolean\(notifyView\?\.reducedMotion\(\)\),/);
    assert.match(fn, /stackFloat\([^\n]*\{ ms: GAIN_FLOAT_MS \}\)/);
    assert.doesNotMatch(fn, /fontSize: 15/);
    assert.doesNotMatch(fn, /_vy/);
    assert.match(game, /if \(t\._gainFloat\) \{\n[^]*?const pose = gainFloatPose\(g\.t, g\);\n\s+t\.scale\.set\(pose\.scale\);\n\s+t\.y = g\.y \+ pose\.y;\n\s+t\.alpha = pose\.alpha;\n\s+if \(pose\.done\) fxLayer\.removeChild\(t\);/);
  });
});
