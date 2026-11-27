/**
 * Home style tubes (Austin 2026-11-08): walking back from the Magic Rock crossed Uralia's ring first and
 * chose it. A ring chose only after you stood still on it; walking across says how to pick.
 * #554 (Austin 2026-11-19): standing still on a ring no longer picks; it asks "Pick Uralia Style?" with
 * Yes and Keep looking. Yes picks; walking off or Keep looking keeps looking; the tube's own Pick verb
 * still picks at once (Glitch: homestreet_ticket_dispenser.js verbs only).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STYLE_RING_ASK,
  STYLE_RING_DWELL_MS,
  STYLE_RING_STILL_VX,
  styleRingHint,
  styleRingQuestion,
  styleRingStep,
} from '../public/js/features/newxp-feature.js?v=81dac63a';

const src = readFileSync(new URL('../public/js/features/newxp-feature.js', import.meta.url), 'utf8');

test('the hint names the style and how to pick it', () => {
  assert.equal(styleRingHint('Pick Uralia Style'), 'Stand still here to pick Uralia Style, or keep walking to see the others.');
  assert.doesNotMatch(styleRingHint('Pick Meadow Style'), /—|Glitch/);
  assert.ok(STYLE_RING_DWELL_MS >= 500 && STYLE_RING_STILL_VX > 0);
});

test('#554: the question names the style, with Yes and a way to keep looking', () => {
  assert.equal(styleRingQuestion('Pick Uralia Style'), 'Pick Uralia Style?');
  assert.equal(styleRingQuestion('Pick Firebog Style'), 'Pick Firebog Style?');
  assert.deepEqual({ ...STYLE_RING_ASK }, { yes: 'Yes', no: 'Keep looking' });
  for (const s of [styleRingQuestion('Pick Meadow Style'), STYLE_RING_ASK.no]) assert.doesNotMatch(s, /—/);
});

test('#554: standing still asks once; it never picks by itself', () => {
  let out = styleRingStep(null, { style: 'uralia', still: true, now: 0 });
  assert.equal(out.hint, true, 'stepping on says how to pick');
  assert.ok(!out.ask);
  out = styleRingStep(out.ring, { style: 'uralia', still: true, now: STYLE_RING_DWELL_MS - 1 });
  assert.ok(!out.ask, 'not before the dwell');
  out = styleRingStep(out.ring, { style: 'uralia', still: true, now: STYLE_RING_DWELL_MS });
  assert.equal(out.ask, true, 'asks after standing still');
  assert.ok(!('pick' in out) && !('style' in out), 'the step never picks');
  // Still standing there: no second question.
  const again = styleRingStep(out.ring, { style: 'uralia', still: true, now: STYLE_RING_DWELL_MS * 5 });
  assert.ok(!again.ask);
});

test('#554: moving restarts the wait; walking off closes the question; a new ring starts over', () => {
  let out = styleRingStep(null, { style: 'firebog', still: true, now: 0 });
  out = styleRingStep(out.ring, { style: 'firebog', still: false, now: 900 });
  out = styleRingStep(out.ring, { style: 'firebog', still: true, now: 1500 });
  assert.ok(!out.ask, 'moving restarted the wait');
  out = styleRingStep(out.ring, { style: 'firebog', still: true, now: 900 + STYLE_RING_DWELL_MS });
  assert.equal(out.ask, true);
  const off = styleRingStep(out.ring, { style: '', still: false, now: 3000 });
  assert.equal(off.close, true, 'walking off while asked closes it (keep looking)');
  assert.equal(off.ring, null);
  const other = styleRingStep(out.ring, { style: 'meadow', still: false, now: 3000 });
  assert.equal(other.close, true);
  assert.equal(other.hint, true);
  // Keep looking: the ring stays quiet until you step off and back on.
  const declined = { ...out.ring, asking: false };
  assert.ok(!styleRingStep(declined, { style: 'firebog', still: true, now: 99999 }).ask);
  assert.ok(!styleRingStep(declined, { style: '', now: 99999 }).close, 'nothing open to close');
  const back = styleRingStep(styleRingStep(declined, { style: '', now: 100000 }).ring, { style: 'firebog', still: true, now: 100000 });
  assert.equal(styleRingStep(back.ring, { style: 'firebog', still: true, now: 100000 + STYLE_RING_DWELL_MS }).ask, true, 'back on: asks again');
});

test('the feature asks on the ring, Yes picks, and the tube verb still picks at once', () => {
  assert.doesNotMatch(src, /if \(now - ring\.since >= STYLE_RING_DWELL_MS\) run\.data\.style = c\.style;/, 'no pick on the dwell');
  assert.match(src, /const step = styleRingStep\(ring, \{ style: open \? c\.style : '', still, now: Date\.now\(\) \}\);/);
  assert.match(src, /if \(step\.close && ask\) ask\.close\(\);/);
  assert.match(src, /ask = askStyleRing\(engine, c, L\.floorY, \(yes\) => \{[\s\S]{0,160}if \(yes && !run\.data\.style\) run\.data\.style = style;/);
  assert.match(src, /\[\['yes', STYLE_RING_ASK\.yes\], \['no', STYLE_RING_ASK\.no\]\]/);
  // Picked another way (the verb, the autoplay help): the open question closes.
  assert.match(src, /\}, \{ help: \(\) => \{ run\.data\.style = engine\.param\('newxpstyle'\) \|\| 'meadow'; \} \}\);\n  if \(ask\) ask\.close\(\);/);
  // The tube's own Pick verb still chooses at once.
  assert.match(src, /else run\.data\.style = target\.nxStyle;/);
});
