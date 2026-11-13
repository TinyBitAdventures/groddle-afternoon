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

// #274 (Friendly, iPhone): a touch screen keeps :hover on the row a finger last touched, so the open
// letter's light colour jumped from row to row as the list scrolled. The colour follows .is-selected;
// the hover colour only where a pointer can hover.
describe('#274 Mail: the open letter keeps its colour while the list scrolls on a touch screen', () => {
  const hoverBlocks = [...css.matchAll(/@media \(hover: hover\) \{([^@]*?\}\s*)\}/g)].map((m) => m[1]);

  it('no :hover on a mail row outside a (hover: hover) query', () => {
    const outside = css.replace(/@media \(hover: hover\) \{[^@]*?\}\s*\}/g, '');
    assert.doesNotMatch(outside, /\.mail-row:hover/);
  });

  it('the open letter is coloured by .is-selected in both looks, and hover keeps its colour on a computer', () => {
    assert.match(css, /\n\.mail-row\.is-selected \{\s*background: var\(--surface-card\);/);
    assert.match(css, /\[data-ui="modern"\] #mail-panel \.mail-row\.is-selected \{ background: var\(--surface-raised\); \}/);
    assert.ok(hoverBlocks.some((b) => /\.mail-row:hover \{ background: var\(--surface-card\); \}/.test(b)));
    assert.ok(hoverBlocks.some((b) => /#mail-panel \.mail-row:hover \{ background: var\(--surface-raised\); \}/.test(b)));
  });
});

// #270 (Friendly): "if the map panel could be changed to take up most of the screen in mobile". The Map
// stood between the top bar, the Social rail and the pack row; on a phone it takes the whole width and
// runs to the screen's foot, and game.js fitMapCanvas draws the map as large as that box allows.
describe('#270 the Map on a phone', () => {
  const rule = block(':root.touch-phone[data-ui="modern"] #game-root #map-panel.ui-sheet-center {');

  it('the panel runs to the foot of the screen, over the Social rail, with a small gutter', () => {
    assert.match(rule, /bottom: 0;/);
    assert.match(rule, /z-index: var\(--z-dialog\);/);
    assert.match(rule, /padding: calc\(var\(--hud-h\) \+ var\(--sp-3\)\) var\(--sp-2\) var\(--sp-4\);/);
  });

  it('the pack row, stick and Jump wait under it', () => {
    assert.match(css, /:root\.touch-phone\[data-ui="modern"\]:has\(#map-panel:not\(\[hidden\]\)\) :is\(\.pack-bar, \.touch-controls\) \{ visibility: hidden; \}/);
  });

  it('a computer keeps the room between the bar, the rail and the pack', () => {
    assert.match(css, /\n\[data-ui="modern"\] #map-panel\.ui-sheet-center \{\s*padding: calc\(var\(--hud-h\) \+ 6px\) max\(var\(--hud-inset\), var\(--inset-r, 0px\)\) 0/);
  });
});
