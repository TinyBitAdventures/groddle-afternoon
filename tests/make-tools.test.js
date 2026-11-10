/**
 * Report #175: the Make window opens on the tools, grouped by kind, with a way back from a tool and a
 * search that looks in every tool from the first screen and in the one tool from its own.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAKE_TOOL_GROUPS,
  NEEDED_TOOL_GROUP,
  OTHER_TOOL_GROUP,
  groupMakingTools,
  makeToolGroupId,
  makeToolCounts,
  makeToolCountLine,
  makeToolSpokenLine,
  makeOpeningTool,
  gridStep,
} from '../public/js/make-tools.js?v=3e4818c0';
import { TOOL_CATALOG, MAKING_TOOL_SKILLS, listMakingTools, loadRecipeCatalogFromFile } from '../public/js/making.js?v=4e72bb4b';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
await loadRecipeCatalogFromFile(join(root, 'public/assets/content/recipes.json'));

describe('the tools, grouped by kind', () => {
  it('every making tool is in exactly one named group, and every named tool is real', () => {
    const named = MAKE_TOOL_GROUPS.flatMap((g) => g.tools);
    assert.equal(new Set(named).size, named.length, 'no tool twice');
    for (const id of named) assert.ok(TOOL_CATALOG[id], id);
    for (const t of listMakingTools()) assert.notEqual(makeToolGroupId(t.classTsid), OTHER_TOOL_GROUP.id, `${t.classTsid} has no group`);
    assert.ok(listMakingTools().length >= 30);
  });

  it('the cooking tools are Food or Drinks, and the transmogrifiers share a group', () => {
    for (const [id, row] of Object.entries(MAKING_TOOL_SKILLS)) {
      if (row.makingType === 'cooking') assert.ok(['food', 'drinks'].includes(makeToolGroupId(id)), id);
      if (row.makingType === 'transmogrification') assert.equal(makeToolGroupId(id), 'changing', id);
    }
    assert.equal(makeToolGroupId('blender'), 'drinks');
    assert.equal(makeToolGroupId('smelter'), 'mining');
    assert.equal(makeToolGroupId('test_tube'), 'alchemy');
    assert.equal(makeToolGroupId('construction_tool'), 'building');
  });

  it('with every tool: the kinds in order, each tool once, nothing left over', () => {
    const groups = groupMakingTools(listMakingTools(), () => true);
    assert.deepEqual(groups.map((g) => g.id), ['food', 'drinks', 'changing', 'mining', 'alchemy', 'building', 'fiber']);
    assert.equal(groups.flatMap((g) => g.tools).length, listMakingTools().length);
    assert.ok(groups.every((g) => g.tools.every((t) => t.owned)));
    assert.deepEqual(groups[0].tools.map((t) => t.classTsid), ['knife_and_board', 'frying_pan', 'saucepan', 'mike_tyson_grill', 'awesome_pot']);
  });

  it('the tools you have lead, by kind; the ones you lack come last, together, in the same kind order', () => {
    const have = new Set(['frying_pan', 'blender', 'smelter']);
    const groups = groupMakingTools(listMakingTools(), (id) => have.has(id));
    assert.deepEqual(groups.map((g) => g.id), ['food', 'drinks', 'mining', NEEDED_TOOL_GROUP.id]);
    assert.deepEqual(groups[0].tools.map((t) => t.classTsid), ['frying_pan']);
    const needed = groups.at(-1);
    assert.equal(needed.label, "Tools you don't have yet");
    assert.ok(needed.tools.every((t) => !t.owned));
    assert.equal(needed.tools.length, listMakingTools().length - 3);
    assert.deepEqual(needed.tools.slice(0, 4).map((t) => t.classTsid), ['knife_and_board', 'saucepan', 'mike_tyson_grill', 'awesome_pot']);
    // Only the tools the old tabs showed: the ones with a recipe.
    assert.ok(!groups.flatMap((g) => g.tools).some((t) => t.classTsid === 'pick'));
  });

  it('with no tools at all there is one group, and a tool nobody grouped still shows', () => {
    const none = groupMakingTools(listMakingTools(), () => false);
    assert.deepEqual(none.map((g) => g.id), [NEEDED_TOOL_GROUP.id]);
    const odd = groupMakingTools([{ classTsid: 'frying_pan', label: 'Frying Pan' }, { classTsid: 'new_gadget', label: 'New Gadget' }], () => true);
    assert.deepEqual(odd.map((g) => g.id), ['food', OTHER_TOOL_GROUP.id]);
    assert.deepEqual(groupMakingTools(null), []);
  });

  it('counts each tool\'s recipes and the ones that can be made now', () => {
    const recipes = [{ tool: 'frying_pan', ok: true }, { tool: 'frying_pan', ok: false }, { tool: 'blender', ok: false }];
    const counts = makeToolCounts(recipes, (r) => r.ok);
    assert.deepEqual(counts, { frying_pan: { total: 2, ready: 1 }, blender: { total: 1, ready: 0 } });
    assert.equal(makeToolCountLine(counts.frying_pan), '1 of 2 ready');
    assert.equal(makeToolCountLine(counts.blender), '1 recipe');
    assert.equal(makeToolCountLine({ total: 26, ready: 0 }), '26 recipes');
    assert.equal(makeToolCountLine(undefined), '0 recipes');
    assert.equal(makeToolSpokenLine('Frying Pan', counts.frying_pan, true), 'Frying Pan. 2 recipes, 1 you can make now.');
    assert.equal(makeToolSpokenLine('Egg Seasoner', { total: 3, ready: 0 }, false), 'Egg Seasoner. 3 recipes. You need an Egg Seasoner.');
  });
});

describe('which screen Make opens on (Austin 2026-11-10)', () => {
  const have = (...ids) => (id) => ids.includes(id);
  const known = (id) => Boolean(TOOL_CATALOG[id]);

  it('the first open of a session shows the tools', () => {
    assert.equal(makeOpeningTool({ known, usable: have('frying_pan') }), null);
    assert.equal(makeOpeningTool(), null);
  });

  it('after that N opens the tool used last, while the player still has it', () => {
    assert.equal(makeOpeningTool({ lastTool: 'frying_pan', known, usable: have('frying_pan') }), 'frying_pan');
    assert.equal(makeOpeningTool({ lastTool: 'frying_pan', known, usable: have('blender') }), null, 'sold or dropped: the tools');
    assert.equal(makeOpeningTool({ lastTool: 'cauldron', known, usable: have('frying_pan') }), null, 'a tool only read about: the tools');
    assert.equal(makeOpeningTool({ lastTool: 'no_such_tool', known, usable: () => true }), null);
  });

  it('a machine in the world and a pack card open their own tool, whatever was last', () => {
    assert.equal(makeOpeningTool({ stationTool: 'woodworker', lastTool: 'frying_pan', known, usable: have('frying_pan') }), 'woodworker', 'a machine needs no copy in the pack');
    assert.equal(makeOpeningTool({ askedTool: 'blender', lastTool: 'frying_pan', known, usable: have('frying_pan', 'blender') }), 'blender');
    assert.equal(makeOpeningTool({ askedTool: 'no_such_tool', lastTool: 'frying_pan', known, usable: have('frying_pan') }), 'frying_pan', 'an unknown tool falls back to the rule');
  });

  it('the last tool is kept in memory only: a tool button, the pack and a machine set it, nothing saves it', () => {
    const game = read('public/game.js');
    assert.match(game, /\nlet makeLastTool = null;\n/);
    const tool = game.slice(game.indexOf('function openMakeTool('), game.indexOf('function showMakeTools('));
    assert.match(tool, /makeToolFilter = toolId;\s*makeLastTool = toolId;/);
    assert.equal(game.split('makeLastTool').length - 1, 4, 'declared, set twice, read once (and named in no save)');
    const back = game.slice(game.indexOf('function showMakeTools('), game.indexOf('function makeStepBack('));
    assert.doesNotMatch(back, /makeLastTool/, 'Tools shows the tools without forgetting the tool');
  });
});

describe('the arrow keys over the buttons', () => {
  // Two groups of two columns, with a heading between: rows at y 0, 50 (one button), then 120, 170.
  const box = (left, top) => ({ left, top, width: 100, height: 40 });
  const rects = [box(0, 0), box(110, 0), box(0, 50), box(0, 120), box(110, 120), box(0, 170), box(110, 170)];

  it('Left and Right step in order and stop at the ends', () => {
    assert.equal(gridStep(rects, 0, 'ArrowRight'), 1);
    assert.equal(gridStep(rects, 1, 'ArrowRight'), 2, 'on to the next row');
    assert.equal(gridStep(rects, 0, 'ArrowLeft'), 0);
    assert.equal(gridStep(rects, 6, 'ArrowRight'), 6);
    assert.equal(gridStep(rects, 3, 'Home'), 0);
    assert.equal(gridStep(rects, 3, 'End'), 6);
  });

  it('Up and Down keep the column, across a short row and a group heading', () => {
    assert.equal(gridStep(rects, 0, 'ArrowDown'), 2);
    assert.equal(gridStep(rects, 1, 'ArrowDown'), 2, 'the short row has only the left one');
    assert.equal(gridStep(rects, 2, 'ArrowDown'), 3, 'over the heading');
    assert.equal(gridStep(rects, 4, 'ArrowDown'), 6);
    assert.equal(gridStep(rects, 6, 'ArrowUp'), 4);
    assert.equal(gridStep(rects, 4, 'ArrowUp'), 2);
    assert.equal(gridStep(rects, 0, 'ArrowUp'), 0, 'the top row stays');
    assert.equal(gridStep(rects, 5, 'ArrowDown'), 5, 'the bottom row stays');
  });

  it('three columns (the recipe tiles) and odd input', () => {
    const three = [0, 1, 2, 3, 4].map((i) => ({ left: (i % 3) * 110, top: Math.floor(i / 3) * 90, width: 100, height: 80 }));
    assert.equal(gridStep(three, 1, 'ArrowDown'), 4);
    assert.equal(gridStep(three, 2, 'ArrowDown'), 4, 'the nearest in a shorter row');
    assert.equal(gridStep(three, 4, 'ArrowUp'), 1);
    assert.equal(gridStep([], 0, 'ArrowDown'), 0);
    assert.equal(gridStep(three, 9, 'ArrowDown'), 9);
    assert.equal(gridStep(three, 1, 'Enter'), 1);
  });
});

describe('the window: tools first, a tool\'s screen with a way back, two searches', () => {
  const game = read('public/game.js');
  const page = read('public/play/index.html');
  const style = read('public/style.css');
  const classic = read('public/css/classic.css');
  const body = game.slice(game.indexOf('function renderMakePanel()'), game.indexOf('function openMakePanel('));
  const open = game.slice(game.indexOf('function openMakePanel('), game.indexOf('function closeMakePanel('));

  it('the page has the tools screen and the way back, and no tool strip', () => {
    assert.match(page, /<div id="make-tools" class="make-tools" aria-label="Tools" hidden><\/div>/);
    assert.match(page, /<div id="make-nav" class="make-nav">\s*<button type="button" id="make-tools-back" class="make-tools-back"[^>]* hidden>/);
    assert.match(page, /<\/button>\s*<p id="make-title" class="make-question">/, 'the question sits with the way back');
    assert.doesNotMatch(page, /make-tool-tabs/);
    // The tools sit in the part that scrolls, under the header (tests/sheet-header-fixed.test.js).
    assert.ok(page.indexOf('id="make-tools"') > page.indexOf('class="ui-sheet-body make-body"'));
    assert.equal(read('public/play/online/index.html').includes('id="make-tools-back"'), true, 'the online page too');
  });

  it('N and the Make button open on the last tool or the tools; a machine or the pack opens a tool', () => {
    assert.match(open, /const openTool = makeOpeningTool\(\{\s*stationTool: makeStation\?\.tool,\s*askedTool: tool,\s*lastTool: makeLastTool,\s*known: \(id\) => Boolean\(TOOL_CATALOG\[id\]\),\s*usable: \(id\) => hasTool\(inv, id\),\s*\}\);/);
    assert.match(open, /if \(openTool\) \{\s*makeToolFilter = openTool;\s*makeLastTool = openTool;\s*\}/, 'a tool opened from the pack or a machine is the last used');
    assert.match(open, /makeView = openTool \? 'tool' : 'tools';/);
    assert.match(open, /makeSearchQuery = '';/);
    assert.match(game, /if \(isPlainKey\(e, 'n'\)\) openMakePanel\(\);/);
    assert.match(game, /openMakeStation: \(station\) => openMakePanel\(station\),/);
    assert.match(game, /openMakePanel\(null, \{ tool: slot\.isTool \? classTsid : recipeTarget\.tool \}\);/);
  });

  it('the first screen draws the tools and no recipes; a search or a tool draws recipes', () => {
    assert.match(body, /const showTools = !inTool && !query && !makeSelected;/);
    assert.match(body, /toolsEl\.hidden = !showTools;/);
    assert.match(body, /renderMakeTools\(toolsEl, searchRecipes\('', \{ tool: 'all', \.\.\.known \}\), canMakeNow\)/);
    assert.match(body, /panel\.dataset\.makeView = inTool \? 'tool' : query \? 'search' : 'tools';/);
    assert.match(body, /backEl\.hidden = !inTool;/);
  });

  it('the search stays in the open tool, and looks in every tool from the first screen', () => {
    assert.match(body, /searchRecipes\(makeSearchQuery, \{ tool: inTool \? makeToolFilter : 'all', \.\.\.known \}\)/);
    assert.match(body, /const hint = inTool \? `Find in \$\{toolLabel\}` : 'Find a recipe or ingredient';/);
    assert.match(body, /data-make-search-all>Look in every tool<\/button>/);
    assert.match(body, /showMakeTools\(event, \{ keepSearch: true \}\)/);
    // A search over every tool names the tool on each recipe.
    assert.match(body, /const withTool = inTool \? '' : TOOL_CATALOG\[recipe\.tool\]\?\.label \|\| '';/);
  });

  it('a tool button opens its screen; Back returns to the tools where they were', () => {
    const tool = game.slice(game.indexOf('function openMakeTool('), game.indexOf('function showMakeTools('));
    assert.match(tool, /makeToolsScroll = makeScroller\(\)\?\.scrollTop \|\| 0;\s*makeView = 'tool';\s*makeToolFilter = toolId;\s*makeLastTool = toolId;\s*makeSearchQuery = '';/);
    const back = game.slice(game.indexOf('function showMakeTools('), game.indexOf('function makeStepBack('));
    assert.match(back, /makeView = 'tools';/);
    assert.match(back, /setMakeScroll\(keepSearch \? 0 : makeToolsScroll\);/);
    assert.match(game, /getElementById\('make-tools-back'\)\?\.addEventListener\('click', \(event\) => showMakeTools\(event\)\);/);
    assert.match(game, /btn\.addEventListener\('click', \(event\) => openMakeTool\(t\.classTsid, event\)\);/);
  });

  it('keys: the arrows move over the buttons once one has focus, Backspace steps back, typing is left alone', () => {
    assert.match(game, /const handled = arrow \? makeGridKey\(event\) : event\.key === 'Backspace' && !typing && !event\.repeat \? makeStepBack\(\) : false;/);
    assert.match(game, /if \(!handled\) return;\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
    const grid = game.slice(game.indexOf('function makeGridKey('), game.indexOf('function renderMakeTools('));
    assert.match(grid, /closest\?\.\('\.make-tool-tile, \.make-tile'\)/);
    assert.match(grid, /if \(!tile\) return false;/, 'the arrows walk when no button has focus');
    // Focus only follows a key: a mouse click leaves the keys with the world.
    assert.match(game, /function makeKeyFocus\(event, selector\) \{\s*if \(!event \|\| event\.detail !== 0\) return;/);
  });

  it('nothing about making changed: the recipe view, Make and the work are the same calls', () => {
    assert.match(body, /detail\.querySelector\('\[data-make-go\]'\)\?\.addEventListener\('click', \(\) => \{\s*runMakeCraft\(key, makeQty\);/);
    assert.match(body, /<button type="button" class="btn-glitch-back" data-make-back>← Back<\/button>/);
    assert.match(body, /tile\.className = 'make-tile'/);
    assert.match(body, /<span class="tile-label">\$\{recipe\.name\}<\/span>/);
  });

  it('both skins style the tools; the way back steps aside for a recipe, the work and its result', () => {
    assert.match(style, /\n\.make-tool-grid \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(150px, 1fr\)\);/);
    assert.match(style, /\[data-ui="modern"\] #make-panel \.make-tool-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    assert.match(style, /\.make-tools\[hidden\],\n\.make-tools-back\[hidden\] \{ display: none; \}/);
    assert.match(style, /\.make-card:has\(#make-detail:not\(\[hidden\]\), #make-progress:not\(\[hidden\]\), #make-result:not\(\[hidden\]\)\) \.make-tools-back \{ display: none; \}/);
    assert.match(classic, /#make-panel \.make-nav \{ flex-direction: row;/, 'Classic: the way back beside the question');
    assert.match(style, /\[data-ui="modern"\] #make-panel \.make-tool-tile:focus-visible,/);
    assert.match(classic, /#make-panel \.make-tool-tile \{ min-height: calc\(46 \* var\(--cu\)\);/);
    assert.match(classic, /\.badge-load-more, \.make-tools-back\) \{/);
    for (const css of [style, classic]) assert.doesNotMatch(css, /make-tool-chip|make-tool-tabs/);
  });

  it('Classic: in a low window the body gives way so the footer stays whole, as the original\'s did', () => {
    // On main at 1280 x 720 a tool's screen came to 79 + 105 + 235 + 75 px in a window that holds 470:
    // the foot hung 24 px out of the bottom edge. The body's floor now follows the game's height.
    const sel = ':root[data-ui="classic"] #game-root #make-panel > .make-card:not(:has(#make-result:not([hidden]), #make-detail:not([hidden]))) > .ui-sheet-body';
    const at = classic.indexOf(`\n${sel} {`);
    assert.ok(at > 0, 'the rule for the screens with the Tools row and the search');
    assert.match(classic.slice(at, classic.indexOf('}', at)), /\{\n  min-height: min\(calc\(200 \* var\(--cu\)\), calc\(var\(--cvh\) - 280 \* var\(--cu\)\)\);\n$/);
    // It comes after the shared 200 (same specificity would not do: this one names the card too), and
    // a recipe and a result, which hide those rows, keep the shared rule.
    const shared = classic.indexOf(':is(#quest-panel, #projects-panel, #make-panel) .ui-sheet-body { flex: 1 1 auto; min-height: calc(200 * var(--cu));');
    assert.ok(shared > 0 && shared < at);
    assert.match(classic, /#make-panel \.make-card:has\(#make-result:not\(\[hidden\]\), #make-detail:not\(\[hidden\]\)\) :is\(\.make-search-row, \.make-nav, \.make-question\) \{ display: none; \}/);
    // The foot never shrinks and the window still clips at the game's height.
    assert.match(classic, /> :is\(\.side-card, \.make-card\) > \.ui-sheet-foot \{\n  flex: none;/);
    // The numbers: the window's two 20 margins, the head, the rows, the foot, and 20 to spare.
    assert.equal(20 + 20 + 67 + 89 + 64 + 20, 280);
    // Modern is untouched: every selector here is Classic's.
    assert.doesNotMatch(style, /cvh/);
    // The original: a fixed head, body and foot, the body scrolling inside.
    const src = join(root, '../glitch-client/com/tinyspeck/engine/port/MakingDialog.as');
    if (existsSync(src)) {
      const as = readFileSync(src, 'utf8');
      assert.match(as, /_head_min_h = 67;\s+_body_min_h = 320;\s+_foot_min_h = 64;/);
      assert.match(as, /_h = _head_h \+ _body_h \+ _foot_h;/);
    }
  });
});
