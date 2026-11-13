/**
 * Panels on a phone held sideways (the landscape audit, 2026-11-13; Austin: phones play both ways up).
 * The rules live in style.css's LANDSCAPE-PANELS block, and only a phone (html.touch-phone) wider than
 * tall and under 500 px tall matches them, so a computer and an upright phone keep their panels.
 * Run: node --test tests/landscape-panels.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

/** The LANDSCAPE-PANELS block of style.css. */
function landBlock() {
  const at = css.indexOf('/* === LANDSCAPE-PANELS (land2) === */');
  const end = css.indexOf('/* === end LANDSCAPE-PANELS === */');
  assert.ok(at > 0 && end > at, 'the LANDSCAPE-PANELS block is in style.css');
  return css.slice(at, end);
}

/** The body of the @media rule that holds `marker` (a comment inside the block, before the rule). */
function sidewaysRule(marker) {
  const block = landBlock();
  const at = block.indexOf(marker);
  assert.ok(at >= 0, `${marker} is in the block`);
  const media = block.indexOf('@media (max-height: 500px) and (orientation: landscape) {', at);
  assert.ok(media > at, `${marker}: a sideways short-screen rule follows it`);
  let depth = 0;
  for (let i = block.indexOf('{', media); i < block.length; i += 1) {
    if (block[i] === '{') depth += 1;
    else if (block[i] === '}') {
      depth -= 1;
      if (!depth) return block.slice(media, i + 1);
    }
  }
  throw new Error(`${marker}: the rule never closes`);
}

describe('compact sheets sideways (#2)', () => {
  const rule = sidewaysRule('/* COMPACT SHEETS (#2)');
  it('is for a phone only, in Modern', () => {
    for (const line of rule.split('\n').filter((l) => l.includes('{') && !l.startsWith('@media'))) {
      assert.match(line, /^\s*:root\.touch-phone\[data-ui="modern"\] #game-root /, line);
    }
  });
  it('puts the header in one grid row, the list in the one stretching row, and drops the footer', () => {
    assert.match(rule, /> \.ui-sheet-card \{\s*display: grid;\s*grid-template-columns: auto minmax\(0, 1fr\) auto auto;\s*grid-template-rows: auto auto auto minmax\(0, 1fr\) auto;/);
    assert.match(rule, /> \.ui-sheet-card > \.ui-sheet-head \{ display: contents; \}/);
    assert.match(rule, /> \.ui-sheet-card > \.ui-sheet-head > \* \{ grid-row: 1;/);
    assert.match(rule, /> \.ui-sheet-card > \.ui-sheet-body \{ grid-row: 4; align-self: stretch; \}/);
    assert.match(rule, /> \.ui-sheet-card > \.ui-sheet-foot \{ display: none; \}/);
  });
  it('shares the title row with Quests\' tabs and the Make and badge searches', () => {
    assert.match(rule, /#quest-panel > \.ui-sheet-card > #quest-tabs \{ grid-row: 1; grid-column: 2 \/ 4;/);
    assert.match(rule, /#make-panel \.make-search-row > \.make-search \{ grid-row: 1; grid-column: 2 \/ 4;/);
    assert.match(rule, /#achieve-panel \.badge-browser-tools > \.badge-search \{ grid-row: 1; grid-column: 2 \/ 4;/);
  });
  it('widens the sheet sideways up to 440 px, leaving the pack row room beside it', () => {
    assert.match(rule, /width: clamp\(320px, 100% - 310px - env\(safe-area-inset-left, 0px\), 440px\);/);
  });
  it('keeps the close button a 44 px thumb target (TOUCH PANELS)', () => {
    assert.doesNotMatch(rule, /\.ui-sheet-x[^{]*\{[^}]*(min-)?(width|height): (?!44)\d+px/);
  });
});

describe('Imagination upgrade cards sideways (#3)', () => {
  const rule = sidewaysRule('/* UPGRADES SIDEWAYS (#3)');
  it('runs the window from under the top bar to the floor, title row shared with the tabs', () => {
    assert.match(rule, /#imagination-panel\.ui-sheet-center \{ bottom: 0; align-items: flex-start; padding-top: calc\(var\(--hud-h\) \+ 4px\);/);
    assert.match(rule, /#imagination-panel \.img-card-shell > \.img-head \{ display: contents; \}/);
    assert.match(rule, /#imagination-panel \.img-card-shell > \.img-tabs \{ grid-row: 1; grid-column: 2;/);
  });
  it('deals the three cards side by side, each as tall as the room left, in their own shape', () => {
    assert.match(rule, /#imagination-panel \.img-hand \{ flex-wrap: nowrap;/);
    assert.match(rule, /#imagination-panel \.img-card \{ --h: clamp\(120px, 100dvh - var\(--hud-h\) - 112px, 279px\); --w: calc\(var\(--h\) \* 207 \/ 279\);/);
  });
});
