/**
 * Home style tubes (Austin 2026-11-08): walking back from the Magic Rock crossed Uralia's ring first and
 * chose it. A ring chooses only after you stand still on it; walking across says how to pick.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STYLE_RING_DWELL_MS, STYLE_RING_STILL_VX, styleRingHint } from '../public/js/features/newxp-feature.js?v=fddce50f';

const src = readFileSync(new URL('../public/js/features/newxp-feature.js', import.meta.url), 'utf8');

test('the hint names the style and how to pick it', () => {
  assert.equal(styleRingHint('Pick Uralia Style'), 'Stand still here to pick Uralia Style, or keep walking to see the others.');
  assert.doesNotMatch(styleRingHint('Pick Meadow Style'), /—|Glitch/);
  assert.ok(STYLE_RING_DWELL_MS >= 500 && STYLE_RING_STILL_VX > 0);
});

test('a ring chooses only after the dwell, and moving restarts it', () => {
  assert.doesNotMatch(src, /if \(c && countItem\(engine\.inv, 'homestreet_ticket'\) > 0 && !run\.data\.style\) run\.data\.style = c\.style;/);
  assert.match(src, /if \(Math\.abs\(Number\(p\.vx\) \|\| 0\) > STYLE_RING_STILL_VX \|\| !p\.onGround\) ring\.since = now;/);
  assert.match(src, /if \(now - ring\.since >= STYLE_RING_DWELL_MS\) run\.data\.style = c\.style;/);
  // The tube's own Pick verb still chooses at once.
  assert.match(src, /else run\.data\.style = target\.nxStyle;/);
});
