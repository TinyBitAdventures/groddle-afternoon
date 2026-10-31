// A focused button in an open feature dialog takes Enter and Space (Austin, 2026-10-25: Enter on the
// subway's "without Your Papers" refusal opened the red button's menu again instead of pressing OK).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const game = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'game.js'), 'utf8');

test('Enter and Space go to a focused dialog button before any world key', () => {
  const at = game.indexOf("if ((e.key === 'Enter' || e.key === ' ') && focusedDialogButton()) return;");
  assert.ok(at > 0);
  // Before the key is recorded (so Space does not jump) and before Enter opens the nearest menu.
  assert.ok(at < game.indexOf('keys.add(e.key);', at - 400));
  assert.ok(game.indexOf('tryOpenNearestMenu({ nearestFirst', at) > at);
});

test('focusedDialogButton only answers for buttons inside an open dialog or the pack', () => {
  const fn = game.slice(game.indexOf('function focusedDialogButton()'), game.indexOf('function isQuestDialogueOpen()'));
  assert.match(fn, /closest\?\.\('button, \[role="button"\]'\)/);
  assert.match(fn, /button\.disabled/);
  // The pack row's buttons too (phase 2): Enter on a focused bag opens its tray, not the nearest menu.
  assert.match(fn, /closest\('dialog, \[role="dialog"\], \[aria-modal="true"\], \.glitch-modal, #pack-bar, #homes-bar, #homes-pop, #homes-place'\)/);
  assert.match(fn, /!dialog\.hidden/);
});
