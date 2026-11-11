/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit later batch item 7): a storage window's slot
 * (the cabinets, the Storage Display Box: js/ui/storage-windows.js) opens its Take out row on a
 * right-click, Shift+F10 or the Menu key, the same as a click (and never closes it); a vendor tile
 * opens a menu of the count chooser's own buttons: Buy... (the click), Buy 1 and Buy max (Sell...,
 * Sell 1, Sell max on the Sell tab), greyed with the vendor's words when you can't afford one.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { page } from './social-fake-dom.js';
import { openCabinetWindow, closeStorageWindow } from '../public/js/ui/storage-windows.js?fresh=storage-vendor-menu';

const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');

describe('a storage slot\'s right-click (js/ui/storage-windows.js)', () => {
  const saved = {};
  let h;
  let t;
  before(() => {
    for (const k of ['document', 'setTimeout']) saved[k] = globalThis[k];
    t = page();
    globalThis.document = t.doc;
    globalThis.setTimeout = (fn) => { fn(); return 0; };
    h = openCabinetWindow({
      title: 'Cabinet',
      cols: 4,
      rowsDisplay: 2,
      slots: [{ classTsid: 'apple', count: 3 }, null, { classTsid: 'cherry', count: 1 }, null],
      item: (cls) => ({ label: cls === 'apple' ? 'Apple' : 'Cherry', icon: '' }),
      accepts: () => null,
      put: () => {},
      take: () => {},
      move: () => {},
    });
  });
  after(() => {
    try { closeStorageWindow(); } catch { /* the fake DOM's elements have no remove() */ }
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });

  const slot = (i) => h.root.querySelector(`[data-hst-slot="${i}"]`);
  const pickRow = () => h.root.querySelector('[data-hst-pickrow]');

  it('a full slot is ours ([data-ctx], Shift+F10); an empty one is not', () => {
    assert.equal(slot(0).getAttribute('data-ctx'), 'storage');
    assert.equal(slot(0).getAttribute('aria-keyshortcuts'), 'Shift+F10');
    assert.equal(slot(1).getAttribute('data-ctx'), null);
  });

  it('a right-click on a full slot opens its Take out row, as a click does; again, it stays open', () => {
    const e = slot(0).dispatch('contextmenu', { clientX: 400, clientY: 300, button: 2 });
    assert.equal(e.defaultPrevented, true);
    assert.equal(pickRow().hidden, false);
    assert.equal(h.root.dataset.hstPicked, '0');
    assert.ok(pickRow().querySelector('[data-hst-take]'));
    slot(0).dispatch('contextmenu', { clientX: 400, clientY: 300, button: 2 });
    assert.equal(h.root.dataset.hstPicked, '0', 'a right-click never closes it');
  });

  it('Shift+F10 on a focused slot opens it too; an empty slot opens nothing (no browser menu stop either)', () => {
    const k = slot(2).dispatch('keydown', { key: 'F10', shiftKey: true });
    assert.equal(k.defaultPrevented, true);
    assert.equal(h.root.dataset.hstPicked, '2');
    const e = slot(1).dispatch('contextmenu', { clientX: 1, clientY: 1, button: 2 });
    assert.equal(e.defaultPrevented, false);
    assert.equal(h.root.dataset.hstPicked, '2');
  });
});

describe('a vendor tile\'s menu (game.js openVendorTileMenu)', () => {
  const fn = game.slice(game.indexOf('function openVendorTileMenu('), game.indexOf('/** The shelf: what this vendor sells'));
  it('rows: Buy... (the click), Buy 1, Buy max; Sell... on the Sell tab', () => {
    assert.match(fn, /const verb = isBuy \? 'Buy' : 'Sell';/);
    assert.match(fn, /\{ id: 'choose', label: `\$\{verb\}…`/);
    assert.match(fn, /\{ id: 'one', label: `\$\{verb\} 1`/);
    assert.match(fn, /\{ id: 'max', label: `\$\{verb\} max`/);
  });

  it('greyed with the vendor\'s own refusal when you can\'t afford one', () => {
    // G318: the store's own refusal (players/inc_stores.js 161), the same words as vendorBuy's.
    assert.ok(fn.includes(`if (unit > (pc.currants || 0)) reason = "Sorry, you can't afford that.";`));
    assert.ok(readFileSync(new URL('../public/js/vendor.js', import.meta.url), 'utf8').includes(`msgs: ["Sorry, you can't afford that."]`));
  });

  it('a pick is the tile\'s click, then the count chooser\'s own Buy button (Max first for Buy max)', () => {
    assert.match(fn, /vendorSelected = cls;\n\s+vendorToolCopy = null;\n\s+vendorSellPlace = null;\n\s+vendorSellBag = '';\n\s+vendorQty = id === 'max' \? Number\.MAX_SAFE_INTEGER : 1;\n\s+renderVendorList\(\);\n\s+if \(id === 'choose'\) return;\n\s+document\.querySelector\('#vendor-detail \[data-v-go\]'\)\?\.click\(\);/);
  });

  it('wired once on the shelf (right-click, long press, the keys); tiles say so; closing the vendor closes it', () => {
    assert.match(game, /bindContextTrigger\(document\.getElementById\('vendor-list'\), \{[\s\S]{0,400}open: \(tile, \{ at, keys \}\) => openVendorTileMenu\(tile, \{ at, keys \}\),\n\s+longPress: true,/);
    assert.match(game, /function markVendorTile\(tile, words\) \{\n\s+tile\.dataset\.ctx = 'vendor';\n\s+tile\.setAttribute\('aria-keyshortcuts', 'Shift\+F10'\);\n\s+tile\.setAttribute\('aria-label', `\$\{words\}\. \$\{MORE_KEYS_LABEL\}`\);/);
    assert.equal((game.match(/markVendorTile\(tile, `/g) || []).length, 2, 'both tabs');
    assert.match(game, /function closeVendor\(\) \{\n\s+closePackPopover\(\);\n\s+if \(vendorCtxMenu\?\.isOpen\(\)\) vendorCtxMenu\.close\(\{ focus: false \}\);/);
    assert.match(fn, /owner: `vendor:\$\{cls\}`/);
  });
});
