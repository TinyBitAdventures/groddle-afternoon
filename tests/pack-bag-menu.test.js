/**
 * A bag's Options from its own pack slot (Austin 2026-11-03): right-click
 * (Ctrl+click on a Mac), or the Menu key or Shift+F10 with the slot focused,
 * opens the menu the open tray's "..." opens (Rename, Give, auctions, Drop and
 * the bag's description), in Modern and Classic (one pack bar, game.js
 * renderPackRow). A left click still opens the bag, a drag still moves a stack,
 * a long press on touch still lifts it. Other stacks' right-click opens their
 * own menu since RIGHTCLICK (tests/pack-stack-menu.test.js). Browser QA:
 * scratch bagmenu-qa/qa.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPinMenuKey } from '../public/js/ui/quest-pin-menu.js?v=361dad0c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

/** The source of one top-level function of game.js. */
function fnSource(name) {
  const at = game.indexOf(`\nfunction ${name}(`);
  assert.ok(at >= 0, name);
  const next = game.indexOf('\n}\n', at);
  return game.slice(at, next + 2);
}

describe('a bag slot opens its Options', () => {
  const row = fnSource('renderPackRow');
  const open = fnSource('openPackBagOptions');
  const bagBlock = row.slice(row.indexOf('    if (s.bag) {\n      // Austin 2026-11-03'), row.indexOf("    if (canDragToVendor || inLayout) {"));

  it('right-click and the menu keys are wired on bag slots only', () => {
    assert.ok(bagBlock.length > 100, 'the bag-only block is there');
    assert.match(bagBlock, /slot\.addEventListener\('contextmenu'/);
    assert.match(bagBlock, /event\.preventDefault\(\)/);
    assert.match(bagBlock, /slot\.addEventListener\('keydown'[\s\S]*isMenuKey\(event\)[\s\S]*openPackBagOptions\(s, slot, \{ keys: true \}\)/);
    // RIGHTCLICK: a stack's slot has its own listener (its menu), so two in all.
    assert.equal(row.split("addEventListener('contextmenu'").length - 1, 2);
  });

  it('a long press on touch still lifts the bag to drag, not a menu', () => {
    assert.match(bagBlock, /event\.pointerType === 'touch' \|\| event\.pointerType === 'pen'\) return;/);
    // The bar's own long press (setupPackDrops) is untouched: it lifts the slot after HOLD_MS.
    assert.match(fnSource('setupPackDrops'), /touch\.timer = setTimeout\(\(\) => \{[\s\S]*packDrag = \{/);
  });

  it('opens the same popover as the tray\'s Options, anchored to that bag', () => {
    assert.match(open, /renderPackPopover\(s\.classTsid, slot\)/);
    assert.match(fnSource('renderOpenBagRow'), /onOptions: \(\) => \{[\s\S]*renderPackPopover\(box\.cls, document\.querySelector\(`\.pack-slot\[data-pack-bag="\$\{box\.key\}"\]`\)\)/);
    // From the keys, the first row takes the focus (as Enter on any stack does).
    assert.match(open, /if \(keys && MODERN_UI\) focusVerbRow\(document\.getElementById\('pack-popover'\)\)/);
  });

  it('a left click still opens the bag, and a Mac Ctrl+click\'s click does not', () => {
    assert.match(row, /if \(Date\.now\(\) < packMenuSwallowClickUntil\) \{[\s\S]*?return;\n      \}/);
    assert.match(row, /if \(s\.bag && !event\.target\?\.closest\?\.\('\[data-pack-opener\]'\)\) \{[\s\S]*?features\.query\('packToggleBag', s\.bag\.key, engine\)/);
    assert.match(bagBlock, /swallowClick: event\.ctrlKey === true && event\.button === 0/);
  });

  it('the keys are the Menu key and Shift+F10 (no other modifier)', () => {
    assert.equal(isPinMenuKey({ key: 'ContextMenu' }), true);
    assert.equal(isPinMenuKey({ key: 'F10', shiftKey: true }), true);
    assert.equal(isPinMenuKey({ key: 'F10' }), false);
    assert.equal(isPinMenuKey({ key: 'F10', shiftKey: true, ctrlKey: true }), false);
    assert.equal(isPinMenuKey({ key: 'Enter' }), false);
  });
});
