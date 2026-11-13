/**
 * The Upgrades hand's cards on iOS (the mobile QA, 2026-11-12): WebKit flattened the flip, so every
 * card showed its back over its front, mirrored ("emiT nolfeT s'tI"). Each face also hides while it is
 * turned away, switching at the half turn, so no engine depends on backface-visibility alone.
 * Run: node --test tests/img-card-faces.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'public/js/features/imagination-feature.js'), 'utf8');

describe('the upgrade cards\' faces', () => {
  it('the face turned away is hidden, switching at the half turn', () => {
    assert.match(src, /\.img-card:not\(\.flipped\) \.img-back,\.img-card\.flipped \.img-front\{visibility:hidden\}/);
    const flip = Number(src.match(/\.img-card\{[^}]*transition:transform \.(\d+)s/)[1]) / 10;
    const at = Number(src.match(/\.img-face\{transition:visibility 0s linear \.(\d+)s\}/)[1]) / 100;
    assert.equal(at, flip / 2);
  });
});

// #265, #266 (Friendly, an upright iPhone): the third card wrapped under the first two and its Get
// Upgrade sat below the fold. Under 480 px the hand is one row of three cards, each a third of the row
// at the card's own shape, and the back keeps Get Upgrade in view.
describe('the hand on an upright phone', () => {
  const css = /const PANEL_CSS = `([\s\S]*?)`;/.exec(src)[1];
  const style = readFileSync(join(root, 'public/style.css'), 'utf8');
  const phone = css.slice(css.indexOf('/* #265, #266'));

  it('three cards stand in one row, a third of it each, at the desktop card\'s shape', () => {
    assert.match(phone, /\.img-hand\{flex-wrap:nowrap\}/);
    assert.match(phone, /\.img-card\{--w:calc\(\(100% - 2 \* var\(--sp-3\)\) \/ 3\);--h:auto;max-width:132px;aspect-ratio:207 \/ 279\}/);
    const [, w, h] = css.match(/\.img-card\{--w:(\d+)px;--h:(\d+)px;/);
    assert.deepEqual([w, h], ['207', '279']);
  });

  it('the Modern well spaces them by the same gap', () => {
    assert.match(style, /@media \(max-width: 480px\) \{\s*\[data-ui="modern"\] #imagination-panel \.img-hand \{ gap: var\(--sp-3\);/);
  });

  it('the back\'s words scroll while the title, Get Upgrade and the price keep their room', () => {
    assert.match(css, /\.img-back h3,\.img-back \.img-buy,\.img-back \.img-back-cost\{flex:none\}/);
    assert.match(css, /\.img-back \.img-back-words\{flex:1 1 auto;min-height:0;/);
    assert.match(phone, /\.img-back \.img-buy\{[^}]*font-size:var\(--fs-xs\)/);
  });
});
