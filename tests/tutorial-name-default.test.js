/**
 * The tutorial's name box (Austin 2026-11-08): online, a player already chose a character name at
 * sign-up, so the Welcoming Flamingo's box starts with it (js/newxp.js tutorialNameDefault).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tutorialNameDefault, TUTORIAL_NAME_MAX } from '../public/js/newxp.js?v=554cfdda';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the name box starts with the online character name, or empty in solo', () => {
  assert.equal(TUTORIAL_NAME_MAX, 19, 'newxp_training1.js 582 input_max_chars');
  assert.equal(tutorialNameDefault({ player: { id: 7, name: 'Pip Tester' } }), 'Pip Tester');
  assert.equal(tutorialNameDefault({ player: { name: '  Zz <b>Smoke</b> ' } }), 'Zz bSmoke/b');
  assert.equal(tutorialNameDefault({ player: { name: 'A'.repeat(30) } }), 'A'.repeat(19));
  assert.equal(tutorialNameDefault({}), '');
  assert.equal(tutorialNameDefault(undefined), '');
  assert.equal(tutorialNameDefault(null), '');
});

test('the Flamingo\'s prompt passes it as the box\'s value', () => {
  const src = readFileSync(join(root, 'public/js/features/newxp-feature.js'), 'utf8');
  assert.match(src, /input: \{ max: TUTORIAL_NAME_MAX, placeholder: 'Your name', value: tutorialNameDefault\(\) \}/);
  assert.match(src, /field\.value = input\.value \|\| '';/);
});
