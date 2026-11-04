/**
 * SEATSELECT (Austin 2026-11-02): "Short filter menus: yes let's swap all normal selects with the
 * new autocomplete UI." No native <select> menu is left in the game: every select in the play
 * pages (/play/ and /play/online/) and in the level builder is fronted by the game's combobox
 * (js/combobox.js), which keeps the select as the value behind it. js/combobox.js watchSelects
 * fronts each select as it is added, so a new one is covered without a line of its own; this test
 * proves both pages install it, lists where the selects are, and holds the allow-list.
 *
 * The online letter's To (a free-text name with your buddies offered) is a combobox with
 * suggestions (createSuggestBox) in place of its <datalist>, still taking any typed name.
 *
 * Run: node --test tests/game-selects.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const read = (p) => readFileSync(join(root, p), 'utf8');

/**
 * Pages outside the game that keep their selects, and why. Each is a website page, not the game's
 * UI: its selects are already themed by the site's own combobox (encyclopedia/items/combobox.js, warm paper),
 * and without JavaScript the plain select is what a reader gets.
 */
export const NATIVE_SELECT_ALLOW = Object.freeze({
  'public/encyclopedia/items/index.html': 'The item catalog page (a website page): Category and Sold by are themed by items/combobox.js.',
  'public/encyclopedia/items/combobox.js': 'The catalog pages\' own combobox (it names <select> in its comments).',
  'public/encyclopedia/achievements/index.html': 'An encyclopedia page (website): its group picker is themed by items/combobox.js (encyclopedia.js).',
  'public/encyclopedia/animals/index.html': 'An encyclopedia page (website): themed by items/combobox.js.',
  'public/encyclopedia/people/index.html': 'An encyclopedia page (website): themed by items/combobox.js.',
  'public/encyclopedia/places/index.html': 'An encyclopedia page (website): themed by items/combobox.js.',
  'public/encyclopedia/quests/index.html': 'An encyclopedia page (website): themed by items/combobox.js.',
  'public/encyclopedia/skills/index.html': 'An encyclopedia page (website): themed by items/combobox.js.',
  'public/encyclopedia/sounds/index.html': 'An encyclopedia page (website): its group picker is themed by items/combobox.js.',
});

/** Where the game makes a select, by file (the count of places in each). */
const GAME_SELECTS = {
  'public/play/index.html': 2, // the achievements' Category, the Map's region
  'public/play/online/index.html': 2,
  'public/game.js': 3, // the letter's To (solo) and its Attach (solo, online)
  'public/js/skills-panel.js': 1, // the skills' category
  'public/js/features/auctions-feature.js': 2, // Browse by type, Sort
  'public/js/features/street-jobs-feature.js': 1, // the hall's group
  'public/js/features/home-street-mp-feature.js': 1, // the signpost pole's Pole, Sign and Size (one maker)
  'public/js/features/homes-feature.js': 1, // the Storage Display Box's Display
  'public/js/sound-test.js': 2, // Category, What plays
};
/** The level builder's selects (its own page, /console/builder/, js/builder/editor.js). */
const BUILDER_SELECTS = {
  'public/js/builder/editor.js': 6,
  'public/js/builder/editor-effects.js': 2,
  'public/js/builder/editor-picker.js': 5,
  'public/js/builder/editor-zone.js': 4,
};

const SELECT = /<select\b|createElement\(\s*['"]select['"]|\bel\(\s*(?:doc,\s*)?['"]select['"]/g;
const SKIP_DIR = new Set(['vendor', 'assets', 'restoration', 'codebase', 'changelog', 'node_modules']);
const GENERATED = /(?:^|\/)(?:data-versions|module-keys)\.js$|-data\.js$|\.min\.js$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIR.has(name)) walk(p, out);
    } else if (/\.(?:html|m?js)$/.test(name) && !GENERATED.test(p)) out.push(p);
  }
  return out;
}

function selectSites() {
  const sites = {};
  for (const file of walk(pub)) {
    const text = readFileSync(file, 'utf8');
    const n = (text.match(SELECT) || []).length;
    if (n) sites[relative(root, file)] = n;
  }
  return sites;
}

describe('no native select menu is left in the game (SEATSELECT, Austin 2026-11-02)', () => {
  const sites = selectSites();

  it('every select in public/ is a known game or builder site, or on the documented allow-list', () => {
    const known = { ...GAME_SELECTS, ...BUILDER_SELECTS };
    const stray = Object.keys(sites).filter((f) => !(f in known) && !(f in NATIVE_SELECT_ALLOW) && f !== 'public/js/combobox.js');
    assert.deepEqual(stray, [], 'a new select: it is fronted by watchSelects; add it here with what it is');
    for (const [file, n] of Object.entries(known)) assert.equal(sites[file] || 0, n, file);
    for (const file of Object.keys(NATIVE_SELECT_ALLOW)) {
      assert.ok(!file.startsWith('public/play/') && !file.startsWith('public/js/') && file !== 'public/game.js', `${file}: the game's own UI may not keep a native select`);
    }
  });

  it('the play pages front every select, now and as panels add them (js/combobox.js watchSelects)', () => {
    const game = read('public/game.js');
    assert.match(game, /import \{[^}]*\bwatchSelects\b[^}]*\} from '\.\/js\/combobox\.js\?v=[0-9a-f]{8}'/);
    assert.match(game, /watchSelects\(document\.body\)/);
    // Both play pages load game.js, so their static selects (achievements, the Map) are fronted too.
    assert.match(read('public/play/index.html'), /<script type="module" src="game\.js\?v=[0-9a-f]{8}"><\/script>/);
    assert.match(read('public/play/online/index.html'), /id="online-boot" src="js\/online-boot\.js\?v=[0-9a-f]{8}" data-game="game\.js\?v=[0-9a-f]{8}"/);
  });

  it('the level builder fronts its selects with the same combobox, in the builder\'s own look', () => {
    const editor = read('public/js/builder/editor.js');
    assert.match(editor, /from '\.\.\/combobox\.js\?v=[0-9a-f]{8}'/);
    assert.match(editor, /watchSelects\(root, \{ className: 'combo-builder' \}\)/);
    const css = read('public/css/builder.css');
    for (const want of ['.combo-builder', '.combo-list', '.combo-option.is-active', '.combo-native']) assert.ok(css.includes(want), want);
  });

  it('a fronted select keeps the page\'s say: hidden, disabled, options, a value set by code, its label', () => {
    const src = read('public/js/combobox.js');
    assert.match(src, /attributeFilter: \['hidden', 'disabled', 'aria-label', 'title'\], childList: true, subtree: true/);
    assert.match(src, /for \(const prop of \['value', 'selectedIndex'\]\)/);
    assert.match(src, /wrap\.hidden = select\.hidden;\s+input\.disabled = select\.disabled;/);
    assert.match(src, /for \(const label of select\.labels \|\| \[\]\) label\.htmlFor = input\.id;/);
    assert.match(src, /select\.focus = \(o\) => input\.focus\(o\);/);
    // Out of sight but still in the form: never `hidden`, which the page itself uses to show and hide a select.
    assert.match(src, /select\.style\.setProperty\('display', 'none', 'important'\)/);
    assert.doesNotMatch(src, /select\.hidden = true/);
    // A list of its own (multiple, or size > 1) is not a menu: left alone.
    assert.match(src, /!select\.multiple && !\(select\.size > 1\)/);
  });

  it('the online letter\'s To takes any name and offers your buddies, with no <datalist> left', () => {
    const game = read('public/game.js');
    assert.doesNotMatch(game, /<datalist|list="mail-buddy-names"/);
    assert.match(game, /createSuggestBox\(form\.querySelector\('input\[name="recipient"\]'\), \{ suggestions: buddies/);
    const src = read('public/js/combobox.js');
    // Nothing is picked until you move to a row, so Enter on a typed name sends the form.
    assert.match(src, /const currentIndex = free \? -1/);
    assert.match(src, /if \(isOpen && shown\[active\]\) \{\s+e\.preventDefault\(\);\s+choose\(shown\[active\]\);\s+\} else close\(\{ restore: false \}\);/);
  });

  it('each place keeps the look its select had, in Modern and Classic', () => {
    const style = read('public/style.css');
    const classic = read('public/css/classic.css');
    for (const want of ['.skill-tree-toolbar > .combo', '.badge-category-select > .combo', '.combo-native']) assert.ok(style.includes(want), want);
    assert.ok(classic.includes(':is(#skills-panel, #achieve-panel, #make-panel, #map-panel) :is(input[type="search"], input[type="text"], select, .combo-input)'));
    assert.match(read('public/js/features/auctions-feature.js'), /\.auc-tools :is\(select, \.combo-input\)/);
    assert.match(read('public/js/features/street-jobs-feature.js'), /\.sj-hall :is\(select,\s*\.combo-input\)/);
    assert.match(read('public/js/sound-test.js'), /\.sound-test \.combo/);
  });
});
