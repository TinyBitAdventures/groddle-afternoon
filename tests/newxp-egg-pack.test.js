/**
 * The tutorial's Egg (Austin 2026-11-08): while the Dustbunny waits, the Egg's own pack menu gives
 * it, as the original's drag onto the Dustbunny did (npc_newxp_dustbunny.js 190-195, drop_tip
 * "Give Egg to Dust Bunny"). Since the drag itself came (G588, features/world-drop-feature.js) the hint
 * is the source's own line again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LINES } from '../public/js/newxp.js?v=72a5d3da';
import { newxpFeature, EGG_GIVE_REACH } from '../public/js/features/newxp-feature.js?v=2ce1b35f';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'public/js/features/newxp-feature.js'), 'utf8');

test('the pack verb uses the original drop tip, and the hint is the original line', () => {
  assert.equal(LINES.t2GiveEggPack, 'Give Egg to Dust Bunny');
  // npc_newxp_dustbunny.js 204.
  assert.equal(LINES.t2GiveHint, 'Drag an EGG onto the Dustbunny. Or, click on the Dustbunny to give it an EGG.');
  assert.doesNotMatch(`${LINES.t2GiveHint} ${LINES.t2GiveEggFar}`, /—|Glitch/);
  assert.ok(EGG_GIVE_REACH > 0);
});

test('outside the egg step the Egg gets no tutorial verb', () => {
  const f = newxpFeature;
  assert.equal(f.packVerbs('egg_plain', {}), null);
  assert.equal(f.packVerbs('apple', {}), null);
  assert.equal(f.runPackVerb('egg_plain', 'something_else', {}), false);
});

test('in the egg step the Egg\'s verb gives it through the same path as the Dustbunny\'s Give Egg', () => {
  assert.match(src, /if \(classTsid !== 'egg_plain' \|\| !run \|\| run\.stage !== 'training2' \|\| run\.step !== 'egg_give'\) return null;/);
  assert.match(src, /id: 'nx_give_egg', label: LINES\.t2GiveEggPack/);
  assert.match(src, /runPackVerb\(classTsid, verbId, engine\) \{\n    if \(verbId !== 'nx_give_egg'[^\n]*\n    if \(!eggGiveNear\(engine\)\) \{\n      engine\.toast\(LINES\.t2GiveEggFar, 2000\);\n      return true;\n    \}\n    giveEgg\(engine\);/);
});
