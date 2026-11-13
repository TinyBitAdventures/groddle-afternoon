/**
 * Panels on an upright phone (Friendly's [Mobile] reports, 2026-11-13, iPhone Safari at 402 x 660):
 * each case reads the CSS that makes a window fit the phone and checks its sums.
 * Run: node --test tests/phone-panels-fit.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const css = readFileSync(join(pub, 'style.css'), 'utf8');
const block = (start) => {
  const at = css.indexOf(start);
  assert.ok(at >= 0, `${start} is in style.css`);
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1);
  }
  return '';
};

// #268: the Make window's stage (ingredients, the machine, the output) needed 70 + 118 + 70 px and
// more, but a phone's progress box holds 252 px, so it sat right of centre and the output ran off.
describe('#268 the Make stage on a phone', () => {
  const q = block('@container make-progress (max-width: 280px)');

  it('the progress box is the query container, and desktop keeps its columns', () => {
    assert.match(css, /\.make-progress \{\s*\/\*[^*]*\*\/\s*container: make-progress \/ inline-size;/);
    assert.match(css, /\.make-progress \.mp-stage \{[^}]*grid-template-columns: minmax\(70px, 1fr\) 118px minmax\(70px, 1fr\);/);
  });

  it('under 280 px the three parts fit a 252 px box, centred', () => {
    const tool = Number(q.match(/grid-template-columns: minmax\(0, 1fr\) (\d+)px minmax\(0, 1fr\)/)[1]);
    const scale = Number(q.match(/\.mp-tool-wrap \{ margin: -9px -10px; transform: scale\(([\d.]+)\); \}/)[1]);
    // The 112 x 104 machine box drawn at the scale, its margins taking it down to the column.
    assert.ok(112 * scale <= tool && 112 - 20 === tool, `${112 * scale} in ${tool}`);
    const gap = 4; // --sp-2
    const side = (252 - tool - 2 * gap) / 2;
    const out = Number(q.match(/\.mp-output \{ width: (\d+)px;/)[1]);
    // One ingredient (42 px) and the arrow (about 16 px at --fs-lg) with the output both fit a side.
    assert.ok(side >= 42 && side >= 16 + 2 + out, `side ${side}`);
  });
});
