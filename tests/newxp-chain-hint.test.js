/**
 * Lane clouds (Austin 2026-11-15): the Cloud Level's chain lost new players. Its only cue was the
 * white "click to pull" arrow (newxp_clicktopull_arrow) on a pale sky, 4 s in and half the time at
 * a third of its alpha, with a thumb-wide handle on a phone. Now the arrow and an instruction come
 * 1.5 s in (at once on any key or tap), the arrow never blinks faint and sits over a dark copy of
 * itself, and the hit area takes the handle and the arrow.
 * Run: node --test tests/newxp-chain-hint.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAIN_HINT_MS, CHAIN_HIT, chainArrowAlpha } from '../public/js/features/newxp-feature.js?v=a993984a';
import { LINES, TOUCH_LINES, cloudsLayout, instructionFor } from '../public/js/newxp.js?v=43f8df2c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const feature = readFileSync(join(root, 'public/js/features/newxp-feature.js'), 'utf8');

describe('the chain-pull prompt', () => {
  it('comes well inside the first few seconds', () => {
    assert.ok(CHAIN_HINT_MS <= 2000, `${CHAIN_HINT_MS} ms`);
  });

  it('the arrow is hidden before the hint and never fainter than 0.6 after it', () => {
    assert.equal(chainArrowAlpha(-1), 0);
    assert.equal(chainArrowAlpha(NaN), 0);
    for (let ms = 0; ms < 5000; ms += 37) {
      const a = chainArrowAlpha(ms);
      assert.ok(a >= 0.6 - 1e-9 && a <= 1 + 1e-9, `${ms}: ${a}`);
    }
  });

  it('says the arrow\'s words on a keyboard and touch words on a phone', () => {
    assert.match(LINES.pullChain, /^Click to pull the chain!/);
    assert.match(LINES.pullChain, /Enter/);
    assert.equal(instructionFor(LINES.pullChain, { touch: true }), TOUCH_LINES.pullChain);
    assert.match(TOUCH_LINES.pullChain, /^Tap the chain/);
    assert.match(TOUCH_LINES.pullChain, /\bAct\b/);
  });

  it('the hit area takes the handle and the arrow under it, centred on the chain', () => {
    const L = cloudsLayout();
    const [x, y, w, h] = CHAIN_HIT;
    assert.equal(x, -w / 2);
    assert.ok(w >= 100, 'a thumb-wide target on a phone');
    // The handle hangs at frame y ~440-475; the arrow's centre is 540 below the chain's top.
    assert.ok(y <= 440 && y + h >= 475, 'the handle');
    assert.ok(y + h >= 600, 'the arrow');
    assert.ok(L.chain.top + y + h < L.terraces[0].y, 'stays above the first cloud');
  });

  it('runClouds shows the instruction with the arrow, pokes bring it at once, and the pull clears it', () => {
    assert.match(feature, /if \(ms >= 0 && !hinted\) \{\s+hinted = true;\s+instruction\(LINES\.pullChain\);/);
    assert.match(feature, /window\.addEventListener\('pointerdown', onPoke, true\);/);
    assert.match(feature, /window\.removeEventListener\('pointerdown', onPoke, true\);/);
    assert.match(feature, /if \(arrow\) arrow\.visible = false;\s+clearInstruction\(\);/);
  });
});
