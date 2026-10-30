/**
 * Phase 2 (lane PACK): the modern pack is the HUD mock's one-row pack (js/ui/pack-row.js, game.js
 * renderPackBar). One centred floating row: the bags with fill bars, a divider, the stacks (items, then
 * tools), one ghost slot "+N" for the free slots, a pager only when it overflows, the slot count and
 * search (the client's Inventory Search: Shift+F and backquote, TSMainView.as 654-655). The open bag is
 * a tray over the row by its bag, with the same click, Shift-click and drags as the row.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTokens } from './css-tokens.js';
import {
  PACK_HELP,
  PACK_SEARCH_LABEL,
  packBandRange,
  packCountText,
  packTipPlacement,
  packSearchEntries,
  packSearchMatch,
  packSlotTip,
  trayColumns,
} from '../public/js/ui/pack-row.js?v=g467-5';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('pack row: the pure parts', () => {
  it('a tray is 4 to 8 columns wide', () => {
    assert.deepEqual([0, 1, 4, 6, 8, 9, 16].map(trayColumns), [4, 4, 4, 6, 8, 8, 8]);
  });

  it('search matches a part of the name, any case, and nothing for an empty query', () => {
    assert.equal(packSearchMatch('Bubble Tuning Gun', 'tun'), true);
    assert.equal(packSearchMatch('Bubble Tuning Gun', '  BUBBLE  tun '), true);
    assert.equal(packSearchMatch('Cherry', ''), false);
    assert.equal(packSearchMatch('Cherry', '   '), false);
    const found = packSearchEntries([{ label: 'Cherry' }, { label: 'Plain Bubble', inBag: { label: 'Bigger Bag' } }, { label: 'Pick' }], 'b');
    assert.deepEqual(found.map((e) => e.label), ['Plain Bubble']);
    assert.deepEqual(packSearchEntries([{ label: 'x', cls: 'apple' }], 'apple', (e) => e.cls).length, 1);
  });

  it('what floats over the row stays inside the band\'s insets (a drawer\'s --inset-r)', () => {
    const band = { getBoundingClientRect: () => ({ width: 1024 }) };
    const was = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({ paddingLeft: '8px', paddingRight: '316px' });
    try {
      assert.deepEqual(packBandRange(band, 300), { min: 8, max: 408 });
      assert.deepEqual(packBandRange(band, 900), { min: 8, max: 8 });
    } finally { globalThis.getComputedStyle = was; }
    const view = read('public/js/ui/pack-row.js');
    assert.match(view, /left = Math\.max\(range\.min, Math\.min\(left, range\.max\)\);/);
    assert.match(read('public/game.js'), /const range = packBandRange\(bar, popWidth\);\s+const left = clamp\(anchorCenter - popWidth \/ 2, range\.min, range\.max\);/);
  });

  it('with a tray open, the open bag shows no tip and tips near the tray go above it', () => {
    const tray = { left: 100, right: 484, top: -112 };
    assert.deepEqual(packTipPlacement({ anchor: { left: 120, width: 40, top: 6 }, tipWidth: 200, min: 8, max: 900, tray, openBag: true }), { hide: true });
    // A tray stack: above the tray, not over its head.
    assert.deepEqual(packTipPlacement({ anchor: { left: 140, width: 44, top: -70 }, tipWidth: 160, min: 8, max: 900, tray, inTray: true }), { left: 82, floor: -112 });
    // A row stack under the tray: above the tray too.
    assert.equal(packTipPlacement({ anchor: { left: 300, width: 44, top: 6 }, tipWidth: 160, min: 8, max: 900, tray }).floor, -112);
    // A row stack clear of the tray: over its own slot.
    assert.equal(packTipPlacement({ anchor: { left: 700, width: 44, top: 6 }, tipWidth: 160, min: 8, max: 900, tray }).floor, 6);
    // No tray: over its own slot.
    assert.deepEqual(packTipPlacement({ anchor: { left: 300, width: 44, top: 6 }, tipWidth: 160, min: 8, max: 900 }), { left: 242, floor: 6 });
  });

  it('the count says the pack slots and what the bags still hold', () => {
    assert.deepEqual(packCountText({ used: 10, capacity: 16, bags: 4, bagFree: 16 }), { text: '10/16', label: '10 of 16 pack slots used, your bags hold 16 more' });
    assert.deepEqual(packCountText({ used: 3, capacity: 16 }), { text: '3/16', label: '3 of 16 pack slots used' });
  });

  it('the tooltip carries the old hint: click for actions, Shift-click to quick use', () => {
    assert.deepEqual(packSlotTip({ label: 'Cherry', count: 20, quickVerb: 'Eat' }), { title: 'Cherry x20', sub: 'Click for actions · Shift-click to eat' });
    assert.deepEqual(packSlotTip({ label: 'Pick', count: 1, tool: true, quickVerb: 'Eat' }), { title: 'Pick', sub: 'Click for actions' });
    assert.deepEqual(packSlotTip({ label: 'Potato', count: 7, quickVerb: 'Eat', inBag: 'Bigger Bag' }), { title: 'Potato x7', sub: 'In Bigger Bag · Click for actions · Shift-click to eat' });
    assert.deepEqual(packSlotTip({ bag: { label: 'Bigger Bag', used: 8, capacity: 16, open: false } }), { title: 'Bigger Bag', sub: '8 of 16 slots · Click to open' });
    for (const s of [PACK_HELP, PACK_SEARCH_LABEL]) assert.doesNotMatch(s, /—/);
  });
});

describe('pack row: the page', () => {
  const html = read('public/play/index.html');
  const online = read('public/play/online/index.html');
  const bar = html.slice(html.indexOf('<div class="pack-bar" id="pack-bar">'), html.indexOf('<!-- Full-screen street load'));

  it('one row in the mock\'s order: bags, divider, stacks, pager, count, search', () => {
    const order = ['id="pack-row"', 'id="pack-bags"', 'class="pack-vsep"', 'id="pack-items"', 'id="pack-pager"', 'id="pack-count"', 'id="pack-search"', 'id="pack-search-btn"'];
    let at = -1;
    for (const id of order) {
      const next = bar.indexOf(id);
      assert.ok(next > at, `${id} after the one before`);
      at = next;
    }
    assert.doesNotMatch(bar, /pack-tools|pack-rows|pack-row-shell/, 'no second row');
    assert.match(bar, /<input id="pack-search-input" type="text" placeholder="Search pack and bags" aria-label="Search pack and bags"/);
    assert.match(bar, /aria-keyshortcuts="Shift\+F `"/);
    // The old hint stays for screen readers and the save pill's place (online-boot mountSavePill).
    assert.match(bar, /<p class="pack-hint visually-hidden" id="pack-hint">Click for actions<br\/>Shift-click to quick use<\/p>/);
    assert.match(bar, /id="pack-popover"/);
    assert.match(bar, /id="pack-tip" role="tooltip" hidden/);
    // The online page is the same pack.
    assert.ok(online.includes(bar.slice(0, 400)));
  });

  it('the row floats over the world: the band lets clicks through, the row and tray take them', () => {
    const css = resolveTokens(read('public/style.css'));
    const block = css.slice(css.indexOf('/* —— PACK —— */'), css.indexOf('.pack-popover {'));
    assert.match(block, /\n\.pack-bar \{[^}]*justify-content: center;[^}]*pointer-events: none;/);
    assert.match(block, /\n\.pack-row \{[^}]*height: 56px;[^}]*max-width: 100%;[^}]*pointer-events: auto;/);
    assert.match(block, /\n\.pack-bag-row \{[^}]*position: absolute;[^}]*bottom: calc\(100% \+ 8px\);[^}]*pointer-events: auto;/);
    assert.match(block, /\.pack-slots \.pack-slot\.is-single \.count \{ display: none; \}/);
    assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.pack-bag-row \{ animation: none; \}/);
    // The Social drawer (js/ui/social-drawer.js) or a sheet narrows the band (--inset-l / --inset-r on #game-root).
    assert.match(block, /padding: 0 max\(var\(--pack-inset\), var\(--inset-r, 0px\)\) var\(--pack-inset\) max\(var\(--pack-inset\), var\(--inset-l, 0px\)\);/);
  });
});

describe('pack row: game.js wiring', () => {
  const game = read('public/game.js');
  const bar = game.slice(game.indexOf('function renderPackBar() {'), game.indexOf('/** G255: the quest log markup'));

  it('updateHud draws the pack through renderPackBar: bags apart, items then tools, one ghost', () => {
    assert.match(game, /\n  renderPackBar\(\);\n  if \(packSelected\) renderPackPopover\(packSelected\);/);
    assert.match(bar, /if \(slot\.kind === 'bag'\) bagRow\.push\(entry\);\s+else \(entry\.isTool \? toolRow : itemRow\)\.push\(entry\);/);
    assert.match(bar, /emptyCount: packLayout\.free, fillEmpty: true, ghost: true, container: 'pack'/);
  });

  it('search finds stacks inside every bag, marked with the bag', () => {
    assert.match(bar, /for \(const box of Object\.values\(packLayout\.bags\)\) \{[\s\S]*?inBag: \{ cls: box\.cls, label: box\.label \}/);
    assert.match(bar, /if \(!hits\.length\) packRow\.markNoMatches\(itemsBox, query\);/);
    assert.match(read('public/js/ui/pack-row.js'), /none\.textContent = `Nothing called "\$\{q\}"`;/);
    assert.match(game, /onQuery: \(\) => renderPackBar\(\),/);
  });

  it('Shift+F and backquote open the search without typing themselves, not while the pack is hidden', () => {
    const fn = game.slice(game.indexOf('function clientShortcutKey(e) {'), game.indexOf("if (action === 'player-menu')"));
    assert.match(fn, /action === 'pack-search'[\s\S]*nx-hide-pack[\s\S]*e\.preventDefault\(\);[\s\S]*packRow\.openSearch\(\);/);
    const view = read('public/js/ui/pack-row.js');
    assert.match(view, /if \(e\.key === 'Escape'\) \{\s+e\.preventDefault\(\);\s+e\.stopPropagation\(\);\s+closeSearch\(\);/);
  });

  it('the tray closes with Escape, a click elsewhere or its close; a stack\'s card sits over the tray', () => {
    assert.match(game, /if \(closePackTray\(\{ focusBag: Boolean\(document\.activeElement\?\.closest\?\.\('#pack-bar'\)\) \}\)\) return;/);
    assert.match(game, /if \(features\.query\('packOpenBag'\) && !e\.target\?\.closest\?\.\('#pack-bag, #pack-popover, \.pack-slot, \.verb-menu'\)\) closePackTray\(\);/);
    assert.match(game, /const tray = anchor\.closest\?\.\('#pack-bag'\);\s+const floor = tray \? tray\.getBoundingClientRect\(\)\.top : barRect\.top;/);
    // The bag's Options (the client's opener strip) are in the tray's head.
    assert.match(game, /optionsLabel: PACK_COPY\.options,/);
    assert.match(read('public/js/ui/pack-row.js'), /button\('pack-bag-options', 'options', `\$\{bag\.optionsLabel\} for \$\{bag\.label\}`/);
  });
});
