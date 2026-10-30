/**
 * MPANELS: the How many chooser (js/ui/count-chooser.js) for Feed, Eat more, Drop and a vendor's Buy
 * and Sell: the step row, the keys and where game.js asks it.
 * Run: node --test tests/count-chooser.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNT_KEYS, countFromField, countKeyValue, countStepMarkup } from '../public/js/ui/count-chooser.js?v=g472-7';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const html = readFileSync(join(root, 'public/play/index.html'), 'utf8');

describe('the How many chooser', () => {
  it('the keys step by one and ten, Home is one and End the most, inside one to max', () => {
    assert.equal(countKeyValue('ArrowUp', 3, 12), 4);
    assert.equal(countKeyValue('ArrowRight', 12, 12), 12);
    assert.equal(countKeyValue('ArrowDown', 1, 12), 1);
    assert.equal(countKeyValue('-', 5, 12), 4);
    assert.equal(countKeyValue('+', 5, 12), 6);
    assert.equal(countKeyValue('PageUp', 5, 12), 12);
    assert.equal(countKeyValue('PageDown', 15, 40), 5);
    assert.equal(countKeyValue('Home', 7, 12), 1);
    assert.equal(countKeyValue('End', 7, 12), 12);
    assert.equal(countKeyValue('a', 7, 12), null);
    assert.equal(countKeyValue('Enter', 7, 12), null);
    assert.deepEqual(Object.keys(COUNT_KEYS).sort(), ['+', '-', '=', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'PageDown', 'PageUp'].sort());
  });

  it('a typed count is cut to one to max; an empty field is one', () => {
    assert.equal(countFromField('4', 12), 4);
    assert.equal(countFromField('40', 12), 12);
    assert.equal(countFromField('', 12), 1);
    assert.equal(countFromField('x', 12), 1);
    assert.equal(countFromField('0', 12), 1);
  });

  it('the step row: − [number] + Max, on the site\'s own hooks, its ends off at one and at max', () => {
    const row = countStepMarkup({ value: 1, max: 5, verb: 'Drop', attrs: { dec: 'data-a-dec', inc: 'data-a-inc', num: 'data-a-num', max: 'data-a-max' } });
    assert.match(row, /<button type="button" class="count-pop-dec" data-a-dec aria-label="Drop one fewer" disabled>−<\/button>/);
    assert.match(row, /<input type="number" class="count-pop-num" data-a-num min="1" max="5" value="1" inputmode="numeric" aria-label="How many" \/>/);
    assert.match(row, /class="count-pop-inc" data-a-inc aria-label="Drop one more" >\+/);
    assert.match(row, /class="count-pop-max" data-a-max >Max<\/button>/);
    assert.match(countStepMarkup({ value: 9, max: 5, attrs: { dec: '', inc: '', num: '', max: '' } }), /value="5"[\s\S]*aria-pressed="true"/);
  });

  it('game.js: Eat more, Drop, Feed and the vendors use it', () => {
    assert.match(game, /attrs: \{ dec: 'data-pack-eat-dec', inc: 'data-pack-eat-inc', num: 'data-pack-eat-num', max: 'data-pack-eat-max' \}/);
    assert.match(game, /attrs: \{ dec: 'data-pack-drop-dec', inc: 'data-pack-drop-inc', num: 'data-pack-drop-num', max: 'data-pack-drop-max' \}/);
    assert.match(game, /bindCountField\(input, \{/);
    assert.match(game, /bindCountField\(detail\.querySelector\('\[data-vq-val\]'\), \{/);
    // Feed sits by the thing, as its verb menu did; the vendor's count by its tile.
    assert.match(game, /placeMenuAtTarget\(panel, feedPickerTarget, 'feedPickerPlace'\);/);
    assert.match(game, /function placeVendorPop\(list, detail\)/);
    // Esc: a vendor's count goes back to the shelf before the vendor closes.
    assert.match(game, /if \(isVendorOpen\(\) && vendorSelected\) \{\s+vendorSelected = null;\s+renderVendorList\(\);\s+return;/);
    assert.match(html, /id="feed-picker-qty" class="feed-picker-qty count-pop"/);
  });
});
