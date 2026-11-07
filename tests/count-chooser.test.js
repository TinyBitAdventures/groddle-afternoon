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
import { COUNT_KEYS, bindCountField, countFromField, countKeyValue, countStepMarkup, typedCount } from '../public/js/ui/count-chooser.js?v=5bc894c8';

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

describe('ticket 92: what OK says follows the count as it is typed', () => {
  /** A number field as far as bindCountField needs: its value, its dataset and its events. */
  function field(value = '12') {
    const input = new EventTarget();
    Object.assign(input, { value, dataset: {}, closest: () => null });
    return input;
  }
  const typing = (input, value) => { input.value = value; input.dispatchEvent(new Event('input')); };
  const leave = (input) => input.dispatchEvent(new Event('change'));

  it('typedCount: nothing for an empty or unfinished field, else cut to one to max', () => {
    assert.equal(typedCount('', 12), null);
    assert.equal(typedCount('  ', 12), null);
    assert.equal(typedCount('1', 12), 1);
    assert.equal(typedCount('40', 12), 12);
    assert.equal(typedCount('0', 12), 1);
  });

  it('every keystroke previews the typed count; leaving the field redraws only when it shows something else', () => {
    const seen = [];
    const sets = [];
    const input = field('12');
    bindCountField(input, { max: () => 12, set: (n) => sets.push(n), confirm() {}, cancel() {}, preview: (n) => seen.push(n) });
    typing(input, '');
    typing(input, '1');
    assert.deepEqual(seen, [1], 'the empty field previews nothing; "1" says 1 at once');
    leave(input);
    assert.deepEqual(sets, [], 'already shown: no redraw under a pressed Buy');
    typing(input, '40');
    assert.deepEqual(seen, [1, 12]);
    leave(input);
    assert.deepEqual(sets, [12], 'past the most: the field is redrawn at the most');
    typing(input, '');
    leave(input);
    assert.deepEqual(sets, [12, 1], 'left empty: one');
  });

  it('without a preview a field works as before (change sets)', () => {
    const sets = [];
    const input = field('3');
    bindCountField(input, { max: () => 12, set: (n) => sets.push(n), confirm() {}, cancel() {} });
    typing(input, '5');
    assert.deepEqual(sets, []);
    leave(input);
    assert.deepEqual(sets, [5]);
  });

  it('every count field in the game previews: vendor Buy and Sell, Drop, Eat more, Feed, storage, the How many dialog, the rook, shrines', () => {
    const fn = (src, name) => { const at = src.indexOf(`\nfunction ${name}(`); assert.ok(at >= 0, name); return src.slice(at, src.indexOf('\n}\n', at)); };
    const vendor = fn(game, 'renderVendorList');
    assert.match(vendor, /preview: \(n\) => \{\n\s+vendorQty = n;[\s\S]*?go\.textContent = vendorGoLabel\(isBuy, n, unit\);/);
    assert.doesNotMatch(vendor, /\[data-vq-val\]'\)\?\.addEventListener\('change'/, 'the field\'s own change redraw is gone');
    assert.match(fn(game, 'vendorGoLabel'), /`\$\{isBuy \? 'Buy' : 'Sell'\}: \$\{qty\} for \$\{unit \* qty\}`/);
    const pack = fn(game, 'renderPackPopover');
    assert.match(pack, /go\.textContent = `Drop \$\{packDropQty\}`;/);
    assert.match(pack, /go\.textContent = `\$\{eatMany\.verb\} \$\{packEatQty\}`;/);
    assert.match(pack, /const \{ preview, note \} = packEatDetail\(eatMany, useInfo, packEatQty\);/);
    assert.match(game, /preview: \(n\) => setFeedPickerQty\(n, \{ typing: true \}\),/);
    assert.match(fn(game, 'setFeedPickerQty'), /if \(input && !typing\) input\.value = String\(n\);/);
    assert.match(game, /\[data-shrine-qty\]'\)\?\.addEventListener\('input', \(event\) => \{\n\s+const n = typedCount\(event\.target\.value, quote\.maxQty\);/);
    const sw = readFileSync(join(root, 'public/js/ui/storage-windows.js'), 'utf8');
    assert.equal((sw.match(/bindCountField\([^\n]*preview/g) || []).length, 3, 'take out, buy and the How many dialog');
    assert.match(sw, /buy\.textContent = text\.buyButton\(n, n \* cur\.cost\);/);
    const rook = readFileSync(join(root, 'public/js/features/rook-attack-feature.js'), 'utf8');
    assert.match(rook, /syncCount\(\{ typing: true \}\);/);
  });
});
