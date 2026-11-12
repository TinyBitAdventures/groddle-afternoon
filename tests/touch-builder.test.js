/**
 * TOUCH BUILDER: the character builder on a phone keeps its preview, Random, Reset and Save in view
 * while the wardrobe scrolls (Austin 2026-11-12, iPhone: "User can't hit random and see what's
 * happening. They have to scroll up to see the random results").
 * Run: node --test tests/touch-builder.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');
const classic = readFileSync(join(root, 'public/css/classic.css'), 'utf8');
const block = css.slice(css.indexOf('/* —— TOUCH BUILDER ——'), css.indexOf('/* —— end TOUCH BUILDER —— */'));

describe('the builder on a phone', () => {
  it('game.js gathers the preview, its emotes and the actions into one box, on a phone only', () => {
    assert.match(game, /if \(TOUCH_PHONE && canvas && layout && actions\) \{\s*const stage = document\.createElement\('div'\);\s*stage\.className = 'avatar-stage';\s*layout\.before\(stage\);\s*stage\.append\(canvas, \.\.\.panel\.querySelectorAll\('\.avatar-emotes'\), actions\);/);
  });
  it('the head and that box stick while the wardrobe scrolls (Modern, a phone)', () => {
    assert.ok(block.length > 200);
    assert.match(block, /:root\.touch-phone\[data-ui="modern"\] #avatar-panel \.glitch-modal-head \{\s*position: sticky; top: 0;/);
    assert.match(block, /:root\.touch-phone\[data-ui="modern"\] #avatar-panel \.avatar-stage \{\s*position: sticky; top: 48px;/);
    assert.match(block, /height: 48px;/);
    // Sideways: two panes, the box down the left.
    assert.match(block, /@media \(orientation: landscape\) \{[\s\S]*grid-template-columns: 148px minmax\(0, 1fr\)[\s\S]*\.avatar-stage \{\s*grid-column: 1; grid-row: 1 \/ span 40; align-self: start; top: 0;/);
    // The pack and the tutorial pill wait while it is open.
    assert.match(block, /:has\(#avatar-panel:not\(\[hidden\]\)\) \.pack-bar \{ visibility: hidden; \}/);
    assert.match(block, /:has\(#avatar-panel:not\(\[hidden\]\)\) #newxp-pill \{ visibility: hidden; \}/);
    // Every rule is the phone's and Modern's.
    for (const line of block.split('\n')) if (/^\s*:root/.test(line)) assert.match(line, /^\s*:root\.touch-phone\[data-ui="modern"\]/, line);
  });
  it('Classic gives the box\'s children back to its Vanity grid', () => {
    assert.match(classic, /:root\[data-ui="classic"\] #avatar-panel \.avatar-stage \{ display: contents; \}/);
  });
});
