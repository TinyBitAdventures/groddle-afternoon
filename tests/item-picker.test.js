/**
 * #141 one item picker (js/ui/item-picker.js) for the Auction House's Post a new auction, the Give
 * window (and its Wrap) and the Butler's package. Before: small wrapping pills in a 9.5rem box with
 * no search, and Give put the To list first and How many at the very bottom of an 82vh window.
 * Now: a search box, a tile grid (64 px tiles, 36 px icons, a count badge) and How many (the shared
 * count chooser's step row) right under the picked stack; in Give the recipient follows it, next to
 * the button that names both.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { filterPickerItems, pickerGridMove, pickerTileText } from '../public/js/ui/item-picker.js?v=fbe3c3df';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');

describe('#141 the item picker\'s rules', () => {
  const items = [
    { key: 'cherry', label: 'Cherries' },
    { key: 'meat', label: 'Meat' },
    { key: 'paper', label: 'Sheet of Paper' },
    { key: 'note', label: 'A blank Note' },
  ];

  it('the search filters by name as the pack\'s own search does (case and spacing ignored), empty shows all', () => {
    assert.deepEqual(filterPickerItems(items, '').map((i) => i.key), ['cherry', 'meat', 'paper', 'note']);
    assert.deepEqual(filterPickerItems(items, '   ').length, 4);
    assert.deepEqual(filterPickerItems(items, 'CHER').map((i) => i.key), ['cherry']);
    assert.deepEqual(filterPickerItems(items, 'sheet   of').map((i) => i.key), ['paper']);
    assert.deepEqual(filterPickerItems(items, 'e').map((i) => i.key), ['cherry', 'meat', 'paper', 'note']);
    assert.deepEqual(filterPickerItems(items, 'zzz'), []);
    assert.deepEqual(filterPickerItems(null, 'x'), []);
    assert.match(read('js/ui/item-picker.js'), /import \{ packSearchMatch \} from '\.\/pack-row\.js/);
  });

  it('arrows move by one and by a row in the grid, Home and End to the ends, and stop at the edges', () => {
    assert.equal(pickerGridMove(0, 'ArrowRight', 10, 4), 1);
    assert.equal(pickerGridMove(1, 'ArrowLeft', 10, 4), 0);
    assert.equal(pickerGridMove(0, 'ArrowLeft', 10, 4), 0);
    assert.equal(pickerGridMove(1, 'ArrowDown', 10, 4), 5);
    assert.equal(pickerGridMove(8, 'ArrowDown', 10, 4), 8, 'no row below');
    assert.equal(pickerGridMove(5, 'ArrowUp', 10, 4), 1);
    assert.equal(pickerGridMove(3, 'Home', 10, 4), 0);
    assert.equal(pickerGridMove(3, 'End', 10, 4), 9);
    assert.equal(pickerGridMove(3, 'Enter', 10, 4), null);
    assert.equal(pickerGridMove(0, 'ArrowRight', 0, 4), null);
  });

  it('a tile says the name and a count badge only for more than one', () => {
    assert.deepEqual(pickerTileText({ label: 'Cherries', count: 12 }), { label: 'Cherries', badge: '12', title: 'Cherries ×12' });
    assert.deepEqual(pickerTileText({ label: 'Hatchet', count: 1 }), { label: 'Hatchet', badge: '', title: 'Hatchet' });
  });
});

describe('#141 one picker in the Auction House, Give, Wrap and the Butler', () => {
  it('the picker draws tiles with a search and puts How many (the shared count chooser) right under the pick', () => {
    const src = read('js/ui/item-picker.js');
    assert.match(src, /import \{ bindCountField, countFromField, countKeyValue, countStepMarkup, syncCountStep \} from '\.\/count-chooser\.js/);
    assert.match(src, /chosen\.className = 'item-picker-chosen count-pop';/);
    assert.match(src, /el\.append\(search, grid, none, chosen\);/, 'search, grid, then the picked stack and How many');
    const css = read('style.css');
    assert.match(css, /\.item-picker-grid \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(64px, 1fr\)\);/);
    assert.match(css, /\.item-picker-tile img \{ width: 36px; height: 36px;/);
    // Classic restyles it in place, every selector under the Classic root.
    const classic = read('css/classic.css');
    for (const part of ['item-picker-find', 'item-picker-tile', 'item-picker-badge', 'item-picker-chosen']) {
      assert.match(classic, new RegExp(`:root\\[data-ui="classic"\\] \\.${part}`), part);
    }
  });

  it('the Auction House posts from the picker: no more pills, How many from the picker feeds the price', () => {
    const src = read('js/features/auctions-feature.js');
    assert.match(src, /import \{ createItemPicker \} from '\.\.\/ui\/item-picker\.js/);
    assert.doesNotMatch(src, /\.auc-pack/);
    assert.doesNotMatch(src, /max-height: 9\.5rem/);
    assert.match(src, /countHooks: \{ num: 'data-auctions-count' \}/);
    assert.match(src, /if \(!pick\.touched\) sellRefs\.costIn\.value = String\(suggestedPrice\(n, sellRefs\.s\.v\) \|\| ''\);/);
    assert.match(src, /attrs: \{ 'data-auctions-pick': s\.c \}/, 'the QA hook stays on each tile');
  });

  it('Give: What, then To, then the button that names the amount and the player', () => {
    const src = read('js/features/gifts-feature.js');
    assert.match(src, /import \{ createItemPicker \} from '\.\.\/ui\/item-picker\.js/);
    assert.match(src, /win\.append\(head, whatSec, whoSec, status, foot\);/);
    assert.match(src, /goBtn\.textContent = p && give\.to \? `Give \$\{what\} to \$\{give\.to\.name\}`/);
    assert.match(src, /countHooks: \{ dec: 'data-gift-minus', inc: 'data-gift-plus', max: 'data-gift-all', of: 'data-gift-count' \}/);
    assert.doesNotMatch(src, /\.gift-count/);
    assert.match(src, /onPick: \(it\) => \(wrap \? wrapPick\(it\) : givePick\(it\)\)/, 'Wrap uses the same grid');
    assert.match(src, /'data-gift-wrap-item': c/);
  });

  it('the Butler\'s package picker is the shared one too', () => {
    const src = read('js/features/butler-feature.js');
    assert.match(src, /import \{ createItemPicker \} from '\.\.\/ui\/item-picker\.js/);
    assert.match(src, /countHooks: \{ num: 'data-butler-count' \}/);
    assert.doesNotMatch(src, /bd-grid|bd-item|bd-count/);
  });
});
