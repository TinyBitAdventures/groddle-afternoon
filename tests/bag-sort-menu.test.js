/**
 * A bag's Sort level (Austin 2026-11-03: "The sorting looks like it should be a
 * submenu or picker. That's too many 'sort' options on the options menu."): with
 * Internal Sortitude a Generic or Bigger Bag's menu has one Sort row with the
 * chevron, and its second level lists All and the fourteen sorts by their plain
 * names, the current one checked, with a Back row (0, Backspace or Esc), as Eat
 * more and Drop open theirs. Each choice keeps its flat verb id (bags_sort:<id>).
 *
 * The original listed every Sort: verb flat (glitch-client InteractionMenu.as
 * buildVerbCUIs 768-822, one button per verb; bag_generic_gray.js verbs.sort_all
 * 30 to sort_staples_a 391): the second level is a remake choice.
 * The verbs: tests/bag-sorting.test.js. Browser QA: scratch sortmenu-qa/qa.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_ICON, verbRowAttrs, verbRowInner, verbRowKeys } from '../public/js/ui/verb-menu.js?v=94936f9c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const bags = readFileSync(join(root, 'public/js/features/bags-feature.js'), 'utf8');

/** The source of one top-level function of game.js. */
function fnSource(name) {
  const at = game.indexOf(`\nfunction ${name}(`);
  assert.ok(at >= 0, name);
  const next = game.indexOf('\n}\n', at);
  return game.slice(at, next + 2);
}

describe('a choice level\'s rows (js/ui/verb-menu.js)', () => {
  it('the current choice shows a check in place of the lock, and the level is a radio group', () => {
    const cur = verbRowInner({ key: '6', label: 'Mining, etc.', disabled: true, current: true });
    assert.ok(cur.includes(CHECK_ICON));
    assert.doesNotMatch(cur, /vm-lock/);
    assert.match(verbRowInner({ key: '2', label: 'Keys', current: false }), /vm-label">Keys</);
    assert.doesNotMatch(verbRowInner({ key: '2', label: 'Keys', current: false }), /vm-check|vm-lock/);
    assert.match(verbRowAttrs({ current: true, disabled: true, reason: 'This bag is currently sorted by keys' }), /^role="menuitemradio" aria-checked="true" aria-disabled="true" data-vm-reason="This bag is currently sorted by keys"/);
    assert.match(verbRowAttrs({ current: false }), /^role="menuitemradio" aria-checked="false"/);
    // Rows that are not choices stay plain menu items.
    assert.match(verbRowAttrs({ tip: 'x' }), /^role="menuitem" /);
  });

  it('the level\'s keys: Back is 0, All and the first eight sorts 1-9', () => {
    const rows = [{ back: true }, ...Array.from({ length: 15 }, () => ({}))];
    assert.deepEqual(verbRowKeys(rows), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '', '', '', '', '', '']);
  });
});

describe('the pack menu draws a feature verb\'s second level (game.js renderPackPopover)', () => {
  const pop = fnSource('renderPackPopover');

  it('a verb with sub is one row with the chevron that opens its level', () => {
    assert.match(pop, /if \(Array\.isArray\(verb\.sub\) && verb\.sub\.length\) \{[\s\S]*?attrs: `data-feature-pack-sub="\$\{escapeHtml\(verb\.id\)\}"`,[\s\S]*?next: true,/);
    assert.match(pop, /pop\.querySelectorAll\('\[data-feature-pack-sub\]'\)\.forEach\(\(button\) => \{\n\s+button\.addEventListener\('click', \(\) => \{\n\s+packSubLevel = button\.dataset\.featurePackSub;\n\s+renderPackPopover\(classTsid, sourceAnchor\);\n\s+focusVerbRow\(pop\);/);
  });

  it('the level is a Back row and the verbs, each run as a feature verb by its own id', () => {
    assert.match(pop, /const level = eatPrompt \? 'eat' : dropPrompt \? 'drop' : subVerb \? 'sub' : countPrompt \? 'count' : '';/);
    assert.match(pop, /\[\{ attrs: 'data-pack-sub-cancel', cls: 'vm-back', label: 'Back', back: true,[\s\S]*?\.\.\.subVerb\.sub\.map\(\(v\) => featureVerbRow\(\{ \.\.\.v, featureId: subVerb\.featureId \}\)\)\]/);
    assert.match(pop, /attrs: `data-feature-pack-verb="\$\{escapeHtml\(verb\.id\)\}" data-feature-id="\$\{escapeHtml\(verb\.featureId\)\}"`/);
    assert.match(pop, /typeof verb\.current === 'boolean' \? \{ current: verb\.current \} : \{\}/);
    // Back returns to the row that opened the level.
    assert.match(pop, /pop\.querySelector\('\[data-pack-sub-cancel\]'\)\?\.addEventListener\('click', \(\) => \{[\s\S]*?packSubLevel = '';[\s\S]*?b\.dataset\.featurePackSub === from[\s\S]*?focusVerbRow\(pop, at\)/);
  });

  it('every way the menu opens starts on the first level; Esc on the level goes back', () => {
    assert.match(fnSource('closePackPopover'), /packSubLevel = '';/);
    assert.match(fnSource('openPackStackMenu'), /packSubLevel = '';/);
    assert.match(fnSource('openPackBagOptions'), /packSubLevel = '';\n\s+packCountVerb = '';\n\s+renderPackPopover\(s\.classTsid, slot\);/);
    assert.match(game, /if \(isPackPopoverOpen\(\)\) \{\n\s+\/\/ A second level[^\n]*\n\s+const back = packSubLevel\n\s+\? document\.querySelector\('#pack-popover \[data-pack-sub-cancel\]'\)\n\s+: packCountVerb \? document\.querySelector\('#pack-popover \[data-pack-count-cancel\]'\) : null;\n\s+if \(back\) back\.click\(\);\n\s+else closePackPopover\(\);/);
  });

  it('cites the original and names the level a remake choice', () => {
    assert.match(bags, /Remake choice \(Austin 2026-11-03/);
    assert.match(bags, /InteractionMenu\.as\n \* buildVerbCUIs 768-822/);
  });
});
