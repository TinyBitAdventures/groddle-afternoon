/**
 * Lane clouds (Austin 2026-11-15): the tutorial save carries a step marker (newxp.stageAt, step,
 * stepAt) so a later read of the saves can tell how long people spent on each stage and where they
 * stopped (nine live saves sat in the Cloud Level with no way to tell if the chain was pulled).
 * Times and step names only; no new route.
 * Run: node --test tests/newxp-step-marker.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markStage, markStep, normalizeNewxpSave, startNewxp } from '../public/js/newxp.js?v=f02bc05e';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const feature = readFileSync(join(root, 'public/js/features/newxp-feature.js'), 'utf8');

describe('newxp step marker', () => {
  it('a stage keeps the time it was first reached; a restart of the stage keeps it', () => {
    const s = startNewxp({}, 'clouds', 100);
    markStage(s, 'clouds', 110);
    markStage(s, 'clouds', 900);
    markStage(s, 'training1', 950);
    assert.deepEqual(s.stageAt, { clouds: 110, training1: 950 });
    markStage(s, 'nope', 999);
    assert.deepEqual(Object.keys(s.stageAt), ['clouds', 'training1']);
  });

  it('a step and its time change only when the step does', () => {
    const s = normalizeNewxpSave({});
    markStep(s, 'chain', 10);
    markStep(s, 'chain', 20);
    assert.equal(s.step, 'chain');
    assert.equal(s.stepAt, 10);
    markStep(s, 'move', 30);
    assert.deepEqual([s.step, s.stepAt], ['move', 30]);
    markStep(s, 'Not a step <b>', 40);
    assert.deepEqual([s.step, s.stepAt], ['move', 30], 'free text never goes in');
  });

  it('the save keeps the marker through a reload and drops anything else', () => {
    const back = normalizeNewxpSave(JSON.parse(JSON.stringify({ status: 'active', stage: 'clouds', stageAt: { clouds: 5, island: 'x', bogus: 3 }, step: 'walk', stepAt: 7 })));
    assert.deepEqual(back.stageAt, { clouds: 5 });
    assert.equal(back.step, 'walk');
    assert.equal(back.stepAt, 7);
    assert.deepEqual(normalizeNewxpSave({ step: 'x'.repeat(40), stepAt: 'soon' }).step, '');
    assert.equal(normalizeNewxpSave({}).stepAt, 0);
  });

  it('starting the tutorial over from the clouds clears the marker', () => {
    const s = startNewxp({ status: 'active', stage: 'training1', stageAt: { clouds: 5, training1: 9 }, step: 'tube', stepAt: 9 }, 'clouds', 50);
    assert.deepEqual(s.stageAt, {});
    assert.equal(s.step, '');
  });

  it('the feature marks each stage as it begins and saves each step as it changes', () => {
    assert.match(feature, /save\.stage = stage;\s+save\.status = 'active';\s+markStage\(save, stage\);/);
    assert.match(feature, /function setStep\(step\) \{[\s\S]{0,400}markStep\(save, step\);[\s\S]{0,120}engineRef\?\.save\?\.\(\)/);
  });
});
