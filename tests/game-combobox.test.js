/**
 * DECOPOLISH (Austin 2026-11-02, Decoration Mode, Modern UI): the Storage Display Box card's
 * "Allspice (21)" select opened the OS's grey menu. "Can we change the select dropdown to pretty
 * looking autocomplete UIs?" The game's own combobox (js/combobox.js, first the Map's region
 * picker) now has item icons and count pills, Home/End, a list that opens in the top layer inside
 * the window (above the field when there is no room under it), rows chosen on click (a finger can
 * scroll), Enter that never sends a form, and `input` + `change` like a native select. It stands in
 * front of the Display picker and the letter's To and Attach pickers.
 *
 * Run: node --test tests/game-combobox.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIST_GAP, LIST_MARGIN, filterOptions, placeList, splitCount } from '../public/js/combobox.js?fresh=combo';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('the game combobox (js/combobox.js)', () => {
  it('reads a count from an option\'s text, as "(21)" or "×6"', () => {
    assert.deepEqual(splitCount('Allspice (21)'), { name: 'Allspice', count: '21' });
    assert.deepEqual(splitCount('Grain ×6'), { name: 'Grain', count: '6' });
    assert.deepEqual(splitCount('Plain Bubble'), { name: 'Plain Bubble', count: '' });
    assert.deepEqual(splitCount('Ticket to Slip \'N Slide'), { name: 'Ticket to Slip \'N Slide', count: '' });
  });

  it('opens the list under its field when it fits, else above it, never out of the window', () => {
    const view = { width: 1440, height: 800 };
    const low = { left: 900, right: 1130, top: 406, bottom: 436, width: 230, height: 30 };
    const under = placeList(low, 900, view);
    assert.equal(under.above, false);
    assert.equal(under.top, 436 + LIST_GAP);
    assert.ok(under.top + under.maxHeight <= view.height - LIST_MARGIN, JSON.stringify(under));
    // Near the bottom (a card over the tray): above, as tall as the room over the field.
    const nearBottom = { left: 900, right: 1130, top: 700, bottom: 730, width: 230, height: 30 };
    const over = placeList(nearBottom, 600, view);
    assert.equal(over.above, true);
    assert.equal(over.bottom, view.height - 700 + LIST_GAP);
    assert.ok(over.maxHeight <= 700 - LIST_GAP - LIST_MARGIN);
    // A short list fits under even near the bottom: it stays there.
    assert.equal(placeList({ ...nearBottom, top: 600, bottom: 630 }, 120, view).above, false);
    // A phone: as wide as asked but inside the window's sides.
    const phone = placeList({ left: 300, right: 380, top: 200, bottom: 230, width: 80, height: 30 }, 400, { width: 390, height: 760 }, { minWidth: 230 });
    assert.ok(phone.left >= LIST_MARGIN && phone.left + phone.width <= 390 - LIST_MARGIN, JSON.stringify(phone));
    assert.equal(phone.width, 230);
  });

  it('filters by the start of the name, then of a word, then anywhere', () => {
    const opts = ['Apple', 'Plain Bubble', 'Plank', 'Plum', 'Maple Syrup'].map((label) => ({ value: label, label }));
    assert.deepEqual(filterOptions(opts, 'pl').map((o) => o.label), ['Plain Bubble', 'Plank', 'Plum', 'Apple', 'Maple Syrup']);
  });

  it('is a combobox over a listbox, with the keys a select has and more', () => {
    const src = read('public/js/combobox.js');
    for (const want of ["setAttribute('role', 'combobox')", "setAttribute('role', 'listbox')", "setAttribute('role', 'option')", "'aria-activedescendant'", "'aria-expanded'", "'ArrowDown'", "'ArrowUp'", "'PageDown'", "'Home'", "'End'", "'Enter'", "'Escape'"]) {
      assert.ok(src.includes(want), want);
    }
    // Chosen on click, not on pointerdown (a finger scrolling the list chooses nothing).
    assert.match(src, /li\.addEventListener\('click', \(e\) => \{\s+e\.preventDefault\(\);\s+choose\(opt\);/);
    assert.doesNotMatch(src, /addEventListener\('pointerdown', \(e\) => \{\s+e\.preventDefault\(\);[^}]*choose\(/);
    // The top layer, placed by placeList; both events a native select sends; Enter never submits.
    assert.match(src, /list\.setAttribute\('popover', 'manual'\)/);
    assert.match(src, /dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\);\s+select\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\);/);
    assert.match(src, /e\.key === 'Enter'\) \{\s+\/\/ Never the form's submit[^\n]*\n\s+e\.preventDefault\(\);/);
    // Item icons from data-icon.
    assert.match(src, /icon: o\.dataset\.icon/);
  });
});

describe('where the game uses it', () => {
  const homes = read('public/js/features/homes-feature.js');
  const game = read('public/game.js');

  it('the Storage Display Box\'s Display picker: the items with icons and counts, the select still feeding Display', () => {
    const pop = homes.slice(homes.indexOf('function furniturePop('), homes.indexOf('// Furniture upgrades (G358'));
    assert.match(pop, /'data-count': String\(row\.count\), 'data-icon': row\.icon \|\| null/);
    assert.match(pop, /createCombobox\(select, \{ label: 'Item to display'[^}]*className: 'combo-pick'/);
    assert.match(pop, /onclick: \(\) => runFurnitureAction\(engine, 'deposit', select\.value\)/);
    assert.match(read('public/js/ui/home-builder.js'), /'data-home-display-input'/);
  });

  it('the letter\'s To and Attach pickers, solo and online', () => {
    assert.equal((game.match(/themeMailPickers\(form\);/g) || []).length, 2);
    assert.match(game, /\['recipient', 'Send to', 'Choose who…'\], \['attachment', 'Attach one stack', 'Nothing'\]/);
    assert.equal((game.match(/data-count="\$\{slot\.count\}" data-icon="\$\{escapeHtml\(slot\.icon \|\| ''\)\}"/g) || []).length, 2);
  });

  it('Modern and Classic each have their look for it', () => {
    const modern = read('public/style.css');
    const classic = read('public/css/classic.css');
    assert.match(modern, /\[data-ui="modern"\] \.combo-pick \.combo-input \{/);
    assert.match(modern, /\[data-ui="modern"\] :is\(\.combo-pick, \.combo-form\) \.combo-list \{/);
    assert.match(modern, /\.combo-list\[popover\] \{ inset: auto; margin: 0;/);
    assert.match(classic, /:root\[data-ui="classic"\] \.combo-pick \.combo-input \{/);
    assert.match(classic, /:root\[data-ui="classic"\] :is\(\.combo-pick, \.combo-form\) \.combo-list \{/);
  });
});
