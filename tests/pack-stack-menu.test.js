/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit item 2): a right-click (Ctrl+click on a Mac) on
 * a pack stack or a tool, in the row or a bag's tray, and the Menu key or Shift+F10 with it focused,
 * open the stack's own menu (renderPackPopover, the one a left click opens), as a bag's right-click
 * opens its Options. A left click and Shift+click are unchanged, a long press on touch still lifts
 * the stack to drag, the slot whose menu is open opens it again rather than closing it, and opening
 * it never cancels the running verb (R9: a row picked in it does, as the left click did).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

function fnSource(name) {
  const at = game.indexOf(`\nfunction ${name}(`);
  assert.ok(at >= 0, name);
  return game.slice(at, game.indexOf('\n}\n', at) + 2);
}

describe('a stack\'s menu from a right-click or the menu keys', () => {
  const row = fnSource('renderPackRow');
  const stackBlock = row.slice(row.indexOf('    } else {\n      // RIGHTCLICK'), row.indexOf('    if (canDragToVendor || inLayout) {'));
  const open = fnSource('openPackStackMenu');

  it('every slot that is not a bag (stacks and tools, row and tray: one renderPackRow) gets it', () => {
    assert.ok(stackBlock.length > 200);
    assert.match(stackBlock, /slot\.addEventListener\('contextmenu', \(event\) => \{/);
    assert.match(stackBlock, /event\.preventDefault\(\);/);
    assert.match(stackBlock, /openPackStackMenu\(s, slot, \{ swallowClick: event\.ctrlKey === true && event\.button === 0 \}\)/);
    assert.match(stackBlock, /slot\.addEventListener\('keydown', \(event\) => \{\n\s+if \(!isMenuKey\(event\)\) return;[\s\S]*openPackStackMenu\(s, slot, \{ keys: true \}\)/);
    assert.match(stackBlock, /slot\.setAttribute\('aria-keyshortcuts', 'Shift\+F10'\)/);
    // The tool row and the bag tray draw their slots with renderPackRow too.
    assert.match(fnSource('renderOpenBagRow'), /renderPackRow\(tray\.slots, entries, rowOpts\)/);
  });

  it('a long press on touch stays the lift-and-drag', () => {
    assert.match(stackBlock, /if \(event\.pointerType === 'touch' \|\| event\.pointerType === 'pen'\) return;/);
    assert.match(fnSource('setupPackDrops'), /bar\.addEventListener\('contextmenu', \(event\) => \{ if \(touch\) event\.preventDefault\(\); \}\);/);
  });

  it('opens the left click\'s popover on that slot, fresh, and never closes it', () => {
    assert.match(open, /renderPackPopover\(s\.classTsid, slot\);/);
    assert.doesNotMatch(open, /closePackPopover\(\)/, 'a right-click on the open stack opens it again');
    assert.match(open, /packDropMode = false;[\s\S]*packEatMode = false;/);
    assert.match(open, /if \(keys && MODERN_UI\) focusVerbRow\(document\.getElementById\('pack-popover'\)\);/);
    // The echo guard: the contextmenu the Menu key sends after its keydown opened it.
    assert.match(stackBlock, /if \(Date\.now\(\) < packMenuEchoUntil && isPackPopoverOpen\(\) && packSelected === s\.classTsid/);
  });

  it('the left click and Shift+click are unchanged; a Mac Ctrl+click\'s click is swallowed', () => {
    assert.match(row, /if \(Date\.now\(\) < packMenuSwallowClickUntil\) \{\n\s+packMenuSwallowClickUntil = 0;\n\s+event\.preventDefault\(\);\n\s+return;/);
    assert.match(row, /if \(currentAction\) cancelCurrentAction\(\{ quiet: true \}\);\n\s+\/\/ G152: clicking a bag opens or closes it/);
    assert.match(row, /if \(event\.shiftKey && !\(s\.isTool \|\| opts\.toolRow\) && getPackUseInfo\(s\.classTsid\)\.usable\) \{/);
    assert.match(row, /if \(packSelected === s\.classTsid && isPackPopoverOpen\(\) && samePlace\) closePackPopover\(\);/);
  });

  it('R9: opening never cancels the running verb; a row picked in it does', () => {
    assert.doesNotMatch(open, /cancelCurrentAction/);
    assert.doesNotMatch(fnSource('openPackBagOptions'), /cancelCurrentAction/, 'a bag\'s Options too');
    assert.match(game, /document\.getElementById\('pack-popover'\)\?\.addEventListener\('click', \(e\) => \{\n\s+const row = e\.target\?\.closest\?\.\('\.vm-row'\);\n\s+if \(!row \|\| !currentAction \|\| row\.getAttribute\('aria-disabled'\) === 'true' \|\| row\.hasAttribute\('data-vm-back'\)\) return;\n\s+cancelCurrentAction\(\{ quiet: true \}\);\n\s+\}, true\);/);
  });

  it('QA: canvas data contextMenu pack:<class> while the menu a right-click opened is up', () => {
    assert.match(open, /app\.canvas\.dataset\.contextMenu = isPackPopoverOpen\(\) \? `pack:\$\{s\.classTsid\}` : ''/);
    assert.match(fnSource('closePackPopover'), /contextMenu\?\.startsWith\('pack:'\)\) app\.canvas\.dataset\.contextMenu = ''/);
  });
});
