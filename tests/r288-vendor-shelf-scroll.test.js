/**
 * Report #288 (Classic, the Produce Vendor's Sell tab): "The Sell screen jumps back to the top after
 * each sell." Classic hides the shelf for the count chooser and draws it again after the sale, and the
 * sheet's body scrolled back to the top. js/ui/scroll-keep.js remembers the place by vendor and tab;
 * game.js renderVendorList takes it while the shelf shows and puts it back after each redraw.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScrollKeep } from '../public/js/ui/scroll-keep.js?v=2898b5b1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

describe('report #288: the vendor shelf keeps its scroll', () => {
  it('puts the scroll back under the same key only', () => {
    const keep = createScrollKeep();
    const list = { scrollTop: 0 };
    const body = { scrollTop: 464 };
    keep.take('produce:sell', [list, body]);
    body.scrollTop = 0; // the shelf hidden for the count, then drawn again
    assert.equal(keep.restore('produce:buy', [list, body]), false);
    assert.equal(body.scrollTop, 0);
    assert.equal(keep.restore('produce:sell', [list, body]), true);
    assert.equal(body.scrollTop, 464);
    assert.equal(list.scrollTop, 0);
    keep.clear();
    body.scrollTop = 0;
    assert.equal(keep.restore('produce:sell', [list, body]), false);
    assert.equal(body.scrollTop, 0);
  });

  it('a missing node is skipped, never thrown on', () => {
    const keep = createScrollKeep();
    keep.take('k', [null, { scrollTop: 20 }]);
    const body = { scrollTop: 0 };
    assert.equal(keep.restore('k', [null, body]), true);
    assert.equal(body.scrollTop, 20);
    assert.deepEqual(keep.peek(), { key: 'k', tops: [0, 20] });
  });

  it('renderVendorList takes the place while the shelf shows and restores it after every shelf redraw', () => {
    const fn = game.slice(game.indexOf('function renderVendorList() {'), game.indexOf('/** Space kept under a vendor pop'));
    assert.match(fn, /const shelfScrollers = \[list, list\.closest\('\.vendor-body'\)\];/);
    assert.match(fn, /if \(!list\.hidden && list\.dataset\.shelf\) vendorShelfScroll\.take\(list\.dataset\.shelf, shelfScrollers\);/);
    assert.equal((fn.match(/vendorShelfScroll\.restore\(shelfKey, shelfScrollers\);/g) || []).length, 2, 'both the pop and the shelf paths');
    // The tile sold from has the focus again, as after a buy.
    assert.match(fn, /if \(soldFrom\) list\.querySelector\(`\[data-vendor-item="\$\{CSS\.escape\(soldFrom\)\}"\]`\)\?\.focus\(\{ preventScroll: true \}\);/);
    assert.match(game, /function drawVendorTiles\(list\) \{\n  list\.hidden = false;\n  list\.innerHTML = '';\n[^\n]*\n  list\.dataset\.shelf = `\$\{activeVendor\.key\}:\$\{vendorTab\}`;/);
  });

  it('closing the vendor forgets the place', () => {
    const fn = game.slice(game.indexOf('function closeVendor() {'), game.indexOf('function syncVendorTabs'));
    assert.match(fn, /vendorShelfScroll\.clear\(\);/);
  });
});
