// The online gate's Play button is one warm orange like the header's Play, with dark text
// (Austin 2026-10-30, option A). Its gradient once ran into --accent, which turned purple.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const build = readFileSync(join(import.meta.dirname, '../tools/play-online/build.mjs'), 'utf8');
const rule = build.slice(build.indexOf('.online-gate .online-play {'), build.indexOf('.online-gate .online-play:hover'));

test('the online Play button is one orange with dark text, not the accent', () => {
  assert.match(rule, /background: linear-gradient\(180deg, var\(--c-orange-76\), var\(--c-orange-68\)\)/);
  assert.match(rule, /color: var\(--text\);/);
  assert.doesNotMatch(rule, /var\(--accent\)/, 'the accent is purple now');
});
