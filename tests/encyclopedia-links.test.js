/**
 * ENCYC (Austin 2026-11-05): the in-game way into the Encyclopedia (js/encyclopedia-links.js).
 * The `i` key opens it on the thing you look at (the client's I started Info mode, TSMainView.as
 * iKeyHandler 870-891, whose item cards linked to the Encyclopedia, GetInfoDialog.as 142-163);
 * Menu > World > Encyclopedia and the player menu (PlayerInfoButtons.as 43) open its home page;
 * the pack's item card and the Skills and Quests sheets link to the page where there is one;
 * Gentle Island's Encyclopeddling card says its line (newbie_island.js upgradeConfirmed 276-278).
 * Pages come from the encyclopedia's own index (encyclopedia/search.json), never from a slug rule.
 * Run: node --test tests/encyclopedia-links.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENCYCLOPEDIA_HOME,
  ENCYCLOPEDIA_INDEX,
  ENCYCLOPEDIA_WINDOW,
  buildEncyclopediaIndex,
  classPageKeys,
  createEncyclopedia,
  encyclopediaHref,
  encyclopediaPage,
  encyclopediaSearchHref,
  isEncyclopediaKey,
} from '../public/js/encyclopedia-links.js?v=eebc2a5d';
import { GIANTS } from '../public/js/shrines.js?v=ec26da05';
import { VENDOR_PROFILES } from '../public/js/vendor.js?v=fd4bd725';
import { CLIENT_KEY_TABLE, clientKeyAction } from '../public/js/client-hotkeys.js?v=31d1891d';
import { MENU_ROWS } from '../public/js/ui/topbar.js?v=40469965';
import { questCardMenuRows } from '../public/js/ui/quest-sheet.js?v=c5465bbe';
import { ISLAND_CONFIRM, ISLAND_LINES } from '../public/js/newxp.js?v=45ae5f37';

const here = dirname(fileURLToPath(import.meta.url));
const PUB = join(here, '../public');
const read = (p) => readFileSync(join(PUB, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const SEARCH = json(ENCYCLOPEDIA_INDEX);
const index = buildEncyclopediaIndex(SEARCH);
/** A page's address (relative to the game root, as search.json gives it) is a built page. */
const built = (h) => existsSync(join(PUB, h.replace(/[?#].*$/, ''), 'index.html'));
const key = (k, mods = {}) => ({ key: k, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...mods });

describe('ENCYC: pages from the encyclopedia\'s own index', () => {
  it('reads every page of search.json, and every address is a built page', () => {
    assert.ok(SEARCH.entries.length > 2000);
    assert.equal(index.pages.size, SEARCH.entries.length, 'one page per section and id');
    for (const s of ['items', 'quests', 'animals', 'people', 'skills', 'places']) assert.ok(index.sections.includes(s), s);
    for (const h of index.pages.values()) assert.ok(built(h), h);
    assert.ok(built(ENCYCLOPEDIA_HOME), 'the home page');
  });

  it('finds things by class id in the encyclopedia\'s order: animal, person, item', () => {
    assert.equal(encyclopediaPage(index, { id: 'npc_piggy' }), 'encyclopedia/animals/npc_piggy/');
    assert.equal(encyclopediaPage(index, { id: 'apple' }), 'encyclopedia/items/apple/');
    assert.equal(encyclopediaPage(index, { id: 'trant_fruit' }), index.pages.get('items:trant_fruit'));
    assert.deepEqual(classPageKeys('bag_butler').slice(0, 2), ['animals:bag_butler', 'people:bag_butler']);
    assert.equal(encyclopediaPage(index, { id: 'bag_butler' }), index.pages.get('people:bag_butler'), 'a person before its item page');
    assert.equal(encyclopediaPage(index, { id: 'no_such_thing' }), '');
    assert.equal(encyclopediaPage(null, { id: 'apple' }), '', 'no index, no page');
  });

  it('every shrine and every Street Spirit in the world has its page', () => {
    // game.js spawns a shrine as npc_shrine_<giant> and a vendor as its street_spirit_* id.
    for (const g of Object.keys(GIANTS)) assert.ok(built(encyclopediaPage(index, { id: `npc_shrine_${g}` })), g);
    // The regional shrines fold into their Giant's (tools/encyclopedia/data.mjs keyOf).
    assert.equal(encyclopediaPage(index, { id: 'npc_shrine_uralia_tii' }), index.pages.get('people:npc_shrine_ti'));
    for (const p of Object.values(VENDOR_PROFILES)) assert.equal(encyclopediaPage(index, { id: p.id }), index.pages.get('people:street_spirit'), p.id);
  });

  it('skills and quests by id; each skill of the remake but one has a page', () => {
    const skills = Object.keys(json('assets/content/skills.json'));
    const missing = skills.filter((id) => !encyclopediaPage(index, { section: 'skills', id }));
    assert.ok(missing.length <= 1, missing.join(' '));
    assert.equal(encyclopediaPage(index, { section: 'skills', id: 'alchemy_1' }), 'encyclopedia/skills/alchemy_1/');
    const quests = Object.keys(json('assets/content/quests.json'));
    const withPage = quests.filter((id) => encyclopediaPage(index, { section: 'quests', id }));
    assert.equal(withPage.length, SEARCH.entries.filter((e) => e.s === 'quests').length, 'every quest page is a quest of the remake');
    assert.equal(encyclopediaPage(index, { section: 'quests', id: 'chris_test' }), '', 'a test quest has none');
  });

  it('a street\'s region by its name on the map (every hub that has a page)', () => {
    const hubDir = join(PUB, 'assets/maps/hubs');
    const hubs = readdirSync(hubDir).filter((f) => /^hub-\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(hubDir, f), 'utf8')));
    let found = 0;
    for (const hub of hubs) {
      const h = encyclopediaPage(index, { section: 'places', name: hub.hubName, hubId: String(hub.hubId) });
      if (!h) continue;
      found += 1;
      assert.ok(built(h), hub.hubName);
    }
    assert.equal(found, SEARCH.entries.filter((e) => e.s === 'places').length, 'every region page is reached from its hub');
    assert.equal(encyclopediaPage(index, { section: 'places', name: 'Groddle Forest', hubId: '56' }), 'encyclopedia/places/groddle-forest/');
    // Two regions of one name: the page named with its hub id.
    const twin = buildEncyclopediaIndex({ entries: [
      { s: 'places', id: 'kajuu', n: 'Kajuu', h: 'encyclopedia/places/kajuu/' },
      { s: 'places', id: 'kajuu-140', n: 'Kajuu', h: 'encyclopedia/places/kajuu-140/' },
    ] });
    assert.equal(encyclopediaPage(twin, { section: 'places', name: 'Kajuu', hubId: '140' }), 'encyclopedia/places/kajuu-140/');
  });

  it('no page: the home page\'s search for the name (and section); nothing at all: the home page', () => {
    assert.equal(encyclopediaHref(index, { id: 'garden_new', name: 'Garden' }), 'encyclopedia/?q=Garden');
    assert.equal(encyclopediaHref(index, { section: 'quests', id: 'chris_test', name: 'Chris Test' }), 'encyclopedia/?q=Chris+Test&s=quests');
    assert.equal(encyclopediaSearchHref('Bean Tree', 'nope', index), 'encyclopedia/?q=Bean+Tree', 'only a real section filters');
    assert.equal(encyclopediaHref(index, null), ENCYCLOPEDIA_HOME);
    assert.equal(encyclopediaHref(index, { id: 'garden_new' }), ENCYCLOPEDIA_HOME, 'no name either');
    assert.equal(encyclopediaHref(null, { id: 'apple', name: 'Apple' }), 'encyclopedia/?q=Apple', 'before the index is in');
    // The home page reads ?q= and ?s= (encyclopedia.js).
    const js = read('encyclopedia/encyclopedia.js');
    assert.match(js, /params\.get\('q'\)/);
    assert.match(js, /params\.get\('s'\)|p\.set\('s'/);
  });
});

describe('ENCYC: the Encyclopedia window', () => {
  const resolve = (h) => new URL(h, 'https://groddle.localhost/').href;

  it('opens the page at once in the one Encyclopedia window once the index is in', async () => {
    const opened = [];
    const ency = createEncyclopedia({ fetchJson: async () => SEARCH, openWindow: (url, name) => { opened.push([url, name]); return { focus() {} }; }, resolve });
    assert.equal(ency.ready, false);
    await ency.load();
    assert.equal(ency.ready, true);
    assert.equal(ency.open({ id: 'apple', name: 'Apple' }), 'https://groddle.localhost/encyclopedia/items/apple/');
    assert.equal(ency.open(null), 'https://groddle.localhost/encyclopedia/');
    assert.deepEqual(opened.map(([, name]) => name), [ENCYCLOPEDIA_WINDOW, ENCYCLOPEDIA_WINDOW]);
    assert.equal(ENCYCLOPEDIA_WINDOW, 'encyclopedia', "TSFrontController.as 4398's window name");
  });

  it('before the index: an empty window now (no pop-up blocker), then the page', async () => {
    const opened = [];
    const win = { closed: false, location: { href: '' }, focus() {} };
    let release;
    const ency = createEncyclopedia({ fetchJson: () => new Promise((done) => { release = () => done(SEARCH); }), openWindow: (url, name) => { opened.push([url, name]); return win; }, resolve });
    const went = ency.open({ section: 'skills', id: 'alchemy_1', name: 'Alchemy I' });
    assert.deepEqual(opened, [['', ENCYCLOPEDIA_WINDOW]], 'opened inside the key press');
    while (!release) await new Promise((done) => setTimeout(done, 0));
    release();
    assert.equal(await went, 'https://groddle.localhost/encyclopedia/skills/alchemy_1/');
    assert.equal(win.location.href, 'https://groddle.localhost/encyclopedia/skills/alchemy_1/');
  });

  it('an index that fails or is slow: the search for the name', async () => {
    const win = { closed: false, location: { href: '' }, focus() {} };
    const failing = createEncyclopedia({ fetchJson: async () => { throw new Error('offline'); }, openWindow: () => win, resolve });
    assert.equal(await failing.open({ id: 'apple', name: 'Apple' }), 'https://groddle.localhost/encyclopedia/?q=Apple');
    assert.equal(failing.ready, false);
    const slow = createEncyclopedia({ fetchJson: () => new Promise(() => {}), openWindow: () => win, resolve, wait: 10 });
    assert.equal(await slow.open({ section: 'places', name: 'Groddle Forest' }), 'https://groddle.localhost/encyclopedia/?q=Groddle+Forest&s=places');
  });

  it('links only where there is a page, in both forms', async () => {
    const ency = createEncyclopedia({ fetchJson: async () => SEARCH, resolve });
    assert.equal(ency.linkMarkup({ id: 'apple' }), '', 'not before the index');
    await ency.load();
    const markup = ency.linkMarkup({ id: 'apple' }, 'pack-pop-ency');
    assert.equal(markup, '<a class="ency-link pack-pop-ency" href="https://groddle.localhost/encyclopedia/items/apple/" target="encyclopedia" title="Opens in a new tab" data-encyclopedia="encyclopedia/items/apple/">In the Encyclopedia</a>');
    assert.equal(ency.linkMarkup({ id: 'garden_new' }), '');
    const made = [];
    const doc = { createElement: (tag) => { const el = { tag, dataset: {} }; made.push(el); return el; } };
    const a = ency.link(doc, { section: 'quests', id: 'alchemy_make_compounds' }, 'q-ency');
    assert.equal(a.tag, 'a');
    assert.equal(a.className, 'ency-link q-ency');
    assert.equal(a.href, 'https://groddle.localhost/encyclopedia/quests/alchemy_make_compounds/');
    assert.equal(a.target, 'encyclopedia');
    assert.equal(a.textContent, 'In the Encyclopedia');
    assert.equal(ency.link(doc, { section: 'quests', id: 'chris_test' }), null);
    assert.doesNotMatch(read('js/encyclopedia-links.js'), /—/, 'no em-dashes');
  });
});

describe('ENCYC: the i key', () => {
  it('a plain i, either case; never with Shift, Ctrl, Alt or Cmd', () => {
    assert.equal(isEncyclopediaKey(key('i')), true);
    assert.equal(isEncyclopediaKey(key('I')), true, 'caps lock');
    for (const mod of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) assert.equal(isEncyclopediaKey(key('i', { [mod]: true })), false, mod);
    assert.equal(clientKeyAction(key('i')), 'encyclopedia');
    assert.equal(CLIENT_KEY_TABLE.find((r) => r.key === 'I').action, 'encyclopedia');
  });

  const game = read('game.js');
  const start = game.indexOf("window.addEventListener('keydown', (e) => {\n    if (e.target?.matches?.('input, textarea, select, [contenteditable=\"true\"]')) {");
  const handler = game.slice(start, game.indexOf("window.addEventListener('keyup'", start));

  it('after the typing guard (chat, search boxes, any field) and before every menu takes the keys', () => {
    const at = handler.indexOf('if (encyclopediaKey(e)) return;');
    assert.ok(start > 0 && at > 0);
    assert.ok(at > handler.indexOf("if (e.target?.matches?.('input, textarea, select, [contenteditable=\"true\"]')) {"), 'typing goes to the field');
    assert.ok(at > handler.indexOf('if (!state.started) return;'));
    for (const later of ['if (isPackPopoverOpen() && verbMenuKey(', 'if (isMapOpen()) {', '// Verb menu open: let Enter activate the focused choice', 'if (clientShortcutKey(e)) return;']) {
      assert.ok(handler.indexOf(later) > at, later);
    }
    // No other key handler in the game answers a plain i (it was free: the client's I had no panel here).
    for (const dir of ['js', 'js/features', 'js/ui', 'js/classic']) {
      for (const f of readdirSync(join(PUB, dir)).filter((n) => n.endsWith('.js'))) {
        const src = read(`${dir}/${f}`);
        assert.doesNotMatch(src, /e\.key === 'i'|isPlainKey\(e, 'i'\)|code === 'KeyI'/, `${dir}/${f}`);
      }
    }
  });

  it('quiet where the client\'s I was: the tutorial without its imagination menu, decorate, cultivate, the look builder', () => {
    const fn = game.slice(game.indexOf('function encyclopediaKey(e) {'), game.indexOf('function encyclopediaKey(e) {') + 600);
    assert.match(fn, /nx-hide-actions/);
    assert.match(fn, /features\.query\('homeEditMode', engine\)/);
    assert.match(fn, /isAvatarOpen\(\)/);
    assert.match(fn, /if \(!e\.repeat\) openEncyclopedia\(encyclopediaSubject\(\)\);/);
    // newxp hides the top actions (the imagination menu) in the clouds, the training rooms and the house.
    assert.match(read('js/features/newxp-feature.js'), /b\.toggle\('nx-hide-actions', Boolean\(parts\.actions\)\);/);
  });

  it('the subject: the open card or verb menu, then the pointer, then the street\'s region', () => {
    const fn = game.slice(game.indexOf('function encyclopediaSubject() {'), game.indexOf('/** ENCYC: open the Encyclopedia'));
    const order = ["isPackPopoverOpen()", 'if (menuTarget) {', ".pack-slot[data-tsid]:hover", 'hoverTarget?.sprite', 'document.activeElement', "section: 'places', name: hubName"];
    let last = -1;
    for (const bit of order) {
      const at = fn.indexOf(bit);
      assert.ok(at > last, bit);
      last = at;
    }
    assert.match(game, /const id = t\.classId === 'dropped_item' \? t\.state\?\.classTsid : t\.classId;/, 'a dropped stack is its item');
  });
});

describe('ENCYC: the Menu, the player menu, the item card and the sheets', () => {
  const game = read('game.js');

  it('Menu > World > Encyclopedia, on both play pages, with I on its cap', () => {
    for (const page of ['play/index.html', 'play/online/index.html']) {
      const html = read(page);
      const world = html.slice(html.indexOf('data-menu-group="world"'), html.indexOf('data-menu-group="social"'));
      assert.match(world, /<button id="encyclopedia-btn" type="button" class="chrome-btn" title="Encyclopedia \(I\), opens in a new tab">Encyclopedia<\/button>/, page);
    }
    assert.deepEqual(MENU_ROWS['encyclopedia-btn'], { group: 'world', rank: 4, key: 'I' });
    assert.equal(Object.values(MENU_ROWS).filter((r) => r.key === 'I').length, 1);
    assert.match(game, /getElementById\('encyclopedia-btn'\)\?\.addEventListener\('click', \(\) => openEncyclopedia\(null\)\);/);
    // Classic shows the same Menu (css/classic.css restyles #more-list in place).
    assert.match(read('css/classic.css'), /:root\[data-ui="classic"\] \.top-bar #more-list/);
  });

  it('the player menu\'s Encyclopedia (PlayerInfoButtons.as 43), after Wardrobe', () => {
    assert.match(game, /\['Wardrobe', \(\) => openLookBuilderOn\('top'\)\],\n\s*\/\/[^\n]*\n\s*\[ENCYCLOPEDIA_MENU_LABEL, \(\) => openEncyclopedia\(null\)\],/);
  });

  it('the pack\'s item card, the Skills sheet and the quest cards draw the link where a page exists', () => {
    assert.match(game, /\$\{encyclopedia\.linkMarkup\(encyclopediaItemSubject\(classTsid\), 'pack-pop-ency'\)\}/);
    assert.match(game, /encyclopediaLink: \(id\) => encyclopedia\.link\(document, \{ section: 'skills', id \}, 'skill-ency'\)/);
    assert.match(read('js/skills-panel.js'), /const ency = ctx\.encyclopediaLink\?\.\(entry\.classTsid\);\n\s*if \(ency\) body\.appendChild\(ency\);/);
    assert.match(game, /const ency = encyclopedia\.link\(document, \{ section: 'quests', id: classTsid \}, 'q-ency'\);/);
    // Every kind of card: the log's (active and done), the ones put off, the story quests' offers.
    assert.match(game, /appendQuestEncyclopediaLink\(card, p\.def\.classTsid\);/);
    assert.match(game, /appendQuestEncyclopediaLink\(el, el\.dataset\.questPutOff\);/);
    assert.match(game, /card\.append\(title, desc, button\);\n\s*\/\/[^\n]*\n\s*appendQuestEncyclopediaLink\(card, classTsid\);/);
    // The index loads once the game runs, and the open sheets draw their links when it is in.
    assert.match(game, /setTimeout\(\(\) => encyclopedia\.load\(\), 3000\);/);
    assert.match(game, /const encyclopedia = createEncyclopedia\(\{\n\s*onReady: \(\) => \{\n\s*updateHud\(\);\n\s*if \(isSkillsOpen\(\)\) renderSkillsPanel\(\);/);
    // Both skins style it.
    assert.match(read('style.css'), /\.ency-link \{/);
    assert.match(read('css/classic.css'), /:root\[data-ui="classic"\] \.ency-link \{ color: var\(--c-classic-link\);/);
  });

  it('a quest card\'s menu ends with the link', () => {
    const link = { textContent: 'In the Encyclopedia', title: 'Opens in a new tab' };
    const card = { classList: { contains: () => true }, querySelector: (sel) => (sel === '.ency-link' ? link : null), querySelectorAll: () => [] };
    const rows = questCardMenuRows(card);
    assert.deepEqual(rows.at(-1), { id: 'encyclopedia', label: 'In the Encyclopedia', tip: 'Opens in a new tab', focusBack: false, el: link });
  });
});

describe('ENCYC: Gentle Island\'s Encyclopeddling card', () => {
  it('says its line after the card, as Mappery and Camera Mode do', () => {
    assert.equal(ISLAND_CONFIRM.encyclopeddling, 'encyclopeddling');
    assert.match(ISLAND_LINES.encyclopeddling, /press the "i" key at any time to tap directly into the great Encyclopedia/);
    const feature = read('js/features/newxp-feature.js');
    assert.match(feature, /const key = ISLAND_CONFIRM\[id\];\n\s*if \(!key\) return null;\n\s*await sleep\(t, 2000\);\n\s*await vog\(t, ISLAND_LINES\[key\]\);/);
  });
});
