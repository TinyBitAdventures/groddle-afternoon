/**
 * G881 (#413): the pack search's results list, as the client's Inventory Search drew it
 * (InventorySearch.as result_scroller, SuperSearch.as searchInventory, WorldModel.as searchItemstacks):
 * from the second letter, names that start with the words first, then names that hold them, one row per
 * stack (side-by-side stacks of one item in one container added up), each with its icon, count and where
 * it is ("in your pack", "in Bigger Bag"). Up and Down move the lit row, Enter or a click picks it, and a
 * pick closes the search and opens that stack's menu (InventorySearch.as onElementSelect 149-167).
 * Run: node --test tests/pack-search-results.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeEl } from './social-fake-dom.js';
import {
  PACK_RESULTS_MIN_CHARS,
  PACK_RESULTS_ROWS,
  createPackRow,
  packSearchMarks,
  packSearchResults,
} from '../public/js/ui/pack-row.js?v=f5ef5f6c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const bag = { label: 'Bigger Bag' };
const ENTRIES = [
  { classTsid: 'cherry', label: 'Cherry', count: 7, icon: 'cherry.webp', container: 'pack', index: 0 },
  { classTsid: 'bag_bigger', label: 'Bigger Bag', count: 1, icon: 'bag.webp', container: 'pack', index: 1, bag: { key: 'b1' } },
  { classTsid: 'pick', label: 'Pick', count: 1, icon: 'pick.webp', container: 'pack', index: 2 },
  { classTsid: 'cherry', label: 'Cherry', count: 3, icon: 'cherry.webp', container: 'b1', index: 0, inBag: bag },
  { classTsid: 'cherry', label: 'Cherry', count: 2, icon: 'cherry.webp', container: 'b1', index: 1, inBag: bag },
  { classTsid: 'plain_bubble', label: 'Plain Bubble', count: 4, icon: 'bubble.webp', container: 'b1', index: 2, inBag: bag },
  { classTsid: 'hairball', label: 'Hairball', count: 1, icon: 'hairball.webp', container: 'b1', index: 3, inBag: bag },
];

describe('G881: what the results list holds', () => {
  it('from the second letter, as the client (SuperSearch.as 972-979, WorldModel.as 470), three rows before it scrolls', () => {
    assert.equal(PACK_RESULTS_MIN_CHARS, 2);
    assert.equal(PACK_RESULTS_ROWS, 3);
    assert.deepEqual(packSearchResults(ENTRIES, 'c'), []);
    assert.deepEqual(packSearchResults(ENTRIES, '  '), []);
    assert.ok(packSearchResults(ENTRIES, 'ch').length > 0);
  });

  it('every match, in the pack and inside bags, with where it is and its count', () => {
    const rows = packSearchResults(ENTRIES, 'cherry');
    assert.deepEqual(rows.map((r) => [r.label, r.sub, r.container, r.index]), [
      ['Cherry', '7 in your pack', 'pack', 0],
      // Side-by-side stacks of one item in one bag are one row, their counts added (searchInventory 834-853).
      ['Cherry', '5 in Bigger Bag', 'b1', 0],
    ]);
    assert.equal(rows[0].icon, 'cherry.webp');
    assert.equal(rows[1].count, 5);
  });

  it('names that start with the words first, then names that hold them, each in name order (WorldModel.as 470-494)', () => {
    const rows = packSearchResults(ENTRIES, 'bb');
    assert.deepEqual(rows.map((r) => r.label), ['Plain Bubble']);
    const bi = packSearchResults(ENTRIES, 'bi');
    assert.deepEqual(bi.map((r) => r.label), ['Bigger Bag'], 'a bag is a result too (it was an itemstack in the client)');
    assert.equal(bi[0].bagKey, 'b1');
    const ai = packSearchResults(ENTRIES, 'ai');
    assert.deepEqual(ai.map((r) => r.label), ['Hairball', 'Plain Bubble']);
    const r = packSearchResults([
      { classTsid: 'a', label: 'Carrot', container: 'pack', index: 0 },
      { classTsid: 'b', label: 'Big Carrot', container: 'pack', index: 1 },
      { classTsid: 'c', label: 'Car Part', container: 'pack', index: 2 },
    ], 'car');
    assert.deepEqual(r.map((x) => x.label), ['Car Part', 'Carrot', 'Big Carrot']);
  });

  it('a shown name (a named Cubimal) is what matches and what shows', () => {
    const rows = packSearchResults([{ classTsid: 'npc_cubimal_chick', label: 'Chick Cubimal', container: 'pack', index: 0, copy: 0 }], 'zo', () => 'Zoomer (Chick Cubimal)');
    assert.deepEqual(rows.map((x) => x.label), ['Zoomer (Chick Cubimal)']);
  });

  it('the matched letters are marked, every time they come (StringUtil.as colorCharacters)', () => {
    assert.deepEqual(packSearchMarks('Plain Bubble', 'b'), [['Plain ', false], ['B', true], ['u', false], ['b', true], ['b', true], ['le', false]]);
    assert.deepEqual(packSearchMarks('Cherry', 'CH'), [['Ch', true], ['erry', false]]);
    assert.deepEqual(packSearchMarks('Cherry', 'zz'), [['Cherry', false]]);
    assert.deepEqual(packSearchMarks('Cherry', ''), [['Cherry', false]]);
  });
});

/** The fake DOM's element with className (pack-row.js sets classes that way). */
class El extends FakeEl {
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = String(v); }
}

/** A pack bar in the fake DOM: the band, the row, the field and the tip, as public/play/index.html has them. */
function mountBar() {
  const doc = {
    activeElement: null,
    createElement: (t) => new El(t),
    body: new FakeEl('body'),
    getElementById: (id) => doc.body.all().find((n) => n.id === id) || null,
  };
  globalThis.document = doc;
  const el = (tag, id, parent) => { const e = new El(tag); e.id = id; parent.append(e); return e; };
  const band = el('div', 'pack-bar', doc.body);
  const row = el('nav', 'pack-row', band);
  const items = el('div', 'pack-items', row);
  const field = el('div', 'pack-search', row);
  field.hidden = true;
  const input = el('input', 'pack-search-input', field);
  el('button', 'pack-search-close', field);
  el('button', 'pack-search-btn', row);
  el('div', 'pack-tip', band);
  // The row's stacks (as game.js renderPackRow draws them) so the lit result's slot can be found.
  for (const [i, cls] of ['cherry', 'pick'].entries()) {
    const s = new El('button');
    s.classList.add('pack-slot');
    s.setAttribute('data-tsid', cls);
    s.setAttribute('data-pack-container', 'pack');
    s.setAttribute('data-pack-index', String(i));
    items.append(s);
  }
  const data = {};
  const picked = [];
  const queries = [];
  const packRow = createPackRow({ document: doc, setData: (k, v) => { data[k] = v; }, onQuery: (q) => queries.push(q), onPick: (r, how) => picked.push([r.key, how.keys]) });
  packRow.install();
  return { doc, band, input, items, data, picked, queries, packRow };
}
const key = (input, k) => input.dispatch('keydown', { key: k });

describe('G881: the results list in the pack bar', () => {
  it('a combobox: the list is made at install, hidden until two letters', () => {
    const { input, packRow, doc, data } = mountBar();
    const box = doc.getElementById('pack-search-results');
    assert.ok(box, 'made inside the pack bar');
    assert.equal(box.getAttribute('role'), 'listbox');
    assert.equal(input.getAttribute('role'), 'combobox');
    assert.equal(input.getAttribute('aria-controls'), 'pack-search-results');
    packRow.openSearch();
    input.value = 'c';
    input.dispatch('input');
    packRow.drawResults(packSearchResults(ENTRIES, 'c'), 'c');
    assert.equal(box.hidden, true, 'one letter: no list (the row still narrows)');
    assert.equal(input.getAttribute('aria-expanded'), 'false');
    input.value = 'ch';
    packRow.drawResults(packSearchResults(ENTRIES, 'ch'), 'ch');
    assert.equal(box.hidden, false);
    assert.equal(input.getAttribute('aria-expanded'), 'true');
    assert.equal(data.packSearchResults, '2');
    const rows = box.querySelectorAll('[data-pack-result]');
    assert.equal(rows.length, 2);
    assert.match(rows[1].textContent, /Cherry5 in Bigger Bag/);
    assert.equal(rows[0].querySelector('img').src, 'cherry.webp');
    assert.equal(rows[0].querySelector('mark').textContent, 'Ch');
  });

  it('the first row is lit and its stack lit in the row; Down and Up move it without wrapping', () => {
    const { input, packRow, doc, items, data } = mountBar();
    packRow.openSearch();
    input.value = 'ch';
    packRow.drawResults(packSearchResults(ENTRIES, 'ch'), 'ch');
    const rows = () => doc.getElementById('pack-search-results').querySelectorAll('[data-pack-result]');
    assert.equal(rows()[0].getAttribute('aria-selected'), 'true');
    assert.equal(input.getAttribute('aria-activedescendant'), 'pack-search-result-0');
    assert.ok(items.querySelector('.pack-slot[data-pack-index="0"]').classList.contains('is-search-lit'), 'onElementChanged: setFocusedSlot');
    key(input, 'ArrowDown');
    assert.equal(data.packSearchActive, '1');
    assert.equal(rows()[1].getAttribute('aria-selected'), 'true');
    assert.equal(items.querySelectorAll('.pack-slot.is-search-lit').length, 0, 'the bag stack has no slot in this row');
    key(input, 'ArrowDown');
    assert.equal(data.packSearchActive, '1', 'no wrap past the end (changeSelection 490-497)');
    key(input, 'ArrowUp');
    key(input, 'ArrowUp');
    assert.equal(data.packSearchActive, '0');
  });

  it('Enter picks the lit row: the search closes, then the pick goes to game.js with the keys flag', () => {
    const { input, packRow, doc, picked, data } = mountBar();
    packRow.openSearch();
    input.value = 'ch';
    packRow.drawResults(packSearchResults(ENTRIES, 'ch'), 'ch');
    key(input, 'ArrowDown');
    key(input, 'Enter');
    assert.deepEqual(picked, [['b1:0', true]]);
    assert.equal(packRow.isSearching(), false, 'hide it no matter what (onElementSelect 152-153)');
    assert.equal(doc.getElementById('pack-search-results').hidden, true);
    assert.equal(data.packSearchResults, '');
  });

  it('a click on a row picks it; a press keeps the field focused; Escape closes the lot', () => {
    const { input, packRow, doc, picked } = mountBar();
    packRow.openSearch();
    input.value = 'pi';
    packRow.drawResults(packSearchResults(ENTRIES, 'pi'), 'pi');
    const box = doc.getElementById('pack-search-results');
    const press = box.querySelector('[data-pack-result]').dispatch('mousedown');
    assert.equal(press.defaultPrevented, true);
    box.querySelector('.pack-search-result-sub').click();
    assert.deepEqual(picked, [['pack:2', false]]);
    packRow.openSearch();
    input.value = 'pi';
    packRow.drawResults(packSearchResults(ENTRIES, 'pi'), 'pi');
    key(input, 'Escape');
    assert.equal(packRow.isSearching(), false);
    assert.equal(box.hidden, true);
  });

  it('nothing found says so, in the client\'s words (SuperSearchElementNoResult.as 32)', () => {
    const { input, packRow, doc, picked } = mountBar();
    packRow.openSearch();
    input.value = 'zz';
    packRow.drawResults(packSearchResults(ENTRIES, 'zz'), 'zz');
    const box = doc.getElementById('pack-search-results');
    assert.equal(box.hidden, false);
    assert.equal(box.querySelector('.is-none').textContent, 'No results for: “zz”');
    key(input, 'Enter');
    assert.deepEqual(picked, [], 'nothing to pick');
  });

  it('nothing found says it once: the list\'s line while the list shows, the row\'s "Nothing called" only under two letters', () => {
    const { input, packRow, doc, items } = mountBar();
    const rowNone = () => items.querySelectorAll('.pack-search-empty');
    packRow.openSearch();
    // As game.js renderPackBar draws a search: the row's mark first, then the list.
    input.value = 'z';
    packRow.markNoMatches(items, 'z');
    packRow.drawResults(packSearchResults(ENTRIES, 'z'), 'z');
    assert.equal(rowNone().length, 1, 'one letter: no list, so the row says it');
    assert.equal(rowNone()[0].textContent, 'Nothing called "z"');
    input.value = 'zz';
    packRow.markNoMatches(items, 'zz');
    packRow.drawResults(packSearchResults(ENTRIES, 'zz'), 'zz');
    const box = doc.getElementById('pack-search-results');
    assert.equal(box.hidden, false);
    assert.equal(box.querySelector('.is-none').textContent, 'No results for: “zz”');
    assert.equal(rowNone().length, 0, 'the row\'s line goes while the list says it');
    // The next redraw (updateHud, about once a second) draws the row again: it stays at one line.
    packRow.markNoMatches(items, 'zz');
    packRow.drawResults(packSearchResults(ENTRIES, 'zz'), 'zz');
    assert.equal(rowNone().length, 0);
  });

  it('a redraw with the same results keeps the list as it is; a pack change keeps the lit stack', () => {
    const { input, packRow, doc, data } = mountBar();
    packRow.openSearch();
    input.value = 'ch';
    packRow.drawResults(packSearchResults(ENTRIES, 'ch'), 'ch');
    const box = doc.getElementById('pack-search-results');
    const first = box.querySelector('[data-pack-result]');
    key(input, 'ArrowDown');
    packRow.drawResults(packSearchResults(ENTRIES, 'ch'), 'ch');
    assert.equal(box.querySelector('[data-pack-result]'), first, 'the same rows (updateHud redraws about once a second)');
    const more = ENTRIES.map((e) => (e.container === 'pack' && e.classTsid === 'cherry' ? { ...e, count: 8 } : e));
    packRow.drawResults(packSearchResults(more, 'ch'), 'ch');
    assert.equal(data.packSearchActive, '1', 'onPackChange searched again; the lit stack stays lit');
  });
});

describe('G881: game.js and the styles', () => {
  const game = read('public/game.js');
  it('renderPackBar draws the list from the pack, its bags and every bag\'s stacks', () => {
    const bar = game.slice(game.indexOf('function renderPackBar() {'), game.indexOf('/** G255: the quest log markup'));
    assert.match(bar, /packRow\.drawResults\(packSearchResults\(\[\.\.\.bagRow, \.\.\.found\], query, labelOf\), query\);/);
    assert.match(game, /onPick: \(result, how\) => pickPackSearchResult\(result, how\),/);
  });
  it('a pick opens a stack in a bag in its tray first, then the stack\'s menu (startItemstackMenu)', () => {
    const fn = game.slice(game.indexOf('function pickPackSearchResult('), game.indexOf('/** A tool slot\'s copy'));
    assert.match(fn, /features\.query\('packOpenBag'\) !== r\.container\) features\.query\('packToggleBag', r\.container, engine\);/);
    assert.match(fn, /openPackStackMenu\(\{ classTsid: r\.classTsid \}, slot, \{ keys \}\)/);
    assert.match(fn, /openPackBagOptions\(/);
  });
  it('Modern in style.css (tokens), Classic in this lane\'s block above TICKETS', () => {
    const css = read('public/style.css');
    assert.match(css, /\.pack-search-results \{[^}]*--psr-max: calc\(var\(--psr-row\) \* 3 \+ 2px\);/);
    assert.match(css, /\.pack-search-results\[hidden\] \{ display: none; \}/);
    const classic = read('public/css/classic.css');
    const a = classic.indexOf('/* === build16a (lane) === */');
    const b = classic.indexOf('/* === end build16a === */');
    assert.ok(a > 0 && b > a && b < classic.indexOf('/* == TICKETS =='));
    assert.match(classic.slice(a, b), /:root\[data-ui="classic"\] #game-root \.pack-search-results \{/);
  });
});
